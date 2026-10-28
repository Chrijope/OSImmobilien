/**
 * Standardannahmen und Neubau-Angaben am Objekt (Christian, 28.10.2026).
 *
 * Beides liegt in `objekte.meta` (`standardannahmen`, `neubau`) und ist NUR
 * Vorbelegung für den Investmentrechner: `vorbelegungAusEinheit` setzt die
 * Werte in die Rechner-Eingabe, statt sie irgendwo aufzuschlagen. Reihenfolge:
 * Rechner-Standard → Objekt-Standard (hier) → eigene Eingabe im Rechner. Eine
 * Eingabe im Rechner gewinnt immer; gespeicherte Berechnungen bleiben, wie sie
 * sind. Doppelt gerechnet wird also nichts.
 */

export interface Standardannahmen {
  /** Prozent je Jahr. Leer heißt: Rechner-Standard. 0 ist ein gültiger Wert. */
  wertsteigerung?: number;
  mietsteigerung?: number;
  kostensteigerung?: number;
  /** Grenzsteuersatz in Prozent; wirkt im Rechner nur im Modus „Grenzsteuersatz“. */
  grenzsteuersatz?: number;
}

export interface NeubauAngaben {
  /** Sonderabschreibung nach § 7b EStG an oder aus. */
  sonderAfa7b?: boolean;
  /** Bemessungsgrundlage in € je m² laut Bauträger. Nur zur Information, der Rechner prüft und deckelt selbst (4.000 €/m²). */
  sonderAfa7bBasisQm?: number;
  sonderAfa7bJahre?: number;
  kfwProgramm?: string;
  /** Kredithöhe je Einheit in €. */
  kfwKredit?: number;
  /** Prozent p. a. */
  kfwZins?: number;
  /** Anfängliche Tilgung in Prozent; der Rechner rechnet mit Laufzeit, deshalb nur zur Information. */
  kfwTilgung?: number;
  /** Tilgungszuschuss in Prozent des Kredits. */
  kfwTilgungszuschuss?: number;
  /** Denkmal- oder Sanierungsanteil in Prozent des Kaufpreises. */
  denkmalAnteil?: number;
  /** Steuerliche Fertigstellung beziehungsweise Ende der Bauphase, ISO-Datum. */
  fertigstellung?: string;
  /** Beginn der Mieteinnahmen, ISO-Datum. */
  mieteinnahmenAb?: string;
  /** Vorverkauf oder Vorankündigung. */
  vorverkauf?: boolean;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const zahl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function standardannahmenAus(meta: unknown): Standardannahmen {
  const s = obj(obj(meta).standardannahmen);
  return {
    wertsteigerung: zahl(s.wertsteigerung),
    mietsteigerung: zahl(s.mietsteigerung),
    kostensteigerung: zahl(s.kostensteigerung),
    grenzsteuersatz: zahl(s.grenzsteuersatz),
  };
}

export function neubauAus(meta: unknown): NeubauAngaben {
  const n = obj(obj(meta).neubau);
  return {
    sonderAfa7b: n.sonderAfa7b === true || undefined,
    sonderAfa7bBasisQm: zahl(n.sonderAfa7bBasisQm),
    sonderAfa7bJahre: zahl(n.sonderAfa7bJahre),
    kfwProgramm: text(n.kfwProgramm),
    kfwKredit: zahl(n.kfwKredit),
    kfwZins: zahl(n.kfwZins),
    kfwTilgung: zahl(n.kfwTilgung),
    kfwTilgungszuschuss: zahl(n.kfwTilgungszuschuss),
    denkmalAnteil: zahl(n.denkmalAnteil),
    fertigstellung: text(n.fertigstellung),
    mieteinnahmenAb: text(n.mieteinnahmenAb),
    vorverkauf: n.vorverkauf === true || undefined,
  };
}

/** Ohne leere Einträge, oder `undefined`, wenn nichts übrig bleibt. Für `meta`. */
export function ohneLeere<T extends object>(werte: T): T | undefined {
  const rest = Object.fromEntries(Object.entries(werte).filter(([, v]) => v !== undefined && v !== "" && v !== false));
  return Object.keys(rest).length ? (rest as T) : undefined;
}
