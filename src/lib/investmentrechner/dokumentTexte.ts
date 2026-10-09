/**
 * Die festen Texte des Drucks der Investmentberechnung (`ExposeDokument`)
 * und der Bausteine, die er mitbenutzt (Tabellen, Diagramme, Steuerprofil,
 * Kaufpreisdetails, Unterlagen), in Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 5 (D15): Der Druck geht an den
 * Kunden und erscheint deshalb in seiner Sprache. Die Rechneransicht bleibt
 * Deutsch, sie ist ein Werkzeug für Berater; dort gilt immer `de`.
 *
 * Die Wörter der Kennzahlen, Rechenwege und des Glossars stehen nicht hier,
 * sondern in `kennzahlTexte.ts`. Hier steht alles übrige: Seitentitel,
 * Tabellenköpfe, Hinweise. Begriffe nach `src/lib/kundenspracheGlossar.ts`.
 * Texte mit einer Zahl darin sind kleine Funktionen, damit die Satzstellung je
 * Sprache frei bleibt. Formatiert wird beim Aufrufer.
 */
import type { FormatSprache } from "../sprachFormat";
import type { InvestmentEingabe, InvestmentErgebnis } from "./rechenkern";

export interface DokumentTexte {
  kopf: {
    investmentkalkulation: string;
    persoenlicheKalkulation: string;
    investmentobjekt: string;
    fusszeile: string;
    seite: (nr: number) => string;
  };
  deckblatt: {
    inklMoebel: (betrag: string) => string;
    wohnflaeche: string;
    zimmer: string;
    baujahr: string;
    energieklasse: string;
    erhaltungsaufwandModell: string;
    ueberJahre: (betrag: string, jahre: string) => string;
    kaufpreisdetails: string;
    finanzierungSteuer: string;
    bankdarlehen: string;
    nachrangdarlehen: string;
    zinsTilgung: string;
    /* KfW-Darlehen, seit dem 07.10.2026. Ohne KfW erscheint keine dieser Zeilen. */
    kfwDarlehen: (programm: string) => string;
    kfwKonditionen: string;
    kfwKonditionenWert: (zins: string, anlauf: number, laufzeit: number) => string;
    mischzins: string;
    rateAbJahr: (jahr: number, kalenderjahr: number) => string;
    eingesetztesEigenkapital: string;
    zveVorErwerb: string;
    grenzsteuersatzTarif: string;
    grenzsteuersatzManuell: string;
  };
  unterlagenSeite: {
    augenbraue: string;
    titel: string;
    einleitung: string;
    energieklasse: string;
    keineAngabe: string;
    kennwertFehlt: string;
    ruecklagenbestand: string;
    stand: (datum: string) => string;
    stichtagFehlt: string;
    sanierungshistorie: string;
    massnahmen: (anzahl: number) => string;
    beruecksichtigteUnterlagen: string;
    seitenKurz: (anzahl: number) => string;
    keineUnterlagen: string;
    pruefhinweisTitel: string;
    pruefhinweis: string;
  };
  steuerSeite: {
    augenbraue: string;
    titel: string;
    einleitung: string;
    steuerklasse: string;
    veranlagung: string;
    splitting: string;
    grundtabelle: string;
    investitionsanteil: string;
    berechnung: string;
    tarif: string;
    manuell: string;
    ohneImmobilie: (jahr: number) => string;
    mitImmobilie: (jahr: number) => string;
    zve: string;
    est: string;
    soli: string;
    kist: string;
    steuereffekt: string;
    steuerwirkung: (von: number, bis: number) => string;
    kleingedruckt: string;
  };
  prognoseSeite: {
    augenbraue: (von: number, bis: number) => string;
    titel: string;
    wertzuwachs: string;
    getilgt: string;
    steuereffektKumuliert: string;
    erklaerungTitel: string;
    erklaerung: string;
  };
  tabellenSeite: {
    augenbraue: string;
    titel: string;
    afaTitel: string;
    jahr: string;
    afaRegulaer: string;
    sonderAfa: string;
    afaMoebel: string;
    erhaltungsaufwand: string;
    ergebnisVuV: string;
    steuereffekt: string;
    ersteJahre: (anzahl: number) => string;
  };
  fotoSeite: {
    augenbraue: string;
    bildAlt: (nr: number) => string;
    keineBilder: string;
    hinweisTitel: string;
    hinweis: string;
  };
  glossarSeite: { augenbraue: string };
  vergleich: {
    marke: string;
    titel: string;
    einleitung: (zeitraum: string) => string;
    objektA: string;
    objektB: string;
    adresseFehlt: string;
    kennzahl: string;
    unterschied: string;
    imJahr: (jahr: number) => string;
    vermoegenBeider: string;
    einordnung: string;
    kleingedruckt: string;
  };
  cashflowTabelle: {
    jahr: string;
    miete: string;
    zinsen: string;
    tilgung: string;
    kosten: string;
    cfVorSteuer: string;
    steuereffekt: string;
    cfNachSteuer: string;
    eigenkapital: string;
  };
  /** Die Darlehen einzeln je Jahr, seit dem 07.10.2026, nur mit KfW-Darlehen. */
  darlehenTabelle: {
    augenbraue: string;
    titel: string;
    einleitung: string;
    jahr: string;
    bank: string;
    kfw: string;
    nachrang: string;
    gesamt: string;
    rate: string;
    zinsen: string;
    tilgung: string;
    restschuld: string;
    zuschussHinweis: (betrag: string, jahr: number) => string;
  };
  steuerTabelle: {
    jahr: string;
    zveVorher: string;
    ergebnisVuV: string;
    zveNachher: string;
    steuerVorher: string;
    steuerNachher: string;
    steuereffekt: string;
  };
  diagramm: {
    vermoegensentwicklung: string;
    gesamtvermoegen: string;
    immobilienEigenkapital: string;
    und: string;
    eigenkapital: string;
    tilgung: string;
    tilgungszuschuss: string;
    wertzuwachs: string;
    steuereffekt: string;
    zusammensetzung: string;
    tausend: string;
  };
  steuerprofil: {
    brutto: string;
    zve: string;
    est: string;
    soli: string;
    kist: string;
    gesamt: string;
    effektiv: string;
    grenz: string;
  };
  kaufpreis: {
    gesamt: string;
    moebel: string;
    erhaltung: string;
    ruecklage: string;
    grundstueck: string;
    gebaeude: string;
    nebenkosten: (satz: string) => string;
    finanzierungsnebenkosten: string;
    gesamtkosten: string;
    /*
      Nur bei Erhaltungsaufwand oder Möbeln, seit dem 30.09.2026: Beide sind
      im Notarvertrag gesondert ausgewiesen, die Kaufnebenkosten laufen ohne
      sie. Die Zeilen nennen deshalb Satz und tatsächliche Basis.
    */
    gesamtInklErhaltung: string;
    gesamtInklMoebel: string;
    gesamtInklBeides: string;
    kaufpreisImmobilie: string;
    erhaltungGesondert: string;
    gebaeudeOhneErhaltung: string;
    grunderwerbsteuer: (satz: string, basis: string) => string;
    notar: (satz: string, basis: string) => string;
    grundbuch: (satz: string, basis: string) => string;
    weitereNebenkosten: string;
    nebenkostenAuf: (satz: string, basis: string) => string;
    hinweisErhaltung: string;
    hinweisMoebel: string;
    hinweisBeides: string;
  };
  energie: {
    effizienzklasse: (klasse: string) => string;
    nichtAngegeben: string;
    effizienz: string;
    keineKlasse: string;
    kennwertFehlt: string;
  };
  unterlagen: {
    energieausweis: string;
    art: string;
    energietraeger: string;
    gueltigBis: string;
    keineAngabe: string;
    ruecklage: string;
    gesamtbestand: string;
    stand: (datum: string) => string;
    anteilEinheit: string;
    nichtAusgewiesen: string;
    sanierungen: string;
    keineSanierungen: string;
  };
  cashflowleiste: {
    tarif: (splitting: boolean) => string;
    manuell: (satz: string) => string;
    /*
      Seit dem 30.09.2026: Ohne Einkommen (Tarif) oder ohne Satz (manuell)
      gibt es keine Steuerwirkung, und Cashflow vor und nach Steuer stehen
      gleich da. Das ist kein Rechenfehler, sondern eine fehlende Eingabe.
    */
    ohneEinkommen: string;
    ohneSatz: string;
  };
  /**
   * Die beiden Deckblätter, seit dem 07.10.2026: „Ergebnis auf einen Blick“
   * und „Jahr für Jahr“. Die Kernsätze kommen als Teile, damit der Aufrufer
   * die Beträge farbig setzen kann, ohne die Satzstellung zu kennen.
   */
  deckblaetter: {
    fuer: (name: string) => string;
    kalkulationVom: (datum: string) => string;
    kaltmiete: string;
    bruttorendite: string;
    zimmerAnzahl: (anzahl: string) => string;
    baujahrText: (jahr: number) => string;
    energieklasseText: (klasse: string) => string;
    augenbraue: string;
    kernsatzZuzahlung: (zuzahlung: string, aufbau: string) => Kernsatzteil[];
    kernsatzSelbsttragend: (aufbau: string) => Kernsatzteil[];
    kachelCashflow: string;
    kachelCashflowNotiz: (betrag: string, bis: number) => string;
    kachelAufbau: string;
    kachelAufbauNotiz: (jahre: number) => string;
    kachelAufbauNotizZuschuss: (jahre: number) => string;
    kachelEkrNotiz: (nenner: string) => string;
    monatTitel: string;
    monatUntertitel: string;
    kreditrate: (zins: string, tilgung: string) => string;
    kreditrateOhneSaetze: string;
    kreditrateMischzins: (zins: string) => string;
    rateSteigt: (jahr: number, kalenderjahr: number, rate: string) => string;
    davonTilgung: string;
    kosten: string;
    vorSteuer: string;
    steuerErsparnis: string;
    steuerMehr: string;
    nachSteuer: string;
    abJahr2: (bis: number) => string;
    monatFussnote: string;
    vermoegenTitel: (jahr: number) => string;
    vermoegenUntertitel: (jahre: number, satz: string) => string;
    immobilienwert: string;
    restschuld: string;
    deinAnteil: string;
    selbstEingezahlt: string;
    fuerDichBleibt: string;
    bleibtRechnung: (anteil: string, eingezahlt: string) => string;
    bleibtRechnungMitUeberschuss: (anteil: string, eingezahlt: string, ueberschuss: string) => string;
    steuerErstesJahr: string;
    steuerwirkungErstesJahr: string;
    steuerGesamt: (jahre: number) => string;
    steuerwirkungGesamt: (jahre: number) => string;
    kachelVermoegen: (jahr: number) => string;
    kachelVermoegenNotiz: string;
    kachelEingezahlt: (jahre: number) => string;
    kachelEingezahltNotiz: (jahre: number) => string;
    kachelJeEuro: string;
    kachelJeEuroNotiz: string;
    kachelCashflowSchnitt: string;
    kachelCashflowSchnittNotiz: (jahre: number) => string;
    diagrammTitel: string;
    diagrammUntertitel: string;
    tausendEuro: (zahl: string) => string;
    tabelleTitel: string;
    tabelleUntertitel: string;
    spalten: {
      jahr: string;
      miete: string;
      rate: string;
      kosten: string;
      vorSteuer: string;
      steuer: string;
      nachSteuer: string;
      tilgung: string;
      restschuld: string;
      wert: string;
      anteil: string;
    };
    tabelleFussnote: string;
    tabelleFussnoteErhaltung: (betrag: string) => string;
  };
  /** Das dritte Deckblatt „Vermögensaufbau & Altersvorsorge“, seit dem 09.10.2026. */
  altersvorsorge: {
    augenbraue: string;
    leitfrage: string;
    person: (name: string, alter: number, rentenAlter: number, rentenJahr: number) => string;
    kachelEigenaufwand: string;
    kachelEigenaufwandNotiz: (schnitt: string) => string;
    kachelUeberschussNotiz: (ueberschuss: string, schnitt: string) => string;
    kachelSchuldenfrei: string;
    kachelSchuldenfreiNotiz: (alter: number) => string;
    kachelSchuldenfreiOffen: string;
    kachelSchuldenfreiOffenNotiz: string;
    kachelZusatz: (jahr: number) => string;
    kachelZusatzNotiz: (heute: string) => string;
    warnungRestschuld: (rentenJahr: number, restschuld: string, rate: string) => string;
    warnungAbEntschuldung: (jahr: number, zusatz: string, heute: string) => string;
    zeitstrahlTitel: string;
    zeitstrahlUntertitel: string;
    alterText: (alter: number) => string;
    stationKauf: string;
    stationKaufText: (darlehen: string) => string;
    stationKaufOhneDarlehen: string;
    stationSchuldenfrei: string;
    stationSchuldenfreiText: string;
    stationRente: string;
    stationRenteText: (zusatz: string) => string;
    stationRenteRestschuld: (restschuld: string) => string;
    phaseTilgung: string;
    phaseSchuldenfrei: string;
    phaseRateLaeuft: string;
    vermoegenTitel: (jahr: number) => string;
    vermoegenUntertitel: (jahre: number, satz: string) => string;
    immobilienwert: string;
    restschuld: string;
    vermoegen: string;
    eingesetzt: string;
    aufgebaut: string;
    aufgebautRechnung: (vermoegen: string, eingesetzt: string, eigenkapital: string, zuzahlungen: string) => string;
    annahmenTitel: string;
    annahmenUntertitel: string;
    alterHeute: string;
    rentenbeginn: string;
    mietsteigerung: string;
    kostensteigerung: string;
    wertsteigerung: string;
    inflation: string;
    zinsTilgung: string;
    zinsTilgungWert: (zins: string, tilgung: string) => string;
    hinweisRechnung: string;
    hinweisBeratung: string;
    fehltAlter: string;
    rentenbeginnErreicht: string;
    zuWeit: string;
  };
  /** Die Seite hinter dem Deckblatt, für beide Varianten gleich, seit dem 07.10.2026. */
  kennzahlenSeite: {
    augenbraue: string;
    titel: string;
    ergebnisTitel: (jahre: number) => string;
    vermoegensaufbauMonat: string;
    davonTilgung: string;
    davonZuschuss: string;
    annahmenTitel: string;
    annahmeWachstum: (wert: string, miete: string, kosten: string) => string;
    annahmeErhaltung: (betrag: string, jahre: string) => string;
    annahmeOhneErhaltung: string;
    annahmeZins: (jahre: number) => string;
    annahmeKfw: (jahre: number, bisJahr: number, restschuld: string) => string;
    annahmeZuschuss: (betrag: string, jahr: number) => string;
    annahmeZuschussGekuerzt: (zugesagt: string, angerechnet: string, jahr: number) => string;
    annahmeVermoegen: (jahre: number) => string;
  };
}

