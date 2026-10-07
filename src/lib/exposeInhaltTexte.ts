import type { ZweiSprachen } from "@/lib/seitenSprache";
import type {
  AnalyseSchluessel, ChanceRisiko, ExposeAbschnittId, MikrolageGruppeId, RechtlicherHinweis, SchrittKarte,
} from "@/lib/exposeInhalt";

/**
 * Die festen Texte des Exposé-Inhalts (`exposeInhalt.ts`, `exposePublicDaten.ts`)
 * in Deutsch und Englisch. Plan Kundensprache, Etappe 3 (S2 Exposé online).
 *
 * Die deutsche Hälfte ist der bisherige Wortlaut, wortgleich. Die bekannten
 * Konstanten (`NAECHSTE_SCHRITTE`, `ZEITPLAN_STANDARD`, `CHANCEN_RISIKEN`,
 * `RECHTLICHE_HINWEISE_ENTWURF`, `VERWALTUNG_LEISTUNGEN`, `EXPOSE_ABSCHNITTE`)
 * werden in `exposeInhalt.ts` aus ihr gebaut und bleiben dort exportiert,
 * damit die PDFs (Etappe 5) unverändert deutsch weiterlaufen.
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): britisch, der Berater
 * heißt „your contact“, nie „advisor“; deutsche Fachbegriffe beim ersten
 * Auftreten mit dem deutschen Wort in Klammern, etwa „service charge (Hausgeld)“.
 *
 * Nur Typen aus `exposeInhalt.ts`: Ein Wertimport wäre ein Kreis.
 */

/** Eine Station im Standardablauf. Ohne `frist` steht kein Kasten da. */
export interface ZeitplanText {
  nr: number;
  titel: string;
  frist?: string;
  zahlung?: boolean;
  /** Die Erklärung unter dem Titel, früher die Karte unter „Die nächsten Schritte“. */
  text?: string;
}

export interface ExposeInhaltTexte {
  abschnitte: Record<ExposeAbschnittId, { titel: string; kurz: string }>;
  verwaltungLeistungen: string[];
  naechsteSchritte: SchrittKarte[];
  zeitplan: ZeitplanText[];
  chancenRisiken: ChanceRisiko[];
  rechtlicheHinweise: RechtlicherHinweis[];
  marktQuelle: string;
  mikrolageGruppen: Record<MikrolageGruppeId, string>;
  analyseArt: Record<AnalyseSchluessel, string>;
  labels: {
    kaufpreis: string;
    wohnflaeche: string;
    zimmer: string;
    kaltmieteMonat: string;
    mietrendite: string;
    einwohner: string;
    entwicklungFuenfJahre: string;
    leerstandsquote: string;
    angebotsmieteQm: string;
    wohneinheit: string;
    stadtteil: string;
    lageImGebaeude: string;
    baujahr: string;
    einheitenImHaus: string;
    etagen: string;
    energietraeger: string;
    endenergie: string;
    stellplatz: string;
    hausgeldMonat: string;
    erhaltungsruecklage: string;
    abschreibung: string;
    vermietung: string;
    artDesAusweises: string;
    effizienzklasse: string;
    gueltigBis: string;
    kaufpreisGesamtobjekt: string;
    kaufpreisJeQm: string;
    wohnflaecheGesamt: string;
    jahresnettokaltmiete: string;
    einheiten: string;
    vermietungsstand: string;
    grundstueck: string;
    stellplaetze: string;
    zustand: string;
    kaufpreiseDerEinheiten: string;
    wohnflaechen: string;
    imAngebot: string;
    verfuegbar: string;
  };
  keineAngabe: string;
  keiner: string;
  inklusiveStellplatz: string;
  jahreskaltmieteDurchKaufpreis: string;
  einwohnerzahl: string;
  stellplatzMiete: (betrag: string) => string;
  davonNichtUmlegbar: (betrag: string) => string;
  anteilDieserEinheit: string;
  sanierungJahr: (jahr: string) => string;
  vermietetSeitMonat: (monatJahr: string) => string;
  vermietet: string;
  erstvermietung: string;
  leerstand: string;
  untertitelSaniert: (jahr: string) => string;
  untertitelVermietet: string;
  untertitelErstvermietung: string;
  untertitelFrei: string;
  chipBalkon: string;
  chipEnergieklasse: (klasse: string) => string;
  chipStellplatzInklusive: string;
  chipAbschreibung: (satz: string) => string;
  chipErhoehteAbschreibung: (satz: string) => string;
  chipVerwaltungVorOrt: string;
  chipVermietetSeit: (jahr: string) => string;
  wohnung: string;
  weKurz: string;
  standortOhneOrt: string;
  quelleStandortdatenbank: string;
  quelleHinterlegt: string;
  pflichtArtDesEnergieausweises: string;
  pflichtEndenergiekennwert: string;
  pflichtEnergietraeger: string;
  pflichtBaujahr: string;
  pflichtEffizienzklasse: string;
  angabeBautraeger: string;
  energieHinweis: (angabe: string, kennwert: string) => string;
  kostenMietverwaltung: string;
  kostenWegVerwaltung: string;
  jeMonat: (betrag: string) => string;
  keineVerwaltung: string;
  gesamtobjekt: string;
  objektMitEinheiten: string;
  spanne: (von: string, bis: string) => string;
  summeDerEinheiten: string;
  mieteJeMonat: (betrag: string, ausEinheiten: boolean) => string;
  davonVermietet: (anzahl: number) => string;
  ganzesHaus: string;
  kaufnebenkostenZuzueglich: string;
  kaufnebenkostenRund: (betrag: string) => string;
  kaufnebenkostenVerkaeufer: (betrag: string) => string;
  herkunftMikrolage: string;
  herkunftLeer: string;
}

