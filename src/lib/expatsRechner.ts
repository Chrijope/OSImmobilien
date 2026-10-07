/**
 * Der schlanke Steuerrechner (Rechenkern).
 *
 * Er bildet die Rechenweise der Vorlage `go.expats-invest.de` nach, die im
 * Skript `/assets/tax-calc.js` offen liegt: wenige Angaben, ein typisiertes
 * Objekt, zehn Jahre. Uebernommen ist ausschliesslich die RECHENMETHODE samt
 * ihrer offengelegten Annahmen. Texte und Gestaltung der Vorlage sind nicht
 * uebernommen, sie sind fremdes Eigentum.
 *
 * Er steht bewusst NEBEN dem ausfuehrlichen Rechner (`steuerRechner.ts`) und
 * ersetzt ihn nicht. Der ausfuehrliche leitet ein zu versteuerndes Einkommen
 * her, kennt Kinder, Kirchensteuer und Bundesland und rechnet mit den
 * gesetzlichen Abschreibungssaetzen aus `afaSaetze.ts`. Dieser hier rechnet
 * grob und schnell, fuer den ersten Kontakt aus einer Anzeige.
 *
 * DREI DINGE, DIE MAN BEIM LESEN WISSEN MUSS
 *
 * 1. Der Steuervorteil wird als DIFFERENZ ZWEIER STEUERBETRAEGE berechnet:
 *    T(Einkommen) minus T(Einkommen minus Abzug). Nicht als Grenzsteuersatz
 *    mal Abzug. Nur so bildet die Rechnung die Progression richtig ab: Ein
 *    Abzug von 80.000 Euro laeuft durch alle Tarifzonen nach unten, der
 *    Grenzsteuersatz gilt aber nur fuer den ersten Euro.
 *
 * 2. Der Tarif selbst steht NICHT hier. Er steht in `einkommensteuer.ts`, der
 *    einen Stelle im Projekt. Die Vorlage bringt eigene Koeffizienten mit, sie
 *    sind dieselben, nur fuer 2025 fest verdrahtet. Wer sie hier abschreibt,
 *    fuehrt genau die doppelte Wahrheit wieder ein, die in
 *    `einkommensteuer.ts` im Kopf beschrieben und dort beseitigt wurde. Unsere
 *    Datei kann zusaetzlich 2026, deshalb rechnet dieser Rechner mit dem
 *    aktuellen Jahr und nicht fest mit 2025.
 *
 * 3. Abgezogen werden NUR Abschreibung und Sanierungsaufwand. Mieteinnahmen
 *    und Schuldzinsen bleiben in der steuerlichen Rechnung aussen vor, so
 *    macht es die Vorlage. Das ist eine Vereinfachung, die nur deshalb
 *    einigermassen aufgeht, weil sich beide bei diesen Saetzen fast aufheben
 *    (4,5 Prozent Miete auf das ganze Objekt gegen 4,4 Prozent Zins auf rund
 *    92 Prozent davon). Ein echtes Vermietungsergebnis waere genauer. Wer das
 *    will, nimmt den ausfuehrlichen Rechner.
 *
 * ZWEI STELLEN, AN DENEN DIESER RECHNER VON DER VORLAGE ABWEICHT
 *
 * Beide sind Korrekturen, beide machen das ausgewiesene Ergebnis schlechter
 * und nicht besser. Sie stehen hier, damit niemand sie fuer einen Fehler haelt
 * und auf die Vorlage zurueckdreht.
 *
 * i)  NICHT UMLAGEFAEHIGE BEWIRTSCHAFTUNGSKOSTEN. Die Vorlage rechnet den
 *     Zahlungsstrom als Miete minus Rate. Verwaltung, Instandhaltungsruecklage
 *     und Mietausfall traegt aber der Eigentuemer. Sie gehen jetzt ab, siehe
 *     `bewirtschaftungskosten` weiter unten. Der monatliche Zahlungsstrom
 *     faellt dadurch beim Beispielfall von minus 262,50 auf minus 533,33 Euro.
 *
 * ii) ECHTER TILGUNGSVERLAUF STATT LINEARER NAEHERUNG. Der Vermoegensaufbau
 *     wird Jahr fuer Jahr aus dem Annuitaetendarlehen gerechnet und nicht als
 *     "Anfangstilgung mal Laufzeit". Naeheres bei der Schleife unten.
 *
 * DREI FACHLICHE WARNUNGEN, die auch auf der Ergebnisseite stehen
 *
 * a) 3,2 Prozent AfA sind KEIN Regelsatz. Der Normalfall sind 2 Prozent
 *    (§ 7 Abs. 4 Satz 1 Nr. 2 EStG), 2,5 Prozent bei Fertigstellung vor 1925.
 *    Auf 3,2 Prozent kommt man nur ueber ein Gutachten zur Restnutzungsdauer
 *    (§ 7 Abs. 4 Satz 2 EStG, rund 31 Jahre Restnutzungsdauer) oder ueber die
 *    degressive Neubau-AfA (§ 7 Abs. 5a EStG). Beides ist eine Voraussetzung,
 *    kein Automatismus. Der ausfuehrliche Rechner setzt deshalb 2 Prozent an.
 *
 * b) Eigenkapital mal 13 heisst rund 92 Prozent Fremdkapital. Diese Quote
 *    bekommt nicht jeder von seiner Bank, sie haengt an Bonitaet, Objekt und
 *    Haushaltsrechnung.
 *
 * c) 15 Prozent Sanierungsaufwand im ersten Jahr sind die Grenze aus
 *    § 6 Abs. 1 Nr. 1a EStG. Oberhalb davon sind es anschaffungsnahe
 *    Herstellungskosten, die NICHT sofort abziehbar sind, sondern nur ueber
 *    die Abschreibung. Und: Der Aufwand selbst ist nicht die Ersparnis. Wer
 *    68.250 Euro saniert, bekommt nicht 68.250 Euro zurueck, sondern die
 *    Steuer auf diesen Betrag.
 */
