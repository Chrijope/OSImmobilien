import { describe, expect, it } from "vitest";
import {
  BAUSTEIN_REIHENFOLGE, DECKEL_OHNE_NEBENKOSTEN, ZIEL_GEWICHTE, besteTreffer, bewerteEinheit, gewichteFuerZiele,
  gueltigeZiele, scoreStufe, substanzWert, vergleicheScore,
  type ObjektScore, type ScoreEinheit, type ScoreKunde, type ScoreRechnung,
} from "./objektScore";
import { ANLAGE_ZIELE } from "./anlageZiele";

/**
 * Der Objektscore als reine Rechenregel (Strategie vom 04.10.2026):
 * Bausteine, Gewichte, Ausschlüsse, Teilwert, Deckel 59, Gleichstand und
 * höchstens eine Einheit je Objekt.
 */

const KUNDE: ScoreKunde = { rahmen: { von: 200000, bis: 300000 }, ueberschussMonat: 1500, eigenkapital: 40000, ziele: ["steuer"] };

function einheit(teile: Partial<ScoreEinheit> = {}): ScoreEinheit {
  return {
    schluessel: "w1", objektId: "o1", gesamtkosten: 240000, kaufpreis: 240000, passt: true, rendite: 4.1,
    entfernungKm: 12, baujahr: 1972, energieklasse: "E", neubau: false,
    mikrolage: { oepnv: true, einkauf: true, aerzte: true, schule: true }, konzept: "bestand", afaText: "lineare AfA 2 %",
    ...teile,
  };
}

const RECHNUNG: ScoreRechnung = {
  eigenanteilMonat: 135, steuerwirkung: 60000, grenzsteuersatz: 0.42, faktorJeEuro: 2.5, einsatz: 30000, kaufnebenkosten: 20000,
};

const wert = (s: ObjektScore, id: string) => s.bausteine.find((b) => b.id === id)?.wert;

describe("Gewichte", () => {
  it("jede Zielzeile verteilt genau 50, zusammen mit den festen 100", () => {
    for (const ziel of Object.keys(ZIEL_GEWICHTE)) {
      const g = gewichteFuerZiele([ziel]);
      expect(BAUSTEIN_REIHENFOLGE.reduce((s, id) => s + g[id], 0)).toBe(100);
    }
  });

  it("jedes Anlageziel aus anlageZiele.ts hat eine Zeile", () => {
    expect(Object.keys(ZIEL_GEWICHTE).sort()).toEqual(ANLAGE_ZIELE.map((z) => z.id).sort());
  });

  it("feste Gewichte und die Zeile Steuervorteile", () => {
    expect(gewichteFuerZiele(["steuer"])).toMatchObject({ rahmen: 15, belastung: 15, mikrolage: 10, naehe: 10, steuer: 30, vermoegen: 10, konzept: 10, ertrag: 0, substanz: 0 });
  });

  it("bei zwei Zielen der Durchschnitt der Zeilen", () => {
    const g = gewichteFuerZiele(["steuer", "vermoegen"]);
    expect(g.steuer).toBe(17.5);
    expect(g.vermoegen).toBe(17.5);
    expect(g.substanz).toBe(5);
    expect(g.konzept).toBe(10);
  });

  it("verwirft unbekannte und doppelte Ziele und nimmt höchstens drei", () => {
    expect(gueltigeZiele(["steuer", "steuer", "quatsch", "rente", "kinder", "inflation"])).toEqual(["steuer", "rente", "kinder"]);
    expect(gueltigeZiele(null)).toEqual([]);
  });
});

