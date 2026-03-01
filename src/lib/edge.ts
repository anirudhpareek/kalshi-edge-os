import type { MarketModel } from './types';

export interface EdgeMetrics {
  trueProbability: number;
  marketMidProbability: number;
  yesBreakEven: number;
  noBreakEven: number;
  yesEvAtAsk: number;
  noEvAtAsk: number;
  bestEv: number;
  spread: number;
}

/**
 * Parse a user input probability into 0..1.
 * Accepts "68", "68%", "0.68", "0.68%".
 */
export function parseProbabilityInput(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  const cleaned = value.replace('%', '');
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  if (value.includes('%') || parsed > 1) {
    const pct = parsed / 100;
    if (pct < 0 || pct > 1) return null;
    return pct;
  }

  if (parsed < 0 || parsed > 1) return null;
  return parsed;
}

export function computeEdgeMetrics(market: MarketModel, trueProbability: number): EdgeMetrics {
  const yesAsk = market.yesAsk / 100;
  const noAsk = market.noAsk / 100;
  const yesBid = market.yesBid / 100;
  const marketMidProbability = market.impliedProbability;
  const spread = yesAsk - yesBid;

  const yesEvAtAsk = trueProbability - yesAsk;
  const noEvAtAsk = (1 - trueProbability) - noAsk;
  const bestEv = Math.max(yesEvAtAsk, noEvAtAsk);

  return {
    trueProbability,
    marketMidProbability,
    yesBreakEven: yesAsk,
    noBreakEven: noAsk,
    yesEvAtAsk,
    noEvAtAsk,
    bestEv,
    spread,
  };
}
