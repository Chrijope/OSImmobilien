import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";

/**
 * Die Zahlen für den Objektscore aus dem Zwischenspeicher: echte Vorbelegung,
 * echter Rechenkern, nur Kunden, Investments und Selbstauskunft sind
 * nachgebildet. Dazu die passenden Kunden je Einheit mit Stufen, Rechten und
 * Exklusivität gegen den zuständigen Partner.
 */

const stand = vi.hoisted(() => ({
  investments: [] as Array<{ id: string; kontaktId: string; pipelineStufe: string }>,
  kontakte: {} as Record<string, Record<string, unknown>>,
  sa: {} as Record<string, unknown>,
  steuer: {} as Record<string, Record<string, unknown>>,
  wohnortGeo: {} as Record<string, unknown>,
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/investmentsStore", () => ({
  getInvestments: () => stand.investments,
  getEigeneSaData: (id: string) => stand.sa[id] ?? null,
  getInvestmentMeta: (id: string, key: string, fallback: unknown) => (key === "wohnortGeo" ? stand.wohnortGeo[id] ?? fallback : fallback),
  setInvestmentMeta: () => undefined,
}));
vi.mock("@/lib/kundenStore", () => ({ getKontaktById: (id: string) => stand.kontakte[id] }));
vi.mock("@/lib/selbstauskunftEntfaellt", () => ({ selbstauskunftEntfaellt: () => false }));
vi.mock("@/lib/investmentrechner/kundenUebernahme", () => ({
  kundenUebernahmeFuer: (_k: string, inv: string) => ({
    aenderung: stand.steuer[inv] ?? {}, felder: [], posten: [], hinweis: { quelle: "selbstauskunft", text: "", stand: "2026-09-18" }, ohneSelbstauskunft: false,
  }),
}));

const { einheitScoreBasis, istEigenerKunde, kundenScoreDaten, nurEigeneKunden, passendeKundenFuerObjekt, scoreFuerKandidat, siehtPassendeKunden, SUCHENDE_STUFEN } = await import("./objektScoreDaten");
const { empfehlungsKandidaten } = await import("./einheitEmpfehlung");

// Überschuss 1.200 €, Eigenkapital 30.000 €: Rahmen rund 184.000 € bis 260.000 €.
const SA = { gehalt: 3000, miete: 900, lebenshaltung: 800, vermoegenswerte: [{ betrag: 30000 }], wuenscheZiele: ["steuer", "vermoegen"], plz: "83022" };

function we(id: string, teile: Partial<ObjektWohnung> = {}): ObjektWohnung {
  return { id, weNr: id, etage: "1", lage: "", groesse: 55, zimmer: 2, mieteGesamt: 850, vkGesamt: 240000, qmPreis: 0, rendite: 0, vermietet: true, status: "frei", ...teile } as ObjektWohnung;
}

function objekt(wohnungen: ObjektWohnung[], teile: Partial<ObjektData> = {}): ObjektData {
  return {
    id: "o1", titel: "Musterhaus", adresse: "Teststraße 1", plz: "83022", ort: "Rosenheim", sichtbar: true, wohnungen, dokumente: [], bilder: [],
    afaDaten: { afaModell: "linear", afaSatz: 2, restnutzungsdauer: 50, grundstueckAnteil: 20 },
    globalDaten: { baujahr: 1972, zustand: "Bestand" },
    meta: {
      standortanalyse: {
        schema: 2, objekt_koordinaten: { lat: 47.86, lng: 12.12 },
        mikrolage: { oepnv: [{ name: "Bus", entfernung_m: 80 }], einkaufen: [{ name: "Markt", entfernung_m: 300 }], aerzte: [{ name: "Praxis", entfernung_m: 1500 }], schulen: [{ name: "Schule", entfernung_m: 500 }] },
      },
      energieausweis: { klasse: "E" },
    },
    ...teile,
  } as unknown as ObjektData;
}

beforeEach(() => {
  stand.investments = [{ id: "inv-1", kontaktId: "k-1", pipelineStufe: "objektauswahl" }];
  stand.kontakte = { "k-1": { id: "k-1", vorname: "Kunde", nachname: "A", berater: "Partner 1", zustaendig_id: "vp-1", plz: "83022" } };
  stand.sa = { "inv-1": SA };
  stand.steuer = { "inv-1": { annualGrossIncome: 80000, taxClass: "I", jointAssessment: false, taxableIncomeCustomer: 70000 } };
  stand.wohnortGeo = { "inv-1": { plz: "83022", lat: 47.9, lng: 12.1 } };
});

