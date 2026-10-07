/**
 * Der Moment zwischen der letzten Frage und dem Ergebnis.
 *
 * Gerechnet ist in einer Millisekunde. Die knapp drei Sekunden hier sind
 * Inszenierung, aber keine Behauptung: Die fuenf Punkte benennen genau die
 * Schritte, die `afaRechnung.ts` tatsaechlich geht.
 *
 * Wer reduzierte Bewegung eingestellt hat, ueberspringt das Ganze und bekommt
 * sofort sein `onFertig`. Das Vorbild ist `steuerrechner/BerechnungOverlay.tsx`.
 */
import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { moechteWenigBewegung } from "@/components/afarechner/bausteine";

/** Abstand zwischen zwei Haken. Fuenf Punkte ergeben rund drei Sekunden. */
export const SCHRITT_MS = 560;

export const RECHENSCHRITTE = [
  "Gebäudealter und Gesamtnutzungsdauer werden bestimmt",
  "Die Restnutzungsdauer nach Anlage 2 ImmoWertV wird berechnet",
  "Der gesetzliche Mindestsatz nach § 7 Abs. 4 EStG wird geprüft",
  "Kaufpreis und Nebenkosten werden auf Boden und Gebäude verteilt",
  "Die 15-Prozent-Grenze für den Erhaltungsaufwand wird geprüft",
];

export default function AfaBerechnungOverlay({ onFertig }: { onFertig: () => void }) {
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
      window.setTimeout(() => {
        if (!abgebrochen) onFertig();
      }, SCHRITT_MS * (RECHENSCHRITTE.length + 0.5)),
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
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Einen Moment</span>
          <h2 className="mt-3 text-xl font-semibold leading-snug text-foreground md:text-2xl">
            Die Abschreibung wird berechnet
          </h2>
        </div>

        {/* Der Balken gibt der Wartezeit ein sichtbares Ende, in denselben
            Abschnitten wie der Fortschritt der Fragen. */}
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
            // Erst sichtbar, wenn der Punkt an der Reihe ist.
            if (!fertig && !laeuft) return null;
            return (
              <li key={text} className="flex animate-in items-start gap-3 text-sm fade-in slide-in-from-bottom-2 duration-500">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {fertig ? (
                    <Check className="h-4 w-4 animate-in text-primary zoom-in-50 duration-300" aria-hidden="true" />
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
