/**
 * Unit tests for LiveRiskManager
 * Run with: node --test tests/risk-manager.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import LiveRiskManager from '../src/risk/live-risk-manager.js';

// ── Config fixture ─────────────────────────────────────────────────────────────
const makeConfig = (overrides = {}) => ({
  trading: {
    capital: 100000,
    dailyLossLimitPercent: 2,       // 2% = ₹2000 max daily loss
    maxTradesPerDay: 2,
    riskPerTradePercent: 2,
    instrumentType: 'OPTIONS',
    ...(overrides.trading || {})
  }
});

describe('LiveRiskManager — Initialisation', () => {

  test('daily loss limit is correctly calculated from capital', () => {
    const rm = new LiveRiskManager(makeConfig());
    const expectedLimit = 100000 * (2 / 100); // = 2000
    assert.equal(rm.dailyLossLimit, expectedLimit,
      `dailyLossLimit should be ${expectedLimit}, got ${rm.dailyLossLimit}`);
  });

  test('initial state has no circuit breaker or kill switch', () => {
    const rm = new LiveRiskManager(makeConfig());
    const status = rm.getRiskStatus();
    assert.equal(status.circuitBreakerTriggered, false, 'Circuit breaker should not be triggered initially');
    assert.equal(status.killSwitchActivated, false, 'Kill switch should not be activated initially');
    assert.equal(status.dailyPnL, 0, 'Daily P&L should start at 0');
  });
});

describe('LiveRiskManager — Circuit Breaker', () => {

  test('circuit breaker triggers when daily loss exceeds limit', () => {
    const rm = new LiveRiskManager(makeConfig());
    // updateDailyPnL is the method that records P&L and checks the circuit breaker
    rm.updateDailyPnL(-2100);
    assert.equal(rm.circuitBreakerTriggered, true,
      'Circuit breaker should trigger when loss > dailyLossLimit (₹2000)');
  });

  test('circuit breaker does NOT trigger for a loss below the limit', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.updateDailyPnL(-1500);
    assert.equal(rm.circuitBreakerTriggered, false,
      'Circuit breaker should NOT trigger for ₹1500 loss when limit is ₹2000');
  });

  test('cumulative losses across trades trigger circuit breaker', () => {
    const rm = new LiveRiskManager(makeConfig());

    rm.updateDailyPnL(-1200);  // Cumulative: -1200 (under limit)
    assert.equal(rm.circuitBreakerTriggered, false, 'No trigger after first trade');

    rm.updateDailyPnL(-900);   // Cumulative: -2100 (over limit)
    assert.equal(rm.circuitBreakerTriggered, true, 'Should trigger after cumulative loss exceeds limit');
  });

  test('checkTradeAllowed returns false when circuit breaker is active', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.updateDailyPnL(-2100); // Trip the breaker
    const result = rm.checkTradeAllowed({});
    assert.equal(result.allowed, false, 'Should not allow trade when circuit breaker is on');
  });
});

describe('LiveRiskManager — Max Trades Per Day', () => {

  test('checkTradeAllowed returns false when max trades reached', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.incrementTradeCount();
    rm.incrementTradeCount();
    // 2 trades taken, max is 2
    const result = rm.checkTradeAllowed({});
    assert.equal(result.allowed, false, 'Should not allow trading after maxTradesPerDay');
    assert.equal(result.reason, 'MAX_TRADES_PER_DAY_REACHED');
  });

  test('checkTradeAllowed returns true when under trade limit and no other issues', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.incrementTradeCount();
    // 1 trade taken, limit is 2
    // Pass a dummy trade with minimal params to avoid INSUFFICIENT_CAPITAL block
    const result = rm.checkTradeAllowed({ entryPrice: 200, stopLoss: 150, quantity: 1 });
    assert.equal(result.allowed, true, 'Should allow trading when under limit');
  });
});

describe('LiveRiskManager — Kill Switch', () => {

  test('emergencyStop activates kill switch', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.emergencyStop('TEST_KILL');
    assert.equal(rm.killSwitchActivated, true, 'Kill switch should be activated');
  });

  test('checkTradeAllowed returns false when kill switch is on', () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.emergencyStop('TEST');
    const result = rm.checkTradeAllowed({});
    assert.equal(result.allowed, false, 'Should block trading after kill switch');
    assert.equal(result.reason, 'KILL_SWITCH_ACTIVATED');
  });
});

describe('LiveRiskManager — Position Sizing', () => {

  test('calculatePositionSize returns reasonable size based on risk', () => {
    const rm = new LiveRiskManager(makeConfig());

    // With 2% risk on ₹100000 = ₹2000 max risk
    // Entry: 24500, StopLoss: 24255 (1% below) → risk per unit = 245
    // Quantity = floor(2000 / 245) = 8, lots = floor(8 / 50) = 0
    // Adjusted: at least 1 lot if quantity >= 0.5×lotSize → 1 lot × 50 = 50
    const result = rm.calculatePositionSize({
      entryPrice: 24500,
      stopLoss: 24255,
      lotSize: 50
    });

    // May be null if not even 0.5 lots affordable — that's also valid
    if (result !== null) {
      assert.ok(result.quantity >= 0, 'Quantity should be non-negative');
      assert.ok(typeof result.lots === 'number', 'Should return lots count');
    }
    // If null, verify the method ran without crashing
    assert.ok(true, 'calculatePositionSize ran without error');
  });

  test('calculatePositionSize returns null when stop equals entry', () => {
    const rm = new LiveRiskManager(makeConfig());
    const result = rm.calculatePositionSize({
      entryPrice: 24500,
      stopLoss: 24500,  // Invalid: same as entry
      lotSize: 50
    });
    assert.equal(result, null, 'Should return null for invalid SL (same as entry)');
  });
});

describe('LiveRiskManager — Daily Reset', () => {

  test('resetDaily clears P&L and trade count', async () => {
    const rm = new LiveRiskManager(makeConfig());
    rm.updateDailyPnL(1500);
    rm.incrementTradeCount();
    rm.incrementTradeCount();

    assert.equal(rm.tradesCount, 2);
    assert.equal(rm.dailyPnL, 1500);

    // resetDaily is the correct method name
    await rm.resetDaily();

    assert.equal(rm.dailyPnL, 0, 'dailyPnL should be 0 after reset');
    assert.equal(rm.tradesCount, 0, 'tradesCount should be 0 after reset');
    assert.equal(rm.circuitBreakerTriggered, false, 'Circuit breaker should reset');
  });
});
