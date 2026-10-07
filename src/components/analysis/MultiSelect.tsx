interface MultiSelectProps {
  options: { value: string; label: string }[];
  values: string[];
  onChange: (values: string[]) => void;
}

const MultiSelect = ({ options, values, onChange }: MultiSelectProps) => {
  const toggle = (val: string) => {
    onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
      {options.map((opt) => {
        const selected = values.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => toggle(opt.value)}
            className={`text-left p-3 rounded-xl border transition-all text-sm ${
              selected
                ? 'sand-border-strong bg-primary/15'
                : 'border-border hover:border-primary/40 bg-card/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded border flex items-center justify-center text-xs transition-colors ${
                selected ? 'sand-gradient border-transparent' : 'border-muted-foreground/30'
              }`}>
                {selected && <span className="text-foreground font-bold">✓</span>}
              </div>
              <span>{opt.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default MultiSelect;
