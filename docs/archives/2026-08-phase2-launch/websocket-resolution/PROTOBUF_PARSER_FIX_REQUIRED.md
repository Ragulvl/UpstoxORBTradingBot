# URGENT: Protobuf Parser Implementation Required

**Priority**: 🔴 **CRITICAL - Blocks all trading**  
**Status**: Data received but unparseable  
**Impact**: Cannot generate valid candles or trade signals  

---

## Problem Summary

### Current State

- ✅ WebSocket connects successfully
- ✅ Data is being received from Upstox
- ❌ Data is in protobuf binary format
- ❌ Current parser produces garbage values

### Evidence

```javascript
// What we're receiving (raw binary):
{
  instrument_key: '\b\x02\x18σ���3"�\x01\n\x0B\n\x07NSE_',
  ltp: 17620910854116372,  // Should be ~24,500
  volume: 105792324,        // Possibly correct?
  timestamp: '2026-08-04T04:32:36.894Z'
}
```

**The LTP value is completely wrong** - should be around 24,500 (current NIFTY), not 17 quadrillion!

---

## Solution: Implement Protobuf Decoder

### Step 1: Get Upstox Protobuf Schema

**Option A: Official Schema** (Recommended)
- Contact Upstox support
- Request the `.proto` file for WebSocket V3 messages
- Official documentation should have this

**Option B: Upstox Documentation**
- Check https://upstox.com/developer/api-documentation/websocket
- Look for "V3 WebSocket Protocol" section
- Download MarketDataFeed.proto or similar

**Option C: Reverse Engineer** (Last Resort)
- Use online protobuf decoders
- Analyze sample messages
- Infer schema structure

### Step 2: Install Protobuf Library

```bash
npm install protobufjs
```

### Step 3: Load Schema and Decode

**File**: `src/data/upstox-protobuf.js` (create new)

```javascript
import protobuf from 'protobufjs';
import { logger } from '../utils/logger.js';

class UpstoxProtobufParser {
  constructor() {
    this.root = null;
    this.FeedResponse = null;
  }

  async initialize() {
    try {
      // Load the .proto schema file
      this.root = await protobuf.load('./upstox-market-data.proto');
      
      // Get the message type
      this.FeedResponse = this.root.lookupType('com.upstox.marketdatafeeder.rpc.proto.FeedResponse');
      
      logger.info('Protobuf schema loaded successfully');
    } catch (error) {
      logger.error('Failed to load protobuf schema', { error: error.message });
      throw error;
    }
  }

  decode(binaryData) {
    try {
      // Decode the binary message
      const message = this.FeedResponse.decode(binaryData);
      
      // Convert to plain object
      const object = this.FeedResponse.toObject(message, {
        longs: Number,  // Convert long integers to JS numbers
        enums: String,  // Convert enums to strings
        bytes: String   // Convert bytes to strings
      });
      
      return this.transformToTick(object);
    } catch (error) {
      logger.error('Failed to decode protobuf message', { error: error.message });
      return null;
    }
  }

  transformToTick(protoMessage) {
    // Transform protobuf message to our internal tick format
    return {
      instrumentKey: protoMessage.feeds?.ltpc?.instrument_key,
      ltp: protoMessage.feeds?.ltpc?.ltp,
      ltq: protoMessage.feeds?.ltpc?.last_traded_quantity,
      volume: protoMessage.feeds?.ltpc?.volume,
      bid: protoMessage.feeds?.marketDepth?.bid?.[0]?.price,
      ask: protoMessage.feeds?.marketDepth?.ask?.[0]?.price,
      bidQty: protoMessage.feeds?.marketDepth?.bid?.[0]?.quantity,
      askQty: protoMessage.feeds?.marketDepth?.ask?.[0]?.quantity,
      open: protoMessage.feeds?.ohlc?.open,
      high: protoMessage.feeds?.ohlc?.high,
      low: protoMessage.feeds?.ohlc?.low,
      close: protoMessage.feeds?.ohlc?.close,
      timestamp: new Date().toISOString()
    };
  }
}

export default UpstoxProtobufParser;
```

