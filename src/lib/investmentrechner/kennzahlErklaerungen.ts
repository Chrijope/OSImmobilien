/**
 * Rechenwege der Kennzahlen, die gemeinsame Quelle für die grauen Zeilen
 * unter jeder Zahl.
 *
 * Christian am 25.09.2026: Unter jeder Kennzahl der ersten Seite steht klein,
 * wie sie entsteht, mit den echten Werten. Zum Beispiel unter dem Cashflow vor
 * Steuer „Miete 900,00 € − Rate 1.145,83 € − nicht umlagefähige Kosten
 * 50,00 € = −295,83 €“.
 *
 * ## Keine zweite Rechnung
 *
 * Jedes Glied und das Ergebnis kommen aus Eingabe und Ergebnis des
 * Rechenkerns, dieselben Felder, die auch die Kachel liest. Hier wird nichts
 * nachgerechnet, sondern nur zusammengestellt, was der Kern schon gerechnet
 * hat. Die Tests werten jede Zeile aus und prüfen, dass sie aufgeht.
 *
 * ## Rundung
 *
 * Angezeigt werden gerundete Werte. Rechnet man mit ihnen nach, kann das
 * Ergebnis um einen Cent oder Euro abweichen. Dann steht „≈“ statt „=“, das
 * Glossar erklärt es. Das Ergebnis selbst ist immer die ungerundete Zahl des
 * Kerns, gerundet wie in der Kachel.
 *
 * ## Texte
 *
 * Alle Wörter kommen aus kennzahlTexte.ts, damit eine Übersetzung nur dort
 * ansetzt. Welcher Glossareintrag zu welcher Zeile gehört, steht hier an jedem
 * Rechenweg (`glossar`), so können Rechenweg und Glossar nicht
 * auseinanderlaufen.
 */
import { formatEuro, formatEuroCent, formatProzent, formatProzentEineStelle, formatZahl } from "./formatierer";
import type { FormatSprache } from "../sprachFormat";
import { eigenkapitalrendite as eigenkapitalrenditeRechnen, prozentAnteil, type InvestmentEingabe, type InvestmentErgebnis } from "./rechenkern";
import {
  KENNZAHL_TEXTE,
  type GlossarEintragText,
  type GlossarGruppenSchluessel,
  type GlossarSchluessel,
  type KennzahlTexte,
} from "./kennzahlTexte";

/**
 * Wie ein Wert angezeigt und für die Rundungsprobe gerundet wird.
 * „prozent1“ ist Prozent mit einer Nachkommastelle, nur für die
 * Eigenkapitalrendite (30.09.2026).
 */
export type Einheit = "euro" | "cent" | "prozent" | "prozent1" | "anzahl";

/** Die Rechenzeichen. Minus ist U+2212, kein Bindestrich und kein Gedankenstrich. */
export type Rechenzeichen = "+" | "−" | "×" | "÷";

const MINUS = "−";

export interface Rechenglied {
  /** Fehlt beim ersten Glied. */
  zeichen?: Rechenzeichen;
  /** Beschriftung vor dem Wert, etwa „Miete“. */
  label?: string;
  /**
   * Beschriftung, wenn der Wert negativ ist. Bei „+“ und „−“ springt das
   * Zeichen dann um und der Betrag steht positiv da: statt „+ Steuereffekt
   * −50 €“ heißt es „− Steuermehrbelastung 50 €“.
   */
  labelNegativ?: string;
  /** Text nach dem Wert, etwa „Monate“. */
  suffix?: string;
  wert: number;
  einheit: Einheit;
  /** Auch einen positiven Wert mit „+“ zeigen. Nur beim ersten Glied sinnvoll. */
  vorzeichen?: boolean;
  /** Ein Ausdruck in Klammern. Sein Wert ergibt sich aus diesen Gliedern. */
  klammer?: Rechenglied[];
  /** Die Klammer auch zeigen, wo Punkt vor Strich sie nicht verlangt. Nur zur Lesbarkeit. */
  klammerZeigen?: boolean;
}

