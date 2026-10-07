import { describe, expect, it } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { Koordinate } from "@/lib/umgebung";
import {
  ANZAHL_EMPFEHLUNGEN, EMPFEHLUNG_ROLLEN, NEBENKOSTEN_IM_RAHMEN,
  empfehlungenAuswaehlen, empfehlungsGrund, empfehlungsKandidaten, entfernungKmText, finanzierungsrahmen,
  fremdVorgemerkt, fuerKundeVorgemerkt, gesamtkosten, gespeicherteObjektKoordinate, kaufpreisRahmen,
  kaufpreisRahmenUeberSaetze, keinRahmenHinweis, objektAdressAnfrage, objektListe, passtInRahmen,
  siehtEmpfehlungen, sortiereObjektListe, spanneText,
  type EmpfehlungsKandidat, type KandidatenOptionen, type Rahmen,
} from "@/lib/einheitEmpfehlung";

/*
 * Das Rechenbeispiel für den Bericht, einmal durchgerechnet:
 *
 *   Rahmen aus der Selbstauskunft 250.000 bis 300.000 Euro.
 *   Objekt in München (Bayern): Grunderwerbsteuer 3,5 + Notar 1,0 +
 *   Grundbuch 0,5 = 5,0 Prozent Kaufnebenkosten.
 *   Einheit 260.000 plus Stellplatz 15.000 = 275.000, mal 1,05 = 288.750.
 *   Das liegt im Rahmen. Der Kaufpreisrahmen dort: 250.000 / 1,05 = 238.095
 *   bis 300.000 / 1,05 = 285.714.
 */

const ROSENHEIM: Koordinate = { lat: 47.86, lng: 12.12 };
const MUENCHEN: Koordinate = { lat: 48.14, lng: 11.58 };
const AUGSBURG: Koordinate = { lat: 48.37, lng: 10.9 };
const LEIPZIG: Koordinate = { lat: 51.34, lng: 12.37 };

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return {
    id, weNr: id.replace(/\D/g, "") || "1", etage: "EG", lage: "", groesse: 50, zimmer: 2, mieteGesamt: 800,
    vkGesamt: 260000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile,
  };
}

function objekt(id: string, wohnungen: ObjektWohnung[], teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id, titel: `Haus ${id}`, adresse: "Teststraße 1", plz: "80331", ort: "München", beschreibung: "", highlights: [],
    bildUrl: "", bilder: [], dokumente: [], wohnungen, videoUrl: "", videoSichtbar: false, badge: "",
    groesseVon: 0, groesseBis: 0, preisVon: 0, preisBis: 0, renditeVon: 0, renditeBis: 0, sichtbar: true,
    erstellt_am: "2026-01-01", meta: {}, ...teile,
  } as ObjektData;
}

const RAHMEN: Rahmen = { von: 250000, bis: 300000 };
const VP = { rolle: "vertriebspartner", benutzerId: "vp-1", name: "Vera Partner" };

function optionen(teile: Partial<KandidatenOptionen> = {}): KandidatenOptionen {
  return {
    nutzer: VP, kundeId: "k-1", rahmen: RAHMEN, wohnort: ROSENHEIM,
    objektKoordinate: () => MUENCHEN, jetzt: new Date("2026-09-23T12:00:00Z"), ...teile,
  };
}

function kandidat(teile: Partial<EmpfehlungsKandidat> & { schluessel: string; objektId: string }): EmpfehlungsKandidat {
  return {
    wohnungId: teile.schluessel, global: false, objektTitel: `Haus ${teile.objektId}`, weNr: "1", etage: "", adresse: "",
    plz: "80331", ort: "München", bildUrl: "", kaufpreis: 260000, stellplatz: 0, nebenkostenProzent: 5,
    gesamtkosten: 273000, zimmer: 2, groesse: 50, kaltmiete: 800, rendite: 3.7, entfernungKm: 50, passt: true,
    vorgemerktFuerKunde: false, ...teile,
  };
}

