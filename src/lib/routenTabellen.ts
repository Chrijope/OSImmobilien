/**
 * Welche Route welche Cache-Tabellen braucht.
 *
 * Der Zwischenspeicher (`dataCache.ts`) hat beim Login frueher alle 44
 * Tabellen geladen, auch wenn die aufgerufene Seite nur sechs davon liest.
 * Jetzt bestimmt diese Karte, was geladen wird: beim Start die Tabellen der
 * Startroute plus die globalen, direkt danach die der Kernseiten
 * (`KERNROUTEN`), der Rest bei Leerlauf, und bei jedem Seitenwechsel die der
 * neuen Route (`useRoutenTabellen` im App-Rahmen). Was eine Seite darueber
 * hinaus per `useCacheReady([...])` verlangt, laedt der Hook selbst nach.
 *
 * Die Zuordnung wurde aus dem Code ermittelt: je Seite die Stores, Hooks und
 * Komponenten, die sie importiert, und deren `cacheGet`-, `useLiveData`- und
 * `useCacheReady`-Aufrufe. Eine vergessene Tabelle zeigt sich als leere
 * Liste, nicht als Fehler. Deshalb im Zweifel eine Tabelle zu viel eintragen.
 *
 * Der Waechter-Test `routenTabellen.test.ts` prueft, dass jede Route aus
 * `App.tsx` hier steht und jede genannte Tabelle im Cache existiert.
 */
import { matchPath } from "react-router-dom";
import { LETZTE_ROUTE_SCHLUESSEL, istVomRoutenspeicherAusgenommen } from "@/components/LastRouteMemory";

// Bewusst nicht `isTippgeberRole` aus sidebarPermissions importiert: das
// zoege den Supabase-Client in diese Datei und in ihren Waechter-Test.
const istTippgeber = (rolle: string) => rolle === "tippgeber";

/**
 * Tabellen, die der App-Rahmen auf jeder Seite braucht: Profil und Rollen
 * (`loadAllUsers`), Einstellungen (`userSettingsCache`, Videocall), die
 * Konfiguration (`appConfigStore`) und die Glocke im Kopfbereich
 * (`benachrichtigungen`).
 */
export const GLOBALE_TABELLEN: readonly string[] = [
  "profiles",
  "user_roles",
  "user_settings",
  "app_config",
  "benachrichtigungen",
];

/** Kontakt und Investment gehoeren zusammen: der Kaufpreis haengt am Investment. */
const KONTAKT_TABELLEN = ["kontakte", "investments"];
/** `objekteStore.getObjekte()` fuegt Bilder, Dokumente und Wohnungen zusammen. */
const OBJEKT_TABELLEN = [
  "objekte", "wohnungen", "objekt_bilder", "objekt_dokumente", "wohnungs_bilder", "wohnungs_dokumente",
];
const CHAT_TABELLEN = ["chat_gruppen", "chat_teilnehmer", "chat_nachrichten"];
const FOLLOW_UP_TABELLEN = ["follow_ups", "follow_up_ketten"];

/**
 * Route (Muster wie in `App.tsx`) zu den Tabellen, die sie ueber die globalen
 * hinaus braucht. Oeffentliche Seiten stehen mit leerer Liste drin: sie
 * laufen ohne Anmeldung, der Cache laedt dort gar nicht.
 */
