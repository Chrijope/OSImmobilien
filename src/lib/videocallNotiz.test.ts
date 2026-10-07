import { describe, it, expect } from "vitest";
import { notizFolieLesen, notizFortschreiben, notizLesen } from "@/lib/videocallNotiz";
import type { ErfassungMitNotiz } from "@/lib/videocallNotiz";

/**
 * Die Regel hinter dem Notizfeld: ein Text für das ganze Gespräch, und die
 * laufende Folie schreibt sich beim ersten Buchstaben von selbst darüber.
 */
function schreibe(
  bisher: string,
  neu: string,
  folie: { id: string; nummer: number; titel: string } | null,
  vermerkteFolie = "",
) {
  return notizFortschreiben({
    bisher,
    neu,
    folieId: folie?.id ?? "",
    folieNummer: folie?.nummer ?? 0,
    folieTitel: folie?.titel ?? "",
    vermerkteFolie,
  });
}

const FOLIE1 = { id: "f1", nummer: 1, titel: "Die Ausgangslage" };
const FOLIE2 = { id: "f2", nummer: 2, titel: "Das Objektangebot" };

describe("notizFortschreiben", () => {
  it("vermerkt die laufende Folie beim ersten Buchstaben", () => {
    const stand = schreibe("", "E", FOLIE1);
    expect(stand.notiz).toBe("Folie 1, Die Ausgangslage\nE");
    expect(stand.notizFolie).toBe("f1");
  });

  it("vermerkt dieselbe Folie kein zweites Mal", () => {
    const stand = schreibe("Folie 1, Die Ausgangslage\nEr", "Folie 1, Die Ausgangslage\nEr f", FOLIE1, "f1");
    expect(stand.notiz).toBe("Folie 1, Die Ausgangslage\nEr f");
    expect(stand.notizFolie).toBe("f1");
  });

  it("setzt nach einem Folienwechsel eine neue Marke mit Leerzeile davor", () => {
    const bisher = "Folie 1, Die Ausgangslage\nEr fragt nach der Anlaufzeit";
    const stand = schreibe(bisher, `${bisher}W`, FOLIE2, "f1");
    expect(stand.notiz).toBe(
      "Folie 1, Die Ausgangslage\nEr fragt nach der Anlaufzeit\n\nFolie 2, Das Objektangebot\nW",
    );
    expect(stand.notizFolie).toBe("f2");
  });

  it("schreibt keine Marke, wenn mitten im Text geändert oder gelöscht wird", () => {
    const bisher = "Folie 1, Die Ausgangslage\nEr fragt";
    expect(schreibe(bisher, "Folie 1, Die Ausgangslage\nEr frag", FOLIE2, "f1").notiz).toBe(
      "Folie 1, Die Ausgangslage\nEr frag",
    );
    expect(schreibe(bisher, "Folie 1, Die Ausgangslage\nSie fragt", FOLIE2, "f1").notiz).toBe(
      "Folie 1, Die Ausgangslage\nSie fragt",
    );
  });

  it("fängt nach dem Leeren des Feldes wieder von vorn an", () => {
    const geleert = schreibe("Folie 1, Die Ausgangslage\nEr", "", FOLIE1, "f1");
    expect(geleert.notiz).toBe("");
    expect(geleert.notizFolie).toBe("");
    // Und die nächste Eingabe sagt wieder, bei welcher Folie sie entstand.
    expect(schreibe("", "N", FOLIE1, "").notiz).toBe("Folie 1, Die Ausgangslage\nN");
  });

  it("kommt ohne Folie aus, dann bleibt es beim reinen Text", () => {
    expect(schreibe("", "Ein Gedanke", null).notiz).toBe("Ein Gedanke");
  });
});

describe("notizLesen", () => {
  it("liest nichts, wo nichts steht", () => {
    expect(notizLesen(null)).toBe("");
    expect(notizLesen({})).toBe("");
    expect(notizFolieLesen({})).toBe("");
  });

  it("liest die Notiz aus dem vorhandenen Gesprächsstand", () => {
    const erfassung: ErfassungMitNotiz = { notiz: "Er will im Januar starten", notizFolie: "f3" };
    expect(notizLesen(erfassung)).toBe("Er will im Januar starten");
    expect(notizFolieLesen(erfassung)).toBe("f3");
  });
});
