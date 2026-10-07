/**
 * Portfolio-Kennzahlen fuer das Kundenportal (Stufe 4 der Sanierung).
 *
 * Rechnet MOREImmo-Investments (Tabelle investments) und eigene Investments
 * (Tabelle externe_investments) in eine gemeinsame Positionsliste um und
 * liefert daraus die Kennzahlen der Uebersichtsseiten sowie die
 * Vermoegensuebersicht. Grundsatz: keine stillen Schaetzwerte. Fehlt eine
 * Angabe (Miete, Restschuld), bleibt sie null und wird ausgewiesen statt
 * stillschweigend als 0 mitgerechnet.
 */

import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";
import { aktuelleRestschuld } from "@/lib/eigeneInvestmentBerechnungen";

export type MarktwertPunkt = { datum: string; wert: number };

export type PortfolioPosition = {
  id: string;
  quelle: "moreimmo" | "eigene";
  kaufpreis: number;
  /** Belegte Jahresmiete; null = keine Miete erfasst. */
  jahresmiete: number | null;
  /** Offene Restschuld; null = Angabe fehlt. */
  restschuld: number | null;
  /** Letzter erfasster Marktwert; null = keiner erfasst. */
  marktwert: number | null;
  marktwertHistorie: MarktwertPunkt[];
  kaufdatum: string | null;
};

function leseHistorie(meta: any): MarktwertPunkt[] {
  const roh = Array.isArray(meta?.marktwertHistorie) ? meta.marktwertHistorie : [];
  return roh
    .filter((h: any) => h && typeof h.datum === "string" && Number(h.wert) > 0)
    .map((h: any) => ({ datum: h.datum, wert: Number(h.wert) }))
    .sort((a: MarktwertPunkt, b: MarktwertPunkt) => a.datum.localeCompare(b.datum));
}

function letzterWert(historie: MarktwertPunkt[]): number | null {
  return historie.length > 0 ? historie[historie.length - 1].wert : null;
}

/** MOREImmo-Investment (Zeile aus `investments` plus Finanzierung) als Position. */
export function moreImmoPosition(inv: any, finanzierung: any): PortfolioPosition {
  const meta = inv?.meta || {};
  const adapted = adaptMoreImmoInvestment(inv, meta, finanzierung);
  const jahresmiete = Number(meta?.jahresnettomiete || meta?.miete_jaehrlich || 0);
  const historie = leseHistorie(meta);
  return {
    id: inv.id,
    quelle: "moreimmo",
    kaufpreis: Number(inv.kaufpreis || 0),
    jahresmiete: jahresmiete > 0 ? jahresmiete : null,
    // Eingetragene Restschuld, sonst aus dem Darlehen fortgeschrieben, wie im
    // Tilgungsplan. Ohne Darlehen gilt sie als fehlende Angabe.
    restschuld: aktuelleRestschuld(adapted),
    marktwert: letzterWert(historie),
    marktwertHistorie: historie,
    kaufdatum: adapted.kaufdatum || null,
  };
}

/** Eigenes Investment (Zeile aus `externe_investments`) als Position. */
export function eigenePosition(inv: any): PortfolioPosition {
  const historie = leseHistorie(inv?.meta);
  const mieteKalt = inv?.mieteinnahmen_kalt;
  // Restschuld: eingetragene offene Tilgung, sonst aus Darlehen, Zins,
  // Tilgung und Laufzeit fortgeschrieben (dieselbe Rechnung wie der
  // Tilgungsplan). Sind beide leer, fehlt die Angabe (null), sie wird NICHT
  // still als 0 gewertet.
  const restschuld = aktuelleRestschuld({
    offene_tilgung: inv?.offene_tilgung ?? null,
    darlehenssumme: inv?.darlehenssumme ?? 0,
    zinssatz: inv?.zinssatz ?? 0,
    monatliche_rate: inv?.monatliche_rate ?? 0,
    kaufdatum: inv?.kaufdatum ?? null,
    meta: inv?.meta,
  });
  return {
    id: inv.id,
    quelle: "eigene",
    kaufpreis: Number(inv?.kaufpreis || 0),
    jahresmiete: mieteKalt != null && Number(mieteKalt) > 0 ? Number(mieteKalt) * 12 : null,
    restschuld,
    marktwert: letzterWert(historie),
    marktwertHistorie: historie,
    kaufdatum: inv?.kaufdatum || null,
  };
}

