import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  abschlussWeg,
  istDirektErledigbar,
  sammelbareAufgaben,
  sammelwegBeschreibung,
  SAMMELWEG_SCHWELLE,
  zeigeSammelweg,
} from "@/lib/aktionAbschluss";
import type { GeplanteAktion } from "@/lib/kundenNaechsteAktion";

/**
 * Der Haken an der Aktionsliste im Kundenprofil.
 *
 * Bewacht werden vier Zusagen:
 *
 *   1. Eine Aufgabe und ein Follow-up sind mit einem Klick erledigt.
 *   2. Ein Termin oder Videomeeting ist es NIEMALS. Er fuehrt immer in die
 *      Rueckfrage mit den drei Antworten, sonst wird die No-Show-Kette
 *      uebersprungen.
 *   3. Der Sammelweg fasst nur ueberfaellige Aufgaben an, nie einen Termin,
 *      und erscheint erst ab zwei Eintraegen.
 *   4. Es gibt nur eine Fassung der No-Show-Kette. Der letzte Teil dieser
 *      Datei liest dazu den Quelltext, denn zwei Fassungen laufen sonst
 *      still auseinander. Dasselbe Vorgehen wie in
 *      `objektauswahlImmerSichtbar.test.ts`.
 */

function aktion(teil: Partial<GeplanteAktion> & Pick<GeplanteAktion, "schluessel" | "art">): GeplanteAktion {
  return {
    titel: "Ohne Titel",
    zeitpunkt: Date.now() - 1000,
    hatUhrzeit: false,
    ueberfaellig: true,
    sprungziel: null,
    ...teil,
  };
}

describe("Was der Haken bei einem Eintrag tut", () => {
  it("erledigt Aufgabe und Follow-up mit einem Klick", () => {
    expect(istDirektErledigbar("aufgabe")).toBe(true);
    expect(istDirektErledigbar("follow_up")).toBe(true);
    expect(abschlussWeg(aktion({ schluessel: "aufgabe:1", art: "aufgabe" }))).toBe("direkt");
    expect(abschlussWeg(aktion({ schluessel: "follow_up:1", art: "follow_up" }))).toBe("direkt");
  });

  it("hakt einen Termin niemals still ab", () => {
    expect(istDirektErledigbar("termin")).toBe(false);
    expect(istDirektErledigbar("videotermin")).toBe(false);
    expect(
      abschlussWeg(aktion({ schluessel: "aktivitaet:7", art: "termin", aktivitaetId: "7" })),
    ).toBe("termin_dialog");
    expect(
      abschlussWeg(aktion({ schluessel: "aktivitaet:8", art: "videotermin", aktivitaetId: "8" })),
    ).toBe("termin_dialog");
  });

  it("schickt einen festen Termin ohne Zeile im Verlauf in den Ergebnis-Kasten", () => {
    expect(
      abschlussWeg(aktion({ schluessel: "termin:Beratungsgespräch:1", art: "termin" })),
    ).toBe("fester_termin");
  });

  it("nimmt auch einen Termin, der als Aufgabe angelegt wurde, nicht direkt", () => {
    // Eine Schnellaktion legt ein Meeting als Aufgabe vom Typ "meeting" an.
    // Der Schluessel beginnt dann mit "aufgabe:", die Art bleibt "termin".
    expect(
      abschlussWeg(aktion({ schluessel: "aufgabe:9", art: "termin", aktivitaetId: "a9" })),
    ).toBe("termin_dialog");
  });
});

describe("Der Sammelweg", () => {
  const vierUeberfaellige = [
    aktion({ schluessel: "aufgabe:1", art: "aufgabe", titel: "Unterlagen nachfordern" }),
    aktion({ schluessel: "follow_up:2", art: "follow_up", titel: "Nachfassen" }),
    aktion({ schluessel: "aktivitaet:3", art: "termin", titel: "Beratungsgespräch", aktivitaetId: "3" }),
    aktion({ schluessel: "aktivitaet:4", art: "videotermin", titel: "Videocall", aktivitaetId: "4" }),
  ];

  it("fasst nur Aufgaben und Follow-ups an, nie einen Termin", () => {
    expect(sammelbareAufgaben(vierUeberfaellige).map((a) => a.schluessel)).toEqual([
      "aufgabe:1",
      "follow_up:2",
    ]);
  });

  it("lässt Einträge in Ruhe, die noch nicht fällig sind", () => {
    const liste = [
      aktion({ schluessel: "aufgabe:1", art: "aufgabe" }),
      aktion({ schluessel: "aufgabe:2", art: "aufgabe", ueberfaellig: false }),
    ];
    expect(sammelbareAufgaben(liste).map((a) => a.schluessel)).toEqual(["aufgabe:1"]);
  });

  it("erscheint erst ab zwei Einträgen", () => {
    expect(SAMMELWEG_SCHWELLE).toBe(2);
    expect(zeigeSammelweg([])).toBe(false);
    expect(zeigeSammelweg([aktion({ schluessel: "aufgabe:1", art: "aufgabe" })])).toBe(false);
    expect(zeigeSammelweg(vierUeberfaellige)).toBe(true);
  });

  it("erscheint nicht, wenn nur Termine überfällig sind", () => {
    const nurTermine = vierUeberfaellige.filter((a) => a.art !== "aufgabe" && a.art !== "follow_up");
    expect(zeigeSammelweg(nurTermine)).toBe(false);
  });

  it("zählt in der Rückfrage auf, was betroffen ist", () => {
    const text = sammelwegBeschreibung(vierUeberfaellige);
    expect(text).toContain("Unterlagen nachfordern");
    expect(text).toContain("Nachfassen");
    expect(text).not.toContain("Beratungsgespräch");
    expect(text).not.toContain("Videocall");
  });
});

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

