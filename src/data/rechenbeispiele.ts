/**
 * Die drei durchgerechneten Objekte der Beratungspräsentation.
 *
 * Bisher standen hier zwei erfundene Musterfälle. Jetzt sind es drei echte
 * Objekte aus dem Bestand, mit Adresse, Bildern und den Angaben aus den
 * Objektunterlagen. Ein Kunde, der die Wohnung auf dem Bild sieht, glaubt die
 * Rechnung daneben eher als eine, die niemandem gehört.
 *
 * Woher die Zahlen stammen, steht bei jedem Objekt in `herkunft`: was aus den
 * Unterlagen kommt und was hergeleitet ist. Das gehört ins Kundengespräch,
 * nicht in eine Fussnote.
 */

export type RechnungId = "bestand" | "neubau" | "wg";

export interface RechenZeile {
  label: string;
  wert: string;
  /** Hervorgehoben, etwa der monatliche Eigenanteil. */
  betont?: boolean;
  /** Erläuterung, die im Gespräch dazugehört. */
  hinweis?: string;
}

export interface ObjektBild {
  pfad: string;
  titel: string;
}

export interface Rechenbeispiel {
  id: RechnungId;
  /** Kurzname für die Umschaltleiste. */
  reiter: string;
  /** Überschrift über der Rechnung. */
  name: string;
  /** Vollständige Anschrift, steht in der Bildergalerie. */
  adresse: string;
  ort: string;
  /** Merkmale des Objekts, wie sie in den Unterlagen stehen. */
  merkmale: string[];
  bilder: ObjektBild[];
  /** Steckbrief links: die Person, für die gerechnet wird. */
  kunde: { label: string; wert: string }[];
  /** Steckbrief rechts: die Wohnung. */
  objekt: { label: string; wert: string }[];
  /** Monatliche Betrachtung. */
  zeilen: RechenZeile[];
  /** Zwei Kennzahlen unter der Tabelle. */
  entlastungMonat: number;
  tilgungMonat: number;
  /** Was sich ab dem zweiten bzw. fünften Jahr ändert. */
  spaeter: string;
  /** Abschreibung, Position für Position. */
  afa: { label: string; wert: string; erklaerung: string }[];
  /** Einkünfte aus Vermietung und Verpachtung, jährlich. */
  steuerZeilen: RechenZeile[];
  steuerErgebnis: string;
  entlastungJahr: number;
  /** Die Immobilienschere. */
  schere: { kaufpreis: number; getilgt10: number; tilgungText: string };
  /** Was wir dem Kunden ungefragt dazusagen. */
  hinweis: string;
  /** Woher die Zahlen kommen. */
  herkunft: string;
}

const BILDER_BESTAND: ObjektBild[] = [
  { pfad: "/beispielrechnungen/bestand/bestand-02.jpg", titel: "Straßenansicht" },
  { pfad: "/beispielrechnungen/bestand/bestand-03.jpg", titel: "Hofseite" },
  { pfad: "/beispielrechnungen/bestand/bestand-04.jpg", titel: "Dachgeschoss vor der Sanierung" },
  { pfad: "/beispielrechnungen/bestand/bestand-05.jpg", titel: "Flur nach der Sanierung" },
  { pfad: "/beispielrechnungen/bestand/bestand-06.jpg", titel: "Wohnraum" },
  { pfad: "/beispielrechnungen/bestand/bestand-07.jpg", titel: "Wohnraum, zweite Ansicht" },
  { pfad: "/beispielrechnungen/bestand/bestand-08.jpg", titel: "Küchenzeile" },
  { pfad: "/beispielrechnungen/bestand/bestand-09.jpg", titel: "Bad" },
];

const BILDER_NEUBAU: ObjektBild[] = [
  { pfad: "/beispielrechnungen/neubau/neubau-01.jpg", titel: "Außenansicht" },
  { pfad: "/beispielrechnungen/neubau/neubau-02.jpg", titel: "Außenansicht, zweite Perspektive" },
  { pfad: "/beispielrechnungen/neubau/neubau-08.jpg", titel: "Übersichtsplan Park-Living Ansbach" },
  { pfad: "/beispielrechnungen/neubau/neubau-06.jpg", titel: "Grundriss Erdgeschoss" },
  { pfad: "/beispielrechnungen/neubau/neubau-07.jpg", titel: "Grundriss Obergeschoss" },
  { pfad: "/beispielrechnungen/neubau/neubau-05.jpg", titel: "Grundriss Dachgeschoss" },
];

