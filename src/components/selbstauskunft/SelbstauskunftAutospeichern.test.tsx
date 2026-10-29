import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

/**
 * Automatisches Zwischenspeichern über den Kundenlink (28.09.2026).
 *
 * Vorher schickte das Formular 600 ms nach dem Laden den geladenen Stand an
 * `update_sa_fill_token_data`, und die Funktion ersetzt damit
 * `investments.meta.saData`. Schon das Öffnen eines frischen Links machte so
 * einen angefangenen Stand am Investment fast leer. Jetzt speichert es erst,
 * wenn der Kunde etwas ändert.
 */

const rpc = vi.fn(async () => ({ data: { success: true }, error: null }));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = {
    select: () => kette,
    eq: () => kette,
    order: () => kette,
    maybeSingle: async () => ({ data: null, error: null }),
    limit: async () => ({ data: [], error: null }),
  };
  return {
    supabase: {
      from: () => kette,
      rpc: (...a: unknown[]) => rpc(...(a as [])),
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
      functions: { invoke: async () => ({ data: null, error: null }) },
      auth: { getSession: async () => ({ data: { session: null } }) },
    },
  };
});

vi.mock("@/lib/kundenStore", () => ({ getKontaktById: () => null }));

vi.mock("@/lib/investmentsStore", () => ({
  getSaData: () => null,
  setSaData: async () => {},
  getSaDataZurVorbelegung: () => null,
  getInvestmentsByKontakt: () => [],
  setInvestmentMetaFields: async () => {},
  getSaKundeStandAm: () => null,
}));

vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => true }));

import { SelbstauskunftForm } from "./SelbstauskunftForm";

function speicherErsatz() {
  const inhalt = new Map<string, string>();
  return {
    getItem: (k: string) => (inhalt.has(k) ? inhalt.get(k)! : null),
    setItem: (k: string, v: string) => { inhalt.set(k, String(v)); },
    removeItem: (k: string) => { inhalt.delete(k); },
    clear: () => { inhalt.clear(); },
    key: (i: number) => Array.from(inhalt.keys())[i] ?? null,
    get length() { return inhalt.size; },
  } as unknown as Storage;
}

const speicherAufrufe = () => rpc.mock.calls.filter((c) => (c as unknown[])[0] === "update_sa_fill_token_data");

describe("Selbstauskunft über den Link: automatisch gespeichert wird erst nach einer Änderung", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    rpc.mockClear();
    cleanup();
  });

  const zeige = () =>
    render(
      <SelbstauskunftForm
        kundeId="k1"
        investmentId="i1"
        prefillKontakt={{ vorname: "Erika", nachname: "Muster", email: "" } as never}
        prefillSaData={{ vorname: "Erika", nachname: "Muster", beschaeftigungsart: "angestellt" }}
        customerMode
        saToken={"c".repeat(64)}
      />,
    );

  it("Öffnen ohne Änderung schreibt nichts", async () => {
    zeige();
    await new Promise((r) => setTimeout(r, 1200));
    expect(speicherAufrufe()).toHaveLength(0);
  });

  it("eine Änderung schreibt", async () => {
    zeige();
    // Der erste Abschnitt sind die Ziele: eine Kachel anklicken genügt.
    fireEvent.click(screen.getByRole("button", { name: /Steuervorteile sichern/ }));
    await waitFor(() => expect(speicherAufrufe().length).toBeGreaterThan(0), { timeout: 3000 });
  });
});

/*
 * Artefakt (ohne Backend, 29.10.2026): Mehrere Partner nutzen dasselbe
 * Artefakt. Seit dem 29.10.2026 sichert jede Eingabe still im Browser;
 * Datum und Uhrzeit erscheinen erst nach „Zwischenspeichern“ und bleiben dann stehen.
 */
describe("Selbstauskunft ohne Backend: still sichern, Zeitpunkt nach „Zwischenspeichern“", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", { value: speicherErsatz(), configurable: true, writable: true });
    cleanup();
  });

  const zeige = (zuruecksetzen = vi.fn()) => {
    render(<SelbstauskunftForm kundeId="artefakt" ohneBackend={{ abschluss: () => null, zuruecksetzen }} />);
    return zuruecksetzen;
  };
  const entwurf = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((k) => k && k.includes("artefakt") && localStorage.getItem(k)!.startsWith("{"));

  it("eine Änderung sichert sofort, den Zeitpunkt zeigt erst „Zwischenspeichern“", async () => {
    zeige();
    fireEvent.click(screen.getByRole("button", { name: /Steuervorteile sichern/ }));
    await waitFor(() => expect(entwurf().length).toBeGreaterThan(0));
    expect(screen.queryByTestId("sa-gespeichert-am")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Zwischenspeichern/ }));
    await waitFor(() => expect(screen.getByTestId("sa-gespeichert-am")).toBeInTheDocument());
    // Nach dem Neuladen steht der Zeitpunkt weiter da.
    cleanup();
    zeige();
    expect(screen.getByTestId("sa-gespeichert-am")).toBeInTheDocument();
  });

  it("das Info-Symbol liegt nicht in der Tab-Reihenfolge", () => {
    zeige();
    for (const b of screen.queryAllByRole("button", { name: "Erklärung anzeigen" })) expect(b).toHaveAttribute("tabindex", "-1");
  });

  it("zeigt „Daten zurücksetzen“ in der Knopfleiste", () => {
    const zuruecksetzen = zeige();
    fireEvent.click(screen.getByTestId("sa-zuruecksetzen"));
    expect(zuruecksetzen).toHaveBeenCalledTimes(1);
  });
});