import {
  aktuellesSteuerjahr,
  steuerbelastung,
  type Steuerjahr,
  type Veranlagung,
} from "@/lib/einkommensteuer";
import { SOLLZINS, TILGUNG_ANFANG } from "@/lib/finanzierung";

/**
 * ALLE Annahmen an einer Stelle. Wer eine Zahl aendern will, aendert sie hier
 * und nirgendwo sonst. Die Werte stammen aus dem offen liegenden Skript der
 * Vorlage.
 */
export const EXPATS_ANNAHMEN = {
  /** Objektvolumen als Vielfaches des eingesetzten Eigenkapitals. */
  hebel: 13,
  /** Anteil des Gebaeudes am Objektvolumen. Nur das Gebaeude ist abschreibbar. */
  gebaeudeanteil: 0.7,
  /** Jaehrlicher Abschreibungssatz auf den Gebaeudewert. Siehe Warnung a). */
  afaSatz: 0.032,
  /** Sofort abziehbarer Sanierungsaufwand, Anteil am Gebaeudewert. */
  sanierungsanteil: 0.15,
  /** Auf wie viele Jahre der Sanierungsabzug verteilt wird. 1 heisst: alles im ersten Jahr. */
  sanierungJahre: 1,
  /** Betrachtungszeitraum in Jahren. */
  jahre: 10,
  /** Bruttomietrendite auf das Objektvolumen. */
  mietrendite: 0.045,
  /**
   * Sollzins des Darlehens. Kommt aus `finanzierung.ts`, damit dieser Rechner
   * nicht wieder mit einem anderen Zins rechnet als der deutsche. Bis zum
   * 17.09.2026 standen hier 4,4 Prozent, im Steuerrechner je nach Objektklasse
   * 3,4 oder 3,8. Drei Rechner, drei Zinsen, und niemand konnte sagen, welcher
   * gilt.
   */
  zins: SOLLZINS,
  /**
   * Anfaengliche Tilgung. Zins plus Tilgung ergeben die Annuitaet. Vorher ein
   * Prozent, jetzt derselbe Wert wie ueberall sonst.
   */
  tilgung: TILGUNG_ANFANG,
  /**
   * Nicht umlagefaehige Bewirtschaftungskosten je Jahr, als Anteil am
   * Objektvolumen.
   *
   * WARUM DIESE ZEILE NEU IST: Die Vorlage kennt sie nicht, und bis hierher
   * kannte dieser Rechner sie auch nicht. Der Zahlungsstrom bestand aus Miete
   * minus Rate, sonst nichts. Das ist zu guenstig gerechnet: Verwaltergebuehr,
   * Instandhaltungsruecklage und Mietausfall zahlt der Eigentuemer, und er
   * kann sie nicht auf den Mieter umlegen. Ein Posten, der das Bild eintruebt,
   * darf nicht fehlen, nur weil die Vorlage ihn ausgelassen hat.
   *
   * WOHER DIE 0,5 PROZENT KOMMEN: Dieser Rechner kennt weder Quadratmeter noch
   * die Zahl der Einheiten, deshalb muss der Posten am Objektvolumen haengen.
   * Nachgerechnet am Beispielobjekt ueber 650.000 Euro, das bei 4,5 Prozent
   * Bruttorendite 29.250 Euro Jahresmiete bringt:
   *
   *   Instandhaltungsruecklage   12 Euro je Quadratmeter und Jahr
   *   Verwaltung                 rund 360 Euro je Einheit und Jahr (§ 26 II. BV,
   *                              fortgeschrieben)
   *   Mietausfallwagnis          2 Prozent der Jahresmiete (§ 29 II. BV)
   *
   * Bei rund 220 Quadratmetern in drei Einheiten ergibt das 4.305 Euro, also
   * 0,66 Prozent des Kaufpreises. Bei einer einzelnen grossen Wohnung von 160
   * Quadratmetern ergibt es 2.865 Euro, also 0,44 Prozent. Die Spanne liegt
   * damit zwischen 0,45 und 0,7 Prozent. Angesetzt ist mit 0,5 Prozent das
   * untere Ende dieser Spanne, damit die Zahl belegbar bleibt und nicht
   * schaerfer tut, als sie sein kann. Im Einzelfall liegt sie hoeher, nie
   * wesentlich tiefer. Genau so steht es auch auf der Ergebnisseite.
   *
   * STEUERLICH: Diese Kosten waeren echte Werbungskosten und wuerden die
   * Steuerersparnis erhoehen. Sie bleiben hier trotzdem aus der Steuerrechnung
   * heraus, weil Miete und Schuldzinsen es auch tun (siehe Punkt 3 im Kopf).
   * Die ausgewiesene Ersparnis ist deshalb eher zu niedrig als zu hoch, und
   * das ist die richtige Richtung fuer eine Anzeigenseite.
   */
  bewirtschaftungskosten: 0.005,
  /**
   * Solidaritaetszuschlag mitrechnen?
   *
   * Nein, denn die Vorlage rechnet ohne ihn, und die Rechenweise soll dieselbe
   * bleiben. Wer ihn einbeziehen will, setzt hier `true`: Bei den Einkommen,
   * um die es geht, faellt er an, die ausgewiesene Ersparnis liegt dann etwas
   * hoeher. `einkommensteuer.ts` kennt ihn samt Freigrenze und Milderungszone.
   */
  soli: false,
  /**
   * Kirchensteuer. Sie bleibt aussen vor, weil dieser kurze Rechner die
   * Konfession nicht abfragt. Wer sie zahlt, spart real etwas mehr.
   */
  kirchensteuerProzent: 0,
} as const;

