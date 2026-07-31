import { format, subDays } from 'date-fns';
import { getMarketTime, toIST } from '../utils/date-utils.js';
import ORBStrategy from './orb-strategy.js';

/**
 * Golden Ratio Breakout Strategy
 * 
 * Combines opening range with 61.8% Fibonacci retracement
 * of previous day's high-low-close range for entry triggers
 */
class GoldenRatioStrategy extends ORBStrategy {
  constructor(config, logger) {
    super(config, logger);
    this.fibLevel = config.goldenRatio?.fibonacciLevel || 0.618;
    this.previousDayData = null;
    
    // Override with Golden Ratio specific settings if provided
    if (config.goldenRatio) {
      this.config.strategy = {
        ...this.config.strategy,
        ...config.goldenRatio
      };
    }
  }

  reset() {
    super.reset();
    this.previousDayData = null;
  }

  /**
   * Calculate previous day's high, low, close for Fibonacci calculations
   */
  calculatePreviousDayRange(allCandles, currentDate) {
    const prevDay = subDays(currentDate, 1);
    const prevDateStr = format(prevDay, 'yyyy-MM-dd');
    
    // Filter candles from previous day
    const prevDayCandles = allCandles.filter(candle => {
      const candleDateStr = format(candle.timestamp, 'yyyy-MM-dd');
      return candleDateStr === prevDateStr;
    });

    if (prevDayCandles.length === 0) {
      this.logger.warn('No previous day data for Golden Ratio calculation', {
        currentDate: format(currentDate, 'yyyy-MM-dd')
      });
      return null;
    }

    const high = Math.max(...prevDayCandles.map(c => c.high));
    const low = Math.min(...prevDayCandles.map(c => c.low));
    const close = prevDayCandles[prevDayCandles.length - 1].close;

    this.previousDayData = { high, low, close, range: high - low };
    
    this.logger.debug('Previous day data calculated', {
      date: prevDateStr,
      high,
      low,
      close,
      range: this.previousDayData.range
    });

    return this.previousDayData;
  }

  /**
   * Calculate Golden Ratio entry levels
   * Combines opening range with 61.8% of previous day's range
   */
  calculateGoldenRatioLevels(openingRange, previousDayData) {
    if (!previousDayData) {
      // Fallback to plain opening range if no previous day data
      return {
        longEntry: openingRange.high,
        shortEntry: openingRange.low,
        method: 'OPENING_RANGE_ONLY'
      };
    }

    // Calculate 61.8% of previous day's range
    const fibRange = previousDayData.range * this.fibLevel;

    // Golden Ratio entry levels:
    // Long: Opening range high + (61.8% of prev day range as buffer)
    // Short: Opening range low - (61.8% of prev day range as buffer)
    
    const longEntry = openingRange.high + (fibRange * 0.1); // 10% of fib range as buffer
    const shortEntry = openingRange.low - (fibRange * 0.1);

    this.logger.info('Golden Ratio levels calculated', {
      openingRangeHigh: openingRange.high,
      openingRangeLow: openingRange.low,
      prevDayRange: previousDayData.range,
      fibRange,
      longEntry,
      shortEntry
    });

    return {
      longEntry,
      shortEntry,
      method: 'GOLDEN_RATIO',
      fibRange
    };
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

    // Calculate Golden Ratio levels if not already done
    if (!this.goldenRatioLevels) {
      this.goldenRatioLevels = this.calculateGoldenRatioLevels(
        this.openingRange,
        this.previousDayData
      );
    }

    // Check for breakout using Golden Ratio levels
    let signal = null;

    if (candle.close > this.goldenRatioLevels.longEntry) {
      signal = {
        direction: 'LONG',
        price: candle.close,
        timestamp: candle.timestamp,
        entryLevel: this.goldenRatioLevels.longEntry,
        method: this.goldenRatioLevels.method
      };
    } else if (candle.close < this.goldenRatioLevels.shortEntry) {
      signal = {
        direction: 'SHORT',
        price: candle.close,
        timestamp: candle.timestamp,
        entryLevel: this.goldenRatioLevels.shortEntry,
        method: this.goldenRatioLevels.method
      };
    }

    return signal;
  }

  processDay(candles, tradingDate, allCandles = null) {
    this.reset();

    const dateStr = format(tradingDate, 'yyyy-MM-dd');
    this.logger.info(`Processing ${dateStr} with Golden Ratio strategy`, {
      candles: candles.length
    });

    // Calculate previous day range for Golden Ratio
    if (allCandles) {
      this.calculatePreviousDayRange(allCandles, tradingDate);
    }

    // Calculate opening range
    this.calculateOpeningRange(candles, tradingDate);

    if (!this.openingRange) {
      return { trades: [], reason: 'NO_OPENING_RANGE' };
    }

    // Rest of the processing is same as parent ORB strategy
    return super.processDay(candles, tradingDate);
  }
}

export default GoldenRatioStrategy;
