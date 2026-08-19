import { format, eachDayOfInterval, parse } from 'date-fns';
import { isTradingDay, isExpiryDay } from '../utils/date-utils.js';
import ORBStrategy from '../strategy/orb-strategy.js';
import GoldenRatioStrategy from '../strategy/golden-ratio-strategy.js';
import DataCache from '../data/data-cache.js';

/**
 * Enhanced Backtest Engine with Train/Test Split and Multi-Strategy Support
 */
class EnhancedBacktestEngine {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.dataCache = new DataCache(logger);
    this.results = {
      strategies: {}
    };
  }

  async runBacktest(instrument) {
    this.logger.info(`Starting enhanced backtest for ${instrument}`);

    const startDate = parse(this.config.backtest.startDate, 'yyyy-MM-dd', new Date());
    const endDate = parse(this.config.backtest.endDate, 'yyyy-MM-dd', new Date());

    const allDays = eachDayOfInterval({ start: startDate, end: endDate });
    const tradingDays = allDays.filter(day => isTradingDay(day));

    // Split into train and test periods
    const trainTestSplit = this.config.backtest.trainTestSplit || 0.7;
    const splitIndex = Math.floor(tradingDays.length * trainTestSplit);
    
    const trainDays = tradingDays.slice(0, splitIndex);
    const testDays = tradingDays.slice(splitIndex);

    this.logger.info(`Train/Test Split`, {
      totalDays: tradingDays.length,
      trainDays: trainDays.length,
      trainPeriod: `${format(trainDays[0], 'yyyy-MM-dd')} to ${format(trainDays[trainDays.length-1], 'yyyy-MM-dd')}`,
      testDays: testDays.length,
      testPeriod: `${format(testDays[0], 'yyyy-MM-dd')} to ${format(testDays[testDays.length-1], 'yyyy-MM-dd')}`
    });

    // Load all candles for Golden Ratio (needs previous day data)
    const allCandles = await this.loadAllCandles(instrument, tradingDays);

    // Run backtest for each strategy
    const strategies = this.config.backtest.strategies || ['ORB'];
    
    for (const strategyName of strategies) {
      this.logger.info(`\n${'='.repeat(80)}`);
      this.logger.info(`Backtesting ${strategyName} Strategy`);
      this.logger.info('='.repeat(80));

      // Training period
      const trainResults = await this.backtestPeriod(
        strategyName,
        instrument,
        trainDays,
        allCandles,
        'TRAINING'
      );

      // Testing period
      const testResults = await this.backtestPeriod(
        strategyName,
        instrument,
        testDays,
        allCandles,
        'TESTING'
      );

      // Store results
      this.results.strategies[strategyName] = {
        training: trainResults,
        testing: testResults,
        combined: this.combineResults(trainResults, testResults)
      };
    }

    // Calculate comparative analysis
    this.calculateComparison();

    return this.results;
  }

  async loadAllCandles(instrument, tradingDays) {
    const allCandles = [];
    
    for (const day of tradingDays) {
      const candles = this.dataCache.loadFromCache(instrument, day);
      if (candles && candles.length > 0) {
        allCandles.push(...candles);
      }
    }

    return allCandles;
  }

  async backtestPeriod(strategyName, instrument, tradingDays, allCandles, periodName) {
    this.logger.info(`\nBacktesting ${periodName} Period: ${tradingDays.length} days`);

    // Create strategy instance
    let strategy;
    if (strategyName === 'ORB') {
      strategy = new ORBStrategy(this.config, this.logger);
    } else if (strategyName === 'GOLDEN_RATIO') {
      strategy = new GoldenRatioStrategy(this.config, this.logger);
    } else {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }

    const results = {
      trades: [],
      dailyResults: [],
      period: periodName
    };

    for (const day of tradingDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Check if it's an expiry day (controlled by config.backtest.skipExpiryDays)
      const isExpiry = isExpiryDay(day, instrument, this.config);
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
      let dayResult;
      if (strategyName === 'GOLDEN_RATIO') {
        dayResult = strategy.processDay(candles, day, allCandles);
      } else {
        dayResult = strategy.processDay(candles, day, instrument);
      }

      // Record results
      results.dailyResults.push({
        date: dateStr,
        trades: dayResult.trades.length,
        pnl: dayResult.dailyPnL || 0,
        openingRange: dayResult.openingRange,
        reason: dayResult.reason
      });

      // Add trades to overall results
      if (dayResult.trades && dayResult.trades.length > 0) {
        results.trades.push(...dayResult.trades.map(t => ({
          ...t,
          date: dateStr,
          instrument,
          strategy: strategyName,
          period: periodName
        })));
      }

      this.logger.debug(`Processed ${dateStr}`, {
        trades: dayResult.trades.length,
        pnl: dayResult.dailyPnL
      });
    }

    // Calculate summary statistics
    this.calculateSummary(results, instrument, strategyName, periodName);

    return results;
  }

  calculateSummary(results, instrument, strategyName, periodName) {
    const trades = results.trades;

    if (trades.length === 0) {
      this.logger.warn(`No trades executed in ${periodName} period for ${strategyName}`);
      results.summary = {
        instrument,
        strategy: strategyName,
        period: periodName,
        totalTrades: 0,
        message: 'No trades executed - strategy may need adjustment or data issues'
      };
      return;
    }

    const winningTrades = trades.filter(t => t.pnlPercent > 0);
    const losingTrades = trades.filter(t => t.pnlPercent < 0);
    
    const totalPnLPercent = trades.reduce((sum, t) => sum + t.pnlPercent, 0);
    
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

    // Expectancy
    const expectancy = (winRate / 100 * avgWin) + ((100 - winRate) / 100 * avgLoss);

    results.summary = {
      instrument,
      strategy: strategyName,
      period: periodName,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winRate.toFixed(2) + '%',
      avgWin: avgWin.toFixed(2) + '%',
      avgLoss: avgLoss.toFixed(2) + '%',
      profitFactor: profitFactor.toFixed(2),
      expectancy: expectancy.toFixed(2) + '%',
      totalPnLPercent: totalPnLPercent.toFixed(2) + '%',
      maxDrawdown: maxDrawdown.toFixed(2) + '%',
      capital: {
        initial: capital,
        final: parseFloat(finalCapital.toFixed(2)),
        pnl: parseFloat(totalPnLCurrency.toFixed(2))
      },
      tradingDays: results.dailyResults.length,
      avgTradesPerDay: (trades.length / results.dailyResults.length).toFixed(2)
    };

    // Statistical edge determination
    const hasEdge = this.evaluateStatisticalEdge(results.summary);
    results.summary.hasStatisticalEdge = hasEdge.decision;
    results.summary.edgeAnalysis = hasEdge.analysis;
    results.summary.edgeScore = hasEdge.score;

    this.logger.info(`${periodName} Period Summary calculated`, results.summary);
  }

  evaluateStatisticalEdge(summary) {
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
      analysis.push('✗ Win rate is below 50%');
    }

    // Criteria 2: Profit factor
    if (profitFactor >= 1.5) {
      analysis.push('✓ Profit factor is strong (≥1.5)');
      score++;
    } else if (profitFactor >= 1.0) {
      analysis.push('⚠ Profit factor is marginal (≥1.0 but <1.5)');
      score += 0.5;
    } else {
      analysis.push('✗ Profit factor is negative');
    }

    // Criteria 3: Positive expectancy
    if (expectancy > 0) {
      analysis.push('✓ Positive expectancy');
      score++;
    } else {
      analysis.push('✗ Negative expectancy');
    }

    // Criteria 4: Sample size
    if (totalTrades >= 30) {
      analysis.push('✓ Sufficient sample size (≥30 trades)');
      score++;
    } else {
      analysis.push('⚠ Limited sample size (<30 trades)');
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
      analysis.push('✗ High drawdown (≥20%)');
    }

    const decision = score >= 3.5;

    return {
      decision,
      score: `${score}/5`,
      analysis,
      recommendation: decision
        ? 'Strategy shows statistical edge in this period.'
        : 'Strategy does NOT show statistical edge in this period.'
    };
  }

  combineResults(trainResults, testResults) {
    return {
      totalTrades: trainResults.trades.length + testResults.trades.length,
      trainTrades: trainResults.trades.length,
      testTrades: testResults.trades.length,
      trainHasEdge: trainResults.summary.hasStatisticalEdge,
      testHasEdge: testResults.summary.hasStatisticalEdge,
      bothHaveEdge: trainResults.summary.hasStatisticalEdge && testResults.summary.hasStatisticalEdge,
      overfittingDetected: trainResults.summary.hasStatisticalEdge && !testResults.summary.hasStatisticalEdge
    };
  }

  calculateComparison() {
    this.results.comparison = {
      strategies: Object.keys(this.results.strategies),
      bestTrainStrategy: null,
      bestTestStrategy: null,
      recommendation: null
    };

    let bestTrainScore = 0;
    let bestTestScore = 0;

    for (const [strategyName, results] of Object.entries(this.results.strategies)) {
      const trainScore = parseFloat(results.training.summary.edgeScore.split('/')[0]);
      const testScore = parseFloat(results.testing.summary.edgeScore.split('/')[0]);

      if (trainScore > bestTrainScore) {
        bestTrainScore = trainScore;
        this.results.comparison.bestTrainStrategy = strategyName;
      }

      if (testScore > bestTestScore) {
        bestTestScore = testScore;
        this.results.comparison.bestTestStrategy = strategyName;
      }
    }

    // Generate recommendation
    this.generateRecommendation();
  }

  generateRecommendation() {
    const strategies = Object.keys(this.results.strategies);
    const comparison = this.results.comparison;
    
    let recommendation = [];

    for (const strategy of strategies) {
      const result = this.results.strategies[strategy];
      
      if (result.combined.bothHaveEdge) {
        recommendation.push(`✓ ${strategy}: Shows edge in BOTH train and test periods - VIABLE STRATEGY`);
      } else if (result.combined.overfittingDetected) {
        recommendation.push(`✗ ${strategy}: Shows edge only in training period - OVERFITTING DETECTED - NOT VIABLE`);
      } else if (!result.combined.trainHasEdge && !result.combined.testHasEdge) {
        recommendation.push(`✗ ${strategy}: No edge in either period - NOT VIABLE`);
      } else if (!result.combined.trainHasEdge && result.combined.testHasEdge) {
        recommendation.push(`⚠ ${strategy}: Edge only in test period - INSUFFICIENT DATA - needs more validation`);
      }
    }

    comparison.recommendation = recommendation;
    
    // Overall decision
    const viableStrategies = strategies.filter(s => 
      this.results.strategies[s].combined.bothHaveEdge
    );

    if (viableStrategies.length > 0) {
      comparison.decision = 'PASS';
      comparison.message = `${viableStrategies.join(', ')} show(s) genuine edge. Proceed to Phase 2.`;
    } else {
      comparison.decision = 'FAIL';
      comparison.message = 'NO strategy shows genuine edge in both periods. DO NOT proceed to Phase 2.';
    }
  }

  generateReport() {
    const report = {
      title: 'Enhanced ORB Strategy Backtest Report (Train/Test Split)',
      timestamp: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      strategies: this.results.strategies,
      comparison: this.results.comparison
    };

    // Save to file
    const filename = this.dataCache.saveBacktestResults(report, 'enhanced_orb');
    
    return filename;
  }

  printReport() {
    console.log('\n' + '='.repeat(80));
    console.log('ENHANCED ORB STRATEGY BACKTEST REPORT');
    console.log('Train/Test Split Validation');
    console.log('='.repeat(80) + '\n');

    for (const [strategyName, results] of Object.entries(this.results.strategies)) {
      console.log(`\n${'-'.repeat(80)}`);
      console.log(`STRATEGY: ${strategyName}`);
      console.log('-'.repeat(80));

      // Training period
      this.printPeriodSummary('TRAINING', results.training.summary);

      // Testing period
      this.printPeriodSummary('TESTING', results.testing.summary);

      // Combined analysis
      console.log(`\nCOMBINED ANALYSIS:`);
      console.log(`Train Edge: ${results.combined.trainHasEdge ? '✓ YES' : '✗ NO'}`);
      console.log(`Test Edge: ${results.combined.testHasEdge ? '✓ YES' : '✗ NO'}`);
      console.log(`Both Periods: ${results.combined.bothHaveEdge ? '✓ VIABLE' : '✗ NOT VIABLE'}`);
      console.log(`Overfitting: ${results.combined.overfittingDetected ? '⚠ DETECTED' : '✓ NOT DETECTED'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('COMPARATIVE ANALYSIS');
    console.log('='.repeat(80));
    
    this.results.comparison.recommendation.forEach(line => {
      console.log(`  ${line}`);
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log('FINAL DECISION');
    console.log('='.repeat(80));
    console.log(`Decision: ${this.results.comparison.decision}`);
    console.log(`${this.results.comparison.message}`);
    console.log('='.repeat(80) + '\n');
  }

  printPeriodSummary(periodName, summary) {
    console.log(`\n${periodName} PERIOD:`);
    console.log(`Total Trades: ${summary.totalTrades}`);
    console.log(`Win Rate: ${summary.winRate}`);
    console.log(`Profit Factor: ${summary.profitFactor}`);
    console.log(`Expectancy: ${summary.expectancy}`);
    console.log(`Total P&L: ${summary.totalPnLPercent}`);
    console.log(`Max Drawdown: ${summary.maxDrawdown}`);
    console.log(`Edge Score: ${summary.edgeScore}`);
    console.log(`Has Edge: ${summary.hasStatisticalEdge ? '✓ YES' : '✗ NO'}`);
  }
}

export default EnhancedBacktestEngine;
