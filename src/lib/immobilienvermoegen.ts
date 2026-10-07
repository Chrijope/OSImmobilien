/**
 * Nettoimmobilienvermögen aus einer Selbstauskunft.
 *
 * Vorher zeigte das Kundenprofil unter der Überschrift "Immobilienvermögen"
 * die Restschuld der Immobilienkredite, also eine Schuld statt eines Werts.
 * Der eingetragene Marktwert wurde nirgends gelesen, obwohl das Formular ihn
 * als Pflichtfeld erhebt.
 *
 * Diese Datei ist die einzige Quelle der Formel, damit Kundenprofil,
 * Leadscore und der Beraterhinweis in der Finanzierbarkeit nicht auseinander
 * laufen:
 *
 *     Verkehrswert  −  Restschuld der Immobilienkredite  =  Nettovermögen
 *
 * Wichtig ist, was der Nettowert NICHT ist: verfügbares Eigenkapital. Die
 * Kaufnebenkosten müssen bar aufgebracht werden, und eine Bestandsimmobilie
 * kann man zum Notartermin nicht mitbringen. Die Finanzierbarkeitsprüfung
 * rechnet deshalb bewusst weiterhin nur mit liquiden Mitteln.
 */

import { kreditArt, kreditAuswahlLabel, parseFinanzNum } from "./finanzierbarkeitUtils";
import { kreditAuswahlText } from "./kreditPflichtfelder";

/** Eine einzelne Immobilie aus der Selbstauskunft. */
export interface ImmobilienPosten {
  bezeichnung: string;
  /** Wem sie gehört, falls angegeben. */
  eigentuemer: string;
  nutzung: string;
  verkehrswert: number;
  /** Person 1 oder Person 2 der Selbstauskunft. */
  person: 1 | 2;
}

/** Ein einzelner Immobilienkredit. */
export interface ImmobilienKredit {
  bezeichnung: string;
  bank: string;
  restschuld: number;
  person: 1 | 2;
  /** Stichtag der Restschuld, TT.MM.JJJJ, leer bei älteren Angaben. */
  restschuldPer: string;
  /** Kreditnehmer, Zinsart und Sondertilgung als Anzeigetext, leer wenn nicht angegeben. */
  kreditnehmer: string;
  zinsart: string;
  sondertilgung: string;
}

export interface Immobilienvermoegen {
  /** Summe der Marktwerte aller eingetragenen Immobilien. */
  verkehrswert: number;
  /** Summe der Restschulden aller Kredite, deren Art auf Immobilien deutet. */
  restschuld: number;
  /** Verkehrswert abzüglich Restschuld. Kann negativ sein. */
  netto: number;
  /** Anzahl der eingetragenen Immobilien, für die Anzeige. */
  anzahl: number;
  /** Liegt überhaupt etwas vor? */
  vorhanden: boolean;
  /** Die einzelnen Objekte, für die Detailansicht. */
  objekte: ImmobilienPosten[];
  /**
   * Die einzelnen Immobilienkredite, für die Detailansicht.
   *
   * Bewusst als eigene Liste und nicht je Objekt: Die Selbstauskunft kennt
   * keine Verknüpfung zwischen Kredit und Immobilie. `zweck` ist ein Freitext
   * und `ursprung` ein Betrag. Eine Zuordnung waere geraten, und ein geratenes
   * Nettovermoegen je Objekt ist schlimmer als gar keines. Nur wenn genau eine
   * Immobilie hinterlegt ist, ist die Zuordnung eindeutig.
   */
  kredite: ImmobilienKredit[];
  /** Ist die Zuordnung eindeutig, also genau ein Objekt? */
  eindeutigZuordenbar: boolean;
}

const IMMOBILIEN_KREDIT = /immobil|hypothek|baufinanz|grundschuld/i;

type SaTeil = {
  immobilien?: Array<{
    marktwert?: string; art?: string; adresse?: string;
    eigentuemer?: string; nutzung?: string;
  }> | null;
  kredite?: Array<{
    art?: string; kategorie?: string; restschuld?: string; bank?: string; zweck?: string;
    restschuldPer?: string; kreditnehmer?: string; zinsart?: string; sondertilgung?: string;
  }> | null;
} | null | undefined;

