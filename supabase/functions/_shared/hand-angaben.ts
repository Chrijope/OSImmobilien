/**
 * Angaben, die es bisher nur aus Investagon gab, jetzt auch von Hand
 * (Christian, 30.10.2026: Investagon soll wegfallen, jedes Objekt muss sich
 * mit denselben Möglichkeiten im CRM anlegen lassen).
 *
 * Sie liegen in `meta.angaben` an Objekt und Einheit. `handAlsRohdaten`
 * übersetzt sie in die Investagon-Feldnamen, damit jede Stelle, die heute
 * `investagonRaw` liest (Exposé, Objektangaben, Lotse), sie ohne eigene
 * Auslegung mitliest. Die Hand gewinnt gegen Investagon.
 *
 * Dazu kommen Handfelder, die es schon gab, die aber bisher niemand las:
 * Balkon der Einheit, Energiekennwert, Grunderwerbsteuer, Fertigstellung und
 * § 7b am Objekt.
 *
 * Ohne Imports, weil Browser und Edge Functions dieselbe Datei nutzen.
 */

export interface MabvRate {
  bezeichnung: string;
  prozent: number;
}

export interface HandAngaben {
  /** Merkmalsliste wie Investagon „Tags“, eine Zeile je Merkmal, gern „Bezeichnung: Wert“. */
  merkmale?: string[];
  /** Freitexte wie Investagon „Extra 1“ bis „Extra 4“. */
  freitexte?: string[];
  /** Heizungsart als Schlüssel aus `HEIZUNGSARTEN`. */
  heizung?: string;
  stellplatzArt?: string;
  mietArt?: string;
  degressiveAfa?: boolean;
  denkmalAnteil?: number;
  denkmalAfaJahre1bis8?: number;
  denkmalAfaJahre9bis12?: number;
  /** Beginn der Denkmal-AfA, ISO-Datum. */
  denkmalAfaBeginn?: string;
  /** Virtueller Rundgang (https). */
  rundgangUrl?: string;
  /** Kaufpreisraten nach MaBV. */
  mabvRaten?: MabvRate[];
}

/** Dieselben Schlüssel wie Investagon `heating_type`, damit die Anzeige eine Übersetzung hat. */
export const HEIZUNGSARTEN: ReadonlyArray<readonly [string, string]> = [
  ["gas", "Gas"],
  ["district_heating", "Fernwärme"],
  ["oil", "Öl"],
  ["heat_pump", "Wärmepumpe"],
  ["pellet", "Pellets"],
  ["electric", "Strom"],
  ["solar", "Solar"],
];

export const STELLPLATZARTEN = ["Garage", "Tiefgarage", "Stellplatz", "Carport", "Duplex", "Kein Stellplatz"] as const;
export const MIETARTEN = ["Kaltmiete", "Warmmiete", "Pauschalmiete", "Staffelmiete", "Indexmiete"] as const;

/** Die MaBV-Raten nach § 3 Abs. 2 als Vorlage zum Übernehmen. */
export const MABV_VORLAGE: MabvRate[] = [
  { bezeichnung: "Beginn der Erdarbeiten", prozent: 30 },
  { bezeichnung: "Rohbaufertigstellung einschließlich Zimmererarbeiten", prozent: 28 },
  { bezeichnung: "Dachflächen und Dachrinnen", prozent: 5.6 },
  { bezeichnung: "Rohinstallation Heizungsanlagen", prozent: 2.1 },
  { bezeichnung: "Rohinstallation Sanitäranlagen", prozent: 2.1 },
  { bezeichnung: "Rohinstallation Elektroanlagen", prozent: 2.1 },
  { bezeichnung: "Fenstereinbau einschließlich Verglasung", prozent: 7 },
  { bezeichnung: "Innenputz, ausgenommen Beiputzarbeiten", prozent: 4.2 },
  { bezeichnung: "Estrich", prozent: 2.1 },
  { bezeichnung: "Fliesenarbeiten im Sanitärbereich", prozent: 2.8 },
  { bezeichnung: "Bezugsfertigkeit und Zug um Zug gegen Besitzübergabe", prozent: 8.4 },
  { bezeichnung: "Fassadenarbeiten", prozent: 2.1 },
  { bezeichnung: "Vollständige Fertigstellung", prozent: 3.5 },
];

