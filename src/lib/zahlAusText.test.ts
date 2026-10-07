import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { zahlAusText } from "@/lib/zahlAusText";

/**
 * Der Kaufpreis im gedruckten Reservierungs-PDF war falsch.
 *
 * Das Formular schreibt den Preis mit Tausenderpunkten, das PDF las ihn mit
 * `Number` ohne. Aus 189.000 Euro wurde im unterschriebenen Dokument 189 Euro,
 * bei einem siebenstelligen Preis stand dort „NaN €“. Der Wert im CRM war
 * richtig, nur das Papier war falsch.
 *
 * Deshalb steht die Umwandlung an einer Stelle, und deshalb steht sie hier
 * unter Aufsicht.
 */

/** Wie `reservierungPdf.ts` den Betrag druckt. Das schmale Leerzeichen von
 *  Intl wird zum gewöhnlichen, damit der Vergleich lesbar bleibt. */
const euro = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
    .format(v)
    .replace(/\u00a0/g, " ");

describe("Sechsstellige Beträge", () => {
  it("liest 189.000 als hundertneunundachtzigtausend", () => {
    expect(zahlAusText("189.000")).toBe(189000);
  });

  it("druckt daraus wieder 189.000 €, nicht 189 €", () => {
    expect(euro(zahlAusText("189.000"))).toBe("189.000 €");
  });

  it("kommt auch ohne Tausenderpunkt zum selben Ergebnis", () => {
    expect(zahlAusText("189000")).toBe(189000);
  });
});

describe("Siebenstellige Beträge", () => {
  it("liest 1.250.000 richtig, wo Number gar keine Zahl lieferte", () => {
    expect(Number.isNaN(Number("1.250.000"))).toBe(true);
    expect(zahlAusText("1.250.000")).toBe(1250000);
  });

  it("druckt daraus 1.250.000 €, nicht NaN €", () => {
    expect(euro(zahlAusText("1.250.000"))).toBe("1.250.000 €");
  });
});

describe("Nachkommastellen und Beiwerk", () => {
  it("nimmt das Komma als Dezimaltrennzeichen", () => {
    expect(zahlAusText("189.000,50")).toBe(189000.5);
  });

  it("lässt einen einzelnen Punkt als Dezimalpunkt stehen", () => {
    // Sonst würde aus einer Rendite von 3,94 Prozent eine von 394.
    expect(zahlAusText("3.94")).toBe(3.94);
    expect(zahlAusText("62.5")).toBe(62.5);
  });

  it("stört sich nicht an Währungszeichen und Leerzeichen", () => {
    expect(zahlAusText(" 189.000 € ")).toBe(189000);
  });

  it("liest negative Beträge", () => {
    expect(zahlAusText("-1.250,00")).toBe(-1250);
  });
});

describe("Was nichts hergibt, ergibt null", () => {
  it("gibt bei leerem Text und Unsinn eine Null zurück, nie NaN", () => {
    for (const v of ["", "   ", "abc", "€", null, undefined, {}]) {
      expect(zahlAusText(v)).toBe(0);
    }
  });

  it("reicht eine echte Zahl unverändert durch", () => {
    expect(zahlAusText(189000)).toBe(189000);
    expect(zahlAusText(0)).toBe(0);
    expect(zahlAusText(Number.NaN)).toBe(0);
  });
});

// ── Was sich nur am Quelltext festhalten lässt ──

const pdf = readFileSync(resolve(process.cwd(), "src/lib/reservierungPdf.ts"), "utf8");
const formular = readFileSync(resolve(process.cwd(), "src/components/reservierung/ReservierungsForm.tsx"), "utf8");

describe("Die Ursache ist behoben, nicht das Symptom", () => {
  it("liest das PDF den Preis nicht mehr mit Number", () => {
    expect(pdf).not.toContain("Number(data.gesamtpreis)");
    expect(pdf).toContain("zahlAusText(data.gesamtpreis)");
  });

  it("benutzt auch das Formular dieselbe Umwandlung", () => {
    expect(formular).toContain("zahlAusText(data.gesamtpreis)");
  });
});
