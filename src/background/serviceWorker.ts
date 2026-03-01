/**
 * Background Service Worker (MV3)
 * Handles: API fetching, alert polling, notifications, caching.
 * Communicates with content scripts via chrome.runtime.onMessage.
 */
import {
  fetchMarketByTicker,
  fetchOrderBookByTicker,
  fetchRelatedMarkets,
  fetchMarketForURL,
  fetchEventWithMarkets,
} from '../lib/kalshiClient';
import { fetchNews, summarizeWithLLM } from '../lib/newsClient';
import {
  setCachedMarket,
  getCachedMarket,
  appendPricePoint,
  getPriceHistory,
  getAlerts,
  getPrefs,
  getThesis,
  getForecasts,
  saveForecasts,
} from '../lib/storage';
import {
  setupPollingAlarm,
  evaluateAlerts,
  markAlertsTriggered,
  sendAlertNotification,
  addAlert,
  removeAlert,
} from '../lib/alerts';
import type {
  Msg,
  MsgResponse,
  Alert,
  MarketModel,
  ForecastRecord,
} from '../lib/types';
import { parseProbabilityInput } from '../lib/edge';
import { brierScore, parseResolvedOutcome } from '../lib/forecast';

// ─── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  console.log('[KalshiIntel] Service worker installed');
  setupPollingAlarm(30);
});

self.addEventListener('activate', () => {
  console.log('[KalshiIntel] Service worker activated');
});

// ─── Polling via Alarms ───────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'kalshi-poll') return;
  await runPollCycle();
});

/**
 * Poll all currently tracked markets (those that have cached entries) and
 * evaluate alerts.
 */
async function runPollCycle(): Promise<void> {
  try {
    const alerts = await getAlerts();
    if (alerts.length === 0) return;

    const tickersToWatch = [...new Set(alerts.map((a) => a.marketTicker))];

    for (const ticker of tickersToWatch) {
      try {
        const market = await fetchMarketByTicker(ticker);
        await setCachedMarket(ticker, market);
        const priceInPct = market.impliedProbability * 100;
        await appendPricePoint(ticker, priceInPct);

        const history = await getPriceHistory(ticker);
        const thesis = await getThesis(ticker);
        const trueProbability = parseProbabilityInput(thesis?.myProbability ?? '');
        const triggered = evaluateAlerts(alerts, ticker, market, trueProbability, priceInPct, history);

        if (triggered.length > 0) {
          const ids = triggered.map((t) => t.alert.id);
          await markAlertsTriggered(ids);

          for (const { alert, message } of triggered) {
            sendAlertNotification(message, `kalshi-alert-${alert.id}-${Date.now()}`);
          }
        }
      } catch (err) {
        console.warn(`[KalshiIntel] Poll error for ${ticker}:`, err);
      }
    }
  } catch (err) {
    console.error('[KalshiIntel] Poll cycle error:', err);
  }
}

async function refreshForecastResolutions(): Promise<ForecastRecord[]> {
  const forecasts = await getForecasts();
  const unresolved = forecasts.filter((f) => f.outcome == null);
  if (unresolved.length === 0) return forecasts;

  const byTicker = new Map<string, ForecastRecord[]>();
  for (const record of unresolved) {
    const group = byTicker.get(record.marketTicker) ?? [];
    group.push(record);
    byTicker.set(record.marketTicker, group);
  }

  const updates = new Map<string, { outcome: 0 | 1; resolvedAt: number; brierScore: number }>();

  for (const [ticker, records] of byTicker.entries()) {
    try {
      const market = await fetchMarketByTicker(ticker);
      if (market.status !== 'settled') continue;
      const outcome = parseResolvedOutcome(market.result);
      if (outcome == null) continue;

      for (const record of records) {
        updates.set(record.id, {
          outcome,
          resolvedAt: Date.now(),
          brierScore: brierScore(record.forecastProbability, outcome),
        });
      }
    } catch (error) {
      console.warn('[KalshiIntel] Forecast refresh failed for', ticker, error);
    }
  }

  if (updates.size === 0) return forecasts;

  const next = forecasts.map((record) => {
    const update = updates.get(record.id);
    if (!update) return record;
    return {
      ...record,
      outcome: update.outcome,
      resolvedAt: update.resolvedAt,
      brierScore: update.brierScore,
    };
  });

  await saveForecasts(next);
  return next;
}