export const ROUTEN_TABELLEN: Record<string, readonly string[]> = {
  // Oeffentlich, ohne Anmeldung
  "/login": [],
  "/reset-password": [],
  "/portal-aktivieren": [],
  "/aktivieren": [],
  "/karriere": [],
  "/karriere/vertriebspartner-immobilien": [],
  "/partner-werden": [],
  "/karriere/stellenanzeige": [],
  "/karriere/:stelleId": [],
  // Leitet seit dem 23.09.2026 auf /partner-werden um.
  "/closing": [],
  "/kundenansicht/objekt/:id": [],
  "/kundenansicht/objekt/:id/wohnung/:weId": [],
  "/bewerben/:stelleId": [],
  "/analyse": [],
  "/analyse/:slug": [],
  "/steuer": [],
  "/steuer/:slug": [],
  /* Der EXPATS Calculator rechnet nur und schickt den Lead an die Edge
     Function. Er liest keine Tabelle aus dem Zwischenspeicher. Seit der
     Oeffnung steht er hier bei den oeffentlichen Seiten. */
  "/expats-calculator": [],
  /* Die Linkseite fuer die sozialen Netze. Sie zeigt drei feste Ziele und
     reicht die Kampagnenkennung weiter; aus dem Zwischenspeicher liest sie
     nichts. */
  "/links": [],
  /* Die alte Adresse. Sie zeigt nichts mehr an, sondern leitet weiter. */
  "/steuerrechner-kompakt": [],
  // Die Selbstauskunft im CRM laeuft angemeldet und liest Kontakt und
  // Investment. Sie stand hier als "oeffentlich, ohne Tabellen", weil sie
  // urspruenglich als reine Kundenseite eingestuft war. Aus der Kundenakte
  // heraus fiel das nicht auf, die Daten lagen schon im Speicher; beim
  // direkten Aufruf der Adresse fehlte der Stand aus dem Investment.
  "/selbstauskunft": KONTAKT_TABELLEN,
  "/sa/:token": [],
  // Die Handbuch-Seite (26.09.2026): oeffentlich, laedt keine CRM-Tabellen.
  "/handbuch": [],
  "/handbuch/ergebnis/:token": [],
  "/handbuch/ergebnis/:token/selbstauskunft": [],
  "/handbuch/selbstauskunft/:token": [],
  "/handbuch/:slug": [],
  "/handbuch/konfigurator": [],
  "/handbuch/selbstauskunft": [],
  "/handbuch/:slug/konfigurator": [],
  "/handbuch/:slug/selbstauskunft": [],
  "/handbuch-einladung/:token": [],
  "/bewerberfragen/:token": [],
  "/kennenlernen/:token": [],
  // Oeffentliche Seiten des Bewerberprozesses. Sie holen ihre Daten ueber das
  // Token aus eigenen Datenbankfunktionen, nicht aus dem Zwischenspeicher.
  "/kennenlerngespraech/:token": [],
  "/kooperationsgespraech/:token": [],
  "/deine-bewerbung/:token": [],
  "/bewerbung/kein-interesse/:token": [],
  "/signatur": [],
  "/sa-mobile-sign": [],
  "/expose/:id/wohnung/:weId": [],
  "/expose/:id/wohnung/:weId/v2": [],
  "/expose/:id/v2": [],
  "/expose/:id": [],
  "/objektvorstellung/:token": [],
  // Die Kundenansicht liest nichts aus dem Zwischenspeicher: Link und
  // Vorschau laden über `get-kundenansicht`, damit der Termin genau zeigt,
  // was der Kunde bekommt.
  "/immobilie/:token": [],
  "/immobilie/:token/wohnung/:weId": [],
  "/objekte/:id/kundenansicht": [],
  "/objekte/:id/einheiten/:weId/kundenansicht": [],
  "/impressum": [],
  "/datenschutz": [],
  "/objekt-akquise": [],
  "/unsubscribe": [],
  "/vp/:slug": [],
  "/mobile-scan/:token": [],
  "/raum/:token": [],
  "/termin/verwalten/:absageToken": [],
  "/termin/:token": [],
  // Die Terminseite mit dem eigenen Kalender des Vertriebspartners. Holt ihre
  // Daten ueber das Buchungstoken aus eigenen Datenbankfunktionen.
  "/terminwahl/:token": [],

  // Praesentationen: angemeldet, aber ausserhalb des App-Rahmens. Die Seiten
  // holen sich ihre Tabellen ueber `useCacheReady` selbst.
  "/beratungspraesentation": [],
  "/beratungspraesentation-moreimmo": [...KONTAKT_TABELLEN],
  "/beratungspraesentation-hv": [],
  "/beratungspraesentation-neu": [],
  "/beratungspraesentation-wg": [],
  // Leitet seit dem 23.09.2026 auf /bewerberprozess um, das dieselbe Tabelle braucht.
  "/closing-praesentation": ["bewerbungen"],
  // Die beiden Fenster des Bewerber-Videocalls, trotz des alten Namens.
  "/closing-praesentation-entwurf": ["bewerbungen"],
  "/closing-moderation": ["bewerbungen"],
  "/praesentation-uebung": ["bewerbungen"],
  // Das interne Exposé, seit dem 23.09.2026 im eigenen Tab ohne App-Rahmen.
  // Die Tabellen bleiben: Beim direkten Öffnen im neuen Tab lädt die
  // Startwelle genau sie (`startPfadErmitteln`), `useRoutenTabellen` läuft
  // hier nicht.
  "/objekte/:id/einheiten/:weId/expose": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],
  "/objekte/:id/expose": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],

  // Startseite: Kacheln je Rolle, hier die Vereinigung
  "/": [
    ...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, ...OBJEKT_TABELLEN,
    "aufgaben", "aktivitaeten", "bewerbungen", "support_tickets", "wettbewerb_challenges",
    "mieter", "hv_tickets", "vermietungen", "dienstleister",
  ],
  "/inbox": [...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, "aufgaben", "aktivitaeten", "bewerbungen"],
  // Nur noch die Weiterleitung auf das Dashboard, siehe App.tsx.
  "/anrufe": [],
  "/email": [],
  "/kalender": [...KONTAKT_TABELLEN, "aktivitaeten"],
  "/news": ["news"],
  "/videocall": ["kontakte", "aktivitaeten"],
  "/videocall/raum/:id": [],
  "/videocall/buchungen": [],
  "/videocall/einstellungen": [],
  "/videoraum": [],
  "/videoraum/:id": [],
  "/einstellungen": [],
  "/einstellungen/buchungskalender-anleitung": [],
  "/lead-verwaltung": [...KONTAKT_TABELLEN, "aktivitaeten"],
  "/papierkorb": [...KONTAKT_TABELLEN, "aktivitaeten"],
  "/meine-leads": [...KONTAKT_TABELLEN],
  "/alle-kontakte": [...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN],
  "/kontakte": [...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, "aufgaben", "aktivitaeten"],
  "/follow-up": [],
  "/neukunden": [...KONTAKT_TABELLEN],
  "/abwicklung": [...KONTAKT_TABELLEN],
  "/bestandskunden": [...KONTAKT_TABELLEN],
  "/bestandskunden-import": [...KONTAKT_TABELLEN],
  "/bestandskunden-import/csv": [...KONTAKT_TABELLEN],
  "/verloren": [...KONTAKT_TABELLEN, "aktivitaeten"],
  "/pipeline": [
    ...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, "aufgaben", "aktivitaeten", "bewerbungen", "finanzierungen",
  ],
  "/vertriebshandbuch": [],
  "/immobilien-lexikon": [],
  "/praesentation": [...KONTAKT_TABELLEN],
  "/wissenswert/:slug": [],
  "/unterlagen": [],
  "/unterlagen/rechnungsvorlage": [],
  "/unterlagen/email-signatur": [],
  "/unterlagen/whatsapp-community": [],
  "/unterlagen/kundentypen": [],
  "/chat": [...CHAT_TABELLEN, "kontakte"],
  "/support-kontaktieren": ["support_tickets"],
  "/helpdesk": ["support_tickets"],
  "/teampartner": [],
  "/teampartner/:id": [],
  "/nutzerverwaltung": ["kontakte", "bewerbungen"],
  "/audit-log": [],
  "/session-anomalien": [],
  "/storage-audit": [],
  "/webhook-audit": [],
  "/sicherheits-cockpit": [],
  "/nachtpruefung": [],
  "/ansprechpartner": [...CHAT_TABELLEN, "kontakte"],
  "/berater-microseite": [...CHAT_TABELLEN, "kontakte"],
  // Verwaltung der Handbuch-Seite: liest nur ueber eigene Datenbankfunktionen.
  "/handbuch-seite": [...CHAT_TABELLEN],
  "/zielplanung": [...KONTAKT_TABELLEN],
  "/bewerberprozess": ["bewerbungen", "aufgaben"],
  "/bewerbungsmanagement": [],
  "/marketing": [...KONTAKT_TABELLEN],
  "/shop": [],
  "/bonitaetsrechner": [],
  // Weiterleitungen auf /investmentrechner, die alten Rechner sind entfernt
  // (Immorechner, Musterkalkulation, Kalkulation 1, Team Pro Q, Kalkulator-Beispiele).
  "/immorechner": [],
  "/investmentrechner": [...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN],
  "/musterkalkulation": [],
  "/kalkulation-1": [],
  "/kalkulation-team-pro-q": [],
  "/kalkulation-investagon": [],
  "/kultur": [],
  "/weekly-call": [],
  "/kalkulator-bsp-1": [], // Weiterleitung
  "/kalkulator-bsp-2": [], // Weiterleitung
  // Kundenprofil: der Direktlink holt den Kontakt einzeln
  // (`refreshKontaktFromDb`), die Liste hier bringt den Rest des Profils.
  "/kunden/:id": [
    ...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, ...OBJEKT_TABELLEN, ...CHAT_TABELLEN,
    "aktivitaeten", "activity_log", "aufgaben", "kommunikation", "finanzierungen",
    "empfehlungen", "empfehlungsprogramme", "eigentuemer",
  ],
  "/kunde/profil/:id": [
    ...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN, "finanzierungen", "aufgaben", "empfehlungen", "empfehlungsprogramme",
  ],
  "/kunde/profil": [
    ...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN, "finanzierungen", "aufgaben", "empfehlungen", "empfehlungsprogramme",
  ],
  "/kunde/stammdaten": [],
  "/kunde/chat": [...CHAT_TABELLEN, "kontakte"],
  "/kunde/investments": [...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN, "aufgaben", "finanzierungen"],
  "/kunde/steuer-cockpit": [],
  "/kunde/kundenordner": [...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN],
  "/kunde/empfehlungen": ["kontakte", "empfehlungen", "empfehlungsprogramme"],
  "/kunde/einstellungen": [],
  "/kunde/vp-bewertung": [],
  "/vp-bewertungen": [],
  "/auswertungen": [...KONTAKT_TABELLEN, "bewerbungen"],
  "/statistiken": [
    ...KONTAKT_TABELLEN, "aktivitaeten", "aufgaben", "kunden_bewertungen", "empfehlungen",
    "provisionsabrechnungen", "bewerbungen", "finanzierungen",
  ],
  "/analysetool": [],
  "/steuerrechner": [...CHAT_TABELLEN, "kontakte"],
  "/abrechnungen": [...KONTAKT_TABELLEN, "provisionsabrechnungen"],
  "/provisionsabrechnung": [...KONTAKT_TABELLEN, "provisionsabrechnungen"],
  "/wettbewerb": ["wettbewerb_challenges"],
  "/marktanalyse": [],
  "/marktanalyse/vergleich": [],
  "/marktanalyse/:standortId": [],
  "/objekte-neu": [],
  "/investagon-dokument/*": [],
  "/objekte": [...OBJEKT_TABELLEN, "investments"],
  "/objekte/neu": [...OBJEKT_TABELLEN],
  "/objekte/:id/bearbeiten": [...OBJEKT_TABELLEN],
  "/objekte/:id": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],
  "/objekte/:id/verwaltung": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN, "aufgaben"],
  "/objekte/:id/einheiten/:weId": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],
  "/objekte/:id/wohnung/:weId": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],
  "/objekte/:id/investment": [...OBJEKT_TABELLEN],
  "/objekte/:id/investment/:weId": [...OBJEKT_TABELLEN],
  // Weiterleitungen auf Objektseite bzw. Einheit (Immorechner und
  // Musterkalkulation sind entfernt).
  "/objekte/:id/immorechner": [],
  "/objekte/:id/immorechner/:weId": [],
  "/objekte/:id/musterkalkulation": [],
  "/objekte/:id/musterkalkulation/:weId": [],
  "/objekte/:id/afa-rechner": [...OBJEKT_TABELLEN],
  "/objekte/:id/afa-rechner/:weId": [...OBJEKT_TABELLEN],
  "/objekte/:id/afa": [],
  "/objekte/:id/afa/:weId": [],
  "/einheitenspiegel": [...OBJEKT_TABELLEN, ...KONTAKT_TABELLEN],
  "/follow-ups": [],
  "/objekt-einreichungen": [],
  "/objekt-einreichungen/:id": [],
  "/reservierung": [...KONTAKT_TABELLEN, ...OBJEKT_TABELLEN],
  "/afa-rechner": [...OBJEKT_TABELLEN],
  "/empfehlungen": [...KONTAKT_TABELLEN, "empfehlungen", "empfehlungsprogramme", "aufgaben", "aktivitaeten"],
  "/hausverwaltung": ["fristen", "hv_tickets", "dienstleister", "vermietungen", "mieter"],
  "/mieter": ["mieter"],
  "/mieter/:id": ["mieter", "kommunikation", "kautionen", "zaehlerstaende"],
  "/mieter/:id/mietvertrag": ["mieter"],
  "/vermietung": ["vermietungen"],
  "/vermietung/objekt-neu": ["vermietungen"],
  "/dienstleister": ["dienstleister"],
  "/dienstleister/:id": ["dienstleister", ...OBJEKT_TABELLEN],
  "/hv-tickets": ["hv_tickets", "dienstleister"],
  "/hv-statistiken": ["mieter", "vermietungen", "dienstleister", "hv_tickets"],
  "/fristenueberwachung": ["fristen"],
  "/eigentuemer": ["eigentuemer"],
  "/versicherungen": ["versicherungen"],
  "/zaehlerstaende": ["zaehlerstaende", "mieter"],
  "/kautionen": ["kautionen", "mieter"],
  "/betriebskostenabrechnung": ["betriebskosten"],
  "/hv-kommunikation": ["kommunikation", "mieter"],
  "/mieterhoehung": ["mieter"],
  "/uebergabeprotokoll": ["mieter"],
  "/leitfaeden/kaltakquise": [],
  "/leitfaeden/warmkontakte": [],
  "/leitfaeden/einwandbehandlung": [],
  "/aftersales/steuerwissen": [],
  "/aftersales/steuersaetze": [],
  "/aftersales/steuerersparnis": [],
  "/aftersales/elster-anleitung": [],
  "/aftersales/lohnsteueroptimierung": [],
  "/aftersales/ehegattenschaukel": [],
  "/aftersales/verkauf-an-kinder": [],
  "/leadarbeit/24h-regel": [],
  "/leadarbeit/erstkontakt": [],
  "/leadarbeit/warm-vs-kalt": [],
  "/leadarbeit/follow-up": [],
  "/leadarbeit/fehler-dsgvo": [],
  "/bonitaet/checkliste": [],
  "/tippgeber-portal": [...CHAT_TABELLEN, "kontakte", "empfehlungen", "empfehlungsprogramme"],
  "/vertriebsakademie-neu": [],
  "/vertriebsakademie-neu/training": [],
  "/vertriebsakademie-neu/einwaende": [],
  "/vertriebsakademie-neu/ablaufplan": [],
  "/vertriebsakademie-neu/admin": [],
  "/vertriebsakademie-neu/:slug": [],
  "/vertriebsakademie": [],
  "/vertriebsakademie/admin": [],
  "/vertriebsakademie/einwaende": [],
  "/vertriebsakademie/training": [],
  "/vertriebsakademie/ablaufplan": [],
  "/vertriebsakademie/:slug": [],
  "*": [],
};

