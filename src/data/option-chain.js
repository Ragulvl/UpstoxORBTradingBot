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
  }

  /**
   * Get option chain for an instrument
   * Uses Upstox Market Quote API
   */
  async getOptionQuote(instrumentKey) {
    try {
      // Check cache first
      const cached = this.getCached(instrumentKey);
      if (cached) {
        logger.debug('Using cached option quote', { instrumentKey });
        return cached;
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

      if (response.data && response.data.status === 'success') {
        const data = response.data.data[instrumentKey];
        return {
          symbol,
          ltp: data.last_price,
          change: data.net_change || 0,
          changePercent: data.change_percent || 0,
          timestamp: new Date().toISOString()
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
