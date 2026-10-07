/**
 * Widerrufsfrist der Reservierung: wirksam ab 00:00 Uhr deutscher Zeit am
 * 15. Tag nach der letzten Unterschrift. Die Logik liegt in
 * `supabase/functions/_shared/widerrufsfrist.ts`, weil sie in Deno laeuft.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  reservierungWirksamAb,
  widerrufsfristAbgelaufen,
} from "../../supabase/functions/_shared/widerrufsfrist";

describe("reservierungWirksamAb", () => {
  it("Sommerzeit: Unterschrift am 01.08. ergibt 16.08. 00:00 Uhr (22:00 UTC am Vortag)", () => {
    expect(reservierungWirksamAb("2026-08-01T10:00:00.000Z")).toBe("2026-08-15T22:00:00.000Z");
  });

  it("Winterzeit: Unterschrift am 10.01. ergibt 25.01. 00:00 Uhr (23:00 UTC am Vortag)", () => {
    expect(reservierungWirksamAb("2026-01-10T15:30:00.000Z")).toBe("2026-01-24T23:00:00.000Z");
  });

  it("der Unterschriftstag zaehlt nach deutscher Zeit, nicht nach UTC", () => {
    // 23:30 UTC am 01.08. ist in Berlin schon der 02.08.
    expect(reservierungWirksamAb("2026-08-01T23:30:00.000Z")).toBe("2026-08-16T22:00:00.000Z");
    // 00:10 Uhr Berliner Zeit am 02.08. ebenso
    expect(reservierungWirksamAb("2026-08-01T22:10:00.000Z")).toBe("2026-08-16T22:00:00.000Z");
    // 23:59 Uhr Berliner Zeit am 01.08. gehoert noch zum 01.08.
    expect(reservierungWirksamAb("2026-08-01T21:59:00.000Z")).toBe("2026-08-15T22:00:00.000Z");
  });

  it("Umstellung auf Winterzeit innerhalb der Frist (25.10.2026)", () => {
    // Unterschrift 20.10. (Sommerzeit), wirksam 04.11. 00:00 Uhr Winterzeit.
    expect(reservierungWirksamAb("2026-10-20T08:00:00.000Z")).toBe("2026-11-03T23:00:00.000Z");
  });

  it("Umstellung auf Sommerzeit innerhalb der Frist (29.03.2026)", () => {
    // Unterschrift 20.03. (Winterzeit), wirksam 04.04. 00:00 Uhr Sommerzeit.
    expect(reservierungWirksamAb("2026-03-20T08:00:00.000Z")).toBe("2026-04-03T22:00:00.000Z");
  });

  it("Wirksamkeit genau am Umstellungstag", () => {
    // 10.10. plus 15 Tage = 25.10., Mitternacht noch Sommerzeit
    expect(reservierungWirksamAb("2026-10-10T12:00:00.000Z")).toBe("2026-10-24T22:00:00.000Z");
    // 14.03. plus 15 Tage = 29.03., Mitternacht noch Winterzeit
    expect(reservierungWirksamAb("2026-03-14T12:00:00.000Z")).toBe("2026-03-28T23:00:00.000Z");
  });

  it("Monats- und Jahreswechsel", () => {
    expect(reservierungWirksamAb("2026-12-20T12:00:00.000Z")).toBe("2027-01-03T23:00:00.000Z");
  });

  it("unlesbare Unterschriftszeit ergibt null", () => {
    expect(reservierungWirksamAb("kaputt")).toBeNull();
  });
});

describe("widerrufsfristAbgelaufen", () => {
  const ab = "2026-08-15T22:00:00.000Z";
  it("vor Mitternacht nicht, ab Mitternacht ja", () => {
    expect(widerrufsfristAbgelaufen(ab, new Date("2026-08-15T21:59:59.000Z"))).toBe(false);
    expect(widerrufsfristAbgelaufen(ab, new Date("2026-08-15T22:00:00.000Z"))).toBe(true);
  });
  it("leer oder unlesbar gilt nie als abgelaufen", () => {
    expect(widerrufsfristAbgelaufen(null)).toBe(false);
    expect(widerrufsfristAbgelaufen("x")).toBe(false);
  });
});

describe("beide Functions nutzen den Helfer", () => {
  const lies = (f: string) => readFileSync(resolve(__dirname, "../../supabase/functions", f, "index.ts"), "utf8");
  it("finalize-reservierung rechnet nicht mehr mit 14 mal 24 Stunden", () => {
    const s = lies("finalize-reservierung");
    expect(s).toContain("reservierungWirksamAb(signedAt)");
    expect(s).not.toMatch(/WIDERRUFSFRIST_TAGE \* 86_400_000/);
  });
  it("send-reservierung-eskalation prueft den echten Zeitpunkt", () => {
    expect(lies("send-reservierung-eskalation")).toContain("widerrufsfristAbgelaufen(meta.rvReservierungAb)");
  });
});
