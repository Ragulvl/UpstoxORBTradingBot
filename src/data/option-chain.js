import axios from 'axios';
import { logger } from '../utils/logger.js';

/**
 * Option Chain Fetcher
 * 
 * Fetches real-time option chain data from Upstox
 * Gets bid-ask spreads, premiums, and Greeks for strike selection
 */
export class OptionChainFetcher {
  constructor(config, upstoxClient) {
    this.config = config;
    this.upstoxClient = upstoxClient;
    this.cache = new Map(); // instrumentKey -> last quote data
    this.cacheTimeout = 5000; // 5 seconds cache
    this.useMock = config.websocket?.useMock || false;
    
    if (this.useMock) {
      logger.info('⚠️  OptionChainFetcher initialized in MOCK mode');
    }
  }

  /**
   * Generate mock option quote for virtual trading
   */
  generateMockOptionQuote(instrumentKey, spotPrice) {
    // Parse instrument key to get strike and type
    // Format: NSE_FO|NIFTY2026081122500PE or similar
    const match = instrumentKey.match(/(\d+)(CE|PE)$/);
    
    if (!match) {
      logger.error('Could not parse instrument key for mock quote', { instrumentKey });
      throw new Error('Invalid instrument key format');
    }
    
    const strike = parseInt(match[1]);
    const optionType = match[2]; // CE or PE
    
    // Calculate intrinsic value
    const intrinsicValue = optionType === 'CE'
      ? Math.max(0, spotPrice - strike)
      : Math.max(0, strike - spotPrice);
    
    // Calculate time value (simplified - typically would use Black-Scholes)
    const distanceFromStrike = Math.abs(spotPrice - strike);
    const timeValue = Math.max(10, 50 - (distanceFromStrike / 50)); // Decreases with distance
    
    // Total premium
    const premium = intrinsicValue + timeValue;
    
    // Add small bid-ask spread (0.5% of premium)
    const spread = premium * 0.005;
    const midPrice = premium;
    const bidPrice = midPrice - (spread / 2);
    const askPrice = midPrice + (spread / 2);
    
    const mockQuote = {
      instrumentKey,
      ltp: midPrice,
      open: midPrice * 0.98,
      high: midPrice * 1.02,
      low: midPrice * 0.97,
      close: midPrice,
      prevClose: midPrice * 0.99,
      change: midPrice * 0.01,
      changePercent: 1.0,
      volume: 1000000,
      bidPrice: parseFloat(bidPrice.toFixed(2)),
      askPrice: parseFloat(askPrice.toFixed(2)),
      bidQty: 500,
      askQty: 500,
      spread: parseFloat(spread.toFixed(2)),
      spreadPercent: '0.50',
      midPrice: parseFloat(midPrice.toFixed(2)),
      timestamp: new Date().toISOString(),
      oi: 50000,
      oiChange: 1000,
      _mock: true
    };
    
    logger.debug('Generated mock option quote', {
      instrumentKey,
      spotPrice,
      strike,
      optionType,
      intrinsicValue: intrinsicValue.toFixed(2),
      timeValue: timeValue.toFixed(2),
      premium: midPrice.toFixed(2)
    });
    
    return mockQuote;
  }

