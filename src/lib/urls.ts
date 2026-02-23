/**
 * Canonical URL construction for Kalshi markets.
 *
 * Kalshi URL pattern:
 *   /markets/{series}/{slug}/{event-ticker}
 *   e.g. /markets/kxbtcd/bitcoin-price-abovebelow/kxbtcd-26feb2209
 *
 * We need: series_ticker (or extract from event_ticker), title (to generate slug), and event_ticker
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
 * Extract series from event_ticker when series_ticker is not available.
 * Event tickers follow pattern: SERIES-SUFFIX (e.g., KXBTCD-26FEB22)
 * Series is the alphabetic prefix before any numbers or hyphens.
 */
function extractSeriesFromEventTicker(eventTicker: string): string | null {
  // Match the alphabetic prefix (series is usually all caps letters)
  const match = eventTicker.match(/^([A-Z]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Get the canonical Kalshi URL for a market.
 * Returns null if we don't have enough data to build a reliable URL.
 *
 * URL format: /markets/{series}/{slug}/{event-ticker}
 */
export function getCanonicalMarketUrl(market: MarketUrlData): string | null {
  if (!market.eventTicker || !market.title) {
    return null;
  }

  // Get series: prefer explicit series_ticker, otherwise extract from event_ticker
  const series = market.seriesTicker?.toLowerCase()
    || extractSeriesFromEventTicker(market.eventTicker);

  if (!series) {
    return null;
  }

  const slug = titleToSlug(market.title);
  const eventTicker = market.eventTicker.toLowerCase();

  return `https://kalshi.com/markets/${series}/${slug}/${eventTicker}`;
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
