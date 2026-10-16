import { describe, expect, it } from "vitest";
import {
  besichtigungsVorschlag, brauchtStufenTermin, eingetragenerStufenTermin, finanzierungPositiv, pruefeStufenTermin,
  stufeNachStattgefunden, stufenTerminDetails, terminFehlerText, terminStufeAusTitel, TERMIN_STUFEN, treffpunktAusText,
  vereinbarenSchluessel, vortagIso,
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
  it("Bankgutachter fuehrt auf Besichtigung, die Besichtigung auf Notar", () => {
    expect(stufeNachStattgefunden("Termin Bankgutachter", "bankgutachter")).toBe("besichtigung");
    expect(stufeNachStattgefunden("Besichtigung", "besichtigung")).toBe("notar");
    // Auch wenn die Stufe noch davor steht, etwa noch auf Finanzierung.
    expect(stufeNachStattgefunden("Termin Bankgutachter", "finanzierung")).toBe("besichtigung");
  });

  it("wirft nie zurueck und laesst beendete Vorgaenge stehen", () => {
    expect(stufeNachStattgefunden("Termin Bankgutachter", "besichtigung")).toBeNull();
    expect(stufeNachStattgefunden("Termin Bankgutachter", "notar")).toBeNull();
    expect(stufeNachStattgefunden("Besichtigung", "notar")).toBeNull();
    expect(stufeNachStattgefunden("Besichtigung", "faelligkeit")).toBeNull();
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

describe("Besichtigung am Notartag oder am Vortag", () => {
  it("schlaegt den Notartermin vor, ohne Notartermin nichts", () => {
    expect(besichtigungsVorschlag("2026-11-05", "10:30")).toEqual({ datum: "2026-11-05", uhrzeit: "10:30" });
    expect(besichtigungsVorschlag("2026-11-05T00:00:00", undefined)).toEqual({ datum: "2026-11-05", uhrzeit: "" });
    expect(besichtigungsVorschlag(undefined, "10:30")).toBeNull();
    expect(besichtigungsVorschlag("05.11.2026", "10:30")).toBeNull();
  });

  it("rechnet den Vortag ueber Monats- und Jahresgrenzen", () => {
    expect(vortagIso("2026-11-05")).toBe("2026-11-04");
    expect(vortagIso("2026-11-01")).toBe("2026-10-31");
    expect(vortagIso("2027-01-01")).toBe("2026-12-31");
  });
});

describe("Finanzierung positiv", () => {
  it("ab einem Finanzierungsangebot oder unterschriebenem Darlehensvertrag", () => {
    expect(finanzierungPositiv({ angebote: [] })).toBe(false);
    expect(finanzierungPositiv(null)).toBe(false);
    expect(finanzierungPositiv({ angebote: [{ dokumente: [{ name: "Finanzierungsangebot", status: "none" }] }] })).toBe(false);
    expect(finanzierungPositiv({ angebote: [{ dokumente: [{ name: "Finanzierungsangebot", status: "uploaded" }] }] })).toBe(true);
    expect(finanzierungPositiv({ angebote: [{ dokumente: [{ name: "Darlehensvertrag", status: "uploaded" }] }] })).toBe(false);
    expect(finanzierungPositiv({ angebote: [{ dokumente: [{ name: "Darlehensvertrag", status: "signed" }] }] })).toBe(true);
  });
});

describe("Termin Bankgutachter im Abschnitt Finanzierung", () => {
  const aufgabe = (f: Record<string, unknown>) => ({ investmentId: "inv-1", titel: "Termin Bankgutachter", status: "offen", ...f });

  it("zeigt den zuletzt eingetragenen Termin dieses Investments mit Ort und Eintragendem", () => {
    const termin = eingetragenerStufenTermin([
      aufgabe({ faelligAm: "2026-10-20", uhrzeit: "09:00", beschreibung: "x\nTreffpunkt: Alt", erstelltVonName: "A" }),
      aufgabe({ faelligAm: "2026-10-22", uhrzeit: "14:30:00", beschreibung: "Termin Bankgutachter mit Erika\nTreffpunkt: Hauptstr. 1\nInvestment: Investment 1", erstelltVonName: "Backoffice" }),
      aufgabe({ investmentId: "inv-2", faelligAm: "2026-12-01", uhrzeit: "09:00" }),
      aufgabe({ faelligAm: "2026-12-01", uhrzeit: "09:00", status: "abgesagt" }),
      aufgabe({ titel: "Besichtigung", faelligAm: "2026-12-01", uhrzeit: "09:00" }),
    ], "inv-1", "bankgutachter");
    expect(termin).toEqual({ datum: "2026-10-22", uhrzeit: "14:30", ort: "Hauptstr. 1", eingetragenVon: "Backoffice", erledigt: false });
  });

  it("ohne Termin null", () => {
    expect(eingetragenerStufenTermin([], "inv-1", "bankgutachter")).toBeNull();
    expect(treffpunktAusText(undefined)).toBe("");
  });
});
