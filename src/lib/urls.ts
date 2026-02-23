/**
 * Canonical URL construction for Kalshi markets.
 *
 * Kalshi URL patterns:
 *   - Events: https://kalshi.com/events/{event_ticker}
 *   - Markets page: https://kalshi.com/markets/{series}/{slug}/{event_ticker}
 *
 * Market tickers (e.g., "KXBTCD-26FEB22-T50000") are internal API identifiers
 * and do NOT work as URL slugs. Event tickers are the correct URL identifier.
 */

export interface MarketUrlData {
  ticker: string;
  eventTicker?: string;
  seriesTicker?: string;
  title?: string;
}

/**
 * Get the canonical Kalshi URL for a market.
 * Returns null if we don't have enough data to build a reliable URL.
 */
export function getCanonicalMarketUrl(market: MarketUrlData): string | null {
  // Primary: Use event_ticker - this is the most reliable URL format
  if (market.eventTicker) {
    return `https://kalshi.com/events/${market.eventTicker}`;
  }

  // Fallback: Use series_ticker for series-level pages
  // Note: This goes to a series overview, not a specific market
  if (market.seriesTicker) {
    return `https://kalshi.com/markets/${market.seriesTicker.toLowerCase()}`;
  }

  // Cannot construct a reliable URL
  return null;
}

/**
 * Extract URL components for debugging/reporting.
 */
export function getUrlDebugInfo(market: MarketUrlData): Record<string, string | undefined> {
  return {
    marketTicker: market.ticker,
    eventTicker: market.eventTicker,
    seriesTicker: market.seriesTicker,
    computedUrl: getCanonicalMarketUrl(market) ?? 'UNABLE_TO_COMPUTE',
    title: market.title,
  };
}

/**
 * Generate a debug report string for clipboard copying.
 */
export function generateBadLinkReport(
  currentMarketTicker: string,
  candidateMarket: MarketUrlData
): string {
  const timestamp = new Date().toISOString();
  const debugInfo = getUrlDebugInfo(candidateMarket);

  return [
    `=== Kalshi Intel Bad Link Report ===`,
    `Timestamp: ${timestamp}`,
    `Current Market: ${currentMarketTicker}`,
    `---`,
    `Candidate Market Ticker: ${debugInfo.marketTicker}`,
    `Candidate Event Ticker: ${debugInfo.eventTicker ?? 'N/A'}`,
    `Candidate Series Ticker: ${debugInfo.seriesTicker ?? 'N/A'}`,
    `Candidate Title: ${debugInfo.title ?? 'N/A'}`,
    `Computed URL: ${debugInfo.computedUrl}`,
    `===`,
  ].join('\n');
}