export interface ExpatsEingabe {
  /** Eingesetztes Eigenkapital in Euro. */
  eigenkapital: number;
  /** Jahresbrutto in Euro. Bei Verheirateten das gemeinsame Einkommen. */
  jahresbrutto: number;
  /** Verheiratet bedeutet Zusammenveranlagung mit Splitting. */
  verheiratet: boolean;
  /** Steuerjahr. Ohne Angabe das aktuelle, begrenzt auf die hinterlegten Tarife. */
  jahr?: Steuerjahr;
}

/** Eine Zeile der Jahr-fuer-Jahr-Tabelle. */
export interface ExpatsJahr {
  /** Laufendes Jahr, beginnend bei 1. */
  nummer: number;
  /** Abschreibung auf das Gebaeude. */
  afa: number;
  /** Sanierungsaufwand dieses Jahres, nach den Annahmen nur im ersten Jahr. */
  sanierung: number;
  /** Summe der Abzuege dieses Jahres. */
  abzug: number;
  /** Steuerersparnis dieses Jahres, T(Einkommen) minus T(Einkommen minus Abzug). */
  steuervorteil: number;
  /** Steuerersparnis aufsummiert bis einschliesslich dieses Jahres. */
  kumuliert: number;
  /** Schuldzinsen dieses Jahres, gerechnet auf die Restschuld des Vorjahres. */
  zinsen: number;
  /** Tilgung dieses Jahres, also Annuitaet minus Zinsen. */
  tilgung: number;
  /** Restschuld am Ende dieses Jahres. */
  restschuld: number;
  /** Getilgt insgesamt bis einschliesslich dieses Jahres. */
  getilgtKumuliert: number;
}

