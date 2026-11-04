import { describe, expect, it } from "vitest";
import { offeneMeldungen, zweigZustand } from "./sidebarNavigation";

describe("Seitenleiste", () => {
  it("färbt die Leitlinie bis zum aktiven Punkt", () => {
    expect([0, 1, 2, 3].map((i) => zweigZustand(i, 2))).toEqual(["vorher", "vorher", "aktiv", ""]);
  });

  it("lässt die Leitlinie ohne aktiven Punkt neutral", () => {
    expect([0, 1].map((i) => zweigZustand(i, -1))).toEqual(["", ""]);
  });

  it("zählt Meldungen und „Neu“ für zugeklappte Abschnitte zusammen", () => {
    expect(offeneMeldungen([{ badgeCount: 3 }, { newBadge: true }, {}])).toBe(4);
  });
});
