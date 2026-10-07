import { describe, it, expect } from "vitest";
import { berechneClosingFortschritt } from "./closingFortschritt";
import type { Bewerber } from "./bewerbungStore";

// Die fünf Zustände des Mockups (Anhang B der Strategie) als Datenlage:
// a Ausgangszustand, b Ja mit Paket, c Adressen vollständig, d Vertrag
// erzeugt, e Bedenkzeit. Geprüft wird, welche Karte gesperrt, offen oder
// erledigt ist und was als nächster Schritt genannt wird.

function bewerber(teil: Partial<Bewerber> = {}): Bewerber {
  return {
    id: "b-1", vorname: "Max", nachname: "Muster", email: "max@example.com",
    status: "Closing",
    closingTerminDatum: "01.09.2026", closingTerminUhrzeit: "14:00",
    erstgespraechSkript: {
      ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
      einwand: "", budget: "", naechsterSchritt: "",
      durchgefuehrtAm: "", durchgefuehrtVon: "",
    },
    paketwahl: "", zahlungsweise: "", rechnungsAdresse: "",
    vertragStatus: "nicht_gesendet",
    ...teil,
  } as Bewerber;
}

const zustand = (f: ReturnType<typeof berechneClosingFortschritt>) => f.schritte.map((s) => s.zustand);

