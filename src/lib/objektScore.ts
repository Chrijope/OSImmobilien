import type { AnlageKonzept } from "@/lib/anlageZiele";
import { zielNachId } from "@/lib/anlageZiele";
import { dez, eur0 } from "@/lib/objektKennzahlen";
import type { Rahmen } from "@/lib/einheitEmpfehlung";

const rahmenMitte = (r: Rahmen) => (r.von + r.bis) / 2;

/**
 * Der Objektscore: wie gut eine freie Einheit zu einem Kunden passt, 0 bis 100.
 *
 * Christian hat die Strategie am 04.10.2026 freigegeben. Der Score ist eine
 * INTERNE SORTIERHILFE für Berater und Verwaltung. Er wird nur zur Anzeige
 * gerechnet, nirgends gespeichert, steht in keiner Adresse und geht weder an
 * den OS Lotsen noch an eine KI. Er erscheint nie dort, wo ein Kunde
 * hinsieht: Exposé, Kundenlink, Portal, PDF, Mails, Kundenansicht.
 *
 * Diese Datei ist die reine Rechenregel: keine Datenbank, kein
 * Zwischenspeicher. Die Zahlen bereitet `objektScoreDaten.ts` aus Objekt,
 * Einheit, Selbstauskunft und Rechenkern vor.
 *
 * NEUN BAUSTEINE, je 0 bis 100
 *
 *   B1 rahmen      Lage des Preises im Finanzierungsrahmen
 *   B2 belastung   Eigenanteil im Monat gegen den Überschuss der Selbstauskunft
 *   B3 steuer      Steuerwirkung in zehn Jahren je 100.000 € Kaufpreis
 *   B4 ertrag      Rendite wie im CRM (Jahreskaltmiete durch Kaufpreis)
 *   B5 vermoegen   Vermögen je eingesetztem Euro nach zehn Jahren (1 € 0, 4 € 100)
 *   B6 substanz    Baujahr, Sanierung, Energieklasse
 *   B7 mikrolage   ÖPNV, Einkauf, Ärzte, Schule oder Kita im Umkreis von 1 km
 *   B8 naehe       Entfernung zum Wohnort
 *   B9 konzept     Konzept des Objekts passt zum Ziel
 *
 * Der Score ist der gewichtete Mittelwert der vorhandenen Bausteine, gerundet.
 * Ein fehlender Baustein zählt nie als 0, er fällt aus dem Mittel heraus.
 */

export type BausteinId =
  | "rahmen" | "belastung" | "steuer" | "ertrag" | "vermoegen"
  | "substanz" | "mikrolage" | "naehe" | "konzept";

export const BAUSTEIN_REIHENFOLGE: BausteinId[] = [
  "rahmen", "belastung", "steuer", "vermoegen", "ertrag", "substanz", "mikrolage", "naehe", "konzept",
];

export const BAUSTEIN_NAME: Record<BausteinId, string> = {
  rahmen: "Rahmen",
  belastung: "Monatliche Belastung",
  steuer: "Steuerwirkung",
  vermoegen: "Vermögensaufbau",
  ertrag: "Ertrag",
  substanz: "Substanz",
  mikrolage: "Lage (Mikrolage)",
  naehe: "Nähe zum Wohnort",
  konzept: "Konzept passt zum Ziel",
};

// ── Gewichte ────────────────────────────────────────────────────────────

/** Fest, unabhängig vom Ziel: zusammen 50. */
export const FESTE_GEWICHTE: Partial<Record<BausteinId, number>> = { rahmen: 15, belastung: 15, mikrolage: 10, naehe: 10 };

/**
 * Die übrigen 50 nach Ziel, Schlüssel wie in `anlageZiele.ts`. Bei zwei oder
 * drei Zielen gilt der Durchschnitt der Zeilen. Ohne Ziel der Durchschnitt
 * aller Zeilen, damit kein Ziel bevorzugt wird.
 */
