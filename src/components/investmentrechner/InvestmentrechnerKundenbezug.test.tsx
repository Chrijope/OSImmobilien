/**
 * Der Kundenbezug bleibt kleben (REVIEW-001): Nach „Kunden entfernen“ stehen
 * Eigenkapital und Anteil des Kunden noch im Rechner, deshalb darf die
 * Rechnung nicht als kundenfrei an den OS Lotsen gehen. Erst „Zurücksetzen“
 * (bis zum 23.10.2026 „Auf Objektdaten zurücksetzen“) macht sie wieder kundenfrei.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { standardEingabe } from "@/lib/investmentrechner/rechenkern";

vi.mock("@/lib/objektExposeStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/objektExposeStore")>()),
  kundenZurAuswahl: () => [{ id: "k1", name: "Erika Beispiel", hatSelbstauskunft: false }],
}));
vi.mock("@/lib/investmentsStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/investmentsStore")>()),
  getInvestmentsByKontakt: () => [],
  getInvestmentById: () => undefined,
}));

const { InvestmentrechnerInhalt } = await import("./InvestmentrechnerInhalt");

const vorbelegung = {
  eingabe: { ...standardEingabe, propertyTitle: "Musterwohnanlage, WE 7", purchasePrice: 241500, monthlyColdRent: 830 },
  knk: { weg: "bundesland" as const, bundesland: "bayern" },
};

describe("Kundenbezug im Rechner", () => {
  it("Kunde wählen, Bankdarlehen ändern, Kunden entfernen: bleibt kundenbezogen bis zum Zurücksetzen", async () => {
    const melden = vi.fn();
    render(<TooltipProvider><InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} onErgebnis={melden} /></TooltipProvider>);
    const zuletzt = () => melden.mock.calls[melden.mock.calls.length - 1][0] as { eingabe: typeof standardEingabe; kundenbezogen: boolean };
    expect(zuletzt().kundenbezogen).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Namen tippen, um zu suchen …"), { target: { value: "Erika" } });
    fireEvent.click(screen.getByRole("button", { name: /Erika Beispiel/ }));
    expect(zuletzt().kundenbezogen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Finanzierung/ }));
    // Der Darlehensbetrag ist seit dem 08.11.2026 ausgeblendet (immer 100 %); geändert wird der Sollzins.
    fireEvent.change(screen.getAllByLabelText(/^Sollzins p\. a\./)[0], { target: { value: "4.2" } });
    expect(zuletzt().eingabe.seniorInterestRate).toBe(4.2);

    fireEvent.click(screen.getByRole("button", { name: /Kunde & Einkommen/ }));
    fireEvent.click(screen.getByLabelText("Kunden entfernen"));
    expect(zuletzt().eingabe.seniorInterestRate).toBe(4.2);
    expect(zuletzt().kundenbezogen).toBe(true);

    // „Zurücksetzen“ oben rechts, mit Rückfrage im Stil des Projekts.
    fireEvent.click(screen.getByTestId("rechner-zuruecksetzen"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Zurücksetzen" }));
    await waitFor(() => expect(zuletzt().eingabe.seniorInterestRate).toBe(standardEingabe.seniorInterestRate));
    expect(zuletzt().kundenbezogen).toBe(false);
  });
});
