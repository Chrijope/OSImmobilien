/**
 * Persönlicher Objektvergleich (Christian, 28.10.2026): Rechnung und Datenmodell.
 *
 * Vorlage ist der Objektvergleich für Frau Einhauser (Hauffstraße WE 12/13).
 * Gerechnet wird wie in der Exposé-Musterrechnung (Python-Generator
 * `rechner.py`) und `rechnung.py` dieses Vergleichs: jährlich, Kaufpreis voll
 * finanziert, Kaufnebenkosten aus Eigenkapital, Steuer pauschal, Miete und
 * Garage linear bis zum Zieljahr, Kosten und Rücklage +x % im Jahr, AfA endet
 * nach der Restnutzungsdauer. Das weicht bewusst vom Rechenkern des
 * Investmentrechners (monatlich, Tarif) ab; das Dokument nennt die Annahmen.
 *
 * Die Tests (`kundenObjektvergleich.test.ts`) prüfen gegen die `zahlen.json`
 * der Einhauser-Fassungen.
 */

export interface VergleichAnnahmen {
  /** Pauschaler Steuersatz, z. B. 0,42. */
  steuer: number;
  zins: number;
  tilgung: number;
  /** Kaufnebenkosten in Anteilen vom Kaufpreis, aus Eigenkapital. */
  knk: number;
  /** Gebäudeanteil für die AfA-Bemessung. */
  gebaeudeanteil: number;
  wertPa: number;
  kostenPa: number;
  /** Jahr 1 der Rechnung. */
  startJahr: number;
  /** Zielmiete in €/m², erreicht im Zieljahr, danach konstant. */
  mieteZielQm: number;
  mieteZielJahr: number;
  /** Kappungsgrenze für Mieterhöhungen (§ 558 BGB), 0,2 oder 0,15. */
  kappung: number;
  /** Dauer der Mietsubvention in Monaten. */
  subventionMonate: number;
  /** Monate vom Kauf bis der Freibetrag wirkt (Lastenwechsel bis 1. Januar). */
  lastenwechselMonate: number;
}

export const STANDARD_ANNAHMEN: VergleichAnnahmen = {
  steuer: 0.42, zins: 0.048, tilgung: 0.012, knk: 0.085, gebaeudeanteil: 0.8, wertPa: 0.02, kostenPa: 0.02,
  startJahr: 2026, mieteZielQm: 20, mieteZielJahr: 2060, kappung: 0.2, subventionMonate: 36, lastenwechselMonate: 5,
};

export interface VergleichEinheit {
  wohnungId?: string;
  nr: string;
  zimmer: number;
  qm: number;
  lage: string;
  /** Kaufpreis der Wohnung ohne Garage. */
  kpWohnung: number;
  /** Listenpreis, wenn der Kaufpreis angepasst wurde („X statt Y“), sonst 0. */
  kpListe: number;
  /** Anzahl Garagen/Stellplätze; nur die erste hat einen Kaufpreis. */
  garagen: number;
  garageKp: number;
  /** Miete je Garage im 1. Jahr und im Zieljahr. */
  garageMiete1: number;
  garageMieteZiel: number;
  /** Heutige Garagenmiete von/bis (für „wenn die Subvention endet“), 0 = unbekannt. */
  garageIstVon: number;
  garageIstBis: number;
  /** Kaltmiete, die der Mieter heute zahlt. */
  mieteIst: number;
  /** Gerechnete (subventionierte) Kaltmiete in €/m². */
  mieteSubQm: number;
  /** Hausgeld je Monat: umlagefähig, nicht umlagefähig, Rücklage. */
  u: number;
  n: number;
  r: number;
  /** AfA-Dauer in Jahren (Restnutzungsdauer), z. B. 32. */
  afaJahre: number;
}

/** Kaufmännisch auf Cent (HALF_UP auf die kürzeste Dezimaldarstellung, wie Python `Decimal(repr(x))`). */
export function r2(x: number): number {
  return rundeHalbAuf(x, 2);
}

export function rundeHalbAuf(x: number, stellen: number): number {
  if (!Number.isFinite(x)) return x;
  const s = Math.abs(x).toString();
  if (s.includes("e")) return Number(x.toFixed(stellen));
  const [ganz, nach = ""] = s.split(".");
  if (nach.length <= stellen) return x;
  const basis = BigInt(ganz + nach.slice(0, stellen));
  const auf = Number(nach[stellen]) >= 5 ? 1n : 0n;
  const ergebnis = Number(basis + auf) / 10 ** stellen;
  return x < 0 ? -ergebnis : ergebnis;
}