export const ZIEL_GEWICHTE: Record<string, Partial<Record<BausteinId, number>>> = {
  steuer: { steuer: 30, vermoegen: 10, konzept: 10 },
  vermoegen: { steuer: 5, vermoegen: 25, substanz: 10, konzept: 10 },
  inflation: { vermoegen: 20, substanz: 20, konzept: 10 },
  freiheit: { ertrag: 30, vermoegen: 10, konzept: 10 },
  portfolio: { ertrag: 20, vermoegen: 20, konzept: 10 },
  eigenheim: { ertrag: 20, vermoegen: 20, konzept: 10 },
  rente: { vermoegen: 15, substanz: 25, konzept: 10 },
  kinder: { vermoegen: 20, substanz: 20, konzept: 10 },
  fremdkapital: { steuer: 15, ertrag: 15, konzept: 20 },
};

/** Nur bekannte Ziele, höchstens drei, ohne Doppelte. */
export function gueltigeZiele(ziele: unknown): string[] {
  if (!Array.isArray(ziele)) return [];
  return [...new Set(ziele.filter((z): z is string => typeof z === "string" && z in ZIEL_GEWICHTE))].slice(0, 3);
}

export function gewichteFuerZiele(ziele: string[]): Record<BausteinId, number> {
  const zeilen = (ziele.length ? ziele : Object.keys(ZIEL_GEWICHTE)).map((z) => ZIEL_GEWICHTE[z]);
  const g = {} as Record<BausteinId, number>;
  for (const id of BAUSTEIN_REIHENFOLGE) {
    const variabel = zeilen.reduce((s, z) => s + (z[id] ?? 0), 0) / zeilen.length;
    g[id] = (FESTE_GEWICHTE[id] ?? 0) + variabel;
  }
  return g;
}

// ── Schwellen ───────────────────────────────────────────────────────────

/** B1: bis 60 % der Spanne volle Punkte, an der Obergrenze noch 50. */
export const RAHMEN_VOLL_BIS = 0.6;
export const RAHMEN_AN_DER_GRENZE = 50;
/** B2: Eigenanteil in Prozent des Überschusses, bis 15 % volle Punkte, ab 60 % keine. */
export const BELASTUNG_VOLL_BIS = 0.15;
export const BELASTUNG_NULL_AB = 0.6;
/** B3: Steuerwirkung in zehn Jahren je 100.000 € Kaufpreis, ab 25.000 € volle Punkte. */
export const STEUER_VOLL_AB = 25000;
/** B4: Rendite in Prozent. */
export const RENDITE_NULL_BIS = 3.0;
export const RENDITE_VOLL_AB = 5.5;
/**
 * B5: was aus jedem eingesetzten Euro in zehn Jahren wird (`faktorJeEuro`
 * des Rechenkerns: Vermögenszuwachs durch Eigenkapital plus Zuzahlungen).
 * Unter 1 € ist nichts gewonnen, also 0 Punkte. Ab 4 € volle Punkte: Mit den
 * Standardannahmen des Rechners (Eigenkapital in Höhe der Kaufnebenkosten,
 * 1,5 % Tilgung, 1,5 % Wertsteigerung) lagen Probewohnungen am 04.10.2026
 * zwischen 1,9 € (Neubau, hoher Preis je Miete) und 4,0 € (günstiger
 * Bestand, Eigenanteil nahe null). Eine gewöhnliche vermietete Wohnung
 * landet damit um 50 Punkte.
 */
export const VERMOEGEN_NULL_BIS = 1;
export const VERMOEGEN_VOLL_AB = 4;
/** B7: Umkreis der Mikrolage in Metern. */
export const MIKROLAGE_UMKREIS_M = 1000;
/** B8: bis 50 km volle Punkte, ab 250 km noch 20. */
export const NAEHE_VOLL_BIS_KM = 50;
export const NAEHE_MIN_AB_KM = 250;
export const NAEHE_MIN = 20;
/** B9: passt das Konzept zum Ziel, 100, sonst 30. */
export const KONZEPT_PASST = 100;
export const KONZEPT_PASST_NICHT = 30;
/** Deckel, wenn das Eigenkapital die Kaufnebenkosten nicht deckt. */
export const DECKEL_OHNE_NEBENKOSTEN = 59;
/** Ab welchem Anteil fehlender Gewichte der Score als Teilwert gilt. */
export const TEILWERT_AB_FEHLENDEM_GEWICHT = 25;
/** „Warum": ein Abzug, wenn ein Baustein mit mindestens so viel Gewicht unter dieser Marke liegt. */
export const ABZUG_GEWICHT_AB = 10;
export const ABZUG_UNTER = 40;

