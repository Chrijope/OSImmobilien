/**
 * Alle Texte zu den Kennzahlen des Investmentrechners: die Überschriften der
 * Kacheln, die Bausteine der Rechenwege darunter und das Glossar „So entstehen
 * die Zahlen“.
 *
 * Warum eine eigene Datei: Die Kalkulation soll später auch auf Englisch
 * erscheinen. Dann entsteht neben `KENNZAHL_TEXTE_DE` ein zweites Objekt
 * derselben Gestalt (`KennzahlTexte`), und kennzahlErklaerungen.ts wählt nur
 * noch aus. Seit dem 25.09.2026 steht es da: `KENNZAHL_TEXTE_EN`. Gerechnet und formatiert wird hier nichts; Texte mit einer Zahl
 * darin sind kleine Funktionen, damit die Satzstellung je Sprache frei bleibt.
 *
 * Das Minuszeichen in Formeln ist das Rechenzeichen U+2212, kein
 * Gedankenstrich.
 */

export type GlossarSchluessel =
  | "kaufpreisGesamt"
  | "moebel"
  | "erhaltungsaufwand"
  | "ruecklage"
  | "grundGebaeude"
  | "kaufnebenkosten"
  | "gesamtkosten"
  | "darlehen"
  | "afaBasis"
  | "moebelAfa"
  | "kaltmiete"
  | "kreditrate"
  | "tilgung"
  | "cashflowVorSteuer"
  | "cashflowNachSteuer"
  | "bruttorendite"
  | "nettorendite"
  | "steuerlichesErgebnis"
  | "grenzsteuersatz"
  | "steuereffekt"
  | "steuereffektGesamt"
  | "immobilienwert"
  | "restschuld"
  | "immobilieMinusRestschuld"
  | "selbstEingezahlt"
  | "vermoegensaufbau"
  | "gesamtvermoegen"
  | "eigenkapitalrendite"
  | "irr";

export type GlossarGruppenSchluessel = "basis" | "monat" | "steuer" | "vermoegen";

export interface GlossarEintragText {
  titel: string;
  /** Ein Satz, höchstens zwei: was die Zahl bedeutet. */
  bedeutung: string;
  /** Die vollständige Formel, so wie der Rechenkern sie rechnet. */
  formel: string;
}

export interface KennzahlTexte {
  /** Überschriften der Kacheln in Analyse und Berechnung. */
  kacheln: {
    kaltmiete: string;
    kreditrate: string;
    bruttorendite: string;
    nettorendite: string;
    immobilienwert: (jahr: number) => string;
    restschuld: (jahr: number) => string;
    immobilieMinusRestschuld: (jahr: number) => string;
    selbstEingezahlt: (jahre: number) => string;
    ueberschuss: (jahre: number) => string;
    bekommstDuRaus: string;
    zahlstDuDrauf: string;
    cashflowVorSteuer: string;
    cashflowNachSteuer: string;
    vermoegensaufbau: string;
    gesamtvermoegen: (jahre: number) => string;
    steuereffektErstesJahr: string;
    steuereffektGesamt: (jahre: number) => string;
    eigenkapitalrendite: string;
  };
  /** Bausteine der Rechenweg-Zeilen. Beschriftungen stehen vor dem Wert. */
  glieder: {
    miete: string;
    rate: string;
    nichtUmlagefaehig: string;
    ruecklageZufuehrung: string;
    steuereffekt: string;
    steuermehrbelastung: string;
    jahresmiete: string;
    jahresmieteNachLeerstand: string;
    kaufpreis: string;
    gesamtkosten: string;
    kaltmiete: string;
    leerstand: string;
    bankdarlehen: string;
    nachrang: string;
    kfwDarlehen: string;
    kfwRate: string;
    tilgungszuschuss: string;
    zins: string;
    tilgung: string;
    immobilienanteil: string;
    wertzuwachs: string;
    wertverlust: string;
    moebelRestbuchwert: string;
    ruecklage: string;
    darlehen: string;
    tilgungJahre: (jahre: number) => string;
    immobilienwert: string;
    restschuld: string;
    immobilieMinusRestschuld: (jahr: number) => string;
    standZuBeginn: string;
    monate: string;
    monateMitZuzahlung: string;
    monateMitUeberschuss: string;
    durchschnitt: string;
    imMonat: string;
    cashflowSumme: (jahre: number) => string;
    zuzahlungen: (jahre: number) => string;
    zuzahlungenSaldiert: (jahre: number) => string;
    steuerOhneImmobilie: string;
    steuerMitImmobilie: string;
    erstesJahr: string;
    restlicheJahre: (letztesJahr: number) => string;
    vermoegensaufbau: string;
    jahre: string;
    eigenkapital: string;
    zuzahlungMonat: string;
  };
  /** Kurze Zusätze unter den großen Zahlen. */
  zusaetze: {
    imMonat: string;
    davonTilgung: (betrag: string) => string;
    jeEingezahltemEuro: (faktor: string) => string;
    steuereffektMonat: (betrag: string) => string;
    steuereffektZeitraum: (von: number, bis: number) => string;
    /** Die Einordnung unter der Eigenkapitalrendite. */
    eigenkapitalrenditeHinweis: string;
    /** Statt der Zahl, wenn weder Eigenkapital noch eine monatliche Zuzahlung vor Steuer da ist. */
    eigenkapitalrenditeNichtBestimmbar: string;
    /**
     * Der Gegenfall zu den Kaufnebenkosten. `rendite` ist `null`, wenn sie im
     * Gegenfall nicht bestimmbar wäre. Beträge kommen formatiert.
     */
    eigenkapitalrenditeNebenkosten: (fall: {
      selbstGezahlt: boolean;
      kaufnebenkosten: string;
      rendite: string | null;
      rate: string;
    }) => string;
    /** Der kurze Pflichthinweis unter den Kacheln der Analyse. */
    beispielrechnung: string;
  };
  glossar: {
    ueberschriftAnalyse: string;
    ueberschriftDokument: string;
    einleitung: string;
    gruppen: Record<GlossarGruppenSchluessel, string>;
    eintraege: Record<GlossarSchluessel, GlossarEintragText>;
    rundung: string;
    keineSteuerberatung: string;
  };
}

