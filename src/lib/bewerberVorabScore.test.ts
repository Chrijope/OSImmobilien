import { describe, it, expect } from "vitest";
import {
  berechneVorabScore,
  einstufungFuer,
  merkmaleFuer,
  optionenZuMerkmal,
  MERKMALE,
  WEG_MERKMALE,
  VORAB_SCHWELLE_A,
  VORAB_SCHWELLE_B,
  verfeinereErlaubnis,
  bogenHerkunft,
  NUR_KENNENLERNBOGEN,
  NUR_VORABBOGEN,
} from "./bewerberVorabScore";
import {
  FORMULAR_FRAGEN,
  alsAssessmentWert,
  antwortText,
  type FormularAntworten,
} from "./bewerberFormular";
import {
  ALTFRAGEN,
  KENNENLERNEN_KEYS,
  WEGE,
  antwortenZumSenden,
  type WegId,
} from "./bewerberKennenlernen";

/**
 * Die Antworten, die auf allen fünf Wegen gleich sind, in ihrer stärksten
 * Fassung. `antwortenZumSenden` leitet daraus `hintergrund` und `gewerbe34c`
 * ab, genau wie der echte Bogen.
 */
const GEMEINSAM_STARK: FormularAntworten = {
  zeitProWoche: "vollzeit",
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "ueber_10000",
  startzeitpunkt: "sofort",
  gewerbe: "ja",
  erlaubnis34c: "ja",
  verstaendnisFixum: "nein",
  verstaendnisProvision: "nein",
  passung: ["selbststaendig", "variabel", "akquise", "zeitplan"],
  themen: ["verdienst", "einstieg", "leads"],
  eigeneFrage: "Wie viele Objekte habt ihr im Schnitt gleichzeitig verfügbar, und wie schnell sind sie weg?",
};

const GEMEINSAM_SCHWACH: FormularAntworten = {
  zeitProWoche: "unter_10",
  perspektive: "unklar",
  leadPraeferenz: "unklar",
  einkommensziel: "unklar",
  startzeitpunkt: "umschauen",
  gewerbe: "nein",
  erlaubnis34c: "nein",
  verstaendnisFixum: "ja",
  verstaendnisProvision: "ja",
};

/** Die stärksten Antworten auf den drei Fragen jedes Wegs. */
const WEG_STARK: Record<WegId, FormularAntworten> = {
  weg1: { wegAntwort1: "ueber_10", wegAntwort2: ["akquise"], wegAntwort3: "anleger" },
  weg2: { wegAntwort1: ["baufi"], wegAntwort2: "bestand", wegAntwort3: "regelmaessig" },
  weg3: {
    wegAntwort1: "Softwarelizenzen an mittelständische Betriebe, seit sechs Jahren",
    wegAntwort2: "monate",
    wegAntwort3: "selbst",
  },
  weg4: { wegAntwort1: ["eigenbestand"], wegAntwort2: "regelmaessig", wegAntwort3: "jetzt" },
  weg5: { wegAntwort1: "aufbau", wegAntwort2: "6_bis_12", wegAntwort3: "ausprobieren" },
};

/** Die schwächsten Antworten auf den drei Fragen jedes Wegs. */
const WEG_SCHWACH: Record<WegId, FormularAntworten> = {
  weg1: { wegAntwort1: "keine", wegAntwort3: "eigennutzer" },
  weg2: { wegAntwort1: ["versicherung"], wegAntwort2: "firma", wegAntwort3: "nie" },
  weg3: { wegAntwort1: "Autos", wegAntwort2: "tag", wegAntwort3: "firma" },
  weg4: { wegAntwort1: ["bau"], wegAntwort2: "nichts", wegAntwort3: "zutrauen" },
  weg5: { wegAntwort1: "menschen", wegAntwort2: "unter_3", wegAntwort3: "lesen" },
};

function bogen(weg: WegId, teile: FormularAntworten[]): FormularAntworten {
  return antwortenZumSenden(Object.assign({ weg }, ...teile));
}