/** Linear zwischen zwei Punkten, außerhalb festgehalten. */
function linear(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x <= x0) return y0;
  if (x >= x1) return y1;
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// ── Eingaben ────────────────────────────────────────────────────────────

/** Was vom Kunden gebraucht wird, einmal je Kunde vorbereitet. */
export interface ScoreKunde {
  rahmen: Rahmen | null;
  /** Monatlicher Überschuss laut Selbstauskunft. */
  ueberschussMonat: number | null;
  /** Eigenkapital laut Selbstauskunft. */
  eigenkapital: number | null;
  ziele: string[];
}

/** Die Ergebnisse des Rechenkerns für Einheit und Kunde, oder null, wenn nicht zu rechnen. */
export interface ScoreRechnung {
  eigenanteilMonat: number;
  /** Summe der Steuerwirkung über die Prognose (zehn Jahre); null ohne Einkommen. */
  steuerwirkung: number | null;
  grenzsteuersatz: number | null;
  faktorJeEuro: number;
  /** Eigenkapital plus Zuzahlungen; 0 heißt: kein Einsatz, nichts zu bewerten. */
  einsatz: number;
  kaufnebenkosten: number;
}

/** Was von der Einheit gebraucht wird, einmal je Einheit vorbereitet. */
export interface ScoreEinheit {
  schluessel: string;
  objektId: string;
  /** Gesamtkosten wie im Rahmenvergleich (`EmpfehlungsKandidat.gesamtkosten`). */
  gesamtkosten: number;
  kaufpreis: number;
  passt: boolean;
  rendite: number;
  entfernungKm: number | null;
  baujahr?: number;
  energieklasse?: string;
  /** Jahr der letzten Sanierung, sofern bekannt. */
  saniertJahr?: number;
  neubau: boolean;
  /** Welche Kategorien der Mikrolage im Umkreis liegen; null, wenn nicht gemessen. */
  mikrolage: { oepnv: boolean; einkauf: boolean; aerzte: boolean; schule: boolean } | null;
  konzept?: AnlageKonzept;
  /** Die AfA wie im Investmentrechner, etwa „lineare AfA 2 %“, für die Begründung. */
  afaText: string;
}

// ── Ergebnis ────────────────────────────────────────────────────────────

export interface BausteinWert {
  id: BausteinId;
  /** 0 bis 100, null wenn die Angabe fehlt. */
  wert: number | null;
  gewicht: number;
  /** Mit konkreter Zahl, für „Warum?“. */
  text: string;
  /** Kurz, für die Ein-Satz-Begründung. */
  kurz: string;
  /** Warum der Baustein fehlt. */
  fehlt?: string;
  /** Steht im Balken neben dem Namen, etwa „Rendite 4,1 %“. */
  zusatz?: string;
}

export interface Grund {
  art: "plus" | "minus";
  text: string;
}

export type KeinScoreGrund = "kein_rahmen" | "ausserhalb_rahmen" | "belastung_fehlt";

export interface ObjektScore {
  /** null heißt „n. b.“: nicht bewertet. */
  wert: number | null;
  keinScore?: KeinScoreGrund;
  teilwert: boolean;
  /** Ohne Deckel, für die Begründung. */
  ungedeckelt: number | null;
  gedeckelt: boolean;
  /** Der Warnchip, etwa „Eigenkapital deckt die Kaufnebenkosten nicht“. */
  warnung?: string;
  bausteine: BausteinWert[];
  gruende: Grund[];
  satz: string;
  hauptgrund: string;
  /** Welche Bausteine fehlen, mit Grund, für den Fuß von „Warum?“. */
  fehltText: string;
  /** Für die Rangfolge bei Gleichstand. */
  entfernungKm: number | null;
  abstandRahmenmitte: number;
}

