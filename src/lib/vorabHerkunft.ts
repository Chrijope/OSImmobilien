/**
 * Woher stammt der Wert in einem Feld des Erstgesprächsskripts?
 *
 * Der Vorab-Fragebogen setzt kein Skriptfeld von selbst (siehe Kopf von
 * `bewerberFormular.ts`), die HR-Managerin übernimmt jede Angabe per Klick.
 * Damit gibt es am Datensatz keine Liste "diese Felder kamen aus dem Formular".
 * Die Herkunft wird deshalb aus dem Vergleich abgeleitet: Formularantwort in
 * den Assessment-Wert übersetzt, gegen den aktuellen Feldwert gehalten.
 *
 * Grenze dieses Verfahrens: Tippt jemand von Hand genau den Formularwert, gilt
 * das Feld als übernommen. Das ist gewollt, denn für das Gespräch zählt, ob
 * der Wert mit der schriftlichen Angabe übereinstimmt, nicht wer ihn gesetzt
 * hat.
 */

import {
  FORMULAR_FRAGEN,
  alsAssessmentWert,
  frageFuerFeld,
  frageSichtbar,
  antwortText,
  type FormularAntworten,
  type FormularFrage,
} from "./bewerberFormular";
import type { AssessmentAntworten } from "./assessmentSkript";

export type VorabStatus =
  /** Zu diesem Feld liegt keine verwertbare Vorabangabe vor. */
  | "keine"
  /** Vorabangabe vorhanden, das Feld ist noch leer. */
  | "offen"
  /** Feldwert entspricht der Vorabangabe. */
  | "uebernommen"
  /** Feld ist gefüllt, weicht aber von der Vorabangabe ab. */
  | "abweichend";

export type VorabHerkunft = {
  status: VorabStatus;
  /** Die Formularfrage, die auf das Feld einzahlt. */
  frage?: FormularFrage;
  /** Die Vorabantwort im Klartext, etwa "10 bis 20 Stunden". */
  formularText: string;
};

const KEINE: VorabHerkunft = { status: "keine", formularText: "" };

function istLeer(wert: unknown): boolean {
  if (wert == null) return true;
  if (typeof wert === "string") return wert.trim() === "";
  if (Array.isArray(wert)) return wert.length === 0;
  if (typeof wert === "number") return wert === 0;
  return false;
}

/**
 * Wertvergleich für den Herkunftsabgleich. Listen werden vor dem Vergleich
 * sortiert, weil die Reihenfolge der angeklickten Kacheln nichts aussagt.
 */
function gleich(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) =>
    Array.isArray(v) ? JSON.stringify([...v].map(String).sort()) : JSON.stringify(v ?? "");
  return norm(a) === norm(b);
}

/** Herkunft eines einzelnen Skriptfelds. */
export function vorabHerkunft(
  feldKey: string,
  antworten: FormularAntworten | null | undefined,
  assessment: AssessmentAntworten,
): VorabHerkunft {
  if (!antworten) return KEINE;

  const frage = frageFuerFeld(feldKey);
  if (!frage || !frageSichtbar(frage, antworten)) return KEINE;

  // Ohne tragfähige Entsprechung gibt es nichts zu vergleichen, etwa bei
  // "Etwas anderes" oder "Weiß ich noch nicht".
  const formularWert = alsAssessmentWert(frage, antworten);
  if (formularWert === null) return KEINE;

  const formularText = antwortText(frage, antworten);
  const aktuell = assessment[feldKey as keyof AssessmentAntworten];

  if (gleich(aktuell, formularWert)) return { status: "uebernommen", frage, formularText };
  if (istLeer(aktuell)) return { status: "offen", frage, formularText };
  return { status: "abweichend", frage, formularText };
}

/** Kurztext am Eingabefeld. Leer, wenn nichts zu kennzeichnen ist. */
export function vorabEtikett(status: VorabStatus): string {
  if (status === "uebernommen") return "vom Bewerber vorab beantwortet";
  if (status === "abweichend") return "im Gespräch geändert, weicht von der Vorabangabe ab";
  return "";
}

/** Wird das Feld sichtbar gekennzeichnet? */
export function istGekennzeichnet(status: VorabStatus): boolean {
  return status === "uebernommen" || status === "abweichend";
}

/**
 * Wie viele Skriptfelder kann dieses Formular überhaupt belegen?
 *
 * Bewusst über die Zielfelder und nicht über die Antwortschlüssel: Eine
 * Antwort ohne tragfähige Entsprechung belegt kein Feld.
 */
export function anzahlVorabFelder(antworten: FormularAntworten | null | undefined): number {
  if (!antworten) return 0;
  const gesehen = new Set<string>();
  for (const frage of FORMULAR_FRAGEN) {
    if (!frage.zielFeld || gesehen.has(frage.zielFeld)) continue;
    if (!frageSichtbar(frage, antworten)) continue;
    if (alsAssessmentWert(frage, antworten) === null) continue;
    gesehen.add(frage.zielFeld);
  }
  return gesehen.size;
}
