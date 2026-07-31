import { logger } from '../utils/logger.js';

/**
 * Cost Calculator - CRITICAL for Phase 2
 * 
 * Calculates real execution costs for Indian F&O options:
 * - Bid-ask spread impact
 * - Brokerage fees
 * - STT (Securities Transaction Tax)
 * - Exchange charges
 * - GST
 * - SEBI turnover fees
 * - Stamp duty
 * 
 * Returns both RAW P&L and COST-ADJUSTED P&L
 */
export class CostCalculator {
  constructor(config) {
    this.config = config;
    
    // Default Indian F&O cost structure (verify against broker)
    this.costs = {
      brokeragePerOrder: config.costs?.brokerage_per_order || 20, // ₹20 per order
      brokeragePercent: config.costs?.brokerage_percent || 0.0005, // 0.05% of premium
      sttRate: config.costs?.stt_rate || 0.000625, // 0.0625% on sell side
      exchangeRate: config.costs?.exchange_rate || 0.00053, // 0.053% of turnover
      sebiRate: config.costs?.sebi_rate || 0.0000001, // ₹10 per ₹1 crore
      gstRate: config.costs?.gst_rate || 0.18, // 18% on brokerage + exchange + SEBI
      stampDutyRate: config.costs?.stamp_duty_rate || 0.00003 // 0.003% on buy side
    };

    logger.info('Cost calculator initialized', this.costs);
  }

  /**
   * Calculate all costs for a complete trade (entry + exit)
   */
  calculateTradeCosts(trade) {
    const entry = trade.entry || {};
    const exit = trade.exit || {};

    // Entry costs
    const entryCosts = this.calculateOrderCosts({
      premium: entry.price || entry.premium,
      quantity: trade.quantity,
      side: 'BUY',
      spread: entry.spread || 0
    });

    // Exit costs
    const exitCosts = this.calculateOrderCosts({
      premium: exit.price || exit.premium,
      quantity: trade.quantity,
      side: 'SELL',
      spread: exit.spread || 0
    });

    // Total costs
    const totalCosts = {
      spreadCost: entryCosts.spreadCost + exitCosts.spreadCost,
      brokerage: entryCosts.brokerage + exitCosts.brokerage,
      stt: entryCosts.stt + exitCosts.stt,
      exchange: entryCosts.exchange + exitCosts.exchange,
      sebi: entryCosts.sebi + exitCosts.sebi,
      gst: entryCosts.gst + exitCosts.gst,
      stampDuty: entryCosts.stampDuty + exitCosts.stampDuty
    };

    totalCosts.total = Object.values(totalCosts).reduce((sum, cost) => sum + cost, 0);

    // Calculate raw P&L (before costs)
    const rawPnL = (exit.price - entry.price) * trade.quantity;

    // Calculate cost-adjusted P&L
    const adjustedPnL = rawPnL - totalCosts.total;

    // Cost as percentage of raw P&L
    const costPercent = rawPnL !== 0 ? (totalCosts.total / Math.abs(rawPnL)) * 100 : 0;

    const result = {
      trade: {
        id: trade.id,
        instrument: trade.instrument,
        quantity: trade.quantity,
        entryPrice: entry.price,
        exitPrice: exit.price
      },
      pnl: {
        raw: rawPnL,
        adjusted: adjustedPnL,
        difference: totalCosts.total
      },
      costs: {
        entry: entryCosts,
        exit: exitCosts,
        total: totalCosts,
        asPercentOfRaw: costPercent.toFixed(2),
        perUnit: (totalCosts.total / trade.quantity).toFixed(2)
      },
      verdict: this.getVerdict(rawPnL, adjustedPnL, costPercent)
    };

    logger.debug('Trade costs calculated', {
      tradeId: trade.id,
      rawPnL: rawPnL.toFixed(2),
      adjustedPnL: adjustedPnL.toFixed(2),
      totalCosts: totalCosts.total.toFixed(2),
      costPercent: result.costs.asPercentOfRaw
    });

    return result;
  }

