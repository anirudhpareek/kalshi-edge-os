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
  result?: string;
}

export interface OrderBookLevel {
  // Price in dollars (0-1), e.g. 0.62
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

// ─── Multi-Outcome Events ─────────────────────────────────────────────────────

export interface EventModel {
  eventTicker: string;
  seriesTicker: string;
  title: string;
  subtitle?: string;
  category?: string;
  /** All outcome markets in this event */
  markets: MarketModel[];
  /** True if this event has more than one outcome market */
  isMultiOutcome: boolean;
  /** Sum of implied probabilities across all outcomes (should be ~1.0) */
  probabilitySum: number;
  /** True if probability sum deviates significantly from 1.0 (potential arbitrage) */
  hasArbitrage: boolean;
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
  myConfidence: string;
  myThesis: string;
  whatWouldChangeMyMind: string;
  updatedAt: number;
}

// ─── Forecast Journal ─────────────────────────────────────────────────────────

export interface ForecastRecord {
  id: string;
  marketTicker: string;
  marketTitle: string;
  forecastProbability: number; // 0..1
  confidence?: number; // 0..1
  marketProbabilityAtEntry: number; // 0..1
  side?: 'yes' | 'no';
  sizeUsd?: number;
  effectiveFillPrice?: number; // 0..1
  forecastEvPct?: number;
  realizedEvPct?: number;
  depthCoverage?: number; // 0..1
  spreadCentsAtEntry?: number;
  seriesTicker?: string;
  category?: string;
  createdAt: number;
  resolvedAt?: number;
  outcome?: 0 | 1;
  brierScore?: number;
}

export interface PositionSnapshot {
  forecastId: string;
  marketTicker: string;
  marketTitle: string;
  side: 'yes' | 'no';
  sizeUsd: number;
  entryEvPct: number;
  currentEdgePct: number;
  edgeDriftPct: number;
  spreadCents: number;
  status: string;
  seriesTicker?: string;
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export type AlertCondition = 'above' | 'below' | 'move' | 'edgeAbove' | 'edgeBelow' | 'spreadWide';

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

export type BlockType = 'intelligence' | 'outcomes' | 'context' | 'thesis' | 'related' | 'alerts' | 'review';
export type BlockSize = 'small' | 'medium' | 'large';
export type WorkMode = 'analyze' | 'review';

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
  mode: WorkMode;
  blocks: BlockConfig[];
  llmEnabled: boolean;
  llmApiKey: string;
  pollingIntervalSeconds: number;
}

export const DEFAULT_BLOCKS: BlockConfig[] = [
  { id: 'intelligence', visible: true,  size: 'medium', order: 0 },
  { id: 'thesis',       visible: true,  size: 'medium', order: 1 },
  { id: 'outcomes',     visible: true,  size: 'small',  order: 2 },
  { id: 'context',      visible: true,  size: 'medium', order: 3 },
  { id: 'related',      visible: true,  size: 'small',  order: 4 },
  { id: 'alerts',       visible: true,  size: 'small',  order: 5 },
  { id: 'review',       visible: false, size: 'medium', order: 6 },
];

const MODE_BLOCKS: Record<WorkMode, BlockType[]> = {
  analyze: ['intelligence', 'thesis', 'outcomes', 'context', 'related', 'alerts'],
  review: ['review', 'thesis'],
};

export function blocksForMode(mode: WorkMode): BlockConfig[] {
  const visible = new Set(MODE_BLOCKS[mode]);
  const order = MODE_BLOCKS[mode];
  const fallback = DEFAULT_BLOCKS.map((b) => b.id);

  return DEFAULT_BLOCKS.map((block) => {
    const modeOrder = order.indexOf(block.id);
    const fallbackOrder = fallback.indexOf(block.id);
    return {
      ...block,
      visible: visible.has(block.id),
      order: modeOrder >= 0 ? modeOrder : fallbackOrder + order.length,
    };
  }).sort((a, b) => a.order - b.order);
}

export type StoredWorkMode = WorkMode | 'quick' | 'deep';

type StoredPrefs = Partial<Omit<UserPrefs, 'mode' | 'blocks'>> & {
  mode?: StoredWorkMode | string;
  blocks?: unknown;
};

function isBlockType(value: unknown): value is BlockType {
  return DEFAULT_BLOCKS.some((block) => block.id === value);
}

function isBlockSize(value: unknown): value is BlockSize {
  return value === 'small' || value === 'medium' || value === 'large';
}

export function normalizeMode(mode: unknown): WorkMode {
  return mode === 'review' ? 'review' : 'analyze';
}

export function normalizeBlocks(blocks: unknown, mode: WorkMode): BlockConfig[] {
  if (!Array.isArray(blocks)) {
    return blocksForMode(mode);
  }

  const presetById = new Map(blocksForMode(mode).map((block) => [block.id, block]));
  const storedById = new Map<BlockType, Partial<BlockConfig>>();

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const candidate = block as Partial<BlockConfig>;
    if (!isBlockType(candidate.id)) continue;
    storedById.set(candidate.id, candidate);
  }

  if (storedById.size === 0) {
    return blocksForMode(mode);
  }

  return DEFAULT_BLOCKS.map((block) => {
    const preset = presetById.get(block.id) ?? block;
    const stored = storedById.get(block.id);
    return {
      ...preset,
      visible: typeof stored?.visible === 'boolean' ? stored.visible : preset.visible,
      size: isBlockSize(stored?.size) ? stored.size : preset.size,
      order: typeof stored?.order === 'number' ? stored.order : preset.order,
    };
  }).sort((a, b) => a.order - b.order);
}

export function normalizePrefs(stored?: StoredPrefs | null): UserPrefs {
  const mode = normalizeMode(stored?.mode);
  const legacyMode = stored?.mode === 'quick' || stored?.mode === 'deep';

  return {
    panelOpen: typeof stored?.panelOpen === 'boolean' ? stored.panelOpen : true,
    panelWidth: typeof stored?.panelWidth === 'number' ? stored.panelWidth : 380,
    theme:
      stored?.theme === 'light' || stored?.theme === 'dark' || stored?.theme === 'system'
        ? stored.theme
        : 'system',
    mode,
    blocks: legacyMode ? blocksForMode(mode) : normalizeBlocks(stored?.blocks, mode),
    llmEnabled: typeof stored?.llmEnabled === 'boolean' ? stored.llmEnabled : false,
    llmApiKey: typeof stored?.llmApiKey === 'string' ? stored.llmApiKey : '',
    pollingIntervalSeconds:
      typeof stored?.pollingIntervalSeconds === 'number'
        ? stored.pollingIntervalSeconds
        : 30,
  };
}

export const DEFAULT_PREFS: UserPrefs = normalizePrefs({
  mode: 'analyze',
  blocks: DEFAULT_BLOCKS,
});

// ─── Messaging ────────────────────────────────────────────────────────────────

export type MessageType =
  | 'FETCH_MARKET'
  | 'FETCH_EVENT'
  | 'FETCH_RELATED'
  | 'FETCH_NEWS'
  | 'SUMMARIZE_NEWS'
  | 'GET_PRICE_HISTORY'
  | 'SET_ALERT'
  | 'DELETE_ALERT'
  | 'GET_ALERTS'
  | 'TRIGGER_NOTIFICATION'
  | 'FETCH_ORDERBOOK'
  | 'ADD_FORECAST'
  | 'GET_FORECASTS'
  | 'REFRESH_FORECASTS'
  | 'GET_POSITION_MONITOR';

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
