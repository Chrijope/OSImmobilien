import { describe, expect, it } from "vitest";
import {
  STANDARD_ANNAHMEN, empfohlen, kriterien, nachrangFall, r2, rechneEinheit, vergleichDateiname,
  type KundenObjektvergleich, type VergleichEinheit,
} from "./kundenObjektvergleich";
import basis from "./__fixtures__/objektvergleich-basis.json";
import garage2 from "./__fixtures__/objektvergleich-garage2.json";
import preis350 from "./__fixtures__/objektvergleich-preis350.json";
import preis209 from "./__fixtures__/objektvergleich-209.json";

/*
 * Referenz sind die Zahlen der vier Fassungen des Objektvergleichs vom
 * 28.10.2026 (Hauffstraße WE 12 und WE 13), erzeugt vom Python-Generator.
 */

const we12 = (kp: number, garagen = 1): VergleichEinheit => ({
  nr: "12", zimmer: 2, qm: 56, lage: "3. OG links", kpWohnung: kp, kpListe: 0, garagen, garageKp: 15000,
  garageMiete1: 80, garageMieteZiel: 150, garageIstVon: 40, garageIstBis: 50,
  mieteIst: 544, mieteSubQm: 13, u: 242.53, n: 81.83, r: 48.65, afaJahre: 32,
});
const we13 = (kp: number, garagen = 1): VergleichEinheit => ({
  nr: "13", zimmer: 3, qm: 72.36, lage: "3. OG rechts", kpWohnung: kp, kpListe: 0, garagen, garageKp: 15000,
  garageMiete1: 80, garageMieteZiel: 150, garageIstVon: 40, garageIstBis: 50,
  mieteIst: 900, mieteSubQm: 13, u: 202.8, n: 96.3, r: 62.81, afaJahre: 32,
});

type Referenz = typeof basis.WE12;

function pruefe(e: VergleichEinheit, ref: Referenz) {
  const x = rechneEinheit(e, STANDARD_ANNAHMEN);
  expect(x.kp).toBe(ref.kaufpreis);
  expect(x.nk).toBeCloseTo(ref.knk, 6);
  expect(x.afaBasis).toBeCloseTo(ref.afa_basis, 6);
  expect(x.mieteSub).toBe(ref.miete_sub);
  for (const [k, v] of Object.entries(ref.monat)) expect(r2(x.monat[k as keyof typeof x.monat]), `monat.${k}`).toBe(v);
  for (const [k, v] of Object.entries(ref.jahr)) expect(r2(x.jahr[k as keyof typeof x.jahr]), `jahr.${k}`).toBe(v);
  expect(x.hausgeld).toEqual(ref.hausgeld);
  expect(Math.round(x.steuer30)).toBe(ref.steuer_30_jahre);
  expect(Math.round(x.miete30 * 100) / 100).toBeCloseTo(ref.miete_30_monat, 2);
  expect(x.tilgung36).toBeCloseTo(ref.tilgung_36_monate, 2);
  for (const y of [25, 30, 35] as const) {
    const r = ref.entwicklung[String(y) as "25"];
    expect(Math.round(x.entw[y].wert), `wert ${y}`).toBe(r.wert);
    expect(Math.round(x.entw[y].rest), `rest ${y}`).toBe(r.rest);
    expect(Math.round(x.entw[y].erloes), `erloes ${y}`).toBe(r.erloes);
    expect(Math.round(x.entw[y].zuzahlung), `zuzahlung ${y}`).toBe(r.zuzahlung);
    expect(Math.round(x.entw[y].plus), `plus ${y}`).toBe(r.plus);
  }
  expect(x.nachMin).toBeCloseTo(ref.nach_steuer_min_max_30[0], 2);
  expect(x.nachMax).toBeCloseTo(ref.nach_steuer_min_max_30[1], 2);
  return x;
}

