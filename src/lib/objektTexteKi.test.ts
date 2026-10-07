import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die automatisch erzeugten Objekttexte.
 *
 * Geprüft wird vor allem das, was einen Schaden anrichten würde: dass keine
 * Zahl ins Modell geht, die zu einem Ertragsversprechen einlädt, dass eine
 * erfundene Standortanalyse nicht als Beleg durchgeht, dass ein Versprechen im
 * Ergebnis auffällt, und dass die Übernahme nur die zwei Felder anfasst, um
 * die es geht.
 *
 * Die reine Logik liegt in `supabase/functions/_shared/objekt-texte.ts`, damit
 * die Edge Function in Deno sie mitbenutzen kann. Sie wird hier direkt von
 * dort importiert, ohne Umweg über den Browser-Teil.
 */

import {
  ANZAHL_MARKTARGUMENTE,
  ANZAHL_STANDORTARGUMENTE,
  automatischerWortlaut,
  istBelegteVergangenheit,
  letztenFehlerInMeta,
  letzterFehlerAusMeta,
  baueLeereObjektTexte,
  baueObjektTexte,
  genugQuellen,
  hatTexte,
  investagonFreitexte,
  istInvestagonKopie,
  ohneGedankenstriche,
  MAX_ARGUMENT,
  MAX_KURZBESCHREIBUNG,
  MAX_MASSNAHME,
  MAX_SANIERUNGEN,
  neutraleMerkmale,
  objektQuellen,
  objektTexteAnweisung,
  objektTexteAusMeta,
  objektTexteInMeta,
  OBJEKT_TEXTE_FUNKTION_VERSION,
  OBJEKT_TEXTE_META_SCHLUESSEL,
  OBJEKT_TEXTE_SCHEMA,
  OBJEKT_TEXTE_WERKZEUG,
  ohneErtragsaussagen,
  pruefeObjektTexte,
  quellenFingerabdruck,
  quellenZeilen,
  sanierungsjahreDerEinheiten,
  standortQuellen,
  texteInGepflegteFelder,
  vonHandGepflegt,
  type ObjektTexteQuellen,
} from "../../supabase/functions/_shared/objekt-texte";
import { marktQuellen } from "../../supabase/functions/_shared/objekt-texte-markt";

const objektZeile = {
  id: "o1",
  titel: "Kernsaniertes Mehrfamilienhaus in Augsburg",
  adresse: "Musterweg 1",
  plz: "86150",
  ort: "Augsburg",
  global_baujahr: 1962,
  global_zustand: "Kernsanierung",
  global_gesamt_qm: 820,
  global_etagen: 4,
  global_verkaufspreis: 3200000,
  global_rendite: 3.8,
  global_jahresnettomiete: 121000,
  highlights: ["Aufzug nachgerüstet", ""],
  meta: {
    objektart: "sanierter_bestand",
    sanierungen: [{ jahr: "2023", massnahme: "Dach", betrag: 80000 }],
    verwaltung: "Hausverwaltung Beispiel GmbH",
  },
};

const gemesseneAnalyse = {
  schema: 2,
  mikrolage: {
    einkaufen: [
      { name: "Supermarkt Nord", typ: "Supermarkt", entfernung_m: 280 },
      { name: "Discounter Süd", typ: "Discounter", entfernung_m: 640 },
    ],
    oepnv: [{ name: "Haltestelle Musterweg", typ: "Straßenbahn", entfernung_m: 150 }],
  },
  makrolage: { einwohner: 301000, einwohner_stand: "2024", arbeitslosenquote: 4.1 },
  // Modelliert, nicht erhoben. Darf nicht als Beleg auftauchen.
  arbeitgeber: [{ name: "Erfundene Werke AG", branche: "Maschinenbau", mitarbeiter: 5000 }],
};

describe("Tatsachen, aus denen die Texte entstehen", () => {
  it("nimmt die Objektangaben auf, aber keine Preise, Mieten oder Renditen", () => {
    const zeilen = objektQuellen(objektZeile, [{ groesse: 48 }, { groesse: 96 }]);
    const alles = zeilen.join("\n");

    expect(alles).toContain("Kernsaniertes Mehrfamilienhaus in Augsburg");
    expect(alles).toContain("Musterweg 1, 86150 Augsburg");
    expect(alles).toContain("Baujahr: 1962");
    expect(alles).toContain("Sanierung: 2023, Dach");
    expect(alles).toContain("Gepflegtes Merkmal: Aufzug nachgerüstet");
    expect(alles).toContain("Wohnungsgrößen in m²: 48 bis 96");
    // Die Zahl der angelegten Einheiten ist nicht die des Hauses (24.09.2026).
    expect(alles).not.toContain("Einheiten im Objekt");

    // Der Kern der Auflage: Was im Auftrag steht, landet früher oder später im
    // Text. Ertragszahlen stehen deshalb gar nicht erst darin.
    expect(alles).not.toContain("3200000");
    expect(alles).not.toContain("121000");
    expect(alles).not.toContain("3.8");
  });

  it("nennt die Einheiten im Haus nur, wenn sie am Objekt gepflegt sind", () => {
    const mitPflege = { ...objektZeile, meta: { ...((objektZeile as { meta?: Record<string, unknown> }).meta ?? {}), einheitenImHaus: 14 } };
    expect(objektQuellen(mitPflege, [{ groesse: 48 }]).join("\n")).toContain("Einheiten im Objekt: 14");
    expect(objektQuellen(objektZeile, [{ groesse: 48 }]).join("\n")).not.toContain("Einheiten im Objekt");
  });

  it("verträgt ein leeres Objekt ohne Absturz", () => {
    expect(objektQuellen(null)).toEqual([]);
    expect(objektQuellen({})).toEqual([]);
    expect(objektQuellen({ titel: "Nur ein Titel" })).toEqual(["Titel: Nur ein Titel"]);
  });

  it("übernimmt die gemessene Standortanalyse, aber nicht die modellierten Arbeitgeber", () => {
    const zeilen = standortQuellen(gemesseneAnalyse);
    const alles = zeilen.join("\n");

    expect(alles).toContain("Supermarkt Nord (Supermarkt, 280 m Luftlinie)");
    expect(alles).toContain("ÖPNV in der Nähe: Haltestelle Musterweg");
    expect(alles).toContain("Einwohner der Gemeinde: 301000 (Stand 2024)");
    expect(alles).toContain("Arbeitslosenquote: 4.1 Prozent");
    // Die Arbeitgeberliste ist laut Herkunftshinweis modelliert und nicht
    // erhoben. Als Beleg für ein Verkaufsargument taugt sie nicht.
    expect(alles).not.toContain("Erfundene Werke AG");
  });

  it("lässt die alte, erfundene Standortanalyse gar nicht erst durch", () => {
    // Vor der Umstellung hat ein Sprachmodell Schulen, Entfernungen und
    // Koordinaten aus dem Gedächtnis geschrieben. Ohne `schema: 2` gilt eine
    // Analyse deshalb als nicht vorhanden.
    const alt = { ...gemesseneAnalyse, schema: undefined };
    expect(standortQuellen(alt)).toEqual([]);
    expect(standortQuellen(null)).toEqual([]);
    expect(standortQuellen("kaputt")).toEqual([]);
  });

  /*
   * Seit dem 23.09.2026 gehen die Investagon-Daten mit in den Auftrag. Die
   * Merkmalsliste mischt Gebäude und Steuermodell, die Freitexte sind Werbung.
   * Durchkommen darf nur, was das Gebäude beschreibt.
   */
  const investagonObjekt = {
    ...objektZeile,
    meta: {
      investagonRaw: {
        extras: [
          { id: 2, weight: 2, value: "Kunde bekommt ein personalisiertes Restnutzungsdauergutachten nach Verkauf zugestellt." },
          {
            id: 1,
            weight: 0,
            value:
              "Das Haus liegt am Rand der Altstadt. 2021 wurden Dach und Fassade erneuert. Die Mieteinnahmen sind langfristig gesichert.",
          },
          { id: 3, weight: 1, value: "   " },
        ],
        tags: [
          "1. Produktklasse: Erhaltungsaufwand",
          "2. Mietmodell: Standard-Vermietung",
          "3. 24 Monate Mietgarantie ab wirtschaftlichen Übergang: inklusive",
          "4. 360°-Verwaltung: inklusive",
          "5. Energieeffizienzklasse: C",
          "6. Gebäudeanteil: ca. 81 %",
          "7. Gebäude-AfA: 3.7 % p.a.",
          "8. Sofort abzugsfähiger Erhaltungsaufwand ca. 12.500 € - 22.000 € pro Wohneinheit",
          "9. Einbauküche: inklusive",
        ],
        object_renovation_year: 2019,
      },
    },
  };

  it("nimmt die neutralen Investagon-Merkmale auf, aber nichts zu Steuer, Miete und Preis", () => {
    const merkmale = neutraleMerkmale(investagonObjekt.meta.investagonRaw);
    expect(merkmale).toEqual(["360°-Verwaltung: inklusive", "Energieeffizienzklasse: C", "Einbauküche: inklusive"]);

    const alles = objektQuellen(investagonObjekt).join("\n");
    expect(alles).toContain("Merkmal laut Investagon: Einbauküche: inklusive");
    for (const verboten of ["AfA", "Mietgarantie", "Gebäudeanteil", "Erhaltungsaufwand", "Mietmodell", "12.500"]) {
      expect(alles, verboten).not.toContain(verboten);
    }
  });

  it("nimmt die Freitexte in Investagons Reihenfolge, ohne die Sätze über Ertrag und Steuer", () => {
    expect(investagonFreitexte(investagonObjekt.meta.investagonRaw)).toEqual([
      "Das Haus liegt am Rand der Altstadt. 2021 wurden Dach und Fassade erneuert.",
    ]);
    const alles = objektQuellen(investagonObjekt).join("\n");
    expect(alles).toContain("Beschreibung laut Investagon: Das Haus liegt am Rand der Altstadt.");
    expect(alles).not.toContain("Mieteinnahmen");
    expect(alles).not.toContain("Restnutzungsdauer");
  });

  it("filtert auch die vorhandene Objektbeschreibung Satz für Satz", () => {
    expect(ohneErtragsaussagen("Ruhige Lage.\nErhöhte Abschreibung nach § 7h möglich. Aufzug vorhanden.")).toBe(
      "Ruhige Lage. Aufzug vorhanden.",
    );
    const zeilen = objektQuellen({ titel: "X", beschreibung: "Kaufpreis ab 199.000 €. Dachgeschoss 2020 ausgebaut." });
    expect(zeilen).toContain("Vorhandene Objektbeschreibung: Dachgeschoss 2020 ausgebaut.");
  });

  it("fasst die Sanierungsjahre der Einheiten je Jahr zusammen, neuestes zuerst", () => {
    const wohnungen = [
      { sanierungsjahr: 2019 },
      { renovierungsjahr: "2022" },
      { sanierungsjahr: 2019 },
      { meta: { investagonRaw: { object_renovation_year: 2022 } } },
      { sanierungsjahr: 0 },
      {},
    ];
    expect(sanierungsjahreDerEinheiten(wohnungen)).toEqual([
      { jahr: "2022", anzahl: 2 },
      { jahr: "2019", anzahl: 2 },
    ]);
    const alles = objektQuellen(objektZeile, wohnungen).join("\n");
    expect(alles).toContain("Sanierungsjahr laut Einheitendaten: 2022, bei 2 von 6 Einheiten");
    // Das Jahr am Objekt stammt aus der ersten Einheit und käme sonst doppelt.
    expect(objektQuellen(investagonObjekt, wohnungen).join("\n")).not.toContain("Sanierungsjahr laut Investagon");
  });

  it("nimmt das Sanierungsjahr am Objekt nur, wenn die Einheiten keines liefern", () => {
    expect(objektQuellen(investagonObjekt).join("\n")).toContain("Sanierungsjahr laut Investagon: 2019");
  });

  it("verwirft ein Sanierungsjahr bis einschließlich Baujahr als Füllwert", () => {
    // Investagon trägt bei manchen Häusern das Baujahr als Sanierungsjahr ein.
    const alles = objektQuellen(objektZeile, [{ sanierungsjahr: 1962 }, { sanierungsjahr: 1950 }]).join("\n");
    expect(alles).not.toContain("Sanierungsjahr");
  });

  it("sortiert die nächstgelegenen zuerst und nimmt höchstens drei je Kategorie", () => {
    const viele = {
      schema: 2,
      mikrolage: {
        schulen: [
          { name: "Weit weg", entfernung_m: 1800 },
          { name: "Mittendrin", entfernung_m: 400 },
          { name: "Gleich nebenan", entfernung_m: 120 },
          { name: "Die vierte", entfernung_m: 2000 },
        ],
      },
    };
    const zeile = standortQuellen(viele)[0];
    expect(zeile.indexOf("Gleich nebenan")).toBeLessThan(zeile.indexOf("Mittendrin"));
    expect(zeile).not.toContain("Die vierte");
  });
});

