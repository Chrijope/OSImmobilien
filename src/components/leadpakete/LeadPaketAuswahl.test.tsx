import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LeadPaket } from "@/lib/leadPaketStore";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { KEIN_PAKET, LeadPaketAuswahl } = await import("./LeadPaketAuswahl");

const paket = (id: string, erstellt: string): LeadPaket => ({
  id,
  partner_id: "partner-1",
  anzahl: 20,
  paketpreis: 2500,
  bezahlt_am: null,
  freigeschaltet_am: null,
  status: "offen",
  bemerkung: null,
  erstellt_am: erstellt,
});

describe("LeadPaketAuswahl im Zuweisungsdialog", () => {
  it("erscheint nicht, wenn der Partner kein offenes Paket hat", () => {
    const { container } = render(<LeadPaketAuswahl offene={[]} zuweisungen={[]} value={KEIN_PAKET} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("zeigt das gewählte Paket mit dem noch offenen Rest", () => {
    const alt = paket("alt", "2026-10-01T10:00:00");
    const zuweisungen = [
      { id: "z1", paket_id: "alt", kontakt_id: "k1", zugewiesen_am: "2026-10-02T00:00:00Z", zugewiesen_von: null, reklamiert_am: null, reklamationsgrund: null, ersatz_fuer: null },
    ];
    render(<LeadPaketAuswahl offene={[alt, paket("neu", "2026-11-01T10:00:00")]} zuweisungen={zuweisungen} value="alt" onChange={() => {}} />);
    expect(screen.getByText("Aus Paket")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveTextContent("Paket vom 1.10.2026, noch 19 von 20 offen");
  });

  it("„Kein Paket“ ist wählbar", () => {
    render(<LeadPaketAuswahl offene={[paket("alt", "2026-10-01T10:00:00")]} zuweisungen={[]} value={KEIN_PAKET} onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Kein Paket");
  });

  it("zeigt einen Hinweis, wenn die Paketliste nicht geladen werden konnte", () => {
    render(<LeadPaketAuswahl ladeFehler offene={[]} zuweisungen={[]} value={KEIN_PAKET} onChange={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Die Leadpakete ließen sich gerade nicht laden");
  });
});
