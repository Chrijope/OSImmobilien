// Lange Absätze im Lehrtext der Vertriebsakademie kürzen.
//
// Anlass: Die Absatzlängen laufen weit auseinander. Gemessen am 07.09.2026
// über den gesamten Inhalt: 192 Absätze, zusammen 81.948 Zeichen, Median 416,
// längster 1.282 Zeichen. Kapitel 5 ballt den Text, Kapitel 0 arbeitet mit
// Listen und Grafiken und liest sich deutlich leichter.
//
// Diese Datei ändert keinen Buchstaben am Inhalt. Sie entscheidet nur, wie
// viel davon zuerst zu sehen ist. Der Rest kommt auf Klick.
//
// Wichtig ist der Ansatzpunkt: Gekürzt wird NICHT der Rohtext, sondern die
// bereits von `akademieBegriffeErkennung` zerlegte Segmentliste. Sonst gäbe
// es zwei Wahrheiten über denselben Absatz und die Begriffserkennung müsste
// auf einem gestutzten Text ein zweites Mal laufen. Dabei würde sie andere
// Erstnennungen finden als im vollen Text, und beim Aufklappen sprängen die
// Markierungen um. So bleibt die Erkennung unberührt: Sie läuft weiterhin
// genau einmal über den vollständigen Text, gekürzt wird erst danach.

import type { BegriffsSegment } from "@/lib/akademieBegriffeErkennung";

/**
 * Ab dieser Länge bekommt ein Absatz ein „Weiterlesen".
 *
 * 600 Zeichen sind rund acht Zeilen am Rechner und deutlich mehr am Telefon.
 * Gemessen trifft die Schwelle 39 der 192 Absätze, also 20 Prozent, rund zwei
 * je Kapitel. Genau das ist die Absicht: nur die wirklichen Textblöcke, nicht
 * jeder zweite Absatz. Zum Vergleich lägen bei 500 Zeichen 66 Absätze
 * (34 Prozent) und bei 400 Zeichen 101 (53 Prozent) darüber, dann stünde auf
 * jedem zweiten Absatz ein Knopf und der Knopf wäre das neue Rauschen.
 *
 * Die Zahl ist eine redaktionelle Entscheidung und hier bewusst die einzige
 * Stellschraube. Wächst der Inhalt weiter, lohnt ein Blick auf die Verteilung,
 * der Test in `akademieAbsatzKuerzung.test.ts` schlägt dafür Alarm.
 */
export const ABSATZ_SCHWELLE = 600;

/** Ungefähre Länge des sichtbaren Anfangs. Der Schnitt sucht sich das nächste Satzende. */
export const ABSATZ_SICHTBAR = 320;

/** Wie weit der Schnitt über das Ziel hinaus nach einem Satzende suchen darf. */
const SUCHFENSTER = 160;

export interface GekuerzterAbsatz {
  /** Wurde tatsächlich gekürzt? Sonst ist `sichtbar` der ganze Absatz. */
  gekuerzt: boolean;
  /** Die Segmente des sichtbaren Anfangs, mit Auslassungszeichen am Ende. */
  sichtbar: BegriffsSegment[];
  /** Gesamtlänge des Absatzes in Zeichen, nur zur Anzeige und für Tests. */
  laenge: number;
}

/** Gesamtlänge aller Segmente. */
export function segmentLaenge(segmente: readonly BegriffsSegment[]): number {
  return segmente.reduce((n, s) => n + s.text.length, 0);
}

/**
 * Sucht die Schnittstelle: möglichst ein Satzende, sonst eine Wortgrenze.
 *
 * Ein Absatz, der mitten im Satz abbricht, wirkt kaputt statt gekürzt. Nur
 * wenn im Fenster kein Satzende liegt, wird an der letzten Leerstelle
 * geschnitten.
 */
export function findeSchnitt(text: string, ziel: number): number {
  const fensterEnde = Math.min(text.length, ziel + SUCHFENSTER);
  const fensterStart = Math.max(0, ziel - SUCHFENSTER);

  let bestes = -1;
  for (let i = fensterStart; i < fensterEnde; i++) {
    const z = text[i];
    if (z !== "." && z !== "!" && z !== "?") continue;
    const danach = text[i + 1];
    // Ein Satzende ist erst eines, wenn danach Platz kommt. So bleiben
    // Abkürzungen wie „z. B." und Zahlen wie „1.500" unversehrt.
    if (danach !== undefined && danach !== " " && danach !== "\n") continue;
    bestes = i + 1;
  }
  if (bestes > 0) return bestes;

  const leerstelle = text.lastIndexOf(" ", fensterEnde);
  if (leerstelle > fensterStart) return leerstelle;
  return Math.min(ziel, text.length);
}

/**
 * Kürzt einen zerlegten Absatz auf seinen Anfang.
 *
 * Ein markierter Begriff wird nie zerschnitten: Fällt die Schnittstelle mitten
 * hinein, wandert sie ans Ende des Begriffs. Ein halbes Wort mit
 * Erklärknopf wäre schlimmer als ein paar Zeichen mehr.
 */
export function kuerzeAbsatz(
  segmente: readonly BegriffsSegment[] | null | undefined,
  schwelle: number = ABSATZ_SCHWELLE,
  ziel: number = ABSATZ_SICHTBAR,
): GekuerzterAbsatz {
  const alle = segmente ?? [];
  const laenge = segmentLaenge(alle);
  if (laenge <= schwelle) {
    return { gekuerzt: false, sichtbar: [...alle], laenge };
  }

  const volltext = alle.map((s) => s.text).join("");
  const schnitt = findeSchnitt(volltext, ziel);

  const sichtbar: BegriffsSegment[] = [];
  let gelesen = 0;
  for (const s of alle) {
    const ende = gelesen + s.text.length;
    if (ende <= schnitt) {
      sichtbar.push(s);
      gelesen = ende;
      continue;
    }
    if (gelesen >= schnitt) break;
    // Die Schnittstelle liegt in diesem Segment.
    if (s.typ === "begriff") {
      sichtbar.push(s); // ganz mitnehmen, nie zerschneiden
    } else {
      const stueck = s.text.slice(0, schnitt - gelesen).trimEnd();
      if (stueck) sichtbar.push({ typ: "text", text: stueck });
    }
    break;
  }

  // Nichts Sichtbares übrig? Dann lieber den ganzen Absatz zeigen als einen
  // leeren Anfang mit Knopf.
  if (sichtbar.length === 0) {
    return { gekuerzt: false, sichtbar: [...alle], laenge };
  }

  sichtbar.push({ typ: "text", text: " …" });
  return { gekuerzt: true, sichtbar, laenge };
}
