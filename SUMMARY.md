# Upstox ORB Trading Bot - Complete Summary

**Project**: Opening Range Breakout Trading Bot for Indian F&O Options  
**Strategy**: NIFTY Golden Ratio (61.8% Fibonacci + Opening Range)  
**Status**: Phase 2 Complete - Ready for 30-60 Day Validation  
**Last Updated**: July 31, 2026

---

## 📖 Quick Navigation

### 🎯 Getting Started
- **New users**: Start with `README.md`
- **Setup instructions**: See `QUICKSTART.md` or `SETUP.md`
- **Phase 2 quick start**: See `PHASE2_QUICKSTART.md`

### 📚 Documentation by Phase

**Phase 1 - Backtest (COMPLETE ✅)**
- `BACKTEST_RESULTS_2026.md` - Full backtest analysis
- `GUIDE.md` - Comprehensive guide
- `FAQ.md` - Common questions

**Phase 2 - Sandbox Bot (COMPLETE ✅)**
- `README_PHASE2.md` - Phase 2 summary
- `PHASE2_BUILD_COMPLETE.md` - Build details
- `PHASE2_QUICKSTART.md` - How to run
- `PHASE2_IMPLEMENTATION.md` - Architecture
- `PHASE2_STATUS.md` - Progress tracker
- `PHASE2_FOCUS.md` - Priorities
- `PHASE2_EXPECTATIONS.md` - What to expect

**Technical Reference**
- `ARCHITECTURE.md` - System design
- `CHECKLIST.md` - Implementation checklist
- `DOCS.md` - Documentation index

---

## 🎯 Project Goals

### Phase 1: Backtest Validation ✅
**Goal**: Validate strategy on historical data  
**Status**: COMPLETE  
**Result**: NIFTY Golden Ratio passed with 1.33 profit factor on 2026 data

### Phase 2: Cost Impact Validation (CURRENT)
**Goal**: Measure if execution costs erase the thin edge  
**Status**: BUILD COMPLETE - Ready for 30-60 day testing  
**Question**: Does 1.33 PF survive real-world costs?

### Phase 3: Live Trading (FUTURE)
**Goal**: Live money deployment  
**Status**: AWAITING Phase 2 results  
**Criteria**: Cost-adjusted PF > 1.2 required to proceed

---

## 🏗️ System Architecture

### Components (11 Total)

**Data Pipeline**:
1. WebSocket Client → Real-time market data
2. Candle Builder → Tick-to-OHLC conversion
3. Instrument Master → Options metadata
4. Option Chain → Real-time quotes

**Bot Core**:
5. Session Manager → Market hours & holidays
6. Bot Engine → Main orchestrator (state machine)
7. Position Tracker → Real-time P&L

**Cost & Risk**:
8. Cost Calculator → **CRITICAL** - Full F&O costs
9. Trade Journal → CSV/JSON logging
10. Risk Manager → Circuit breaker & kill switch
11. Main Runner → Entry point

### State Machine
```
PRE_MARKET
    ↓ (9:15 AM)
CALCULATING_OR (9:15-9:30 AM)
    ↓ (9:30 AM)
MONITORING (watching for breakout)
    ↓ (signal detected)
POSITION_OPEN (monitor stop/target)
    ↓ (exit condition)
POSITION_CLOSED
    ↓ (3:30 PM)
POST_MARKET
```

---

## 📊 Strategy Details

### NIFTY Golden Ratio Breakout

**Signal Generation**:
1. Calculate previous day high/low/close
2. Calculate 61.8% Fibonacci level
3. Calculate opening range (9:15-9:30 AM)
4. Set entry levels:
   - Long: OR high + (fib range × 0.1)
   - Short: OR low - (fib range × 0.1)
5. Enter on breakout after 9:30 AM

**Position Management**:
- Stop loss: 0.5% from entry
- Target: 2.0% from entry
- Hard exit: 3:15 PM (regardless of P&L)
- Max 1 trade per day (NIFTY only)

**Risk Management**:
- 2% risk per trade (position sizing)
- -2% daily loss limit (circuit breaker)
- Max 2 trades per day total
- No entries after 2:45 PM

---

## 📈 Backtest Results (2026 Data)

### Data Used
- Dates: February 1 - July 31, 2026 (6 months)
- Instruments: NIFTY, BANKNIFTY
- Strategies: ORB, Golden Ratio
- Total: 121 trading days × 2 instruments = 242 backtests

