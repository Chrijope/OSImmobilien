import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Ein Kunde, zwei Investments, zwei verschiedene Finanzierungen.
 *
 * Der Bereich Finanzierung im Kundenprofil war zwischen den Investments
 * desselben Kunden gekoppelt: Investment 1 und Investment 3 zeigten dasselbe.
 * Ursache war der Anfangswert von `useState`, der nur beim ersten Aufbau
 * gelesen wird. Beim Wechsel des Investment-Reiters blieben die Karten an
 * derselben Stelle im Baum stehen, React baute sie also nicht neu auf, und sie
 * zeigten weiter die Daten des zuerst geoeffneten Investments.
 *
 * Dieser Test wechselt genau so das Investment, also ohne die Komponente neu
 * aufzubauen, und besteht darauf, dass keine der beiden Finanzierungen die
 * andere sieht.
 */

const INV_1 = "11111111-1111-1111-1111-111111111111";
const INV_3 = "33333333-3333-3333-3333-333333333333";

// Zeilen der Tabelle `finanzierungen`. Die Spalte heisst historisch
// `kunde_id`, enthaelt aber die Investment-ID.
const finanzierungsZeilen: any[] = [
  {
    id: "fin-1",
    kunde_id: INV_1,
    angebote: [
      {
        id: "fa-1",
        label: "Angebot 1",
        bank: "Sparkasse Muenchen",
        summe: 300000,
        zins: "3,5",
        tilgung: "2",
        laufzeit: "",
        anmerkungen: "",
        gesendet: true,
        akzeptiert: true,
        bankFinal: true,
        dokumente: [
          { id: "d1", name: "Finanzierungsangebot", status: "signed", isDefault: true },
          { id: "d2", name: "Grundschuld", status: "signed", isDefault: true },
          { id: "d3", name: "Darlehensvertrag", status: "signed", isDefault: true },
        ],
      },
    ],
  },
  {
    id: "fin-3",
    kunde_id: INV_3,
    angebote: [],
  },
];

// Meta der Investments, dort liegt die Entscheidung zur Eigenfinanzierung.
const investmentMeta: Record<string, any> = {
  [INV_1]: {
    eigenfinanzierung: {
      aktiv: true,
      aktiviertVonName: "Christian Peetz",
      aktiviertAm: "2026-09-01T10:00:00.000Z",
    },
  },
  [INV_3]: {},
};

vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "finanzierungen" ? finanzierungsZeilen : []),
  cacheInsert: vi.fn(),
  cacheUpdate: vi.fn(),
  cacheFilter: vi.fn(() => []),
}));

vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_schluessel: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMeta: vi.fn(),
  getInvestmentMetaField: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMetaFields: vi.fn(),
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Christian Peetz" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/components/objekte/MischzinsRechner", () => ({ MischzinsRechner: () => null }));
vi.mock("@/lib/aktivitaetenStore", () => ({ addAktivitaet: vi.fn() }));
vi.mock("@/lib/bellNotifications", () => ({
  notifyByRole: vi.fn(),
  notifyKunde: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("@/lib/followUpStore", () => ({ addFollowUp: vi.fn() }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "nutzer-1" }));

import { FinanzierungCard } from "@/components/finanzierung/FinanzierungCard";
import { EigenfinanzierungSection } from "@/components/finanzierung/EigenfinanzierungSection";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Finanzierung haengt am Investment, nicht am Kunden", () => {
  it("Bankangebote von Investment 1 erscheinen nicht bei Investment 3", () => {
    const karte = (investmentId: string) => (
      <FinanzierungCard
        investmentId={investmentId}
        kundeName="Otto Hans"
        pipelineStufe="finanzierung"
        berater="Christian Peetz"
        onPipelineUpdate={() => {}}
      />
    );

    const { rerender } = render(karte(INV_1));
    expect(screen.getByText("Angebot 1")).toBeInTheDocument();
    expect(screen.getByText("Darlehensvertrag unterschrieben")).toBeInTheDocument();

    // Derselbe Baum, nur ein anderes Investment: genau der Wechsel des
    // Investment-Reiters im Kundenprofil.
    rerender(karte(INV_3));
    expect(screen.queryByText("Angebot 1")).not.toBeInTheDocument();
    expect(screen.getByText(/Noch keine Angebote erstellt/)).toBeInTheDocument();
    expect(screen.getByText("Dokumente ausstehend")).toBeInTheDocument();

    // Und zurueck: Investment 1 hat seine Angebote noch.
    rerender(karte(INV_1));
    expect(screen.getByText("Angebot 1")).toBeInTheDocument();
  });

  it("Eigenfinanzierung von Investment 1 gilt nicht fuer Investment 3", () => {
    const bereich = (investmentId: string) => (
      <EigenfinanzierungSection
        investmentId={investmentId}
        kundeId="kontakt-otto-hans"
        kundeName="Otto Hans"
      />
    );

    const { rerender } = render(bereich(INV_1));
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText(/Aktiviert von/)).toBeInTheDocument();

    rerender(bereich(INV_3));
    expect(screen.queryByText("Aktiv")).not.toBeInTheDocument();
    expect(screen.getByText(/Kunde finanziert selbst aktivieren/)).toBeInTheDocument();

    rerender(bereich(INV_1));
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
  });
});
