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
 *
 * Steuer (Christian, 09.11.2026): Ist ein zu versteuerndes Einkommen
 * angegeben und der Steuersatz „aus dem Einkommen“, rechnet die Vorlage die
 * Ersparnis genau als Differenz der Einkommensteuer nach Tarif 2026 ohne und
 * mit dem Ergebnis aus Vermietung (Splitting, Soli, Kirchensteuer). Sonst
 * gilt wie bisher der pauschale Satz, etwa 42 % wie im Exposé.
 */
import { einkommensteuerTarif2026, steuerprofil } from "./rechenkern";

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
  /** Nachrangdarlehen für die Kaufnebenkosten (Seite „Erspartes oder Nachrang“), wie im Investmentsheet Knoch. */
  nachrangZins: number;
  nachrangTilgung: number;
  /** Woher der Steuersatz kommt: pauschal wie im Exposé oder aus dem Einkommen des Kunden. */
  steuerArt?: "pauschal" | "einkommen";
  /** Zu versteuerndes Einkommen heute (bei Zusammenveranlagung beider Ehegatten), über die Laufzeit gleich. */
  zvE?: number;
  /** Zusammenveranlagung: Splittingtarif. */
  splitting?: boolean;
  /** Kirchensteuer in Prozent der Einkommensteuer, 0 = keine. */
  kirchensteuersatz?: number;
  /** Solidaritätszuschlag mitrechnen (Freigrenze beachtet), Standard ja. */
  mitSoli?: boolean;
  /** Kaufnebenkosten: aus Eigenkapital, ganz über Nachrang oder im Bankdarlehen (seit 09.11.2026). */
  nkFinanzierung?: "ek" | "nachrang" | "darlehen";
  /**
   * Darlehen laut Finanzierungsangebot der Bank (Christian, 12.11.2026, Angebot Baufi24 für Brück WE 1):
   * Bankdarlehen und Nachrangdarlehen in Euro. Ist eines gesetzt, gilt es statt `nkFinanzierung`;
   * ein fehlendes Bankdarlehen ist dann der Kaufpreis, der Rest bis Kaufpreis plus Nebenkosten ist Eigenkapital.
   */
  darlehenBetrag?: number;
  nachrangBetrag?: number;
}

export type Finanzierungsart = "ek" | "nachrang" | "darlehen" | "angebot";

/** Wie finanziert wird: laut Bankangebot, sobald dort ein Betrag steht, sonst nach `nkFinanzierung`. */
export function finanzierungsart(a: VergleichAnnahmen): Finanzierungsart {
  return (a.darlehenBetrag ?? 0) > 0 || (a.nachrangBetrag ?? 0) > 0 ? "angebot" : a.nkFinanzierung ?? "ek";
}

