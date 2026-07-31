# Phase 2 Implementation Plan - Sandbox Bot

**Status**: In Progress 🟡  
**Start Date**: July 31, 2026  
**Target**: 30-60 trading days of sandbox validation  
**Strategy**: NIFTY Golden Ratio Breakout (validated on 2026 data)

---

## 🎯 Phase 2 Goals

**Primary Goal**: Validate that real-world execution costs don't erase the thin edge shown in backtesting

**Key Metric**: Cost-adjusted profit factor must stay > 1.2 (backtest showed 1.33)

**Success Criteria**:
- ✅ 30+ trading days completed without crashes
- ✅ Cost-adjusted profit factor > 1.2
- ✅ All risk management working correctly
- ✅ Execution quality acceptable (fills, latency)
- ✅ Raw vs cost-adjusted P&L gap < 30%

**Failure Criteria**:
- ❌ Cost-adjusted profit factor < 1.0
- ❌ Daily loss circuit breaker triggers repeatedly
- ❌ Technical failures causing missed trades or bad fills
- ❌ Execution costs > 30% of edge

---

## 📋 Components to Build

### 1. ✅ WebSocket Client (COMPLETE)
**File**: `src/data/websocket-client.js`

**Purpose**: Real-time market data stream from Upstox

**Status**: Built and ready

---

### 2. ✅ Candle Builder (COMPLETE)
**File**: `src/data/candle-builder.js`

**Purpose**: Convert tick stream to 1-minute OHLC candles

**Status**: Built and ready

---

### 3. Instrument Master Manager (NEXT)
**File**: `src/data/instrument-master.js`

**Purpose**: Fetch and cache NIFTY options metadata

**Features**:
- Download instrument master CSV from Upstox
- Parse and index by symbol/strike/expiry
- Find correct strike for given spot price
- Handle weekly expiry rollover
- Cache with daily refresh
- Never hardcode instrument keys

**API**: `https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv`

---

### 4. Option Chain Fetcher
**File**: `src/data/option-chain.js`

**Purpose**: Get real-time option prices for strike selection

**Features**:
- Fetch option chain for NIFTY
- Get bid-ask spreads
- Select ATM/OTM strikes
- Calculate mid-price for entry
- Track implied volatility (optional)

**API**: Upstox Option Chain endpoint

---

### 5. Bot Engine (CORE)
**File**: `src/bot/bot-engine.js`

**Purpose**: Main orchestration - runs during market hours

**Features**:
- Daily startup routine (pre-market checks)
- Market open handler (9:15 AM)
- Opening range calculation (9:15-9:30 AM)
- Golden Ratio level calculation (previous day data)
- Real-time candle monitoring
- Entry signal detection
- Exit signal detection (stop/target/time)
- Position state management
- Daily shutdown routine (post-market)
- Graceful restart/recovery

**State Machine**:
```
PRE_MARKET → CALCULATING_OR → MONITORING → POSITION_OPEN → POSITION_CLOSED → POST_MARKET
```

---

### 6. Session Manager
**File**: `src/bot/session-manager.js`

**Purpose**: Manage trading session lifecycle

**Features**:
- Check if today is a trading day
- Handle market hours (9:15 AM - 3:30 PM)
- Market holiday detection
- Pre-market checks (credentials, connectivity)
- Post-market cleanup
- State persistence across restarts

---

### 7. Position Tracker
**File**: `src/bot/position-tracker.js`

**Purpose**: Track open positions in real-time

**Features**:
- Position state (entry price, qty, stop, target)
- Real-time P&L calculation
- Current option premium tracking
- Greeks tracking (optional)
- Position history log
- Emergency position exit

---

### 8. Cost Calculator
**File**: `src/bot/cost-calculator.js`

**Purpose**: Calculate execution costs (CRITICAL for Phase 2)

**Features**:
- **Bid-Ask Spread**: Calculate spread at entry/exit
- **Brokerage**: Per-trade broker fees
- **STT**: Securities Transaction Tax (on options)
- **Exchange Charges**: NSE transaction fees
- **GST**: 18% on brokerage + exchange charges
- **SEBI Turnover Fee**: ₹10 per crore
- **Stamp Duty**: State-specific

**Cost Structure (Indian F&O Options)**:
```
Brokerage: ₹20 per order (or 0.05% of premium)
STT: 0.0625% on sell side (premium × qty)
Exchange: 0.053% (premium × qty)
GST: 18% on (brokerage + exchange + SEBI)
SEBI: ₹10 per ₹1 crore turnover
Stamp Duty: 0.003% on buy side
```

**Output**:
- Raw P&L (as backtest measured)
- Cost-adjusted P&L (after all costs)
- Cost breakdown per trade
- Cost as % of raw P&L

---

### 7. Trade Journal
**File**: `src/bot/trade-journal.js`

**Purpose**: Record every trade with full context

