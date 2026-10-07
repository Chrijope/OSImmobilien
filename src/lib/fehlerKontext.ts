import { toast } from "sonner";

/**
 * Fehlerkontext für die Bug-Meldung.
 *
 * Hintergrund: Bisher erreichte ein Fehler das Team nur, wenn ein Partner von
 * selbst auf das rote Dreieck geklickt hat. Es gab weder globale Handler noch
 * eine Aufzeichnung dessen, was vorher passiert ist. In der Praxis heißt das:
 * Die meisten Fehler werden nie gemeldet, und die gemeldeten enthalten zu
 * wenig, um sie nachzustellen.
 *
 * Diese Datei sammelt drei Dinge, alle nur im Arbeitsspeicher des Browsers:
 *   1. die letzten Konsolenmeldungen,
 *   2. die letzten Nutzerschritte, also Seitenwechsel und Klicks auf Knöpfe,
 *   3. den zuletzt aufgetretenen technischen Fehler.
 *
 * Bewusst NICHT aufgezeichnet: Eingabewerte, Feldinhalte, Zwischenablage. Ein
 * Klickpfad soll den Weg zeigen, nicht die Daten des Kunden.
 */

const MAX_KONSOLE = 30;
const MAX_SCHRITTE = 20;

export interface KonsolenEintrag {
  zeit: string;
  art: "error" | "warn";
  text: string;
}

export interface NutzerSchritt {
  zeit: string;
  was: string;
}

export interface TechnischerFehler {
  meldung: string;
  stack?: string;
  quelle: "boundary" | "window" | "promise" | "manuell";
  route: string;
  zeit: string;
  /** Stabiler Fingerabdruck aus Meldung und Route, um Tickets zu bündeln. */
  fingerabdruck: string;
  /**
   * Gröberer Fingerabdruck allein aus der Meldung, ohne Route.
   *
   * Nur für die Ruhepause gedacht, siehe `ruhefingerabdruckFuer`.
   */
  ruhefingerabdruck: string;
}

const konsole: KonsolenEintrag[] = [];
const schritte: NutzerSchritt[] = [];
let letzterFehler: TechnischerFehler | null = null;

function uhrzeit(): string {
  const d = new Date();
  return d.toLocaleTimeString("de-DE", { hour12: false }) + "." +
    String(d.getMilliseconds()).padStart(3, "0");
}

function kuerzen(text: string, max = 300): string {
  return text.length > max ? text.slice(0, max) + " …" : text;
}

/**
 * Beliebiger Fehlerwert als lesbarer Text.
 *
 * Hintergrund: Ein automatisch erzeugtes Ticket trug als Betreff woertlich
 * "[object Object]". Ein abgelehntes Versprechen liefert als Grund naemlich
 * oft kein Error-Objekt, sondern das Fehlerobjekt von Supabase. `String(...)`
 * macht daraus "[object Object]" und wirft damit genau die Information weg,
 * auf die es ankommt. Ausgerechnet die Fehlermeldung verlor so den Fehler.
 *
 * Reihenfolge:
 *   1. Zeichenkette bleibt, wie sie ist.
 *   2. Ein Error liefert seine Meldung.
 *   3. Ein Objekt mit `message` liefert diese Meldung. Das trifft auf die
 *      Fehlerobjekte von Supabase zu (message, code, details, hint) und auch
 *      auf DOMException. Code und Details stehen ohnehin im technischen
 *      Anhang des Tickets, der Betreff bleibt dadurch lesbar.
 *   4. Jedes andere Objekt erscheint notfalls als JSON.
 */
export function fehlerAlsText(wert: unknown): string {
  if (typeof wert === "string") return wert;
  if (wert instanceof Error) return wert.message || wert.name || "Fehler ohne Meldung";
  if (wert && typeof wert === "object") {
    const meldung = (wert as { message?: unknown }).message;
    if (typeof meldung === "string" && meldung.trim()) return meldung.trim();
    try {
      const json = JSON.stringify(wert);
      if (json && json !== "{}") return json;
    } catch { /* zyklische Struktur, dann eben ueber den Namen */ }
    const name = (wert as { constructor?: { name?: string } }).constructor?.name;
    return name && name !== "Object" ? name : "Unbekannter Fehler ohne Meldung";
  }
  return String(wert);
}

/**
 * Einzeiliger Betreff aus einer Fehlermeldung.
 *
 * Das Betrefffeld im Meldedialog nimmt hoechstens 120 Zeichen. Eine lange
 * Meldung oder ein JSON-Text wurde vorher hart abgeschnitten, ohne dass man
 * es dem Betreff ansah. Zeilenumbrueche fielen ausserdem in das einzeilige
 * Feld und wurden dort unsichtbar.
 */
