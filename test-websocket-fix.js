/**
 * WebSocket & REST API Fix Verification Test
 * 
 * This script tests:
 * 1. Protobuf parser with real WebSocket ticks
 * 2. REST API spot price fetch
 * 3. Cross-verification between WebSocket LTP and REST API LTP
 * 
 * REQUIREMENTS:
 * - Markets must be open
 * - Production access token must be valid
 * - Must run for at least 1-2 minutes to collect sufficient tick samples
 */

import { UpstoxWebSocketClient } from './src/data/websocket-client.js';
import { OptionChainFetcher } from './src/data/option-chain.js';
import { logger } from './src/utils/logger.js';
import { readFileSync } from 'fs';

// Load config
const config = JSON.parse(readFileSync('./config/config.json', 'utf8'));

// Test configuration
const TEST_DURATION_MS = 180000; // 3 minutes (increased from 2)
const VERIFICATION_SAMPLE_SIZE = 10;
const VERIFICATION_THRESHOLD_PERCENT = 0.5; // Ticks must be within 0.5% of REST API price

// Test state
let tickCount = 0;
let tickSamples = [];
let restApiPrice = null;
let testStartTime = Date.now();

async function runTest() {
  logger.info('========================================');
  logger.info('🧪 WebSocket & REST API Fix Verification');
  logger.info('========================================');
  logger.info('');
  logger.info('This test will:');
  logger.info('1. Connect to Upstox WebSocket with protobuf decoder');
  logger.info('2. Collect 10 consecutive tick samples');
  logger.info('3. Fetch REST API spot price');
  logger.info('4. Cross-verify LTP values match within 0.5%');
  logger.info('5. Check internal data consistency (high >= low, etc.)');
  logger.info('');
  logger.info(`Test duration: ${TEST_DURATION_MS / 1000} seconds`);
  logger.info(`Required samples: ${VERIFICATION_SAMPLE_SIZE}`);
  logger.info(`Verification threshold: ±${VERIFICATION_THRESHOLD_PERCENT}%`);
  logger.info('');

  try {
    // Step 1: Initialize WebSocket client
    logger.info('📡 Step 1: Initializing WebSocket client with protobuf decoder...');
    
    const wsClient = new UpstoxWebSocketClient(
      config.upstox.marketData.accessToken,
      {
        authorizeUrl: config.websocket.authorizeUrl,
        useMock: false // MUST be real data
      }
    );

    // Step 2: Connect to WebSocket
    logger.info('🔌 Step 2: Connecting to Upstox WebSocket V3...');
    await wsClient.connect();
    logger.info('✅ WebSocket connected');
    logger.info('');

    // Step 3: Subscribe to NIFTY 50 index
    const niftyInstrumentKey = 'NSE_INDEX|Nifty 50';
    logger.info(`📊 Step 3: Subscribing to ${niftyInstrumentKey}...`);
    
    // Subscribe to NIFTY in full mode to get complete data
    wsClient.subscribe([niftyInstrumentKey]);
    logger.info('✅ Subscription sent');
    logger.info('');
    
    // Also log ALL messages to see what we're actually receiving
    let messageCount = 0;

    // Step 4: Collect tick samples
    logger.info(`⏳ Step 4: Collecting ${VERIFICATION_SAMPLE_SIZE} tick samples...`);
    logger.info('');

    wsClient.on('tick', (tick) => {
      tickCount++;
      
      // Collect first N samples
      if (tickSamples.length < VERIFICATION_SAMPLE_SIZE) {
        tickSamples.push(tick);
        
        logger.info(`✓ Sample ${tickSamples.length}/${VERIFICATION_SAMPLE_SIZE}`, {
          timestamp: tick.timestamp,
          ltp: tick.ltp,
          volume: tick.volume,
          open: tick.open,
          high: tick.high,
          low: tick.low
        });
      }
      
      // Log periodic updates
      if (tickCount % 10 === 0 && tickSamples.length >= VERIFICATION_SAMPLE_SIZE) {
        logger.info(`📈 Received ${tickCount} ticks total`);
      }
    });

    wsClient.on('message', (msg) => {
      // Log ALL non-tick messages for debugging
      messageCount++;
      logger.info(`📨 Message #${messageCount}:`, {
        type: msg.type,
        hasFeeds: !!msg.feeds,
        feedCount: msg.feeds ? Object.keys(msg.feeds).length : 0,
        feedKeys: msg.feeds ? Object.keys(msg.feeds) : [],
        timestamp: new Date().toISOString()
      });
      
      // If we have feeds, log the full structure
      if (msg.feeds && Object.keys(msg.feeds).length > 0) {
        logger.info('📦 Feed data structure:', JSON.stringify(msg.feeds, null, 2));
      }
    });

    wsClient.on('error', (error) => {
      logger.error('WebSocket error', { error: error.message });
    });

    // Wait for samples to be collected
    await waitForSamples();

    // Step 5: Fetch REST API spot price
    logger.info('');
    logger.info('💰 Step 5: Fetching REST API spot price...');
    
    const optionChain = new OptionChainFetcher(config, null);
    restApiPrice = await optionChain.getSpotPrice('NIFTY');
    
    logger.info('✅ REST API price fetched', {
      ltp: restApiPrice.ltp,
      change: restApiPrice.change,
      changePercent: restApiPrice.changePercent
    });
    logger.info('');

    // Step 6: Verify data quality
    logger.info('🔍 Step 6: Verifying data quality...');
    logger.info('');

    const verification = verifyData();

    // Step 7: Print results
    printResults(verification);

    // Cleanup
    logger.info('');
    logger.info('🧹 Cleaning up...');
    wsClient.disconnect();
    
    logger.info('');
    logger.info('========================================');
    logger.info('✅ TEST COMPLETED');
    logger.info('========================================');
    
    // Exit with appropriate code
    process.exit(verification.passed ? 0 : 1);

  } catch (error) {
    logger.error('❌ TEST FAILED', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Wait for sufficient tick samples
 */
function waitForSamples() {
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (tickSamples.length >= VERIFICATION_SAMPLE_SIZE) {
        clearInterval(checkInterval);
        clearTimeout(timeout);
        resolve();
      }
    }, 500);

    const timeout = setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error(`Timeout: Only collected ${tickSamples.length}/${VERIFICATION_SAMPLE_SIZE} samples in ${TEST_DURATION_MS}ms`));
    }, TEST_DURATION_MS);
  });
}

