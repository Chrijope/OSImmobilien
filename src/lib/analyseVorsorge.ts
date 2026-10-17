/**
 * Zwei Wege auf der Analysetool-Ergebnisseite (17.10.2026), gerechnet an
 * echten OS-Wohnungen statt an Objekttypen.
 *
 * - Altersvorsorge: heute eine Wohnung, nach drei und sechs Jahren eine
 *   zweite und dritte, alle behalten und zum Rentenbeginn verkaufen.
 * - Mehr Netto vom Brutto: Steuervorteil derselben Wohnungen.
 *
 * Gerechnet wird jede Wohnung mit dem Exposé-Rechner (`berechneExpose`),
 * nicht mit einer eigenen Steuerlogik. Die Ist-Zahlen je Wohnung stammen aus
 * den Exposés (OSImmobilien Exposés/, Stand 16.10.2026).
 * ponytail: fest wie OBJEKTE in beratungOsDaten; aus „Objekte“ im CRM, sobald
 * die OS-Objekte dort mit Einheiten gepflegt sind.
 */
import { berechneExpose, type ExposeObjektdaten } from "@/lib/exposeRechner";
import { standardAnnahmen } from "@/lib/exposeAnnahmen";
import { tilgungsplan } from "@/lib/finanzierung";
import { RUHESTAND_JAHRE, OBJEKTE, type KonzeptOs } from "@/lib/beratungOsDaten";
import type { AnalysisData } from "@/lib/scoringEngine";

export const VORSORGE_ANNAHMEN = {
  rentenalter: 67,
  kaufAbstandJahre: 3,
  maxWohnungen: 3,
  /** Erst danach ist der Verkauf privat steuerfrei (§ 23 EStG). */
  spekulationsfristJahre: 10,
  verkaufskostenProzent: 4,
  /** Das Kapital wird ohne Zinsen über diese Jahre verteilt, wie in der Beratungspräsentation. */
  ruhestandJahre: RUHESTAND_JAHRE,
} as const;

export interface OsWohnung {
  id: string;
  titel: string;
  ort: string;
  /** Preisrahmen des ganzen Objekts, Text wie in der Präsentation. */
  preisrahmen: string;
  konzept: KonzeptOs;
  bild: string;
  /** Die gerechnete Beispielwohnung. */
  beispiel: string;
  objekt: ExposeObjektdaten;
  afaProzent: number;
  /** Miete je m² im Jahr 2060 laut Exposé-Szenario; daraus die jährliche Mietsteigerung. */
  mieteZiel2060: number;
  nebenkostenTraegtVerkaeufer?: boolean;
}

/** Wie in den Exposés (_Generator/rechner.py): Sollzins, Tilgung, Kauf 2026, Mietszenario bis 2060. */
export const EXPOSE_ZINS_PROZENT = 4.8;
export const EXPOSE_TILGUNG_PROZENT = 1.2;
const KAUFJAHR = 2026;

const praes = (titel: string) => OBJEKTE.find((o) => o.titel === titel)!;

/**
 * Je Objekt eine typische Wohnung, mit denselben Eingaben wie ihr Exposé
 * (Stand 14. bis 16.10.2026, Generator-Daten unter OSImmobilien Exposés/_Generator).
 * Kosten: `hausgeldNichtUmlegbarMonat` ist abziehbar, `ruecklageMonat` nicht,
 * genau wie im Exposé. Wo das Exposé nur die Summe nennt, ist die Aufteilung
 * aus seiner Steuerzeile zurückgerechnet (Barfuß, Brück).
 * Konzept wie in der Präsentation; Brück und Cottbus als kleine
 * Einstiegswohnungen unter Altersvorsorge (Vorschlag, vom Vertrieb zu bestätigen).
 */
