import type { AktivitaetEntry } from "./aktivitaetenStore";

/** Ist die Notiz als Favorit angepinnt? Gemeinsam fuer alle am Kunden. */
export function istAngepinnt(a: Pick<AktivitaetEntry, "angepinntAm">): boolean {
  return !!a.angepinntAm;
}

/**
 * Angepinnte Notizen zuerst, danach der uebrige Verlauf.
 *
 * Jede Notiz steht genau einmal da. Die Reihenfolge innerhalb beider Teile
 * bleibt, wie sie hereinkommt, im Verlauf also nach Datum, neueste oben.
 */
export function angepinnteZuerst<T extends Pick<AktivitaetEntry, "angepinntAm">>(liste: T[]): T[] {
  return [...liste.filter(istAngepinnt), ...liste.filter((a) => !istAngepinnt(a))];
}
