import { describe, expect, it } from "vitest";
import { anredeAusSkript } from "./beratungAnrede";

describe("anredeAusSkript", () => {
  it("übernimmt eine gespeicherte Du-Wahl", () => {
    expect(anredeAusSkript({ anrede: "du" })).toBe("du");
  });

  it("übernimmt eine gespeicherte Sie-Wahl", () => {
    expect(anredeAusSkript({ anrede: "sie" })).toBe("sie");
  });

  it("fällt ohne gespeicherte Wahl auf Du zurück", () => {
    expect(anredeAusSkript({})).toBe("du");
    expect(anredeAusSkript(null)).toBe("du");
    expect(anredeAusSkript(undefined)).toBe("du");
  });

  it("ignoriert unbrauchbare Werte und bleibt beim Du", () => {
    expect(anredeAusSkript({ anrede: 42 })).toBe("du");
    expect(anredeAusSkript("sie")).toBe("du");
  });
});