export const EXPOSE_INHALT_TEXTE: ZweiSprachen<ExposeInhaltTexte> = {
  de: {
    abschnitte: {
      start: { titel: "Start", kurz: "Start" },
      standort: { titel: "Standort", kurz: "Standort" },
      mikrolage: { titel: "Mikrolage", kurz: "Mikrolage" },
      objektdaten: { titel: "Objektdaten", kurz: "Objektdaten" },
      grundriss: { titel: "Grundriss", kurz: "Grundriss" },
      wirtschaftlichkeit: { titel: "Wirtschaftlichkeit", kurz: "Wirtschaftlichkeit" },
      verwaltung: { titel: "Verwaltung vor Ort", kurz: "Verwaltung" },
      zeitplan: { titel: "Nächste Schritte und Zeitplan", kurz: "Zeitplan" },
      "chancen-risiken": { titel: "Chancen und Risiken", kurz: "Chancen und Risiken" },
      rechtliches: { titel: "Rechtliche Hinweise", kurz: "Rechtliches" },
      kontakt: { titel: "Kontakt", kurz: "Kontakt" },
    },
    verwaltungLeistungen: [
      "Neuvermietung bei Mieterwechsel, mit Bonitätsprüfung der Bewerber",
      "Mietvertrag nach aktuellem Recht, Übergabe mit Protokoll",
      "Jährliche Betriebskostenabrechnung gegenüber dem Mieter",
      "Mieteingang prüfen, Mahnwesen und Kautionsverwaltung",
      "Ansprechpartner für den Mieter bei allen Fragen im Alltag",
      "Kleinreparaturen beauftragen und Handwerker koordinieren",
      "Mietanpassungen prüfen und im gesetzlichen Rahmen durchsetzen",
      "Abrechnung bei Auszug, Abnahme und Rückgabe der Kaution",
      "Kontakt zur Hausverwaltung der Eigentümergemeinschaft",
      "Jährlicher Bericht zu Miete, Kosten und Zustand der Wohnung",
      "Belege gesammelt für deine Steuererklärung",
    ],
    naechsteSchritte: [
      { nr: 1, titel: "Beratung", erledigt: true, text: "Das Exposé gemeinsam durchgehen, die Annahmen im Rechner prüfen und offene Fragen zur Wohnung klären." },
      { nr: 2, titel: "Reservierung", text: "Gefällt dir die Wohnung, reservieren wir sie für dich. Damit ist sie für andere Interessenten gesperrt, solange die Finanzierung läuft." },
      { nr: 3, titel: "Finanzierung", text: "Unsere Finanzierungspartner holen Angebote ein. Du entscheidest, welches Darlehen zu dir passt." },
      { nr: 4, titel: "Notar", text: "Der Kaufvertrag geht dir vorab zu, wir besprechen ihn Punkt für Punkt. Beurkundet wird beim Notar, vor Ort oder per Vollmacht." },
      { nr: 5, titel: "Übergabe", text: "Nach Zahlung des Kaufpreises geht die Wohnung auf dich über. Mietvertrag und Kaution laufen ab dann auf dich." },
      { nr: 6, titel: "Verwaltung", text: "Die Mietverwaltung vor Ort übernimmt den Alltag. Du bekommst Miete, Abrechnung und Bericht, ohne selbst vor Ort zu sein." },
    ],
    zeitplan: [
      { nr: 1, titel: "Reservierung", frist: "Mit Anzahlung wirksam", zahlung: true, text: "Gefällt dir die Wohnung, reservieren wir sie für dich. Damit ist sie für andere Interessenten gesperrt, solange die Finanzierung läuft." },
      { nr: 2, titel: "Finanzierung", frist: "2 bis 6 Wochen", text: "Unsere Finanzierungspartner holen Angebote ein. Du entscheidest, welches Darlehen zu dir passt." },
      { nr: 3, titel: "Beantragung Kaufvertrag beim Notariat", frist: "14-Tage-Frist", text: "Der Kaufvertrag geht dir vorab zu, wir besprechen ihn Punkt für Punkt." },
      { nr: 4, titel: "Notartermin", frist: "in ca. 4 bis 6 Wochen", text: "Beurkundet wird beim Notar, vor Ort oder per Vollmacht." },
      { nr: 5, titel: "Kaufpreisfälligkeit", frist: "nach Regelung im Kaufvertrag", zahlung: true, text: "Nach Zahlung des Kaufpreises geht die Wohnung auf dich über. Mietvertrag und Kaution laufen ab dann auf dich." },
      { nr: 6, titel: "Übergabe an die Verwaltung", text: "Die Mietverwaltung vor Ort übernimmt den Alltag. Du bekommst Miete, Abrechnung und Bericht, ohne selbst vor Ort zu sein." },
    ],
    chancenRisiken: [
      {
        id: "mietausfall", titel: "Mieteinnahmen und Mietausfall",
        chance: "Eine vermietete Wohnung bringt vom ersten Monat an Miete. Steigt die Miete mit dem Markt, wächst der Überschuss über die Jahre.",
        risiko: "Ein Mieter kann ausfallen oder ausziehen. In dieser Zeit trägst du die Rate allein. Der Rechner setzt Leerstand als Annahme an, die tatsächliche Dauer kennt niemand im Voraus.",
      },
      {
        id: "zins", titel: "Zinsen und Anschlussfinanzierung",
        chance: "Ein fest vereinbarter Zins gibt dir über die Zinsbindung eine planbare Rate. Sinken die Zinsen, kann die Anschlussfinanzierung günstiger werden.",
        risiko: "Nach der Zinsbindung wird neu verhandelt. Sind die Zinsen dann höher, steigt die Rate. Der Rechner rechnet mit einem Zins über die gesamte Laufzeit, das ist eine Vereinfachung.",
      },
      {
        id: "instandhaltung", titel: "Instandhaltung und Hausgeld",
        chance: "Eine gepflegte Eigentümergemeinschaft mit Rücklage fängt viele Kosten auf. Sanierungen erhalten den Wert und lassen sich teils steuerlich absetzen.",
        risiko: "Dach, Heizung oder Fassade können Sonderumlagen auslösen, die über die Rücklage hinausgehen. Auch das Hausgeld kann steigen.",
      },
      {
        id: "wertentwicklung", titel: "Wertentwicklung",
        chance: "Über lange Zeiträume sind Wohnimmobilien in gefragten Lagen im Wert gestiegen. Die Tilgung baut unabhängig davon Vermögen auf.",
        risiko: "Preise können auch fallen, gerade nach Zinsanstiegen oder in schwächeren Lagen. Die Wertentwicklung im Rechner ist eine Annahme, keine Prognose.",
      },
      {
        id: "steuerrecht", titel: "Steuerrecht",
        chance: "Zinsen, Abschreibung und Kosten mindern dein zu versteuerndes Einkommen. Nach zehn Jahren ist ein Verkaufsgewinn nach heutigem Recht steuerfrei.",
        risiko: "Gesetze und Rechtsprechung ändern sich. Der Steuervorteil hängt von deiner persönlichen Situation ab und ist im Rechner nur eine Modellrechnung. Verbindlich ist die Auskunft deines Steuerberaters.",
      },
      {
        id: "liquiditaet", titel: "Liquidität und Eigenanteil",
        chance: "Mit Miete und Steuervorteil trägt sich die Wohnung zu einem großen Teil selbst. Was du monatlich zuzahlst, geht in die Tilgung, also in dein Vermögen.",
        risiko: "Der monatliche Eigenanteil muss dauerhaft aus deinem Einkommen kommen, auch bei Leerstand oder höheren Kosten. Ein Puffer für Unvorhergesehenes gehört dazu.",
      },
      {
        id: "standort", titel: "Standort",
        chance: "Wachsende Städte mit stabilen Arbeitgebern halten die Nachfrage nach Wohnraum hoch. Das stützt Miete und Wert.",
        risiko: "Verliert ein Standort Arbeitsplätze oder Einwohner, sinkt die Nachfrage. Auch die unmittelbare Umgebung kann sich verändern, etwa durch Neubau oder Verkehr.",
      },
      {
        id: "bautraeger", titel: "Verkäufer und Bauausführung",
        chance: "Bei sanierten Bestandswohnungen siehst du, was du kaufst. Beschlossene Maßnahmen am Gemeinschaftseigentum sind dokumentiert.",
        risiko: "Zugesagte Arbeiten können sich verzögern oder teurer werden. Bei einer Insolvenz des Verkäufers oder eines Handwerkers können Ansprüche ins Leere laufen.",
      },
      {
        id: "verwaltung", titel: "Verwaltung",
        chance: "Eine gute Mietverwaltung nimmt dir den Alltag ab und hält die Wohnung vermietet.",
        risiko: "Verwaltungen können wechseln, Kosten steigen oder die Qualität nachlassen. Die Verantwortung als Eigentümer bleibt bei dir.",
      },
      {
        id: "wiederverkauf", titel: "Wiederverkauf",
        chance: "Eine Eigentumswohnung lässt sich einzeln verkaufen, auch vermietet. In gefragten Lagen ist der Markt breit.",
        risiko: "Ein Verkauf braucht Zeit und kostet Geld. Wer vorzeitig verkaufen muss, bekommt womöglich weniger als den Einstandspreis, und innerhalb von zehn Jahren wird ein Gewinn besteuert.",
      },
      {
        id: "persoenlich", titel: "Deine persönliche Situation",
        chance: "Die Wohnung ergänzt deine Altersvorsorge mit einem Sachwert, der Miete bringt und getilgt wird.",
        risiko: "Einkommen, Familienstand und Gesundheit können sich ändern. Die Finanzierung läuft über viele Jahre. Sprich mit uns offen über Reserven und Absicherung, bevor du dich entscheidest.",
      },
    ],
    rechtlicheHinweise: [
      {
        titel: "Modellrechnung ohne Gewähr",
        text: "Alle Zahlen im Abschnitt Wirtschaftlichkeit sind eine Modellrechnung auf Grundlage der angezeigten Annahmen. Sie sind keine Zusage über Miete, Wertentwicklung, Zinsen oder Steuerwirkung. Abweichungen nach oben wie nach unten sind möglich und wahrscheinlich.",
      },
      {
        titel: "Steuern",
        text: "Steuerliche Aussagen beruhen auf dem heutigen Stand von Gesetz und Rechtsprechung und auf deinen Angaben. Ob und in welcher Höhe sie bei dir eintreten, hängt von deiner persönlichen Situation ab. Eine Steuerberatung ersetzen sie nicht; verbindlich ist die Auskunft deines Steuerberaters.",
      },
      {
        titel: "Stand der Angaben",
        text: "Angaben zu Wohnung, Gebäude, Miete und Kosten stammen vom Verkäufer, aus den Objektunterlagen und aus öffentlichen Quellen. Sie wurden mit Sorgfalt zusammengestellt, eine Gewähr für Richtigkeit und Vollständigkeit übernehmen wir nicht. Maßgeblich sind Kaufvertrag, Teilungserklärung und die Unterlagen der Eigentümergemeinschaft. Irrtum und Zwischenverkauf bleiben vorbehalten.",
      },
      {
        titel: "Bilder und Pläne",
        text: "Fotos, Grundrisse und Karten dienen der Veranschaulichung. Möbel und Einrichtungsgegenstände in Plänen sind nicht Bestandteil des Kaufs. Maßangaben in Grundrissen können vom Aufmaß abweichen.",
      },
      {
        titel: "Vermittlung und Vergütung",
        text: "OS Immobilien vermittelt diese Wohnung im Auftrag des Verkäufers. Für dich als Käufer fällt keine Maklerprovision an, sofern im Abschnitt Wirtschaftlichkeit nichts anderes ausgewiesen ist. OS Immobilien erhält vom Verkäufer eine Vergütung.",
      },
      {
        titel: "Haftung",
        text: "Für unrichtige oder unvollständige Angaben haftet OS Immobilien nur bei Vorsatz oder grober Fahrlässigkeit. Die Haftung für Schäden aus der Verletzung von Leben, Körper oder Gesundheit bleibt davon unberührt. Für das Eintreten einer bestimmten wirtschaftlichen oder steuerlichen Entwicklung übernehmen wir keine Gewähr.",
      },
      {
        titel: "Persönlicher Link und Datenschutz",
        text: "Dieses Exposé ist für dich persönlich erstellt. Der Link ist zeitlich begrenzt und nicht zur Weitergabe bestimmt. Die Seite zählt Aufrufe ohne Cookie und ohne deine IP-Adresse zu speichern. Die Karte im Abschnitt Mikrolage lädt ihre Kartenbilder von OpenStreetMap; dabei erfährt der Kartendienst deine IP-Adresse und den gezeigten Kartenausschnitt.",
      },
      {
        titel: "Widerruf",
        text: "Kommt ein Vertrag mit OS Immobilien über Fernkommunikationsmittel zustande, etwa eine Reservierungsvereinbarung, steht dir ein gesetzliches Widerrufsrecht zu. Die Belehrung erhältst du mit dem jeweiligen Vertrag.",
      },
    ],
    marktQuelle: "Aus der Marktanalyse, Quelle und Stand je Aussage.",
    mikrolageGruppen: {
      einkaufen: "Einkaufen und Versorgen",
      freizeit: "Freizeit und Erholung",
      infrastruktur: "Infrastruktur und Bildung",
    },
    analyseArt: {
      einkaufen: "Einkaufen",
      apotheken: "Apotheke",
      aerzte: "Arzt",
      freizeit: "Freizeit",
      oepnv: "Haltestelle",
      kindergaerten: "Kindergarten",
      schulen: "Schule",
      parks: "Park",
      behoerden: "Behörde",
      hochschulen: "Hochschule",
      kliniken: "Krankenhaus",
    },
    labels: {
      kaufpreis: "Kaufpreis",
      wohnflaeche: "Wohnfläche",
      zimmer: "Zimmer",
      kaltmieteMonat: "Kaltmiete je Monat",
      mietrendite: "Mietrendite",
      einwohner: "Einwohner",
      entwicklungFuenfJahre: "Entwicklung in fünf Jahren",
      leerstandsquote: "Leerstandsquote",
      angebotsmieteQm: "Angebotsmiete je m²",
      wohneinheit: "Wohneinheit",
      stadtteil: "Stadtteil",
      lageImGebaeude: "Lage im Gebäude",
      baujahr: "Baujahr",
      einheitenImHaus: "Einheiten im Haus",
      etagen: "Etagen",
      energietraeger: "Energieträger",
      endenergie: "Endenergie",
      stellplatz: "Stellplatz",
      hausgeldMonat: "Hausgeld je Monat",
      erhaltungsruecklage: "Erhaltungsrücklage",
      abschreibung: "Abschreibung",
      vermietung: "Vermietung",
      artDesAusweises: "Art des Ausweises",
      effizienzklasse: "Effizienzklasse",
      gueltigBis: "Gültig bis",
      kaufpreisGesamtobjekt: "Kaufpreis Gesamtobjekt",
      kaufpreisJeQm: "Kaufpreis je m²",
      wohnflaecheGesamt: "Wohnfläche gesamt",
      jahresnettokaltmiete: "Jahresnettokaltmiete",
      einheiten: "Einheiten",
      vermietungsstand: "Vermietungsstand",
      grundstueck: "Grundstück",
      stellplaetze: "Stellplätze",
      zustand: "Zustand",
      kaufpreiseDerEinheiten: "Kaufpreise der Einheiten",
      wohnflaechen: "Wohnflächen",
      imAngebot: "Im Angebot",
      verfuegbar: "Verfügbar",
    },
    keineAngabe: "Keine Angabe",
    keiner: "Keiner",
    inklusiveStellplatz: "inklusive Stellplatz",
    jahreskaltmieteDurchKaufpreis: "Jahreskaltmiete durch Kaufpreis",
    einwohnerzahl: "Einwohnerzahl",
    stellplatzMiete: (betrag) => `, ${betrag} Miete`,
    davonNichtUmlegbar: (betrag) => `davon nicht umlegbar ${betrag}`,
    anteilDieserEinheit: "Anteil dieser Einheit",
    sanierungJahr: (jahr) => `Sanierung ${jahr}`,
    vermietetSeitMonat: (monatJahr) => `Vermietet seit ${monatJahr}`,
    vermietet: "Vermietet",
    erstvermietung: "Erstvermietung",
    leerstand: "Leerstand",
    untertitelSaniert: (jahr) => `${jahr} saniert`,
    untertitelVermietet: "vermietet",
    untertitelErstvermietung: "Erstvermietung",
    untertitelFrei: "frei",
    chipBalkon: "Balkon",
    chipEnergieklasse: (klasse) => `Energieeffizienz Klasse ${klasse}`,
    chipStellplatzInklusive: "Stellplatz inklusive",
    chipAbschreibung: (satz) => `Abschreibung ${satz}`,
    chipErhoehteAbschreibung: (satz) => `Erhöhte Abschreibung ${satz}`,
    chipVerwaltungVorOrt: "Verwaltung vor Ort",
    chipVermietetSeit: (jahr) => `vermietet seit ${jahr}`,
    wohnung: "Wohnung",
    weKurz: "WE",
    standortOhneOrt: "Standort",
    quelleStandortdatenbank: "Standortdatenbank und Objektpflege",
    quelleHinterlegt: "Hinterlegte Standort- und Objektangaben",
    pflichtArtDesEnergieausweises: "Art des Energieausweises",
    pflichtEndenergiekennwert: "Endenergiekennwert",
    pflichtEnergietraeger: "Wesentlicher Energieträger",
    pflichtBaujahr: "Baujahr",
    pflichtEffizienzklasse: "Effizienzklasse",
    angabeBautraeger: "(Angabe des Bauträgers)",
    energieHinweis: (angabe, kennwert) => `Laut Angabe Klasse ${angabe}, nach dem Endenergiekennwert Klasse ${kennwert}. Die Skala zeigt den Kennwert.`,
    kostenMietverwaltung: "Mietverwaltung (SEV)",
    kostenWegVerwaltung: "WEG-Verwaltung",
    jeMonat: (betrag) => `${betrag} je Monat`,
    keineVerwaltung: "Keine Verwaltung",
    gesamtobjekt: "Gesamtobjekt",
    objektMitEinheiten: "Objekt mit Einheiten",
    spanne: (von, bis) => `${von} bis ${bis}`,
    summeDerEinheiten: "Summe der Einheiten",
    mieteJeMonat: (betrag, ausEinheiten) => `${betrag} je Monat${ausEinheiten ? ", Summe der Einheiten" : ""}`,
    davonVermietet: (anzahl) => `davon ${anzahl} vermietet`,
    ganzesHaus: "ganzes Haus",
    kaufnebenkostenZuzueglich: "zuzüglich Kaufnebenkosten",
    kaufnebenkostenRund: (betrag) => `zuzüglich Kaufnebenkosten rund ${betrag}`,
    kaufnebenkostenVerkaeufer: (betrag) => `Kaufnebenkosten rund ${betrag} trägt der Verkäufer`,
    herkunftMikrolage: "Entfernungen als Luftlinie, Einrichtungen aus OpenStreetMap, Stand der Abfrage.",
    herkunftLeer: "Zu dieser Adresse sind in OpenStreetMap keine Einrichtungen erfasst. Das heißt nicht, dass es keine gibt.",
  },
  en: {
    abschnitte: {
      start: { titel: "Overview", kurz: "Overview" },
      standort: { titel: "Location", kurz: "Location" },
      mikrolage: { titel: "Neighbourhood", kurz: "Neighbourhood" },
      objektdaten: { titel: "Property details", kurz: "Details" },
      grundriss: { titel: "Floor plan", kurz: "Floor plan" },
      wirtschaftlichkeit: { titel: "Financials", kurz: "Financials" },
      verwaltung: { titel: "Local management", kurz: "Management" },
      zeitplan: { titel: "Next steps and timeline", kurz: "Timeline" },
      "chancen-risiken": { titel: "Opportunities and risks", kurz: "Opportunities and risks" },
      rechtliches: { titel: "Legal notes", kurz: "Legal" },
      kontakt: { titel: "Contact", kurz: "Contact" },
    },
    verwaltungLeistungen: [
      "Re-letting when tenants change, including a credit check of applicants",
      "Tenancy agreement under current law, handover with a report",
      "Annual operating cost statement for the tenant",
      "Checking rent payments, reminders and deposit management",
      "Point of contact for the tenant on all everyday questions",
      "Commissioning minor repairs and coordinating tradespeople",
      "Reviewing rent adjustments and enforcing them within the legal framework",
      "Final statement on move-out, inspection and return of the deposit",
      "Liaison with the management of the owners’ association (WEG / Eigentümergemeinschaft)",
      "Annual report on rent, costs and the condition of the apartment",
      "Receipts collected for your tax return",
    ],
    naechsteSchritte: [
      { nr: 1, titel: "Consultation", erledigt: true, text: "Go through the exposé together, check the assumptions in the calculator and clarify any open questions about the apartment." },
      { nr: 2, titel: "Reservation", text: "If you like the apartment, we reserve it for you. It is then blocked for other interested parties while the financing is arranged." },
      { nr: 3, titel: "Financing", text: "Our financing partners obtain offers. You decide which loan suits you." },
      { nr: 4, titel: "Notary", text: "You receive the purchase contract in advance and we go through it point by point. The contract is notarised at the notary’s office, in person or by power of attorney." },
      { nr: 5, titel: "Handover", text: "Once the purchase price has been paid, the apartment passes to you. From then on, the tenancy agreement and the deposit are in your name." },
      { nr: 6, titel: "Management", text: "The local rental management takes care of day-to-day matters. You receive rent, statements and reports without having to be on site." },
    ],
    zeitplan: [
      { nr: 1, titel: "Reservation", frist: "Effective upon payment of the deposit", zahlung: true, text: "If you like the apartment, we reserve it for you. It is then blocked for other interested parties while the financing is arranged." },
      { nr: 2, titel: "Financing", frist: "2 to 6 weeks", text: "Our financing partners obtain offers. You decide which loan suits you." },
      { nr: 3, titel: "Purchase contract requested from the notary’s office", frist: "14-day period", text: "You receive the purchase contract in advance and we go through it point by point." },
      { nr: 4, titel: "Notary appointment (Notartermin)", frist: "in approx. 4 to 6 weeks", text: "The contract is notarised at the notary’s office, in person or by power of attorney." },
      { nr: 5, titel: "Purchase price due", frist: "as set out in the purchase contract", zahlung: true, text: "Once the purchase price has been paid, the apartment passes to you. From then on, the tenancy agreement and the deposit are in your name." },
      { nr: 6, titel: "Handover to the management", text: "The local rental management takes care of day-to-day matters. You receive rent, statements and reports without having to be on site." },
    ],
    chancenRisiken: [
      {
        id: "mietausfall", titel: "Rental income and loss of rent",
        chance: "A let apartment generates rent from the first month. If the rent rises with the market, the surplus grows over the years.",
        risiko: "A tenant may default or move out. During this time you carry the instalment alone. The calculator assumes a vacancy rate; nobody knows the actual duration in advance.",
      },
      {
        id: "zins", titel: "Interest and follow-up financing",
        chance: "A fixed interest rate gives you a predictable instalment for the fixed-interest period. If interest rates fall, the follow-up financing may become cheaper.",
        risiko: "After the fixed-interest period, the terms are renegotiated. If interest rates are higher then, the instalment rises. The calculator uses one interest rate for the entire term, which is a simplification.",
      },
      {
        id: "instandhaltung", titel: "Maintenance and service charge",
        chance: "A well-run owners’ association with a reserve absorbs many costs. Renovations preserve the value and are partly tax deductible.",
        risiko: "Roof, heating or facade can trigger special levies that exceed the reserve. The service charge (Hausgeld) may also rise.",
      },
      {
        id: "wertentwicklung", titel: "Value development",
        chance: "Over long periods, residential property in sought-after locations has increased in value. Regardless of this, repayment builds up wealth.",
        risiko: "Prices can also fall, especially after interest rate rises or in weaker locations. The value development in the calculator is an assumption, not a forecast.",
      },
      {
        id: "steuerrecht", titel: "Tax law",
        chance: "Interest, depreciation and costs reduce your taxable income. Under current law, a gain on sale after ten years is tax free.",
        risiko: "Laws and case law change. The tax benefit depends on your personal situation and is only a model calculation in the calculator. Only the advice of your tax adviser is binding.",
      },
      {
        id: "liquiditaet", titel: "Liquidity and own contribution",
        chance: "With rent and the tax benefit, the apartment largely pays for itself. What you contribute each month goes into repayment, and therefore into your wealth.",
        risiko: "The monthly own contribution must come from your income for the long term, even during vacancy or higher costs. A buffer for the unexpected is part of the plan.",
      },
      {
        id: "standort", titel: "Location",
        chance: "Growing cities with stable employers keep demand for housing high. This supports rent and value.",
        risiko: "If a location loses jobs or residents, demand falls. The immediate surroundings can also change, for example through new construction or traffic.",
      },
      {
        id: "bautraeger", titel: "Seller and construction work",
        chance: "With renovated existing apartments, you can see what you are buying. Measures resolved for the common property are documented.",
        risiko: "Promised works may be delayed or become more expensive. If the seller or a tradesperson becomes insolvent, claims may come to nothing.",
      },
      {
        id: "verwaltung", titel: "Management",
        chance: "Good rental management takes day-to-day matters off your hands and keeps the apartment let.",
        risiko: "Management companies can change, costs can rise or quality can decline. Responsibility as the owner remains with you.",
      },
      {
        id: "wiederverkauf", titel: "Resale",
        chance: "A condominium can be sold individually, even when let. In sought-after locations the market is broad.",
        risiko: "A sale takes time and costs money. If you have to sell early, you may get less than you paid, and within ten years a gain is taxed.",
      },
      {
        id: "persoenlich", titel: "Your personal situation",
        chance: "The apartment complements your retirement provision with a tangible asset that generates rent and is paid off over time.",
        risiko: "Income, marital status and health can change. The financing runs over many years. Talk to us openly about reserves and protection before you decide.",
      },
    ],
    rechtlicheHinweise: [
      {
        titel: "Model calculation without guarantee",
        text: "All figures in the Financials section are a model calculation based on the assumptions shown. They are not a promise regarding rent, value development, interest or tax effects. Deviations upwards as well as downwards are possible and likely.",
      },
      {
        titel: "Taxes",
        text: "Statements on tax are based on current law and case law and on your information. Whether and to what extent they apply to you depends on your personal situation. They do not replace tax advice; only the advice of your tax adviser is binding.",
      },
      {
        titel: "Status of the information",
        text: "Information on the apartment, building, rent and costs comes from the seller, the property documents and public sources. It has been compiled with care, but we accept no liability for its accuracy and completeness. The purchase contract, the declaration of division (Teilungserklärung) and the documents of the owners’ association are authoritative. Errors and prior sale excepted.",
      },
      {
        titel: "Images and plans",
        text: "Photos, floor plans and maps are for illustration only. Furniture and fittings shown in plans are not part of the purchase. Dimensions in floor plans may differ from the actual measurements.",
      },
      {
        titel: "Brokerage and remuneration",
        text: "OS Immobilien brokers this apartment on behalf of the seller. As the buyer, you do not pay a broker’s commission unless stated otherwise in the Financials section. OS Immobilien receives remuneration from the seller.",
      },
      {
        titel: "Liability",
        text: "OS Immobilien is liable for incorrect or incomplete information only in cases of intent or gross negligence. This does not affect liability for damage resulting from injury to life, body or health. We accept no liability for any particular economic or tax development occurring.",
      },
      {
        titel: "Personal link and data protection",
        text: "This exposé has been created for you personally. The link is valid for a limited time and is not intended to be passed on. The page counts visits without cookies and without storing your IP address. The map in the Neighbourhood section loads its map images from OpenStreetMap; in doing so, the map service learns your IP address and the map area shown.",
      },
      {
        titel: "Right of withdrawal",
        text: "If a contract with OS Immobilien is concluded by means of distance communication, such as a reservation agreement, you have a statutory right of withdrawal. You will receive the information on this right with the respective contract.",
      },
    ],
    marktQuelle: "From the market analysis, with source and date for each statement.",
    mikrolageGruppen: {
      einkaufen: "Shopping and daily needs",
      freizeit: "Leisure and recreation",
      infrastruktur: "Infrastructure and education",
    },
    analyseArt: {
      einkaufen: "Shopping",
      apotheken: "Pharmacy",
      aerzte: "Doctor",
      freizeit: "Leisure",
      oepnv: "Stop",
      kindergaerten: "Nursery",
      schulen: "School",
      parks: "Park",
      behoerden: "Public office",
      hochschulen: "University",
      kliniken: "Hospital",
    },
    labels: {
      kaufpreis: "Purchase price",
      wohnflaeche: "Living space",
      zimmer: "Rooms",
      kaltmieteMonat: "Net cold rent per month",
      mietrendite: "Gross rental yield",
      einwohner: "Population",
      entwicklungFuenfJahre: "Change over five years",
      leerstandsquote: "Vacancy rate",
      angebotsmieteQm: "Asking rent per m²",
      wohneinheit: "Unit",
      stadtteil: "District",
      lageImGebaeude: "Position in the building",
      baujahr: "Year of construction",
      einheitenImHaus: "Units in the building",
      etagen: "Floors",
      energietraeger: "Energy source",
      endenergie: "Final energy",
      stellplatz: "Parking space",
      hausgeldMonat: "Service charge (Hausgeld) per month",
      erhaltungsruecklage: "Maintenance reserve (Erhaltungsrücklage)",
      abschreibung: "Depreciation",
      vermietung: "Letting",
      artDesAusweises: "Type of certificate",
      effizienzklasse: "Efficiency class",
      gueltigBis: "Valid until",
      kaufpreisGesamtobjekt: "Purchase price, whole property",
      kaufpreisJeQm: "Purchase price per m²",
      wohnflaecheGesamt: "Total living space",
      jahresnettokaltmiete: "Annual net cold rent",
      einheiten: "Units",
      vermietungsstand: "Occupancy rate",
      grundstueck: "Plot",
      stellplaetze: "Parking spaces",
      zustand: "Condition",
      kaufpreiseDerEinheiten: "Unit purchase prices",
      wohnflaechen: "Living spaces",
      imAngebot: "On offer",
      verfuegbar: "Available",
    },
    keineAngabe: "Not specified",
    keiner: "None",
    inklusiveStellplatz: "including parking space",
    jahreskaltmieteDurchKaufpreis: "annual cold rent / purchase price",
    einwohnerzahl: "population",
    stellplatzMiete: (betrag) => `, ${betrag} rent`,
    davonNichtUmlegbar: (betrag) => `of which non-recoverable ${betrag}`,
    anteilDieserEinheit: "Share of this unit",
    sanierungJahr: (jahr) => `Renovation ${jahr}`,
    vermietetSeitMonat: (monatJahr) => `Let since ${monatJahr}`,
    vermietet: "Let",
    erstvermietung: "First letting",
    leerstand: "Vacant",
    untertitelSaniert: (jahr) => `renovated ${jahr}`,
    untertitelVermietet: "let",
    untertitelErstvermietung: "first letting",
    untertitelFrei: "vacant",
    chipBalkon: "Balcony",
    chipEnergieklasse: (klasse) => `Energy efficiency class ${klasse}`,
    chipStellplatzInklusive: "Parking space included",
    chipAbschreibung: (satz) => `Depreciation ${satz}`,
    chipErhoehteAbschreibung: (satz) => `Increased depreciation ${satz}`,
    chipVerwaltungVorOrt: "Local management",
    chipVermietetSeit: (jahr) => `let since ${jahr}`,
    wohnung: "Apartment",
    weKurz: "Unit",
    standortOhneOrt: "Location",
    quelleStandortdatenbank: "Location database and property records",
    quelleHinterlegt: "Stored location and property information",
    pflichtArtDesEnergieausweises: "Type of energy certificate",
    pflichtEndenergiekennwert: "Final energy figure",
    pflichtEnergietraeger: "Main energy source",
    pflichtBaujahr: "Year of construction",
    pflichtEffizienzklasse: "Efficiency class",
    angabeBautraeger: "(developer’s information)",
    energieHinweis: (angabe, kennwert) => `According to the information provided, class ${angabe}; based on the final energy figure, class ${kennwert}. The scale shows the figure.`,
    kostenMietverwaltung: "Rental management (SEV)",
    kostenWegVerwaltung: "WEG management",
    jeMonat: (betrag) => `${betrag} per month`,
    keineVerwaltung: "No management",
    gesamtobjekt: "Whole property",
    objektMitEinheiten: "Property with units",
    spanne: (von, bis) => `${von} to ${bis}`,
    summeDerEinheiten: "total of the units",
    mieteJeMonat: (betrag, ausEinheiten) => `${betrag} per month${ausEinheiten ? ", total of the units" : ""}`,
    davonVermietet: (anzahl) => `of which ${anzahl} let`,
    ganzesHaus: "whole building",
    kaufnebenkostenZuzueglich: "plus incidental purchase costs",
    kaufnebenkostenRund: (betrag) => `plus incidental purchase costs of approx. ${betrag}`,
    kaufnebenkostenVerkaeufer: (betrag) => `Incidental purchase costs of approx. ${betrag} are paid by the seller`,
    herkunftMikrolage: "Distances as the crow flies, facilities from OpenStreetMap, as at the time of the query.",
    herkunftLeer: "No facilities are recorded in OpenStreetMap for this address. That does not mean there are none.",
  },
};

