/**
 * Die Auswertungsmail bei einem Lead ohne zugeordneten Partner.
 *
 * Der Wortlaut und die Entscheidung ueber den Unterschriftsblock liegen bei
 * der Edge Function, weil sie dort gebraucht werden. Getestet werden sie hier,
 * weil Vitest nur unterhalb von src sucht, so wie bei der Bewerber-Eingangsmail.
 */
import { describe, expect, it } from "vitest";
import {
  auswertungPerson,
  naechsterSchrittZeile,
} from "../../supabase/functions/_shared/steuer-auswertung-text.ts";

describe("Lead ohne zugeordneten Partner", () => {
  it("hat keinen Ansprechpartner, also faellt der Unterschriftsblock weg", () => {
    // `undefined` heisst fuer die Vorlage `ohneUnterschrift`. Der Platzhalter
    // "MOREImmo Team" mit der allgemeinen Nummer soll gerade nicht erscheinen.
    expect(auswertungPerson({})).toBeUndefined();
    expect(auswertungPerson({ beraterName: "" })).toBeUndefined();
    expect(auswertungPerson({ beraterName: "   " })).toBeUndefined();
  });

  it("faellt auch bei einem leeren Berater-Objekt nicht auf einen leeren Block zurueck", () => {
    expect(auswertungPerson({ berater: {} })).toBeUndefined();
    expect(auswertungPerson({ berater: { telefon: "0171 1111111" } })).toBeUndefined();
  });

  it("gibt die Zusage weiter, ohne einen Namen zu nennen", () => {
    const zeile = naechsterSchrittZeile(undefined);
    expect(zeile).toBe("Einer unserer Berater meldet sich zeitnah bei dir für ein Erstgespräch.");
    // Die Zusage darf nicht wegfallen, nur der Name.
    expect(zeile).toContain("meldet sich zeitnah");
    expect(zeile).not.toContain("Dein Ansprechpartner");
  });
});

describe("Lead mit Partner", () => {
  it("behaelt seinen Unterschriftsblock", () => {
    const person = auswertungPerson({
      beraterName: "Christian Peetz",
      beraterEmail: "c.peetz@more.immo",
      beraterTelefon: "+49 1515 0275108",
    });
    expect(person).toEqual({
      name: "Christian Peetz",
      rolle: "Dein Ansprechpartner bei MOREImmo",
      telefon: "+49 1515 0275108",
      email: "c.peetz@more.immo",
      bildUrl: undefined,
    });
  });

  it("laesst das ausfuehrliche Berater-Objekt vorgehen", () => {
    const person = auswertungPerson({
      beraterName: "Alt",
      berater: { name: "Hermann Vogl", rolle: "Immobilienberater", telefon: "0171 2222222" },
    });
    expect(person?.name).toBe("Hermann Vogl");
    expect(person?.rolle).toBe("Immobilienberater");
  });

  it("zeigt dem Kunden keine Rollenkennung", () => {
    // "Vertriebspartner" ist eine Rolle im System und keine Berufsbezeichnung.
    // Siehe berufsbezeichnung.ts.
    const person = auswertungPerson({
      berater: { name: "Hermann Vogl", rolle: "Vertriebspartner" },
    });
    expect(person?.rolle).toBe("Dein Ansprechpartner bei MOREImmo");
  });

  it("nennt den Partner in der Zeile 'Wie es weitergeht'", () => {
    expect(naechsterSchrittZeile("Christian Peetz")).toBe(
      "Christian Peetz meldet sich zeitnah bei dir für ein Erstgespräch.",
    );
  });
});
