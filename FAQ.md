# Frequently Asked Questions (FAQ)

## General Questions

### What is this project?

This is an Opening Range Breakout (ORB) trading bot for Indian F&O markets (Nifty/BankNifty) using the Upstox API. It's designed in phases:
- **Phase 1**: Historical backtesting (current)
- **Phase 2**: Sandbox/paper trading
- **Phase 3**: Alerting and monitoring
- **Future**: Live trading (only after proven success)

### Is this ready for real trading?

**NO.** The current phase is historical backtesting only. You must:
1. Complete Phase 1 and prove statistical edge
2. Complete Phase 2 and test in sandbox for weeks
3. Complete Phase 3 and monitor extensively
4. Only then consider live trading with minimal capital

### How much does it cost?

The bot itself is free (open source). You'll need:
- Upstox account (free)
- Upstox API access (free tier available)
- For live trading: trading capital + brokerage fees

### Do I need to know programming?

Basic understanding helps, but not required. You can:
- Run the bot using simple commands
- Configure via JSON files
- Tune parameters without coding
- Review results in CSV (Excel)

For custom modifications, JavaScript knowledge is needed.

---

## Setup Questions

### How do I get started?

See [QUICKSTART.md](QUICKSTART.md) for two options:
1. **Quick test** (5 min): Use sample data, no API needed
2. **Full setup** (30 min): Use real Upstox data

### What are the system requirements?

- Windows/Mac/Linux
- Node.js 18 or higher
- Internet connection (for API calls)
- 1GB free disk space (for data cache)

### Do I need a Upstox account?

For real backtesting, yes. For testing with sample data, no.

### How do I get Upstox API credentials?

