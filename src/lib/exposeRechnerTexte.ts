import type { ZweiSprachen } from "@/lib/seitenSprache";
import type { Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";

/**
 * Texte des Rechners im Abschnitt Wirtschaftlichkeit (`ExposeRechner.tsx`)
 * und die englische Fassung seiner Hinweise aus dem Rechenkern
 * (`exposeRechner.ts`). Plan Kundensprache, Etappe 3.
 *
 * Die deutsche Hälfte ist der bisherige Wortlaut. Englisch nach dem Glossar:
 * „equity“, „repayment“, „service charge (Hausgeld)“, „your contact“.
 *
 * Offen für die Sprachprüfung: die Steuerbegriffe (§ 39a und § 7b EStG,
 * Erhaltungsaufwand, Werkvertrag) sind sinngemäß übersetzt und tragen das
 * deutsche Wort in Klammern, wo es für den Steuerberater zählt.
 */
export interface ExposeRechnerTexte {
  herkunftSelbstauskunft: string;
  herkunftObjekt: string;
  ja: string;
  nein: string;
  /** „p. a.“ mit geschütztem Leerzeichen. */
  proJahr: string;
  bcKaufpreis: string;
  bcPreisanpassung: (satz: string) => string;
  bcStellplatz: string;
  bcGesamtinvestition: string;
  bcNebenkosten: string;
  bcNebenkostenVerkaeufer: string;
  bcEigenkapital: string;
  bcEigenkapitalersatz: string;
  bcGesamteigenkapital: string;
  monatMiete: string;
  monatSteuervorteil: string;
  monatFinanzierung: string;
  monatRuecklagen: string;
  monatBewirtschaftung: string;
  monatHausgeld: string;
  monatMietverwaltung: string;
  monatMietausfall: string;
  monate: string[];
  werteImJahr: (jahr: number) => string;
  werteAb: (monat: string, jahr: number) => string;
  schaubildTitel: (kaufpreis: string, jahre: number, wert: string, restschuld: string, ertrag: string) => string;
  svgWertsteigerung: string;
  svgJahre: string;
  svgTilgung: string;
  svgKaufpreis: string;
  svgInklStellplatz: string;
  svgImmobilienwert: string;
  svgErtragBeiVerkauf: string;
  svgRestschuld: string;
  mobilKaufpreis: string;
  mobilKaufpreisStellplatz: string;
  mobilWeg: (jahre: number, wertsteigerung: string, tilgung: string) => string;
  immobilienwert: string;
  restschuld: string;
  ertragBeiVerkauf: string;
  nkInfo: (e: {
    prozentGesamt: string; grunderwerbsteuer: string; bundesland: string | null; notarGrundbuch: string;
    makler: string | null; quelle: "manuell" | "mittelwert" | "bundesland"; verkaeuferBetrag: string | null;
  }) => string;
  gesamtinvestitionZusatz: string;
  eigenkapitalersatzInfo: string;
  darlehen: string;
  businessCaseTitel: (quote: string) => string;
  finanzierungsparameter: string;
  finanzierungsparameterZusatz: string;
  anzahlSelbstauskunft: (anzahl: number) => string;
  gesperrt: string;
  eigenkapital: string;
  betrag: string;
  eigenkapitalInEuro: string;
  zinssatz: string;
  tilgung: string;
  selbstauskunftEigenkapital: (betrag: string) => string;
  zvE: string;
  verheiratet: string;
  grenzsteuersatz: (satz: string, manuell: boolean, steuerjahr: number) => string;
  lohnsteuer: string;
  lohnsteuerInfo: string;
  wachstum: (miete: string, kosten: string, wert: string, proJahr: string) => string;
  weitereAnnahmen: (e: { leerstand: string; afa: string; sonderAfa: boolean; mietverwaltung: boolean; makler: string | null; preisanpassung: string | null }) => string;
  wenigerAnzeigen: string;
  alleAnsehen: string;
  alleAnpassen: string;
  mietsteigerung: string;
  kostensteigerung: string;
  wertentwicklung: string;
  leerstand: string;
  maklerprovision: string;
  preisanpassung: string;
  afaJeJahr: string;
  sonderAfa: string;
  mietverwaltungEinrechnen: string;
  sanierungSteuerlich: string;
  instandhaltungKeine: string;
  instandhaltungErhaltungsaufwand: string;
  instandhaltungWerkvertrag: string;
  verteiltAufJahre: string;
  jahre: (anzahl: number) => string;
  betrachtungsjahr: string;
  einnahmen: string;
  ausgaben: string;
  steuervorteilMitLohnsteuer: string;
  steuervorteilOhneLohnsteuer: string;
  finanzierungInfo: string;
  hausgeldInfo: string;
  bewirtschaftungInfo: string;
  mietausfallInfo: (satz: string) => string;
  eigeninvestition: string;
  ueberschuss: string;
  vermoegensaufbau: string;
  betrachtungszeitraum: string;
  reiterJahre: (anzahl: number) => string;
  vaTitelOben: string;
  vaTitelUnten: string;
  ekRendite: string;
  ekRenditeInfo: string;
  anfangsinvestitionMit: (betrag: string) => string;
  ohneEigenkapital: string;
  aufgebautMit: (betrag: string) => string;
  sanierungTitel: (fertigstellung: number | null | undefined) => string;
  abzugsfaehig: string;
  deinAnteil: string;
  sanierungInfo: (e: { gesamt: string | null; anteil: string | null; erhaltungsaufwand: boolean; jahre: number; abJahr: number }) => string;
  einmaligeErsparnis: string;
  wirkung: string;
  steuerlich: string;
  ersparnisInfo: (satz: string) => string;
  ueberDieAfa: string;
  nichtAngesetzt: string;
  steuerberaterPrueft: string;
  vermoegenNachJahren: (jahre: number) => string;
  vermoegenInfo: (ertrag: string, cashflow: string) => string;
  aufgebautesVermoegen: string;
  anfangsinvestition: string;
  jederEuro: string;
  nichtBerechenbar: string;
  schluss: (wertsteigerung: string | null) => string;
}

export const EXPOSE_RECHNER_TEXTE: ZweiSprachen<ExposeRechnerTexte> = {
  de: {
    herkunftSelbstauskunft: "Selbstauskunft",
    herkunftObjekt: "Objekt",
    ja: "ja",
    nein: "nein",
    proJahr: "p. a.",
    bcKaufpreis: "Kaufpreis",
    bcPreisanpassung: (satz) => `Preisanpassung ${satz}`,
    bcStellplatz: "Stellplatz",
    bcGesamtinvestition: "Gesamtinvestition",
    bcNebenkosten: "Kaufnebenkosten",
    bcNebenkostenVerkaeufer: "Kaufnebenkosten, trägt der Verkäufer",
    bcEigenkapital: "Eigenkapitaleinsatz",
    bcEigenkapitalersatz: "Eigenkapitalersatz durch Darlehen",
    bcGesamteigenkapital: "Gesamteigenkapitaleinsatz",
    monatMiete: "Miete",
    monatSteuervorteil: "Steuervorteil",
    monatFinanzierung: "Finanzierung",
    monatRuecklagen: "Rücklagen",
    monatBewirtschaftung: "Bewirtschaftung",
    monatHausgeld: "Rücklagen und Bewirtschaftung",
    monatMietverwaltung: "Mietverwaltung",
    monatMietausfall: "Mietausfall",
    monate: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    werteImJahr: (jahr) => `Werte im Jahr ${jahr}`,
    werteAb: (monat, jahr) => `Werte ab ${monat} ${jahr}`,
    schaubildTitel: (kaufpreis, jahre, wert, restschuld, ertrag) => `Kaufpreis ${kaufpreis}. Nach ${jahre} Jahren: Immobilienwert ${wert}, Restschuld ${restschuld}, Ertrag bei Verkauf ${ertrag}.`,
    svgWertsteigerung: "WERTSTEIGERUNG",
    svgJahre: "JAHRE",
    svgTilgung: "TILGUNG",
    svgKaufpreis: "KAUFPREIS",
    svgInklStellplatz: "inkl. Stellplatz",
    svgImmobilienwert: "IMMOBILIENWERT",
    svgErtragBeiVerkauf: "ERTRAG BEI VERKAUF",
    svgRestschuld: "RESTSCHULD",
    mobilKaufpreis: "Kaufpreis",
    mobilKaufpreisStellplatz: "Kaufpreis inkl. Stellplatz",
    mobilWeg: (jahre, wertsteigerung, tilgung) => `in ${jahre} Jahren · Wertsteigerung ${wertsteigerung} · Tilgung ${tilgung}`,
    immobilienwert: "Immobilienwert",
    restschuld: "Restschuld",
    ertragBeiVerkauf: "Ertrag bei Verkauf",
    nkInfo: (e) => `${e.prozentGesamt} % der Gesamtinvestition: Grunderwerbsteuer ${e.grunderwerbsteuer} %${e.bundesland ? ` (${e.bundesland})` : ""}, Notar und Grundbuch ${e.notarGrundbuch} %${e.makler ? `, Makler ${e.makler} %` : ", keine Maklerprovision"}. ${e.quelle === "manuell" ? "Satz laut Objektangaben." : e.quelle === "mittelwert" ? "Bundesland unbekannt, Mittelwert aller Länder." : "Satz nach Bundesland."}${e.verkaeuferBetrag ? ` Die ${e.verkaeuferBetrag} übernimmt der Verkäufer.` : " Die Kaufnebenkosten trägst du aus Eigenkapital."}`,
    gesamtinvestitionZusatz: "(Kaufnebenkosten zahlst du zusätzlich)",
    eigenkapitalersatzInfo: "Ein zweites Darlehen ersetzt diesen Teil deines Eigenkapitals.",
    darlehen: "Über ein Darlehen finanziert:",
    businessCaseTitel: (quote) => `Business Case, ${quote} % Finanzierung`,
    finanzierungsparameter: "Finanzierungsparameter",
    finanzierungsparameterZusatz: " anpassen",
    anzahlSelbstauskunft: (anzahl) => `${anzahl} ${anzahl === 1 ? "Wert" : "Werte"} aus deiner Selbstauskunft`,
    gesperrt: "Die Annahmen hat dein Ansprechpartner festgelegt.",
    eigenkapital: "Eigenkapital",
    betrag: "Betrag",
    eigenkapitalInEuro: "Eigenkapital in Euro",
    zinssatz: "Zinssatz",
    tilgung: "Tilgung",
    selbstauskunftEigenkapital: (betrag) => `Laut Selbstauskunft stehen ${betrag} an liquidem Eigenkapital bereit.`,
    zvE: "Zu versteuerndes Einkommen vor Investition",
    verheiratet: "Verheiratet",
    grenzsteuersatz: (satz, manuell, steuerjahr) => `Für die Steuerberechnung · Grenzsteuersatz ${satz} % ${manuell ? "fest vorgegeben" : `nach Tarif ${steuerjahr}`}`,
    lohnsteuer: "Mit Lohnsteuerermäßigung (§ 39a EStG)",
    lohnsteuerInfo: "Mit einem Freibetrag für die Lohnsteuer kommt der Steuervorteil jeden Monat mit dem Gehalt. Ohne ihn erstattet das Finanzamt erst nach der Steuererklärung im Folgejahr.",
    wachstum: (miete, kosten, wert, proJahr) => `Wachstumsannahmen: Mietsteigerung ${miete} | Kostensteigerung ${kosten} | Wertentwicklung ${wert} ${proJahr}`,
    weitereAnnahmen: (e) => `Weitere Annahmen: Leerstand ${e.leerstand} % · AfA ${e.afa} % · Sonder-AfA ${e.sonderAfa ? "ja" : "nein"} · Mietverwaltung ${e.mietverwaltung ? "eingerechnet" : "nicht eingerechnet"}${e.makler ? ` · Makler ${e.makler} %` : ""}${e.preisanpassung ? ` · Preisanpassung ${e.preisanpassung} %` : ""}`,
    wenigerAnzeigen: "Weniger anzeigen",
    alleAnsehen: "Alle Annahmen ansehen",
    alleAnpassen: "Alle Annahmen anpassen",
    mietsteigerung: "Mietsteigerung je Jahr",
    kostensteigerung: "Kostensteigerung je Jahr",
    wertentwicklung: "Wertentwicklung je Jahr",
    leerstand: "Leerstand",
    maklerprovision: "Maklerprovision",
    preisanpassung: "Preisanpassung",
    afaJeJahr: "AfA je Jahr",
    sonderAfa: "Sonder-AfA ansetzen (§ 7b EStG)",
    mietverwaltungEinrechnen: "Mietverwaltung in die Ausgaben einrechnen",
    sanierungSteuerlich: "Sanierung steuerlich",
    instandhaltungKeine: "Nicht ansetzen",
    instandhaltungErhaltungsaufwand: "Erhaltungsaufwand, sofort abziehbar",
    instandhaltungWerkvertrag: "Werkvertrag, erhöht die AfA-Grundlage",
    verteiltAufJahre: "Verteilt auf Jahre",
    jahre: (anzahl) => `${anzahl} ${anzahl === 1 ? "Jahr" : "Jahre"}`,
    betrachtungsjahr: "Betrachtungsjahr",
    einnahmen: "Einnahmen",
    ausgaben: "Ausgaben",
    steuervorteilMitLohnsteuer: "Monatlich über den Freibetrag für die Lohnsteuer. Die einmalige Ersparnis aus einer Sanierung ist hier nicht enthalten.",
    steuervorteilOhneLohnsteuer: "Als Erstattung im Folgejahr, hier auf den Monat umgelegt. Im ersten Jahr deshalb 0 €.",
    finanzierungInfo: "Zins und Tilgung des Darlehens.",
    hausgeldInfo: "Nicht umlagefähiges Hausgeld: Verwaltung der Eigentümergemeinschaft und Zuführung zur Erhaltungsrücklage.",
    bewirtschaftungInfo: "Nicht umlagefähiges Hausgeld, etwa Verwaltung und Kontoführung.",
    mietausfallInfo: (satz) => `Leerstand von ${satz} % der Miete.`,
    eigeninvestition: "Monatliche Eigeninvestition",
    ueberschuss: "Monatlicher Überschuss",
    vermoegensaufbau: "Vermögensaufbau",
    betrachtungszeitraum: "Betrachtungszeitraum",
    reiterJahre: (anzahl) => `${anzahl} Jahre`,
    vaTitelOben: "Vermögensaufbau mit einer",
    vaTitelUnten: "Immobilie als Kapitalanlage",
    ekRendite: "Jährliche Eigenkapitalrendite",
    ekRenditeInfo: "Aufgebautes Vermögen ist der Ertrag bei Verkauf (Immobilienwert minus Restschuld) plus alle monatlichen Überschüsse und Zuzahlungen bis dahin, ohne die einmalige Steuerersparnis aus einer Sanierung. Die Anfangsinvestition ist dein Gesamteigenkapitaleinsatz. Die Rendite ist die jährliche Wachstumsrate von der Anfangsinvestition zum aufgebauten Vermögen.",
    anfangsinvestitionMit: (betrag) => `Anfangsinvestition: ${betrag}`,
    ohneEigenkapital: "ohne Eigenkapitaleinsatz nicht bestimmbar",
    aufgebautMit: (betrag) => `Aufgebautes Vermögen: ${betrag}`,
    sanierungTitel: (fertigstellung) => `Sanierung am Gemeinschaftseigentum${fertigstellung ? ` (Fertigstellung ${fertigstellung})` : ""}`,
    abzugsfaehig: "Abzugsfähige Positionen",
    deinAnteil: "Dein Anteil an der Maßnahme",
    sanierungInfo: (e) => `${e.gesamt ? `Maßnahme am Gemeinschaftseigentum ${e.gesamt}` : "Maßnahme am Gemeinschaftseigentum"}${e.anteil ? `, dein Miteigentumsanteil ${e.anteil} %` : ""}. ${e.erhaltungsaufwand ? `Als Erhaltungsaufwand ${e.jahre > 1 ? `verteilt auf ${e.jahre} Jahre ab` : "im Jahr der Fertigstellung"} ${e.abJahr} abziehbar.` : ""}`,
    einmaligeErsparnis: "Einmalige Steuerersparnis",
    wirkung: "Wirkung",
    steuerlich: "Steuerlich",
    ersparnisInfo: (satz) => `Nach deinem Steuertarif gerechnet, das sind rund ${satz} % auf deinen Anteil. Die Ersparnis steht gesondert und fließt nicht in Monatsübersicht, Vermögensaufbau und Eigenkapitalrendite ein.`,
    ueberDieAfa: "über die AfA",
    nichtAngesetzt: "nicht angesetzt",
    steuerberaterPrueft: "Ob die Maßnahme als Erhaltungsaufwand gilt, prüft dein Steuerberater.",
    vermoegenNachJahren: (jahre) => `Vermögensaufbau nach ${jahre} Jahren`,
    vermoegenInfo: (ertrag, cashflow) => `Aufgebautes Vermögen: Ertrag bei Verkauf ${ertrag} plus alle monatlichen Überschüsse und Zuzahlungen bis dahin (${cashflow}). Für jeden eingesetzten Euro: aufgebautes Vermögen geteilt durch die Anfangsinvestition.`,
    aufgebautesVermoegen: "Aufgebautes Vermögen",
    anfangsinvestition: "Anfangsinvestition",
    jederEuro: "Für jeden eingesetzten 1 €",
    nichtBerechenbar: "nicht berechenbar",
    schluss: (wertsteigerung) => `Modellrechnung, keine Zusage. Grundlage sind die Annahmen oben${wertsteigerung ? `, der Immobilienwert wächst mit ${wertsteigerung} % im Jahr` : ""}. Zinsen nach der Zinsbindung, Steuern, Mieten und Wertentwicklung können abweichen. Details im Abschnitt Chancen und Risiken.`,
  },
  en: {
    herkunftSelbstauskunft: "Self-disclosure",
    herkunftObjekt: "Property",
    ja: "yes",
    nein: "no",
    proJahr: "p.a.",
    bcKaufpreis: "Purchase price",
    bcPreisanpassung: (satz) => `Price adjustment ${satz}`,
    bcStellplatz: "Parking space",
    bcGesamtinvestition: "Total investment",
    bcNebenkosten: "Incidental purchase costs",
    bcNebenkostenVerkaeufer: "Incidental purchase costs, paid by the seller",
    bcEigenkapital: "Equity contribution",
    bcEigenkapitalersatz: "Equity replaced by a loan",
    bcGesamteigenkapital: "Total equity contribution",
    monatMiete: "Rent",
    monatSteuervorteil: "Tax benefit",
    monatFinanzierung: "Financing",
    monatRuecklagen: "Reserves",
    monatBewirtschaftung: "Running costs",
    monatHausgeld: "Reserves and running costs",
    monatMietverwaltung: "Rental management",
    monatMietausfall: "Loss of rent",
    monate: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    werteImJahr: (jahr) => `Figures for ${jahr}`,
    werteAb: (monat, jahr) => `Figures from ${monat} ${jahr}`,
    schaubildTitel: (kaufpreis, jahre, wert, restschuld, ertrag) => `Purchase price ${kaufpreis}. After ${jahre} years: property value ${wert}, remaining debt ${restschuld}, proceeds on sale ${ertrag}.`,
    svgWertsteigerung: "INCREASE IN VALUE",
    svgJahre: "YEARS",
    svgTilgung: "REPAYMENT",
    svgKaufpreis: "PURCHASE PRICE",
    svgInklStellplatz: "incl. parking space",
    svgImmobilienwert: "PROPERTY VALUE",
    svgErtragBeiVerkauf: "PROCEEDS ON SALE",
    svgRestschuld: "REMAINING DEBT",
    mobilKaufpreis: "Purchase price",
    mobilKaufpreisStellplatz: "Purchase price incl. parking space",
    mobilWeg: (jahre, wertsteigerung, tilgung) => `in ${jahre} years · increase in value ${wertsteigerung} · repayment ${tilgung}`,
    immobilienwert: "Property value",
    restschuld: "Remaining debt",
    ertragBeiVerkauf: "Proceeds on sale",
    nkInfo: (e) => `${e.prozentGesamt}% of the total investment: real estate transfer tax (Grunderwerbsteuer) ${e.grunderwerbsteuer}%${e.bundesland ? ` (${e.bundesland})` : ""}, notary and land register ${e.notarGrundbuch}%${e.makler ? `, broker ${e.makler}%` : ", no broker’s commission"}. ${e.quelle === "manuell" ? "Rate as per the property information." : e.quelle === "mittelwert" ? "Federal state unknown, average of all states." : "Rate according to the federal state."}${e.verkaeuferBetrag ? ` The seller pays the ${e.verkaeuferBetrag}.` : " You pay the incidental purchase costs from your equity."}`,
    gesamtinvestitionZusatz: "(plus incidental purchase costs)",
    eigenkapitalersatzInfo: "A second loan replaces this part of your equity.",
    darlehen: "Financed by a loan:",
    businessCaseTitel: (quote) => `Business case, ${quote}% financing`,
    finanzierungsparameter: "Financing parameters",
    finanzierungsparameterZusatz: " (adjustable)",
    anzahlSelbstauskunft: (anzahl) => `${anzahl} ${anzahl === 1 ? "value" : "values"} from your self-disclosure (Selbstauskunft)`,
    gesperrt: "Your contact has set the assumptions.",
    eigenkapital: "Equity",
    betrag: "Amount",
    eigenkapitalInEuro: "Equity in euros",
    zinssatz: "Interest rate",
    tilgung: "Repayment",
    selbstauskunftEigenkapital: (betrag) => `According to your self-disclosure, ${betrag} of liquid equity is available.`,
    zvE: "Taxable income before the investment",
    verheiratet: "Married",
    grenzsteuersatz: (satz, manuell, steuerjahr) => `For the tax calculation · marginal tax rate ${satz}% ${manuell ? "fixed" : `based on the ${steuerjahr} tax scale`}`,
    lohnsteuer: "With wage tax reduction (Section 39a EStG)",
    lohnsteuerInfo: "With a wage tax allowance, the tax benefit arrives every month with your salary. Without it, the tax office only refunds it after your tax return in the following year.",
    wachstum: (miete, kosten, wert, proJahr) => `Growth assumptions: rent increase ${miete} | cost increase ${kosten} | value development ${wert} ${proJahr}`,
    weitereAnnahmen: (e) => `Further assumptions: vacancy ${e.leerstand}% · depreciation (AfA) ${e.afa}% · special depreciation ${e.sonderAfa ? "yes" : "no"} · rental management ${e.mietverwaltung ? "included" : "not included"}${e.makler ? ` · broker ${e.makler}%` : ""}${e.preisanpassung ? ` · price adjustment ${e.preisanpassung}%` : ""}`,
    wenigerAnzeigen: "Show less",
    alleAnsehen: "View all assumptions",
    alleAnpassen: "Adjust all assumptions",
    mietsteigerung: "Rent increase per year",
    kostensteigerung: "Cost increase per year",
    wertentwicklung: "Value development per year",
    leerstand: "Vacancy",
    maklerprovision: "Broker’s commission",
    preisanpassung: "Price adjustment",
    afaJeJahr: "Depreciation (AfA) per year",
    sonderAfa: "Apply special depreciation (Section 7b EStG)",
    mietverwaltungEinrechnen: "Include rental management in the expenses",
    sanierungSteuerlich: "Tax treatment of the renovation",
    instandhaltungKeine: "Do not apply",
    instandhaltungErhaltungsaufwand: "Maintenance expenses (Erhaltungsaufwand), deductible immediately",
    instandhaltungWerkvertrag: "Contract for work (Werkvertrag), increases the depreciation base",
    verteiltAufJahre: "Spread over years",
    jahre: (anzahl) => `${anzahl} ${anzahl === 1 ? "year" : "years"}`,
    betrachtungsjahr: "Year under review",
    einnahmen: "Income",
    ausgaben: "Expenses",
    steuervorteilMitLohnsteuer: "Monthly via the wage tax allowance. The one-off saving from a renovation is not included here.",
    steuervorteilOhneLohnsteuer: "As a refund in the following year, shown here per month. In the first year therefore €0.",
    finanzierungInfo: "Interest and repayment of the loan.",
    hausgeldInfo: "Non-recoverable service charge (Hausgeld): management of the owners’ association and contribution to the maintenance reserve.",
    bewirtschaftungInfo: "Non-recoverable service charge, for example management and account fees.",
    mietausfallInfo: (satz) => `Vacancy of ${satz}% of the rent.`,
    eigeninvestition: "Monthly own contribution",
    ueberschuss: "Monthly surplus",
    vermoegensaufbau: "Building wealth",
    betrachtungszeitraum: "Period under review",
    reiterJahre: (anzahl) => `${anzahl} years`,
    vaTitelOben: "Building wealth with",
    vaTitelUnten: "a property as an investment",
    ekRendite: "Annual return on equity",
    ekRenditeInfo: "Wealth built up is the proceeds on sale (property value minus remaining debt) plus all monthly surpluses and top-ups until then, without the one-off tax saving from a renovation. The initial investment is your total equity contribution. The return is the annual growth rate from the initial investment to the wealth built up.",
    anfangsinvestitionMit: (betrag) => `Initial investment: ${betrag}`,
    ohneEigenkapital: "cannot be determined without an equity contribution",
    aufgebautMit: (betrag) => `Wealth built up: ${betrag}`,
    sanierungTitel: (fertigstellung) => `Renovation of the common property${fertigstellung ? ` (completion ${fertigstellung})` : ""}`,
    abzugsfaehig: "Deductible items",
    deinAnteil: "Your share of the works",
    sanierungInfo: (e) => `${e.gesamt ? `Works on the common property ${e.gesamt}` : "Works on the common property"}${e.anteil ? `, your co-ownership share ${e.anteil}%` : ""}. ${e.erhaltungsaufwand ? `Deductible as maintenance expenses ${e.jahre > 1 ? `spread over ${e.jahre} years from` : "in the year of completion"} ${e.abJahr}.` : ""}`,
    einmaligeErsparnis: "One-off tax saving",
    wirkung: "Effect",
    steuerlich: "For tax purposes",
    ersparnisInfo: (satz) => `Calculated using your tax rate, this is approx. ${satz}% of your share. The saving is shown separately and is not included in the monthly overview, wealth building or return on equity.`,
    ueberDieAfa: "via depreciation",
    nichtAngesetzt: "not applied",
    steuerberaterPrueft: "Your tax adviser will check whether the works count as maintenance expenses.",
    vermoegenNachJahren: (jahre) => `Wealth built up after ${jahre} years`,
    vermoegenInfo: (ertrag, cashflow) => `Wealth built up: proceeds on sale ${ertrag} plus all monthly surpluses and top-ups until then (${cashflow}). For every euro invested: wealth built up divided by the initial investment.`,
    aufgebautesVermoegen: "Wealth built up",
    anfangsinvestition: "Initial investment",
    jederEuro: "For every €1 invested",
    nichtBerechenbar: "cannot be calculated",
    schluss: (wertsteigerung) => `Model calculation, not a promise. It is based on the assumptions above${wertsteigerung ? `, with the property value growing by ${wertsteigerung}% a year` : ""}. Interest after the fixed-interest period, taxes, rents and value development may differ. Details in the Opportunities and risks section.`,
  },
};

export function exposeRechnerTexte(sprache: Sprache | undefined | null): ExposeRechnerTexte {
  return EXPOSE_RECHNER_TEXTE[sprache === "en" ? "en" : "de"];
}

/* ── Hinweise aus dem Rechenkern ────────────────────────────── */

/**
 * Eine Zahl, wie der Rechenkern sie in seine Hinweise schreibt, auf Englisch:
 * „5,5“ oder „5.5“ zu „5.5“, „5.200“ (deutsche Tausender) zu „5,200“.
 */
function zahlEn(z: string): string {
  if (/^\d{1,3}(\.\d{3})+$/.test(z)) return z.replace(/\./g, ",");
  return z.replace(",", ".");
}

/** Die Begründungen aus `sonderabschreibung7b` (`afaSaetze.ts`). */
function sonder7bEn(detail: string): string {
  let m: RegExpMatchArray | null;
  if (detail === "Wohnfläche erforderlich") return "living space required";
  if (detail === "Innerhalb beider Grenzen") return "within both limits";
  if ((m = detail.match(/^Baukosten je m² über der Obergrenze von ([\d.,]+) Euro, die Förderung entfällt vollständig$/))) {
    return `construction costs per m² above the limit of €${zahlEn(m[1])}, so the incentive is lost entirely`;
  }
  if ((m = detail.match(/^Bemessungsgrundlage auf ([\d.,]+) Euro je m² gekürzt$/))) {
    return `assessment base reduced to €${zahlEn(m[1])} per m²`;
  }
  return detail;
}

const FESTE_HINWEISE_EN: Record<string, string> = {
  "Bundesland unbekannt, Grunderwerbsteuer als Mittelwert aller Länder angesetzt.":
    "Federal state unknown, real estate transfer tax (Grunderwerbsteuer) set at the average of all states.",
  "Kaufnebenkosten übernimmt der Verkäufer: kein Eigenkapital dafür, sie erhöhen auch nicht die AfA-Grundlage.":
    "The seller pays the incidental purchase costs: no equity is needed for them, and they do not increase the depreciation (AfA) base either.",
  "Zweites Darlehen auf den Eigenkapitaleinsatz begrenzt, mehr gibt es nicht zu ersetzen.":
    "Second loan limited to the equity contribution, as there is nothing more to replace.",
  "Zweites Darlehen auf das Bankdarlehen begrenzt, mehr gibt es nicht zu ersetzen.":
    "Second loan limited to the bank loan, as there is nothing more to replace.",
  "Sanierung als Werkvertrag: Herstellungskosten, erhöhen die AfA-Grundlage statt sofort abziehbar zu sein.":
    "Renovation as a contract for work: production costs (Herstellungskosten) that increase the depreciation base instead of being deductible immediately.",
  "Sonder-AfA nicht angesetzt: kein Sanierungsanteil bekannt.":
    "Special depreciation not applied: no renovation share known.",
  "Kein zu versteuerndes Einkommen angegeben, Steuerwirkung 0.":
    "No taxable income entered, tax effect 0.",
  "Ohne Lohnsteuerermäßigung kommt der Steuervorteil als Erstattung im Folgejahr an.":
    "Without a wage tax reduction, the tax benefit arrives as a refund in the following year.",
};

/** Hinweise mit Zahlen: Muster und englische Fassung. */
const MUSTER_EN: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  [/^Nebenkosten ([\d.,]+) % wie am Objekt gepflegt\.$/, (m) => `Incidental purchase costs of ${zahlEn(m[1])}% as recorded for the property.`],
  [/^Gebäudeanteil nicht am Objekt gepflegt, ([\d.,]+) % angenommen\.$/, (m) => `Building share not recorded for the property, ${zahlEn(m[1])}% assumed.`],
  [/^Erhöhte AfA ([\d.,]+) % auf den Sanierungsanteil über (\d+) Jahre\.$/, (m) => `Increased depreciation of ${zahlEn(m[1])}% on the renovation share over ${m[2]} years.`],
  [/^Sonder-AfA ([\d.,]+) % auf den Gebäudeanteil über (\d+) Jahre\.$/, (m) => `Special depreciation of ${zahlEn(m[1])}% on the building share over ${m[2]} years.`],
  [/^Sonder-AfA § 7b EStG nicht angesetzt: (.+)\.$/, (m) => `Special depreciation (Section 7b EStG) not applied: ${sonder7bEn(m[1])}.`],
  [/^Sonder-AfA § 7b EStG: (.+)\.$/, (m) => `Special depreciation (Section 7b EStG): ${sonder7bEn(m[1])}.`],
  [/^Steuerwirkung flach mit ([\d.,]+) % Grenzsteuersatz statt nach Tarif\.$/, (m) => `Tax effect calculated at a flat marginal tax rate of ${zahlEn(m[1])}% instead of the tax scale.`],
  [/^Mieterhöhung ab (\d{2})\/(\d{4}) berücksichtigt\.$/, (m) => `Rent increase from ${m[1]}/${m[2]} included.`],
];

/**
 * Ein Hinweis aus `berechneExpose` (`ergebnis.hinweise`, `steuer.sonderAfaHinweis`)
 * in der Sprache der Seite. Der Rechenkern bleibt deutsch; übersetzt wird nur
 * die Anzeige. Auf Deutsch und bei unbekanntem Wortlaut kommt der Text
 * unverändert zurück, damit ein neuer Hinweis nie verschwindet.
 */
export function rechnerHinweis(text: string, sprache: Sprache): string {
  if (sprache !== "en") return text;
  const fest = FESTE_HINWEISE_EN[text];
  if (fest) return fest;
  for (const [muster, bau] of MUSTER_EN) {
    const m = text.match(muster);
    if (m) return bau(m);
  }
  return text;
}
