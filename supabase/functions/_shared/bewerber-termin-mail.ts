/**
 * Die Bestätigung an den Bewerber, wenn er seinen Videocall bucht, verschiebt
 * oder absagt, samt Kalenderdatei.
 *
 * ## Warum es diese Datei gibt
 *
 * `send-bewerber-termin` hat bis zum 06.09.2026 ausschließlich die
 * HR-Managerin benachrichtigt. Der Bewerber klickte auf „Termin buchen", sah
 * eine Bestätigung auf dem Bildschirm und bekam danach nichts mehr: keine Mail,
 * keinen Kalendereintrag, nichts zum Wiederfinden. Die Abstimmungsfassung
 * verlangt in der Tabelle der Automatiken ausdrücklich eine „Bestätigung mit
 * Kalenderdatei".
 *
 * Wortlaut und Kalenderdatei stehen hier und nicht in der Vorlage, weil die
 * Vorlagen React über eine npm-Angabe laden und damit für Vitest unerreichbar
 * sind. Was hier steht, können beide Welten lesen. Dieselbe Aufteilung wie in
 * `bewerber-kennenlernen-mail.ts`.
 */

export type TerminVorgang = "gebucht" | "verschoben" | "abgesagt";

/**
 * Wie der Termin gegenüber dem Bewerber heißt.
 *
 * Entscheidung E1 vom 07.09.2026, neu gefasst am 08.09.2026: bewerberseitig
 * überall „Persönliches Gespräch". Der Name sagt, was der Termin ist, und
 * passt zum Bild des Handelsvertreters: Man bewirbt sich nicht, man prüft eine
 * Zusammenarbeit. Intern im CRM heißt der Reiter weiter „Videocall", und die
 * Terminart in der Datenbank behält ihren Schlüssel; das hier ist
 * ausschließlich der Name in den Mails und im Kalender des Bewerbers.
 *
 * Zwei Schreibweisen, wie im CRM: als Eigenname groß, im Fließtext klein
 * gebeugt. „Dein Persönliches Gespräch ist gebucht" wäre falsch. Diese Datei
 * kann `GESPRAECH_NAME` aus `src/lib/bewerberKennenlernen.ts` nicht
 * importieren, deshalb steht der Wortlaut hier ein zweites Mal; ein Test
 * vergleicht beide.
 */
export const GESPRAECH_NAME = "Persönliches Gespräch";

/** Derselbe Name im Fließtext, etwa „dein persönliches Gespräch". */
export const GESPRAECH_NAME_KLEIN = "persönliches Gespräch";

/** Wie die Mail zu jedem der drei Vorgänge heißt und beginnt. */
export type TerminWortlaut = {
  augenbraue: string;
  titel: string;
  vorschau: string;
  betreff: string;
  /** Der erste Absatz, direkt nach der Anrede. */
  einleitung: string;
  /** Der Absatz nach dem Terminblock. Sagt, worum es im Gespräch geht. */
  worumEsGeht?: string;
  /** Der letzte Absatz. */
  schluss: string;
};

/**
 * Die drei Fassungen.
 *
 * Alle in Du-Form, wie das Kennenlernen selbst. Keine spricht von einem Anruf:
 * Im neuen Ablauf ist der reguläre Termin ein Videocall, und der Link dorthin
 * steht in der Mail.
 */