export interface Rechenweg {
  glieder: Rechenglied[];
  /** Das Ergebnis des Rechenkerns, ungerundet. */
  ergebnis: number;
  einheit: Einheit;
  /** Das Ergebnis mit „+“ oder „−“ zeigen, wie die Kachel darüber. */
  mitVorzeichen: boolean;
  /** Geht die Zeile mit den angezeigten, gerundeten Werten nicht genau auf? Dann „≈“. */
  gerundet: boolean;
  /** Die fertige Zeile. */
  text: string;
  /** Der Glossareintrag, der diese Zahl erklärt. */
  glossar: GlossarSchluessel;
}

/** Nachkommastellen je Einheit, für Anzeige und Rundungsprobe. */
function stellen(einheit: Einheit): number | null {
  if (einheit === "euro") return 0;
  if (einheit === "cent") return 2;
  // Prozent als Faktor: 4,32 % sind 0,0432, zwei Stellen im Prozent also vier im Faktor.
  if (einheit === "prozent") return 4;
  if (einheit === "prozent1") return 3;
  return null;
}

/** Kaufmännisch runden, bei negativen Zahlen vom Nullpunkt weg wie Intl.NumberFormat. */
function runde(wert: number, einheit: Einheit): number {
  const n = stellen(einheit);
  if (n === null) return wert;
  const faktor = 10 ** n;
  return (Math.sign(wert) * Math.round(Math.abs(wert) * faktor)) / faktor;
}

/** Der Betrag ohne Vorzeichen in der Schreibweise der Kacheln. */
function betrag(wert: number, einheit: Einheit, sprache: FormatSprache = "de"): string {
  const b = Math.abs(wert);
  if (einheit === "euro") return formatEuro(b, sprache);
  if (einheit === "cent") return formatEuroCent(b, sprache);
  if (einheit === "prozent") return formatProzent(b, sprache);
  if (einheit === "prozent1") return formatProzentEineStelle(b, sprache);
  return formatZahl(b, sprache, 2);
}

/** Ein Wert mit Vorzeichen. Null zählt als positiv, wird wie die Kachel formatiert und trägt nie „−0“. */
function mitZeichen(wert: number, einheit: Einheit, plus: boolean, sprache: FormatSprache = "de"): string {
  const gerundet = runde(wert, einheit);
  if (gerundet < 0) return `${MINUS}${betrag(wert, einheit, sprache)}`;
  if (plus && gerundet > 0) return `+${betrag(wert, einheit, sprache)}`;
  return betrag(wert, einheit, sprache);
}

/** Der Wert eines Glieds: bei einer Klammer deren Ergebnis. */
function gliedwert(glied: Rechenglied, gerundet: boolean): number {
  if (glied.klammer) return werteAus(glied.klammer, gerundet);
  return gerundet ? runde(glied.wert, glied.einheit) : glied.wert;
}

/**
 * Wertet eine Gliederkette von links nach rechts aus. Die Anzeige setzt die
 * Klammern so, dass die übliche Punkt-vor-Strich-Regel genau dieselbe
 * Reihenfolge ergibt, siehe `darstellen`.
 *
 * Mit `gerundet` rechnet sie mit den angezeigten Werten, so wie jemand, der
 * die Zeile mit dem Taschenrechner nachprüft.
 */
export function werteAus(glieder: Rechenglied[], gerundet = false): number {
  let ergebnis = 0;
  glieder.forEach((glied, index) => {
    const wert = gliedwert(glied, gerundet);
    if (index === 0 || !glied.zeichen) {
      ergebnis = wert;
      return;
    }
    if (glied.zeichen === "+") ergebnis += wert;
    else if (glied.zeichen === MINUS) ergebnis -= wert;
    else if (glied.zeichen === "×") ergebnis *= wert;
    else ergebnis = wert !== 0 ? ergebnis / wert : 0;
  });
  return ergebnis;
}

/** Wie fest ein Ausdruck bindet: ein Einzelwert, ein Produkt oder eine Summe. */
type Bindung = "wert" | "punkt" | "strich";

interface Darstellung {
  text: string;
  bindung: Bindung;
}