/** Ein Stück eines Kernsatzes; `ton` färbt die Beträge. */
export type Kernsatzteil = { text: string; ton?: "blau" | "gruen" };

export const DOKUMENT_TEXTE_DE: DokumentTexte = {
  kopf: {
    investmentkalkulation: "Investmentkalkulation",
    persoenlicheKalkulation: "Persönliche Investmentkalkulation",
    investmentobjekt: "Investmentobjekt",
    fusszeile: "© OS Immobilien · Investmentkalkulation",
    seite: (nr) => `Seite ${nr}`,
  },
  deckblatt: {
    inklMoebel: (betrag) => `inkl. Möbel ${betrag}`,
    wohnflaeche: "Wohnfläche",
    zimmer: "Zimmer",
    baujahr: "Baujahr",
    energieklasse: "Energieklasse",
    erhaltungsaufwandModell: "Erhaltungsaufwand · Modellannahme",
    ueberJahre: (betrag, jahre) => `${betrag} über ${jahre} Jahr(e)`,
    kaufpreisdetails: "Kaufpreisdetails",
    finanzierungSteuer: "Finanzierung & Steuerannahmen",
    bankdarlehen: "Bankdarlehen",
    nachrangdarlehen: "Nachrangdarlehen",
    zinsTilgung: "Sollzins / anf. Tilgung",
    kfwDarlehen: (programm) => (programm ? `KfW-Darlehen (${programm})` : "KfW-Darlehen"),
    kfwKonditionen: "KfW: Sollzins / tilgungsfrei / Laufzeit",
    kfwKonditionenWert: (zins, anlauf, laufzeit) =>
      `${zins} / ${anlauf} ${anlauf === 1 ? "Jahr" : "Jahre"} / ${laufzeit} ${laufzeit === 1 ? "Jahr" : "Jahre"}`,
    mischzins: "Mischzins aller Darlehen",
    rateAbJahr: (jahr, kalenderjahr) => `Gesamtrate im Monat ab Jahr ${jahr} (${kalenderjahr})`,
    eingesetztesEigenkapital: "Eingesetztes Eigenkapital",
    zveVorErwerb: "zvE vor Erwerb",
    grenzsteuersatzTarif: "Tariflicher Grenzsteuersatz inkl. Zuschläge",
    grenzsteuersatzManuell: "Manueller Grenzsteuersatz",
  },
  unterlagenSeite: {
    augenbraue: "Objektunterlagen",
    titel: "Energie, Rücklagen & Sanierungen",
    einleitung:
      "Zusammenfassung der aus den bereitgestellten Objektunterlagen ermittelten und anschließend bestätigten Angaben.",
    energieklasse: "Energieklasse",
    keineAngabe: "Keine Angabe",
    kennwertFehlt: "Kennwert nicht ausgewiesen",
    ruecklagenbestand: "Rücklagenbestand",
    stand: (datum) => `Stand ${datum}`,
    stichtagFehlt: "Stichtag nicht ausgewiesen",
    sanierungshistorie: "Sanierungshistorie",
    massnahmen: (anzahl) => `erkannte oder bestätigte Maßnahme${anzahl === 1 ? "" : "n"}`,
    beruecksichtigteUnterlagen: "Berücksichtigte Unterlagen",
    seitenKurz: (anzahl) => `${anzahl} S.`,
    keineUnterlagen: "Keine Objektunterlagen hochgeladen. Die Angaben können im Rechner manuell ergänzt werden.",
    pruefhinweisTitel: "Prüfhinweis",
    pruefhinweis:
      "Die automatische Auslesung dient der strukturierten Vorprüfung. Für Kaufentscheidung, Finanzierung und Exposé sind die Angaben mit Energieausweis, Jahresabrechnung, Wirtschaftsplan, Beschlusssammlung und Protokollen abzugleichen.",
  },
  steuerSeite: {
    augenbraue: "Persönliche Ausgangslage",
    titel: "Steuerbetrachtung vor Erwerb",
    einleitung:
      "Die Immobilienwirkung wird mit dem persönlichen zu versteuernden Einkommen verknüpft. Im Tarifmodus wird die Steuer für jedes Prognosejahr vor und nach dem Ergebnis aus Vermietung und Verpachtung neu berechnet.",
    steuerklasse: "Steuerklasse",
    veranlagung: "Veranlagung",
    splitting: "Splittingtabelle",
    grundtabelle: "Grundtabelle",
    investitionsanteil: "Investitionsanteil",
    berechnung: "Berechnung",
    tarif: "ESt-Tarif 2026",
    manuell: "Manueller Steuersatz",
    ohneImmobilie: (jahr) => `Ohne Immobilie · ${jahr}`,
    mitImmobilie: (jahr) => `Mit Immobilie · ${jahr}`,
    zve: "zvE",
    est: "ESt",
    soli: "Soli",
    kist: "KiSt",
    steuereffekt: "Steuereffekt",
    // Das Original schreibt „2026 - 2035"; hier „bis", weil keine Gedankenstriche in Nutzertexten stehen.
    steuerwirkung: (von, bis) => `Steuerwirkung ${von} bis ${bis}`,
    kleingedruckt:
      "Die Steuerklasse ist für die Einordnung des laufenden Lohnsteuerabzugs angegeben; die modellierte Jahressteuer basiert auf dem zvE. Das Ergebnis ersetzt keine persönliche Steuerberatung.",
  },
  prognoseSeite: {
    augenbraue: (von, bis) => `Prognosezeitraum ${von} bis ${bis}`,
    titel: "Vermögensentwicklung",
    wertzuwachs: "Wertzuwachs Immobilie",
    getilgt: "Getilgtes Darlehen",
    steuereffektKumuliert: "Steuereffekt kumuliert",
    erklaerungTitel: "So entsteht das modellierte Vermögen",
    erklaerung:
      "Die Prognose verbindet die angenommene Wertentwicklung der Immobilie, die planmäßige Tilgung der Darlehen und das, was über die Laufzeit aus eigener Tasche dazukommt. Wertsteigerungen und Mieten sind nicht garantiert.",
  },
  tabellenSeite: {
    augenbraue: "Jahresprognose",
    titel: "Cashflow & Eigenkapital",
    afaTitel: "AfA & steuerliche Auswirkung",
    jahr: "Jahr",
    afaRegulaer: "Reguläre AfA",
    sonderAfa: "Sonder-AfA",
    afaMoebel: "AfA Möbel",
    erhaltungsaufwand: "Erhaltungsaufwand",
    ergebnisVuV: "Ergebnis V+V",
    steuereffekt: "Steuereffekt",
    ersteJahre: (anzahl) =>
      `Im Exposé werden die ersten ${anzahl} Prognosejahre tabellarisch gezeigt; die vollständige Laufzeit bleibt in der Rechneransicht verfügbar.`,
  },
  fotoSeite: {
    augenbraue: "Objekteindrücke",
    bildAlt: (nr) => `Objektansicht ${nr}`,
    keineBilder: "Objektbilder können vor dem PDF-Export ergänzt werden.",
    hinweisTitel: "Hinweis zur Modellrechnung",
    hinweis:
      "Unverbindliche Beispielrechnung, kein Angebot. Diese Modellrechnung dient ausschließlich der Information und stellt keine Anlage-, Steuer-, Rechts- oder Finanzierungsberatung dar. Alle Werte beruhen auf den eingegebenen Annahmen und können von der tatsächlichen Entwicklung abweichen. Automatisch ausgelesene Energie-, Rücklagen- und Sanierungsangaben sind mit den Originalunterlagen zu prüfen. Steuerliche Auswirkungen hängen von den persönlichen Verhältnissen und der Anerkennung durch Finanzamt bzw. Steuerberatung ab. Insbesondere Erhaltungsaufwand, anschaffungsnahe Herstellungskosten, AfA-Satz und Aufteilung von Grund und Gebäude sind individuell zu prüfen. Zukünftige Wert- und Mietsteigerungen sowie Mieteinnahmen sind nicht garantiert. Finanzierungskonditionen stehen unter Bank- und Bonitätsvorbehalt.",
  },
  glossarSeite: { augenbraue: "Glossar" },
  vergleich: {
    marke: "Objektvergleich",
    titel: "Zwei Objekte, dieselbe Steuerbasis",
    einleitung: (zeitraum) =>
      `Beide Objekte sind mit denselben persönlichen Steuerdaten gerechnet, über denselben Zeitraum von ${zeitraum} und mit den jeweils eingetragenen Annahmen zu Miet- und Wertentwicklung. Auf den folgenden Seiten steht die vollständige Kalkulation je Objekt.`,
    objektA: "Objekt A",
    objektB: "Objekt B",
    adresseFehlt: "Adresse ergänzen",
    kennzahl: "Kennzahl",
    unterschied: "Unterschied",
    imJahr: (jahr) => `im Jahr ${jahr}`,
    vermoegenBeider: "Vermögensentwicklung beider Objekte",
    einordnung: "Einordnung",
    kleingedruckt:
      "Unverbindliche Beispielrechnung, kein Angebot. Beide Objekte sind mit derselben persönlichen Steuerbasis und derselben Laufzeit gerechnet. Wertsteigerungen und Mieten sind nicht garantiert, die steuerliche Wirkung hängt von den persönlichen Verhältnissen ab. Der vollständige Hinweis steht am Ende jedes Objektteils.",
  },
  cashflowTabelle: {
    jahr: "Jahr",
    miete: "Miete",
    zinsen: "Zinsen",
    tilgung: "Tilgung",
    kosten: "Lfd. Kosten",
    cfVorSteuer: "CF v. St.",
    steuereffekt: "Steuereffekt",
    cfNachSteuer: "CF n. St.",
    eigenkapital: "Eigenkapital",
  },
  darlehenTabelle: {
    augenbraue: "Finanzierung",
    titel: "Darlehen je Jahr",
    einleitung: "Rate, Zinsen und Tilgung jedes Darlehens im Jahr, die Restschuld jeweils zum Jahresende. Die Spalte Gesamt ist die Summe aller Darlehen.",
    jahr: "Jahr",
    bank: "Bankdarlehen",
    kfw: "KfW-Darlehen",
    nachrang: "Nachrangdarlehen",
    gesamt: "Gesamt",
    rate: "Rate",
    zinsen: "Zinsen",
    tilgung: "Tilgung",
    restschuld: "Restschuld",
    zuschussHinweis: (betrag, jahr) =>
      `Im Jahr ${jahr} mindert der Tilgungszuschuss von ${betrag} die Restschuld des KfW-Darlehens. Er ist keine Tilgung, die du zahlst.`,
  },
  steuerTabelle: {
    jahr: "Jahr",
    zveVorher: "zvE vorher",
    ergebnisVuV: "Ergebnis V+V",
    zveNachher: "zvE nachher",
    steuerVorher: "Steuer vorher",
    steuerNachher: "Steuer nachher",
    steuereffekt: "Steuereffekt",
  },
  diagramm: {
    vermoegensentwicklung: "Vermögensentwicklung",
    gesamtvermoegen: "Gesamtvermögen",
    immobilienEigenkapital: "Immobilien-Eigenkapital",
    und: "und",
    eigenkapital: "Eigenkapital",
    tilgung: "Tilgung",
    tilgungszuschuss: "KfW-Tilgungszuschuss",
    wertzuwachs: "Wertzuwachs",
    steuereffekt: "Steuereffekt",
    zusammensetzung: "Aufteilung des modellierten Vermögenszuwachses",
    tausend: "k",
  },
  steuerprofil: {
    brutto: "Bruttoeinkommen",
    zve: "Zu versteuerndes Einkommen",
    est: "Einkommensteuer",
    soli: "Solidaritätszuschlag",
    kist: "Kirchensteuer",
    gesamt: "Steuerbelastung gesamt",
    effektiv: "Effektiver Steuersatz",
    grenz: "Grenzsteuersatz inkl. Zuschläge",
  },
  kaufpreis: {
    gesamt: "Kaufpreis gesamt",
    moebel: "davon Möbel/Inventar",
    erhaltung: "davon Erhaltungsaufwand",
    ruecklage: "davon Instandhaltungsrücklage",
    grundstueck: "Grundstücksanteil",
    gebaeude: "Gebäudeanteil (Wohnung)",
    nebenkosten: (satz) => `Kaufnebenkosten (${satz})`,
    finanzierungsnebenkosten: "Finanzierungsnebenkosten",
    gesamtkosten: "Gesamtkosten",
    gesamtInklErhaltung: "Gesamtkaufpreis (inkl. Erhaltungsaufwand)",
    gesamtInklMoebel: "Gesamtkaufpreis (inkl. Möbel/Inventar)",
    gesamtInklBeides: "Gesamtkaufpreis (inkl. Erhaltungsaufwand und Möbel/Inventar)",
    kaufpreisImmobilie: "davon Kaufpreis Immobilie",
    erhaltungGesondert: "davon Erhaltungsaufwand (gesonderte Leistung, im Notarvertrag ausgewiesen)",
    gebaeudeOhneErhaltung: "Gebäudeanteil ohne Erhaltungsaufwand",
    grunderwerbsteuer: (satz, basis) => `Grunderwerbsteuer ${satz} auf ${basis}`,
    notar: (satz, basis) => `Notar ${satz} auf ${basis}`,
    grundbuch: (satz, basis) => `Grundbuch ${satz} auf ${basis}`,
    weitereNebenkosten: "Weitere Kaufnebenkosten",
    nebenkostenAuf: (satz, basis) => `Kaufnebenkosten (${satz} auf ${basis})`,
    hinweisErhaltung:
      "Der Erhaltungsaufwand ist eine gesonderte Leistung und im Notarvertrag eigens ausgewiesen. Grunderwerbsteuer, Notar und Grundbuch rechnen wir deshalb nur auf den Kaufpreis der Immobilie. Ob das Finanzamt die Grunderwerbsteuer trotzdem auf den ganzen Betrag erhebt, hängt vom Vertrag ab. Das klärt dein Steuerberater.",
    hinweisMoebel:
      "Die Möbel sind eine gesonderte Leistung und im Notarvertrag eigens ausgewiesen. Grunderwerbsteuer, Notar und Grundbuch rechnen wir deshalb nur auf den Kaufpreis der Immobilie. Ob das Finanzamt die Grunderwerbsteuer trotzdem auf den ganzen Betrag erhebt, hängt vom Vertrag ab. Das klärt dein Steuerberater.",
    hinweisBeides:
      "Erhaltungsaufwand und Möbel sind gesonderte Leistungen und im Notarvertrag eigens ausgewiesen. Grunderwerbsteuer, Notar und Grundbuch rechnen wir deshalb nur auf den Kaufpreis der Immobilie. Ob das Finanzamt die Grunderwerbsteuer trotzdem auf den ganzen Betrag erhebt, hängt vom Vertrag ab. Das klärt dein Steuerberater.",
  },
  energie: {
    effizienzklasse: (klasse) => `Energieeffizienzklasse ${klasse}`,
    nichtAngegeben: "nicht angegeben",
    effizienz: "Energieeffizienz",
    keineKlasse: "k. A.",
    kennwertFehlt: "Kennwert nicht hinterlegt",
  },
  unterlagen: {
    energieausweis: "Energieausweis",
    art: "Art",
    energietraeger: "Energieträger",
    gueltigBis: "Gültig bis",
    keineAngabe: "Keine Angabe",
    ruecklage: "Erhaltungsrücklage",
    gesamtbestand: "Gesamtbestand",
    stand: (datum) => ` · Stand ${datum}`,
    anteilEinheit: "Anteil der Einheit",
    nichtAusgewiesen: "Nicht ausgewiesen",
    sanierungen: "Letzte Sanierungen",
    keineSanierungen: "Keine Sanierungen erkannt oder eingetragen.",
  },
  cashflowleiste: {
    tarif: (splitting) => `Tarif 2026 · ${splitting ? "Splittingtabelle" : "Grundtabelle"}`,
    manuell: (satz) => `Manuell · ${satz} %`,
    ohneEinkommen:
      "Ohne zu versteuerndes Einkommen keine Steuerwirkung, deshalb sind Cashflow vor und nach Steuer gleich. Bitte das zvE unter „Kunde & Einkommen“ eintragen.",
    ohneSatz:
      "Ohne Steuersatz keine Steuerwirkung, deshalb sind Cashflow vor und nach Steuer gleich. Bitte den Grenzsteuersatz unter „Kunde & Einkommen“ eintragen.",
  },
  deckblaetter: {
    fuer: (name) => `Für: ${name}`,
    kalkulationVom: (datum) => `Persönliche Investmentkalkulation · ${datum}`,
    kaltmiete: "Kaltmiete",
    bruttorendite: "Bruttorendite",
    zimmerAnzahl: (anzahl) => `${anzahl} Zimmer`,
    baujahrText: (jahr) => `Baujahr ${jahr}`,
    energieklasseText: (klasse) => `Energieklasse ${klasse}`,
    augenbraue: "Dein Ergebnis auf einen Blick",
    kernsatzZuzahlung: (zuzahlung, aufbau) => [
      { text: "Mit " },
      { text: `Ø ${zuzahlung} im Monat`, ton: "blau" },
      { text: " baust du " },
      { text: `Ø ${aufbau} Vermögen im Monat`, ton: "gruen" },
      { text: " auf." },
    ],
    kernsatzSelbsttragend: (aufbau) => [
      { text: "Deine Immobilie trägt sich selbst und baut " },
      { text: `Ø ${aufbau} Vermögen im Monat`, ton: "gruen" },
      { text: " auf." },
    ],
    kachelCashflow: "Cashflow nach Steuer, Jahr 1",
    kachelCashflowNotiz: (betrag, bis) => `im Monat · ab Jahr 2 Ø ${betrag}, Durchschnitt bis Jahr ${bis}`,
    kachelAufbau: "Vermögensaufbau pro Monat",
    kachelAufbauNotiz: (jahre) => `Wertzuwachs der Immobilie plus Tilgung, Durchschnitt über ${jahre} Jahre`,
    kachelAufbauNotizZuschuss: (jahre) =>
      `Wertzuwachs der Immobilie, Tilgung und KfW-Tilgungszuschuss, Durchschnitt über ${jahre} Jahre`,
    kachelEkrNotiz: (nenner) => `bezogen auf ${nenner} Einsatz im ersten Jahr: Eigenkapital plus Zuzahlung vor Steuer`,
    monatTitel: "So setzt sich dein Monat zusammen",
    monatUntertitel: "Jahr 1, alle Beträge im Monat",
    kreditrate: (zins, tilgung) => `Kreditrate (${zins} Zins, ${tilgung} Tilgung)`,
    kreditrateOhneSaetze: "Kreditrate (Zins und Tilgung)",
    kreditrateMischzins: (zins) => `Kreditrate (Mischzins ${zins})`,
    rateSteigt: (jahr, kalenderjahr, rate) =>
      `Ab Jahr ${jahr} (${kalenderjahr}) steigt die Kreditrate auf ${rate} im Monat, weil die tilgungsfreie Zeit des KfW-Darlehens endet.`,
    davonTilgung: "davon Tilgung: das sparst du in deine Immobilie",
    kosten: "Nicht umlagefähige Kosten und Rücklage",
    vorSteuer: "Cashflow vor Steuer",
    steuerErsparnis: "Steuerersparnis im Monat",
    steuerMehr: "Mehrsteuer im Monat",
    nachSteuer: "Cashflow nach Steuer, Jahr 1",
    abJahr2: (bis) => `ab Jahr 2, Durchschnitt bis Jahr ${bis}`,
    monatFussnote:
      "Der Steuervorteil steckt schon im Cashflow nach Steuer. Ab Jahr 2 folgen Steuer, Miete und Kosten den Annahmen der Rechnung. Die Tilgung ist kein Verlust: Sie senkt deine Restschuld und gehört zu deinem Vermögen.",
    vermoegenTitel: (jahr) => `Dein Vermögen ${jahr}`,
    vermoegenUntertitel: (jahre, satz) => `nach ${jahre} Jahren, Wertsteigerung ${satz} p. a. angenommen`,
    immobilienwert: "Immobilienwert",
    restschuld: "Restschuld",
    deinAnteil: "Dein Anteil",
    selbstEingezahlt: "Selbst eingezahlt",
    fuerDichBleibt: "Für dich bleibt",
    bleibtRechnung: (anteil, eingezahlt) => `${anteil} Anteil abzüglich ${eingezahlt} Zuzahlungen nach Steuer`,
    bleibtRechnungMitUeberschuss: (anteil, eingezahlt, ueberschuss) =>
      `${anteil} Anteil abzüglich ${eingezahlt} Zuzahlungen, zuzüglich ${ueberschuss} Überschüsse, jeweils nach Steuer`,
    steuerErstesJahr: "Steuervorteil im ersten Jahr",
    steuerwirkungErstesJahr: "Steuerwirkung im ersten Jahr",
    steuerGesamt: (jahre) => `Steuervorteil über ${jahre} Jahre zusammen`,
    steuerwirkungGesamt: (jahre) => `Steuerwirkung über ${jahre} Jahre zusammen`,
    kachelVermoegen: (jahr) => `Vermögen ${jahr}`,
    kachelVermoegenNotiz: "dein Anteil an der Immobilie: Wert minus Restschuld",
    kachelEingezahlt: (jahre) => `Selbst eingezahlt in ${jahre} Jahren`,
    kachelEingezahltNotiz: (jahre) => `nach Steuer, Jahr 1 bis ${jahre} zusammen`,
    kachelJeEuro: "Pro eingezahltem Euro",
    kachelJeEuroNotiz: "Vermögen für jeden Euro, den du selbst einzahlst",
    kachelCashflowSchnitt: "Cashflow nach Steuer Ø",
    kachelCashflowSchnittNotiz: (jahre) => `im Monat, Durchschnitt über ${jahre} Jahre`,
    diagrammTitel: "Dein Vermögen wächst, dein eigener Beitrag bleibt klein",
    diagrammUntertitel:
      "Blaue Fläche: dein Anteil an der Immobilie. Orange Säulen: was du bis dahin selbst eingezahlt hast, nach Steuer.",
    tausendEuro: (zahl) => `${zahl} T€`,
    tabelleTitel: "Deine Zahlen je Jahr, pro Monat",
    tabelleUntertitel: "Miete, Rate, Kosten, Cashflow und Tilgung je Monat; Restschuld, Wert und Anteil jeweils zum Jahresende",
    spalten: {
      jahr: "Jahr",
      miete: "Miete",
      rate: "Rate",
      kosten: "Kosten",
      vorSteuer: "Vor Steuer",
      steuer: "Steuer",
      nachSteuer: "Nach Steuer",
      tilgung: "Tilgung",
      restschuld: "Restschuld",
      wert: "Wert",
      anteil: "Dein Anteil",
    },
    tabelleFussnote:
      "Jahr 1 hervorgehoben. Tilgung ist kein Verlust, sie baut deinen Anteil auf. Alle Werte stammen aus der Jahresprognose dieser Kalkulation.",
    tabelleFussnoteErhaltung: (betrag) =>
      `Jahr 1 hervorgehoben: Hier wirkt der Erhaltungsaufwand von ${betrag} steuerlich. Tilgung ist kein Verlust, sie baut deinen Anteil auf. Alle Werte stammen aus der Jahresprognose dieser Kalkulation.`,
  },
  altersvorsorge: {
    augenbraue: "Vermögensaufbau & Altersvorsorge",
    leitfrage: "Was bringt mir die Wohnung im Ruhestand?",
    person: (name, alter, rentenAlter, rentenJahr) =>
      [name, `heute ${alter} Jahre`, `geplanter Rentenbeginn mit ${rentenAlter} (${rentenJahr})`].filter(Boolean).join(" · "),
    kachelEigenaufwand: "Eigenaufwand pro Monat heute",
    kachelEigenaufwandNotiz: (schnitt) => `nach Steuer, Jahr 1 · Ø bis zum Rentenbeginn ${schnitt}`,
    kachelUeberschussNotiz: (ueberschuss, schnitt) =>
      `kein Eigenaufwand: ${ueberschuss} Überschuss nach Steuer im Monat · Ø bis zum Rentenbeginn ${schnitt}`,
    kachelSchuldenfrei: "Wohnung schuldenfrei ab",
    kachelSchuldenfreiNotiz: (alter) => `mit ${alter} Jahren · Restschuld dann 0 €`,
    kachelSchuldenfreiOffen: "offen",
    kachelSchuldenfreiOffenNotiz: "mit dieser Tilgung in absehbarer Zeit nicht",
    kachelZusatz: (jahr) => `Zusatzeinkommen ab ${jahr}`,
    kachelZusatzNotiz: (heute) => `im Monat, das sind in heutiger Kaufkraft ca. ${heute}`,
    warnungRestschuld: (rentenJahr, restschuld, rate) =>
      `Zum Rentenbeginn ${rentenJahr} ist die Wohnung noch nicht schuldenfrei: Restschuld ca. ${restschuld}, die Kreditrate von ca. ${rate} im Monat läuft weiter und ist im Zusatzeinkommen schon abgezogen. Mit einer höheren Tilgung wäre sie bis dahin bezahlt.`,
    warnungAbEntschuldung: (jahr, zusatz, heute) =>
      ` Ab ${jahr} entfällt die Rate, dann ca. ${zusatz} im Monat (heutige Kaufkraft ca. ${heute}).`,
    zeitstrahlTitel: "Dein Weg bis zum Ruhestand",
    zeitstrahlUntertitel: "Erst tilgt die Miete zusammen mit deinem Eigenaufwand das Darlehen, danach bleibt sie dir.",
    alterText: (alter) => `mit ${alter} Jahren`,
    stationKauf: "Kauf",
    stationKaufText: (darlehen) => `Darlehen ${darlehen}`,
    stationKaufOhneDarlehen: "ohne Darlehen",
    stationSchuldenfrei: "Schuldenfrei",
    stationSchuldenfreiText: "Restschuld 0 €, die Wohnung gehört dir",
    stationRente: "Rentenbeginn",
    stationRenteText: (zusatz) => `ca. ${zusatz} im Monat zusätzlich`,
    stationRenteRestschuld: (restschuld) => `Restschuld noch ca. ${restschuld}`,
    phaseTilgung: "Tilgungsphase: Restschuld sinkt auf 0",
    phaseSchuldenfrei: "Miete ohne Rate",
    phaseRateLaeuft: "Ruhestand, Rate läuft noch",
    vermoegenTitel: (jahr) => `Dein Vermögen zum Rentenbeginn ${jahr}`,
    vermoegenUntertitel: (jahre, satz) => `nach ${jahre} Jahren, Wertsteigerung ${satz} p. a. angenommen`,
    immobilienwert: "Immobilienwert",
    restschuld: "Restschuld",
    vermoegen: "Dein Vermögen",
    eingesetzt: "Eingesetztes Geld",
    aufgebaut: "Mehr als eingesetzt",
    aufgebautRechnung: (vermoegen, eingesetzt, eigenkapital, zuzahlungen) =>
      `${vermoegen} Vermögen abzüglich ${eingesetzt} eingesetztes Geld: ${eigenkapital} Eigenkapital plus ${zuzahlungen} Zuzahlungen nach Steuer`,
    annahmenTitel: "Annahmen dieser Rechnung",
    annahmenUntertitel: "Im Rechner änderbar",
    alterHeute: "Alter heute",
    rentenbeginn: "Rentenbeginn",
    mietsteigerung: "Mietsteigerung p. a.",
    kostensteigerung: "Kostensteigerung p. a.",
    wertsteigerung: "Wertsteigerung p. a.",
    inflation: "Inflation p. a.",
    zinsTilgung: "Zins und Tilgung",
    zinsTilgungWert: (zins, tilgung) => `${zins} / ${tilgung}`,
    hinweisRechnung:
      "Zusatzeinkommen: Kaltmiete nach Leerstand, abzüglich nicht umlagefähiger Kosten und Rücklage sowie einer noch laufenden Rate, vor Steuer. Heutige Kaufkraft: abgezinst mit der Inflation. Zins und Tilgung gelten wie heute über die ganze Laufzeit; eine Anschlussfinanzierung zu anderem Zins ist nicht gerechnet.",
    hinweisBeratung: "Beispielrechnung, keine Anlage-, Steuer- oder Rechtsberatung.",
    fehltAlter: "Für diese Seite fehlt das Alter des Kunden. Bitte im Rechner unter „Miete & Entwicklung“ eintragen.",
    rentenbeginnErreicht: "Der Rentenbeginn liegt nicht nach dem heutigen Alter. Bitte Alter und Rentenbeginn im Rechner prüfen.",
    zuWeit: "Der Rentenbeginn liegt mehr als 60 Jahre in der Zukunft. Bitte Alter und Rentenbeginn im Rechner prüfen.",
  },
  kennzahlenSeite: {
    augenbraue: "Kennzahlen und Annahmen",
    titel: "Kennzahlen, Kaufpreis, Finanzierung und Annahmen",
    ergebnisTitel: (jahre) => `Ergebnis über ${jahre} Jahre`,
    vermoegensaufbauMonat: "Vermögensaufbau im Monat",
    davonTilgung: "davon Tilgung im Monat",
    davonZuschuss: "davon KfW-Tilgungszuschuss im Monat",
    annahmenTitel: "Worauf die Rechnung beruht",
    annahmeWachstum: (wert, miete, kosten) =>
      `Wertsteigerung der Immobilie ${wert} pro Jahr, Mietsteigerung ${miete} pro Jahr, Kostensteigerung ${kosten} pro Jahr. Nichts davon ist garantiert.`,
    annahmeErhaltung: (betrag, jahre) =>
      `Der Erhaltungsaufwand von ${betrag} wird über ${jahre} Jahr(e) steuerlich abgesetzt und prägt den Steuervorteil. Ob und wie das Finanzamt ihn anerkennt, klärt dein Steuerberater.`,
    annahmeOhneErhaltung:
      "Der Steuervorteil entsteht aus Abschreibung, Zinsen und Kosten. Wie sich deine Steuer tatsächlich ändert, klärt dein Steuerberater.",
    annahmeZins: (jahre) =>
      `Der Zins ist für alle ${jahre} Jahre der Rechnung fest angenommen. Endet die Zinsbindung früher, kann sich die Rate danach ändern.`,
    annahmeKfw: (jahre, bisJahr, restschuld) =>
      `Das KfW-Darlehen ist ${jahre} Jahre fest verzinst, bis Ende ${bisJahr}. Dann sind noch ${restschuld} offen; für die Zeit danach nimmt die Rechnung denselben Zins an.`,
    annahmeZuschuss: (betrag, jahr) =>
      `Der KfW-Tilgungszuschuss von ${betrag} kommt laut Zusage Ende Jahr ${jahr}: Er senkt die Restschuld, die Rate bleibt gleich, das Darlehen ist früher getilgt; steuerlich mindert er die Abschreibung.`,
    annahmeZuschussGekuerzt: (zugesagt, angerechnet, jahr) =>
      `Vom zugesagten Tilgungszuschuss über ${zugesagt} rechnet die Kalkulation ${angerechnet} an, weil Ende Jahr ${jahr} nur noch so viel vom KfW-Darlehen offen ist.`,
    annahmeVermoegen: (jahre) =>
      `Vermögen nach ${jahre} Jahren: Immobilienwert minus Restschuld, verrechnet mit deinen Zuzahlungen und Überschüssen nach Steuer. Die Steuervorteile sind darin schon enthalten.`,
  },
};

