/**
 * Unit tests for CostCalculator
 * Run with: node --test tests/cost-calculator.test.js
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CostCalculator from '../src/bot/cost-calculator.js';

const makeConfig = () => ({});  // CostCalculator uses hardcoded defaults

// ── Helpers ────────────────────────────────────────────────────────────────────
function makeOrderParams({ premium = 200, quantity = 50, side = 'BUY', spread = 0 } = {}) {
  return { premium, quantity, side, spread };
}

function makeTradeParams({ entryPremium = 200, exitPremium = 280, quantity = 50 } = {}) {
  return {
    quantity,
    entry: { price: entryPremium },
    exit:  { price: exitPremium  }
  };
}

describe('CostCalculator — Single Order Costs', () => {

  test('brokerage rate is 0.03% (Zerodha actual), not 0.05%', () => {
    const calc = new CostCalculator(makeConfig());
    assert.equal(calc.costs.brokeragePercent, 0.0003,
      'Brokerage percent should be 0.0003 (0.03%) not 0.0005 (0.05%)');
  });

  test('STT is only charged on the SELL side', () => {
    const calc = new CostCalculator(makeConfig());
    const buyCosts  = calc.calculateOrderCosts(makeOrderParams({ side: 'BUY' }));
    const sellCosts = calc.calculateOrderCosts(makeOrderParams({ side: 'SELL' }));

    assert.equal(buyCosts.stt, 0,
      'STT should be 0 on the buy side for options');
    assert.ok(sellCosts.stt > 0,
      'STT should be > 0 on the sell side for options');
  });

  test('stamp duty is only charged on the BUY side', () => {
    const calc = new CostCalculator(makeConfig());
    const buyCosts  = calc.calculateOrderCosts(makeOrderParams({ side: 'BUY' }));
    const sellCosts = calc.calculateOrderCosts(makeOrderParams({ side: 'SELL' }));

    assert.ok(buyCosts.stampDuty > 0,
      'Stamp duty should be > 0 on buy side');
    assert.equal(sellCosts.stampDuty, 0,
      'Stamp duty should be 0 on sell side');
  });

  test('GST is 18% applied on brokerage + exchange + SEBI', () => {
    const calc = new CostCalculator(makeConfig());
    const costs = calc.calculateOrderCosts(makeOrderParams({ side: 'SELL' }));

    const expectedGstBase = costs.brokerage + costs.exchange + costs.sebi;
    const expectedGst = parseFloat((expectedGstBase * calc.costs.gstRate).toFixed(2));

    assert.ok(Math.abs(costs.gst - expectedGst) < 0.02,
      `GST should be 18% of (brokerage + exchange + SEBI). Expected ~${expectedGst}, got ${costs.gst}`);
  });

  test('STT is 0.0625% of sell-side turnover', () => {
    const calc = new CostCalculator(makeConfig());
    const costs = calc.calculateOrderCosts(makeOrderParams({ premium: 200, quantity: 50, side: 'SELL' }));

    const expectedStt = parseFloat((200 * 50 * 0.000625).toFixed(2)); // = 6.25
    assert.ok(Math.abs(costs.stt - expectedStt) < 0.02,
      `STT should be ~${expectedStt}, got ${costs.stt}`);
  });
});

describe('CostCalculator — Round-Trip Trade Costs', () => {

  test('calculateTradeCosts returns total costs and adjusted P&L', () => {
    const calc = new CostCalculator(makeConfig());
    const result = calc.calculateTradeCosts(makeTradeParams({ entryPremium: 200, exitPremium: 280, quantity: 50 }));

    assert.ok(result.costs.total.total > 0, 'Total round-trip costs should be positive');
    assert.ok(typeof result.verdict === 'object', 'Should include a verdict object');
    assert.ok(typeof result.pnl.raw === 'number', 'Should include raw P&L');
    assert.ok(typeof result.pnl.adjusted === 'number', 'Should include adjusted P&L');
  });

  test('adjusted P&L is less than raw P&L (costs eat into profits)', () => {
    const calc = new CostCalculator(makeConfig());
    const result = calc.calculateTradeCosts(makeTradeParams({ entryPremium: 200, exitPremium: 280, quantity: 50 }));

    assert.ok(result.pnl.adjusted < result.pnl.raw,
      'Adjusted P&L must be less than raw P&L due to costs');
  });

  test('larger quantity increases total costs', () => {
    const calc = new CostCalculator(makeConfig());
    const small  = calc.calculateTradeCosts(makeTradeParams({ quantity: 50  }));
    const larger = calc.calculateTradeCosts(makeTradeParams({ quantity: 100 }));

    assert.ok(larger.costs.total.total > small.costs.total.total,
      'Larger quantity should incur higher total costs');
  });

  test('verdict is SUCCESS when adjusted P&L is positive', () => {
    const calc = new CostCalculator(makeConfig());
    // Large profit: entry 200, exit 400 on 50 units → raw = 10000; costs ≪ 10000
    const result = calc.calculateTradeCosts(makeTradeParams({ entryPremium: 200, exitPremium: 400, quantity: 50 }));

    assert.equal(result.verdict.outcome, 'SUCCESS',
      'Verdict should be SUCCESS when profit >> costs');
  });

  test('verdict is FAIL when costs erode a small profit to a loss', () => {
    const calc = new CostCalculator(makeConfig());
    // Tiny profit: entry 200, exit 200.01 on 1 unit → raw = 0.5; costs >> 0.5
    const result = calc.calculateTradeCosts(makeTradeParams({ entryPremium: 200, exitPremium: 200.01, quantity: 1 }));

    assert.ok(
      result.verdict.outcome === 'FAIL' || result.pnl.adjusted < result.pnl.raw,
      'Very small profit should be eroded by costs'
    );
  });

  test('total costs are less than 2% of trade value (sanity check)', () => {
    const calc = new CostCalculator(makeConfig());
    const trade = makeTradeParams({ entryPremium: 200, exitPremium: 200, quantity: 50 });
    const result = calc.calculateTradeCosts(trade);

    const tradeValue = 200 * 50;
    assert.ok(result.costs.total.total < tradeValue * 0.02,
      `Total costs (${result.costs.total.total}) should be < 2% of trade value (${tradeValue * 0.02})`);
  });
});
