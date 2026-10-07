import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Wer in der Mail "Neue Nachricht" wo steht.
 *
 * Zwei Fehler sind hier moeglich, und beide fallen erst im Postfach auf:
 * Anrede und Betreff vertauscht, weil die Vorlagenfelder `kundeName` und
 * `beraterName` heissen, aber Empfaenger und Absender bedeuten. Und eine
 * Unterschrift, die auf "Ansprechpartner bei MOREImmo" mit office@more.immo
 * zurueckfaellt, weil der Berater nur ueber seinen Namen gesucht wurde.
 */

const nutzerliste: Array<Record<string, unknown>> = [];
const PARTNER = {
  id: "u-1",
  name: "Christian Peetz",
  rollen: ["vertriebspartner"],
  email: "c.peetz@more.immo",
  telefon: "+49 1515 0275108",
  bildUrl:
    "https://irwdgutegmivbtgmftyc.supabase.co/storage/v1/object/public/avatars/u-1/avatar.jpg?t=1",
};
vi.mock("./loadAllUsers", () => ({ loadAllUsers: () => nutzerliste }));

import { chatBenachrichtigungDaten, chatVorschau } from "./chatBenachrichtigung";

beforeEach(() => {
  nutzerliste.splice(0, nutzerliste.length, { ...PARTNER });
});

describe("chatBenachrichtigungDaten", () => {
  it("schreibt den Kunden in die Anrede und den Partner als Absender, wenn der Partner schreibt", () => {
    const daten = chatBenachrichtigungDaten({
      empfaengerName: "Otto Hans",
      absenderName: "Christian Peetz",
      absenderId: "u-1",
      nachricht: "Die Unterlagen sind geprüft.",
      portalUrl: "https://portal.more.immo/kunde/chat",
    });
    // kundeName ist die Anrede des Empfaengers.
    expect(daten.kundeName).toBe("Otto Hans");
    // beraterName traegt Titel und Betreff, also den Absender.
    expect(daten.beraterName).toBe("Christian Peetz");
    expect(daten.anPartner).toBeUndefined();
  });

  it("schreibt den Partner in die Anrede und den Kunden als Absender, wenn der Kunde schreibt", () => {
    const daten = chatBenachrichtigungDaten({
      empfaengerName: "Christian Peetz",
      absenderName: "Otto Hans",
      nachricht: "Kurze Rückfrage zur Wohnung.",
      portalUrl: "https://portal.more.immo/chat?id=1",
      anPartner: true,
    });
    expect(daten.kundeName).toBe("Christian Peetz");
    expect(daten.beraterName).toBe("Otto Hans");
    expect(daten.anPartner).toBe(true);
    // In dieser Richtung bewusst ohne Ansprechpartner: Der schreibende Kunde
    // waere sonst sein eigener.
    expect(daten.berater).toBeUndefined();
    expect(daten.beraterUserId).toBeUndefined();
  });

  it("findet den Absender über die Kennung, auch wenn der Name abweicht", () => {
    const daten = chatBenachrichtigungDaten({
      empfaengerName: "Otto Hans",
      absenderName: "Christian Peez",
      absenderId: "u-1",
      nachricht: "Test",
      portalUrl: "https://portal.more.immo/kunde/chat",
    });
    expect(daten.beraterUserId).toBe("u-1");
    expect(daten.beraterName).toBe("Christian Peetz");
    expect(daten.beraterEmail).toBe("c.peetz@more.immo");
    expect(daten.beraterPosition).toBe("Immobilienberater");
    expect(daten.berater).toMatchObject({ bildUrl: PARTNER.bildUrl });
  });

  it("bleibt nicht still, wenn der Absender nicht gefunden wird", () => {
    const warnung = vi.spyOn(console, "warn").mockImplementation(() => {});
    const daten = chatBenachrichtigungDaten({
      empfaengerName: "Otto Hans",
      absenderName: "Hermann Vogel",
      nachricht: "Test",
      portalUrl: "https://portal.more.immo/kunde/chat",
    });
    expect(daten.beraterName).toBe("Hermann Vogel");
    expect(daten.berater).toBeUndefined();
    expect(warnung).toHaveBeenCalled();
    warnung.mockRestore();
  });

  it("kürzt den Auszug auf 200 Zeichen", () => {
    const lang = "a".repeat(250);
    expect(chatVorschau(lang)).toHaveLength(201);
    expect(chatVorschau(lang).endsWith("…")).toBe(true);
    expect(chatVorschau("kurz")).toBe("kurz");
  });
});
