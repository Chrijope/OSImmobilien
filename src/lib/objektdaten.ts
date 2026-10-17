/**
 * Objektdaten: die objektbezogenen Listen aus Bauträger-Sicht, seit dem
 * 17.10.2026 (Umsetzungsstrategie „Bauträger-Listen“, Stufe 1 und 2).
 *
 * Die Listen sind reine Ansichten auf `objekte` und `wohnungen`. Sie halten
 * keine eigenen Werte, damit Liste, Objektseite, Exposé und Rechner immer
 * dieselbe Zahl zeigen. Hier steht nur die Rechnung, die Seite liegt in
 * `src/pages/Objektdaten.tsx`.
 */
import {
  DEFAULT_WOHNUNG_DOCS, getAktuelleMiete,
  type ObjektData, type ObjektDokument, type ObjektWohnung, type WohnungDokument,
} from "@/lib/objekteStore";
import type { Mieter } from "@/lib/mieterStore";

export {
  OBJEKTDATEN_ROUTE, OBJEKTDATEN_EINHEITEN_ROUTE, OBJEKTDATEN_VOLLSTAENDIGKEIT_ROUTE, OBJEKTDATEN_MIETER_ROUTE, OBJEKTDATEN_ROLLEN,
  darfObjektdaten, istObjektdatenRoute,
} from "@/lib/objektdatenZugang";

/**
 * Welche Objekte eine Rolle in den Listen sieht. Der Objektpartner nur die
 * eigenen, wie in der Objektverwaltung (`Objekte.tsx`).
 */
export function objekteFuerRolle(objekte: ObjektData[], rolle: string, benutzerId?: string | null): ObjektData[] {
  if (rolle !== "objektpartner") return objekte;
  if (!benutzerId) return [];
  return objekte.filter((o) => (o.erstellt_von || (o as { meta?: { erstelltVon?: string } }).meta?.erstelltVon) === benutzerId);
}

// ── Einheitenliste ──

export interface EinheitZeile {
  id: string;
  weNr: string;
  lage: string;
  status: string;
  flaeche: number | null;
  zimmer: number | null;
  mieteMonat: number | null;
  mieteQm: number | null;
  kaufpreis: number | null;
  kaufpreisQm: number | null;
  /** Jahresmiete durch Kaufpreis, als Bruch (0,05 = 5 %). */
  rendite: number | null;
  hausgeldMonat: number | null;
  kaeufer: string;
}

const positiv = (n: unknown): number | null => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

/** Status im Klartext: Verkauf vor Vermietung, wie in der Kaufpreisliste. */
export function einheitStatus(w: ObjektWohnung): string {
  if (w.status === "verkauft") return "verkauft";
  if (w.status === "reserviert") return "reserviert";
  switch (w.vermietungsStatus) {
    case "vermietet": return "vermietet";
    case "gekuendigt": return "gekündigt";
    case "eigennutzung": return "Eigennutzung";
    case "in_vermietung": return "in Vermietung";
    case "leerstand": return "Leerstand";
  }
  return w.vermietet ? "vermietet" : "Leerstand";
}

export function einheitZeile(w: ObjektWohnung): EinheitZeile {
  const flaeche = positiv(w.groesse);
  const miete = positiv(getAktuelleMiete(w));
  const kaufpreis = positiv(w.vkGesamt);
  return {
    id: w.id,
    weNr: w.weNr || "",
    lage: [w.etage, w.lage].filter(Boolean).join(" "),
    status: einheitStatus(w),
    flaeche,
    zimmer: positiv(w.zimmer),
    mieteMonat: miete,
    mieteQm: miete && flaeche ? miete / flaeche : null,
    kaufpreis,
    kaufpreisQm: kaufpreis && flaeche ? kaufpreis / flaeche : null,
    rendite: miete && kaufpreis ? (miete * 12) / kaufpreis : null,
    hausgeldMonat: positiv(w.hausgeldMonat),
    kaeufer: w.status === "frei" ? "" : w.kundeName || "",
  };
}