describe("berechneClosingFortschritt", () => {
  it("a: Ausgangszustand, Präsentation ist der nächste Schritt, 3, 4 und 6 gesperrt", () => {
    const f = berechneClosingFortschritt(bewerber());
    expect(zustand(f)).toEqual(["offen", "offen", "gesperrt", "gesperrt", "offen", "gesperrt"]);
    expect(f.aktiverSchritt).toBe(1);
    expect(f.naechsterSchritt).toMatch(/Präsentation starten/);
    expect(f.fehlt.map((x) => x.text)).toContain("Präsentation noch nicht gehalten");
  });

  it("b: Ja mit Paket, Karten 1 bis 3 erledigt, Adressen sind dran", () => {
    const f = berechneClosingFortschritt(bewerber({ status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior" }));
    expect(zustand(f)).toEqual(["erledigt", "erledigt", "erledigt", "offen", "offen", "gesperrt"]);
    expect(f.aktiverSchritt).toBe(4);
    expect(f.naechsterSchritt).toMatch(/Vertragsanschrift und Rechnungsadresse/);
  });

  it("b: Tippgeber ohne Vergütung gilt als nicht erledigt", () => {
    const f = berechneClosingFortschritt(bewerber({ closingEntscheidung: "ja", paketwahl: "tippgeber" }));
    expect(f.paketErledigt).toBe(false);
    expect(f.naechsterSchritt).toMatch(/Tippgeber-Vergütung/);
    expect(f.fehlt.map((x) => x.text)).toContain("Tippgeber-Vergütung fehlt");
  });

  it("c: Adressen vollständig und Startfahrplan versendet, Vertrag ist der nächste Schritt", () => {
    const f = berechneClosingFortschritt(bewerber({
      status: "Paketwahl", closingEntscheidung: "ja", paketwahl: "junior",
      vertragsAdresse: "Max Muster\nMusterstraße 12\n83075 Bad Feilnbach",
      rechnungsAdresse: "Muster GmbH\nGewerbepark 3\n83022 Rosenheim",
      paketUebersichtSentAt: "2026-09-01T13:12:00.000Z",
    }));
    expect(zustand(f)).toEqual(["erledigt", "erledigt", "erledigt", "erledigt", "erledigt", "offen"]);
    expect(f.aktiverSchritt).toBe(6);
    expect(f.naechsterSchritt).toBe("Paket bestätigen und Vertrag erstellen");
    expect(f.fehlt).toEqual([]);
  });

  it("c: andere Vertriebe bei Standardvertrag und individuelle Sätze landen unter Was noch fehlt", () => {
    const f = berechneClosingFortschritt(bewerber({
      closingEntscheidung: "ja", paketwahl: "junior",
      andereVertriebe: "Muster Vertriebs GmbH", individuelleVertragsFassung: false,
      satzLead: "3,5", satzEigen: "4,5",
    }));
    const texte = f.fehlt.map((x) => x.text);
    expect(texte).toContain("Andere Vertriebe genannt, § 10 steht auf Standard");
    expect(texte).toContain("Individuelle Sätze 3,5 % / 4,5 %");
  });

  it("d: Vertrag erzeugt und versendet, alles erledigt, nächster Schritt im Reiter Vertrag", () => {
    const f = berechneClosingFortschritt(bewerber({
      status: "Vertrag", closingEntscheidung: "ja", paketwahl: "junior",
      vertragsAdresse: "A\nB\n1 C", rechnungsAdresse: "A\nB\n1 C",
      paketUebersichtSentAt: "2026-09-01T13:12:00.000Z",
      paketBestaetigtAm: "2026-09-02T08:15:00.000Z", vertragStatus: "gesendet", vertragVersion: 1,
    }));
    expect(zustand(f)).toEqual(["erledigt", "erledigt", "erledigt", "erledigt", "erledigt", "erledigt"]);
    expect(f.aktiverSchritt).toBe(0);
    expect(f.naechsterSchritt).toMatch(/Unterschrift abwarten/);
    expect(f.fehlt).toEqual([]);
  });

  it("e: Bedenkzeit, Entscheidung bleibt der aktive Schritt, Rückruf steht im nächsten Schritt", () => {
    const f = berechneClosingFortschritt(bewerber({
      status: "Bedenkzeit", closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026",
      paketUebersichtSentAt: "2026-09-01T13:12:00.000Z",
    }));
    expect(zustand(f)).toEqual(["erledigt", "offen", "gesperrt", "gesperrt", "erledigt", "gesperrt"]);
    expect(f.aktiverSchritt).toBe(2);
    expect(f.naechsterSchritt).toBe("Rückruf am 09.09.2026, danach Entscheidung erfassen");
    expect(f.fehlt[0]).toMatchObject({ text: "Rückruf am 09.09.2026", dringend: true });
  });

  it("Nein: Startfahrplan und Vertrag gesperrt, nichts fehlt mehr", () => {
    const f = berechneClosingFortschritt(bewerber({ status: "Abgelehnt", closingEntscheidung: "nein" }));
    expect(zustand(f)).toEqual(["erledigt", "erledigt", "gesperrt", "gesperrt", "gesperrt", "gesperrt"]);
    expect(f.naechsterSchritt).toMatch(/abgelehnt/);
    expect(f.fehlt).toEqual([]);
  });

  it("Teil 2 im Gespräch komplett zählt als gehaltene Präsentation, auch ohne Entscheidung", () => {
    const f = berechneClosingFortschritt(bewerber({
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
        closingDirekt: { aktiv: true, startWeiche: "unterlagen" },
      },
    }));
    expect(f.teil2Komplett).toBe(true);
    expect(f.praesentationGehalten).toBe(true);
    expect(f.aktiverSchritt).toBe(2);
    // Ohne Abschluss-Zeitstempel ist das Gespräch nicht komplett: Karte 1
    // bleibt erledigt, trägt aber kein Datum.
    expect(f.teil1Abgeschlossen).toBe(false);
    expect(f.gespraechKomplett).toBe(false);
    expect(f.schritte[0].kurz).toBe("Termin 01.09.2026, 14:00 Uhr");
    expect(f.schritte[0].zeilen).toContain("Teil 2 im Gespräch komplett, Erstgespräch noch nicht abgeschlossen");
  });

  it("ein einzelnes gefülltes Gesprächsfeld macht Teil 1 nicht abgeschlossen (Fall Max Musterfrau)", () => {
    const f = berechneClosingFortschritt(bewerber({
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtAm: "", durchgefuehrtVon: "",
        assessment: { ersteindruck: "offen" },
      },
    }));
    expect(f.teil1Abgeschlossen).toBe(false);
    expect(f.teil1AbgeschlossenAm).toBe("");
    expect(f.gespraechKomplett).toBe(false);
    expect(zustand(f)[0]).toBe("offen");
  });

  it("Teil 1 abgeschlossen und Teil 2 komplett: Karte 1 ist komplett erledigt und nennt das Datum", () => {
    const f = berechneClosingFortschritt(bewerber({
      closingEntscheidung: "ja", paketwahl: "junior",
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "Sarah",
        durchgefuehrtAm: "2026-09-01T10:00:00.000Z",
        closingDirekt: { aktiv: true },
      },
    }));
    expect(f.teil1Abgeschlossen).toBe(true);
    expect(f.teil1AbgeschlossenAm).toBe("01.09.2026");
    expect(f.teil2Komplett).toBe(true);
    expect(f.gespraechKomplett).toBe(true);
    expect(zustand(f)[0]).toBe("erledigt");
    expect(f.schritte[0].kurz).toBe("geführt am 01.09.2026");
    expect(f.schritte[0].zeilen).toEqual(["Erstgespräch und Closing-Gespräch geführt am 01.09.2026"]);
  });

  it("Teil 1 abgeschlossen ohne Teil 2: Karte 1 bleibt offen, bis eine Entscheidung vorliegt", () => {
    const f = berechneClosingFortschritt(bewerber({
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "", durchgefuehrtVon: "",
        durchgefuehrtAm: "2026-09-01T10:00:00.000Z",
      },
    }));
    expect(f.teil1Abgeschlossen).toBe(true);
    expect(f.gespraechKomplett).toBe(false);
    expect(zustand(f)[0]).toBe("offen");
  });
  // ── Der Startfahrplan darf nur an einer Quelle hängen ──────────────────
  //
  // Der Verfolgungseintrag der Mail entsteht VOR dem Absenden. Er darf den
  // Zustand deshalb nicht bestimmen, sonst zeigt das CRM einen Versand an,
  // den es nie gab.

  it("Startfahrplan gilt erst als versendet, wenn der Zeitstempel am Bewerber steht", () => {
    const offen = berechneClosingFortschritt(
      bewerber({ closingEntscheidung: "ja", paketwahl: "junior" }),
      { startfahrplanGeoeffnet: true },
    );
    expect(offen.startfahrplanVersendet).toBe(false);
    expect(zustand(offen)[4]).toBe("offen");
    expect(offen.schritte[4].kurz).toBe("optional, noch nicht versendet");
    expect(offen.schritte[4].zeilen).toEqual(["optional, noch nicht versendet"]);
  });

  it("mit Zeitstempel ist der Startfahrplan erledigt, geöffnet ergänzt nur die Zeilen", () => {
    const felder = {
      closingEntscheidung: "ja" as const, paketwahl: "junior",
      paketUebersichtSentAt: "2026-09-02T07:14:00.000Z",
    };
    const ohne = berechneClosingFortschritt(bewerber(felder));
    const mit = berechneClosingFortschritt(bewerber(felder), { startfahrplanGeoeffnet: true });
    expect(ohne.startfahrplanVersendet).toBe(true);
    expect(zustand(ohne)[4]).toBe("erledigt");
    expect(ohne.schritte[4].kurz).toBe("versendet 02.09.2026");
    // Der Zustand ist in beiden Fällen gleich, nur die Zeilen wachsen.
    expect(mit.schritte[4].zustand).toBe(ohne.schritte[4].zustand);
    expect(mit.schritte[4].kurz).toBe(ohne.schritte[4].kurz);
    expect(mit.schritte[4].zeilen).toContain("PDF-Link vom Bewerber geöffnet");
    expect(ohne.schritte[4].zeilen).not.toContain("PDF-Link vom Bewerber geöffnet");
  });

  it("Paket und Konditionen kommen aus den gespeicherten Feldern, nicht aus einem Formular", () => {
    const f = berechneClosingFortschritt(bewerber({
      closingEntscheidung: "ja", paketwahl: "junior",
      laufzeitOffen: true, leadPaket: { betrag: 2500, anzahl: 20 }, individuelleVertragsFassung: true,
    }));
    expect(f.schritte[2].kurz).toContain("Vertriebspartner");
    // Bis zum 06.09.2026 stand hier "ohne Mindestlaufzeit" aus dem Schalter.
    // Seit dem 07.09.2026 gibt es weder Gebühr noch Mindestlaufzeit; der
    // Altwert laufzeitOffen ändert die Kurzform nicht mehr.
    expect(f.schritte[2].kurz).toContain("kein laufendes Entgelt");
    expect(f.schritte[2].kurz).not.toContain("Mindestlaufzeit");
    expect(f.schritte[2].zeilen).toContain("Lead-Paket 20 Leads");
    expect(f.schritte[2].zeilen).toContain("individuelle Vertragsfassung");
  });

  it("jeder Schritt trägt eine Kurzform und mindestens eine Zeile, in jedem Zustand", () => {
    const faelle = [
      bewerber(),
      bewerber({ closingEntscheidung: "bedenkzeit", bedenkzeitRueckrufAm: "09.09.2026" }),
      bewerber({ closingEntscheidung: "nein" }),
      bewerber({
        closingEntscheidung: "ja", paketwahl: "junior",
        vertragsAdresse: "Max Muster\nMusterstraße 12\n83075 Bad Feilnbach",
        rechnungsAdresse: "Muster GmbH\nGewerbepark 3\n83022 Rosenheim",
        paketUebersichtSentAt: "2026-09-02T07:14:00.000Z",
        paketBestaetigtAm: "2026-09-03T08:15:00.000Z", vertragStatus: "gesendet", vertragVersion: 1,
      }),
    ];
    for (const b of faelle) {
      for (const s of berechneClosingFortschritt(b).schritte) {
        expect(s.kurz.trim().length).toBeGreaterThan(0);
        expect(s.zeilen.length).toBeGreaterThan(0);
        expect(s.zeilen.every((z) => z.trim().length > 0)).toBe(true);
      }
    }
  });
  it("der Vertragsstand hat einen Wortlaut für Kopfzeile, Balken und Seitenleiste", () => {
    const basis = {
      closingEntscheidung: "ja" as const, paketwahl: "junior",
      vertragsAdresse: "A\nB\n1 C", rechnungsAdresse: "A\nB\n1 C",
      paketBestaetigtAm: "2026-09-03T08:15:00.000Z", vertragVersion: 2,
    };
    const kurzVon = (vertragStatus: string) =>
      berechneClosingFortschritt(bewerber({ ...basis, vertragStatus } as Partial<Bewerber>)).schritte[5].kurz;
    // Nach der Unterschrift des Bewerbers fehlt die Gegenzeichnung. Vorher
    // stand hier "versendet, wartet auf Unterschrift", die Kopfzeile sagte
    // aber schon "unterschrieben, wartet auf Gegenzeichnung".
    expect(kurzVon("wartet_auf_kurz")).toBe("v2 unterschrieben, wartet auf Gegenzeichnung");
    expect(kurzVon("gesendet")).toBe("v2 versendet, wartet auf Unterschrift");
    expect(kurzVon("unterschrieben")).toBe("v2 unterschrieben");
    expect(kurzVon("abgelehnt")).toBe("v2 vom Bewerber abgelehnt");
    expect(kurzVon("nicht_gesendet")).toBe("v2 erzeugt 03.09.2026");
  });
});

