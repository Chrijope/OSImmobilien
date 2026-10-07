/**
 * Der Kundenbezug bleibt kleben (REVIEW-001): Nach „Kunden entfernen“ stehen
 * Eigenkapital und Anteil des Kunden noch im Rechner, deshalb darf die
 * Rechnung nicht als kundenfrei an den OS Lotsen gehen. Erst „Auf
 * Objektdaten zurücksetzen“ macht sie wieder kundenfrei.
 */
import { fireEvent, render, screen } from "@testing-library/react";
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
  it("Kunde wählen, Eigenkapital ändern, Kunden entfernen: bleibt kundenbezogen bis zum Zurücksetzen", () => {
    const melden = vi.fn();
    render(<TooltipProvider><InvestmentrechnerInhalt vorbelegung={vorbelegung} mitUeberschrift={false} onErgebnis={melden} /></TooltipProvider>);
    const zuletzt = () => melden.mock.calls[melden.mock.calls.length - 1][0] as { eingabe: typeof standardEingabe; kundenbezogen: boolean };
    expect(zuletzt().kundenbezogen).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Namen tippen, um zu suchen …"), { target: { value: "Erika" } });
    fireEvent.click(screen.getByRole("button", { name: /Erika Beispiel/ }));
    expect(zuletzt().kundenbezogen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Finanzierung/ }));
    fireEvent.change(screen.getByLabelText(/^Eigenkapital/), { target: { value: "54321" } });
    expect(zuletzt().eingabe.equity).toBe(54321);

    fireEvent.click(screen.getByRole("button", { name: /Kunde & Einkommen/ }));
    fireEvent.click(screen.getByLabelText("Kunden entfernen"));
    expect(zuletzt().eingabe.equity).toBe(54321);
    expect(zuletzt().kundenbezogen).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Auf Objektdaten zurücksetzen/ }));
    expect(zuletzt().eingabe.equity).toBe(vorbelegung.eingabe.equity);
    expect(zuletzt().kundenbezogen).toBe(false);
  });
});
