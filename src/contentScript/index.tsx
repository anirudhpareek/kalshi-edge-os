/**
 * Content Script entry point.
 * Injects the Kalshi Intelligence Layer panel into Kalshi market pages.
 * Uses Shadow DOM for CSS isolation.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../ui/App';
import styles from '../ui/styles/app.css?inline';

const HOST_ID = 'kalshi-intel-host';

/**
 * Try to extract the event/market ticker from the page DOM.
 * Kalshi is a Next.js app — the real ticker lives in __NEXT_DATA__
 * or in API-fetched JSON embedded in script tags, not in the URL slug.
 */
function extractTickerFromDOM(): { ticker: string; type: 'market' | 'event' } | null {
  // Strategy 1: __NEXT_DATA__ (Next.js pages embed route data here)
  try {
    const nextDataEl = document.querySelector('script#__NEXT_DATA__');
    if (nextDataEl?.textContent) {
      const data = JSON.parse(nextDataEl.textContent);
      // Look for ticker in page props — common patterns:
      //   props.pageProps.event.event_ticker
      //   props.pageProps.market.ticker
      //   props.pageProps.eventTicker
      const pageProps = data?.props?.pageProps;
      if (pageProps) {
        // Direct event ticker
        if (pageProps.event?.event_ticker) {
          return { ticker: pageProps.event.event_ticker, type: 'event' };
        }
        // Direct market ticker
        if (pageProps.market?.ticker) {
          return { ticker: pageProps.market.ticker, type: 'market' };
        }
        // Event ticker as a string prop
        if (pageProps.eventTicker) {
          return { ticker: pageProps.eventTicker, type: 'event' };
        }
        if (pageProps.marketTicker) {
          return { ticker: pageProps.marketTicker, type: 'market' };
        }
        // Search recursively for any ticker-like field
        const tickerStr = findTickerInObject(pageProps);
        if (tickerStr) {
          return { ticker: tickerStr, type: 'event' };
        }
      }
    }
  } catch (e) {
    console.warn('[KalshiIntel] Failed to parse __NEXT_DATA__:', e);
  }

  // Strategy 2: Look for JSON-LD or other script tags with structured data
  try {
    const scripts = document.querySelectorAll('script[type="application/json"]');
    for (const script of scripts) {
      if (!script.textContent) continue;
      const data = JSON.parse(script.textContent);
      const tickerStr = findTickerInObject(data);
      if (tickerStr) {
        return { ticker: tickerStr, type: 'event' };
      }
    }
  } catch { /* skip */ }

  // Strategy 3: Look for the ticker in meta tags
  try {
    const ogUrl = document.querySelector('meta[property="og:url"]')?.getAttribute('content');
    if (ogUrl) {
      // og:url might contain the actual ticker
      const match = ogUrl.match(/(?:event_ticker|ticker)=([A-Z0-9][A-Z0-9\-]+)/i);
      if (match) return { ticker: match[1].toUpperCase(), type: 'event' };
    }
  } catch { /* skip */ }

  return null;
}

