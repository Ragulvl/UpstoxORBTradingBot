# Upstox ORB Trading Bot - Complete Guide

**Last Updated**: July 31, 2026  
**Current Phase**: Phase 2 - Sandbox Bot (In Progress)

---

## 📊 Project Status

### ✅ Phase 1: Complete (Strategy Validated)
- **Backtest Period**: Feb-Jul 2026 (current market, 121 trading days)
- **Strategies Tested**: 4 (ORB + Golden Ratio × NIFTY + BANKNIFTY)
- **Result**: All 4 passed on 2026 data
- **Selected**: NIFTY Golden Ratio (most consistent across conditions)

### 🟡 Phase 2: In Progress (Sandbox Bot - 15%)
- **Goal**: Test if execution costs erase the edge
- **Timeline**: 3-4 weeks build + 30-60 days testing
- **Key Metric**: Cost-adjusted profit factor
- **Decision**: PF >1.2 continue, 1.0-1.2 marginal, <1.0 stop

---

## 🎯 Strategy Summary

**NIFTY Golden Ratio Breakout**
- **Entry**: 61.8% Fibonacci of previous day range + opening range (9:15-9:30 AM)
- **Instrument**: NIFTY 50 options (buy calls/puts only)
- **Stop Loss**: 0.5% of premium
- **Target**: 2.0% of premium
- **Exit**: 3:15 PM IST (hard exit)
- **Position Size**: 2% risk per trade

**Backtest Performance (2026 data)**:
- Win Rate: 25-38% (lose 6-8 of 10 trades)
- Profit Factor: 1.33 (test period)
- Max Drawdown: 4.5%
- Total P&L: +6.5% over 37 days (test)

⚠️ **Critical**: This is a THIN margin. Execution costs of 20-30% could erase profitability.

---

## 🚀 Quick Start (Phase 1 - Backtesting)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure API
Edit `config/config.json`:
```json
{
  "upstox": {
    "apiKey": "your-api-key",
    "apiSecret": "your-secret",
    "accessToken": "your-access-token"
  },
  "backtest": {
    "startDate": "2026-02-01",
    "endDate": "2026-07-31"
  }
}
```

### 3. Fetch Historical Data
```bash
node src/data/fetch-historical.js
```

### 4. Run Backtest
```bash
npm run backtest
```

---

## 📋 Phase 2: What's Being Built

### Core Components (9 remaining)
1. **Instrument Master** - Strike selection, expiry handling
2. **Option Chain** - Real-time option prices
3. **Bot Engine** - Main orchestration (state machine)
4. **Session Manager** - Market hours, holidays
5. **Position Tracker** - Real-time P&L
6. **Cost Calculator** ⚠️ CRITICAL - Execution cost tracking
7. **Trade Journal** - Full trade logging (CSV/JSON)
8. **Risk Manager** - Circuit breaker, kill switch
9. **Bot Runner** - Main entry point

**Alerts/Dashboard**: Will add after data collection starts

### Why Cost Tracking is Critical
**Backtest assumes**: Perfect fills, no slippage, no costs
**Reality includes**:
- Bid-ask spread: ₹2-5 per option
- Slippage: 0.05-0.1%
- Brokerage: ₹20 per order
- STT: 0.0625% on sell
- Exchange: 0.053% turnover
- GST: 18% on fees
- Stamp duty: 0.003% on buy

**Impact**: Could reduce 1.33 PF to <1.0, making strategy unprofitable

---

## ⚠️ Important Warnings

### Market Regime Dependency
**2024 Data**: Only NIFTY Golden Ratio passed (1 of 4)
**2026 Data**: All 4 strategies passed

**Meaning**: Strategy performance depends heavily on market conditions. What works now may not work if conditions change (trending → ranging, low vol → high vol).

### Low Win Rates
- **Expect**: 25-38% win rate
- **Means**: Lose 6-8 out of 10 trades
- **Strategy works via**: High profit factor (big wins, small losses)
- **Psychologically**: Very difficult to trade manually

### Thin Margins
- Profit factor: 1.33 (thin)
- Execution costs: 20-30% typical
- **Risk**: Costs could turn profitable → unprofitable

---

## 🧪 Phase 2 Testing Plan

### Build Phase (3-4 weeks)
- Implement 10 remaining components
- Integration testing
- Sandbox API validation

### Testing Phase (30-60 days MINIMUM)
- Run with virtual capital in sandbox
- Collect minimum 60 trades
- Monitor cost-adjusted metrics
- **Do NOT compress this window**