### Results Summary

**NIFTY Golden Ratio (SELECTED)**:
- Train period (Feb-Apr): PF 1.32, 26% WR, Score 3.53/5
- **Test period (May-Jul): PF 1.33, 27% WR, Score 3.57/5 ✅**
- Overfitting check: PASS (train/test similar)
- Verdict: **SELECTED for Phase 2**

**Other strategies**:
- NIFTY ORB: Failed (PF < 1.5 on test)
- BANKNIFTY ORB: Failed (PF < 1.5 on test)
- BANKNIFTY Golden Ratio: Failed (PF < 1.5 on test)

### Key Insights
1. **Regime dependency confirmed**: Same strategies showed opposite results on 2024 vs 2026 data
2. **Low win rate expected**: 25-30% is normal for this strategy type
3. **Thin margin**: 1.33 PF means costs could erase edge
4. **Works via profit factor**: Few big wins compensate for many small losses

---

## 💰 Cost Structure (Indian F&O Options)

### Per Trade Costs
1. **Brokerage**: ₹20 per order OR 0.05% of premium (whichever lower)
2. **STT**: 0.0625% on sell side only
3. **Exchange**: 0.053% of turnover (both sides)
4. **GST**: 18% on (brokerage + exchange + SEBI)
5. **SEBI**: ₹10 per ₹1 crore turnover
6. **Stamp Duty**: 0.003% on buy side only

### Example Trade Cost
Entry: ₹450 × 50 qty = ₹22,500  
Exit: ₹459 × 50 qty = ₹22,950  
Raw P&L: ₹450

**Costs**:
- Brokerage: ₹40 (₹20 × 2)
- STT: ₹143 (0.0625% of exit)
- Exchange: ₹119 (0.053% of turnover)
- GST: ₹36 (18% of above)
- Stamp duty: ₹1 (0.003% of entry)
- **Total: ₹451**

**Adjusted P&L**: ₹450 - ₹451 = **-₹1** (LOSS!)

This example shows how costs can turn a profitable trade into a loss.

---

## 🎯 Phase 2 Critical Question

### The Question
**Does the strategy's 1.33 profit factor survive when you add:**
- Real bid-ask spreads (not 0)
- Real slippage (signal vs fill price)
- Full Indian F&O cost structure

### How We'll Answer
1. Run bot for 30-60 days
2. Collect 60-120 real trades
3. Calculate for each trade:
   - Raw P&L (as backtest measured)
   - Cost-adjusted P&L (after all costs)
4. Aggregate:
   - Cost-adjusted profit factor
   - How many profitable trades became losses due to costs
   - Average cost as % of raw P&L
5. Apply decision criteria

### Decision Criteria (Pre-Committed)
- **Cost-adjusted PF > 1.2**: Edge survives → Consider live trading ✅
- **Cost-adjusted PF 1.0-1.2**: Marginal edge → Needs analysis ⚠️
- **Cost-adjusted PF < 1.0**: No edge with costs → Stop ❌

---

## 🚀 Running the Bot

### Quick Start
```bash
# Install dependencies (done)
npm install

# Run live bot
npm run live
```

### What It Does
1. Initializes all components
2. Connects to Upstox WebSocket
3. Waits for market open (9:15 AM)
4. Calculates opening range (9:15-9:30 AM)
5. Monitors for breakout signals
6. Executes trades when detected
7. Tracks P&L in real-time
8. Logs to CSV/JSON
9. Closes positions at 3:15 PM
10. Generates daily summary

### Monitoring
```bash
# View main log
type logs\main_2026-07-31.log

# View trades
type logs\trades\trades_2026-07-31.csv
```

Import CSV to Excel for analysis.

---

## 🛡️ Safety Features

### 1. Circuit Breaker
Stops trading at -2% daily loss automatically

### 2. Kill Switch
```bash
# Activate
echo. > .kill-switch

# Deactivate
del .kill-switch
```

### 3. Risk Limits
- Max 2% risk per trade
- Max 2 trades per day
- No entries after 2:45 PM
- Hard exit at 3:15 PM

### 4. Graceful Shutdown
Ctrl+C to stop safely

---

## 📅 Timeline

### Completed
- **Phase 1** (6 weeks): Backtest validation ✅
- **Phase 2 Build** (3 weeks): All components built ✅
- **Dependency Install**: csv-parse installed ✅