/**
 * Kernseiten des Vertriebs, in dieser Reihenfolge. Ihre Tabellen werden
 * direkt nach der Startroute geladen, ohne auf Leerlauf zu warten, damit der
 * erste Klick nach dem Login nicht mehr wartet (Rueckmeldung Christian:
 * Pipeline und Alle Kontakte dauerten nach dem Umbau auf Laden je Route sehr
 * lange). Die Reihenfolge ist die Prioritaet: Dashboard, Inbox, Kontakte,
 * Pipeline, Objekte. Siehe auch `prefetchCriticalRoutes` in routePrefetch.ts,
 * das die Seiten-Chunks dazu vorlaedt.
 */
export const KERNROUTEN: readonly string[] = ["/", "/inbox", "/alle-kontakte", "/pipeline", "/objekte"];

/** Kernseiten der HR-Rolle: sie sieht weder Kontakte noch Pipeline noch Objekte. */
const KERNROUTEN_HR: readonly string[] = ["/", "/inbox", "/bewerberprozess", "/kalender"];

/**
 * Routen, die nach den Kernseiten bei Leerlauf vorgeladen werden, in dieser
 * Reihenfolge. Was hier nicht steht, holt die Seite beim Oeffnen selbst.
 */
export const VORLADE_ROUTEN: readonly string[] = ["/kontakte", "/bewerberprozess", "/kalender"];

