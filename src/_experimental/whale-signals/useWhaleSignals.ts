/**
 * useWhaleSignals Hook
 * Add this to src/ui/hooks/useMarketData.ts to re-enable the feature
 */
import { useState, useEffect, useCallback } from 'react';
import type { WhaleSignals } from './types';

interface WhaleMsg {
  type: 'FETCH_WHALE_SIGNALS';
  payload: { ticker: string };
}

interface WhaleMsgResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// Copy from useMarketData.ts
function sendMsg<T>(msg: WhaleMsg): Promise<WhaleMsgResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response: WhaleMsgResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response ?? { ok: false, error: 'No response' });
      }
    });
  });
}

export function useWhaleSignals(ticker: string | null) {
  const [signals, setSignals] = useState<WhaleSignals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!ticker) return;
    setLoading((prev) => (signals ? prev : true));

    const res = await sendMsg<WhaleSignals>({
      type: 'FETCH_WHALE_SIGNALS',
      payload: { ticker },
    });

    if (res.ok && res.data) {
      setSignals(res.data);
      setError(null);
    } else {
      setError(res.error ?? 'Failed to load whale signals');
    }
    setLoading(false);
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ticker) {
      setSignals(null);
      return;
    }

    void fetch();
    // Refresh every 30 seconds
    const id = setInterval(fetch, 30_000);
    return () => clearInterval(id);
  }, [ticker, fetch]);

  return { signals, loading, error, refresh: fetch };
}

/**
 * Also add to serviceWorker.ts:
 *
 * import { computeWhaleSignals } from '../lib/whaleClient';
 *
 * // In handleMessage switch:
 * case 'FETCH_WHALE_SIGNALS': {
 *   const { ticker } = msg.payload as { ticker: string };
 *   const signals = await computeWhaleSignals(ticker);
 *   return { ok: true, data: signals };
 * }
 */
