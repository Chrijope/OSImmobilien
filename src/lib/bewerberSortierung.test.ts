import { describe, it, expect } from "vitest";
import {
  bogenTrennungZeigen,
  naechsteSortierung,
  sortierungDerSpalte,
  sortiereNachTermin,
  type SortZustand,
} from "@/lib/bewerberSortierung";
import { closingGespraechTermin, terminZeitpunktMs } from "@/lib/bewerberTermine";
import { PIPELINE_STUFEN } from "@/lib/bewerbungStore";

/**
 * Die Sortierung der Bewerberliste über die Spaltenköpfe.
 *
 * Anlass: Die Spalte „Closing-Gespräch" sortierte fest aufsteigend, ohne dass
 * sich daran etwas ändern ließ. Sie schaltet jetzt genauso wie der
 * Vorab-Score, und beide schließen sich gegenseitig aus.
 */

/** Eine Zeile, wie die Liste sie kennt: Name plus Closing-Termin. */
type Zeile = { name: string; datum?: string; uhrzeit?: string };

/** Sortiert nach demselben Zeitpunkt, den die Spalte anzeigt. */
const nachClosing = (zeilen: Zeile[], richtung: "hoch" | "runter") =>
  sortiereNachTermin(
    zeilen,
    z => {
      const t = closingGespraechTermin({ closingTerminDatum: z.datum, closingTerminUhrzeit: z.uhrzeit });
      return terminZeitpunktMs(t.datum, t.uhrzeit);
    },
    richtung,
  ).map(z => z.name);

describe("Sortierung nach dem Closing-Gespräch", () => {
  const zeilen: Zeile[] = [
    { name: "Mitte", datum: "15.09.2026", uhrzeit: "10:00" },
    { name: "Spaet", datum: "20.09.2026", uhrzeit: "09:00" },
    { name: "Frueh", datum: "10.09.2026", uhrzeit: "14:00" },
  ];

  it("sortiert aufsteigend, frühester Termin zuerst", () => {
    expect(nachClosing(zeilen, "hoch")).toEqual(["Frueh", "Mitte", "Spaet"]);
  });

  it("sortiert absteigend, spätester Termin zuerst", () => {
    expect(nachClosing(zeilen, "runter")).toEqual(["Spaet", "Mitte", "Frueh"]);
  });

  it("achtet auf die Uhrzeit, wenn zwei Termine am selben Tag liegen", () => {
    const selberTag: Zeile[] = [
      { name: "Nachmittag", datum: "15.09.2026", uhrzeit: "16:30" },
      { name: "Vormittag", datum: "15.09.2026", uhrzeit: "09:15" },
      { name: "Mittag", datum: "15.09.2026", uhrzeit: "12:00" },
    ];
    expect(nachClosing(selberTag, "hoch")).toEqual(["Vormittag", "Mittag", "Nachmittag"]);
    expect(nachClosing(selberTag, "runter")).toEqual(["Nachmittag", "Mittag", "Vormittag"]);
  });

  it("stellt Bewerber ohne Termin in beiden Richtungen ans Ende", () => {
    const gemischt: Zeile[] = [
      { name: "OhneA" },
      { name: "Spaet", datum: "20.09.2026", uhrzeit: "09:00" },
      { name: "OhneB", datum: "" },
      { name: "Frueh", datum: "10.09.2026", uhrzeit: "14:00" },
    ];
    expect(nachClosing(gemischt, "hoch")).toEqual(["Frueh", "Spaet", "OhneA", "OhneB"]);
    expect(nachClosing(gemischt, "runter")).toEqual(["Spaet", "Frueh", "OhneA", "OhneB"]);
  });

  it("behandelt ein unlesbares Datum wie keinen Termin", () => {
    const kaputt: Zeile[] = [
      { name: "Unlesbar", datum: "demnächst" },
      { name: "Echt", datum: "10.09.2026", uhrzeit: "14:00" },
    ];
    expect(nachClosing(kaputt, "hoch")).toEqual(["Echt", "Unlesbar"]);
    expect(nachClosing(kaputt, "runter")).toEqual(["Echt", "Unlesbar"]);
  });

  it("sortiert den Termin aus der Buchung, nicht nur den von Hand gepflegten", () => {
    // Wer sich selbst gebucht hat, hat kein `closingTerminDatum`. Ohne die
    // Buchung stünde er bei den Terminlosen, obwohl sein Termin feststeht.
    const buchung = { startAt: "2026-09-12T08:00:00.000Z", status: "offen" };
    const reihenfolge = sortiereNachTermin(
      [
        { name: "Gepflegt", datum: "20.09.2026", uhrzeit: "09:00", buchung: null as typeof buchung | null },
        { name: "Selbstgebucht", datum: undefined as string | undefined, uhrzeit: undefined as string | undefined, buchung },
      ],
      z => {
        const t = closingGespraechTermin({ closingTerminDatum: z.datum, closingTerminUhrzeit: z.uhrzeit }, z.buchung);
        return terminZeitpunktMs(t.datum, t.uhrzeit);
      },
      "hoch",
    ).map(z => z.name);
    expect(reihenfolge).toEqual(["Selbstgebucht", "Gepflegt"]);
  });

  it("lässt die bisherige Reihenfolge der Terminlosen unangetastet", () => {
    const ohne: Zeile[] = [{ name: "Erster" }, { name: "Zweiter" }, { name: "Dritter" }];
    expect(nachClosing(ohne, "hoch")).toEqual(["Erster", "Zweiter", "Dritter"]);
    expect(nachClosing(ohne, "runter")).toEqual(["Erster", "Zweiter", "Dritter"]);
  });
});

