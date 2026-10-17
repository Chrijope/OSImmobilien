/**
 * Die zwei Wege der Handbuch-Seite (seit dem 17.10.2026, freigegeben von
 * Christian): „Mehr Netto vom Brutto“ und „Altersvorsorge mit einer, zwei,
 * drei Wohnungen“, in der Sprache der Dokumente der Beratungspräsentation.
 *
 * Gerechnet wird wie im Analysetool: dieselben Beispielwohnungen
 * (`OS_WOHNUNGEN`, je Objekt eine, auch Grundlage der Exposés) und derselbe
 * Exposé-Rechner über `rechneWohnung`. Brutto zu Netto mit dem Steuerrechner
 * des CRM (Tarif 2026, Soli, ohne Kirchensteuer, kinderlos).
 *
 * Unterschied zum Analysetool, bewusst: Der Grenzsteuersatz kommt aus dem
 * Tarif zum Brutto der Antwort (wie im übrigen Handbuch), nicht aus der
 * Staffel 25/35/42, und für „mehr netto“ zählen nur Wohnungen im Rahmen.
 */
import { OS_WOHNUNGEN, VORSORGE_ANNAHMEN, rechneWohnung, type OsWohnung, type WohnungRechnung } from "@/lib/analyseVorsorge";
import { sozialabgaben, steuerlastAusZvE } from "@/lib/steuerRechner";
import { BRUTTO_STELLVERTRETER, type HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import { beispielOsWohnung, grenzsatzProzent, zveZuBrutto } from "./modell";

/** Alter, mit dem die Seite startet, bis der Regler bewegt wird. */
export const ALTER_STANDARD = 35;
export const ALTER_MIN = 20;
export const ALTER_MAX = 60;

export function alterBegrenzt(alter: unknown): number {
  const n = Math.round(Number(alter));
  return Number.isFinite(n) ? Math.min(ALTER_MAX, Math.max(ALTER_MIN, n)) : ALTER_STANDARD;
}

/** Verkauf zum Rentenbeginn, mindestens zehn Jahre nach dem Kauf (steuerfrei nach § 23 EStG). */
export function verkaufsAlter(alter: number): number {
  return Math.max(VORSORGE_ANNAHMEN.rentenalter, alter + VORSORGE_ANNAHMEN.spekulationsfristJahre);
}

export interface NettoWeg {
  bruttoMonat: number;
  grenzsatz: number;
  lohnsteuerHeute: number;
  sozialabgaben: number;
  nettoHeute: number;
  /** Die Wohnung im Rahmen mit dem größten Steuervorteil im ersten Jahr. */
  wohnung: OsWohnung;
  /** Liegt keine Wohnung im Rahmen, ist es die günstigste. */
  imRahmen: boolean;
  mehrNetto: number;
  vorSteuer: number;
  anteilNachSteuer: number;
  /** Tilgung im ersten Monat, 1,2 % des voll finanzierten Kaufpreises. */
  tilgungAnfang: number;
  jeObjekt: Array<{ wohnung: OsWohnung; mehrNetto: number; imRahmen: boolean }>;
}

export function nettoWeg(a: HandbuchAntworten, rahmenBis: number, alter = ALTER_STANDARD): NettoWeg {
  const gemeinsam = a.gemeinsamVeranlagt === true;
  const brutto = BRUTTO_STELLVERTRETER[a.brutto];
  const zve = zveZuBrutto(a.brutto);
  const grenzsatz = grenzsatzProzent(zve, gemeinsam);
  const steuer = steuerlastAusZvE(zve, {
    jahresbrutto: brutto,
    steuerklasse: gemeinsam ? "IV" : "I",
    kinder: 0,
    kirchensteuer: false,
    bestehendeImmobilien: 0,
    hebelziel: "ausgewogen",
  }).summe;
  const lohnsteuerHeute = steuer / 12;
  const sozial = sozialabgaben(brutto, 0) / 12;
  const verkauf = verkaufsAlter(alter);
  const jahr1 = (w: OsWohnung) => rechneWohnung(w, alter, verkauf, grenzsatz).jahr1;
  const jeObjekt = OS_WOHNUNGEN.map((w) => ({
    wohnung: w,
    mehrNetto: Math.max(0, jahr1(w).steuerMonat),
    imRahmen: w.objekt.kaufpreis <= rahmenBis,
  })).sort((x, y) => y.mehrNetto - x.mehrNetto);
  // Dieselbe Regel wie die Beispielwohnung im Handbuch (modell.ts).
  const wohnung = beispielOsWohnung(rahmenBis, grenzsatz);
  const j1 = jahr1(wohnung);
  const mehrNetto = Math.max(0, j1.steuerMonat);
  return {
    bruttoMonat: brutto / 12,
    grenzsatz,
    lohnsteuerHeute,
    sozialabgaben: sozial,
    nettoHeute: brutto / 12 - lohnsteuerHeute - sozial,
    wohnung,
    imRahmen: wohnung.objekt.kaufpreis <= rahmenBis,
    mehrNetto,
    vorSteuer: j1.eigenanteilMonat + j1.steuerMonat,
    anteilNachSteuer: j1.eigenanteilMonat,
    tilgungAnfang: (wohnung.objekt.kaufpreis * 0.012) / 12,
    jeObjekt,
  };
}

export interface VorsorgeStufe {
  anzahl: 1 | 2 | 3;
  wohnungen: WohnungRechnung[];
  /** Zuzahlung vor Steuer im ersten Jahr, alle Wohnungen zusammen. */
  vorSteuer: number;
  /** Eigenanteil nach Steuer, Durchschnitt der ersten zehn Jahre. */
  anteil: number;
  verkaufswert: number;
  kapital: number;
  renteMonat: number;
}

export interface VorsorgeWeg {
  alter: number;
  verkaufsAlter: number;
  stufen: VorsorgeStufe[];
  /** Zusammen über dem heutigen Rahmen: die Bank prüft jeden weiteren Kauf neu. */
  ueberRahmen: boolean;
}

/**
 * Bis zu drei Wohnungen, gekauft mit dem Alter, nach drei und nach sechs
 * Jahren, alle zum Rentenbeginn verkauft. Auswahl wie im Analysetool: zuerst
 * das Konzept des Ziels und was in den Rahmen passt, dann die günstigsten.
 */
export function vorsorgeWeg(a: HandbuchAntworten, rahmenBis: number, alterRoh: number = ALTER_STANDARD): VorsorgeWeg {
  const alter = alterBegrenzt(alterRoh);
  const verkauf = verkaufsAlter(alter);
  const grenzsatz = grenzsatzProzent(zveZuBrutto(a.brutto), a.gemeinsamVeranlagt === true);
  const fokus = a.ziel === "steuer" ? "steuer" : "zusatzrente";
  const reihenfolge = [...OS_WOHNUNGEN].sort((x, y) => Number(y.konzept === fokus) - Number(x.konzept === fokus));
  const auswahl: OsWohnung[] = [];
  let summe = 0;
  for (const w of reihenfolge) {
    if (auswahl.length < 3 && summe + w.objekt.kaufpreis <= rahmenBis) {
      auswahl.push(w);
      summe += w.objekt.kaufpreis;
    }
  }
  for (const w of [...OS_WOHNUNGEN].sort((x, y) => x.objekt.kaufpreis - y.objekt.kaufpreis)) {
    if (auswahl.length >= 3) break;
    if (!auswahl.includes(w)) {
      auswahl.push(w);
      summe += w.objekt.kaufpreis;
    }
  }
  const gerechnet = auswahl.map((w, i) => rechneWohnung(w, alter + i * VORSORGE_ANNAHMEN.kaufAbstandJahre, verkauf, grenzsatz));
  const stufen = ([1, 2, 3] as const).map((anzahl) => {
    const teil = gerechnet.slice(0, anzahl);
    const kapital = teil.reduce((s, w) => s + w.erloes, 0);
    return {
      anzahl,
      wohnungen: teil,
      vorSteuer: teil.reduce((s, w) => s + w.jahr1.eigenanteilMonat + w.jahr1.steuerMonat, 0),
      anteil: teil.reduce((s, w) => s + w.eigenanteilMonat, 0),
      verkaufswert: teil.reduce((s, w) => s + w.verkaufswert, 0),
      kapital,
      renteMonat: Math.round(kapital / (VORSORGE_ANNAHMEN.ruhestandJahre * 12)),
    };
  });
  return { alter, verkaufsAlter: verkauf, stufen, ueberRahmen: summe > rahmenBis };
}
