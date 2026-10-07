import { describe, expect, it } from "vitest";
import {
  OBJEKT_EINLEITUNG,
  OBJEKT_EINLEITUNG_GESAMTOBJEKT,
  KAUFGEGENSTAND_GESAMTOBJEKT,
  TEXT_FASSUNG,
  TEXT_FASSUNG_GESAMTOBJEKT,
  UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF,
  VEREINBARUNG_ZIFFERN,
  WIDERRUF_AUFLOESENDE_BEDINGUNG,
  WIDERRUF_WAHLEN,
  gebuehrAbschnitt,
  grundbuchZeile,
  kaeuferZeilenGesellschaft,
  objektEinleitung,
  objektZeilenGesamtobjekt,
  preisBeschriftung,
  textFassung,
  unterschriftBestaetigung,
  unterschriftZeileGesellschaft,
  vertragsAufbau,
  vertragsOptionenAus,
} from "./reservierungErklaerung";
import { GEBUEHR_GESAMTOBJEKT } from "./reservierungsgebuehr";

/*
 * Die Reservierungsvereinbarung für ein Globalobjekt, also das ganze Haus.
 *
 * Grundlage ist der Entwurf `Reservierung_Globalobjekt_Entwurf_2026-09-23.md`,
 * von Christian am 23.09.2026 freigegeben: Tabelle A gilt immer, Tabelle B
 * bei einer Gesellschaft, Tabelle C (Punkt 1 ergänzt, Benennungsklausel)
 * ebenfalls. Die Gebühr ist fest 3.000 EUR ohne Staffel (Variante A).
 *
 * Die Fassung für Einzelwohnungen bleibt Wort für Wort, wie sie war. Das
 * prüft der erste Block, bevor die Globalfassung drankommt.
 */

const HAUS = vertragsAufbau({ gesamtobjekt: true });
const HAUS_GMBH = vertragsAufbau({ gesamtobjekt: true, gesellschaft: true });
const HAUS_OHNE = vertragsAufbau({ gesamtobjekt: true, gebuehrEntfaellt: true });
const text = (a: ReturnType<typeof vertragsAufbau>, kennung: string) => a.ziffern.find((z) => z.kennung === kennung)?.text || "";

describe("Die Einzelwohnung bleibt unverändert", () => {
  it("behält Fassung, neun Punkte und die Widerrufstexte", () => {
    const einzel = vertragsAufbau({});
    expect(TEXT_FASSUNG).toBe("2026-09-22");
    expect(einzel.textFassung).toBe(TEXT_FASSUNG);
    expect(einzel.ziffern).toEqual(VEREINBARUNG_ZIFFERN);
    expect(einzel.ziffern).toHaveLength(9);
    expect(einzel.widerrufWahlen).toEqual(WIDERRUF_WAHLEN);
    expect(einzel.aufloesendeBedingung).toBe(WIDERRUF_AUFLOESENDE_BEDINGUNG);
    expect(einzel.aufloesendeBedingung).toContain("(Punkt 8)");
  });

  it("kennt ohne Globalobjekt keine Gesellschaft und keinen dritten Verfallsatz", () => {
    const einzel = vertragsAufbau({ gesellschaft: true });
    expect(einzel.gesellschaft).toBe(false);
    expect(einzel.mitWiderruf).toBe(true);
    expect(text(einzel, "verfall")).not.toContain("aus anderen Gründen");
    expect(einzel.ziffern.some((z) => z.kennung === "bestand" || z.kennung === "benennung")).toBe(false);
    expect(objektEinleitung({})).toBe(OBJEKT_EINLEITUNG);
    expect(preisBeschriftung({})).toBe("Gesamtpreis");
  });

  it("sagt beim Abwarten weiter „die Wohnung“", () => {
    expect(vertragsAufbau({}).widerrufWahlen[1].erlaeuterung).toContain("dass die Wohnung bis zum Ablauf");
  });

  it("rechnet die Gebühr weiter nach der Staffel", () => {
    const a = gebuehrAbschnitt("400.000", "Roonstraße 3", "6", "Muster");
    expect(a.betrag).toBe("1.500,00 EUR");
    expect(a.staffel).toHaveLength(2);
  });
});

