/**
 * Abwesenheit sperrt die Leadzuweisung.
 *
 * Ein Lead, der an einen Abwesenden geht, liegt bis zu dessen Rueckkehr
 * unbearbeitet, und das faellt niemandem auf: In der Liste sieht er zugewiesen
 * aus. Deshalb die Sperre.
 */
import { describe, expect, it } from "vitest";

import {
  abwesenheitAmTag,
  abwesenheitGrundText,
  type Abwesenheit,
} from "./abwesenheitStore";

function eintrag(teil: Partial<Abwesenheit>): Abwesenheit {
  return {
    id: "a1",
    user_id: "partner-1",
    von: "2026-09-14",
    bis: "2026-09-18",
    vertretung_id: null,
    notiz: null,
    ...teil,
  };
}

describe("Wann jemand als abwesend gilt", () => {
  const liste = [eintrag({})];

  it("sperrt am ersten Tag", () => {
    // Beide Randtage zaehlen mit, so steht es am Feld.
    expect(abwesenheitAmTag(liste, "partner-1", "2026-09-14")).not.toBeNull();
  });

  it("sperrt am letzten Tag", () => {
    expect(abwesenheitAmTag(liste, "partner-1", "2026-09-18")).not.toBeNull();
  });

  it("sperrt mittendrin", () => {
    expect(abwesenheitAmTag(liste, "partner-1", "2026-09-16")).not.toBeNull();
  });

  it("laesst den Tag davor frei", () => {
    expect(abwesenheitAmTag(liste, "partner-1", "2026-09-13")).toBeNull();
  });

  it("laesst den Tag danach frei", () => {
    expect(abwesenheitAmTag(liste, "partner-1", "2026-09-19")).toBeNull();
  });

  it("trifft nur den Abwesenden, nicht seine Kollegen", () => {
    expect(abwesenheitAmTag(liste, "partner-2", "2026-09-16")).toBeNull();
  });

  it("kommt mit einer leeren Kennung zurecht", () => {
    // Ein Lead ohne Zustaendigen darf nicht an einer leeren ID haengenbleiben.
    expect(abwesenheitAmTag(liste, "", "2026-09-16")).toBeNull();
    expect(abwesenheitAmTag(liste, "   ", "2026-09-16")).toBeNull();
  });

  it("findet den richtigen Eintrag bei mehreren", () => {
    const mehrere = [
      eintrag({ id: "a1", von: "2026-09-01", bis: "2026-09-03" }),
      eintrag({ id: "a2", von: "2026-09-14", bis: "2026-09-18" }),
    ];
    expect(abwesenheitAmTag(mehrere, "partner-1", "2026-09-16")?.id).toBe("a2");
  });
});

describe("Was auf dem Schirm steht", () => {
  it("nennt den Zeitraum", () => {
    /*
     * Ohne Zeitraum bliebe die Frage offen, wann es denn ginge, und derjenige
     * der zuweist, muesste ihn woanders nachschlagen.
     */
    const text = abwesenheitGrundText(eintrag({}));
    expect(text).toContain("14.09.2026");
    expect(text).toContain("18.09.2026");
  });

  it("nennt die Vertretung, wenn es eine gibt", () => {
    const text = abwesenheitGrundText(eintrag({}), "Sabine Mertens");
    expect(text).toContain("Vertretung: Sabine Mertens");
  });

  it("laesst die Vertretung weg, wenn keine hinterlegt ist", () => {
    expect(abwesenheitGrundText(eintrag({}))).not.toContain("Vertretung");
  });
});