export const KENNZAHL_TEXTE_DE: KennzahlTexte = {
  kacheln: {
    kaltmiete: "Kaltmiete p. M.",
    kreditrate: "Kreditrate gesamt p. M.",
    bruttorendite: "Bruttorendite",
    nettorendite: "Nettorendite",
    immobilienwert: (jahr) => `Immobilienwert ${jahr}`,
    restschuld: (jahr) => `Restschuld ${jahr}`,
    immobilieMinusRestschuld: (jahr) => `Immobilie minus Restschuld ${jahr}`,
    selbstEingezahlt: (jahre) => `Selbst eingezahlt in ${jahre} Jahren`,
    ueberschuss: (jahre) => `Überschuss in ${jahre} Jahren`,
    bekommstDuRaus: "Das bekommst du raus",
    zahlstDuDrauf: "Das zahlst du monatlich drauf",
    cashflowVorSteuer: "Cashflow vor Steuer pro Monat",
    cashflowNachSteuer: "Cashflow nach Steuer pro Monat",
    vermoegensaufbau: "Vermögensaufbau",
    gesamtvermoegen: (jahre) => `Gesamtvermögen nach ${jahre} Jahren`,
    steuereffektErstesJahr: "Steuereffekt im ersten Jahr",
    steuereffektGesamt: (jahre) => `Steuereffekt ${jahre} Jahre gesamt`,
    eigenkapitalrendite: "Eigenkapitalrendite p. a.",
  },
  glieder: {
    miete: "Miete",
    rate: "Rate",
    nichtUmlagefaehig: "nicht umlagefähige Kosten",
    ruecklageZufuehrung: "Zuführung Rücklage",
    steuereffekt: "Steuereffekt",
    steuermehrbelastung: "Steuermehrbelastung",
    jahresmiete: "Jahresmiete",
    jahresmieteNachLeerstand: "Jahresmiete nach Leerstand",
    kaufpreis: "Kaufpreis",
    gesamtkosten: "Gesamtkosten",
    kaltmiete: "Kaltmiete",
    leerstand: "Leerstand",
    bankdarlehen: "Bankdarlehen",
    nachrang: "Nachrang",
    kfwDarlehen: "KfW-Darlehen",
    kfwRate: "KfW-Rate",
    tilgungszuschuss: "Tilgungszuschuss",
    zins: "Zins",
    tilgung: "Tilgung",
    immobilienanteil: "Immobilienanteil",
    wertzuwachs: "Wertzuwachs",
    wertverlust: "Wertverlust",
    moebelRestbuchwert: "Möbel-Restbuchwert",
    ruecklage: "Rücklage",
    darlehen: "Darlehen",
    tilgungJahre: (jahre) => `Tilgung ${jahre} Jahre`,
    immobilienwert: "Immobilienwert",
    restschuld: "Restschuld",
    immobilieMinusRestschuld: (jahr) => `Immobilie minus Restschuld ${jahr}`,
    standZuBeginn: "Stand zu Beginn",
    monate: "Monate",
    monateMitZuzahlung: "Monate mit Zuzahlung",
    monateMitUeberschuss: "Monate mit Überschuss",
    durchschnitt: "Ø",
    imMonat: "im Monat",
    cashflowSumme: (jahre) => `Cashflow nach Steuer ${jahre} Jahre`,
    zuzahlungen: (jahre) => `Zuzahlungen nach Steuer ${jahre} Jahre`,
    zuzahlungenSaldiert: (jahre) => `Zuzahlungen nach Steuer ${jahre} Jahre, saldiert`,
    steuerOhneImmobilie: "Steuer ohne Immobilie",
    steuerMitImmobilie: "Steuer mit Immobilie",
    erstesJahr: "1. Jahr",
    restlicheJahre: (letztesJahr) => `2. bis ${letztesJahr}. Jahr`,
    vermoegensaufbau: "Vermögensaufbau",
    jahre: "Jahre",
    eigenkapital: "Eigenkapital",
    zuzahlungMonat: "Zuzahlung vor Steuer",
  },
  zusaetze: {
    imMonat: "im Monat",
    davonTilgung: (betrag) => `davon ${betrag} Tilgung`,
    jeEingezahltemEuro: (faktor) => `${faktor} € je eingezahltem Euro`,
    steuereffektMonat: (betrag) => `${betrag} im Monat, im Cashflow nach Steuer enthalten`,
    steuereffektZeitraum: (von, bis) => `${von} bis ${bis}, Summe aus der Jahrestabelle`,
    eigenkapitalrenditeHinweis:
      "Weniger Eigenkapital heißt höhere Rendite, aber auch höhere Rate.",
    eigenkapitalrenditeNichtBestimmbar:
      "Nicht sinnvoll bestimmbar: Du setzt kein Eigenkapital ein und zahlst monatlich nichts zu.",
    eigenkapitalrenditeNebenkosten: ({ selbstGezahlt, kaufnebenkosten, rendite, rate }) =>
      selbstGezahlt
        ? `Kaufnebenkosten ${kaufnebenkosten} mitfinanziert: ${rendite ?? "nicht bestimmbar"}, Rate ${rate} höher.`
        : `Kaufnebenkosten ${kaufnebenkosten} selbst gezahlt: ${rendite ?? "nicht bestimmbar"}, Rate ${rate} niedriger.`,
    beispielrechnung: "Unverbindliche Beispielrechnung, kein Angebot. Wert- und Mietsteigerungen sind nicht garantiert.",
  },
  glossar: {
    ueberschriftAnalyse: "So entstehen die Zahlen",
    ueberschriftDokument: "Glossar: So entstehen die Zahlen",
    einleitung:
      "Jede Zahl dieser Kalkulation mit ihrer Bedeutung und der Formel, nach der sie gerechnet wird. Alle Beträge beziehen sich auf deinen Anteil am Investment, monatliche Werte auf das erste Jahr.",
    gruppen: {
      basis: "Kalkulationsbasis",
      monat: "Miete, Rate und Cashflow",
      steuer: "Steuer",
      vermoegen: "Vermögen am Ende",
    },
    eintraege: {
      kaufpreisGesamt: {
        titel: "Kaufpreis gesamt",
        bedeutung:
          "Der Preis aus dem Kaufvertrag. Möbel, Erhaltungsaufwand und Rücklagenanteil sind darin enthalten und werden nicht noch einmal addiert.",
        formel: "Kaufpreis gesamt = Grundstücksanteil + Gebäudeanteil + Möbel + Rücklage",
      },
      moebel: {
        titel: "davon Möbel/Inventar",
        bedeutung:
          "Der Anteil für Küche, Einrichtung und Inventar. Er wird getrennt vom Gebäude abgeschrieben und steigt nicht im Wert, sondern zählt mit seinem Restbuchwert.",
        formel: "Möbel-Restbuchwert = Möbel-AfA-Basis − bisherige Möbel-AfA",
      },
      erhaltungsaufwand: {
        titel: "davon Erhaltungsaufwand: abziehen oder aktivieren",
        bedeutung:
          "Der Anteil für Renovierung, er steckt im Gebäudeanteil. „Abziehen“ setzt ihn als Werbungskosten an und nimmt ihn aus der AfA-Basis, „Aktivieren“ lässt ihn in der Gebäude-AfA. Über 15 Prozent der Gebäudekosten drohen anschaffungsnahe Herstellungskosten.",
        formel:
          "Abziehen: Abzug je Jahr = Erhaltungsaufwand ÷ Verteilungsjahre. Aktivieren: Abschreibung mit der Gebäude-AfA",
      },
      ruecklage: {
        titel: "davon Instandhaltungsrücklage",
        bedeutung:
          "Dein Anteil am Guthaben der Eigentümergemeinschaft. Er wird nicht abgeschrieben und ist keine Werbungskosten, fällt aber unter die Grunderwerbsteuer.",
        formel: "Rücklage zählt im Immobilienwert mit ihrem Betrag, ohne Wertsteigerung",
      },
      grundGebaeude: {
        titel: "Grundstücks- und Gebäudeanteil",
        bedeutung:
          "Nur das Gebäude wird abgeschrieben, Grund und Boden nicht. Geteilt wird der Kaufpreis ohne Möbel und Rücklage.",
        formel:
          "Immobilienanteil = Kaufpreis gesamt − Möbel − Rücklage; Gebäudeanteil = Immobilienanteil × Gebäudeanteil %; Grundstücksanteil = Immobilienanteil − Gebäudeanteil",
      },
      kaufnebenkosten: {
        titel: "Kaufnebenkosten, anteilig verteilt",
        bedeutung:
          "Grunderwerbsteuer, Notar, Grundbuch, Makler und Sonstiges auf den Gesamtkaufpreis ohne Erhaltungsaufwand, denn der ist im Notarvertrag als gesonderte Leistung ausgewiesen. Sind die Möbel im Notarvertrag gesondert ausgewiesen, fällt auf sie keine Grunderwerbsteuer an.",
        formel:
          "Nebenkosten = Sätze × (Kaufpreis gesamt − Erhaltungsaufwand); Nebenkosten Möbel = Nebenkosten × Möbel ÷ (Kaufpreis gesamt − Erhaltungsaufwand) (bei gesondertem Ausweis ohne Grunderwerbsteuer); Nebenkosten Gebäude = (Nebenkosten − Nebenkosten Möbel) × Gebäudeanteil %; der Rest gehört zum Grundstück",
      },
      gesamtkosten: {
        titel: "Gesamtkosten",
        bedeutung: "Was der Kauf insgesamt kostet.",
        formel: "Gesamtkosten = Kaufpreis gesamt + Kaufnebenkosten + Finanzierungsnebenkosten",
      },
      darlehen: {
        titel: "Bankdarlehen",
        bedeutung: "Der Teil der Gesamtkosten, den die Bank finanziert.",
        formel: "Bankdarlehen = Kaufpreis gesamt + Kaufnebenkosten − Eigenkapital − Nachrangdarlehen, mindestens 0. Die Finanzierungsnebenkosten trägt das Eigenkapital",
      },
      afaBasis: {
        titel: "AfA-Basis und Gebäude-AfA",
        bedeutung: "Die Abschreibung des Gebäudes mindert jedes Jahr das zu versteuernde Einkommen.",
        formel:
          "AfA-Basis = Gebäudeanteil + Nebenkosten Gebäude − Erhaltungsaufwand (nur bei „Abziehen“); Gebäude-AfA je Jahr = AfA-Basis × AfA-Satz, degressiv Restbuchwert × Satz, dazu gegebenenfalls Sonder-AfA",
      },
      moebelAfa: {
        titel: "Möbel-AfA",
        bedeutung: "Möbel werden über ihre Nutzungsdauer abgeschrieben, samt ihrem Anteil an den Nebenkosten.",
        formel: "Möbel-AfA je Jahr = (Möbel + Nebenkosten Möbel) ÷ Nutzungsdauer",
      },
      kaltmiete: {
        titel: "Kaltmiete p. M.",
        bedeutung: "Die Miete ohne umlagefähige Nebenkosten, abzüglich des angesetzten Leerstands.",
        formel: "Kaltmiete p. M. = Kaltmiete laut Mietvertrag × (100 % − Leerstand)",
      },
      kreditrate: {
        titel: "Kreditrate gesamt p. M.",
        bedeutung: "Zins und Tilgung, die monatlich an die Bank gehen.",
        formel: "Kreditrate = Darlehen × (Sollzins + anfängliche Tilgung) ÷ 12, für jedes Darlehen",
      },
      tilgung: {
        titel: "Tilgung",
        bedeutung:
          "Der Teil der Rate, der die Schuld senkt. Er wächst jedes Jahr, weil die Zinsen mit der Restschuld sinken.",
        formel: "Tilgung je Jahr = Jahresrate − Zinsen auf die Restschuld",
      },
      cashflowVorSteuer: {
        titel: "Cashflow vor Steuer",
        bedeutung: "Was von der Miete nach Rate und Kosten übrig bleibt, bevor die Steuer wirkt.",
        formel: "Cashflow vor Steuer = Miete − Rate − nicht umlagefähige Kosten − Zuführung zur Instandhaltungsrücklage",
      },
      cashflowNachSteuer: {
        titel: "Cashflow nach Steuer",
        bedeutung:
          "Was auf deinem Konto ankommt. Ist die Zahl negativ, zahlst du monatlich drauf, ist sie positiv, bekommst du etwas raus.",
        formel: "Cashflow nach Steuer = Cashflow vor Steuer + Steuereffekt",
      },
      bruttorendite: {
        titel: "Bruttorendite",
        bedeutung: "Die Jahresmiete im Verhältnis zum Kaufpreis, ohne Kosten und Nebenkosten.",
        formel: "Bruttorendite = Jahreskaltmiete ÷ Kaufpreis gesamt",
      },
      nettorendite: {
        titel: "Nettorendite",
        bedeutung: "Wie die Bruttorendite, aber nach Leerstand und Kosten und einschließlich der Nebenkosten.",
        formel: "Nettorendite = (Jahresmiete nach Leerstand − nicht umlagefähige Kosten − Zuführung zur Instandhaltungsrücklage) ÷ Gesamtkosten",
      },
      steuerlichesErgebnis: {
        titel: "Ergebnis aus Vermietung (V+V)",
        bedeutung:
          "Das steuerliche Ergebnis der Wohnung. Ist es negativ, senkt es dein zu versteuerndes Einkommen. Die Tilgung ist nicht absetzbar.",
        formel:
          "Ergebnis V+V = Miete − Kosten − Zinsen − Gebäude-AfA − Sonder-AfA − Möbel-AfA − abgezogener Erhaltungsaufwand",
      },
      grenzsteuersatz: {
        titel: "Grenzsteuersatz",
        bedeutung:
          "Der Steuersatz auf den nächsten Euro Einkommen, mit Solidaritätszuschlag und Kirchensteuer. Er zeigt ungefähr, wie viel Steuer ein Euro Verlust spart.",
        formel:
          "Grenzsteuersatz = (Steuer auf zvE + 100 € − Steuer auf zvE) ÷ 100 €; im manuellen Modus der eingetragene Satz",
      },
      steuereffekt: {
        titel: "Steuereffekt im ersten Jahr",
        bedeutung:
          "Um so viel ändert sich deine Steuer durch die Immobilie. Positiv heißt Ersparnis, negativ heißt Mehrbelastung.",
        formel:
          "Steuereffekt = Steuer ohne Immobilie − Steuer mit Immobilie; mit Immobilie heißt zvE + Ergebnis V+V nach Tarif 2026 (manuell: Ergebnis V+V × Grenzsteuersatz)",
      },
      steuereffektGesamt: {
        titel: "Steuereffekt gesamt",
        bedeutung: "Alle Steuereffekte des Betrachtungszeitraums zusammen, Jahr für Jahr aus der Jahrestabelle.",
        formel: "Steuereffekt gesamt = Steuereffekt 1. Jahr + 2. Jahr + … + letztes Jahr",
      },
      immobilienwert: {
        titel: "Immobilienwert",
        bedeutung:
          "Der modellierte Wert am Ende. Nur Grund und Gebäude steigen im Wert, Möbel zählen mit dem Restbuchwert, die Rücklage mit ihrem Betrag.",
        formel: "Immobilienwert = Immobilienanteil × (1 + Wertsteigerung)^Jahre + Möbel-Restbuchwert + Rücklage",
      },
      restschuld: {
        titel: "Restschuld",
        bedeutung: "Was am Ende bei der Bank noch offen ist.",
        formel: "Restschuld = Darlehen − Summe der Tilgungen",
      },
      immobilieMinusRestschuld: {
        titel: "Immobilie minus Restschuld",
        bedeutung: "Der Teil der Immobilie, der dir am Ende schuldenfrei gehört.",
        formel: "Immobilie minus Restschuld = Immobilienwert − Restschuld",
      },
      selbstEingezahlt: {
        titel: "Selbst eingezahlt oder Überschuss",
        bedeutung:
          "Alle monatlichen Zuzahlungen nach Steuer zusammengezählt, Jahre mit Überschuss werden nicht gegengerechnet. Zahlst du nie zu, steht hier die Summe der Überschüsse.",
        formel: "Selbst eingezahlt = Summe der negativen Cashflows nach Steuer = Ø je Monat × Monate mit Zuzahlung",
      },
      vermoegensaufbau: {
        titel: "Vermögensaufbau",
        bedeutung:
          "Wie viel Vermögen in der Immobilie je Monat entsteht, mit Wertzuwachs. Die Tilgung daneben ist der sichere Teil davon.",
        formel:
          "Vermögensaufbau p. M. = (Immobilie minus Restschuld am Ende − Stand zu Beginn) ÷ Monate; Stand zu Beginn = Immobilienanteil + Möbel-AfA-Basis + Rücklage − Darlehen, mindestens 0; je eingezahltem Euro = Vermögensaufbau gesamt ÷ (Eigenkapital + Zuzahlungen)",
      },
      gesamtvermoegen: {
        titel: "Gesamtvermögen",
        bedeutung:
          "Was dir am Ende gehört: die Immobilie ohne Schulden plus alles, was über die Jahre auf deinem Konto angekommen oder davon abgeflossen ist.",
        formel: "Gesamtvermögen = Immobilie minus Restschuld + Summe der Cashflows nach Steuer",
      },
      eigenkapitalrendite: {
        titel: "Eigenkapitalrendite p. a.",
        bedeutung:
          "Wie viel Vermögen im Schnitt pro Jahr entsteht, im Verhältnis zu deinem Eigenkapital und zwölf Monaten Zuzahlung vor Steuer. Weniger Eigenkapital ergibt eine höhere Zahl, aber auch eine höhere Rate.",
        formel:
          "Eigenkapitalrendite p. a. = (Vermögensaufbau im Betrachtungszeitraum ÷ Jahre) ÷ (Eigenkapital + Zuzahlung vor Steuer je Monat × 12); Vermögensaufbau im Betrachtungszeitraum = Vermögensaufbau p. M. × Monate; Zuzahlung vor Steuer = negativer Cashflow vor Steuer pro Monat im ersten Jahr, ein Überschuss zählt als 0",
      },
      irr: {
        titel: "Interner Zinsfuß (IRR)",
        bedeutung:
          "Der Zins, den dein eingesetztes Geld rechnerisch bringt. Er steht im Objektvergleich als „Interner Zinsfuß (IRR) p. a.“ und hängt stark an Finanzierung und Wertsteigerung: Wer weniger einbringt, bekommt die höhere Zahl.",
        formel:
          "Der Zinssatz, bei dem −Eigenkapital + abgezinste Cashflows nach Steuer + Immobilie minus Restschuld im letzten Jahr zusammen 0 ergeben",
      },
    },
    rundung:
      "Die Rechenwege unter den Zahlen nennen gerundete Werte. Verschiebt die Rundung das Ergebnis um einen Cent oder Euro, steht ≈ statt =. Gerechnet wird immer ungerundet.",
    keineSteuerberatung:
      "Keine Steuerberatung: Die Steuerwirkung ist ein Modell auf Basis deiner Angaben und des Tarifs 2026. Ob und in welcher Höhe das Finanzamt sie anerkennt, klärt deine Steuerberatung.",
  },
};