export const OS_WOHNUNGEN: OsWohnung[] = [
  {
    id: "barfuss", titel: "Barfusstraße 9", ort: "Berlin-Wedding", preisrahmen: praes("Barfusstraße 9").preis,
    konzept: "steuer", bild: praes("Barfusstraße 9").bilder[0].src, beispiel: "WE 07, 72 m², 2 Zimmer",
    // AfA 5,6 % aus Restnutzungsdauer 18 Jahre, setzt ein anerkanntes Gutachten voraus.
    objekt: { kaufpreis: 374_400, wohnflaeche: 72, kaltmieteMonat: 972, hausgeldNichtUmlegbarMonat: 71.9, ruecklageMonat: 39.4, bundeslandId: "be", kaufnebenkostenProzent: 8, gebaeudeanteilProzent: 93 },
    afaProzent: 5.6, mieteZiel2060: 18,
  },
  {
    id: "hauff", titel: "Hauffstraße 38", ort: "Schwielowsee bei Potsdam", preisrahmen: praes("Hauffstraße 38").preis,
    konzept: "zusatzrente", bild: praes("Hauffstraße 38").bilder[0].src, beispiel: "WE 05, 70,9 m², 3 Zimmer, mit Garage",
    objekt: { kaufpreis: 280_170, wohnflaeche: 70.9, kaltmieteMonat: 1021.7, stellplatzMieteMonat: 100, hausgeldNichtUmlegbarMonat: 190.77, ruecklageMonat: 61.47, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 80 },
    afaProzent: 3.1, mieteZiel2060: 20,
  },
  {
    id: "zossen", titel: "Doppelhaushälfte", ort: "Zossen-Wünsdorf", preisrahmen: praes("Doppelhaushälften").preis,
    konzept: "zusatzrente", bild: praes("Doppelhaushälften").bilder[0].src, beispiel: "Luisenstraße 72, 91 m², 4 Zimmer, Paket A",
    // Exposé: AfA 8,3 % (Modellannahme, Gutachten nötig) auf 70 % des Hauspreises
    // 349.000 € plus 8,5 % Nebenkosten = 265.100 €; das sind 64,47 % von
    // Kaufpreis 379.000 € plus Nebenkosten. Paket A (30.000 € Erhaltungsaufwand,
    // einmalige Ersparnis) ist hier nicht gerechnet, wie im laufenden Ergebnis des Exposés.
    objekt: { kaufpreis: 379_000, wohnflaeche: 91, kaltmieteMonat: 1600, ruecklageMonat: 91, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 64.47 },
    afaProzent: 8.3, mieteZiel2060: 20,
  },
  {
    id: "brueck", titel: "Marktstraße 6", ort: "Brück bei Potsdam", preisrahmen: "64.500 bis 203.500 €",
    konzept: "zusatzrente", bild: "/images/analysetool/brueck-luftbild.jpg", beispiel: "WE 08, 80 m², Ist-Miete",
    objekt: { kaufpreis: 185_000, wohnflaeche: 80, kaltmieteMonat: 721.62, hausgeldNichtUmlegbarMonat: 54.8, ruecklageMonat: 40.2, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 80 },
    afaProzent: 2, mieteZiel2060: 18,
  },
  {
    id: "cottbus", titel: "Studentisches Wohnen", ort: "Cottbus", preisrahmen: "ab 79.995 €",
    konzept: "zusatzrente", bild: "/images/analysetool/cottbus-luftbild.jpg", beispiel: "WE 01, 22 m², 1 Zimmer",
    // Gebäudeanteil 20 % laut Investagon, vermutlich vertauscht; bleibt wie im Exposé bis zur Klärung.
    // Miete im Exposé ohne Steigerung.
    objekt: { kaufpreis: 79_995, wohnflaeche: 22, kaltmieteMonat: 340, ruecklageMonat: 22, bundeslandId: "bb", kaufnebenkostenProzent: 8.5, gebaeudeanteilProzent: 20 },
    afaProzent: 4, mieteZiel2060: 340 / 22, nebenkostenTraegtVerkaeufer: true,
  },
];

/** Gleichmäßige jährliche Steigerung von der heutigen Miete je m² zur Exposé-Miete 2060. */
export function mietsteigerungProzent(w: OsWohnung): number {
  const heute = (w.objekt.kaltmieteMonat - (w.objekt.stellplatzMieteMonat ?? 0)) / (w.objekt.wohnflaeche ?? 1);
  return (Math.pow(w.mieteZiel2060 / heute, 1 / (2060 - KAUFJAHR)) - 1) * 100;
}

/** Gleiche Staffel wie im Rechenkern (scoringEngine), damit die Seite eine Annahme hat. */
export function grenzsteuersatzAusKlasse(klasse: AnalysisData["incomeClass"]): number {
  if (klasse === "80k_120k" || klasse === "ueber_120k") return 42;
  if (klasse === "50k_80k") return 35;
  return 25;
}

export interface WohnungRechnung {
  wohnung: OsWohnung;
  kaufAlter: number;
  /** Was der Kunde bar mitbringt: Kaufnebenkosten. */
  nebenkosten: number;
  /** Ø Steuervorteil im Monat, erste zehn Jahre. */
  steuerMonat: number;
  /** Ø Eigenanteil im Monat nach Steuer, erste zehn Jahre (positiv = zahlt zu). */
  eigenanteilMonat: number;
  /** Erstes Jahr, wie die Monatsrechnung im Exposé. */
  jahr1: { steuerMonat: number; eigenanteilMonat: number };
  verkaufswert: number;
  restschuld: number;
  verkaufskosten: number;
  erloes: number;
}