### Step 4: Update WebSocket Client

**File**: `src/data/websocket-client.js`

```javascript
import UpstoxProtobufParser from './upstox-protobuf.js';

class UpstoxWebSocketClient extends EventEmitter {
  constructor(accessToken, config = {}) {
    super();
    // ... existing code ...
    this.protobufParser = new UpstoxProtobufParser();
  }

  async connect() {
    // Initialize protobuf parser before connecting
    await this.protobufParser.initialize();
    
    // ... existing connection code ...
  }

  handleMessage(data) {
    try {
      if (Buffer.isBuffer(data)) {
        // Use protobuf parser instead of simplified parser
        const tick = this.protobufParser.decode(data);
        
        if (tick && tick.ltp) {
          logger.info('Tick received', { 
            instrument: tick.instrumentKey,
            ltp: tick.ltp,
            volume: tick.volume
          });
          this.emit('tick', tick);
        }
      } else {
        // JSON message (acknowledgements, etc.)
        const message = JSON.parse(data.toString());
        this.handleJsonMessage(message);
      }
    } catch (error) {
      logger.error('Failed to handle WebSocket message', { 
        error: error.message 
      });
    }
  }
}
```

---

## Testing the Fix

### Step 1: Run Bot with Debug Logging

```bash
# Set logging level to debug in config
npm run live
```

### Step 2: Verify Tick Values

Look for logs like:
```
[INFO] Tick received {
  instrument: 'NSE_INDEX|Nifty 50',
  ltp: 24523.45,        ✅ Realistic value
  volume: 1234567,      ✅ Realistic volume
  timestamp: current
}
```

### Step 3: Verify Candles

After 1 minute, check for:
```
[INFO] Candle completed {
  ohlc: "24500.00/24550.00/24480.00/24523.45",  ✅ Realistic range
  volume: 1234567,
  ticks: 60
}
```

### Step 4: Verify Opening Range

After 15 minutes (09:30 AM), check for:
```
[INFO] Opening range calculated {
  high: 24550.00,
  low: 24480.00,
  range: 70.00
}
```

---

## Alternative: Use Upstox SDK

If protobuf implementation is complex, check if Upstox provides an official Node.js SDK with built-in protobuf handling:

```bash
npm search upstox
# Look for official @upstox/sdk or similar
```

---

## Temporary Workaround: Mock Mode

Until protobuf parser is fixed, you can:

1. Set `useMock: true` in config
2. Test all other bot systems (kill switch, circuit breaker, etc.)
3. Verify state machine logic
4. Test dashboard integration

But **DO NOT use mock mode for Phase 2 validation** - it generates fake data.

---

## Timeline

**Tonight (Aug 4)**:
1. Get Upstox protobuf schema
2. Implement parser
3. Test with sample messages
4. Verify realistic tick values

**Tomorrow Morning (Aug 5)**:
1. Deploy before market open (before 09:15 AM)
2. Connect and verify data quality
3. Monitor opening range calculation
4. Start Phase 2 validation if all checks pass

---

## Resources

- Upstox API Docs: https://upstox.com/developer/api-documentation
- Protobuf.js: https://github.com/protobufjs/protobuf.js
- Google Protocol Buffers: https://developers.google.com/protocol-buffers

---

## Status

**Parser Status**: ❌ Broken (produces garbage values)  
**Blocking**: Yes, cannot trade without valid data  
**Workaround**: Mock mode (not suitable for validation)  
**Fix Required**: Tonight before tomorrow's market open  
**ETA**: 2-4 hours (depends on schema availability)  

---

**Created**: August 4, 2026, 10:05 AM IST  
**Priority**: CRITICAL  
**Owner**: Development team  
**Deadline**: Tonight (before Aug 5 market open)