export const DOKUMENT_TEXTE_EN: DokumentTexte = {
  kopf: {
    investmentkalkulation: "Investment calculation",
    persoenlicheKalkulation: "Personal investment calculation",
    investmentobjekt: "Investment property",
    fusszeile: "© OS Immobilien · Investment calculation",
    seite: (nr) => `Page ${nr}`,
  },
  deckblatt: {
    inklMoebel: (betrag) => `incl. furniture ${betrag}`,
    wohnflaeche: "Living space",
    zimmer: "Rooms",
    baujahr: "Year of construction",
    energieklasse: "Energy class",
    erhaltungsaufwandModell: "Maintenance expenses (Erhaltungsaufwand) · model assumption",
    ueberJahre: (betrag, jahre) => `${betrag} over ${jahre} year(s)`,
    kaufpreisdetails: "Purchase price details",
    finanzierungSteuer: "Financing & tax assumptions",
    bankdarlehen: "Bank loan",
    nachrangdarlehen: "Subordinated loan",
    zinsTilgung: "Borrowing rate / initial repayment",
    kfwDarlehen: (programm) => (programm ? `KfW loan (${programm})` : "KfW loan"),
    kfwKonditionen: "KfW: borrowing rate / repayment-free / term",
    kfwKonditionenWert: (zins, anlauf, laufzeit) =>
      `${zins} / ${anlauf} ${anlauf === 1 ? "year" : "years"} / ${laufzeit} ${laufzeit === 1 ? "year" : "years"}`,
    mischzins: "Blended interest rate of all loans",
    rateAbJahr: (jahr, kalenderjahr) => `Total instalment per month from year ${jahr} (${kalenderjahr})`,
    eingesetztesEigenkapital: "Equity invested",
    zveVorErwerb: "Taxable income before purchase",
    grenzsteuersatzTarif: "Marginal tax rate under the tax scale incl. surcharges",
    grenzsteuersatzManuell: "Manual marginal tax rate",
  },
  unterlagenSeite: {
    augenbraue: "Property documents",
    titel: "Energy, reserves & renovations",
    einleitung: "Summary of the details taken from the property documents provided and then confirmed.",
    energieklasse: "Energy class",
    keineAngabe: "Not stated",
    kennwertFehlt: "Value not stated",
    ruecklagenbestand: "Reserve balance",
    stand: (datum) => `As of ${datum}`,
    stichtagFehlt: "Reference date not stated",
    sanierungshistorie: "Renovation history",
    massnahmen: (anzahl) => `measure${anzahl === 1 ? "" : "s"} identified or confirmed`,
    beruecksichtigteUnterlagen: "Documents taken into account",
    seitenKurz: (anzahl) => `${anzahl} p.`,
    keineUnterlagen: "No property documents uploaded. The details can be added manually in the calculator.",
    pruefhinweisTitel: "Note on verification",
    pruefhinweis:
      "The automatic extraction serves as a structured preliminary check. For the purchase decision, financing and exposé, the details must be checked against the energy certificate, annual statement, business plan, collection of resolutions and minutes.",
  },
  steuerSeite: {
    augenbraue: "Personal starting position",
    titel: "Tax position before purchase",
    einleitung:
      "The effect of the property is linked to your personal taxable income. In tax scale mode, the tax for each forecast year is recalculated before and after the income from letting and leasing (Vermietung und Verpachtung).",
    steuerklasse: "Tax class",
    veranlagung: "Assessment",
    splitting: "Splitting table (Splittingtabelle)",
    grundtabelle: "Basic tax table (Grundtabelle)",
    investitionsanteil: "Investment share",
    berechnung: "Calculation",
    tarif: "2026 income tax scale",
    manuell: "Manual tax rate",
    ohneImmobilie: (jahr) => `Without the property · ${jahr}`,
    mitImmobilie: (jahr) => `With the property · ${jahr}`,
    zve: "Taxable income",
    est: "Income tax",
    soli: "Solidarity surcharge",
    kist: "Church tax",
    steuereffekt: "Tax effect",
    steuerwirkung: (von, bis) => `Tax effect ${von} to ${bis}`,
    kleingedruckt:
      "The tax class is stated to classify the ongoing wage tax deduction; the modelled annual tax is based on taxable income. The result does not replace personal tax advice.",
  },
  prognoseSeite: {
    augenbraue: (von, bis) => `Forecast period ${von} to ${bis}`,
    titel: "Wealth development",
    wertzuwachs: "Increase in value of the property",
    getilgt: "Loan repaid",
    steuereffektKumuliert: "Cumulative tax effect",
    erklaerungTitel: "How the modelled wealth comes about",
    erklaerung:
      "The forecast combines the assumed increase in value of the property, the scheduled repayment of the loans and what you add from your own pocket over the term. Increases in value and rents are not guaranteed.",
  },
  tabellenSeite: {
    augenbraue: "Annual forecast",
    titel: "Cash flow & equity",
    afaTitel: "Depreciation (AfA) & tax effect",
    jahr: "Year",
    afaRegulaer: "Regular depreciation",
    sonderAfa: "Special depreciation",
    afaMoebel: "Furniture depreciation",
    erhaltungsaufwand: "Maintenance expenses",
    ergebnisVuV: "Result from letting",
    steuereffekt: "Tax effect",
    ersteJahre: (anzahl) =>
      `The exposé shows the first ${anzahl} forecast years in the table; the full term remains available in the calculator view.`,
  },
  fotoSeite: {
    augenbraue: "Impressions of the property",
    bildAlt: (nr) => `View of the property ${nr}`,
    keineBilder: "Photos of the property can be added before the PDF export.",
    hinweisTitel: "Note on the model calculation",
    hinweis:
      "Non-binding sample calculation, not an offer. This model calculation is for information only and does not constitute investment, tax, legal or financing advice. All values are based on the assumptions entered and may differ from actual developments. Energy, reserve and renovation details extracted automatically must be checked against the original documents. Tax effects depend on personal circumstances and on recognition by the tax office or your tax adviser. In particular, maintenance expenses, acquisition-related production costs, depreciation rate and the split between land and building must be checked individually. Future increases in value and rent, as well as rental income, are not guaranteed. Financing terms are subject to the bank’s approval and a credit check.",
  },
  glossarSeite: { augenbraue: "Glossary" },
  vergleich: {
    marke: "Property comparison",
    titel: "Two properties, the same tax basis",
    einleitung: (zeitraum) =>
      `Both properties are calculated with the same personal tax data, over the same period of ${zeitraum} and with the assumptions entered for each on rent and value development. The following pages show the full calculation for each property.`,
    objektA: "Property A",
    objektB: "Property B",
    adresseFehlt: "Add address",
    kennzahl: "Figure",
    unterschied: "Difference",
    imJahr: (jahr) => `in ${jahr}`,
    vermoegenBeider: "Wealth development of both properties",
    einordnung: "Assessment",
    kleingedruckt:
      "Non-binding sample calculation, not an offer. Both properties are calculated with the same personal tax basis and the same term. Increases in value and rents are not guaranteed, and the tax effect depends on personal circumstances. The full note appears at the end of each property section.",
  },
  cashflowTabelle: {
    jahr: "Year",
    miete: "Rent",
    zinsen: "Interest",
    tilgung: "Repayment",
    kosten: "Running costs",
    cfVorSteuer: "CF before tax",
    steuereffekt: "Tax effect",
    cfNachSteuer: "CF after tax",
    eigenkapital: "Equity",
  },
  darlehenTabelle: {
    augenbraue: "Financing",
    titel: "Loans per year",
    einleitung: "Instalment, interest and repayment of each loan per year, the remaining debt at the end of each year. The Total column is the sum of all loans.",
    jahr: "Year",
    bank: "Bank loan",
    kfw: "KfW loan",
    nachrang: "Subordinated loan",
    gesamt: "Total",
    rate: "Instalment",
    zinsen: "Interest",
    tilgung: "Repayment",
    restschuld: "Remaining debt",
    zuschussHinweis: (betrag, jahr) =>
      `In year ${jahr} the repayment grant of ${betrag} reduces the remaining debt of the KfW loan. It is not a repayment that you make.`,
  },
  steuerTabelle: {
    jahr: "Year",
    zveVorher: "Taxable income before",
    ergebnisVuV: "Result from letting",
    zveNachher: "Taxable income after",
    steuerVorher: "Tax before",
    steuerNachher: "Tax after",
    steuereffekt: "Tax effect",
  },
  diagramm: {
    vermoegensentwicklung: "Wealth development",
    gesamtvermoegen: "Total wealth",
    immobilienEigenkapital: "Property equity",
    und: "and",
    eigenkapital: "Equity",
    tilgung: "Repayment",
    tilgungszuschuss: "KfW repayment grant",
    wertzuwachs: "Increase in value",
    steuereffekt: "Tax effect",
    zusammensetzung: "Breakdown of the modelled increase in wealth",
    tausend: "k",
  },
  steuerprofil: {
    brutto: "Gross income",
    zve: "Taxable income",
    est: "Income tax",
    soli: "Solidarity surcharge",
    kist: "Church tax",
    gesamt: "Total tax burden",
    effektiv: "Effective tax rate",
    grenz: "Marginal tax rate incl. surcharges",
  },
  kaufpreis: {
    gesamt: "Total purchase price",
    moebel: "of which furniture and fittings",
    erhaltung: "of which maintenance expenses",
    ruecklage: "of which maintenance reserve",
    grundstueck: "Land share",
    gebaeude: "Building share (flat)",
    nebenkosten: (satz) => `Incidental purchase costs (${satz})`,
    finanzierungsnebenkosten: "Financing costs",
    gesamtkosten: "Total costs",
    gesamtInklErhaltung: "Total purchase price (incl. maintenance expenses)",
    gesamtInklMoebel: "Total purchase price (incl. furniture and fittings)",
    gesamtInklBeides: "Total purchase price (incl. maintenance expenses and furniture and fittings)",
    kaufpreisImmobilie: "of which purchase price of the property",
    erhaltungGesondert: "of which maintenance expenses (separate service, stated in the notarial contract)",
    gebaeudeOhneErhaltung: "Building share excl. maintenance expenses",
    grunderwerbsteuer: (satz, basis) => `Real estate transfer tax ${satz} on ${basis}`,
    notar: (satz, basis) => `Notary ${satz} on ${basis}`,
    grundbuch: (satz, basis) => `Land registry ${satz} on ${basis}`,
    weitereNebenkosten: "Other incidental purchase costs",
    nebenkostenAuf: (satz, basis) => `Incidental purchase costs (${satz} on ${basis})`,
    hinweisErhaltung:
      "The maintenance expenses are a separate service and stated separately in the notarial contract. We therefore calculate real estate transfer tax, notary and land registry fees on the purchase price of the property only. Whether the tax office still levies the transfer tax on the full amount depends on the contract. Your tax adviser will clarify this.",
    hinweisMoebel:
      "The furniture is a separate item and stated separately in the notarial contract. We therefore calculate real estate transfer tax, notary and land registry fees on the purchase price of the property only. Whether the tax office still levies the transfer tax on the full amount depends on the contract. Your tax adviser will clarify this.",
    hinweisBeides:
      "The maintenance expenses and the furniture are separate items and stated separately in the notarial contract. We therefore calculate real estate transfer tax, notary and land registry fees on the purchase price of the property only. Whether the tax office still levies the transfer tax on the full amount depends on the contract. Your tax adviser will clarify this.",
  },
  energie: {
    effizienzklasse: (klasse) => `Energy efficiency class ${klasse}`,
    nichtAngegeben: "not stated",
    effizienz: "Energy efficiency",
    keineKlasse: "n/a",
    kennwertFehlt: "Value not available",
  },
  unterlagen: {
    energieausweis: "Energy certificate",
    art: "Type",
    energietraeger: "Energy source",
    gueltigBis: "Valid until",
    keineAngabe: "Not stated",
    ruecklage: "Maintenance reserve",
    gesamtbestand: "Total balance",
    stand: (datum) => ` · as of ${datum}`,
    anteilEinheit: "Share of the unit",
    nichtAusgewiesen: "Not stated",
    sanierungen: "Recent renovations",
    keineSanierungen: "No renovations identified or entered.",
  },
  cashflowleiste: {
    tarif: (splitting) => `2026 tax scale · ${splitting ? "splitting table" : "basic tax table"}`,
    manuell: (satz) => `Manual · ${satz}%`,
    ohneEinkommen:
      "Without taxable income there is no tax effect, so cash flow before and after tax is the same. Please enter the taxable income under “Client & income”.",
    ohneSatz:
      "Without a tax rate there is no tax effect, so cash flow before and after tax is the same. Please enter the marginal tax rate under “Client & income”.",
  },
  deckblaetter: {
    fuer: (name) => `For: ${name}`,
    kalkulationVom: (datum) => `Personal investment calculation · ${datum}`,
    kaltmiete: "Net cold rent",
    bruttorendite: "Gross rental yield",
    zimmerAnzahl: (anzahl) => `${anzahl} rooms`,
    baujahrText: (jahr) => `built in ${jahr}`,
    energieklasseText: (klasse) => `energy class ${klasse}`,
    augenbraue: "Your result at a glance",
    kernsatzZuzahlung: (zuzahlung, aufbau) => [
      { text: "With " },
      { text: `an average of ${zuzahlung} a month`, ton: "blau" },
      { text: ", you build up " },
      { text: `an average of ${aufbau} in wealth a month`, ton: "gruen" },
      { text: "." },
    ],
    kernsatzSelbsttragend: (aufbau) => [
      { text: "Your property pays for itself and builds up " },
      { text: `an average of ${aufbau} in wealth a month`, ton: "gruen" },
      { text: "." },
    ],
    kachelCashflow: "Cash flow after tax, year 1",
    kachelCashflowNotiz: (betrag, bis) => `per month · from year 2 Ø ${betrag}, average up to year ${bis}`,
    kachelAufbau: "Wealth building per month",
    kachelAufbauNotiz: (jahre) => `Increase in value of the property plus repayment, average over ${jahre} years`,
    kachelAufbauNotizZuschuss: (jahre) =>
      `Increase in value of the property, repayment and KfW repayment grant, average over ${jahre} years`,
    kachelEkrNotiz: (nenner) => `based on ${nenner} invested in the first year: equity plus top-up payment before tax`,
    monatTitel: "How your month adds up",
    monatUntertitel: "Year 1, all amounts per month",
    kreditrate: (zins, tilgung) => `Loan instalment (${zins} interest, ${tilgung} repayment)`,
    kreditrateOhneSaetze: "Loan instalment (interest and repayment)",
    kreditrateMischzins: (zins) => `Loan instalment (blended rate ${zins})`,
    rateSteigt: (jahr, kalenderjahr, rate) =>
      `From year ${jahr} (${kalenderjahr}) the loan instalment rises to ${rate} per month because the repayment-free period of the KfW loan ends.`,
    davonTilgung: "of which repayment: what you save into your property",
    kosten: "Non-recoverable costs and reserve",
    vorSteuer: "Cash flow before tax",
    steuerErsparnis: "Tax saving per month",
    steuerMehr: "Additional tax per month",
    nachSteuer: "Cash flow after tax, year 1",
    abJahr2: (bis) => `from year 2, average up to year ${bis}`,
    monatFussnote:
      "The tax benefit is already included in the cash flow after tax. From year 2, tax, rent and costs follow the assumptions of the calculation. Repayment is not a loss: it reduces your remaining debt and is part of your wealth.",
    vermoegenTitel: (jahr) => `Your wealth in ${jahr}`,
    vermoegenUntertitel: (jahre, satz) => `after ${jahre} years, assuming an increase in value of ${satz} p.a.`,
    immobilienwert: "Property value",
    restschuld: "Remaining debt",
    deinAnteil: "Your share",
    selbstEingezahlt: "Paid in yourself",
    fuerDichBleibt: "What remains for you",
    bleibtRechnung: (anteil, eingezahlt) => `${anteil} share less ${eingezahlt} top-up payments after tax`,
    bleibtRechnungMitUeberschuss: (anteil, eingezahlt, ueberschuss) =>
      `${anteil} share less ${eingezahlt} top-up payments, plus ${ueberschuss} surpluses, each after tax`,
    steuerErstesJahr: "Tax benefit in the first year",
    steuerwirkungErstesJahr: "Tax effect in the first year",
    steuerGesamt: (jahre) => `Tax benefit over ${jahre} years in total`,
    steuerwirkungGesamt: (jahre) => `Tax effect over ${jahre} years in total`,
    kachelVermoegen: (jahr) => `Wealth in ${jahr}`,
    kachelVermoegenNotiz: "your share of the property: value minus remaining debt",
    kachelEingezahlt: (jahre) => `Paid in yourself over ${jahre} years`,
    kachelEingezahltNotiz: (jahre) => `after tax, years 1 to ${jahre} combined`,
    kachelJeEuro: "Per euro paid in",
    kachelJeEuroNotiz: "wealth for every euro you pay in yourself",
    kachelCashflowSchnitt: "Average cash flow after tax",
    kachelCashflowSchnittNotiz: (jahre) => `per month, average over ${jahre} years`,
    diagrammTitel: "Your wealth grows, your own contribution stays small",
    diagrammUntertitel:
      "Blue area: your share of the property. Orange bars: what you have paid in yourself up to that point, after tax.",
    tausendEuro: (zahl) => `€${zahl}k`,
    tabelleTitel: "Your figures year by year, per month",
    tabelleUntertitel:
      "Rent, instalment, costs, cash flow and repayment per month; remaining debt, value and share at the end of each year",
    spalten: {
      jahr: "Year",
      miete: "Rent",
      rate: "Instalment",
      kosten: "Costs",
      vorSteuer: "Before tax",
      steuer: "Tax",
      nachSteuer: "After tax",
      tilgung: "Repayment",
      restschuld: "Remaining debt",
      wert: "Value",
      anteil: "Your share",
    },
    tabelleFussnote:
      "Year 1 highlighted. Repayment is not a loss, it builds up your share. All values come from the annual forecast of this calculation.",
    tabelleFussnoteErhaltung: (betrag) =>
      `Year 1 highlighted: this is when the maintenance expenses of ${betrag} take effect for tax purposes. Repayment is not a loss, it builds up your share. All values come from the annual forecast of this calculation.`,
  },
  altersvorsorge: {
    augenbraue: "Wealth building & retirement",
    leitfrage: "What will the flat do for me in retirement?",
    person: (name, alter, rentenAlter, rentenJahr) =>
      [name, `age ${alter} today`, `planned retirement at ${rentenAlter} (${rentenJahr})`].filter(Boolean).join(" · "),
    kachelEigenaufwand: "Your own monthly cost today",
    kachelEigenaufwandNotiz: (schnitt) => `after tax, year 1 · Ø until retirement ${schnitt}`,
    kachelUeberschussNotiz: (ueberschuss, schnitt) =>
      `no own cost: ${ueberschuss} surplus after tax per month · Ø until retirement ${schnitt}`,
    kachelSchuldenfrei: "Flat debt-free from",
    kachelSchuldenfreiNotiz: (alter) => `at age ${alter} · outstanding loan then €0`,
    kachelSchuldenfreiOffen: "open",
    kachelSchuldenfreiOffenNotiz: "not in the foreseeable future with this repayment rate",
    kachelZusatz: (jahr) => `Extra income from ${jahr}`,
    kachelZusatzNotiz: (heute) => `per month, about ${heute} in today's purchasing power`,
    warnungRestschuld: (rentenJahr, restschuld, rate) =>
      `At retirement in ${rentenJahr} the flat is not yet debt-free: about ${restschuld} outstanding, the loan instalment of about ${rate} per month continues and is already deducted from the extra income. A higher repayment rate would pay it off by then.`,
    warnungAbEntschuldung: (jahr, zusatz, heute) =>
      ` From ${jahr} the instalment ends, then about ${zusatz} per month (today's purchasing power about ${heute}).`,
    zeitstrahlTitel: "Your path to retirement",
    zeitstrahlUntertitel: "First the rent and your own contribution repay the loan, then the rent is yours.",
    alterText: (alter) => `at age ${alter}`,
    stationKauf: "Purchase",
    stationKaufText: (darlehen) => `Loan ${darlehen}`,
    stationKaufOhneDarlehen: "no loan",
    stationSchuldenfrei: "Debt-free",
    stationSchuldenfreiText: "Outstanding loan €0, the flat is yours",
    stationRente: "Retirement",
    stationRenteText: (zusatz) => `about ${zusatz} extra per month`,
    stationRenteRestschuld: (restschuld) => `still about ${restschuld} outstanding`,
    phaseTilgung: "Repayment phase: loan falls to 0",
    phaseSchuldenfrei: "Rent without instalment",
    phaseRateLaeuft: "Retired, instalment continues",
    vermoegenTitel: (jahr) => `Your wealth at retirement ${jahr}`,
    vermoegenUntertitel: (jahre, satz) => `after ${jahre} years, assuming ${satz} value growth p.a.`,
    immobilienwert: "Property value",
    restschuld: "Outstanding loan",
    vermoegen: "Your wealth",
    eingesetzt: "Money put in",
    aufgebaut: "More than you put in",
    aufgebautRechnung: (vermoegen, eingesetzt, eigenkapital, zuzahlungen) =>
      `${vermoegen} wealth minus ${eingesetzt} money put in: ${eigenkapital} equity plus ${zuzahlungen} top-ups after tax`,
    annahmenTitel: "Assumptions of this calculation",
    annahmenUntertitel: "Adjustable in the calculator",
    alterHeute: "Age today",
    rentenbeginn: "Retirement",
    mietsteigerung: "Rent growth p.a.",
    kostensteigerung: "Cost growth p.a.",
    wertsteigerung: "Value growth p.a.",
    inflation: "Inflation p.a.",
    zinsTilgung: "Interest and repayment",
    zinsTilgungWert: (zins, tilgung) => `${zins} / ${tilgung}`,
    hinweisRechnung:
      "Extra income: net cold rent after vacancy, minus non-recoverable costs, reserve and any remaining instalment, before tax. Today's purchasing power: discounted by inflation. Interest and repayment stay as today for the whole term; follow-up financing at a different rate is not modelled.",
    hinweisBeratung: "Example calculation, not investment, tax or legal advice.",
    fehltAlter: "The client's age is missing for this page. Please enter it in the calculator under “Rent & development”.",
    rentenbeginnErreicht: "Retirement is not after today's age. Please check age and retirement in the calculator.",
    zuWeit: "Retirement is more than 60 years away. Please check age and retirement in the calculator.",
  },
  kennzahlenSeite: {
    augenbraue: "Key figures and assumptions",
    titel: "Key figures, purchase price, financing and assumptions",
    ergebnisTitel: (jahre) => `Result over ${jahre} years`,
    vermoegensaufbauMonat: "Wealth building per month",
    davonTilgung: "of which repayment per month",
    davonZuschuss: "of which KfW repayment grant per month",
    annahmenTitel: "What the calculation is based on",
    annahmeWachstum: (wert, miete, kosten) =>
      `Increase in value of the property ${wert} per year, rent increase ${miete} per year, cost increase ${kosten} per year. None of this is guaranteed.`,
    annahmeErhaltung: (betrag, jahre) =>
      `The maintenance expenses of ${betrag} are deducted for tax purposes over ${jahre} year(s) and shape the tax benefit. Whether and how the tax office recognises them is for your tax adviser to clarify.`,
    annahmeOhneErhaltung:
      "The tax benefit comes from depreciation, interest and costs. How your tax actually changes is for your tax adviser to clarify.",
    annahmeZins: (jahre) =>
      `The interest rate is assumed to be fixed for all ${jahre} years of the calculation. If the fixed-rate period ends earlier, the instalment may change afterwards.`,
    annahmeKfw: (jahre, bisJahr, restschuld) =>
      `The KfW loan has a fixed rate for ${jahre} years, until the end of ${bisJahr}. At that point ${restschuld} is still outstanding; for the period after that the calculation assumes the same rate.`,
    annahmeZuschuss: (betrag, jahr) =>
      `According to the commitment, the KfW repayment grant of ${betrag} arrives at the end of year ${jahr}: it reduces the remaining debt, the instalment stays the same, the loan is repaid sooner; for tax purposes it reduces depreciation.`,
    annahmeZuschussGekuerzt: (zugesagt, angerechnet, jahr) =>
      `Of the committed repayment grant of ${zugesagt}, the calculation credits ${angerechnet}, because only that much of the KfW loan is still outstanding at the end of year ${jahr}.`,
    annahmeVermoegen: (jahre) =>
      `Wealth after ${jahre} years: property value minus remaining debt, offset against your top-up payments and surpluses after tax. The tax benefits are already included.`,
  },
};

