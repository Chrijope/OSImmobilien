import { describe, it, expect } from "vitest";
import { unterschriftsstand } from "@/lib/vertragUnterschrift";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Ein Vertrag hat zwei Unterschriften, und seit dem 19.09.2026 liegen beide
 * Zustände nebeneinander in der Stufe Vertrag: Wer kein Lead-Paket gewählt
 * hat, bleibt auch nach der Gegenzeichnung hier liegen, bis der
 * Onboarding-Termin steht.
 *
 * Die Liste muss die beiden auseinanderhalten. "Seit dem 14.09.
 * unterschrieben" heißt einmal "erledigt" und einmal "wir warten seit fünf
 * Tagen auf eine Unterschrift im eigenen Haus".
 */

/** Nur die Felder, die der Helfer liest. */
const bewerber = (teile: Partial<Bewerber>) => teile as Bewerber;

describe("unterschriftsstand", () => {
  it("meldet nichts, solange niemand unterschrieben hat", () => {
    expect(unterschriftsstand(bewerber({ vertragStatus: "gesendet" }))).toBeNull();
    expect(unterschriftsstand(bewerber({}))).toBeNull();
  });

  it("nennt das Datum, sobald beide unterschrieben haben", () => {
    const stand = unterschriftsstand(bewerber({
      vertragSignedAt: "2026-09-14T10:30:00.000Z",
      vertragStatus: "unterschrieben",
    }));
    expect(stand).toEqual({ datum: "14.09.2026", wartetAufKurz: false });
  });

  it("sagt ausdrücklich, wenn die Gegenzeichnung noch fehlt", () => {
    const stand = unterschriftsstand(bewerber({
      vertragBewerberSignedAt: "2026-09-14T10:30:00.000Z",
      vertragStatus: "wartet_auf_kurz",
    }));
    expect(stand).toEqual({ datum: "14.09.2026", wartetAufKurz: true });
  });

  it("gibt der Gegenzeichnung den Vorrang", () => {
    // Beide Daten stehen. Der Vertrag ist fertig, und das ist die Aussage,
    // die zählt.
    const stand = unterschriftsstand(bewerber({
      vertragBewerberSignedAt: "2026-09-14T10:30:00.000Z",
      vertragSignedAt: "2026-09-16T08:00:00.000Z",
      vertragStatus: "unterschrieben",
    }));
    expect(stand).toEqual({ datum: "16.09.2026", wartetAufKurz: false });
  });

  it("hilft sich beim Altbestand ohne Datum", () => {
    // Ältere Vorgänge tragen den Vertragsstand, aber kein Datum. "Unterschrieben,
    // Datum unbekannt" ist immer noch nützlicher als ein Strich.
    const stand = unterschriftsstand(bewerber({ vertragStatus: "wartet_auf_kurz" }));
    expect(stand).toEqual({ datum: "", wartetAufKurz: true });
  });

  it("verschluckt sich nicht an einem unlesbaren Datum", () => {
    const stand = unterschriftsstand(bewerber({
      vertragBewerberSignedAt: "keinDatum",
      vertragStatus: "wartet_auf_kurz",
    }));
    expect(stand).toEqual({ datum: "", wartetAufKurz: true });
  });
});
