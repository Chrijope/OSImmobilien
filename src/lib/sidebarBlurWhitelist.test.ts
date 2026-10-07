import { describe, expect, it } from "vitest";
import { SIDEBAR_BLUR_WHITELIST, isSidebarBlurExempt } from "./sidebarBlurWhitelist";

describe("sidebarBlurWhitelist", () => {
  it("führt g.schick@moreimmo.de nicht mehr, die Adresse existiert nicht", () => {
    expect(SIDEBAR_BLUR_WHITELIST.some((e) => e.toLowerCase().includes("g.schick"))).toBe(false);
    expect(isSidebarBlurExempt("g.schick@moreimmo.de")).toBe(false);
  });

  it("erkennt eingetragene Adressen unabhängig von Groß- und Kleinschreibung", () => {
    expect(isSidebarBlurExempt(" C.Peetz@MoreImmo.de ")).toBe(true);
  });

  it("nimmt fehlende Adressen nicht aus", () => {
    expect(isSidebarBlurExempt(undefined)).toBe(false);
    expect(isSidebarBlurExempt("")).toBe(false);
  });
});
