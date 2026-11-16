import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { fuelleFinanzierungsanfrage } from "./finanzierungsanfrage";

/** Erfundene Testpersonen, Ehepaar mit einer vermieteten Wohnung und einem Autokredit. */
const sa = {
  anrede: "Herr", titel: "Dr.", vorname: "Max", nachname: "Muster", geburtsdatum: "01.02.1985", geburtsland: "Deutschland",
  staatsangehoerigkeit: "deutsch", strasse: "Musterweg", hausnummer: "1", plz: "80331", ort: "München",
  telefon: "+49 151 1234567", email: "max@example.test", familienstand: "Verheiratet", gueterstand: "gesetzlich",
  steuerId: "12 345 678 901", bankkonten: [{ konto: "Girokonto", institut: "Testbank", iban: "DE89 3704 0044 0532 0130 00" }],
  beschaeftigungsart: "angestellt", taetigkeit: "Beamte/r",
  anstellung: { branche: "Öffentlicher Dienst", firma: "Land Bayern", berufsbezeichnung: "Lehrer", angestelltSeit: "01.09.2012", probezeit: "nein" },
  arbeitsvertragArt: "unbefristet", monatsgehaelter: "13",
  einkommen: { netto: "3.200", gewerbe: "", miet: "500", zinsen: "20", rente: "", kindergeld: "250", sonstige: "100", variabel: "150" },
  rentenbeginn: "01.09.2052", rentenanspruchGesetzlich: "1.800",
  mietart: "Zur Miete", mieteWarm: "1.100", mieteEntfaellt: "nein", privateKV: "0", versBU: "60", versRiester: "40",
  sonstigeAusgaben: "50", unterhalt: "",
  kinder: [{ name: "A", geburtsdatum: "01.01.2018" }],
  vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "20.000" }, { art: "Wertpapiere / Depot", institut: "", betrag: "15.000" }],
  immobilien: [{ eigentuemer: "", art: "ETW", adresse: "Testgasse 2", baujahr: "1990", grundstueckM2: "", wohnflaecheM2: "60", nutzung: "Vermietet", marktwert: "250.000", kaltmieteIst: "500", kaltmieteZukunft: "" }],
  kredite: [
    { art: "Baufinanzierung", kategorie: "immobilienkredit", rate: "700", restschuld: "150.000", laufzeitEnde: "01.01.2045" },
    { art: "Auto", kategorie: "ratenkredit", rate: "250", restschuld: "8.000", laufzeitEnde: "01.06.2028" },
  ],
  person2: true,
  person2Data: {
    anrede: "Frau", vorname: "Erika", nachname: "Muster", geburtsdatum: "03.04.1987", geburtsland: "Österreich",
    staatsangehoerigkeit: "andere", staatsangehoerigkeitAndere: "Österreichisch", familienstand: "Verheiratet",
    beschaeftigungsart: "selbstaendig", taetigkeit: "Freiberufler/in",
    selbstaendigkeit: { branche: "Grafikdesign", firma: "Studio E", selbstaendigSeit: "01.01.2019", anzahlMitarbeiter: "" },
    einkommen: { netto: "", gewerbe: "2.400", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
    bankkonten: [], vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "", betrag: "5.000" }], kredite: [],
  },
};

async function lies(pdf: Uint8Array) {
  const form = (await PDFDocument.load(pdf)).getForm();
  return {
    t: (n: string) => form.getTextField(n).getText(),
    a: (n: string) => form.getDropdown(n).getSelected()[0],
    o: (n: string) => form.getRadioGroup(n).getSelected(),
    h: (n: string) => form.getCheckBox(n).isChecked(),
  };
}

