import type { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { InfoSymbol } from "@/components/objektseite/Bausteine";
import type { ExposeAnnahmen } from "@/lib/exposeAnnahmen";
import { cn } from "@/lib/utils";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { exposeRechnerTexte } from "@/lib/exposeRechnerTexte";

/**
 * Bausteine des Rechners, die der Reiter „Finanzen“ der Einheitenseite
 * (`EinheitFinanzen.tsx`) nutzt. Der Abschnitt Wirtschaftlichkeit im Exposé
 * ist seit dem 16.10.2026 entfernt (Wunsch des Inhabers); geblieben sind nur
 * diese Bausteine und die Herkunftskarte der Annahmen.
 */

export type AnnahmenHerkunftKarte = Partial<Record<keyof ExposeAnnahmen, "selbstauskunft" | "objekt">>;

export function HerkunftChip({ art }: { art?: "selbstauskunft" | "objekt" }) {
  const t = exposeRechnerTexte(useAnzeigeSprache());
  if (!art) return null;
  return (
    <Badge variant="outline" className="ml-1.5 border-primary/30 bg-accent px-1.5 py-0 text-[10px] font-semibold text-primary" data-testid="herkunft-chip">
      {art === "selbstauskunft" ? t.herkunftSelbstauskunft : t.herkunftObjekt}
    </Badge>
  );
}

/** Regler mit Beschriftung, Wertanzeige und Grenztexten. Die Einheiten-Seite nutzt ihn im Reiter Finanzen. */
export function Regler({ label, wert, anzeige, min, max, schritt, onChange, herkunft, disabled, minText, maxText, testId }: {
  label: string; wert: number; anzeige: string; min: number; max: number; schritt: number;
  onChange: (v: number) => void; herkunft?: "selbstauskunft" | "objekt"; disabled?: boolean;
  minText: string; maxText: string; testId: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm font-semibold">
        <span className="flex flex-wrap items-center">{label}<HerkunftChip art={herkunft} /></span>
        <span className="whitespace-nowrap tabular-nums" data-testid={`${testId}-wert`}>{anzeige}</span>
      </div>
      <Slider
        className="mt-2"
        aria-label={label}
        data-testid={testId}
        min={min} max={max} step={schritt}
        value={[Math.min(max, Math.max(min, wert))]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground"><span>{minText}</span><span>{maxText}</span></div>
    </div>
  );
}

/** Eine Zeile Beschriftung links, Wert rechts. `wertKlasse` färbt den Wert, etwa grün für Einnahmen. */
export function Zeile({ label, wert, fett, info, testId, wertKlasse }: { label: ReactNode; wert: string; fett?: boolean; info?: string; testId?: string; wertKlasse?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-sm", fett && "font-semibold")}>
      <span className={cn("flex items-center gap-1", !fett && "text-muted-foreground")}>{label}{info && <InfoSymbol text={info} />}</span>
      <span className={cn("whitespace-nowrap tabular-nums", wertKlasse)} data-testid={testId}>{wert}</span>
    </div>
  );
}
