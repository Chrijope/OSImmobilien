import { describe, it, expect } from "vitest";
import {
  belegtUeberInvestagon,
  belegungsAnzeige,
  belegungsRang,
  belegungsText,
  darfBelegteOeffnen,
  darfEinheitOeffnen,
  darfNamenSehen,
  empfohleneZuerst,
  investagonReservierungsdatum,
  istBelegt,
  istEmpfohlen,
  istVorgemerkt,
  nachBelegungGeordnet,
  objektBelegung,
  objektBelegungsRang,
  type AnzeigeEinheit,
  type BelegungsEinheit,
} from "./einheitBelegung";

const einheit = (p: Partial<BelegungsEinheit> = {}): BelegungsEinheit => ({
  status: "frei",
  ...p,
});

describe("istBelegt", () => {
  it("nur frei ist nicht belegt", () => {
    expect(istBelegt({ status: "frei" })).toBe(false);
    expect(istBelegt({ status: "reserviert" })).toBe(true);
    expect(istBelegt({ status: "verkauft" })).toBe(true);
  });
});

describe("belegungsText", () => {
  it("nimmt den Klartext aus Investagon", () => {
    expect(belegungsText(einheit({ status: "reserviert", investagonStatusText: "Notartermin" })))
      .toBe("Notartermin");
    expect(belegungsText(einheit({ status: "reserviert", investagonStatusText: "Angefragt" })))
      .toBe("Angefragt");
  });

  it("faellt auf den CRM-Zustand zurueck, wenn Investagon nichts liefert", () => {
    expect(belegungsText(einheit({ status: "reserviert" }))).toBe("Reserviert");
    expect(belegungsText(einheit({ status: "verkauft" }))).toBe("Verkauft");
  });

  /*
   * Eine ausgegraute Kachel ohne Begruendung ist schlimmer als gar kein
   * Hinweis. Leerzeichen sind deshalb kein Text.
   */
  it("behandelt Leerraum wie fehlend", () => {
    expect(belegungsText(einheit({ status: "reserviert", investagonStatusText: "   " })))
      .toBe("Reserviert");
  });

  it("gibt nie einen leeren Text zurueck", () => {
    for (const status of ["frei", "reserviert", "verkauft"] as const) {
      expect(belegungsText(einheit({ status })).length).toBeGreaterThan(0);
    }
  });
});

describe("darfBelegteOeffnen", () => {
  const partner = { rolle: "vertriebspartner", benutzerId: "u1", name: "Sarah Kaiser-Thom" };

  it("laesst jede freie Einheit durch", () => {
    expect(darfBelegteOeffnen(einheit(), partner)).toBe(true);
  });

  it("sperrt eine belegte Einheit fuer den Vertriebspartner", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", investagonStatusText: "Reserviert" }),
      partner,
    )).toBe(false);
  });

  /*
   * Der Kern der Regel: Eine in Investagon reservierte Einheit hat bei uns
   * keinen Kunden und keinen Berater. Sie gehoert einem fremden Vertrieb,
   * niemand bei uns darf sie vergeben.
   */
  it("sperrt eine in Investagon reservierte Einheit, auch fuer den Namensgleichen", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", investagonStatusText: "Notartermin" }),
      partner,
    )).toBe(false);
  });

  it("laesst den Berater an seinen eigenen Vorgang", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", kundeId: "k1", beraterName: "Sarah Kaiser-Thom" }),
      partner,
    )).toBe(true);
  });

  it("laesst einen fremden Vorgang gesperrt", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", kundeId: "k1", beraterName: "Jemand Anderes" }),
      partner,
    )).toBe(false);
  });

  it("achtet auf die ausdrueckliche Freigabe", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", exklusivNutzer: ["u1"] }),
      partner,
    )).toBe(true);
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", exklusivNutzer: ["u9"] }),
      partner,
    )).toBe(false);
  });

  /*
   * Ohne diese Ausnahme koennte Christian eine Reservierung nicht mehr
   * aufloesen, die er selbst gesetzt hat.
   */
  it("laesst die Leitung ueberall hinein", () => {
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "backoffice"]) {
      expect(darfBelegteOeffnen(
        einheit({ status: "verkauft" }),
        { rolle, benutzerId: "x", name: "Christian Peetz" },
      )).toBe(true);
    }
  });

  it("begruendet kein Recht aus einem leeren Namen", () => {
    expect(darfBelegteOeffnen(
      einheit({ status: "reserviert", beraterName: "" }),
      { rolle: "vertriebspartner", benutzerId: "u1", name: "" },
    )).toBe(false);
  });
});

