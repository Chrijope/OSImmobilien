import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Interne Highlights: feste Werte vor KI, nichts Erfundenes, und vor allem
 * nie beim Kunden. Die Positivlisten für Exposé und Kundenansicht dürfen
 * `objekttexteKi.interneHighlights` nicht durchlassen.
 */

vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: vi.fn() } } }));

const { interneHighlights } = await import("@/lib/interneHighlights");
const { OBJEKT_TEXTE_SCHEMA, pruefeInterneHighlights } = await import("../../supabase/functions/_shared/objekt-texte");
const { oeffentlichesMeta, oeffentlichesObjekt } = await import("../../supabase/functions/_shared/expose-oeffentlich");
const { kundenMeta } = await import("../../supabase/functions/_shared/kunden-meta");

const GEHEIM = "Erstvermietungsgarantie 24 Monate laut Kaufvertragsentwurf";

function stand(highlights: unknown[] = []) {
  return {
    schema: OBJEKT_TEXTE_SCHEMA,
    kurzbeschreibung: "Saniertes Haus.",
    standortargumente: [],
    marktargumente: [],
    sanierungen: [{ jahr: "2021", massnahme: "Dach erneuert", beleg: "x" }],
    interneHighlights: highlights,
    erzeugtAm: "2026-10-01T10:00:00.000Z",
    modell: "m",
    quellenStand: "q",
    quellen: [],
    beanstandungen: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function objekt(weiteres: Record<string, any> = {}): any {
  return {
    id: "o1",
    titel: "Musterhaus",
    adresse: "Musterweg 1",
    ort: "Augsburg",
    meta: {},
    globalDaten: { baujahr: 1965 },
    sanierungskosten: 0,
    erhaltungsaufwandJahre: 1,
    afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 },
    dokumente: [],
    wohnungen: [],
    ...weiteres,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function einheit(weiteres: Record<string, any> = {}): any {
  return {
    id: "w1", weNr: "WE 3", etage: "2. OG", lage: "links", groesse: 50, zimmer: 2, mieteGesamt: 600,
    vkGesamt: 200000, qmPreis: 4000, rendite: 3.6, vermietet: true, status: "frei", ...weiteres,
  };
}

describe("interneHighlights", () => {
  it("zieht Erhaltungsaufwand und Restnutzungsdauer aus den festen Daten nach oben", () => {
    const h = interneHighlights(objekt({
      sanierungskosten: 480000,
      erhaltungsaufwandJahre: 3,
      afaDaten: { afaModell: "gutachten", afaSatz: 2, restnutzungsdauer: 30, grundstueckAnteil: 20 },
      meta: { objekttexteKi: stand() },
    }));
    expect(h.erhaltungsaufwand?.text).toMatch(/Erhaltungsaufwand: 480\.000\s€ gesamt.*verteilt auf 3 Jahre/);
    expect(h.restnutzungsdauer?.text).toMatch(/30 Jahre RND, AfA 3,33 % p\. a\./);
    expect(h.stand).toBe("fertig");
  });

  it("nimmt den Anteil der Einheit und ihre Punkte, Einheit vorne", () => {
    const o = objekt({ sanierungskosten: 100000, meta: { objekttexteKi: stand([{ punkt: "Denkmalschutz, Sonder-AfA nach § 7i", beleg: "Exposé.pdf: Denkmal", art: "sonstiges" }]) } });
    const h = interneHighlights(o, einheit({ sanierungAnteilProzent: 10, neueMiete: 700, mieterhoehungAb: "2099-01-01" }));
    expect(h.erhaltungsaufwand?.text).toContain("Anteil dieser Einheit 10.000");
    const texte = h.punkte.map((p) => p.text);
    expect(texte[0]).toBe("Lage im Haus: Etage 2. OG, links, 50,0 m², 2 Zimmer");
    expect(texte.some((t) => t.startsWith("Mieterhöhung vereinbart: 700"))).toBe(true);
    expect(texte.some((t) => t.includes("4.000 € je m²"))).toBe(true);
    expect(texte[texte.length - 1]).toBe("Denkmalschutz, Sonder-AfA nach § 7i");
  });

  it("nimmt einen KI-Punkt zur RND nur, wenn kein fester Wert da ist", () => {
    const h = interneHighlights(objekt({ meta: { objekttexteKi: stand([{ punkt: "RND-Gutachten: 25 Jahre", beleg: "Gutachten.pdf", art: "restnutzungsdauer" }]) } }));
    expect(h.restnutzungsdauer).toEqual({ text: "RND-Gutachten: 25 Jahre", beleg: "Gutachten.pdf", herkunft: "ki" });
    expect(h.erhaltungsaufwand).toBeUndefined();
  });

  it("erfindet ohne Daten nichts, auch keine Zeile „nicht vorhanden“", () => {
    const h = interneHighlights(objekt({ meta: { objekttexteKi: stand() } }));
    expect(h.erhaltungsaufwand).toBeUndefined();
    expect(h.restnutzungsdauer).toBeUndefined();
    expect(h.punkte).toEqual([]);
  });

  it("meldet „wird erstellt“, solange der Lauf aussteht", () => {
    expect(interneHighlights(objekt()).stand).toBe("wird-erstellt");
    expect(interneHighlights(objekt({ titel: "", adresse: "", ort: "" })).stand).toBe("ohne-grundlage");
  });

  it("zeigt höchstens zehn Punkte", () => {
    const viele = Array.from({ length: 8 }, (_, i) => ({ punkt: `Punkt ${i}`, beleg: "b", art: "sonstiges" }));
    const h = interneHighlights(objekt({ sanierungskosten: 1, meta: { objekttexteKi: stand(viele) } }), einheit({ mietgarantieMonate: 12 }));
    expect(h.punkte.length + 1).toBeLessThanOrEqual(10);
  });
});

describe("pruefeInterneHighlights", () => {
  it("lässt Punkte ohne Beleg und mit Zusage weg und entfernt Gedankenstriche", () => {
    const vermerke: string[] = [];
    const geprueft = pruefeInterneHighlights([
      { punkt: "Erhaltungsaufwand 80.000 € – verteilt auf 3 Jahre", beleg: "Kaufvertrag.pdf", art: "erhaltungsaufwand" },
      { punkt: "Ohne Beleg", beleg: "", art: "sonstiges" },
      { punkt: "Rendite von 5 % sicher", beleg: "x", art: "sonstiges" },
      { punkt: "Die Mieten werden stark steigen", beleg: "x", art: "sonstiges" },
      { punkt: "KfW 55 Förderung", beleg: "x", art: "quatsch" },
    ], vermerke);
    expect(geprueft).toEqual([
      { punkt: "Erhaltungsaufwand 80.000 €, verteilt auf 3 Jahre", beleg: "Kaufvertrag.pdf", art: "erhaltungsaufwand" },
      { punkt: "KfW 55 Förderung", beleg: "x", art: "sonstiges" },
    ]);
    expect(vermerke).toHaveLength(3);
  });
});

describe("nie beim Kunden", () => {
  const meta = { objekttexteKi: stand([{ punkt: GEHEIM, beleg: "Kaufvertrag.pdf", art: "sonstiges" }]) };

  it("das öffentliche Exposé lässt die Highlights nicht durch", () => {
    expect(JSON.stringify(oeffentlichesMeta(meta))).not.toContain(GEHEIM);
    expect(JSON.stringify(oeffentlichesObjekt({ id: "o1", meta }))).not.toContain(GEHEIM);
    // Die Sanierungen dürfen weiter hinaus, das ist die Gegenprobe.
    expect(JSON.stringify(oeffentlichesMeta(meta))).toContain("Dach erneuert");
  });

  it("die Kundenansicht lässt die Highlights nicht durch", () => {
    for (const art of ["objekt", "wohnung", "wohnung_global"] as const) {
      expect(JSON.stringify(kundenMeta(meta, art))).not.toContain(GEHEIM);
    }
  });

  it("keine Kundenseite hängt die Karte oder die Highlights ein", () => {
    const wurzel = join(__dirname, "..");
    // Exposé, Kundenansicht samt Vorschau und das Kundenportal (Seiten „Kunde…“, Bausteine unter components/kunde).
    const kundenSeiten = readdirSync(join(wurzel, "pages"))
      .filter((n) => /^(Kunde[A-Z]|Kundenansicht|ExposePublic|PortalAktivieren)/.test(n))
      .map((n) => `pages/${n}`);
    const kundenOrte = ["components/expose", "components/kundenansicht", "components/kunde", ...kundenSeiten];
    const dateien: string[] = [];
    const sammle = (pfad: string) => {
      let info;
      try { info = statSync(pfad); } catch { return; }
      if (info.isDirectory()) readdirSync(pfad).forEach((n) => sammle(join(pfad, n)));
      else if (/\.tsx?$/.test(pfad) && !/\.test\.tsx?$/.test(pfad)) dateien.push(pfad);
    };
    kundenOrte.forEach((o) => sammle(join(wurzel, o)));
    expect(dateien.length).toBeGreaterThan(5);
    for (const datei of dateien) {
      const inhalt = readFileSync(datei, "utf-8");
      expect(inhalt, datei).not.toMatch(/InterneHighlights|interneHighlights/);
    }
  });
});
