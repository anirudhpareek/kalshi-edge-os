import { useState, useEffect, useCallback } from 'react';
import type { UserPrefs, ThesisData, BlockConfig } from '../../lib/types';
import { getPrefs, setPrefs, getThesis, setThesis, watchPrefs } from '../../lib/storage';

// ─── Prefs hook ───────────────────────────────────────────────────────────────

export function usePrefs(): [UserPrefs | null, (patch: Partial<UserPrefs>) => Promise<void>] {
  const [prefs, setLocalPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    getPrefs().then(setLocalPrefs);
    const cleanup = watchPrefs(setLocalPrefs);
    return cleanup;
  }, []);

  const updatePrefs = useCallback(async (patch: Partial<UserPrefs>) => {
    await setPrefs(patch);
    setLocalPrefs((p) => (p ? { ...p, ...patch } : null));
  }, []);

  return [prefs, updatePrefs];
}

// ─── Block layout hook ────────────────────────────────────────────────────────

export function useBlockLayout(prefs: UserPrefs | null, updatePrefs: (p: Partial<UserPrefs>) => Promise<void>) {
  const blocks = prefs?.blocks ?? [];

  const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);

  const toggleBlock = useCallback(
    async (id: string) => {
      if (!prefs) return;
      const updated = prefs.blocks.map((b) =>
        b.id === id ? { ...b, visible: !b.visible } : b
      );
      await updatePrefs({ blocks: updated });
    },
    [prefs, updatePrefs]
  );

  const reorderBlocks = useCallback(
    async (reordered: BlockConfig[]) => {
      if (!prefs) return;
      await updatePrefs({ blocks: reordered });
    },
    [prefs, updatePrefs]
  );

  const setBlockSize = useCallback(
    async (id: string, size: BlockConfig['size']) => {
      if (!prefs) return;
      const updated = prefs.blocks.map((b) => (b.id === id ? { ...b, size } : b));
      await updatePrefs({ blocks: updated });
    },
    [prefs, updatePrefs]
  );

  return { sortedBlocks, toggleBlock, reorderBlocks, setBlockSize };
}

// ─── Thesis hook ──────────────────────────────────────────────────────────────

export function useThesis(ticker: string | null): [ThesisData | null, (d: Partial<ThesisData>) => Promise<void>] {
  const [thesis, setLocalThesis] = useState<ThesisData | null>(null);

  useEffect(() => {
    if (!ticker) return;
    getThesis(ticker).then(setLocalThesis);
  }, [ticker]);

  const updateThesis = useCallback(
    async (patch: Partial<ThesisData>) => {
      if (!ticker) return;
      const current: ThesisData = thesis ?? {
        myProbability: '',
        myThesis: '',
        whatWouldChangeMyMind: '',
        updatedAt: 0,
      };
      const updated: ThesisData = { ...current, ...patch, updatedAt: Date.now() };
      setLocalThesis(updated);
      await setThesis(ticker, updated);
    },
    [ticker, thesis]
  );

  return [thesis, updateThesis];
}
