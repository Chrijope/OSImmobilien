import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";

/**
 * Wache über die Popups im gesamten Projekt.
 *
 * Projektregel: Ein Popup öffnet direkt auf der Seite und blendet nichts aus.
 * Kein Abdunkeln, kein Weichzeichner, die Seitenleiste bleibt sichtbar.
 *
 * Vorher stand diese Einstellung an jedem einzelnen Popup, und dieser Test
 * ging die Dateien des Kundenprofils durch, um kein vergessenes zu übersehen.
 * Christian hat es dreimal gemeldet, zuletzt allgemein für das ganze Projekt.
 * Seit dem 04.08.2026 ist es deshalb die Voreinstellung in den beiden
 * Bausteinen. Der Test wacht folgerichtig nicht mehr über jede Aufrufstelle,
 * sondern über die Voreinstellung selbst und darüber, dass sie niemand
 * irgendwo wieder aushebelt.
 */

const DIALOG = "src/components/ui/dialog.tsx";
const ALERT_DIALOG = "src/components/ui/alert-dialog.tsx";

/** Klassen, die die Seite abdunkeln oder verwischen. */
const VERDECKEND = [/bg-black\/\d+/, /backdrop-blur-(?!none)\w+/, /bg-background\/\d+/];

function overlayZeile(datei: string): string {
  const inhalt = readFileSync(datei, "utf-8");
  const treffer = inhalt.match(/"fixed inset-0 z-50[^"]*"/);
  if (!treffer) throw new Error(`Kein Overlay in ${datei} gefunden`);
  return treffer[0];
}

function sammleDateien(pfad: string): string[] {
  if (statSync(pfad).isFile()) return pfad.endsWith(".tsx") ? [pfad] : [];
  return readdirSync(pfad).flatMap((eintrag) => sammleDateien(join(pfad, eintrag)));
}

describe("Popups im gesamten Projekt", () => {
  it.each([DIALOG, ALERT_DIALOG])("%s dunkelt die Seite nicht ab", (datei) => {
    const zeile = overlayZeile(datei);
    for (const muster of VERDECKEND) {
      expect(zeile, `${datei} verdeckt die Seite wieder: ${zeile}`).not.toMatch(muster);
    }
    expect(zeile).toContain("bg-transparent");
    expect(zeile).toContain("backdrop-blur-none");
  });

  it.each([DIALOG, ALERT_DIALOG])("%s behält den Overlay, entfernt ihn nicht", (datei) => {
    // Der Overlay fängt die Klicks ab. Ohne ihn ließe sich in der Seitenleiste
    // navigieren, während ein Formular offen ist, und der Klick daneben würde
    // das Popup nicht mehr schließen.
    expect(overlayZeile(datei)).toContain("fixed inset-0");
  });

  it("hebelt die Voreinstellung nirgends im Projekt wieder aus", () => {
    const dateien = sammleDateien("src").filter((d) => !d.includes("/ui/"));
    const rueckfaelle: string[] = [];

    for (const datei of dateien) {
      const inhalt = readFileSync(datei, "utf-8");
      // Nur die Stellen betrachten, die den Overlay ausdrücklich setzen.
      for (const treffer of inhalt.matchAll(/overlayClassName=\{?"?([^"}]*)"?\}?/g)) {
        const wert = treffer[1] ?? "";
        if (VERDECKEND.some((m) => m.test(wert))) {
          rueckfaelle.push(`${datei}: overlayClassName="${wert}"`);
        }
      }
    }

    expect(
      rueckfaelle,
      `Diese Stellen dunkeln die Seite wieder ab:\n${rueckfaelle.join("\n")}`,
    ).toEqual([]);
  });

  it("die Konstante bleibt unschädlich, falls sie noch irgendwo steht", () => {
    // Sie wiederholt nur die Voreinstellung. Neue Popups brauchen sie nicht.
    expect(NUR_POPUP_OVERLAY).toContain("bg-transparent");
    expect(NUR_POPUP_OVERLAY).toContain("backdrop-blur-none");
    expect(NUR_POPUP_OVERLAY).not.toContain("hidden");
  });
});
