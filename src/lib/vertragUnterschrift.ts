import type { Bewerber } from "./bewerbungStore";

/**
 * Was in der Stufe Vertrag ueber die Unterschrift zu sagen ist.
 *
 * Ein Vertrag hat in diesem Haus ZWEI Unterschriften, und die Liste muss sie
 * auseinanderhalten:
 *
 * 1. Der Bewerber unterschreibt. Dann steht `vertragBewerberSignedAt`, und der
 *    Vertrag wartet auf die Gegenzeichnung durch Christian Kurz.
 * 2. Christian Kurz zeichnet gegen. Dann steht `vertragSignedAt`, und der
 *    Vertrag ist fertig.
 *
 * Vom 19. bis 23.09.2026 lagen beide Zustaende nebeneinander in der Stufe
 * Vertrag, weil Bewerber ohne Lead-Paket nach der Gegenzeichnung dort liegen
 * blieben. Seit dem 23.09.2026 geht es nach der Gegenzeichnung sofort weiter
 * (siehe `supabase/functions/_shared/lead-paket.ts`); die Unterscheidung
 * bleibt fuer Altbestand und fuer die Liste trotzdem richtig.
 *
 * Ein einzelnes Datum ohne diese Unterscheidung waere irrefuehrend. "Seit dem
 * 14.09. unterschrieben" heisst einmal "erledigt, es geht weiter" und einmal
 * "wir warten seit fuenf Tagen auf eine Unterschrift im eigenen Haus", und das
 * ist ein Unterschied, an dem Arbeit haengt.
 */
export interface Unterschriftsstand {
  /** Das Datum der juengsten vorliegenden Unterschrift, deutsch formatiert. */
  datum: string;
  /** Der Bewerber hat unterschrieben, die Gegenzeichnung fehlt noch. */
  wartetAufKurz: boolean;
}

/** Ein ISO- oder deutsches Datum als "TT.MM.JJJJ", oder leer. */
function deutsch(wert?: string): string {
  const roh = (wert || "").trim();
  if (!roh) return "";
  const d = new Date(roh);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Liefert den Stand, oder null, wenn noch niemand unterschrieben hat.
 *
 * Die Gegenzeichnung hat Vorrang: Liegt sie vor, ist der Vertrag fertig, ganz
 * gleich was sonst noch in `meta` steht.
 */
export function unterschriftsstand(b: Bewerber): Unterschriftsstand | null {
  const fertig = deutsch(b.vertragSignedAt);
  if (fertig) return { datum: fertig, wartetAufKurz: false };

  const vomBewerber = deutsch(b.vertragBewerberSignedAt);
  if (vomBewerber) return { datum: vomBewerber, wartetAufKurz: true };

  // Rueckfall fuer Altbestand: Der Vertragsstand sagt, dass gegengezeichnet
  // werden muss, ein Datum steht aber nicht dabei. Dann ist die Aussage
  // "unterschrieben, Datum unbekannt" immer noch nuetzlicher als ein Strich.
  if (b.vertragStatus === "wartet_auf_kurz") return { datum: "", wartetAufKurz: true };

  return null;
}
