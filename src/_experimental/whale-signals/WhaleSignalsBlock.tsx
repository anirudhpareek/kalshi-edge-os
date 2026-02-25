/**
 * WhaleSignalsBlock Component
 * To use: copy to src/ui/components/blocks/WhaleSignalsBlock.tsx
 */
import React from 'react';
import type { WhaleSignals, WhaleTrade } from './types';

interface Props {
  signals: WhaleSignals | null;
  loading: boolean;
  error: string | null;
}

function formatDollar(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`;
  }
  return `$${Math.round(value)}`;
}

function formatPrice(cents: number): string {
  return `${cents.toFixed(0)}¢`;
}

function formatTimeAgo(timestamp: number): string {
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function getTierEmoji(tier: WhaleTrade['tier']): string {
  switch (tier) {
    case 'whale':
      return '\uD83D\uDC0B'; // whale emoji
    case 'large':
      return '\uD83E\uDD88'; // shark emoji
    default:
      return '';
  }
}

function TradeRow({ trade }: { trade: WhaleTrade }) {
  const sideColor = trade.side === 'yes' ? 'var(--positive)' : 'var(--negative)';
  const sideLabel = trade.side.toUpperCase();

  return (
    <div className="kil-whale-trade" data-tier={trade.tier}>
      <span className="kil-whale-emoji">{getTierEmoji(trade.tier)}</span>
      <span className="kil-whale-value">{formatDollar(trade.dollarValue)}</span>
      <span className="kil-whale-side" style={{ color: sideColor }}>
        on {sideLabel}
      </span>
      <span className="kil-whale-price">at {formatPrice(trade.price)}</span>
      <span className="kil-whale-time">{formatTimeAgo(trade.timestamp)}</span>
    </div>
  );
}

function BiasBar({ bias }: { bias: number }) {
  // bias: -1 (all NO) to +1 (all YES)
  // Convert to percentage for bar position (0% = all NO, 100% = all YES)
  const pct = ((bias + 1) / 2) * 100;
  const label = bias > 0.1 ? 'YES bias' : bias < -0.1 ? 'NO bias' : 'Balanced';
  const color = bias > 0.1 ? 'var(--positive)' : bias < -0.1 ? 'var(--negative)' : 'var(--text-secondary)';

  return (
    <div className="kil-whale-bias">
      <div className="kil-whale-bias-bar">
        <div
          className="kil-whale-bias-indicator"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="kil-whale-bias-labels">
        <span>NO</span>
        <span style={{ color }}>{Math.abs(bias * 100).toFixed(0)}% {label}</span>
        <span>YES</span>
      </div>
    </div>
  );
}

export function WhaleSignalsBlock({ signals, loading, error }: Props) {
  if (loading && !signals) {
    return (
      <div className="kil-skeleton-group">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="kil-skeleton" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="kil-error">{error}</div>;
  }

  if (!signals) {
    return (
      <div className="kil-empty-state">
        No trade data available
      </div>
    );
  }

  const { recentTrades, totalVolume24h, whaleBias, avgWhaleEntry, isUnusualActivity } = signals;

  return (
    <div>
      {/* Unusual activity flag */}
      {isUnusualActivity && (
        <div className="kil-whale-unusual">
          High activity - volume significantly above average
        </div>
      )}

      {/* Summary stats */}
      <div className="kil-whale-summary">
        <div className="kil-whale-stat">
          <span className="kil-whale-stat-label">24h Volume</span>
          <span className="kil-whale-stat-value">{formatDollar(totalVolume24h)}</span>
        </div>
        {avgWhaleEntry > 0 && (
          <div className="kil-whale-stat">
            <span className="kil-whale-stat-label">Avg Entry</span>
            <span className="kil-whale-stat-value">{formatPrice(avgWhaleEntry)}</span>
          </div>
        )}
      </div>

      {/* Whale bias indicator */}
      {recentTrades.length > 0 && (
        <BiasBar bias={whaleBias} />
      )}

      {/* Recent trades header */}
      <div className="kil-whale-header">
        <span>Recent Large Trades</span>
        <span className="kil-live-dot" title="Live updates" />
      </div>

      {/* Trade list */}
      {recentTrades.length === 0 ? (
        <div className="kil-empty-state" style={{ padding: '12px 0' }}>
          No large trades in last 30 min
        </div>
      ) : (
        <div className="kil-whale-trades">
          {recentTrades.slice(0, 10).map((trade) => (
            <TradeRow key={trade.tradeId} trade={trade} />
          ))}
        </div>
      )}
    </div>
  );
}
