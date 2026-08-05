import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Instrument Master Manager
 * 
 * Fetches and caches NIFTY/BANKNIFTY options instrument data from Upstox
 * Handles strike selection, expiry management, and instrument key lookup
 */
export class InstrumentMaster {
  constructor(config = {}) {
    this.config = config;
    this.instruments = new Map(); // instrumentKey -> instrument data
    this.symbolIndex = new Map(); // symbol -> array of instruments
    this.expiryIndex = new Map(); // expiry -> array of instruments
    this.lastUpdate = null;
    this.cacheFile = path.join(process.cwd(), 'data', 'instrument_master_cache.json');
  }

  /**
   * Download and parse instrument master CSV from Upstox
   */
  async fetchInstrumentMaster() {
    try {
      logger.info('Fetching instrument master from Upstox');
      
      const url = 'https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv';
      const response = await axios.get(url, {
        timeout: 30000,
        responseType: 'text'
      });

      logger.info('Instrument master downloaded', { 
        sizeKB: (response.data.length / 1024).toFixed(1)
      });

      return response.data;
    } catch (error) {
      logger.error('Failed to fetch instrument master', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Parse instrument CSV and build indexes
   */
  async parseAndIndex(csvData) {
    try {
      logger.info('Parsing instrument master CSV');

      const records = parse(csvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      logger.info('CSV parsed', { totalInstruments: records.length });

      // Filter to only NIFTY and BANKNIFTY options
      const relevantInstruments = records.filter(record => {
        const tradingsymbol = record.tradingsymbol || record.trading_symbol || '';
        const instrumentType = record.instrument_type || record.instrumentType || '';
        
        return (
          (tradingsymbol.startsWith('NIFTY') || tradingsymbol.startsWith('BANKNIFTY')) &&
          instrumentType === 'OPTIDX' // Option Index
        );
      });

      logger.info('Filtered to NIFTY/BANKNIFTY options', { 
        count: relevantInstruments.length 
      });

      // Clear existing indexes
      this.instruments.clear();
      this.symbolIndex.clear();
      this.expiryIndex.clear();

      // Build indexes
      relevantInstruments.forEach(record => {
        const instrument = this.normalizeInstrument(record);
        
        // Main instrument map
        this.instruments.set(instrument.instrumentKey, instrument);
        
        // Symbol index (NIFTY, BANKNIFTY)
        if (!this.symbolIndex.has(instrument.underlying)) {
          this.symbolIndex.set(instrument.underlying, []);
        }
        this.symbolIndex.get(instrument.underlying).push(instrument);
        
        // Expiry index
        const expiryKey = this.getExpiryKey(instrument.expiry);
        if (!this.expiryIndex.has(expiryKey)) {
          this.expiryIndex.set(expiryKey, []);
        }
        this.expiryIndex.get(expiryKey).push(instrument);
      });

      this.lastUpdate = new Date();
      
      logger.info('Instrument master indexed', {
        totalInstruments: this.instruments.size,
        symbols: Array.from(this.symbolIndex.keys()),
        expiries: Array.from(this.expiryIndex.keys()).slice(0, 5),
        lastUpdate: this.lastUpdate.toISOString()
      });

      // Cache to file for faster startup
      await this.saveCache();

      return {
        total: this.instruments.size,
        bySymbol: Object.fromEntries(
          Array.from(this.symbolIndex.entries()).map(([k, v]) => [k, v.length])
        )
      };

    } catch (error) {
      logger.error('Failed to parse instrument master', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Normalize instrument record to consistent format
   */
  normalizeInstrument(record) {
    const tradingsymbol = record.tradingsymbol || record.trading_symbol || '';
    
    // Parse option details from trading symbol
    // Format: NIFTY24AUGXXX00CE or BANKNIFTY24AUGXXXXX00PE
    const match = tradingsymbol.match(/^(NIFTY|BANKNIFTY)(\d{2}[A-Z]{3})(\d+)(CE|PE)$/);
    
    let underlying, expiryStr, strike, optionType;
    
    if (match) {
      [, underlying, expiryStr, strike, optionType] = match;
    } else {
      // Fallback parsing
      underlying = tradingsymbol.startsWith('BANKNIFTY') ? 'BANKNIFTY' : 'NIFTY';
      strike = parseInt(record.strike || 0);
      optionType = tradingsymbol.endsWith('CE') ? 'CE' : 'PE';
      expiryStr = '';
    }

    return {
      instrumentKey: record.instrument_key || record.instrumentKey || '',
      tradingSymbol: tradingsymbol,
      underlying: underlying,
      expiry: record.expiry || '',
      strike: parseFloat(strike),
      optionType: optionType, // CE or PE
      lotSize: parseInt(record.lot_size || record.lotSize || 1),
      tickSize: parseFloat(record.tick_size || record.tickSize || 0.05),
      exchange: record.exchange || 'NSE',
      name: record.name || tradingsymbol
    };
  }

  /**
   * Get expiry key for indexing (YYYY-MM-DD format)
   */
  getExpiryKey(expiryStr) {
    if (!expiryStr) return 'UNKNOWN';
    
    // Expiry format from Upstox: "2026-08-27" or similar
    return expiryStr.split('T')[0]; // Remove time component if present
  }

  /**
   * Find nearest ATM strike for given spot price
   */
  findATMStrike(underlying, spotPrice, optionType) {
    const instruments = this.symbolIndex.get(underlying);
    
    if (!instruments || instruments.length === 0) {
      logger.warn('No instruments found for underlying', { underlying });
      return null;
    }

    // Get current week expiry
    const nearestExpiry = this.findNearestExpiry(underlying);
    
    if (!nearestExpiry) {
      logger.warn('No expiry found', { underlying });
      return null;
    }

    // Filter by expiry and option type
    const candidates = instruments.filter(inst => 
      inst.expiry === nearestExpiry && 
      inst.optionType === optionType
    );

    if (candidates.length === 0) {
      logger.warn('No instruments found for criteria', { 
        underlying, 
        expiry: nearestExpiry, 
        optionType 
      });
      return null;
    }

    // Find strike closest to spot price
    let nearest = candidates[0];
    let minDiff = Math.abs(candidates[0].strike - spotPrice);

    for (const inst of candidates) {
      const diff = Math.abs(inst.strike - spotPrice);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = inst;
      }
    }

    logger.debug('ATM strike found', {
      underlying,
      spotPrice,
      atmStrike: nearest.strike,
      optionType,
      tradingSymbol: nearest.tradingSymbol
    });

    return nearest;
  }

  /**
   * Find OTM strike (Out of The Money)
   * For CE: strike above spot
   * For PE: strike below spot
   */
  findOTMStrike(underlying, spotPrice, optionType, strikeDistance = 1) {
    const instruments = this.symbolIndex.get(underlying);
    
    if (!instruments || instruments.length === 0) {
      return null;
    }

    const nearestExpiry = this.findNearestExpiry(underlying);
    if (!nearestExpiry) {
      return null;
    }

    // Filter by expiry and option type
    const candidates = instruments.filter(inst => 
      inst.expiry === nearestExpiry && 
      inst.optionType === optionType
    );

    // Sort by strike
    candidates.sort((a, b) => a.strike - b.strike);

    // For CE: find strike above spot
    // For PE: find strike below spot
    let selected = null;

    if (optionType === 'CE') {
      // Find first strike above spot, then move strikeDistance strikes higher
      const aboveSpot = candidates.filter(inst => inst.strike > spotPrice);
      if (aboveSpot.length >= strikeDistance) {
        selected = aboveSpot[strikeDistance - 1];
      }
    } else {
      // Find first strike below spot, then move strikeDistance strikes lower
      const belowSpot = candidates.filter(inst => inst.strike < spotPrice);
      if (belowSpot.length >= strikeDistance) {
        selected = belowSpot[belowSpot.length - strikeDistance];
      }
    }

    if (selected) {
      logger.debug('OTM strike found', {
        underlying,
        spotPrice,
        otmStrike: selected.strike,
        optionType,
        strikeDistance,
        tradingSymbol: selected.tradingSymbol
      });
    }

    return selected;
  }

  /**
   * Find nearest expiry (current week or next week)
   */
  findNearestExpiry(underlying) {
    const instruments = this.symbolIndex.get(underlying);
    
    if (!instruments || instruments.length === 0) {
      return null;
    }

    const now = new Date();
    const validExpiries = instruments
      .map(inst => inst.expiry)
      .filter((expiry, index, self) => self.indexOf(expiry) === index) // unique
      .filter(expiry => new Date(expiry) >= now) // future expiries only
      .sort(); // ascending order

    const nearest = validExpiries[0];
    
    logger.debug('Nearest expiry found', {
      underlying,
      expiry: nearest,
      totalUpcoming: validExpiries.length
    });

    return nearest;
  }

  /**
   * Get instrument by instrument key
   */
  getInstrument(instrumentKey) {
    return this.instruments.get(instrumentKey);
  }

  /**
   * Get all instruments for a symbol
   */
  getInstrumentsBySymbol(underlying) {
    return this.symbolIndex.get(underlying) || [];
  }

  /**
   * Get instruments expiring on a specific date
   */
  getInstrumentsByExpiry(expiryDate) {
    const expiryKey = this.getExpiryKey(expiryDate);
    return this.expiryIndex.get(expiryKey) || [];
  }

  /**
   * Check if data is stale (older than 24 hours)
   */
  isStale() {
    if (!this.lastUpdate) {
      return true;
    }
    
    const ageHours = (Date.now() - this.lastUpdate.getTime()) / (1000 * 60 * 60);
    return ageHours > 24;
  }

  /**
   * Save cache to file
   */
  async saveCache() {
    try {
      const cacheData = {
        lastUpdate: this.lastUpdate,
        instruments: Array.from(this.instruments.entries())
      };

      await fs.writeFile(
        this.cacheFile,
        JSON.stringify(cacheData, null, 2)
      );

      logger.debug('Instrument cache saved', { file: this.cacheFile });
    } catch (error) {
      logger.warn('Failed to save instrument cache', { 
        error: error.message 
      });
    }
  }

  /**
   * Load cache from file
   */
  async loadCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const cacheData = JSON.parse(data);

      this.lastUpdate = new Date(cacheData.lastUpdate);
      
      // Rebuild instruments map
      this.instruments.clear();
      this.symbolIndex.clear();
      this.expiryIndex.clear();

      for (const [key, instrument] of cacheData.instruments) {
        this.instruments.set(key, instrument);
        
        // Rebuild symbol index
        if (!this.symbolIndex.has(instrument.underlying)) {
          this.symbolIndex.set(instrument.underlying, []);
        }
        this.symbolIndex.get(instrument.underlying).push(instrument);
        
        // Rebuild expiry index
        const expiryKey = this.getExpiryKey(instrument.expiry);
        if (!this.expiryIndex.has(expiryKey)) {
          this.expiryIndex.set(expiryKey, []);
        }
        this.expiryIndex.get(expiryKey).push(instrument);
      }

      logger.info('Instrument cache loaded', {
        instruments: this.instruments.size,
        lastUpdate: this.lastUpdate.toISOString()
      });

      return true;
    } catch (error) {
      logger.debug('Failed to load instrument cache', { 
        error: error.message 
      });
      return false;
    }
  }

  /**
   * Initialize - load cache or fetch fresh data
   */
  async initialize() {
    logger.info('Initializing instrument master');

    // Try loading cache first
    const cacheLoaded = await this.loadCache();

    // Fetch fresh if no cache or cache is stale
    if (!cacheLoaded || this.isStale()) {
      logger.info('Fetching fresh instrument master');
      try {
        const csvData = await this.fetchInstrumentMaster();
        await this.parseAndIndex(csvData);
      } catch (error) {
        logger.warn('Failed to fetch instrument master, generating minimal mock data for testing', {
          error: error.message
        });
        // Generate minimal mock data for development/testing
        await this.generateMockInstruments();
      }
    } else {
      logger.info('Using cached instrument master');
    }

    return {
      instruments: this.instruments.size,
      lastUpdate: this.lastUpdate,
      isStale: this.isStale()
    };
  }

  /**
   * Generate minimal mock instruments for testing
   * (Used when API is unavailable)
   */
  async generateMockInstruments() {
    logger.info('Generating mock instrument data');

    const mockInstruments = [];
    const today = new Date();
    const currentExpiry = new Date(today);
    currentExpiry.setDate(currentExpiry.getDate() + 7); // Next week
    const expiryStr = currentExpiry.toISOString().split('T')[0];

    // Generate NIFTY options
    const niftySpot = 22000;
    for (let strikeOffset = -500; strikeOffset <= 500; strikeOffset += 50) {
      const strike = niftySpot + strikeOffset;
      
      // Call option
      mockInstruments.push({
        instrument_key: `NSE_FO|NIFTY${expiryStr.replace(/-/g, '')}${strike}CE`,
        tradingsymbol: `NIFTY${expiryStr.replace(/-/g, '')}${strike}CE`,
        instrument_type: 'OPTIDX',
        exchange: 'NSE_FO',
        name: 'NIFTY',
        expiry: expiryStr,
        strike: strike.toString(),
        option_type: 'CE',
        lot_size: '50',
        tick_size: '0.05'
      });

      // Put option
      mockInstruments.push({
        instrument_key: `NSE_FO|NIFTY${expiryStr.replace(/-/g, '')}${strike}PE`,
        tradingsymbol: `NIFTY${expiryStr.replace(/-/g, '')}${strike}PE`,
        instrument_type: 'OPTIDX',
        exchange: 'NSE_FO',
        name: 'NIFTY',
        expiry: expiryStr,
        strike: strike.toString(),
        option_type: 'PE',
        lot_size: '50',
        tick_size: '0.05'
      });
    }

    // Generate BANKNIFTY options
    const bankniftySpot = 47000;
    for (let strikeOffset = -1000; strikeOffset <= 1000; strikeOffset += 100) {
      const strike = bankniftySpot + strikeOffset;
      
      // Call option
      mockInstruments.push({
        instrument_key: `NSE_FO|BANKNIFTY${expiryStr.replace(/-/g, '')}${strike}CE`,
        tradingsymbol: `BANKNIFTY${expiryStr.replace(/-/g, '')}${strike}CE`,
        instrument_type: 'OPTIDX',
        exchange: 'NSE_FO',
        name: 'BANKNIFTY',
        expiry: expiryStr,
        strike: strike.toString(),
        option_type: 'CE',
        lot_size: '25',
        tick_size: '0.05'
      });

      // Put option
      mockInstruments.push({
        instrument_key: `NSE_FO|BANKNIFTY${expiryStr.replace(/-/g, '')}${strike}PE`,
        tradingsymbol: `BANKNIFTY${expiryStr.replace(/-/g, '')}${strike}PE`,
        instrument_type: 'OPTIDX',
        exchange: 'NSE_FO',
        name: 'BANKNIFTY',
        expiry: expiryStr,
        strike: strike.toString(),
        option_type: 'PE',
        lot_size: '25',
        tick_size: '0.05'
      });
    }

    logger.info('Generated mock instruments', { count: mockInstruments.length });

    // Parse as CSV format
    const csvData = [
      'instrument_key,exchange_token,tradingsymbol,name,last_price,expiry,strike,tick_size,lot_size,instrument_type,option_type,exchange',
      ...mockInstruments.map(inst => 
        `${inst.instrument_key},0,${inst.tradingsymbol},${inst.name},0,${inst.expiry},${inst.strike},${inst.tick_size},${inst.lot_size},${inst.instrument_type},${inst.option_type},${inst.exchange}`
      )
    ].join('\n');

    await this.parseAndIndex(csvData);
    await this.saveCache(); // Save for next time
  }

  /**
   * Force refresh - fetch and parse fresh data
   */
  async refresh() {
    logger.info('Force refreshing instrument master');
    const csvData = await this.fetchInstrumentMaster();
    await this.parseAndIndex(csvData);
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      totalInstruments: this.instruments.size,
      lastUpdate: this.lastUpdate?.toISOString(),
      isStale: this.isStale(),
      bySymbol: {}
    };

    for (const [symbol, instruments] of this.symbolIndex.entries()) {
      stats.bySymbol[symbol] = {
        total: instruments.length,
        ce: instruments.filter(i => i.optionType === 'CE').length,
        pe: instruments.filter(i => i.optionType === 'PE').length
      };
    }

    return stats;
  }
}

export default InstrumentMaster;
