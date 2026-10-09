import { getVisibleStatistikTabs } from './statistikenTabs';
import type { UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import { INVESTMENTRECHNER_PLUS_ROUTE, INVESTMENTRECHNER_ROUTE, canAccessInvestmentrechner } from "@/lib/investmentrechnerAccess";
import {
  darfBewerberprozess,
  darfVideocallBereich,
  istBewerberprozessRoute,
  istVideocallRoute,
} from "@/lib/bewerberprozessFreigabe";
import { darfHandbuchSeite, istHandbuchSeiteRoute } from "@/lib/handbuch/zugang";
import { getAppConfig } from "@/lib/appConfigStore";

/**
 * Ankaufstool (Bauträger-Kalkulator), seit dem 07.10.2026. Ein internes
 * Werkzeug der Hausleitung: nur Admin und Inhaber (seit 09.10.2026 ohne die
 * Vertriebsleitung, Christians Vorgabe).
 */
export const ANKAUFSTOOL_ROUTE = "/ankaufstool";
const ANKAUFSTOOL_ROLLEN: readonly string[] = ["admin", "inhaber"];
/** Mietsubvention (Subventions-Kalkulator), seit dem 08.10.2026; dieselben Rollen wie das Ankaufstool. */
export const MIETSUBVENTION_ROUTE = "/mietsubvention";
/** Kaufpreisliste (Einheiten, Mieter, Hausgeld aus Wirtschaftsplan), seit dem 09.10.2026; dieselben Rollen wie das Ankaufstool. */
export const KAUFPREISLISTE_ROUTE = "/kaufpreisliste";

// Roles that see everything
// New routes: /follow-ups, /empfehlungen, /einheitenspiegel, /afa-rechner
const FULL_ACCESS_ROLES: UserRole[] = ["inhaber", "admin", "individuell", "testaccount"];

// Restricted roles → allowed URLs
// FALLBACK only — die Single Source of Truth ist seit „Tag 3" die Tabelle
// `public.role_permissions`. Wir behalten diese Konstanten, damit die App
// auch ohne DB-Antwort sinnvoll bootet (Offline / kurzer Lade-Moment).
const ROLE_ALLOWED_URLS_FALLBACK: Partial<Record<UserRole, string[]>> = {
  buchhaltung: [
    "/", "/inbox", "/news",
    "/abrechnungen", "/chat", "/ansprechpartner", "/academy",
    "/vertriebsakademie",
    // Kundenprofil und Pipeline, um Abrechnung und Abschluss zu setzen
    // (04.10.2026, Migration 20261004171000).
    "/kunden", "/pipeline",
  ],
  setterin: [
    "/", "/inbox", "/news",
    "/lead-verwaltung", "/meine-leads", "/pipeline", "/kunden", "/papierkorb",
    "/ansprechpartner", "/academy", "/einstellungen",
    "/chat", "/vertriebsakademie", "/vertriebshandbuch",
  ],
  objektpartner: [
    "/", "/news",
    "/objekte-neu", "/objekte", "/objekte/neu", "/objekte/bearbeiten",
    "/objekt-akquise", "/objekt-einreichungen",
    "/afa-rechner",
    "/chat", "/support-kontaktieren",
    "/ansprechpartner", "/einstellungen",
    "/marktanalyse",
  ],
  kunde: ["/kunde/stammdaten", "/kunde/chat", "/kunde/investments", "/kunde/steuer-cockpit", "/kunde/kundenordner", "/kunde/empfehlungen", "/kunde/einstellungen", "/kunde/vp-bewertung"],
  tippgeber: [
    "/tippgeber-portal",
    "/einstellungen",
  ],
  vertriebspartner: [
    "/", "/inbox", "/news",
    "/meine-leads", "/alle-kontakte", "/kontakte", "/follow-up", "/neukunden", "/abwicklung", "/bestandskunden", "/bestandskunden-import", "/verloren", "/pipeline",
    "/empfehlungen", "/follow-ups", "/reservierung", "/papierkorb",
    "/objekte-neu", "/objekte", "/objekt-akquise", "/objekt-einreichungen",
    "/auswertungen", "/statistiken", "/analysetool", "/steuerrechner", "/abrechnungen", "/provisionsabrechnung",
    "/weekly-call", "/zielplanung", "/wettbewerb", "/vertriebshandbuch",
    "/afa-rechner", "/academy", "/immobilien-lexikon",
    "/praesentation", "/unterlagen", "/chat", "/support-kontaktieren",
    "/ansprechpartner", "/berater-microseite", "/teampartner",
    "/einstellungen", "/kunden", "/vertriebsakademie",
    // Sub-Routen, die aus Unterlagen/Präsentation heraus aufgerufen werden
    "/aftersales", "/leitfaeden", "/wissenswert", "/marketing", "/bonitaet",
    "/marktanalyse",
  ],
  finanzierungspartner: [
    "/", "/inbox", "/news",
    "/objekte-neu", "/objekte", "/abwicklung", "/kunden",
    "/alle-kontakte", "/kontakte", "/follow-up", "/neukunden", "/bestandskunden", "/pipeline",
    "/afa-rechner",
    "/chat", "/support-kontaktieren",
    "/ansprechpartner", "/einstellungen",
  ],
  hausverwaltung: [
    "/", "/inbox", "/news",
    "/objekte-neu", "/objekte",
    "/mieter", "/eigentuemer", "/dienstleister",
    "/hv-uebersicht", "/hv-tickets", "/hv-kommunikation", "/hv-statistiken",
    "/vermietung", "/einheitenspiegel",
    "/betriebskostenabrechnung", "/kautionen", "/zaehlerstaende",
    "/fristenueberwachung", "/versicherungen",
    "/afa-rechner", "/bonitaetsrechner", "/immobilien-lexikon",
    "/chat", "/support-kontaktieren",
    "/ansprechpartner", "/einstellungen",
  ],
  versicherungsexperte: [
    "/", "/inbox", "/news",
    "/verloren", "/kunden", "/pipeline",
    "/chat", "/support-kontaktieren",
    "/ansprechpartner", "/einstellungen",
  ],
  vertriebsleiter: [
    "/", "/inbox", "/news",
    "/lead-verwaltung", "/meine-leads", "/alle-kontakte", "/kontakte", "/follow-up",
    "/neukunden", "/abwicklung", "/bestandskunden", "/bestandskunden-import", "/verloren", "/pipeline",
    "/empfehlungen", "/follow-ups", "/reservierung", "/papierkorb",
    "/objekte-neu", "/objekte", "/objekt-einreichungen",
    "/auswertungen", "/statistiken", "/analysetool", "/steuerrechner", "/abrechnungen",
    "/provisionsabrechnung",
    "/weekly-call", "/zielplanung", "/wettbewerb",
    "/afa-rechner", "/bonitaetsrechner",
    "/academy", "/immobilien-lexikon",
    "/praesentation", "/unterlagen", "/vertriebsakademie",
    "/marketing",
    /*
     * Der Helpdesk, seit dem 16.09.2026. Die Vertriebsleitung sieht dort die
     * Tickets ihrer eigenen Partner, nicht alle. Die Grenze zieht die
     * Leseregel in der Datenbank (Migration 20260916110000), nicht diese
     * Liste. Ohne die Freigabe hier war die Dashboard-Kachel "Helpdesk" fuer
     * die Vertriebsleitung sichtbar, fuehrte aber auf eine gesperrte Seite.
     */
    "/chat", "/support-kontaktieren", "/helpdesk",
    "/teampartner", "/ansprechpartner", "/berater-microseite",
    "/karriere",
    "/einstellungen", "/kunden",
    "/aftersales", "/leitfaeden", "/wissenswert", "/bonitaet",
    "/vp-bewertungen",
    "/marktanalyse",
  ],
  hr: [
    "/", "/inbox", "/news",
    /*
     * Der Kalender, seit dem 15.09.2026. Die HR-Managerin sieht dort dieselben
     * gebuchten Termine wie im Buchungskalender, nur nach Tagen sortiert. Ohne
     * diese Freigabe stand der Punkt fuer sie auf "Bald verfuegbar".
     */
    "/kalender",
    // Das Bewerbungsmanagement ist entfallen, seine Aufgabe hat der
    // Bewerberprozess uebernommen. Massgeblich ist ohnehin die Tabelle
    // `role_permissions`, siehe Migration 20260910120000.
    "/bewerberprozess",
    "/karriere",
    "/teampartner", "/ansprechpartner",
    /*
     * Der Videocall-Bereich mit seinen drei Punkten. Der Buchungskalender ist
     * der wichtigste: Dort traegt die HR-Managerin ihre Terminart, ihre Zeiten
     * und ihre Abwesenheiten ein. Ohne diese Zeiten findet
     * `bewerber_termin_gastgeber()` keinen Gastgeber, und kein Bewerber kann
     * buchen. Die Sperre in NUR_ADMIN_ROUTEN laesst `hr` deshalb ausdruecklich
     * durch, siehe die Begruendung dort.
     */
    "/videocall", "/videocall/buchungen", "/videocall/einstellungen",
    // `/nutzerverwaltung` ist HR am 10.09.2026 entzogen worden. Dort lassen
    // sich Nutzer anlegen und **Rollen aendern**, das ist ein Recht der
    // Hausleitung und keines des Bewerbermanagements. Wer einem neuen Partner
    // seinen Zugang einrichten soll, bekommt das ueber eine gezielte Freigabe
    // in `custom_permissions`, nicht ueber die ganze Rolle.
    /*
     * Der Helpdesk ist HR am 16.09.2026 entzogen worden. Dort laufen die
     * Stoerungsmeldungen aus dem Vertrieb auf, mit dem technischen Anhang der
     * Fehlerberichte: besuchte Adresse, Konsolenmeldungen, Bildschirmabzug.
     * Darin stehen regelmaessig Kundendaten. Das Bewerbermanagement ist dafuer
     * nicht zustaendig. Eigene Tickets schreiben und verfolgen geht weiterhin
     * ueber `/support-kontaktieren`.
     */
    "/chat", "/support-kontaktieren",
    /*
     * Wissen, Stand 11.09.2026. Das Immobilien-Lexikon ist heraus: Es erklaert
     * Fachbegriffe der Kapitalanlage und gehoert in den Vertrieb, nicht ins
     * Bewerbermanagement. Stattdessen das, womit im Bewerbergespraech
     * tatsaechlich gearbeitet wird: unsere Kultur, die Unterlagen und die
     * Praesentation.
     */
    "/kultur", "/unterlagen", "/praesentation",
    /*
     * Marketing. `/shop` ist weiterhin als Entwurf gekennzeichnet
     * (`draft: true` am Navigationseintrag), deshalb steht dort fuer hr
     * "Bald verfuegbar" statt eines Links. Die Freigabe steht trotzdem schon,
     * damit der Punkt ohne weitere Aenderung arbeitet, sobald der Entwurf
     * faellt.
     */
    "/marketing", "/shop",
    // Auswertung: nur der Wettbewerb, die uebrigen Auswertungen bleiben zu.
    "/wettbewerb",
    "/einstellungen",
  ],
  backoffice: [
    "/", "/inbox", "/news",
    "/alle-kontakte", "/kontakte", "/follow-up", "/neukunden", "/bestandskunden", "/bestandskunden-import",
    "/kunden", "/abwicklung", "/pipeline", "/verloren",
    "/reservierung", "/follow-ups",
    "/unterlagen", "/praesentation",
    "/objekte-neu", "/objekte", "/einheitenspiegel",
    "/afa-rechner", "/bonitaetsrechner",
    "/immobilien-lexikon",
    "/abrechnungen", "/provisionsabrechnung",
    "/auswertungen", "/statistiken", "/analysetool", "/steuerrechner",
    "/chat", "/helpdesk", "/support-kontaktieren",
    "/ansprechpartner", "/teampartner", "/nutzerverwaltung",
    "/berater-microseite", "/einstellungen", "/vertriebsakademie",
    "/aftersales", "/leitfaeden", "/wissenswert", "/bonitaet",
    "/vp-bewertungen",
  ],
};

// ── Runtime-Cache aus public.role_permissions ────────────────────────────
// Wird einmal pro Tab gefüllt + per Realtime invalidiert. Solange der Cache
// noch nicht da ist, greift der Fallback oben.
const CACHE_KEY = "role_permissions_v1";
let runtimeCache: Partial<Record<UserRole, string[]>> | null = null;
let loadPromise: Promise<void> | null = null;

function readCachedFromStorage(): Partial<Record<UserRole, string[]>> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch { return null; }
}

