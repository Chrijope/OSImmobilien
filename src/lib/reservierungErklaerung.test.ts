import { describe, it, expect } from "vitest";
import {
  TEXT_FASSUNG,
  OBJEKT_EINLEITUNG,
  NOTAR_HINWEIS,
  VEREINBARUNG_EINLEITUNG,
  VEREINBARUNG_ZIFFERN,
  GEBUEHR_RUECKZAHLUNG,
  DATENSCHUTZ_EINVERSTAENDNIS,
  WIDERRUFSBELEHRUNG,
  WIDERRUF_WAHL_SOFORT,
  WIDERRUF_WAHL_ABWARTEN,
  WIDERRUF_AUFLOESENDE_BEDINGUNG,
  UNTERSCHRIFT_BESTAETIGUNG,
  gebuehrAbschnitt,
} from "./reservierungErklaerung";
import { IMPRESSUM_TELEFON, IMPRESSUM_EMAIL } from "./impressumKontakt";

/*
 * Diese Datei hält den Wortlaut der Reservierungsvereinbarung fest. Seit dem
 * 15.09.2026 ist es die gekürzte Fassung mit neun Punkten; wer einen Satz
 * ändern will, hebt die Fassung an. Die Tests prüfen nicht jeden Satz,
 * sondern die Stellen, an denen ein Abweichen rechtlich oder fachlich etwas
 * kostet.
 */
describe("Die Fassung des Vertragstextes", () => {
  it("ist ein Datum mit Buchstaben für die zweite Fassung des Tages", () => {
    expect(TEXT_FASSUNG).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
    // Angehoben am 22.09.2026: Punkt 6 hat einen zweiten Satz bekommen, und
    // es gibt seither die Fassung ohne Reservierungsgebühr.
    expect(TEXT_FASSUNG).toBe("2026-09-22");
  });
});

describe("Der Satz über den Objektdaten", () => {
  it("steht im Wortlaut der Vorlage", () => {
    expect(OBJEKT_EINLEITUNG).toBe(
      "Ich/Wir beabsichtige/n, das nachfolgend bezeichnete Objekt über MOREImmo zu erwerben.",
    );
  });

  /*
   * Zwei Schreibweisen des eigenen Namens in einem Vertrag sehen nach
   * Unachtsamkeit aus. Das Papier schreibt „MORE Immo", das System durchgehend
   * „MOREImmo"; hier gilt die des Systems, weil der übrige Text sie trägt.
   */
  it("schreibt den Firmennamen überall wie der übrige Text", () => {
    const alles = [
      OBJEKT_EINLEITUNG, NOTAR_HINWEIS, VEREINBARUNG_EINLEITUNG,
      ...VEREINBARUNG_ZIFFERN.map((z) => z.text), DATENSCHUTZ_EINVERSTAENDNIS,
      ...WIDERRUFSBELEHRUNG.flatMap((b) => b.absaetze), WIDERRUF_AUFLOESENDE_BEDINGUNG,
    ].join(" ");
    expect(alles).not.toContain("MORE Immo");
  });
});

describe("Abschnitt 3, Notar und Abwicklung", () => {
  it("schreibt kein hartes „ausschließlich bei unserem Notariat", () => {
    // MOREImmo hat diese Steuerung nicht; deshalb „in der Regel" und
    // „Zustimmung des Verkäufers".
    expect(NOTAR_HINWEIS).toContain("in der Regel");
    expect(NOTAR_HINWEIS).toContain("Zustimmung des Verkäufers");
    expect(NOTAR_HINWEIS).not.toContain("ausschließlich");
  });
});