/**
 * Der neue Bewerberprozess: Es gibt weder Teil 2 noch das alte Zehn-Punkte-
 * Skript. Die Entscheidung steht in
 * `erstgespraechSkript.bewerberVideocall.entscheidung`, und das Closing muss
 * sie lesen. Tat es das nicht, blieb Punkt 1 offen und der Kasten „Was noch
 * fehlt" behauptete „Präsentation noch nicht gehalten", obwohl das Gespräch
 * geführt war.
 */
describe("berechneClosingFortschritt: das persönliche Gespräch des neuen Ablaufs", () => {
  function nachVideocall(entscheidung: "moeglich" | "klaerung" | "nicht_moeglich") {
    return bewerber({
      // Im neuen Ablauf gibt es keinen Closing-Termin, der von Hand gesetzt wird.
      closingTerminDatum: "", closingTerminUhrzeit: "",
      erstgespraechDatum: "2026-09-10", erstgespraechUhrzeit: "10:00",
      erstgespraechSkript: {
        ausgangslage: "", ziele: "", motivation: "", vorErfahrung: "",
        einwand: "", budget: "", naechsterSchritt: "",
        durchgefuehrtAm: "2026-09-10T08:00:00.000Z", durchgefuehrtVon: "Sarah",
        bewerberVideocall: { entscheidung },
      },
    });
  }

  it("Punkt 1 gilt als erledigt, sobald im Videocall abgeschlossen wurde", () => {
    const f = berechneClosingFortschritt(nachVideocall("moeglich"));
    expect(f.praesentationGehalten).toBe(true);
    expect(f.schritte[0].zustand).toBe("erledigt");
    expect(f.fehlt.map((x) => x.text)).not.toContain("Präsentation noch nicht gehalten");
  });

  it("das gilt auch, wenn noch Klärung nötig ist", () => {
    expect(berechneClosingFortschritt(nachVideocall("klaerung")).praesentationGehalten).toBe(true);
  });

  it("Punkt 1 nennt den selbst gebuchten Termin", () => {
    const f = berechneClosingFortschritt(nachVideocall("moeglich"));
    expect(f.schritte[0].zeilen.join(" ")).toMatch(/selbst gebucht/);
  });

  it("ohne Abschluss verweist der Kasten auf den selbst gebuchten Termin", () => {
    const b = nachVideocall("moeglich");
    const offen = { ...b, erstgespraechSkript: { ...b.erstgespraechSkript, bewerberVideocall: {} } };
    const f = berechneClosingFortschritt(offen);
    expect(f.praesentationGehalten).toBe(false);
    const eintrag = f.fehlt.find((x) => x.text === "Präsentation noch nicht gehalten");
    expect(eintrag?.unter).toMatch(/Persönliches Gespräch am .* selbst gebucht/);
  });

  it("ohne selbst gebuchten Termin bleibt der bisherige Hinweis stehen", () => {
    const f = berechneClosingFortschritt(bewerber({ closingTerminDatum: "", closingTerminUhrzeit: "" }));
    const eintrag = f.fehlt.find((x) => x.text === "Präsentation noch nicht gehalten");
    expect(eintrag?.unter).toBe("Termin im Reiter Erstgespräch setzen");
  });
});

