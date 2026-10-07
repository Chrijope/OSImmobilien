/**
 * Die Objekte aus Investagon, Stand 06.08.2026.
 *
 * Ausgelesen aus der Berateransicht unter more-immo.investagon.com, weil die
 * API noch keine Leseberechtigung hat. Sobald `ROLE_PERMISSION_PROPERTY_VIEW`
 * freigeschaltet ist, wird diese Datei überflüssig: Dann holt der Sync die
 * Daten selbst, samt Bildern und Dokumenten, und hält sie aktuell.
 *
 * Zwei Angaben weichen bewusst von Investagon ab, beide auf Ansage:
 *
 *   Crailsheim hatte dort die Postleitzahl 04177. Das ist Leipzig, rund
 *   400 Kilometer daneben, und jede Karte hätte das Objekt dort angezeigt.
 *   Richtig ist 74564.
 *
 *   Crailsheim hatte gar keine Straße hinterlegt. Eingetragen ist jetzt
 *   Baltische Straße 1 bis 5.
 *
 * Die Bezeichnungen der Wohneinheiten in Flehingen fehlten in Investagon und
 * sind hier von 01 an durchnummeriert. Bei Crailsheim standen sie in der
 * Tabelle und sind übernommen: 1b, 5b, 6a und so fort.
 *
 * Die Beschreibungen sind erzeugt, nicht getextet.
 *
 * Mikro- und Makrolage stammen Wort für Wort aus OpenStreetMap: "Supermarkt in
 * 300 Metern" ist gemessen, nicht behauptet. Adjektive wie "hervorragende
 * Nahversorgung" fliegen im Beratungsgespräch auf, sobald jemand nachschaut,
 * eine Entfernung nicht.
 *
 * Region und Arbeitgeber sind je Standort einmal recherchiert und mit
 * Jahresangabe versehen. Wo nichts belegt ist, steht auch nichts: Crailsheim
 * und Flehingen haben deshalb keinen Arbeitgeber-Absatz. Eine erfundene Zahl
 * in einer Verkaufsunterlage ist keine Ungenauigkeit, sondern eine
 * Falschangabe.
 */

export interface ImportEinheit {
  investagonId?: string;
  roh?: Record<string, unknown>;
  stellplatzPreis?: number;
  gemeinschaft?: number;
  we: string;
  qm: number;
  zi: number;
  miete: number;
  qmPreis: number;
  kp: number;
  moebel: number;
  geschoss?: string;
  stellplatzMiete?: number;
  /** Felder der Objektseite, nur wenn die API sie liefert. */
  stadtteil?: string;
  sanierungsjahr?: number;
  sanierungAnteilProzent?: number;
  sanierungAnteilBetrag?: number;
}

export interface ImportProjekt {
  roh?: Record<string, unknown>;
  slug: string;
  name: string;
  adresse: string;
  plz: string;
  ort: string;
  art: string;
  anlageklasse: string;
  bauzustand: string;
  baujahr?: number;
  foerderung?: string;
  einheiten: ImportEinheit[];
  /** Fertige Objektbeschreibung, siehe Kopf dieser Datei. */
  beschreibung: string;
}