// Bootstrap: warmer Cache aus localStorage, damit der allererste Render
// schon DB-Werte sieht.
runtimeCache = readCachedFromStorage();

async function fetchRolePermissions(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("role_permissions" as any)
      .select("role, url");
    if (error || !data) return;
    const map: Record<string, string[]> = {};
    for (const row of data as unknown as { role: string; url: string }[]) {
      (map[row.role] ||= []).push(row.url);
    }
    runtimeCache = map as Partial<Record<UserRole, string[]>>;
    if (typeof window !== "undefined") {
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(map)); } catch {}
    }
  } catch { /* fall back to constants */ }
}

export function loadRolePermissions(): Promise<void> {
  if (!loadPromise) loadPromise = fetchRolePermissions();
  return loadPromise;
}

// Realtime: bei Änderung der Tabelle Cache neu ziehen.
if (typeof window !== "undefined") {
  try {
    supabase
      .channel("role_permissions_sync")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "role_permissions" }, () => {
        loadPromise = fetchRolePermissions();
      })
      .subscribe();
  } catch { /* offline / not yet ready */ }
  // initial fetch
  loadRolePermissions();
}

function getAllowedUrlsFor(role: UserRole): string[] | undefined {
  return runtimeCache?.[role] ?? ROLE_ALLOWED_URLS_FALLBACK[role];
}