describe("Finanzierungsanfrage aus der Selbstauskunft", () => {
  // Kopie als Uint8Array: Unter jsdom erkennt pdf-lib den Node-Buffer nicht.
  const vorlage = new Uint8Array(readFileSync("public/vorlagen/finanzierungsanfrage-datenerfassung.pdf"));

  it("übernimmt Person, Beruf, Einnahmen und Ausgaben beider Antragsteller", async () => {
    const f = await lies(await fuelleFinanzierungsanfrage(vorlage, sa, null));
    expect(f.o("mainApplicant.sex")).toBe("M");
    expect(f.a("mainApplicant.title")).toBe("Dr");
    expect(f.t("mainApplicant.street")).toBe("Musterweg 1");
    expect(f.a("mainApplicant.birthCountry")).toBe("DE");
    expect(f.a("mainApplicant.maritalStatus")).toBe("verheirt");
    expect(f.a("mainApplicant.maritalPropertyStatus")).toBe("Zugew");
    expect(f.t("mainApplicant.iban")).toBe("DE89 3704 0044 0532 0130 00");
    expect(f.a("mainApplicant.jobStatus")).toBe("Beamter");
    expect(f.a("mainApplicant.lineOfBusiness")).toBe("Oeffentl");
    expect(f.t("mainApplicant.netSalary")).toBe("3.200,00");
    expect(f.t("mainApplicant.variableIncome")).toBe("150,00");
    expect(f.t("mainApplicant.otherIncome")).toBe("120,00");
    expect(f.t("mainApplicant.numberOfPayments")).toBe("13");
    expect(f.t("mainApplicant.pensionEntryDate")).toBe("01.09.2052");
    expect(f.t("mainApplicant.lifeInsuranceBurden")).toBe("100,00");
    expect(f.o("mainApplicant.rentNoLonger")).toBe("false");
    expect(f.t("mainApplicant.numberOfChilds")).toBe("1");
    // Person 2: Österreich, freie Branche wird „Sonstige“
    expect(f.o("addApplicant.sex")).toBe("F");
    expect(f.a("addApplicant.birthCountry")).toBe("AT");
    expect(f.a("addApplicant.nationality")).toBe("AT");
    expect(f.a("addApplicant.jobStatus")).toBe("Freib");
    expect(f.a("addApplicant.lineOfBusiness")).toBe("Sonstige");
    expect(f.t("addApplicant.selfEmplIncome")).toBe("2.400,00");
    expect(f.a("venture.partner")).toBe("Ehepartner");
  });

  it("übernimmt Vermögen, Immobilien, Kredite und das Objekt", async () => {
    const objekt = { strasse: "Hauffstraße 5", plz: "70190", ort: "Stuttgart", baujahr: 1958, wohnflaeche: 52.4, kaufpreis: 289000 };
    const f = await lies(await fuelleFinanzierungsanfrage(vorlage, sa, objekt));
    expect(f.t("capital.equityCash")).toBe("25.000,00");
    expect(f.t("capital.equityStocks")).toBe("15.000,00");
    expect(f.t("capital.properties.number")).toBe("1");
    expect(f.t("capital.allProperties.rentedLivingArea.sum")).toBe("60");
    expect(f.t("capital.allProperties.residualDebt.sum")).toBe("150.000,00");
    expect(f.t("capital.credits1.burden")).toBe("250,00");
    expect(f.t("capital.credits1.until")).toBe("01.06.2028");
    expect(f.t("estate.street")).toBe("Hauffstraße 5");
    expect(f.t("estate.areaTotal")).toBe("52,4");
    expect(f.t("venture.priceBuilding")).toBe("289.000,00");
    expect(f.a("venture.reason")).toBe("KaufBest");
    expect(f.o("estate.utilization")).toBe("fremd");
  });

  it("ohne Person 2 bleibt der zweite Antragsteller leer", async () => {
    const f = await lies(await fuelleFinanzierungsanfrage(vorlage, { ...sa, person2: false }, null));
    expect(f.t("addApplicant.fname") || "").toBe("");
    expect(f.a("venture.partner")).toBe("Nein");
  });
});
