/**
 * Direktlinks in den Objektbereich folgen dem Eintrag „Objekte" der
 * Seitenleiste (Christian, 29.09.2026). Wer ihn nicht sieht, landet wie bei
 * jeder anderen gesperrten Seite auf dem Dashboard.
 *
 * Attrappen wie in `DashboardLayout.kundeEinstellungen.test.tsx`.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const nutzer = vi.hoisted(() => ({ role: "vertriebspartner" as string }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    isLoggedIn: true,
    loading: false,
    user: { role: nutzer.role, name: "Erika Beispiel" },
    authUser: { id: "00000000-0000-4000-8000-000000000001", email: "erika@example.test" },
  }),
}));
// Testfreischaltung „Objekte" (`objekte_test_vertriebspartner`), leer bis ein Test sie setzt.
const config = vi.hoisted(() => ({ geladen: true, liste: [] as string[] }));
vi.mock("@/lib/appConfigStore", () => ({
  getAppConfig: (key: string, fallback: unknown) => (key === "objekte_test_vertriebspartner" ? config.liste : fallback),
}));
vi.mock("@/lib/dataCache", async (original) => ({
  ...(await original<typeof import("@/lib/dataCache")>()),
  isTableLoaded: (t: string) => (t === "app_config" ? config.geladen : true),
}));
vi.mock("@/hooks/useUserSettings", () => ({
  useUserSettings: () => ({ loaded: true, onboardingComplete: true, customPermissions: [], settings: {} }),
}));

// Hooks ohne Wirkung auf die Weiche.
vi.mock("@/hooks/useNotarfotoReminder", () => ({ useNotarfotoReminder: () => undefined }));
vi.mock("@/hooks/useKaufpreisFaelligkeitReminder", () => ({ useKaufpreisFaelligkeitReminder: () => undefined }));
vi.mock("@/hooks/useInvestmentInboxTriggers", () => ({ useInvestmentInboxTriggers: () => undefined }));
vi.mock("@/hooks/useFollowUpInboxEscalation", () => ({ useFollowUpInboxEscalation: () => undefined }));
vi.mock("@/hooks/useKontaktversuchInboxReminder", () => ({ useKontaktversuchInboxReminder: () => undefined }));
vi.mock("@/hooks/useStagnationInboxNudges", () => ({ useStagnationInboxNudges: () => undefined }));
vi.mock("@/hooks/useWarteraumBenachrichtigung", () => ({ useWarteraumBenachrichtigung: () => undefined }));
vi.mock("@/hooks/useRealtimeChannelMonitor", () => ({ useRealtimeChannelMonitor: () => undefined }));
vi.mock("@/hooks/useRoutenTabellen", () => ({ useRoutenTabellen: () => undefined }));
vi.mock("@/hooks/useVorfuehrmodus", () => ({ useVorfuehrmodus: () => false }));
vi.mock("@/lib/routePrefetch", () => ({ prefetchCriticalRoutes: () => undefined }));

// Oberflächen: nur durchreichen oder leer.
const durch = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
const leer = () => null;
vi.mock("@/components/ui/sidebar", () => ({ SidebarProvider: durch }));
vi.mock("@/components/AppSidebar", () => ({ AppSidebar: leer }));
vi.mock("@/components/HeaderBar", () => ({ HeaderBar: leer }));
vi.mock("@/components/Kopfbereich", () => ({ Kopfbereich: durch }));
vi.mock("@/components/TestModeBadge", () => ({ TestModeBadge: leer }));
vi.mock("@/components/LoadingFallback", () => ({ LoadingFallback: () => <p>lädt</p> }));
vi.mock("@/components/RouteErrorBoundary", () => ({ RouteErrorBoundary: durch }));
vi.mock("@/components/RouteFallback", () => ({ RouteFallback: leer }));
vi.mock("@/components/WeeklyCallReminderBanner", () => ({ WeeklyCallReminderBanner: leer }));
vi.mock("@/components/WeeklyCallVorbereitungBanner", () => ({ WeeklyCallVorbereitungBanner: leer }));
vi.mock("@/components/dashboard/GeburtstagPopup", () => ({ GeburtstagPopup: leer }));
vi.mock("@/components/KundenportalLockGuard", () => ({ KundenportalLockGuard: durch }));
vi.mock("@/components/kunde/KundenMfaGuard", () => ({ KundenMfaGuard: durch }));
vi.mock("@/components/kunde/KundeErrorBoundary", () => ({ KundeErrorBoundary: durch }));
vi.mock("@/components/UnterlagenGuard", () => ({ UnterlagenBanner: leer, UnterlagenGuard: durch }));
vi.mock("@/components/IdleTimeoutGuard", () => ({ IdleTimeoutGuard: leer }));
vi.mock("@/components/kunde/portal/KundePortalLayout", () => ({ KundePortalLayout: durch }));
vi.mock("@/components/TippgeberRoleSwitcher", () => ({ TippgeberRoleSwitcher: leer }));
vi.mock("@/components/PushNotificationsBootstrap", () => ({ PushNotificationsBootstrap: leer }));
vi.mock("@/components/vertriebsakademie/VaBackBanner", () => ({ VaBackBanner: leer }));
vi.mock("@/components/focus/FocusModeBanner", () => ({ FocusModeBanner: leer }));
vi.mock("@/components/vorfuehrmodus/VorfuehrmodusBanner", () => ({ VorfuehrmodusBanner: leer }));
vi.mock("@/components/tutorial/CrmTutorial", () => ({ CrmTutorialProvider: durch }));

const { AppShell } = await import("./DashboardLayout");

function zeige(pfad: string) {
  render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>Dashboard</p>} />
          <Route path="/objekte" element={<p>Objektliste</p>} />
          <Route path="/objekte-neu" element={<p>Investagon</p>} />
          <Route path="/objekte/neu" element={<p>Objekt anlegen</p>} />
          <Route path="/objekte/:id/verwaltung" element={<p>Verwaltung</p>} />
          <Route path="/objekte/:id/wohnung/:weId" element={<p>Wohnung</p>} />
          <Route path="/objekte/:id/einheiten/:weId" element={<p>Einheit</p>} />
          <Route path="/einheitenspiegel" element={<p>Einheitenspiegel</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Direktlinks in den Objektbereich", () => {
  it.each([
    ["/objekte", "Objektliste"],
    ["/objekte/o1/verwaltung", "Verwaltung"],
    ["/objekte/o1/wohnung/w1?kundeId=k1", "Wohnung"],
    ["/objekte/o1/einheiten/w1", "Einheit"],
    ["/objekte/neu", "Objekt anlegen"],
    ["/einheitenspiegel", "Einheitenspiegel"],
  ])("ein Vertriebspartner kommt nicht auf %s", (pfad, seite) => {
    nutzer.role = "vertriebspartner";
    zeige(pfad);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText(seite)).not.toBeInTheDocument();
  });

  it("Admin und Inhaber öffnen die Objektliste und die Verwaltung", () => {
    for (const rolle of ["admin", "inhaber"]) {
      nutzer.role = rolle;
      zeige("/objekte/o1/verwaltung");
      expect(screen.getByText("Verwaltung")).toBeInTheDocument();
      cleanup();
      zeige("/objekte");
      expect(screen.getByText("Objektliste")).toBeInTheDocument();
      cleanup();
    }
  });

  it("Investagon bleibt für Vertriebspartner offen", () => {
    nutzer.role = "vertriebspartner";
    zeige("/objekte-neu");
    expect(screen.getByText("Investagon")).toBeInTheDocument();
  });

  it("das Backoffice kommt nicht mehr in den Einheitenspiegel, der Admin schon", () => {
    nutzer.role = "backoffice";
    zeige("/einheitenspiegel");
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    cleanup();
    nutzer.role = "admin";
    zeige("/einheitenspiegel");
    expect(screen.getByText("Einheitenspiegel")).toBeInTheDocument();
  });

  it("der Objektpartner kommt weiter in die Objektliste und den Anlage-Assistenten", () => {
    nutzer.role = "objektpartner";
    zeige("/objekte");
    expect(screen.getByText("Objektliste")).toBeInTheDocument();
    cleanup();
    zeige("/objekte/neu");
    expect(screen.getByText("Objekt anlegen")).toBeInTheDocument();
  });

  describe("Testfreischaltung für einzelne Vertriebspartner-Konten", () => {
    const eigeneId = "00000000-0000-4000-8000-000000000001";

    it("öffnet Liste, Objekt- und Einheitenseite, aber nicht Anlegen und Einheitenspiegel", () => {
      nutzer.role = "vertriebspartner";
      config.liste = [eigeneId];
      for (const [pfad, seite] of [["/objekte", "Objektliste"], ["/objekte/o1/verwaltung", "Verwaltung"], ["/objekte/o1/einheiten/w1", "Einheit"]]) {
        zeige(pfad);
        expect(screen.getByText(seite)).toBeInTheDocument();
        cleanup();
      }
      for (const pfad of ["/objekte/neu", "/einheitenspiegel"]) {
        zeige(pfad);
        expect(screen.getByText("Dashboard")).toBeInTheDocument();
        cleanup();
      }
      config.liste = [];
    });

    it("greift nicht für eine andere Kennung und nicht in einer anderen aktiven Rolle", () => {
      config.liste = ["00000000-0000-4000-8000-000000000099"];
      nutzer.role = "vertriebspartner";
      zeige("/objekte");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      cleanup();
      config.liste = [eigeneId];
      nutzer.role = "backoffice";
      zeige("/objekte/o1/verwaltung");
      expect(screen.getByText("Dashboard")).toBeInTheDocument();
      cleanup();
      config.liste = [];
    });

    it("wartet auf app_config, statt einen Vertriebspartner vorschnell umzuleiten", () => {
      nutzer.role = "vertriebspartner";
      config.geladen = false;
      zeige("/objekte/o1/einheiten/w1");
      expect(screen.getByText("lädt")).toBeInTheDocument();
      config.geladen = true;
    });
  });
});
