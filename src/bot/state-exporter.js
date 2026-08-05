import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

/**
 * State Exporter
 * 
 * Exports bot state to JSON file for dashboard to read
 * DOES NOT affect bot logic - read-only export
 */
export class StateExporter {
  constructor(botEngine, components) {
    this.botEngine = botEngine;
    this.components = components;
    this.stateFile = path.join(process.cwd(), 'data', 'bot_state.json');
    this.exportInterval = null;
  }

  /**
   * Start periodic state export (every 10 seconds)
   */
  start() {
    this.exportInterval = setInterval(() => {
      this.exportState().catch(err => {
        logger.error('Failed to export state', { error: err.message });
      });
    }, 10000);

    logger.info('State exporter started');
  }

  /**
   * Stop state export
   */
  stop() {
    if (this.exportInterval) {
      clearInterval(this.exportInterval);
      this.exportInterval = null;
    }

    logger.info('State exporter stopped');
  }

  /**
   * Export current bot state to JSON
   */
  async exportState() {
    try {
      const state = {
        timestamp: new Date().toISOString(),
        isRunning: this.botEngine.isRunning,
        state: this.botEngine.state,
        sessionState: this.components.sessionManager.sessionState,
        isMarketHours: this.components.sessionManager.isMarketHours,
        
        // Current position
        currentPosition: this.getCurrentPosition(),
        
        // Risk status
        risk: this.components.riskManager.getRiskStatus(),
        
        // Next event
        nextEvent: this.components.sessionManager.getTimeUntilEvent(),
        
        // Opening range (if calculated)
        openingRange: this.botEngine.openingRange,
        
        // Golden ratio levels (if calculated)
        goldenRatioLevels: this.botEngine.goldenRatioLevels,
        
        // Spot price
        spotPrice: this.botEngine.spotPrice,
        
        // Recent candles (last 60 for 1-hour chart)
        recentCandles: this.getRecentCandles(60),
        
        // WebSocket connection status
        wsConnected: this.components.wsClient?.isConnected || false
      };

      await fs.writeFile(
        this.stateFile,
        JSON.stringify(state, null, 2)
      );

      logger.debug('State exported to file');

    } catch (error) {
      logger.error('Failed to export state', { error: error.message });
    }
  }

  /**
   * Get current position details
   */
  getCurrentPosition() {
    if (!this.botEngine.currentPosition) {
      return null;
    }

    const pos = this.botEngine.currentPosition;

    return {
      id: pos.id,
      instrument: pos.instrument,
      instrumentKey: pos.instrumentKey,
      side: pos.side,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      currentPrice: pos.currentPrice,
      entryTime: pos.entryTime,
      pnl: pos.pnl,
      pnlPercent: pos.pnlPercent,
      stopLoss: pos.stopLoss,
      target: pos.target,
      status: pos.status
    };
  }

  /**
   * Get recent candles for chart display
   */
  getRecentCandles(count = 60) {
    if (!this.components.candleHistory) {
      return [];
    }

    const candles = this.components.candleHistory.getRecentCandles(count);
    
    return candles.map(candle => ({
      timestamp: candle.timestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }));
  }
}

export default StateExporter;
