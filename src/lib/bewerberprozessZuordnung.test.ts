import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Die Trennung der beiden Bewerberlisten.
 *
 * Beide Bereiche lesen dieselbe Tabelle. Geprüft wird hier die eine Eigenschaft,
 * auf die es dabei ankommt: Ein Bewerber ist immer in genau einer der beiden
 * Listen, nie in beiden und nie in keiner.
 */

const gespeichert: Record<string, Record<string, unknown>> = {};
let bestand: { id: string; prozess?: string }[] = [];

vi.mock("./bewerbungStore", () => ({
  getBewerber: () => bestand,
  updateBewerber: (id: string, data: Record<string, unknown>) => {
    gespeichert[id] = { ...(gespeichert[id] || {}), ...data };
    bestand = bestand.map((b) => (b.id === id ? { ...b, ...data } : b));
  },
  // `bewerberArbeitsplatz.ts` liest die Beschriftungen von hier. Nur die
  // beiden Stufen, um die es in diesen Tests geht.
  STATUS_LABELS: { Eingang: "Eingang", Erstgespraech: "Erstgespräch" },
}));

const {
  istImNeuenProzess,
  nurNeuerProzess,
  nurAlterProzess,
  alleInDenNeuenProzess,
  alleZurueckInDenAltenProzess,
  PROZESS_NEU,
} = await import("./bewerberprozessZuordnung");

const { ABLAUF_ALT, ABLAUF_NEU, stufenLabel } = await import("./bewerberArbeitsplatz");

beforeEach(() => {
  for (const k of Object.keys(gespeichert)) delete gespeichert[k];
  bestand = [
    { id: "alt-1" },
    { id: "alt-2", prozess: "" },
    { id: "neu-1", prozess: PROZESS_NEU },
  ];
});

describe("Wer gehört wohin", () => {
  it("zählt einen Bewerber ohne Kennzeichen zum bestehenden Ablauf", () => {
    // Die wichtigste Richtung: Alle heutigen Bewerber tragen nichts und
    // bleiben deshalb dort, wo die HR-Managerin arbeitet.
    expect(istImNeuenProzess({ prozess: undefined })).toBe(false);
    expect(istImNeuenProzess({ prozess: "" })).toBe(false);
  });

  it("erkennt das Kennzeichen des neuen Ablaufs", () => {
    expect(istImNeuenProzess({ prozess: PROZESS_NEU })).toBe(true);
  });

  it("hält einen unbekannten Wert vom neuen Ablauf fern", () => {
    expect(istImNeuenProzess({ prozess: "irgendwas" })).toBe(false);
  });

  it("verträgt einen fehlenden Bewerber", () => {
    expect(istImNeuenProzess(undefined)).toBe(false);
    expect(istImNeuenProzess(null)).toBe(false);
  });
});

describe("Die beiden Listen", () => {
  it("gibt dem neuen Bereich nur die gekennzeichneten", () => {
    expect(nurNeuerProzess(bestand).map((b) => b.id)).toEqual(["neu-1"]);
  });

  it("gibt dem bestehenden Bereich alle übrigen", () => {
    expect(nurAlterProzess(bestand).map((b) => b.id)).toEqual(["alt-1", "alt-2"]);
  });

  it("zeigt keinen Bewerber in beiden Listen", () => {
    const neu = new Set(nurNeuerProzess(bestand).map((b) => b.id));
    const alt = new Set(nurAlterProzess(bestand).map((b) => b.id));
    for (const id of neu) expect(alt.has(id)).toBe(false);
  });

  it("verliert keinen Bewerber zwischen den Listen", () => {
    expect(nurNeuerProzess(bestand).length + nurAlterProzess(bestand).length).toBe(bestand.length);
  });

  it("startet leer, solange niemand hinübergeholt wurde", () => {
    bestand = [{ id: "alt-1" }, { id: "alt-2" }];
    expect(nurNeuerProzess(bestand)).toEqual([]);
  });
});

describe("Der Umzug beim Umschalten", () => {
  it("stellt alle offenen um und meldet die Anzahl", () => {
    expect(alleInDenNeuenProzess()).toBe(2);
    expect(nurAlterProzess(bestand)).toEqual([]);
    expect(nurNeuerProzess(bestand).length).toBe(3);
  });

  it("fasst niemanden zweimal an", () => {
    // Der Aufruf muss gefahrlos wiederholbar sein, sonst traut sich beim
    // Umschalten niemand, ihn nach einem Abbruch erneut auszulösen.
    alleInDenNeuenProzess();
    for (const k of Object.keys(gespeichert)) delete gespeichert[k];
    expect(alleInDenNeuenProzess()).toBe(0);
    expect(Object.keys(gespeichert)).toEqual([]);
  });

  it("führt vollständig zurück", () => {
    alleInDenNeuenProzess();
    expect(alleZurueckInDenAltenProzess()).toBe(3);
    expect(nurNeuerProzess(bestand)).toEqual([]);
    expect(nurAlterProzess(bestand).length).toBe(3);
  });
});

/*
 * Die Verdrahtung, nicht nur die Logik.
 *
 * Die Funktionen oben können richtig sein und die Trennung trotzdem nicht
 * wirken, wenn eine der beiden Seiten sie nicht benutzt. Genau das wäre der
 * teure Fehler: Ein Übungsbewerber stünde in der Liste der HR-Managerin, und
 * niemand merkte es, bis sie ihn anruft.
 *
 * Seit beide Seiten dieselbe Komponente `BewerberArbeitsplatz` sind, hängt die
 * Trennung an genau einer Stelle: der Beschreibung, die jede Seite hereinreicht.
 * Die lässt sich unmittelbar prüfen, und das ist mehr wert als der frühere
 * Blick in den Quelltext. Der bleibt zusätzlich, für die drei Stellen, die sich
 * nur so prüfen lassen.
 */
