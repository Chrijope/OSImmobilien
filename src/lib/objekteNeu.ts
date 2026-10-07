/**
 * Das Kennzeichen "Neu" in der Objektuebersicht.
 *
 * Christians Wunsch vom 23.09.2026: Legt der Investagon-Import ein Objekt neu
 * an, soll jeder Nutzer es als neu erkennen. Das Kennzeichen verschwindet
 * sieben Tage, nachdem der jeweilige Nutzer das Objekt zum ersten Mal in der
 * Uebersicht gesehen hat. Neue Objekte stehen im Gesamtportfolio vorn.
 *
 * Hier stehen nur reine Regeln ohne Zustand, damit jede Grenze pruefbar ist.
 * Das Merken je Nutzer macht `useObjekteNeu`.
 *
 * WOHER "NEU ANGELEGT" KOMMT
 *
 * Der Import setzt `meta.investagonNeuAngelegtAm` (ISO-Zeitpunkt) nur beim
 * Neuanlegen, nie beim Abgleich. Alle Objekte von vor dieser Regel haben den
 * Schluessel nicht und sind deshalb nie neu. Das ist gewollt: Sonst stuende
 * am ersten Tag der ganze Bestand als neu da.
 *
 * ZWEITER WEG: NEU IN INVESTAGON (Christian, 23.09.2026)
 *
 * Investagon zeigt auf seinen Kacheln selbst ein „NEU“. Ein Feld dafuer hat
 * die API nicht, nur das Anlagedatum der Einheiten (`created_at`). Der Import
 * legt das frueheste davon als `meta.investagonErstelltAm` ans Objekt, siehe
 * `projektErstelltAm` im Import. Ein Objekt ist dann neu, wenn EINER der
 * beiden Wege greift:
 *
 *   1. Investagon: Das Anlagedatum dort ist hoechstens sieben Tage her. Die
 *      sieben Tage zaehlen ab diesem Datum statt ab dem ersten Sehen, fuer
 *      alle Nutzer gleich, und auch fuer Objekte, die schon vor der
 *      Neu-Regel im CRM lagen.
 *   2. CRM wie bisher: vom Import angelegt, hoechstens 30 Tage her, und fuer
 *      diesen Nutzer hoechstens sieben Tage nach dem ersten Sehen.
 *
 * Endet Weg 1, endet „Neu“, ausser Weg 2 greift noch.
 */

/** Der Schluessel in `objekte.meta`, den der Import beim Neuanlegen setzt. */
export const NEU_ANGELEGT_META_SCHLUESSEL = "investagonNeuAngelegtAm";

/**
 * Der Schluessel in `objekte.meta`, unter dem der Import das Anlagedatum aus
 * Investagon ablegt. Muss `INVESTAGON_ERSTELLT_META_SCHLUESSEL` im Import
 * entsprechen, das prueft `objekteNeu.test.ts`.
 */
export const INVESTAGON_ERSTELLT_META_SCHLUESSEL = "investagonErstelltAm";

/** Der Schluessel in `user_settings.einstellungen`: Objektkennung zu ISO-Zeitpunkt. */
export const ERST_GESEHEN_SCHLUESSEL = "objekteNeuErstGesehen";

const TAG_MS = 24 * 60 * 60 * 1000;

/**
 * Wie lange nach dem Anlegen ein Objekt ueberhaupt neu sein kann.
 *
 * Schutz fuer spaet Dazugekommene: Ein Partner, der erst in drei Monaten
 * startet, hat keines der Objekte gesehen. Ohne diese Grenze stuende fuer ihn
 * alles der letzten Monate als neu da.
 */
export const NEU_HOECHSTENS_TAGE_NACH_ANLAGE = 30;

/** Wie lange das Kennzeichen nach dem ersten Sehen stehen bleibt. */
export const NEU_TAGE_NACH_ERSTEM_SEHEN = 7;

/**
 * Wie lange ein Objekt nach seinem Anlagedatum in Investagon neu ist. Dieselben
 * sieben Tage, nur ab einem anderen Beginn. Welche Frist Investagon fuer sein
 * eigenes „NEU“ nimmt, ist nicht dokumentiert.
 */
export const NEU_TAGE_AB_INVESTAGON_DATUM = NEU_TAGE_NACH_ERSTEM_SEHEN;

