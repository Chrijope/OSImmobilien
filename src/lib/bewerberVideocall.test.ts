import { describe, it, expect } from "vitest";
import { DAUER_KURZ_MINUTEN, DAUER_LANG_MINUTEN } from "./bewerberKennenlernen";
import {
  ANKNUEPFUNG,
  ARBEITSTEILUNG_SCHRITTE,
  BEDINGUNGEN_GELESEN,
  KERNBAUSTEINE,
  KERN_MINUTEN,
  MODULE,
  MODUL_MINUTEN,
  STRECKEN,
  aktiveModule,
  bausteinMinuten,
  dauerBegruendung,
  dauerMinuten,
  entscheidendeAntworten,
  FOLIEN_HERKUNFT,
  folienFolge,
  getModeration,
  getStrecke,
  impulsFuer,
  merkmale,
  modulMatrix,
  modulWahl,
  offenePunkte,
  pufferMinuten,
  tagesordnung,
  videocallFolien,
  vorbereitungsPunkte,
  zusatzModule,
  lies,
  brauchtAdressen,
  closingEntscheidungAus,
  eingereichteKennenlernZeile,
  abschlussWirkung,
  sendetStartfahrplan,
  folgeterminVorschlag,
  kennenlernBefund,
  vollstaendigerUeberblick,
  WUNSCH_LABELS,
  ZWEITES_PRODUKT_SCHLUSSSATZ,
  type ModulId,
} from "./bewerberVideocall";
import {
  WEGE,
  anschlussUnten,
  ansichtNummer,
  ansichtenFuer,
  type KennenlernenAntworten,
  type WegId,
} from "./bewerberKennenlernen";

/**
 * Der Bogen eines Bewerbers, so vollständig wie er nach dem Absenden aussieht.
 * Einzelne Antworten werden je Test überschrieben.
 */
function bogen(patch: Partial<KennenlernenAntworten> = {}): KennenlernenAntworten {
  return {
    weg: "weg1",
    hintergrund: ["beratung", "akquise"],
    wegAntwort1: "4_bis_10",
    wegAntwort2: ["objektsuche", "unterlagen", "abwicklung"],
    passung: ["selbststaendig", "variabel", "akquise", "zeitplan"],
    verstaendnisFixum: "nein",
    verstaendnisProvision: "nein",
    zeitProWoche: "10_bis_20",
    perspektive: "spaeter_haupt",
    leadPraeferenz: "eigen",
    einkommensziel: "5000_10000",
    startzeitpunkt: "vier_wochen",
    erreichbarkeit: ["abends"],
    gewerbe: "ja",
    erlaubnis34c: "nein",
    themen: ["verdienst", "leads"],
    eigeneFrage: "Wie schnell bekomme ich ein Objekt, wenn ein Kunde konkret wird?",
    ...patch,
  };
}

