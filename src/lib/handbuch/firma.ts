/**
 * Was die Handbuch-Seite über MOREImmo selbst sagt (Abschnitt „Wer dahinter
 * steht“, Westmont-Analyse Punkt 4, Auftrag vom 26.09.2026).
 *
 * Regeln:
 *   - Kennzahlen nur so, wie sie auf https://more.immo stehen (Abschnitt
 *     „Über MOREImmo“, gelesen am 26.09.2026). Keine eigenen Zahlen.
 *   - Kundenstimmen wörtlich und mit der Namensform der Website, nichts
 *     ergänzt. Ausgewählt sind Stimmen ohne Steuer- oder Tempoversprechen.
 *   - Das Zitat des Inhabers ist ein ENTWURF: Auf der Website steht keins.
 *     Es muss von Christian Kurz freigegeben werden, bevor die Seite live geht.
 *   - Foto: fest im Projekt unter `src/assets/handbuch/christian-kurz.webp`,
 *     von Christian am 26.09.2026 geliefert und geschärft. Initialen nur,
 *     falls das Bild nicht lädt.
 *
 * Englisch (seit dem 26.09.2026): je Text eine `_EN`-Fassung. Die
 * Kundenstimmen bleiben wörtlich deutsch, weil es Zitate sind; die Seite
 * vermerkt „Original in German“.
 */

export const FIRMEN_ANSPRECHPARTNER = {
  name: "Christian Kurz",
  rolle: "Inhaber und Geschäftsführer",
  initialen: "CK",
  /** ENTWURF, von Christian Kurz freigeben lassen. */
  zitat:
    "Bei uns kommt die Rechnung vor der Wohnung. Wenn die Zahlen nicht zu Ihnen passen, sagen wir Ihnen das offen, auch wenn es dann erst einmal kein Kauf wird.",
};

export const FIRMEN_ANSPRECHPARTNER_EN = {
  rolle: "Owner and Managing Director",
  /** ENTWURF wie oben, sinngemäß übertragen. */
  zitat:
    "With us, the numbers come before the flat. If the figures do not suit you, we tell you openly, even if that means no purchase for now.",
};

/** Warum es MOREImmo gibt, zwei Sätze. */
export const MOREIMMO_WARUM = [
  "MOREImmo gibt es, weil viele Menschen eine Wohnung kaufen, bevor sie wissen, was sie sich leisten können und was die Wohnung für sie leisten soll.",
  "Wir drehen die Reihenfolge um: erst Ihre Zahlen, dann die Bank, dann das Objekt, persönlich, transparent und langfristig gedacht.",
];

export const MOREIMMO_WARUM_EN = [
  "MOREImmo exists because many people buy a flat before they know what they can afford and what the flat should do for them.",
  "We reverse the order: your figures first, then the bank, then the property. Personal, transparent and with the long term in mind.",
];

/** Unsere Werte, ein bis zwei Sätze. */
export const MOREIMMO_WERTE =
  "Wir legen jede Rechnung offen und sagen Ihnen auch, wenn eine Wohnung nicht zu Ihnen passt. Nach dem Notar bleiben wir an Ihrer Seite, bei Übergabe, Vermietung und dem ersten Steuerjahr.";

export const MOREIMMO_WERTE_EN =
  "We disclose every calculation and tell you when a flat does not suit you. After the notary we stay by your side, through handover, letting and your first tax year.";

/** Wörtlich von more.immo, Abschnitt „Über MOREImmo“. */
export const FIRMEN_KENNZAHLEN: Array<{ wert: string; text: string }> = [
  { wert: "über 10 Jahre", text: "Immobilienerfahrung" },
  { wert: "rund 20", text: "Spezialisten im Team" },
];

export const FIRMEN_KENNZAHLEN_EN: Array<{ wert: string; text: string }> = [
  { wert: "over 10 years", text: "of property experience" },
  { wert: "around 20", text: "specialists in the team" },
];

/** Wörtlich von more.immo, Abschnitt „Was unsere Kunden sagen“, gelesen am 26.09.2026. */
export const KUNDENSTIMMEN: Array<{ name: string; ort: string; text: string }> = [
  {
    name: "Stefan L.",
    ort: "Regensburg",
    text: "Ich habe über Christian Kurz und sein Team meine erste Kapitalanlagewohnung gekauft und hätte mir keinen besseren Einstieg vorstellen können. Die Beratung war ehrlich, transparent und ohne dieses typische Makler-Blabla. Danke für die starke Begleitung!",
  },
  {
    name: "Miriam K.",
    ort: "Würzburg",
    text: "Ich hatte lange gezögert, in Immobilien zu investieren. zu komplex, dachte ich. Christian hat mir das Thema so verständlich erklärt, dass ich mich endlich sicher gefühlt habe. Keine leeren Versprechen, sondern ehrliche Beratung mit Plan. Absolute Empfehlung!",
  },
  {
    name: "Sandra W.",
    ort: "Nürnberg",
    text: "Ich hatte bereits Kontakt mit anderen Anbietern. vieles wirkte aufgeblasen oder unkonkret. Ganz anders hier: Kein Verkaufsdruck, sondern echtes Interesse an meiner Situation. Die perfekte Kombi aus persönlicher Betreuung und digitaler Effizienz.",
  },
  {
    name: "Katrin P.",
    ort: "Bayreuth",
    text: "Als alleinerziehende Mutter hatte ich Angst vor dem finanziellen Risiko. Das Team hat sich so viel Zeit genommen, mir alles zu erklären und eine Strategie zu finden, die zu meiner Situation passt. Ich fühle mich sicher und gut aufgehoben.",
  },
];
