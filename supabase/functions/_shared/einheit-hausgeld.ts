/**
 * Das Hausgeld einer Einheit, eine Regel für CRM, Functions und Import
 * (05.10.2026).
 *
 * Seit dem 28.10.2026 (Christian): Hausgeld je Monat = umlagefähig + nicht
 * umlagefähig, nur wenn beide erfasst sind. Die Erhaltungsrücklage
 * (Zuführung) gehört nicht dazu, sie steht getrennt in `ruecklage`. Was der
 * Eigentümer monatlich an die WEG überweist, ist die `vorauszahlung` =
 * Hausgeld + Rücklage. Die Rücklage kostet also weiter Liquidität, wird aber
 * nicht als Hausgeld ausgewiesen.
 *
 * Ein von Hand gepflegtes `meta.hausgeldMonat` geht vor. Bis zum 28.10.2026
 * war das Feld „Hausgeld gesamt“ samt Rücklage, und der Import schrieb diese
 * Summe dorthin. Ein gepflegter Wert, der genau umlagefähig + nicht
 * umlagefähig + Rücklage ist, gilt deshalb als alte Summe: Hausgeld ist dann
 * die Summe der beiden Hausgeld-Teile. So braucht der Bestand keine
 * Datenänderung.
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
  /** Hausgeld = umlagefähig + nicht umlagefähig, ohne Rücklage. Auf Cent gerundet. */
  hausgeld?: number;
  /** Vorauszahlung an die WEG = Hausgeld + Rücklage; nur wenn beide bekannt. Auf Cent gerundet. */
  vorauszahlung?: number;
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
  const summe = umlagefaehig !== undefined && nichtUmlagefaehig !== undefined
    ? r2(umlagefaehig + nichtUmlagefaehig)
    : undefined;
  const gepflegt = positiv(m.hausgeldMonat);
  const alteSumme = summe !== undefined && ruecklage !== undefined && gepflegt !== undefined &&
    Math.abs(gepflegt - (summe + ruecklage)) < 0.01;
  const hausgeld = alteSumme ? summe : gepflegt ?? summe;
  return {
    umlagefaehig,
    nichtUmlagefaehig,
    ruecklage,
    hausgeld,
    vorauszahlung: hausgeld !== undefined && ruecklage !== undefined ? r2(hausgeld + ruecklage) : undefined,
    sevVerwaltung: positiv(m.verwaltungSevMonat) ?? positiv(roh.property_management_fee_sev),
  };
}

/**
 * `meta` einer Einheit mit `hausgeldMonat` nach der Regel oben, ohne Rücklage.
 * Für gefilterte Antworten. Überschreibt auch ein gespeichertes, weil das alte
 * Summen samt Rücklage sein können; ein Handwert kommt unverändert durch.
 */
export function mitHausgeldMonat(gefiltert: Record<string, unknown>, quelle: unknown): Record<string, unknown> {
  const hausgeld = hausgeldTeile(quelle).hausgeld;
  return hausgeld === undefined ? gefiltert : { ...gefiltert, hausgeldMonat: hausgeld };
}
