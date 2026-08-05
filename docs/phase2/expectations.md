# Phase 2 Expectations - What to Expect During Live Testing

**Document Purpose**: Set realistic expectations for the 30-60 day sandbox testing period  
**Read This**: Before starting to monitor live trades  
**Critical**: Distinguish normal behavior from actual problems

---

## 📊 Normal Behavior (Don't Panic)

### You WILL See These (Expected)

**1. Lots of Losing Trades**
- **Win Rate**: 22-38% (based on backtest)
- **Translation**: 6-8 losses per 10 trades
- **Example Week**: Mon ❌ Tue ❌ Wed ✅ Thu ❌ Fri ❌ = 1 win, 4 losses
- **This is NORMAL** - Strategy works via profit factor, not win rate

**2. Losing Streaks**
- **Expected**: 5-10 consecutive losses possible
- **Math**: With 25% win rate, 10 losses in a row has ~5.6% probability
- **Example**: Could see 2 weeks straight of losses, then 1 big win recovers it
- **This is NORMAL** - High profit factor strategies have long drawdowns

**3. Bad Weeks**
- **Expected**: Some weeks will be net negative
- **Win Rate Math**: Need ~2.5 wins per 10 trades to break even (25% × 4:1 PF)
- **Variance**: Won't hit 25% exactly every week
- **This is NORMAL** - Weekly results will be choppy

**4. Bad Months (Possibly)**
- **Expected**: Could have 1-2 losing months in 60-day test
- **Why**: Small sample size (30-60 trades), high variance
- **Red Flag If**: ALL months negative or cost-adjusted consistently worse
- **This is NORMAL** - Need full period to judge

---

## 🚨 Actual Problems (Take Action)

### You Should Worry If You See:

**1. Daily Loss Circuit Breaker Triggers**
- **What**: -2% daily loss limit hit
- **Expected Frequency**: Should be rare (0-2 times in 60 days)
- **If Frequent**: (>3 times) Something is fundamentally wrong
- **Action**: Investigate why (bad fills, wrong signals, cost miscalculation)

**2. Kill Switch Needed**
- **What**: Manual emergency stop activated
- **Expected Frequency**: Ideally never
- **If Triggered**: Technical failure (orders not canceling, position spiraling, system error)
- **Action**: Fix technical issue before resuming

**3. Cost-Adjusted Profit Factor Trending Below 1.0**
- **What**: After costs, strategy is losing money
- **Over What Period**: Need 30+ trades to be meaningful
- **Trend Matters**: Consistently negative, not just rough patch
- **Action**: Stop testing, strategy doesn't survive real costs

**4. Technical Failures**
- **What**: Orders failing, WebSocket disconnecting constantly, positions not tracked
- **Expected**: Minor issues okay, but should stabilize
- **If Persistent**: Bot not production-ready, fix before continuing
- **Action**: Debug and resolve, ensure 99%+ uptime

---

## 📈 How to Evaluate Progress

### After 10 Trades (Week 2-3)
**Purpose**: Quick sanity check, NOT final judgment

**Check**:
- Are orders executing correctly? ✅
- Are costs being calculated? ✅
- Any technical issues? 🔍
- Cost-adjusted PF > 0.5? (very rough early check) 🔍

**Do NOT**:
- ❌ Conclude strategy works/doesn't work
- ❌ Stop early because of bad results
- ❌ Extend because of good results
- ❌ Adjust parameters

**Just ensure system is working correctly**

---

### After 30 Trades (Week 5-6)
**Purpose**: Interim assessment

**Calculate**:
- Win rate: Is it 20-40% range? ✅
- Raw profit factor: Is it close to backtest (1.3-1.5)? ✅
- Cost-adjusted profit factor: Is it > 1.0? 🔍
- Average cost per trade: Is it < 30% of raw P&L? 🔍

**Decision**:
- **If cost-adjusted PF > 1.2**: Continue to 60 days ✅
- **If cost-adjusted PF 1.0-1.2**: Marginal, continue but watch closely ⚠️
- **If cost-adjusted PF < 1.0**: Strong signal to stop, unless clear fixable issue ❌

