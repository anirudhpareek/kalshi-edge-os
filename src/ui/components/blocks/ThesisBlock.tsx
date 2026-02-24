import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { ThesisData } from '../../../lib/types';

interface Props {
  thesis: ThesisData | null;
  onUpdate: (patch: Partial<ThesisData>) => Promise<void>;
}

const SAVE_DELAY_MS = 800;

function ThesisField({
  label,
  placeholder,
  value,
  onChange,
  multiline = true,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
}) {
  return (
    <div className="kil-thesis-group">
      <div className="kil-thesis-label">{label}</div>
      {multiline ? (
        <textarea
          className="kil-thesis-textarea"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          type="text"
          className="kil-thesis-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function ThesisBlock({ thesis, onUpdate }: Props) {
  const [prob, setProb] = useState('');
  const [myThesis, setMyThesis] = useState('');
  const [wouldChange, setWouldChange] = useState('');
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialized = useRef(false);

  // Initialize from loaded thesis
  useEffect(() => {
    if (thesis && !isInitialized.current) {
      setProb(thesis.myProbability ?? '');
      setMyThesis(thesis.myThesis ?? '');
      setWouldChange(thesis.whatWouldChangeMyMind ?? '');
      isInitialized.current = true;
    }
  }, [thesis]);

  const scheduleSave = useCallback(
    (patch: Partial<ThesisData>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await onUpdate(patch);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }, SAVE_DELAY_MS);
    },
    [onUpdate]
  );

  const handleProbChange = (v: string) => {
    setProb(v);
    scheduleSave({ myProbability: v, myThesis, whatWouldChangeMyMind: wouldChange });
  };

  const handleThesisChange = (v: string) => {
    setMyThesis(v);
    scheduleSave({ myProbability: prob, myThesis: v, whatWouldChangeMyMind: wouldChange });
  };

  const handleChangeChange = (v: string) => {
    setWouldChange(v);
    scheduleSave({ myProbability: prob, myThesis, whatWouldChangeMyMind: v });
  };

  return (
    <div>
      <div className="kil-thesis-helper">
        Record your thesis before trading. This helps track your reasoning over time.
      </div>
      <ThesisField
        label="My Probability"
        placeholder="e.g. 68%, or range 60-75%"
        value={prob}
        onChange={handleProbChange}
        multiline={false}
      />
      <ThesisField
        label="My Thesis"
        placeholder="Why do you believe what you believe about this market?"
        value={myThesis}
        onChange={handleThesisChange}
      />
      <ThesisField
        label="What Would Change My Mind"
        placeholder="What evidence or events would make you update significantly?"
        value={wouldChange}
        onChange={handleChangeChange}
      />
      <div className={`kil-save-indicator ${saved ? 'visible' : ''}`}>
        Saved
      </div>
    </div>
  );
}
