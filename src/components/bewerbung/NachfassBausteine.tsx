import { MailX, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { eingangStandText, nachfassHinweisText, nachfassStand } from "@/lib/bewerberNachfass";
import type { NachfassBewerber } from "@/lib/bewerberNachfass";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Die kleinen Sichtbarkeiten der Nachfass-Mail im Bewerbungsmanagement.
 *
 * Beides sind reine Anzeigen im CRM-Stil, keine Browser-Fenster: das Badge
 * neben dem Status im Abschnitt „Kein Interesse" und der schmale Balken im
 * Abschnitt „Eingang". Die Rechnung dahinter liegt in
 * `src/lib/bewerberNachfass.ts`.
 */

/** „per Mail abgemeldet" neben dem Namen, wenn selbstAbgemeldetAm gesetzt ist. */
export function PerMailAbgemeldetBadge({ bewerber }: { bewerber: Pick<Bewerber, "selbstAbgemeldetAm"> }) {
  if (!bewerber.selbstAbgemeldetAm) return null;
  const am = new Date(bewerber.selbstAbgemeldetAm);
  const titel = Number.isNaN(am.getTime())
    ? "Hat sich über die Nachfass-Mail abgemeldet"
    : `Hat sich am ${am.toLocaleDateString("de-DE")} über die Nachfass-Mail abgemeldet`;
  return (
    <Badge
      variant="outline"
      className="gap-1 border-amber-300 bg-amber-50 text-[10px] font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
      title={titel}
    >
      <MailX className="h-3 w-3" aria-hidden />
      per Mail abgemeldet
    </Badge>
  );
}

/**
 * „Seit dem Versand am … haben sich X Bewerber abgemeldet."
 *
 * Erscheint erst, wenn überhaupt eine Welle hinausging. Vorher gibt es
 * nichts zu berichten, und ein leerer Balken wäre nur Rauschen.
 *
 * Der zweite Satz beantwortet die Frage, die nach einer Welle wirklich
 * ansteht: Ist der Eingang durch? Er steht bewusst im selben Balken, denn
 * die Zahl der Angeschriebenen allein sagt nichts darüber, wie viel Arbeit
 * noch offen ist.
 */
export function NachfassHinweisBalken({ bewerber }: { bewerber: NachfassBewerber[] }) {
  const stand = nachfassStand(bewerber);
  if (!stand.letzterVersand) return null;
  const eingang = eingangStandText(stand);
  return (
    <Alert className="border-sky-200 bg-sky-50 py-2 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
      <Send className="h-4 w-4" />
      <AlertDescription className="text-xs">
        {nachfassHinweisText(stand)}{" "}
        <span className="text-sky-700/80 dark:text-sky-300/80">
          Angeschrieben wurden {stand.angeschrieben}.{eingang ? ` ${eingang}` : ""}
        </span>
      </AlertDescription>
    </Alert>
  );
}
