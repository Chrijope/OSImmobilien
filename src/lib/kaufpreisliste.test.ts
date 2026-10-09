import { describe, expect, it } from "vitest";
import {
  berechneKaufpreisliste, hausgeldMonat, KPL_STANDARD, neueKplZeile, neueWpPosition, type KplEingaben, type HausgeldKategorie, type Verteiler,
} from "./kaufpreisliste";

/*
 * Das Beispiel Marktstraße 6 aus der Excel „Kaufpreisliste_Marktstrasse6.xlsx“
 * (Skript baue.py der Hauptsitzung). Die Erwartungen sind die Excel-Ergebnisse.
 */
const POSITIONEN: [string, HausgeldKategorie, number, Verteiler?][] = [
  ["Be-/Entwässerung", "umlagefähig", 3500], ["Niederschlagswasser", "umlagefähig", 0], ["Straßenreinigung", "umlagefähig", 0],
  ["Abfallentsorgung", "umlagefähig", 1600], ["Recycling", "umlagefähig", 0], ["Schneebeseitigung", "umlagefähig", 2000],
  ["Hausreinigung", "umlagefähig", 5000], ["Gebäudebetreuung/Hauswart", "umlagefähig", 2160], ["Gartenpflege", "umlagefähig", 2800],
  ["Dachrinnenreinigung", "umlagefähig", 0], ["Hausbeleuchtung", "umlagefähig", 200], ["Gebäudeversicherung", "umlagefähig", 8000],
  ["Haftpflichtversicherung", "umlagefähig", 500], ["Rauchwarnmelder Wartung", "umlagefähig", 250],
  ["Heizkosten", "Heizkosten", 17000],
  ["Instandhaltung Haus", "nicht umlagefähig", 1000], ["Instandhaltung Heizung", "nicht umlagefähig", 500],
  ["Rauchwarnmelder Miete", "nicht umlagefähig", 250], ["Sonstige Kosten", "nicht umlagefähig", 0],
  ["Verwaltergebühren", "nicht umlagefähig", 4712.4, "WE"], ["Beiratsversicherung", "nicht umlagefähig", 0],
  ["Kontoführung/Porto/Ausl.", "nicht umlagefähig", 30], ["Kosten Sondereigentum", "nicht umlagefähig", 0],
  ["Erhaltungsrücklage", "Erhaltungsrücklage", 3711.18],
];

// WE, Lage, Status, Mieter, MV-Beginn, Fläche, Ist, BK, HK, Strom, Wasser, NK, MwSt, VK
type Roh = [string, string, string, string, string, number, number, number, number, number, number, number, number, number];
const EINHEITEN: Roh[] = [
  ["WE 1", "Wohnung 1, EG links", "vermietet", "Strauß-Girbinger", "2019-11-01", 65, 325, 50, 70, 0, 0, 0, 0, 153500],
  ["WE 2", "Wohnung 2, EG rechts", "vermietet", "leer", "", 25, 0, 60, 0, 0, 0, 0, 0, 64500],
  ["WE 3", "Wohnung 3, EG mitte", "vermietet", "Matuschek, Marius", "", 46, 0, 0, 0, 0, 0, 0, 0, 112000],
  ["WE 4", "Wohnung 4, 1. OG mitte", "Leerstand", "Leerstand", "", 25, 0, 0, 0, 0, 0, 0, 0, 65500],
  ["WE 5", "Wohnung 5, 1. OG rechts", "vermietet", "SAM – Soziale Arbeit Mittelmark", "2024-04-01", 90, 765, 120, 100, 0, 0, 0, 0, 203500],
  ["WE 6", "Wohnung 6, 1. OG links", "vermietet", "Bertz, Doreen", "2020-04-15", 50, 250, 25, 0, 0, 0, 0, 0, 121500],
  ["WE 7", "Wohnung 7, 1. OG mitte/links", "Leerstand", "Leerstand", "", 48, 0, 0, 0, 0, 0, 0, 0, 119000],
  ["WE 8", "Wohnung, DG rechts", "vermietet", "Zimmermann, Benjamin", "2022-11-01", 80, 721.62, 50, 50, 0, 0, 0, 0, 185000],
  ["WE 9", "Wohnung, DG mitte", "vermietet", "Heese, Jörg", "2021-04-01", 30, 180, 30, 25, 0, 0, 0, 0, 77000],
  ["WE 10", "Wohnung, DG links", "vermietet", "Frömming, Carolin", "2022-12-01", 60, 510, 60, 60, 0, 0, 0, 0, 143000],
  ["WE 11", "Büroräume 2–4, EG", "Umbau", "Büro Kranepuhl Transporte", "", 56.05, 400, 0, 0, 250, 200, 0, 161.5, 128500],
  ["WE 12", "Büroräume EG (ehem. Büro Kranepuhl)", "Umbau", "", "", 35, 0, 0, 0, 0, 0, 0, 0, 84000],
];
/** MEA nach Fläche auf genau 1.000 geschätzt, wie im Skript (größter Rest, 0,1er-Schritte). */
function meaSchaetzung(flaechen: number[]): number[] {
  const summe = flaechen.reduce((s, f) => s + f, 0);
  const roh = flaechen.map((f) => (1000 * f) / summe);
  const mea = roh.map((x) => Math.floor(x * 10) / 10);
  const rest = Math.round((1000 - mea.reduce((s, m) => s + m, 0)) * 10);
  [...roh.keys()].sort((a, b) => (roh[b] * 10 - Math.floor(roh[b] * 10)) - (roh[a] * 10 - Math.floor(roh[a] * 10)))
    .slice(0, rest).forEach((i) => { mea[i] = Math.round((mea[i] + 0.1) * 10) / 10; });
  return mea;
}