export interface ExpatsErgebnis {
  eigenkapital: number;
  jahresbrutto: number;
  verheiratet: boolean;
  objektvolumen: number;
  gebaeudewert: number;
  darlehen: number;
  /** Anteil Fremdkapital am Objektvolumen, fuer die Warnung auf der Seite. */
  fremdkapitalAnteil: number;
  afaJahr: number;
  /** Der Sanierungsaufwand insgesamt. NICHT die Ersparnis daraus. */
  sanierungsaufwand: number;
  /** Die Steuerersparnis aus dem Sanierungsaufwand allein, ohne die Abschreibung. */
  sanierungErsparnis: number;
  /** Steuer auf das Einkommen ohne Immobilie, als Vergleichsgroesse. */
  steuerOhneImmobilie: number;
  /** Grenzsteuersatz als Anteil, gemessen an 1.000 Euro zusaetzlichem Abzug. */
  grenzsteuersatz: number;
  /** Anteil der Abzuege, der als Steuer zurueckkommt. Nur zur Anzeige. */
  rueckflussquote: number;
  steuervorteilJahr1: number;
  steuervorteilZehnJahre: number;
  /** Durchschnittlicher Steuervorteil je Jahr ueber den Betrachtungszeitraum. */
  steuervorteilDurchschnittJahr: number;
  mieteJahr: number;
  mieteMonat: number;
  rateJahr: number;
  rateMonat: number;
  /** Schuldzinsen im ersten Jahr. Sie sinken danach mit der Restschuld. */
  zinsenJahr: number;
  /** Nicht umlagefaehige Bewirtschaftungskosten je Jahr. */
  bewirtschaftungJahr: number;
  /** Dieselben Kosten je Monat. */
  bewirtschaftungMonat: number;
  /**
   * Miete minus Bewirtschaftungskosten minus Rate.
   * Negativ bedeutet: Du legst jeden Monat etwas dazu.
   */
  zahlungsstromVorSteuerMonat: number;
  /** Der durchschnittliche Steuervorteil je Monat ueber den ganzen Zeitraum. */
  steuervorteilMonat: number;
  /** Zahlungsstrom vor Steuer plus durchschnittlicher Steuervorteil. */
  zahlungsstromNachSteuerMonat: number;
  /**
   * Der Steuervorteil eines Jahres OHNE den einmaligen Sanierungsabzug, also
   * der Wert, der ab dem zweiten Jahr jedes Jahr wiederkehrt.
   */
  steuervorteilAbJahr2: number;
  /**
   * Der Zahlungsstrom nach Steuer im Dauerzustand, also ab dem zweiten Jahr.
   * Er ist deutlich schlechter als der Durchschnitt ueber zehn Jahre, weil das
   * erste Jahr den einmaligen Sanierungsabzug traegt. Beide Zahlen stehen auf
   * der Seite, sonst entstuende aus dem Durchschnitt ein falsches Bild.
   */
  zahlungsstromNachSteuerMonatAbJahr2: number;
  /** Getilgt ueber den ganzen Zeitraum. Das ist der Vermoegensaufbau. */
  tilgungZehnJahre: number;
  /** Dieselbe Tilgung als Durchschnitt je Monat. */
  tilgungMonat: number;
  /** Restschuld am Ende des Betrachtungszeitraums. */
  restschuld: number;
  /** Gezahlte Schuldzinsen ueber den ganzen Zeitraum. */
  zinsenZehnJahre: number;
  jahre: ExpatsJahr[];
  /** Betrachtungszeitraum, damit die Anzeige ihn nicht erneut festlegt. */
  betrachtungsjahre: number;
  /** Das Steuerjahr, mit dessen Tarif gerechnet wurde. */
  steuerjahr: Steuerjahr;
}