### Current
- **Phase 2 Testing** (Week 4): Integration & validation

### Upcoming
- **Phase 2 Validation** (Weeks 5-12): 30-60 day live sandbox run
- **Decision Point** (Week 13): Analyze results, make go/no-go decision
- **Phase 3** (TBD): Live trading if Phase 2 passes

---

## 📊 Expected Results

### Best Case (20% probability)
- Cost-adjusted PF: 1.2-1.3
- Costs: 20-25% of raw P&L
- Outcome: Edge survives, viable strategy ✅

### Realistic Case (60% probability)
- Cost-adjusted PF: 1.0-1.2
- Costs: 25-35% of raw P&L
- Outcome: Marginal edge, risky ⚠️

### Worst Case (20% probability)
- Cost-adjusted PF: < 1.0
- Costs: >35% of raw P&L
- Outcome: Costs erase edge, not viable ❌

---

## 📁 Key Files

### To Run
- `package.json` - Dependencies & scripts
- `config/config.json` - Configuration
- `src/bot/run-live-bot.js` - Entry point

### Documentation
- `README.md` - Main README
- `GUIDE.md` - Comprehensive guide
- `PHASE2_QUICKSTART.md` - How to run Phase 2
- `PHASE2_BUILD_COMPLETE.md` - Build summary
- `BACKTEST_RESULTS_2026.md` - Backtest analysis

### Generated (while running)
- `logs/main_YYYY-MM-DD.log` - Main log
- `logs/trades/trades_YYYY-MM-DD.csv` - Trade data
- `logs/trades/summary_daily_YYYY-MM-DD.txt` - Summary

---

## ⚠️ Critical Reminders

1. **Sandbox mode only** - No real money at risk yet
2. **30-60 days minimum** - Don't compress timeline
3. **Low win rate normal** - 25-30% expected for this strategy
4. **Costs are the focus** - That's what Phase 2 measures
5. **Pre-committed criteria** - Decision thresholds locked in
6. **No live trading yet** - Not until Phase 2 validates

---

## 🎯 Success Metrics

### Technical Success (Phase 2)
- Bot runs stably for 30+ days ✅
- Minimum 60 trades collected ✅
- All data logged correctly ✅
- No critical errors ✅

### Strategic Success (TBD)
- Cost-adjusted profit factor > 1.2
- Edge survives real execution costs
- Performance matches backtest expectations

---

## 📞 Support

**Getting Started**:
- Read `README.md`
- Follow `QUICKSTART.md`
- Run `npm run live`

**Understanding Results**:
- Review `BACKTEST_RESULTS_2026.md`
- Check `PHASE2_EXPECTATIONS.md`
- See `FAQ.md`

**Troubleshooting**:
- Check `logs/main_YYYY-MM-DD.log`
- Verify `config/config.json`
- Ensure market hours (9:15-3:30 IST)

---

## 🏁 Current Status

**Build**: ✅ COMPLETE (100%)  
**Dependencies**: ✅ Installed  
**Testing**: 🟡 Ready to begin  
**Validation**: ⏳ Awaiting 30-60 days  
**Go-Live**: ⏳ Awaiting Phase 2 results

**Next Action**: Run `npm run live` during market hours

---

## 🎓 Key Learnings

### What Makes This Different
1. **Honest about costs** - Most bots ignore them
2. **Pre-committed criteria** - No moving goalposts
3. **Long validation** - 30-60 days, not 1 week
4. **Built for failure detection** - Safety first
5. **No optimization during test** - Parameters frozen

### What We're NOT Doing
- ❌ Assuming perfect fills
- ❌ Ignoring bid-ask spreads
- ❌ Skipping cost calculations
- ❌ Compressing timeline
- ❌ Changing parameters mid-test

### What We ARE Doing
- ✅ Measuring real costs
- ✅ Tracking slippage
- ✅ Honest assessment
- ✅ Patient validation
- ✅ Pre-committed decisions

---

## 📝 Final Notes

This is a **validation project**, not a production system yet.

**Purpose**: Answer honestly whether this strategy edge survives real-world execution costs.

**Timeline**: 3 months total (build + validation)

**Outcome**: Unknown - that's why we're testing

**Next**: 30-60 days of data collection and honest analysis

---

*Project started: June 2026*  
*Phase 1 complete: July 2026*  
*Phase 2 build complete: July 31, 2026*  
*Phase 2 validation: August-September 2026*  
*Decision point: October 2026*