describe("Die Fassung des Globalobjekts", () => {
  it("hat eine eigene Fassung, die im Datensatz und im PDF steht", () => {
    expect(TEXT_FASSUNG_GESAMTOBJEKT).toBe("2026-09-23 Gesamtobjekt");
    expect(textFassung({ gesamtobjekt: true })).toBe(TEXT_FASSUNG_GESAMTOBJEKT);
    expect(HAUS.textFassung).toBe(TEXT_FASSUNG_GESAMTOBJEKT);
    expect(textFassung({})).toBe(TEXT_FASSUNG);
  });

  it("liest die Optionen aus dem Datensatz, die Gesellschaft nur beim Haus", () => {
    expect(vertragsOptionenAus({ gesamtobjekt: true, kaeuferArt: "gesellschaft" })).toEqual({ gebuehrEntfaellt: undefined, gesamtobjekt: true, gesellschaft: true });
    expect(vertragsOptionenAus({ kaeuferArt: "gesellschaft" })).toEqual({ gebuehrEntfaellt: undefined, gesamtobjekt: false, gesellschaft: false });
    expect(vertragsOptionenAus(null)).toEqual({ gebuehrEntfaellt: undefined, gesamtobjekt: false, gesellschaft: false });
  });
});

describe("Tabelle A: gilt bei jedem Globalobjekt", () => {
  it("grenzt in der Einleitung das Haus als Ganzes ab", () => {
    expect(objektEinleitung({ gesamtobjekt: true })).toBe(OBJEKT_EINLEITUNG_GESAMTOBJEKT);
    expect(OBJEKT_EINLEITUNG_GESAMTOBJEKT).toBe(
      "Ich/Wir beabsichtige/n, das nachfolgend bezeichnete Objekt als Ganzes über MOREImmo zu erwerben, also das Grundstück mit dem Gebäude und sämtlichen darin befindlichen Einheiten. Der Erwerb einzelner Einheiten ist nicht Gegenstand dieser Vereinbarung.",
    );
  });

  it("nennt Kaufgegenstand und Anzahl statt der Wohneinheit, dazu Grundbuch, Aufteilung und Stellplätze", () => {
    const zeilen = objektZeilenGesamtobjekt({
      anzahlEinheiten: "8", aufteilung: "aufgeteilt",
      grundbuchAmtsgericht: "München", grundbuchGemarkung: "Bogenhausen", grundbuchFlurstueck: "123/4",
      stellplaetzeGaragen: "8 Stellplätze auf dem Grundstück",
    });
    expect(zeilen).toEqual([
      { label: "Kaufgegenstand", wert: "Gesamtobjekt (Grundstück mit Gebäude und sämtlichen Einheiten)" },
      { label: "Anzahl Einheiten", wert: "8 Einheiten" },
      { label: "Grundbuch", wert: "Amtsgericht München, Gemarkung Bogenhausen, Flurstück(e) 123/4" },
      { label: "Aufteilung", wert: "in Wohnungs- und Teileigentum aufgeteilt" },
      { label: "Stellplätze / Garagen", wert: "8 Stellplätze auf dem Grundstück" },
    ]);
    expect(zeilen.some((z) => z.label === "Wohneinheit")).toBe(false);
    expect(KAUFGEGENSTAND_GESAMTOBJEKT).toBe("Gesamtobjekt (Grundstück mit Gebäude und sämtlichen Einheiten)");
  });

  it("lässt Grundbuch, „noch offen“ und Stellplätze weg, wenn nichts eingetragen ist", () => {
    const zeilen = objektZeilenGesamtobjekt({ anzahlEinheiten: "6", aufteilung: "offen" });
    expect(zeilen.map((z) => z.label)).toEqual(["Kaufgegenstand", "Anzahl Einheiten"]);
    expect(objektZeilenGesamtobjekt({ anzahlEinheiten: "6", aufteilung: "nicht_aufgeteilt" })[2])
      .toEqual({ label: "Aufteilung", wert: "nicht aufgeteilt" });
  });

  it("schreibt „Amtsgericht“ nicht doppelt", () => {
    expect(grundbuchZeile({ grundbuchAmtsgericht: "Amtsgericht Hof" })).toBe("Amtsgericht Hof");
    expect(grundbuchZeile({ grundbuchAmtsgericht: "AG Hof", grundbuchFlurstueck: "Flurstück 12" })).toBe("Amtsgericht Hof, Flurstück(e) 12");
    expect(grundbuchZeile({})).toBe("");
  });

  it("beschriftet den Preis als „Kaufpreis gesamt“", () => {
    expect(preisBeschriftung({ gesamtobjekt: true })).toBe("Kaufpreis gesamt");
  });

  it("verbietet in Punkt 2 auch den Verkauf einzelner Einheiten", () => {
    const pflichten = HAUS.ziffern.find((z) => z.kennung === "pflichten");
    expect(pflichten?.punkte?.[0]).toBe("a) das Objekt nicht anderen Interessenten anzubieten und mit ihnen nicht über das Objekt zu verhandeln, weder als Ganzes noch über einzelne Einheiten daraus;");
    expect(pflichten?.punkte?.[1]).toBe("b) darauf hinzuwirken, dass der Verkäufer das Objekt während der Reservierungsdauer weder als Ganzes noch in Teilen anderweitig veräußert;");
    expect(pflichten?.punkte?.[2]).toBe(VEREINBARUNG_ZIFFERN[1].punkte?.[2]);
  });

  it("setzt den Punkt zum Bestand direkt hinter die Abschlussfreiheit", () => {
    const kennungen = HAUS.ziffern.map((z) => z.kennung);
    expect(kennungen).toEqual([
      "zeitraum", "pflichten", "pflichtbeginn", "abschlussfreiheit", "bestand", "benennung",
      "zahlung", "rueckzahlung", "verfall", "wirksamkeit", "dolmetscher",
    ]);
    expect(text(HAUS, "bestand")).toBe(
      "Das Objekt wird mit den bestehenden Miet- und Pachtverhältnissen erworben, soweit der Kaufvertrag nichts anderes bestimmt. Angaben zu Einheiten, Flächen, Mieten und Mietverhältnissen stammen vom Verkäufer; sie sind keine Zusicherung und keine Beschaffenheitsangabe von MOREImmo. Maßgeblich für Kaufgegenstand, Beschaffenheit und Kaufpreis ist allein der notarielle Kaufvertrag.",
    );
  });

  it("nennt in der Zahlung die Gebühr für das Gesamtobjekt, nicht nach dem Kaufpreis", () => {
    expect(text(HAUS, "zahlung")).toContain("Der Kaufinteressent bezahlt die in Abschnitt 4 für das Gesamtobjekt bestimmte Reservierungsgebühr an das dort angegebene Konto.");
    expect(text(HAUS, "zahlung")).not.toContain("nach dem Kaufpreis");
    expect(text(HAUS, "zahlung")).toContain("in Punkt 2 genannten Tätigkeiten");
  });

  it("verspricht in Punkt „Verfall“ ausdrücklich die Rückzahlung, wenn der Verkäufer nicht verkauft", () => {
    expect(text(HAUS, "verfall")).toMatch(/vorgelegt hat\. Kommt der Kaufvertrag aus anderen Gründen nicht zustande, insbesondere weil der Verkäufer das Objekt nicht an den Kaufinteressenten verkauft, wird die Reservierungsgebühr unverzüglich, spätestens binnen vierzehn Tagen, vollständig zurückgezahlt\.$/);
  });

  it("sagt beim Abwarten „das Objekt“ und verweist auf die richtige Nummer", () => {
    expect(HAUS.widerrufWahlen[1].erlaeuterung).toBe(
      "Mir ist bekannt, dass das Objekt bis zum Ablauf der Widerrufsfrist nicht für mich reserviert ist und in dieser Zeit anderen Kaufinteressenten angeboten und von diesen reserviert werden kann. Kommt eine anderweitige Reservierung zustande, entfällt diese Vereinbarung, und eine bereits gezahlte Reservierungsgebühr wird vollständig zurückgezahlt.",
    );
    // Zwei Punkte mehr als bei der Wohnung: die Wirksamkeit steht auf Punkt 10.
    expect(HAUS.aufloesendeBedingung).toContain("(Punkt 10)");
    expect(text(HAUS, "pflichtbeginn")).toContain("nach Abschnitt 7 gewählt");
  });

  it("verweist nirgends ins Leere, in keinem der Fälle", () => {
    for (const opt of [
      { gesamtobjekt: true }, { gesamtobjekt: true, gesellschaft: true },
      { gesamtobjekt: true, gebuehrEntfaellt: true }, { gesamtobjekt: true, gesellschaft: true, gebuehrEntfaellt: true },
    ]) {
      expect(() => vertragsAufbau(opt)).not.toThrow();
      const a = vertragsAufbau(opt);
      expect(a.offeneZiffern).toEqual([]);
      for (const z of a.ziffern) expect(z.text).not.toContain("{{");
    }
  });
});

