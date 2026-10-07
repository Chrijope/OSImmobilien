/**
 * Prüft ein Textpaar `{ de, en }` auf Vollständigkeit.
 *
 * Für die Textdateien der öffentlichen Seiten (Plan Kundensprache, Etappe 6),
 * nach dem Muster von `beratungspraesentationTexte.test.ts`. Geprüft wird die
 * Form, nicht der Wortlaut:
 *
 *   - Jeder deutsche Eintrag hat ein englisches Gegenstück und umgekehrt,
 *     Listen sind gleich lang.
 *   - Funktionen nehmen in beiden Sprachen gleich viele Werte.
 *   - Kein englischer Text ist leer, wo der deutsche etwas sagt.
 *   - Keine Gedankenstriche, in keiner der beiden Sprachen (Hausregel).
 *
 * Funktionen werden mit Beispielwerten aufgerufen: Zahlen für alle
 * Parameter, außer der Aufrufer gibt eigene Beispiele je Pfad mit.
 *
 * Rückgabe ist eine Liste lesbarer Befunde, leer heißt vollständig. So zeigt
 * ein fehlschlagender Test gleich alle Lücken auf einmal.
 */

type Knoten = unknown;

function istObjekt(w: Knoten): w is Record<string, Knoten> {
  return typeof w === "object" && w !== null && !Array.isArray(w);
}

/** Alle Pfade bis zu den Blättern. Texte und Funktionen sind Blätter. */
export function textPfade(w: Knoten, praefix = ""): string[] {
  if (typeof w === "string" || typeof w === "function") return [praefix];
  if (Array.isArray(w)) return w.flatMap((x, i) => textPfade(x, `${praefix}[${i}]`));
  if (istObjekt(w)) return Object.entries(w).flatMap(([k, v]) => textPfade(v, praefix ? `${praefix}.${k}` : k));
  // Zahlen und Wahrheitswerte gehören nicht in eine Textdatei, bleiben aber sichtbar.
  return [`${praefix}:${typeof w}`];
}

function blatt(w: Knoten, pfad: string): Knoten {
  return pfad
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<Knoten>((x, s) => (x == null ? undefined : (x as Record<string, Knoten>)[s]), w);
}

/** Sichtbarer Text eines Blatts, Funktionen mit Beispielwerten aufgerufen. */
function texteVon(w: Knoten, beispiel?: readonly unknown[]): string[] {
  if (typeof w === "string") return [w];
  if (typeof w === "function") {
    const werte = beispiel ?? Array.from({ length: w.length }, (_, i) => (i === 0 ? 12345.5 : 3));
    return texteVon((w as (...a: unknown[]) => unknown)(...werte));
  }
  if (Array.isArray(w)) return w.flatMap((x) => texteVon(x));
  if (istObjekt(w)) return Object.values(w).flatMap((x) => texteVon(x));
  return [];
}

/** Gedankenstrich: Halbgeviert- und Geviertstrich, oder ein Bindestrich mit Leerzeichen davor und danach. */
const GEDANKENSTRICH = /[–—]|\s-\s/;

export interface TextPruefOptionen {
  /** Beispielwerte je Funktionspfad, falls Zahlen nicht passen. */
  beispiele?: Record<string, readonly unknown[]>;
}

export function pruefeTexteVollstaendig(
  texte: { de: Knoten; en: Knoten },
  optionen: TextPruefOptionen = {},
): string[] {
  const befunde: string[] = [];
  const dePfade = textPfade(texte.de);
  const enPfade = textPfade(texte.en);
  const enMenge = new Set(enPfade);
  const deMenge = new Set(dePfade);

  for (const p of dePfade) if (!enMenge.has(p)) befunde.push(`EN fehlt: ${p}`);
  for (const p of enPfade) if (!deMenge.has(p)) befunde.push(`DE fehlt: ${p}`);

  for (const p of dePfade) {
    if (!enMenge.has(p)) continue;
    const d = blatt(texte.de, p);
    const e = blatt(texte.en, p);
    if (typeof d === "function" || typeof e === "function") {
      if (typeof d !== "function" || typeof e !== "function") {
        befunde.push(`nur eine Sprache ist eine Funktion: ${p}`);
        continue;
      }
      if (d.length !== e.length) befunde.push(`Funktion mit ${d.length} gegen ${e.length} Werten: ${p}`);
    }
    const beispiel = optionen.beispiele?.[p];
    let deText = "";
    let enText = "";
    try {
      deText = texteVon(d, beispiel).join(" ");
      enText = texteVon(e, beispiel).join(" ");
    } catch (fehler) {
      befunde.push(`Funktion wirft bei Beispielwerten: ${p} (${fehler instanceof Error ? fehler.message : String(fehler)})`);
      continue;
    }
    if (deText.trim() && !enText.trim()) befunde.push(`EN leer: ${p}`);
    if (GEDANKENSTRICH.test(deText)) befunde.push(`Gedankenstrich im Deutschen: ${p}: ${deText}`);
    if (GEDANKENSTRICH.test(enText)) befunde.push(`Gedankenstrich im Englischen: ${p}: ${enText}`);
  }
  return befunde;
}

/**
 * Wie viele englische Texte gleichen wörtlich dem deutschen? Ein Hinweis auf
 * vergessene Übersetzungen. Namen und Marken dürfen gleich bleiben, deshalb
 * gibt es nur die Liste zurück und entscheidet nichts.
 */
export function gleicheTexte(texte: { de: Knoten; en: Knoten }): string[] {
  return textPfade(texte.de).filter((p) => {
    const d = blatt(texte.de, p);
    const e = blatt(texte.en, p);
    return typeof d === "string" && typeof e === "string" && d.trim().length > 3 && d === e;
  });
}
