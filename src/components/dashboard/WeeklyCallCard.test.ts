import { describe, it, expect } from "vitest";
import { aktuellerWeeklyCall, naechsterWeeklyCall, weeklyCallIcs } from "@/components/dashboard/WeeklyCallCard";
import { CALL_WOCHENTAG } from "@/lib/weeklyCallZeit";

/** Hilfsformat für lesbare Fehlermeldungen. */
const lesbar = (d: Date) =>
  d.toLocaleString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/**
 * Montags 19:00 Lead-Berater (Standard ohne Angabe), 19:30 Vertriebspartner.
 * Der Wochenschnitt liegt fuer beide um 20:30 Uhr.
 */
describe("Weekly Sales Call", () => {
  it("nennt heute den heutigen Termin, wenn heute Montag vormittags ist", () => {
    // Montag, 27. Juli 2026, 9 Uhr
    const termin = naechsterWeeklyCall(new Date(2026, 6, 27, 9, 0));
    expect(lesbar(termin)).toBe("Mo., 27.07.2026, 19:00");
  });

  it("bleibt waehrend des Calls beim heutigen Termin", () => {
    const termin = naechsterWeeklyCall(new Date(2026, 6, 27, 19, 45));
    expect(termin.getDate()).toBe(27);
  });

  it("bleibt bis zum Schnitt um 20:30 beim heutigen Termin", () => {
    // 20:15: der Call darf ueberziehen, die Woche gilt noch.
    const termin = naechsterWeeklyCall(new Date(2026, 6, 27, 20, 15));
    expect(termin.getDate()).toBe(27);
  });

  it("springt nach dem Schnitt auf die kommende Woche", () => {
    const termin = naechsterWeeklyCall(new Date(2026, 6, 27, 20, 45));
    expect(lesbar(termin)).toBe("Mo., 03.08.2026, 19:00");
  });

  it("nennt am Mittwoch den kommenden Montag", () => {
    const termin = naechsterWeeklyCall(new Date(2026, 6, 29, 10, 0));
    expect(lesbar(termin)).toBe("Mo., 03.08.2026, 19:00");
  });

  it("nennt am Sonntag den naechsten Tag", () => {
    const termin = naechsterWeeklyCall(new Date(2026, 6, 26, 18, 0));
    expect(lesbar(termin)).toBe("Mo., 27.07.2026, 19:00");
  });

  it("liegt immer auf einem Montag um 19:00", () => {
    // Über ein ganzes Jahr geprüft, damit weder Monatswechsel noch
    // Jahreswechsel etwas verschieben.
    for (let tag = 0; tag < 365; tag++) {
      const jetzt = new Date(2026, 0, 1 + tag, 8, 0);
      const termin = naechsterWeeklyCall(jetzt);
      expect(termin.getDay(), lesbar(jetzt)).toBe(CALL_WOCHENTAG);
      expect(termin.getHours()).toBe(19);
      expect(termin.getMinutes()).toBe(0);
      expect(termin.getTime()).toBeGreaterThan(jetzt.getTime());
    }
  });
});

describe("Zwei Calls am Montag", () => {
  it("nennt Vertriebspartnern 19:30", () => {
    const termin = naechsterWeeklyCall(new Date(2026, 6, 27, 9, 0), "vertriebspartner");
    expect(lesbar(termin)).toBe("Mo., 27.07.2026, 19:30");
  });

  it("springt auch fuer den 19:30-Call erst nach dem Schnitt um 20:30", () => {
    expect(naechsterWeeklyCall(new Date(2026, 6, 27, 20, 15), "vertriebspartner").getDate()).toBe(27);
    expect(lesbar(naechsterWeeklyCall(new Date(2026, 6, 27, 20, 45), "vertriebspartner"))).toBe("Mo., 03.08.2026, 19:30");
  });

  it("gibt Rollen ohne Call keinen Termin", () => {
    expect(aktuellerWeeklyCall([], new Date(2026, 6, 27, 9, 0))).toBeNull();
  });

  it("fuehrt die Leitung bis 20:00 zum 19:00-Call, danach zum 19:30-Call", () => {
    const beide = ["lead_berater", "vertriebspartner"] as const;
    expect(aktuellerWeeklyCall([...beide], new Date(2026, 6, 27, 18, 0))?.runde).toBe("lead_berater");
    expect(aktuellerWeeklyCall([...beide], new Date(2026, 6, 27, 19, 45))?.runde).toBe("lead_berater");
    expect(aktuellerWeeklyCall([...beide], new Date(2026, 6, 27, 20, 5))?.runde).toBe("vertriebspartner");
    expect(aktuellerWeeklyCall([...beide], new Date(2026, 6, 27, 20, 40))?.start.getDate()).toBe(3);
  });

  it("zeigt Lead-Beratern und Vertriebspartnern nur ihren Call", () => {
    const jetzt = new Date(2026, 6, 27, 18, 0);
    expect(aktuellerWeeklyCall(["lead_berater"], jetzt)?.start.getMinutes()).toBe(0);
    expect(aktuellerWeeklyCall(["vertriebspartner"], jetzt)?.start.getMinutes()).toBe(30);
  });
});

describe("Kalenderdatei", () => {
  it("steht in deutscher Ortszeit mit Zeitzone, damit die Serie die Zeitumstellung uebersteht", () => {
    // Freitag vor der Umstellung auf Winterzeit (25.10.2026).
    const ics = weeklyCallIcs(["lead_berater", "vertriebspartner"], new Date(2026, 9, 23, 10, 0));
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20261026T190000");
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20261026T200000");
    expect(ics).toContain("DTSTART;TZID=Europe/Berlin:20261026T193000");
    expect(ics).toContain("DTEND;TZID=Europe/Berlin:20261026T203000");
    expect(ics).not.toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it("legt fuer Vertriebspartner nur den 19:30-Call an", () => {
    const ics = weeklyCallIcs(["vertriebspartner"], new Date(2026, 9, 23, 10, 0));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain("SUMMARY:Weekly Sales Call Vertriebspartner");
  });
});
