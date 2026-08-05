# Configuration Guide

Complete reference for configuring the Upstox ORB Trading Bot.

## Configuration File Location

```
config/config.json
```

**Never commit this file to git** - it contains your API credentials.

## Complete Configuration Structure

```json
{
  "upstox": {
    "apiKey": "YOUR_API_KEY",
    "apiSecret": "YOUR_API_SECRET",
    "accessToken": "YOUR_ACCESS_TOKEN",
    "redirectUri": "http://localhost:8080/callback",
    "useMock": false,
    "useSandbox": true,
    "marketData": {
      "accessToken": "YOUR_ACCESS_TOKEN"
    },
    "orders": {
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  },
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 2,
    "maxTradesPerDay": 2,
    "instruments": ["NIFTY"]
  },
  "strategy": {
    "stopLossPercent": 0.5,
    "targetPercent": 2.0,
    "goldenRatio": 0.618,
    "openingRangeDuration": 15
  },
  "costs": {
    "brokeragePerLot": 20,
    "sttPercent": 0.0625,
    "exchangeChargesPercent": 0.053,
    "gstPercent": 18,
    "sebiFeePercent": 0.0001,
    "stampDutyPercent": 0.003
  },
  "bot": {
    "dataRefreshInterval": 5000,
    "stateExportInterval": 5000
  }
}
```

## Section-by-Section Breakdown

### 1. Upstox API Configuration

```json
{
  "upstox": {
    "apiKey": "YOUR_API_KEY",
    "apiSecret": "YOUR_API_SECRET",
    "accessToken": "YOUR_ACCESS_TOKEN",
    "redirectUri": "http://localhost:8080/callback",
    "useMock": false,
    "useSandbox": true
  }
}
```

**apiKey** (required)
- Your Upstox API key from developer portal
- Format: UUID (e.g., `c6ea6899-da80-4a2f-9763-23a12e1262e5`)
- Get from: https://upstox.com/developer/apps

**apiSecret** (required)
- Your Upstox API secret
- Format: Short alphanumeric string (e.g., `ev76vnkl0z`)
- Keep this secure!

**accessToken** (required)
- OAuth 2.0 access token
- Format: JWT token (200-300 characters)
- **Expires daily** at 3:30 AM IST
- Must be regenerated every morning

**redirectUri** (required for token generation)
- OAuth callback URL
- Default: `http://localhost:8080/callback`
- Must match the redirect URI in your Upstox app settings

**useMock** (boolean, default: false)
- `true`: Use simulated market data (safe testing)
- `false`: Use real market data from Upstox

**useSandbox** (boolean, default: true)
- `true`: Use sandbox endpoints (paper trading)
- `false`: Use production endpoints (real trading)
- ⚠️ Only set to false when absolutely ready for live trading

### 2. Market Data Configuration

