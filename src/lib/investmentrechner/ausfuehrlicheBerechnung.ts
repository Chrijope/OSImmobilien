/**
 * Ausführliche Berechnung des Investmentrechners im Aufbau der
 * Einhauser-Rechnung (Christian, 29.10.2026).
 *
 * Gerechnet wird mit `rechneEinheit` aus kundenObjektvergleich.ts, nicht mit
 * dem Rechenkern: jährlich, Kaufpreis voll finanziert, Kaufnebenkosten aus
 * Eigenkapital, Miete linear bis zur Zielmiete. Die Zahlen, die der Rechner
 * schon kennt (Kaufpreis, Fläche, Miete, Hausgeld, Zins, Tilgung, AfA,
 * Gebäudeanteil, Kaufnebenkosten, Wert- und Kostensteigerung, Steuer), kommen
 * aus seiner Eingabe, damit eine Änderung in der Kalkulationsbasis überall
 * gilt. Was nur diese Rechnung braucht, steht in `eingabe.ausfuehrlich`;
 * leere Angaben füllt `ausfuehrlichVorgaben` aus Objekt und Wohnung.
 */
import type { ObjektData, ObjektWohnung } from "@/lib/objekteStore";
import type { InvestmentEingabe, InvestmentErgebnis } from "./rechenkern";
import {
  LEERE_TEXTE, STANDARD_ANNAHMEN, rechneEinheit,
  type EinheitErgebnis, type KundenObjektvergleich, type VergleichAnnahmen, type VergleichEinheit, type VergleichKunde, type VergleichObjekt,
} from "./kundenObjektvergleich";
import { einheitAus, objektAnnahmen, objektAus, vorgabenAus } from "./kundenObjektvergleichVorbelegung";

/** Angaben nur für die ausführliche Berechnung. Anteile als Bruch (0,2 = 20 %). */
export interface AusfuehrlichAngaben {
  nr: string;
  lage: string;
  /** Gerechnete (subventionierte) Kaltmiete €/m²; 0 = die heutige Kaltmiete. */
  mieteSubQm: number;
  subventionMonate: number;
  mieteZielQm: number;
  mieteZielJahr: number;
  kappung: number;
  garagen: number;
  /** Gerechnete Garagenmiete im 1. Jahr je Garage; 0 = die Stellplatzmiete der Kalkulationsbasis. */
  garageMiete1: number;
  garageMieteZiel: number;
  garageIstVon: number;
  garageIstBis: number;
  kpListe: number;
  lastenwechselMonate: number;
  nachrangZins: number;
  nachrangTilgung: number;
  verwaltung: string;
  vergleichsmieteQm: number;
  vergleichsmieteQuelle: string;
  wirtschaftsplan: string;
  hausPunkte: string[];
  /** Version auf dem Deckblatt. */
  version: string;
  /** Kundendaten der Ausgangslage; leer aus der Selbstauskunft. */
  kunde: Partial<VergleichKunde>;
}

export const LEERER_KUNDE: VergleichKunde = {
  anrede: "", vorname: "", nachname: "", netto: 0, bruttoJahr: 0, steuerklasse: "", familienstand: "", kinder: "keine",
  beschaeftigung: "", antrag: "", wohnsituation: "", mieteWarm: 0, lebenshaltung: 0, kredite: "keine", kreditRaten: 0,
  kapital: 0, jahreBisRente: 0, saDatum: "",
};

const positiv = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
const runde2 = (x: number) => Math.round(x * 100) / 100;

/** Vorgaben aus Objekt und Wohnung, soweit „Objekt anlegen“ sie kennt. */
export function ausfuehrlichVorgaben(objekt: ObjektData, wohnung: ObjektWohnung, heute = new Date()): Partial<AusfuehrlichAngaben> {
  const vorgaben = vorgabenAus(objekt);
  const e = einheitAus(objekt, wohnung, vorgaben, heute);
  const o = objektAus(objekt, vorgaben);
  const an = objektAnnahmen(objekt, wohnung);
  return {
    nr: e.nr, lage: e.lage, mieteSubQm: e.mieteSubQm, garagen: e.garagen, garageMiete1: e.garageMiete1,
    garageIstVon: e.garageIstVon, garageIstBis: e.garageIstBis,
    ...(positiv(vorgaben.garageMieteZiel) ? { garageMieteZiel: vorgaben.garageMieteZiel } : {}),
    ...(positiv(vorgaben.mieteZielQm) ? { mieteZielQm: vorgaben.mieteZielQm } : {}),
    ...(positiv(vorgaben.mieteZielJahr) ? { mieteZielJahr: vorgaben.mieteZielJahr } : {}),
    ...(positiv(vorgaben.subventionMonate) || an.subventionMonate ? { subventionMonate: positiv(vorgaben.subventionMonate) || an.subventionMonate } : {}),
    ...(an.kappung ? { kappung: an.kappung } : {}),
    verwaltung: o.verwaltung, vergleichsmieteQm: o.vergleichsmieteQm, vergleichsmieteQuelle: o.vergleichsmieteQuelle,
    wirtschaftsplan: o.wirtschaftsplan, hausPunkte: o.hausPunkte,
  };
}

