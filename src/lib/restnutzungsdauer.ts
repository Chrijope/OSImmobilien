/**
 * Restnutzungsdauer von Wohngebäuden bei Modernisierungen.
 *
 * Modell nach Anlage 2 ImmoWertV (zu § 12 Absatz 5 Satz 1). Vorher steckte
 * die Formel ohne ihre beiden Nebenbedingungen im AfA-Rechner, was bei
 * jüngeren Gebäuden Restnutzungsdauern oberhalb der Gesamtnutzungsdauer
 * ergeben hat. Beide Bedingungen stehen jetzt hier:
 *
 *   1. Die Formel gilt erst ab einem bestimmten relativen Gebäudealter.
 *      Modernisierungen wirken sich vorher nicht auf die Restnutzungsdauer
 *      aus. Darunter gilt schlicht Gesamtnutzungsdauer minus Alter.
 *   2. Die Restnutzungsdauer wird auf 70 Prozent der Gesamtnutzungsdauer
 *      gestreckt, bei kernsanierten Objekten auf bis zu 90 Prozent.
 *
 * Wichtig für die Einordnung: Das Modell stammt aus der Wertermittlung, nicht
 * aus dem Steuerrecht. Die ImmoWertV selbst gilt unverändert weiter, sie regelt
 * die Verkehrswertermittlung. Für die steuerliche Abschreibung ist der
 * Modellwert nur eine Indikation und trägt allein nicht, weil er nicht auf das
 * konkrete Gebäude eingeht. Dafür braucht es eine objektbezogene Begutachtung.
 *
 * Zur Form der Darlegung: Das BMF-Schreiben vom 22.02.2023, das den Nachweis
 * einer kürzeren tatsächlichen Nutzungsdauer nach § 7 Abs. 4 Satz 2 EStG
 * eingeschränkt hatte, ist mit BMF-Schreiben vom 01.12.2025 (IV C 3 - S
 * 2196/00040/006/008) ersatzlos aufgehoben worden. Maßgeblich ist seither
 * wieder die Rechtsprechung des Bundesfinanzhofs (IX R 25/19 vom 28.07.2021,
 * bestätigt durch IX R 14/23 vom 23.01.2024): Jede im Einzelfall geeignete
 * Darlegungsmethode ist zulässig. Dasselbe Urteil IX R 14/23 sagt aber auch,
 * dass die bloße Bezugnahme auf den Modellwert der ImmoWertV nicht ausreicht.
 * Die Form ist damit offen, der Bezug auf das konkrete Gebäude bleibt nötig.
 */

export interface RndParameter {
  punkte: number;
  a: number;
  b: number;
  c: number;
  /** Relatives Gebäudealter in Prozent, ab dem die Formel gilt. */
  abRelativemAlter: number;
}

/** Tabelle 3 der Anlage 2 ImmoWertV, vollständig von 0 bis 20 Punkten. */
export const RND_PARAMETER: RndParameter[] = [
  { punkte: 0, a: 1.25, b: 2.625, c: 1.525, abRelativemAlter: 60 },
  { punkte: 1, a: 1.25, b: 2.625, c: 1.525, abRelativemAlter: 60 },
  { punkte: 2, a: 1.0767, b: 2.2757, c: 1.3878, abRelativemAlter: 55 },
  { punkte: 3, a: 0.9033, b: 1.9263, c: 1.2505, abRelativemAlter: 55 },
  { punkte: 4, a: 0.73, b: 1.577, c: 1.1133, abRelativemAlter: 40 },
  { punkte: 5, a: 0.6725, b: 1.4578, c: 1.085, abRelativemAlter: 35 },
  { punkte: 6, a: 0.615, b: 1.3385, c: 1.0567, abRelativemAlter: 30 },
  { punkte: 7, a: 0.5575, b: 1.2193, c: 1.0283, abRelativemAlter: 25 },
  { punkte: 8, a: 0.5, b: 1.1, c: 1.0, abRelativemAlter: 20 },
  { punkte: 9, a: 0.466, b: 1.027, c: 0.9906, abRelativemAlter: 19 },
  { punkte: 10, a: 0.432, b: 0.954, c: 0.9811, abRelativemAlter: 18 },
  { punkte: 11, a: 0.398, b: 0.881, c: 0.9717, abRelativemAlter: 17 },
  { punkte: 12, a: 0.364, b: 0.808, c: 0.9622, abRelativemAlter: 16 },
  { punkte: 13, a: 0.33, b: 0.735, c: 0.9528, abRelativemAlter: 15 },
  { punkte: 14, a: 0.304, b: 0.676, c: 0.9506, abRelativemAlter: 14 },
  { punkte: 15, a: 0.278, b: 0.617, c: 0.9485, abRelativemAlter: 13 },
  { punkte: 16, a: 0.252, b: 0.558, c: 0.9463, abRelativemAlter: 12 },
  { punkte: 17, a: 0.226, b: 0.499, c: 0.9442, abRelativemAlter: 11 },
  { punkte: 18, a: 0.2, b: 0.44, c: 0.942, abRelativemAlter: 10 },
  { punkte: 19, a: 0.2, b: 0.44, c: 0.942, abRelativemAlter: 10 },
  { punkte: 20, a: 0.2, b: 0.44, c: 0.942, abRelativemAlter: 10 },
];

export const MAX_MOD_PUNKTE = 20;

/** Obergrenze der modellhaften Restnutzungsdauer, Anteil der GND. */
export const RND_DECKEL = 0.7;
export const RND_DECKEL_KERNSANIERT = 0.9;

