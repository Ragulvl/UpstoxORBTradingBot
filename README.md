# Upstox ORB Trading Bot

**Opening Range Breakout (ORB) strategy for Indian F&O markets using Upstox API**

[![Phase](https://img.shields.io/badge/Phase-2%20Live%20Bot-yellow)]()
[![Status](https://img.shields.io/badge/Status-Validation%20Ready-green)]()
[![Market](https://img.shields.io/badge/Market-NIFTY%20%7C%20BANKNIFTY-blue)]()

---

## 🎯 What is This?

An automated trading bot that implements the **Golden Ratio Opening Range Breakout** strategy:

- **Opening Range**: Tracks first 15 minutes of market (9:15-9:30 AM IST)
- **Golden Ratio Entry**: Uses 61.8% Fibonacci level for precise entries
- **Risk Management**: 0.5% stop-loss, 2.0% target, hard exit at 3:15 PM
- **Real-Time Monitoring**: Web dashboard with live P&L and execution costs
- **Safety First**: Circuit breakers, kill switch, complete audit trail

**Backtest Performance (2026 data)**:
- **Profit Factor**: 1.33
- **Win Rate**: 25-38% (most days have no trades - this is normal!)
- **Strategy**: NIFTY options (buy calls/puts)

**Phase 2 Question**: Does the thin 1.33 profit factor survive real-world execution costs?

---

## 🚀 Quick Start

### Get Running in 5 Minutes

```bash
# Install
npm install

# Copy configuration
copy config\config.example.json config\config.json

# Start bot (runs in mock mode by default - safe!)
npm run live
```

In a second terminal:
```bash
# Start dashboard
npm run dashboard
```

Visit **http://localhost:3000** to see the dashboard.

✅ Bot is now running with simulated data - explore safely!

### Connect Real Market Data

See **[Getting Started Guide](docs/getting-started/README.md)** for complete setup with Upstox API.

---

## 📊 Dashboard

Real-time web dashboard at `http://localhost:3000`:

- **Live NIFTY Price**: Updates every 5 seconds
- **60-Minute Chart**: Rolling price history with opening range levels
- **Golden Ratio Levels**: Call/Put entry points calculated and displayed
- **Live Positions**: Current positions with real-time P&L
- **Cost Breakdown**: Brokerage, STT, GST, exchange charges, stamp duty
- **Trade Log**: Complete history with entry/exit details
- **Emergency Kill Switch**: Stop trading immediately

---

## 📈 Strategy Summary

### Opening Range Breakout with Golden Ratio

**Morning (9:15-9:30 AM)**: Opening Range Calculation
- Track high and low of first 15 minutes
- Calculate range: `Range = Opening High - Opening Low`

**Entry Signals (9:30 AM onwards)**:
- **CALL Entry**: Price breaks above `Opening High + (Golden Ratio × Range)`
- **PUT Entry**: Price breaks below `Opening Low - (Golden Ratio × Range)`

**Exit Rules**:
- **Stop Loss**: 0.5% below entry (call) or above entry (put)
- **Target**: 2.0% above entry (call) or below entry (put)
- **Hard Exit**: 3:15 PM - close all positions regardless of P&L

**Risk Management**:
- Maximum 2 trades per day
- Daily loss limit: 2% of capital
- No overnight positions
- No trading on NSE holidays

**Why Golden Ratio (61.8%)?**
- Fibonacci retracement level used in technical analysis
- Filters out false breakouts from opening range
- Only enters when momentum is confirmed

---

## 📁 Project Structure

```
UpstoxORBTradingBot/
├── README.md                   # You are here
├── config/
│   ├── config.example.json     # Configuration template
│   └── config.json             # Your configuration (gitignored)
├── dashboard/                  # Real-time monitoring dashboard
│   ├── index.html              # Dashboard UI
│   ├── dashboard.js            # Dashboard logic
│   ├── server.js               # Dashboard web server
│   └── styles.css              # Dashboard styling
├── src/
│   ├── bot/                    # Bot engine and state management
│   ├── data/                   # WebSocket and REST API clients
│   ├── strategy/               # ORB strategy implementation
│   └── utils/                  # Logging, config, date utilities
├── data/                       # Market data cache and bot state
├── logs/                       # Audit logs and trade journals
└── docs/                       # Complete documentation
    ├── getting-started/        # Setup and configuration guides
    ├── architecture/           # System design and architecture
    ├── operations/             # Daily checklist and procedures
    ├── phase2/                 # Phase 2 validation documentation
    ├── dashboard/              # Dashboard user guide
    ├── api/                    # Upstox API integration details
    └── troubleshooting/        # FAQ and common issues
```

---

## 📚 Documentation

### Getting Started
- **[Getting Started Guide](docs/getting-started/README.md)** - Complete setup (start here!)
- **[Configuration Guide](docs/getting-started/configuration.md)** - All configuration options
- **[Complete Guide](docs/getting-started/complete-guide.md)** - In-depth strategy guide

### Operations
- **[Daily Checklist](docs/operations/daily-checklist.md)** - Morning routine before trading
- **[Morning Routine](docs/operations/morning-routine.md)** - Critical 9:05 AM steps
- **[Pre-Launch Verification](docs/operations/pre-launch-verification.md)** - Pre-trading checks
- **[Kill Switch Issues](docs/operations/kill-switch-fragility-analysis.md)** - Known fragilities

### Phase 2
- **[Phase 2 Overview](docs/phase2/README.md)** - What is Phase 2?
- **[Expected Behavior](docs/phase2/expectations.md)** - What to expect during validation
- **[Running Guide](docs/phase2/running.md)** - How to run Phase 2 bot

### Technical
- **[Architecture](docs/architecture/overview.md)** - System design
- **[WebSocket Integration](docs/api/websocket.md)** - Real-time data feed
- **[Dashboard Guide](docs/dashboard/README.md)** - Dashboard features
- **[Troubleshooting](docs/troubleshooting/faq.md)** - Common issues and solutions

---

## 🎓 Key Concepts

### Phase 2: Real-World Validation

**Goal**: Answer the critical question: *"Does the 1.33 profit factor survive real-world execution costs?"*

The backtest shows a thin edge (1.33 profit factor), but backtests don't include:
- **Slippage**: Difference between expected and actual fill price
- **Brokerage**: ₹20 per lot
- **STT**: 0.0625% on sell side
- **Exchange Charges**: 0.053%
- **GST**: 18% on brokerage and charges
- **SEBI Fee**: 0.0001%
- **Stamp Duty**: 0.003%

**Phase 2 tracks every rupee** to see if the strategy remains profitable after real costs.

### Expected Outcomes

**Realistic Expectations**:
- **Win Rate**: 25-30% (lose 7-8 out of 10 trades)
- **Trade Frequency**: 2-3 trades per week (not per day!)
- **Most Days**: No trades (no valid setup)
- **Validation Period**: 30-60 trading days minimum
- **Data Needed**: 20-40 actual trades for statistics

**"No Trade" is Not a Failure**:
The strategy is highly selective. Most days, the setup won't trigger. This is correct behavior.

### Safety Features

**Built-In Protections**:
- ✅ **Daily Loss Limit**: Circuit breaker stops trading at 2% loss
- ✅ **Kill Switch**: Emergency stop via dashboard or Ctrl+C
- ✅ **Hard Exit**: All positions close by 3:15 PM automatically
- ✅ **Max Trades**: Limit of 2 trades per day prevents overtrading
- ✅ **Audit Trail**: Every decision logged for review
- ✅ **No Overnight**: Positions never held overnight

**Daily Mandatory Checks**:
1. **9:05 AM**: Generate fresh access token (expires daily!)
2. **9:05 AM**: Test kill switch (known fragility - must verify daily)
3. **9:10 AM**: Start bot only if both checks pass

---

## ⚙️ Commands

```bash
# Install dependencies
npm install

# Start trading bot (main process)
npm run live

# Start dashboard web server
npm run dashboard

# Verify configuration
npm run verify

# Run backtest on historical data
npm run backtest

# Fetch historical data for backtesting
npm run fetch-data
```

---

## ⚠️ Important Warnings

### 1. Token Expires Daily
Access tokens expire at 3:30 AM IST. **You MUST generate a fresh token every morning at 9:05 AM.**

Forgetting this means the bot won't connect to the market. Set a daily alarm!

### 2. Kill Switch Fragility
The kill switch has had **3 distinct failure modes in 3 days**:
- Saturday: Stale process interference
- Tuesday morning: Working (4/4 tests passed)
- Tuesday afternoon: Missing `process.exit()` call

**Lesson**: The kill switch is fragile and can break with unrelated code changes.

**Mitigation**: **Daily 9:05 AM test is mandatory** before relying on it for live trading.

See [Kill Switch Fragility Analysis](docs/operations/kill-switch-fragility-analysis.md) for details.

### 3. Low Win Rate is Normal
**25-30% win rate** means you'll lose 7-8 out of 10 trades. This is expected and psychologically difficult.

The strategy makes money because winners (2% target) are larger than losers (0.5% stop).

### 4. Most Days Have No Trades
With a selective entry system, **most days will have zero trades**. This is the strategy working correctly, not a bug.

Expect 2-3 trades per week on average, not per day.

### 5. Phase 2 is Testing
This is live validation with real market data. Expect:
- Bugs in dashboard (untested with real trades)
- Edge cases not covered in backtest
- Learning curve with real execution
- Possible strategy adjustments needed

**Trade journal logs remain source of truth**, not dashboard.

---

## 🛠️ Troubleshooting

### Bot Won't Start
```bash
# Check Node.js version (need 18+)
node --version

# Reinstall dependencies
npm install

# Check config file exists
dir config\config.json
```

### WebSocket Connection Fails
- **401 Unauthorized**: Token expired, generate fresh token
- **Connection timeout**: Check internet connection
- **Server needs initialization**: Wait 1 second after connection before subscribing

### Dashboard Shows No Data
- Ensure bot is running in first terminal
- Check `data/bot_state.json` exists
- Wait 5-30 seconds for refresh
- Refresh browser (F5)

### Kill Switch Not Working
**See**: [Kill Switch Fragility Analysis](docs/operations/kill-switch-fragility-analysis.md)
- Test daily at 9:05 AM before trading
- If test fails, DO NOT trade that day
- Manual backup: `taskkill /F /IM node.exe`

### No Trades Today
**This is expected!** The strategy is highly selective:
- Most days don't meet entry criteria
- 2-3 trades per week is normal
- "No trade" is better than a bad trade

---

## 📊 Current Status

**Phase**: Phase 2 - Live Bot with Real-Time Data  
**Status**: Ready for Validation (as of August 5, 2026)  
**Components**: ✅ All Complete
- ✅ WebSocket V3 integration with protobuf parsing
- ✅ Real-time data feed (verified with live NIFTY/RELIANCE prices)
- ✅ Opening range calculation with Golden Ratio
- ✅ Entry signal detection
- ✅ Real-time dashboard with price charts
- ✅ Complete execution cost tracking
- ✅ Trade journal logging
- ✅ Kill switch implementation (fragile - test daily!)

**Known Issues**:
- Kill switch fragility (3 failure modes in 3 days)
- Dashboard position panel untested with real trades
- WebSocket requires 1-second initialization delay

**Next Milestone**: 30-60 trading days of data collection (20-40 trades minimum)

---

## 🤝 Contributing

This is a personal trading bot project, but suggestions and bug reports are welcome!

See `docs/development/` for:
- Code style guide
- Testing procedures
- Project architecture

---

## 📜 License

MIT License - See LICENSE file for details

---

## 🙏 Disclaimer

**This software is for educational and research purposes only.**

- ⚠️ **No guarantee of profits** - Past performance does not guarantee future results
- ⚠️ **Trading carries risk** - You can lose money trading derivatives
- ⚠️ **Not financial advice** - Always consult a qualified financial advisor before trading
- ⚠️ **Use at your own risk** - Author is not responsible for trading losses
- ⚠️ **Test thoroughly** - Always validate in sandbox before live trading

**Never trade money you cannot afford to lose.**

---

## 📞 Support

- **Setup Issues**: [Getting Started Guide](docs/getting-started/README.md)
- **Common Questions**: [FAQ](docs/troubleshooting/faq.md)
- **Known Issues**: [Kill Switch Analysis](docs/operations/kill-switch-fragility-analysis.md)
- **Upstox API**: [Official Documentation](https://upstox.com/developer/api-documentation)

---

## 🗓️ Daily Checklist

**Every trading day at 9:05 AM**:

1. ☕ Wake up, have coffee
2. 🔑 Generate fresh Upstox access token (expires daily!)
3. 📝 Update `config.json` with new token
4. 🛑 Test kill switch (mandatory - known fragility)
5. ✅ If kill switch test passes, start bot at 9:10 AM
6. 📊 Start dashboard and monitor

**If kill switch test fails**: DO NOT trade that day. Investigate and fix first.

See [Daily Checklist](docs/operations/daily-checklist.md) for complete routine.

---

**Ready to start?**

👉 [Getting Started Guide](docs/getting-started/README.md)  
👉 [Configuration Guide](docs/getting-started/configuration.md)  
👉 [Daily Checklist](docs/operations/daily-checklist.md)

---

*Last Updated: August 4, 2026*  
*Current Phase: Phase 2 - Live Bot Validation*  
*Next: 30-60 days of data collection to validate real-world profitability*