function veranlagungVon(verheiratet: boolean): Veranlagung {
  return verheiratet ? "splitting" : "grund";
}

/**
 * Steuer auf ein zu versteuerndes Einkommen.
 *
 * Bewusst eine eigene kleine Funktion: Sie ist die einzige Stelle, an der
 * dieser Rechner den Tarif anfasst, und sie tut es ausschliesslich ueber
 * `einkommensteuer.ts`.
 */
function steuer(zvE: number, jahr: Steuerjahr, verheiratet: boolean): number {
  return steuerbelastung(Math.max(0, zvE), {
    jahr,
    veranlagung: veranlagungVon(verheiratet),
    kirchensteuerProzent: EXPATS_ANNAHMEN.kirchensteuerProzent,
    soli: EXPATS_ANNAHMEN.soli,
  }).gesamt;
}

/**
 * Was bringt ein Abzug an Steuer?
 *
 * Die Antwort ist die Differenz zweier Steuerbetraege, nicht Grenzsteuersatz
 * mal Abzug. Ein negatives Ergebnis waere sinnlos, deshalb bei null gekappt.
 */
export function steuervorteilAusAbzug(
  einkommen: number,
  abzug: number,
  jahr: Steuerjahr,
  verheiratet: boolean,
): number {
  if (abzug <= 0) return 0;
  return Math.max(
    0,
    steuer(einkommen, jahr, verheiratet) - steuer(einkommen - abzug, jahr, verheiratet),
  );
}