const KONZEPT_NAME: Record<AnlageKonzept, string> = { bestand: "Bestand", wg: "WG", kfw: "Neubau" };

function zielNamen(ziele: string[]): string {
  return ziele.map((z) => zielNachId(z)?.kurz).filter(Boolean).join(", ");
}

/** „ÖPNV, Einkauf und Ärzte“. */
function aufzaehlung(teile: string[]): string {
  if (teile.length <= 1) return teile.join("");
  return `${teile.slice(0, -1).join(", ")} und ${teile[teile.length - 1]}`;
}

const rund = (n: number) => Math.round(n);
const eurRund = (n: number, auf = 10) => eur0(Math.round(n / auf) * auf);

function bausteinRahmen(e: ScoreEinheit, k: ScoreKunde): Omit<BausteinWert, "gewicht"> {
  const r = k.rahmen as Rahmen;
  const spanne = r.bis - r.von;
  const lage = spanne > 0 ? (e.gesamtkosten - r.von) / spanne : 0;
  const wert = linear(lage, RAHMEN_VOLL_BIS, 100, 1, RAHMEN_AN_DER_GRENZE);
  const prozentSpanne = rund(Math.max(0, Math.min(1, lage)) * 100);
  return {
    id: "rahmen", wert,
    text: wert >= 90
      ? `Preis bei ${prozentSpanne} % der Rahmenspanne, genug Puffer nach oben.`
      : `Preis bei ${prozentSpanne} % der Rahmenspanne, nahe der Obergrenze, wenig Puffer.`,
    kurz: wert >= 90 ? "Preis mit Puffer im Rahmen" : "Preis nahe der Rahmenobergrenze",
  };
}

function bausteinBelastung(rechnung: ScoreRechnung | null, k: ScoreKunde): Omit<BausteinWert, "gewicht"> {
  const ueberschuss = k.ueberschussMonat ?? 0;
  if (!rechnung) return { id: "belastung", wert: null, text: "", kurz: "", fehlt: "Kaufpreis oder Miete fehlen, keine Rechnung möglich" };
  if (!(ueberschuss > 0)) return { id: "belastung", wert: null, text: "", kurz: "", fehlt: "kein Überschuss in der Selbstauskunft" };
  const eigen = rechnung.eigenanteilMonat;
  if (eigen <= 0) {
    return { id: "belastung", wert: 100, text: "Trägt sich selbst: im ersten Jahr kein Eigenanteil im Monat.", kurz: "trägt sich ohne Eigenanteil" };
  }
  const anteil = eigen / ueberschuss;
  const wert = linear(anteil, BELASTUNG_VOLL_BIS, 100, BELASTUNG_NULL_AB, 0);
  const p = rund(anteil * 100);
  return {
    id: "belastung", wert,
    text: wert >= 50
      ? `Tragbar: Eigenanteil rund ${eurRund(eigen)} im Monat, ${p} % des Überschusses aus der Selbstauskunft.`
      : `Eigenanteil rund ${eurRund(eigen)} im Monat, ${p} % des Überschusses.`,
    kurz: `Eigenanteil rund ${p} % des Monatsüberschusses`,
  };
}

function bausteinSteuer(rechnung: ScoreRechnung | null, e: ScoreEinheit): Omit<BausteinWert, "gewicht"> {
  if (!rechnung) return { id: "steuer", wert: null, text: "", kurz: "", fehlt: "keine Rechnung möglich" };
  if (rechnung.steuerwirkung === null) return { id: "steuer", wert: null, text: "", kurz: "", fehlt: "Jahresbrutto fehlt, Steuerwirkung nicht bewertet" };
  if (!(e.kaufpreis > 0)) return { id: "steuer", wert: null, text: "", kurz: "", fehlt: "Kaufpreis fehlt" };
  const je100k = (rechnung.steuerwirkung / e.kaufpreis) * 100000;
  const wert = linear(je100k, 0, 0, STEUER_VOLL_AB, 100);
  const afa = e.afaText ? `${e.afaText}, ` : "";
  const satz = rechnung.grenzsteuersatz ? `beim Grenzsteuersatz rund ${rund(rechnung.grenzsteuersatz * 100)} % ` : "";
  const betrag = rechnung.steuerwirkung > 0 ? `etwa ${eurRund(rechnung.steuerwirkung, 500)}` : "keine Entlastung";
  return {
    id: "steuer", wert,
    text: `${wert >= 50 ? "Steuerwirkung stark" : "Geringe Steuerwirkung"}: ${afa}${satz}${betrag} in zehn Jahren.`,
    kurz: rechnung.steuerwirkung > 0 ? `Steuerwirkung etwa ${eurRund(rechnung.steuerwirkung, 500)} in zehn Jahren` : "keine Steuerentlastung",
  };
}

