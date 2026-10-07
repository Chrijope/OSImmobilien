import { describe, it, expect } from "vitest";
import {
  ERINNERUNG_TAG_1,
  ERINNERUNG_TAG_3,
  FAELLIG_TEXTE,
  darfFallSchliessen,
  erinnerungWortfassung,
  faelligeErinnerung,
  juengsteNachfassMail,
  kettenStand,
  naechsterSchrittAm,
  pausiert,
  stoppGrund,
  tageSeit,
  wartetAufEntscheidung,
  type BewerberDaten,
  type KettenStand,
} from "@/lib/kennenlernenErinnerungen";

const JETZT = new Date("2026-09-20T08:00:00.000Z");

/** Ein Bewerber, bei dem die Kette laeuft: Mail raus, Bogen offen, Stufe Eingang. */
function stand(tageHer: number, rest: Partial<KettenStand> = {}): KettenStand {
  return {
    gesendetAm: new Date(JETZT.getTime() - tageHer * 86_400_000).toISOString(),
    formularStatus: "offen",
    bewerberStatus: "Eingang",
    laeuftAbAm: new Date(JETZT.getTime() + 5 * 86_400_000).toISOString(),
    stufe: 0,
    ...rest,
  };
}

describe("Die Abstaende der Kette", () => {
  it("steht auf 3 und 11 Tagen, Tag 8 ist entfallen", () => {
    expect(ERINNERUNG_TAG_1).toBe(3);
    expect(ERINNERUNG_TAG_3).toBe(11);
    expect(Object.keys(FAELLIG_TEXTE)).toEqual(["tag3", "tag11"]);
  });

  it("zaehlt volle Tage und meldet ein fehlendes Datum als minus eins", () => {
    expect(tageSeit(new Date(JETZT.getTime() - 3 * 86_400_000).toISOString(), JETZT)).toBe(3);
    expect(tageSeit(null, JETZT)).toBe(-1);
    expect(tageSeit("kein Datum", JETZT)).toBe(-1);
  });
});

