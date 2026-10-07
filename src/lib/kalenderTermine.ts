/**
 * Was im CRM-Kalender steht.
 *
 * Der Kalender zeigte bisher ausschliesslich fremde Termine aus Google und
 * iCloud. Wer keinen Kalender verbunden hatte, sah eine leere Seite, obwohl im
 * CRM Termine standen. Das war der Konstruktionsfehler: Die eigenen Termine
 * sind der Inhalt der Seite, die fremden sind nur der Hintergrund, damit man
 * erkennt, wo der Tag schon belegt ist.
 *
 * Deshalb liegt die Auswahl hier und nicht in der Seite. Sie ist reine
 * Rechnerei ueber uebergebene Daten und damit pruefbar. Die Seite holt die
 * Daten und zeichnet, mehr nicht.
 */

import { terminZeitpunkt } from "./kalenderSync";
import { fremdZeitZuIso } from "./kalenderRueckrichtung";
import { istVideoTermin } from "./naechsterKontakt";
import {
  CALL_DAUER_MINUTEN,
  CALL_RUNDEN,
  CALL_WOCHENTAG,
  ZOOM_KENNCODE,
  ZOOM_MEETING_ID,
  ZOOM_URL,
  type CallRunde,
} from "./weeklyCallZeit";

/** Was von einer Aktivitaet gebraucht wird. Bewusst schmal gehalten. */
export interface KalenderAktivitaet {
  id: string;
  kundeId: string;
  art: string;
  beschreibung?: string;
  details?: string;
  faelligAm?: string;
  uhrzeit?: string;
  dauer?: string;
  zoomLink?: string;
  /** Wem der Termin gehoert, siehe terminSichtbarFuer. */
  benutzerId?: string;
  /** Verknuepfung in den Fremdkalender, siehe kalenderSync. */
  kalenderEventId?: string;
}

/** Ein Eintrag, wie ihn die Edge Function liefert, vor jeder Umrechnung. */
export interface RohFremdTermin {
  id: string;
  summary?: string;
  /** Bei Google ISO, bei iCloud CalDAV. Beides geht durch fremdZeitZuIso. */
  start: string;
  end?: string;
  location?: string;
}

/**
 * "buchung" sind Videocall-Termine, die jemand ueber den Buchungslink
 * gebucht hat. Sie stehen in der Tabelle `buchungen` und nicht zwingend in
 * den Aktivitaeten, deshalb sind sie eine eigene Quelle.
 */
export type TerminQuelle = "crm" | "google" | "apple" | "buchung";

export interface KalenderEintrag {
  id: string;
  titel: string;
  /** Beginn als ISO-Zeitpunkt, oder "JJJJ-MM-TT" bei ganztaegigen Eintraegen. */
  start: string;
  ende?: string;
  /** Sortier- und Vergleichsschluessel in Millisekunden, lokale Zeit. */
  zeit: number;
  quelle: TerminQuelle;
  ganztags: boolean;
  ort?: string;
  /** Nur bei CRM-Terminen gesetzt. */
  kundeId?: string;
  kundeName?: string;
  zoomLink?: string;
  /** Am Termin haengt ein Videogespraech, siehe istVideoTermin. */
  video?: boolean;
  /** Nur beim eigenen Videoraum gesetzt, ein Pfad der Form "/raum/<token>". */
  videoraumPfad?: string;
  /** Kennung des zugehoerigen Eintrags im Fremdkalender, falls uebertragen. */
  fremdEventId?: string;
}

export interface SichtKontext {
  /** Kennung des angemeldeten Nutzers. */
  benutzerId?: string | null;
  /** Kontakte, die ihm gehoeren. Die Inbox rechnet sie als ownedKundeIds aus. */
  erlaubteKundeIds: Set<string>;
}

/**
 * Belegt dieser Termin die Zeit des angemeldeten Nutzers?
 *
 * Die Reihenfolge ist keine eigene Erfindung, sie folgt dem, was im Projekt
 * schon gilt:
 *
 * 1. Steht ein `benutzer_id` an der Aktivitaet, entscheidet allein diese
 *    Kennung. Ueber den Buchungslink gebuchte Termine tragen dort den
 *    Gastgeber, und der ist nicht zwingend der zustaendige Berater des
 *    Kontakts.
 * 2. Altbestand hat das Feld nicht. Dann zaehlt, ob der Kontakt dem Nutzer
 *    gehoert. Diese Menge kommt aus `kontaktBelongsToUser` und damit aus
 *    `kontakte.zustaendig_id`.
 */
