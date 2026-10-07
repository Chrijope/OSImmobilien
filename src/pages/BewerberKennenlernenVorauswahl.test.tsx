import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

/**
 * Die Vorauswahl von Weg 2 im Kennenlernbogen.
 *
 * Die Stellenanzeige leitet Finanzdienstleister mit `?weg=weg2` in ihren Bogen
 * (Christian, 24.09.2026). Der Bogen übernimmt den Weg beim ersten Öffnen,
 * aber nur, wenn noch kein Entwurf auf dem Gerät liegt. Geprüft wird am
 * Entwurf, den der Bogen selbst auf dem Gerät speichert: Dort stehen die
 * Antworten, mit denen er arbeitet.
 */

const TOKEN = "c".repeat(64);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: async () => ({
      data: [{ vorname: "Max", status: "offen", expires_at: new Date(Date.now() + 86_400_000).toISOString() }],
      error: null,
    }),
    from: () => ({ select: async () => ({ data: null, error: null }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
    functions: { invoke: async () => ({ data: null, error: new Error("darf im Test nicht laufen") }) },
  },
}));

// In dieser Testumgebung gibt es keinen `localStorage`; ein Ablagefach im
// Arbeitsspeicher, wie in `GlobaleSuche.test.tsx`.
const ablage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => ablage.get(k) ?? null,
  setItem: (k: string, v: string) => void ablage.set(k, v),
  removeItem: (k: string) => void ablage.delete(k),
  clear: () => ablage.clear(),
});

const { default: BewerberKennenlernen } = await import("@/pages/BewerberKennenlernen");
const { ladeFragebogenEntwurf, speichereFragebogenEntwurf } = await import("@/lib/bewerberFormularEntwurf");

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  window.scrollTo = () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => ablage.clear());
afterEach(cleanup);

function oeffne(suche: string) {
  window.history.replaceState({}, "", `/kennenlernen/${TOKEN}${suche}`);
  render(
    <MemoryRouter initialEntries={[`/kennenlernen/${TOKEN}${suche}`]}>
      <Routes>
        <Route path="/kennenlernen/:token" element={<BewerberKennenlernen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Vorauswahl des Wegs im Kennenlernbogen", () => {
  it("übernimmt ?weg=weg2 beim ersten Öffnen", async () => {
    oeffne("?weg=weg2");
    await waitFor(() => expect(ladeFragebogenEntwurf(TOKEN)?.antworten?.weg).toBe("weg2"));
  });

  it("überschreibt keinen Entwurf, der schon auf dem Gerät liegt", async () => {
    speichereFragebogenEntwurf(TOKEN, { frageKey: "", antworten: { weg: "weg1" }, telefon: "" });
    oeffne("?weg=weg2");
    await new Promise((r) => setTimeout(r, 50));
    await waitFor(() => expect(ladeFragebogenEntwurf(TOKEN)?.antworten?.weg).toBe("weg1"));
  });

  it("wählt ohne Zusatz nichts vor, und nichts Unbekanntes", async () => {
    oeffne("?weg=weg99");
    await waitFor(() => expect(ladeFragebogenEntwurf(TOKEN)).not.toBeNull());
    expect(ladeFragebogenEntwurf(TOKEN)?.antworten?.weg).toBeUndefined();
  });
});