/**
 * Dieselben Texte auf Englisch, seit dem 25.09.2026 (Plan Kundensprache,
 * Etappe 5). Begriffe nach `src/lib/kundenspracheGlossar.ts`: britisches
 * Englisch, deutsche Steuerbegriffe beim ersten Auftreten mit dem deutschen
 * Wort in Klammern. Die Du-Ansprache wird zu einem freundlichen „you“.
 *
 * Vor dem ersten Einsatz bei einem Kunden prüft eine Person mit sehr gutem
 * Englisch die Liste Deutsch neben Englisch (Plan, Übersetzungsweg).
 */
export const KENNZAHL_TEXTE_EN: KennzahlTexte = {
  kacheln: {
    kaltmiete: "Net cold rent per month",
    kreditrate: "Total loan instalment per month",
    bruttorendite: "Gross rental yield",
    nettorendite: "Net rental yield",
    immobilienwert: (jahr) => `Property value ${jahr}`,
    restschuld: (jahr) => `Remaining debt ${jahr}`,
    immobilieMinusRestschuld: (jahr) => `Property minus remaining debt ${jahr}`,
    selbstEingezahlt: (jahre) => `Paid in yourself over ${jahre} years`,
    ueberschuss: (jahre) => `Surplus over ${jahre} years`,
    bekommstDuRaus: "What you get out",
    zahlstDuDrauf: "What you pay in each month",
    cashflowVorSteuer: "Cash flow before tax per month",
    cashflowNachSteuer: "Cash flow after tax per month",
    vermoegensaufbau: "Wealth building",
    gesamtvermoegen: (jahre) => `Total wealth after ${jahre} years`,
    steuereffektErstesJahr: "Tax effect in the first year",
    steuereffektGesamt: (jahre) => `Tax effect over ${jahre} years in total`,
    eigenkapitalrendite: "Return on equity p.a.",
  },
  glieder: {
    miete: "Rent",
    rate: "Instalment",
    nichtUmlagefaehig: "non-recoverable costs",
    ruecklageZufuehrung: "Contribution to reserve",
    steuereffekt: "Tax effect",
    steuermehrbelastung: "Additional tax",
    jahresmiete: "Annual rent",
    jahresmieteNachLeerstand: "Annual rent after vacancy",
    kaufpreis: "Purchase price",
    gesamtkosten: "Total costs",
    kaltmiete: "Net cold rent",
    leerstand: "Vacancy",
    bankdarlehen: "Bank loan",
    nachrang: "Subordinated loan",
    kfwDarlehen: "KfW loan",
    kfwRate: "KfW instalment",
    tilgungszuschuss: "Repayment grant",
    zins: "Interest",
    tilgung: "Repayment",
    immobilienanteil: "Property share",
    wertzuwachs: "Increase in value",
    wertverlust: "Loss in value",
    moebelRestbuchwert: "Furniture residual book value",
    ruecklage: "Reserve",
    darlehen: "Loan",
    tilgungJahre: (jahre) => `Repayment over ${jahre} years`,
    immobilienwert: "Property value",
    restschuld: "Remaining debt",
    immobilieMinusRestschuld: (jahr) => `Property minus remaining debt ${jahr}`,
    standZuBeginn: "Position at the start",
    monate: "months",
    monateMitZuzahlung: "months with a top-up payment",
    monateMitUeberschuss: "months with a surplus",
    durchschnitt: "Ø",
    imMonat: "per month",
    cashflowSumme: (jahre) => `Cash flow after tax over ${jahre} years`,
    zuzahlungen: (jahre) => `Top-up payments after tax over ${jahre} years`,
    zuzahlungenSaldiert: (jahre) => `Top-up payments after tax over ${jahre} years, net`,
    steuerOhneImmobilie: "Tax without the property",
    steuerMitImmobilie: "Tax with the property",
    erstesJahr: "Year 1",
    restlicheJahre: (letztesJahr) => `Years 2 to ${letztesJahr}`,
    vermoegensaufbau: "Wealth building",
    jahre: "years",
    eigenkapital: "Equity",
    zuzahlungMonat: "Top-up payment before tax",
  },
  zusaetze: {
    imMonat: "per month",
    davonTilgung: (betrag) => `of which ${betrag} repayment`,
    jeEingezahltemEuro: (faktor) => `€${faktor} per euro paid in`,
    steuereffektMonat: (betrag) => `${betrag} per month, included in the cash flow after tax`,
    steuereffektZeitraum: (von, bis) => `${von} to ${bis}, total from the annual table`,
    eigenkapitalrenditeHinweis:
      "Less equity means a higher return, but also a higher instalment.",
    eigenkapitalrenditeNichtBestimmbar:
      "Cannot be meaningfully determined: you contribute no equity and make no monthly top-up payments.",
    eigenkapitalrenditeNebenkosten: ({ selbstGezahlt, kaufnebenkosten, rendite, rate }) =>
      selbstGezahlt
        ? `Incidental purchase costs of ${kaufnebenkosten} financed: ${rendite ?? "cannot be determined"}, instalment ${rate} higher.`
        : `Incidental purchase costs of ${kaufnebenkosten} paid yourself: ${rendite ?? "cannot be determined"}, instalment ${rate} lower.`,
    beispielrechnung: "Non-binding example calculation, not an offer. Increases in value and rent are not guaranteed.",
  },
  glossar: {
    ueberschriftAnalyse: "How the figures are calculated",
    ueberschriftDokument: "Glossary: how the figures are calculated",
    einleitung:
      "Every figure in this calculation with its meaning and the formula used to calculate it. All amounts refer to your share of the investment, monthly values to the first year.",
    gruppen: {
      basis: "Basis of the calculation",
      monat: "Rent, instalment and cash flow",
      steuer: "Tax",
      vermoegen: "Wealth at the end",
    },
    eintraege: {
      kaufpreisGesamt: {
        titel: "Total purchase price",
        bedeutung:
          "The price from the purchase contract. Furniture, maintenance expenses and the reserve share are included in it and are not added again.",
        formel: "Total purchase price = land share + building share + furniture + reserve",
      },
      moebel: {
        titel: "of which furniture and fittings",
        bedeutung:
          "The share for kitchen, furnishings and fittings. It is depreciated separately from the building, does not increase in value and counts at its residual book value.",
        formel: "Furniture residual book value = furniture depreciation basis − furniture depreciation to date",
      },
      erhaltungsaufwand: {
        titel: "of which maintenance expenses (Erhaltungsaufwand): deduct or capitalise",
        bedeutung:
          "The share for renovation, included in the building share. “Deduct” claims it as income-related expenses and removes it from the depreciation basis, “capitalise” leaves it in the building depreciation. Above 15 per cent of the building costs, it may count as acquisition-related production costs (anschaffungsnahe Herstellungskosten).",
        formel:
          "Deduct: deduction per year = maintenance expenses ÷ distribution years. Capitalise: depreciated with the building depreciation",
      },
      ruecklage: {
        titel: "of which maintenance reserve (Instandhaltungsrücklage)",
        bedeutung:
          "Your share of the owners’ association’s reserve. It is not depreciated and is not an income-related expense, but it is subject to real estate transfer tax.",
        formel: "The reserve counts in the property value at its amount, without any increase in value",
      },
      grundGebaeude: {
        titel: "Land and building share",
        bedeutung:
          "Only the building is depreciated, not the land. The purchase price without furniture and reserve is split.",
        formel:
          "Property share = total purchase price − furniture − reserve; building share = property share × building share %; land share = property share − building share",
      },
      kaufnebenkosten: {
        titel: "Incidental purchase costs, allocated pro rata",
        bedeutung:
          "Real estate transfer tax, notary, land register, agent and other costs on the total purchase price excluding maintenance expenses, which are stated in the notarial contract as a separate service. If the furniture is shown separately in the notarial contract, no real estate transfer tax is due on it.",
        formel:
          "Incidental costs = rates × (total purchase price − maintenance expenses); incidental costs furniture = incidental costs × furniture ÷ (total purchase price − maintenance expenses) (without real estate transfer tax if shown separately); incidental costs building = (incidental costs − incidental costs furniture) × building share %; the rest belongs to the land",
      },
      gesamtkosten: {
        titel: "Total costs",
        bedeutung: "What the purchase costs in total.",
        formel: "Total costs = total purchase price + incidental purchase costs + financing costs",
      },
      darlehen: {
        titel: "Bank loan",
        bedeutung: "The part of the total costs financed by the bank.",
        formel: "Bank loan = total purchase price + incidental purchase costs − equity − subordinated loan, at least 0. The financing costs are covered by equity",
      },
      afaBasis: {
        titel: "Depreciation basis and building depreciation (AfA)",
        bedeutung: "The depreciation of the building reduces your taxable income every year.",
        formel:
          "Depreciation basis = building share + incidental costs building − maintenance expenses (only with “deduct”); building depreciation per year = depreciation basis × depreciation rate, declining-balance: residual book value × rate, plus special depreciation where applicable",
      },
      moebelAfa: {
        titel: "Furniture depreciation",
        bedeutung: "Furniture is depreciated over its useful life, including its share of the incidental costs.",
        formel: "Furniture depreciation per year = (furniture + incidental costs furniture) ÷ useful life",
      },
      kaltmiete: {
        titel: "Net cold rent (Kaltmiete) per month",
        bedeutung: "The rent without recoverable service costs, less the assumed vacancy.",
        formel: "Net cold rent per month = net cold rent under the tenancy agreement × (100 % − vacancy)",
      },
      kreditrate: {
        titel: "Total loan instalment per month",
        bedeutung: "Interest and repayment paid to the bank each month.",
        formel: "Loan instalment = loan × (borrowing rate + initial repayment) ÷ 12, for each loan",
      },
      tilgung: {
        titel: "Repayment",
        bedeutung:
          "The part of the instalment that reduces the debt. It grows every year because the interest falls with the remaining debt.",
        formel: "Repayment per year = annual instalment − interest on the remaining debt",
      },
      cashflowVorSteuer: {
        titel: "Cash flow before tax",
        bedeutung: "What is left of the rent after the instalment and costs, before tax takes effect.",
        formel: "Cash flow before tax = rent − instalment − non-recoverable costs − contribution to the maintenance reserve",
      },
      cashflowNachSteuer: {
        titel: "Cash flow after tax",
        bedeutung:
          "What arrives in your account. If the figure is negative, you pay in each month; if it is positive, you get something out.",
        formel: "Cash flow after tax = cash flow before tax + tax effect",
      },
      bruttorendite: {
        titel: "Gross rental yield",
        bedeutung: "The annual rent in relation to the purchase price, without costs and incidental costs.",
        formel: "Gross rental yield = annual net cold rent ÷ total purchase price",
      },
      nettorendite: {
        titel: "Net rental yield",
        bedeutung: "Like the gross rental yield, but after vacancy and costs and including the incidental costs.",
        formel: "Net rental yield = (annual rent after vacancy − non-recoverable costs − contribution to the maintenance reserve) ÷ total costs",
      },
      steuerlichesErgebnis: {
        titel: "Income from letting and leasing (Vermietung und Verpachtung)",
        bedeutung:
          "The taxable result of the flat. If it is negative, it reduces your taxable income. The repayment is not deductible.",
        formel:
          "Result from letting = rent − costs − interest − building depreciation − special depreciation − furniture depreciation − deducted maintenance expenses",
      },
      grenzsteuersatz: {
        titel: "Marginal tax rate",
        bedeutung:
          "The tax rate on the next euro of income, including solidarity surcharge and church tax. It shows roughly how much tax one euro of loss saves.",
        formel:
          "Marginal tax rate = (tax on taxable income + €100 − tax on taxable income) ÷ €100; in manual mode the rate entered",
      },
      steuereffekt: {
        titel: "Tax effect in the first year",
        bedeutung:
          "The amount by which your tax changes because of the property. Positive means a saving, negative means additional tax.",
        formel:
          "Tax effect = tax without the property − tax with the property; with the property means taxable income + result from letting under the 2026 tax scale (manual: result from letting × marginal tax rate)",
      },
      steuereffektGesamt: {
        titel: "Total tax effect",
        bedeutung: "All tax effects of the period under review together, year by year from the annual table.",
        formel: "Total tax effect = tax effect year 1 + year 2 + … + final year",
      },
      immobilienwert: {
        titel: "Property value",
        bedeutung:
          "The modelled value at the end. Only land and building increase in value, furniture counts at its residual book value, the reserve at its amount.",
        formel: "Property value = property share × (1 + increase in value)^years + furniture residual book value + reserve",
      },
      restschuld: {
        titel: "Remaining debt",
        bedeutung: "What is still owed to the bank at the end.",
        formel: "Remaining debt = loan − sum of repayments",
      },
      immobilieMinusRestschuld: {
        titel: "Property minus remaining debt",
        bedeutung: "The part of the property that belongs to you free of debt at the end.",
        formel: "Property minus remaining debt = property value − remaining debt",
      },
      selbstEingezahlt: {
        titel: "Paid in yourself or surplus",
        bedeutung:
          "All monthly top-up payments after tax added together; years with a surplus are not offset. If you never pay in, this shows the total of the surpluses.",
        formel: "Paid in yourself = sum of the negative cash flows after tax = Ø per month × months with a top-up payment",
      },
      vermoegensaufbau: {
        titel: "Wealth building",
        bedeutung:
          "How much wealth is built up in the property each month, including the increase in value. The repayment next to it is the secure part of it.",
        formel:
          "Wealth building per month = (property minus remaining debt at the end − position at the start) ÷ months; position at the start = property share + furniture depreciation basis + reserve − loan, at least 0; per euro paid in = total wealth building ÷ (equity + top-up payments)",
      },
      gesamtvermoegen: {
        titel: "Total wealth",
        bedeutung:
          "What belongs to you at the end: the property without debt plus everything that has arrived in or left your account over the years.",
        formel: "Total wealth = property minus remaining debt + sum of cash flows after tax",
      },
      eigenkapitalrendite: {
        titel: "Return on equity p.a.",
        bedeutung:
          "How much wealth is built up on average each year, relative to your equity and twelve months of top-up payments before tax. Less equity means a higher figure, but also a higher instalment.",
        formel:
          "Return on equity p.a. = (wealth building over the period ÷ years) ÷ (equity + monthly top-up payment before tax × 12); wealth building over the period = wealth building per month × months; top-up payment before tax = negative cash flow before tax per month in the first year, a surplus counts as 0",
      },
      irr: {
        titel: "Internal rate of return (IRR)",
        bedeutung:
          "The interest rate your invested money yields in arithmetical terms. It appears in the property comparison as “internal rate of return (IRR) p.a.” and depends heavily on financing and increase in value: whoever contributes less gets the higher figure.",
        formel:
          "The interest rate at which −equity + discounted cash flows after tax + property minus remaining debt in the final year add up to 0",
      },
    },
    rundung:
      "The calculation steps below the figures show rounded values. If rounding shifts the result by a cent or a euro, ≈ appears instead of =. The calculation always uses unrounded values.",
    keineSteuerberatung:
      "No tax advice: the tax effect is a model based on your details and the 2026 tax scale. Whether and to what extent the tax office recognises it is for your tax adviser to clarify.",
  },
};

/** Die Texte je Sprache. Beide Objekte haben dieselbe Gestalt (`KennzahlTexte`). */
export const KENNZAHL_TEXTE_JE_SPRACHE: Record<"de" | "en", KennzahlTexte> = {
  de: KENNZAHL_TEXTE_DE,
  en: KENNZAHL_TEXTE_EN,
};

/** Die Texte für eine Sprache. Unbekannt oder leer heißt Deutsch. */
export function kennzahlTexteFuer(sprache: string | null | undefined): KennzahlTexte {
  return sprache === "en" ? KENNZAHL_TEXTE_EN : KENNZAHL_TEXTE_DE;
}

/**
 * Die Texte der Rechneransicht. Sie bleibt Deutsch, denn sie ist ein
 * Werkzeug für Berater. Englisch wird nur, was der Kunde bekommt, also der
 * Druck der Berechnung (`ExposeDokument`), über `kennzahlTexteFuer`.
 */
export const KENNZAHL_TEXTE: KennzahlTexte = KENNZAHL_TEXTE_DE;