describe("Tabelle C: Punkt 1 ergänzt und die Benennungsklausel", () => {
  it("nennt die Prüfung der Objekt- und Mietunterlagen", () => {
    expect(text(HAUS, "zeitraum")).toBe(
      "Um dem Kaufinteressenten einen angemessenen Zeitraum für die Kaufentscheidung, die Prüfung der Objekt- und Mietunterlagen, die Kreditbeschaffung und andere Vorbereitungen zu gewähren, reserviert MOREImmo das Objekt ab dem Tag der Unterzeichnung dieser Vereinbarung bis zum vereinbarten Notartermin.",
    );
  });

  it("enthält die Benennungsklausel wörtlich", () => {
    expect(text(HAUS, "benennung")).toBe(
      "Der Kaufinteressent kann MOREImmo bis spätestens zehn Tage vor dem Notartermin in Textform eine Gesellschaft benennen, an der er beteiligt ist und die an seiner Stelle den Kaufvertrag schließen soll. MOREImmo wirkt darauf hin, dass der Verkäufer mit der benannten Gesellschaft abschließt. Die Rechte und Pflichten aus dieser Vereinbarung gehen mit der Benennung auf die Gesellschaft über; der Kaufinteressent haftet für die Pflichten aus dieser Vereinbarung neben ihr fort.",
    );
  });
});