interface Jahr {
  jahr: number;
  miete: number;
  zins: number;
  tilgung: number;
  rest: number;
  steuereffekt: number;
  cfVor: number;
  cfNach: number;
}

export interface EinheitErgebnis {
  einheit: VergleichEinheit;
  kp: number;
  nk: number;
  darlehen: number;
  afaJahr: number;
  afaBasis: number;
  mieteSub: number;
  monat: { miete: number; garage: number; zins: number; tilgung: number; n: number; r: number; einnahmen: number; ausgaben: number; vor: number; ersparnis: number; nach: number };
  jahr: { miete: number; zins: number; n: number; afa: number; ergebnis: number; ersparnis: number };
  hausgeld: { u: number; n: number; summe: number; r: number; voraus: number; eigentuemer: number };
  luecke: number;
  lueckeQuote: number;
  qmPreis: number;
  mieteIstQm: number;
  miete30: number;
  tilgung36: number;
  steuer30: number;
  entw: Record<25 | 30 | 35, { wert: number; rest: number; erloes: number; zuzahlung: number; plus: number }>;
  reihe: Array<{ jahr: number; nach: number; wert: number; rest: number; zuz: number }>;
  nachMin: number;
  nachMax: number;
}

/** Wert im Jahr `startJahr + j`: linear vom Start bis zum Ziel im Zieljahr, danach konstant. */
function linear(start: number, ziel: number, j: number, a: VergleichAnnahmen): number {
  const n = Math.max(1, a.mieteZielJahr - a.startJahr);
  return start + ((ziel - start) * Math.min(j, n)) / n;
}

const JAHRE = 40;

export function rechneEinheit(e: VergleichEinheit, a: VergleichAnnahmen): EinheitErgebnis {
  const kp = e.kpWohnung + e.garageKp;
  const mieteSub = r2(e.mieteSubQm * e.qm);
  const nk = kp * a.knk;
  const darlehen = kp;
  const annuitaet = darlehen * (a.zins + a.tilgung);
  const afaJahr = kp * (1 + a.knk) * a.gebaeudeanteil * (1 / e.afaJahre);
  const m0 = mieteSub / e.qm;
  const garage1 = e.garageMiete1 * e.garagen;
  const garageZiel = e.garageMieteZiel * e.garagen;
  let rest = darlehen;
  let kosten = e.n * 12;
  let ruecklage = e.r * 12;
  const J: Jahr[] = [];
  for (let j = 1; j <= JAHRE; j++) {
    const mieteQm = linear(m0, a.mieteZielQm, j - 1, a);
    const garage = garage1 ? linear(garage1, garageZiel, j - 1, a) : 0;
    const miete = (mieteQm * e.qm + garage) * 12;
    const zins = rest * a.zins;
    const tilgung = Math.min(annuitaet - zins, rest);
    rest -= tilgung;
    // AfA endet nach der Restnutzungsdauer.
    const afa = j <= e.afaJahre ? afaJahr : 0;
    const steuereffekt = (zins + afa + kosten - miete) * a.steuer;
    const cfVor = miete - (zins + tilgung) - kosten - ruecklage;
    J.push({ jahr: j, miete, zins, tilgung, rest, steuereffekt, cfVor, cfNach: cfVor + steuereffekt });
    kosten *= 1 + a.kostenPa;
    ruecklage *= 1 + a.kostenPa;
  }
  const j1 = J[0];
  const m = { miete: mieteSub, garage: garage1, zins: j1.zins / 12, tilgung: j1.tilgung / 12, n: e.n, r: e.r, einnahmen: 0, ausgaben: 0, vor: 0, ersparnis: 0, nach: 0 };
  m.einnahmen = m.miete + m.garage;
  m.ausgaben = m.zins + m.tilgung + m.n + m.r;
  m.vor = m.einnahmen - m.ausgaben;
  // Jahreswerte auf Cent, damit die Herleitung im Dokument aufgeht.
  const jahr = { miete: r2(j1.miete), zins: r2(j1.zins), n: r2(e.n * 12), afa: r2(afaJahr), ergebnis: 0, ersparnis: 0 };
  jahr.ergebnis = jahr.miete - jahr.zins - jahr.n - jahr.afa;
  jahr.ersparnis = -jahr.ergebnis * a.steuer;
  m.ersparnis = jahr.ersparnis / 12;
  m.nach = m.vor + m.ersparnis;

  const wertNach = (y: number) => kp * (1 + a.wertPa) ** y;
  const zuzahlungBis = (y: number) => nk + J.slice(0, y).reduce((s, x) => s - x.cfNach, 0);
  const entw = {} as EinheitErgebnis["entw"];
  for (const y of [25, 30, 35] as const) {
    const wert = wertNach(y);
    const restY = J[y - 1].rest;
    const zuzahlung = zuzahlungBis(y);
    entw[y] = { wert, rest: restY, erloes: wert - restY, zuzahlung, plus: wert - restY - zuzahlung };
  }
  const luecke = mieteSub - e.mieteIst;
  const dreissig = J.slice(0, 30);
  return {
    einheit: e, kp, nk, darlehen, afaJahr, afaBasis: kp * (1 + a.knk) * a.gebaeudeanteil, mieteSub,
    monat: m, jahr,
    hausgeld: { u: e.u, n: e.n, summe: r2(e.u + e.n), r: e.r, voraus: r2(e.u + e.n + e.r), eigentuemer: r2(e.n + e.r) },
    luecke, lueckeQuote: mieteSub > 0 ? luecke / mieteSub : 0,
    qmPreis: e.kpWohnung / e.qm, mieteIstQm: e.mieteIst / e.qm,
    miete30: J[29].miete / 12,
    tilgung36: J.slice(0, 3).reduce((s, x) => s + x.tilgung, 0),
    steuer30: dreissig.reduce((s, x) => s + x.steuereffekt, 0),
    entw,
    reihe: J.slice(0, 35).map((x) => ({ jahr: x.jahr, nach: x.cfNach / 12, wert: wertNach(x.jahr), rest: x.rest, zuz: zuzahlungBis(x.jahr) })),
    nachMin: Math.min(...dreissig.map((x) => x.cfNach)) / 12,
    nachMax: Math.max(...dreissig.map((x) => x.cfNach)) / 12,
  };
}