describe("einheitScoreBasis", () => {
  it("liest Baujahr, Energieklasse, Mikrolage und Konzept und merkt sich die Einheit", () => {
    const w = we("w1");
    const o = objekt([w]);
    const basis = einheitScoreBasis(o, w);
    expect(basis.fakten).toMatchObject({
      baujahr: 1972, energieklasse: "E", neubau: false, konzept: "bestand",
      mikrolage: { oepnv: true, einkauf: true, aerzte: false, schule: true },
    });
    expect(basis.eingabe?.purchasePrice).toBe(240000);
    expect(einheitScoreBasis(o, w)).toBe(basis);
  });

  it("ohne Messung keine Mikrolage, ohne Miete keine Rechnung", () => {
    const w = we("w2", { mieteGesamt: 0 });
    const basis = einheitScoreBasis(objekt([w], { meta: {} }), w);
    expect(basis.fakten.mikrolage).toBeNull();
    expect(basis.eingabe).toBeNull();
  });
});

describe("kundenScoreDaten", () => {
  it("Rahmen, Überschuss, Eigenkapital, Ziele und gemerkter Wohnort aus der Selbstauskunft", () => {
    const d = kundenScoreDaten("inv-1", "k-1");
    expect(d.kunde.ueberschussMonat).toBe(1200);
    expect(d.kunde.eigenkapital).toBe(30000);
    expect(d.kunde.ziele).toEqual(["steuer", "vermoegen"]);
    expect(d.kunde.rahmen?.bis).toBeGreaterThan(250000);
    expect(d.steuerBekannt).toBe(true);
    expect(d.wohnort).toEqual({ lat: 47.9, lng: 12.1 });
    expect(d.saStand).toBe("18.09.2026");
  });

  it("schlägt keinen Wohnort nach, wenn keiner gemerkt ist", () => {
    stand.wohnortGeo = {};
    expect(kundenScoreDaten("inv-1", "k-1").wohnort).toBeNull();
  });
});

describe("scoreFuerKandidat", () => {
  it("rechnet mit dem Rechenkern einen vollständigen Score", () => {
    const o = objekt([we("w1")]);
    const d = kundenScoreDaten("inv-1", "k-1");
    const [k] = empfehlungsKandidaten([o], { nutzer: { rolle: "admin" }, kundeId: "k-1", rahmen: d.kunde.rahmen, wohnort: d.wohnort, objektKoordinate: () => ({ lat: 47.86, lng: 12.12 }) });
    const s = scoreFuerKandidat(o, k, d);
    expect(s.wert).toBeGreaterThan(0);
    expect(s.teilwert).toBe(false);
    expect(s.bausteine.find((b) => b.id === "steuer")?.wert).not.toBeNull();
    expect(s.gruende.length).toBeGreaterThanOrEqual(3);
  });

  it("ohne Einkommen ein Teilwert bei Ziel Steuervorteile", () => {
    stand.steuer = { "inv-1": { jointAssessment: false } };
    stand.sa = { "inv-1": { ...SA, wuenscheZiele: ["steuer"] } };
    const o = objekt([we("w1")]);
    const d = kundenScoreDaten("inv-1", "k-1");
    const [k] = empfehlungsKandidaten([o], { nutzer: { rolle: "admin" }, kundeId: "k-1", rahmen: d.kunde.rahmen, wohnort: d.wohnort, objektKoordinate: () => null });
    const s = scoreFuerKandidat(o, k, d);
    expect(s.teilwert).toBe(true);
    expect(s.fehltText).toContain("Jahresbrutto fehlt");
  });
});

