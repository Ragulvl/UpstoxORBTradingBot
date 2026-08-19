import { EventEmitter } from 'events';
import { format } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { toIST, getPreviousTradingDay } from '../utils/date-utils.js';
import GoldenRatioStrategy from '../strategy/golden-ratio-strategy.js';

/**
 * Bot Engine - Core Orchestrator
 * 
 * Main state machine for live trading:
 * - PRE_MARKET → CALCULATING_OR → MONITORING → POSITION_OPEN → POSITION_CLOSED → POST_MARKET
 * 
 * Responsibilities:
 * - Opening range calculation (9:15-9:30)
 * - Golden Ratio level calculation
 * - Real-time candle monitoring
 * - Entry/exit signal detection
 * - Order execution coordination
 * - State management
 */
export class BotEngine extends EventEmitter {
  constructor(components) {
    super();
    
    // Inject dependencies
    this.config = components.config;
    this.sessionManager = components.sessionManager;
    this.candleBuilder = components.candleBuilder;
    this.candleHistory = components.candleHistory;
    this.instrumentMaster = components.instrumentMaster;
    this.optionChain = components.optionChain;
    this.orderManager = components.orderManager;
    this.positionTracker = components.positionTracker;
    this.costCalculator = components.costCalculator;
    this.tradeJournal = components.tradeJournal;
    this.riskManager = components.riskManager;
    // FIX: upstoxClient was missing — needed by fetchPreviousDayData() for historical API fallback
    this.upstoxClient = components.upstoxClient;
    
    // Initialize strategy
    this.strategy = new GoldenRatioStrategy(this.config, logger);
    
    // State machine
    this.state = 'PRE_MARKET';
    this.isRunning = false;
    
    // Trading state
    this.openingRange = null;
    this.goldenRatioLevels = null;
    this.previousDayData = null;
    this.currentPosition = null;
    this.spotPrice = null;
    this.selectedInstrument = null;
    
    // Guard: prevents double-close race condition when stop_loss_hit event
    // and candle update loop both trigger closePosition() simultaneously.
    this._closingPosition = false;
    
    // Timers
    this.stateCheckInterval = null;
    this.killSwitchCheckInterval = null;
    
    logger.info('Bot engine initialized');
  }

  /**
   * Start the bot engine
   */
  async start() {
    if (this.isRunning) {
      logger.warn('Bot engine already running');
      return;
    }

    logger.info('🚀 Starting bot engine');
    
    this.isRunning = true;
    this.state = 'PRE_MARKET';

    // Start monitoring
    this.startStateMonitoring();
    this.startKillSwitchMonitoring();

    // Listen to candle events
    this.candleBuilder.on('candle', (candle) => this.onCandleComplete(candle));

    // Listen to position events
    this.positionTracker.on('stop_loss_hit', (position) => this.onStopLossHit(position));
    this.positionTracker.on('target_hit', (position) => this.onTargetHit(position));

    // Check current session state
    await this.sessionManager.updateSessionStatus();
    
    if (this.sessionManager.isMarketHours) {
      this.state = 'MARKET_OPEN';
      await this.onMarketOpen();
    }

    this.emit('started');
    logger.info('✅ Bot engine started', { state: this.state });
  }

  /**
   * Stop the bot engine
   */
  async stop() {
    logger.info('🛑 Stopping bot engine');
    
    this.isRunning = false;

    // Stop monitoring
    this.stopStateMonitoring();
    this.stopKillSwitchMonitoring();

    // Close any open positions
    if (this.currentPosition) {
      await this.closePosition('BOT_STOP');
    }

    this.emit('stopped');
    logger.info('Bot engine stopped');
  }