function bausteinVermoegen(rechnung: ScoreRechnung | null): Omit<BausteinWert, "gewicht"> {
  if (!rechnung || !(rechnung.einsatz > 0)) return { id: "vermoegen", wert: null, text: "", kurz: "", fehlt: "keine Rechnung möglich" };
  const f = rechnung.faktorJeEuro;
  const wert = linear(f, VERMOEGEN_NULL_BIS, 0, VERMOEGEN_VOLL_AB, 100);
  return {
    id: "vermoegen", wert,
    text: `Vermögensaufbau: aus jedem eingesetzten Euro werden in zehn Jahren rund ${dez(f, 1)} €.`,
    kurz: `rund ${dez(f, 1)} € Vermögen je eingesetztem Euro`,
  };
}

function bausteinErtrag(e: ScoreEinheit): Omit<BausteinWert, "gewicht"> {
  if (!(e.rendite > 0)) return { id: "ertrag", wert: null, text: "", kurz: "", fehlt: "Miete oder Kaufpreis fehlen" };
  const wert = linear(e.rendite, RENDITE_NULL_BIS, 0, RENDITE_VOLL_AB, 100);
  const r = dez(e.rendite, 1);
  return {
    id: "ertrag", wert, zusatz: `Rendite ${r} %`,
    text: wert >= 50 ? `Ertrag: Rendite ${r} %.` : `Rendite nur ${r} %.`,
    kurz: `Rendite ${r} %`,
  };
}

const KLASSE_ZUSCHLAG: Record<string, number> = { B: 10, C: 5, D: 0, E: -5, F: -10, G: -15, H: -15 };

/**
 * B6 Substanz. Neubau oder Energieklasse A volle Punkte. Sonst nach
 * Baujahr gestaffelt (ab 2000 85, ab 1980 70, ab 1950 55, davor 40), eine
 * Sanierung in den letzten 25 Jahren hebt um 20 (höchstens 90), die
 * Energieklasse verschiebt um bis zu 15.
 */
export function substanzWert(e: Pick<ScoreEinheit, "baujahr" | "energieklasse" | "saniertJahr" | "neubau">, jahr = new Date().getFullYear()): number | null {
  const klasse = (e.energieklasse || "").toUpperCase();
  if (e.neubau || klasse === "A" || klasse === "A+") return 100;
  if (!e.baujahr && !klasse) return null;
  let wert = !e.baujahr ? 55 : e.baujahr >= 2000 ? 85 : e.baujahr >= 1980 ? 70 : e.baujahr >= 1950 ? 55 : 40;
  if (e.saniertJahr && e.saniertJahr >= jahr - 25) wert = Math.min(90, wert + 20);
  wert += KLASSE_ZUSCHLAG[klasse] ?? 0;
  return Math.max(0, Math.min(100, wert));
}

function bausteinSubstanz(e: ScoreEinheit): Omit<BausteinWert, "gewicht"> {
  const wert = substanzWert(e);
  if (wert === null) return { id: "substanz", wert: null, text: "", kurz: "", fehlt: "Baujahr und Energieklasse fehlen" };
  const teile = [
    e.neubau ? `Neubau${e.baujahr ? ` ${e.baujahr}` : ""}` : e.baujahr ? `Baujahr ${e.baujahr}` : "",
    e.saniertJahr ? `saniert ${e.saniertJahr}` : "",
    e.energieklasse ? `Energieklasse ${e.energieklasse}` : "keine Energieklasse hinterlegt",
  ].filter(Boolean).join(", ");
  const urteil = wert >= 80 ? "starke Substanz" : wert >= 50 ? "Substanz nur mittel" : "schwache Substanz";
  return { id: "substanz", wert, text: `${teile}: ${urteil}.`, kurz: `${teile}, ${urteil}` };
}

