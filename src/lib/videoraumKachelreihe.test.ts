import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ladeKachelreihe, merkeKachelreihe } from "@/lib/videoraumKachelreihe";

/**
 * Die gemerkte Wahl des Gastes: Kachelreihe ein- oder ausgeklappt.
 *
 * Zwei Dinge sind daran wichtig. Erstens die Vorgabe: Wer nichts gewaehlt hat,
 * bekommt die Reihe zu sehen. Eine versteckte Kachel ohne Zutun waere eine
 * Ueberraschung. Zweitens der private Modus: Dort wirft schon das Lesen, und
 * daran darf ein Videogespraech nicht scheitern.
 */

describe("ladeKachelreihe und merkeKachelreihe", () => {
  beforeEach(() => { sessionStorage.clear(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("ist ohne gemerkte Wahl ausgeklappt", () => {
    expect(ladeKachelreihe()).toBe(true);
  });

  it("merkt sich das Einklappen und gibt es wieder heraus", () => {
    merkeKachelreihe(false);
    expect(ladeKachelreihe()).toBe(false);
  });

  it("nimmt das Einklappen wieder zurueck", () => {
    merkeKachelreihe(false);
    merkeKachelreihe(true);
    expect(ladeKachelreihe()).toBe(true);
    // Ausgeklappt ist die Vorgabe, dafuer braucht es keinen Eintrag.
    expect(sessionStorage.getItem("videoraum-kachelreihe")).toBeNull();
  });

  it("bleibt ausgeklappt, wenn der Speicher beim Lesen wirft", () => {
    // Ein privates Fenster oder gesperrte Seitendaten. Die Ansicht muss
    // trotzdem stehen.
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("gesperrt");
    });
    expect(ladeKachelreihe()).toBe(true);
  });

  it("wirft nicht, wenn der Speicher beim Schreiben wirft", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("voll");
    });
    expect(() => merkeKachelreihe(false)).not.toThrow();
  });
});