/** Ein alter Vorabbogen, wie er vor dem Kennenlernen eingereicht wurde. */
const ALTBOGEN: FormularAntworten = {
  region: "83022 Rosenheim",
  beschaeftigung: "selbststaendig",
  taetigkeit: "Bauträgervertrieb",
  hintergrund: ["immo", "netzwerk"],
  // Drei Fragen, die es nur im alten Bogen gab. Sie werden nicht mehr
  // bewertet, dürfen aber auch nichts kaputt machen.
  erfahrungsdauer: "ueber_10",
  immoSchwerpunkt: "kapitalanlage",
  zeitProWoche: "vollzeit",
  perspektive: "sofort_haupt",
  leadPraeferenz: "beides",
  einkommensziel: "ueber_10000",
  gewerbe34c: "beides",
  startzeitpunkt: "sofort",
  erreichbarkeit: ["abends"],
};

describe("berechneVorabScore, Grundlagen", () => {
  it("gibt ohne Bogen keinen Score", () => {
    expect(berechneVorabScore(null)).toBeNull();
    expect(berechneVorabScore(undefined)).toBeNull();
    expect(berechneVorabScore({})).toBeNull();
  });

  it("gibt keinen Score, wenn nur unbewertete Fragen beantwortet sind", () => {
    expect(berechneVorabScore({ region: "Rosenheim", erreichbarkeit: ["abends"] })).toBeNull();
  });

  it("Grenzen der Einstufung", () => {
    expect(einstufungFuer(VORAB_SCHWELLE_A)).toBe("A");
    expect(einstufungFuer(VORAB_SCHWELLE_A - 1)).toBe("B");
    expect(einstufungFuer(VORAB_SCHWELLE_B)).toBe("B");
    expect(einstufungFuer(VORAB_SCHWELLE_B - 1)).toBe("C");
    expect(einstufungFuer(0)).toBe("C");
    expect(einstufungFuer(100)).toBe("A");
  });
});

describe("Jeder Weg, vollständig ausgefüllt", () => {
  for (const weg of WEGE) {
    it(`${weg.id}: stark erreicht die Stufe A, schwach die Stufe C`, () => {
      const stark = berechneVorabScore(bogen(weg.id, [GEMEINSAM_STARK, WEG_STARK[weg.id]]))!;
      expect(stark).not.toBeNull();
      expect(stark.einstufung).toBe("A");
      expect(stark.unvollstaendig).toBe(false);
      expect(stark.luecken).toEqual([]);

      const schwach = berechneVorabScore(bogen(weg.id, [GEMEINSAM_SCHWACH, WEG_SCHWACH[weg.id]]))!;
      expect(schwach).not.toBeNull();
      expect(schwach.punkte).toBeLessThan(VORAB_SCHWELLE_B);
      expect(schwach.einstufung).toBe("C");
      // Die freiwilligen Fragen fehlen, das macht den Bogen nicht unvollständig.
      expect(schwach.unvollstaendig).toBe(false);
    });

    it(`${weg.id}: jeder Posten trägt die Antwort lesbar, nicht den Datenbankwert`, () => {
      const score = berechneVorabScore(bogen(weg.id, [GEMEINSAM_STARK, WEG_STARK[weg.id]]))!;
      for (const p of score.posten) {
        expect(p.antwort.trim(), `${p.key} ohne lesbare Antwort`).not.toBe("");
        expect(p.punkte).toBeLessThanOrEqual(p.maxPunkte);
      }
      // Die Aufschlüsselung ist vollständig: Summe der Posten ist die Rohzahl.
      const summe = score.posten.reduce((s, p) => s + p.punkte, 0);
      expect(summe).toBe(score.rohPunkte);
      expect(score.posten.reduce((s, p) => s + p.maxPunkte, 0)).toBe(score.maxPunkte);
    });
  }
});

/*
 * E10, seit dem 09.09.2026: ein eigener Hintergrundwert für Weg 4.
 *
 * Vorher leiteten Weg 1 und Weg 4 denselben Wert „immo" ab. Wer nie eine
 * Wohnung verkauft hat, bekam damit dieselben acht Punkte wie jemand mit zwölf
 * Abschlüssen im Jahr, und der Unterschied lebte nur im Feld `weg` weiter.
 *
 * Dieser Test hält die Punktzahlen aller fünf Gruppen fest. Wer eine davon
 * ändert, ändert die Reihenfolge, in der eingeladen wird, und soll das hier
 * schwarz auf weiß sehen.
 */
