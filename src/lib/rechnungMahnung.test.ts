import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mahnhinweise an HR für überfällige Rechnungen.
 *
 * Seit dem 23.09.2026 heißen sie „Lead-Paket-Rechnung": Eine Onboardinggebühr
 * erhebt der heutige Vertrag nicht mehr, in die Stufe „Rechnung" kommt nur
 * noch, wer ein Lead-Paket im Vertrag hat. Store und Glocke sind Attrappen.
 */

const { bewerberListe, notifyByRoleMock, updateBewerberMock } = vi.hoisted(() => ({
  bewerberListe: [] as Array<Record<string, unknown>>,
  notifyByRoleMock: vi.fn(),
  updateBewerberMock: vi.fn(),
}));

vi.mock("./bewerbungStore", () => ({
  getBewerber: () => bewerberListe,
  updateBewerber: updateBewerberMock,
}));
vi.mock("./bellNotifications", () => ({ notifyByRole: notifyByRoleMock }));

import { MAHNUNG_TEXTE, pruefeMahnErinnerungen } from "./rechnungMahnung";

const TAG = 1000 * 60 * 60 * 24;

beforeEach(() => {
  bewerberListe.length = 0;
  notifyByRoleMock.mockClear();
  updateBewerberMock.mockClear();
});

describe("Mahnhinweise: Lead-Paket-Rechnung statt Onboardinggebühr", () => {
  const alleTexte = [
    MAHNUNG_TEXTE.stufe14.titel,
    MAHNUNG_TEXTE.stufe14.nachricht("RE-1", "Max Muster"),
    MAHNUNG_TEXTE.stufe21.titel,
    MAHNUNG_TEXTE.stufe21.nachricht("RE-1", "Max Muster"),
  ].join(" ");

  it("nennen die Lead-Paket-Rechnung", () => {
    expect(MAHNUNG_TEXTE.stufe14.titel).toBe("Lead-Paket-Rechnung 14 Tage überfällig");
    expect(MAHNUNG_TEXTE.stufe21.titel).toBe("2. Mahnung erforderlich, Lead-Paket-Rechnung");
    expect(MAHNUNG_TEXTE.stufe14.nachricht("RE-1", "Max Muster")).toContain("über das Lead-Paket an Max Muster");
  });

  it("sagen an keiner Stelle Onboarding und haben keine Gedankenstriche", () => {
    expect(alleTexte).not.toMatch(/onboarding/i);
    expect(alleTexte).not.toMatch(/[–—]/);
  });

  it("gehen mit diesen Texten an HR hinaus, eine Glocke je Schwelle", () => {
    bewerberListe.push({
      id: "b1",
      vorname: "Max",
      nachname: "Muster",
      rechnungNr: "RE-1",
      rechnungErstelltAm: new Date(Date.now() - 40 * TAG).toISOString(),
      rechnungBezahltAm: "",
    });

    pruefeMahnErinnerungen();

    expect(notifyByRoleMock).toHaveBeenCalledTimes(2);
    const titel = notifyByRoleMock.mock.calls.map(([rollen, params]) => {
      expect(rollen).toEqual(["hr"]);
      return (params as { titel: string }).titel;
    });
    expect(titel).toEqual([MAHNUNG_TEXTE.stufe14.titel, MAHNUNG_TEXTE.stufe21.titel]);
  });

  it("schweigen bei bezahlter Rechnung", () => {
    bewerberListe.push({
      id: "b2",
      vorname: "Max",
      nachname: "Muster",
      rechnungNr: "RE-2",
      rechnungErstelltAm: new Date(Date.now() - 40 * TAG).toISOString(),
      rechnungBezahltAm: new Date().toISOString(),
    });
    pruefeMahnErinnerungen();
    expect(notifyByRoleMock).not.toHaveBeenCalled();
  });
});
