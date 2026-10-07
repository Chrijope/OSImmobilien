import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FormattedNumberInputProps {
  value: number;
  onChange?: (value: number) => void;
  label?: string;
  suffix?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  maxFractionDigits?: number;
  /** Wert schon beim Tippen melden, nicht erst beim Verlassen des Felds. */
  sofort?: boolean;
}

export const formatNumberDisplay = (value: number, maxFractionDigits = 2) => {
  if (value === 0) return "";

  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(value);
};

const toEditableValue = (value: number) => (value === 0 ? "" : String(value).replace(".", ","));

const parseLocalizedNumber = (value: string) => {
  const raw = value.replace(/[^\d.,-]/g, "").trim();

  if (!raw || raw === "-" || raw === "," || raw === ".") return 0;

  if (raw.includes(",") && raw.includes(".")) {
    return Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
  }

  if (raw.includes(",")) {
    return Number.parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
  }

  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 2 && parts[1].length <= 2) {
      return Number.parseFloat(raw) || 0;
    }

    return Number.parseFloat(raw.replace(/\./g, "")) || 0;
  }

  return Number.parseFloat(raw) || 0;
};

export function FormattedNumberInput({
  value,
  onChange,
  label,
  suffix = "€",
  className,
  inputClassName,
  disabled,
  placeholder = "0",
  readOnly = false,
  maxFractionDigits = 2,
  sofort = false,
}: FormattedNumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatNumberDisplay(value, maxFractionDigits));

  useEffect(() => {
    if (!focused) {
      setDisplayValue(formatNumberDisplay(value, maxFractionDigits));
    }
  }, [value, focused, maxFractionDigits]);

  const handleFocus = () => {
    if (readOnly) return;
    setFocused(true);
    setDisplayValue(toEditableValue(value));
  };

  const handleBlur = () => {
    if (readOnly) return;

    setFocused(false);
    const parsed = parseLocalizedNumber(displayValue);
    onChange?.(parsed);
    setDisplayValue(formatNumberDisplay(parsed, maxFractionDigits));
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = event.target.value;

    if (/^[\d.,-]*$/.test(nextValue)) {
      setDisplayValue(nextValue);
      if (sofort) onChange?.(parseLocalizedNumber(nextValue));
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label ? <Label className="text-sm font-medium">{label}</Label> : null}
      <div className="mt-1 flex items-center gap-2">
        <Input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={readOnly ? undefined : handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("text-right", readOnly && "bg-muted/50", inputClassName)}
        />
        {suffix ? <span className="text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
    </div>
  );
}
