/**
 * Den Notartermin eines Investments als echten Zeitpunkt lesen.
 *
 * Die Logik liegt hier statt in der Function, weil sie drei Fallen enthaelt,
 * die man nur mit Tests im Griff behaelt:
 *
 *   1. Der Termin steht an zwei Stellen im Datensatz. `notarTermin` und
 *      `notarUhrzeit` stammen aus dem Investment-Reiter, `notarData` aus der
 *      Terminauswahl im Kundenportal. Beide werden gepflegt.
 *   2. Das Datum kommt mal als yyyy-mm-dd und mal als tt.mm.jjjj.
 *   3. Die Uhrzeit ist kein Pflichtfeld. Ohne Ersatzregel gaelte 00:00, und
 *      eine Bitte um eine Bewertung ginge um ein Uhr nachts hinaus.
 *
 * Dazu kommt die Zeitzone: Deno laeuft in UTC, der Termin ist Berliner
 * Wanduhrzeit. Ohne Umrechnung waere jede Auswertung ein bis zwei Stunden
 * daneben.
 *
 * Getestet wird von src/lib/notarZeitpunkt.test.ts, so wie bei
 * `standort-messung` und `kontakt-dublette`.
 */

/**
 * Ersatzuhrzeit, wenn am Termin keine steht. Mittags, damit alles, was daran
 * haengt, in die Bueroezeit faellt und nicht in die Nacht.
 */
export const ERSATZ_UHRZEIT = "12:00";

const BERLIN_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false,
});

/** Wie weit Berlin zu diesem Zeitpunkt vor UTC liegt, in Millisekunden. */
function versatzMs(zeitpunkt: Date): number {
  const teile = BERLIN_FORMAT
    .formatToParts(zeitpunkt)
    .reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const alsBerlin = Date.UTC(
    Number(teile.year), Number(teile.month) - 1, Number(teile.day),
    Number(teile.hour === "24" ? "0" : teile.hour), Number(teile.minute), Number(teile.second),
  );
  return alsBerlin - Math.floor(zeitpunkt.getTime() / 1000) * 1000;
}

/**
 * Datum und Uhrzeit als Berliner Wanduhrzeit lesen und den UTC-Zeitpunkt
 * liefern. Fehlt die Uhrzeit oder ist sie unbrauchbar, gilt ERSATZ_UHRZEIT.
 *
 * Der Versatz wird zweimal gemessen. An den beiden Umstellungstagen im Jahr
 * liegt die Umstellung selbst zwischen dem naiven und dem richtigen
 * Zeitpunkt, und eine einmalige Messung waere dann um eine Stunde daneben.
 * Dieselbe Rechnung steckt in send-termin-erinnerungen.
 */
export function berlinerZeitNachUtc(datumRoh: string, uhrzeit?: string): Date | null {
  if (!datumRoh) return null;
  let datum = String(datumRoh).trim();
  const de = datum.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) {
    datum = `${de[3]}-${String(+de[2]).padStart(2, "0")}-${String(+de[1]).padStart(2, "0")}`;
  }
  datum = datum.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;

  const roh = String(uhrzeit ?? "").trim();
  const zeit = /^\d{1,2}:\d{2}$/.test(roh) ? roh : ERSATZ_UHRZEIT;

  const [jahr, monat, tag] = datum.split("-").map(Number);
  const [stunde, minute] = zeit.split(":").map(Number);
  if ([jahr, monat, tag, stunde, minute].some((n) => Number.isNaN(n))) return null;
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  if (stunde > 23 || minute > 59) return null;

  const naivUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute, 0);
  const ersterVersatz = versatzMs(new Date(naivUtc));
  let ergebnis = naivUtc - ersterVersatz;
  const zweiterVersatz = versatzMs(new Date(ergebnis));
  if (zweiterVersatz !== ersterVersatz) ergebnis = naivUtc - zweiterVersatz;
  return new Date(ergebnis);
}

/**
 * Den Notartermin aus dem meta-Feld eines Investments lesen.
 *
 * Die ausdrueckliche Terminauswahl aus dem Kundenportal gewinnt, denn sie ist
 * die juengere und verbindlichere Angabe. Steht dort nichts Brauchbares,
 * greift der Eintrag aus dem Investment-Reiter.
 */
export function notarZeitpunkt(meta: Record<string, unknown> | null | undefined): Date | null {
  if (!meta) return null;
  const data = (meta.notarData ?? {}) as Record<string, unknown>;
  const kandidaten: Array<[string, string]> = [
    [String(data.datum ?? ""), String(data.uhrzeit ?? "")],
    [String(meta.notarTermin ?? ""), String(meta.notarUhrzeit ?? "")],
  ];
  for (const [datum, uhrzeit] of kandidaten) {
    if (!datum) continue;
    const zeit = berlinerZeitNachUtc(datum, uhrzeit);
    if (zeit) return zeit;
  }
  return null;
}

/**
 * Liegt der Termin im Fenster, in dem die Bewertungseinladung faellig ist?
 *
 * Nach unten schuetzt die eine Stunde davor, dass die Bitte den Kunden
 * erreicht, waehrend er noch beim Notar sitzt. Nach oben verhindert die
 * Grenze zweierlei: dass beim ersten Lauf saemtliche Bestandskunden mit lange
 * vergangenen Terminen eine Mail bekommen, und dass ein einzelner
 * ausgefallener Lauf jemanden dauerhaft verpasst.
 */
export function istEinladungFaellig(
  termin: Date | null,
  jetzt: Date,
  fruehestensStunden = 1,
  spaetestensStunden = 25,
): boolean {
  if (!termin) return false;
  const stundenHer = (jetzt.getTime() - termin.getTime()) / 3_600_000;
  return stundenHer >= fruehestensStunden && stundenHer <= spaetestensStunden;
}
