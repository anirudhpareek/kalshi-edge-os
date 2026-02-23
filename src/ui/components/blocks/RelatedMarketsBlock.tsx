import React from 'react';
import type { RelatedMarket } from '../../../lib/types';

interface Props {
  markets: RelatedMarket[];
  loading: boolean;
}

function ProbBar({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  const color =
    value > 0.7 ? 'var(--positive)' :
    value < 0.3 ? 'var(--negative)' :
    'var(--accent-warn)';
  return (
    <span style={{ color, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: 36, flexShrink: 0 }}>
      {pct}%
    </span>
  );
}

export function RelatedMarketsBlock({ markets, loading }: Props) {
  if (loading) {
    return (
      <div className="kil-skeleton-group">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="kil-skeleton" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="kil-empty-state">
        No related markets found
      </div>
    );
  }

  return (
    <ul className="kil-related-list">
      {markets.map((m) => (
        <li key={m.ticker}>
          <a
            className="kil-related-item"
            href={`https://kalshi.com/markets/${m.ticker}`}
            target="_blank"
            rel="noreferrer"
          >
            <ProbBar value={m.impliedProbability} />
            <div className="kil-related-title">{m.title}</div>
            {m.status !== 'open' && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                {m.status}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}
