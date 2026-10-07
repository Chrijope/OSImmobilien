import { describe, it, expect } from "vitest";
import { zerlegeBeschreibung } from "@/components/objekte/Objektbeschreibung";

describe("Beschreibung gliedern", () => {
  it("erkennt Markdown-Ueberschriften", () => {
    expect(zerlegeBeschreibung("## Die Lage")).toEqual([{ art: "ueberschrift", text: "Die Lage" }]);
  });

  it("erkennt die alten Grossbuchstaben-Ueberschriften samt Text dahinter", () => {
    expect(zerlegeBeschreibung("MIKROLAGE: Ruhige Seitenstrasse")).toEqual([
      { art: "ueberschrift", text: "Mikrolage" },
      { art: "absatz", text: "Ruhige Seitenstrasse" },
    ]);
  });

  it("erkennt kurze Zeilen mit Doppelpunkt als Ueberschrift", () => {
    expect(zerlegeBeschreibung("Ausstattung:")).toEqual([{ art: "ueberschrift", text: "Ausstattung" }]);
  });

  it("macht aus einem Satz mit Doppelpunkt keine Ueberschrift", () => {
    // Ohne Laengengrenze waere der ganze Satz verschwunden.
    const lang = "Die Lage ueberzeugt aus mehreren Gruenden: ruhig gelegen und trotzdem zentral:";
    expect(zerlegeBeschreibung(lang)[0].art).toBe("absatz");
  });

  it("fasst aufeinanderfolgende Punkte zu einer Liste zusammen", () => {
    const b = zerlegeBeschreibung("- Balkon\n- Aufzug\n* Tiefgarage\n• Keller");
    expect(b).toHaveLength(1);
    expect(b[0]).toEqual({ art: "liste", punkte: ["Balkon", "Aufzug", "Tiefgarage", "Keller"] });
  });

  it("trennt zwei Listen, wenn eine Leerzeile dazwischen steht", () => {
    const b = zerlegeBeschreibung("- A\n- B\n\n- C");
    expect(b.filter((x) => x.art === "liste")).toHaveLength(2);
  });

  it("beendet eine Liste, wenn eine Ueberschrift folgt", () => {
    const b = zerlegeBeschreibung("- A\n## Weiter\n- B");
    expect(b.map((x) => x.art)).toEqual(["liste", "ueberschrift", "liste"]);
  });

  it("kommt mit leerem und fehlendem Text zurecht", () => {
    expect(zerlegeBeschreibung("")).toEqual([]);
    expect(zerlegeBeschreibung("   \n\n  ")).toEqual([]);
  });

  it("laesst einen gewoehnlichen Absatz unveraendert", () => {
    expect(zerlegeBeschreibung("Ein schoenes Objekt in guter Lage."))
      .toEqual([{ art: "absatz", text: "Ein schoenes Objekt in guter Lage." }]);
  });

  it("gliedert einen vollstaendigen Text richtig", () => {
    const text = [
      "## Makrolage",
      "Arberg liegt im Landkreis Ansbach.",
      "",
      "Ausstattung:",
      "- Fussbodenheizung",
      "- Balkon",
    ].join("\n");
    expect(zerlegeBeschreibung(text).map((b) => b.art))
      .toEqual(["ueberschrift", "absatz", "ueberschrift", "liste"]);
  });
});
