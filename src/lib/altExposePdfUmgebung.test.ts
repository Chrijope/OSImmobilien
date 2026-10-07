import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Der ältere PDF-Erzeuger `exposePdf.ts` (Objekt-Exposé; das
 * Wohnungs-Exposé baut seit 01.10.2026 `exposeDruck`) und die Umgebung
 * (Christian, 24.09.2026): keine Ärzte, weil die PDFs an Kunden gehen und
 * Praxisnamen Personennamen tragen, und je Liste so viele Orte, wie die
 * Messung hat, bis zu zehn.
 *
 * jsPDF ist eine Attrappe, die jeden Aufruf schluckt und die gesetzten Texte
 * sammelt. Alle Orte sind erfunden.
 */
const texte = vi.hoisted(() => [] as string[]);

vi.mock("jspdf", () => {
  class JsPdfAttrappe {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    constructor() {
      // Jede nicht eigens nachgebaute Methode ist ein stiller Aufruf.
      return new Proxy(this, {
        get(ziel, name) {
          if (name in ziel) return (ziel as Record<string | symbol, unknown>)[name];
          return () => ziel;
        },
      });
    }
    text(t: string | string[]) { for (const z of Array.isArray(t) ? t : [t]) texte.push(String(z)); return this; }
    splitTextToSize(t: string) { return [String(t)]; }
    getTextWidth(t: string) { return String(t).length * 1.5; }
    getNumberOfPages() { return 1; }
    getImageProperties() { return { width: 3, height: 2 }; }
    output() { return new Blob(["pdf"]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe };
});

vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { generateExposePdf, type StandortDataPdf } from "@/lib/exposePdf";

const orte = (praefix: string, anzahl: number, typ = "Ort") =>
  Array.from({ length: anzahl }, (_, i) => ({ name: `${praefix} ${i + 1}`, typ, entfernung_m: 100 + 50 * i, lat: 48.33, lng: 10.87 }));

const STANDORT: StandortDataPdf = {
  objekt_koordinaten: { lat: 48.33, lng: 10.87 },
  mikrolage: {
    einkaufen: orte("Markt", 10, "Supermarkt"),
    oepnv: orte("Halt", 10, "Bus"),
    freizeit: orte("Sportplatz", 10, "Sport"),
    kindergaerten: orte("Kita", 5),
    schulen: orte("Schule", 5, "Grundschule"),
    apotheken: orte("Apotheke", 5),
    aerzte: [{ name: "Praxis Dr. med. Erika Beispiel", entfernung_m: 200, lat: 48.33, lng: 10.87 }],
  },
};

const zahl = (praefix: string) => texte.filter((t) => new RegExp(`^• ${praefix} \\d+$`).test(t)).length;

beforeEach(() => { texte.length = 0; });

describe("ältere Exposé-PDFs und die Umgebung", () => {
  it("Objekt-Exposé: mit Arztpraxen, bis zu zehn Orte je Liste", async () => {
    await generateExposePdf({ objekt: { titel: "Musterhaus", adresse: "Musterstraße 1", plz: "86150", ort: "Augsburg" }, bilder: [], wohnungen: [], standort: STANDORT });
    const alles = texte.join("\n");
    expect(alles).toContain("Erika Beispiel");
    expect(alles).toContain("Ärzte");
    expect(zahl("Markt")).toBe(10);
    expect(zahl("Halt")).toBe(10);
    expect(zahl("Sportplatz")).toBe(10);
    expect(zahl("Kita")).toBe(5);
    expect(zahl("Apotheke")).toBe(5);
  });
});
