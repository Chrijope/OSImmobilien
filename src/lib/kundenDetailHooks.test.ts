import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Kein Hook hinter einem fruehen Ausstieg in KundenDetail.tsx.
 *
 * Die Datei hat ueber 13.500 Zeilen, und bei Zeile ~3850 steigt sie zweimal
 * frueh aus: "Lade Kundendaten" und "Kunde nicht gefunden". Wer danach einen
 * Hook einfuegt, bekommt ihn im Ladezustand nicht aufgerufen und danach schon.
 * React bricht dann ab mit "Rendered more hooks than during the previous
 * render", und das Kundenprofil bleibt weiss.
 *
 * Genau das ist am 16.09.2026 passiert: Ein `useState` fuer den Termin-Dialog
 * landete bei Zeile 5126, also gut 1200 Zeilen hinter dem Ausstieg. In einer
 * Datei dieser Groesse sieht das niemand beim Lesen, deshalb dieser Waechter.
 */
const quelle = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

describe("KundenDetail: Hooks stehen vor den fruehen Ausstiegen", () => {
  it("steigt wie erwartet frueh aus", () => {
    expect(quelle).toContain("  if (loadingKunde) {");
    expect(quelle).toContain("  if (!kunde) {");
  });

  it("ruft danach keinen Hook mehr auf Komponentenebene", () => {
    const zeilen = quelle.split("\n");
    const ausstieg = zeilen.findIndex((z) => z === "  if (loadingKunde) {");
    expect(ausstieg).toBeGreaterThan(0);

    // Genau zwei Leerzeichen Einrueckung heisst: unmittelbar im Rumpf der
    // Komponente. Tiefer eingerueckte Treffer stehen in eigenen Bauteilen
    // oder Rueckruffunktionen und sind nicht gemeint.
    // Jeder Hook-Aufruf, nicht nur die Handvoll aus der Standardbibliothek.
    //
    // Die erste Fassung zaehlte `useState`, `useMemo`, `useCallback`, `useRef`
    // und `useEffect` auf und verlangte eine Klammer direkt hinter dem Namen.
    // Zwei `useMemo<KundenAufgabe[]>(...)` sind ihr deshalb entgangen: Bei
    // einer Typangabe steht dort eine spitze Klammer. Christian bekam am
    // 16.09.2026 "Rendered fewer hooks than expected", als ein Kontakt
    // geloescht wurde, waehrend sein Profil offen war.
    //
    // Deshalb jetzt die Regel statt der Liste: alles, was mit `use` und einem
    // Grossbuchstaben beginnt und aufgerufen wird. Das deckt auch die eigenen
    // Hooks ab, `useLiveVersion` und `useCacheReady`.
    const hookAufKomponentenebene =
      /^ {2}(const .+ = use[A-Z]\w*\s*[<(]|use[A-Z]\w*\s*[<(])/;

    const spaete = zeilen
      .map((z, i) => ({ z, nr: i + 1 }))
      .filter(({ z, nr }) => nr > ausstieg && hookAufKomponentenebene.test(z))
      .map(({ z, nr }) => `${nr}: ${z.trim().slice(0, 70)}`);

    expect(spaete).toEqual([]);
  });
});
