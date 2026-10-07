import { useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { kontaktTypFilterWert, type KontaktTyp } from "@/lib/kontaktTypHelper";

interface Props {
  value: KontaktTyp | "-";
  onChange: (v: KontaktTyp | "-") => void;
  className?: string;
}

/** Wiederverwendbarer Filter Eigenkontakte / Leads der Gesellschaft / Alle für Kontakt-Listen. */
export function KontaktTypFilter({ value, onChange, className }: Props) {
  // Bis zum 29.09.2026 gab es den Typ "team". Ein so gespeicherter Filter
  // träfe nichts mehr und würde die Liste leeren, deshalb zurück auf "Alle".
  useEffect(() => {
    if (kontaktTypFilterWert(value) !== value) onChange("-");
  }, [value, onChange]);

  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <span className="text-sm text-muted-foreground">Typ:</span>
      <Select value={value} onValueChange={(v) => onChange(v as KontaktTyp | "-")}>
        <SelectTrigger className="w-44 h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="-">Alle Typen</SelectItem>
          <SelectItem value="eigen">Eigenkontakte</SelectItem>
          <SelectItem value="lead">Leads der Gesellschaft</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
