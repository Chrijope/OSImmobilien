import { describe, it, expect } from "vitest";
import {
  eingangStandText,
  nachfassHinweisText,
  nachfassStand,
  versandDatumText,
  type NachfassBewerber,
} from "./bewerberNachfass";

/** Kurzschreibweise, damit die Fälle lesbar bleiben. */
function b(teil: Partial<NachfassBewerber>): NachfassBewerber {
  return { status: "Eingang", klNachfassMailAm: "", selbstAbgemeldetAm: "", ...teil } as NachfassBewerber;
}

describe("nachfassStand", () => {
  it("meldet nichts, solange keine Welle hinausging", () => {
    const stand = nachfassStand([b({ selbstAbgemeldetAm: "2026-09-01T10:00:00.000Z" }), b({})]);
    expect(stand.letzterVersand).toBeNull();
    expect(stand.angeschrieben).toBe(0);
    expect(nachfassHinweisText(stand)).toBe("");
  });

  it("zaehlt Abmeldungen nur nach dem juengsten Versand", () => {
    const stand = nachfassStand([
      b({ klNachfassMailAm: "2026-09-03T09:00:00.000Z" }),
      b({ klNachfassMailAm: "2026-09-03T09:00:05.000Z", selbstAbgemeldetAm: "2026-09-04T08:00:00.000Z" }),
      b({ klNachfassMailAm: "2026-09-03T09:00:03.000Z", selbstAbgemeldetAm: "2026-09-03T09:00:05.000Z" }),
      // Vor der Welle abgemeldet, kann nicht auf sie reagiert haben.
      b({ klNachfassMailAm: "", selbstAbgemeldetAm: "2026-09-01T08:00:00.000Z" }),
      b({ selbstAbgemeldetAm: "kaputt" }),
    ]);
    expect(stand.letzterVersand).toBe("2026-09-03T09:00:05.000Z");
    expect(stand.angeschrieben).toBe(3);
    expect(stand.abgemeldet).toBe(2);
  });

  it("liest den neuen Merker und nicht den der ersten Welle", () => {
    /*
     * Der Fehler, wegen dem dieser Test existiert: Nach dem Versand der
     * Sammelmail an 36 Bewerber meldete der Balken unveraendert 180, weil er
     * `nachfassMailAm` der ersten Welle las. Wer nur die alte Mail hat, darf
     * hier nicht mitzaehlen.
     */
    const stand = nachfassStand([
      { status: "Eingang", nachfassMailAm: "2026-09-03T09:00:00.000Z" } as unknown as NachfassBewerber,
      b({ klNachfassMailAm: "2026-09-12T09:00:00.000Z" }),
    ]);
    expect(stand.angeschrieben).toBe(1);
    expect(stand.letzterVersand).toBe("2026-09-12T09:00:00.000Z");
  });

  it("zaehlt den Eingang getrennt von den Angeschriebenen", () => {
    /*
     * Wer die Mail hat, kann inzwischen weitergerueckt sein. Deshalb sind
     * "angeschrieben" und "im Eingang" zwei verschiedene Zahlen, und nur die
     * zweite beantwortet die Frage, ob der Eingang durch ist.
     */
    const stand = nachfassStand([
      b({ klNachfassMailAm: "2026-09-12T09:00:00.000Z" }),
      b({ klNachfassMailAm: "2026-09-12T09:00:01.000Z" }),
      b({}),
      b({}),
      b({}),
      { status: "Erstgespraech", klNachfassMailAm: "2026-09-12T09:00:02.000Z" } as NachfassBewerber,
    ]);
    expect(stand.angeschrieben).toBe(3);
    expect(stand.imEingang).toBe(5);
    expect(stand.offenImEingang).toBe(3);
  });

  it("formuliert den Balken in Einzahl und Mehrzahl", () => {
    const datum = versandDatumText("2026-09-03T09:00:00.000Z");
    expect(datum).toMatch(/3\. September 2026/);
    const basis = { letzterVersand: "2026-09-03T09:00:00.000Z", angeschrieben: 5, imEingang: 0, offenImEingang: 0 };
    expect(nachfassHinweisText({ ...basis, abgemeldet: 1 }))
      .toBe(`Seit dem Versand am ${datum} hat sich 1 Bewerber abgemeldet.`);
    expect(nachfassHinweisText({ ...basis, abgemeldet: 4 }))
      .toBe(`Seit dem Versand am ${datum} haben sich 4 Bewerber abgemeldet.`);
    expect(nachfassHinweisText({ ...basis, abgemeldet: 0 }))
      .toContain("haben sich 0 Bewerber abgemeldet");
  });
});

describe("eingangStandText", () => {
  const basis = { letzterVersand: "2026-09-12T09:00:00.000Z", abgemeldet: 0, angeschrieben: 36 };

  it("schweigt, wenn der Eingang leer ist", () => {
    expect(eingangStandText({ ...basis, imEingang: 0, offenImEingang: 0 })).toBe("");
  });

  it("sagt klar, wenn alle im Eingang die Mail haben", () => {
    expect(eingangStandText({ ...basis, imEingang: 36, offenImEingang: 0 })).toBe("Alle 36 im Eingang haben sie.");
  });

  it("nennt die offenen und erklaert, dass das keine Panne ist", () => {
    /*
     * Die nackte Zahl "130 offen" liest sich wie ein Fehlschlag. Der groesste
     * Teil davon hat aber seinen Bogen schon abgeschickt und soll die Mail
     * gar nicht bekommen. Genau diese Einordnung muss im Satz stehen.
     */
    const text = eingangStandText({ ...basis, imEingang: 166, offenImEingang: 130 });
    expect(text).toContain("36 von 166 im Eingang haben sie");
    expect(text).toContain("130");
    expect(text).toMatch(/Bogen schon durch|stehen noch aus/);
    expect(text).toContain("Versanddialog");
  });
});
