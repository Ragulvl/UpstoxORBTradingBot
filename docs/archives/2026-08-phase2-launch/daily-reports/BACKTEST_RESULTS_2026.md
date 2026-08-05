# Phase 1 Backtest Results - 2026 Market Data (CURRENT)

**Date**: July 31, 2026  
**Data Source**: Upstox Historical Candle API (Production)  
**Data Period**: February 1, 2026 to July 31, 2026 (CURRENT 6 months)  
**Trading Days**: 121 days each for NIFTY and BANKNIFTY  
**Capital**: ₹100,000  
**Instruments Tested**: NIFTY 50, BANKNIFTY  
**Strategies Tested**: ORB (Opening Range Breakout), GOLDEN_RATIO (61.8% Fibonacci + ORB)  
**Validation Method**: Train/Test Split (70/30) - Anti-Overfitting Check

---

## ⚠️ CRITICAL FINDING: Market Conditions Matter

**2024 Data (Feb-Jul 2024)**: Only 1 of 4 strategies passed → NIFTY Golden Ratio  
**2026 Data (Feb-Jul 2026)**: All 4 of 4 strategies passed → Everything worked

**This demonstrates that trading strategy performance is highly dependent on market regime.**

---

## ✅ VALIDATION WITH CURRENT MARKET DATA

###Results on 2026 Data (Current Market):

### NIFTY 50

#### ORB Strategy ✅ PASSED
- **Training Period**: 4/5 (28.70% win rate, 1.61 profit factor, 25% total P&L)
- **Testing Period**: 4/5 (22.22% win rate, 1.14 profit factor, 3% total P&L)  
- **Total Trades**: 169 (115 train, 54 test)
- **Verdict**: **✅ PROCEED TO PHASE 2**
- **Edge**: Confirmed on current data, both periods

#### GOLDEN RATIO Strategy ✅ PASSED
- **Training Period**: 3.5/5 (38.05% win rate, 2.46 profit factor, 51% total P&L)
- **Testing Period**: 3.5/5 (25.00% win rate, 1.33 profit factor, 6.5% total P&L)
- **Total Trades**: 165 (113 train, 52 test)
- **Verdict**: **✅ PROCEED TO PHASE 2**
- **Edge**: Confirmed on current data, both periods

---

### BANKNIFTY

#### ORB Strategy ✅ PASSED
- **Training Period**: 4/5
- **Testing Period**: 3.5/5
- **Verdict**: **✅ PROCEED TO PHASE 2**
- **Edge**: Confirmed on current data, both periods

#### GOLDEN RATIO Strategy ✅ PASSED  
- **Training Period**: 4/5
- **Testing Period**: 3.5/5
- **Verdict**: **✅ PROCEED TO PHASE 2**
- **Edge**: Confirmed on current data, both periods

---

## 📊 COMPARISON: 2024 vs 2026 Market Conditions

| Strategy | 2024 Result | 2026 Result | Change |
|----------|-------------|-------------|--------|
| NIFTY ORB | ❌ Failed (1.5-2/5) | ✅ Passed (4/5) | +200% improvement |
| NIFTY Golden Ratio | ✅ Passed (3.5-4/5) | ✅ Passed (3.5/5) | Consistent |
| BANKNIFTY ORB | ❌ Failed (1/5) | ✅ Passed (3.5-4/5) | +250% improvement |
| BANKNIFTY Golden Ratio | ❌ Failed (1.5/5) | ✅ Passed (3.5-4/5) | +133% improvement |

**Pass Rate**:
- 2024 Data: 25% (1 of 4)
- 2026 Data: 100% (4 of 4)

---

## 🔍 HONEST ASSESSMENT

### What This Means

1. **Market Regime Matters** ⚠️
   - Same strategies, drastically different results
   - 2024 was likely a difficult market for ORB (choppy, range-bound, or high false breakouts)
   - 2026 appears to be better trending conditions favorable to breakout strategies
   - **Critical**: This edge could disappear if market conditions change again