describe("Wer die Empfehlungen sieht", () => {
  it("die sechs Rollen aus dem Auftrag", () => {
    expect([...EMPFEHLUNG_ROLLEN].sort()).toEqual(
      ["admin", "backoffice", "finanzierungspartner", "inhaber", "vertriebsleiter", "vertriebspartner"],
    );
    for (const rolle of EMPFEHLUNG_ROLLEN) expect(siehtEmpfehlungen(rolle)).toBe(true);
  });

  it("alle anderen nicht", () => {
    for (const rolle of ["setterin", "objektpartner", "hr", "marketing", "kunde", "tippgeber", "buchhaltung", "", undefined]) {
      expect(siehtEmpfehlungen(rolle)).toBe(false);
    }
  });
});

describe("Finanzierungsrahmen", () => {
  it("übernimmt von und bis", () => {
    expect(finanzierungsrahmen(250000, 300000)).toEqual({ von: 250000, bis: 300000 });
  });

  it("gibt keinen Rahmen ohne positive Obergrenze", () => {
    expect(finanzierungsrahmen(0, 0)).toBeNull();
    expect(finanzierungsrahmen(-10000, -5000)).toBeNull();
    expect(finanzierungsrahmen(NaN, NaN)).toBeNull();
  });

  it("wertet einen negativen Überschuss mit Eigenkapital als negativen Rahmen", () => {
    // maxDarlehen -50.000, Eigenkapital 100.000: min 60.000, max 40.000.
    expect(finanzierungsrahmen(60000, 40000)).toBeNull();
  });

  it("setzt eine negative Untergrenze auf null", () => {
    expect(finanzierungsrahmen(-20000, 90000)).toEqual({ von: 0, bis: 90000 });
  });
});

describe("Gesamtkosten und Kaufpreisrahmen", () => {
  it("vergleicht standardmäßig nur den Kaufpreis mit dem Rahmen (Christian, 23.09.2026)", () => {
    expect(NEBENKOSTEN_IM_RAHMEN).toBe(false);
  });

  it("Kaufpreis plus Stellplatz plus Nebenkosten nach Bundesland (Rechenbeispiel)", () => {
    // Die Rechnung mit Nebenkosten bleibt als Möglichkeit, deshalb ausdrücklich.
    expect(gesamtkosten(260000, 15000, 5, true)).toBeCloseTo(288750, 2);
    expect(passtInRahmen(gesamtkosten(260000, 15000, 5, true), RAHMEN)).toBe(true);
  });

  it("ohne Nebenkosten zählt nur der Kaufpreis samt Stellplatz", () => {
    expect(gesamtkosten(260000, 15000, 5, false)).toBe(275000);
    // Standard seit dem 23.09.2026: der reine Kaufpreis.
    expect(gesamtkosten(260000, 15000, 5)).toBe(275000);
    expect(kaufpreisRahmen(RAHMEN, 5)).toEqual(RAHMEN);
  });

  it("empfiehlt standardmäßig nach dem Kaufpreis: 290.000 € liegen im Rahmen bis 300.000 €", () => {
    const o = objekt("by", [we("w1", { vkGesamt: 290000 })]);
    const [k] = empfehlungsKandidaten([o], optionen());
    expect(k.gesamtkosten).toBe(290000);
    expect(k.passt).toBe(true);
  });

  it("der Kaufpreisrahmen teilt den Rahmen durch den Nebenkostenfaktor", () => {
    const kp = kaufpreisRahmen(RAHMEN, 5, true);
    expect(kp.von).toBeCloseTo(238095.24, 1);
    expect(kp.bis).toBeCloseTo(285714.29, 1);
    expect(kaufpreisRahmen(RAHMEN, 5, false)).toEqual(RAHMEN);
  });

  it("über mehrere Bundesländer: die Spanne über alle Sätze", () => {
    const einheitlich = kaufpreisRahmenUeberSaetze(RAHMEN, [5, 5], true);
    expect(einheitlich?.einheitlich).toBe(true);
    expect(einheitlich?.von).toBeCloseTo(238095.24, 1);

    const gemischt = kaufpreisRahmenUeberSaetze(RAHMEN, [5, 7, 5], true);
    expect(gemischt?.einheitlich).toBe(false);
    expect(gemischt?.von).toBeCloseTo(250000 / 1.07, 1);
    expect(gemischt?.bis).toBeCloseTo(300000 / 1.05, 1);
    expect(kaufpreisRahmenUeberSaetze(RAHMEN, [])).toBeNull();
  });

  it("an den Grenzen passt es genau noch, ohne Preis nie", () => {
    expect(passtInRahmen(250000, RAHMEN)).toBe(true);
    expect(passtInRahmen(300000, RAHMEN)).toBe(true);
    expect(passtInRahmen(300001, RAHMEN)).toBe(false);
    expect(passtInRahmen(0, { von: 0, bis: 100 })).toBe(false);
  });

  it("spanneText ohne Gedankenstrich", () => {
    expect(spanneText(250000, 300000)).toMatch(/250\.000\s€ bis 300\.000\s€/);
    expect(spanneText(250000, 300000)).not.toMatch(/[–—]/);
  });
});

