/**
 * Kaufpreisliste: Verkaufsliste, Mieterliste und Einzelwirtschaftsplan in
 * einer Tabelle. Nachbau der Excel „Kaufpreisliste_Marktstrasse6.xlsx“,
 * Formel für Formel; die Excel-Ausgabe (`kaufpreislisteExport.ts`) schreibt
 * dieselben Formeln.
 *
 * `null` heißt „leer“ wie eine leere Excel-Zelle. Dort, wo Excel bei leeren
 * Eingaben "" zeigt, liefern die Funktionen hier ebenfalls `null`.
 */

export const HAUSGELD_KATEGORIEN = ["umlagefähig", "Heizkosten", "nicht umlagefähig", "Erhaltungsrücklage"] as const;
export type HausgeldKategorie = (typeof HAUSGELD_KATEGORIEN)[number];
export type Verteiler = "MEA" | "WE";
export const KPL_STATUS = ["vermietet", "Leerstand", "Umbau", "Eigennutzung", "reserviert", "verkauft"] as const;

export interface WpPosition {
  id: string;
  position: string;
  kategorie: HausgeldKategorie;
  /** Ansatz der Gemeinschaft pro Jahr in €. */
  ansatzJahr: number | null;
  verteiler: Verteiler;
  hinweis: string;
}

export interface Wirtschaftsplan {
  gesamtMea: number | null;
  /** Verteiler „WE“: gleich je Einheit. */
  anzahlEinheiten: number | null;
  gesamtflaeche: number | null;
  gueltigAb: string;
  positionen: WpPosition[];
  /** MEA einer Einheit für den Abgleich mit einem Einzelwirtschaftsplan. */
  pruefMea: number | null;
}

export interface KplZeile {
  id: string;
  we: string;
  lage: string;
  status: string;
  mieter: string;
  /** ISO-Datum oder leer. */
  mvBeginn: string;
  flaeche: number | null;
  mea: number | null;
  ist: number | null;
  bk: number | null;
  hk: number | null;
  strom: number | null;
  wasser: number | null;
  nk: number | null;
  mwst: number | null;
  /** Leer: Vorgabe des Objekts. */
  sollQm: number | null;
  vk: number | null;
  reserviert: string;
}

export interface KplEingaben {
  objektId: string | null;
  objektName: string;
  ort: string;
  /** ISO-Datum. */
  stand: string;
  sollQmVorgabe: number | null;
  /** Wird nach Verkaufspreis auf die Einheiten verteilt. */
  subventionGesamt: number | null;
  zeilen: KplZeile[];
  wirtschaftsplan: Wirtschaftsplan;
}

export interface KplZeilenErgebnis {
  istQm: number | null;
  gesamtmiete: number | null;
  istJahr: number | null;
  soll: number | null;
  sollJahr: number | null;
  vkQm: number | null;
  renditeIst: number | null;
  renditeSoll: number | null;
  hgUml: number | null;
  hgHk: number | null;
  hgNuml: number | null;
  hgEr: number | null;
  hg: number | null;
  ueberschuss: number | null;
  subvention: number | null;
}

export interface KplGesamt {
  flaeche: number; mea: number; ist: number; bk: number; hk: number; strom: number; wasser: number; nk: number; mwst: number;
  gesamtmiete: number; istJahr: number; soll: number; sollJahr: number; vk: number;
  hgUml: number; hgHk: number; hgNuml: number; hgEr: number; hg: number; ueberschuss: number; subvention: number;
  istQm: number | null; sollQm: number | null; vkQm: number | null; renditeIst: number | null; renditeSoll: number | null;
  vermietet: number;
  einheiten: number;
}

export interface KplErgebnis {
  zeilen: KplZeilenErgebnis[];
  gesamt: KplGesamt;
}

/** Wie N() in Excel: leer zählt 0. */
const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const leer = (v: number | null | undefined) => !(typeof v === "number" && Number.isFinite(v));

/** Summe der Ansätze einer Kategorie mit einem Verteiler (SUMPRODUCT in der Excel). */
export function ansatzSumme(wp: Wirtschaftsplan, kategorie: HausgeldKategorie | null, verteiler: Verteiler): number {
  return wp.positionen
    .filter((p) => p.verteiler === verteiler && (kategorie === null || p.kategorie === kategorie))
    .reduce((s, p) => s + n(p.ansatzJahr), 0);
}

