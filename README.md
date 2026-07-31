# Upstox ORB Trading Bot

Opening Range Breakout strategy for Indian F&O markets (NIFTY/BANKNIFTY) using Upstox API.

⚠️ **SANDBOX/PAPER TRADING ONLY** - No real money

---

## 📊 Current Status

**Phase 1**: ✅ Complete - Strategy validated on 2026 market data  
**Phase 2**: 🟡 In Progress (15%) - Building sandbox bot  
**Phase 3**: ⏹️ Not started - Live trading (only after Phase 2 success)

**Strategy**: NIFTY Golden Ratio Breakout  
**Performance**: 1.33 profit factor on test data (thin margin)  
**Key Question**: Do execution costs erase the edge?

📖 **[Read the Complete Guide](GUIDE.md)** for full details

---

## 🚀 Quick Start

### Backtest (Phase 1)
```bash
npm install
# Configure config/config.json with API credentials
node src/data/fetch-historical.js
npm run backtest
```

### Results
- See `BACKTEST_RESULTS_2026.md` for analysis
- See `data/backtest_*.json` for raw results

---

## 📁 Documentation

**Essential**:
- [GUIDE.md](GUIDE.md) - Complete guide (start here)
- [BACKTEST_RESULTS_2026.md](BACKTEST_RESULTS_2026.md) - Current data analysis
- [QUICKSTART.md](QUICKSTART.md) - Get started in 5 minutes

**Reference**:
- [SETUP.md](SETUP.md) - Detailed setup
- [FAQ.md](FAQ.md) - Common questions
- [ARCHITECTURE.md](ARCHITECTURE.md) - System design
- [CHECKLIST.md](CHECKLIST.md) - Implementation checklist

**Phase 2**:
- [PHASE2_IMPLEMENTATION.md](PHASE2_IMPLEMENTATION.md) - Architecture & plan
- [PHASE2_STATUS.md](PHASE2_STATUS.md) - Current progress
- [PHASE2_EXPECTATIONS.md](PHASE2_EXPECTATIONS.md) - What to expect

---

## ⚠️ Key Warnings

1. **Thin Margins**: 1.33 profit factor - execution costs could erase this
2. **Low Win Rate**: 25-38% (lose 6-8 of 10 trades) - psychologically difficult
3. **Regime Dependent**: Works in 2026 conditions, failed in 2024 conditions
4. **Phase 2 Required**: Sandbox testing mandatory before any live trading
5. **You Can Lose Money**: Past performance ≠ future returns

---

## 🎯 Strategy Summary

**NIFTY Golden Ratio Breakout**
- Entry: 61.8% Fib + opening range breakout
- Instrument: NIFTY options (buy calls/puts)
- Stop: 0.5% | Target: 2.0% | Exit: 3:15 PM
- Win Rate: 25-38% | Profit Factor: 1.33

See [GUIDE.md](GUIDE.md) for details.

---

## 📊 Commands

```bash
npm run backtest       # Run backtest
npm run verify         # Verify setup
npm run fetch-data     # Fetch historical data
```

---

