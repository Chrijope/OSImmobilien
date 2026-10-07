import { describe, it, expect } from "vitest";
import {
  tagInZone,
  uhrzeitInZone,
  tagPlus,
  gruppiereNachTag,
  vorausschauGrenzen,
  fensterTage,
  kannVor,
  kannZurueck,
  blaettere,
  beschriftungTag,
  beschriftungDatumLang,
  beschriftungZeitraum,
  beschriftungZeitKnopf,
  beschriftungDauer,
  passendeTerminart,
  waehleTerminart,
  istEmail,
  deuteBuchungsfehler,
  gliedereBeschreibung,
  teileNachTageszeit,
} from "@/lib/buchungAuswahl";

const BERLIN = "Europe/Berlin";

describe("Zeitpunkte in der Zone des Beraters", () => {
  it("liest den Kalendertag in der Zone und nicht in UTC", () => {
    // 22:30 UTC ist in Berlin schon der nächste Tag.
    expect(tagInZone("2026-08-04T22:30:00Z", BERLIN)).toBe("2026-08-05");
    expect(tagInZone("2026-08-04T22:30:00Z", "UTC")).toBe("2026-08-04");
  });

  it("liest die Uhrzeit in der Zone, auch über die Sommerzeit hinweg", () => {
    // Sommerzeit: zwei Stunden Versatz.
    expect(uhrzeitInZone("2026-08-04T07:30:00Z", BERLIN)).toBe("09:30");
    // Winterzeit: nur eine Stunde.
    expect(uhrzeitInZone("2026-12-04T07:30:00Z", BERLIN)).toBe("08:30");
  });

  it("zeigt Mitternacht als 00:00 und nicht als 24:00", () => {
    expect(uhrzeitInZone("2026-08-04T22:00:00Z", BERLIN)).toBe("00:00");
  });
});

describe("Rechnen mit Kalendertagen", () => {
  it("verschiebt über Monatsgrenzen hinweg", () => {
    expect(tagPlus("2026-08-31", 1)).toBe("2026-09-01");
    expect(tagPlus("2026-01-01", -1)).toBe("2025-12-31");
    expect(tagPlus("2026-08-04", 0)).toBe("2026-08-04");
  });
});

describe("Freie Zeiten nach Tagen ordnen", () => {
  it("bildet je Kalendertag eine Gruppe, aufsteigend sortiert", () => {
    const gruppen = gruppiereNachTag(
      [
        "2026-08-05T08:00:00Z",
        "2026-08-04T13:00:00Z",
        "2026-08-04T07:00:00Z",
      ],
      BERLIN,
    );
    expect(gruppen.map((g) => g.tag)).toEqual(["2026-08-04", "2026-08-05"]);
    expect(gruppen[0].zeiten).toEqual(["2026-08-04T07:00:00Z", "2026-08-04T13:00:00Z"]);
    expect(gruppen[1].zeiten).toHaveLength(1);
  });

  it("ordnet späte Zeiten dem Tag der Beraterzone zu", () => {
    // 22:30 UTC gehört in Berlin bereits zum 5. August.
    const gruppen = gruppiereNachTag(["2026-08-04T22:30:00Z"], BERLIN);
    expect(gruppen[0].tag).toBe("2026-08-05");
  });

  it("übergeht unbrauchbare Einträge, statt abzustürzen", () => {
    const gruppen = gruppiereNachTag(["nicht-datum", "2026-08-04T07:00:00Z"], BERLIN);
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].zeiten).toHaveLength(1);
  });

  it("gibt bei leerer Eingabe eine leere Liste zurück", () => {
    expect(gruppiereNachTag([], BERLIN)).toEqual([]);
  });

  /*
   * `buchung_freie_zeiten` zählt zwei Fenster desselben Tages mit UNION ALL
   * zusammen und entfernt dabei nichts. Überlappen sie sich, kommt dieselbe
   * Startzeit zweimal zurück. In der Auswahl stünde derselbe Knopf dann
   * doppelt, und React bekäme zweimal denselben Schlüssel.
   */
  it("führt dieselbe Startzeit nur einmal auf", () => {
    const gruppen = gruppiereNachTag(
      ["2026-08-04T07:00:00Z", "2026-08-04T07:00:00Z", "2026-08-04T08:00:00Z"],
      BERLIN,
    );
    expect(gruppen).toHaveLength(1);
    expect(gruppen[0].zeiten).toEqual(["2026-08-04T07:00:00Z", "2026-08-04T08:00:00Z"]);
  });

  it("erkennt denselben Zeitpunkt auch in anderer Schreibweise als doppelt", () => {
    const gruppen = gruppiereNachTag(
      ["2026-08-04T07:00:00Z", "2026-08-04T09:00:00+02:00"],
      BERLIN,
    );
    expect(gruppen[0].zeiten).toEqual(["2026-08-04T07:00:00Z"]);
  });
});

