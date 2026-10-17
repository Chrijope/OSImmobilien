/**
 * Brutto- und Netto-Mietrendite einer Einheit (Christian, 17.10.2026).
 *
 * Bis dahin galt „eine Rendite im CRM“: zwölf Kaltmieten durch Kaufpreis.
 * Die bleibt als Bruttorendite unverändert (`renditeVon`). Dazu kommt die
 * Nettorendite, wie sie in den Listen der Hausverwaltung und im Bauträger-
 * Abgleich steht:
 *
 *   Netto = (Jahreskaltmiete − 12 × (nicht umlagefähiges Hausgeld + Rücklage))
 *           / (Kaufpreis × (1 + Kaufnebenkosten in %))
 *
 * Wie bei der Bruttorendite zählt nur die Wohnung, ein Stellplatz bleibt
 * getrennt (Regel M20). Die Kaufnebenkosten kommen aus dem Satz am Objekt,
 * sonst nach Bundesland (Berlin 8,0 %, Brandenburg 8,5 %).
 */
import { gepflegterKaufnebenkostenSatz, kaufnebenkostenPct } from "./kaufnebenkosten";
import { getHausgeldNichtUmlegbarForWohnung, type ObjektData, type ObjektWohnung } from "./objekteStore";
import { kaltmieteVon } from "./objektKennzahlen";

export interface RenditeEingabe {
  kaltmieteMonat: number;
  kaufpreis: number;
  /** Nicht umlagefähiges Hausgeld je Monat, ohne Rücklage. */
  nichtUmlagefaehigMonat: number;
  ruecklageMonat: number;
  kaufnebenkostenProzent: number;
}

/** Als Bruch (0,05 = 5 %); null, wenn Miete oder Kaufpreis fehlt. */
export function bruttoRendite(kaltmieteMonat: number, kaufpreis: number): number | null {
  return kaltmieteMonat > 0 && kaufpreis > 0 ? (kaltmieteMonat * 12) / kaufpreis : null;
}

export function nettoRendite(e: RenditeEingabe): number | null {
  if (!(e.kaltmieteMonat > 0) || !(e.kaufpreis > 0)) return null;
  const ertrag = 12 * (e.kaltmieteMonat - Math.max(0, e.nichtUmlagefaehigMonat) - Math.max(0, e.ruecklageMonat));
  return ertrag / (e.kaufpreis * (1 + Math.max(0, e.kaufnebenkostenProzent) / 100));
}

/** Die Werte einer Einheit für die Nettorendite, aus Objekt und Einheit. */
export function renditeEingabe(objekt: ObjektData, w: ObjektWohnung, kaltmieteMonat: number): RenditeEingabe {
  // Gepflegter Euro-Betrag zuerst; ohne ihn die Schätzung des CRM (Anteil am Hausgeld), dann ohne eigene Rücklage.
  const gepflegt = typeof w.hausgeldNichtUmlagefaehigEuro === "number" && w.hausgeldNichtUmlagefaehigEuro > 0;
  return {
    kaltmieteMonat,
    kaufpreis: w.vkGesamt || 0,
    nichtUmlagefaehigMonat: gepflegt ? w.hausgeldNichtUmlagefaehigEuro! : getHausgeldNichtUmlegbarForWohnung(objekt, w),
    ruecklageMonat: gepflegt ? w.ruecklageZufuehrungMonat || 0 : 0,
    kaufnebenkostenProzent: kaufnebenkostenPct({ plz: objekt.plz, metaPct: gepflegterKaufnebenkostenSatz(objekt) }),
  };
}

/** Nettorendite einer Einheit in Prozent (5,02 statt 0,0502), wie `renditeVon` für die Bruttorendite. */
export function nettoRenditeProzent(objekt: ObjektData, w: ObjektWohnung): number | null {
  const r = nettoRendite(renditeEingabe(objekt, w, kaltmieteVon(w)));
  return r === null ? null : r * 100;
}

/** Spanne der Nettorendite über die Einheiten eines Objekts, in Prozent; null ohne Werte. */
export function nettoRenditeSpanne(objekt: ObjektData): { von: number; bis: number } | null {
  const werte = objekt.wohnungen.map((w) => nettoRenditeProzent(objekt, w)).filter((r): r is number => r !== null);
  return werte.length ? { von: Math.min(...werte), bis: Math.max(...werte) } : null;
}
