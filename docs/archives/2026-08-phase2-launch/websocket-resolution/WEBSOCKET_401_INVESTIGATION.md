# WebSocket 401 Error Investigation

**Date**: August 4, 2026  
**Status**: IN PROGRESS  
**Priority**: HIGH (Blocks live market data)

## Issue Summary

When attempting to connect to Upstox production WebSocket with `useMock: false`, receiving HTTP 401 Unauthorized error.

```
[ERROR] WebSocket error { error: 'Unexpected server response: 401' }
```

## Split Configuration Implemented ✅

Successfully implemented split production/sandbox configuration:

### Configuration Structure (config/config.json)

```json
{
  "websocket": {
    "useMock": false,  // Set to true temporarily
    "reconnectDelay": 5000,
    "maxReconnectAttempts": 10
  },
  "upstox": {
    "baseUrl": "https://api.upstox.com/v2",
    "sandboxUrl": "https://api-hft.upstox.com",
    "accessToken": "<production-token>",
    
    "marketData": {
      "useProduction": true,
      "accessToken": "<production-token>",
      "websocketUrl": "wss://api-v2.upstox.com/feed/market-data-feed/v2"
    },
    
    "orders": {
      "useSandbox": true,
      "sandboxUrl": "https://api-hft.upstox.com",
      "accessToken": "<production-token>"  // Same token for now
    }
  }
}
```

### UpstoxClient Changes ✅

Updated `src/data/upstox-client.js`:
- Split URL routing: `getBaseUrl(isOrder)` - production for market data, sandbox for orders
- Split token routing: `getHeaders(isOrder)` - production token for market data, sandbox token for orders
- All market data methods (getHistoricalData, getInstrumentMaster, getOptionChain) use production
- All order methods (placeOrder, modifyOrder, cancelOrder, getOrderStatus, getPositions) use sandbox
- Added detailed logging showing which endpoint and token is being used

### WebSocket Initialization ✅

Updated `src/bot/run-live-bot.js`:
- WebSocket uses production market data token: `config.upstox.marketData?.accessToken`
- WebSocket uses production URL: `config.upstox.marketData?.websocketUrl`
- Logs show: `useProductionData: true, url: 'wss://api-v2.upstox.com/feed/market-data-feed/v2'`

## Bot Startup Test Results

### With Mock Mode (useMock: true) ✅

Bot starts successfully:
- All 11 components initialize
- Mock WebSocket connects
- Kill switch monitoring active
- Mock ticks being generated (1/second)
- State transitions working
- Dashboard exporter running

**Log Evidence**:
```
[INFO] UpstoxClient initialized {
  productionUrl: 'https://api.upstox.com/v2',
  sandboxUrl: 'https://api-hft.upstox.com',
  useSandboxForOrders: true,
  hasProductionToken: true,
  hasSandboxToken: true
}
[WARN] ⚠️  Using MOCK WebSocket mode - simulated market data for testing
[INFO] Mock WebSocket connected successfully
[INFO] Starting mock tick generation (1 tick per second)
[INFO] 🤖 Bot is now live and monitoring market
```

### With Real WebSocket (useMock: false) ❌

Connection fails with 401:
```
[INFO] Connecting to Upstox WebSocket { url: 'wss://api-v2.upstox.com/feed/market-data-feed/v2' }
[ERROR] WebSocket error { error: 'Unexpected server response: 401' }
[ERROR] 💥 Uncaught exception
[ERROR] WebSocket connection timeout
```

## Root Cause Analysis

### Possible Causes

1. **Token Authentication Format**
   - Current: Token passed both in URL query param AND Authorization header
   - Upstox WebSocket might require only ONE method
   - WebSocket URL: `wss://api-v2.upstox.com/feed/market-data-feed/v2?access_token=<token>`
   - Headers: `{ 'Authorization': 'Bearer <token>' }`

2. **Token Validity**
   - Token expires: August 29, 2026 (25 days remaining - VALID)
   - Token might not have WebSocket permissions
   - Production token vs sandbox token confusion

3. **WebSocket Protocol Headers**
   - Current headers: `{ 'Api-Version': '2.0', 'Authorization': 'Bearer ...' }`
   - Upstox might not accept headers in WebSocket handshake
   - WebSocket headers may need to be passed differently

4. **URL Format**
   - Using V2 API URL: `wss://api-v2.upstox.com/feed/market-data-feed/v2`
   - Might need different URL or API version

## Next Steps to Resolve

### Step 1: Verify Upstox WebSocket Documentation

- [ ] Check official Upstox API documentation for WebSocket auth format
- [ ] Confirm whether token goes in URL param, header, or protocol field
- [ ] Check if special permissions needed for WebSocket access
- [ ] Verify correct WebSocket URL format

### Step 2: Test Token Validity

```javascript
// Test if token works for REST API market data
const response = await axios.get('https://api.upstox.com/v2/market-quote/ltp?symbol=NSE_INDEX|Nifty 50', {
  headers: { 'Authorization': 'Bearer <token>' }
});
```

### Step 3: Test Different Auth Methods

Try these WebSocket connection variations:

**Option A: Token in URL only (no headers)**
```javascript
const wsUrl = `wss://api-v2.upstox.com/feed/market-data-feed/v2?access_token=${token}`;
this.ws = new WebSocket(wsUrl);  // No headers
```

**Option B: Token in protocol field**
```javascript
this.ws = new WebSocket(url, {
  protocol: `access_token.${token}`
});
```

**Option C: Token in custom header**
```javascript
this.ws = new WebSocket(url, {
  headers: { 'X-Access-Token': token }
});
```

### Step 4: Check Alternative WebSocket Endpoints

Try older API versions:
- `wss://api.upstox.com/v2/feed/market-data-feed`
- `wss://ws.upstox.com/feed/market-data-feed`

## Temporary Workaround ✅

**Current State**: Bot runs with `useMock: true`

This allows testing all other systems:
- Kill switch ✅
- Circuit breaker ✅  
- Position tracking ✅
- Cost calculation ✅
- Trade journal ✅
- Dashboard ✅
- Order routing (sandbox) ✅

**Limitation**: Cannot receive real NIFTY ticks or test actual strategy signals

## Evidence Required Before Launch

Once WebSocket 401 is fixed:

1. **Real Tick Verification**
   - Log showing actual NIFTY spot price (not mock ~22000)
   - Log showing: `WebSocket connected successfully` (not mock mode)
   - Actual tick data with real market timestamps

2. **Connection Stability**
   - WebSocket stays connected for at least 5 minutes
   - No repeated disconnects/reconnects
   - Heartbeat functioning

3. **Data Quality**
   - Tick prices match current NIFTY spot on NSE
   - Timestamps are current (not delayed)
   - Volume and other fields populated correctly

## Related Files

- `config/config.json` - Split configuration
- `src/data/websocket-client.js` - WebSocket client implementation
- `src/data/upstox-client.js` - REST API client with split routing
- `src/bot/run-live-bot.js` - Bot initialization and WebSocket setup

## Status Log

**2026-08-04 09:37**
- Split configuration implemented and tested
- UpstoxClient routes correctly (production for market data, sandbox for orders)
- Bot starts successfully with mock mode
- WebSocket 401 remains unresolved with real connection
- Investigation continues into correct auth format

---

**Decision**: Keep `useMock: true` until WebSocket auth is resolved. Do NOT disable mock mode for Tuesday's session without fixing this first.
