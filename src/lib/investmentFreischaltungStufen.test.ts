import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { PIPELINE_STUFEN } from "./pipelineStufen";

/**
 * Der Wächter über die Freischaltung von Finanzierung und Notar.
 *
 * ## Was am 21.09.2026 passiert ist
 *
 * Bei einem Kunden waren Finanzierung und Notar gesperrt, obwohl die
 * Reservierung digital unterschrieben vorlag. Der Grund: Seit dem 11.09.2026
 * springt ein Vorgang nach der Unterschrift auf die Stufe
 * „Bonitätsunterlagen", und genau die fehlte in der Freischaltliste. Die Liste
 * stand dabei zweimal wortgleich im Code, einmal für die Finanzierung und
 * einmal für den Notar, und in beiden fehlte dieselbe Stufe.
 *
 * Der angezeigte Sperrtext sagte dazu „wird nach unterschriebener
 * Reservierungsvereinbarung freigeschaltet". Er nannte also einen Grund, der
 * gar nicht der Grund war, und schickte die Fehlersuche in die falsche
 * Richtung.
 *
 * ## Warum dieser Test den Quelltext liest
 *
 * Die Liste steht in einer Seitendatei mit über 14.000 Zeilen, die sich nicht
 * ohne Weiteres in einem Test rendern lässt. Der Quelltext ist hier die
 * ehrlichste verfügbare Quelle: Er hält fest, dass es die Liste genau einmal
 * gibt und dass sie die Stufe enthält.
 */

const QUELLE = fs.readFileSync("src/pages/KundenDetail.tsx", "utf8");
const MODUL = fs.readFileSync("src/lib/investmentFreischaltung.ts", "utf8");
const KARTE = fs.readFileSync("src/components/finanzierung/FinanzierungCard.tsx", "utf8");

/*
 * Seit dem 25.09.2026 steht die Liste in `src/lib/investmentFreischaltung.ts`
 * und nicht mehr im Kundenprofil. Die Finanzierung fragt sie über
 * `finanzierungIntern` ab, der Notar weiterhin direkt.
 */
describe("Die Freischaltung von Finanzierung und Notar", () => {
  it("führt die Liste genau einmal, im Modul und nicht im Kundenprofil", () => {
    expect(MODUL.match(/export const FREIGESCHALTET_AB_RESERVIERUNG[^=]*= \[/g) ?? []).toHaveLength(1);
    expect(QUELLE).not.toMatch(/const FREIGESCHALTET_AB_RESERVIERUNG = \[/);
  });

  it("die Finanzierung fragt die eine Regel ab, der Notar die Liste", () => {
    expect(QUELLE.match(/finanzierungIntern\(\{/g) ?? []).toHaveLength(1);
    expect(QUELLE.match(/FREIGESCHALTET_AB_RESERVIERUNG\.includes\(inv\.pipelineStufe\)/g) ?? []).toHaveLength(1);
  });

  it("die Karte sperrt nicht mehr selbst nach der Stufe", () => {
    expect(KARTE).not.toContain("Finanzierung wird nach der Reservierung freigeschaltet.");
    expect(KARTE).not.toMatch(/\.includes\(pipelineStufe\)/);
  });

  it("enthält die Stufe Bonitätsunterlagen", () => {
    /*
      Das ist der eigentliche Fehler von damals. Ein Vorgang steht nach der
      unterschriebenen Reservierung genau hier, und ohne diese Zeile bleiben
      beide Bereiche dauerhaft gesperrt.
    */
    const block = MODUL.match(/export const FREIGESCHALTET_AB_RESERVIERUNG[^=]*= \[([\s\S]*?)\];/);

    expect(block, "die Liste selbst").toBeTruthy();
    expect(block![1]).toContain('"bonitaetsunterlagen"');
  });

  it("nennt nur Stufen, die es wirklich gibt", () => {
    // Ein Tippfehler in der Liste wäre unsichtbar: Die Stufe träfe nie zu, und
    // der Bereich bliebe gesperrt, ohne dass irgendwo etwas aufleuchtet.
    const block = MODUL.match(/export const FREIGESCHALTET_AB_RESERVIERUNG[^=]*= \[([\s\S]*?)\];/)![1];
    const genannt = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    const bekannt = PIPELINE_STUFEN.map((s) => s.key);

    expect(genannt.length).toBeGreaterThan(0);
    for (const stufe of genannt) {
      expect(bekannt, `Stufe „${stufe}" steht in der Liste, aber nicht in pipelineStufen.ts`).toContain(stufe);
    }
  });

  it("nennt im Sperrtext nicht mehr pauschal die Reservierung", () => {
    /*
      Der alte Satz stand fest da, auch wenn die Reservierung längst
      unterschrieben war. Jetzt hängt er davon ab, ob sie es ist.
    */
    expect(QUELLE).not.toContain("<span>Notar wird nach unterschriebener Reservierungsvereinbarung freigeschaltet.</span>");
    expect(QUELLE).not.toContain('"Finanzierung wird freigeschaltet…"');
  });
});

/**
 * Der Vermerk „Kunde finanziert selbst" überspringt die Bonitätsunterlagen.
 *
 * Er versprach das seit jeher in seinem eigenen Beschreibungstext, bewirkt hat
 * er es nie: Die Funktion `bonitaetsunterlagenErforderlich` existierte, wurde
 * aber von keiner Stelle im Programm aufgerufen. Ein Selbstfinanzierer landete
 * deshalb auf einer Stufe, aus der ihn nur die Freigabe von Unterlagen
 * herausbringt, die es bei ihm gar nicht gibt.
 */
describe("Wer selbst finanziert, wartet nicht auf Bonitätsunterlagen", () => {
  it("fragt beim Stufensprung nach der Reservierung den Vermerk ab", () => {
    expect(QUELLE).toContain("bonitaetsunterlagenErforderlich(inv.id)");
  });

  it("springt bei gesetztem Vermerk direkt auf Finanzierung", () => {
    const block = QUELLE.match(
      /const naechsteStufeNachRv = bonitaetsunterlagenErforderlich\(inv\.id\)([\s\S]{0,120})/,
    );

    expect(block, "die Entscheidung über die nächste Stufe").toBeTruthy();
    expect(block![1]).toContain('"bonitaetsunterlagen"');
    expect(block![1]).toContain('"finanzierung"');
  });

  it("verspricht im Schaltertext nur noch, was der Schalter tut", () => {
    // Vorher stand dort „Objektauswahl und alle weiteren Schritte sind
    // freigeschaltet", und freigeschaltet wurde nur die Objektauswahl.
    expect(QUELLE).not.toContain("Objektauswahl und alle weiteren Schritte sind freigeschaltet");
    expect(QUELLE).toContain("der Vorgang wartet nicht auf ihre Freigabe");
  });
});
