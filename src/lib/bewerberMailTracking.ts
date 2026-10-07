import { supabase } from "@/integrations/supabase/client";

import { ZAEHL_PARAMETER, istZaehlmarke, mitZaehlmarke } from "../../supabase/functions/_shared/mail-zaehlung";

/**
 * Linkzählung für die Bewerbermails.
 *
 * ## Seit dem 26.09.2026 ohne Zählpixel
 *
 * Bis dahin trug jede Bewerbermail ein unsichtbares Bild, das beim Öffnen
 * `opened_at` setzte. Das ist entfallen: Nach Einschätzung der Rechtsprüfung
 * braucht ein Öffnungspixel eine Einwilligung (§ 25 TDDDG). Gezählt wird
 * seitdem nur noch, ob der Bewerber den persönlichen Link aus der Mail
 * aufgerufen hat. Dafür hängt am Link eine Zählmarke, das Token der Zeile in
 * `bewerber_mail_tracking`; die Seite hinter dem Link meldet sie
 * (`meldeLinkAufruf`), und die Datenbank setzt `clicked_at`. Einzelheiten in
 * `supabase/functions/_shared/mail-zaehlung.ts`.
 *
 * Ein altes `opened_at` aus der Pixelzeit wird deshalb nicht mehr angezeigt.
 * Die Anzeige sagt „Link geöffnet" und stützt sich auf `clicked_at` oder auf
 * den abgeschickten Bogen, nichts anderes.
 *
 * ## Warum hier und nicht in den Komponenten
 *
 * `bewerber_mail_tracking` liegt nicht im `dataCache`, die Bewerberliste lädt
 * sie also nicht mit. Der Zugriff gehört trotzdem in ein Store-Modul und nicht
 * in die Oberfläche, so wie es CLAUDE.md verlangt. Die Liste holt sich die
 * Zeilen gebündelt über `ladeMailOeffnungen`, genau wie `useKennenlernVersand`
 * es für die Bögen tut.
 *
 * ## Was ein graues Symbol NICHT heißt
 *
 * Grau heißt „Link bisher nicht aufgerufen", niemals „nicht gelesen". Wer die
 * Mail liest und nicht klickt, bleibt grau. Der Satz dazu steht in
 * `OEFFNUNG_UNSICHER` und gehört in jeden Tooltip.
 */

/**
 * Basisadresse der Edge Functions.
 *
 * Dieselbe Herleitung wie in `startfahrplanVersand.ts`, nur nicht mehr fest
 * verdrahtet: Steht die Projektadresse in der Umgebung, gilt sie, sonst der
 * bekannte Wert. So läuft der Code auch im Test, wo die Umgebung leer ist.
 */
const PROJEKT_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  "https://DEIN-SUPABASE-PROJEKT.supabase.co";
const FN_BASIS = `${PROJEKT_URL.replace(/\/+$/, "")}/functions/v1`;

/** Die Eingangsmail mit dem Kennenlernbogen. */
export const MAIL_KENNENLERNEN = "kennenlernen_einladung";
/**
 * Die automatischen Erinnerungen an denselben Bogen: Tag 3 und Tag 11.
 *
 * `_2` war die Erinnerung an Tag 8. Sie ist am 26.09.2026 entfallen, die Art
 * bleibt trotzdem stehen: Ältere Akten haben solche Einträge, und die
 * Datenbankprüfung aus Migration 20260915180000 kennt sie.
 */
export const MAIL_ERINNERUNG_1 = "kennenlernen_erinnerung_1";
export const MAIL_ERINNERUNG_2 = "kennenlernen_erinnerung_2";
export const MAIL_ERINNERUNG_3 = "kennenlernen_erinnerung_3";
/** Die Einladung zum persönlichen Gespräch. */
export const MAIL_KOOPERATION = "kooperation_einladung";

/**
 * Alle Mails, die zum Kennenlernbogen gehören.
 *
 * Die Erinnerungen zählen bewusst mit. Sie tragen denselben Link und stellen
 * dieselbe Frage; wer nur die letzte Erinnerung öffnet, hat die Sache gesehen.
 * Wären sie nicht gemessen, bliebe das Symbol bei ihm für immer grau, und das
 * ist genau die falsche Fehlanzeige, vor der der Tooltip warnt.
 */
export const KENNENLERN_MAILS = [
  MAIL_KENNENLERNEN,
  MAIL_ERINNERUNG_1,
  MAIL_ERINNERUNG_2,
  MAIL_ERINNERUNG_3,
] as const;

