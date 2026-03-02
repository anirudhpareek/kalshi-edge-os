import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MarketModel,
  EventModel,
  PricePoint,
  RelatedMarket,
  NewsItem,
  OrderBook,
  Msg,
  MsgResponse,
} from '../../lib/types';

// ─── Messaging helper ─────────────────────────────────────────────────────────

function sendMsg<T>(msg: Msg): Promise<MsgResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response: MsgResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response ?? { ok: false, error: 'No response' });
      }
    });
  });
}

// ─── Market Data hook ─────────────────────────────────────────────────────────

export function useMarketData(ticker: string | null, url: string) {
  const [market, setMarket] = useState<MarketModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch = useCallback(async () => {
    if (!ticker && !url) return;
    setLoading((p) => (market ? p : true));

    // Send both when available: background resolver will prefer a precise
    // market ticker and fall back to URL-based event routing if needed.
    const payload = { ticker, url };
    const res = await sendMsg<MarketModel>({
      type: 'FETCH_MARKET',
      payload,
    });

    if (res.ok && res.data) {
      setMarket(res.data);
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load market data');
    }
    setLoading(false);
  }, [ticker, url]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ticker && !url) return;
    void fetch();

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetch, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ticker, url, fetch]);

  return { market, loading, error, refresh: fetch };
}

// ─── Price History hook ───────────────────────────────────────────────────────

export function usePriceHistory(ticker: string | null) {
  const [history, setHistory] = useState<PricePoint[]>([]);

  useEffect(() => {
    if (!ticker) return;

    const load = async () => {
      const res = await sendMsg<PricePoint[]>({
        type: 'GET_PRICE_HISTORY',
        payload: { ticker },
      });
      if (res.ok && res.data) setHistory(res.data);
    };

    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [ticker]);

  return history;
}

// ─── Related Markets hook ─────────────────────────────────────────────────────

export function useRelatedMarkets(market: MarketModel | null) {
  const [related, setRelated] = useState<RelatedMarket[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!market) return;
    setLoading(true);

    sendMsg<RelatedMarket[]>({
      type: 'FETCH_RELATED',
      payload: { market },
    }).then((res) => {
      if (res.ok && res.data) setRelated(res.data);
      setLoading(false);
    });
  }, [market?.ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  return { related, loading };
}

// ─── News hook ────────────────────────────────────────────────────────────────

export function useNews(query: string | null) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!query) return;
    setLoading(true);

    const res = await sendMsg<NewsItem[]>({
      type: 'FETCH_NEWS',
      payload: { query },
    });

    if (res.ok && res.data) {
      setNews(res.data);
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load news');
    }
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void fetch();
    const id = setInterval(fetch, 15 * 60 * 1000); // refresh every 15 min
    return () => clearInterval(id);
  }, [fetch]);

  return { news, loading, error, refresh: fetch };
}

// ─── LLM Summary hook ────────────────────────────────────────────────────────

export function useLLMSummary(
  news: NewsItem[],
  marketTitle: string | null,
  enabled: boolean,
  apiKey: string
) {
  const [bullets, setBullets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !apiKey || news.length === 0 || !marketTitle) return;

    setLoading(true);
    sendMsg<string[]>({
      type: 'SUMMARIZE_NEWS',
      payload: { headlines: news, marketTitle, apiKey },
    }).then((res) => {
      if (res.ok && res.data) {
        setBullets(res.data);
        setError(null);
      } else {
        setError(res.error ?? 'Summarization failed');
      }
      setLoading(false);
    });
  }, [enabled, apiKey, news.length, marketTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  return { bullets, loading, error };
}

// ─── Event Data hook (multi-outcome markets) ─────────────────────────────────

export function useEventData(eventTicker: string | null) {
  const [event, setEvent] = useState<EventModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventTicker) {
      setEvent(null);
      return;
    }

    setLoading(true);
    sendMsg<EventModel | null>({
      type: 'FETCH_EVENT',
      payload: { eventTicker },
    }).then((res) => {
      if (res.ok && res.data) {
        setEvent(res.data);
        setError(null);
      } else {
        setEvent(null);
        setError(res.error ?? 'Failed to load event');
      }
      setLoading(false);
    });
  }, [eventTicker]);

  return { event, loading, error };
}

// ─── Order Book hook ─────────────────────────────────────────────────────────

export function useOrderBook(ticker: string | null) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!ticker) return;
    setLoading(true);
    const res = await sendMsg<OrderBook>({
      type: 'FETCH_ORDERBOOK',
      payload: { ticker },
    });
    if (res.ok && res.data) {
      setOrderBook(res.data);
    }
    setLoading(false);
  }, [ticker]);

  useEffect(() => {
    if (!ticker) {
      setOrderBook(null);
      return;
    }
    void load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [ticker, load]);

  return { orderBook, loading, refresh: load };
}
