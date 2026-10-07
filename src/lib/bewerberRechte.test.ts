import { describe, it, expect, vi } from "vitest";
import { istBewerberMeldung, kannBewerberVerwalten, siehtBewerberMeldungen } from "./bewerberRechte";

/**
 * Die Regel in einem Satz: Das Bewerbermanagement meldet sich nur bei HR.
 *
 * Anlass war die Inbox der Geschäftsführung. Dort standen Bewerbernamen, weil
 * die Einträge an der Admin-Rolle hingen und der Geschäftsführer Admin ist.
 */
describe("siehtBewerberMeldungen", () => {
  it("gilt für HR", () => {
    expect(siehtBewerberMeldungen("hr")).toBe(true);
    // Schreibweise und Leerzeichen sollen die Regel nicht kippen.
    expect(siehtBewerberMeldungen(" HR ")).toBe(true);
  });

  it("gilt für niemanden sonst, auch nicht für Admin und Inhaber", () => {
    const andere = [
      "admin",
      "inhaber",
      "vertriebsleiter",
      "vertriebspartner",
      "backoffice",
      "buchhaltung",
      "marketing",
      "setterin",
      "individuell",
      "testaccount",
      "bewerber",
      "kunde",
    ];
    for (const rolle of andere) {
      expect(siehtBewerberMeldungen(rolle), rolle).toBe(false);
    }
    expect(siehtBewerberMeldungen(undefined)).toBe(false);
    expect(siehtBewerberMeldungen("")).toBe(false);
  });

  it("nimmt niemandem das Bearbeiten weg", () => {
    // Sehen und Bearbeiten sind zwei Fragen. Wer die Akte öffnen und ändern
    // darf, bleibt unverändert, nur die Meldungen werden enger.
    expect(kannBewerberVerwalten("admin")).toBe(true);
    expect(kannBewerberVerwalten("inhaber")).toBe(true);
    expect(kannBewerberVerwalten("hr")).toBe(true);
  });
});

describe("istBewerberMeldung", () => {
  it("erkennt die beiden internen Bereiche", () => {
    expect(istBewerberMeldung("/bewerberprozess?openBewerber=1")).toBe(true);
    expect(istBewerberMeldung("/bewerberprozess?bewerber=1")).toBe(true);
  });

  it("lässt alles andere in Ruhe", () => {
    expect(istBewerberMeldung("/kunden/abc")).toBe(false);
    expect(istBewerberMeldung("/inbox")).toBe(false);
    expect(istBewerberMeldung("")).toBe(false);
    expect(istBewerberMeldung(undefined)).toBe(false);
  });
});

/**
 * Der Zähler auf dem Dashboard muss dieselbe Regel benutzen wie die Liste in
 * der Inbox. Eine Zahl ohne passende Liste ist schlimmer als keine Zahl.
 */
vi.mock("./aktivitaetenStore", () => ({ getInboxTasks: () => [] }));
vi.mock("./aufgabenStore", () => ({ getMeineAufgaben: () => [] }));
vi.mock("./followUpStore", () => ({ getFollowUps: () => [] }));
vi.mock("./kundenStore", () => ({ getKontakte: () => [] }));
vi.mock("./inboxCountStore", () => ({
  getDoneInboxIds: () => [],
  isTaskOverdue: () => false,
}));
vi.mock("./bewerbungStore", () => ({
  getBewerber: () => [
    {
      id: "b1",
      vorname: "Peter",
      nachname: "Wolf",
      status: "Erstgespraech",
      followUpDatum: "01.09.2026",
      followUpUhrzeit: "10:00",
      followUpNotiz: "Rückruf",
    },
    {
      id: "b2",
      vorname: "Arthur",
      nachname: "Weigel",
      status: "Closing",
      closingEntscheidung: "bedenkzeit",
      bedenkzeitRueckrufAm: "05.09.2026",
    },
  ],
}));

const { zaehleEigeneInboxKacheln } = await import("./inboxKpiCounts");

describe("Bewerber-Follow-Ups in den Dashboard-Kacheln", () => {
  it("zählt sie für HR", () => {
    const zahlen = zaehleEigeneInboxKacheln({ userName: "Sarah Kaiser-Thom", role: "hr" });
    // Zwei Bewerber, zwei Erinnerungen: ein Follow-Up und ein Rückruf aus der
    // Bedenkzeit.
    expect(zahlen.followUpsOffen).toBe(2);
  });

  it("zählt sie für Admin und Inhaber nicht mehr", () => {
    expect(zaehleEigeneInboxKacheln({ userName: "Christian Peetz", role: "admin" }).followUpsOffen).toBe(0);
    expect(zaehleEigeneInboxKacheln({ userName: "Christian Peetz", role: "inhaber" }).followUpsOffen).toBe(0);
    expect(zaehleEigeneInboxKacheln({ userName: "Ein Partner", role: "vertriebspartner" }).followUpsOffen).toBe(0);
  });
});
