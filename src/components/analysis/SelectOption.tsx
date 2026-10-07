interface SelectOptionProps {
  options: { value: string; label: string; description?: string }[];
  value: string;
  onChange: (value: string) => void;
}

const SelectOption = ({ options, value, onChange }: SelectOptionProps) => {
  return (
    <div className="grid gap-3">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-left p-4 rounded-xl border transition-all text-sm ${
            value === opt.value
              ? 'sand-border-strong bg-primary/15'
              : 'border-border hover:border-primary/40 bg-card/50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              value === opt.value ? 'border-primary' : 'border-muted-foreground/30'
            }`}>
              {value === opt.value && <div className="w-2.5 h-2.5 rounded-full sand-gradient" />}
            </div>
            <div>
              <div className="font-medium text-sm text-foreground">{opt.label}</div>
              {opt.description && <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SelectOption;