export function rechneWohnung(w: OsWohnung, kaufAlter: number, verkaufsAlter: number, grenzsteuersatz: number): WohnungRechnung {
  const jahre = verkaufsAlter - kaufAlter;
  const e = berechneExpose(w.objekt, {
    ...standardAnnahmen(KAUFJAHR),
    zinsProzent: EXPOSE_ZINS_PROZENT,
    tilgungProzent: EXPOSE_TILGUNG_PROZENT,
    mietsteigerungProzent: mietsteigerungProzent(w),
    afaProzent: w.afaProzent,
    grenzsteuersatzManuellProzent: grenzsteuersatz,
    nebenkostenTraegtVerkaeufer: !!w.nebenkostenTraegtVerkaeufer,
    haltedauerJahre: jahre,
  });
  const zehn = e.jahresreihe.slice(0, 10);
  const schnitt = (f: (j: (typeof zehn)[number]) => number) => Math.round(zehn.reduce((s, j) => s + f(j), 0) / zehn.length);
  // Die Zeile des Verkaufsjahres: nach `jahre` vollen Jahren.
  const ende = e.jahresreihe[Math.min(jahre, e.jahresreihe.length) - 1];
  const verkaufswert = Math.round(ende.immobilienwertEnde);
  // Restschuld jährlich wie im Exposé-Generator (rechner.py): Zins auf den
  // Stand zu Jahresbeginn, Tilgung = Annuität minus Zins. `berechneExpose`
  // rechnet monatlich und läge nach 30 Jahren rund 9.000 € tiefer.
  const plan = tilgungsplan(e.kauf.darlehen, jahre, EXPOSE_ZINS_PROZENT / 100, EXPOSE_TILGUNG_PROZENT / 100);
  const restschuld = Math.round(plan[plan.length - 1]?.restschuldEnde ?? e.kauf.darlehen);
  const verkaufskosten = Math.round(verkaufswert * (VORSORGE_ANNAHMEN.verkaufskostenProzent / 100));
  return {
    wohnung: w,
    kaufAlter,
    nebenkosten: Math.round(e.kauf.nebenkostenKunde),
    steuerMonat: schnitt((j) => j.steuerwirkungOhneSanierung / 12),
    eigenanteilMonat: schnitt((j) => j.eigenanteilMonat),
    jahr1: { steuerMonat: Math.round(zehn[0].steuerwirkungOhneSanierung / 12), eigenanteilMonat: Math.round(zehn[0].eigenanteilMonat) },
    verkaufswert,
    restschuld,
    verkaufskosten,
    erloes: Math.max(0, verkaufswert - restschuld - verkaufskosten),
  };
}

export interface VorsorgePlan {
  verkaufsAlter: number;
  wohnungen: WohnungRechnung[];
  /** Summe der Verkaufswerte aller Wohnungen. */
  verkaufsvolumen: number;
  /** Was nach Ablösung und Verkaufskosten bleibt. */
  kapital: number;
  zusatzrenteMonat: number;
  summeKaufpreise: number;
  /** true, wenn die Kaufpreise zusammen über dem heutigen Finanzierungsrahmen liegen. */
  ueberRahmen: boolean;
}

/** Schwerpunkt des Kunden: Steuer nur, wenn er Steuerersparnis ohne Altersvorsorge gewählt hat. */
export function schwerpunkt(data: AnalysisData): KonzeptOs {
  return data.goals.includes("steuerersparnis") && !data.goals.includes("altersvorsorge") ? "steuer" : "zusatzrente";
}

/**
 * Bis zu drei Wohnungen, passendes Konzept zuerst. Gewählt wird, was in den
 * heutigen Rahmen passt; reicht er nicht für drei, füllen die günstigsten
 * auf und die Seite sagt, dass die Bank jeden weiteren Kauf neu prüft.
 */
export function vorsorgePlan(data: AnalysisData, rahmen: number): VorsorgePlan | null {
  if (!(rahmen > 0) || !(data.age > 0)) return null;
  const A = VORSORGE_ANNAHMEN;
  const verkaufsAlter = Math.max(A.rentenalter, data.age + A.spekulationsfristJahre);
  const kaufAlter = Array.from({ length: A.maxWohnungen }, (_, i) => data.age + i * A.kaufAbstandJahre)
    .filter((alter) => verkaufsAlter - alter >= A.spekulationsfristJahre);

  const fokus = schwerpunkt(data);
  const reihenfolge = [...OS_WOHNUNGEN].sort((a, b) => Number(b.konzept === fokus) - Number(a.konzept === fokus));
  const auswahl: OsWohnung[] = [];
  let summe = 0;
  for (const w of reihenfolge) {
    if (auswahl.length < kaufAlter.length && summe + w.objekt.kaufpreis <= rahmen) {
      auswahl.push(w);
      summe += w.objekt.kaufpreis;
    }
  }
  const guenstigste = [...OS_WOHNUNGEN].sort((a, b) => a.objekt.kaufpreis - b.objekt.kaufpreis);
  for (const w of guenstigste) {
    if (auswahl.length >= kaufAlter.length) break;
    if (!auswahl.includes(w)) {
      auswahl.push(w);
      summe += w.objekt.kaufpreis;
    }
  }

  const satz = grenzsteuersatzAusKlasse(data.incomeClass);
  const wohnungen = auswahl.map((w, i) => rechneWohnung(w, kaufAlter[i], verkaufsAlter, satz));
  const kapital = wohnungen.reduce((s, w) => s + w.erloes, 0);
  return {
    verkaufsAlter,
    wohnungen,
    verkaufsvolumen: wohnungen.reduce((s, w) => s + w.verkaufswert, 0),
    kapital,
    zusatzrenteMonat: Math.round(kapital / (A.ruhestandJahre * 12)),
    summeKaufpreise: summe,
    ueberRahmen: summe > rahmen,
  };
}