describe("objektBelegung", () => {
  it("zaehlt frei und belegt", () => {
    const b = objektBelegung([
      einheit(),
      einheit(),
      einheit({ status: "reserviert" }),
    ]);
    expect(b).toMatchObject({ frei: 2, belegt: 1, gesamt: 3, vollBelegt: false, aufdruck: "" });
  });

  /*
   * Freie Straße 10 in Magdeburg: elf Einheiten, alle reserviert. Genau das
   * Objekt, das Christian am 16.09.2026 genannt hat.
   */
  it("erkennt ein voll belegtes Objekt und nimmt den einheitlichen Text", () => {
    const elf = Array.from({ length: 11 }, () =>
      einheit({ status: "reserviert", investagonStatusText: "Reserviert" }));
    expect(objektBelegung(elf)).toMatchObject({
      frei: 0, belegt: 11, vollBelegt: true, aufdruck: "Reserviert",
    });
  });

  /*
   * Heidestraße 3: eine reserviert, eine verkauft. "Reserviert" waere fuer
   * die verkaufte falsch, "Verkauft" fuer die reservierte. Also weder noch.
   */
  it("nimmt den neutralen Aufdruck bei gemischten Zustaenden", () => {
    expect(objektBelegung([
      einheit({ status: "reserviert", investagonStatusText: "Reserviert" }),
      einheit({ status: "verkauft", investagonStatusText: "Verkauft" }),
    ]).aufdruck).toBe("Belegt");
  });

  /*
   * Ein Objekt ohne Einheiten ist nicht ausverkauft, sondern ungepflegt. Es
   * auszugrauen waere eine Falschaussage.
   */
  it("graut ein Objekt ohne Einheiten nicht aus", () => {
    expect(objektBelegung([])).toMatchObject({ gesamt: 0, vollBelegt: false, aufdruck: "" });
  });
});

/**
 * Die Reihenfolge: Was noch zu haben ist, steht oben.
 *
 * Geprueft wird vor allem die Stabilitaet. Die Blockbildung darf die
 * bisherige Sortierung innerhalb eines Blocks nicht antasten, sonst sieht
 * eine nach Wohnungsnummer sortierte Liste plotzlich zufaellig aus.
 */
