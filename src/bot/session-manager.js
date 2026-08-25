import { format, parse, isWeekend, isSameDay } from 'date-fns';
import { toIST, getMarketTime } from '../utils/date-utils.js';
import { logger } from '../utils/logger.js';

/**
 * Session Manager
 * 
 * Manages trading session lifecycle:
 * - Market hours validation
 * - Trading day detection (excludes holidays)
 * - Pre-market checks
 * - Post-market cleanup
 * - State persistence
 */
export class SessionManager {
  constructor(config) {
    this.config = config;
    this.marketOpen = config.trading.marketOpen || '09:15';
    this.marketClose = config.trading.marketClose || '15:30';
    this.isMarketHours = false;
    this.sessionState = 'PRE_MARKET'; // PRE_MARKET, MARKET_OPEN, MARKET_CLOSED
    this.tradingHolidays = [];
    this.sessionStartTime = null;
    this.lastCheck = null;
  }

  /**
   * Initialize session manager
   */
  async initialize() {
    logger.info('Initializing session manager');
    
    // Load trading holidays
    await this.loadTradingHolidays();
    
    // Check current session status
    await this.updateSessionStatus();
    
    logger.info('Session manager initialized', {
      sessionState: this.sessionState,
      isMarketHours: this.isMarketHours
    });

    return {
      sessionState: this.sessionState,
      isMarketHours: this.isMarketHours,
      marketOpen: this.marketOpen,
      marketClose: this.marketClose
    };
  }

  /**
   * Load trading holidays for NSE
   * 2026 NSE holidays (example list - should be updated annually)
   */
  async loadTradingHolidays() {
    // NSE Trading Holidays 2026 (example - verify with NSE calendar)
    this.tradingHolidays = [
      '2026-01-26', // Republic Day
      '2026-03-01', // Mahashivratri
      '2026-03-14', // Holi
      '2026-03-30', // Ram Navami
      '2026-04-02', // Mahavir Jayanti
      '2026-04-03', // Good Friday
      '2026-04-06', // Id-ul-Fitr
      '2026-04-14', // Dr. Ambedkar Jayanti
      '2026-05-01', // Maharashtra Day
      '2026-06-13', // Id-ul-Adha
      '2026-07-13', // Moharram
      '2026-08-15', // Independence Day
      '2026-08-28', // Janmashtami (corrected date)
      '2026-09-02', // Ganesh Chaturthi
      '2026-09-12', // Id-e-Milad
      '2026-10-02', // Mahatma Gandhi Jayanti
      '2026-10-17', // Dussehra
      '2026-11-04', // Diwali Laxmi Puja
      '2026-11-05', // Diwali Balipratipada
      '2026-11-20', // Gurunanak Jayanti
      '2026-12-25'  // Christmas
    ];

    logger.info('Trading holidays loaded', {
      count: this.tradingHolidays.length,
      sample: this.tradingHolidays.slice(0, 3)
    });
  }

  /**
   * Check if today is a trading day
   */
  isTradingDay(date = new Date()) {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Check if weekend
    if (isWeekend(date)) {
      logger.debug('Not a trading day: weekend', { date: dateStr });
      return false;
    }

    // Check if holiday
    if (this.tradingHolidays.includes(dateStr)) {
      logger.debug('Not a trading day: holiday', { date: dateStr });
      return false;
    }

    return true;
  }

  /**
   * Check if currently within market hours
   */
  isInMarketHours(now = new Date()) {
    const istNow = toIST(now);
    const currentTime = format(istNow, 'HH:mm');
    
    const isOpen = currentTime >= this.marketOpen && currentTime <= this.marketClose;
    
    return isOpen;
  }

  /**
   * Update session status
   */
  async updateSessionStatus() {
    const now = new Date();
    
    if (!this.isTradingDay(now)) {
      this.sessionState = 'NOT_TRADING_DAY';
      this.isMarketHours = false;
      return this.sessionState;
    }

    const inMarketHours = this.isInMarketHours(now);
    
    if (inMarketHours && !this.isMarketHours) {
      // Market just opened
      this.sessionState = 'MARKET_OPEN';
      this.isMarketHours = true;
      this.sessionStartTime = now;
      logger.info('Market session opened', {
        time: format(toIST(now), 'HH:mm:ss')
      });
    } else if (!inMarketHours && this.isMarketHours) {
      // Market just closed
      this.sessionState = 'MARKET_CLOSED';
      this.isMarketHours = false;
      logger.info('Market session closed', {
        time: format(toIST(now), 'HH:mm:ss')
      });
    } else if (inMarketHours) {
      this.sessionState = 'MARKET_OPEN';
      this.isMarketHours = true;
    } else {
      this.sessionState = 'PRE_MARKET';
      this.isMarketHours = false;
    }

    this.lastCheck = now;
    return this.sessionState;
  }

