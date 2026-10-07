/**
 * Die Frist für Unterschriftslinks steht an zwei Stellen und muss gleich sein.
 *
 * Die Oberfläche liest sie aus `src/lib/signaturFrist.ts`, die Edge Functions
 * aus `supabase/functions/_shared/signatur-frist.ts`. Getrennt sind die beiden
 * nur, weil das Browser-Bündel nicht an den Deno-Ordner gehängt werden soll
 * (Begründung steht in beiden Dateien). Auseinanderlaufen dürfen sie deshalb
 * trotzdem nicht: Sonst verspricht ein Knopf vierzehn Tage, und der Link gilt
 * sieben. Genau so lagen Selbstauskunft und Reservierung bis zum 16.09.2026
 * auseinander.
 */

import { describe, it, expect } from "vitest";
import { SIGNATUR_FRIST_TAGE, SIGNATUR_FRIST_TEXT } from "./signaturFrist";
import {
  SIGNATUR_FRIST_TAGE as FRIST_SERVER,
  signaturAblauf,
  signaturAblaufText,
} from "../../supabase/functions/_shared/signatur-frist.ts";

describe("Frist für Unterschriftslinks", () => {
  it("ist die Entscheidung vom 16.09.2026: vierzehn Tage", () => {
    expect(SIGNATUR_FRIST_TAGE).toBe(14);
  });

  it("ist in Oberfläche und Edge Functions dieselbe Zahl", () => {
    expect(SIGNATUR_FRIST_TAGE).toBe(FRIST_SERVER);
  });

  it("nennt die Frist im Text, damit der Knopf sie sagen kann", () => {
    expect(SIGNATUR_FRIST_TEXT).toBe("14 Tage");
  });

  it("rechnet den Ablauf vom übergebenen Zeitpunkt aus", () => {
    const jetzt = new Date("2026-09-16T10:00:00.000Z");
    expect(signaturAblauf(jetzt)).toBe("2026-09-30T10:00:00.000Z");
  });

  it("liegt immer in der Zukunft, nie in der Vergangenheit", () => {
    expect(new Date(signaturAblauf()).getTime()).toBeGreaterThan(Date.now());
  });

  it("nennt dem Kunden in der Mail ein lesbares Datum", () => {
    expect(signaturAblaufText("2026-09-30T10:00:00.000Z")).toBe("30. September 2026");
  });

  it("behauptet nichts, wenn kein brauchbares Datum vorliegt", () => {
    expect(signaturAblaufText("")).toBe("");
  });
});
