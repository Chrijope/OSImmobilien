/**
 * Central data cache that syncs with Supabase + Realtime.
 * - On app init: loads the tables of the start route, then the core pages,
 *   then the rest at idle (see routenTabellen.ts); every other table is
 *   loaded when a page asks for it (`ladeTabellen`)
 * - Reads: synchronous from memory cache
 * - Writes: update memory + AWAIT DB write
 * - Realtime: subscribes to postgres_changes and auto-updates cache
 * - Testaccount: uses localStorage only, never touches DB
 */
import { supabase } from "@/integrations/supabase/client";
import { isTestAccount } from "./dbStoreHelper";
import { BEWERBERPROZESS_ROLLEN } from "./bewerberprozessFreigabe";
import { toast } from "sonner";
import {
  neuerFlutschutzZustand,
  flutschutzEreignis,
  flutschutzRuhe,
  RUHEPHASE_MS,
  type FlutschutzZustand,
} from "./realtimeFlutschutz";

const db = supabase as any;

/**
 * Ladezeiten-Protokoll in der Browser-Konsole, je Tabelle Dauer und
 * Zeilenzahl, dazu die Stufen des Startplans und die Wartezeit einer Seite.
 *
 * Aktiv im Dev-Modus (auch in der Lovable-Vorschau) oder wenn in der
 * Konsole einmal `localStorage.setItem("crm.ladezeiten", "1")` gesetzt
 * wurde. So lassen sich die Zahlen direkt in der Vorschau ablesen, ohne
 * dass in der veroeffentlichten Fassung etwas geloggt wird.
 */
export function ladezeitenAktiv(): boolean {
  try {
    if (localStorage.getItem("crm.ladezeiten") === "1") return true;
  } catch { /* kein localStorage */ }
  return !!import.meta.env?.DEV;
}

const _ladezeitStart = typeof performance !== "undefined" ? performance.now() : 0;

function jetztMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/** Schreibt eine Zeile ins Ladezeiten-Protokoll, mit Zeit seit App-Start. */
export function ladezeitLoggen(text: string): void {
  if (!ladezeitenAktiv()) return;
  const seitStart = Math.round(jetztMs() - _ladezeitStart);
  console.info(`[Ladezeiten +${seitStart} ms] ${text}`);
}

/**
 * Klartextname einer Tabelle für Fehlermeldungen.
 *
 * Vorher stand in der Meldung der Datenbank-Tabellenname: "Speichern
 * fehlgeschlagen (kontakte)". Wer das im Kundentermin liest, weiss weder was
 * betroffen ist noch ob seine Eingabe verloren ist. Die optimistische
 * Aenderung wird naemlich zurueckgerollt, der Text verschwindet also vor
 * seinen Augen.
 */
const TABELLEN_KLARTEXT: Record<string, string> = {
  kontakte: "Der Kontakt",
  investments: "Das Investment",
  aktivitaeten: "Die Aktivität",
  aufgaben: "Die Aufgabe",
  notizen: "Die Notiz",
  objekte: "Das Objekt",
  wohnungen: "Die Wohnung",
  finanzierungen: "Die Finanzierung",
  dokumente: "Das Dokument",
  termine: "Der Termin",
  follow_ups: "Der Follow-Up",
  benachrichtigungen: "Die Benachrichtigung",
  user_settings: "Die Einstellung",
  emails: "Die E-Mail",
  anrufe: "Der Anruf",
  bewerber: "Der Bewerber",
  mieter: "Der Mieter",
};

function bezeichnung(table: string): string {
  return TABELLEN_KLARTEXT[table] || "Der Eintrag";
}

/**
 * Einheitliche Fehlermeldung für fehlgeschlagene Schreibvorgänge.
 *
 * Sagt, was betroffen ist, dass die Eingabe noch da ist, und bietet einen
 * neuen Versuch an. Der Wiederholungsknopf erscheint nur, wenn der Aufrufer
 * weiss, wie er es erneut versuchen kann.
 */
function schreibfehlerMelden(table: string, aktion: string, erneut?: () => void, fehler?: unknown) {
  if (istAbgelehnt(fehler)) {
    // Kein neuer Versuch anbieten: Die Datenbank hat bewusst abgelehnt.
    toast.error(`${bezeichnung(table)} wurde nicht ${aktion}.`, {
      description: (fehler as Error).message,
    });
    return;
  }
  toast.error(`${bezeichnung(table)} konnte nicht ${aktion} werden.`, {
    description: "Deine Eingabe ist noch da. Bitte in ein paar Sekunden erneut versuchen.",
    ...(erneut ? { action: { label: "Erneut versuchen", onClick: erneut } } : {}),
  });
}

/**
 * Stille Ablehnung durch die Datenbank.
 *
 * Eine Zeilenregel, die ein UPDATE oder DELETE nicht erlaubt, meldet keinen
 * Fehler, sie trifft einfach null Zeilen. Ein Wächter-Auslöser, der still
 * den alten Wert zurücksetzt (etwa `pipeline_abschluss_schuetzen`), ändert
 * die Zeile, aber nicht den Wert. In beiden Fällen sah die Oberfläche bis
 * zum 04.10.2026 „gespeichert“. Seitdem schreiben `cacheUpdate` und
 * `cacheDelete` mit Rückgabe und werfen diesen Fehler.
 */
export const ABGELEHNT_CODE = "SCHREIBEN_ABGELEHNT";

export class SchreibenAbgelehnt extends Error {
  code = ABGELEHNT_CODE;
  /** Felder, die die Datenbank nicht übernommen hat. Leer: nichts geändert. */
  felder: string[];
  constructor(message: string, felder: string[] = []) {
    super(message);
    this.name = "SchreibenAbgelehnt";
    this.felder = felder;
  }
}

export function istAbgelehnt(fehler: unknown): fehler is SchreibenAbgelehnt {
  return !!fehler && typeof fehler === "object" && (fehler as { code?: unknown }).code === ABGELEHNT_CODE;
}

