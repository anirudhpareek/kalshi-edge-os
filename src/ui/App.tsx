import React, { useEffect, useRef } from 'react';
import { Panel } from './components/Panel';
import { BlockWrapper } from './components/BlockWrapper';
import { IntelligenceBlock } from './components/blocks/IntelligenceBlock';
import { OutcomesBlock } from './components/blocks/OutcomesBlock';
import { ContextBlock } from './components/blocks/ContextBlock';
import { ThesisBlock } from './components/blocks/ThesisBlock';
import { RelatedMarketsBlock } from './components/blocks/RelatedMarketsBlock';
import { AlertsBlock } from './components/blocks/AlertsBlock';
import { usePrefs } from './hooks/useStorage';
import { useThesis } from './hooks/useStorage';
import {
  useMarketData,
  useEventData,
  usePriceHistory,
  useRelatedMarkets,
  useNews,
  useLLMSummary,
} from './hooks/useMarketData';
import type { BlockConfig } from '../lib/types';

interface AppProps {
  marketTicker: string | null;
  isMarketPage: boolean;
  currentUrl: string;
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: '8px 16px' }}>
      <div className="kil-skeleton-group">
        {[100, 70, 90, 55, 80].map((w, i) => (
          <div key={i} className="kil-skeleton" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}

function NonMarketState() {
  return (
    <div className="kil-non-market">
      <div className="kil-non-market-icon">&#9685;</div>
      <h3>Not a market page</h3>
      <p>Navigate to a Kalshi market page to activate the intelligence layer.</p>
    </div>
  );
}

const BLOCK_LABELS: Record<string, string> = {
  intelligence: 'Market Intelligence',
  outcomes: 'All Outcomes',
  context: 'Context',
  thesis: 'My Thesis',
  related: 'Related Markets',
  alerts: 'Alerts',
};

export default function App({ marketTicker, isMarketPage, currentUrl }: AppProps) {
  const [prefs, updatePrefs] = usePrefs();
  const [thesis, updateThesis] = useThesis(marketTicker);

  const { market, loading: marketLoading, error: marketError } = useMarketData(
    marketTicker,
    isMarketPage ? currentUrl : ''
  );

  // Fetch full event data for multi-outcome markets
  const { event, loading: eventLoading } = useEventData(market?.eventTicker ?? null);

  const history = usePriceHistory(market?.ticker ?? null);
  const { related, loading: relatedLoading } = useRelatedMarkets(market);
  const { news, loading: newsLoading, error: newsError } = useNews(
    market ? market.title : null
  );

  const { bullets, loading: bulletsLoading } = useLLMSummary(
    news,
    market?.title ?? null,
    prefs?.llmEnabled ?? false,
    prefs?.llmApiKey ?? ''
  );

  // Apply theme class
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !prefs) return;

    el.classList.remove('theme-light', 'theme-dark');
    if (prefs.theme === 'light') {
      el.classList.add('theme-light');
    } else if (prefs.theme === 'dark') {
      // dark is default, no class needed
    } else {
      // system
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      if (mq.matches) el.classList.add('theme-light');
    }
  }, [prefs?.theme]);

  if (!prefs) return null; // Still loading prefs

  function renderBlock(config: BlockConfig, onReorder: (a: string, b: string) => void) {
    if (!config.visible) return null;

    return (
      <BlockWrapper
        key={config.id}
        config={config}
        title={BLOCK_LABELS[config.id] ?? config.id}
        onReorder={onReorder}
      >
        {renderBlockContent(config.id)}
      </BlockWrapper>
    );
  }

  function renderBlockContent(id: string) {
    if (!isMarketPage) {
      return <div className="kil-empty-state">Navigate to a market page</div>;
    }

    if (marketLoading && !market) {
      return <LoadingSkeleton />;
    }

    if (marketError && !market) {
      return <div className="kil-error">Error: {marketError}</div>;
    }

    switch (id) {
      case 'intelligence':
        return market ? (
          <IntelligenceBlock market={market} history={history} event={event} />
        ) : (
          <LoadingSkeleton />
        );

      case 'outcomes':
        return (
          <OutcomesBlock
            event={event}
            loading={eventLoading}
            currentMarketTicker={market?.ticker}
          />
        );

      case 'context':
        return (
          <ContextBlock
            news={news}
            loading={newsLoading}
            error={newsError}
            bullets={bullets}
            bulletsLoading={bulletsLoading}
            llmEnabled={prefs?.llmEnabled ?? false}
          />
        );

      case 'thesis':
        return (
          <ThesisBlock
            thesis={thesis}
            onUpdate={updateThesis}
          />
        );

      case 'related':
        return (
          <RelatedMarketsBlock
            markets={related}
            loading={relatedLoading}
            currentMarketTicker={market?.ticker}
            devMode={false} // Set to true to enable dev validation button
          />
        );

      case 'alerts':
        return market ? (
          <AlertsBlock market={market} />
        ) : (
          <div className="kil-empty-state">Loading market...</div>
        );

      default:
        return null;
    }
  }

  return (
    <div id="kalshi-intel-root" ref={rootRef}>
      <Panel prefs={prefs} onPrefsChange={updatePrefs}>
        {(sortedBlocks, onReorder) => (
          <>
            {!isMarketPage ? (
              <NonMarketState />
            ) : (
              sortedBlocks.map((block) => renderBlock(block, onReorder))
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
