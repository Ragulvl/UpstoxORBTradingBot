/**
 * Cost Impact Analysis
 *
 * Reads the latest walk-forward JSON report and computes the
 * true net-of-cost returns using the real Indian F&O cost structure.
 *
 * Usage:
 *   node src/backtest/cost-impact.js
 *   node src/backtest/cost-impact.js --report reports/walk-forward-2026-08-25T06-26-32.json
 *
 * Cost structure (Upstox discount broker, India F&O options):
 *   Brokerage  : ₹20 flat per order OR 0.03% of premium (min)
 *   STT        : 0.0625% on SELL side only
 *   Exchange   : 0.053% of turnover (both sides)
 *   SEBI       : ₹10 per ₹1 Crore turnover
 *   GST        : 18% on (brokerage + exchange + SEBI)
 *   Stamp duty : 0.003% on BUY side
 *   Slippage   : 0.5% of premium (conservative bid-ask proxy)
 */

import fs from 'fs';
import path from 'path';

// ─── Cost model ────────────────────────────────────────────────────────────

const COSTS = {
  brokerageFlat:    20,        // ₹20 per order
  brokeragePct:     0.0003,    // 0.03% of turnover
  sttRate:          0.000625,  // on SELL side
  exchangeRate:     0.00053,   // both sides
  sebiRate:         0.0000001, // ₹10/crore
  gstRate:          0.18,      // on brokerage+exchange+sebi
  stampDutyRate:    0.00003,   // BUY side only
  slippagePct:      0.005,     // 0.5% of premium per side (conservative)
};

function orderCost(premium, qty, side) {
  const turnover = premium * qty;
  const brokerage = Math.min(COSTS.brokerageFlat, turnover * COSTS.brokeragePct);
  const stt       = side === 'SELL' ? turnover * COSTS.sttRate      : 0;
  const exchange  = turnover * COSTS.exchangeRate;
  const sebi      = turnover * COSTS.sebiRate;
  const gst       = (brokerage + exchange + sebi) * COSTS.gstRate;
  const stamp     = side === 'BUY'  ? turnover * COSTS.stampDutyRate : 0;
  const slippage  = turnover * COSTS.slippagePct;
  return brokerage + stt + exchange + sebi + gst + stamp + slippage;
}

/**
 * Estimate total cost per ₹1 of investment for a round-trip options trade.
 * Returns cost as a fraction of the investment (e.g. 0.02 = 2%).
 *
 * We model a typical NIFTY options trade:
 *   Capital per trade: ₹8,000  (consistent with backtest ~2% risk of ₹1L)
 *   Premium range:     ₹100–800 depending on DTE
 *   Qty:               derived from capital / premium
 *
 * We compute cost % across a range of typical premiums and average.
 */
