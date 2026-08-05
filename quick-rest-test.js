/**
 * Quick REST API Test
 * Just fetch the current NIFTY price from REST API
 */

import { OptionChainFetcher } from './src/data/option-chain.js';
import { logger } from './src/utils/logger.js';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/config.json', 'utf8'));

async function testRestAPI() {
  logger.info('🧪 Testing REST API Spot Price Fetch');
  logger.info('');
  
  try {
    const optionChain = new OptionChainFetcher(config, null);
    
    logger.info('Fetching NIFTY spot price...');
    const spotPrice = await optionChain.getSpotPrice('NIFTY');
    
    logger.info('');
    logger.info('✅ REST API RESPONSE:');
    logger.info('==========================================');
    logger.info(`Symbol: ${spotPrice.symbol}`);
    logger.info(`LTP: ${spotPrice.ltp}`);
    logger.info(`Change: ${spotPrice.change}`);
    logger.info(`Change %: ${spotPrice.changePercent}`);
    logger.info(`Timestamp: ${spotPrice.timestamp}`);
    logger.info('==========================================');
    logger.info('');
    
    if (spotPrice.ltp > 10000 && spotPrice.ltp < 100000) {
      logger.info('✅ LTP is in realistic range for NIFTY (10k-100k)');
    } else {
      logger.error('❌ LTP is outside expected range!');
    }
    
    process.exit(0);
    
  } catch (error) {
    logger.error('❌ REST API Test Failed', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

testRestAPI();
