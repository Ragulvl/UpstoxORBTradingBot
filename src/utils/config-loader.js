import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file if it exists (won't crash if missing in CI/production)
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    // Only set if not already in process.env (system env takes priority)
    if (key && value && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

/**
 * Load configuration from config.json and override credentials
 * with environment variables (from .env or system environment).
 *
 * Priority: system env > .env file > config.json
 * Secrets (API keys, tokens) should NEVER be committed to config.json.
 */
export function loadConfig() {
  const configPath = path.join(__dirname, '../../config/config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'Config file not found. Please copy config/config.example.json to config/config.json and fill in your credentials.'
    );
  }

  const configData = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configData);

  // ── Override credentials from environment variables ────────────────────────
  // This ensures secrets are never stored in config.json (which may be committed).
  overrideFromEnv(config);

  // ── Validate required fields ───────────────────────────────────────────────
  validateConfig(config);

  return config;
}

/**
 * Apply environment variable overrides to the config object.
 * Environment variables take precedence over config.json values.
 */
function overrideFromEnv(config) {
  // Upstox main credentials
  if (process.env.UPSTOX_API_KEY)        config.upstox.apiKey = process.env.UPSTOX_API_KEY;
  if (process.env.UPSTOX_API_SECRET)     config.upstox.apiSecret = process.env.UPSTOX_API_SECRET;
  if (process.env.UPSTOX_REDIRECT_URI)   config.upstox.redirectUri = process.env.UPSTOX_REDIRECT_URI;
  if (process.env.UPSTOX_ACCESS_TOKEN)   config.upstox.accessToken = process.env.UPSTOX_ACCESS_TOKEN;

  // Market data token (for WebSocket)
  if (!config.upstox.marketData) config.upstox.marketData = {};
  if (process.env.UPSTOX_MARKET_DATA_TOKEN) {
    config.upstox.marketData.accessToken = process.env.UPSTOX_MARKET_DATA_TOKEN;
  } else if (process.env.UPSTOX_ACCESS_TOKEN && !config.upstox.marketData.accessToken) {
    // Fallback: use main token for market data
    config.upstox.marketData.accessToken = process.env.UPSTOX_ACCESS_TOKEN;
  }
  if (process.env.UPSTOX_WEBSOCKET_URL) {
    config.upstox.marketData.websocketUrl = process.env.UPSTOX_WEBSOCKET_URL;
  }

  // Sandbox orders credentials
  if (!config.upstox.orders) config.upstox.orders = {};
  if (process.env.UPSTOX_SANDBOX_API_KEY)     config.upstox.orders.sandboxApiKey = process.env.UPSTOX_SANDBOX_API_KEY;
  if (process.env.UPSTOX_SANDBOX_API_SECRET)  config.upstox.orders.sandboxApiSecret = process.env.UPSTOX_SANDBOX_API_SECRET;
  if (process.env.UPSTOX_SANDBOX_ACCESS_TOKEN) config.upstox.orders.accessToken = process.env.UPSTOX_SANDBOX_ACCESS_TOKEN;
  else if (process.env.UPSTOX_ACCESS_TOKEN && !config.upstox.orders.accessToken) {
    config.upstox.orders.accessToken = process.env.UPSTOX_ACCESS_TOKEN;
  }

  // Trading parameters
  if (process.env.TRADING_CAPITAL)            config.trading.capital = Number(process.env.TRADING_CAPITAL);
  if (process.env.DAILY_LOSS_LIMIT_PERCENT)   config.trading.dailyLossLimitPercent = Number(process.env.DAILY_LOSS_LIMIT_PERCENT);
  if (process.env.MAX_TRADES_PER_DAY)         config.trading.maxTradesPerDay = Number(process.env.MAX_TRADES_PER_DAY);
  if (process.env.RISK_PER_TRADE_PERCENT)     config.trading.riskPerTradePercent = Number(process.env.RISK_PER_TRADE_PERCENT);
  if (process.env.INSTRUMENTS) {
    config.trading.instruments = process.env.INSTRUMENTS.split(',').map(s => s.trim());
  }

  // Logging
  if (process.env.LOG_LEVEL && config.logging) {
    config.logging.level = process.env.LOG_LEVEL;
  }

  // Alerts
  if (process.env.TELEGRAM_BOT_TOKEN) {
    if (!config.alerts) config.alerts = {};
    if (!config.alerts.telegram) config.alerts.telegram = {};
    config.alerts.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    config.alerts.telegram.enabled = !!process.env.TELEGRAM_CHAT_ID;
  }
  if (process.env.TELEGRAM_CHAT_ID) {
    if (!config.alerts?.telegram) config.alerts = config.alerts || {};
    config.alerts.telegram = config.alerts.telegram || {};
    config.alerts.telegram.chatId = process.env.TELEGRAM_CHAT_ID;
  }
  if (process.env.DISCORD_WEBHOOK_URL) {
    if (!config.alerts) config.alerts = {};
    if (!config.alerts.discord) config.alerts.discord = {};
    config.alerts.discord.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    config.alerts.discord.enabled = true;
  }
}

function validateConfig(config) {
  const required = [
    'upstox.apiKey',
    'upstox.baseUrl',
    'trading.capital',
    'trading.instruments'
  ];

  for (const field of required) {
    const keys = field.split('.');
    let value = config;
    for (const key of keys) {
      value = value?.[key];
    }
    if (!value) {
      throw new Error(`Missing required config field: ${field}`);
    }
  }

  // Detect example placeholder values
  const placeholders = ['your_api_key_here', 'your_access_token_here', 'your_sandbox_api_key'];
  if (placeholders.some(p => config.upstox.apiKey?.startsWith(p))) {
    throw new Error(
      'UPSTOX_API_KEY looks like a placeholder. Set real credentials in .env or environment variables.'
    );
  }

  if (config.trading.openingRangeDuration < 1 || config.trading.openingRangeDuration > 60) {
    throw new Error('Opening range duration must be between 1 and 60 minutes');
  }

  if (config.trading.dailyLossLimitPercent < 0 || config.trading.dailyLossLimitPercent > 100) {
    throw new Error('Daily loss limit percent must be between 0 and 100');
  }
}

export function saveConfig(config) {
  const configPath = path.join(__dirname, '../../config/config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

