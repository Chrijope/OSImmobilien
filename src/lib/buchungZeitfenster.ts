/**
 * Welche Startzeiten sind an einem Tag buchbar?
 *
 * Reine Rechenlogik ohne Datenbank, damit sie prüfbar bleibt. Der Zugriff auf
 * Supabase liegt in `buchungStore.ts`.
 *
 * Dieselbe Rechnung steht ein zweites Mal in der Datenbank, in
 * `buchung_freie_zeiten` aus der Migration `20260804090000_buchung_grundlage`.
 * Das ist Absicht und keine Doppelung aus Versehen: Die Oberfläche rechnet
 * hier, damit sie ohne Rundreise reagieren kann, und die Datenbank rechnet
 * beim Buchen noch einmal nach, weil ein Vorschlag aus dem Browser nichts
 * beweist. Wer eine der beiden ändert, muss die andere mitändern.
 *
 * Zur Zeitzone: Verfügbarkeiten sind Ortszeit ("ich arbeite ab 9 Uhr"),
 * gebuchte Termine sind Zeitpunkte. Zwischen beiden liegt die Zeitzone des
 * Mitarbeiters, und die verschiebt sich zweimal im Jahr. Deshalb wird jede
 * Uhrzeit ausdrücklich in dieser Zone in einen Zeitpunkt umgerechnet und nicht
 * einfach in der Zeitzone des Browsers, in dem der Kunde gerade sitzt.
 */

/** Eine Wochenregel: an diesem Wochentag von, bis. */
export interface Verfuegbarkeit {
  /** 0 = Sonntag bis 6 = Samstag, wie `Date.getDay()`. */
  wochentag: number;
  /** Ortszeit im Format "HH:MM". */
  von: string;
  bis: string;
}

/**
 * Eine Ausnahme für einen einzelnen Tag. Sie ersetzt die Wochenregel
 * vollständig. `geschlossen` ist der Urlaubstag.
 */
export interface Ausnahme {
  /** "YYYY-MM-DD". */
  datum: string;
  von?: string;
  bis?: string;
  geschlossen?: boolean;
}

/** Die Regeln einer Terminart, soweit sie für die Zeitfenster zählen. */
export interface TerminartRegeln {
  dauerMinuten: number;
  /** Sperrzeit unmittelbar vor dem Termin. */
  pufferVorMinuten?: number;
  /** Sperrzeit unmittelbar nach dem Termin. */
  pufferNachMinuten?: number;
  /** Wie kurzfristig darf gebucht werden. */
  vorlaufMinuten?: number;
  /** Wie weit im Voraus darf gebucht werden. */
  vorausschauTage?: number;
  /** Raster der angebotenen Startzeiten, Standard 15 Minuten. */
  rasterMinuten?: number;
}

/** Ein bereits belegter Zeitraum samt seiner eigenen Puffer. */
export interface BelegteZeit {
  start: string | Date;
  ende: string | Date;
  pufferVorMinuten?: number;
  pufferNachMinuten?: number;
}

export interface ZeitfensterEingabe {
  /** Der Tag, für den gerechnet wird, als "YYYY-MM-DD" in der Zone unten. */
  tag: string;
  /** Jetzt. Ausdrücklich übergeben, damit die Rechnung prüfbar bleibt. */
  jetzt: Date | string;
  /** Zeitzone des Mitarbeiters, etwa "Europe/Berlin". */
  zeitzone: string;
  verfuegbarkeiten: Verfuegbarkeit[];
  ausnahmen?: Ausnahme[];
  terminart: TerminartRegeln;
  belegt?: BelegteZeit[];
}

const MINUTE = 60_000;

/**
 * Wie weit die Zone zu diesem Zeitpunkt von UTC abweicht, in Millisekunden.
 *
 * `Intl` ist der einzige Weg, an die Regeln einer Zeitzone zu kommen, ohne
 * eine Bibliothek dafür aufzunehmen.
 */
function zonenVersatz(zeitpunkt: Date, zeitzone: string): number {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(zeitpunkt);

  const wert: Record<string, number> = {};
  for (const teil of teile) {
    if (teil.type !== "literal") wert[teil.type] = Number(teil.value);
  }
  const alsUtc = Date.UTC(wert.year, wert.month - 1, wert.day, wert.hour, wert.minute, wert.second);
  return alsUtc - zeitpunkt.getTime();
}

/**
 * Aus Datum und Ortszeit einen echten Zeitpunkt machen.
 *
 * In zwei Schritten, weil der Versatz selbst vom Zeitpunkt abhängt: Die erste
 * Schätzung kann bei einer Zeitumstellung um eine Stunde danebenliegen, die
 * zweite korrigiert das.
 */
export function alsZeitpunkt(datum: string, minutenAbMitternacht: number, zeitzone: string): Date {
  const [jahr, monat, tag] = datum.split("-").map(Number);
  const naiv = Date.UTC(jahr, monat - 1, tag, 0, minutenAbMitternacht);

  const ersterVersuch = new Date(naiv - zonenVersatz(new Date(naiv), zeitzone));
  const versatz = zonenVersatz(ersterVersuch, zeitzone);
  return new Date(naiv - versatz);
}

