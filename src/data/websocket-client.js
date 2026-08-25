import WebSocket from 'ws';
import axios from 'axios';
import protobuf from 'protobufjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Upstox WebSocket Client for Real-Time Market Data
 * 
 * Uses official Upstox protobuf schema for V3 WebSocket API
 * Properly decodes binary market data messages
 * 
 * IMPORTANT: Upstox V3 sends data in Google Protocol Buffers format
 * This requires the official .proto schema file to decode messages correctly
 */
export class UpstoxWebSocketClient extends EventEmitter {
  constructor(accessToken, config = {}) {
    super();
    
    this.accessToken = accessToken;
    this.config = {
      authorizeUrl: config.authorizeUrl || 'https://api.upstox.com/v3/feed/market-data-feed/authorize',
      reconnectDelay: config.reconnectDelay || 5000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
      heartbeatInterval: config.heartbeatInterval || 30000,
      useMock: config.useMock || false, // Use mock data for testing
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
    this.mockTickInterval = null;
    this.authorizedWebSocketUrl = null; // Signed URL from authorize endpoint
    this.protobufRoot = null; // Protobuf schema root
    this.tickCount = 0; // Track number of ticks received
    this.mockBasePrice = 24500; // Default base price, will be updated with real price
    this.mockSessionOpen = null; // Track session open for OHLC
    this.mockSessionHigh = null; // Track session high
    this.mockSessionLow = null; // Track session low

    // ── Stale data detection ─────────────────────────────────────────────────
    this.lastTickAt = null;           // Timestamp of most recent tick
    this.stalenessThreshold = 60000;  // 60 s without a tick = stale
    this.stalenessCheckMs = 30000;    // Check every 30 s
    this.stalenessTimer = null;       // setInterval handle
  }

  /**
   * Initialize protobuf schema
   * Must be called before connect()
   */
  async initProtobuf() {
    try {
      // Load the protobuf schema from SDK
      const protoPath = path.resolve(
        __dirname,
        '../../node_modules/upstox-js-sdk/dist/feeder/proto/MarketDataFeedV3.proto'
      );
      
      logger.info('Loading protobuf schema', { path: protoPath });
      
      this.protobufRoot = await protobuf.load(protoPath);
      
      logger.info('✅ Protobuf schema loaded successfully');
      
    } catch (error) {
      logger.error('Failed to load protobuf schema', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Step 1: Call authorize endpoint to get signed WebSocket URL
   * 
   * This must be called BEFORE attempting WebSocket connection
   * The returned URL is single-use and short-lived
   */
  async authorizeWebSocket() {
    try {
      logger.info('Calling WebSocket authorize endpoint', {
        url: this.config.authorizeUrl
      });

      const response = await axios.get(this.config.authorizeUrl, {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      if (response.data && response.data.data && response.data.data.authorized_redirect_uri) {
        this.authorizedWebSocketUrl = response.data.data.authorized_redirect_uri;
        
        logger.info('WebSocket authorization successful', {
          url: this.authorizedWebSocketUrl.substring(0, 50) + '...' // Log first 50 chars only
        });
        
        return this.authorizedWebSocketUrl;
      } else {
        throw new Error('Invalid authorize response - missing authorized_redirect_uri');
      }

    } catch (error) {
      logger.error('WebSocket authorization failed', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        errorDetails: JSON.stringify(error.response?.data?.errors || [])
      });
      throw error;
    }
  }

  /**
   * Step 2: Connect to Upstox WebSocket using authorized URL
   * 
   * IMPORTANT: Must call initProtobuf() and authorizeWebSocket() first
   * Do NOT reuse URLs - each connection requires a fresh authorize call
   */
  async connect() {
    // Use mock mode if enabled
    if (this.config.useMock) {
      return this.connectMock();
    }

    return new Promise(async (resolve, reject) => {
      try {
        // Step 0: Initialize protobuf if not already done
        if (!this.protobufRoot) {
          await this.initProtobuf();
        }

        // Step 1: Get authorized WebSocket URL
        const authorizedUrl = await this.authorizeWebSocket();
        
        logger.info('Connecting to authorized WebSocket URL');
        
        // Step 2: Connect to the signed URL (do NOT add token - already signed)
        this.ws = new WebSocket(authorizedUrl, {
          followRedirects: true
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          logger.info('✅ WebSocket connected successfully');
          
          // Start heartbeat
          this.startHeartbeat();
          
          // CRITICAL: Wait 1 second before allowing subscriptions
          // The Upstox server needs time to initialize the connection
          // before it can process subscription messages (per official SDK example)
          setTimeout(() => {
            logger.info('WebSocket ready to accept subscriptions');
            
            // Resubscribe if this is a reconnection
            if (this.subscriptions.size > 0) {
              this.resubscribe();
            }

            // Start staleness watch
            this.startStalenessWatch();
            
            this.emit('connected');
            resolve();
          }, 1000);
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
          this.stopStalenessWatch();
          
          // Clear the authorized URL - it's single-use
          this.authorizedWebSocketUrl = null;
          
          logger.warn('WebSocket closed', { 
            code, 
            reason: reason.toString(),
            intentional: this.isIntentionalClose,
            ticksReceived: this.tickCount
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
        logger.error('Failed to connect to WebSocket', { 
          error: error.message,
          stack: error.stack
        });
        reject(error);
      }
    });
  }

  /**
   * Connect in mock mode (for testing without real WebSocket)
   */
  async connectMock() {
    logger.warn('⚠️  Using MOCK WebSocket mode - simulated market data for testing');
    
    return new Promise((resolve) => {
      setTimeout(() => {
        this.isConnected = true;
        this.mockBasePrice = 22000; // Starting NIFTY price
        this.startStalenessWatch();
        logger.info('Mock WebSocket connected successfully');
        this.emit('connected');
        resolve();
      }, 100);
    });
  }

  /**
   * Start staleness watchdog.
   * If no tick arrives within stalenessThreshold ms, emit 'stale' event.
   * Only alerts when the market is expected to be open (between 09:00–15:35 IST).
   */
  startStalenessWatch() {
    this.stopStalenessWatch(); // clear any existing timer
    this.lastTickAt = Date.now(); // reset on (re)connect

    this.stalenessTimer = setInterval(() => {
      if (!this.isConnected) return;

      // Only warn during expected market hours (09:00–15:35 IST)
      const now = new Date();
      const istHour = (now.getUTCHours() + 5) % 24 + (now.getUTCMinutes() >= 30 ? 0 : -1) + 5;
      const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
      const istMinutes = (utcMinutes + 330) % 1440; // IST = UTC+5:30
      const marketStart = 9 * 60;   // 09:00 IST
      const marketEnd   = 15 * 60 + 35; // 15:35 IST

      if (istMinutes < marketStart || istMinutes > marketEnd) return;

      const msSinceLastTick = Date.now() - (this.lastTickAt || 0);
      if (msSinceLastTick > this.stalenessThreshold) {
        logger.error('🚨 STALE DATA: No tick received for ' + Math.round(msSinceLastTick / 1000) + 's — WebSocket may be silent', {
          lastTickAt: this.lastTickAt ? new Date(this.lastTickAt).toISOString() : 'never',
          thresholdSec: this.stalenessThreshold / 1000
        });
        this.emit('stale', { msSinceLastTick, lastTickAt: this.lastTickAt });
      }
    }, this.stalenessCheckMs);

    logger.debug('Staleness watchdog started', {
      thresholdSec: this.stalenessThreshold / 1000,
      checkIntervalSec: this.stalenessCheckMs / 1000
    });
  }

  stopStalenessWatch() {
    if (this.stalenessTimer) {
      clearInterval(this.stalenessTimer);
      this.stalenessTimer = null;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(data) {
    try {
      // All V3 WebSocket messages are binary protobuf format
      if (!Buffer.isBuffer(data)) {
        logger.warn('Received non-buffer data - unexpected', {
          type: typeof data
        });
        return;
      }
      
      // Decode using official protobuf schema
      const decoded = this.decodeProtobuf(data);
      
      if (!decoded) {
        logger.warn('Failed to decode protobuf message');
        return;
      }

      // Log first few ticks with full details for verification
      if (this.tickCount < 5) {
        logger.info(`✅ VERIFIED TICK #${this.tickCount + 1}`, {
          decoded: JSON.stringify(decoded, null, 2)
        });
      } else if (this.tickCount === 5) {
        logger.info('First 5 ticks logged - switching to standard logging');
      }

      this.tickCount++;

      // Process based on message type
      // Upstox protobuf has a 'feeds' field with market data
      if (decoded.feeds && Object.keys(decoded.feeds).length > 0) {
        logger.info('🟢 LIVE_FEED MESSAGE RECEIVED', {
          feedCount: Object.keys(decoded.feeds).length,
          instruments: Object.keys(decoded.feeds),
          type: decoded.type
        });
        
        for (const [instrumentKey, feedData] of Object.entries(decoded.feeds)) {
          // Convert protobuf feed data to our tick format
          const tick = this.convertFeedToTick(instrumentKey, feedData);
          
          // Log first few ticks with full details
          if (this.tickCount < 5) {
            logger.info(`🟢 WEBSOCKET TICK #${this.tickCount + 1} PARSED`, {
              instrumentKey,
              ltp: tick.ltp,
              open: tick.open,
              high: tick.high,
              low: tick.low,
              volume: tick.volume,
              timestamp: tick.timestamp
            });
          }
          
          // Log every 10th tick for monitoring
          if (this.tickCount % 10 === 0 && this.tickCount > 0) {
            logger.debug('Tick data', {
              count: this.tickCount,
              instrumentKey,
              ltp: tick.ltp,
              volume: tick.volume
            });
          }
          
          this.lastTickAt = Date.now(); // ← staleness watchdog heartbeat
          this.emit('tick', tick);
          
          // Buffer ticks for potential replay during reconnection
          this.tickBuffer.push(tick);
          if (this.tickBuffer.length > 1000) {
            this.tickBuffer.shift(); // Keep only last 1000 ticks
          }
        }
      } else {
        // Other message types (acknowledgements, errors, market info)
        if (decoded.type === 'market_info') {
          logger.debug('Market info received', {
            segmentStatus: decoded.marketInfo?.segmentStatus
          });
        } else {
          logger.debug('Non-feed message received', {
            type: decoded.type,
            hasFeeds: !!decoded.feeds,
            feedCount: decoded.feeds ? Object.keys(decoded.feeds).length : 0,
            keys: Object.keys(decoded)
          });
        }
        this.emit('message', decoded);
      }

    } catch (error) {
      logger.error('Failed to handle WebSocket message', { 
        error: error.message,
        stack: error.stack
      });
      this.emit('parse_error', error);
    }
  }

  /**
   * Decode binary protobuf message using official Upstox schema
   */
  decodeProtobuf(buffer) {
    try {
      if (!this.protobufRoot) {
        logger.error('Protobuf schema not initialized - cannot decode');
        return null;
      }

      // Look up the FeedResponse message type
      const FeedResponse = this.protobufRoot.lookupType(
        'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse'
      );
      
      // Decode the buffer
      const message = FeedResponse.decode(buffer);
      
      // Convert to plain object
      const object = FeedResponse.toObject(message, {
        longs: Number, // Convert Long to Number
        enums: String, // Convert enums to strings
        bytes: String, // Convert bytes to strings
        defaults: true, // Include default values
        arrays: true, // Populate arrays
        objects: true, // Populate objects
        oneofs: true // Set virtual oneof properties
      });
      
      return object;

    } catch (error) {
      logger.error('Protobuf decode failed', {
        error: error.message,
        stack: error.stack,
        bufferLength: buffer.length
      });
      return null;
    }
  }

  /**
   * Convert protobuf feed data to our standard tick format
   */
  convertFeedToTick(instrumentKey, feedData) {
    // feedData structure based on proto schema:
    // Feed { ltpc | fullFeed | firstLevelWithGreeks, requestMode }
    
    // Extract the feed union (one of: ltpc, fullFeed, firstLevelWithGreeks)
    let ltpc = null;
    let ohlc = null;
    let marketLevel = null;
    let oi = 0;
    let volume = 0;
    
    // Check which feed type we received
    if (feedData.ltpc) {
      // Simple LTPC feed
      ltpc = feedData.ltpc;
    } else if (feedData.fullFeed) {
      // Full feed (either marketFF or indexFF)
      if (feedData.fullFeed.indexFF) {
        // Index Full Feed
        ltpc = feedData.fullFeed.indexFF.ltpc;
        if (feedData.fullFeed.indexFF.marketOHLC && feedData.fullFeed.indexFF.marketOHLC.ohlc && feedData.fullFeed.indexFF.marketOHLC.ohlc.length > 0) {
          ohlc = feedData.fullFeed.indexFF.marketOHLC.ohlc[0]; // Get first OHLC
        }
      } else if (feedData.fullFeed.marketFF) {
        // Market Full Feed (options, stocks)
        ltpc = feedData.fullFeed.marketFF.ltpc;
        marketLevel = feedData.fullFeed.marketFF.marketLevel;
        oi = feedData.fullFeed.marketFF.oi || 0;
        volume = feedData.fullFeed.marketFF.vtt || 0;
        if (feedData.fullFeed.marketFF.marketOHLC && feedData.fullFeed.marketFF.marketOHLC.ohlc && feedData.fullFeed.marketFF.marketOHLC.ohlc.length > 0) {
          ohlc = feedData.fullFeed.marketFF.marketOHLC.ohlc[0];
        }
      }
    } else if (feedData.firstLevelWithGreeks) {
      // First level with Greeks (options)
      ltpc = feedData.firstLevelWithGreeks.ltpc;
      oi = feedData.firstLevelWithGreeks.oi || 0;
      volume = feedData.firstLevelWithGreeks.vtt || 0;
    }
    
    // Extract bid/ask from market level
    let bid = 0;
    let ask = 0;
    let bidQty = 0;
    let askQty = 0;
    
    if (marketLevel && marketLevel.bidAskQuote && marketLevel.bidAskQuote.length > 0) {
      const firstLevel = marketLevel.bidAskQuote[0];
      bid = firstLevel.bidP || 0;
      ask = firstLevel.askP || 0;
      bidQty = firstLevel.bidQ || 0;
      askQty = firstLevel.askQ || 0;
    }
    
    // Build tick object
    const currentLtp = ltpc?.ltp || ltpc?.cp || 0;
    
    return {
      instrumentKey,
      timestamp: new Date().toISOString(),
      
      // Last traded price data
      ltp: currentLtp,
      ltq: ltpc?.ltq || 0,
      ltt: ltpc?.ltt || null,
      
      // Volume
      volume,
      
      // OHLC (from protobuf OHLC if available)
      open: ohlc?.open || currentLtp,
      high: ohlc?.high || currentLtp,
      low: ohlc?.low || currentLtp,
      close: ohlc?.close || currentLtp,
      
      // Bid/Ask
      bid: bid || currentLtp * 0.999,
      ask: ask || currentLtp * 1.001,
      bidQty,
      askQty,
      
      // Open Interest
      oi,
      oiDayHigh: 0, // Not available in V3
      oiDayLow: 0,  // Not available in V3
      
      // Raw protobuf data for debugging
      _raw: feedData
    };
  }

  /**
   * Parse binary message from Upstox
   * Format: https://upstox.com/developer/api-documentation/websocket
   * 
   * @deprecated - Use decodeProtobuf() instead
   */
  parseBinaryMessage(buffer) {
    // This method is deprecated - protobuf decoding happens in decodeProtobuf()
    logger.warn('parseBinaryMessage() is deprecated - use decodeProtobuf()');
    return this.decodeProtobuf(buffer);
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

    // Mock mode
    if (this.config.useMock) {
      return this.subscribeMock(instrumentKeys);
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
      // Log exact payload being sent
      logger.info('📤 SENDING SUBSCRIPTION MESSAGE', {
        payload: subscribeMessage,
        payloadString: JSON.stringify(subscribeMessage)
      });
      
      // Send as Buffer (matching SDK example)
      this.ws.send(Buffer.from(JSON.stringify(subscribeMessage)));
      
      // Track subscriptions
      instrumentKeys.forEach(key => this.subscriptions.add(key));
      
      logger.info('✅ Subscription message sent', { instrumentKeys });
      return true;
    } catch (error) {
      logger.error('Failed to subscribe', { error: error.message });
      return false;
    }
  }

  /**
   * Subscribe in mock mode
   */
  async subscribeMock(instrumentKeys) {
    // Track subscriptions
    instrumentKeys.forEach(key => this.subscriptions.add(key));
    
    logger.info('Mock subscribed to instruments', { instrumentKeys });
    
    // Fetch real market price before starting mock ticks
    if (!this.mockTickInterval) {
      await this.fetchRealBasePriceForMock();
      this.startMockTicks();
    }
    
    return true;
  }

  /**
   * Fetch real NIFTY price to use as base for mock data
   */
  async fetchRealBasePriceForMock() {
    try {
      logger.info('Fetching real NIFTY price for mock base...');
      
      const response = await axios.get('https://api.upstox.com/v2/market-quote/quotes', {
        params: {
          instrument_key: 'NSE_INDEX|Nifty 50'
        },
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      if (response.data && response.data.status === 'success') {
        const data = response.data.data['NSE_INDEX:Nifty 50'];
        const realPrice = data?.last_price || data?.ltp || data?.ohlc?.close || 24500;
        
        this.mockBasePrice = realPrice;
        this.mockSessionOpen = realPrice; // Set session open
        this.mockSessionHigh = realPrice; // Initialize high
        this.mockSessionLow = realPrice; // Initialize low
        
        logger.info('✅ Mock base price synced with real market', {
          realPrice: this.mockBasePrice,
          source: 'Upstox API'
        });
      } else {
        logger.warn('Could not fetch real price, using default', {
          default: this.mockBasePrice
        });
      }
    } catch (error) {
      logger.warn('Failed to fetch real NIFTY price for mock, using default', {
        error: error.message,
        default: this.mockBasePrice
      });
    }
  }

  /**
   * Generate mock market ticks
   */
  startMockTicks() {
    logger.info('Starting mock tick generation (1 tick per second)', {
      basePrice: this.mockBasePrice
    });
    
    this.mockTickInterval = setInterval(() => {
      // Generate realistic price movement
      const volatility = 0.0005; // 0.05% per tick
      const drift = (Math.random() - 0.5) * 2 * volatility;
      this.mockBasePrice = this.mockBasePrice * (1 + drift);
      
      // Track session high/low
      if (!this.mockSessionHigh || this.mockBasePrice > this.mockSessionHigh) {
        this.mockSessionHigh = this.mockBasePrice;
      }
      if (!this.mockSessionLow || this.mockBasePrice < this.mockSessionLow) {
        this.mockSessionLow = this.mockBasePrice;
      }
      
      // Generate tick for each subscribed instrument
      for (const instrumentKey of this.subscriptions) {
        const tick = {
          instrumentKey,
          timestamp: new Date().toISOString(),
          ltp: Math.round(this.mockBasePrice * 100) / 100,
          ltq: Math.floor(Math.random() * 100) + 1,
          volume: Math.floor(Math.random() * 10000),
          bid: Math.round((this.mockBasePrice * 0.999) * 100) / 100,
          ask: Math.round((this.mockBasePrice * 1.001) * 100) / 100,
          bidQty: Math.floor(Math.random() * 500),
          askQty: Math.floor(Math.random() * 500),
          open: this.mockSessionOpen || this.mockBasePrice,
          high: this.mockSessionHigh || this.mockBasePrice,
          low: this.mockSessionLow || this.mockBasePrice,
          close: this.mockBasePrice,
          oiDayHigh: 0,
          oiDayLow: 0
        };
        
        this.emit('tick', tick);
      }
    }, 1000); // 1 tick per second
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
   * 
   * IMPORTANT: Each reconnection requires a fresh authorize call
   * Do NOT reuse the previous authorized URL
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
    
    logger.info('Attempting to reconnect (will call authorize endpoint again)', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      delayMs: delay
    });

    this.reconnectTimer = setTimeout(() => {
      // Connect will automatically call authorizeWebSocket() again
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
