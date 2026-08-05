import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Live Risk Manager
 * 
 * Real-time risk enforcement:
 * - Daily loss circuit breaker
 * - Kill switch
 * - Position sizing
 * - Pre-trade risk checks
 * - Max trades per day
 */
export class LiveRiskManager extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    
    // Risk parameters
    this.capital = config.trading?.capital || 100000;
    this.dailyLossLimitPercent = config.trading?.dailyLossLimitPercent || 2.0;
    this.maxTradesPerDay = config.trading?.maxTradesPerDay || 2;
    this.riskPerTradePercent = config.trading?.riskPerTradePercent || 2.0;
    
    // State
    this.dailyPnL = 0;
    this.tradesCount = 0;
    this.circuitBreakerTriggered = false;
    this.killSwitchActivated = false;
    this.killSwitchFile = path.join(process.cwd(), '.kill-switch');
    
    // Limits
    this.dailyLossLimit = (this.capital * this.dailyLossLimitPercent) / 100;
    
    logger.info('Live risk manager initialized', {
      capital: this.capital,
      dailyLossLimit: this.dailyLossLimit,
      dailyLossLimitPercent: this.dailyLossLimitPercent,
      maxTradesPerDay: this.maxTradesPerDay,
      riskPerTrade: this.riskPerTradePercent
    });
  }

  /**
   * Pre-trade risk checks
   * Returns { allowed: true/false, reason: string }
   */
  checkTradeAllowed(trade = {}) {
    // Check kill switch
    if (this.killSwitchActivated) {
      return {
        allowed: false,
        reason: 'KILL_SWITCH_ACTIVATED'
      };
    }

    // Check circuit breaker
    if (this.circuitBreakerTriggered) {
      return {
        allowed: false,
        reason: 'CIRCUIT_BREAKER_TRIGGERED'
      };
    }

    // Check daily P&L limit
    const dailyPnLPercent = (this.dailyPnL / this.capital) * 100;
    if (dailyPnLPercent <= -this.dailyLossLimitPercent) {
      this.triggerCircuitBreaker('DAILY_LOSS_LIMIT');
      return {
        allowed: false,
        reason: 'DAILY_LOSS_LIMIT_REACHED'
      };
    }

    // Check max trades per day
    if (this.tradesCount >= this.maxTradesPerDay) {
      return {
        allowed: false,
        reason: 'MAX_TRADES_PER_DAY_REACHED'
      };
    }

    // Check if sufficient capital available
    const riskAmount = this.calculateRiskAmount(trade);
    if (riskAmount > this.capital) {
      return {
        allowed: false,
        reason: 'INSUFFICIENT_CAPITAL'
      };
    }

    // All checks passed
    return {
      allowed: true,
      reason: 'APPROVED',
      riskAmount
    };
  }

  /**
   * Calculate position size based on risk per trade
   */
  calculatePositionSize(params) {
    const { entryPrice, stopLoss } = params;
    
    if (!entryPrice || !stopLoss) {
      logger.error('Missing parameters for position sizing', params);
      return null;
    }

    // Calculate risk per unit
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    
    if (riskPerUnit === 0) {
      logger.error('Invalid stop loss - same as entry price');
      return null;
    }

    // Calculate max risk amount for this trade
    const maxRiskAmount = (this.capital * this.riskPerTradePercent) / 100;
    
    // Calculate quantity
    const quantity = Math.floor(maxRiskAmount / riskPerUnit);

    // For options, round to lot size if available
    const lotSize = params.lotSize || 1;
    const lots = Math.floor(quantity / lotSize);
    
    // Ensure at least 1 lot for virtual trading if quantity allows
    const adjustedLots = lots > 0 ? lots : (quantity >= lotSize * 0.5 ? 1 : 0);
    const adjustedQuantity = adjustedLots * lotSize;

    logger.debug('Position size calculated', {
      capital: this.capital,
      riskPercent: this.riskPerTradePercent,
      maxRiskAmount,
      entryPrice,
      stopLoss,
      riskPerUnit,
      rawQuantity: quantity,
      lots: adjustedLots,
      adjustedQuantity
    });

    // Return null if no position can be taken
    if (adjustedQuantity === 0) {
      logger.warn('Position size is zero - capital too small or risk too high', {
        maxRiskAmount,
        riskPerUnit,
        lotSize
      });
      return null;
    }

    return {
      quantity: adjustedQuantity,
      lots: adjustedLots,
      riskAmount: adjustedQuantity * riskPerUnit,
      riskPercent: ((adjustedQuantity * riskPerUnit) / this.capital) * 100
    };
  }

  /**
   * Calculate risk amount for a trade
   */
  calculateRiskAmount(trade) {
    const { entryPrice, stopLoss, quantity } = trade;
    
    if (!entryPrice || !stopLoss || !quantity) {
      return 0;
    }

    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    return riskPerUnit * quantity;
  }

  /**
   * Update daily P&L (called after each trade closes)
   */
  updateDailyPnL(tradePnL) {
    this.dailyPnL += tradePnL;
    
    const dailyPnLPercent = (this.dailyPnL / this.capital) * 100;

    logger.info('Daily P&L updated', {
      tradePnL: tradePnL.toFixed(2),
      dailyPnL: this.dailyPnL.toFixed(2),
      dailyPnLPercent: dailyPnLPercent.toFixed(2),
      capital: this.capital
    });

    // Check if circuit breaker should trigger
    if (dailyPnLPercent <= -this.dailyLossLimitPercent) {
      this.triggerCircuitBreaker('DAILY_LOSS_LIMIT');
    }

    this.emit('daily_pnl_updated', {
      dailyPnL: this.dailyPnL,
      dailyPnLPercent
    });
  }

  /**
   * Increment trade count
   */
  incrementTradeCount() {
    this.tradesCount++;
    
    logger.debug('Trade count incremented', {
      count: this.tradesCount,
      max: this.maxTradesPerDay
    });

    if (this.tradesCount >= this.maxTradesPerDay) {
      logger.warn('Max trades per day reached', {
        count: this.tradesCount
      });
      this.emit('max_trades_reached');
    }
  }

  /**
   * Trigger circuit breaker
   */
  triggerCircuitBreaker(reason) {
    if (this.circuitBreakerTriggered) {
      return; // Already triggered
    }

    this.circuitBreakerTriggered = true;

    const dailyPnLPercent = (this.dailyPnL / this.capital) * 100;

    logger.error('🚨 CIRCUIT BREAKER TRIGGERED', {
      reason,
      dailyPnL: this.dailyPnL.toFixed(2),
      dailyPnLPercent: dailyPnLPercent.toFixed(2),
      limit: -this.dailyLossLimitPercent
    });

    this.emit('circuit_breaker_triggered', {
      reason,
      dailyPnL: this.dailyPnL,
      dailyPnLPercent,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check kill switch file
   */
  async checkKillSwitch() {
    try {
      await fs.access(this.killSwitchFile);
      
      logger.debug('Kill switch file EXISTS', { file: this.killSwitchFile });
      
      // File exists - kill switch activated
      if (!this.killSwitchActivated) {
        this.activateKillSwitch('FILE');
      }
      
      return true;
    } catch {
      // File doesn't exist - kill switch not activated
      logger.debug('Kill switch file NOT found (normal operation)');
      return false;
    }
  }

  /**
   * Activate kill switch
   */
  activateKillSwitch(trigger = 'MANUAL') {
    if (this.killSwitchActivated) {
      return; // Already activated
    }

    this.killSwitchActivated = true;

    logger.error('🛑 KILL SWITCH ACTIVATED', {
      trigger,
      timestamp: new Date().toISOString()
    });

    this.emit('kill_switch_activated', {
      trigger,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Create kill switch file
   */
  async createKillSwitchFile() {
    try {
      await fs.writeFile(this.killSwitchFile, new Date().toISOString());
      logger.warn('Kill switch file created', { file: this.killSwitchFile });
      this.activateKillSwitch('FILE');
    } catch (error) {
      logger.error('Failed to create kill switch file', {
        error: error.message
      });
    }
  }

  /**
   * Remove kill switch file (reset)
   */
  async removeKillSwitchFile() {
    try {
      await fs.unlink(this.killSwitchFile);
      logger.info('Kill switch file removed', { file: this.killSwitchFile });
      this.killSwitchActivated = false;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to remove kill switch file', {
          error: error.message
        });
      }
    }
  }

  /**
   * Reset daily counters (call at start of new trading day)
   */
  resetDaily() {
    logger.info('Resetting daily risk counters', {
      previousDailyPnL: this.dailyPnL.toFixed(2),
      previousTradesCount: this.tradesCount
    });

    this.dailyPnL = 0;
    this.tradesCount = 0;
    this.circuitBreakerTriggered = false;
    // Don't reset kill switch - that's manual

    this.emit('daily_reset');
  }

  /**
   * Emergency stop - close all positions and activate kill switch
   */
  emergencyStop(reason = 'EMERGENCY') {
    logger.error('🚨 EMERGENCY STOP', { reason });

    this.activateKillSwitch(reason);
    this.triggerCircuitBreaker(reason);

    this.emit('emergency_stop', {
      reason,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get risk status
   */
  getRiskStatus() {
    const dailyPnLPercent = (this.dailyPnL / this.capital) * 100;
    const remainingLoss = this.dailyLossLimit + this.dailyPnL; // How much more can we lose
    const remainingTrades = this.maxTradesPerDay - this.tradesCount;

    return {
      capital: this.capital,
      dailyPnL: this.dailyPnL,
      dailyPnLPercent: dailyPnLPercent.toFixed(2),
      dailyLossLimit: this.dailyLossLimit,
      remainingLoss: remainingLoss.toFixed(2),
      tradesCount: this.tradesCount,
      maxTradesPerDay: this.maxTradesPerDay,
      remainingTrades,
      circuitBreakerTriggered: this.circuitBreakerTriggered,
      killSwitchActivated: this.killSwitchActivated,
      tradingAllowed: !this.circuitBreakerTriggered && !this.killSwitchActivated && remainingTrades > 0
    };
  }

  /**
   * Get risk statistics
   */
  getStats() {
    const status = this.getRiskStatus();
    
    return {
      ...status,
      riskPerTrade: this.riskPerTradePercent,
      maxRiskPerTrade: ((this.capital * this.riskPerTradePercent) / 100).toFixed(2)
    };
  }

  /**
   * Update capital (if needed)
   */
  updateCapital(newCapital) {
    logger.info('Updating capital', {
      oldCapital: this.capital,
      newCapital
    });

    this.capital = newCapital;
    this.dailyLossLimit = (this.capital * this.dailyLossLimitPercent) / 100;
  }
}

export default LiveRiskManager;
