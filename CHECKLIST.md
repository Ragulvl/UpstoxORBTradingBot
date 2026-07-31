# Implementation Checklist

Use this checklist to track your progress through the bot development phases.

## Phase 1: Historical Backtest ⏳

### Setup
- [ ] Install Node.js 18+
- [ ] Clone/download project
- [ ] Run `npm install`
- [ ] Create Upstox developer account
- [ ] Create Upstox API app
- [ ] Copy `config/config.example.json` to `config/config.json`
- [ ] Copy `.env.example` to `.env`
- [ ] Add Upstox API credentials to config
- [ ] Get access token from Upstox OAuth flow
- [ ] Add access token to config

### Data Collection
- [ ] Configure backtest date range (3-6 months recommended)
- [ ] Run `npm run fetch-data` to download historical data
- [ ] Verify data cached in `data/` folder
- [ ] Check logs for any missing dates

### Strategy Configuration
- [ ] Review default strategy parameters
- [ ] Adjust stop loss % if needed (default: 1%)
- [ ] Adjust target % if needed (default: 2%)
- [ ] Configure trailing stop (default: enabled, 0.5%)
- [ ] Set daily loss limit % (default: 2%)
- [ ] Choose instruments (default: NIFTY, BANKNIFTY)

### Run Backtest
- [ ] Run `npm run backtest`
- [ ] Review console output for results
- [ ] Check generated files in `data/`:
  - [ ] `backtest_orb_*.json` (full results)
  - [ ] `trades_*.csv` (all trades)

### Evaluate Results
- [ ] Review win rate (target: ≥50%)
- [ ] Review profit factor (target: ≥1.5)
- [ ] Check expectancy (must be positive)
- [ ] Verify sample size (target: ≥30 trades)
- [ ] Check max drawdown (target: <10%)
- [ ] Calculate overall score (need: ≥3.5/5)

### Decision Point ⚠️
- [ ] **PASS**: Strategy shows statistical edge → Proceed to Phase 2
- [ ] **FAIL**: No statistical edge → Iterate on strategy (see below)

### If Failed (Iterate)
- [ ] Adjust opening range duration (try 5, 10, 20 minutes)
- [ ] Modify stop loss % (try 0.5%, 1.5%, 2%)
- [ ] Modify target % (try 1%, 1.5%, 2.5%, 3%)
- [ ] Test with/without trailing stop
- [ ] Try different date ranges
- [ ] Test one instrument at a time
- [ ] Add filters (future enhancement)
- [ ] Re-run backtest
- [ ] Repeat until strategy shows edge

---

## Phase 2: Sandbox Bot (AFTER Phase 1 passes) ✅ COMPLETE

### Prerequisites
- [x] Phase 1 backtest shows statistical edge
- [x] Understand all safety features
- [ ] Have Telegram/Discord ready for alerts (optional, deferred)

### Implementation Tasks
- [x] Implement WebSocket client for live data
- [x] Implement candle builder (tick-to-OHLC)
- [x] Implement instrument master manager
- [x] Implement option chain fetcher
- [x] Implement session manager
- [x] Implement position tracker
- [x] Implement cost calculator (CRITICAL)
- [x] Implement trade journal
- [x] Implement live risk manager
- [x] Implement bot engine (main orchestrator)
- [x] Implement main bot runner

### Safety Features
- [x] Circuit breaker (-2% daily loss limit)
- [x] Kill switch (file-based emergency stop)
- [x] Pre-trade risk checks
- [x] Position sizing (2% risk per trade)
- [x] Daily loss tracking
- [x] Max trades per day enforcement
- [x] Hard exit at 3:15 PM
- [x] Graceful shutdown (Ctrl+C)

### Testing (CURRENT)
- [ ] Install dependencies: `npm install csv-parse` ✅ DONE
- [ ] Integration testing of all components
- [ ] Test WebSocket connection with live market
- [ ] Test opening range calculation with live data
- [ ] Test entry signal detection
- [ ] Test position tracking and P&L updates
- [ ] Test cost calculation accuracy
- [ ] Test trade journal CSV/JSON exports
- [ ] Test circuit breaker triggers
- [ ] Test kill switch functionality

### Paper Trading (30-60 Days)
- [ ] Run bot during market hours for 30+ days
- [ ] Collect minimum 60 trades
- [ ] Monitor daily via logs and CSV
- [ ] Generate weekly summaries
- [ ] Track raw vs cost-adjusted P&L
- [ ] Compare actual vs backtest performance
- [ ] Document any discrepancies

