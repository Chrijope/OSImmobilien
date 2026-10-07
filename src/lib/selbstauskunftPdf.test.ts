import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die Selbstauskunft als PDF. jsPDF wird durch eine Attrappe ersetzt, die alle
 * Zeichenaufrufe schluckt und die gesetzten Texte einsammelt (Bauweise wie
 * exposeEinheitPdf.test.ts). Geprueft wird der Einkommensblock: Das
 * Jahresbrutto steht dort sichtbar, mit derselben Beschriftung wie im
 * Formular, und es geht ausdruecklich NICHT in die Monatssumme ein.
 */
const mitschnitt = vi.hoisted(() => ({
  texte: [] as Array<{ text: string; seite: number }>,
}));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    private seite = 1;
    addFileToVFS() {}
    addFont() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setGState() {}
    rect() { return this; }
    roundedRect() {}
    ellipse() {}
    circle() {}
    triangle() {}
    line() {}
    clip() { return this; }
    discardPath() { return this; }
    saveGraphicsState() { return this; }
    restoreGraphicsState() { return this; }
    text(t: string | string[]) {
      const liste = Array.isArray(t) ? t : [t];
      for (const z of liste) mitschnitt.texte.push({ text: String(z), seite: this.seite });
    }
    addImage() {}
    getImageProperties() { return { width: 3, height: 2 }; }
    addPage() { this.seiten += 1; this.seite = this.seiten; }
    setPage(n: number) { this.seite = n; }
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    output() { return new Blob(["pdf"]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

// Kein Netz im Test: Schrift und Logo scheitern beim Laden, das PDF muss
// trotzdem entstehen.
vi.stubGlobal("fetch", () => Promise.reject(new Error("kein Netz im Test")));

import { EMPTY_DATA, EMPTY_PERSON, type SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import { generateSelbstauskunftPDF } from "@/lib/selbstauskunftPdf";

const kunde = { vorname: "Anna", nachname: "Muster", moreId: "MI-1" };

function saDaten(over: Partial<SelbstauskunftData> = {}): SelbstauskunftData {
  return {
    ...JSON.parse(JSON.stringify(EMPTY_DATA)),
    vorname: "Anna",
    nachname: "Muster",
    beschaeftigungsart: "angestellt",
    einkommen: { netto: "3.500,00", gewerbe: "", miet: "", zinsen: "", rente: "", kindergeld: "0", sonstige: "" },
    ...over,
  } as SelbstauskunftData;
}

const alleTexte = () => mitschnitt.texte.map((t) => t.text).join("\n");

beforeEach(() => { mitschnitt.texte.length = 0; });

describe("generateSelbstauskunftPDF, Jahresbrutto im Einkommensblock", () => {
  it("druckt das Jahresbrutto mit der Beschriftung aus dem Formular", async () => {
    await generateSelbstauskunftPDF(saDaten({ bruttoJahr: "90.000,00" }), kunde);
    const alles = alleTexte();
    expect(alles).toContain("Jahresbrutto (gesamt), p. a.");
    expect(alles).toContain("90.000,00 €");
  });

  it("laesst die Monatssumme unberuehrt, das Jahresbrutto zaehlt nicht hinein", async () => {
    await generateSelbstauskunftPDF(saDaten({ bruttoJahr: "90.000,00" }), kunde);
    const texte = mitschnitt.texte.map((t) => t.text);
    const summe = texte.indexOf("Gesamt Einkommen");
    expect(summe).toBeGreaterThan(-1);
    // Die Monatssumme bleibt das Nettogehalt, nicht Netto plus Jahresbrutto.
    expect(texte.slice(summe, summe + 3)).toContain("3.500,00 €");
    // Und das Jahresbrutto steht erst danach.
    expect(texte.findIndex((t) => t === "Jahresbrutto (gesamt), p. a.")).toBeGreaterThan(summe);
  });

  it("zeigt beide Personen und ihre Summe", async () => {
    const data = saDaten({
      person2: true,
      bruttoJahr: "60.000,00",
      person2Data: {
        ...JSON.parse(JSON.stringify(EMPTY_PERSON)),
        vorname: "Bernd",
        nachname: "Muster",
        beschaeftigungsart: "angestellt",
        bruttoJahr: "30.000,00",
      },
    });
    await generateSelbstauskunftPDF(data, kunde);
    const alles = alleTexte();
    expect(alles).toContain("60.000,00 €");
    expect(alles).toContain("30.000,00 €");
    expect(alles).toContain("Jahresbrutto Person 1 + Person 2, p. a.");
    expect(alles).toContain("90.000,00 €");
  });

  it("laesst die Zeile weg, wenn kein Jahresbrutto angegeben ist (Altbestand)", async () => {
    await generateSelbstauskunftPDF(saDaten(), kunde);
    expect(alleTexte()).not.toContain("Jahresbrutto");
  });
});

describe("generateSelbstauskunftPDF, Kreditdetails und Person 2 (28.09.2026)", () => {
  const immo = (adresse: string) => ({
    eigentuemer: "Bernd Muster", art: "ETW", adresse, baujahr: "1995", grundstueckM2: "0", wohnflaecheM2: "70",
    nutzung: "fremd", marktwert: "250.000", kaltmieteIst: "800", kaltmieteZukunft: "",
  });
  const person2 = (over: Record<string, unknown> = {}) => ({
    ...JSON.parse(JSON.stringify(EMPTY_PERSON)),
    vorname: "Bernd", nachname: "Muster", beschaeftigungsart: "angestellt",
    ...over,
  });

  it("stellt einen Kredit von Person 1 unter die Immobilie von Person 2, mit den neuen Angaben", async () => {
    const data = saDaten({
      person2: true,
      kredite: [{
        art: "Hausbank", kategorie: "immobilienkredit", bank: "Hausbank eG", rate: "900", restschuld: "180.000",
        laufzeitEnde: "01.01.2045", restschuldPer: "01.09.2026", kreditnehmer: "gemeinsam", zinsart: "fest",
        sondertilgung: "ja", immobilie: "p2:0",
      }],
      person2Data: person2({ immobilien: [immo("Musterweg 2")] }),
    });
    await generateSelbstauskunftPDF(data, kunde);
    const alles = alleTexte();
    expect(alles).toContain("Musterweg 2");
    expect(alles).toContain("Darlehen zu Immobilie 1");
    expect(alles).toContain("Restschuld per");
    expect(alles).toContain("01.09.2026");
    expect(alles).toContain("Beide gemeinsam");
    expect(alles).toContain("Fest");
    expect(alles).toContain("Alle Kredite sind oben den Immobilien zugeordnet");
  });

  it("nennt „schuldenfrei“ nur, solange kein Immobilienkredit eingetragen ist", async () => {
    await generateSelbstauskunftPDF(saDaten({ immobilienSchuldenfrei: true, immobilien: [immo("Musterweg 3")] }), kunde);
    expect(alleTexte()).toContain("Immobilien schuldenfrei (Angabe des Antragstellers)");

    mitschnitt.texte.length = 0;
    await generateSelbstauskunftPDF(saDaten({
      immobilienSchuldenfrei: true,
      kredite: [{ art: "", kategorie: "immobilienkredit", rate: "900", restschuld: "1000", laufzeitEnde: "" }],
    }), kunde);
    expect(alleTexte()).not.toContain("schuldenfrei");
  });

  it("alte Kredite ohne die neuen Felder: keine Zusatzzeile, kein Absturz", async () => {
    await generateSelbstauskunftPDF(saDaten({ kredite: [{ art: "VW Bank", rate: "250", restschuld: "12000", laufzeitEnde: "2028" }] }), kunde);
    const alles = alleTexte();
    expect(alles).toContain("VW Bank");
    expect(alles).not.toContain("Restschuld per");
  });

  it("zeigt Laufzeitende und Zinsbindung getrennt und den Zins deutsch", async () => {
    const data = saDaten({
      person2: true,
      immobilien: [immo("Musterweg 4")],
      kredite: [{
        art: "", kategorie: "immobilienkredit", bank: "Hausbank eG", rate: "900", restschuld: "180.000",
        laufzeitEnde: "31.12.2050", zinsbindungBis: "28.02.2031", zinssatz: "3.45", immobilie: "0",
      }],
      person2Data: person2({
        kredite: [{ art: "Küche", kategorie: "ratenkredit", bank: "Konsumbank", rate: "95", restschuld: "2100", laufzeitEnde: "31.03.2028", sondertilgung: "nein", kreditnehmer: "person2" }],
      }),
    });
    await generateSelbstauskunftPDF(data, kunde);
    const alles = alleTexte();
    // Beim Darlehen unter der Immobilie: beide Daten mit eigener Beschriftung.
    expect(alles).toContain("Zinsbindung bis");
    expect(alles).toContain("28.02.2031");
    expect(alles).toContain("Laufzeitende");
    expect(alles).toContain("31.12.2050");
    expect(alles).toContain("3,45 %");
    // Der freie Kredit von Person 2 steht in der Tabelle mit seinem Laufzeitende.
    expect(alles).toContain("Laufzeit bis");
    expect(alles).toContain("31.03.2028");
    expect(alles).toContain("Sondertilgungsrecht: Nein");
  });
});

describe("generateSelbstauskunftPDF, unbeantwortete Bonitätsfragen (29.09.2026)", () => {
  const wertNach = (label: string) => {
    const texte = mitschnitt.texte.map((t) => t.text);
    const i = texte.indexOf(label);
    expect(i).toBeGreaterThan(-1);
    return texte[i + 1];
  };

  it("zeigt bei fehlender Antwort einen Strich und nie „Nein“", async () => {
    await generateSelbstauskunftPDF(saDaten(), kunde);
    expect(wertNach("Laufendes Mahnverfahren")).toBe("–");
    expect(wertNach("Schufa-Eintrag bekannt")).toBe("–");
  });

  it("zeigt eine gegebene Antwort weiter an", async () => {
    await generateSelbstauskunftPDF(saDaten({ mahnverfahren: "nein", schufaBekannt: "ja" }), kunde);
    expect(wertNach("Laufendes Mahnverfahren")).toBe("Nein");
    expect(wertNach("Schufa-Eintrag bekannt")).toBe("Ja");
  });
});

describe("generateSelbstauskunftPDF, zu versteuerndes Einkommen (05.10.2026)", () => {
  it("druckt das zvE beider Personen getrennt, ohne Summe", async () => {
    const data = saDaten({
      person2: true,
      familienstand: "Ledig",
      zvEJahr: "48.000,00",
      person2Data: {
        ...JSON.parse(JSON.stringify(EMPTY_PERSON)),
        vorname: "Bernd",
        nachname: "Muster",
        zvEJahr: "31.000,00",
      },
    });
    await generateSelbstauskunftPDF(data, kunde);
    const alles = alleTexte();
    expect(alles).toContain("Zu verst. Einkommen p. a.");
    expect(alles).toContain("48.000,00 €");
    expect(alles).toContain("31.000,00 €");
    expect(alles).not.toContain("79.000,00 €");
  });

  it("nennt bei Verheirateten das gemeinsame zvE, zweisprachig", async () => {
    await generateSelbstauskunftPDF(
      saDaten({ familienstand: "Verheiratet", zvEJahr: "120.000,00" }),
      kunde,
      undefined,
      { sprache: "en" },
    );
    const alles = alleTexte();
    expect(alles).toContain("Zu versteuerndes Einkommen p. a., gemeinsam (Zusammenveranlagung)");
    expect(alles).toContain("Taxable income p.a., joint (joint assessment)");
    expect(alles).toContain("120.000,00 €");
  });

  it("laesst die Zeile weg, wenn kein zvE angegeben ist", async () => {
    await generateSelbstauskunftPDF(saDaten({ bruttoJahr: "90.000,00" }), kunde);
    expect(alleTexte()).not.toMatch(/Zu verst/);
  });
});

describe("generateSelbstauskunftPDF, zvE von 0", () => {
  it("druckt eine eingetragene 0 als Betrag", async () => {
    await generateSelbstauskunftPDF(saDaten({ familienstand: "Verheiratet", zvEJahr: "0,00" }), kunde);
    const texte = mitschnitt.texte.map((t) => t.text);
    const zeile = texte.indexOf("Zu versteuerndes Einkommen p. a., gemeinsam (Zusammenveranlagung)");
    expect(zeile).toBeGreaterThan(-1);
    expect(texte.slice(zeile, zeile + 3)).toContain("0,00 €");
  });
});
