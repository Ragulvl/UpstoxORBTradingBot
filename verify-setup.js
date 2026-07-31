/**
 * Setup Verification Script
 * 
 * Run this to check if your environment is ready
 * Usage: node verify-setup.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n' + '='.repeat(60));
console.log('UPSTOX ORB BOT - SETUP VERIFICATION');
console.log('='.repeat(60) + '\n');

let allGood = true;
let warnings = 0;

// Check 1: Node.js version
console.log('1. Checking Node.js version...');
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

if (majorVersion >= 18) {
  console.log(`   ✓ Node.js ${nodeVersion} (required: 18+)\n`);
} else {
  console.log(`   ✗ Node.js ${nodeVersion} is too old. Please upgrade to 18+\n`);
  allGood = false;
}

// Check 2: Dependencies
console.log('2. Checking dependencies...');
if (fs.existsSync(path.join(__dirname, 'node_modules'))) {
  console.log('   ✓ node_modules/ exists\n');
} else {
  console.log('   ✗ Dependencies not installed. Run: npm install\n');
  allGood = false;
}

// Check 3: Config file
console.log('3. Checking configuration...');
const configPath = path.join(__dirname, 'config', 'config.json');
if (fs.existsSync(configPath)) {
  console.log('   ✓ config/config.json exists\n');
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    // Check API credentials
    if (config.upstox?.apiKey && config.upstox.apiKey !== 'YOUR_API_KEY_HERE') {
      console.log('   ✓ API Key configured\n');
    } else {
      console.log('   ⚠ API Key not configured (needed for real data)\n');
      warnings++;
    }
    
    if (config.upstox?.accessToken && config.upstox.accessToken !== 'YOUR_ACCESS_TOKEN_HERE') {
      console.log('   ✓ Access Token configured\n');
    } else {
      console.log('   ⚠ Access Token not configured (needed for real data)\n');
      warnings++;
    }
    
    // Check trading config
    if (config.trading?.capital > 0) {
      console.log(`   ✓ Trading capital: ₹${config.trading.capital.toLocaleString()}\n`);
    }
    
    if (config.trading?.instruments?.length > 0) {
      console.log(`   ✓ Instruments: ${config.trading.instruments.join(', ')}\n`);
    }
    
  } catch (error) {
    console.log(`   ✗ Error reading config: ${error.message}\n`);
    allGood = false;
  }
} else {
  console.log('   ✗ config/config.json not found\n');
  console.log('   → Run: copy config\\config.example.json config\\config.json\n');
  allGood = false;
}

// Check 4: Directories
console.log('4. Checking directories...');
const dirs = ['data', 'logs', 'config', 'src'];
let dirsMissing = false;

for (const dir of dirs) {
  if (fs.existsSync(path.join(__dirname, dir))) {
    console.log(`   ✓ ${dir}/`);
  } else {
    console.log(`   ✗ ${dir}/ missing`);
    dirsMissing = true;
  }
}

if (dirsMissing) {
  allGood = false;
}
console.log();

// Check 5: Source files
console.log('5. Checking source files...');
const requiredFiles = [
  'src/backtest/backtest-engine.js',
  'src/backtest/run-backtest.js',
  'src/data/upstox-client.js',
  'src/data/data-cache.js',
  'src/data/fetch-historical.js',
  'src/strategy/orb-strategy.js',
  'src/utils/logger.js',
  'src/utils/config-loader.js',
  'src/utils/date-utils.js'
];

let filesMissing = false;
for (const file of requiredFiles) {
  if (fs.existsSync(path.join(__dirname, file))) {
    // Don't print each one, just check
  } else {
    console.log(`   ✗ ${file} missing`);
    filesMissing = true;
  }
}

if (!filesMissing) {
  console.log(`   ✓ All ${requiredFiles.length} core files present\n`);
} else {
  allGood = false;
  console.log();
}

// Check 6: Data availability
console.log('6. Checking cached data...');
const dataFiles = fs.readdirSync(path.join(__dirname, 'data'))
  .filter(f => f.endsWith('.json') && f.includes('NIFTY') || f.includes('BANKNIFTY'));

if (dataFiles.length > 0) {
  console.log(`   ✓ Found ${dataFiles.length} cached data files\n`);
} else {
  console.log('   ⚠ No cached data found\n');
  console.log('   → To generate test data: npm run generate-sample');
  console.log('   → To fetch real data: npm run fetch-data\n');
  warnings++;
}

// Summary
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60) + '\n');

if (allGood && warnings === 0) {
  console.log('🎉 All checks passed! You\'re ready to run backtests.\n');
  console.log('Next steps:');
  console.log('  1. npm run generate-sample   (quick test with synthetic data)');
  console.log('  2. npm run backtest          (run the backtest)');
  console.log('\nOr with real data:');
  console.log('  1. Configure Upstox API credentials in config/config.json');
  console.log('  2. npm run fetch-data        (download historical data)');
  console.log('  3. npm run backtest          (run the backtest)\n');
} else if (allGood && warnings > 0) {
  console.log(`⚠ Setup is functional but ${warnings} warning(s) found.\n`);
  console.log('You can test with sample data:');
  console.log('  npm run generate-sample');
  console.log('  npm run backtest\n');
  console.log('For real data, configure Upstox API credentials.\n');
} else {
  console.log('❌ Setup is incomplete. Please address the issues above.\n');
  console.log('Quick fixes:');
  console.log('  - Run: npm install');
  console.log('  - Run: copy config\\config.example.json config\\config.json\n');
  process.exit(1);
}

console.log('='.repeat(60) + '\n');
