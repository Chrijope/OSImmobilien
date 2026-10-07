import { MailX } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Die Karte in der Bewerberübersicht, wenn er sich über die Nachfass-Mail
 * selbst abgemeldet hat: Zeitpunkt und, falls er einen genannt hat, der
 * Grund. Wer die Akte öffnet, soll das sehen, bevor er zum Hörer greift.
 *
 * Bleibt weg, solange selbstAbgemeldetAm leer ist.
 */
export function SelbstAbmeldungKarte({ bewerber }: { bewerber: Pick<Bewerber, "selbstAbgemeldetAm" | "selbstAbgemeldetGrund"> }) {
  if (!bewerber.selbstAbgemeldetAm) return null;
  const am = new Date(bewerber.selbstAbgemeldetAm);
  const zeitpunkt = Number.isNaN(am.getTime())
    ? ""
    : am.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) + " Uhr";
  const grund = (bewerber.selbstAbgemeldetGrund || "").trim();

  return (
    <Card className="border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
      <div className="flex items-start gap-3">
        <MailX className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Per Mail abgemeldet</p>
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {zeitpunkt
              ? `Hat am ${zeitpunkt} über den Link in der Nachfass-Mail mitgeteilt, kein Interesse mehr zu haben.`
              : "Hat über den Link in der Nachfass-Mail mitgeteilt, kein Interesse mehr zu haben."}
          </p>
          {grund ? (
            <div className="mt-2">
              <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">Grund</p>
              <p className="whitespace-pre-wrap text-sm text-amber-900 dark:text-amber-100">{grund}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs italic text-amber-700 dark:text-amber-300">Kein Grund angegeben.</p>
          )}
          {/* Ob der Status damals stehen blieb, steht im Verlaufseintrag. Hier
              nicht aus dem heutigen Status raten: HR kann ihn längst von Hand
              zurückgesetzt haben. */}
        </div>
      </div>
    </Card>
  );
}