/**
 * Auf Englisch zusätzlich vor die rechtlichen Hinweise: Die deutsche Fassung
 * ist maßgeblich. Die Hinweise sind noch ein Entwurf (Plan 4.2, Anwaltsfrage 8);
 * ob zweisprachig oder übersetzt mit Vorrangklausel, klärt der Anwalt.
 */
export const RECHTLICHE_HINWEISE_VORRANG_EN: RechtlicherHinweis = {
  titel: "German version prevails",
  text: "This English version is a translation provided for your convenience. In case of any discrepancy, the German version of these notes prevails.",
};

/**
 * Feste Werte aus Katalogen und Investagon-Schlüsseln, die auf einer
 * englischen Seite übersetzt erscheinen: Heizung, Art des Energieausweises,
 * Verwaltungsart, Objektart. Gespeichert bleibt der deutsche Wert; ein
 * unbekannter Wert (etwa von Hand gepflegt) bleibt, wie er ist.
 */
export const KATALOGWERTE_EN: Record<string, string> = {
  // Heizung (investagonFelder HEIZUNG_LABEL) und übliche Energieträger
  "Fernwärme": "District heating",
  "Strom": "Electricity",
  "Gas": "Gas",
  "Erdgas": "Natural gas",
  "Wärmepumpe": "Heat pump",
  "Öl": "Oil",
  "Heizöl": "Heating oil",
  "Pellets": "Wood pellets",
  "Holzpellets": "Wood pellets",
  "Solar": "Solar",
  // Art des Energieausweises
  "Verbrauchsausweis": "Energy consumption certificate (Verbrauchsausweis)",
  "Bedarfsausweis": "Energy demand certificate (Bedarfsausweis)",
  // Verwaltungsart
  "Keine Verwaltung": "No management",
  // Objektart (objektseiteDaten OBJEKTARTEN)
  "Sanierter Bestand": "Renovated existing building",
  "Neubau": "New build",
  "WG und Co-Living": "Shared living and co-living",
  // Ja und Nein aus Investagon
  "Ja": "Yes",
  "Nein": "No",
};

