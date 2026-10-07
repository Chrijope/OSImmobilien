/**
 * Die kommenden Termine für die Inbox.
 *
 * Ein Termin entsteht auf zwei Wegen, und beide schreiben dasselbe: eine
 * Aktivität mit `art === "meeting"`.
 *
 *   - Von Hand über die Schnellaktion im Kundenprofil. Sie legt zusätzlich
 *     eine Aufgabe an, und nur wegen dieser Aufgabe war der Termin bisher in
 *     der Inbox zu sehen.
 *   - Über den Buchungslink. Dabei entsteht nur die Aktivität. Ein so
 *     gebuchter Termin tauchte in der Inbox deshalb nirgends auf.
 *
 * Statt den zweiten Weg um eine Aufgabe zu erweitern, liest die Inbox die
 * Termine direkt aus den Aktivitäten. Dann erscheint jeder Termin, egal wie er
 * entstanden ist, und ein dritter Weg käme von allein mit.
 *
 * Die Auswahl liegt bewusst hier und nicht in der Seite: Sie ist reine
 * Rechnerei über übergebene Daten und damit prüfbar.
 */

import { zuZeitpunkt, istVideoTermin } from "./naechsterKontakt";

/** Was von einer Aktivität gebraucht wird. Bewusst schmal gehalten. */
export interface TerminAktivitaet {
  id: string;
  kundeId: string;
  art: string;
  beschreibung?: string;
  faelligAm?: string;
  uhrzeit?: string;
  zoomLink?: string;
  erledigtAm?: string;
}

/** Was von einer Aufgabe gebraucht wird, um die Doppelung zu erkennen. */
export interface TerminAufgabe {
  kontaktId?: string;
  titel?: string;
  faelligAm?: string;
}

export interface InboxTermin {
  /** Eigener Präfix, damit die Kennung nicht mit Aufgaben kollidiert. */
  id: string;
  titel: string;
  kundeId: string;
  kundeName: string;
  /** Datum in der Form, in der es in der Aktivität steht. */
  faelligAm: string;
  /** "HH:MM" oder "—", wenn keine Uhrzeit hinterlegt ist. */
  uhrzeit: string;
  /** ISO-Zeitstempel aus Datum und Uhrzeit. */
  zeitpunkt: string;
  zoomLink?: string;
  /** Videogespräch statt Termin vor Ort, siehe istVideoTermin. */
  video: boolean;
}

/**
 * Datum auf den Tag herunterbrechen, unabhängig von der Schreibweise.
 *
 * Nötig, weil dieselbe Angabe je nach Herkunft anders aussieht: die Aktivität
 * hält "2026-08-10", die Aufgabe einen vollen ISO-Zeitstempel in UTC. Ein
 * einfaches Abschneiden der ersten zehn Zeichen würde bei einem Termin kurz
 * nach Mitternacht den Vortag ergeben.
 */
function tagSchluessel(datum?: string): string {
  const zeit = zuZeitpunkt(datum);
  if (zeit === null) return "";
  const d = new Date(zeit);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function paarSchluessel(kundeId?: string, titel?: string, datum?: string): string {
  return `${kundeId || ""}|${(titel || "").trim().toLowerCase()}|${tagSchluessel(datum)}`;
}

/**
 * Die kommenden Termine, sortiert, ohne die bereits vergangenen.
 *
 * Zur Entdopplung: Ein von Hand angelegtes Meeting erzeugt beides, eine
 * Aufgabe und eine Aktivität. Beide tragen denselben Titel, denselben Kunden,
 * dasselbe Datum und dieselbe Uhrzeit, denn die Schnellaktion schreibt sie aus
 * denselben Feldern. Genau daran werden sie einander zugeordnet.
 *
 * Vorrang hat die Aufgabe, nicht die Aktivität. Sie ist der Datensatz, der
 * einen Zustand kennt: Nur sie lässt sich abhaken, zuweisen und wieder öffnen,
 * und genau das tut die Inbox mit ihren Karten. Die Aktivität ist ein Eintrag
 * in der Historie ohne Erledigt-Zustand. Stünde sie zusätzlich in der Liste,
 * bliebe sie auch nach dem Abhaken stehen und liesse sich nicht wegräumen.
 * Dieselbe Entscheidung, aus demselben Grund, steckt bereits in
 * `kontaktTermine.ts`.
 *
 * Die Zuordnung fragt bewusst nicht nach dem Status der Aufgabe. Wer sein
 * Meeting abgehakt hat, will es nicht als Termin wiederbekommen.
 *
 * @param erlaubteKundeIds Kontakte, die der angemeldete Nutzer sehen darf.
 */
export function sammleInboxTermine({
  aktivitaeten,
  erlaubteKundeIds,
  namenJeKunde,
  aufgaben = [],
  jetzt = Date.now(),
}: {
  aktivitaeten: TerminAktivitaet[];
  erlaubteKundeIds: Set<string>;
  namenJeKunde?: Map<string, string>;
  aufgaben?: TerminAufgabe[];
  jetzt?: number;
}): InboxTermin[] {
  const alsAufgabeVorhanden = new Set(
    aufgaben.map((a) => paarSchluessel(a.kontaktId, a.titel, a.faelligAm)),
  );

  const treffer: Array<InboxTermin & { zeit: number }> = [];

  for (const a of aktivitaeten) {
    if (a.art !== "meeting") continue;
    if (a.erledigtAm) continue;
    if (!a.faelligAm) continue;
    if (!erlaubteKundeIds.has(a.kundeId)) continue;
    if (alsAufgabeVorhanden.has(paarSchluessel(a.kundeId, a.beschreibung, a.faelligAm))) continue;

    const zeit = zuZeitpunkt(a.faelligAm, a.uhrzeit);
    if (zeit === null || zeit <= jetzt) continue;

    treffer.push({
      zeit,
      id: `termin-${a.id}`,
      titel: a.beschreibung?.trim() || "Termin",
      kundeId: a.kundeId,
      kundeName: namenJeKunde?.get(a.kundeId) || "Ohne Kunde",
      faelligAm: a.faelligAm,
      uhrzeit: a.uhrzeit?.trim() ? a.uhrzeit.slice(0, 5) : "—",
      zeitpunkt: new Date(zeit).toISOString(),
      zoomLink: a.zoomLink || undefined,
      video: istVideoTermin(a.zoomLink),
    });
  }

  return treffer
    .sort((a, b) => a.zeit - b.zeit)
    .map(({ zeit: _zeit, ...termin }) => termin);
}
