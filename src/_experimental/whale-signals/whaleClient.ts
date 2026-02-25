/**
 * WhaleClient: processes trade data to extract whale/smart-money signals.
 * Works with fetchTrades() from kalshiClient.ts to identify large trades.
 *
 * To use: copy to src/lib/whaleClient.ts
 */
import type { WhaleTrade, WhaleSignals } from './types';
// import { fetchTrades } from './kalshiClient';

// Time windows in milliseconds
const THIRTY_MINUTES = 30 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Volume spike threshold (200% of baseline = unusual)
const UNUSUAL_ACTIVITY_MULTIPLIER = 2.0;

// Baseline average daily volume (used when we can't calculate historical)
// This is a rough estimate for Kalshi markets
const BASELINE_DAILY_VOLUME = 50000;

/**
 * Add this to kalshiClient.ts:
 *
 * interface TradesListResponse {
 *   trades: KalshiRawTrade[];
 *   cursor?: string;
 * }
 *
 * const WHALE_THRESHOLD = 10000;
 * const LARGE_THRESHOLD = 1000;
 *
 * function classifyTrade(dollarValue: number): 'whale' | 'large' | 'retail' {
 *   if (dollarValue >= WHALE_THRESHOLD) return 'whale';
 *   if (dollarValue >= LARGE_THRESHOLD) return 'large';
 *   return 'retail';
 * }
 *
 * function normalizeToWhaleTrade(raw: KalshiRawTrade): WhaleTrade {
 *   const price = raw.taker_side === 'yes' ? raw.yes_price : raw.no_price;
 *   const dollarValue = raw.count * (price / 100);
 *   return {
 *     tradeId: raw.trade_id,
 *     ticker: raw.ticker,
 *     side: raw.taker_side,
 *     price,
 *     count: raw.count,
 *     dollarValue,
 *     timestamp: new Date(raw.created_time).getTime(),
 *     tier: classifyTrade(dollarValue),
 *   };
 * }
 *
 * export async function fetchTrades(
 *   ticker: string,
 *   minTimestamp?: number,
 *   limit = 200
 * ): Promise<WhaleTrade[]> {
 *   const params = new URLSearchParams({ ticker, limit: String(limit) });
 *   if (minTimestamp) {
 *     params.set('min_ts', String(Math.floor(minTimestamp / 1000)));
 *   }
 *   try {
 *     const data = await apiFetch<TradesListResponse>(`/markets/trades?${params}`);
 *     return (data.trades ?? []).map(normalizeToWhaleTrade);
 *   } catch (e) {
 *     console.warn('[KalshiClient] Failed to fetch trades:', ticker, e);
 *     return [];
 *   }
 * }
 */

// Placeholder - replace with actual import when re-enabling
async function fetchTrades(_ticker: string, _minTimestamp?: number, _limit?: number): Promise<WhaleTrade[]> {
  return [];
}

/**
 * Compute whale signals for a given market ticker.
 *
 * @param ticker Market ticker to analyze
 * @returns WhaleSignals with recent large trades, bias, and activity indicators
 */
export async function computeWhaleSignals(ticker: string): Promise<WhaleSignals> {
  const now = Date.now();
  const thirtyMinAgo = now - THIRTY_MINUTES;
  const twentyFourHoursAgo = now - TWENTY_FOUR_HOURS;

  // Fetch trades from last 24 hours (we'll filter for recent ones)
  const allTrades = await fetchTrades(ticker, twentyFourHoursAgo, 500);

  if (allTrades.length === 0) {
    return emptySignals(now);
  }

  // Filter to whale and large trades only (exclude retail)
  const significantTrades = allTrades.filter(t => t.tier !== 'retail');

  // Recent trades (last 30 min) - sorted by timestamp desc
  const recentTrades = significantTrades
    .filter(t => t.timestamp >= thirtyMinAgo)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20); // Cap at 20 most recent

  // Calculate 24h volume from all trades (including retail)
  const totalVolume24h = allTrades.reduce((sum, t) => sum + t.dollarValue, 0);

  // Calculate whale bias: weighted average of YES vs NO
  // +1 = all YES, -1 = all NO, 0 = balanced
  const whaleBias = calculateWhaleBias(significantTrades);

  // Calculate volume-weighted average entry price for whale/large trades
  const avgWhaleEntry = calculateAvgEntry(significantTrades);

  // Detect unusual activity: volume significantly above baseline
  const isUnusualActivity = totalVolume24h > BASELINE_DAILY_VOLUME * UNUSUAL_ACTIVITY_MULTIPLIER;

  return {
    recentTrades,
    totalVolume24h,
    whaleBias,
    avgWhaleEntry,
    isUnusualActivity,
    updatedAt: now,
  };
}

/**
 * Calculate whale bias from -1 (all NO) to +1 (all YES).
 * Weighted by dollar value of each trade.
 */
function calculateWhaleBias(trades: WhaleTrade[]): number {
  if (trades.length === 0) return 0;

  let yesVolume = 0;
  let noVolume = 0;

  for (const trade of trades) {
    if (trade.side === 'yes') {
      yesVolume += trade.dollarValue;
    } else {
      noVolume += trade.dollarValue;
    }
  }

  const total = yesVolume + noVolume;
  if (total === 0) return 0;

  // Normalize to -1 to +1 range
  return (yesVolume - noVolume) / total;
}

/**
 * Calculate volume-weighted average entry price for significant trades.
 * Returns price in cents (0-100).
 */
function calculateAvgEntry(trades: WhaleTrade[]): number {
  if (trades.length === 0) return 0;

  let totalWeightedPrice = 0;
  let totalVolume = 0;

  for (const trade of trades) {
    totalWeightedPrice += trade.price * trade.dollarValue;
    totalVolume += trade.dollarValue;
  }

  if (totalVolume === 0) return 0;
  return totalWeightedPrice / totalVolume;
}

/**
 * Return empty signals when no trades are available.
 */
function emptySignals(timestamp: number): WhaleSignals {
  return {
    recentTrades: [],
    totalVolume24h: 0,
    whaleBias: 0,
    avgWhaleEntry: 0,
    isUnusualActivity: false,
    updatedAt: timestamp,
  };
}