/** Ein Katalogwert auf Englisch, sonst unverändert. */
export function katalogwert(wert: string | undefined, sprache: "de" | "en"): string | undefined {
  if (!wert || sprache !== "en") return wert;
  return KATALOGWERTE_EN[wert.trim()] ?? wert;
}

/**
 * Eine deutsch geschriebene Zahl in einem fertigen Text auf Englisch umstellen:
 * „3,50 %“ zu „3.50%“, „5.200“ zu „5,200“. Für Werte, die eine Bibliothek
 * fest deutsch formatiert (Investagon-Felder, Rechnerhinweise).
 */
export function zahlenAufEnglisch(text: string): string {
  return text
    .replace(/(\d)\s%/g, "$1%")
    .replace(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+,\d+/g, (z) => {
      const [ganz, nachkomma] = z.split(",");
      const mitKomma = ganz.replace(/\./g, ",");
      return nachkomma !== undefined ? `${mitKomma}.${nachkomma}` : mitKomma;
    });
}

/** Die Texte für die Sprache; alles außer Englisch ist Deutsch. */
export function exposeInhaltTexte(sprache: "de" | "en" | undefined | null): ExposeInhaltTexte {
  return EXPOSE_INHALT_TEXTE[sprache === "en" ? "en" : "de"];
}

