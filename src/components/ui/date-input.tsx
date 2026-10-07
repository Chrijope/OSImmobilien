import * as React from "react";
import { format, parse, isValid, setMonth, setYear, getMonth, getYear } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface DateInputProps {
  id?: string;
  ariaLabel?: string;
  /** Value as ISO string (YYYY-MM-DD) or empty string */
  value?: string;
  /** Called with ISO string (YYYY-MM-DD) or empty string */
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Minimum selectable date (ISO string YYYY-MM-DD). Dates before this are disabled. */
  minDate?: string;
}

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/**
 * Date input with manual typing (TT.MM.JJJJ) + calendar popover with fast year/month navigation.
 */
export function DateInput({
  id, ariaLabel,
  value,
  onChange,
  placeholder = "TT.MM.JJJJ",
  disabled = false,
  className,
  minDate,
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const [textValue, setTextValue] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);

  const dateObj = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  const minDateObj = React.useMemo(() => {
    if (!minDate) return undefined;
    const d = parse(minDate, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [minDate]);

  // Sync textValue when value changes externally
  React.useEffect(() => {
    if (!isTyping) {
      setTextValue(dateObj ? format(dateObj, "dd.MM.yyyy") : "");
    }
  }, [dateObj, isTyping]);

  const [calMonth, setCalMonth] = React.useState<Date>(dateObj || new Date());

  React.useEffect(() => {
    if (dateObj) setCalMonth(dateObj);
  }, [dateObj]);

  const handleSelect = (day: Date | undefined) => {
    if (day) {
      onChange?.(format(day, "yyyy-MM-dd"));
    } else {
      onChange?.("");
    }
    setOpen(false);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value;
    // Auto-insert dots: 12 -> 12. , 12.03 -> 12.03.
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 2 && !v.includes(".")) {
      v = digits.slice(0, 2) + "." + digits.slice(2);
    }
    if (digits.length >= 4 && v.split(".").length < 3) {
      const parts = v.split(".");
      if (parts.length === 2 && parts[1].length >= 2) {
        v = parts[0] + "." + parts[1].slice(0, 2) + "." + parts[1].slice(2);
      }
    }
    setTextValue(v);
    setIsTyping(true);

    // Parse complete date
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) {
      const parsed = parse(v, "dd.MM.yyyy", new Date());
      if (isValid(parsed)) {
        if (minDateObj && parsed < minDateObj) return; // block past dates
        onChange?.(format(parsed, "yyyy-MM-dd"));
      }
    }
  };

  const handleTextBlur = () => {
    setIsTyping(false);
    if (!textValue.trim()) {
      onChange?.("");
      return;
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(textValue)) {
      const parsed = parse(textValue, "dd.MM.yyyy", new Date());
      // Dasselbe Mindestdatum wie beim Tippen und im Kalender. Ohne diese
      // Pruefung liess sich ein zu frueher Tag ueber das Verlassen des Feldes
      // doch noch eintragen, obwohl der Kalender ihn sperrt.
      if (isValid(parsed) && !(minDateObj && parsed < minDateObj)) {
        onChange?.(format(parsed, "yyyy-MM-dd"));
        return;
      }
    }
    // Revert to current value
    setTextValue(dateObj ? format(dateObj, "dd.MM.yyyy") : "");
  };

  // Year range for dropdown
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 120 }, (_, i) => currentYear + 10 - i);

  const handleMonthChange = (monthStr: string) => {
    const newDate = setMonth(calMonth, parseInt(monthStr));
    setCalMonth(newDate);
  };

  const handleYearChange = (yearStr: string) => {
    const newDate = setYear(calMonth, parseInt(yearStr));
    setCalMonth(newDate);
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Input
        id={id} aria-label={ariaLabel}
        value={textValue}
        onChange={handleTextChange}
        onBlur={handleTextBlur}
        onFocus={() => setIsTyping(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="h-8 text-sm w-[120px]"
        maxLength={10}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            size="icon" aria-label="Datum wählen"
            className="h-8 w-8 shrink-0"
          >
            <CalendarIcon className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          {/* Month/Year quick selectors */}
          <div className="flex items-center gap-1 px-3 pt-3 pb-1">
            <Select value={String(getMonth(calMonth))} onValueChange={handleMonthChange}>
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS_DE.map((m, i) => (
                  <SelectItem key={i} value={String(i)} className="text-xs">{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(getYear(calMonth))} onValueChange={handleYearChange}>
              <SelectTrigger className="h-7 text-xs w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {years.map(y => (
                  <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Calendar
            mode="single"
            selected={dateObj}
            onSelect={handleSelect}
            month={calMonth}
            onMonthChange={setCalMonth}
            locale={de}
            initialFocus
            disabled={minDateObj ? { before: minDateObj } : undefined}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
