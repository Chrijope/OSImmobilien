import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ErklaerungsZeile, KalkulationErklaerung } from "@/lib/lotseKalkulationErklaerung";
import { cn } from "@/lib/utils";

function Zeile({ z, stark = false }: { z: ErklaerungsZeile; stark?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", stark && "border-t border-border/60 pt-1 font-semibold")}>
      <span>{z.text}</span>
      <span className="shrink-0 tabular-nums">{z.betrag}</span>
    </div>
  );
}

/** Die Rechnung des monatlichen Ergebnisses im ersten Jahr, darunter die Annahmen. */
export function KalkulationErklaerungInhalt({ e }: { e: KalkulationErklaerung }) {
  return (
    <div className="space-y-2 text-xs" data-testid="lotse-kalkulation-erklaerung">
      {(e.rechnung.length > 0 || e.cashflowVorSteuer) && (
        <div className="space-y-0.5">
          <p className="font-semibold">Monatlich im ersten Jahr</p>
          {e.rechnung.map((z) => <Zeile key={z.text} z={z} />)}
          {e.cashflowVorSteuer && <Zeile z={e.cashflowVorSteuer} stark />}
        </div>
      )}
      {e.nachSteuer.length > 0 && (
        <div className="space-y-0.5">
          <p className="font-semibold">Nach Steuer</p>
          {e.nachSteuer.map((z, i) => <Zeile key={z.text} z={z} stark={i === e.nachSteuer.length - 1} />)}
        </div>
      )}
      {e.eigenanteil && <Zeile z={e.eigenanteil} stark />}
      {e.annahmen.length > 0 && (
        <div className="space-y-0.5">
          <p className="font-semibold">Annahmen</p>
          {e.annahmen.map((a) => (
            <div key={a.text} className="flex items-baseline justify-between gap-3">
              <span>{a.text}</span>
              <span className="shrink-0 tabular-nums">{a.wert}</span>
            </div>
          ))}
        </div>
      )}
      {e.hinweise.map((h) => <p key={h} className="text-muted-foreground">{h}</p>)}
    </div>
  );
}

/** Quellen-Chip mit Info-Symbol, öffnet die Rechnung per Klick oder Tippen. */
export function KalkulationQuelleChip({ quelle, erklaerung }: { quelle: string; erklaerung: KalkulationErklaerung }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/10"
          aria-label={`${quelle}: so kommen die Zahlen zustande`}
        >
          {quelle}
          <Info className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-[min(20rem,calc(100vw-2rem))] p-3">
        <KalkulationErklaerungInhalt e={erklaerung} />
      </PopoverContent>
    </Popover>
  );
}
