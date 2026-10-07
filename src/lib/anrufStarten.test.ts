import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/*
 * Klick auf eine Kundennummer: Der Anruf geht hinaus, und im Verlauf des
 * Kontakts steht genau ein Vermerk "Anruf gestartet". Entscheidung vom
 * 25.09.2026, sie ersetzt die frühere Seite "Anrufe".
 */

const addAktivitaetSicher = vi.fn();
vi.mock("./aktivitaetenStore", () => ({
  addAktivitaetSicher: (...args: unknown[]) => addAktivitaetSicher(...args),
}));
vi.mock("./currentUser", () => ({ getCurrentUserId: () => "nutzer-kennung-1" }));

const { starteAnrufFuerKontakt, vergissAnrufVermerke, ANRUF_VERMERK_SPERRE_MS } = await import("./anrufStarten");

/** Welche tel:-Verweise angeklickt wurden, also welche Anrufe hinausgingen. */
let gewaehlt: string[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-25T10:00:00Z"));
  vergissAnrufVermerke();
  gewaehlt = [];
  addAktivitaetSicher.mockReset();
  addAktivitaetSicher.mockImplementation(async (e: object) => ({ ...e, id: "neu" }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    gewaehlt.push(this.getAttribute("href") || "");
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("starteAnrufFuerKontakt", () => {
  it("startet den Anruf und legt genau eine Aktivität mit Nummer, Kontakt und Klickendem an", () => {
    starteAnrufFuerKontakt("kontakt-1", "+49 171 1234567", "Kundenprofil", "Hermann Vogl");

    expect(gewaehlt).toEqual(["tel:+491711234567"]);
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(1);
    const eintrag = addAktivitaetSicher.mock.calls[0][0];
    expect(eintrag).toMatchObject({
      kundeId: "kontakt-1",
      art: "anruf_gestartet",
      von: "Hermann Vogl",
      benutzerId: "nutzer-kennung-1",
    });
    expect(eintrag.beschreibung).toBe("Anruf gestartet: +49 171 1234567");
    expect(eintrag.details).toContain("Kundenprofil");
    // Nur der Wählvorgang, kein Protokoll, keine Aufgabe, kein Termin.
    expect(eintrag.ergebnis).toBeUndefined();
    expect(eintrag.faelligAm).toBeUndefined();
    expect(eintrag.erledigtAm).toBeUndefined();
    // Keine Gedankenstriche im sichtbaren Text.
    expect(`${eintrag.beschreibung} ${eintrag.details}`).not.toMatch(/[–—]/);
  });

  it("legt bei einem zweiten Klick innerhalb von 60 Sekunden keine zweite Aktivität an", async () => {
    starteAnrufFuerKontakt("kontakt-2", "0171 1234567", "Alle Kontakte");
    await vi.advanceTimersByTimeAsync(ANRUF_VERMERK_SPERRE_MS - 1000);
    // Dieselbe Nummer, anders geschrieben, gilt als dieselbe.
    starteAnrufFuerKontakt("kontakt-2", "+49 171 1234567", "Kundenprofil");

    expect(gewaehlt).toHaveLength(2);
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    starteAnrufFuerKontakt("kontakt-2", "0171 1234567", "Alle Kontakte");
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(2);
  });

  it("zählt eine andere Nummer oder einen anderen Kontakt getrennt", () => {
    starteAnrufFuerKontakt("kontakt-3", "0171 1111111", "Kundenprofil");
    starteAnrufFuerKontakt("kontakt-3", "0171 2222222", "Kundenprofil");
    starteAnrufFuerKontakt("kontakt-4", "0171 1111111", "Kundenprofil");
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(3);
  });

  it("lässt den Anruf durch, wenn das Speichern scheitert", async () => {
    addAktivitaetSicher.mockImplementation(() => { throw new Error("offline"); });
    expect(() => starteAnrufFuerKontakt("kontakt-5", "0171 5555555", "Kundenprofil")).not.toThrow();
    expect(gewaehlt).toEqual(["tel:01715555555"]);

    addAktivitaetSicher.mockImplementation(async () => { throw new Error("offline"); });
    vergissAnrufVermerke();
    starteAnrufFuerKontakt("kontakt-5", "0171 5555555", "Kundenprofil");
    await vi.advanceTimersByTimeAsync(0);
    expect(gewaehlt).toHaveLength(2);
  });

  it("gibt nach einem gescheiterten Speichern die Sperre wieder frei", async () => {
    addAktivitaetSicher.mockResolvedValueOnce(null);
    starteAnrufFuerKontakt("kontakt-6", "0171 6666666", "Kundenprofil");
    await vi.advanceTimersByTimeAsync(0);
    starteAnrufFuerKontakt("kontakt-6", "0171 6666666", "Kundenprofil");
    expect(addAktivitaetSicher).toHaveBeenCalledTimes(2);
  });

  it("wählt ohne Kontaktkennung trotzdem, vermerkt aber nichts", () => {
    starteAnrufFuerKontakt(undefined, "0171 7777777", "Kundenprofil");
    expect(gewaehlt).toEqual(["tel:01717777777"]);
    expect(addAktivitaetSicher).not.toHaveBeenCalled();
  });

  it("tut ohne Nummer gar nichts", () => {
    starteAnrufFuerKontakt("kontakt-8", "  ", "Kundenprofil");
    expect(gewaehlt).toEqual([]);
    expect(addAktivitaetSicher).not.toHaveBeenCalled();
  });
});
