import { EventEmitter } from 'events';
import { format } from 'date-fns';
import { logger } from '../utils/logger.js';
import { toIST } from '../utils/date-utils.js';
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
    // Check kill switch every 5 seconds
    this.killSwitchCheckInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const activated = await this.riskManager.checkKillSwitch();
      if (activated) {
        logger.error('🛑 Kill switch detected - stopping bot');
        await this.stop();
      }
    }, 5000);
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
    try {
      // In live mode, fetch from historical API or use yesterday's data
      // For now, placeholder
      logger.info('Fetching previous day data for Golden Ratio calculation');
      
      // TODO: Implement actual previous day data fetch
      // This would query historical candles from yesterday
      
      this.previousDayData = null; // Will be implemented with historical data
    } catch (error) {
      logger.error('Failed to fetch previous day data', {
        error: error.message
      });
    }
  }

  /**
   * Update current spot price
   */
  async updateSpotPrice() {
    try {
      const underlying = this.config.trading.instruments[0] || 'NIFTY';
      const spotData = await this.optionChain.getSpotPrice(underlying);
      
      this.spotPrice = spotData.ltp;
      
      logger.debug('Spot price updated', {
        underlying,
        ltp: this.spotPrice
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
    
    if (currentTime >= orEndTime && !this.openingRange) {
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

    const fibLevel = this.config.goldenRatio?.fibonacciLevel || 0.618;

    // If we have previous day data, use it
    let fibRange = 0;
    if (this.previousDayData) {
      fibRange = this.previousDayData.range * fibLevel;
    }

    // Golden Ratio levels: OR high/low + small buffer
    const buffer = fibRange > 0 ? fibRange * 0.1 : this.openingRange.range * 0.1;

    this.goldenRatioLevels = {
      longEntry: this.openingRange.high + buffer,
      shortEntry: this.openingRange.low - buffer,
      method: this.previousDayData ? 'GOLDEN_RATIO' : 'OPENING_RANGE',
      fibRange
    };

    logger.info('Golden Ratio levels calculated', this.goldenRatioLevels);

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

      // Get option quote
      const quote = await this.optionChain.getOptionQuote(instrument.instrumentKey);

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

      // Place order (placeholder - would use actual order manager)
      logger.info('Placing entry order', {
        instrument: instrument.tradingSymbol,
        side: 'BUY',
        quantity: positionSize.quantity,
        price: quote.askPrice
      });

      // Create position
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
        orderId: 'ORDER-' + Date.now() // Placeholder
      });

      this.riskManager.incrementTradeCount();

      await this.transitionTo('POSITION_OPEN');

      this.emit('position_entered', this.currentPosition);

    } catch (error) {
      logger.error('Failed to enter trade', {
        error: error.message
      });
    }
  }

  /**
   * Update position with current price
   */
  async updatePosition(candle) {
    if (!this.currentPosition) return;

    // Get current option price
    try {
      const quote = await this.optionChain.getOptionQuote(this.selectedInstrument.instrumentKey);
      
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

    try {
      // Get current quote for exit
      const quote = await this.optionChain.getOptionQuote(this.selectedInstrument.instrumentKey);

      // Close position (placeholder - would use actual order manager)
      logger.info('Closing position', {
        id: pos.id,
        reason,
        exitPrice: quote.bidPrice
      });

      const closedPosition = this.positionTracker.closePosition(pos.id, {
        exitPrice: quote.bidPrice,
        reason,
        orderId: 'ORDER-EXIT-' + Date.now()
      });

      // Calculate costs
      const trade = {
        id: closedPosition.id,
        instrument: closedPosition.instrument,
        quantity: closedPosition.quantity,
        entry: {
          price: closedPosition.entryPrice,
          spread: 0 // TODO: Get from actual entry
        },
        exit: {
          price: closedPosition.exitPrice,
          spread: 0 // TODO: Get from actual exit
        }
      };

      const costs = this.costCalculator.calculateTradeCosts(trade);

      // Log to trade journal
      await this.tradeJournal.logTrade({
        ...trade,
        entry: {
          time: closedPosition.entryTime,
          fillPrice: closedPosition.entryPrice,
          premium: closedPosition.entryPrice,
          ...trade.entry
        },
        exit: {
          time: closedPosition.exitTime,
          reason: closedPosition.exitReason,
          fillPrice: closedPosition.exitPrice,
          ...trade.exit
        },
        pnl: costs.pnl,
        costs: costs.costs,
        verdict: costs.verdict
      });

      // Update risk manager
      this.riskManager.updateDailyPnL(costs.pnl.adjusted);

      this.currentPosition = null;
      this.selectedInstrument = null;

      await this.transitionTo('MONITORING');

      this.emit('position_closed', {
        position: closedPosition,
        costs
      });

    } catch (error) {
      logger.error('Failed to close position', {
        error: error.message
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
