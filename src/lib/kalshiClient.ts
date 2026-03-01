/**
 * KalshiClient: thin wrapper around the Kalshi public Trade API v2.
 * All fetches are performed from the background service worker.
 * Base URL: https://api.elections.kalshi.com/trade-api/v2
 */
import type {
  MarketModel,
  RelatedMarket,
  EventModel,
  KalshiRawMarket,
  KalshiRawEvent,
  OrderBook,
  OrderBookLevel,
} from './types';
import { getCanonicalMarketUrl } from './urls';

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2';

// ─── URL Parsing ──────────────────────────────────────────────────────────────

/**
 * Extract a market ticker or event ticker from a Kalshi URL.
 * Kalshi URL patterns:
 *   /markets/SERIES/slug/MARKET-TICKER  → market ticker (3 segments)
 *   /markets/SERIES/slug                → series ticker (2 segments, treated as event)
 *   /markets/TICKER                     → market ticker (1 segment, legacy)
 *   /events/TICKER                      → event ticker
 */
export function extractTickerFromURL(url: string): { ticker: string; type: 'market' | 'event' | 'series' } | null {
  try {
    const u = new URL(url);
    const path = u.pathname;

    // /markets/... paths
    // Kalshi URL pattern: /markets/{series}/{slug}/{event-ticker}
    // e.g. /markets/kxbtcd/bitcoin-price-abovebelow/kxbtcd-26feb2209
    // The last segment is an EVENT ticker, not a market ticker.
    const marketPath = path.match(/^\/markets\/(.+)/i);
    if (marketPath) {
      const segments = marketPath[1].split('/').filter(Boolean);
      if (segments.length >= 3) {
        // /markets/SERIES/slug/EVENT-TICKER → last segment is event ticker
        return { ticker: segments[segments.length - 1].toUpperCase(), type: 'event' };
      }
      if (segments.length === 2) {
        // /markets/SERIES/slug → series overview page
        return { ticker: segments[0].toUpperCase(), type: 'series' };
      }
      if (segments.length === 1) {
        // /markets/TICKER → could be event or series
        return { ticker: segments[0].toUpperCase(), type: 'event' };
      }
      return null;
    }

    // /events/SOME-TICKER or /event/SOME-TICKER
    const eventMatch = path.match(/^\/events?\/([A-Z0-9][A-Z0-9\-]+)/i);
    if (eventMatch) {
      return { ticker: eventMatch[1].toUpperCase(), type: 'event' };
    }

    return null;
  } catch {
    return null;
  }
}

// ─── Normalization ────────────────────────────────────────────────────────────

/** Convert dollar string (e.g. "0.65") to cents (65), or return fallback. */
function dollarsToCents(dollars: string | undefined, fallback: number): number {
  if (dollars == null) return fallback;
  const parsed = parseFloat(dollars);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : fallback;
}

function normalizeMarket(raw: KalshiRawMarket): MarketModel {
  // Prefer new _dollars fields, fall back to legacy cent fields
  const yesBid = dollarsToCents(raw.yes_bid_dollars, raw.yes_bid ?? 0);
  const yesAsk = dollarsToCents(raw.yes_ask_dollars, raw.yes_ask ?? 100);
  const noBid = dollarsToCents(raw.no_bid_dollars, raw.no_bid ?? 0);
  const noAsk = dollarsToCents(raw.no_ask_dollars, raw.no_ask ?? 100);
  const lastPrice = dollarsToCents(raw.last_price_dollars, raw.last_price ?? Math.round((yesBid + yesAsk) / 2));
  const mid = (yesBid + yesAsk) / 2;

  return {
    ticker: raw.ticker,
    title: raw.title ?? raw.ticker,
    subtitle: raw.subtitle ?? '',
    eventTicker: raw.event_ticker ?? '',
    seriesTicker: raw.series_ticker ?? '',
    status: raw.status ?? 'unknown',
    yesBid,
    yesAsk,
    noBid: noBid,
    noAsk: noAsk,
    lastPrice,
    impliedProbability: mid / 100,
    volume: raw.volume ?? 0,
    volume24h: raw.volume_24h ?? 0,
    openInterest: raw.open_interest ?? 0,
    closeTime: raw.close_time ?? '',
    expirationTime: raw.expiration_time ?? '',
    category: '',
    tags: raw.tags ?? [],
    rulesDescription: raw.rules_primary ?? '',
    result: raw.result,
  };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

interface FetchOptions {
  signal?: AbortSignal;
}

async function apiFetch<T>(path: string, opts?: FetchOptions): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
    },
    signal: opts?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kalshi API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json() as Promise<T>;
}

interface MarketsListResponse {
  markets: KalshiRawMarket[];
  cursor?: string;
}

interface RawOrderBookResponse {
  orderbook?: {
    yes?: Array<[number, number]>;
    no?: Array<[number, number]>;
    yes_dollars?: Array<[string, number]>;
    no_dollars?: Array<[string, number]>;
  };
  orderbook_fp?: {
    yes_dollars?: Array<[string, number]>;
    no_dollars?: Array<[string, number]>;
  };
}

