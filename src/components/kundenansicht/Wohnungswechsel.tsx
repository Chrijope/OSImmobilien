import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dez, eur0 } from "@/lib/objektKennzahlen";
import type { ObjektWohnung } from "@/lib/objekteStore";
import { cn } from "@/lib/utils";
import { wohnungName } from "./kundenTexte";
import { useKundenTexte, type KundenansichtTexte } from "./kundenansichtTexte";
import type { Sprache } from "@/lib/seitenSprache";

function eckdaten(w: ObjektWohnung, t: KundenansichtTexte, sprache: Sprache): string {
  return [
    w.groesse > 0 ? `${dez(w.groesse, 1, sprache)} m²` : "",
    w.zimmer > 0 ? t.wechsel.zimmerKurz(String(w.zimmer)) : "",
    w.vkGesamt > 0 ? eur0(w.vkGesamt + (w.stellplatzPreis || 0), sprache) : "",
  ].filter(Boolean).join(" · ");
}

/**
 * Wohnung wechseln: alle freien Wohnungen des Hauses, die aktuelle
 * hervorgehoben. Auf dem Handy ein Auswahlfeld. Ein Klick wechselt ohne
 * Neuladen, die Seite hält die Daten schon.
 */
export function Wohnungswechsel({ wohnungen, aktuellId, fuerDichId, onWahl }: {
  wohnungen: ObjektWohnung[];
  aktuellId: string;
  fuerDichId: string | null;
  onWahl: (wohnungId: string) => void;
}) {
  const { t, sprache } = useKundenTexte();
  if (wohnungen.length < 2) return null;
  const eck = (w: ObjektWohnung) => eckdaten(w, t, sprache);
  return (
    <nav aria-label={t.wechsel.nav} className="mb-4" data-testid="wohnungswechsel">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t.wechsel.verfuegbar(wohnungen.length)}
      </div>
      <div className="sm:hidden">
        <Select value={aktuellId} onValueChange={onWahl}>
          <SelectTrigger aria-label={t.wechsel.waehlen}><SelectValue /></SelectTrigger>
          <SelectContent>
            {wohnungen.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {wohnungName(w, sprache)}{fuerDichId === w.id ? t.wechsel.fuerDichKlammer : ""}{eck(w) ? `, ${eck(w)}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="hidden gap-2 overflow-x-auto pb-1 sm:flex">
        {wohnungen.map((w) => {
          const aktiv = w.id === aktuellId;
          return (
            <button key={w.id} type="button" aria-current={aktiv ? "page" : undefined} onClick={() => { if (!aktiv) onWahl(w.id); }}
              className={cn(
                "shrink-0 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                aktiv ? "border-primary bg-accent text-foreground" : "border-border/60 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}>
              <span className="block font-semibold text-foreground">{wohnungName(w, sprache)}{fuerDichId === w.id ? t.wechsel.fuerDichKurz : ""}</span>
              <span className="block text-xs tabular-nums">{eck(w)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
