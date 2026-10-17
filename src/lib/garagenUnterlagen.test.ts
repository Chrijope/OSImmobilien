import { describe, expect, it } from "vitest";
import { garagenBriefTexte, garagenDateinamen } from "./garagenUnterlagen";

const basis = {
  kaeuferName: "Anna Muster", kaeuferStrasse: "Musterweg 1", kaeuferPlzOrt: "10115 Berlin",
  weNr: "WE 46", haus: "38 f", garageNr: "G4", istMiete: 50, zielMiete: 100, datum: "2026-11-02",
};

describe("Garagenunterlagen für Käufer", () => {
  it("setzt Käufer, Einheit, Garage, Miete und Datum ins Anschreiben", () => {
    const t = garagenBriefTexte(basis).anschreiben;
    expect(t.empfaenger).toEqual(["Anna Muster", "Musterweg 1", "10115 Berlin"]);
    expect(t.angaben).toContainEqual(["Wohnung", "WE 46, Haus 38 f"]);
    expect(t.angaben).toContainEqual(["Datum", "Mittenwalde, 02.11.2026"]);
    expect(t.absaetze.join(" ")).toContain("Die Garage Nr. G4 ist über einen eigenen Mietvertrag mit drei Monaten Kündigungsfrist vermietet, derzeit für 50,00 € im Monat.");
    expect(t.absaetze.join(" ")).toContain("Differenz zwischen der tatsächlich gezahlten Garagenmiete und 100 € im Monat aus.");
  });

  it("lässt im Musterschreiben offen, was das CRM nicht kennt, und rechnet den Mehrbetrag", () => {
    const m = garagenBriefTexte(basis).muster;
    expect(m.absender[0]).toBe("Anna Muster");
    expect(m.empfaenger[0]).toBe("Vorname Nachname (Nutzer/in der Garage)");
    expect(m.absaetze.join(" ")).toContain("Das sind 50,00 € mehr als bisher.");
    expect(m.absaetze.join(" ")).toContain("IBAN ______");
    expect(m.absaetze[1]).toContain("seit dem TT.MM.JJJJ bin ich");
    const mitNutzer = garagenBriefTexte({ ...basis, nutzerName: "Ben Probe", uebergabe: "2027-01-01" }).muster;
    expect(mitNutzer.absaetze[0]).toBe("Sehr geehrte/r Ben Probe,");
    expect(mitNutzer.absaetze[1]).toContain("seit dem 01.01.2027");
  });

  it("vergibt lesbare Dateinamen", () => {
    expect(garagenDateinamen(basis)).toEqual({ anschreiben: "Ihre_Garage_Hauffstrasse_38_WE_46_Garage_G4.pdf", muster: "Musterschreiben_Garagennutzer_Garage_G4.pdf" });
  });
});
