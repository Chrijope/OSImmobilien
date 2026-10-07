import { describe, it, expect } from "vitest";
import {
  alleAktivPflichtenErfuellt,
  AKTIV_PFLICHT_SCHRITTE,
  ONBOARDING_ZUSATZ_SCHRITTE,
  AKTIVIERUNG_ONBOARDING_SCHRITTE,
} from "./aktivierungOnboardingSchritte";
import { closingRuecksprungStatus } from "./bewerbungStore";

describe("alleAktivPflichtenErfuellt (Aktiv-Automatik)", () => {
  it("liefert true, wenn alle drei Pflicht-Haken gesetzt sind", () => {
    expect(
      alleAktivPflichtenErfuellt({
        email_postfach: true,
        nutzer_anlegen: true,
        investagon: true,
      }),
    ).toBe(true);
  });

  it("liefert false bei nur zwei von drei Haken", () => {
    expect(
      alleAktivPflichtenErfuellt({
        email_postfach: true,
        nutzer_anlegen: true,
        investagon: false,
      }),
    ).toBe(false);
    expect(
      alleAktivPflichtenErfuellt({
        email_postfach: false,
        nutzer_anlegen: true,
        investagon: true,
      }),
    ).toBe(false);
  });

  it("liefert false, wenn gar nichts gesetzt ist", () => {
    expect(alleAktivPflichtenErfuellt({})).toBe(false);
  });

  it("Zusatz-Schritte spielen für die Pflicht keine Rolle", () => {
    expect(
      alleAktivPflichtenErfuellt({
        email_postfach: true,
        nutzer_anlegen: true,
        investagon: true,
        landingpage: false,
        whatsapp: false,
      }),
    ).toBe(true);
  });

  it("Pflicht- und Zusatzliste decken gemeinsam alle Schritte ab", () => {
    const alle = new Set([...AKTIV_PFLICHT_SCHRITTE, ...ONBOARDING_ZUSATZ_SCHRITTE]);
    expect(alle.size).toBe(AKTIVIERUNG_ONBOARDING_SCHRITTE.length);
    AKTIVIERUNG_ONBOARDING_SCHRITTE.forEach((s) => expect(alle.has(s.id)).toBe(true));
  });
});

describe("closingRuecksprungStatus (FollowUp-Sackgasse)", () => {
  const followUp = {
    status: "FollowUp" as const,
    closingTerminDatum: "01.08.2026",
    closingTerminUhrzeit: "10:00",
  };

  it("springt bei einem neuen Closing-Termin zurück auf Closing", () => {
    expect(
      closingRuecksprungStatus(followUp, {
        closingTerminDatum: "25.08.2026",
        closingTerminUhrzeit: "14:00",
      }),
    ).toBe("Closing");
  });

  it("springt auch bei geänderter Uhrzeit am selben Tag zurück", () => {
    expect(
      closingRuecksprungStatus(followUp, {
        closingTerminDatum: "01.08.2026",
        closingTerminUhrzeit: "16:30",
      }),
    ).toBe("Closing");
  });

  it("bleibt ruhig, wenn derselbe Termin nur erneut gespeichert wird (Autosave)", () => {
    expect(
      closingRuecksprungStatus(followUp, {
        closingTerminDatum: "01.08.2026",
        closingTerminUhrzeit: "10:00",
      }),
    ).toBeNull();
  });

  it("greift nur im Status FollowUp", () => {
    expect(
      closingRuecksprungStatus(
        { ...followUp, status: "Erstgespraech" as const },
        { closingTerminDatum: "25.08.2026", closingTerminUhrzeit: "14:00" },
      ),
    ).toBeNull();
  });

  it("greift nicht ohne vollständigen Termin", () => {
    expect(closingRuecksprungStatus(followUp, { closingTerminDatum: "25.08.2026" })).toBeNull();
    expect(closingRuecksprungStatus(followUp, { closingTerminUhrzeit: "14:00" })).toBeNull();
    expect(
      closingRuecksprungStatus(followUp, { closingTerminDatum: "", closingTerminUhrzeit: "" }),
    ).toBeNull();
  });

  it("überstimmt keinen ausdrücklich mitgegebenen Status", () => {
    expect(
      closingRuecksprungStatus(followUp, {
        status: "Abgelehnt",
        closingTerminDatum: "25.08.2026",
        closingTerminUhrzeit: "14:00",
      }),
    ).toBeNull();
  });
});
