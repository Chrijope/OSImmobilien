import { describe, it, expect } from "vitest";
import { erzeugePdfVorschau, VORSCHAU_ENDUNG, VORSCHAU_TYP } from "./pdfVorschau";

/**
 * Der Kern dieser Zugabe ist ihr Rückfall.
 *
 * Eine misslungene Vorschau darf das Hochladen weder aufhalten noch mit einer
 * Fehlermeldung stören. Der Anhang geht raus, im Verlauf steht dann eben das
 * Symbol wie vorher. Genau das wird hier festgehalten: Was schiefgehen kann,
 * endet in einem ruhigen `null` und nicht in einem geworfenen Fehler.
 *
 * Was hier ausdrücklich NICHT geprüft wird, ist das Rendern selbst. Die
 * Testumgebung jsdom hat weder eine Zeichenfläche noch den Arbeiter von
 * pdf.js. Ein erfolgreiches Vorschaubild lässt sich hier also nicht erzeugen,
 * das muss im Browser geprüft werden. Geprüft ist hier der Rückfall, und der
 * ist die Eigenschaft, an der es im Alltag hängt.
 */
/**
 * Ein Dateiersatz mit lesbarem Inhalt.
 *
 * `Blob.arrayBuffer` gibt es in der Testumgebung jsdom nicht. Ohne diesen
 * Ersatz würde die Funktion schon vor dem Lesen scheitern, und der Test
 * würde am eigentlichen Punkt vorbeilaufen.
 */
function datei(inhalt: string): Blob {
  const bytes = new TextEncoder().encode(inhalt);
  return { arrayBuffer: async () => bytes.buffer } as unknown as Blob;
}

describe("erzeugePdfVorschau", () => {
  it("gibt bei einer Datei, die kein PDF ist, still null zurueck", async () => {
    await expect(erzeugePdfVorschau(datei("das ist kein PDF"))).resolves.toBeNull();
  });

  it("gibt bei einem abgeschnittenen PDF still null zurueck", async () => {
    // Kopf einer PDF-Datei, danach bricht sie ab.
    await expect(erzeugePdfVorschau(datei("%PDF-1.7\n1 0 obj"))).resolves.toBeNull();
  });

  it("gibt bei einer leeren Datei still null zurueck", async () => {
    await expect(erzeugePdfVorschau(datei(""))).resolves.toBeNull();
  });

  it("legt Endung und Inhaltstyp des Vorschaubilds passend zueinander fest", () => {
    expect(VORSCHAU_ENDUNG).toBe(".vorschau.jpg");
    expect(VORSCHAU_TYP).toBe("image/jpeg");
  });
});