export function betreffAusFehler(meldung: string, max = 120): string {
  const eineZeile = meldung.replace(/\s+/g, " ").trim();
  if (eineZeile.length <= max) return eineZeile;
  return eineZeile.slice(0, max - 1).trimEnd() + "…";
}

/** Meldung ohne Zahlen, IDs und Anführungszeichen, damit sie vergleichbar wird. */
function normiereMeldung(meldung: string): string {
  return meldung
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\d+/g, "<n>")
    .replace(/["'`]/g, "")
    .trim()
    .slice(0, 160);
}

/** FNV-1a, kurz und stabil. Es geht um Wiedererkennung, nicht um Sicherheit. */
function hashe(text: string): string {
  let h = 2166136261;
  for (const zeichen of text) {
    h ^= zeichen.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Fingerabdruck aus Meldung und Route, für die Bündelung von Support-Tickets.
 *
 * Zahlen, IDs und Anführungszeichen fliegen raus, damit derselbe Fehler bei
 * zwei Kunden denselben Abdruck bekommt und nicht zwei Tickets erzeugt.
 *
 * Die Route bleibt hier bewusst enthalten, obwohl sie für die Ruhepause
 * schädlich ist (siehe `ruhefingerabdruckFuer`). Zwei Gründe: Die schon in
 * `support_tickets.meta.fingerabdruck` gespeicherten Abdrücke sind nach dieser
 * Formel entstanden. Eine Änderung hier hätte zur Folge, dass neue Meldungen
 * nicht mehr an die bereits offenen Tickets andocken, also ausgerechnet bei den
 * Fehlern, die gerade Tickets erzeugen. Und für die IT ist es ein Unterschied,
 * ob dieselbe Meldung nur auf der Pipeline oder überall auftritt.
 */
export function fingerabdruckFuer(meldung: string, route: string): string {
  const routeNormiert = route.replace(/\/[0-9a-f-]{8,}/gi, "/<id>").replace(/\/\d+/g, "/<n>");
  return hashe(normiereMeldung(meldung) + "|" + routeNormiert);
}

/**
 * Gröberer Fingerabdruck allein aus der Meldung, ohne Route.
 *
 * Am 16.09.2026 meldete ein Vertriebspartner, er bekomme "die ganze Zeit
 * Fehlercodes, egal wo ich rumklicke". Einer der Verstärker war genau die
 * Route im Fingerabdruck: Derselbe Fehler auf /pipeline, /kontakte und
 * /reservierung ergab drei verschiedene Abdrücke, und die Ruhepause in
 * `darfFehlerHinweisZeigen` ließ ihn deshalb dreimal durch. Für die Frage
 * "hat der Nutzer diesen Fehler schon gesehen?" ist die Seite egal.
 *
 * Bewusst ein zweites Merkmal statt eines Umbaus des bestehenden: Die
 * Ticket-Bündelung hängt am alten Abdruck und soll sich nicht verschlechtern.
 */
export function ruhefingerabdruckFuer(meldung: string): string {
  return hashe(normiereMeldung(meldung));
}

// ── Aufzeichnung ──────────────────────────────────────────────────────────

export function merkeNutzerschritt(was: string): void {
  schritte.push({ zeit: uhrzeit(), was: kuerzen(was, 120) });
  if (schritte.length > MAX_SCHRITTE) schritte.shift();
}

export function merkeFehler(
  f: Omit<TechnischerFehler, "zeit" | "fingerabdruck" | "ruhefingerabdruck">,
): TechnischerFehler {
  const voll: TechnischerFehler = {
    ...f,
    meldung: kuerzen(f.meldung, 500),
    stack: f.stack ? kuerzen(f.stack, 2000) : undefined,
    zeit: new Date().toISOString(),
    fingerabdruck: fingerabdruckFuer(f.meldung, f.route),
    ruhefingerabdruck: ruhefingerabdruckFuer(f.meldung),
  };
  letzterFehler = voll;
  return voll;
}

export function holeLetztenFehler(): TechnischerFehler | null {
  return letzterFehler;
}

export function holeKonsole(): KonsolenEintrag[] {
  return [...konsole];
}

export function holeSchritte(): NutzerSchritt[] {
  return [...schritte];
}

/** Alles, was an ein Ticket angehängt wird, an einer Stelle. */
export function holeKontext() {
  return {
    route: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
    url: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    bildschirm: typeof window !== "undefined"
      ? `${window.innerWidth}x${window.innerHeight}`
      : "",
    sprache: typeof navigator !== "undefined" ? navigator.language : "",
    zeit: new Date().toISOString(),
    fehler: letzterFehler,
    konsole: holeKonsole(),
    schritte: holeSchritte(),
  };
}

export type FehlerKontext = ReturnType<typeof holeKontext>;

/** Lesbare Zusammenfassung für das Beschreibungsfeld und die E-Mail. */
export function kontextAlsText(k: FehlerKontext): string {
  const zeilen: string[] = [];
  if (k.fehler) {
    zeilen.push(`Fehler: ${k.fehler.meldung}`);
    zeilen.push(`Quelle: ${k.fehler.quelle}, Route: ${k.fehler.route}`);
  }
  zeilen.push(`Adresse: ${k.url}`);
  zeilen.push(`Fenster: ${k.bildschirm}, Sprache: ${k.sprache}`);
  if (k.schritte.length) {
    zeilen.push("");
    zeilen.push("Letzte Schritte:");
    for (const s of k.schritte.slice(-8)) zeilen.push(`  ${s.zeit}  ${s.was}`);
  }
  if (k.konsole.length) {
    zeilen.push("");
    zeilen.push("Letzte Meldungen:");
    for (const c of k.konsole.slice(-5)) zeilen.push(`  ${c.zeit}  [${c.art}] ${c.text}`);
  }
  return zeilen.join("\n");
}

// ── Globale Handler ───────────────────────────────────────────────────────

let installiert = false;

/*
 * Browser-Erweiterungen (MetaMask, Wallets, Passwortmanager) werfen in die
 * Seite hinein Fehler, die mit der Anwendung nichts zu tun haben. Sie sollen
 * den Fehlerdialog nicht mehr auslösen, sonst melden Nutzer Fehler, die es
 * bei uns gar nicht gibt.
 */
const FREMD_MUSTER = [
  /metamask/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  /safari-extension:\/\//i,
  /ethereum/i,
  /web3/i,
  /solana/i,
  /Cannot redefine property: (ethereum|solana)/i,
];

export function istFremdfehler(meldung?: string, stack?: string): boolean {
  const text = `${meldung || ""} ${stack || ""}`;
  return FREMD_MUSTER.some((m) => m.test(text));
}

/**
 * Reine Netzwerkfehler: Der Browser hat den Server gar nicht erreicht.
 *
 * "Failed to fetch" heisst Chrome, "Load failed" heisst Safari, dazu die
 * ueblichen Timeout-Formulierungen. Solche Aussetzer sind kein Absturz der
 * Anwendung: Ein rotes "Etwas ist schiefgelaufen" samt Fehlerbericht mit
 * hoher Prioritaet erschreckt den Nutzer und hilft niemandem, denn am WLAN
 * des Nutzers kann niemand im Haus etwas reparieren.
 */
export function istNetzfehler(meldung?: string, stack?: string): boolean {
  const text = `${meldung || ""} ${stack || ""}`;
  return /failed to fetch|load failed|networkerror|network request failed|err_internet_disconnected|timeout/i.test(text);
}

/**
 * Sperren-Konflikte der Supabase-Anmeldung ("Lock was stolen by another
 * request", "Lock broken by steal").
 *
 * Supabase Auth koordiniert das Auffrischen der Sitzung ueber eine
 * Browser-Sperre (Navigator LockManager). Laufen zwei Tabs oder zwei
 * parallele Anfragen gleichzeitig los, gewinnt eine und die andere bricht
 * mit dieser Ausnahme ab. Die Gewinnerin erledigt exakt dieselbe Arbeit,
 * es geht also nichts verloren. Ein Fehlerdialog mit Prioritaet "Hoch"
 * ist hier Fehlalarm, besonders beim Einloggen.
 */
export function istAuthLockKonflikt(meldung?: string, stack?: string): boolean {
  const text = `${meldung || ""} ${stack || ""}`;
  return /lock (was stolen|broken) by (another request|steal)|navigator ?lockmanager lock|lockacquiretimeouterror|"?lock:sb-/i.test(text);
}

/** Hoechstens alle 15 Sekunden eine Netz-Meldung: Ein Aussetzer laesst viele Anfragen gleichzeitig scheitern. */
let letzteNetzMeldungMs = 0;

function meldeNetzAussetzer(): void {
  const jetzt = Date.now();
  if (jetzt - letzteNetzMeldungMs < 15000) return;
  letzteNetzMeldungMs = jetzt;
  toast.error("Keine Internetverbindung.", {
    description:
      "Die letzte Änderung wurde nicht gespeichert. Bitte prüfe kurz, ob sie angekommen ist, und versuche es erneut.",
    duration: 8000,
  });
}

/**
 * Fängt auf, was heute ins Leere läuft.
 *
 * `onFehler` wird nur für echte Abstürze aufgerufen, also für nicht behandelte
 * Ausnahmen und abgelehnte Versprechen. Fehler-Toasts lösen das bewusst nicht
 * aus, sonst geht bei jedem fehlgeschlagenen Speichern ein Dialog auf und
 * niemand liest ihn nach dem dritten Mal.
 */
export function installiereFehlerAufzeichnung(onFehler?: (f: TechnischerFehler) => void): void {
  if (installiert || typeof window === "undefined") return;
  installiert = true;

  // Konsole mitschreiben, ohne ihr Verhalten zu ändern.
  for (const art of ["error", "warn"] as const) {
    const original = console[art].bind(console);
    console[art] = (...args: unknown[]) => {
      try {
        konsole.push({
          zeit: uhrzeit(),
          art,
          text: kuerzen(
            args
              .map((a) => {
                if (a instanceof Error) return `${a.name}: ${a.message}`;
                if (typeof a === "object") {
                  try { return JSON.stringify(a); } catch { return "[Objekt]"; }
                }
                return String(a);
              })
              .join(" "),
          ),
        });
        if (konsole.length > MAX_KONSOLE) konsole.shift();
      } catch { /* Aufzeichnung darf nie die Anwendung stören */ }
      original(...args);
    };
  }

  window.addEventListener("error", (e) => {
    // Fehler beim Laden von Bildern und Skripten haben kein Error-Objekt.
    if (!e.error && !e.message) return;
    const stackW = e.error instanceof Error ? e.error.stack : undefined;
    if (istFremdfehler(e.message || fehlerAlsText(e.error), stackW)) return;
    if (istAuthLockKonflikt(e.message || fehlerAlsText(e.error), stackW)) return;
    if (istNetzfehler(e.message || fehlerAlsText(e.error), stackW)) { meldeNetzAussetzer(); return; }
    const f = merkeFehler({
      meldung: e.message || fehlerAlsText(e.error),
      stack: stackW,
      quelle: "window",
      route: window.location.pathname,
    });
    onFehler?.(f);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const grund = e.reason;
    const stackP = grund instanceof Error ? grund.stack : undefined;
    if (istFremdfehler(fehlerAlsText(grund), stackP)) return;
    if (istAuthLockKonflikt(fehlerAlsText(grund), stackP)) return;
    if (istNetzfehler(fehlerAlsText(grund), stackP)) { meldeNetzAussetzer(); return; }
    const f = merkeFehler({
      meldung: fehlerAlsText(grund),
      stack: stackP,
      quelle: "promise",
      route: window.location.pathname,
    });
    onFehler?.(f);
  });

  // Klicks auf Knöpfe und Links als Schritte merken, ohne Eingabewerte.
  window.addEventListener(
    "click",
    (e) => {
      const ziel = (e.target as HTMLElement | null)?.closest("button, a, [role='tab']");
      if (!ziel) return;
      const text = (ziel.getAttribute("aria-label") || ziel.textContent || "").trim();
      if (!text) return;
      merkeNutzerschritt(`Klick: ${text.slice(0, 60)}`);
    },
    true,
  );
}

// ── Über einen Neustart hinweg ────────────────────────────────────────────

const SPEICHER_KEY = "va_letzter_fehler";

/**
 * Die oberste Fehlerseite ersetzt die gesamte Anwendung, also auch den
 * Meldedialog. Der Weg dorthin führt deshalb über einen Neustart: Fehler
 * merken, Seite neu laden, Dialog danach automatisch öffnen.
 */
export function speichereFuerNeuladen(f: TechnischerFehler): void {
  try {
    sessionStorage.setItem(SPEICHER_KEY, JSON.stringify({ fehler: f, schritte, konsole }));
  } catch { /* Speicher gesperrt, dann eben ohne */ }
}

export function holeGespeichertenFehler(): TechnischerFehler | null {
  try {
    const roh = sessionStorage.getItem(SPEICHER_KEY);
    if (!roh) return null;
    const daten = JSON.parse(roh) as {
      fehler: TechnischerFehler;
      schritte?: NutzerSchritt[];
      konsole?: KonsolenEintrag[];
    };
    sessionStorage.removeItem(SPEICHER_KEY);
    // Der Verlauf von vor dem Neuladen ist der interessante, nicht der leere danach.
    if (daten.schritte?.length) schritte.push(...daten.schritte.slice(-MAX_SCHRITTE));
    if (daten.konsole?.length) konsole.push(...daten.konsole.slice(-MAX_KONSOLE));
    letzterFehler = daten.fehler;
    return daten.fehler;
  } catch {
    return null;
  }
}
