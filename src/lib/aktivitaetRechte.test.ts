import { describe, it, expect } from "vitest";
import {
  darfEintragEntfernen,
  darfVorgangBearbeiten,
  istEigenerEintrag,
  istSystemEintrag,
} from "@/lib/aktivitaetRechte";

/** Kurzform fuer einen Verlaufseintrag, nur mit den Feldern der Regeln. */
function eintrag(over: Partial<{ id: string; von: string; benutzerId?: string }> = {}) {
  return { id: "a1", von: "Julian Meyer", benutzerId: "u-julian", ...over };
}

const vertriebspartner = { rolle: "vertriebspartner", benutzerId: "u-julian", name: "Julian Meyer" };
const andererVp = { rolle: "vertriebspartner", benutzerId: "u-sarah", name: "Sarah Klein" };
const vertriebsleiter = { rolle: "vertriebsleiter", benutzerId: "u-daniel", name: "Daniel Reuter" };
const admin = { rolle: "admin", benutzerId: "u-chris", name: "Christian Peetz" };

describe("istSystemEintrag", () => {
  it("erkennt Protokollzeilen am Praefix", () => {
    expect(istSystemEintrag({ id: "log-7", von: "Julian Meyer" })).toBe(true);
  });
  it("erkennt den Verfasser System, gross wie klein", () => {
    expect(istSystemEintrag({ id: "a1", von: "System" })).toBe(true);
    expect(istSystemEintrag({ id: "a1", von: " system " })).toBe(true);
  });
  it("laesst einen von Hand geschriebenen Eintrag in Ruhe", () => {
    expect(istSystemEintrag({ id: "a1", von: "Julian Meyer" })).toBe(false);
  });
});

describe("istEigenerEintrag", () => {
  it("vergleicht bei neuen Eintraegen die Kennung", () => {
    expect(istEigenerEintrag(eintrag(), vertriebspartner)).toBe(true);
    expect(istEigenerEintrag(eintrag(), andererVp)).toBe(false);
  });
  it("faellt beim Altbestand ohne Kennung auf den Namen zurueck", () => {
    const alt = eintrag({ benutzerId: undefined });
    expect(istEigenerEintrag(alt, vertriebspartner)).toBe(true);
    expect(istEigenerEintrag(alt, andererVp)).toBe(false);
  });
  it("begruendet kein Recht, wenn beide Namen leer sind", () => {
    expect(istEigenerEintrag({ von: "", benutzerId: undefined }, { rolle: "vertriebspartner", name: "" })).toBe(false);
  });
});

describe("darfVorgangBearbeiten (Stift an Aufgabe und Termin)", () => {
  it("gibt dem Vertriebspartner seine eigenen Vorgaenge", () => {
    expect(darfVorgangBearbeiten(eintrag(), vertriebspartner)).toBe(true);
  });
  it("laesst ihn fremde Vorgaenge nicht anfassen", () => {
    expect(darfVorgangBearbeiten(eintrag(), andererVp)).toBe(false);
  });
  it("gibt Admin und Inhaber auch fremde Vorgaenge", () => {
    expect(darfVorgangBearbeiten(eintrag(), admin)).toBe(true);
  });
  it("haelt Systemeintraege fuer alle unveraenderlich", () => {
    expect(darfVorgangBearbeiten(eintrag({ von: "System" }), admin)).toBe(false);
    expect(darfVorgangBearbeiten(eintrag({ id: "log-7" }), admin)).toBe(false);
  });
});

describe("darfEintragEntfernen (Papierkorb)", () => {
  it("zeigt dem Vertriebspartner den Papierkorb an seinen eigenen Eintraegen", () => {
    expect(darfEintragEntfernen(eintrag(), vertriebspartner)).toBe(true);
  });
  it("verweigert ihm fremde Eintraege", () => {
    expect(darfEintragEntfernen(eintrag(), andererVp)).toBe(false);
  });
  it("verweigert ihm Systemeintraege", () => {
    expect(darfEintragEntfernen(eintrag({ von: "System" }), vertriebspartner)).toBe(false);
  });
  it("laesst der Leitung wie bisher alles ausser dem Protokoll", () => {
    expect(darfEintragEntfernen(eintrag(), vertriebsleiter)).toBe(true);
    expect(darfEintragEntfernen(eintrag({ von: "System" }), vertriebsleiter)).toBe(true);
    expect(darfEintragEntfernen(eintrag({ id: "log-7" }), vertriebsleiter)).toBe(false);
    expect(darfEintragEntfernen(eintrag({ id: "log-7" }), admin)).toBe(false);
  });
  it("gilt auch fuer Waisen aus der Aufgabenliste", () => {
    const waise = eintrag({ id: "aufgabe-42" });
    expect(darfEintragEntfernen(waise, vertriebspartner)).toBe(true);
    expect(darfEintragEntfernen(waise, andererVp)).toBe(false);
  });
  it("zeigt beim Altbestand ohne Kennung keinen Papierkorb, weil die Datenbank ihn ablehnen wuerde", () => {
    // Die Loeschregel 20260916240000 vergleicht `benutzer_id` mit `auth.uid()`.
    // Ein Namensvergleich waere hier ein Knopf, der verlaesslich scheitert.
    const alt = eintrag({ benutzerId: undefined });
    expect(darfEintragEntfernen(alt, vertriebspartner)).toBe(false);
    // Die Leitung darf ihn weiterhin entfernen.
    expect(darfEintragEntfernen(alt, vertriebsleiter)).toBe(true);
  });
});