**Features**:
- Log entry: timestamp, price, qty, reasoning, costs
- Log exit: timestamp, price, reason, P&L, cost breakdown
- Daily summary: trades, win rate, raw/adjusted P&L
- Weekly summary: aggregate metrics
- CSV export for analysis
- JSON export for programmatic access

---

### 8. Live Risk Manager (Enhanced)
**File**: `src/risk/live-risk-manager.js` (extends existing)

**Purpose**: Real-time risk enforcement

**Features**:
- Pre-trade checks (capital available, daily loss limit)
- Daily loss circuit breaker (hard stop at -2%)
- Max trades per day (1 for Golden Ratio)
- Position size calculation (2% risk)
- Kill switch (manual emergency stop)
- Risk status reporting
- Alert on risk events

---

### 9. Main Bot Runner
**File**: `src/bot/run-live-bot.js`

**Purpose**: Entry point for live bot

**Features**:
- Load configuration
- Initialize all components
- Start WebSocket connection
- Start bot engine
- Handle graceful shutdown (Ctrl+C)
- Error recovery
- Restart logic
- Health monitoring

---

## 🔄 Data Flow

```
1. WebSocket → Tick Stream
2. Tick Stream → Candle Builder → 1-min Candles
3. Candles → Bot Engine → Strategy Evaluation
4. Strategy → Entry Signal → Order Manager
5. Order Manager → Upstox Sandbox API → Order Placed
6. Order Filled → Position Tracker → Monitor P&L
7. Exit Signal → Order Manager → Close Position
8. Position Closed → Cost Calculator → Raw + Adjusted P&L
9. Trade Complete → Trade Journal → CSV/JSON Export
10. Review logs and CSV files for monitoring (no UI yet)
```

---

## 📊 Execution Cost Tracking (CRITICAL)

Every trade will log:

```javascript
{
  tradeId: "2026-08-01-001",
  entry: {
    timestamp: "2026-08-01T09:31:00.000Z",
    signal_price: 25000.50,        // Price when signal generated
    order_price: 25001.00,          // Price order placed at
    fill_price: 25001.50,           // Actual fill price
    slippage: 1.00,                 // fill - signal (in index points)
    option_premium: 450.50,
    quantity: 50,
    bid: 449.00,
    ask: 452.00,
    spread: 3.00,
    spread_cost: 75.00              // spread/2 × qty
  },
  exit: {
    timestamp: "2026-08-01T14:45:00.000Z",
    signal_price: 459.80,
    fill_price: 459.20,
    slippage: -0.60,
    bid: 458.50,
    ask: 460.00,
    spread: 1.50,
    spread_cost: 37.50
  },
  pnl: {
    raw: 400.00,                    // (459.20 - 450.50) × 50
    spread_cost: 112.50,            // entry + exit spread
    brokerage: 40.00,               // ₹20 × 2 (entry + exit)
    stt: 143.13,                    // 0.0625% of sell side
    exchange: 119.29,               // 0.053% of turnover
    sebi: 0.02,                     // negligible
    gst: 35.99,                     // 18% on (brokerage + exchange + sebi)
    stamp: 0.68,                    // 0.003% on buy side
    total_cost: 451.61,
    adjusted: -51.61,               // raw - total_cost (LOSS after costs!)
    cost_as_percent: 112.9%         // cost/raw × 100
  },
  verdict: "FAIL - Costs exceeded profit"
}
```

**This is the critical metric**: If adjusted P&L is consistently negative while raw is positive, the strategy doesn't work in reality.

---

## 🛡️ Risk Management

### Daily Loss Circuit Breaker
```javascript
if (dailyPnLPercent <= -2.0) {
  logger.error("CIRCUIT BREAKER TRIGGERED");
  alertManager.sendAlert("🚨 DAILY LOSS LIMIT HIT - Trading stopped");
  botEngine.stop();
  process.exit(1);
}
```

### Kill Switch
```javascript
// Can be triggered via:
// 1. API endpoint (POST /kill-switch)
// 2. File presence (touch .kill-switch)
// 3. Telegram command (/kill)

if (killSwitchActivated()) {
  logger.error("KILL SWITCH ACTIVATED");
  alertManager.sendAlert("🛑 KILL SWITCH - Emergency stop");
  await closeAllPositions();
  botEngine.stop();
  process.exit(0);
}
```

### Idempotent Orders
```javascript
async function placeOrder(params) {
  // Check if order already exists
  const existing = await findExistingOrder(params);
  if (existing) {
    logger.warn("Order already exists", { orderId: existing.id });
    return existing;
  }
  
  // Place new order with unique client ID
  const clientId = `GR-${Date.now()}-${uuid()}`;
  const order = await upstox.placeOrder({
    ...params,
    tag: clientId,
    headers: { 'X-Algo-Name': 'NIFTY-Golden-Ratio-ORB' }
  });
  
  return order;
}
```

---

## 📅 Implementation Timeline

