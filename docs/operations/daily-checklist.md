# Tomorrow Morning Checklist - August 5, 2026
**PHASE 2 VALIDATION DAY 1**

---

## ⏰ TIMELINE

### 9:05 AM - CRITICAL PRE-LAUNCH VERIFICATION

**BEFORE STARTING THE BOT FOR REAL:**

1. **Generate Fresh Access Token:**
   - Go to Upstox API console
   - Generate new production access token
   - Update `config/config.json` with new token
   - **DON'T SKIP THIS** - Token expires daily

2. **Kill Switch Final Test (Post-Dashboard Changes):**
   
   **Why this test is critical:**
   - Kill switch has had 3 distinct failure modes in 3 days
   - Saturday: Stale process interference
   - Today (early): Missing process.exit() call
   - Today (late): Fixed, but MORE code changed after fix (dashboard, state exporter)
   - Pattern suggests fragility - one more test before live day is mandatory
   
   **Test procedure:**
   ```bash
   # Start bot
   npm run live
   
   # Wait 30 seconds for full initialization
   # (WebSocket connected, candles building)
   
   # Create kill switch file
   echo "KILL SWITCH TEST" > .kill-switch
   
   # Start timer - should stop within 10 seconds
   # Watch terminal for:
   # - "🛑 Kill switch detected"
   # - "Bot engine stopped"
   # - "Process exiting due to kill switch"
   # - Process actually terminates (terminal returns to prompt)
   ```
   
   **Expected result:**
   - Detection: < 5 seconds
   - Termination: < 10 seconds total
   - Process exits cleanly (no hanging)
   
   **If test FAILS:**
   - DO NOT PROCEED to live trading
   - Check logs for errors
   - Verify kill switch handler code hasn't been affected by recent changes
   - Fix and re-test
   
   **If test PASSES:**
   - Remove kill switch file: `rm .kill-switch` (or `del .kill-switch` on Windows)
   - Proceed to 9:10 AM bot startup
   
   **This is NOT optional** - 3 failures in 3 days = fragile mechanism that needs verification after any code changes

### 9:10 AM - Pre-Market Setup (5 minutes before open)

1. **Start the bot:**
   ```bash
   npm run live
   ```
   - Wait for "✅ Bot is now live and monitoring market"
   - Verify no errors in startup logs

2. **Start the dashboard:**
   ```bash
   node dashboard/server.js
   ```
   - Wait for "Dashboard URL: http://localhost:3000"
   - Keep this terminal open

3. **Open dashboard in browser:**
   - Navigate to: `http://localhost:3000`
   - Verify page loads correctly
   - Check status bar shows "Running"

4. **Verify connections:**
   - Look for 🟢 green indicator (WebSocket connected)
   - Check "Last tick" is updating
   - Verify spot price is showing

### 9:15 AM - Market Opens / OR Window Starts

**What to watch:**
- Bot state should be "CALCULATING_OR"
- Spot price updates every 5 seconds
- Chart builds minute by minute
- Each candle takes 1 minute to form

**What NOT to expect:**
- No trades during this window
- Bot is capturing data, not trading yet

### 9:30 AM - Opening Range Calculation

**What should happen:**
- Bot calculates OR High and OR Low from 15 candles
- Bot state transitions to "MONITORING"
- Opening Range display appears on dashboard
- Green and red dashed lines appear on chart (OR High/Low)
- Golden Ratio levels calculated
- Purple and orange dashed lines appear on chart (CALL/PUT entry)

**Verify on dashboard:**
- OR High value shown
- OR Low value shown
- OR Range value shown
- GR CALL Entry value shown
- GR PUT Entry value shown
- All values should be reasonable (within ±500 points of spot)

### 9:30 AM - 3:30 PM - Monitoring Phase

**Watch the dashboard:**
- Price updates every 5 seconds
- Chart shows rolling 60-minute window
- Price movement relative to GR levels visible

**If price approaches GR CALL level (above OR High):**
- Watch closely as price nears purple dashed line
- If breakout occurs: Trade should trigger
- Current Position panel will appear
- Entry price, live P&L shown

