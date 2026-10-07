import { useState, useCallback, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EuroInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  step?: string;
}

const formatDE = (v: number) =>
  v === 0 ? "" : new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

export function EuroInput({ value, onChange, className, disabled, placeholder = "0", step }: EuroInputProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState(String(value || ""));
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync external value changes when not focused
  useEffect(() => {
    if (!focused) setRaw(String(value || ""));
  }, [value, focused]);

  const handleFocus = useCallback(() => {
    setFocused(true);
    setRaw(value ? String(value) : "");
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const parsed = parseFloat(raw) || 0;
    onChange(parsed);
  }, [raw, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setRaw(v);
    const parsed = parseFloat(v) || 0;
    onChange(parsed);
  }, [onChange]);

  if (focused) {
    return (
      <div className="relative">
        <Input
          ref={inputRef}
          type="number"
          step={step}
          value={raw}
          onChange={handleChange}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("pr-7", className)}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
      </div>
    );
  }

  return (
    <div className="relative cursor-text" onClick={() => { setFocused(true); setTimeout(() => inputRef.current?.focus(), 0); }}>
      <Input
        ref={inputRef}
        type="text"
        value={value ? `${formatDE(value)}` : ""}
        readOnly
        onFocus={handleFocus}
        disabled={disabled}
        placeholder={placeholder}
        className={cn("pr-7", className)}
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
    </div>
  );
}