### Week 1: Core Infrastructure
- [x] Phase 2 implementation plan
- [x] WebSocket client
- [x] Candle builder
- [ ] Instrument master manager
- [ ] Bot engine skeleton

### Week 2: Execution & Tracking
- [ ] Option chain fetcher
- [ ] Position tracker
- [ ] Session manager
- [ ] Bot engine core logic

### Week 3: Cost & Risk
- [ ] Cost calculator (CRITICAL)
- [ ] Trade journal
- [ ] Live risk manager
- [ ] Main bot runner

### Week 4: Testing & Deploy
- [ ] Integration testing
- [ ] Sandbox API validation
- [ ] End-to-end testing
- [ ] Deploy and start collecting data

### Week 5-12: Live Sandbox Run (NO UI YET)
- [ ] Run for 30-60 trading days
- [ ] Monitor via logs and CSV exports
- [ ] Track cost-adjusted performance
- [ ] Generate weekly reports (text/CSV)

**Dashboard/UI**: Deferred until after data collection begins

---

## 📊 Reporting Requirements

### Daily Report (CSV Export)
Generated automatically at end of day in `logs/daily_report_YYYY-MM-DD.csv`

**Columns**: Date, Trades, Wins, Losses, Win Rate, Raw P&L, Cost-Adjusted P&L, Costs, Circuit Breaker Status

### Weekly Report (Text File)
Generated every Friday in `logs/weekly_report_YYYY-WW.txt`

**Content**: Aggregate metrics, cost analysis, profit factor, recommendations

**Monitor via**: Log files and CSV exports (can import to Excel for analysis)

**Dashboard/Alerts**: Will add later once there's actual data to display

---

## ⚠️ Decision Points

### After 10 Trading Days (Quick Check)
**If cost-adjusted profit factor < 1.0:**
- Stop immediately
- Analyze cost breakdown
- Determine if fixable (better execution, different strikes)
- Decide: fix and continue, or abandon

### After 30 Trading Days (Interim Review)
**If cost-adjusted profit factor > 1.2:**
- Continue to 60 days
- Edge is surviving costs

**If cost-adjusted profit factor 1.0-1.2:**
- Marginal, risky
- Analyze trade log for patterns
- Consider improvements
- Decide: continue cautiously or stop

**If cost-adjusted profit factor < 1.0:**
- Stop, strategy doesn't work with real costs
- Do NOT proceed to live trading

### After 60 Trading Days (Final Decision)
Run full train/test validation on sandbox trades:
- Split trades 70/30
- Calculate edge scores
- Compare to backtest expectations
- If passed: Consider small-scale live trading
- If failed: Abandon or significantly rework

---

## 🚨 Alert Triggers (Via Logs)

**Critical Events** (logged with ERROR level):
- Circuit breaker triggered
- Kill switch activated
- WebSocket disconnected
- Order placement failure
- Unexpected error

**Daily Summary** (logged at end of day):
- Trades summary
- Raw vs adjusted P&L
- Circuit breaker status

**Weekly Summary** (logged every Friday):
- Week metrics
- Cost analysis
- Profit factor update

**Monitor via**: Tail logs in real-time or review daily

**Dashboard/Telegram alerts**: Will add once data collection starts

---

## 🔧 Configuration

Update `config/config.json`:

```json
{
  "phase2": {
    "enabled": true,
    "strategy": "GOLDEN_RATIO",
    "instrument": "NIFTY",
    "mode": "SANDBOX",
    "virtualCapital": 100000,
    "dailyLossLimit": 2.0,
    "maxTradesPerDay": 1,
    "riskPerTrade": 2.0,
    "hardExitTime": "15:15",
    "algoName": "NIFTY-Golden-Ratio-ORB"
  },
  "costs": {
    "brokerage_per_order": 20,
    "stt_rate": 0.000625,
    "exchange_rate": 0.00053,
    "sebi_rate": 0.0000001,
    "gst_rate": 0.18,
    "stamp_duty_rate": 0.00003
  },
  "websocket": {
    "url": "wss://api-v2.upstox.com/feed/market-data-feed/v2",
    "reconnect_delay_ms": 5000,
    "max_reconnect_attempts": 10,
    "heartbeat_interval_ms": 30000
  },
  "alerts": {
    "telegram": {
      "enabled": false,
      "botToken": "",
      "chatId": ""
    },
    "discord": {
      "enabled": false,
      "webhookUrl": ""
    }
  }
}
```

---

## 📝 Next Steps

1. **Set up Telegram/Discord** (optional but recommended)
2. **Implement WebSocket client** (first priority)
3. **Build candle builder**
4. **Implement bot engine**
5. **Add cost calculator**
6. **Test with sandbox API**
7. **Run for 30-60 days**
8. **Analyze results honestly**

---

**Status**: Implementation plan complete  
**Next**: Begin building WebSocket client  
**ETA**: 4-6 weeks to fully operational sandbox bot
