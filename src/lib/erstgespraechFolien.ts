/**
 * Teil 1 des Präsentationsdecks: die Folien zum Erstgespräch.
 *
 * Das Erstgesprächsskript (assessmentSkript.ts) ist die einzige Textquelle.
 * Jede Station, die eine Folie hat, trägt dort ein Feld `folie` mit Titel,
 * Karten und Stichworten. Diese Datei leitet daraus die Folienliste ab und
 * ergänzt, was aus anderen Konstanten derselben Datei kommt: die vier Pfade
 * (ASSESSMENT_PFADE) für die Profil-Folie und die Einwände
 * (ASSESSMENT_EINWAENDE) für die Fragen-Folie. Nichts davon wird hier
 * abgeschrieben, damit Skript und Folien nie auseinanderlaufen.
 *
 * Stationen ohne Folie: Punkt 6 (Wer wir sind) geht in Teil 2 auf, Punkt 9
 * (Einschätzung) und Punkt 10 (Terminbuchung) sind Zwischenstopps der
 * Moderation, die der Bewerber nie sieht.
 *
 * Gerendert werden die Folien in ClosingPraesentationEntwurf.tsx, die
 * Reihenfolge im Gesamtdeck steht in praesentationsDeck.ts.
 */

import {
  ASSESSMENT_EINWAENDE,
  ASSESSMENT_PFADE,
  ASSESSMENT_STATIONEN,
  type AssessmentFolie,
  type AssessmentFolieKarte,
  type AssessmentStation,
} from "./assessmentSkript";

export type ErstgespraechFolie = {
  /** Folien-Id, identisch mit folie.id der Station */
  id: string;
  /** Key der Station im Skript */
  stationKey: string;
  stationNummer: number;
  /** Die vollständige Folie, mit den abgeleiteten Karten und Stichworten */
  folie: AssessmentFolie;
};

const mitPunkt = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Die vier Pfade als Karten (Pfad A bis D), aus ASSESSMENT_PFADE. */
export function pfadKarten(): AssessmentFolieKarte[] {
  return ASSESSMENT_PFADE.map((p, i) => ({
    ueber: `Pfad ${String.fromCharCode(65 + i)}`,
    titel: p.label,
    text: mitPunkt(p.beschreibung),
  }));
}

/** Die Einwände als Stichworte, aus ASSESSMENT_EINWAENDE. */
export function einwandStichworte(): string[] {
  return ASSESSMENT_EINWAENDE.map((e) => e.einwand);
}

/** Ergänzt die Folie einer Station um die Teile, die aus anderen Konstanten kommen. */
function leiteFolieAb(station: AssessmentStation, folie: AssessmentFolie): AssessmentFolie {
  if (station.key === "profil") return { ...folie, karten: pfadKarten() };
  if (station.key === "einwaende") return { ...folie, stichworte: einwandStichworte() };
  return folie;
}

export const ERSTGESPRAECH_FOLIEN: ErstgespraechFolie[] = ASSESSMENT_STATIONEN.flatMap((s) =>
  s.folie
    ? [{ id: s.folie.id, stationKey: s.key, stationNummer: s.nummer, folie: leiteFolieAb(s, s.folie) }]
    : [],
);

export function getErstgespraechFolie(id: string): ErstgespraechFolie | null {
  return ERSTGESPRAECH_FOLIEN.find((f) => f.id === id) ?? null;
}

/**
 * Zerlegt einen Titel in den Teil vor dem Glanzwort, das Glanzwort und den
 * Rest. Bei Anrede wandert der Vorname vor das Satzzeichen am Ende:
 * "Hol mich mal ab." wird zu "Hol mich mal ab, Max." Ohne Vornamen bleibt
 * der Titel, wie er ist. Fehlt das Glanzwort im Titel, bleibt alles im
 * vorderen Teil, dann steht der Titel ohne Glanz da statt kaputt.
 */
export function zerlegeTitel(
  titel: string,
  glanz: string,
  vorname?: string,
  anrede?: boolean,
): { vor: string; glanz: string; nach: string } {
  const name = (vorname ?? "").trim();
  const voll = anrede && name ? titel.replace(/([.!?])\s*$/, `, ${name}$1`) : titel;
  const pos = glanz ? voll.indexOf(glanz) : -1;
  if (pos < 0) return { vor: voll, glanz: "", nach: "" };
  return { vor: voll.slice(0, pos), glanz, nach: voll.slice(pos + glanz.length) };
}

export type TextTeil = { text: string; akzent: boolean };

/**
 * Zerlegt einen Text mit *Stern-Markierung* in Teile: markierte Stellen
 * bekommen akzent = true. Ein einzelner, nicht geschlossener Stern bleibt
 * einfach Text.
 */
export function zerlegeAkzente(text: string): TextTeil[] {
  const teile: TextTeil[] = [];
  const muster = /\*([^*]+)\*/g;
  let letzte = 0;
  for (const treffer of text.matchAll(muster)) {
    const start = treffer.index ?? 0;
    if (start > letzte) teile.push({ text: text.slice(letzte, start), akzent: false });
    teile.push({ text: treffer[1], akzent: true });
    letzte = start + treffer[0].length;
  }
  if (letzte < text.length) teile.push({ text: text.slice(letzte), akzent: false });
  return teile;
}