1. Sign up at [upstox.com](https://upstox.com)
2. Go to [Developer Portal](https://upstox.com/developer/apps)
3. Create a new app
4. Get your API Key and API Secret

Full instructions in [SETUP.md](SETUP.md).

### Why does my access token keep expiring?

Upstox access tokens expire after 24 hours. You must:
- Generate a new token daily
- Or implement automatic token refresh (advanced)

### Can I use this without API access?

Yes! Run `npm run generate-sample` to create synthetic data for testing. But this won't show real market performance.

---

## Backtest Questions

### How long does a backtest take?

- **Data fetch**: 10-15 minutes (one-time, then cached)
- **Backtest run**: 30-60 seconds
- **Total first time**: ~15 minutes
- **Subsequent runs**: <1 minute (uses cache)

### How much data do I need?

Recommended: 3-6 months (60-120 trading days)

This gives:
- Enough trades for statistical significance (30+)
- Coverage of different market conditions
- Reliable performance metrics

### What if my backtest shows no edge?

**DO NOT proceed to live trading.** Instead:

1. Tune parameters (see parameter guide below)
2. Try different instruments
3. Test different timeframes
4. Add filters (volume, volatility)
5. Re-run backtest until you see edge

### What is "statistical edge"?

It means the strategy has a genuine, measurable advantage based on:
- Win rate ≥50%
- Profit factor ≥1.5
- Positive expectancy
- Sufficient sample size
- Reasonable drawdown

The bot automatically evaluates this with a 5-criteria test.

### What's a good win rate?

50%+ is acceptable, 60%+ is good, 70%+ is excellent.

But win rate alone doesn't matter. A 40% win rate can still be profitable if winners are much larger than losers (high profit factor).

### What's profit factor?

Profit Factor = Gross Profit / Gross Loss

- <1.0: Losing strategy
- 1.0-1.5: Marginal
- 1.5-2.0: Good
- 2.0+: Excellent

### What's expectancy?

Average amount you expect to make per trade, as a percentage.

Expectancy = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)

- Positive: Strategy has edge
- Negative: Strategy loses money
- Zero: Break-even

### Can I backtest options instead of indices?

The current version trades indices (Nifty/BankNifty). Option trading requires additional logic for:
- Strike selection
- Option pricing
- Greeks calculation
- Expiry management

This is planned for future enhancement.

---

## Strategy Questions

### What is Opening Range Breakout (ORB)?

A strategy based on:
1. First 15 minutes of trading = "opening range"
2. Record high and low of this range
3. If price breaks above high → go long
4. If price breaks below low → go short
5. Exit on stop loss, target, or end of day

### Why 15 minutes?

Common choice, but you can test 5, 10, 20 minutes. Configure in:
```json
"trading": {
  "openingRangeDuration": 15
}
```

### How do I change the stop loss?

Edit `config/config.json`:
```json
"strategy": {
  "stopLossPercent": 1.0  // 1% below entry (long)
}
```

Try values: 0.5%, 1.0%, 1.5%, 2.0%

### How do I change the target?

Edit `config/config.json`:
```json
"strategy": {
  "targetPercent": 2.0  // 2% above entry (long)
}
```

Try values: 1.0%, 1.5%, 2.0%, 2.5%, 3.0%

### Should I use trailing stop?

Depends on your preference:

**Pros**: Protects profits, lets winners run
**Cons**: May exit too early on pullbacks

Test both:
```json
"strategy": {
  "useTrailingStop": true,   // or false
  "trailingStopPercent": 0.5
}
```

### Why only 1-2 trades per day?

Prevents overtrading and reduces costs. ORB typically gives 0-1 clear signals per day. More trades often means chasing, which reduces edge.

### Why exit by 3:15 PM?

Two reasons:
1. **Liquidity**: Dries up in last 15 minutes
2. **Safety**: Never hold overnight (high gap risk)

### Can I trade overnight?

**NO.** This bot is intraday only. Overnight positions have:
- Gap risk (news, global markets)
- Margin requirements
- Different risk profile

Not recommended for algo trading.

---

## Parameter Tuning Guide

### Stop Loss Too Tight?

**Symptoms**: Many stop loss hits, low win rate

**Solution**: Increase stop loss %
```json
"stopLossPercent": 1.5  // was 1.0
```

### Stop Loss Too Loose?

**Symptoms**: Large losses, high drawdown

**Solution**: Decrease stop loss %
```json
"stopLossPercent": 0.75  // was 1.0
```

### Target Never Reached?

**Symptoms**: Always exits at end of day, not on target

**Solution**: Decrease target %
```json
"targetPercent": 1.5  // was 2.0
```

### Target Too Easy?

**Symptoms**: Always hits target, missing bigger moves

**Solution**: Increase target or add trailing stop
```json
"targetPercent": 2.5,
"useTrailingStop": true
```

### Too Many False Breakouts?

**Symptoms**: Breakout → immediate reversal → stop loss

**Solutions**:
1. Increase opening range duration (more consolidation)
2. Add volume filter (future enhancement)
3. Add volatility filter (future enhancement)

### Not Enough Trades?

**Symptoms**: <30 trades in 6 months

**Solutions**:
1. Extend date range (fetch more data)
2. Add more instruments (FINNIFTY)
3. Reduce opening range duration (5-10 min)
4. Loosen entry criteria (future enhancement)

---

## Technical Questions

### Where is data stored?

```
data/
  ├── NIFTY_2024-07-31.json       # Candle data (cached)
  └── backtest_orb_*.json         # Results
```

### Where are logs stored?

```
logs/
  ├── main_2024-07-31.log         # General logs
  ├── trades_2024-07-31.log       # Trade logs
  └── audit_2024-07-31.log        # Audit trail
```

### How do I clear the cache?

Delete files in `data/` folder:
```bash
del data\NIFTY_*.json
del data\BANKNIFTY_*.json
```

Then re-fetch: `npm run fetch-data`

### Can I export results to Excel?

Yes! The bot generates CSV files:
```
data/trades_NIFTY_2024-07-31.csv
```

Open in Excel for analysis.

### How do I run multiple backtests?

Just run `npm run backtest` multiple times with different parameters. Each run saves results with a timestamp.

### Can I automate parameter optimization?

Not built-in, but you can:
1. Write a script to loop through parameters
2. Run backtest for each combination
3. Compare results
4. Pick best parameters

(Advanced users only)

---

## Error Messages

### "Config file not found"

**Cause**: Missing config.json

**Fix**:
```bash
copy config\config.example.json config\config.json
```

### "Unauthorized" or "401"

**Cause**: Invalid or expired access token

**Fix**: Get a new access token (see SETUP.md Step 3)

### "Rate limit exceeded"

**Cause**: Too many API calls

**Fix**: Wait 1 minute, then retry. The bot has rate limiting built-in, but manual rapid calls can trigger this.

### "No data found for date"

**Cause**: Missing cached data or non-trading day

**Fix**: Run `npm run fetch-data` or check if it's a holiday/weekend.

### "No trades executed"

**Cause**: Strategy parameters too restrictive or data issues

**Fix**:
1. Check logs for warnings
2. Verify data was fetched
3. Try looser parameters (smaller SL/target)
4. Ensure date range has trading days

### "Module not found"

**Cause**: Dependencies not installed

**Fix**:
```bash
npm install
```

---

## Safety & Risk Questions

### Is this bot safe?

Phase 1 is completely safe (no orders placed). Phase 2+ includes safety features:
- Circuit breaker (stops on daily loss limit)
- Kill switch (manual emergency stop)
- Idempotent orders (no duplicates)
- Full audit trail

But all trading carries risk. Never trade money you can't afford to lose.

### What if the bot malfunctions?

Safety features:
1. **Kill Switch**: Stops immediately, exits positions
2. **Circuit Breaker**: Triggers on excessive loss
3. **Hard Exit**: Always closes by 3:15 PM
4. **Audit Logs**: Every action recorded

You can manually:
- Stop the bot (Ctrl+C)
- Login to Upstox and close positions manually

### Can I lose more than my stop loss?

In normal conditions: No. The stop loss is enforced.

In extreme conditions (gap down, circuit limits): Possibly. This is why:
- Never risk more than 2% per trade
- Use proper position sizing
- Monitor actively during operation

### What's the maximum daily loss?

Configured in:
```json
"trading": {
  "dailyLossLimitPercent": 2  // 2% of capital
}
```

Once hit, bot stops trading for the day.

### Should I run this on a VPS?

For live trading: Yes. Benefits:
- Always on
- Stable connection
- No power/internet interruptions

For backtesting: No. Run on your local machine.

---

## Performance Questions

### What return can I expect?

**There are no guarantees.** Backtest results show historical performance, which may not repeat.

Typical ORB strategies aim for:
- 1-3% per month
- 12-40% per year
- With 10-20% drawdowns

Your results will vary based on:
- Market conditions
- Parameter tuning
- Execution quality
- Position sizing

### How much capital do I need?

Minimum recommended: ₹1,00,000

Why?
- Allows proper position sizing
- Withstands drawdowns
- Covers margin requirements
- Meets exchange minimums

Start with paper trading (₹0) to prove the system.

### What's the best instrument?

Test both Nifty and BankNifty:
- **Nifty**: More stable, lower volatility
- **BankNifty**: Higher volatility, bigger moves

Your backtest will show which works better for ORB.

### Does the strategy work in all market conditions?

No strategy works all the time. ORB typically works better in:
- ✓ Trending markets
- ✓ Directional days
- ✓ Post-news events

Struggles in:
- ✗ Range-bound markets
- ✗ Low volatility
- ✗ Choppy/whipsaw days

This is why proper risk management is critical.

---

## Next Steps

### I passed Phase 1, now what?

1. Review [CHECKLIST.md](CHECKLIST.md) Phase 2 section
2. Implement WebSocket client (or wait for it to be built)
3. Integrate bot engine
4. Test in sandbox for 2+ weeks
5. Monitor closely

### Where can I learn more about ORB?

Resources:
- [Investopedia: Opening Range Breakout](https://www.investopedia.com/articles/trading/08/opening-range-breakout.asp)
- Search "Opening Range Breakout" on YouTube
- Read trading books on intraday strategies

### Can I contribute to this project?

Currently this is a custom project, but you can:
- Report issues you find
- Suggest improvements
- Share your parameter tuning results
- Help test new features

### Where can I get help?

1. Check all documentation (*.md files)
2. Review logs in `logs/` folder
3. Check [Upstox API docs](https://upstox.com/developer/api-documentation)
4. Search error messages online

---

## Disclaimer

⚠️ **IMPORTANT LEGAL DISCLAIMER**

- This software is for educational purposes
- No guarantee of profits
- Past performance ≠ future results
- Trading carries risk of loss
- Never trade money you can't afford to lose
- Consult a financial advisor before trading
- Author is not responsible for your losses
- Use at your own risk

**Always start with paper trading and prove the system works before risking real money.**

---

**Last Updated**: July 31, 2026  
**Version**: 1.0.0
