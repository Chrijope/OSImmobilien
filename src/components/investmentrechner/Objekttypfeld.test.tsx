import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ASSETKLASSEN } from "@/lib/steuerRechner";
import { OBJEKTTYP_VORSCHLAEGE } from "@/lib/investmentrechner/objekttypVorschlaege";
import { berechneInvestment, standardEingabe } from "@/lib/investmentrechner/rechenkern";
import { standardKaufnebenkostenauswahl } from "@/lib/investmentrechner/kaufnebenkostenAuswahl";
import { EingabeObjekt } from "./Eingabebereiche";
import { AuswahlOderText } from "./Felder";

/**
 * Der Objekttyp ist eine Auswahl mit Freitext. Die wichtigste Zusage dabei:
 * ein alter Wert, der zu keinem Vorschlag passt, darf nicht verschwinden.
 */

const zeige = (inhalt: React.ReactNode) => render(<TooltipProvider>{inhalt}</TooltipProvider>);

function zeigeObjektbereich(propertyType: string, setzeText = vi.fn()) {
  const eingabe = { ...standardEingabe, propertyType };
  zeige(
    <EingabeObjekt
      input={eingabe}
      result={berechneInvestment(eingabe)}
      setzeZahl={vi.fn()}
      setzeText={setzeText}
      aendere={vi.fn()}
      knk={standardKaufnebenkostenauswahl}
      setzeKnk={vi.fn()}
    />,
  );
  return setzeText;
}

describe("Vorschlagsliste", () => {
  it("nimmt die Bezeichnungen der vorhandenen Assetklassen und legt keine zweite Liste an", () => {
    expect(OBJEKTTYP_VORSCHLAEGE).toEqual([
      ASSETKLASSEN.wg.titel,
      ASSETKLASSEN.bestand.titel,
      ASSETKLASSEN.neubau.titel,
    ]);
  });
});

describe("Objekttyp im Rechner", () => {
  it("bietet die drei Arten zur Auswahl an, dazu die eigene Angabe", () => {
    zeigeObjektbereich("");
    const auswahl = screen.getByRole("combobox", { name: "Objekttyp" });
    const eintraege = Array.from(auswahl.querySelectorAll("option")).map((o) => o.textContent);
    for (const vorschlag of OBJEKTTYP_VORSCHLAEGE) expect(eintraege).toContain(vorschlag);
    expect(eintraege).toContain("Eigene Angabe");
    // Ohne Angabe bleibt das Textfeld zu.
    expect(screen.queryByRole("textbox", { name: /Objekttyp, eigene Angabe/ })).not.toBeInTheDocument();
  });

  it("hält einen alten Wert, der zu keinem Vorschlag passt, im Textfeld fest", () => {
    // So etwas steht in bestehenden Investments, es kommt aus der Objektanlage.
    zeigeObjektbereich("Denkmalobjekt mit Sonder-AfA");
    const auswahl = screen.getByRole("combobox", { name: "Objekttyp" }) as HTMLSelectElement;
    expect(auswahl.selectedOptions[0].textContent).toBe("Eigene Angabe");
    const textfeld = screen.getByRole("textbox", { name: /Objekttyp, eigene Angabe/ }) as HTMLInputElement;
    expect(textfeld.value).toBe("Denkmalobjekt mit Sonder-AfA");
  });

  it("zeigt einen alten Wert, der zufällig einem Vorschlag entspricht, in der Auswahl", () => {
    zeigeObjektbereich(ASSETKLASSEN.bestand.titel);
    const auswahl = screen.getByRole("combobox", { name: "Objekttyp" }) as HTMLSelectElement;
    expect(auswahl.value).toBe(ASSETKLASSEN.bestand.titel);
    expect(screen.queryByRole("textbox", { name: /Objekttyp, eigene Angabe/ })).not.toBeInTheDocument();
  });

  it("gibt den gewählten Vorschlag als Text weiter", () => {
    const setzeText = zeigeObjektbereich("");
    fireEvent.change(screen.getByRole("combobox", { name: "Objekttyp" }), { target: { value: ASSETKLASSEN.wg.titel } });
    expect(setzeText).toHaveBeenCalledWith("propertyType", ASSETKLASSEN.wg.titel);
  });

  it("öffnet bei eigener Angabe das Textfeld, ohne den bisherigen Wert zu löschen", () => {
    const setzeText = vi.fn();
    zeige(
      <AuswahlOderText
        label="Objekttyp"
        value={ASSETKLASSEN.neubau.titel}
        onChange={(wert) => setzeText("propertyType", wert)}
        vorschlaege={OBJEKTTYP_VORSCHLAEGE}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Objekttyp" }), { target: { value: "__eigene__" } });
    // Die Auswahl allein ändert nichts am Wert, sie macht nur das Feld auf.
    expect(setzeText).not.toHaveBeenCalled();
    const textfeld = screen.getByRole("textbox", { name: /Objekttyp, eigene Angabe/ }) as HTMLInputElement;
    expect(textfeld.value).toBe(ASSETKLASSEN.neubau.titel);
  });

  it("reicht Getipptes weiter", () => {
    const setzeText = vi.fn();
    zeige(
      <AuswahlOderText
        label="Objekttyp"
        value="Denkmal"
        onChange={(wert) => setzeText("propertyType", wert)}
        vorschlaege={OBJEKTTYP_VORSCHLAEGE}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Objekttyp, eigene Angabe/ }), { target: { value: "Denkmalx" } });
    expect(setzeText).toHaveBeenCalledWith("propertyType", "Denkmalx");
  });
});

describe("Erklärungen zum Antippen", () => {
  /*
   * Die Erklärung öffnet auf Klick, nicht nur beim Darüberfahren. Auf dem Handy
   * und auf dem iPad gibt es kein Darüberfahren, dort bliebe der Hinweis sonst
   * unerreichbar.
   */
  it("öffnet die Erklärung zur Objektbezeichnung auf Klick", () => {
    zeigeObjektbereich("");
    const infos = screen.getAllByRole("button", { name: "Erklärung" });
    fireEvent.click(infos[0]);
    expect(document.body.textContent).toContain("3-Zimmerwohnung");
  });

  it("öffnet die Erklärung zum Objekttyp auf Klick und nennt die drei Arten", () => {
    zeigeObjektbereich("");
    // Vor dem Klick steht der Satz nirgends, die Titel der drei Arten dagegen
    // schon, denn sie stehen in der Auswahlliste.
    expect(document.body.textContent).not.toContain("Um welche Art von Objekt");
    const infos = screen.getAllByRole("button", { name: "Erklärung" });
    fireEvent.click(infos[1]);
    const erklaerung = screen.getByText(/Um welche Art von Objekt/).textContent ?? "";
    for (const vorschlag of OBJEKTTYP_VORSCHLAEGE) expect(erklaerung).toContain(vorschlag);
  });
});
