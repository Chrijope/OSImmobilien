import { describe, it, expect } from "vitest";
import { KATEGORIEN, entfernungMeter, entfernungText, nachEbene } from "@/lib/umgebung";

describe("Kategorien der Umgebungsanalyse", () => {
  it("enthaelt die Bank, die vorher fehlte", () => {
    expect(KATEGORIEN.some((k) => k.key === "bank")).toBe(true);
  });

  it("teilt in Mikro- und Makrolage", () => {
    expect(KATEGORIEN.some((k) => k.ebene === "mikro")).toBe(true);
    expect(KATEGORIEN.some((k) => k.ebene === "makro")).toBe(true);
  });

  it("sucht Fusslaeufiges enger als Regionales", () => {
    // Eine Autobahnauffahrt in 1.000 m zu suchen findet meist nichts, eine
    // Schule in 8.000 m sagt nichts ueber den Alltag aus.
    const groessterMikro = Math.max(...KATEGORIEN.filter((k) => k.ebene === "mikro").map((k) => k.radius));
    const kleinsterMakro = Math.min(...KATEGORIEN.filter((k) => k.ebene === "makro").map((k) => k.radius));
    expect(groessterMikro).toBeLessThanOrEqual(kleinsterMakro);
  });

  it("hat keine doppelten Schluessel", () => {
    const keys = KATEGORIEN.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("jeder Overpass-Filter laesst sich wieder zerlegen", () => {
    // Die Antwort kommt als ein Topf zurueck und wird ueber genau dieses
    // Muster den Kategorien zugeordnet. Passt es nicht, bleibt die Kategorie leer.
    for (const k of KATEGORIEN) {
      expect(k.overpass, `${k.key}: ${k.overpass}`).toMatch(/\["[\w:]+"="[\w:]+"\]/);
    }
  });
});

describe("Entfernungen", () => {
  it("rechnet die Luftlinie", () => {
    // Brandenburger Tor zu Reichstag, rund 700 m
    const d = entfernungMeter({ lat: 52.5163, lng: 13.3777 }, { lat: 52.5186, lng: 13.3762 });
    expect(d).toBeGreaterThan(200);
    expect(d).toBeLessThan(400);
  });

  it("liefert 0 fuer denselben Punkt", () => {
    expect(entfernungMeter({ lat: 48.1, lng: 11.5 }, { lat: 48.1, lng: 11.5 })).toBe(0);
  });

  it("rundet unter einem Kilometer auf 50 Meter", () => {
    expect(entfernungText(437)).toBe("450 m");
    expect(entfernungText(20)).toBe("0 m");
  });

  it("wechselt ab einem Kilometer auf Kilometer", () => {
    expect(entfernungText(1000)).toBe("1 km");
    expect(entfernungText(2340)).toBe("2,3 km");
  });
});

describe("nachEbene", () => {
  const mach = (key: string, ebene: "mikro" | "makro", anzahl: number) => ({
    kategorie: KATEGORIEN.find((k) => k.ebene === ebene)! ,
    orte: Array.from({ length: anzahl }, (_, i) => ({
      id: `${key}${i}`, name: key, address: "", lat: 0, lng: 0, entfernung: i * 100,
    })),
  });

  it("laesst leere Kategorien weg, damit keine toten Chips stehen", () => {
    const ergebnis = nachEbene([mach("a", "mikro", 0), mach("b", "mikro", 3)], "mikro");
    expect(ergebnis).toHaveLength(1);
  });

  it("trennt die Ebenen sauber", () => {
    const alle = [mach("a", "mikro", 1), mach("b", "makro", 1)];
    expect(nachEbene(alle, "mikro")).toHaveLength(1);
    expect(nachEbene(alle, "makro")).toHaveLength(1);
  });
});

describe("Tags, die in Deutschland tatsaechlich gepflegt sind", () => {
  it("sucht Haltestellen als bus_stop", () => {
    // `public_transport=station` stand vorher hier und liefert fast nie etwas:
    // in Muenchen null Treffer gegen 33 Bushaltestellen im selben Umkreis.
    const t = KATEGORIEN.find((k) => k.key === "transit");
    expect(t?.overpass).toBe('["highway"="bus_stop"]');
  });
});
