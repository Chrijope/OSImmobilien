import { describe, it, expect, vi } from "vitest";

/**
 * „Objektinhalte einspielen“: Zuordnung der Texte und Bilder, Vorschau mit
 * Haken für gepflegte Texte, und die Sperre der manuellen Highlights
 * gegenüber Kunden.
 */

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const { textVorschau, metaPatch, darfSchreiben, bilderZuordnen, bildAblagePfad } = await import("@/lib/objektInhalteImport");
const { interneHighlights } = await import("@/lib/interneHighlights");
const { OBJEKT_INHALTE } = await import("@/data/objektInhalte");
const { oeffentlichesMeta, oeffentlichesObjekt } = await import("../../supabase/functions/_shared/expose-oeffentlich");
const { kundenMeta } = await import("../../supabase/functions/_shared/kunden-meta");

const INHALT = { adresse: "Hauffstraße 38", kurzbeschreibung: "Neu.", standortargumente: ["A", "B"], interneHighlights: ["AfA 3,1 %"] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objekt(weiteres: Record<string, any> = {}): any {
  return { id: "o1", titel: "Hauffstraße 38 a", adresse: "Hauffstraße 38 a, 14548 Schwielowsee", meta: {}, globalDaten: {}, wohnungen: [], ...weiteres };
}

describe("Texte", () => {
  it("ordnet per Adresse zu und schreibt ohne Haken, wenn nichts gepflegt ist", () => {
    const v = textVorschau(INHALT, [objekt(), objekt({ id: "o2", titel: "Barfusstraße 9", adresse: "Barfusstraße 9" })]);
    expect(v.art).toBe("bereit");
    if (v.art !== "bereit") return;
    expect(v.objektId).toBe("o1");
    expect(v.brauchtHaken).toBe(false);
    expect(darfSchreiben(v, false)).toBe(true);
    expect(metaPatch(v)).toEqual({ kurzbeschreibung: "Neu.", standortargumente: ["A", "B"], interneHighlightsHand: ["AfA 3,1 %"] });
  });

  it("verlangt den Haken, wenn ein von Hand gepflegter Text abweicht", () => {
    const v = textVorschau(INHALT, [objekt({ meta: { kurzbeschreibung: "Von Christian getippt." } })]);
    if (v.art !== "bereit") throw new Error("nicht zugeordnet");
    const kurz = v.felder.find((f) => f.feld === "kurzbeschreibung")!;
    expect(kurz.vorher).toEqual(["Von Christian getippt."]);
    expect(kurz.gepflegt).toBe(true);
    expect(darfSchreiben(v, false)).toBe(false);
    expect(darfSchreiben(v, true)).toBe(true);
  });

  it("schreibt gleiche Felder nicht noch einmal und ist dann fertig", () => {
    const v = textVorschau(INHALT, [objekt({ meta: { kurzbeschreibung: "Neu.", standortargumente: ["A", "B"], interneHighlightsHand: ["AfA 3,1 %"] } })]);
    if (v.art !== "bereit") throw new Error("nicht zugeordnet");
    expect(v.felder.every((f) => f.gleich)).toBe(true);
    expect(metaPatch(v)).toEqual({});
    expect(darfSchreiben(v, true)).toBe(false);
  });

  it("bleibt unklar ohne passendes oder mit zwei Objekten", () => {
    expect(textVorschau(INHALT, []).art).toBe("unklar");
    expect(textVorschau(INHALT, [objekt(), objekt({ id: "o2" })]).art).toBe("unklar");
  });

  it("Datendatei: alle fünf Objekte, fünf Standortargumente, 6 bis 8 Highlights, kein Gedankenstrich, Grenzen eingehalten", () => {
    expect(OBJEKT_INHALTE.map((i) => i.adresse)).toEqual(["Barfusstraße 9", "Hauffstraße 38", "Luisenstraße 72", "Agnesstraße 29", "Agnesstraße 30"]);
    for (const i of OBJEKT_INHALTE) {
      expect(i.standortargumente).toHaveLength(5);
      expect(i.kurzbeschreibung.length).toBeLessThanOrEqual(1000);
      expect(i.standortargumente.every((a) => a.length <= 160)).toBe(true);
      expect(i.interneHighlights.length).toBeGreaterThanOrEqual(6);
      expect(i.interneHighlights.length).toBeLessThanOrEqual(8);
      expect(JSON.stringify(i)).not.toMatch(/[–—]/);
    }
  });
});

describe("Bilder", () => {
  const hauff = objekt({
    wohnungen: [
      { id: "w5", weNr: "WE 5", bilder: [] },
      { id: "w40", weNr: "40", bilder: [{ url: "https://x/objekte/o1/wohnungen/w40/bilder/import-01-jpg.webp" }] },
    ],
  });
  const agnes = { id: "z1", titel: "Agnesstraße 29", adresse: "Agnesstraße 29, 15838 Zossen", bildUrl: "", bilder: [], wohnungen: [{ id: "zw", weNr: "DHH", bilder: [] }] };
  const d = (pfad: string) => ({ pfad, name: pfad.split("/").pop()! });

  it("ordnet Objekt, WE-Ordner und Hausordner zu, sortiert und setzt ein Titelbild", () => {
    const z = bilderZuordnen([
      d("Objektbilder Import/Hauffstraße 38/Objekt/10.jpg"),
      d("Objektbilder Import/Hauffstraße 38/Objekt/2.jpg"),
      d("Objektbilder Import/Hauffstraße 38/WE05/a.png"),
      d("Objektbilder Import/Hauffstraße 38/WE40/01.jpg"),
      d("Objektbilder Import/Zossen Wünsdorf/Agnesstraße 29/garten.jpg"),
      d("Objektbilder Import/Zossen Wünsdorf/Objekt/x.jpg"),
      d("Objektbilder Import/.DS_Store"),
    ], [hauff, agnes]);
    expect(Object.fromEntries(z.map((x) => [x.datei.name, x.art]))).toEqual({
      "10.jpg": "objekt", "2.jpg": "objekt", "a.png": "einheit", "01.jpg": "einheit",
      "garten.jpg": "einheit", "x.jpg": "unklar", ".DS_Store": "ignoriert",
    });
    // Reihenfolge natürlich nach Name: 2 vor 10.
    const objektBilder = z.filter((x) => x.art === "objekt") as Array<{ datei: { name: string }; reihenfolge: number; titelbild: boolean }>;
    const nachRang = [...objektBilder].sort((a, b) => a.reihenfolge - b.reihenfolge).map((x) => x.datei.name);
    expect(nachRang).toEqual(["2.jpg", "10.jpg"]);
    expect(objektBilder.find((x) => x.datei.name === "2.jpg")!.titelbild).toBe(true);
    // Schon vorhanden (gleicher Ablagename) wird übersprungen.
    const we40 = z.find((x) => x.datei.name === "01.jpg")!;
    expect("schonDa" in we40 && we40.schonDa).toBe(true);
    // Zossen: Hausordner an die einzige Einheit, Titelbild fürs Objekt aus dem Einheitenbild.
    const garten = z.find((x) => x.datei.name === "garten.jpg")!;
    expect(garten.art === "einheit" && garten.wohnungId === "zw" && garten.titelbild).toBe(true);
    if (garten.art === "einheit") expect(bildAblagePfad(garten, "webp")).toBe("objekte/z1/wohnungen/zw/bilder/import-garten-jpg.webp");
  });
});

describe("manuelle interne Highlights", () => {
  const GEHEIM = "Mietsubvention befristet, danach Vertragsmiete";
  const meta = { interneHighlightsHand: [GEHEIM] };

  it("erscheinen auf der internen Karte, vorne und als von Hand gepflegt", () => {
    const h = interneHighlights({ ...objekt({ meta }), sanierungskosten: 0, erhaltungsaufwandJahre: 1, afaDaten: undefined, dokumente: [] });
    expect(h.punkte[0]).toEqual({ text: GEHEIM, herkunft: "hand" });
  });

  it("gehen nie an Kunden: Exposé und Kundenansicht lassen sie nicht durch", () => {
    expect(JSON.stringify(oeffentlichesMeta(meta))).not.toContain(GEHEIM);
    expect(JSON.stringify(oeffentlichesObjekt({ id: "o1", meta }))).not.toContain(GEHEIM);
    for (const art of ["objekt", "wohnung", "wohnung_global"] as const) {
      expect(JSON.stringify(kundenMeta(meta, art))).not.toContain(GEHEIM);
    }
  });
});

describe("Kurzbeschreibungen", () => {
  it("sind standortbezogen und höchstens 1000 Zeichen lang (Christian, 16.10.2026)", () => {
    for (const o of OBJEKT_INHALTE) {
      expect(o.kurzbeschreibung.length, o.adresse).toBeLessThanOrEqual(1000);
      expect(o.kurzbeschreibung, o.adresse).toMatch(/liegt/);
    }
  });
});