describe("Abschnitt 5, die neun Punkte der Vereinbarung", () => {
  it("hat genau neun Punkte, 1. bis 9.", () => {
    expect(VEREINBARUNG_ZIFFERN).toHaveLength(9);
    expect(VEREINBARUNG_ZIFFERN.map((z) => z.nummer)).toEqual([
      "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.",
    ]);
  });

  const punkt = (n: string) => VEREINBARUNG_ZIFFERN.find((z) => z.nummer === n)!;

  it("nennt MOREImmo und den Kaufinteressenten als Parteien", () => {
    expect(VEREINBARUNG_EINLEITUNG).toBe("MOREImmo und der Kaufinteressent vereinbaren hinsichtlich des Kaufobjekts:");
  });

  /*
   * Entscheidung Christians vom 15.09.2026: keine Frist in Wochen. Das
   * Branchenmuster nennt vier Wochen, wir reservieren bis zum Notartermin.
   */
  it("reserviert bis zum vereinbarten Notartermin, ohne Wochenfrist", () => {
    const alles = VEREINBARUNG_ZIFFERN.map((z) => z.text).join(" ");
    expect(punkt("1.").text).toContain("bis zum vereinbarten Notartermin");
    expect(alles).not.toMatch(/Wochen/);
  });

  it("hat in Punkt 2 die vier Pflichten a) bis d)", () => {
    expect(punkt("2.").punkte?.map((p) => p.slice(0, 2))).toEqual(["a)", "b)", "c)", "d)"]);
    // Nur hinwirken, nicht versprechen: MOREImmo ist nicht Eigentümer.
    expect(punkt("2.").punkte?.[1]).toContain("darauf hinzuwirken, dass der Verkäufer");
    expect(punkt("2.").punkte?.[1]).not.toMatch(/^b\) das Objekt .* nicht anderweitig zu veräußern/);
  });

  it("lässt die Pflichten mit der Zahlung beginnen und verweist auf die Wahl in Abschnitt 7", () => {
    expect(punkt("3.").text).toContain("beginnen mit Zahlung der Reservierungsgebühr");
    expect(punkt("3.").text).toContain("Abschnitt 7");
  });

  it("nennt die Abschlussfreiheit für alle drei Beteiligten, das Gegenmittel zu § 311b BGB", () => {
    expect(punkt("4.").text).toContain("Weder der Kaufinteressent noch MOREImmo noch der Verkäufer");
    expect(punkt("4.").text).toContain("beiderseits frei");
  });

  it("macht die Gebühr binnen sieben Tagen fällig und erklärt, was sie abdeckt", () => {
    const t = punkt("5.").text;
    expect(t).toContain("Abschnitt 4");
    expect(t).toContain("innerhalb von sieben Tagen nach Unterzeichnung");
    expect(t).toContain("in Punkt 2 genannten Tätigkeiten");
    expect(t).toContain("Reservierungsrisiko");
    expect(t).toContain("Mehraufwand");
  });

  it("zahlt bei Beurkundung am selben Tag auf das Konto aus Abschnitt 1 zurück", () => {
    expect(punkt("6.").text).toContain("am Tag der notariellen Beurkundung vollständig");
    expect(punkt("6.").text).toContain("Abschnitt 1");
  });

  /*
   * Freigabe Christians vom 22.09.2026, zusammen mit der freiwilligen IBAN:
   * Der Vertrag regelt den Fall der fehlenden Bankverbindung jetzt selbst.
   * Ohne diesen Satz zeigte Punkt 6 auf eine leere Zeile.
   */
  it("regelt den Fall, dass gar kein Konto angegeben ist", () => {
    const t = punkt("6.").text;
    expect(t).toContain("Ist dort kein Konto angegeben");
    expect(t).toContain("vor der Beurkundung mit");
    expect(t).toContain("unverzüglich nach Eingang dieser Mitteilung");
  });

  /*
   * Entscheidung Christians vom 15.09.2026: Rückzahlung bei
   * Finanzierungsabsage gegen die schriftliche Absage der Bank.
   */
  it("behält die Gebühr nur bei Verschulden und zahlt bei Finanzierungsabsage gegen Nachweis zurück", () => {
    const t = punkt("7.").text;
    expect(t).toContain("allein oder überwiegend zu vertreten");
    expect(t).toContain("gegen Vorlage der schriftlichen Absage vollständig zurückgezahlt");
    expect(t).toContain("vollständig und wahrheitsgemäß");
  });

  it("wird ohne Gegenzeichnung wirksam und wird elektronisch unterzeichnet", () => {
    expect(punkt("8.").text).toContain("Gegenzeichnung durch MOREImmo ist nicht erforderlich");
    expect(punkt("8.").text).toContain("elektronisch");
  });

  it("verlangt einen öffentlich bestellten und vereidigten Dolmetscher", () => {
    expect(punkt("9.").text).toContain("öffentlich bestellter und vereidigter Dolmetscher");
  });

  it("bündelt die Rückzahlungsregel aus den Punkten 6 und 7", () => {
    expect(GEBUEHR_RUECKZAHLUNG).toHaveLength(2);
    expect(GEBUEHR_RUECKZAHLUNG[0]).toMatch(/^6\. /);
    expect(GEBUEHR_RUECKZAHLUNG[1]).toMatch(/^7\. /);
  });

  // Die alten Ziffern gibt es nicht mehr; ein Verweis darauf liefe ins Leere.
  it("verweist nirgends mehr auf eine Ziffer 5.x", () => {
    const alles = [
      ...VEREINBARUNG_ZIFFERN.map((z) => z.text),
      WIDERRUF_WAHL_SOFORT.satz, WIDERRUF_WAHL_ABWARTEN.satz, WIDERRUF_AUFLOESENDE_BEDINGUNG,
    ].join(" ");
    expect(alles).not.toMatch(/Ziffer 5\./);
  });
});

