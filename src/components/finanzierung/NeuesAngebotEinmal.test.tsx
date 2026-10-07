import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * Ein Klick auf "Neues Angebot erstellen" legt genau ein Angebot an.
 *
 * Vorher erschienen aus einem Klick zwei Angebote. Der Store reichte das
 * Angebots-Array aus dem Zwischenspeicher unveraendert weiter, die Karte hielt
 * also dieselbe Liste wie der Zwischenspeicher. `createAngebot` haengte das
 * neue Angebot an diese gemeinsame Liste, und die Karte haengte es danach noch
 * einmal an ihren eigenen Zustand.
 *
 * Der Test bildet den Zwischenspeicher so nach wie das Original: `cacheUpdate`
 * aendert die Zeile sofort, `cacheInsert` erst nach dem Schreiben in die
 * Datenbank.
 */

const INV = "22222222-2222-2222-2222-222222222222";

// Zeilen der Tabelle `finanzierungen`. Die Spalte heisst historisch
// `kunde_id`, enthaelt aber die Investment-ID. Diese Zeile gibt es bereits,
// sie hat nur noch kein Angebot.
let finanzierungsZeilen: any[] = [];

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "finanzierungen" ? finanzierungsZeilen : []),
  cacheInsert: vi.fn(async (_tabelle: string, zeile: any) => {
    // Wie im Original: der Zwischenspeicher bekommt die Zeile erst nach dem
    // Schreiben in die Datenbank, also nicht im selben Klick.
    finanzierungsZeilen.push(zeile);
    return zeile;
  }),
  cacheUpdate: vi.fn(async (_tabelle: string, id: string, aenderungen: any) => {
    const idx = finanzierungsZeilen.findIndex((r) => r.id === id);
    if (idx >= 0) finanzierungsZeilen[idx] = { ...finanzierungsZeilen[idx], ...aenderungen };
    return idx >= 0;
  }),
  cacheFilter: vi.fn(() => []),
}));

vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_schluessel: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (_id: string, _schluessel: string, standard: unknown) => standard,
  setInvestmentMeta: vi.fn(),
  getInvestmentMetaField: (_id: string, _schluessel: string, standard: unknown) => standard,
  setInvestmentMetaFields: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Christian Peetz" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/components/objekte/MischzinsRechner", () => ({ MischzinsRechner: () => null }));

import { FinanzierungCard } from "@/components/finanzierung/FinanzierungCard";

const karte = () => (
  <FinanzierungCard
    investmentId={INV}
    kundeName="Otto Hans"
    pipelineStufe="finanzierung"
    berater="Christian Peetz"
    onPipelineUpdate={() => {}}
  />
);

const knopf = () => screen.getByRole("button", { name: /Neues Angebot erstellen/ });
const angebote = () => screen.getAllByRole("heading", { name: /^Angebot \d+$/ });

describe("Neues Angebot erstellen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ein Klick legt ein Angebot an, wenn die Zeile schon existiert", () => {
    finanzierungsZeilen = [{ id: "fin-2", kunde_id: INV, angebote: [] }];
    render(karte());
    expect(screen.getByText(/Noch keine Angebote erstellt/)).toBeInTheDocument();

    fireEvent.click(knopf());
    expect(angebote()).toHaveLength(1);
    expect(finanzierungsZeilen[0].angebote).toHaveLength(1);
  });

  it("zwei Klicks legen zwei Angebote an", () => {
    finanzierungsZeilen = [{ id: "fin-2", kunde_id: INV, angebote: [] }];
    render(karte());

    fireEvent.click(knopf());
    fireEvent.click(knopf());
    expect(angebote()).toHaveLength(2);
    expect(finanzierungsZeilen[0].angebote).toHaveLength(2);
  });

  it("ein Klick legt ein Angebot an, wenn es noch keine Zeile gibt", () => {
    finanzierungsZeilen = [];
    render(karte());

    fireEvent.click(knopf());
    expect(angebote()).toHaveLength(1);
  });
});
