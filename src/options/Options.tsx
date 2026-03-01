import React, { useState, useEffect, useCallback } from 'react';
import type { UserPrefs, BlockConfig } from '../lib/types';
import { getPrefs, setPrefs } from '../lib/storage';
import { DEFAULT_PREFS, blocksForMode } from '../lib/types';

const BLOCK_LABELS: Record<string, string> = {
  intelligence: 'Market Intelligence',
  outcomes: 'All Outcomes',
  context: 'Context (News)',
  thesis: 'My Thesis',
  related: 'Related Markets',
  alerts: 'Alerts',
  review: 'Review / Learn',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="kil-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="kil-toggle-slider" />
    </label>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h2 style={{
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: '#8888a8', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid #2a2a38',
    margin: '0 0 12px',
  }}>{children}</h2>;
}

export default function Options() {
  const [prefs, setLocalPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPrefs().then((p) => {
      setLocalPrefs(p);
      setLoading(false);
    });
  }, []);

  const save = useCallback(async (patch: Partial<UserPrefs>) => {
    const updated = { ...prefs, ...patch };
    setLocalPrefs(updated);
    await setPrefs(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [prefs]);

  const updateBlock = useCallback((id: string, visible: boolean) => {
    const blocks = prefs.blocks.map((b: BlockConfig) => b.id === id ? { ...b, visible } : b);
    void save({ blocks });
  }, [prefs.blocks, save]);

  const isDark = prefs.theme !== 'light';

  if (loading) {
    return (
      <div className="kil-options-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <span style={{ color: '#8888a8' }}>Loading...</span>
      </div>
    );
  }

  return (
    <div className={`kil-options-root ${prefs.theme === 'light' ? 'light' : ''}`}>
      <div className="kil-options-container">
        <div className="kil-options-header">
          <h1>Kalshi Edge OS</h1>
          <p>Settings and preferences</p>
          {saved && (
            <p style={{ color: '#00c896', marginTop: 4, fontSize: 12 }}>Settings saved</p>
          )}
        </div>

        {/* Theme */}
        <div className="kil-options-section" style={{ marginBottom: 28 }}>
          <SectionHeader>Appearance</SectionHeader>
          <div className="kil-options-row">
            <div className="kil-options-label">
              <strong>Theme</strong>
              <span>Controls the panel color scheme</span>
            </div>
            <select
              className="kil-options-select"
              style={{ width: 120 }}
              value={prefs.theme}
              onChange={(e) => void save({ theme: e.target.value as UserPrefs['theme'] })}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className="kil-options-row">
            <div className="kil-options-label">
              <strong>Mode</strong>
              <span>Quick Trade, Deep Analysis, or Review/Learning layout</span>
            </div>
            <select
              className="kil-options-select"
              style={{ width: 140 }}
              value={prefs.mode}
              onChange={(e) => {
                const mode = e.target.value as UserPrefs['mode'];
                void save({ mode, blocks: blocksForMode(mode) });
              }}
            >
              <option value="quick">Quick Trade</option>
              <option value="deep">Deep Analysis</option>
              <option value="review">Review / Learn</option>
            </select>
          </div>
        </div>

        {/* Blocks */}
        <div className="kil-options-section" style={{ marginBottom: 28 }}>
          <SectionHeader>Blocks</SectionHeader>
          {prefs.blocks
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((block) => (
              <div key={block.id} className="kil-options-row">
                <div className="kil-options-label">
                  <strong>{BLOCK_LABELS[block.id] ?? block.id}</strong>
                </div>
                <Toggle
                  checked={block.visible}
                  onChange={(v) => updateBlock(block.id, v)}
                />
              </div>
            ))}
        </div>

        {/* LLM */}
        <div className="kil-options-section" style={{ marginBottom: 28 }}>
          <SectionHeader>AI Summaries (Optional)</SectionHeader>
          <div className="kil-options-row">
            <div className="kil-options-label">
              <strong>Enable AI summaries</strong>
              <span>Summarize news headlines using Claude API</span>
            </div>
            <Toggle
              checked={prefs.llmEnabled}
              onChange={(v) => void save({ llmEnabled: v })}
            />
          </div>
          {prefs.llmEnabled && (
            <div className="kil-options-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
              <div className="kil-options-label">
                <strong>Anthropic API Key</strong>
                <span>Your key is stored locally and never shared</span>
              </div>
              <input
                type="password"
                className="kil-options-input"
                placeholder="sk-ant-..."
                value={prefs.llmApiKey}
                onChange={(e) => void save({ llmApiKey: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>

        {/* Polling */}
        <div className="kil-options-section" style={{ marginBottom: 28 }}>
          <SectionHeader>Polling</SectionHeader>
          <div className="kil-options-row">
            <div className="kil-options-label">
              <strong>Alert polling interval</strong>
              <span>How often to check prices for alerts (seconds)</span>
            </div>
            <select
              className="kil-options-select"
              style={{ width: 90 }}
              value={prefs.pollingIntervalSeconds}
              onChange={(e) => void save({ pollingIntervalSeconds: parseInt(e.target.value, 10) })}
            >
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
              <option value={120}>2min</option>
            </select>
          </div>
        </div>

        {/* Privacy */}
        <div className="kil-options-section">
          <SectionHeader>Privacy</SectionHeader>
          <div className="kil-options-privacy">
            <p style={{ marginBottom: 6 }}>This extension stores the following data <strong>locally in your browser only</strong>:</p>
            <ul>
              <li>Your thesis notes (per market)</li>
              <li>Your current mode and layout preferences</li>
              <li>Block layout preferences</li>
              <li>Alert configurations</li>
              <li>Cached market data (expires on fetch)</li>
              <li>Cached news headlines (expires after 15 minutes)</li>
            </ul>
            <p style={{ marginTop: 8 }}>
              If AI summaries are enabled, news headlines (not your personal notes)
              are sent to the Anthropic API using the key you provide.
              Your thesis notes are <strong>never</strong> sent anywhere.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