describe("Tabelle B: die Käuferin ist eine Gesellschaft", () => {
  it("hat keine Widerrufsbelehrung und keine Wahl zum Beginn", () => {
    expect(HAUS_GMBH.mitWiderruf).toBe(false);
    expect(HAUS_GMBH.abschnitt("widerruf")).toBeUndefined();
    expect(HAUS_GMBH.widerrufWahlen).toEqual([]);
    expect(HAUS_GMBH.aufloesendeBedingung).toBe("");
    expect(HAUS_GMBH.abschnitte.map((a) => a.ueberschrift)).toEqual([
      "1. Käuferdaten", "2. Objektdaten", "3. Notar und Abwicklung", "4. Reservierungsgebühr und Kontoverbindung",
      "5. Reservierungsvereinbarung", "6. Datenschutzerklärung", "7. Unterschriften",
    ]);
  });

  it("lässt in Punkt 3 nur den ersten Satz stehen", () => {
    expect(text(HAUS_GMBH, "pflichtbeginn")).toBe("Die Pflichten von MOREImmo beginnen mit Zahlung der Reservierungsgebühr.");
  });

  it("ergänzt die Versicherung der Vertretungsbefugnis", () => {
    expect(text(HAUS_GMBH, "wirksamkeit")).toMatch(/Die Unterzeichnung erfolgt elektronisch\. Wer diese Vereinbarung für eine Gesellschaft unterzeichnet, versichert, zu ihrer Vertretung berechtigt zu sein, und weist dies auf Verlangen durch einen aktuellen Registerauszug oder eine Vollmacht nach\.$/);
    expect(text(HAUS, "wirksamkeit")).not.toContain("für eine Gesellschaft");
  });

  it("bestätigt über den Unterschriften nur den Satz ohne Widerruf", () => {
    expect(unterschriftBestaetigung({ gesamtobjekt: true, gesellschaft: true })).toBe(UNTERSCHRIFT_BESTAETIGUNG_OHNE_WIDERRUF);
  });

  it("führt Firma, Rechtsform, Sitz, Register und Vertreter statt Geburtsdatum und Güterstand", () => {
    const daten = {
      firma: "Muster Immobilien GmbH", rechtsform: "GmbH", firmaStrasse: "Hauptstraße", firmaHausnummer: "5",
      firmaPlz: "80331", firmaOrt: "München", registergericht: "Amtsgericht München", registernummer: "HRB 123456",
      vorname: "Max", nachname: "Muster", vertreterFunktion: "Geschäftsführer", telefon: "089 1234", email: "max@muster.test",
      iban: "",
    };
    expect(kaeuferZeilenGesellschaft(daten, true)).toEqual([
      { label: "Firma", wert: "Muster Immobilien GmbH" },
      { label: "Rechtsform", wert: "GmbH" },
      { label: "Sitz / Anschrift", wert: "Hauptstraße 5, 80331 München" },
      { label: "Registergericht / Nummer", wert: "Amtsgericht München, HRB 123456" },
      { label: "vertreten durch", wert: "Max Muster, Geschäftsführer" },
      { label: "Telefon", wert: "089 1234" },
      { label: "E-Mail", wert: "max@muster.test" },
      { label: "IBAN für die Rückzahlung", wert: "" },
    ]);
    expect(kaeuferZeilenGesellschaft(daten, false).some((z) => z.label.startsWith("IBAN"))).toBe(false);
    expect(unterschriftZeileGesellschaft(daten)).toBe("Für die Käuferin: Muster Immobilien GmbH, Max Muster, Geschäftsführer");
  });
});

