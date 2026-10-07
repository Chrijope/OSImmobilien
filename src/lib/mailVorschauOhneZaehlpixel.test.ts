/**
 * Wächter darüber, dass die Vorschau keine Öffnung auslösen kann.
 *
 * Der gefährlichste Randfall des Öffnungstrackings: Die Vorlagenvorschau
 * (`supabase/functions/preview-transactional-email`) rendert jede Vorlage und
 * zeigt sie im Browser. Stünde in den Vorschaudaten einer Vorlage eine echte
 * Zählpixeladresse, würde jeder Blick von HR in die Vorschau als Öffnung des
 * Bewerbers gezählt. Das Briefsymbol in der Bewerberliste zeigte dann Grün,
 * ohne dass der Bewerber die Mail je gesehen hätte, und die Anzeige wäre
 * schlimmer als keine.
 *
 * Zwei Dinge halten das auseinander, und beide werden hier geprüft:
 *
 *   1. Keine Vorlage trägt `trackingPixelUrl` in ihren `previewData`.
 *   2. Die Vorschau rendert ausschließlich `entry.previewData` und mischt
 *      nichts aus der Anfrage hinein.
 *
 * Fällt einer der beiden Punkte, ist der Test rot, und zwar bevor jemand die
 * Vorschau öffnet.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const VORLAGEN = resolve(__dirname, "../../supabase/functions/_shared/transactional-email-templates");
const VORSCHAU = resolve(__dirname, "../../supabase/functions/preview-transactional-email/index.ts");

/** Alle Vorlagendateien, ohne die Sync-Kopien mit einer Ziffer im Namen. */
function vorlagenDateien(): string[] {
  return readdirSync(VORLAGEN)
    .filter((n) => n.endsWith(".tsx"))
    .filter((n) => !/ \d+\.tsx$/.test(n))
    .filter((n) => n !== "_layout.tsx");
}

/**
 * Der Teil einer Vorlage ab `previewData:`.
 *
 * Grob geschnitten, und das genügt: Danach folgt nur noch das Objekt selbst
 * und die schließende Zeile `} satisfies TemplateEntry`. Steht das Wort
 * `trackingPixelUrl` in diesem Abschnitt, ist es ein Vorschauwert.
 */
function vorschauTeil(quelle: string): string {
  const i = quelle.indexOf("previewData:");
  return i === -1 ? "" : quelle.slice(i);
}

describe("Die Vorlagenvorschau löst keine Öffnung aus", () => {
  it("trägt in keiner Vorlage eine Zählpixeladresse in den Vorschaudaten", () => {
    const schuldige: string[] = [];
    for (const datei of vorlagenDateien()) {
      const teil = vorschauTeil(readFileSync(resolve(VORLAGEN, datei), "utf8"));
      if (/trackingPixelUrl|pixelUrl/.test(teil)) schuldige.push(datei);
    }
    expect(schuldige).toEqual([]);
  });

  /*
   * Die zweite Hälfte der Zusage. Ein `...body.templateData` an dieser Stelle
   * würde die erste aushebeln: Dann könnte ein Aufruf der Vorschau eine
   * fremde Pixeladresse mitbringen.
   */
  it("rendert ausschließlich die hinterlegten Vorschaudaten", () => {
    const quelle = readFileSync(VORSCHAU, "utf8");
    expect(quelle).toMatch(/React\.createElement\(entry\.component, entry\.previewData\)/);
    expect(quelle).not.toMatch(/templateData/);
  });
});

/*
 * Seit dem 26.09.2026 tragen Bewerber-, Vertrags- und Selbstauskunftsmails
 * kein Zählpixel mehr. Nach Einschätzung der Rechtsprüfung braucht ein
 * Öffnungspixel eine Einwilligung (§ 25 TDDDG). Gezählt wird nur noch der
 * Aufruf des persönlichen Links.
 *
 * Die einzige Vorlage, die noch eine Pixeladresse annimmt, ist
 * `reservierung-erinnerung` (Kundenmail, nicht Teil dieser Freigabe). Wer eine
 * weitere dazunimmt, muss sie hier ausdrücklich eintragen und begründen.
 */
describe("Kein Zählpixel in Bewerber-, Vertrags- und Selbstauskunftsmails", () => {
  const NOCH_MIT_PIXELADRESSE = ["reservierung-erinnerung.tsx"];

  it("keine Vorlage außer der bekannten reicht eine Pixeladresse an das Layout", () => {
    const mitPixel = vorlagenDateien().filter((datei) =>
      /pixelUrl=\{/.test(readFileSync(resolve(VORLAGEN, datei), "utf8")),
    );
    expect(mitPixel).toEqual(NOCH_MIT_PIXELADRESSE);
  });

  it("die Zählfunktionen vermerken keine Öffnung mehr", () => {
    const functions = resolve(__dirname, "../../supabase/functions");
    for (const name of ["track-sa-email", "track-vertrag-email", "track-bewerber-mail"]) {
      const quelle = readFileSync(resolve(functions, name, "index.ts"), "utf8");
      expect(quelle, name).not.toMatch(/mark_(sa|signature|bewerber)_(email|mail)_opened/);
    }
  });

  it("kein Absender baut noch eine Pixeladresse", () => {
    const stellen = [
      "../../supabase/functions/send-sa-invitation/index.ts",
      "../../supabase/functions/send-vertrag-signature/index.ts",
      "../../supabase/functions/_shared/handbuch-anlage.ts",
      "../../supabase/functions/_shared/kennenlernen-versand.ts",
      "../../supabase/functions/send-bewerber-kennenlernen-erinnerungen/index.ts",
      "./bewerberEinladung.ts",
      "./startfahrplanVersand.ts",
    ];
    for (const pfad of stellen) {
      const quelle = readFileSync(resolve(__dirname, pfad), "utf8");
      expect(quelle, pfad).not.toMatch(/trackingPixelUrl|mode=open|track-sa-email|track-vertrag-email/);
    }
  });
});
