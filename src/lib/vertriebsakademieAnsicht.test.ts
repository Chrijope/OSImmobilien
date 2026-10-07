import { beforeEach, describe, expect, it } from "vitest";
import {
  akademieZiel,
  leseLesestelle,
  merkeLesestelle,
  teileLektion,
} from "./vertriebsakademieAnsicht";
import { VERTRIEBSAKADEMIE_KAPITEL } from "./vertriebsakademieContent";
import {
  computeKapitelStats,
  type VaProgressState,
} from "./vertriebsakademieProgress";

const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => speicher.set(k, String(v)),
    removeItem: (k: string) => speicher.delete(k),
    clear: () => speicher.clear(),
  },
});
beforeEach(() => localStorage.clear());
describe("Zweite Akademie ohne Inhalts- oder Fortschrittsmigration", () => {
  it("behält jedes Inhaltsfeld, jede Aufgabe und ihre ursprüngliche Kennung in allen Kapiteln", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL)
      for (const sec of kap.sections) {
        const vorher = JSON.stringify(sec);
        const { wissen, praxis } = teileLektion(sec);
        for (const [field, value] of Object.entries(sec)) {
          const target = ["aufgaben", "uebungen", "checkliste"].includes(field)
            ? praxis
            : wissen;
          expect(
            target[field as keyof typeof target],
            `${kap.slug}/${sec.id}/${field}`,
          ).toEqual(value);
        }
        expect(praxis.aufgaben).toBe(sec.aufgaben);
        expect(praxis.uebungen).toBe(sec.uebungen);
        expect(praxis.checkliste).toBe(sec.checkliste);
        expect(JSON.stringify(sec)).toBe(vorher);
      }
  });
  it("ergibt mit bestehenden Partnerdaten exakt denselben Fortschritt", () => {
    const state: VaProgressState = {
      checks: {},
      uebungen: {},
      sectionsDone: {},
      kapitelDone: {},
      answers: {},
      aufgaben: {},
      abwaegung: {},
      aktiveTage: [],
    };
    for (const [i, kap] of VERTRIEBSAKADEMIE_KAPITEL.entries()) {
      state.sectionsDone[`${kap.slug}::${kap.sections[0].id}`] = true;
      if (i % 3 === 0) state.kapitelDone[kap.slug] = true;
      for (const sec of kap.sections) {
        if (sec.aufgaben?.[0])
          state.aufgaben[`${kap.slug}::${sec.aufgaben[0].id}`] = {
            geloest: true,
            versuche: 2,
            punkte: 5,
          };
        if (sec.uebungen?.[0]) {
          state.answers[`${kap.slug}::${sec.uebungen[0].id}`] =
            "Bestehende persönliche Antwort";
          state.uebungen[`${kap.slug}::${sec.uebungen[0].id}`] = true;
        }
      }
    }
    const snapshot = JSON.stringify(state);
    for (const pfad of ["alle", "profi", "quereinsteiger"] as const)
      for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
        const neu = {
          ...kap,
          sections: kap.sections.map((s) => {
            const { wissen, praxis } = teileLektion(s);
            return { ...wissen, ...praxis };
          }),
        };
        expect(computeKapitelStats(neu, state, pfad)).toEqual(
          computeKapitelStats(kap, state, pfad),
        );
      }
    expect(JSON.stringify(state)).toBe(snapshot);
  });
  it("behält Query und Sprungmarke beim Wechsel und ändert fremde Ziele nicht", () => {
    expect(
      akademieZiel(
        "/vertriebsakademie/grundlagen?vaScrollTo=cashflow#frage",
        "/vertriebsakademie-neu/kultur",
      ),
    ).toBe("/vertriebsakademie/grundlagen?vaScrollTo=cashflow#frage");
    expect(
      akademieZiel(
        "/vertriebsakademie/grundlagen",
        "/vertriebsakademie/kultur",
      ),
    ).toBe("/vertriebsakademie/grundlagen");
    expect(akademieZiel("/kunden/123", "/vertriebsakademie-neu")).toBe(
      "/kunden/123",
    );
    expect(
      akademieZiel("/vertriebsakademie-neu", "/vertriebsakademie-neu"),
    ).toBe("/vertriebsakademie");
  });
  it("speichert Lesestellen getrennt pro Partner und lässt Fortschrittsdaten unberührt", () => {
    localStorage.setItem("vertriebsakademie_progress_v1", "unveraendert");
    merkeLesestelle("partner-a", { slug: "grundlagen", section: "cashflow" });
    merkeLesestelle("partner-b", { slug: "kultur", section: "kultur-werte" });
    expect(leseLesestelle("partner-a")).toEqual({
      slug: "grundlagen",
      section: "cashflow",
    });
    expect(leseLesestelle("partner-b")?.slug).toBe("kultur");
    expect(leseLesestelle()).toBeNull();
    expect(localStorage.getItem("vertriebsakademie_progress_v1")).toBe(
      "unveraendert",
    );
  });
});