/*
  Christian am 23.09.2026: Jedes sichtbare Objekt bekommt Beschreibung und
  Standortargumente. Die Function misst die Umgebung vor dem Lauf selbst, also
  genügen Objektangaben. Die Belegpflicht je Argument bleibt: Reicht es nicht
  für fünf, kommen weniger und eine Beanstandung.
*/
describe("Reicht die Grundlage für einen Text?", () => {
  it("lässt mit Objektangaben allein durch, auch ohne Analyse und Unterlagen", () => {
    const nurAngaben: ObjektTexteQuellen = { objekt: objektQuellen(objektZeile), standort: [], unterlagen: [] };
    expect(genugQuellen(nurAngaben)).toEqual({ ok: true, grund: "" });
  });

  it("lehnt nur ab, wenn zum Objekt gar nichts gepflegt ist", () => {
    const urteil = genugQuellen({ objekt: [], standort: ["irgendwas"], unterlagen: [] });
    expect(urteil.ok).toBe(false);
    expect(urteil.grund).toContain("keine Angaben");
  });
});

describe("Der Auftrag an das Modell", () => {
  const quellen: ObjektTexteQuellen = {
    objekt: objektQuellen(objektZeile),
    standort: standortQuellen(gemesseneAnalyse),
    unterlagen: ["Expose.pdf"],
  };

  it("zählt alle Tatsachen auf und verbietet Zusagen ausdrücklich", () => {
    const auftrag = objektTexteAnweisung(quellen);
    expect(auftrag).toContain("Baujahr: 1962");
    expect(auftrag).toContain("Mitgelesene Unterlage: Expose.pdf");
    expect(auftrag).toContain("Keine Zusagen zu Rendite, Wertsteigerung, Mieteinnahmen oder Steuervorteilen");
    expect(auftrag).toContain(`Genau ${ANZAHL_STANDORTARGUMENTE} Argumente`);
    expect(auftrag).toContain("Jedes Argument braucht einen Beleg");
  });

  it("nennt 1000 Zeichen und die Regeln für die Sanierungen", () => {
    const auftrag = objektTexteAnweisung(quellen);
    expect(MAX_KURZBESCHREIBUNG).toBe(1000);
    expect(auftrag).toContain(`Höchstens ${MAX_KURZBESCHREIBUNG} Zeichen, gern weniger`);
    expect(auftrag).toContain("drei bis sechs Sätze");
    expect(auftrag).toContain("Das Jahr nur, wenn es dort steht");
    expect(auftrag).toContain("Keine Beträge");
    // Die Messung ergibt Luftlinie. Eine Gehzeit wäre erfunden.
    expect(auftrag).toContain("nie eine Gehzeit");
    expect(auftrag).not.toContain("500 Zeichen");
  });

  it("verlangt die Sanierungen im Werkzeug, in der vertraglich festen Form", () => {
    const parameter = OBJEKT_TEXTE_WERKZEUG.function.parameters;
    expect(parameter.required).toEqual(["kurzbeschreibung", "standortargumente", "marktargumente", "sanierungen", "interne_highlights"]);
    const sanierungen = parameter.properties.sanierungen;
    expect(sanierungen.maxItems).toBe(MAX_SANIERUNGEN);
    expect(Object.keys(sanierungen.items.properties)).toEqual(["jahr", "massnahme", "beleg"]);
    expect(parameter.properties.kurzbeschreibung.description).toContain("1000 Zeichen");
  });

  it("merkt sich den Stand der Tatsachen und bemerkt jede Änderung", () => {
    const vorher = quellenFingerabdruck(quellen);
    expect(vorher).toBe(quellenFingerabdruck({ ...quellen }));
    const nachher = quellenFingerabdruck({ ...quellen, unterlagen: ["Expose.pdf", "Lageplan.pdf"] });
    expect(nachher).not.toBe(vorher);
    expect(quellenZeilen(quellen).length).toBe(quellen.objekt.length + quellen.standort.length + 1);
  });
});

describe("Prüfung der Antwort", () => {
  const fuenf = Array.from({ length: 5 }, (_, i) => ({
    argument: `Argument ${i + 1}. Eine Tatsache dazu.`,
    beleg: "Einwohner der Gemeinde: 301000 (Stand 2024)",
  }));

  it("nimmt eine saubere Antwort ohne Beanstandung an", () => {
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "Ein Haus von 1962 in Augsburg.", standortargumente: fuenf });
    expect(geprueft.standortargumente).toHaveLength(5);
    expect(geprueft.beanstandungen).toEqual([]);
  });

  it("schneidet mehr als fünf Argumente ab und sagt es", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Text.",
      standortargumente: [...fuenf, { argument: "Das sechste", beleg: "x" }],
    });
    expect(geprueft.standortargumente).toHaveLength(5);
    expect(geprueft.beanstandungen.join(" ")).toContain("6 Argumente");
  });

  it("meldet zu wenige Argumente, statt sie stillschweigend hinzunehmen", () => {
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf.slice(0, 3) });
    expect(geprueft.standortargumente).toHaveLength(3);
    expect(geprueft.beanstandungen.join(" ")).toContain("nur 3 von 5");
  });

  it("kürzt eine zu lange Kurzbeschreibung und sagt es", () => {
    const zuLang = "Ein sehr ausführlicher Satz über dieses Haus. ".repeat(30);
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: zuLang, standortargumente: fuenf });
    expect(geprueft.kurzbeschreibung.length).toBeLessThanOrEqual(MAX_KURZBESCHREIBUNG + 1);
    expect(geprueft.beanstandungen.join(" ")).toContain(`auf ${MAX_KURZBESCHREIBUNG} gekürzt`);
  });

  it("kürzt ein zu langes Argument auf die Höchstlänge", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Text.",
      standortargumente: [{ argument: "Sehr viele Worte hintereinander. ".repeat(20), beleg: "x" }, ...fuenf.slice(0, 4)],
    });
    expect(geprueft.standortargumente[0].argument.length).toBeLessThanOrEqual(MAX_ARGUMENT + 1);
  });

  it("meldet ungleich lange Argumente, damit beide Blöcke gleich wirken", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Text.",
      standortargumente: [
        { argument: "Kurz.", beleg: "x" },
        { argument: "Ein deutlich längerer Punkt, der die anderen vier erschlägt und die Liste unruhig macht.", beleg: "x" },
        ...fuenf.slice(0, 3),
      ],
    });
    expect(geprueft.beanstandungen.join(" ")).toContain("unterschiedlich lang");
  });

  it("meldet ein Argument ohne Beleg", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Text.",
      standortargumente: [...fuenf.slice(0, 4), { argument: "Behauptung ohne Grundlage", beleg: "  " }],
    });
    expect(geprueft.beanstandungen.join(" ")).toContain("Standortargument ohne Beleg");
  });

  it("findet Versprechen zu Rendite, Wertsteigerung, Mieten und Steuern", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Eine sichere Anlage mit garantierter Wertsteigerung.",
      standortargumente: [
        { argument: "Starke Rendite von über vier Prozent.", beleg: "x" },
        { argument: "Steigende Mieteinnahmen in der Region.", beleg: "x" },
        { argument: "Hoher Steuervorteil durch die Sanierung.", beleg: "x" },
        ...fuenf.slice(0, 2),
      ],
    });
    const alles = geprueft.beanstandungen.join(" ");
    expect(alles).toContain("Wertsteigerung");
    expect(alles).toContain("Rendite");
    expect(alles).toContain("Mieteinnahm");
    expect(alles).toContain("Steuervorteil");
    // Nichts davon wird entfernt. Ein still gekürzter Text wäre schlimmer:
    // Der Nutzer glaubte dann, er habe das Ganze gesehen.
    expect(geprueft.standortargumente).toHaveLength(5);
    expect(geprueft.kurzbeschreibung).toContain("garantierter Wertsteigerung");
  });

  it("verträgt Unsinn statt einer Antwort", () => {
    const geprueft = pruefeObjektTexte(null);
    expect(geprueft.kurzbeschreibung).toBe("");
    expect(geprueft.standortargumente).toEqual([]);
    expect(geprueft.sanierungen).toEqual([]);
    expect(geprueft.beanstandungen.length).toBeGreaterThan(0);
  });

  it("lässt eine Beschreibung mit 1000 Zeichen ungekürzt", () => {
    const voll = "x".repeat(MAX_KURZBESCHREIBUNG);
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: voll, standortargumente: fuenf });
    expect(geprueft.kurzbeschreibung).toBe(voll);
    expect(geprueft.beanstandungen.join(" ")).not.toContain("gekürzt");
  });
});