// ---------------------------------------------------------------------------
// Kriterien für die Empfehlung (Seite 8)
// ---------------------------------------------------------------------------

export type Gewinner = "A" | "B" | "=";

export interface Kriterium { text: string; gewinner: Gewinner }

const besser = (a: number, b: number, kleinerBesser: boolean, toleranz = 0.005): Gewinner => {
  if (Math.abs(a - b) <= toleranz * Math.max(Math.abs(a), Math.abs(b), 1)) return "=";
  return (kleinerBesser ? a < b : a > b) ? "A" : "B";
};

/** Die Kriterien der Einhauser-Vorlage, gerechnet statt von Hand gesetzt. */
export function kriterien(A: EinheitErgebnis, B: EinheitErgebnis): Kriterium[] {
  const zimmer = besser(A.einheit.zimmer, B.einheit.zimmer, false, 0);
  return [
    { text: "Niedrige Monatsbelastung in den ersten Jahren", gewinner: besser(-A.monat.nach, -B.monat.nach, true) },
    { text: "Weniger Eigenkapital für Nebenkosten", gewinner: besser(A.nk, B.nk, true) },
    { text: "Kleinere Mietlücke, weniger Abhängigkeit von der Subvention", gewinner: besser(Math.max(0, A.lueckeQuote), Math.max(0, B.lueckeQuote), true) },
    { text: "Fläche und Preis je m²", gewinner: besser(A.qmPreis, B.qmPreis, true) },
    { text: zimmer === "=" ? "Zimmerzahl" : `${Math.max(A.einheit.zimmer, B.einheit.zimmer)} Zimmer: breitere Mieterschaft`, gewinner: zimmer },
    { text: "Höhere Tilgung, schnellerer Vermögensaufbau", gewinner: besser(A.monat.tilgung, B.monat.tilgung, false) },
    { text: "Erlös nach 30 Jahren", gewinner: besser(A.entw[30].erloes, B.entw[30].erloes, false) },
    { text: "Lage, Haus, Garage, Abschreibung", gewinner: "=" },
  ];
}