/**
 * Die Art eines gemessenen Orts auf Englisch. Die Messung speichert sie
 * deutsch (`_shared/standort-messung.ts`); gespeichert bleibt sie so, nur die
 * Anzeige wechselt. Unbekannte Arten bleiben, wie sie sind.
 */
const ORTSART_EN: Record<string, string> = {
  "Supermarkt": "Supermarket", "Nahversorger": "Convenience store", "Bäcker": "Bakery", "Metzgerei": "Butcher",
  "Drogerie": "Chemist", "Einkaufszentrum": "Shopping centre", "Arztpraxis": "Doctor’s surgery", "Zahnarzt": "Dentist",
  "Praxisklinik": "Outpatient clinic", "Apotheke": "Pharmacy", "Bus": "Bus", "Straßenbahn": "Tram", "Bahnhof": "Railway station",
  "Haltepunkt": "Train stop", "Haltestelle": "Stop", "Sportzentrum": "Sports centre", "Fitnessstudio": "Gym", "Spielplatz": "Playground",
  "Kino": "Cinema", "Theater": "Theatre", "Park": "Park", "Grünanlage": "Green space", "Rathaus": "Town hall",
  "Amt oder Behörde": "Public office", "Behörde": "Public office", "Polizei": "Police", "Post": "Post office", "Bibliothek": "Library",
  "Hochschule": "University", "Krankenhaus": "Hospital", "Kindergarten": "Nursery", "Kita": "Nursery", "Schule": "School",
  "Grundschule": "Primary school", "Arzt": "Doctor", "Einkaufen": "Shopping", "Freizeit": "Leisure",
  "Industrie- oder Gewerbefläche": "Industrial or commercial area", "Gewerbefläche": "Commercial area",
};

/** Die Art eines Orts in der Sprache der Seite. Auf Deutsch unverändert. */
export function ortsartText(art: string, sprache?: "de" | "en"): string {
  if (sprache !== "en") return art;
  return ORTSART_EN[art.trim()] ?? art;
}

/**
 * Der Herkunftssatz der Messung auf Englisch. Gespeichert ist er deutsch
 * (`mikrolage_hinweis`); gebaut wird er aus der gespeicherten Genauigkeit
 * neu, damit er weiter sagt, ab wo gemessen wurde.
 */
export function herkunftHinweisEn(leer: boolean, genauigkeit: unknown): string {
  const t = EXPOSE_INHALT_TEXTE.en;
  if (leer) return t.herkunftLeer;
  const zusatz = genauigkeit === "strasse"
    ? " Measured from the street, as the house number is not recorded in OpenStreetMap."
    : genauigkeit === "plz"
      ? " Measured from the centre of the postcode area, not from the house address."
      : genauigkeit === "ort"
        ? " Measured from the town centre, not from the house address."
        : "";
  return `${t.herkunftMikrolage}${zusatz}`;
}