describe("Was faellig ist", () => {
  it("schweigt in den ersten drei Tagen", () => {
    expect(faelligeErinnerung(stand(0), JETZT)).toBe("keine");
    expect(faelligeErinnerung(stand(2), JETZT)).toBe("keine");
  });

  it("schickt am dritten Tag die erste Erinnerung", () => {
    expect(faelligeErinnerung(stand(3), JETZT)).toBe("tag3");
    expect(faelligeErinnerung(stand(7), JETZT)).toBe("tag3");
  });

  /*
   * Tag 8 ist am 26.09.2026 entfallen. Zwischen Tag 3 und Tag 11 kommt nichts.
   */
  it("schickt an Tag 8 nichts mehr", () => {
    for (const tag of [4, 7, 8, 9, 10]) {
      expect(faelligeErinnerung(stand(tag, { stufe: 1 }), JETZT)).toBe("keine");
    }
    // Ohne die erste bleibt die erste dran. Es gibt keine Kette, die Stufen ueberspringt.
    expect(faelligeErinnerung(stand(8, { stufe: 0 }), JETZT)).toBe("tag3");
  });

  /*
   * Bis zum 14.09.2026 ging an Tag 11 eine Bitte an die HR-Managerin hinaus,
   * anzurufen. Jetzt bekommt der Bewerber selbst die letzte Mail, und sein
   * Stand wandert dabei auf "Kein Interesse".
   */
  it("schickt am elften Tag die letzte Erinnerung an den Bewerber", () => {
    expect(faelligeErinnerung(stand(11, { stufe: 1 }), JETZT)).toBe("tag11");
  });

  /*
   * Der Übergang am 26.09.2026. Wer gerade zwischen Tag 3 und Tag 8 steht,
   * bekommt seine letzte Erinnerung an Tag 11: keine verpasste Mail, keine
   * doppelte. Wer Tag 8 schon hatte (Stufe 2), ebenso.
   */
  it("fuehrt laufende Bewerber ohne Luecke und ohne Doppel zu Tag 11", () => {
    const folge = (stufeStart: 1 | 2, tagStart: number) => {
      const gesendetAm = new Date(JETZT.getTime() - tagStart * 86_400_000).toISOString();
      let stufe: number = stufeStart;
      const mails: Array<{ tag: number; art: string }> = [];
      for (let tag = tagStart; tag <= 30; tag++) {
        const heute = new Date(new Date(gesendetAm).getTime() + tag * 86_400_000);
        const art = faelligeErinnerung(
          { ...stand(0), gesendetAm, stufe: stufe as KettenStand["stufe"], laeuftAbAm: null },
          heute,
        );
        if (art !== "keine") {
          mails.push({ tag, art });
          stufe = art === "tag3" ? 1 : 3;
        }
      }
      return mails;
    };
    expect(folge(1, 5)).toEqual([{ tag: 11, art: "tag11" }]);
    expect(folge(1, 8)).toEqual([{ tag: 11, art: "tag11" }]);
    expect(folge(2, 9)).toEqual([{ tag: 11, art: "tag11" }]);
  });

  it("schickt einem neuen Bewerber, der nicht reagiert, genau zwei Erinnerungen", () => {
    const gesendetAm = JETZT.toISOString();
    let stufe = 0;
    const mails: string[] = [];
    for (let tag = 0; tag <= 60; tag++) {
      const heute = new Date(JETZT.getTime() + tag * 86_400_000);
      const art = faelligeErinnerung({ ...stand(0), gesendetAm, stufe: stufe as KettenStand["stufe"], laeuftAbAm: null }, heute);
      if (art !== "keine") {
        mails.push(`${art}@${tag}`);
        stufe = art === "tag3" ? 1 : 3;
      }
    }
    expect(mails).toEqual(["tag3@3", "tag11@11"]);
  });

  it("hoert nach Tag 11 auf, ohne vierte Stufe und ohne Wiedervorlage", () => {
    expect(faelligeErinnerung(stand(30, { stufe: 3 }), JETZT)).toBe("keine");
    expect(stoppGrund(stand(30, { stufe: 3 }), JETZT)).toBe("fertig");
  });
});

describe("Die Stoppbedingungen, jede einzeln wirksam", () => {
  it("stoppt, sobald der Bogen abgeschickt ist", () => {
    expect(stoppGrund(stand(9, { formularStatus: "eingereicht" }), JETZT)).toBe("abgeschickt");
    expect(faelligeErinnerung(stand(9, { formularStatus: "eingereicht" }), JETZT)).toBe("keine");
  });

  it("stoppt bei Kein Interesse, egal ob der Bewerber oder HR es gesetzt hat", () => {
    expect(stoppGrund(stand(9, { bewerberStatus: "KeinInteresse" }), JETZT)).toBe("kein_interesse");
  });

  it("stoppt bei Abgelehnt", () => {
    expect(stoppGrund(stand(9, { bewerberStatus: "Abgelehnt" }), JETZT)).toBe("abgelehnt");
  });

  it("stoppt, sobald ein Gespraech laeuft", () => {
    expect(stoppGrund(stand(9, { erstgespraechLaeuft: true }), JETZT)).toBe("erstgespraech");
    // Auch die Pipelinestufe allein genuegt: Wer den Eingang verlassen hat, ist im Prozess.
    expect(stoppGrund(stand(9, { bewerberStatus: "Erstgespraech" }), JETZT)).toBe("erstgespraech");
  });

  it("stoppt beim abgelaufenen Link", () => {
    const abgelaufen = stand(9, { laeuftAbAm: new Date(JETZT.getTime() - 86_400_000).toISOString() });
    expect(stoppGrund(abgelaufen, JETZT)).toBe("link_abgelaufen");
  });

  it("schickt auch bei Widerspruch gegen den Anruf alle drei Mails", () => {
    /*
     * "Bitte nicht anrufen" heisst ausdruecklich: interessiert, aber kein
     * Anruf. Eine Mail ist kein Anruf, und die dritte sagt diesem Bewerber
     * genau das, was er hoeren will, naemlich dass wir uns nicht mehr von
     * allein melden. Nur den Statuswechsel darf sie bei ihm nicht ausloesen.
     */
    expect(faelligeErinnerung(stand(3, { anrufWidersprochen: true }), JETZT)).toBe("tag3");
    expect(faelligeErinnerung(stand(11, { stufe: 2, anrufWidersprochen: true }), JETZT)).toBe("tag11");
  });

  it("laeuft ohne Eingangsmail gar nicht erst an", () => {
    expect(stoppGrund({ gesendetAm: null }, JETZT)).toBe("keine_mail");
  });
});