2. **Low Win Rates Across the Board** ⚠️
   - NIFTY ORB: 22-29% win rate
   - NIFTY Golden Ratio: 25-38% win rate
   - These are **very low** - you'll lose 60-75% of individual trades
   - Strategies work via high profit factor (big wins, small losses)
   - **Psychologically brutal** to run - long losing streaks expected

3. **Sample Size Still Thin** ⚠️
   - 165-169 trades total per strategy
   - Only 52-54 trades in test period
   - Marginally acceptable, not strong
   - A few bad trades can swing results significantly

4. **Test Period Performance Weaker** ⚠️
   - All strategies showed degradation from train to test
   - NIFTY ORB: 25% → 3% total P&L (88% drop)
   - Win rates dropped in test periods
   - Profit factors compressed
   - **This is realistic** - strategies degrade on unseen data

### Red Flags to Consider

🚩 **Regime Dependency**: Complete flip from 2024 to 2026 suggests strategies are highly sensitive to market conditions

🚩 **Low Win Rates**: 22-38% means 6-8 losing trades before 1 winner (on average)

🚩 **Test Degradation**: All strategies performed worse on unseen data (expected, but concerning)

🚩 **Thin Margins**: Some test period scores barely passed (3.5/5 threshold)

🚩 **Recency Bias**: Current data shows everything working - doesn't mean it will continue

---

## 📈 DETAILED METRICS (2026 Data)

### NIFTY ORB (Current Best Performer on Test)
```
Training (84 days):
  Trades: 115
  Win Rate: 28.70%
  Avg Win: ~2%
  Avg Loss: ~-0.5%
  Profit Factor: 1.61
  Total P&L: +25%
  Max Drawdown: 7%
  
Testing (37 days):
  Trades: 54
  Win Rate: 22.22%
  Avg Win: ~2%
  Avg Loss: ~-0.5%
  Profit Factor: 1.14
  Total P&L: +3%
  Max Drawdown: 7.5%
```

**Interpretation**:
- Barely profitable on test data (3% over 37 days)
- 1.14 profit factor is thin (needs only 1.0 to break even)
- One bad week could wipe out monthly gains
- **Viable but fragile**

### NIFTY Golden Ratio
```
Training (84 days):
  Trades: 113
  Win Rate: 38.05%
  Avg Win: ~2%
  Avg Loss: ~-0.5%
  Profit Factor: 2.46 (STRONG)
  Total P&L: +51%
  Max Drawdown: 3%
  
Testing (37 days):
  Trades: 52
  Win Rate: 25.00%
  Avg Win: ~2%
  Avg Loss: ~-0.5%
  Profit Factor: 1.33
  Total P&L: +6.5%
  Max Drawdown: 4.5%
```

**Interpretation**:
- Stronger on training data (51% return)
- Significant degradation on test (6.5% return)
- 1.33 profit factor is better than ORB but still thin
- **More robust than ORB but still regime-dependent**

---

## 🎯 HONEST RECOMMENDATIONS

### For Phase 2 Sandbox Testing

**Primary Strategy**: NIFTY Golden Ratio
- Showed consistency across 2024 and 2026 data
- Better profit factor than ORB (1.33 vs 1.14)
- Lower drawdown (4.5% vs 7.5%)
- More predictable behavior

**Secondary Strategy**: NIFTY ORB (Optional)
- Currently working on 2026 data
- Failed on 2024 data
- Higher regime risk
- Can test in parallel to compare

**Not Recommended Yet**: BANKNIFTY strategies
- Higher volatility
- Less liquidity on options
- More prone to false breakouts
- Save for Phase 3 if NIFTY proves successful

### Realistic Expectations for Phase 2

**If 2026 market conditions persist**:
- Expect 25-30% win rate (7-8 losses per 10 trades)
- Expect long losing streaks (5-10 consecutive losses possible)
- Expect 3-6.5% monthly returns (test period performance)
- Expect drawdowns of 4-7%

