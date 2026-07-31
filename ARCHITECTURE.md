# Architecture Documentation

## Project Overview

This is a rule-based Opening Range Breakout (ORB) trading bot for Indian F&O markets (NSE - Nifty/BankNifty) using the Upstox API. The project follows a phased approach with strict gates between phases.

## Architecture Principles

1. **Safety First**: All safety features are non-negotiable and built into the core
2. **Evidence-Based**: No live trading without proven backtest results
3. **Idempotent Operations**: All critical operations handle failures gracefully
4. **Complete Audit Trail**: Every decision is logged for review
5. **Fail-Safe Defaults**: System defaults to the safest option

## Project Structure

```
upstox-orb-bot/
├── src/
│   ├── backtest/           # Phase 1: Historical backtesting
│   │   ├── backtest-engine.js     # Core backtesting logic
│   │   └── run-backtest.js        # CLI runner
│   │
│   ├── data/               # Data layer
│   │   ├── upstox-client.js       # Upstox API wrapper
│   │   ├── data-cache.js          # Local caching
│   │   └── fetch-historical.js    # Historical data fetcher
│   │
│   ├── strategy/           # Trading strategy
│   │   └── orb-strategy.js        # ORB implementation
│   │
│   ├── execution/          # Phase 2: Order execution
│   │   └── order-manager.js       # Order placement with idempotency
│   │
│   ├── risk/               # Risk management
│   │   └── risk-manager.js        # Circuit breaker, kill switch
│   │
│   └── utils/              # Utilities
│       ├── logger.js              # Audit logging
│       ├── config-loader.js       # Configuration
│       └── date-utils.js          # IST time, holidays, trading days
│
├── config/                 # Configuration
│   └── config.json                # Main config (gitignored)
│
├── data/                   # Cached data & results
│   ├── NIFTY_*.json               # Cached candle data
│   ├── BANKNIFTY_*.json           # Cached candle data
│   └── backtest_*.json            # Backtest results
│
└── logs/                   # Audit logs
    ├── main_*.log                 # General logs
    ├── trades_*.log               # Trade-specific logs
    └── audit_*.log                # Audit trail
```

## Phase Architecture

### Phase 1: Historical Backtest (CURRENT)

**Goal**: Prove the strategy has statistical edge before building live bot

**Components**:
- `BacktestEngine`: Orchestrates backtest execution
- `ORBStrategy`: Implements strategy rules
- `DataCache`: Manages historical data locally
- `UpstoxClient`: Fetches data from Upstox API

**Flow**:
1. Fetch 3-6 months of historical intraday data
2. Cache locally (avoid repeated API calls)
3. Simulate strategy day-by-day
4. Calculate performance metrics
5. Evaluate statistical edge (5-criteria test)
6. **Gate**: Must show edge to proceed to Phase 2

**Success Criteria**:
- Win rate ≥50%
- Profit factor ≥1.5
- Positive expectancy
- Sample size ≥30 trades
- Max drawdown <10%
- Score ≥3.5/5 to pass

### Phase 2: Sandbox Bot (AFTER Phase 1 passes)

**Goal**: Build live bot using sandbox endpoints

**New Components**:
- `OrderManager`: Place/modify/cancel orders with idempotency
- `RiskManager`: Circuit breaker, kill switch, position sizing
- `WebSocketClient`: Real-time price feed
- `BotEngine`: Main orchestrator

**Flow**:
1. Connect to Upstox WebSocket for live data
2. Calculate opening range (9:15-9:30 AM)
3. Monitor for breakouts
4. Place orders via sandbox endpoints
5. Manage positions (stop loss, target, trailing stop)
6. Force close by 3:15 PM
7. Record all activity to audit log

**Safety Features** (implemented):
- Daily loss circuit breaker (cannot be bypassed)
- Manual kill switch (stops all trading immediately)
- Idempotent order handling (no duplicate orders on timeout)
- Max trades per day limit
- No trading after 2:45 PM
- Hard exit by 3:15 PM

### Phase 3: Alerting & Monitoring (AFTER Phase 2)

**Goal**: Real-time visibility into bot activity

**New Components**:
- `TelegramAlert`: Send alerts to Telegram
- `DiscordAlert`: Send alerts to Discord
- `Dashboard`: Web UI for monitoring

**Alerts Sent**:
- Trade entry/exit
- Stop loss hit
- Target achieved
- Daily loss limit reached
- Circuit breaker triggered
- Kill switch activated
- Errors/failures

## Data Flow

### Historical Backtest Flow

```
User → run-backtest.js
         ↓
    BacktestEngine
         ↓
    Load from DataCache ← fetch-historical.js ← UpstoxClient
         ↓
    ORBStrategy (simulate day-by-day)
         ↓
    Calculate metrics
         ↓
    Evaluate edge
         ↓
    Generate report → Save to data/ & logs/
```

### Live Trading Flow (Phase 2+)

```
User → BotEngine
         ↓
    Connect WebSocket ← UpstoxClient
         ↓
    Receive live ticks
         ↓
    ORBStrategy (real-time)
         ↓
    RiskManager.canTrade()? → No → Skip
         ↓ Yes
    OrderManager.placeOrder()
         ↓
    Monitor position
         ↓
    Exit on: stop loss / target / time
         ↓
    RiskManager.recordTrade()
         ↓
    Logger (audit trail)
```

## Strategy Implementation

### Opening Range Breakout (ORB)

**Rules**:
1. Opening range: 9:15-9:30 AM (15 min)
2. Record High and Low during this period
3. After 9:30 AM:
   - If price breaks above High → Enter LONG
   - If price breaks below Low → Enter SHORT
