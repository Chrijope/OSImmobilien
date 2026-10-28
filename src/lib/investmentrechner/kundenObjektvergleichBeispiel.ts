/**
 * Beispiel für den persönlichen Objektvergleich: erfundene Kundin mit den
 * Zahlen der Vorlage vom 28.10.2026 (Hauffstraße WE 12/13). Für die lokale
 * Vorschau und als Startstand im Artefakt des Investmentrechners.
 */
import { LEERE_TEXTE, STANDARD_ANNAHMEN, type KundenObjektvergleich } from "./kundenObjektvergleich";

export const BEISPIEL_VERGLEICH: KundenObjektvergleich = {
  version: 1, stand: "2026-10-28", kontaktId: null, investmentId: null, variante: "",
  kunde: {
    anrede: "Frau", vorname: "Anna", nachname: "Muster", netto: 3500, bruttoJahr: 68000, steuerklasse: "I", familienstand: "ledig",
    kinder: "keine", beschaeftigung: "angestellt, unbefristet, seit 2023", antrag: "allein, ohne Mitantragsteller",
    wohnsituation: "zur Miete, 790 € warm", mieteWarm: 790, lebenshaltung: 1000, kredite: "keine", kreditRaten: 0, kapital: 25000,
    jahreBisRente: 40, saDatum: "2026-08-31",
  },
  objekt: {
    strasse: "Hauffstraße 38 c", ortZeile: "14548 Schwielowsee OT Geltow", fotoTitel: "", fotoHaus: "",
    hausPunkte: ["Baujahr 2000, Aufzug, Gasheizung von 2017", "Junge Wohnanlage, rund 350.000 € Instandhaltung 2020 bis 2026"],
    verwaltung: "Beispiel Verwaltung GmbH", vergleichsmieteQm: 14.79, vergleichsmieteQuelle: "Portal", wirtschaftsplan: "Wirtschaftsplan 2027",
  },
  annahmen: STANDARD_ANNAHMEN,
  einheiten: [
    { nr: "12", zimmer: 2, qm: 56, lage: "3. OG links", kpWohnung: 220000, kpListe: 0, garagen: 1, garageKp: 15000, garageMiete1: 80, garageMieteZiel: 150,
      garageIstVon: 40, garageIstBis: 50, mieteIst: 544, mieteSubQm: 13, u: 242.53, n: 81.83, r: 48.65, afaJahre: 32 },
    { nr: "13", zimmer: 3, qm: 72.36, lage: "3. OG rechts", kpWohnung: 270000, kpListe: 0, garagen: 1, garageKp: 15000, garageMiete1: 80, garageMieteZiel: 150,
      garageIstVon: 40, garageIstBis: 50, mieteIst: 900, mieteSubQm: 13, u: 202.8, n: 96.3, r: 62.81, afaJahre: 32 },
  ],
  texte: LEERE_TEXTE,
};

/** ?haeuser: Wohnung B in einem anderen Haus (häuserübergreifend), Zahlen erfunden. */
export const BEISPIEL_HAEUSERUEBERGREIFEND: KundenObjektvergleich = {
  ...BEISPIEL_VERGLEICH,
  objekt2: {
    strasse: "Barfusstraße 12", ortZeile: "13349 Berlin", fotoTitel: "", fotoHaus: "",
    hausPunkte: ["Baujahr 1960, saniert 2024", "Berlin-Wedding, U-Bahn in 5 Minuten"],
    verwaltung: "Beispiel Hausverwaltung Berlin", vergleichsmieteQm: 0, vergleichsmieteQuelle: "", wirtschaftsplan: "Wirtschaftsplan 2026",
  },
  einheiten: [BEISPIEL_VERGLEICH.einheiten[0], {
    nr: "7", zimmer: 2, qm: 61.5, lage: "2. OG", kpWohnung: 229000, kpListe: 0, garagen: 0, garageKp: 0, garageMiete1: 0, garageMieteZiel: 0,
    garageIstVon: 0, garageIstBis: 0, mieteIst: 830.25, mieteSubQm: 13.5, u: 180, n: 75, r: 40, afaJahre: 25, mieteZielQm: 22,
  }],
};

