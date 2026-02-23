import React, { useMemo } from 'react';
import type { MarketModel, PricePoint } from '../../../lib/types';

interface Props {
  market: MarketModel;
  history: PricePoint[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Sparkline component ──────────────────────────────────────────────────────

function Sparkline({ data }: { data: PricePoint[] }) {
  const svgData = useMemo(() => {
    if (data.length < 2) return null;
    const W = 300;
    const H = 48;
    const prices = data.map((d) => d.price);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const points = data.map((d, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((d.price - minP) / range) * (H - 4) - 2;
      return `${x},${y}`;
    });

    const lastY = H - ((prices[prices.length - 1] - minP) / range) * (H - 4) - 2;
    const lastX = W;

    return { points: points.join(' '), lastX, lastY, minP, maxP };
  }, [data]);

  if (!svgData || data.length < 2) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 10, padding: '8px 0' }}>
        Building history... (updates every 30s)
      </div>
    );
  }

  return (
    <svg className="kil-sparkline" viewBox={`0 0 300 48`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="kil-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <polygon
        points={`0,48 ${svgData.points} 300,48`}
        fill="url(#kil-spark-grad)"
      />
      {/* Line */}
      <polyline
        points={svgData.points}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      <circle
        cx={svgData.lastX}
        cy={svgData.lastY}
        r="3"
        fill="var(--accent)"
      />
    </svg>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls = ['open', 'closed', 'settled', 'halted'].includes(status)
    ? status
    : 'closed';
  return <span className={`kil-badge ${cls}`}>{status}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function IntelligenceBlock({ market, history }: Props) {
  const probPct = market.impliedProbability * 100;
  const spread = market.yesAsk - market.yesBid;
  const lastUpdated = useMemo(() => {
    if (history.length === 0) return null;
    const ts = history[history.length - 1].timestamp;
    return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, [history]);

  return (
    <div>
      {/* Title */}
      <div className="kil-market-title">{market.title}</div>
      {market.subtitle && (
        <div className="kil-market-subtitle">{market.subtitle}</div>
      )}

      {/* Status + ticker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <StatusBadge status={market.status} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {market.ticker}
        </span>
        {lastUpdated && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="kil-live-dot" />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lastUpdated}</span>
          </span>
        )}
      </div>

      {/* Probability */}
      <div className="kil-prob-row">
        <span className="kil-prob-value">{probPct.toFixed(1)}%</span>
        <span className="kil-prob-label">YES</span>
        {spread > 0 && (
          <span className="kil-prob-spread">
            Spread: {spread}c
          </span>
        )}
      </div>

      {/* Probability bar */}
      <div className="kil-prob-bar">
        <div
          className="kil-prob-bar-fill"
          style={{ width: `${probPct}%` }}
        />
      </div>

      {/* Stats grid */}
      <div className="kil-stats-grid">
        <div className="kil-stat">
          <div className="kil-stat-label">Volume</div>
          <div className="kil-stat-value">{formatNumber(market.volume)}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">24h Volume</div>
          <div className="kil-stat-value">{formatNumber(market.volume24h)}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Open Interest</div>
          <div className="kil-stat-value">{formatNumber(market.openInterest)}</div>
        </div>
        <div className="kil-stat">
          <div className="kil-stat-label">Closes</div>
          <div className="kil-stat-value" style={{ fontSize: 11 }}>
            {formatDate(market.closeTime)}
          </div>
        </div>
      </div>

      {/* Bid/Ask detail */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="kil-stat" style={{ flex: 1 }}>
          <div className="kil-stat-label">Yes Bid / Ask</div>
          <div className="kil-stat-value">
            {market.yesBid}c / {market.yesAsk}c
          </div>
        </div>
        <div className="kil-stat" style={{ flex: 1 }}>
          <div className="kil-stat-label">Last Price</div>
          <div className="kil-stat-value">{market.lastPrice}c ({formatPct(market.lastPrice / 100)})</div>
        </div>
      </div>

      {/* Sparkline */}
      <div className="kil-sparkline-container">
        <div className="kil-sparkline-label">Probability History</div>
        <Sparkline data={history} />
      </div>
    </div>
  );
}
