/**
 * Listendaten je Einheit (17.10.2026, Stufe 1 der Objektdaten).
 *
 * Alles, was die Excel-Listen eines Objekts über eine Einheit sagen und das
 * CRM sonst nirgends führt: Haus, MEA, Sollmiete, Mietsubvention, die Teile
 * des Hausgelds laut Liste, Mieterhöhungen, die Garantie laut Liste und die
 * Häkchen „Unterlage vorhanden“. Die Werte stehen 1:1 wie in der Liste in
 * `wohnungen.meta.listendaten`, mit Quelle. Der Investagon-Abgleich lässt den
 * Schlüssel stehen.
 *
 * Bewusst NICHT übernommen werden Freitextspalten (Hinweise, Belege,
 * Vermerke): Darin stehen oft Mieternamen, und Einheitendaten sehen auch
 * Vertriebspartner. Namen gehören in die Mietertabelle.
 */
import { cacheGet } from "./dataCache";
import type { Zelle } from "./excelLesen";
import { excelDatumIso } from "./excelLesen";

export type ListenFeldTyp = "zahl" | "datum" | "marker" | "text";

export interface ListenFeld {
  schluessel: string;
  label: string;
  typ: ListenFeldTyp;
  /** Erkennung am normalisierten Spaltenkopf (klein, einfache Leerzeichen). */
  erkennung: (kopf: string) => boolean;
  /** Gruppe für die Anzeige in der Einheitenliste. */
  gruppe: "einheit" | "miete" | "hausgeld" | "garage" | "unterlagen";
}

const gleich = (...w: string[]) => (h: string) => w.includes(h);
const beginnt = (...w: string[]) => (h: string) => w.some((x) => h.startsWith(x));

export const LISTEN_FELDER: ListenFeld[] = [
  { schluessel: "haus", label: "Haus", typ: "text", gruppe: "einheit", erkennung: gleich("haus") },
  { schluessel: "status", label: "Status laut Liste", typ: "text", gruppe: "einheit", erkennung: gleich("status") },
  { schluessel: "teEinheit", label: "Einheit laut Teilungserklärung", typ: "text", gruppe: "einheit", erkennung: beginnt("einheit laut teilungserklärung") },
  { schluessel: "zimmer", label: "Zimmer laut Liste", typ: "text", gruppe: "einheit", erkennung: beginnt("zimmer") },
  { schluessel: "mea", label: "MEA", typ: "zahl", gruppe: "einheit", erkennung: (h) => h === "mea" || h.startsWith("mea /") || h.startsWith("mea (") },
  { schluessel: "flaecheTe", label: "Fläche laut Teilungserklärung", typ: "zahl", gruppe: "einheit", erkennung: beginnt("wohnfläche m² laut teilungserklärung") },
  { schluessel: "sollMiete", label: "Sollmiete", typ: "zahl", gruppe: "miete", erkennung: (h) => h === "sollmiete mtl." || h.startsWith("soll/13 €") },
  { schluessel: "mietsubvention", label: "Mietsubvention (einmalig)", typ: "zahl", gruppe: "miete", erkennung: gleich("mietsubvention") },
  { schluessel: "bkVorauszahlung", label: "BK-Vorauszahlung", typ: "zahl", gruppe: "miete", erkennung: gleich("bk-vorausz.", "bkv") },
  { schluessel: "hkVorauszahlung", label: "HK-Vorauszahlung", typ: "zahl", gruppe: "miete", erkennung: gleich("hk-vorausz.", "hkv") },
  { schluessel: "letzteErhoehung", label: "Letzte Mieterhöhung", typ: "text", gruppe: "miete", erkennung: beginnt("letzte mieterhöhung") },
  { schluessel: "naechsteErhoehungAb", label: "Nächste Erhöhung ab", typ: "datum", gruppe: "miete", erkennung: beginnt("erhöhung 1: wirksam ab") },
  { schluessel: "naechsteErhoehungMiete", label: "Miete nach nächster Erhöhung", typ: "zahl", gruppe: "miete", erkennung: beginnt("erhöhung 1: neue miete") },
  { schluessel: "mieteIn3Jahren", label: "Erreichbare Miete in 3 Jahren", typ: "zahl", gruppe: "miete", erkennung: beginnt("erreichbare miete in 3 j") },
  { schluessel: "uebergabe", label: "Übergabe (Nutzen und Lasten)", typ: "datum", gruppe: "miete", erkennung: beginnt("übergabe / nutzen-lasten") },
  { schluessel: "garantieLaufzeitListe", label: "Garantie über Laufzeit laut Liste", typ: "zahl", gruppe: "miete", erkennung: beginnt("mietdifferenz-garantie in den 36 monaten") },
  { schluessel: "zahlungGesamtListe", label: "Unsere Zahlung gesamt laut Liste", typ: "zahl", gruppe: "miete", erkennung: beginnt("unsere zahlung gesamt") },
  { schluessel: "hausgeldGesamt", label: "Hausgeld gesamt", typ: "zahl", gruppe: "hausgeld", erkennung: (h) => h.startsWith("hausgeld gesamt mtl") || h === "wohngeld 2026" },
  { schluessel: "hausgeldUmlagefaehig", label: "davon umlagefähig", typ: "zahl", gruppe: "hausgeld", erkennung: (h) => h.startsWith("davon umlagefähig") || h === "umlagefähig mtl." },
  { schluessel: "hausgeldNichtUmlagefaehig", label: "davon nicht umlagefähig", typ: "zahl", gruppe: "hausgeld", erkennung: (h) => h.startsWith("davon nicht umlagefähig") || h === "nicht umlagef. mtl." },
  { schluessel: "ruecklage", label: "Erhaltungsrücklage", typ: "zahl", gruppe: "hausgeld", erkennung: (h) => h.startsWith("davon erhaltungsrücklage") || h === "erhaltungsrückl. mtl." },
  { schluessel: "heizkosten", label: "Heizkosten", typ: "zahl", gruppe: "hausgeld", erkennung: gleich("heizkosten mtl.") },
  { schluessel: "garageSollMiete", label: "Sollmiete Garage", typ: "zahl", gruppe: "garage", erkennung: gleich("sollmiete garage") },
  { schluessel: "garageGekuendigtZum", label: "Garage gekündigt zum", typ: "datum", gruppe: "garage", erkennung: gleich("gekündigt zum") },
  { schluessel: "unterlageFotos", label: "Fotos", typ: "marker", gruppe: "unterlagen", erkennung: gleich("fotos", "fotos vorhanden") },
  { schluessel: "unterlageGrundriss", label: "Grundriss", typ: "marker", gruppe: "unterlagen", erkennung: gleich("grundriss", "grundriss vorhanden") },
  { schluessel: "unterlageGrundbuch", label: "Grundbuchauszug", typ: "marker", gruppe: "unterlagen", erkennung: gleich("gba") },
  { schluessel: "unterlageMietvertrag", label: "Mietvertrag", typ: "marker", gruppe: "unterlagen", erkennung: gleich("mietverträge", "mietvertrag vorhanden") },
  { schluessel: "unterlageWirtschaftsplan", label: "Wirtschaftsplan", typ: "marker", gruppe: "unterlagen", erkennung: gleich("wirtschaftsplan vorhanden") },
];

