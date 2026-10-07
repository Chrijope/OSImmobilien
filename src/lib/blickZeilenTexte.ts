import type { ZweiSprachen } from "@/lib/seitenSprache";

/**
 * Texte der Karte „Objektdetails“ (Fakten und Mietübersicht), die
 * `aufEinenBlickZeilen` in `objektKennzahlen.ts` baut. Deutsch und Englisch
 * (Kundensprache, Etappe 3). Das CRM ruft ohne Sprache und bleibt deutsch.
 *
 * Englisch nach `kundenspracheGlossar.ts`: Kaltmiete „net cold rent“,
 * Hausgeld „service charge (Hausgeld)“, WEG „owners’ association“.
 */
export interface BlickZeilenTexte {
  etage: { label: string; info: string };
  lage: { label: string; info: string };
  zimmer: { label: string; info: string };
  baujahr: { label: string; info: string; sanierung: (jahr: string | number) => string };
  sanierungsjahr: { label: string; info: string };
  bauzustand: { label: string; info: string };
  energie: { label: string; info: string; klasse: (k: string) => string; keineKlasse: string; gueltigBis: (d: string) => string };
  anlageklasse: { label: string; info: string; kapitalanlage: string; kapitalanlageVermietet: string };
  sanierungAnteil: { label: string; unter: string; info: string };
  warmmiete: { label: string; unter: (kalt: string, nebenkosten: string) => string; info: string };
  kaltmiete: { label: string; unter: string; info: string };
  kaltmieteJeQm: { label: string; info: string };
  rendite: { label: string; unter: string; info: string };
  stellplatz: { label: string; mieteJeMonat: (betrag: string) => string; ohneMiete: string; info: string };
  hausgeld: { label: string; unter: string; info: string };
  hausgeldNichtUmlegbar: { label: string; unter: string; info: string };
  erstvermietung: { label: string; monateAbUebergabe: (n: number) => string; abUebergabe: string; info: string };
  vermietet: { label: string; seit: (monatJahr: string) => string; ja: string; ohneBeginn: string; info: string };
  verwaltung: {
    label: string;
    jeMonat: (teile: string) => string;
    sevErstesJahr: string;
    plus: string;
    wegPlusSev: string;
    info: string;
  };
}