describe("Die Nachfass-Welle und die Erinnerung stossen sich nicht", () => {
  it("schweigt am Tag der Nachfass-Mail", () => {
    const heuteNachgefasst = stand(5, { nachfassMailAm: JETZT.toISOString() });
    expect(faelligeErinnerung(heuteNachgefasst, JETZT)).toBe("keine");
  });

  it("erinnert am Tag darauf wieder", () => {
    const gestern = stand(5, {
      nachfassMailAm: new Date(JETZT.getTime() - 86_400_000).toISOString(),
    });
    expect(faelligeErinnerung(gestern, JETZT)).toBe("tag3");
  });

  /*
   * Die Sammelmail zum Kennenlernen steht in `klNachfassMailAm`, die erste
   * Welle in `nachfassMailAm`. Bis zum 26.09.2026 las die Sperre nur die
   * erste; aufgefallen ist das nicht, weil die zweite die Kette ohnehin neu
   * startete. Seit sie das nicht mehr tut, muss die Sperre beide kennen.
   */
  it("kennt auch die Sammelmail zum Kennenlernen", () => {
    const zeile: BewerberDaten = {
      status: "Eingang",
      meta: {
        kennenlernen: { gesendetAm: new Date(JETZT.getTime() - 11 * 86_400_000).toISOString(), erinnerungStufe: 1 },
        klNachfassMailAm: JETZT.toISOString(),
      },
    };
    expect(faelligeErinnerung(kettenStand(zeile, { status: "offen" }), JETZT)).toBe("keine");
    const morgen = new Date(JETZT.getTime() + 86_400_000);
    expect(faelligeErinnerung(kettenStand(zeile, { status: "offen" }), morgen)).toBe("tag11");
  });

  it("nimmt von zwei Sammelmails die juengere", () => {
    expect(juengsteNachfassMail("2026-09-01T08:00:00Z", "2026-09-19T08:00:00Z")).toBe("2026-09-19T08:00:00Z");
    expect(juengsteNachfassMail("2026-09-19T08:00:00Z", "")).toBe("2026-09-19T08:00:00Z");
    expect(juengsteNachfassMail(null, undefined, "kein Datum")).toBeNull();
  });
});

describe("Die Wortfassung und der naechste Schritt", () => {
  it("waehlt den Text nach dem Zwischenstand, nicht nach einer zweiten Kette", () => {
    expect(erinnerungWortfassung(false)).toBe("nicht_begonnen");
    expect(erinnerungWortfassung(true)).toBe("unterbrochen");
  });

  it("nennt das Datum der naechsten Nachricht", () => {
    // Gesendet am 17.09., erste Erinnerung also am 20.09.
    expect(naechsterSchrittAm(stand(3), JETZT)).toBe("20.09.2026");
    // Nach Tag 3 kommt seit dem 26.09.2026 direkt Tag 11, also der 28.09.
    expect(naechsterSchrittAm(stand(3, { stufe: 1 }), JETZT)).toBe("28.09.2026");
    // Eine Altakte mit Tag 8 zeigt ebenfalls Tag 11.
    expect(naechsterSchrittAm(stand(8, { stufe: 2 }), JETZT)).toBe("23.09.2026");
  });

  it("nennt kein Datum, wenn nichts mehr kommt", () => {
    expect(naechsterSchrittAm(stand(9, { formularStatus: "eingereicht" }), JETZT)).toBe("");
  });
});

