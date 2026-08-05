# Tomorrow Morning - Critical Actions
**Wednesday, August 5, 2026**  
**DO NOT SKIP ANY STEP**

---

## 🚨 9:05 AM - BEFORE ANYTHING ELSE

### Step 1: Fresh Access Token
```
1. Go to Upstox API Console
2. Generate NEW production access token
3. Copy token
4. Open config/config.json
5. Replace upstox.marketData.accessToken with new token
6. Save file
```

**Why:** Token expires every 24 hours. Yesterday's token won't work.

### Step 2: Kill Switch Test
```bash
# Start bot
npm run live

# Wait 30 seconds for full initialization
# Look for: "✅ Bot is now live and monitoring market"

# Create kill switch file
echo "TEST" > .kill-switch

# START TIMER - Must stop within 10 seconds

# Watch for in terminal:
# [ERROR] 🛑 KILL SWITCH ACTIVATED
# [INFO] Bot engine stopped
# [INFO] Process exiting due to kill switch
# Terminal returns to prompt

# STOP TIMER
```

**Expected:** < 10 seconds total  
**Acceptable:** < 10 seconds  
**Failure:** > 10 seconds OR process doesn't exit

### If Test FAILS:
```
1. DO NOT PROCEED with live trading
2. Check logs/main_2026-08-05.log for errors
3. Verify bot-engine.js kill switch code unchanged
4. Fix issue
5. Re-test
6. Only proceed when test passes
```

### If Test PASSES:
```bash
# Remove kill switch file
rm .kill-switch
# (or: del .kill-switch on Windows)

# Proceed to 9:10 AM
```

---

## ⏰ 9:10 AM - Bot Startup

```bash
# Start bot
npm run live

# Start dashboard (separate terminal)
node dashboard/server.js

# Open browser
http://localhost:3000
```

**Verify:**
- 🟢 Green WebSocket indicator
- Spot price updating
- Last tick within last 10 seconds
- Bot status: "Running"
- State: "PRE_MARKET" or "CALCULATING_OR"

---

## ⚠️ WHY THESE STEPS ARE MANDATORY

### Kill Switch Fragility
- Failed Saturday (stale process)
- Passed Sunday-Tuesday morning (4/4 tests)
- Failed Tuesday afternoon (missing process.exit)
- **Pattern:** Works when tested, breaks with code changes
- **Code changed:** Dashboard, state exporter (after last test)
- **Risk:** May be broken again
- **Mitigation:** Test every morning before live trading

### Token Expiration
- Upstox tokens expire after 24 hours
- Bot will fail to connect with expired token
- No trading possible with expired token
- Takes 2 minutes to generate new token

---

## 🚦 GO / NO-GO DECISION

### GO Criteria:
- ✅ Fresh token installed
- ✅ Kill switch test passed (< 10 seconds)
- ✅ Bot starts cleanly
- ✅ WebSocket connected (🟢)
- ✅ Time is before 9:15 AM

### NO-GO Criteria:
- ❌ Kill switch test failed
- ❌ Kill switch test not performed
- ❌ Expired token
- ❌ WebSocket won't connect
- ❌ Time is after 9:15 AM (missed OR window)

**If NO-GO:** Don't trade today. Fix issues. Try again tomorrow.

---

## 📋 QUICK CHECKLIST

```
[ ] 9:05 AM - Fresh token generated and installed
[ ] 9:05 AM - Kill switch test performed
[ ] 9:05 AM - Kill switch test PASSED (< 10 seconds)
[ ] 9:05 AM - Kill switch file removed
[ ] 9:10 AM - Bot started
[ ] 9:10 AM - Dashboard started
[ ] 9:10 AM - Browser opened to dashboard
[ ] 9:10 AM - WebSocket connected (🟢)
[ ] 9:10 AM - Spot price updating
[ ] 9:10 AM - Bot status "Running"
```

**All checkboxes must be checked before 9:15 AM.**

---

## 🆘 EMERGENCY CONTACTS

**If kill switch fails during trading:**
1. Try Ctrl+C in bot terminal
2. If that fails: `taskkill /F /IM node.exe` (Windows)
3. Verify processes: `Get-Process node` (Windows)

**Source of truth for trades:**
- `logs/trades/` directory
- NOT the dashboard (untested with real trades)

---

**This is NOT optional. Follow the checklist. Test the kill switch. Generate fresh token.**

**See TOMORROW_CHECKLIST.md for full detailed guide.**
