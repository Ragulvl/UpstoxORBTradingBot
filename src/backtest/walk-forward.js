import { format, eachDayOfInterval, parse, addMonths, subDays } from 'date-fns';
import { isTradingDay } from '../utils/date-utils.js';
import EnhancedBacktestEngine from './enhanced-backtest-engine.js';

/**
 * Walk-Forward Backtester
 *
 * Replaces the naive 70/30 single split with rolling out-of-sample windows.
 * This prevents overfitting and validates that the strategy works on data
 * it has NEVER seen during the "training" (parameter-selection) phase.
 *
 * Architecture:
 *   ┌──────────────────────┬──────────┐  Window 1
 *        TRAIN (3 months)    TEST (1m)
 *         ┌──────────────────────┬──────────┐  Window 2
 *              TRAIN (3m)          TEST (1m)
 *                  ┌──────────────────────┬──────────┐  Window 3
 *                       TRAIN (3m)          TEST (1m)
 *
 * Output metrics (aggregated across ALL out-of-sample windows):
 *   - Combined OOS return, Sharpe, max drawdown, win rate
 *   - Per-window breakdown to spot regime sensitivity
 *   - Consistency score: % of windows profitable
 */
class WalkForwardBacktester {
  constructor(config, logger, options = {}) {
    this.config = config;
    this.logger = logger;

    // Walk-forward parameters
    this.trainMonths  = options.trainMonths  ?? 3;  // Training window length
    this.testMonths   = options.testMonths   ?? 1;  // Out-of-sample test length
    this.stepMonths   = options.stepMonths   ?? 1;  // Roll-forward step size
    this.strategies   = options.strategies  ?? config.backtest?.strategies ?? ['ORB'];
  }

  /**
   * Run walk-forward validation for a single instrument.
   * Returns per-window results AND aggregated OOS statistics.
   */
  async run(instrument) {
    const globalStart = parse(this.config.backtest.startDate, 'yyyy-MM-dd', new Date());
    const globalEnd   = parse(this.config.backtest.endDate,   'yyyy-MM-dd', new Date());

    const allTradingDays = eachDayOfInterval({ start: globalStart, end: globalEnd })
      .filter(d => isTradingDay(d));

    const windows = this.buildWindows(globalStart, globalEnd);

    if (windows.length === 0) {
      this.logger.error('Walk-forward: Not enough data to form even one window', {
        trainMonths: this.trainMonths,
        testMonths: this.testMonths,
        totalMonths: this.monthsBetween(globalStart, globalEnd)
      });
      return null;
    }

    this.logger.info('='.repeat(80));
    this.logger.info(`Walk-Forward Backtest: ${instrument}`);
    this.logger.info('='.repeat(80));
    this.logger.info(`Windows: ${windows.length}  |  Train: ${this.trainMonths}m  |  Test: ${this.testMonths}m  |  Step: ${this.stepMonths}m`);

    const windowResults = [];

    for (let i = 0; i < windows.length; i++) {
      const w = windows[i];
      this.logger.info(`\n── Window ${i + 1}/${windows.length} ──────────────────────────────`);
      this.logger.info(`   Train: ${format(w.trainStart, 'yyyy-MM-dd')} → ${format(w.trainEnd, 'yyyy-MM-dd')}`);
      this.logger.info(`   Test:  ${format(w.testStart,  'yyyy-MM-dd')} → ${format(w.testEnd,  'yyyy-MM-dd')}`);

      const trainDays = allTradingDays.filter(d => d >= w.trainStart && d <= w.trainEnd);
      const testDays  = allTradingDays.filter(d => d >= w.testStart  && d <= w.testEnd);

      if (trainDays.length < 10 || testDays.length < 3) {
        this.logger.warn(`Window ${i + 1} skipped — too few trading days`, {
          trainDays: trainDays.length, testDays: testDays.length
        });
        continue;
      }

      // Patch config dates for this window and run the existing backtester
      const windowConfig = {
        ...this.config,
        backtest: {
          ...this.config.backtest,
          startDate: format(w.trainStart, 'yyyy-MM-dd'),
          endDate:   format(w.testEnd,    'yyyy-MM-dd'),
          // Force 70/30-equivalent using exact day counts
          _wfTrainDays: trainDays.length,
          _wfTestDays:  testDays.length,
          trainTestSplit: trainDays.length / (trainDays.length + testDays.length)
        }
      };

      try {
        const engine  = new EnhancedBacktestEngine(windowConfig, this.logger);
        const results = await engine.runBacktest(instrument);

        // Extract OOS (test) stats for each strategy
        const oosStats = {};
        for (const strategy of this.strategies) {
          const stratData = results?.strategies?.[strategy];
          if (!stratData) {
            this.logger.warn(`No results for strategy ${strategy} in window ${i + 1}`);
            continue;
          }

          // EnhancedBacktestEngine stores results under .testing.summary
          // All numeric fields are string-encoded: '15.50%', '1.19', etc.
          const s = stratData.testing?.summary;
          if (!s) {
            this.logger.warn(`No testing summary for ${strategy} in window ${i + 1}`);
            continue;
          }

          const parsePercent = v => parseFloat((v ?? '0').toString().replace('%', '')) || 0;
          const parseNum     = v => parseFloat((v ?? '0').toString()) || 0;

          oosStats[strategy] = {
            return:       parsePercent(s.totalPnLPercent),
            trades:       s.totalTrades       ?? 0,
            winRate:      parsePercent(s.winRate),
            sharpe:       parseNum(s.sharpeRatio ?? 0),  // not always present
            maxDrawdown:  parsePercent(s.maxDrawdown),
            profitFactor: parseNum(s.profitFactor),
            winningTrades: s.winningTrades    ?? 0,
            losingTrades:  s.losingTrades     ?? 0
          };
        }

        windowResults.push({
          window:     i + 1,
          trainStart: w.trainStart,
          trainEnd:   w.trainEnd,
          testStart:  w.testStart,
          testEnd:    w.testEnd,
          trainDays:  trainDays.length,
          testDays:   testDays.length,
          oos:        oosStats
        });

        this.logger.info(`Window ${i + 1} OOS result`, { oos: oosStats });

      } catch (err) {
        this.logger.error(`Window ${i + 1} failed`, { error: err.message });
        windowResults.push({
          window: i + 1, trainStart: w.trainStart, trainEnd: w.trainEnd,
          testStart: w.testStart, testEnd: w.testEnd,
          trainDays: trainDays.length, testDays: testDays.length,
          oos: {}, error: err.message
        });
      }
    }

    const summary = this.aggregateSummary(windowResults, instrument);
    this.printSummary(summary, instrument);
    return { windows: windowResults, summary };
  }