/*
 * Die Stelle, an der die Fassung davor gelogen hat.
 *
 * Auf dem Pausenbildschirm stand wörtlich „Eine Pause ist keine Absage, und
 * ein Anruf kommt deswegen nicht". Der Server erfuhr von der Pause aber gar
 * nichts: Der Knopf setzte nur einen Bildschirmzustand. Wer pausiert hat,
 * bekam trotzdem Tag 3, Tag 8 und an Tag 11 den Anruf. Diese Tests bewachen,
 * dass beides jetzt wirklich anhält.
 */
describe("Die selbst gewaehlte Pause haelt die Kette an", () => {
  const inZukunft = new Date(JETZT.getTime() + 7 * 86_400_000).toISOString();
  const inVergangenheit = new Date(JETZT.getTime() - 2 * 86_400_000).toISOString();

  it("schweigt, solange die selbst gewaehlte Erinnerung nicht faellig ist", () => {
    const pause = stand(9, { pauseGesetzt: true, pausiertBis: inZukunft });
    expect(pausiert(pause, JETZT)).toBe(true);
    expect(stoppGrund(pause, JETZT)).toBe("pausiert");
    expect(faelligeErinnerung(pause, JETZT)).toBe("keine");
  });

  it("schweigt ohne Erinnerungsdatum dauerhaft, denn er meldet sich selbst", () => {
    const pause = stand(40, { pauseGesetzt: true, pausiertBis: "" });
    expect(stoppGrund(pause, JETZT)).toBe("pausiert");
    expect(faelligeErinnerung(pause, JETZT)).toBe("keine");
  });

  it("erinnert nach Ablauf wieder, bis einschliesslich Tag 11", () => {
    // Der Bewerber hat sich eine Erinnerung gesetzt, sie ist faellig.
    const abgelaufen = stand(9, { pauseGesetzt: true, pausiertBis: inVergangenheit });
    expect(stoppGrund(abgelaufen, JETZT)).toBeNull();
    expect(faelligeErinnerung(abgelaufen, JETZT)).toBe("tag3");

    /*
     * Und Tag 11 kommt ebenfalls wieder. Bis zum 14.09.2026 fragte die dritte
     * Stufe `pauseGesetzt`, also ob JEMALS pausiert wurde, waehrend die
     * allgemeinen Stopps `pausiert()` fragen, also ob GERADE pausiert wird.
     * Wer einmal mit Datum pausiert hatte, bekam danach zwar wieder Tag 3 und
     * Tag 8, aber Tag 11 war bei ihm fuer immer abgeschaltet: Sein Fall lag
     * ohne Abschluss im Eingang, und niemand sah es.
     */
    const spaet = stand(20, { stufe: 2, pauseGesetzt: true, pausiertBis: inVergangenheit });
    expect(pausiert(spaet, JETZT)).toBe(false);
    expect(faelligeErinnerung(spaet, JETZT)).toBe("tag11");
  });

  it("haelt Tag 11 an, solange die Pause laeuft", () => {
    const laufend = stand(20, { stufe: 2, pauseGesetzt: true, pausiertBis: inZukunft });
    expect(faelligeErinnerung(laufend, JETZT)).toBe("keine");
    expect(stoppGrund(laufend, JETZT)).toBe("pausiert");
  });

  it("haelt Tag 11 dauerhaft an, wenn er sich selbst melden will", () => {
    // Eine Pause ohne Erinnerungsdatum endet nicht von allein. Dieser Bewerber
    // bekommt weder die dritte Mail noch einen Statuswechsel.
    const selbst = stand(40, { stufe: 2, pauseGesetzt: true, pausiertBis: "" });
    expect(pausiert(selbst, JETZT)).toBe(true);
    expect(faelligeErinnerung(selbst, JETZT)).toBe("keine");
    expect(stoppGrund(selbst, JETZT)).toBe("pausiert");
  });

  it("setzt keinen Status: eine Pause ist kein fehlendes Interesse", () => {
    const pause = stand(9, { pauseGesetzt: true, pausiertBis: inZukunft });
    expect(pause.bewerberStatus).toBe("Eingang");
    expect(stoppGrund(pause, JETZT)).not.toBe("kein_interesse");
  });
});

