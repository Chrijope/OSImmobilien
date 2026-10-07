import { describe, it, expect } from "vitest";
import {
  galerieAufteilung,
  wechseltVonAllein,
  naechsterIndex,
  vorherigerIndex,
  bildBeschriftung,
} from "./objektGalerie";
import type { ObjektBild } from "./objekteStore";

/** Baut eine Bilderliste mit fortlaufender Reihenfolge. */
function bilder(anzahl: number): ObjektBild[] {
  return Array.from({ length: anzahl }, (_, i) => ({
    id: `b${i + 1}`,
    url: `https://beispiel.test/bild-${i + 1}.jpg`,
    alt: "",
    reihenfolge: i + 1,
  }));
}

describe("galerieAufteilung", () => {
  it("teilt viele Bilder auf fünf Felder auf und zählt den Rest", () => {
    const a = galerieAufteilung(bilder(10));
    expect(a.gross?.id).toBe("b1");
    expect(a.feste.map((b) => b.id)).toEqual(["b2", "b3", "b4"]);
    expect(a.wechsel.map((b) => b.id)).toEqual(["b5", "b6", "b7", "b8", "b9", "b10"]);
    // Sichtbar sind fünf Bilder, die restlichen fünf stehen als Zahl im Feld.
    expect(a.weitere).toBe(5);
    expect(wechseltVonAllein(a)).toBe(true);
  });

  it("bei genau sechs Bildern steht eine Eins über dem Wechselfeld", () => {
    const a = galerieAufteilung(bilder(6));
    expect(a.wechsel.map((b) => b.id)).toEqual(["b5", "b6"]);
    expect(a.weitere).toBe(1);
    expect(wechseltVonAllein(a)).toBe(true);
  });

  it("bei genau fünf Bildern sind alle Felder belegt, nichts wechselt", () => {
    const a = galerieAufteilung(bilder(5));
    expect(a.gross?.id).toBe("b1");
    expect(a.feste).toHaveLength(3);
    expect(a.wechsel.map((b) => b.id)).toEqual(["b5"]);
    expect(a.weitere).toBe(0);
    expect(wechseltVonAllein(a)).toBe(false);
  });

  it("bei vier Bildern bleibt das Wechselfeld leer und wird nicht gezeichnet", () => {
    const a = galerieAufteilung(bilder(4));
    expect(a.feste).toHaveLength(3);
    expect(a.wechsel).toHaveLength(0);
    expect(a.weitere).toBe(0);
    expect(wechseltVonAllein(a)).toBe(false);
  });

  it("bei drei Bildern gibt es zwei kleine Felder", () => {
    const a = galerieAufteilung(bilder(3));
    expect(a.gross?.id).toBe("b1");
    expect(a.feste.map((b) => b.id)).toEqual(["b2", "b3"]);
    expect(a.wechsel).toHaveLength(0);
  });

  it("bei zwei Bildern gibt es ein kleines Feld", () => {
    const a = galerieAufteilung(bilder(2));
    expect(a.feste.map((b) => b.id)).toEqual(["b2"]);
  });

  it("bei einem Bild gibt es nur das große Feld", () => {
    const a = galerieAufteilung(bilder(1));
    expect(a.gross?.id).toBe("b1");
    expect(a.feste).toHaveLength(0);
    expect(a.wechsel).toHaveLength(0);
    expect(a.weitere).toBe(0);
  });

  it("ohne Bilder bleibt alles leer", () => {
    for (const eingabe of [undefined, null, []]) {
      const a = galerieAufteilung(eingabe);
      expect(a.alle).toHaveLength(0);
      expect(a.gross).toBeUndefined();
      expect(a.feste).toHaveLength(0);
      expect(a.wechsel).toHaveLength(0);
      expect(a.weitere).toBe(0);
      expect(wechseltVonAllein(a)).toBe(false);
    }
  });

  it("wirft Bilder ohne Adresse heraus, bevor gezählt wird", () => {
    const liste: ObjektBild[] = [
      { id: "a", url: "", alt: "", reihenfolge: 1 },
      { id: "b", url: "   ", alt: "", reihenfolge: 2 },
      { id: "c", url: "https://beispiel.test/c.jpg", alt: "", reihenfolge: 3 },
    ];
    const a = galerieAufteilung(liste);
    expect(a.alle.map((b) => b.id)).toEqual(["c"]);
    expect(a.gross?.id).toBe("c");
  });

  it("beachtet die gepflegte Reihenfolge und verändert die Eingabe nicht", () => {
    const liste: ObjektBild[] = [
      { id: "spaet", url: "u1", alt: "", reihenfolge: 9 },
      { id: "frueh", url: "u2", alt: "", reihenfolge: 1 },
    ];
    const a = galerieAufteilung(liste);
    expect(a.alle.map((b) => b.id)).toEqual(["frueh", "spaet"]);
    expect(liste.map((b) => b.id)).toEqual(["spaet", "frueh"]);
  });
});

describe("naechsterIndex und vorherigerIndex", () => {
  it("laufen im Kreis", () => {
    expect(naechsterIndex(0, 3)).toBe(1);
    expect(naechsterIndex(2, 3)).toBe(0);
    expect(vorherigerIndex(0, 3)).toBe(2);
    expect(vorherigerIndex(2, 3)).toBe(1);
  });

  it("bleiben bei leerer Liste bei null", () => {
    expect(naechsterIndex(0, 0)).toBe(0);
    expect(vorherigerIndex(0, 0)).toBe(0);
  });

  it("fangen einen Index außerhalb der Liste ab", () => {
    expect(naechsterIndex(-5, 3)).toBe(2);
    expect(vorherigerIndex(-5, 3)).toBe(0);
  });
});

describe("bildBeschriftung", () => {
  const bild: ObjektBild = { id: "b1", url: "u", alt: "", reihenfolge: 1 };

  it("nennt die Adresse und die Stelle in der Reihe", () => {
    expect(bildBeschriftung(bild, "Musterweg 1, 12345 Musterstadt", 2, 10))
      .toBe("Foto der Immobilie Musterweg 1, 12345 Musterstadt, Bild 3 von 10");
  });

  it("stellt einen gepflegten Text voran und nennt die Adresse trotzdem", () => {
    expect(bildBeschriftung({ ...bild, alt: "Wohnzimmer" }, "Musterweg 1", 0, 4))
      .toBe("Wohnzimmer, Musterweg 1, Bild 1 von 4");
  });

  it("lässt die Zählung weg, wenn es nur ein Bild gibt", () => {
    expect(bildBeschriftung(bild, "Musterweg 1", 0, 1)).toBe("Foto der Immobilie Musterweg 1");
  });

  it("kommt ohne Adresse und ohne Bild zurecht", () => {
    expect(bildBeschriftung(bild, "", 0, 1)).toBe("Foto der Immobilie");
    expect(bildBeschriftung(undefined, "Musterweg 1", 0, 1)).toBe("");
  });
});
