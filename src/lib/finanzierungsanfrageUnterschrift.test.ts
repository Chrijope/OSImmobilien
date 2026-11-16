import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  faAlleUnterschrieben,
  faPerson,
  faUnterschriftenSetzen,
  istFaPersonTyp,
  pngAusDataUrl,
  type PdfDokument,
} from "../../supabase/functions/_shared/finanzierungsanfrage";

/** Ein schwarzes Pixel als PNG, steht für eine gezeichnete Unterschrift. */
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("Finanzierungsanfrage: Unterschriften", () => {
  it("erkennt nur die eigenen Anfragetypen", () => {
    expect(istFaPersonTyp("finanzierungsanfrage_p1")).toBe(true);
    expect(istFaPersonTyp("finanzierungsanfrage_p2")).toBe(true);
    expect(istFaPersonTyp("person1")).toBe(false);
    expect(faPerson("finanzierungsanfrage_p2")).toBe("p2");
  });

  it("nimmt nur PNG-Daten-URLs an", () => {
    expect(pngAusDataUrl(PIXEL)?.length).toBeGreaterThan(10);
    expect(pngAusDataUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(pngAusDataUrl(undefined)).toBeNull();
  });

  it("alle unterschrieben erst, wenn jede erwartete Person unterschrieben hat", () => {
    expect(faAlleUnterschrieben({ personen: { p1: { name: "", email: "", status: "unterschrieben" }, p2: { name: "", email: "", status: "offen" } } })).toBe(false);
    expect(faAlleUnterschrieben({ personen: { p1: { name: "", email: "", status: "unterschrieben" } } })).toBe(true);
    expect(faAlleUnterschrieben({ personen: {} })).toBe(false);
  });

  it("setzt Ort, Datum und beide Unterschriften auf Seite 6", async () => {
    const vorlage = new Uint8Array(readFileSync("public/vorlagen/finanzierungsanfrage-datenerfassung.pdf"));
    const vorher = await PDFDocument.load(vorlage);
    const groesseVorher = (await vorher.save()).length;
    const doc = await PDFDocument.load(vorlage);
    await faUnterschriftenSetzen(doc as unknown as PdfDokument, { ort: "München", datum: "16.11.2026", unterschriften: { p1: PIXEL, p2: PIXEL } });
    const nachher = await doc.save();
    expect(nachher.length).toBeGreaterThan(groesseVorher);
    expect((await PDFDocument.load(nachher)).getPageCount()).toBe(6);
  });
});