describe("Der Ausstieg haelt die Kette an", () => {
  it("stoppt alles, sobald der Bewerber selbst beendet hat", () => {
    // Die Edge Function setzt dafuer denselben Status wie die Abmeldung aus
    // der Nachfass-Mail. Die Herkunft steht daneben in der Akte.
    const raus = stand(9, { bewerberStatus: "KeinInteresse" });
    expect(stoppGrund(raus, JETZT)).toBe("kein_interesse");
    expect(faelligeErinnerung(raus, JETZT)).toBe("keine");
    expect(faelligeErinnerung(stand(11, { stufe: 2, bewerberStatus: "KeinInteresse" }), JETZT)).toBe("keine");
    expect(naechsterSchrittAm(raus, JETZT)).toBe("");
  });
});

describe("Vom Meta-Feld zum Kettenstand", () => {
  const gesendetAm = new Date(JETZT.getTime() - 30 * 86_400_000).toISOString();
  const erinnerungAm = new Date(JETZT.getTime() - 2 * 86_400_000).toISOString();

  it("liest die Pause aus meta.kennenlernen.pause", () => {
    const gelesen = kettenStand({
      status: "Eingang",
      meta: {
        kennenlernen: {
          gesendetAm,
          pause: { gesetztAm: gesendetAm, erinnerungAm: new Date(JETZT.getTime() + 86_400_000).toISOString() },
        },
      },
    }, { status: "offen" });
    expect(gelesen.pauseGesetzt).toBe(true);
    expect(stoppGrund(gelesen, JETZT)).toBe("pausiert");
  });

  it("zaehlt nach einer abgelaufenen Pause ab dem gewaehlten Tag weiter", () => {
    /*
     * Ohne diese Verschiebung waeren am Tag der Pause sofort alle Stufen
     * faellig: Wer sich am dritten Tag fuer einen Monat vertagt, staende
     * danach bei Tag 33 und bekaeme Erinnerung, letzte Erinnerung und Anruf
     * am selben Morgen.
     */
    const gelesen = kettenStand({
      status: "Eingang",
      meta: { kennenlernen: { gesendetAm, pause: { gesetztAm: gesendetAm, erinnerungAm } } },
    }, { status: "offen" });
    expect(gelesen.gesendetAm).toBe(erinnerungAm);
    expect(tageSeit(gelesen.gesendetAm, JETZT)).toBe(2);
    expect(faelligeErinnerung(gelesen, JETZT)).toBe("keine");
  });

  it("laesst den Einladungstag stehen, wenn nie pausiert wurde", () => {
    const gelesen = kettenStand({
      status: "Eingang",
      meta: { kennenlernen: { gesendetAm } },
    }, { status: "offen" });
    expect(gelesen.gesendetAm).toBe(gesendetAm);
    expect(gelesen.pauseGesetzt).toBe(false);
  });
});

/*
 * Auftrag 2: Die dritte Mail geht an alle, der Schlussstrich nicht.
 *
 * `anrufWidersprochen` heisst laut Code ausdruecklich "interessiert, aber
 * bitte nicht anrufen". Diese Person auf "Kein Interesse" zu setzen schriebe
 * das Gegenteil dessen in die Akte, was sie gesagt hat.
 */
