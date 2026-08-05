# Dashboard Quick Start Guide

**Get the monitoring dashboard running in 3 steps**

---

## Step 1: Start the Bot (Terminal 1)

```bash
npm run live
```

Wait for:
```
✅ All components initialized successfully
🤖 Bot is now live and monitoring market
```

---

## Step 2: Start Dashboard Server (Terminal 2)

Open a **new terminal** (keep bot running) and run:

```bash
npm run dashboard
```

You'll see:
```
📊 Dashboard Server Started
Dashboard URL: http://localhost:3000
⚠️ Read-only dashboard - Does not control bot behavior
```

---

## Step 3: Open Dashboard in Browser

Open your browser and go to:
```
http://localhost:3000
```

You should see the dashboard with:
- ✅ Bot status
- ✅ Market session info
- ✅ Performance metrics
- ✅ Trade log (empty until first trade)

---

## What You'll See

### Before Market Open (< 9:15 AM)
- Bot Status: 🟢 Running
- Market Session: PRE_MARKET
- Next Event: MARKET_OPEN in Xm
- No current position
- No trades yet

### During Opening Range (9:15-9:30 AM)
- Market Session: CALCULATING_OR
- Next Event: OR_COMPLETE in Xm
- Bot is calculating opening range
- Still no trades yet

### After 9:30 AM (Monitoring)
- Market Session: MONITORING
- Bot watching for breakout signals
- If signal detected:
  - Current Position panel appears
  - Real-time P&L updates
  - Entry shown in Trade Log when closed

### After Market Close (3:30 PM)
- Market Session: MARKET_CLOSED
- All positions closed
- Daily summary generated
- Trade log shows all today's trades

---

## Key Dashboard Features

### Live Status Bar (Top)
- Bot running status
- Current market session
- Countdown to next event
- Last update time

### Current Position (When Open)
- Instrument name
- Entry price
- Current price
- Real-time P&L (color-coded)
- Time held

### Risk & Safety
- Daily loss progress bar
- Trades count (0/2)
- Circuit breaker status
- 🛑 Emergency kill switch

### Performance Summary
- Total trades
- Win rate (raw vs adjusted)
- Profit factor (raw vs adjusted)
- Total P&L
- Equity curve chart

### Cost Analysis - **PHASE 2 FOCUS**
- Avg cost per trade %
- Total costs
- Trades erased by costs
- **Profit factor indicator**:
  - 🔴 < 1.0 FAIL
  - 🟡 1.0-1.2 MARGINAL
  - 🟢 > 1.2 PASS

### Trade Log
- Complete trade history
- Filter by outcome/reason
- Export to CSV
- Sortable columns

### System Health
- WebSocket connection status
- Last data update
- Candles received today
- Recent errors/warnings

---

## Auto-Refresh

Dashboard automatically refreshes every 30 seconds.

No need to manually reload!

---

## Using Kill Switch

**EMERGENCY STOP**

If you need to stop the bot immediately:

1. Click the red 🛑 KILL SWITCH button
2. Confirm in popup dialog
3. Bot will:
   - Close any open positions
   - Stop taking new trades
   - Exit gracefully

**After using kill switch:**
- Delete `.kill-switch` file before restarting
- Review logs to understand what happened

---

## Monitoring During 30-60 Day Test

### Daily Check (5 minutes)
1. Open dashboard
2. Check bot status: Should be 🟢 Running
3. Review today's trades (if any)
4. Check daily P&L
5. Verify no errors in System Health

### Weekly Review (15 minutes)
1. Check total trades accumulated
2. Review Cost Analysis panel:
   - Avg cost %
   - Trades erased count
   - Profit factor position
3. Export trades to CSV
4. Analyze in Excel

### Monthly Decision (30 minutes)
**After 30+ trades:**
1. Check profit factor indicator
2. If 🟢 PASS: Continue testing
3. If 🟡 MARGINAL: Deep analysis needed
4. If 🔴 FAIL: Strategy doesn't work with costs

---

## Troubleshooting

### Dashboard Won't Load
```bash
# Check if server is running
# You should see dashboard server message
# If not, run: npm run dashboard
```

### No Data Showing
- Verify bot is running: Check Terminal 1
- Wait for bot to start trading (after 9:30 AM)
- Dashboard shows live data only

### Kill Switch Not Working
```bash
# Manually create kill switch file
echo. > .kill-switch

# Bot will detect and stop
```

---

## Two Terminals Required

**Terminal 1: Bot**
```bash
npm run live
# Keep this running
# Do NOT close during market hours
```

**Terminal 2: Dashboard**
```bash
npm run dashboard
# Keep this running
# Close and reopen anytime (won't affect bot)
```

**Browser: Dashboard UI**
```
http://localhost:3000
# Close and reopen anytime
# Won't affect bot
```

---

## What Dashboard Cannot Do

❌ Start/stop the bot (except kill switch)  
❌ Modify strategy parameters  
❌ Place orders  
❌ Change risk limits  
❌ Modify bot logic  

✅ Only READ and DISPLAY data  
✅ Kill switch is only interaction (emergency use)

---

## Tips

1. **Keep dashboard open during market hours** - Easy monitoring
2. **Check System Health regularly** - Catch issues early
3. **Export trades weekly** - Back up your data
4. **Screenshot Cost Analysis** - Track progress over time
5. **Don't obsess over daily results** - 30+ trades needed for assessment

---

## Next Steps

1. ✅ Start bot: `npm run live`
2. ✅ Start dashboard: `npm run dashboard`
3. ✅ Open browser: http://localhost:3000
4. ⏳ Let it run for 30-60 days
5. 📊 Monitor via dashboard
6. 📈 Make decision based on cost-adjusted profit factor

---

**Dashboard URL**: http://localhost:3000  
**Refreshes**: Every 30 seconds  
**Purpose**: Monitor Phase 2 validation - does edge survive costs?  

**Full documentation**: See `DASHBOARD.md` for complete details
