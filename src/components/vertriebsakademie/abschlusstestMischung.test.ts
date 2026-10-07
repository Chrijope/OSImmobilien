/**
 * Die Antwortmöglichkeiten der Abschlusstests werden gemischt.
 *
 * Ohne diese Mischung stand die richtige Antwort immer dort, wo sie in der
 * Inhaltsdatei notiert ist. Gemessen über alle 19 Kapitel war sie damit in
 * 137 von 187 Fragen die zweite Wahl und in 144 von 187 die längste Option.
 * Zwei Kapitel hatten in jeder einzelnen Frage die mittlere als richtige.
 * Bei einer Bestehensquote von siebzig Prozent besteht man so jeden Test,
 * ohne ein Kapitel gelesen zu haben.
 *
 * Die Verräterlänge lässt sich nur im Text beheben. Die Position dagegen ist
 * eine Sache der Software, und dieser Test hält sie fest.
 */
import { describe, it, expect } from "vitest";
import { mischeAntworten } from "@/components/vertriebsakademie/aufgaben/AufgabenHelfer";
import { VERTRIEBSAKADEMIE_KAPITEL } from "@/lib/vertriebsakademieContent";

const alleFragen = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
  (k.abschlusstest?.fragen ?? []).map((f) => ({ slug: k.slug, f })),
);

describe("Mischung der Antwortmöglichkeiten", () => {
  it("behält Text und Lösung der Frage bei", () => {
    for (const { f } of alleFragen) {
      const g = mischeAntworten(f);
      expect([...g.optionen].sort()).toEqual([...f.optionen].sort());
      expect(g.optionen[g.korrekt]).toBe(f.optionen[f.korrekt]);
      expect(g.frage).toBe(f.frage);
    }
  });

  it("mischt bei gleicher Frage immer gleich, damit nichts springt", () => {
    for (const { f } of alleFragen.slice(0, 40)) {
      expect(mischeAntworten(f).optionen).toEqual(mischeAntworten(f).optionen);
    }
  });

  it("verteilt die richtige Antwort über die Positionen", () => {
    // Anteil der häufigsten Position. Bei drei Optionen wäre ein Drittel
    // ideal. Vor der Mischung lagen 73 Prozent auf Position zwei.
    const zaehler = new Map<number, number>();
    for (const { f } of alleFragen) {
      const k = mischeAntworten(f).korrekt;
      zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
    }
    const haeufigste = Math.max(...zaehler.values());
    expect(haeufigste / alleFragen.length).toBeLessThan(0.5);
  });

  it("lässt kein Kapitel mit immer derselben Position zurück", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      const fragen = kap.abschlusstest?.fragen ?? [];
      if (fragen.length < 4) continue;
      const positionen = new Set(fragen.map((f) => mischeAntworten(f).korrekt));
      expect(positionen.size, `Kapitel ${kap.slug}`).toBeGreaterThan(1);
    }
  });
});

describe("Mischung im Abschnittsquiz", () => {
  it("lässt die richtige Antwort nicht überwiegend an zweiter Stelle", () => {
    const fragen = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
      k.sections.flatMap((s) =>
        (s.aufgaben ?? []).flatMap((a) => (a.typ === "quiz" ? a.fragen : [])),
      ),
    );
    const zweite = fragen.filter((f) => mischeAntworten(f).korrekt === 1).length;
    expect(zweite / fragen.length).toBeLessThan(0.5);
  });
});