/** Die ganze Rechnung. */
export function berechneExpats(eingabe: ExpatsEingabe): ExpatsErgebnis {
  const a = EXPATS_ANNAHMEN;
  const jahr = eingabe.jahr ?? aktuellesSteuerjahr();
  const verheiratet = !!eingabe.verheiratet;

  const eigenkapital = Math.max(0, eingabe.eigenkapital || 0);
  const einkommen = Math.max(0, eingabe.jahresbrutto || 0);

  const objektvolumen = eigenkapital * a.hebel;
  const gebaeudewert = objektvolumen * a.gebaeudeanteil;
  /* Das Eigenkapital steckt im Kaufpreis, der Rest ist Darlehen. Daraus
     ergeben sich die rund 92 Prozent Fremdkapital aus Warnung b). */
  const darlehen = Math.max(0, objektvolumen - eigenkapital);

  const afaJahr = gebaeudewert * a.afaSatz;
  const sanierungsaufwand = gebaeudewert * a.sanierungsanteil;
  const sanierungJeJahr = sanierungsaufwand / Math.max(1, a.sanierungJahre);

  const steuerOhneImmobilie = steuer(einkommen, jahr, verheiratet);

  /*
    Die Annuitaet steht fest, Zins und Tilgung darin verschieben sich jedes
    Jahr. WARUM NICHT EINFACH `darlehen * tilgung * 10`: Bei einem
    Annuitaetendarlehen waechst der Tilgungsanteil, weil die Zinsen auf eine
    sinkende Restschuld laufen. Die lineare Naeherung ergaebe hier 10 Prozent
    des Darlehens, tatsaechlich sind es rund 12,2 Prozent. Die Naeherung wuerde
    den Vermoegensaufbau also um rund ein Fuenftel zu KLEIN ausweisen. Gerechnet
    wird deshalb der echte Verlauf, Jahr fuer Jahr.
  */
  const rateJahr = darlehen * (a.zins + a.tilgung);

  const jahre: ExpatsJahr[] = [];
  let kumuliert = 0;
  let abzuegeGesamt = 0;
  let restschuld = darlehen;
  let getilgtKumuliert = 0;
  let zinsenZehnJahre = 0;

  for (let n = 1; n <= a.jahre; n++) {
    const sanierung = n <= a.sanierungJahre ? sanierungJeJahr : 0;
    const abzug = afaJahr + sanierung;
    const steuervorteil = steuervorteilAusAbzug(einkommen, abzug, jahr, verheiratet);
    kumuliert += steuervorteil;
    abzuegeGesamt += abzug;

    const zinsen = restschuld * a.zins;
    /* Am Ende der Laufzeit kann die letzte Rate groesser sein als die
       Restschuld. Bei zehn Jahren und einem Prozent Anfangstilgung tritt das
       nicht ein, die Kappung steht trotzdem hier: Sie kostet nichts und
       verhindert eine negative Restschuld, falls jemand die Annahmen aendert. */
    const tilgung = Math.min(Math.max(0, rateJahr - zinsen), restschuld);
    restschuld = Math.max(0, restschuld - tilgung);
    getilgtKumuliert += tilgung;
    zinsenZehnJahre += zinsen;

    jahre.push({
      nummer: n,
      afa: afaJahr,
      sanierung,
      abzug,
      steuervorteil,
      kumuliert,
      zinsen,
      tilgung,
      restschuld,
      getilgtKumuliert,
    });
  }

  const steuervorteilZehnJahre = kumuliert;
  const steuervorteilDurchschnittJahr = steuervorteilZehnJahre / a.jahre;

  const mieteJahr = objektvolumen * a.mietrendite;
  /* Neu gegenueber der Vorlage: Was der Eigentuemer traegt und nicht umlegen
     kann, geht vom Zahlungsstrom ab. Begruendung bei der Annahme oben. */
  const bewirtschaftungJahr = objektvolumen * a.bewirtschaftungskosten;
  const zahlungsstromVorSteuerMonat = (mieteJahr - bewirtschaftungJahr - rateJahr) / 12;
  const steuervorteilMonat = steuervorteilDurchschnittJahr / 12;

  /* Der Dauerzustand: ein Jahr ohne den einmaligen Sanierungsabzug. */
  const steuervorteilAbJahr2 = steuervorteilAusAbzug(einkommen, afaJahr, jahr, verheiratet);

  return {
    eigenkapital,
    jahresbrutto: einkommen,
    verheiratet,
    objektvolumen,
    gebaeudewert,
    darlehen,
    fremdkapitalAnteil: objektvolumen > 0 ? darlehen / objektvolumen : 0,
    afaJahr,
    sanierungsaufwand,
    /* Der Unterschied zwischen Aufwand und Ersparnis, an einer Zahl gezeigt:
       Was bringt der Sanierungsabzug allein, ohne die Abschreibung? */
    sanierungErsparnis: steuervorteilAusAbzug(einkommen, sanierungsaufwand, jahr, verheiratet),
    steuerOhneImmobilie,
    /* Der Grenzsteuersatz, gemessen an 1.000 Euro zusaetzlichem Abzug. Bewusst
       gemessen und nicht aus der Tarifformel abgeleitet: So steht auf der
       Seite genau der Satz, den der Rechner auch benutzt. */
    grenzsteuersatz: steuervorteilAusAbzug(einkommen, 1000, jahr, verheiratet) / 1000,
    rueckflussquote: abzuegeGesamt > 0 ? steuervorteilZehnJahre / abzuegeGesamt : 0,
    steuervorteilJahr1: jahre[0]?.steuervorteil ?? 0,
    steuervorteilZehnJahre,
    steuervorteilDurchschnittJahr,
    mieteJahr,
    mieteMonat: mieteJahr / 12,
    rateJahr,
    rateMonat: rateJahr / 12,
    zinsenJahr: darlehen * a.zins,
    bewirtschaftungJahr,
    bewirtschaftungMonat: bewirtschaftungJahr / 12,
    zahlungsstromVorSteuerMonat,
    steuervorteilMonat,
    zahlungsstromNachSteuerMonat: zahlungsstromVorSteuerMonat + steuervorteilMonat,
    steuervorteilAbJahr2,
    zahlungsstromNachSteuerMonatAbJahr2: zahlungsstromVorSteuerMonat + steuervorteilAbJahr2 / 12,
    tilgungZehnJahre: getilgtKumuliert,
    tilgungMonat: getilgtKumuliert / (a.jahre * 12),
    restschuld,
    zinsenZehnJahre,
    jahre,
    betrachtungsjahre: a.jahre,
    steuerjahr: jahr,
  };
}
