import { CalendarX } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * Das Kennzeichen „Abgesagt" am Closing-Gespräch.
 *
 * Christian am 16.09.2026: „Sollte ein Bewerber den Termin absagen, dann muss
 * das Closing-Gespräch mit einem Badge als abgesagt angezeigt werden, soll aber
 * bei Closing liegen bleiben."
 *
 * Das Zweite ist der eigentliche Punkt. Eine Absage wirft niemanden aus der
 * Stufe, sie macht nur sichtbar, dass hier etwas zu tun ist. Die Stufe fasst
 * `bewerber_termin_absagen` deshalb bewusst nicht an.
 *
 * Woher die Anzeige weiß, dass abgesagt wurde: aus `buchungen.status`, siehe
 * `closingGespraechTermin` in `src/lib/bewerberTermine.ts`. Die Absage räumt
 * Datum und Uhrzeit in der Akte, die Buchungszeile bleibt vollständig stehen.
 *
 * An drei Stellen im Einsatz, damit die Handy-Liste und die Akte nicht weniger
 * zeigen als die Tabelle: Bewerberliste, Handy-Liste und die Karte „Videocall
 * Termin".
 *
 * Zur Barrierefreiheit: Die Farbe ist nie der einzige Träger. Das Wort steht
 * daneben, und `aria-label` sagt denselben Sachverhalt als ganzen Satz, damit
 * eine Vorlesehilfe nicht nur „Abgesagt" ohne Bezug vorträgt.
 */
export function TerminAbgesagtBadge({ className = "" }: { className?: string }) {
  const satz = "Dieser Termin wurde abgesagt. Der Bewerber bleibt im Closing.";
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] font-medium border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200 ${className}`}
      title={satz}
      aria-label={satz}
    >
      <CalendarX className="h-3 w-3" aria-hidden />
      Abgesagt
    </Badge>
  );
}
