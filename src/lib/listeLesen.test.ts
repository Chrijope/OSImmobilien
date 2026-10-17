import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));
const { blaetterAusAntwort, istPdf } = await import("./listeLesen");

describe("Liste aus Excel oder PDF", () => {
  it("wandelt die Antwort der KI in Blätter mit Kopfzeile", () => {
    const b = blaetterAusAntwort({ blaetter: [{ name: "Mieterliste", kopf: ["WE", "Fläche", "Nettokalt"], zeilen: [["1", 95, 1404.5], ["2", 110, { x: 1 }]] }] });
    expect(b).toEqual([{ name: "Mieterliste", zeilen: [["WE", "Fläche", "Nettokalt"], ["1", 95, 1404.5], ["2", 110, null]] }]);
    expect(blaetterAusAntwort({ fehler: "x" })).toEqual([]);
    expect(blaetterAusAntwort({ blaetter: [{ kopf: ["WE"], zeilen: [] }] })[0].name).toBe("Tabelle 1");
  });

  it("erkennt PDFs an Typ oder Endung", () => {
    expect(istPdf(new File([""], "Liste.PDF"))).toBe(true);
    expect(istPdf(new File([""], "Liste.xlsx"))).toBe(false);
  });
});
