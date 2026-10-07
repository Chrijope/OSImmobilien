import { describe, it, expect } from "vitest";
import { alsDatumsString, heuteAlsString, istUeberfaellig, istVomVortag } from "@/lib/faelligkeit";
import { isTaskOverdue, toDateString } from "@/lib/inboxCountStore";

const JETZT = new Date(2026, 6, 27, 14, 0); // 27. Juli 2026, 14 Uhr

describe("alsDatumsString", () => {
  it("liest ISO, Zeitstempel und deutsches Datum", () => {
    expect(alsDatumsString("2026-07-27")).toBe("2026-07-27");
    expect(alsDatumsString("2026-07-27T09:30:00Z")).toBe("2026-07-27");
    expect(alsDatumsString("27.07.2026")).toBe("2026-07-27");
    expect(alsDatumsString("7.7.2026")).toBe("2026-07-07");
  });

  it("gibt bei Unlesbarem einen leeren String", () => {
    expect(alsDatumsString("")).toBe("");
    expect(alsDatumsString(undefined)).toBe("");
    expect(alsDatumsString("demnächst")).toBe("");
  });
});

describe("heuteAlsString", () => {
  it("nimmt die lokale Zeitzone, nicht UTC", () => {
    // Kurz vor Mitternacht darf nicht schon der Folgetag herauskommen.
    expect(heuteAlsString(new Date(2026, 6, 27, 23, 30))).toBe("2026-07-27");
  });
});

describe("istUeberfaellig", () => {
  it("zählt gestern als überfällig", () => {
    expect(istUeberfaellig("2026-07-26", undefined, JETZT)).toBe(true);
  });

  it("zählt morgen nicht", () => {
    expect(istUeberfaellig("2026-07-28", undefined, JETZT)).toBe(false);
  });

  it("gibt heute ohne Uhrzeit den ganzen Tag Zeit", () => {
    expect(istUeberfaellig("2026-07-27", undefined, JETZT)).toBe(false);
  });

  it("entscheidet heute nach der Uhrzeit", () => {
    expect(istUeberfaellig("2026-07-27", "10:00", JETZT)).toBe(true);
    expect(istUeberfaellig("2026-07-27", "16:00", JETZT)).toBe(false);
  });

  it("ignoriert die Uhrzeit im Zeitstempel", () => {
    // Nur das eigene Uhrzeitfeld zählt. Sonst wäre ein Eintrag, der als
    // Zeitstempel gespeichert ist, anders bewertet als derselbe Eintrag als
    // reines Datum.
    expect(istUeberfaellig("2026-07-27T09:00:00", undefined, JETZT)).toBe(false);
  });

  it("kommt ohne Datum zurecht", () => {
    expect(istUeberfaellig(undefined, undefined, JETZT)).toBe(false);
    expect(istUeberfaellig("", "10:00", JETZT)).toBe(false);
  });
});

describe("istVomVortag", () => {
  it("erkennt gestern und früher", () => {
    expect(istVomVortag("2026-07-26", JETZT)).toBe(true);
    expect(istVomVortag("2026-01-01", JETZT)).toBe(true);
    expect(istVomVortag("2026-07-27", JETZT)).toBe(false);
  });
});

describe("Inbox und Dashboard rechnen dasselbe", () => {
  it("die Inbox benutzt genau diese Funktionen", () => {
    // Der eigentliche Punkt: Es gibt nur noch eine Implementierung. Liefe hier
    // etwas auseinander, stünden auf Dashboard und Inbox wieder zwei Zahlen.
    expect(isTaskOverdue).toBe(istUeberfaellig);
    expect(toDateString).toBe(alsDatumsString);
  });
});
