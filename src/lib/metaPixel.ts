/**
 * Meta Pixel fuer die Partnerseiten (Mikroseite und Handbuch-Seite).
 *
 * Jeder Vertriebspartner kann in den Einstellungen seine eigene Pixel-ID
 * hinterlegen. Das Pixel-Skript von Meta laedt nur
 *   - auf den Routen aus `istMetaPixelRoute`,
 *   - wenn der Besucher dem Pixel DIESES Partners zugestimmt hat
 *     (`hatPartnerMarketingEinwilligung`, frisch aus dem Speicher gelesen).
 *
 * Jede Meldung geht gezielt an die Pixel-ID des Partners (`trackSingle`) und
 * wird vorher erneut geprueft: richtige Route, Partner der Seite, Einwilligung.
 * Ein Merker im Modul ist nie die Freigabe.
 *
 * Ein geladenes Skript von Meta laesst sich nicht wieder entladen. Verlaesst
 * der Besucher den Partnerbereich, wechselt er zu einem anderen Partner oder
 * nimmt er die Einwilligung zurueck (auch in einem anderen Tab), laedt die
 * Seite deshalb neu (`pruefeMetaPixelBindung`, aufgerufen vom Cookie-Banner).
 */
import {
  aktuellerPartnerPixelKontext,
  entferneMetaCookies,
  hatPartnerMarketingEinwilligung,
} from "@/lib/cookieEinwilligung";

/**
 * Eine Meta-Pixel-ID ist eine reine Zahlenfolge (aktuell 15 bis 16 Stellen).
 * Die Spanne ist bewusst etwas grosszuegiger, damit aeltere oder kuenftige
 * IDs nicht abgewiesen werden. Alles andere (Buchstaben, Skripte, URLs) ist
 * keine Pixel-ID und wird weder gespeichert noch geladen.
 */
const PIXEL_ID_MUSTER = /^\d{5,20}$/;

export function istGueltigeMetaPixelId(wert: unknown): wert is string {
  return typeof wert === "string" && PIXEL_ID_MUSTER.test(wert.trim());
}

export type MetaConsent = "zugestimmt" | "abgelehnt";

const CONSENT_SCHLUESSEL = "mi_meta_pixel_einwilligung";

/** Gespeicherte Entscheidung des Besuchers, oder null wenn noch keine vorliegt. */
export function gespeicherterMetaConsent(): MetaConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const wert = window.localStorage.getItem(CONSENT_SCHLUESSEL);
    return wert === "zugestimmt" || wert === "abgelehnt" ? wert : null;
  } catch {
    // Privater Modus oder blockierter Speicher: dann gilt "keine Entscheidung".
    return null;
  }
}

export function merkeMetaConsent(entscheidung: MetaConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_SCHLUESSEL, entscheidung);
  } catch {
    // Ohne Speicher erscheint der Banner beim naechsten Besuch erneut.
    // Geladen wird trotzdem nur nach der aktuellen Zustimmung.
  }
}

/**
 * Gestalt der globalen fbq-Funktion von Meta: bis fbevents.js geladen ist,
 * sammelt sie Aufrufe in `queue`, danach arbeitet `callMethod` sie ab.
 */
interface FbqFunktion {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  push: FbqFunktion;
  loaded: boolean;
  version: string;
  queue: unknown[][];
}

type FbqWindow = typeof window & { fbq?: FbqFunktion & { disablePushState?: boolean }; _fbq?: FbqFunktion };

/**
 * Die Seiten, auf denen ein Partner-Pixel laden und melden darf:
 *   /vp/:kuerzel                          Mikroseite
 *   /handbuch/:kuerzel                    Handbuch-Seite des Partners
 *   /handbuch/:kuerzel/konfigurator       und ihr Konfigurator
 * Bewusst NICHT:
 *   - `/handbuch/:kuerzel/selbstauskunft` (offene Selbstauskunft): Dort gehen
 *     Finanzdaten ein, und Anlage 4 § 1 Abs. 1 nennt die Seite nicht. Seit
 *     27.09.2026 kein Pixel und keine Meldung an Meta (Christian, Punkt 6).
 *     Wer vom Konfigurator dorthin wechselt, bekommt die Seite einmal neu
 *     geladen, ohne Pixel.
 *   - `/handbuch/ergebnis/:token` und `/handbuch/selbstauskunft/:token`: Die
 *     Adresse traegt ein persoenliches Token, und das Pixel meldet Adressen
 *     mit (Sicherheitspruefung vom 26.09.2026). Wer vom Konfigurator dorthin
 *     wechselt, bekommt die Seite einmal neu geladen, ohne Pixel.
 *   - `/analyse/:kuerzel` und `/steuer/:kuerzel`: Dort gibt es kein
 *     Partner-Pixel, und ohne Festlegung hier laedt dort auch keins.
 */