/** Vergleich ohne Rücksicht auf die Reihenfolge der Schlüssel (jsonb sortiert sie um). */
export function gleicherWert(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return (a ?? null) === (b ?? null);
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => gleicherWert(x, bb[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const schluessel = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of schluessel) {
    // Ein fehlender Schlüssel und undefined zählen gleich: JSON kennt kein undefined.
    if (!gleicherWert(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Steckt `soll` in `ist`? Bei Objekten genügt es, wenn jeder geschickte
 * Schlüssel angekommen ist: `merge_kontakt_meta` führt verschachtelte
 * Objekte zusammen, dort bleiben ältere Unterschlüssel stehen.
 */
function enthalten(soll: unknown, ist: unknown): boolean {
  if (soll && ist && typeof soll === "object" && typeof ist === "object" && !Array.isArray(soll) && !Array.isArray(ist)) {
    const s = soll as Record<string, unknown>;
    const i = ist as Record<string, unknown>;
    return Object.keys(s).every((k) => s[k] === undefined || enthalten(s[k], i[k]));
  }
  return gleicherWert(soll, ist);
}

/** Zeitstempel kommen mit anderem Format zurück, als sie geschickt wurden. Nicht vergleichen. */
const ZEITSTEMPEL = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * Welche gewollten Änderungen hat die Datenbank nicht übernommen?
 *
 * Verglichen wird nur, was sich gegenüber dem bisherigen Stand ändern
 * sollte. Bei `meta` je Schlüssel, damit ein Wächter, der einen einzelnen
 * Schlüssel festhält, auffällt, ohne dass alte, unveränderte Schlüssel
 * Fehlalarm geben. Spalten mit Zeitstempel bleiben außen vor.
 */
export function nichtUebernommeneFelder(
  updates: Record<string, unknown>,
  vorher: Record<string, unknown> | null,
  zurueck: Record<string, unknown>,
): string[] {
  const felder: string[] = [];
  for (const [spalte, wert] of Object.entries(updates)) {
    if (!(spalte in zurueck)) continue;
    const alt = vorher ? vorher[spalte] : undefined;
    if (spalte === "meta" && wert && typeof wert === "object" && !Array.isArray(wert)) {
      const neuMeta = wert as Record<string, unknown>;
      const altMeta = (alt && typeof alt === "object" ? alt : {}) as Record<string, unknown>;
      const dbMeta = (zurueck.meta && typeof zurueck.meta === "object" ? zurueck.meta : {}) as Record<string, unknown>;
      for (const k of Object.keys(neuMeta)) {
        if (gleicherWert(neuMeta[k], altMeta[k])) continue;
        if (!enthalten(neuMeta[k], dbMeta[k])) felder.push(`meta.${k}`);
      }
      continue;
    }
    if (typeof wert === "string" && ZEITSTEMPEL.test(wert)) continue;
    if (wert !== null && typeof wert === "object") continue;
    if (vorher && gleicherWert(wert, alt)) continue;
    if (!gleicherWert(wert, zurueck[spalte])) felder.push(spalte);
  }
  return felder;
}


/**
 * Meldet fehlgeschlagene Ladevorgaenge und bietet einen neuen Versuch an.
 *
 * Ohne diese Meldung sieht ein Ladefehler auf jeder Seite so aus, als gaebe es
 * schlicht keine Daten. Der Knopf laedt genau die betroffenen Tabellen neu,
 * ein Neustart der Seite ist dafuer nicht noetig.
 */
/**
 * Anzeigedauer des Ladefehler-Hinweises.
 *
 * Vorher stand hier `Infinity`. Der Hinweis blieb dann stehen, bis der Nutzer
 * ihn wegklickte, und mehrere Hinweise stapelten sich übereinander. Eine
 * Minute reicht zum Lesen und zum Treffen des Knopfes "Erneut laden".
 */
const LADEFEHLER_ANZEIGEDAUER_MS = 60_000;

/**
 * Hoechstens eine Meldung je Tabelle und Minute.
 *
 * Am 16.09.2026 meldete ein Vertriebspartner, er bekomme "die ganze Zeit
 * Fehlercodes, egal wo ich rumklicke". Der Verstaerker hier: Eine gescheiterte
 * Tabelle landet bewusst nicht in `_loadedTables` (siehe `uebernehmen`),
 * `ladeTabellen` versucht sie deshalb erneut, und `useRoutenTabellen` laeuft
 * bei jedem Seitenwechsel. Jeder Klick in der Seitenleiste erzeugte so einen
 * weiteren roten Hinweis fuer denselben Ladefehler. Das Wiederholen bleibt
 * richtig, nur das Melden wird ruhiger. Abstand wie bei
 * REALTIME_MELDEABSTAND_MS und RESYNC_MINDESTABSTAND_MS.
 */
const LADEFEHLER_MELDEABSTAND_MS = 60_000;

/** Zeitpunkt der letzten Ladefehler-Meldung je Tabelle. */
let _ladefehlerZuletztGemeldet: Record<string, number> = {};

/**
 * @param erzwingen Umgeht die Entprellung. Gesetzt, wenn der Nutzer selbst auf
 *   "Erneut laden" gedrueckt hat: Auf eine bewusste Handlung muss eine Antwort
 *   folgen, sonst wirkt der Knopf kaputt.
 */
function ladefehlerMelden(tabellen: string[], erzwingen = false) {
  const jetzt = Date.now();
  const zuMelden = erzwingen
    ? tabellen
    : tabellen.filter((t) => jetzt - (_ladefehlerZuletztGemeldet[t] ?? 0) >= LADEFEHLER_MELDEABSTAND_MS);
  if (zuMelden.length === 0) return;
  for (const t of zuMelden) _ladefehlerZuletztGemeldet[t] = jetzt;

  const namen = zuMelden
    .map((t) => (TABELLEN_KLARTEXT[t] || t).replace(/^(Der|Die|Das) /, ""))
    .join(", ");
  toast.error("Daten konnten nicht geladen werden.", {
    description: `Betroffen: ${namen}. Was Du hier siehst, ist deshalb unvollständig. Bitte erneut laden.`,
    duration: LADEFEHLER_ANZEIGEDAUER_MS,
    action: { label: "Erneut laden", onClick: () => { void ladefehlerErneutVersuchen(zuMelden); } },
  });
}

async function ladefehlerErneutVersuchen(tabellen: string[]) {
  await Promise.allSettled(tabellen.map((t) => cacheRefreshTable(t)));
  const weiterhinOffen = tabellen.filter((t) => _ladefehler[t]);
  if (weiterhinOffen.length > 0) ladefehlerMelden(weiterhinOffen, true);
}

type CacheData = Record<string, any[]>;
type CacheListener = (table: string, event: "INSERT" | "UPDATE" | "DELETE", row: any) => void;

let _cache: CacheData = {};
let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _listeners: CacheListener[] = [];
/**
 * Ein Realtime-Kanal je Ladevorgang. Supabase nimmt Bindungen nur beim
 * Beitritt an, deshalb bekommt jede Gruppe neu geladener Tabellen ihren
 * eigenen Kanal statt den bestehenden neu aufzubauen (das riss eine Luecke,
 * in der Aenderungen verloren gingen). `_realtimeGebunden` verhindert, dass
 * eine Tabelle zweimal abonniert wird.
 */
let _realtimeKanaele: any[] = [];
let _realtimeGebunden: Set<string> = new Set();
let _kanalNummer = 0;
let _loadedTables: Set<string> = new Set();
/**
 * Laufende Ladevorgaenge je Tabelle. Wer eine Tabelle anfordert, die gerade
 * geladen wird, haengt sich an das laufende Versprechen, statt eine zweite
 * Abfrage zu starten.
 */
let _ladeVorgaenge: Record<string, Promise<void>> = {};
/** Erst nach `initDataCache()` (angemeldete Sitzung) darf geladen werden. */
let _ladenErlaubt = false;
/** Aktive Rolle, gesetzt von UserContext ueber `cacheRolleSetzen`. */
let _aktiveRolle = "";

/**
 * Tabellen, die nur bestimmte aktive Rollen lesen.
 *
 * Seit dem 27.09.2026 sehen Bewerbungen nur hr, admin, inhaber und backoffice
 * (Migration 20260927060000), dazu der Bewerber seine eigene Zeile. Fuer alle
 * anderen fragt der Browser gar nicht erst an und haelt eine leere Liste
 * bereit, genau das, was die Zeilensicherheit ihnen liefern wuerde. Die
 * Grenze selbst zieht die Datenbank, hier geht es nur um keine Abfragen ohne
 * Berechtigung.
 */
const ROLLEN_TABELLEN = ["bewerbungen"] as const;

function fuerRolleGesperrt(table: string): boolean {
  if (table !== "bewerbungen") return false;
  return !(BEWERBERPROZESS_ROLLEN.includes(_aktiveRolle) || _aktiveRolle === "bewerber");
}

/**
 * Meldet die aktive Rolle. Wechselt sie, wird eine rollenabhaengige Tabelle
 * verworfen und, wenn sie schon geladen war, nach der neuen Rolle neu geholt.
 */
export function cacheRolleSetzen(rolle: string): void {
  if (rolle === _aktiveRolle) return;
  _aktiveRolle = rolle;
  const betroffen = ROLLEN_TABELLEN.filter((t) => _loadedTables.has(t));
  for (const t of betroffen) {
    delete _cache[t];
    _loadedTables.delete(t);
    delete _ladefehler[t];
  }
  if (betroffen.length > 0) void ladeTabellen([...betroffen]);
}
let _cacheVersions: Record<string, number> = {};
/**
 * Tabellen, deren Laden fehlgeschlagen ist.
 *
 * Vorher gab ein fehlgeschlagener Ladevorgang eine leere Liste zurueck und die
 * Tabelle galt trotzdem als geladen. Die Lead-Verwaltung meldete dann "Keine
 * Leads gefunden", obwohl in Wahrheit gar nichts angekommen war. Ein
 * Ladefehler darf nicht aussehen wie ein leeres Ergebnis.
 */
let _ladefehler: Record<string, string> = {};
let _realtimeFailureTimestamps: number[] = [];
/** Gesammelte Kanal-Fehler seit der letzten Konsolenzeile, siehe realtimeBinden. */
let _realtimeFehlerSeitMeldung = 0;
let _realtimeLetzteMeldung = 0;
let _realtimeLetzterStatus = "";
const REALTIME_MELDEABSTAND_MS = 60_000;
let _realtimeAlertShown = false;
let _realtimeWasSubscribed = false;
let _resyncTimer: ReturnType<typeof setTimeout> | null = null;
let _visibilityListenerAttached = false;
/** Zeitpunkt des letzten Fokus-Resyncs, gegen zu haeufiges Neuladen. */
let _letzterResync = 0;
/** Zeitpunkt, an dem der Tab zuletzt unsichtbar wurde. */
let _seitWannWeg = 0;
/** Flutschutz-Zustand je Tabelle, siehe realtimeFlutschutz.ts. */
let _flutschutz: Record<string, FlutschutzZustand> = {};
/** Laufende Ruhephasen-Timer je Tabelle im Sammelmodus. */
let _flutRuheTimer: Record<string, ReturnType<typeof setTimeout>> = {};
/**
 * Zaehler laufender grosser Operationen je Tabelle (z. B. Massen-Import).
 * Solange > 0, werden Realtime-Ereignisse dieser Tabelle verworfen;
 * `grosseOperationBeenden` laedt am Ende genau einmal neu.
 */
let _grosseOperationen: Record<string, number> = {};

/**
 * Tables that must always be re-synced when the realtime connection recovers
 * after a drop, or when the user returns to the tab. Missing INSERTs here
 * would otherwise only show up after a manual "Aktualisieren" click
 * (Lead-Verwaltung, Glocke, Inbox …).
 */
const RESYNC_ON_FOCUS_TABLES = [
  "kontakte", "benachrichtigungen", "aufgaben", "follow_ups",
  "aktivitaeten", "activity_log", "bewerbungen", "hv_tickets", "investments",
];

/**
 * Nur Tabellen, die auch im Cache liegen. Was nie geladen wurde, muss auch
 * nicht nachgezogen werden; sonst holte der Tabwechsel 20.000 Aktivitaeten
 * fuer eine Seite, die sie gar nicht zeigt.
 */
function resyncTabellenImCache(): string[] {
  return RESYNC_ON_FOCUS_TABLES.filter((t) => _loadedTables.has(t));
}

async function resyncRealtimeTables(tables: string[]) {
  if (tables.length === 0) return;
  // Nach der naechtlichen Abmeldung scheitert beim Zurueckkehren in den Tab
  // die Erneuerung der Sitzung. Ohne diese Pruefung gingen die Abfragen dann
  // mit dem oeffentlichen Schluessel hinaus (Rolle anon) und liefen in
  // "permission denied for table bewerbungen". getSession wartet die
  // Erneuerung ab und liefert danach keine Sitzung mehr.
  const sitzung = await supabase.auth.getSession().then((r) => r.data.session, () => null);
  if (!sitzung) return;
  await Promise.allSettled(tables.map((t) => cacheRefreshTable(t)));
}

/**
 * Nach einem Verbindungsabbruch melden sich alle Kanaele kurz nacheinander
 * wieder. Gesammelt in einem Timer, damit die Tabellen einmal und nicht je
 * Kanal neu geladen werden.
 */
function resyncNachWiederverbindung() {
  if (_resyncTimer) clearTimeout(_resyncTimer);
  _resyncTimer = setTimeout(() => {
    _resyncTimer = null;
    // Derselbe Mindestabstand wie beim Fokus-Resync: Bei vielen Kanaelen
    // meldet sich nach einer Stoerung einer nach dem anderen zurueck, sonst
    // laedt jeder davon neun grosse Tabellen erneut.
    if (Date.now() - _letzterResync < RESYNC_MINDESTABSTAND_MS) return;
    _letzterResync = Date.now();
    void resyncRealtimeTables(resyncTabellenImCache());
  }, 500);
}

/**
 * Mindestabstand zwischen zwei Fokus-Resyncs und Mindestdauer der Abwesenheit.
 *
 * Gemessen am 15.09.2026 in der Vorschau: Der Cache hat sich alle paar Minuten
 * komplett neu geladen, jedes Mal doppelt. Zwei Ursachen. Erstens feuern
 * `visibilitychange` und `focus` bei einem Tabwechsel beide, der Resync lief
 * also zweimal im Abstand von unter einer Sekunde. Zweitens lief er bei jeder
 * noch so kurzen Rueckkehr, auch wenn der Tab nur zwei Sekunden im Hintergrund
 * war. Bei 8232 Investments und 2255 Kontakten sind das jedes Mal zwoelf
 * Bloecke plus bis zu 40.000 Zeilen Verlauf.
 *
 * Der Resync ist eine Absicherung, keine Aktualisierung: Solange Realtime
 * haengt, kommen Aenderungen ohnehin sofort an. Gebraucht wird er, wenn der
 * Rechner geschlafen hat oder die Verbindung weg war, und das dauert laenger
 * als ein kurzer Blick in ein anderes Fenster.
 */
const RESYNC_MINDESTABSTAND_MS = 60_000;
const RESYNC_MINDESTABWESENHEIT_MS = 30_000;

function attachVisibilityListener() {
  if (_visibilityListenerAttached || typeof document === "undefined") return;
  _visibilityListenerAttached = true;
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const jetzt = Date.now();
    const langGenugWeg = _seitWannWeg === 0 || jetzt - _seitWannWeg >= RESYNC_MINDESTABWESENHEIT_MS;
    const langGenugHer = jetzt - _letzterResync >= RESYNC_MINDESTABSTAND_MS;
    if (!langGenugWeg || !langGenugHer) return;
    _letzterResync = jetzt;
    // Gesammelt im Timer, weil `visibilitychange` und `focus` beide feuern.
    if (_resyncTimer) clearTimeout(_resyncTimer);
    _resyncTimer = setTimeout(() => {
      _resyncTimer = null;
      void resyncRealtimeTables(resyncTabellenImCache());
    }, 300);
  };
  const onHidden = () => {
    if (document.visibilityState === "hidden") _seitWannWeg = Date.now();
  };
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("visibilitychange", onHidden);
  window.addEventListener("focus", onVisible);
}

function trackRealtimeFailure() {
  const now = Date.now();
  _realtimeFailureTimestamps = _realtimeFailureTimestamps.filter((t) => now - t < 60_000);
  _realtimeFailureTimestamps.push(now);
  if (_realtimeFailureTimestamps.length >= 3 && !_realtimeAlertShown) {
    _realtimeAlertShown = true;
    try {
      toast.error("Live-Updates unterbrochen", {
        description: "Verbindung instabil. Seite neu laden, falls Daten veraltet wirken.",
        duration: 8000,
      });
    } catch { /* ignore */ }
    // Auto-rejoin attempt after 5s
    setTimeout(() => {
      try {
        realtimeNeuAufbauen();
      } catch (e) {
        console.warn("Realtime rejoin failed:", e);
      }
      _realtimeAlertShown = false;
    }, 5000);
  }
}

/** Returns a monotonically-increasing version for a given table.
 *  Increments on every INSERT/UPDATE/DELETE notification (including realtime in-place updates).
 *  Use this to invalidate downstream memoised projections of cached rows. */
export function getCacheVersion(table: string): number {
  return _cacheVersions[table] || 0;
}

/**
 * Alle Tabellen, die der Cache kennt.
 *
 * Es gibt keine feste Ladewelle mehr. Was beim Login geladen wird, bestimmt
 * der Ladeplan aus `routenTabellen.ts` (Tabellen der Startroute plus die
 * globalen), was danach kommt, fordern die Seiten ueber `useCacheReady` und
 * der App-Rahmen ueber `useRoutenTabellen` an. Die Liste hier dient dem
 * Waechter-Test, der prueft, dass die Routenkarte nur bekannte Tabellen
 * nennt.
 *
 * `provisionsabrechnungen` ist bewusst nicht in REALTIME_TABLES: solange die
 * Migration 20260729080000 nicht eingespielt ist, gibt es die Tabelle nicht,
 * und ein Abo auf eine fehlende Tabelle reisst den Realtime-Kanal mit.
 */
export const ALLE_CACHE_TABELLEN: readonly string[] = [
  "kontakte", "profiles", "user_roles", "user_settings", "app_config", "pipeline",
  "investments", "aufgaben", "follow_ups",
  "bewerbungen", "benachrichtigungen", "follow_up_ketten",
  "chat_gruppen", "chat_teilnehmer", "news",
  "objekte", "wohnungen", "aktivitaeten",
  "activity_log", "chat_nachrichten", "kommunikation",
  "finanzierungen", "empfehlungen", "empfehlungsprogramme",
  "fristen", "support_tickets", "hv_tickets",
  "mieter", "dienstleister", "kautionen",
  "versicherungen", "zaehlerstaende", "eigentuemer",
  "wettbewerb_challenges", "betriebskosten", "vermietungen",
  "externe_investments", "kunden_bewertungen", "objekt_einreichungen",
  "provisionsabrechnungen", "objekt_bilder", "objekt_dokumente",
  "wohnungs_bilder", "wohnungs_dokumente",
];

/** Ladeplan fuer den Start, siehe `ladeplanFuerStart` in routenTabellen.ts. */
export interface Ladeplan {
  /** Blockiert `initDataCache()`, bis diese Tabellen da sind. */
  sofort?: string[];
  /** Kernseiten: gruppenweise direkt danach, ohne auf Leerlauf zu warten. */
  danach?: string[][];
  /** Der Rest: gruppenweise bei Leerlauf, ohne zu blockieren. */
  spaeter?: string[][];
}

/**
 * Kuenstlicher Tabellenname fuer die eine Meldung, die den Cache als bereit
 * erklaert (`isCacheReady()`), nachdem die Startroute geladen ist. Seiten
 * hoeren auf ihre eigenen Tabellen und ignorieren diesen Namen.
 */
export const CACHE_BEREIT_EREIGNIS = "cache_bereit";

/**
 * Laufnummer des aktuellen Ladevorgangs. `resetCache` (Abmeldung) zaehlt
 * hoch, damit ein noch laufendes Nachladen nicht in den Cache des
 * naechsten Nutzers schreibt.
 */
let _ladeLauf = 0;

/**
 * Wartet auf Leerlauf des Browsers, mit Rueckfall fuer Umgebungen ohne
 * requestIdleCallback. Die Zeitgrenze sorgt dafuer, dass die Warteschlange
 * auch dann weiterlaeuft, wenn Realtime-Ereignisse oder Re-Renders den
 * Browser dauerhaft beschaeftigen: spaetestens nach 2 Sekunden je Gruppe.
 */
function beiLeerlauf(): Promise<void> {
  return new Promise((weiter) => {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === "function") idle(() => weiter(), { timeout: 2000 });
    else setTimeout(weiter, 200);
  });
}

/**
 * Spalte, nach der beim Laden absteigend sortiert wird.
 *
 * Entscheidend für Tabellen, die über die Zeit wachsen. Wird das Limit
 * erreicht, fehlen dann wenigstens garantiert nur die ältesten Zeilen und
 * nicht willkürliche. Ohne Sortierung sah ein Admin unter Umständen weniger
 * als der Vertriebspartner, dem die Einträge gehören.
 */
const SORTIERSPALTE: Record<string, string> = {
  // Bewusst `erstellt_am` und nicht `aktualisiert_am`. Wenn es mehr Kontakte
  // gibt als das Limit hergibt, will man die neuesten behalten, und zwar bei
  // jedem Laden dieselben. `erstellt_am` aendert sich nie, die Menge ist damit
  // stabil. `aktualisiert_am` wackelt dagegen bei jeder Bearbeitung: Ein
  // Kontakt, den irgendwer anfasst, verdraengt einen frisch eingegangenen
  // Lead, und beim naechsten Laden fehlen wieder andere Zeilen. Genau dieses
  // Verschwinden zwischen zwei Ladevorgaengen war der Fehler oben.
  kontakte: "erstellt_am",
  // Nachgetragen am 15.09.2026. `investments` steht in SEITENWEISE_TABELLEN,
  // hatte hier aber keinen Eintrag: Das Blaettern mit `range()` lief also ohne
  // ORDER BY, und Postgres garantiert dann zwischen zwei Bloecken keine feste
  // Reihenfolge. Eine Zeile konnte dadurch in zwei Bloecken auftauchen oder
  // ganz durchfallen, also stillschweigend fehlen. Genau dieser Fehler hat bei
  // `kontakte` schon einmal Eintraege verschwinden lassen.
  investments: "erstellt_am",
  // Die vier Medientabellen werden seit dem 23.09.2026 geblaettert, siehe
  // SEITENWEISE_TABELLEN. Ohne feste Reihenfolge fiele beim Blaettern still
  // eine Zeile durch. Die Anzeigereihenfolge der Bilder regelt ohnehin
  // `reihenfolge` in `objekteStore.ts`.
  objekt_bilder: "erstellt_am",
  objekt_dokumente: "erstellt_am",
  wohnungs_bilder: "erstellt_am",
  wohnungs_dokumente: "erstellt_am",
  aktivitaeten: "datum",
  activity_log: "created_at",
  chat_nachrichten: "gesendet_am",
  benachrichtigungen: "erstellt_am",
  kommunikation: "erstellt_am",
  follow_ups: "faellig_am",
  aufgaben: "faellig_am",
};

/**
 * Tabellen, die firmenweit deutlich mehr Zeilen haben können als der Rest.
 * Der Verlauf eines Kunden ist nur vollständig, wenn seine Einträge auch im
 * Cache landen.
 */
const GROSSE_TABELLEN = new Set([
  "aktivitaeten",
  "activity_log",
  "chat_nachrichten",
  "kommunikation",
]);

const ZEILEN_GRENZE_STANDARD = 5000;
const ZEILEN_GRENZE_GROSS = 20000;

function zeilenGrenze(table: string): number {
  return GROSSE_TABELLEN.has(table) ? ZEILEN_GRENZE_GROSS : ZEILEN_GRENZE_STANDARD;
}

/**
 * Tabellen, die seitenweise in Bloecken nachgeladen werden.
 *
 * Ein einzelnes `limit(5000)` schneidet ab einer bestimmten Groesse still ab:
 * Wer 8000 Kontakte hat, sah in "Alle Kontakte" nur die neuesten 5000, ohne
 * jeden Hinweis. Statt die Grenze immer weiter hochzudrehen, wird in Bloecken
 * von 1000 Zeilen geblaettert, bis die Datenbank nichts mehr liefert. Der
 * erste Block ist sofort da, der Rest fliesst hinterher.
 *
 * Die vier Medientabellen kamen am 23.09.2026 dazu. Supabase liefert je Abruf
 * in der Grundeinstellung hoechstens 1000 Zeilen, auch wenn `limit(5000)`
 * verlangt wird, und zwar ohne Fehlermeldung. Bei rund 400 Einheiten mit
 * mehreren Bildern und Unterlagen je Einheit reicht das nicht: Einem Teil der
 * Objekte fehlten dann Dokumente auf dem Bildschirm, obwohl sie in der
 * Datenbank lagen. Schlimmer noch, der Objektassistent schreibt die
 * Objektdokumente beim Speichern aus diesem Stand neu und haette fehlende
 * Zeilen damit geloescht.
 */
const SEITENWEISE_TABELLEN = new Set([
  "kontakte",
  "investments",
  "objekt_bilder",
  "objekt_dokumente",
  "wohnungs_bilder",
  "wohnungs_dokumente",
]);
const BLOCK_GROESSE = 1000;
/** Harte Notbremse, damit ein Fehler nicht endlos blaettert. */
const MAX_BLOECKE = 60;

/**
 * Baut die Grundabfrage einer Tabelle inklusive Vorfilter und Sortierung.
 * Bewusst an einer Stelle, damit erstes Laden und Neuladen nie auseinander
 * laufen. Genau das war frueher die Ursache verschwindender Zeilen.
 */
function grundabfrage(table: string): any {
  let abfrage = vorfilter(table, db.from(table).select("*"));
  const spalte = SORTIERSPALTE[table];
  if (spalte) abfrage = abfrage.order(spalte, { ascending: false, nullsFirst: false });
  // Stabile Zweitsortierung: ohne sie kann dieselbe Zeile in zwei Bloecken
  // auftauchen oder ganz durchfallen, wenn viele Zeilen denselben Zeitstempel
  // tragen. Nach einem Massen-Import ist genau das der Normalfall.
  if (spalte) abfrage = abfrage.order("id", { ascending: false });
  return abfrage;
}

/**
 * Zaehlt die Zeilen einer Tabelle (nur Kopf, keine Daten), mit denselben
 * Vorfiltern wie das Laden. `null`, wenn die Zaehlung scheitert; dann
 * blaettert `ladeTabelle` blind in Wellen weiter.
 */
async function zeilenZaehlen(table: string, signal?: AbortSignal): Promise<number | null> {
  try {
    let abfrage = vorfilter(table, db.from(table).select("id", { count: "exact", head: true }));
    if (signal) abfrage = abfrage.abortSignal(signal);
    const { count, error } = await abfrage;
    if (error || typeof count !== "number") return null;
    return count;
  } catch {
    return null;
  }
}

/**
 * Laedt eine Tabelle vollstaendig, bei Bedarf in mehreren Bloecken.
 *
 * `beiBlock` wird nach dem ersten und nach dem letzten Block mit dem
 * bisherigen Gesamtstand aufgerufen, damit die Oberflaeche die erste Seite
 * schon anzeigen kann, waehrend der Rest noch laeuft.
 */
async function ladeTabelle(
  table: string,
  signal?: AbortSignal,
  beiBlock?: (bisher: any[]) => void,
): Promise<any[]> {
  if (fuerRolleGesperrt(table)) return [];
  const grenze = zeilenGrenze(table);

  if (!SEITENWEISE_TABELLEN.has(table)) {
    let abfrage = grundabfrage(table).limit(grenze);
    if (signal) abfrage = abfrage.abortSignal(signal);
    const { data, error } = await abfrage;
    if (error) throw new Error(error.message);
    const zeilen = data || [];
    if (zeilen.length >= grenze) {
      console.warn(
        `Cache: ${table} hat die Grenze von ${grenze} Zeilen erreicht. Aeltere Eintraege fehlen im Cache.`,
      );
    }
    return zeilen;
  }

  const alle: any[] = [];
  const blockLaden = async (block: number) => {
    const von = block * BLOCK_GROESSE;
    let abfrage = grundabfrage(table).range(von, von + BLOCK_GROESSE - 1);
    if (signal) abfrage = abfrage.abortSignal(signal);
    const { data, error } = await abfrage;
    if (error) return { block, zeilen: [] as any[], fehler: error.message };
    return { block, zeilen: (data || []) as any[], fehler: "" };
  };

  // Zaehlung und erster Block gleichzeitig. Der erste Block entscheidet ueber
  // den ersten Bildaufbau und wird sofort gemeldet; die Zaehlung sagt, wie
  // viele Bloecke noch fehlen, damit sie alle auf einmal statt in Wellen zu
  // vier geholt werden koennen.
  const zaehlung = zeilenZaehlen(table, signal);
  const erster = await blockLaden(0);
  if (erster.fehler) throw new Error(erster.fehler);
  alle.push(...erster.zeilen);
  if (erster.zeilen.length > 0) beiBlock?.(alle);
  if (erster.zeilen.length < BLOCK_GROESSE) return alle;

  const gesamt = await zaehlung;
  let bekannteBloecke = gesamt === null ? null : Math.min(Math.ceil(gesamt / BLOCK_GROESSE), MAX_BLOECKE);
  ladezeitLoggen(`${table}: Zaehlung ${gesamt === null ? "fehlgeschlagen" : `${gesamt} Zeilen, ${bekannteBloecke} Bloecke`}`);

  // Restliche Bloecke parallel: alle auf einmal, wenn die Zaehlung bekannt
  // ist, sonst blind in Wellen zu vier, bis ein Block nicht mehr voll ist.
  const WELLE = 4;
  let naechster = 1;
  while (naechster < MAX_BLOECKE) {
    const bis = bekannteBloecke ?? Math.min(naechster + WELLE, MAX_BLOECKE);
    if (naechster >= bis) break;
    const welle = [];
    for (let block = naechster; block < bis; block++) welle.push(blockLaden(block));
    const ergebnisse = await Promise.all(welle);
    ergebnisse.sort((a, b) => a.block - b.block);
    let fertig = false;
    for (const e of ergebnisse) {
      if (e.fehler) {
        console.warn(`Cache: ${table} Teilladung Block ${e.block} fehlgeschlagen:`, e.fehler);
        fertig = true;
        break;
      }
      alle.push(...e.zeilen);
      if (e.zeilen.length < BLOCK_GROESSE) fertig = true;
      if (fertig) break;
    }
    if (fertig) break;
    naechster = bis;
    // War nach der gezaehlten Welle der letzte Block trotzdem voll, sind seit
    // der Zaehlung Zeilen dazugekommen: dann blind in Wellen weiter.
    bekannteBloecke = null;
  }
  // Zwischenmeldungen bewusst nur zweimal: nach dem ersten Block (siehe oben)
  // und einmal am Ende mit dem vollstaendigen Stand. Vorher wurde nach jeder
  // Welle gemeldet, und jede Meldung loest App-weit Re-Renders aus. Seiten,
  // die ueber alle Kontakte rechnen (Duplikatsuche, Filterzaehler), haben
  // dadurch waehrend des Ladens mehrfach umsonst gerechnet und den Browser
  // blockiert.
  if (alle.length > erster.zeilen.length) beiBlock?.(alle);
  return alle;
}

/**
 * Serverseitige Vorfilter beim Laden in den Cache.
 *
 * Hier lag ein handfester Fehler: `kontakte` wurde ungefiltert geladen, also
 * inklusive der weggeworfenen Datensaetze im Papierkorb. Nach einem grossen
 * Import mit anschliessender Loeschung lagen mehrere tausend geloeschte
 * Zeilen in der Tabelle. Sortiert nach `erstellt_am` absteigend fuellten
 * genau diese Leichen das Limit von 5000 komplett aus, und die echten,
 * aelteren Kontakte kamen gar nicht mehr im Cache an. In "Alle Kontakte" und
 * in der Pipeline fehlten sie deshalb.
 *
 * Der Papierkorb laedt seine Zeilen separat direkt aus der Datenbank.
 */
function vorfilter(table: string, abfrage: any): any {
  if (table === "kontakte") return abfrage.or("geloescht.is.null,geloescht.eq.false");
  return abfrage;
}

// Tables that should have realtime subscriptions
const REALTIME_TABLES = [
  "kontakte", "investments", "follow_ups", "aktivitaeten", "activity_log",
  "objekte", "aufgaben", "bewerbungen", "empfehlungen",
  "empfehlungsprogramme",
  "hv_tickets", "finanzierungen", "objekt_einreichungen",
  "benachrichtigungen", "profiles", "user_settings",
  "chat_nachrichten", "chat_gruppen", "chat_teilnehmer",
  "news",
  "externe_investments", "kunden_bewertungen",
  "wohnungen", "eigentuemer", "mieter", "dienstleister",
  "kautionen", "versicherungen", "zaehlerstaende",
  "kommunikation", "fristen", "support_tickets",
  "betriebskosten", "vermietungen", "follow_up_ketten",
  "app_config", "user_roles", "pipeline",
  "objekt_bilder", "objekt_dokumente",
  "wohnungs_bilder", "wohnungs_dokumente",
];

/** Subscribe to cache changes */
export function onCacheChange(listener: CacheListener): () => void {
  _listeners.push(listener);
  return () => {
    _listeners = _listeners.filter(l => l !== listener);
  };
}

function notifyListeners(table: string, event: "INSERT" | "UPDATE" | "DELETE", row: any) {
  _cacheVersions[table] = (_cacheVersions[table] || 0) + 1;
  for (const listener of _listeners) {
    try { listener(table, event, row); } catch (e) { console.warn("Cache listener error:", e); }
  }
}

/**
 * Meldet den Beginn einer grossen Schreiboperation (z. B. Massen-Import) an.
 *
 * Der eigene Tab weiss vorher, dass eine Flut kommt, und muss gar nicht erst
 * zaehlen: Realtime-Ereignisse der genannten Tabellen werden bis zum
 * `grosseOperationBeenden` verworfen. Andere Tabs schuetzt derweil der
 * Flutschutz in `realtimeEreignisZulassen`.
 */
export function grosseOperationBeginnen(tabellen: string[]): void {
  for (const t of tabellen) {
    _grosseOperationen[t] = (_grosseOperationen[t] || 0) + 1;
  }
}

/**
 * Beendet eine grosse Schreiboperation und laedt die betroffenen Tabellen
 * genau einmal neu (inklusive Listener-Benachrichtigung ueber
 * `cacheRefreshTable`). Muss auch im Fehlerpfad laufen (try/finally beim
 * Aufrufer), sonst blieben Live-Updates dauerhaft aus.
 */
export async function grosseOperationBeenden(tabellen: string[]): Promise<void> {
  const abgeschlossen: string[] = [];
  for (const t of tabellen) {
    const offen = (_grosseOperationen[t] || 0) - 1;
    if (offen > 0) {
      _grosseOperationen[t] = offen;
    } else {
      delete _grosseOperationen[t];
      abgeschlossen.push(t);
      // Aufgestauten Flutschutz-Zustand mit abraeumen, damit nach der
      // Operation nicht noch ein alter Ruhephasen-Timer doppelt neu laedt.
      if (_flutRuheTimer[t]) {
        clearTimeout(_flutRuheTimer[t]);
        delete _flutRuheTimer[t];
      }
      delete _flutschutz[t];
    }
  }
  await Promise.allSettled(abgeschlossen.map((t) => cacheRefreshTable(t)));
}

/**
 * Entscheidet je Realtime-Ereignis, ob es einzeln angewendet wird.
 *
 * Unterhalb der Flutschwelle bleibt alles wie gewohnt. Oberhalb wird das
 * Ereignis verworfen und stattdessen ein gesammeltes Neuladen vorgemerkt:
 * nach 2 Sekunden Ruhe genau einmal, bei anhaltender Flut zusaetzlich
 * hoechstens alle 10 Sekunden ein Zwischen-Refresh. Gilt je Tabelle, damit
 * ein Kontakte-Import den Chat nicht ausbremst.
 */
function realtimeEreignisZulassen(table: string): boolean {
  // Ein Kanal aus der Zeit vor einem Rollenwechsel liefert nichts mehr nach.
  if (fuerRolleGesperrt(table)) return false;
  // Waehrend einer angemeldeten grossen Operation uebernimmt
  // `grosseOperationBeenden` das eine Neuladen am Ende.
  if (_grosseOperationen[table]) return false;

  const ergebnis = flutschutzEreignis(
    _flutschutz[table] || neuerFlutschutzZustand(),
    Date.now(),
  );
  _flutschutz[table] = ergebnis.zustand;
  if (ergebnis.einzelnAnwenden) return true;

  // Sammelmodus: Ruhephasen-Timer bei jedem Ereignis neu aufziehen. Laeuft er
  // ab, war 2 Sekunden Ruhe, dann einmal neu laden und zurueckschalten.
  if (_flutRuheTimer[table]) clearTimeout(_flutRuheTimer[table]);
  _flutRuheTimer[table] = setTimeout(() => {
    delete _flutRuheTimer[table];
    if (_grosseOperationen[table]) return; // beenden() laedt ohnehin neu
    if (_flutschutz[table]) _flutschutz[table] = flutschutzRuhe(_flutschutz[table]);
    void cacheRefreshTable(table);
  }, RUHEPHASE_MS);

  if (ergebnis.zwischenRefreshJetzt) void cacheRefreshTable(table);
  return false;
}

/**
 * Abonniert Realtime-Aenderungen fuer neu geladene Tabellen.
 *
 * Nur Tabellen, die im Cache liegen, bekommen eine Bindung; was nie geladen
 * wurde, braucht auch keine Push-Nachrichten. Jeder Aufruf legt einen
 * eigenen Kanal fuer die noch ungebundenen Tabellen an, bereits gebundene
 * werden uebersprungen. `resyncBeimVerbinden` gilt nach einer Stoerung:
 * dann werden beim ersten Beitritt die zwischenzeitlich verpassten Zeilen
 * nachgeladen.
 */
function realtimeBinden(tabellen: string[], resyncBeimVerbinden = false) {
  if (isTestAccount()) return;
  const neu = tabellen.filter((t) => REALTIME_TABLES.includes(t) && !_realtimeGebunden.has(t) && !fuerRolleGesperrt(t));
  if (neu.length === 0) return;
  for (const t of neu) _realtimeGebunden.add(t);

  _kanalNummer += 1;
  const kanal = supabase.channel(`data-cache-sync-${_kanalNummer}`);
  // removeChannel meldet den Kanal erst verzoegert ab. Ereignisse, die danach
  // noch ankommen, gehoeren zum alten Konto.
  const lauf = _ladeLauf;

  for (const table of neu) {
    kanal.on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table },
      (payload: any) => {
        const row = payload.new;
        if (lauf !== _ladeLauf) return;
        if (!row || !row.id) return;
        if (!realtimeEreignisZulassen(table)) return;
        if (!_cache[table]) _cache[table] = [];
        // Avoid duplicates
        const exists = _cache[table].some((r: any) => r.id === row.id);
        if (!exists) {
          _cache[table].push(row);
          notifyListeners(table, "INSERT", row);
        }
      }
    ).on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table },
      (payload: any) => {
        const row = payload.new;
        if (lauf !== _ladeLauf) return;
        if (!row || !row.id) return;
        if (!realtimeEreignisZulassen(table)) return;
        if (!_cache[table]) _cache[table] = [];
        const idx = _cache[table].findIndex((r: any) => r.id === row.id);
        if (idx >= 0) {
          _cache[table][idx] = row;
        } else {
          _cache[table].push(row);
        }
        notifyListeners(table, "UPDATE", row);
      }
    ).on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table },
      (payload: any) => {
        const old = payload.old;
        if (lauf !== _ladeLauf) return;
        if (!old || !old.id) return;
        if (!realtimeEreignisZulassen(table)) return;
        if (_cache[table]) {
          _cache[table] = _cache[table].filter((r: any) => r.id !== old.id);
        }
        notifyListeners(table, "DELETE", old);
      }
    );
  }

  // Je Kanal: der erste Beitritt ist normal, jeder weitere ein Wiederbeitritt
  // nach Verbindungsabbruch, dann werden verpasste Zeilen nachgeladen.
  let warVerbunden = resyncBeimVerbinden;
  kanal.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      /*
       * Frueher wurde die Fehlerliste hier geleert. Bei vielen Kanaelen
       * meldete sich immer einer erfolgreich, die Schwelle "drei Fehler in
       * 60 Sekunden" wurde deshalb nie erreicht und der Notfall-Neuaufbau
       * lief nie an. Jetzt bleibt nur stehen, was juenger als eine Minute
       * ist; ein wirklich ruhiger Zeitraum leert die Liste von selbst.
       */
      const grenze = Date.now() - 60_000;
      _realtimeFailureTimestamps = _realtimeFailureTimestamps.filter((t) => t > grenze);
      if (warVerbunden) resyncNachWiederverbindung();
      warVerbunden = true;
      _realtimeWasSubscribed = true;
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      /*
       * Gemessen am 15.09.2026: Seit die Tabellen je Route geladen werden,
       * entsteht ein Kanal je Ladegruppe statt einem einzigen. Scheitert der
       * Beitritt, schrieb jeder Kanal seine eigene Zeile, in einer Stunde
       * wurden daraus vierstellige Zahlen im Protokoll. Die Meldung steht
       * jetzt hoechstens einmal je Minute, mit Anzahl und Status, damit
       * CHANNEL_ERROR und TIMED_OUT unterscheidbar bleiben. Die Zaehlung
       * laeuft unabhaengig davon weiter.
       */
      _realtimeFehlerSeitMeldung++;
      _realtimeLetzterStatus = status;
      const jetzt = Date.now();
      if (jetzt - _realtimeLetzteMeldung >= REALTIME_MELDEABSTAND_MS) {
        console.warn(
          `Realtime: ${_realtimeFehlerSeitMeldung} Kanal-Fehler (zuletzt ${_realtimeLetzterStatus}), Wiederverbindung laeuft`,
        );
        _realtimeLetzteMeldung = jetzt;
        _realtimeFehlerSeitMeldung = 0;
      }
      trackRealtimeFailure();
    }
  });
  _realtimeKanaele.push(kanal);
  attachVisibilityListener();
}

