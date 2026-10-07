import { describe, it, expect } from "vitest";
import {
  AUSSCHNITT_BIS_M,
  ausschnittPunkte,
  kartenPunkte,
  legende,
  nadelBeschriftung,
  PUNKTE_JE_KATEGORIE,
  PUNKTE_JE_TEILLISTE,
  UMGEBUNG_KATEGORIEN,
  umgebungAusAnalyse,
  umgebungFuerKunden,
} from "./umgebungspunkte";

/**
 * Die Punkte der Umgebung für Karte und Lagekasten (Christian, 24.09.2026).
 * Alle Orte hier sind erfunden.
 */

const ort = (name: string, meter: number, typ?: string, mitLage = true) => ({
  name, entfernung_m: meter, ...(typ ? { typ } : {}), ...(mitLage ? { lat: 48.33 + meter / 1e6, lng: 10.87 } : {}),
});

const reihe = (praefix: string, anzahl: number, typ?: string) =>
  Array.from({ length: anzahl }, (_, i) => ort(`${praefix} ${i + 1}`, 100 * (anzahl - i), typ));

const GEMESSEN = {
  schema: 2,
  messfassung: 3,
  gemessen_am: "2026-09-24T20:00:00Z",
  objekt_koordinaten: { lat: 48.33, lng: 10.87 },
  genauigkeit: "adresse",
  mikrolage: {
    einkaufen: reihe("Markt", 14, "Supermarkt"),
    freizeit: [ort("Kino Nord", 900, "Kino")],
    parks: reihe("Park", 3, "Park"),
    oepnv: reihe("Halt", 12, "Bus"),
    kindergaerten: reihe("Kita", 8),
    schulen: [ort("Grundschule Süd", 700, "Grundschule")],
    aerzte: [ort("Praxis am Markt", 300, "Arztpraxis")],
    apotheken: [ort("Stern-Apotheke", 250)],
    behoerden: [ort("Rathaus", 1200, "Rathaus")],
    hochschulen: reihe("Hochschule", 7, "Hochschule"),
    kliniken: [ort("Klinikum", 4100, "Krankenhaus", false)],
    gewerbe: [ort("Werk Muster", 1500, "Industrie- oder Gewerbefläche")],
  },
  mikrolage_hinweis: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
};

describe("umgebungAusAnalyse", () => {
  it("ordnet in die Kategorien der Anzeige, Mikrolage zuerst, Makrolage zuletzt", () => {
    const u = umgebungAusAnalyse(GEMESSEN)!;
    expect(u.kategorien.map((k) => k.id)).toEqual(["einkaufen", "freizeit", "gruen", "verkehr", "einrichtungen", "hochschulen", "kliniken"]);
    expect(u.kategorien.filter((k) => k.ebene === "makro").map((k) => k.id)).toEqual(["hochschulen", "kliniken"]);
    const einrichtungen = u.kategorien.find((k) => k.id === "einrichtungen")!;
    expect(einrichtungen.listen.map((l) => l.titel)).toEqual(["Kitas", "Schulen", "Ärzte", "Apotheken", "Behörden und Ämter"]);
  });

  it("begrenzt je Kategorie auf zehn, in den Teillisten und der Makrolage auf fünf, die nächsten zuerst", () => {
    const u = umgebungAusAnalyse(GEMESSEN)!;
    const liste = (id: string, teil = 0) => u.kategorien.find((k) => k.id === id)!.listen[teil].punkte;
    expect(PUNKTE_JE_KATEGORIE).toBe(10);
    expect(PUNKTE_JE_TEILLISTE).toBe(5);
    expect(liste("einkaufen")).toHaveLength(10);
    expect(liste("verkehr")).toHaveLength(10);
    expect(liste("einrichtungen", 0)).toHaveLength(5);
    expect(liste("hochschulen")).toHaveLength(5);
    const meter = liste("einkaufen").map((p) => p.entfernungMeter);
    expect(meter).toEqual([...meter].sort((a, b) => a - b));
    expect(liste("einkaufen")[0]).toMatchObject({ name: "Markt 14", art: "Supermarkt", entfernungMeter: 100, gehminuten: 2 });
  });

  it("zeigt nie Gewerbeflächen und erfindet für fehlende Listen keine Kategorie", () => {
    const u = umgebungAusAnalyse({ ...GEMESSEN, mikrolage: { einkaufen: [ort("Markt", 200)], gewerbe: GEMESSEN.mikrolage.gewerbe } })!;
    expect(u.kategorien.map((k) => k.id)).toEqual(["einkaufen"]);
    expect(JSON.stringify(u)).not.toContain("Werk Muster");
  });

  it("liest Parks einer älteren Messung aus Freizeit unter Parks und Grün", () => {
    const alt = {
      ...GEMESSEN, messfassung: 2,
      mikrolage: { freizeit: [ort("Stadtpark", 300, "Park"), ort("Fitness Mitte", 500, "Fitnessstudio")] },
    };
    const u = umgebungAusAnalyse(alt)!;
    expect(u.kategorien.find((k) => k.id === "gruen")!.listen[0].punkte.map((p) => p.name)).toEqual(["Stadtpark"]);
    expect(u.kategorien.find((k) => k.id === "freizeit")!.listen[0].punkte.map((p) => p.name)).toEqual(["Fitness Mitte"]);
  });

  it("gibt ohne gemessene Analyse nichts zurück, statt etwas zu erfinden", () => {
    expect(umgebungAusAnalyse(undefined)).toBeUndefined();
    // Die alte, von einem Sprachmodell geschriebene Fassung ohne schema 2.
    expect(umgebungAusAnalyse({ ...GEMESSEN, schema: undefined })).toBeUndefined();
    expect(umgebungAusAnalyse({ ...GEMESSEN, objekt_koordinaten: { lat: "x", lng: 1 } })).toBeUndefined();
  });

  it("wirft Orte ohne Namen oder Entfernung heraus und kennt eine leere Messung", () => {
    const u = umgebungAusAnalyse({ ...GEMESSEN, mikrolage: { einkaufen: [{ name: "", entfernung_m: 10 }, { name: "Ohne Weg" }] } })!;
    expect(u.leer).toBe(true);
    expect(u.kategorien).toEqual([]);
    expect(u.hinweis).toContain("keine Einrichtungen erfasst");
  });

  it("sagt, ob die Makrolage überhaupt gemessen wurde", () => {
    expect(umgebungAusAnalyse({ ...GEMESSEN, messfassung: undefined, mikrolage: { einkaufen: [ort("Markt", 200)] } })!.makroGemessen).toBe(false);
    expect(umgebungAusAnalyse({ ...GEMESSEN, mikrolage: { einkaufen: [ort("Markt", 200)] } })!.makroGemessen).toBe(true);
  });

  it("behält den Hinweis, ab wo gemessen wurde, und beschriftet die Nadel bei Ortsmitte ehrlich", () => {
    const u = umgebungAusAnalyse({ ...GEMESSEN, genauigkeit: "ort", mikrolage_hinweis: "Gemessen ab der Ortsmitte von Hof, nicht ab der Hausadresse." })!;
    expect(u.genauigkeit).toBe("ort");
    expect(u.hinweis).toContain("Ortsmitte");
    expect(nadelBeschriftung(u, "Musterstraße 1")).toBe("Ortsmitte, ab hier gemessen");
    expect(nadelBeschriftung(umgebungAusAnalyse(GEMESSEN), "Musterstraße 1")).toBe("Musterstraße 1");
    // Ein unbekannter Wert gilt als hausgenau, nie als etwas Erfundenes.
    expect(umgebungAusAnalyse({ ...GEMESSEN, genauigkeit: "irgendwo" })!.genauigkeit).toBe("adresse");
  });
});

