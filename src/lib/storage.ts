/**
 * Typed wrappers around chrome.storage.local.
 * Preferences stay local to the device to keep the Web Store permission and
 * privacy story as narrow as possible.
 */
import type {
  UserPrefs,
  ThesisData,
  Alert,
  PricePoint,
  MarketModel,
  NewsItem,
  ForecastRecord,
} from './types';
import { normalizePrefs } from './types';

const PREFS_KEY = 'prefs';

async function getStoredPrefs(area: 'local' | 'sync'): Promise<Partial<UserPrefs> | undefined> {
  return new Promise((resolve) => {
    chrome.storage[area].get([PREFS_KEY], (result) => {
      resolve(result[PREFS_KEY] as Partial<UserPrefs> | undefined);
    });
  });
}

async function setStoredPrefs(area: 'local' | 'sync', prefs: UserPrefs): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set({ [PREFS_KEY]: prefs }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

async function removeStoredPrefs(area: 'local' | 'sync'): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove([PREFS_KEY], () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ─── Local Storage: user preferences ─────────────────────────────────────────

export async function getPrefs(): Promise<UserPrefs> {
  const localPrefs = await getStoredPrefs('local');
  if (localPrefs) {
    return normalizePrefs(localPrefs);
  }

  const syncedPrefs = await getStoredPrefs('sync');
  if (!syncedPrefs) {
    return normalizePrefs();
  }

  const normalized = normalizePrefs(syncedPrefs);
  await setStoredPrefs('local', normalized);
  await removeStoredPrefs('sync').catch(() => undefined);
  return normalized;
}

export async function setPrefs(prefs: Partial<UserPrefs>): Promise<void> {
  const current = await getPrefs();
  const normalized = normalizePrefs({ ...current, ...prefs });
  await setStoredPrefs('local', normalized);
  await removeStoredPrefs('sync').catch(() => undefined);
}

export function watchPrefs(cb: (prefs: UserPrefs) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && changes[PREFS_KEY]) {
      cb(normalizePrefs(changes[PREFS_KEY].newValue as Partial<UserPrefs> | undefined));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ─── Local Storage: thesis (per-market) ──────────────────────────────────────

function thesisKey(ticker: string) {
  return `thesis:${ticker}`;
}

export async function getThesis(ticker: string): Promise<ThesisData | null> {
  const key = thesisKey(ticker);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve((result[key] as ThesisData) ?? null);
    });
  });
}

export async function setThesis(ticker: string, data: ThesisData): Promise<void> {
  const key = thesisKey(ticker);
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: data }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ─── Local Storage: alerts ────────────────────────────────────────────────────

const ALERTS_KEY = 'alerts';

export async function getAlerts(): Promise<Alert[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([ALERTS_KEY], (result) => {
      resolve((result[ALERTS_KEY] as Alert[]) ?? []);
    });
  });
}

export async function saveAlerts(alerts: Alert[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [ALERTS_KEY]: alerts }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ─── Local Storage: market cache ─────────────────────────────────────────────

function marketCacheKey(ticker: string) {
  return `market:${ticker}`;
}

export interface MarketCache {
  market: MarketModel;
  fetchedAt: number;
}

export async function getCachedMarket(ticker: string): Promise<MarketCache | null> {
  const key = marketCacheKey(ticker);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve((result[key] as MarketCache) ?? null);
    });
  });
}

export async function setCachedMarket(ticker: string, market: MarketModel): Promise<void> {
  const key = marketCacheKey(ticker);
  const entry: MarketCache = { market, fetchedAt: Date.now() };
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: entry }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ─── Local Storage: price history (sparkline) ────────────────────────────────

function priceHistoryKey(ticker: string) {
  return `history:${ticker}`;
}

const MAX_HISTORY_POINTS = 120; // 1 hour at 30s intervals

export async function appendPricePoint(ticker: string, price: number): Promise<void> {
  const key = priceHistoryKey(ticker);
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      const history: PricePoint[] = (result[key] as PricePoint[]) ?? [];
      history.push({ timestamp: Date.now(), price });
      // Keep only the last MAX_HISTORY_POINTS
      const trimmed = history.slice(-MAX_HISTORY_POINTS);
      chrome.storage.local.set({ [key]: trimmed }, () => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve();
      });
    });
  });
}

export async function getPriceHistory(ticker: string): Promise<PricePoint[]> {
  const key = priceHistoryKey(ticker);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve((result[key] as PricePoint[]) ?? []);
    });
  });
}

// ─── Local Storage: news cache ────────────────────────────────────────────────

function newsCacheKey(query: string) {
  return `news:${query.toLowerCase().replace(/\s+/g, '_').slice(0, 60)}`;
}

export interface NewsCache {
  items: NewsItem[];
  fetchedAt: number;
  query: string;
}

const NEWS_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function getCachedNews(query: string): Promise<NewsItem[] | null> {
  const key = newsCacheKey(query);
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      const cache = result[key] as NewsCache | undefined;
      if (!cache) return resolve(null);
      if (Date.now() - cache.fetchedAt > NEWS_TTL_MS) return resolve(null);
      resolve(cache.items);
    });
  });
}

export async function setCachedNews(query: string, items: NewsItem[]): Promise<void> {
  const key = newsCacheKey(query);
  const entry: NewsCache = { items, fetchedAt: Date.now(), query };
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: entry }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}

// ─── Local Storage: forecast journal ─────────────────────────────────────────

const FORECASTS_KEY = 'forecasts';

export async function getForecasts(): Promise<ForecastRecord[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get([FORECASTS_KEY], (result) => {
      resolve((result[FORECASTS_KEY] as ForecastRecord[]) ?? []);
    });
  });
}

export async function saveForecasts(forecasts: ForecastRecord[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [FORECASTS_KEY]: forecasts }, () => {
      if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
      else resolve();
    });
  });
}
