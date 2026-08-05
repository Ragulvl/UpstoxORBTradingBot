# New Sandbox App Setup Guide

**Date**: August 4, 2026  
**Purpose**: Generate fresh API Key, Secret, and Access Token for WebSocket connection

---

## Recommended Form Values

### App Name
```
ORB Trading Bot Sandbox
```
*Or: "NIFTY ORB Strategy Bot" or any descriptive name*

### Redirect URL (Required)
```
http://localhost:8080/callback
```
**Important**: This MUST match exactly what's in your `config/config.json` file:
```json
"redirectUri": "http://localhost:8080/callback"
```

### Postback URL (Optional - Leave Empty)
```
(Leave blank)
```
**Note**: "Not applicable for Sandbox apps" - as stated in the form

### Notifier Webhook Endpoint (Optional - Leave Empty)
```
(Leave blank)
```
**Note**: "Not applicable for Sandbox apps" - as stated in the form

### Description
```
Algorithmic trading bot implementing Opening Range Breakout (ORB) and Golden Ratio strategies for NIFTY options. Sandbox environment for testing order placement and strategy validation.
```

---

## After App Creation

### Step 1: Save API Credentials

You'll receive:
- **API Key** (apiKey)
- **API Secret** (apiSecret)

**IMPORTANT**: Copy these immediately - the secret may not be shown again!

### Step 2: Update config.json

Update **THREE** places in `config/config.json`:

```json
{
  "upstox": {
    "apiKey": "YOUR_NEW_API_KEY_HERE",
    "apiSecret": "YOUR_NEW_API_SECRET_HERE",
    "redirectUri": "http://localhost:8080/callback"
  }
}
```

### Step 3: Generate Access Token

**Option A: OAuth Browser Flow** (Recommended)

1. Open this URL in browser (replace YOUR_API_KEY):
   ```
   https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=YOUR_NEW_API_KEY_HERE&redirect_uri=http://localhost:8080/callback
   ```

2. Log in to your Upstox account
3. Authorize the application
4. You'll be redirected to: `http://localhost:8080/callback?code=XXXXXXX`
5. Copy the `code` parameter value

6. Exchange code for access token (run in terminal):
   ```bash
   curl -X POST https://api.upstox.com/v2/login/authorization/token \
     -H 'Content-Type: application/x-www-form-urlencoded' \
     -d 'code=YOUR_CODE_HERE&client_id=YOUR_NEW_API_KEY_HERE&client_secret=YOUR_NEW_API_SECRET_HERE&redirect_uri=http://localhost:8080/callback&grant_type=authorization_code'
   ```

7. Response will contain:
   ```json
   {
     "access_token": "eyJ0eXAiOiJKV1QiLCJ...",
     "expires_in": 86400,
     "token_type": "Bearer"
   }
   ```

8. Copy the `access_token` value

**Option B: Upstox Developer Dashboard**

1. Go to https://upstox.com/developer/apps
2. Click on your newly created app
3. Look for "Generate Token" or similar option
4. Follow on-screen instructions
5. Copy the generated access token

### Step 4: Update config.json with Access Token

Update **THREE** places in `config/config.json` with the same token:

```json
{
  "upstox": {
    "apiKey": "YOUR_NEW_API_KEY",
    "apiSecret": "YOUR_NEW_API_SECRET",
    "redirectUri": "http://localhost:8080/callback",
    "accessToken": "YOUR_NEW_ACCESS_TOKEN_HERE",
    "baseUrl": "https://api.upstox.com/v2",
    "sandboxUrl": "https://api-hft.upstox.com",
    "useSandbox": false,
    "marketData": {
      "useProduction": true,
      "accessToken": "YOUR_NEW_ACCESS_TOKEN_HERE",
      "websocketUrl": "wss://api-v2.upstox.com/feed/market-data-feed/v2"
    },
    "orders": {
      "useSandbox": true,
      "sandboxUrl": "https://api-hft.upstox.com",
      "accessToken": "YOUR_NEW_ACCESS_TOKEN_HERE"
    }
  }
}
```