/** Tabellen, die auf ihre Realtime-Bindung warten, und der Sammel-Timer dazu. */
let _realtimeWartend: Set<string> = new Set();
let _realtimeSammelTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Bindet Realtime kurz verzoegert und gesammelt. Seit jede Tabelle einzeln
 * freigegeben wird, kaeme sonst je Tabelle ein eigener Kanal zustande;
 * Tabellen, die innerhalb einer Viertelsekunde eintreffen, teilen sich so
 * einen Kanal. Fuer die Anzeige spielt die Bindung keine Rolle, die Zeilen
 * liegen bereits im Cache.
 */
function realtimeBindenGesammelt(table: string) {
  _realtimeWartend.add(table);
  if (_realtimeSammelTimer) return;
  _realtimeSammelTimer = setTimeout(() => {
    _realtimeSammelTimer = null;
    const tabellen = Array.from(_realtimeWartend).filter((t) => _loadedTables.has(t));
    _realtimeWartend = new Set();
    realtimeBinden(tabellen);
  }, 250);
}

function realtimeAlleKanaeleSchliessen() {
  for (const kanal of _realtimeKanaele) {
    try { supabase.removeChannel(kanal); } catch { /* ignore */ }
  }
  _realtimeKanaele = [];
  _realtimeGebunden = new Set();
}

