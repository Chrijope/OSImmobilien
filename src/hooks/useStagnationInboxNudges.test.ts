import { describe, expect, it } from "vitest";
import { stufeAusNudgeTitel } from "./useStagnationInboxNudges";

describe("stufeAusNudgeTitel", () => {
  it("erkennt die heutigen Stufennamen", () => {
    expect(stufeAusNudgeTitel("⏳ Stillstand Firmen- und Konzeptvorstellung: Anna B")).toBe("beratungsgespraech");
    expect(stufeAusNudgeTitel("⏳ Stillstand Objektvorstellung / Closing: Anna B")).toBe("objektauswahl");
  });

  // Offene Nudges von vor der Umbenennung liegen mit dem alten Namen im Speicher.
  it("erkennt die alten Namen in gespeicherten Nudges", () => {
    expect(stufeAusNudgeTitel("⏳ Stillstand Beratungspräsentation: Anna B")).toBe("beratungsgespraech");
    expect(stufeAusNudgeTitel("⏳ Stillstand Objektpräsentation / Closing: Anna B")).toBe("objektauswahl");
  });

  it("liefert nichts bei fremden Titeln", () => {
    expect(stufeAusNudgeTitel("⏳ Stillstand Unbekannt: Anna B")).toBeUndefined();
  });
});
