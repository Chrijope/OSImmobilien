/**
 * Objekttypen und ihre Musterrechnung.
 *
 * Das Analysetool hat bisher mit einer Durchschnittsrendite auf ein
 * Maximalvolumen gerechnet. Heraus kamen Zuzahlungen von mehreren hundert
 * Euro, also genau das Gegenteil dessen, was ein Interessent sehen soll.
 *
 * Der Denkfehler lag nicht in der Formel, sondern in der Annahme: Es gab kein
 * Objekt. Hier stehen jetzt die Objekttypen mit ihren echten Kennzahlen, und
 * die Musterrechnung sucht innerhalb der Kaufpreisspanne ein Beispielobjekt,
 * das zur Situation passt und die Zuzahlung unter der gewünschten Grenze
 * hält. Das ist keine Schönrechnerei, sondern genau die Leistung des
 * Vertriebs: ein passendes Objekt auswählen.
 *
 * Die Zahlen sind bewusst hier gebündelt, damit sie ohne Programmierkenntnis
 * gepflegt werden können.
 */
import { kaufnebenkostenProzent } from "@/lib/grunderwerbsteuer";

export type ObjekttypId = "sanierter_altbau" | "neubau" | "wg_konzept";

export interface Objekttyp {
  id: ObjekttypId;
  name: string;
  /** Ein Satz, wofür der Typ steht. */
  kurz: string;
  /** Warum er zu wem passt. */
  passtWenn: string;
  /** Typische Kaufpreisspanne in Euro. */
  kaufpreisVon: number;
  kaufpreisBis: number;
  /** Bruttomietrendite in Prozent vom Kaufpreis. */
  mietrenditeProzent: number;
  /** Linearer Abschreibungssatz Gebäude in Prozent. */
  afaSatzProzent: number;
  /** Erläuterung zur Abschreibung, erscheint in der Rechnung. */
  afaHinweis: string;
  /** Sonderabschreibung § 7b in Prozent, in den ersten vier Jahren. */
  sonderAfaProzent?: number;
  /** Laufender Erhaltungsaufwand pro Jahr in Prozent vom Kaufpreis. */
  erhaltungsaufwandProzent?: number;
  /** Gebäudeanteil am Kaufpreis in Prozent. */
  gebaeudeanteilProzent: number;
  /** Nicht umlagefähige Kosten pro Monat und Quadratmeter, grob. */
  nichtUmlagefaehigMonat: number;
}

export const OBJEKTTYPEN: Objekttyp[] = [
  {
    id: "sanierter_altbau",
    name: "Sanierter Altbau",
    kurz: "Bestandsobjekt mit abgeschlossener Sanierung in gewachsener Lage.",
    passtWenn:
      "Der stärkste Steuerhebel. Über ein Restnutzungsdauergutachten sind höhere Abschreibungssätze möglich, das wirkt umso mehr, je höher der persönliche Steuersatz ist.",
    kaufpreisVon: 180000,
    kaufpreisBis: 380000,
    mietrenditeProzent: 4.0,
    afaSatzProzent: 4,
    afaHinweis:
      "4 Prozent über ein objektbezogenes Restnutzungsdauergutachten. Ohne Gutachten gelten 2 Prozent.",
    gebaeudeanteilProzent: 80,
    nichtUmlagefaehigMonat: 55,
  },
  {
    id: "neubau",
    name: "Neubau",
    kurz: "Erstbezug mit Gewährleistung und geringem Instandhaltungsbedarf.",
    passtWenn:
      "Wenig Aufwand und lange Ruhe. Neben der linearen Abschreibung von 3 Prozent kommt bei erfüllten Voraussetzungen die Sonderabschreibung nach § 7b in den ersten vier Jahren dazu.",
    kaufpreisVon: 250000,
    kaufpreisBis: 480000,
    mietrenditeProzent: 3.4,
    afaSatzProzent: 3,
    afaHinweis: "3 Prozent für Fertigstellung ab 2023 nach § 7 Abs. 4 EStG.",
    sonderAfaProzent: 5,
    gebaeudeanteilProzent: 80,
    nichtUmlagefaehigMonat: 40,
  },
  {
    id: "wg_konzept",
    name: "WG-Konzept",
    kurz: "Einzelvermietung nach Zimmern, deutlich höhere Mieteinnahmen.",
    passtWenn:
      "Wenn der monatliche Überschuss im Vordergrund steht. Die Mietrendite liegt spürbar höher, dafür gibt es mehr Verwaltung und einen laufenden Erhaltungsaufwand.",
    kaufpreisVon: 200000,
    kaufpreisBis: 420000,
    mietrenditeProzent: 5.2,
    afaSatzProzent: 3,
    afaHinweis: "3 Prozent, bei saniertem Bestand mit Gutachten auch mehr.",
    erhaltungsaufwandProzent: 0.5,
    gebaeudeanteilProzent: 80,
    nichtUmlagefaehigMonat: 70,
  },
];

