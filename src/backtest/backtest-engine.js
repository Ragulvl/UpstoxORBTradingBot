import { format, eachDayOfInterval, parse } from 'date-fns';
import { isTradingDay, isExpiryDay } from '../utils/date-utils.js';
import ORBStrategy from '../strategy/orb-strategy.js';
import DataCache from '../data/data-cache.js';

class BacktestEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.dataCache = new DataCache(logger);
    this.results = {
      trades: [],
      dailyResults: [],
      summary: {}
    };
  }

  async runBacktest(instrument) {
    this.logger.info(`Starting backtest for ${instrument}`);

    const startDate = parse(this.config.backtest.startDate, 'yyyy-MM-dd', new Date());
    const endDate = parse(this.config.backtest.endDate, 'yyyy-MM-dd', new Date());

    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const tradingDays = allDays.filter(day => isTradingDay(day));

    this.logger.info(`Backtesting ${tradingDays.length} trading days`, {
      start: format(startDate, 'yyyy-MM-dd'),
      end: format(endDate, 'yyyy-MM-dd')
    });

    const strategy = new ORBStrategy(this.config, this.logger);

    for (const day of tradingDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Check if it's an expiry day
      const isExpiry = isExpiryDay(day, instrument);
      if (isExpiry) {
        this.logger.info(`Skipping expiry day: ${dateStr}`);
        continue;
      }

      // Load data from cache
      const candles = this.dataCache.loadFromCache(instrument, day);

      if (!candles || candles.length === 0) {
        this.logger.warn(`No data found for ${dateStr}, skipping`);
        continue;
      }

      // Process the day
      const dayResult = strategy.processDay(candles, day);

      // Record results
      this.results.dailyResults.push({
        date: dateStr,
        trades: dayResult.trades.length,
        pnl: dayResult.dailyPnL || 0,
        openingRange: dayResult.openingRange,
        reason: dayResult.reason
      });

      // Add trades to overall results
      if (dayResult.trades && dayResult.trades.length > 0) {
        this.results.trades.push(...dayResult.trades.map(t => ({
          ...t,
          date: dateStr,
          instrument
        })));
      }

      this.logger.debug(`Processed ${dateStr}`, {
        trades: dayResult.trades.length,
        pnl: dayResult.dailyPnL
      });
    }

    // Calculate summary statistics
    this.calculateSummary(instrument);

    return this.results;
  }

  calculateSummary(instrument) {
    const trades = this.results.trades;

    if (trades.length === 0) {
      this.logger.warn('No trades executed during backtest period');
      this.results.summary = {
        instrument,
        totalTrades: 0,
        message: 'No trades executed - strategy may need adjustment or data issues'
      };
      return;
    }

    const winningTrades = trades.filter(t => t.pnlPercent > 0);
    const losingTrades = trades.filter(t => t.pnlPercent < 0);
    
    const totalPnLPercent = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
    const totalPnLPoints = trades.reduce((sum, t) => sum + t.pnlPoints, 0);
    
    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
      : 0;
    
    const avgLoss = losingTrades.length > 0
      ? losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length
      : 0;

    const winRate = (winningTrades.length / trades.length) * 100;

    // Calculate max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnL = 0;

    for (const trade of trades) {
      runningPnL += trade.pnlPercent;
      if (runningPnL > peak) {
        peak = runningPnL;
      }
      const drawdown = peak - runningPnL;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // Calculate profit factor
    const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0);
    const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0;

    // Calculate P&L in currency based on capital
    const capital = this.config.trading.capital;
    const totalPnLCurrency = (totalPnLPercent / 100) * capital;
    const finalCapital = capital + totalPnLCurrency;

    // Expectancy = (Win Rate * Avg Win) - (Loss Rate * Avg Loss)
    const expectancy = (winRate / 100 * avgWin) + ((100 - winRate) / 100 * avgLoss);

    this.results.summary = {
      instrument,
      period: {
        start: this.config.backtest.startDate,
        end: this.config.backtest.endDate
      },
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winRate.toFixed(2) + '%',
      avgWin: avgWin.toFixed(2) + '%',
      avgLoss: avgLoss.toFixed(2) + '%',
      profitFactor: profitFactor.toFixed(2),
      expectancy: expectancy.toFixed(2) + '%',
      totalPnLPercent: totalPnLPercent.toFixed(2) + '%',
      totalPnLPoints: totalPnLPoints.toFixed(2),
      maxDrawdown: maxDrawdown.toFixed(2) + '%',
      capital: {
        initial: capital,
        final: finalCapital.toFixed(2),
        pnl: totalPnLCurrency.toFixed(2)
      },
      tradingDays: this.results.dailyResults.length,
      avgTradesPerDay: (trades.length / this.results.dailyResults.length).toFixed(2)
    };

    // Statistical edge determination
    const hasEdge = this.evaluateStatisticalEdge();
    this.results.summary.hasStatisticalEdge = hasEdge.decision;
    this.results.summary.edgeAnalysis = hasEdge.analysis;

    this.logger.info('Backtest summary calculated', this.results.summary);
  }

  evaluateStatisticalEdge() {
    const summary = this.results.summary;
    const winRate = parseFloat(summary.winRate);
    const profitFactor = parseFloat(summary.profitFactor);
    const expectancy = parseFloat(summary.expectancy);
    const totalTrades = summary.totalTrades;

    const analysis = [];
    let score = 0;

    // Criteria 1: Win rate
    if (winRate >= 50) {
      analysis.push('✓ Win rate is acceptable (≥50%)');
      score++;
    } else {
      analysis.push('✗ Win rate is below 50% - strategy needs improvement');
    }

    // Criteria 2: Profit factor
    if (profitFactor >= 1.5) {
      analysis.push('✓ Profit factor is strong (≥1.5)');
      score++;
    } else if (profitFactor >= 1.0) {
      analysis.push('⚠ Profit factor is marginal (≥1.0 but <1.5)');
      score += 0.5;
    } else {
      analysis.push('✗ Profit factor is negative - strategy loses money');
    }

    // Criteria 3: Positive expectancy
    if (expectancy > 0) {
      analysis.push('✓ Positive expectancy - strategy has edge');
      score++;
    } else {
      analysis.push('✗ Negative expectancy - strategy has no edge');
    }

    // Criteria 4: Sample size
    if (totalTrades >= 30) {
      analysis.push('✓ Sufficient sample size (≥30 trades)');
      score++;
    } else {
      analysis.push('⚠ Limited sample size (<30 trades) - results may not be statistically significant');
      score += 0.5;
    }

    // Criteria 5: Max drawdown
    const maxDD = parseFloat(summary.maxDrawdown);
    if (maxDD < 10) {
      analysis.push('✓ Low drawdown (<10%)');
      score++;
    } else if (maxDD < 20) {
      analysis.push('⚠ Moderate drawdown (10-20%)');
      score += 0.5;
    } else {
      analysis.push('✗ High drawdown (≥20%) - high risk');
    }

    // Decision: need at least 3.5 out of 5 points
    const decision = score >= 3.5;

    return {
      decision,
      score: `${score}/5`,
      analysis,
      recommendation: decision
        ? 'Strategy shows statistical edge. Proceed to Phase 2 (Sandbox Bot).'
        : 'Strategy does NOT show statistical edge. Review and optimize before proceeding.'
    };
  }

  generateReport() {
    const report = {
      title: 'ORB Strategy Backtest Report',
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      summary: this.results.summary,
      trades: this.results.trades,
      dailyResults: this.results.dailyResults
    };

    // Save to file
    const filename = this.dataCache.saveBacktestResults(report, 'orb');
    
    // Also export trades to CSV for easy analysis
    if (this.results.trades.length > 0) {
      const csvFilename = `trades_${this.results.summary.instrument}_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`;
      this.dataCache.exportToCSV(this.results.trades, csvFilename);
    }

    return filename;
  }

  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('ORB STRATEGY BACKTEST REPORT');
    console.log('='.repeat(80));
    console.log(`Instrument: ${this.results.summary.instrument}`);
    console.log(`Period: ${this.results.summary.period.start} to ${this.results.summary.period.end}`);
    console.log(`Trading Days: ${this.results.summary.tradingDays}`);
    console.log('-'.repeat(80));
    console.log('PERFORMANCE METRICS:');
    console.log(`Total Trades: ${this.results.summary.totalTrades}`);
    console.log(`Winning Trades: ${this.results.summary.winningTrades}`);
    console.log(`Losing Trades: ${this.results.summary.losingTrades}`);
    console.log(`Win Rate: ${this.results.summary.winRate}`);
    console.log(`Average Win: ${this.results.summary.avgWin}`);
    console.log(`Average Loss: ${this.results.summary.avgLoss}`);
    console.log(`Profit Factor: ${this.results.summary.profitFactor}`);
    console.log(`Expectancy: ${this.results.summary.expectancy}`);
    console.log('-'.repeat(80));
    console.log('PROFIT & LOSS:');
    console.log(`Total P&L (Percent): ${this.results.summary.totalPnLPercent}`);
    console.log(`Total P&L (Points): ${this.results.summary.totalPnLPoints}`);
    console.log(`Initial Capital: ₹${this.results.summary.capital.initial.toLocaleString()}`);
    console.log(`Final Capital: ₹${this.results.summary.capital.final.toLocaleString()}`);
    console.log(`Net P&L: ₹${this.results.summary.capital.pnl.toLocaleString()}`);
    console.log(`Max Drawdown: ${this.results.summary.maxDrawdown}`);
    console.log('-'.repeat(80));
    console.log('STATISTICAL EDGE ANALYSIS:');
    console.log(`Score: ${this.results.summary.edgeAnalysis.score}`);
    this.results.summary.edgeAnalysis.analysis.forEach(line => {
      console.log(`  ${line}`);
    });
    console.log(`\nDecision: ${this.results.summary.hasStatisticalEdge ? '✓ HAS EDGE' : '✗ NO EDGE'}`);
    console.log(`Recommendation: ${this.results.summary.edgeAnalysis.recommendation}`);
    console.log('='.repeat(80) + '\n');
  }
}

export default BacktestEngine;