/** Ein einzelnes Glied ohne Rechenzeichen davor. */
function gliedtext(glied: Rechenglied, erstes: boolean, sprache: FormatSprache): Darstellung & { zeichen?: Rechenzeichen } {
  if (glied.klammer) {
    const innen = darstellen(glied.klammer, sprache);
    if (glied.klammerZeigen) return { text: `(${innen.text})`, bindung: "wert", zeichen: glied.zeichen };
    return { ...innen, zeichen: glied.zeichen };
  }
  let zeichen = glied.zeichen;
  let label = glied.label;
  let wertText: string;
  const negativ = runde(glied.wert, glied.einheit) < 0;
  if (!erstes && negativ && (zeichen === "+" || zeichen === MINUS)) {
    // „+ −50“ wird zu „− 50“, „− −50“ zu „+ 50“.
    zeichen = zeichen === "+" ? MINUS : "+";
    label = glied.labelNegativ ?? glied.label;
    wertText = betrag(glied.wert, glied.einheit, sprache);
  } else {
    wertText = mitZeichen(glied.wert, glied.einheit, erstes && Boolean(glied.vorzeichen), sprache);
  }
  const text = [label, wertText, glied.suffix].filter(Boolean).join(" ");
  return { text, bindung: "wert", zeichen };
}

/**
 * Setzt eine Gliederkette als Text, mit genau den Klammern, die nötig sind,
 * damit Punkt vor Strich dieselbe Reihenfolge ergibt wie `werteAus`.
 */
function darstellen(glieder: Rechenglied[], sprache: FormatSprache = "de"): Darstellung {
  let links: Darstellung = { text: "", bindung: "wert" };
  glieder.forEach((glied, index) => {
    const rechts = gliedtext(glied, index === 0, sprache);
    if (index === 0) {
      links = { text: rechts.text, bindung: rechts.bindung };
      return;
    }
    const zeichen = rechts.zeichen ?? "+";
    const punkt = zeichen === "×" || zeichen === "÷";
    let linkerText = links.text;
    let rechterText = rechts.text;
    if (punkt) {
      if (links.bindung === "strich") linkerText = `(${linkerText})`;
      if (rechts.bindung === "strich" || (zeichen === "÷" && rechts.bindung === "punkt")) {
        rechterText = `(${rechterText})`;
      }
    } else if (zeichen === MINUS && rechts.bindung === "strich") {
      rechterText = `(${rechterText})`;
    }
    links = { text: `${linkerText} ${zeichen} ${rechterText}`, bindung: punkt ? "punkt" : "strich" };
  });
  return links;
}

/** Baut einen fertigen Rechenweg und prüft dabei die Rundung. */
export function rechenweg(
  glieder: Rechenglied[],
  ergebnis: number,
  einheit: Einheit,
  glossar: GlossarSchluessel,
  mitVorzeichen = false,
  /** Schreibweise der Beträge. Nur der Druck für englischsprachige Kunden nimmt „en“. */
  sprache: FormatSprache = "de",
): Rechenweg {
  const geprueft = runde(werteAus(glieder, true), einheit);
  const gerundet = geprueft !== runde(ergebnis, einheit);
  const ausdruck = darstellen(glieder, sprache).text;
  const text = `${ausdruck} ${gerundet ? "≈" : "="} ${mitZeichen(ergebnis, einheit, mitVorzeichen, sprache)}`;
  return { glieder, ergebnis, einheit, mitVorzeichen, gerundet, text, glossar };
}

/** Die Kennzahlen, unter denen ein Rechenweg steht. */
export type RechenwegSchluessel =
  | "kaltmiete"
  | "kreditrate"
  | "bruttorendite"
  | "nettorendite"
  | "immobilienwert"
  | "restschuld"
  | "immobilieMinusRestschuld"
  | "selbstEingezahlt"
  | "cashflowVorSteuer"
  | "cashflowNachSteuer"
  | "vermoegensaufbau"
  | "gesamtvermoegen"
  | "steuereffektErstesJahr"
  | "steuereffektGesamt"
  | "eigenkapitalrendite";

/**
 * Alle Rechenwege der ersten Seite. `null` heißt: Für diese Zahl gibt es
 * gerade keinen sinnvollen Rechenweg, etwa eine Rendite ohne Kaufpreis.
 */