/**
 * Routen, die für einzelne Rollen gesperrt bleiben, auch wenn sie in
 * `public.role_permissions` oder in individuellen Berechtigungen stehen.
 *
 * Der Grund für diese zweite Ebene: Die Freigabeliste liegt in der Datenbank
 * und wird dort gepflegt. Eine Sperre, die nur im Fallback steht, greift
 * deshalb nicht. Was hier steht, bleibt für die genannte Rolle unsichtbar,
 * egal was die Datenbank sagt.
 */
const ROLLEN_SPERREN: Partial<Record<UserRole, string[]>> = {
  /*
   * Kunden haben ihre eigenen Einstellungen unter `/kunde/einstellungen`,
   * zweisprachig und im Portalrahmen. Die CRM-Seite `/einstellungen` ist nur
   * deutsch und zeigt CRM-Bereiche (Plan Kundensprache, Entscheidung 19,
   * 25.09.2026). `AppShell` leitet Kunden von dort ins Portal um.
   */
  kunde: ["/einstellungen"],
};

/**
 * Routen, die für jede Rolle ausgeblendet sind, auch für Admin und Inhaber.
 * Die Seite bleibt technisch erreichbar, taucht aber nirgends mehr in der
 * Navigation oder in internen Verlinkungen auf.
 */