describe("Bausteine", () => {
  it("B1 Rahmen: bis 60 % der Spanne 100, an der Obergrenze 50", () => {
    expect(wert(bewerteEinheit(einheit({ gesamtkosten: 260000 }), KUNDE, RECHNUNG), "rahmen")).toBe(100);
    expect(wert(bewerteEinheit(einheit({ gesamtkosten: 280000 }), KUNDE, RECHNUNG), "rahmen")).toBe(75);
    expect(wert(bewerteEinheit(einheit({ gesamtkosten: 300000 }), KUNDE, RECHNUNG), "rahmen")).toBe(50);
  });

  it("B2 Belastung: bis 15 % des Überschusses 100, ab 60 % 0, ohne Eigenanteil 100", () => {
    const b = (eigen: number) => wert(bewerteEinheit(einheit(), KUNDE, { ...RECHNUNG, eigenanteilMonat: eigen }), "belastung");
    expect(b(225)).toBe(100);
    expect(b(900)).toBe(0);
    expect(b(562.5)).toBe(50);
    expect(b(-50)).toBe(100);
  });

  it("B3 Steuerwirkung je 100.000 € Kaufpreis: 0 € 0, ab 25.000 € 100", () => {
    const b = (steuer: number) => wert(bewerteEinheit(einheit({ kaufpreis: 200000 }), KUNDE, { ...RECHNUNG, steuerwirkung: steuer }), "steuer");
    expect(b(0)).toBe(0);
    expect(b(-3000)).toBe(0);
    expect(b(25000)).toBe(50);
    expect(b(60000)).toBe(100);
  });

  it("B4 Ertrag: 3,0 % 0, 5,5 % 100, 4,1 % 44 wie im Entwurf", () => {
    expect(wert(bewerteEinheit(einheit({ rendite: 3 }), KUNDE, RECHNUNG), "ertrag")).toBe(0);
    expect(wert(bewerteEinheit(einheit({ rendite: 4.1 }), KUNDE, RECHNUNG), "ertrag")).toBe(44);
    expect(wert(bewerteEinheit(einheit({ rendite: 6 }), KUNDE, RECHNUNG), "ertrag")).toBe(100);
  });

  it("B5 Vermögensaufbau: 1 € 0, 4 € 100", () => {
    const b = (f: number) => wert(bewerteEinheit(einheit(), KUNDE, { ...RECHNUNG, faktorJeEuro: f }), "vermoegen");
    expect(b(0.8)).toBe(0);
    expect(b(2.5)).toBe(50);
    expect(b(4.2)).toBe(100);
  });

  it("B6 Substanz: Neubau oder A 100, vor 1950 ohne Sanierung 40, dazwischen gestaffelt", () => {
    expect(substanzWert({ neubau: true })).toBe(100);
    expect(substanzWert({ neubau: false, baujahr: 1965, energieklasse: "A" })).toBe(100);
    expect(substanzWert({ neubau: false, baujahr: 1938 })).toBe(40);
    expect(substanzWert({ neubau: false, baujahr: 1972, energieklasse: "E" })).toBe(50);
    expect(substanzWert({ neubau: false, baujahr: 1990 })).toBe(70);
    expect(substanzWert({ neubau: false, baujahr: 2005 })).toBe(85);
    expect(substanzWert({ neubau: false, baujahr: 1938, saniertJahr: 2019 }, 2026)).toBe(60);
    expect(substanzWert({ neubau: false })).toBeNull();
  });

  it("B7 Mikrolage: 25 je Kategorie im Umkreis", () => {
    const s = bewerteEinheit(einheit({ mikrolage: { oepnv: true, einkauf: true, aerzte: false, schule: false } }), KUNDE, RECHNUNG);
    expect(wert(s, "mikrolage")).toBe(50);
    expect(s.bausteine.find((b) => b.id === "mikrolage")?.text).toBe("Im Umkreis von 1 km fehlen Ärzte und Schule.");
  });

  it("B8 Nähe: bis 50 km 100, ab 250 km 20", () => {
    expect(wert(bewerteEinheit(einheit({ entfernungKm: 30 }), KUNDE, RECHNUNG), "naehe")).toBe(100);
    expect(wert(bewerteEinheit(einheit({ entfernungKm: 150 }), KUNDE, RECHNUNG), "naehe")).toBe(60);
    expect(wert(bewerteEinheit(einheit({ entfernungKm: 512 }), KUNDE, RECHNUNG), "naehe")).toBe(20);
  });

  it("B9 Konzept: passt 100, sonst 30", () => {
    expect(wert(bewerteEinheit(einheit({ konzept: "bestand" }), KUNDE, RECHNUNG), "konzept")).toBe(100);
    expect(wert(bewerteEinheit(einheit({ konzept: "wg" }), KUNDE, RECHNUNG), "konzept")).toBe(30);
  });
});

describe("Ausschlüsse", () => {
  it("ohne Rahmen kein Score", () => {
    const s = bewerteEinheit(einheit(), { ...KUNDE, rahmen: null }, RECHNUNG);
    expect(s.wert).toBeNull();
    expect(s.keinScore).toBe("kein_rahmen");
  });

  it("außerhalb des Rahmens kein Score", () => {
    expect(bewerteEinheit(einheit({ passt: false }), KUNDE, RECHNUNG).keinScore).toBe("ausserhalb_rahmen");
  });

  it("fehlt die Belastung (keine Rechnung oder kein Überschuss), kein Score", () => {
    expect(bewerteEinheit(einheit(), KUNDE, null).wert).toBeNull();
    expect(bewerteEinheit(einheit(), { ...KUNDE, ueberschussMonat: 0 }, RECHNUNG).keinScore).toBe("belastung_fehlt");
  });
});