/** Modernisierungselemente aus Tabelle 1 der Anlage 2, zusammen 20 Punkte. */
export const MOD_ELEMENTE = [
  { key: "dach", label: "Dacherneuerung inkl. Wärmedämmung", maxPunkte: 4 },
  { key: "fenster", label: "Fenster und Außentüren", maxPunkte: 2 },
  { key: "leitungen", label: "Leitungssysteme (Strom, Gas, Wasser)", maxPunkte: 2 },
  { key: "heizung", label: "Heizungsanlage", maxPunkte: 2 },
  { key: "waermedaemmung", label: "Wärmedämmung Außenwände", maxPunkte: 4 },
  { key: "bad", label: "Modernisierung Badezimmer", maxPunkte: 2 },
  { key: "innenausbau", label: "Innenausbau (Decken, Böden, Treppen)", maxPunkte: 2 },
  { key: "grundriss", label: "Grundrissgestaltung", maxPunkte: 2 },
] as const;

/**
 * Zeitliche Abstufung zurückliegender Maßnahmen.
 *
 * Die Anlage 2 sagt nur, dass für weiter zurückliegende Maßnahmen zu prüfen
 * ist, ob weniger als die vollen Punkte anzusetzen sind. Eine Formel gibt sie
 * nicht vor. Diese Staffel ist deshalb eine hauseigene Annahme und wird in der
 * Oberfläche auch so ausgewiesen.
 */
export const ZEITRAUM_OPTIONEN = [
  { value: "unter5", label: "unter 5 Jahre", faktor: 1.0 },
  { value: "5bis10", label: "5 bis 10 Jahre", faktor: 0.85 },
  { value: "10bis15", label: "10 bis 15 Jahre", faktor: 0.6 },
  { value: "15bis20", label: "15 bis 20 Jahre", faktor: 0.35 },
  { value: "ueber20", label: "über 20 Jahre", faktor: 0.1 },
  { value: "keine", label: "keine Modernisierung", faktor: 0 },
] as const;

export type ZeitraumWert = (typeof ZEITRAUM_OPTIONEN)[number]["value"];

/** Gesamtnutzungsdauern nach Anlage 1 ImmoWertV. */
export const OBJEKTART_GND: { value: string; label: string; gnd: number }[] = [
  { value: "etw", label: "Eigentumswohnung (ETW)", gnd: 80 },
  { value: "efh", label: "Einfamilienhaus", gnd: 80 },
  { value: "mfh", label: "Mehrfamilienhaus", gnd: 80 },
  { value: "mischnutzung", label: "Wohn-/Geschäftshaus (gemischt)", gnd: 80 },
  { value: "gewerbe", label: "Gewerbeobjekt", gnd: 60 },
  { value: "sonstiges", label: "Sonstiges", gnd: 70 },
];

export function gndFuerObjektart(label: string): number {
  return OBJEKTART_GND.find((o) => o.label === label)?.gnd ?? 80;
}

export function rndParameter(modPunkte: number): RndParameter {
  const p = Math.max(0, Math.min(MAX_MOD_PUNKTE, Math.round(modPunkte)));
  return RND_PARAMETER[p];
}

/** Punkte aus der Bewertung der acht Elemente und ihrem Zeitpunkt. */
export function modernisierungsPunkte(zeitraeume: Record<string, string>): number {
  let punkte = 0;
  for (const el of MOD_ELEMENTE) {
    const wahl = zeitraeume[el.key] || "keine";
    const option = ZEITRAUM_OPTIONEN.find((o) => o.value === wahl);
    if (option) punkte += Math.round(el.maxPunkte * option.faktor);
  }
  return Math.min(punkte, MAX_MOD_PUNKTE);
}

export interface RndEingabe {
  /** Gebäudealter in Jahren zum Bewertungsstichtag. */
  alter: number;
  gnd: number;
  modPunkte: number;
  kernsaniert?: boolean;
}

export interface RndErgebnis {
  rnd: number;
  /** Wert vor Anwendung der Nebenbedingungen, für den Rechenweg. */
  rndFormel: number;
  relativesAlter: number;
  /** Schwelle, ab der die Formel überhaupt gilt. */
  schwelle: number;
  /** true, wenn stattdessen GND minus Alter gilt. */
  unterSchwelle: boolean;
  /** true, wenn der Deckel gegriffen hat. */
  gedeckelt: boolean;
  deckel: number;
  parameter: RndParameter;
}

/** Restnutzungsdauer nach Anlage 2 ImmoWertV, inklusive beider Nebenbedingungen. */
export function berechneRestnutzungsdauer(e: RndEingabe): RndErgebnis {
  const gnd = Math.max(1, e.gnd);
  const alter = Math.max(0, e.alter);
  const parameter = rndParameter(e.modPunkte);
  const relativesAlter = (alter / gnd) * 100;
  const schwelle = parameter.abRelativemAlter;
  const unterSchwelle = relativesAlter < schwelle;

  const rndFormel = parameter.a * ((alter * alter) / gnd) - parameter.b * alter + parameter.c * gnd;
  // Unterhalb der Schwelle wirkt sich eine Modernisierung noch nicht aus.
  const roh = unterSchwelle ? gnd - alter : rndFormel;

  const deckel = gnd * (e.kernsaniert ? RND_DECKEL_KERNSANIERT : RND_DECKEL);
  const gedeckelt = roh > deckel;
  const rnd = Math.max(1, Math.round(Math.min(roh, deckel)));

  return { rnd, rndFormel, relativesAlter, schwelle, unterSchwelle, gedeckelt, deckel, parameter };
}
