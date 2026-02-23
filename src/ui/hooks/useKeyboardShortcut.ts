import { useEffect } from 'react';

interface ShortcutOptions {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * Registers a keyboard shortcut on the document.
 * The listener is attached to the shadow-host's document, so it works
 * even when focus is inside the shadow DOM.
 */
export function useKeyboardShortcut(opts: ShortcutOptions, handler: () => void): void {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      const ctrlOrMeta = opts.ctrlKey || opts.metaKey
        ? (e.ctrlKey || e.metaKey)
        : true;

      if (
        e.key.toLowerCase() === opts.key.toLowerCase() &&
        ctrlOrMeta &&
        (opts.shiftKey ? e.shiftKey : true) &&
        (opts.altKey ? e.altKey : true)
      ) {
        // Only trigger if ctrlKey/metaKey is actually required and pressed
        const requiresCtrlMeta = opts.ctrlKey || opts.metaKey;
        if (requiresCtrlMeta && !e.ctrlKey && !e.metaKey) return;

        e.preventDefault();
        e.stopPropagation();
        handler();
      }
    };

    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [opts.key, opts.ctrlKey, opts.metaKey, opts.shiftKey, opts.altKey, handler]);
}
