import { describe, expect, it, vi } from "vitest";
const { rows } = vi.hoisted(() => ({ rows: {} as Record<string, any[]> }));
vi.mock("@/lib/dataCache", () => ({
  cacheGet: (table: string) => rows[table] || [],
  cacheFilter: (table: string, filter: (row: any) => boolean) => (rows[table] || []).filter(filter),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/dbStoreHelper", () => ({ isTestAccount: () => false }));
vi.mock("@/lib/userSettingsCache", () => ({}));
import { getObjekte } from "@/lib/objekteStore";

describe("Investagon Medien in der internen Objektverwaltung", () => {
  it("zeigt importierte Wohnungsunterlagen und Fotos neben Handpflege an", () => {
    rows.objekte = [{ id: "o1", titel: "Importobjekt", bild_url: "import.jpg" }];
    rows.wohnungen = [{ id: "w1", objekt_id: "o1", meta: { bilder: [{ id: "manual", url: "manual.jpg" }], dokumente: [{ id: "manual-doc", url: "manual.pdf" }] } }];
    rows.wohnungs_bilder = [{ id: "photo", wohnung_id: "w1", url: "import.jpg" }];
    rows.wohnungs_dokumente = [{ id: "doc", wohnung_id: "w1", url: "/investagon-dokument/o1/expose.pdf" }, { id: "other", wohnung_id: "w2", url: "other.pdf" }];
    const objekt = getObjekte()[0];
    expect(objekt.bildUrl).toBe("import.jpg");
    expect(objekt.wohnungen[0].bilder?.map(b => b.url)).toEqual(["manual.jpg", "import.jpg"]);
    expect(objekt.wohnungen[0].dokumente?.map(d => d.url)).toEqual(["manual.pdf", "/investagon-dokument/o1/expose.pdf"]);
  });
});
