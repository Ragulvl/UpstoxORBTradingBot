/**
 * Run Walk-Forward Validation
 *
 * Usage:
 *   node src/backtest/run-walk-forward.js
 *   node src/backtest/run-walk-forward.js --train 3 --test 1 --step 1
 *   node src/backtest/run-walk-forward.js --train 2 --test 1 --step 1
 */

import { loadConfig } from '../utils/config-loader.js';
import Logger from '../utils/logger.js';
import WalkForwardBacktester from './walk-forward.js';
import DataCache from '../data/data-cache.js';
import { parse } from 'date-fns';
import fs from 'fs';
import path from 'path';

// ─── Parse CLI args ────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { trainMonths: 3, testMonths: 1, stepMonths: 1 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--train' && args[i + 1]) opts.trainMonths  = parseInt(args[++i]);
    if (args[i] === '--test'  && args[i + 1]) opts.testMonths   = parseInt(args[++i]);
    if (args[i] === '--step'  && args[i + 1]) opts.stepMonths   = parseInt(args[++i]);
  }
  return opts;
}

async function main() {
  const cliOpts = parseArgs();

  console.log('\n' + '='.repeat(80));
  console.log('WALK-FORWARD VALIDATION');
  console.log(`Train: ${cliOpts.trainMonths}m  |  Test: ${cliOpts.testMonths}m  |  Step: ${cliOpts.stepMonths}m`);
  console.log('='.repeat(80) + '\n');

  const config = loadConfig();
  const logger = new Logger(config.logging);
  const dataCache = new DataCache(logger);

  const startDate = parse(config.backtest.startDate, 'yyyy-MM-dd', new Date());
  const endDate   = parse(config.backtest.endDate,   'yyyy-MM-dd', new Date());

  // ─── Check data availability ──────────────────────────────────────────────
  console.log('Checking data availability...\n');
  let dataOk = true;

  for (const instrument of config.trading.instruments) {
    const missing = dataCache.getMissingDates(instrument, startDate, endDate);
    if (missing.length > 10) {
      console.error(`❌ Too much missing data for ${instrument} (${missing.length} days)`);
      console.error('   Run: npm run fetch-data\n');
      dataOk = false;
    } else if (missing.length > 0) {
      console.warn(`⚠️  ${instrument}: ${missing.length} days missing — proceeding anyway\n`);
    } else {
      console.log(`✅ ${instrument}: data complete\n`);
    }
  }

  if (!dataOk) process.exit(1);

  // ─── Run walk-forward for each instrument ─────────────────────────────────
  const allSummaries = [];

  for (const instrument of config.trading.instruments) {
    const wf = new WalkForwardBacktester(config, logger, {
      trainMonths: cliOpts.trainMonths,
      testMonths:  cliOpts.testMonths,
      stepMonths:  cliOpts.stepMonths,
      strategies:  config.backtest.strategies ?? ['ORB']
    });

    const result = await wf.run(instrument);
    if (result) allSummaries.push({ instrument, ...result });
  }

  // ─── Save JSON report ─────────────────────────────────────────────────────
  const reportsDir = path.resolve('reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(reportsDir, `walk-forward-${ts}.json`);

  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    config: {
      period: `${config.backtest.startDate} → ${config.backtest.endDate}`,
      trainMonths: cliOpts.trainMonths,
      testMonths:  cliOpts.testMonths,
      stepMonths:  cliOpts.stepMonths,
      instruments: config.trading.instruments,
      strategies:  config.backtest.strategies ?? ['ORB']
    },
    results: allSummaries
  }, null, 2));

  console.log(`\n📁 Full report saved: ${reportPath}\n`);

  // ─── Final gate check ────────────────────────────────────────────────────
  console.log('='.repeat(80));
  console.log('WALK-FORWARD GATE CHECK — DEPLOY DECISION');
  console.log('='.repeat(80));

  let anyDeployCandidate = false;

  for (const r of allSummaries) {
    for (const [strategy, s] of Object.entries(r.summary?.strategies ?? {})) {
      const pass = s.consistencyScore >= 60 && s.avgReturn > 0;
      console.log(`\n${r.instrument} / ${strategy}`);
      console.log(`   Consistency: ${s.consistencyScore?.toFixed(0)}%  (need ≥ 60%)`);
      console.log(`   Avg OOS Return: ${s.avgReturn?.toFixed(2)}%  (need > 0%)`);
      console.log(`   Avg Sharpe: ${s.avgSharpe?.toFixed(2)}`);
      console.log(`   Worst Drawdown: ${s.worstDrawdown?.toFixed(2)}%`);
      console.log(`   → ${pass ? '✅ PASSES gate' : '❌ FAILS gate — do not deploy'}`);
      if (pass) anyDeployCandidate = true;
    }
  }

  console.log('\n' + '='.repeat(80));
  if (anyDeployCandidate) {
    console.log('✅ At least one strategy passed. Consider paper trading before live capital.');
  } else {
    console.log('❌ No strategy passed the walk-forward gate. Do NOT deploy with real money.');
  }
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('Walk-forward failed:', err.message);
  process.exit(1);
});