### Decision Criteria (Pre-Committed)
**Cost-Adjusted Profit Factor**:
- `> 1.2`: Continue, strategy viable ✅
- `1.0-1.2`: Marginal, risky ⚠️
- `< 1.0`: Stop, doesn't work ❌

**Will NOT adjust these thresholds after seeing results**

---

## 📊 What to Expect During Testing

### Normal Behavior (Don't Panic)
- ✅ Lots of losing trades (62-75% of trades)
- ✅ Losing streaks of 5-10 trades
- ✅ Bad weeks (some weeks net negative)
- ✅ Low daily win rate

### Actual Problems (Take Action)
- ❌ Circuit breaker triggers frequently (>3 times)
- ❌ Kill switch needed (technical failure)
- ❌ Cost-adjusted PF < 1.0 over 30+ trades
- ❌ Orders failing, system unstable

### Focus On
1. **Cost-adjusted profit factor** (the ONLY metric that matters)
2. Execution quality (fills, slippage, spreads)
3. Technical reliability (uptime >99%)
4. Cost structure accuracy

---

## 📁 Project Structure

```
src/
├── backtest/          # Phase 1 backtesting (complete)
├── data/              # Data fetching, WebSocket (partial)
├── execution/         # Order management (exists, needs enhancement)
├── risk/              # Risk management (exists, needs enhancement)
├── strategy/          # ORB + Golden Ratio strategies (complete)
├── utils/             # Logging, config, utilities (complete)
└── bot/               # Phase 2 bot engine (to be built)

config/
└── config.json        # Configuration file

data/                  # Historical data + backtest results
logs/                  # Trade logs
```

---

## 🔑 Key Files

### Configuration
- `config/config.json` - API credentials, strategy parameters

### Phase 1 Results
- `BACKTEST_RESULTS_2026.md` - Current market backtest analysis

### Phase 2 Plans
- `PHASE2_IMPLEMENTATION.md` - Complete architecture and plan
- `PHASE2_STATUS.md` - Current progress tracker
- `PHASE2_EXPECTATIONS.md` - What to expect during testing

### Guides
- `QUICKSTART.md` - 5-minute quick start
- `SETUP.md` - Detailed setup instructions
- `FAQ.md` - Common questions
- `ARCHITECTURE.md` - System design

---

## 🎓 Key Learnings

1. **Always use current data** - Markets change, old data misleads
2. **Pre-commit decision criteria** - Set thresholds before seeing results
3. **Cost tracking is critical** - Thin edges need accurate measurement
4. **Sample size matters** - Need 30-60 days minimum
5. **Be ready to fail** - If costs erase edge, stop honestly
6. **Low win rates are normal** - Strategy works via profit factor
7. **Regime dependency is real** - Performance varies with conditions

---

## 🚨 Risk Warnings

### Before Phase 2 Testing
- ✅ Phase 1 validation complete (done)
- ⏳ Phase 2 sandbox testing required
- ❌ Do NOT skip to live trading

### Before Live Trading (If Phase 2 Passes)
- ✅ 60+ sandbox trades completed
- ✅ Cost-adjusted PF > 1.2
- ✅ No technical issues
- ✅ All risk management validated
- ✅ Starting with minimum capital

### Remember
- Past performance ≠ future returns
- Backtest assumes perfect execution
- Real trading has costs and friction
- Strategy may stop working if regime changes
- You can lose all capital

---

## 📞 Getting Help

### Documentation
- This guide (comprehensive overview)
- `QUICKSTART.md` (get started fast)
- `FAQ.md` (common questions)
- `SETUP.md` (detailed setup)

### Issues
- Technical problems → Check logs in `logs/`
- Strategy questions → See `BACKTEST_RESULTS_2026.md`
- Setup issues → See `SETUP.md` troubleshooting

---

## 🎯 Success Metrics

### Phase 1 (Complete) ✅
- Backtest on current data
- Train/test split validation
- Statistical edge confirmed
- Strategy selected

### Phase 2 (In Progress) 🟡
- Build all components
- 30-60 day sandbox run
- Cost-adjusted PF > 1.2
- Technical reliability proven

### Phase 3 (Future) ⏹️
- Only if Phase 2 succeeds
- Small-scale live trading
- Continuous monitoring
- Ready to stop if edge disappears

---

**Current Status**: Foundation built, continuing implementation  
**Next Milestone**: Phase 2 build complete (3-4 weeks)  
**Next Decision**: After 30-60 days sandbox testing
