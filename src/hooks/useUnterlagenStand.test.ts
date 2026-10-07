import { describe, it, expect, beforeEach } from "vitest";

// jsdom bringt hier keinen localStorage mit, derselbe Behelf wie anderswo.
const speicher = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  writable: true,
  value: {
    getItem: (k: string) => speicher.get(k) ?? null,
    setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
    removeItem: (k: string) => { speicher.delete(k); },
    clear: () => speicher.clear(),
  },
});

const { heuteWeggeklickt, heuteWegklicken } = await import("@/hooks/useUnterlagenStand");

describe("Banner einmal am Tag wegklicken", () => {
  beforeEach(() => speicher.clear());

  it("ist vor dem ersten Klick sichtbar", () => {
    expect(heuteWeggeklickt("MI-001")).toBe(false);
  });

  it("bleibt nach dem Wegklicken heute verborgen", () => {
    heuteWegklicken("MI-001");
    expect(heuteWeggeklickt("MI-001")).toBe(true);
  });

  it("erscheint am naechsten Tag wieder", () => {
    // Ein Hinweis, den man einmal wegklickt und der nie wiederkommt,
    // erinnert an nichts.
    speicher.set("unterlagen-banner-weg:MI-001", "2020-01-01");
    expect(heuteWeggeklickt("MI-001")).toBe(false);
  });

  it("haelt zwei Nutzer auseinander", () => {
    // Auf einem geteilten Rechner darf der naechste Anmelder nicht den
    // weggeklickten Banner des vorigen erben.
    heuteWegklicken("MI-001");
    expect(heuteWeggeklickt("MI-002")).toBe(false);
    expect(heuteWeggeklickt("MI-001")).toBe(true);
  });
});
