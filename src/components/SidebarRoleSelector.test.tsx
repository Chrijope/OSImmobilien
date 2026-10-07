import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Der Rollenumschalter unter der Seitenleiste. Geprueft werden die vier
 * Zustaende, die frueher alle gleich aussahen: mehrere Rollen, genau eine
 * Rolle, Abfrage schlaegt fehl, Abfrage laeuft noch. Entscheidend ist, dass
 * ein Fehler nicht mehr wie "nur eine Rolle" aussieht.
 */

type Antwort = { data: unknown; error: unknown } | "offen";

/** Minimale Nachbildung der Supabase-Abfragekette. */
interface Kette {
  select: () => Kette;
  eq: () => Kette;
  then: (aufloesen: (wert: unknown) => unknown, ablehnen: (fehler: unknown) => unknown) => unknown;
}

const zustand = vi.hoisted(() => ({
  rollen: { data: [], error: null } as Antwort,
  setRoleErgebnis: { status: "ok" } as { status: string; grund?: string; nachricht?: string },
  gewechselteRollen: [] as string[],
  fehlerToasts: [] as string[],
  navigationen: [] as string[],
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const objekt: Kette = {
      select: () => objekt,
      eq: () => objekt,
      then: (aufloesen, ablehnen) => {
        if (tabelle !== "user_roles") {
          return Promise.resolve({ data: [], error: null }).then(aufloesen, ablehnen);
        }
        if (zustand.rollen === "offen") {
          // Abfrage laeuft noch und antwortet in diesem Test nie.
          return new Promise(() => {});
        }
        return Promise.resolve(zustand.rollen).then(aufloesen, ablehnen);
      },
    };
    return objekt;
  };
  return {
    supabase: {
      from: (tabelle: string) => kette(tabelle),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    },
  };
});

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({
    user: { name: "Test", role: "admin", moreId: "" },
    authUser: { id: "u1" },
    setRole: async (rolle: string) => {
      zustand.gewechselteRollen.push(rolle);
      return zustand.setRoleErgebnis;
    },
  }),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ state: "expanded" }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: (text: string) => zustand.fehlerToasts.push(text),
    success: () => {},
  },
}));

vi.mock("react-router-dom", async () => {
  const echt = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...echt, useNavigate: () => (ziel: string) => zustand.navigationen.push(ziel) };
});

const { SidebarRoleSelector } = await import("./SidebarRoleSelector");

function zeichnen() {
  return render(
    <MemoryRouter>
      <SidebarRoleSelector />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  zustand.rollen = { data: [], error: null };
  zustand.setRoleErgebnis = { status: "ok" };
  zustand.gewechselteRollen = [];
  zustand.fehlerToasts = [];
  zustand.navigationen = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("SidebarRoleSelector", () => {
  it("zeigt den Umschalter, wenn mehrere Rollen zugewiesen sind", async () => {
    zustand.rollen = { data: [{ role: "admin" }, { role: "vertriebspartner" }], error: null };

    zeichnen();

    expect(await screen.findByRole("button", { name: /Admin/ })).toBeInTheDocument();
    expect(screen.queryByText(/Rollen konnten nicht geladen werden/)).not.toBeInTheDocument();
  });

  it("zeigt bei genau einer Rolle keinen Umschalter und keinen Hinweis", async () => {
    zustand.rollen = { data: [{ role: "admin" }], error: null };

    zeichnen();

    await waitFor(() => expect(screen.queryByText("Rollen werden geladen")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Admin/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Rollen konnten nicht geladen werden/)).not.toBeInTheDocument();
  });

  it("sagt es offen, wenn die Rollenliste nicht abrufbar ist", async () => {
    zustand.rollen = { data: null, error: { message: "Load failed" } };

    zeichnen();

    expect(
      await screen.findByText(/Rollen konnten nicht geladen werden/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeInTheDocument();
    // Der Umschalter verschwindet nicht stillschweigend.
    expect(console.error).toHaveBeenCalled();
  });

  it("holt die Liste nach einem Fehler auf Knopfdruck erneut", async () => {
    zustand.rollen = { data: null, error: { message: "Load failed" } };

    zeichnen();

    const knopf = await screen.findByRole("button", { name: /Erneut versuchen/ }, { timeout: 3000 });
    zustand.rollen = { data: [{ role: "admin" }, { role: "vertriebspartner" }], error: null };
    fireEvent.click(knopf);

    expect(await screen.findByRole("button", { name: /Admin/ })).toBeInTheDocument();
    expect(screen.queryByText(/Rollen konnten nicht geladen werden/)).not.toBeInTheDocument();
  });

  it("behaelt eine bereits geladene Liste, wenn eine spaetere Abfrage scheitert", async () => {
    zustand.rollen = { data: [{ role: "admin" }, { role: "vertriebspartner" }], error: null };

    zeichnen();
    await screen.findByRole("button", { name: /Admin/ });

    // Rueckkehr in den Tab loest eine Auffrischung aus, die diesmal scheitert.
    zustand.rollen = { data: null, error: { message: "Load failed" } };
    fireEvent(document, new Event("visibilitychange"));

    expect(
      await screen.findByText(/Rollen konnten nicht geladen werden/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    // Der Umschalter bleibt bedienbar, er verschwindet nicht wegen eines Aussetzers.
    expect(screen.getByRole("button", { name: /Admin/ })).toBeInTheDocument();
  });

  it("zeigt waehrend der Abfrage einen Ladezustand statt einer stillen Annahme", async () => {
    zustand.rollen = "offen";

    zeichnen();

    expect(await screen.findByText("Rollen werden geladen")).toBeInTheDocument();
    expect(screen.queryByText(/Rollen konnten nicht geladen werden/)).not.toBeInTheDocument();
  });

  it("meldet einen fehlgeschlagenen Rollenwechsel, statt still nichts zu tun", async () => {
    zustand.rollen = { data: [{ role: "admin" }, { role: "vertriebspartner" }], error: null };
    zustand.setRoleErgebnis = {
      status: "fehler",
      grund: "rollen-nicht-lesbar",
      nachricht: "Deine Rollen sind gerade nicht abrufbar. Bitte gleich noch einmal versuchen.",
    };

    zeichnen();

    const ausloeser = await screen.findByRole("button", { name: /Admin/ });
    fireEvent.pointerDown(ausloeser, { button: 0, ctrlKey: false });
    fireEvent.keyDown(ausloeser, { key: "Enter" });

    const eintrag = await screen.findByRole("menuitem", { name: /Vertriebspartner/ });
    fireEvent.click(eintrag);

    await waitFor(() => expect(zustand.fehlerToasts.length).toBe(1));
    expect(zustand.fehlerToasts[0]).toMatch(/nicht abrufbar/);
    expect(zustand.navigationen).toEqual([]);
  });
});
