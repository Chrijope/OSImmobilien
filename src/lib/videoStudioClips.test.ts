import { describe, it, expect } from "vitest";
import { skriptInClips, dauerFuer, MAX_SEKUNDEN, MIN_SEKUNDEN } from "../../supabase/functions/video-studio/clips";

describe("Video-Studio: Skript in Clips", () => {
  it("leeres Skript ergibt keine Clips", () => {
    expect(skriptInClips("   ")).toEqual([]);
  });

  it("kurzes Skript bleibt ein Clip mit Mindestdauer", () => {
    expect(skriptInClips("Hallo zusammen.")).toEqual([{ text: "Hallo zusammen.", sekunden: MIN_SEKUNDEN }]);
  });

  it("schneidet an Satzenden und haelt jeden Clip unter 15 Sekunden", () => {
    const satz = "Das ist ein Satz mit genau zehn Woertern hier drin.";
    const clips = skriptInClips(Array(8).fill(satz).join(" "));
    expect(clips.length).toBeGreaterThan(1);
    for (const c of clips) {
      expect(c.sekunden).toBeLessThanOrEqual(MAX_SEKUNDEN);
      expect(c.text.endsWith(".")).toBe(true);
    }
    expect(clips.map((c) => c.text).join(" ")).toBe(Array(8).fill(satz).join(" "));
  });

  it("teilt einen ueberlangen Satz mitten im Satz", () => {
    const lang = Array(80).fill("Wort").join(" ");
    const clips = skriptInClips(lang);
    expect(clips.length).toBe(3);
    expect(clips.every((c) => dauerFuer(c.text) <= MAX_SEKUNDEN)).toBe(true);
  });
});