**Do NOT**:
- ❌ Make final decision on 30 trades (too small)
- ❌ Get excited by good stretch
- ❌ Get discouraged by bad stretch

---

### After 60 Trades (Week 9-12)
**Purpose**: Final assessment

**Analysis**:
1. **Cost-Adjusted Metrics**
   - Profit factor after all costs
   - Average cost per trade
   - Cost as % of raw P&L

2. **Execution Quality**
   - Fill rate (should be >95%)
   - Average slippage (should be <0.1%)
   - Bid-ask spread costs

3. **Train/Test Split**
   - Split 60 trades into 70/30
   - Calculate edge score on both periods
   - Check for overfitting (again)

4. **Regime Check**
   - Did market conditions change during test?
   - Is strategy still relevant?

**Decision**:
- **Cost-adjusted PF > 1.2**: Consider small-scale live ✅
- **Cost-adjusted PF 1.0-1.2**: Marginal, probably not viable ⚠️
- **Cost-adjusted PF < 1.0**: Strategy doesn't work, stop ❌

---

## 🧠 Mental Model: What Matters vs What Doesn't

### Matters ✅
- **Cost-adjusted profit factor** over full test period
- **Consistency** of edge across train/test splits
- **Technical reliability** (uptime, execution)
- **Cost structure** being accurate and < 30% of raw P&L

### Doesn't Matter (Much) ❌
- Individual trade results
- Daily P&L swings
- Losing streaks < 15 trades
- Weekly results
- Emotions (winning feels good, losing feels bad - irrelevant)

### Example Interpretation

**Scenario 1**: "Had 8 losses in a row this week, should I stop?"
- **Answer**: No. With 25% win rate, 8 losses has 10% probability. Not unusual.
- **Action**: Only worry if cost-adjusted PF trending below 1.0 over 30+ trades.

**Scenario 2**: "First 10 trades, 7 wins! Strategy is amazing!"
- **Answer**: Lucky streak. Don't get excited. 70% win rate won't persist.
- **Action**: Keep testing for full 30-60 days. Early results mean nothing.

**Scenario 3**: "Circuit breaker triggered 4 times in 2 weeks"
- **Answer**: This IS a problem. Should be rare.
- **Action**: Investigate immediately. Check position sizing, stop losses, order execution.

**Scenario 4**: "After 40 trades, cost-adjusted PF is 0.85"
- **Answer**: Strong signal strategy doesn't work with real costs.
- **Action**: Complete to 60 trades to confirm, then likely stop.

---

## 📊 Sample Scenarios

### Good Scenario (Edge Survives)
```
Week 1: -2%, -1%, +3%, -1%, -2% = -3% (2 wins, 3 losses)
Week 2: -2%, +3%, -1%, -2%, +4% = +2% (2 wins, 3 losses)
Week 3: -1%, -2%, -1%, +3%, -2% = -3% (1 win, 4 losses)
Week 4: +4%, -2%, -1%, +3%, -1% = +3% (2 wins, 3 losses)

Monthly: -1% (rough month, 7 wins, 13 losses)
Cost-adjusted PF: 1.25 ✅

Verdict: Keep testing, edge is surviving
```

### Marginal Scenario (Edge Barely Surviving)
```
Week 1: -2%, -1%, +2%, -1%, -2% = -4% 
Week 2: -2%, +2%, -1%, -2%, +3% = 0%
Week 3: -1%, -2%, -1%, +2%, -2% = -4%
Week 4: +3%, -2%, -1%, +2%, -1% = +1%

Monthly: -7% (choppy, 6 wins, 14 losses)
Cost-adjusted PF: 1.08 ⚠️

Verdict: Marginal, risky to proceed
```

### Bad Scenario (Edge Erased by Costs)
```
Week 1: -2%, -1%, +1%, -1%, -2% = -5%
Week 2: -2%, +1%, -1%, -2%, +2% = -2%
Week 3: -1%, -2%, -1%, +1%, -2% = -5%
Week 4: +2%, -2%, -1%, +1%, -1% = -1%

Monthly: -13% (consistently negative)
Raw PF: 1.30 (strategy signals work)
Cost-adjusted PF: 0.82 ❌ (costs erase edge)

Verdict: Stop. Strategy doesn't work with real costs.
```