/**
 * Tabellen, aus denen die Seitenleiste ihre Zaehler liest (Inbox, News,
 * neue Objekte, ungelesene Chats) und aus denen die Erinnerungs-Hooks im
 * App-Rahmen ihre Aufgaben ableiten. Sie werden nach den Vorlade-Routen
 * ebenfalls bei Leerlauf geholt; bis dahin zeigen die Zaehler 0.
 */
export const RAHMEN_TABELLEN: readonly string[] = [
  ...KONTAKT_TABELLEN, ...FOLLOW_UP_TABELLEN, "aufgaben", "bewerbungen",
  "news", "objekte", ...CHAT_TABELLEN,
];

/** Ohne Doppelte, Reihenfolge des ersten Auftretens bleibt. */
function eindeutig(tabellen: readonly string[]): string[] {
  return Array.from(new Set(tabellen));
}

/** Findet den Routen-Eintrag zu einem Pfad, `null` wenn keiner passt. */
export function routenMusterFuerPfad(pfad: string): string | null {
  for (const muster of Object.keys(ROUTEN_TABELLEN)) {
    if (muster === "*") continue;
    if (matchPath({ path: muster, end: true }, pfad)) return muster;
  }
  return null;
}

/** Tabellen der Route zu einem Pfad, ohne die globalen. */
export function routenTabellenFuerPfad(pfad: string): string[] {
  const muster = routenMusterFuerPfad(pfad);
  return muster ? eindeutig(ROUTEN_TABELLEN[muster]) : [];
}