/** Wohnungsnummer aus dem Titel („Musterstraße 1, WE 12“), sonst leer. */
function nrAusTitel(titel: string): string {
  return /\bWE\s*([\w.-]+)/i.exec(titel)?.[1] ?? "";
}

/**
 * Alle Angaben, die gelten: Eingabe vor Vorgabe vor Rechnerwert. Ohne
 * Zielmiete am Objekt steigt die Miete mit der Mietsteigerung der
 * Kalkulationsbasis bis zum Zieljahr (34 Jahre nach dem Start, wie 2026 bis 2060).
 */
export function wirksameAngaben(input: InvestmentEingabe, vorgaben: Partial<AusfuehrlichAngaben> = {}): AusfuehrlichAngaben {
  const eigen = input.ausfuehrlich ?? {};
  const w = <K extends keyof AusfuehrlichAngaben>(k: K): AusfuehrlichAngaben[K] | undefined => {
    const x = eigen[k] ?? vorgaben[k];
    return x === "" || x === null ? undefined : (x as AusfuehrlichAngaben[K]);
  };
  const qm = positiv(input.area);
  const mieteIstQm = qm ? runde2(positiv(input.monthlyColdRent) / qm) : 0;
  const mieteSubQm = positiv(w("mieteSubQm")) || mieteIstQm;
  const zielJahr = positiv(w("mieteZielJahr")) || (input.startYear || new Date().getFullYear()) + 34;
  const jahre = Math.max(1, zielJahr - (input.startYear || new Date().getFullYear()));
  const wachstum = (1 + Math.max(0, input.annualRentGrowth) / 100) ** jahre;
  const garagen = w("garagen") ?? (positiv(input.garagePrice) || positiv(input.monthlyGarageRent) ? 1 : 0);
  const garageMiete1 = positiv(w("garageMiete1")) || (garagen ? runde2(positiv(input.monthlyGarageRent) / garagen) : 0);
  return {
    nr: w("nr") || nrAusTitel(input.propertyTitle),
    lage: w("lage") ?? "",
    mieteSubQm,
    subventionMonate: positiv(w("subventionMonate")) || STANDARD_ANNAHMEN.subventionMonate,
    mieteZielQm: positiv(w("mieteZielQm")) || runde2(mieteSubQm * wachstum),
    mieteZielJahr: zielJahr,
    kappung: positiv(w("kappung")) || STANDARD_ANNAHMEN.kappung,
    garagen,
    garageMiete1,
    garageMieteZiel: positiv(w("garageMieteZiel")) || Math.round(garageMiete1 * wachstum),
    garageIstVon: positiv(w("garageIstVon")),
    garageIstBis: positiv(w("garageIstBis")),
    kpListe: positiv(w("kpListe")),
    lastenwechselMonate: positiv(w("lastenwechselMonate")) || STANDARD_ANNAHMEN.lastenwechselMonate,
    nachrangZins: positiv(w("nachrangZins")) || STANDARD_ANNAHMEN.nachrangZins,
    nachrangTilgung: positiv(w("nachrangTilgung")) || STANDARD_ANNAHMEN.nachrangTilgung,
    verwaltung: w("verwaltung") ?? "",
    vergleichsmieteQm: positiv(w("vergleichsmieteQm")),
    vergleichsmieteQuelle: w("vergleichsmieteQuelle") ?? "",
    wirtschaftsplan: w("wirtschaftsplan") || "Wirtschaftsplan",
    hausPunkte: w("hausPunkte") ?? [],
    version: w("version") || "1",
    kunde: { ...(vorgaben.kunde ?? {}), ...(eigen.kunde ?? {}) },
  };
}

/**
 * Steuersatz: von Hand gesetzt gilt er pauschal; mit Tarif der Satz, den der
 * Rechenkern im 1. Jahr auf den Verlust anwendet (Einkommen des Kunden, mit
 * Soli und Kirchensteuer). Ohne Einkommen pauschal mit dem gesetzten Satz.
 */
export function steuerAus(input: InvestmentEingabe, result: InvestmentErgebnis): Pick<VergleichAnnahmen, "steuer" | "steuerArt"> {
  const pauschal = { steuer: Math.max(0, input.marginalTaxRate) / 100, steuerArt: "pauschal" as const };
  if (input.taxCalculationMode === "manual") return pauschal;
  const j = result.years.find((y) => y.allocatedTaxableResult < 0);
  const satz = j ? j.taxEffect / -j.allocatedTaxableResult : 0;
  return satz > 0.005 && satz < 0.6 ? { steuer: Math.round(satz * 1000) / 1000, steuerArt: "einkommen" } : pauschal;
}

