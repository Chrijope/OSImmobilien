import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "@/lib/investmentrechner/rechenkern";
import { AMPEL_SCHWELLEN } from "@/lib/investmentrechner/ampel";
import { AmpelKontext, AmpelLeiste } from "./Auswertungen";
import { InvestmentrechnerInhalt } from "./InvestmentrechnerInhalt";

/*
 * Christians Entscheidungen vom 11.10.2026: Schalter „Bankgespräch &
 * Bankunterlagen“ statt eigener Seite, automatische Übernahme aus der
 * Selbstauskunft mit Schutz von Handwerten, Schwellen-Editor nur für
 * admin und inhaber.
 */

const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);
const eingabe: InvestmentEingabe = { ...standardEingabe, purchasePrice: 300000, monthlyColdRent: 1000, equity: 20000 };
const knk = { weg: "bundesland" as const, bundesland: "bayern" };
const sa = (netto: string, kredit = true) => ({
  einkommen: { netto },
  lebenshaltungskosten: "1200",
  kredite: kredit ? [{ art: "Ratenkredit", bank: "Hausbank", rate: "150", restschuld: "4000" }] : [],
  vermoegenswerte: [{ art: "Depot", institut: "", betrag: "20000" }],
});
const nettoFeld = () => screen.getByLabelText("Nettoeinkommen Person 1, Euro je Monat") as HTMLInputElement;
const oeffneBankunterlagen = () => fireEvent.click(screen.getByRole("button", { name: /Bankunterlagen/ }));

describe("Schalter „Bankgespräch & Bankunterlagen“", () => {
  it("aus: kein Bereich Bankunterlagen, keine Karte Bankgespräch; an: beides", () => {
    zeige(<InvestmentrechnerInhalt vorbelegung={{ eingabe, knk }} />);
    expect(screen.queryByRole("button", { name: /Bankunterlagen/ })).toBeNull();
    expect(screen.queryByTestId("karte-bankgespraech")).toBeNull();
    fireEvent.click(within(screen.getByTestId("schalter-bankgespraech")).getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Bankunterlagen/ })).toBeInTheDocument();
    expect(screen.getByTestId("karte-bankgespraech")).toBeInTheDocument();
  });

  it("startet mit `bankgespraechStart` eingeschaltet (alte Adresse /investmentrechner-plus)", () => {
    zeige(<InvestmentrechnerInhalt vorbelegung={{ eingabe, knk }} bankgespraechStart />);
    expect((within(screen.getByTestId("schalter-bankgespraech")).getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
});

describe("Bankunterlagen aus der Selbstauskunft", () => {
  const start = { eingabe: { ...eingabe, bankgespraechAktiv: true }, knk };

  it("ohne verbundenen Kunden bleiben die Felder frei", () => {
    zeige(<InvestmentrechnerInhalt vorbelegung={start} />);
    oeffneBankunterlagen();
    expect(screen.getByTestId("sa-status").textContent).toContain("Kein Kunde mit Selbstauskunft verbunden");
    expect(nettoFeld().value).toBe("");
  });

  it("füllt mit verbundenem Kunden automatisch, schützt Handwerte und lädt nach Kundenwechsel neu", async () => {
    const ansicht = zeige(<InvestmentrechnerInhalt vorbelegung={start} vorschau={{ selbstauskunft: sa("4000"), stand: "1" }} />);
    oeffneBankunterlagen();
    // Automatisch, ohne Klick, mit Etikett.
    await waitFor(() => expect(nettoFeld().value).toBe("4000"));
    expect(screen.getAllByText("Kunden-SA").length).toBeGreaterThan(0);

    // Von Hand geändert: ein neuer Stand der Selbstauskunft überschreibt ihn nicht automatisch.
    fireEvent.change(nettoFeld(), { target: { value: "4100" } });
    ansicht.rerender(
      <TooltipProvider>
        <InvestmentrechnerInhalt vorbelegung={start} vorschau={{ selbstauskunft: sa("4500", false), stand: "2" }} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("sa-status").textContent).toContain("Neue Selbstauskunft verfügbar"));
    expect(nettoFeld().value).toBe("4100");

    // Neu laden fragt nach; „Handwerte behalten“ lässt den Handwert stehen und übernimmt den Rest.
    fireEvent.click(screen.getByRole("button", { name: /Neu aus Selbstauskunft laden/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Handwerte behalten" }));
    await waitFor(() => expect(screen.queryByLabelText("Ratenkredit, Hausbank, Euro")).toBeNull());
    expect(nettoFeld().value).toBe("4100");
    expect(screen.getByTestId("sa-status").textContent).not.toContain("Neue Selbstauskunft verfügbar");
  });

  it("ohne Handwerte lädt ein anderer Kunde oder Stand von selbst neu", async () => {
    const ansicht = zeige(<InvestmentrechnerInhalt vorbelegung={start} vorschau={{ selbstauskunft: sa("4000"), stand: "1" }} />);
    oeffneBankunterlagen();
    await waitFor(() => expect(nettoFeld().value).toBe("4000"));
    ansicht.rerender(
      <TooltipProvider>
        <InvestmentrechnerInhalt vorbelegung={start} vorschau={{ selbstauskunft: sa("3800"), stand: "andererKunde" }} />
      </TooltipProvider>,
    );
    await waitFor(() => expect(nettoFeld().value).toBe("3800"));
  });
});

describe("Ampel-Schwellen bearbeiten", () => {
  const ergebnis = berechneInvestment(eingabe);
  const leiste = (darfBearbeiten: boolean) =>
    zeige(
      <AmpelKontext.Provider value={{ schwellen: AMPEL_SCHWELLEN, darfBearbeiten, speichern: async () => true }}>
        <AmpelLeiste input={eingabe} result={ergebnis} mitSchwellen />
      </AmpelKontext.Provider>,
    );

  it("ohne Recht nur lesen", () => {
    leiste(false);
    expect(screen.queryByTestId("schwellen-bearbeiten")).toBeNull();
    expect(screen.getByText("Bruttomietrendite", { selector: "td" })).toBeInTheDocument();
  });

  it("mit Recht: bearbeiten, Plausibilität prüfen, auf Standard zurücksetzen", () => {
    leiste(true);
    fireEvent.click(screen.getByTestId("schwellen-bearbeiten"));
    const gruen = screen.getByLabelText("Bruttomietrendite Grün ab in %") as HTMLInputElement;
    expect(gruen.value).toBe("4.5");
    fireEvent.change(gruen, { target: { value: "3" } });
    expect(screen.getByRole("alert").textContent).toContain("„Grün ab“ muss größer oder gleich „Gelb ab“ sein");
    expect(screen.getByRole("button", { name: "Schwellen speichern" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Auf Standard zurücksetzen" }));
    expect((screen.getByLabelText("Bruttomietrendite Grün ab in %") as HTMLInputElement).value).toBe("4.5");
    expect(screen.getByRole("button", { name: "Schwellen speichern" })).not.toBeDisabled();
  });
});