/** Globale Tabellen plus die der Route. */
export function tabellenFuerPfad(pfad: string): string[] {
  return eindeutig([...GLOBALE_TABELLEN, ...routenTabellenFuerPfad(pfad)]);
}

/**
 * Der Pfad, auf dem der Nutzer nach dem Login tatsaechlich landet.
 *
 * Beim Laden der App steht die Adresse oft noch auf `/login`; dann zaehlt
 * das `?redirect=`-Ziel oder die Startseite. Landet er auf `/`, stellt
 * `LastRouteMemory` die zuletzt geoeffnete Seite wieder her, und der
 * App-Rahmen leitet Kunden und Tippgeber in ihren Bereich. Das wird hier
 * nachgebildet, damit die Startwelle die richtigen Tabellen laedt. Liegt die
 * Schaetzung daneben, holt die Seite ihre Tabellen ueber `useCacheReady`
 * selbst nach; es kostet dann nur etwas Zeit.
 */
export function startPfadErmitteln(
  pfad: string,
  suche: string,
  rolle: string,
  gespeicherterPfad: string | null = letzteRouteLesen(),
): string {
  let ziel = pfad;
  if (ziel === "/login") {
    const redirect = new URLSearchParams(suche).get("redirect");
    ziel = redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect.split("?")[0] : "/";
  }
  if (ziel === "/" && gespeicherterPfad && gespeicherterPfad.startsWith("/") && !istVomRoutenspeicherAusgenommen(gespeicherterPfad)) {
    ziel = gespeicherterPfad.split("?")[0].split("#")[0];
  }
  if (rolle === "kunde" && ziel === "/") ziel = "/kunde/stammdaten";
  if (istTippgeber(rolle) && !ziel.startsWith("/tippgeber-portal")) ziel = "/tippgeber-portal";
  return ziel;
}

