# Setup Guide - Upstox ORB Trading Bot

This guide will help you set up the bot for Phase 1 (Historical Backtesting).

## Prerequisites

1. **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
2. **Upstox Account**: Sign up at [upstox.com](https://upstox.com/)
3. **Upstox API Credentials**: 
   - Go to [upstox.com/developer/apps](https://upstox.com/developer/apps)
   - Create a new app
   - Note down your API Key and API Secret

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Configure the Bot

1. Copy the example config file:
```bash
copy config\config.example.json config\config.json
```

2. Copy the example environment file:
```bash
copy .env.example .env
```

3. Edit `config/config.json` with your settings:

```json
{
  "upstox": {
    "apiKey": "YOUR_API_KEY_HERE",
    "apiSecret": "YOUR_API_SECRET_HERE",
    "accessToken": "YOUR_ACCESS_TOKEN_HERE",
    "useSandbox": true
  },
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 2,
    "maxTradesPerDay": 2,
    "instruments": ["NIFTY", "BANKNIFTY"]
  }
}
```

### Getting Your Access Token

Upstox uses OAuth 2.0 authentication. You need to:

1. Go to: `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=YOUR_REDIRECT_URI`
2. Login and authorize
3. You'll be redirected to your redirect URI with a `code` parameter
4. Exchange this code for an access token using:

```bash
curl -X POST "https://api.upstox.com/v2/login/authorization/token" \
  -H "accept: application/json" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "code=YOUR_CODE&client_id=YOUR_API_KEY&client_secret=YOUR_API_SECRET&redirect_uri=YOUR_REDIRECT_URI&grant_type=authorization_code"
```

5. Copy the `access_token` from the response to your config file

**Note**: Access tokens expire daily. You'll need to refresh them regularly.

## Step 3: Adjust Strategy Parameters (Optional)

In `config/config.json`, you can tune these parameters:

```json
{
  "strategy": {
    "stopLossPercent": 1.0,      // Stop loss as % of entry
    "targetPercent": 2.0,         // Target as % of entry
    "useTrailingStop": true,      // Enable trailing stop
    "trailingStopPercent": 0.5    // Trailing stop as % of current price
  },
  "backtest": {
    "startDate": "2024-02-01",    // Start date for backtest
    "endDate": "2024-07-31",      // End date for backtest
    "interval": "1minute"         // Candle interval
  }
}
```

## Step 4: Fetch Historical Data

Before running the backtest, fetch historical data:

```bash
npm run fetch-data
```

This will:
- Download 3-6 months of intraday candle data
- Cache it locally in the `data/` folder
- Skip weekends and NSE holidays automatically

**Note**: This may take 10-15 minutes depending on the date range.

## Step 5: Run the Backtest

```bash
npm run backtest
```

This will:
- Load cached historical data
- Simulate the ORB strategy day-by-day
- Generate a performance report
- Show win rate, P&L, max drawdown, and more
- Determine if the strategy has statistical edge

## Step 6: Review Results

The backtest will generate:

1. **Console output**: Summary report with all key metrics
2. **JSON file**: Full results in `data/backtest_orb_TIMESTAMP.json`
3. **CSV file**: All trades in `data/trades_INSTRUMENT_TIMESTAMP.csv`

### Understanding the Results

The bot evaluates statistical edge based on:

✓ **Win Rate** ≥50%  
✓ **Profit Factor** ≥1.5  
✓ **Positive Expectancy**  
✓ **Sample Size** ≥30 trades  
✓ **Max Drawdown** <10%  

You need at least 3.5/5 criteria to pass the gate.

### If the Strategy Shows Edge

✓ Proceed to Phase 2: Build the sandbox bot

### If the Strategy Does NOT Show Edge

✗ **DO NOT proceed to Phase 2**

Instead:
1. Adjust stop-loss/target parameters
2. Modify opening range duration (try 5 min, 10 min, 20 min)
3. Test different entry/exit times
4. Add volume/volatility filters
5. Re-run backtest until you see statistical edge

## Troubleshooting

### "Config file not found"
- Make sure you copied `config.example.json` to `config.json`

### "Missing data for NIFTY"
- Run `npm run fetch-data` first

### "Unauthorized" or "Invalid token"
- Your access token may have expired
- Generate a new one following Step 2

### "No trades executed"
- Check if your date range includes trading days
- Verify data was downloaded correctly
- Try adjusting strategy parameters (smaller stop loss/target)

## Next Steps

Once you have a positive backtest:

1. ✅ Phase 1 Complete: Backtest shows edge
2. 🚧 Phase 2: Build sandbox bot (coming next)
3. 🚧 Phase 3: Add alerting & safety features

## Important Reminders

⚠️ This is **sandbox/paper trading only**  
⚠️ Never use real money in Phase 1-2  
⚠️ Always verify strategy performance before going live  
⚠️ Past performance does not guarantee future results  

## Support

For issues with:
- **Upstox API**: Check [upstox.com/developer/api-documentation](https://upstox.com/developer/api-documentation)
- **Bot setup**: Review logs in `logs/` folder
- **Strategy questions**: Analyze trade logs in `data/trades_*.csv`
