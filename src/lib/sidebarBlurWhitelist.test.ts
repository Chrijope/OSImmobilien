import { describe, expect, it } from "vitest";
import { SIDEBAR_BLUR_WHITELIST, isSidebarBlurExempt } from "./sidebarBlurWhitelist";

describe("sidebarBlurWhitelist", () => {
  it("ist leer, freigeschaltet wird über Rolle und Onboarding", () => {
    expect(SIDEBAR_BLUR_WHITELIST).toEqual([]);
    expect(isSidebarBlurExempt("christianpeetz.v.a@me.com")).toBe(false);
  });

  it("nimmt fehlende Adressen nicht aus", () => {
    expect(isSidebarBlurExempt(undefined)).toBe(false);
    expect(isSidebarBlurExempt("")).toBe(false);
  });
});