describe("Wer nicht angerufen werden will, wird nicht ausgetragen", () => {
  it("bekommt die dritte Mail, aber keinen Statuswechsel", () => {
    const bittetUmRuhe = stand(11, { stufe: 2, anrufWidersprochen: true });
    expect(faelligeErinnerung(bittetUmRuhe, JETZT)).toBe("tag11");
    expect(darfFallSchliessen(bittetUmRuhe)).toBe(false);
  });

  it("schliesst bei allen anderen den Fall", () => {
    expect(darfFallSchliessen(stand(11, { stufe: 2 }))).toBe(true);
    expect(darfFallSchliessen(stand(11, { stufe: 2, anrufWidersprochen: false }))).toBe(true);
  });

  it("schliesst auch nach einer abgelaufenen Pause, denn sie ist keine Absage von Dauer", () => {
    const nachPause = stand(20, {
      stufe: 2,
      pauseGesetzt: true,
      pausiertBis: new Date(JETZT.getTime() - 2 * 86_400_000).toISOString(),
    });
    expect(faelligeErinnerung(nachPause, JETZT)).toBe("tag11");
    expect(darfFallSchliessen(nachPause)).toBe(true);
  });
});

/*
 * Auftrag 4: Sichtbarkeit.
 *
 * Das eigentliche Problem war nicht die fehlende Automatik, sondern dass
 * niemand diese Bewerber sah. Sie lagen im Eingang wie alle anderen, ohne
 * Kennzeichen, und bei ihnen geschah nichts mehr.
 */
describe("Wer auf eine Entscheidung von Hand wartet", () => {
  it("meldet sich selbst, und die Anzeige sagt seit wann", () => {
    const selbst = stand(40, {
      pauseGesetzt: true,
      pausiertBis: "",
      pauseGesetztAm: new Date(JETZT.getTime() - 34 * 86_400_000).toISOString(),
    });
    const wartet = wartetAufEntscheidung(selbst, JETZT);
    expect(wartet?.grund).toBe("meldet_sich_selbst");
    expect(wartet?.seitTagen).toBe(34);
    expect(wartet?.text).toBe("Meldet sich selbst, seit 34 Tagen");
  });

  it("nennt den Widerspruch gegen den Anruf im Klartext", () => {
    const ruhe = stand(20, { stufe: 3, anrufWidersprochen: true });
    const wartet = wartetAufEntscheidung(ruhe, JETZT);
    expect(wartet?.grund).toBe("nicht_anrufen");
    expect(wartet?.text).toBe("Möchte nicht angerufen werden, seit 20 Tagen");
  });

  it("meldet auch den Fall, bei dem die Kette durch ist und der Stand trotzdem steht", () => {
    // So sieht es aus, wenn die dritte Mail nicht hinausging: Stufe 3, aber
    // niemand hat den Fall geschlossen.
    const haengt = stand(20, { stufe: 3 });
    expect(wartetAufEntscheidung(haengt, JETZT)?.grund).toBe("ohne_abschluss");
  });

  it("schweigt bei allen, bei denen die Kette noch laeuft", () => {
    expect(wartetAufEntscheidung(stand(3), JETZT)).toBeNull();
    expect(wartetAufEntscheidung(stand(11, { stufe: 2 }), JETZT)).toBeNull();
    // Eine laufende Pause mit Datum ist ein Warten mit Termin, keine Sackgasse.
    const mitDatum = stand(9, {
      pauseGesetzt: true,
      pausiertBis: new Date(JETZT.getTime() + 7 * 86_400_000).toISOString(),
    });
    expect(wartetAufEntscheidung(mitDatum, JETZT)).toBeNull();
  });

  it("schweigt, sobald jemand entschieden hat oder der Bogen vorliegt", () => {
    expect(wartetAufEntscheidung(stand(20, { stufe: 3, bewerberStatus: "KeinInteresse" }), JETZT)).toBeNull();
    expect(wartetAufEntscheidung(stand(20, { stufe: 3, bewerberStatus: "Erstgespraech" }), JETZT)).toBeNull();
    expect(
      wartetAufEntscheidung(stand(20, { stufe: 3, formularStatus: "eingereicht" }), JETZT),
    ).toBeNull();
    // Ohne Eingangsmail laeuft gar keine Kette, da gibt es auch nichts zu warten.
    expect(wartetAufEntscheidung({ gesendetAm: null, bewerberStatus: "Eingang" }, JETZT)).toBeNull();
  });
});
