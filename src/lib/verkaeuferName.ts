/**
 * Firma oder Privatperson: wer verkauft und wie sein Name geschrieben wird.
 *
 * Der Verkäufer war überall ein einziges Feld „Name“. Für die
 * Reservierungsvereinbarung genügte das, denn dort steht der Name in einer
 * Zeile. Der Notar-Aufnahmebogen verlangt dagegen Nachname und Vorname
 * getrennt, und um beides zu füllen, wurde der Name bis 09/2026 am letzten
 * Leerzeichen geteilt. Aus „Musterbau Projektentwicklung GmbH“ wurde damit
 * Nachname „GmbH“ und Vorname „Musterbau Projektentwicklung“, und genau so
 * ging es zum Notar.
 *
 * Geraten wird deshalb nicht mehr. Stattdessen wird gewählt, bevor jemand
 * tippt: Entweder Firma, dann gibt es genau ein Namensfeld. Oder
 * Privatperson, dann Vorname und Nachname getrennt. Bei Bauträgern ist die
 * Firma der Regelfall, deshalb steht sie links.
 *
 * Bestehende Einträge haben diese Wahl nicht. Sie bleiben stehen und werden
 * weiter angezeigt, die Wahl bleibt offen, bis jemand sie trifft. Erraten wird
 * sie nur, wo es ein Beleg und keine Vermutung ist: Eine Privatperson steht
 * nicht im Handelsregister, ein Handelsregistereintrag heißt also Firma.
 *
 * Die Angaben liegen dort, wo der Verkäufer schon liegt, also in frei geformtem
 * JSON: `investments.meta.objektVerkaeufer`, `investments.meta.kaufvertragData`,
 * `objekte.meta.verkaeuferDaten` und den Reservierungen in den
 * Benutzereinstellungen. Eine Datenbankänderung braucht es dafür nicht.
 */

export type VerkaeuferArt = "firma" | "person";

/** Was an einer Stelle über den Namen des Verkäufers bekannt ist. */
export interface VerkaeuferAngabe {
  /** Leer, solange niemand gewählt hat. */
  art?: VerkaeuferArt | "" | null;
  /** Firmenname bei „Firma“, Nachname bei „Privatperson“. */
  name?: string | null;
  /** Nur bei „Privatperson“. */
  vorname?: string | null;
  /** Handelsregisternummer. Liegt sie vor, ist es belegbar eine Firma. */
  handelsregister?: string | null;
}

/** Ist das eine der beiden Möglichkeiten und nicht irgendein Altwert? */
export function istVerkaeuferArt(wert: unknown): wert is VerkaeuferArt {
  return wert === "firma" || wert === "person";
}

/**
 * Die gewählte Art, oder „“, solange offen.
 *
 * Der Handelsregistereintrag ist der einzige Anhaltspunkt, der zählt: Er ist
 * ein Beleg. Aus „Musterbau Projektentwicklung GmbH“ eine Firma herauszulesen
 * wäre dieselbe Sorte Vermutung wie die Teilung am letzten Leerzeichen, nur
 * eine Ebene höher. Solange nichts gewählt ist, bleibt die Antwort leer, und
 * die Oberfläche fragt.
 */
export function verkaeuferArt(v: VerkaeuferAngabe | null | undefined): VerkaeuferArt | "" {
  if (!v) return "";
  if (istVerkaeuferArt(v.art)) return v.art;
  if (String(v.handelsregister ?? "").trim()) return "firma";
  return "";
}

/**
 * Der Name in einer Zeile, so wie er in einem Dokument steht.
 *
 * Zusammengesetzt wird immer aus beiden Feldern, und deshalb geht nie etwas
 * verloren. Bei einer Firma ist das zweite Feld normalerweise leer, dann
 * bleibt es beim Firmennamen. Steht dort doch noch etwas, etwa die vordere
 * Hälfte einer alten Teilung, kommt sie wieder davor und der ursprüngliche
 * Name steht wieder da.
 */
export function verkaeuferVollerName(v: VerkaeuferAngabe | null | undefined): string {
  if (!v) return "";
  const name = String(v.name ?? "").trim();
  const vorname = String(v.vorname ?? "").trim();
  return [vorname, name].filter(Boolean).join(" ");
}

/**
 * Die beiden Namensfelder des Notar-Aufnahmebogens.
 *
 * Eine Firma füllt nur das erste, eine Privatperson beide. Geteilt wird
 * nirgends mehr.
 */
export function verkaeuferNotarFelder(
  v: VerkaeuferAngabe | null | undefined,
): { name: string; vorname: string } {
  if (!v) return { name: "", vorname: "" };
  if (verkaeuferArt(v) === "person") {
    return { name: String(v.name ?? "").trim(), vorname: String(v.vorname ?? "").trim() };
  }
  return { name: verkaeuferVollerName(v), vorname: "" };
}

/** Wie das Namensfeld heißt, je nach Wahl. */
export function verkaeuferNameLabel(art: VerkaeuferArt | "" | null | undefined): string {
  if (art === "firma") return "Firma";
  if (art === "person") return "Nachname";
  return "Name oder Firma";
}