/**
 * Nach einer Stoerung: alle Kanaele schliessen und die geladenen Tabellen in
 * einem einzigen neuen Kanal abonnieren. Beim Beitritt werden die
 * verpassten Zeilen nachgeladen.
 */
function realtimeNeuAufbauen() {
  const geladen = Array.from(_loadedTables);
  realtimeAlleKanaeleSchliessen();
  realtimeBinden(geladen, _realtimeWasSubscribed);
}

/**
 * Ein Ladeversuch mit Zeitgrenze. Der erste Block seitenweise geladener
 * Tabellen wird sofort sichtbar gemacht, statt bis zum letzten Block ein
 * Skelett zu zeigen.
 */
async function einLadeversuch(table: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const beginn = jetztMs();
  let ersterBlockMs = 0;
  // Ein Block, der nach dem Abmelden ankommt, gehoert zum alten Konto.
  const lauf = _ladeLauf;
  try {
    // Ohne Sortierung entscheidet die Datenbank frei, welche Zeilen ein
    // Limit abschneidet. Deshalb laeuft jedes Laden ueber `ladeTabelle`
    // mit fester Sortierung, grosse Tabellen zusaetzlich blockweise.
    const zeilen = await ladeTabelle(table, controller.signal, (bisher) => {
      if (lauf !== _ladeLauf) return;
      if (!ersterBlockMs) ersterBlockMs = jetztMs() - beginn;
      if (_cache[table] === undefined || (_cache[table] as any[]).length < bisher.length) {
        _cache[table] = [...bisher];
        _loadedTables.add(table);
        notifyListeners(table, "INSERT", null);
      }
    });
    clearTimeout(timer);
    const dauer = Math.round(jetztMs() - beginn);
    const ersterBlock = ersterBlockMs ? `, erster Block nach ${Math.round(ersterBlockMs)} ms` : "";
    ladezeitLoggen(`${table}: ${zeilen.length} Zeilen in ${dauer} ms${ersterBlock}`);
    return { table, data: zeilen, ok: true, fehler: "" };
  } catch (e: any) {
    clearTimeout(timer);
    ladezeitLoggen(`${table}: Fehler nach ${Math.round(jetztMs() - beginn)} ms (${e?.message || "Zeitueberschreitung"})`);
    console.warn(`Cache: timeout/error loading ${table}:`, e?.message);
    return { table, data: [], ok: false, fehler: e?.message || "Zeitüberschreitung" };
  }
}

