# Getting Started with Upstox ORB Trading Bot

Welcome! This guide will help you set up and run the Opening Range Breakout (ORB) trading bot for Indian F&O markets.

## 📋 Prerequisites

- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **Upstox Account**: Sign up at [upstox.com](https://upstox.com/)
- **Windows Operating System**: This bot is currently configured for Windows

## 🎯 What You'll Build

This bot implements an Opening Range Breakout strategy:
- Tracks the first 15 minutes of market (9:15-9:30 AM IST)
- Enters trades on breakout of opening range high/low
- Uses Golden Ratio (61.8% Fibonacci) for entry levels
- Manages risk with stop-loss and target levels
- Includes real-time monitoring dashboard

**Current Phase**: Phase 2 - Live bot with real-time data and cost tracking

## 🚀 Quick Start Options

### Option 1: I Want to Run It NOW (5 minutes)

Perfect for seeing the system in action immediately.

```bash
# Clone and install
git clone <repository-url>
cd UpstoxORBTradingBot
npm install

# Copy configuration
copy config\config.example.json config\config.json

# Start the bot (runs in MOCK mode by default)
npm run live
```

Open a second terminal:
```bash
# Start dashboard
npm run dashboard
```

Visit `http://localhost:3000` to see the dashboard.

✅ Bot is running with simulated data - safe to explore!

**Next**: See [Configuration Guide](configuration.md) to connect real market data.

---

### Option 2: Full Setup with Real Market Data (30 minutes)

For live trading bot with actual Upstox data.

#### Step 1: Install Dependencies (2 min)

```bash
npm install
```

#### Step 2: Get Upstox API Credentials (10 min)

1. **Sign up** at [upstox.com](https://upstox.com/) if you haven't already
2. Go to [Upstox Developer Portal](https://upstox.com/developer/apps)
3. Click **"Create App"**
4. Fill in details:
   - **App Name**: ORB Trading Bot
   - **Redirect URI**: `http://localhost:8080/callback`
   - **Type**: Select "Sandbox" for testing
5. Note down:
   - **API Key** (looks like: `c6ea6899-da80-4a2f-9763-23a12e1262e5`)
   - **API Secret** (looks like: `ev76vnkl0z`)

#### Step 3: Generate Access Token (5 min)

Upstox uses OAuth 2.0, so you need a daily access token.

**Method 1: Using Browser (Easiest)**

1. Visit this URL (replace `YOUR_API_KEY`):
   ```
   https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=http://localhost:8080/callback
   ```

2. Login with your Upstox credentials and authorize

3. You'll be redirected to `http://localhost:8080/callback?code=XXXXXX`
   - Copy the `code` value from the URL

4. Exchange code for token using PowerShell:
   ```powershell
   $body = @{
       code = "YOUR_CODE_FROM_STEP_3"
       client_id = "YOUR_API_KEY"
       client_secret = "YOUR_API_SECRET"
       redirect_uri = "http://localhost:8080/callback"
       grant_type = "authorization_code"
   }
   
   Invoke-RestMethod -Uri "https://api.upstox.com/v2/login/authorization/token" `
       -Method Post `
       -ContentType "application/x-www-form-urlencoded" `
       -Body $body
   ```

5. Copy the `access_token` from the JSON response

**Method 2: Using get-started.bat**

Run the included helper script:
```bash
get-started.bat
```

This will guide you through token generation interactively.

**⚠️ Important**: Access tokens expire daily at 3:30 AM IST. You'll need to generate a fresh token every morning before trading.

#### Step 4: Configure the Bot (3 min)

1. Copy the example configuration:
   ```bash
   copy config\config.example.json config\config.json
   ```

2. Open `config\config.json` in a text editor

3. Update these values:
   ```json
   {
     "upstox": {
       "apiKey": "YOUR_API_KEY_HERE",
       "apiSecret": "YOUR_API_SECRET_HERE",
       "accessToken": "YOUR_ACCESS_TOKEN_HERE",
       "useMock": false,
       "useSandbox": true
     }
   }
   ```

4. Also update the `marketData` and `orders` sections with the same token:
   ```json
   {
     "upstox": {
       "marketData": {
         "accessToken": "YOUR_ACCESS_TOKEN_HERE"
       },
       "orders": {
         "accessToken": "YOUR_ACCESS_TOKEN_HERE"
       }
     }
   }
   ```

**Tip**: The same access token goes in all three places.

#### Step 5: Verify Configuration (1 min)

Test your configuration:

```bash
npm run verify
```

You should see:
```
✅ Configuration valid
✅ Upstox connection successful
✅ WebSocket authorization successful
✅ Ready to start trading
```

If you see errors, check:
- API key and secret are correct
- Access token is complete (200-300 characters long)
- Token hasn't expired (generate a fresh one if needed)

#### Step 6: Start the Bot (2 min)

Open your first terminal and start the bot:

```bash
npm run live
```

You should see:
```
[2026-08-04 09:00:15.031] [INFO] 🤖 Bot is now live and monitoring market
[2026-08-04 09:00:16.028] [INFO] ✅ WebSocket connected
[2026-08-04 09:00:17.029] [INFO] Received tick { symbol: 'NSE_INDEX|Nifty 50', ltp: 24531.25, ... }
```

**Keep this terminal open** - the bot runs continuously during market hours.

#### Step 7: Start the Dashboard (1 min)

Open a **second terminal** and start the dashboard:

```bash
npm run dashboard
```

You should see:
```
Dashboard server running at http://localhost:3000
```

Open your browser and navigate to:
```
http://localhost:3000
```

You'll see:
- **Live NIFTY spot price** (updates every 5 seconds)
- **60-minute rolling price chart**
- **Opening range** (high/low/range)
- **Golden ratio entry levels** (call/put)
- **Bot status** and session state
- **Current positions** and P&L
- **Trade log** and cost breakdown
- **Emergency kill switch**

---

## 📊 What Happens During the Trading Day

### 9:00 AM - Opening
- Bot initializes and connects to WebSocket
- Dashboard shows "PRE_MARKET" state
- Waiting for opening bell

### 9:15 AM - Opening Range Begins
- Bot calculates high/low of first 15 minutes
- Dashboard shows "OPENING_RANGE" state
- Golden ratio levels calculated and displayed

### 9:30 AM - Trading Window Opens
- Bot monitors for breakout signals
- Entry conditions:
  - Price breaks 61.8% Fibonacci level above opening range high (CALL)
  - Price breaks 61.8% Fibonacci level below opening range low (PUT)
- Maximum 2 trades per day
- Dashboard shows "TRADING" state

### During Trade
- Bot monitors stop-loss (0.5%) and target (2.0%)
- Dashboard shows live P&L
- All execution costs tracked (brokerage, STT, GST, etc.)

### 3:15 PM - Hard Exit
- All positions force-closed at market price
- No exceptions - safety feature
- Final P&L calculated

### 3:30 PM - Post-Market
- Bot goes idle
- Trade journal saved to `logs/trades/`
- Dashboard shows final summary
- Cost analysis updated

---

## 🛑 Stopping the Bot

### Graceful Shutdown

In the bot terminal, press `Ctrl+C`:

```
🛑 Received SIGINT (Ctrl+C) - shutting down gracefully
✅ Bot stopped gracefully
```

The bot will:
- Close all open positions
- Save state to disk
- Disconnect WebSocket
- Exit cleanly

### Emergency Kill Switch

If the bot isn't responding to Ctrl+C:

1. **Use Dashboard Kill Switch**: Click the red "EMERGENCY STOP" button in the dashboard
2. **Or manually kill process**:
   ```bash
   taskkill /F /IM node.exe
   ```

⚠️ **Important**: Always use the kill switch test before market open (9:05 AM) to ensure it works.

---

## 📁 Important Files and Directories

```
UpstoxORBTradingBot/
├── config/
│   └── config.json              # Your configuration (API keys, strategy params)
├── data/
│   └── bot_state.json           # Current bot state (for dashboard)
├── logs/
│   ├── main_YYYY-MM-DD.log      # All bot activity
│   ├── trades_YYYY-MM-DD.log    # Trade entries/exits
│   └── trades/
│       └── journal_YYYY-MM.json # Trade journal (for dashboard)
├── dashboard/
│   ├── index.html               # Dashboard UI
│   ├── dashboard.js             # Dashboard logic
│   ├── server.js                # Dashboard server
│   └── styles.css               # Dashboard styling
└── src/
    ├── bot/                     # Bot engine
    ├── data/                    # Data fetching (WebSocket, REST API)
    ├── strategy/                # ORB strategy implementation
    └── utils/                   # Utilities (logging, config, etc.)
```

---

## 🔧 Configuration Options

Key configuration parameters in `config/config.json`:

### Trading Parameters

```json
{
  "trading": {
    "capital": 100000,              // Starting capital (₹)
    "dailyLossLimitPercent": 2,     // Stop trading if 2% daily loss
    "maxTradesPerDay": 2,           // Maximum trades allowed
    "instruments": ["NIFTY"]        // Which instruments to trade
  }
}
```

### Strategy Parameters

```json
{
  "strategy": {
    "stopLossPercent": 0.5,         // Stop loss at 0.5% of entry
    "targetPercent": 2.0,           // Target at 2.0% of entry
    "goldenRatio": 0.618,           // Fibonacci level for entry
    "openingRangeDuration": 15      // Opening range duration (minutes)
  }
}
```

### Cost Configuration

```json
{
  "costs": {
    "brokeragePerLot": 20,          // Brokerage per lot
    "sttPercent": 0.0625,           // STT for options
    "exchangeChargesPercent": 0.053, // Exchange charges
    "gstPercent": 18,               // GST on charges
    "sebiFeePercent": 0.0001,       // SEBI fees
    "stampDutyPercent": 0.003       // Stamp duty
  }
}
```

See [Configuration Guide](configuration.md) for complete reference.

---

## ❓ Troubleshooting

### Bot Won't Start

**Error**: "Cannot find module"
```bash
npm install
```

**Error**: "Config file not found"
```bash
copy config\config.example.json config\config.json
```

### WebSocket Connection Fails

**Error**: "WebSocket 401 Unauthorized"
- Your access token has expired
- Generate a fresh token (Step 3)
- Update `config.json`

**Error**: "WebSocket connection timeout"
- Check your internet connection
- Verify firewall isn't blocking WebSocket connections
- Try again in a few minutes

### Dashboard Shows No Data

- Make sure bot is running in Terminal 1
- Check that `data/bot_state.json` exists
- Dashboard updates every 5-30 seconds - wait a moment
- Refresh browser (F5)

### Kill Switch Not Working

**This is a known fragility** - see `/docs/operations/kill-switch-fragility-analysis.md`

- **Mandatory daily test**: 9:05 AM before market open
- Test procedure:
  1. Start bot
  2. Click dashboard kill switch
  3. Verify bot stops within 10 seconds
  4. If test fails, DO NOT trade that day

### No Trades Today

This is expected most days! The strategy has a ~25-30% win rate, meaning:
- Most days will have **no trades** (no valid setup)
- Only 2-3 trades per week on average
- No trade is better than a bad trade

"No trade" is **not a failure** - it's the strategy working correctly.

---

## 📚 Next Steps

### New Users
1. ✅ Get bot running in mock mode (Option 1)
2. ✅ Explore the dashboard and understand the UI
3. ⏳ Read [Complete Guide](complete-guide.md) for strategy details
4. ⏳ Set up real market data (Option 2)
5. ⏳ Review [Daily Checklist](/docs/operations/daily-checklist.md)

### Ready to Trade
1. ✅ Configuration complete
2. ✅ Bot running with real data
3. ⏳ Complete [Pre-Launch Verification](/docs/operations/pre-launch-verification.md)
4. ⏳ Test kill switch (9:05 AM daily)
5. ⏳ Generate fresh token (9:05 AM daily)
6. ⏳ Start bot at 9:10 AM
7. ⏳ Monitor dashboard during market hours

### Learning More
- **Strategy Details**: See [Complete Guide](complete-guide.md)
- **Architecture**: See `/docs/architecture/overview.md`
- **Phase 2 Info**: See `/docs/phase2/README.md`
- **Dashboard Guide**: See `/docs/dashboard/README.md`
- **API Integration**: See `/docs/api/websocket.md`
- **Troubleshooting**: See `/docs/troubleshooting/faq.md`

---

## ⚠️ Important Warnings

1. **Token Expires Daily**: Generate fresh token every morning at 9:05 AM before trading
2. **Kill Switch Fragility**: Test kill switch daily before relying on it
3. **Low Win Rate**: 25-30% - most days will have no trades
4. **Phase 2 Validation**: This is live testing phase - expect bugs and issues
5. **Real Money**: Even in sandbox mode, verify all systems before live trading
6. **No Overnight Positions**: All positions close by 3:15 PM automatically

---

## 🎓 Understanding the Strategy

The Opening Range Breakout (ORB) strategy:

1. **Opening Range (9:15-9:30 AM)**: Track high/low of first 15 minutes
2. **Golden Ratio Calculation**: Apply 61.8% Fibonacci level
3. **Entry Signals**:
   - **Call**: Price breaks above (Opening High + Golden Ratio × Range)
   - **Put**: Price breaks below (Opening Low - Golden Ratio × Range)
4. **Risk Management**:
   - Stop Loss: 0.5% of entry price
   - Target: 2.0% of entry price
   - Hard exit: 3:15 PM regardless of P&L
5. **Position Sizing**: Based on ₹1,00,000 capital
6. **Trade Limits**: Maximum 2 trades per day

**Backtest Performance (2026 data)**:
- Profit Factor: 1.33
- Win Rate: 25-38%
- Expectancy: Positive (but thin margin)

**Phase 2 Goal**: Does the 1.33 profit factor survive real-world execution costs?

---

## 📞 Support

- **Setup Issues**: See [Configuration Guide](configuration.md)
- **Common Questions**: See [FAQ](/docs/troubleshooting/faq.md)
- **Known Issues**: See [Kill Switch Fragility](/docs/operations/kill-switch-fragility-analysis.md)
- **Upstox API**: [Official Documentation](https://upstox.com/developer/api-documentation)
- **Logs**: Check `logs/` folder for detailed error messages

---

## 📝 Daily Routine

**Every Trading Day**:

1. **9:00 AM**: Wake up, have coffee ☕
2. **9:05 AM**: 
   - Generate fresh Upstox access token
   - Update `config.json`
   - Test kill switch (mandatory!)
3. **9:10 AM**: Start bot and dashboard
4. **9:15 AM**: Opening range begins - watch dashboard
5. **9:30 AM - 3:15 PM**: Monitor dashboard, let bot work
6. **3:20 PM**: Review trade log, check P&L
7. **3:30 PM**: Stop bot and dashboard

**Most Important**: Token generation and kill switch test are NOT optional!

---

**Ready to start?** Choose your path:
- 🚀 [Quick Start (Mock Mode)](#option-1-i-want-to-run-it-now-5-minutes)
- 📊 [Full Setup (Real Data)](#option-2-full-setup-with-real-market-data-30-minutes)
- 📖 [Read Complete Guide](complete-guide.md)

---

*Last Updated: August 4, 2026*  
*Phase: Phase 2 - Live Bot with Real-Time Monitoring*
