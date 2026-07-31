import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Upstox WebSocket Client for Real-Time Market Data
 * 
 * Connects to Upstox WebSocket API and streams live tick data
 * Handles connection lifecycle, reconnection, and data parsing
 */
export class UpstoxWebSocketClient extends EventEmitter {
  constructor(accessToken, config = {}) {
    super();
    
    this.accessToken = accessToken;
    this.config = {
      url: config.url || 'wss://api-v2.upstox.com/feed/market-data-feed/v2',
      reconnectDelay: config.reconnectDelay || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
      ...config
    };
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.subscriptions = new Set();
    this.heartbeatTimer = null;
    this.reconnectTimer = null;
    this.tickBuffer = [];
    this.isIntentionalClose = false;
  }

  /**
   * Connect to Upstox WebSocket
   */
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = `${this.config.url}?access_token=${this.accessToken}`;
        
        logger.info('Connecting to Upstox WebSocket', { url: this.config.url });
        
        this.ws = new WebSocket(wsUrl, {
          headers: {
            'Api-Version': '2.0',
            'Authorization': `Bearer ${this.accessToken}`
          }
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('WebSocket connected successfully');
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Resubscribe if this is a reconnection
          if (this.subscriptions.size > 0) {
            this.resubscribe();
          }
          
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          logger.error('WebSocket error', { error: error.message });
          this.emit('error', error);
        });

        this.ws.on('close', (code, reason) => {
          this.isConnected = false;
          this.stopHeartbeat();
          
          logger.warn('WebSocket closed', { 
            code, 
            reason: reason.toString(),
            intentional: this.isIntentionalClose
          });
          
          this.emit('disconnected', { code, reason });
          
          // Auto-reconnect if not intentional close
          if (!this.isIntentionalClose) {
            this.attemptReconnect();
          }
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        logger.error('Failed to create WebSocket connection', { error: error.message });
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    try {
      // Parse binary or JSON message
      let message;
      
      if (Buffer.isBuffer(data)) {
        // Binary data - parse according to Upstox protocol
        message = this.parseBinaryMessage(data);
      } else {
        // JSON data
        message = JSON.parse(data.toString());
      }

      // Emit different events based on message type
      if (message.type === 'tick') {
        this.emit('tick', message.data);
        
        // Buffer ticks for potential replay during reconnection
        this.tickBuffer.push(message.data);
        if (this.tickBuffer.length > 1000) {
          this.tickBuffer.shift(); // Keep only last 1000 ticks
        }
      } else if (message.type === 'acknowledgement') {
        this.emit('acknowledgement', message.data);
        logger.info('Subscription acknowledged', message.data);
      } else if (message.type === 'error') {
        this.emit('message_error', message.data);
        logger.error('WebSocket message error', message.data);
      } else {
        // Unknown message type
        this.emit('message', message);
      }

    } catch (error) {
      logger.error('Failed to handle WebSocket message', { error: error.message });
      this.emit('parse_error', error);
    }
  }

  /**
   * Parse binary message from Upstox
   * Format: https://upstox.com/developer/api-documentation/websocket
   */
  parseBinaryMessage(buffer) {
    try {
      // Upstox sends protobuf binary data
      // For now, convert to JSON format
      // In production, use proper protobuf parser
      
      // Simplified parsing - replace with actual Upstox protocol
      const tick = {
        type: 'tick',
        data: {
          instrument_key: buffer.slice(0, 20).toString('utf8').trim(),
          ltp: buffer.readDoubleBE(20),
          volume: buffer.readUInt32BE(28),
          timestamp: new Date().toISOString()
        }
      };
      
      return tick;
    } catch (error) {
      logger.error('Failed to parse binary message', { error: error.message });
      return { type: 'error', data: { message: 'Parse error' } };
    }
  }

  /**
   * Subscribe to instrument(s)
   */
  subscribe(instrumentKeys) {
    if (!Array.isArray(instrumentKeys)) {
      instrumentKeys = [instrumentKeys];
    }

    if (!this.isConnected) {
      logger.warn('Cannot subscribe - not connected');
      return false;
    }

    const subscribeMessage = {
      guid: this.generateGuid(),
      method: 'sub',
      data: {
        mode: 'full',
        instrumentKeys: instrumentKeys
      }
    };

    try {
      this.ws.send(JSON.stringify(subscribeMessage));
      
      // Track subscriptions
      instrumentKeys.forEach(key => this.subscriptions.add(key));
      
      logger.info('Subscribed to instruments', { instrumentKeys });
      return true;
    } catch (error) {
      logger.error('Failed to subscribe', { error: error.message });
      return false;
    }
  }

  /**
   * Unsubscribe from instrument(s)
   */
  unsubscribe(instrumentKeys) {
    if (!Array.isArray(instrumentKeys)) {
      instrumentKeys = [instrumentKeys];
    }

    if (!this.isConnected) {
      logger.warn('Cannot unsubscribe - not connected');
      return false;
    }

    const unsubscribeMessage = {
      guid: this.generateGuid(),
      method: 'unsub',
      data: {
        mode: 'full',
        instrumentKeys: instrumentKeys
      }
    };

    try {
      this.ws.send(JSON.stringify(unsubscribeMessage));
      
      // Remove from tracked subscriptions
      instrumentKeys.forEach(key => this.subscriptions.delete(key));
      
      logger.info('Unsubscribed from instruments', { instrumentKeys });
      return true;
    } catch (error) {
      logger.error('Failed to unsubscribe', { error: error.message });
      return false;
    }
  }

  /**
   * Resubscribe to all previously subscribed instruments
   */
  resubscribe() {
    if (this.subscriptions.size === 0) {
      return;
    }

    const instrumentKeys = Array.from(this.subscriptions);
    logger.info('Resubscribing to instruments', { count: instrumentKeys.length });
    this.subscribe(instrumentKeys);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing timer
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.ping();
          logger.debug('Heartbeat sent');
        } catch (error) {
          logger.error('Heartbeat failed', { error: error.message });
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  attemptReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached - giving up', {
        attempts: this.reconnectAttempts
      });
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * this.reconnectAttempts;
    
    logger.info('Attempting to reconnect', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      delayMs: delay
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        logger.error('Reconnection failed', { error: error.message });
        this.attemptReconnect();
      });
    }, delay);
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    this.isIntentionalClose = true;
    
    this.stopHeartbeat();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    this.subscriptions.clear();
    
    logger.info('WebSocket disconnected intentionally');
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      subscriptions: Array.from(this.subscriptions),
      reconnectAttempts: this.reconnectAttempts,
      tickBufferSize: this.tickBuffer.length
    };
  }

  /**
   * Generate unique GUID for messages
   */
  generateGuid() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get buffered ticks (useful for replay after reconnection)
   */
  getBufferedTicks() {
    return [...this.tickBuffer];
  }

  /**
   * Clear tick buffer
   */
  clearTickBuffer() {
    this.tickBuffer = [];
  }
}

export default UpstoxWebSocketClient;
