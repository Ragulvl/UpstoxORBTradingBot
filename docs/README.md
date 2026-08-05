# Documentation Index

Welcome to the Upstox ORB Trading Bot documentation!

## 📖 Table of Contents

### 🚀 Getting Started
Start here if you're new to the project.

- **[Getting Started Guide](getting-started/README.md)** - Complete setup from scratch
- **[Configuration Guide](getting-started/configuration.md)** - All configuration options explained
- **[Complete Guide](getting-started/complete-guide.md)** - In-depth strategy and usage guide

**Quick Links**:
- [5-Minute Quick Start](getting-started/README.md#option-1-i-want-to-run-it-now-5-minutes)
- [Full Setup with Real Data](getting-started/README.md#option-2-full-setup-with-real-market-data-30-minutes)
- [Daily Token Generation](getting-started/configuration.md#daily-token-generation)

---

### 📋 Operations
Day-to-day operational procedures and checklists.

- **[Daily Checklist](operations/daily-checklist.md)** - Your morning routine before trading
- **[Morning Routine](operations/morning-routine.md)** - Critical 9:05 AM steps (token + kill switch)
- **[Pre-Launch Verification](operations/pre-launch-verification.md)** - Pre-trading safety checks
- **[Kill Switch Fragility Analysis](operations/kill-switch-fragility-analysis.md)** - Known issues with emergency stop

**Daily Must-Do**:
1. 9:05 AM: Generate fresh access token
2. 9:05 AM: Test kill switch
3. 9:10 AM: Start bot (only if above pass)

---

### 🔬 Phase 2 Validation
Understanding Phase 2 and what to expect.

- **[Phase 2 Overview](phase2/README.md)** - What is Phase 2? Why are we doing this?
- **[Expected Behavior](phase2/expectations.md)** - What to expect during validation period
- **[Quick Start](phase2/quick-start.md)** - How to run Phase 2 bot
- **[Running Guide](phase2/running.md)** - Detailed operational guide
- **[Implementation Details](phase2/implementation.md)** - Technical architecture

**Phase 2 Goal**: Answer the question: *"Does the 1.33 profit factor survive real-world execution costs?"*

**Expected Timeline**: 30-60 trading days, 20-40 actual trades needed for valid statistics

---

### 🏗️ Architecture
System design and technical details.

- **[Architecture Overview](architecture/overview.md)** - Complete system architecture
- Components breakdown (coming soon)
- Data flow diagrams (coming soon)
- Strategy implementation details (coming soon)

**Key Design Principles**:
- Safety First (circuit breakers, kill switch, audit trail)
- Evidence-Based (no live trading without proven edge)
- Idempotent Operations (handle failures gracefully)
- Fail-Safe Defaults (defaults to NOT trading on errors)

---

### 📊 Dashboard
Real-time monitoring dashboard guide.

- **[Dashboard Overview](dashboard/overview.md)** - What the dashboard shows
- **[Quick Start](dashboard/quick-start.md)** - Getting dashboard running
- **[Technical Implementation](dashboard/technical-implementation.md)** - How it works

**Dashboard Features**:
- Live NIFTY spot price (5-second updates)
- 60-minute rolling price chart
- Opening range visualization
- Golden ratio entry levels
- Live P&L and positions
- Complete cost breakdown
- Emergency kill switch

**Note**: Position panel untested with real trades - expect potential bugs.

---

### 🔌 API Integration
Upstox API integration details.

- WebSocket V3 integration (coming soon)
- REST API usage (coming soon)
- Authentication and token management (coming soon)

**Key Learnings**:
- WebSocket requires 1-second delay after connection before subscribing
- Access tokens expire daily at 3:30 AM IST
- Protobuf parsing uses official Upstox SDK schema
- Cross-verification with REST API achieves <0.003% accuracy

---

### 🛠️ Troubleshooting
Common issues and solutions.

- **[FAQ](troubleshooting/faq.md)** - Frequently asked questions
- **[Sandbox Setup Issues](troubleshooting/sandbox-setup.md)** - Sandbox-specific problems
- WebSocket troubleshooting (coming soon)
- Kill switch issues → See [Operations](operations/kill-switch-fragility-analysis.md)

**Most Common Issues**:
1. **Token expired**: Generate fresh token daily at 9:05 AM
2. **Kill switch not working**: Test daily before trading
3. **WebSocket 401**: Token invalid or expired
4. **No trades today**: Expected! Strategy is selective (2-3 trades/week)

---

### 👨‍💻 Development
For contributors and developers.

- Contributing guide (coming soon)
- Code style guide (coming soon)
- Testing procedures (coming soon)
- Project structure breakdown (coming soon)

---

### 📦 Archives
Historical documentation from development.

- **[2026-08 Phase 2 Launch](archives/2026-08-phase2-launch/README.md)** - Complete launch archive
  - Daily status reports (15 files)
  - WebSocket resolution process (5 files)
  - Build completion reports
  - Verification evidence

**Purpose**: Historical context for troubleshooting and understanding system evolution.

---

## 🗺️ Documentation Map by User Type

### New Users
Never used the bot before? Start here:

1. [Getting Started Guide](getting-started/README.md)
2. [Configuration Guide](getting-started/configuration.md)
3. [Complete Guide](getting-started/complete-guide.md)
4. [FAQ](troubleshooting/faq.md)

### Daily Traders
Ready to trade? Follow this routine:

1. [Daily Checklist](operations/daily-checklist.md) (every morning!)
2. [Morning Routine](operations/morning-routine.md) (9:05 AM critical steps)
3. [Dashboard Guide](dashboard/overview.md) (monitor during day)
4. [Kill Switch Analysis](operations/kill-switch-fragility-analysis.md) (if issues)

### Developers
Want to understand or modify the code?

1. [Architecture Overview](architecture/overview.md)
2. [Phase 2 Implementation](phase2/implementation.md)
3. [Dashboard Technical](dashboard/technical-implementation.md)
4. Development guides (coming soon)

### Troubleshooters
Something not working?

1. [FAQ](troubleshooting/faq.md) (start here)
2. [Troubleshooting Guides](troubleshooting/)
3. [Kill Switch Issues](operations/kill-switch-fragility-analysis.md)
4. [Archives](archives/2026-08-phase2-launch/) (historical context)

---

## 📚 Quick Reference

### Key Files to Know

| File | Purpose |
|------|---------|
| `config/config.json` | Your configuration (API keys, strategy params) |
| `logs/main_*.log` | Complete bot activity log |
| `logs/trades_*.log` | Trade entries/exits only |
| `logs/trades/journal_*.json` | Trade journal for dashboard |
| `data/bot_state.json` | Current bot state (for dashboard) |

### Key Commands

```bash
npm run live          # Start trading bot
npm run dashboard     # Start dashboard server
npm run verify        # Verify configuration
npm run backtest      # Run historical backtest
npm run fetch-data    # Fetch historical data
```

### Daily Routine (Every Trading Day)

**9:05 AM**:
1. Generate fresh access token
2. Update `config.json`
3. Test kill switch

**9:10 AM**:
- Start bot: `npm run live`
- Start dashboard: `npm run dashboard`

**9:15-3:15 PM**:
- Monitor dashboard
- Let bot work

**3:30 PM**:
- Review trade log
- Stop bot and dashboard

---

## 🔗 External Resources

- **[Upstox API Documentation](https://upstox.com/developer/api-documentation)** - Official API docs
- **[Upstox Developer Portal](https://upstox.com/developer/apps)** - Create/manage apps
- **[NSE Market Timings](https://www.nseindia.com/)** - Market schedule and holidays

---

## 🆘 Need Help?

### Common Questions
Check the [FAQ](troubleshooting/faq.md) first - most questions are answered there.

### Setup Issues
See [Getting Started Guide](getting-started/README.md) or [Configuration Guide](getting-started/configuration.md).

### Operational Problems
Check [Daily Checklist](operations/daily-checklist.md) and [Kill Switch Analysis](operations/kill-switch-fragility-analysis.md).

### Technical Deep Dive
See [Architecture](architecture/overview.md) and [Phase 2 Implementation](phase2/implementation.md).

---

## 📝 Documentation Status

### ✅ Complete
- Getting Started guides
- Configuration reference
- Operations checklists
- Phase 2 documentation
- Dashboard guides
- Kill switch analysis
- Archives organized

### 🚧 Coming Soon
- API integration deep dive
- WebSocket troubleshooting
- Development guides
- Testing procedures
- Code style guide
- Contributing guide

---

## 🎯 Key Takeaways

### For Everyone
1. **Token expires daily** - Generate fresh token every morning at 9:05 AM (non-negotiable!)
2. **Test kill switch daily** - Known fragility requires daily verification before trading
3. **Most days have no trades** - 2-3 trades per week is normal, not per day
4. **25-30% win rate is expected** - Lose 7-8 out of 10 trades (psychologically difficult)

### For New Users
1. Start with [Getting Started Guide](getting-started/README.md)
2. Use mock mode first (`useMock: true` in config)
3. Test kill switch before relying on it
4. Read [Phase 2 Expectations](phase2/expectations.md) to understand what's normal

### For Daily Traders
1. Follow [Daily Checklist](operations/daily-checklist.md) religiously
2. Never skip morning routine (token + kill switch test)
3. Monitor dashboard during trading hours
4. Review trade logs after market close

### For Developers
1. Read [Architecture](architecture/overview.md) first
2. Study [Phase 2 Implementation](phase2/implementation.md) for current system
3. Check [Archives](archives/2026-08-phase2-launch/) for historical context
4. Test changes in mock mode extensively

---

## 🗓️ Version History

**Current Version**: Phase 2 - Live Bot with Real-Time Monitoring  
**Last Updated**: August 4, 2026  
**Status**: Ready for validation starting August 5, 2026

**Recent Changes**:
- ✅ Documentation reorganized (48 files → organized structure)
- ✅ 15+ temporal reports archived
- ✅ WebSocket V3 integration complete
- ✅ Real-time dashboard operational
- ✅ Complete execution cost tracking
- ✅ Kill switch implemented (fragile - test daily)

---

**Ready to start?** → [Getting Started Guide](getting-started/README.md)

**Have questions?** → [FAQ](troubleshooting/faq.md)

**Need daily routine?** → [Daily Checklist](operations/daily-checklist.md)

---

*Documentation organized and maintained as of August 4, 2026*