export const PROJEKTE: ImportProjekt[] = [
  {
    "slug": "54ln6l8x",
    "name": "Karl-Marx-Ring 96",
    "adresse": "Karl-Marx-Ring 96",
    "plz": "81735",
    "ort": "München",
    "art": "einzelwohnung",
    "einheiten": [
      {
        "we": "WE205",
        "qm": 69.49,
        "zi": 4,
        "miete": 3050,
        "qmPreis": 9599,
        "kp": 667000,
        "gemeinschaft": 0,
        "moebel": 18000
      }
    ],
    "anlageklasse": "WG-Wohnung",
    "bauzustand": "Sanierung",
    "baujahr": 1971,
    "beschreibung": "## Das Objekt\nWG-Wohnung in 81735 München, Karl-Marx-Ring 96.\nSanierung und Baujahr 1971.\n\n## Mikrolage\nZu Fuß erreichbar sind Haltestelle in 150 m, Supermarkt in 300 m, Bäcker in 400 m, Kindergarten in 450 m, Apotheke in 500 m, Arzt in 550 m und Bank in 600 m.\nDamit liegen 6 Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.\n\n## Makrolage\nDas Objekt liegt im Stadtbezirk Ramersdorf-Perlach von München, innerhalb der Metropolregion München.\nIm weiteren Umkreis: Schule in 600 m, Bahnhof in 850 m, Klinik in 900 m und Autobahnauffahrt in 3,3 km.\nMünchner Wohnungsmarkt mit anhaltend hoher Nachfrage.\n\n## Investment auf einen Blick\n- Kaufpreis: 685.000 €\n- Wohnfläche: 69,49 m²\n- Kaltmiete: 3.050 € im Monat\n- Bruttorendite: 5,34 %"
  },
  {
    "slug": "nxpzrpy4",
    "name": "Jamnitzer 8",
    "adresse": "Jamnitzer Straße 8",
    "plz": "90429",
    "ort": "Nürnberg",
    "art": "einzelwohnung",
    "einheiten": [
      {
        "we": "01",
        "geschoss": "DG",
        "qm": 55.55,
        "zi": 3,
        "miete": 1370,
        "stellplatzMiete": 0,
        "qmPreis": 5653,
        "kp": 328000,
        "gemeinschaft": 0,
        "moebel": 0
      }
    ],
    "anlageklasse": "WG-Wohnung",
    "bauzustand": "Sanierung",
    "baujahr": 1900,
    "beschreibung": "## Das Objekt\nWG-Wohnung in 90429 Nürnberg, Jamnitzer Straße 8.\nSanierung und Baujahr 1900.\n\n## Mikrolage\nZu Fuß erreichbar sind Kindergarten in 50 m, Supermarkt in 150 m, Apotheke in 200 m, Arzt in 200 m, Bäcker in 250 m, Bank in 250 m und Haltestelle in 250 m.\nDamit liegen 7 Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.\n\n## Makrolage\nDas Objekt liegt im Stadtteil Gostenhof-West von Nürnberg, innerhalb der Metropolregion Nürnberg.\nIm weiteren Umkreis: Bahnhof in 200 m, Schule in 300 m, Autobahnauffahrt in 1000 m und Klinik in 1 km.\nInnenstadtnah mit gewachsener Mischnutzung.\n\n## Investment auf einen Blick\n- Kaufpreis: 328.000 €\n- Wohnfläche: 55,55 m²\n- Kaltmiete: 1.370 € im Monat\n- Bruttorendite: 5,01 %"
  },
  {
    "slug": "p4z5mpo4",
    "name": "Tucholsky 10",
    "adresse": "Tucholsky Straße 10",
    "plz": "81737",
    "ort": "München",
    "art": "einzelwohnung",
    "einheiten": [
      {
        "we": "WE1304",
        "geschoss": "EG",
        "qm": 69.8,
        "zi": 4,
        "miete": 3060,
        "stellplatzMiete": 60,
        "qmPreis": 9004,
        "kp": 671500,
        "gemeinschaft": 0,
        "moebel": 0
      }
    ],
    "anlageklasse": "WG-Wohnung",
    "bauzustand": "Sanierung",
    "baujahr": 1975,
    "beschreibung": "## Das Objekt\nWG-Wohnung in 81737 München, Tucholsky Straße 10.\nSanierung und Baujahr 1975.\n\n## Mikrolage\nZu Fuß erreichbar sind Kindergarten in 200 m, Arzt in 250 m, Supermarkt in 250 m, Bäcker in 250 m, Apotheke in 300 m, Haltestelle in 350 m und Bank in 500 m.\nDamit liegen 7 Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.\n\n## Makrolage\nDas Objekt liegt im Stadtbezirk Ramersdorf-Perlach von München, innerhalb der Metropolregion München.\nIm weiteren Umkreis: Klinik in 450 m, Bahnhof in 600 m, Schule in 750 m und Autobahnauffahrt in 2,8 km.\nMünchner Wohnungsmarkt mit anhaltend hoher Nachfrage.\n\n## Investment auf einen Blick\n- Kaufpreis: 671.500 €\n- Wohnfläche: 69,8 m²\n- Kaltmiete: 3.060 € im Monat\n- Bruttorendite: 5,47 %"
  },
  {
    "slug": "d4koggj2",
    "name": "Arberg",
    "adresse": "Industriestraße",
    "plz": "91722",
    "ort": "Arberg",
    "baujahr": 2026,
    "bauzustand": "Neubau",
    "foerderung": "KfW Klimafreundlicher Neubau",
    "art": "mehrfamilie",
    "einheiten": [
      {
        "we": "1",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4115,
        "kp": 539000,
        "gemeinschaft": 0,
        "moebel": 0
      },
      {
        "we": "2",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4191,
        "kp": 549000,
        "gemeinschaft": 0,
        "moebel": 0
      },
      {
        "we": "3",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4267,
        "kp": 559000,
        "gemeinschaft": 0,
        "moebel": 0
      },
      {
        "we": "4",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4038,
        "kp": 529000,
        "gemeinschaft": 0,
        "moebel": 0
      },
      {
        "we": "5",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4267,
        "kp": 559000,
        "gemeinschaft": 0,
        "moebel": 0
      },
      {
        "we": "6",
        "qm": 131,
        "zi": 4,
        "miete": 1507,
        "qmPreis": 4565,
        "kp": 598000,
        "gemeinschaft": 0,
        "moebel": 0
      }
    ],
    "anlageklasse": "Eigentumswohnung",
    "beschreibung": "## Das Objekt\n6 Wohneinheiten in 91722 Arberg, Industriestraße.\nAnlageklasse Eigentumswohnung, Neubau und Baujahr 2026.\nGefördert als KfW Klimafreundlicher Neubau.\n\n## Mikrolage\nZu Fuß erreichbar sind Bank in 100 m, Haltestelle in 150 m, Bäcker in 350 m, Kindergarten in 400 m und Arzt in 450 m.\nDamit liegen 5 Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.\n\n## Makrolage\nArberg liegt im Landkreis Ansbach in Mittelfranken und ist an die Metropolregion Nürnberg angebunden.\nIm weiteren Umkreis: Schule in 400 m und Bahnhof in 7 km.\nFränkisches Seenland als Naherholungsgebiet vor der Haustür.\n\n## Wirtschaft und Arbeitgeber\nÜber 5.000 Betriebe im Landkreis und drei Hochschulen in Ansbach tragen die Wirtschaft der Region (Stand 2026).\n\n## Investment auf einen Blick\n- Kaufpreis: 529.000 € bis 598.000 €\n- Wohnfläche: 131 m²\n- Kaltmiete: 1.507 € im Monat\n- Bruttorendite: 3,02 % bis 3,42 %\n- 6 Einheiten, zusammen 3.333.000 €"
  },
  {
    "slug": "643elg5x",
    "name": "Crailsheim",
    "adresse": "Baltische Straße 1 - 5",
    "plz": "74564",
    "ort": "Crailsheim",
    "art": "mehrfamilie",
    "einheiten": [
      {
        "we": "1b",
        "geschoss": "1",
        "zi": 3,
        "miete": 884,
        "qmPreis": 6449,
        "kp": 380000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 58.92
      },
      {
        "we": "5b",
        "geschoss": "1",
        "zi": 3,
        "miete": 884,
        "qmPreis": 6449,
        "kp": 380000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 58.92
      },
      {
        "we": "6a",
        "zi": 2,
        "miete": 575,
        "qmPreis": 6781,
        "kp": 260000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 38.34
      },
      {
        "we": "6b",
        "geschoss": "0",
        "zi": 4,
        "miete": 1232,
        "qmPreis": 5601,
        "kp": 460000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 82.13
      },
      {
        "we": "7a",
        "zi": 2,
        "miete": 583,
        "qmPreis": 6636,
        "kp": 258000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 38.88
      },
      {
        "we": "7b",
        "geschoss": "0",
        "zi": 4,
        "miete": 1249,
        "qmPreis": 5286,
        "kp": 440000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 83.24
      },
      {
        "we": "8a",
        "zi": 2,
        "miete": 583,
        "qmPreis": 6173,
        "kp": 240000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 38.88
      },
      {
        "we": "8b",
        "geschoss": "0",
        "zi": 4,
        "miete": 1249,
        "qmPreis": 5286,
        "kp": 440000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 83.24
      },
      {
        "we": "9a",
        "zi": 2,
        "miete": 583,
        "qmPreis": 6173,
        "kp": 240000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 38.88
      },
      {
        "we": "9b",
        "geschoss": "0",
        "zi": 4,
        "miete": 1249,
        "qmPreis": 5286,
        "kp": 440000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 83.24
      },
      {
        "we": "10a",
        "zi": 2,
        "miete": 575,
        "qmPreis": 6781,
        "kp": 260000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 38.34
      },
      {
        "we": "10b",
        "geschoss": "0",
        "zi": 4,
        "miete": 1232,
        "qmPreis": 5601,
        "kp": 460000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 82.13
      }
    ],
    "anlageklasse": "Eigentumswohnung",
    "bauzustand": "Neubau",
    "beschreibung": "## Das Objekt\n12 Wohneinheiten in 74564 Crailsheim, Baltische Straße 1 - 5.\nAnlageklasse Eigentumswohnung, Neubau.\n\n## Mikrolage\nZu Fuß erreichbar sind Haltestelle in 300 m, Kindergarten in 300 m, Bäcker in 750 m, Arzt in 850 m, Bank in 850 m, Apotheke in 850 m und Supermarkt in 950 m.\n\n## Makrolage\nCrailsheim liegt im Landkreis Schwäbisch Hall in Baden-Württemberg und ist an den Wirtschaftsraum Heilbronn-Franken angebunden.\nIm weiteren Umkreis: Schule in 350 m, Bahnhof in 1,7 km, Klinik in 1,8 km und Autobahnauffahrt in 6,7 km.\nMittelzentrum mit eigenem Bahnanschluss.\n\n## Investment auf einen Blick\n- Kaufpreis: 240.000 € bis 460.000 €\n- Wohnfläche: 38,34 m² bis 83,24 m²\n- Kaltmiete: 575 € im Monat bis 1.249 € im Monat\n- Bruttorendite: 2,65 % bis 3,41 %\n- 12 Einheiten, zusammen 4.258.000 €"
  },
  {
    "slug": "nxjev574",
    "name": "Quartier F24",
    "adresse": "Feigenbutzstraße",
    "plz": "75038",
    "ort": "Flehingen",
    "art": "mehrfamilie",
    "einheiten": [
      {
        "we": "01",
        "zi": 2,
        "miete": 687,
        "qmPreis": 6086,
        "kp": 246000,
        "gemeinschaft": 0,
        "moebel": 12000,
        "qm": 40.42
      },
      {
        "we": "02",
        "geschoss": "1",
        "zi": 4,
        "miete": 1189,
        "qmPreis": 5651,
        "kp": 448000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 79.28
      },
      {
        "we": "03",
        "zi": 2,
        "miete": 687,
        "qmPreis": 6333,
        "kp": 256000,
        "gemeinschaft": 0,
        "moebel": 12000,
        "qm": 40.42
      },
      {
        "we": "04",
        "geschoss": "1",
        "zi": 4,
        "miete": 1189,
        "qmPreis": 5651,
        "kp": 448000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 79.28
      },
      {
        "we": "05",
        "zi": 2,
        "miete": 687,
        "qmPreis": 6333,
        "kp": 256000,
        "gemeinschaft": 0,
        "moebel": 12000,
        "qm": 40.42
      },
      {
        "we": "06",
        "geschoss": "1",
        "zi": 4,
        "miete": 1189,
        "qmPreis": 5651,
        "kp": 448000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 79.28
      },
      {
        "we": "07",
        "zi": 2,
        "miete": 687,
        "qmPreis": 6086,
        "kp": 246000,
        "gemeinschaft": 0,
        "moebel": 12000,
        "qm": 40.42
      },
      {
        "we": "08",
        "geschoss": "1",
        "zi": 4,
        "miete": 1189,
        "qmPreis": 5525,
        "kp": 438000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 79.28
      },
      {
        "we": "09",
        "zi": 2,
        "miete": 687,
        "qmPreis": 6333,
        "kp": 256000,
        "gemeinschaft": 0,
        "moebel": 12000,
        "qm": 40.42
      },
      {
        "we": "10",
        "geschoss": "1",
        "zi": 4,
        "miete": 1189,
        "qmPreis": 5651,
        "kp": 448000,
        "gemeinschaft": 0,
        "moebel": 0,
        "qm": 79.28
      }
    ],
    "anlageklasse": "Eigentumswohnung",
    "bauzustand": "Neubau",
    "beschreibung": "## Das Objekt\n10 Wohneinheiten in 75038 Flehingen, Feigenbutzstraße.\nAnlageklasse Eigentumswohnung, Neubau.\n\n## Mikrolage\nZu Fuß erreichbar sind Haltestelle in 200 m, Supermarkt in 200 m, Bäcker in 350 m, Bank in 500 m, Kindergarten in 550 m und Apotheke in 600 m.\nDamit liegen 5 Einrichtungen des täglichen Bedarfs in wenigen Gehminuten.\n\n## Makrolage\nFlehingen liegt im Landkreis Karlsruhe in Baden-Württemberg und ist an die TechnologieRegion Karlsruhe angebunden.\nIm weiteren Umkreis: Schule in 450 m, Bahnhof in 750 m und Klinik in 5,3 km.\nKraichgau, zwischen Karlsruhe und Heilbronn gelegen.\n\n## Investment auf einen Blick\n- Kaufpreis: 258.000 € bis 448.000 €\n- Wohnfläche: 40,42 m² bis 79,28 m²\n- Kaltmiete: 687 € im Monat bis 1.189 € im Monat\n- Bruttorendite: 3,08 % bis 3,26 %\n- 10 Einheiten, zusammen 3.550.000 €"
  }
];
