/**
 * Nachtraegliches Uebertragen von Terminen in den verbundenen Fremdkalender.
 *
 * Das Uebertragen laeuft im Browser (`aktivitaetenStore.uebertrageInKalender`).
 * Ein ueber den Buchungslink gebuchter Termin entsteht aber in der Datenbank,
 * in `buchung_anlegen`, und dort gibt es keinen Browser. Solche Termine
 * bekommen deshalb nie eine `kalender_event_id` und landen nie im Google- oder
 * iCloud-Kalender des Partners. Er sieht die Buchung nur, wenn er ins CRM
 * schaut.
 *
 * Die Loesung ohne zusaetzlichen Serverdienst: Wenn der Partner das CRM
 * oeffnet, werden die eigenen, noch nicht verknuepften Termine der Zukunft
 * nachgetragen. Sparsam und ohne Doppelversand, dafuer sorgen drei Dinge:
 *
 *   1. Es laeuft immer nur ein Durchgang gleichzeitig.
 *   2. Jede Kennung wird hoechstens einmal je Sitzung angefasst, auch wenn der
 *      Versuch scheitert. Ein zweiter Anlauf koennte sonst einen Eintrag
 *      anlegen, der beim ersten Mal schon entstanden ist und dessen Antwort
 *      nur verloren ging.
 *   3. Die Kennung wird sofort nach jedem einzelnen Eintrag zurueckgeschrieben.
 *
 * Bewusst nicht rueckwirkend: Vergangene Termine werden nicht nachgetragen.
 * Niemand braucht einen Kalendereintrag fuer ein Gespraech von letzter Woche.
 */

import { cacheUpdate } from "./dataCache";
import { legeTerminAn, terminZeitpunkt, dauerInMinuten, verbundenerKalender, terminAbgleichAktiv } from "./kalenderSync";
import { terminGehoertMir, zeitstempelAus, type KalenderAktivitaet } from "./kalenderTermine";

/** Mehr als das wird in einem Durchgang nicht uebertragen. */
const HOECHSTENS_JE_DURCHGANG = 15;

export interface NachtragKandidat {
  id: string;
  titel: string;
  beschreibung?: string;
  /** Beginn als ISO-Zeitpunkt. */
  start: string;
  dauerMinuten: number;
}

/**
 * Welche Termine muessen nachgetragen werden?
 *
 * Reine Auswahl ohne Netz und ohne Datenbank, damit sie sich pruefen laesst.
 * Die naechsten Termine zuerst: Wer heute Nachmittag ein Gespraech hat, soll
 * es im Kalender sehen, bevor der Termin in drei Monaten drankommt.
 */
export function waehleNachzutragende({
  aktivitaeten,
  benutzerId,
  erlaubteKundeIds,
  jetzt = Date.now(),
  hoechstens = HOECHSTENS_JE_DURCHGANG,
  bereitsVersucht,
}: {
  aktivitaeten: KalenderAktivitaet[];
  benutzerId?: string | null;
  erlaubteKundeIds: Set<string>;
  jetzt?: number;
  hoechstens?: number;
  bereitsVersucht?: Set<string>;
}): NachtragKandidat[] {
  const treffer: Array<NachtragKandidat & { zeit: number }> = [];

  for (const a of aktivitaeten) {
    if (a.art !== "meeting") continue;
    if (a.kalenderEventId) continue;
    if (bereitsVersucht?.has(a.id)) continue;
    // Hier gilt die enge Regel, nicht die der Anzeige: In den eigenen
    // Kalender gehoert nur, was die eigene Zeit belegt. Das Gespraech einer
    // Kollegin zu meinem Kontakt steht in ihrem Kalender, nicht in meinem.
    if (!terminGehoertMir(a, { benutzerId, erlaubteKundeIds })) continue;

    const start = terminZeitpunkt(a.faelligAm, a.uhrzeit);
    if (!start) continue;
    const zeit = zeitstempelAus(start);
    if (zeit === null || zeit <= jetzt) continue;

    treffer.push({
      zeit,
      id: a.id,
      titel: a.beschreibung?.trim() || "Termin",
      beschreibung: [a.details, a.zoomLink].filter(Boolean).join("\n\n") || undefined,
      start,
      dauerMinuten: dauerInMinuten(a.dauer),
    });
  }

  return treffer
    .sort((a, b) => a.zeit - b.zeit)
    .slice(0, Math.max(0, hoechstens))
    .map(({ zeit: _zeit, ...kandidat }) => kandidat);
}

/**
 * Kennungen, die in dieser Sitzung schon einmal angefasst wurden.
 *
 * Auch das direkte Uebertragen beim Anlegen traegt sich hier ein. Sonst
 * koennte der Nachtrag einen Termin ein zweites Mal eintragen, dessen
 * Rueckschreiben gerade noch unterwegs ist.
 */
const bereitsVersucht = new Set<string>();
let laeuft = false;

/** Vom Anlegeweg aufgerufen, damit der Nachtrag denselben Termin auslaesst. */
export function merkeUebertragung(aktivitaetId: string): void {
  bereitsVersucht.add(aktivitaetId);
}

/**
 * Traegt die offenen Termine nach und schreibt die Kennungen zurueck.
 *
 * Gibt die Zahl der tatsaechlich uebertragenen Termine zurueck. Fehler werden
 * geschluckt: Ein hakeliger Kalenderdienst darf die Kalenderseite nicht
 * aufhalten.
 */
export async function trageOffeneTermineNach(argumente: {
  aktivitaeten: KalenderAktivitaet[];
  benutzerId?: string | null;
  erlaubteKundeIds: Set<string>;
  jetzt?: number;
}): Promise<number> {
  if (laeuft) return 0;
  if (!verbundenerKalender() || !terminAbgleichAktiv()) return 0;

  const kandidaten = waehleNachzutragende({ ...argumente, bereitsVersucht });
  if (kandidaten.length === 0) return 0;

  laeuft = true;
  let uebertragen = 0;
  try {
    for (const kandidat of kandidaten) {
      // Vor dem Versuch merken, nicht danach. Bricht der Aufruf mittendrin ab,
      // darf derselbe Termin nicht gleich noch einmal drankommen.
      bereitsVersucht.add(kandidat.id);
      try {
        const verknuepfung = await legeTerminAn({
          titel: kandidat.titel,
          beschreibung: kandidat.beschreibung,
          start: kandidat.start,
          dauerMinuten: kandidat.dauerMinuten,
        });
        if (!verknuepfung) continue;

        await cacheUpdate(
          "aktivitaeten",
          kandidat.id,
          { kalender_typ: verknuepfung.typ, kalender_event_id: verknuepfung.eventId },
          { silent: true },
        );
        uebertragen += 1;
      } catch (fehler) {
        console.warn("Termin nicht nachgetragen:", fehler);
      }
    }
  } finally {
    laeuft = false;
  }

  return uebertragen;
}
