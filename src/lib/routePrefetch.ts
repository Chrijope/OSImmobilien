/**
 * Route prefetch registry.
 * Maps URL paths to their lazy import functions so we can preload chunks
 * when the user hovers a sidebar link — making navigation feel instant.
 */

const PREFETCH_MAP: Record<string, () => Promise<any>> = {
  "/": () => import("@/pages/Index"),
  "/inbox": () => import("@/pages/Inbox"),
  "/email": () => import("@/pages/Email"),
  "/kalender": () => import("@/pages/Kalender"),
  "/news": () => import("@/pages/News"),
  "/einstellungen": () => import("@/pages/Einstellungen"),
  "/lead-verwaltung": () => import("@/pages/LeadVerwaltung"),
  "/meine-leads": () => import("@/pages/MeineLeads"),
  "/alle-kontakte": () => import("@/pages/AlleKontakte"),
  "/kontakte": () => import("@/pages/Kontakte"),
  "/neukunden": () => import("@/pages/Neukunden"),
  "/abwicklung": () => import("@/pages/Abwicklung"),
  "/bestandskunden": () => import("@/pages/Bestandskunden"),
  "/pipeline": () => import("@/pages/Pipeline"),
  "/bewerberprozess": () => import("@/pages/Bewerberprozess"),
  "/empfehlungen": () => import("@/pages/Empfehlungen"),
  "/objekte": () => import("@/pages/Objekte"),
  "/auswertungen": () => import("@/pages/Auswertungen"),
  "/statistiken": () => import("@/pages/Statistiken"),
  "/abrechnungen": () => import("@/pages/Abrechnungen"),
  "/wettbewerb": () => import("@/pages/Wettbewerb"),
  "/zielplanung": () => import("@/pages/Zielplanung"),
  "/bonitaetsrechner": () => import("@/pages/Bonitaetsrechner"),
  "/immobilien-lexikon": () => import("@/pages/ImmobilienLexikon"),
  "/praesentation": () => import("@/pages/Praesentation"),
  "/unterlagen": () => import("@/pages/Unterlagen"),
  "/analysetool": () => import("@/pages/Analysetool"),
  "/chat": () => import("@/pages/Chat"),
  "/teampartner": () => import("@/pages/Teampartner"),
  "/nutzerverwaltung": () => import("@/pages/Nutzerverwaltung"),
  "/marketing": () => import("@/pages/Marketing"),
  "/helpdesk": () => import("@/pages/Helpdesk"),
  "/hausverwaltung": () => import("@/pages/HVUebersicht"),
  "/mieter": () => import("@/pages/Mieter"),
  "/vermietung": () => import("@/pages/Vermietung"),
  "/dienstleister": () => import("@/pages/Dienstleister"),
  "/hv-tickets": () => import("@/pages/HVTickets"),
  "/afa-rechner": () => import("@/pages/AfaRechner"),
  "/leadarbeit/24h-regel": () => import("@/pages/leadarbeit/Lead24hRegel"),
  "/leadarbeit/erstkontakt": () => import("@/pages/leadarbeit/LeadErstkontakt"),
  "/leadarbeit/warm-vs-kalt": () => import("@/pages/leadarbeit/LeadWarmVsKalt"),
  "/leadarbeit/follow-up": () => import("@/pages/leadarbeit/LeadFollowUp"),
  "/leadarbeit/fehler-dsgvo": () => import("@/pages/leadarbeit/LeadFehlerDsgvo"),
};

const _prefetched = new Set<string>();

/**
 * Prefetch a route's JS chunk. Safe to call multiple times —
 * each path is only fetched once.
 */
export function prefetchRoute(path: string): void {
  if (_prefetched.has(path)) return;
  const loader = PREFETCH_MAP[path];
  if (loader) {
    _prefetched.add(path);
    // Bei Leerlauf, aber mit Zeitgrenze: waehrend der Cache nach dem Login
    // Tabellen verarbeitet, kommt der Browser lange nicht zur Ruhe, und ohne
    // Grenze blieb das Vorladen liegen. Der Klick lud dann die Seite erst
    // noch nach.
    const idle = typeof window.requestIdleCallback === "function" ? window.requestIdleCallback.bind(window) : null;
    const schedule = idle ? (cb: () => void) => idle(cb, { timeout: 1500 }) : (cb: () => void) => setTimeout(cb, 50);
    schedule(() => {
      loader().catch(() => {
        // Silently ignore — chunk will load normally on navigate
        _prefetched.delete(path);
      });
    });
  }
}

/**
 * Laedt nach dem Start nur die meistgenutzten Seiten vor.
 * Wird einmal nach dem Aufbau des App-Rahmens aufgerufen.
 *
 * Zuerst die Kernseiten in derselben Reihenfolge wie die Tabellen in
 * `KERNROUTEN` (routenTabellen.ts): Dashboard, Inbox, Alle Kontakte,
 * Pipeline, Objekte. Danach die naechsthaeufigen Seiten.
 *
 * Frueher folgte eine zweite Welle mit allen restlichen Seiten (rund 1 MB
 * Code fuer jeden Nutzer, auch fuer den Partner, der nur seine Pipeline
 * oeffnet). Sie teilte sich die Leitung mit den Daten der ersten Seite.
 * Alle anderen Seiten werden beim Ueberfahren des Menuepunkts vorgeladen
 * (`prefetchRoute` in NavLink), das reicht fuer ein sofortiges Oeffnen.
 */
export function prefetchCriticalRoutes(): void {
  const critical = [
    "/", "/inbox", "/alle-kontakte", "/pipeline", "/objekte",
    "/kontakte", "/bewerberprozess", "/kalender",
  ];
  for (const path of critical) prefetchRoute(path);
}