describe("Abschnitt 6, Datenschutzerklärung", () => {
  it("ist ein Einverständnis ohne Ankreuzfeld und nennt die Empfänger", () => {
    expect(DATENSCHUTZ_EINVERSTAENDNIS).toMatch(/^Ich\/Wir bin\/sind damit einverstanden/);
    for (const empfaenger of ["Verkäufer", "Notariat", "finanzierendes Kreditinstitut", "Vertriebspartner", "Hausverwaltung"]) {
      expect(DATENSCHUTZ_EINVERSTAENDNIS).toContain(empfaenger);
    }
    expect(DATENSCHUTZ_EINVERSTAENDNIS).toContain("auf freiwilliger Basis");
    expect(DATENSCHUTZ_EINVERSTAENDNIS).toContain("portal.more.immo/datenschutz");
  });
});

describe("Abschnitt 7, Widerrufsbelehrung", () => {
  it("trägt die beiden Blöcke des gesetzlichen Musters", () => {
    expect(WIDERRUFSBELEHRUNG.map((b) => b.ueberschrift)).toEqual(["Widerrufsrecht", "Folgen des Widerrufs"]);
  });

  it("bleibt in der Sie-Form, das ist gesetzlicher Wortlaut", () => {
    const text = WIDERRUFSBELEHRUNG.flatMap((b) => b.absaetze).join(" ");
    expect(text).toContain("Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.");
    expect(text).not.toMatch(/\bdu\b/i);
  });

  // Die Anlage ist am 15.09.2026 entfallen; ein Verweis auf ein Formular,
  // das nicht beiliegt, wäre irreführend.
  it("verweist nicht mehr auf ein beigefügtes Muster-Widerrufsformular", () => {
    const text = WIDERRUFSBELEHRUNG.flatMap((b) => b.absaetze).join(" ");
    expect(text).not.toContain("Muster-Widerrufsformular");
    expect(text).toContain("Zur Wahrung der Widerrufsfrist reicht es aus");
  });

  /*
   * Seit dem 28.05.2022 ist die Telefonnummer Pflichtbestandteil der
   * Belehrung. Sie kommt aus dem Impressum; ist sie dort gefüllt, steht sie
   * hier, und die Mailadresse ebenso.
   */
  it("nennt Telefon und E-Mail des Unternehmers aus dem Impressum", () => {
    const text = WIDERRUFSBELEHRUNG[0].absaetze.join(" ");
    expect(IMPRESSUM_TELEFON).not.toBe("");
    expect(text).toContain(`Telefon ${IMPRESSUM_TELEFON}`);
    expect(text).toContain(`E-Mail ${IMPRESSUM_EMAIL}`);
    expect(text).not.toContain("Grundlage fehlt");
    expect(text).not.toContain("moreimmo.de");
  });

  it("verlangt beim sofortigen Beginn die ausdrückliche Zustimmung und die Kenntnis vom Erlöschen", () => {
    expect(WIDERRUF_WAHL_SOFORT.satz).toContain("verlange ausdrücklich");
    expect(WIDERRUF_WAHL_SOFORT.erlaeuterung).toContain("§ 356 Abs. 4 BGB");
  });

  /*
   * Entscheidung Christians vom 15.09.2026: Beim Abwarten ist die Wohnung
   * bis zum Fristablauf ausdrücklich nicht reserviert, und die Frist läuft
   * ab der letzten Unterschrift.
   */
  it("sagt beim Abwarten, dass die Wohnung bis zum Fristablauf nicht reserviert ist", () => {
    expect(WIDERRUF_WAHL_ABWARTEN.satz).toContain("erst nach Ablauf der Widerrufsfrist");
    expect(WIDERRUF_WAHL_ABWARTEN.erlaeuterung).toContain("nicht für mich reserviert");
    expect(WIDERRUF_WAHL_ABWARTEN.erlaeuterung).toContain("vollständig zurückgezahlt");
    expect(WIDERRUF_AUFLOESENDE_BEDINGUNG).toContain("auflösende Bedingung");
    expect(WIDERRUF_AUFLOESENDE_BEDINGUNG).toContain("letzten Unterschrift");
  });
});

describe("Abschnitt 8, Unterschriften", () => {
  it("bestätigt Belehrung und Kopie in einem Satz, ohne die entfallene Anlage", () => {
    expect(UNTERSCHRIFT_BESTAETIGUNG).toContain("Widerrufsbelehrung");
    expect(UNTERSCHRIFT_BESTAETIGUNG).not.toContain("Muster-Widerrufsformular");
    expect(UNTERSCHRIFT_BESTAETIGUNG).toContain("dauerhaften Datenträger");
  });
});

