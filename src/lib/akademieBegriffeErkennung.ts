// Begriffserkennung im Lehrtext der Vertriebsakademie.
//
// Aufgabe: Einen Fließtext in Abschnitte zerlegen, von denen einige einem
// Eintrag aus `AKADEMIE_BEGRIFFE` entsprechen. Die Darstellung übernimmt
// `BegriffsText`, hier steht nur die reine Suche, damit sie prüfbar bleibt.
//
// Die Fallen, die diese Datei bewusst behandelt:
//   1. Ein Begriff darf nicht in einem längeren Wort anspringen. „Bonität"
//      steckt in „Bonitätsprüfung", „Grundbuch" in „Grundbuchamt". Geprüft
//      wird auf Buchstaben und Ziffern links und rechts, nicht mit `\b`. In
//      JavaScript greift `\b` bei Umlauten falsch, „Bonität" endet dort schon
//      vor dem „ä".
//   2. Die längste Übereinstimmung gewinnt, sonst frisst „AfA" das
//      „Sonder-AfA".
//   3. Beugungen kommen über das Feld `schreibweisen`. Kein Stemmer, keine
//      zusätzliche Abhängigkeit.
//   5. Je Abschnitt wird ein Begriff nur bei der ersten Nennung markiert.
//      Dafür trägt der Markierer eine Merkliste über mehrere Textblöcke
//      hinweg. Bei jedem Vorkommen wären es im echten Inhalt 366 Markierungen
//      statt 221, der Text würde unruhig.
//
// Falle 4 (Skripte tragen keine Erklärknöpfe) ist keine Sache dieser Datei:
// Skripte rendern in `CopyBlock`, Lehrtexte in `SectionBlock`. Aufgerufen
// wird die Erkennung nur dort.

import type { AkademieBegriff } from "./akademieBegriffe";

/** Ein Stück Text, entweder gewöhnlich oder als erkannter Begriff. */
export type BegriffsSegment =
  | { typ: "text"; text: string }
  | { typ: "begriff"; text: string; begriff: AkademieBegriff };

interface Muster {
  /** Kleingeschriebene Suchform. */
  suche: string;
  laenge: number;
  begriff: AkademieBegriff;
}

/**
 * Buchstabe oder Ziffer? Genau daran hängt die Wortgrenze.
 * Bindestrich und Punkt zählen bewusst nicht dazu, damit „AfA" in
 * „AfA-Satz" gefunden wird.
 */
function istWortzeichen(zeichen: string | undefined): boolean {
  if (!zeichen) return false;
  return /[\p{L}\p{N}]/u.test(zeichen);
}

/**
 * Alle Suchformen nach erstem Zeichen gruppiert, je Gruppe nach Länge
 * absteigend. Das erste Zeichen dient nur als schneller Vorfilter, die
 * eigentliche Prüfung vergleicht die ganze Suchform.
 */
function baueMusterIndex(begriffe: readonly AkademieBegriff[]): Map<string, Muster[]> {
  const index = new Map<string, Muster[]>();
  for (const b of begriffe) {
    const formen = [b.begriff, ...(b.schreibweisen ?? [])];
    for (const form of formen) {
      const suche = form.trim().toLowerCase();
      if (!suche) continue;
      const schluessel = suche[0];
      const liste = index.get(schluessel);
      const muster: Muster = { suche, laenge: form.trim().length, begriff: b };
      if (liste) liste.push(muster);
      else index.set(schluessel, [muster]);
    }
  }
  // Falle 2: längste Übereinstimmung zuerst prüfen.
  for (const liste of index.values()) liste.sort((a, b) => b.laenge - a.laenge);
  return index;
}

/** Merkt sich über mehrere Textblöcke hinweg, welcher Begriff schon markiert wurde. */
export interface BegriffsMarkierer {
  markiere: (text: string) => BegriffsSegment[];
  /** Grundformen der bereits markierten Begriffe. Für Tests und Zähler. */
  gesehen: Set<string>;
}

/**
 * Ein Markierer je Abschnitt. Er markiert jeden Begriff nur beim ersten
 * Vorkommen, über alle Textblöcke des Abschnitts hinweg (Falle 5).
 */
export function neuerMarkierer(begriffe: readonly AkademieBegriff[]): BegriffsMarkierer {
  const index = baueMusterIndex(begriffe);
  const gesehen = new Set<string>();
  return {
    gesehen,
    markiere: (text: string) => zerlege(text, index, gesehen),
  };
}

/**
 * Einzelner Text ohne Abschnittsgedächtnis. Auch hier wird jeder Begriff nur
 * einmal markiert.
 */
export function findeBegriffe(
  text: string,
  begriffe: readonly AkademieBegriff[],
  bereitsMarkiert?: Set<string>,
): BegriffsSegment[] {
  return zerlege(text, baueMusterIndex(begriffe), bereitsMarkiert ?? new Set<string>());
}

function zerlege(
  text: string,
  index: Map<string, Muster[]>,
  gesehen: Set<string>,
): BegriffsSegment[] {
  if (!text) return [];
  if (index.size === 0) return [{ typ: "text", text }];

  const segmente: BegriffsSegment[] = [];
  let offen = 0; // Beginn des noch nicht abgelegten gewöhnlichen Textes

  for (let i = 0; i < text.length; i++) {
    const kandidaten = index.get(text[i].toLowerCase());
    if (!kandidaten) continue;
    // Links muss eine Wortgrenze stehen (Falle 1).
    if (istWortzeichen(text[i - 1])) continue;

    for (const muster of kandidaten) {
      const ende = i + muster.laenge;
      if (ende > text.length) continue;
      const stueck = text.slice(i, ende);
      if (stueck.toLowerCase() !== muster.suche) continue;
      // Rechts ebenfalls eine Wortgrenze (Falle 1).
      if (istWortzeichen(text[ende])) continue;
      // Falle 5: nur die erste Nennung je Abschnitt.
      if (gesehen.has(muster.begriff.begriff)) break;

      if (i > offen) segmente.push({ typ: "text", text: text.slice(offen, i) });
      segmente.push({ typ: "begriff", text: stueck, begriff: muster.begriff });
      gesehen.add(muster.begriff.begriff);
      offen = ende;
      i = ende - 1; // die Schleife zählt gleich wieder hoch
      break;
    }
  }

  if (offen < text.length) segmente.push({ typ: "text", text: text.slice(offen) });
  return segmente;
}