/**
 * Laedt eine Tabelle mit einem stillen zweiten Versuch.
 *
 * Ein kurzer Netzaussetzer oder eine einmalige Zeitueberschreitung beim
 * Start soll nicht sofort im roten Fehlerbanner landen. Schreibvorgaenge
 * wiederholen aus demselben Grund (siehe cacheUpdate). Der zweite
 * Versuch bekommt mehr Zeit, weil die erste Anfrage oft nur knapp an
 * der Zeitgrenze gescheitert ist.
 */
async function fetchWithTimeout(table: string, timeoutMs = 10000) {
  const erster = await einLadeversuch(table, timeoutMs);
  if (erster.ok) return erster;
  await new Promise((fertig) => setTimeout(fertig, 1500));
  return einLadeversuch(table, Math.max(timeoutMs * 2, 15000));
}

/**
 * Uebernimmt ein Ladeergebnis in den Cache.
 *
 * Nur ein erfolgreicher Ladevorgang zaehlt als geladen. Nach einem
 * Fehler bleibt die Tabelle ungeladen, damit die Seiten ihren Ladezustand
 * behalten statt ein leeres Ergebnis anzuzeigen, und der Fehler wird
 * gemerkt.
 */
function uebernehmen(ergebnis: { table: string; data: unknown[]; ok: boolean; fehler: string }): boolean {
  if (!ergebnis.ok) {
    _ladefehler[ergebnis.table] = ergebnis.fehler;
    return false;
  }
  delete _ladefehler[ergebnis.table];
  _cache[ergebnis.table] = mitGezieltenZeilen(ergebnis.table, ergebnis.data as GezielteZeile[]);
  _loadedTables.add(ergebnis.table);
  return true;
}

/**
 * Laedt die genannten Tabellen, sofern sie noch nicht im Cache liegen.
 *
 * Kern des Ladens je Route: `useCacheReady` und `useRoutenTabellen` rufen
 * das fuer genau die Tabellen auf, die eine Seite braucht. Laufende
 * Ladevorgaenge werden nicht doppelt gestartet, ein Aufrufer haengt sich an
 * das laufende Versprechen. Nach `resetCache` (Abmeldung) verwirft ein noch
 * laufender Vorgang sein Ergebnis. Fehler landen wie beim Start im roten
 * Hinweis mit "Erneut laden".
 *
 * Jede Tabelle wird freigegeben, sobald sie selbst da ist, nicht erst, wenn
 * die ganze Gruppe fertig ist. Vorher wartete eine Seite, die nur Aufgaben
 * und Follow-ups brauchte, auf die 20.000 Aktivitaeten derselben Gruppe:
 * genau das machte den Klick auf die Pipeline nach dem Login so langsam.
 */
