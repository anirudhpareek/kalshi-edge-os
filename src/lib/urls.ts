/**
 * Canonical URL construction for Kalshi markets.
 *
 * Kalshi URL pattern:
 *   /markets/{series}/{slug}/{event-ticker}
 *   e.g. /markets/kxbtcd/bitcoin-price-abovebelow/kxbtcd-26feb2209
 *
 * We need: series_ticker, title (to generate slug), and event_ticker
 */

export interface MarketUrlData {
  ticker: string;
  eventTicker?: string;
  seriesTicker?: string;
  title?: string;
}

/**
 * Convert a title to a URL-friendly slug.
 * "Bitcoin Price Above/Below?" -> "bitcoin-price-abovebelow"
 */
function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')          // Replace spaces with hyphens
    .replace(/-+/g, '-')           // Collapse multiple hyphens
    .replace(/^-|-$/g, '');        // Trim leading/trailing hyphens
}

/**
 * Get the canonical Kalshi URL for a market.
 * Returns null if we don't have enough data to build a reliable URL.
 *
 * URL format: /markets/{series}/{slug}/{event-ticker}
 */
export function getCanonicalMarketUrl(market: MarketUrlData): string | null {
  // Need all three: series_ticker, title (for slug), and event_ticker
  if (market.seriesTicker && market.title && market.eventTicker) {
    const series = market.seriesTicker.toLowerCase();
    const slug = titleToSlug(market.title);
    const eventTicker = market.eventTicker.toLowerCase();

    return `https://kalshi.com/markets/${series}/${slug}/${eventTicker}`;
  }

  // Fallback: Try just series + event_ticker (Kalshi might redirect)
  if (market.seriesTicker && market.eventTicker) {
    const series = market.seriesTicker.toLowerCase();
    const eventTicker = market.eventTicker.toLowerCase();
    return `https://kalshi.com/markets/${series}/${eventTicker}`;
  }

  // Last resort: event page (may or may not work)
  if (market.eventTicker) {
    return `https://kalshi.com/events/${market.eventTicker.toLowerCase()}`;
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