describe("Kandidaten", () => {
  it("nur freie Einheiten im Angebot aus sichtbaren Objekten", () => {
    const o = objekt("a", [
      we("w1"),
      we("w2", { status: "reserviert" }),
      we("w3", { status: "verkauft" }),
      // In Investagon offline: nicht im Angebot.
      we("w4", { investagonRaw: { active: 1, visibility: -1 } }),
      we("w5", { investagonRaw: { active: 1, visibility: 1 } }),
    ]);
    const unsichtbar = objekt("b", [we("w6")], { sichtbar: false });
    const k = empfehlungsKandidaten([o, unsichtbar], optionen());
    expect(k.map((x) => x.schluessel).sort()).toEqual(["w1", "w5"]);
  });

  it("beachtet die Exklusivpartner am Objekt, die Leitung sieht alles", () => {
    const o = objekt("a", [we("w1")], { exklusivPartner: ["Otto Anders"] });
    expect(empfehlungsKandidaten([o], optionen())).toHaveLength(0);
    expect(empfehlungsKandidaten([o], optionen({ nutzer: { ...VP, name: "Otto Anders" } }))).toHaveLength(1);
    expect(empfehlungsKandidaten([o], optionen({ nutzer: { rolle: "admin" } }))).toHaveLength(1);
  });

  it("beachtet die Exklusivnutzer an der Einheit", () => {
    const o = objekt("a", [we("w1", { exklusivNutzer: ["anderer"] }), we("w2", { exklusivNutzer: ["vp-1"] })]);
    expect(empfehlungsKandidaten([o], optionen()).map((x) => x.schluessel)).toEqual(["w2"]);
    expect(empfehlungsKandidaten([o], optionen({ nutzer: { rolle: "inhaber" } }))).toHaveLength(2);
    // Vertriebsleitung zählt hier NICHT zur Pflege, wie in der Objektübersicht.
    expect(empfehlungsKandidaten([o], optionen({ nutzer: { rolle: "vertriebsleiter", benutzerId: "x" } }))).toHaveLength(0);
  });

  it("lässt fremd vorgemerkte Einheiten weg, die eigene und abgelaufene nicht", () => {
    const jetzt = new Date("2026-09-23T12:00:00Z");
    const o = objekt("a", [
      we("fremd", { vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-2" } as Partial<ObjektWohnung>),
      we("eigen", { vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-1" } as Partial<ObjektWohnung>),
      we("abgelaufen", { vorgemerktBis: "2026-09-23T11:00:00Z", vorgemerktKundeId: "k-2" } as Partial<ObjektWohnung>),
      we("kaputt", { vorgemerktBis: "gestern", vorgemerktKundeId: "k-2" } as Partial<ObjektWohnung>),
    ]);
    const k = empfehlungsKandidaten([o], optionen({ jetzt }));
    expect(k.map((x) => x.schluessel).sort()).toEqual(["abgelaufen", "eigen", "kaputt"]);
    expect(k.find((x) => x.schluessel === "eigen")?.vorgemerktFuerKunde).toBe(true);
    expect(fremdVorgemerkt({ vorgemerktBis: "2026-09-23T12:30:00Z" }, "k-1", jetzt)).toBe(true);
    expect(fuerKundeVorgemerkt({ vorgemerktBis: "2026-09-23T12:30:00Z", vorgemerktKundeId: "k-1" }, "k-1", jetzt)).toBe(true);
  });

  it("rechnet die Nebenkosten nach dem Bundesland des Objekts", () => {
    const bayern = objekt("by", [we("w1", { vkGesamt: 280000 })]);
    const sachsen = objekt("sn", [we("w2", { vkGesamt: 280000 })], { plz: "04109", ort: "Leipzig" });
    const [a, b] = empfehlungsKandidaten([bayern, sachsen], optionen({ mitNebenkosten: true }));
    expect(a.nebenkostenProzent).toBe(5);
    expect(a.gesamtkosten).toBeCloseTo(294000, 2);
    expect(a.passt).toBe(true);
    // Dieselbe Wohnung in Sachsen: 7 Prozent, 299.600, passt gerade noch.
    expect(b.nebenkostenProzent).toBe(7);
    expect(b.gesamtkosten).toBeCloseTo(299600, 2);
    expect(b.passt).toBe(true);
  });

  it("ein Kaufpreis im Rahmen passt nicht, wenn die Nebenkosten ihn hinausschieben", () => {
    const o = objekt("a", [we("w1", { vkGesamt: 290000 })]);
    const [k] = empfehlungsKandidaten([o], optionen({ mitNebenkosten: true }));
    expect(k.gesamtkosten).toBeCloseTo(304500, 2);
    expect(k.passt).toBe(false);
  });

  it("der Stellplatz zählt mit", () => {
    const o = objekt("a", [we("w1", { vkGesamt: 275000, stellplatzPreis: 15000 })]);
    const [k] = empfehlungsKandidaten([o], optionen({ mitNebenkosten: true }));
    expect(k.gesamtkosten).toBeCloseTo(304500, 2);
    expect(k.passt).toBe(false);
  });

  it("ohne Rahmen passt nichts, die Kandidaten bleiben", () => {
    const k = empfehlungsKandidaten([objekt("a", [we("w1")])], optionen({ rahmen: null }));
    expect(k).toHaveLength(1);
    expect(k[0].passt).toBe(false);
  });

  it("ein Globalobjekt zählt als Ganzes mit seinem Verkaufspreis", () => {
    const g = objekt("g", [we("w1", { vkGesamt: 100000 }), we("w2", { vkGesamt: 100000 })], {
      globalObjekt: true,
      globalDaten: { verkaufspreis: 270000 } as ObjektData["globalDaten"],
    });
    const k = empfehlungsKandidaten([g], optionen({ mitNebenkosten: true }));
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ schluessel: "g", global: true, wohnungId: null, kaufpreis: 270000 });
    expect(k[0].gesamtkosten).toBeCloseTo(283500, 2);
    expect(k[0].passt).toBe(true);
  });

  it("ein Globalobjekt mit belegter Einheit oder ohne Preis fällt heraus", () => {
    const belegt = objekt("g1", [we("w1"), we("w2", { status: "reserviert" })], {
      globalObjekt: true, globalDaten: { verkaufspreis: 270000 } as ObjektData["globalDaten"],
    });
    const ohnePreis = objekt("g2", [we("w3")], { globalObjekt: true });
    expect(empfehlungsKandidaten([belegt, ohnePreis], optionen())).toHaveLength(0);
  });

  it("ein Globalobjekt mit verkaufter Einheit außerhalb des Angebots fällt heraus (Option A, 05.10.2026)", () => {
    // Eine verkaufte Einheit steht nie im Angebot, machte das Haus aber früher nicht unverfügbar.
    const g = objekt("g", [we("w1"), we("w2", { status: "verkauft" })], {
      globalObjekt: true, globalDaten: { verkaufspreis: 270000 } as ObjektData["globalDaten"],
    });
    expect(empfehlungsKandidaten([g], optionen())).toHaveLength(0);
  });

  it("misst die Entfernung als Luftlinie vom Wohnort", () => {
    const [k] = empfehlungsKandidaten([objekt("a", [we("w1")])], optionen());
    // Rosenheim bis München, gut 50 km Luftlinie.
    expect(k.entfernungKm).toBeGreaterThan(45);
    expect(k.entfernungKm).toBeLessThan(60);
    const [ohne] = empfehlungsKandidaten([objekt("a", [we("w1")])], optionen({ objektKoordinate: () => null }));
    expect(ohne.entfernungKm).toBeNull();
  });
});

describe("Objektlage", () => {
  it("nimmt die gemessene Standortanalyse ab Schema 2", () => {
    const o = objekt("a", [], { meta: { standortanalyse: { schema: 2, objekt_koordinaten: { lat: 48.3, lng: 10.9 } }, lat: 1, lng: 2 } });
    expect(gespeicherteObjektKoordinate(o)).toEqual({ lat: 48.3, lng: 10.9 });
  });

  it("traut einer alten Analyse ohne Schema nicht und nimmt meta.lat und meta.lng", () => {
    const o = objekt("a", [], { meta: { standortanalyse: { objekt_koordinaten: { lat: 48.3, lng: 10.9 } }, lat: 51.3, lng: 12.4 } });
    expect(gespeicherteObjektKoordinate(o)).toEqual({ lat: 51.3, lng: 12.4 });
  });

  it("ohne Angaben keine Lage", () => {
    expect(gespeicherteObjektKoordinate(objekt("a", []))).toBeNull();
    expect(gespeicherteObjektKoordinate(objekt("a", [], { meta: { lat: 0, lng: 0 } }))).toBeNull();
  });

  it("fragt den Speicher der Objektkarte unter derselben Adresse wie die Karte", () => {
    expect(objektAdressAnfrage({ adresse: "Teststraße 1", plz: "80331", ort: "München" })).toBe("Teststraße 1, 80331, München, Deutschland");
    expect(objektAdressAnfrage({ adresse: "", plz: "", ort: "" })).toBe("");
  });

  it("Entfernung als Text", () => {
    expect(entfernungKmText(42.4)).toBe("42 km");
    expect(entfernungKmText(0.4)).toBe("unter 1 km");
  });
});

describe("Die fünf Empfehlungen", () => {
  it("sortiert nach Entfernung und nimmt höchstens eine Einheit je Objekt", () => {
    const k = [
      kandidat({ schluessel: "a1", objektId: "A", entfernungKm: 30, gesamtkosten: 290000 }),
      kandidat({ schluessel: "a2", objektId: "A", entfernungKm: 30, gesamtkosten: 276000 }),
      kandidat({ schluessel: "a3", objektId: "A", entfernungKm: 30, gesamtkosten: 260000 }),
      kandidat({ schluessel: "b1", objektId: "B", entfernungKm: 10 }),
      kandidat({ schluessel: "c1", objektId: "C", entfernungKm: 80 }),
      kandidat({ schluessel: "n1", objektId: "N", entfernungKm: 5, passt: false }),
    ];
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "bekannt", wohnortName: "Rosenheim" });
    expect(e.empfehlungen.map((x) => x.kandidat.schluessel)).toEqual(["b1", "a2", "c1"]);
    // Im Haus A liegen alle gleich weit weg, oben steht die an der Rahmenmitte (275.000).
    expect(e.empfehlungen[1].weiterePassendeImHaus).toBe(2);
    expect(e.empfehlungen[0].weiterePassendeImHaus).toBe(0);
    expect(e.anzahlPassend).toBe(5);
  });

  it("nennt den Grund mit Entfernung und Wohnort", () => {
    const e = empfehlungenAuswaehlen([kandidat({ schluessel: "a", objektId: "A", entfernungKm: 42.2 })], {
      rahmen: RAHMEN, wohnort: "bekannt", wohnortName: "Rosenheim",
    });
    expect(e.empfehlungen[0].grund).toBe("passt in den Rahmen, 42 km von Rosenheim");
  });

  it("zeigt höchstens fünf", () => {
    const k = Array.from({ length: 8 }, (_, i) => kandidat({ schluessel: `w${i}`, objektId: `O${i}`, entfernungKm: 10 + i }));
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "bekannt" });
    expect(ANZAHL_EMPFEHLUNGEN).toBe(5);
    expect(e.empfehlungen.map((x) => x.kandidat.schluessel)).toEqual(["w0", "w1", "w2", "w3", "w4"]);
    expect(e.hinweise).toEqual([]);
  });

  it("füllt nicht auf, wenn weniger als fünf passen, und sagt es", () => {
    const k = [
      kandidat({ schluessel: "a", objektId: "A" }),
      kandidat({ schluessel: "b", objektId: "B" }),
      kandidat({ schluessel: "c", objektId: "C" }),
      kandidat({ schluessel: "d", objektId: "D", passt: false }),
    ];
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "bekannt" });
    expect(e.empfehlungen).toHaveLength(3);
    expect(e.hinweise).toContain("Nur 3 Einheiten passen in den Rahmen");
    const eine = empfehlungenAuswaehlen([kandidat({ schluessel: "a", objektId: "A" })], { rahmen: RAHMEN, wohnort: "bekannt" });
    expect(eine.hinweise).toContain("Nur 1 Einheit passt in den Rahmen");
  });

  it("sagt, wenn viele passende in wenigen Häusern liegen", () => {
    const k = [
      kandidat({ schluessel: "a1", objektId: "A" }), kandidat({ schluessel: "a2", objektId: "A" }),
      kandidat({ schluessel: "b1", objektId: "B" }),
    ];
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "bekannt" });
    expect(e.hinweise).toContain("3 Einheiten passen in den Rahmen, verteilt auf 2 Objekte");
  });

  it("ohne Wohnort nach Nähe zur Rahmenmitte, mit Hinweis und ohne Entfernung im Grund", () => {
    const k = [
      kandidat({ schluessel: "fern", objektId: "A", entfernungKm: null, gesamtkosten: 299500 }),
      kandidat({ schluessel: "mitte", objektId: "B", entfernungKm: null, gesamtkosten: 274000 }),
      kandidat({ schluessel: "unten", objektId: "C", entfernungKm: null, gesamtkosten: 251000 }),
    ];
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "fehlt" });
    expect(e.empfehlungen.map((x) => x.kandidat.schluessel)).toEqual(["mitte", "unten", "fern"]);
    expect(e.hinweise).toContain("Wohnort fehlt, nach Preis sortiert");
    expect(e.empfehlungen[0].grund).toBe("passt in den Rahmen");
    const nichtGefunden = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "nicht_gefunden" });
    expect(nichtGefunden.hinweise).toContain("Wohnort nicht gefunden, nach Preis sortiert");
  });

  it('ohne Objektlage nach hinten, mit „Entfernung unbekannt"', () => {
    const k = [
      kandidat({ schluessel: "ohne", objektId: "A", entfernungKm: null, gesamtkosten: 275000 }),
      kandidat({ schluessel: "weit", objektId: "B", entfernungKm: 300 }),
    ];
    const e = empfehlungenAuswaehlen(k, { rahmen: RAHMEN, wohnort: "bekannt", wohnortName: "Rosenheim" });
    expect(e.empfehlungen.map((x) => x.kandidat.schluessel)).toEqual(["weit", "ohne"]);
    expect(e.empfehlungen[1].grund).toBe("passt in den Rahmen, Entfernung unbekannt");
  });

  it("ohne Rahmen keine Empfehlungen", () => {
    const e = empfehlungenAuswaehlen([kandidat({ schluessel: "a", objektId: "A" })], { rahmen: null, wohnort: "bekannt" });
    expect(e).toEqual({ empfehlungen: [], anzahlPassend: 0, hinweise: [] });
  });

  it("passt keine, sagt es der Hinweis", () => {
    const e = empfehlungenAuswaehlen([kandidat({ schluessel: "a", objektId: "A", passt: false })], { rahmen: RAHMEN, wohnort: "bekannt" });
    expect(e.empfehlungen).toHaveLength(0);
    expect(e.hinweise[0]).toMatch(/Keine freie Einheit passt in den Rahmen/);
  });

  it("ein Grund für eine unpassende Einheit sagt das auch", () => {
    expect(empfehlungsGrund(kandidat({ schluessel: "a", objektId: "A", passt: false }), "fehlt")).toBe("passt nicht in den Rahmen");
  });
});