const UEBERALL_AUSGEBLENDET: string[] = ["/bonitaetsrechner"];

/**
 * Routen, die ausschließlich Admin und Inhaber sehen. Alle anderen Rollen
 * bekommen sie in der Navigation gar nicht erst angezeigt.
 */
// "/videocall" ist die eigene Videoloesung in Erprobung, "/videoraum" die alte
// Adresse, die nur noch weiterleitet. Bis zur Freigabe steht die Route
// deshalb hier. Massgeblich ist
// zusaetzlich die Policy "Videoraum anlegen" in der Datenbank.
// "/nachtpruefung" zeigt die Befunde der naechtlichen Systempruefung. Sie
// nennen Namen und Zustaende von Kunden, deshalb nur Admin und Inhaber.
// Massgeblich ist zusaetzlich die Policy "Admins sehen die Nachtpruefung" auf
// `nachtpruefung_befunde`: Ohne sie bekaeme auch ein direkter Aufruf der
// Adresse keine einzige Zeile zu sehen.
// "/expats-calculator" (frueher "/steuerrechner-kompakt") stand hier, solange
// die englische Anzeigenstrecke in Erprobung war. Sie ist seit der Oeffnung
// eine OEFFENTLICHE Seite fuer bezahlte Anzeigen und liegt in `App.tsx` vor
// dem Anmeldeschutz, genau wie "/steuer" und "/analyse". Ein Eintrag hier
// haette deshalb keine Wirkung mehr auf den Aufruf der Adresse, waere aber
// irrefuehrend. Er ist bewusst entfernt.
// Sichtbar ist der Menuepunkt trotzdem weiterhin nur fuer Admin und Inhaber,
// und zwar ueber `adminOnly` am Eintrag in `AppSidebar.tsx`. Das sind zwei
// verschiedene Fragen: Wer sieht den Eintrag in der Navigation, und wer darf
// die Adresse aufrufen. Die Adresse darf hier jeder aufrufen, das ist der
// Zweck der Seite.
const NUR_ADMIN_ROUTEN: string[] = ["/videocall", "/videoraum", "/nachtpruefung"];

/**
 * Unterseiten, die keinen eigenen Eintrag in der Navigation haben, sondern
 * aus einer anderen Seite heraus geöffnet werden. Wer die Elternseite sehen
 * darf, darf auch die Unterseite öffnen.
 *
 * Das Präfix-Match weiter unten hilft hier nicht: Es trennt an einem
 * Schrägstrich, und "/beratungspraesentation-moreimmo" ist kein Unterpfad von
 * "/praesentation". Ohne diese Zuordnung filterte die Präsentationsseite ihre
 * eigenen Einträge weg, und im Vertrieb stand dort eine leere Liste.
 */
const ABGELEITETE_ROUTEN: Record<string, string> = {
  "/beratungspraesentation-moreimmo": "/praesentation",
  "/beratungspraesentation-hv": "/praesentation",
  "/beratungspraesentation": "/praesentation",
  "/beratungspraesentation-wg": "/praesentation",
  "/selbstauskunft": "/kunden",
  // Die Leadarbeit-Wissensseiten werden ausschliesslich aus der
  // Unterlagen-Seite heraus geoeffnet, haben aber einen eigenen
  // Pfadstamm. Ohne diese Zuordnung zeigte die Unterlagen-Seite die
  // Kacheln zwar an, der Klick landete fuer alle Rollen ausser den
  // Vollzugriffs-Rollen aber per Route-Guard auf dem Dashboard.
  "/leadarbeit/24h-regel": "/unterlagen",
  "/leadarbeit/erstkontakt": "/unterlagen",
  "/leadarbeit/warm-vs-kalt": "/unterlagen",
  "/leadarbeit/follow-up": "/unterlagen",
  "/leadarbeit/fehler-dsgvo": "/unterlagen",
  // Die oeffentliche Seite „Partner werden“ steht in der Seitenleiste direkt
  // unter der Stellenanzeige und folgt derselben Freigabe wie `/karriere`.
  "/partner-werden": "/karriere",
};