export type ListenWert = string | number | boolean;

export interface Listendaten {
  werte: Record<string, ListenWert>;
  /** Datei und Blatt, aus denen die Werte zuletzt kamen. */
  quelle?: string;
  /** ISO-Datum der Übernahme. */
  stand?: string;
}

/** Zellwert nach Feldtyp; null, wenn die Zelle nichts sagt. */
export function listenWertLesen(feld: ListenFeld, z: Zelle | undefined): ListenWert | null {
  if (z === null || z === undefined || z === "") return null;
  switch (feld.typ) {
    case "zahl": {
      if (typeof z === "number") return Number.isFinite(z) ? z : null;
      const t = String(z).replace(/[€\s]/g, "");
      if (!/^-?[\d.,]+$/.test(t)) return null;
      const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
      return Number.isFinite(n) ? n : null;
    }
    case "datum": {
      const iso = excelDatumIso(z);
      return iso || null;
    }
    case "marker": {
      const t = String(z).trim().toLocaleLowerCase("de-DE");
      if (/^(x|ja|✓|vorhanden)\b/.test(t)) return true;
      if (/^(nein|–|-|fehlt)\b/.test(t)) return false;
      return null;
    }
    default: {
      // Datumswerte in Textspalten (etwa „Letzte Mieterhöhung“) lesbar machen.
      const iso = typeof z === "number" ? excelDatumIso(z) : "";
      return iso || String(z).trim() || null;
    }
  }
}

export function listendatenAusMeta(meta: unknown): Listendaten | null {
  const l = (meta as { listendaten?: Listendaten } | null)?.listendaten;
  return l && typeof l === "object" && l.werte && typeof l.werte === "object" ? l : null;
}

export function listendatenFuerEinheit(wohnungId: string): Listendaten | null {
  const zeile = cacheGet("wohnungen").find((w: { id: string }) => w.id === wohnungId);
  return listendatenAusMeta(zeile?.meta);
}

export function listenZahl(l: Listendaten | null, schluessel: string): number | null {
  const v = l?.werte[schluessel];
  return typeof v === "number" ? v : null;
}
