# Dashboard - Live Monitoring Interface

**Status**: ✅ Complete - Professional read-only monitoring dashboard  
**Purpose**: Real-time visualization of bot status and trade performance  
**Type**: Read-only - Does NOT control or interact with trading logic

---

## 🎯 Overview

The dashboard provides a professional web interface to monitor the sandbox bot's live status and trade history. It displays all critical metrics in an easy-to-understand format without any ability to interfere with the bot's trading logic.

### Key Features

✅ **Live Status Monitoring** - Bot state, market session, next events  
✅ **Current Position Tracking** - Real-time P&L for open positions  
✅ **Risk & Safety Panel** - Daily loss limit, circuit breaker, kill switch  
✅ **Performance Metrics** - Win rate, profit factor (raw vs cost-adjusted)  
✅ **Equity Curve** - Visual chart of cumulative P&L over time  
✅ **Cost Analysis** - The Phase 2 critical metric: does edge survive costs?  
✅ **Trade Log Table** - Complete history with filtering and CSV export  
✅ **System Health** - WebSocket status, errors/warnings, data updates  
✅ **Auto-Refresh** - Updates every 30 seconds automatically

---

## 🚀 Quick Start

### 1. Install Dependencies

Already installed with main bot dependencies:
```bash
npm install
```

### 2. Start the Bot (Terminal 1)

```bash
npm run live
```

The bot must be running to generate data for the dashboard.

### 3. Start the Dashboard Server (Terminal 2)

```bash
npm run dashboard
```

You'll see:
```
📊 Dashboard Server Started
Dashboard URL: http://localhost:3000
Auto-refreshes every 30 seconds
⚠️ Read-only dashboard - Does not control bot behavior
```

### 4. Open Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📊 Dashboard Sections

### 1. Live Status Bar (Top)

**Bot Status**
- 🟢 Running - Bot is active and monitoring
- 🔴 Stopped - Bot is not running
- ⚪ Offline - Cannot connect to bot

**Market Session**
- PRE_MARKET - Before 9:15 AM
- CALCULATING_OR - Opening range calculation (9:15-9:30 AM)
- MONITORING - Watching for signals
- MARKET_CLOSED - After 3:30 PM
- NOT_TRADING_DAY - Weekend or holiday

**Next Event**
- MARKET_OPEN in Xm - Until market opens
- MARKET_CLOSE in Xm - Until market closes
- OR_COMPLETE in Xm - Until opening range done

**Last Update**
- Timestamp of last data refresh

---

### 2. Current Position Panel

Only visible when a position is open. Shows:

- **Instrument**: e.g., NIFTY26AUGCE25100
- **Direction**: BUY (long) or SELL (short)
- **Entry Price**: Price at which position was opened
- **Current Price**: Real-time option premium
- **P&L**: Current profit/loss (color-coded)
- **Time Held**: Duration since entry

---

### 3. Risk & Safety Panel

**Daily Loss Limit**
- Progress bar showing current daily loss vs -2% limit
- 🟢 Green: Safe zone
- 🟡 Yellow: >50% of limit used
- 🔴 Red: >80% of limit used (danger zone)

**Trades Today**
- Progress bar showing trades vs max (2) limit
- Updates in real-time as trades execute

**Circuit Breaker**
- 🟢 ARMED - Normal operation
- 🔴 TRIGGERED - Bot stopped due to daily loss limit

**Kill Switch Button**
- 🛑 Large red button for emergency stop
- Requires confirmation before activation
- Immediately closes positions and stops bot
- Creates `.kill-switch` file

---

### 4. Performance Summary

**Total Trades**
- Count of all completed trades
- Breakdown: X wins / Y losses

**Win Rate**
- **Raw**: Win rate before costs
- **Cost-Adj**: Win rate after all costs
- Shows how many profitable trades become losses due to costs

**Profit Factor**
- **Raw**: Gross profit / Gross loss (before costs)
- **Cost-Adj**: After all execution costs
- Target: >1.2 for viable strategy