export const TERMIN_WORTLAUT: Record<TerminVorgang, TerminWortlaut> = {
  gebucht: {
    augenbraue: "Dein Termin",
    titel: "Dein Termin ist gebucht",
    vorschau: "Datum, Uhrzeit und der Link zum Videoraum.",
    betreff: `Dein ${GESPRAECH_NAME_KLEIN} ist gebucht`,
    einleitung:
      `dein ${GESPRAECH_NAME_KLEIN} ist gebucht. Hier stehen Datum und Uhrzeit noch einmal, ` +
      "die Kalenderdatei im Anhang trägt sie dir gleich ein.",
    /*
     * Der Absatz, der bisher fehlte.
     *
     * Zwischen Terminblock und Videoraum-Knopf stand nichts darüber, was in
     * dem Gespräch überhaupt passiert. Wer 45 Minuten seiner Zeit hergibt,
     * soll vorher wissen, wofür.
     */
    worumEsGeht:
      "In diesem Gespräch klären wir die letzten offenen Fragen, gehen deine Angaben " +
      "aus dem Kennenlernen durch und besprechen, wie wir gemeinsam vertrieblich " +
      "durchstarten.",
    schluss:
      "Vorbereiten musst du nichts. Wenn dir etwas dazwischenkommt, kannst du über " +
      "denselben Link verschieben oder absagen.",
  },
  verschoben: {
    augenbraue: "Dein Termin",
    titel: "Dein Termin liegt jetzt anders",
    vorschau: "Die neue Zeit, und der Link zum Videoraum.",
    betreff: `Dein ${GESPRAECH_NAME_KLEIN} hat eine neue Zeit`,
    einleitung:
      `dein ${GESPRAECH_NAME_KLEIN} ist verschoben. Die neue Zeit steht unten, und die ` +
      "Kalenderdatei im Anhang ersetzt den alten Eintrag.",
    worumEsGeht:
      "In diesem Gespräch klären wir die letzten offenen Fragen, gehen deine Angaben " +
      "aus dem Kennenlernen durch und besprechen, wie wir gemeinsam vertrieblich " +
      "durchstarten.",
    schluss:
      "Auch die neue Zeit lässt sich über denselben Link noch einmal ändern oder absagen.",
  },
  abgesagt: {
    augenbraue: "Dein Termin",
    titel: "Der Termin ist abgesagt",
    vorschau: "Alles gut. Ein neuer Termin geht jederzeit.",
    betreff: `Dein ${GESPRAECH_NAME_KLEIN} ist abgesagt`,
    einleitung:
      `dein ${GESPRAECH_NAME_KLEIN} ist abgesagt, und das ist völlig in Ordnung. Bitte trage ` +
      "es dir in deinem Kalender aus, dort bleibt es sonst stehen.",
    schluss:
      "Wenn du magst, such dir über denselben Link eine neue Zeit aus. Wir rufen dich " +
      "deswegen nicht an.",
  },
};

/** Beschriftung des Knopfes, je Vorgang. */
export const TERMIN_KNOPF: Record<TerminVorgang, string> = {
  gebucht: "Videoraum öffnen",
  verschoben: "Videoraum öffnen",
  abgesagt: "Neue Zeit aussuchen",
};

/** Die Zeile unter dem Knopf zum Videoraum. */
export const TERMIN_KNOPF_HINWEIS =
  "Der Link funktioniert im Browser, ohne Anmeldung und ohne Programm.";

/** Der Weg zum Verschieben und Absagen, als ruhiger Textlink unter dem Knopf. */
export const TERMIN_VERWALTEN_TEXT = "Verschieben oder absagen";

/**
 * Der zweite Weg in den Kalender, neben dem Anhang.
 *
 * Christians Punkt P5: Nicht jedes Postfach bietet einen `.ics`-Anhang zum
 * Eintragen an. Gmail im Browser zeigt bei einer Datei ohne METHOD:REQUEST
 * keinen Knopf, manche Android-Programme laden sie nur herunter. Der Link
 * führt auf die vorhandene Function `get-ics`, die dieselbe Datei noch einmal
 * ausliefert, diesmal als Download mit einem Klick.
 */
export const TERMIN_KALENDER_TEXT = "In meinen Kalender eintragen";

// ── Die Kalenderdatei ─────────────────────────────────────────────────────

/**
 * Ein Wert für eine ICS-Zeile. Semikolon, Komma, Backslash und Zeilenumbruch
 * haben in iCalendar eine eigene Bedeutung und müssen maskiert werden.
 */