/**
 * Sieht diese Rolle die Navigationseinträge, die in der Seitenleiste als
 * `adminOnly` markiert sind? Dazu gehört der Reiter „Objekte".
 *
 * Die neue Objektseite und die Einheiten-Seite prüfen dieselbe Regel, damit
 * ein direkter Aufruf der Adresse nicht mehr zeigt als die Seitenleiste.
 * `testaccount` und `individuell` haben zwar Vollzugriff auf Routen, sehen
 * den Reiter aber heute nicht, deshalb stehen sie hier bewusst nicht drin.
 */
export function siehtAdminOnlyNavigation(role: UserRole | string | undefined): boolean {
  return ["admin", "inhaber"].includes(role || "");
}

/**
 * Wer die neue Objekt- und Einheitenseite sieht, statt in die alte
 * Verwaltungsansicht umgeleitet zu werden.
 *
 * Admin und Inhaber, seit dem 04.10.2026 auch die Vertriebsleitung
 * (Christian: Sie soll alles einsehen können wie der Admin). Das ist nur die
 * Sicht. Pflegen und Bearbeiten bleiben bei `siehtAdminOnlyNavigation`,
 * Kundenansicht, Kundenlink und internes Exposé hängen seit dem 05.10.2026 an
 * `darfKundenaktionen`; die Seiten fragen das je Knopf.
 */
export function siehtObjektUndEinheitenseite(role: UserRole | string | undefined): boolean {
  return siehtAdminOnlyNavigation(role) || role === "vertriebsleiter";
}

/** Schlüssel in `app_config`: Feld von Nutzerkennungen (uuid) für die Testfreischaltung. */
export const OBJEKTE_TEST_SCHLUESSEL = "objekte_test_vertriebspartner";

/**
 * Testfreischaltung des Objektbereichs für einzelne Konten in der aktiven
 * Rolle Vertriebspartner (Wunsch des Inhabers vom 05.10.2026): Er will die
 * Objekte-Seite so prüfen, wie ein Vertriebspartner sie sähe.
 *
 * Greift nur, wenn beides zutrifft: aktive Rolle `vertriebspartner` und die
 * Kennung steht in `app_config.objekte_test_vertriebspartner`. Fehlt der
 * Schlüssel, ist niemand freigeschaltet. Die Kennung schränkt hier nur ein,
 * maßgeblich bleibt die Rolle: Dieselbe Person in einer anderen aktiven Rolle
 * bekommt nichts dazu. Pflege- und Bearbeitungsrechte entstehen dadurch
 * keine, die Seiten fragen die weiter nach der Rolle ab, die Daten schützt
 * die Zeilensicherheit.
 */
export function objekteTestFreigabe(
  rolle: UserRole | string | undefined | null,
  userId: string | null | undefined,
  liste: unknown = getAppConfig<unknown>(OBJEKTE_TEST_SCHLUESSEL, []),
): boolean {
  if (rolle !== "vertriebspartner" || !userId) return false;
  return Array.isArray(liste) && liste.includes(userId);
}

/**
 * Blendet der Riegel `adminOnly` diesen Navigationseintrag fuer diese Rolle
 * aus?
 *
 * Die Antwort ist nein, wenn die Rolle im Feld `auchFuer` des Eintrags steht.
 * Genau das fehlte bisher an den beiden Stellen, an denen die Seitenleiste
 * ihre Eintraege filtert: `auchFuer` wurde am 10.09.2026 eingefuehrt, aber nur
 * in der Favoritenliste ausgewertet. In der Seitenleiste selbst entschied
 * weiterhin allein `siehtAdminOnlyNavigation`, deshalb blieben „Teampartner"
 * und „Chat" fuer die Rolle hr unsichtbar, obwohl beide Adressen in
 * `role_permissions` freigegeben sind.
 *
 * Das ist keine Zugriffskontrolle, sondern nur die Sichtbarkeit in der
 * Navigation. Ob die Seite aufgerufen werden darf, entscheidet danach
 * weiterhin `isUrlAllowedForRole`.
 */
export function greiftAdminRiegel(
  eintrag: { adminOnly?: boolean; auchFuer?: string[] },
  role: UserRole | string | undefined,
): boolean {
  if (!eintrag.adminOnly) return false;
  if (siehtAdminOnlyNavigation(role)) return false;
  return !(eintrag.auchFuer || []).includes(role || "");
}