describe("Grenzen der Vorausschau", () => {
  it("beginnt heute und endet nach der Vorausschau der Terminart", () => {
    const { ersterTag, letzterTag } = vorausschauGrenzen("2026-08-04T10:00:00Z", BERLIN, 60);
    expect(ersterTag).toBe("2026-08-04");
    expect(letzterTag).toBe("2026-10-03");
  });

  it("verträgt eine Vorausschau von null Tagen", () => {
    const { ersterTag, letzterTag } = vorausschauGrenzen("2026-08-04T10:00:00Z", BERLIN, 0);
    expect(ersterTag).toBe(letzterTag);
  });

  it("schneidet die Seite am letzten buchbaren Tag ab", () => {
    expect(fensterTage("2026-08-03", 7, "2026-08-05")).toEqual([
      "2026-08-03", "2026-08-04", "2026-08-05",
    ]);
    expect(fensterTage("2026-08-03", 7, "2026-12-31")).toHaveLength(7);
  });
});

describe("Blättern innerhalb der Vorausschau", () => {
  const ersterTag = "2026-08-04";
  const letzterTag = "2026-10-03";

  it("kennt die Enden des Zeitraums", () => {
    expect(kannZurueck(ersterTag, ersterTag)).toBe(false);
    expect(kannZurueck("2026-08-11", ersterTag)).toBe(true);
    expect(kannVor("2026-09-28", 7, letzterTag)).toBe(false);
    expect(kannVor("2026-08-04", 7, letzterTag)).toBe(true);
  });

  it("blättert vor und zurück", () => {
    expect(blaettere("2026-08-10", 7, ersterTag, letzterTag)).toBe("2026-08-17");
    expect(blaettere("2026-08-17", -7, ersterTag, letzterTag)).toBe("2026-08-10");
  });

  it("geht nicht vor den ersten buchbaren Tag zurück", () => {
    expect(blaettere("2026-08-05", -7, ersterTag, letzterTag)).toBe(ersterTag);
  });

  it("bleibt stehen, wenn hinter der Seite nichts mehr kommt", () => {
    expect(blaettere("2026-10-01", 7, ersterTag, letzterTag)).toBe("2026-10-01");
  });
});