function parseOrderBookLevels(
  levels: Array<[string | number, number]> | undefined,
  asDollars: boolean
): OrderBookLevel[] {
  if (!levels || levels.length === 0) return [];
  return levels
    .map(([priceRaw, quantity]) => {
      const parsedPrice = typeof priceRaw === 'string' ? parseFloat(priceRaw) : priceRaw;
      if (!Number.isFinite(parsedPrice) || !Number.isFinite(quantity)) return null;
      return {
        price: asDollars ? parsedPrice : parsedPrice / 100,
        quantity: Math.max(0, quantity),
      };
    })
    .filter((x): x is OrderBookLevel => x != null)
    .sort((a, b) => a.price - b.price);
}

// ─── Market Fetching ──────────────────────────────────────────────────────────

export async function fetchMarketByTicker(ticker: string): Promise<MarketModel> {
  const data = await apiFetch<{ market: KalshiRawMarket }>(`/markets/${ticker}`);
  return normalizeMarket(data.market);
}

export async function fetchOrderBookByTicker(ticker: string): Promise<OrderBook> {
  const data = await apiFetch<RawOrderBookResponse>(`/markets/${ticker}/orderbook`);
  const yesDollar = data.orderbook?.yes_dollars ?? data.orderbook_fp?.yes_dollars ?? [];
  const noDollar = data.orderbook?.no_dollars ?? data.orderbook_fp?.no_dollars ?? [];
  const yesCent = data.orderbook?.yes ?? [];
  const noCent = data.orderbook?.no ?? [];

  return {
    yes: yesDollar.length > 0
      ? parseOrderBookLevels(yesDollar, true)
      : parseOrderBookLevels(yesCent, false),
    no: noDollar.length > 0
      ? parseOrderBookLevels(noDollar, true)
      : parseOrderBookLevels(noCent, false),
  };
}

export async function fetchEventByTicker(ticker: string): Promise<{ markets: MarketModel[] }> {
  const data = await apiFetch<{ event: KalshiRawEvent; markets?: KalshiRawMarket[] }>(`/events/${ticker}`);
  // Some responses nest markets inside the event, some at top level
  const rawMarkets: KalshiRawMarket[] = data.markets ?? data.event.markets ?? [];
  return { markets: rawMarkets.map(normalizeMarket) };
}

/**
 * Fetch full event data with all outcome markets.
 * Returns an EventModel with computed multi-outcome metadata.
 */
export async function fetchEventWithMarkets(eventTicker: string): Promise<EventModel | null> {
  try {
    const data = await apiFetch<{ event: KalshiRawEvent; markets?: KalshiRawMarket[] }>(`/events/${eventTicker}`);
    const rawEvent = data.event;
    const rawMarkets: KalshiRawMarket[] = data.markets ?? rawEvent.markets ?? [];

    if (rawMarkets.length === 0) {
      return null;
    }

    const markets = rawMarkets.map(normalizeMarket);

    // Sort by probability (highest first)
    markets.sort((a, b) => b.impliedProbability - a.impliedProbability);

    // Compute probability sum
    const probabilitySum = markets.reduce((sum, m) => sum + m.impliedProbability, 0);

    // Arbitrage threshold: if sum deviates more than 5% from 1.0
    const hasArbitrage = Math.abs(probabilitySum - 1.0) > 0.05;

    return {
      eventTicker: rawEvent.event_ticker,
      seriesTicker: rawEvent.series_ticker ?? '',
      title: rawEvent.title,
      subtitle: rawEvent.sub_title,
      category: rawEvent.category,
      markets,
      isMultiOutcome: markets.length > 1,
      probabilitySum,
      hasArbitrage,
    };
  } catch (e) {
    console.warn('[KalshiClient] Failed to fetch event:', eventTicker, e);
    return null;
  }
}

export async function fetchMarketsBySeries(seriesTicker: string): Promise<{ markets: MarketModel[] }> {
  const data = await apiFetch<MarketsListResponse>(`/markets?series_ticker=${seriesTicker}&limit=20`);
  return { markets: (data.markets ?? []).map(normalizeMarket) };
}

/**
 * Fetch market for a URL. If the URL points to an event or series, returns the first market.
 */
export async function fetchMarketForURL(url: string): Promise<MarketModel | null> {
  const parsed = extractTickerFromURL(url);
  if (!parsed) {
    throw new Error(`Could not extract ticker from URL: ${url}`);
  }

  console.log('[KalshiClient] Extracted ticker:', parsed.ticker, 'type:', parsed.type, 'from:', url);

  // Try event first, then fall back to market, then series.
  // Kalshi URLs typically use event tickers in the path.
  if (parsed.type === 'event') {
    try {
      const { markets } = await fetchEventByTicker(parsed.ticker);
      if (markets.length > 0) return markets[0];
    } catch {
      // Event lookup failed — try as market ticker instead
      console.log('[KalshiClient] Event lookup failed, trying as market ticker:', parsed.ticker);
      try {
        return await fetchMarketByTicker(parsed.ticker);
      } catch { /* fall through to series */ }
    }
    // Last resort: try as series
    const { markets } = await fetchMarketsBySeries(parsed.ticker.split('-')[0]);
    if (markets.length > 0) return markets[0];
    throw new Error(`No markets found for ticker: ${parsed.ticker}`);
  } else if (parsed.type === 'market') {
    return await fetchMarketByTicker(parsed.ticker);
  } else {
    // series — list markets in this series
    const { markets } = await fetchMarketsBySeries(parsed.ticker);
    if (markets.length === 0) {
      throw new Error(`No markets found for series: ${parsed.ticker}`);
    }
    return markets[0];
  }
}

