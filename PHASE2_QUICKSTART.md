# Phase 2 - Live Bot Quick Start

**Status**: ✅ Build Complete - Ready for Testing

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

**New dependency added**: `csv-parse` for instrument master parsing

### 2. Verify Configuration

Check `config/config.json`:

```json
{
  "upstox": {
    "accessToken": "YOUR_ACCESS_TOKEN",
    "useSandbox": true
  },
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 2.0,
    "maxTradesPerDay": 2,
    "instruments": ["NIFTY"],
    "marketOpen": "09:15",
    "marketClose": "15:30",
    "hardExitTime": "15:15"
  },
  "costs": {
    "brokerage_per_order": 20,
    "stt_rate": 0.000625,
    "exchange_rate": 0.00053,
    "gst_rate": 0.18,
    "stamp_duty_rate": 0.00003
  }
}
```

### 3. Run the Live Bot

```bash
npm run live
```

**Or directly:**

```bash
node src/bot/run-live-bot.js
```

### 4. Monitor

The bot will log to:
- `logs/main_YYYY-MM-DD.log` - Main bot logs
- `logs/trades/trades_YYYY-MM-DD.csv` - Trade data (CSV)
- `logs/trades/trades_YYYY-MM-DD.json` - Trade data (JSON)
- `logs/trades/summary_daily_YYYY-MM-DD.txt` - Daily summary

---

## 📊 What to Expect

### Pre-Market (Before 9:15 AM)
```
🚀 Initializing Upstox ORB Trading Bot (Live Mode)
✅ Configuration loaded
✅ Session manager initialized
⚠️  Not market hours yet - waiting for 9:15 AM
```

### Market Open (9:15 AM)
```
📈 Market opened - starting trading session
Calculating opening range (9:15-9:30 AM)...
Opening range calculated: High=25100, Low=25050
Golden Ratio levels: Long=25110, Short=25040
State: MONITORING - watching for breakout
```

### Trade Execution
```
Entry signal detected: LONG at 25112
Finding ATM strike...
Selected: NIFTY26AUGCE25100
Placing entry order: BUY 50 qty @ ₹450.50
✅ Position opened
Monitoring position...
Target hit at ₹459.20
✅ Position closed
Raw P&L: ₹400.00
Cost-adjusted P&L: -₹51.61
Verdict: ❌ Costs erased profit
```

### Market Close (3:30 PM)
```
📉 Market closed - ending trading session
Generating daily summary...
Daily Summary:
  Trades: 1
  Win Rate: 0%
  Raw P&L: ₹400
  Adjusted P&L: -₹51.61
  Costs: ₹451.61 (112.9% of raw)
```

---

## 🛡️ Safety Features

### 1. Circuit Breaker
Automatically stops trading if daily loss exceeds -2%

### 2. Kill Switch
Create file `.kill-switch` in root directory to immediately stop bot:

```bash
echo. > .kill-switch
```

Remove to resume (requires manual restart):

```bash
del .kill-switch
```

### 3. Graceful Shutdown
Press `Ctrl+C` to stop bot gracefully:
- Closes open positions
- Generates final summaries
- Saves all data

---

## 📈 Monitoring During 30-60 Day Test

### Daily Review

**Check logs:**
```bash
type logs\main_2026-07-31.log
```

**Check trades CSV:**
```bash
type logs\trades\trades_2026-07-31.csv
```

Import CSV into Excel for analysis:
- Date, Instrument, Entry, Exit, P&L
- Raw vs Adjusted P&L
- Cost breakdown

### Weekly Review

**Check weekly summary:**
```bash
type logs\trades\summary_weekly_2026-07-31.txt
```

**Key metrics to track:**
- Total trades
- Win rate (expect 25-30%)
- Raw vs adjusted P&L
- Cost as % of raw P&L
- Profit factor (need > 1.2 after costs)

### Red Flags 🚨

Stop immediately if:
- Circuit breaker triggers repeatedly
- Cost-adjusted P&L consistently negative
- Average costs > 40% of raw P&L
- Profit factor < 1.0 after 30+ trades

---

## 🔧 Troubleshooting

### Bot Won't Start

**Check access token:**
```json
"accessToken": "YOUR_VALID_TOKEN"
```

Token expires every ~30 days - regenerate if needed.

**Check market hours:**
Bot only runs during market hours (9:15 AM - 3:30 PM IST)

### WebSocket Disconnects

Bot automatically reconnects up to 10 times.
Check logs for reconnection status.

### No Trades Happening

**Possible reasons:**
- Past last entry time (2:45 PM)
- Max trades per day reached (2)
- Circuit breaker triggered
- No breakout signal
- Poor liquidity (spread too wide)

### Position Not Closing

**Check:**
- Stop loss / target levels
- Hard exit time (3:15 PM)
- WebSocket connection status

**Manual close:**
Create kill switch file to force close all positions

---

## 📊 Expected Performance

### Backtest Results (2026 Data)
- Strategy: NIFTY Golden Ratio
- Profit Factor: 1.33 (test period)
- Win Rate: ~27%
- This is a **thin margin**

### Phase 2 Goal
Measure if costs erase this edge:

**Best case**: Cost-adjusted PF = 1.2-1.3 ✅  
**Realistic**: Cost-adjusted PF = 1.0-1.2 ⚠️  
**Worst case**: Cost-adjusted PF < 1.0 ❌

### Decision Criteria

After 30-60 days:
- **PF > 1.2**: Edge survives, consider live trading
- **PF 1.0-1.2**: Marginal, needs deeper analysis
- **PF < 1.0**: Strategy doesn't work with real costs

---

## 📝 Files Generated

### Logs Directory
```
logs/
├── main_2026-07-31.log          # Main bot log
├── trades_2026-07-31.log        # Trade-specific log
└── trades/
    ├── trades_2026-07-31.csv    # CSV export
    ├── trades_2026-07-31.json   # JSON export
    └── summary_daily_2026-07-31.txt
```

### Data Directory
```
data/
└── instrument_master_cache.json  # Cached instruments
```

---

## ⚠️ Important Notes

1. **This is sandbox mode** - No real money at risk
2. **Market data is live** - Real prices, simulated orders
3. **Run for minimum 30 days** - Don't draw conclusions early
4. **Low win rate is normal** - 25-30% expected
5. **Costs are the question** - Not if strategy works, but if it survives costs

---

## 🎯 Next Steps After Build

1. **Install dependencies**: `npm install csv-parse`
2. **Test with market data**: Run during market hours
3. **Verify all components**: Check logs for errors
4. **Begin 30-60 day test**: Let it run continuously
5. **Review weekly**: Check cost impact on performance
6. **Make go/no-go decision**: After collecting enough data

---

## 📞 Support

**Issues?**
- Check `logs/main_YYYY-MM-DD.log` for errors
- Verify configuration in `config/config.json`
- Ensure access token is valid
- Confirm market hours

**Questions about results?**
- Review `BACKTEST_RESULTS_2026.md` for context
- Check `PHASE2_EXPECTATIONS.md` for realistic expectations
- Remember: Low win rate (25-30%) is expected

---

**Status**: ✅ Build Complete - Ready for Testing  
**Next**: Install dependencies and begin validation phase  
**Timeline**: 30-60 days minimum before any conclusions
