import { format, addMinutes, isAfter, isBefore, differenceInHours } from 'date-fns';
import { getMarketTime, toIST } from '../utils/date-utils.js';
import {
  getOptionStrike,
  estimateOptionPremium,
  calculateOptionsPositionSize,
  estimatePremiumChange,
  calculateTimeDecay,
  getDaysToExpiry
} from '../utils/options-pricing.js';

class ORBStrategy {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.instrumentType = config.trading?.instrumentType || 'OPTIONS';
    this.reset();
  }

  reset() {
    this.openingRange = null;
    this.entryPrice = null;
    this.entryDirection = null;
    this.stopLoss = null;
    this.target = null;
    this.trailingStop = null;
    this.position = null;
    this.trades = [];
    this.dailyPnL = 0;
    this.entryTime = null;
    this.exitTime = null;
    
    // Options-specific
    this.optionType = null;
    this.strike = null;
    this.entryPremium = null;
    this.quantity = 0;
    this.daysToExpiry = 0;
  }

  calculateOpeningRange(candles, tradingDate) {
    const dateStr = format(tradingDate, 'yyyy-MM-dd');
    const rangeStart = getMarketTime(dateStr, this.config.trading.marketOpen);
    const rangeEnd = addMinutes(rangeStart, this.config.trading.openingRangeDuration);

    // Filter candles within opening range
    const rangeCandles = candles.filter(candle => {
      return candle.timestamp >= rangeStart && candle.timestamp < rangeEnd;
    });

    if (rangeCandles.length === 0) {
      this.logger.warn('No candles found in opening range', { date: dateStr });
      return null;
    }

    const high = Math.max(...rangeCandles.map(c => c.high));
    const low = Math.min(...rangeCandles.map(c => c.low));

    this.openingRange = { high, low, start: rangeStart, end: rangeEnd };
    
    this.logger.info('Opening range calculated', {
      date: dateStr,
      high,
      low,
      candles: rangeCandles.length
    });

    return this.openingRange;
  }

  checkEntry(candle) {
    if (!this.openingRange) {
      return null;
    }

    // Don't enter if we already have a position
    if (this.position) {
      return null;
    }

    // Check if we're past the opening range period
    if (candle.timestamp < this.openingRange.end) {
      return null;
    }

    // Check if we're past last entry time
    const candleTimeStr = format(toIST(candle.timestamp), 'HH:mm');
    if (candleTimeStr >= this.config.trading.lastEntryTime) {
      return null;
    }

    // Check if we've hit max trades for the day
    if (this.trades.length >= this.config.trading.maxTradesPerDay) {
      return null;
    }

    // Check for breakout
    let signal = null;

    if (candle.close > this.openingRange.high) {
      signal = {
        direction: 'LONG',
        price: candle.close,
        timestamp: candle.timestamp
      };
    } else if (candle.close < this.openingRange.low) {
      signal = {
        direction: 'SHORT',
        price: candle.close,
        timestamp: candle.timestamp
      };
    }

    return signal;
  }

  enterPosition(signal, instrument = 'NIFTY') {
    this.position = signal.direction;
    this.entryPrice = signal.price;
    this.entryTime = signal.timestamp;
    this.entryDirection = signal.direction;

    if (this.instrumentType === 'OPTIONS') {
      // Options trading logic
      this.optionType = signal.direction === 'LONG' ? 'CALL' : 'PUT';
      this.strike = getOptionStrike(signal.price, instrument);
      this.daysToExpiry = getDaysToExpiry(signal.timestamp, instrument);
      
      // Estimate option premium (simplified for backtesting)
      this.entryPremium = estimateOptionPremium(
        signal.price,
        this.strike,
        this.daysToExpiry,
        20, // Assumed volatility ~20%
        this.optionType
      );

      // Calculate quantity based on risk per trade
      this.quantity = calculateOptionsPositionSize(
        this.config.trading.capital,
        this.config.trading.riskPerTradePercent || 2,
        this.entryPremium,
        this.config.strategy.stopLossPercent
      );

      // Stop loss and target in terms of premium percentage
      this.stopLoss = this.entryPremium * (1 - this.config.strategy.stopLossPercent / 100);
      this.target = this.entryPremium * (1 + this.config.strategy.targetPercent / 100);
      
      if (this.config.strategy.useTrailingStop) {
        this.trailingStop = this.stopLoss;
      }

      this.logger.trade('ENTRY', {
        direction: signal.direction,
        spotPrice: this.entryPrice,
        optionType: this.optionType,
        strike: this.strike,
        premium: this.entryPremium,
        quantity: this.quantity,
        totalInvestment: this.entryPremium * this.quantity,
        timestamp: signal.timestamp,
        stopLoss: this.stopLoss,
        target: this.target,
        daysToExpiry: this.daysToExpiry
      });
    } else {
      // Original futures/index logic (kept for reference)
      if (signal.direction === 'LONG') {
        this.stopLoss = this.entryPrice * (1 - this.config.strategy.stopLossPercent / 100);
        this.target = this.entryPrice * (1 + this.config.strategy.targetPercent / 100);
        
        if (this.config.strategy.useTrailingStop) {
          this.trailingStop = this.stopLoss;
        }
      } else {
        this.stopLoss = this.entryPrice * (1 + this.config.strategy.stopLossPercent / 100);
        this.target = this.entryPrice * (1 - this.config.strategy.targetPercent / 100);
        
        if (this.config.strategy.useTrailingStop) {
          this.trailingStop = this.stopLoss;
        }
      }

      this.logger.trade('ENTRY', {
        direction: signal.direction,
        price: this.entryPrice,
        timestamp: signal.timestamp,
        stopLoss: this.stopLoss,
        target: this.target
      });
    }
  }

  checkExit(candle, isHardExit = false) {
    if (!this.position) {
      return null;
    }

    let exitReason = null;
    let exitPrice = candle.close;
    let exitPremium = null;

    if (this.instrumentType === 'OPTIONS') {
      // Calculate current option premium based on spot movement
      const hoursElapsed = differenceInHours(candle.timestamp, this.entryTime);
      const timeDecay = calculateTimeDecay(this.entryPremium, this.daysToExpiry, hoursElapsed);
      
      const currentPremium = estimatePremiumChange(
        this.entryPrice,
        candle.close,
        this.entryPremium,
        this.optionType,
        timeDecay
      );

      exitPremium = currentPremium;

      if (isHardExit) {
        exitReason = 'HARD_EXIT';
      } else {
        // Check stop loss (premium-based)
        if (currentPremium <= this.stopLoss) {
          exitReason = 'STOP_LOSS';
          exitPremium = this.stopLoss;
        }
        // Check target (premium-based)
        else if (currentPremium >= this.target) {
          exitReason = 'TARGET';
          exitPremium = this.target;
        }
        // Update trailing stop
        else if (this.config.strategy.useTrailingStop && currentPremium > this.entryPremium) {
          const newTrailingStop = currentPremium * (1 - this.config.strategy.trailingStopPercent / 100);
          if (newTrailingStop > this.trailingStop) {
            this.trailingStop = newTrailingStop;
            this.stopLoss = this.trailingStop;
          }
          // Check if trailing stop hit
          if (currentPremium <= this.trailingStop) {
            exitReason = 'TRAILING_STOP';
            exitPremium = this.trailingStop;
          }
        }
      }
    } else {
      // Original futures/index logic
      if (isHardExit) {
        exitReason = 'HARD_EXIT';
      } else if (this.position === 'LONG') {
        if (candle.low <= this.stopLoss) {
          exitReason = 'STOP_LOSS';
          exitPrice = this.stopLoss;
        }
        else if (candle.high >= this.target) {
          exitReason = 'TARGET';
          exitPrice = this.target;
        }
        else if (this.config.strategy.useTrailingStop && candle.close > this.entryPrice) {
          const newTrailingStop = candle.close * (1 - this.config.strategy.trailingStopPercent / 100);
          if (newTrailingStop > this.trailingStop) {
            this.trailingStop = newTrailingStop;
            this.stopLoss = this.trailingStop;
          }
          if (candle.low <= this.trailingStop) {
            exitReason = 'TRAILING_STOP';
            exitPrice = this.trailingStop;
          }
        }
      } else if (this.position === 'SHORT') {
        if (candle.high >= this.stopLoss) {
          exitReason = 'STOP_LOSS';
          exitPrice = this.stopLoss;
        }
        else if (candle.low <= this.target) {
          exitReason = 'TARGET';
          exitPrice = this.target;
        }
        else if (this.config.strategy.useTrailingStop && candle.close < this.entryPrice) {
          const newTrailingStop = candle.close * (1 + this.config.strategy.trailingStopPercent / 100);
          if (newTrailingStop < this.trailingStop) {
            this.trailingStop = newTrailingStop;
            this.stopLoss = this.trailingStop;
          }
          if (candle.high >= this.trailingStop) {
            exitReason = 'TRAILING_STOP';
            exitPrice = this.trailingStop;
          }
        }
      }
    }

    if (exitReason) {
      return {
        reason: exitReason,
        price: exitPrice,
        premium: exitPremium,
        timestamp: candle.timestamp
      };
    }

    return null;
  }

  exitPosition(exitSignal) {
    let pnl, pnlPoints, totalPnL;

    if (this.instrumentType === 'OPTIONS') {
      // Options P&L calculation
      const premiumChange = exitSignal.premium - this.entryPremium;
      pnl = (premiumChange / this.entryPremium) * 100;
      pnlPoints = premiumChange;
      totalPnL = premiumChange * this.quantity;

      const trade = {
        direction: this.position,
        optionType: this.optionType,
        strike: this.strike,
        spotEntry: this.entryPrice,
        spotExit: exitSignal.price,
        entryPremium: this.entryPremium,
        exitPremium: exitSignal.premium,
        entryTime: this.entryTime,
        exitTime: exitSignal.timestamp,
        exitReason: exitSignal.reason,
        quantity: this.quantity,
        pnlPercent: pnl,
        pnlPerOption: pnlPoints,
        totalPnL: totalPnL,
        investment: this.entryPremium * this.quantity
      };

      this.trades.push(trade);
      this.dailyPnL += pnl;

      this.logger.trade('EXIT', {
        ...trade,
        dailyPnL: this.dailyPnL
      });

      // Reset position
      this.position = null;
      this.entryPrice = null;
      this.stopLoss = null;
      this.target = null;
      this.trailingStop = null;
      this.optionType = null;
      this.strike = null;
      this.entryPremium = null;
      this.quantity = 0;

      return trade;
    } else {
      // Original futures/index P&L
      pnl = this.position === 'LONG'
        ? (exitSignal.price - this.entryPrice) / this.entryPrice * 100
        : (this.entryPrice - exitSignal.price) / this.entryPrice * 100;

      pnlPoints = this.position === 'LONG'
        ? exitSignal.price - this.entryPrice
        : this.entryPrice - exitSignal.price;

      const trade = {
        direction: this.position,
        entryPrice: this.entryPrice,
        entryTime: this.entryTime,
        exitPrice: exitSignal.price,
        exitTime: exitSignal.timestamp,
        exitReason: exitSignal.reason,
        pnlPercent: pnl,
        pnlPoints: pnlPoints
      };

      this.trades.push(trade);
      this.dailyPnL += pnl;

      this.logger.trade('EXIT', {
        ...trade,
        dailyPnL: this.dailyPnL
      });

      // Reset position
      this.position = null;
      this.entryPrice = null;
      this.stopLoss = null;
      this.target = null;
      this.trailingStop = null;

      return trade;
    }
  }

  shouldStopTrading() {
    const lossLimit = this.config.trading.dailyLossLimitPercent;
    
    if (Math.abs(this.dailyPnL) >= lossLimit) {
      this.logger.warn('Daily loss limit reached', {
        dailyPnL: this.dailyPnL,
        limit: lossLimit
      });
      return true;
    }

    return false;
  }

  processDay(candles, tradingDate, instrument = 'NIFTY') {
    this.reset();

    const dateStr = format(tradingDate, 'yyyy-MM-dd');
    this.logger.info(`Processing ${dateStr}`, { candles: candles.length });

    // Calculate opening range
    this.calculateOpeningRange(candles, tradingDate);

    if (!this.openingRange) {
      return { trades: [], reason: 'NO_OPENING_RANGE' };
    }

    // Hard exit time
    const hardExitTime = getMarketTime(dateStr, this.config.trading.hardExitTime);

    // Process each candle
    for (const candle of candles) {
      // Check if we should stop trading due to daily loss limit
      if (this.shouldStopTrading()) {
        // Exit any open position
        if (this.position) {
          const exitSignal = {
            reason: 'DAILY_LOSS_LIMIT',
            price: candle.close,
            premium: this.instrumentType === 'OPTIONS' ? 0 : null,
            timestamp: candle.timestamp
          };
          this.exitPosition(exitSignal);
        }
        break;
      }

      // Check for hard exit time
      if (candle.timestamp >= hardExitTime && this.position) {
        const exitSignal = this.checkExit(candle, true);
        if (exitSignal) {
          this.exitPosition(exitSignal);
        }
        continue;
      }

      // Check for exit if we have a position
      if (this.position) {
        const exitSignal = this.checkExit(candle);
        if (exitSignal) {
          this.exitPosition(exitSignal);
          continue;
        }
      }

      // Check for entry if we don't have a position
      if (!this.position) {
        const entrySignal = this.checkEntry(candle);
        if (entrySignal) {
          this.enterPosition(entrySignal, instrument);
        }
      }
    }

    // Force close any open position at end of day
    if (this.position && candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const exitSignal = {
        reason: 'END_OF_DAY',
        price: lastCandle.close,
        premium: this.instrumentType === 'OPTIONS' ? 0 : null,
        timestamp: lastCandle.timestamp
      };
      this.exitPosition(exitSignal);
    }

    return {
      trades: this.trades,
      dailyPnL: this.dailyPnL,
      openingRange: this.openingRange
    };
  }
}

export default ORBStrategy;
