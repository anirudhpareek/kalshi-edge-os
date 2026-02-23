// ─── Core Domain Types ───────────────────────────────────────────────────────

export interface MarketModel {
  ticker: string;
  title: string;
  subtitle: string;
  eventTicker: string;
  seriesTicker: string;
  status: 'open' | 'closed' | 'settled' | 'halted' | string;
  // Prices in cents (0-100), i.e. yes_bid=65 means 65 cents = 65% probability
  yesBid: number;
  yesAsk: number;
  noBid: number;
  noAsk: number;
  lastPrice: number;
  impliedProbability: number; // 0-1
  volume: number;
  volume24h: number;
  openInterest: number;
  closeTime: string;
  expirationTime: string;
  category: string;
  tags: string[];
  rulesDescription: string;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  yes: OrderBookLevel[];
  no: OrderBookLevel[];
}

export interface PricePoint {
  timestamp: number; // unix ms
  price: number;     // 0-100 cents
}

export interface RelatedMarket {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  impliedProbability: number;
  volume: number;
  status: string;
  /** Canonical URL for this market. Null if we can't construct a reliable URL. */
  url: string | null;
  /** Whether the URL has been validated as working (true/false/null=not checked) */
  urlValid: boolean | null;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

// ─── Thesis ──────────────────────────────────────────────────────────────────

export interface ThesisData {
  myProbability: string;
  myThesis: string;
  whatWouldChangeMyMind: string;
  updatedAt: number;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertCondition = 'above' | 'below' | 'move';

export interface Alert {
  id: string;
  marketTicker: string;
  marketTitle: string;
  condition: AlertCondition;
  threshold: number;    // for above/below: price 0-100; for move: percent change
  timeWindowMinutes?: number; // for 'move' type
  enabled: boolean;
  createdAt: number;
  lastTriggered?: number;
  lastPrice?: number; // snapshot for 'move' baseline
}

// ─── Block System ─────────────────────────────────────────────────────────────

export type BlockType = 'intelligence' | 'context' | 'thesis' | 'related' | 'alerts';
export type BlockSize = 'small' | 'medium' | 'large';

export interface BlockConfig {
  id: BlockType;
  visible: boolean;
  size: BlockSize;
  order: number;
}

// ─── User Prefs ───────────────────────────────────────────────────────────────

export interface UserPrefs {
  panelOpen: boolean;
  panelWidth: number;
  theme: 'system' | 'light' | 'dark';
  blocks: BlockConfig[];
  llmEnabled: boolean;
  llmApiKey: string;
  pollingIntervalSeconds: number;
}

export const DEFAULT_BLOCKS: BlockConfig[] = [
  { id: 'intelligence', visible: true,  size: 'medium', order: 0 },
  { id: 'context',      visible: true,  size: 'medium', order: 1 },
  { id: 'thesis',       visible: true,  size: 'medium', order: 2 },
  { id: 'related',      visible: true,  size: 'small',  order: 3 },
  { id: 'alerts',       visible: true,  size: 'small',  order: 4 },
];

export const DEFAULT_PREFS: UserPrefs = {
  panelOpen: true,
  panelWidth: 380,
  theme: 'system',
  blocks: DEFAULT_BLOCKS,
  llmEnabled: false,
  llmApiKey: '',
  pollingIntervalSeconds: 30,
};

// ─── Messaging ────────────────────────────────────────────────────────────────

export type MessageType =
  | 'FETCH_MARKET'
  | 'FETCH_RELATED'
  | 'FETCH_NEWS'
  | 'SUMMARIZE_NEWS'
  | 'GET_PRICE_HISTORY'
  | 'SET_ALERT'
  | 'DELETE_ALERT'
  | 'GET_ALERTS'
  | 'TRIGGER_NOTIFICATION';

export interface Msg<T = Record<string, unknown>> {
  type: MessageType;
  payload: T;
}

export interface MsgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Kalshi Raw API shapes ─────────────────────────────────────────────────

export interface KalshiRawMarket {
  ticker: string;
  event_ticker: string;
  series_ticker?: string;
  market_type: string;
  title: string;
  subtitle: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  open_time: string;
  close_time: string;
  expiration_time: string;
  latest_expiration_time?: string;
  status: string;
  // New dollar-denominated fields (fixed-point strings, e.g. "0.65")
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  previous_yes_bid_dollars?: string;
  previous_yes_ask_dollars?: string;
  previous_price_dollars?: string;
  // Legacy cent fields (deprecated, removed after Feb 26 2026)
  yes_bid?: number;
  yes_ask?: number;
  no_bid?: number;
  no_ask?: number;
  last_price?: number;
  previous_yes_bid?: number;
  previous_yes_ask?: number;
  previous_price?: number;
  volume: number;
  volume_24h: number;
  open_interest: number;
  result?: string;
  rules_primary?: string;
  rules_secondary?: string;
  tags?: string[];
}

export interface KalshiRawEvent {
  event_ticker: string;
  series_ticker?: string;
  title: string;
  sub_title?: string;
  category?: string;
  markets?: KalshiRawMarket[];
}
