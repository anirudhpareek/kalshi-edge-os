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

function OutcomeRow({
  market,
  isCurrent,
}: {
  market: MarketModel;
  isCurrent: boolean;
}) {
  const probPct = (market.impliedProbability * 100).toFixed(0);
  const color =
    market.impliedProbability > 0.5
      ? 'var(--positive)'
      : market.impliedProbability < 0.2
        ? 'var(--text-muted)'
        : 'var(--text-primary)';

  return (
    <div
      className={`kil-outcome-row ${isCurrent ? 'current' : ''}`}
      title={market.ticker}
    >
      <span
        className="kil-outcome-prob"
        style={{ color }}
      >
        {probPct}%
      </span>
      <span className="kil-outcome-title">{market.title}</span>
      <span className="kil-outcome-spread">
        {market.yesBid}/{market.yesAsk}
      </span>
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
          {markets.length} outcomes
        </span>
        <span
          className={`kil-sum-badge ${hasArbitrage ? 'warning' : ''}`}
          title={`Probabilities sum to ${formatPct(probabilitySum)}. ${
            hasArbitrage
              ? probabilitySum > 1
                ? 'Sum > 100% suggests overpricing.'
                : 'Sum < 100% suggests potential value.'
              : 'Near 100% indicates efficient pricing.'
          }`}
        >
          {'\u03A3'} {formatPct(probabilitySum)}
        </span>
      </div>

      {/* Arbitrage warning */}
      {hasArbitrage && (
        <div className="kil-arbitrage-hint">
          {probabilitySum > 1
            ? 'Sum > 100%: prices may be inflated'
            : 'Sum < 100%: potential value opportunity'}
        </div>
      )}

      {/* Outcome list */}
      <div className="kil-outcomes-list">
        {displayMarkets.map((m) => (
          <OutcomeRow
            key={m.ticker}
            market={m}
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