/** Hausgeld pro Monat für einen MEA, eine Kategorie oder (null) alle. */
export function hausgeldMonat(wp: Wirtschaftsplan, mea: number | null, kategorie: HausgeldKategorie | null = null): number | null {
  if (leer(mea) || !n(wp.gesamtMea)) return null;
  const nachMea = (ansatzSumme(wp, kategorie, "MEA") * n(mea)) / n(wp.gesamtMea);
  const jeEinheit = n(wp.anzahlEinheiten) ? ansatzSumme(wp, kategorie, "WE") / n(wp.anzahlEinheiten) : 0;
  return (nachMea + jeEinheit) / 12;
}

export function kategorieSumme(wp: Wirtschaftsplan, kategorie: HausgeldKategorie): number {
  return wp.positionen.filter((p) => p.kategorie === kategorie).reduce((s, p) => s + n(p.ansatzJahr), 0);
}

export function berechneZeile(z: KplZeile, e: KplEingaben, summeVk: number): KplZeilenErgebnis {
  const fl = z.flaeche;
  const hatFl = !leer(fl);
  const istJahr = hatFl ? n(z.ist) * 12 : null;
  const soll = hatFl ? n(fl) * (leer(z.sollQm) ? n(e.sollQmVorgabe) : n(z.sollQm)) : null;
  const sollJahr = soll === null ? null : soll * 12;
  const hatVk = !leer(z.vk) && n(z.vk) !== 0;
  const wp = e.wirtschaftsplan;
  const hgUml = hausgeldMonat(wp, z.mea, "umlagefähig");
  const hgHk = hausgeldMonat(wp, z.mea, "Heizkosten");
  const hgNuml = hausgeldMonat(wp, z.mea, "nicht umlagefähig");
  const hgEr = hausgeldMonat(wp, z.mea, "Erhaltungsrücklage");
  return {
    istQm: hatFl && n(fl) !== 0 ? n(z.ist) / n(fl) : null,
    gesamtmiete: hatFl ? n(z.ist) + n(z.bk) + n(z.hk) + n(z.strom) + n(z.wasser) + n(z.nk) + n(z.mwst) : null,
    istJahr,
    soll,
    sollJahr,
    vkQm: hatFl && n(fl) !== 0 && !leer(z.vk) ? n(z.vk) / n(fl) : null,
    renditeIst: hatVk && hatFl ? n(istJahr) / n(z.vk) : null,
    renditeSoll: hatVk && hatFl ? n(sollJahr) / n(z.vk) : null,
    hgUml, hgHk, hgNuml, hgEr,
    hg: leer(z.mea) ? null : n(hgUml) + n(hgHk) + n(hgNuml) + n(hgEr),
    ueberschuss: hatFl && !leer(z.mea) ? n(soll) - n(hgNuml) - n(hgEr) : null,
    subvention: !leer(z.vk) && !leer(e.subventionGesamt) && summeVk !== 0 ? (n(e.subventionGesamt) * n(z.vk)) / summeVk : null,
  };
}

export function berechneKaufpreisliste(e: KplEingaben): KplErgebnis {
  const summeVk = e.zeilen.reduce((s, z) => s + n(z.vk), 0);
  const zeilen = e.zeilen.map((z) => berechneZeile(z, e, summeVk));
  const sz = (f: (z: KplZeile) => number | null) => e.zeilen.reduce((s, z) => s + n(f(z)), 0);
  const sr = (f: (r: KplZeilenErgebnis) => number | null) => zeilen.reduce((s, r) => s + n(f(r)), 0);
  const flaeche = sz((z) => z.flaeche);
  const ist = sz((z) => z.ist);
  const soll = sr((r) => r.soll);
  const istJahr = sr((r) => r.istJahr);
  const sollJahr = sr((r) => r.sollJahr);
  return {
    zeilen,
    gesamt: {
      flaeche, mea: sz((z) => z.mea), ist,
      bk: sz((z) => z.bk), hk: sz((z) => z.hk), strom: sz((z) => z.strom), wasser: sz((z) => z.wasser), nk: sz((z) => z.nk), mwst: sz((z) => z.mwst),
      gesamtmiete: sr((r) => r.gesamtmiete), istJahr, soll, sollJahr, vk: summeVk,
      hgUml: sr((r) => r.hgUml), hgHk: sr((r) => r.hgHk), hgNuml: sr((r) => r.hgNuml), hgEr: sr((r) => r.hgEr), hg: sr((r) => r.hg),
      ueberschuss: sr((r) => r.ueberschuss), subvention: sr((r) => r.subvention),
      istQm: flaeche ? ist / flaeche : null,
      sollQm: flaeche ? soll / flaeche : null,
      vkQm: flaeche ? summeVk / flaeche : null,
      renditeIst: summeVk ? istJahr / summeVk : null,
      renditeSoll: summeVk ? sollJahr / summeVk : null,
      vermietet: e.zeilen.filter((z) => z.status === "vermietet").length,
      einheiten: e.zeilen.filter((z) => z.we.trim() !== "").length,
    },
  };
}

