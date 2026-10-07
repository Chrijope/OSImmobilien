import { describe, it, expect } from "vitest";
import {
  istVerkaeuferArt, verkaeuferArt, verkaeuferNameLabel,
  verkaeuferNotarFelder, verkaeuferVollerName,
} from "@/lib/verkaeuferName";

/**
 * Firma oder Privatperson.
 *
 * Der Anlass steht in `verkaeuferName.ts`: Der Verkäufername wurde am letzten
 * Leerzeichen geteilt, um die beiden Namensfelder des Notar-Aufnahmebogens zu
 * füllen. Aus „Musterbau Projektentwicklung GmbH“ wurde damit Nachname „GmbH“,
 * und genau so ging es zum Notar.
 *
 * Geprüft wird deshalb vor allem, was nicht mehr passiert: Es wird nirgends
 * geteilt, und ein bestehender Eintrag ohne Wahl verliert nichts.
 */

describe("Die Wahl selbst", () => {
  it("nimmt nur die beiden gültigen Werte an", () => {
    expect(istVerkaeuferArt("firma")).toBe(true);
    expect(istVerkaeuferArt("person")).toBe(true);
    expect(istVerkaeuferArt("")).toBe(false);
    expect(istVerkaeuferArt("GmbH")).toBe(false);
    expect(istVerkaeuferArt(undefined)).toBe(false);
  });

  it("gibt zurück, was gewählt wurde", () => {
    expect(verkaeuferArt({ art: "firma", name: "Erika Mustermann" })).toBe("firma");
    expect(verkaeuferArt({ art: "person", name: "Musterbau GmbH" })).toBe("person");
  });

  it("bleibt offen, solange niemand gewählt hat", () => {
    // Ausdrücklich auch bei einem Namen, der nach einer Firma klingt. Ihn zu
    // erraten wäre dieselbe Sorte Vermutung wie die alte Teilung.
    expect(verkaeuferArt({ name: "Musterbau Projektentwicklung GmbH" })).toBe("");
    expect(verkaeuferArt({ name: "Erika Mustermann" })).toBe("");
    expect(verkaeuferArt(null)).toBe("");
  });

  it("schließt aus einem Handelsregistereintrag auf eine Firma", () => {
    // Der einzige Anhaltspunkt, der ein Beleg und keine Vermutung ist:
    // Privatpersonen stehen nicht im Handelsregister.
    expect(verkaeuferArt({ name: "Musterbau", handelsregister: "HRB 12345" })).toBe("firma");
    // Eine getroffene Wahl schlägt den Anhaltspunkt.
    expect(verkaeuferArt({ art: "person", name: "Muster", handelsregister: "HRB 1" })).toBe("person");
    // Leerzeichen sind kein Eintrag.
    expect(verkaeuferArt({ name: "Musterbau", handelsregister: "   " })).toBe("");
  });
});

describe("Der Name in einer Zeile", () => {
  it("lässt eine Firma unangetastet", () => {
    expect(verkaeuferVollerName({ art: "firma", name: "Musterbau Projektentwicklung GmbH" }))
      .toBe("Musterbau Projektentwicklung GmbH");
  });

  it("setzt eine Privatperson aus Vorname und Nachname zusammen", () => {
    expect(verkaeuferVollerName({ art: "person", vorname: "Erika", name: "Mustermann" }))
      .toBe("Erika Mustermann");
  });

  it("verliert nichts, wenn die Wahl noch offen ist", () => {
    // Ein bestehender Eintrag hat nur den Namen.
    expect(verkaeuferVollerName({ name: "Musterbau Projektentwicklung GmbH" }))
      .toBe("Musterbau Projektentwicklung GmbH");
    // Ein bestehender Notarbogen trägt die beiden Hälften der alten Teilung.
    // Zusammengesetzt ergeben sie wieder den ursprünglichen Namen.
    expect(verkaeuferVollerName({ vorname: "Musterbau Projektentwicklung", name: "GmbH" }))
      .toBe("Musterbau Projektentwicklung GmbH");
  });

  it("kommt mit leeren Angaben zurecht", () => {
    expect(verkaeuferVollerName({})).toBe("");
    expect(verkaeuferVollerName(undefined)).toBe("");
  });
});

describe("Die beiden Namensfelder des Notarbogens", () => {
  it("teilt einen Firmennamen nicht", () => {
    const felder = verkaeuferNotarFelder({ art: "firma", name: "Musterbau Projektentwicklung GmbH" });
    expect(felder.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(felder.vorname).toBe("");
  });

  it("teilt auch ohne Wahl nicht", () => {
    // Das war der Fehler: Hier stand vorher Nachname „GmbH“.
    const felder = verkaeuferNotarFelder({ name: "Musterbau Projektentwicklung GmbH" });
    expect(felder.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(felder.vorname).toBe("");
  });

  it("führt eine Privatperson mit Vor- und Nachnamen", () => {
    const felder = verkaeuferNotarFelder({ art: "person", vorname: "Erika", name: "Mustermann" });
    expect(felder).toEqual({ name: "Mustermann", vorname: "Erika" });
  });

  it("hängt einen Vornamen an, sobald „Firma“ gewählt ist", () => {
    // Repariert die alte Teilung: Beide Hälften stehen wieder in einem Feld.
    const felder = verkaeuferNotarFelder({
      art: "firma", vorname: "Musterbau Projektentwicklung", name: "GmbH",
    });
    expect(felder.name).toBe("Musterbau Projektentwicklung GmbH");
    expect(felder.vorname).toBe("");
  });
});

describe("Die Beschriftung des Namensfeldes", () => {
  it("heißt Firma, Nachname oder neutral", () => {
    expect(verkaeuferNameLabel("firma")).toBe("Firma");
    expect(verkaeuferNameLabel("person")).toBe("Nachname");
    expect(verkaeuferNameLabel("")).toBe("Name oder Firma");
  });
});
