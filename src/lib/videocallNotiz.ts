/**
 * Die durchgehende Notiz des persönlichen Gesprächs.
 *
 * **Ein Feld für das ganze Gespräch, nicht eines je Folie.** Wer spricht, soll
 * nicht überlegen müssen, zu welcher Folie eine Bemerkung gehört. Notizen je
 * Folie erzeugen genau diese Überlegung und zerstreuen das Ergebnis über neun
 * Folien, sodass hinterher niemand alles zusammen liest.
 *
 * Damit die Notiz trotzdem sagt, wovon gerade die Rede war, schreibt die
 * Oberfläche die laufende Folie von selbst darüber, sobald nach einem
 * Folienwechsel der erste Buchstabe fällt. Zuordnen muss niemand etwas, und
 * gelesen wird am Ende ein einziger Text in der Reihenfolge des Gesprächs.
 *
 * Gespeichert wird im vorhandenen Gesprächsstand
 * (`erstgespraechSkript.bewerberVideocall`), also ohne neue Spalte und ohne
 * Migration. Die beiden Schlüssel stehen als Erweiterung hier und nicht in
 * `VideocallErfassung` selbst, damit `bewerberVideocall.ts` unverändert
 * bleibt; sie gehören bei nächster Gelegenheit dorthin.
 */
import type { VideocallErfassung } from "@/lib/bewerberVideocall";

export type NotizFelder = {
  /** Die Notiz des ganzen Gesprächs, ein Text über alle Folien hinweg. */
  notiz?: string;
  /**
   * Die Folie, deren Marke zuletzt in der Notiz steht.
   *
   * Sie verhindert, dass dieselbe Folie zweimal vermerkt wird, und ist der
   * Grund, aus dem beim Weiterblättern noch nichts geschrieben wird: Vermerkt
   * wird erst, wenn wirklich etwas notiert wird.
   */
  notizFolie?: string;
};

/** Der Gesprächsstand samt Notiz. */
export type ErfassungMitNotiz = VideocallErfassung & NotizFelder;

/** Die Notiz aus dem Gesprächsstand lesen, ohne sie zu erfinden. */
export function notizLesen(erfassung: VideocallErfassung | null | undefined): string {
  return (erfassung as ErfassungMitNotiz | null | undefined)?.notiz ?? "";
}

/** Welche Folie zuletzt in der Notiz vermerkt wurde. Leer, wenn keine. */
export function notizFolieLesen(erfassung: VideocallErfassung | null | undefined): string {
  return (erfassung as ErfassungMitNotiz | null | undefined)?.notizFolie ?? "";
}

/** Die Zeile, mit der eine Folie in der Notiz vermerkt wird. */
export function notizMarke(nummer: number, titel: string): string {
  return `Folie ${nummer}, ${titel}`;
}

/**
 * Die Notiz fortschreiben und dabei die laufende Folie vermerken.
 *
 * Vermerkt wird nur, wenn wirklich am Ende weitergeschrieben wird und die
 * laufende Folie noch nicht vermerkt ist. Wer mitten im Text etwas ändert oder
 * etwas löscht, bekommt keine Marke: Eine Marke mitten im Satz wäre schlimmer
 * als gar keine.
 */
export function notizFortschreiben({
  bisher,
  neu,
  folieId,
  folieNummer,
  folieTitel,
  vermerkteFolie,
}: {
  /** Der Text vor der Eingabe. */
  bisher: string;
  /** Der Text, den das Feld nach der Eingabe hat. */
  neu: string;
  /** Die laufende Folie. Leer heißt: keine Marke. */
  folieId: string;
  /** Ihre Nummer im Ablauf, bei eins beginnend. */
  folieNummer: number;
  folieTitel: string;
  /** Die zuletzt vermerkte Folie, aus `notizFolie`. */
  vermerkteFolie: string;
}): Partial<ErfassungMitNotiz> {
  // Ein geleertes Feld fängt von vorn an: Die nächste Eingabe soll wieder
  // sagen, bei welcher Folie sie entstanden ist.
  if (!neu.trim()) return { notiz: neu, notizFolie: "" };

  const angehaengt = neu.length > bisher.length && neu.startsWith(bisher);
  if (!folieId || folieId === vermerkteFolie || !angehaengt) {
    return { notiz: neu, notizFolie: vermerkteFolie };
  }

  const zusatz = neu.slice(bisher.length);
  const vorspann = !bisher
    ? ""
    : bisher.endsWith("\n\n") ? "" : bisher.endsWith("\n") ? "\n" : "\n\n";
  return {
    notiz: `${bisher}${vorspann}${notizMarke(folieNummer, folieTitel)}\n${zusatz}`,
    notizFolie: folieId,
  };
}