describe("Prüfung der Sanierungen", () => {
  const fuenf = Array.from({ length: 5 }, (_, i) => ({ argument: `Argument ${i + 1}. Eine Tatsache.`, beleg: "x" }));
  const quellen: ObjektTexteQuellen = {
    objekt: ["Baujahr: 1962", "Sanierungsjahr laut Einheitendaten: 2019, bei 4 von 8 Einheiten", "Sanierung: 2023, Dach"],
    standort: [],
    unterlagen: [],
  };
  const pruefe = (sanierungen: unknown, q: ObjektTexteQuellen | undefined = quellen) =>
    pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, sanierungen }, q);

  it("übernimmt belegte Einträge und sortiert die neuesten nach vorn", () => {
    const geprueft = pruefe([
      { jahr: "2019", massnahme: "Wohnungen modernisiert", beleg: quellen.objekt[1] },
      { jahr: "", massnahme: "Hausflure und Eingangsbereiche, Renovierung läuft", beleg: "Beschreibung laut Investagon: ..." },
      { jahr: "2023", massnahme: "Dach erneuert", beleg: quellen.objekt[2] },
    ]);
    expect(geprueft.sanierungen).toEqual([
      { jahr: "2023", massnahme: "Dach erneuert", beleg: "Sanierung: 2023, Dach" },
      { jahr: "2019", massnahme: "Wohnungen modernisiert", beleg: quellen.objekt[1] },
      { jahr: "", massnahme: "Hausflure und Eingangsbereiche, Renovierung läuft", beleg: "Beschreibung laut Investagon: ..." },
    ]);
    expect(geprueft.beanstandungen).toEqual([]);
  });

  it("streicht ein Jahr, das nicht in den Angaben steht, und sagt es", () => {
    // Das Modell schätzt gern ein Jahr dazu. Die Maßnahme bleibt, das Jahr nicht.
    const geprueft = pruefe([{ jahr: "2015", massnahme: "Fenster getauscht", beleg: "x" }]);
    expect(geprueft.sanierungen).toEqual([{ jahr: "", massnahme: "Fenster getauscht", beleg: "x" }]);
    expect(geprueft.beanstandungen.join(" ")).toContain("2015 steht nicht in den Angaben");
  });

  it("lässt ein Jahr stehen, wenn Unterlagen mitgelesen wurden", () => {
    // Aus einem PDF kann ein Jahr kommen, das hier niemand nachprüfen kann.
    const mitUnterlage = { ...quellen, unterlagen: ["Expose.pdf"] };
    expect(pruefe([{ jahr: "2015", massnahme: "Fenster getauscht", beleg: "Expose.pdf" }], mitUnterlage).sanierungen[0].jahr).toBe(
      "2015",
    );
  });

  it("nimmt nur vierstellige Jahreszahlen", () => {
    const geprueft = pruefe([
      { jahr: "ca. 2019", massnahme: "Heizung erneuert", beleg: "x" },
      { jahr: 2019, massnahme: "Aufzug eingebaut", beleg: "x" },
    ]);
    expect(geprueft.sanierungen.map((s) => s.jahr)).toEqual(["2019", ""]);
    expect(geprueft.beanstandungen.join(" ")).toContain("„ca. 2019“ ist keine Jahreszahl");
  });

  it("meldet fehlende Belege, Beträge und Versprechen", () => {
    const geprueft = pruefe([
      { jahr: "", massnahme: "Fassade gedämmt", beleg: "" },
      { jahr: "", massnahme: "Bäder für 80.000 € saniert", beleg: "x" },
      { jahr: "", massnahme: "Fenster erneuert, garantierte Wertsteigerung", beleg: "x" },
    ]);
    const alles = geprueft.beanstandungen.join(" ");
    expect(alles).toContain("Sanierung ohne Beleg");
    expect(alles).toContain("nennt einen Betrag");
    expect(alles).toContain("Wertsteigerung");
    // Nichts wird still entfernt.
    expect(geprueft.sanierungen).toHaveLength(3);
  });

  it("kürzt eine lange Maßnahme, wirft leere und doppelte weg und behält höchstens sechs", () => {
    const viele = [
      { jahr: "", massnahme: "   ", beleg: "x" },
      { jahr: "2019", massnahme: "Wohnungen modernisiert", beleg: "x" },
      { jahr: "2019", massnahme: "Wohnungen modernisiert", beleg: "x" },
      { jahr: "", massnahme: "Sehr lange Beschreibung einer Maßnahme. ".repeat(10), beleg: "x" },
      ...Array.from({ length: 6 }, (_, i) => ({ jahr: "", massnahme: `Maßnahme ${i}`, beleg: "x" })),
    ];
    const geprueft = pruefe(viele);
    expect(geprueft.sanierungen).toHaveLength(MAX_SANIERUNGEN);
    expect(geprueft.sanierungen[0]).toMatchObject({ jahr: "2019", massnahme: "Wohnungen modernisiert" });
    expect(geprueft.sanierungen.filter((s) => s.massnahme === "Wohnungen modernisiert")).toHaveLength(1);
    expect(geprueft.sanierungen[1].massnahme.length).toBeLessThanOrEqual(MAX_MASSNAHME + 1);
    expect(geprueft.beanstandungen.join(" ")).toContain(`die ${MAX_SANIERUNGEN} neuesten`);
  });

  it("gibt eine leere Liste zurück, wenn das Modell nichts liefert", () => {
    expect(pruefe(undefined).sanierungen).toEqual([]);
    expect(pruefe("kaputt").sanierungen).toEqual([]);
  });

  it("lässt Jahre ungeprüft, wenn keine Quellen mitgegeben werden", () => {
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "T.", standortargumente: fuenf, sanierungen: [{ jahr: "2015", massnahme: "Dach", beleg: "x" }] });
    expect(geprueft.sanierungen[0].jahr).toBe("2015");
  });
});

describe("Ablage im meta der Objektzeile", () => {
  const quellen: ObjektTexteQuellen = { objekt: ["Titel: X"], standort: [], unterlagen: ["Expose.pdf"] };
  const texte = baueObjektTexte({
    geprueft: pruefeObjektTexte({
      kurzbeschreibung: "Ein Haus.",
      standortargumente: Array.from({ length: 5 }, (_, i) => ({ argument: `A${i}`, beleg: "Titel: X" })),
    }),
    quellen,
    modell: "google/gemini-2.5-flash",
    jetzt: new Date("2026-09-22T10:00:00.000Z"),
  });

  it("schreibt und liest denselben Stand, fremde Schlüssel bleiben stehen", () => {
    const meta = objektTexteInMeta({ anlageklasse: "Eigentumswohnung", kurzbeschreibung: "von Hand" }, texte);
    expect(meta.anlageklasse).toBe("Eigentumswohnung");
    expect(meta.kurzbeschreibung).toBe("von Hand");

    const gelesen = objektTexteAusMeta(meta);
    expect(gelesen?.kurzbeschreibung).toBe("Ein Haus.");
    expect(gelesen?.standortargumente).toHaveLength(5);
    expect(gelesen?.erzeugtAm).toBe("2026-09-22T10:00:00.000Z");
    expect(gelesen?.quellen).toContain("Mitgelesene Unterlage: Expose.pdf");
  });

  it("entfernt den Eintrag wieder, ohne das übrige meta anzufassen", () => {
    const meta = objektTexteInMeta(objektTexteInMeta({ anlageklasse: "X" }, texte), undefined);
    expect(meta).not.toHaveProperty(OBJEKT_TEXTE_META_SCHLUESSEL);
    expect(meta.anlageklasse).toBe("X");
  });

  it("ignoriert eine Ablage aus einer fremden Fassung", () => {
    expect(objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: { schema: 99, kurzbeschreibung: "alt" } })).toBeUndefined();
    expect(objektTexteAusMeta({})).toBeUndefined();
    expect(objektTexteAusMeta(null)).toBeUndefined();
  });

  it("hält einen Stand älterer Fassung für nicht vorhanden, damit jedes Objekt neu entsteht", () => {
    expect(OBJEKT_TEXTE_SCHEMA).toBe(5);
    expect(objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: { schema: 3, kurzbeschreibung: "Fassung 3." } })).toBeUndefined();
    expect(objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: { schema: 2, kurzbeschreibung: "Fassung 2." } })).toBeUndefined();
    expect(objektTexteAusMeta({ [OBJEKT_TEXTE_META_SCHLUESSEL]: { schema: 1, kurzbeschreibung: "Kurz." } })).toBeUndefined();
    // Den Wortlaut liest der Vergleich trotzdem, siehe unten.
    expect(automatischerWortlaut({ [OBJEKT_TEXTE_META_SCHLUESSEL]: { schema: 1, kurzbeschreibung: "Kurz." } })).toEqual({
      kurzbeschreibung: "Kurz.",
      standortargumente: [],
      marktargumente: [],
    });
  });

  it("schreibt die Sanierungen mit und liest sie defensiv zurück", () => {
    const mitSanierungen = baueObjektTexte({
      geprueft: pruefeObjektTexte({
        kurzbeschreibung: "Ein Haus.",
        standortargumente: [],
        sanierungen: [{ jahr: "2021", massnahme: "Dach und Fassade renoviert", beleg: "Titel: X" }],
      }),
      quellen: { objekt: ["Titel: X"], standort: [], unterlagen: ["Expose.pdf"] },
      modell: "m",
    });
    const meta = objektTexteInMeta({}, mitSanierungen);
    expect((meta[OBJEKT_TEXTE_META_SCHLUESSEL] as { sanierungen: unknown }).sanierungen).toEqual([
      { jahr: "2021", massnahme: "Dach und Fassade renoviert", beleg: "Titel: X" },
    ]);
    expect(objektTexteAusMeta(meta)?.sanierungen).toHaveLength(1);

    // Kaputte Einträge fallen heraus, ein fehlendes Feld wird zur leeren Liste.
    const kaputt = {
      [OBJEKT_TEXTE_META_SCHLUESSEL]: {
        ...mitSanierungen,
        sanierungen: [null, { jahr: 2019, massnahme: "Heizung" }, { jahr: "neu", massnahme: "" }],
      },
    };
    expect(objektTexteAusMeta(kaputt)?.sanierungen).toEqual([{ jahr: "2019", massnahme: "Heizung", beleg: "" }]);
    const ohne = { [OBJEKT_TEXTE_META_SCHLUESSEL]: { ...mitSanierungen, sanierungen: undefined } };
    expect(objektTexteAusMeta(ohne)?.sanierungen).toEqual([]);
  });
});

