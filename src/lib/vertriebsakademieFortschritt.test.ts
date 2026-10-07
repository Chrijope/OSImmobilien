import { describe, it, expect } from "vitest";
import {
  computeKapitelStats,
  computeGlobalStats,
  type VaProgressState,
} from "./vertriebsakademieProgress";
import { VERTRIEBSAKADEMIE_KAPITEL } from "./vertriebsakademieContent";

/**
 * Der Balken zählt Lektionen und Kapitel, nicht einzelne Haken.
 *
 * Vorher wog jede Checklistenzeile so viel wie ein ganzes Kapitel. Wer alle 18
 * Kapitel als abgeschlossen markierte, ohne jede Übung einzeln abzuhaken, stand
 * bei sieben Prozent. Diese Tests halten fest, dass das nicht wiederkommt.
 */

const leer = (): VaProgressState => ({
  checks: {}, uebungen: {}, kapitelDone: {}, sectionsDone: {},
  answers: {}, aufgaben: {}, abwaegung: {}, aktiveTage: [],
});

describe("Vertriebsakademie: Fortschritt zählt Lektionen und Kapitel", () => {
  it("ein als abgeschlossen markiertes Kapitel steht auf 100 Prozent", () => {
    const kap = VERTRIEBSAKADEMIE_KAPITEL[0];
    const s = leer();
    s.kapitelDone[kap.slug] = true;

    const stats = computeKapitelStats(kap, s, "alle");
    expect(stats.pct).toBe(100);
    expect(stats.isDone).toBe(true);
    // Auch die Lektionen gelten dann als erledigt.
    expect(stats.doneLektionen).toBe(stats.totalLektionen);
  });

  it("alle Kapitel abgeschlossen ergibt 100 Prozent gesamt", () => {
    const s = leer();
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) s.kapitelDone[kap.slug] = true;

    expect(computeGlobalStats(s, "alle").overallPct).toBe(100);
  });

  it("ohne jeden Fortschritt sind es 0 Prozent", () => {
    expect(computeGlobalStats(leer(), "alle").overallPct).toBe(0);
  });

  it("eine abgehakte Lektion bewegt den Balken, auch ohne Übungen darin", () => {
    const kap = VERTRIEBSAKADEMIE_KAPITEL[0];
    const s = leer();
    const vorher = computeKapitelStats(kap, s, "alle").pct;

    const ersteLektion = kap.sections[0];
    s.sectionsDone[`${kap.slug}::${ersteLektion.id}`] = true;

    const nachher = computeKapitelStats(kap, s, "alle");
    expect(nachher.pct).toBeGreaterThan(vorher);
    expect(nachher.doneLektionen).toBe(1);
  });

  it("einzelne Checklistenhaken allein bewegen den Balken nicht mehr", () => {
    // Bewusst so: Sonst wiegt eine Checklistenzeile wieder wie ein Kapitel,
    // und genau daraus entstanden die sieben Prozent.
    const kap = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.sections.some((s) => (s.checkliste?.length ?? 0) > 0));
    if (!kap) return;
    const sec = kap.sections.find((x) => (x.checkliste?.length ?? 0) > 0)!;

    const s = leer();
    s.checks[`${kap.slug}::${sec.id}::0`] = true;

    expect(computeKapitelStats(kap, s, "alle").pct).toBe(computeKapitelStats(kap, leer(), "alle").pct);
  });

  it("alle Lektionen eines Kapitels abgehakt kommt dem Abschluss sehr nahe", () => {
    const kap = VERTRIEBSAKADEMIE_KAPITEL[0];
    const s = leer();
    for (const sec of kap.sections) s.sectionsDone[`${kap.slug}::${sec.id}`] = true;

    const stats = computeKapitelStats(kap, s, "alle");
    // Es fehlt genau der Kapitelhaken selbst.
    expect(stats.pct).toBeGreaterThan(80);
    expect(stats.pct).toBeLessThan(100);
  });
});