export const DOKUMENT_TEXTE: Record<FormatSprache, DokumentTexte> = {
  de: DOKUMENT_TEXTE_DE,
  en: DOKUMENT_TEXTE_EN,
};

/** Die Texte für eine Sprache. Unbekannt oder leer heißt Deutsch. */
export function dokumentTexteFuer(sprache: string | null | undefined): DokumentTexte {
  return sprache === "en" ? DOKUMENT_TEXTE_EN : DOKUMENT_TEXTE_DE;
}

/**
 * Der Satz unter dem Cashflow nach Steuer, wenn es mangels Einkommen (Tarif)
 * oder Steuersatz (manuell) keine Steuerwirkung gibt, sonst `null`. Eine
 * Regel für Rechneransicht, Druck und PDF, seit dem 30.09.2026.
 */
export function hinweisOhneSteuerwirkung(
  input: Pick<InvestmentEingabe, "taxCalculationMode" | "marginalTaxRate">,
  result: Pick<InvestmentErgebnis, "taxProfile" | "years">,
  sprache: string | null | undefined,
): string | null {
  const tarif = input.taxCalculationMode === "tariff";
  const ohneBasis = tarif ? result.taxProfile.taxableIncome <= 0 : input.marginalTaxRate <= 0;
  if (!ohneBasis || Math.abs(result.years[0]?.taxEffect ?? 0) >= 0.005) return null;
  const t = dokumentTexteFuer(sprache).cashflowleiste;
  return tarif ? t.ohneEinkommen : t.ohneSatz;
}