/*
 * Der Wechsel auf 1000 Zeichen braucht eine zweite Regel. Die gepflegten
 * Felder sind bei fast jedem Objekt schon gefüllt, aber nur automatisch. Ohne
 * Ersetzen bliebe überall die alte, kurze Fassung stehen. Ein von Hand
 * geschriebener Text dagegen bleibt immer.
 */
describe("Ersetzen nur automatisch entstandener Texte", () => {
  const altArgumente = ["Alt eins.", "Alt zwei.", "Alt drei.", "Alt vier.", "Alt fünf."];
  const alterStand = {
    schema: 1,
    kurzbeschreibung: "Alte kurze Fassung.",
    standortargumente: altArgumente.map((argument) => ({ argument, beleg: "x" })),
  };
  const neu = baueObjektTexte({
    geprueft: pruefeObjektTexte({
      kurzbeschreibung: "Neue lange Fassung mit fünf bis acht Sätzen.",
      standortargumente: Array.from({ length: 5 }, (_, i) => ({ argument: `Neu ${i + 1}.`, beleg: "x" })),
    }),
    quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
    modell: "m",
  });

  it("ersetzt Felder, die wortgleich den vorigen automatischen Stand tragen, auch aus Fassung 1", () => {
    const meta = {
      kurzbeschreibung: "Alte kurze Fassung.",
      standortargumente: [...altArgumente],
      [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand,
    };
    expect(vonHandGepflegt(meta)).toEqual({ kurzbeschreibung: false, standortargumente: false, marktargumente: false });
    const danach = objektTexteInMeta(texteInGepflegteFelder(meta, neu), neu);
    expect(danach.kurzbeschreibung).toBe("Neue lange Fassung mit fünf bis acht Sätzen.");
    expect(danach.standortargumente).toEqual(["Neu 1.", "Neu 2.", "Neu 3.", "Neu 4.", "Neu 5."]);
  });

  it("lässt einen von Hand geänderten Text stehen, je Feld getrennt", () => {
    const meta = {
      kurzbeschreibung: "Von Hand überarbeitet.",
      standortargumente: [...altArgumente],
      [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand,
    };
    expect(vonHandGepflegt(meta)).toEqual({ kurzbeschreibung: true, standortargumente: false, marktargumente: false });
    const danach = texteInGepflegteFelder(meta, neu);
    expect(danach.kurzbeschreibung).toBe("Von Hand überarbeitet.");
    expect(danach.standortargumente).toEqual(["Neu 1.", "Neu 2.", "Neu 3.", "Neu 4.", "Neu 5."]);
  });

  it("zählt schon ein einziges geändertes Argument als Handarbeit", () => {
    const meta = {
      standortargumente: ["Alt eins.", "Alt zwei.", "Selbst geschrieben.", "Alt vier.", "Alt fünf."],
      [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand,
    };
    expect(texteInGepflegteFelder(meta, neu).standortargumente).toEqual(meta.standortargumente);
  });

  it("lässt ohne jeden vorigen Stand alles Gefüllte stehen", () => {
    // Ohne Vergleichsstand ist ein gefülltes Feld immer Handarbeit.
    const meta = { kurzbeschreibung: "Irgendwann getippt.", standortargumente: ["Eins"] };
    const danach = texteInGepflegteFelder(meta, neu);
    expect(danach.kurzbeschreibung).toBe("Irgendwann getippt.");
    expect(danach.standortargumente).toEqual(["Eins"]);
  });

  it("füllt leere Felder wie bisher", () => {
    const danach = texteInGepflegteFelder({ kurzbeschreibung: "  ", standortargumente: [] }, neu);
    expect(danach.kurzbeschreibung).toBe("Neue lange Fassung mit fünf bis acht Sätzen.");
    expect(danach.standortargumente).toHaveLength(5);
  });

  it("lässt ein automatisches Feld stehen, wenn der neue Lauf dafür nichts liefert", () => {
    const leer = baueLeereObjektTexte({ grund: "x", quellen: { objekt: [], standort: [], unterlagen: [] } });
    const meta = { kurzbeschreibung: "Alte kurze Fassung.", [OBJEKT_TEXTE_META_SCHLUESSEL]: alterStand };
    expect(texteInGepflegteFelder(meta, leer).kurzbeschreibung).toBe("Alte kurze Fassung.");
  });
});


describe("Ein Lauf ohne Ergebnis", () => {
  it("hinterlässt einen Vermerk mit Grund, damit er sich nicht wiederholt", () => {
    const vermerk = baueLeereObjektTexte({
      grund: "Für die Standortargumente fehlt die Grundlage.",
      quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
      jetzt: new Date("2026-09-22T10:00:00.000Z"),
    });
    expect(hatTexte(vermerk)).toBe(false);
    // Er wird wie ein Ergebnis abgelegt und gelesen. Genau das verhindert,
    // dass der selbsttätige Start es bei jedem Seitenaufruf erneut versucht.
    const gelesen = objektTexteAusMeta(objektTexteInMeta({}, vermerk));
    expect(gelesen).toBeDefined();
    expect(gelesen?.ohneErgebnis).toContain("fehlt die Grundlage");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Der Browser-Teil. Er greift auf Supabase zu, deshalb die Attrappen.
// ───────────────────────────────────────────────────────────────────────────

const store = vi.hoisted(() => ({
  /** Was `updateObjektFieldFast` zuletzt geschrieben hat. */
  gespeichert: null as Record<string, any> | null,
  /** Wenn true, zeigt der Zwischenspeicher weiter den alten Stand. */
  schreibenScheitert: false,
  /** Die Antwort, die die Edge Function liefern soll. */
  antwort: { data: {} as any, error: null as any },
  /** Wie oft die Function gerufen wurde, und womit. */
  aufrufe: [] as any[],
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (_name: string, optionen: any) => {
        store.aufrufe.push(optionen?.body);
        return store.antwort;
      }),
    },
  },
}));

/*
 * Der Zwischenspeicher wird nachgebildet: Was geschrieben wurde, liest
 * `getObjektById` danach zurück. Mit `schreibenScheitert` bleibt er auf dem
 * alten Stand, und genau so verhält sich die Datenbank, wenn die
 * Zeilensicherheit die Änderung wegfiltert. PostgREST meldet dann keinen
 * Fehler, es passiert nur nichts.
 */
vi.mock("@/lib/objekteStore", () => ({
  updateObjektFieldFast: vi.fn(async (_id: string, felder: Record<string, any>) => {
    store.gespeichert = felder;
  }),
  getObjektById: vi.fn(() =>
    store.schreibenScheitert ? { id: "o1", meta: {} } : { id: "o1", meta: store.gespeichert?.meta ?? {} },
  ),
}));

const {
  anzuzeigendeObjektTexte,
  brauchtObjektTexte,
  objektTexte,
  objektTexteStand,
  speichereGepflegteTexte,
  starteObjektTexteBeiBedarf,
  vergissAngestosseneLaeufe,
} = await import("@/lib/objektTexteKi");

const VORSCHLAG = baueObjektTexte({
  geprueft: pruefeObjektTexte({
    kurzbeschreibung: "Ein Haus von 1962 in Augsburg.",
    standortargumente: [
      { argument: "Kurze Wege. Supermarkt in 280 m.", beleg: "Einkaufen in der Nähe: Supermarkt Nord" },
      { argument: "Anbindung. Straßenbahn in 150 m.", beleg: "ÖPNV in der Nähe: Haltestelle Musterweg" },
      { argument: "Drei.", beleg: "x" },
      { argument: "Vier.", beleg: "x" },
      { argument: "Fünf.", beleg: "x" },
    ],
  }),
  quellen: { objekt: ["Titel: X"], standort: [], unterlagen: ["Expose.pdf"] },
  modell: "google/gemini-2.5-flash",
});

function objektMit(weiteresMeta: Record<string, unknown> = {}, vorschlagTexte: unknown = undefined) {
  return {
    id: "o1",
    dokumente: [],
    meta: { ...weiteresMeta, ...(vorschlagTexte ? { [OBJEKT_TEXTE_META_SCHLUESSEL]: vorschlagTexte } : {}) },
  } as any;
}

/** Das `meta`, wie es nach einem Lauf aussieht: Stand plus gefüllte Felder. */
function metaNachLauf(texte: any, weiteres: Record<string, unknown> = {}) {
  return objektTexteInMeta(texteInGepflegteFelder(weiteres, texte), texte);
}

describe("Welcher Text angezeigt wird", () => {
  it("erkennt den erzeugten Text im gepflegten Feld als automatisch", () => {
    // So sieht ein Objekt nach einem Lauf aus: Der Wortlaut steht in beiden
    // Feldern, weil nur die das Exposé zu sehen bekommt.
    const a = anzuzeigendeObjektTexte({ meta: metaNachLauf(VORSCHLAG) } as any);
    expect(a.kurzbeschreibung).toBe("Ein Haus von 1962 in Augsburg.");
    expect(a.kurzbeschreibungHerkunft).toBe("automatisch");
    expect(a.standortargumente).toHaveLength(5);
    expect(a.standortargumenteHerkunft).toBe("automatisch");
    expect(a.automatisch).toBe(true);
    // Seit dem 24.09.2026 ohne sichtbaren Vermerk „Automatisch erstellt“.
    expect(a).not.toHaveProperty("hinweis");
  });

  it("füllt beim Lauf nur leere Felder und lässt Getipptes stehen", () => {
    const meta = metaNachLauf(VORSCHLAG, { kurzbeschreibung: "Von Hand geschrieben." });
    expect(meta.kurzbeschreibung).toBe("Von Hand geschrieben.");
    expect(meta.standortargumente).toHaveLength(5);

    const a = anzuzeigendeObjektTexte({ meta } as any);
    expect(a.kurzbeschreibungHerkunft).toBe("gepflegt");
    expect(a.standortargumenteHerkunft).toBe("automatisch");
    expect(a.automatisch).toBe(true);
  });

  it("nimmt den erzeugten Text auch dann, wenn er nicht in die Felder kam", () => {
    const a = anzuzeigendeObjektTexte(objektMit({}, VORSCHLAG));
    expect(a.kurzbeschreibung).toBe("Ein Haus von 1962 in Augsburg.");
    expect(a.kurzbeschreibungHerkunft).toBe("automatisch");
  });

  it("lässt den von Hand gepflegten Text gewinnen, je Block getrennt", () => {
    const a = anzuzeigendeObjektTexte(objektMit({ kurzbeschreibung: "Von Hand geschrieben." }, VORSCHLAG));
    expect(a.kurzbeschreibung).toBe("Von Hand geschrieben.");
    expect(a.kurzbeschreibungHerkunft).toBe("gepflegt");
    // Die Argumente sind weiter die erzeugten, denn dort steht nichts.
    expect(a.standortargumenteHerkunft).toBe("automatisch");
    expect(a.automatisch).toBe(true);

    const beides = anzuzeigendeObjektTexte(
      objektMit({ kurzbeschreibung: "Von Hand.", standortargumente: ["Eins", "Zwei"] }, VORSCHLAG),
    );
    expect(beides.standortargumente).toEqual(["Eins", "Zwei"]);
    expect(beides.automatisch).toBe(false);
    expect(beides.beanstandungen).toEqual([]);
  });

  it("meldet ohne jeden Text, dass keiner da ist", () => {
    const a = anzuzeigendeObjektTexte(objektMit());
    expect(a.kurzbeschreibung).toBe("");
    expect(a.kurzbeschreibungHerkunft).toBe("keine");
    expect(a.standortargumente).toEqual([]);
    expect(a.automatisch).toBe(false);
  });

  it("zeigt bei einem Lauf ohne Ergebnis keinen leeren Text an", () => {
    const vermerk = baueLeereObjektTexte({ grund: "Grundlage fehlt.", quellen: { objekt: [], standort: [], unterlagen: [] } });
    const a = anzuzeigendeObjektTexte(objektMit({}, vermerk));
    expect(a.kurzbeschreibungHerkunft).toBe("keine");
    expect(a.automatisch).toBe(false);
    // Der Grund bleibt lesbar, die Karte zeigt ihn an.
    expect(objektTexte(objektMit({}, vermerk))?.ohneErgebnis).toBe("Grundlage fehlt.");
  });

  it("reicht die Beanstandungen nur weiter, solange der erzeugte Text zu sehen ist", () => {
    const mitFund = baueObjektTexte({
      geprueft: pruefeObjektTexte({
        kurzbeschreibung: "Mit garantierter Wertsteigerung.",
        standortargumente: VORSCHLAG.standortargumente,
      }),
      quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
      modell: "m",
    });
    expect(anzuzeigendeObjektTexte(objektMit({}, mitFund)).beanstandungen.join(" ")).toContain("Wertsteigerung");
    const ueberschrieben = objektMit({ kurzbeschreibung: "Von Hand.", standortargumente: ["Eins"] }, mitFund);
    expect(anzuzeigendeObjektTexte(ueberschrieben).beanstandungen).toEqual([]);
  });

  it("erkennt auch den Text der Fassung 1 als automatisch, bis der neue Lauf da ist", () => {
    // Sonst stünde nach dem Wechsel auf Fassung 2 an jedem Objekt „Von Hand“.
    const alt = { schema: 1, kurzbeschreibung: "Alte Fassung.", standortargumente: [{ argument: "Alt.", beleg: "x" }] };
    const a = anzuzeigendeObjektTexte(
      objektMit({ kurzbeschreibung: "Alte Fassung.", standortargumente: ["Alt."] }, alt),
    );
    expect(a.kurzbeschreibungHerkunft).toBe("automatisch");
    expect(a.standortargumenteHerkunft).toBe("automatisch");
    expect(a.automatisch).toBe(true);
  });
});

describe("Wann ein Lauf von selbst startet", () => {
  beforeEach(() => {
    vergissAngestosseneLaeufe();
    store.aufrufe = [];
    store.antwort = { data: { texte: VORSCHLAG, neu: true, gespeichert: true, version: OBJEKT_TEXTE_FUNKTION_VERSION }, error: null };
  });

  const mitUnterlage = { dokumente: [{ id: "d1", name: "Expose.pdf", url: "/objekt-dokument/x", typ: "standard", kategorie: "objektunterlagen", sichtbar: true }] };
  /** Ein Objekt mit Titel, also mit Objektangaben. Seit dem 23.09.2026 reicht das. */
  const mitAngaben = <T extends object>(o: T) => ({ ...o, titel: "Haus in Augsburg", dokumente: [] });

  it("startet, wenn nichts da ist und Objektangaben vorliegen", async () => {
    expect(brauchtObjektTexte(mitAngaben(objektMit()))).toBe(true);
    expect(brauchtObjektTexte({ ...objektMit(), ...mitUnterlage })).toBe(true);

    const ergebnis = await starteObjektTexteBeiBedarf(mitAngaben(objektMit()));
    expect(ergebnis?.texte?.kurzbeschreibung).toBe("Ein Haus von 1962 in Augsburg.");
    expect(store.aufrufe).toEqual([{ objektId: "o1", neuErzeugen: false, automatisch: true }]);
  });

  it("startet nicht ohne jede Objektangabe, spart also den Weg zur Function", async () => {
    expect(brauchtObjektTexte(objektMit())).toBe(false);
    expect(await starteObjektTexteBeiBedarf(objektMit())).toBeUndefined();
    expect(store.aufrufe).toEqual([]);
  });

  it("startet nicht, wenn schon ein aktueller Stand vorliegt, auch nicht bei einem Vermerk", async () => {
    const vermerk = baueLeereObjektTexte({ grund: "Grundlage fehlt.", quellen: { objekt: [], standort: [], unterlagen: [] } });
    expect(brauchtObjektTexte(mitAngaben(objektMit({}, VORSCHLAG)))).toBe(false);
    expect(brauchtObjektTexte(mitAngaben(objektMit({}, vermerk)))).toBe(false);
  });

  it("startet bei einem Stand der Fassung 1 neu, auch bei einem alten Vermerk", () => {
    const alt = { ...VORSCHLAG, schema: 1 };
    const alterVermerk = { ...baueLeereObjektTexte({ grund: "alt", quellen: { objekt: [], standort: [], unterlagen: [] } }), schema: 1 };
    expect(brauchtObjektTexte(mitAngaben(objektMit({}, alt)))).toBe(true);
    expect(brauchtObjektTexte(mitAngaben(objektMit({}, alterVermerk)))).toBe(true);
  });

  /*
   * Bis zum 23.09.2026 lief nichts, wenn beide Texte von Hand gepflegt waren.
   * Jetzt liefert der Lauf auch die Sanierungen, und die gibt es nur aus ihm.
   * Die gepflegten Texte bleiben dabei stehen, siehe `texteInGepflegteFelder`.
   */
  it("startet auch bei zwei von Hand gepflegten Texten, wegen der Sanierungen", () => {
    const gepflegt = { kurzbeschreibung: "Von Hand.", standortargumente: ["Eins"] };
    expect(brauchtObjektTexte(mitAngaben(objektMit(gepflegt)))).toBe(true);
  });

  it("startet je Objekt nur einmal je Sitzung", async () => {
    const objekt = mitAngaben(objektMit());
    await starteObjektTexteBeiBedarf(objekt);
    // Der zweite Aufbau derselben Seite darf nichts auslösen, solange der
    // gespeicherte Stand noch nicht in den Eigenschaften angekommen ist.
    expect(await starteObjektTexteBeiBedarf(objekt)).toBeUndefined();
    expect(store.aufrufe).toHaveLength(1);
  });

  it("meldet einen Fehler der Function im Klartext", async () => {
    store.antwort = { data: { error: "Das KI-Kontingent ist erschöpft.", version: OBJEKT_TEXTE_FUNKTION_VERSION }, error: null };
    const ergebnis = await starteObjektTexteBeiBedarf(mitAngaben(objektMit()));
    expect(ergebnis?.fehler).toBe("Das KI-Kontingent ist erschöpft.");
  });
});

describe("Von Hand geschriebener Text", () => {
  beforeEach(() => {
    store.gespeichert = null;
    store.schreibenScheitert = false;
  });

  it("schreibt nur die zwei Felder und lässt fremde Angaben stehen", async () => {
    const objekt = objektMit({ anlageklasse: "Eigentumswohnung", verwaltung: "Beispiel GmbH" }, VORSCHLAG);
    const ergebnis = await speichereGepflegteTexte(objekt, {
      kurzbeschreibung: "  Von Hand geschrieben.  ",
      standortargumente: ["Eins", " ", "Zwei"],
    });

    expect(ergebnis.ok).toBe(true);
    const meta = store.gespeichert?.meta as Record<string, any>;
    expect(meta.kurzbeschreibung).toBe("Von Hand geschrieben.");
    expect(meta.standortargumente).toEqual(["Eins", "Zwei"]);
    expect(meta.anlageklasse).toBe("Eigentumswohnung");
    expect(meta.verwaltung).toBe("Beispiel GmbH");
    // Der Vorschlag bleibt liegen, er ist der Weg zurück.
    expect(objektTexteAusMeta(meta)?.kurzbeschreibung).toBe("Ein Haus von 1962 in Augsburg.");
  });

  it("entfernt die Felder wieder, dann gilt erneut der erzeugte Text", async () => {
    const objekt = objektMit({ kurzbeschreibung: "Von Hand.", standortargumente: ["Eins"] }, VORSCHLAG);
    const ergebnis = await speichereGepflegteTexte(objekt, { kurzbeschreibung: "", standortargumente: [] });
    expect(ergebnis.ok).toBe(true);

    const meta = store.gespeichert?.meta as Record<string, any>;
    expect(meta).not.toHaveProperty("kurzbeschreibung");
    expect(meta).not.toHaveProperty("standortargumente");
    expect(anzuzeigendeObjektTexte({ meta } as any).kurzbeschreibungHerkunft).toBe("automatisch");
  });

  it("meldet einen Fehlschlag, statt ihn zu verschlucken", async () => {
    store.schreibenScheitert = true;
    const ergebnis = await speichereGepflegteTexte(objektMit({}, VORSCHLAG), {
      kurzbeschreibung: "Neuer Text",
      standortargumente: ["Eins"],
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toContain("nicht gespeichert");
  });
});

/*
 * Christian am 23.09.2026: Jedes sichtbare Objekt bekommt einen Text. Die
 * Function misst die Umgebung selbst, also genügen Objektangaben. Browser und
 * Function müssen das gleich sehen, sonst liefe der Browser in eine Ablehnung
 * nach der anderen oder ließe Objekte liegen.
 */
describe("Die Grundlage im Browser", () => {
  it("stuft jedes Objekt mit Objektangaben als offen ein, auch mit knapper Beschreibung", () => {
    expect(objektTexteStand({ meta: {}, dokumente: [], beschreibung: "Schönes Haus." })).toBe("offen");
    expect(objektTexteStand({ meta: {}, titel: "Haus am Markt" })).toBe("offen");
    expect(objektTexteStand({ meta: {}, adresse: "Musterweg 1" })).toBe("offen");
    expect(objektTexteStand({ meta: {}, ort: "Augsburg" })).toBe("offen");
  });

  it("lässt nur ein Objekt ganz ohne Angaben bei der fehlenden Grundlage", () => {
    expect(objektTexteStand({ meta: {}, titel: "  ", adresse: "", beschreibung: "", dokumente: [] })).toBe("grundlage-fehlt");
  });

  it("wertet einen gespeicherten Vermerk der aktuellen Fassung weiter als erledigt", () => {
    // Sonst liefe der Lauf bei jedem Seitenaufbau erneut in dieselbe
    // Ablehnung. Wer es noch einmal versuchen will, hat dafür den Knopf.
    const vermerk = baueLeereObjektTexte({ grund: "Grundlage fehlt.", quellen: { objekt: [], standort: [], unterlagen: [] } });
    const meta = { [OBJEKT_TEXTE_META_SCHLUESSEL]: vermerk };
    expect(objektTexteStand({ meta, titel: "Haus" })).toBe("hat-texte");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fassung 3 (23.09.2026): Ton, Marktargumente, Fehlervermerk.
// ───────────────────────────────────────────────────────────────────────────

describe("Die Anweisung, Grundregeln seit Fassung 3", () => {
  const quellen: ObjektTexteQuellen = {
    objekt: objektQuellen(objektZeile),
    standort: standortQuellen(gemesseneAnalyse),
    markt: ["Markt, Standort der Marktanalyse: Augsburg (Bayern), derselbe Ort wie das Objekt", "Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)"],
    unterlagen: ["Exposé.pdf"],
  };

  it("will zum Investieren einladen, kurz, mit starkem ersten Satz und Fakten statt Adjektiven", () => {
    const auftrag = objektTexteAnweisung(quellen);
    expect(auftrag).toContain("Lust machen, genau diese Einheit in genau diesem Haus zu erwerben");
    expect(auftrag).toContain("warum es sich lohnt, an diesem Standort zu investieren");
    expect(auftrag).toContain("Höchstens 1000 Zeichen, gern weniger");
    expect(auftrag).toContain("Der erste Satz ist der stärkste");
    expect(auftrag).toContain("über Tatsachen, nicht über Adjektive");
    expect(auftrag).toContain("Zuerst aus den Unterlagen");
  });

  it("behält die Grenzen, und sie stehen über dem Ton", () => {
    const auftrag = objektTexteAnweisung(quellen);
    expect(auftrag).toContain("REGELN, sie gehen dem Verkaufston vor");
    expect(auftrag).toContain("Behaupte nichts, was nicht in den Tatsachen oder den Unterlagen steht");
    expect(auftrag).toContain("Keine Zusagen zu Rendite, Wertsteigerung, Mieteinnahmen oder Steuervorteilen");
    expect(auftrag).toContain("Jedes Argument braucht einen Beleg");
    expect(auftrag).toContain("Keine Kaufpreise, Mieten, Beträge oder Namen von Personen");
    expect(auftrag).toContain("keine Vorhersage");
    expect(auftrag).toContain("Namen von Personen, Mietern");
  });

  it("gibt die Marktzeilen als Tatsachen mit und verlangt Quelle und Stand", () => {
    const auftrag = objektTexteAnweisung(quellen);
    expect(auftrag).toContain("Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)");
    expect(auftrag).toContain(`HÖCHSTENS ${ANZAHL_MARKTARGUMENTE}`);
    expect(auftrag).toContain("mit Quelle und Stand im Satz");
    const werkzeug = OBJEKT_TEXTE_WERKZEUG.function.parameters.properties.marktargumente;
    expect(werkzeug.maxItems).toBe(ANZAHL_MARKTARGUMENTE);
    expect(werkzeug.minItems).toBe(0);
  });

  it("sagt ohne Messung, woher die Lage kommt, und ohne Marktdaten, dass die Liste leer bleibt", () => {
    const auftrag = objektTexteAnweisung({ ...quellen, standort: [], markt: [] });
    expect(auftrag).toContain("Die Umgebung der Adresse ist nicht gemessen");
    expect(auftrag).toContain("Gib eine leere Liste zurück");
  });
});

describe("Die Marktargumente in der Prüfung", () => {
  const fuenf = Array.from({ length: 5 }, (_, i) => ({ argument: `Argument ${i + 1}. Eine Tatsache dazu.`, beleg: "x" }));
  const markt = (argument: string, beleg = "Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)") => ({ argument, beleg });
  const mitMarkt: ObjektTexteQuellen = { objekt: ["Titel: X"], standort: [], markt: ["Markt Augsburg, Einwohner: 301.033 (Destatis, Stand 07/2026)"], unterlagen: [] };

  it("nimmt drei belegte Argumente an und speichert sie mit", () => {
    const drei = [
      markt("Große Stadt. Augsburg zählt 301.033 Einwohner, Destatis, Stand 07/2026."),
      markt("Gefragter Arbeitsmarkt. Arbeitslosenquote 4,1 Prozent, Destatis, Stand 07/2026."),
      markt("Wertiger Boden. Bodenrichtwert 780 Euro je m², BORIS-D, Stand 06/2026."),
    ];
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: drei }, mitMarkt);
    expect(geprueft.marktargumente).toHaveLength(3);
    expect(geprueft.beanstandungen).toEqual([]);
    const texte = baueObjektTexte({ geprueft, quellen: mitMarkt, modell: "m" });
    expect(objektTexteAusMeta(objektTexteInMeta({}, texte))?.marktargumente).toHaveLength(3);
  });

  it("schneidet mehr als drei ab und meldet fehlende Belege", () => {
    const vier = [markt("Eins."), markt("Zwei."), markt("Drei.", " "), markt("Vier.")];
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: vier }, mitMarkt);
    expect(geprueft.marktargumente).toHaveLength(3);
    const alles = geprueft.beanstandungen.join(" ");
    expect(alles).toContain("4 Marktargumente zurück");
    expect(alles).toContain("Marktargument ohne Beleg");
  });

  it("meldet Marktargumente ohne Marktdaten, und zu wenige, wenn es Marktdaten gab", () => {
    const ohneDaten = pruefeObjektTexte(
      { kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: [markt("Erfunden.")] },
      { ...mitMarkt, markt: [] },
    );
    expect(ohneDaten.beanstandungen.join(" ")).toContain("keine Marktdaten");
    const zuWenig = pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: [] }, mitMarkt);
    expect(zuWenig.beanstandungen.join(" ")).toContain("nur 0 von 3 Marktargumenten");
    // Ohne Marktdaten und ohne Marktargumente ist alles in Ordnung.
    const still = pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: [] }, { ...mitMarkt, markt: [] });
    expect(still.beanstandungen).toEqual([]);
  });
});

describe("Die Versprechen-Prüfung und belegte Vergangenheit", () => {
  const fuenf = Array.from({ length: 5 }, (_, i) => ({ argument: `Argument ${i + 1}. Eine Tatsache dazu.`, beleg: "x" }));
  const pruefe = (argument: string) =>
    pruefeObjektTexte({ kurzbeschreibung: "Text.", standortargumente: fuenf, marktargumente: [{ argument, beleg: "Markt" }] }).beanstandungen
      .filter((b) => b.startsWith("Marktargument 1"));

  it("lässt eine belegte Angabe über die Vergangenheit mit Quelle durch", () => {
    expect(istBelegteVergangenheit("Die Mietsteigerung lag seit 2019 bei 12 Prozent, BBSR, Stand 2024.", 2026)).toBe(true);
    expect(pruefe("Gefragte Lage. Mietsteigerung von 12 Prozent seit 2019, BBSR, Stand 2024.")).toEqual([]);
    expect(pruefe("Wachsende Stadt. 2,6 Prozent mehr Einwohner in fünf Jahren, Destatis, Stand 2024.")).toEqual([]);
  });

  it("meldet weiter jede Zusage und jede Vorhersage", () => {
    expect(pruefe("Die Mieten werden weiter steigen, laut BBSR, Stand 2024.").join(" ")).toContain("sagt eine Entwicklung voraus");
    expect(pruefe("Wertsteigerung garantiert, Stand 2024.").join(" ")).toContain("Wertsteigerung");
    expect(pruefe("Mietsteigerung in den kommenden Jahren erwartet.").join(" ")).toContain("steigende Mieten");
    // Ohne Quelle ist es keine belegte Angabe.
    expect(pruefe("Mietsteigerung seit 2019.").join(" ")).toContain("steigende Mieten");
    // Rendite bleibt immer verboten, auch mit Quelle.
    expect(pruefe("Rendite 2024 laut Destatis, Stand 2024.").join(" ")).toContain("Rendite");
    // Eine Jahreszahl in der Zukunft ist keine Vergangenheit.
    expect(istBelegteVergangenheit("Wertzuwachs bis 2030 laut BBSR, Stand 2024.", 2026)).toBe(false);
  });
});

/** Ein Objekt nur mit `meta`, so wie die Anzeige es liest. */
const nurMeta = (meta: Record<string, unknown>) => ({ meta }) as Parameters<typeof anzuzeigendeObjektTexte>[0];

describe("Das gepflegte Feld meta.marktargumente", () => {
  const erzeugt = (argumente: string[]) => baueObjektTexte({
    geprueft: pruefeObjektTexte({
      kurzbeschreibung: "Neu.",
      standortargumente: Array.from({ length: 5 }, (_, i) => ({ argument: `Neu ${i + 1}.`, beleg: "x" })),
      marktargumente: argumente.map((argument) => ({ argument, beleg: "Markt" })),
    }),
    quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
    modell: "m",
  });
  const alt = erzeugt(["Alt Markt eins."]);

  it("füllt ein leeres Feld und ersetzt den vorigen automatischen Wortlaut", () => {
    expect(texteInGepflegteFelder({}, alt).marktargumente).toEqual(["Alt Markt eins."]);
    const meta = objektTexteInMeta(texteInGepflegteFelder({}, alt), alt);
    const neu = erzeugt(["Neu Markt eins.", "Neu Markt zwei."]);
    expect(texteInGepflegteFelder(meta, neu).marktargumente).toEqual(["Neu Markt eins.", "Neu Markt zwei."]);
  });

  it("lässt einen von Hand geschriebenen Text stehen", () => {
    const meta = { marktargumente: ["Selbst geschrieben."], [OBJEKT_TEXTE_META_SCHLUESSEL]: alt };
    expect(vonHandGepflegt(meta).marktargumente).toBe(true);
    expect(texteInGepflegteFelder(meta, erzeugt(["Neu."])).marktargumente).toEqual(["Selbst geschrieben."]);
  });

  it("nimmt einen automatischen Wortlaut weg, wenn der neue Lauf keine Marktdaten hatte", () => {
    const meta = objektTexteInMeta(texteInGepflegteFelder({}, alt), alt);
    const ohneMarkt = texteInGepflegteFelder(meta, erzeugt([]));
    expect(ohneMarkt).not.toHaveProperty("marktargumente");
  });

  it("zeigt die Herkunft der Marktargumente getrennt an", () => {
    const meta = objektTexteInMeta(texteInGepflegteFelder({}, alt), alt);
    expect(anzuzeigendeObjektTexte(nurMeta(meta))).toMatchObject({
      marktargumente: ["Alt Markt eins."],
      marktargumenteHerkunft: "automatisch",
    });
    const vonHand = anzuzeigendeObjektTexte(nurMeta({ ...meta, marktargumente: ["Von Hand."] }));
    expect(vonHand.marktargumenteHerkunft).toBe("gepflegt");
    // Aus dem Stand, wenn das Feld leer blieb.
    const nurStand = anzuzeigendeObjektTexte(nurMeta(objektTexteInMeta({}, alt)));
    expect(nurStand.marktargumente).toEqual(["Alt Markt eins."]);
  });
});

describe("Der Fehlervermerk am Objekt", () => {
  it("steht neben dem Text und nimmt ihn nicht weg", () => {
    const meta = objektTexteInMeta({ kurzbeschreibung: "Ein Haus." }, VORSCHLAG);
    const mitFehler = letztenFehlerInMeta(meta, { grund: "Status 400", status: 502, jetzt: new Date("2026-09-23T18:00:00Z") });
    expect(letzterFehlerAusMeta(mitFehler)).toEqual({
      zeitpunkt: "2026-09-23T18:00:00.000Z",
      grund: "Status 400",
      status: 502,
      version: OBJEKT_TEXTE_FUNKTION_VERSION,
    });
    expect(objektTexteAusMeta(mitFehler)?.kurzbeschreibung).toBe(VORSCHLAG.kurzbeschreibung);
    expect(mitFehler.kurzbeschreibung).toBe("Ein Haus.");
  });

  it("gilt allein nicht als Stand, und ein neuer Lauf nimmt ihn wieder weg", () => {
    const nurFehler = letztenFehlerInMeta({}, { grund: "Status 400" });
    expect(objektTexteAusMeta(nurFehler)).toBeUndefined();
    expect(letzterFehlerAusMeta(nurFehler)?.grund).toBe("Status 400");
    const danach = objektTexteInMeta(nurFehler, VORSCHLAG);
    expect(letzterFehlerAusMeta(danach)).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Fassung 4, 23.09.2026 spät (Christian): Die Kurzbeschreibung handelt nur
// vom Objekt, ohne Kennzahlen. Die Standortargumente handeln nur vom Standort,
// mit Beschäftigung, belegten Arbeitgebern und der gemessenen Umgebung.
// ───────────────────────────────────────────────────────────────────────────

describe("Fassung 4: der Auftrag trennt Objekt und Standort", () => {
  const messung = {
    schema: 2,
    genauigkeit: "adresse",
    lage: { stadtteil: "Göggingen" },
    mikrolage: {
      kliniken: [{ name: "Universitätsklinikum", typ: "Krankenhaus", entfernung_m: 1800 }],
      gewerbe: [{ name: "Gewerbegebiet Süd", typ: "Industrie- und Gewerbegebiet", entfernung_m: 2400 }],
      oepnv: [{ name: "Haltestelle Musterweg", typ: "Straßenbahn", entfernung_m: 150 }],
    },
  };
  const quellen: ObjektTexteQuellen = {
    objekt: objektQuellen(objektZeile),
    standort: standortQuellen(messung),
    markt: ["Markt Augsburg, Arbeitslosenquote: 4,1 Prozent (Destatis, Stand 07/2026)"],
    unterlagen: [],
  };
  const auftrag = objektTexteAnweisung(quellen);

  it("hält die Kurzbeschreibung beim Objekt und ohne Kennzahlen", () => {
    expect(auftrag).toContain("DIE KURZBESCHREIBUNG: NUR DAS OBJEKT");
    expect(auftrag).toContain("Objektart, Zustand, Sanierung und Modernisierung, Ausstattung, Vermietungssituation");
    expect(auftrag).toContain("Keine Kennzahlen. Kein Kaufpreis, keine Miete, keine Rendite, keine Wohnfläche");
    expect(auftrag).toContain("Lage und Umgebung gehören in die Standortargumente");
    const beschreibung = OBJEKT_TEXTE_WERKZEUG.function.parameters.properties.kurzbeschreibung.description;
    expect(beschreibung).toContain("höchstens 1000 Zeichen, gern weniger");
    expect(beschreibung).toContain("Keine Kennzahlen");
  });

  it("macht die Standortargumente am Standort fest, nicht am Objekt, mit Wirtschaft und Arbeit zuerst", () => {
    expect(auftrag).toContain(`DIE ${ANZAHL_STANDORTARGUMENTE} STANDORTARGUMENTE: NUR DER STANDORT`);
    expect(auftrag).toContain("nie vom Gebäude, seiner Ausstattung oder seinem Zustand");
    expect(auftrag).toContain("Gibt es Tatsachen zu Wirtschaft und Arbeit, steht ein Argument dazu an erster Stelle");
    expect(OBJEKT_TEXTE_WERKZEUG.function.parameters.properties.standortargumente.description).toContain("nie über das Gebäude");
    // Die gemessenen Arbeitsorte stehen als Tatsachen im Auftrag.
    expect(auftrag).toContain("Kliniken in der Nähe: Universitätsklinikum (Krankenhaus, 1,8 km Luftlinie)");
    expect(auftrag).toContain("Gewerbe- und Industrieflächen, Arbeitsorte in der Nähe: Gewerbegebiet Süd");
    expect(auftrag).toContain("Stadtteil laut OpenStreetMap: Göggingen");
  });

  it("verbietet modellierte Arbeitgeber und Beschäftigtenzahlen ohne Beleg", () => {
    expect(auftrag).toContain("Arbeitgeber nennst du nur, wenn sie in den Tatsachen stehen");
    expect(auftrag).toContain("Nie aus dem Gedächtnis, auch keine bekannten Unternehmen der Region");
    expect(auftrag).toContain("Keine Beschäftigtenzahl, keinen Rang");
    // Die geschätzte Liste aus `enrich-arbeitgeber` (quelle "ai") kommt gar nicht erst in die Tatsachen.
    const zeilen = marktQuellen({
      standort: { id: "s1", name: "Augsburg" },
      zuordnung: { art: "ort", kandidaten: [{ id: "s1", name: "Augsburg" }] },
      kennzahlen: [],
      arbeitgeber: [{ standort_id: "s1", name: "Erfundene Werke AG", mitarbeiter: 44000, quelle: "ai" }],
    });
    expect(zeilen.join("\n")).not.toContain("Erfundene Werke");
  });

  it("verlangt Du-Form und keine Gedankenstriche, und die Beschäftigungslage nur einmal", () => {
    expect(auftrag).toContain("Wo du den Leser ansprichst, dann mit du");
    expect(auftrag).toContain("Keine Gedankenstriche");
    expect(auftrag).toContain("Dieselbe Zahl steht dann nicht noch einmal in einem Marktargument");
  });

  it("passt die Anweisung zu Entfernungen an die Genauigkeit der Messung an", () => {
    const ab = (genauigkeit: string) =>
      objektTexteAnweisung({ ...quellen, standort: standortQuellen({ ...messung, genauigkeit, lage: { plz: "86150", ort: "Augsburg" } }) });
    expect(auftrag).toContain("Die Umgebung ist ab der Hausadresse gemessen");
    expect(ab("strasse")).toContain("Übernimm die Entfernungen mit „rund“");
    expect(ab("plz")).toContain("Nenne deshalb keine Entfernung zum Haus");
    expect(ab("ort")).toContain("Nenne deshalb keine Entfernung zum Haus");
  });
});

describe("Fassung 4: Tatsachen je Genauigkeit der Messung", () => {
  const mikrolage = { einkaufen: [{ name: "Supermarkt Nord", typ: "Supermarkt", entfernung_m: 280 }] };

  it("nennt ab der Straße nur ungefähre Entfernungen", () => {
    const zeilen = standortQuellen({ schema: 2, genauigkeit: "strasse", mikrolage }).join("\n");
    expect(zeilen).toContain("Umgebung gemessen ab der Straße");
    expect(zeilen).toContain("Supermarkt Nord (Supermarkt, rund 300 m Luftlinie)");
  });

  it("nennt ab Postleitzahl oder Ortsmitte gar keine Entfernung", () => {
    const zeilen = standortQuellen({ schema: 2, genauigkeit: "plz", lage: { plz: "81927" }, mikrolage }).join("\n");
    expect(zeilen).toContain("Mittelpunkt des Postleitzahlgebiets 81927, nicht ab der Hausadresse");
    expect(zeilen).toContain("Einkaufen im Postleitzahlgebiet: Supermarkt Nord (Supermarkt)");
    expect(zeilen).not.toMatch(/\d+ m Luftlinie/);
  });

  it("kennzeichnet, was erst im erweiterten Umkreis gefunden wurde", () => {
    const zeilen = standortQuellen({ schema: 2, genauigkeit: "adresse", erweiterter_umkreis: ["einkaufen"], mikrolage }).join("\n");
    expect(zeilen).toContain("Einkaufen im weiteren Umkreis: Supermarkt Nord");
  });

  it("nimmt die Vermietung nur auf, wenn Einheiten als vermietet geführt sind", () => {
    expect(objektQuellen(objektZeile, [{ vermietet: true }, { vermietet: true }, { vermietet: false }]).join("\n"))
      .toContain("Vermietet laut Einheitendaten: 2 von 3 Einheiten");
    // „0 von 3 vermietet“ wäre falsch, wenn Investagon nur keinen Mietstatus liefert.
    expect(objektQuellen(objektZeile, [{ vermietet: false }, { vermietet: false }]).join("\n")).not.toContain("Vermietet");
  });
});

describe("Fassung 4: Prüfung der Antwort", () => {
  const fuenf = (beleg = "ÖPNV in der Nähe: Haltestelle Musterweg") =>
    Array.from({ length: 5 }, (_, i) => ({ argument: `Argument ${i + 1}. Eine Tatsache zum Standort.`, beleg }));

  it("meldet Kennzahlen in der Kurzbeschreibung", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Helle 3-Zimmer-Wohnung mit 68 m² für 249.000 €, Energiekennwert 95 kWh.",
      standortargumente: fuenf(),
    });
    const alles = geprueft.beanstandungen.join(" ");
    expect(alles).toContain("Kurzbeschreibung nennt eine Fläche");
    expect(alles).toContain("Kurzbeschreibung nennt einen Betrag");
    expect(alles).toContain("Kurzbeschreibung nennt eine Zimmerzahl");
    expect(alles).toContain("Kurzbeschreibung nennt einen Energiekennwert");
  });

  it("lässt eine Beschreibung ohne Kennzahlen, nur mit Sanierungsjahr, unbeanstandet", () => {
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "2021 kernsaniert, mit neuem Dach und neuen Fenstern. Die Einheit ist vermietet und möbliert.",
      standortargumente: fuenf(),
    });
    expect(geprueft.beanstandungen).toEqual([]);
  });

  it("meldet ein Standortargument, das sich auf eine Objektangabe stützt", () => {
    const geprueft = pruefeObjektTexte({ kurzbeschreibung: "Ein Haus.", standortargumente: fuenf("Baujahr: 1962") });
    expect(geprueft.beanstandungen.join(" ")).toContain("stützt sich auf eine Objektangabe");
  });

  it("meldet eine Beschäftigtenzahl, die nicht in den Tatsachen steht, und lässt eine belegte durch", () => {
    const quellen: ObjektTexteQuellen = {
      objekt: ["Titel: X"],
      standort: [],
      markt: ["Markt Augsburg, große Arbeitgeber laut Bundesagentur für Arbeit: Klinikum (Gesundheit, rund 5.000 Beschäftigte)"],
      unterlagen: [],
    };
    const erfunden = pruefeObjektTexte(
      { kurzbeschreibung: "Ein Haus.", standortargumente: [{ argument: "Starker Arbeitgeber. BMW mit 44.000 Mitarbeitern in der Region.", beleg: "x" }] },
      quellen,
    );
    expect(erfunden.beanstandungen.join(" ")).toContain("„44.000 Mitarbeitern“ steht so nicht in den Angaben");
    const belegt = pruefeObjektTexte(
      { kurzbeschreibung: "Ein Haus.", standortargumente: [{ argument: "Sichere Arbeitsplätze. Das Klinikum hat rund 5.000 Beschäftigte.", beleg: "x" }] },
      quellen,
    );
    expect(belegt.beanstandungen.join(" ")).not.toContain("Beschäftigtenzahlen nur mit Beleg");
  });

  it("nimmt Gedankenstriche heraus, statt sie stehen zu lassen", () => {
    expect(ohneGedankenstriche("Saniert 2019–2021 – mit neuem Dach")).toBe("Saniert 2019 bis 2021, mit neuem Dach");
    expect(ohneGedankenstriche("Nord—Süd-Achse")).toBe("Nord-Süd-Achse");
    const geprueft = pruefeObjektTexte({
      kurzbeschreibung: "Ein Haus am Park – frisch saniert.",
      standortargumente: [{ argument: "Kurze Wege — Supermarkt in 280 m.", beleg: "x" }],
    });
    expect(geprueft.kurzbeschreibung).toBe("Ein Haus am Park, frisch saniert.");
    expect(geprueft.standortargumente[0].argument).toBe("Kurze Wege, Supermarkt in 280 m.");
  });
});

describe("Fassung 4: Vermerk zur Umgebung statt Beanstandung", () => {
  it("wird mitgespeichert und defensiv gelesen", () => {
    const texte = baueObjektTexte({
      geprueft: pruefeObjektTexte({ kurzbeschreibung: "Ein Haus.", standortargumente: [] }),
      quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
      modell: "m",
      umgebung: { gemessen: false, grund: "Overpass weg.", art: "dienst" },
    });
    expect(objektTexteAusMeta(objektTexteInMeta({}, texte))?.umgebung).toEqual({ gemessen: false, grund: "Overpass weg.", art: "dienst" });
    const kaputt = { [OBJEKT_TEXTE_META_SCHLUESSEL]: { ...texte, umgebung: { gemessen: "ja", genauigkeit: "irgendwo" } } };
    expect(objektTexteAusMeta(kaputt)?.umgebung).toBeUndefined();
  });
});

describe("Fassung 4: der Investagon-Freitext im Feld ist keine Handarbeit", () => {
  const extras = [
    { weight: 2, value: "Zweiter Absatz." },
    { weight: 1, value: "Erster Absatz über das Haus." },
  ];
  const kopie = "Erster Absatz über das Haus.\n\nZweiter Absatz.";
  const meta = { kurzbeschreibung: kopie, investagonRaw: { extras } };

  it("erkennt die Kopie aus dem alten Pflegedialog, auch mit anderem Leerraum", () => {
    expect(istInvestagonKopie(meta, kopie)).toBe(true);
    expect(istInvestagonKopie(meta, "Erster Absatz über das Haus.  Zweiter Absatz.")).toBe(true);
    expect(istInvestagonKopie(meta, "Erster Absatz über das Haus, von Hand ergänzt.")).toBe(false);
    expect(istInvestagonKopie({}, kopie)).toBe(false);
  });

  it("lässt den neuen Lauf die Kopie ersetzen, einen getippten Text aber nie", () => {
    const neu = baueObjektTexte({
      geprueft: pruefeObjektTexte({ kurzbeschreibung: "Neue Beschreibung.", standortargumente: [] }),
      quellen: { objekt: ["Titel: X"], standort: [], unterlagen: [] },
      modell: "m",
    });
    expect(vonHandGepflegt(meta).kurzbeschreibung).toBe(false);
    expect(texteInGepflegteFelder(meta, neu).kurzbeschreibung).toBe("Neue Beschreibung.");
    const getippt = { ...meta, kurzbeschreibung: "Von Hand geschrieben." };
    expect(texteInGepflegteFelder(getippt, neu).kurzbeschreibung).toBe("Von Hand geschrieben.");
  });

  it("zeigt bis zum neuen Lauf den erzeugten Text statt der Kopie, sonst die Kopie als Investagon", () => {
    const mitVorschlag = anzuzeigendeObjektTexte({ meta: { ...meta, [OBJEKT_TEXTE_META_SCHLUESSEL]: VORSCHLAG } } as Parameters<typeof anzuzeigendeObjektTexte>[0]);
    expect(mitVorschlag.kurzbeschreibung).toBe(VORSCHLAG.kurzbeschreibung);
    expect(mitVorschlag.kurzbeschreibungHerkunft).toBe("automatisch");
    const ohne = anzuzeigendeObjektTexte({ meta } as Parameters<typeof anzuzeigendeObjektTexte>[0]);
    expect(ohne.kurzbeschreibung).toBe(kopie);
    expect(ohne.kurzbeschreibungHerkunft).toBe("investagon");
  });
});