**If price approaches GR PUT level (below OR Low):**
- Watch closely as price nears orange dashed line
- If breakout occurs: Trade should trigger
- Current Position panel will appear
- Entry price, live P&L shown

**If no breakout occurs:**
- That's NORMAL (25-30% win rate = 70-75% no-trade days)
- Bot stays in MONITORING state all day
- No positions opened
- This is correct behavior

**If a trade opens:**
- Take screenshot of dashboard showing entry
- Note entry time and price
- Monitor live P&L (updates every 5 seconds)
- **Watch for dashboard bugs** - Position panel, P&L display, etc. have NOT been tested with real trades
- If P&L shows wrong values or position panel breaks: Note the bug, but trust the trade journal logs as source of truth
- Watch for stop-loss (red line) or target hit
- Take screenshot of exit

### 3:30 PM - Market Close

**Actions:**
1. Let bot run until 3:30 PM
2. Take final screenshot of dashboard
3. Check trade journal if any trades: `logs/trades/`
4. Export CSV if needed: Click "📥 Export to CSV" button
5. Review `logs/main_2026-08-05.log` for any errors

**Don't stop yet:**
- Bot will transition to POST_MARKET
- Let it run for 5-10 more minutes
- This ensures all data is written

### 3:40 PM - Shutdown

**Stop bot:**
- Press Ctrl+C in bot terminal
- Or use kill switch button on dashboard

**Stop dashboard:**
- Press Ctrl+C in dashboard server terminal

**Document the day:**
- Did OR get captured? (Yes/No)
- Were GR levels calculated? (Yes/No)
- Did any trade occur? (Yes/No)
- If yes: Entry, exit, reason, P&L?
- Any errors or issues?

---

## ✅ SUCCESS CRITERIA FOR DAY 1

### Must Have:
- ✅ Bot starts cleanly at 9:10 AM
- ✅ WebSocket connects (🟢 green indicator)
- ✅ Opening range captured (9:15-9:30 AM, 15 candles)
- ✅ Golden Ratio levels calculated at 9:30 AM
- ✅ Bot runs until 3:30 PM without crash
- ✅ Dashboard shows real-time data throughout day

### Nice to Have (but not required):
- ⚪ Trade signal triggers
- ⚪ Position opens and closes
- ⚪ Trade logged to journal

**Remember:** Most days will NOT have trades (70-75% of days). That's normal for this strategy.

---

## 🚨 IF SOMETHING GOES WRONG

### WebSocket Shows 🟡 (REST API Fallback)
**Issue:** WebSocket disconnected  
**Impact:** Data still works, just slower updates  
**Action:** Check logs for disconnect reason, may auto-reconnect  
**Severity:** Low (data still flowing)

### Bot Shows "Stopped" Status
**Issue:** Bot crashed or was stopped  
**Impact:** No monitoring, no trades  
**Action:** Check logs for error, restart bot  
**Severity:** High (need to restart)

