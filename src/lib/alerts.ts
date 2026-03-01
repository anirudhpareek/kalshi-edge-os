/**
 * Alert evaluation logic. Used by the background service worker.
 */
import type { Alert } from './types';
import type { MarketModel } from './types';
import { getAlerts, saveAlerts } from './storage';
import { computeEdgeMetrics } from './edge';

const ALARM_NAME = 'kalshi-poll';
const MIN_POLL_SECONDS = 15;

// ─── Alarm Management ─────────────────────────────────────────────────────────

export function setupPollingAlarm(intervalSeconds: number): void {
  const periodMinutes = Math.max(intervalSeconds, MIN_POLL_SECONDS) / 60;
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: periodMinutes });
}

export function clearPollingAlarm(): void {
  chrome.alarms.clear(ALARM_NAME);
}

// ─── Alert CRUD ───────────────────────────────────────────────────────────────

export async function addAlert(alert: Alert): Promise<void> {
  const alerts = await getAlerts();
  const idx = alerts.findIndex((a) => a.id === alert.id);
  if (idx >= 0) {
    alerts[idx] = alert;
  } else {
    alerts.push(alert);
  }
  await saveAlerts(alerts);
}

export async function removeAlert(id: string): Promise<void> {
  const alerts = await getAlerts();
  await saveAlerts(alerts.filter((a) => a.id !== id));
}

// ─── Alert Evaluation ─────────────────────────────────────────────────────────

export interface AlertTriggerResult {
  alert: Alert;
  currentPrice: number;
  message: string;
}

/**
 * Evaluate all alerts for the given market's current price.
 * Returns alerts that fired (and did not fire in the last 10 min).
 */
export function evaluateAlerts(
  alerts: Alert[],
  ticker: string,
  market: MarketModel,
  trueProbability: number | null,
  currentPrice: number,
  priceHistory: Array<{ timestamp: number; price: number }>
): AlertTriggerResult[] {
  const now = Date.now();
  const COOLDOWN_MS = 10 * 60 * 1000; // 10 minute cooldown
  const triggered: AlertTriggerResult[] = [];

  for (const alert of alerts) {
    if (!alert.enabled) continue;
    if (alert.marketTicker !== ticker) continue;
    if (alert.lastTriggered && now - alert.lastTriggered < COOLDOWN_MS) continue;

    let fired = false;
    let message = '';

    if (alert.condition === 'above') {
      if (currentPrice >= alert.threshold) {
        fired = true;
        message = `${alert.marketTitle}: Yes price crossed above ${alert.threshold}% (now ${currentPrice.toFixed(1)}%)`;
      }
    } else if (alert.condition === 'below') {
      if (currentPrice <= alert.threshold) {
        fired = true;
        message = `${alert.marketTitle}: Yes price crossed below ${alert.threshold}% (now ${currentPrice.toFixed(1)}%)`;
      }
    } else if (alert.condition === 'move') {
      const windowMs = (alert.timeWindowMinutes ?? 5) * 60 * 1000;
      const cutoff = now - windowMs;
      const baseline = priceHistory.find((p) => p.timestamp >= cutoff);
      if (baseline) {
        const change = Math.abs(currentPrice - baseline.price);
        if (change >= alert.threshold) {
          fired = true;
          const dir = currentPrice > baseline.price ? 'up' : 'down';
          message = `${alert.marketTitle}: Moved ${dir} ${change.toFixed(1)}% in ${alert.timeWindowMinutes}min`;
        }
      }
    } else if (alert.condition === 'edgeAbove') {
      if (trueProbability != null) {
        const edge = computeEdgeMetrics(market, trueProbability);
        const bestEvPct = edge.bestEv * 100;
        if (bestEvPct >= alert.threshold) {
          fired = true;
          message = `${alert.marketTitle}: Edge is ${bestEvPct.toFixed(2)}% (threshold ${alert.threshold}%)`;
        }
      }
    } else if (alert.condition === 'edgeBelow') {
      if (trueProbability != null) {
        const edge = computeEdgeMetrics(market, trueProbability);
        const bestEvPct = edge.bestEv * 100;
        if (bestEvPct <= alert.threshold) {
          fired = true;
          message = `${alert.marketTitle}: Edge dropped to ${bestEvPct.toFixed(2)}% (threshold ${alert.threshold}%)`;
        }
      }
    } else if (alert.condition === 'spreadWide') {
      const spreadCents = market.yesAsk - market.yesBid;
      if (spreadCents >= alert.threshold) {
        fired = true;
        message = `${alert.marketTitle}: Spread widened to ${spreadCents.toFixed(1)}c`;
      }
    }

    if (fired) {
      triggered.push({ alert, currentPrice, message });
    }
  }

  return triggered;
}

/**
 * Mark alerts as triggered (update lastTriggered timestamp).
 */
export async function markAlertsTriggered(alertIds: string[]): Promise<void> {
  const alerts = await getAlerts();
  const now = Date.now();
  for (const a of alerts) {
    if (alertIds.includes(a.id)) {
      a.lastTriggered = now;
    }
  }
  await saveAlerts(alerts);
}

/**
 * Send a Chrome notification for a triggered alert.
 */
export function sendAlertNotification(message: string, notificationId: string): void {
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: 'Kalshi Alert',
    message,
    priority: 2,
  });
}