describe("Reihenfolge nach Belegung", () => {
  /** Einheit mit Kennung, damit sich die Reihenfolge ablesen laesst. */
  const e = (nr: string, p: Partial<BelegungsEinheit> = {}) =>
    ({ nr, status: "frei", ...p }) as BelegungsEinheit & { nr: string };
  const nummern = (liste: Array<BelegungsEinheit & { nr: string }>) => liste.map((x) => x.nr);

  it("kennt vier Stufen: frei, eigener Vorgang, belegt, verkauft", () => {
    const ctx = { rolle: "vertriebspartner", name: "Anna Muster" };
    expect(belegungsRang(e("frei"))).toBe(0);
    expect(belegungsRang(e("eigen", { status: "reserviert", beraterName: "Anna Muster" }), ctx)).toBe(1);
    expect(belegungsRang(e("fremd", { status: "reserviert", beraterName: "Bert Fremd" }), ctx)).toBe(2);
    expect(belegungsRang(e("weg", { status: "verkauft" }), ctx)).toBe(3);
  });

  it("stellt Freie nach oben und Verkaufte ganz ans Ende", () => {
    const liste = [
      e("1", { status: "verkauft" }),
      e("2", { status: "reserviert" }),
      e("3"),
      e("4", { status: "verkauft" }),
      e("5"),
    ];
    expect(nummern(nachBelegungGeordnet(liste))).toEqual(["3", "5", "2", "1", "4"]);
  });

  it("laesst die bisherige Reihenfolge innerhalb der Bloecke unangetastet", () => {
    // Nach Preis sortiert hereingegeben, also absteigend innerhalb jedes Blocks.
    const liste = [
      e("teuer"), e("mittel"), e("guenstig"),
      e("teuer-res", { status: "reserviert" }),
      e("mittel-res", { status: "reserviert" }),
      e("guenstig-res", { status: "reserviert" }),
    ];
    expect(nummern(nachBelegungGeordnet(liste))).toEqual([
      "teuer", "mittel", "guenstig", "teuer-res", "mittel-res", "guenstig-res",
    ]);
  });

  it("aendert nichts, wenn alles frei ist", () => {
    const liste = [e("a"), e("b"), e("c")];
    expect(nummern(nachBelegungGeordnet(liste))).toEqual(["a", "b", "c"]);
  });

  it("aendert nichts, wenn alles gleich belegt ist", () => {
    const liste = [
      e("a", { status: "reserviert" }),
      e("b", { status: "reserviert" }),
      e("c", { status: "reserviert" }),
    ];
    expect(nummern(nachBelegungGeordnet(liste))).toEqual(["a", "b", "c"]);
  });

  it("haelt die Verkauften untereinander in der alten Reihenfolge", () => {
    const liste = [e("a", { status: "verkauft" }), e("b", { status: "verkauft" })];
    expect(nummern(nachBelegungGeordnet(liste))).toEqual(["a", "b"]);
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(nachBelegungGeordnet([])).toEqual([]);
  });

  /*
   * Christians Zusatz: Ein Vertriebspartner, der bei einer belegten Einheit
   * seinen eigenen Kunden gesetzt hat, darf sie nicht aus den Augen
   * verlieren. Sie steht deshalb am Anfang des grauen Blocks, nicht am Ende,
   * wird aber nicht unter die freien gemischt.
   */
  it("zieht den eigenen Vorgang an den Anfang des belegten Blocks", () => {
    const ctx = { rolle: "vertriebspartner", name: "Anna Muster" };
    const liste = [
      e("fremd-1", { status: "reserviert", beraterName: "Bert Fremd" }),
      e("fremd-2", { status: "reserviert" }),
      e("eigen", { status: "reserviert", beraterName: "Anna Muster", kundeId: "k1" }),
      e("frei"),
    ];
    expect(nummern(nachBelegungGeordnet(liste, ctx))).toEqual(["frei", "eigen", "fremd-1", "fremd-2"]);
  });

  it("erkennt den eigenen Vorgang auch ueber die ausdrueckliche Zuweisung", () => {
    const ctx = { rolle: "vertriebspartner", name: "Anna Muster", benutzerId: "u-7" };
    const liste = [
      e("fremd", { status: "reserviert" }),
      e("zugewiesen", { status: "reserviert", exklusivNutzer: ["u-7"] }),
    ];
    expect(nummern(nachBelegungGeordnet(liste, ctx))).toEqual(["zugewiesen", "fremd"]);
  });

  /*
   * Die Leitung darf jede Einheit oeffnen, aber deshalb ist noch lange nicht
   * jede ihr eigener Vorgang. Wuerde die Rolle hier mitzaehlen, saehe
   * Christian den grauen Block in einer anderen Reihenfolge als alle anderen.
   */
  it("macht der Leitung nicht das ganze Haus zum eigenen Vorgang", () => {
    const ctx = { rolle: "admin", name: "Christian" };
    const liste = [
      e("res", { status: "reserviert", beraterName: "Bert Fremd" }),
      e("frei"),
      e("weg", { status: "verkauft" }),
    ];
    expect(nummern(nachBelegungGeordnet(liste, ctx))).toEqual(["frei", "res", "weg"]);
  });

  /*
   * Ohne Nutzerangabe darf kein leerer Beratername auf einen leeren Namen
   * passen, sonst waere jede unbesetzte Einheit "der eigene Vorgang".
   */
  it("haelt den leeren Namen nicht fuer eine Uebereinstimmung", () => {
    const ctx = { rolle: "vertriebspartner", name: "" };
    expect(belegungsRang(e("res", { status: "reserviert", beraterName: "" }), ctx)).toBe(2);
  });
});

