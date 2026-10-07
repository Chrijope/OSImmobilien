import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Die Glocke „Finanzierungsdokument freigegeben" geht an den KONTAKT.
 *
 * Bis zum 25.09.2026 bekam `notifyKundeFinanzierungFreigegeben` die Kennung
 * des Investments. `notifyKunde` sucht damit in den Kontakten, fand nichts,
 * und die Meldung erreichte den Kunden nie.
 */

const INVESTMENT = "33333333-3333-3333-3333-333333333333";
const KONTAKT = "11111111-1111-1111-1111-111111111111";

const glocke = vi.hoisted(() => ({ finanzierung: vi.fn() }));

vi.mock("@/lib/bellNotifications", () => ({
  notifyKundeFinanzierungFreigegeben: glocke.finanzierung,
}));
vi.mock("@/lib/investmentsStore", () => ({
  kontaktIdZumInvestment: (id: string) => (id === INVESTMENT ? KONTAKT : null),
}));
vi.mock("@/lib/finanzierungStore", () => ({
  getFinanzierung: () => ({
    angebote: [{
      id: "angebot-1", label: "Angebot 1", bank: "Bank", summe: 200000, zins: "3,5", tilgung: "2",
      laufzeit: "", anmerkungen: "", gesendet: false, akzeptiert: false, bankFinal: false,
      dokumente: [{ id: "doc-1", name: "Finanzierungsbestätigung", status: "uploaded", isDefault: true, fileUrl: "pfad.pdf" }],
    }],
  }),
  createAngebot: vi.fn(),
  updateAngebot: vi.fn(),
  addDokumentToAngebot: vi.fn(),
  updateDokumentStatus: vi.fn(),
  removeDokument: vi.fn(),
  removeAngebot: vi.fn(),
  saveFinanzierung: vi.fn(),
  monatsrateAusAngebot: () => 0,
}));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
  cacheInsert: vi.fn(),
  cacheUpdate: vi.fn(),
  cacheFilter: vi.fn(() => []),
}));
vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_schluessel: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));
vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Admin" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/components/objekte/MischzinsRechner", () => ({ MischzinsRechner: () => null }));

import { FinanzierungCard } from "@/components/finanzierung/FinanzierungCard";

describe("FinanzierungCard: Glocke an den Kunden", () => {
  beforeEach(() => glocke.finanzierung.mockClear());

  it("schickt die Glocke an die Kontakt-Kennung, nicht an die Investment-Kennung", async () => {
    render(
      <FinanzierungCard
        investmentId={INVESTMENT}
        kundeName="Otto Hans"
        berater="Christian Peetz"
        onPipelineUpdate={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Freigeben/ }));

    await waitFor(() => expect(glocke.finanzierung).toHaveBeenCalledTimes(1));
    expect(glocke.finanzierung).toHaveBeenCalledWith(KONTAKT, "Finanzierungsbestätigung");
    expect(glocke.finanzierung).not.toHaveBeenCalledWith(INVESTMENT, expect.anything());
  });

  it("schickt nichts, wenn zum Investment kein Kontakt bekannt ist", async () => {
    render(
      <FinanzierungCard
        investmentId="99999999-9999-9999-9999-999999999999"
        kundeName="Otto Hans"
        berater="Christian Peetz"
        onPipelineUpdate={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Freigeben/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(glocke.finanzierung).not.toHaveBeenCalled();
  });
});
