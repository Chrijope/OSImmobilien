import { describe, expect, it } from "vitest";
import { spurenVerteilen } from "./TagesZeitleiste";
import type { KalenderEintrag } from "@/lib/kalenderTermine";

const e = (id: string) => ({ id } as KalenderEintrag);

describe("spurenVerteilen", () => {
  it("legt Überlappende nebeneinander und Spätere wieder in volle Breite", () => {
    const p = spurenVerteilen([
      { eintrag: e("a"), vonMin: 600, bisMin: 660 },
      { eintrag: e("b"), vonMin: 630, bisMin: 690 },
      { eintrag: e("c"), vonMin: 720, bisMin: 780 },
    ]);
    const nach = Object.fromEntries(p.map((x) => [x.eintrag.id, [x.spur, x.spuren]]));
    expect(nach).toEqual({ a: [0, 2], b: [1, 2], c: [0, 1] });
  });
});
