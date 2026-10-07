import { describe, it, expect } from "vitest";
import { erzeugeBeschreibung, REGIONEN } from "@/lib/lagetext";
import { KATEGORIEN, type KategorieErgebnis } from "@/lib/umgebung";

const treffer = (key: string, meter: number): KategorieErgebnis => ({
  kategorie: KATEGORIEN.find((k) => k.key === key)!,
  orte: [{ id: key, name: key, address: "", lat: 0, lng: 0, entfernung: meter }],
});

describe("Beschreibung aus Daten statt aus Behauptungen", () => {
  const basis = {
    plz: "91722", ort: "Arberg", baujahr: 2026, bauzustand: "Neubau",
    anlageklasse: "Eigentumswohnung", kaufpreis: 539000, kaltmiete: 1507, flaeche: 131,
  };

  it("nennt Einrichtungen mit Entfernung, nicht mit Adjektiven", () => {
    const t = erzeugeBeschreibung({ ...basis, umgebung: [treffer("supermarket", 300), treffer("bakery", 450)] });
    expect(t).toContain("Supermarkt in 300 m");
    expect(t).toContain("Bäcker in 450 m");
    expect(t).not.toMatch(/hervorragend|traumhaft|einmalig/i);
  });

  it("sortiert die naechstgelegene Einrichtung zuerst", () => {
    const t = erzeugeBeschreibung({ ...basis, umgebung: [treffer("bakery", 800), treffer("supermarket", 200)] });
    expect(t.indexOf("Supermarkt")).toBeLessThan(t.indexOf("Bäcker"));
  });

  it("rechnet die Bruttorendite statt sie zu behaupten", () => {
    const t = erzeugeBeschreibung(basis);
    // 1507 * 12 / 539000 = 3,3551 %, kaufmaennisch gerundet 3,36.
    // Investagon zeigt 3,35, rechnet dort aber nach KfW-Tilgungszuschuss.
    expect(t).toContain("3,36 %");
    expect(t).toContain("4.115 € je m²");
  });

  it("laesst die Mikrolage weg, wenn keine Umgebungsdaten vorliegen", () => {
    const t = erzeugeBeschreibung(basis);
    expect(t).not.toContain("## Mikrolage");
  });

  it("nennt Arbeitgeber nur, wo sie recherchiert sind", () => {
    expect(erzeugeBeschreibung(basis)).toContain("## Wirtschaft und Arbeitgeber");
    // Crailsheim hat keine Arbeitgeber gepflegt, also steht dort auch nichts.
    expect(erzeugeBeschreibung({ ...basis, plz: "74564", ort: "Crailsheim" }))
      .not.toContain("## Wirtschaft und Arbeitgeber");
  });

  it("erfindet nichts fuer eine unbekannte Postleitzahl", () => {
    const t = erzeugeBeschreibung({ plz: "99999", ort: "Nirgendwo" });
    expect(t).not.toContain("## Makrolage");
    expect(t).not.toContain("## Wirtschaft");
  });

  it("nutzt Ueberschriften, die die Darstellung erkennt", () => {
    const t = erzeugeBeschreibung({ ...basis, umgebung: [treffer("supermarket", 300)] });
    for (const u of ["## Das Objekt", "## Mikrolage", "## Makrolage", "## Investment auf einen Blick"]) {
      expect(t).toContain(u);
    }
  });

  it("weist den Stand der Rechercheangaben aus", () => {
    expect(erzeugeBeschreibung(basis)).toMatch(/Stand 20\d\d/);
  });

  it("jede gepflegte Region hat eine Jahreszahl", () => {
    for (const [plz, r] of Object.entries(REGIONEN)) {
      expect(r.stand, plz).toBeGreaterThan(2020);
      expect(r.region, plz).toBeTruthy();
    }
  });
});
