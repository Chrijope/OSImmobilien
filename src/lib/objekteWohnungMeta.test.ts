import { describe, expect, it, vi } from "vitest";
const { rows } = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => rows[table] || [],
  cacheFilter: (table: string, filter: (row: any) => boolean) => (rows[table] || []).filter(filter),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/userSettingsCache", () => ({}));
import { getObjekte, wohnungToDbRow } from "@/lib/objekteStore";

/*
 * `saveObjekt` loescht die Einheiten und fuegt sie neu ein. Was beim
 * Umschreiben in die Datenbankzeile verlorengeht, ist danach endgueltig weg.
 * Genau das ist mit den Investagon-Feldern passiert.
 */
const investagonMeta = {
  investagonId: "unit-uuid",
  investagonRaw: { statusName: "Notartermin", api_property_id: "unit-uuid" },
  moebelPreis: 12000,
  investagonStatusVerwaltet: true,
};

function gespeicherteWohnung() {
  rows.objekte = [{ id: "o1", titel: "Importobjekt" }];
  rows.wohnungen = [{ id: "w1", objekt_id: "o1", we_nr: "WE 01", status: "frei", meta: investagonMeta }];
  rows.wohnungs_bilder = [];
  rows.wohnungs_dokumente = [];
  const w = getObjekte()[0].wohnungen[0];
  return { w, altesMeta: rows.wohnungen[0].meta };
}

describe("Wohnung speichern: Investagon-Felder überleben", () => {
  it("liest Kennung und Originaldatensatz und schreibt beide zurück", () => {
    const { w } = gespeicherteWohnung();
    expect(w.investagonId).toBe("unit-uuid");
    expect(w.investagonStatusText).toBe("Notartermin");
    const zeile = wohnungToDbRow(w, "o1");
    expect(zeile.meta.investagonId).toBe("unit-uuid");
    expect(zeile.meta.investagonRaw).toEqual(investagonMeta.investagonRaw);
  });

  it("behält auch Schlüssel, die das CRM gar nicht kennt", () => {
    const { w, altesMeta } = gespeicherteWohnung();
    const zeile = wohnungToDbRow(w, "o1", altesMeta);
    expect(zeile.meta.moebelPreis).toBe(12000);
    expect(zeile.meta.investagonStatusVerwaltet).toBe(true);
  });

  it("lässt gepflegte Felder den alten Stand überschreiben", () => {
    const { w, altesMeta } = gespeicherteWohnung();
    const zeile = wohnungToDbRow(
      { ...w, ruecklageWohnung: 900 },
      "o1",
      { ...altesMeta, ruecklageWohnung: 100 },
    );
    expect(zeile.meta.ruecklageWohnung).toBe(900);
  });

  it("schreibt keine leere Kennung über eine vorhandene", () => {
    const { w } = gespeicherteWohnung();
    const zeile = wohnungToDbRow({ ...w, investagonId: undefined, investagonRaw: undefined }, "o1");
    expect("investagonId" in zeile.meta).toBe(false);
    expect("investagonRaw" in zeile.meta).toBe(false);
  });
});