describe("Nur eine Fassung der No-Show-Kette", () => {
  const modul = lies("src/lib/terminErgebnis.ts");
  const karte = lies("src/components/kunden/BuchungErgebnisKarten.tsx");
  const dialog = lies("src/components/kunden/TerminErgebnisDialog.tsx");
  const kundenDetail = lies("src/pages/KundenDetail.tsx");

  it("setzt die NoShow-Stufe nur im gemeinsamen Modul", () => {
    expect(modul).toContain("function setzeNoShowStufe");
    for (const [name, quelle] of [["Karte", karte], ["Dialog", dialog]] as const) {
      expect(`${name}: ${quelle.includes("setzeNoShowStufe")}`).toBe(`${name}: false`);
      expect(`${name}: ${quelle.includes("NOSHOW_STUFE")}`).toBe(`${name}: false`);
    }
  });

  it("legt die Aufgabe zur Neuterminierung nur an einer Stelle an", () => {
    expect(modul.split("termin_noshow_").length - 1).toBe(1);
    expect(karte).not.toContain("termin_noshow_");
    expect(dialog).not.toContain("termin_noshow_");
    expect(kundenDetail).not.toContain("termin_noshow_");
  });

  it("rufen Karte und Dialog dieselben drei Funktionen", () => {
    for (const quelle of [karte, dialog]) {
      expect(quelle).toContain('from "@/lib/terminErgebnis"');
    }
    expect(karte).toContain("terminNoShow(");
    expect(dialog).toContain("terminNoShow(");
  });
});

/*
 * Der Haken an einem Verlaufseintrag, gemeldet von Christian am 16.09.2026.
 *
 * `kundenNaechsteAktion` fuehrt am Ende auch Eintraege, hinter denen keine
 * Zeile in `aufgaben` steht: aeltere Meetings und Aufgaben aus der Zeit vor
 * der Tabelle. Sie tragen `aktivitaet:<id>` als Schluessel und trotzdem die
 * Art "aufgabe". Der Haken schnitt stumpf hinter dem Doppelpunkt und suchte
 * damit eine Aufgabe, die es nicht gibt: Klick ohne Wirkung.
 */
describe("Verlaufseintraege ohne echte Aufgabe", () => {
  const quelle = readFileSync(
    resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8",
  );

  it("werden ueber die Aktivitaet geschlossen, nicht ueber die Aufgabe", () => {
    expect(quelle).toContain('if (aktion.schluessel.startsWith("aktivitaet:")) {');
    expect(quelle).toContain('setzeAktivitaetErledigt(aktion.schluessel.slice("aktivitaet:".length))');
  });

  it("die Abfrage steht VOR dem Weg ueber erledigeKundenAufgabe", () => {
    const aktivitaet = quelle.indexOf('if (aktion.schluessel.startsWith("aktivitaet:")) {');
    const aufgabe = quelle.indexOf('const quelle = aktion.schluessel.startsWith("follow_up:")');
    expect(aktivitaet).toBeGreaterThan(0);
    expect(aufgabe).toBeGreaterThan(aktivitaet);
  });

  it("gilt weiter als direkt erledigbar, der Haken bleibt also ein Klick", () => {
    expect(istDirektErledigbar("aufgabe")).toBe(true);
    expect(istDirektErledigbar("follow_up")).toBe(true);
    expect(istDirektErledigbar("termin")).toBe(false);
    expect(istDirektErledigbar("videotermin")).toBe(false);
  });
});

/*
 * Der abgeschlossene Setter-Termin, gemeldet von Christian am 16.09.2026.
 *
 * Der Ergebnis-Kasten verschwindet, sobald ein Ergebnis feststeht. Der Eintrag
 * in der Aktionsliste blieb aber stehen, und zwar unbegrenzt als ueberfaellig.
 * Der Haken an ihm verwies auf genau diesen fehlenden Kasten: Meldung ja,
 * Wirkung nein.
 */
describe("Feste Termine am Kontakt", () => {
  const termine = readFileSync(resolve(process.cwd(), "src/lib/kontaktTermine.ts"), "utf8");
  const detail = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

  it("ein abgeschlossener Setter-Termin faellt aus der Liste", () => {
    // Seit 30.09.2026 nur "erschienen"; No-Show und Verschoben laufen ueber
    // die Schluessel je Termin, siehe festerTerminErgebnis.test.ts.
    expect(termine).toContain('const setterTerminAbgeschlossen = (kunde as { terminErgebnis?: string }).terminErgebnis === "erschienen"');
    expect(termine).toContain('datum: setterTerminAbgeschlossen ? "" : (k.setterTerminDatum || meta.setterTerminDatum)');
  });

  it("der Ergebnis-Kasten verlangt keine Buchung mehr", () => {
    expect(detail).not.toContain("if (!kunde.setterTerminGebucht || !kunde.setterTerminDatum) return null;");
    expect(detail).toContain("if (!kunde.setterTerminDatum) return null;");
  });
});
