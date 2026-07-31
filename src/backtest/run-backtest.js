import { loadConfig } from '../utils/config-loader.js';
import Logger from '../utils/logger.js';
import EnhancedBacktestEngine from './enhanced-backtest-engine.js';
import DataCache from '../data/data-cache.js';

async function runBacktest() {
  console.log('Starting Enhanced ORB Strategy Backtest with Train/Test Split...\n');

  const config = loadConfig();
  const logger = new Logger(config.logging);
  const dataCache = new DataCache(logger);

  logger.info('Backtest configuration loaded', {
    period: `${config.backtest.startDate} to ${config.backtest.endDate}`,
    instruments: config.trading.instruments,
    capital: config.trading.capital,
    strategies: config.backtest.strategies || ['ORB'],
    trainTestSplit: config.backtest.trainTestSplit || 0.7,
    instrumentType: config.trading.instrumentType || 'OPTIONS'
  });

  console.log(`📊 Configuration:`);
  console.log(`   Instrument Type: ${config.trading.instrumentType || 'OPTIONS'}`);
  console.log(`   Strategies: ${(config.backtest.strategies || ['ORB']).join(', ')}`);
  console.log(`   Train/Test Split: ${(config.backtest.trainTestSplit || 0.7) * 100}% / ${(1 - (config.backtest.trainTestSplit || 0.7)) * 100}%`);
  console.log(`   Stop Loss: ${config.strategy.stopLossPercent}%`);
  console.log(`   Target: ${config.strategy.targetPercent}%`);
  console.log(`   Hard Exit: ${config.trading.hardExitTime}\n`);

  // Check if data is available
  console.log('Checking data availability...');
  const startDate = new Date(config.backtest.startDate);
  const endDate = new Date(config.backtest.endDate);

  for (const instrument of config.trading.instruments) {
    const missingDates = dataCache.getMissingDates(instrument, startDate, endDate);
    
    if (missingDates.length > 0) {
      console.warn(`\n⚠ Warning: Missing data for ${instrument}`);
      console.warn(`Missing ${missingDates.length} trading days of data.`);
      
      if (missingDates.length > 10) {
        console.warn('Please run: npm run fetch-data\n');
        console.log('Too much missing data. Exiting.');
        process.exit(1);
      } else {
        console.warn('Proceeding with available data (only a few days missing).\n');
      }
    }
  }

  console.log('\nRunning enhanced backtest with train/test validation...\n');

  // Run backtest for each instrument
  const allResults = [];

  for (const instrument of config.trading.instruments) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Backtesting ${instrument}`);
    console.log('='.repeat(80));
    
    const backtester = new EnhancedBacktestEngine(config, logger);
    const results = await backtester.runBacktest(instrument);
    
    // Print report to console
    backtester.printReport();
    
    // Save report to file
    const reportFile = backtester.generateReport();
    console.log(`Full report saved to: ${reportFile}\n`);
    
    allResults.push({
      instrument,
      results
    });
  }

  // Final recommendation
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 1 GATE CHECK - TRAIN/TEST VALIDATION');
  console.log('='.repeat(80) + '\n');

  let anyStrategyPassed = false;
  const recommendations = [];

  for (const { instrument, results } of allResults) {
    console.log(`${instrument}:`);
    
    for (const [strategyName, strategyResults] of Object.entries(results.strategies)) {
      const passed = strategyResults.combined.bothHaveEdge;
      const overfitting = strategyResults.combined.overfittingDetected;
      
      console.log(`\n  ${strategyName}:`);
      console.log(`    Training: ${strategyResults.training.summary.hasStatisticalEdge ? '✓ PASS' : '✗ FAIL'} (${strategyResults.training.summary.edgeScore})`);
      console.log(`    Testing:  ${strategyResults.testing.summary.hasStatisticalEdge ? '✓ PASS' : '✗ FAIL'} (${strategyResults.testing.summary.edgeScore})`);
      
      if (passed) {
        console.log(`    Result:   ✓ VIABLE - Shows edge in both periods`);
        anyStrategyPassed = true;
        recommendations.push(`${instrument} ${strategyName}: PROCEED to Phase 2`);
      } else if (overfitting) {
        console.log(`    Result:   ✗ OVERFITTING - Edge only in training data`);
        recommendations.push(`${instrument} ${strategyName}: DO NOT PROCEED (overfitting)`);
      } else {
        console.log(`    Result:   ✗ NO EDGE - Poor performance in both periods`);
        recommendations.push(`${instrument} ${strategyName}: DO NOT PROCEED (no edge)`);
      }
    }
    console.log();
  }

  console.log('='.repeat(80));
  console.log('FINAL RECOMMENDATIONS:');
  console.log('='.repeat(80));
  
  recommendations.forEach(rec => console.log(`  ${rec}`));

  console.log('\n' + '='.repeat(80));
  
  if (anyStrategyPassed) {
    console.log('✓ PASSED: At least one strategy shows genuine edge.');
    console.log('✓ You may proceed to Phase 2: Sandbox Bot Implementation');
    console.log('\nRecommended next steps:');
    console.log('  1. Review the detailed results above');
    console.log('  2. Choose the best performing strategy');
    console.log('  3. Note the optimal stop-loss and target settings');
    console.log('  4. Proceed to Phase 2 implementation');
  } else {
    console.log('✗ FAILED: NO strategy shows genuine edge in both periods.');
    console.log('✗ DO NOT proceed to Phase 2 until strategy is improved.');
    console.log('\nPossible issues:');
    console.log('  1. Overfitting: Strategy works on training data but fails on test data');
    console.log('  2. Poor parameters: Adjust stop-loss, target, opening range duration');
    console.log('  3. Wrong market conditions: Strategy may not suit current market');
    console.log('\nRecommendations:');
    console.log('  1. Try different stop-loss values (0.3%, 0.5%, 0.7%, 1.0%)');
    console.log('  2. Try different target values (1.5%, 2.0%, 2.5%, 3.0%)');
    console.log('  3. Try different opening range durations (5, 10, 15, 20 min)');
    console.log('  4. Consider adding filters (volume, volatility)');
    console.log('  5. Test different date ranges');
  }
  
  console.log('='.repeat(80) + '\n');

  logger.info('Enhanced backtest completed', {
    anyStrategyPassed,
    instruments: config.trading.instruments.length,
    totalStrategies: Object.keys(allResults[0]?.results?.strategies || {}).length
  });
}

function askToProceed() {
  return new Promise(async (resolve) => {
    const { createInterface } = await import('readline');
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('Proceed with available data? (y/n): ', (answer) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Run if called directly
if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || 
    import.meta.url.endsWith('run-backtest.js')) {
  console.log('\n🚀 Starting Enhanced Backtest...\n');
  runBacktest()
    .then(() => {
      console.log('\n✅ Backtest process completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Backtest failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    });
}

export default runBacktest;