/** "09:30" zu 570. Ungültiges ergibt null. */
export function minutenAusUhrzeit(uhrzeit: string | undefined | null): number | null {
  if (!uhrzeit) return null;
  const treffer = /^(\d{1,2}):(\d{2})/.exec(uhrzeit.trim());
  if (!treffer) return null;
  const stunden = Number(treffer[1]);
  const minuten = Number(treffer[2]);
  if (stunden > 24 || minuten > 59) return null;
  return stunden * 60 + minuten;
}

/** Der Wochentag eines Datums, unabhängig von der Zeitzone des Browsers. */
export function wochentagVon(datum: string): number {
  const [jahr, monat, tag] = datum.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay();
}

interface Fenster {
  vonMinuten: number;
  bisMinuten: number;
}

/**
 * Die verfügbaren Fenster eines Tages. Eine Ausnahme für diesen Tag ersetzt
 * die Wochenregeln vollständig, auch wenn sie den Tag ganz schließt.
 */
function fensterDesTages(eingabe: ZeitfensterEingabe): Fenster[] {
  const ausnahmen = (eingabe.ausnahmen ?? []).filter((a) => a.datum === eingabe.tag);

  const quelle: Array<{ von?: string; bis?: string; geschlossen?: boolean }> =
    ausnahmen.length > 0
      ? ausnahmen
      : eingabe.verfuegbarkeiten.filter((v) => v.wochentag === wochentagVon(eingabe.tag));

  const fenster: Fenster[] = [];
  for (const eintrag of quelle) {
    if (eintrag.geschlossen) continue;
    const von = minutenAusUhrzeit(eintrag.von);
    const bis = minutenAusUhrzeit(eintrag.bis);
    if (von === null || bis === null || bis <= von) continue;
    fenster.push({ vonMinuten: von, bisMinuten: bis });
  }
  return fenster.sort((a, b) => a.vonMinuten - b.vonMinuten);
}

function alsDatum(wert: string | Date): Date {
  return wert instanceof Date ? wert : new Date(wert);
}

/**
 * Die buchbaren Startzeiten eines Tages, als ISO-Zeitpunkte.
 *
 * Berücksichtigt in dieser Reihenfolge: Verfügbarkeit des Tages, ob die Dauer
 * überhaupt noch ins Fenster passt, Vorlaufzeit und Vorausschau, und zuletzt
 * die bereits belegten Zeiten samt Puffern auf beiden Seiten.
 */
export function berechneZeitfenster(eingabe: ZeitfensterEingabe): string[] {
  const regeln = eingabe.terminart;
  const dauer = Math.round(regeln.dauerMinuten);
  if (!Number.isFinite(dauer) || dauer <= 0) return [];

  const raster = Math.round(regeln.rasterMinuten ?? 15);
  if (!Number.isFinite(raster) || raster <= 0) return [];

  const pufferVor = Math.max(0, Math.round(regeln.pufferVorMinuten ?? 0));
  const pufferNach = Math.max(0, Math.round(regeln.pufferNachMinuten ?? 0));

  const fenster = fensterDesTages(eingabe);
  if (fenster.length === 0) return [];

  const jetzt = alsDatum(eingabe.jetzt).getTime();
  const frueheste = jetzt + Math.max(0, regeln.vorlaufMinuten ?? 0) * MINUTE;
  const spaeteste = jetzt + Math.max(1, regeln.vorausschauTage ?? 60) * 24 * 60 * MINUTE;

  // Belegte Zeiten einmal in Zahlen umrechnen, damit die innere Schleife
  // nicht ständig Datumsobjekte baut.
  const belegt = (eingabe.belegt ?? [])
    .map((b) => ({
      von: alsDatum(b.start).getTime() - Math.max(0, b.pufferVorMinuten ?? 0) * MINUTE,
      bis: alsDatum(b.ende).getTime() + Math.max(0, b.pufferNachMinuten ?? 0) * MINUTE,
    }))
    .filter((b) => Number.isFinite(b.von) && Number.isFinite(b.bis) && b.bis > b.von);

  const startzeiten: string[] = [];

  for (const f of fenster) {
    const fensterEnde = alsZeitpunkt(eingabe.tag, f.bisMinuten, eingabe.zeitzone).getTime();

    for (let minute = f.vonMinuten; ; minute += raster) {
      // Sicherung gegen eine Endlosschleife, falls eine Zeitzone einmal etwas
      // Unerwartetes tut. Ein Fenster über mehr als einen Tag gibt es nicht.
      if (minute > f.vonMinuten + 24 * 60) break;

      const start = alsZeitpunkt(eingabe.tag, minute, eingabe.zeitzone).getTime();
      const ende = start + dauer * MINUTE;
      // Über eine Zeitumstellung hinweg wächst oder schrumpft ein Fenster in
      // echten Minuten. Deshalb entscheidet der Zeitpunkt, nicht die Uhrzeit.
      if (ende > fensterEnde) break;

      if (start < frueheste || start > spaeteste) continue;

      const blockVon = start - pufferVor * MINUTE;
      const blockBis = ende + pufferNach * MINUTE;
      const kollision = belegt.some((b) => b.von < blockBis && b.bis > blockVon);
      if (kollision) continue;

      startzeiten.push(new Date(start).toISOString());
    }
  }

  // Mehrere Fenster am selben Tag können sich überschneiden, etwa vormittags
  // und nachmittags mit einer Überlappung. Doppelte Startzeiten wären für den
  // Buchenden verwirrend.
  return Array.from(new Set(startzeiten)).sort();
}