describe("Das Merkmal Hintergrund, alle fünf Gruppen", () => {
  const hintergrundPosten = (weg: WegId) => {
    const score = berechneVorabScore(bogen(weg, [GEMEINSAM_STARK, WEG_STARK[weg]]))!;
    return score.posten.find((p) => p.key === "hintergrund")!;
  };

  it("gibt jeder Gruppe genau die vorgesehene Punktzahl", () => {
    const erwartet: Record<WegId, { wert: string; punkte: number }> = {
      weg1: { wert: "immo", punkte: 8 },
      weg2: { wert: "findi", punkte: 7 },
      weg3: { wert: "vertrieb", punkte: 6 },
      weg4: { wert: "immo_umfeld", punkte: 7 },
      weg5: { wert: "quereinsteiger", punkte: 4 },
    };
    for (const weg of WEGE) {
      expect(weg.hintergrund, weg.id).toBe(erwartet[weg.id].wert);
      const posten = hintergrundPosten(weg.id);
      expect(posten.punkte, weg.id).toBe(erwartet[weg.id].punkte);
      expect(posten.maxPunkte, weg.id).toBe(8);
    }
  });

  it("gibt Gruppe 1 und Gruppe 4 nicht mehr denselben Wert", () => {
    const g1 = WEGE.find((w) => w.id === "weg1")!;
    const g4 = WEGE.find((w) => w.id === "weg4")!;
    expect(g4.hintergrund).not.toBe(g1.hintergrund);
    // Und der Unterschied ist genau ein Punkt, nicht mehr.
    expect(hintergrundPosten("weg1").punkte - hintergrundPosten("weg4").punkte).toBe(1);
  });

  it("zeigt den neuen Wert lesbar und nicht als Datenbankkürzel", () => {
    const posten = hintergrundPosten("weg4");
    // „eigenes Netzwerk" steht daneben, weil dieser Bogen im eigenen Netzwerk
    // starten will. Es zählt null Punkte und ist nur eine zweite Angabe.
    expect(posten.antwort).toBe("Immobilien, aber nicht aus dem Verkauf, eigenes Netzwerk");
  });

  /*
   * Die Richtung der Änderung, ausdrücklich festgehalten: Der neue Wert kann
   * einen Bogen nur schlechter stellen, nie besser. Niemand rutscht unbemerkt
   * von B nach A. Umgekehrt kann ein Bewerber aus Gruppe 4, der genau auf der
   * Schwelle lag, eine Stufe verlieren.
   */
  it("kann den Score von Gruppe 4 nur senken, nie heben", () => {
    const faelle: FormularAntworten[] = [
      { ...GEMEINSAM_STARK, ...WEG_STARK.weg4 },
      { ...GEMEINSAM_SCHWACH, ...WEG_SCHWACH.weg4 },
      {
        ...GEMEINSAM_STARK, ...WEG_STARK.weg4,
        zeitProWoche: "10_bis_20", perspektive: "spaeter_haupt", startzeitpunkt: "vier_wochen",
      },
    ];
    for (const fall of faelle) {
      const neu = berechneVorabScore(bogen("weg4", [fall]))!;
      // „hintergrund: immo" von Hand gesetzt ergibt den alten Höchstwert 8,
      // weil die Punkte einer Mehrfachantwort das Beste nehmen.
      const alt = berechneVorabScore(bogen("weg4", [fall, { hintergrund: ["immo"] }]))!;
      expect(neu.punkte).toBeLessThanOrEqual(alt.punkte);
      expect(alt.rohPunkte - neu.rohPunkte).toBe(1);
    }
  });

  /*
   * Für das Erstgesprächsskript bleibt es beim Pfad „Immobilienerfahren".
   * Ohne diese Rückübersetzung bekäme Gruppe 4 gar keinen Pfad mehr
   * vorgeschlagen, und die HR-Managerin stünde vor leeren Feldern.
   */
  it("schlägt für Gruppe 4 weiterhin den Immobilienpfad vor", () => {
    const antworten = bogen("weg4", [GEMEINSAM_STARK, WEG_STARK.weg4]);
    const frage = FORMULAR_FRAGEN.find((f) => f.key === "hintergrund")!;
    expect(alsAssessmentWert(frage, antworten)).toEqual(["immo"]);
    // Und die Beschriftung ist ein Satz, kein Kürzel.
    expect(antwortText(frage, antworten)).toContain("Kennt Immobilien, aber nicht aus dem Verkauf");
  });
});