function beispielMarktstrasse6(): KplEingaben {
  const mea = meaSchaetzung(EINHEITEN.map((e) => e[5]));
  return {
    ...KPL_STANDARD(),
    objektName: "Marktstraße 6",
    ort: "14822 Brück / Neuendorf",
    stand: "2026-10-09",
    sollQmVorgabe: 10,
    subventionGesamt: 75000,
    zeilen: EINHEITEN.map(([we, lage, status, mieter, mvBeginn, flaeche, ist, bk, hk, strom, wasser, nk, mwst, vk], i) => ({
      ...neueKplZeile(we), lage, status, mieter, mvBeginn, flaeche, mea: mea[i], ist, bk, hk, strom, wasser, nk, mwst, vk,
    })),
    wirtschaftsplan: {
      gesamtMea: 1000, anzahlEinheiten: 11, gesamtflaeche: 618.53, gueltigAb: "2027", pruefMea: 39,
      positionen: POSITIONEN.map(([p, k, a, v]) => neueWpPosition(p, k, a, v ?? "MEA")),
    },
  };
}

describe("Kaufpreisliste, Beispiel Marktstraße 6", () => {
  const e = beispielMarktstrasse6();
  const r = berechneKaufpreisliste(e);

  it("rechnet die GESAMT-Zeile wie die Excel", () => {
    expect(r.gesamt.flaeche).toBeCloseTo(610.05, 6);
    expect(r.gesamt.mea).toBeCloseTo(1000, 6);
    expect(r.gesamt.ist).toBeCloseTo(3151.62, 6);
    expect(r.gesamt.soll).toBeCloseTo(6100.5, 6);
    expect(r.gesamt.vk).toBe(1457000);
    expect(r.gesamt.renditeIst).toBeCloseTo(0.0260, 4);
    expect(r.gesamt.renditeSoll).toBeCloseTo(0.0502, 4);
    expect(r.gesamt.istQm).toBeCloseTo(3151.62 / 610.05, 9);
    expect(r.gesamt.vkQm).toBeCloseTo(1457000 / 610.05, 9);
    expect(r.gesamt.subvention).toBeCloseTo(75000, 6);
    expect(r.gesamt.vermietet).toBe(8);
    expect(r.gesamt.einheiten).toBe(12);
  });

  it("verteilt die Mietsubvention nach Verkaufspreis", () => {
    expect(r.zeilen[0].subvention).toBeCloseTo(7901.51, 2);
  });

  it("Hausgeld-Prüfung: 39 MEA ergeben 193,33 € im Monat", () => {
    expect(hausgeldMonat(e.wirtschaftsplan, 39)).toBeCloseTo(193.33, 2);
  });

  it("Hausgeld je Einheit: Summe der vier Kategorien, Überschuss Soll ohne umlagefähige Teile", () => {
    const z = r.zeilen[0];
    expect(z.hg).toBeCloseTo(hausgeldMonat(e.wirtschaftsplan, e.zeilen[0].mea)!, 9);
    expect(z.ueberschuss).toBeCloseTo(z.soll! - z.hgNuml! - z.hgEr!, 9);
    expect(z.gesamtmiete).toBeCloseTo(325 + 50 + 70, 9);
    expect(r.zeilen[10].gesamtmiete).toBeCloseTo(400 + 250 + 200 + 161.5, 9);
  });
});

describe("Kaufpreisliste, leere Felder wie in der Excel", () => {
  it("ohne Fläche bleibt die Zeile leer, ohne MEA das Hausgeld", () => {
    const e = KPL_STANDARD();
    const z = berechneKaufpreisliste(e).zeilen[0];
    expect(z.soll).toBeNull();
    expect(z.hg).toBeNull();
    expect(z.subvention).toBeNull();
  });

  it("eigener Soll-Wert je Einheit geht vor der Vorgabe", () => {
    const e = { ...KPL_STANDARD(), zeilen: [{ ...neueKplZeile("WE 1"), flaeche: 50, sollQm: 12 }] };
    expect(berechneKaufpreisliste(e).zeilen[0].soll).toBe(600);
  });
});