  /**
   * Pre-market checks before trading starts
   */
  async performPreMarketChecks() {
    logger.info('Performing pre-market checks');
    
    const checks = {
      tradingDay: this.isTradingDay(),
      credentials: this.checkCredentials(),
      connectivity: await this.checkConnectivity(),
      instruments: await this.checkInstruments()
    };

    // tradingDay is a WARNING only — bot starts and waits for next trading day
    // Hard failures: credentials, connectivity, instruments
    const criticalPassed = checks.credentials && checks.connectivity && checks.instruments;
    
    if (checks.tradingDay && criticalPassed) {
      logger.info('✅ All pre-market checks passed', checks);
    } else if (!checks.tradingDay && criticalPassed) {
      logger.warn('⚠️  Not a trading day — bot will start and wait for next trading session', checks);
    } else {
      logger.error('❌ Pre-market checks failed (critical)', checks);
    }

    return {
      passed: criticalPassed,
      checks
    };
  }

  /**
   * Check if credentials are configured
   */
  checkCredentials() {
    const hasAccessToken = !!this.config.upstox?.accessToken;
    const hasApiKey = !!this.config.upstox?.apiKey;
    
    return hasAccessToken && hasApiKey;
  }

  /**
   * Check API connectivity
   */
  async checkConnectivity() {
    try {
      // Simple check - can be enhanced with actual API call
      return true;
    } catch (error) {
      logger.error('Connectivity check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Check if instruments are loaded
   */
  async checkInstruments() {
    // Placeholder - actual implementation would check instrument master
    return true;
  }

  /**
   * Post-market cleanup
   */
  async performPostMarketCleanup() {
    logger.info('Performing post-market cleanup');
    
    // Log session summary
    const sessionDuration = this.sessionStartTime 
      ? (Date.now() - this.sessionStartTime.getTime()) / 1000 / 60 
      : 0;
    
    logger.info('Trading session summary', {
      duration: `${sessionDuration.toFixed(0)} minutes`,
      startTime: this.sessionStartTime ? format(this.sessionStartTime, 'HH:mm:ss') : 'N/A'
    });

    // Reset session state
    this.sessionState = 'POST_MARKET';
    this.isMarketHours = false;
    
    return {
      sessionDuration,
      endTime: format(new Date(), 'HH:mm:ss')
    };
  }

  /**
   * Get time until market open/close
   */
  getTimeUntilEvent() {
    const now = toIST(new Date());
    const currentTime = format(now, 'HH:mm');
    
    if (this.sessionState === 'MARKET_OPEN') {
      // Time until market close
      const [closeHour, closeMin] = this.marketClose.split(':').map(Number);
      const closeTime = new Date(now);
      closeTime.setHours(closeHour, closeMin, 0, 0);
      
      const diffMs = closeTime.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / 1000 / 60);
      
      return {
        event: 'MARKET_CLOSE',
        minutes: diffMinutes,
        time: this.marketClose
      };
    } else {
      // Time until market open (next trading day)
      const [openHour, openMin] = this.marketOpen.split(':').map(Number);
      let openTime = new Date(now);
      openTime.setHours(openHour, openMin, 0, 0);
      
      // If already past today's open time, move to next day
      if (openTime <= now) {
        openTime.setDate(openTime.getDate() + 1);
      }
      
      // Skip to next trading day
      while (!this.isTradingDay(openTime)) {
        openTime.setDate(openTime.getDate() + 1);
      }
      
      const diffMs = openTime.getTime() - now.getTime();
      const diffMinutes = Math.floor(diffMs / 1000 / 60);
      
      return {
        event: 'MARKET_OPEN',
        minutes: diffMinutes,
        time: this.marketOpen,
        date: format(openTime, 'yyyy-MM-dd')
      };
    }
  }

  /**
   * Check if past last entry time
   */
  isPastLastEntryTime(now = new Date()) {
    const lastEntry = this.config.trading.lastEntryTime || '14:45';
    const currentTime = format(toIST(now), 'HH:mm');
    
    return currentTime >= lastEntry;
  }

  /**
   * Check if hard exit time reached
   */
  isHardExitTime(now = new Date()) {
    const hardExit = this.config.trading.hardExitTime || '15:15';
    const currentTime = format(toIST(now), 'HH:mm');
    
    return currentTime >= hardExit;
  }

  /**
   * Get session statistics
   */
  getStats() {
    const nextEvent = this.getTimeUntilEvent();
    
    return {
      sessionState: this.sessionState,
      isMarketHours: this.isMarketHours,
      isTradingDay: this.isTradingDay(),
      marketOpen: this.marketOpen,
      marketClose: this.marketClose,
      lastCheck: this.lastCheck ? this.lastCheck.toISOString() : null,
      sessionStartTime: this.sessionStartTime ? this.sessionStartTime.toISOString() : null,
      nextEvent: nextEvent,
      isPastLastEntry: this.isPastLastEntryTime(),
      isHardExit: this.isHardExitTime()
    };
  }
}

export default SessionManager;