const MAIL_NAMEN: Record<string, string> = {
  [MAIL_KENNENLERNEN]: "Einladung zum Kennenlernen",
  // Nach Tagen benannt statt gezählt: Seit Tag 8 entfallen ist, wäre die
  // „2." bei alten Akten die Tag-8-Mail und bei neuen gar keine.
  [MAIL_ERINNERUNG_1]: "Erinnerung an das Kennenlernen (Tag 3)",
  [MAIL_ERINNERUNG_2]: "Erinnerung an das Kennenlernen (Tag 8)",
  [MAIL_ERINNERUNG_3]: "Letzte Erinnerung an das Kennenlernen (Tag 11)",
  [MAIL_KOOPERATION]: "Einladung zum persönlichen Gespräch",
};

/** Der lesbare Name einer Mail, für Tooltip und Vorlesehilfe. */
export function mailName(kind: string): string {
  return MAIL_NAMEN[kind] || "Mail an den Bewerber";
}

/**
 * Der Satz, der bei jedem Zustand dabeisteht.
 *
 * Er sagt in einem Atemzug, was die Messung nicht kann. Ohne ihn liest sich
 * Grau als „kein Interesse" und Grün als Beweis, und beides stimmt nicht.
 */
export const OEFFNUNG_UNSICHER =
  "Gezählt wird nur, ob der persönliche Link aus der Mail aufgerufen wurde. " +
  "Ob die Mail gelesen wurde, messen wir nicht. Auch wer die Mail " +
  "weitergeleitet bekommt und den Link aufruft, zählt mit.";

/**
 * Woher ein Öffnungsvermerk stammt.
 *
 * `link` heißt: Der persönliche Link aus der Mail wurde aufgerufen
 * (`clicked_at`). `bogen` heißt: Der Bewerber
 * hat den Kennenlernbogen abgeschickt, und der Link dazu steht ausschließlich
 * in dieser Mail. Der zweite Fall ist der sichere von beiden, gemessen wurde
 * dabei aber nichts. Deshalb steht er getrennt und wird nicht als Messung
 * ausgegeben.
 *
 * Ein `opened_at` ohne `clicked_at` und ohne Bogen stammt aus der Zeit des
 * Zählpixels und zählt nicht mehr, siehe oben.
 */
export type OeffnungQuelle = "link" | "bogen";

/** Der Wert, den die Datenbank für die abgeleitete Öffnung trägt. */
export const QUELLE_BOGEN = "bogen";

/** Eine Zeile aus `bewerber_mail_tracking`, so weit sie hier gebraucht wird. */
export type MailTrackingZeile = {
  token: string;
  bewerber_id: string;
  kind: string;
  sent_at: string;
  opened_at: string | null;
  /** Wann der Link aus der Mail aufgerufen wurde. Fehlt in älteren Tests. */
  clicked_at?: string | null;
  tracked: boolean;
  /** Fehlt, solange die Migration vom 15.09.2026 nicht gelaufen ist. */
  opened_source?: string | null;
};

/** Was die Oberfläche über die Öffnungen eines Bewerbers wissen muss. */
export type MailOeffnung = {
  /** Wie viele Mails mit Zählung hinausgingen. */
  gesendet: number;
  /** Bei wie vielen davon der Link aufgerufen wurde (oder der Bogen vorliegt). */
  geoeffnet: number;
  /** Der jüngste Linkaufruf, ISO. Leer heißt: keiner gezählt. */
  geoeffnetAm?: string;
  /** Welche Mail das war, lesbar. */
  geoeffneteMail?: string;
  /**
   * Woher der jüngste Vermerk stammt. Fehlt, wenn keiner vorliegt.
   */
  quelle?: OeffnungQuelle;
};

/** Wann in dieser Zeile der Link aufgerufen wurde, oder der Bogen-Vermerk. Sonst leer. */
function linkAufrufAm(z: MailTrackingZeile): { am: string; quelle: OeffnungQuelle } | null {
  if (z.clicked_at) return { am: z.clicked_at, quelle: "link" };
  if (z.opened_source === QUELLE_BOGEN && z.opened_at) return { am: z.opened_at, quelle: "bogen" };
  return null;
}

/**
 * Aus den Zeilen eines Bewerbers den Stand rechnen.
 *
 * **Welcher Aufruf zählt, wenn mehrere Mails draußen sind?** Der jüngste.
 * Grün wird es, sobald bei irgendeiner der Link aufgerufen wurde, denn die
 * Frage lautet „hat er es gesehen", nicht „hat er genau diese eine gesehen".
 * Wie viele von wie vielen es waren, sagt der Tooltip dazu.
 *
 * Ein `opened_at` allein zählt nicht mehr: Es stammt aus der Zeit des
 * Zählpixels (bis 26.09.2026), und die Anzeige soll nichts behaupten, was sie
 * heute nicht mehr misst.
 */
