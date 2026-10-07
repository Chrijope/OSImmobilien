import { describe, it, expect } from "vitest";
import { hatGeplantenTermin, naechsterKontakt, zuZeitpunkt } from "@/lib/naechsterKontakt";

const JETZT = new Date("2026-07-27T12:00:00").getTime();

describe("zuZeitpunkt", () => {
  it("versteht ISO, deutsches Datum und Datum mit Uhrzeit", () => {
    expect(zuZeitpunkt("2026-08-01T10:30:00")).toBe(new Date("2026-08-01T10:30:00").getTime());
    expect(zuZeitpunkt("01.08.2026", "10:30")).toBe(new Date("2026-08-01T10:30:00").getTime());
    expect(zuZeitpunkt("2026-08-01", "10:30")).toBe(new Date("2026-08-01T10:30:00").getTime());
  });

  it("legt ein Datum ohne Uhrzeit auf das Tagesende", () => {
    expect(zuZeitpunkt("2026-08-01")).toBe(new Date("2026-08-01T23:59:00").getTime());
  });

  it("gibt bei Unsinn null zurück", () => {
    expect(zuZeitpunkt("")).toBeNull();
    expect(zuZeitpunkt(undefined)).toBeNull();
    expect(zuZeitpunkt("morgen")).toBeNull();
  });
});

describe("naechsterKontakt", () => {
  it("lässt eine neue Aufgabe die alte Wartephase überschreiben", () => {
    // Genau der Fall aus der Pipeline: verstecktBis ist alt, die Aufgabe neu.
    const r = naechsterKontakt(
      {
        verstecktBis: "2026-07-10T09:00:00",
        aufgaben: [{ titel: "Rückruf vereinbart", faelligAm: "2026-08-05T14:00:00" }],
      },
      JETZT,
    );
    expect(r?.quelle).toBe("aufgabe");
    expect(r?.titel).toBe("Rückruf vereinbart");
    expect(r?.ueberfaellig).toBe(false);
  });

  it("wählt von mehreren zukünftigen Terminen den nächsten", () => {
    const r = naechsterKontakt(
      {
        aufgaben: [{ titel: "Spät", faelligAm: "2026-09-01T09:00:00" }],
        followUps: [{ titel: "Früh", faelligAm: "2026-07-30T09:00:00" }],
      },
      JETZT,
    );
    expect(r?.titel).toBe("Früh");
    expect(r?.quelle).toBe("follow_up");
  });

  it("berücksichtigt fest gebuchte Termine am Kontakt", () => {
    const r = naechsterKontakt(
      { termine: [{ datum: "2026-07-28", uhrzeit: "11:00", bezeichnung: "Erstgespräch" }] },
      JETZT,
    );
    expect(r?.quelle).toBe("termin");
    expect(r?.bezeichnung).toBe("Erstgespräch");
  });

  it("zeigt den zuletzt fälligen Termin, wenn nichts mehr aussteht", () => {
    const r = naechsterKontakt(
      {
        aufgaben: [
          { titel: "Ganz alt", faelligAm: "2026-06-01T09:00:00" },
          { titel: "Zuletzt", faelligAm: "2026-07-20T09:00:00" },
        ],
      },
      JETZT,
    );
    expect(r?.titel).toBe("Zuletzt");
    expect(r?.ueberfaellig).toBe(true);
  });

  it("nennt eine als Follow-Up angelegte Aufgabe auch Follow-Up", () => {
    // Der Follow-Up-Dialog speichert das Follow-Up zusaetzlich als Aufgabe
    // mit typ "follow_up". Hinter dem Namen soll dann "Follow-Up" stehen,
    // nicht "Aufgabe", sonst sucht man sein Follow-Up vergeblich.
    const r = naechsterKontakt(
      { aufgaben: [{ titel: "FU neuer Termin", faelligAm: "2026-08-05", uhrzeit: "10:00", typ: "follow_up" }] },
      JETZT,
    );
    expect(r?.quelle).toBe("follow_up");
    expect(r?.bezeichnung).toBe("Follow-Up");
    expect(r?.ueberfaellig).toBe(false);
  });

  it("macht ein heute frueher faelliges Follow-Up mit Uhrzeit ueberfaellig", () => {
    // Ein Follow-Up fuer heute 10:00 ist um 12:00 vorbei. Ohne Uhrzeit
    // zaehlte es bis 23:59 als geplant.
    const r = naechsterKontakt(
      { followUps: [{ titel: "FU", faelligAm: "2026-07-27", uhrzeit: "10:00" }] },
      JETZT,
    );
    expect(r?.quelle).toBe("follow_up");
    expect(r?.ueberfaellig).toBe(true);
  });

  it("gibt ohne jede Quelle null zurück", () => {
    expect(naechsterKontakt({}, JETZT)).toBeNull();
    expect(naechsterKontakt({ aufgaben: [{ titel: "ohne Datum" }] }, JETZT)).toBeNull();
  });

  it("nutzt die Wartephase nur, wenn es sonst nichts gibt", () => {
    const nur = naechsterKontakt({ verstecktBis: "2026-08-01T09:00:00" }, JETZT);
    expect(nur?.quelle).toBe("wartephase");

    const mit = naechsterKontakt(
      {
        verstecktBis: "2026-07-28T09:00:00",
        followUps: [{ titel: "Termin", faelligAm: "2026-07-29T09:00:00" }],
      },
      JETZT,
    );
    // Die Wartephase liegt früher, ist aber kein vereinbarter Termin. Ein
    // echter Termin schlägt sie, sonst würde ein altes "Nicht erreicht" die
    // frisch angelegte Aufgabe überdecken.
    expect(mit?.quelle).toBe("follow_up");
  });
});

