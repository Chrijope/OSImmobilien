import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { LEER } from "./mietzuzahlung";
import { erzeugeMietzuzahlungPdf } from "./mietzuzahlungPdf";

/** Das PDF entsteht mit allen Werten der Vorlage (30.10.2026). */
describe("Mietzuzahlung als PDF", () => {
  it("baut das Dokument mit Beträgen, Grundbuch und Unterschriftszeilen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, headers: new Headers() })));
    const doc = await erzeugeMietzuzahlungPdf({
      ...LEER, kaeuferName: "Anna Muster", kaeuferAnschrift: "Weg 1, 10115 Berlin", weNr: "21", lage: "2.OG mi",
      strasse: "Hauffstraße 38 d", ort: "14548 Schwielowsee", garageNr: "G22", grundbuchVon: "Caputh", amtsgericht: "Potsdam", blatt: "1234",
      flaeche: "54,08", istMiete: "600", zielQm: "13", uebergabe: "2026-12-01", letzteErhoehung: "2026-03-01", erhoehungProzent: "4",
      garageIstMiete: "80", garageZuschussAuf: "100", garageMonate: "12", bank: "Musterbank", iban: "DE00 0000 0000 0000 0000 00",
    });
    const roh = doc.output();
    if (process.env.MIETZU_PDF) writeFileSync(process.env.MIETZU_PDF, Buffer.from(doc.output("arraybuffer")));
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(roh.length).toBeGreaterThan(1000);
    vi.unstubAllGlobals();
  });
});
