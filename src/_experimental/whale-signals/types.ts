/**
 * Whale Signals Types
 * Add these to src/lib/types.ts to re-enable the feature
 */

// Add to MessageType union:
// | 'FETCH_WHALE_SIGNALS'

// Add to BlockType union:
// | 'whales'

// Add to DEFAULT_BLOCKS array:
// { id: 'whales', visible: true, size: 'small', order: 2 },

export interface KalshiRawTrade {
  trade_id: string;
  ticker: string;
  count: number;
  yes_price: number;
  no_price: number;
  taker_side: 'yes' | 'no';
  created_time: string;
}

export type WhaleTier = 'whale' | 'large' | 'retail';

export interface WhaleTrade {
  tradeId: string;
  ticker: string;
  side: 'yes' | 'no';
  price: number;        // cents (0-100)
  count: number;        // number of contracts
  dollarValue: number;  // approximate dollar value
  timestamp: number;    // unix ms
  tier: WhaleTier;
}

export interface WhaleSignals {
  /** Large trades in the time window */
  recentTrades: WhaleTrade[];
  /** Total dollar volume in 24h */
  totalVolume24h: number;
  /** Whale bias: -1 (all NO) to +1 (all YES) */
  whaleBias: number;
  /** Volume-weighted average entry price for whales */
  avgWhaleEntry: number;
  /** True if volume is significantly above normal */
  isUnusualActivity: boolean;
  /** Last updated timestamp */
  updatedAt: number;
}
