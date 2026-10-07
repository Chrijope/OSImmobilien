/**
 * Der Waechter ueber der Dateizeile.
 *
 * Die Dateizeile stand fuenfzehnmal im CRM als abgeschriebenes Markup, und
 * alle fuenfzehn hatten denselben Fehler geerbt: Bei schmalem Fenster liefen
 * die Knoepfe rechts aus dem Kasten heraus und waren nicht mehr anklickbar.
 * Gemessen 65 px Ueberlauf bei einer 400 px breiten Karte, 165 px bei 300 px.
 *
 * Alle fuenfzehn sind repariert. Dieser Test sorgt dafuer, dass die naechste
 * Stelle nicht wieder von einer alten Vorlage abgeschrieben wird: Er verbietet
 * die kaputte Klassenkette und verweist auf `DateiZeile`.
 *
 * Warum ein Test und nicht nur eine Notiz: Der Fehler ist im breiten Fenster
 * unsichtbar. Wer ihn einbaut, merkt es beim Bauen nicht, und Christian sieht
 * ihn erst, wenn er das Fenster schmaler zieht.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../..");

/**
 * Eine Flex-Zeile mit Polsterung auf getoenter Flaeche, die nicht umbrechen
 * darf. Genau diese Kette stand an allen fuenfzehn Fundstellen.
 */
const KAPUTT = "flex items-center gap-3 bg-muted/50 rounded-lg p-3";

function alleDateien(ordner: string, gesammelt: string[] = []): string[] {
  for (const eintrag of readdirSync(ordner)) {
    if (eintrag === "node_modules" || eintrag.startsWith(".")) continue;
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) alleDateien(pfad, gesammelt);
    else if (pfad.endsWith(".tsx")) gesammelt.push(pfad);
  }
  return gesammelt;
}

describe("Dateizeile", () => {
  it("nirgends mehr die Variante, die bei schmalem Fenster ueberlaeuft", () => {
    const fundstellen: string[] = [];
    for (const datei of alleDateien(SRC)) {
      const inhalt = readFileSync(datei, "utf8");
      inhalt.split("\n").forEach((zeile, nr) => {
        if (zeile.includes(KAPUTT)) fundstellen.push(`${relative(SRC, datei)}:${nr + 1}`);
      });
    }
    // Beim Fehlschlag: die Zeile braucht `flex-wrap`, der Textteil `min-w-0`,
    // und die Knoepfe gehoeren in eine Gruppe mit `ml-auto shrink-0`. Fertig
    // gibt es das als `DateiZeile` in `@/components/ui/dateizeile`.
    expect(fundstellen).toEqual([]);
  });
});