describe("Gesamtwert, Teilwert und Deckel", () => {
  it("ist der gewichtete Mittelwert der vorhandenen Bausteine", () => {
    const s = bewerteEinheit(einheit(), KUNDE, RECHNUNG);
    const summe = s.bausteine.reduce((a, b) => a + b.gewicht * (b.wert ?? 0), 0);
    expect(s.wert).toBe(Math.round(summe / 100));
    expect(s.teilwert).toBe(false);
  });

  it("ein fehlender Baustein zählt nicht als 0, sondern fällt heraus", () => {
    const voll = bewerteEinheit(einheit({ entfernungKm: 12 }), KUNDE, RECHNUNG);
    const ohne = bewerteEinheit(einheit({ entfernungKm: null }), KUNDE, RECHNUNG);
    // Die Nähe hatte 100, ohne sie sinkt der Mittelwert, aber nicht um die vollen 10 Punkte.
    expect(ohne.wert).toBeLessThan(voll.wert as number);
    expect((voll.wert as number) - (ohne.wert as number)).toBeLessThan(10);
    expect(ohne.teilwert).toBe(false);
    expect(ohne.fehltText).toContain("Nähe zum Wohnort");
  });

  it("Teilwert, wenn mehr als 25 Gewicht fehlen (hier die Steuerwirkung mit 30)", () => {
    const s = bewerteEinheit(einheit(), KUNDE, { ...RECHNUNG, steuerwirkung: null });
    expect(s.wert).not.toBeNull();
    expect(s.teilwert).toBe(true);
    expect(s.fehltText).toMatch(/^Teilwert: Steuerwirkung \(Jahresbrutto fehlt/);
  });

  it("deckelt auf 59, wenn das Eigenkapital die Kaufnebenkosten nicht deckt, mit Warnchip", () => {
    const s = bewerteEinheit(einheit(), { ...KUNDE, eigenkapital: 15000 }, RECHNUNG);
    expect(s.ungedeckelt).toBeGreaterThan(DECKEL_OHNE_NEBENKOSTEN);
    expect(s.wert).toBe(59);
    expect(s.gedeckelt).toBe(true);
    expect(s.warnung).toBe("Eigenkapital deckt die Kaufnebenkosten nicht");
    expect(s.gruende[0]).toEqual({ art: "minus", text: expect.stringContaining("höchstens 59 Punkte") });
    expect(s.hauptgrund).toBe("Eigenkapital deckt die Kaufnebenkosten nicht");
  });
});

describe("Warum", () => {
  it("drei größte Beiträge, mit Zahl, dazu ein Abzug", () => {
    const s = bewerteEinheit(einheit({ konzept: "wg", rendite: 3.2 }), KUNDE, RECHNUNG);
    const plus = s.gruende.filter((g) => g.art === "plus");
    expect(plus).toHaveLength(3);
    expect(plus[0].text).toMatch(/Steuerwirkung stark: lineare AfA 2 %, beim Grenzsteuersatz rund 42 % etwa 60\.000\s€ in zehn Jahren \(Ziel Steuervorteile\)\./);
    // Konzept (Gewicht 10, Wert 30) ist der einzige Abzug, die Rendite zählt bei diesem Ziel nicht.
    expect(s.gruende.filter((g) => g.art === "minus").map((g) => g.text)).toEqual(["WG-Konzept, gewählt sind Bestand-Ziele."]);
    expect(s.satz).toMatch(/^Steuerwirkung etwa 60\.000\s€ in zehn Jahren, /);
  });

  it("keine Gedankenstriche in den Texten", () => {
    const s = bewerteEinheit(einheit({ konzept: "wg", entfernungKm: 400 }), { ...KUNDE, eigenkapital: 1000 }, RECHNUNG);
    const alle = [s.satz, s.hauptgrund, s.fehltText, ...s.gruende.map((g) => g.text), ...s.bausteine.map((b) => b.text)].join(" ");
    expect(alle).not.toMatch(/[–—]/);
  });
});

describe("Rangfolge", () => {
  const s = (wertZahl: number | null, km: number | null, mitte = 0): ObjektScore =>
    ({ wert: wertZahl, entfernungKm: km, abstandRahmenmitte: mitte } as ObjektScore);

  it("höher zuerst, bei Gleichstand erst Nähe, dann Rahmenmitte, ohne Score hinten", () => {
    const liste = [s(70, 80), s(80, 200), s(70, 20, 5000), s(70, 20, 1000), s(null, 1)];
    expect(liste.sort(vergleicheScore).map((x) => [x.wert, x.entfernungKm, x.abstandRahmenmitte])).toEqual([
      [80, 200, 0], [70, 20, 1000], [70, 20, 5000], [70, 80, 0], [null, 1, 0],
    ]);
  });

  it("ohne Entfernung steht bei Gleichstand hinten", () => {
    expect([s(70, null), s(70, 300)].sort(vergleicheScore)[0].entfernungKm).toBe(300);
  });

  it("Top 5: höchstens eine Einheit je Objekt, nur mit Score", () => {
    const e = (id: string, objektId: string, w: number | null) => ({ id, objektId, score: s(w, 10) });
    const top = besteTreffer([
      e("a1", "A", 90), e("a2", "A", 88), e("b1", "B", 70), e("c1", "C", 60), e("d1", "D", 50),
      e("e1", "E", 40), e("f1", "F", 30), e("g1", "G", null),
    ]);
    expect(top.map((t) => t.id)).toEqual(["a1", "b1", "c1", "d1", "e1"]);
  });

  it("Ring-Stufen", () => {
    expect([scoreStufe(86), scoreStufe(66), scoreStufe(54), scoreStufe(null)]).toEqual(["gut", "mittel", "schwach", "leer"]);
  });
});
