import { logger } from '../utils/logger.js';
import { loadConfig } from '../utils/config-loader.js';
import UpstoxWebSocketClient from '../data/websocket-client.js';
import { CandleBuilder, CandleHistory } from '../data/candle-builder.js';
import InstrumentMaster from '../data/instrument-master.js';
import OptionChainFetcher from '../data/option-chain.js';
import UpstoxClient from '../data/upstox-client.js';
import OrderManager from '../execution/order-manager.js';
import PositionTracker from './position-tracker.js';
import CostCalculator from './cost-calculator.js';
import TradeJournal from './trade-journal.js';
import LiveRiskManager from '../risk/live-risk-manager.js';
import SessionManager from './session-manager.js';
import BotEngine from './bot-engine.js';
import StateExporter from './state-exporter.js';
import PositionReconciler from './position-reconciler.js';
import TelegramNotifier from '../alerts/telegram-notifier.js';

/**
 * Main Live Bot Runner
 * 
 * Entry point for sandbox/live trading bot
 * Initializes all components and orchestrates the trading session
 */

class LiveBotRunner {
  constructor() {
    this.config = null;
    this.components = {};
    this.isShuttingDown = false;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    try {
      logger.info('🚀 Initializing Upstox ORB Trading Bot (Live Mode)');
      logger.info('='.repeat(60));

      // 1. Load configuration
      logger.info('Loading configuration...');
      this.config = await loadConfig();
      logger.info('✅ Configuration loaded');

      // 2. Initialize Session Manager
      logger.info('Initializing session manager...');
      this.components.sessionManager = new SessionManager(this.config);
      await this.components.sessionManager.initialize();
      logger.info('✅ Session manager initialized');

      // Check if today is a trading day
      if (!this.components.sessionManager.isTradingDay()) {
        logger.warn('⚠️  Not a trading day - bot will wait for next trading day');
      }

      // 3. Initialize Instrument Master
      logger.info('Initializing instrument master...');
      this.components.instrumentMaster = new InstrumentMaster(this.config);
      await this.components.instrumentMaster.initialize();
      logger.info('✅ Instrument master initialized', {
        instruments: this.components.instrumentMaster.instruments.size
      });

      // 4. Initialize Upstox Client
      logger.info('Initializing Upstox client...');
      this.components.upstoxClient = new UpstoxClient(this.config, logger);
      logger.info('✅ Upstox client initialized');

      // 5. Initialize Option Chain Fetcher
      logger.info('Initializing option chain fetcher...');
      this.components.optionChain = new OptionChainFetcher(
        this.config,
        this.components.upstoxClient
      );
      logger.info('✅ Option chain fetcher initialized');

      // 6. Initialize Order Manager
      logger.info('Initializing order manager...');
      this.components.orderManager = new OrderManager(
        this.config,
        this.components.upstoxClient,
        logger
      );
      logger.info('✅ Order manager initialized');

      // 7. Initialize Position Tracker
      logger.info('Initializing position tracker...');
      this.components.positionTracker = new PositionTracker(this.config);
      logger.info('✅ Position tracker initialized');

      // 8. Initialize Cost Calculator
      logger.info('Initializing cost calculator...');
      this.components.costCalculator = new CostCalculator(this.config);
      logger.info('✅ Cost calculator initialized');

      // 9. Initialize Trade Journal
      logger.info('Initializing trade journal...');
      this.components.tradeJournal = new TradeJournal(this.config);
      await this.components.tradeJournal.initialize();
      logger.info('✅ Trade journal initialized');

      // 10. Initialize Risk Manager
      logger.info('Initializing live risk manager...');
      this.components.riskManager = new LiveRiskManager(this.config);
      logger.info('✅ Live risk manager initialized', {
        capital: this.components.riskManager.capital,
        dailyLossLimit: this.components.riskManager.dailyLossLimit
      });

      // 10b. Initialize Telegram Notifier
      this.components.telegram = new TelegramNotifier(this.config, logger);

      // 11. Initialize Candle Builder and History
      logger.info('Initializing candle builder...');
      this.components.candleBuilder = new CandleBuilder({
        interval: 60000, // 1 minute
        timezone: 'Asia/Kolkata'
      });
      this.components.candleHistory = new CandleHistory(500);
      // NOTE: candleHistory is populated by BotEngine.onCandleComplete() — do NOT add a
      // second 'candle' listener here. A double-subscription causes every candle to be
      // stored twice, which corrupts opening range accuracy (15 entries cover only ~7 minutes).
      
      logger.info('✅ Candle builder initialized');

      // 12. Initialize WebSocket Client
      logger.info('Initializing WebSocket client...');
      
      // Use production token/URL for market data (even in sandbox mode)
      const wsToken = this.config.upstox.marketData?.accessToken || this.config.upstox.accessToken;
      const wsConfig = {
        ...this.config.websocket,
        url: this.config.upstox.marketData?.websocketUrl || this.config.websocket?.url
      };
      
      this.components.wsClient = new UpstoxWebSocketClient(wsToken, wsConfig);
      
      logger.info('WebSocket configuration', {
        useMock: wsConfig.useMock,
        useProductionData: !!this.config.upstox.marketData?.useProduction,
        url: wsConfig.url
      });

      // Connect WebSocket to Candle Builder
      this.components.wsClient.on('tick', (tick) => {
        this.components.candleBuilder.processTick(tick);
      });

      logger.info('✅ WebSocket client initialized');

      // 13. Initialize Bot Engine (orchestrator)
      logger.info('Initializing bot engine...');
      this.components.config = this.config; // Add config to components
      this.components.botEngine = new BotEngine(this.components);
      logger.info('✅ Bot engine initialized');

      // 14. Initialize State Exporter (for dashboard)
      logger.info('Initializing state exporter for dashboard...');
      this.components.stateExporter = new StateExporter(
        this.components.botEngine,
        this.components
      );
      logger.info('✅ State exporter initialized');

      logger.info('='.repeat(60));
      logger.info('✅ All components initialized successfully');
      
      return true;

    } catch (error) {
      logger.error('❌ Failed to initialize bot', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      logger.info('🚀 Starting live trading bot');

      // Perform pre-market checks
      const preMarketChecks = await this.components.sessionManager.performPreMarketChecks();
      
      if (!preMarketChecks.passed) {
        logger.error('❌ Pre-market checks failed', preMarketChecks.checks);
        throw new Error('Pre-market checks failed');
      }

      logger.info('✅ Pre-market checks passed');

      // Connect WebSocket with retry logic
      logger.info('Connecting to Upstox WebSocket...');
      await this.connectWebSocketWithRetry();
      logger.info('✅ WebSocket connected');

      // ── Safety Fix 1: Restart Recovery ───────────────────────────────────
      // Reconcile broker positions with internal state to prevent double-positions
      const reconciler = new PositionReconciler(
        this.components.upstoxClient,
        this.components.positionTracker
      );
      await reconciler.reconcile();

      // ── Safety Fix 3: Stale Data Detection ──────────────────────────────
      // If WebSocket goes silent during market hours, attempt reconnect
      this.components.wsClient.on('stale', async ({ msSinceLastTick }) => {
        const silentFor = `${Math.round(msSinceLastTick / 1000)}s`;
        logger.error('🚨 Stale feed detected — attempting WebSocket reconnect', { silentFor });
        this.components.telegram?.sendAlert('STALE_DATA', 'Market feed went silent — reconnecting WebSocket', {
          silentFor,
          time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })
        });
        try {
          await this.connectWebSocketWithRetry(3);
          // Re-subscribe
          const niftyKey = 'NSE_INDEX|Nifty 50';
          const relianceKey = 'NSE_EQ|INE002A01018';
          this.components.wsClient.subscribe([niftyKey, relianceKey]);
          logger.info('✅ Reconnected after stale feed');
        } catch (err) {
          logger.error('Failed to reconnect after stale feed — activating kill switch', {
            error: err.message
          });
          this.components.riskManager.emergencyStop('STALE_FEED');
          this.components.telegram?.sendAlert('KILL_SWITCH', 'Reconnect failed — kill switch activated', {
            reason: 'STALE_FEED', error: err.message
          });
        }
      });

      // Subscribe to multiple instruments for better tick coverage
      const underlying = this.config.trading.instruments[0] || 'NIFTY';
      const niftyKey = `NSE_INDEX|Nifty 50`; // NIFTY spot
      const relianceKey = `NSE_EQ|INE002A01018`; // RELIANCE stock (high volume)
      
      logger.info('Subscribing to market data...', { 
        underlying, 
        niftyKey,
        relianceKey: 'NSE_EQ|INE002A01018 (RELIANCE - for tick verification)'
      });
      
      // Subscribe to both NIFTY and RELIANCE
      // RELIANCE trades much more frequently and will generate live_feed messages
      this.components.wsClient.subscribe([niftyKey, relianceKey]);
      
      logger.info('✅ Subscribed to market data (NIFTY + RELIANCE for tick verification)');

      // Start Bot Engine
      await this.components.botEngine.start();
      logger.info('✅ Bot engine started');

      // Start State Exporter (for dashboard)
      this.components.stateExporter.start();
      logger.info('✅ State exporter started - dashboard can now read bot status');

      // Log status
      this.logStatus();

      // Set up periodic status logging (every 5 minutes)
      this.statusInterval = setInterval(() => {
        this.logStatus();
      }, 5 * 60 * 1000);

      logger.info('='.repeat(60));
      logger.info('🤖 Bot is now live and monitoring market');
      logger.info('='.repeat(60));

      // ── Telegram Heartbeat ────────────────────────────────────────────────
      // Send 9:00 AM alive message to Telegram
      const instrument = this.config.trading.instruments?.[0] || 'NIFTY';
      await this.components.telegram?.sendHeartbeat({
        capital:    this.config.trading.capital,
        instrument
      });

    } catch (error) {
      logger.error('❌ Failed to start bot', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Connect WebSocket with exponential backoff retry
   */
  async connectWebSocketWithRetry(maxAttempts = 5) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`WebSocket connect attempt ${attempt}/${maxAttempts}`);
        await this.components.wsClient.connect();
        logger.info('✅ WebSocket connected');
        return;
      } catch (error) {
        lastError = error;
        logger.warn(`WebSocket connect attempt ${attempt} failed`, {
          error: error.message,
          status: error.response?.status
        });
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // exponential backoff, max 30s
          logger.info(`Retrying WebSocket in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw new Error(`WebSocket connection failed after ${maxAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Stop the bot gracefully
   */
  async stop() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    logger.info('🛑 Stopping live trading bot');

    try {
      // Clear status interval
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
      }

      // Stop bot engine
      if (this.components.botEngine) {
        await this.components.botEngine.stop();
        logger.info('✅ Bot engine stopped');
      }

      // Stop state exporter
      if (this.components.stateExporter) {
        this.components.stateExporter.stop();
        logger.info('✅ State exporter stopped');
      }

      // Disconnect WebSocket
      if (this.components.wsClient) {
        this.components.wsClient.disconnect();
        logger.info('✅ WebSocket disconnected');
      }

      // Perform post-market cleanup
      if (this.components.sessionManager) {
        await this.components.sessionManager.performPostMarketCleanup();
        logger.info('✅ Post-market cleanup complete');
      }

      // Generate final daily summary + send to Telegram
      if (this.components.tradeJournal) {
        const summary = await this.components.tradeJournal.generateDailySummary();
        logger.info('✅ Daily summary generated');

        // Send EOD summary to Telegram
        const riskStatus = this.components.riskManager?.getRiskStatus?.() || {};
        const instrument = this.config?.trading?.instruments?.[0] || 'NIFTY';
        await this.components.telegram?.sendEODSummary({
          date:           new Date().toLocaleDateString('en-IN'),
          instrument,
          totalTrades:    riskStatus.tradesCount    || 0,
          totalPnL:       riskStatus.dailyPnL       || 0,
          totalPnLPercent:riskStatus.dailyPnLPercent|| 0,
          capital:        this.config?.trading?.capital || 0,
          finalCapital:   (this.config?.trading?.capital || 0) + (riskStatus.dailyPnL || 0),
          winningTrades:  riskStatus.winningTrades  || 0,
          losingTrades:   riskStatus.losingTrades   || 0,
          stoppedReason:  riskStatus.killSwitchActivated ? 'Kill switch activated'
                        : riskStatus.circuitBreakerTriggered ? 'Circuit breaker'
                        : null
        });
      }

      logger.info('='.repeat(60));
      logger.info('✅ Bot stopped gracefully');
      logger.info('='.repeat(60));

    } catch (error) {
      logger.error('❌ Error during shutdown', {
        error: error.message
      });
    }
  }

  /**
   * Log current status
   */
  logStatus() {
    const botState = this.components.botEngine.getState();
    const sessionStats = this.components.sessionManager.getStats();
    const riskStatus = this.components.riskManager.getRiskStatus();
    const positionStats = this.components.positionTracker.getStats();

    logger.info('📊 Bot Status', {
      state: botState.state,
      isRunning: botState.isRunning,
      sessionState: sessionStats.sessionState,
      isMarketHours: sessionStats.isMarketHours,
      spotPrice: botState.spotPrice,
      openPositions: positionStats.openPositions,
      dailyPnL: riskStatus.dailyPnL,
      dailyPnLPercent: riskStatus.dailyPnLPercent,
      tradesCount: riskStatus.tradesCount,
      circuitBreaker: riskStatus.circuitBreakerTriggered,
      killSwitch: riskStatus.killSwitchActivated
    });
  }

  /**
   * Handle errors
   */
  handleError(error) {
    logger.error('💥 Unhandled error', {
      error: error.message,
      stack: error.stack
    });

    // Activate kill switch on critical errors
    this.components.riskManager.emergencyStop('CRITICAL_ERROR');
  }
}

/**
 * Main entry point
 */
async function main() {
  const bot = new LiveBotRunner();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('\n🛑 Received SIGINT (Ctrl+C) - shutting down gracefully');
    await bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('\n🛑 Received SIGTERM - shutting down gracefully');
    await bot.stop();
    process.exit(0);
  });

  // Handle unhandled errors
  process.on('unhandledRejection', (error) => {
    logger.error('💥 Unhandled promise rejection', {
      error: error.message,
      stack: error.stack
    });
    bot.handleError(error);
  });

  process.on('uncaughtException', (error) => {
    logger.error('💥 Uncaught exception', {
      error: error.message,
      stack: error.stack
    });
    bot.handleError(error);
  });

  try {
    // Initialize
    await bot.initialize();

    // Start
    await bot.start();

    logger.info('Press Ctrl+C to stop the bot');

  } catch (error) {
    logger.error('❌ Failed to start bot', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run if executed directly
// Use fileURLToPath for proper cross-platform path comparison
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  main();
}

export default LiveBotRunner;
