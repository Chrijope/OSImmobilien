/**
 * Kaufnebenkosten je Bundesland, abgeleitet aus der zentralen Tabelle.
 *
 * Gesamtsatz = Grunderwerbsteuer des Landes plus 1,0 Prozent Notar plus
 * 0,5 Prozent Grundbuch. Die Maklercourtage ist bewusst NICHT enthalten, sie
 * fällt in unserem Geschäft nicht beim Käufer an.
 *
 * Die Sätze standen hier früher als eigene Liste und waren veraltet: Bremen
 * mit 5,0 statt 5,5 und Thüringen mit 6,5 statt 5,0 Prozent. Sie kommen jetzt
 * aus `grunderwerbsteuer.ts`, damit sie nicht wieder auseinanderlaufen.
 */
import { BUNDESLAENDER } from "./grunderwerbsteuer";
import { detectBundesland } from "./bundeslandGrEst";

/** Notar 1,0 Prozent plus Grundbuch 0,5 Prozent, Richtwerte vom Kaufpreis. */
export const NOTAR_PROZENT = 1.0;
export const GRUNDBUCH_PROZENT = 0.5;

/**
 * Die Schlüssel sind älter als die zentrale Tabelle und stecken in
 * gespeicherten Objektdaten. Sie dürfen sich deshalb nicht ändern, auch wenn
 * sie uneinheitlich aussehen.
 */
const NK_SCHLUESSEL: Record<string, string> = {
  bw: "bw",
  by: "bayern",
  be: "berlin",
  bb: "brandenburg",
  hb: "bremen",
  hh: "hamburg",
  he: "hessen",
  mv: "mv",
  ni: "niedersachsen",
  nw: "nrw",
  rp: "rlp",
  sl: "saarland",
  sn: "sachsen",
  st: "sa",
  sh: "sh",
  th: "thueringen",
};

export const BUNDESLAND_NK: { value: string; label: string; pct: number; grEstP: number }[] = [
  ...BUNDESLAENDER.map((land) => ({
    value: NK_SCHLUESSEL[land.id],
    label: land.name,
    grEstP: land.grunderwerbsteuer,
    pct: land.grunderwerbsteuer + NOTAR_PROZENT + GRUNDBUCH_PROZENT,
  })),
  { value: "andere", label: "Anderes / unbekannt", grEstP: 0, pct: 0 },
];

/**
 * Bundesland aus der Postleitzahl, als Schlüssel dieser Liste.
 *
 * Die Zuordnung selbst steht in `detectBundesland`, damit es im CRM nur eine
 * Postleitzahlen-Wahrheit gibt. Vorher lagen hier und dort zwei Fassungen, die
 * sich an mehreren Stellen widersprachen.
 */
export function bundeslandFromPlz(plz: string): string | null {
  const name = detectBundesland(plz);
  if (!name) return null;
  const land = BUNDESLAENDER.find((eintrag) => eintrag.name === name);
  return land ? NK_SCHLUESSEL[land.id] ?? null : null;
}

/**
 * Kaufnebenkosten in Prozent für ein Objekt.
 * Reihenfolge: gespeicherter Wert am Objekt, sonst über die Postleitzahl, sonst 0.
 */
export function kaufnebenkostenPct(opts: { plz?: string; metaPct?: number }): number {
  if (opts.metaPct && opts.metaPct > 0 && opts.metaPct <= 20) return opts.metaPct;
  const bl = bundeslandFromPlz(opts.plz || "");
  if (!bl) return 0;
  return BUNDESLAND_NK.find((b) => b.value === bl)?.pct || 0;
}

/**
 * Der am Objekt gepflegte Kaufnebenkostensatz, egal in welcher Ablage er steht.
 *
 * Es gibt zwei: `meta.kaufnebenkostenPct` und die Spalte
 * `global_kaufnebenkosten`, im Objekt gelesen als
 * `globalDaten.kaufnebenkosten`. Der Anlageassistent fragt den Satz als
 * Pflichtfeld ab und schreibt ihn ausschließlich in die Spalte, gelesen wurde
 * bis 09/2026 aber nur `meta`. Diese Ablage füllt niemand, deshalb war die
 * Eingabe wirkungslos und der Rechner fiel immer auf den Satz nach Bundesland
 * zurück.
 *
 * Behoben wird das auf der Leseseite und nicht durch ein zweites Schreiben:
 * Stünde der Satz künftig in beiden Ablagen, liefen sie auseinander, sobald
 * jemand ihn nur an einer Stelle ändert. Maßgeblich ist die Spalte, weil
 * Assistent, Objektbearbeitung und Exposé-PDF sie ohnehin benutzen. `meta`
 * bleibt für ältere Objekte vorn, dort steht ein bewusst gesetzter Wert.
 *
 * Gibt `undefined` zurück, wenn nichts gepflegt ist. Dann greift wie bisher
 * der Satz nach Bundesland.
 */
export function gepflegterKaufnebenkostenSatz(objekt: {
  meta?: unknown;
  globalDaten?: { kaufnebenkosten?: number | null } | null;
} | null | undefined): number | undefined {
  if (!objekt) return undefined;
  const meta = (objekt.meta || {}) as Record<string, unknown>;
  const kandidaten = [Number(meta.kaufnebenkostenPct), Number(objekt.globalDaten?.kaufnebenkosten)];
  for (const wert of kandidaten) {
    if (Number.isFinite(wert) && wert > 0 && wert <= 20) return wert;
  }
  return undefined;
}

/**
 * Worauf die prozentualen Kaufnebenkosten laufen: Grunderwerbsteuer, Notar,
 * Grundbuch und, falls vorhanden, Makler und Sonstige.
 *
 * Das ist der Kaufpreis der Immobilie: Gesamtkaufpreis ohne Erhaltungsaufwand
 * (seit dem 30.09.2026) und ohne Möbel/Inventar (ebenfalls seit dem
 * 30.09.2026, nachmittags). Beide sind bei uns gesonderte, im Notarvertrag
 * eigens ausgewiesene Leistungen. Sie stecken im Gesamtkaufpreis, tragen aber
 * keine Kaufnebenkosten. Alle Rechner nehmen diese eine Regel, damit sie nicht
 * wieder auseinanderlaufen.
 *
 * Aufwand und Möbel werden nie negativ und zusammen auf den Gesamtkaufpreis
 * gedeckelt: Mehr als der Kaufpreis ist ein Tippfehler, und eine negative
 * Basis ergäbe negative Nebenkosten. Ohne beide ist die Basis genau der
 * Gesamtkaufpreis, alles bleibt dann auf den Cent wie vorher.
 */
export function nebenkostenBasis(gesamtkaufpreis: number, erhaltungsaufwand: number, moebel: number): number {
  const sicher = (wert: number) => (Number.isFinite(wert) ? Math.max(0, wert) : 0);
  const gesamt = sicher(gesamtkaufpreis);
  return gesamt - Math.min(gesamt, sicher(erhaltungsaufwand) + sicher(moebel));
}
