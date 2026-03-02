import React, { useMemo, useState } from 'react';
import type {
  MarketModel,
  EventModel,
  PricePoint,
  ThesisData,
  OrderBook,
  OrderBookLevel,
  Msg,
  MsgResponse,
  ForecastRecord,
} from '../../../lib/types';
import { parseProbabilityInput } from '../../../lib/edge';

interface Props {
  market: MarketModel;
  history: PricePoint[];
  event?: EventModel | null;
  thesis?: ThesisData | null;
  orderBook?: OrderBook | null;
}

type TradeSide = 'yes' | 'no';

interface Opportunity {
  side: TradeSide;
  sizeUsd: number;
  effectiveFillCents: number;
  slippageCents: number;
  depthCoverage: number;
  depthGateApplies: boolean;
  evAfterCostPct: number;
  breakEvenProbPct: number;
  actionScore: number;
  scoreReasons: string[];
  gatePass: boolean;
  gateReasons: string[];
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

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

function makeForecastId(): string {
  return `forecast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function estimateSlippageCents(notionalUsd: number, volume24h: number, spreadCents: number): number {
  const volumeGuard = Math.max(volume24h, 1);
  const participation = Math.min(1, notionalUsd / volumeGuard);
  const spreadImpact = spreadCents * 0.25;
  const participationImpact = participation * 12;
  return Math.max(0, spreadImpact + participationImpact);
}

function estimateFillFromDepth(
  levels: OrderBookLevel[],
  notionalUsd: number,
  fallbackPrice: number
): { avgPrice: number; fillRatio: number; usedDepth: boolean } {
  if (!levels || levels.length === 0 || notionalUsd <= 0) {
    return { avgPrice: fallbackPrice, fillRatio: 0, usedDepth: false };
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
  return {
    avgPrice: filled > 0 ? spent / filled : fallbackPrice,
    fillRatio: filled / notionalUsd,
    usedDepth: true,
  };
}

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

    return { points: points.join(' '), lastX, lastY };
  }, [data]);

  if (!svgData || data.length < 2) {
    return (
      <div style={{ color: 'var(--text-muted)', fontSize: 10, padding: '8px 0' }}>
        Building history... (updates every 30s)
      </div>
    );
  }

  return (
    <svg className="kil-sparkline" viewBox="0 0 300 48" preserveAspectRatio="none">
      <defs>
        <linearGradient id="kil-spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,48 ${svgData.points} 300,48`} fill="url(#kil-spark-grad)" />
      <polyline points={svgData.points} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={svgData.lastX} cy={svgData.lastY} r="3" fill="var(--accent)" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = ['open', 'closed', 'settled', 'halted'].includes(status) ? status : 'closed';
  return <span className={`kil-badge ${cls}`}>{status}</span>;
}

