/**
 * Das Vollbild zwischen der letzten Frage und dem Ergebnis.
 *
 * Gerechnet ist in einer Millisekunde. Diese dreieinhalb Sekunden sind reine
 * Inszenierung, und sie wirken: Aus einer Multiplikation wird ein Gutachten.
 * Die fuenf Punkte benennen dabei genau die Schritte, die der Rechenkern
 * tatsaechlich geht, es wird also nichts behauptet, was nicht passiert.
 *
 * Zur Gestaltung, das war eine ausdrueckliche Beanstandung: Der Grund deckt
 * VOLLSTAENDIG (`bg-background`, kein Alphawert, kein Weichzeichner). Vorher
 * schien die Fragenseite durch, der Text schwamm darueber und das Fenster wirkte
 * wie eine Stoerung statt wie ein eigener Moment. Die Punkte erscheinen jetzt
 * einzeln und von unten eingeblendet, und oben laeuft ein Fortschrittsbalken
 * mit, damit die Wartezeit ein sichtbares Ende hat.
 *
 * Wer reduzierte Bewegung eingestellt hat, ueberspringt das Ganze: Der
 * Aufrufer bekommt sofort sein `onFertig`.
 */
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { moechteWenigBewegung } from "@/components/steuerrechner/bausteine";

/** Abstand zwischen zwei Haken. Fuenf Punkte ergeben rund 3,5 Sekunden. */
export const SCHRITT_MS = 650;

export const RECHENSCHRITTE = [
  "Dein zu versteuerndes Einkommen wird ermittelt",
  "Einkommensteuer, Soli und Kirchensteuer werden berechnet",
  "Die passende Objektklasse wird ausgewählt",
  "Abschreibung, Zinsen und Miete werden angesetzt",
  "Deine Auswertung wird zusammengestellt",
];

export default function BerechnungOverlay({ onFertig }: { onFertig: () => void }) {
  const [erledigt, setErledigt] = useState(0);

  useEffect(() => {
    if (moechteWenigBewegung()) {
      onFertig();
      return;
    }
    let abgebrochen = false;
    const zeiger: number[] = [];
    RECHENSCHRITTE.forEach((_, i) => {
      zeiger.push(
        window.setTimeout(() => {
          if (!abgebrochen) setErledigt(i + 1);
        }, SCHRITT_MS * (i + 1)),
      );
    });
    zeiger.push(
      window.setTimeout(
        () => {
          if (!abgebrochen) onFertig();
        },
        SCHRITT_MS * (RECHENSCHRITTE.length + 0.5),
      ),
    );
    return () => {
      abgebrochen = true;
      zeiger.forEach((z) => window.clearTimeout(z));
    };
  }, [onFertig]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background px-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-md">
        <div className="text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Einen Moment
          </span>
          <h2 className="mt-3 text-xl font-semibold leading-snug text-foreground md:text-2xl">
            Dein Steuervorteil wird berechnet
          </h2>
        </div>

        {/*
          Der Balken gibt der Wartezeit ein sichtbares Ende.

          Er ist in Abschnitte geteilt, genau wie der Fortschritt der Fragen, und
          zwar in fuenf, einen je Rechenschritt. Damit ist das Wartefenster kein
          fremdes Fenster mehr, sondern erkennbar dieselbe Strecke: Vorher hat
          man sieben Fragen abgearbeitet, jetzt arbeitet die Seite fuenf Schritte
          ab. Ein durchgehender Balken haette dasselbe Ende, aber nicht dieselbe
          Sprache.
        */}
        <div className="mt-6 flex gap-1">
          {RECHENSCHRITTE.map((text, i) => (
            <div key={text} className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  i < erledigt ? "w-full bg-primary" : i === erledigt ? "w-full bg-primary/45" : "w-0 bg-primary"
                }`}
              />
            </div>
          ))}
        </div>

        <ul className="mt-8 space-y-4">
          {RECHENSCHRITTE.map((text, i) => {
            const fertig = i < erledigt;
            const laeuft = i === erledigt;
            // Erst sichtbar, wenn der Punkt an der Reihe ist. So entsteht die
            // Bewegung, statt dass alle fuenf Zeilen von Anfang an blass
            // herumstehen.
            if (!fertig && !laeuft) return null;
            return (
              <li
                key={text}
                className="flex animate-in items-start gap-3 text-sm fade-in slide-in-from-bottom-2 duration-500"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {fertig ? (
                    <Check
                      className="h-4 w-4 animate-in text-primary zoom-in-50 duration-300"
                      aria-hidden="true"
                    />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                </span>
                <span className={fertig ? "text-foreground" : "text-muted-foreground"}>{text}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
