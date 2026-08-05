/**
 * Simple WebSocket Diagnostic
 * 
 * This script just connects and dumps ALL raw decoded messages
 * to help us understand what Upstox is actually sending
 */

import { UpstoxWebSocketClient } from './src/data/websocket-client.js';
import { logger } from './src/utils/logger.js';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./config/config.json', 'utf8'));

let messageCount = 0;

async function diagnose() {
  logger.info('========================================');
  logger.info('🔬 WebSocket Diagnostic - Raw Message Dump');
  logger.info('========================================');
  logger.info('');
  logger.info('Connecting and subscribing to NIFTY 50...');
  logger.info('Will dump first 20 raw messages');
  logger.info('');

  const wsClient = new UpstoxWebSocketClient(
    config.upstox.marketData.accessToken,
    {
      authorizeUrl: config.websocket.authorizeUrl,
      useMock: false
    }
  );

  await wsClient.connect();
  wsClient.subscribe(['NSE_INDEX|Nifty 50']);

  logger.info('✅ Connected and subscribed');
  logger.info('');
  logger.info('Waiting for messages...');
  logger.info('');

  wsClient.on('tick', (tick) => {
    messageCount++;
    logger.info(`========== TICK MESSAGE #${messageCount} ==========`);
    logger.info(JSON.stringify(tick, null, 2));
    logger.info('');
    
    if (messageCount >= 20) {
      logger.info('Collected 20 messages - stopping');
      wsClient.disconnect();
      process.exit(0);
    }
  });

  wsClient.on('message', (msg) => {
    messageCount++;
    logger.info(`========== NON-TICK MESSAGE #${messageCount} ==========`);
    logger.info('Type:', msg.type);
    logger.info('Has feeds:', !!msg.feeds);
    logger.info('Feed count:', msg.feeds ? Object.keys(msg.feeds).length : 0);
    logger.info('Full message:');
    logger.info(JSON.stringify(msg, null, 2));
    logger.info('');
    
    if (messageCount >= 20) {
      logger.info('Collected 20 messages - stopping');
      wsClient.disconnect();
      process.exit(0);
    }
  });

  // Timeout after 60 seconds
  setTimeout(() => {
    logger.warn(`Timeout: Only received ${messageCount} messages in 60 seconds`);
    wsClient.disconnect();
    process.exit(1);
  }, 60000);
}

diagnose().catch(error => {
  logger.error('Diagnostic failed', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
