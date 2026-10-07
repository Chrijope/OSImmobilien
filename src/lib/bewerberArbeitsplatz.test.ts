import { describe, it, expect } from "vitest";
import { ABLAUF_ALT, ABLAUF_NEU, ablaufFuerBewerber, stelleAnzeige } from "@/lib/bewerberArbeitsplatz";

/**
 * Die Einladung, die beim Erfassen mitgeht.
 *
 * Der Anlass ist ein echter Vorfall: Im neuen Bereich `/bewerberprozess` war
 * das Häkchen „Fragebogen direkt verschicken" vorausgewählt, und es verschickte
 * den alten Vorabbogen mit dreizehn Fragen. Genau diese falsche Mail bekam der
 * Geschäftsführer, als er den neuen Ablauf erproben wollte.
 *
 * Beide Bereiche zeigen dieselbe Komponente. Ohne diesen Test fällt es
 * niemandem auf, wenn der Unterschied wieder verschwindet.
 */

describe("Die Einladung beim Erfassen", () => {
  it("schickt im neuen Ablauf das Kennenlernen und nicht den Vorabbogen", () => {
    expect(ABLAUF_NEU.einladung.funktion).toBe("send-bewerber-kennenlernen");
    expect(ABLAUF_ALT.einladung.funktion).toBe("send-bewerber-formular");
  });

  it("beschriftet das Häkchen mit dem, was wirklich hinausgeht", () => {
    // Im neuen Ablauf darf weder „Fragebogen" noch die Zahl der alten Fragen
    // auftauchen. Beides war die Beschriftung, die in die Irre führte.
    const neu = `${ABLAUF_NEU.einladung.titel} ${ABLAUF_NEU.einladung.erklaerung}`;
    expect(neu).toContain("Kennenlernen");
    expect(neu).not.toContain("Fragebogen");
    expect(neu).not.toContain("13");

    // Im bestehenden Ablauf bleibt es beim Fragebogen.
    expect(ABLAUF_ALT.einladung.titel).toContain("Fragebogen");
  });

  it("nennt in beiden Abläufen einen Weg, den Versand nachzuholen", () => {
    for (const ablauf of [ABLAUF_ALT, ABLAUF_NEU]) {
      expect(ablauf.einladung.nachholen.trim().length).toBeGreaterThan(10);
      expect(ablauf.einladung.kurz.trim()).not.toBe("");
    }
  });

  it("hält die beiden Einladungen auseinander", () => {
    expect(ABLAUF_NEU.einladung.funktion).not.toBe(ABLAUF_ALT.einladung.funktion);
    expect(ABLAUF_NEU.einladung.titel).not.toBe(ABLAUF_ALT.einladung.titel);
  });
});

/**
 * Der Ablauf eines einzelnen Bewerbers.
 *
 * Die Reiter der Akte leiten ihn aus dem Kennzeichen ab. Solange das an jedem
 * Reiter einzeln geschah, wurde es auch einzeln vergessen: Der Reiter
 * Videocall führte in die neue Präsentation, der Reiter Closing weiter in die
 * alte mit ihren zwei Teilen.
 */
describe("Der Ablauf eines einzelnen Bewerbers", () => {
  it("ohne Kennzeichen ist es der bestehende Ablauf", () => {
    expect(ablaufFuerBewerber({ prozess: "" })).toBe(ABLAUF_ALT);
    expect(ablaufFuerBewerber(undefined)).toBe(ABLAUF_ALT);
    expect(ablaufFuerBewerber(null)).toBe(ABLAUF_ALT);
    // Ein fremder Wert stellt niemanden in den neuen Ablauf.
    expect(ablaufFuerBewerber({ prozess: "irgendwas" })).toBe(ABLAUF_ALT);
  });

  it("mit dem Kennzeichen neu ist es der neue Ablauf", () => {
    expect(ablaufFuerBewerber({ prozess: "neu" })).toBe(ABLAUF_NEU);
    expect(ablaufFuerBewerber({ prozess: "neu" }).id).toBe("neu");
  });
});

/**
 * Die Stelle im Bewerberprofil.
 *
 * Christian hat am 17.09.2026 gemeldet, dass das Feld leer bleibt, wenn
 * jemand über den Bewerberprozess hereinkommt. Dort gibt es nur eine Stelle,
 * also steht sie auch da, statt „Nicht hinterlegt".
 */
describe("Die Stelle im Bewerberprofil", () => {
  it("nennt Vertriebspartner, wenn nichts hinterlegt ist", () => {
    expect(stelleAnzeige("")).toBe("Vertriebspartner");
    expect(stelleAnzeige(undefined)).toBe("Vertriebspartner");
    expect(stelleAnzeige(null)).toBe("Vertriebspartner");
    expect(stelleAnzeige("   ")).toBe("Vertriebspartner");
  });

  it("behandelt den Strich aus dem Erfassungsdialog wie eine leere Angabe", () => {
    expect(stelleAnzeige("-")).toBe("Vertriebspartner");
    expect(stelleAnzeige("\u2013")).toBe("Vertriebspartner");
    expect(stelleAnzeige("\u2014")).toBe("Vertriebspartner");
  });

  it("lässt eine wirklich hinterlegte Stelle unangetastet", () => {
    expect(stelleAnzeige("Tippgeber Immobilien-Kapitalanlage")).toBe("Tippgeber Immobilien-Kapitalanlage");
    expect(stelleAnzeige("  Vertriebspartner (m/w/d)  ")).toBe("Vertriebspartner (m/w/d)");
  });
});
