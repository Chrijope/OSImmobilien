import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Stripe-Produktkarte: ohne Zahlungslink erscheint nur der Hinweis, mit Link
// gibt es die beiden Knöpfe, und Kopieren legt den Link in die Zwischenablage.

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { toast } from "@/hooks/use-toast";
import { StripeProduktKarte } from "./StripeProduktKarte";
import type { StripeProdukt } from "@/lib/stripeProdukte";

const basisProdukt: StripeProdukt = {
  // Beispielprodukt. Die monatliche Partnergebühr, die hier bis zum 06.09.2026
  // stand, gibt es nicht mehr; die Karte selbst ist produktneutral.
  name: "Leadpaket",
  betragLabel: "2.500 € netto einmalig",
  abrechnungLabel: "Abbuchung über Stripe",
  zahlungslink: "",
};

describe("StripeProduktKarte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ohne Zahlungslink: Hinweis statt Knöpfe", () => {
    render(<StripeProduktKarte produkt={basisProdukt} />);
    expect(screen.getByText("Leadpaket")).toBeInTheDocument();
    expect(screen.getByText(/2\.500 € netto einmalig/)).toBeInTheDocument();
    expect(screen.getByText(/Zahlungslink noch nicht hinterlegt/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Link kopieren/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Zahlungsseite öffnen/)).not.toBeInTheDocument();
  });

  it("mit Zahlungslink: Kopieren-Knopf und Öffnen-Link im neuen Tab", () => {
    render(
      <StripeProduktKarte
        produkt={{ ...basisProdukt, zahlungslink: "https://buy.stripe.com/test123" }}
      />,
    );
    expect(screen.queryByText(/Zahlungslink noch nicht hinterlegt/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Link kopieren/ })).toBeInTheDocument();
    const oeffnen = screen.getByRole("link", { name: /Zahlungsseite öffnen/ });
    expect(oeffnen).toHaveAttribute("href", "https://buy.stripe.com/test123");
    expect(oeffnen).toHaveAttribute("target", "_blank");
  });

  it("Kopieren legt den Link in die Zwischenablage und bestätigt per Toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <StripeProduktKarte
        produkt={{ ...basisProdukt, zahlungslink: "https://buy.stripe.com/test123" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Link kopieren/ }));
    expect(writeText).toHaveBeenCalledWith("https://buy.stripe.com/test123");
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Link kopiert" })),
    );
  });
});