export function oeffnungAus(zeilen: MailTrackingZeile[] | undefined): MailOeffnung | null {
  /*
   * `tracked = false` heißt „diese Mail wurde nicht gezählt". Solche Zeilen
   * bleiben draußen, sonst behauptete die Anzeige, es sei etwas gemessen
   * worden. Die eine Ausnahme ist die aus dem Bogen abgeleitete Öffnung: Sie
   * steht bewusst auf einer Zeile ohne Zählung, denn gemessen wurde nichts,
   * und trotzdem ist sie der sicherste Beleg, den es gibt.
   */
  const messbar = (zeilen || []).filter((z) => z.tracked !== false || !!linkAufrufAm(z));
  if (messbar.length === 0) return null;
  const offen = messbar
    .map((z) => ({ z, aufruf: linkAufrufAm(z) }))
    .filter((e): e is { z: MailTrackingZeile; aufruf: { am: string; quelle: OeffnungQuelle } } => !!e.aufruf)
    .sort((a, b) => a.aufruf.am.localeCompare(b.aufruf.am));
  const juengste = offen[offen.length - 1];
  return {
    gesendet: messbar.length,
    geoeffnet: offen.length,
    ...(juengste
      ? {
          geoeffnetAm: juengste.aufruf.am,
          geoeffneteMail: mailName(juengste.z.kind),
          quelle: juengste.aufruf.quelle,
        }
      : {}),
  };
}

/**
 * Den eingereichten Kennenlernbogen als Öffnung mitzählen.
 *
 * ## Warum das hier und nicht nur in der Datenbank steht
 *
 * Seit dem 15.09.2026 trägt `mark_bewerber_mail_opened_aus_bogen` denselben
 * Vermerk in `bewerber_mail_tracking` ein. Der Weg dorthin hat aber vier
 * Glieder: Es muss eine Trackingzeile geben oder sich anlegen lassen, die
 * Edge Function muss den Aufruf absetzen, der einmalige Nachtrag muss den
 * Altbestand erwischt haben, und die Liste muss die Zeile lesen dürfen. Jedes
 * dieser Glieder ist bewusst nachsichtig gebaut und verschluckt seinen Fehler,
 * damit ein abgeschickter Bogen nicht an einer Nebenanzeige scheitert. Reißt
 * eines davon, bleibt der Umschlag deshalb lautlos grau. Genau das hat
 * Christian am 16.09.2026 gemeldet.
 *
 * Der Beleg selbst liegt aber längst in der Liste: `useVorabScores` lädt für
 * jeden angezeigten Bewerber, wann er den Kennenlernbogen eingereicht hat.
 * Wer den Bogen abgeschickt hat, hat die Mail zwangsläufig geöffnet, denn sein
 * Link steht ausschließlich dort. Diese Funktion zieht daraus den Schluss an
 * der Stelle, an der er angezeigt wird, und macht ihn damit unabhängig vom
 * Zustand der Trackingtabelle.
 *
 * Eine gemessene Öffnung bleibt unangetastet: Liegt sie vor, gewinnt sie,
 * sonst sähe die Anzeige jede Messung als Ableitung aus und die
 * Öffnungsquote wäre nicht mehr ehrlich.
 */
export function mitBogenBeleg(
  oeffnung: MailOeffnung | null | undefined,
  bogenEingereichtAm?: string | null,
): MailOeffnung | null {
  const vorhanden = oeffnung ?? null;
  const am = (bogenEingereichtAm || "").trim();
  if (!am || Number.isNaN(new Date(am).getTime())) return vorhanden;
  // Schon eine Öffnung bekannt, gleich welcher Herkunft: die gilt.
  if (vorhanden && vorhanden.geoeffnet > 0) return vorhanden;
  return {
    // Mindestens eine Mail muss hinausgegangen sein, sonst hätte er den Link
    // nicht. Gemessene Mails werden dabei nicht kleingerechnet.
    gesendet: Math.max(vorhanden?.gesendet ?? 0, 1),
    geoeffnet: 1,
    geoeffnetAm: am,
    geoeffneteMail: mailName(MAIL_KENNENLERNEN),
    quelle: QUELLE_BOGEN,
  };
}