describe("Der Quereinsteiger fällt nicht strukturell durch", () => {
  it("ein starker Quereinsteiger erreicht die oberste Stufe", () => {
    const score = berechneVorabScore(bogen("weg5", [GEMEINSAM_STARK, WEG_STARK.weg5]))!;
    expect(score.einstufung).toBe("A");
    // Er verliert nur die vier Punkte am Merkmal Hintergrund, sonst nichts.
    expect(score.punkte).toBeGreaterThanOrEqual(95);
  });

  it("er verliert gegenüber dem Immobilienverkäufer nur wenige Punkte", () => {
    const quer = berechneVorabScore(bogen("weg5", [GEMEINSAM_STARK, WEG_STARK.weg5]))!;
    const immo = berechneVorabScore(bogen("weg1", [GEMEINSAM_STARK, WEG_STARK.weg1]))!;
    expect(immo.punkte).toBeGreaterThanOrEqual(quer.punkte);
    expect(immo.punkte - quer.punkte).toBeLessThanOrEqual(5);
  });

  it("ein mittlerer Quereinsteiger schlägt einen schwachen Immobilienverkäufer deutlich", () => {
    const quer = berechneVorabScore(bogen("weg5", [
      GEMEINSAM_STARK,
      { zeitProWoche: "10_bis_20", perspektive: "spaeter_haupt", gewerbe: "nein", erlaubnis34c: "nein" },
      { wegAntwort1: "aufbau", wegAntwort2: "3_bis_6", wegAntwort3: "ausprobieren" },
    ]))!;
    const immo = berechneVorabScore(bogen("weg1", [GEMEINSAM_SCHWACH, WEG_SCHWACH.weg1]))!;
    expect(quer.punkte).toBeGreaterThan(immo.punkte + 30);
  });
});