/**
 * Nach so vielen Tagen fliegt ein Eintrag aus der Merkliste. Etwas mehr als
 * die 30 Tage oben: Ein aelterer Eintrag kann kein Objekt mehr betreffen, das
 * noch neu sein koennte. So bleibt die Liste klein.
 */
export const ERST_GESEHEN_AUFRAEUMEN_NACH_TAGEN = 40;

/**
 * Wie weit ein Anlagezeitpunkt in der Zukunft liegen darf. Die Uhr des
 * Rechners kann gegen die des Servers etwas nachgehen, das soll kein Objekt
 * verstecken. Ein Wert weit in der Zukunft ist dagegen kaputt und darf nicht
 * wochenlang oben kleben.
 */
const ZUKUNFT_TOLERANZ_MS = TAG_MS;

/** Objektkennung zu ISO-Zeitpunkt des ersten Sehens. */
export type ErstGesehen = Record<string, string>;

/** Was die Regel von einem Objekt braucht. */
export interface NeuPruefbar {
  id: string;
  meta?: Record<string, unknown> | null;
}

/** Ein ISO-Zeitpunkt als Millisekunden, oder `null`, wenn er nicht lesbar ist. */
function zeitpunkt(wert: unknown): number | null {
  if (typeof wert !== "string" || wert.trim() === "") return null;
  const ms = Date.parse(wert);
  return Number.isFinite(ms) ? ms : null;
}

/** Wann der Import das Objekt neu angelegt hat, oder `null`. */
export function neuAngelegtAm(objekt: NeuPruefbar): number | null {
  const meta = objekt.meta;
  if (!meta || typeof meta !== "object") return null;
  return zeitpunkt(meta[NEU_ANGELEGT_META_SCHLUESSEL]);
}

/** Wann Investagon das Objekt angelegt hat, oder `null`. */
export function investagonErstelltAm(objekt: NeuPruefbar): number | null {
  const meta = objekt.meta;
  if (!meta || typeof meta !== "object") return null;
  return zeitpunkt(meta[INVESTAGON_ERSTELLT_META_SCHLUESSEL]);
}

/**
 * Weg 1: Fuehrt Investagon das Objekt als neu? Dann dessen Anlagedatum, sonst
 * `null`. Ein Datum weit in der Zukunft gilt als kaputt, wie beim CRM-Weg.
 */
function neuInInvestagonSeit(objekt: NeuPruefbar, jetzt: number): number | null {
  const erstellt = investagonErstelltAm(objekt);
  if (erstellt === null) return null;
  if (erstellt - jetzt > ZUKUNFT_TOLERANZ_MS) return null;
  return jetzt - erstellt <= NEU_TAGE_AB_INVESTAGON_DATUM * TAG_MS ? erstellt : null;
}

/**
 * Kann das Objekt fuer irgendeinen Nutzer neu sein? Das haengt nur am
 * Anlegen: Schluessel vorhanden, lesbar, hoechstens 30 Tage her.
 */
function kommtInFrage(angelegtAm: number | null, jetzt: number): angelegtAm is number {
  if (angelegtAm === null) return false;
  if (angelegtAm - jetzt > ZUKUNFT_TOLERANZ_MS) return false;
  return jetzt - angelegtAm <= NEU_HOECHSTENS_TAGE_NACH_ANLAGE * TAG_MS;
}

/**
 * Weg 2, die bisherige Regel: Das Objekt kommt in Frage (siehe oben) UND der
 * Nutzer hat es entweder noch nie gesehen, oder das erste Sehen ist
 * hoechstens sieben Tage her. Dann der Anlagezeitpunkt im CRM, sonst `null`.
 */
function neuImCrmSeit(objekt: NeuPruefbar, erstGesehen: ErstGesehen, jetzt: number): number | null {
  const angelegtAm = neuAngelegtAm(objekt);
  if (!kommtInFrage(angelegtAm, jetzt)) return null;
  const gesehen = zeitpunkt(erstGesehen[objekt.id]);
  if (gesehen === null) return angelegtAm;
  return jetzt - gesehen <= NEU_TAGE_NACH_ERSTEM_SEHEN * TAG_MS ? angelegtAm : null;
}

/**
 * Ist das Objekt fuer diesen Nutzer neu? Ja, wenn einer der beiden Wege aus
 * dem Kopf dieser Datei greift. Alle Grenzen zaehlen einschliesslich.
 */
