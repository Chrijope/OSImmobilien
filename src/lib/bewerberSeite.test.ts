import { describe, it, expect } from "vitest";
import {
  PAUSEN_WAHLEN,
  alsDatum,
  antwortFrist,
  erinnerungsDatum,
  frageOffen,
  leseStand,
  pauseLaeuft,
  pruefeAnfrage,
  stationen,
  werAmZug,
  zustandVon,
  type BewerberSeiteStand,
} from "@/lib/bewerberSeite";

const JETZT = new Date("2026-09-20T08:00:00.000Z");

/** Die Rohantwort von `get_bewerber_seite`, so knapp wie moeglich. */
function roh(rest: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vorname: "Jonas",
    beworben_am: "2026-09-08T09:00:00.000Z",
    beendet: false,
    beendet_durch: "",
    zugesagt: false,
    kennenlernen: { token: "a".repeat(64), status: "offen", angefangen: false, gesendet_am: "2026-09-08T09:05:00.000Z" },
    termin: { datum: "", uhrzeit: "", berater: "", gefuehrt_am: "" },
    entscheidung: {},
    start: {},
    pause: {},
    frage: {},
    anruf_widersprochen: false,
    ...rest,
  };
}

function stand(rest: Record<string, unknown> = {}): BewerberSeiteStand {
  const gelesen = leseStand(roh(rest));
  if (!gelesen) throw new Error("Stand nicht lesbar");
  return gelesen;
}

describe("Was die Datenbank liefert", () => {
  it("liest den Stand und faellt bei Unsinn auf null zurueck", () => {
    expect(leseStand(null)).toBeNull();
    expect(leseStand("nichts")).toBeNull();
    expect(leseStand([])).toBeNull();
    expect(leseStand({})).toBeNull();
    expect(stand().vorname).toBe("Jonas");
  });

  it("macht aus leeren Bloecken null und nicht aus halben Objekten Zustaende", () => {
    const s = stand();
    expect(s.pause).toBeNull();
    expect(s.frage).toBeNull();
    expect(s.entscheidung).toBeNull();
  });

  it("nimmt die Zusammenfassung nur mit ausdruecklicher Freigabe an", () => {
    // Ohne Freigabedatum bleibt der Block leer, auch wenn ein Text darin steht.
    expect(stand({ entscheidung: { text: "steht hier" } }).entscheidung).toBeNull();
    const frei = stand({
      entscheidung: { freigegeben_am: "2026-09-15T10:00:00.000Z", text: "steht hier" },
    });
    expect(frei.entscheidung?.text).toBe("steht hier");
  });
});