describe("Erfahrung mit Leads und Investitionsbereitschaft", () => {
  it("die beiden freiwilligen Leadfelder heben den Score, wenn sie gut ausgefüllt sind", () => {
    const ohne = berechneVorabScore(bogen("weg1", [GEMEINSAM_STARK, WEG_STARK.weg1]))!;
    const mit = berechneVorabScore(bogen("weg1", [
      GEMEINSAM_STARK,
      WEG_STARK.weg1,
      {
        leadErfahrung:
          "Ich habe drei Jahre lang zugekaufte Leads bearbeitet, immer innerhalb von zehn Minuten " +
          "angerufen und danach siebenmal nachgefasst, bevor ich sie abgelegt habe.",
        leadQuote: "2 von 10",
      },
    ]))!;
    expect(mit.punkte).toBeGreaterThanOrEqual(ohne.punkte);
    expect(mit.posten.map((p) => p.key)).toContain("leadErfahrung");
    expect(mit.posten.map((p) => p.key)).toContain("leadQuote");
  });

  it("wer die freiwilligen Leadfelder leer lässt, wird nicht bestraft", () => {
    // Weg 3 sieht die Felder gar nicht. Beide Bögen sind sonst gleich stark
    // und dürfen deshalb dieselbe Stufe erreichen.
    const weg3 = berechneVorabScore(bogen("weg3", [GEMEINSAM_STARK, WEG_STARK.weg3]))!;
    const weg1 = berechneVorabScore(bogen("weg1", [GEMEINSAM_STARK, WEG_STARK.weg1]))!;
    expect(weg3.einstufung).toBe(weg1.einstufung);
    expect(weg3.posten.map((p) => p.key)).not.toContain("leadQuote");
    expect(weg3.luecken).toEqual([]);
  });

  it("eine unglaubwürdig hohe Quote bringt weniger als eine plausible", () => {
    const punkteFuerQuote = (quote: string) => {
      const score = berechneVorabScore(bogen("weg1", [GEMEINSAM_STARK, WEG_STARK.weg1, { leadQuote: quote }]))!;
      return score.posten.find((p) => p.key === "leadQuote")!.punkte;
    };
    expect(punkteFuerQuote("3 von 10")).toBeGreaterThan(punkteFuerQuote("9 von 10"));
    expect(punkteFuerQuote("2 von 10")).toBeGreaterThan(punkteFuerQuote("0 von 10"));
    // Die übliche, ehrliche Quote bringt die volle Zahl. Wer das freiwillige
    // Feld ausfüllt, soll dadurch nicht unter den fallen, der es überspringt.
    const ohne = berechneVorabScore(bogen("weg1", [GEMEINSAM_STARK, WEG_STARK.weg1]))!;
    const mit = berechneVorabScore(bogen("weg1", [
      GEMEINSAM_STARK, WEG_STARK.weg1, { leadQuote: "2 von 10" },
    ]))!;
    expect(mit.punkte).toBe(ohne.punkte);
    // Nicht lesbar heißt nicht null: Er hat immerhin geantwortet.
    expect(punkteFuerQuote("kann ich so nicht sagen")).toBeGreaterThan(0);
  });

  it("die Reihenfolge bei der Herkunft der ersten Kunden ist beides, eigen, leads, unklar", () => {
    const punkteFuer = (wert: string) => {
      const score = berechneVorabScore(bogen("weg5", [
        GEMEINSAM_STARK, WEG_STARK.weg5, { leadPraeferenz: wert },
      ]))!;
      return score.posten.find((p) => p.key === "leadPraeferenz")!.punkte;
    };
    expect(punkteFuer("beides")).toBeGreaterThan(punkteFuer("eigen"));
    expect(punkteFuer("eigen")).toBeGreaterThan(punkteFuer("leads"));
    expect(punkteFuer("leads")).toBeGreaterThan(punkteFuer("unklar"));
  });
});

describe("Die weiteren neuen Merkmale", () => {
  it("wer beide Verständnisfragen falsch beantwortet, verliert Punkte, fliegt aber nicht raus", () => {
    const richtig = berechneVorabScore(bogen("weg5", [GEMEINSAM_STARK, WEG_STARK.weg5]))!;
    const falsch = berechneVorabScore(bogen("weg5", [
      GEMEINSAM_STARK, WEG_STARK.weg5,
      { verstaendnisFixum: "ja", verstaendnisProvision: "ja" },
    ]))!;
    expect(falsch.punkte).toBeLessThan(richtig.punkte);
    expect(falsch.punkte).toBeGreaterThan(0);
  });

  it("Zeit, Herkunft der Kunden und Perspektive wiegen mehr als die leichten Merkmale", () => {
    const schwer = MERKMALE.filter((m) => ["zeitProWoche", "leadPraeferenz", "perspektive"].includes(m.key));
    const leicht = MERKMALE.filter((m) => ["passung", "themen", "eigeneFrage"].includes(m.key));
    const kleinstesSchwer = Math.min(...schwer.map((m) => m.maxPunkte));
    const groesstesLeicht = Math.max(...leicht.map((m) => m.maxPunkte));
    expect(kleinstesSchwer).toBeGreaterThan(groesstesLeicht);
  });

  it("eine eigene Frage und markierte Themen heben den Score", () => {
    const ohne = berechneVorabScore(bogen("weg3", [
      GEMEINSAM_STARK, WEG_STARK.weg3, { themen: [], eigeneFrage: "" },
    ]))!;
    const mit = berechneVorabScore(bogen("weg3", [GEMEINSAM_STARK, WEG_STARK.weg3]))!;
    expect(mit.punkte).toBeGreaterThanOrEqual(ohne.punkte);
    expect(ohne.unvollstaendig).toBe(false);
  });
});