  /**
   * Start state monitoring loop
   */
  startStateMonitoring() {
    // Check state every 30 seconds
    this.stateCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;

      await this.checkAndUpdateState();
    }, 30000);
  }

  /**
   * Stop state monitoring
   */
  stopStateMonitoring() {
    if (this.stateCheckInterval) {
      clearInterval(this.stateCheckInterval);
      this.stateCheckInterval = null;
    }
  }

  /**
   * Start kill switch monitoring
   */
  startKillSwitchMonitoring() {
    logger.info('Starting kill switch monitoring (checking every 5 seconds)');
    
    // Check kill switch every 5 seconds
    this.killSwitchCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;

      logger.debug('Checking kill switch file...');
      const activated = await this.riskManager.checkKillSwitch();
      
      if (activated) {
        logger.error('🛑 Kill switch detected - stopping bot');
        await this.stop();
        
        // Exit the process after a short delay to allow cleanup
        setTimeout(() => {
          logger.info('🛑 Process exiting due to kill switch');
          process.exit(0);
        }, 1000);
      }
    }, 5000);
    
    logger.info('Kill switch monitoring started', {
      interval: '5 seconds',
      file: this.riskManager.killSwitchFile
    });
  }

  /**
   * Stop kill switch monitoring
   */
  stopKillSwitchMonitoring() {
    if (this.killSwitchCheckInterval) {
      clearInterval(this.killSwitchCheckInterval);
      this.killSwitchCheckInterval = null;
    }
  }

  /**
   * Check and update state based on time and market status
   */
  async checkAndUpdateState() {
    const sessionState = await this.sessionManager.updateSessionStatus();

    // Handle state transitions
    if (sessionState === 'MARKET_OPEN' && this.state === 'PRE_MARKET') {
      await this.transitionTo('MARKET_OPEN');
      await this.onMarketOpen();
    } else if (sessionState === 'MARKET_CLOSED' && this.state !== 'POST_MARKET') {
      await this.transitionTo('POST_MARKET');
      await this.onMarketClose();
    } else if (this.state === 'CALCULATING_OR') {
      await this.checkOpeningRangeComplete();
    } else if (this.state === 'MONITORING') {
      // Check if OR was missed (late start scenario)
      if (!this.openingRange) {
        await this.checkOpeningRangeComplete();
      }
      await this.checkHardExitTime();
    }
  }

  /**
   * Transition to new state
   */
  async transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;

    logger.info(`State transition: ${oldState} → ${newState}`);
    this.emit('state_changed', { from: oldState, to: newState });
  }

  /**
   * Market open handler
   */
  async onMarketOpen() {
    logger.info('📈 Market opened - starting trading session');

    await this.transitionTo('CALCULATING_OR');

    // Reset daily risk counters
    this.riskManager.resetDaily();
    
    // Fetch previous day data for Golden Ratio calculation
    await this.fetchPreviousDayData();

    // Get current spot price
    await this.updateSpotPrice();
  }

  /**
   * Fetch previous day's high/low/close for Golden Ratio
   */
  async fetchPreviousDayData() {
    logger.info('Fetching previous day data for Golden Ratio calculation');
    
    const underlying = this.config.trading.instruments[0] || 'NIFTY';
    const today = toIST(new Date());
    const prevTradingDay = getPreviousTradingDay(today);
    const prevDateStr = format(prevTradingDay, 'yyyy-MM-dd');
    
    logger.info('Previous trading day identified', { prevDateStr });
    
    // Step 1: Try local disk cache (data/NIFTY_YYYY-MM-DD.json)
    const cacheFile = path.join(process.cwd(), 'data', `${underlying}_${prevDateStr}.json`);
    let candles = null;
    
    try {
      if (fs.existsSync(cacheFile)) {
        const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
        // Cache stores arrays of candle objects with timestamp strings
        candles = raw.map(c => ({ ...c, timestamp: new Date(c.timestamp) }));
        logger.info('Previous day data loaded from local cache', {
          prevDateStr,
          candleCount: candles.length,
          source: 'DISK_CACHE'
        });
      }
    } catch (cacheErr) {
      logger.warn('Failed to read previous day cache file', {
        file: cacheFile,
        error: cacheErr.message
      });
    }
    
    // Step 2: Fall back to live historical API if cache miss
    if (!candles || candles.length === 0) {
      logger.info('Cache miss — fetching from historical API', { prevDateStr });
      try {
        candles = await this.upstoxClient.getHistoricalData(
          underlying,
          '1minute',
          prevDateStr,
          prevDateStr
        );
        logger.info('Previous day data fetched from API', {
          prevDateStr,
          candleCount: candles ? candles.length : 0,
          source: 'HISTORICAL_API'
        });
      } catch (apiErr) {
        logger.error('Historical API fetch failed for previous day data', {
          prevDateStr,
          error: apiErr.message
        });
        candles = null;
      }
    }
    
    // Step 3: Compute high/low/close — or block trading if data unavailable
    if (!candles || candles.length === 0) {
      logger.error(
        '⚠️  TRADING BLOCKED: Cannot fetch previous day data for Golden Ratio calculation. ' +
        'Bot will NOT enter any trades today. Restart with valid token or after cache is populated.',
        { prevDateStr, underlying }
      );
      this.previousDayData = null;
      return;
    }
    
    const high  = Math.max(...candles.map(c => c.high));
    const low   = Math.min(...candles.map(c => c.low));
    const close = candles[candles.length - 1].close;
    
    this.previousDayData = { high, low, close, range: high - low, date: prevDateStr };
    
    logger.info('✅ Previous day data ready for Golden Ratio', {
      prevDateStr,
      high:  high.toFixed(2),
      low:   low.toFixed(2),
      close: close.toFixed(2),
      range: (high - low).toFixed(2)
    });
  }

  /**
   * Update current spot price
   */
  async updateSpotPrice() {
    try {
      const underlying = this.config.trading.instruments[0] || 'NIFTY';
      const spotData = await this.optionChain.getSpotPrice(underlying);
      
      this.spotPrice = spotData.ltp;
      
      logger.info('🔴 SPOT PRICE UPDATED FROM REST API', {
        source: 'REST_API',
        underlying,
        ltp: this.spotPrice,
        method: 'updateSpotPrice()'
      });
    } catch (error) {
      logger.error('Failed to update spot price', {
        error: error.message
      });
    }
  }

  /**
   * Check if opening range calculation is complete
   */
  async checkOpeningRangeComplete() {
    const openingRangeDuration = this.config.trading.openingRangeDuration || 15;
    const marketOpen = this.config.trading.marketOpen || '09:15';
    
    const now = toIST(new Date());
    const currentTime = format(now, 'HH:mm');
    
    // Calculate end of opening range
    const [openHour, openMin] = marketOpen.split(':').map(Number);
    const orEndMin = openMin + openingRangeDuration;
    const orEndTime = `${openHour.toString().padStart(2, '0')}:${orEndMin.toString().padStart(2, '0')}`;
    
    // FIX: Validate by timestamp span, not just candle count.
    // A count check passes if 14 candles exist (14 minutes of data)
    // even though we need 15 minutes for an accurate opening range.
    const recentCandles = this.candleHistory.getRecentCandles(openingRangeDuration);
    let hasEnoughData = false;
    if (recentCandles.length >= openingRangeDuration) {
      // Verify the candles actually span the required duration
      const firstTs = recentCandles[0]?.timestamp;
      const lastTs = recentCandles[recentCandles.length - 1]?.timestamp;
      if (firstTs && lastTs) {
        const spanMinutes = (new Date(lastTs) - new Date(firstTs)) / 60000;
        hasEnoughData = spanMinutes >= openingRangeDuration - 1; // Allow 1-min tolerance
      }
    }
    
    if ((currentTime >= orEndTime || hasEnoughData) && !this.openingRange) {
      await this.calculateOpeningRange();
      await this.transitionTo('MONITORING');
    }
  }

  /**
   * Calculate opening range from candles
   */
  async calculateOpeningRange() {
    const openingRangeDuration = this.config.trading.openingRangeDuration || 15;
    const orCandles = this.candleHistory.getRecentCandles(openingRangeDuration);

    if (orCandles.length < openingRangeDuration) {
      logger.warn('Insufficient candles for opening range', {
        have: orCandles.length,
        need: openingRangeDuration
      });
      return;
    }

    const high = Math.max(...orCandles.map(c => c.high));
    const low = Math.min(...orCandles.map(c => c.low));

    this.openingRange = {
      high,
      low,
      range: high - low,
      start: orCandles[0].timestamp,
      end: orCandles[orCandles.length - 1].timestamp
    };

    logger.info('Opening range calculated', this.openingRange);

    // Calculate Golden Ratio levels
    this.calculateGoldenRatioLevels();

    this.emit('opening_range_calculated', this.openingRange);
  }

  /**
   * Calculate Golden Ratio entry levels
   */
  calculateGoldenRatioLevels() {
    if (!this.openingRange) {
      return;
    }

    // CRITICAL: If previous day data is unavailable, we cannot compute Golden Ratio
    // levels. Leaving goldenRatioLevels = null causes checkEntrySignal() to block
    // trading — intentionally. Do NOT fall back to an unvalidated formula.
    if (!this.previousDayData) {
      logger.error(
        '⚠️  Golden Ratio levels NOT calculated: previous day data unavailable. ' +
        'No trades will be placed today.',
        { openingRange: this.openingRange }
      );
      this.goldenRatioLevels = null;
      return;
    }

    const fibLevel = this.config.goldenRatio?.fibonacciLevel || 0.618;

    // Exact formula from GoldenRatioStrategy (the backtest-validated version):
    //   buffer = prevDayRange * fibLevel * 0.1
    //   longEntry  = openingRange.high + buffer
    //   shortEntry = openingRange.low  - buffer
    const fibRange = this.previousDayData.range * fibLevel;
    const buffer   = fibRange * 0.1;

    this.goldenRatioLevels = {
      longEntry:  this.openingRange.high + buffer,
      shortEntry: this.openingRange.low  - buffer,
      method:     'GOLDEN_RATIO',
      fibRange,
      buffer,
      prevDayRange: this.previousDayData.range,
      prevDayDate:  this.previousDayData.date
    };

    logger.info('✅ Golden Ratio levels calculated (backtest-identical formula)', {
      prevDayHigh:  this.previousDayData.high.toFixed(2),
      prevDayLow:   this.previousDayData.low.toFixed(2),
      prevDayRange: this.previousDayData.range.toFixed(2),
      fibLevel,
      fibRange:     fibRange.toFixed(2),
      buffer:       buffer.toFixed(2),
      longEntry:    this.goldenRatioLevels.longEntry.toFixed(2),
      shortEntry:   this.goldenRatioLevels.shortEntry.toFixed(2)
    });

    this.emit('golden_ratio_calculated', this.goldenRatioLevels);
  }

  /**
   * Handle completed candle
   */
  async onCandleComplete(candle) {
    if (!this.isRunning) return;

    // Store in history
    this.candleHistory.addCandle(candle);

    // Update spot price from candle
    if (candle.close) {
      this.spotPrice = candle.close;
      
      logger.info('🟢 SPOT PRICE UPDATED FROM WEBSOCKET CANDLE', {
        source: 'WEBSOCKET_TICK',
        ltp: this.spotPrice,
        candleMinute: candle.minute,
        tickCount: candle.tickCount,
        method: 'onCandleComplete()'
      });
    }

    // Check for entry signal if monitoring
    if (this.state === 'MONITORING' && !this.currentPosition) {
      await this.checkEntrySignal(candle);
    }

    // Update position if open
    if (this.currentPosition) {
      await this.updatePosition(candle);
    }
  }

  /**
   * Check for entry signal
   */
  async checkEntrySignal(candle) {
    if (!this.goldenRatioLevels) {
      // This is expected when previousDayData was unavailable at startup.
      // Log once to avoid log spam, then return.
      if (!this._loggedNoPrevData) {
        logger.warn('No Golden Ratio levels — previous day data unavailable. Trading blocked for today.');
        this._loggedNoPrevData = true;
      }
      return;
    }

    // Check if past last entry time
    if (this.sessionManager.isPastLastEntryTime()) {
      return;
    }

    // Check risk manager approval
    const riskCheck = this.riskManager.checkTradeAllowed();
    if (!riskCheck.allowed) {
      logger.warn('Trade not allowed by risk manager', {
        reason: riskCheck.reason
      });
      return;
    }

    // Check for breakout
    let direction = null;

    if (candle.close > this.goldenRatioLevels.longEntry) {
      direction = 'LONG';
    } else if (candle.close < this.goldenRatioLevels.shortEntry) {
      direction = 'SHORT';
    }

    if (direction) {
      logger.info('Entry signal detected', {
        direction,
        price: candle.close,
        level: direction === 'LONG' ? this.goldenRatioLevels.longEntry : this.goldenRatioLevels.shortEntry
      });

      await this.enterTrade(direction, candle);
    }
  }

  /**
   * Enter trade
   */
  async enterTrade(direction, candle) {
    try {
      await this.updateSpotPrice();

      // Select option instrument
      const optionType = direction === 'LONG' ? 'CE' : 'PE';
      const underlying = this.config.trading.instruments[0] || 'NIFTY';
      
      const instrument = this.instrumentMaster.findATMStrike(
        underlying,
        this.spotPrice,
        optionType
      );

      if (!instrument) {
        logger.error('Failed to find instrument for entry');
        return;
      }

      this.selectedInstrument = instrument;

      // Get option quote (pass spot price for mock mode)
      const quote = await this.optionChain.getOptionQuote(
        instrument.instrumentKey,
        this.spotPrice
      );

      // Check liquidity
      const liquidity = this.optionChain.checkLiquidity(quote);
      if (liquidity.quality === 'POOR') {
        logger.warn('Poor liquidity - skipping trade', liquidity);
        return;
      }

      // Calculate position size
      const stopLossPercent = this.config.strategy?.stopLossPercent || 0.5;
      const stopLoss = quote.askPrice * (1 - stopLossPercent / 100);
      
      const positionSize = this.riskManager.calculatePositionSize({
        entryPrice: quote.askPrice,
        stopLoss,
        lotSize: instrument.lotSize
      });

      if (!positionSize || positionSize.quantity === 0) {
        logger.error('Invalid position size calculated');
        return;
      }

      // ── SANDBOX ORDER PLACEMENT ──────────────────────────────────────
      // All orders route through orderManager → upstoxClient.placeOrder()
      // → api-hft.upstox.com (sandbox). No real capital is at risk.
      logger.info('Placing entry order via sandbox', {
        instrument: instrument.tradingSymbol,
        instrumentKey: instrument.instrumentKey,
        side: 'BUY',
        quantity: positionSize.quantity,
        price: quote.askPrice
      });

      let entryOrderId;
      try {
        const orderResponse = await this.orderManager.placeOrder({
          instrument_token: instrument.instrumentKey,  // HFT endpoint uses instrument_token
          quantity: positionSize.quantity,
          transaction_type: 'BUY',
          order_type: 'MARKET',
          product: 'I',      // Intraday
          validity: 'DAY',
          price: 0,          // 0 for MARKET orders
          trigger_price: 0,  // required by HFT endpoint
          disclosed_quantity: 0,
          is_amo: false,
          tag: 'ORB-ENTRY'
        });
        entryOrderId = orderResponse.orderId;
        logger.info('✅ Sandbox entry order placed', { entryOrderId });
      } catch (orderErr) {
        // Order placement failed — do NOT open a local position for a failed order.
        // This prevents phantom positions that would corrupt P&L accounting.
        logger.error('❌ Sandbox entry order FAILED — trade NOT taken', {
          instrument: instrument.tradingSymbol,
          error: orderErr.message
        });
        return;
      }
      // ────────────────────────────────────────────────────────────────

      // Create position using real sandbox order ID
      const targetPercent = this.config.strategy?.targetPercent || 2.0;
      const target = quote.askPrice * (1 + targetPercent / 100);

      this.currentPosition = this.positionTracker.openPosition({
        instrument: instrument.tradingSymbol,
        instrumentKey: instrument.instrumentKey,
        side: 'BUY',
        quantity: positionSize.quantity,
        entryPrice: quote.askPrice,
        stopLoss,
        target,
        orderId: entryOrderId,       // Real sandbox order ID
        entryBid: quote.bidPrice,    // Capture spread at entry for journal
        entryAsk: quote.askPrice,
        entrySpread: quote.spread
      });

      this.riskManager.incrementTradeCount();

      await this.transitionTo('POSITION_OPEN');

      this.emit('position_entered', this.currentPosition);

    } catch (error) {
      logger.error('Failed to enter trade', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Update position with current price
   */
  async updatePosition(candle) {
    if (!this.currentPosition) return;

    // Get current option price (pass spot price for mock mode)
    try {
      const quote = await this.optionChain.getOptionQuote(
        this.selectedInstrument.instrumentKey,
        this.spotPrice
      );
      
      this.positionTracker.updatePosition(
        this.currentPosition.id,
        quote.ltp
      );
    } catch (error) {
      logger.error('Failed to update position', {
        error: error.message
      });
    }
  }

  /**
   * Handle stop loss hit
   */
  async onStopLossHit(position) {
    // Guard: prevent double-close if candle loop already triggered closePosition
    if (this._closingPosition) {
      logger.debug('Stop loss event skipped — close already in progress');
      return;
    }
    logger.warn('Stop loss hit - closing position', {
      id: position.id,
      pnl: position.pnl
    });
    await this.closePosition('STOP_LOSS', position);
  }

  /**
   * Handle target hit
   */
  async onTargetHit(position) {
    // Guard: prevent double-close if candle loop already triggered closePosition
    if (this._closingPosition) {
      logger.debug('Target event skipped — close already in progress');
      return;
    }
    logger.info('Target hit - closing position', {
      id: position.id,
      pnl: position.pnl
    });
    await this.closePosition('TARGET', position);
  }

  /**
   * Check hard exit time
   */
  async checkHardExitTime() {
    if (this.sessionManager.isHardExitTime() && this.currentPosition) {
      logger.warn('Hard exit time reached - closing position');
      await this.closePosition('HARD_EXIT');
    }
  }

  /**
   * Close position
   */
  async closePosition(reason, position = null) {
    const pos = position || this.currentPosition;
    
    if (!pos) {
      return;
    }

    // Guard: prevent double-close from simultaneous event + timer triggers
    if (this._closingPosition) {
      logger.warn('closePosition() called while already closing — ignoring duplicate', { reason });
      return;
    }
    this._closingPosition = true;

    try {
      // Get current quote for exit (pass spot price for mock mode)
      const quote = await this.optionChain.getOptionQuote(
        this.selectedInstrument.instrumentKey,
        this.spotPrice
      );

      // ── SANDBOX EXIT ORDER ───────────────────────────────────────────
      // SELL to close the option position via sandbox.
      // Even on failure we still close the local position (can't leave
      // a stuck open position in the tracker with no exit recorded).
      logger.info('Placing exit order via sandbox', {
        id: pos.id,
        reason,
        instrument: this.selectedInstrument.tradingSymbol,
        exitPrice: quote.bidPrice
      });

      let exitOrderId = null;
      try {
        const exitResponse = await this.orderManager.placeOrder({
          instrument_token: this.selectedInstrument.instrumentKey,  // HFT endpoint uses instrument_token
          quantity: pos.quantity,
          transaction_type: 'SELL',
          order_type: 'MARKET',
          product: 'I',
          validity: 'DAY',
          price: 0,
          trigger_price: 0,  // required by HFT endpoint
          disclosed_quantity: 0,
          is_amo: false,
          tag: 'ORB-EXIT'
        });
        exitOrderId = exitResponse.orderId;
        logger.info('✅ Sandbox exit order placed', { exitOrderId });
      } catch (exitErr) {
        // Log critically but still close locally — a failed exit order
        // must be investigated manually but we cannot leave a stale
        // open position in the tracker.
        logger.error('❌ Sandbox exit order FAILED — position closed locally only. MANUAL REVIEW REQUIRED.', {
          positionId: pos.id,
          instrument: this.selectedInstrument.tradingSymbol,
          error: exitErr.message
        });
      }
      // ────────────────────────────────────────────────────────────────

      const closedPosition = this.positionTracker.closePosition(pos.id, {
        exitPrice: quote.bidPrice,
        reason,
        orderId: exitOrderId     // Real sandbox exit order ID (null if order failed)
      });

      // Calculate costs — include actual bid/ask spread captured at both legs
      const trade = {
        id: closedPosition.id,
        instrument: closedPosition.instrument,
        quantity: closedPosition.quantity,
        entry: {
          price:  closedPosition.entryPrice,
          spread: pos.entrySpread || 0,    // Spread captured when position was opened
          bid:    pos.entryBid,
          ask:    pos.entryAsk,
          orderId: closedPosition.orderId  // Real entry order ID
        },
        exit: {
          price:  closedPosition.exitPrice,
          spread: quote.spread || 0,       // Spread at exit time
          bid:    quote.bidPrice,
          ask:    quote.askPrice,
          orderId: exitOrderId             // Real exit order ID
        }
      };

      const costs = this.costCalculator.calculateTradeCosts(trade);

      // Log to trade journal with real order IDs and spread data
      await this.tradeJournal.logTrade({
        ...trade,
        entry: {
          time:      closedPosition.entryTime,
          fillPrice: closedPosition.entryPrice,
          premium:   closedPosition.entryPrice,
          ...trade.entry
        },
        exit: {
          time:      closedPosition.exitTime,
          reason:    closedPosition.exitReason,
          fillPrice: closedPosition.exitPrice,
          ...trade.exit
        },
        pnl:     costs.pnl,
        costs:   costs.costs,
        verdict: costs.verdict
      });

      // Update risk manager
      this.riskManager.updateDailyPnL(costs.pnl.adjusted);

      this.currentPosition = null;
      this.selectedInstrument = null;
      this._closingPosition = false; // Release guard after clean close

      await this.transitionTo('MONITORING');

      this.emit('position_closed', {
        position: closedPosition,
        costs
      });

    } catch (error) {
      this._closingPosition = false; // Always release guard, even on error
      logger.error('Failed to close position', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Market close handler
   */
  async onMarketClose() {
    logger.info('📉 Market closed - ending trading session');

    // Close any open positions
    if (this.currentPosition) {
      await this.closePosition('MARKET_CLOSE');
    }

    // Generate daily summary
    await this.tradeJournal.generateDailySummary();

    // Reset for next day
    this.openingRange = null;
    this.goldenRatioLevels = null;
    this.previousDayData = null;

    this.emit('market_closed');
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      isRunning: this.isRunning,
      openingRange: this.openingRange,
      goldenRatioLevels: this.goldenRatioLevels,
      currentPosition: this.currentPosition ? {
        id: this.currentPosition.id,
        instrument: this.currentPosition.instrument,
        pnl: this.currentPosition.pnl
      } : null,
      spotPrice: this.spotPrice,
      riskStatus: this.riskManager.getRiskStatus()
    };
  }
}

export default BotEngine;
