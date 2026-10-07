import { AlertTriangle } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { oeffneFehlerMeldung } from "@/lib/fehlerMelden";

/**
 * „Fehler melden" als Punkt im Klappmenue der Kopfzeile.
 *
 * Bis zum 18.09.2026 war das ein rotes Ausrufezeichen als eigener Knopf in der
 * Kopfzeile. In drei Monaten wurde es dreimal benutzt, deshalb ist es dort
 * raus. Die Funktion zieht aber nur um, sie stirbt nicht.
 *
 * Warum das Klappmenue und nicht die Einstellungsseite: Der Aufruf macht ein
 * Bildschirmfoto, und der ganze Wert der Meldung steckt darin, dass man sieht,
 * was auf dem Schirm stand, als es schiefging. Wer den Punkt erst auf der
 * Einstellungsseite suchen muss, hat dorthin navigiert, und das Foto zeigt die
 * Einstellungsseite statt des Fehlers. Das Klappmenue oeffnet sich ueber der
 * aktuellen Seite, der Nutzer bleibt stehen, wo das Problem ist.
 *
 * Das Zeichen bleibt `AlertTriangle`, aber in der normalen Textfarbe. Rot
 * neben „Abmelden" saehe aus wie eine Warnung, und das ist es nicht, es ist
 * ein Angebot.
 *
 * `onSelect` laesst das Menue bewusst zufallen, ruft also kein
 * `preventDefault`. Das Foto entsteht erst 250 Millisekunden spaeter, siehe
 * `BugReportDialog`, dann ist das Menue weg.
 *
 * Der wichtigere Weg bleibt der automatische: Bei einem Absturz oeffnet sich
 * derselbe Dialog von selbst, siehe `lib/fehlerMelden.ts`,
 * `RouteErrorBoundary` und `FehlerAufzeichnung`.
 */
export function FehlerMeldenEintrag() {
  return (
    <DropdownMenuItem
      onSelect={() => oeffneFehlerMeldung({ screenshot: true })}
      className="flex items-center gap-2"
    >
      <AlertTriangle aria-hidden className="h-4 w-4" />
      <span>Fehler melden</span>
    </DropdownMenuItem>
  );
}
