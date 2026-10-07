import { describe, it, expect } from "vitest";
import {
  BUNDESLAENDER,
  KAUFNEBENKOSTEN_HOECHSTSATZ,
  NOTAR_GRUNDBUCH_PROZENT,
  bundeslandById,
} from "@/lib/grunderwerbsteuer";
import { GREST_BY_BUNDESLAND, grEstForBundesland } from "@/lib/bundeslandGrEst";
import { BUNDESLAND_NK } from "@/lib/kaufnebenkosten";

/**
 * Die Sätze standen einmal in vier Tabellen, zwei davon waren veraltet. In
 * Thüringen rechnete der Team-Pro-Q-Rechner dadurch bei 300.000 Euro Kaufpreis
 * 4.500 Euro zu viel, und das vor dem Kunden. Diese Tests halten die Sätze fest
 * und prüfen, dass die abgeleiteten Tabellen nicht wieder auseinanderlaufen.
 *
 * Schlägt ein Test fehl, weil ein Bundesland seinen Satz wirklich geändert hat:
 * Wert in `grunderwerbsteuer.ts` anpassen, dort die Standangabe nachziehen und
 * erst dann den erwarteten Wert hier ändern.
 *
 * Stand: Juli 2026.
 */
const ERWARTETE_SAETZE: Record<string, number> = {
  bw: 5.0,
  by: 3.5,
  be: 6.0,
  bb: 6.5,
  hb: 5.5, // seit 1.7.2025, vorher 5,0
  hh: 5.5,
  he: 6.0,
  mv: 6.0,
  ni: 5.0,
  nw: 6.5,
  rp: 5.0,
  sl: 6.5,
  sn: 5.5,
  st: 5.0,
  sh: 6.5,
  th: 5.0, // seit 1.1.2024, vorher 6,5
};

describe("Grunderwerbsteuer, zentrale Tabelle", () => {
  it("führt genau sechzehn Bundesländer", () => {
    expect(BUNDESLAENDER).toHaveLength(16);
    expect(new Set(BUNDESLAENDER.map((b) => b.id)).size).toBe(16);
    expect(new Set(BUNDESLAENDER.map((b) => b.name)).size).toBe(16);
  });

  it.each(Object.entries(ERWARTETE_SAETZE))(
    "hält den Satz für %s bei %s Prozent",
    (id, satz) => {
      expect(bundeslandById(id)?.grunderwerbsteuer).toBe(satz);
    },
  );

  it("kennt keine Bundesländer außerhalb der erwarteten Liste", () => {
    expect(BUNDESLAENDER.map((b) => b.id).sort()).toEqual(
      Object.keys(ERWARTETE_SAETZE).sort(),
    );
  });
});

describe("Abgeleitete Tabellen", () => {
  it("bundeslandGrEst liefert für jeden Namen denselben Satz", () => {
    for (const bl of BUNDESLAENDER) {
      expect(GREST_BY_BUNDESLAND[bl.name]).toBe(bl.grunderwerbsteuer);
      expect(grEstForBundesland(bl.name)).toBe(bl.grunderwerbsteuer);
    }
    expect(Object.keys(GREST_BY_BUNDESLAND)).toHaveLength(16);
  });

  it("kaufnebenkosten liefert für jeden Schlüssel denselben Satz", () => {
    // Ohne den Eintrag "andere", der bewusst null Prozent trägt.
    const echte = BUNDESLAND_NK.filter((b) => b.value !== "andere");
    expect(echte).toHaveLength(16);
    for (const eintrag of echte) {
      const zentral = BUNDESLAENDER.find((b) => b.name === eintrag.label);
      expect(zentral, `Bundesland ${eintrag.label} fehlt zentral`).toBeDefined();
      expect(eintrag.grEstP).toBe(zentral!.grunderwerbsteuer);
      // Notar 1,0 plus Grundbuch 0,5 Prozent, Makler bleibt außen vor.
      expect(eintrag.pct).toBeCloseTo(zentral!.grunderwerbsteuer + 1.5, 5);
    }
  });

  it("behält die alten Schlüssel, sie stecken in gespeicherten Objektdaten", () => {
    expect(BUNDESLAND_NK.map((b) => b.value)).toEqual([
      "bw", "bayern", "berlin", "brandenburg", "bremen", "hamburg", "hessen",
      "mv", "niedersachsen", "nrw", "rlp", "saarland", "sachsen", "sa", "sh",
      "thueringen", "andere",
    ]);
  });

  it("Thüringen liegt überall bei 5,0 Prozent", () => {
    expect(bundeslandById("th")?.grunderwerbsteuer).toBe(5.0);
    expect(GREST_BY_BUNDESLAND["Thüringen"]).toBe(5.0);
    expect(BUNDESLAND_NK.find((b) => b.value === "thueringen")?.grEstP).toBe(5.0);
  });

  it("Bremen liegt überall bei 5,5 Prozent", () => {
    expect(bundeslandById("hb")?.grunderwerbsteuer).toBe(5.5);
    expect(GREST_BY_BUNDESLAND["Bremen"]).toBe(5.5);
    expect(BUNDESLAND_NK.find((b) => b.value === "bremen")?.grEstP).toBe(5.5);
  });
});


/**
 * Der Hoechstsatz, mit dem der Steuerrechner die Kaufnebenkosten ansetzt.
 *
 * Auf der Seite steht, dass dieser Wert je nach Bundesland NUR NACH UNTEN
 * abweicht. Dieser Test haelt genau diese Zusage fest: Sobald ein Bundesland
 * seinen Satz anhebt und die Konstante nicht mitgezogen wird, waere der
 * Hinweis auf der Seite falsch.
 */
describe("Der Hoechstsatz der Kaufnebenkosten", () => {
  it("ist der teuerste Fall aus der Tabelle, Notar und Grundbuch eingerechnet", () => {
    const teuerstes = Math.max(...BUNDESLAENDER.map((b) => b.grunderwerbsteuer));
    expect(KAUFNEBENKOSTEN_HOECHSTSATZ).toBe(teuerstes + NOTAR_GRUNDBUCH_PROZENT);
    expect(KAUFNEBENKOSTEN_HOECHSTSATZ).toBe(8.5);
  });

  it("wird von keinem Bundesland ueberschritten", () => {
    for (const b of BUNDESLAENDER) {
      expect(b.grunderwerbsteuer + NOTAR_GRUNDBUCH_PROZENT).toBeLessThanOrEqual(
        KAUFNEBENKOSTEN_HOECHSTSATZ,
      );
    }
  });
});