### Dashboard Not Updating
**Issue:** Dashboard server stopped or bot state not exporting  
**Impact:** Can't see real-time data  
**Action:** Refresh browser, check dashboard server terminal, check bot state file exists  
**Severity:** Medium (bot still works, just can't see it)

### Opening Range Not Calculated at 9:30
**Issue:** Not enough candles or calculation error  
**Impact:** No trades possible today  
**Action:** Check logs for error, verify 15 candles exist  
**Severity:** High (invalidates trading day)

### Dashboard Shows Position But Data Looks Wrong
**Issue:** P&L incorrect, prices don't match, panel glitches  
**Root Cause:** Dashboard only tested with flat, no-trade data today  
**Impact:** Visual bug, doesn't affect actual trading  
**Action:** Trust trade journal logs (`logs/trades/`) as source of truth, note dashboard bug for later fix  
**Severity:** Low (cosmetic issue)

### Kill Switch Doesn't Respond Within 10 Seconds
**Issue:** Kill switch fragile - 3rd failure mode  
**Impact:** Can't stop bot in emergency  
**Action:** Check if `.kill-switch` file was created, check logs, may need manual process kill  
**Severity:** CRITICAL (this is why we test at 9:05 AM)

---

## 📊 WHAT TO LOOK FOR

### Healthy System:
- ✅ Green WebSocket indicator
- ✅ Spot price updating every 5 seconds
- ✅ Last tick time within last 10 seconds
- ✅ Chart shows smooth price movement
- ✅ No errors in logs
- ✅ Bot Status = "Running"
- ✅ State changes at correct times (PRE_MARKET → MARKET_OPEN → CALCULATING_OR → MONITORING)

### Potential Issues:
- ❌ Yellow/Red WebSocket indicator for >5 minutes
- ❌ Spot price not updating
- ❌ Last tick time > 1 minute ago
- ❌ Chart frozen
- ❌ Errors in logs
- ❌ Bot Status = "Stopped" unexpectedly

---

## 📸 SCREENSHOTS TO CAPTURE

**Recommended screenshots for documentation:**

1. **9:10 AM:** Dashboard showing pre-market status
2. **9:15 AM:** Dashboard at market open, CALCULATING_OR state
3. **9:30 AM:** Dashboard with OR levels displayed
4. **Midday:** Dashboard showing chart with all levels plotted
5. **If trade opens:** Current Position panel showing entry
6. **If trade closes:** Final P&L after exit
7. **3:30 PM:** End-of-day summary

---

## 📝 NOTES TO RECORD

**Keep a simple log throughout the day:**

```
9:10 AM - Bot started ✅
9:15 AM - Market open, CALCULATING_OR ✅
9:30 AM - OR calculated: High=24,650, Low=24,520 ✅
9:30 AM - GR levels: CALL=24,720, PUT=24,450 ✅
10:45 AM - Price approaching CALL level (24,710)
11:00 AM - Breakout! Trade opened: CALL entry at 24,725
11:15 AM - Trade running, P&L: +₹450
11:45 AM - Target hit, exit at 24,800, Final P&L: +₹1,250
3:30 PM - Market close, 1 trade executed today ✅
```

Or if no trades:
```
9:10 AM - Bot started ✅
9:15 AM - Market open, CALCULATING_OR ✅
9:30 AM - OR calculated: High=24,650, Low=24,520 ✅
9:30 AM - GR levels: CALL=24,720, PUT=24,450 ✅
3:30 PM - Market close, no breakouts, 0 trades (normal) ✅
```

---

## 🎯 REMEMBER

### This is Day 1 of 30-60 Days
- **Don't expect a trade** - Only ~25-30% of days have trades
- **Don't worry if nothing happens** - That's more likely than a trade
- **Focus on system health** - The goal today is stability, not profits

### The Real Goal for Tomorrow
1. **Prove the system works end-to-end**
2. **Capture clean opening range data**
3. **Run without crashes for full day**
4. **Dashboard provides visibility**

If all four happen, Day 1 is a success, trade or no trade.

### Phase 2 is a Marathon, Not a Sprint
- Need 30-60 trading days minimum
- Need 20-40 actual trades for statistics
- At 25% win rate, that's 80-160 trading days
- Patience is key

---

## ⚡ QUICK REFERENCE

**Bot start:** `npm run live`  
**Dashboard start:** `node dashboard/server.js`  
**Dashboard URL:** http://localhost:3000  
**Kill switch:** Button on dashboard or create `.kill-switch` file  
**Logs:** `logs/main_2026-08-05.log`  
**Trades:** `logs/trades/`  
**State:** `data/bot_state.json`

**Key Times:**
- 9:10 AM - Start everything
- 9:15 AM - Market opens, OR capture starts
- 9:30 AM - OR complete, GR calculated, monitoring starts
- 3:30 PM - Market closes
- 3:40 PM - Shutdown

**Dashboard Indicators:**
- 🟢 Green = WebSocket connected, live data
- 🟡 Yellow = REST API fallback, slower updates
- 🔴 Red = Disconnected, no data

---

**Good luck tomorrow! 🚀**

**The system is ready. You're ready. Let's validate this strategy.**
