/**
 * Die Reservierungsvereinbarung im Kundenportal (26.09.2026).
 *
 * Die Datei liegt unter `reservierung/<kontaktId>/<investmentId>/`, einem
 * Ordner, den die Rolle Kunde bis zur Migration
 * `20260926150000_reservierung_kunde_lesen.sql` nicht lesen darf. Der Knopf
 * tat dann still gar nichts. Geprüft wird, dass er erst die Datei versucht und
 * sonst das PDF aus den Angaben erzeugt, und dass ein Fehlschlag gemeldet wird.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/storage", () => ({ unterlageHerunterladen: vi.fn() }));

const { reservierungsvereinbarungOeffnen, rvAblagePfad, rvZumOeffnen } = await import("./reservierungsvereinbarungKunde");

const PFAD = "reservierung/k-1/i-1/Reservierungsvereinbarung_Anna_Beispiel_01-09-2026.pdf";

function mittel(herunterladenErgebnis: boolean | Error, erzeugenFehler?: Error) {
  const aufrufe = { herunterladen: [] as unknown[][], erzeugen: [] as unknown[][] };
  return {
    aufrufe,
    mittel: {
      herunterladen: async (...args: unknown[]) => {
        aufrufe.herunterladen.push(args);
        if (herunterladenErgebnis instanceof Error) throw herunterladenErgebnis;
        return herunterladenErgebnis;
      },
      erzeugen: async (...args: unknown[]) => {
        aufrufe.erzeugen.push(args);
        if (erzeugenFehler) throw erzeugenFehler;
      },
    },
  };
}

describe("rvAblagePfad und rvZumOeffnen", () => {
  it("nimmt den Pfad aus dem Kundenordner, sonst aus rvPdfPath", () => {
    expect(rvAblagePfad({ docFileUrls: { Reservierungsvertrag: PFAD } })).toBe(PFAD);
    expect(rvAblagePfad({ rvPdfPath: PFAD })).toBe(PFAD);
    expect(rvAblagePfad({ docFileUrls: { Reservierungsvertrag: "  " } })).toBeNull();
    expect(rvAblagePfad(null)).toBeNull();
  });

  it("zeigt den Knopf, wenn es eine Datei oder die Angaben gibt", () => {
    expect(rvZumOeffnen({ rvPdfPath: PFAD })).toBe(true);
    expect(rvZumOeffnen({ rvData: { vorname: "Anna" } })).toBe(true);
    expect(rvZumOeffnen({})).toBe(false);
  });
});

describe("reservierungsvereinbarungOeffnen", () => {
  it("lädt die abgelegte Datei unter ihrem Namen herunter", async () => {
    const m = mittel(true);
    const ergebnis = await reservierungsvereinbarungOeffnen(
      { docFileUrls: { Reservierungsvertrag: PFAD }, rvPdf: "Reservierungsvereinbarung_Anna.pdf", rvData: { vorname: "Anna" } },
      m.mittel,
    );
    expect(ergebnis).toBe("abgelegt");
    expect(m.aufrufe.herunterladen).toEqual([[PFAD, "Reservierungsvereinbarung_Anna.pdf"]]);
    expect(m.aufrufe.erzeugen).toEqual([]);
  });

  it("erzeugt das PDF aus den Angaben, wenn die Datei nicht lesbar ist (Migration noch nicht gelaufen)", async () => {
    const m = mittel(false);
    const sigs = { kaeufer1: { signatureData: "x" } };
    const ergebnis = await reservierungsvereinbarungOeffnen(
      { docFileUrls: { Reservierungsvertrag: PFAD }, rvData: { vorname: "Anna" }, rvSignatures: sigs },
      m.mittel,
    );
    expect(ergebnis).toBe("neu_erzeugt");
    expect(m.aufrufe.erzeugen).toEqual([[{ vorname: "Anna" }, sigs, "Reservierungsvereinbarung.pdf"]]);
  });

  it("fällt auch dann auf die Angaben zurück, wenn das Herunterladen wirft", async () => {
    const m = mittel(new Error("Netz weg"));
    expect(await reservierungsvereinbarungOeffnen({ rvPdfPath: PFAD, rvData: {} }, m.mittel)).toBe("neu_erzeugt");
  });

  it("meldet einen Fehlschlag, wenn weder Datei noch Angaben da sind", async () => {
    const m = mittel(false);
    expect(await reservierungsvereinbarungOeffnen({ rvPdfPath: PFAD }, m.mittel)).toBe("fehlgeschlagen");
    expect(await reservierungsvereinbarungOeffnen(null, m.mittel)).toBe("fehlgeschlagen");
  });

  it("meldet einen Fehlschlag, wenn das Erzeugen scheitert, statt still nichts zu tun", async () => {
    const m = mittel(false, new Error("Schrift fehlt"));
    expect(await reservierungsvereinbarungOeffnen({ rvData: { vorname: "Anna" } }, m.mittel)).toBe("fehlgeschlagen");
  });
});

describe("Nach dem Aufheben zeigt das Portal nicht die alte Fassung (05.10.2026)", () => {
  it("finalize-reservierung leert bei neuer Unterschrift den Ablageort der alten Runde", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/finalize-reservierung/index.ts"), "utf-8");
    const block = quelle.slice(quelle.indexOf("const alterPfad ="), quelle.indexOf("rvSigned: true,"));
    expect(block).toContain("rvPdfPath: null");
    // Nur ein docFileUrls-Verweis auf denselben Pfad fällt weg, kein Upload von Hand.
    expect(block).toContain("docFileUrlsOhneAlt.Reservierungsvertrag === alterPfad");
    // Ohne Pfad öffnet das Portal das PDF aus den Angaben der neuen Runde.
    expect(rvAblagePfad({ rvPdfPath: null, docFileUrls: {}, rvData: { vorname: "Anna" } })).toBeNull();
  });
});
