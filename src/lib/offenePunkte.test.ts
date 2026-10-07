import { describe, it, expect } from "vitest";
import { sammleOffenePunkte, zaehleOffenePunkte } from "@/lib/offenePunkte";

const JETZT = new Date(2026, 6, 27, 14, 0); // 27. Juli 2026, 14 Uhr

const meineKundenIds = new Set(["k1", "k2"]);
const teamKundenIds = new Set(["k3"]);

const followUps = [
  { id: "f1", kundeId: "k1", titel: "Rückruf", faelligAm: "2026-07-20" },   // überfällig
  { id: "f2", kundeId: "k2", titel: "Nachfassen", faelligAm: "2026-07-27" }, // heute
  { id: "f3", kundeId: "k3", titel: "Team", faelligAm: "2026-07-20" },      // Downline
  { id: "f4", kundeId: "k9", titel: "Fremd", faelligAm: "2026-07-20" },     // fremd
  { id: "f5", kundeId: "k1", titel: "Erledigt", faelligAm: "2026-07-20", status: "erledigt" },
];

const aufgaben = [
  { id: "a1", kontaktId: "k1", titel: "Unterlagen", faelligAm: "2026-07-25", zugewiesenAn: "ich" }, // überfällig
  { id: "a2", kontaktId: "k9", titel: "Zugewiesen", faelligAm: "2026-07-25", zugewiesenAn: "ich" },
  { id: "a3", kontaktId: "k3", titel: "Team-Aufgabe", faelligAm: "2026-07-25", zugewiesenAn: "andere" },
  { id: "a4", kontaktId: "k1", titel: "Fertig", faelligAm: "2026-07-25", status: "erledigt" },
];

