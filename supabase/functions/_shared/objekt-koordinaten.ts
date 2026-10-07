/**
 * Die Lage eines Objekts als gespeicherte Koordinate: `objekte.meta.koordinaten`.
 *
 * WARUM ES DIESEN SCHLUESSEL GIBT
 *
 * Die Karte im Exposé braucht einen Punkt für die Nadel des Objekts. Bis zum
 * 23.09.2026 kam er nur aus der gemessenen Standortanalyse; fehlte sie,
 * suchte zeitweise der Browser des Besuchers die Adresse bei Photon (Komoot).
 * Dabei ging die IP-Adresse jedes Besuchers an einen fremden Dienst.
 * Christian will das nicht: Jedes Objekt hat seine Adresse, die Lage gehört
 * gespeichert, nicht bei jedem Aufruf gesucht.
 *
 * Deshalb schreibt der Server die Lage ans Objekt:
 *
 *   - der Investagon-Import aus `lat`/`lng` der Einheiten, `quelle: "investagon"`
 *   - die Standortmessung über die Adresssuche, `quelle: "photon"` oder
 *     `"nominatim"` (`koordinatenInMeta` in `standort-messung.ts`)
 *
 * Diese Datei liest den Wert streng (Bereich, bekannte Quelle) für Karte und
 * Positivlisten. Geschrieben wird er in `standort-messung.ts` und im Import.
 *
 * Die Karte nimmt zuerst den Mittelpunkt der gemessenen Analyse, sonst diesen
 * Schlüssel, sonst gibt es keine Karte. Gefragt wird im Browser niemand.
 *
 * Nur reine Funktionen ohne Deno- oder Browser-API. Der Browser liest die
 * Datei über einen relativen Pfad, wie `standort-messung.ts`.
 */

/** Der Schlüssel in `objekte.meta`. Ein Vertrag zwischen Import, Messung, Positivlisten und Exposé. */
export const KOORDINATEN_META_SCHLUESSEL = "koordinaten";

/** Dieselben Quellen wie `KoordinatenQuelle` in `standort-messung.ts`. */
export type KoordinatenQuelle = "investagon" | "photon" | "nominatim";

export interface ObjektKoordinaten {
  lat: number;
  lng: number;
  quelle: KoordinatenQuelle;
  /** Wann die Lage geschrieben wurde, ISO. */
  am?: string;
}

const QUELLEN: readonly KoordinatenQuelle[] = ["investagon", "photon", "nominatim"];

/**
 * Breite und Länge, wenn sie als Lage taugen: endliche Zahlen im gültigen
 * Bereich, und nicht beide null. „0, 0“ liegt im Golf von Guinea und ist fast
 * immer ein leeres Feld, das jemand mit null gefüllt hat. Zahlen als Text
 * („49.45“) zählen mit, Investagon liefert sie je nach Zugang so.
 */
export function gueltigeLage(lat: unknown, lng: unknown): { lat: number; lng: number } | undefined {
  const zahl = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.trim()) : NaN;
  const b = zahl(lat);
  const l = zahl(lng);
  if (!Number.isFinite(b) || !Number.isFinite(l)) return undefined;
  if (b < -90 || b > 90 || l < -180 || l > 180) return undefined;
  if (b === 0 && l === 0) return undefined;
  return { lat: b, lng: l };
}

/**
 * Den gespeicherten Wert lesen wie Fremddaten. Ohne gültige Lage oder ohne
 * bekannte Quelle gibt es `undefined`.
 */
export function koordinatenAus(wert: unknown): ObjektKoordinaten | undefined {
  if (!wert || typeof wert !== "object" || Array.isArray(wert)) return undefined;
  const w = wert as Record<string, unknown>;
  const lage = gueltigeLage(w.lat, w.lng);
  const quelle = QUELLEN.find((q) => q === w.quelle);
  if (!lage || !quelle) return undefined;
  const am = typeof w.am === "string" && w.am.trim() ? w.am.trim() : undefined;
  return { ...lage, quelle, ...(am ? { am } : {}) };
}