export function terminGehoertMir(
  aktivitaet: Pick<KalenderAktivitaet, "kundeId" | "benutzerId">,
  { benutzerId, erlaubteKundeIds }: SichtKontext,
): boolean {
  if (aktivitaet.benutzerId) return !!benutzerId && aktivitaet.benutzerId === benutzerId;
  return erlaubteKundeIds.has(aktivitaet.kundeId);
}

/**
 * Darf der Termin im Kalender stehen?
 *
 * Etwas weiter gefasst als `terminGehoertMir`, und zwar bewusst: Legt eine
 * Kollegin ein Gespraech zu meinem Kontakt an, traegt die Aktivitaet ihre
 * Kennung, aber der Termin betrifft mich. Die Inbox zeigt ihn mir laengst,
 * sie fragt ausschliesslich nach `ownedKundeIds`. Wuerde der Kalender hier
 * strenger sein, fehlte im Kalender ein Termin, der in der Inbox steht.
 *
 * Umgekehrt zaehlt der Gastgeber eines Buchungslinks auch dann, wenn der
 * Kontakt einem anderen Berater gehoert. Beides zusammen ergibt: alles, was
 * den angemeldeten Nutzer angeht, und nichts darueber hinaus.
 */
export function terminSichtbarFuer(
  aktivitaet: Pick<KalenderAktivitaet, "kundeId" | "benutzerId">,
  kontext: SichtKontext,
): boolean {
  if (terminGehoertMir(aktivitaet, kontext)) return true;
  return kontext.erlaubteKundeIds.has(aktivitaet.kundeId);
}

/**
 * Zeitstempel eines ISO-Werts, ganztaegige Angaben in lokaler Zeit.
 *
 * `new Date("2026-08-03")` legt JavaScript auf Mitternacht UTC. Westlich von
 * Greenwich rutscht der Eintrag damit auf den Vortag. Ein ganztaegiger Termin
 * gehoert aber an den Tag, der draufsteht.
 */
