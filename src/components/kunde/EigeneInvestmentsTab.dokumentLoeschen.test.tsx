import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * Eigene Immobilien, Dokumente: Der Papierkorb an einem Dokument löschte
 * sofort, samt Datei im Speicher und ohne jede Rückfrage. Jetzt fragt das
 * Portal zuerst, im Projektstil und mit „Löschen“ und „Behalten“.
 * Supabase ist eine Attrappe, alle Daten sind erfunden.
 */
const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  investment: {
    id: "inv-1",
    user_id: "u-1",
    bezeichnung: "Musterwohnung Teststraße",
    adresse: null, plz: null, ort: "Musterstadt", objekttyp: "wohnung",
    baujahr: null, wohnflaeche: null, kaufpreis: 200000, kaufdatum: "2020-01-15",
    nebenkosten: null, darlehenssumme: null, offene_tilgung: null, zinssatz: null,
    monatliche_rate: null, mieteinnahmen_kalt: 800, mieteinnahmen_warm: null,
    hausgeld: 250, ruecklagen: null, verwalter: null, notizen: null,
    dokumente: [{ id: "dok-1", name: "rechnung.pdf", titel: "Handwerkerrechnung Bad", url: "externe-investments/inv-1/rechnung.pdf", typ: "Reparatur/Erhaltung", datum: "2024-05-02T12:00:00.000Z" }],
    meta: { quelle: "extern" },
    erstellt_am: "2024-01-01", aktualisiert_am: "2024-01-01",
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabelle: string) => ({
      select: () => ({
        order: async () => ({ data: [mocks.investment], error: null }),
        or: () => ({ limit: async () => ({ data: [], error: null }) }),
      }),
      update: (werte: unknown) => {
        mocks.update(tabelle, werte);
        return { eq: async () => ({ error: null }) };
      },
    }),
    storage: {
      from: () => ({
        remove: async (pfade: string[]) => {
          mocks.remove(pfade);
          return { data: pfade.map((name) => ({ name })), error: null };
        },
      }),
    },
  },
}));
vi.mock("@/contexts/UserContext", () => ({ useUser: () => ({ authUser: { id: "u-1" } }) }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: mocks.confirm }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// Die Karten der Detailansicht rechnen und zeichnen viel; fuer die Rueckfrage
// spielen sie keine Rolle.
vi.mock("@/components/kunde/eigene/SteuerCockpitEigen", () => ({ SteuerCockpitEigen: () => null }));
vi.mock("@/components/kunde/eigene/TilgungsplanCard", () => ({ TilgungsplanCard: () => null }));
vi.mock("@/components/kunde/eigene/CashflowForecastCard", () => ({ CashflowForecastCard: () => null }));
vi.mock("@/components/kunde/eigene/MarktwertCard", () => ({ MarktwertCard: () => null }));

import i18n from "@/i18n";
import EigeneInvestmentsTab from "./EigeneInvestmentsTab";

async function oeffneDetail() {
  render(
    <MemoryRouter initialEntries={["/kunde/investments?tab=eigene&inv=inv-1"]}>
      <EigeneInvestmentsTab />
    </MemoryRouter>,
  );
  await screen.findByText("Handwerkerrechnung Bad");
}

const papierkorbAmDokument = () => {
  const zeile = screen.getByText("Handwerkerrechnung Bad").closest("div.flex.items-center") as HTMLElement;
  return zeile.querySelector('button[aria-label="Löschen"]') as HTMLButtonElement;
};

describe("Eigene Immobilien: Rückfrage vor dem Löschen eines Dokuments", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("de");
    // Das Kreisdiagramm (recharts) misst seine Groesse; jsdom kennt das nicht.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });
  beforeEach(() => {
    mocks.confirm.mockReset();
    mocks.update.mockReset();
    mocks.remove.mockReset();
  });

  it("fragt mit „Löschen“ und „Behalten“ und löscht bei „Behalten“ nichts", async () => {
    mocks.confirm.mockResolvedValue(false);
    await oeffneDetail();
    await act(async () => { fireEvent.click(papierkorbAmDokument()); });

    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Dokument löschen?",
      confirmText: "Löschen",
      cancelText: "Behalten",
      variant: "destructive",
    }));
    expect(String(mocks.confirm.mock.calls[0][0].description)).toContain("Handwerkerrechnung Bad");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("löscht Datei und Eintrag erst nach „Löschen“", async () => {
    mocks.confirm.mockResolvedValue(true);
    await oeffneDetail();
    await act(async () => { fireEvent.click(papierkorbAmDokument()); });

    await waitFor(() => expect(mocks.update).toHaveBeenCalled());
    expect(mocks.remove).toHaveBeenCalledWith(["externe-investments/inv-1/rechnung.pdf"]);
    const [tabelle, werte] = mocks.update.mock.calls[0] as [string, { dokumente: unknown[] }];
    expect(tabelle).toBe("externe_investments");
    expect(werte.dokumente).toEqual([]);
  });

  it("die Rückfrage beim Löschen des Investments sagt ebenfalls „Löschen“ und „Behalten“", async () => {
    mocks.confirm.mockResolvedValue(false);
    await oeffneDetail();
    const kopfKnopf = screen.getAllByRole("button", { name: /Löschen/ }).find((k) => k.textContent?.includes("Löschen"))!;
    await act(async () => { fireEvent.click(kopfKnopf); });
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "Löschen", cancelText: "Behalten" }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
