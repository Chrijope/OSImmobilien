import { useState, useEffect, useRef } from 'react';
import { useSeitenSprache } from '@/components/SeitenSprache';
import { SPRACH_LOCALE } from '@/lib/sprachFormat';
import type { Sprache } from '@/lib/seitenSprache';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

function formatWithThousands(num: number, sprache: Sprache = 'de'): string {
  if (!num && num !== 0) return '';
  if (num === 0) return '';
  return new Intl.NumberFormat(SPRACH_LOCALE[sprache], { maximumFractionDigits: 2 }).format(num);
}

/**
 * Liest die Eingabe in der Schreibweise der Seite. Auf Englisch ist das Komma
 * der Tausenderpunkt: „4,500“ muss 4500 ergeben und nicht 4,5, sonst rechnet
 * die Analyse mit einem Tausendstel des Einkommens.
 */
function parseZahl(val: string, sprache: Sprache = 'de'): number {
  const cleaned = sprache === 'en'
    ? val.replace(/,/g, '')
    : val.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

const NumberInput = ({ label, value, onChange, suffix = '€', min = 0, max, step = 1, placeholder }: NumberInputProps) => {
  const sprache = useSeitenSprache();
  const [display, setDisplay] = useState(() => value ? formatWithThousands(value, sprache) : '');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync display from parent only when not focused
  useEffect(() => {
    if (!focused) {
      setDisplay(value ? formatWithThousands(value, sprache) : '');
    }
  }, [value, focused, sprache]);

  return (
    <div>
      <label className="text-sm text-muted-foreground mb-2 block">{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          value={display}
          onFocus={() => {
            setFocused(true);
          }}
          onBlur={() => {
            setFocused(false);
            const parsed = parseZahl(display, sprache);
            onChange(parsed);
            setDisplay(parsed ? formatWithThousands(parsed, sprache) : '');
          }}
          onChange={e => {
            const raw = e.target.value;
            if (/^[\d.,\-]*$/.test(raw)) {
              setDisplay(raw);
            }
          }}
          placeholder={placeholder || '0'}
          className="w-full bg-card border border-border rounded-xl px-4 py-3 text-base md:text-sm text-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-ring transition-colors pr-14"
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">{suffix}</span>
        )}
      </div>
    </div>
  );
};

export default NumberInput;
