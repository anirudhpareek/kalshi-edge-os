import React, { useMemo, useState } from 'react';
import type { MarketModel, EventModel, PricePoint, ThesisData, OrderBook, OrderBookLevel } from '../../../lib/types';
import { parseProbabilityInput, computeEdgeMetrics } from '../../../lib/edge';

interface Props {
  market: MarketModel;
  history: PricePoint[];
  event?: EventModel | null;
  thesis?: ThesisData | null;
  orderBook?: OrderBook | null;
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

type TradeSide = 'yes' | 'no';

function estimateSlippageCents(notionalUsd: number, volume24h: number, spreadCents: number): number {
  const volumeGuard = Math.max(volume24h, 1);
  const participation = Math.min(1, notionalUsd / volumeGuard);
  // Heuristic impact model: spread component + participation component.
  const spreadImpact = spreadCents * 0.25;
  const participationImpact = participation * 12;
  return Math.max(0, spreadImpact + participationImpact);
}

interface DepthFillResult {
  avgPrice: number;
  slippageCents: number;
  fillRatio: number;
  usedDepth: boolean;
}

function estimateFillFromDepth(
  levels: OrderBookLevel[],
  notionalUsd: number,
  fallbackPrice: number
): DepthFillResult {
  if (!levels || levels.length === 0 || notionalUsd <= 0) {
    return {
      avgPrice: fallbackPrice,
      slippageCents: 0,
      fillRatio: 0,
      usedDepth: false,
    };
  }

  let remaining = notionalUsd;
  let spent = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    if (level.price <= 0 || level.quantity <= 0) continue;
    const levelNotional = level.price * level.quantity;
    const take = Math.min(levelNotional, remaining);
    spent += take;
    remaining -= take;
  }