**Total P&L**
- **Raw**: P&L as backtest measured
- **Cost-Adj**: P&L after all costs
- Color-coded: 🟢 Positive, 🔴 Negative

**Equity Curve Chart**
- Line chart showing cumulative P&L over time
- Two lines: Raw (blue) vs Cost-Adjusted (red)
- Visualizes the cost impact on performance

---

### 5. Cost Analysis Panel - **CRITICAL FOR PHASE 2**

This section answers the core Phase 2 question: **Does the strategy edge survive real-world costs?**

**Average Cost per Trade**
- Costs as percentage of raw P&L
- Target: < 30%
- Warning if > 40%

**Total Costs**
- Sum of all execution costs across all trades
- Includes: brokerage, STT, exchange, GST, stamp duty, spreads

**Trades Erased by Costs**
- Count of trades that were profitable (raw) but became losses after costs
- Direct measure of cost impact

**Profit Factor Status Indicator**
- Visual bar with three zones:
  - 🔴 < 1.0 FAIL - Costs erase edge
  - 🟡 1.0-1.2 MARGINAL - Thin edge, risky
  - 🟢 > 1.2 PASS - Edge survives costs
- Black indicator shows current position
- Updates in real-time as trades accumulate

**Verdict Message**
- "Collecting data... X/30 trades minimum" - Need more data
- "✅ PASS - Edge survives costs" - Strategy viable
- "⚠️ MARGINAL - Thin edge" - Risky, needs analysis
- "❌ FAIL - Costs erase edge" - Strategy not viable

---

### 6. Trade Log Table

Complete history of all trades with:

**Columns**
- Date
- Time
- Instrument
- Direction (LONG/SHORT)
- Entry Price
- Exit Price
- Exit Reason (STOP_LOSS, TARGET, HARD_EXIT)
- Duration (in minutes)
- Raw P&L
- Costs
- Adjusted P&L
- Outcome (WIN/LOSS)

**Filters**
- **Outcome Filter**: All / Wins Only / Losses Only
- **Exit Reason Filter**: All / Stop Loss / Target / Hard Exit

**Export**
- 📥 Export to CSV button
- Downloads all trades as CSV file
- Import to Excel for further analysis

**Features**
- Sortable columns (click header)
- Color-coded outcomes (green = win, red = loss)
- Scrollable for long lists
- Updates automatically as new trades complete

---

### 7. System Health Panel

**WebSocket Status**
- 🟢 Connected - Receiving real-time data
- 🔴 Disconnected - No data flow

**Last Data Update**
- Timestamp of most recent market data
- Should update every minute during market hours

**Candles Today**
- Count of 1-minute candles received
- Should be ~375 candles per trading day (6.25 hours × 60)

**Recent Errors/Warnings**
- Last 10 error or warning messages from logs
- Red = errors, Yellow = warnings
- Scrollable if more than 10
- Empty if no issues

---

## 🔧 Technical Details

### Architecture

**Frontend**
- Single-page application (HTML/CSS/JS)
- Chart.js for equity curve visualization
- Auto-refresh every 30 seconds
- Responsive design (works on mobile)

**Backend**
- Express.js server (Node.js)
- Serves dashboard files
- API endpoints that READ from bot's logs
- No database required

**Data Source**
- Trade journal: `logs/trades/trades_YYYY-MM-DD.json`
- Bot state: `data/bot_state.json` (exported every 10 seconds)
- Main log: `logs/main_YYYY-MM-DD.log`
- System health: Parsed from log files

**Communication**
- Dashboard → Server: HTTP requests (API calls)
- Server → Bot: NONE (read-only file access)
- Bot → Dashboard: File export only (bot_state.json)

### Security

✅ **Read-Only**: Dashboard cannot modify bot behavior  
✅ **Isolated**: Runs on separate port (3000) from bot  
✅ **Local Only**: Listens on localhost (not exposed to internet)  
✅ **No Auth Needed**: Since it's local, no password required  

### API Endpoints

**GET /api/status**
- Returns: Current bot state, position, risk metrics
- Source: `data/bot_state.json`