function OpportunityScanner({
  market,
  thesis,
  orderBook,
}: {
  market: MarketModel;
  thesis?: ThesisData | null;
  orderBook?: OrderBook | null;
}) {
  const trueProb = parseProbabilityInput(thesis?.myProbability ?? '');
  const confidence = parseProbabilityInput(thesis?.myConfidence ?? '');
  const [evMinPct, setEvMinPct] = useState('1.5');
  const [spreadMaxCents, setSpreadMaxCents] = useState('4');
  const [depthMinPct, setDepthMinPct] = useState('70');
  const [confidenceMinPct, setConfidenceMinPct] = useState('60');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (trueProb == null) {
    return null;
  }

  const gate = {
    evMin: parseFloat(evMinPct) || 0,
    spreadMax: parseFloat(spreadMaxCents) || 100,
    depthMin: (parseFloat(depthMinPct) || 0) / 100,
    confidenceMin: (parseFloat(confidenceMinPct) || 0) / 100,
  };

  const spreadCents = Math.max(0, market.yesAsk - market.yesBid);
  const sizes = [250, 500, 1000, 2500];
  const sides: TradeSide[] = ['yes', 'no'];

  const opportunities: Opportunity[] = [];

  for (const side of sides) {
    for (const sizeUsd of sizes) {
      const baseFillCents = side === 'yes' ? market.yesAsk : market.noAsk;
      const depthLevels = side === 'yes' ? (orderBook?.yes ?? []) : (orderBook?.no ?? []);
      const depthGateApplies = depthLevels.length > 0;
      const depthFill = estimateFillFromDepth(depthLevels, sizeUsd, baseFillCents / 100);
      const fallbackSlippage = estimateSlippageCents(sizeUsd, market.volume24h, spreadCents);
      const effectiveFillCents = Math.max(
        1,
        Math.min(
          99,
          depthFill.usedDepth && depthFill.fillRatio > 0
            ? depthFill.avgPrice * 100
            : baseFillCents + fallbackSlippage
        )
      );
      const slippageCents = Math.max(0, effectiveFillCents - baseFillCents);
      const trueWinProb = side === 'yes' ? trueProb : (1 - trueProb);
      const evAfterCostPct = (trueWinProb - effectiveFillCents / 100) * 100;
      const breakEvenProbPct = (effectiveFillCents / 100) * 100;
      const depthCoverage = depthFill.usedDepth ? depthFill.fillRatio : 0;

      const evScore = clamp((evAfterCostPct / Math.max(gate.evMin, 0.5)) * 35, 0, 35);
      const spreadScore = clamp(((gate.spreadMax - spreadCents) / Math.max(gate.spreadMax, 1)) * 20, 0, 20);
      const depthScore = depthGateApplies
        ? clamp((depthCoverage / Math.max(gate.depthMin, 0.2)) * 25, 0, 25)
        : 12;
      const confVal = confidence ?? 0;
      const confScore = clamp((confVal / Math.max(gate.confidenceMin, 0.2)) * 20, 0, 20);
      const actionScore = evScore + spreadScore + depthScore + confScore;

      const scoreReasons: string[] = [];
      if (evScore < 12) scoreReasons.push('weak EV');
      if (spreadScore < 8) scoreReasons.push('wide spread');
      if (depthGateApplies && depthScore < 10) scoreReasons.push('thin depth');
      if (!depthGateApplies) scoreReasons.push('no depth data');
      if (confScore < 8) scoreReasons.push('low confidence');
      if (scoreReasons.length === 0) scoreReasons.push('balanced setup');

      const reasons: string[] = [];
      if (evAfterCostPct < gate.evMin) reasons.push(`EV<${gate.evMin.toFixed(1)}%`);
      if (spreadCents > gate.spreadMax) reasons.push(`spread>${gate.spreadMax.toFixed(1)}c`);
      if (depthGateApplies && depthCoverage < gate.depthMin) reasons.push(`depth<${(gate.depthMin * 100).toFixed(0)}%`);
      if ((confidence ?? 0) < gate.confidenceMin) reasons.push(`conf<${(gate.confidenceMin * 100).toFixed(0)}%`);

      opportunities.push({
        side,
        sizeUsd,
        effectiveFillCents,
        slippageCents,
        depthCoverage,
        depthGateApplies,
        evAfterCostPct,
        breakEvenProbPct,
        actionScore,
        scoreReasons,
        gatePass: reasons.length === 0,
        gateReasons: reasons,
      });
    }
  }

  const ranked = [...opportunities]
    .sort((a, b) => b.actionScore - a.actionScore || b.evAfterCostPct - a.evAfterCostPct)
    .slice(0, 3);

  const handleIntent = async (o: Opportunity) => {
    setSaveError(null);
    const id = `${o.side}-${o.sizeUsd}-${o.effectiveFillCents.toFixed(2)}`;
    setSavingId(id);
    const record: ForecastRecord = {
      id: makeForecastId(),
      marketTicker: market.ticker,
      marketTitle: market.title,
      forecastProbability: trueProb,
      confidence: confidence ?? undefined,
      marketProbabilityAtEntry: market.impliedProbability,
      side: o.side,
      sizeUsd: o.sizeUsd,
      effectiveFillPrice: o.effectiveFillCents / 100,
      forecastEvPct: o.evAfterCostPct,
      depthCoverage: o.depthCoverage,
      spreadCentsAtEntry: spreadCents,
      seriesTicker: market.seriesTicker,
      category: market.category,
      createdAt: Date.now(),
    };
    const res = await sendMsg({ type: 'ADD_FORECAST', payload: { forecast: record } });
    if (!res.ok) {
      setSaveError(res.error ?? 'Failed to save trade intent');
    }
    setSavingId(null);
  };

  return (
    <div className="kil-exec-card">
      <div className="kil-edge-header">
        <div className="kil-edge-title">Opportunity Scanner</div>
        <div className="kil-edge-pill">Top 3 setups</div>
      </div>

      <div className="kil-exec-controls" style={{ marginBottom: 10 }}>
        <label className="kil-exec-field"><span>Min EV %</span><input className="kil-input-small" type="number" step="0.1" value={evMinPct} onChange={(e) => setEvMinPct(e.target.value)} /></label>
        <label className="kil-exec-field"><span>Max Spread c</span><input className="kil-input-small" type="number" step="0.5" value={spreadMaxCents} onChange={(e) => setSpreadMaxCents(e.target.value)} /></label>
        <label className="kil-exec-field"><span>Min Depth %</span><input className="kil-input-small" type="number" step="5" value={depthMinPct} onChange={(e) => setDepthMinPct(e.target.value)} /></label>
        <label className="kil-exec-field"><span>Min Conf %</span><input className="kil-input-small" type="number" step="5" value={confidenceMinPct} onChange={(e) => setConfidenceMinPct(e.target.value)} /></label>
      </div>

      <ul className="kil-review-list">
        {ranked.map((o) => {
          const itemId = `${o.side}-${o.sizeUsd}-${o.effectiveFillCents.toFixed(2)}`;
          return (
            <li key={itemId} className={`kil-review-item ${o.gatePass ? '' : 'disabled'}`}>
              <div className="kil-review-title">
                {o.side.toUpperCase()} ${o.sizeUsd} {o.gatePass ? '• Gate PASS' : '• Gate BLOCKED'}
              </div>
              <div className="kil-review-meta">
                <span>Score {o.actionScore.toFixed(0)}</span>
                <span>EV {o.evAfterCostPct.toFixed(2)}%</span>
                <span>Fill {o.effectiveFillCents.toFixed(1)}c</span>
                <span>Slip {o.slippageCents.toFixed(1)}c</span>
                <span>Depth {o.depthGateApplies ? `${(o.depthCoverage * 100).toFixed(0)}%` : 'N/A'}</span>
                <span>BE {o.breakEvenProbPct.toFixed(1)}%</span>
              </div>
              <div className="kil-edge-hint">Score drivers: {o.scoreReasons.join(', ')}</div>
              {!o.gatePass && (
                <div className="kil-edge-hint" style={{ color: 'var(--accent-warn)' }}>
                  Blockers: {o.gateReasons.join(', ')}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <button
                  className="kil-btn"
                  disabled={!o.gatePass || savingId === itemId}
                  onClick={() => void handleIntent(o)}
                >
                  {savingId === itemId ? 'Saving...' : 'Mark Trade Intent'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {saveError && (
        <div className="kil-error" style={{ marginTop: 8 }}>
          {saveError}
        </div>
      )}

      <div className="kil-edge-hint">
        Scanner ranks side+size combinations by EV after cost and enforces hard gate rules before intent logging.
      </div>
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
      <div className="kil-market-title">{market.title}</div>
      {market.subtitle && <div className="kil-market-subtitle">{market.subtitle}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <StatusBadge status={market.status} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{market.ticker}</span>
        {lastUpdated && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="kil-live-dot" />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{lastUpdated}</span>
          </span>
        )}
      </div>

      <div className="kil-prob-row">
        <span className="kil-prob-value">{probPct.toFixed(1)}%</span>
        <span className="kil-prob-label">YES</span>
        {spread > 0 && <span className="kil-prob-spread">Spread: {spread}c</span>}
      </div>

      <div className="kil-prob-bar"><div className="kil-prob-bar-fill" style={{ width: `${probPct}%` }} /></div>

      <OpportunityScanner market={market} thesis={thesis} orderBook={orderBook} />

      {event?.isMultiOutcome && (
        <div className="kil-multi-outcome-hint">
          Part of {event.markets.length}-outcome event
          {event.hasArbitrage && <span className="kil-sum-inline">({String.fromCharCode(931)} {(event.probabilitySum * 100).toFixed(1)}%)</span>}
        </div>
      )}

      <div className="kil-stats-grid">
        <div className="kil-stat"><div className="kil-stat-label">Volume</div><div className="kil-stat-value">{formatNumber(market.volume)}</div></div>
        <div className="kil-stat"><div className="kil-stat-label">24h Volume</div><div className="kil-stat-value">{formatNumber(market.volume24h)}</div></div>
        <div className="kil-stat"><div className="kil-stat-label">Open Interest</div><div className="kil-stat-value">{formatNumber(market.openInterest)}</div></div>
        <div className="kil-stat"><div className="kil-stat-label">Closes</div><div className="kil-stat-value" style={{ fontSize: 11 }}>{formatDate(market.closeTime)}</div></div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div className="kil-stat" style={{ flex: 1 }}>
          <div className="kil-stat-label">Yes Bid / Ask</div>
          <div className="kil-stat-value">{market.yesBid}c / {market.yesAsk}c</div>
        </div>
        <div className="kil-stat" style={{ flex: 1 }}>
          <div className="kil-stat-label">Last Price</div>
          <div className="kil-stat-value">{market.lastPrice}c ({formatPct(market.lastPrice / 100)})</div>
        </div>
      </div>

      <div className="kil-sparkline-container">
        <div className="kil-sparkline-label">Probability History</div>
        <Sparkline data={history} />
      </div>
    </div>
  );
}
