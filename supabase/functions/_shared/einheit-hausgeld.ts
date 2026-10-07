/**
 * Das Hausgeld einer Einheit, eine Regel für CRM, Functions und Import
 * (05.10.2026).
 *
 * Hausgeld gesamt je Monat = umlagefähig + nicht umlagefähig + Rücklage
 * (Zuführung), nur die Werte der Wohnung, und nur wenn alle drei erfasst
 * sind. Ein von Hand gepflegtes `meta.hausgeldMonat` geht vor.
 *
 * Bewusst ohne die `*_parking`-Werte: Der Stellplatz ist im CRM optional,
 * Kaufpreis (`vk_gesamt`) und Miete (`miete_gesamt`) enthalten ihn nicht.
 * Ein Hausgeld mit Stellplatz neben Preis und Miete ohne ihn verzerrte
 * Rendite und Cashflow.
 *
 * Die SEV-Verwaltung ist kein Hausgeld (sie geht an die Sondereigentums-
 * verwaltung, nicht an die WEG) und steht deshalb getrennt in `sevVerwaltung`.
 *
 * Jeder Teil kommt zuerst aus `meta` (Import oder Handpflege), sonst aus
 * `meta.investagonRaw`. So zeigt der Bestand das Hausgeld sofort, ohne
 * neuen Import. Eine 0 gilt als „nicht erfasst“, wie im Lotsen.
 */

function alsObjekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Eine positive Zahl, auch als Text. 0, leer und Unsinn gelten als nicht erfasst. */
function positiv(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim().replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface HausgeldTeile {
  umlagefaehig?: number;
  nichtUmlagefaehig?: number;
  ruecklage?: number;
  /** Auf Cent gerundet. */
  gesamt?: number;
  /** Kein Hausgeld, nur zur getrennten Anzeige. */
  sevVerwaltung?: number;
}

/** Die Teile des Hausgelds aus `wohnungen.meta` (samt `investagonRaw`). */
export function hausgeldTeile(meta: unknown): HausgeldTeile {
  const m = alsObjekt(meta) ?? {};
  const roh = alsObjekt(m.investagonRaw) ?? {};
  const umlagefaehig = positiv(m.hausgeldUmlagefaehigEuro) ?? positiv(roh.operation_cost_tenant_apartment);
  const nichtUmlagefaehig = positiv(m.hausgeldNichtUmlagefaehigEuro) ?? positiv(roh.operation_cost_landlord_apartment);
  const ruecklage = positiv(m.ruecklageZufuehrungMonat) ?? positiv(roh.operation_cost_reserve_apartment);
  const summe = umlagefaehig !== undefined && nichtUmlagefaehig !== undefined && ruecklage !== undefined
    ? r2(umlagefaehig + nichtUmlagefaehig + ruecklage)
    : undefined;
  return {
    umlagefaehig,
    nichtUmlagefaehig,
    ruecklage,
    gesamt: positiv(m.hausgeldMonat) ?? summe,
    sevVerwaltung: positiv(m.verwaltungSevMonat) ?? positiv(roh.property_management_fee_sev),
  };
}

/** `meta` einer Einheit mit `hausgeldMonat`, falls es fehlt und sich rechnen lässt. Für gefilterte Antworten. */
export function mitHausgeldMonat(gefiltert: Record<string, unknown>, quelle: unknown): Record<string, unknown> {
  if (positiv(gefiltert.hausgeldMonat) !== undefined) return gefiltert;
  const gesamt = hausgeldTeile(quelle).gesamt;
  return gesamt === undefined ? gefiltert : { ...gefiltert, hausgeldMonat: gesamt };
}
