import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ForecastRecord,
  MarketModel,
  Msg,
  MsgResponse,
  ThesisData,
  PositionSnapshot,
} from '../../../lib/types';
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

interface CalibrationBucket {
  label: string;
  min: number;
  max: number;
  midpoint: number;
  n: number;
  hitRate: number | null;
}

export function ReviewBlock({ market, thesis }: Props) {
  const [forecasts, setForecasts] = useState<ForecastRecord[]>([]);
  const [positions, setPositions] = useState<PositionSnapshot[]>([]);
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

    const pos = await sendMsg<PositionSnapshot[]>({ type: 'GET_POSITION_MONITOR', payload: {} });
    if (pos.ok && pos.data) {
      setPositions(pos.data);
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

    const buckets: CalibrationBucket[] = [
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
        return {
          ...bucket,
          midpoint: Math.min(1, bucket.min + (bucket.max - bucket.min) / 2),
          n: 0,
          hitRate: null as number | null,
        };
      }
      const hits = inBucket.filter((f) => f.outcome === 1).length;
      return {
        ...bucket,
        midpoint: Math.min(1, bucket.min + (bucket.max - bucket.min) / 2),
        n: inBucket.length,
        hitRate: hits / inBucket.length,
      };
    });

    const weightedCalibrationGap = buckets.reduce((sum, bucket) => {
      if (bucket.hitRate == null || resolved.length === 0) return sum;
      return sum + (Math.abs(bucket.hitRate - bucket.midpoint) * bucket.n) / resolved.length;
    }, 0);

    const worstMistakes = [...resolved]
      .sort((a, b) => (b.brierScore ?? 0) - (a.brierScore ?? 0))
      .slice(0, 5);

    const sharpPredictions = resolved.filter(
      (r) => r.forecastProbability <= 0.2 || r.forecastProbability >= 0.8
    );
    const sharpErrorRate = sharpPredictions.length > 0
      ? sharpPredictions.filter((r) => (r.brierScore ?? 0) >= 0.64).length / sharpPredictions.length
      : null;

    const overconfident = sharpErrorRate != null && sharpErrorRate > 0.2;
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekly = forecasts.filter((f) => now - f.createdAt <= weekMs);
    const weeklyResolved = weekly.filter((f) => f.outcome != null && f.brierScore != null);
    const weeklyMeanBrier = weeklyResolved.length > 0
      ? weeklyResolved.reduce((sum, f) => sum + (f.brierScore ?? 0), 0) / weeklyResolved.length
      : null;

    const retentionResolved = resolved.filter((r) => (r.forecastEvPct ?? 0) > 0 && r.realizedEvPct != null);
    const forecastEvSum = retentionResolved.reduce((sum, r) => sum + (r.forecastEvPct ?? 0), 0);
    const realizedEvSum = retentionResolved.reduce((sum, r) => sum + (r.realizedEvPct ?? 0), 0);
    const edgeRetention = forecastEvSum > 0 ? realizedEvSum / forecastEvSum : null;
    const openExposure = positions.reduce((sum, p) => sum + Math.max(0, p.sizeUsd), 0);
    const bySeries = new Map<string, number>();
    for (const p of positions) {
      const key = p.seriesTicker || p.marketTicker.split('-')[0];
      bySeries.set(key, (bySeries.get(key) ?? 0) + p.sizeUsd);
    }
    const concentration = [...bySeries.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([series, exposure]) => ({
        series,
        exposure,
        share: openExposure > 0 ? exposure / openExposure : 0,
      }));
    const concentrationWarning = concentration.some((c) => c.share >= 0.5);

    return {
      total: forecasts.length,
      resolved: resolved.length,
      unresolved,
      meanBrier,
      weightedCalibrationGap,
      overconfident,
      sharpErrorRate,
      edgeRetention,
      openExposure,
      concentration,
      concentrationWarning,
      weekly: {
        intents: weekly.length,
        resolved: weeklyResolved.length,
        meanBrier: weeklyMeanBrier,
      },
      buckets,
      worstMistakes,
      recent: forecasts.slice(0, 8),
    };
  }, [forecasts, positions]);

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
        <div className="kil-stat">
          <div className="kil-stat-label">Calibration Gap</div>
          <div className="kil-stat-value">
            {stats.resolved === 0 ? '-' : `${(stats.weightedCalibrationGap * 100).toFixed(1)}%`}
          </div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Sharp Error</div>
          <div className="kil-stat-value">
            {stats.sharpErrorRate == null ? '-' : `${(stats.sharpErrorRate * 100).toFixed(0)}%`}
          </div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Edge Retention</div>
          <div className="kil-stat-value">
            {stats.edgeRetention == null ? '-' : `${(stats.edgeRetention * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>

      {stats.resolved > 0 && (
        <div className={`kil-review-insight ${stats.overconfident ? 'warn' : 'ok'}`}>
          {stats.overconfident
            ? 'Model signal: overconfidence risk detected on high-conviction calls.'
            : 'Model signal: confidence profile is stable at current sample size.'}
        </div>
      )}

      <div className="kil-review-calibration">
        <div className="kil-sparkline-label">Open Intents Monitor</div>
        {positions.length === 0 ? (
          <div className="kil-empty-state">No open intents.</div>
        ) : (
          <>
            <div className="kil-review-row">
              <span className="kil-review-row-label">
                Open exposure
                <span className="kil-review-row-count">all open intents</span>
              </span>
              <div className="kil-review-cal-bar">
                <div className="kil-review-cal-hit" style={{ width: `${Math.min(100, stats.openExposure / 100)}%` }} />
              </div>
              <span>${Math.round(stats.openExposure).toLocaleString()}</span>
            </div>
            {stats.concentrationWarning && (
              <div className="kil-review-insight warn" style={{ marginTop: 8 }}>
                Concentration warning: one series is over 50% of open exposure.
              </div>
            )}
            <ul className="kil-review-list" style={{ marginTop: 8 }}>
              {positions.slice(0, 6).map((p) => (
                <li key={p.forecastId} className="kil-review-item">
                  <div className="kil-review-title">{p.marketTitle}</div>
                  <div className="kil-review-meta">
                    <span>{p.side.toUpperCase()} ${Math.round(p.sizeUsd)}</span>
                    <span>Entry EV {p.entryEvPct.toFixed(2)}%</span>
                    <span>Now {p.currentEdgePct.toFixed(2)}%</span>
                    <span className={p.edgeDriftPct < -2 ? 'kil-review-bad' : ''}>Drift {p.edgeDriftPct.toFixed(2)}%</span>
                    <span>Spread {p.spreadCents.toFixed(1)}c</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="kil-review-calibration">
        <div className="kil-sparkline-label">7-Day Report</div>
        <div className="kil-review-row">
          <span className="kil-review-row-label">
            Trade intents
            <span className="kil-review-row-count">last 7 days</span>
          </span>
          <div className="kil-review-cal-bar">
            <div
              className="kil-review-cal-hit"
              style={{ width: `${Math.min(100, stats.weekly.intents * 10)}%` }}
            />
          </div>
          <span>{stats.weekly.intents}</span>
        </div>
        <div className="kil-review-row">
          <span className="kil-review-row-label">
            Resolved
            <span className="kil-review-row-count">last 7 days</span>
          </span>
          <div className="kil-review-cal-bar">
            <div
              className="kil-review-cal-hit"
              style={{ width: `${stats.weekly.intents === 0 ? 0 : (stats.weekly.resolved / stats.weekly.intents) * 100}%` }}
            />
          </div>
          <span>{stats.weekly.resolved}</span>
        </div>
        <div className="kil-review-row">
          <span className="kil-review-row-label">
            Mean Brier
            <span className="kil-review-row-count">last 7 days</span>
          </span>
          <div className="kil-review-cal-bar">
            <div
              className="kil-review-cal-hit"
              style={{ width: `${stats.weekly.meanBrier == null ? 0 : Math.max(0, 100 - (stats.weekly.meanBrier * 100))}%` }}
            />
          </div>
          <span>{stats.weekly.meanBrier == null ? '-' : stats.weekly.meanBrier.toFixed(3)}</span>
        </div>
      </div>

      <div className="kil-review-calibration">
        <div className="kil-sparkline-label">Calibration Buckets</div>
        {stats.buckets.map((bucket) => (
          <div key={bucket.label} className="kil-review-row">
            <span className="kil-review-row-label">
              {bucket.label}
              <span className="kil-review-row-count">{bucket.n} preds</span>
            </span>
            <div className="kil-review-cal-bar">
              <div
                className="kil-review-cal-ideal"
                style={{ left: `${bucket.midpoint * 100}%` }}
                title={`Ideal ${(bucket.midpoint * 100).toFixed(0)}%`}
              />
              <div
                className="kil-review-cal-hit"
                style={{ width: `${(bucket.hitRate ?? 0) * 100}%` }}
                title={
                  bucket.hitRate == null
                    ? 'No samples'
                    : `Observed ${(bucket.hitRate * 100).toFixed(0)}%`
                }
              />
            </div>
            <span>{bucket.hitRate == null ? '-' : `${(bucket.hitRate * 100).toFixed(0)}%`}</span>
          </div>
        ))}
      </div>

      <div className="kil-review-calibration">
        <div className="kil-sparkline-label">Top Mistakes</div>
        {stats.worstMistakes.length === 0 ? (
          <div className="kil-empty-state">No resolved outcomes yet.</div>
        ) : (
          <ul className="kil-review-list">
            {stats.worstMistakes.map((record) => (
              <li key={record.id} className="kil-review-item">
                <div className="kil-review-title">{record.marketTitle}</div>
                <div className="kil-review-meta">
                  <span>My P {(record.forecastProbability * 100).toFixed(0)}%</span>
                  <span>Outcome {record.outcome === 1 ? 'YES' : 'NO'}</span>
                  <span className="kil-review-bad">Brier {(record.brierScore ?? 0).toFixed(3)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
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
                  {record.side && <span>{record.side.toUpperCase()}</span>}
                  <span>
                    {record.brierScore == null
                      ? 'Unresolved'
                      : `Brier ${record.brierScore.toFixed(3)}`}
                  </span>
                  {record.realizedEvPct != null && (
                    <span>{`Realized ${record.realizedEvPct.toFixed(2)}%`}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
