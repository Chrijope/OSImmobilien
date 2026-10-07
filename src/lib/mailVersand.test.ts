/**
 * Diese Datei prueft nicht das Verhalten, sondern den Typ.
 *
 * Der Sinn von `sendeVorlagenMail` ist, dass ein falscher oder fehlender
 * Feldname schon bei `npx tsc -b` auffaellt und nicht erst beim Empfaenger.
 * Genau das laesst sich mit einem Vitest-Lauf nicht zeigen: Vitest entfernt
 * die Typen, es prueft sie nicht.
 *
 * Deshalb stehen hier `@ts-expect-error`-Zeilen. Sie drehen die Pruefung um:
 * Meldet der Compiler an dieser Stelle KEINEN Fehler mehr, ist die
 * `@ts-expect-error`-Zeile selbst der Fehler. Die Bruecke kann also nicht
 * still kaputtgehen, ohne dass die Typpruefung rot wird.
 *
 * Der eine echte Testfall darunter sorgt nur dafuer, dass Vitest die Datei
 * nicht als leer ansieht.
 */
import { describe, it, expect } from "vitest";
import type { MailAuftrag } from "./mailVersand";

type FaelligkeitAuftrag = MailAuftrag<"faelligkeit-hochgeladen">;

// Richtig: alle Pflichtfelder da, kein unbekanntes Feld.
const gueltig: FaelligkeitAuftrag = {
  vorlage: "faelligkeit-hochgeladen",
  empfaenger: "backoffice@example.com",
  idempotenzSchluessel: "faelligkeit-1",
  felder: {
    kundeName: "Max Mustermann",
    faelligkeitsdatum: "22. September 2026",
    objektName: "Beispielstraße 1",
    dokumentUrl: "https://example.com/nachweis.pdf",
    hochgeladenVon: "Backoffice",
    crmUrl: "https://example.com/kunden/1",
  },
};

// Falsch: `portalUrl` kennt die Vorlage nicht mehr. Genau so lag der Fehler
// vor dieser Aenderung im System, nur ohne Warnung.
const unbekanntesFeld: FaelligkeitAuftrag = {
  vorlage: "faelligkeit-hochgeladen",
  empfaenger: "backoffice@example.com",
  idempotenzSchluessel: "faelligkeit-2",
  felder: {
    kundeName: "Max Mustermann",
    faelligkeitsdatum: "22. September 2026",
    // @ts-expect-error unbekanntes Feld, die Vorlage kennt kein portalUrl
    portalUrl: "https://example.com/kunde/investments",
  },
};

// Falsch: das Pflichtfeld `faelligkeitsdatum` fehlt. Ohne Datum stimmt auch
// der Betreff nicht mehr.
// @ts-expect-error faelligkeitsdatum fehlt
const fehlendesPflichtfeld: FaelligkeitAuftrag["felder"] = {
  kundeName: "Max Mustermann",
};

describe("Feldliste der Mailvorlagen", () => {
  it("haelt die Beispiele bereit, die der Compiler prueft", () => {
    expect(gueltig.vorlage).toBe("faelligkeit-hochgeladen");
    expect(unbekanntesFeld.felder.kundeName).toBe("Max Mustermann");
    expect(fehlendesPflichtfeld.kundeName).toBe("Max Mustermann");
  });
});
