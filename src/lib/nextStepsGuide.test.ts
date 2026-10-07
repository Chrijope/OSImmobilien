import { describe, it, expect } from "vitest";
import { getNextSteps } from "@/lib/nextStepsGuide";
import { FORTSCHRITT_STUFEN } from "@/lib/pipelineStufen";
import { MAX_KONTAKTVERSUCHE } from "@/lib/kontaktversuchSchedule";

/**
 * Der Leitfaden lief zweimal von der Pipeline weg: Ihm fehlten sechs Stufen,
 * darunter die reguläre Stufe "Selbstauskunft", und er schleppte drei
 * abgeschaffte mit. Eine fehlende Stufe fällt im Alltag nicht auf, weil die
 * Karte dann kommentarlos verschwindet, statt einen Fehler zu zeigen. Genau
 * dagegen sind diese Tests da.
 */

describe("Leitfaden „Nächste Schritte\"", () => {
  it("hat für jede Stufe der Fortschrittsleiste einen Eintrag", () => {
    for (const stufe of FORTSCHRITT_STUFEN) {
      const guide = getNextSteps(stufe.key, true);
      expect(guide, `Stufe "${stufe.key}" (${stufe.label}) hat keinen Leitfaden`).not.toBeNull();
      expect(guide!.titel.length, `Stufe "${stufe.key}" hat keinen Titel`).toBeGreaterThan(0);
      expect(guide!.aktionen.length, `Stufe "${stufe.key}" hat keine Aktion`).toBeGreaterThan(0);
    }
  });

  it("kennt auch die beiden NoShow-Stufen", () => {
    // Sie haben kein Kästchen in der Leiste, aber ein Kunde steht real darin
    // und braucht dann erst recht eine Ansage.
    for (const key of ["eg_noshow", "bg_noshow"]) {
      expect(getNextSteps(key, true), `Stufe "${key}" hat keinen Leitfaden`).not.toBeNull();
    }
  });

  it("löst echte Altwerte auf ihre heutige Entsprechung auf", () => {
    // "closing" existiert als Spalte nicht mehr. "zugewiesen",
    // "kontaktversuche" und "vermoegensaufbau" dagegen schon: Sie sind Teil
    // des Ablaufs und haben eigene Leitfäden, siehe der Test darunter.
    const paare: Array<[string, string]> = [
      ["closing", "objektauswahl"],
    ];
    for (const [alt, neu] of paare) {
      const altGuide = getNextSteps(alt, true);
      expect(altGuide, `Altstufe "${alt}" liefert keinen Leitfaden`).not.toBeNull();
      expect(altGuide!.titel, `"${alt}" muss wie "${neu}" führen`).toBe(getNextSteps(neu, true)!.titel);
    }
  });

  it("führt die drei Ablaufstufen mit eigenem Leitfaden", () => {
    // Sie wurden früher auf andere Stufen umgeschrieben. Da sie jetzt echte
    // Stufen sind, braucht jede einen eigenen Text.
    for (const stufe of ["zugewiesen", "kontaktversuche", "vermoegensaufbau"]) {
      const guide = getNextSteps(stufe, true);
      expect(guide, `Stufe "${stufe}" hat keinen Leitfaden`).not.toBeNull();
      expect(guide!.aktionen.length).toBeGreaterThan(0);
    }
  });

  it("nennt die Kontaktversuch-Grenze aus der zentralen Konstante", () => {
    // Dieselbe Zahl stand einmal als 4 und einmal als 5 im Code, tatsächlich
    // sind es 15. Sie darf nirgends erneut abgetippt werden.
    const hinweis = getNextSteps("nicht_erreicht", true)?.hinweis || "";
    expect(hinweis).toContain(String(MAX_KONTAKTVERSUCHE));
  });

  it("beschreibt die Reihenfolge, die das System wirklich läuft", () => {
    // Beratungsgespräch führt auf die Selbstauskunft, die Bonität auf die
    // Finanzierung. Vorher stand hier das Gegenteil, jeweils eine Stufe aus
    // der alten Reihenfolge.
    expect(getNextSteps("beratungsgespraech", true)?.hinweis).toContain("Selbstauskunft");
    expect(getNextSteps("bonitaetsunterlagen", true)?.hinweis).toContain("Finanzierung");
    expect(getNextSteps("selbstauskunft", true)?.hinweis).toContain("Objektauswahl");
  });

  it("enthält keine Gedankenstriche in den Texten, die Nutzer sehen", () => {
    for (const stufe of FORTSCHRITT_STUFEN) {
      const guide = getNextSteps(stufe.key, true)!;
      const texte = [guide.titel, guide.hinweis || "", ...guide.aktionen.map((a) => a.text)];
      for (const text of texte) {
        expect(text, `Gedankenstrich in "${stufe.key}": ${text}`).not.toMatch(/[—–]/);
      }
    }
  });
});
