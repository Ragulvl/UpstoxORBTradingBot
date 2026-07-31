import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
import { format } from 'date-fns';
import { logger } from '../utils/logger.js';

/**
 * Trade Journal
 * 
 * Records every trade with full context:
 * - Entry/exit details
 * - Raw and cost-adjusted P&L
 * - Cost breakdown
 * - Signal reasoning
 * - CSV and JSON export
 */
export class TradeJournal {
  constructor(config) {
    this.config = config;
    this.trades = [];
    this.journalDir = path.join(process.cwd(), 'logs', 'trades');
    this.currentDate = format(new Date(), 'yyyy-MM-dd');
  }

  /**
   * Initialize trade journal
   */
  async initialize() {
    try {
      // Create journal directory if not exists
      await fs.mkdir(this.journalDir, { recursive: true });
      
      logger.info('Trade journal initialized', {
        directory: this.journalDir
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize trade journal', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Log a complete trade (entry + exit)
   */
  async logTrade(trade) {
    const journalEntry = {
      id: trade.id || this.generateTradeId(),
      date: format(new Date(), 'yyyy-MM-dd'),
      timestamp: new Date().toISOString(),
      
      // Instrument details
      instrument: trade.instrument,
      instrumentKey: trade.instrumentKey,
      underlying: trade.underlying || 'NIFTY',
      
      // Entry
      entry: {
        time: trade.entry.time,
        signal: trade.entry.signal || 'BREAKOUT',
        signalPrice: trade.entry.signalPrice,
        orderPrice: trade.entry.orderPrice,
        fillPrice: trade.entry.fillPrice,
        slippage: trade.entry.slippage || 0,
        premium: trade.entry.premium,
        quantity: trade.quantity,
        bid: trade.entry.bid,
        ask: trade.entry.ask,
        spread: trade.entry.spread,
        spreadCost: trade.entry.spreadCost,
        orderId: trade.entry.orderId
      },
      
      // Exit
      exit: {
        time: trade.exit.time,
        reason: trade.exit.reason, // STOP_LOSS, TARGET, HARD_EXIT, MANUAL
        signalPrice: trade.exit.signalPrice,
        fillPrice: trade.exit.fillPrice,
        slippage: trade.exit.slippage || 0,
        bid: trade.exit.bid,
        ask: trade.exit.ask,
        spread: trade.exit.spread,
        spreadCost: trade.exit.spreadCost,
        orderId: trade.exit.orderId
      },
      
      // P&L
      pnl: {
        raw: trade.pnl.raw,
        adjusted: trade.pnl.adjusted,
        difference: trade.pnl.raw - trade.pnl.adjusted
      },
      
      // Costs
      costs: trade.costs || {},
      
      // Duration
      durationMinutes: this.calculateDuration(trade.entry.time, trade.exit.time),
      
      // Strategy details
      strategy: trade.strategy || 'GOLDEN_RATIO',
      openingRange: trade.openingRange || null,
      goldenRatioLevels: trade.goldenRatioLevels || null,
      
      // Verdict
      outcome: trade.pnl.adjusted > 0 ? 'WIN' : 'LOSS',
      verdict: trade.verdict || null
    };

    this.trades.push(journalEntry);

    logger.info('Trade logged', {
      id: journalEntry.id,
      instrument: journalEntry.instrument,
      outcome: journalEntry.outcome,
      rawPnL: journalEntry.pnl.raw.toFixed(2),
      adjustedPnL: journalEntry.pnl.adjusted.toFixed(2),
      costs: journalEntry.pnl.difference.toFixed(2)
    });

    // Append to daily CSV
    await this.appendToCSV(journalEntry);
    
    // Append to daily JSON
    await this.appendToJSON(journalEntry);

    return journalEntry;
  }

  /**
   * Calculate trade duration
   */
  calculateDuration(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    return Math.floor((exit - entry) / 1000 / 60);
  }

  /**
   * Append trade to daily CSV file
   */
  async appendToCSV(trade) {
    try {
      const csvFile = path.join(
        this.journalDir,
        `trades_${format(new Date(), 'yyyy-MM-dd')}.csv`
      );

      // Check if file exists to determine if we need headers
      let needsHeader = false;
      try {
        await fs.access(csvFile);
      } catch {
        needsHeader = true;
      }

      // CSV row
      const row = [
        trade.id,
        trade.date,
        trade.timestamp,
        trade.instrument,
        trade.strategy,
        trade.entry.time,
        trade.entry.fillPrice,
        trade.quantity,
        trade.exit.time,
        trade.exit.fillPrice,
        trade.exit.reason,
        trade.durationMinutes,
        trade.pnl.raw.toFixed(2),
        trade.pnl.adjusted.toFixed(2),
        trade.pnl.difference.toFixed(2),
        trade.outcome,
        trade.costs.total?.total?.toFixed(2) || '0',
        trade.entry.spread || '0',
        trade.exit.spread || '0'
      ];

      // Prepare CSV content
      let csvContent = '';
      
      if (needsHeader) {
        const headers = [
          'TradeID', 'Date', 'Timestamp', 'Instrument', 'Strategy',
          'EntryTime', 'EntryPrice', 'Quantity', 'ExitTime', 'ExitPrice', 'ExitReason',
          'Duration(min)', 'RawPnL', 'AdjustedPnL', 'Costs', 'Outcome',
          'TotalCosts', 'EntrySpread', 'ExitSpread'
        ];
        csvContent = headers.join(',') + '\n';
      }
      
      csvContent += row.join(',') + '\n';

      // Append to file
      await fs.appendFile(csvFile, csvContent);

      logger.debug('Trade appended to CSV', { file: csvFile });

    } catch (error) {
      logger.error('Failed to append to CSV', {
        error: error.message
      });
    }
  }

  /**
   * Append trade to daily JSON file
   */
  async appendToJSON(trade) {
    try {
      const jsonFile = path.join(
        this.journalDir,
        `trades_${format(new Date(), 'yyyy-MM-dd')}.json`
      );

      // Load existing trades
      let existingTrades = [];
      try {
        const data = await fs.readFile(jsonFile, 'utf8');
        existingTrades = JSON.parse(data);
      } catch {
        // File doesn't exist or empty
        existingTrades = [];
      }

      // Add new trade
      existingTrades.push(trade);

      // Write back
      await fs.writeFile(
        jsonFile,
        JSON.stringify(existingTrades, null, 2)
      );

      logger.debug('Trade appended to JSON', { file: jsonFile });

    } catch (error) {
      logger.error('Failed to append to JSON', {
        error: error.message
      });
    }
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary(date = new Date()) {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayTrades = this.trades.filter(t => t.date === dateStr);

    if (dayTrades.length === 0) {
      return {
        date: dateStr,
        totalTrades: 0,
        message: 'No trades today'
      };
    }

    const wins = dayTrades.filter(t => t.outcome === 'WIN');
    const losses = dayTrades.filter(t => t.outcome === 'LOSS');

    const totalRawPnL = dayTrades.reduce((sum, t) => sum + t.pnl.raw, 0);
    const totalAdjustedPnL = dayTrades.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    const totalCosts = dayTrades.reduce((sum, t) => sum + t.pnl.difference, 0);

    const avgDuration = dayTrades.reduce((sum, t) => sum + t.durationMinutes, 0) / dayTrades.length;

    const summary = {
      date: dateStr,
      totalTrades: dayTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: ((wins.length / dayTrades.length) * 100).toFixed(1),
      rawPnL: totalRawPnL.toFixed(2),
      adjustedPnL: totalAdjustedPnL.toFixed(2),
      totalCosts: totalCosts.toFixed(2),
      costAsPercentOfRaw: ((totalCosts / Math.abs(totalRawPnL)) * 100).toFixed(1),
      avgDuration: avgDuration.toFixed(1),
      trades: dayTrades.map(t => ({
        id: t.id,
        instrument: t.instrument,
        entry: t.entry.fillPrice,
        exit: t.exit.fillPrice,
        rawPnL: t.pnl.raw.toFixed(2),
        adjustedPnL: t.pnl.adjusted.toFixed(2),
        outcome: t.outcome
      }))
    };

    logger.info('Daily summary generated', {
      date: dateStr,
      trades: summary.totalTrades,
      winRate: summary.winRate,
      adjustedPnL: summary.adjustedPnL
    });

    // Save summary to file
    await this.saveSummary(summary, 'daily');

    return summary;
  }

  /**
   * Generate weekly summary
   */
  async generateWeeklySummary() {
    const allTrades = this.trades;

    if (allTrades.length === 0) {
      return {
        totalTrades: 0,
        message: 'No trades this week'
      };
    }

    const wins = allTrades.filter(t => t.outcome === 'WIN');
    const losses = allTrades.filter(t => t.outcome === 'LOSS');

    const totalRawPnL = allTrades.reduce((sum, t) => sum + t.pnl.raw, 0);
    const totalAdjustedPnL = allTrades.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    const totalCosts = allTrades.reduce((sum, t) => sum + t.pnl.difference, 0);

    // Calculate profit factor
    const grossProfit = wins.reduce((sum, t) => sum + t.pnl.adjusted, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl.adjusted, 0));
    const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss) : 0;

    const summary = {
      period: `Week ending ${format(new Date(), 'yyyy-MM-dd')}`,
      totalTrades: allTrades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: ((wins.length / allTrades.length) * 100).toFixed(1),
      rawPnL: totalRawPnL.toFixed(2),
      adjustedPnL: totalAdjustedPnL.toFixed(2),
      totalCosts: totalCosts.toFixed(2),
      costAsPercentOfRaw: ((totalCosts / Math.abs(totalRawPnL)) * 100).toFixed(1),
      profitFactor: profitFactor.toFixed(2),
      avgWin: wins.length > 0 ? (grossProfit / wins.length).toFixed(2) : '0',
      avgLoss: losses.length > 0 ? (grossLoss / losses.length).toFixed(2) : '0',
      verdict: profitFactor > 1.2 ? 'PASS' : profitFactor > 1.0 ? 'MARGINAL' : 'FAIL'
    };

    logger.info('Weekly summary generated', {
      trades: summary.totalTrades,
      profitFactor: summary.profitFactor,
      verdict: summary.verdict
    });

    // Save summary to file
    await this.saveSummary(summary, 'weekly');

    return summary;
  }

  /**
   * Save summary to text file
   */
  async saveSummary(summary, type = 'daily') {
    try {
      const summaryFile = path.join(
        this.journalDir,
        `summary_${type}_${format(new Date(), 'yyyy-MM-dd')}.txt`
      );

      const content = this.formatSummaryText(summary, type);

      await fs.writeFile(summaryFile, content);

      logger.info('Summary saved', { file: summaryFile });

    } catch (error) {
      logger.error('Failed to save summary', {
        error: error.message
      });
    }
  }

  /**
   * Format summary as readable text
   */
  formatSummaryText(summary, type) {
    let text = `\n${'='.repeat(60)}\n`;
    text += `${type.toUpperCase()} TRADING SUMMARY\n`;
    text += `${'='.repeat(60)}\n\n`;

    if (type === 'daily') {
      text += `Date: ${summary.date}\n`;
    } else {
      text += `Period: ${summary.period}\n`;
    }

    text += `\nPerformance:\n`;
    text += `  Total Trades: ${summary.totalTrades}\n`;
    text += `  Wins: ${summary.wins} | Losses: ${summary.losses}\n`;
    text += `  Win Rate: ${summary.winRate}%\n`;

    if (summary.profitFactor) {
      text += `  Profit Factor: ${summary.profitFactor}\n`;
      text += `  Avg Win: ₹${summary.avgWin} | Avg Loss: ₹${summary.avgLoss}\n`;
    }

    text += `\nP&L:\n`;
    text += `  Raw P&L: ₹${summary.rawPnL}\n`;
    text += `  Adjusted P&L: ₹${summary.adjustedPnL}\n`;
    text += `  Total Costs: ₹${summary.totalCosts} (${summary.costAsPercentOfRaw}% of raw)\n`;

    if (summary.verdict) {
      text += `\nVerdict: ${summary.verdict}\n`;
    }

    text += `\n${'='.repeat(60)}\n`;

    return text;
  }

  /**
   * Get all trades
   */
  getAllTrades() {
    return this.trades;
  }

  /**
   * Get trades for specific date
   */
  getTradesByDate(date) {
    const dateStr = format(new Date(date), 'yyyy-MM-dd');
    return this.trades.filter(t => t.date === dateStr);
  }

  /**
   * Generate trade ID
   */
  generateTradeId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `TR-${format(new Date(), 'yyyyMMdd')}-${random}`;
  }

  /**
   * Clear trades (start fresh)
   */
  clear() {
    this.trades = [];
    logger.info('Trade journal cleared');
  }
}

export default TradeJournal;
