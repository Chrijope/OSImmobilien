import { describe, it, expect } from "vitest";

/**
 * Welche Unterlagen die Objekttexte mitlesen.
 *
 * Christian am 23.09.2026: Die Beschreibung entsteht „aus den gesamten
 * Objektunterlagen“, zuerst Exposé, Objektbeschreibung, Baubeschreibung, Lage,
 * Energieausweis, Wirtschaftsplan. Nie dabei: Mietverträge, Mieterhöhungen,
 * Grundbuchauszüge, Reservierungen, Kaufvertragsmuster. Die tragen Namen und
 * Beträge und gehören nicht in einen Werbetext.
 */

import {
  beginntWiePdf,
  erkennbarKeinPdf,
  investagonKategorien,
  MAX_BYTES_GESAMT,
  MAX_BYTES_JE_UNTERLAGE,
  MAX_UNTERLAGEN,
  ordneUnterlageEin,
  ordneUnterlagen,
  type UnterlagenKandidat,
} from "../../supabase/functions/_shared/objekt-texte-unterlagen";

const dok = (name: string, teil: Partial<UnterlagenKandidat> = {}): UnterlagenKandidat => ({
  name,
  url: `/investagon-dokument/o1/${encodeURIComponent(name)}`,
  herkunft: "objekt",
  ...teil,
});

describe("Was nie mitgelesen wird", () => {
  const ausgeschlossen = [
    "Mietvertrag WE 03.pdf",
    "Mieterhöhung 2025.pdf",
    "Mieterliste.pdf",
    "Grundbuchauszug Blatt 1234.pdf",
    "GB 115615.pdf",
    "Reservierungsformular.pdf",
    "Kaufvertrag Muster.pdf",
    "Muster KV Notar.pdf",
    "Vollmacht.pdf",
    "Hausgeldabrechnung 2024.pdf",
    "Protokoll ETV 2025.pdf",
    "Selbstauskunft.pdf",
    "Rechnung Dachdecker.pdf",
  ];

  for (const name of ausgeschlossen) {
    it(`schließt „${name}“ aus`, () => {
      expect("ausschluss" in ordneUnterlageEin(name)).toBe(true);
    });
  }

  it("schließt nach Investagon-Kategorie aus, auch wenn der Name harmlos klingt", () => {
    expect(ordneUnterlageEin("WE 5.pdf", "rental_agreement")).toEqual({ ausschluss: "Mietunterlage mit Personendaten" });
    expect(ordneUnterlageEin("Auszug.pdf", "land_register")).toMatchObject({ ausschluss: expect.stringContaining("Grundbuch") });
  });

  it("lässt erwünschte Unterlagen durch, auch mit ähnlichen Wortteilen", () => {
    // „Wohnflächenberechnung“ enthält „rechnung“, „Anlage“ enthält „lage“.
    expect(ordneUnterlageEin("Wohnflächenberechnung.pdf")).toMatchObject({ art: "Grundriss und Fläche" });
    expect(ordneUnterlageEin("Anlage 3 Baubeschreibung.pdf")).toMatchObject({ art: "Baubeschreibung" });
    expect(ordneUnterlageEin("Energieausweis.pdf")).toMatchObject({ art: "Energieausweis" });
    expect(ordneUnterlageEin("Wirtschaftsplan 2026.pdf")).toMatchObject({ art: "Wirtschaftsplan" });
  });
});