describe("sammleOffenePunkte", () => {
  it("nimmt in der eigenen Sicht nur eigene Kunden", () => {
    const p = sammleOffenePunkte({ followUps, aufgaben, meineKundenIds, teamKundenIds, sicht: "eigen", userId: "ich" });
    const fu = p.filter((x) => x.art === "follow_up").map((x) => x.titel);
    expect(fu.sort()).toEqual(["Nachfassen", "Rückruf"]);
  });

  it("zeigt mir eine zugewiesene Aufgabe auch bei fremdem Kunden", () => {
    const p = sammleOffenePunkte({ followUps, aufgaben, meineKundenIds, teamKundenIds, sicht: "eigen", userId: "ich" });
    expect(p.map((x) => x.titel)).toContain("Zugewiesen");
  });

  it("zählt in der eigenen Sicht keine Aufgabe, die einem Kollegen zugewiesen ist", () => {
    const p = sammleOffenePunkte({
      followUps: [],
      aufgaben: [{ id: "x", kontaktId: "k1", titel: "Kollege", faelligAm: "2026-07-25", zugewiesenAn: "andere" }],
      meineKundenIds,
      teamKundenIds,
      sicht: "eigen",
      userId: "ich",
    });
    expect(p).toHaveLength(0);
  });

  it("nimmt in der Teamsicht die Downline dazu", () => {
    const p = sammleOffenePunkte({ followUps, aufgaben, meineKundenIds, teamKundenIds, sicht: "team", userId: "ich" });
    expect(p.map((x) => x.titel)).toContain("Team");
    expect(p.map((x) => x.titel)).toContain("Team-Aufgabe");
    expect(p.map((x) => x.titel)).not.toContain("Fremd");
  });

  it("nimmt in der Firmensicht alles", () => {
    const p = sammleOffenePunkte({ followUps, aufgaben, meineKundenIds, teamKundenIds, sicht: "firma", userId: "ich" });
    expect(p.map((x) => x.titel)).toContain("Fremd");
  });

  it("lässt Erledigtes weg", () => {
    const p = sammleOffenePunkte({
      followUps,
      aufgaben,
      meineKundenIds,
      teamKundenIds,
      sicht: "firma",
      userId: "ich",
    });
    const titel = p.map((x) => x.titel);
    expect(titel).not.toContain("Erledigt");
    expect(titel).not.toContain("Fertig");
  });

  it("zählt einen Eintrag ohne Datum trotzdem als offen", () => {
    // Die Inbox listet ihn auch. Ihn hier wegzulassen war genau der Grund,
    // warum das Dashboard vier statt sieben Follow-Ups zeigte.
    const p = sammleOffenePunkte({
      followUps: [{ id: "f6", kundeId: "k1", titel: "Ohne Datum" }],
      aufgaben: [],
      meineKundenIds,
      sicht: "eigen",
      userId: "ich",
    });
    expect(p).toHaveLength(1);
    expect(zaehleOffenePunkte(p, JETZT).followUpsUeberfaellig).toBe(0);
  });

  it("ordnet nach denselben Arten ein wie der Filter in der Inbox", () => {
    const p = sammleOffenePunkte({
      followUps: [],
      aufgaben: [
        { id: "1", kontaktId: "k1", typ: "anruf", titel: "Anruf", faelligAm: "2026-07-20", zugewiesenAn: "ich" },
        { id: "2", kontaktId: "k1", typ: "meeting", titel: "Meeting", faelligAm: "2026-07-20", zugewiesenAn: "ich" },
        { id: "3", kontaktId: "k1", typ: "aufgabe", titel: "Aufgabe", faelligAm: "2026-07-20", zugewiesenAn: "ich" },
        { id: "4", kontaktId: "k1", typ: "follow_up", titel: "Follow-Up", faelligAm: "2026-07-20", zugewiesenAn: "ich" },
        { id: "5", kontaktId: "k1", typ: "deadline", titel: "Deadline", faelligAm: "2026-07-20", zugewiesenAn: "ich" },
      ],
      meineKundenIds,
      sicht: "eigen",
      userId: "ich",
    });
    const z = zaehleOffenePunkte(p, JETZT);
    // Eine Aufgabe mit typ follow_up zählt als Follow-Up, genau wie im Filter
    // der Inbox. Anruf, Meeting und Deadline zählen zu keinem von beiden.
    expect(z.followUpsOffen).toBe(1);
    expect(z.aufgabenOffen).toBe(1);
    expect(z.sonstigeOffen).toBe(3);
  });

  it("zählt die alte persönliche Liste als Aufgaben mit", () => {
    const p = sammleOffenePunkte({
      followUps: [],
      aufgaben: [],
      alteAufgaben: [
        { id: "t1", kundeId: "k1", titel: "Alt", faelligAm: "2026-07-25" },
        { id: "t2", kundeId: "k1", titel: "Alt erledigt", faelligAm: "2026-07-25", erledigt: true },
      ],
      meineKundenIds,
      sicht: "eigen",
      userId: "ich",
    });
    expect(p).toHaveLength(1);
    expect(p[0].art).toBe("aufgabe");
  });
});

describe("zaehleOffenePunkte", () => {
  it("trennt Follow-Ups und Aufgaben", () => {
    const p = sammleOffenePunkte({ followUps, aufgaben, meineKundenIds, teamKundenIds, sicht: "eigen", userId: "ich" });
    const z = zaehleOffenePunkte(p, JETZT);
    // Follow-Ups: Rückruf (überfällig) und Nachfassen (heute, noch nicht überfällig)
    expect(z.followUpsOffen).toBe(2);
    expect(z.followUpsUeberfaellig).toBe(1);
    // Aufgaben: Unterlagen und Zugewiesen, beide vom 25.
    expect(z.aufgabenOffen).toBe(2);
    expect(z.aufgabenUeberfaellig).toBe(2);
  });

  it("zählt heute fällig nicht als überfällig", () => {
    const z = zaehleOffenePunkte(
      [{ id: "x", art: "aufgabe", titel: "Heute", kundeId: "k1", kundeName: "K", faelligAm: "2026-07-27" }],
      JETZT,
    );
    expect(z.aufgabenOffen).toBe(1);
    expect(z.aufgabenUeberfaellig).toBe(0);
  });
});
