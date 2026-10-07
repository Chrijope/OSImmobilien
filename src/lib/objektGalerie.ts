import type { ObjektBild } from "./objekteStore";
import type { Sprache } from "@/lib/seitenSprache";
import { OBJEKTSEITE_KUNDEN_TEXTE } from "@/components/objektseite/objektseiteKundenTexte";

/**
 * Die Rechenregeln der Bildergalerie im Objektbereich.
 *
 * Die Galerie zeigt fünf Felder: links ein großes Bild, rechts vier kleine.
 * Vier dieser Felder zeigen immer dasselbe Bild, das fünfte (rechts unten)
 * wechselt von allein durch alle übrigen Bilder.
 *
 * Warum die Aufteilung hier steht und nicht in der Komponente: Welches Bild
 * wo landet und wie viele Bilder gerade nicht zu sehen sind, ist reine
 * Rechnerei ohne Bildschirm. So lässt es sich prüfen, ohne die Galerie zu
 * zeichnen, und die Komponente bleibt Darstellung.
 */

/** So viele Bilder haben gleichzeitig ein Feld: eins groß, vier klein. */
export const FELDER_GESAMT = 5;

/** So viele der kleinen Felder zeigen immer dasselbe Bild. */
export const FESTE_KACHELN = 3;

export interface GalerieAufteilung {
  /** Alle brauchbaren Bilder in Anzeigereihenfolge. */
  alle: ObjektBild[];
  /** Das große Bild links. Fehlt nur, wenn es gar kein Bild gibt. */
  gross?: ObjektBild;
  /** Die kleinen Felder, die immer dasselbe Bild zeigen, höchstens drei. */
  feste: ObjektBild[];
  /** Die Bilder, die sich das wechselnde Feld rechts unten teilt. */
  wechsel: ObjektBild[];
  /** Die Zahl über dem wechselnden Feld: so viele Bilder sieht man gerade nicht. */
  weitere: number;
}

/**
 * Teilt die Bilder auf die fünf Felder auf.
 *
 * Bilder ohne Adresse fallen heraus, der Rest wird nach `reihenfolge`
 * sortiert. Gibt es weniger Bilder als Felder, bleiben die hinteren Listen
 * leer; die Galerie zeichnet dann entsprechend weniger Felder, statt ein
 * leeres zu zeigen.
 */
export function galerieAufteilung(bilder: ObjektBild[] | undefined | null): GalerieAufteilung {
  const alle = (bilder ?? [])
    .filter((b): b is ObjektBild => !!b && typeof b.url === "string" && b.url.trim() !== "")
    .slice()
    .sort((a, b) => (a.reihenfolge || 0) - (b.reihenfolge || 0));

  return {
    alle,
    gross: alle[0],
    feste: alle.slice(1, 1 + FESTE_KACHELN),
    wechsel: alle.slice(1 + FESTE_KACHELN),
    weitere: Math.max(0, alle.length - FELDER_GESAMT),
  };
}

/**
 * Wechselt das Feld rechts unten überhaupt von allein?
 *
 * Nur wenn es mehr als ein Bild zu zeigen hat. Bei genau fünf Bildern steht
 * dort ein festes Bild, und es gibt nichts, worauf gewechselt werden könnte.
 */
export function wechseltVonAllein(aufteilung: GalerieAufteilung): boolean {
  return aufteilung.wechsel.length > 1;
}

/** Das nächste Bild der Reihe, am Ende wieder von vorn. */
export function naechsterIndex(aktuell: number, anzahl: number): number {
  if (anzahl <= 0) return 0;
  return (((aktuell + 1) % anzahl) + anzahl) % anzahl;
}

/** Das vorige Bild der Reihe, am Anfang wieder von hinten. */
export function vorherigerIndex(aktuell: number, anzahl: number): number {
  if (anzahl <= 0) return 0;
  return (((aktuell - 1) % anzahl) + anzahl) % anzahl;
}

/**
 * Der Alternativtext eines Bildes.
 *
 * Er nennt immer die Adresse, damit jemand mit Vorleseprogramm weiß, zu
 * welcher Immobilie das Bild gehört. „Bild 3" allein sagt nichts. Ein
 * gepflegter eigener Text steht vorn, die Adresse dahinter.
 */
export function bildBeschriftung(
  bild: ObjektBild | undefined,
  adresse: string,
  index: number,
  gesamt: number,
  sprache: Sprache = "de",
): string {
  if (!bild) return "";
  // Kundensprache, Etappe 3: Auf öffentlichen Kundenseiten in deren Sprache.
  const t = OBJEKTSEITE_KUNDEN_TEXTE[sprache === "en" ? "en" : "de"].galerie;
  const eigen = (bild.alt || "").trim();
  const ort = (adresse || "").trim();
  const basis = eigen
    ? (ort ? `${eigen}, ${ort}` : eigen)
    : (ort ? t.fotoDerImmobilieIn(ort) : t.fotoDerImmobilie);
  return gesamt > 1 ? `${basis}, ${t.bildVon(index + 1, gesamt)}` : basis;
}
