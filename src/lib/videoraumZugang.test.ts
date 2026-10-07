import { describe, it, expect } from "vitest";
import { isUrlAllowedForRole } from "@/lib/sidebarPermissions";
import type { UserRole } from "@/types/user";
import { CHRISTIAN_PEETZ_ID } from "@/lib/leadPool";

/**
 * Der eigene Videoraum ist in Erprobung. Seit dem 27.09.2026 oeffnet ihn nur
 * Christian Peetz in der Rolle admin, alle anderen sehen ihn noch nicht.
 *
 * Der Test sichert genau diese Sperre ab. Faellt sie beim Aufraeumen
 * versehentlich weg, waere die Seite fuer den ganzen Vertrieb sichtbar,
 * ohne dass es jemandem auffaellt.
 */

const CHRISTIAN = { userId: CHRISTIAN_PEETZ_ID };
const GESPERRT: UserRole[] = [
  "admin",
  "inhaber",
  "vertriebspartner",
  "setterin",
  "buchhaltung",
  "objektpartner",
  "finanzierungspartner",
  "hausverwaltung",
  "kunde",
  "tippgeber",
];

describe("Videoraum: Zugang bis zur Freigabe", () => {
  it("Christian darf den Videoraum als admin oeffnen", () => {
    expect(isUrlAllowedForRole("/videocall", "admin", undefined, null, CHRISTIAN)).toBe(true);
  });

  it.each(GESPERRT)("%s darf den Videoraum nicht oeffnen", (rolle) => {
    expect(isUrlAllowedForRole("/videocall", rolle)).toBe(false);
  });

  it("sperrt auch die Unterseiten von Raum und Buchungen", () => {
    expect(isUrlAllowedForRole("/videocall/raum/abc-123", "vertriebspartner")).toBe(false);
    expect(isUrlAllowedForRole("/videocall/raum/abc-123", "admin", undefined, null, CHRISTIAN)).toBe(true);
    expect(isUrlAllowedForRole("/videocall/raum/abc-123", "admin")).toBe(false);
    expect(isUrlAllowedForRole("/videocall/buchungen", "vertriebspartner")).toBe(false);
    expect(isUrlAllowedForRole("/videocall/einstellungen", "vertriebspartner")).toBe(false);
  });

  it("sperrt auch die alte Adresse aus der Erprobung", () => {
    // /videoraum leitet nur weiter, darf aber niemandem sonst offenstehen.
    expect(isUrlAllowedForRole("/videoraum", "vertriebspartner")).toBe(false);
  });

  it("laesst sich nicht ueber individuelle Berechtigungen aushebeln", () => {
    // Sperren gehen jeder Freigabe vor, auch einer per Hand gesetzten.
    expect(isUrlAllowedForRole("/videocall", "vertriebspartner", ["/videocall"])).toBe(false);
  });
});
