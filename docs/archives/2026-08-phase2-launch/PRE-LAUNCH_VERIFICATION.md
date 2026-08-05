# PRE-LAUNCH VERIFICATION REPORT
## Phase 2 Sandbox Bot - Weekend Verification

**Date**: Saturday, July 31, 2026  
**Market Status**: Closed (Weekend)  
**Verification Scope**: Full pre-launch check before Monday live test  

---

## EXECUTIVE SUMMARY

**OVERALL STATUS**: ⚠️ **NO-GO FOR MONDAY**

**Critical Issues Found**: 1  
**Major Issues**: 0  
**Minor Issues**: 3  

**CRITICAL BLOCKER**: Kill switch does NOT reliably stop the bot when activated. This is a safety failure that must be resolved before any live trading.

---

## DETAILED VERIFICATION RESULTS

### 1. CREDENTIALS & AUTHENTICATION - ⚠️ PARTIAL PASS

**Status**: Functional but needs improvement

**Token Status:**
- ✅ Current access token is VALID
- ✅ Expires: August 29, 2026 22:00:00 (29 days remaining)
- ✅ Sufficient for Monday testing

**X-Algo-Name Header:**
- ✅ **PASS**: Correctly implemented
- ✅ Value: `'ORB-Strategy-v1'`
- ✅ Applied to all order operations (place, modify, cancel)
- ✅ Implementation in `src/data/upstox-client.js:17-24`

**Sandbox Configuration:**
- ✅ `useSandbox: true` correctly configured
- ✅ Sandbox URL: `https://api-hft.upstox.com`
- ✅ Production historical data URL: `https://api.upstox.com` (read-only, safe)

**Issues Found:**
1. ⚠️ **NO TOKEN REFRESH MECHANISM** (Minor)
   - Current: Manual token generation required
   - Impact: Will need manual token refresh Monday morning
   - Recommendation: Add token expiry warning to session manager

2. ⚠️ **NO TOKEN EXPIRY CHECK** (Minor)
   - Bot won't warn when token approaches expiration
   - Could cause silent failures during longer runs
   - Recommendation: Add startup check for token validity

**Recommendations:**
- Add token expiry check on bot startup
- Log warning if token expires in < 7 days
- Document token refresh process for Monday morning

---

### 2. WEBSOCKET CONNECTION - ✅ PASS

**Status**: Fully functional in mock mode

**Mock Mode Testing:**
- ✅ Successfully handles WebSocket in mock mode
- ✅ Market closed gracefully handled (no crashes)
- ✅ Bot continues running without market data
- ✅ No unhandled exceptions observed

**Auto-Reconnection Logic:**
- ✅ Implemented and configured
- ✅ Max attempts: 10
- ✅ Backoff strategy: Exponential (delay × attempt number)
- ✅ Resubscribes to all instruments after reconnection
- ✅ Heartbeat mechanism: 30-second ping

**Error Handling:**
- ✅ Error events properly emitted
- ✅ Comprehensive logging
- ✅ Graceful degradation

**Mock Data Generation:**
- ✅ Currently enabled: `websocket.useMock: true`
- ✅ Tick frequency: 1 per second
- ✅ Realistic price movement: 0.05% volatility
- ✅ Includes: LTP, bid/ask spread, volume, OHLC

**Production WebSocket:**
- ⚠️ **UNABLE TO TEST** - Requires:
  1. Disabling mock mode (`useMock: false`)
  2. Market hours or pre-market session
  3. Valid production WebSocket token

- ⚠️ **NOTE**: Binary protobuf parsing is simplified
  - Current implementation: Basic parsing stub
  - Production: Needs proper Upstox protobuf schema
  - File: `src/data/websocket-client.js:185-208`

**Recommendations:**
- ✅ Mock mode sufficient for weekend testing
- Test production WebSocket Monday 8:30 AM (pre-market)
- Monitor first 5 minutes of market hours for WebSocket stability
- Implement proper protobuf parser before production use

---

### 3. KILL SWITCH - ❌ CRITICAL FAILURE

**Status**: **DOES NOT WORK RELIABLY**

**⚠️ THIS IS A SAFETY-CRITICAL FAILURE - NO-GO FOR MONDAY**

**Kill Switch Mechanisms Found:**

1. **File-Based Kill Switch**
   - Location: `.kill-switch` file in project root
   - Monitoring: Every 5 seconds by bot engine
   - File: `src/bot/bot-engine.js:143-154`

2. **Dashboard API**
   - Endpoint: `POST /api/kill-switch`
   - Action: Creates `.kill-switch` file
   - File: `dashboard/server.js:183-198`

3. **Programmatic**
   - Method: `riskManager.activateKillSwitch()`
   - File: `src/risk/live-risk-manager.js:260-278`

