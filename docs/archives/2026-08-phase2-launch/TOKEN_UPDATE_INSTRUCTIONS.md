# Token Update Instructions

**Status**: API Key and Secret updated ✅  
**Next Step**: Need COMPLETE access token

---

## New Credentials Received

✅ **API Key**: `c6ea6899-da80-4a2f-9763-23a12e1262e5`  
✅ **API Secret**: `ev76vnkl0z`  
⏳ **Access Token**: Incomplete (need full token)  
✅ **Token Expires**: September 3, 2026, 3:30 AM (30 days)

---

## URGENT: Need Complete Access Token

The token you provided was truncated: `eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza_....`

**A complete Upstox JWT token typically looks like this:**
```
eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI2NENMVkoiLCJqdGkiOiI2YTZjNWUyYTFmNTQ4YzJiY2QwZGRjZjkiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6dHJ1ZSwiaWF0IjoxNzg1NDg2ODkwLCJpc3MiOiJ1ZGFwaS1nYXRld2F5LXNlcnZpY2UiLCJleHAiOjE3ODgwNDA4MDB9.WMM-MC1HVqvMYJDG3GJStfpmWMmC7uwqilduovALRiU
```

**It should be 200-300+ characters long** with three parts separated by dots (`.`):
- Part 1: Header (eyJ...)
- Part 2: Payload (long string with user data)
- Part 3: Signature (hash at the end)

---

## How to Get the Complete Token

### From Upstox Dashboard

1. Go to https://upstox.com/developer/apps
2. Find your newly created app: **"ORB Trading Bot Sandbox"**
3. Click to view details
4. Look for **"Access Token"** section
5. Click **"Copy"** or **"Show Token"**
6. **Copy the ENTIRE token** (select all, don't leave any characters out)

### If Token Is Not Visible

If you can't see or copy the full token from the dashboard, you may need to generate it again using OAuth flow:

1. Open this URL in browser (already has your new API key):
   ```
   https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=c6ea6899-da80-4a2f-9763-23a12e1262e5&redirect_uri=http://localhost:8080/callback
   ```

2. Log in and authorize

3. Copy the `code` from redirect URL

4. Run this command (PowerShell):
   ```powershell
   $body = @{
       code = "YOUR_CODE_FROM_STEP_3"
       client_id = "c6ea6899-da80-4a2f-9763-23a12e1262e5"
       client_secret = "ev76vnkl0z"
       redirect_uri = "http://localhost:8080/callback"
       grant_type = "authorization_code"
   }
   
   Invoke-RestMethod -Uri "https://api.upstox.com/v2/login/authorization/token" `
       -Method Post `
       -ContentType "application/x-www-form-urlencoded" `
       -Body $body
   ```

5. Copy the `access_token` from response

---

## Once You Have the Complete Token

### Manual Update (Quick)

Open `config/config.json` and replace `PASTE_FULL_ACCESS_TOKEN_HERE` in **THREE** places:

1. Line ~12: `"accessToken": "PASTE_HERE"`
2. Line ~18: `"marketData"."accessToken": "PASTE_HERE"`
3. Line ~24: `"orders"."accessToken": "PASTE_HERE"`

**IMPORTANT**: Same token in all three places!

### Then Test

Run this command to test the token:

```powershell
$headers = @{
    'Accept' = 'application/json'
    'Authorization' = 'Bearer YOUR_COMPLETE_TOKEN_HERE'
}

Invoke-RestMethod -Uri "https://api.upstox.com/v2/feed/market-data-feed/authorize" `
    -Method Get `
    -Headers $headers
```

**Expected response**:
```json
{
  "status": "success",
  "data": {
    "authorized_redirect_uri": "wss://[host]/market-data-feeder/v2/...?requestId=...&code=..."
  }
}
```

If you see `authorized_redirect_uri` → Token is valid! ✅

If you get 401 error → Token is invalid, regenerate ❌

---

## Current Config Status

File: `c:\Project\UpstoxORBTradingBot\config\config.json`

```json
{
  "upstox": {
    "apiKey": "c6ea6899-da80-4a2f-9763-23a12e1262e5",  ✅ UPDATED
    "apiSecret": "ev76vnkl0z",  ✅ UPDATED
    "accessToken": "PASTE_FULL_ACCESS_TOKEN_HERE",  ⏳ WAITING
    "marketData": {
      "accessToken": "PASTE_FULL_ACCESS_TOKEN_HERE"  ⏳ WAITING
    },
    "orders": {
      "accessToken": "PASTE_FULL_ACCESS_TOKEN_HERE"  ⏳ WAITING
    }
  }
}
```

---

## After Token Update

Once the complete token is in config:

1. Set `useMock: false` in config
2. Run `npm run live`
3. Verify WebSocket connects successfully
4. Check for real NIFTY ticks in logs

---

**Please provide the COMPLETE access token so we can proceed with testing!**

Token format: `eyJ....[long string]....signature`  
Expected length: 200-300+ characters
