/**
 * Die Fortschrittsleiste in der Kopfkarte des Reiters Erstgespräch: zwei
 * Reihen, Teil 1 mit zehn Punkten, Teil 2 mit den 16 Abschnitten (bei
 * ausgeschaltetem Schalter nur eine Hinweiszeile). Grün mit Haken ist
 * erledigt, blau der aktuelle Schritt, blauer Rand angefangen, Punkt 10 bei
 * aktivem Teil 2 durchgestrichen. Ein Klick springt, nichts ist gesperrt.
 */
import { Check, ChevronRight } from "lucide-react";
import {
  TEIL_1_ANZAHL, TEIL_2_ANZAHL, punktId,
  type ErstgespraechSchritt, type SchrittZustand,
} from "@/lib/erstgespraechSchritte";

const CHIP: Record<SchrittZustand, string> = {
  erledigt: "bg-green-50 text-green-800 dark:bg-green-500/10 dark:text-green-300",
  aktuell: "bg-primary/10 text-primary font-semibold ring-2 ring-primary/40",
  angefangen: "bg-muted text-muted-foreground",
  offen: "bg-muted text-muted-foreground",
  entfaellt: "bg-muted text-muted-foreground opacity-50 line-through cursor-default",
};

const KREIS: Record<SchrittZustand, string> = {
  erledigt: "bg-green-600 border-green-600 text-white",
  aktuell: "bg-primary border-primary text-white",
  angefangen: "bg-background border-primary text-primary",
  offen: "bg-background border-border text-muted-foreground",
  entfaellt: "bg-background border-border text-muted-foreground",
};

function Chip({
  schritt, zustand, klein, onClick,
}: {
  schritt: ErstgespraechSchritt;
  zustand: SchrittZustand;
  /** Teil-2-Reihe: 16 Chips nebeneinander, Nummer über dem Text */
  klein?: boolean;
  onClick?: () => void;
}) {
  const kreis = (
    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold sm:h-4 sm:w-4 sm:text-[9px] ${KREIS[zustand]}`}>
      {zustand === "erledigt" ? <Check className="h-3.5 w-3.5 sm:h-2.5 sm:w-2.5" strokeWidth={3} /> : schritt.nummer}
    </span>
  );
  const titel = schritt.art === "punkt"
    ? `Punkt ${schritt.nummer} · ${schritt.titel}`
    : `Abschnitt ${schritt.nummer} · ${schritt.titel}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={zustand === "entfaellt"}
      title={zustand === "entfaellt" ? "Entfällt, Teil 2 läuft" : titel}
      aria-current={zustand === "aktuell" ? "step" : undefined}
      data-testid={`leiste-${schritt.id}`}
      data-zustand={zustand}
      /*
        Auf dem Handy nur der nummerierte Kreis, umbrechend.
        ───────────────────────────────────────────────────
        Nebeneinander brauchten die 16 Abschnitte von Teil 2 gut 440px, die
        Karte hat auf einem iPhone rund 300. Die Reihe schob sich aus dem
        Kasten heraus und der Text war ohnehin auf null gekürzt. Deshalb fällt
        auf dem Handy die Beschriftung weg, der Kreis wird dafür groß genug
        zum Antippen, und die Reihe darf umbrechen. Was der Schritt heißt,
        steht weiter im Zeigetext und in der Überschrift des Schritts selbst.
      */
      className={`flex flex-none items-center justify-center gap-1.5 rounded-md p-0 text-[11px] leading-tight transition sm:min-w-0 sm:flex-1 sm:justify-start ${
        klein ? "sm:flex-col sm:justify-center sm:px-1 sm:py-1 sm:text-center" : "sm:px-2 sm:py-1.5"
      } ${CHIP[zustand]} ${zustand !== "entfaellt" && zustand !== "aktuell" ? "hover:bg-primary/5" : ""}`}
    >
      {kreis}
      <span className="hidden min-w-0 truncate sm:inline">{schritt.kurz}</span>
    </button>
  );
}

export function ErstgespraechLeiste({
  punkte, abschnitte, teil2An, zustandVon, onSpringe, teil1Erledigt, teil2Erledigt,
}: {
  /** Die zehn Punkte von Teil 1, unabhängig vom Schalter */
  punkte: ErstgespraechSchritt[];
  /** Die 16 Abschnitte von Teil 2 (leer bei Schalter aus) */
  abschnitte: ErstgespraechSchritt[];
  teil2An: boolean;
  zustandVon: (s: ErstgespraechSchritt) => SchrittZustand;
  onSpringe: (id: string) => void;
  teil1Erledigt: number;
  teil2Erledigt: number;
}) {
  const teil1Fertig = teil2An && teil1Erledigt >= TEIL_1_ANZAHL - 1;
  return (
    <div className="border-t pt-3 space-y-2" data-testid="erstgespraech-leiste">
      {/* Auf dem Handy stehen Beschriftung und Chipreihe untereinander, sonst
          bliebe von 343px nach der 96px breiten Spalte zu wenig uebrig. */}
      <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="w-full shrink-0 sm:w-24 md:w-28">
          <div className="text-[10px] font-semibold uppercase tracking-wider">Teil 1</div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            {teil1Fertig ? "erledigt, Punkt 10 entfällt" : `${TEIL_1_ANZAHL} Punkte · Vorqualifizierung`}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:min-w-0 sm:flex-1 sm:flex-nowrap sm:gap-1">
          {punkte.map((p) => {
            const entfaellt = teil2An && p.id === punktId(10);
            return (
              <Chip
                key={p.id}
                schritt={p}
                zustand={entfaellt ? "entfaellt" : zustandVon(p)}
                onClick={() => onSpringe(p.id)}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="w-full shrink-0 sm:w-24 md:w-28">
          <div className="text-[10px] font-semibold uppercase tracking-wider">Teil 2</div>
          <div className="text-[10px] text-muted-foreground leading-tight">
            {teil2An
              ? teil2Erledigt >= TEIL_2_ANZAHL
                ? `erledigt, ${TEIL_2_ANZAHL} von ${TEIL_2_ANZAHL}`
                : `${TEIL_2_ANZAHL} Abschnitte · Folie für Folie`
              : "Closing direkt"}
          </div>
        </div>
        {teil2An ? (
          <div className="flex flex-wrap gap-1.5 sm:min-w-0 sm:flex-1 sm:flex-nowrap sm:gap-1">
            {abschnitte.map((a) => (
              <Chip key={a.id} schritt={a} zustand={zustandVon(a)} klein onClick={() => onSpringe(a.id)} />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onSpringe(punktId(9))}
            data-testid="leiste-teil2-aus"
            className="flex w-full items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-muted/50 sm:min-w-0 sm:flex-1"
          >
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Schalter aus. Wird in Punkt 9 eingeschaltet, wenn der Bewerber Zeit hat und warm ist.
              Dann laufen hier {TEIL_2_ANZAHL} Abschnitte weiter und Punkt 10 entfällt.
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" /> erledigt</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full bg-primary" /> aktueller Schritt</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-primary bg-background" /> angefangen, Felder offen</span>
        <span className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-full border border-border bg-background" /> offen</span>
        <span className="ml-auto">Klick auf einen Schritt springt dorthin. Nichts wird übersprungen oder gesperrt.</span>
      </div>
    </div>
  );
}