export function zeitstempelAus(iso: string): number | null {
  const roh = (iso || "").trim();
  if (!roh) return null;

  const nurTag = /^(\d{4})-(\d{2})-(\d{2})$/.exec(roh);
  if (nurTag) {
    const [, j, m, t] = nurTag;
    return new Date(Number(j), Number(m) - 1, Number(t)).getTime();
  }

  const ms = new Date(roh).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Tagesschluessel in lokaler Zeit, zum Einsortieren in das Monatsraster. */
export function tagSchluessel(zeit: number | Date): string {
  const d = zeit instanceof Date ? zeit : new Date(zeit);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Die eigenen Termine aus den Aktivitaeten.
 *
 * Ein Termin ist eine Aktivitaet mit `art === "meeting"`. Datum steht in
 * `faelligAm`, Uhrzeit in `uhrzeit`, der Titel in `beschreibung`, der Zugang
 * in `zoomLink`. Fehlt die Uhrzeit, gilt neun Uhr, genau wie beim Eintragen in
 * den Fremdkalender (`terminZeitpunkt`), sonst stuende derselbe Termin an
 * beiden Stellen zu unterschiedlichen Zeiten.
 */
export function sammleEigeneTermine({
  aktivitaeten,
  benutzerId,
  erlaubteKundeIds,
  namenJeKunde,
}: {
  aktivitaeten: KalenderAktivitaet[];
  benutzerId?: string | null;
  erlaubteKundeIds: Set<string>;
  namenJeKunde?: Map<string, string>;
}): KalenderEintrag[] {
  const eintraege: KalenderEintrag[] = [];

  for (const a of aktivitaeten) {
    if (a.art !== "meeting") continue;
    if (!a.faelligAm) continue;
    if (!terminSichtbarFuer(a, { benutzerId, erlaubteKundeIds })) continue;

    const start = terminZeitpunkt(a.faelligAm, a.uhrzeit);
    if (!start) continue;
    const zeit = zeitstempelAus(start);
    if (zeit === null) continue;

    const zoomLink = a.zoomLink?.trim() || undefined;
    eintraege.push({
      id: `crm-${a.id}`,
      titel: a.beschreibung?.trim() || "Termin",
      start,
      zeit,
      quelle: "crm",
      ganztags: false,
      kundeId: a.kundeId,
      kundeName: namenJeKunde?.get(a.kundeId),
      zoomLink,
      video: istVideoTermin(zoomLink),
      videoraumPfad: zoomLink?.startsWith("/raum/") ? zoomLink : undefined,
      fremdEventId: a.kalenderEventId || undefined,
    });
  }

  return eintraege.sort((a, b) => a.zeit - b.zeit);
}

/**
 * Einen Eintrag aus Google oder iCloud in die gemeinsame Form bringen.
 *
 * iCloud liefert CalDAV-Zeitstempel wie "20260803T140000Z". Ohne
 * `fremdZeitZuIso` stuende im Kalender ueberall "Invalid Date".
 */
export function zuFremdEintrag(roh: RohFremdTermin, quelle: "google" | "apple"): KalenderEintrag | null {
  const start = fremdZeitZuIso(roh.start);
  const zeit = zeitstempelAus(start);
  if (zeit === null) return null;

  const ende = roh.end ? fremdZeitZuIso(roh.end) : undefined;
  return {
    id: `${quelle}-${roh.id || `${roh.summary || ""}${start}`}`,
    titel: (roh.summary || "").trim() || "Ohne Titel",
    start,
    ende: ende || undefined,
    zeit,
    quelle,
    ganztags: start.length <= 10,
    ort: roh.location?.trim() || undefined,
    fremdEventId: roh.id || undefined,
  };
}

/**
 * Eigene und fremde Termine zu einer Liste zusammenfuehren.
 *
 * Wichtig ist die Entdopplung: Ein CRM-Termin, der schon in den verbundenen
 * Kalender uebertragen wurde, kommt von dort zurueck. Ohne diesen Schritt
 * stuende er zweimal am selben Tag, einmal blau und einmal grau. Erkannt wird
 * er an der Kennung, die beim Uebertragen zurueckgeschrieben wurde.
 */
export function fuegeTermineZusammen(
  eigene: KalenderEintrag[],
  fremde: KalenderEintrag[],
): KalenderEintrag[] {
  const schonEigen = new Set(
    eigene.map((e) => e.fremdEventId).filter((id): id is string => Boolean(id)),
  );

  const uebrig = fremde.filter((f) => !f.fremdEventId || !schonEigen.has(f.fremdEventId));

  return [...eigene, ...uebrig].sort((a, b) => {
    if (a.zeit !== b.zeit) return a.zeit - b.zeit;
    // Bei gleicher Uhrzeit steht der eigene Termin oben. Er ist der Inhalt,
    // der fremde nur der Hintergrund.
    if (a.quelle === b.quelle) return 0;
    if (a.quelle === "crm") return -1;
    if (b.quelle === "crm") return 1;
    return 0;
  });
}

/** Termine nach Tag sortiert, damit das Raster nicht je Zelle filtern muss. */
export function gruppiereNachTag(eintraege: KalenderEintrag[]): Map<string, KalenderEintrag[]> {
  const nachTag = new Map<string, KalenderEintrag[]>();
  for (const e of eintraege) {
    const schluessel = tagSchluessel(e.zeit);
    const liste = nachTag.get(schluessel);
    if (liste) liste.push(e);
    else nachTag.set(schluessel, [e]);
  }
  return nachTag;
}

/** Was von einer Buchung gebraucht wird. Bewusst schmal gehalten. */
export interface KalenderBuchung {
  id: string;
  name: string;
  bezeichnung: string | null;
  start_at: string;
  ende_at?: string;
  status: string;
  kontakt_id?: string | null;
  /** Die Aktivitaet, die aus der Buchung entstanden ist, falls vorhanden. */
  aktivitaet_id?: string | null;
  /** Der bei der Buchung angelegte Videoraum, fuer den Betreten-Knopf. */
  videoraum_id?: string | null;
}

/**
 * Gebuchte Videocalls fuer den Kalender.
 *
 * Wer ueber den Buchungslink einen Termin nimmt, erzeugt eine Zeile in
 * `buchungen`. Aus vielen, aber nicht aus allen dieser Zeilen entsteht
 * zusaetzlich eine Aktivitaet. Genau deshalb fehlten die Termine bisher im
 * Kalender: Er kennt nur Aktivitaeten. Hier kommen sie dazu, und damit
 * nichts doppelt steht, fallen die Buchungen heraus, deren Aktivitaet der
 * Kalender ohnehin schon zeigt. Abgesagte Buchungen bleiben draussen.
 */
export function sammleBuchungsTermine({
  buchungen,
  vorhandeneAktivitaetIds,
}: {
  buchungen: KalenderBuchung[];
  vorhandeneAktivitaetIds?: Set<string>;
}): KalenderEintrag[] {
  const eintraege: KalenderEintrag[] = [];

  for (const b of buchungen) {
    if (b.status === "abgesagt") continue;
    if (b.aktivitaet_id && vorhandeneAktivitaetIds?.has(b.aktivitaet_id)) continue;

    const zeit = zeitstempelAus(b.start_at);
    if (zeit === null) continue;

    eintraege.push({
      id: `buchung-${b.id}`,
      titel: (b.bezeichnung || "").trim() || "Videocall",
      start: b.start_at,
      ende: b.ende_at || undefined,
      zeit,
      quelle: "buchung",
      ganztags: false,
      kundeId: b.kontakt_id || undefined,
      kundeName: (b.name || "").trim() || undefined,
      video: true,
      // Gastgeberpfad wie in "Meine Gespraeche", damit man direkt eintreten kann.
      videoraumPfad: b.videoraum_id ? `/videocall/raum/${b.videoraum_id}` : undefined,
    });
  }

  return eintraege.sort((a, b) => a.zeit - b.zeit);
}

/**
 * Der Weekly Sales Call als wiederkehrender Eintrag, jeden Montag.
 *
 * Er steht in keiner Tabelle, sondern wird hier aus Wochentag, Uhrzeit und
 * Zoom-Zugang in `weeklyCallZeit.ts` errechnet, für jeden Montag zwischen
 * `von` und `bis`. `runden` sind die Calls des Nutzers (`callRundenFuer`):
 * Lead-Berater sehen den um 19:00, Vertriebspartner den um 19:30, die Leitung
 * beide. Beide tragen denselben Zoom-Link.
 *
 * Bewusst nur im CRM-Kalender: In einen verbundenen Kalender wird nichts
 * übertragen. Wer den Termin dort haben will, nimmt „In Kalender eintragen“
 * auf der Karte im Dashboard.
 */
export function sammleWeeklyCallTermine({
  runden,
  von,
  bis,
}: {
  runden: CallRunde[];
  von: Date;
  bis: Date;
}): KalenderEintrag[] {
  const eintraege: KalenderEintrag[] = [];
  if (runden.length === 0) return eintraege;

  const tag = new Date(von.getFullYear(), von.getMonth(), von.getDate());
  tag.setDate(tag.getDate() + ((CALL_WOCHENTAG - tag.getDay() + 7) % 7));

  for (; tag.getTime() <= bis.getTime(); tag.setDate(tag.getDate() + 7)) {
    for (const runde of runden) {
      const { zeit, gruppe } = CALL_RUNDEN[runde];
      const start = new Date(tag.getFullYear(), tag.getMonth(), tag.getDate(), zeit.stunde, zeit.minute);
      const ende = new Date(start.getTime() + CALL_DAUER_MINUTEN * 60_000);
      eintraege.push({
        id: `weekly-call-${runde}-${tagSchluessel(start)}`,
        titel: `Weekly Sales Call ${gruppe}`,
        start: start.toISOString(),
        ende: ende.toISOString(),
        zeit: start.getTime(),
        quelle: "crm",
        ganztags: false,
        ort: `Zoom, Meeting-ID ${ZOOM_MEETING_ID}, Kenncode ${ZOOM_KENNCODE}`,
        zoomLink: ZOOM_URL,
        video: true,
      });
    }
  }
  return eintraege;
}
