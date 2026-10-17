/**
 * Was die Handbuch-Seite über OS Real Estate selbst sagt (Abschnitt „Wer dahinter
 * steht“, Westmont-Analyse Punkt 4, Auftrag vom 26.09.2026). Seit dem
 * 17.10.2026 im Du und mit OS Real Estate als Absender.
 *
 * Regeln:
 *   - Kennzahlen nur so, wie sie auf https://osimmobilien.netlify.app stehen (Abschnitt
 *     „Über OS Immobilien“, gelesen am 26.09.2026). Keine eigenen Zahlen.
 *   - Kundenstimmen wörtlich und mit der Namensform der Website, nichts
 *     ergänzt. Ausgewählt sind Stimmen ohne Steuer- oder Tempoversprechen.
 *   - Das Zitat des Inhabers ist ein ENTWURF: Auf der Website steht keins.
 *     Es muss von Oliver Skowrnowski freigegeben werden, bevor die Seite live geht.
 *   - Foto: das bisherige (`christian-kurz.webp`) ist seit dem 17.10.2026 auf
 *     Christians Wunsch entfernt; bis das neue Bild kommt, zeigt die Karte
 *     die Initialen.
 *
 * Englisch (seit dem 26.09.2026): je Text eine `_EN`-Fassung. Die
 * Kundenstimmen bleiben wörtlich deutsch, weil es Zitate sind; die Seite
 * vermerkt „Original in German“.
 */

export const FIRMEN_ANSPRECHPARTNER = {
  name: "Oliver Skowrnowski",
  rolle: "Inhaber und Geschäftsführer",
  initialen: "CK",
  /** ENTWURF, von Oliver Skowrnowski freigeben lassen. */
  zitat:
    "Bei uns kommt die Rechnung vor der Wohnung. Wenn die Zahlen nicht zu dir passen, sagen wir dir das offen, auch wenn es dann erst einmal kein Kauf wird.",
};

export const FIRMEN_ANSPRECHPARTNER_EN = {
  rolle: "Owner and Managing Director",
  /** ENTWURF wie oben, sinngemäß übertragen. */
  zitat:
    "With us, the numbers come before the flat. If the figures do not suit you, we tell you openly, even if that means no purchase for now.",
};

/** Warum es OS Real Estate gibt. Dritter Satz seit 17.10.2026 nach os-immobilien.com. */
export const OS_IMMOBILIEN_WARUM = [
  "OS Real Estate gehört zur OS Immobilien Holding. Wir entwickeln Bestandsobjekte in Berlin und Brandenburg, renovieren und modernisieren sie und verkaufen die Wohnungen und Häuser über unseren eigenen Vertrieb, ohne Maklerprovision.",
  "Viele kaufen eine Wohnung, bevor sie wissen, was sie sich leisten können. Wir drehen die Reihenfolge um: erst deine Zahlen, dann die Bank, dann das Objekt, persönlich, transparent und langfristig gedacht.",
  "Die Holding schafft regionalen Wohnraum: Mehrfamilienhäuser revitalisieren, Grundstücke entwickeln, altersgerechtes Wohnen planen. Über 50.000 m² Wohnfläche sind in Planung. Bevor wir ein Haus kaufen, rechnen wir den ungünstigen Fall, und nur wenn der trägt, kaufen wir.",
];

export const OS_IMMOBILIEN_WARUM_EN = [
  "OS Real Estate is part of OS Immobilien Holding. We develop existing buildings in Berlin and Brandenburg, renovate and modernise them and sell the flats and houses through our own sales team, without an estate agent's commission.",
  "Many people buy a flat before they know what they can afford. We reverse the order: your figures first, then the bank, then the property. Personal, transparent and with the long term in mind.",
  "The holding creates regional housing: revitalising apartment buildings, developing land and planning age-appropriate living. More than 50,000 m² of living space are in planning. Before we buy a building, we calculate the unfavourable case, and we only buy if it still works.",
];

/** Unsere Werte, ein bis zwei Sätze. */
export const OS_IMMOBILIEN_WERTE =
  "Wir legen jede Rechnung offen und sagen dir auch, wenn eine Wohnung nicht zu dir passt. Nach dem Notar bleiben wir an deiner Seite, bei Übergabe, Vermietung und dem ersten Steuerjahr.";

export const OS_IMMOBILIEN_WERTE_EN =
  "We disclose every calculation and tell you when a flat does not suit you. After the notary we stay by your side, through handover, letting and your first tax year.";

/** Immobilienerfahrung laut Christian (17.10.2026), Team wörtlich von osimmobilien.netlify.app. */
export const FIRMEN_KENNZAHLEN: Array<{ wert: string; text: string }> = [
  { wert: "28+ Jahre", text: "Immobilienerfahrung" },
  { wert: "rund 20", text: "Spezialisten im Team" },
];

export const FIRMEN_KENNZAHLEN_EN: Array<{ wert: string; text: string }> = [
  { wert: "28+ years", text: "of property experience" },
  { wert: "around 20", text: "specialists in the team" },
];

/**
 * Kundenstimmen. Leer seit dem 16.10.2026: Die bisherigen Stimmen stammen aus
 * dem Ursprungsprojekt. Hier erst wieder eintragen, wenn echte Stimmen mit
 * Einverständnis der Kunden vorliegen. Ohne Einträge zeigt die Handbuch-Seite
 * den Block nicht, die Partnerseite nur den Hinweis `STIMMEN_TEXTE.folgen`.
 */
export const KUNDENSTIMMEN: Array<{ name: string; ort: string; text: string }> = [];