**Test Results:**

**Test 1: Manual File Creation**
```
Created: .kill-switch file
Waited: 6+ seconds (enough for 1+ check cycles)
Result: ❌ Bot CONTINUED RUNNING
Evidence: No kill switch detection in logs
```

**Test 2: Risk Manager Logic**
```
Verified: checkTradeAllowed() blocks trades when killSwitch = true
Result: ✅ Logic is correct
```

**Test 3: Bot Engine Monitoring**
```
Verified: startKillSwitchMonitoring() called in bot start()
Interval: 5 seconds
Result: ⚠️ Monitoring code exists but NOT executing
```

**Root Cause Analysis:**

Possible issues:
1. Bot restart after our fixes may not have completed properly
2. Kill switch monitoring interval may not be starting
3. Async/await issue in the check function
4. File access timing issue

**What Works:**
- ✅ Kill switch file creation
- ✅ Risk manager blocks trades when activated
- ✅ Logging is comprehensive

**What Doesn't Work:**
- ❌ Bot does NOT detect kill switch file
- ❌ Bot does NOT stop when kill switch activated
- ❌ No kill switch events in logs

**CRITICAL RECOMMENDATION:**

**🛑 DO NOT RUN BOT ON MONDAY UNTIL KILL SWITCH IS VERIFIED WORKING**

**Required Actions:**
1. Restart bot completely (full stop + restart)
2. Test kill switch file detection immediately
3. Verify bot stops within 10 seconds of file creation
4. Test dashboard kill switch button
5. Add explicit logging to kill switch check function
6. Consider adding manual kill switch verification to startup

**Alternative Emergency Procedures:**
Until kill switch is verified:
1. Keep bot terminal visible and accessible
2. Use Ctrl+C for emergency stop
3. Monitor dashboard closely
4. Have order cancellation script ready

---

### 4. CIRCUIT BREAKER (DAILY LOSS LIMIT) - ✅ PASS

**Status**: Fully functional and tested

**Configuration:**
- Capital: ₹100,000
- Daily Loss Limit: 2.00% (₹2,000)
- Implementation: `src/risk/live-risk-manager.js:51-86`

**Test Scenario:**
```
Trade 1: -₹500 (Total: -₹500, -0.50%) → ✅ ALLOWED
Trade 2: -₹800 (Total: -₹1,300, -1.30%) → ✅ ALLOWED
Trade 3: -₹800 (Total: -₹2,100, -2.10%) → 🚨 CIRCUIT BREAKER TRIGGERED
Trade 4: Attempt → ❌ BLOCKED (Circuit breaker active)
```

**Test Results:**
- ✅ Triggers at correct threshold (-2.00%)
- ✅ All subsequent trades BLOCKED
- ✅ Clear, loud logging with emoji alerts
- ✅ Emits events for external monitoring
- ✅ Cannot be bypassed without manual reset

**Logging Output:**
```
🚨 CIRCUIT BREAKER TRIGGERED
   Daily P&L: Rs-2100.00
   Limit: Rs-2000.00
```

**Reset Mechanism:**
- Manual: `riskManager.resetDaily()` at start of new day
- Automatic: Called by SessionManager at 9:00 AM

**Edge Cases Tested:**
- ✅ Exactly at limit (-2.00%)
- ✅ Just over limit (-2.01%)
- ✅ Multiple attempts after trigger

**PASS CRITERIA MET:**
- ✅ Enforced in code (not just warning)
- ✅ Clearly and loudly logged
- ✅ Cannot be bypassed

---

### 5. INSTRUMENT & STRIKE SELECTION - ⚠️ UNABLE TO TEST (Markets Closed)

**Status**: Code review only - live testing needed Monday

**Implementation Files:**
- `src/data/instrument-master.js`
- `src/data/option-chain.js`

**Mock Instrument Data:**
- ✅ 84 mock instruments cached
- ✅ NIFTY options: Strikes 21,500 - 22,500 (step: 50)
- ✅ BANKNIFTY options: Strikes 46,000 - 48,000 (step: 100)
- ✅ Expiry: August 7, 2026 (current weekly)

**Unable to Test (Markets Closed):**
- ❌ Real option chain data retrieval
- ❌ ATM/OTM strike identification
- ❌ Expiry date logic with live data
- ❌ Strike selection algorithm

**Code Review Results:**
- ✅ InstrumentMaster has ATM calculation logic
- ✅ OptionChain fetcher implemented
- ✅ Fallback to mock data works

**Monday Testing Required:**
- Test during pre-market (8:30-9:15 AM)
- Verify option chain API works
- Confirm correct weekly expiry selection
- Validate ATM strike identification

---

### 6. LOGGING & TRADE JOURNAL - ⚠️ PARTIAL TEST