export const STANDARD_ANNAHMEN: VergleichAnnahmen = {
  steuer: 0.42, zins: 0.048, tilgung: 0.012, knk: 0.085, gebaeudeanteil: 0.8, wertPa: 0.02, kostenPa: 0.02,
  startJahr: 2026, mieteZielQm: 20, mieteZielJahr: 2060, kappung: 0.2, subventionMonate: 36, lastenwechselMonate: 5,
  nachrangZins: 0.071, nachrangTilgung: 0.02,
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
  /**
   * Möbel im Kaufpreis (seit dem 08.11.2026). Sie sind finanziert, tragen aber
   * keine Kaufnebenkosten und keine Gebäude-AfA. Fehlt die Angabe, 0.
   */
  moebel?: number;
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
  /** Kurzer Hinweis zum Kaufpreis, z. B. eingepreiste Kaufnebenkosten; erscheint überall beim Kaufpreis. */
  kpHinweis?: string;
  /** Ein Satz zur Wirkung des Kaufpreises (Seite 2 und 9). */
  kpErklaerung?: string;
  /** Basis der Wertentwicklung, wenn sie vom Kaufpreis abweicht (z. B. Grundpreis ohne eingepreiste Nebenkosten). */
  wertBasis?: number;
  /** Warum der Kunde keine Kaufnebenkosten trägt, z. B. „Ausgleich über Eigenprovisionsvereinbarung“ (mit knk = 0). */
  nkHinweis?: string;
  /** Zielmiete €/m² dieser Wohnung, sonst die der Annahmen (häuserübergreifend je Haus verschieden). */
  mieteZielQm?: number;
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
  nrRest: number;
  nz: number;
  nt: number;
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
  ek: number;
  nrBetrag: number;
  monat: { miete: number; garage: number; zins: number; tilgung: number; nzins: number; ntilg: number; n: number; r: number; einnahmen: number; ausgaben: number; vor: number; ersparnis: number; nach: number };
  jahr: { miete: number; zins: number; nzins: number; n: number; afa: number; ergebnis: number; ersparnis: number };
  hausgeld: { u: number; n: number; summe: number; r: number; voraus: number; eigentuemer: number };
  luecke: number;
  lueckeQuote: number;
  qmPreis: number;
  mieteIstQm: number;
  miete30: number;
  tilgung36: number;
  steuer30: number;
  entw: Record<number, { wert: number; rest: number; erloes: number; zuzahlung: number; plus: number }>;
  afaEnde: number;
  /** Wirksamer Satz im 1. Jahr: Ersparnis ÷ Verlust (pauschal = der Satz). */
  satzWirksam: number;
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

/** Genau nach Tarif: Satz „aus dem Einkommen“ und ein zvE angegeben. */
export const genauGerechnet = (a: VergleichAnnahmen) => a.steuerArt === "einkommen" && (a.zvE ?? 0) > 0;

/** Einkommensteuer mit Soli und Kirchensteuer für ein zvE nach Tarif 2026. */
export function steuerGesamt(zvE: number, a: VergleichAnnahmen): number {
  return steuerprofil(Math.max(0, zvE), !!a.splitting, a.kirchensteuersatz ?? 0, a.mitSoli ?? true).totalTax;
}

/**
 * Steuerersparnis für ein Ergebnis aus Vermietung (Verlust negativ):
 * genau ESt(zvE) − ESt(zvE + Ergebnis), sonst Verlust × pauschaler Satz.
 * Ein Gewinn ergibt eine negative Ersparnis, also mehr Steuer.
 */
export function steuerErsparnis(ergebnis: number, a: VergleichAnnahmen): number {
  if (!genauGerechnet(a)) return -ergebnis * a.steuer;
  return steuerGesamt(a.zvE!, a) - steuerGesamt(a.zvE! + ergebnis, a);
}

/**
 * Grenzsteuersatz der Einkommensteuer 2026 als Ableitung der Tarifformel
 * (§ 32a EStG, Zonen wie `einkommensteuerTarif2026`). Der Differenzenquotient
 * über 100 € ist wegen der Abrundungen zu grob (Beispiel: 26 % statt 26,73 %).
 */
function grenzsatzGrundtabelle(x: number): number {
  if (x <= 12348) return 0;
  if (x <= 17799) return (2 * 914.51 * (x - 12348) / 1e4 + 1400) / 1e4;
  if (x <= 69878) return (2 * 173.1 * (x - 17799) / 1e4 + 2397) / 1e4;
  return x <= 277825 ? 0.42 : 0.45;
}

/** Grenzsteuersatz beim heutigen zvE (Splitting: an der Hälfte), mit Soli und Kirchensteuer; sonst der pauschale Satz. */
export function grenzsatz(a: VergleichAnnahmen): number {
  if (!genauGerechnet(a)) return a.steuer;
  const zvE = Math.floor(a.zvE!);
  const est = grenzsatzGrundtabelle(a.splitting ? Math.floor(zvE / 2) : zvE);
  const steuer = einkommensteuerTarif2026(zvE, !!a.splitting);
  const freigrenze = a.splitting ? 40700 : 20350;
  // Soli: unter der Freigrenze 0, in der Milderungszone 11,9 %, darüber 5,5 % der Einkommensteuer.
  const soli = !(a.mitSoli ?? true) || steuer <= freigrenze ? 0 : (steuer - freigrenze) * 0.119 < steuer * 0.055 ? 0.119 : 0.055;
  return est * (1 + soli + (a.kirchensteuersatz ?? 0) / 100);
}

/** Kindergeld oder Kinderfreibetrag (Günstigerprüfung, Werte 2026). */
export const KINDERGELD_2026_MONAT = 259;
/** Kinderfreibetrag plus Freibetrag für Betreuung, Erziehung, Ausbildung je Kind und Elternteil 2026. */
export const KINDERFREIBETRAG_2026_JE_ELTERNTEIL = 3414 + 1464;
export function guenstigerpruefung(kinder: number, a: VergleichAnnahmen): { kindergeld: number; freibetragErsparnis: number; kindergeldBesser: boolean } | null {
  if (!genauGerechnet(a) || kinder <= 0) return null;
  const freibetrag = kinder * KINDERFREIBETRAG_2026_JE_ELTERNTEIL * (a.splitting ? 2 : 1);
  const kindergeld = kinder * KINDERGELD_2026_MONAT * 12;
  const freibetragErsparnis = steuerGesamt(a.zvE!, a) - steuerGesamt(a.zvE! - freibetrag, a);
  return { kindergeld, freibetragErsparnis, kindergeldBesser: kindergeld >= freibetragErsparnis };
}

export function rechneEinheit(e: VergleichEinheit, a: VergleichAnnahmen): EinheitErgebnis {
  const kp = e.kpWohnung + e.garageKp;
  const mieteSub = r2(e.mieteSubQm * e.qm);
  // Kaufnebenkosten und Gebäude-AfA ohne Möbel; das Darlehen deckt den ganzen Kaufpreis.
  const kpOhneMoebel = kp - Math.min(kp, Math.max(0, e.moebel ?? 0));
  const nk = kpOhneMoebel * a.knk;
  const art = finanzierungsart(a);
  const darlehen = art === "angebot" ? ((a.darlehenBetrag ?? 0) > 0 ? a.darlehenBetrag! : kp) : art === "darlehen" ? kp + nk : kp;
  const nrBetrag = art === "angebot" ? Math.max(0, a.nachrangBetrag ?? 0) : art === "nachrang" ? nk : 0;
  // Beim Bankangebot ist Eigenkapital, was Kaufpreis und Nebenkosten nach beiden Darlehen offen lassen.
  // Unter 1 € ist Rundung des Angebots (Nebenkosten 12.282,50 €, Darlehen auf volle Euro), kein Eigenkapital.
  const offen = kp + nk - darlehen - nrBetrag;
  const ek = art === "angebot" ? (offen < 1 ? 0 : offen) : art === "ek" ? nk : 0;
  const nrAnnuitaet = nrBetrag * (a.nachrangZins + a.nachrangTilgung);
  let nrRest = nrBetrag;
  const annuitaet = darlehen * (a.zins + a.tilgung);
  const afaBasis = kpOhneMoebel * (1 + a.knk) * a.gebaeudeanteil;
  const afaJahr = afaBasis * (1 / e.afaJahre);
  const m0 = mieteSub / e.qm;
  const garage1 = e.garageMiete1 * e.garagen;
  const garageZiel = e.garageMieteZiel * e.garagen;
  let rest = darlehen;
  let kosten = e.n * 12;
  let ruecklage = e.r * 12;
  const J: Jahr[] = [];
  for (let j = 1; j <= JAHRE; j++) {
    const mieteQm = linear(m0, e.mieteZielQm || a.mieteZielQm, j - 1, a);
    const garage = garage1 ? linear(garage1, garageZiel, j - 1, a) : 0;
    const miete = (mieteQm * e.qm + garage) * 12;
    const zins = rest * a.zins;
    const tilgung = Math.min(annuitaet - zins, rest);
    rest -= tilgung;
    const nz = nrRest * a.nachrangZins;
    const nt = Math.min(Math.max(0, nrAnnuitaet - nz), nrRest);
    nrRest -= nt;
    // AfA endet nach der Restnutzungsdauer, bei 31,25 Jahren (3,2 %) mit einem Viertel im 32. Jahr.
    const afa = afaJahr * Math.min(1, Math.max(0, e.afaJahre - (j - 1)));
    const steuereffekt = steuerErsparnis(miete - zins - nz - afa - kosten, a);
    const cfVor = miete - (zins + tilgung) - (nz + nt) - kosten - ruecklage;
    J.push({ jahr: j, miete, zins, tilgung, rest, nrRest, nz, nt, steuereffekt, cfVor, cfNach: cfVor + steuereffekt });
    kosten *= 1 + a.kostenPa;
    ruecklage *= 1 + a.kostenPa;
  }
  const j1 = J[0];
  const m = { miete: mieteSub, garage: garage1, zins: j1.zins / 12, tilgung: j1.tilgung / 12, nzins: j1.nz / 12, ntilg: j1.nt / 12, n: e.n, r: e.r, einnahmen: 0, ausgaben: 0, vor: 0, ersparnis: 0, nach: 0 };
  m.einnahmen = m.miete + m.garage;
  m.ausgaben = m.zins + m.tilgung + m.nzins + m.ntilg + m.n + m.r;
  m.vor = m.einnahmen - m.ausgaben;
  // Jahreswerte auf Cent, damit die Herleitung im Dokument aufgeht.
  const jahr = { miete: r2(j1.miete), zins: r2(j1.zins), nzins: r2(j1.nz), n: r2(e.n * 12), afa: r2(afaJahr), ergebnis: 0, ersparnis: 0 };
  jahr.ergebnis = jahr.miete - jahr.zins - jahr.nzins - jahr.n - jahr.afa;
  jahr.ersparnis = steuerErsparnis(jahr.ergebnis, a);
  m.ersparnis = jahr.ersparnis / 12;
  m.nach = m.vor + m.ersparnis;

  const wertNach = (y: number) => (e.wertBasis || kp) * (1 + a.wertPa) ** y;
  const zuzahlungBis = (y: number) => ek + J.slice(0, y).reduce((s, x) => s - x.cfNach, 0);
  const entw = {} as EinheitErgebnis["entw"];
  const afaEnde = Math.ceil(e.afaJahre);
  for (const y of [10, afaEnde, 25, 30, 35].filter((y) => y >= 1 && y <= JAHRE)) {
    const wert = wertNach(y);
    const restY = J[y - 1].rest + J[y - 1].nrRest;
    const zuzahlung = zuzahlungBis(y);
    entw[y] = { wert, rest: restY, erloes: wert - restY, zuzahlung, plus: wert - restY - zuzahlung };
  }
  const luecke = mieteSub - e.mieteIst;
  const dreissig = J.slice(0, 30);
  return {
    einheit: e, kp, nk, ek, nrBetrag, darlehen, afaJahr, afaBasis, mieteSub, afaEnde,
    satzWirksam: genauGerechnet(a) && jahr.ergebnis < 0 ? jahr.ersparnis / -jahr.ergebnis : a.steuer,
    monat: m, jahr,
    hausgeld: { u: e.u, n: e.n, summe: r2(e.u + e.n), r: e.r, voraus: r2(e.u + e.n + e.r), eigentuemer: r2(e.n + e.r) },
    luecke, lueckeQuote: mieteSub > 0 ? luecke / mieteSub : 0,
    qmPreis: e.kpWohnung / e.qm, mieteIstQm: e.mieteIst / e.qm,
    miete30: J[29].miete / 12,
    tilgung36: J.slice(0, 3).reduce((s, x) => s + x.tilgung, 0),
    steuer30: dreissig.reduce((s, x) => s + x.steuereffekt, 0),
    entw,
    reihe: J.slice(0, 35).map((x) => ({ jahr: x.jahr, nach: x.cfNach / 12, wert: wertNach(x.jahr), rest: x.rest + x.nrRest, zuz: zuzahlungBis(x.jahr) })),
    nachMin: Math.min(...dreissig.map((x) => x.cfNach)) / 12,
    nachMax: Math.max(...dreissig.map((x) => x.cfNach)) / 12,
  };
}

// ---------------------------------------------------------------------------
// Kaufnebenkosten über ein Nachrangdarlehen (Christian, 28.10.2026, wie Knoch)
// ---------------------------------------------------------------------------

export interface NachrangFall {
  nr: number;
  ek: number;
  bank: number;
  rate: number;
  vor: number;
  ersparnis: number;
  nach: number;
  jahre: number;
  zinsenNetto: number;
}

/**
 * Die Varianten der Nachrangseite: Kaufnebenkosten selbst bezahlt (0) oder
 * ganz über das Nachrangdarlehen (1). Die halbe Variante entfällt
 * grundsätzlich (Christian, 09.11.2026).
 */
export const NACHRANG_STUFEN = [0, 1] as const;

/** Monat 1, wenn `anteil` der Kaufnebenkosten über ein Nachrangdarlehen läuft; dessen Zinsen sind absetzbar. */
export function nachrangFall(e: EinheitErgebnis, anteil: number, a: VergleichAnnahmen): NachrangFall {
  const nr = Math.round(e.nk * anteil);
  const nz = (nr * a.nachrangZins) / 12, nt = (nr * a.nachrangTilgung) / 12;
  const ergebnis = e.jahr.ergebnis - r2(nr * a.nachrangZins);
  const ersparnis = steuerErsparnis(ergebnis, a) / 12;
  const vor = e.monat.vor - nz - nt;
  // Laufzeit und Zinsen, jährlich verrechnet wie der Bankkredit.
  let rest = nr, jahre = 0, zinsen = 0;
  while (rest > 0.005 && jahre < 60) {
    const z = rest * a.nachrangZins;
    zinsen += z;
    rest -= Math.min(nr * (a.nachrangZins + a.nachrangTilgung) - z, rest);
    jahre++;
  }
  return { nr, ek: e.nk - nr, bank: e.monat.zins + e.monat.tilgung, rate: nz + nt, vor, ersparnis, nach: vor + ersparnis, jahre, zinsenNetto: zinsen * (1 - e.satzWirksam) };
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

/**
 * Die Kriterien der Einhauser-Vorlage, gerechnet statt von Hand gesetzt.
 * Häuserübergreifend fällt „Lage, Haus …“ weg: Das ist dann eine persönliche
 * Abwägung und kein Gleichstand.
 */
export function kriterien(A: EinheitErgebnis, B: EinheitErgebnis, gleichesHaus = true): Kriterium[] {
  const zimmer = besser(A.einheit.zimmer, B.einheit.zimmer, false, 0);
  return [
    { text: "Niedrige Monatsbelastung in den ersten Jahren", gewinner: besser(-A.monat.nach, -B.monat.nach, true) },
    { text: "Weniger Eigenkapital für Nebenkosten", gewinner: besser(A.nk, B.nk, true) },
    { text: "Kleinere Mietlücke, weniger Abhängigkeit von der Subvention", gewinner: besser(Math.max(0, A.lueckeQuote), Math.max(0, B.lueckeQuote), true) },
    { text: "Fläche und Preis je m²", gewinner: besser(A.qmPreis, B.qmPreis, true) },
    { text: zimmer === "=" ? "Zimmerzahl" : `${Math.max(A.einheit.zimmer, B.einheit.zimmer)} Zimmer: breitere Mieterschaft`, gewinner: zimmer },
    { text: "Höhere Tilgung, schnellerer Vermögensaufbau", gewinner: besser(A.monat.tilgung, B.monat.tilgung, false) },
    { text: "Erlös nach 30 Jahren", gewinner: besser(A.entw[30].erloes, B.entw[30].erloes, false) },
    ...(gleichesHaus ? [{ text: "Lage, Haus, Garage, Abschreibung", gewinner: "=" as Gewinner }] : []),
  ];
}

/** Die Einheit mit mehr Kriterienpunkten, bei Gleichstand die mit dem höheren Erlös. */
export function empfohlen(A: EinheitErgebnis, B: EinheitErgebnis, gleichesHaus = true): "A" | "B" {
  const k = kriterien(A, B, gleichesHaus);
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
  /** Brutto des Ehepartners im Jahr, 0 = ohne eigenes Einkommen bzw. unbekannt. */
  bruttoPartner?: number;
  steuerklasse: string;
  steuerklassePartner?: string;
  /** Eigener Satz zur Veranlagung auf Seite 2, z. B. „Gerechnet als Einzelveranlagung (Grundtarif), auf Wunsch so angesetzt“. */
  veranlagungHinweis?: string;
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
  /** Haus der Wohnung A (und B, solange `objekt2` fehlt). */
  objekt: VergleichObjekt;
  /** Haus der Wohnung B, nur häuserübergreifend (28.10.2026). */
  objekt2?: VergleichObjekt | null;
  annahmen: VergleichAnnahmen;
  einheiten: VergleichEinheit[];
  /** Leer = automatisch aus den Kriterien. */
  texte: VergleichTexte;
  /**
   * Nur die ausführliche Berechnung des Investmentrechners (29.10.2026): Angaben
   * für das Deckblatt im Stil der System-PDFs statt des Fotodeckblatts.
   */
  dokument?: { titel: string; adresse: string; typ: string; version: string; erstelltVon?: string };
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

/** Das Haus der Wohnung `i` (0 = A, 1 = B). */
export function objektVon(v: Pick<KundenObjektvergleich, "objekt" | "objekt2">, i: number): VergleichObjekt {
  return i === 1 && v.objekt2 ? v.objekt2 : v.objekt;
}

export const haeuseruebergreifend = (v: Pick<KundenObjektvergleich, "objekt2">) => !!v.objekt2;

const strasseOhneNr = (o: VergleichObjekt) => o.strasse.replace(/\s+\d.*$/, "") || "Objekt";

/** Dateiname wie bei der Vorlage; häuserübergreifend mit beiden Straßen. */
export function vergleichDateiname(v: KundenObjektvergleich, datumDe: string): string {
  const name = v.kunde.nachname || "Kunde";
  const titel = v.einheiten.length > 1 ? "Objektvergleich" : "Objektrechnung";
  const was = haeuseruebergreifend(v)
    ? v.einheiten.map((e, i) => `${strasseOhneNr(objektVon(v, i))} WE ${e.nr}`).join(" und ")
    : `${strasseOhneNr(v.objekt)} ${v.einheiten.map((e) => `WE ${e.nr}`).join(" und ")}`;
  return `${titel} ${name} ${was}${v.variante ? ` \u2013 ${v.variante}` : ""} (${datumDe}).pdf`.replace(/[/\\:*?"<>|]/g, "-");
}