### Decision Point ⚠️
After 30-60 days:
- [ ] Calculate cost-adjusted profit factor
- [ ] **PASS** (PF > 1.2): Edge survives costs → Consider live trading
- [ ] **MARGINAL** (PF 1.0-1.2): Thin edge → Deep analysis needed
- [ ] **FAIL** (PF < 1.0): Strategy doesn't work with real costs → Stop

---

## Phase 3: Alerting & Monitoring (AFTER Phase 2) 🚧

### Alert Setup
- [ ] Create Telegram bot (if using)
- [ ] Get Telegram bot token and chat ID
- [ ] Create Discord webhook (if using)
- [ ] Add credentials to config
- [ ] Implement alert sender module
- [ ] Test alert delivery

### Alert Testing
- [ ] Test trade entry alert
- [ ] Test trade exit alert
- [ ] Test stop loss alert
- [ ] Test target hit alert
- [ ] Test daily loss limit alert
- [ ] Test circuit breaker alert
- [ ] Test kill switch alert
- [ ] Test error alerts

### Monitoring Dashboard (Optional)
- [ ] Design dashboard UI
- [ ] Implement backend API
- [ ] Show real-time P&L
- [ ] Show active positions
- [ ] Show daily trades
- [ ] Show risk metrics
- [ ] Add kill switch button

---

## Pre-Live Checklist (FUTURE) ⚠️

**DO NOT PROCEED TO LIVE TRADING WITHOUT**:

- [ ] ✅ Phase 1: Proven backtest results
- [ ] ✅ Phase 2: 2+ weeks successful sandbox trading
- [ ] ✅ Phase 3: Alerts working reliably
- [ ] 🚧 Static IP setup (required for live trading)
- [ ] 🚧 Live API credentials (separate from sandbox)
- [ ] 🚧 Funding of trading account
- [ ] 🚧 Understanding of tax implications
- [ ] 🚧 Risk disclosure acknowledgment
- [ ] 🚧 Mental preparation for real money
- [ ] 🚧 Support plan (who to call if issues)
- [ ] 🚧 Rollback plan (how to stop if needed)

---

## Maintenance Checklist (Ongoing)

### Daily
- [ ] Check bot started successfully
- [ ] Monitor alerts for trades/issues
- [ ] Review daily P&L
- [ ] Check for errors in logs

### Weekly
- [ ] Review weekly performance
- [ ] Compare to backtest expectations
- [ ] Check for any API changes
- [ ] Refresh access token if needed
- [ ] Review strategy parameters

### Monthly
- [ ] Generate monthly report
- [ ] Analyze trade patterns
- [ ] Check for seasonal effects
- [ ] Update instrument master
- [ ] Archive old logs
- [ ] Review and optimize parameters

### Quarterly
- [ ] Run new backtest with latest data
- [ ] Compare live vs backtest performance
- [ ] Assess if strategy still has edge
- [ ] Update strategy if needed
- [ ] Review risk parameters

---

## Emergency Procedures

### If Bot Misbehaves
1. [ ] Activate kill switch immediately
2. [ ] Check open positions
3. [ ] Manually close positions if needed
4. [ ] Review logs for errors
5. [ ] Fix issue before restarting

### If Unexpected Loss
1. [ ] Stop trading (kill switch)
2. [ ] Review all trades for the day
3. [ ] Check if circuit breaker triggered
4. [ ] Analyze what went wrong
5. [ ] Verify strategy logic
6. [ ] Re-run backtest to confirm edge
7. [ ] Only resume after root cause found

### If API Issues
1. [ ] Check Upstox status page
2. [ ] Verify access token validity
3. [ ] Check network connectivity
4. [ ] Review API rate limits
5. [ ] Contact Upstox support if needed

---

## Current Status

**Phase**: Phase 2 - Sandbox Bot Implementation  
**Status**: ✅ BUILD COMPLETE - Ready for Testing  
**Next Step**: Run `npm run live` during market hours  
**Timeline**: 30-60 days validation phase starting now

**Key Files**:
- `PHASE2_BUILD_COMPLETE.md` - Complete build summary
- `PHASE2_QUICKSTART.md` - How to run the bot
- `PHASE2_STATUS.md` - Detailed status tracker
- Run command: `npm run live`

---

## Notes

- Keep this checklist updated as you progress
- Mark items complete only after thorough testing
- Document any deviations or issues encountered
- Never skip safety checks
- When in doubt, stop and review

## Support Resources

- **Upstox API**: https://upstox.com/developer/api-documentation
- **Project Docs**: See README.md, SETUP.md, ARCHITECTURE.md
- **Logs**: Check `logs/` folder for detailed information