/**
 * Darf diese Person den Reiter „Investmentkalkulation" auf der Einheitenseite
 * sehen?
 *
 * Zwei Regeln treffen aufeinander, und es gilt die strengere von beiden: Wer
 * die Einheitenseite sieht und wessen Rolle den Investmentrechner hat
 * (`investmentrechnerAccess.ts`). Seit dem 05.10.2026 (Christian: der
 * Vertriebspartner soll im Objektbereich dieselben Vertriebsfunktionen haben
 * wie der Admin) sind das Admin, Inhaber, Vertriebsleitung und
 * Vertriebspartner. Den Vertriebspartner lässt die Seite selbst nur mit der
 * Testfreischaltung herein (`ObjektseiteZugang`), der Reiter folgt ihr damit
 * von selbst. Objekt- und Finanzierungspartner haben den Rechner, sehen die
 * Einheitenseite aber nicht.
 *
 * Der Reiter ist keine Zugriffskontrolle: Er zeigt ausschließlich Zahlen
 * derselben Einheit, die auf der Seite ohnehin zu sehen sind, keine
 * Provision, keinen Einkaufspreis, keine Verkäuferdaten, und der Rechner
 * speichert nichts. Den eigenständigen Investmentrechner haben dieselben
 * Rollen schon. Die Objektdaten selbst schützt weiterhin die RLS auf
 * `objekte` und `wohnungen`.
 */
export function darfEinheitInvestmentrechner(role: UserRole | string | undefined): boolean {
  return (siehtObjektUndEinheitenseite(role) || role === "vertriebspartner") && canAccessInvestmentrechner(role);
}

/**
 * Darf die aktive Rolle den OS Lotsen nutzen (Reiter auf der
 * Einheitenseite, freigegeben am 28.09.2026)?
 *
 * Erlaubt sind Admin, Inhaber, Vertriebsleiter, Vertriebspartner (jede
 * Karrierestufe, auch „Vertriebspartner (Alt)“), Backoffice, Objekt- und
 * Finanzierungspartner. Nie die Rolle Tippgeber. Die Regel steht in
 * `supabase/functions/_shared/lotse-rollen.ts`,
 * weil die Function `objekt-lotse` genau dieselbe prüft; maßgeblich ist sie
 * dort. Die Einheitenseite selbst bleibt hinter `ObjektseiteZugang`.
 */
export { darfLotseNutzen } from "../../supabase/functions/_shared/lotse-rollen.ts";

/**
 * Kundenaktionen auf Objekt- und Einheitenseite („Kundenlink senden“, „Als
 * Kunde ansehen“, „Exposé anzeigen“) nach aktiver Rolle: Admin, Inhaber,
 * Vertriebsleitung und Vertriebspartner, freigegeben am 05.10.2026. Dieselbe
 * Liste prüfen `send-kunden-expose` und `get-kundenansicht`; welche Kunden,
 * entscheidet dort die Zugriffsregel auf den Kontakt.
 */
export { darfKundenaktionen } from "../../supabase/functions/_shared/kundenaktionen-rollen.ts";

/**
 * Ist diese Route für die Rolle ausdrücklich gesperrt?
 *
 * `identitaet` ist nur für den Videocall-Bereich nötig, der zusätzlich zur
 * Rolle admin an einer Person hängt, siehe `bewerberprozessFreigabe.ts`. Ohne
 * Identität bleibt er für alle zu.
 */
export function istRouteGesperrt(url: string, role: UserRole, identitaet?: NutzerIdentitaet): boolean {
  const cleanUrl = url.split("?")[0].split("#")[0];
  if (UEBERALL_AUSGEBLENDET.some((u) => cleanUrl === u || cleanUrl.startsWith(u + "/"))) return true;
  /*
   * Der Bewerberprozess, seit dem 21.09.2026 eine reine Positivliste: Ihn
   * sehen die Rollen admin, inhaber, hr und (seit dem 27.09.2026) backoffice,
   * sonst niemand. Entschieden von Christian. Die Liste steht in
   * `BEWERBERPROZESS_ROLLEN`, die Datenbank erzwingt dieselbe Grenze.
   *
   * Was sich geaendert hat: Vorher konnte ein namentlicher Eintrag in
   * `bewerberprozessFreigabe.ts` die Rolle stechen. Wer in der Liste stand und
   * zum Pruefen auf eine andere Rolle umschaltete, behielt den Eintrag in der
   * Leiste und den Zugang zur Adresse. Jetzt entscheidet allein die Rolle, und
   * weil diese Sperre vor allem anderen laeuft, kommt auch niemand ueber
   * `role_permissions` oder eine eigene Berechtigung daran vorbei.
   *
   * `istBewerberprozessRoute` deckt die abgeloeste Adresse
   * `/bewerbungsmanagement` mit ab. Sie leitet in `App.tsx` weiter und waere
   * sonst der offene Nebeneingang.
   */
  if (istBewerberprozessRoute(cleanUrl) && !darfBewerberprozess({ ...identitaet, rolle: role })) {
    return true;
  }
  /*
   * Die Verwaltung der Handbuch-Seite, seit dem 26.09.2026. Eine reine
   * Positivliste wie beim Bewerberprozess: Admin und Inhaber, nach der
   * Freischaltung zusaetzlich Vertriebspartner und Vertriebsleitung. Der
   * Schalter steht in `src/lib/handbuch/zugang.ts`. Weil diese Sperre vor
   * allem anderen laeuft, kommt niemand ueber `role_permissions` oder eine
   * eigene Berechtigung vorbei.
   */
  if (istHandbuchSeiteRoute(cleanUrl) && !darfHandbuchSeite(role)) return true;
  /*
   * Der Videocall-Bereich, seit dem 27.09.2026 ausschliesslich Christian Peetz
   * in der aktiven Rolle admin (Entscheidung von Christian), siehe
   * `darfVideocallBereich`. Eine harte Sperre wie beim Bewerberprozess: Keine
   * Rolle, kein Eintrag in `role_permissions` und keine individuelle
   * Berechtigung oeffnet ihn fuer jemand anderen.
   *
   * Bis dahin oeffneten ihn zusaetzlich die Rolle hr (fuer den Wochenplan der
   * Bewerbergespraeche) und einzelne Namen. Beides ist bewusst entfallen.
   */
  if (istVideocallRoute(cleanUrl)) return !darfVideocallBereich({ ...identitaet, rolle: role });
  if (NUR_ADMIN_ROUTEN.includes(cleanUrl) && !["admin", "inhaber", "testaccount"].includes(role)) return true;
  return (ROLLEN_SPERREN[role] || []).some((u) => cleanUrl === u || cleanUrl.startsWith(u + "/"));
}