describe("Der Gebührenabschnitt", () => {
  it("nennt bei kleinem Kaufpreis 1.000 EUR", () => {
    const a = gebuehrAbschnitt("250.000", "Roonstraße 3", "6", "Muster");
    expect(a.betrag).toBe("1.000,00 EUR");
    expect(a.zeilen[0]).toEqual({ label: "Für diesen Kaufpreis", wert: "1.000,00 EUR", betont: true });
  });

  /*
   * Die Betonung trägt genau eine Zeile: der Betrag für diesen Kaufpreis.
   * Stünden Kontoinhaber und IBAN in derselben Stärke, hebt sich nichts mehr
   * ab und der Abschnitt ist wieder so flach wie vorher.
   */
  it("betont nur den Betrag, nicht die Bankverbindung", () => {
    const a = gebuehrAbschnitt("400.000", "Roonstraße 3", "6", "Muster");
    expect(a.zeilen.filter((z) => z.betont)).toEqual([
      { label: "Für diesen Kaufpreis", wert: "1.500,00 EUR", betont: true },
    ]);
  });

  /*
   * Die Staffel gehört zum Vertragstext und steht deshalb immer da, auch wenn
   * der Kaufpreis den Betrag längst festlegt. Im Papierformular ist es ebenso.
   */
  it("zeigt die Staffel immer, mit beiden Stufen", () => {
    for (const preis of ["", "250.000", "400.000"]) {
      const a = gebuehrAbschnitt(preis, "Roonstraße 3", "6", "Muster");
      expect(a.staffel).toEqual([
        { bereich: "Kaufpreis unter 300.000,00 EUR", betrag: "1.000,00 EUR" },
        { bereich: "Kaufpreis ab 300.000,00 EUR", betrag: "1.500,00 EUR" },
      ]);
    }
  });

  it("nennt die Frist von sieben Tagen im Einleitungssatz", () => {
    expect(gebuehrAbschnitt("250.000", "", "", "Muster").einleitung)
      .toContain("innerhalb von sieben Tagen nach Unterzeichnung");
  });

  it("nennt ab 300.000 den höheren Betrag", () => {
    expect(gebuehrAbschnitt("300.000", "", "", "Muster").betrag).toBe("1.500,00 EUR");
    expect(gebuehrAbschnitt("363.000", "", "", "Muster").betrag).toBe("1.500,00 EUR");
  });

  it("weist keinen Betrag aus, wenn der Kaufpreis fehlt", () => {
    const a = gebuehrAbschnitt("", "", "", "Muster");
    expect(a.betrag).toBeNull();
    // Keine Zeile darf dann einen Betrag behaupten.
    expect(a.zeilen.some((z) => z.label === "Für diesen Kaufpreis")).toBe(false);
  });

  it("bildet den Verwendungszweck aus Objekt und Nachname", () => {
    const a = gebuehrAbschnitt("400.000", "Roonstraße 3", "6", "Muster");
    const zweck = a.zeilen.find((z) => z.label === "Verwendungszweck");
    expect(zweck?.wert).toBe("Reservierungsgebühr Roonstraße 3 WE 6, Muster");
  });

  it("lässt den Verwendungszweck weg, solange nichts feststeht", () => {
    const a = gebuehrAbschnitt("400.000", "", "", "");
    expect(a.zeilen.some((z) => z.label === "Verwendungszweck")).toBe(false);
  });

  it("nennt die Bankverbindung immer, auch ohne Kaufpreis", () => {
    for (const preis of ["", "400.000"]) {
      const label = gebuehrAbschnitt(preis, "", "", "Muster").zeilen.map((z) => z.label);
      expect(label).toContain("IBAN");
      expect(label).toContain("Kontoinhaber");
    }
  });

  /*
   * Der wichtigste Test des Moduls. Ohne die Rückzahlungsregel beschreibt das
   * Dokument eine andere Gebühr als die vereinbarte, und genau daran ist die
   * Klausel im BGH-Urteil vom 20.04.2023 gescheitert.
   */
  it("trägt die Rückzahlungsregel bei jeder Nennung des Betrags", () => {
    for (const preis of ["", "250.000", "400.000"]) {
      const text = gebuehrAbschnitt(preis, "", "", "Muster").rueckzahlung.join(" ");
      expect(text).toContain("vollständig zurück");
      expect(text).toContain("Beurkundung");
    }
  });
});
