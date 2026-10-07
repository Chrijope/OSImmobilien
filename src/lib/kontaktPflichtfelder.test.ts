import { describe, it, expect } from "vitest";
import { fehlendePflichtfelder } from "@/lib/kontaktPflichtfelder";

/**
 * Die Adresse ist beim Anlegen eines Kontakts optional. Rutscht sie versehentlich
 * wieder in die Pflichtprüfung, blockiert der Dialog das Speichern, ohne dass es
 * an der Beschriftung sichtbar wäre.
 */

const vollstaendig = {
  anrede: "Herr",
  vorname: "Max",
  nachname: "Mustermann",
  email: "max@example.com",
  telefon: "+49 170 1234567",
  leadTyp: "manuell",
};

describe("fehlendePflichtfelder", () => {
  it("meldet nichts, wenn alle Pflichtfelder ausgefüllt sind", () => {
    expect(fehlendePflichtfelder(vollstaendig)).toEqual({});
  });

  it("lässt das Speichern ohne Adresse zu", () => {
    // Straße, Hausnummer, PLZ und Ort werden gar nicht erst übergeben.
    expect(fehlendePflichtfelder({ ...vollstaendig })).toEqual({});
  });

  it("meldet fehlenden Namen weiterhin", () => {
    expect(fehlendePflichtfelder({ ...vollstaendig, nachname: "   " })).toEqual({ nachname: true });
  });

  it("meldet fehlende Anrede, E-Mail und Telefon", () => {
    expect(fehlendePflichtfelder({ ...vollstaendig, anrede: "", email: "", telefon: "" })).toEqual({
      anrede: true,
      email: true,
      telefon: true,
    });
  });
});