export function rechenwege(
  input: InvestmentEingabe,
  result: InvestmentErgebnis,
  texte: KennzahlTexte = KENNZAHL_TEXTE,
  /** Schreibweise der Beträge, passend zu `texte`. Ohne Angabe Deutsch. */
  sprache: FormatSprache = "de",
): Record<RechenwegSchluessel, Rechenweg | null> {
  const weg = (
    glieder: Rechenglied[],
    ergebnis: number,
    einheit: Einheit,
    eintrag: GlossarSchluessel,
    mitVorzeichen = false,
  ) => rechenweg(glieder, ergebnis, einheit, eintrag, mitVorzeichen, sprache);
  const g = texte.glieder;
  const jahre = result.years;
  const erstes = jahre[0];
  const letztes = jahre[jahre.length - 1];
  const anzahlJahre = jahre.length;
  const monate = anzahlJahre * 12;
  const leerstand = Math.min(1, prozentAnteil(input.vacancyRate));
  const juniorDarlehen = result.totalDebt - result.seniorLoanAmount - result.kfwLoanAmount;

  const kaltmiete = weg(
    [
      { label: g.kaltmiete, wert: erstes.grossRent / 12, einheit: "euro" },
      {
        zeichen: "×",
        wert: 1 - leerstand,
        einheit: "prozent",
        klammer: [
          { wert: 1, einheit: "prozent" },
          { zeichen: MINUS, label: g.leerstand, wert: leerstand, einheit: "prozent" },
        ],
      },
    ],
    result.effectiveAnnualRent / 12,
    "euro",
    "kaltmiete",
  );

  /** Ein Darlehen mal (Zins + Tilgung), die Jahresrate vor der Teilung durch zwölf. */
  const darlehensglieder = (label: string, betragDarlehen: number, zins: number, tilgung: number): Rechenglied[] => [
    { label, wert: betragDarlehen, einheit: "euro" },
    {
      zeichen: "×",
      wert: prozentAnteil(zins) + prozentAnteil(tilgung),
      einheit: "prozent",
      klammer: [
        { label: g.zins, wert: prozentAnteil(zins), einheit: "prozent" },
        { zeichen: "+", label: g.tilgung, wert: prozentAnteil(tilgung), einheit: "prozent" },
      ],
    },
  ];
  const bank = darlehensglieder(g.bankdarlehen, result.seniorLoanAmount, input.seniorInterestRate, input.seniorRepaymentRate);
  const nachrang = darlehensglieder(g.nachrang, juniorDarlehen, input.juniorInterestRate, input.juniorRepaymentRate);
  /*
    KfW, seit dem 07.10.2026: in den tilgungsfreien Jahren Betrag mal Zins,
    sonst die Monatsrate der Annuität mal zwölf. Beides ist die Jahresrate im
    ersten Jahr, wie bei Bank und Nachrang.
  */
  const kfwGlieder: Rechenglied[] =
    result.kfwAnlaufJahre > 0
      ? [
          { label: g.kfwDarlehen, wert: result.kfwLoanAmount, einheit: "euro" },
          { zeichen: "×", label: g.zins, wert: prozentAnteil(input.kfwInterestRate), einheit: "prozent" },
        ]
      : [
          { label: g.kfwRate, wert: result.kfwAnnuitaetMonat, einheit: "cent" },
          { zeichen: "×", wert: 12, einheit: "anzahl" },
        ];
  const weitere: Rechenglied[] = [
    ...(juniorDarlehen > 0.005 ? [{ zeichen: "+" as const, wert: werteAus(nachrang), einheit: "euro" as const, klammer: nachrang }] : []),
    ...(result.kfwLoanAmount > 0 ? [{ zeichen: "+" as const, wert: werteAus(kfwGlieder), einheit: "euro" as const, klammer: kfwGlieder }] : []),
  ];
  const kreditrate = weg(
    weitere.length > 0
      ? [{ wert: werteAus(bank), einheit: "euro", klammer: bank }, ...weitere, { zeichen: "÷", wert: 12, einheit: "anzahl" }]
      : [...bank, { zeichen: "÷", wert: 12, einheit: "anzahl" }],
    result.monthlyDebtService,
    "cent",
    "kreditrate",
  );

  const bruttorendite =
    result.kaufpreisGesamt > 0
      ? weg(
          [
            { label: g.jahresmiete, wert: erstes.grossRent, einheit: "euro" },
            { zeichen: "÷", label: g.kaufpreis, wert: result.kaufpreisGesamt, einheit: "euro" },
          ],
          result.grossYield,
          "prozent",
          "bruttorendite",
        )
      : null;

  const nettorendite =
    result.totalInvestment > 0
      ? weg(
          [
            {
              label: leerstand > 0 ? g.jahresmieteNachLeerstand : g.jahresmiete,
              wert: result.effectiveAnnualRent,
              einheit: "euro",
            },
            { zeichen: MINUS, label: g.nichtUmlagefaehig, wert: erstes.operatingCosts, einheit: "euro" },
            // Die Zuführung zur Rücklage steht nur da, wenn es eine gibt, sonst wäre die Zeile länger ohne Nutzen.
            ...(erstes.reserveContribution > 0
              ? ([{ zeichen: MINUS, label: g.ruecklageZufuehrung, wert: erstes.reserveContribution, einheit: "euro" }] as Rechenglied[])
              : []),
            { zeichen: "÷", label: g.gesamtkosten, wert: result.totalInvestment, einheit: "euro" },
          ],
          result.netYield,
          "prozent",
          "nettorendite",
        )
      : null;

  const immobilienwertGlieder: Rechenglied[] = [
    { label: g.immobilienanteil, wert: result.immobilienanteil, einheit: "euro" },
    { zeichen: "+", label: g.wertzuwachs, labelNegativ: g.wertverlust, wert: letztes.wertzuwachs, einheit: "euro" },
  ];
  // Möbel und Rücklage nur, wenn es sie gibt. Eine Null hilft beim Nachrechnen nicht.
  if (result.moebelAfaBasis > 0) {
    immobilienwertGlieder.push({ zeichen: "+", label: g.moebelRestbuchwert, wert: letztes.moebelRestbuchwert, einheit: "euro" });
  }
  if (result.ruecklage > 0) {
    immobilienwertGlieder.push({ zeichen: "+", label: g.ruecklage, wert: result.ruecklage, einheit: "euro" });
  }
  const immobilienwert = weg(immobilienwertGlieder, letztes.propertyValue, "euro", "immobilienwert");

  const getilgt = jahre.reduce((summe, jahr) => summe + jahr.principal, 0);
  const zuschuss = jahre.reduce((summe, jahr) => summe + jahr.darlehen.kfw.tilgungszuschuss, 0);
  const restschuld = weg(
    [
      { label: g.darlehen, wert: result.totalDebt, einheit: "euro" },
      { zeichen: MINUS, label: g.tilgungJahre(anzahlJahre), wert: getilgt, einheit: "euro" },
      // Der KfW-Tilgungszuschuss mindert die Restschuld, ist aber keine gezahlte Tilgung.
      ...(zuschuss > 0 ? ([{ zeichen: MINUS, label: g.tilgungszuschuss, wert: zuschuss, einheit: "euro" }] as Rechenglied[]) : []),
    ],
    letztes.remainingDebt,
    "euro",
    "restschuld",
  );

  const immobilieMinusRestschuld = weg(
    [
      { label: g.immobilienwert, wert: letztes.propertyValue, einheit: "euro" },
      { zeichen: MINUS, label: g.restschuld, wert: letztes.remainingDebt, einheit: "euro" },
    ],
    letztes.propertyEquity,
    "euro",
    "immobilieMinusRestschuld",
  );

  /*
    Selbst eingezahlt: der Durchschnitt je Monat mal die Monate, in denen der
    Kunde zuzahlt. Die Kachel zeigt die ungesaldierte Summe; eine Zeile mit
    zehn Jahresbeträgen passte nicht in zwei Zeilen, und eine Rechnung über
    den Saldo braucht Vorzeichen, die im Gespräch nur verwirren.
  */
  const zahltZu = letztes.cumulativeEigenanteil > 0;
  const summeEinzahlung = zahltZu ? letztes.cumulativeEigenanteil : Math.abs(letztes.cumulativeCashflowAfterTax);
  const monateMit = 12 * jahre.filter((jahr) => (zahltZu ? jahr.cashflowAfterTax < 0 : jahr.cashflowAfterTax > 0)).length;
  const selbstEingezahlt =
    monateMit > 0
      ? weg(
          [
            { label: g.durchschnitt, suffix: g.imMonat, wert: summeEinzahlung / monateMit, einheit: "cent" },
            {
              zeichen: "×",
              suffix: zahltZu ? g.monateMitZuzahlung : g.monateMitUeberschuss,
              wert: monateMit,
              einheit: "anzahl",
            },
          ],
          summeEinzahlung,
          "euro",
          "selbstEingezahlt",
        )
      : null;

  const cashflowVorSteuer = weg(
    [
      { label: g.miete, wert: erstes.effectiveRent / 12, einheit: "cent" },
      { zeichen: MINUS, label: g.rate, wert: erstes.debtService / 12, einheit: "cent" },
      { zeichen: MINUS, label: g.nichtUmlagefaehig, wert: erstes.operatingCosts / 12, einheit: "cent" },
      ...(erstes.reserveContribution > 0
        ? ([{ zeichen: MINUS, label: g.ruecklageZufuehrung, wert: erstes.reserveContribution / 12, einheit: "cent" }] as Rechenglied[])
        : []),
    ],
    erstes.cashflowBeforeTax / 12,
    "cent",
    "cashflowVorSteuer",
    true,
  );

  const cashflowNachSteuer = weg(
    [
      { wert: erstes.cashflowBeforeTax / 12, einheit: "cent", vorzeichen: true },
      {
        zeichen: "+",
        label: g.steuereffekt,
        labelNegativ: g.steuermehrbelastung,
        wert: erstes.taxEffect / 12,
        einheit: "cent",
      },
    ],
    erstes.cashflowAfterTax / 12,
    "cent",
    "cashflowNachSteuer",
    true,
  );

  const vermoegensaufbauGlieder: Rechenglied[] = [
    { label: g.immobilieMinusRestschuld(letztes.year), wert: letztes.propertyEquity, einheit: "euro" },
  ];
  if (result.vermoegenStart > 0) {
    vermoegensaufbauGlieder.push({ zeichen: MINUS, label: g.standZuBeginn, wert: result.vermoegenStart, einheit: "euro" });
  }
  vermoegensaufbauGlieder.push({ zeichen: "÷", suffix: g.monate, wert: monate, einheit: "anzahl" });
  const vermoegensaufbau = weg(vermoegensaufbauGlieder, result.vermoegensaufbauMonat, "cent", "vermoegensaufbau");

  const gesamtvermoegen = weg(
    [
      { label: g.immobilieMinusRestschuld(letztes.year), wert: letztes.propertyEquity, einheit: "euro" },
      {
        zeichen: "+",
        label: g.cashflowSumme(anzahlJahre),
        // „saldiert“ nur, wenn Überschussjahre gegengerechnet sind. Sonst ist es dieselbe Summe wie „Selbst eingezahlt“.
        labelNegativ: jahre.some((jahr) => jahr.cashflowAfterTax > 0)
          ? g.zuzahlungenSaldiert(anzahlJahre)
          : g.zuzahlungen(anzahlJahre),
        wert: letztes.cumulativeCashflowAfterTax,
        einheit: "euro",
      },
    ],
    letztes.totalWealth,
    "euro",
    "gesamtvermoegen",
  );

  const steuereffektErstesJahr = weg(
    [
      { label: g.steuerOhneImmobilie, wert: erstes.taxBefore.totalTax, einheit: "euro" },
      { zeichen: MINUS, label: g.steuerMitImmobilie, wert: erstes.taxAfter.totalTax, einheit: "euro" },
    ],
    erstes.taxEffect,
    "euro",
    "steuereffekt",
    true,
  );

  const restlicheSteuer = jahre.slice(1).reduce((summe, jahr) => summe + jahr.taxEffect, 0);
  const steuereffektGesamt = weg(
    anzahlJahre > 1
      ? [
          { label: g.erstesJahr, wert: erstes.taxEffect, einheit: "euro" },
          { zeichen: "+", label: g.restlicheJahre(anzahlJahre), wert: restlicheSteuer, einheit: "euro" },
        ]
      : [{ label: g.erstesJahr, wert: erstes.taxEffect, einheit: "euro" }],
    result.cumulativeTaxEffect,
    "euro",
    "steuereffektGesamt",
    true,
  );

  /*
    Eigenkapitalrendite, Christians Formel vom 30.09.2026. Die Zuzahlung mal
    zwölf steht als eigene Klammer, damit Punkt vor Strich beim Lesen und
    beim Auswerten dasselbe ergibt. `null`, wenn der Nenner null ist; die
    Kachel sagt dann in einem Satz, warum.
  */
  const ekr = eigenkapitalrenditeRechnen(input, result);
  const eigenkapitalrendite =
    ekr.rendite !== null
      ? weg(
          [
            {
              wert: ekr.vermoegensaufbau / ekr.jahre,
              einheit: "euro",
              klammerZeigen: true,
              klammer: [
                { label: g.vermoegensaufbau, wert: ekr.vermoegensaufbau, einheit: "euro" },
                { zeichen: "÷", suffix: g.jahre, wert: ekr.jahre, einheit: "anzahl" },
              ],
            },
            {
              zeichen: "÷",
              wert: ekr.nenner,
              einheit: "euro",
              klammer: [
                { label: g.eigenkapital, wert: ekr.eigenkapital, einheit: "euro" },
                {
                  zeichen: "+",
                  wert: ekr.zuzahlungMonat * 12,
                  einheit: "euro",
                  klammer: [
                    { label: g.zuzahlungMonat, wert: ekr.zuzahlungMonat, einheit: "cent" },
                    { zeichen: "×", wert: 12, einheit: "anzahl" },
                  ],
                },
              ],
            },
          ],
          ekr.rendite,
          "prozent1",
          "eigenkapitalrendite",
        )
      : null;

  return {
    kaltmiete,
    kreditrate,
    bruttorendite,
    nettorendite,
    immobilienwert,
    restschuld,
    immobilieMinusRestschuld,
    selbstEingezahlt,
    cashflowVorSteuer,
    cashflowNachSteuer,
    vermoegensaufbau,
    gesamtvermoegen,
    steuereffektErstesJahr,
    steuereffektGesamt,
    eigenkapitalrendite,
  };
}

