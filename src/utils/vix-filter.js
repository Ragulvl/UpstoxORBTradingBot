/**
 * India VIX Regime Filter
 *
 * India VIX measures 30-day implied volatility of NIFTY options.
 * Opening range breakout strategies perform very differently across VIX regimes:
 *
 *   VIX < 12  → Too low: slow drift, ORB signals are weak
 *   12–20     → Optimal: clean directional breakouts
 *   20–25     → Elevated: reduce exposure by 50%
 *   ≥ 25      → Regime shift: halt all entries
 *
 * In backtesting mode (no live VIX feed), VIX is estimated from the day's
 * opening range width relative to spot price — a proven proxy.
 * In live trading, pass the actual India VIX from the Upstox market feed.
 */

export const VIX_REGIMES = {
  OPTIMAL:  { label: 'OPTIMAL',  sizeMultiplier: 1.0,  tradingAllowed: true  },
  LOW:      { label: 'LOW',      sizeMultiplier: 0.75, tradingAllowed: true  },
  ELEVATED: { label: 'ELEVATED', sizeMultiplier: 0.5,  tradingAllowed: true  },
  HALT:     { label: 'HALT',     sizeMultiplier: 0.0,  tradingAllowed: false }
};

/**
 * Classify a VIX level into a regime and return the corresponding
 * position size multiplier.
 *
 * @param {number} vix - India VIX value (e.g. 14.5)
 * @returns {{ regime: string, sizeMultiplier: number, tradingAllowed: boolean }}
 */
export function classifyVIX(vix) {
  if (vix === null || vix === undefined) {
    // Unknown VIX — treat as optimal to avoid blocking backtests
    return { ...VIX_REGIMES.OPTIMAL, vix: null };
  }

  let regime;
  if      (vix >= 25)              regime = VIX_REGIMES.HALT;
  else if (vix >= 20)              regime = VIX_REGIMES.ELEVATED;
  else if (vix >= 12)              regime = VIX_REGIMES.OPTIMAL;
  else                             regime = VIX_REGIMES.LOW;

  return { ...regime, vix };
}

/**
 * Estimate India VIX from the day's opening range width.
 *
 * Formula: VIX_proxy ≈ (ORB_range / spot) × √252 × 100
 * This is the annualised 1-day realised volatility of the range.
 *
 * Calibration notes (NIFTY 2024–2026):
 *   - Typical ORB range 0.3–0.6% → proxy VIX 4.8–9.5 (underestimates actual VIX)
 *   - Scale factor 2.2 aligns proxy to historical India VIX average of ~14
 *
 * This is a rough heuristic for backtesting only.
 * In production, use the live India VIX feed.
 *
 * @param {number} orbHigh  - Opening range high
 * @param {number} orbLow   - Opening range low
 * @param {number} spot     - Spot price at range close
 * @returns {number} Estimated VIX
 */
export function estimateVIXFromRange(orbHigh, orbLow, spot) {
  if (!spot || spot <= 0) return 15; // safe default
  const rangePct = (orbHigh - orbLow) / spot;
  const annualised = rangePct * Math.sqrt(252) * 100;
  return Math.round(annualised * 2.2 * 10) / 10; // scale + 1dp
}

/**
 * Compute position size multiplier that combines:
 *   1. VIX regime (market-wide risk)
 *   2. Days-to-expiry gamma risk (contract-specific risk)
 *
 * @param {number|null} vix          - India VIX (null = unknown)
 * @param {number}      daysToExpiry - Calendar days to expiry
 * @returns {{ multiplier: number, tradingAllowed: boolean, reason: string }}
 */
export function getSizingMultiplier(vix, daysToExpiry) {
  const regime = classifyVIX(vix);

  if (!regime.tradingAllowed) {
    return {
      multiplier: 0,
      tradingAllowed: false,
      reason: `VIX ${vix?.toFixed(1)} ≥ 25 — HALT: regime shift detected`
    };
  }

  // Gamma-bomb protection: scale down on expiry / near-expiry options
  let expiryMultiplier = 1.0;
  let expiryReason = '';
  if (daysToExpiry !== null && daysToExpiry !== undefined) {
    if (daysToExpiry <= 0.1) {
      // Same-day expiry (0 DTE): extremely high gamma — cut to 25%
      expiryMultiplier = 0.25;
      expiryReason = '0 DTE (gamma bomb) → 25% size';
    } else if (daysToExpiry <= 1) {
      // Near-expiry (1 DTE): high gamma — cut to 50%
      expiryMultiplier = 0.5;
      expiryReason = '≤1 DTE (near-expiry) → 50% size';
    }
  }

  const combined = regime.sizeMultiplier * expiryMultiplier;
  const parts = [`VIX=${vix?.toFixed(1)} (${regime.label}) → ${Math.round(regime.sizeMultiplier * 100)}%`];
  if (expiryReason) parts.push(expiryReason);

  return {
    multiplier: combined,
    tradingAllowed: combined > 0,
    regime: regime.label,
    vixValue: vix,
    daysToExpiry,
    reason: parts.join(' | ')
  };
}