describe("Beschriftungen", () => {
  it("beschriftet eine Tagesspalte kurz", () => {
    expect(beschriftungTag("2026-08-04")).toEqual({ wochentag: "Di", datum: "4. Aug." });
    expect(beschriftungTag("2026-03-01")).toEqual({ wochentag: "So", datum: "1. März" });
  });

  it("schreibt das Datum aus", () => {
    expect(beschriftungDatumLang("2026-08-04")).toBe("Dienstag, 4. August 2026");
  });

  it("nennt die Spanne eines Termins in der Zone des Beraters", () => {
    expect(beschriftungZeitraum("2026-08-04T07:30:00Z", 60, BERLIN)).toBe(
      "Dienstag, 4. August 2026, 09:30 bis 10:30 Uhr",
    );
  });

  it("gibt bei unbrauchbarer Zeit einen leeren Text zurück", () => {
    expect(beschriftungZeitraum("kaputt", 60, BERLIN)).toBe("");
  });

  it("beschriftet einen Zeitknopf vorlesbar", () => {
    expect(beschriftungZeitKnopf("2026-08-04T07:30:00Z", BERLIN)).toBe(
      "Dienstag, 4. August 2026, 09:30 Uhr",
    );
  });

  it("nennt die Dauer in Stunden und Minuten", () => {
    expect(beschriftungDauer(30)).toBe("30 Minuten");
    expect(beschriftungDauer(60)).toBe("1 Stunde");
    expect(beschriftungDauer(90)).toBe("1 Stunde 30 Minuten");
    expect(beschriftungDauer(120)).toBe("2 Stunden");
  });
});

describe("Terminart einer bestehenden Buchung wiederfinden", () => {
  const arten = [
    { id: "a", bezeichnung: "Erstberatung", dauer_minuten: 60 },
    { id: "b", bezeichnung: "Kurzes Kennenlernen", dauer_minuten: 30 },
  ];

  it("findet sie über die Bezeichnung", () => {
    expect(passendeTerminart(arten, { bezeichnung: "erstberatung", dauerMinuten: 90 })?.id).toBe("a");
  });

  it("weicht auf die Dauer aus, wenn die Bezeichnung fehlt", () => {
    expect(passendeTerminart(arten, { bezeichnung: null, dauerMinuten: 30 })?.id).toBe("b");
  });

  it("nimmt die einzige vorhandene Terminart", () => {
    expect(passendeTerminart([arten[0]], { bezeichnung: "Etwas anderes", dauerMinuten: 15 })?.id).toBe("a");
  });

  it("gibt lieber nichts zurück als etwas Falsches", () => {
    expect(passendeTerminart(arten, { bezeichnung: "Unbekannt", dauerMinuten: 15 })).toBeNull();
    expect(passendeTerminart([], { bezeichnung: "Erstberatung", dauerMinuten: 60 })).toBeNull();
  });
});

describe("Terminart über ihre Kennung bestimmen", () => {
  const arten = [
    { id: "a", bezeichnung: "Erstberatung", dauer_minuten: 60 },
    { id: "b", bezeichnung: "Kurzes Kennenlernen", dauer_minuten: 30 },
  ];

  it("nimmt die Kennung, auch wenn die Terminart inzwischen umbenannt wurde", () => {
    // Genau der Befund: Nach einer Umbenennung fand das Raten über
    // Bezeichnung und Dauer nichts mehr, und Verschieben blieb gesperrt.
    expect(
      waehleTerminart(arten, { id: "a", bezeichnung: "Alter Name", dauerMinuten: 45 })?.id,
    ).toBe("a");
  });

  it("rät weiter, wenn die Kennung fehlt", () => {
    expect(waehleTerminart(arten, { bezeichnung: "Erstberatung" })?.id).toBe("a");
    expect(waehleTerminart(arten, { id: null, dauerMinuten: 30 })?.id).toBe("b");
  });

  it("rät weiter, wenn es die Kennung nicht mehr gibt", () => {
    // Die Terminart wurde gelöscht, `terminart_id` steht dann auf NULL oder
    // zeigt ins Leere.
    expect(waehleTerminart(arten, { id: "weg", bezeichnung: "Erstberatung" })?.id).toBe("a");
  });

  it("gibt nichts zurück, wenn weder Kennung noch Raten trifft", () => {
    expect(waehleTerminart(arten, { id: "weg", bezeichnung: "Unbekannt", dauerMinuten: 15 })).toBeNull();
  });
});