export async function ladeTabellen(tabellen: string[]): Promise<void> {
  if (isTestAccount() || !_ladenErlaubt) return;
  const offen = Array.from(new Set(tabellen)).filter((t) => !_loadedTables.has(t));
  if (offen.length === 0) return;

  const neu = offen.filter((t) => !_ladeVorgaenge[t]);
  if (neu.length > 0) {
    ladezeitLoggen(`angefordert: ${neu.join(", ")}`);
    const lauf = _ladeLauf;
    const fehlerhaft: string[] = [];
    const einzeln = neu.map((table) => {
      const vorgang: Promise<void> = fetchWithTimeout(table)
        .then((ergebnis) => {
          if (lauf !== _ladeLauf) return;
          if (!uebernehmen(ergebnis)) {
            fehlerhaft.push(table);
            return;
          }
          realtimeBindenGesammelt(table);
          notifyListeners(table, "INSERT", null);
        })
        .finally(() => {
          if (_ladeVorgaenge[table] === vorgang) delete _ladeVorgaenge[table];
        });
      _ladeVorgaenge[table] = vorgang;
      return vorgang;
    });
    // Fehler gesammelt melden, ein Hinweis je Anforderung statt je Tabelle.
    void Promise.allSettled(einzeln).then(() => {
      if (lauf === _ladeLauf && fehlerhaft.length > 0) ladefehlerMelden(fehlerhaft);
    });
  }

  await Promise.allSettled(offen.map((t) => _ladeVorgaenge[t]));
}

/**
 * Baut den Cache nach dem Login auf. Einmal je Sitzung.
 *
 * `sofort` (Tabellen der Startroute plus die globalen) blockiert das
 * Versprechen; danach gilt der Cache als bereit. `danach` (die Kernseiten
 * Dashboard, Inbox, Kontakte, Pipeline, Objekte) folgt im Hintergrund
 * gruppenweise und ohne Pause, damit der erste Klick nicht wartet. `spaeter`
 * (der Rest) kommt gruppenweise bei Leerlauf des Browsers, mit Zeitgrenze,
 * damit die Warteschlange auch auf einer beschaeftigten Seite weiterlaeuft.
 * Den Plan liefert `ladeplanFuerStart` in routenTabellen.ts.
 *
 * Eine Seite, die vorher angeklickt wird, wartet nie auf den Plan: sie
 * fordert ihre Tabellen ueber `ladeTabellen` selbst an und haengt sich an
 * laufende Vorgaenge nur an, statt hinter ihnen zu warten.
 */
export async function initDataCache(plan: Ladeplan = {}): Promise<void> {
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _ladenErlaubt = true;
  const sofort = plan.sofort ?? [];
  const danach = plan.danach ?? [];
  const spaeter = plan.spaeter ?? [];

  // Vor dem Warten festhalten: Wurde inzwischen abgemeldet, darf dieser Lauf
  // `_initialized` nicht mehr setzen, sonst bricht die naechste Anmeldung ihr
  // initDataCache ab und alle Seiten bleiben leer.
  const lauf = _ladeLauf;
  _initPromise = (async () => {
    try {
      if (isTestAccount()) {
        _initialized = true;
        return;
      }

      // Stufe 1: Startroute. Jede Tabelle meldet sich selbst, sobald sie da
      // ist; am Ende eine Meldung fuer Hooks ohne Tabellenliste.
      const beginn = jetztMs();
      await ladeTabellen(sofort);
      if (lauf !== _ladeLauf) return;
      _initialized = true;
      notifyListeners(CACHE_BEREIT_EREIGNIS, "INSERT", null);
      ladezeitLoggen(`Stufe 1 (Startroute, ${sofort.length} Tabellen) fertig nach ${Math.round(jetztMs() - beginn)} ms`);

      void (async () => {
        // Stufe 2: Kernseiten, gruppenweise in Prioritaetsreihenfolge, ohne
        // auf Leerlauf zu warten.
        for (const gruppe of danach) {
          if (lauf !== _ladeLauf) return;
          await ladeTabellen(gruppe);
        }
        ladezeitLoggen(`Stufe 2 (Kernseiten, ${danach.flat().length} Tabellen) fertig nach ${Math.round(jetztMs() - beginn)} ms`);

        // Stufe 3: der Rest, gruppenweise bei Leerlauf.
        for (const gruppe of spaeter) {
          await beiLeerlauf();
          if (lauf !== _ladeLauf) return;
          await ladeTabellen(gruppe);
        }
        ladezeitLoggen(`Stufe 3 (Rest, ${spaeter.flat().length} Tabellen) fertig nach ${Math.round(jetztMs() - beginn)} ms`);
      })();
    } catch (e) {
      console.error("Cache init error:", e);
      if (lauf === _ladeLauf) _initialized = true;
    }
  })();

  return _initPromise;
}

/** Check if cache is initialized */
export function isCacheReady(): boolean {
  return _initialized;
}

/** Check if a specific table has been loaded into cache */
export function isTableLoaded(table: string): boolean {
  if (isTestAccount()) return true;
  return _loadedTables.has(table);
}

/** Alle Tabellen, die derzeit im Cache liegen (fuer Messung und Anzeige). */
export function geladeneTabellen(): string[] {
  return Array.from(_loadedTables);
}

/**
 * Ruft `aktion` auf, sobald alle genannten Tabellen im Cache liegen: sofort,
 * wenn sie schon da sind, sonst einmal nach ihrer Ankunft. Fuer Hooks im
 * App-Rahmen, die auf Tabellen rechnen, die erst eine Route oder das
 * Vorladen bringt. Gibt die Abmeldefunktion zurueck.
 */
export function wennTabellenGeladen(tabellen: string[], aktion: () => void): () => void {
  const fertig = () => tabellen.every((t) => isTableLoaded(t));
  if (fertig()) {
    aktion();
    return () => {};
  }
  let ausgeloest = false;
  const abmelden = onCacheChange(() => {
    if (ausgeloest || !fertig()) return;
    ausgeloest = true;
    abmelden();
    aktion();
  });
  return abmelden;
}

/**
 * Fehlermeldung des letzten fehlgeschlagenen Ladevorgangs, sonst null.
 *
 * Damit kann eine Seite zwischen "es gibt nichts" und "es kam nichts an"
 * unterscheiden, statt beides als leere Liste zu zeigen.
 */
export function cacheLadefehler(table: string): string | null {
  return _ladefehler[table] || null;
}

/** Ist beim Laden dieser Tabelle etwas schiefgegangen? */
export function hatLadefehler(table: string): boolean {
  return !!_ladefehler[table];
}

/** Get all rows from a cached table */
export function cacheGet<T = any>(table: string): T[] {
  if (isTestAccount()) {
    try {
      const raw = localStorage.getItem(`mi_cache_${table}`);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }
  return (_cache[table] || []) as T[];
}

/** Get a single row by id */
export function cacheGetById<T = any>(table: string, id: string): T | undefined {
  return cacheGet<T>(table).find((row: any) => row.id === id);
}

/** Get rows matching a filter */
export function cacheFilter<T = any>(table: string, predicate: (row: T) => boolean): T[] {
  return cacheGet<T>(table).filter(predicate);
}

/** Insert a row - updates cache + awaits DB write */
export async function cacheInsert<T extends Record<string, any>>(table: string, row: T, opts?: { silent?: boolean }): Promise<T> {
  if (isTestAccount()) {
    const rows = cacheGet(table);
    rows.push(row);
    localStorage.setItem(`mi_cache_${table}`, JSON.stringify(rows));
    notifyListeners(table, "INSERT", row);
    return row;
  }

  // Retry bei transienten Netzwerkfehlern (z. B. "Failed to fetch") –
  // erst nach mehreren Fehlversuchen User-Toast zeigen.
  const lauf = _ladeLauf;
  let lastError: any = null;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await db.from(table).insert(row);
      if (!error) { lastError = null; break; }
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout");
      const isDuplicate = String((error as any)?.code || "") === "23505";
      if (isDuplicate) { lastError = null; break; } // Row existiert bereits – ok
      if (!isNetwork) break; // permanenter Fehler – nicht weiter retryen
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || "").toLowerCase();
      if (!(msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout"))) break;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastError) {
    console.error(`cacheInsert ${table}:`, lastError);
    if (!opts?.silent) schreibfehlerMelden(table, "gespeichert");
    throw lastError;
  }

  // Inzwischen abgemeldet oder Konto gewechselt: nicht in den Speicher des
  // neuen Kontos schreiben.
  if (lauf !== _ladeLauf) return row;

  // Update memory cache only after DB confirms
  // (Realtime will also push, but we update locally for instant UX)
  if (!_cache[table]) _cache[table] = [];
  const exists = _cache[table].some((r: any) => r.id === row.id);
  if (!exists) _cache[table].push(row);
  notifyListeners(table, "INSERT", row);

  return row;
}

/** Update a row by id - updates cache + awaits DB write */
export async function cacheUpdate(table: string, id: string, updates: Record<string, any>, opts?: { silent?: boolean }): Promise<boolean> {
  if (isTestAccount()) {
    const rows = cacheGet(table);
    const idx = rows.findIndex((r: any) => r.id === id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...updates };
      localStorage.setItem(`mi_cache_${table}`, JSON.stringify(rows));
      notifyListeners(table, "UPDATE", rows[idx]);
    }
    return idx >= 0;
  }

  // Optimistic: update in-memory cache immediately for instant UI
  const arr = _cache[table] || [];
  const idx = arr.findIndex((r: any) => r.id === id);
  const previousRow = idx >= 0 ? { ...arr[idx] } : null;
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...updates };
    notifyListeners(table, "UPDATE", arr[idx]);
  }

  // Retry bei transienten Netzwerkfehlern – nur bei permanenten Fehlern Toast/Throw
  let lastError: any = null;
  let zurueck: Record<string, unknown> | null = null;
  // Mit Rückgabe der geschriebenen Spalten: null Zeilen heißt abgelehnt,
  // ein abweichender Wert heißt, ein Wächter hat ihn festgehalten.
  const spalten = ["id", ...Object.keys(updates).filter((k) => k !== "id")].join(",");
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await db.from(table).update(updates).eq("id", id).select(spalten);
      if (!error) {
        lastError = null;
        if (Array.isArray(data)) {
          if (data.length === 0) {
            lastError = new SchreibenAbgelehnt("Dir fehlt die Berechtigung für diese Änderung, oder der Eintrag existiert nicht mehr.");
          } else {
            zurueck = data[0] as Record<string, unknown>;
            const felder = nichtUebernommeneFelder(updates, previousRow, zurueck);
            if (felder.length > 0) {
              lastError = new SchreibenAbgelehnt("Dir fehlt die Berechtigung für diese Änderung.", felder);
            }
          }
        }
        break;
      }
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout");
      if (!isNetwork) break;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || "").toLowerCase();
      if (!(msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout"))) break;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastError) {
    console.error(`cacheUpdate ${table}:`, lastError);
    // Rollback optimistic update, nur der eigenen Spalten: Ein gleichzeitig
    // laufendes Zusammenführen von meta (cacheMetaZusammenfuehren) bleibt
    // stehen. Hat die Datenbank geantwortet, gilt ihr Stand.
    if (idx >= 0 && previousRow) {
      const zurueckgesetzt: Record<string, unknown> = {};
      for (const k of Object.keys(updates)) zurueckgesetzt[k] = previousRow[k];
      arr[idx] = { ...arr[idx], ...zurueckgesetzt, ...(zurueck || {}) };
      notifyListeners(table, "UPDATE", arr[idx]);
    }
    if (!opts?.silent) schreibfehlerMelden(table, "aktualisiert", undefined, lastError);
    throw lastError;
  }

  // Was ein Auslöser beim Speichern ergänzt oder angeglichen hat, gleich mit übernehmen.
  if (zurueck && idx >= 0 && arr[idx]) {
    const naechste = { ...arr[idx], ...zurueck };
    if (!gleicherWert(naechste, arr[idx])) {
      arr[idx] = naechste;
      notifyListeners(table, "UPDATE", naechste);
    }
  }

  return idx >= 0;
}

