import { useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Hinweis, ReiterZweck } from "@/components/objektseite/Bausteine";
import { InvestmentrechnerInhalt, type InvestmentrechnerInhaltProps } from "@/components/investmentrechner/InvestmentrechnerInhalt";
import { cn } from "@/lib/utils";
import {
  vorbelegungAusEinheit,
  type VorbelegungLuecke,
  type Vorbelegungsquelle,
} from "@/lib/investmentrechner/objektVorbelegung";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Reiter „Investmentrechner" der Einheitenseite.
 *
 * Oben steht, was aus der Objektanlage übernommen wurde und was noch fehlt,
 * darunter läuft derselbe Rechner wie unter `/investmentrechner` in der
 * Seitenleiste. Es gibt keinen zweiten Rechenweg: Die Komponente belegt nur
 * die Startwerte, gerechnet wird in `rechenkern.ts`.
 *
 * Was hier eingetippt wird, bleibt im Arbeitsspeicher dieses Reiters. Es
 * wandert nicht zurück in das Objekt, damit eine Probrechnung die gepflegten
 * Daten nicht stillschweigend überschreibt.
 *
 * Die Aufstellung oben ist seit dem 23.09.2026 zugeklappt: Wer den Reiter
 * öffnet, will rechnen, und die Liste schob den Rechner eine Bildschirmhöhe
 * nach unten. Überschrift und Zähler bleiben sichtbar, ein Klick klappt auf.
 */

/** Wofür dieser Reiter da ist, ein Satz für das Info-Symbol an der Reiter-Beschriftung. */
export const INVESTMENTKALKULATION_ERKLAERUNG =
  "Genaue Berechnung für einen bestimmten Kunden, mit den Daten aus Kundenprofil und Selbstauskunft. Ergibt die Berechnungs-PDF.";

const KARTE = "rounded-2xl border border-border/60 bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5";

/** Überschrift je Herkunft einer Lücke, damit klar ist, wer sie schließt. */
const LUECKEN_GRUPPEN: Array<{ quelle: Vorbelegungsquelle; titel: string }> = [
  { quelle: "einheit", titel: "An der Einheit nachtragen" },
  { quelle: "objekt", titel: "Am Objekt nachtragen" },
  { quelle: "kunde", titel: "Kommt vom Kunden, im Rechner eintragen" },
];

function Lueckengruppe({ titel, eintraege }: { titel: string; eintraege: VorbelegungLuecke[] }) {
  if (eintraege.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{titel}</div>
      <ul className="space-y-1 text-sm">
        {eintraege.map((l) => (
          <li key={`${titel}-${l.feld}`} className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--warning))]" />
            <span>
              <b>{l.feld}</b> <span className="text-muted-foreground">für {l.wofuer}. {l.wo}.</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface EinheitInvestmentrechnerProps {
  objekt: ObjektData;
  wohnung: ObjektWohnung;
  /** Nur für Tests: fester Stichtag. */
  heute?: Date;
  /** Stand des Rechners nach oben, für den MORE Lotsen. */
  onErgebnis?: InvestmentrechnerInhaltProps["onErgebnis"];
  /** Ist der Reiter gerade zu sehen? Siehe `InvestmentrechnerInhaltProps.sichtbar`. */
  sichtbar?: boolean;
}

export function EinheitInvestmentrechner({ objekt, wohnung, heute, onErgebnis, sichtbar }: EinheitInvestmentrechnerProps) {
  const vorbelegung = useMemo(
    () => vorbelegungAusEinheit(objekt, wohnung, heute ?? new Date()),
    [objekt, wohnung, heute],
  );
  /*
   * Woher die übernommenen Werte kommen. Die Liste oben nennt es einmal, unter
   * jedem Feld im Rechner steht es danach weiter, bis jemand den Wert ändert.
   */
  const herkunft = useMemo(
    () => vorbelegung.herkunft,
    [vorbelegung.eingabe, objekt.titel, wohnung.weNr],
  );

  const [angabenOffen, setAngabenOffen] = useState(false);

  return (
    <div className="space-y-4">
      <ReiterZweck>
        Genaue Berechnung für einen bestimmten Kunden, mit den Daten aus Kundenprofil und Selbstauskunft. Ergibt die
        Berechnungs-PDF. Für eine schnelle Musterrechnung ohne Kunden reicht der Reiter „Finanzen“.
      </ReiterZweck>

      <Collapsible open={angabenOffen} onOpenChange={setAngabenOffen} className={KARTE} data-testid="vorbelegung-uebersicht">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 text-left text-base font-semibold tracking-tight text-foreground"
              data-testid="vorbelegung-umschalter"
            >
              Angaben aus der Objektanlage
              <ChevronDown
                aria-hidden="true"
                className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", angabenOffen && "rotate-180")}
              />
            </button>
          </CollapsibleTrigger>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">
              {vorbelegung.uebernommen.length} übernommen
            </Badge>
            <Badge variant="outline" className={vorbelegung.luecken.length > 0 ? "text-destructive" : "text-muted-foreground"}>
              {vorbelegung.luecken.length} offen
            </Badge>
          </div>
        </div>

        <CollapsibleContent className="mt-3">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Übernommen</div>
              {vorbelegung.uebernommen.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aus dieser Einheit ließ sich noch nichts übernehmen. Der Rechner startet leer.
                </p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {vorbelegung.uebernommen.map((u) => (
                    <li key={u.feld} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" />
                      <span>
                        <b>{u.feld}</b> {u.wert} <span className="text-muted-foreground">({u.woher})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              {vorbelegung.luecken.length === 0 ? (
                <p className="text-sm text-muted-foreground">Es fehlt nichts.</p>
              ) : (
                LUECKEN_GRUPPEN.map((gruppe) => (
                  <Lueckengruppe
                    key={gruppe.quelle}
                    titel={gruppe.titel}
                    eintraege={vorbelegung.luecken.filter((l) => l.quelle === gruppe.quelle)}
                  />
                ))
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <SlidersHorizontal className="h-3 w-3" /> Vorgaben des Rechners, nicht aus dem Objekt
            </div>
            <p className="text-sm text-muted-foreground">
              {vorbelegung.annahmen.map((a) => `${a.feld} ${a.wert}`).join(" · ")}
            </p>
          </div>

          <Hinweis>
            Fehlende Objektwerte werden zusätzlich aus den hinterlegten Unterlagen ergänzt. Die Liste oben zeigt den Stand der gepflegten Angaben. Was hier eingetippt wird,
            bleibt in diesem Reiter und ändert die Objektdaten nicht. Zum Nachtragen die Knöpfe oben auf der Seite nutzen.
          </Hinweis>
        </CollapsibleContent>
      </Collapsible>

      {/* Ein Wechsel der Einheit setzt den Rechner neu auf, sonst bliebe die alte Rechnung stehen. */}
      <InvestmentrechnerInhalt key={wohnung.id} vorbelegung={{ ...vorbelegung, herkunft }} mitUeberschrift={false} onErgebnis={onErgebnis} sichtbar={sichtbar} />
    </div>
  );
}
