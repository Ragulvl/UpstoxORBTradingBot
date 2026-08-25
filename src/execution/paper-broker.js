/**
 * PaperBroker — Virtual paper trading broker
 *
 * Drop-in replacement for UpstoxClient when PAPER_TRADING=true.
 * Simulates order fills at live market price. Zero real API calls.
 *
 * Mimics the exact same method signatures as UpstoxClient so
 * OrderManager, BotEngine, and PositionReconciler work unchanged.
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';

class PaperBroker extends EventEmitter {
  constructor(config, logger) {
    super();
    this.config = config;
    this.logger = logger;

    // Live price — updated by the bot via setSpotPrice()
    this._spotPrice = null;
    this._lastOptionPrice = {};   // instrumentKey → LTP

    // Virtual state
    this._orders = new Map();     // orderId → order
    this._positions = new Map();  // instrumentKey → position
    this._orderCounter = 0;
    this._virtualPnL = 0;

    this.logger.info('📄 PaperBroker initialized — PAPER TRADING MODE ACTIVE');
    this.logger.info('⚠️  No real orders will be placed. All fills are simulated at live LTP.');
  }

  // ─────────────────────────────────────────────
  // Price feed — called by run-live-bot.js on each tick
  // ─────────────────────────────────────────────
  setSpotPrice(price) {
    this._spotPrice = price;
  }

  setOptionPrice(instrumentKey, ltp) {
    this._lastOptionPrice[instrumentKey] = ltp;
  }

  _getFillPrice(orderParams) {
    // For options orders, use the last known LTP for that instrument
    const key = orderParams.instrument_token || orderParams.instrument_key;
    if (key && this._lastOptionPrice[key]) {
      return this._lastOptionPrice[key];
    }
    // For index orders, use spot price
    if (this._spotPrice) return this._spotPrice;
    // Fallback: use limit price from params
    return orderParams.price || orderParams.trigger_price || 0;
  }

  // ─────────────────────────────────────────────
  // ORDER PLACEMENT — simulates immediate fill
  // ─────────────────────────────────────────────
  async placeOrder(orderParams) {
    this._orderCounter++;
    const orderId = `PAPER-${Date.now()}-${this._orderCounter}`;
    const fillPrice = this._getFillPrice(orderParams);
    const qty = orderParams.quantity || 1;
    const side = (orderParams.transaction_type || '').toUpperCase();

    const order = {
      order_id: orderId,
      instrument_key: orderParams.instrument_token || orderParams.instrument_key,
      quantity: qty,
      transaction_type: side,
      fill_price: fillPrice,
      order_type: orderParams.order_type || 'MARKET',
      product: orderParams.product || 'I',
      status: 'complete',
      placed_at: new Date(),
      filled_at: new Date(),
      is_paper: true
    };

    this._orders.set(orderId, order);

    // Update virtual positions
    this._updatePosition(order);

    this.logger.info('📄 [PAPER] Order simulated', {
      orderId,
      side,
      instrument: order.instrument_key,
      qty,
      fillPrice: fillPrice.toFixed(2)
    });

    // Emit so any listeners can react
    this.emit('paper:order', order);

    return { data: { order_id: orderId, status: 'success' } };
  }

  async modifyOrder(orderId, modifications) {
    const order = this._orders.get(orderId);
    if (order) {
      Object.assign(order, modifications);
      this.logger.info('📄 [PAPER] Order modified', { orderId, modifications });
    }
    return { data: { order_id: orderId, status: 'success' } };
  }

  async cancelOrder(orderId) {
    const order = this._orders.get(orderId);
    if (order) {
      order.status = 'cancelled';
      this.logger.info('📄 [PAPER] Order cancelled', { orderId });
    }
    return { data: { order_id: orderId, status: 'success' } };
  }

  async getOrderStatus(orderId) {
    const order = this._orders.get(orderId);
    if (!order) throw new Error(`Paper order ${orderId} not found`);
    return {
      order_id: order.order_id,
      status: order.status,
      average_price: order.fill_price,
      filled_quantity: order.quantity,
      quantity: order.quantity,
      instrument_token: order.instrument_key
    };
  }

  // ─────────────────────────────────────────────
  // POSITIONS — returns virtual open positions
  // ─────────────────────────────────────────────
  async getPositions() {
    const positions = Array.from(this._positions.values())
      .filter(p => p.quantity !== 0)
      .map(p => {
        const ltp = this._lastOptionPrice[p.instrument_key] || p.average_price;
        const unrealised = (ltp - p.average_price) * p.quantity;
        return {
          instrument_token: p.instrument_key,
          instrument_key: p.instrument_key,
          quantity: p.quantity,
          average_price: p.average_price,
          last_price: ltp,
          unrealised_profit: unrealised,
          realised_profit: p.realised_pnl || 0,
          product: p.product || 'I',
          is_paper: true
        };
      });
    return { data: positions };
  }

  // ─────────────────────────────────────────────
  // PASS-THROUGH — market data always uses real API
  // (these are never called directly; UpstoxClient
  //  handles market data separately)
  // ─────────────────────────────────────────────
  async getHistoricalData(...args) {
    throw new Error('PaperBroker: getHistoricalData should go through real UpstoxClient');
  }

  async getOptionChain(...args) {
    throw new Error('PaperBroker: getOptionChain should go through real UpstoxClient');
  }

  // ─────────────────────────────────────────────
  // INTERNALS
  // ─────────────────────────────────────────────
  _updatePosition(order) {
    const key = order.instrument_key;
    if (!key) return;

    const existing = this._positions.get(key) || {
      instrument_key: key,
      quantity: 0,
      average_price: 0,
      cost_basis: 0,
      realised_pnl: 0,
      product: order.product
    };

    const isBuy  = order.transaction_type === 'BUY';
    const isSell = order.transaction_type === 'SELL';
    const qty    = order.quantity;
    const price  = order.fill_price;

    if (isBuy) {
      // Adding to position
      const totalCost = existing.cost_basis + (price * qty);
      const totalQty  = existing.quantity + qty;
      existing.average_price = totalQty > 0 ? totalCost / totalQty : price;
      existing.cost_basis    = totalCost;
      existing.quantity      = totalQty;

    } else if (isSell) {
      // Closing / reducing position
      const closedQty = Math.min(qty, Math.abs(existing.quantity));
      const realised  = (price - existing.average_price) * closedQty;
      existing.realised_pnl += realised;
      existing.quantity     -= closedQty;
      this._virtualPnL      += realised;

      if (existing.quantity === 0) {
        existing.cost_basis    = 0;
        existing.average_price = 0;
      }
    }

    this._positions.set(key, existing);
  }

  // ─────────────────────────────────────────────
  // STATS — for logging / dashboard
  // ─────────────────────────────────────────────
  getSummary() {
    return {
      mode: 'PAPER',
      totalOrders: this._orders.size,
      openPositions: Array.from(this._positions.values()).filter(p => p.quantity !== 0).length,
      virtualisedPnL: this._virtualPnL.toFixed(2)
    };
  }
}

export default PaperBroker;