/** Reihenfolge des Glossars: zuerst die Kalkulationsbasis, dann vom Monat zum Ende. */
const GLOSSAR_AUFBAU: [GlossarGruppenSchluessel, GlossarSchluessel[]][] = [
  [
    "basis",
    [
      "kaufpreisGesamt",
      "moebel",
      "erhaltungsaufwand",
      "ruecklage",
      "grundGebaeude",
      "kaufnebenkosten",
      "gesamtkosten",
      "darlehen",
      "afaBasis",
      "moebelAfa",
    ],
  ],
  [
    "monat",
    ["kaltmiete", "kreditrate", "tilgung", "cashflowVorSteuer", "cashflowNachSteuer", "bruttorendite", "nettorendite"],
  ],
  ["steuer", ["steuerlichesErgebnis", "grenzsteuersatz", "steuereffekt", "steuereffektGesamt"]],
  [
    "vermoegen",
    [
      "immobilienwert",
      "restschuld",
      "immobilieMinusRestschuld",
      "selbstEingezahlt",
      "vermoegensaufbau",
      "gesamtvermoegen",
      "eigenkapitalrendite",
      "irr",
    ],
  ],
];

export interface GlossarEintrag extends GlossarEintragText {
  schluessel: GlossarSchluessel;
}

export interface Glossar {
  einleitung: string;
  gruppen: { schluessel: GlossarGruppenSchluessel; titel: string; eintraege: GlossarEintrag[] }[];
  rundung: string;
  keineSteuerberatung: string;
}

/**
 * Das Glossar „So entstehen die Zahlen“, für die Analyse und die letzte Seite
 * der Berechnung. Beide Ansichten lesen genau diese Liste, und jeder
 * Rechenweg oben verweist über `glossar` auf einen ihrer Einträge.
 */
export function glossar(texte: KennzahlTexte = KENNZAHL_TEXTE): Glossar {
  return {
    einleitung: texte.glossar.einleitung,
    gruppen: GLOSSAR_AUFBAU.map(([gruppe, schluessel]) => ({
      schluessel: gruppe,
      titel: texte.glossar.gruppen[gruppe],
      eintraege: schluessel.map((eintrag) => ({ schluessel: eintrag, ...texte.glossar.eintraege[eintrag] })),
    })),
    rundung: texte.glossar.rundung,
    keineSteuerberatung: texte.glossar.keineSteuerberatung,
  };
}