**Status**: Foundation built, continuing Phase 2 implementation  
**Timeline**: 3-4 weeks to complete build + 30-60 days testing  
**Next**: Sandbox bot operational with real trade data
```

## Development Phases

### Phase 1: Historical Backtest (CURRENT)
- Pull 3-6 months historical data
- Simulate ORB strategy
- Generate performance report
- **Gate**: Must show statistical edge before proceeding

### Phase 2: Sandbox Bot (AFTER Phase 1)
- Live WebSocket feed integration
- Sandbox order execution
- Real-time monitoring

### Phase 3: Alerting & Safety (AFTER Phase 2)
- Telegram/Discord alerts
- Kill switch implementation
- Full audit trail

## Strategy Rules - Opening Range Breakout (ORB)

1. **Opening Range**: 9:15 AM - 9:30 AM IST (15 min)
2. **Entry**: Breakout above High (long) or below Low (short)
3. **One trade direction per day**
4. **No entries after 2:45 PM**
5. **Stop-loss**: Optimized via backtest
6. **Target**: Fixed or trailing (optimized)
7. **Hard exit**: 3:15-3:20 PM
8. **Daily loss limit**: Based on ₹1,00,000 capital
9. **Max 1-2 trades/day**
10. **Skip**: Holidays & special handling for expiry days

## Safety Features

✅ Hard daily loss circuit-breaker  
✅ Manual kill switch  
✅ Idempotent order handling  
✅ Full audit logging  
✅ Real-time alerts  
✅ Dynamic instrument/lot size fetching  
✅ Automatic expiry rollover  

## 🎓 Strategy Overview

**Opening Range Breakout (ORB)**:
1. First 15 minutes (9:15-9:30 AM IST) = opening range
2. Record high and low
3. If price breaks above high → Enter LONG
4. If price breaks below low → Enter SHORT
5. Exit on: stop loss, target, or 3:15 PM (hard exit)

**Key Features**:
- ✅ Stop loss & target (configurable %)
- ✅ Trailing stop (optional)
- ✅ Daily loss limit (circuit breaker)
- ✅ Max 1-2 trades per day
- ✅ No overnight positions
- ✅ NSE holiday aware

## 🛡️ Safety Features

Non-negotiable safety built-in:

- ✅ **Hard daily loss circuit breaker** (cannot be bypassed)
- ✅ **Kill switch** (emergency stop)
- ✅ **Idempotent order handling** (no duplicate orders)
- ✅ **Complete audit trail** (every decision logged)
- ✅ **Statistical edge validation** (must pass to proceed)
- ✅ **Hard exit time** (always close by 3:15 PM)

## 📊 Backtest Results

The bot evaluates your strategy against 5 criteria:

| Criteria | Target | Purpose |
|----------|--------|---------|
| Win Rate | ≥50% | Consistency |
| Profit Factor | ≥1.5 | Risk/reward ratio |
| Expectancy | Positive | Average edge per trade |
| Sample Size | ≥30 trades | Statistical significance |
| Max Drawdown | <10% | Risk exposure |

**Score ≥3.5/5 = PASS** → Proceed to Phase 2  
**Score <3.5/5 = FAIL** → Tune parameters and retry

**The bot tells you explicitly whether to proceed or not.**

## ⚙️ Configuration

All parameters are tunable in `config/config.json`:

```json
{
  "strategy": {
    "stopLossPercent": 1.0,        // Try: 0.5, 1.5, 2.0
    "targetPercent": 2.0,           // Try: 1.5, 2.5, 3.0
    "useTrailingStop": true,        // Try: false
    "trailingStopPercent": 0.5      // Try: 0.3, 0.7, 1.0
  },
  "trading": {
    "openingRangeDuration": 15,     // Try: 5, 10, 20 minutes
    "dailyLossLimitPercent": 2,     // Circuit breaker threshold
    "maxTradesPerDay": 2,           // Prevent overtrading
    "instruments": ["NIFTY", "BANKNIFTY"]
  }
}
```

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| "Config file not found" | Run: `copy config\config.example.json config\config.json` |
| "Unauthorized" | Get new access token (expires daily) |
| "No data found" | Run: `npm run fetch-data` first |
| "No trades executed" | Try smaller stop loss/target (0.5%, 1%) |

**Full troubleshooting**: See [FAQ.md](FAQ.md)

## ⚠️ Important Warnings

- 🚨 **Phase 1 is backtesting only** - No real money involved
- 🚨 **Past performance ≠ future results**
- 🚨 **DO NOT proceed to live trading without proven edge**
- 🚨 **Always start with paper trading first**
- 🚨 **Never trade money you can't afford to lose**

## 📈 Example Results

After running backtest, you'll see:

```
Win Rate: 62.22%
Profit Factor: 2.01
Expectancy: 0.99%
Max Drawdown: 8.32%
Score: 4.5/5

Decision: ✓ HAS EDGE
Recommendation: Proceed to Phase 2
```

Results are saved to:
- `data/backtest_orb_*.json` (full results)
- `data/trades_*.csv` (Excel-ready)
- `logs/` (detailed audit trail)

## 🚦 Next Steps

1. ✅ Run setup verification: `npm run verify`
2. ✅ Generate test data: `npm run generate-sample`
3. ✅ Run backtest: `npm run backtest`
4. ✅ Review results
5. ✅ If passed → See [CHECKLIST.md](CHECKLIST.md) for Phase 2
6. ✅ If failed → Tune parameters and retry

## 🤝 Support

- **Setup issues**: See [SETUP.md](SETUP.md)
- **Common questions**: See [FAQ.md](FAQ.md)
- **Upstox API**: [Documentation](https://upstox.com/developer/api-documentation)
- **Logs**: Check `logs/` folder for detailed errors

## 📜 License

MIT

## 🙏 Disclaimer

This software is for educational purposes. No guarantee of profits. Trading carries risk of loss. Past performance does not guarantee future results. Always consult a financial advisor before trading. Use at your own risk.

---

**📚 Complete Documentation**: See [INDEX.md](INDEX.md) for all 12 guides

**🎉 Ready to start?** → [START_HERE.md](START_HERE.md) | Or run: `get-started.bat` (Windows)

## 📚 Documentation

| Document | Purpose | Time |
|----------|---------|------|
| [QUICKSTART.md](QUICKSTART.md) | Get running in 5 minutes | 5 min |
| [SETUP.md](SETUP.md) | Detailed setup with Upstox API | 30 min |
| [FAQ.md](FAQ.md) | 50+ common questions answered | Reference |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design & architecture | Deep dive |
| [CHECKLIST.md](CHECKLIST.md) | Phase-by-phase progress tracker | Ongoing |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | What works, what doesn't | Reference |
| [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) | What has been built | Overview |

## 🏗️ Project Structure

```
upstox-orb-bot/
├── src/
│   ├── backtest/      ✅ Phase 1 (Complete)
│   ├── data/          ✅ Data layer (Complete)
│   ├── strategy/      ✅ ORB strategy (Complete)
│   ├── execution/     🚧 Phase 2 (Framework ready)
│   ├── risk/          🚧 Phase 2 (Framework ready)
│   └── utils/         ✅ Utilities (Complete)
├── config/            Configuration files
├── data/              Cached data & results
└── logs/              Audit & operation logs
```

See [PROJECT_TREE.txt](PROJECT_TREE.txt) for complete structure.

## Requirements

- Node.js 18+
- Upstox API credentials (sandbox)
- Internet connection for API calls

## Compliance

- Sandbox/paper trading only
- No real order placement in this phase
- SEBI algo registration not required (< 10 orders/sec)