**If market conditions change**:
- Strategy could stop working (like 2024)
- Need to monitor and be ready to stop
- Edge may disappear without warning

### Phase 2 Success Criteria (ADJUSTED)

Don't just compare to backtest - watch for these signals:

✅ **Continue if:**
- Profit factor stays above 1.2 in sandbox
- Losing streaks don't exceed 15 trades
- Monthly returns remain positive
- Execution costs < 20% of edge

⚠️ **Investigate if:**
- Profit factor drops below 1.2
- Losing streaks exceed 15 trades
- Two consecutive losing months
- Execution costs > 20% of edge

❌ **Stop if:**
- Profit factor drops below 1.0
- Three consecutive losing months
- Drawdown exceeds 15%
- Execution makes strategy unprofitable

---

## 🔬 What We Learned

### 1. Market Regime Matters More Than Strategy
- Same strategies, completely different results in different periods
- 2024: choppy/range-bound (ORB failed)
- 2026: trending/breakout-friendly (ORB worked)
- **You're betting on market conditions continuing, not just strategy logic**

### 2. Backtests Are Regime-Specific
- A "pass" on one period doesn't guarantee future performance
- Need to understand WHY strategies work (market structure)
- Should monitor regime changes (volatility, trending vs ranging)

### 3. Low Win Rates Are Psychologically Hard
- 22-38% win rate means you lose most days
- Requires discipline to keep trading during losing streaks
- Many traders abandon working strategies during drawdowns

### 4. Test Period Tells the Truth
- All strategies degraded from train to test
- This is realistic and expected
- Train performance is optimistic; test is realistic

---

## 📊 Trade Statistics (2026 Data)

### Total Trades Analyzed: ~680 trades
- NIFTY ORB: 169 trades (115 train, 54 test)
- NIFTY Golden Ratio: 165 trades (113 train, 52 test)
- BANKNIFTY strategies: ~346 trades combined

### Average Trade Outcomes:
- **Stop Loss Hit**: ~65-75% of trades (-0.5% each)
- **Target Hit**: ~25-35% of trades (+2% each)
- **Time Exit**: Minimal (most hit stop or target)

### Math Check (NIFTY Golden Ratio Test Period):
```
52 trades, 25% win rate
Wins: 13 trades × 2% = +26%
Losses: 39 trades × -0.5% = -19.5%
Net: +6.5%  ✓ Matches reported result
```

This is how low-win-rate strategies work: fewer big wins offset many small losses.

---

## ⚠️ CRITICAL WARNINGS

### Before Phase 2

1. **Regime Change Risk**
   - Strategies are working NOW (2026)
   - Failed BEFORE (2024)
   - Could fail AGAIN if conditions change
   - Need ongoing monitoring

2. **Sample Size Limitation**
   - 52-54 trades in test period is thin
   - A few bad trades materially impact results
   - Need more data to build confidence

3. **Execution Will Reduce Edge**
   - Backtest assumes perfect fills
   - Real trading has slippage, spreads, latency
   - Expect 10-30% reduction in performance
   - May turn 3% backtest gain into breakeven

4. **Psychological Challenge**
   - Losing 7 out of 10 trades is brutal
   - Streaks of 10+ losses are likely
   - Most traders quit during drawdowns
   - Need extreme discipline

### During Phase 2 Sandbox

**Watch for these failure modes:**

1. **Option Liquidity Issues**
   - Wide bid-ask spreads on illiquid strikes
   - Can't get filled at model prices
   - Slippage destroys edge

2. **Execution Latency**
   - Breakout detected → order sent → price moved
   - Miss entries or get worse fills
   - Reduces profitability

3. **Market Condition Change**
   - Volatility shifts
   - Trending stops, ranging begins
   - Strategies stop working

4. **Risk Management Failures**
   - Stop losses don't fire in gaps
   - System fails during critical moments
   - Larger losses than modeled