function bausteinMikrolage(e: ScoreEinheit): Omit<BausteinWert, "gewicht"> {
  const m = e.mikrolage;
  if (!m) return { id: "mikrolage", wert: null, text: "", kurz: "", fehlt: "Standort nicht gemessen" };
  const namen: [keyof NonNullable<ScoreEinheit["mikrolage"]>, string][] = [["oepnv", "ÖPNV"], ["einkauf", "Einkauf"], ["aerzte", "Ärzte"], ["schule", "Schule"]];
  const da = namen.filter(([k]) => m[k]).map(([, n]) => n);
  const weg = namen.filter(([k]) => !m[k]).map(([, n]) => n);
  return {
    id: "mikrolage", wert: da.length * 25,
    text: da.length === 4
      ? `Lage: ${aufzaehlung(da)} im Umkreis von 1 km.`
      : `Im Umkreis von 1 km fehlen ${aufzaehlung(weg)}.`,
    kurz: da.length === 4 ? "alles Nötige im Umkreis von 1 km" : `im Umkreis von 1 km ${da.length ? aufzaehlung(da) : "nichts"}`,
  };
}

function bausteinNaehe(e: ScoreEinheit): Omit<BausteinWert, "gewicht"> {
  if (e.entfernungKm === null) return { id: "naehe", wert: null, text: "", kurz: "", fehlt: "Entfernung unbekannt, Wohnort oder Objektlage fehlt" };
  const km = rund(e.entfernungKm);
  const wert = linear(e.entfernungKm, NAEHE_VOLL_BIS_KM, 100, NAEHE_MIN_AB_KM, NAEHE_MIN);
  return { id: "naehe", wert, text: `${km.toLocaleString("de-DE")} km vom Wohnort.`, kurz: `${km.toLocaleString("de-DE")} km vom Wohnort` };
}

function bausteinKonzept(e: ScoreEinheit, k: ScoreKunde): Omit<BausteinWert, "gewicht"> {
  if (!k.ziele.length) return { id: "konzept", wert: null, text: "", kurz: "", fehlt: "keine Ziele in der Selbstauskunft" };
  if (!e.konzept) return { id: "konzept", wert: null, text: "", kurz: "", fehlt: "Objektart unbekannt" };
  const passende = k.ziele.filter((z) => zielNachId(z)?.konzept === e.konzept);
  if (passende.length) {
    const ziel = zielNachId(passende[0])?.kurz;
    return { id: "konzept", wert: KONZEPT_PASST, text: `Konzept ${KONZEPT_NAME[e.konzept]} passt zum Ziel ${ziel}.`, kurz: `Konzept passt zum Ziel ${ziel}` };
  }
  const gewaehlt = [...new Set(k.ziele.map((z) => zielNachId(z)?.konzept).filter(Boolean))] as AnlageKonzept[];
  return {
    id: "konzept", wert: KONZEPT_PASST_NICHT,
    text: `${KONZEPT_NAME[e.konzept]}-Konzept, gewählt sind ${gewaehlt.map((c) => KONZEPT_NAME[c]).join(" und ")}-Ziele.`,
    kurz: `${KONZEPT_NAME[e.konzept]}-Konzept passt nicht zu den Zielen`,
  };
}

const ersterGross = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Den Score einer Einheit für einen Kunden bewerten.
 *
 * Kein Score ohne positiven Rahmen, außerhalb des Rahmens und ohne die
 * monatliche Belastung (B1 und B2 tragen jede Bewertung). Die harten
 * Ausschlüsse (nicht im Angebot, exklusiv für andere, fremd vorgemerkt,
 * Globalobjekt-Regeln) hat `empfehlungsKandidaten` schon getroffen: Was dort
 * fehlt, kommt hier gar nicht an.
 */
