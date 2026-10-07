/**
 * Zahlen, Beträge, Datum und Uhrzeit in der Sprache des Kunden.
 *
 * Eine Quelle für Browser und Edge Functions. Der Browser liest diese Datei
 * über `src/lib/sprachFormat.ts`, die Functions importieren sie direkt. Deshalb
 * darf hier nichts stehen, was nur in Deno oder nur im Browser läuft.
 *
 * Entschieden am 25.09.2026 (Plan Kundensprache, Entscheidung 9):
 *   - Englisch ist britisch (`en-GB`): 1,234.56. Das Datum steht als
 *     „25 Sep 2026“, weil 25/09/2026 zwischen UK und USA verwechselt wird.
 *   - Beträge bleiben immer in Euro, nur die Schreibweise wechselt:
 *     Deutsch „1.234 €“, Englisch „€1,234“.
 *   - Zweisprachige Rechtsdokumente bleiben im deutschen Format. Das
 *     entscheidet der Aufrufer, indem er dort „de“ übergibt.
 *
 * Monats- und Tagesnamen stehen als feste Liste im Code, nicht aus `Intl`.
 * Grund: Die ICU-Daten unterscheiden sich zwischen Browsern, Node und Deno.
 * Neuere Fassungen schreiben für September im britischen Englisch „Sept“,
 * ältere „Sep“. Eine Mail und ein PDF zum selben Termin sollen gleich
 * aussehen, egal wo sie entstehen.
 *
 * Datum und Uhrzeit gelten in deutscher Zeit (Europe/Berlin). Die Edge
 * Functions laufen in UTC; ohne feste Zeitzone stünde in der Mail eine andere
 * Uhrzeit als im CRM.
 *
 * Rechenkerne dürfen formatierte Texte nie zurücklesen. Wer eine Zahl
 * braucht, rechnet mit der Zahl und formatiert erst ganz am Ende.
 */

export type FormatSprache = "de" | "en";

/** Die Locale je Sprache, für Aufrufer, die `toLocaleString` selbst brauchen. */
export const SPRACH_LOCALE: Record<FormatSprache, string> = { de: "de-DE", en: "en-GB" };

/** Die Zeitzone, in der Termine gemeint sind. */
export const STANDARD_ZEITZONE = "Europe/Berlin";

function sprache(wert: FormatSprache | string | null | undefined): FormatSprache {
  return wert === "en" ? "en" : "de";
}

/* ── Zahlen und Beträge ─────────────────────────────────────── */

/** Zahl im Format der Sprache: „4.000,5“ oder „4,000.5“. Ungültiges gilt als 0. */
export function zahlText(wert: number, spr: FormatSprache, nachkomma = 0): string {
  return (Number.isFinite(wert) ? wert : 0).toLocaleString(SPRACH_LOCALE[sprache(spr)], {
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  });
}

/**
 * Eurobetrag im Format der Sprache.
 *
 * Deutsch „4.000 €“, Englisch mit vorangestelltem Zeichen „€4,000“, negativ
 * „−€354“. Das Minus ist das echte Minuszeichen, kein Bindestrich.
 */
export function euroText(wert: number, spr: FormatSprache, nachkomma = 0): string {
  const zahl = Number.isFinite(wert) ? wert : 0;
  const betrag = zahlText(Math.abs(zahl), spr, nachkomma);
  const minus = zahl < 0 ? "−" : "";
  return sprache(spr) === "en" ? `${minus}€${betrag}` : `${minus}${betrag} €`;
}

/** Prozentwert: „3,0 %“ auf Deutsch, „3.0%“ auf Englisch. */
export function prozentText(wert: number, spr: FormatSprache, nachkomma = 1): string {
  const zahl = zahlText(wert, spr, nachkomma);
  return sprache(spr) === "en" ? `${zahl}%` : `${zahl} %`;
}

/* ── Datum und Uhrzeit ──────────────────────────────────────── */

const MONATE_KURZ_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONATE_LANG_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONATE_LANG_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];
/** Sonntag zuerst, wie `Date.getUTCDay`. */
const TAGE_DE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const TAGE_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type DatumEingabe = Date | string | number | null | undefined;

