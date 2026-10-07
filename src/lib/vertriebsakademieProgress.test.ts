import { describe, it, expect } from "vitest";
import {
  VERTRIEBSAKADEMIE_KAPITEL,
  aufgabenFuerPfad,
  type AkademieKapitel,
} from "@/lib/vertriebsakademieContent";
import {
  computeGlobalStats,
  computeKapitelStats,
  sichtbareUebungen,
  type VaProgressState,
} from "@/lib/vertriebsakademieProgress";

/** Ein Zustand, in dem der Partner alles erledigt hat, was er im Pfad sehen kann. */
function allesErledigt(z: "alle" | "quereinsteiger" | "profi"): VaProgressState {
  const s: VaProgressState = {
    checks: {}, uebungen: {}, kapitelDone: {}, sectionsDone: {}, answers: {}, aufgaben: {}, abwaegung: {}, aktiveTage: [],
  };
  for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
    s.kapitelDone[kap.slug] = true;
    for (const sec of kap.sections) {
      (sec.checkliste || []).forEach((_c, i) => {
        s.checks[`${kap.slug}::${sec.id}::${i}`] = true;
      });
      for (const u of sichtbareUebungen(sec, z)) {
        s.uebungen[`${kap.slug}::${u.id}`] = true;
      }
      for (const a of aufgabenFuerPfad(sec, z)) {
        s.aufgaben[`${kap.slug}::${a.id}`] = { versuche: 1, geloest: true, punkte: 10 };
      }
    }
  }
  return s;
}

const advancedKapitel = VERTRIEBSAKADEMIE_KAPITEL.filter((k) =>
  k.sections.some((sec) => (sec.uebungen || []).some((u) => u.advanced)),
);

describe("Fortschritt zaehlt nur, was im Lernpfad sichtbar ist", () => {
  it("es gibt ueberhaupt Advanced-Uebungen, sonst testet dieser Test nichts", () => {
    const advanced = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) =>
      k.sections.flatMap((sec) => (sec.uebungen || []).filter((u) => u.advanced)),
    );
    expect(advanced.length).toBeGreaterThan(0);
  });

  it("blendet Advanced-Uebungen im Quereinsteiger-Pfad aus", () => {
    for (const kap of advancedKapitel) {
      for (const sec of kap.sections) {
        expect(sichtbareUebungen(sec, "quereinsteiger").every((u) => !u.advanced)).toBe(true);
      }
    }
  });

  it("zeigt Advanced-Uebungen im Profi-Pfad", () => {
    const kap = advancedKapitel[0] as AkademieKapitel;
    const sec = kap.sections.find((x) => (x.uebungen || []).some((u) => u.advanced))!;
    expect(sichtbareUebungen(sec, "profi").length).toBeGreaterThan(
      sichtbareUebungen(sec, "quereinsteiger").length,
    );
  });

  it("erreicht im Quereinsteiger-Pfad 100 Prozent, frueher waren nur 88 moeglich", () => {
    const g = computeGlobalStats(allesErledigt("quereinsteiger"), "quereinsteiger");
    expect(g.overallPct).toBe(100);
  });

  it("erreicht im Profi-Pfad ebenfalls 100 Prozent", () => {
    const g = computeGlobalStats(allesErledigt("profi"), "profi");
    expect(g.overallPct).toBe(100);
  });

  it("erreicht auch in den Kapiteln mit reinen Advanced-Uebungen 100 Prozent", () => {
    const s = allesErledigt("quereinsteiger");
    for (const kap of advancedKapitel) {
      const k = computeKapitelStats(kap, s, "quereinsteiger");
      expect(k.pct, `Kapitel ${kap.slug}`).toBe(100);
    }
  });

  it("der Profi hat mehr zaehlbare Uebungen als der Quereinsteiger", () => {
    const qe = computeGlobalStats(allesErledigt("quereinsteiger"), "quereinsteiger");
    const pro = computeGlobalStats(allesErledigt("profi"), "profi");
    expect(pro.totalUebungen).toBeGreaterThan(qe.totalUebungen);
  });

  it("Checklisten bleiben in beiden Pfaden gleich", () => {
    const qe = computeGlobalStats(allesErledigt("quereinsteiger"), "quereinsteiger");
    const pro = computeGlobalStats(allesErledigt("profi"), "profi");
    expect(qe.totalChecks).toBe(pro.totalChecks);
  });
});
