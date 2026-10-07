/**
 * Automatische Mahn-Erinnerungen für überfällige Rechnungen über das Lead-Paket.
 * Schwellen: 14 Tage (Erinnerung) und 21 Tage (2. Mahnung) ab Fälligkeit.
 * Sendet die Bell-Benachrichtigung an HR, einmalig pro Schwelle.
 *
 * Seit dem 23.09.2026 heißen sie „Lead-Paket-Rechnung". Eine Onboardinggebühr
 * erhebt der heutige Vertrag nicht mehr, in die Stufe „Rechnung" kommt nur, wer
 * ein Lead-Paket im Vertrag hat (`supabase/functions/_shared/lead-paket.ts`).
 * Die Texte stehen in `MAHNUNG_TEXTE`, damit der Test sie ohne Store prüfen kann.
 *
 * Bewusst nur HR: Die Rechnung hängt am Bewerber, und das Bewerbermanagement
 * führt HR. Admin und Inhaber standen früher mit auf der Liste und lasen jede
 * Mahnstufe still mit.
 */
import { getBewerber, updateBewerber } from "./bewerbungStore";
import { berechneFaelligAm } from "./rechnungStatus";
import { notifyByRole } from "./bellNotifications";

const DAY_MS = 1000 * 60 * 60 * 24;

/** Titel und Nachricht der beiden Mahnstufen. */
export const MAHNUNG_TEXTE = {
  stufe14: {
    titel: "Lead-Paket-Rechnung 14 Tage überfällig",
    nachricht: (rechnungNr: string, name: string) =>
      `Die Rechnung ${rechnungNr} über das Lead-Paket an ${name} ist seit 14 Tagen überfällig. Bitte Zahlungseingang prüfen oder mahnen.`,
  },
  stufe21: {
    titel: "2. Mahnung erforderlich, Lead-Paket-Rechnung",
    nachricht: (rechnungNr: string, name: string) =>
      `Die Rechnung ${rechnungNr} über das Lead-Paket an ${name} ist seit 21 Tagen überfällig. Bitte 2. Mahnung über Lexoffice versenden.`,
  },
} as const;

export function pruefeMahnErinnerungen() {
  const all = getBewerber();
  const now = Date.now();

  for (const b of all) {
    if (!b.rechnungNr || !b.rechnungErstelltAm || b.rechnungBezahltAm) continue;

    const faelligIso = b.rechnungFaelligAm || berechneFaelligAm(b.rechnungErstelltAm);
    if (!faelligIso) continue;
    const faelligTs = new Date(faelligIso).getTime();
    if (isNaN(faelligTs)) continue;

    const tageUeberfaellig = Math.floor((now - faelligTs) / DAY_MS);
    const name = `${b.vorname} ${b.nachname}`.trim();
    const link = `/bewerberprozess?id=${b.id}`;

    // Schwelle 1: 14 Tage überfällig (= 28 Tage nach Rechnung)
    if (tageUeberfaellig >= 14 && !b.rechnungMahnung14Am) {
      notifyByRole(["hr"], {
        titel: MAHNUNG_TEXTE.stufe14.titel,
        nachricht: MAHNUNG_TEXTE.stufe14.nachricht(b.rechnungNr, name),
        link,
        category: "system",
      });
      updateBewerber(b.id, { rechnungMahnung14Am: new Date().toISOString() });
    }

    // Schwelle 2: 21 Tage überfällig
    if (tageUeberfaellig >= 21 && !b.rechnungMahnung21Am) {
      notifyByRole(["hr"], {
        titel: MAHNUNG_TEXTE.stufe21.titel,
        nachricht: MAHNUNG_TEXTE.stufe21.nachricht(b.rechnungNr, name),
        link,
        category: "system",
      });
      updateBewerber(b.id, { rechnungMahnung21Am: new Date().toISOString() });
    }
  }
}