export function bewerteEinheit(e: ScoreEinheit, k: ScoreKunde, rechnung: ScoreRechnung | null): ObjektScore {
  const leer = (grund: KeinScoreGrund): ObjektScore => ({
    wert: null, keinScore: grund, teilwert: false, ungedeckelt: null, gedeckelt: false,
    bausteine: [], gruende: [], satz: "", hauptgrund: "", fehltText: "",
    entfernungKm: e.entfernungKm, abstandRahmenmitte: k.rahmen ? Math.abs(e.gesamtkosten - rahmenMitte(k.rahmen)) : 0,
  });
  if (!k.rahmen) return leer("kein_rahmen");
  if (!e.passt) return leer("ausserhalb_rahmen");

  const gewichte = gewichteFuerZiele(k.ziele);
  const roh = [
    bausteinRahmen(e, k), bausteinBelastung(rechnung, k), bausteinSteuer(rechnung, e), bausteinVermoegen(rechnung),
    bausteinErtrag(e), bausteinSubstanz(e), bausteinMikrolage(e), bausteinNaehe(e), bausteinKonzept(e, k),
  ];
  const bausteine: BausteinWert[] = roh.map((b) => ({ ...b, gewicht: gewichte[b.id], wert: b.wert === null ? null : rund(b.wert) }));
  const belastung = bausteine.find((b) => b.id === "belastung");
  if (belastung?.wert === null) return { ...leer("belastung_fehlt"), bausteine, fehltText: `Monatliche Belastung: ${belastung.fehlt}.` };

  // Gerechnet mit den ungerundeten Bausteinwerten, angezeigt gerundet.
  const vorhanden = roh.filter((b) => b.wert !== null && gewichte[b.id] > 0);
  const summeGewicht = vorhanden.reduce((s, b) => s + gewichte[b.id], 0);
  const ungedeckelt = rund(vorhanden.reduce((s, b) => s + gewichte[b.id] * (b.wert as number), 0) / summeGewicht);
  const fehlend = bausteine.filter((b) => b.wert === null && b.gewicht > 0);
  const fehlendesGewicht = fehlend.reduce((s, b) => s + b.gewicht, 0);
  const teilwert = fehlendesGewicht > TEILWERT_AB_FEHLENDEM_GEWICHT;

  const ekFehlt = rechnung !== null && k.eigenkapital !== null && rechnung.kaufnebenkosten > 0 && k.eigenkapital < rechnung.kaufnebenkosten;
  const gedeckelt = ekFehlt && ungedeckelt > DECKEL_OHNE_NEBENKOSTEN;
  const wert = ekFehlt ? Math.min(ungedeckelt, DECKEL_OHNE_NEBENKOSTEN) : ungedeckelt;
  const warnung = ekFehlt ? "Eigenkapital deckt die Kaufnebenkosten nicht" : undefined;

  // „Warum": drei Bausteine mit dem größten Beitrag, dazu ein Abzug.
  const ziel = new Set(Object.keys(k.ziele.length ? Object.assign({}, ...k.ziele.map((z) => ZIEL_GEWICHTE[z])) : {}));
  const zielZusatz = (b: BausteinWert) => (ziel.has(b.id) && b.id !== "konzept" && k.ziele.length ? ` (Ziel ${zielNamen(k.ziele)})` : "");
  const mitBeitrag = bausteine.filter((b) => b.wert !== null && b.gewicht > 0)
    .sort((a, b) => b.gewicht * (b.wert as number) - a.gewicht * (a.wert as number));
  const top = mitBeitrag.slice(0, 3);
  const abzug = mitBeitrag
    .filter((b) => b.gewicht >= ABZUG_GEWICHT_AB && (b.wert as number) < ABZUG_UNTER && !top.includes(b))
    .sort((a, b) => (a.wert as number) - (b.wert as number))[0];
  const gruende: Grund[] = [];
  if (ekFehlt && rechnung) {
    gruende.push({
      art: "minus",
      text: `Kaufnebenkosten rund ${eurRund(rechnung.kaufnebenkosten, 100)}, Eigenkapital laut Selbstauskunft ${eurRund(k.eigenkapital as number, 100)}: höchstens ${DECKEL_OHNE_NEBENKOSTEN} Punkte.`,
    });
  }
  for (const b of top) {
    const art = (b.wert as number) >= ABZUG_UNTER ? "plus" : "minus";
    gruende.push({ art, text: art === "plus" ? `${b.text.replace(/\.$/, "")}${zielZusatz(b)}.` : b.text });
  }
  if (abzug) gruende.push({ art: "minus", text: abzug.text });

  const kurz = top.filter((b) => (b.wert as number) >= ABZUG_UNTER).map((b) => b.kurz).filter(Boolean);
  const satz = kurz.length ? `${ersterGross(kurz.slice(0, 2).join(", "))}.` : "";
  const fehltText = fehlend.length
    ? `${teilwert ? "Teilwert" : "Nicht bewertet"}: ${fehlend.map((b) => `${BAUSTEIN_NAME[b.id]} (${b.fehlt})`).join(", ")}. Gerechnet über die vorhandenen Bausteine.`
    : "";

  return {
    wert, teilwert, ungedeckelt, gedeckelt, warnung, bausteine, gruende, satz,
    hauptgrund: warnung ?? ersterGross(kurz[0] ?? ""),
    fehltText,
    entfernungKm: e.entfernungKm,
    abstandRahmenmitte: Math.abs(e.gesamtkosten - rahmenMitte(k.rahmen)),
  };
}

