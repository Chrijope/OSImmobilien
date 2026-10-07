import { describe, it, expect } from "vitest";
import {
  FILTER_STANDARD,
  OHNE_ANGABE,
  filterAusGespeichertem,
  filterChips,
  istFilterGesetzt,
  ohneFeld,
  passtZumFilter,
  quellenAus,
  stellenAus,
  zaehleFilterwerte,
  type BewerberFilter,
  type FilterBewerber,
} from "./bewerberFilter";

/**
 * Der Wächter über den Filtern der Bewerberliste.
 *
 * Geprüft werden die Zusagen, an denen im Eingang wirklich etwas hängt:
 *
 *   1. Ohne gesetzten Filter fällt niemand heraus.
 *   2. Ein eingereichter Vorabbogen ist kein ausgefüllter Kennenlernbogen.
 *   3. Alle Filter wirken zusammen und nicht wahlweise.
 *   4. Die Zahl neben einer Auswahl sagt voraus, was ein Klick darauf ergibt.
 *   5. Ein gespeicherter Filter aus einer älteren Fassung filtert die Liste
 *      nicht versehentlich leer.
 */

/** Der 15.09.2026 war ein Dienstag. Alle Tage unten beziehen sich darauf. */
const HEUTE = new Date(2026, 8, 15, 10, 0, 0);

/** Ein Tag als ISO-Zeitpunkt, wie ihn `erstelltAm` trägt. */
function am(jahr: number, monat: number, tag: number): string {
  return new Date(jahr, monat - 1, tag, 9, 0, 0).toISOString();
}

function bewerber(teil: Partial<FilterBewerber> & { id: string }): FilterBewerber {
  return {
    kennenlernbogenAusgefuellt: false,
    eingangsmailVerschickt: false,
    erstelltAm: am(2026, 9, 15),
    quelle: "Website",
    stelleTitel: "Vertriebspartner",
    ...teil,
  };
}

function mitFilter(teil: Partial<BewerberFilter>): BewerberFilter {
  return { ...FILTER_STANDARD, ...teil };
}

describe("passtZumFilter: ohne Filter bleibt alles stehen", () => {
  it("lässt jeden Bewerber durch", () => {
    const leer: FilterBewerber = { id: "a", kennenlernbogenAusgefuellt: false, eingangsmailVerschickt: false };
    expect(passtZumFilter(leer, FILTER_STANDARD, HEUTE)).toBe(true);
    expect(passtZumFilter(bewerber({ id: "b" }), FILTER_STANDARD, HEUTE)).toBe(true);
  });

  it("meldet, dass nichts gesetzt ist", () => {
    expect(istFilterGesetzt(FILTER_STANDARD)).toBe(false);
    expect(istFilterGesetzt(mitFilter({ bogen: "offen" }))).toBe(true);
    expect(filterChips(FILTER_STANDARD)).toEqual([]);
  });
});

