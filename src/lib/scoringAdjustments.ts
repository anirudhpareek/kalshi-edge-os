import type { ForecastRecord } from './types';

export interface CalibrationTightening {
  meanBrier: number | null;
  evBumpPct: number;
  spreadPenaltyCents: number;
  confidenceBumpPct: number;
}

/**
 * Historical prior on EV by price bucket.
 * Positive means favorable; negative means caution penalty.
 */
export function priceBucketPriorEvAdjustmentPct(side: 'yes' | 'no', fillCents: number): number {
  const c = Math.max(1, Math.min(99, fillCents));
  // Mild longshot/favorite adjustment based on historical tendencies.
  const yesAdj =
    c <= 10 ? -1.0 :
      c <= 20 ? -0.7 :
        c <= 35 ? -0.35 :
          c <= 65 ? 0 :
            c <= 80 ? 0.2 : 0.35;
  return side === 'yes' ? yesAdj : -yesAdj;
}

/**
 * Time-of-day execution risk multiplier in ET.
 * >1 means worse liquidity/slippage conditions.
 */
export function hourlyLiquidityMultiplierET(now: Date = new Date()): number {
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(now)
  );

  if (etHour >= 0 && etHour < 6) return 1.25;
  if (etHour >= 6 && etHour < 9) return 1.1;
  if (etHour >= 9 && etHour < 16) return 0.95;
  if (etHour >= 16 && etHour < 20) return 1.05;
  return 1.15;
}

/**
 * Tighten gate thresholds when calibration degrades.
 * Uses recent resolved intents to avoid overfitting to tiny samples.
 */
export function calibrationGateTightening(
  forecasts: ForecastRecord[],
  lookback = 120
): CalibrationTightening {
  const resolved = forecasts
    .filter((f) => f.brierScore != null)
    .slice(0, lookback);

  if (resolved.length < 20) {
    return {
      meanBrier: null,
      evBumpPct: 0,
      spreadPenaltyCents: 0,
      confidenceBumpPct: 0,
    };
  }

  const meanBrier = resolved.reduce((sum, f) => sum + (f.brierScore ?? 0), 0) / resolved.length;
  // Baseline healthy Brier around 0.20. Above that => progressively stricter gates.
  const drift = Math.max(0, meanBrier - 0.2);
  const severity = Math.min(1, drift / 0.12);

  return {
    meanBrier,
    evBumpPct: 1.8 * severity,
    spreadPenaltyCents: 1.5 * severity,
    confidenceBumpPct: 0.2 * severity,
  };
}
