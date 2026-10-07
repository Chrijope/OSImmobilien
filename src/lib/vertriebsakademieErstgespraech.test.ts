import { describe, it, expect } from "vitest";
import { VERTRIEBSAKADEMIE_KAPITEL } from "./vertriebsakademieContent";
import { ERSTGESPRAECH_WIZARD_UEBERSICHT } from "@/components/setter/SetterErstgespraechsSkript";

/**
 * Der Wächter über Kapitel 4 der Vertriebsakademie.
 *
 * Christian hat das alte Erstgesprächsskript durch den Wizard im Kundenprofil
 * ersetzt. Das Kapitel beschreibt seitdem diesen Wizard und zitiert seine
 * Sprechtexte wörtlich, damit ein neuer Partner im Kapitel dasselbe liest, was
 * er später im CRM vor sich hat.
 *
 * Genau daran kann es still auseinanderlaufen: Wer einen Satz im Wizard
 * umformuliert, merkt nicht, dass dieselbe Stelle auch im Kapitel steht. Zwei
 * Fassungen desselben Satzes sind schlimmer als eine, denn der Partner lernt
 * dann die falsche. Ein Bildschirmfoto hätte dasselbe Problem, nur unsichtbar.
 *
 * Deshalb wird hier Position für Position verglichen. Die Reihenfolge ist die
 * Anzeigereihenfolge des Wizards, also GRUPPEN mal Bausteine. Wer im Wizard
 * einen Baustein hinzufügt, entfernt oder umformuliert, bekommt hier eine
 * Fehlermeldung mit der Stelle und weiß, was im Kapitel nachzuziehen ist.
 */

const KAPITEL = VERTRIEBSAKADEMIE_KAPITEL.find((k) => k.slug === "erstgespraech");
const ABSCHNITT = KAPITEL?.sections.find((s) => s.id === "skript");

/** Alle Bausteine des Wizards, flach und in der Reihenfolge der Anzeige. */
const BAUSTEINE = ERSTGESPRAECH_WIZARD_UEBERSICHT.flatMap((g) =>
  g.bausteine.map((b) => ({ nr: g.nr, schritt: g.titel, ...b })),
);

describe("Kapitel 4 und der Erstgesprächs-Wizard", () => {
  it("das Kapitel und der Abschnitt zum Skript sind vorhanden", () => {
    expect(KAPITEL, "Kapitel mit slug erstgespraech").toBeTruthy();
    expect(ABSCHNITT, "Abschnitt mit id skript").toBeTruthy();
  });

  it("das Kapitel führt genau die Bausteine des Wizards, in derselben Reihenfolge", () => {
    expect(ABSCHNITT?.skripte?.length, "Anzahl der zitierten Bausteine").toBe(BAUSTEINE.length);
  });

  it("jeder zitierte Sprechtext ist Wort für Wort der des Wizards", () => {
    const zitate = ABSCHNITT?.skripte ?? [];
    BAUSTEINE.forEach((b, i) => {
      const zitat = zitate[i];
      expect(zitat, `Position ${i + 1} (${b.id}) fehlt im Kapitel`).toBeTruthy();
      expect(zitat.text, `Position ${i + 1}, Baustein „${b.id}" in Schritt ${b.nr}`).toBe(b.text);
    });
  });

  /**
   * Nur die Schrittnummer, nicht der Wortlaut des Baustein-Titels: Die
   * Überschriften im Kapitel folgen der Hausregel ohne Gedankenstriche, im
   * Wizard steht an einer Stelle noch einer. Der Wortlaut, auf den es ankommt,
   * ist der Sprechtext, und den prüft die Zusicherung darüber.
   */
  it("jede Überschrift nennt die Schrittnummer, unter der der Baustein im Wizard steht", () => {
    const zitate = ABSCHNITT?.skripte ?? [];
    BAUSTEINE.forEach((b, i) => {
      const titel = zitate[i]?.titel ?? "";
      expect(titel, `Position ${i + 1} (${b.id})`).toContain(`Schritt ${b.nr}`);
    });
  });

  it("die Zeitleiste im Kapitel zeigt dieselben elf Schritte wie die Leiste im Wizard", () => {
    const zeitleiste = (ABSCHNITT?.visuals ?? []).map((v) => v.timeline).find(Boolean);
    expect(zeitleiste, "Zeitleiste im Abschnitt skript").toBeTruthy();
    expect(zeitleiste!.schritte.map((s) => s.label)).toEqual(
      ERSTGESPRAECH_WIZARD_UEBERSICHT.map((g) => g.titel),
    );
    zeitleiste!.schritte.forEach((s, i) => {
      expect(s.dauer, `Zeitleiste, Eintrag ${i + 1}`).toBe(`Schritt ${ERSTGESPRAECH_WIZARD_UEBERSICHT[i].nr}`);
    });
  });

  it("die Sortieraufgabe führt genauso viele Schritte wie der Wizard", () => {
    const sortieren = (ABSCHNITT?.aufgaben ?? []).find((a) => a.typ === "sortieren");
    expect(sortieren, "Sortieraufgabe im Abschnitt skript").toBeTruthy();
    expect(sortieren!.schritte.length).toBe(ERSTGESPRAECH_WIZARD_UEBERSICHT.length);
  });

  it("jeder zitierte Baustein trägt eine Begründung", () => {
    for (const sk of ABSCHNITT?.skripte ?? []) {
      expect(sk.warum?.trim(), `Baustein „${sk.titel}" ohne Warum`).toBeTruthy();
    }
  });
});