  const filled = notionalUsd - remaining;
  const fillRatio = filled / notionalUsd;
  const avgPrice = filled > 0 ? spent / filled : fallbackPrice;
  const slippageCents = Math.max(0, (avgPrice - fallbackPrice) * 100);
  return {
    avgPrice,
    slippageCents,
    fillRatio,
    usedDepth: true,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

function EdgeCard({ market, thesis }: { market: MarketModel; thesis?: ThesisData | null }) {
  const trueProb = parseProbabilityInput(thesis?.myProbability ?? '');
  if (trueProb == null) {
    return (
      <div className="kil-edge-card">
        <div className="kil-edge-title">Edge Check</div>
        <div className="kil-edge-empty">
          Add "My Probability" in Thesis to unlock EV, break-even, and edge alerts.
        </div>
      </div>
    );
  }

  const edge = computeEdgeMetrics(market, trueProb);
  const edgePct = edge.bestEv * 100;
  const state = edgePct >= 2 ? 'positive' : edgePct >= 0 ? 'neutral' : 'negative';
  const verdict = edgePct >= 2 ? 'Positive edge' : edgePct >= 0 ? 'Marginal edge' : 'Negative edge';

  return (
    <div className={`kil-edge-card ${state}`}>
      <div className="kil-edge-header">
        <div className="kil-edge-title">Edge Check</div>
        <div className={`kil-edge-pill ${state}`}>{verdict}</div>
      </div>
      <div className="kil-edge-grid">
        <div className="kil-edge-stat">
          <div className="kil-edge-label">My P</div>
          <div className="kil-edge-value">{(edge.trueProbability * 100).toFixed(1)}%</div>
        </div>
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Market Mid</div>
          <div className="kil-edge-value">{(edge.marketMidProbability * 100).toFixed(1)}%</div>
        </div>
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Best EV</div>
          <div className={`kil-edge-value ${state}`}>{edgePct.toFixed(2)}%</div>
        </div>
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Spread</div>
          <div className="kil-edge-value">{(edge.spread * 100).toFixed(1)}c</div>
        </div>
      </div>
      <div className="kil-edge-hint">
        Yes EV @ ask {(edge.yesEvAtAsk * 100).toFixed(2)}% | No EV @ ask {(edge.noEvAtAsk * 100).toFixed(2)}%
      </div>
    </div>
  );
}

function ExecutionPlanner({
  market,
  thesis,
  orderBook,
}: {
  market: MarketModel;
  thesis?: ThesisData | null;
  orderBook?: OrderBook | null;
}) {
  const trueProb = parseProbabilityInput(thesis?.myProbability ?? '');
  const [notional, setNotional] = useState('500');
  const [side, setSide] = useState<TradeSide>('yes');

  if (trueProb == null) {
    return null;
  }

  const spreadCents = Math.max(0, market.yesAsk - market.yesBid);
  const parsedNotional = Math.max(1, parseFloat(notional) || 0);
  const baseFillCents = side === 'yes' ? market.yesAsk : market.noAsk;
  const depthLevels = side === 'yes' ? (orderBook?.yes ?? []) : (orderBook?.no ?? []);
  const fallbackSlippageCents = estimateSlippageCents(parsedNotional, market.volume24h, spreadCents);
  const depthFill = estimateFillFromDepth(depthLevels, parsedNotional, baseFillCents / 100);
  const effectiveFillCents = Math.max(
    1,
    Math.min(
      99,
      depthFill.usedDepth && depthFill.fillRatio > 0
        ? depthFill.avgPrice * 100
        : baseFillCents + fallbackSlippageCents
    )
  );
  const slippageCents = Math.max(0, effectiveFillCents - baseFillCents);
  const trueWinProb = side === 'yes' ? trueProb : (1 - trueProb);
  const grossEvPct = (trueWinProb - effectiveFillCents / 100) * 100;
  const breakEvenProbPct = (effectiveFillCents / 100) * 100;

  const verdict = grossEvPct >= 2 ? 'trade' : grossEvPct >= 0 ? 'watch' : 'skip';
  const verdictLabel = verdict === 'trade' ? 'Trade setup' : verdict === 'watch' ? 'Watch setup' : 'Skip setup';

  return (
    <div className={`kil-exec-card ${verdict}`}>
      <div className="kil-edge-header">
        <div className="kil-edge-title">Execution Planner</div>
        <div className={`kil-edge-pill ${verdict === 'skip' ? 'negative' : verdict === 'trade' ? 'positive' : ''}`}>
          {verdictLabel}
        </div>
      </div>

      <div className="kil-exec-controls">
        <label className="kil-exec-field">
          <span>Side</span>
          <select
            className="kil-select"
            value={side}
            onChange={(e) => setSide(e.target.value as TradeSide)}
          >
            <option value="yes">Buy YES</option>
            <option value="no">Buy NO</option>
          </select>
        </label>
        <label className="kil-exec-field">
          <span>Size (USD)</span>
          <input
            type="number"
            className="kil-input-small"
            value={notional}
            min={1}
            step={50}
            onChange={(e) => setNotional(e.target.value)}
          />
        </label>
      </div>

      <div className="kil-edge-grid">
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Est Fill</div>
          <div className="kil-edge-value">{effectiveFillCents.toFixed(1)}c</div>
        </div>
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Slippage</div>
          <div className="kil-edge-value">{slippageCents.toFixed(1)}c</div>
        </div>
        <div className="kil-edge-stat">
          <div className="kil-edge-label">Break-even P</div>
          <div className="kil-edge-value">{breakEvenProbPct.toFixed(1)}%</div>
        </div>
        <div className="kil-edge-stat">
          <div className={`kil-edge-label ${grossEvPct < 0 ? 'negative' : ''}`}>EV After Cost</div>
          <div className={`kil-edge-value ${grossEvPct < 0 ? 'negative' : 'positive'}`}>{grossEvPct.toFixed(2)}%</div>
        </div>
      </div>

      <div className="kil-edge-hint">
        {depthFill.usedDepth && depthFill.fillRatio > 0
          ? `Depth model: ${(depthFill.fillRatio * 100).toFixed(0)}% size covered by visible book.`
          : 'Heuristic model using spread + 24h volume participation (depth unavailable).'}
      </div>
      {depthFill.usedDepth && depthFill.fillRatio < 1 && (
        <div className="kil-edge-hint" style={{ color: 'var(--accent-warn)' }}>
          Liquidity warning: only {(depthFill.fillRatio * 100).toFixed(0)}% of requested size visible in book.
        </div>
      )}
    </div>
  );
}

export function IntelligenceBlock({ market, history, event, thesis, orderBook }: Props) {
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

      <EdgeCard market={market} thesis={thesis} />
      <ExecutionPlanner market={market} thesis={thesis} orderBook={orderBook} />

      {/* Multi-outcome indicator */}
      {event?.isMultiOutcome && (
        <div className="kil-multi-outcome-hint">
          Part of {event.markets.length}-outcome event
          {event.hasArbitrage && (
            <span className="kil-sum-inline">
              ({'\u03A3'} {(event.probabilitySum * 100).toFixed(1)}%)
            </span>
          )}
        </div>
      )}

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
