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
      this.components.upstoxClient = new UpstoxClient(this.config);
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
        this.components.upstoxClient
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

      // 11. Initialize Candle Builder and History
      logger.info('Initializing candle builder...');
      this.components.candleBuilder = new CandleBuilder({
        interval: 60000, // 1 minute
        timezone: 'Asia/Kolkata'
      });
      this.components.candleHistory = new CandleHistory(500);
      
      // Link candle builder to history
      this.components.candleBuilder.on('candle', (candle) => {
        this.components.candleHistory.addCandle(candle);
      });
      
      logger.info('✅ Candle builder initialized');

      // 12. Initialize WebSocket Client
      logger.info('Initializing WebSocket client...');
      this.components.wsClient = new UpstoxWebSocketClient(
        this.config.upstox.accessToken,
        this.config.websocket || {}
      );

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

      // Connect WebSocket
      logger.info('Connecting to Upstox WebSocket...');
      await this.components.wsClient.connect();
      logger.info('✅ WebSocket connected');

      // Subscribe to NIFTY spot
      const underlying = this.config.trading.instruments[0] || 'NIFTY';
      const spotKey = `NSE_INDEX|Nifty 50`; // Upstox instrument key for NIFTY spot
      
      logger.info('Subscribing to market data...', { underlying, spotKey });
      this.components.wsClient.subscribe([spotKey]);
      logger.info('✅ Subscribed to market data');

      // Start Bot Engine
      await this.components.botEngine.start();
      logger.info('✅ Bot engine started');

      // Log status
      this.logStatus();

      // Set up periodic status logging (every 5 minutes)
      this.statusInterval = setInterval(() => {
        this.logStatus();
      }, 5 * 60 * 1000);

      logger.info('='.repeat(60));
      logger.info('🤖 Bot is now live and monitoring market');
      logger.info('='.repeat(60));

    } catch (error) {
      logger.error('❌ Failed to start bot', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
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

      // Generate final daily summary
      if (this.components.tradeJournal) {
        await this.components.tradeJournal.generateDailySummary();
        logger.info('✅ Daily summary generated');
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
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default LiveBotRunner;