/** So viele Ids passen in eine Abfrage, ohne dass die Adresse zu lang wird. */
const BLOCKGROESSE = 100;

/**
 * Die Öffnungen mehrerer Bewerber in einem Zug holen.
 *
 * Bewusst nachsichtig: Fehlt die Tabelle, fehlt das Recht oder ist die
 * Migration noch nicht gelaufen, bleibt das Ergebnis leer und die Oberfläche
 * zeigt schlicht keinen Öffnungszustand. Die Meldung geht in die Konsole,
 * sonst sehen „nichts gemessen" und „Abfrage abgelehnt" gleich aus.
 */
export async function ladeMailOeffnungen(
  bewerberIds: string[],
  kinds: readonly string[],
): Promise<Record<string, MailTrackingZeile[]>> {
  const gefunden: Record<string, MailTrackingZeile[]> = {};
  if (bewerberIds.length === 0 || kinds.length === 0) return gefunden;

  for (let i = 0; i < bewerberIds.length; i += BLOCKGROESSE) {
    const block = bewerberIds.slice(i, i + BLOCKGROESSE);
    try {
      /*
       * Zwei Anläufe, weil `opened_source` erst mit der Migration vom
       * 15.09.2026 entsteht. Fehlt die Spalte, weist Postgres die ganze
       * Abfrage ab, und ohne den zweiten Anlauf verschwände auch der bisher
       * gemessene Zustand aus der Liste. Der zweite Anlauf tritt nur ein,
       * solange die Migration offen ist.
       */
      const mitQuelle = await supabase
        .from("bewerber_mail_tracking")
        .select("token, bewerber_id, kind, sent_at, opened_at, clicked_at, tracked, opened_source")
        .in("bewerber_id", block)
        .in("kind", kinds as string[]);
      let data: MailTrackingZeile[] | null = mitQuelle.data as MailTrackingZeile[] | null;
      let error = mitQuelle.error;
      if (error) {
        const ohneQuelle = await supabase
          .from("bewerber_mail_tracking")
          .select("token, bewerber_id, kind, sent_at, opened_at, clicked_at, tracked")
          .in("bewerber_id", block)
          .in("kind", kinds as string[]);
        data = ohneQuelle.data as MailTrackingZeile[] | null;
        error = ohneQuelle.error;
      }
      if (error || !data) {
        if (error) console.error("ladeMailOeffnungen:", error);
        continue;
      }
      for (const zeile of data as MailTrackingZeile[]) {
        if (!zeile?.bewerber_id) continue;
        if (!gefunden[zeile.bewerber_id]) gefunden[zeile.bewerber_id] = [];
        gefunden[zeile.bewerber_id].push(zeile);
      }
    } catch (e) {
      /*
       * Auch ein geworfener Fehler darf hier nicht nach außen dringen. Diese
       * Abfrage ist eine Nebenanzeige; wirft sie, stürzt sonst die Bewerberakte
       * ab, in der sie nur einen kleinen Vermerk beisteuert.
       */
      console.error("ladeMailOeffnungen:", e);
    }
  }
  return gefunden;
}

/**
 * Einen Trackingeintrag anlegen und den Link mit Zählmarke zurückgeben.
 *
 * Der Eintrag entsteht vor dem Versand, denn sein Token gehört an den Link.
 * Scheitert das Anlegen, kommt der nackte Link zurück und die Mail geht
 * ungezählt hinaus. Gegenstück für die Edge Functions:
 * `supabase/functions/_shared/bewerber-mail-tracking.ts`.
 */
export async function linkMitZaehlung(
  bewerberId: string,
  kind: string,
  link: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("bewerber_mail_tracking")
      .insert({ bewerber_id: bewerberId, kind, tracked: true })
      .select("token")
      .single();
    if (error || !data?.token) throw error || new Error("kein Token");
    return mitZaehlmarke(link, String(data.token));
  } catch (e) {
    console.warn("[bewerbermail] Tracking konnte nicht angelegt werden, Versand ohne Zählmarke:", e);
    return link;
  }
}

/**
 * Den Aufruf des persönlichen Links melden, einmal beim Laden der Seite.
 *
 * Liest die Zählmarke aus der Adresse und meldet sie an `track-bewerber-mail`.
 * Ohne Marke passiert nichts. Wirft nie: Die Seite des Bewerbers darf an der
 * Zählung nicht hängen. `no-cors`, weil die Antwort niemanden interessiert
 * und so keine Vorabfrage des Browsers nötig ist.
 */
