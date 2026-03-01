import React, { useState, useEffect, useCallback } from 'react';
import type { Alert, AlertCondition, MarketModel, Msg, MsgResponse } from '../../../lib/types';

function sendMsg<T>(msg: Msg): Promise<MsgResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (response: MsgResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response ?? { ok: false, error: 'No response' });
      }
    });
  });
}

function makeId(): string {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

interface Props {
  market: MarketModel;
}

type NewAlertState = {
  condition: AlertCondition;
  threshold: string;
  timeWindow: string;
};

const DEFAULT_NEW: NewAlertState = { condition: 'above', threshold: '', timeWindow: '5' };

function formatAlertDesc(alert: Alert): string {
  const price = `${alert.threshold}%`;
  if (alert.condition === 'above') return `Yes price above ${price}`;
  if (alert.condition === 'below') return `Yes price below ${price}`;
  if (alert.condition === 'edgeAbove') return `Best edge above ${price}`;
  if (alert.condition === 'spreadWide') return `Spread above ${alert.threshold}c`;
  return `Moves ${price} in ${alert.timeWindowMinutes ?? 5}min`;
}

const PRESETS = [
  { label: '30%', condition: 'above' as AlertCondition, threshold: 30 },
  { label: '50%', condition: 'above' as AlertCondition, threshold: 50 },
  { label: '70%', condition: 'above' as AlertCondition, threshold: 70 },
  { label: 'Edge 2%', condition: 'edgeAbove' as AlertCondition, threshold: 2 },
  { label: 'Spread 4c', condition: 'spreadWide' as AlertCondition, threshold: 4 },
  { label: '±10%', condition: 'move' as AlertCondition, threshold: 10, timeWindow: 5 },
];

export function AlertsBlock({ market }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [newAlert, setNewAlert] = useState<NewAlertState>(DEFAULT_NEW);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const loadAlerts = useCallback(async () => {
    const res = await sendMsg<Alert[]>({ type: 'GET_ALERTS', payload: {} });
    if (res.ok && res.data) {
      setAlerts(res.data.filter((a) => a.marketTicker === market.ticker));
    }
  }, [market.ticker]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const handleAdd = async () => {
    const threshold = parseFloat(newAlert.threshold);
    const max = newAlert.condition === 'spreadWide' ? 50 : 100;
    if (isNaN(threshold) || threshold < 0 || threshold > max) {
      setError(`Enter a valid value (0-${max})`);
      return;
    }
    setError('');

    const alert: Alert = {
      id: makeId(),
      marketTicker: market.ticker,
      marketTitle: market.title,
      condition: newAlert.condition,
      threshold,
      timeWindowMinutes: newAlert.condition === 'move' ? parseInt(newAlert.timeWindow, 10) || 5 : undefined,
      enabled: true,
      createdAt: Date.now(),
    };

    setAdding(true);
    await sendMsg({ type: 'SET_ALERT', payload: { alert } });
    await loadAlerts();
    setNewAlert(DEFAULT_NEW);
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    await sendMsg({ type: 'DELETE_ALERT', payload: { id } });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleToggle = async (alert: Alert) => {
    const updated: Alert = { ...alert, enabled: !alert.enabled };
    await sendMsg({ type: 'SET_ALERT', payload: { alert: updated } });
    setAlerts((prev) => prev.map((a) => a.id === alert.id ? updated : a));
  };

  const handlePreset = (preset: typeof PRESETS[0]) => {
    setNewAlert({
      condition: preset.condition,
      threshold: String(preset.threshold),
      timeWindow: preset.timeWindow ? String(preset.timeWindow) : '5',
    });
  };

  return (
    <div>
      {/* Preset buttons */}
      <div className="kil-alert-presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            className="kil-preset-btn"
            onClick={() => handlePreset(preset)}
            title={preset.condition === 'move' ? `Move ${preset.threshold}% in ${preset.timeWindow}min` : `Yes price ${preset.condition} ${preset.threshold}%`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      <div className="kil-alert-form">
        <div className="kil-alert-row">
          <select
            className="kil-select"
            value={newAlert.condition}
            onChange={(e) => setNewAlert((p) => ({ ...p, condition: e.target.value as AlertCondition }))}
          >
            <option value="above">Yes price above</option>
            <option value="below">Yes price below</option>
            <option value="move">Moves by</option>
            <option value="edgeAbove">Best edge above</option>
            <option value="spreadWide">Spread above (cents)</option>
          </select>
          <input
            type="number"
            className="kil-input-small"
            placeholder={newAlert.condition === 'spreadWide' ? 'c' : '%'}
            min={0}
            max={newAlert.condition === 'spreadWide' ? 50 : 100}
            step={1}
            value={newAlert.threshold}
            onChange={(e) => setNewAlert((p) => ({ ...p, threshold: e.target.value }))}
          />
          {newAlert.condition === 'move' && (
            <>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>in</span>
              <input
                type="number"
                className="kil-input-small"
                min={1}
                max={60}
                value={newAlert.timeWindow}
                onChange={(e) => setNewAlert((p) => ({ ...p, timeWindow: e.target.value }))}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>min</span>
            </>
          )}
        </div>
        {error && <div style={{ fontSize: 10, color: 'var(--accent-danger)' }}>{error}</div>}
        <button
          className="kil-btn"
          onClick={handleAdd}
          disabled={adding || !newAlert.threshold}
        >
          {adding ? 'Adding...' : 'Add Alert'}
        </button>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="kil-empty-state">No alerts set for this market</div>
      ) : (
        <ul className="kil-alerts-list">
          {alerts.map((alert) => (
            <li key={alert.id} className={`kil-alert-item ${alert.enabled ? '' : 'disabled'}`}>
              <div className="kil-alert-desc">{formatAlertDesc(alert)}</div>
              <div className="kil-alert-actions">
                <button
                  className="kil-btn"
                  style={{ padding: '3px 7px', fontSize: 10 }}
                  onClick={() => handleToggle(alert)}
                  title={alert.enabled ? 'Disable' : 'Enable'}
                >
                  {alert.enabled ? 'On' : 'Off'}
                </button>
                <button
                  className="kil-btn kil-btn-danger"
                  style={{ padding: '3px 7px', fontSize: 10 }}
                  onClick={() => handleDelete(alert.id)}
                  title="Delete alert"
                >
                  x
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-muted)' }}>
        Edge alerts use your Thesis probability. Alerts notify while the browser is open.
      </div>
    </div>
  );
}