describe("Die Gebühr beim Globalobjekt: fest 3.000 EUR, keine Staffel", () => {
  it("steht als eine Zeile an Stelle der Staffel, unabhängig vom Kaufpreis", () => {
    expect(GEBUEHR_GESAMTOBJEKT).toBe(3000);
    for (const preis of ["", "250.000", "2.500.000"]) {
      const a = gebuehrAbschnitt(preis, "Musterstraße 1", "", "Muster", { gesamtobjekt: true });
      expect(a.betrag).toBe("3.000,00 EUR");
      expect(a.staffel).toEqual([]);
      expect(a.zeilen[0]).toEqual({ label: "Reservierungsgebühr für ein Gesamtobjekt", wert: "3.000,00 EUR", betont: true });
      expect(a.zeilen.filter((z) => z.betont)).toHaveLength(1);
      expect(a.zeilen.some((z) => /Kaufpreis unter|Kaufpreis ab|Für diesen Kaufpreis/.test(z.label))).toBe(false);
    }
  });

  it("bildet den Verwendungszweck mit „Gesamtobjekt“ und Nachname oder Firma", () => {
    const zweck = (name: string) => gebuehrAbschnitt("2.000.000", "Musterstraße 1", "6", name, { gesamtobjekt: true })
      .zeilen.find((z) => z.label === "Verwendungszweck")?.wert;
    expect(zweck("Muster")).toBe("Reservierungsgebühr Musterstraße 1 Gesamtobjekt, Muster");
    expect(zweck("Muster Immobilien GmbH")).toBe("Reservierungsgebühr Musterstraße 1 Gesamtobjekt, Muster Immobilien GmbH");
  });

  it("trägt die Rückzahlungsregel samt drittem Satz und den Nummern dieser Fassung", () => {
    const regel = gebuehrAbschnitt("", "", "", "Muster", { gesamtobjekt: true }).rueckzahlung;
    expect(regel).toHaveLength(2);
    expect(regel[0]).toMatch(/^8\. Kommt der Kaufvertrag zustande/);
    expect(regel[1]).toMatch(/^9\. Die Reservierungsgebühr wird nicht erstattet/);
    expect(regel[1]).toContain("insbesondere weil der Verkäufer das Objekt nicht an den Kaufinteressenten verkauft");
  });

  it("lässt ohne Gebühr Gebührenabschnitt und Gebührenpunkte weg, Bestand und Benennung bleiben", () => {
    expect(HAUS_OHNE.abschnitt("gebuehr")).toBeUndefined();
    const kennungen = HAUS_OHNE.ziffern.map((z) => z.kennung);
    expect(kennungen).not.toContain("zahlung");
    expect(kennungen).not.toContain("verfall");
    expect(kennungen).toContain("bestand");
    expect(kennungen).toContain("benennung");
    // Der Fall ohne Gebühr bleibt wortgleich.
    expect(text(HAUS_OHNE, "pflichtbeginn")).toBe(text(vertragsAufbau({ gebuehrEntfaellt: true }), "pflichtbeginn"));
  });
});
