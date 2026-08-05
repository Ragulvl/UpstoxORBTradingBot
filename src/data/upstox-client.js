import axios from 'axios';
import { format, subMonths } from 'date-fns';

class UpstoxClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    
    // Split URLs: production for market data, sandbox for orders
    this.productionUrl = config.upstox.baseUrl || 'https://api.upstox.com/v2';
    this.sandboxUrl = config.upstox.orders?.sandboxUrl || config.upstox.sandboxUrl || 'https://api-hft.upstox.com';
    
    // Split tokens: production for market data, sandbox for orders
    this.productionToken = config.upstox.marketData?.accessToken || config.upstox.accessToken;
    this.sandboxToken = config.upstox.orders?.accessToken || config.upstox.accessToken;
    
    // Whether to use sandbox for orders
    this.useSandboxForOrders = config.upstox.orders?.useSandbox !== false;
    
    this.logger.info('UpstoxClient initialized', {
      productionUrl: this.productionUrl,
      sandboxUrl: this.sandboxUrl,
      useSandboxForOrders: this.useSandboxForOrders,
      hasProductionToken: !!this.productionToken,
      hasSandboxToken: !!this.sandboxToken
    });
  }

  getHeaders(isOrder = false, isPost = false) {
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${isOrder && this.useSandboxForOrders ? this.sandboxToken : this.productionToken}`
    };

    if (isOrder) {
      headers['X-Algo-Name'] = 'ORB-Strategy-v1';
    }
    if (isPost) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }
  
  getBaseUrl(isOrder = false) {
    return (isOrder && this.useSandboxForOrders) ? this.sandboxUrl : this.productionUrl;
  }

  async getHistoricalData(instrument, interval, fromDate, toDate) {
    try {
      this.logger.info(`Fetching historical data for ${instrument}`, {
        interval,
        fromDate,
        toDate
      });

      // IMPORTANT: Historical data is read-only market data - always use production API
      const productionBaseUrl = 'https://api.upstox.com';
      
      // Upstox V3 historical data endpoint format:
      // https://api.upstox.com/v3/historical-candle/{instrument_key}/minutes/{interval}/{to_date}/{from_date}
      
      const instrumentKey = this.getInstrumentKey(instrument);
      
      // Extract just the number from interval (e.g., "1minute" -> "1")
      const intervalMinutes = interval.replace('minute', '');
      
      const url = `${productionBaseUrl}/v3/historical-candle/${instrumentKey}/minutes/${intervalMinutes}/${toDate}/${fromDate}`;

      this.logger.debug('Historical data request (production)', { url });

      const response = await axios.get(url, {
        headers: this.getHeaders(false) // Use production token
      });

      if (response.data.status === 'success') {
        const candles = response.data.data?.candles || [];
        return this.parseHistoricalData(candles);
      } else {
        throw new Error(`API error: ${response.data.message || 'Unknown error'}`);
      }
    } catch (error) {
      this.logger.error('Error fetching historical data', {
        instrument,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  parseHistoricalData(candles) {
    // Candles format: [timestamp, open, high, low, close, volume, oi]
    return candles.map(candle => ({
      timestamp: new Date(candle[0]),
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5],
      oi: candle[6]
    }));
  }

  getInstrumentKey(symbol) {
    // This is a simplified mapping - in production, you'd fetch this from instrument master
    // Format: NSE_INDEX|{symbol}
    const mapping = {
      'NIFTY': 'NSE_INDEX|Nifty 50',
      'BANKNIFTY': 'NSE_INDEX|Nifty Bank',
      'FINNIFTY': 'NSE_INDEX|Nifty Fin Service'
    };

    return mapping[symbol] || symbol;
  }

  async getInstrumentMaster() {
    try {
      this.logger.info('Fetching instrument master (production)');
      
      const url = `${this.getBaseUrl(false)}/market-quote/instruments`;
      const response = await axios.get(url, {
        headers: this.getHeaders(false) // Use production token
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error fetching instrument master', {
        error: error.message
      });
      throw error;
    }
  }

  async getOptionChain(symbol, expiryDate) {
    try {
      this.logger.info(`Fetching option chain for ${symbol} (production)`, { expiryDate });
      
      const url = `${this.getBaseUrl(false)}/option-chain`;
      const response = await axios.get(url, {
        headers: this.getHeaders(false), // Use production token
        params: {
          instrument_key: this.getInstrumentKey(symbol),
          expiry_date: expiryDate
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error fetching option chain', {
        symbol,
        error: error.message
      });
      throw error;
    }
  }

  async placeOrder(orderParams) {
    try {
      this.logger.info('Placing order (sandbox)', { 
        orderParams,
        url: this.getBaseUrl(true)
      });
      
      // Use sandbox endpoint and token for orders
      // NOTE: api-hft.upstox.com requires the /v2 version prefix (sandboxUrl has no version)
      const url = `${this.getBaseUrl(true)}/order/place`;
      
      const response = await axios.post(url, orderParams, {
        headers: this.getHeaders(true, true) // Use sandbox token + Content-Type
      });

      this.logger.order('Order placed', {
        orderId: response.data.data.order_id,
        params: orderParams
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error placing order', {
        orderParams,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      this.logger.info('Modifying order (sandbox)', { orderId, modifications });
      
      const url = `${this.getBaseUrl(true)}/order/modify`;
      
      const response = await axios.put(url, {
        order_id: orderId,
        ...modifications
      }, {
        headers: this.getHeaders(true, true) // Use sandbox token + Content-Type
      });

      this.logger.order('Order modified', { orderId, modifications });

      return response.data;
    } catch (error) {
      this.logger.error('Error modifying order', {
        orderId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async cancelOrder(orderId) {
    try {
      this.logger.info('Cancelling order (sandbox)', { orderId });
      
      const url = `${this.getBaseUrl(true)}/order/cancel`;
      
      const response = await axios.delete(url, {
        headers: this.getHeaders(true), // Use sandbox token
        data: { order_id: orderId }
      });

      this.logger.order('Order cancelled', { orderId });

      return response.data;
    } catch (error) {
      this.logger.error('Error cancelling order', {
        orderId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const url = `${this.getBaseUrl(true)}/order/history`;
      
      const response = await axios.get(url, {
        headers: this.getHeaders(true), // Use sandbox token
        params: { order_id: orderId }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting order status', {
        orderId,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async getPositions() {
    try {
      const url = `${this.getBaseUrl(true)}/portfolio/short-term-positions`;
      
      const response = await axios.get(url, {
        headers: this.getHeaders(true) // Use sandbox token
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting positions', {
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }
}

export default UpstoxClient;
