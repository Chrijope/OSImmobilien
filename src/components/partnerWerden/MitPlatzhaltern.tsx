import type { ReactNode } from "react";
import { PLATZHALTER_MUSTER } from "@/lib/partnerWerden/inhalt";

/**
 * Zeigt einen Text und hebt jeden Platzhalter „[ZAHL PRÜFEN: …]“ gelb
 * hervor. So geht keine ungeprüfte Zahl unbemerkt live. Eigene Datei, weil
 * Seite und Wizard sie brauchen (Einwilligungstext mit Speicherdauer).
 */
export function MitPlatzhaltern({ text }: { text: string }) {
  const teile: ReactNode[] = [];
  let rest = 0;
  for (const treffer of text.matchAll(new RegExp(PLATZHALTER_MUSTER))) {
    const i = treffer.index ?? 0;
    if (i > rest) teile.push(text.slice(rest, i));
    teile.push(
      <mark key={i} className="pw-pruefen" title="Platzhalter, bitte prüfen und in lib/partnerWerden/inhalt.ts ersetzen">
        {treffer[0]}
      </mark>,
    );
    rest = i + treffer[0].length;
  }
  if (rest < text.length) teile.push(text.slice(rest));
  return <>{teile}</>;
}