function letzteRouteLesen(): string | null {
  try {
    return localStorage.getItem(LETZTE_ROUTE_SCHLUESSEL);
  } catch {
    return null;
  }
}

/** Ladeplan fuer den Start, drei Stufen. Verarbeitet von `initDataCache()`. */
export interface Startladeplan {
  /** Startroute plus globale Tabellen; blockiert `initDataCache()`. */
  sofort: string[];
  /** Kernseiten, gruppenweise direkt danach, ohne auf Leerlauf zu warten. */
  danach: string[][];
  /** Der Rest, gruppenweise bei Leerlauf. */
  spaeter: string[][];
}

/**
 * Ladeplan fuer den Start. Jede Tabelle steht genau einmal drin, in der
 * ersten Stufe, in der sie gebraucht wird. Kunden und Tippgeber bekommen
 * kein Vorladen, ihre Bereiche brauchen die Vertriebstabellen nicht; die
 * HR-Rolle bekommt ihre eigenen Kernseiten.
 */
export function ladeplanFuerStart(startPfad: string, rolle: string): Startladeplan {
  const sofort = tabellenFuerPfad(startPfad);
  const schonGeplant = new Set(sofort);
  const danach: string[][] = [];
  const spaeter: string[][] = [];
  const vorladen = rolle !== "kunde" && !istTippgeber(rolle);
  if (!vorladen) return { sofort, danach, spaeter };

  const kernrouten = rolle === "hr" ? KERNROUTEN_HR : KERNROUTEN;
  const einplanen = (stufe: string[][], gruppe: readonly string[]) => {
    const neu = gruppe.filter((t) => !schonGeplant.has(t));
    if (neu.length === 0) return;
    neu.forEach((t) => schonGeplant.add(t));
    stufe.push(neu);
  };
  for (const pfad of kernrouten) einplanen(danach, routenTabellenFuerPfad(pfad));
  for (const pfad of VORLADE_ROUTEN) einplanen(spaeter, routenTabellenFuerPfad(pfad));
  einplanen(spaeter, RAHMEN_TABELLEN);
  return { sofort, danach, spaeter };
}
