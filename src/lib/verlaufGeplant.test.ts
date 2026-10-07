import { describe, expect, it } from "vitest";
import { geplanteZuerst, istGeplant } from "./verlaufGeplant";

const jetzt = new Date("2026-10-01T12:00:00").getTime();

describe("geplanteZuerst", () => {
  it("fixiert offene künftige Aufgaben und Meetings oben, den nächsten zuerst", () => {
    const liste = [
      { id: "protokoll", art: "anruf_protokoll", datum: "2026-10-01" },
      { id: "spaet", art: "aufgabe", faelligAm: "2026-11-23", uhrzeit: "10:00" },
      { id: "vorbei", art: "aufgabe", faelligAm: "2026-10-01", uhrzeit: "11:00" },
      { id: "frueh", art: "meeting", faelligAm: "2026-10-05", uhrzeit: "09:00" },
      { id: "erledigt", art: "aufgabe", faelligAm: "2026-12-01", erledigtAm: "2026-09-30" },
    ] as never[];
    expect(geplanteZuerst(liste, jetzt).map((a: { id: string }) => a.id))
      .toEqual(["frueh", "spaet", "protokoll", "vorbei", "erledigt"]);
  });

  it("gibt den Eintrag frei, sobald Tag und Uhrzeit erreicht sind", () => {
    const a = { art: "aufgabe", faelligAm: "2026-11-23", uhrzeit: "10:00" } as never;
    expect(istGeplant(a, new Date("2026-11-23T09:59:00").getTime())).toBe(true);
    expect(istGeplant(a, new Date("2026-11-23T10:00:00").getTime())).toBe(false);
  });
});