function istObjekt(w: unknown): w is Record<string, unknown> {
  return !!w && typeof w === "object" && !Array.isArray(w);
}

/**
 * Die meta-Schlüssel, die sich gegenüber dem bisherigen Stand geändert haben.
 *
 * Nur ausdrücklich Geändertes geht hinaus: ein Wert, der neu dazukommt oder
 * sich vom alten unterscheidet. Ein Schlüssel, der im neuen Stand fehlt, heißt
 * „nicht erwähnt“, nicht „löschen“ (Prüfung Codex, 04.10.2026: ein neu
 * aufgebautes person2 ohne authUserId hätte sonst die Verknüpfung gelöscht).
 * Einzige Ausnahme oben auf der ersten Ebene: steht ein Schlüssel ausdrücklich
 * mit undefined da (etwa `objektId: undefined` beim Abwählen), geht er als
 * null hinaus, so wie früher das ganze meta ihn weggelassen hat.
 */
export function metaUnterschied(
  alt: Record<string, unknown> | null | undefined,
  neu: Record<string, unknown> | null | undefined,
  optionen: {
    /**
     * Für `merge_kontakt_meta` (jsonb_deep_merge): Unterobjekte nur mit den
     * geänderten Blättern. `merge_investment_meta` führt flach zusammen, dort
     * geht ein geändertes Unterobjekt ganz.
     */
    tief?: boolean;
  } = {},
  ebene = 0,
): Record<string, unknown> {
  const vorher = alt || {};
  const nachher = neu || {};
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(nachher)) {
    if (v === undefined) {
      if (ebene === 0 && vorher[k] !== undefined && vorher[k] !== null) patch[k] = null;
      continue;
    }
    if (gleicherWert(v, vorher[k])) continue;
    if (optionen.tief && istObjekt(v) && istObjekt(vorher[k])) {
      const unter = metaUnterschied(vorher[k] as Record<string, unknown>, v, optionen, ebene + 1);
      if (Object.keys(unter).length > 0) patch[k] = unter;
      continue;
    }
    patch[k] = v;
  }
  return patch;
}

/** Wie `jsonb_deep_merge` in der Datenbank: Objekte rekursiv, alles andere ersetzt. */
export function tiefZusammenfuehren(a: unknown, b: unknown): unknown {
  if (!istObjekt(a) || !istObjekt(b)) return b === undefined ? a : b;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? tiefZusammenfuehren(a[k], v) : v;
  return out;
}

const META_ZUSAMMENFUEHREN: Record<string, { rpc: string; idParam: string }> = {
  kontakte: { rpc: "merge_kontakt_meta", idParam: "_kontakt_id" },
  investments: { rpc: "merge_investment_meta", idParam: "_investment_id" },
};

/**
 * Schreibt nur die übergebenen meta-Schlüssel, über die Datenbankfunktion
 * zum Zusammenführen (H11, 04.10.2026).
 *
 * Vorher ging bei jeder Änderung an Kontakt oder Investment das ganze meta
 * aus dem Zwischenspeicher zurück. War der Speicher veraltet, überschrieb das
 * frischere Werte, die ein anderer Tab, eine Function oder der Kunde im
 * Portal eben geschrieben hatte.
 *
 * Wie `cacheUpdate`: sofort im Speicher sichtbar, bei Fehler zurück und
 * gemeldet, danach gilt der Stand, den die Datenbank zurückgibt. Hat sie
 * einen Schlüssel nicht übernommen (geschützter Schlüssel, Wächter), ist das
 * eine Ablehnung (`SchreibenAbgelehnt`).
 */
export async function cacheMetaZusammenfuehren(
  table: "kontakte" | "investments",
  id: string,
  patch: Record<string, unknown>,
  opts?: { silent?: boolean },
): Promise<Record<string, unknown> | null> {
  if (Object.keys(patch).length === 0) return null;
  if (isTestAccount()) {
    const row = cacheGet(table).find((r: any) => r.id === id);
    const alt = (row?.meta as Record<string, unknown>) || {};
    const meta = (table === "kontakte" ? tiefZusammenfuehren(alt, patch) : { ...alt, ...patch }) as Record<string, unknown>;
    await cacheUpdate(table, id, { meta }, opts);
    return meta;
  }

  const arr = _cache[table] || [];
  const idx = arr.findIndex((r: any) => r.id === id);
  const vorher = idx >= 0 ? { ...arr[idx] } : null;
  const altMeta = (vorher?.meta && typeof vorher.meta === "object" ? vorher.meta : {}) as Record<string, unknown>;
  // kontakte führt die Datenbank tief zusammen, investments flach.
  const angewandt = (table === "kontakte" ? tiefZusammenfuehren(altMeta, patch) : { ...altMeta, ...patch }) as Record<string, unknown>;
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], meta: angewandt };
    notifyListeners(table, "UPDATE", arr[idx]);
  }

  const zurueckRollen = () => {
    if (idx < 0 || !arr[idx]) return;
    const jetzt = (arr[idx].meta || {}) as Record<string, unknown>;
    const meta = { ...jetzt };
    for (const k of Object.keys(patch)) {
      if (k in altMeta) meta[k] = altMeta[k];
      else delete meta[k];
    }
    arr[idx] = { ...arr[idx], meta };
    notifyListeners(table, "UPDATE", arr[idx]);
  };

  const { rpc, idParam } = META_ZUSAMMENFUEHREN[table];
  let antwort: { data: unknown; error: any };
  try {
    antwort = await db.rpc(rpc, { [idParam]: id, _updates: patch });
  } catch (e) {
    antwort = { data: null, error: e };
  }

  if (antwort.error) {
    const code = String(antwort.error?.code || "");
    if (code === "PGRST202" || code === "42883") {
      // Funktion fehlt: wie bisher über das ganze meta, aber aus dem
      // Speicherstand plus Patch.
      zurueckRollen();
      await cacheUpdate(table, id, { meta: angewandt }, opts);
      return angewandt;
    }
    console.error(`cacheMetaZusammenfuehren ${table}:`, antwort.error);
    zurueckRollen();
    if (!opts?.silent) schreibfehlerMelden(table, "aktualisiert", undefined, antwort.error);
    throw antwort.error;
  }

  const dbMeta = (antwort.data && typeof antwort.data === "object" ? antwort.data : null) as Record<string, unknown> | null;
  if (dbMeta && idx >= 0 && arr[idx]) {
    arr[idx] = { ...arr[idx], meta: dbMeta };
    notifyListeners(table, "UPDATE", arr[idx]);
  }
  if (dbMeta) {
    // Nur die gesendeten Blätter gegen die Rückgabe, nicht gegen den Speicher.
    const felder = nichtUebernommeneFelder({ meta: patch }, null, { meta: dbMeta });
    if (felder.length > 0) {
      const fehler = new SchreibenAbgelehnt("Dir fehlt die Berechtigung für diese Änderung.", felder);
      console.error(`cacheMetaZusammenfuehren ${table}: nicht übernommen`, felder);
      if (!opts?.silent) schreibfehlerMelden(table, "aktualisiert", undefined, fehler);
      throw fehler;
    }
  }
  return dbMeta;
}

/**
 * Spalten und meta einer Zeile (Prüfung Codex, 04.10.2026).
 *
 * Erst die Spalten (mit Ablehnungserkennung, siehe cacheUpdate), dann der
 * meta-Patch. Scheitert der zweite Schritt oder übernimmt die Datenbank
 * einzelne Schlüssel nicht, gibt es eine klare Meldung „Teilweise
 * gespeichert“ und der Speicher zeigt den Stand der Datenbank. Zurück
 * geschrieben wird nichts: Ein Gegen-Patch hätte selbst scheitern oder
 * fremde, inzwischen geschriebene Werte überschreiben können.
 */
export async function cacheZeileSchreiben(
  table: "kontakte" | "investments",
  id: string,
  spalten: Record<string, unknown>,
  metaPatch: Record<string, unknown>,
): Promise<boolean> {
  const mitSpalten = Object.keys(spalten).length > 0;
  const mitMeta = Object.keys(metaPatch).length > 0;
  if (mitSpalten) await cacheUpdate(table, id, spalten);
  if (!mitMeta) return true;
  if (!mitSpalten) {
    await cacheMetaZusammenfuehren(table, id, metaPatch);
    return true;
  }
  try {
    await cacheMetaZusammenfuehren(table, id, metaPatch, { silent: true });
  } catch (fehler) {
    const felder = istAbgelehnt(fehler) && fehler.felder.length > 0
      ? fehler.felder.map((f) => f.replace(/^meta\./, "")).join(", ")
      : "die Zusatzangaben";
    toast.error("Teilweise gespeichert", {
      description: `${bezeichnung(table)}: ${felder} wurde nicht übernommen. Der Rest ist gespeichert.`,
    });
    // Abgelehnt: Die Rückgabe steht schon im Speicher. Sonst die Zeile neu laden.
    if (!istAbgelehnt(fehler)) void cacheLadeZeilenFuer(table, "id", id);
    throw fehler;
  }
  return true;
}

/** Delete a row by id - updates cache + awaits DB write */
export async function cacheDelete(table: string, id: string, opts?: { silent?: boolean }): Promise<boolean> {
  if (isTestAccount()) {
    const rows = cacheGet(table).filter((r: any) => r.id !== id);
    localStorage.setItem(`mi_cache_${table}`, JSON.stringify(rows));
    notifyListeners(table, "DELETE", { id });
    return true;
  }

  const lauf = _ladeLauf;
  let lastError: any = null;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await db.from(table).delete().eq("id", id).select("id");
      if (!error) {
        lastError = null;
        if (Array.isArray(data) && data.length === 0) {
          // Null Zeilen: entweder schon weg oder von der Zeilenregel abgelehnt.
          // Nachsehen. Ein Lesefehler ist ein Fehler, eine nicht mehr
          // sichtbare Zeile kein bestätigtes Löschen (Prüfung Codex).
          const { data: noch, error: lesefehler } = await db.from(table).select("id").eq("id", id).maybeSingle();
          if (lesefehler) lastError = lesefehler;
          else if (noch) lastError = new SchreibenAbgelehnt("Dir fehlt die Berechtigung, diesen Eintrag zu löschen.");
          else lastError = new SchreibenAbgelehnt("Das Löschen ließ sich nicht bestätigen. Bitte lade die Seite neu und prüfe den Eintrag.");
        }
        break;
      }
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout");
      // "0 rows" / nicht gefunden = bereits gelöscht → kein Fehler
      const notFound = msg.includes("no rows") || String((error as any)?.code || "") === "PGRST116";
      if (notFound) { lastError = null; break; }
      if (!isNetwork) break;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || "").toLowerCase();
      if (!(msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout"))) break;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastError) {
    console.error(`cacheDelete ${table}:`, lastError);
    if (!opts?.silent) schreibfehlerMelden(table, "gelöscht", undefined, lastError);
    throw lastError;
  }

  if (lauf !== _ladeLauf) return true; // siehe cacheInsert
  _cache[table] = (_cache[table] || []).filter((r: any) => r.id !== id);
  notifyListeners(table, "DELETE", { id });
  return true;
}