describe("Die beiden Spalten schalten sich gegenseitig ab", () => {
  it("geht je Spalte im Kreis: aus, hoch, runter, aus", () => {
    let z: SortZustand = null;
    expect(sortierungDerSpalte(z, "termin")).toBe("aus");
    z = naechsteSortierung(z, "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("hoch");
    z = naechsteSortierung(z, "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("runter");
    z = naechsteSortierung(z, "termin");
    expect(z).toBeNull();
    expect(sortierungDerSpalte(z, "termin")).toBe("aus");
  });

  it("schaltet den Vorab-Score ab, sobald das Closing-Gespräch sortiert", () => {
    let z: SortZustand = naechsteSortierung(null, "score");
    z = naechsteSortierung(z, "score");
    expect(sortierungDerSpalte(z, "score")).toBe("runter");

    z = naechsteSortierung(z, "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("hoch");
    expect(sortierungDerSpalte(z, "score")).toBe("aus");
  });

  it("schaltet das Closing-Gespräch ab, sobald der Vorab-Score sortiert", () => {
    let z: SortZustand = naechsteSortierung(null, "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("hoch");

    z = naechsteSortierung(z, "score");
    expect(sortierungDerSpalte(z, "score")).toBe("hoch");
    expect(sortierungDerSpalte(z, "termin")).toBe("aus");
  });

  it("fängt eine abgelöste Spalte wieder bei hoch an", () => {
    // Nicht dort weitermachen, wo sie zuletzt stand: Der Nutzer sieht den
    // Pfeil nur an der Spalte, die gerade sortiert.
    let z: SortZustand = naechsteSortierung(naechsteSortierung(null, "termin"), "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("runter");
    z = naechsteSortierung(z, "score");
    z = naechsteSortierung(z, "termin");
    expect(sortierungDerSpalte(z, "termin")).toBe("hoch");
  });
});

describe("Wo die Zweiteilung nach dem ausgefüllten Bogen noch gilt", () => {
  it("bleibt im Eingang und beim Videocall", () => {
    // "Videocall" ist die Oberflächenbezeichnung der Stufe `Erstgespraech`.
    expect(bogenTrennungZeigen("Eingang")).toBe(true);
    expect(bogenTrennungZeigen("Erstgespraech")).toBe(true);
  });

  it("fällt ab Closing weg, in jeder weiteren Stufe", () => {
    const abClosing = PIPELINE_STUFEN.slice(PIPELINE_STUFEN.indexOf("Closing"));
    expect(abClosing).toContain("Closing");
    for (const stufe of abClosing) {
      expect(bogenTrennungZeigen(stufe)).toBe(false);
    }
  });

  it("fällt auch in den abgeleiteten Abschnitten und bei Unbekanntem weg", () => {
    for (const stufe of ["KeinInteresse", "Abgelehnt", "", "Irgendwas"]) {
      expect(bogenTrennungZeigen(stufe)).toBe(false);
    }
  });
});

/**
 * Was die Liste aus einem Abschnitt macht, in denselben Schritten wie
 * `BewerberArbeitsplatz.tsx`: erst die gewählte Sortierung, dann die
 * Zweiteilung, falls die Stufe sie noch zeigt.
 */
type Kandidat = { name: string; datum?: string; punkte?: number };

function reihenfolge(
  stufe: string,
  kandidaten: Kandidat[],
  sortierung: { nachTermin?: "hoch" | "runter"; nachScore?: "hoch" | "runter" } = {},
): string[] {
  const trennung = bogenTrennungZeigen(stufe);
  let liste = kandidaten;
  if (sortierung.nachTermin && stufe === "Closing") {
    liste = sortiereNachTermin(liste, k => terminZeitpunktMs(k.datum), sortierung.nachTermin);
  } else if (sortierung.nachScore) {
    liste = [...liste].sort((a, b) => {
      if (a.punkte === undefined && b.punkte === undefined) return 0;
      if (a.punkte === undefined) return 1;
      if (b.punkte === undefined) return -1;
      return sortierung.nachScore === "hoch" ? b.punkte - a.punkte : a.punkte - b.punkte;
    });
  }
  if (trennung) {
    liste = [...liste].sort(
      (a, b) => (a.punkte !== undefined ? 0 : 1) - (b.punkte !== undefined ? 0 : 1),
    );
  }
  return liste.map(k => k.name);
}

describe("Die Zweiteilung im Zusammenspiel mit den Sortierungen", () => {
  const leute: Kandidat[] = [
    { name: "SpaetMitBogen", datum: "20.09.2026", punkte: 40 },
    { name: "FruehOhneBogen", datum: "10.09.2026" },
    { name: "OhneTerminMitBogen", punkte: 90 },
  ];

  it("zieht im Eingang die mit Bogen nach oben", () => {
    expect(reihenfolge("Eingang", leute)).toEqual([
      "SpaetMitBogen", "OhneTerminMitBogen", "FruehOhneBogen",
    ]);
  });

  it("zieht beim Videocall die mit Bogen nach oben, auch beim Sortieren nach Score", () => {
    expect(reihenfolge("Erstgespraech", leute, { nachScore: "hoch" })).toEqual([
      "OhneTerminMitBogen", "SpaetMitBogen", "FruehOhneBogen",
    ]);
  });

  it("sortiert im Closing rein nach Datum, über die ganze Liste", () => {
    expect(reihenfolge("Closing", leute, { nachTermin: "hoch" })).toEqual([
      "FruehOhneBogen", "SpaetMitBogen", "OhneTerminMitBogen",
    ]);
    expect(reihenfolge("Closing", leute, { nachTermin: "runter" })).toEqual([
      "SpaetMitBogen", "FruehOhneBogen", "OhneTerminMitBogen",
    ]);
  });

  it("lässt die Score-Sortierung im Closing unangetastet, ohne Vorziehen", () => {
    // Der schwächste zuerst: Ohne Punkte ans Ende, sonst nach Punkten.
    expect(reihenfolge("Closing", leute, { nachScore: "runter" })).toEqual([
      "SpaetMitBogen", "OhneTerminMitBogen", "FruehOhneBogen",
    ]);
    expect(reihenfolge("Closing", leute, { nachScore: "hoch" })).toEqual([
      "OhneTerminMitBogen", "SpaetMitBogen", "FruehOhneBogen",
    ]);
  });

  it("lässt in den Stufen hinter dem Gespräch alles in einer Liste", () => {
    for (const stufe of ["FollowUp", "Bedenkzeit", "Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv"]) {
      expect(reihenfolge(stufe, leute)).toEqual([
        "SpaetMitBogen", "FruehOhneBogen", "OhneTerminMitBogen",
      ]);
    }
  });
});