/**
 * Verify data quality and consistency
 */
function verifyData() {
  const results = {
    passed: true,
    checks: []
  };

  // Check 1: Tick samples collected
  const check1 = {
    name: 'Sample Collection',
    passed: tickSamples.length >= VERIFICATION_SAMPLE_SIZE,
    details: `Collected ${tickSamples.length}/${VERIFICATION_SAMPLE_SIZE} samples`
  };
  results.checks.push(check1);
  if (!check1.passed) results.passed = false;

  // Check 2: LTP values are reasonable (not zero, not absurdly large)
  const ltpValues = tickSamples.map(t => t.ltp);
  const avgLtp = ltpValues.reduce((a, b) => a + b, 0) / ltpValues.length;
  
  const check2 = {
    name: 'LTP Values Reasonable',
    passed: avgLtp > 10000 && avgLtp < 100000, // NIFTY typically 20k-30k range
    details: `Average LTP: ${avgLtp.toFixed(2)} (expected: 20,000-30,000 for NIFTY)`
  };
  results.checks.push(check2);
  if (!check2.passed) results.passed = false;

  // Check 3: Internal consistency (high >= low)
  const inconsistentCandles = tickSamples.filter(t => t.high < t.low);
  
  const check3 = {
    name: 'OHLC Internal Consistency',
    passed: inconsistentCandles.length === 0,
    details: inconsistentCandles.length === 0 
      ? 'All ticks have high >= low' 
      : `${inconsistentCandles.length} ticks have high < low`
  };
  results.checks.push(check3);
  if (!check3.passed) results.passed = false;

  // Check 4: Cross-verify with REST API price
  const ltpDiff = Math.abs(avgLtp - restApiPrice.ltp);
  const ltpDiffPercent = (ltpDiff / restApiPrice.ltp) * 100;
  
  const check4 = {
    name: 'WebSocket vs REST API Agreement',
    passed: ltpDiffPercent <= VERIFICATION_THRESHOLD_PERCENT,
    details: `WebSocket avg: ${avgLtp.toFixed(2)}, REST API: ${restApiPrice.ltp.toFixed(2)}, Diff: ${ltpDiffPercent.toFixed(3)}% (threshold: ${VERIFICATION_THRESHOLD_PERCENT}%)`
  };
  results.checks.push(check4);
  if (!check4.passed) results.passed = false;

  // Check 5: Volume is non-negative
  const negativeVolumes = tickSamples.filter(t => t.volume < 0);
  
  const check5 = {
    name: 'Volume Values Valid',
    passed: negativeVolumes.length === 0,
    details: negativeVolumes.length === 0 
      ? 'All volumes >= 0' 
      : `${negativeVolumes.length} ticks have negative volume`
  };
  results.checks.push(check5);
  if (!check5.passed) results.passed = false;

  // Check 6: Tick rate is reasonable (should be getting frequent updates)
  const elapsedSeconds = (Date.now() - testStartTime) / 1000;
  const tickRate = tickCount / elapsedSeconds;
  
  const check6 = {
    name: 'Tick Rate Reasonable',
    passed: tickRate >= 0.5, // At least 1 tick every 2 seconds
    details: `Received ${tickCount} ticks in ${elapsedSeconds.toFixed(1)}s (${tickRate.toFixed(2)} ticks/sec)`
  };
  results.checks.push(check6);
  if (!check6.passed) results.passed = false;

  return results;
}

/**
 * Print test results
 */
function printResults(verification) {
  logger.info('========================================');
  logger.info('📊 VERIFICATION RESULTS');
  logger.info('========================================');
  logger.info('');

  verification.checks.forEach((check, index) => {
    const icon = check.passed ? '✅' : '❌';
    logger.info(`${icon} Check ${index + 1}: ${check.name}`);
    logger.info(`   ${check.details}`);
    logger.info('');
  });

  logger.info('========================================');
  if (verification.passed) {
    logger.info('🎉 ALL CHECKS PASSED');
    logger.info('');
    logger.info('✅ Protobuf parser is working correctly');
    logger.info('✅ REST API spot price fetch is working correctly');
    logger.info('✅ WebSocket and REST API prices agree within threshold');
    logger.info('✅ Data is internally consistent');
    logger.info('');
    logger.info('🚀 System is ready for live trading');
  } else {
    logger.info('❌ SOME CHECKS FAILED');
    logger.info('');
    logger.info('⚠️  Do NOT proceed with live trading until all checks pass');
    logger.info('⚠️  Review failed checks above and investigate');
  }
  logger.info('========================================');
}

// Run the test
runTest().catch(error => {
  logger.error('Unhandled test error', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
