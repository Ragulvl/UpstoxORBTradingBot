/**
 * Sample Data Generator
 * 
 * Generates synthetic intraday candle data for testing
 * without needing Upstox API access
 */

import { format, addMinutes, eachDayOfInterval, parse } from 'date-fns';
import { isTradingDay, getMarketTime } from './date-utils.js';
import DataCache from '../data/data-cache.js';

class SampleDataGenerator {
  constructor(logger) {
    this.logger = logger;
    this.dataCache = new DataCache(logger);
  }

  generateSampleData(instrument, startDate, endDate) {
    this.logger.info(`Generating sample data for ${instrument}`, {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd')
    });

    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const tradingDays = allDays.filter(day => isTradingDay(day));

    let generatedDays = 0;

    for (const day of tradingDays) {
      const candles = this.generateDayCandles(instrument, day);
      this.dataCache.saveToCache(instrument, day, candles);
      generatedDays++;
    }

    this.logger.info(`Generated ${generatedDays} days of sample data for ${instrument}`);
    return generatedDays;
  }

  generateDayCandles(instrument, date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const marketOpen = getMarketTime(dateStr, '09:15');
    const marketClose = getMarketTime(dateStr, '15:30');

    // Base price for the instrument
    let basePrice = instrument === 'NIFTY' ? 22000 : 48000;
    
    // Add some daily variation
    const dailyVariation = (Math.random() - 0.5) * 500;
    basePrice += dailyVariation;

    const candles = [];
    let currentTime = marketOpen;
    let currentPrice = basePrice;
    let openingRangeHigh = 0;
    let openingRangeLow = Infinity;

    // Generate 1-minute candles from 9:15 AM to 3:30 PM
    while (currentTime < marketClose) {
      const candle = this.generateCandle(currentTime, currentPrice, instrument);
      candles.push(candle);

      // Track opening range (first 15 minutes)
      const minutesFromOpen = (currentTime - marketOpen) / (1000 * 60);
      if (minutesFromOpen < 15) {
        openingRangeHigh = Math.max(openingRangeHigh, candle.high);
        openingRangeLow = Math.min(openingRangeLow, candle.low);
      }

      // After opening range, create breakout opportunity (70% of days)
      if (minutesFromOpen === 15 && Math.random() < 0.7) {
        const breakoutDirection = Math.random() < 0.5 ? 'up' : 'down';
        
        if (breakoutDirection === 'up') {
          // Price breaks above opening range high
          currentPrice = openingRangeHigh + (Math.random() * 50 + 10);
        } else {
          // Price breaks below opening range low
          currentPrice = openingRangeLow - (Math.random() * 50 + 10);
        }
      }

      // Random walk with slight trend
      const drift = (Math.random() - 0.48) * 5; // Slight upward bias
      currentPrice += drift;

      currentTime = addMinutes(currentTime, 1);
    }

    return candles;
  }

  generateCandle(timestamp, centerPrice, instrument) {
    // Generate OHLC around center price
    const volatility = instrument === 'NIFTY' ? 10 : 20;
    
    const open = centerPrice + (Math.random() - 0.5) * volatility;
    const close = open + (Math.random() - 0.5) * volatility;
    
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    const volume = Math.floor(Math.random() * 1000000 + 100000);
    const oi = Math.floor(Math.random() * 5000000 + 1000000);

    return {
      timestamp,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
      oi
    };
  }
}

// CLI usage
async function generateSampleDataCLI() {
  console.log('Loading modules...');
  const { default: Logger } = await import('./logger.js');
  const { loadConfig } = await import('./config-loader.js');

  console.log('Loading configuration...');
  try {
    const config = loadConfig();
    const logger = new Logger(config.logging);
    const generator = new SampleDataGenerator(logger);

    const startDate = parse(config.backtest.startDate, 'yyyy-MM-dd', new Date());
    const endDate = parse(config.backtest.endDate, 'yyyy-MM-dd', new Date());

    console.log('\n⚠️  Generating SAMPLE data for testing purposes');
    console.log('This is NOT real market data!\n');

    for (const instrument of config.trading.instruments) {
      console.log(`Generating data for ${instrument}...`);
      const days = generator.generateSampleData(instrument, startDate, endDate);
      console.log(`✓ Generated ${days} days of data\n`);
    }

    console.log('Sample data generation complete!');
    console.log('You can now run: npm run backtest\n');

  } catch (error) {
    console.error('Error generating sample data:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || 
    import.meta.url.endsWith('sample-data-generator.js')) {
  console.log('Running sample data generator...');
  generateSampleDataCLI();
}

export default SampleDataGenerator;