describe("Niemand wird für eine Frage bestraft, die er nie gesehen hat", () => {
  it("der alte Vorabbogen wird ohne die neuen Merkmale gerechnet", () => {
    const score = berechneVorabScore(ALTBOGEN)!;
    const keys = score.posten.map((p) => p.key);
    expect(keys).not.toContain("verstaendnisFixum");
    expect(keys).not.toContain("passung");
    expect(keys).not.toContain("wegAntwort1");
    // Die drei entfernten Fragen zählen nicht mehr mit.
    expect(keys).not.toContain("erfahrungsdauer");
    expect(keys).not.toContain("immoSchwerpunkt");
    expect(keys).not.toContain("findiSparten");
    expect(score.einstufung).toBe("A");
    expect(score.unvollstaendig).toBe(false);
  });

  it("ein alter Bogen ohne die neuen Felder stürzt nicht ab und bleibt vergleichbar", () => {
    const alt = berechneVorabScore({
      zeitProWoche: "10_bis_20",
      hintergrund: ["vertrieb"],
      erfahrungsdauer: "3_bis_10",
      perspektive: "spaeter_haupt",
      startzeitpunkt: "vier_wochen",
      gewerbe34c: "keines",
      einkommensziel: "2000_5000",
      leadPraeferenz: "beides",
    })!;
    expect(alt.punkte).toBeGreaterThan(0);
    expect(alt.punkte).toBeLessThanOrEqual(100);
    expect(alt.einstufung).toBe("B");
  });

  it("ein halb ausgefüllter Bogen wird als unvollständig gekennzeichnet und nennt die Lücken", () => {
    const score = berechneVorabScore({ zeitProWoche: "vollzeit", hintergrund: ["findi"] })!;
    expect(score.rohPunkte).toBe(25);
    expect(score.maxPunkte).toBe(26);
    expect(score.unvollstaendig).toBe(true);
    expect(score.beantwortet).toBe(2);
    // Sichtbar sind im alten Bogen sieben Pflichtmerkmale.
    expect(score.sichtbar).toBe(7);
    expect(score.luecken).toContain("Perspektive");
    expect(score.begruendung).toContain("unvollständig, 2 von 7 Fragen");
  });

  it("die Merkmale eines Wegs gelten nur auf diesem Weg", () => {
    const weg1 = merkmaleFuer({ weg: "weg1" }).map((m) => m.key);
    const weg5 = merkmaleFuer({ weg: "weg5" }).map((m) => m.key);
    expect(weg1).toContain("wegAntwort1");
    expect(weg5).toContain("wegAntwort1");
    // Beide tragen denselben Schlüssel, meinen aber verschiedene Fragen.
    const labelWeg1 = merkmaleFuer({ weg: "weg1" }).find((m) => m.key === "wegAntwort1")!.label;
    const labelWeg5 = merkmaleFuer({ weg: "weg5" }).find((m) => m.key === "wegAntwort1")!.label;
    expect(labelWeg1).not.toBe(labelWeg5);
  });
});