describe("In welcher Reihenfolge", () => {
  it("folgt Christians Liste: Exposé, Objekt-, Baubeschreibung, Lage, Energie, Wirtschaftsplan, dann der Rest", () => {
    const { reihenfolge } = ordneUnterlagen([
      dok("Sonstiges Dokument.pdf"),
      dok("Grundriss WE 1.pdf"),
      dok("Wirtschaftsplan.pdf"),
      dok("Energieausweis.pdf"),
      dok("Lageplan.pdf"),
      dok("Baubeschreibung.pdf"),
      dok("Objektbeschreibung.pdf"),
      dok("Exposé Haus am Park.pdf"),
    ]);
    expect(reihenfolge.map((d) => d.art)).toEqual([
      "Exposé",
      "Objektbeschreibung",
      "Baubeschreibung",
      "Lage",
      "Energieausweis",
      "Wirtschaftsplan",
      "Grundriss und Fläche",
      "Sonstiges",
    ]);
  });

  it("nimmt die Investagon-Kategorie vor dem Namen", () => {
    const { reihenfolge } = ordneUnterlagen([
      dok("Datei 2.pdf"),
      dok("Datei 1.pdf", { investagonKategorie: "expose" }),
    ]);
    expect(reihenfolge[0]).toMatchObject({ name: "Datei 1.pdf", art: "Exposé" });
  });

  it("nimmt dasselbe Exposé nur einmal, das am Objekt vor dem an einer Einheit", () => {
    const { reihenfolge } = ordneUnterlagen([
      dok("Exposé.pdf", { herkunft: "einheit", url: "/investagon-dokument/o1/w1/expose.pdf" }),
      dok("Exposé.pdf", { herkunft: "einheit", url: "/investagon-dokument/o1/w2/expose.pdf" }),
      dok("Exposé.pdf", { herkunft: "objekt", url: "/investagon-dokument/o1/expose.pdf" }),
    ]);
    // Die erste gleichnamige gewinnt beim Entdoppeln, die Herkunft entscheidet nur bei gleichem Rang.
    expect(reihenfolge).toHaveLength(1);
  });

  it("lässt Word, Excel und Bilder weg, eine Datei ohne Endung aber nicht", () => {
    const { reihenfolge, ausgelassen } = ordneUnterlagen([
      dok("Exposé.docx"),
      dok("Flächen.xlsx"),
      dok("Foto.jpg"),
      dok("Baubeschreibung", { url: "/investagon-dokument/o1/baubeschreibung" }),
    ]);
    expect(reihenfolge.map((d) => d.name)).toEqual(["Baubeschreibung"]);
    expect(ausgelassen.every((a) => a.grund === "kein PDF")).toBe(true);
    expect(erkennbarKeinPdf({ name: "x", url: "/a/b.pdf" })).toBe(false);
  });

  it("überspringt Einträge ohne Ablage", () => {
    expect(ordneUnterlagen([dok("Exposé.pdf", { url: "" })]).reihenfolge).toEqual([]);
  });
});

describe("Hilfen beim Laden", () => {
  it("erkennt ein PDF am Dateianfang", () => {
    expect(beginntWiePdf(new TextEncoder().encode("%PDF-1.7"))).toBe(true);
    expect(beginntWiePdf(new TextEncoder().encode("PK\u0003\u0004"))).toBe(false);
    expect(beginntWiePdf(new Uint8Array())).toBe(false);
  });

  it("findet die Investagon-Kategorie über Titel oder Originalnamen", () => {
    const kategorie = investagonKategorien({
      files: [
        { title: "Exposé Haus am Park", filename: "https://x/abc.pdf", category: "expose" },
        { filename: "https://x/mv_we3.pdf", original_filename: "MV WE3.pdf", category: "rental_agreement" },
      ],
    });
    expect(kategorie("Exposé Haus am Park")).toBe("expose");
    expect(kategorie("MV WE3.pdf")).toBe("rental_agreement");
    expect(kategorie("Unbekannt.pdf")).toBeUndefined();
    // Die Einheiten liefern die Dateiliste direkt als Liste.
    expect(investagonKategorien([{ title: "Grundriss", filename: "g.pdf", category: "layout" }])("Grundriss")).toBe("layout");
  });

  it("begrenzt auf sechs Unterlagen, je höchstens 8 MB und zusammen 12 MB", () => {
    expect(MAX_UNTERLAGEN).toBe(6);
    expect(MAX_BYTES_JE_UNTERLAGE).toBe(8 * 1024 * 1024);
    expect(MAX_BYTES_GESAMT).toBe(12 * 1024 * 1024);
  });
});