describe("Kein Rahmen", () => {
  it("nennt den Grund und die Sortierung", () => {
    expect(keinRahmenHinweis("keine_selbstauskunft", "bekannt")).toMatch(/^Noch keine Selbstauskunft.*nach Entfernung sortiert\.$/);
    expect(keinRahmenHinweis("finanziert_selbst", "bekannt")).toMatch(/^Der Kunde finanziert selbst/);
    expect(keinRahmenHinweis("rahmen_negativ", "fehlt")).toMatch(/keinen positiven Finanzierungsrahmen.*nach Preis sortiert, weil der Wohnort fehlt\.$/);
  });
});

describe("Die Gesamtliste", () => {
  const objekte = [
    objekt("A", [we("a1", { vkGesamt: 260000 }), we("a2", { vkGesamt: 400000 })]),
    objekt("B", [we("b1", { vkGesamt: 150000 })]),
    objekt("C", [we("c1", { vkGesamt: 280000 })]),
    objekt("D", [we("d1", { vkGesamt: 500000 })]),
  ];
  const lage: Record<string, Koordinate | null> = { A: MUENCHEN, B: AUGSBURG, C: LEIPZIG, D: null };
  const kandidaten = empfehlungsKandidaten(objekte, optionen({ objektKoordinate: (o) => lage[o.id] }));
  const liste = objektListe(kandidaten, objekte);

  it("fasst je Objekt zusammen, passende Einheiten zuerst", () => {
    const a = liste.find((e) => e.objektId === "A")!;
    expect(a.einheiten.map((k) => k.schluessel)).toEqual(["a1", "a2"]);
    expect(a.anzahlPassend).toBe(1);
    expect(a.preisVon).toBe(260000);
    expect(a.preisBis).toBe(400000);
    expect(liste.find((e) => e.objektId === "B")!.anzahlPassend).toBe(0);
  });

  it("sortiert nach Entfernung, ohne Lage ans Ende", () => {
    expect(sortiereObjektListe(liste, "entfernung").map((e) => e.objektId)).toEqual(["A", "B", "C", "D"]);
  });

  it("sortiert nach Preis", () => {
    expect(sortiereObjektListe(liste, "preis").map((e) => e.objektId)).toEqual(["B", "A", "C", "D"]);
  });

  it("passende zuerst, dann nach Entfernung", () => {
    expect(sortiereObjektListe(liste, "passende").map((e) => e.objektId)).toEqual(["A", "C", "B", "D"]);
  });
});
