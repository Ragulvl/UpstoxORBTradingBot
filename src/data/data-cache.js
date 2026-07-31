import fs from 'fs';
import path from 'path';
import { format, parse, eachDayOfInterval } from 'date-fns';
import { isTradingDay } from '../utils/date-utils.js';

class DataCache {
  constructor(logger) {
    this.logger = logger;
    this.cacheDir = './data';
    this.ensureCacheDirectory();
  }

  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  getCacheFilePath(instrument, date) {
    const dateStr = format(date, 'yyyy-MM-dd');
    return path.join(this.cacheDir, `${instrument}_${dateStr}.json`);
  }

  isCached(instrument, date) {
    const filePath = this.getCacheFilePath(instrument, date);
    return fs.existsSync(filePath);
  }

  saveToCache(instrument, date, data) {
    try {
      const filePath = this.getCacheFilePath(instrument, date);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      this.logger.debug(`Cached data for ${instrument} on ${format(date, 'yyyy-MM-dd')}`);
    } catch (error) {
      this.logger.error('Error saving to cache', {
        instrument,
        date: format(date, 'yyyy-MM-dd'),
        error: error.message
      });
    }
  }

  loadFromCache(instrument, date) {
    try {
      const filePath = this.getCacheFilePath(instrument, date);
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        // Convert timestamp strings back to Date objects
        return data.map(candle => ({
          ...candle,
          timestamp: new Date(candle.timestamp)
        }));
      }
      return null;
    } catch (error) {
      this.logger.error('Error loading from cache', {
        instrument,
        date: format(date, 'yyyy-MM-dd'),
        error: error.message
      });
      return null;
    }
  }

  getMissingDates(instrument, startDate, endDate) {
    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const tradingDays = allDays.filter(day => isTradingDay(day));
    
    const missingDays = tradingDays.filter(day => !this.isCached(instrument, day));
    
    this.logger.info(`Cache status for ${instrument}`, {
      totalDays: tradingDays.length,
      cachedDays: tradingDays.length - missingDays.length,
      missingDays: missingDays.length
    });

    return missingDays;
  }

  saveBacktestResults(results, strategyName) {
    try {
      const timestamp = format(new Date(), 'yyyy-MM-dd_HH-mm-ss');
      const filename = `backtest_${strategyName}_${timestamp}.json`;
      const filePath = path.join(this.cacheDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
      this.logger.info(`Backtest results saved to ${filename}`);
      
      return filePath;
    } catch (error) {
      this.logger.error('Error saving backtest results', {
        error: error.message
      });
      throw error;
    }
  }

  loadBacktestResults(filename) {
    try {
      const filePath = path.join(this.cacheDir, filename);
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      return null;
    } catch (error) {
      this.logger.error('Error loading backtest results', {
        filename,
        error: error.message
      });
      return null;
    }
  }

  exportToCSV(data, filename) {
    try {
      const filePath = path.join(this.cacheDir, filename);
      
      if (data.length === 0) {
        this.logger.warn('No data to export to CSV');
        return;
      }

      // Get headers from first object
      const headers = Object.keys(data[0]);
      const csv = [
        headers.join(','),
        ...data.map(row => 
          headers.map(header => {
            const value = row[header];
            // Handle dates and objects
            if (value instanceof Date) {
              return format(value, 'yyyy-MM-dd HH:mm:ss');
            }
            if (typeof value === 'object') {
              return JSON.stringify(value);
            }
            return value;
          }).join(',')
        )
      ].join('\n');

      fs.writeFileSync(filePath, csv);
      this.logger.info(`Data exported to ${filename}`);
    } catch (error) {
      this.logger.error('Error exporting to CSV', {
        filename,
        error: error.message
      });
      throw error;
    }
  }
}

export default DataCache;
