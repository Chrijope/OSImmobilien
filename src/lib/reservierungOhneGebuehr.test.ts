import { describe, it, expect } from "vitest";
import {
  vertragsAufbau,
  VEREINBARUNG_ZIFFERN,
  WIDERRUF_WAHL_SOFORT,
  WIDERRUF_AUFLOESENDE_BEDINGUNG,
  UNTERSCHRIFT_BESTAETIGUNG,
  unterschriftBestaetigung,
  WIDERRUF_ENTFAELLT_OHNE_GEBUEHR,
  type AbschnittKennung,
  type ZifferKennung,
} from "./reservierungErklaerung";

/**
 * Die Reservierung ohne Reservierungsgebühr, seit dem 22.09.2026.
 *
 * Diese Datei bewacht die beiden Stellen, an denen ein Fehler hier teuer
 * wird: die Nummerierung samt Querverweisen und das Verhalten bestehender
 * Reservierungen, die das neue Feld gar nicht kennen.
 *
 * Die Nummern standen früher als fester Text in den Sätzen. Fällt ein
 * Abschnitt weg, zeigt so ein Verweis auf die falsche Stelle, und ein Vertrag
 * mit falschem Querverweis ist schlimmer als einer mit einem Abschnitt zu
 * viel. Deshalb entstehen die Nummern jetzt aus der Position, und jeder
 * Verweis ist ein Platzhalter auf eine Kennung.
 */

/** Alle Texte eines Aufbaus an einem Stück, zum Durchsuchen. */
const allerText = (opt: { gebuehrEntfaellt?: boolean }): string => {
  const a = vertragsAufbau(opt);
  return [
    ...a.abschnitte.map((x) => x.ueberschrift),
    ...a.ziffern.map((z) => `${z.nummer} ${z.text} ${(z.punkte || []).join(" ")}`),
  ].join("\n");
};

describe("Der Regelfall mit Gebühr bleibt Wort für Wort, wie er war", () => {
  it("hat dieselben acht Abschnitte in derselben Nummerierung", () => {
    const a = vertragsAufbau({});
    expect(a.abschnitte.map((x) => x.ueberschrift)).toEqual([
      "1. Käuferdaten",
      "2. Objektdaten",
      "3. Notar und Abwicklung",
      "4. Reservierungsgebühr und Kontoverbindung",
      "5. Reservierungsvereinbarung",
      "6. Datenschutzerklärung",
      "7. Widerrufsbelehrung",
      "8. Unterschriften",
    ]);
  });

  it("hat weiterhin neun Punkte, 1. bis 9.", () => {
    expect(VEREINBARUNG_ZIFFERN.map((z) => z.nummer)).toEqual(
      ["1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9."],
    );
  });

  /*
   * Der Umbau auf Platzhalter durfte den Wortlaut nicht anfassen. Ein Kunde,
   * der das Dokument vorher und nachher bekommt, muss dieselben Sätze sehen.
   * Die aufgelösten Verweise stehen deshalb hier im Klartext.
   */
  it("löst die Verweise zu genau den Zahlen auf, die vorher im Satz standen", () => {
    const punkt = (n: string) => VEREINBARUNG_ZIFFERN.find((z) => z.nummer === n)!;
    expect(punkt("3.").text).toContain("nach Abschnitt 7 gewählt");
    expect(punkt("5.").text).toContain("die in Abschnitt 4 nach dem Kaufpreis bestimmte");
    expect(punkt("5.").text).toContain("die in Punkt 2 genannten Tätigkeiten");
    expect(punkt("6.").text).toContain("auf das in Abschnitt 1 angegebene Konto");
    expect(WIDERRUF_WAHL_SOFORT.satz).toContain("den Leistungen nach Punkt 2 sofort");
    expect(WIDERRUF_AUFLOESENDE_BEDINGUNG).toContain("letzten Unterschrift (Punkt 8)");
  });

  it("lässt nirgends einen Platzhalter stehen", () => {
    for (const gebuehrEntfaellt of [false, true]) {
      expect(allerText({ gebuehrEntfaellt })).not.toContain("{{");
    }
    expect(WIDERRUF_WAHL_SOFORT.satz).not.toContain("{{");
    expect(WIDERRUF_AUFLOESENDE_BEDINGUNG).not.toContain("{{");
  });
});