describe("bewerberVideocall: die sechs Kernbausteine", () => {
  it("es sind sieben, in der Reihenfolge des Termins", () => {
    expect(KERNBAUSTEINE.map((b) => b.id)).toEqual([
      "begruessung", "ausgangslage", "arbeitsteilung", "service",
      "bedingungen", "weitergehen",
    ]);
  });

  it("sie ergeben zusammen 26 Minuten", () => {
    expect(KERN_MINUTEN).toBe(26);
  });

  it("nur die Servicefolie trägt keine Nummer, die anderen zählen von 1 bis 5", () => {
    const nummern = KERNBAUSTEINE.map((b) => b.nummer);
    expect(nummern.filter((n) => n === null)).toHaveLength(1);
    expect(nummern.filter((n): n is number => n !== null)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("bewerberVideocall: die sieben Module", () => {
  it("es sind sieben mit eindeutigen Ids und Nummern", () => {
    // Sechs stammen aus der Abstimmungsfassung, das siebte ist das zweite
    // Produkt auf Weg 2 (Punkt O1 der Sollfassung vom 07.09.2026).
    expect(MODULE).toHaveLength(7);
    expect(new Set(MODULE.map((m) => m.id)).size).toBe(7);
    expect(MODULE.map((m) => m.nummer).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("jedes Modul dauert fünf Minuten", () => {
    expect(MODUL_MINUTEN).toBe(5);
  });
});

describe("bewerberVideocall: was aus den alten Folien wird", () => {
  it("keine der achtzehn Folien wird ersatzlos gestrichen", () => {
    const alteNummern = FOLIEN_HERKUNFT.map((h) => h.alt).filter((a) => /^\d+ · /.test(a));
    expect(alteNummern).toHaveLength(18);
    expect(new Set(FOLIEN_HERKUNFT.map((h) => h.alt)).size).toBe(FOLIEN_HERKUNFT.length);
  });

  it("jedes Ziel gibt es wirklich, als Kernbaustein, als Modul oder vorab im Bogen", () => {
    const bausteine = new Set<string>([
      ...KERNBAUSTEINE.map((b) => b.id),
      ...MODULE.map((m) => m.id),
      "vorab",
    ]);
    for (const h of FOLIEN_HERKUNFT) expect(bausteine.has(h.ziel)).toBe(true);
  });

  it("jedes Modul hat mindestens eine Herkunft in der Tabelle", () => {
    for (const m of MODULE) {
      expect(FOLIEN_HERKUNFT.some((h) => h.ziel === m.id)).toBe(true);
    }
  });
});

describe("bewerberVideocall: Zuordnung Strecke zu Modulen", () => {
  it("die fünf Strecken sind genau die fünf Wege des Kennenlernens", () => {
    expect(STRECKEN.map((s) => s.weg)).toEqual(WEGE.map((w) => w.id));
    for (const s of STRECKEN) expect(s.label).toBe(WEGE.find((w) => w.id === s.weg)?.label);
  });

  /**
   * Die Matrix aus der Abstimmungsfassung, Zeile für Zeile. Ein Haken heißt
   * immer, ein B heißt bei Bedarf, ein Strich heißt gar nicht.
   */
  const MATRIX: Record<ModulId, Record<WegId, "gesetzt" | "beiBedarf" | "nicht">> = {
    m1: { weg1: "gesetzt", weg2: "nicht", weg3: "nicht", weg4: "beiBedarf", weg5: "nicht" },
    m6: { weg1: "gesetzt", weg2: "beiBedarf", weg3: "beiBedarf", weg4: "nicht", weg5: "nicht" },
    m2: { weg1: "nicht", weg2: "gesetzt", weg3: "nicht", weg4: "nicht", weg5: "nicht" },
    m3: { weg1: "nicht", weg2: "beiBedarf", weg3: "gesetzt", weg4: "nicht", weg5: "beiBedarf" },
    m4: { weg1: "nicht", weg2: "nicht", weg3: "nicht", weg4: "gesetzt", weg5: "beiBedarf" },
    m5: { weg1: "nicht", weg2: "nicht", weg3: "nicht", weg4: "beiBedarf", weg5: "gesetzt" },
    // Das zweite Produkt gibt es nur auf dem Weg der Finanzberatung, und dort
    // fest. Auf allen anderen Wegen wäre es ein Thema ohne Anlass.
    m7: { weg1: "nicht", weg2: "gesetzt", weg3: "nicht", weg4: "nicht", weg5: "nicht" },
  };

  it("jede Zelle der Matrix stimmt", () => {
    for (const modul of MODULE) {
      for (const strecke of STRECKEN) {
        expect(modulWahl(strecke.weg, modul.id)).toBe(MATRIX[modul.id][strecke.weg]);
      }
    }
  });

  it("modulMatrix liefert dieselbe Tabelle noch einmal", () => {
    const tabelle = modulMatrix();
    expect(tabelle.map((z) => z.modul.id)).toEqual(MODULE.map((m) => m.id));
    for (const zeile of tabelle) {
      for (const strecke of STRECKEN) {
        expect(zeile.wahl[strecke.weg]).toBe(MATRIX[zeile.modul.id][strecke.weg]);
      }
    }
  });

  it("auf Strecke 1 laufen beide Module gesetzt, die Konditionen vor dem Objektangebot", () => {
    expect(aktiveModule("weg1")).toEqual(["m6", "m1"]);
  });

  it("Strecke 2 hat zwei gesetzte Module, die Brücke und das zweite Produkt", () => {
    expect(getStrecke("weg2")?.gesetzt).toEqual(["m2", "m7"]);
  });

  it("die übrigen Strecken haben genau ein gesetztes Modul", () => {
    for (const weg of ["weg3", "weg4", "weg5"] as WegId[]) {
      expect(getStrecke(weg)?.gesetzt).toHaveLength(1);
    }
  });

  it("kein Modul ist auf einer Strecke gleichzeitig gesetzt und bei Bedarf", () => {
    for (const s of STRECKEN) {
      expect(s.gesetzt.filter((m) => s.beiBedarf.includes(m))).toEqual([]);
    }
  });

  it("ein zugeschaltetes Modul kommt hinter die gesetzten", () => {
    expect(aktiveModule("weg2", ["m6"])).toEqual(["m2", "m7", "m6"]);
    expect(aktiveModule("weg2", ["m6", "m3"])).toEqual(["m2", "m7", "m3", "m6"]);
  });

  it("ein Modul, das diese Strecke gar nicht kennt, lässt sich trotzdem einschieben", () => {
    expect(aktiveModule("weg3", ["m1"])).toEqual(["m3", "m1"]);
  });

  it("ein doppelt genanntes Modul erscheint nur einmal", () => {
    expect(aktiveModule("weg5", ["m3", "m3"])).toEqual(["m5", "m3"]);
  });
});

describe("bewerberVideocall: Dauer und Folienzahl je Strecke", () => {
  /** Der Regelfall aus den fünf Durchgängen der Abstimmungsfassung. */
  const REGELFALL: { weg: WegId; folien: number; minuten: number }[] = [
    { weg: "weg1", folien: 8, minuten: 36 },
    // Weg 2 läuft mit zwei gesetzten Modulen, seit das zweite Produkt dazugehört.
    { weg: "weg2", folien: 8, minuten: 36 },
    { weg: "weg3", folien: 7, minuten: 31 },
    { weg: "weg4", folien: 7, minuten: 31 },
    { weg: "weg5", folien: 7, minuten: 35 },
  ];

  it("Folienzahl und Dauer im Regelfall", () => {
    for (const f of REGELFALL) {
      expect(folienFolge(f.weg)).toHaveLength(f.folien);
      expect(dauerMinuten(f.weg)).toBe(f.minuten);
    }
  });

  it("mit allen angebotenen Modulen bleibt es bei acht bis zehn Folien und 36 bis 46 Minuten", () => {
    // Seit dem Wegfall der Arbeitsprobe ist jede Strecke eine Folie und sieben
    // Minuten kürzer. Die Obergrenze gilt nur, wenn zusätzlich jedes angebotene
    // Modul zugeschaltet wird.
    for (const s of STRECKEN) {
      const alle = s.beiBedarf;
      expect(folienFolge(s.weg, alle).length).toBeGreaterThanOrEqual(8);
      expect(folienFolge(s.weg, alle).length).toBeLessThanOrEqual(10);
      expect(dauerMinuten(s.weg, alle)).toBeGreaterThanOrEqual(36);
      expect(dauerMinuten(s.weg, alle)).toBeLessThanOrEqual(46);
    }
  });

  it("Strecke 5 bekommt 35 statt 31 Minuten, die Differenz ist Puffer", () => {
    expect(bausteinMinuten("weg5")).toBe(31);
    expect(dauerMinuten("weg5")).toBe(35);
    expect(pufferMinuten("weg5")).toBe(4);
  });

  it("der Puffer der Strecke 5 schrumpft, sobald Module dazukommen", () => {
    // Ein Modul mehr: die Bausteine ergeben 36, die Untergrenze greift nicht mehr.
    expect(bausteinMinuten("weg5", ["m3"])).toBe(36);
    expect(dauerMinuten("weg5", ["m3"])).toBe(36);
    expect(pufferMinuten("weg5", ["m3"])).toBe(0);
    // Beide angebotenen Module: 41 Minuten.
    expect(dauerMinuten("weg5", ["m3", "m4"])).toBe(41);
    expect(pufferMinuten("weg5", ["m3", "m4"])).toBe(0);
  });

  /*
   * Die Untergrenze ist am 08.09.2026 von 45 auf 35 gesunken, zusammen mit der
   * langen Fassung im Kennenlernen. Sie darf nie über der gebuchten Länge
   * liegen, sonst verspricht die Tagesordnung mehr Zeit, als im Kalender steht.
   */
  it("nur Strecke 5 hat eine Untergrenze, und sie ist die lange gebuchte Dauer", () => {
    for (const s of STRECKEN) {
      if (s.weg === "weg5") expect(s.untergrenze).toBe(DAUER_LANG_MINUTEN);
      else expect(s.untergrenze).toBe(0);
    }
    expect(DAUER_LANG_MINUTEN).toBe(35);
    expect(DAUER_KURZ_MINUTEN).toBe(25);
  });
});

describe("bewerberVideocall: die Folienfolge", () => {
  it("der Kern läuft in jedem Gespräch, die Module stehen zwischen Arbeitsteilung und Servicefolie", () => {
    for (const s of STRECKEN) {
      const folge = folienFolge(s.weg, s.beiBedarf);
      const kern = folge.filter((f) => f.art === "kern").map((f) => f.id);
      expect(kern).toEqual(KERNBAUSTEINE.map((b) => b.id));
      const ersteModul = folge.findIndex((f) => f.art === "modul");
      const service = folge.findIndex((f) => f.art === "kern" && f.id === "service");
      expect(ersteModul).toBe(3);
      expect(service).toBeGreaterThan(ersteModul);
    }
  });

  /*
   * Die Arbeitsprobe ist am 08.09.2026 aus dem Gespräch genommen worden, auf
   * allen fünf Strecken und in beiden Fassungen. Der Test hält das fest,
   * damit sie nicht über einen Rückbau still zurückkommt.
   */
  it("die Arbeitsprobe kommt auf keiner der fünf Strecken mehr vor", () => {
    for (const s of STRECKEN) {
      const folge = folienFolge(s.weg, s.beiBedarf);
      expect(folge.some((f) => f.id === ("arbeitsprobe" as never))).toBe(false);
      const folien = videocallFolien(bogen({ weg: s.weg }), s.beiBedarf);
      const text = JSON.stringify(folien);
      expect(text).not.toContain("Arbeitsprobe");
      expect(text).not.toContain("Rendite du garantierst");
      expect(tagesordnung(s.weg, s.beiBedarf).some((z) => z.text.includes("Fall aus der Praxis"))).toBe(false);
    }
    expect(KERNBAUSTEINE.some((b) => b.id === ("arbeitsprobe" as never))).toBe(false);
  });

  it("die Tagesordnung nennt jedes gewählte Modul und summiert sich auf die Dauer", () => {
    for (const s of STRECKEN) {
      const zeilen = tagesordnung(s.weg, s.beiBedarf);
      const summe = zeilen.reduce((n, z) => n + z.minuten, 0);
      // Die Begrüßung selbst steht nicht in ihrer eigenen Tagesordnung.
      expect(summe + 3).toBe(dauerMinuten(s.weg, s.beiBedarf));
      for (const m of aktiveModule(s.weg, s.beiBedarf)) {
        const modul = MODULE.find((x) => x.id === m);
        expect(zeilen.some((z) => z.text === modul?.agenda)).toBe(true);
      }
    }
  });

  it("nur die Tagesordnung der Strecke 5 hat eine Pufferzeile", () => {
    expect(tagesordnung("weg5").some((z) => z.text.startsWith("Puffer"))).toBe(true);
    expect(tagesordnung("weg1").some((z) => z.text.startsWith("Puffer"))).toBe(false);
  });
});

describe("bewerberVideocall: die Folien greifen den Bogen auf", () => {
  it("ohne gewählten Weg gibt es keine Folien und damit keinen Termin", () => {
    expect(videocallFolien({})).toEqual([]);
    expect(videocallFolien({ weg: "unbekannt" })).toEqual([]);
  });

  it("Folien-Ids sind eindeutig und stabil", () => {
    const folien = videocallFolien(bogen());
    expect(new Set(folien.map((f) => f.id)).size).toBe(folien.length);
    expect(folien[0].id).toBe("kern-begruessung");
    expect(folien[folien.length - 1].id).toBe("kern-weitergehen");
  });

  it("die Begrüßung nennt die markierten Themen und die eigene Frage im Wortlaut", () => {
    const folien = videocallFolien(bogen());
    const block = folien[0].bloecke.find((b) => b.art === "themen");
    expect(block?.art === "themen" && block.themen).toEqual([
      "Verdienst und Rechenwege", "Leads und Kundengewinnung",
    ]);
    expect(block?.art === "themen" && block.frage).toContain("wenn ein Kunde konkret wird");
  });

  it("die Arbeitsteilung nennt auf Strecke 1 genau die markierten Zeitfresser", () => {
    const folien = videocallFolien(bogen({ wegAntwort2: ["objektsuche", "akquise"] }));
    const folie = folien.find((f) => f.bausteinId === "arbeitsteilung");
    const kasten = folie?.bloecke.filter((b) => b.art === "kasten").at(-1);
    const text = kasten?.art === "kasten" ? kasten.text : "";
    expect(text).toContain("Objekte suchen und prüfen");
    // Die Kundengewinnung fällt gerade nicht weg, und das steht auch so da.
    expect(text).toContain("Kunden überhaupt erst finden");
    expect(text).toContain("nimmt dir hier niemand ab");
  });

  it("die fünf Schritte der Arbeitsteilung sind auf allen Strecken wortgleich", () => {
    for (const s of STRECKEN) {
      const folie = videocallFolien(bogen({ weg: s.weg })).find((f) => f.bausteinId === "arbeitsteilung");
      const schritte = folie?.bloecke.find((b) => b.art === "schritte");
      expect(schritte?.art === "schritte" && schritte.schritte).toEqual(ARBEITSTEILUNG_SCHRITTE);
    }
  });

  /*
   * Die Schlussfolie trägt seit dem 22.09.2026 als letzten Kasten seinen
   * eigenen Startzeitpunkt. Der Rest der Folie ist weiterhin auf allen
   * Strecken wortgleich, und genau das prüft dieser Test: verglichen wird
   * ohne den letzten Kasten, weil dessen Ansichtsnummer am Weg hängt.
   */
  it("Servicefolie und Schlussfolie sind auf allen Strecken gleich, bis auf seinen Startzeitpunkt", () => {
    const je = (weg: WegId, id: string) =>
      videocallFolien(bogen({ weg })).find((f) => f.bausteinId === id);
    const ohneStart = (weg: WegId) => JSON.stringify(je(weg, "weitergehen")?.bloecke.slice(0, -1));
    const referenzService = JSON.stringify(je("weg1", "service")?.bloecke);
    const referenzSchluss = ohneStart("weg1");
    for (const s of STRECKEN) {
      expect(JSON.stringify(je(s.weg, "service")?.bloecke)).toBe(referenzService);
      expect(ohneStart(s.weg)).toBe(referenzSchluss);
    }
  });

  it("der Verbotskasten steht auf jeder Fassung der Ausgangslage", () => {
    for (const s of STRECKEN) {
      const folie = videocallFolien(bogen({ weg: s.weg })).find((f) => f.bausteinId === "ausgangslage");
      const kasten = folie?.bloecke.find((b) => b.art === "kasten");
      expect(kasten?.art === "kasten" && kasten.titel).toContain("ausdrücklich nicht steht");
      expect(kasten?.art === "kasten" && kasten.text).toContain("Keine Punktzahl");
    }
  });

  it("keine Folie nennt eine Punktzahl, Prozentangabe zur Eignung oder eine Kundenprognose", () => {
    for (const s of STRECKEN) {
      const text = JSON.stringify(videocallFolien(bogen({ weg: s.weg }), s.beiBedarf));
      expect(text).not.toMatch(/Eignungsprozent(?!e, keine)/);
      expect(text).not.toMatch(/Punktwert|Score|Empfehlung A/);
    }
  });
});

describe("bewerberVideocall: der Tätigkeitsmaßstab auf der Bedingungsfolie", () => {
  /*
   * Seit dem 10.09.2026. Er steht in der Liste dessen, was der Bewerber schon
   * gelesen hat, und nicht auf einer eigenen Folie: Im Kennenlernbogen steht
   * er auf der Ansicht „Was wir erwarten", hier wird er bestätigt. Der Kasten
   * darunter ist die Antwort auf die Rückfrage und keine zweite Erklärung.
   */
  it("steht als sechster Punkt in dem, was schon gelesen wurde", () => {
    expect(BEDINGUNGEN_GELESEN).toHaveLength(6);
    expect(BEDINGUNGEN_GELESEN[5]).toContain("zwei aufeinanderfolgenden Quartalen");
  });

  it("hat einen Kasten mit Fundstelle, Ausnahmen und der Rückfrage vorher", () => {
    for (const s of STRECKEN) {
      const folie = videocallFolien(bogen({ weg: s.weg }))!.find((f) => f.id === "kern-bedingungen")!;
      const text = folie.bloecke
        .map((b) => ("text" in b ? b.text : "") + ("punkte" in b ? b.punkte.join(" ") : ""))
        .join("\n");
      expect(text, s.weg).toContain("Paragraf 12 Absatz 1a");
      expect(text, s.weg).toContain("zwei aufeinanderfolgenden Kalenderquartalen");
      expect(text, s.weg).toContain("Das Quartal, in dem du anfängst, zählt nicht mit");
      expect(text, s.weg).toContain("zwei Wochen für deine Sicht");
    }
  });
});

describe("bewerberVideocall: die offenen Punkte auf der Bedingungsfolie", () => {
  it("es sind höchstens zwei", () => {
    for (const s of STRECKEN) {
      const punkte = offenePunkte(lies(bogen({ weg: s.weg, gewerbe: "nein", erlaubnis34c: "nein" })));
      expect(punkte.length).toBeLessThanOrEqual(2);
    }
  });

  it("eine offene Erlaubnis erscheint, eine vorhandene nicht", () => {
    const offen = offenePunkte(lies(bogen({ erlaubnis34c: "nein", gewerbe: "ja", leadPraeferenz: "leads" })));
    expect(offen.map((p) => p.titel)).toContain("Der Umfang der Erlaubnis nach Paragraf 34c");
    const zu = offenePunkte(lies(bogen({ erlaubnis34c: "ja", gewerbe: "ja", leadPraeferenz: "leads" })));
    expect(zu.map((p) => p.titel).join(" ")).not.toContain("34c");
  });

  it("auf Strecke 2 steht dabei, dass 34d und 34f die 34c nicht ersetzen", () => {
    const offen = offenePunkte(lies(bogen({ weg: "weg2", erlaubnis34c: "nein" })));
    expect(offen.map((p) => p.text).join(" ")).toContain("34d oder 34f deckt diese Tätigkeit nicht ab");
  });

  it("auf Strecke 4 steht die Begleitung der ersten Gespräche an erster Stelle", () => {
    const offen = offenePunkte(lies(bogen({ weg: "weg4" })));
    expect(offen[0].titel).toContain("Begleitung");
  });

  it("auf Strecke 3 und 5 steht die Zeit an erster Stelle, mit den eigenen Angaben", () => {
    for (const weg of ["weg3", "weg5"] as WegId[]) {
      const offen = offenePunkte(lies(bogen({ weg, zeitProWoche: "unter_10" })));
      expect(offen[0].titel).toContain("Zeit");
      expect(offen[0].text.toLowerCase()).toContain("weniger als 10 stunden");
    }
  });

  it("mitgebrachte Kontakte kommen nur dazu, wenn noch Platz ist und er eigen akquiriert", () => {
    const mitPlatz = offenePunkte(lies(bogen({ weg: "weg1", gewerbe: "ja", erlaubnis34c: "ja", leadPraeferenz: "eigen" })));
    expect(mitPlatz.map((p) => p.titel)).toContain("Die Kontakte, die du mitbringst");
    const ohnePlatz = offenePunkte(lies(bogen({ weg: "weg4", gewerbe: "nein", erlaubnis34c: "nein", leadPraeferenz: "eigen" })));
    expect(ohnePlatz).toHaveLength(2);
    expect(ohnePlatz.map((p) => p.titel)).not.toContain("Die Kontakte, die du mitbringst");
  });

  /*
   * E8, seit dem 09.09.2026. Die Zusatzfrage „Wie arbeitest du heute?" wirkt
   * an drei Stellen, und dies ist die dritte: Wer angestellt ist, braucht eine
   * Nebentätigkeitsgenehmigung, und sein Vertrag kann ein Wettbewerbsverbot
   * enthalten. Vorher war beides nirgends angesprochen.
   */
  it("nennt Nebentätigkeit und Wettbewerbsverbot, wenn er angestellt ist", () => {
    const frei = { weg: "weg1" as WegId, gewerbe: "ja", erlaubnis34c: "ja", leadPraeferenz: "leads" };
    const offen = offenePunkte(lies(bogen({ ...frei, arbeitsform: "angestellt" })));
    expect(offen.map((p) => p.titel)).toContain("Nebentätigkeit und Wettbewerbsverbot");
    const punkt = offen.find((p) => p.titel === "Nebentätigkeit und Wettbewerbsverbot")!;
    expect(punkt.text).toContain("Wettbewerbsverbot");
    // Kein Ausschluss, sondern eine Klärung.
    expect(punkt.text).toContain("sehr oft unproblematisch");
    // Und er zeigt auf die Ansicht, auf der die Angabe steht.
    expect(punkt.quelle).toBe(`Ansicht ${lies(bogen(frei)).nrFrage("arbeitsform")}`);
  });

  it("nennt ihn nicht, wenn er selbstständig ist oder nichts gesagt hat", () => {
    const frei = { weg: "weg1" as WegId, gewerbe: "ja", erlaubnis34c: "ja", leadPraeferenz: "leads" };
    for (const wert of ["selbststaendig", "beides", "keins", ""]) {
      const offen = offenePunkte(lies(bogen({ ...frei, arbeitsform: wert })));
      expect(offen.map((p) => p.titel), wert || "ohne Angabe")
        .not.toContain("Nebentätigkeit und Wettbewerbsverbot");
    }
  });

  it("lässt ihm den Vortritt nicht, wenn schon zwei Punkte offen sind", () => {
    const voll = offenePunkte(lies(bogen({
      weg: "weg4", gewerbe: "nein", erlaubnis34c: "nein",
      leadPraeferenz: "eigen", arbeitsform: "angestellt",
    })));
    expect(voll).toHaveLength(2);
    expect(voll.map((p) => p.titel)).not.toContain("Nebentätigkeit und Wettbewerbsverbot");
  });
});

describe("bewerberVideocall: was die HR-Managerin vorher sieht", () => {
  it("die Übersicht hat genau fünf Merkmale, in fester Reihenfolge", () => {
    expect(merkmale(bogen()).map((m) => m.id)).toEqual([
      "rahmen", "akquise", "zeitplan", "lernbedarf", "voraussetzungen",
    ]);
  });

  it("eine falsch beantwortete Verständnisfrage macht den Rahmen offen", () => {
    expect(merkmale(bogen()).find((m) => m.id === "rahmen")?.selbstauskunft).toBe("erfuellt");
    expect(
      merkmale(bogen({ verstaendnisFixum: "ja" })).find((m) => m.id === "rahmen")?.selbstauskunft,
    ).toBe("offen");
  });

  it("eine offene Erlaubnis macht die Startvoraussetzungen offen", () => {
    expect(
      merkmale(bogen({ gewerbe: "ja", erlaubnis34c: "ja" })).find((m) => m.id === "voraussetzungen")?.selbstauskunft,
    ).toBe("erfuellt");
    expect(
      merkmale(bogen()).find((m) => m.id === "voraussetzungen")?.selbstauskunft,
    ).toBe("offen");
  });

  it("die entscheidenden Antworten sind höchstens sieben Zeilen und lassen leere aus", () => {
    expect(entscheidendeAntworten(bogen()).length).toBeLessThanOrEqual(7);
    expect(entscheidendeAntworten({ weg: "weg1" })).toEqual([]);
  });

  it("die Vorbereitung nennt höchstens drei offene Punkte, die markierten Themen zuerst", () => {
    const punkte = vorbereitungsPunkte(bogen());
    expect(punkte.length).toBeLessThanOrEqual(3);
    expect(punkte[0]).toBe("Verdienst und Rechenwege");
    expect(punkte).toContain("Umfang der Erlaubnis nach Paragraf 34c");
  });

  it("die Begründung der Dauer nennt Kern, Module und den Puffer", () => {
    expect(dauerBegruendung(bogen())).toContain("36 Minuten");
    expect(dauerBegruendung(bogen())).toContain("Modul 6 und Modul 1");
    expect(dauerBegruendung(bogen({ weg: "weg5" }))).toContain("4 Minuten Puffer");
    expect(dauerBegruendung({})).toContain("Ohne ausgefülltes Kennenlernen");
  });
});

describe("bewerberVideocall: was die HR-Managerin währenddessen sieht", () => {
  it("jede Strecke hat Hinweise, Erfassung und eine Liste dessen, was nicht erfasst wird", () => {
    for (const s of STRECKEN) {
      const m = getModeration(s.weg);
      expect(m).not.toBeNull();
      expect(m!.hinweise.length).toBeGreaterThan(0);
      expect(m!.erfassen.length).toBeGreaterThan(0);
      expect(m!.nichtErfassen.length).toBeGreaterThan(0);
    }
  });

  it("keine Strecke erfasst Stimme, Energie oder Umfeld als Ersteindruck", () => {
    const text = JSON.stringify(MODULE) + JSON.stringify(KERNBAUSTEINE);
    expect(text).not.toMatch(/Ersteindruck/);
    for (const s of STRECKEN) {
      const m = getModeration(s.weg)!;
      expect(m.erfassen.join(" ")).not.toMatch(/Stimme|Energie|Kamerahintergrund/);
    }
  });

  it("zu jeder Folie steht ein Gesprächsimpuls bereit", () => {
    for (const s of STRECKEN) {
      for (const eintrag of folienFolge(s.weg, s.beiBedarf)) {
        expect(impulsFuer(s.weg, eintrag.id).length).toBeGreaterThan(0);
      }
    }
  });

});

describe("bewerberVideocall: der Gesprächsstand", () => {
  it("unbekannte Modul-Ids werden verworfen, doppelte zusammengefasst", () => {
    expect(zusatzModule({ module: ["m3", "m3", "quatsch" as ModulId] })).toEqual(["m3"]);
    expect(zusatzModule(undefined)).toEqual([]);
    expect(zusatzModule({})).toEqual([]);
  });
});


/**
 * Der Fehler bei Chris Test (Punkt F1): Geprueft wurde nur die juengste Zeile
 * aus `bewerber_formular`, gleich welchen Status sie hat. Ging nach dem
 * Ausfuellen noch einmal eine Einladung hinaus, war die juengste Zeile leer
 * und der Videocall behauptete, es liege kein Kennenlernen vor.
 */
describe("bewerberVideocall: welche Formularzeile zaehlt", () => {
  const eingereicht = { status: "eingereicht", antworten: { weg: "weg1" }, created_at: "2026-09-01" };
  const einladung = { status: "offen", antworten: {}, created_at: "2026-09-05" };

  it("nimmt die juengste eingereichte Zeile, nicht die juengste ueberhaupt", () => {
    expect(eingereichteKennenlernZeile([einladung, eingereicht])).toBe(eingereicht);
  });

  it("nimmt bei mehreren eingereichten die erste der absteigenden Liste", () => {
    const neuer = { status: "eingereicht", antworten: { weg: "weg3" }, created_at: "2026-09-04" };
    expect(eingereichteKennenlernZeile([einladung, neuer, eingereicht])).toBe(neuer);
  });

  it("zaehlt eine leere Einladung nicht, gleich wie neu sie ist", () => {
    expect(eingereichteKennenlernZeile([einladung])).toBeNull();
  });

  it("zaehlt eine eingereichte Zeile ohne Weg nicht, das ist der alte Vorabbogen", () => {
    expect(eingereichteKennenlernZeile([{ status: "eingereicht", antworten: { zeitProWoche: "vollzeit" } }])).toBeNull();
  });

  it("vertraegt eine leere Liste und fehlende Daten", () => {
    expect(eingereichteKennenlernZeile([])).toBeNull();
    expect(eingereichteKennenlernZeile(null)).toBeNull();
    expect(eingereichteKennenlernZeile(undefined)).toBeNull();
  });
});

/**
 * Was der Abschlussknopf setzt (Punkte F3 und G1). Die Abbildung steht an
 * genau einer Stelle, damit Videocall und Closing nicht auseinanderlaufen.
 */
describe("bewerberVideocall: vom Videocall ins Closing", () => {
  it("bildet die drei Entscheidungen auf ja, bedenkzeit und nein ab", () => {
    expect(closingEntscheidungAus("moeglich")).toBe("ja");
    expect(closingEntscheidungAus("klaerung")).toBe("bedenkzeit");
    expect(closingEntscheidungAus("nicht_moeglich")).toBe("nein");
  });

  it("bleibt ohne Entscheidung leer, damit ein Zwischenspeichern nichts verschiebt", () => {
    expect(closingEntscheidungAus("")).toBe("");
    expect(closingEntscheidungAus(undefined)).toBe("");
    expect(abschlussWirkung("", "").status).toBe("");
    expect(abschlussWirkung("", "starten").art).toBe("speichern");
  });

  it("verlangt die Adressen bei Start und bei Unterlagen, sonst nicht", () => {
    expect(brauchtAdressen("starten")).toBe(true);
    expect(brauchtAdressen("unterlagen")).toBe(true);
    expect(brauchtAdressen("passt_nicht")).toBe(false);
    expect(brauchtAdressen("")).toBe(false);
    expect(brauchtAdressen(undefined)).toBe(false);
  });
});

/**
 * Hinter jeder Wahl steht eine passende Aktion.
 *
 * Zwoelf Kombinationen aus Einschaetzung und Wunsch, dazu die beiden Faelle
 * ohne Einschaetzung. Vorher hing die Wirkung allein an der Einschaetzung,
 * damit landete ein Bewerber im Closing, der ausdruecklich abgewinkt hatte.
 */
describe("bewerberVideocall: was der Abschluss aus beiden Wahlen macht", () => {
  const faelle: [
    Parameters<typeof abschlussWirkung>[0],
    Parameters<typeof abschlussWirkung>[1],
    string,
    string,
  ][] = [
    ["moeglich", "starten", "closing", "Closing"],
    ["moeglich", "unterlagen", "unterlagen", "FollowUp"],
    ["moeglich", "passt_nicht", "keinInteresse", "KeinInteresse"],
    ["moeglich", "", "closing", "Closing"],
    ["klaerung", "starten", "followup", "FollowUp"],
    ["klaerung", "unterlagen", "followup", "FollowUp"],
    ["klaerung", "passt_nicht", "keinInteresse", "KeinInteresse"],
    ["klaerung", "", "followup", "FollowUp"],
    ["nicht_moeglich", "starten", "absage", "Abgelehnt"],
    ["nicht_moeglich", "unterlagen", "absage", "Abgelehnt"],
    ["nicht_moeglich", "passt_nicht", "absage", "Abgelehnt"],
    ["nicht_moeglich", "", "absage", "Abgelehnt"],
    ["", "starten", "speichern", ""],
    ["", "passt_nicht", "speichern", ""],
  ];

  it.each(faelle)("%s plus %s fuehrt zu %s", (entscheidung, wunsch, art, status) => {
    const w = abschlussWirkung(entscheidung, wunsch);
    expect(w.art).toBe(art);
    expect(w.status).toBe(status);
  });

  /*
   * Die eigene Tuer fuer "Moechte die Unterlagen", seit dem 08.09.2026.
   * Vorher landete er im Closing, als waere er startbereit, und ob ihm jemand
   * den Startfahrplan schickte, hing an einem Knopf im naechsten Reiter.
   */
  it("schickt den Startfahrplan bei Unterlagen, aber nie bei einer Absage", () => {
    expect(sendetStartfahrplan("moeglich", "unterlagen")).toBe(true);
    expect(sendetStartfahrplan("klaerung", "unterlagen")).toBe(true);
    expect(sendetStartfahrplan("nicht_moeglich", "unterlagen")).toBe(false);
    expect(sendetStartfahrplan("moeglich", "starten")).toBe(false);
    expect(sendetStartfahrplan("moeglich", "passt_nicht")).toBe(false);
    expect(sendetStartfahrplan("", "unterlagen")).toBe(false);
  });

  it("nennt den Startfahrplan im Knopf, wenn er hinausgeht", () => {
    expect(abschlussWirkung("moeglich", "unterlagen").knopf).toContain("Startfahrplan");
    expect(abschlussWirkung("klaerung", "unterlagen").knopf).toContain("Startfahrplan");
    expect(abschlussWirkung("moeglich", "starten").knopf).not.toContain("Startfahrplan");
  });

  it("gibt jeder Kombination eine Knopfbeschriftung und einen Wirkungssatz", () => {
    for (const [entscheidung, wunsch] of faelle) {
      const w = abschlussWirkung(entscheidung, wunsch);
      expect(w.knopf.length).toBeGreaterThan(0);
      expect(w.wirkung.length).toBeGreaterThan(0);
    }
  });

  it("nennt im Knopf, dass ein Folgetermin gesetzt wird", () => {
    expect(abschlussWirkung("klaerung", "starten").knopf).toContain("Folgetermin");
  });

  it("schickt ein Nein des Bewerbers nie ins Closing", () => {
    for (const entscheidung of ["moeglich", "klaerung", "nicht_moeglich"] as const) {
      expect(abschlussWirkung(entscheidung, "passt_nicht").status).not.toBe("Closing");
    }
  });
});

/**
 * Die Folie darf nicht mehr versprechen, als der Knopf tut.
 *
 * Der Befund vom 08.09.2026: Die mittlere Tuer hiess "Ich moechte die
 * Unterlagen" und sagte dem Bewerber "Der Vertrag wird erstellt und kommt
 * digital zur Ansicht". Die gleichnamige Wahl im Abschluss schickt aber den
 * Startfahrplan, traegt ein Nachfassen ein und laesst das Closing offen. Den
 * Vertrag erstellt nur "Will starten". Diese Tests halten Folientext,
 * WUNSCH_LABELS und abschlussWirkung aneinander fest.
 */
describe("bewerberVideocall: die drei Tueren der Schlussfolie und ihre Wirkung", () => {
  const tueren = () => {
    const folie = videocallFolien(bogen()).find((f) => f.bausteinId === "weitergehen");
    const block = folie?.bloecke.find((b) => b.art === "tueren");
    if (!block || block.art !== "tueren") throw new Error("Die Schlussfolie hat keinen Tueren-Block");
    return block.tueren;
  };

  it("zeigt genau die drei Wahlmoeglichkeiten, die es im Abschluss gibt", () => {
    expect(Object.keys(WUNSCH_LABELS)).toEqual(["starten", "unterlagen", "passt_nicht"]);
    const t = tueren();
    expect(t).toHaveLength(3);
    expect(t[0].titel).toMatch(/starten/i);
    expect(t[1].titel).toMatch(/Unterlagen/i);
    expect(t[2].titel).toMatch(/passt/i);
  });

  it("verspricht den Vertrag nur dort, wo er auch erstellt wird", () => {
    const [starten, unterlagen] = tueren();
    // Nur "Will starten" fuehrt ins Closing, und nur von dort kommt der Vertrag.
    expect(abschlussWirkung("moeglich", "starten").art).toBe("closing");
    expect(starten.text).toMatch(/Vertrag/);
    expect(starten.text).toMatch(/zur Ansicht/);
    // "Moechte die Unterlagen" laesst das Closing offen, hier waere ein
    // Vertragsversprechen falsch. Der Text sagt das ausdruecklich.
    expect(abschlussWirkung("moeglich", "unterlagen").art).toBe("unterlagen");
    expect(unterlagen.text).toMatch(/Vertrag wird dafür nicht erstellt/);
  });

  it("nennt den Startfahrplan genau bei der Tuer, die ihn ausloest", () => {
    const [starten, unterlagen, passtNicht] = tueren();
    expect(sendetStartfahrplan("moeglich", "unterlagen")).toBe(true);
    expect(unterlagen.text).toMatch(/Startfahrplan/);
    expect(WUNSCH_LABELS.unterlagen.hinweis).toMatch(/Startfahrplan/);

    expect(sendetStartfahrplan("moeglich", "starten")).toBe(false);
    expect(starten.text).not.toMatch(/Startfahrplan/);
    expect(sendetStartfahrplan("moeglich", "passt_nicht")).toBe(false);
    expect(passtNicht.text).not.toMatch(/Startfahrplan/);
  });

  it("kuendigt das Nachfassen dort an, wo der Abschluss ein Follow-up anlegt", () => {
    const [starten, unterlagen, passtNicht] = tueren();
    // Die Unterlagen-Tuer setzt ein Follow-up, die Absage raeumt es weg.
    expect(abschlussWirkung("moeglich", "unterlagen").status).toBe("FollowUp");
    expect(unterlagen.text).toMatch(/melden|Termin/);
    expect(WUNSCH_LABELS.unterlagen.hinweis).toMatch(/Nachfassen/);

    expect(abschlussWirkung("moeglich", "passt_nicht").status).toBe("KeinInteresse");
    expect(passtNicht.text).toMatch(/fasst niemand nach/);
    // Und bei "will starten" verspricht die Folie kein Nachfassen.
    expect(starten.text).not.toMatch(/nachfassen|Nachfassen/);
  });

  it("sagt auf jeder Tuer, dass heute nichts unterschrieben oder erzwungen wird", () => {
    const [starten, unterlagen] = tueren();
    expect(starten.text).toMatch(/Unterschrieben wird heute nichts/);
    expect(unterlagen.text).toMatch(/entschieden ist noch nichts/i);
  });
});

describe("bewerberVideocall: der Vorschlag fuer den Folgetermin", () => {
  it("liegt eine Woche spaeter, zur selben Tageszeit", () => {
    expect(folgeterminVorschlag(new Date(2026, 8, 7, 14, 5))).toEqual({
      datum: "2026-09-14",
      uhrzeit: "14:05",
    });
  });

  it("rechnet ueber den Monatswechsel hinweg richtig", () => {
    expect(folgeterminVorschlag(new Date(2026, 8, 28, 9, 0)).datum).toBe("2026-10-05");
  });
});

/**
 * Die Meldung, wenn kein Bogen vorliegt. Sie stand bisher pauschal an drei
 * Stellen und half niemandem: Der Geschaeftsfuehrer sah sie bei einem
 * Bewerber, der den Bogen ausgefuellt hatte.
 */
describe("bewerberVideocall: warum kein Kennenlernen vorliegt", () => {
  const jetzt = new Date(2026, 8, 7, 10, 0);

  it("erkennt, dass noch gar keine Einladung verschickt ist", () => {
    const b = kennenlernBefund([], "Jonas", true, jetzt);
    expect(b.art).toBe("ohneEinladung");
    expect(b.titel).toContain("Jonas");
    expect(b.titel).toContain("keine Einladung");
    expect(b.zuTun).toContain("Einladung verschicken");
  });

  it("erkennt die verschickte, aber noch offene Einladung samt Datum", () => {
    const b = kennenlernBefund(
      [{ status: "offen", antworten: {}, created_at: "2026-09-01T08:00:00.000Z", expires_at: "2026-09-15T08:00:00.000Z" }],
      "Jonas", true, jetzt,
    );
    expect(b.art).toBe("offen");
    expect(b.text).toContain("01.09.2026");
    expect(b.text).toContain("noch offen");
  });

  it("erkennt den alten Vorabbogen ohne gewaehlten Weg", () => {
    const b = kennenlernBefund(
      [
        { status: "offen", antworten: {}, created_at: "2026-09-05T08:00:00.000Z", expires_at: "2026-09-19T08:00:00.000Z" },
        { status: "eingereicht", antworten: { zeitProWoche: "vollzeit" }, created_at: "2026-09-01T08:00:00.000Z" },
      ],
      "Jonas", true, jetzt,
    );
    expect(b.art).toBe("alterBogen");
    expect(b.titel).toContain("Vorabbogen");
    expect(b.text).toContain("kein");
  });

  it("erkennt die abgelaufene Einladung, nach Status wie nach Ablaufdatum", () => {
    const nachStatus = kennenlernBefund(
      [{ status: "abgelaufen", antworten: {}, created_at: "2026-08-01T08:00:00.000Z", expires_at: "2026-08-15T08:00:00.000Z" }],
      "Jonas", true, jetzt,
    );
    expect(nachStatus.art).toBe("abgelaufen");
    expect(nachStatus.text).toContain("15.08.2026");

    const nachDatum = kennenlernBefund(
      [{ status: "offen", antworten: {}, created_at: "2026-08-01T08:00:00.000Z", expires_at: "2026-08-15T08:00:00.000Z" }],
      "Jonas", true, jetzt,
    );
    expect(nachDatum.art).toBe("abgelaufen");
  });

  it("schweigt, wenn der Bogen vorliegt, und meldet das Laden", () => {
    const vorhanden = kennenlernBefund(
      [{ status: "eingereicht", antworten: { weg: "weg1" }, created_at: "2026-09-01" }],
      "Jonas", true, jetzt,
    );
    expect(vorhanden.art).toBe("vorhanden");
    expect(vorhanden.titel).toBe("");
    expect(kennenlernBefund([], "Jonas", false, jetzt).art).toBe("laedt");
  });

  it("kommt ohne Vornamen aus", () => {
    expect(kennenlernBefund([], "", true, jetzt).titel).toContain("diesen Bewerber");
  });
});

/**
 * Die vollstaendige Antwortuebersicht (Punkt E1). Erreichbarkeit und die
 * beiden Verstaendnisfragen erschienen bisher nirgends in der Akte.
 */
describe("bewerberVideocall: die vollstaendige Antwortuebersicht", () => {
  const alle = () => vollstaendigerUeberblick(bogen()).flatMap((g) => g.zeilen.map((z) => z.label));

  it("bringt drei Gruppen", () => {
    expect(vollstaendigerUeberblick(bogen()).map((g) => g.titel)).toEqual([
      "So möchte er starten", "Das bringt er mit", "Das klären wir im Gespräch",
    ]);
  });

  it("enthaelt jede beantwortete Frage genau einmal", () => {
    const labels = alle();
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeGreaterThanOrEqual(14);
  });

  it("laesst unbeantwortete Fragen und leere Gruppen weg", () => {
    const nurWeg = vollstaendigerUeberblick({ weg: "weg1" });
    expect(nurWeg).toHaveLength(1);
    expect(nurWeg[0].titel).toBe("Das bringt er mit");
  });

  it("vertraegt fehlende Antworten", () => {
    expect(vollstaendigerUeberblick(null)).toEqual([]);
    expect(vollstaendigerUeberblick(undefined)).toEqual([]);
  });

  /*
   * Die Frage nach der Erreichbarkeit ist am 08.09.2026 aus dem Bogen
   * entfallen. In den Akten der Bewerber, die vorher geantwortet haben, steht
   * sie weiterhin, und dort soll sie auch zu sehen bleiben.
   */
  it("zeigt die Erreichbarkeit aelterer Boegen weiterhin", () => {
    const zeilen = vollstaendigerUeberblick(bogen()).flatMap((g) => g.zeilen);
    expect(zeilen.find((z) => z.label === "Erreichbar")?.wert).toBe("Abends ab 18 Uhr");
  });

  it("laesst die Erreichbarkeit weg, wo keine angegeben wurde", () => {
    const ohne = bogen();
    delete ohne.erreichbarkeit;
    expect(vollstaendigerUeberblick(ohne).flatMap((g) => g.zeilen).map((z) => z.label))
      .not.toContain("Erreichbar");
  });

  /*
   * Bedingte Fragen wurden bis zum 08.09.2026 gegen einen leeren Bogen
   * geprueft und fielen deshalb immer heraus. Der Freitext hinter „Etwas
   * anderes" und die Begruendung zur Erlaubnis standen damit nirgends.
   */
  it("zeigt auch die bedingten Antworten: Freitext und Begruendung", () => {
    const zeilen = vollstaendigerUeberblick(bogen({
      weg: "weg5",
      wegAntwort2: "sonstiges",
      wegAntwort2Frei: "Ich bin angestellt und habe keine Eile.",
      erlaubnis34c: "will_nicht",
      erlaubnis34cBegruendung: "Erst nach dem ersten Kunden.",
    })).flatMap((g) => g.zeilen);
    expect(zeilen.find((z) => z.label === "Zeitliche Reserve, und zwar")?.wert)
      .toBe("Ich bin angestellt und habe keine Eile.");
    expect(zeilen.find((z) => z.label === "Warum keine Erlaubnis")?.wert)
      .toBe("Erst nach dem ersten Kunden.");
  });
});

/** Das zweite Produkt auf Weg 2 (Punkt O1). */
describe("bewerberVideocall: das Modul zum zweiten Produkt", () => {
  it("laeuft auf Weg 2 und dort hinter der Bruecke", () => {
    const folien = videocallFolien(bogen({ weg: "weg2" }));
    const ids = folien.map((f) => f.id);
    expect(ids).toContain("modul-m7");
    expect(ids.indexOf("modul-m7")).toBeGreaterThan(ids.indexOf("modul-m2"));
  });

  it("laeuft auf keinem anderen Weg von selbst", () => {
    for (const weg of ["weg1", "weg3", "weg4", "weg5"] as WegId[]) {
      expect(videocallFolien(bogen({ weg })).map((f) => f.id)).not.toContain("modul-m7");
    }
  });

  it("endet mit dem freigegebenen Schlusssatz und nennt keine Konditionen", () => {
    const folie = videocallFolien(bogen({ weg: "weg2" })).find((f) => f.id === "modul-m7");
    const texte = (folie?.bloecke ?? []).map((b) => ("text" in b ? b.text : "")).join(" ");
    expect(texte).toContain(ZWEITES_PRODUKT_SCHLUSSSATZ);
    expect(texte).not.toMatch(/Prozent|Euro/);
  });
});

/** Jede Folie bringt ihr Glanzwort mit, und es steht wirklich im Titel. */
describe("bewerberVideocall: der Glanz in der Ueberschrift", () => {
  it("jede Folie hat genau ein Wort, und es kommt in ihrem Titel vor", () => {
    for (const weg of ["weg1", "weg2", "weg3", "weg4", "weg5"] as WegId[]) {
      for (const f of videocallFolien(bogen({ weg }))) {
        expect(f.glanz, f.id).not.toBe("");
        expect(f.titel, f.id).toContain(f.glanz);
      }
    }
  });
});

/**
 * Die Ansichtsnummern, die die Folien nennen.
 *
 * Sie standen bis zum 08.09.2026 als feste Zahlen in den Folientexten, waren
 * von Hand gepflegt und an der Hälfte der Stellen falsch. Falsch werden
 * konnten sie aus zwei Gründen: Der Bogen bekam eine Ansicht dazu oder verlor
 * eine, und Weg 2 hat eine Vertiefung mehr als die anderen vier, dort liegt
 * also alles hinter der Weiche um eins höher.
 *
 * Dieser Block prüft die Nummern deshalb gegen den Bogen selbst, für alle fünf
 * Wege. Läuft beides auseinander, fällt es hier auf und nicht im Gespräch.
 */
describe("bewerberVideocall: die Ansichtsnummern in den Folien", () => {
  /** Die Nummer einer Ansicht auf genau diesem Weg, direkt aus dem Bogen. */
  const nr = (weg: WegId) => {
    const ansichten = ansichtenFuer({ weg });
    return (id: string) => ansichtNummer(ansichten, id);
  };

  /** Alles, was auf den Folien dieses Bewerbers steht, als ein Text. */
  const allesGeschriebene = (antworten: KennenlernenAntworten) =>
    JSON.stringify(videocallFolien(antworten)) +
    JSON.stringify(merkmale(antworten)) +
    JSON.stringify(offenePunkte(lies(antworten)));

  it("nennt keine Nummer, die es auf diesem Weg gar nicht gibt", () => {
    for (const weg of WEGE) {
      const gueltig = new Set(ansichtenFuer({ weg: weg.id }).map((a) => a.nummer));
      const genannt = [...allesGeschriebene(bogen({ weg: weg.id })).matchAll(/Ansicht (\d+)/g)]
        .map((m) => Number(m[1]));
      // Sicherung gegen einen Test, der aus Versehen nichts prüft.
      expect(genannt.length, weg.id).toBeGreaterThan(3);
      for (const zahl of genannt) {
        expect(gueltig.has(zahl), `Weg ${weg.id}: Ansicht ${zahl} gibt es nicht`).toBe(true);
      }
    }
  });

  it("zeigt auf den Folien auf genau die Ansicht, auf der die Angabe steht", () => {
    for (const weg of WEGE) {
      const n = nr(weg.id);
      const antworten = bogen({ weg: weg.id });
      const folien = videocallFolien(antworten);
      const folie = (id: string) => folien.find((f) => f.id === id)!;

      const begruessung = folie("kern-begruessung");
      expect(JSON.stringify(begruessung.bloecke), weg.id)
        .toContain(`Ansicht ${n("themen")}`);
      expect(begruessung.quelle, weg.id)
        .toBe(`Ansicht ${n("themen")} und Ansicht ${n("weiche")}`);

      expect(folie("kern-arbeitsteilung").unterzeile, weg.id)
        .toContain(`Ansicht ${n("abwicklung")}`);
      expect(folie("kern-service").quelle, weg.id)
        .toContain(`Ansicht ${n("tageins")}`);
      expect(folie("kern-bedingungen").quelle, weg.id)
        .toBe(`Ansicht ${n("erwartung")}, ${n("zeit")} bis ${n("erlaubnis")}`);
      expect(folie("kern-ausgangslage").quelle, weg.id)
        .toBe(`Ansicht ${n("weiche")}, ${weg.ansichten.map((a) => n(a.id)).join(", ")}`);
    }
  });

  it("belegt auch die Merkmale mit der Ansicht, auf der die Frage steht", () => {
    for (const weg of WEGE) {
      const n = nr(weg.id);
      // Ein Bogen, in dem genau diese drei Angaben fehlen. Dann steht im Beleg
      // der Verweis auf die offene Ansicht statt der Antwort.
      const offen = bogen({
        weg: weg.id,
        leadPraeferenz: "",
        zeitProWoche: "",
        startzeitpunkt: "",
        erlaubnis34c: "",
        gewerbe: "",
      });
      const beleg = (id: string) => merkmale(offen).find((m) => m.id === id)!.beleg;
      expect(beleg("akquise"), weg.id).toBe(`Auf Ansicht ${n("interessenten")} noch nichts entschieden.`);
      expect(beleg("zeitplan"), weg.id)
        .toBe(`Ansicht ${n("zeit")} und ${n("start")} sind noch offen.`);
      expect(beleg("voraussetzungen"), weg.id).toBe(`Ansicht ${n("erlaubnis")} ist noch offen.`);
    }
  });

  /**
   * Der eigentliche Wächter gegen eine feste Zahl: Auf Weg 2 muss alles hinter
   * der Weiche um eins höher liegen. Eine hart geschriebene Zahl kann das nicht
   * und fällt hier auf.
   */
  it("zählt auf Weg 2 um eins höher als auf Weg 1, weil dort eine Vertiefung mehr steht", () => {
    const eins = nr("weg1");
    const zwei = nr("weg2");
    for (const id of ["abwicklung", "tageins", "zeit", "interessenten", "erlaubnis", "themen"]) {
      expect(zwei(id), id).toBe(eins(id) + 1);
    }
    const quelleVon = (weg: WegId) =>
      videocallFolien(bogen({ weg })).find((f) => f.id === "kern-bedingungen")!.quelle;
    expect(quelleVon("weg2")).not.toBe(quelleVon("weg1"));
    expect(quelleVon("weg2")).toBe(`Ansicht ${zwei("erwartung")}, ${zwei("zeit")} bis ${zwei("erlaubnis")}`);
  });
});

/**
 * Der Anknüpfungssatz, mit dem der Moderator das Gespräch eröffnet.
 *
 * Er ist der erste Satz des Termins und greift auf, was der Bewerber im Bogen
 * über sich gesagt hat. Fünf Sätze, einer je Gruppe, und keiner darf fehlen:
 * Eine leere Fassung wäre ein Termin, der mit einer Lücke anfängt.
 */
describe("bewerberVideocall: der Anknüpfungssatz auf der ersten Folie", () => {
  it("gibt jeder Gruppe ihren eigenen Satz, und keiner ist leer", () => {
    const saetze = WEGE.map((w) => ANKNUEPFUNG[w.id]);
    expect(saetze).toHaveLength(5);
    for (const [i, satz] of saetze.entries()) {
      expect(satz.trim(), WEGE[i].id).not.toBe("");
      expect(satz.trim().length, WEGE[i].id).toBeGreaterThan(40);
    }
    // Fünf verschiedene Sätze. Zwei gleiche wären eine vergessene Fassung.
    expect(new Set(saetze).size).toBe(5);
  });

  it("steht ganz oben auf der Begrüßungsfolie, noch vor der Tagesordnung", () => {
    for (const weg of WEGE) {
      const folien = videocallFolien(bogen({ weg: weg.id }));
      expect(folien[0].id, weg.id).toBe("kern-begruessung");
      const erster = folien[0].bloecke[0];
      expect(erster.art === "kasten" && erster.text, weg.id).toBe(ANKNUEPFUNG[weg.id]);
      // Ohne Überschrift. Der Satz wird gesagt, nicht als Kapitel vorgelesen.
      expect(erster.art === "kasten" && erster.titel, weg.id).toBeUndefined();
    }
  });
});

/**
 * Bogen und Folie sagen dieselbe Zahl neuer Schritte.
 *
 * Sie stand bis zum 09.09.2026 an zwei Stellen: im Bogen im Kasten unter der
 * Abwicklungsansicht und noch einmal, mit eigener Zählung, auf der
 * Arbeitsteilungsfolie. Wer eine änderte und die andere vergaß, erzählte dem
 * Bewerber im Gespräch etwas anderes als im Bogen, und gemerkt hätte es
 * zuerst der Bewerber.
 *
 * Diese Tests halten beide gegeneinander. Sie werden rot, sobald jemand den
 * Satz auf der Folie wieder abschreibt statt ihn aus dem Bogen zu holen, und
 * ebenso, sobald der Satz im Bogen sich ändert und die Folie stehen bliebe.
 */
describe("bewerberVideocall: die Arbeitsteilung holt ihren Satz aus dem Bogen", () => {
  /** Der Kasten unter der Abwicklungsansicht des Bogens, für diese Gruppe. */
  const imBogen = (weg: WegId) => {
    const antworten: KennenlernenAntworten = { weg };
    const ansicht = ansichtenFuer(antworten).find((a) => a.id === "abwicklung");
    expect(ansicht, `Ansicht "abwicklung" fehlt auf ${weg}`).toBeDefined();
    const kasten = anschlussUnten(ansicht!, antworten);
    expect(kasten, `kein Gruppenkasten auf ${weg}`).not.toBeNull();
    return kasten!;
  };

  /** Der letzte Kasten der Arbeitsteilungsfolie, also „Und was das für dich heißt". */
  const aufDerFolie = (weg: WegId) => {
    const folie = videocallFolien(bogen({ weg })).find((f) => f.bausteinId === "arbeitsteilung");
    const kasten = folie?.bloecke.filter((b) => b.art === "kasten").at(-1);
    expect(kasten?.art, weg).toBe("kasten");
    return kasten as { art: "kasten"; titel?: string; text: string };
  };

  it("trägt auf jeder Gruppe den Wortlaut des Bogens, Überschrift und Satz", () => {
    for (const weg of WEGE) {
      const bogenKasten = imBogen(weg.id);
      expect(bogenKasten.text.trim().length, weg.id).toBeGreaterThan(40);
      const folienKasten = aufDerFolie(weg.id);
      expect(folienKasten.titel, weg.id).toBe(bogenKasten.titel);
      expect(
        folienKasten.text.startsWith(bogenKasten.text),
        `Weg ${weg.id}: Die Folie schreibt den Satz ab, statt ihn aus dem Bogen zu holen.\n` +
          `Bogen: ${bogenKasten.text}\nFolie: ${folienKasten.text}`,
      ).toBe(true);
    }
  });

  it("zählt die neuen Schritte nur im Satz aus dem Bogen und kein zweites Mal", () => {
    for (const weg of WEGE) {
      const bogenKasten = imBogen(weg.id);
      const zusatz = aufDerFolie(weg.id).text.slice(bogenKasten.text.length);
      expect(zusatz, weg.id).not.toMatch(/fünf Schritt/);
      expect(zusatz, weg.id).not.toMatch(/der fünf/);
    }
  });

  it("ergänzt den Satz um das, was nur im Gespräch gesagt wird", () => {
    for (const weg of WEGE) {
      const bogenKasten = imBogen(weg.id);
      const folienKasten = aufDerFolie(weg.id);
      expect(folienKasten.text.length, weg.id).toBeGreaterThan(bogenKasten.text.length);
    }
  });
});

/**
 * Die sechs Punkte vom 22.09.2026: Antworten des Bogens, die vorher nur in der
 * Moderatorenansicht standen, stehen jetzt auf einer Folie.
 *
 * Vor diesen Tests gab es keinen einzigen, der geprüft hätte, ob eine Antwort
 * des Bogens auf einer Folie ankommt. Jeder Punkt hat deshalb zwei: einen mit
 * gesetzter Antwort und einen für den leeren Fall.
 */
describe("bewerberVideocall: die Antworten des Bogens auf den Folien", () => {
  /** Ein vollständiger Bogen für den jeweiligen Weg, mit dessen eigenen Antworten. */
  const WEG_ANTWORTEN: Record<WegId, Partial<KennenlernenAntworten>> = {
    weg1: { wegAntwort1: "4_bis_10", wegAntwort2: ["objektsuche"], wegAntwort3: "eigennutzer" },
    weg2: { wegAntwort1: ["baufi"], wegAntwort2: "empfehlung", wegAntwort3: "gelegentlich" },
    weg3: { wegAntwort1: "Softwarelizenzen", wegAntwort2: "wochen", wegAntwort3: "selbst" },
    weg4: { wegAntwort1: ["verwaltung"], wegAntwort2: "gelegentlich", wegAntwort3: "zutrauen" },
    weg5: { wegAntwort1: "menschen", wegAntwort2: "3_bis_6", wegAntwort3: "lesen" },
  };

  const wegBogen = (weg: WegId, patch: Partial<KennenlernenAntworten> = {}) =>
    bogen({ weg, ...WEG_ANTWORTEN[weg], ...patch });

  const folie = (antworten: KennenlernenAntworten, id: string, zusatz: ModulId[] = []) =>
    videocallFolien(antworten, zusatz).find((f) => f.id === id);

  /** Der ganze Text einer Folie, um darin nach einer Antwort zu suchen. */
  const textVon = (antworten: KennenlernenAntworten, id: string, zusatz: ModulId[] = []) =>
    JSON.stringify(folie(antworten, id, zusatz)?.bloecke ?? []);

  // ── Punkt 1: die dritte Wegantwort auf der Modulfolie ──

  const DRITTE_ANTWORT: { weg: WegId; folienId: string; erwartet: string }[] = [
    { weg: "weg1", folienId: "modul-m1", erwartet: "Eigennutzer, die einziehen wollen" },
    { weg: "weg2", folienId: "modul-m2", erwartet: "Gelegentlich" },
    { weg: "weg3", folienId: "modul-m3", erwartet: "Ich gewinne sie selbst" },
    { weg: "weg4", folienId: "modul-m4", erwartet: "Ich traue es mir noch nicht zu" },
    { weg: "weg5", folienId: "modul-m5", erwartet: "Erst lesen, dann machen" },
  ];

  it("Punkt 1: die dritte Wegantwort steht auf der Modulfolie des eigenen Wegs", () => {
    for (const fall of DRITTE_ANTWORT) {
      const antworten = wegBogen(fall.weg);
      const block = folie(antworten, fall.folienId)?.bloecke[0];
      expect(block?.art, fall.weg).toBe("kasten");
      const kasten = block as { art: "kasten"; titel?: string; text: string };
      expect(kasten.titel, fall.weg).toBe("Was du dazu angegeben hast");
      expect(kasten.text, fall.weg).toContain(fall.erwartet);
      // Im Stil der Folie 2: mit der Ansicht, auf der die Antwort steht.
      expect(kasten.text, fall.weg).toContain(
        `Auf Ansicht ${lies(antworten).nrFrage("wegAntwort3")} steht`,
      );
    }
  });

  it("Punkt 1: ohne dritte Wegantwort bleibt die Modulfolie wie bisher", () => {
    for (const fall of DRITTE_ANTWORT) {
      const ohne = wegBogen(fall.weg, { wegAntwort3: undefined });
      const bloecke = folie(ohne, fall.folienId)?.bloecke ?? [];
      expect(bloecke.length, fall.weg).toBeGreaterThan(0);
      expect(JSON.stringify(bloecke), fall.weg).not.toContain("Was du dazu angegeben hast");
      // Genau ein Block weniger als mit Antwort, sonst ist noch etwas anderes passiert.
      expect(bloecke.length, fall.weg).toBe(
        (folie(wegBogen(fall.weg), fall.folienId)?.bloecke.length ?? 0) - 1,
      );
    }
  });

  it("Punkt 1: ein zugeschaltetes fremdes Modul bekommt seine Antwort nicht", () => {
    // Modul 1 fragt nach dem Käufertyp. Auf Weg 4 heißt `wegAntwort3` aber
    // „Was bisher bremste", und das gehört dort nicht hin.
    const text = textVon(wegBogen("weg4"), "modul-m1", ["m1"]);
    expect(text).not.toContain("Ich traue es mir noch nicht zu");
    expect(text).not.toContain("Was du dazu angegeben hast");
  });

  // ── Punkt 2: der Startzeitpunkt auf der Schlussfolie ──

  it("Punkt 2: der Startzeitpunkt steht auf der Schlussfolie", () => {
    const antworten = bogen({ startzeitpunkt: "zwei_drei_monate" });
    const bloecke = folie(antworten, "kern-weitergehen")?.bloecke ?? [];
    const letzter = bloecke.at(-1) as { art: "kasten"; titel?: string; text: string };
    expect(letzter.art).toBe("kasten");
    expect(letzter.text).toContain("In zwei bis drei Monaten");
    expect(letzter.text).toContain(
      `auf Ansicht ${lies(antworten).nrFrage("startzeitpunkt")} angegeben`,
    );
  });

  it("Punkt 2: ohne Startzeitpunkt endet die Schlussfolie wie bisher mit den drei Türen", () => {
    const bloecke = folie(bogen({ startzeitpunkt: undefined }), "kern-weitergehen")?.bloecke ?? [];
    expect(bloecke.at(-1)?.art).toBe("tueren");
  });

  // ── Punkt 3: die Begründung zur fehlenden Erlaubnis ──

  it("Punkt 3: seine Begründung steht neben der offenen Erlaubnis", () => {
    const antworten = bogen({
      erlaubnis34c: "will_nicht",
      erlaubnis34cBegruendung: "Ich will erst sehen, ob die Zusammenarbeit trägt",
    });
    const text = textVon(antworten, "kern-bedingungen");
    expect(text).toContain("Ich will erst sehen, ob die Zusammenarbeit trägt");
    // Und in einem Satz, nicht als nackter Wert.
    expect(text).toContain("Dort steht auch, warum");
  });

  it("Punkt 3: ohne Begründung nennt die Folie nur die offene Erlaubnis", () => {
    const text = textVon(bogen({ erlaubnis34c: "nein" }), "kern-bedingungen");
    expect(text).toContain("Erlaubnis nach Paragraf 34c");
    expect(text).not.toContain("Dort steht auch, warum");
  });

  // ── Punkt 4: die zweite Wegantwort auf Weg 5 ──

  it("Punkt 4: die finanzielle Reserve steht im Kasten der Bedingungsfolie", () => {
    const antworten = wegBogen("weg5", { wegAntwort2: "3_bis_6" });
    const kasten = folie(antworten, "kern-bedingungen")?.bloecke.at(-1) as {
      art: "kasten"; titel?: string; text: string;
    };
    expect(kasten.titel).toContain("auf diesem Weg dazugehört");
    expect(kasten.text).toContain("3 bis 6 Monate");
    expect(kasten.text).toContain(
      `Auf Ansicht ${lies(antworten).nrFrage("wegAntwort2")} steht`,
    );
    // Der bisherige Satz bleibt stehen.
    expect(kasten.text).toContain("kein Makel an dir");
  });

  it("Punkt 4: bei „Bei mir liegt es anders“ steht sein eigener Satz da", () => {
    const antworten = wegBogen("weg5", {
      wegAntwort2: "sonstiges",
      wegAntwort2Frei: "Ich habe eine Abfindung, die zwei Jahre trägt",
    });
    const kasten = folie(antworten, "kern-bedingungen")?.bloecke.at(-1) as {
      art: "kasten"; text: string;
    };
    expect(kasten.text).toContain("Ich habe eine Abfindung, die zwei Jahre trägt");
    expect(kasten.text).not.toContain("Bei mir liegt es anders");
  });

  it("Punkt 4: ohne Angabe bleibt der Kasten stehen, nur ohne seine Zeile", () => {
    const kasten = folie(
      wegBogen("weg5", { wegAntwort2: undefined }),
      "kern-bedingungen",
    )?.bloecke.at(-1) as { art: "kasten"; text: string };
    expect(kasten.text.startsWith("Wenn du das Geld in drei Monaten brauchst")).toBe(true);
  });

  // ── Punkt 5: womit er starten will, auf Weg 2 und Weg 4 ──

  it("Punkt 5: die Startpräferenz steht auf jeder der fünf Fassungen der Folie 2", () => {
    for (const weg of WEGE) {
      const antworten = wegBogen(weg.id, { leadPraeferenz: "beides" });
      const text = textVon(antworten, "kern-ausgangslage");
      expect(text, weg.id).toContain(
        `Womit du starten willst, steht auf Ansicht ${lies(antworten).nrFrage("leadPraeferenz")}`,
      );
    }
  });

  it("Punkt 5: die linke Spalte bleibt dabei bei drei Punkten", () => {
    for (const weg of WEGE) {
      const links = folie(wegBogen(weg.id, { leadPraeferenz: "beides" }), "kern-ausgangslage")
        ?.bloecke.find((b) => b.art === "liste");
      expect(links?.art === "liste" && links.punkte.length, weg.id).toBe(3);
    }
  });

  it("Punkt 5: ohne Startpräferenz steht der Satz nirgends", () => {
    for (const weg of WEGE) {
      const text = textVon(wegBogen(weg.id, { leadPraeferenz: undefined }), "kern-ausgangslage");
      expect(text, weg.id).not.toContain("Womit du starten willst");
    }
  });

  // ── Punkt 6: der Abschnitt „Womit wir anfangen" ohne markierte Themen ──

  /** Der Ersatztext, so wie er auf der Begrüßungsfolie landet. */
  const ersatzAufFolie = (antworten: KennenlernenAntworten) => {
    const block = folie(antworten, "kern-begruessung")?.bloecke.find((b) => b.art === "themen");
    return block?.art === "themen" ? block.ersatz ?? "" : "";
  };

  it("Punkt 6: markierte Themen gehen immer vor, dann bleibt der Ersatz leer", () => {
    expect(ersatzAufFolie(bogen({ themen: ["verdienst"] }))).toBe("");
  });

  it("Punkt 6: ohne Thema zeigt der Abschnitt auf seine eigene Frage", () => {
    const text = ersatzAufFolie(bogen({ themen: [], eigeneFrage: "Wie lange dauert die Einarbeitung?" }));
    expect(text).toContain("eigene Frage mitgegeben");
    expect(text).toContain("sie steht gleich darunter");
  });

  it("Punkt 6: ohne Thema und ohne Frage nennt er den Punkt, der ohnehin dransteht", () => {
    const offeneErlaubnis = bogen({ themen: [], eigeneFrage: "", gewerbe: "ja", erlaubnis34c: "nein" });
    expect(ersatzAufFolie(offeneErlaubnis)).toContain("Erlaubnis nach Paragraf 34c");
    expect(ersatzAufFolie(offeneErlaubnis)).toContain(
      `Ansicht ${lies(offeneErlaubnis).nrFrage("erlaubnis34c")}`,
    );

    const offenesGewerbe = bogen({ themen: [], eigeneFrage: "", gewerbe: "nein", erlaubnis34c: "ja" });
    expect(ersatzAufFolie(offenesGewerbe)).toContain("Zeitpunkt der Gewerbeanmeldung");
  });

  it("Punkt 6: bleibt sonst freundlich und allgemein", () => {
    const text = ersatzAufFolie(
      bogen({ themen: [], eigeneFrage: "", gewerbe: "ja", erlaubnis34c: "ja" }),
    );
    expect(text).toContain("Deinen Bogen haben wir gelesen");
  });

  it("Punkt 6: in keinem Fall steht dort eine Feststellung über eine Unterlassung", () => {
    const faelle: Partial<KennenlernenAntworten>[] = [
      { themen: [], eigeneFrage: "Eine Frage" },
      { themen: [], eigeneFrage: "", erlaubnis34c: "nein" },
      { themen: [], eigeneFrage: "", gewerbe: "nein", erlaubnis34c: "ja" },
      { themen: [], eigeneFrage: "", gewerbe: "ja", erlaubnis34c: "ja" },
      { themen: undefined, eigeneFrage: undefined },
    ];
    for (const patch of faelle) {
      const text = ersatzAufFolie(bogen(patch));
      expect(text.trim().length, JSON.stringify(patch)).toBeGreaterThan(0);
      expect(text, JSON.stringify(patch)).not.toMatch(/kein Thema|nicht markiert|hast du nicht/);
    }
  });
});