describe("Die Tabelle passt zu den beiden Bögen", () => {
  it("jede Antwortoption der bewerteten Fragen hat eine Punktzahl", () => {
    // Schützt davor, dass eine neue Option im Bogen stillschweigend null bringt.
    for (const merkmal of MERKMALE) {
      if (!merkmal.punkte) continue;
      for (const wert of optionenZuMerkmal(merkmal.key)) {
        expect(merkmal.punkte[wert], `${merkmal.key}.${wert} ohne Punkte`).toBeTypeOf("number");
      }
    }
    for (const [wegId, merkmale] of Object.entries(WEG_MERKMALE)) {
      for (const merkmal of merkmale) {
        if (!merkmal.punkte) continue;
        for (const wert of optionenZuMerkmal(merkmal.key, wegId as WegId)) {
          expect(merkmal.punkte[wert], `${wegId}.${merkmal.key}.${wert} ohne Punkte`).toBeTypeOf("number");
        }
      }
    }
  });

  it("jedes bewertete Merkmal kommt in mindestens einem der beiden Bögen vor", () => {
    const alteKeys = new Set(FORMULAR_FRAGEN.map((f) => f.key));
    // Zwei Werte leitet der Kennenlernbogen beim Absenden ab statt sie zu fragen.
    const abgeleitet = new Set(["hintergrund", "gewerbe34c"]);
    const neueKeys = new Set<string>(["wegAntwort1", "wegAntwort2", "wegAntwort3"]);
    const beispiel = antwortenZumSenden({ weg: "weg1", ...GEMEINSAM_STARK, ...WEG_STARK.weg1 });
    for (const key of Object.keys(beispiel)) neueKeys.add(key);
    neueKeys.add("leadErfahrung");
    neueKeys.add("leadQuote");

    for (const merkmal of MERKMALE) {
      expect(
        alteKeys.has(merkmal.key) || neueKeys.has(merkmal.key) || abgeleitet.has(merkmal.key),
        `${merkmal.key} steht in keinem Bogen`,
      ).toBe(true);
    }
  });

  it("jeder Weg gibt gleich viele Punkte her, damit der Weg die Skala nicht verschiebt", () => {
    const summen = Object.values(WEG_MERKMALE).map((ms) => ms.reduce((s, m) => s + m.maxPunkte, 0));
    expect(new Set(summen).size).toBe(1);
  });
});

/*
 * Der laufende 34c-Antrag.
 *
 * Der Sammelwert kennt „beantragt" nicht und wirft ihn mit „noch nicht"
 * zusammen. Wer den Antrag laufen hat, ist aber Wochen weiter als jemand, der
 * noch gar nichts getan hat, und genau diese Wochen entscheiden über den
 * Starttermin.
 */
describe("Der laufende Antrag nach Paragraf 34c zaehlt mehr als gar keiner", () => {
  it("wertet einen beantragten 34c ueber ein blosses Fehlen", () => {
    const mitGewerbe = verfeinereErlaubnis({ gewerbe: "ja", erlaubnis34c: "beantragt", gewerbe34c: "nur_gewerbe" });
    expect(mitGewerbe.gewerbe34c).toBe("gewerbe_und_beantragt");

    const ohneGewerbe = verfeinereErlaubnis({ gewerbe: "nein", erlaubnis34c: "beantragt", gewerbe34c: "keines" });
    expect(ohneGewerbe.gewerbe34c).toBe("nur_beantragt");
  });

  it("laesst jede andere Antwort und den alten Bogen unberuehrt", () => {
    for (const wert of ["ja", "nein", "will_nicht", "unklar"]) {
      const a = verfeinereErlaubnis({ gewerbe: "ja", erlaubnis34c: wert, gewerbe34c: "beides" });
      expect(a.gewerbe34c).toBe("beides");
    }
    // Alter Vorabbogen: nur der Sammelwert, keine Rohantwort.
    const alt = verfeinereErlaubnis({ gewerbe34c: "keines" });
    expect(alt.gewerbe34c).toBe("keines");
  });

  it("bringt dem Antragsteller mehr Punkte als dem Untaetigen, aber weniger als der fertigen Erlaubnis", () => {
    const basis = { weg: "weg5", zeitProWoche: "10_bis_20", gewerbe: "ja" };
    const fertig = berechneVorabScore({ ...basis, erlaubnis34c: "ja", gewerbe34c: "beides" });
    const laeuft = berechneVorabScore({ ...basis, erlaubnis34c: "beantragt", gewerbe34c: "nur_gewerbe" });
    const nichts = berechneVorabScore({ ...basis, erlaubnis34c: "nein", gewerbe34c: "nur_gewerbe" });
    expect(fertig!.rohPunkte).toBeGreaterThan(laeuft!.rohPunkte);
    expect(laeuft!.rohPunkte).toBeGreaterThan(nichts!.rohPunkte);
  });
});

/*
 * Woher der Score stammt, seit dem 16.09.2026.
 *
 * Die Falle steht im Kopf von `bogenHerkunft`: Das Kennzeichen `bogen`
 * überlebt das Abschicken nicht, weil `submit-bewerber-formular` die ganze
 * Spalte `antworten` ersetzt. Erkannt wird deshalb an den Schlüsseln der
 * Antworten, und die Listen dürfen nicht auseinanderlaufen.
 */
