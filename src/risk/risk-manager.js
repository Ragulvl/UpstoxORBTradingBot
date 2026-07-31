/**
 * Risk Manager - Phase 2/3
 * 
 * Implements all safety features:
 * - Daily loss circuit breaker
 * - Manual kill switch
 * - Position size management
 * - Trade limits
 */

class RiskManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.reset();
  }

  reset() {
    this.dailyPnL = 0;
    this.dailyTrades = 0;
    this.isCircuitBreakerTriggered = false;
    this.isKillSwitchActive = false;
    this.maxDailyLoss = (this.config.trading.dailyLossLimitPercent / 100) * this.config.trading.capital;
  }

  canTrade() {
    // Check kill switch
    if (this.isKillSwitchActive) {
      this.logger.warn('Kill switch is active - trading disabled');
      return { allowed: false, reason: 'KILL_SWITCH_ACTIVE' };
    }

    // Check circuit breaker
    if (this.isCircuitBreakerTriggered) {
      this.logger.warn('Circuit breaker triggered - trading disabled');
      return { allowed: false, reason: 'CIRCUIT_BREAKER' };
    }

    // Check daily trade limit
    if (this.dailyTrades >= this.config.trading.maxTradesPerDay) {
      this.logger.warn('Max daily trades reached');
      return { allowed: false, reason: 'MAX_TRADES_REACHED' };
    }

    return { allowed: true };
  }

  recordTrade(pnl) {
    this.dailyTrades++;
    this.dailyPnL += pnl;

    this.logger.info('Trade recorded', {
      dailyTrades: this.dailyTrades,
      dailyPnL: this.dailyPnL,
      maxDailyLoss: this.maxDailyLoss
    });

    // Check if daily loss limit exceeded
    if (Math.abs(this.dailyPnL) >= this.maxDailyLoss) {
      this.triggerCircuitBreaker('DAILY_LOSS_LIMIT_EXCEEDED');
    }
  }

  triggerCircuitBreaker(reason) {
    this.isCircuitBreakerTriggered = true;
    
    this.logger.error('CIRCUIT BREAKER TRIGGERED', {
      reason,
      dailyPnL: this.dailyPnL,
      maxDailyLoss: this.maxDailyLoss,
      timestamp: new Date()
    });

    this.logger.audit('CIRCUIT_BREAKER_TRIGGERED', {
      reason,
      dailyPnL: this.dailyPnL
    });

    return true;
  }

  activateKillSwitch(reason = 'MANUAL') {
    this.isKillSwitchActive = true;
    
    this.logger.error('KILL SWITCH ACTIVATED', {
      reason,
      timestamp: new Date()
    });

    this.logger.audit('KILL_SWITCH_ACTIVATED', { reason });

    return true;
  }

  deactivateKillSwitch() {
    this.isKillSwitchActive = false;
    
    this.logger.info('Kill switch deactivated');
    this.logger.audit('KILL_SWITCH_DEACTIVATED', {});
  }

  resetCircuitBreaker() {
    this.isCircuitBreakerTriggered = false;
    this.logger.info('Circuit breaker reset');
  }

  calculatePositionSize(instrument, price) {
    // Simple position sizing based on capital
    // In production, consider volatility, ATR, etc.
    
    const maxRiskPerTrade = this.config.trading.capital * 0.02; // 2% risk per trade
    const stopLossPercent = this.config.strategy.stopLossPercent / 100;
    const riskPerUnit = price * stopLossPercent;
    
    const quantity = Math.floor(maxRiskPerTrade / riskPerUnit);

    this.logger.debug('Position size calculated', {
      instrument,
      price,
      quantity,
      maxRisk: maxRiskPerTrade
    });

    return quantity;
  }

  getStatus() {
    return {
      dailyPnL: this.dailyPnL,
      dailyTrades: this.dailyTrades,
      maxDailyLoss: this.maxDailyLoss,
      remainingLossBuffer: this.maxDailyLoss - Math.abs(this.dailyPnL),
      remainingTrades: this.config.trading.maxTradesPerDay - this.dailyTrades,
      circuitBreakerActive: this.isCircuitBreakerTriggered,
      killSwitchActive: this.isKillSwitchActive
    };
  }
}

export default RiskManager;
