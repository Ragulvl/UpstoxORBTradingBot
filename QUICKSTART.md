# Quick Start Guide

Get your ORB bot backtest running in under 10 minutes!

## Option 1: Quick Test with Sample Data (Fastest - 5 minutes)

Perfect for testing the system without API setup.

```bash
# 1. Install dependencies
npm install

# 2. Create config from template
copy config\config.example.json config\config.json

# 3. Generate sample data (synthetic, not real market data)
npm run generate-sample

# 4. Run backtest
npm run backtest
```

✅ You'll see a complete backtest report with performance metrics!

⚠️ **Note**: This uses synthetic data for testing only. For real backtests, use Option 2.

---

## Option 2: Full Setup with Real Data (30 minutes)

For serious backtesting with actual market data.

### Step 1: Install (2 min)
```bash
npm install
```

### Step 2: Get Upstox API Access (10 min)

1. Sign up at [upstox.com](https://upstox.com)
2. Go to [Upstox Developer Portal](https://upstox.com/developer/apps)
3. Create a new app
4. Note your **API Key** and **API Secret**

### Step 3: Get Access Token (5 min)

1. Visit (replace YOUR_API_KEY):
```
https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=http://localhost:8080/callback
```

2. Login and authorize

3. You'll be redirected to a URL with a `code` parameter. Copy it.

4. Exchange code for token (replace YOUR_CODE, YOUR_API_KEY, YOUR_API_SECRET):

On Windows CMD:
```cmd
curl -X POST "https://api.upstox.com/v2/login/authorization/token" ^
  -H "accept: application/json" ^
  -H "Content-Type: application/x-www-form-urlencoded" ^
  -d "code=YOUR_CODE&client_id=YOUR_API_KEY&client_secret=YOUR_API_SECRET&redirect_uri=http://localhost:8080/callback&grant_type=authorization_code"
```

5. Copy the `access_token` from response

### Step 4: Configure (3 min)

1. Copy config template:
```bash
copy config\config.example.json config\config.json
```

2. Edit `config/config.json`:
```json
{
  "upstox": {
    "apiKey": "YOUR_API_KEY",
    "apiSecret": "YOUR_API_SECRET",
    "accessToken": "YOUR_ACCESS_TOKEN",
    "useSandbox": true
  }
}
```

### Step 5: Fetch Data (10 min)
```bash
npm run fetch-data
```

This downloads 6 months of historical data. Be patient!

### Step 6: Run Backtest (1 min)
```bash
npm run backtest
```

---

## Understanding Your Results

After the backtest runs, you'll see a report like:

```
================================================================================
ORB STRATEGY BACKTEST REPORT
================================================================================
Instrument: NIFTY
Period: 2024-02-01 to 2024-07-31
Trading Days: 125
--------------------------------------------------------------------------------
PERFORMANCE METRICS:
Total Trades: 45
Winning Trades: 28
Losing Trades: 17
Win Rate: 62.22%
Average Win: 1.85%
Average Loss: -0.92%
Profit Factor: 2.01
Expectancy: 0.99%
--------------------------------------------------------------------------------
PROFIT & LOSS:
Total P&L (Percent): 44.55%
Total P&L (Points): 9,801.50
Initial Capital: ₹1,00,000
Final Capital: ₹1,44,550
Net P&L: ₹44,550
Max Drawdown: 8.32%
--------------------------------------------------------------------------------
STATISTICAL EDGE ANALYSIS:
Score: 4.5/5
  ✓ Win rate is acceptable (≥50%)
  ✓ Profit factor is strong (≥1.5)
  ✓ Positive expectancy - strategy has edge
  ✓ Sufficient sample size (≥30 trades)
  ✓ Low drawdown (<10%)

Decision: ✓ HAS EDGE
Recommendation: Strategy shows statistical edge. Proceed to Phase 2.
================================================================================
```

### What to Look For

✅ **PASS** if you see:
- Win Rate ≥50%
- Profit Factor ≥1.5
- Positive Expectancy
- Score ≥3.5/5
- "✓ HAS EDGE"

❌ **FAIL** if you see:
- Win Rate <50%
- Profit Factor <1.0
- Negative Expectancy
- "✗ NO EDGE"

---

## Next Steps

### If PASSED ✅
Congratulations! Your strategy has statistical edge.

**Next**: Review CHECKLIST.md and start Phase 2 (Sandbox Bot)

### If FAILED ❌
Don't worry! Try tuning these parameters in `config/config.json`:

```json
{
  "strategy": {
    "stopLossPercent": 1.0,      // Try: 0.5, 1.5, 2.0
    "targetPercent": 2.0,         // Try: 1.5, 2.5, 3.0
    "useTrailingStop": true,      // Try: false
    "trailingStopPercent": 0.5    // Try: 0.3, 0.7, 1.0
  },
  "trading": {
    "openingRangeDuration": 15    // Try: 5, 10, 20 minutes
  }
}
```

Then re-run:
```bash
npm run backtest
```

---

## Troubleshooting

### "Cannot find module"
```bash
npm install
```

### "Config file not found"
```bash
copy config\config.example.json config\config.json
```

### "Unauthorized" / "Invalid token"
Your access token expired. Get a new one (Step 3).

### "No data found"
Run `npm run fetch-data` first.

### "No trades executed"
- Check date range has trading days
- Try smaller stop loss/target (0.5%, 1%)
- Verify data was downloaded

---

## Files Generated

After running, check these files:

```
data/
  ├── NIFTY_2024-02-01.json          # Cached candle data
  ├── BANKNIFTY_2024-02-01.json      # Cached candle data
  ├── backtest_orb_*.json            # Full backtest results
  └── trades_NIFTY_*.csv             # All trades (open in Excel)

logs/
  ├── main_2024-07-31.log            # General logs
  ├── trades_2024-07-31.log          # Trade logs
  └── audit_2024-07-31.log           # Audit trail
```

---

## Common Questions

**Q: Is this real trading?**  
A: No, Phase 1 is historical backtesting only. No orders are placed.

**Q: Can I use this with real money?**  
A: Not yet. Complete Phase 1, then Phase 2 (sandbox), before considering live trading.

**Q: How long does data fetch take?**  
A: 10-15 minutes for 6 months of data (rate limited by API).

**Q: Do I need to pay Upstox?**  
A: No, the free tier includes historical data and sandbox access.

**Q: Can I backtest other instruments?**  
A: Yes, edit `trading.instruments` in config. Options: NIFTY, BANKNIFTY, FINNIFTY.

**Q: What if backtest shows no edge?**  
A: Tune parameters and re-test. DO NOT proceed to live trading without edge.

---

## Support

- **Setup Issues**: See SETUP.md for detailed instructions
- **Architecture Questions**: See ARCHITECTURE.md
- **Upstox API**: https://upstox.com/developer/api-documentation
- **Logs**: Check `logs/` folder for detailed error messages

---

Happy backtesting! 🚀
