import React, { useEffect, useState, useCallback } from 'react';
import type { RelatedMarket } from '../../../lib/types';
import { validateUrl, validateUrls } from '../../../lib/urlValidation';
import { generateBadLinkReport } from '../../../lib/urls';

interface Props {
  markets: RelatedMarket[];
  loading: boolean;
  currentMarketTicker?: string;
  devMode?: boolean;
}

interface ValidatedMarket extends RelatedMarket {
  validationChecked: boolean;
}

const INITIAL_MARKET_COUNT = 5;

function ProbBar({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  const color =
    value > 0.7
      ? 'var(--positive)'
      : value < 0.3
        ? 'var(--negative)'
        : 'var(--accent-warn)';
  return (
    <span
      style={{
        color,
        fontSize: 13,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        width: 36,
        flexShrink: 0,
      }}
    >
      {pct}%
    </span>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      style={{ width: 12, height: 12 }}
    >
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <path d="M3 11V3h8" />
    </svg>
  );
}

export function RelatedMarketsBlock({
  markets,
  loading,
  currentMarketTicker,
  devMode = false,
}: Props) {
  const [validatedMarkets, setValidatedMarkets] = useState<ValidatedMarket[]>(
    []
  );
  const [validating, setValidating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Convert markets to validated markets and run validation
  useEffect(() => {
    const initial: ValidatedMarket[] = markets.map((m) => ({
      ...m,
      validationChecked: m.urlValid !== null,
    }));
    setValidatedMarkets(initial);

    // Validate URLs that have a url but haven't been checked
    const toValidate = markets.filter((m) => m.url && m.urlValid === null);
    if (toValidate.length === 0) return;

    const urls = toValidate.map((m) => m.url!);
    setValidating(true);

    validateUrls(urls, 3)
      .then((results) => {
        setValidatedMarkets((prev) =>
          prev.map((m) => {
            if (!m.url) return m;
            const result = results.get(m.url);
            if (result) {
              return {
                ...m,
                urlValid: result.isValid,
                validationChecked: true,
              };
            }
            return m;
          })
        );
      })
      .catch(console.error)
      .finally(() => setValidating(false));
  }, [markets]);

  const handleReportBadLink = useCallback(
    async (market: RelatedMarket) => {
      const report = generateBadLinkReport(
        currentMarketTicker ?? 'UNKNOWN',
        market
      );

      try {
        await navigator.clipboard.writeText(report);
        setCopiedId(market.ticker);
        setTimeout(() => setCopiedId(null), 2000);
      } catch (e) {
        console.error('Failed to copy to clipboard:', e);
      }
    },
    [currentMarketTicker]
  );

  const handleDevValidateAll = useCallback(async () => {
    const urls = validatedMarkets.filter((m) => m.url).map((m) => m.url!);
    console.log('[DevMode] Validating all related market URLs:', urls);

    setValidating(true);
    try {
      const results = await validateUrls(urls, 3);
      console.log('[DevMode] Validation results:');
      for (const [url, result] of results) {
        console.log(
          `  ${result.isValid ? '✓' : '✗'} ${url} (status: ${result.statusCode ?? 'unknown'})`
        );
      }

      setValidatedMarkets((prev) =>
        prev.map((m) => {
          if (!m.url) return m;
          const result = results.get(m.url);
          if (result) {
            return {
              ...m,
              urlValid: result.isValid,
              validationChecked: true,
            };
          }
          return m;
        })
      );
    } catch (e) {
      console.error('[DevMode] Validation failed:', e);
    } finally {
      setValidating(false);
    }
  }, [validatedMarkets]);

  if (loading) {
    return (
      <div className="kil-skeleton-group">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="kil-skeleton"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </div>
    );
  }

  if (validatedMarkets.length === 0) {
    return <div className="kil-empty-state">No related markets found</div>;
  }

  // Separate valid and invalid links
  const validLinks = validatedMarkets.filter(
    (m) => m.url && m.urlValid !== false
  );
  const invalidLinks = validatedMarkets.filter(
    (m) => !m.url || m.urlValid === false
  );

  // Combined for display with show more logic
  const allLinks = [...validLinks, ...invalidLinks];
  const displayLinks = expanded ? allLinks : allLinks.slice(0, INITIAL_MARKET_COUNT);
  const displayValid = displayLinks.filter((m) => m.url && m.urlValid !== false);
  const displayInvalid = displayLinks.filter((m) => !m.url || m.urlValid === false);

  return (
    <div>
      {/* Dev mode validation button */}
      {devMode && (
        <div style={{ marginBottom: 8 }}>
          <button
            className="kil-btn"
            onClick={handleDevValidateAll}
            disabled={validating}
            style={{ fontSize: 10, padding: '3px 6px' }}
          >
            {validating ? 'Validating...' : 'Validate All URLs (Dev)'}
          </button>
        </div>
      )}

      {validating && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginBottom: 6,
          }}
        >
          Validating links...
        </div>
      )}

      <ul className="kil-related-list">
        {/* Valid links - clickable */}
        {displayValid.map((m) => (
          <li key={m.ticker}>
            <a
              className="kil-related-item"
              href={m.url!}
              target="_blank"
              rel="noreferrer"
            >
              <ProbBar value={m.impliedProbability} />
              <div className="kil-related-title">{m.title}</div>
              {m.status !== 'open' && (
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                >
                  {m.status}
                </span>
              )}
            </a>
          </li>
        ))}

        {/* Invalid links - not clickable, with report button */}
        {displayInvalid.map((m) => (
          <li key={m.ticker}>
            <div
              className="kil-related-item"
              style={{
                opacity: 0.5,
                cursor: 'not-allowed',
                position: 'relative',
              }}
              title={m.url ? 'Link unavailable' : 'No URL available'}
            >
              <ProbBar value={m.impliedProbability} />
              <div className="kil-related-title">{m.title}</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    color: 'var(--accent-danger)',
                    background: 'rgba(224,80,80,0.1)',
                    padding: '1px 4px',
                    borderRadius: 2,
                  }}
                >
                  Unavailable
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleReportBadLink(m);
                  }}
                  title="Copy debug info to clipboard"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color:
                      copiedId === m.ticker
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <CopyIcon />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Show more button */}
      {allLinks.length > INITIAL_MARKET_COUNT && (
        <button
          className="kil-show-more"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show ${allLinks.length - INITIAL_MARKET_COUNT} more`}
        </button>
      )}

      {/* Summary of unavailable links */}
      {invalidLinks.length > 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 10,
            color: 'var(--text-muted)',
          }}
        >
          {invalidLinks.length} link{invalidLinks.length !== 1 ? 's' : ''}{' '}
          unavailable
        </div>
      )}
    </div>
  );
}
