import { describe, it, expect } from "vitest";
// Der Wortlaut liegt bei der Edge Function, weil er dort gebraucht wird.
// Getestet wird er hier, weil Vitest nur unterhalb von src sucht, so wie bei
// bewerber-zugangsdaten und berater-namensabgleich.
import {
  BEWERBER_ANZAHL_FRAGEN,
  BEWERBER_BUCHUNGSLINK,
  BEWERBER_EINGANG_DANKE,
  BEWERBER_EINGANG_TERMIN,
  bewerberFragebogenHinweis,
} from "../../supabase/functions/_shared/bewerber-eingangsmail.ts";
import { FORMULAR_FRAGEN } from "./bewerberFormular";

describe("Bewerber-Eingangsmail", () => {
  it("verspricht so viele Fragen, wie der Katalog jedem Bewerber zeigt", () => {
    // Bis 02.09.2026 stand in der Mail "10 Fragen", der Katalog hatte 13.
    const ohneZusatzfragen = FORMULAR_FRAGEN.filter((f) => !f.nurWenn).length;
    expect(BEWERBER_ANZAHL_FRAGEN).toBe(ohneZusatzfragen);
    expect(BEWERBER_ANZAHL_FRAGEN).toBe(13);
  });

  it("nennt unter dem Fragebogen-Link 13 kurze Fragen, die Dauer und die Gültigkeit", () => {
    const hinweis = bewerberFragebogenHinweis(BEWERBER_ANZAHL_FRAGEN, 14);
    expect(hinweis).toContain("13 kurze Fragen");
    expect(hinweis).toContain("etwa 3 Minuten");
    expect(hinweis).toContain("der Link gilt 14 Tage");
    expect(hinweis).not.toContain("10 Fragen");
  });

  it("verweist auf den Calendly-Kalender der HR-Managerin", () => {
    expect(BEWERBER_BUCHUNGSLINK).toBe(
      "https://calendly.com/sarah-kaiser-thom-more/gespraechstermin",
    );
  });

  it("traegt keinen month-Parameter, der Besucher auf einen festen Monat festlegen wuerde", () => {
    // Mit ?month=2026-09 zeigt Calendly dauerhaft den September 2026, auch
    // wenn der laengst vorbei ist. Ohne Parameter oeffnet der aktuelle Monat.
    expect(BEWERBER_BUCHUNGSLINK).not.toContain("month=");
    expect(BEWERBER_BUCHUNGSLINK).not.toContain("?");
  });

  it("dankt fuer das Interesse an der vertrieblichen Zusammenarbeit", () => {
    expect(BEWERBER_EINGANG_DANKE).toContain(
      "vielen Dank für dein Interesse an einer vertrieblichen Zusammenarbeit",
    );
  });

  it("kuendigt den Anruf an und bietet das 60-minuetige Gespraech als Alternative", () => {
    expect(BEWERBER_EINGANG_TERMIN).toContain("Wir melden uns zeitnah telefonisch bei dir");
    expect(BEWERBER_EINGANG_TERMIN).toContain("60-minütiges Gespräch");
    expect(BEWERBER_EINGANG_TERMIN).toContain("in Ruhe");
  });
});
