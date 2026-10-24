/**
 * Filter, mit denen Kapitalanleger suchen (seit 24.10.2026): monatlicher
 * Eigenaufwand, Art der AfA und „sofort reservierbar“.
 *
 * EINE WAHRHEIT. Eigenaufwand und AfA kommen aus derselben Vorbelegung und
 * demselben Rechenkern wie Investmentrechner und Objektscore
 * (`einheitScoreBasis`, `berechneInvestment`). Ohne Kunde rechnet der Kern
 * mit seinen Standardannahmen. Ein Objekt bleibt in der Liste, wenn
 * mindestens eine Einheit im Angebot alle gesetzten Filter erfüllt.
 */
import { berechneInvestment, type InvestmentEingabe } from "./investmentrechner/rechenkern";
import { einheitScoreBasis } from "./objektScoreDaten";
import type { ObjektData, ObjektWohnung } from "./objekteStore";

export type AfaArt = "linear" | "degressiv" | "gutachten" | "7b";

export const AFA_ART_LABEL: Record<AfaArt, string> = {
  linear: "Linear",
  degressiv: "Degressiv",
  gutachten: "Gutachten (Restnutzungsdauer)",
  "7b": "§ 7b",
};

/** Die AfA-Art einer Einheit, so wie der Rechner sie rechnet. */
export function afaArtAus(
  eingabe: Pick<InvestmentEingabe, "depreciationMethod" | "specialDepreciationRate"> | null,
  afaModell: string | undefined,
): AfaArt | null {
  if (!eingabe) return null;
  if ((eingabe.specialDepreciationRate || 0) > 0) return "7b";
  if (eingabe.depreciationMethod === "declining") return "degressiv";
  if (afaModell === "gutachten") return "gutachten";
  return "linear";
}

const aufwandSpeicher = new WeakMap<object, number | null>();

/** Monatlicher Eigenaufwand im ersten Jahr, positiv heißt Zuzahlung. Null ohne Kaufpreis oder Miete. */
export function einheitEigenaufwand(objekt: ObjektData, wohnung: ObjektWohnung): number | null {
  if (aufwandSpeicher.has(wohnung)) return aufwandSpeicher.get(wohnung) ?? null;
  let wert: number | null = null;
  const eingabe = einheitScoreBasis(objekt, wohnung).eingabe;
  if (eingabe) {
    try {
      wert = berechneInvestment(eingabe).eigenanteilMonat;
    } catch {
      // Unvollständige Daten dürfen die Liste nicht zerlegen.
      wert = null;
    }
  }
  aufwandSpeicher.set(wohnung, wert);
  return wert;
}

/** Frei und nicht gerade für einen anderen Kunden vorgemerkt. */
export function sofortReservierbar(w: Pick<ObjektWohnung, "status" | "vorgemerktBis">, jetzt = new Date()): boolean {
  if (w.status !== "frei") return false;
  return !(w.vorgemerktBis && new Date(w.vorgemerktBis).getTime() > jetzt.getTime());
}

export interface AnlegerFilter {
  /** Höchster Eigenaufwand je Monat in Euro, null ohne Grenze. */
  aufwandBis: number | null;
  afaArten: Set<AfaArt>;
  nurReservierbar: boolean;
}

export function anlegerFilterAktiv(f: AnlegerFilter): boolean {
  return f.aufwandBis !== null || f.afaArten.size > 0 || f.nurReservierbar;
}

/** Erfüllt mindestens eine Einheit im Angebot alle gesetzten Filter? */
export function objektErfuelltAnlegerFilter(
  objekt: ObjektData,
  f: AnlegerFilter,
  rechne: {
    aufwand: (o: ObjektData, w: ObjektWohnung) => number | null;
    afaArt: (o: ObjektData, w: ObjektWohnung) => AfaArt | null;
  } = {
    aufwand: einheitEigenaufwand,
    afaArt: (o, w) => afaArtAus(einheitScoreBasis(o, w).eingabe, o.afaDaten?.afaModell),
  },
  jetzt = new Date(),
): boolean {
  if (!anlegerFilterAktiv(f)) return true;
  return (objekt.wohnungen || []).some((w) => {
    if (f.nurReservierbar && !sofortReservierbar(w, jetzt)) return false;
    if (f.afaArten.size > 0) {
      const art = rechne.afaArt(objekt, w);
      if (!art || !f.afaArten.has(art)) return false;
    }
    if (f.aufwandBis !== null) {
      const a = rechne.aufwand(objekt, w);
      if (a === null || a > f.aufwandBis) return false;
    }
    return true;
  });
}
