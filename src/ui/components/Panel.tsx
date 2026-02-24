import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { BlockConfig, UserPrefs } from '../../lib/types';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

const MIN_WIDTH = 280;
const MAX_WIDTH = 620;

interface Props {
  prefs: UserPrefs;
  onPrefsChange: (patch: Partial<UserPrefs>) => Promise<void>;
  children: (sortedBlocks: BlockConfig[], onReorder: (dragId: string, targetId: string) => void) => React.ReactNode;
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return collapsed ? (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="10,4 6,8 10,12" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="6,4 10,8 6,12" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.3 3.3l1.4 1.4M11.3 11.3l1.4 1.4M3.3 12.7l1.4-1.4M11.3 4.7l1.4-1.4" />
    </svg>
  );
}

export function Panel({ prefs, onPrefsChange, children }: Props) {
  const [collapsed, setCollapsed] = useState(!prefs.panelOpen);
  const [width, setWidth] = useState(prefs.panelWidth);
  const [isDraggingResize, setIsDraggingResize] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Sync from prefs
  useEffect(() => {
    setCollapsed(!prefs.panelOpen);
    setWidth(prefs.panelWidth);
  }, [prefs.panelOpen, prefs.panelWidth]);

  // Keyboard shortcut: Ctrl/Cmd + Shift + K
  useKeyboardShortcut(
    { key: 'k', ctrlKey: true, shiftKey: true },
    useCallback(() => {
      setCollapsed((c) => {
        const next = !c;
        void onPrefsChange({ panelOpen: !next });
        return next;
      });
    }, [onPrefsChange])
  );

  const handleToggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      void onPrefsChange({ panelOpen: !next });
      return next;
    });
  }, [onPrefsChange]);

  // ─── Resize drag ────────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = width;
    setIsDraggingResize(true);

    const onMouseMove = (ev: MouseEvent) => {
      const delta = resizeStartX.current - ev.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartWidth.current + delta));
      setWidth(next);
    };

    const onMouseUp = (ev: MouseEvent) => {
      const delta = resizeStartX.current - ev.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartWidth.current + delta));
      setIsDraggingResize(false);
      void onPrefsChange({ panelWidth: next });
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [width, onPrefsChange]);

  // ─── Block reorder ───────────────────────────────────────────────────────────

  const sortedBlocks = [...prefs.blocks].sort((a, b) => a.order - b.order);

  const handleReorder = useCallback((dragId: string, targetId: string) => {
    const blocks = [...prefs.blocks].sort((a, b) => a.order - b.order);
    const dragIdx = blocks.findIndex((b) => b.id === dragId);
    const targetIdx = blocks.findIndex((b) => b.id === targetId);
    if (dragIdx < 0 || targetIdx < 0) return;

    const reordered = [...blocks];
    const [removed] = reordered.splice(dragIdx, 1);
    reordered.splice(targetIdx, 0, removed);

    const updated = reordered.map((b, i) => ({ ...b, order: i }));
    void onPrefsChange({ blocks: updated });
  }, [prefs.blocks, onPrefsChange]);

  const openSettings = useCallback(() => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  }, []);

  return (
    <div
      className={`kil-panel ${collapsed ? 'collapsed' : ''}`}
      style={{ width: collapsed ? 0 : width }}
    >
      {/* Toggle button (attached to panel edge) */}
      <button
        className="kil-toggle-btn"
        onClick={handleToggle}
        title={collapsed ? 'Open panel (Ctrl+Shift+K)' : 'Close panel (Ctrl+Shift+K)'}
      >
        <CollapseIcon collapsed={collapsed} />
      </button>

      {/* Resize handle */}
      {!collapsed && (
        <div
          className={`kil-resize-handle ${isDraggingResize ? 'dragging' : ''}`}
          onMouseDown={handleResizeMouseDown}
          title="Drag to resize"
        />
      )}

      {/* Panel content */}
      <div className="kil-panel-inner">
        {/* Header */}
        <div className="kil-header">
          <div className="kil-header-logo">Kalshi Intel</div>
          <div className="kil-header-actions">
            <button
              className="kil-icon-btn"
              onClick={openSettings}
              title="Settings (Theme, Blocks, Alerts)"
            >
              <SettingsIcon />
            </button>
          </div>
        </div>

        {/* Content (scrollable) */}
        <div className="kil-scroll">
          {children(sortedBlocks, handleReorder)}
        </div>
      </div>
    </div>
  );
}