const PIXEL_ROUTEN: readonly RegExp[] = [
  /^\/vp\/([^/]+)$/,
  /^\/handbuch\/(?!(?:konfigurator|selbstauskunft|ergebnis)(?:\/|$))([^/]+)(?:\/konfigurator)?$/,
];

function sauberePfad(pfad: string): string {
  return pfad.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
}

export function istMetaPixelRoute(pfad: string | null | undefined): boolean {
  if (!pfad) return false;
  const p = sauberePfad(pfad);
  return PIXEL_ROUTEN.some((r) => r.test(p));
}

/** Das Partnerkuerzel aus der Adresse, `null` ausserhalb der Pixel-Routen. */
function kuerzelAusPfad(pfad: string): string | null {
  const p = sauberePfad(pfad);
  for (const r of PIXEL_ROUTEN) {
    const m = r.exec(p);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

function aktuellerPfad(): string {
  return typeof window !== "undefined" ? window.location.pathname : "";
}

/** Welches Pixel in diesem Seitenaufruf initialisiert wurde, fuer wen, unter welchem Kuerzel. */
let geladen: { pixelId: string; partnerId: string; kuerzel: string | null } | null = null;

let neuLaden: () => void = () => window.location.reload();

/**
 * Nach einem Widerruf mit offenem Formular: Das Pixel ist per
 * `fbq('consent', 'revoke')` angehalten, das Neuladen wartet, bis kein
 * Formular mehr offen ist (Codex-Pruefung 27.09.2026, PIXEL-002).
 *
 * Laut Meta haelt `fbq('consent', 'revoke')` das Senden an, bis
 * `fbq('consent', 'grant')` kommt ("pause sending Pixel fires to
 * Facebook", developers.facebook.com/docs/meta-pixel/implementation/gdpr).
 * Ein `grant` ruft dieser Code nie, die Pause haelt also bis zum Neuladen.
 * Dazu prueft jede Meldung selbst (`istMetaPixelAktiv`). Das Abschalten ist
 * damit sofort wirksam; das Neuladen raeumt nur noch das Skript weg und darf
 * warten, bis keine halbfertigen Eingaben mehr verloren gehen.
 */
let angehalten = false;
let offeneFormulare = 0;

/** Nur fuer Tests: setzt den Lade-Zustand des Moduls zurueck. */
export function _testResetMetaPixel(): void {
  geladen = null;
  angehalten = false;
  offeneFormulare = 0;
  neuLaden = () => window.location.reload();
}

/**
 * Meldet ein Formular mit halbfertigen Eingaben an (Konfigurator,
 * Selbstauskunft). Solange eines offen ist, laedt ein Widerruf die Seite
 * nicht neu, sondern haelt das Pixel nur an. Gibt die Abmeldung zurueck.
 */
export function meldeFormularOffen(): () => void {
  offeneFormulare += 1;
  let abgemeldet = false;
  return () => {
    if (abgemeldet) return;
    abgemeldet = true;
    offeneFormulare = Math.max(0, offeneFormulare - 1);
  };
}

/** Das Pixel sofort anhalten: nichts mehr an Meta, Cookies weg. */
function pixelAnhalten(): void {
  angehalten = true;
  const w = window as FbqWindow;
  if (typeof w.fbq === "function") w.fbq("consent", "revoke");
  entferneMetaCookies();
}

/** Nur fuer Tests: ersetzt das Neuladen der Seite. */
export function _testSetzeNeuLaden(fn: () => void): void {
  neuLaden = fn;
}

/**
 * Laedt das Meta-Pixel-Skript fuer den Partner und meldet einen PageView an
 * genau seine Pixel-ID. Prueft selbst Route und Einwilligung, ein Aufrufer
 * kann nichts vorbei schleusen. Liefert true, wenn das Pixel danach aktiv ist.
 *
 * War in diesem Seitenaufruf schon das Pixel eines ANDEREN Partners geladen,
 * laedt die Seite neu, statt zwei Pixel nebeneinander laufen zu lassen.
 */
export function ladeMetaPixel(partner: { pixelId: string; partnerId: string }): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const id = String(partner?.pixelId || "").trim();
  const partnerId = String(partner?.partnerId || "").trim().toLowerCase();
  if (!istGueltigeMetaPixelId(id) || !partnerId) return false;
  if (!istMetaPixelRoute(aktuellerPfad())) return false;
  if (!hatPartnerMarketingEinwilligung(partnerId)) return false;
  // Nach einem Widerruf bleibt das Pixel bis zum Neuladen aus, auch wenn
  // derweil wieder zugestimmt wird.
  if (angehalten) return false;
  if (geladen) {
    if (geladen.pixelId === id && geladen.partnerId === partnerId) return true;
    geladen = null;
    neuLaden();
    return false;
  }

  // Standard-Bootstrap von Meta: fbq sammelt Aufrufe in einer Warteschlange,
  // bis fbevents.js geladen ist und sie abarbeitet.
  const w = window as FbqWindow;
  let fbq = w.fbq;
  if (typeof fbq !== "function") {
    const neu = function (...args: unknown[]) {
      if (neu.callMethod) {
        neu.callMethod(...args);
      } else {
        neu.queue.push(args);
      }
    } as FbqFunktion;
    neu.push = neu;
    neu.loaded = true;
    neu.version = "2.0";
    neu.queue = [];
    // Keine eigenen PageViews von Meta bei jedem Seitenwechsel in der App:
    // Sonst meldete das Pixel auch Seiten ausserhalb des Partnerbereichs.
    (neu as FbqFunktion & { disablePushState?: boolean }).disablePushState = true;
    w.fbq = neu;
    if (!w._fbq) w._fbq = neu;

    const skript = document.createElement("script");
    skript.async = true;
    skript.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(skript);
    fbq = neu;
  }

  // Keine automatisch erkannten Ereignisse (Knopfklicks, Formularfelder).
  fbq("set", "autoConfig", false, id);
  fbq("init", id);
  fbq("trackSingle", id, "PageView");
  geladen = { pixelId: id, partnerId, kuerzel: kuerzelAusPfad(aktuellerPfad()) };
  return true;
}

/**
 * Darf JETZT an das Pixel gemeldet werden? Jedes Mal frisch geprueft:
 * geladen, auf einer Pixel-Route, derselbe Partner wie auf der Seite, und
 * dessen Einwilligung liegt im Speicher (ein Widerruf aus einem anderen Tab
 * zaehlt sofort).
 */
export function istMetaPixelAktiv(): boolean {
  if (!geladen || angehalten) return false;
  const kontext = aktuellerPartnerPixelKontext();
  if (!kontext || kontext.partnerId !== geladen.partnerId || kontext.pixelId !== geladen.pixelId) return false;
  if (!istMetaPixelRoute(aktuellerPfad())) return false;
  return hatPartnerMarketingEinwilligung(geladen.partnerId);
}

/**
 * Passt das geladene Pixel noch zu Seite und Einwilligung? Wenn nicht, laedt
 * die Seite neu, denn ein Skript von Meta laesst sich nicht entladen. Ohne
 * Einwilligung verschwinden vorher die Cookies von Meta. Liefert true, wenn
 * neu geladen wird.
 */
export function pruefeMetaPixelBindung(pfad: string = aktuellerPfad()): boolean {
  if (!geladen) return false;
  const ohneEinwilligung = angehalten || !hatPartnerMarketingEinwilligung(geladen.partnerId);
  // Ausserhalb der Pixel-Routen ist das Kuerzel `null`, das zaehlt als fremd.
  const fremdeSeite = kuerzelAusPfad(pfad) !== geladen.kuerzel;
  if (!ohneEinwilligung && !fremdeSeite) return false;
  // Sofort anhalten, ohne auf das Neuladen zu warten.
  if (ohneEinwilligung) pixelAnhalten();
  // Mit offenem Formular auf derselben Seite bleibt es beim Anhalten; neu
  // geladen wird beim naechsten Seitenwechsel oder der naechsten Pruefung
  // ohne offenes Formular. So gehen keine Eingaben verloren.
  if (!fremdeSeite && offeneFormulare > 0) return false;
  geladen = null;
  angehalten = false;
  neuLaden();
  return true;
}

/**
 * Zufaellige Event-ID fuer die Deduplizierung zwischen Browser-Pixel und
 * Conversion-API. Beide Seiten melden dasselbe Lead-Ereignis mit derselben
 * ID, Meta zaehlt es dann nur einmal.
 */
export function erzeugeMetaEventId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Rueckfall fuer sehr alte Browser: 32 zufaellige Hex-Zeichen.
  let id = "";
  for (let i = 0; i < 32; i++) {
    id += Math.floor(Math.random() * 16).toString(16);
  }
  return id;
}

/**
 * Meldet ein Lead-Ereignis gezielt an das Pixel des Partners dieser Seite.
 * Ohne aktuelle Einwilligung, ausserhalb der Pixel-Routen oder ohne Pixel
 * passiert bewusst nichts.
 */
export function meldeMetaLead(eventId: string): void {
  if (!istMetaPixelAktiv() || !geladen) return;
  const w = window as FbqWindow;
  if (typeof w.fbq !== "function") return;
  w.fbq("trackSingle", geladen.pixelId, "Lead", {}, { eventID: eventId });
}