/*
 * Der Termin kommt aus der Buchung, nicht aus der Kopie in der Akte.
 *
 * Aufgefallen am 16.09.2026 an Berat Kilapia: Die Tabellenspalte zeigte den
 * Termin, der Closing-Fortschritt verlangte "Termin im Reiter Erstgespräch
 * setzen". Ursache war, dass diese Datei allein `erstgespraechDatum` las, also
 * die Kopie, die `bewerberToDb` bei jedem Speichern neu schreibt.
 */
describe("berechneClosingFortschritt: der Termin aus der Buchung", () => {
  const ohneTermin = () => bewerber({
    closingTerminDatum: "", closingTerminUhrzeit: "",
    erstgespraechDatum: "", erstgespraechUhrzeit: "",
  });
  const hinweis = (f: ReturnType<typeof berechneClosingFortschritt>) =>
    f.fehlt.find((x) => x.text === "Präsentation noch nicht gehalten")?.unter;

  it("der Fall Berat: keine Kopie in der Akte, aber eine stehende Buchung", () => {
    const f = berechneClosingFortschritt(ohneTermin(), {
      buchung: { startAt: "2026-09-18T08:00:00.000Z", status: "offen" },
    });
    expect(hinweis(f)).toMatch(/Persönliches Gespräch am .*selbst gebucht/);
    expect(hinweis(f)).not.toBe("Termin im Reiter Erstgespräch setzen");
  });

  it("ein abgesagter Termin verschweigt sich nicht, sondern verlangt einen neuen", () => {
    const f = berechneClosingFortschritt(ohneTermin(), {
      buchung: { startAt: "2026-09-18T08:00:00.000Z", status: "abgesagt" },
    });
    expect(hinweis(f)).toMatch(/wurde abgesagt, neuen Termin vereinbaren/);
    expect(f.schritte[0].kurz).toMatch(/abgesagt/);
  });

  it("die stehende Buchung schlägt den von Hand gepflegten Termin", () => {
    const f = berechneClosingFortschritt(
      bewerber({ closingTerminDatum: "01.09.2026", closingTerminUhrzeit: "14:00" }),
      { buchung: { startAt: "2026-09-18T08:00:00.000Z", status: "offen" } },
    );
    expect(f.schritte[0].kurz).toMatch(/18\.09\.2026/);
    expect(f.schritte[0].kurz).not.toMatch(/01\.09\.2026/);
  });

  it("ohne Buchung bleibt der von Hand gepflegte Termin maßgeblich", () => {
    const f = berechneClosingFortschritt(
      bewerber({ closingTerminDatum: "01.09.2026", closingTerminUhrzeit: "14:00" }),
    );
    expect(f.schritte[0].kurz).toMatch(/01\.09\.2026/);
  });

  it("wer die Buchung nicht durchreicht, bekommt weiter den bisherigen Hinweis", () => {
    expect(hinweis(berechneClosingFortschritt(ohneTermin())))
      .toBe("Termin im Reiter Erstgespräch setzen");
  });
});