/** Die Einheit mit mehr Kriterienpunkten, bei Gleichstand die mit dem höheren Erlös. */
export function empfohlen(A: EinheitErgebnis, B: EinheitErgebnis): "A" | "B" {
  const k = kriterien(A, B);
  const a = k.filter((x) => x.gewinner === "A").length;
  const b = k.filter((x) => x.gewinner === "B").length;
  if (a !== b) return a > b ? "A" : "B";
  return A.entw[30].erloes >= B.entw[30].erloes ? "A" : "B";
}

// ---------------------------------------------------------------------------
// Gespeicherter Vergleich
// ---------------------------------------------------------------------------

export interface VergleichKunde {
  anrede: string;
  vorname: string;
  nachname: string;
  netto: number;
  bruttoJahr: number;
  steuerklasse: string;
  familienstand: string;
  kinder: string;
  beschaeftigung: string;
  antrag: string;
  wohnsituation: string;
  mieteWarm: number;
  lebenshaltung: number;
  /** Laufende Kredite als Text, z. B. „keine“ oder „1 Kredit, 249 € im Monat“. */
  kredite: string;
  kreditRaten: number;
  kapital: number;
  /** Jahre bis zur Rente, 0 = unbekannt. */
  jahreBisRente: number;
  saDatum: string;
}

export interface VergleichObjekt {
  objektId?: string;
  strasse: string;
  ortZeile: string;
  fotoTitel: string;
  fotoHaus: string;
  hausPunkte: string[];
  verwaltung: string;
  vergleichsmieteQm: number;
  vergleichsmieteQuelle: string;
  wirtschaftsplan: string;
}

export interface VergleichTexte {
  empfehlungTitel: string;
  empfehlung: string;
  wannAndere: string;
  naechsteSchritte: string[];
}

export interface KundenObjektvergleich {
  version: 1;
  /** Dokumentdatum JJJJ-MM-TT. */
  stand: string;
  kontaktId: string | null;
  investmentId: string | null;
  /** Zusatz im Titel und Dateinamen, z. B. „Kaufpreis angepasst“. */
  variante: string;
  kunde: VergleichKunde;
  objekt: VergleichObjekt;
  annahmen: VergleichAnnahmen;
  einheiten: VergleichEinheit[];
  /** Leer = automatisch aus den Kriterien. */
  texte: VergleichTexte;
}

export const LEERE_TEXTE: VergleichTexte = { empfehlungTitel: "", empfehlung: "", wannAndere: "", naechsteSchritte: [] };

export const STANDARD_SCHRITTE = [
  "Kurzes Gespräch: Ihre Prioritäten, gegebenenfalls Besichtigung",
  "Steuerbescheid oder Lohnsteuerbescheinigung nachreichen, wir rechnen exakt",
  "Finanzierung bei der Bank anfragen, Wohnung reservieren",
  "Gutachten zur Restnutzungsdauer einplanen; nach dem Lastenwechsel Freibetrag beim Finanzamt beantragen",
];

/** Gespeicherten Stand lesen: fehlende Felder mit Standardwerten auffüllen. */
export function vergleichAusJson(roh: unknown): KundenObjektvergleich | null {
  const v = roh as Partial<KundenObjektvergleich> | null;
  if (!v || v.version !== 1 || !Array.isArray(v.einheiten)) return null;
  return {
    ...(v as KundenObjektvergleich),
    annahmen: { ...STANDARD_ANNAHMEN, ...(v.annahmen || {}) },
    texte: { ...LEERE_TEXTE, ...(v.texte || {}) },
  };
}

/** Dateiname wie bei der Vorlage. */
export function vergleichDateiname(v: KundenObjektvergleich, datumDe: string): string {
  const wes = v.einheiten.map((e) => `WE ${e.nr}`).join(" und ");
  const name = v.kunde.nachname || "Kunde";
  const strasse = v.objekt.strasse.replace(/\s+\d.*$/, "") || "Objekt";
  const titel = v.einheiten.length > 1 ? "Objektvergleich" : "Objektrechnung";
  return `${titel} ${name} ${strasse} ${wes}${v.variante ? ` – ${v.variante}` : ""} (${datumDe}).pdf`.replace(/[/\\:*?"<>|]/g, "-");
}