  /**
   * Calculate costs for a single order (entry OR exit)
   */
  calculateOrderCosts(params) {
    const { premium, quantity, side, spread = 0 } = params;

    // Total turnover
    const turnover = premium * quantity;

    // 1. Bid-ask spread cost (half spread × quantity)
    const spreadCost = spread > 0 ? (spread / 2) * quantity : 0;

    // 2. Brokerage (₹20 per order OR 0.05% of premium, whichever is lower)
    const brokerageFixed = this.costs.brokeragePerOrder;
    const brokeragePercent = turnover * this.costs.brokeragePercent;
    const brokerage = Math.min(brokerageFixed, brokeragePercent);

    // 3. STT (only on SELL side for options)
    const stt = side === 'SELL' ? turnover * this.costs.sttRate : 0;

    // 4. Exchange transaction charges
    const exchange = turnover * this.costs.exchangeRate;

    // 5. SEBI turnover fees
    const sebi = turnover * this.costs.sebiRate;

    // 6. GST (18% on brokerage + exchange + SEBI)
    const gst = (brokerage + exchange + sebi) * this.costs.gstRate;

    // 7. Stamp duty (only on BUY side)
    const stampDuty = side === 'BUY' ? turnover * this.costs.stampDutyRate : 0;

    // Total for this order
    const total = spreadCost + brokerage + stt + exchange + sebi + gst + stampDuty;

    return {
      turnover,
      spreadCost: parseFloat(spreadCost.toFixed(2)),
      brokerage: parseFloat(brokerage.toFixed(2)),
      stt: parseFloat(stt.toFixed(2)),
      exchange: parseFloat(exchange.toFixed(2)),
      sebi: parseFloat(sebi.toFixed(2)),
      gst: parseFloat(gst.toFixed(2)),
      stampDuty: parseFloat(stampDuty.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }

  /**
   * Get verdict on trade outcome after costs
   */
  getVerdict(rawPnL, adjustedPnL, costPercent) {
    if (rawPnL > 0 && adjustedPnL <= 0) {
      return {
        outcome: 'FAIL',
        message: 'Costs erased profit - losing trade',
        flag: '❌'
      };
    } else if (rawPnL > 0 && costPercent > 50) {
      return {
        outcome: 'MARGINAL',
        message: `Costs consumed ${costPercent.toFixed(0)}% of profit`,
        flag: '⚠️'
      };
    } else if (adjustedPnL > 0) {
      return {
        outcome: 'SUCCESS',
        message: `Profitable after costs (${costPercent.toFixed(0)}% cost ratio)`,
        flag: '✅'
      };
    } else {
      return {
        outcome: 'LOSS',
        message: 'Losing trade before and after costs',
        flag: '❌'
      };
    }
  }

  /**
   * Estimate costs before trade execution
   */
  estimateCosts(params) {
    const { entryPrice, exitPrice, quantity, spread = 0 } = params;

    // Simplified estimate (assumes both entry and exit)
    const entryCosts = this.calculateOrderCosts({
      premium: entryPrice,
      quantity,
      side: 'BUY',
      spread
    });

    const exitCosts = this.calculateOrderCosts({
      premium: exitPrice,
      quantity,
      side: 'SELL',
      spread
    });

    const totalCosts = entryCosts.total + exitCosts.total;
    const rawPnL = (exitPrice - entryPrice) * quantity;
    const adjustedPnL = rawPnL - totalCosts;
    const costPercent = rawPnL !== 0 ? (totalCosts / Math.abs(rawPnL)) * 100 : 0;

    return {
      rawPnL,
      adjustedPnL,
      totalCosts,
      costPercent: costPercent.toFixed(2),
      breakeven: entryPrice + (totalCosts / quantity),
      verdict: this.getVerdict(rawPnL, adjustedPnL, costPercent)
    };
  }

  /**
   * Calculate aggregate costs for multiple trades
   */
  calculateAggregateCosts(trades) {
    if (!trades || trades.length === 0) {
      return {
        totalTrades: 0,
        totalRawPnL: 0,
        totalAdjustedPnL: 0,
        totalCosts: 0,
        averageCostPercent: 0
      };
    }

    let totalRawPnL = 0;
    let totalAdjustedPnL = 0;
    let totalCosts = 0;

    const tradeCosts = trades.map(trade => {
      const costs = this.calculateTradeCosts(trade);
      totalRawPnL += costs.pnl.raw;
      totalAdjustedPnL += costs.pnl.adjusted;
      totalCosts += costs.costs.total.total;
      return costs;
    });

    const averageCostPercent = totalRawPnL !== 0 
      ? (totalCosts / Math.abs(totalRawPnL)) * 100 
      : 0;

    // Calculate wins/losses before and after costs
    const rawWins = tradeCosts.filter(t => t.pnl.raw > 0).length;
    const adjustedWins = tradeCosts.filter(t => t.pnl.adjusted > 0).length;
    const costErasedWins = rawWins - adjustedWins; // Profitable trades turned into losses

    return {
      totalTrades: trades.length,
      totalRawPnL: parseFloat(totalRawPnL.toFixed(2)),
      totalAdjustedPnL: parseFloat(totalAdjustedPnL.toFixed(2)),
      totalCosts: parseFloat(totalCosts.toFixed(2)),
      averageCostPercent: parseFloat(averageCostPercent.toFixed(2)),
      costImpact: {
        rawWins,
        adjustedWins,
        costErasedWins,
        rawWinRate: ((rawWins / trades.length) * 100).toFixed(1),
        adjustedWinRate: ((adjustedWins / trades.length) * 100).toFixed(1)
      },
      verdict: this.getAggregateVerdict(totalRawPnL, totalAdjustedPnL, averageCostPercent)
    };
  }

  /**
   * Get verdict for aggregate performance
   */
  getAggregateVerdict(totalRawPnL, totalAdjustedPnL, avgCostPercent) {
    if (totalRawPnL > 0 && totalAdjustedPnL <= 0) {
      return {
        outcome: 'STRATEGY_FAIL',
        message: 'Strategy edge erased by execution costs',
        recommendation: 'STOP - Strategy not viable with real costs',
        flag: '🚨'
      };
    } else if (totalAdjustedPnL > 0 && avgCostPercent > 30) {
      return {
        outcome: 'MARGINAL_EDGE',
        message: `Costs consuming ${avgCostPercent.toFixed(0)}% of profits`,
        recommendation: 'CAUTION - Edge exists but very thin',
        flag: '⚠️'
      };
    } else if (totalAdjustedPnL > 0) {
      return {
        outcome: 'VIABLE_STRATEGY',
        message: `Profitable after costs (${avgCostPercent.toFixed(0)}% cost ratio)`,
        recommendation: 'CONTINUE - Edge survives execution costs',
        flag: '✅'
      };
    } else {
      return {
        outcome: 'LOSING_STRATEGY',
        message: 'Losing before and after costs',
        recommendation: 'STOP - No edge detected',
        flag: '❌'
      };
    }
  }

  /**
   * Get current cost configuration
   */
  getCostConfig() {
    return {
      ...this.costs,
      notes: [
        'Brokerage: ₹20 per order OR 0.05% of premium (whichever lower)',
        'STT: 0.0625% on sell side only',
        'Exchange: 0.053% of turnover (both sides)',
        'GST: 18% on (brokerage + exchange + SEBI)',
        'Stamp Duty: 0.003% on buy side only',
        'SEBI: ₹10 per ₹1 crore turnover'
      ]
    };
  }

  /**
   * Update cost rates (if broker charges differ)
   */
  updateCosts(newCosts) {
    this.costs = {
      ...this.costs,
      ...newCosts
    };
    
    logger.info('Cost configuration updated', this.costs);
  }
}

export default CostCalculator;
