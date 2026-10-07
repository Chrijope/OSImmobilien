import { Suspense, useEffect, useRef } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { HeaderBar } from "@/components/HeaderBar";
import { Kopfbereich } from "@/components/Kopfbereich";
import { useUser } from "@/contexts/UserContext";
import { useNotarfotoReminder } from "@/hooks/useNotarfotoReminder";
import { useKaufpreisFaelligkeitReminder } from "@/hooks/useKaufpreisFaelligkeitReminder";
import { useInvestmentInboxTriggers } from "@/hooks/useInvestmentInboxTriggers";
import { useFollowUpInboxEscalation } from "@/hooks/useFollowUpInboxEscalation";
import { useKontaktversuchInboxReminder } from "@/hooks/useKontaktversuchInboxReminder";
import { useStagnationInboxNudges } from "@/hooks/useStagnationInboxNudges";
import { useWarteraumBenachrichtigung } from "@/hooks/useWarteraumBenachrichtigung";
import { useRealtimeChannelMonitor } from "@/hooks/useRealtimeChannelMonitor";
import { useRoutenTabellen } from "@/hooks/useRoutenTabellen";
import { useObjektAdresseGesperrt } from "@/hooks/useObjektAdresseGesperrt";
import { useLiveVersion } from "@/hooks/useLiveData";
import { isTableLoaded } from "@/lib/dataCache";
import { TestModeBadge } from "@/components/TestModeBadge";
import { useUserSettings } from "@/hooks/useUserSettings";
import { LoadingFallback } from "@/components/LoadingFallback";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { RouteFallback } from "@/components/RouteFallback";
import { isUrlAllowedForRole, isTippgeberRole } from "@/lib/sidebarPermissions";
import { objektbereichGesperrt } from "@/lib/sidebarNavigation";
import { loginZielFuer } from "@/lib/chatDirektlink";
import { prefetchCriticalRoutes } from "@/lib/routePrefetch";
import { darfBewerberprozess } from "@/lib/bewerberprozessFreigabe";
import { WeeklyCallReminderBanner } from "@/components/WeeklyCallReminderBanner";
import { WeeklyCallVorbereitungBanner } from "@/components/WeeklyCallVorbereitungBanner";
import { GeburtstagPopup } from "@/components/dashboard/GeburtstagPopup";
import { KundenportalLockGuard } from "@/components/KundenportalLockGuard";
import { KundenMfaGuard } from "@/components/kunde/KundenMfaGuard";
import { KundeErrorBoundary } from "@/components/kunde/KundeErrorBoundary";
import { UnterlagenBanner, UnterlagenGuard } from "@/components/UnterlagenGuard";
import { isSidebarBlurExempt } from "@/lib/sidebarBlurWhitelist";
import { IdleTimeoutGuard } from "@/components/IdleTimeoutGuard";
import { KundePortalLayout } from "@/components/kunde/portal/KundePortalLayout";
import { TippgeberRoleSwitcher } from "@/components/TippgeberRoleSwitcher";
import { PushNotificationsBootstrap } from "@/components/PushNotificationsBootstrap";
import { VaBackBanner } from "@/components/vertriebsakademie/VaBackBanner";
import { FocusModeBanner } from "@/components/focus/FocusModeBanner";
import { VorfuehrmodusBanner } from "@/components/vorfuehrmodus/VorfuehrmodusBanner";
import { useVorfuehrmodus } from "@/hooks/useVorfuehrmodus";
import { CrmTutorialProvider } from "@/components/tutorial/CrmTutorial";


/**
 * Persistent shell layout used as a route layout element in App.tsx.
 * Redirects to /login if user is not authenticated.
 * Redirects to /einstellungen if onboarding is not complete (checked from DB).
 * Enforces route-level access control based on DB role.
 */