/**
 * Rechnet über die Angaben beider Personen einer Selbstauskunft.
 * `saData` ist der Datensatz von Person 1, `saData.person2Data` der von Person 2.
 */
export function berechneImmobilienvermoegen(saData: unknown): Immobilienvermoegen {
  const sd = saData as (SaTeil & { person2?: boolean; person2Data?: SaTeil }) | null | undefined;
  // Person 2 nur, wenn die Selbstauskunft sie führt (siehe calculateFinanzierbarkeitFromSaData).
  const teile: SaTeil[] = [sd, sd?.person2 ? sd.person2Data : null];

  let verkehrswert = 0;
  let restschuld = 0;
  const objekte: ImmobilienPosten[] = [];
  const kredite: ImmobilienKredit[] = [];

  teile.forEach((teil, index) => {
    if (!teil) return;
    const person: 1 | 2 = index === 0 ? 1 : 2;

    for (const im of teil.immobilien ?? []) {
      const wert = parseFinanzNum(im?.marktwert);
      if (wert <= 0) continue;
      verkehrswert += wert;
      const art = String(im?.art ?? "").trim();
      const adresse = String(im?.adresse ?? "").trim();
      objekte.push({
        bezeichnung: [art, adresse].filter(Boolean).join(" · ") || "Immobilie",
        eigentuemer: String(im?.eigentuemer ?? "").trim(),
        nutzung: String(im?.nutzung ?? "").trim(),
        verkehrswert: wert,
        person,
      });
    }

    for (const k of teil.kredite ?? []) {
      /*
       * Mit gewählter Kreditart zählt die Wahl (Immobilienkredit oder
       * Bauspardarlehen). Ohne Wahl, bei älteren Angaben, bleibt es bei der
       * Suche im Freitext wie bisher. Vorher fiel ein Immobilienkredit ohne
       * Bezeichnung hier ganz heraus.
       */
      const gewaehlt = String(k?.kategorie ?? "").trim();
      const istImmo = gewaehlt
        ? kreditArt(undefined, gewaehlt) === "hypothek"
        : IMMOBILIEN_KREDIT.test(String(k?.art ?? ""));
      if (!istImmo) continue;
      const betrag = parseFinanzNum(k?.restschuld);
      if (betrag <= 0) continue;
      restschuld += betrag;
      const art = String(k?.art ?? "").trim() || kreditAuswahlLabel(gewaehlt);
      const zweck = String(k?.zweck ?? "").trim();
      kredite.push({
        bezeichnung: [art, zweck].filter(Boolean).join(" · ") || "Immobilienkredit",
        bank: String(k?.bank ?? "").trim(),
        restschuld: betrag,
        person,
        restschuldPer: String(k?.restschuldPer ?? "").trim(),
        kreditnehmer: kreditAuswahlText("kreditnehmer", k?.kreditnehmer),
        zinsart: kreditAuswahlText("zinsart", k?.zinsart),
        sondertilgung: kreditAuswahlText("sondertilgung", k?.sondertilgung),
      });
    }
  });

  const netto = verkehrswert - restschuld;
  return {
    verkehrswert,
    restschuld,
    netto,
    anzahl: objekte.length,
    // Auch eine Immobilie, die genau so viel wert ist wie ihre Restschuld,
    // ist vorhanden. Deshalb wird auf die Bestandteile geprüft, nicht auf
    // das Ergebnis.
    vorhanden: verkehrswert > 0 || restschuld > 0,
    objekte,
    kredite,
    eindeutigZuordenbar: objekte.length === 1,
  };
}

/** Die Formel als Text, für Tooltips und Beraterhinweise. */
export function immobilienvermoegenFormel(v: Immobilienvermoegen): string {
  const eur = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  return `Verkehrswert ${eur(v.verkehrswert)} abzüglich Restschuld ${eur(v.restschuld)} ergibt ${eur(v.netto)}.`;
}
