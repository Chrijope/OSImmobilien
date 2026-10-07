import { describe, it, expect } from "vitest";
import { darfEingeblendetWerden } from "./benachrichtigungAnzeige";

/**
 * Der Fall, der den Fehler sichtbar gemacht hat: Christian (Inhaber) bekam
 * „Reservierung versandt: Jonas Lins" eingeblendet, obwohl die Meldung an
 * os@os-immobilien.com zugestellt war. In seiner Glocke stand sie nicht, denn
 * die Liste filtert korrekt. Nur die Einblendung tat es nicht.
 */
const christian = "uid-christian";
const philipp = "uid-philipp";

describe("darfEingeblendetWerden", () => {
  it("blendet die eigene Meldung ein", () => {
    expect(darfEingeblendetWerden({ benutzer_id: christian }, christian)).toBe(true);
  });

  it("blendet die Meldung eines Kollegen NICHT ein", () => {
    expect(darfEingeblendetWerden({ benutzer_id: philipp }, christian)).toBe(false);
  });

  /*
   * Der Inhaber darf laut Zeilensicherheit alle Zeilen lesen. Genau deshalb
   * braucht es diese Regel: Lesen duerfen heisst nicht, gestoert zu werden.
   */
  it("hilft auch dem, der alle Zeilen lesen darf", () => {
    const fremde = [{ benutzer_id: philipp }, { benutzer_id: "uid-sarah" }, { benutzer_id: null }];
    expect(fremde.every((z) => !darfEingeblendetWerden(z, christian))).toBe(true);
  });

  /*
   * Im Zweifel einblenden. Eine Meldung zu viel ist laestig, eine
   * verschluckte bemerkt niemand.
   */
  it("unterdrueckt nichts, solange die eigene Kennung fehlt", () => {
    expect(darfEingeblendetWerden({ benutzer_id: philipp }, undefined)).toBe(true);
    expect(darfEingeblendetWerden({ benutzer_id: philipp }, null)).toBe(true);
    expect(darfEingeblendetWerden({ benutzer_id: philipp }, "")).toBe(true);
  });

  it("kommt ohne Zeile zurecht", () => {
    expect(darfEingeblendetWerden(null, christian)).toBe(false);
    expect(darfEingeblendetWerden(undefined, christian)).toBe(false);
    expect(darfEingeblendetWerden({}, christian)).toBe(false);
  });
});
