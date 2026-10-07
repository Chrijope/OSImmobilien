/**
 * Die CRM-Seite `/einstellungen` ist für die Rolle Kunde gesperrt.
 *
 * Plan Kundensprache vom 25.09.2026, Entscheidung 19: Kunden bekommen nur
 * `/kunde/einstellungen` (zweisprachig, im Portalrahmen). Die CRM-Seite ist
 * nur deutsch und zeigt CRM-Bereiche.
 *
 * Zwei Ebenen, beide geprüft:
 *   - die Regel in `sidebarPermissions.ts` (`ROLLEN_SPERREN`), die auch einer
 *     Freigabe aus der Datenbank vorgeht,
 *   - die Umleitung in `AppShell`. Sie ist nötig, weil die Routenprüfung dort
 *     `/einstellungen` wegen des Onboardings für alle Rollen durchlässt.
 *
 * AppShell zieht fast das ganze CRM nach. Alles, was für die Weiche keine
 * Rolle spielt, ist durch schlichte Attrappen ersetzt.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const nutzer = vi.hoisted(() => ({ role: "kunde" as string }));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    isLoggedIn: true,
    loading: false,
    user: { role: nutzer.role, name: "Erika Beispiel" },
    authUser: { id: "00000000-0000-4000-8000-000000000001", email: "erika@example.test" },
  }),
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
const { isUrlAllowedForRole, istRouteGesperrt } = await import("@/lib/sidebarPermissions");

function zeige(pfad: string) {
  render(
    <MemoryRouter initialEntries={[pfad]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/einstellungen" element={<p>CRM-Einstellungen</p>} />
          <Route path="/einstellungen/buchungskalender-anleitung" element={<p>CRM-Anleitung</p>} />
          <Route path="/kunde/einstellungen" element={<p>Portal-Einstellungen</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("/einstellungen für Kunden", () => {
  it("die Regel sperrt die CRM-Seite samt Unterseiten, die Portalseite bleibt offen", () => {
    expect(isUrlAllowedForRole("/einstellungen", "kunde")).toBe(false);
    expect(isUrlAllowedForRole("/einstellungen?tab=sicherheit", "kunde")).toBe(false);
    expect(istRouteGesperrt("/einstellungen/buchungskalender-anleitung", "kunde")).toBe(true);
    // Auch eine Freigabe über individuelle Berechtigungen hebt die Sperre nicht auf.
    expect(isUrlAllowedForRole("/einstellungen", "kunde", ["/einstellungen"])).toBe(false);
    expect(isUrlAllowedForRole("/kunde/einstellungen", "kunde")).toBe(true);
  });

  it("andere Rollen behalten die CRM-Einstellungen", () => {
    expect(istRouteGesperrt("/einstellungen", "vertriebspartner")).toBe(false);
    expect(istRouteGesperrt("/einstellungen", "tippgeber")).toBe(false);
  });

  it("AppShell leitet einen Kunden von /einstellungen ins Portal um", () => {
    nutzer.role = "kunde";
    zeige("/einstellungen");
    expect(screen.getByText("Portal-Einstellungen")).toBeInTheDocument();
    expect(screen.queryByText("CRM-Einstellungen")).not.toBeInTheDocument();
  });

  it("auch Unterseiten der CRM-Einstellungen führen den Kunden ins Portal", () => {
    nutzer.role = "kunde";
    zeige("/einstellungen/buchungskalender-anleitung");
    expect(screen.getByText("Portal-Einstellungen")).toBeInTheDocument();
  });

  it("ein Vertriebspartner sieht weiter die CRM-Einstellungen", () => {
    nutzer.role = "vertriebspartner";
    zeige("/einstellungen");
    expect(screen.getByText("CRM-Einstellungen")).toBeInTheDocument();
  });
});
