import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function loadConfig() {
  const configPath = path.join(__dirname, '../../config/config.json');
  
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'Config file not found. Please copy config/config.example.json to config/config.json and fill in your credentials.'
    );
  }

  const configData = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(configData);

  // Validate required fields
  validateConfig(config);

  return config;
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

  // Validate trading times
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