// ─── Related Markets ──────────────────────────────────────────────────────────

/**
 * Fetch related markets for a given market.
 *
 * Strategy:
 * 1. Same event (most related)
 * 2. Same series
 * 3. Keyword overlap in title
 *
 * Only includes markets that have a resolvable canonical URL.
 * Continues fetching until we have minValid (5) valid links or exhaust candidates.
 */
export async function fetchRelatedMarkets(
  market: MarketModel,
  limit = 10,
  minValid = 5
): Promise<RelatedMarket[]> {
  const results: RelatedMarket[] = [];
  const seen = new Set<string>([market.ticker]);

  /**
   * Add a market to results if it has a valid URL and we haven't seen it.
   * Returns true if added.
   */
  function tryAdd(raw: KalshiRawMarket): boolean {
    if (seen.has(raw.ticker)) return false;

    const related = toRelated(raw);

    // Only include markets with a valid canonical URL
    if (!related.url) {
      console.log('[KalshiClient] Skipping market without URL:', raw.ticker);
      return false;
    }

    seen.add(raw.ticker);
    results.push(related);
    return true;
  }

  // 1. Same event (highest relevance)
  if (market.eventTicker) {
    try {
      const data = await apiFetch<MarketsListResponse>(
        `/markets?event_ticker=${market.eventTicker}&limit=30`
      );
      for (const m of data.markets ?? []) {
        if (results.length >= limit) break;
        tryAdd(m);
      }
    } catch (e) {
      console.warn('[KalshiClient] Failed to fetch event markets:', e);
    }
  }

  // 2. Same series (high relevance)
  if (results.length < limit && market.seriesTicker) {
    try {
      const data = await apiFetch<MarketsListResponse>(
        `/markets?series_ticker=${market.seriesTicker}&limit=30`
      );
      for (const m of data.markets ?? []) {
        if (results.length >= limit) break;
        tryAdd(m);
      }
    } catch (e) {
      console.warn('[KalshiClient] Failed to fetch series markets:', e);
    }
  }

  // 3. Keyword fallback: title overlap (medium relevance)
  // Only do this if we don't have enough results yet
  if (results.length < minValid) {
    try {
      const data = await apiFetch<MarketsListResponse>(`/markets?limit=50&status=open`);
      const titleWords = new Set(
        market.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );

      const scored = (data.markets ?? [])
        .filter((m) => !seen.has(m.ticker))
        .map((m) => {
          const words = m.title.toLowerCase().split(/\s+/);
          const overlap = words.filter((w) => titleWords.has(w)).length;
          return { m, overlap };
        })
        .filter(({ overlap }) => overlap > 0)
        .sort((a, b) => b.overlap - a.overlap);

      for (const { m } of scored) {
        if (results.length >= limit) break;
        tryAdd(m);
      }
    } catch (e) {
      console.warn('[KalshiClient] Failed to fetch keyword markets:', e);
    }
  }

  // 4. If still under minValid, fetch popular open markets
  if (results.length < minValid) {
    try {
      const data = await apiFetch<MarketsListResponse>(`/markets?limit=50&status=open`);

      // Sort by volume to get popular markets
      const sorted = (data.markets ?? [])
        .filter((m) => !seen.has(m.ticker))
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

      for (const m of sorted) {
        if (results.length >= limit) break;
        tryAdd(m);
      }
    } catch (e) {
      console.warn('[KalshiClient] Failed to fetch popular markets:', e);
    }
  }

  return results.slice(0, limit);
}

function toRelated(raw: KalshiRawMarket): RelatedMarket {
  const yesBid = dollarsToCents(raw.yes_bid_dollars, raw.yes_bid ?? 0);
  const yesAsk = dollarsToCents(raw.yes_ask_dollars, raw.yes_ask ?? 100);
  const mid = (yesBid + yesAsk) / 2;

  const eventTicker = raw.event_ticker ?? '';
  const seriesTicker = raw.series_ticker ?? '';

  // Compute canonical URL using event_ticker (most reliable)
  const url = getCanonicalMarketUrl({
    ticker: raw.ticker,
    eventTicker,
    seriesTicker,
    title: raw.title,
  });

  return {
    ticker: raw.ticker,
    eventTicker,
    seriesTicker,
    title: raw.title ?? raw.ticker,
    impliedProbability: mid / 100,
    volume: raw.volume ?? 0,
    status: raw.status ?? 'unknown',
    url,
    urlValid: null, // Not validated yet
  };
}
