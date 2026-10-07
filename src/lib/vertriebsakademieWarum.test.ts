import { describe, it, expect } from "vitest";
import { VERTRIEBSAKADEMIE_KAPITEL } from "./vertriebsakademieContent";

/**
 * Der „Warum"-Kasten ist zuklappbar geworden, nicht verschwunden.
 *
 * Beim Umbau der Akademie lagen 79 gefüllte `warum`-Felder im Inhalt. Sie
 * werden weiterhin alle gerendert, nur eben zugeklappt (im Profi-Pfad offen).
 * Diese Prüfung schlägt Alarm, falls beim Schreiben der Inhalte Begründungen
 * verloren gehen. Kommen welche dazu, darf die Zahl wachsen.
 */
const STAND_BEIM_UMBAU = 79;

function zaehleWarum(): number {
  let n = 0;
  for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
    for (const sec of kap.sections) {
      for (const sk of sec.skripte ?? []) if (sk.warum) n++;
      if (sec.goldNugget?.skript?.warum) n++;
      for (const e of sec.einwaende ?? []) if (e.warum) n++;
    }
  }
  return n;
}

describe("Begründungen im Inhalt", () => {
  it("es sind mindestens so viele wie beim Umbau der Akademie", () => {
    expect(zaehleWarum()).toBeGreaterThanOrEqual(STAND_BEIM_UMBAU);
  });

  it("jede Begründung trägt Text, kein leeres Feld", () => {
    for (const kap of VERTRIEBSAKADEMIE_KAPITEL) {
      for (const sec of kap.sections) {
        for (const sk of sec.skripte ?? []) {
          if (sk.warum !== undefined) {
            expect(sk.warum.trim(), `${kap.slug} / ${sec.id} / ${sk.titel}`).not.toBe("");
          }
        }
      }
    }
  });
});