describe("Eine bestehende Reservierung ohne das neue Feld", () => {
  /*
   * Die wichtigste Regel dieser Änderung: Alles, was heute existiert, kennt
   * `gebuehrEntfaellt` nicht und muss sich weiterhin wie „zahlt eine Gebühr"
   * verhalten. Deshalb ist das Feld negativ benannt, und nur ein
   * ausdrückliches `true` zählt.
   */
  it("verhält sich wie mit Gebühr, egal wie das fehlende Feld aussieht", () => {
    for (const opt of [{}, { gebuehrEntfaellt: undefined }, { gebuehrEntfaellt: false }]) {
      const a = vertragsAufbau(opt);
      expect(a.mitGebuehr).toBe(true);
      expect(a.mitWiderruf).toBe(true);
      expect(a.ziffern).toHaveLength(9);
      expect(a.ueberschrift("gebuehr")).toBe("4. Reservierungsgebühr und Kontoverbindung");
    }
  });

  it("nimmt nur ein ausdrückliches true als „zahlt nicht", () => {
    // Ein „1" oder „ja" aus einer alten Ablage darf die Gebühr nicht kippen.
    for (const wert of [1, "true", "ja", null]) {
      expect(vertragsAufbau({ gebuehrEntfaellt: wert as unknown as boolean }).mitGebuehr).toBe(true);
    }
  });
});