export const neueKplZeile = (we = ""): KplZeile => ({
  id: crypto.randomUUID(), we, lage: "", status: "", mieter: "", mvBeginn: "", flaeche: null, mea: null,
  ist: null, bk: null, hk: null, strom: null, wasser: null, nk: null, mwst: null, sollQm: null, vk: null, reserviert: "",
});

export const neueWpPosition = (position = "", kategorie: HausgeldKategorie = "umlagefähig", ansatzJahr: number | null = null, verteiler: Verteiler = "MEA", hinweis = ""): WpPosition => ({
  id: crypto.randomUUID(), position, kategorie, ansatzJahr, verteiler, hinweis,
});

/** Die üblichen Positionen eines Wirtschaftsplans, ohne Beträge. */
export const STANDARD_POSITIONEN: [string, HausgeldKategorie, Verteiler?][] = [
  ["Be-/Entwässerung", "umlagefähig"], ["Niederschlagswasser", "umlagefähig"], ["Straßenreinigung", "umlagefähig"],
  ["Abfallentsorgung", "umlagefähig"], ["Recycling", "umlagefähig"], ["Schneebeseitigung", "umlagefähig"],
  ["Hausreinigung", "umlagefähig"], ["Gebäudebetreuung/Hauswart", "umlagefähig"], ["Gartenpflege", "umlagefähig"],
  ["Dachrinnenreinigung", "umlagefähig"], ["Hausbeleuchtung", "umlagefähig"], ["Gebäudeversicherung", "umlagefähig"],
  ["Haftpflichtversicherung", "umlagefähig"], ["Rauchwarnmelder Wartung", "umlagefähig"],
  ["Heizkosten", "Heizkosten"],
  ["Instandhaltung Haus", "nicht umlagefähig"], ["Instandhaltung Heizung", "nicht umlagefähig"],
  ["Rauchwarnmelder Miete", "nicht umlagefähig"], ["Sonstige Kosten", "nicht umlagefähig"],
  ["Verwaltergebühren", "nicht umlagefähig", "WE"], ["Beiratsversicherung", "nicht umlagefähig"],
  ["Kontoführung/Porto/Ausl.", "nicht umlagefähig"], ["Kosten Sondereigentum", "nicht umlagefähig"],
  ["Erhaltungsrücklage", "Erhaltungsrücklage"],
];

export const KPL_STANDARD = (): KplEingaben => ({
  objektId: null,
  objektName: "",
  ort: "",
  stand: new Date().toISOString().slice(0, 10),
  sollQmVorgabe: 10,
  subventionGesamt: null,
  zeilen: [neueKplZeile("WE 1")],
  wirtschaftsplan: {
    gesamtMea: 1000, anzahlEinheiten: null, gesamtflaeche: null, gueltigAb: "", pruefMea: null,
    positionen: STANDARD_POSITIONEN.map(([p, k, v]) => neueWpPosition(p, k, null, v ?? "MEA", v === "WE" ? "je Einheit (Verteiler WE)" : "")),
  },
});

/** Eine gespeicherte Liste. Liegt je Nutzer in `user_settings`, wie beim Ankaufstool. */
export interface KplVersion {
  id: string;
  name: string;
  gespeichertAm: string;
  eingaben: KplEingaben;
}

export const KPL_VERSIONEN_SCHLUESSEL = "kaufpreisliste_versionen";

/** Dateiname ohne Sonderzeichen, etwa „Kaufpreisliste_Marktstraße_6_2026-10-09“. */
export function kplDateiname(e: KplEingaben): string {
  const name = e.objektName.trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return `Kaufpreisliste_${name ? `${name}_` : ""}${new Date().toISOString().slice(0, 10)}`;
}
