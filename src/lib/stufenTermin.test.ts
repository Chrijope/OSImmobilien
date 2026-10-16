import { describe, expect, it } from "vitest";
import {
  brauchtStufenTermin, pruefeStufenTermin, stufeNachStattgefunden, stufenTerminDetails,
  terminFehlerText, terminStufeAusTitel, TERMIN_STUFEN, vereinbarenSchluessel,
} from "./stufenTermin";
import { fehlendeMindestunterlagen, mindestunterlagenText } from "./mindestunterlagen";

/*
 * Besichtigung und Termin Bankgutachter (16.10.2026): Setzen nur mit Termin,
 * „stattgefunden" rueckt vor, nie zurueck.
 */

// 16.10.2026, 12:00 Uhr Berlin (10:00 UTC).
const JETZT = new Date("2026-10-16T10:00:00Z");

describe("Welche Stufen einen Termin brauchen", () => {
  it("nur Besichtigung und Termin Bankgutachter", () => {
    expect(brauchtStufenTermin("besichtigung")).toBe(true);
    expect(brauchtStufenTermin("bankgutachter")).toBe(true);
    for (const s of ["reservierung", "finanzierung", "notar", "objektauswahl", "", null, undefined]) {
      expect(brauchtStufenTermin(s), String(s)).toBe(false);
    }
  });

  it("traegt die Titel aus der Strategie", () => {
    expect(TERMIN_STUFEN.besichtigung.titel).toBe("Besichtigung");
    expect(TERMIN_STUFEN.bankgutachter.titel).toBe("Termin Bankgutachter");
  });
});

describe("Pruefung im Termin-Fenster", () => {
  it("verlangt Datum und Uhrzeit", () => {
    expect(pruefeStufenTermin({ datum: "", uhrzeit: "10:00" }, JETZT)).toBe("Bitte ein Datum angeben.");
    expect(pruefeStufenTermin({ datum: "2026-10-20", uhrzeit: "" }, JETZT)).toBe("Bitte eine Uhrzeit angeben.");
  });

  it("weist ungueltige und vergangene Termine ab", () => {
    expect(pruefeStufenTermin({ datum: "20.10.2026", uhrzeit: "10:00" }, JETZT)).toBe("Datum oder Uhrzeit ist ungültig.");
    expect(pruefeStufenTermin({ datum: "2026-10-16", uhrzeit: "11:00" }, JETZT)).toBe("Der Termin muss in der Zukunft liegen.");
  });

  it("laesst einen kuenftigen Termin durch, Ort und Notiz sind freiwillig", () => {
    expect(pruefeStufenTermin({ datum: "2026-10-16", uhrzeit: "13:00" }, JETZT)).toBeNull();
    expect(pruefeStufenTermin({ datum: "2026-10-20", uhrzeit: "09:30", ort: "", notiz: "" }, JETZT)).toBeNull();
  });

  it("schreibt Ort als Treffpunkt und das Investment in die Details", () => {
    expect(stufenTerminDetails({ datum: "x", uhrzeit: "y", ort: " Hauptstr. 1 ", notiz: "Schluessel holen" }, "Investment 2"))
      .toBe("Schluessel holen\nTreffpunkt: Hauptstr. 1\nInvestment: Investment 2");
    expect(stufenTerminDetails({ datum: "x", uhrzeit: "y" })).toBeUndefined();
  });

  it("zeigt die Meldung der Datenbank, auch ohne Error-Objekt", () => {
    expect(terminFehlerText({ message: "Diese Zeit ist bereits vergeben" })).toBe("Diese Zeit ist bereits vergeben");
    expect(terminFehlerText(null)).toBe("Der Termin konnte nicht gespeichert werden.");
  });
});

describe("Vorruecken nach „stattgefunden“", () => {
  it("Besichtigung fuehrt auf Termin Bankgutachter, der Bankgutachter auf Finanzierung", () => {
    expect(stufeNachStattgefunden("Besichtigung", "besichtigung")).toBe("bankgutachter");
    expect(stufeNachStattgefunden("Termin Bankgutachter", "bankgutachter")).toBe("finanzierung");
    // Auch wenn die Stufe noch davor steht, etwa noch auf Reservierung.
    expect(stufeNachStattgefunden("Besichtigung", "reservierung")).toBe("bankgutachter");
  });

  it("wirft nie zurueck und laesst beendete Vorgaenge stehen", () => {
    expect(stufeNachStattgefunden("Besichtigung", "finanzierung")).toBeNull();
    expect(stufeNachStattgefunden("Besichtigung", "bankgutachter")).toBeNull();
    expect(stufeNachStattgefunden("Termin Bankgutachter", "notar")).toBeNull();
    expect(stufeNachStattgefunden("Besichtigung", "verloren")).toBeNull();
  });

  it("erkennt den Termin am Titel, andere Termine ruecken nichts", () => {
    expect(terminStufeAusTitel(" besichtigung ")).toBe("besichtigung");
    expect(terminStufeAusTitel("Objektvorstellung")).toBeNull();
    expect(stufeNachStattgefunden("Beratungsgespräch", "besichtigung")).toBeNull();
  });

  it("trennt die Aufgaben „… vereinbaren“ je Investment", () => {
    expect(vereinbarenSchluessel("besichtigung", "inv-1")).toBe("besichtigung_vereinbaren:inv-1");
    expect(vereinbarenSchluessel("bankgutachter", "inv-1")).not.toBe(vereinbarenSchluessel("besichtigung", "inv-1"));
  });
});

describe("Unterlagen vor der Objektvorstellung", () => {
  it("verlangt Ausweis und letzte Gehaltsabrechnung, hochgeladen oder freigegeben", () => {
    expect(fehlendeMindestunterlagen({})).toEqual(["Personalausweis", "Letzter Gehaltsnachweis"]);
    expect(fehlendeMindestunterlagen({ docStatuses: { Personalausweis: "approved", "Letzter Gehaltsnachweis": "uploaded" } })).toEqual([]);
    expect(fehlendeMindestunterlagen({ docStatuses: { Personalausweis: "rejected" } }))
      .toEqual(["Personalausweis", "Letzter Gehaltsnachweis"]);
  });

  it("braucht bei Selbststaendigen und Selbstfinanzierern nur den Ausweis", () => {
    expect(fehlendeMindestunterlagen({ saSnapshot: { beschaeftigungsart: "selbstaendig" } })).toEqual(["Personalausweis"]);
    expect(fehlendeMindestunterlagen({ selbstauskunftEntfaellt: { aktiv: true }, docStatuses: { Personalausweis: "uploaded" } })).toEqual([]);
  });

  it("nennt die Unterlagen im Text so, wie der Kunde sie kennt", () => {
    expect(mindestunterlagenText(["Personalausweis", "Letzter Gehaltsnachweis"])).toBe("Personalausweis, letzte Gehaltsabrechnung");
  });
});