4. Only one direction per day
5. Stop loss: X% below entry (LONG) or above entry (SHORT)
6. Target: Y% above entry (LONG) or below entry (SHORT)
7. Optional: Trailing stop once in profit
8. Hard exit: 3:15-3:20 PM regardless of P&L
9. Daily loss limit: Stop all trading if hit
10. Max 1-2 trades per day

**Parameterization**:
- Opening range duration: 5/10/15/20 minutes (default: 15)
- Stop loss %: 0.5% - 2% (default: 1%)
- Target %: 1% - 3% (default: 2%)
- Trailing stop: on/off + % (default: on, 0.5%)
- Daily loss limit: 1% - 5% of capital (default: 2%)

## Risk Management

### Circuit Breaker

**Trigger Conditions**:
- Daily loss reaches limit (e.g., 2% of capital)
- System error/anomaly detected
- Manual activation

**Actions**:
- Stop all new entries
- Exit open positions immediately (market order)
- Log to audit trail
- Send alert
- Requires manual reset

### Kill Switch

**Purpose**: Emergency stop for manual intervention

**Actions**:
- Immediately halt all trading
- Exit all open positions
- Disable all entry logic
- Log to audit trail
- Send alert
- Requires manual deactivation

### Position Sizing

**Method**: Fixed fractional based on risk per trade

```
Risk per trade = Capital × 2%
Stop loss amount = Entry price × Stop loss %
Position size = Risk per trade / Stop loss amount
```

**Constraints**:
- Never exceed max position size
- Respect lot size from instrument master
- Consider available margin

## Data Management

### Caching Strategy

**Why Cache?**
- Reduce API calls (rate limiting)
- Faster backtest iterations
- Offline development/testing

**What's Cached?**
- Historical intraday candles (1-minute)
- Instrument master data
- Backtest results

**Cache Invalidation**:
- Historical data: Never (immutable)
- Instrument master: Weekly refresh
- Backtest results: Keep all (for comparison)

### Audit Logging

**What's Logged?**
- Every trade decision (entry/exit/skip)
- Price at decision time
- Reason for decision
- Order IDs
- P&L per trade
- Daily summary
- Errors and exceptions
- Safety events (circuit breaker, kill switch)

**Log Levels**:
- `INFO`: Normal operations
- `WARN`: Unusual but handled situations
- `ERROR`: Failures requiring attention
- `TRADE`: Trade-specific events
- `AUDIT`: Security/compliance events

## Configuration

### Environment Variables (.env)

```
UPSTOX_API_KEY=...
UPSTOX_API_SECRET=...
UPSTOX_ACCESS_TOKEN=...
TRADING_CAPITAL=100000
DAILY_LOSS_LIMIT_PERCENT=2
```

### Config File (config/config.json)

```json
{
  "upstox": { ... },      // API settings
  "trading": { ... },     // Trading parameters
  "strategy": { ... },    // Strategy parameters
  "backtest": { ... },    // Backtest settings
  "alerts": { ... },      // Alert settings
  "logging": { ... }      // Log settings
}
```

## Error Handling

### Principles

1. **Fail Safe**: On error, default to NOT trading
2. **No Silent Failures**: All errors logged and alerted
3. **Idempotency**: Operations can be retried safely
4. **Graceful Degradation**: Partial functionality maintained

### Error Categories

**Network Errors** (timeout, connection reset):
- Retry with exponential backoff
- Check order status before retry
- Alert if persistent

**API Errors** (rate limit, auth failure):
- Log error
- Stop trading
- Alert immediately

**Data Errors** (missing candles, gaps):
- Skip that day/period
- Log warning
- Continue with next

**Logic Errors** (bugs in code):
- Stop trading immediately
- Exit positions
- Alert with stack trace

## Testing Strategy

### Phase 1 Testing

✅ **Backtest Validation**:
- Test with known price patterns
- Verify calculations manually
- Compare different parameter sets
- Test edge cases (holidays, gaps, etc.)

### Phase 2 Testing

🚧 **Sandbox Testing**:
- Test order placement/cancellation
- Test idempotency (retry scenarios)
- Test circuit breaker triggers
- Test kill switch activation
- Test hard exit logic

### Phase 3 Testing

🚧 **Alert Testing**:
- Test Telegram delivery
- Test Discord delivery
- Test alert content/formatting

## Future Enhancements

**Strategy Improvements**:
- Add volume filter (enter only if volume > threshold)
- Add volatility filter (skip low/high volatility days)
- Multiple timeframe confirmation
- Support for more instruments (Finnifty, etc.)

**Risk Improvements**:
- Dynamic position sizing based on ATR
- Correlation analysis (avoid correlated positions)
- Weekly/monthly loss limits
- Drawdown-based position reduction

**Technical Improvements**:
- Web dashboard for monitoring
- Historical performance analytics
- Strategy parameter optimization (walk-forward)
- Machine learning for entry timing

## Compliance & Legal

- **Sandbox Only**: This phase uses sandbox endpoints only
- **No Real Money**: Paper trading simulation
- **SEBI Compliance**: Not required (<10 orders/second)
- **Tax**: Keep records for capital gains reporting
- **Broker Terms**: Comply with Upstox terms of service

## References

- [Upstox API Documentation](https://upstox.com/developer/api-documentation)
- [NSE Market Timings](https://www.nseindia.com/market-data/live-market-indices)
- [ORB Strategy Research](https://www.investopedia.com/articles/trading/08/opening-range-breakout.asp)