export function meldeLinkAufruf(suche: string = typeof window !== "undefined" ? window.location.search : ""): void {
  try {
    const marke = new URLSearchParams(suche).get(ZAEHL_PARAMETER);
    if (!istZaehlmarke(marke)) return;
    void fetch(`${FN_BASIS}/track-bewerber-mail?token=${marke}&mode=click`, {
      mode: "no-cors",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Bewusst still, siehe oben.
  }
}

/* ── Wie eine versendete Mail in der Historie heisst ─────────────────────── */

/**
 * Die Mailarten, die `bewerber_mail_tracking.kind` kennt.
 *
 * Stand der Datenbankpruefung aus Migration 20260915180000. Wer hier eine Art
 * ergaenzt, ergaenzt sie auch dort, sonst weist die Datenbank den Eintrag ab.
 */
export type MailArt =
  | "paket_uebersicht"
  | "muster_vertrag"
  | "kennenlernen_einladung"
  | "kennenlernen_erinnerung_1"
  | "kennenlernen_erinnerung_2"
  | "kennenlernen_erinnerung_3"
  | "kooperation_einladung";

/**
 * Was in der Versandhistorie stehen soll.
 *
 * WARUM DAS HIER STEHT UND NICHT IN DER OBERFLAECHE
 *
 * Das Closing beschriftete die Historie bis zum 17.09.2026 so:
 *
 *     const isPaket = t.kind === "paket_uebersicht";
 *     const label = isPaket ? "Startfahrplan" : `Mustervertrag „…"`;
 *
 * Zwei Faelle fuer sieben Arten. Alles, was nicht der Startfahrplan war,
 * hiess Mustervertrag. Seit dem 15.09.2026 laufen aber auch die
 * Kennenlern-Einladung, ihre Erinnerungen und die Kooperations-Einladung
 * ueber dieselbe Tabelle, und die Historie im Closing laedt ALLE Zeilen des
 * Bewerbers ohne Filter.
 *
 * Christian las daraufhin bei Michael Resch-Amsl „Mustervertrag „?" ·
 * versendet" und musste annehmen, ein Vertrag sei von selbst hinausgegangen.
 * Das Fragezeichen war der fehlende Paketname: Eine Kennenlern-Mail hat
 * keines. Versendet wurde nie ein Mustervertrag; er geht ausschliesslich von
 * Hand hinaus, es gibt keinen Zeitplan und keine Automatik dafuer.
 *
 * Eine falsche Beschriftung ist hier kein Schoenheitsfehler: Sie hat eine
 * Geschaeftsfuehrung glauben lassen, das System verschicke ungefragt
 * Vertraege.
 */
const MAIL_ART_LABEL: Record<MailArt, string> = {
  paket_uebersicht: "Startfahrplan",
  muster_vertrag: "Mustervertrag",
  kennenlernen_einladung: "Einladung zum Kennenlernbogen",
  // Tag 8 gibt es seit dem 26.09.2026 nicht mehr; die Beschriftung bleibt für
  // ältere Akten, in denen diese Mail noch steht.
  kennenlernen_erinnerung_1: "Erinnerung an den Kennenlernbogen (Tag 3)",
  kennenlernen_erinnerung_2: "Erinnerung an den Kennenlernbogen (Tag 8)",
  kennenlernen_erinnerung_3: "Letzte Erinnerung an den Kennenlernbogen (Tag 11)",
  kooperation_einladung: "Einladung zum Kooperationsbogen",
};

/**
 * Der Name einer versendeten Mail, mit Paket, wo es eines gibt.
 *
 * Das Paket steht nur beim Mustervertrag dabei, dort sagt es etwas aus. Fehlt
 * es, wird es weggelassen statt durch ein Fragezeichen ersetzt: Ein
 * Fragezeichen sieht nach einem Fehler in den Daten aus, obwohl die Mail
 * schlicht kein Paket hat.
 *
 * Eine unbekannte Art bekommt ihren Rohwert. Er sagt mehr als ein falscher
 * Name, und eine neu hinzugekommene Art faellt so sofort auf.
 */
export function mailArtLabel(kind: string, paketTitel?: string | null): string {
  const grund = MAIL_ART_LABEL[kind as MailArt] ?? kind;
  if (kind !== "muster_vertrag") return grund;
  const paket = (paketTitel || "").trim();
  return paket ? `${grund} „${paket}"` : grund;
}

/** Gehoert die Mail zum Closing, also zu Startfahrplan und Mustervertrag? */
export function istClosingMail(kind: string): boolean {
  return kind === "paket_uebersicht" || kind === "muster_vertrag";
}