describe("objektBelegungsRang", () => {
  const einheitMit = (status: BelegungsEinheit["status"]): BelegungsEinheit => ({ status });

  it("stellt ein Objekt mit freier Einheit nach oben", () => {
    expect(objektBelegungsRang([einheitMit("frei"), einheitMit("reserviert")])).toBe(0);
  });

  it("schiebt ein voll belegtes Objekt nach unten", () => {
    expect(objektBelegungsRang([einheitMit("reserviert"), einheitMit("verkauft")])).toBe(1);
  });

  it("laesst ein Objekt ohne Einheiten oben stehen", () => {
    expect(objektBelegungsRang([])).toBe(0);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * Öffnen, anzeigen, empfehlen (Christian am 23.09.2026)
 *
 * Alle Zeitpunkte werden hier vor Ort gebaut (`new Date(2026, 8, 23, …)`),
 * damit die Uhrzeit in jeder Zeitzone gleich herauskommt.
 * ──────────────────────────────────────────────────────────────────────── */

const JETZT = new Date(2026, 8, 23, 10, 0);
const um = (stunde: number, minute = 0, tag = 23) => new Date(2026, 8, tag, stunde, minute).toISOString();
const anz = (p: Partial<AnzeigeEinheit> = {}): AnzeigeEinheit => ({ status: "frei", ...p });

const ADMIN = { rolle: "admin", benutzerId: "u-admin", name: "Christian Peetz" };
const ANNA = { rolle: "vertriebspartner", benutzerId: "u-anna", name: "Anna Muster" };

describe("istVorgemerkt", () => {
  it("gilt fuer eine freie Einheit mit einem Ende in der Zukunft", () => {
    expect(istVorgemerkt(anz({ vorgemerktBis: um(14, 30) }), JETZT)).toBe(true);
  });

  it("gilt nicht mehr, sobald das Ende vorbei ist", () => {
    expect(istVorgemerkt(anz({ vorgemerktBis: um(9, 59) }), JETZT)).toBe(false);
  });

  it("gilt nicht bei leerem oder unlesbarem Feld", () => {
    expect(istVorgemerkt(anz(), JETZT)).toBe(false);
    expect(istVorgemerkt(anz({ vorgemerktBis: "" }), JETZT)).toBe(false);
    expect(istVorgemerkt(anz({ vorgemerktBis: "morgen" }), JETZT)).toBe(false);
  });

  it("weicht einer Reservierung", () => {
    expect(istVorgemerkt(anz({ status: "reserviert", vorgemerktBis: um(14) }), JETZT)).toBe(false);
  });
});

describe("darfEinheitOeffnen", () => {
  it("oeffnet nur eine freie Einheit, auch eine vorgemerkte", () => {
    expect(darfEinheitOeffnen(anz())).toBe(true);
    expect(darfEinheitOeffnen(anz({ vorgemerktBis: um(14) }))).toBe(true);
  });

  /*
   * Anders als `darfBelegteOeffnen` kennt diese Regel keine Ausnahme fuer
   * die Leitung und keine fuer den eigenen Vorgang.
   */
  it("oeffnet keine reservierte oder verkaufte Einheit, fuer niemanden", () => {
    expect(darfEinheitOeffnen(anz({ status: "reserviert", kundeId: "k1", beraterName: "Anna Muster" }))).toBe(false);
    expect(darfEinheitOeffnen(anz({ status: "verkauft" }))).toBe(false);
  });
});

describe("darfNamenSehen", () => {
  const reserviert = (p: Partial<AnzeigeEinheit> = {}) =>
    anz({ status: "reserviert", kundeId: "k1", kundeName: "Max Kunde", beraterName: "Bernd Berater", ...p });

  it("zeigt Admin, Inhaber und Vertriebsleiter jeden Namen", () => {
    // Backoffice seit dem 23.09.2026: Es wickelt die Reservierungen ab.
    for (const rolle of ["admin", "inhaber", "vertriebsleiter", "backoffice"]) {
      expect(darfNamenSehen(reserviert(), { rolle, benutzerId: "x", name: "Jemand" }, JETZT)).toBe(true);
    }
  });

  it("zeigt anderen Rollen keinen fremden Namen", () => {
    for (const rolle of ["vertriebspartner", "setterin", "objektpartner", "finanzierungspartner"]) {
      expect(darfNamenSehen(reserviert(), { rolle, benutzerId: "x", name: "Jemand" }, JETZT)).toBe(false);
    }
  });

  it("zeigt ohne Nutzer keinen Namen", () => {
    expect(darfNamenSehen(reserviert(), undefined, JETZT)).toBe(false);
  });

  it("erkennt den eigenen Kunden an der Kennung", () => {
    expect(darfNamenSehen(reserviert({ reserviertVon: "u-anna", beraterName: "" }), ANNA, JETZT)).toBe(true);
  });

  /*
   * Zwei Konten koennen denselben Namen tragen. Steht eine Kennung da, gilt
   * sie, der gleiche Name hilft dann nicht.
   */
  it("laesst die Kennung vor dem Namen entscheiden", () => {
    expect(darfNamenSehen(reserviert({ reserviertVon: "u-andere", beraterName: "Anna Muster" }), ANNA, JETZT)).toBe(false);
  });

  it("faellt ohne Kennung auf den Beraternamen zurueck, tolerant verglichen", () => {
    expect(darfNamenSehen(reserviert({ beraterName: "  anna   MUSTER " }), ANNA, JETZT)).toBe(true);
    expect(darfNamenSehen(reserviert({ beraterName: "Bert Fremd" }), ANNA, JETZT)).toBe(false);
  });

  it("begruendet kein Recht aus einem leeren Namen", () => {
    expect(darfNamenSehen(reserviert({ beraterName: "" }), { rolle: "vertriebspartner", name: "" }, JETZT)).toBe(false);
  });

  it("nimmt bei einer Vormerkung den Partner der Vormerkung", () => {
    const w = anz({ vorgemerktBis: um(14), vorgemerktBeraterName: "Anna Muster", beraterName: "Bert Fremd" });
    expect(darfNamenSehen(w, ANNA, JETZT)).toBe(true);
  });

  it("zaehlt die ausdrueckliche Zuweisung nicht als eigenen Kunden", () => {
    expect(darfNamenSehen(reserviert({ exklusivNutzer: ["u-anna"] }), ANNA, JETZT)).toBe(false);
  });
});

describe("belegungsAnzeige", () => {
  const imCrm = (p: Partial<AnzeigeEinheit> = {}) => anz({
    status: "reserviert", kundeId: "k1", kundeName: "Max Kunde", beraterName: "Bernd Berater",
    reserviertAm: "2026-09-12T09:15:00", reserviertVon: "u-bernd", ...p,
  });

  it("gibt dem Admin Kunde, Partner und Datum", () => {
    expect(belegungsAnzeige(imCrm(), ADMIN, JETZT)).toEqual({
      art: "reserviert",
      hinweis: "reserviert am 12.09.2026",
      kundeName: "Max Kunde",
      kundeId: "k1",
      partnerName: "Bernd Berater",
      ueberInvestagon: false,
    });
  });

  it("laesst die Namen fuer alle anderen ganz weg", () => {
    const a = belegungsAnzeige(imCrm(), ANNA, JETZT);
    expect(a).toEqual({ art: "reserviert", hinweis: "reserviert am 12.09.2026", ueberInvestagon: false });
    expect(a).not.toHaveProperty("kundeName");
    expect(a).not.toHaveProperty("partnerName");
  });

  it("zeigt der Partnerin ihren eigenen Kunden", () => {
    const a = belegungsAnzeige(imCrm({ reserviertVon: "u-anna", beraterName: "Anna Muster" }), ANNA, JETZT);
    expect(a.kundeName).toBe("Max Kunde");
    expect(a.partnerName).toBe("Anna Muster");
  });

  it("liest ein reines Datum als Kalendertag vor Ort", () => {
    expect(belegungsAnzeige(imCrm({ reserviertAm: "2026-09-12" }), ADMIN, JETZT).hinweis).toBe("reserviert am 12.09.2026");
  });

  it("schreibt ohne Datum nur „reserviert“", () => {
    expect(belegungsAnzeige(imCrm({ reserviertAm: undefined }), ADMIN, JETZT).hinweis).toBe("reserviert");
    expect(belegungsAnzeige(imCrm({ reserviertAm: "kein Datum" }), ADMIN, JETZT).hinweis).toBe("reserviert");
  });

  it("sagt bei einer verkauften Einheit „verkauft“", () => {
    expect(belegungsAnzeige(imCrm({ status: "verkauft" }), ADMIN, JETZT)).toMatchObject({ art: "verkauft", hinweis: "verkauft" });
  });

  it("sagt bei einer freien Einheit nichts", () => {
    expect(belegungsAnzeige(anz(), ADMIN, JETZT)).toEqual({ art: "frei", hinweis: "", ueberInvestagon: false });
  });

  describe("in Investagon reserviert, ohne Kunden im CRM", () => {
    const investagon = (roh: Record<string, unknown> = {}) => anz({
      status: "reserviert", investagonId: "p1", investagonStatusText: "Reserviert",
      investagonRaw: { active: 6, visibility: 1, statusName: "Reserviert", ...roh },
    });

    it("schreibt „über Investagon“, auch fuer den Admin ohne Namen", () => {
      expect(belegungsAnzeige(investagon(), ADMIN, JETZT)).toEqual({
        art: "reserviert", hinweis: "über Investagon", ueberInvestagon: true,
      });
    });

    /*
     * `updated` ist die letzte Aenderung an der Wohnung, auch jede Preis-
     * oder Textaenderung. Das als Reservierungsdatum zu zeigen, waere geraten.
     */
    it("nimmt `updated` nicht als Reservierungsdatum", () => {
      expect(belegungsAnzeige(investagon({ updated: "2026-09-20T08:00:00Z" }), ADMIN, JETZT).hinweis).toBe("über Investagon");
    });

    it("zeigt ein Datum nur, wenn ein Reservierungsdatum ausdruecklich dasteht", () => {
      expect(belegungsAnzeige(investagon({ reservation_date: "2026-09-18" }), ADMIN, JETZT).hinweis)
        .toBe("über Investagon, reserviert am 18.09.2026");
    });

    it("erkennt die Herkunft auch nur am Rohdatensatz", () => {
      expect(belegtUeberInvestagon(anz({ status: "reserviert", investagonRaw: { active: 5 } }))).toBe(true);
    });

    it("zaehlt eine von Hand reservierte Einheit ohne Kunden nicht dazu", () => {
      expect(belegtUeberInvestagon(anz({ status: "reserviert" }))).toBe(false);
      expect(belegungsAnzeige(anz({ status: "reserviert" }), ADMIN, JETZT).hinweis).toBe("reserviert");
    });

    /*
     * Dieselbe Abgrenzung wie im Import: Kunde, Kundenname oder
     * Reservierungsdatum machen daraus einen Vorgang aus dem CRM.
     */
    it("behandelt eine Investagon-Einheit mit Kunden als Vorgang aus dem CRM", () => {
      const w = { ...investagon(), kundeId: "k1", kundeName: "Max Kunde", beraterName: "Bernd Berater" };
      expect(belegtUeberInvestagon(w)).toBe(false);
      expect(belegungsAnzeige(w, ADMIN, JETZT)).toMatchObject({ kundeName: "Max Kunde", ueberInvestagon: false });
      expect(belegtUeberInvestagon({ ...investagon(), reserviertAm: "2026-09-12" })).toBe(false);
    });
  });

  describe("vorgemerkt", () => {
    const vorgemerkt = (p: Partial<AnzeigeEinheit> = {}) => anz({
      vorgemerktBis: um(14, 30), vorgemerktKundeId: "k5", vorgemerktKundeName: "Vera Vorgemerkt",
      vorgemerktBeraterName: "Bernd Berater", ...p,
    });

    it("schreibt „vorgemerkt bis HH:MM“ samt Kunde und Partner", () => {
      expect(belegungsAnzeige(vorgemerkt(), ADMIN, JETZT)).toEqual({
        art: "vorgemerkt",
        hinweis: "vorgemerkt bis 14:30",
        kundeName: "Vera Vorgemerkt",
        kundeId: "k5",
        partnerName: "Bernd Berater",
        ueberInvestagon: false,
      });
    });

    it("zeigt einer fremden Partnerin nur die Uhrzeit", () => {
      expect(belegungsAnzeige(vorgemerkt(), ANNA, JETZT)).toEqual({
        art: "vorgemerkt", hinweis: "vorgemerkt bis 14:30", ueberInvestagon: false,
      });
    });

    it("nennt das Datum, wenn die Vormerkung erst an einem anderen Tag endet", () => {
      expect(belegungsAnzeige(vorgemerkt({ vorgemerktBis: um(9, 15, 24) }), ADMIN, JETZT).hinweis)
        .toBe("vorgemerkt bis 24.09.2026, 09:15");
    });

    it("ist nach Ablauf wieder eine freie Einheit ohne Angaben", () => {
      expect(belegungsAnzeige(vorgemerkt({ vorgemerktBis: um(8) }), ADMIN, JETZT))
        .toEqual({ art: "frei", hinweis: "", ueberInvestagon: false });
    });
  });
});

describe("investagonReservierungsdatum", () => {
  it("liest nur ausdruecklich benannte Felder", () => {
    expect(investagonReservierungsdatum({ updated: "2026-09-20" })).toBeUndefined();
    expect(investagonReservierungsdatum({ reservedAt: "2026-09-18T10:00:00" })?.getDate()).toBe(18);
  });

  it("verwirft Leeres, Unlesbares und Unplausibles", () => {
    expect(investagonReservierungsdatum(undefined)).toBeUndefined();
    expect(investagonReservierungsdatum({ reservation_date: "" })).toBeUndefined();
    expect(investagonReservierungsdatum({ reservation_date: "irgendwann" })).toBeUndefined();
    expect(investagonReservierungsdatum({ reservation_date: "1970-01-01" })).toBeUndefined();
  });
});

describe("empfohlene Einheiten", () => {
  const e = (id: string, status: BelegungsEinheit["status"] = "frei") => ({ id, status });
  const ids = (liste: Array<{ id: string }>) => liste.map((x) => x.id);

  it("traegt das Abzeichen nur an freien Einheiten", () => {
    const empfohlen = new Set(["a", "b"]);
    expect(istEmpfohlen(e("a"), empfohlen)).toBe(true);
    expect(istEmpfohlen(e("b", "reserviert"), empfohlen)).toBe(false);
    expect(istEmpfohlen(e("c"), empfohlen)).toBe(false);
    expect(istEmpfohlen(e("a"), undefined)).toBe(false);
  });

  it("holt die empfohlenen an den Anfang der freien und laesst Belegte stehen", () => {
    const liste = [e("f1"), e("f2"), e("f3"), e("r1", "reserviert"), e("v1", "verkauft")];
    expect(ids(empfohleneZuerst(liste, new Set(["f3", "r1"])))).toEqual(["f3", "f1", "f2", "r1", "v1"]);
  });

  it("haelt mehrere empfohlene in ihrer bisherigen Reihenfolge", () => {
    const liste = [e("f1"), e("f2"), e("f3"), e("f4")];
    expect(ids(empfohleneZuerst(liste, new Set(["f4", "f2"])))).toEqual(["f2", "f4", "f1", "f3"]);
  });

  /* Nach Status rueckwaerts sortiert stehen die freien unten. */
  it("ordnet die freien auch dann, wenn sie am Ende stehen", () => {
    const liste = [e("v1", "verkauft"), e("r1", "reserviert"), e("f1"), e("f2")];
    expect(ids(empfohleneZuerst(liste, new Set(["f2"])))).toEqual(["v1", "r1", "f2", "f1"]);
  });

  it("aendert ohne Empfehlung nichts und liefert eine Kopie", () => {
    const liste = [e("f1"), e("r1", "reserviert")];
    const ergebnis = empfohleneZuerst(liste, new Set());
    expect(ids(ergebnis)).toEqual(["f1", "r1"]);
    expect(ergebnis).not.toBe(liste);
    expect(ids(empfohleneZuerst(liste, undefined))).toEqual(["f1", "r1"]);
  });
});