export const BLICK_ZEILEN_TEXTE: ZweiSprachen<BlickZeilenTexte> = {
  de: {
    etage: { label: "Etage", info: "Geschoss und Lage der Wohnung im Haus, wie im Aufteilungsplan." },
    lage: { label: "Lage", info: "Ort und Stadtteil der Wohnung. Das Bundesland bestimmt die Grunderwerbsteuer." },
    zimmer: { label: "Zimmer", info: "Anzahl der Wohnräume ohne Küche, Bad und Flur." },
    baujahr: {
      label: "Baujahr",
      info: "Baujahr des Gebäudes. Es bestimmt den Abschreibungssatz, eine Sanierung ändert daran nichts.",
      sanierung: (jahr) => `Sanierung ${jahr}`,
    },
    sanierungsjahr: { label: "Sanierung", info: "Jahr der letzten Sanierung dieser Einheit." },
    bauzustand: { label: "Bauzustand", info: "Bestand, Kernsanierung oder Neubau, wie am Objekt gepflegt." },
    energie: {
      label: "Energie",
      info: "Effizienzklasse laut Energieausweis. Ein Verbrauchsausweis misst den Verbrauch der Bewohner, ein Bedarfsausweis den Zustand des Gebäudes. Der Kennwert gilt je Quadratmeter und Jahr.",
      klasse: (k) => `Klasse ${k}`,
      keineKlasse: "Keine Klasse",
      gueltigBis: (d) => `gültig bis ${d}`,
    },
    anlageklasse: {
      label: "Anlageklasse",
      info: "Die Anlageklasse aus der Objektanlage. Sie steuert Filter und Musterrechnung.",
      kapitalanlage: "Kapitalanlage",
      kapitalanlageVermietet: "Kapitalanlage, vermietet",
    },
    sanierungAnteil: {
      label: "Sanierung",
      unter: "Anteil nach MEA am Gemeinschaftseigentum",
      info: "Der Anteil dieser Einheit an den Sanierungen am Gemeinschaftseigentum, berechnet nach Miteigentumsanteil. Der Betrag kann als Erhaltungsaufwand steuerlich wirken, das prüft der Steuerberater.",
    },
    warmmiete: {
      label: "Miete (warm)",
      unter: (kalt, nebenkosten) => `Kaltmiete ${kalt} plus ${nebenkosten} Nebenkosten`,
      info: "Kaltmiete zuzüglich der umlagefähigen Nebenkosten, die der Mieter über die Miete trägt.",
    },
    kaltmiete: {
      label: "Kaltmiete",
      unter: "Nebenkosten nicht hinterlegt",
      info: "Die Nettokaltmiete je Monat. Nebenkosten sind für diese Einheit nicht gepflegt, deshalb keine Warmmiete.",
    },
    kaltmieteJeQm: { label: "Kaltmiete je m²", info: "Kaltmiete geteilt durch Wohnfläche. Zum Vergleich mit der Angebotsmiete am Ort." },
    rendite: {
      label: "Rendite",
      unter: "Jahreskaltmiete durch Kaufpreis",
      info: "Die eine Rendite im CRM: zwölf Kaltmieten geteilt durch den Kaufpreis. Hausgeld und Rücklage sind nicht abgezogen, sie stehen darunter.",
    },
    stellplatz: {
      label: "Stellplatz",
      mieteJeMonat: (betrag) => `${betrag} Miete je Monat`,
      ohneMiete: "ohne eigene Miete",
      info: "Kaufpreis des Stellplatzes, er kommt zum Wohnungspreis hinzu und steckt in der Gesamtinvestition. Eine Stellplatzmiete erhöht die Einnahmen.",
    },
    hausgeld: {
      label: "Hausgeld je Monat",
      unter: "laut Wirtschaftsplan",
      info: "Das gesamte Hausgeld, das die Eigentümergemeinschaft je Monat für diese Einheit erhebt. Ein Teil davon wird auf den Mieter umgelegt.",
    },
    hausgeldNichtUmlegbar: {
      label: "davon nicht umlegbar",
      unter: "Verwaltung und Rücklage",
      info: "Der Teil des Hausgelds, der beim Eigentümer bleibt: WEG-Verwaltung und Instandhaltungsrücklage.",
    },
    erstvermietung: {
      label: "Erstvermietung garantiert (kalt)",
      monateAbUebergabe: (n) => `${n} Monate ab Übergabe`,
      abUebergabe: "ab Übergabe",
      info: "Der Verkäufer garantiert diese Kaltmiete für die Erstvermietung. Gilt nur für Neubau und leerstehende Einheiten.",
    },
    vermietet: {
      label: "Vermietet",
      seit: (monatJahr) => `seit ${monatJahr}`,
      ja: "ja",
      ohneBeginn: "Beginn des Mietverhältnisses nicht hinterlegt",
      info: "Die Wohnung ist vermietet, der Mietvertrag geht auf den Käufer über. Eine Erstvermietungsgarantie gibt es hier nicht.",
    },
    verwaltung: {
      label: "Verwaltung",
      jeMonat: (teile) => `${teile} je Monat`,
      sevErstesJahr: "SEV im ersten Jahr inklusive",
      plus: " plus ",
      wegPlusSev: "WEG plus SEV",
      info: "WEG-Verwaltung verwaltet das gemeinsame Haus und steckt im Hausgeld. Die Sondereigentumsverwaltung (SEV) kümmert sich um die Vermietung dieser Wohnung.",
    },
  },
  en: {
    etage: { label: "Floor", info: "Storey and position of the flat in the building, as in the division plan." },
    lage: { label: "Location", info: "Town and district of the flat. The federal state determines the real estate transfer tax." },
    zimmer: { label: "Rooms", info: "Number of living rooms, not counting kitchen, bathroom and hallway." },
    baujahr: {
      label: "Year built",
      info: "Year the building was constructed. It determines the depreciation rate; a renovation does not change it.",
      sanierung: (jahr) => `Renovated ${jahr}`,
    },
    sanierungsjahr: { label: "Renovation", info: "Year of the most recent renovation of this unit." },
    bauzustand: { label: "Condition", info: "Existing building, full refurbishment or new build." },
    energie: {
      label: "Energy",
      info: "Efficiency class according to the energy certificate. A consumption certificate measures the occupants’ usage, a demand certificate the condition of the building. The value applies per square metre and year.",
      klasse: (k) => `Class ${k}`,
      keineKlasse: "No class",
      gueltigBis: (d) => `valid until ${d}`,
    },
    anlageklasse: {
      label: "Asset class",
      info: "The asset class of the property.",
      kapitalanlage: "Investment property",
      kapitalanlageVermietet: "Investment property, let",
    },
    sanierungAnteil: {
      label: "Renovation",
      unter: "Share of the common property by co-ownership share",
      info: "This unit’s share of the renovation of the common property, calculated by co-ownership share. The amount may be tax-deductible as maintenance expenses (Erhaltungsaufwand); your tax adviser will check this.",
    },
    warmmiete: {
      label: "Rent (incl. utilities)",
      unter: (kalt, nebenkosten) => `Net cold rent ${kalt} plus ${nebenkosten} utilities`,
      info: "Net cold rent plus the recoverable utility costs that the tenant pays with the rent.",
    },
    kaltmiete: {
      label: "Net cold rent",
      unter: "Utilities not specified",
      info: "The net cold rent (Kaltmiete) per month. No utility costs are recorded for this unit, so there is no rent including utilities.",
    },
    kaltmieteJeQm: { label: "Net cold rent per m²", info: "Net cold rent divided by living space. For comparison with asking rents in the area." },
    rendite: {
      label: "Gross rental yield",
      unter: "Annual net cold rent divided by purchase price",
      info: "Twelve months’ net cold rent divided by the purchase price. Service charge and maintenance reserve are not deducted; they are shown below.",
    },
    stellplatz: {
      label: "Parking space",
      mieteJeMonat: (betrag) => `${betrag} rent per month`,
      ohneMiete: "no separate rent",
      info: "Purchase price of the parking space. It is added to the price of the flat and included in the total investment. Rent for the parking space increases the income.",
    },
    hausgeld: {
      label: "Service charge per month",
      unter: "according to the budget plan",
      info: "The total service charge (Hausgeld) that the owners’ association charges for this unit each month. Part of it is passed on to the tenant.",
    },
    hausgeldNichtUmlegbar: {
      label: "of which non-recoverable",
      unter: "Management and maintenance reserve",
      info: "The part of the service charge that stays with the owner: WEG management and maintenance reserve (Instandhaltungsrücklage).",
    },
    erstvermietung: {
      label: "First letting guaranteed (net cold)",
      monateAbUebergabe: (n) => `${n} months from handover`,
      abUebergabe: "from handover",
      info: "The seller guarantees this net cold rent for the first letting. Applies only to new builds and vacant units.",
    },
    vermietet: {
      label: "Let",
      seit: (monatJahr) => `since ${monatJahr}`,
      ja: "yes",
      ohneBeginn: "Start of tenancy not recorded",
      info: "The flat is let; the tenancy agreement passes to the buyer. There is no first letting guarantee here.",
    },
    verwaltung: {
      label: "Management",
      jeMonat: (teile) => `${teile} per month`,
      sevErstesJahr: "SEV included in the first year",
      plus: " plus ",
      wegPlusSev: "WEG plus SEV",
      info: "The WEG management runs the shared building and is included in the service charge. The rental management (SEV, Sondereigentumsverwaltung) takes care of letting this flat.",
    },
  },
};