describe("passendeKundenFuerObjekt", () => {
  it("nur suchende Stufen, mit Score je Einheit", () => {
    stand.investments.push({ id: "inv-2", kontaktId: "k-2", pipelineStufe: "reservierung" });
    stand.kontakte["k-2"] = { id: "k-2", vorname: "Kunde", nachname: "B", berater: "Partner 2", zustaendig_id: "vp-2" };
    stand.sa["inv-2"] = SA;
    const r = passendeKundenFuerObjekt(objekt([we("w1"), we("w2", { vkGesamt: 900000 })]), {});
    expect(r.jeEinheit.get("w1")?.map((t) => t.kontaktId)).toEqual(["k-1"]);
    expect(r.jeEinheit.has("w2")).toBe(false);
    expect(r.kundenMitTreffer).toBe(1);
    expect(r.suchende).toBe(1);
    expect([...SUCHENDE_STUFEN]).toEqual(["selbstauskunft", "objektauswahl", "follow_up_objekt"]);
  });

  it("zählt suchende Kunden ohne Rahmen als nicht bewertet", () => {
    stand.investments.push({ id: "inv-3", kontaktId: "k-3", pipelineStufe: "selbstauskunft" });
    stand.kontakte["k-3"] = { id: "k-3", vorname: "Kunde", nachname: "C" };
    const r = passendeKundenFuerObjekt(objekt([we("w1")]), {});
    expect(r.nichtBewertet).toBe(1);
    expect(r.suchende).toBe(2);
  });

  it("prüft die Exklusivität gegen den zuständigen Partner des Kunden, nicht gegen den Nutzer", () => {
    const o = objekt([we("w1", { exklusivNutzer: ["vp-9"] }), we("w2", { exklusivNutzer: ["vp-1"] })]);
    const r = passendeKundenFuerObjekt(o, { benutzerId: "admin-1" });
    expect(r.jeEinheit.has("w1")).toBe(false);
    expect(r.jeEinheit.get("w2")?.[0].kontaktId).toBe("k-1");
  });

  it("mit nurEigene nur die Kunden des Nutzers", () => {
    expect(passendeKundenFuerObjekt(objekt([we("w1")]), { benutzerId: "vp-2", nurEigene: true }).kundenMitTreffer).toBe(0);
    expect(passendeKundenFuerObjekt(objekt([we("w1")]), { benutzerId: "vp-1", nurEigene: true }).kundenMitTreffer).toBe(1);
  });

  it("mit nurEigene auch die Kunden, für die der Nutzer heute Vertretung ist, über die Kennung", () => {
    const o = objekt([we("w1")]);
    expect(passendeKundenFuerObjekt(o, { benutzerId: "vp-2", nurEigene: true, vertretungFuer: new Set(["vp-1"]) }).kundenMitTreffer).toBe(1);
    // Derselbe Name ohne Kennung zählt nicht.
    stand.kontakte["k-1"] = { ...stand.kontakte["k-1"], zustaendig_id: "" };
    expect(passendeKundenFuerObjekt(o, { benutzerId: "vp-1", nurEigene: true }).kundenMitTreffer).toBe(0);
  });

  it("ein Kunde mit zwei suchenden Investments steht einmal da", () => {
    stand.investments.push({ id: "inv-1b", kontaktId: "k-1", pipelineStufe: "selbstauskunft" });
    stand.sa["inv-1b"] = SA;
    stand.steuer["inv-1b"] = stand.steuer["inv-1"];
    expect(passendeKundenFuerObjekt(objekt([we("w1")]), {}).jeEinheit.get("w1")).toHaveLength(1);
  });
});

describe("Rechte nach aktiver Rolle", () => {
  it.each([["admin", true], ["inhaber", true], ["vertriebsleiter", true], ["vertriebspartner", true], ["finanzierungspartner", false], ["buchhaltung", false], ["objektpartner", false], ["kunde", false]])(
    "%s sieht passende Kunden: %s", (rolle, erwartet) => {
      expect(siehtPassendeKunden(rolle)).toBe(erwartet);
    },
  );

  it("nur der Vertriebspartner ist auf eigene Kunden beschränkt", () => {
    expect(["admin", "inhaber", "vertriebsleiter", "vertriebspartner"].filter((r) => nurEigeneKunden(r))).toEqual(["vertriebspartner"]);
  });

  it("eigener Kunde nur über die Kennung, direkt oder als Vertretung", () => {
    expect(istEigenerKunde("vp-1", "vp-1")).toBe(true);
    expect(istEigenerKunde("vp-1", "vp-2", new Set(["vp-1"]))).toBe(true);
    expect(istEigenerKunde("vp-1", "vp-2")).toBe(false);
    expect(istEigenerKunde("", "vp-1")).toBe(false);
    expect(istEigenerKunde("vp-1", undefined)).toBe(false);
  });
});
