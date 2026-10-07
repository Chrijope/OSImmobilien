import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "@/i18n";

/*
 * Sperrseite des Kundenportals in der Anzeigesprache (Plan Kundensprache,
 * Etappe 1): Text über t().
 *
 * Seit der serverseitigen Sperre fragt die Seite zuerst
 * `kundenportal_gesperrt_fuer_mich`; den eigenen Kontakt darf ein gesperrter
 * Kunde nicht mehr lesen, deshalb gibt es kein Sperrdatum mehr.
 */

const rpcAntwort: { data: unknown; error: unknown } = { data: null, error: { code: "PGRST202" } };

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "kunde" }, authUser: { id: "auth-1" }, logout: vi.fn() }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const abfrage = {
    select: () => abfrage,
    or: () => abfrage,
    limit: () => abfrage,
    maybeSingle: async () => ({
      data: { meta: { portalGesperrt: true, portalGesperrtAt: "2026-09-25T10:00:00Z" } },
      error: null,
    }),
  };
  const kanal = { on: () => kanal, subscribe: () => kanal };
  return {
    supabase: {
      from: () => abfrage,
      rpc: async () => rpcAntwort,
      channel: () => kanal,
      removeChannel: () => {},
    },
  };
});

const { KundenportalLockGuard } = await import("./KundenportalLockGuard");

afterEach(async () => {
  await i18n.changeLanguage("de");
  rpcAntwort.data = null;
  rpcAntwort.error = { code: "PGRST202" };
});

describe("KundenportalLockGuard", () => {
  it("zeigt auf Englisch den englischen Sperrtext", async () => {
    await i18n.changeLanguage("en");
    render(<KundenportalLockGuard><p>Inhalt</p></KundenportalLockGuard>);
    expect(await screen.findByText("Customer portal locked")).toBeTruthy();
    expect(screen.getByText("Your access is currently locked. Please get in touch with your contact person at MOREImmo.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    expect(screen.queryByText("Inhalt")).toBeNull();
  });

  it("bleibt auf Deutsch wie bisher", async () => {
    await i18n.changeLanguage("de");
    render(<KundenportalLockGuard><p>Inhalt</p></KundenportalLockGuard>);
    expect(await screen.findByText("Kundenportal gesperrt")).toBeTruthy();
    expect(screen.getByText("Dein Zugang ist gerade gesperrt. Bitte wende dich an deinen Ansprechpartner.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abmelden" })).toBeTruthy();
  });

  it("sperrt die Portalseite auch für ein Konto mit weiterer Rolle über den Anzeigewert", async () => {
    // Der Server sagt nicht gesperrt (Mehrrollen-Konto), der Anzeigewert am
    // Kontakt sagt gesperrt: Die Portalseite bleibt zu.
    rpcAntwort.error = null;
    rpcAntwort.data = false;
    render(<KundenportalLockGuard><p>Inhalt</p></KundenportalLockGuard>);
    expect(await screen.findByText("Kundenportal gesperrt")).toBeTruthy();
    expect(screen.queryByText("Inhalt")).toBeNull();
  });

  it("sagt der Server gesperrt, bleibt die Seite zu, ohne den Kontakt zu lesen", async () => {
    rpcAntwort.error = null;
    rpcAntwort.data = true;
    render(<KundenportalLockGuard><p>Inhalt</p></KundenportalLockGuard>);
    expect(await screen.findByText("Kundenportal gesperrt")).toBeTruthy();
  });
});