export function objekttypById(id: ObjekttypId): Objekttyp {
  return OBJEKTTYPEN.find((o) => o.id === id) || OBJEKTTYPEN[0];
}

/** Obergrenze der monatlichen Zuzahlung, die das Beispiel einhalten soll. */
export const ZUZAHLUNG_GRENZE = 200;

export interface MusterEingaben {
  /** Empfohlener Kaufpreis aus dem Finanzierungsrahmen. */
  rahmenBis: number;
  /** Persönlicher Grenzsteuersatz als Anteil, etwa 0.42. */
  grenzsteuersatz: number;
  bundeslandId?: string | null;
  zinsProzent?: number;
  tilgungProzent?: number;
  /** Obergrenze der Zuzahlung, Vorgabe 200 Euro. */
  grenze?: number;
}

export interface Musterrechnung {
  typ: Objekttyp;
  kaufpreis: number;
  kaufnebenkostenProzent: number;
  kaufnebenkosten: number;
  darlehen: number;
  /** Kaltmiete pro Monat. */
  miete: number;
  /** Annuität pro Monat. */
  rate: number;
  zinsenJahr1: number;
  afaGebaeude: number;
  sonderAfa: number;
  erhaltungsaufwand: number;
  nichtUmlagefaehigJahr: number;
  /** Steuerliches Ergebnis aus Vermietung und Verpachtung im ersten Jahr. */
  steuerlichesErgebnis: number;
  steuerwirkungJahr: number;
  steuerwirkungMonat: number;
  /** Zuzahlung pro Monat nach Miete und Steuerwirkung. */
  zuzahlungMonat: number;
  /** Zuzahlung ohne die Steuerwirkung, für den Vergleich. */
  zuzahlungOhneSteuerMonat: number;
  /** Erreicht das Beispiel die gewünschte Obergrenze? */
  innerhalbGrenze: boolean;
  immobilienwertNach10: number;
  restschuldNach10: number;
  vermoegenNach10: number;
}

const ZINS_STANDARD = 3.8;
const TILGUNG_STANDARD = 2;
const WERTSTEIGERUNG = 0.02;