/** Upsert a row - updates cache + awaits DB write */
export async function cacheUpsert<T extends Record<string, any>>(table: string, row: T, opts?: { silent?: boolean }): Promise<T> {
  if (isTestAccount()) {
    const rows = cacheGet(table);
    const idx = rows.findIndex((r: any) => r.id === (row as any).id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...row };
    } else {
      rows.push(row);
    }
    localStorage.setItem(`mi_cache_${table}`, JSON.stringify(rows));
    notifyListeners(table, idx >= 0 ? "UPDATE" : "INSERT", row);
    return row;
  }

  const lauf = _ladeLauf;
  let lastError: any = null;
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { error } = await db.from(table).upsert(row);
      if (!error) { lastError = null; break; }
      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      const isNetwork = msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout");
      // Ein Verstoss gegen eine Eindeutigkeitsregel (23505) ist kein Erfolg.
      // Bis zum 04.10.2026 galt er als gespeichert: Ein zweiter Bescheid fuer
      // denselben Partner und Monat ging verloren, und die Seite meldete
      // Erfolg. Ein Upsert ueber die Kennung erzeugt bei einer Wiederholung
      // nach Netzfehler kein 23505, der Fall wird also nicht gebraucht. Der
      // Aufrufer entscheidet, ob er nachlaedt und erneut prueft.
      if (!isNetwork) break;
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || "").toLowerCase();
      if (!(msg.includes("failed to fetch") || msg.includes("network") || msg.includes("timeout"))) break;
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  if (lastError) {
    console.error(`cacheUpsert ${table}:`, lastError);
    if (!opts?.silent) schreibfehlerMelden(table, "gespeichert");
    throw lastError;
  }

  if (lauf !== _ladeLauf) return row; // siehe cacheInsert

  // Update memory cache only after DB confirms
  const arr = _cache[table] || [];
  const idx = arr.findIndex((r: any) => r.id === (row as any).id);
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...row };
    notifyListeners(table, "UPDATE", arr[idx]);
  } else {
    if (!_cache[table]) _cache[table] = [];
    _cache[table].push(row);
    notifyListeners(table, "INSERT", row);
  }

  return row;
}

/**
 * Gezielt nachgeladene Schluessel je Tabelle (etwa alle Aktivitaeten eines
 * Kontakts). Grosse Tabellen laden firmenweit nur die neuesten Zeilen bis zur
 * Zeilengrenze; aeltere Eintraege fehlen dann kommentarlos in der Oberflaeche
 * (gemeldet von Julian Meyer: Notizen von Anfang Juli bei Ellermann und
 * Nostadt waren "verschwunden"). Beim Oeffnen eines Kundenprofils werden die
 * Zeilen dieses Kunden deshalb gezielt nachgeladen und hier vermerkt, damit
 * ein spaeteres Neuladen der Tabelle sie nicht wieder verwirft.
 */
/*
 * Je Tabelle und Spalte, denn dieselbe Tabelle wird nach verschiedenen
 * Spalten nachgeladen: activity_log je Kunde (kontakt_id) im Profil und je
 * Aktion (action) in der Statistik. Mit nur einer Spalte je Tabelle haette
 * der zweite Aufruf die Werte des ersten gegen die falsche Spalte geprueft.
 */
const _gezieltNachgeladen: Record<string, Record<string, Set<string>>> = {};

type GezielteZeile = Record<string, unknown>;

/** Ergaenzt frisch geladene Zeilen um die gemerkten, gezielt nachgeladenen. */
function mitGezieltenZeilen(table: string, neueZeilen: GezielteZeile[]): GezielteZeile[] {
  const merk = _gezieltNachgeladen[table];
  const alt = _cache[table] as GezielteZeile[] | undefined;
  if (!merk || !alt || alt.length === 0) return neueZeilen;
  const ids = new Set(neueZeilen.map((r) => r.id));
  const spalten = Object.entries(merk);
  const behalten = alt.filter(
    (r) => !ids.has(r.id) && spalten.some(([spalte, werte]) => werte.has(String(r[spalte] ?? ""))),
  );
  return behalten.length ? [...neueZeilen, ...behalten] : neueZeilen;
}

/**
 * Laedt alle Zeilen einer Tabelle zu einem Schluesselwert nach (z. B.
 * aktivitaeten mit kunde_id = X) und ergaenzt den Cache um die fehlenden.
 * Fuer Kundenprofile, deren Verlauf aelter ist als das Ladefenster.
 *
 * Liefert true, wenn die Abfrage gelungen ist (auch ohne Treffer). Wer eine
 * Auswertung darauf baut, kann so "nichts gefunden" von "nicht geladen"
 * unterscheiden.
 */
export async function cacheLadeZeilenFuer(table: string, spalte: string, wert: string): Promise<boolean> {
  if (isTestAccount() || !wert || fuerRolleGesperrt(table)) return false;
  const jeSpalte = _gezieltNachgeladen[table] || (_gezieltNachgeladen[table] = {});
  (jeSpalte[spalte] || (jeSpalte[spalte] = new Set())).add(wert);
  const lauf = _ladeLauf;
  try {
    const { data, error } = await grundabfrage(table).eq(spalte, wert).limit(5000);
    if (lauf !== _ladeLauf) return false; // siehe cacheReload
    if (error) throw new Error(error.message);
    const neu = (data || []) as GezielteZeile[];
    if (neu.length === 0) return true;
    const bestand = (_cache[table] || (_cache[table] = [])) as GezielteZeile[];
    const vorhanden = new Set(bestand.map((r) => r.id));
    const fehlend = neu.filter((r) => !vorhanden.has(r.id));
    if (fehlend.length === 0) return true;
    bestand.push(...fehlend);
    notifyListeners(table, "INSERT", null);
    return true;
  } catch (e) {
    console.warn(`Cache: gezieltes Nachladen ${table}/${spalte}=${wert} fehlgeschlagen:`, (e as Error)?.message);
    return false;
  }
}

/** Replace entire cache for a table (used for bulk operations) */
export function cacheSet(table: string, rows: any[]): void {
  if (isTestAccount()) {
    localStorage.setItem(`mi_cache_${table}`, JSON.stringify(rows));
    return;
  }
  _cache[table] = rows;
  _loadedTables.add(table);
  realtimeBinden([table]);
  notifyListeners(table, "INSERT", null);
}

/** Erzwingt das Neuladen einer einzelnen Tabelle. Gleiche Regeln wie oben. */
export async function cacheReload(table: string): Promise<void> {
  if (isTestAccount()) return;
  const lauf = _ladeLauf;
  try {
    const zeilen = await ladeTabelle(table);
    // Inzwischen abgemeldet oder Konto gewechselt: das Ergebnis gehoert zur
    // alten Sitzung und darf den frisch geleerten Speicher nicht fuellen.
    if (lauf !== _ladeLauf) return;
    delete _ladefehler[table];
    _cache[table] = mitGezieltenZeilen(table, zeilen);
    _loadedTables.add(table);
    realtimeBinden([table]);
    notifyListeners(table, "INSERT", null);
  } catch (e: any) {
    if (lauf !== _ladeLauf) return;
    _ladefehler[table] = e?.message || "Fehler";
    console.warn(`Cache: reload ${table} fehlgeschlagen:`, e?.message);
    return;
  }
}

/** Refresh a single table from DB into cache */
/**
 * Lädt eine Tabelle neu, etwa beim Zurückkehren in den Tab.
 *
 * Hier lag der Fehler, dass Einträge nach dem Laden wieder verschwanden. Diese
 * Funktion hatte ihre eigene Abfrage mit limit(5000) ohne Sortierung. Der
 * erste Ladevorgang holte damit eine beliebige Teilmenge, der Neuabgleich beim
 * nächsten Tabwechsel eine andere beliebige Teilmenge. Ein Follow-up, das eben
 * noch in der Zeitleiste stand, fiel dabei einfach heraus.
 *
 * Sortierung und Grenze sind jetzt dieselben wie beim ersten Laden.
 */
export async function cacheRefreshTable(table: string): Promise<void> {
  if (isTestAccount()) return;
  const lauf = _ladeLauf;
  try {
    const zeilen = await ladeTabelle(table);
    if (lauf !== _ladeLauf) return; // siehe cacheReload
    delete _ladefehler[table];
    _cache[table] = mitGezieltenZeilen(table, zeilen);
    _loadedTables.add(table);
    realtimeBinden([table]);
    notifyListeners(table, "INSERT", null);
  } catch (e: any) {
    if (lauf !== _ladeLauf) return;
    _ladefehler[table] = e?.message || "Keine Daten erhalten";
    console.warn(`Cache: refresh ${table} fehlgeschlagen:`, e?.message);
    return;
  }
}

/** Konto, fuer das der Speicher gerade gefuellt ist. */
let _cacheNutzer: string | null = null;

/**
 * Meldet das angemeldete Konto. Meldet sich ein anderes Konto an, ohne dass
 * vorher abgemeldet wurde, wird der Speicher geleert. Dieselbe Kennung, etwa
 * nach einer Token-Erneuerung, laesst ihn stehen.
 */
export function cacheNutzerSetzen(userId: string): void {
  if (_cacheNutzer && _cacheNutzer !== userId) resetCache();
  _cacheNutzer = userId;
}

/** Reset cache (e.g. on logout) */
export function resetCache(): void {
  _ladeLauf += 1;
  _cacheNutzer = null;
  for (const t of Object.keys(_gezieltNachgeladen)) delete _gezieltNachgeladen[t];
  _cache = {};
  _initialized = false;
  _initPromise = null;
  // Die Beobachter bleiben. Viele melden sich einmal beim Laden ihres Moduls
  // an (z. B. investmentsStore) und kaemen nach einem Neustart des Caches
  // sonst nie wieder zum Zug.
  _loadedTables = new Set();
  _ladefehler = {};
  // Nach der Abmeldung faengt alles von vorn an, auch die Entprellung.
  _ladefehlerZuletztGemeldet = {};
  _ladeVorgaenge = {};
  _ladenErlaubt = false;
  _aktiveRolle = "";
  _realtimeWartend = new Set();
  if (_realtimeSammelTimer) {
    clearTimeout(_realtimeSammelTimer);
    _realtimeSammelTimer = null;
  }
  for (const t of Object.keys(_flutRuheTimer)) clearTimeout(_flutRuheTimer[t]);
  _flutRuheTimer = {};
  _flutschutz = {};
  _grosseOperationen = {};
  _letzterResync = 0;
  _seitWannWeg = 0;
  if (_resyncTimer) {
    clearTimeout(_resyncTimer);
    _resyncTimer = null;
  }
  realtimeAlleKanaeleSchliessen();
}