export interface EinheitenSumme {
  einheiten: number;
  flaeche: number;
  mieteMonat: number;
  kaufpreis: number;
  /** Nur über Einheiten mit Miete und Kaufpreis, sonst zöge Leerstand die Rendite ins Leere. */
  rendite: number | null;
  vermietet: number;
  frei: number;
  reserviert: number;
  verkauft: number;
}

export function einheitenSumme(zeilen: EinheitZeile[]): EinheitenSumme {
  let flaeche = 0, miete = 0, kaufpreis = 0, mieteMitPreis = 0, preisMitMiete = 0;
  let vermietet = 0, reserviert = 0, verkauft = 0;
  for (const z of zeilen) {
    flaeche += z.flaeche ?? 0;
    miete += z.mieteMonat ?? 0;
    kaufpreis += z.kaufpreis ?? 0;
    if (z.mieteMonat && z.kaufpreis) { mieteMitPreis += z.mieteMonat; preisMitMiete += z.kaufpreis; }
    if (z.status === "vermietet" || z.status === "gekündigt") vermietet++;
    if (z.status === "reserviert") reserviert++;
    if (z.status === "verkauft") verkauft++;
  }
  return {
    einheiten: zeilen.length, flaeche, mieteMonat: miete, kaufpreis,
    rendite: preisMitMiete > 0 ? (mieteMitPreis * 12) / preisMitMiete : null,
    vermietet, reserviert, verkauft,
    frei: zeilen.length - reserviert - verkauft,
  };
}

// ── Vollständigkeit ──

/*
 * Geprüft werden die Unterlagenfächer, die das Objektformular schon anlegt
 * (`DEFAULT_WOHNUNG_DOCS`, `defaultDokumente`). Welche davon für den
 * Vertriebsstart Pflicht sind, hat Christian am 17.10.2026 bewusst offen
 * gelassen. Deshalb zählt jedes Fach gleich, und die Liste zeigt nur, was da
 * ist und was fehlt.
 */
export const EINHEIT_FAECHER: readonly string[] = DEFAULT_WOHNUNG_DOCS.map((d) => d.name);
export const OBJEKT_FAECHER: readonly string[] = [
  "Exposé", "Objektbeschreibung", "Objektbilder", "Lageplan", "Versicherungsnachweis",
  "Energieausweis", "Aufteilungsplan", "Grundbuchauszug", "Teilungserklärung", "Wohnflächenberechnung",
];

const norm = (s: string) => s.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();

/**
 * Liegt für das Fach eine Datei vor? Leere Standardfächer tragen keine URL.
 * Investagon und Handupload benennen Dateien frei („Mietvertrag WE 5.pdf“),
 * deshalb reicht es, wenn der Fachname im Dateinamen vorkommt.
 */
export function fachBelegt(fach: string, dokumente: Array<Pick<ObjektDokument | WohnungDokument, "name" | "url">>): boolean {
  const f = norm(fach);
  return dokumente.some((d) => !!d.url && norm(d.name || "").includes(f));
}

export interface EinheitVollstaendigkeit {
  id: string;
  weNr: string;
  /** Fachname → vorhanden. */
  faecher: Record<string, boolean>;
  vorhanden: number;
  gesamt: number;
}

export function einheitVollstaendigkeit(w: ObjektWohnung): EinheitVollstaendigkeit {
  const doks = w.dokumente || [];
  const faecher: Record<string, boolean> = {};
  for (const fach of EINHEIT_FAECHER) {
    // Wohnungsbilder zählen auch, wenn sie in der Bildergalerie der Einheit liegen.
    faecher[fach] = fachBelegt(fach, doks) || (fach === "Wohnungsbilder" && (w.bilder?.length ?? 0) > 0);
  }
  const vorhanden = Object.values(faecher).filter(Boolean).length;
  return { id: w.id, weNr: w.weNr || "", faecher, vorhanden, gesamt: EINHEIT_FAECHER.length };
}