function objekt(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}
function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function zahl(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
function zeilen(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const l = v.map(text).filter((t): t is string => !!t);
  return l.length ? l : undefined;
}

/** Die Handangaben aus `meta.angaben`, bereinigt. Unbrauchbare Werte fallen weg. */
export function handAngabenLesen(meta: unknown): HandAngaben {
  const a = objekt(objekt(meta)?.angaben) ?? {};
  const url = text(a.rundgangUrl);
  const raten = Array.isArray(a.mabvRaten)
    ? a.mabvRaten
      .map((r) => objekt(r))
      .filter((r): r is Record<string, unknown> => !!r && !!text(r.bezeichnung) && zahl(r.prozent) !== undefined)
      .map((r) => ({ bezeichnung: text(r.bezeichnung)!, prozent: zahl(r.prozent)! }))
    : [];
  const ergebnis: HandAngaben = {
    merkmale: zeilen(a.merkmale),
    freitexte: zeilen(a.freitexte),
    heizung: text(a.heizung),
    stellplatzArt: text(a.stellplatzArt),
    mietArt: text(a.mietArt),
    degressiveAfa: typeof a.degressiveAfa === "boolean" ? a.degressiveAfa : undefined,
    denkmalAnteil: zahl(a.denkmalAnteil),
    denkmalAfaJahre1bis8: zahl(a.denkmalAfaJahre1bis8),
    denkmalAfaJahre9bis12: zahl(a.denkmalAfaJahre9bis12),
    denkmalAfaBeginn: text(a.denkmalAfaBeginn),
    // Nur echte https-Adressen: Der Wert landet als Link auf der Seite.
    rundgangUrl: url && /^https:\/\//i.test(url) ? url : undefined,
    mabvRaten: raten.length ? raten : undefined,
  };
  return Object.fromEntries(Object.entries(ergebnis).filter(([, v]) => v !== undefined)) as HandAngaben;
}

const BALKON_TEXT: Record<string, string> = { balkon: "Balkon", terrasse: "Terrasse", loggia: "Loggia", garten: "Garten" };

/**
 * Die Handangaben eines `meta` unter den Investagon-Feldnamen. Leer, wenn
 * nichts gepflegt ist. `virtual_tour_url` und `mabv_raten` gibt es in
 * Investagon so nicht; sie stehen hier, damit alles durch eine Stelle geht.
 */
export function handAlsRohdaten(meta: unknown): Record<string, unknown> {
  const m = objekt(meta) ?? {};
  const a = handAngabenLesen(m);
  const roh: Record<string, unknown> = {};
  const setze = (k: string, v: unknown) => { if (v !== undefined) roh[k] = v; };

  setze("tags", a.merkmale);
  setze("extras", a.freitexte?.map((value, weight) => ({ value, weight })));
  setze("heating_type", a.heizung);
  setze("parking_type", a.stellplatzArt);
  setze("rent_type", a.mietArt);
  setze("degressive_depreciation_building_onoff", a.degressiveAfa === undefined ? undefined : a.degressiveAfa ? 1 : 0);
  setze("share_monument", a.denkmalAnteil);
  setze("depreciation_rate_monument_y1y8", a.denkmalAfaJahre1bis8);
  setze("depreciation_rate_monument_y9y12", a.denkmalAfaJahre9bis12);
  setze("depreciation_start_monument_input", a.denkmalAfaBeginn);
  setze("virtual_tour_url", a.rundgangUrl);
  setze("mabv_raten", a.mabvRaten);

  // Vorhandene Handfelder, die bisher niemand las.
  setze("object_balcony", BALKON_TEXT[String(m.balkonArt ?? "")]);
  setze("power_consumption", zahl(objekt(m.energieausweis)?.kennwert));
  setze("transaction_tax_rate", zahl(objekt(m.kaufnebenkostenTeile)?.grunderwerbsteuer));
  const neubau = objekt(m.neubau);
  setze("end_building_phase_date", text(neubau?.fertigstellung));
  if (neubau && typeof neubau.sonderAfa7b === "boolean") setze("depreciation_special_7b_onoff", neubau.sonderAfa7b ? 1 : 0);
  return roh;
}

/**
 * Investagon-Rohdaten mit den Handangaben darüber. `metas` von allgemein nach
 * speziell (erst Objekt, dann Einheit): Die spätere gewinnt. `undefined`, wenn
 * weder Rohdaten noch Handangaben da sind, wie bisher ohne Investagon.
 */
export function mitHandAngaben(roh: unknown, ...metas: unknown[]): Record<string, unknown> | undefined {
  const basis = objekt(roh);
  const hand = Object.assign({}, ...metas.map(handAlsRohdaten)) as Record<string, unknown>;
  if (!basis && Object.keys(hand).length === 0) return undefined;
  return { ...(basis ?? {}), ...hand };
}
