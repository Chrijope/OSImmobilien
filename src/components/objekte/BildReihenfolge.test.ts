import { describe, it, expect } from "vitest";
import { verschiebeBild } from "./BildReihenfolge";

const liste = [{ id: "a" }, { id: "b" }, { id: "c" }];
const ids = (l: { id: string }[]) => l.map((b) => b.id).join("");

describe("verschiebeBild", () => {
  it("macht ein Bild zum Titelbild und verschiebt um eine Stelle", () => {
    expect(ids(verschiebeBild(liste, "c", "anfang"))).toBe("cab");
    expect(ids(verschiebeBild(liste, "a", 1))).toBe("bac");
    expect(ids(verschiebeBild(liste, "b", -1))).toBe("bac");
  });
  it("lässt die Liste am Rand und bei unbekanntem Bild unverändert", () => {
    expect(verschiebeBild(liste, "a", -1)).toBe(liste);
    expect(verschiebeBild(liste, "c", 1)).toBe(liste);
    expect(verschiebeBild(liste, "x", "anfang")).toBe(liste);
  });
});
