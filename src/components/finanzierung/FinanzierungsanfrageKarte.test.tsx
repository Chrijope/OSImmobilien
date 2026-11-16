import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/** Die Karte im Bereich Finanzierung (16.11.2026): wann gesendet werden kann und was danach steht. */

const meta = vi.hoisted(() => ({ wert: {} as Record<string, unknown> }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (tabelle: string) => (tabelle === "investments" ? [{ id: "i1", meta: meta.wert }] : []),
  onCacheChange: () => () => {},
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
vi.mock("@/lib/objekteStore", () => ({ getWohnungKurz: () => null }));
vi.mock("@/lib/investmentsStore", () => ({ kaufpreisAusMeta: () => 0, setInvestmentMetaNurLokal: vi.fn() }));

import { FinanzierungsanfrageKarte } from "./FinanzierungsanfrageKarte";

const sa = { vorname: "Max", nachname: "Muster" };

beforeEach(() => { meta.wert = {}; });

describe("Karte Finanzierungsanfrage", () => {
  it("ohne unterschriebene Selbstauskunft ist Senden gesperrt", () => {
    meta.wert = { saData: sa, saSigned: false };
    render(<FinanzierungsanfrageKarte investmentId="i1" darfSenden />);
    expect(screen.getByText(/sobald die Selbstauskunft vollständig unterschrieben ist/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zur Unterschrift an Kunden senden/ })).toBeDisabled();
  });

  it("ohne Senderecht nur Vorschau", () => {
    meta.wert = { saData: sa, saSigned: true };
    render(<FinanzierungsanfrageKarte investmentId="i1" darfSenden={false} />);
    expect(screen.getByRole("button", { name: /Vorschau/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /senden/i })).not.toBeInTheDocument();
  });

  it("zeigt den Stand je Person und nach der letzten Unterschrift das PDF", () => {
    meta.wert = {
      saData: sa, saSigned: true, saSignedAt: "2026-11-10T10:00:00Z",
      finanzierungsanfrage: {
        status: "unterschrieben", runde: "r1", gesendetAm: "2026-11-16T09:00:00Z", saSignedAt: "2026-11-10T10:00:00Z",
        entwurfPfad: "x", pdfPath: "kundenordner/k/i1/Finanzierungsanfrage.pdf", unterschriebenAm: "2026-11-16T12:00:00Z",
        personen: {
          p1: { name: "Max Muster", email: "max@example.test", status: "unterschrieben", unterschriebenAm: "2026-11-16T11:00:00Z" },
          p2: { name: "Erika Muster", email: "erika@example.test", status: "unterschrieben", unterschriebenAm: "2026-11-16T12:00:00Z" },
        },
      },
    };
    render(<FinanzierungsanfrageKarte investmentId="i1" darfSenden />);
    expect(screen.getByText(/Vollständig unterschrieben am/)).toBeInTheDocument();
    expect(screen.getByText("Erika Muster")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unterschriebene Anfrage öffnen/ })).toBeInTheDocument();
    // Fertig und Selbstauskunft unverändert: nichts mehr zu senden.
    expect(screen.queryByRole("button", { name: /senden/i })).not.toBeInTheDocument();
  });

  it("neu unterschriebene Selbstauskunft verlangt einen neuen Versand", () => {
    meta.wert = {
      saData: sa, saSigned: true, saSignedAt: "2026-11-20T10:00:00Z",
      finanzierungsanfrage: { status: "gesendet", runde: "r1", gesendetAm: "2026-11-16T09:00:00Z", saSignedAt: "2026-11-10T10:00:00Z", entwurfPfad: "x", personen: { p1: { name: "Max Muster", email: "max@example.test", status: "offen" } } },
    };
    render(<FinanzierungsanfrageKarte investmentId="i1" darfSenden />);
    expect(screen.getByText(/nach dem Versand neu unterschrieben/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Erneut zur Unterschrift senden/ })).toBeEnabled();
  });
});