describe("Die fuenf Zustaende", () => {
  it("Zustand 1: ab Eingang der Bewerbung", () => {
    expect(zustandVon(stand(), JETZT)).toBe("eingang");
  });

  it("Zustand 2: pausiert, und eine Pause ist kein fehlendes Interesse", () => {
    const s = stand({
      pause: { gesetztAm: "2026-09-10T09:00:00.000Z", erinnerungAm: "2026-09-27T09:00:00.000Z" },
    });
    expect(zustandVon(s, JETZT)).toBe("unterbrochen");
    expect(s.beendet).toBe(false);
  });

  it("Zustand 2 auch mit offener Rueckfrage, ohne Pause", () => {
    const s = stand({
      frage: { gestelltAm: "2026-09-18T09:00:00.000Z", text: "Welchen Umfang braucht die 34c?", bisAm: "2026-09-22T09:00:00.000Z" },
    });
    expect(zustandVon(s, JETZT)).toBe("unterbrochen");
  });

  it("Zustand 3: der Videocall steht", () => {
    expect(zustandVon(stand({ termin: { datum: "2026-09-24", uhrzeit: "16:30" } }), JETZT)).toBe("termin");
  });

  it("Zustand 4: nach dem Gespraech", () => {
    const s = stand({ termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" } });
    expect(zustandVon(s, JETZT)).toBe("entscheidung");
  });

  it("Zustand 5: nach der Zusage", () => {
    expect(zustandVon(stand({ zugesagt: true }), JETZT)).toBe("start");
    expect(zustandVon(stand({ start: { vertrag_unterschrieben_am: "2026-09-15" } }), JETZT)).toBe("start");
  });

  it("Das Ende schlaegt alles, und der Videocall schlaegt die Pause", () => {
    expect(zustandVon(stand({ beendet: true, zugesagt: true }), JETZT)).toBe("beendet");
    const gebuchtUndGefragt = stand({
      termin: { datum: "2026-09-24", uhrzeit: "16:30" },
      frage: { gestelltAm: "2026-09-18T09:00:00.000Z", text: "kurz", bisAm: "" },
    });
    expect(zustandVon(gebuchtUndGefragt, JETZT)).toBe("termin");
  });
});

describe("Wer am Zug ist", () => {
  it("ist normalerweise der Bewerber", () => {
    expect(werAmZug(stand(), JETZT)).toBe("bewerber");
  });

  it("ist MOREImmo, sobald eine Frage offen ist, obwohl der Bewerber im Eingang steht", () => {
    // Genau der Satz aus der Abstimmungsfassung: abgeleitet aus dem Vorgang
    // und nicht aus der Pipelinestufe.
    const s = stand({
      frage: { gestelltAm: "2026-09-18T09:00:00.000Z", text: "Wie ist das mit der 34c?", bisAm: "2026-09-22T09:00:00.000Z" },
    });
    expect(zustandVon(s, JETZT)).toBe("unterbrochen");
    expect(werAmZug(s, JETZT)).toBe("moreimmo");
  });

  it("ist wieder der Bewerber, sobald die Frage beantwortet ist", () => {
    const s = stand({
      frage: {
        gestelltAm: "2026-09-18T09:00:00.000Z",
        text: "Wie ist das mit der 34c?",
        bisAm: "2026-09-22T09:00:00.000Z",
        beantwortetAm: "2026-09-19T11:00:00.000Z",
      },
    });
    expect(frageOffen(s.frage)).toBe(false);
    expect(werAmZug(s, JETZT)).toBe("bewerber");
  });

  it("ist MOREImmo nach dem Gespraech, solange die Zusammenfassung nicht freigegeben ist", () => {
    const ohne = stand({ termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" } });
    expect(werAmZug(ohne, JETZT)).toBe("moreimmo");

    const mit = stand({
      termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" },
      entscheidung: { freigegeben_am: "2026-09-19T09:00:00.000Z", einschaetzung: "Eine Zusammenarbeit ist möglich." },
    });
    expect(werAmZug(mit, JETZT)).toBe("bewerber");
  });

  it("ist niemand mehr, wenn die Bewerbung beendet ist", () => {
    expect(werAmZug(stand({ beendet: true }), JETZT)).toBe("niemand");
  });
});

describe("Die vier Stationen", () => {
  it("stehen in jedem Zustand da, immer vier, immer in derselben Reihenfolge", () => {
    for (const abwandlung of [
      {},
      { pause: { gesetztAm: "2026-09-10T09:00:00.000Z", erinnerungAm: "2026-09-27T09:00:00.000Z" } },
      { termin: { datum: "2026-09-24", uhrzeit: "16:30" } },
      { termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" } },
      { zugesagt: true },
      { beendet: true },
    ]) {
      const liste = stationen(stand(abwandlung), JETZT);
      expect(liste.map((s) => s.schluessel)).toEqual([
        "bewerbung", "kennenlernen", "videocall", "entscheidung",
      ]);
      expect(liste.every((s) => s.zeile.length > 0)).toBe(true);
    }
  });

  it("markiert genau eine Station als die, an der der Bewerber dran ist", () => {
    const dran = (s: BewerberSeiteStand) => stationen(s, JETZT).filter((z) => z.stand === "dran");
    expect(dran(stand()).map((z) => z.schluessel)).toEqual(["kennenlernen"]);
    expect(dran(stand({ termin: { datum: "2026-09-24" } })).map((z) => z.schluessel)).toEqual(["videocall"]);
    expect(
      dran(stand({ termin: { datum: "2026-09-18", gefuehrt_am: "2026-09-18T14:30:00.000Z" } }))
        .map((z) => z.schluessel),
    ).toEqual(["entscheidung"]);
  });

  it("nennt die selbst gewaehlte Erinnerung beim Datum und verspricht bis dahin nichts", () => {
    const s = stand({ pause: { gesetztAm: "2026-09-10T09:00:00.000Z", erinnerungAm: "2026-09-27T09:00:00.000Z" } });
    const zeile = stationen(s, JETZT)[1].zeile;
    expect(zeile).toContain("27.09.2026");
    expect(zeile).toContain("vorher nicht");
  });

  it("zeigt die Bewerbung immer als erledigt, sie ist ja da", () => {
    expect(stationen(stand(), JETZT)[0].stand).toBe("erledigt");
  });
});

describe("Die selbst gewaehlte Pause", () => {
  it("bietet vier Moeglichkeiten, und die vierte ist der Ausstieg", () => {
    expect(PAUSEN_WAHLEN.map((w) => w.wert)).toEqual(["woche", "monat", "ohne", "beenden"]);
  });

  it("rechnet eine Woche und einen Monat aus, und ohne Wahl kein Datum", () => {
    expect(alsDatum(erinnerungsDatum("woche", JETZT))).toBe("27.09.2026");
    expect(alsDatum(erinnerungsDatum("monat", JETZT))).toBe("20.10.2026");
    expect(erinnerungsDatum("ohne", JETZT)).toBe("");
  });

  it("laeuft bis zum gewaehlten Tag und ohne Datum ohne Ende", () => {
    expect(pauseLaeuft({ gesetztAm: "2026-09-10", erinnerungAm: "2026-09-27T09:00:00.000Z" }, JETZT)).toBe(true);
    expect(pauseLaeuft({ gesetztAm: "2026-09-10", erinnerungAm: "2026-09-12T09:00:00.000Z" }, JETZT)).toBe(false);
    expect(pauseLaeuft({ gesetztAm: "2026-09-10", erinnerungAm: "" }, JETZT)).toBe(true);
    expect(pauseLaeuft(null, JETZT)).toBe(false);
  });
});

describe("Die Frist der Rueckfrage", () => {
  it("liegt zwei Werktage voraus und faellt nie auf ein Wochenende", () => {
    // Donnerstag, 17.09.2026 → Montag, 21.09.2026
    const donnerstag = new Date("2026-09-17T09:00:00.000Z");
    expect(new Date(antwortFrist(donnerstag)).getDay()).toBe(1);
    for (let i = 0; i < 14; i++) {
      const tag = new Date(donnerstag.getTime() + i * 86_400_000);
      const wochentag = new Date(antwortFrist(tag)).getDay();
      expect(wochentag).not.toBe(0);
      expect(wochentag).not.toBe(6);
    }
  });
});

describe("Die Pruefung der Anfrage", () => {
  const token = "b".repeat(64);

  it("weist einen Honigtopf freundlich ab, ohne etwas zu schreiben", () => {
    const p = pruefeAnfrage({ token, aktion: "pause", wahl: "woche", hp: "ausgefuellt" });
    expect(p.ok).toBe(false);
    expect(p.ok === false && p.bot).toBe(true);
  });

  it("verlangt ein Token in der richtigen Form", () => {
    expect(pruefeAnfrage({ token: "kurz", aktion: "weiter" }).ok).toBe(false);
    expect(pruefeAnfrage({ token: token.toUpperCase(), aktion: "weiter" }).ok).toBe(true);
  });

  it("kennt genau fuenf Aktionen", () => {
    expect(pruefeAnfrage({ token, aktion: "loeschen" }).ok).toBe(false);
    for (const aktion of ["weiter", "kein_anruf", "ausstieg"]) {
      expect(pruefeAnfrage({ token, aktion }).ok).toBe(true);
    }
  });

  it("verlangt bei der Pause eine der drei Wartezeiten und rechnet das Datum aus", () => {
    expect(pruefeAnfrage({ token, aktion: "pause" }).ok).toBe(false);
    expect(pruefeAnfrage({ token, aktion: "pause", wahl: "beenden" }).ok).toBe(false);
    const p = pruefeAnfrage({ token, aktion: "pause", wahl: "ohne" });
    expect(p.ok && p.erinnerungAm).toBe("");
    const w = pruefeAnfrage({ token, aktion: "pause", wahl: "woche" });
    expect(w.ok && w.erinnerungAm.length > 0).toBe(true);
  });

  it("laesst eine Frage nicht leer und nicht endlos sein", () => {
    expect(pruefeAnfrage({ token, aktion: "frage", text: "  " }).ok).toBe(false);
    expect(pruefeAnfrage({ token, aktion: "frage", text: "x".repeat(2000) }).ok).toBe(false);
    const p = pruefeAnfrage({ token, aktion: "frage", text: "  Wie lange dauert das?  " });
    expect(p.ok && p.text).toBe("Wie lange dauert das?");
  });
});