export interface ObjektVollstaendigkeit {
  faecher: Record<string, boolean>;
  vorhanden: number;
  gesamt: number;
  einheiten: EinheitVollstaendigkeit[];
  /** Fehlende Fächer über alle Einheiten, je Fach gezählt. */
  fehlendJeFach: Record<string, number>;
  /** Anteil aller belegten Fächer (Objekt und Einheiten) von 0 bis 1. */
  anteil: number;
}

export function objektVollstaendigkeit(o: ObjektData): ObjektVollstaendigkeit {
  const faecher: Record<string, boolean> = {};
  for (const fach of OBJEKT_FAECHER) {
    faecher[fach] = fachBelegt(fach, o.dokumente || []) || (fach === "Objektbilder" && (o.bilder?.length ?? 0) > 0);
  }
  const vorhanden = Object.values(faecher).filter(Boolean).length;
  const einheiten = (o.wohnungen || []).map(einheitVollstaendigkeit);
  const fehlendJeFach: Record<string, number> = {};
  for (const fach of EINHEIT_FAECHER) fehlendJeFach[fach] = einheiten.filter((e) => !e.faecher[fach]).length;
  const belegt = vorhanden + einheiten.reduce((s, e) => s + e.vorhanden, 0);
  const gesamt = OBJEKT_FAECHER.length + einheiten.length * EINHEIT_FAECHER.length;
  return { faecher, vorhanden, gesamt: OBJEKT_FAECHER.length, einheiten, fehlendJeFach, anteil: gesamt > 0 ? belegt / gesamt : 0 };
}

// ── Mieter und Mietverträge ──

/*
 * Mieter liegen in der Tabelle `mieter` (`mieterStore.ts`), je Zeile ein
 * Mietverhältnis an einer Einheit (`wohneinheitId`). Die Kaltmiete am
 * Mietverhältnis und die Miete an der Einheit (Vertriebssicht) sind zwei
 * Felder; die Liste gleicht sie nicht still an, sondern zeigt eine Abweichung.
 */

/** Ausgezogene Mieter belegen die Einheit nicht mehr. */
const BELEGT: readonly Mieter["status"][] = ["aktiv", "neu", "gekuendigt"];

/** Der aktuelle Mieter einer Einheit: belegt, bei mehreren der mit dem spätesten Beginn. */
export function aktuellerMieter(mieter: Mieter[], wohnungId: string): Mieter | undefined {
  return mieter
    .filter((m) => m.wohneinheitId === wohnungId && BELEGT.includes(m.status))
    .sort((a, b) => (b.mietvertragBeginn || "").localeCompare(a.mietvertragBeginn || ""))[0];
}

export interface MieterZeile {
  wohnungId: string;
  weNr: string;
  lage: string;
  mieter?: Mieter;
  /** Kaltmiete laut Einheit, für den Abgleich. */
  mieteEinheit: number | null;
  /** Mietvertrag am Mieter oder im Unterlagenfach der Einheit. */
  vertragVorhanden: boolean;
  mieteAbweichend: boolean;
}

export function mieterZeilen(objekt: ObjektData, mieter: Mieter[]): MieterZeile[] {
  return (objekt.wohnungen || []).map((w) => {
    const m = aktuellerMieter(mieter, w.id);
    const mieteEinheit = positiv(getAktuelleMiete(w));
    const vertragVorhanden = !!m?.dokumente?.some((d) => d.typ === "mietvertrag" && !!d.url) || fachBelegt("Mietvertrag", w.dokumente || []);
    return {
      wohnungId: w.id,
      weNr: w.weNr || "",
      lage: [w.etage, w.lage].filter(Boolean).join(" "),
      mieter: m,
      mieteEinheit,
      vertragVorhanden,
      // Ab 0,50 € Unterschied, damit Rundungen keine Warnung auslösen.
      mieteAbweichend: !!m && m.kaltmiete > 0 && mieteEinheit !== null && Math.abs(m.kaltmiete - mieteEinheit) >= 0.5,
    };
  });
}