export function istNeuFuerNutzer(objekt: NeuPruefbar, erstGesehen: ErstGesehen, jetzt: number): boolean {
  return neuSeit(objekt, erstGesehen, jetzt) !== null;
}

/**
 * Seit wann das Objekt fuer diesen Nutzer neu ist, sonst `null`. Die Zahl
 * braucht die Sortierung: das juengste Anlegen zuerst.
 *
 * Greifen beide Wege, zaehlt der juengere Zeitpunkt. Das ist in aller Regel
 * das Anlegen im CRM, weil der Import nach Investagon kommt. So bleibt die
 * Reihenfolge stehen, wenn Weg 1 vor Weg 2 ablaeuft, statt dass das Objekt
 * dann springt.
 */
export function neuSeit(objekt: NeuPruefbar, erstGesehen: ErstGesehen, jetzt: number): number | null {
  const ausInvestagon = neuInInvestagonSeit(objekt, jetzt);
  const imCrm = neuImCrmSeit(objekt, erstGesehen, jetzt);
  if (ausInvestagon === null) return imCrm;
  if (imCrm === null) return ausInvestagon;
  return Math.max(ausInvestagon, imCrm);
}

/**
 * Liest die Merkliste aus den Nutzereinstellungen.
 *
 * Die JSON-Spalte kann alles enthalten. Nur ein echtes Objekt zaehlt, und
 * darin nur Eintraege mit lesbarem Zeitpunkt. Ein kaputter Eintrag gilt als
 * "noch nie gesehen": Das Kennzeichen erscheint dann eher einmal zu viel als
 * gar nicht, und beim naechsten Schreiben wird der Eintrag ersetzt.
 */
export function leseErstGesehen(wert: unknown): ErstGesehen {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return {};
  const ergebnis: ErstGesehen = {};
  for (const [id, zeit] of Object.entries(wert as Record<string, unknown>)) {
    if (id && typeof zeit === "string" && zeitpunkt(zeit) !== null) ergebnis[id] = zeit;
  }
  return ergebnis;
}

/**
 * Traegt das erste Sehen fuer angezeigte Objekte ein.
 *
 * Eingetragen wird nur, was ueberhaupt neu sein kann und noch keinen Eintrag
 * hat. Alles andere wuerde die Liste mit dem ganzen Bestand fuellen. Das
 * betrifft nur Weg 2: Weg 1 zaehlt ab dem Datum aus Investagon und braucht
 * kein erstes Sehen.
 *
 * Gibt `null` zurueck, wenn kein Eintrag dazukommt. Dann wird nicht
 * geschrieben, auch wenn es etwas aufzuraeumen gaebe: Aufgeraeumt wird nur
 * beim Schreiben, sonst schriebe jeder Seitenaufruf.
 */
export function merkeErstesSehen(
  bisher: ErstGesehen,
  angezeigt: readonly NeuPruefbar[],
  jetzt: number,
): ErstGesehen | null {
  const grenze = jetzt - ERST_GESEHEN_AUFRAEUMEN_NACH_TAGEN * TAG_MS;
  const naechste: ErstGesehen = {};
  for (const [id, zeit] of Object.entries(bisher)) {
    const ms = zeitpunkt(zeit);
    if (ms !== null && ms >= grenze) naechste[id] = zeit;
  }
  const jetztIso = new Date(jetzt).toISOString();
  let dazu = false;
  for (const objekt of angezeigt) {
    if (naechste[objekt.id]) continue;
    if (!kommtInFrage(neuAngelegtAm(objekt), jetzt)) continue;
    naechste[objekt.id] = jetztIso;
    dazu = true;
  }
  return dazu ? naechste : null;
}

/**
 * Stellt neue Objekte nach vorn, das juengste Anlegen zuerst. Alle anderen
 * behalten ihre Reihenfolge, und bei gleichem Zeitpunkt bleibt die bisherige
 * Folge stehen.
 */
export function neueZuerst<T>(objekte: readonly T[], neuSeitVon: (objekt: T) => number | null): T[] {
  const neue: { objekt: T; seit: number; platz: number }[] = [];
  const uebrige: T[] = [];
  objekte.forEach((objekt, platz) => {
    const seit = neuSeitVon(objekt);
    if (seit === null) uebrige.push(objekt);
    else neue.push({ objekt, seit, platz });
  });
  neue.sort((a, b) => b.seit - a.seit || a.platz - b.platz);
  return [...neue.map((n) => n.objekt), ...uebrige];
}
