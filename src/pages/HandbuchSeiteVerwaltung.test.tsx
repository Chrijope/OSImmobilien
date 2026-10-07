/**
 * Die Verwaltung der Handbuch-Seite aus Sicht eines Vertriebspartners, mit
 * FREIGESCHALTETEM Schalter (im Code bleibt er aus, Christian entscheidet
 * separat). Und die Gesamtsicht der Leitung.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rolle, invoke, rpc } = vi.hoisted(() => ({ rolle: { wert: "vertriebspartner" }, invoke: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/handbuch/zugang", async (original) => {
  const echt = await original<typeof import("@/lib/handbuch/zugang")>();
  return {
    ...echt,
    HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET: true,
    darfHandbuchSeite: (r: string | null | undefined, frei = true) => echt.darfHandbuchSeite(r, frei),
  };
});
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: rolle.wert, name: "Test Partner" }, authUser: { id: "partner-1", email: "p@beispiel.de" } }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc, functions: { invoke }, from: vi.fn(), channel: () => ({ on: () => ({ subscribe: () => ({}) }) }) },
}));
vi.mock("@/components/teilen/LinkTeilenKnoepfe", () => ({ LinkTeilenKnoepfe: () => null }));

import HandbuchSeiteVerwaltung from "./HandbuchSeiteVerwaltung";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";

beforeEach(() => {
  invoke.mockReset();
  rpc.mockReset();
  invoke.mockResolvedValue({ data: { slug: "test-partner" }, error: null });
  rpc.mockResolvedValue({ data: { tage: 90, ereignisse: {}, anforderungen: { gesamt: 2 } }, error: null });
  // get-vp-microsite: ohne Bild und ohne Telefon, damit der Hinweis erscheint.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ userId: "partner-1", slug: "test-partner", name: "Test Partner", email: "p@beispiel.de", telefon: "", bild: null }) }),
  );
});

describe("Handbuch-Seite im CRM", () => {
  it("mit Schalter darf der Vertriebspartner die Seite öffnen", () => {
    expect(isUrlAllowedForRole("/handbuch-seite", "vertriebspartner")).toBe(true);
  });

  it("der Partner sieht seinen Link, sich als Ansprechpartner, einen Hinweis und nur seine Zahlen", async () => {
    rolle.wert = "vertriebspartner";
    render(
      <MemoryRouter>
        <HandbuchSeiteVerwaltung />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/portal\.more\.immo\/handbuch\/test-partner/)).toBeInTheDocument();
    expect(await screen.findByText("So sehen Interessenten dich als Ansprechpartner")).toBeInTheDocument();
    expect(await screen.findByText("Test Partner")).toBeInTheDocument();
    expect(screen.getByText(/fehlen noch dein Profilbild und deine Telefonnummer/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "In den Einstellungen ergänzen" })).toHaveAttribute("href", "/einstellungen");
    expect(screen.queryByText("Firmenlink für Werbung")).not.toBeInTheDocument();
    expect(screen.queryByText("Nur Firmenlink")).not.toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("handbuch_kennzahlen", { p_tage: 90, p_berater_id: "partner-1" }));
  });

  it("die Vertriebsleitung hat die Gesamtsicht mit „Nur Firmenlink“", async () => {
    rolle.wert = "vertriebsleiter";
    render(
      <MemoryRouter>
        <HandbuchSeiteVerwaltung />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Firmenlink für Werbung")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nur Firmenlink" })).toBeInTheDocument();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("handbuch_kennzahlen", { p_tage: 90, p_berater_id: null }));
  });
});