describe("hatGeplantenTermin", () => {
  it("zählt die Wartephase nicht als Termin", () => {
    expect(hatGeplantenTermin({ verstecktBis: "2026-08-01T09:00:00" }, JETZT)).toBe(false);
  });

  it("erkennt eine zukünftige Aufgabe als Termin", () => {
    expect(
      hatGeplantenTermin({ aufgaben: [{ titel: "x", faelligAm: "2026-08-01T09:00:00" }] }, JETZT),
    ).toBe(true);
  });

  it("erkennt einen vergangenen Termin nicht als geplant", () => {
    expect(
      hatGeplantenTermin({ aufgaben: [{ titel: "x", faelligAm: "2026-07-01T09:00:00" }] }, JETZT),
    ).toBe(false);
  });
});

describe("Wartephase gegen vereinbarten Termin", () => {
  it("zeigt die Aufgabe, auch wenn die Wartephase früher liegt", () => {
    // Genau der Fall aus der Pipeline: Ein altes "Nicht erreicht" hat eine
    // Wiedervorlage für morgen gesetzt, danach wurde eine Aufgabe für nächste
    // Woche vereinbart. Die Kachel muss die Aufgabe zeigen.
    const r = naechsterKontakt(
      {
        verstecktBis: "2026-07-28T09:00:00",
        aufgaben: [{ titel: "Beratung", faelligAm: "2026-08-03T15:00:00" }],
      },
      JETZT,
    );
    expect(r?.quelle).toBe("aufgabe");
    expect(r?.titel).toBe("Beratung");
    expect(r?.ueberfaellig).toBe(false);
  });

  it("färbt die Kachel nicht mehr ein, sobald ein Termin in der Zukunft steht", () => {
    expect(
      hatGeplantenTermin(
        {
          verstecktBis: "2026-07-01T09:00:00",
          aufgaben: [{ titel: "Beratung", faelligAm: "2026-08-03T15:00:00" }],
        },
        JETZT,
      ),
    ).toBe(true);
  });
});

