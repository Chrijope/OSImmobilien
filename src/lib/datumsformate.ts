/**
 * Datumswerte, die im Bestand in zwei Formaten vorliegen.
 *
 * `meta.zugewiesenAm` wurde historisch an zwei Stellen unterschiedlich
 * geschrieben: die Edge Function `submit-lead` und die Datenbankfunktionen
 * schreiben ISO ("2026-08-07T09:12:00Z"), das Frontend schrieb deutsches Datum
 * ("07.08.2026"). Geschrieben wird ab jetzt nur noch ISO, der Altbestand in der
 * Datenbank bleibt unangetastet.
 *
 * Deshalb muss das Lesen beide Formate vertragen. Ein `localeCompare` ueber
 * gemischte Formate sortiert rein nach dem ersten Zeichen: "07.08.2026" landet
 * vor "2026-08-07", egal welches Datum tatsaechlich frueher liegt. Genau
 * darueber ist die Sortierung "zuletzt zugewiesen" gestolpert.
 *
 * Die Anzeige fuer Nutzer bleibt deutsch, dafuer ist `formatDatum` zustaendig.
 */

/** dd.MM.yyyy, optional gefolgt von einer Uhrzeit (", 14:30" oder " 14:30"). */
const DEUTSCHES_DATUM = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?$/;
/** JJJJ-MM-TT ohne Uhrzeit. */
const ISO_KALENDERTAG = /^(\d{4})-(\d{2})-(\d{2})$/;
/** JJJJ-MM-TT mit Uhrzeit, aber ohne Zeitzone („Z“ oder „+02:00“ fehlt). */
const ISO_OHNE_ZONE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;

/** Abstand Berlin zu UTC in Millisekunden zu einem Zeitpunkt. */
function berlinerVersatz(zeitpunkt: number): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(new Date(zeitpunkt)).map((x) => [x.type, Number(x.value)]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(zeitpunkt / 1000) * 1000;
}

/**
 * Eine Uhrzeit, wie sie in Deutschland auf der Uhr steht, als Zeitpunkt.
 * Gibt `null` fuer Tage oder Uhrzeiten, die es nicht gibt (31.02., 25:00).
 *
 * Seit dem 04.10.2026. Vorher galt die Uhr des Geraets: „07.08.2026, 14:30“
 * war auf einem Rechner in Tokio 14:30 Uhr Tokioter Zeit, also 07:30 Uhr bei
 * uns, und ein reiner Kalendertag konnte in deutscher Zeit auf den Vortag
 * fallen.
 */
function ausBerlinerZeit(jahr: number, monat: number, tag: number, stunde = 0, minute = 0, sekunde = 0): Date | null {
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31 || stunde > 23 || minute > 59 || sekunde > 59) return null;
  const alsUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde);
  const pruef = new Date(alsUtc);
  // Rollt der 31.02. auf den 03.03. weiter, war die Eingabe kein echtes Datum.
  if (pruef.getUTCMonth() !== monat - 1 || pruef.getUTCDate() !== tag) return null;
  let zeitpunkt = alsUtc - berlinerVersatz(alsUtc);
  // An der Zeitumstellung stimmt der erste Versatz nicht immer, einmal nachziehen.
  zeitpunkt = alsUtc - berlinerVersatz(zeitpunkt);
  return new Date(zeitpunkt);
}

/**
 * Ein reiner Kalendertag: 12:00 Uhr deutscher Zeit an diesem Tag. Mittag,
 * damit auch eine Zeitumstellung oder ein Rechnen in Stunden den Tag nicht
 * verschiebt. Wer den Tag anzeigen will, nimmt die Datumsteile selbst, siehe
 * `formatDatumZeitFlexibel`.
 */
function kalendertag(jahr: number, monat: number, tag: number): Date | null {
  return ausBerlinerZeit(jahr, monat, tag, 12, 0, 0);
}

/**
 * Liest ISO und deutsches Datum. Gibt `null` zurueck, wenn nichts Sinnvolles
 * darin steht. Angaben ohne Zeitzone gelten als deutsche Zeit.
 *
 * Wichtig ist die Reihenfolge: `new Date("07.08.2026")` liefert in V8 ein
 * gueltiges Datum, aber das falsche (8. Juli statt 7. August, weil Punkt als
 * amerikanischer Trenner gelesen wird). Das deutsche Format muss deshalb
 * geprueft werden, bevor `new Date` ueberhaupt drankommt.
 */