export type PortfolioKennzahlen = {
  anzahl: number;
  anzahlMoreImmo: number;
  anzahlEigene: number;
  kaufpreisGesamt: number;
  /** Summe der belegten Jahresmieten. */
  mieteGesamt: number;
  /** Anzahl Positionen mit belegter Miete (Basis der Rendite). */
  mieteAnzahl: number;
  /**
   * Bruttorendite in Prozent, nur ueber Positionen mit belegter Miete
   * gerechnet. null, wenn keine Position eine Miete belegt.
   */
  rendite: number | null;
};

export function berechnePortfolioKennzahlen(positionen: PortfolioPosition[]): PortfolioKennzahlen {
  let kaufpreisGesamt = 0;
  let mieteGesamt = 0;
  let mieteAnzahl = 0;
  let kaufpreisMitMiete = 0;
  for (const p of positionen) {
    kaufpreisGesamt += p.kaufpreis;
    if (p.jahresmiete != null) {
      mieteGesamt += p.jahresmiete;
      mieteAnzahl += 1;
      kaufpreisMitMiete += p.kaufpreis;
    }
  }
  const rendite =
    mieteAnzahl > 0 && kaufpreisMitMiete > 0
      ? (mieteGesamt / kaufpreisMitMiete) * 100
      : null;
  return {
    anzahl: positionen.length,
    anzahlMoreImmo: positionen.filter((p) => p.quelle === "moreimmo").length,
    anzahlEigene: positionen.filter((p) => p.quelle === "eigene").length,
    kaufpreisGesamt,
    mieteGesamt,
    mieteAnzahl,
    rendite,
  };
}

export type Vermoegensuebersicht = {
  /** Summe: letzter Marktwert je Position, sonst Kaufpreis. */
  immobilienwert: number;
  /** Anzahl Positionen, die mit Marktwert (statt Kaufpreis) eingehen. */
  mitMarktwert: number;
  /** Summe der bekannten Restschulden. */
  restschuldGesamt: number;
  /** Anzahl Positionen ohne Restschuld-Angabe. */
  restschuldFehlt: number;
  /** immobilienwert minus bekannte Restschulden. */
  nettoVermoegen: number;
};

export function berechneVermoegen(positionen: PortfolioPosition[]): Vermoegensuebersicht {
  let immobilienwert = 0;
  let mitMarktwert = 0;
  let restschuldGesamt = 0;
  let restschuldFehlt = 0;
  for (const p of positionen) {
    if (p.marktwert != null) {
      immobilienwert += p.marktwert;
      mitMarktwert += 1;
    } else {
      immobilienwert += p.kaufpreis;
    }
    if (p.restschuld != null) restschuldGesamt += p.restschuld;
    else restschuldFehlt += 1;
  }
  return {
    immobilienwert,
    mitMarktwert,
    restschuldGesamt,
    restschuldFehlt,
    nettoVermoegen: immobilienwert - restschuldGesamt,
  };
}

export type VerlaufPunkt = { datum: string; wert: number };

/**
 * Entwicklung des Immobilienwerts ueber die erfassten Marktwert-Stichtage.
 * Je Stichtag zaehlt fuer jede Position der letzte Marktwert bis zu diesem
 * Datum, sonst der Kaufpreis. Ohne einen einzigen Historien-Eintrag ist das
 * Ergebnis leer (dann gibt es nichts Ehrliches zu zeichnen).
 */
export function vermoegensVerlauf(positionen: PortfolioPosition[]): VerlaufPunkt[] {
  const stichtage = Array.from(
    new Set(positionen.flatMap((p) => p.marktwertHistorie.map((h) => h.datum))),
  ).sort((a, b) => a.localeCompare(b));
  if (stichtage.length === 0) return [];
  return stichtage.map((datum) => {
    let wert = 0;
    for (const p of positionen) {
      const bisher = p.marktwertHistorie.filter((h) => h.datum.localeCompare(datum) <= 0);
      wert += bisher.length > 0 ? bisher[bisher.length - 1].wert : p.kaufpreis;
    }
    return { datum, wert };
  });
}