describe("Karte und Legende", () => {
  it("setzt nur Orte der Mikrolage mit Lage auf die Karte, in der Farbe ihrer Kategorie", () => {
    const punkte = kartenPunkte(umgebungAusAnalyse(GEMESSEN));
    expect(punkte.some((p) => p.name.startsWith("Hochschule"))).toBe(false);
    expect(punkte.some((p) => p.name === "Klinikum")).toBe(false);
    const farbe = UMGEBUNG_KATEGORIEN.find((k) => k.id === "gruen")!.farbe;
    expect(punkte.filter((p) => p.kategorie === "gruen").every((p) => p.farbe === farbe)).toBe(true);
    expect(legende(punkte).map((l) => l.titel)).toEqual(["Einkaufen", "Freizeit", "Parks und Grün", "Bus und Bahn", "Öffentliche Einrichtungen"]);
    expect(kartenPunkte(undefined)).toEqual([]);
  });

  it("zielt mit dem ersten Ausschnitt auf die Nähe, nicht auf den Bahnhof in fünf Kilometern", () => {
    const punkte = kartenPunkte(umgebungAusAnalyse({
      ...GEMESSEN,
      mikrolage: { einkaufen: [ort("A", 200), ort("B", 400), ort("C", 600), ort("D", 800)], oepnv: [ort("Bahnhof", 5000, "Bahnhof")] },
    }));
    const ausschnitt = ausschnittPunkte(punkte);
    expect(ausschnitt.map((p) => p.name)).toEqual(["A", "B", "C", "D"]);
    expect(ausschnitt.every((p) => p.meter <= AUSSCHNITT_BIS_M)).toBe(true);
    // Auf dem Land mit wenig in der Nähe: die sechs nächsten, auch wenn sie weiter weg liegen.
    const land = kartenPunkte(umgebungAusAnalyse({ ...GEMESSEN, mikrolage: { oepnv: [ort("Halt", 1500), ort("Bahnhof", 5000)] } }));
    expect(ausschnittPunkte(land).map((p) => p.name)).toEqual(["Halt", "Bahnhof"]);
  });
});

describe("umgebungFuerKunden", () => {
  it("gibt seit dem 24.09.2026 abends auch die Arztpraxen an Kunden (Christian)", () => {
    const intern = umgebungAusAnalyse(GEMESSEN)!;
    const kunden = umgebungFuerKunden(intern)!;
    const einrichtungen = kunden.kategorien.find((k) => k.id === "einrichtungen")!;
    expect(einrichtungen.listen.map((l) => l.id)).toContain("aerzte");
    expect(JSON.stringify(kunden)).toContain("Praxis am Markt");
    expect(kartenPunkte(kunden).some((p) => p.name === "Praxis am Markt")).toBe(true);
    expect(umgebungFuerKunden(undefined)).toBeUndefined();
  });

  it("laesst eine Kategorie nur mit Arztpraxen stehen, sie ist nicht leer", () => {
    const nurAerzte = umgebungFuerKunden(umgebungAusAnalyse({ ...GEMESSEN, mikrolage: { aerzte: [ort("Praxis am Markt", 300)] } }))!;
    expect(nurAerzte.leer).toBe(false);
    expect(nurAerzte.kategorien.map((k) => k.id)).toEqual(["einrichtungen"]);
  });
});