```json
{
  "upstox": {
    "marketData": {
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

**Same access token** as main configuration. Required for WebSocket connection.

### 3. Order Execution Configuration

```json
{
  "upstox": {
    "orders": {
      "accessToken": "YOUR_ACCESS_TOKEN"
    }
  }
}
```

**Same access token** as main configuration. Required for placing orders.

---

### 4. Trading Parameters

```json
{
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 2,
    "maxTradesPerDay": 2,
    "instruments": ["NIFTY"]
  }
}
```

**capital** (number, required)
- Starting capital in rupees
- Used for position sizing
- Default: ₹1,00,000
- Recommendation: Start with actual capital amount

**dailyLossLimitPercent** (number, required)
- Circuit breaker threshold
- If daily loss reaches this %, bot stops trading
- Range: 1-5%
- Default: 2%
- Conservative: 1%, Aggressive: 3-5%

**maxTradesPerDay** (number, required)
- Maximum number of trades allowed per day
- Range: 1-5
- Default: 2
- Prevents overtrading

**instruments** (array of strings, required)
- Which instruments to trade
- Options: `["NIFTY"]`, `["BANKNIFTY"]`, `["NIFTY", "BANKNIFTY"]`
- Default: `["NIFTY"]`
- Start with one instrument to reduce complexity

---

### 5. Strategy Parameters

```json
{
  "strategy": {
    "stopLossPercent": 0.5,
    "targetPercent": 2.0,
    "goldenRatio": 0.618,
    "openingRangeDuration": 15
  }
}
```

**stopLossPercent** (number, required)
- Stop loss as percentage of entry price
- Range: 0.3-2.0%
- Default: 0.5%
- Tighter stop = more stopped out, Wider stop = larger losses
- **Current backtest optimized**: 0.5%

**targetPercent** (number, required)
- Target profit as percentage of entry price
- Range: 1.0-5.0%
- Default: 2.0%
- **Current backtest optimized**: 2.0%
- Gives 4:1 reward:risk ratio

**goldenRatio** (number, required)
- Fibonacci level for entry calculation
- Range: 0.382-0.618
- Default: 0.618 (Golden Ratio)
- Other options: 0.5 (midpoint), 0.382 (minor Fib)
- **Do not change** unless you understand Fibonacci trading

**openingRangeDuration** (number, required)
- Duration of opening range in minutes
- Range: 5-30 minutes
- Default: 15 minutes
- Options: 5 (aggressive), 15 (standard), 30 (conservative)
- Shorter = more trades, Longer = fewer trades

---

### 6. Cost Configuration

```json
{
  "costs": {
    "brokeragePerLot": 20,
    "sttPercent": 0.0625,
    "exchangeChargesPercent": 0.053,
    "gstPercent": 18,
    "sebiFeePercent": 0.0001,
    "stampDutyPercent": 0.003
  }
}
```

**brokeragePerLot** (number)
- Brokerage charged per lot per trade
- Default: ₹20 (Upstox standard for options)
- Check your broker's actual charges
- Some brokers: ₹0 (discount brokers), ₹20-50 (traditional)

**sttPercent** (number)
- Securities Transaction Tax
- Default: 0.0625% (for options)
- This is mandated by government - don't change

**exchangeChargesPercent** (number)
- NSE charges
- Default: 0.053%
- Changes occasionally - verify current rate

**gstPercent** (number)
- GST on brokerage and charges
- Default: 18%
- Government mandated - don't change

**sebiFeePercent** (number)
- SEBI regulatory fee
- Default: 0.0001%
- Government mandated - don't change

**stampDutyPercent** (number)
- State stamp duty
- Default: 0.003%
- Varies by state - check your state's rate

---

### 7. Bot Settings

```json
{
  "bot": {
    "dataRefreshInterval": 5000,
    "stateExportInterval": 5000
  }
}
```

**dataRefreshInterval** (number, milliseconds)
- How often to refresh market data
- Default: 5000 (5 seconds)
- Range: 1000-30000 (1-30 seconds)
- Lower = more real-time, higher = less API load

**stateExportInterval** (number, milliseconds)
- How often to export state for dashboard
- Default: 5000 (5 seconds)
- Range: 1000-30000 (1-30 seconds)
- Dashboard refresh rate depends on this

---

## Token Management

### Daily Token Generation

Access tokens **expire daily** at 3:30 AM IST. You MUST generate a fresh token every morning.

**Automated Method (Recommended)**:

Run the helper script:
```bash
get-started.bat
```

Follow the prompts to generate and update your token.

**Manual Method**:

1. Open this URL in browser (replace YOUR_API_KEY):
   ```
   https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_API_KEY&redirect_uri=http://localhost:8080/callback
   ```

2. Login and authorize

3. Copy the `code` from the redirect URL

4. Use PowerShell to exchange for token:
   ```powershell
   $body = @{
       code = "YOUR_CODE"
       client_id = "YOUR_API_KEY"
       client_secret = "YOUR_API_SECRET"
       redirect_uri = "http://localhost:8080/callback"
       grant_type = "authorization_code"
   }
   
   $response = Invoke-RestMethod -Uri "https://api.upstox.com/v2/login/authorization/token" `
       -Method Post `
       -ContentType "application/x-www-form-urlencoded" `
       -Body $body
   
   $response.access_token
   ```

5. Copy the token and update **all three** places in `config.json`:
   - `upstox.accessToken`
   - `upstox.marketData.accessToken`
   - `upstox.orders.accessToken`

### Token Validation

Test your token before trading:

```powershell
$headers = @{
    'Accept' = 'application/json'
    'Authorization' = 'Bearer YOUR_TOKEN_HERE'
}

Invoke-RestMethod -Uri "https://api.upstox.com/v2/feed/market-data-feed/authorize" `
    -Method Get `
    -Headers $headers
```

Expected response:
```json
{
  "status": "success",
  "data": {
    "authorized_redirect_uri": "wss://..."
  }
}
```

If you get 401 error, your token is invalid or expired.

---

## Configuration Profiles

### Conservative Trading

```json
{
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 1,
    "maxTradesPerDay": 1,
    "instruments": ["NIFTY"]
  },
  "strategy": {
    "stopLossPercent": 0.3,
    "targetPercent": 1.5,
    "goldenRatio": 0.618,
    "openingRangeDuration": 30
  }
}
```