describe("Herkunft des Bogens", () => {
  it("erkennt den Kennenlernbogen am gewählten Weg", () => {
    const antworten = antwortenZumSenden({ weg: "weg1", ...GEMEINSAM_STARK });
    expect(bogenHerkunft(antworten)).toBe("kennenlernen");
    expect(berechneVorabScore(antworten)!.herkunft).toBe("kennenlernen");
  });

  it("erkennt den Kennenlernbogen auch ohne Weg an den Verständnisfragen", () => {
    expect(bogenHerkunft({ zeitProWoche: "vollzeit", verstaendnisFixum: "nein" })).toBe("kennenlernen");
  });

  it("erkennt den früheren Vorabbogen an seinen eigenen Pflichtfragen", () => {
    const alt: FormularAntworten = {
      beschaeftigung: "angestellt",
      taetigkeit: "Baufinanzierungsberater",
      zeitProWoche: "vollzeit",
      perspektive: "sofort_haupt",
    };
    expect(bogenHerkunft(alt)).toBe("vorabbogen");
    expect(berechneVorabScore(alt)!.herkunft).toBe("vorabbogen");
  });

  it("sagt unbekannt, wenn nur gemeinsame Schlüssel dastehen, statt zu raten", () => {
    // Ein falsches Kennzeichen wäre schlechter als gar keines: Die
    // HR-Managerin entscheidet danach, wen sie zuerst einlädt.
    const gemeinsam: FormularAntworten = {
      zeitProWoche: "vollzeit",
      perspektive: "sofort_haupt",
      leadPraeferenz: "beides",
      gewerbe34c: "beides",
      startzeitpunkt: "sofort",
      hintergrund: ["vertrieb"],
    };
    expect(bogenHerkunft(gemeinsam)).toBe("unbekannt");
    expect(berechneVorabScore(gemeinsam)!.herkunft).toBe("unbekannt");
  });

  it("sagt unbekannt ohne Antworten und bei leeren Werten", () => {
    expect(bogenHerkunft(null)).toBe("unbekannt");
    expect(bogenHerkunft({})).toBe("unbekannt");
    expect(bogenHerkunft({ weg: "  ", themen: [] })).toBe("unbekannt");
  });

  it("nimmt die Erreichbarkeit ausdrücklich nicht als Merkmal", () => {
    // Bis zum 08.09.2026 hat auch der Kennenlernbogen danach gefragt, seither
    // steht sie in seinen ALTFRAGEN. Als Merkmal erklärte sie einen frühen
    // Kennenlernbogen zum Vorabbogen.
    expect(NUR_VORABBOGEN).not.toContain("erreichbarkeit");
    expect(NUR_KENNENLERNBOGEN).not.toContain("erreichbarkeit");
    expect(bogenHerkunft({ erreichbarkeit: ["abends"] })).toBe("unbekannt");
  });

  it("hält beide Listen wirklich exklusiv", () => {
    const altKeys = new Set(FORMULAR_FRAGEN.map((f) => f.key));
    const kennenlernKeys = new Set(KENNENLERNEN_KEYS);
    const altfragenKeys = new Set(ALTFRAGEN.map((f) => f.key));

    for (const key of NUR_KENNENLERNBOGEN) {
      expect(kennenlernKeys.has(key), `${key} fehlt in KENNENLERNEN_KEYS`).toBe(true);
      expect(altKeys.has(key), `${key} steht auch im alten Katalog`).toBe(false);
    }
    for (const key of NUR_VORABBOGEN) {
      expect(kennenlernKeys.has(key), `${key} steht auch im Kennenlernbogen`).toBe(false);
      expect(altfragenKeys.has(key), `${key} ist eine Altfrage des Kennenlernbogens`).toBe(false);
    }
    // Keine Überschneidung zwischen den beiden Listen selbst.
    for (const key of NUR_VORABBOGEN) expect(NUR_KENNENLERNBOGEN).not.toContain(key);
  });
});
