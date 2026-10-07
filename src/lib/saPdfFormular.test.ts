import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { saDatenAusPdfFormular, fuelleSaFormularPdf, saDeckblattText, pdfFelderAusSaDaten } from "./saPdfFormular";
import { EMPTY_DATA, EMPTY_PERSON, type SaKredit, type SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import { KREDIT_AUSWAHL } from "@/lib/finanzierbarkeitUtils";
import { getBruttoFromSA } from "@/lib/steuerHelper";

/**
 * Fuellt die echte Formular-PDF aus public/dokumente/ wie ein Kunde am
 * Computer und prueft, dass das Auslesen alle Angaben korrekt in die
 * Selbstauskunft-Struktur uebersetzt. Damit bricht der Test, sobald die
 * Feldnamen der PDF und die Zuordnung in saPdfFormular auseinanderlaufen.
 */

let ausgefuellt: ArrayBuffer;

beforeAll(async () => {
  const roh = readFileSync("public/dokumente/selbstauskunft-formular.pdf");
  const doc = await PDFDocument.load(new Uint8Array(roh), { ignoreEncryption: true });
  const form = doc.getForm();
  const setze = (name: string, wert: string) => form.getTextField(name).setText(wert);

  setze("p1_vorname", "Max");
  setze("p1_nachname", "Mustermann");
  setze("p1_staat", "österreichisch");
  setze("p1_steuerklasse", "3");
  form.getCheckBox("p1_kirche_ja").check();
  setze("gueterstand", "Gütertrennung");
  setze("kind1_1", "Mia Mustermann");
  setze("kind1_2", "01.02.2015");
  setze("kind1_3", "nein");
  setze("p1_beschart", "angestellt");
  setze("p1_firma", "Muster GmbH");
  form.getCheckBox("p1_probezeit_nein").check();
  setze("p1_netto", "3.500");
  setze("p1_brutto", "72.000");
  setze("p1_wohnsituation", "zur Miete");
  setze("p1_kaltmiete", "900");
  setze("p1_nebenkosten", "250");
  setze("p1_lebenshaltung", "1000");
  setze("kredit1_1", "Autokredit");
  setze("kredit1_2", "Deutsche Kreditbank AG");
  setze("kredit1_3", "250");
  setze("kredit1_4", "12000");
  setze("kreditdetail1_2", "4,5");
  setze("kreditdetail1_6", "1");
  setze("verm1_1", "Depot");
  setze("verm1_3", "25000");
  setze("im1_eigentuemer", "Max Mustermann");
  setze("im1_adresse", "Musterweg 1, 83075 Bad Feilnbach");
  setze("im1_nutzung", "vermietet");
  setze("im1_marktwert", "300000");
  setze("p2_vorname", "Erika");
  setze("p2_netto", "2200");
  setze("p2_brutto", "18.000");
  form.getCheckBox("p1_mahnverfahren_nein").check();
  setze("hinweise", "Jobwechsel zum 01.10. geplant");

  const bytes = await doc.save();
  ausgefuellt = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
});

describe("saDatenAusPdfFormular", () => {
  it("liest eine am Computer ausgefüllte PDF vollständig aus", async () => {
    const { data, felderGefunden } = await saDatenAusPdfFormular(ausgefuellt);

    expect(felderGefunden).toBeGreaterThanOrEqual(25);
    expect(data.vorname).toBe("Max");
    expect(data.nachname).toBe("Mustermann");
    expect(data.staatsangehoerigkeit).toBe("andere");
    expect(data.staatsangehoerigkeitAndere).toBe("österreichisch");
    expect(data.steuerklasse).toBe("3");
    expect(data.kirchensteuer).toBe("ja");
    expect(data.gueterstand).toBe("guetertrennung");
    expect(data.kinder).toEqual([{ name: "Mia Mustermann", geburtsdatum: "01.02.2015", imHaushalt: false }]);
    expect(data.beschaeftigungsart).toBe("angestellt");
    expect(data.anstellung.firma).toBe("Muster GmbH");
    expect(data.anstellung.probezeit).toBe("nein");
    expect(data.einkommen.netto).toBe("3.500");
    expect(data.mietart).toBe("Zur Miete");
    expect(data.mieteWarm).toBe("900");
    expect(data.nebenkosten).toBe("250");
    expect(data.lebenshaltungskosten).toBe("1000");
    expect(data.mahnverfahren).toBe("nein");
    expect(data.hinweise).toBe("Jobwechsel zum 01.10. geplant");
  });

  it("ohne Haken bleibt die Bonitätsfrage unbeantwortet, nicht „Nein“ (29.09.2026)", async () => {
    const { data } = await saDatenAusPdfFormular(ausgefuellt);
    // Angekreuzt war nur „Mahnverfahren: Nein“ bei Person 1.
    expect(data.schufaBekannt).toBe("");
    expect(data.person2Data.mahnverfahren).toBe("");
    expect(data.person2Data.schufaBekannt).toBe("");
  });

  it("eine unbeantwortete Bonitätsfrage setzt im Formular keinen Haken", () => {
    const leer: SelbstauskunftData = { ...JSON.parse(JSON.stringify(EMPTY_DATA)), person2: true, person2Data: JSON.parse(JSON.stringify(EMPTY_PERSON)) };
    const { haken } = pdfFelderAusSaDaten(leer);
    for (const p of ["p1", "p2"]) {
      for (const frage of ["mahnverfahren", "schufa"]) {
        expect(haken).not.toContain(`${p}_${frage}_nein`);
        expect(haken).not.toContain(`${p}_${frage}_ja`);
      }
    }
  });

  it("übernimmt Kredite samt Details und Immobilien-Zuordnung", async () => {
    const { data } = await saDatenAusPdfFormular(ausgefuellt);
    expect(data.kredite).toHaveLength(1);
    const k = data.kredite[0];
    expect(k.art).toBe("Autokredit");
    expect(k.bank).toBe("Deutsche Kreditbank AG");
    expect(k.rate).toBe("250");
    expect(k.restschuld).toBe("12000");
    expect(k.zinssatz).toBe("4,5");
    // PDF fragt die Immobilien-Nummer 1-basiert ab, das System verweist 0-basiert.
    expect(k.immobilie).toBe("0");
  });

  it("übernimmt Vermögenswerte, Immobilien und Person 2", async () => {
    const { data } = await saDatenAusPdfFormular(ausgefuellt);
    expect(data.vermoegenswerte).toEqual([{ art: "Depot", institut: "", betrag: "25000" }]);
    expect(data.immobilien).toHaveLength(1);
    expect(data.immobilien![0].nutzung).toBe("fremd");
    expect(data.immobilien![0].marktwert).toBe("300000");
    expect(data.person2).toBe(true);
    expect(data.person2Data.vorname).toBe("Erika");
    expect(data.person2Data.einkommen.netto).toBe("2200");
  });

  it("liest das Jahresbrutto so aus, dass der Investmentrechner es findet", async () => {
    const { data } = await saDatenAusPdfFormular(ausgefuellt);
    expect(data.bruttoJahr).toBe("72.000");
    expect(data.person2Data.bruttoJahr).toBe("18.000");
    // Derselbe Weg wie bei der Online-Selbstauskunft: getBruttoFromSA muss
    // beide Personen finden, sonst kommt im Rechner nichts an.
    expect(getBruttoFromSA(data)).toBe(90_000);
  });

  it("liefert für Dateien ohne Formularfelder 0 gefundene Felder", async () => {
    const leer = await PDFDocument.create();
    leer.addPage();
    const bytes = await leer.save();
    const { felderGefunden } = await saDatenAusPdfFormular(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    expect(felderGefunden).toBe(0);
  });
});

/**
 * Die vorbelegte PDF.
 *
 * Der heikelste Weg im ganzen Vorgang: Dieses Dokument geht unterschrieben zur
 * Bank. Es muss also erstens genau das enthalten, was in der Selbstauskunft
 * steht, und zweitens unuebersehbar sagen, dass die Zahlen aus einem frueheren
 * Kauf stammen und erst mit der Unterschrift bestaetigt sind.
 */
describe("fuelleSaFormularPdf", () => {
  const vorherigeSa: SelbstauskunftData = {
    ...EMPTY_DATA,
    vorname: "Max",
    nachname: "Mustermann",
    strasse: "Musterweg",
    hausnummer: "1",
    plz: "83022",
    ort: "Rosenheim",
    geburtsdatum: "01.02.1980",
    familienstand: "verheiratet",
    staatsangehoerigkeit: "andere",
    staatsangehoerigkeitAndere: "österreichisch",
    steuerklasse: "3",
    kirchensteuer: "ja",
    gueterstand: "guetertrennung",
    kinder: [{ name: "Mia Mustermann", geburtsdatum: "01.02.2015", imHaushalt: false }],
    beschaeftigungsart: "angestellt",
    anstellung: { branche: "IT", firma: "Muster GmbH", berufsbezeichnung: "Entwickler", angestelltSeit: "2015", probezeit: "nein" },
    arbeitsvertragArt: "unbefristet",
    bruttoJahr: "72.000",
    monatsgehaelter: "13",
    einkommen: { netto: "3.500", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "250", sonstige: "" },
    bankkonten: [{ konto: "Girokonto", institut: "Sparkasse", iban: "DE00 1234" }],
    mietart: "Zur Miete",
    mieteWarm: "900",
    nebenkosten: "250",
    lebenshaltungskosten: "1000",
    privateKV: "0",
    kredite: [{ art: "Autokredit", bank: "Deutsche Kreditbank AG", rate: "250", restschuld: "12000", laufzeitEnde: "2028", zinssatz: "4,5", immobilie: "0" }],
    vermoegenswerte: [{ art: "Depot", institut: "", betrag: "25000" }],
    immobilien: [{ eigentuemer: "Max Mustermann", art: "ETW", adresse: "Musterweg 1", baujahr: "1990", grundstueckM2: "", wohnflaecheM2: "60", nutzung: "fremd", marktwert: "300000", kaltmieteIst: "700", kaltmieteZukunft: "750" }],
    mahnverfahren: "nein",
    schufaBekannt: "nein",
    schufaScore: "95",
    hinweise: "Jobwechsel geplant",
    person2: true,
    person2Data: {
      ...EMPTY_PERSON, vorname: "Erika", nachname: "Mustermann",
      einkommen: { netto: "2200", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
      // Seit 28.09.2026 hat Person 2 eigene Kredite in der Bank-Ergänzung.
      kredite: [{ art: "Sparkasse", bank: "Sparkasse", rate: "80", restschuld: "1500", laufzeitEnde: "2027" }],
    },
  };

  let vorbelegt: ArrayBuffer;

  beforeAll(async () => {
    const roh = readFileSync("public/dokumente/selbstauskunft-formular.pdf");
    vorbelegt = await fuelleSaFormularPdf(new Uint8Array(roh), vorherigeSa, 4);
  });

  it("schreibt die Angaben so hinein, dass sie unveraendert wieder herauskommen", async () => {
    const { data, felderGefunden } = await saDatenAusPdfFormular(vorbelegt);
    expect(felderGefunden).toBeGreaterThan(40);
    expect(data.vorname).toBe("Max");
    // Strasse und Hausnummer stehen in der PDF in einem Feld.
    expect(data.strasse).toBe("Musterweg 1");
    expect(data.familienstand).toBe("verheiratet");
    expect(data.staatsangehoerigkeit).toBe("andere");
    expect(data.staatsangehoerigkeitAndere).toBe("österreichisch");
    expect(data.steuerklasse).toBe("3");
    expect(data.kirchensteuer).toBe("ja");
    expect(data.gueterstand).toBe("guetertrennung");
    expect(data.kinder).toEqual([{ name: "Mia Mustermann", geburtsdatum: "01.02.2015", imHaushalt: false }]);
    expect(data.beschaeftigungsart).toBe("angestellt");
    expect(data.anstellung.firma).toBe("Muster GmbH");
    expect(data.anstellung.probezeit).toBe("nein");
    expect(data.arbeitsvertragArt).toBe("unbefristet");
    expect(data.bruttoJahr).toBe("72.000");
    expect(data.einkommen.netto).toBe("3.500");
    expect(data.mietart).toBe("Zur Miete");
    expect(data.mieteWarm).toBe("900");
    expect(data.lebenshaltungskosten).toBe("1000");
    expect(data.bankkonten[0].iban).toBe("DE00 1234");
    expect(data.vermoegenswerte).toEqual([{ art: "Depot", institut: "", betrag: "25000" }]);
    expect(data.kredite[0]).toMatchObject({ art: "Autokredit", rate: "250", restschuld: "12000", zinssatz: "4,5", immobilie: "0" });
    expect(data.immobilien![0]).toMatchObject({ adresse: "Musterweg 1", nutzung: "fremd", marktwert: "300000" });
    expect(data.schufaScore).toBe("95");
    expect(data.hinweise).toBe("Jobwechsel geplant");
    expect(data.person2).toBe(true);
    expect(data.person2Data.vorname).toBe("Erika");
    expect(data.person2Data.einkommen.netto).toBe("2200");
    // Der Kredit von Person 2 steht nach denen von Person 1 und kommt zu ihr zurück.
    expect(data.kredite).toHaveLength(1);
    expect(data.person2Data.kredite).toEqual([expect.objectContaining({ art: "Sparkasse", rate: "80", restschuld: "1500" })]);
  });

  it("stellt ein Deckblatt voran", async () => {
    const doc = await PDFDocument.load(vorbelegt, { ignoreEncryption: true });
    const leer = await PDFDocument.load(new Uint8Array(readFileSync("public/dokumente/selbstauskunft-formular.pdf")), { ignoreEncryption: true });
    expect(doc.getPageCount()).toBe(leer.getPageCount() + 1);
  });

  it("nennt im Deckblatt die Herkunft, den Pruefauftrag und die Bedeutung der Unterschrift", () => {
    const { titel, absaetze } = saDeckblattText(4);
    const text = [titel, ...absaetze].join(" ");
    expect(text).toContain("Investment 4");
    expect(text).toContain("prüfen");
    expect(text).toContain("Unterschrift");
    // Keine Gedankenstriche in Texten, die der Kunde sieht.
    expect(text).not.toMatch(/[–—]/);
  });

  it("hinterlegt ein Feld nur, wenn der Wert wirklich uebernommen ist", async () => {
    // Der Vertriebspartner hat das Nettoeinkommen schon korrigiert. Dieser
    // Wert stammt nicht mehr aus dem alten Kauf und darf nicht als
    // uebernommen markiert sein.
    const korrigiert: SelbstauskunftData = {
      ...vorherigeSa,
      einkommen: { ...vorherigeSa.einkommen, netto: "4.100" },
    };
    const roh = readFileSync("public/dokumente/selbstauskunft-formular.pdf");
    const bytes = await fuelleSaFormularPdf(new Uint8Array(roh), korrigiert, 4, vorherigeSa);
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    // Die leere PDF hat weisse Felder. Uebernommen heisst: hellgelb.
    const istGelb = (name: string) => {
      const bg = form.getTextField(name).acroField.getWidgets()[0]
        .getAppearanceCharacteristics()?.getBackgroundColor();
      const werte = (bg as unknown as number[]) || [];
      return werte.length === 3 && werte[0] === 1 && werte[1] < 1 && werte[2] < 1;
    };

    expect(form.getTextField("p1_netto").getText()).toBe("4.100");
    expect(istGelb("p1_netto")).toBe(false);
    // Die unveraenderte Kaltmiete stammt weiter aus dem alten Kauf.
    expect(istGelb("p1_kaltmiete")).toBe(true);
  });
});

/**
 * Hin und zurück mit den Kreditfeldern seit 28.09.2026: jede Kreditart, alle
 * neuen Felder, Kredite und Immobilien beider Personen, Zuordnung über die
 * Personengrenze und „schuldenfrei“. Für die deutsche und die englische
 * Vorlage, denn deren Auswahlfelder tragen verschiedene Texte.
 */
describe("Formular-PDF: Kreditfelder beider Personen", () => {
  const immo = (adresse: string) => ({
    eigentuemer: "Test Person", art: "ETW", adresse, baujahr: "1995", grundstueckM2: "",
    wohnflaecheM2: "70", nutzung: "fremd", marktwert: "250000", kaltmieteIst: "800", kaltmieteZukunft: "",
  });
  const kredit = (kategorie: string, n: number, extra: Partial<SaKredit> = {}): SaKredit => ({
    kategorie, art: `Bezeichnung ${n}`, bank: `Bank ${n}`, rate: `${100 + n}`, restschuld: `${1000 * n}`,
    restschuldPer: "31.08.2026", laufzeitEnde: "31.12.2035", ursprung: `${2000 * n}`, zinssatz: "3.5",
    vertragsbeginn: "01.01.2020", zinsbindungBis: "31.12.2030", zweck: `Zweck ${n}`, ...extra,
  });
  const alleArten = KREDIT_AUSWAHL.map((a) => a.wert);
  const kreditnehmer = ["person1", "person2", "gemeinsam"];
  const sondertilgung = ["ja", "nein", "unbekannt"];

  const daten: SelbstauskunftData = {
    ...EMPTY_DATA,
    vorname: "Test", nachname: "Eins",
    person2: true,
    // Jede Kreditart einmal, die Auswahlwerte reihum.
    kredite: alleArten.map((art, i) => kredit(art, i + 1, {
      zinsart: i % 2 ? "variabel" : "fest",
      sondertilgung: sondertilgung[i % 3],
      kreditnehmer: kreditnehmer[i % 3],
      // Der erste gehört zur Immobilie von Person 2, der zweite zur zweiten von Person 1.
      immobilie: i === 0 ? "p2:0" : i === 1 ? "1" : undefined,
    })),
    immobilien: [immo("Testweg 1"), immo("Testweg 2")],
    immobilienSchuldenfrei: false,
    person2Data: {
      ...EMPTY_PERSON, vorname: "Test", nachname: "Zwei",
      kredite: [
        kredit("immobilienkredit", 11, { zinsart: "fest", sondertilgung: "ja", kreditnehmer: "gemeinsam", immobilie: "0" }),
        kredit("ratenkredit", 12, { kreditnehmer: "person2" }),
      ],
      immobilien: [immo("Testweg 5")],
      immobilienSchuldenfrei: true,
    },
  };

  for (const datei of ["selbstauskunft-formular.pdf", "selbstauskunft-formular-en.pdf"]) {
    it(`überträgt alles verlustfrei (${datei})`, async () => {
      const roh = readFileSync(`public/dokumente/${datei}`);
      const bytes = await fuelleSaFormularPdf(new Uint8Array(roh), daten, 7);
      const { data } = await saDatenAusPdfFormular(bytes);

      expect(data.kredite).toEqual(daten.kredite);
      expect(data.person2).toBe(true);
      expect(data.person2Data.kredite).toEqual(daten.person2Data.kredite);
      expect(data.immobilien).toEqual(daten.immobilien);
      expect(data.person2Data.immobilien).toEqual(daten.person2Data.immobilien);
      expect(data.immobilienSchuldenfrei).toBe(false);
      expect(data.person2Data.immobilienSchuldenfrei).toBe(true);
    });
  }

  it("zeigt die Auswahl in der englischen Vorlage englisch", async () => {
    const roh = readFileSync("public/dokumente/selbstauskunft-formular-en.pdf");
    const doc = await PDFDocument.load(await fuelleSaFormularPdf(new Uint8Array(roh), daten, 7, null, "en"));
    const form = doc.getForm();
    expect(form.getDropdown("kredit1_kategorie").getSelected()).toEqual(["Mortgage loan"]);
    expect(form.getDropdown("p2kreditdetail1_kreditnehmer").getSelected()).toEqual(["jointly"]);
    // Immobilie 5 ist die erste von Person 2.
    expect(form.getTextField("kreditdetail1_6").getText()).toBe("5");
  });

  it("schreibt Kredite von Person 2 über fünf hinaus mit Vorsatz dazu und holt sie zurück", async () => {
    const viele = Array.from({ length: 7 }, (_, i) => kredit("ratenkredit", 20 + i));
    const sa: SelbstauskunftData = { ...daten, kredite: [kredit("dispo", 1)], person2Data: { ...daten.person2Data, kredite: viele } };
    const roh = readFileSync("public/dokumente/selbstauskunft-formular.pdf");
    const { data } = await saDatenAusPdfFormular(await fuelleSaFormularPdf(new Uint8Array(roh), sa, 7));
    expect(data.kredite).toEqual(sa.kredite);
    expect(data.person2Data.kredite).toEqual(viele);
  });
});

/**
 * Eine mit der Vorlage vor dem 28.09.2026 ausgefüllte Datei: eine gemeinsame
 * Kredittabelle mit „P2:“ vor den Krediten von Person 2, vier gemeinsame
 * Immobilien, keine Auswahlfelder. Nachgebaut mit denselben Feldnamen.
 */
describe("Formular-PDF der alten Vorlage", () => {
  it("bleibt auslesbar", async () => {
    const doc = await PDFDocument.create();
    const seite = doc.addPage();
    const form = doc.getForm();
    const setze = (name: string, wert: string) => {
      const feld = form.createTextField(name);
      feld.addToPage(seite, { x: 0, y: 0, width: 10, height: 10 });
      feld.setText(wert);
    };
    setze("p1_vorname", "Alt");
    setze("p2_vorname", "Partnerin");
    setze("kredit1_1", "Baufinanzierung");
    setze("kredit1_2", "Sparkasse");
    setze("kredit1_3", "900");
    setze("kredit1_4", "150000");
    setze("kredit1_5", "2045");
    setze("kreditdetail1_2", "2,1");
    setze("kreditdetail1_6", "2");
    setze("kredit2_1", "P2: Autokredit");
    setze("kredit2_3", "250");
    setze("im1_adresse", "Altweg 1");
    setze("im2_adresse", "Altweg 2");
    const bytes = await doc.save();

    const { data } = await saDatenAusPdfFormular(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(data.kredite).toEqual([
      expect.objectContaining({ art: "Baufinanzierung", bank: "Sparkasse", rate: "900", restschuld: "150000", laufzeitEnde: "2045", zinssatz: "2,1", immobilie: "1" }),
    ]);
    expect(data.kredite[0].kategorie).toBeUndefined();
    expect(data.person2Data.kredite).toEqual([expect.objectContaining({ art: "Autokredit", rate: "250" })]);
    // Die alte Vorlage kannte nur eine gemeinsame Liste, sie landet bei Person 1.
    expect(data.immobilien!.map((i) => i.adresse)).toEqual(["Altweg 1", "Altweg 2"]);
    expect(data.person2Data.immobilien).toEqual([]);
  });
});

import { getZvEFromSA } from "@/lib/steuerHelper";

/* Zu versteuerndes Jahreseinkommen in der Formular-PDF (seit 05.10.2026). */
describe("Formular-PDF: zu versteuerndes Jahreseinkommen", () => {
  for (const datei of ["selbstauskunft-formular.pdf", "selbstauskunft-formular-en.pdf"]) {
    it(`schreibt das zvE hinein und liest es zurück, auch eine 0 (${datei})`, async () => {
      const daten: SelbstauskunftData = {
        ...EMPTY_DATA,
        vorname: "Test", nachname: "Eins", familienstand: "Ledig", zvEJahr: "61.000",
        person2: true,
        person2Data: { ...EMPTY_PERSON, vorname: "Test", nachname: "Zwei", zvEJahr: "0" },
      };
      const roh = readFileSync(`public/dokumente/${datei}`);
      const { data } = await saDatenAusPdfFormular(await fuelleSaFormularPdf(new Uint8Array(roh), daten, 7));
      expect(data.zvEJahr).toBe("61.000");
      expect(data.person2Data.zvEJahr).toBe("0");
    });
  }

  it("liest ein am Computer eingetragenes zvE so aus, dass der Rechner es findet", async () => {
    const roh = readFileSync("public/dokumente/selbstauskunft-formular.pdf");
    const doc = await PDFDocument.load(new Uint8Array(roh), { ignoreEncryption: true });
    doc.getForm().getTextField("p1_vorname").setText("Max");
    doc.getForm().getTextField("p1_familienstand").setText("verheiratet");
    doc.getForm().getTextField("p1_zve").setText("98.500");
    const bytes = await doc.save();
    const { data } = await saDatenAusPdfFormular(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(data.zvEJahr).toBe("98.500");
    expect(getZvEFromSA(data)).toBe(98_500);
  });

  it("ein leeres Feld bleibt keine Angabe", async () => {
    const { data } = await saDatenAusPdfFormular(ausgefuellt);
    expect(data.zvEJahr).toBeUndefined();
    expect(getZvEFromSA(data)).toBeNull();
  });
});
