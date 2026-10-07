import { describe, expect, it } from "vitest";
import { gaesteNamenAusDetails } from "./terminAnzeige";

describe("gaesteNamenAusDetails", () => {
  it("liest Namen aus der Gäste-Zeile und laesst die Mail-Adressen weg", () => {
    const details = [
      "Beratung zum Objekt",
      "Gäste: Maria Muster <maria@example.com>, Steuerbüro Klein <info@klein.de>",
    ].join("\n");
    expect(gaesteNamenAusDetails(details)).toEqual(["Maria Muster", "Steuerbüro Klein"]);
  });

  it("liefert den Platzhalter-Namen, wenn nur eine Mail angegeben war", () => {
    // So schreibt es der Dialog, wenn das Namensfeld leer blieb.
    expect(gaesteNamenAusDetails("Gäste: Gast <nur@mail.de>")).toEqual(["Gast"]);
  });

  it("findet die Zeile auch hinter Beschreibung und Treffpunkt", () => {
    const details = "Vorbesprechung\nTreffpunkt: Büro Ulm\nGäste: Otto Hans <otto@hans.de>";
    expect(gaesteNamenAusDetails(details)).toEqual(["Otto Hans"]);
  });

  it("kommt mit fehlenden oder leeren Details zurecht", () => {
    expect(gaesteNamenAusDetails(undefined)).toEqual([]);
    expect(gaesteNamenAusDetails(null)).toEqual([]);
    expect(gaesteNamenAusDetails("")).toEqual([]);
    expect(gaesteNamenAusDetails("Nur eine Beschreibung ohne Gäste")).toEqual([]);
  });

  it("ignoriert leere Eintraege in der Aufzaehlung", () => {
    expect(gaesteNamenAusDetails("Gäste: , Anna Beispiel <a@b.de>, ")).toEqual(["Anna Beispiel"]);
  });
});
