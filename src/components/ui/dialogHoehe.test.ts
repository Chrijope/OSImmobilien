/**
 * Jedes Popup muss auf ein Handy passen.
 *
 * Anlass war eine Meldung vom 14.09.2026: Im Bewerberprozess liess sich
 * "Bewerber erfassen" auf dem Handy nicht bedienen. Der Dialog wuchs ueber
 * den Bildschirm hinaus, und weil kein Scrollbereich festgelegt war, blieb
 * der untere Teil samt Speichern-Knopf unerreichbar. Wischen half nicht, denn
 * es gab nichts zu scrollen.
 *
 * Betroffen war nicht dieser eine Dialog, sondern alle: 26 Stellen im Projekt
 * setzten `<DialogContent>` ohne eigene Hoehenangabe, und die Grundkomponente
 * brachte keine mit. Aufgefallen ist es nur dort, wo das Formular lang genug
 * war.
 *
 * Deshalb steht die Regel in der Grundkomponente, und deshalb haelt dieser
 * Test sie fest. Ohne ihn ist der Fehler beim naechsten Umbau der
 * Dialogklassen wieder da, und er faellt erst jemandem auf dem Handy auf.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DATEIEN = [
  ["dialog.tsx", "Dialog"],
  ["alert-dialog.tsx", "Rückfrage-Dialog"],
] as const;

describe("Popups passen auf kleine Schirme", () => {
  for (const [datei, name] of DATEIEN) {
    const css = readFileSync(resolve(__dirname, datei), "utf8");

    it(`${name}: begrenzt die Hoehe`, () => {
      expect(css, `${datei} ohne max-h: wird auf dem Handy abgeschnitten`).toMatch(/max-h-\[9?\d*vh\]/);
    });

    it(`${name}: laesst scrollen, wenn der Inhalt laenger ist`, () => {
      /*
       * Die Begrenzung allein genuegt nicht. Ohne Scrollbereich waere der
       * Inhalt weiterhin abgeschnitten, nur an einer anderen Stelle.
       */
      expect(css, `${datei} ohne overflow-y-auto: der Rest bleibt unerreichbar`).toContain("overflow-y-auto");
    });
  }
});