- Tight stop loss (0.3%)
- Single trade per day
- Longer opening range (30 min)
- Lower daily loss limit (1%)

### Standard Trading (Recommended)

```json
{
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 2,
    "maxTradesPerDay": 2,
    "instruments": ["NIFTY"]
  },
  "strategy": {
    "stopLossPercent": 0.5,
    "targetPercent": 2.0,
    "goldenRatio": 0.618,
    "openingRangeDuration": 15
  }
}
```

- Balanced risk (0.5% stop, 2% target)
- 2 trades per day max
- Standard 15-minute opening range
- **This is backtest-optimized configuration**

### Aggressive Trading

```json
{
  "trading": {
    "capital": 100000,
    "dailyLossLimitPercent": 3,
    "maxTradesPerDay": 3,
    "instruments": ["NIFTY", "BANKNIFTY"]
  },
  "strategy": {
    "stopLossPercent": 1.0,
    "targetPercent": 3.0,
    "goldenRatio": 0.618,
    "openingRangeDuration": 5
  }
}
```

- Wider stops (1%), bigger targets (3%)
- Multiple instruments
- Short opening range (5 min)
- Higher daily loss tolerance (3%)

⚠️ **Not recommended** until you have proven edge with standard configuration.

---

## Environment-Specific Settings

### Development/Testing

```json
{
  "upstox": {
    "useMock": true,
    "useSandbox": true
  }
}
```

- Use mock data for testing
- Sandbox endpoints
- No real money at risk

### Sandbox Trading (Phase 2)

```json
{
  "upstox": {
    "useMock": false,
    "useSandbox": true
  }
}
```

- Real market data
- Sandbox order execution (paper trading)
- No real money at risk

### Live Trading (Phase 3)

```json
{
  "upstox": {
    "useMock": false,
    "useSandbox": false
  }
}
```

- Real market data
- Real order execution
- **REAL MONEY AT RISK**
- Only use after extensive sandbox validation

---

## Validation

Before starting the bot, validate your configuration:

```bash
npm run verify
```

This checks:
- ✅ Config file exists and is valid JSON
- ✅ All required fields are present
- ✅ Access token is valid
- ✅ WebSocket authorization works
- ✅ Instrument symbols are correct

If validation fails, check the error message and fix the issue.

---

## Common Configuration Mistakes

### 1. Incomplete Access Token

❌ **Wrong**:
```json
{
  "accessToken": "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza_...."
}
```

✅ **Correct**:
```json
{
  "accessToken": "eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI2NENMVkoiLCJqdGkiOiI2YTZjNWUyYTFmNTQ4YzJiY2QwZGRjZjkiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6dHJ1ZSwiaWF0IjoxNzg1NDg2ODkwLCJpc3MiOiJ1ZGFwaS1nYXRld2F5LXNlcnZpY2UiLCJleHAiOjE3ODgwNDA4MDB9.WMM-MC1HVqvMYJDG3GJStfpmWMmC7uwqilduovALRiU"
}
```

Complete JWT token with three parts separated by dots.

### 2. Missing Token in Multiple Places

The same token must be in **three** places:
- `upstox.accessToken`
- `upstox.marketData.accessToken`
- `upstox.orders.accessToken`

### 3. Forgetting Daily Token Update

Access tokens expire at 3:30 AM IST. **You must generate a fresh token every morning.**

### 4. Using Production in Development

Always start with `useSandbox: true` until you're absolutely ready for live trading.

---

## Security Best Practices

1. **Never commit config.json to git**
   - It's in `.gitignore` by default
   - Double-check before pushing code

2. **Use environment variables for CI/CD**
   ```bash
   UPSTOX_API_KEY=xxx
   UPSTOX_API_SECRET=xxx
   UPSTOX_ACCESS_TOKEN=xxx
   ```

3. **Regenerate API credentials if leaked**
   - Delete old app in Upstox portal
   - Create new app with new credentials

4. **Use sandbox mode for testing**
   - Never test with production endpoints
   - Always validate in sandbox first

---

## Related Documentation

- [Getting Started](/docs/getting-started/README.md) - Initial setup guide
- [Daily Checklist](/docs/operations/daily-checklist.md) - Daily routine including token generation
- [Troubleshooting](/docs/troubleshooting/faq.md) - Common configuration issues
- [Upstox API Docs](https://upstox.com/developer/api-documentation) - Official API reference

---

*Last Updated: August 4, 2026*
