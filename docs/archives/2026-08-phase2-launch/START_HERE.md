# Quick Start Guide

## Running the Phase 2 Trading Bot + Dashboard

### Step 1: Start the Trading Bot

Open a terminal and run:
```bash
npm run live
```

You should see:
```
🤖 Bot is now live and monitoring market
Press Ctrl+C to stop the bot
```

**Keep this terminal open** - the bot runs continuously.

---

### Step 2: Start the Dashboard

Open a **second terminal** and run:
```bash
npm run dashboard
```

You should see:
```
Dashboard server running at http://localhost:3000
```

---

### Step 3: View the Dashboard

Open your browser and go to:
```
http://localhost:3000
```

You'll see:
- Live bot status
- Current positions
- Risk metrics
- Trade log
- Cost analysis
- System health

---

## What You'll See

### Bot Terminal (Terminal 1)
```
[2026-07-31 16:14:15.031] [INFO] 🤖 Bot is now live and monitoring market
[2026-07-31 16:14:16.028] [INFO] Received tick { ltp: 22000.12, ... }
[2026-07-31 16:14:17.029] [INFO] Candle closed { open: 22000, high: 22001, ... }
...
```

### Dashboard Browser
- **Status**: Bot Running ✅
- **Session**: PRE_MARKET (before 9:15 AM)
- **Trades Today**: 0 / 2
- **Daily P&L**: ₹0.00 (0.00%)
- **Live Updates**: Every 30 seconds

---

## Current Mode: MOCK (Safe for Testing)

⚠️ **The bot is running in MOCK mode**
- Simulated market data
- No real trading
- No broker connections
- Safe to test and explore

All features work **except**:
- Real market data
- Real order execution

All features that **do work**:
- Bot state transitions
- Opening range calculation
- Entry/exit signals
- Position tracking
- **Cost tracking** (Phase 2 core feature)
- Risk management
- Dashboard monitoring

---

## Stopping the Bot

### Stop the Bot (Terminal 1)
Press `Ctrl+C`

You'll see:
```
🛑 Received SIGINT (Ctrl+C) - shutting down gracefully
✅ Bot stopped gracefully
```

### Stop the Dashboard (Terminal 2)
Press `Ctrl+C`

---

## Troubleshooting

### Bot won't start?
```bash
# Check if Node.js is installed
node --version

# Should show: v24.x.x or higher

# Reinstall dependencies
npm install
```

### Dashboard won't start?
```bash
# Check if port 3000 is available
# Windows:
netstat -ano | findstr :3000

# If port is in use, kill the process or change port in dashboard/server.js
```

### No data in dashboard?
- Make sure bot is running (Terminal 1)
- Check `data/bot_state.json` exists
- Dashboard updates every 30 seconds - wait a moment
- Refresh browser (F5)

### Mock data looks weird?
- This is expected - prices move randomly
- Real production mode will use actual market data
- Cost calculations are still accurate

---

## What Happens During Market Hours?

Even in mock mode, the bot follows the real market schedule:

### 9:00 AM - 9:15 AM: Opening Range
- Bot calculates high/low of first 15 minutes
- Sets up potential entry levels
- Dashboard shows "OPENING_RANGE" state

### 9:15 AM - 2:45 PM: Trading Window
- Bot looks for breakout signals
- Can enter max 2 positions per day
- Monitors stop-loss and target levels
- Dashboard shows live P&L

### 3:15 PM: Hard Exit
- All positions force-closed
- Daily summary generated
- Dashboard shows final results

### After 3:30 PM: Post-Market
- Bot goes idle
- Trade journal saved
- Cost analysis updated

---

## Files to Watch

### Logs
```
logs/main_2026-07-31.log       # All bot activity
logs/trades_2026-07-31.log     # Trade entries/exits only
logs/trades/journal_2026-07.json  # Trade journal for dashboard
```

### State
```
data/bot_state.json            # Current bot state (for dashboard)
```

### Configuration
```
config/config.json             # Bot settings (capital, limits, etc.)
```

---

## Next Steps

1. ✅ **Bot is running** - let it run through a full market day
2. ✅ **Dashboard is accessible** - monitor the bot's behavior
3. ⏳ **Observe state transitions** - PRE_MARKET → OPENING_RANGE → TRADING → POST_MARKET
4. ⏳ **Check cost tracking** - verify cost breakdown in dashboard
5. ⏳ **Test kill switch** - click the dashboard kill switch to test emergency stop
6. ⏳ **Review logs** - check `logs/main_*.log` for detailed activity

### When Ready for Production

See `PHASE2_RUNNING.md` for:
- How to disable mock mode
- How to get production access token
- How to enable real trading
- Safety checklist before going live

---

## Questions?

- **Technical details**: See `PHASE2_IMPLEMENTATION.md`
- **Architecture**: See `ARCHITECTURE.md`
- **Bot status**: See `PHASE2_RUNNING.md`
- **Dashboard guide**: See `DASHBOARD.md`

---

**Current Status**: ✅ Phase 2 Complete - Bot Running in Mock Mode

Last Updated: July 31, 2026 16:14 IST
