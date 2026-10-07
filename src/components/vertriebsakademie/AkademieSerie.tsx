// Die Serie: Tage in Folge mit mindestens einer richtig gelösten Aufgabe.
//
// Die Regel steht in `vertriebsakademieProgress`. Hier wird sie nur gezeigt,
// und zwar so, dass sie niemanden anlügt: Der Zähler steigt nicht vom
// Öffnen der Seite, sondern erst, wenn heute wirklich etwas gelöst wurde.
// Genau das sagt die Zeile unter dem Zähler auch.
//
// Bewusst ohne Warnung, ohne Countdown und ohne Verlustdrohung. Wer aussetzt,
// verliert die Serie und sonst nichts. Punkte, XP und Kapitelfortschritt
// bleiben, wo sie sind.

import { Flame } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useVaSerie, type VaSerie } from "@/lib/vertriebsakademieProgress";

/** Ein Buchstabe je Wochentag, aus dem Tagesschlüssel. */
function wochentag(tag: string): string {
  const [j, m, t] = tag.split("-").map(Number);
  return ["S", "M", "D", "M", "D", "F", "S"][new Date(j, m - 1, t).getDay()];
}

function Tagesreihe({ serie }: { serie: VaSerie }) {
  return (
    <div className="flex items-end gap-1.5" aria-hidden>
      {serie.letzteTage.map((t, i) => (
        <div key={t.tag} className="flex flex-col items-center gap-1">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              t.aktiv ? "bg-primary" : "bg-muted-foreground/25",
              i === serie.letzteTage.length - 1 && !t.aktiv && "ring-2 ring-primary/30",
            )}
          />
          <span className="text-[9px] leading-none text-muted-foreground">{wochentag(t.tag)}</span>
        </div>
      ))}
    </div>
  );
}

/** Ausführliche Anzeige für die Übersichtsseite. */
export function AkademieSerie() {
  const serie = useVaSerie();
  const laeuft = serie.laenge > 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              "p-2 rounded-lg shrink-0",
              laeuft ? "bg-amber-500/15 text-amber-600" : "bg-muted text-muted-foreground",
            )}
          >
            <Flame className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">
              {laeuft
                ? `Serie: ${serie.laenge} ${serie.laenge === 1 ? "Tag" : "Tage"} in Folge`
                : "Noch keine Serie"}
            </div>
            <p className="text-xs text-muted-foreground">
              {serie.heuteAktiv
                ? "Heute erledigt. Morgen geht sie weiter."
                : "Ein Tag zählt, sobald du eine Aufgabe richtig gelöst hast."}
              {serie.laengste > serie.laenge && ` Deine längste Serie: ${serie.laengste} Tage.`}
            </p>
          </div>
        </div>
        <Tagesreihe serie={serie} />
      </div>
    </Card>
  );
}

/**
 * Knappe Fassung für die Kapitelseite.
 *
 * Sie erscheint nur, wenn wirklich eine Serie läuft. Ohne Serie stünde dort
 * eine Aufforderung, und die Kapitelseite ist zum Arbeiten da, nicht zum
 * Angetrieben-Werden.
 */
export function AkademieSerieKompakt({ className }: { className?: string }) {
  const serie = useVaSerie();
  if (serie.laenge === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-amber-600", className)}>
      <Flame className="h-3.5 w-3.5" />
      <span className="tabular-nums">
        {serie.laenge} {serie.laenge === 1 ? "Tag" : "Tage"} in Folge
      </span>
    </span>
  );
}