  /**
   * Get option chain for an instrument
   * Uses Upstox Market Quote API
   */
  async getOptionQuote(instrumentKey, spotPrice = null) {
    try {
      // Check cache first
      const cached = this.getCached(instrumentKey);
      if (cached) {
        logger.debug('Using cached option quote', { instrumentKey });
        return cached;
      }

      // If in mock mode, generate synthetic quote
      if (this.useMock) {
        if (!spotPrice) {
          throw new Error('Spot price required for mock option quote generation');
        }
        
        const mockQuote = this.generateMockOptionQuote(instrumentKey, spotPrice);
        
        // Cache the result
        this.cache.set(instrumentKey, {
          data: mockQuote,
          timestamp: Date.now()
        });
        
        return mockQuote;
      }

      const baseUrl = this.config.upstox.useSandbox 
        ? this.config.upstox.sandboxUrl 
        : this.config.upstox.baseUrl;
      
      const url = `${baseUrl}/market-quote/quotes`;
      
      logger.debug('Fetching option quote', { instrumentKey });

      const response = await axios.get(url, {
        params: {
          instrument_key: instrumentKey
        },
        headers: {
          'Authorization': `Bearer ${this.config.upstox.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      if (response.data && response.data.status === 'success') {
        const quoteData = response.data.data[instrumentKey];
        
        const quote = this.normalizeQuote(instrumentKey, quoteData);
        
        // Cache the result
        this.cache.set(instrumentKey, {
          data: quote,
          timestamp: Date.now()
        });

        return quote;
      } else {
        throw new Error('Invalid response from market quote API');
      }

    } catch (error) {
      logger.error('Failed to fetch option quote', {
        instrumentKey,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get quotes for multiple instruments at once
   */
  async getMultipleQuotes(instrumentKeys) {
    try {
      if (instrumentKeys.length === 0) {
        return {};
      }

      const baseUrl = this.config.upstox.useSandbox 
        ? this.config.upstox.sandboxUrl 
        : this.config.upstox.baseUrl;
      
      const url = `${baseUrl}/market-quote/quotes`;
      
      logger.debug('Fetching multiple option quotes', { 
        count: instrumentKeys.length 
      });

      // Upstox accepts comma-separated instrument keys
      const response = await axios.get(url, {
        params: {
          instrument_key: instrumentKeys.join(',')
        },
        headers: {
          'Authorization': `Bearer ${this.config.upstox.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (response.data && response.data.status === 'success') {
        const quotes = {};
        
        for (const [key, quoteData] of Object.entries(response.data.data)) {
          quotes[key] = this.normalizeQuote(key, quoteData);
          
          // Cache each quote
          this.cache.set(key, {
            data: quotes[key],
            timestamp: Date.now()
          });
        }

        return quotes;
      } else {
        throw new Error('Invalid response from market quote API');
      }

    } catch (error) {
      logger.error('Failed to fetch multiple quotes', {
        count: instrumentKeys.length,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Normalize quote data to consistent format
   */
  normalizeQuote(instrumentKey, quoteData) {
    const ohlc = quoteData.ohlc || {};
    const depth = quoteData.depth || {};
    
    // Extract bid-ask from depth
    const buy = depth.buy || [];
    const sell = depth.sell || [];
    
    const bestBid = buy.length > 0 ? buy[0].price : null;
    const bestAsk = sell.length > 0 ? sell[0].price : null;
    
    const bidQty = buy.length > 0 ? buy[0].quantity : 0;
    const askQty = sell.length > 0 ? sell[0].quantity : 0;

    const ltp = quoteData.last_price || ohlc.close || 0;
    
    // Calculate spread
    const spread = (bestBid && bestAsk) ? (bestAsk - bestBid) : 0;
    const spreadPercent = (bestBid && bestAsk) 
      ? ((spread / bestBid) * 100) 
      : 0;
    
    // Mid price (fair value)
    const midPrice = (bestBid && bestAsk) 
      ? ((bestBid + bestAsk) / 2) 
      : ltp;

    return {
      instrumentKey,
      ltp,
      open: ohlc.open || ltp,
      high: ohlc.high || ltp,
      low: ohlc.low || ltp,
      close: ohlc.close || ltp,
      prevClose: quoteData.net_change ? ltp - quoteData.net_change : ltp,
      change: quoteData.net_change || 0,
      changePercent: quoteData.change_percent || 0,
      volume: quoteData.volume || 0,
      bidPrice: bestBid,
      askPrice: bestAsk,
      bidQty,
      askQty,
      spread,
      spreadPercent: spreadPercent.toFixed(2),
      midPrice,
      timestamp: new Date().toISOString(),
      // Greeks (if available in quote data)
      oi: quoteData.oi || 0, // Open Interest
      oiChange: quoteData.oi_day_high || 0
    };
  }

  /**
   * Get cached quote if fresh enough
   */
  getCached(instrumentKey) {
    const cached = this.cache.get(instrumentKey);
    
    if (!cached) {
      return null;
    }

    const age = Date.now() - cached.timestamp;
    
    if (age > this.cacheTimeout) {
      // Cache expired
      this.cache.delete(instrumentKey);
      return null;
    }

    return cached.data;
  }

  /**
   * Calculate estimated entry cost (including spread)
   */
  calculateEntryCost(quote, quantity, side = 'BUY') {
    if (side === 'BUY') {
      // For buying, we pay the ask price
      const price = quote.askPrice || quote.ltp;
      return {
        price,
        premium: price,
        quantity,
        totalPremium: price * quantity,
        spreadCost: quote.spread ? (quote.spread / 2) * quantity : 0,
        side: 'BUY'
      };
    } else {
      // For selling, we receive the bid price
      const price = quote.bidPrice || quote.ltp;
      return {
        price,
        premium: price,
        quantity,
        totalPremium: price * quantity,
        spreadCost: quote.spread ? (quote.spread / 2) * quantity : 0,
        side: 'SELL'
      };
    }
  }

  /**
   * Get best entry price recommendation
   * Returns either bid, ask, or mid depending on strategy
   */
  getBestEntryPrice(quote, side = 'BUY', aggressive = false) {
    if (aggressive) {
      // Aggressive: pay asking price to ensure fill
      return side === 'BUY' ? quote.askPrice : quote.bidPrice;
    } else {
      // Conservative: use mid-price or last traded price
      return quote.midPrice;
    }
  }

  /**
   * Check liquidity (bid-ask spread quality)
   */
  checkLiquidity(quote) {
    const spreadPercent = parseFloat(quote.spreadPercent);
    
    let quality;
    if (spreadPercent < 0.5) {
      quality = 'EXCELLENT';
    } else if (spreadPercent < 1.0) {
      quality = 'GOOD';
    } else if (spreadPercent < 2.0) {
      quality = 'FAIR';
    } else {
      quality = 'POOR';
    }

    return {
      quality,
      spreadPercent,
      spread: quote.spread,
      bidQty: quote.bidQty,
      askQty: quote.askQty,
      recommendation: quality === 'EXCELLENT' || quality === 'GOOD' 
        ? 'TRADE' 
        : 'CAUTION'
    };
  }

  /**
   * Get real-time NIFTY/BANKNIFTY spot price
   */
  async getSpotPrice(symbol = 'NIFTY') {
    try {
      // Instrument keys for spot indices
      const instrumentKeys = {
        'NIFTY': 'NSE_INDEX|Nifty 50',
        'BANKNIFTY': 'NSE_INDEX|Nifty Bank'
      };

      const instrumentKey = instrumentKeys[symbol];
      
      if (!instrumentKey) {
        throw new Error(`Invalid symbol: ${symbol}`);
      }

      const baseUrl = this.config.upstox.useSandbox 
        ? this.config.upstox.sandboxUrl 
        : this.config.upstox.baseUrl;
      
      const url = `${baseUrl}/market-quote/quotes`;
      
      const response = await axios.get(url, {
        params: {
          instrument_key: instrumentKey
        },
        headers: {
          'Authorization': `Bearer ${this.config.upstox.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      // Log full response for debugging (first time only)
      if (!this._loggedResponse) {
        logger.info('Market quote API response structure', {
          status: response.data?.status,
          dataKeys: response.data?.data ? Object.keys(response.data.data) : [],
          sampleData: response.data?.data ? JSON.stringify(response.data.data).substring(0, 500) : null
        });
        this._loggedResponse = true;
      }

      if (response.data && response.data.status === 'success') {
        // The response uses colon (:) in keys but subscription uses pipe (|)
        // Try both formats
        let data = response.data.data[instrumentKey];
        
        if (!data) {
          // Try with colon instead of pipe
          const alternateKey = instrumentKey.replace('|', ':');
          data = response.data.data[alternateKey];
          
          if (data) {
            logger.debug('Found data with alternate key format', {
              requested: instrumentKey,
              found: alternateKey
            });
          }
        }
        
        if (!data) {
          logger.error('Instrument data not found in response', {
            instrumentKey,
            availableKeys: Object.keys(response.data.data || {})
          });
          throw new Error(`No data for instrument: ${instrumentKey}`);
        }
        
        // Try different field names for LTP
        const ltp = data.last_price || data.ltp || data.ohlc?.close || 0;
        
        if (ltp === 0) {
          logger.warn('LTP is zero or missing - response structure may have changed', {
            dataKeys: Object.keys(data),
            sample: JSON.stringify(data).substring(0, 200)
          });
        }
        
        return {
          symbol,
          ltp,
          change: data.net_change || data.change || 0,
          changePercent: data.change_percent || data.change_percentage || 0,
          timestamp: new Date().toISOString(),
          _rawKeys: Object.keys(data) // For debugging
        };
      } else {
        throw new Error('Invalid response from market quote API');
      }

    } catch (error) {
      logger.error('Failed to fetch spot price', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Option quote cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      instruments: Array.from(this.cache.keys())
    };
  }
}

export default OptionChainFetcher;