describe("rechneEinheit gegen die Vorlage", () => {
  it("Grundfassung", () => {
    const a = pruefe(we12(220000), basis.WE12);
    pruefe(we13(270000), basis.WE13);
    // Die AfA endet nach Jahr 32: Der Eigenanteil springt sichtbar.
    expect(Math.abs(a.reihe[32].nach - a.reihe[31].nach)).toBeGreaterThan(20);
  });
  it("mit zweiter Garage ohne Aufpreis", () => {
    pruefe(we12(220000, 2), garage2.WE12);
    pruefe(we13(270000, 2), garage2.WE13);
  });
  it("Kaufpreise angepasst", () => {
    pruefe(we12(190000), preis350.WE12);
    pruefe(we13(227000), preis350.WE13);
    pruefe(we12(209000), preis209.WE12);
  });
});

describe("r2", () => {
  it("rundet kaufmännisch wie die Vorlage", () => {
    expect(r2(7730.625)).toBe(7730.63);
    expect(r2(6374.375)).toBe(6374.38);
    expect(r2(-10318.065)).toBe(-10318.07);
    expect(r2(1.005)).toBe(1.01);
    expect(r2(12)).toBe(12);
  });
});

describe("Kriterien und Empfehlung", () => {
  it("entsprechen der Einschätzung in der Vorlage", () => {
    const A = rechneEinheit(we12(220000), STANDARD_ANNAHMEN);
    const B = rechneEinheit(we13(270000), STANDARD_ANNAHMEN);
    expect(kriterien(A, B).map((k) => k.gewinner)).toEqual(["A", "A", "B", "B", "B", "B", "B", "="]);
    expect(empfohlen(A, B)).toBe("B");
  });
});

describe("vergleichDateiname", () => {
  it("folgt der Vorlage", () => {
    const v = { einheiten: [we12(1), we13(1)], kunde: { nachname: "Muster" }, objekt: { strasse: "Hauffstraße 38 c" }, variante: "" } as unknown as KundenObjektvergleich;
    expect(vergleichDateiname(v, "28.10.2026")).toBe("Objektvergleich Muster Hauffstraße WE 12 und WE 13 (28.10.2026).pdf");
    expect(vergleichDateiname({ ...v, variante: "Kaufpreis angepasst" }, "28.10.2026")).toContain("WE 13 – Kaufpreis angepasst (");
  });
});

describe("häuserübergreifend", () => {
  const v = {
    einheiten: [we12(1), { ...we13(1), nr: "7" }], kunde: { nachname: "Muster" }, variante: "",
    objekt: { strasse: "Hauffstraße 38 c" }, objekt2: { strasse: "Barfusstraße 12" },
  } as unknown as KundenObjektvergleich;
  it("nennt beide Straßen im Dateinamen", () => {
    expect(vergleichDateiname(v, "28.10.2026")).toBe("Objektvergleich Muster Hauffstraße WE 12 und Barfusstraße WE 7 (28.10.2026).pdf");
  });
  it("lässt das Kriterium „gleiches Haus“ weg", () => {
    const A = rechneEinheit(we12(220000), STANDARD_ANNAHMEN);
    const B = rechneEinheit(we13(270000), STANDARD_ANNAHMEN);
    expect(kriterien(A, B, false).some((k) => k.gewinner === "=" && k.text.startsWith("Lage"))).toBe(false);
  });
  it("rechnet mit der Zielmiete der Wohnung, wenn sie eine hat", () => {
    const mitZiel = rechneEinheit({ ...we12(220000), mieteZielQm: 25 }, STANDARD_ANNAHMEN);
    const ohne = rechneEinheit(we12(220000), STANDARD_ANNAHMEN);
    expect(mitZiel.monat).toEqual(ohne.monat);
    expect(mitZiel.miete30).toBeGreaterThan(ohne.miete30);
  });
});

describe("Kaufnebenkosten über Nachrang", () => {
  // Einhauser-Fassung vom 28.10.2026 mit Nachrangseite: 5 % Zins, 1 % Tilgung, 3,2 % AfA (31,25 Jahre).
  const an = { ...STANDARD_ANNAHMEN, zins: 0.05, tilgung: 0.01 };
  it("trifft die Zuzahlung nach Steuer der Vorlage", () => {
    const x = rechneEinheit({ ...we12(209000), afaJahre: 31.25 }, an);
    expect([0, 0.5, 1].map((a) => r2(-nachrangFall(x, a, an).nach))).toEqual([137.71, 186.24, 234.78]);
    expect(nachrangFall(x, 1, an).jahre).toBe(23);
  });
});