/** Rechnet ein konkretes Beispielobjekt durch. */
export function rechneMuster(typ: Objekttyp, kaufpreis: number, e: MusterEingaben): Musterrechnung {
  const nkProzent = kaufnebenkostenProzent(e.bundeslandId);
  const kaufnebenkosten = Math.round(kaufpreis * (nkProzent / 100));
  // Die Nebenkosten trägt der Käufer aus Eigenkapital, finanziert wird der
  // Kaufpreis. So ist es bei Kapitalanlagen der Regelfall.
  const darlehen = kaufpreis;

  const zinsP = (e.zinsProzent ?? ZINS_STANDARD) / 100;
  const tilgP = (e.tilgungProzent ?? TILGUNG_STANDARD) / 100;
  const rateJahr = darlehen * (zinsP + tilgP);
  const rate = rateJahr / 12;

  const mieteJahr = kaufpreis * (typ.mietrenditeProzent / 100);
  const miete = mieteJahr / 12;

  const zinsenJahr1 = darlehen * zinsP;
  const gebaeudewert = (kaufpreis + kaufnebenkosten) * (typ.gebaeudeanteilProzent / 100);
  const afaGebaeude = gebaeudewert * (typ.afaSatzProzent / 100);
  const sonderAfa = typ.sonderAfaProzent ? gebaeudewert * (typ.sonderAfaProzent / 100) : 0;
  const erhaltungsaufwand = typ.erhaltungsaufwandProzent
    ? kaufpreis * (typ.erhaltungsaufwandProzent / 100)
    : 0;
  const nichtUmlagefaehigJahr = typ.nichtUmlagefaehigMonat * 12;

  const werbungskosten =
    zinsenJahr1 + afaGebaeude + sonderAfa + erhaltungsaufwand + nichtUmlagefaehigJahr;
  const steuerlichesErgebnis = mieteJahr - werbungskosten;
  // Nur ein Verlust bringt eine Erstattung. Ein Überschuss kostet Steuer.
  const steuerwirkungJahr = -steuerlichesErgebnis * e.grenzsteuersatz;

  const zuzahlungOhneSteuerMonat = Math.max(
    0,
    rate - miete + typ.nichtUmlagefaehigMonat + erhaltungsaufwand / 12,
  );
  const zuzahlungMonat = Math.max(0, zuzahlungOhneSteuerMonat - steuerwirkungJahr / 12);

  // Zehn Jahre Tilgungsverlauf für die Vermögenszahl.
  let rest = darlehen;
  for (let j = 1; j <= 10; j++) {
    const zins = rest * zinsP;
    rest = Math.max(0, rest - Math.max(0, rateJahr - zins));
  }
  const immobilienwertNach10 = kaufpreis * Math.pow(1 + WERTSTEIGERUNG, 10);

  return {
    typ,
    kaufpreis,
    kaufnebenkostenProzent: nkProzent,
    kaufnebenkosten,
    darlehen,
    miete,
    rate,
    zinsenJahr1,
    afaGebaeude,
    sonderAfa,
    erhaltungsaufwand,
    nichtUmlagefaehigJahr,
    steuerlichesErgebnis,
    steuerwirkungJahr,
    steuerwirkungMonat: steuerwirkungJahr / 12,
    zuzahlungMonat,
    zuzahlungOhneSteuerMonat,
    innerhalbGrenze: zuzahlungMonat <= (e.grenze ?? ZUZAHLUNG_GRENZE),
    immobilienwertNach10,
    restschuldNach10: rest,
    vermoegenNach10: immobilienwertNach10 - rest,
  };
}

/**
 * Sucht innerhalb der Kaufpreisspanne des Typs das größte Beispielobjekt, das
 * die Zuzahlungsgrenze noch einhält, höchstens aber so groß wie der
 * Finanzierungsrahmen des Interessenten.
 *
 * Warum das größte und nicht das kleinste: Ein größeres Objekt bedeutet mehr
 * Vermögensaufbau. Die Grenze bei der Zuzahlung ist die Nebenbedingung, nicht
 * das Ziel.
 */
export function waehleMusterobjekt(typ: Objekttyp, e: MusterEingaben): Musterrechnung {
  const grenze = e.grenze ?? ZUZAHLUNG_GRENZE;
  const obergrenze = Math.min(typ.kaufpreisBis, Math.max(typ.kaufpreisVon, e.rahmenBis));
  const schritt = 10000;

  let bestes: Musterrechnung | null = null;
  for (let preis = typ.kaufpreisVon; preis <= obergrenze; preis += schritt) {
    const r = rechneMuster(typ, preis, e);
    if (r.zuzahlungMonat <= grenze) bestes = r;
  }
  // Hält selbst das kleinste Objekt die Grenze nicht, wird es trotzdem gezeigt,
  // aber als solches gekennzeichnet. Etwas zu verschweigen wäre schlechter.
  return bestes ?? rechneMuster(typ, typ.kaufpreisVon, e);
}

/**
 * Reihenfolge der Objekttypen nach Passung.
 *
 * Hoher Steuersatz spricht für den Steuerhebel des sanierten Bestands, ein
 * knappes Budget für das WG-Konzept mit seiner höheren Mietrendite.
 */
export function sortiereTypenNachPassung(grenzsteuersatz: number, rahmenBis: number): Objekttyp[] {
  return [...OBJEKTTYPEN].sort((a, b) => punkte(b) - punkte(a));

  function punkte(t: Objekttyp): number {
    let p = 0;
    if (t.id === "sanierter_altbau" && grenzsteuersatz >= 0.42) p += 3;
    if (t.id === "wg_konzept" && rahmenBis < 300000) p += 2;
    if (t.id === "neubau" && rahmenBis >= 350000) p += 2;
    if (rahmenBis >= t.kaufpreisVon) p += 1;
    return p;
  }
}
