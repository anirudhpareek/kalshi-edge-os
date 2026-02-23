import React, { useState, useRef, useCallback } from 'react';
import type { BlockConfig } from '../../lib/types';

interface Props {
  config: BlockConfig;
  title: string;
  children: React.ReactNode;
  onReorder: (dragId: string, targetId: string) => void;
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="4,6 8,10 12,6" />
    </svg>
  );
}

function DragIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor">
      <rect x="4" y="3" width="2" height="2" rx="1" />
      <rect x="10" y="3" width="2" height="2" rx="1" />
      <rect x="4" y="7" width="2" height="2" rx="1" />
      <rect x="10" y="7" width="2" height="2" rx="1" />
      <rect x="4" y="11" width="2" height="2" rx="1" />
      <rect x="10" y="11" width="2" height="2" rx="1" />
    </svg>
  );
}

export function BlockWrapper({ config, title, children, onReorder }: Props) {
  const [open, setOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', config.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [config.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const dragId = e.dataTransfer.getData('text/plain');
    if (dragId && dragId !== config.id) {
      onReorder(dragId, config.id);
    }
  }, [config.id, onReorder]);

  return (
    <div
      ref={blockRef}
      className={`kil-block ${open ? 'open' : ''} ${isDragOver ? 'dragging-over' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="kil-block-header"
        onClick={() => setOpen((o) => !o)}
      >
        <span
          className="kil-block-drag"
          onClick={(e) => e.stopPropagation()}
          draggable={false}
          title="Drag to reorder"
        >
          <DragIcon />
        </span>
        <span className="kil-block-title">{title}</span>
        <span className="kil-block-chevron">
          <ChevronIcon />
        </span>
      </div>

      {open && (
        <div className="kil-block-body">
          {children}
        </div>
      )}
    </div>
  );
}