**Status**: File structure working, trade data needs Monday

**Current Logs:**
- ✅ Main log: `logs/main_2026-07-31.log` (updating)
- ✅ Trade log: `logs/trades_2026-07-31.log` (empty - no trades yet)
- ✅ Trade journal directory: `logs/trades/` (created)

**Log Format:**
- ✅ JSON format for parsing
- ✅ Human-readable timestamps
- ✅ Structured data with context
- ✅ Log levels: info, warn, error, debug, trade, audit

**Sample Log Entry:**
```json
{
  "timestamp": "2026-07-31 16:24:01.487",
  "level": "info",
  "message": "Bot is now live and monitoring market",
  "state": "PRE_MARKET",
  "isRunning": true
}
```

**Trade Journal Schema:**
Expected fields (not yet generated):
- Entry/exit times and prices
- Raw P&L
- Cost breakdown (brokerage, STT, exchange, GST, stamp duty)
- Cost-adjusted P&L
- Exit reason (stop-loss/target/time-exit)

**Monday Verification Needed:**
- Confirm trade journal creates entries
- Verify all cost fields populate correctly
- Check CSV export functionality
- Validate dashboard can read trade data

---

### 7. CONFIGURATION REVIEW - ✅ PASS

**Current Configuration** (`config/config.json`):

| Parameter | Current Value | Expected | Status |
|-----------|---------------|----------|--------|
| **Stop-loss %** | 0.5% | ✅ Correct | PASS |
| **Target %** | 2.0% | ✅ Correct | PASS |
| **Daily loss limit %** | 2% | ✅ Correct | PASS |
| **Max trades per day** | 2 | ✅ Correct | PASS |
| **Hard exit time** | 15:15 (3:15 PM) | ✅ Correct | PASS |
| **Position sizing** | 2% risk per trade | ✅ Correct | PASS |
| **Strategy** | Golden Ratio + ORB | ✅ Correct | PASS |
| **Capital** | ₹100,000 | ✅ Correct | PASS |
| **Opening range duration** | 15 minutes | ✅ Correct | PASS |
| **Last entry time** | 14:45 (2:45 PM) | ✅ Correct | PASS |

**Additional Settings:**
- ✅ `useSandbox: true` - Correct for testing
- ✅ `websocket.useMock: true` - Correct for weekend
- ✅ Golden Ratio enabled with 0.618 Fibonacci level
- ✅ Trailing stop: enabled (0.5%)

**No leftover test values found**

---

### 8. SESSION & HOLIDAY MANAGER - ✅ PASS

**Status**: Correctly recognizes non-trading days

**Current Recognition:**
- ✅ Today (Saturday, July 31) recognized as non-trading day
- ✅ Bot state: PRE_MARKET
- ✅ isMarketHours: false
- ✅ Next market open: Monday, August 3, 2026 at 9:15 AM

**Holiday Calendar:**
- ✅ 2026 NSE holidays loaded: 21 holidays
- ✅ Sample holidays confirmed:
  - January 26 (Republic Day)
  - March 1 (Mahashivratri)
  - March 14 (Holi)

**Session States Implemented:**
- PRE_MARKET (before 9:15 AM)
- OPENING_RANGE (9:15-9:30 AM)
- TRADING (9:30 AM - 3:15 PM)
- HARD_EXIT (3:15-3:30 PM)
- POST_MARKET (after 3:30 PM)

**Current Bot Behavior:**
- ✅ Would NOT attempt to trade if run on Saturday
- ✅ Waiting for next trading day (Monday)
- ✅ Countdown showing: 3,888 minutes until market open

**Monday Testing Required:**
- Verify state transitions at each time boundary
- Confirm opening range calculation (9:15-9:30 AM)
- Test hard exit at 3:15 PM

---

### 9. COST CALCULATOR VERIFICATION - ⚠️ NEEDS VALIDATION

**Status**: Implemented but needs real-world validation

**Current Cost Structure** (`src/bot/cost-calculator.js`):

| Cost Component | Rate | Source |
|----------------|------|--------|
| Brokerage (flat) | ₹20 per order | Standard broker rate |
| Brokerage (%) | 0.05% | Standard rate |
| STT | 0.0625% | Government rate (options sell-side) |
| Exchange charges | 0.053% | NSE standard |
| SEBI charges | 0.00001% | Regulatory |
| GST | 18% on brokerage | Government rate |
| Stamp duty | 0.003% | Government rate |

**⚠️ CRITICAL VALIDATION NEEDED:**

**Action Required**: Cross-check against Upstox's **current** F&O options charges

**Upstox Resources to Check:**
1. https://upstox.com/pricing/
2. https://upstox.com/charges-and-fees/
3. Customer support for exact F&O option charges

