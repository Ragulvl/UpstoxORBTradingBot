import axios from 'axios';
import { format, subMonths } from 'date-fns';

class UpstoxClient {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.baseUrl = config.upstox.useSandbox 
      ? config.upstox.sandboxUrl 
      : config.upstox.baseUrl;
    this.accessToken = config.upstox.accessToken;
  }

  getHeaders(isOrder = false) {
    const headers = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`
    };

    if (isOrder) {
      headers['X-Algo-Name'] = 'ORB-Strategy-v1';
    }

    return headers;
  }

  async getHistoricalData(instrument, interval, fromDate, toDate) {
    try {
      this.logger.info(`Fetching historical data for ${instrument}`, {
        interval,
        fromDate,
        toDate
      });

      // IMPORTANT: Historical data is NOT on sandbox - use production API
      // Even for sandbox projects, historical data is read-only and safe
      const productionBaseUrl = 'https://api.upstox.com';
      
      // Upstox V3 historical data endpoint format:
      // https://api.upstox.com/v3/historical-candle/{instrument_key}/minutes/{interval}/{to_date}/{from_date}
      
      const instrumentKey = this.getInstrumentKey(instrument);
      
      // Extract just the number from interval (e.g., "1minute" -> "1")
      const intervalMinutes = interval.replace('minute', '');
      
      const url = `${productionBaseUrl}/v3/historical-candle/${instrumentKey}/minutes/${intervalMinutes}/${toDate}/${fromDate}`;

      this.logger.debug('Historical data request', { url });

      const response = await axios.get(url, {
        headers: this.getHeaders()
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
      this.logger.info('Fetching instrument master');
      
      const url = `${this.baseUrl}/market-quote/instruments`;
      const response = await axios.get(url, {
        headers: this.getHeaders()
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
      this.logger.info(`Fetching option chain for ${symbol}`, { expiryDate });
      
      const url = `${this.baseUrl}/option-chain`;
      const response = await axios.get(url, {
        headers: this.getHeaders(),
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
      this.logger.info('Placing order', { orderParams });
      
      // Use sandbox endpoint for orders
      const url = `${this.baseUrl}/order/place`;
      
      const response = await axios.post(url, orderParams, {
        headers: this.getHeaders(true)
      });

      this.logger.order('Order placed', {
        orderId: response.data.data.order_id,
        params: orderParams
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error placing order', {
        orderParams,
        error: error.message
      });
      throw error;
    }
  }

  async modifyOrder(orderId, modifications) {
    try {
      this.logger.info('Modifying order', { orderId, modifications });
      
      const url = `${this.baseUrl}/order/modify`;
      
      const response = await axios.put(url, {
        order_id: orderId,
        ...modifications
      }, {
        headers: this.getHeaders(true)
      });

      this.logger.order('Order modified', { orderId, modifications });

      return response.data;
    } catch (error) {
      this.logger.error('Error modifying order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async cancelOrder(orderId) {
    try {
      this.logger.info('Cancelling order', { orderId });
      
      const url = `${this.baseUrl}/order/cancel`;
      
      const response = await axios.delete(url, {
        headers: this.getHeaders(true),
        data: { order_id: orderId }
      });

      this.logger.order('Order cancelled', { orderId });

      return response.data;
    } catch (error) {
      this.logger.error('Error cancelling order', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async getOrderStatus(orderId) {
    try {
      const url = `${this.baseUrl}/order/history`;
      
      const response = await axios.get(url, {
        headers: this.getHeaders(),
        params: { order_id: orderId }
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting order status', {
        orderId,
        error: error.message
      });
      throw error;
    }
  }

  async getPositions() {
    try {
      const url = `${this.baseUrl}/portfolio/short-term-positions`;
      
      const response = await axios.get(url, {
        headers: this.getHeaders()
      });

      return response.data;
    } catch (error) {
      this.logger.error('Error getting positions', {
        error: error.message
      });
      throw error;
    }
  }
}

export default UpstoxClient;
