import { describe, expect, it } from "vitest";
import { zieheSchluesselUm } from "./speicherSchluesselUmzug";

function speicher(start: Record<string, string>): Storage {
  const m = new Map(Object.entries(start));
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

describe("zieheSchluesselUm", () => {
  it("übernimmt den alten Wert und entfernt den alten Schlüssel", () => {
    const s = speicher({ "moreimmo-crm-lang": "en" });
    zieheSchluesselUm(s);
    expect(s.getItem("osimmobilien-crm-lang")).toBe("en");
    expect(s.getItem("moreimmo-crm-lang")).toBeNull();
  });

  it("überschreibt keinen vorhandenen neuen Wert", () => {
    const s = speicher({ "moreimmo.design": "alt", "osimmobilien.design": "neu" });
    zieheSchluesselUm(s);
    expect(s.getItem("osimmobilien.design")).toBe("neu");
    expect(s.getItem("moreimmo.design")).toBeNull();
  });
});