const BILDER_WG: ObjektBild[] = [
  { pfad: "/beispielrechnungen/wg/wg-01.jpg", titel: "Zimmer 1" },
  { pfad: "/beispielrechnungen/wg/wg-02.jpg", titel: "Zimmer 2" },
  { pfad: "/beispielrechnungen/wg/wg-03.jpg", titel: "Zimmer 3" },
  { pfad: "/beispielrechnungen/wg/wg-04.jpg", titel: "Zimmer 4" },
  { pfad: "/beispielrechnungen/wg/wg-05.jpg", titel: "Gemeinschaftsbereich" },
  { pfad: "/beispielrechnungen/wg/wg-06.jpg", titel: "Bad" },
  { pfad: "/beispielrechnungen/wg/wg-07.jpg", titel: "Bad, zweite Ansicht" },
  { pfad: "/beispielrechnungen/wg/wg-08.jpg", titel: "Küche" },
];

export const RECHENBEISPIELE: Record<RechnungId, Rechenbeispiel> = {
  // ── 1. Sanierter Bestand, All-inclusive-Modell ──────────────────────────
  bestand: {
    id: "bestand",
    reiter: "Sanierter Bestand",
    name: "Nürnberg, Breitscheidstraße 18",
    adresse: "Breitscheidstraße 18, 90459 Nürnberg",
    ort: "Nürnberg",
    merkmale: [
      "Produktklasse: Erhaltungsaufwand",
      "Möblierte Vermietung und Premium Co-Living",
      "24 Monate Mietgarantie ab wirtschaftlichem Übergang",
      "360-Grad-Verwaltung inklusive",
      "Einbauküche und Vollmöblierung inklusive",
    ],
    bilder: BILDER_BESTAND,
    kunde: [
      { label: "Nettoeinkommen", wert: "4.000 € / Monat" },
      { label: "Persönlicher Steuersatz", wert: "42 %" },
      { label: "Familienstand", wert: "ledig" },
      { label: "Eigenkapital", wert: "12.000 €" },
    ],
    objekt: [
      { label: "Wohnfläche", wert: "18,17 m², 1 Zimmer" },
      { label: "Lage im Haus", wert: "3. Obergeschoss rechts" },
      { label: "Baujahr", wert: "1900, kernsaniert" },
      { label: "Kaufpreis", wert: "132.000 € (7.265 € / m²)" },
      { label: "Kaltmiete möbliert", wert: "620 € / Monat (34,12 € / m²)" },
      { label: "Gebäudeanteil", wert: "64 %" },
      { label: "Gebäude-AfA", wert: "4,17 % p. a." },
    ],
    zeilen: [
      { label: "Kaltmiete", wert: "+ 620 €", hinweis: "Möbliert vermietet, 24 Monate durch die Mietgarantie abgesichert." },
      { label: "Annuität an die Bank", wert: "− 660 €", hinweis: "132.000 € abzüglich 12.000 € Eigenkapital, 3,9 % Zins, 2 % Tilgung, Kaufnebenkosten mitfinanziert." },
      { label: "Nicht umlagefähige Bewirtschaftung", wert: "− 55 €", hinweis: "Verwaltung, Instandhaltungsrücklage und Möblierungsersatz. Die 360-Grad-Verwaltung ist im Kaufpreis enthalten." },
      { label: "Dein monatlicher Beitrag vor Steuer", wert: "ca. − 95 €", betont: true },
    ],
    entlastungMonat: 271,
    tilgungMonat: 218,
    spaeter: "Der Erhaltungsaufwand von rund 28.000 € wird nach § 82b EStDV auf zwei Jahre verteilt. Ab dem dritten Jahr entfällt dieser Abzug, die Entlastung sinkt dann auf rund 95 € im Monat. Gleichzeitig steigt die Tilgung, und die Miete wird bei jeder Neuvermietung nachgezogen.",
    afa: [
      { label: "Gebäude-AfA", wert: "3.523 € / Jahr", erklaerung: "64 % Gebäudeanteil auf Kaufpreis plus Kaufnebenkosten, abgeschrieben mit 4,17 % nach gutachterlicher Restnutzungsdauer." },
      { label: "Erhaltungsaufwand", wert: "14.000 € / Jahr", erklaerung: "Rund 28.000 € Sanierungsanteil, nach § 82b EStDV gleichmässig auf zwei Jahre verteilt." },
      { label: "Möblierung", wert: "1.400 € / Jahr", erklaerung: "Einbauküche und Möblierung, abgeschrieben über zehn Jahre." },
      { label: "Zinsen", wert: "4.680 € / Jahr", erklaerung: "Vollständig als Werbungskosten abziehbar, sinkt mit der Tilgung." },
    ],
    steuerZeilen: [
      { label: "Mieteinnahmen", wert: "+ 7.440 €" },
      { label: "Zinsen", wert: "− 4.680 €" },
      { label: "Gebäude-AfA", wert: "− 3.523 €" },
      { label: "Möblierungs-AfA", wert: "− 1.400 €" },
      { label: "Erhaltungsaufwand", wert: "− 14.000 €" },
      { label: "Bewirtschaftung und Werbungskosten", wert: "− 1.500 €" },
    ],
    steuerErgebnis: "− 17.663 €",
    entlastungJahr: 3253,
    schere: {
      kaufpreis: 132000,
      getilgt10: 29400,
      tilgungText: "Nach zehn Jahren sind rund 29.400 € getilgt",
    },
    hinweis:
      "Die Mietgarantie läuft 24 Monate. Danach trägt der Markt die Miete, und möblierte Vermietung bedeutet mehr Fluktuation als eine normale Wohnung. Der Erhaltungsaufwand wirkt steuerlich nur in den ersten zwei Jahren so stark. Beides gehört zur ehrlichen Betrachtung dazu.",
    herkunft:
      "Wohnfläche, Zimmerzahl, Lage im Haus, Baujahr, Gebäudeanteil, AfA-Satz und die Ausstattungsmerkmale stammen aus den Objektunterlagen. Kaufpreis, Miete und Finanzierungskonditionen sind marktübliche Werte für dieses Segment und werden vor jedem Angebot am konkreten Objekt geprüft.",
  },

  // ── 2. Neubau KfW 40 QNG ────────────────────────────────────────────────
  neubau: {
    id: "neubau",
    reiter: "Neubau KfW 40 QNG",
    name: "Ansbach, Park-Living, Wohnung 13 b",
    adresse: "Wohnbaustraße, Park-Living, 91522 Ansbach",
    ort: "Ansbach",
    merkmale: [
      "Neubau nach KfW 40 QNG",
      "4 Zimmer im 1. Obergeschoss",
      "Quartiersentwicklung Park-Living",
      "Förderfähige Finanzierung über die KfW",
    ],
    bilder: BILDER_NEUBAU,
    kunde: [
      { label: "Zu versteuerndes Einkommen", wert: "150.000 € / Jahr" },
      { label: "Familienstand", wert: "verheiratet, Splittingtarif" },
      { label: "Persönlicher Steuersatz", wert: "42 %" },
      { label: "Eigenkapital", wert: "40.000 €" },
    ],
    objekt: [
      { label: "Wohnfläche", wert: "79,28 m², 4 Zimmer" },
      { label: "Lage im Haus", wert: "1. Obergeschoss" },
      { label: "Baujahr", wert: "Neubau, KfW 40 QNG" },
      { label: "Kaufpreis", wert: "398.000 € (5.020 € / m²)" },
      { label: "Kaltmiete", wert: "1.070 € / Monat (13,50 € / m²)" },
      { label: "Gebäudeanteil", wert: "78 %" },
      { label: "Gebäude-AfA", wert: "3,0 % p. a. zuzüglich § 7b" },
    ],
    zeilen: [
      { label: "Kaltmiete", wert: "+ 1.070 €", hinweis: "Neubaumiete Ansbach, unmöbliert vermietet." },
      { label: "Annuität an die Bank", wert: "− 1.910 €", hinweis: "398.000 € abzüglich 40.000 € Eigenkapital, 3,7 % Zins, 2 % Tilgung, Kaufnebenkosten mitfinanziert." },
      { label: "Nicht umlagefähige Bewirtschaftung", wert: "− 105 €", hinweis: "Verwaltung und Instandhaltungsrücklage. Beim Neubau deutlich niedriger als im Bestand." },
      { label: "Dein monatlicher Beitrag vor Steuer", wert: "ca. − 945 €", betont: true },
    ],
    entlastungMonat: 723,
    tilgungMonat: 597,
    spaeter: "Die Sonderabschreibung nach § 7b läuft vier Jahre. Danach sinkt die Entlastung auf rund 430 € im Monat. Gleichzeitig steigt der Tilgungsanteil, sodass der Vermögensaufbau weiterläuft, auch wenn die Steuerwirkung nachlässt.",
    afa: [
      { label: "Gebäude-AfA", wert: "10.166 € / Jahr", erklaerung: "78 % Gebäudeanteil auf Kaufpreis plus Kaufnebenkosten, 3 % nach § 7 Abs. 4 EStG für Fertigstellung ab 2023." },
      { label: "Sonderabschreibung § 7b", wert: "16.943 € / Jahr", erklaerung: "5 % zusätzlich in den ersten vier Jahren. Bemessungsgrundlage gedeckelt auf 4.000 € je Quadratmeter." },
      { label: "Zinsen", wert: "14.500 € / Jahr", erklaerung: "Vollständig als Werbungskosten abziehbar, sinkt mit der Tilgung." },
      { label: "Bewirtschaftung", wert: "1.260 € / Jahr", erklaerung: "Nicht umlagefähiger Anteil aus Verwaltung und Rücklage." },
    ],
    steuerZeilen: [
      { label: "Mieteinnahmen", wert: "+ 12.840 €" },
      { label: "Zinsen", wert: "− 14.500 €" },
      { label: "Gebäude-AfA", wert: "− 10.166 €" },
      { label: "Sonderabschreibung § 7b", wert: "− 16.943 €" },
      { label: "Bewirtschaftung und Werbungskosten", wert: "− 2.100 €" },
    ],
    steuerErgebnis: "− 30.869 €",
    entlastungJahr: 8680,
    schere: {
      kaufpreis: 398000,
      getilgt10: 87200,
      tilgungText: "Nach zehn Jahren sind rund 87.200 € getilgt",
    },
    hinweis:
      "Die Sonderabschreibung nach § 7b setzt voraus, dass die Baukostenobergrenze eingehalten wird und die Wohnung zehn Jahre vermietet bleibt. Wird eine der beiden Bedingungen gerissen, entfällt sie rückwirkend. Und der Neubau hat die niedrigere Anfangsrendite, dafür die geringeren Instandhaltungsrisiken.",
    herkunft:
      "Objektbezeichnung, Wohnfläche, Zimmerzahl, Geschoss und Kaufpreis stammen aus der Objektliste des Projekts Park-Living. Miete, Finanzierungskonditionen und Gebäudeanteil sind marktübliche Werte für Ansbach und werden vor jedem Angebot am konkreten Objekt geprüft.",
  },

  // ── 3. WG und Co-Living ─────────────────────────────────────────────────
  wg: {
    id: "wg",
    reiter: "WG und Co-Living",
    name: "Co-Living-Wohnung, 4 Zimmer",
    adresse: "Vier-Zimmer-Wohnung, 3. Etage, Baujahr 1972",
    ort: "Ballungsraum",
    merkmale: [
      "Anlageklasse WG-Wohnung",
      "Vier möblierte Zimmer, einzeln vermietet",
      "Gemeinschaftlich genutzt: Küche, Bad, Flur",
      "Kernsaniert, Verwaltung über WEG und Sondereigentum",
    ],
    bilder: BILDER_WG,
    kunde: [
      { label: "Nettoeinkommen", wert: "6.500 € / Monat" },
      { label: "Persönlicher Steuersatz", wert: "42 %" },
      { label: "Familienstand", wert: "verheiratet, Splittingtarif" },
      { label: "Eigenkapital", wert: "65.000 €" },
    ],
    objekt: [
      { label: "Wohnfläche", wert: "72,00 m², 4 Zimmer" },
      { label: "Lage im Haus", wert: "3. Etage" },
      { label: "Baujahr", wert: "1972, kernsaniert" },
      { label: "Kaufpreis", wert: "650.000 € (9.028 € / m²)" },
      { label: "Kaltmiete gesamt", wert: "2.900 € / Monat (40,28 € / m²)" },
      { label: "Miete je Zimmer", wert: "durchschnittlich 725 € / Monat" },
      { label: "Bruttomietrendite", wert: "5,35 %" },
      { label: "Sanierungsanteil", wert: "521.840 €" },
    ],
    zeilen: [
      { label: "Kaltmiete, vier Zimmer", wert: "+ 2.900 €", hinweis: "Vier einzeln vermietete Zimmer statt einer Wohnung. Das ist der Grund für die 40,28 € je Quadratmeter." },
      { label: "Annuität an die Bank", wert: "− 3.240 €", hinweis: "650.000 € abzüglich 65.000 € Eigenkapital, 3,9 % Zins, 2 % Tilgung, Kaufnebenkosten mitfinanziert." },
      { label: "Nicht umlagefähige Bewirtschaftung", wert: "− 310 €", hinweis: "WEG-Verwaltung, Sondereigentumsverwaltung, Rücklage und Möblierungsersatz. Bei Co-Living höher als bei einer normalen Wohnung." },
      { label: "Mietausfallwagnis", wert: "− 87 €", hinweis: "Drei Prozent der Jahreskaltmiete. Vier Mietverhältnisse bedeuten mehr Wechsel, aber auch, dass nie die ganze Miete gleichzeitig ausfällt." },
      { label: "Dein monatlicher Beitrag vor Steuer", wert: "ca. − 737 €", betont: true },
    ],
    entlastungMonat: 1288,
    tilgungMonat: 975,
    spaeter: "Der Sanierungsanteil wird nach § 82b EStDV auf fünf Jahre verteilt. Ab dem sechsten Jahr entfällt dieser Abzug, die Entlastung sinkt dann auf rund 280 € im Monat. Ab diesem Punkt trägt sich die Wohnung im Wesentlichen aus der Miete, weil vier Mieter mehr zahlen als einer.",
    afa: [
      { label: "Gebäude-AfA", wert: "2.075 € / Jahr", erklaerung: "Auf den nicht als Erhaltungsaufwand behandelten Gebäudeanteil, 2 % nach § 7 Abs. 4 EStG für Baujahr 1972." },
      { label: "Erhaltungsaufwand", wert: "104.368 € / Jahr", erklaerung: "Sanierungsanteil von 521.840 €, nach § 82b EStDV gleichmässig auf fünf Jahre verteilt." },
      { label: "Möblierung", wert: "4.800 € / Jahr", erklaerung: "Vier voll möblierte Zimmer plus Gemeinschaftsflächen, abgeschrieben über zehn Jahre." },
      { label: "Zinsen", wert: "22.815 € / Jahr", erklaerung: "Vollständig als Werbungskosten abziehbar, sinkt mit der Tilgung." },
    ],
    steuerZeilen: [
      { label: "Mieteinnahmen", wert: "+ 34.800 €" },
      { label: "Zinsen", wert: "− 22.815 €" },
      { label: "Gebäude-AfA", wert: "− 2.075 €" },
      { label: "Möblierungs-AfA", wert: "− 4.800 €" },
      { label: "Erhaltungsaufwand", wert: "− 104.368 €" },
      { label: "Bewirtschaftung, Mietausfall und Werbungskosten", wert: "− 5.784 €" },
    ],
    steuerErgebnis: "− 105.042 €",
    entlastungJahr: 15456,
    schere: {
      kaufpreis: 650000,
      getilgt10: 130800,
      tilgungText: "Nach zehn Jahren sind rund 130.800 € getilgt",
    },
    hinweis:
      "Co-Living bringt die höchste Miete je Quadratmeter, aber auch den höchsten Aufwand: vier Mietverhältnisse, mehr Wechsel, Möblierung, die ersetzt werden muss, und eine Verwaltung, die das können muss. Ob der Sanierungsanteil in voller Höhe sofort abziehbar ist, entscheidet am Ende das Finanzamt, nicht der Verkäufer. Diese Rechnung ersetzt deshalb kein Gespräch mit deinem Steuerberater.",
    herkunft:
      "Wohnfläche, Zimmerzahl, Etage, Baujahr, Kaufpreis, Gesamtmiete, Rendite und Sanierungsanteil stammen aus den Objektunterlagen. Finanzierungskonditionen, Aufteilung der Bewirtschaftungskosten und die steuerliche Behandlung des Sanierungsanteils sind hergeleitet und im Einzelfall zu prüfen.",
  },
};

export const RECHENBEISPIEL_REIHENFOLGE: RechnungId[] = ["bestand", "neubau", "wg"];
