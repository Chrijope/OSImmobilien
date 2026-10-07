import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Die Karte sperrt nicht mehr selbst nach der Stufe.
 *
 * Bis zum 25.09.2026 stand während „bonitaetsunterlagen" in einer offenen
 * Kachel der Satz „Finanzierung wird nach der Reservierung freigeschaltet.",
 * obwohl die Reservierung längst unterschrieben war. Der Finanzierungspartner
 * konnte das Angebot nicht hochladen. Jetzt gilt allein `finanzierungIntern`.
 */

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
  useUser: () => ({ user: { role: "finanzierungspartner", name: "Finanzierungspartner" } }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/components/objekte/MischzinsRechner", () => ({ MischzinsRechner: () => null }));

import { FinanzierungCard } from "@/components/finanzierung/FinanzierungCard";
import { finanzierungIntern } from "@/lib/investmentFreischaltung";

const karte = (freigabe: ReturnType<typeof finanzierungIntern>, pipelineStufe = "bonitaetsunterlagen") => (
  <FinanzierungCard
    investmentId="33333333-3333-3333-3333-333333333333"
    kundeName="Otto Hans"
    pipelineStufe={pipelineStufe}
    berater="Christian Peetz"
    onPipelineUpdate={() => {}}
    freigabe={freigabe}
  />
);

describe("FinanzierungCard und die eine Regel", () => {
  it("zeigt während der Bonitätsunterlagen keinen Sperrtext, sondern die Angebote", () => {
    render(karte(finanzierungIntern({ pipelineStufe: "bonitaetsunterlagen", rvSigned: true, objektGesetzt: true })));

    expect(screen.queryByText(/freigeschaltet/)).not.toBeInTheDocument();
    expect(screen.queryByText(/öffnet sich/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Neues Angebot erstellen/ })).toBeInTheDocument();
  });

  it("zeigt den Grund aus der Regel, wenn sie nicht erfüllt ist", () => {
    render(karte(finanzierungIntern({ pipelineStufe: "reservierung", rvSigned: false, objektGesetzt: true }), "reservierung"));

    expect(screen.getByText("Die Finanzierung öffnet sich, sobald die Reservierung unterschrieben ist.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Neues Angebot erstellen/ })).not.toBeInTheDocument();
  });
});