export function AppShell() {
  const { isLoggedIn, loading, user, authUser } = useUser();
  const location = useLocation();
  const { loaded: settingsLoaded, onboardingComplete, customPermissions, settings } = useUserSettings();
  // Karrierestufen-Gating ist Opt-In pro Nutzer (Bestandsschutz). Erst wenn
  // `karriere_gating_active === true` im Profil gesetzt wurde, greift das
  // Sidebar/Route-Gating nach Karrierestufe — sonst voller CRM-Zugriff.
  const vpGatingActive = !!(settings as any)?.karriere_gating_active;
  const vpStufeId = vpGatingActive ? ((settings as any)?.karriere_override ?? null) : null;
  useNotarfotoReminder(user.role, user.name, authUser?.id);
  useKaufpreisFaelligkeitReminder(user.role, authUser?.id);
  useInvestmentInboxTriggers(user.role, user.name, authUser?.id);
  useFollowUpInboxEscalation(user.name, authUser?.id);
  useKontaktversuchInboxReminder(user.name, authUser?.id);
  useStagnationInboxNudges(user.name, authUser?.id);
  useWarteraumBenachrichtigung(user.role, authUser?.id);
  useRealtimeChannelMonitor();
  // Laden je Route: bei jedem Seitenwechsel die Tabellen der neuen Seite holen.
  useRoutenTabellen();
  // Die Testfreischaltung „Objekte" für Vertriebspartner steht in app_config,
  // der Wächter unten muss sie nach dem Laden neu bewerten.
  useLiveVersion(["app_config"]);
  // Ausgeblendete und fremde Exklusivobjekte: kein Direktlink für Vertriebspartner (05.10.2026).
  const objektAdresseZu = useObjektAdresseGesperrt(location.pathname);
  const vorfuehrmodus = useVorfuehrmodus();

  const isAdminLike = ["admin", "inhaber", "testaccount", "individuell", "kunde"].includes(user.role);

  // Sticky-Flag: sobald Onboarding einmal in dieser Session als abgeschlossen
  // bestätigt war, ignorieren wir spätere transiente false-Werte (z.B. nach
  // Tab-Refokus / Token-Refresh). Das verhindert, dass Nutzer beim Speichern
  // im Kundenprofil unerwartet nach /einstellungen geworfen werden.
  const onboardingWasComplete = useRef(false);
  if (onboardingComplete) onboardingWasComplete.current = true;
  const effectiveOnboardingComplete = onboardingComplete || onboardingWasComplete.current;

  /*
   * Wichtige CRM-Seiten vorladen, sobald die Rolle feststeht.
   *
   * Vorher lief das beim ersten Einhängen für jeden, also auch für Kunden und
   * Tippgeber. Deren Browser luden dadurch Pipeline, Bewerberprozess,
   * Kontakte und die Startseite des CRM samt Telefonie, obwohl sie keine
   * dieser Seiten je öffnen dürfen. Das kostete Datenvolumen und zeigte
   * Programmteile, die dort nichts zu suchen haben.
   */
  const darfCrmVorladen =
    !loading && isLoggedIn && user.role !== "kunde" && !isTippgeberRole(user.role);
  useEffect(() => {
    if (darfCrmVorladen) prefetchCriticalRoutes();
  }, [darfCrmVorladen]);

  /*
   * Die Angaben der Bewerberliste vorladen, fuer alle, die den
   * Bewerberprozess sehen. Ohne das stand beim ersten Klick nach dem Login
   * ein bis zwei Sekunden eine Ladeanzeige, siehe `bewerberlisteVorladen.ts`.
   * Als eigener Chunk nachgeladen, damit der App-Rahmen nicht waechst.
   */
  const darfBewerberlisteVorladen = darfCrmVorladen && darfBewerberprozess({ rolle: user.role });
  useEffect(() => {
    if (!darfBewerberlisteVorladen) return;
    void import("@/components/bewerbung/bewerberlisteVorladen")
      .then((m) => m.bewerberlisteVorladen())
      .catch(() => {
        // Nur ein Vorladen: Schlaegt es fehl, holt die Seite beim Oeffnen selbst.
      });
  }, [darfBewerberlisteVorladen]);

  if (loading || (isLoggedIn && !settingsLoaded)) {
    return <LoadingFallback />;
  }

  if (!isLoggedIn) {
    // Ein Chat-Link aus Mail oder Glocke soll nach der Anmeldung wieder im
    // Chat landen, siehe `loginZielFuer`.
    return <Navigate to={loginZielFuer(location.pathname, location.search)} replace />;
  }

  // Profil ist evtl. noch nicht geladen (Default-Sentinel "Laden...").
  // In diesem Fall NIE rollenbasiert redirecten – sonst landet z.B. ein
  // gerade einloggender Admin kurzzeitig auf /kunde/stammdaten und bleibt
  // dort hängen (Admin-Sidebar + Kunden-Content).
  const profileReady = user.name !== "Laden...";
  if (!profileReady) {
    return <LoadingFallback />;
  }

  // Kunde role: skip onboarding, redirect to stammdaten from root
  const isKunde = user.role === "kunde";
  if (isKunde && location.pathname === "/") {
    return <Navigate to="/kunde/stammdaten" replace />;
  }
  // Die CRM-Einstellungen sind für Kunden gesperrt (Plan Kundensprache,
  // Entscheidung 19). Nötig ist diese Zeile, weil die Routenprüfung weiter
  // unten `/einstellungen` für alle Rollen durchlässt (Onboarding).
  if (isKunde && (location.pathname === "/einstellungen" || location.pathname.startsWith("/einstellungen/"))) {
    return <Navigate to="/kunde/einstellungen" replace />;
  }

  // Tippgeber: ausschließlich /tippgeber-portal erlaubt. Root + andere Routen
  // werden hart auf /tippgeber-portal umgeleitet. Tippgeber haben KEIN Onboarding
  // und KEINE Academy – sie landen beim ersten Login direkt im freigegebenen Portal.
  const isTippgeber = isTippgeberRole(user.role);
  if (isTippgeber) {
    if (!location.pathname.startsWith("/tippgeber-portal") && location.pathname !== "/einstellungen") {
      return <Navigate to="/tippgeber-portal" replace />;
    }
  }

  // Umgekehrt: Nicht-Kunden dürfen NICHT im Kundenportal landen,
  // sonst entsteht ein Misch-UI aus Admin-Sidebar und Kunden-Content.
  // Ausnahme: /kunde/vp-bewertung ist für Admins als Vorschau erreichbar.
  if (!isKunde && location.pathname.startsWith("/kunde/") && !location.pathname.startsWith("/kunde/vp-bewertung")) {
    return <Navigate to="/" replace />;
  }

  // Check if onboarding is complete from DB - redirect to settings if not
  // Admins/Inhaber/Kunden are exempt from this check
  const isAdmin = isAdminLike;
  const isOnSettingsPage = location.pathname === "/einstellungen";

  // Power-User Whitelist (z.B. Inhaber/Super-Admins, die per Rollenwechsel
  // andere Rollen testen) sind ebenfalls vom Onboarding-Redirect ausgenommen.
  // WICHTIG: Preview-URL (*.lovableproject.com) darf den Onboarding-Zwang NICHT
  // generell aushebeln, sonst sehen frisch eingeladene Test-Nutzer (testo/testi)
  // sofort die Sidebar und nicht den Onboarding-Wizard.
  const onboardingBypass = isSidebarBlurExempt(authUser?.email);

  if (!isAdmin && !isTippgeber && !onboardingBypass && !effectiveOnboardingComplete && !isOnSettingsPage) {
    return <Navigate to="/einstellungen" replace />;
  }

  // Sidebar-Lock: solange das Onboarding offen ist.
  // Niemals in Preview-Env. Zusätzlich: bestimmte Power-User (Whitelist) sind dauerhaft befreit.
  const sidebarBlurExempt =
    onboardingBypass;
  const sidebarLocked =
    !sidebarBlurExempt && !isTippgeber && !isAdmin && !effectiveOnboardingComplete;


  // Route guard: check if user's DB role allows access to this URL
  const pathSegments = location.pathname.split("/").filter(Boolean);
  if (!isOnSettingsPage && pathSegments.length > 0) {
    let allowed = false;
    const staticSegments = pathSegments.filter(s => !/^[0-9a-f-]{8,}$/i.test(s) && !/^\d+$/.test(s));
    for (let i = staticSegments.length; i >= 1; i--) {
      const candidate = "/" + staticSegments.slice(0, i).join("/");
      if (isUrlAllowedForRole(candidate, user.role, customPermissions, vpStufeId, {
        email: authUser?.email,
        userId: authUser?.id,
      })) {
        allowed = true;
        break;
      }
    }
    // Ohne app_config ist die Testfreischaltung (`objekteTestFreigabe`) noch
    // unbekannt. Warten statt umleiten, sonst landet ein Neuladen auf dem Dashboard.
    if (user.role === "vertriebspartner" && /^\/objekte(\/|$)/.test(location.pathname) && !isTableLoaded("app_config")) {
      return <LoadingFallback />;
    }
    // Der Objektbereich folgt zusätzlich dem Eintrag „Objekte" der Seitenleiste,
    // auch wenn `/objekte` in den Rollenrechten steht (siehe `objektbereichGesperrt`).
    const objekteZu = objektbereichGesperrt(location.pathname, {
      rolle: user.role,
      customPermissions,
      vpStufeId,
      identitaet: { email: authUser?.email, userId: authUser?.id },
    });
    if (!allowed || objekteZu || objektAdresseZu) {
      return <Navigate to="/" replace />;
    }
  }

  // ─── Kunden-Portal: eigene warme Hülle für /kunde/* (Wohlfühl-Flow).
  // CRM-Sidebar/HeaderBar werden NICHT gerendert. Alle Guards laufen oben
  // bereits, sodass hier nur die visuelle Hülle ausgetauscht wird.
  const isKundePortalRoute = isKunde && location.pathname.startsWith("/kunde/");
  if (isKundePortalRoute) {
    return (
      <>
        <KundePortalLayout>
          {/* Kunden sehen die portal-eigene, freundliche Fehlerseite statt der
              internen CRM-Variante mit Stacktrace und Melde-Dialog. */}
          <KundeErrorBoundary key={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <KundenportalLockGuard>
                <KundenMfaGuard>
                  <Outlet />
                </KundenMfaGuard>
              </KundenportalLockGuard>
            </Suspense>
          </KundeErrorBoundary>
        </KundePortalLayout>
        <TestModeBadge />
        <IdleTimeoutGuard />
        <PushNotificationsBootstrap />
      </>
    );
  }

  // ─── Tippgeber-Portal: keine Sidebar, da Navigation inline im Portal.
  const isTippgeberPortalRoute = isTippgeber && location.pathname.startsWith("/tippgeber-portal");
  if (isTippgeberPortalRoute) {
    return (
      <>
        <div data-lg="seite" className="min-h-screen flex w-full bg-background">
          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 overflow-auto">
              <RouteErrorBoundary key={location.pathname}>
                <Suspense fallback={<RouteFallback />}>
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
            </main>
          </div>
        </div>
        <TippgeberRoleSwitcher />
        <TestModeBadge />
        <IdleTimeoutGuard />
      </>
    );
  }

  return (
    <SidebarProvider>
     <CrmTutorialProvider>
      {/*
        `flex-1 min-h-0` statt `h-screen`, und dasselbe eine Ebene tiefer.

        Der Unterschied: `h-screen` heisst „immer volle Fensterhoehe", ganz
        gleich, was oben noch steht. Stand darueber eine Leiste, wurde das
        Geruest um genau deren Hoehe aus dem Fenster hinausgeschoben. Gemessen
        am 18.09.2026: 40 Pixel bei minimiertem Gespraech, 84 mit
        Versionsstreifen dazu, 180 mit aufgeklappten Videos. Der Rumpf wurde
        dadurch scrollbar, und beim Scrollen wanderte die Kopfzeile mit weg.

        `flex-1` heisst dagegen „nimm, was uebrig ist". Das `min-h-0` gehoert
        dazu: Ohne diese Zeile weigert sich ein Flex-Element, unter die Hoehe
        seines Inhalts zu schrumpfen, und die lange Kontaktliste darin risse es
        wieder auf. Die Spalte darueber steht in `App.tsx`.
      */}
      <div
        className={
          sidebarLocked
            ? "flex-1 min-h-0 overflow-hidden flex w-full [&_[data-sidebar=content]]:pointer-events-none [&_[data-sidebar=content]]:select-none [&_[data-sidebar=content]]:blur-sm [&_[data-sidebar=content]]:opacity-60"
            : "flex-1 min-h-0 overflow-hidden flex w-full"
        }
      >
        <AppSidebar />

        {/*
          `data-lg` sind Haken fuer Liquid Glass (`styles/design-liquid.css`).
          Ohne Liquid Glass (etwa mit `?design=heute`) haben sie keine
          Wirkung: Beide Kaesten um
          Kopfleiste und Banner tragen `contents` und verschwinden aus dem
          Layout, alles steht wie vorher untereinander. Mit Liquid Glass
          schwebt der Kopfbereich ueber dem Inhalt, und die Banner liegen
          gemeinsam auf einer Glasscheibe unter der Kopfleiste.
        */}
        <div data-lg="spalte" className="flex-1 flex flex-col min-w-0 min-h-0">
          <Kopfbereich>
            <HeaderBar />
            <div data-lg="bannerstapel" className="contents">
              <VorfuehrmodusBanner />
              <FocusModeBanner />
              <WeeklyCallVorbereitungBanner />
              <WeeklyCallReminderBanner />
              <VaBackBanner />
            </div>
          </Kopfbereich>
          <main className="flex-1 min-h-0 overflow-auto p-3 sm:p-6 bg-background">
            <KundenportalLockGuard>
                {/*
                  Pflichtunterlagen: Banner waehrend der Frist, Sperre danach.
                  An derselben Stelle wie die abgeschaltete Academy-Sperre, hier
                  laeuft ohnehin jede Seite durch. Der Banner steht ausserhalb
                  des Guards, damit er auch auf der Einstellungsseite sichtbar
                  bleibt, wo der Partner die Sache erledigen kann.
                */}
                {/*
                  Erst der Code des Kunden, dann der Unterlagenstand. Interne
                  melden sich seit dem 05.10.2026 nur mit Passwort an.
                */}
                <KundenMfaGuard>
                <UnterlagenBanner />
                <UnterlagenGuard>
                    {/*
                      Der Schluessel traegt den Vorfuehrmodus mit: Beim
                      Umschalten wird die Seite neu aufgebaut, damit die
                      getarnten Namen und die weichgezeichneten Betraege
                      sofort ueberall greifen. Die Tarnfunktionen lesen den
                      Zustand ohne React, sonst muesste jede Seite ihn
                      abonnieren.
                    */}
                    <RouteErrorBoundary key={`${location.pathname}${vorfuehrmodus ? "|vorfuehrung" : ""}`}>
                      <Suspense fallback={<RouteFallback />}>
                        <Outlet />
                      </Suspense>
                    </RouteErrorBoundary>
                </UnterlagenGuard>
                </KundenMfaGuard>
            </KundenportalLockGuard>
          </main>
          <TestModeBadge />
        </div>
      </div>
      <GeburtstagPopup />
      <IdleTimeoutGuard />
      <PushNotificationsBootstrap />
     </CrmTutorialProvider>
    </SidebarProvider>
  );
}

/**
 * Legacy wrapper used inside page components.
 * Now a simple pass-through since the shell is handled by AppShell.
 */
export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