export function einheitAusRechner(input: InvestmentEingabe, a: AusfuehrlichAngaben): VergleichEinheit {
  const garageKp = positiv(input.garagePrice);
  return {
    nr: a.nr || "1",
    zimmer: positiv(input.rooms),
    qm: positiv(input.area) || 1,
    lage: a.lage,
    kpWohnung: Math.max(0, positiv(input.purchasePrice) - garageKp),
    kpListe: a.kpListe,
    garagen: a.garagen,
    garageKp,
    garageMiete1: a.garageMiete1,
    garageMieteZiel: a.garageMieteZiel,
    garageIstVon: a.garageIstVon,
    garageIstBis: a.garageIstBis,
    mieteIst: positiv(input.monthlyColdRent),
    mieteSubQm: a.mieteSubQm,
    u: positiv(input.housingFeeRecoverable),
    n: positiv(input.housingFeeNonRecoverable) + positiv(input.monthlyOperatingCosts),
    r: positiv(input.monthlyReserveContribution),
    afaJahre: positiv(input.buildingDepreciationRate) ? 100 / input.buildingDepreciationRate : 50,
    mieteZielQm: a.mieteZielQm,
  };
}

export function annahmenAusRechner(input: InvestmentEingabe, result: InvestmentErgebnis, a: AusfuehrlichAngaben): VergleichAnnahmen {
  const kp = positiv(input.purchasePrice);
  return {
    ...STANDARD_ANNAHMEN,
    ...steuerAus(input, result),
    zins: Math.max(0, input.seniorInterestRate) / 100,
    tilgung: Math.max(0, input.seniorRepaymentRate) / 100,
    knk: kp ? positiv(result.purchaseCosts) / kp : 0,
    gebaeudeanteil: Math.max(0, input.buildingShare) / 100,
    wertPa: input.annualValueGrowth / 100,
    kostenPa: input.annualCostGrowth / 100,
    startJahr: input.startYear || new Date().getFullYear(),
    mieteZielQm: a.mieteZielQm,
    mieteZielJahr: a.mieteZielJahr,
    kappung: a.kappung,
    subventionMonate: a.subventionMonate,
    lastenwechselMonate: a.lastenwechselMonate,
    nachrangZins: a.nachrangZins,
    nachrangTilgung: a.nachrangTilgung,
  };
}

function objektAusRechner(input: InvestmentEingabe, a: AusfuehrlichAngaben, foto: string): VergleichObjekt {
  const [strasse, ...rest] = (input.address || input.propertyTitle || "").split(",").map((t) => t.trim());
  return {
    strasse: strasse || "Objekt", ortZeile: rest.join(", "), fotoTitel: foto, fotoHaus: foto,
    hausPunkte: a.hausPunkte.length ? a.hausPunkte : [input.constructionYear ? `Baujahr ${input.constructionYear}` : ""].filter(Boolean),
    verwaltung: a.verwaltung, vergleichsmieteQm: a.vergleichsmieteQm, vergleichsmieteQuelle: a.vergleichsmieteQuelle, wirtschaftsplan: a.wirtschaftsplan,
  };
}

export interface RechnerObjekt {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  vorgaben?: Partial<AusfuehrlichAngaben>;
  /** Hausbild für Seite „Haus und Wohnung“, etwa das erste Foto aus „Bilder“. */
  foto?: string;
}

/** Das Dokument der ausführlichen Berechnung aus einem oder zwei Objekten des Rechners. */
export function berechnungAusRechner(objekte: RechnerObjekt[], heute = new Date()): { v: KundenObjektvergleich; A: EinheitErgebnis; B: EinheitErgebnis | null } {
  const liste = objekte.slice(0, 2).map((o) => ({ ...o, a: wirksameAngaben(o.input, o.vorgaben) }));
  const erstes = liste[0];
  const annahmen = annahmenAusRechner(erstes.input, erstes.result, erstes.a);
  const einheiten = liste.map((o) => einheitAusRechner(o.input, o.a));
  const kunde: VergleichKunde = { ...LEERER_KUNDE, ...erstes.a.kunde };
  if (!kunde.vorname && !kunde.nachname && erstes.input.clientName) {
    const teile = erstes.input.clientName.trim().split(/\s+/);
    kunde.nachname = teile.pop() ?? "";
    kunde.vorname = teile.join(" ");
  }
  const o1 = objektAusRechner(erstes.input, erstes.a, erstes.foto ?? "");
  const o2 = liste[1] ? objektAusRechner(liste[1].input, liste[1].a, liste[1].foto ?? "") : null;
  const v: KundenObjektvergleich = {
    version: 1,
    stand: heute.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" }),
    kontaktId: null,
    investmentId: null,
    variante: "",
    kunde,
    objekt: o1,
    objekt2: o2 && o2.strasse !== o1.strasse ? o2 : null,
    annahmen,
    einheiten,
    texte: { ...LEERE_TEXTE },
    dokument: { titel: erstes.input.propertyTitle, adresse: erstes.input.address, typ: erstes.input.propertyType, version: erstes.a.version },
  };
  // Jede Wohnung mit ihren eigenen Zins- und Kostenannahmen; der Steuersatz ist der des Kunden.
  const ergebnis = (i: number) => rechneEinheit(einheiten[i], i === 0 ? annahmen : { ...annahmenAusRechner(liste[i].input, liste[i].result, liste[i].a), steuer: annahmen.steuer, steuerArt: annahmen.steuerArt });
  return { v, A: ergebnis(0), B: liste[1] ? ergebnis(1) : null };
}