**Potential Discrepancies:**
- Brokerage: May be different for options vs futures
- STT: Verify 0.0625% is correct for options (sell-side only)
- Exchange charges: May vary by segment
- Flat fee: Verify ₹20 per order is current

**Test Calculation:**
```
Example Trade: Buy 100 qty @ ₹500, Sell @ ₹510
Raw P&L: ₹1,000
Expected Costs: ~₹50-100 (5-10%)
```

**Monday Verification:**
- Compare first real trade costs with Upstox invoice
- Adjust calculator if discrepancies found
- Document actual cost % for dashboard

**RECOMMENDATION**: Manually verify costs after first trade on Monday

---

### 10. FINAL SUMMARY - ⚠️ NO-GO FOR MONDAY

**Pass/Fail Table:**

| # | Check Item | Status | Critical? |
|---|------------|--------|-----------|
| 1 | Credentials & Authentication | ⚠️ PARTIAL | No |
| 2 | WebSocket Connection | ✅ PASS | No |
| 3 | **Kill Switch** | ❌ **FAIL** | **YES** |
| 4 | Circuit Breaker | ✅ PASS | Yes |
| 5 | Instrument & Strike Selection | ⚠️ UNABLE TO TEST | No |
| 6 | Logging & Trade Journal | ⚠️ PARTIAL | No |
| 7 | Configuration Review | ✅ PASS | No |
| 8 | Session & Holiday Manager | ✅ PASS | No |
| 9 | Cost Calculator Verification | ⚠️ NEEDS VALIDATION | No |
| 10 | Overall Status | ❌ **NO-GO** | **YES** |

**ISSUES SUMMARY:**

**CRITICAL (Must Fix Before Monday):**
1. ❌ **Kill Switch Does NOT Work**
   - Bot does not stop when kill switch activated
   - Safety-critical failure
   - BLOCKS Monday launch

**MAJOR (Should Fix Before Monday):**
- None

**MINOR (Can Fix During Monday Testing):**
1. ⚠️ No token expiry warning
2. ⚠️ Cost calculator needs real-world validation
3. ⚠️ WebSocket protobuf parsing is simplified

**UNABLE TO TEST (Weekend/Markets Closed):**
1. Real option chain data
2. Production WebSocket connection
3. Trade journal with actual trades
4. Strike selection with live prices

---

## EXPLICIT GO/NO-GO RECOMMENDATION

### 🛑 **NO-GO FOR MONDAY MORNING**

**Primary Reason**: Kill switch failure is a safety-critical issue

**Required Before Launch:**

**MUST COMPLETE:**
1. ✅ Fix and verify kill switch works reliably
2. ✅ Test kill switch with fresh bot restart
3. ✅ Verify kill switch stops bot within 10 seconds
4. ✅ Test dashboard kill switch button end-to-end

**SHOULD COMPLETE:**
1. Add token expiry check on startup
2. Verify cost calculator against Upstox's published rates
3. Document emergency procedures (Ctrl+C, manual order cancellation)

**CAN DEFER TO MONDAY TESTING:**
1. Production WebSocket test (8:30 AM pre-market)
2. Real option chain verification (9:00 AM)
3. Trade journal validation (after first trade)
4. Strike selection with live data

---

## RECOMMENDED TIMELINE

**Sunday (Tomorrow):**
1. Fix kill switch monitoring (highest priority)
2. Restart bot completely
3. Test kill switch 3 times minimum
4. Verify emergency stop procedures
5. Update this document with results

**Monday Pre-Market (8:00-9:15 AM):**
1. Generate fresh access token
2. Disable mock WebSocket (`useMock: false`)
3. Start bot at 8:30 AM
4. Test production WebSocket connection
5. Verify option chain data retrieval
6. Final kill switch test
7. Monitor logs for any errors

**Monday Market Hours (9:15 AM onwards):**
1. Monitor opening range calculation (9:15-9:30 AM)
2. Let bot observe market (no trades first 30 min)
3. Allow first trade after 9:45 AM
4. Verify trade journal and cost tracking
5. Monitor closely through first trade cycle

---

## CONTACT & ESCALATION

**If Critical Issues Found:**
1. STOP the bot immediately (Ctrl+C)
2. Do NOT restart without review
3. Document the issue
4. Review this checklist again

**Emergency Procedures:**
- Kill switch file: Create `.kill-switch` in project root
- Manual stop: Ctrl+C in bot terminal
- Dashboard: Click kill switch button
- Order cancellation: Access Upstox web/app directly

---

**Report Generated**: Saturday, July 31, 2026  
**Next Review**: After kill switch fix (Sunday evening)  
**Final Go/No-Go**: Monday 8:00 AM

---

