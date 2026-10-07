import { useState } from "react";
import { format, parse, isValid } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function formatGeburtsdatum(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "." + digits.slice(2);
  return digits.slice(0, 2) + "." + digits.slice(2, 4) + "." + digits.slice(4, 8);
}

function parseDateString(dateStr: string): Date | undefined {
  if (!dateStr) return undefined;
  const parsed = parse(dateStr, "dd.MM.yyyy", new Date());
  return isValid(parsed) ? parsed : undefined;
}

interface DatePickerFieldProps {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
  placeholder?: string;
  fromYear?: number;
  toYear?: number;
  className?: string;
}

export function DatePickerField({
  value,
  onChange,
  error,
  placeholder = "TT.MM.JJJJ",
  fromYear = 1930,
  toYear = new Date().getFullYear(),
  className,
}: DatePickerFieldProps) {
  const date = parseDateString(value);
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative", className)}>
      <Input
        value={value}
        onChange={e => onChange(formatGeburtsdatum(e.target.value))}
        placeholder={placeholder}
        maxLength={10}
        className={cn("pr-9", error && "border-destructive")}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Kalender öffnen"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted text-muted-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={date}
            onSelect={d => {
              if (d) onChange(format(d, "dd.MM.yyyy"));
              setOpen(false);
            }}
            defaultMonth={date || new Date(1990, 0)}
            captionLayout="dropdown-buttons"
            fromYear={fromYear}
            toYear={toYear}
            locale={de}
            disabled={(d) => d > new Date()}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