**GET /api/trades**
- Returns: All trades from trade journal
- Source: `logs/trades/trades_*.json`

**GET /api/performance**
- Returns: Calculated performance metrics
- Source: Aggregated from trades

**GET /api/health**
- Returns: System health, errors, WebSocket status
- Source: `logs/main_*.log` parsed

**POST /api/kill-switch**
- Action: Creates `.kill-switch` file
- Effect: Bot detects file and stops
- Confirmation: Required in UI

---

## 📋 How to Use

### Daily Monitoring

**Morning (Pre-Market)**
1. Check bot status: Should show "Running"
2. Verify market session: Should show "PRE_MARKET"
3. Check next event: Should show time until market open
4. Review yesterday's summary if available

**During Market Hours**
1. Monitor opening range calculation (9:15-9:30 AM)
2. Watch for entry signals after 9:30 AM
3. If position opens:
   - Track real-time P&L
   - Monitor time held
   - Check stop/target distances
4. Verify trades appear in Trade Log after closing

**After Market Close**
1. Review daily performance:
   - Total trades
   - Raw vs adjusted P&L
   - Cost impact
2. Check Trade Log for any anomalies
3. Review System Health for errors

### Weekly Review

**Performance Analysis**
1. Filter trades for the week
2. Calculate:
   - Weekly win rate (raw vs adjusted)
   - Weekly profit factor
   - Average cost per trade
3. Export to CSV for deeper analysis

**Cost Impact Assessment**
1. Check "Trades Erased by Costs" count
2. Review "Avg Cost per Trade" percentage
3. Monitor profit factor indicator position
4. Look for cost trends (increasing/decreasing)

**System Health Check**
1. Review error log for patterns
2. Check WebSocket stability (disconnections?)
3. Verify data updates happening regularly
4. Confirm daily loss limit never triggered

### Monthly Decision Point

**After 30+ Trades**
1. Review Cost Analysis Panel verdict
2. Check profit factor indicator:
   - 🟢 > 1.2: Continue testing
   - 🟡 1.0-1.2: Marginal, needs analysis
   - 🔴 < 1.0: Strategy failed
3. Export all trades to CSV
4. Perform detailed analysis in Excel
5. Make go/no-go decision for live trading

---

## 🛑 Emergency Procedures

### Using the Kill Switch

