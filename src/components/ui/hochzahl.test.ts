import { describe, expect, it } from "vitest";
import { zerlegeZahl } from "./hochzahl";

describe("zerlegeZahl", () => {
  it("findet die eine Zahl mit Einheit", () => {
    expect(zerlegeZahl("249 T€")).toEqual({ vor: "", zahl: 249, nach: " T€", nachkomma: 0 });
    expect(zerlegeZahl("12,5 %")).toEqual({ vor: "", zahl: 12.5, nach: " %", nachkomma: 1 });
    expect(zerlegeZahl("1.250.000 €")?.zahl).toBe(1250000);
    expect(zerlegeZahl("+3")).toEqual({ vor: "+", zahl: 3, nach: "", nachkomma: 0 });
  });
  it("lässt Texte mit mehreren oder keiner Zahl stehen", () => {
    expect(zerlegeZahl("1 / 1")).toBeNull();
    expect(zerlegeZahl("offen")).toBeNull();
    expect(zerlegeZahl("0")).toBeNull();
  });
});
