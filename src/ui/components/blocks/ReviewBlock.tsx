import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { ForecastRecord, MarketModel, Msg, MsgResponse, ThesisData } from '../../../lib/types';
import { parseProbabilityInput } from '../../../lib/edge';

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

function makeForecastId(): string {
  return `forecast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface Props {
  market: MarketModel | null;
  thesis: ThesisData | null;
}

export function ReviewBlock({ market, thesis }: Props) {
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const myProbability = parseProbabilityInput(thesis?.myProbability ?? '');
  const myConfidence = parseProbabilityInput(thesis?.myConfidence ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    const refreshed = await sendMsg<ForecastRecord[]>({ type: 'REFRESH_FORECASTS', payload: {} });
    if (refreshed.ok && refreshed.data) {
      setForecasts(refreshed.data);
      setError(null);
      setLoading(false);
      return;
    }
    const fallback = await sendMsg<ForecastRecord[]>({ type: 'GET_FORECASTS', payload: {} });
    if (fallback.ok && fallback.data) {
      setForecasts(fallback.data);
      setError(null);
    } else {
      setError(fallback.error ?? 'Failed to load forecasts');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSnapshot = useCallback(async () => {
    if (!market || myProbability == null) return;
    const forecast: ForecastRecord = {
      id: makeForecastId(),
      marketTicker: market.ticker,
      marketTitle: market.title,
      forecastProbability: myProbability,
      confidence: myConfidence ?? undefined,
      marketProbabilityAtEntry: market.impliedProbability,
      createdAt: Date.now(),
    };
    setSaving(true);
    const res = await sendMsg({ type: 'ADD_FORECAST', payload: { forecast } });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? 'Failed to save forecast');
      return;
    }
    await load();
  }, [market, myProbability, myConfidence, load]);

  const stats = useMemo(() => {
    const resolved = forecasts.filter((f) => f.outcome != null && f.brierScore != null);
    const unresolved = forecasts.length - resolved.length;
    const meanBrier = resolved.length > 0
      ? resolved.reduce((sum, f) => sum + (f.brierScore ?? 0), 0) / resolved.length
      : null;

    const buckets = [
      { label: '0-20%', min: 0, max: 0.2 },
      { label: '20-40%', min: 0.2, max: 0.4 },
      { label: '40-60%', min: 0.4, max: 0.6 },
      { label: '60-80%', min: 0.6, max: 0.8 },
      { label: '80-100%', min: 0.8, max: 1.01 },
    ].map((bucket) => {
      const inBucket = resolved.filter(
        (f) => f.forecastProbability >= bucket.min && f.forecastProbability < bucket.max
      );
      if (inBucket.length === 0) {
        return { ...bucket, n: 0, hitRate: null as number | null };
      }
      const hits = inBucket.filter((f) => f.outcome === 1).length;
      return { ...bucket, n: inBucket.length, hitRate: hits / inBucket.length };
    });

    return {
      total: forecasts.length,
      resolved: resolved.length,
      unresolved,
      meanBrier,
      buckets,
      recent: forecasts.slice(0, 8),
    };
  }, [forecasts]);

  return (
    <div>
      <div className="kil-review-toolbar">
        <button className="kil-btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Scores'}
        </button>
        <button
          className="kil-btn"
          onClick={() => void handleSnapshot()}
          disabled={saving || !market || myProbability == null}
          title={myProbability == null ? 'Set My Probability in Thesis first' : 'Save current forecast'}
        >
          {saving ? 'Saving...' : 'Snapshot Forecast'}
        </button>
      </div>

      {error && <div className="kil-error">{error}</div>}

      <div className="kil-review-stats">
        <div className="kil-stat">
          <div className="kil-stat-label">Forecasts</div>
          <div className="kil-stat-value">{stats.total}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Resolved</div>
          <div className="kil-stat-value">{stats.resolved}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Open</div>
          <div className="kil-stat-value">{stats.unresolved}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Mean Brier</div>
          <div className="kil-stat-value">
            {stats.meanBrier == null ? '-' : stats.meanBrier.toFixed(3)}
          </div>
        </div>
      </div>

      <div className="kil-review-calibration">
        <div className="kil-sparkline-label">Calibration Buckets</div>
        {stats.buckets.map((bucket) => (
          <div key={bucket.label} className="kil-review-row">
            <span>{bucket.label}</span>
            <span>{bucket.n} preds</span>
            <span>{bucket.hitRate == null ? '-' : `${(bucket.hitRate * 100).toFixed(0)}% hit`}</span>
          </div>
        ))}
      </div>

      <div className="kil-review-history">
        <div className="kil-sparkline-label">Recent Forecasts</div>
        {stats.recent.length === 0 ? (
          <div className="kil-empty-state">No forecasts yet. Save your first snapshot.</div>
        ) : (
          <ul className="kil-review-list">
            {stats.recent.map((record) => (
              <li key={record.id} className="kil-review-item">
                <div className="kil-review-title">{record.marketTitle}</div>
                <div className="kil-review-meta">
                  <span>My P {(record.forecastProbability * 100).toFixed(1)}%</span>
                  <span>Market {(record.marketProbabilityAtEntry * 100).toFixed(1)}%</span>
                  <span>
                    {record.brierScore == null
                      ? 'Unresolved'
                      : `Brier ${record.brierScore.toFixed(3)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
