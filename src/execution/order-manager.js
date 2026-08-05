/**
 * Order Manager - Phase 2
 * 
 * Handles order placement, modification, and cancellation
 * with idempotent handling to prevent duplicate orders.
 * 
 * IMPORTANT: Only use after Phase 1 backtest shows statistical edge
 */

import crypto from 'crypto';

class OrderManager {
  constructor(config, upstoxClient, logger) {
    this.config = config;
    this.upstoxClient = upstoxClient;
    this.logger = logger;
    this.activeOrders = new Map(); // orderId -> order details
    this.orderAttempts = new Map(); // attemptId -> orderId (for idempotency)
  }

  generateAttemptId(orderParams) {
    // Generate unique ID for this order attempt to prevent duplicates
    const paramStr = JSON.stringify(orderParams);
    return crypto.createHash('md5').update(paramStr).digest('hex');
  }

  async placeOrder(orderParams) {
    const attemptId = this.generateAttemptId(orderParams);

    // Check if we already tried this exact order
    if (this.orderAttempts.has(attemptId)) {
      const existingOrderId = this.orderAttempts.get(attemptId);
      this.logger.warn('Duplicate order attempt detected', {
        attemptId,
        existingOrderId
      });
      return { orderId: existingOrderId, isDuplicate: true };
    }

    try {
      this.logger.info('Placing order', { orderParams, attemptId });

      const response = await this.upstoxClient.placeOrder(orderParams);
      const orderId = response.data.order_id;

      // Record this attempt
      this.orderAttempts.set(attemptId, orderId);
      this.activeOrders.set(orderId, {
        ...orderParams,
        orderId,
        status: 'PENDING',
        placedAt: new Date()
      });

      this.logger.audit('ORDER_PLACED', {
        orderId,
        params: orderParams
      });

      return { orderId, isDuplicate: false };

    } catch (error) {
      this.logger.error('Error placing order', {
        error: error.message,
        orderParams
      });

      // If error is a timeout/network error, check order status before retrying
      if (this.isRetryableError(error)) {
        this.logger.warn('Retryable error detected, checking order status');
        // In production, implement order status check here
      }

      throw error;
    }
  }

  async modifyOrder(orderId, modifications) {
    const order = this.activeOrders.get(orderId);
    
    if (!order) {
      throw new Error(`Order ${orderId} not found in active orders`);
    }

    try {
      this.logger.info('Modifying order', { orderId, modifications });

      const response = await this.upstoxClient.modifyOrder(orderId, modifications);

      // Update local record
      this.activeOrders.set(orderId, {
        ...order,
        ...modifications,
        modifiedAt: new Date()
      });

      this.logger.audit('ORDER_MODIFIED', {
        orderId,
        modifications
      });

      return response;

    } catch (error) {
      this.logger.error('Error modifying order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async cancelOrder(orderId) {
    const order = this.activeOrders.get(orderId);
    
    if (!order) {
      throw new Error(`Order ${orderId} not found in active orders`);
    }

    try {
      this.logger.info('Cancelling order', { orderId });

      const response = await this.upstoxClient.cancelOrder(orderId);

      // Update local record
      order.status = 'CANCELLED';
      order.cancelledAt = new Date();

      this.logger.audit('ORDER_CANCELLED', { orderId });

      return response;

    } catch (error) {
      this.logger.error('Error cancelling order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const response = await this.upstoxClient.getOrderStatus(orderId);
      
      // Update local record
      if (this.activeOrders.has(orderId)) {
        const order = this.activeOrders.get(orderId);
        order.status = response.data.status;
        order.lastChecked = new Date();
      }

      return response.data;

    } catch (error) {
      this.logger.error('Error getting order status', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async exitAllPositions() {
    this.logger.warn('EMERGENCY: Exiting all positions');

    const positions = await this.upstoxClient.getPositions();
    
    for (const position of positions.data) {
      try {
        // Place opposite order to close position
        const exitOrder = {
          instrument_token: position.instrument_token || position.instrument_key,  // HFT uses instrument_token
          quantity: Math.abs(position.quantity),
          transaction_type: position.quantity > 0 ? 'SELL' : 'BUY',
          order_type: 'MARKET',
          product: position.product,
          validity: 'DAY',
          price: 0,
          trigger_price: 0,
          disclosed_quantity: 0,
          is_amo: false
        };

        await this.placeOrder(exitOrder);
        
        this.logger.audit('EMERGENCY_EXIT', {
          instrument: position.instrument_key,
          quantity: position.quantity
        });

      } catch (error) {
        this.logger.error('Failed to exit position', {
          position,
          error: error.message
        });
        // Continue trying to exit other positions
      }
    }
  }

  isRetryableError(error) {
    const retryableErrors = [
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'ECONNREFUSED'
    ];
    
    return retryableErrors.some(code => 
      error.message.includes(code) || error.code === code
    );
  }

  getActiveOrders() {
    return Array.from(this.activeOrders.values());
  }

  clearAttempts() {
    // Clear attempt cache at start of each day
    this.orderAttempts.clear();
  }
}

export default OrderManager;
