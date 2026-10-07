import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { formatDatum } from "@/lib/utils";
import { uhrzeitAusMs, type BewerberEreignis } from "@/lib/bewerberEreignisse";
import { letzteAktivitaet, naechsteAktionText, naechsterTermin } from "@/lib/bewerberNaechsteAktion";
import type { Bewerber } from "@/lib/bewerbungStore";
import "./bewerberprofil.css";

/**
 * Die drei Kästchen über dem Arbeitsbereich, wie im Kundenprofil.
 *
 * Sie beantworten die drei Fragen, mit denen man eine Akte öffnet: Was ist zu
 * tun, wann ist der nächste Termin, und wann ist zuletzt etwas passiert.
 * Gerechnet wird in `lib/bewerberNaechsteAktion.ts`, hier steht nur die
 * Anzeige.
 *
 * Bewusst ohne vierte Kachel mit einer Zahl. Eine Kachel muss eine Frage
 * beantworten; „Anzahl Mails" beantwortet keine.
 */
export function BewerberprofilKennzahlen({
  b,
  ereignisse,
}: {
  b: Bewerber;
  ereignisse: BewerberEreignis[];
}) {
  const termin = useMemo(() => naechsterTermin(ereignisse), [ereignisse]);
  const letzte = useMemo(() => letzteAktivitaet(ereignisse), [ereignisse]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4" data-testid="bewerberprofil-kennzahlen">
      <Card className="p-3.5 min-w-0">
        <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Nächste Aktion</h3>
        <p className="text-sm font-semibold mt-1 break-words">{naechsteAktionText(b, ereignisse)}</p>
      </Card>
      <Card className="p-3.5 min-w-0">
        <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Nächster Termin</h3>
        {termin ? (
          <>
            <p className="text-sm font-semibold mt-1 break-words">
              {formatDatum(new Date(termin.ms).toISOString())}
              {!termin.nurTag && ` · ${uhrzeitAusMs(termin.ms)} Uhr`}
            </p>
            <p className="text-[11px] text-muted-foreground break-words">{termin.titel}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">Kein Termin geplant</p>
        )}
      </Card>
      <Card className="p-3.5 min-w-0">
        <h3 className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Zuletzt passiert</h3>
        {letzte ? (
          <>
            <p className="text-sm font-semibold mt-1 break-words">{letzte.titel}</p>
            <p className="text-[11px] text-muted-foreground">
              {formatDatum(new Date(letzte.ms).toISOString())}
              {!letzte.nurTag && ` · ${uhrzeitAusMs(letzte.ms)} Uhr`}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-1">Noch nichts aufgezeichnet</p>
        )}
      </Card>
    </div>
  );
}