/**
 * Karrierestufen-basiertes Gating für die Rolle `vertriebspartner`.
 * Jede URL hier setzt einen Mindest-Rank (1=Junior, 2=Lead, 3=Team, 4=Senior).
 * URLs, die hier NICHT auftauchen, sind für jeden VP sichtbar (Junior-Baseline).
 * Mapping wurde aus den Grundgebühr-Paket-Inhalten (LIZENZ_PAKETE in /closing) abgeleitet.
 */
export type VPStufeRank = 1 | 2 | 3 | 4;
const VP_STUFE_MIN_RANK: Record<string, VPStufeRank> = {
  // Junior-Baseline (kein Eintrag = für alle VP sichtbar):
  //   /zielplanung, /statistiken (laut Kundenwunsch schon ab Junior)
  // Lead Partner (ab Rank 2)
  "/empfehlungen": 2,
  "/follow-ups": 2,
  "/praesentation": 2,
  "/marketing": 2,
  "/wettbewerb": 2,
  "/auswertungen": 2,
  "/provisionsabrechnung": 2,
  // Team Lead (ab Rank 3)
  "/teampartner": 3,
  // Lizenzpartner (ab Rank 4)
  "/analysetool": 4,
  // "/steuerrechner" stand hier bis zum 24.09.2026 ebenfalls auf Rang 4, nur
  // aus Analogie zum Analysetool und nicht aus einem Lizenzpaket abgeleitet.
  // Christian hat entschieden: Jeder Vertriebspartner bekommt ihn, gleich auf
  // welcher Karrierestufe. Neue Partner stehen auf der Stufe
  // "vertriebspartner" (Rang 2) und waeren sonst ausgesperrt, sobald das
  // Stufen-Gating fuer sie eingeschaltet ist. Deshalb bewusst kein Eintrag.
  // /karriere ist in `vertriebspartner` allowedRoutes nicht enthalten und
  // damit für VPs grundsätzlich unsichtbar — kein Rank-Gating nötig.
};

/** Mappt die karriere_override-ID auf einen numerischen Rank. */
export function vpStufeRank(stufeId?: string | null): VPStufeRank {
  switch ((stufeId || "").trim().toLowerCase()) {
    case "tippgeber": return 1; // Vertriebspartner
    case "vertriebspartner": return 2; // Lead Partner
    case "manager": return 3; // Team Lead
    case "vertriebsfirma": return 4; // Lizenzpartner
    // Default: Lizenzpartner (Rank 4) → Bestandsschutz: alle existierenden
    // Vertriebspartner ohne explizit gesetzte Karrierestufe sehen weiterhin
    // das komplette CRM. Erst wenn ein Admin im Nutzerprofil aktiv eine
    // niedrigere Stufe wählt, greifen die Stufen-Gates.
    default: return 4;
  }
}

/** True, wenn die URL für die übergebene VP-Stufe freigeschaltet ist. */
export function isUrlAllowedForVPStufe(url: string, stufeId?: string | null, customPermissions?: string[]): boolean {
  const cleanUrl = url.split("?")[0].split("#")[0];
  // Admin-Override pro Nutzer beachtet
  if (customPermissions?.includes(url) || customPermissions?.includes(cleanUrl)) return true;
  // Spezifischsten Match (Präfix) suchen und höchsten Rank wählen
  let minRank: VPStufeRank | null = null;
  for (const u of Object.keys(VP_STUFE_MIN_RANK)) {
    if (cleanUrl === u || cleanUrl.startsWith(u + "/")) {
      const r = VP_STUFE_MIN_RANK[u];
      if (minRank == null || r > minRank) minRank = r;
    }
  }
  if (minRank == null) return true;
  return vpStufeRank(stufeId) >= minRank;
}

