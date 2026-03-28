import React, { useState } from 'react';
import type { EventModel, MarketModel } from '../../../lib/types';

interface Props {
  event: EventModel | null;
  loading: boolean;
  currentMarketTicker?: string;
}

const INITIAL_OUTCOME_COUNT = 10;

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function getCombinedImpliedHint(probabilitySum: number): string {
  if (probabilitySum > 1) {
    return 'Combined implied is above 100%. Read this as a comparison set unless these contracts are mutually exclusive.';
  }
  return 'Combined implied is below 100%. If these contracts resolve exclusively, there may be pricing gaps worth reviewing.';
}

function OutcomeRow({
  market,
  rank,
  isCurrent,
}: {
  market: MarketModel;
  rank: number;
  isCurrent: boolean;
}) {
  const probPct = (market.impliedProbability * 100).toFixed(1);
  const spread = market.yesAsk - market.yesBid;

  return (
    <div className={`kil-outcome-row ${isCurrent ? 'current' : ''}`}>
      <span className="kil-outcome-rank">
        #{rank}
      </span>
      <div className="kil-outcome-main">
        <div className="kil-outcome-topline">
          <div className="kil-outcome-title-wrap">
            <span className="kil-outcome-title">{market.title}</span>
            <div className="kil-outcome-meta">
              {isCurrent && (
                <span className="kil-outcome-pill kil-outcome-pill-current">Current</span>
              )}
              <span className="kil-outcome-pill">
                {spread > 0 ? `Spread ${spread}c` : 'Tight spread'}
              </span>
            </div>
          </div>
          <div className="kil-outcome-metrics">
            <span className="kil-outcome-prob">{probPct}%</span>
            <span className="kil-outcome-prob-label">implied</span>
          </div>
        </div>
        <div className="kil-outcome-bar-wrap" aria-hidden="true">
          <div className="kil-outcome-bar-fill" style={{ width: `${market.impliedProbability * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export function OutcomesBlock({ event, loading, currentMarketTicker }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div className="kil-skeleton-group">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="kil-skeleton" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  // Don't show for single-outcome (binary) markets
  if (!event || !event.isMultiOutcome) {
    return (
      <div className="kil-empty-state">
        Binary market (Yes/No only)
      </div>
    );
  }

  const { markets, probabilitySum, hasArbitrage } = event;
  const displayMarkets = expanded ? markets : markets.slice(0, INITIAL_OUTCOME_COUNT);

  return (
    <div>
      {/* Header with sum badge */}
      <div className="kil-outcomes-header">
        <span className="kil-outcomes-count">
          {markets.length} linked markets
        </span>
        <span
          className={`kil-sum-badge ${hasArbitrage ? 'warning' : ''}`}
        >
          Combined Implied: {formatPct(probabilitySum)}
        </span>
      </div>

      {/* Arbitrage warning */}
      {hasArbitrage && (
        <div className="kil-arbitrage-hint">
          {getCombinedImpliedHint(probabilitySum)}
        </div>
      )}

      {/* Outcome list */}
      <div className="kil-outcomes-list">
        {displayMarkets.map((m, idx) => (
          <OutcomeRow
            key={m.ticker}
            market={m}
            rank={idx + 1}
            isCurrent={m.ticker === currentMarketTicker}
          />
        ))}
      </div>

      {/* Show more */}
      {markets.length > INITIAL_OUTCOME_COUNT && (
        <button
          className="kil-show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show ${markets.length - INITIAL_OUTCOME_COUNT} more`}
        </button>
      )}
    </div>
  );
}
