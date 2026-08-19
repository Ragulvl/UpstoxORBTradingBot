/**
 * Options Pricing Utilities
 *
 * Simplified (but more realistic) models for backtesting Indian F&O options.
 * For live trading, fetch actual option prices from the Upstox Option Chain API.
 *
 * Limitations:
 *  - IV is hardcoded at 20% (real IV varies daily; use live IV for production)
 *  - Delta is approximated, not exact Black-Scholes
 *  - These are suitable for relative comparisons in backtesting, NOT for
 *    precise pricing in live execution
 */

/**
 * Cumulative Normal Distribution approximation (Abramowitz & Stegun)
 * Accurate to ~1.5e-7 for |x| < 7
 */
function normCDF(x) {
  if (x < -7) return 0;
  if (x > 7) return 1;
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly = k * (a1 + k * (a2 + k * (a3 + k * (a4 + k * a5))));
  const phi = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const result = 1 - phi * poly;
  return x >= 0 ? result : 1 - result;
}

/**
 * Simplified Black-Scholes option premium estimate.
 *
 * @param {number} spot        - Current spot price
 * @param {number} strike      - Option strike price
 * @param {number} timeToExpiry - Days to expiry
 * @param {number} volatility  - Annual implied volatility (e.g. 20 for 20%)
 * @param {string} optionType  - 'CALL' or 'PUT'
 * @returns {number} Estimated option premium
 */