describe("Die Beschreibung des Ablaufs trennt die beiden Listen", () => {
  /*
   * Seit dem 10.09.2026 gibt es nur noch eine Seite, und die zeigt jeden
   * Bewerber. Wuerde hier weiter nach dem Kennzeichen gefiltert, waeren nach
   * dem Aufspielen alle 356 verschwunden, bis jemand die Migration im
   * SQL-Editor ausfuehrt. Das saehe aus wie Datenverlust und ist genau der
   * Fehler, den dieser Test verhindert.
   */
  it("zeigt jeden Bewerber, gleich welches Kennzeichen er traegt", () => {
    expect(ABLAUF_NEU.liste(bestand).map((b) => b.id)).toEqual(bestand.map((b) => b.id));
  });

  it("verliert keinen Bewerber", () => {
    expect(ABLAUF_NEU.liste(bestand).length).toBe(bestand.length);
  });

  /*
   * Der abgeloeste Ablauf rendert keine Liste mehr, seine Auswahl bleibt aber
   * als Rueckfall je Bewerber bestehen: Wer noch kein Kennzeichen traegt,
   * arbeitet in seinem bisherigen Erstgespraech weiter.
   */
  it("haelt den Rueckfall fuer Bewerber ohne Kennzeichen bereit", () => {
    expect(ABLAUF_ALT.liste(bestand).map((b) => b.id)).toEqual(["alt-1", "alt-2"]);
  });

  it("erfasst einen neuen Bewerber in genau dem Ablauf, in dem er erfasst wird", () => {
    // Das Kennzeichen des Knopfes „Bewerber erfassen". Leer heißt: bleibt im
    // bestehenden Bewerbungsmanagement.
    expect(ABLAUF_ALT.prozessKennzeichen).toBe("");
    expect(ABLAUF_NEU.prozessKennzeichen).toBe(PROZESS_NEU);
    expect(istImNeuenProzess({ prozess: ABLAUF_NEU.prozessKennzeichen })).toBe(true);
    expect(istImNeuenProzess({ prozess: ABLAUF_ALT.prozessKennzeichen })).toBe(false);
  });
});

describe("Die Stufen bleiben dieselben, nur eine heißt anders", () => {
  it("nennt die Stufe im bestehenden Ablauf weiterhin Erstgespräch", () => {
    expect(stufenLabel(ABLAUF_ALT, "Erstgespraech")).toBe("Erstgespräch");
  });

  it("nennt dieselbe Stufe im neuen Ablauf Videocall", () => {
    // Reine Anzeige. In der Datenbank steht weiterhin `Erstgespraech`, sonst
    // wirkte ein neuer Statuswert auch im bestehenden Bewerbungsmanagement.
    expect(stufenLabel(ABLAUF_NEU, "Erstgespraech")).toBe("Videocall");
  });

  it("lässt alle übrigen Stufen unberührt", () => {
    expect(stufenLabel(ABLAUF_NEU, "Eingang")).toBe(stufenLabel(ABLAUF_ALT, "Eingang"));
  });
});

describe("Beide Seiten benutzen wirklich denselben Arbeitsplatz", () => {
  const lies = (pfad: string) => readFileSync(new URL(pfad, import.meta.url), "utf-8");

  /*
   * Bis zum 10.09.2026 wohnte die gemeinsame Komponente in
   * `pages/Bewerbungsmanagement.tsx`, und `Bewerberprozess.tsx` holte sie von
   * dort. Ein Loeschen der alten Datei haette den neuen Bereich mitgenommen.
   * Deshalb heisst sie jetzt nach dem, was sie ist.
   */
  it("wohnt nicht mehr in der Datei des Bewerbungsmanagements", () => {
    expect(() => lies("../pages/Bewerbungsmanagement.tsx")).toThrow();
  });

  it("liest die Liste im Arbeitsplatz aus der Beschreibung", () => {
    const quelle = lies("../pages/BewerberArbeitsplatz.tsx");
    expect(quelle).toContain("ablauf.liste(getBewerber())");
  });

  it("reicht dem neuen Bereich den neuen Ablauf herein", () => {
    const quelle = lies("../pages/Bewerberprozess.tsx");
    expect(quelle).toContain("<BewerberArbeitsplatz ablauf={ABLAUF_NEU} />");
  });

  /*
   * Der Knopf „Ablauf umstellen" ist am 26.09.2026 auf Christians Wunsch
   * entfallen, samt Dialog und den beiden Hilfsfunktionen für einen einzelnen
   * Bewerber. Das Kennzeichen am Bewerber bleibt wirksam, nur die Bedienung
   * ist weg.
   */
  it("bietet das Umstellen eines einzelnen Bewerbers nicht mehr an", async () => {
    const quelle = lies("../pages/BewerberArbeitsplatz.tsx");
    expect(quelle).not.toContain("Ablauf umstellen");
    expect(quelle).not.toContain("BestandHolenDialog");
    expect(quelle).not.toContain("inNeuenProzessHolen");
    expect(quelle).not.toContain("zurueckInDenAltenProzess");
    const modul = await import("./bewerberprozessZuordnung");
    expect("inNeuenProzessHolen" in modul).toBe(false);
    expect("zurueckInDenAltenProzess" in modul).toBe(false);
    // Rückfragen bleiben im Projektstil, nicht als Browser-Dialog.
    expect(quelle).not.toMatch(/[^.\w]confirm\(/);
  });

  it("hält den Browser-Dialog auch aus der neuen Seite heraus", () => {
    const quelle = lies("../pages/Bewerberprozess.tsx");
    expect(quelle).not.toMatch(/[^.\w](confirm|alert|prompt)\(/);
  });
});