describe("E-Mail-Prüfung", () => {
  it("nimmt gültige Adressen an und weist unvollständige ab", () => {
    expect(istEmail("kunde@example.de")).toBe(true);
    expect(istEmail("  kunde@example.de  ")).toBe(true);
    expect(istEmail("kunde@example")).toBe(false);
    expect(istEmail("kunde")).toBe(false);
    expect(istEmail("")).toBe(false);
  });
});

describe("Fehler der Datenbank übersetzen", () => {
  it("erkennt die vergebene Zeit und verlangt neue Zeiten", () => {
    const deutung = deuteBuchungsfehler(new Error("Diese Zeit ist inzwischen vergeben"));
    expect(deutung.neuLaden).toBe(true);
    expect(deutung.text).toContain("gerade eben");
  });

  it("erkennt den ungültigen Link und lädt nicht neu", () => {
    const deutung = deuteBuchungsfehler(new Error("Dieser Buchungslink ist nicht mehr gueltig"));
    expect(deutung.neuLaden).toBe(false);
    expect(deutung.text).toContain("nicht mehr gültig");
  });

  it("erkennt eine zu kurzfristige Zeit", () => {
    expect(deuteBuchungsfehler(new Error("Dieser Termin liegt zu kurzfristig")).neuLaden).toBe(true);
  });

  it("hat für Unbekanntes einen verständlichen Satz", () => {
    const deutung = deuteBuchungsfehler(new Error("relation does not exist"));
    expect(deutung.text.length).toBeGreaterThan(10);
  });

  it("stürzt bei fehlender Meldung nicht ab", () => {
    expect(deuteBuchungsfehler(undefined).text.length).toBeGreaterThan(10);
  });

  /*
   * Nicht jeder Fehler kommt als `Error`-Klasse. Supabase hat den Fehler einer
   * RPC früher als schlichtes Objekt geliefert. Ginge so eines durch
   * `String(...)`, stünde dort "[object Object]" und jede Meldung der
   * Datenbank wäre verloren: Der Kunde bekäme selbst bei einer inzwischen
   * vergebenen Zeit nur den allgemeinen Satz zu sehen.
   */
  it("liest die Meldung auch aus einem schlichten Fehlerobjekt", () => {
    const deutung = deuteBuchungsfehler({
      message: "Diese Zeit ist inzwischen vergeben",
      code: "P0001",
      details: "",
      hint: "",
    });
    expect(deutung.neuLaden).toBe(true);
    expect(deutung.text).toContain("gerade eben");
  });

  it("liest die Meldung auch aus einer reinen Zeichenkette", () => {
    const deutung = deuteBuchungsfehler("Dieser Termin liegt zu weit in der Zukunft");
    expect(deutung.text).toContain("zu weit in der Zukunft");
  });
});

