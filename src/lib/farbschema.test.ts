// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { istDunkel, ladeFarbschema, leseFarbschema, merkeFarbschema } from "./farbschema";

describe("Farbschema", () => {
  // jsdom bringt hier keinen localStorage mit, deshalb ein kleiner Ersatz wie in bewerberFormularEntwurf.test.ts.
  beforeEach(() => {
    const speicher = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => speicher.get(k) ?? null,
        setItem: (k: string, v: string) => { speicher.set(k, String(v)); },
        removeItem: (k: string) => { speicher.delete(k); },
      },
    });
  });

  it("liest nur gültige Werte, sonst hell wie bisher", () => {
    expect(leseFarbschema("dunkel")).toBe("dunkel");
    expect(leseFarbschema("auto")).toBe("auto");
    expect(leseFarbschema(null)).toBe("hell");
    expect(leseFarbschema("lila")).toBe("hell");
  });

  it("merkt die Wahl je Gerät", () => {
    merkeFarbschema("auto");
    expect(ladeFarbschema()).toBe("auto");
  });

  it("Automatisch folgt dem Gerät, Hell und Dunkel nicht", () => {
    expect(istDunkel("auto", true)).toBe(true);
    expect(istDunkel("auto", false)).toBe(false);
    expect(istDunkel("hell", true)).toBe(false);
    expect(istDunkel("dunkel", false)).toBe(true);
  });
});
