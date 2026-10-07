import { EyeOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVorfuehrmodus } from "@/hooks/useVorfuehrmodus";
import { setzeVorfuehrmodus } from "@/lib/vorfuehrmodus";

/**
 * Der unuebersehbare Hinweis, solange der Vorfuehrmodus laeuft: ein Streifen
 * unter der Kopfzeile und ein Rahmen um das ganze Fenster.
 *
 * Der Grund fuer diesen Aufwand: Der schlimmste Fehler waere, dass Christian
 * am naechsten Tag mit verschwommenen Zahlen und fremden Kuerzeln arbeitet
 * und den Grund nicht findet. Der Modus ueberlebt ein Neuladen, also muss er
 * sich auf jeder Seite von selbst erklaeren.
 */
export function VorfuehrmodusBanner() {
  const aktiv = useVorfuehrmodus();
  if (!aktiv) return null;

  return (
    <>
      {/* Rahmen ums ganze Fenster. Faengt keine Klicks ab. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[70] border-[3px] border-amber-500"
      />

      <div className="border-b border-amber-500/50 bg-amber-500/15">
        <div className="flex items-center gap-3 px-4 py-2 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white">
              <EyeOff className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              Vorführmodus
            </span>
          </div>

          <p className="flex-1 min-w-[240px] text-xs text-foreground/80">
            Namen und Kontaktdaten sind durch Kürzel ersetzt. Beträge sind nur
            weichgezeichnet, der Wert steht weiter im Dokument und lässt sich
            über die Entwicklerwerkzeuge auslesen.
          </p>

          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 shrink-0 border-amber-500/60"
            onClick={() => setzeVorfuehrmodus(false)}
          >
            <X className="h-3.5 w-3.5" />
            Beenden
          </Button>
        </div>
      </div>
    </>
  );
}