---

## 🎯 What You're Really Testing

**NOT testing**: "Does the strategy signal work?"
- Backtest already showed signals work (1.33 raw PF)

**ARE testing**: "Do execution costs destroy the edge?"
- Bid-ask spreads
- Slippage
- Transaction costs (brokerage, STT, exchange, GST)
- Real-world friction

**The question**: Is 1.33 raw PF large enough to survive 20-30% cost drag?

**Expected outcomes**:
- Best case: Cost-adjusted PF = 1.2-1.3 (costs ~10-20%) ✅
- Realistic case: Cost-adjusted PF = 1.0-1.2 (costs ~20-30%) ⚠️
- Worst case: Cost-adjusted PF < 1.0 (costs >30%) ❌

**Probability distribution**: 20% best / 60% realistic / 20% worst

---

## 🚦 Traffic Light System

### 🟢 Green (Continue)
- Cost-adjusted PF > 1.2
- Technical reliability > 99%
- Costs < 25% of raw P&L
- No circuit breaker triggers
- Full test period completed

### 🟡 Yellow (Marginal, Watch Closely)
- Cost-adjusted PF 1.0-1.2
- Costs 25-35% of raw P&L
- 1-3 circuit breaker triggers
- Some technical hiccups but stable

### 🔴 Red (Stop)
- Cost-adjusted PF < 1.0
- Costs > 35% of raw P&L
- Frequent circuit breaker triggers (>3)
- Technical failures preventing reliable execution

---

## 🧘 Emotional Management

### Expected Feelings During Test

**Week 1-2**: Excitement, nervousness (ignore - too early)

**Week 3-4**: If losing streak - frustration, doubt (normal with 25% win rate)

**Week 5-6**: If winning streak - overconfidence (variance, not skill)

**Week 7-8**: Impatience to conclude (resist - need full period)

**Week 9-12**: Clarity on whether it's working (finally meaningful sample)

### Discipline Required

**Do**:
- ✅ Trust the process
- ✅ Complete full 30-60 days
- ✅ Focus on cost-adjusted metrics, not emotions
- ✅ Accept losing is part of the strategy

**Don't**:
- ❌ Stop early because of losses
- ❌ Extend because of wins
- ❌ Adjust parameters mid-test
- ❌ Override the bot (circuit breaker/kill switch only)

---

## 📝 Weekly Review Checklist

**Every Friday, review:**

1. **Trades This Week**: ___ wins, ___ losses
2. **Win Rate**: ___% (is it 20-40%?)
3. **Raw P&L**: ₹___ (+__%)
4. **Cost-Adjusted P&L**: ₹___ (+__%)
5. **Average Cost per Trade**: ₹___ (__% of raw)
6. **Circuit Breaker Triggered**: Yes/No
7. **Technical Issues**: None / Minor / Serious
8. **Cumulative Cost-Adjusted PF**: ___ (trend: up/flat/down)

**Interpretation**:
- If costs staying < 30% and PF > 1.0: ✅ On track
- If costs creeping > 30% or PF < 1.0: ⚠️ Warning sign
- If persistent technical issues: 🔧 Fix before continuing

---

## 🎓 Remember

1. **Low win rates are normal** - Strategy works via profit factor
2. **Bad weeks happen** - Variance is high with small samples
3. **Losing streaks happen** - 10+ losses in a row is possible
4. **Early results don't matter** - Need 30-60 trades minimum
5. **Cost-adjusted metrics matter** - Raw P&L is not enough
6. **Technical success ≠ Strategic success** - Bot can work while strategy fails
7. **Regime can change** - What worked in 2026 could stop working
8. **Be ready to stop** - If costs erase edge, accept it honestly

---

**Keep This Document Handy**: Read it when you're tempted to stop early or when you're frustrated by losses.

**The goal isn't to feel good** - it's to collect enough data to make an honest assessment of whether the strategy survives real-world costs.

**Trust the process. Complete the test. Evaluate honestly.**