interface Teile {
  jahr: number;
  monat: number; // 1 bis 12
  tag: number;
  stunde: number;
  minute: number;
  wochentag: number; // 0 = Sonntag
}

/**
 * Macht aus der Eingabe einen Zeitpunkt.
 *
 * Ein reines Datum („2026-09-25“ oder „25.09.2026“) wird auf 12 Uhr UTC
 * gelegt. So bleibt es in jeder Zeitzone derselbe Kalendertag, auch an den
 * Tagen der Zeitumstellung.
 */
function zeitpunkt(wert: DatumEingabe): Date | null {
  if (wert === null || wert === undefined || wert === "") return null;
  if (wert instanceof Date) return Number.isNaN(wert.getTime()) ? null : wert;
  if (typeof wert === "number") {
    const d = new Date(wert);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = String(wert).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

function teile(d: Date, zeitzone: string): Teile {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: zeitzone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const wert = (typ: string) => Number(fmt.formatToParts(d).find((t) => t.type === typ)?.value ?? "0");
  const jahr = wert("year");
  const monat = wert("month");
  const tag = wert("day");
  // Der Wochentag aus dem Kalendertag in der Zielzone, nicht aus UTC.
  const wochentag = new Date(Date.UTC(jahr, monat - 1, tag, 12)).getUTCDay();
  return { jahr, monat, tag, stunde: wert("hour") % 24, minute: wert("minute"), wochentag };
}

const zwei = (n: number) => String(n).padStart(2, "0");

/**
 * Kurzes Datum: Deutsch „25.09.2026“, Englisch „25 Sep 2026“.
 * Ungültiges oder Leeres ergibt einen leeren Text.
 */
export function datumText(wert: DatumEingabe, spr: FormatSprache, zeitzone = STANDARD_ZEITZONE): string {
  const d = zeitpunkt(wert);
  if (!d) return "";
  const t = teile(d, zeitzone);
  return sprache(spr) === "en"
    ? `${t.tag} ${MONATE_KURZ_EN[t.monat - 1]} ${t.jahr}`
    : `${zwei(t.tag)}.${zwei(t.monat)}.${t.jahr}`;
}

/**
 * Langes Datum, etwa für Mails: Deutsch „25. September 2026“, Englisch
 * „25 September 2026“. Mit `wochentag` davor „Freitag, 25. September 2026“
 * bzw. „Friday, 25 September 2026“.
 */
export function datumLangText(
  wert: DatumEingabe,
  spr: FormatSprache,
  opts: { wochentag?: boolean; zeitzone?: string } = {},
): string {
  const d = zeitpunkt(wert);
  if (!d) return "";
  const t = teile(d, opts.zeitzone ?? STANDARD_ZEITZONE);
  if (sprache(spr) === "en") {
    const datum = `${t.tag} ${MONATE_LANG_EN[t.monat - 1]} ${t.jahr}`;
    return opts.wochentag ? `${TAGE_EN[t.wochentag]}, ${datum}` : datum;
  }
  const datum = `${t.tag}. ${MONATE_LANG_DE[t.monat - 1]} ${t.jahr}`;
  return opts.wochentag ? `${TAGE_DE[t.wochentag]}, ${datum}` : datum;
}

/** Uhrzeit im 24-Stunden-Format, in beiden Sprachen „14:30“. */
export function uhrzeitText(wert: DatumEingabe, _spr: FormatSprache, zeitzone = STANDARD_ZEITZONE): string {
  const d = zeitpunkt(wert);
  if (!d) return "";
  const t = teile(d, zeitzone);
  return `${zwei(t.stunde)}:${zwei(t.minute)}`;
}

/** Datum mit Uhrzeit: Deutsch „25.09.2026, 14:30 Uhr“, Englisch „25 Sep 2026, 14:30“. */
export function datumUhrzeitText(wert: DatumEingabe, spr: FormatSprache, zeitzone = STANDARD_ZEITZONE): string {
  const datum = datumText(wert, spr, zeitzone);
  if (!datum) return "";
  const uhr = uhrzeitText(wert, spr, zeitzone);
  return sprache(spr) === "en" ? `${datum}, ${uhr}` : `${datum}, ${uhr} Uhr`;
}