describe("Die Reservierung ohne Gebühr", () => {
  const ohne = vertragsAufbau({ gebuehrEntfaellt: true });

  it("lässt den Gebührenabschnitt und die Widerrufsbelehrung weg", () => {
    expect(ohne.mitGebuehr).toBe(false);
    expect(ohne.mitWiderruf).toBe(false);
    expect(ohne.abschnitte.map((x) => x.ueberschrift)).toEqual([
      "1. Käuferdaten",
      "2. Objektdaten",
      "3. Notar und Abwicklung",
      "4. Reservierungsvereinbarung",
      "5. Datenschutzerklärung",
      "6. Unterschriften",
    ]);
    expect(ohne.abschnitt("gebuehr")).toBeUndefined();
    expect(ohne.abschnitt("widerruf")).toBeUndefined();
  });

  it("zählt lückenlos durch, ohne Sprung von 4 auf 8", () => {
    expect(ohne.abschnitte.map((x) => x.nummer)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(ohne.ziffern.map((z) => z.nummer)).toEqual(["1.", "2.", "3.", "4.", "5.", "6."]);
  });

  it("lässt die drei Punkte zur Gebühr weg und behält die übrigen", () => {
    expect(ohne.ziffern.map((z) => z.kennung)).toEqual([
      "zeitraum", "pflichten", "pflichtbeginn", "abschlussfreiheit", "wirksamkeit", "dolmetscher",
    ]);
    const text = allerText({ gebuehrEntfaellt: true });
    expect(text).not.toContain("Reservierungsrisiko");
    expect(text).not.toContain("gegen Vorlage der schriftlichen Absage");
    expect(text).not.toContain("zurücküberwiesen");
  });

  /*
   * Der Wortlaut für den Beginn der Pflichten ohne Gebühr, entschieden von
   * Christian am 22.09.2026. Der zweite Satz sagt ausdrücklich, dass keine
   * Gebühr erhoben wird; ohne ihn fragt sich der Leser, ob etwas vergessen
   * wurde. Bitte nicht kürzen.
   */
  it("sagt in Punkt 3, wann die Pflichten dann beginnen", () => {
    const punkt3 = ohne.ziffern.find((z) => z.kennung === "pflichtbeginn")!;
    expect(punkt3.nummer).toBe("3.");
    expect(punkt3.text).toBe(
      "Die Pflichten von OS Immobilien beginnen mit Unterzeichnung dieser Vereinbarung. "
      + "Für diese Reservierung wird keine Reservierungsgebühr erhoben.",
    );
  });

  it("hat keine offene Stelle mehr, jeder Punkt ist formuliert", () => {
    expect(ohne.offeneZiffern).toEqual([]);
    expect(vertragsAufbau({}).offeneZiffern).toEqual([]);
  });

  it("bestätigt über den Unterschriften keine Belehrung, die nicht beiliegt", () => {
    expect(unterschriftBestaetigung({ gebuehrEntfaellt: true })).not.toContain("Widerrufsbelehrung");
    expect(unterschriftBestaetigung({})).toBe(UNTERSCHRIFT_BESTAETIGUNG);
  });

  it("erwähnt die Gebühr nur noch an der einen Stelle, die sie ausschließt", () => {
    const treffer = allerText({ gebuehrEntfaellt: true })
      .split("\n")
      .filter((z) => z.includes("Reservierungsgebühr"));
    expect(treffer).toHaveLength(1);
    expect(treffer[0]).toContain("wird keine Reservierungsgebühr erhoben");
  });
});

describe("Kein Verweis zeigt ins Leere", () => {
  /*
   * Die Probe aufs Exempel: Jeder Verweis wird gegen die tatsächlich
   * vergebenen Nummern geprüft, in beiden Fassungen. Zeigte einer auf eine
   * Stelle, die es in dieser Fassung nicht gibt, bräche `vertragsAufbau`
   * schon beim Zusammensetzen ab.
   */
  for (const gebuehrEntfaellt of [false, true]) {
    const name = gebuehrEntfaellt ? "ohne Gebühr" : "mit Gebühr";

    it(`lässt sich ${name} überhaupt zusammensetzen`, () => {
      expect(() => vertragsAufbau({ gebuehrEntfaellt })).not.toThrow();
    });

    it(`nennt ${name} nur Abschnitte und Punkte, die es gibt`, () => {
      const a = vertragsAufbau({ gebuehrEntfaellt });
      const abschnittNummern = new Set(a.abschnitte.map((x) => x.nummer));
      const zifferNummern = new Set(a.ziffern.map((z) => z.nummer.replace(".", "")));
      const text = allerText({ gebuehrEntfaellt });

      for (const [, nummer] of text.matchAll(/Abschnitt (\d+)/g)) {
        expect(abschnittNummern, `Abschnitt ${nummer}`).toContain(nummer);
      }
      for (const [, nummer] of text.matchAll(/Punkt (\d+)/g)) {
        expect(zifferNummern, `Punkt ${nummer}`).toContain(nummer);
      }
    });
  }

  it("bricht laut ab, wenn ein Platzhalter auf nichts zeigt", () => {
    /*
     * Der Schutzmechanismus selbst. Er lässt sich nur über einen erfundenen
     * Platzhalter prüfen, denn die echten Texte zeigen ja nirgends ins Leere.
     */
    const a = vertragsAufbau({ gebuehrEntfaellt: true });
    expect(() => a.verweise("siehe Abschnitt {{abschnitt:gebuehr}}")).toThrow(/ins Leere/);
    expect(() => a.verweise("siehe Punkt {{punkt:zahlung}}")).toThrow(/ins Leere/);
  });

  it("kennt jede Kennung, die eine Fassung vergibt", () => {
    const mit = vertragsAufbau({});
    const abschnitte: AbschnittKennung[] = [
      "kaeufer", "objekt", "notar", "gebuehr", "vereinbarung", "datenschutz", "widerruf", "unterschriften",
    ];
    const ziffern: ZifferKennung[] = [
      "zeitraum", "pflichten", "pflichtbeginn", "abschlussfreiheit",
      "zahlung", "rueckzahlung", "verfall", "wirksamkeit", "dolmetscher",
    ];
    expect(mit.abschnitte.map((x) => x.kennung)).toEqual(abschnitte);
    expect(mit.ziffern.map((z) => z.kennung)).toEqual(ziffern);
  });
});

describe("Der Schalter für die Widerrufsthematik", () => {
  /*
   * Ob die Belehrung ohne Gebühr entfallen darf, geht noch zum Anwalt.
   * Deshalb hängt der ganze Wegfall an einer Stelle. Dieser Test hält fest,
   * dass es wirklich nur diese eine ist.
   */
  it("steht auf „entfällt“, und der Aufbau folgt ihm", () => {
    const schalter: boolean = WIDERRUF_ENTFAELLT_OHNE_GEBUEHR;
    expect(schalter).toBe(true);
    // Der Aufbau folgt dem Schalter, nicht einer zweiten Annahme daneben.
    expect(vertragsAufbau({ gebuehrEntfaellt: true }).mitWiderruf).toBe(!schalter);
    // Mit Gebühr steht die Belehrung in jedem Fall im Dokument.
    expect(vertragsAufbau({}).mitWiderruf).toBe(true);
  });
});
