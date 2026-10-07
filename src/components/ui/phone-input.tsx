import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COUNTRY_CODES, DEFAULT_COUNTRY, splitTelefon } from "@/lib/phoneUtils";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value: string;
  onChange: (fullNumber: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
  /** Pflichtfeld: reicht das `required` an das Nummernfeld durch. */
  required?: boolean;
}

/**
 * Telefoneingabe mit Ländervorwahl-Auswahl.
 * Der Wert nach außen ist immer das vollständige E.164-ähnliche Format (z. B. "+49 151 1234567").
 */
export function PhoneInput({ value, onChange, className, placeholder, id, required}: PhoneInputProps) {
  const split = useMemo(() => splitTelefon(value), [value]);

  const handleCountry = (code: string) => {
    const next = COUNTRY_CODES.find(c => c.code === code) || DEFAULT_COUNTRY;
    const rest = split.rest.replace(/^0+/, "");
    onChange(`${next.code}${rest ? " " + rest : ""}`);
  };

  const handleNumber = (raw: string) => {
    // Erlaubte Zeichen: Ziffern, Leerzeichen, Bindestrich, Klammern, Schrägstrich
    const cleaned = raw.replace(/[^0-9 \-/()]/g, "").replace(/^0+/, "");
    onChange(`${split.country.code}${cleaned ? " " + cleaned : ""}`);
  };

  return (
    <div className={cn("flex gap-1", className)}>
      <Select value={split.country.code} onValueChange={handleCountry}>
        <SelectTrigger className="w-[110px] shrink-0">
          <SelectValue>
            <span className="inline-flex items-center gap-1">
              <span>{split.country.flag}</span>
              <span className="text-xs">{split.country.code}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {COUNTRY_CODES.map(c => (
            <SelectItem key={c.iso} value={c.code}>
              <span className="inline-flex items-center gap-2">
                <span>{c.flag}</span>
                <span>{c.label}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={split.rest}
        onChange={e => handleNumber(e.target.value)}
        placeholder={placeholder || "151 1234567"}
        className="flex-1"
        required={required}
      />
    </div>
  );
}