**Critical**: All three `accessToken` fields must have the SAME token value.

### Step 5: Test Authorize Endpoint

Before starting the bot, verify the token works:

```bash
curl -X GET https://api.upstox.com/v2/feed/market-data-feed/authorize \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer YOUR_NEW_ACCESS_TOKEN_HERE'
```

**Expected Response**:
```json
{
  "status": "success",
  "data": {
    "authorized_redirect_uri": "wss://[dynamic-host]/market-data-feeder/v2/...?requestId=...&code=..."
  }
}
```

**If 401 Error**: Token is invalid, regenerate and try again

**If Success**: You're ready to launch!

### Step 6: Disable Mock Mode

In `config/config.json`:

```json
{
  "websocket": {
    "useMock": false,
    "authorizeUrl": "https://api.upstox.com/v2/feed/market-data-feed/authorize",
    "reconnectDelay": 5000,
    "maxReconnectAttempts": 10
  }
}
```

### Step 7: Launch Bot

```bash
npm run live
```

**Expected Logs**:
```
[INFO] Calling WebSocket authorize endpoint
[INFO] WebSocket authorization successful { url: 'wss://...' }
[INFO] Connecting to authorized WebSocket URL
[INFO] WebSocket connected successfully
[INFO] Subscribed to instruments { instrumentKeys: [ 'NSE_INDEX|Nifty 50' ] }
[INFO] 🤖 Bot is now live and monitoring market
```

### Step 8: Verify Real Ticks

Check logs for actual NIFTY prices (not ~22000 mock prices):

```
[INFO] Tick received {
  instrumentKey: 'NSE_INDEX|Nifty 50',
  ltp: 24523.45,  // This should be actual current NIFTY price
  timestamp: '2026-08-04T09:50:00.000Z'
}
```

---

## Troubleshooting

### Issue: Still Getting 401 After Token Update

**Solution**:
1. Verify token was copied completely (no trailing spaces)
2. Check token expiry - regenerate if expired
3. Ensure all three `accessToken` fields in config match
4. Try regenerating token from scratch

### Issue: "Invalid Redirect URI"

**Solution**:
1. Verify redirect URI in app settings matches config: `http://localhost:8080/callback`
2. Check for extra slashes or spaces
3. Must be EXACT match, case-sensitive

### Issue: WebSocket Connects But No Ticks

**Solution**:
1. Check subscription was successful
2. Verify market is open (09:15 - 15:30 IST)
3. Check instrument key format: `NSE_INDEX|Nifty 50`
4. Look for subscription acknowledgement in logs

### Issue: Token Expires Quickly

**Note**: Some Upstox tokens may require daily refresh despite showing longer expiry. If token stops working:
1. Regenerate token each morning before market open
2. Update all three `accessToken` fields in config
3. Restart bot

---

## Current Config Location

File: `c:\Project\UpstoxORBTradingBot\config\config.json`

Fields to update:
1. Line ~9: `upstox.apiKey`
2. Line ~10: `upstox.apiSecret`
3. Line ~12: `upstox.accessToken`
4. Line ~18: `upstox.marketData.accessToken`
5. Line ~24: `upstox.orders.accessToken`

---

## Security Notes

- **Never commit** API credentials to version control
- The `.env.example` file shows the pattern, but actual credentials go in `config/config.json`
- `config/config.json` should be in `.gitignore` (verify this)
- Access tokens are sensitive - treat like passwords

---

## Success Criteria

✅ New app created in Upstox  
✅ API Key and Secret saved  
✅ Access token generated  
✅ All three tokens in config updated  
✅ Authorize endpoint test passes (returns WebSocket URL)  
✅ Bot starts without 401 errors  
✅ WebSocket connects successfully  
✅ Real NIFTY ticks received (not ~22000 mock)  
✅ Bot runs stable for 5+ minutes  

Once all criteria pass → Bot is ready for Phase 2 observation!

---

**Created**: August 4, 2026, 09:47 AM IST  
**Status**: Waiting for new app credentials from Upstox