describe("Beschreibung einer Terminart gliedern", () => {
  it("trennt Absätze an Leerzeilen", () => {
    const bloecke = gliedereBeschreibung("Erster Absatz.\n\nZweiter Absatz.");
    expect(bloecke).toEqual([
      { art: "absatz", zeilen: ["Erster Absatz."] },
      { art: "absatz", zeilen: ["Zweiter Absatz."] },
    ]);
  });

  it("behält einfache Zeilenumbrüche innerhalb eines Absatzes", () => {
    const bloecke = gliedereBeschreibung("Erste Zeile\nZweite Zeile");
    expect(bloecke).toEqual([{ art: "absatz", zeilen: ["Erste Zeile", "Zweite Zeile"] }]);
  });

  it("erkennt eine Aufzählung mit Strich, Sternchen und Punkt", () => {
    const bloecke = gliedereBeschreibung("- Erstens\n* Zweitens\n• Drittens");
    expect(bloecke).toEqual([{ art: "liste", punkte: ["Erstens", "Zweitens", "Drittens"] }]);
  });

  it("mischt Absatz und Aufzählung in der richtigen Reihenfolge", () => {
    const bloecke = gliedereBeschreibung(
      "Wir besprechen:\n- Ihre Lage\n- Ihre Ziele\nDanach entscheiden Sie.",
    );
    expect(bloecke).toEqual([
      { art: "absatz", zeilen: ["Wir besprechen:"] },
      { art: "liste", punkte: ["Ihre Lage", "Ihre Ziele"] },
      { art: "absatz", zeilen: ["Danach entscheiden Sie."] },
    ]);
  });

  it("kommt mit Windows-Zeilenenden zurecht", () => {
    expect(gliedereBeschreibung("Eins\r\n\r\nZwei")).toEqual([
      { art: "absatz", zeilen: ["Eins"] },
      { art: "absatz", zeilen: ["Zwei"] },
    ]);
  });

  it("gibt für leeren Text nichts zurück", () => {
    expect(gliedereBeschreibung("")).toEqual([]);
    expect(gliedereBeschreibung(null)).toEqual([]);
    expect(gliedereBeschreibung(undefined)).toEqual([]);
  });

  it("gibt für reine Leerzeichen und Leerzeilen nichts zurück", () => {
    expect(gliedereBeschreibung("   \n\n \t \n  ")).toEqual([]);
  });

  it("wirft leere Aufzählungspunkte weg", () => {
    expect(gliedereBeschreibung("-\n- Echter Punkt\n*  ")).toEqual([
      { art: "liste", punkte: ["Echter Punkt"] },
    ]);
  });

  it("lässt eine sehr lange Zeile ohne Umbruch unangetastet", () => {
    const lang = "Wort ".repeat(400).trim();
    const bloecke = gliedereBeschreibung(lang);
    expect(bloecke).toEqual([{ art: "absatz", zeilen: [lang] }]);
  });

  it("behandelt mehrere Leerzeilen wie eine einzige Trennung", () => {
    expect(gliedereBeschreibung("Eins\n\n\n\nZwei")).toEqual([
      { art: "absatz", zeilen: ["Eins"] },
      { art: "absatz", zeilen: ["Zwei"] },
    ]);
  });
});

describe("teileNachTageszeit", () => {
  const ZONE = "Europe/Berlin";
  const zeit = (stunde: number, minute = 0) =>
    new Date(Date.UTC(2026, 7, 6, stunde - 2, minute)).toISOString();

  it("teilt in Vormittag, Nachmittag und Abend", () => {
    const abschnitte = teileNachTageszeit(
      [zeit(9), zeit(11, 30), zeit(13), zeit(16, 45), zeit(18)],
      ZONE,
    );
    expect(abschnitte.map((a) => a.name)).toEqual(["Vormittag", "Nachmittag", "Abend"]);
    expect(abschnitte[0].zeiten).toHaveLength(2);
    expect(abschnitte[1].zeiten).toHaveLength(2);
    expect(abschnitte[2].zeiten).toHaveLength(1);
  });

  it("lässt leere Abschnitte weg", () => {
    // Sonst stünde an einem reinen Vormittagstag zweimal eine leere Überschrift.
    const abschnitte = teileNachTageszeit([zeit(9), zeit(10)], ZONE);
    expect(abschnitte.map((a) => a.name)).toEqual(["Vormittag"]);
  });

  it("zieht die Grenze bei zwölf und bei siebzehn Uhr", () => {
    expect(teileNachTageszeit([zeit(11, 59)], ZONE)[0].name).toBe("Vormittag");
    expect(teileNachTageszeit([zeit(12)], ZONE)[0].name).toBe("Nachmittag");
    expect(teileNachTageszeit([zeit(16, 59)], ZONE)[0].name).toBe("Nachmittag");
    expect(teileNachTageszeit([zeit(17)], ZONE)[0].name).toBe("Abend");
  });

  it("verträgt eine leere Liste", () => {
    expect(teileNachTageszeit([], ZONE)).toEqual([]);
  });

  it("überspringt unlesbare Zeitangaben", () => {
    expect(teileNachTageszeit(["kein Zeitpunkt"], ZONE)).toEqual([]);
  });
});