// ─── Message Handling ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (msg: Msg, _sender, sendResponse: (r: MsgResponse) => void) => {
    handleMessage(msg)
      .then(sendResponse)
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : String(err);
        sendResponse({ ok: false, error });
      });
    return true; // keep message channel open for async response
  }
);

async function handleMessage(msg: Msg): Promise<MsgResponse> {
  switch (msg.type) {
    case 'FETCH_MARKET': {
      const { ticker, url } = msg.payload as { ticker?: string; url?: string };

      if (ticker) {
        const cache = await getCachedMarket(ticker);
        const isStale = !cache || Date.now() - cache.fetchedAt > 30_000;

        let market: MarketModel;
        if (isStale) {
          market = await fetchMarketByTicker(ticker);
          await setCachedMarket(ticker, market);
          await appendPricePoint(ticker, market.impliedProbability * 100);
        } else {
          market = cache.market;
        }
        return { ok: true, data: market };
      }

      if (url) {
        const market = await fetchMarketForURL(url);
        if (market) {
          await setCachedMarket(market.ticker, market);
          await appendPricePoint(market.ticker, market.impliedProbability * 100);
        }
        return { ok: true, data: market };
      }

      return { ok: false, error: 'Missing ticker or url' };
    }

    case 'FETCH_EVENT': {
      const { eventTicker } = msg.payload as { eventTicker: string };
      const event = await fetchEventWithMarkets(eventTicker);
      return { ok: true, data: event };
    }

    case 'FETCH_ORDERBOOK': {
      const { ticker } = msg.payload as { ticker: string };
      const book = await fetchOrderBookByTicker(ticker);
      return { ok: true, data: book };
    }

    case 'FETCH_RELATED': {
      const { market } = msg.payload as { market: MarketModel };
      const related = await fetchRelatedMarkets(market);
      return { ok: true, data: related };
    }

    case 'FETCH_NEWS': {
      const { query } = msg.payload as { query: string };
      const items = await fetchNews(query);
      return { ok: true, data: items };
    }

    case 'SUMMARIZE_NEWS': {
      const { headlines, marketTitle, apiKey } = msg.payload as {
        headlines: Array<{ title: string; url: string; source: string; publishedAt: string }>;
        marketTitle: string;
        apiKey: string;
      };
      const bullets = await summarizeWithLLM(headlines, marketTitle, apiKey);
      return { ok: true, data: bullets };
    }

    case 'GET_PRICE_HISTORY': {
      const { ticker } = msg.payload as { ticker: string };
      const history = await getPriceHistory(ticker);
      return { ok: true, data: history };
    }

    case 'SET_ALERT': {
      const { alert } = msg.payload as { alert: Alert };
      await addAlert(alert);
      // Ensure polling alarm is running
      const prefs = await getPrefs();
      setupPollingAlarm(prefs.pollingIntervalSeconds);
      return { ok: true };
    }

    case 'DELETE_ALERT': {
      const { id } = msg.payload as { id: string };
      await removeAlert(id);
      return { ok: true };
    }

    case 'GET_ALERTS': {
      const alerts = await getAlerts();
      return { ok: true, data: alerts };
    }

    case 'ADD_FORECAST': {
      const { forecast } = msg.payload as { forecast: ForecastRecord };
      const current = await getForecasts();
      await saveForecasts([forecast, ...current].slice(0, 500));
      return { ok: true };
    }

    case 'GET_FORECASTS': {
      const forecasts = await getForecasts();
      return { ok: true, data: forecasts };
    }

    case 'REFRESH_FORECASTS': {
      const forecasts = await refreshForecastResolutions();
      return { ok: true, data: forecasts };
    }

    default:
      return { ok: false, error: `Unknown message type: ${(msg as Msg).type}` };
  }
}

// ─── Bootstrap polling alarm on startup ──────────────────────────────────────

(async () => {
  const prefs = await getPrefs();
  setupPollingAlarm(prefs.pollingIntervalSeconds);
})();