**When to Use**
- Bot behaving unexpectedly
- Repeated errors in System Health
- Want to stop immediately (don't wait for market close)
- Circuit breaker not triggering but should

**How to Use**
1. Click 🛑 KILL SWITCH button
2. Read confirmation dialog carefully
3. Click "YES - ACTIVATE KILL SWITCH"
4. Dashboard shows confirmation
5. Bot will:
   - Close any open positions
   - Stop taking new trades
   - Exit gracefully

**After Activation**
1. Check Trade Log for position close
2. Review System Health for cause
3. Fix any issues
4. Delete `.kill-switch` file to reset
5. Restart bot when ready

### Manual Position Close

If dashboard not accessible:

```bash
# Create kill switch file
echo. > .kill-switch

# Bot will detect and stop
# Check logs for confirmation
type logs\main_2026-07-31.log
```

---

## 🔍 Troubleshooting

### Dashboard Won't Load

**Problem**: Cannot access http://localhost:3000

**Solutions**:
1. Check dashboard server is running:
   ```bash
   npm run dashboard
   ```
2. Verify port 3000 is not in use
3. Check firewall settings
4. Try closing and reopening browser

### No Data Showing

**Problem**: Dashboard loads but shows "No trades yet"

**Solutions**:
1. Verify bot is running:
   ```bash
   # Check process list
   tasklist | findstr node
   ```
2. Check bot has started trading (after 9:30 AM)
3. Verify trade journal files exist:
   ```bash
   dir logs\trades\trades_*.json
   ```
4. Check bot_state.json is being updated:
   ```bash
   type data\bot_state.json
   ```

### Auto-Refresh Not Working

**Problem**: Data not updating automatically

**Solutions**:
1. Check browser console for errors (F12)
2. Manually refresh page (Ctrl+R)
3. Check dashboard server logs for errors
4. Verify API endpoints responding:
   ```
   http://localhost:3000/api/status
   http://localhost:3000/api/trades
   ```

### Kill Switch Not Working

**Problem**: Clicked kill switch but bot still running

**Solutions**:
1. Verify `.kill-switch` file was created:
   ```bash
   dir .kill-switch
   ```
2. Check bot logs for kill switch detection
3. If still not working, stop bot manually:
   ```bash
   # Find bot process
   tasklist | findstr node
   # Stop process
   taskkill /F /PID <process_id>
   ```

---

## 📊 Dashboard vs Logs

### When to Use Dashboard
- ✅ Real-time monitoring during market hours
- ✅ Quick status checks
- ✅ Visual analysis (charts, metrics)
- ✅ Cost impact assessment
- ✅ Emergency stop (kill switch)

### When to Use Logs
- ✅ Detailed debugging
- ✅ Historical analysis beyond dashboard retention
- ✅ Exact timestamps and error messages
- ✅ Audit trail
- ✅ Bot behavior investigation

### When to Use CSV Exports
- ✅ Deep statistical analysis
- ✅ Excel pivot tables and charts
- ✅ Custom calculations
- ✅ Sharing results
- ✅ Long-term record keeping

---

## 🎨 Customization

### Changing Refresh Interval

Edit `dashboard/dashboard.js`:

```javascript
const CONFIG = {
    refreshInterval: 30000, // Change to 60000 for 60 seconds
    // ...
};
```

### Changing Dashboard Port

Edit `dashboard/server.js`:

```javascript
const PORT = 3000; // Change to 8080 or any available port
```

Then access at: `http://localhost:8080`

### Adding Custom Metrics

1. Add calculation in `dashboard/server.js` → `calculatePerformance()`
2. Add display in `dashboard/index.html` → Performance panel
3. Add update logic in `dashboard/dashboard.js` → `updatePerformancePanel()`

---

## ⚠️ Important Notes

1. **Read-Only Design**: Dashboard can only READ data, never WRITE to bot
2. **Kill Switch Exception**: Only way dashboard affects bot (creates file)
3. **Local Access**: Not designed for remote/internet access
4. **No Authentication**: Assumes trusted local environment
5. **File-Based**: No database, reads directly from logs
6. **Real-Time Lag**: 30-second refresh means ~30s delay max
7. **Browser Compatibility**: Tested on Chrome/Edge/Firefox
8. **Mobile Responsive**: Works on tablets/phones but desktop recommended

---

## 📝 Files Created

```
dashboard/
├── index.html          # Main dashboard UI
├── styles.css          # Styling
├── dashboard.js        # Frontend logic
└── server.js           # Backend API server

src/bot/
└── state-exporter.js   # Exports bot state for dashboard
```

---

## 🎯 Phase 2 Integration

The dashboard is specifically designed to visualize the **Phase 2 critical question**:

> **Does the strategy's 1.33 profit factor survive real-world execution costs?**

**Key Dashboard Features for This**:
1. **Cost Analysis Panel** - Dedicated section for cost impact
2. **Profit Factor Indicator** - Visual status (PASS/MARGINAL/FAIL)
3. **Raw vs Adjusted Metrics** - Side-by-side comparison throughout
4. **Trades Erased Count** - Direct cost impact measure
5. **Equity Curve** - Visual divergence between raw and adjusted

**Decision Making**:
- After 30+ trades, check Cost Analysis verdict
- Export trades for detailed analysis if in marginal zone
- Make honest go/no-go decision based on cost-adjusted metrics

---

**Status**: ✅ Complete and ready to use  
**Start**: `npm run dashboard` (in separate terminal from bot)  
**Access**: http://localhost:3000  
**Refreshes**: Every 30 seconds automatically  

**Remember**: Dashboard shows data, bot makes decisions. They are completely separate systems.
