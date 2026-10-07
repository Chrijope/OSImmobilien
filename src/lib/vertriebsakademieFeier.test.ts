import { describe, it, expect } from "vitest";
import { EINBLENDER_MS, KONFETTI, feierEntscheiden, feierText } from "@/lib/vertriebsakademieFeier";

const ruhig = {
  kapitelGefeiert: false,
  alleKapitelFertig: false,
  akademieGefeiert: false,
};

describe("Konfetti-Auslöser je Kapitel", () => {
  it("feuert beim Sprung von unter 100 auf 100", () => {
    expect(feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 100 })).toBe("kapitel");
    expect(feierEntscheiden({ ...ruhig, vorherPct: 0, nachherPct: 100 })).toBe("kapitel");
  });

  it("feuert nicht, solange das Kapitel unter 100 bleibt", () => {
    expect(feierEntscheiden({ ...ruhig, vorherPct: 50, nachherPct: 83 })).toBe("keine");
    expect(feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 50 })).toBe("keine");
  });

  it("feuert nicht, wenn das Kapitel schon auf 100 stand", () => {
    expect(feierEntscheiden({ ...ruhig, vorherPct: 100, nachherPct: 100 })).toBe("keine");
  });

  it("feuert nicht beim Aufmachen und erneuten Abschließen, wenn schon gefeiert wurde", () => {
    expect(feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 100, kapitelGefeiert: true })).toBe("keine");
  });
});

describe("Die große Feier am Ende der Akademie", () => {
  it("ersetzt die Kapitelfeier, wenn mit diesem Sprung alle Kapitel fertig sind", () => {
    expect(feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 100, alleKapitelFertig: true })).toBe("akademie");
  });

  it("kommt nur einmal, danach bleibt es bei der kleinen Fassung", () => {
    expect(
      feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 100, alleKapitelFertig: true, akademieGefeiert: true }),
    ).toBe("kapitel");
  });

  it("kommt nicht, wenn das Kapitel selbst schon gefeiert wurde", () => {
    expect(
      feierEntscheiden({ ...ruhig, vorherPct: 83, nachherPct: 100, alleKapitelFertig: true, kapitelGefeiert: true }),
    ).toBe("keine");
  });
});

describe("Texte und Grenzen", () => {
  it("nennt das Kapitel beim Namen und gratuliert am Ende zur ganzen Akademie", () => {
    expect(feierText("kapitel", "Erstgespräch")).toBe("Kapitel geschafft: Erstgespräch");
    expect(feierText("akademie", "Erstgespräch")).toBe(
      "Glückwunsch, du hast die Vertriebsakademie erfolgreich durchlaufen.",
    );
  });

  it("hält sich an drei Sekunden Einblender, höchstens 150 Teilchen und höchstens zwei Sekunden Konfetti", () => {
    expect(EINBLENDER_MS).toBe(3000);
    for (const k of Object.values(KONFETTI)) {
      expect(k.anzahl).toBeLessThanOrEqual(150);
      expect(k.dauerMs).toBeLessThanOrEqual(2000);
      expect(k.dauerMs).toBeGreaterThanOrEqual(1500);
    }
    expect(KONFETTI.akademie.anzahl).toBeGreaterThan(KONFETTI.kapitel.anzahl);
  });
});
