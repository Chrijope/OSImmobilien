import { describe, it, expect } from "vitest";
import {
  mfaZustandAusListe,
  mfaZustandErmitteln,
  mfaSchritt,
  type MfaFaktorListe,
} from "./mfaZustand";

/**
 * Die Regel in einem Satz: Maßgeblich ist die Faktorliste, nicht die
 * Sicherheitsstufe der Sitzung.
 *
 * Anlass war ein ausgesperrter Kunde. Die Oberfläche fragte die Sitzung, der
 * Server die Faktorliste. Die Sitzung kannte den frisch bestätigten Faktor
 * nicht, also bot die Oberfläche die Einrichtung an und der Server lehnte sie
 * mit "bereits aktiviert" ab. Der Kunde kam nicht mehr weiter.
 */
describe("mfaZustandAusListe", () => {
  it("erkennt einen verifizierten Faktor und liefert seine Kennung", () => {
    const liste: MfaFaktorListe = {
      totp: [{ id: "f1", status: "verified", factor_type: "totp" }],
      all: [{ id: "f1", status: "verified", factor_type: "totp" }],
    };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "verifiziert", factorId: "f1" });
  });

  it("bevorzugt den verifizierten Faktor, auch wenn daneben ein halbfertiger liegt", () => {
    const liste: MfaFaktorListe = {
      totp: [
        { id: "alt", status: "unverified", factor_type: "totp" },
        { id: "f1", status: "verified", factor_type: "totp" },
      ],
    };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "verifiziert", factorId: "f1" });
  });

  it("erkennt einen halbfertigen Faktor als abgebrochenen Versuch", () => {
    const liste: MfaFaktorListe = {
      totp: [{ id: "f2", status: "unverified", factor_type: "totp" }],
    };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "halbfertig" });
  });

  it("erkennt eine leere Liste als 'kein Faktor'", () => {
    expect(mfaZustandAusListe({ totp: [], all: [] })).toEqual({ art: "keiner" });
    expect(mfaZustandAusListe({})).toEqual({ art: "keiner" });
  });

  it("wertet eine fehlende Antwort als unbekannt, nicht als 'kein Faktor'", () => {
    expect(mfaZustandAusListe(null)).toEqual({ art: "unbekannt" });
    expect(mfaZustandAusListe(undefined)).toEqual({ art: "unbekannt" });
  });

  it("meldet unbekannt, wenn ein verifizierter Faktor ohne Kennung kommt", () => {
    // Ohne Kennung lässt sich kein Code abfragen. Eine Einrichtung anzubieten
    // wäre falsch, der Server würde sie ablehnen.
    const liste: MfaFaktorListe = { totp: [{ status: "verified", factor_type: "totp" }] };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "unbekannt" });
  });

  it("ignoriert Faktoren anderer Art in 'all'", () => {
    const liste: MfaFaktorListe = {
      totp: [],
      all: [{ id: "p1", status: "verified", factor_type: "phone" }],
    };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "keiner" });
  });

  it("zählt denselben Faktor aus 'totp' und 'all' nur einmal", () => {
    const liste: MfaFaktorListe = {
      totp: [{ id: "f3", status: "unverified", factor_type: "totp" }],
      all: [{ id: "f3", status: "unverified", factor_type: "totp" }],
    };
    expect(mfaZustandAusListe(liste)).toEqual({ art: "halbfertig" });
  });
});

describe("mfaZustandErmitteln", () => {
  it("nimmt die Sitzungsantwort, wenn sie brauchbar ist", async () => {
    const zustand = await mfaZustandErmitteln({
      ausSitzung: async () => ({ totp: [{ id: "f1", status: "verified" }] }),
      vomServer: async () => {
        throw new Error("darf nicht gefragt werden");
      },
    });
    expect(zustand).toEqual({ art: "verifiziert", factorId: "f1" });
  });

  it("fragt den Server, wenn die Sitzung nicht antwortet", async () => {
    const zustand = await mfaZustandErmitteln({
      ausSitzung: async () => {
        throw new Error("offline");
      },
      vomServer: async () => ({ totp: [{ id: "f9", status: "verified" }] }),
    });
    expect(zustand).toEqual({ art: "verifiziert", factorId: "f9" });
  });

  it("meldet unbekannt, wenn auch der Server nicht antwortet", async () => {
    const zustand = await mfaZustandErmitteln({
      ausSitzung: async () => {
        throw new Error("offline");
      },
      vomServer: async () => {
        throw new Error("Edge Function nicht erreichbar");
      },
    });
    expect(zustand).toEqual({ art: "unbekannt" });
  });

  it("meldet unbekannt, wenn es gar keine zweite Quelle gibt", async () => {
    const zustand = await mfaZustandErmitteln({
      ausSitzung: async () => {
        throw new Error("offline");
      },
    });
    expect(zustand).toEqual({ art: "unbekannt" });
  });
});

describe("mfaSchritt", () => {
  it("fragt bei verifiziertem Faktor den Code ab und bietet nie eine Einrichtung an", () => {
    expect(mfaSchritt({ art: "verifiziert", factorId: "f1" }, false)).toBe("challenge");
  });

  it("lässt durch, wenn die Sitzung den zweiten Faktor schon verwendet hat", () => {
    expect(mfaSchritt({ art: "verifiziert", factorId: "f1" }, true)).toBe("ok");
  });

  it("lässt einen abgebrochenen Versuch neu einrichten", () => {
    expect(mfaSchritt({ art: "halbfertig" }, false)).toBe("einrichten");
  });

  it("führt ohne Faktor in die Einrichtung", () => {
    expect(mfaSchritt({ art: "keiner" }, false)).toBe("einrichten");
  });

  it("gibt bei unbekanntem Zustand keine Empfehlung", () => {
    // Wichtig: hier darf nicht "einrichten" herauskommen. Genau das war der
    // Weg in die Sackgasse, weil der Server die Einrichtung dann ablehnt.
    expect(mfaSchritt({ art: "unbekannt" }, false)).toBe("unklar");
    expect(mfaSchritt({ art: "unbekannt" }, true)).toBe("unklar");
  });
});