/** Recursively search an object for a field that looks like a Kalshi ticker. */
function findTickerInObject(obj: unknown, depth = 0): string | null {
  if (depth > 5 || !obj || typeof obj !== 'object') return null;

  const record = obj as Record<string, unknown>;

  // Check known ticker field names
  for (const key of ['event_ticker', 'eventTicker', 'ticker', 'market_ticker', 'marketTicker']) {
    const val = record[key];
    if (typeof val === 'string' && /^[A-Z0-9][A-Z0-9\-]{2,}$/.test(val)) {
      return val;
    }
  }

  // Recurse into nested objects (but not arrays to avoid noise)
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = findTickerInObject(val, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

function isMarketOrEventPage(url: string): boolean {
  return url.includes('kalshi.com/markets/') || url.includes('kalshi.com/events/');
}

function getPageTicker(): string | null {
  const fromDOM = extractTickerFromDOM();
  if (fromDOM) {
    console.log('[KalshiIntel] Extracted ticker from DOM:', fromDOM.ticker, fromDOM.type);
    return fromDOM.ticker;
  }

  // Debug: dump what's available so we can improve extraction
  console.log('[KalshiIntel] Could not extract ticker from DOM.');
  console.log('[KalshiIntel] URL:', window.location.href);
  console.log('[KalshiIntel] __NEXT_DATA__ exists:', !!document.querySelector('script#__NEXT_DATA__'));
  const nextData = document.querySelector('script#__NEXT_DATA__');
  if (nextData?.textContent) {
    try {
      const parsed = JSON.parse(nextData.textContent);
      console.log('[KalshiIntel] __NEXT_DATA__ keys:', Object.keys(parsed));
      console.log('[KalshiIntel] pageProps keys:', Object.keys(parsed?.props?.pageProps ?? {}));
      console.log('[KalshiIntel] __NEXT_DATA__.props.pageProps:', JSON.stringify(parsed?.props?.pageProps).slice(0, 500));
    } catch { /* skip */ }
  }
  return null;
}

let currentRoot: ReactDOM.Root | null = null;
let lastInitUrl = '';

const WRAPPER_ID = 'kalshi-intel-wrapper';
const PAGE_CONTENT_ID = 'kalshi-intel-page-content';

/**
 * Wraps the entire page body content in a flex container.
 * This allows the panel to push page content rather than overlay it.
 */
function wrapPageContent(): HTMLElement {
  // Check if already wrapped
  let wrapper = document.getElementById(WRAPPER_ID);
  if (wrapper) return wrapper;

  // Create wrapper
  wrapper = document.createElement('div');
  wrapper.id = WRAPPER_ID;
  wrapper.style.cssText = [
    'display: flex',
    'flex-direction: row',
    'min-height: 100vh',
    'width: 100%',
  ].join(';');

  // Create page content container
  const pageContent = document.createElement('div');
  pageContent.id = PAGE_CONTENT_ID;
  pageContent.style.cssText = [
    'flex: 1',
    'min-width: 0',
    'overflow-x: hidden',
    'transition: all 0.2s ease',
  ].join(';');

  // Move all body children to page content
  while (document.body.firstChild) {
    pageContent.appendChild(document.body.firstChild);
  }

  wrapper.appendChild(pageContent);
  document.body.appendChild(wrapper);

  // Reset body styles for flex layout
  document.body.style.cssText = [
    'margin: 0',
    'padding: 0',
    'overflow-x: hidden',
  ].join(';');

  return wrapper;
}

function init(): void {
  const url = window.location.href;
  if (!url.includes('kalshi.com')) return;

  // Remove stale instance
  const existingHost = document.getElementById(HOST_ID);
  if (existingHost) {
    existingHost.remove();
    currentRoot = null;
  }

  // Wrap page content first
  const wrapper = wrapPageContent();

  // Create host element (as flex sibling to page content)
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = [
    'flex-shrink: 0',
    'height: 100vh',
    'position: sticky',
    'top: 0',
    'z-index: 2147483647',
    'font-family: system-ui, -apple-system, sans-serif',
  ].join(';');
  wrapper.appendChild(host);

  // Attach shadow DOM for CSS isolation
  const shadow = host.attachShadow({ mode: 'open' });

  // Inject styles
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  shadow.appendChild(styleEl);

  // Mount container
  const container = document.createElement('div');
  container.id = 'kalshi-intel-root';
  container.style.cssText = 'height: 100%; display: flex;';
  shadow.appendChild(container);

  const ticker = getPageTicker();
  const onMarketPage = isMarketOrEventPage(url);

  currentRoot = ReactDOM.createRoot(container);
  currentRoot.render(
    <React.StrictMode>
      <App
        marketTicker={ticker}
        isMarketPage={onMarketPage}
        currentUrl={url}
      />
    </React.StrictMode>
  );

  lastInitUrl = url;
}

// Wait for body before injecting
function waitForBody(cb: () => void): void {
  if (document.body) {
    cb();
  } else {
    document.addEventListener('DOMContentLoaded', cb, { once: true });
  }
}

waitForBody(init);

// SPA navigation observer (Kalshi uses client-side routing)
let lastObservedUrl = window.location.href;
const navObserver = new MutationObserver(() => {
  const current = window.location.href;
  if (current !== lastObservedUrl) {
    lastObservedUrl = current;
    // Small debounce to let the page settle
    setTimeout(() => {
      if (window.location.href !== lastInitUrl) {
        init();
      }
    }, 300);
  }
});

if (document.body) {
  navObserver.observe(document.body, { childList: true, subtree: true });
}
