import type { BlickZeile } from "@/lib/objektKennzahlen";
import type { ObjektWohnung } from "@/lib/objekteStore";
import { dez, eur0, kaltmieteVon, prozent, renditeVon } from "@/lib/objektKennzahlen";
import type { Sprache } from "@/lib/seitenSprache";
import { KUNDENANSICHT_TEXTE } from "./kundenansichtTexte";

/**
 * Texte der Kundenansicht, getrennt von den Bausteinen, damit die
 * Komponentendateien nur Komponenten ausliefern.
 */

/** „Wohnung 7“ aus „WE 7“, auf Englisch „Flat 7“. */
export function wohnungName(w: Pick<ObjektWohnung, "weNr">, sprache: Sprache = "de"): string {
  const t = KUNDENANSICHT_TEXTE[sprache === "en" ? "en" : "de"];
  const nummer = (w.weNr || "").replace(/^WE\s*/i, "").trim();
  return nummer ? t.wohnungName(nummer) : t.wohnungOhneNummer;
}

/**
 * Die Erklärungen an den Objektdetails, für Kunden geschrieben. Die internen
 * Sätze („die eine Rendite im CRM“, „wie am Objekt gepflegt“, „Sie steuert
 * Filter und Musterrechnung“) haben beim Kunden nichts zu suchen.
 */
function kundenErklaerung(sprache: Sprache): Record<string, { info?: string; unterWeg?: boolean }> {
  const e = KUNDENANSICHT_TEXTE[sprache === "en" ? "en" : "de"].erklaerung;
  return {
    bauzustand: { info: e.bauzustand },
    anlageklasse: { info: e.anlageklasse },
    kaltmiete: { info: e.kaltmiete, unterWeg: true },
    rendite: { info: e.rendite },
    vermietet: { unterWeg: true },
  };
}

/**
 * Seit dem 25.09.2026 über den festen Schlüssel `id` der Zeile statt über
 * die Beschriftung, denn die ist auf Englisch eine andere.
 */
export function kundenBlickZeilen(zeilen: BlickZeile[], sprache: Sprache = "de"): BlickZeile[] {
  const erklaerung = kundenErklaerung(sprache);
  return zeilen.map((z) => {
    const neu = z.id ? erklaerung[z.id] : undefined;
    if (!neu) return z;
    return { ...z, ...(neu.info ? { info: neu.info } : {}), ...(neu.unterWeg ? { unter: undefined } : {}) };
  });
}

/** Eine Wohnung, fertig für Tabelle und Karte. Leer heißt: keine Angabe. */
export interface WohnungsZeile {
  id: string;
  name: string;
  etage: string;
  flaeche: string;
  zimmer: string;
  kaltmiete: string;
  kaufpreis: string;
  rendite: string;
}

export function wohnungsZeilen(wohnungen: ObjektWohnung[], heute: string, sprache: Sprache = "de"): WohnungsZeile[] {
  return wohnungen.map((w) => {
    const miete = kaltmieteVon(w, heute);
    const r = renditeVon(w, heute);
    return {
      id: w.id,
      name: wohnungName(w, sprache),
      etage: [w.etage, w.lage].filter(Boolean).join(" "),
      flaeche: w.groesse > 0 ? `${dez(w.groesse, 1, sprache)} m²` : "",
      zimmer: w.zimmer > 0 ? String(w.zimmer) : "",
      kaltmiete: miete > 0 ? eur0(miete, sprache) : "",
      kaufpreis: w.vkGesamt > 0 ? eur0(w.vkGesamt + (w.stellplatzPreis || 0), sprache) : "",
      rendite: r > 0 ? prozent(r, 2, sprache) : "",
    };
  });
}

/**
 * Welche Spalten überhaupt etwas zeigen. Eine Spalte, in der keine Wohnung
 * einen Wert hat, fällt weg. Anlass war die leere Spalte „Etage“: Bei
 * Investagon-Objekten fehlt die Angabe oft für alle Wohnungen.
 */
export function wohnungsSpalten(zeilen: WohnungsZeile[]) {
  const hat = (feld: keyof WohnungsZeile) => zeilen.some((z) => z[feld] !== "");
  return {
    etage: hat("etage"),
    flaeche: hat("flaeche"),
    zimmer: hat("zimmer"),
    kaltmiete: hat("kaltmiete"),
    kaufpreis: hat("kaufpreis"),
    rendite: hat("rendite"),
  };
}