describe("Automatische Wiedervorlage nach einem Kontaktversuch", () => {
  // Gemeldet von Julian Meyer zum Kunden Max Niedermeyer: Er protokolliert
  // "nicht erreicht", und einen Tag spaeter steht auf der Kachel "Termin
  // ueberfaellig" in Rot. Es gab nie einen Termin. In fortgeschrittenen Stufen
  // legt das System nach einem erfolglosen Anruf selbst eine Nachfass-Aufgabe
  // an, faellig in 24 Stunden, und die galt bisher als vereinbarter Termin.

  const JETZT = new Date(2026, 6, 29, 12, 0).getTime();

  it("zaehlt nicht als vereinbarter Termin", () => {
    const eingabe = {
      aufgaben: [
        {
          titel: "Nachfassen: Max Niedermeyer",
          faelligAm: new Date(JETZT - 2 * 60 * 60 * 1000).toISOString(),
          wiedervorlage: true,
        },
      ],
    };
    expect(hatGeplantenTermin(eingabe, JETZT)).toBe(false);
    expect(naechsterKontakt(eingabe, JETZT)?.quelle).toBe("wartephase");
  });

  it("eine normale Aufgabe bleibt ein Termin", () => {
    const eingabe = {
      aufgaben: [
        {
          titel: "Rueckruf vereinbart",
          faelligAm: new Date(JETZT + 2 * 60 * 60 * 1000).toISOString(),
        },
      ],
    };
    expect(hatGeplantenTermin(eingabe, JETZT)).toBe(true);
    expect(naechsterKontakt(eingabe, JETZT)?.quelle).toBe("aufgabe");
  });
});

describe("Uhrzeit schlaegt den Zeitstempel", () => {
  /*
   * Gemeldet bei Andre Goller: In der Aktivitaetsuebersicht stand die Aufgabe
   * mit 18 Uhr, im Hinweis hinter dem Namen mit 10 Uhr. Beides kam aus
   * derselben Aufgabe, nur aus verschiedenen Feldern.
   */
  it("nimmt die gepflegte Uhrzeit, nicht die im Zeitstempel", () => {
    const t = zuZeitpunkt("2026-08-12T10:00:00.000Z", "18:00");
    expect(t).not.toBeNull();
    expect(new Date(t!).getHours()).toBe(18);
  });

  it("bleibt beim Zeitstempel, wenn keine Uhrzeit gepflegt ist", () => {
    const roh = "2026-08-12T10:00:00.000Z";
    expect(zuZeitpunkt(roh)).toBe(new Date(roh).getTime());
  });

  it("ignoriert eine unbrauchbare Uhrzeit", () => {
    const roh = "2026-08-12T10:00:00.000Z";
    expect(zuZeitpunkt(roh, "kaputt")).toBe(new Date(roh).getTime());
  });

  it("nimmt die Uhrzeit auch bei einem reinen Datum", () => {
    const t = zuZeitpunkt("2026-08-12", "18:00");
    expect(new Date(t!).getHours()).toBe(18);
  });

  it("waehlt den naechsten Kontakt nach der gepflegten Uhrzeit", () => {
    const jetzt = new Date("2026-08-12T09:00:00").getTime();
    const naechster = naechsterKontakt(
      { aufgaben: [{ titel: "Rueckruf", faelligAm: "2026-08-12T10:00:00.000Z", uhrzeit: "18:00" }] },
      jetzt,
    );
    expect(naechster).not.toBeNull();
    expect(new Date(naechster!.zeitpunkt).getHours()).toBe(18);
  });
});

describe("Aufgaben kurz nach Mitternacht (04.10.2026)", () => {
  it("bleiben am richtigen Tag, auch wenn der UTC-Zeitstempel noch den Vortag trägt", () => {
    // 01:30 Uhr Ortszeit am 05.10.; in UTC steht je nach Zone noch der 04.10.
    const ort = new Date(2026, 9, 5, 1, 30);
    const t = zuZeitpunkt(ort.toISOString(), "01:30");
    expect(t).not.toBeNull();
    const d = new Date(t!);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 1, 30]);
  });
});
