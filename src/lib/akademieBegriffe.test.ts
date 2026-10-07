// Prüft die Begriffsliste gegen sich selbst.
//
// Der Test kennt keine einzelne Erklärung, er prüft nur die Regeln, die für
// jeden Eintrag gelten müssen. Damit fällt auf, wenn jemand später einen
// Eintrag ergänzt und dabei eine Schreibweise doppelt vergibt, ein Feld leer
// lässt oder auf ein Sprungziel verweist, das es nicht gibt.

import { describe, it, expect } from "vitest";
import { AKADEMIE_BEGRIFFE } from "./akademieBegriffe";
import { VERTRIEBSAKADEMIE_KAPITEL } from "./vertriebsakademieContent";

/** Grundform plus alle Schreibweisen eines Eintrags. */
function alleFormen(b: (typeof AKADEMIE_BEGRIFFE)[number]): string[] {
  return [b.begriff, ...(b.schreibweisen ?? [])];
}

describe("AKADEMIE_BEGRIFFE", () => {
  it("enthält genug Einträge, um zu tragen", () => {
    expect(AKADEMIE_BEGRIFFE.length).toBeGreaterThanOrEqual(50);
  });

  it("vergibt jeden Begriff nur einmal", () => {
    const gesehen = new Map<string, string>();
    for (const b of AKADEMIE_BEGRIFFE) {
      const schluessel = b.begriff.toLowerCase();
      expect(gesehen.has(schluessel), `Begriff doppelt: ${b.begriff}`).toBe(false);
      gesehen.set(schluessel, b.begriff);
    }
  });

  it("vergibt jede Schreibweise nur einmal, auch über Einträge hinweg", () => {
    const gesehen = new Map<string, string>();
    for (const b of AKADEMIE_BEGRIFFE) {
      for (const form of alleFormen(b)) {
        const schluessel = form.toLowerCase();
        const vorher = gesehen.get(schluessel);
        expect(vorher, `„${form}" steckt in „${vorher}" und in „${b.begriff}"`).toBeUndefined();
        gesehen.set(schluessel, b.begriff);
      }
    }
  });

  it("lässt kein Feld leer", () => {
    for (const b of AKADEMIE_BEGRIFFE) {
      expect(b.begriff.trim(), "leerer Begriff").not.toBe("");
      expect(b.erklaerung.trim(), `leere Erklärung bei ${b.begriff}`).not.toBe("");
      if (b.imVerkauf !== undefined) {
        expect(b.imVerkauf.trim(), `leeres imVerkauf bei ${b.begriff}`).not.toBe("");
      }
      if (b.mehr !== undefined) {
        expect(b.mehr.trim(), `leeres mehr bei ${b.begriff}`).not.toBe("");
      }
      if (b.schreibweisen !== undefined) {
        expect(b.schreibweisen.length, `leere Schreibweisenliste bei ${b.begriff}`).toBeGreaterThan(0);
        for (const form of b.schreibweisen) {
          expect(form.trim(), `leere Schreibweise bei ${b.begriff}`).not.toBe("");
          expect(form.toLowerCase(), `Schreibweise wiederholt den Begriff ${b.begriff}`).not.toBe(
            b.begriff.toLowerCase(),
          );
        }
      }
    }
  });

  it("hält die Erklärung auf Popover-Länge", () => {
    for (const b of AKADEMIE_BEGRIFFE) {
      expect(b.erklaerung.length, `Erklärung zu kurz bei ${b.begriff}`).toBeGreaterThanOrEqual(40);
      expect(b.erklaerung.length, `Erklärung zu lang bei ${b.begriff}`).toBeLessThanOrEqual(340);
      if (b.imVerkauf) {
        expect(b.imVerkauf.length, `imVerkauf zu lang bei ${b.begriff}`).toBeLessThanOrEqual(220);
      }
    }
  });

  it("verwendet keine Gedankenstriche in Nutzertexten", () => {
    // Projektregel aus CLAUDE.md.
    for (const b of AKADEMIE_BEGRIFFE) {
      for (const text of [b.erklaerung, b.imVerkauf ?? ""]) {
        expect(text, `Gedankenstrich bei ${b.begriff}`).not.toMatch(/[–—]/);
      }
    }
  });

  it("verweist nur auf Ziele, die es wirklich gibt", () => {
    const kapitelSlugs = new Set(VERTRIEBSAKADEMIE_KAPITEL.map((k) => k.slug));
    const abschnitteJeKapitel = new Map(
      VERTRIEBSAKADEMIE_KAPITEL.map((k) => [k.slug, new Set((k.sections ?? []).map((s) => s.id))]),
    );

    for (const b of AKADEMIE_BEGRIFFE) {
      if (!b.mehr) continue;
      expect(b.mehr.startsWith("/"), `mehr ohne führenden Schrägstrich bei ${b.begriff}`).toBe(true);

      const [pfad, abfrage] = b.mehr.split("?");
      if (pfad === "/immobilien-lexikon") continue;

      const treffer = /^\/vertriebsakademie\/([^/]+)$/.exec(pfad);
      expect(treffer, `unbekanntes Sprungziel bei ${b.begriff}: ${b.mehr}`).not.toBeNull();
      const slug = treffer![1];
      expect(kapitelSlugs.has(slug), `Kapitel ${slug} gibt es nicht (${b.begriff})`).toBe(true);

      if (!abfrage) continue;
      const ziel = new URLSearchParams(abfrage).get("vaScrollTo");
      expect(ziel, `leeres vaScrollTo bei ${b.begriff}`).toBeTruthy();
      expect(
        abschnitteJeKapitel.get(slug)?.has(ziel!),
        `Abschnitt ${ziel} gibt es in ${slug} nicht (${b.begriff})`,
      ).toBe(true);
    }
  });
});
