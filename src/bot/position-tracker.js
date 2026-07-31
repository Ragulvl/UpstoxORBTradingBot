import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Position Tracker
 * 
 * Tracks open positions in real-time:
 * - Position state (entry, current, P&L)
 * - Real-time premium updates
 * - Stop loss and target monitoring
 * - Position history
 */
export class PositionTracker extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.positions = new Map(); // positionId -> position object
    this.closedPositions = [];
    this.dailyPnL = 0;
    this.totalPnL = 0;
  }

  /**
   * Open a new position
   */
  openPosition(params) {
    const position = {
      id: params.id || this.generatePositionId(),
      instrument: params.instrument,
      instrumentKey: params.instrumentKey,
      side: params.side, // 'BUY' or 'SELL'
      quantity: params.quantity,
      entryPrice: params.entryPrice,
      entryTime: params.entryTime || new Date().toISOString(),
      currentPrice: params.entryPrice,
      stopLoss: params.stopLoss,
      target: params.target,
      orderId: params.orderId,
      status: 'OPEN',
      pnl: 0,
      pnlPercent: 0,
      maxProfit: 0,
      maxLoss: 0,
      updateCount: 0,
      lastUpdate: new Date().toISOString()
    };

    this.positions.set(position.id, position);

    logger.info('Position opened', {
      id: position.id,
      instrument: position.instrument,
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      stopLoss: position.stopLoss,
      target: position.target
    });

    this.emit('position_opened', position);

    return position;
  }

  /**
   * Update position with current market price
   */
  updatePosition(positionId, currentPrice) {
    const position = this.positions.get(positionId);

    if (!position) {
      logger.warn('Position not found for update', { positionId });
      return null;
    }

    if (position.status !== 'OPEN') {
      return position;
    }

    // Update current price
    position.currentPrice = currentPrice;
    position.updateCount++;
    position.lastUpdate = new Date().toISOString();

    // Calculate P&L
    const pnl = this.calculatePnL(position);
    position.pnl = pnl.absolute;
    position.pnlPercent = pnl.percent;

    // Track max profit/loss
    if (position.pnl > position.maxProfit) {
      position.maxProfit = position.pnl;
    }
    if (position.pnl < position.maxLoss) {
      position.maxLoss = position.pnl;
    }

    // Check if stop loss or target hit
    const stopHit = this.checkStopLoss(position);
    const targetHit = this.checkTarget(position);

    if (stopHit) {
      this.emit('stop_loss_hit', position);
      logger.warn('Stop loss hit', {
        id: position.id,
        currentPrice,
        stopLoss: position.stopLoss,
        pnl: position.pnl
      });
    }

    if (targetHit) {
      this.emit('target_hit', position);
      logger.info('Target hit', {
        id: position.id,
        currentPrice,
        target: position.target,
        pnl: position.pnl
      });
    }

    this.emit('position_updated', position);

    return position;
  }

  /**
   * Calculate P&L for a position
   */
  calculatePnL(position) {
    let absolute = 0;

    if (position.side === 'BUY') {
      // Long position: profit when price goes up
      absolute = (position.currentPrice - position.entryPrice) * position.quantity;
    } else {
      // Short position: profit when price goes down
      absolute = (position.entryPrice - position.currentPrice) * position.quantity;
    }

    const percent = ((absolute / (position.entryPrice * position.quantity)) * 100);

    return {
      absolute,
      percent
    };
  }

  /**
   * Check if stop loss is hit
   */
  checkStopLoss(position) {
    if (!position.stopLoss) {
      return false;
    }

    if (position.side === 'BUY') {
      // For long, stop loss is below entry
      return position.currentPrice <= position.stopLoss;
    } else {
      // For short, stop loss is above entry
      return position.currentPrice >= position.stopLoss;
    }
  }

  /**
   * Check if target is hit
   */
  checkTarget(position) {
    if (!position.target) {
      return false;
    }

    if (position.side === 'BUY') {
      // For long, target is above entry
      return position.currentPrice >= position.target;
    } else {
      // For short, target is below entry
      return position.currentPrice <= position.target;
    }
  }

  /**
   * Close a position
   */
  closePosition(positionId, params = {}) {
    const position = this.positions.get(positionId);

    if (!position) {
      logger.warn('Position not found for closing', { positionId });
      return null;
    }

    if (position.status !== 'OPEN') {
      logger.warn('Position already closed', { positionId });
      return position;
    }

    // Update with exit details
    position.status = 'CLOSED';
    position.exitPrice = params.exitPrice || position.currentPrice;
    position.exitTime = params.exitTime || new Date().toISOString();
    position.exitReason = params.reason || 'MANUAL';
    position.exitOrderId = params.orderId;

    // Final P&L calculation
    const tempPrice = position.currentPrice;
    position.currentPrice = position.exitPrice;
    const finalPnL = this.calculatePnL(position);
    position.pnl = finalPnL.absolute;
    position.pnlPercent = finalPnL.percent;
    position.currentPrice = tempPrice; // restore for logging

    // Calculate duration
    const entryTime = new Date(position.entryTime);
    const exitTime = new Date(position.exitTime);
    position.durationMinutes = Math.floor((exitTime - entryTime) / 1000 / 60);

    // Update daily P&L
    this.dailyPnL += position.pnl;
    this.totalPnL += position.pnl;

    // Move to closed positions
    this.closedPositions.push({ ...position });
    this.positions.delete(positionId);

    logger.info('Position closed', {
      id: position.id,
      instrument: position.instrument,
      entryPrice: position.entryPrice,
      exitPrice: position.exitPrice,
      pnl: position.pnl.toFixed(2),
      pnlPercent: position.pnlPercent.toFixed(2),
      duration: position.durationMinutes,
      reason: position.exitReason
    });

    this.emit('position_closed', position);

    return position;
  }

  /**
   * Close all open positions (emergency)
   */
  closeAllPositions(reason = 'EMERGENCY') {
    logger.warn('Closing all positions', { 
      count: this.positions.size, 
      reason 
    });

    const closedList = [];

    for (const [positionId, position] of this.positions) {
      const closed = this.closePosition(positionId, {
        reason,
        exitPrice: position.currentPrice
      });
      closedList.push(closed);
    }

    this.emit('all_positions_closed', { count: closedList.length, reason });

    return closedList;
  }

  /**
   * Get position by ID
   */
  getPosition(positionId) {
    return this.positions.get(positionId);
  }

  /**
   * Get all open positions
   */
  getOpenPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Get closed positions
   */
  getClosedPositions(count = null) {
    if (count) {
      return this.closedPositions.slice(-count);
    }
    return this.closedPositions;
  }

  /**
   * Check if any position is open
   */
  hasOpenPositions() {
    return this.positions.size > 0;
  }

  /**
   * Get position count
   */
  getPositionCount() {
    return {
      open: this.positions.size,
      closed: this.closedPositions.length,
      total: this.positions.size + this.closedPositions.length
    };
  }

  /**
   * Calculate daily P&L from capital
   */
  getDailyPnLPercent(capital) {
    if (!capital || capital === 0) {
      return 0;
    }
    return (this.dailyPnL / capital) * 100;
  }

  /**
   * Reset daily P&L (call at start of new trading day)
   */
  resetDailyPnL() {
    logger.info('Resetting daily P&L', { 
      previousDaily: this.dailyPnL.toFixed(2) 
    });
    this.dailyPnL = 0;
  }

  /**
   * Get statistics
   */
  getStats() {
    const openPositions = this.getOpenPositions();
    const closedToday = this.closedPositions.filter(p => {
      const exitDate = new Date(p.exitTime).toDateString();
      const today = new Date().toDateString();
      return exitDate === today;
    });

    const wins = closedToday.filter(p => p.pnl > 0).length;
    const losses = closedToday.filter(p => p.pnl < 0).length;
    const winRate = closedToday.length > 0 
      ? ((wins / closedToday.length) * 100).toFixed(1) 
      : 0;

    return {
      openPositions: openPositions.length,
      closedToday: closedToday.length,
      totalClosed: this.closedPositions.length,
      wins,
      losses,
      winRate: parseFloat(winRate),
      dailyPnL: this.dailyPnL,
      totalPnL: this.totalPnL,
      positions: openPositions.map(p => ({
        id: p.id,
        instrument: p.instrument,
        side: p.side,
        quantity: p.quantity,
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        pnl: p.pnl.toFixed(2),
        pnlPercent: p.pnlPercent.toFixed(2)
      }))
    };
  }

  /**
   * Generate unique position ID
   */
  generatePositionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 7);
    return `POS-${timestamp}-${random}`;
  }

  /**
   * Clear all data (for testing or day end cleanup)
   */
  clear() {
    this.positions.clear();
    this.closedPositions = [];
    this.dailyPnL = 0;
    // Don't reset totalPnL - that's cumulative
    logger.info('Position tracker cleared');
  }
}

export default PositionTracker;
