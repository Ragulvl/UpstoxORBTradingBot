import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Candle Builder - Converts tick stream to 1-minute OHLC candles
 * 
 * Accumulates ticks and emits complete candles every minute
 */
export class CandleBuilder extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      interval: options.interval || 60000, // 1 minute in milliseconds
      timezone: options.timezone || 'Asia/Kolkata',
      ...options
    };
    
    this.currentCandle = null;
    this.lastCandleTime = null;
    this.tickCount = 0;
    this.candleCount = 0;
  }

  /**
   * Process incoming tick
   */
  processTick(tick) {
    try {
      const tickTime = new Date(tick.timestamp || Date.now());
      const candleMinute = this.getCandleMinute(tickTime);
      
      // Check if we need to start a new candle
      if (!this.currentCandle || this.currentCandle.minute !== candleMinute) {
        // Complete and emit previous candle if exists
        if (this.currentCandle) {
          this.completeCandle();
        }
        
        // Start new candle
        this.startNewCandle(tick, candleMinute);
      } else {
        // Update existing candle
        this.updateCandle(tick);
      }
      
      this.tickCount++;
      
    } catch (error) {
      logger.error('Error processing tick', { error: error.message, tick });
      this.emit('error', error);
    }
  }

  /**
   * Get candle minute identifier (rounds down to minute boundary)
   */
  getCandleMinute(timestamp) {
    const date = new Date(timestamp);
    date.setSeconds(0, 0); // Round down to minute boundary
    return date.toISOString();
  }

  /**
   * Start a new candle
   */
  startNewCandle(tick, minute) {
    const price = tick.ltp || tick.last_price || tick.price;
    const volume = tick.volume || tick.vol || 0;
    
    this.currentCandle = {
      minute: minute,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: volume,
      tickCount: 1,
      firstTick: tick.timestamp || new Date().toISOString(),
      instrumentKey: tick.instrument_key || tick.symbol
    };
    
    logger.debug('Started new candle', {
      minute,
      open: price,
      instrument: this.currentCandle.instrumentKey
    });
  }

  /**
   * Update existing candle with new tick
   */
  updateCandle(tick) {
    const price = tick.ltp || tick.last_price || tick.price;
    const volume = tick.volume || tick.vol || 0;
    
    // Update high
    if (price > this.currentCandle.high) {
      this.currentCandle.high = price;
    }
    
    // Update low
    if (price < this.currentCandle.low) {
      this.currentCandle.low = price;
    }
    
    // Update close (always latest price)
    this.currentCandle.close = price;
    
    // Update volume (cumulative for the minute)
    this.currentCandle.volume += volume;
    
    // Increment tick count
    this.currentCandle.tickCount++;
  }

  /**
   * Complete and emit current candle
   */
  completeCandle() {
    if (!this.currentCandle) {
      return;
    }

    // Format completed candle
    const completedCandle = {
      timestamp: this.currentCandle.minute,
      open: this.currentCandle.open,
      high: this.currentCandle.high,
      low: this.currentCandle.low,
      close: this.currentCandle.close,
      volume: this.currentCandle.volume,
      tickCount: this.currentCandle.tickCount,
      instrumentKey: this.currentCandle.instrumentKey
    };
    
    this.candleCount++;
    this.lastCandleTime = this.currentCandle.minute;
    
    logger.info('Candle completed', {
      timestamp: completedCandle.timestamp,
      ohlc: `${completedCandle.open}/${completedCandle.high}/${completedCandle.low}/${completedCandle.close}`,
      volume: completedCandle.volume,
      ticks: completedCandle.tickCount,
      candleNumber: this.candleCount
    });
    
    // Emit candle event
    this.emit('candle', completedCandle);
    
    // Reset current candle
    this.currentCandle = null;
  }

  /**
   * Force complete current candle (useful for end of day or testing)
   */
  forceComplete() {
    if (this.currentCandle) {
      logger.info('Forcing candle completion', {
        minute: this.currentCandle.minute
      });
      this.completeCandle();
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalTicks: this.tickCount,
      totalCandles: this.candleCount,
      lastCandleTime: this.lastCandleTime,
      currentCandleOpen: this.currentCandle ? this.currentCandle.open : null,
      currentCandleTicks: this.currentCandle ? this.currentCandle.tickCount : 0
    };
  }

  /**
   * Reset statistics
   */
  reset() {
    this.currentCandle = null;
    this.lastCandleTime = null;
    this.tickCount = 0;
    this.candleCount = 0;
    logger.info('Candle builder reset');
  }
}

/**
 * Candle History Manager - Maintains buffer of recent candles
 */
export class CandleHistory {
  constructor(maxCandles = 500) {
    this.maxCandles = maxCandles;
    this.candles = [];
  }

  /**
   * Add candle to history
   */
  addCandle(candle) {
    this.candles.push(candle);
    
    // Trim to max size
    if (this.candles.length > this.maxCandles) {
      this.candles.shift();
    }
  }

  /**
   * Get recent candles
   */
  getRecentCandles(count) {
    if (count >= this.candles.length) {
      return [...this.candles];
    }
    return this.candles.slice(-count);
  }

  /**
   * Get candles for specific time range
   */
  getCandlesInRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    return this.candles.filter(candle => {
      const candleTime = new Date(candle.timestamp);
      return candleTime >= start && candleTime <= end;
    });
  }

  /**
   * Get opening range candles (e.g., 9:15-9:30)
   */
  getOpeningRangeCandles(startTime, duration = 15) {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + duration * 60000); // duration in minutes
    
    return this.getCandlesInRange(start, end);
  }

  /**
   * Get last completed candle
   */
  getLastCandle() {
    return this.candles.length > 0 ? this.candles[this.candles.length - 1] : null;
  }

  /**
   * Get all candles
   */
  getAllCandles() {
    return [...this.candles];
  }

  /**
   * Clear history
   */
  clear() {
    this.candles = [];
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalCandles: this.candles.length,
      firstCandleTime: this.candles.length > 0 ? this.candles[0].timestamp : null,
      lastCandleTime: this.candles.length > 0 ? this.candles[this.candles.length - 1].timestamp : null,
      maxCapacity: this.maxCandles,
      usagePercent: ((this.candles.length / this.maxCandles) * 100).toFixed(1)
    };
  }
}

export default { CandleBuilder, CandleHistory };