function esc(wert: string): string {
  return (wert || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Zeitpunkt im Format, das iCalendar erwartet: 20260908T093000Z. */
export function icsZeit(iso: string): string {
  const zeitpunkt = new Date(iso);
  if (Number.isNaN(zeitpunkt.getTime())) return "";
  return zeitpunkt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Lange Zeilen umbrechen, wie RFC 5545 es verlangt.
 *
 * Über 75 Oktetts muss eine Zeile gefaltet werden: umbrechen und mit einem
 * Leerzeichen fortsetzen. Ohne das Falten verwerfen strenge Kalender die ganze
 * Datei, und die Tagesordnung aus den eigenen Angaben des Bewerbers wird
 * schnell länger als 75 Zeichen. Gezählt wird in Bytes, nicht in Zeichen: Ein
 * Umlaut belegt zwei.
 */
export function falte(zeile: string): string {
  const bytes = new TextEncoder().encode(zeile);
  if (bytes.length <= 75) return zeile;

  const teile: string[] = [];
  let aktuell = "";
  let laenge = 0;
  // Über die Zeichen laufen, nicht über die Bytes: Ein Umlaut darf nicht
  // mitten entzweigeschnitten werden.
  for (const zeichen of zeile) {
    const breite = new TextEncoder().encode(zeichen).length;
    const deckel = teile.length === 0 ? 75 : 74; // Fortsetzungen tragen ein Leerzeichen.
    if (laenge + breite > deckel) {
      teile.push(aktuell);
      aktuell = "";
      laenge = 0;
    }
    aktuell += zeichen;
    laenge += breite;
  }
  if (aktuell) teile.push(aktuell);
  return teile.map((t, i) => (i === 0 ? t : ` ${t}`)).join("\r\n");
}

export type IcsAngaben = {
  /** Überschrift des Eintrags. */
  titel: string;
  /** Beginn und Ende als ISO-Zeitpunkt. */
  startIso: string;
  endeIso: string;
  /** Was im Eintrag steht, etwa die Tagesordnung. */
  beschreibung?: string;
  /** Der Videoraum, sofern es einen gibt. */
  ort?: string;
  /**
   * Eine Absage statt einer Einladung.
   *
   * Dann traegt die Datei METHOD:CANCEL und STATUS:CANCELLED, und die
   * Kalender, die das lesen, entfernen den Eintrag von selbst. Ohne das
   * bleibt der Termin im Kalender des Bewerbers stehen, und er muss ihn von
   * Hand loeschen, worum ihn die Mail bisher auch ausdruecklich bat.
   *
   * Damit ein Kalender die Absage der Einladung zuordnet, muessen UID gleich
   * bleiben und SEQUENCE steigen. Beides liefert der Aufrufer.
   */
  absage?: boolean;
  /** Gleichbleibend über alle Fassungen desselben Termins. */
  uid: string;
  /**
   * Zähler. Beim Verschieben muss er steigen, sonst lassen Apple Kalender und
   * Outlook den alten Eintrag stehen. Dieselbe Begründung wie bei `seq` in
   * `get-ics`.
   */
  sequenz?: number;
  /** Name und Adresse des Gastgebers. */
  organisator: string;
  organisatorEmail: string;
  /** Die Adresse des Bewerbers. */
  teilnehmerEmail?: string;
};

/**
 * Die Kalenderdatei zu einem Termin.
 *
 * Bewusst als Anhang und nicht nur als Link: Ein Link auf `get-ics` verlangt
 * einen zweiten Klick und funktioniert im Flugzeug nicht. Der Anhang trägt
 * sich in Apple Mail, Gmail und Outlook mit einem Klick ein.
 */
export function baueIcs(angaben: IcsAngaben): string {
  const start = icsZeit(angaben.startIso);
  const ende = icsZeit(angaben.endeIso);
  if (!start) return "";

  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MOREImmo//Bewerberprozess//DE",
    "CALSCALE:GREGORIAN",
    angaben.absage ? "METHOD:CANCEL" : "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(angaben.uid)}`,
    `SEQUENCE:${Math.max(0, Math.floor(angaben.sequenz ?? 0))}`,
    `DTSTAMP:${icsZeit(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${ende || start}`,
    `SUMMARY:${esc(angaben.titel)}`,
    `DESCRIPTION:${esc(angaben.beschreibung || "")}`,
    `LOCATION:${esc(angaben.ort || "Online")}`,
    `ORGANIZER;CN=${esc(angaben.organisator)}:mailto:${esc(angaben.organisatorEmail)}`,
    angaben.teilnehmerEmail
      ? `ATTENDEE;CN=${esc(angaben.teilnehmerEmail)};RSVP=TRUE:mailto:${esc(angaben.teilnehmerEmail)}`
      : "",
    angaben.absage ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    // Ein Wecker fuer einen abgesagten Termin waere absurd.
    ...(angaben.absage
      ? []
      : [
          "BEGIN:VALARM",
          "TRIGGER:-PT15M",
          "ACTION:DISPLAY",
          `DESCRIPTION:${esc(angaben.titel)}`,
          "END:VALARM",
        ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return zeilen.map(falte).join("\r\n");
}

/**
 * Text als Base64, für den Anhang.
 *
 * Über `TextEncoder` und nicht über `btoa(text)` direkt: `btoa` kennt nur
 * Latin-1 und wirft beim ersten Umlaut. „Videocall mit Jürgen" hätte den
 * ganzen Versand zum Absturz gebracht.
 */
export function alsBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binaer = "";
  for (const b of bytes) binaer += String.fromCharCode(b);
  return btoa(binaer);
}

/** Der fertige Anhang, so wie `sendeVorlage` ihn erwartet. */
export function kalenderAnhang(ics: string): Array<{ filename: string; content: string; type: string }> {
  if (!ics) return [];
  return [{ filename: "videocall.ics", content: alsBase64(ics), type: "text/calendar" }];
}

/**
 * Wie der Termin im Kalender des Bewerbers heißt.
 *
 * Bewusst fest und nicht aus `buchungen.bezeichnung`: Dort steht
 * „Bewerbergespräch", so hat die Migration die Terminart angelegt, und genau
 * dieses Wort soll der Bewerber nach Entscheidung E1 nirgends mehr lesen. Die
 * Terminart umzubenennen wäre eine Migration und träfe zugleich die Anzeige im
 * CRM; hier geht es nur um den Eintrag in seinem Kalender.
 */
export const KALENDER_TITEL = `${GESPRAECH_NAME} mit MOREImmo`;

/** Woraus sich der Kalenderlink zusammensetzt. Dieselben Angaben wie die Datei. */
export type KalenderLinkAngaben = {
  /** Die Adresse der Supabase-Instanz, ohne Schrägstrich am Ende. */
  supabaseUrl: string;
  titel: string;
  startIso: string;
  endeIso: string;
  beschreibung?: string;
  ort?: string;
  uid: string;
  sequenz?: number;
  organisator?: string;
  organisatorEmail?: string;
};

/**
 * Der Link auf `get-ics`, hinter dem Knopf „In meinen Kalender eintragen".
 *
 * Die Adresse des Bewerbers steht bewusst NICHT im Link. `get-ics` kennt zwar
 * einen Parameter `att`, aber eine Mailadresse in einer Adresszeile wandert
 * durch jedes Protokoll, das der Klick unterwegs passiert. Im Anhang steht sie
 * ohnehin, und für das Eintragen in den eigenen Kalender braucht sie niemand.
 *
 * Leerer String, wenn die Zeit nicht stimmt. `Nebenhandlung` zeichnet dann
 * keinen Link, so wie `Handlung` ohne Ziel keinen Knopf zeichnet.
 */
export function kalenderLink(angaben: KalenderLinkAngaben): string {
  const start = new Date(angaben.startIso);
  const ende = new Date(angaben.endeIso || angaben.startIso);
  if (Number.isNaN(start.getTime())) return "";
  const basis = (angaben.supabaseUrl || "").trim().replace(/\/+$/, "");
  if (!basis) return "";

  const teile: Array<[string, string]> = [
    ["title", angaben.titel],
    ["start", start.toISOString()],
    ["end", (Number.isNaN(ende.getTime()) ? start : ende).toISOString()],
    ["desc", angaben.beschreibung || ""],
    ["loc", angaben.ort || "Online"],
    ["org", angaben.organisator || "MOREImmo"],
    ["orgEmail", angaben.organisatorEmail || ""],
    ["uid", angaben.uid],
  ];
  if (angaben.sequenz && angaben.sequenz > 0) teile.push(["seq", String(Math.floor(angaben.sequenz))]);

  const abfrage = teile
    .filter(([, wert]) => wert !== "")
    .map(([name, wert]) => `${name}=${encodeURIComponent(wert)}`)
    .join("&");
  return `${basis}/functions/v1/get-ics?${abfrage}`;
}

// ── Die Erinnerungen vor dem persönlichen Gespräch ─────────────────────────
//
// Drei Stufen, 24 Stunden, 6 Stunden und 1 Stunde vorher. Christians Punkt P9
// vom 07.09.2026. Bis dahin waren es zwei; die mittlere fehlte, und zwischen
// „morgen um diese Zeit" und „in einer Stunde" liegt der ganze Arbeitstag, an
// dem der Termin wieder aus dem Kopf fällt. Die Sechs-Stunden-Stufe gibt es im
// bestehenden Bewerbungsmanagement schon, sie ist also erprobt.
//
// Der Lauf `send-bewerber-erstgespraech-reminders` kannte bis zum 06.09.2026
// für alle nur 48, 6 und 1 Stunde und schickte eine Mail, die vom Anrufen
// spricht. Für ein persönliches Gespräch ist beides falsch: 48 Stunden vorher
// weiß niemand mehr, worum es ging, und angerufen wird nicht.

/** Die Abstände des neuen Ablaufs, in Stunden vor dem Termin. */
export const VIDEOCALL_ERINNERUNG_STUNDEN = [24, 6, 1] as const;

/** Die Abstände des bestehenden Bewerbungsmanagements. Unverändert. */
export const TELEFON_ERINNERUNG_STUNDEN = [48, 6, 1] as const;

export const VIDEOCALL_ERINNERUNG_AUGENBRAUE = "Erinnerung";

/** „Dein persönliches Gespräch in 24 Stunden". */
export function videocallErinnerungTitel(vorText: string): string {
  return `Dein ${GESPRAECH_NAME_KLEIN} ${vorText || "steht bevor"}`;
}

export function videocallErinnerungBetreff(vorText: string): string {
  return `Erinnerung: Dein ${GESPRAECH_NAME_KLEIN} ${vorText || "steht bevor"}`;
}

/**
 * Der erste Absatz der Erinnerung.
 *
 * Die letzte Stufe bekommt zusätzlich die Uhrzeit in Ziffern. „In einer
 * Stunde" zwingt sonst jeden dazu, selbst zu rechnen, und wer die Mail eine
 * halbe Stunde später öffnet, rechnet falsch. Eine feste Uhrzeit stimmt auch
 * dann noch.
 */
export function videocallErinnerungText(vorText: string, uhrzeit?: string, mitLink = true): string {
  const zeit = (uhrzeit || "").trim();
  const wann = zeit ? `${vorText || "in Kürze"}, heute um ${zeit} Uhr` : vorText || "in Kürze";
  if (!mitLink) {
    /*
      Seit dem 21.09.2026 wird der Termin über Calendly vereinbart, und die
      HR-Managerin trägt ihn danach von Hand im CRM ein. Dann gibt es keine
      Buchung und damit keinen Videoraum, den diese Mail verlinken könnte.

      Ohne diesen Zweig stünde hier weiter „der Link steht unten" und darunter
      nichts. Der Bewerber sucht dann einen Knopf, den es nicht gibt, und das
      ist schlimmer als ein ehrlicher Satz.
    */
    return (
      `wir sehen uns ${wann}. Den Zugang zum Videocall hast du mit der ` +
      "Terminbestätigung per Mail bekommen, schau dort noch einmal hinein. " +
      "Findest du sie nicht, sieh bitte im Spam-Ordner nach."
    );
  }
  return (
    `wir sehen uns ${wann}. Der Link zum Videoraum steht unten, er ` +
    "funktioniert im Browser, ohne Anmeldung und ohne Programm."
  );
}

/**
 * Der Schlusssatz.
 *
 * Er sagt zweierlei: dass nichts vorzubereiten ist, und wie eine Absage geht.
 * Ohne den zweiten Teil bleibt jemandem, dem etwas dazwischenkommt, nur das
 * Nichterscheinen.
 */
export const VIDEOCALL_ERINNERUNG_SCHLUSS =
  "Vorbereiten musst du nichts. Wenn es doch nicht passt, kannst du über deinen " +
  "persönlichen Link verschieben oder absagen.";

/**
 * Derselbe Schluss ohne den persönlichen Link.
 *
 * Wer über Calendly gebucht hat, verschiebt über die Bestätigungsmail von
 * Calendly. Ein Verweis auf einen persönlichen Link, den er nie bekommen hat,
 * würde ihn suchen lassen.
 */
export const VIDEOCALL_ERINNERUNG_SCHLUSS_OHNE_LINK =
  "Vorbereiten musst du nichts. Wenn es doch nicht passt, antworte kurz auf " +
  "diese Mail oder verschiebe über deine Terminbestätigung.";