  // ─── Window builder ────────────────────────────────────────────────────────

  buildWindows(globalStart, globalEnd) {
    const windows = [];
    let trainStart = new Date(globalStart);

    while (true) {
      const trainEnd  = subDays(addMonths(trainStart, this.trainMonths), 1);
      const testStart = addMonths(trainStart, this.trainMonths);
      const testEnd   = subDays(addMonths(testStart, this.testMonths), 1);

      if (testEnd > globalEnd) break;

      windows.push({ trainStart: new Date(trainStart), trainEnd, testStart, testEnd });
      trainStart = addMonths(trainStart, this.stepMonths);
    }

    return windows;
  }

  monthsBetween(a, b) {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  }

  // ─── Aggregation ───────────────────────────────────────────────────────────

  aggregateSummary(windowResults, instrument) {
    const validWindows = windowResults.filter(w => !w.error && Object.keys(w.oos).length > 0);

    if (validWindows.length === 0) {
      return { instrument, valid: false, reason: 'All windows failed' };
    }

    const summary = { instrument, windowCount: validWindows.length, strategies: {} };

    for (const strategy of this.strategies) {
      const rows = validWindows
        .map(w => w.oos[strategy])
        .filter(Boolean);

      if (rows.length === 0) continue;

      const returns      = rows.map(r => r.return);
      const winRates     = rows.map(r => r.winRate);
      const sharpes      = rows.map(r => r.sharpe);
      const drawdowns    = rows.map(r => r.maxDrawdown);
      const profitFactors = rows.map(r => r.profitFactor);
      const profitable   = returns.filter(r => r > 0).length;

      summary.strategies[strategy] = {
        // Core OOS performance
        avgReturn:        this.avg(returns),
        medianReturn:     this.median(returns),
        totalReturn:      returns.reduce((a, b) => a + b, 0),
        avgWinRate:       this.avg(winRates),
        avgSharpe:        this.avg(sharpes),
        worstDrawdown:    Math.max(...drawdowns),
        avgProfitFactor:  this.avg(profitFactors),

        // Consistency (most important)
        consistencyScore: (profitable / rows.length) * 100, // % of windows profitable
        profitableWindows: profitable,
        totalWindows:      rows.length,

        // Return distribution
        bestWindow:  Math.max(...returns),
        worstWindow: Math.min(...returns),
        stdReturn:   this.std(returns),

        // Verdict
        verdict: this.verdict(profitable / rows.length, this.avg(sharpes), this.avg(returns))
      };
    }

    return summary;
  }

  verdict(consistency, avgSharpe, avgReturn) {
    if (consistency >= 0.75 && avgSharpe >= 0.5 && avgReturn > 0)
      return '✅ DEPLOY CANDIDATE — consistent edge detected';
    if (consistency >= 0.6 && avgReturn > 0)
      return '⚠️  MARGINAL — needs more data or parameter tuning';
    if (avgReturn > 0 && consistency < 0.6)
      return '🔴 INCONSISTENT — profitable on average but fails most windows';
    return '❌ NO EDGE — do not deploy with real capital';
  }

  // ─── Print ─────────────────────────────────────────────────────────────────

  printSummary(summary, instrument) {
    const sep = '='.repeat(80);
    console.log(`\n${sep}`);
    console.log(`WALK-FORWARD SUMMARY: ${instrument}`);
    console.log(`Windows tested: ${summary.windowCount}`);
    console.log(sep);

    for (const [strategy, s] of Object.entries(summary.strategies ?? {})) {
      console.log(`\n📊 Strategy: ${strategy}`);
      console.log(`   Consistency:      ${s.profitableWindows}/${s.totalWindows} windows profitable (${s.consistencyScore.toFixed(0)}%)`);
      console.log(`   Avg OOS Return:   ${s.avgReturn.toFixed(2)}%`);
      console.log(`   Median OOS Return:${s.medianReturn.toFixed(2)}%`);
      console.log(`   Best Window:      ${s.bestWindow.toFixed(2)}%`);
      console.log(`   Worst Window:     ${s.worstWindow.toFixed(2)}%`);
      console.log(`   Avg Sharpe:       ${s.avgSharpe.toFixed(2)}`);
      console.log(`   Worst Drawdown:   ${s.worstDrawdown.toFixed(2)}%`);
      console.log(`   Avg Profit Factor:${s.avgProfitFactor.toFixed(2)}`);
      console.log(`   Avg Win Rate:     ${s.avgWinRate.toFixed(1)}%`);
      console.log(`\n   VERDICT: ${s.verdict}`);
    }

    console.log(`\n${sep}\n`);
  }

  // ─── Math helpers ──────────────────────────────────────────────────────────

  avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

  median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  std(arr) {
    const m = this.avg(arr);
    return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
  }
}

export default WalkForwardBacktester;
