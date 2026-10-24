import { describe, expect, it } from "vitest";
import { neueEinheitGlocken } from "./neueEinheitGlocke";

const JETZT = Date.parse("2026-10-24T10:00:00Z");
const objekt = (id: string, angelegt: string | null) => ({ id, titel: `Haus ${id}`, ort: "Zossen", meta: angelegt ? { investagonNeuAngelegtAm: angelegt } : {} });

describe("neueEinheitGlocken", () => {
  it("meldet neue Objekte mit passenden Kunden, einmal je Objekt", () => {
    const g = neueEinheitGlocken([objekt("a", "2026-10-23T08:00:00Z")], () => ["Mira Schulte", "Paul Krüger", "Mira Schulte"], JETZT);
    expect(g).toHaveLength(1);
    expect(g[0].sperre).toBe("neue-einheit:a");
    expect(g[0].titel).toBe("Neue Einheiten passen zu 2 deiner Kunden");
    expect(g[0].nachricht).toBe("Haus a, Zossen: passt zu Mira Schulte, Paul Krüger.");
    expect(g[0].link).toBe("/objekte/a");
  });

  it("schweigt ohne passende Kunden, bei alten und bei nicht neuen Objekten", () => {
    expect(neueEinheitGlocken([objekt("a", "2026-10-23T08:00:00Z")], () => [], JETZT)).toHaveLength(0);
    expect(neueEinheitGlocken([objekt("b", "2026-10-10T08:00:00Z")], () => ["X"], JETZT)).toHaveLength(0);
    expect(neueEinheitGlocken([objekt("c", null)], () => ["X"], JETZT)).toHaveLength(0);
  });

  it("kürzt lange Namenslisten", () => {
    const g = neueEinheitGlocken([objekt("a", "2026-10-24T08:00:00Z")], () => ["A", "B", "C", "D", "E"], JETZT);
    expect(g[0].nachricht).toBe("Haus a, Zossen: passt zu A, B, C und 2 weitere.");
  });
});
