import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { investagonNachGruppe, investagonUnterlagen, unterlageOeffnen } from "./ObjektDetail";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die Unterlagen eines Investagon-Objekts und der Knopf „Ansehen".
 *
 * Warum es diesen Test gibt: Der Fehler, den Christian gemeldet hat, war
 * lautlos. `openUnterlage` sucht jeden Wert im Supabase-Eimer „unterlagen".
 * Eine Investagon-Unterlage liegt dort nicht, die Suche lieferte null, und der
 * Klick tat nichts, ohne jede sichtbare Meldung. So ein Fehler faellt beim
 * Ansehen nicht auf, nur beim Klicken. Deshalb steht hier fest, welcher Wert
 * welchen Weg nimmt.
 */

const objekt = (teile: Partial<ObjektData> & Record<string, unknown>) => teile as unknown as ObjektData;

describe("investagonUnterlagen", () => {
  it("uebersetzt die Gruppe ins Deutsche und nimmt die Originaladresse", () => {
    const liste = investagonUnterlagen(objekt({
      dokumente: [],
      meta: {
        investagonRaw: {
          files: [{
            id: 400086,
            title: "3.03+Energieausweis+B5-9",
            category: "energy_certificate",
            filename: "https://tool.investagon.com/uploads/properties_files/e32206.pdf",
            original_filename: "3.03+Energieausweis+B5-9.pdf",
          }],
        },
      },
    }));
    expect(liste).toHaveLength(1);
    expect(liste[0].gruppe).toBe("Energieausweis");
    expect(liste[0].titel).toBe("3.03+Energieausweis+B5-9");
    expect(liste[0].url).toBe("https://tool.investagon.com/uploads/properties_files/e32206.pdf");
  });

  it("nimmt die uebernommene Kopie, sobald es sie gibt", () => {
    // Die Kopie im eigenen Eimer braucht keinen Investagon-Zugang. Sie hat
    // deshalb Vorrang vor der Adresse bei Investagon.
    const liste = investagonUnterlagen(objekt({
      dokumente: [{ id: "d1", name: "Teilungserklärung", url: "/investagon-dokument/obj-1/te.pdf", typ: "custom", kategorie: "intern", sichtbar: false }],
      meta: {
        investagonRaw: {
          files: [{
            id: 7, title: "Teilungserklärung", category: "declaration_of_division",
            filename: "https://tool.investagon.com/uploads/properties_files/te.pdf",
            original_filename: "te.pdf",
          }],
        },
      },
    }));
    expect(liste).toHaveLength(1);
    expect(liste[0].url).toBe("/investagon-dokument/obj-1/te.pdf");
    expect(liste[0].gruppe).toBe("Teilungserklärung");
  });

  it("laesst eine uebernommene Unterlage ohne Gegenstueck nicht verschwinden", () => {
    const liste = investagonUnterlagen(objekt({
      dokumente: [{ id: "d1", name: "Altbestand", url: "/investagon-dokument/obj-1/alt.pdf", typ: "custom", kategorie: "intern", sichtbar: false }],
      meta: { investagonRaw: { files: [] } },
    }));
    expect(liste.map(u => u.url)).toEqual(["/investagon-dokument/obj-1/alt.pdf"]);
  });

  it("laesst ein unbekanntes Kuerzel stehen, statt es zu verstecken", () => {
    // Eine neue Gruppe bei Investagon soll auffallen und nicht still unter
    // „Sonstiges" landen.
    const liste = investagonUnterlagen(objekt({
      dokumente: [],
      meta: { investagonRaw: { files: [{ id: 1, title: "X", category: "brandneu", filename: "https://tool.investagon.com/x.pdf" }] } },
    }));
    expect(liste[0].gruppe).toBe("brandneu");
  });

  it("nimmt einen Eintrag ohne Adresse gar nicht erst auf", () => {
    // Ein Knopf, der verlaesslich nichts tut, ist schlimmer als kein Knopf.
    const liste = investagonUnterlagen(objekt({
      dokumente: [],
      meta: { investagonRaw: { files: [{ id: 1, title: "Ohne Datei", category: "expose", filename: "" }] } },
    }));
    expect(liste).toEqual([]);
  });

  it("kommt mit einem Objekt ohne Investagon-Daten zurecht", () => {
    expect(investagonUnterlagen(objekt({ dokumente: [], meta: {} }))).toEqual([]);
    expect(investagonUnterlagen(objekt({ dokumente: [] }))).toEqual([]);
  });
});

describe("investagonNachGruppe", () => {
  it("fasst zusammen und behaelt die Reihenfolge des ersten Auftretens", () => {
    const gruppen = investagonNachGruppe([
      { id: "a", titel: "A", gruppe: "Grundrisse", url: "u", dateiname: "" },
      { id: "b", titel: "B", gruppe: "Exposé", url: "u", dateiname: "" },
      { id: "c", titel: "C", gruppe: "Grundrisse", url: "u", dateiname: "" },
    ]);
    expect(gruppen.map(([name, eintraege]) => [name, eintraege.length])).toEqual([
      ["Grundrisse", 2],
      ["Exposé", 1],
    ]);
  });
});

describe("unterlageOeffnen", () => {
  let geoeffnet: string[];
  let original: typeof window.open;

  beforeEach(() => {
    geoeffnet = [];
    original = window.open;
    window.open = vi.fn((url?: string | URL) => { geoeffnet.push(String(url)); return null; }) as typeof window.open;
  });
  afterEach(() => { window.open = original; });

  it("oeffnet die Investagon-Seite sofort, ohne Umweg ueber Supabase", () => {
    // Sofort heisst: noch im Klick. Ein window.open nach einem await gilt
    // manchen Browsern nicht mehr als Nutzerklick und wird geblockt.
    unterlageOeffnen("/investagon-dokument/obj-1/te.pdf");
    expect(geoeffnet).toEqual(["/investagon-dokument/obj-1/te.pdf"]);
  });

  it("oeffnet eine fremde Adresse unveraendert", () => {
    unterlageOeffnen("https://tool.investagon.com/uploads/properties_files/x.pdf");
    expect(geoeffnet).toEqual(["https://tool.investagon.com/uploads/properties_files/x.pdf"]);
  });

  it("laesst eine Supabase-Ablage weiterhin die befristete Adresse holen", () => {
    unterlageOeffnen("/objekt-dokument/objekte/o1/dokumente/d1.pdf");
    expect(geoeffnet).toEqual([]);
  });

  it("tut ohne Adresse gar nichts", () => {
    unterlageOeffnen("");
    unterlageOeffnen(null);
    expect(geoeffnet).toEqual([]);
  });
});