describe("Kennenlernbogen", () => {
  const ausgefuellt = bewerber({ id: "mit", kennenlernbogenAusgefuellt: true });
  const offen = bewerber({ id: "ohne", kennenlernbogenAusgefuellt: false });

  it("findet die ausgefüllten", () => {
    const filter = mitFilter({ bogen: "ausgefuellt" });
    expect(passtZumFilter(ausgefuellt, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(offen, filter, HEUTE)).toBe(false);
  });

  it("findet die offenen", () => {
    const filter = mitFilter({ bogen: "offen" });
    expect(passtZumFilter(offen, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(ausgefuellt, filter, HEUTE)).toBe(false);
  });

  it("zählt einen eingereichten Vorabbogen nicht als ausgefüllt", () => {
    /*
     * Der Vorabbogen liegt in derselben Tabelle und ergibt ebenfalls einen
     * Score. Für den Filter zählt er trotzdem nicht: Genau dieser Bewerber
     * braucht den neuen Bogen noch, und er darf aus der Liste der Offenen
     * nicht verschwinden.
     */
    const nurVorabbogen = bewerber({ id: "alt", kennenlernbogenAusgefuellt: false, einstufung: "B" });
    expect(passtZumFilter(nurVorabbogen, mitFilter({ bogen: "offen" }), HEUTE)).toBe(true);
    expect(passtZumFilter(nurVorabbogen, mitFilter({ bogen: "ausgefuellt" }), HEUTE)).toBe(false);
  });
});

describe("Vorabscore", () => {
  const a = bewerber({ id: "a", einstufung: "A" });
  const c = bewerber({ id: "c", einstufung: "C" });
  const ohne = bewerber({ id: "ohne", einstufung: null });

  it("wählt genau eine Einstufung", () => {
    expect(passtZumFilter(a, mitFilter({ score: "A" }), HEUTE)).toBe(true);
    expect(passtZumFilter(c, mitFilter({ score: "A" }), HEUTE)).toBe(false);
    expect(passtZumFilter(ohne, mitFilter({ score: "A" }), HEUTE)).toBe(false);
  });

  it("findet die ohne Score", () => {
    expect(passtZumFilter(ohne, mitFilter({ score: "ohne" }), HEUTE)).toBe(true);
    expect(passtZumFilter(a, mitFilter({ score: "ohne" }), HEUTE)).toBe(false);
  });
});

describe("Eingegangen am", () => {
  const heute = bewerber({ id: "heute", erstelltAm: am(2026, 9, 15) });
  const vorDreiTagen = bewerber({ id: "drei", erstelltAm: am(2026, 9, 12) });
  const vorZwanzigTagen = bewerber({ id: "zwanzig", erstelltAm: am(2026, 8, 26) });
  const uralt = bewerber({ id: "alt", erstelltAm: am(2026, 5, 1) });

  it("heute meint den Kalendertag", () => {
    const filter = mitFilter({ zeitraum: "heute" });
    expect(passtZumFilter(heute, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(vorDreiTagen, filter, HEUTE)).toBe(false);
  });

  it("sieben Tage sind heute und die sechs davor", () => {
    const filter = mitFilter({ zeitraum: "7tage" });
    expect(passtZumFilter(heute, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(vorDreiTagen, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(bewerber({ id: "sieben", erstelltAm: am(2026, 9, 9) }), filter, HEUTE)).toBe(true);
    expect(passtZumFilter(bewerber({ id: "acht", erstelltAm: am(2026, 9, 8) }), filter, HEUTE)).toBe(false);
  });

  it("dreißig Tage reichen weiter zurück", () => {
    const filter = mitFilter({ zeitraum: "30tage" });
    expect(passtZumFilter(vorZwanzigTagen, filter, HEUTE)).toBe(true);
    expect(passtZumFilter(uralt, filter, HEUTE)).toBe(false);
  });

  it("nimmt einen eigenen Zeitraum, auch halb offen", () => {
    expect(passtZumFilter(vorDreiTagen, mitFilter({ zeitraum: "eigen", von: "2026-09-10", bis: "2026-09-13" }), HEUTE)).toBe(true);
    expect(passtZumFilter(heute, mitFilter({ zeitraum: "eigen", von: "2026-09-10", bis: "2026-09-13" }), HEUTE)).toBe(false);
    expect(passtZumFilter(heute, mitFilter({ zeitraum: "eigen", von: "2026-09-10", bis: "" }), HEUTE)).toBe(true);
    expect(passtZumFilter(uralt, mitFilter({ zeitraum: "eigen", von: "", bis: "2026-06-01" }), HEUTE)).toBe(true);
  });

  it("ohne lesbares Datum fällt der Bewerber aus jedem Zeitraum", () => {
    const ohneDatum = bewerber({ id: "leer", erstelltAm: "" });
    expect(passtZumFilter(ohneDatum, mitFilter({ zeitraum: "alle" }), HEUTE)).toBe(true);
    expect(passtZumFilter(ohneDatum, mitFilter({ zeitraum: "30tage" }), HEUTE)).toBe(false);
  });
});

describe("Eingangsmail", () => {
  it("trennt verschickt und fehlt", () => {
    const mit = bewerber({ id: "mit", eingangsmailVerschickt: true });
    const ohne = bewerber({ id: "ohne", eingangsmailVerschickt: false });
    expect(passtZumFilter(mit, mitFilter({ mail: "verschickt" }), HEUTE)).toBe(true);
    expect(passtZumFilter(ohne, mitFilter({ mail: "verschickt" }), HEUTE)).toBe(false);
    expect(passtZumFilter(ohne, mitFilter({ mail: "fehlt" }), HEUTE)).toBe(true);
    expect(passtZumFilter(mit, mitFilter({ mail: "fehlt" }), HEUTE)).toBe(false);
  });
});

describe("Quelle und Stelle", () => {
  const website = bewerber({ id: "web", quelle: "Website", stelleTitel: "Vertriebspartner" });
  const ohneQuelle = bewerber({ id: "leer", quelle: "", stelleTitel: "" });

  it("vergleicht den genauen Wert", () => {
    expect(passtZumFilter(website, mitFilter({ quelle: "Website" }), HEUTE)).toBe(true);
    expect(passtZumFilter(website, mitFilter({ quelle: "Zapier" }), HEUTE)).toBe(false);
    expect(passtZumFilter(website, mitFilter({ stelle: "Vertriebspartner" }), HEUTE)).toBe(true);
  });

  it("findet die ohne Angabe", () => {
    expect(passtZumFilter(ohneQuelle, mitFilter({ quelle: OHNE_ANGABE }), HEUTE)).toBe(true);
    expect(passtZumFilter(website, mitFilter({ quelle: OHNE_ANGABE }), HEUTE)).toBe(false);
    expect(passtZumFilter(ohneQuelle, mitFilter({ stelle: OHNE_ANGABE }), HEUTE)).toBe(true);
  });

  it("sammelt die vorkommenden Werte, fehlende ans Ende", () => {
    const liste = [website, ohneQuelle, bewerber({ id: "zap", quelle: "Zapier", stelleTitel: "Tippgeber" })];
    expect(quellenAus(liste)).toEqual(["Website", "Zapier", OHNE_ANGABE]);
    expect(stellenAus(liste)).toEqual(["Tippgeber", "Vertriebspartner", OHNE_ANGABE]);
  });
});

describe("alle Filter wirken zusammen", () => {
  it("verlangt jede Bedingung, nicht irgendeine", () => {
    const passt = bewerber({
      id: "passt",
      kennenlernbogenAusgefuellt: true,
      einstufung: "A",
      eingangsmailVerschickt: true,
      erstelltAm: am(2026, 9, 14),
      quelle: "Website",
    });
    const filter = mitFilter({ bogen: "ausgefuellt", score: "A", mail: "verschickt", zeitraum: "7tage", quelle: "Website" });
    expect(passtZumFilter(passt, filter, HEUTE)).toBe(true);
    // Eine einzige Abweichung genügt, und der Bewerber fällt heraus.
    expect(passtZumFilter({ ...passt, einstufung: "B" }, filter, HEUTE)).toBe(false);
    expect(passtZumFilter({ ...passt, eingangsmailVerschickt: false }, filter, HEUTE)).toBe(false);
    expect(passtZumFilter({ ...passt, erstelltAm: am(2026, 7, 1) }, filter, HEUTE)).toBe(false);
  });
});

describe("zaehleFilterwerte", () => {
  const liste: FilterBewerber[] = [
    bewerber({ id: "1", kennenlernbogenAusgefuellt: true, einstufung: "A", eingangsmailVerschickt: true }),
    bewerber({ id: "2", kennenlernbogenAusgefuellt: true, einstufung: "C", eingangsmailVerschickt: true }),
    bewerber({ id: "3", einstufung: null, eingangsmailVerschickt: true, quelle: "Zapier" }),
    bewerber({ id: "4", einstufung: null, eingangsmailVerschickt: false, quelle: "Zapier" }),
    bewerber({ id: "5", einstufung: null, eingangsmailVerschickt: false, erstelltAm: am(2026, 4, 1) }),
  ];

  it("zählt ohne gesetzten Filter jeden Wert für sich", () => {
    const z = zaehleFilterwerte(liste, FILTER_STANDARD, HEUTE);
    expect(z.gesamt).toBe(5);
    expect(z.gezeigt).toBe(5);
    expect(z.bogen.ausgefuellt).toBe(2);
    expect(z.bogen.offen).toBe(3);
    expect(z.score.ohne).toBe(3);
    expect(z.mail.fehlt).toBe(2);
    expect(z.zeitraum.heute).toBe(4);
    expect(z.quelle.Zapier).toBe(2);
  });

  it("sagt voraus, was ein Klick ergäbe, und rechnet die übrigen Filter mit", () => {
    const filter = mitFilter({ mail: "verschickt" });
    const z = zaehleFilterwerte(liste, filter, HEUTE);
    // Drei haben die Mail bekommen, davon zwei mit ausgefülltem Bogen.
    expect(z.gezeigt).toBe(3);
    expect(z.bogen.ausgefuellt).toBe(2);
    expect(z.bogen.offen).toBe(1);
    // Die eigene Zeile bleibt die Gesamtzahl der Vorauswahl.
    expect(z.gesamt).toBe(5);
  });
});

describe("Chips und Zurücknehmen", () => {
  it("nennt jeden gesetzten Filter und nimmt ihn einzeln zurück", () => {
    const filter = mitFilter({ bogen: "offen", score: "A", quelle: "Website" });
    const chips = filterChips(filter);
    expect(chips.map((c) => c.feld)).toEqual(["bogen", "score", "quelle"]);
    const ohneScore = ohneFeld(filter, "score");
    expect(ohneScore.score).toBe("alle");
    expect(ohneScore.bogen).toBe("offen");
  });

  it("nimmt mit dem Zeitraum auch die beiden Datumsfelder zurück", () => {
    const filter = mitFilter({ zeitraum: "eigen", von: "2026-09-01", bis: "2026-09-10" });
    const zurueck = ohneFeld(filter, "zeitraum");
    expect(zurueck).toEqual(FILTER_STANDARD);
  });
});

describe("filterAusGespeichertem", () => {
  it("liest einen gemerkten Filter zurück", () => {
    const gemerkt = mitFilter({ bogen: "offen", zeitraum: "eigen", von: "2026-09-01", bis: "2026-09-10" });
    expect(filterAusGespeichertem(gemerkt)).toEqual(gemerkt);
  });

  it("fällt bei Unbekanntem still auf alle zurück", () => {
    expect(filterAusGespeichertem(null)).toEqual(FILTER_STANDARD);
    expect(filterAusGespeichertem("kaputt")).toEqual(FILTER_STANDARD);
    expect(filterAusGespeichertem({ bogen: "gibtEsNichtMehr", score: 7 })).toEqual(FILTER_STANDARD);
  });

  it("wirft die Datumsfelder weg, wenn der Zeitraum nicht eigen ist", () => {
    const gelesen = filterAusGespeichertem({ zeitraum: "heute", von: "2026-09-01", bis: "2026-09-10" });
    expect(gelesen.zeitraum).toBe("heute");
    expect(gelesen.von).toBe("");
    expect(gelesen.bis).toBe("");
  });
});