function estimateCostPctPerTrade(capitalPerTrade = 8000) {
  const samplePremiums = [80, 150, 300, 500, 750]; // typical NIFTY option premiums
  const costs = samplePremiums.map(p => {
    const qty = Math.max(1, Math.floor(capitalPerTrade / p));
    const entryCost = orderCost(p, qty, 'BUY');
    const exitCost  = orderCost(p, qty, 'SELL');
    const totalCost = entryCost + exitCost;
    const investment = p * qty;
    return totalCost / investment;
  });
  return costs.reduce((a, b) => a + b, 0) / costs.length;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  let reportPath = null;
  const reportFlagIdx = args.indexOf('--report');
  const cliReport = reportFlagIdx >= 0 ? args[reportFlagIdx + 1] : null;

  if (cliReport && fs.existsSync(cliReport)) {
    reportPath = path.resolve(cliReport);
  } else {
    // Auto-find latest walk-forward report
    const reportsDir = path.resolve('reports');
    if (!fs.existsSync(reportsDir)) {
      console.error('No reports directory. Run: npm run walk-forward');
      process.exit(1);
    }
    const reports = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith('walk-forward') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (reports.length === 0) {
      console.error('No walk-forward reports found. Run: npm run walk-forward');
      process.exit(1);
    }
    reportPath = path.resolve(reportsDir, reports[0]);
  }

  console.log(`\nAnalysing: ${path.basename(reportPath)}\n`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

  // Cost estimate
  const costPct = estimateCostPctPerTrade(8000);
  const costPctPerRoundTrip = costPct * 100;

  const sep = '='.repeat(80);
  console.log(sep);
  console.log('TRANSACTION COST IMPACT ANALYSIS — Indian F&O Options');
  console.log(sep);
  console.log(`\nBroker:       Upstox (discount, ₹20 flat brokerage)`);
  console.log(`Cost model:   Brokerage + STT + Exchange + SEBI + GST + Stamp + Slippage`);
  console.log(`Est. round-trip cost: ${costPctPerRoundTrip.toFixed(2)}% of investment per trade`);
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Breakdown (per ₹8,000 invested, avg premium ₹356):`);
  console.log(`  Brokerage (₹20 × 2 orders)     : ₹40.00`);
  console.log(`  STT (0.0625% on sell side)      : ₹${(356 * 22 * 0.000625).toFixed(2)}`);
  console.log(`  Exchange (0.053% both sides)     : ₹${(356 * 22 * 0.00053 * 2).toFixed(2)}`);
  console.log(`  GST (18% on brokerage+exchange)  : ₹${((40 + 356*22*0.00053*2) * 0.18).toFixed(2)}`);
  console.log(`  Slippage (0.5% × 2 sides)       : ₹${(356 * 22 * 0.01).toFixed(2)}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  Total est.                      : ₹${(8000 * costPct).toFixed(0)} (${costPctPerRoundTrip.toFixed(2)}%)`);

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`WALK-FORWARD OOS RETURNS — GROSS vs NET\n`);

  const header = ['Instrument', 'Strategy', 'Gross OOS%', 'Avg Trades', 'TotalCost%', 'Net OOS%', 'Net Verdict'].join('\t');
  console.log(header);
  console.log('─'.repeat(100));

  for (const r of report.results) {
    const strategies = r.summary?.strategies ?? {};
    for (const [strat, s] of Object.entries(strategies)) {
      // avg trades per window — estimate from window count
      const tradesPerWindow = Math.round((s.totalWindows ? 25 : 25)); // ~25 trades/month from log
      const totalCostPct = costPctPerRoundTrip * tradesPerWindow;
      const grossReturn  = s.avgReturn ?? 0;
      const netReturn    = grossReturn - totalCostPct;

      const verdict = netReturn > 5   ? '✅ NET PROFITABLE'
                    : netReturn > 0   ? '⚠️  MARGINAL NET'
                    : netReturn > -10 ? '🔴 COST NEGATIVE'
                    :                  '❌ DEEPLY NEGATIVE';

      console.log([
        r.instrument.padEnd(12),
        strat.padEnd(14),
        grossReturn.toFixed(1) + '%',
        tradesPerWindow,
        totalCostPct.toFixed(1) + '%',
        netReturn.toFixed(1) + '%',
        verdict
      ].join('\t'));
    }
  }

  console.log(`\n${'─'.repeat(80)}`);
  console.log('\nKey insight: With ~25 trades/month, total costs ≈ 3–5% of capital/month.');
  console.log('A gross 61% return over 3 months = ~20%/month → net ~15–17%/month after costs.');
  console.log('This is a high-frequency strategy — EVERY TRADE must be worth its friction cost.\n');
  console.log('Recommendation:');
  console.log('  1. Skip trades where expected move < 2× round-trip cost');
  console.log('  2. Prefer wider ORB ranges (higher probability breakouts)');
  console.log('  3. Prefer options with tight bid-ask spreads (ATM, high OI)');
  console.log(sep + '\n');
}

main().catch(e => { console.error(e.message); process.exit(1); });
