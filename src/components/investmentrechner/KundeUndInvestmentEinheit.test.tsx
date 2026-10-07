import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/*
 * Das Feld „Investment“ im Rechner der Einheitenseite (24.09.2026): Ein
 * Investment ohne Objekt ist wählbar, eines einer anderen Einheit gesperrt,
 * und darunter steht, was das bedeutet.
 */
vi.mock("@/lib/objektExposeStore", () => ({
  kundenZurAuswahl: () => [{ id: "otto", name: "Otto Hans", hatSelbstauskunft: true }],
}));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentsByKontakt: () => [
    { id: "inv-1", nummer: 1, objektId: "o2", wohnungId: "w9", objektTitel: "Alexanderstr 30", weNr: "3" },
    { id: "inv-2", nummer: 2 },
  ],
}));
vi.mock("@/lib/dataCache", () => ({ onCacheChange: () => () => {} }));

const { KundeUndInvestment } = await import("./KundeUndInvestment");

describe("Investment im Rechner einer Einheit", () => {
  it("lässt das Investment ohne Objekt zu und sperrt das einer anderen Einheit, mit Hinweis", () => {
    render(
      <KundeUndInvestment kundeId="otto" investmentId="inv-2" einheit={{ objektId: "o1", wohnungId: "w1" }}
        onKundeWaehlen={() => {}} onInvestmentWaehlen={() => {}} />,
    );
    const fremd = screen.getByRole("option", { name: /Investment 1.*andere Einheit/ }) as HTMLOptionElement;
    const ohne = screen.getByRole("option", { name: /Investment 2.*noch kein Objekt/ }) as HTMLOptionElement;
    expect(fremd.disabled).toBe(true);
    expect(ohne.disabled).toBe(false);
    const hinweis = screen.getByTestId("rechner-einheit-hinweis");
    expect(hinweis).toHaveTextContent("Otto hat noch kein Investment für diese Wohnung");
    expect(hinweis).toHaveTextContent("gesperrt");
  });

  it("ohne Einheit bleibt alles wie bisher: alles wählbar, kein Hinweis", () => {
    render(
      <KundeUndInvestment kundeId="otto" investmentId={null}
        onKundeWaehlen={() => {}} onInvestmentWaehlen={() => {}} />,
    );
    expect((screen.getByRole("option", { name: /Investment 1/ }) as HTMLOptionElement).disabled).toBe(false);
    expect(screen.queryByTestId("rechner-einheit-hinweis")).toBeNull();
  });
});
