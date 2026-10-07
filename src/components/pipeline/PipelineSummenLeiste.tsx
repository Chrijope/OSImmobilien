import { cn } from "@/lib/utils";
import { unscharfKlasse } from "@/lib/vorfuehrmodus";

/**
 * Die Leiste unter den Spalten der Kunden-Pipeline: ab der Objektauswahl je
 * Spalte eine Kachel mit der Gesamtsumme der Kaufpreise.
 *
 * Christian, 25.09.2026 (zweite Runde): Die Anzahl steht wieder oben im
 * Spaltenkopf, rechtsbuendig als reine Zahl. Unten steht nur noch
 * „Gesamt: 1.008.900 €". Spalten ohne Summe (vor der Objektauswahl) bekommen
 * keine Kachel; an ihrer Stelle steht ein leerer Platzhalter in Spaltenbreite,
 * damit die uebrigen Kacheln genau unter ihrer Spalte bleiben.
 *
 * Gerechnet wird hier nichts. Die Seite liefert die Summe fertig an, damit
 * die Rechnung an einer Stelle bleibt (siehe `Pipeline.tsx`).
 *
 * Kachel und Platzhalter sind genau so breit wie ihre Spalte (`w-56`) und
 * haben denselben Abstand (`gap-4`). Die Leiste steht im selben waagerechten
 * Scrollbereich wie die Spalten, deshalb laeuft sie beim Scrollen mit.
 *
 * Kachel und Platzhalter sind fest gleich hoch, genau so hoch wie die
 * fruehere zweizeilige Zelle: `py-2` (1rem), Anzahlzeile (1rem), `mt-0.5`
 * (0.125rem), Summenzeile (1.25rem) und 2px Rahmen, also
 * `calc(3.375rem+2px)`. So bleibt die Leiste gegenueber vorher gleich hoch
 * und die Kartenlisten darueber verlieren keinen Pixel. Die Hoehe sitzt an
 * Kachel und Platzhalter und nicht an der Leiste, weil deren Innenabstand
 * und Trennlinie von der Seite kommen. Sonst waere die Leiste bei einer
 * Auswahl ganz ohne Summenspalte
 * (etwa Filter auf „Neuer Lead") flacher, und die Kartenlisten darueber
 * sprangen beim Filterwechsel. Bewusst bleibt dann ein leerer Streifen mit
 * der Trennlinie oben stehen: Die Unterkante und die Linie stehen immer an
 * derselben Stelle, beim Umschalten tauchen nur Kacheln auf oder ab.
 *
 * Die Kacheln sind Karten (`data-ui="card"` mit `bg-card`). Mit Liquid Glass
 * werden sie dadurch von `styles/design-liquid.css` zu Glasscheiben wie die
 * uebrigen Karten, ohne eigene Farben.
 */
export interface SummenSpalte {
  key: string;
  label: string;
  /** Summe der Kaufpreise. `null` heisst: Unter dieser Spalte steht keine Kachel. */
  summe: number | null;
  /** Spalte ist fuer diese Rolle ausgegraut (Versicherungsexperte). */
  gedimmt?: boolean;
}

function formatEuro(wert: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(wert);
}

export function PipelineSummenLeiste({ spalten, className }: { spalten: SummenSpalte[]; className?: string }) {
  return (
    <div
      data-pruefung="pipeline-summen"
      role="group"
      aria-label="Gesamtsummen je Spalte"
      className={cn("flex gap-4 flex-shrink-0", className)}
    >
      {spalten.map((s) =>
        s.summe === null ? (
          <div
            key={s.key}
            data-pruefung="pipeline-summe-leer"
            data-stufe={s.key}
            aria-hidden="true"
            className="w-56 h-[calc(3.375rem+2px)] flex-shrink-0"
          />
        ) : (
          <div
            key={s.key}
            data-pruefung="pipeline-summe"
            data-stufe={s.key}
            data-ui="card"
            aria-label={`${s.label}: Gesamt ${formatEuro(s.summe)}`}
            className={cn(
              "w-56 h-[calc(3.375rem+2px)] flex-shrink-0 flex items-center rounded-xl border bg-card px-3 shadow-sm",
              s.gedimmt && "blur-[3px] opacity-30",
            )}
          >
            <div className="truncate leading-5 tabular-nums">
              <span className="text-sm text-muted-foreground">Gesamt: </span>
              <span className={cn("text-base font-semibold text-foreground", unscharfKlasse())}>{formatEuro(s.summe)}</span>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
