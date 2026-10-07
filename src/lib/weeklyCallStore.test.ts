import { describe, it, expect } from "vitest";
import { aktuellerCallTermin, formatCallTermin } from "./weeklyCallStore";

/**
 * Der Stichtag entscheidet, zu welchem Call ein Punkt zaehlt. Die Regel steht
 * an drei Stellen: hier, in weekly_call_woche() in der Datenbank und in
 * naechsterWeeklyCall() in der Karte. Laufen sie auseinander, landet ein Punkt
 * in der falschen Woche und taucht im Call nicht auf.
 *
 * Der Call ist montags um 19:00 fuer alle,
 * der Schnitt liegt um 20:30 Uhr.
 */
describe("Der Call, zu dem ein Punkt zaehlt", () => {
  it("zeigt am Montagvormittag auf den heutigen Call", () => {
    // Montag, 24.08.2026
    expect(aktuellerCallTermin(new Date(2026, 7, 24, 9, 0))).toBe("2026-08-24");
  });

  it("haelt den heutigen Call, solange der Call laeuft", () => {
    // Der Call laeuft. Wer waehrenddessen etwas eintraegt, meint diesen Call.
    expect(aktuellerCallTermin(new Date(2026, 7, 24, 19, 30))).toBe("2026-08-24");
    // Auch das Ende der Vertriebspartner-Runde (bis 20:30) zaehlt noch dazu.
    expect(aktuellerCallTermin(new Date(2026, 7, 24, 20, 15))).toBe("2026-08-24");
  });

  it("springt nach dem Schnitt (20:30) auf die kommende Woche", () => {
    expect(aktuellerCallTermin(new Date(2026, 7, 24, 20, 45))).toBe("2026-08-31");
  });

  it("zeigt am Dienstag auf die kommende Woche", () => {
    expect(aktuellerCallTermin(new Date(2026, 7, 25, 8, 0))).toBe("2026-08-31");
  });

  it("zeigt am Mittwoch auf die kommende Woche", () => {
    expect(aktuellerCallTermin(new Date(2026, 7, 26, 8, 0))).toBe("2026-08-31");
  });

  it("zeigt am Sonntag auf den Montag darauf", () => {
    expect(aktuellerCallTermin(new Date(2026, 7, 30, 20, 0))).toBe("2026-08-31");
  });

  it("schreibt den Termin deutsch", () => {
    expect(formatCallTermin("2026-08-25")).toBe("25.08.2026");
  });
});