/**
 * Wer ist gerade angemeldet? Nur noetig fuer Routen, die einzelne Personen
 * zusaetzlich zu ihrer Rolle sehen duerfen.
 */
export type NutzerIdentitaet = { email?: string | null; userId?: string | null };

export function isUrlAllowedForRole(
  url: string,
  role: UserRole,
  customPermissions?: string[],
  vpStufeId?: string | null,
  identitaet?: NutzerIdentitaet,
): boolean {
  // Bestehende Vorschau-Links erben die regulären Akademie-Berechtigungen.
  url = url.replace(/^\/vertriebsakademie-neu(?=\/|\?|#|$)/, "/vertriebsakademie");
  // Sperren zuerst: Sie gehen jeder Freigabe vor, auch der aus der Datenbank
  // und den individuellen Berechtigungen.
  if (istRouteGesperrt(url, role, identitaet)) return false;
  // Individuelle Berechtigungen haengen an der Person, gelten seit dem
  // 27.09.2026 aber nur in einer internen aktiven Rolle. Als Kunde, Tippgeber
  // oder Bewerber oeffnen sie nichts.
  if (!istInterneRolle(role)) customPermissions = undefined;
  if (url.split('?')[0].split('#')[0] === '/statistiken') return getVisibleStatistikTabs(role, customPermissions || []).length > 0;
  if (FULL_ACCESS_ROLES.includes(role)) return true;
  const cleanUrl = url.split("?")[0].split("#")[0];
  // Freigaben im Code, die vor der Rollenliste stehen. Siehe
  // `bewerberprozessFreigabe.ts`: Die Rollenfreigaben liegen in der Datenbank,
  // eine Freischaltung im Code kaeme dort sonst nicht an.
  if (istBewerberprozessRoute(cleanUrl) && darfBewerberprozess({ ...identitaet, rolle: role })) return true;
  // Nach der Freischaltung darf die Rolle, ohne Eintrag in `role_permissions`.
  if (istHandbuchSeiteRoute(cleanUrl) && darfHandbuchSeite(role)) return true;
  // Der Investmentrechner: Die Rollenliste steht in
  // `investmentrechnerAccess.ts`. Die Pruefung steht vor der Rollenliste aus
  // der Datenbank, weil die Rollenfreigaben dort gepflegt werden und eine
  // Freischaltung im Code sonst nicht ankaeme.
  // Die Investmentkalkulation Plus (09.10.2026) ist derselbe Rechner und hat dieselben Rollen.
  if ((cleanUrl === INVESTMENTRECHNER_ROUTE || cleanUrl === INVESTMENTRECHNER_PLUS_ROUTE) && canAccessInvestmentrechner(role)) return true;
  // Das Ankaufstool ebenso im Code, damit es ohne Migration ankommt.
  if ((cleanUrl === ANKAUFSTOOL_ROUTE || cleanUrl === MIETSUBVENTION_ROUTE || cleanUrl === KAUFPREISLISTE_ROUTE) && ANKAUFSTOOL_ROLLEN.includes(role)) return true;
  if (customPermissions?.includes(url) || customPermissions?.includes(cleanUrl)) return true;
  const allowed = getAllowedUrlsFor(role);
  if (!allowed) return false; // unknown role → deny by default
  // Exakte Übereinstimmung ODER Präfix-Match (z.B. "/aftersales" erlaubt "/aftersales/...");
  // Query-Strings/Hashes werden vor dem Vergleich abgeschnitten. Unterseiten
  // ohne eigenen Navigationseintrag erben die Freigabe ihrer Elternseite.
  const elternRoute = ABGELEITETE_ROUTEN[cleanUrl];
  const roleOk = allowed.some(
    (u) => cleanUrl === u || cleanUrl.startsWith(u + "/") || (!!elternRoute && elternRoute === u),
  );
  if (!roleOk) return false;
  // Innerhalb der Vertriebspartner-Rolle zusätzlich nach Karrierestufe gaten.
  // Unterseiten werden dabei wie ihre Elternseite behandelt, sonst waere die
  // Elternseite gesperrt und die Unterseite trotzdem offen.
  if (role === "vertriebspartner") {
    return isUrlAllowedForVPStufe(elternRoute || cleanUrl, vpStufeId, customPermissions);
  }
  return true;
}

/** Rollen von aussen: Sie sehen nur ihr eigenes Portal. */
const EXTERNE_ROLLEN: readonly string[] = ["kunde", "tippgeber", "bewerber"];

/** Ist die aktive Rolle eine interne Rolle des Hauses? */
export function istInterneRolle(role: UserRole | string | undefined | null): boolean {
  return !!role && !EXTERNE_ROLLEN.includes(role);
}

export function isKundeRole(role: UserRole): boolean {
  return role === "kunde";
}

export function isTippgeberRole(role: UserRole): boolean {
  return role === "tippgeber";
}