export function parseDatumFlexibel(wert: string | null | undefined): Date | null {
  if (!wert) return null;
  const text = String(wert).trim();
  if (!text) return null;

  const de = DEUTSCHES_DATUM.exec(text);
  if (de) {
    const tag = Number(de[1]);
    const monat = Number(de[2]);
    const jahr = Number(de[3]);
    if (!de[4]) return kalendertag(jahr, monat, tag);
    return ausBerlinerZeit(jahr, monat, tag, Number(de[4]), Number(de[5]));
  }

  const iso = ISO_KALENDERTAG.exec(text);
  if (iso) return kalendertag(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const ohneZone = ISO_OHNE_ZONE.exec(text);
  if (ohneZone) {
    return ausBerlinerZeit(
      Number(ohneZone[1]), Number(ohneZone[2]), Number(ohneZone[3]),
      Number(ohneZone[4]), Number(ohneZone[5]), Number(ohneZone[6] ?? 0),
    );
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Sortierschluessel fuer gemischte Datumsformate. Immer ISO, damit ein
 * einfaches `localeCompare` wieder stimmt. Unlesbare oder leere Werte ergeben
 * den leeren String und landen damit wie bisher am Anfang beim Aufsteigenden
 * und am Ende beim Absteigenden.
 */
export function datumSortierwert(wert: string | null | undefined): string {
  const d = parseDatumFlexibel(wert);
  return d ? d.toISOString() : "";
}

/** Vergleich zweier gemischter Datumswerte, aufsteigend. */
export function datumVergleich(a: string | null | undefined, b: string | null | undefined): number {
  return datumSortierwert(a).localeCompare(datumSortierwert(b));
}

/** Das Format, in dem ab jetzt geschrieben wird. */
export function jetztAlsIsoDatum(): string {
  return new Date().toISOString();
}

/**
 * Anzeige fuer Nutzer: "07.08.2026, 14:30 Uhr". Liest ISO wie deutsches
 * Altformat. Ein Altwert ohne Uhrzeit (etwa "31.8.2026" aus dem Bestand)
 * bekommt keine erfundene "00:00 Uhr", sondern bleibt reines Datum.
 * Unlesbare Werte kommen als Rohtext zurueck, nie als "Invalid Date".
 */
export function formatDatumZeitFlexibel(wert: string | null | undefined): string {
  if (wert == null) return "";
  const text = String(wert).trim();
  if (!text) return "";
  const d = parseDatumFlexibel(text);
  if (!d) return text;
  const pad = (n: number | string) => String(n).padStart(2, "0");
  // Was ohne Zeitzone geschrieben wurde, zeigt die Seite so, wie es dasteht:
  // aus den Datumsteilen, ohne Umweg ueber die Uhr des Geraets.
  const de = DEUTSCHES_DATUM.exec(text);
  if (de) {
    const datum = `${pad(de[1])}.${pad(de[2])}.${de[3]}`;
    // Ein reiner Kalendertag bekommt keine erfundene Uhrzeit.
    return de[4] ? `${datum}, ${pad(de[4])}:${de[5]} Uhr` : datum;
  }
  const iso = ISO_KALENDERTAG.exec(text);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  const ohneZone = ISO_OHNE_ZONE.exec(text);
  if (ohneZone) return `${ohneZone[3]}.${ohneZone[2]}.${ohneZone[1]}, ${ohneZone[4]}:${ohneZone[5]} Uhr`;
  // Zeitpunkte mit Zone (Z oder +02:00) in deutscher Zeit, nicht in der des Geraets.
  return `${berlinDatum(d)}, ${d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" })} Uhr`;
}

/** TT.MM.JJJJ eines Zeitpunkts in deutscher Zeit. */
function berlinDatum(d: Date): string {
  return d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Nur das Datum, TT.MM.JJJJ: ein reiner Kalendertag aus seinen Datumsteilen,
 * ein Zeitpunkt in deutscher Zeit. Unlesbares kommt als Rohtext zurueck.
 */
export function formatDatumFlexibel(wert: string | null | undefined): string {
  if (wert == null) return "";
  const text = String(wert).trim();
  if (!text) return "";
  const d = parseDatumFlexibel(text);
  if (!d) return text;
  const de = DEUTSCHES_DATUM.exec(text);
  if (de) return `${de[1].padStart(2, "0")}.${de[2].padStart(2, "0")}.${de[3]}`;
  const iso = ISO_KALENDERTAG.exec(text) ?? ISO_OHNE_ZONE.exec(text);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return berlinDatum(d);
}

/**
 * Volle Tage zwischen einem Datum und jetzt, nach Kalendertagen in deutscher
 * Zeit gerechnet. Gestern 23:00 zaehlt also als 1 Tag, nicht als 0. Gibt
 * `null` zurueck, wenn der Wert nicht lesbar ist.
 */
export function tageSeit(wert: string | null | undefined, jetzt: Date = new Date()): number | null {
  const d = parseDatumFlexibel(wert);
  if (!d) return null;
  const tagNummer = (x: Date) => {
    const [j, m, t] = heuteBerlinIso(x).split("-").map(Number);
    return Date.UTC(j, m - 1, t);
  };
  return Math.round((tagNummer(jetzt) - tagNummer(d)) / 86_400_000);
}

/**
 * Heute als JJJJ-MM-TT in deutscher Zeit.
 *
 * Gedacht als Untergrenze eines Datumsfeldes. Bewusst ueber die Berliner Zeit
 * und nicht ueber die Zeitzone des Geraets: Wer aus dem Urlaub bucht, soll
 * denselben Tag sehen wie wir.
 */
export function heuteBerlinIso(jetzt: Date = new Date()): string {
  const tag = jetzt.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [t, m, j] = tag.split(".");
  return `${j}-${m}-${t}`;
}

/**
 * Der Monat eines Zeitpunkts in deutscher Zeit, als JJJJ-MM.
 *
 * Fuer Abrechnungsmonate. `toISOString().slice(0, 7)` liefert den UTC-Monat
 * und kippt in der Nacht zum Monatsersten um 00:00 bis 02:00 Uhr in den
 * Vormonat. Liest ISO wie deutsches Datum; Unlesbares ergibt "".
 */
export function monatBerlinIso(wert: string | Date = new Date()): string {
  const d = wert instanceof Date ? wert : parseDatumFlexibel(wert);
  if (!d || Number.isNaN(d.getTime())) return "";
  const tag = d.toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [, m, j] = tag.split(".");
  return `${j}-${m}`;
}

/**
 * "Dienstag, 30. September 2026" aus JJJJ-MM-TT.
 *
 * Fuer die Bestaetigung eines Termins: Der Wochentag steht dabei, weil genau an
 * ihm auffaellt, wenn sich jemand im Datum vertan hat. Ein unlesbarer Wert kommt
 * unveraendert zurueck, nie als "Invalid Date".
 */
export function langesDatumAusIso(iso: string): string {
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!treffer) return iso || "";
  const d = new Date(Number(treffer[1]), Number(treffer[2]) - 1, Number(treffer[3]));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