// ── Rangfolge ───────────────────────────────────────────────────────────

/**
 * Höher zuerst. Bei Gleichstand erst die Nähe (ohne Entfernung hinten),
 * dann die Nähe zur Rahmenmitte. Ohne Score ganz hinten.
 */
export function vergleicheScore(a: ObjektScore, b: ObjektScore): number {
  if (a.wert !== b.wert) {
    if (a.wert === null) return 1;
    if (b.wert === null) return -1;
    return b.wert - a.wert;
  }
  if (a.entfernungKm !== b.entfernungKm) {
    if (a.entfernungKm === null) return 1;
    if (b.entfernungKm === null) return -1;
    const d = Math.round(a.entfernungKm) - Math.round(b.entfernungKm);
    if (d !== 0) return d;
  }
  return a.abstandRahmenmitte - b.abstandRahmenmitte;
}

/**
 * Die besten Treffer: nach Score, höchstens einer je Objekt. Ohne Score
 * steht nichts in den Top, die Oberfläche füllt sie mit ihrer bisherigen
 * Reihenfolge auf.
 */
export function besteTreffer<T extends { objektId: string; score: ObjektScore }>(eintraege: T[], anzahl = 5): T[] {
  const sortiert = eintraege.filter((e) => e.score.wert !== null).sort((a, b) => vergleicheScore(a.score, b.score));
  const gewaehlt: T[] = [];
  const objekte = new Set<string>();
  for (const e of sortiert) {
    if (objekte.has(e.objektId)) continue;
    objekte.add(e.objektId);
    gewaehlt.push(e);
    if (gewaehlt.length >= anzahl) break;
  }
  return gewaehlt;
}

/** Ring-Farbe: ab 75 gut, ab 60 mittel, darunter schwach. */
export function scoreStufe(wert: number | null): "gut" | "mittel" | "schwach" | "leer" {
  if (wert === null) return "leer";
  return wert >= 75 ? "gut" : wert >= 60 ? "mittel" : "schwach";
}

/** Die Hinweiszeile, wortgleich überall, wo der Score steht. */
export const SCORE_HINWEIS =
  "Objektscore: interne Sortierhilfe aus Selbstauskunft, Zielen und Objektdaten. Keine Anlageberatung, nicht für den Kunden bestimmt.";

/** Warum kein Score dasteht, für den Ring „n. b.“. */
export const KEIN_SCORE_TEXT: Record<KeinScoreGrund, string> = {
  kein_rahmen: "Kein Score: ohne Finanzierungsrahmen",
  ausserhalb_rahmen: "Kein Score: außerhalb des Rahmens",
  belastung_fehlt: "Kein Score: die monatliche Belastung lässt sich nicht bewerten",
};

/** Die Ziele als Text für den Fuß von „Warum?“. */
export function zieleText(ziele: string[]): string {
  return zielNamen(ziele);
}
