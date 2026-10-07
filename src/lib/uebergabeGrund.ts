/**
 * Der Grund, warum ein Lead von einem Vertriebspartner an einen anderen geht.
 *
 * Warum es ihn gibt: Wer einen Lead bekommt, soll wissen, warum er ihn
 * bekommt. Ohne diese eine Zeile ruft der neue Partner an und weiss weder,
 * was vorher besprochen wurde, noch warum der Kollege abgegeben hat.
 *
 * Der Grund ist ein Text zwischen Kollegen. Er bleibt am Kontakt stehen und
 * ist spaeter noch lesbar. Deshalb sind die Vorschlaege sachlich formuliert
 * und beschreiben die Lage, nicht die Person.
 *
 * Gespeichert wird er in `meta.beraterHistorie` am Kontakt, also in der
 * Verlaufsspur, die es schon gibt (siehe `beraterHistorie.ts`). Es entsteht
 * kein zweites Feld daneben.
 */

/** Ein angebotener Grund. `sonstiges` verlangt zusaetzlich einen Freitext. */
export interface UebergabeGrundOption {
  key: string;
  /** Was auf dem Knopf steht. */
  label: string;
  /** Kurze Erlaeuterung fuer den Mauszeiger. */
  hinweis: string;
}

/**
 * Die Vorschlaege, in der Reihenfolge, in der sie im Vertrieb vorkommen.
 *
 * Ausgewaehlt nach dem, was eine Uebergabe im Immobilienvertrieb wirklich
 * ausloest:
 * - Abwesenheit und Auslastung sind die beiden haeufigsten Faelle, sie stehen
 *   deshalb vorn.
 * - "Kein Kontakt zustande gekommen" ist der stille Dauerbrenner: Der Lead
 *   wurde mehrfach nicht erreicht und bekommt bei jemand anderem eine neue
 *   Chance.
 * - Region, Sprache und fachliche Eignung sind die sachlichen Zuschnitte.
 * - Der Kundenwunsch ist selten, aber dann eindeutig.
 * - "Partner ausgeschieden" braucht das Abschalten eines Kontos, sonst
 *   stuende dort gar kein Grund.
 * - "Sonstiges" faengt alles auf, was keine Liste vorhersieht.
 */
export const UEBERGABE_GRUENDE: readonly UebergabeGrundOption[] = [
  { key: "abwesenheit", label: "Urlaub oder Abwesenheit", hinweis: "Der bisherige Partner ist nicht erreichbar." },
  { key: "auslastung", label: "Auslastung", hinweis: "Der bisherige Partner hat gerade zu viel auf dem Tisch." },
  { key: "kein_kontakt", label: "Kein Kontakt zustande gekommen", hinweis: "Mehrfach versucht, der Lead bekommt einen neuen Anlauf." },
  { key: "region", label: "Region passt besser", hinweis: "Der neue Partner ist naeher am Kunden." },
  { key: "eignung", label: "Fachliche Eignung", hinweis: "Der neue Partner kennt diese Art von Fall besser." },
  { key: "sprache", label: "Sprache", hinweis: "Der neue Partner spricht die Sprache des Kunden." },
  { key: "kundenwunsch", label: "Wunsch des Kunden", hinweis: "Der Kunde hat um den Wechsel gebeten." },
  { key: "ausgeschieden", label: "Partner ausgeschieden", hinweis: "Das Konto des bisherigen Partners wurde abgeschaltet." },
  { key: "sonstiges", label: "Sonstiges", hinweis: "Bitte kurz im Freitext beschreiben." },
] as const;

/** Der Schluessel, der einen Freitext erzwingt. */
export const GRUND_SONSTIGES = "sonstiges";

/** Ein erfasster Grund: gewaehlter Schluessel und optionale Ergaenzung. */
export interface UebergabeGrund {
  key?: string;
  text?: string;
}

/** Wie lang die Ergaenzung hoechstens sein darf. */
export const GRUND_TEXT_MAX = 300;

export function findeGrund(key?: string | null): UebergabeGrundOption | undefined {
  return UEBERGABE_GRUENDE.find((g) => g.key === (key || "").trim());
}

/**
 * Reicht das, um die Uebergabe abzuschicken?
 *
 * Ein bekannter Schluessel genuegt. Nur "Sonstiges" verlangt zusaetzlich
 * einen Freitext, sonst waere es ein Grund, der nichts sagt.
 */
export function grundVollstaendig(grund?: UebergabeGrund | null): boolean {
  const key = (grund?.key || "").trim();
  if (!key) return false;
  if (!findeGrund(key)) return false;
  if (key === GRUND_SONSTIGES) return (grund?.text || "").trim().length > 0;
  return true;
}

/**
 * Der Grund als ein Satz, so wie ihn der empfangende Partner liest.
 *
 * Beispiel: "Urlaub oder Abwesenheit: bis zum 30.09. im Urlaub".
 * Ohne gueltigen Grund kommt ein leerer Text zurueck, damit der Aufrufer
 * nicht versehentlich "undefined" in eine Nachricht schreibt.
 */
export function grundSatz(grund?: UebergabeGrund | null): string {
  const option = findeGrund(grund?.key);
  if (!option) return (grund?.text || "").trim();
  const text = (grund?.text || "").trim();
  return text ? `${option.label}: ${text}` : option.label;
}

/**
 * Den Grund so zuschneiden, wie er gespeichert wird.
 *
 * Trimmt, kuerzt den Freitext auf die erlaubte Laenge und wirft unbekannte
 * Schluessel weg. Gibt `undefined` zurueck, wenn nichts Brauchbares uebrig
 * bleibt.
 */
export function normalisiereGrund(grund?: UebergabeGrund | null): UebergabeGrund | undefined {
  const key = (grund?.key || "").trim();
  const text = (grund?.text || "").trim().slice(0, GRUND_TEXT_MAX);
  if (!findeGrund(key)) return text ? { text } : undefined;
  return text ? { key, text } : { key };
}