---

## 📁 FILES

**Current 2026 Backtest**:
- `data/backtest_enhanced_orb_2026-07-31_14-34-54.json` - Full 2026 trade log

**Historical 2024 Backtest** (for comparison):
- Results documented in previous session (no longer in data folder)

**Market Data**:
- `data/NIFTY_2026-*.json` - 121 files (Feb-Jul 2026)
- `data/BANKNIFTY_2026-*.json` - 121 files (Feb-Jul 2026)

---

## 🎓 LESSONS LEARNED

### 1. Always Test on Current Data
- Historical data from 2 years ago is stale
- Market conditions change
- **Always use most recent 6 months**

### 2. Regime Dependency is Real
- Strategies that fail in one regime can work in another
- Understand market structure (trending vs ranging)
- Monitor for regime changes continuously

### 3. Test Period is the Truth
- Train performance is optimistic
- Test performance is realistic
- Expect live performance between test and slightly worse

### 4. Low Win Rate Strategies Require Discipline
- Works mathematically
- Fails psychologically for most traders
- Need automated execution or extreme discipline

---

## 🚀 PHASE 2 PLAN (REVISED)

### Primary Recommendation: NIFTY Golden Ratio

**Why**:
- Worked in both 2024 and 2026 (most consistent)
- Better risk-adjusted returns
- Lower drawdown
- More robust across regime changes

**Phase 2 Approach**:
1. Build sandbox bot for NIFTY Golden Ratio only
2. Run for 20+ trading days (40+ trades minimum)
3. Calculate actual profit factor and win rate
4. Measure execution costs (slippage, spreads)
5. Compare to test period expectations (6.5% over 37 days)

**Decision Points**:
- If sandbox profit factor > 1.2: Continue testing
- If sandbox profit factor 1.0-1.2: Marginal, investigate execution costs
- If sandbox profit factor < 1.0: Stop, strategy doesn't work with real execution

### Optional: Add NIFTY ORB for Comparison

Only if resources permit - run both strategies in parallel:
- Compare which performs better in current conditions
- See which has better execution quality
- Diversification benefit if uncorrelated

**Don't add BANKNIFTY yet** - save for Phase 3 after NIFTY success.

---

## 🔮 HONEST PREDICTION

### Best Case (20% probability)
- Market conditions stay favorable
- Execution costs are low
- Strategies perform close to test period
- 3-6% monthly returns sustainable
- **Outcome**: Profitable live trading possible

### Realistic Case (60% probability)
- Market conditions fluctuate
- Execution costs reduce edge by 20-30%
- Performance degrades slightly from test
- 1-3% monthly returns, with drawdown periods
- **Outcome**: Marginally profitable or breakeven

### Worst Case (20% probability)
- Market regime changes (like 2024)
- Execution costs significant
- Strategies stop working
- Negative returns, hitting stop criteria
- **Outcome**: Phase 2 fails, need to reassess

---

## ✅ BOTTOM LINE

**Phase 1 Status**: ✅ COMPLETE with current market data

**Key Finding**: All 4 strategies pass validation on 2026 data (vs only 1 on 2024 data)

**Implication**: Strategy performance is highly regime-dependent

**Recommendation**: 
- **Proceed to Phase 2 with NIFTY Golden Ratio** (most consistent)
- Test for 20+ days with realistic expectations
- Monitor closely for regime changes
- Be prepared to stop if conditions change

**Realistic Expectations**:
- Win rate: 25-30% (lose 7 out of 10 trades)
- Monthly return: 3-6% if conditions hold
- Drawdowns: 4-7% expected
- Edge may disappear if market changes

**Critical Success Factors**:
1. Maintaining discipline through losing streaks
2. Keeping execution costs low
3. Market conditions staying favorable
4. Monitoring for regime changes

---

**Document Status**: Updated with current 2026 market data  
**Last Updated**: July 31, 2026  
**Version**: 2.0 (Current Market Analysis)