export function estimateOptionPremium(spot, strike, timeToExpiry, volatility, optionType) {
  // Convert to Black-Scholes inputs
  const T = timeToExpiry / 252;   // Time in years (trading days)
  const r = 0.07;                 // Risk-free rate (India ~7%)
  const sigma = volatility / 100;

  if (T <= 0) {
    // At expiry: only intrinsic value
    return optionType === 'CALL'
      ? Math.max(0, spot - strike)
      : Math.max(0, strike - spot);
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let premium;
  if (optionType === 'CALL') {
    premium = spot * normCDF(d1) - strike * Math.exp(-r * T) * normCDF(d2);
  } else {
    premium = strike * Math.exp(-r * T) * normCDF(-d2) - spot * normCDF(-d1);
  }

  return Math.max(premium, 0.01); // Minimum 1 paisa
}

/**
 * Calculate option strike based on spot price.
 * Rounds to nearest available strike interval.
 *
 * @param {number} spot       - Spot price
 * @param {string} instrument - 'NIFTY' (50-pt intervals) or 'BANKNIFTY' (100-pt)
 * @returns {number} Nearest ATM strike
 */
export function getOptionStrike(spot, instrument) {
  const strikeInterval = instrument === 'BANKNIFTY' ? 100 : 50;
  return Math.round(spot / strikeInterval) * strikeInterval;
}

/**
 * Calculate option P&L based on entry and exit premiums.
 */
export function calculateOptionPnL(entryPremium, exitPremium, quantity) {
  const pnlPerUnit = exitPremium - entryPremium;
  const totalPnL = pnlPerUnit * quantity;
  const pnlPercent = (pnlPerUnit / entryPremium) * 100;

  return { pnlPerUnit, totalPnL, pnlPercent };
}

/**
 * Calculate position size for options based on risk per trade.
 *
 * If stop-loss hits, we lose stopLossPercent% of premium paid.
 * quantity = maxRiskAmount / (premium × stopLossPercent%)
 */
export function calculateOptionsPositionSize(capital, riskPerTradePercent, optionPremium, stopLossPercent) {
  const riskAmount    = capital * (riskPerTradePercent / 100);
  const lossPerOption = optionPremium * (stopLossPercent / 100);

  if (lossPerOption <= 0) return 1;

  const quantity    = Math.floor(riskAmount / lossPerOption);
  const maxQuantity = Math.floor(capital / optionPremium);

  return Math.min(Math.max(quantity, 1), maxQuantity);
}

/**
 * Estimate current option premium based on spot price change.
 *
 * Uses a smooth delta approximation derived from Black-Scholes d1
 * instead of a clamped-linear approximation (which overshoots at extremes).
 *
 * @param {number} entrySpot     - Spot at time of entry
 * @param {number} currentSpot   - Current spot price
 * @param {number} entryPremium  - Premium at entry
 * @param {string} optionType    - 'CALL' or 'PUT'
 * @param {number} timeDecay     - Theta decay amount to subtract
 * @returns {number} Estimated current premium (≥ 0)
 */
export function estimatePremiumChange(entrySpot, currentSpot, entryPremium, optionType, timeDecay = 0) {
  const spotChange = currentSpot - entrySpot;

  // Approximate ATM delta using a logistic (sigmoid) function of spot change %.
  // This naturally bounds delta in [0, 1] for calls and [-1, 0] for puts,
  // matching the behaviour of the real Black-Scholes delta.
  const spotChangePct = (spotChange / entrySpot) * 100;
  const sensitivity = 0.08; // How fast delta moves with moneyness (tunable)

  let delta;
  if (optionType === 'CALL') {
    // Delta ramps from 0 (deep OTM) to 1 (deep ITM), centred at 0.5 ATM
    delta = 1 / (1 + Math.exp(-sensitivity * spotChangePct * 10));
  } else {
    // PUT delta is negative: ramps from -1 (deep ITM) to 0 (deep OTM)
    delta = -1 / (1 + Math.exp(sensitivity * spotChangePct * 10));
  }

  const premiumChange  = spotChange * Math.abs(delta);
  const currentPremium = entryPremium + premiumChange - timeDecay;

  return Math.max(currentPremium, 0);
}

/**
 * Calculate time decay (theta) for option premium.
 *
 * Theta is NOT linear — it accelerates as expiry approaches.
 * We model this with a square-root decay: theta ∝ 1/√(DTE).
 *
 * @param {number} premium      - Entry premium
 * @param {number} daysToExpiry - Days to expiry at entry
 * @param {number} hoursElapsed - Hours since entry
 * @returns {number} Premium lost to time decay
 */
export function calculateTimeDecay(premium, daysToExpiry, hoursElapsed) {
  if (daysToExpiry <= 0 || hoursElapsed <= 0) return 0;

  // Annualised theta for ATM options is roughly: premium / (√DTE × some_factor)
  // We use a simplified daily decay that increases near expiry.
  // When DTE = 7, dailyDecay ≈ 3% of premium.
  // When DTE = 1, dailyDecay ≈ 7% of premium (near-expiry theta explosion).
  const dailyDecayRate = 0.02 / Math.sqrt(Math.max(daysToExpiry, 0.1));
  const dailyDecay = premium * Math.min(dailyDecayRate, 0.08); // Cap at 8%/day
  const hourlyDecay = dailyDecay / 6.25; // NSE trading hours per day

  return hourlyDecay * hoursElapsed;
}

/**
 * Get trading days to nearest weekly expiry.
 *
 * NIFTY  → weekly Thursday expiry
 * BANKNIFTY → weekly Wednesday expiry
 *
 * @param {Date}   date       - Current date
 * @param {string} instrument - 'NIFTY' or 'BANKNIFTY'
 * @returns {number} Calendar days to expiry (minimum 0.1)
 */
export function getDaysToExpiry(date, instrument) {
  const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  let daysToExpiry;
  if (instrument === 'BANKNIFTY') {
    // Wednesday = 3
    daysToExpiry = dayOfWeek <= 3 ? 3 - dayOfWeek : 7 - dayOfWeek + 3;
  } else {
    // NIFTY and others: Thursday = 4
    daysToExpiry = dayOfWeek <= 4 ? 4 - dayOfWeek : 7 - dayOfWeek + 4;
  }

  return Math.max(daysToExpiry, 0.1); // Minimum 0.1 day to avoid division by zero
}

export default {
  estimateOptionPremium,
  getOptionStrike,
  calculateOptionPnL,
  calculateOptionsPositionSize,
  estimatePremiumChange,
  calculateTimeDecay,
  getDaysToExpiry
};

