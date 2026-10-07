import { describe, it, expect } from "vitest";
import {
  HINWEIS_PAUSE_TAGE,
  hinweisZeigen,
  kundenMfaSchritt,
  spaeterZeitpunkt,
} from "./kundenZweiFaktor";
import { istReinesKundenkonto } from "../../supabase/functions/_shared/mfa-stufe.ts";

/**
 * Zwei-Faktor-Anmeldung für Kunden: freiwillig, aber verbindlich, wenn an.
 * Entscheidung Christian vom 25.09.2026.
 */

const JETZT = new Date("2026-09-25T12:00:00Z");
const tageVorher = (tage: number) => new Date(JETZT.getTime() - tage * 24 * 60 * 60 * 1000).toISOString();

describe("hinweisZeigen", () => {
  it("zeigt den Hinweis einem Kunden ohne Zwei-Faktor", () => {
    expect(hinweisZeigen({ art: "keiner" }, null, JETZT)).toBe(true);
    expect(hinweisZeigen({ art: "halbfertig" }, null, JETZT)).toBe(true);
  });

  it("zeigt ihn nie mit aktiver Zwei-Faktor-Anmeldung", () => {
    expect(hinweisZeigen({ art: "verifiziert", factorId: "f1" }, null, JETZT)).toBe(false);
    expect(hinweisZeigen({ art: "verifiziert", factorId: "f1" }, tageVorher(400), JETZT)).toBe(false);
  });

  it("zeigt ihn nicht, wenn der Zustand unklar ist", () => {
    expect(hinweisZeigen({ art: "unbekannt" }, null, JETZT)).toBe(false);
  });

  it("zeigt ihn nach dem Schließen nicht sofort wieder", () => {
    expect(hinweisZeigen({ art: "keiner" }, JETZT.toISOString(), JETZT)).toBe(false);
    expect(hinweisZeigen({ art: "keiner" }, tageVorher(1), JETZT)).toBe(false);
    expect(hinweisZeigen({ art: "keiner" }, tageVorher(HINWEIS_PAUSE_TAGE - 1), JETZT)).toBe(false);
  });

  it(`zeigt ihn nach ${HINWEIS_PAUSE_TAGE} Tagen wieder`, () => {
    expect(HINWEIS_PAUSE_TAGE).toBe(30);
    expect(hinweisZeigen({ art: "keiner" }, tageVorher(HINWEIS_PAUSE_TAGE), JETZT)).toBe(true);
    expect(hinweisZeigen({ art: "keiner" }, tageVorher(90), JETZT)).toBe(true);
  });

  it("wertet einen unlesbaren Zeitpunkt als nie geschlossen", () => {
    expect(hinweisZeigen({ art: "keiner" }, "kein Datum", JETZT)).toBe(true);
  });
});

describe("spaeterZeitpunkt", () => {
  it("nimmt den späteren von Gerät und Konto", () => {
    expect(spaeterZeitpunkt(tageVorher(5), tageVorher(1))).toBe(tageVorher(1));
    expect(spaeterZeitpunkt(tageVorher(1), tageVorher(5))).toBe(tageVorher(1));
    expect(spaeterZeitpunkt(null, tageVorher(2))).toBe(tageVorher(2));
    expect(spaeterZeitpunkt(tageVorher(2), "Unsinn")).toBe(tageVorher(2));
    expect(spaeterZeitpunkt(null, undefined)).toBeNull();
  });
});

describe("kundenMfaSchritt", () => {
  it("lässt Kunden ohne Zwei-Faktor ins Portal, mit Hinweis wenn fällig", () => {
    expect(kundenMfaSchritt({ art: "keiner" }, false, true)).toBe("ok_mit_hinweis");
    expect(kundenMfaSchritt({ art: "keiner" }, false, false)).toBe("ok");
    expect(kundenMfaSchritt({ art: "halbfertig" }, false, true)).toBe("ok_mit_hinweis");
  });

  it("verlangt von Kunden mit Zwei-Faktor den Code, solange die Sitzung ihn nicht hat", () => {
    expect(kundenMfaSchritt({ art: "verifiziert", factorId: "f1" }, false, false)).toBe("challenge");
    // Auch ein fälliger Hinweis ändert daran nichts.
    expect(kundenMfaSchritt({ art: "verifiziert", factorId: "f1" }, false, true)).toBe("challenge");
  });

  it("lässt Kunden mit Zwei-Faktor nach dem Code ohne Hinweis hinein", () => {
    expect(kundenMfaSchritt({ art: "verifiziert", factorId: "f1" }, true, true)).toBe("ok");
  });

  it("sperrt niemanden aus, wenn die Faktorliste nicht abrufbar ist", () => {
    expect(kundenMfaSchritt({ art: "unbekannt" }, false, true)).toBe("ok");
  });
});

describe("istReinesKundenkonto (Ausschalten nur für Kunden)", () => {
  it("erlaubt Kunden, auch mit Tippgeber-Rolle", () => {
    expect(istReinesKundenkonto(["kunde"])).toBe(true);
    expect(istReinesKundenkonto(["kunde", "tippgeber"])).toBe(true);
  });

  it("verbietet es internen Rollen, auch wenn sie zusätzlich Kunde sind", () => {
    expect(istReinesKundenkonto(["admin"])).toBe(false);
    expect(istReinesKundenkonto(["vertriebspartner"])).toBe(false);
    expect(istReinesKundenkonto(["kunde", "vertriebspartner"])).toBe(false);
    expect(istReinesKundenkonto(["tippgeber"])).toBe(false);
    expect(istReinesKundenkonto([])).toBe(false);
  });
});
