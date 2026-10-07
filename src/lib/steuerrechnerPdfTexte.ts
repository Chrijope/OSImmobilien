/**
 * Die Texte der Steuerauswertung als PDF, Deutsch und Englisch.
 *
 * Plan Kundensprache, Etappe 6, Dokument D20: Das PDF uebernimmt die Sprache
 * der oeffentlichen Seite. `steuerrechnerPdf.ts` fuehrt nur noch den Satz,
 * alle Woerter stehen hier.
 *
 * Texte mit Zahlen sind Funktionen und formatieren selbst:
 *   - Deutsch mit genau den Formatierern, die das PDF bisher benutzt hat
 *     (`Intl` mit "de-DE", Nachkommastellen nur, wo es welche gibt). Die
 *     deutsche Auswertung bleibt dadurch Zeichen fuer Zeichen gleich.
 *   - Englisch ueber `sprachFormat.ts` („€1,234“, britisches Zahlenformat).
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): deutsche Steuer- und
 * Rechtsbegriffe beim ersten Auftreten mit dem deutschen Wort in Klammern.
 * Nie „advisor“, der Ansprechpartner heisst „your contact“.
 */
import { SPRACH_LOCALE, euroText, type FormatSprache } from "@/lib/sprachFormat";

/** Betrag ohne Nachkommastellen, wie im ganzen Dokument. */
function eurFuer(sprache: FormatSprache) {
  if (sprache === "en") {
    /* Das echte Minuszeichen aus `euroText` hat nicht jede Schrift im PDF,
       der Bindestrich schon. */
    return (n: number) => euroText(Math.round(n), "en").replace("−", "-");
  }
  const format = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  return (n: number) => format.format(Math.round(n));
}

/** Zahl mit hoechstens `max` Nachkommastellen: „2“, „2,5“ oder „2.5“. */
function zahlFuer(sprache: FormatSprache) {
  return (n: number, max: number) =>
    (Number.isFinite(n) ? n : 0).toLocaleString(SPRACH_LOCALE[sprache], { maximumFractionDigits: max });
}

const eurDe = eurFuer("de");
const zDe = zahlFuer("de");
const eurEn = eurFuer("en");
const zEn = zahlFuer("en");

const de = {
  dateiname: (datum: string) => `MOREImmo-Steuerauswertung-${datum}.pdf`,
  betrag: (n: number) => eurDe(n),
  spanne: (von: number, bis: number) => `${eurDe(von)} bis ${eurDe(bis)}`,

  kopfTitel: "Deine Steuerauswertung",
  deckblatt: {
    kennung: "Steuerrechner",
    titel: "Deine Steuerauswertung",
    untertitel:
      "Was du heute an Steuern zahlst, wie viel eine vermietete Wohnung davon senkt, und welches Vermögen dabei entsteht. Die Abschreibung ist mit Gutachten gerechnet, der gesetzliche Satz steht daneben.",
    fusszeile: "Modellrechnung, keine Steuerberatung.",
  },
  kennzahlen: {
    ersparnisJahr1: "Steuerersparnis, erstes Jahr",
    ersparnisJahre: (jahre: number) => `Steuerersparnis in ${jahre} Jahren`,
    vermoegenJahre: (jahre: number) => `Vermögensaufbau in ${jahre} Jahren`,
  },
  /** Auf Deutsch kein eigener Hinweis. Leer heisst: der Absatz entfaellt. */
  steuerrechtHinweis: "",

  seiteZahlen: {
    unterzeile: "Deine Zahlen",
    heuteTitel: "Was du heute abführst",
    einleitungSplitting: (brutto: number, partner: number, zvE: number, grenzProzent: number) =>
      `Gerechnet mit Zusammenveranlagung, also dem Ehegattensplitting. Angesetzt sind dein Jahresbrutto von ${eurDe(brutto)} und ${eurDe(partner)} für deinen Partner. Daraus ergibt sich ein gemeinsames zu versteuerndes Einkommen von ${eurDe(zvE)} und ein Grenzsteuersatz von ${zDe(grenzProzent, 1)} Prozent.`,
    einleitungEinzeln: (brutto: number, zvE: number, grenzProzent: number) =>
      `Gerechnet mit Einzelveranlagung nach dem Grundtarif und einem Jahresbrutto von ${eurDe(brutto)}. Daraus ergibt sich ein zu versteuerndes Einkommen von ${eurDe(zvE)} und ein Grenzsteuersatz von ${zDe(grenzProzent, 1)} Prozent.`,
    est: { titel: "Einkommensteuer", erklaerung: "Nach § 32a EStG, Stand 2026" },
    soli: { titel: "Solidaritätszuschlag", erklaerung: "Erst oberhalb der Freigrenze" },
    kirche: { titel: "Kirchensteuer", erklaerung: "Sie mindert als Sonderausgabe die Einkommensteuer" },
    steuerlast: "Deine Steuerlast pro Jahr",
    inJahren: (jahre: number) => `In ${jahre} Jahren`,
    inJahrenErklaerung: "Dieses Geld ist abgeführt und baut für dich kein Vermögen auf",

    wohnungTitel: "Mit einer vermieteten Wohnung",
    objektAbsatz: (preis: number, anteilProzent: number, gebaeudewert: number) =>
      `Gerechnet ist mit einer gebrauchten, vermieteten Eigentumswohnung zu ${eurDe(preis)}. Der Gebäudeanteil beträgt ${anteilProzent} Prozent, also ${eurDe(gebaeudewert)}, und nur darauf gibt es Abschreibung. Es ist eine typisierte Annahme und kein konkretes Angebot.`,
    spanneAbsatz: (satzRegulaer: number, nutzungsdauer: number, satzErhoeht: number) =>
      `Warum eine Spanne und keine feste Zahl: Für dieselbe Wohnung stehen zwei Abschreibungswege offen. Der gesetzliche Satz von ${zDe(satzRegulaer, 1)} Prozent gilt ohne Nachweis, er unterstellt eine Nutzungsdauer von ${nutzungsdauer} Jahren. Wer nachweist, dass die tatsächliche Nutzungsdauer kürzer ist, darf mit ${zDe(satzErhoeht, 1)} Prozent abschreiben. Beide Enden sind gerechnet, keines ist gerundet.`,
    angesetzt: {
      titel: "Angesetzte Abschreibung, pro Jahr",
      erklaerung: (satz: number, restnutzungsdauer: number, nutzungsdauer: number) =>
        `${zDe(satz, 2)} Prozent, Nutzungsdauer ${restnutzungsdauer} Jahre statt der gesetzlich unterstellten ${nutzungsdauer}, nur mit Gutachten zum Objekt (§ 7 Abs. 4 Satz 2 EStG)`,
    },
    gesetzlich: {
      titel: "Gesetzliche Abschreibung, pro Jahr",
      erklaerung: (satz: number, grund: string, paragraf: string) =>
        `${zDe(satz, 1)} Prozent, ${grund}, ${paragraf}. Abgesicherte Untergrenze, gilt ohne Nachweis`,
    },
    spanneJahr: "Deine Spanne pro Jahr",
    spanneJahre: (jahre: number) => `Deine Spanne über ${jahre} Jahre`,
    spanneJahreErklaerung: "Nicht das Zehnfache: Der abziehbare Zins sinkt mit der Tilgung",
    erhaltung: {
      titel: "Erhaltungsaufwand, einmalig",
      erklaerung: "Nur wenn nach dem Kauf tatsächlich Instandsetzungen anfallen",
      betrag: (n: number) => `bis zu ${eurDe(n)}`,
    },
    vermoegen: {
      titel: (jahre: number) => `Vermögensaufbau in ${jahre} Jahren`,
      erklaerung: (tilgung: number, wertsteigerung: number) =>
        `${eurDe(tilgung)} Tilgung und ${eurDe(wertsteigerung)} angenommener Wertzuwachs`,
    },
    zuzahlung: (jahre: number) => `Deine Zuzahlung über ${jahre} Jahre`,
    ueberschuss: (jahre: number) => `Dein Überschuss über ${jahre} Jahre`,
    liquiditaetErklaerung: "Miete minus Zins, Tilgung und Kosten, die Steuerersparnis ist gegengerechnet",
    netto: {
      titel: (jahre: number) => `Unter dem Strich nach ${jahre} Jahren`,
      erklaerung: "Vermögensaufbau, Zuzahlung und Kaufnebenkosten verrechnet",
    },
  },

  seiteWarum: {
    unterzeile: "Warum eine Immobilie Steuern spart",
    grundgedankeTitel: "Der Grundgedanke",
    grundgedanke1:
      "Eine vermietete Wohnung kostet in den ersten Jahren mehr, als sie einbringt. Abschreibung, Zinsen und laufende Kosten übersteigen die Miete. Dieses Minus ziehst du von deinem übrigen Einkommen ab, bevor das Finanzamt rechnet. Dein zu versteuerndes Einkommen sinkt, und damit sinkt deine Steuer.",
    grundgedanke2:
      "Der größte Teil dieses Minus ist die Abschreibung. Sie ist eine reine Rechengröße: Sie mindert dein Einkommen auf dem Papier, ohne dass in diesem Jahr auch nur ein Euro dein Konto verlässt. Genau darin liegt der Hebel.",
    bausteineTitel: "Die Bausteine deines Falls",
    afaRegulaer: {
      titel: "Abschreibung, regulär",
      erklaerung: (satz: number, gebaeudewert: number) =>
        `${zDe(satz, 1)} Prozent auf ${eurDe(gebaeudewert)} Gebäudewert`,
    },
    afaErhoeht: {
      titel: "Abschreibung, erhöht",
      erklaerung: (satz: number) => `${zDe(satz, 1)} Prozent, nur mit Gutachten zur kürzeren Nutzungsdauer`,
    },
    zinsen: {
      titel: "Zinsen",
      erklaerung: (zinsProzent: number) => `Mischzins ${zDe(zinsProzent, 2)} Prozent auf den Kaufpreis`,
    },
    miete: {
      titel: "Miete, die dagegen steht",
      erklaerung: (renditeProzent: number) => `${zDe(renditeProzent, 1)} Prozent Bruttomietrendite`,
    },
    ehrlichTitel: "Was ehrlicherweise dazugehört",
    ehrlichAfa: (
      satzErhoeht: number,
      restnutzungsdauer: number,
      satzRegulaer: number,
      nutzungsdauer: number,
      jahr1Von: number,
      jahr1Bis: number,
    ) =>
      `Gerechnet ist mit ${zDe(satzErhoeht, 2)} Prozent Abschreibung, also mit ${restnutzungsdauer} Jahren Nutzungsdauer. Das bekommt nicht jeder. Der gesetzliche Satz von ${zDe(satzRegulaer, 1)} Prozent steht für eine Nutzungsdauer von ${nutzungsdauer} Jahren, und erst wenn die tatsächliche Nutzungsdauer darunter liegt, erlaubt § 7 Abs. 4 Satz 2 EStG überhaupt mehr. Den Abstand von ${nutzungsdauer} auf ${restnutzungsdauer} Jahre muss ein Gutachten am konkreten Gebäude belegen; eine Restnutzungsdauer, die allein aus dem Modell der ImmoWertV abgeleitet ist, genügt dafür nicht. Das Gutachten kostet Geld, und ob das Finanzamt ihm folgt, entscheidet es im Einzelfall. Ohne dieses Gutachten gilt der gesetzliche Satz, und dann sind es ${eurDe(jahr1Von)} im ersten Jahr statt ${eurDe(jahr1Bis)}.`,
    ehrlichErhaltung: (jahre: number, grenzeNetto: number, bruttoAufwand: number) =>
      `Der Erhaltungsaufwand wirkt einmal: Er kommt im ersten Jahr zur laufenden Ersparnis hinzu, in den Jahren danach nicht mehr, und er gehört deshalb nicht mit ${jahre} multipliziert. § 6 Abs. 1 Nr. 1a EStG erlaubt in drei Jahren nach dem Kauf 15 Prozent des Gebäudewerts ohne Umsatzsteuer; angesetzt sind 90 Prozent davon als Sicherheitsabstand, also ${eurDe(grenzeNetto)} netto und ${eurDe(bruttoAufwand)} mit Umsatzsteuer. Nach § 82b EStDV darfst du größeren Erhaltungsaufwand auch auf zwei bis fünf Jahre verteilen. Er entsteht nur, wenn solche Arbeiten bei deinem Objekt tatsächlich anfallen.`,
    ehrlichZuzahlung: (jahre: number, zuzahlung: number, nebenkostenProzent: number) =>
      `Nicht die ganze Ersparnis ist freies Geld. Im Modell trägt sich die Wohnung nicht aus sich selbst, über ${jahre} Jahre bleibt eine Zuzahlung von ${eurDe(zuzahlung)}, in der die Steuerersparnis schon gegengerechnet ist. Sie ist kein verlorenes Geld, der größte Teil davon ist Tilgung. Dazu kommt dein eigener Einsatz, nämlich die Kaufnebenkosten von ${zDe(nebenkostenProzent, 1)} Prozent, also Grunderwerbsteuer, Notar und Grundbuch. Gerechnet ist der höchste Satz in Deutschland, weil die Grunderwerbsteuer an der Lage der Wohnung hängt und die noch nicht feststeht. Je nach Bundesland, in dem du kaufst, weicht dieser Wert nur nach unten ab. Die Kirchensteuer richtet sich dagegen nach deinem Wohnsitz, ohne Angabe ist sie mit 9 Prozent angesetzt. Der Kaufpreis selbst wird finanziert.`,
    beschaeftigung: (einschaetzung: string, unterlagen: string) =>
      `Dein Beschäftigungsverhältnis ändert an diesen Zahlen nichts, der Tarif kennt keine Berufsgruppen. Es ändert die Finanzierung: ${einschaetzung} ${unterlagen}`,
  },

  seiteVerlauf: {
    unterzeile: "Der Verlauf und dein nächster Schritt",
    titel: (jahre: number) => `Jahr für Jahr über ${jahre} Jahre`,
    spalten: {
      jahr: "JAHR",
      imJahr: "IM JAHR, VON BIS",
      gesamtUnten: "GESAMT, UNTERES ENDE",
      gesamtOben: "GESAMT, OBERES ENDE",
    },
    absatz: (jahre: number) =>
      `Die Spanne fällt über die Jahre leicht, weil der abziehbare Zins mit der Tilgung sinkt. Über ${jahre} Jahre hinaus trifft diese Auswertung bewusst keine Aussage.`,
    naechsterSchritt: "IHR NÄCHSTER SCHRITT",
    schluss:
      "Wir melden uns zeitnah bei dir für ein Erstgespräch. Darin rechnen wir die genauen Zahlen für deinen Fall, statt einer Spanne.",
    startWunsch: (titel: string) => ` Dein gewünschter Start: ${titel}.`,
    kleinTitel: "Annahmen und Grenzen dieser Rechnung",
    klein: (
      preis: number,
      baujahr: number,
      anteilProzent: number,
      zinsProzent: number,
      renditeProzent: number,
      jahre: number,
    ) =>
      `Vereinfachte Modellrechnung nach § 32a EStG, Stand 2026. Angesetzt sind die Pauschbeträge für Werbungskosten und Sonderausgaben sowie die abziehbaren Vorsorgeaufwendungen, dazu typisierte Annahmen zu Sozialabgaben, Objektwert, Zins, Miete und Abschreibung. Kindergeld und die Günstigerprüfung dazu bleiben außen vor. Das Objekt ist typisiert: eine gebrauchte, vermietete Eigentumswohnung zu ${eurDe(preis)}, das ist das Vierfache deines Jahresbruttos, begrenzt auf 180.000 bis 600.000 Euro, Fertigstellung ${baujahr}, Gebäudeanteil ${anteilProzent} Prozent, Mischzins ${zDe(zinsProzent, 2)} Prozent, Bruttomietrendite ${zDe(renditeProzent, 1)} Prozent. Ein konkretes Objekt ist damit nicht gemeint und wird auch nicht empfohlen. Aussagen über den Zeitraum von ${jahre} Jahren hinaus trifft diese Auswertung bewusst nicht. Deine tatsächlichen Werte können abweichen. Dies ist eine Modellrechnung und keine Steuerberatung, sie ersetzt keine individuelle Steuer- oder Anlageberatung.`,
  },
};

export type SteuerPdfTexte = typeof de;

const en: SteuerPdfTexte = {
  // Englisch ohne Umlaute, Plan K4.
  dateiname: (datum: string) => `MOREImmo-Tax-Analysis-${datum}.pdf`,
  betrag: (n: number) => eurEn(n),
  spanne: (von: number, bis: number) => `${eurEn(von)} to ${eurEn(bis)}`,

  kopfTitel: "Your tax analysis",
  deckblatt: {
    kennung: "Tax calculator",
    titel: "Your tax analysis",
    untertitel:
      "What you pay in tax today, how much a let apartment reduces it, and what wealth it builds along the way. Depreciation is calculated with an appraisal, the statutory rate is shown next to it.",
    fusszeile: "Model calculation based on German tax law, not tax advice.",
  },
  kennzahlen: {
    ersparnisJahr1: "Tax relief, first year",
    ersparnisJahre: (jahre: number) => `Tax relief over ${jahre} years`,
    vermoegenJahre: (jahre: number) => `Wealth built over ${jahre} years`,
  },
  // Entscheidung 13: gut sichtbar, auch im PDF.
  steuerrechtHinweis:
    "This calculator is based on German tax law. It is intended for people who pay income tax in Germany.",

  seiteZahlen: {
    unterzeile: "Your figures",
    heuteTitel: "What you pay today",
    einleitungSplitting: (brutto: number, partner: number, zvE: number, grenzProzent: number) =>
      `Calculated with joint assessment, i.e. income splitting for married couples (Ehegattensplitting). Your gross annual salary of ${eurEn(brutto)} and ${eurEn(partner)} for your partner are used. This results in a joint taxable income (zu versteuerndes Einkommen) of ${eurEn(zvE)} and a marginal tax rate (Grenzsteuersatz) of ${zEn(grenzProzent, 1)} percent.`,
    einleitungEinzeln: (brutto: number, zvE: number, grenzProzent: number) =>
      `Calculated with individual assessment under the basic tax table (Grundtabelle) and a gross annual salary of ${eurEn(brutto)}. This results in a taxable income (zu versteuerndes Einkommen) of ${eurEn(zvE)} and a marginal tax rate (Grenzsteuersatz) of ${zEn(grenzProzent, 1)} percent.`,
    est: { titel: "Income tax (Einkommensteuer)", erklaerung: "Under Section 32a EStG, as of 2026" },
    soli: {
      titel: "Solidarity surcharge (Solidaritätszuschlag)",
      erklaerung: "Only above the exemption threshold",
    },
    kirche: {
      titel: "Church tax (Kirchensteuer)",
      erklaerung: "Deductible as a special expense, it reduces your income tax",
    },
    steuerlast: "Your tax burden per year",
    inJahren: (jahre: number) => `Over ${jahre} years`,
    inJahrenErklaerung: "This money is paid away and builds no wealth for you",

    wohnungTitel: "With a let apartment",
    objektAbsatz: (preis: number, anteilProzent: number, gebaeudewert: number) =>
      `The calculation uses a let, previously owned apartment at ${eurEn(preis)}. The building share is ${anteilProzent} percent, i.e. ${eurEn(gebaeudewert)}, and only this share can be depreciated. It is a standardised assumption, not a specific offer.`,
    spanneAbsatz: (satzRegulaer: number, nutzungsdauer: number, satzErhoeht: number) =>
      `Why a range and not a single figure: two depreciation routes are open for the same apartment. The statutory rate of ${zEn(satzRegulaer, 1)} percent applies without proof and assumes a useful life of ${nutzungsdauer} years. If you prove that the actual useful life is shorter, you may depreciate at ${zEn(satzErhoeht, 1)} percent. Both ends are calculated, neither is rounded.`,
    angesetzt: {
      titel: "Depreciation applied, per year",
      erklaerung: (satz: number, restnutzungsdauer: number, nutzungsdauer: number) =>
        `${zEn(satz, 2)} percent, useful life of ${restnutzungsdauer} years instead of the statutory ${nutzungsdauer}, only with an appraisal of the property (Section 7 (4) sentence 2 EStG)`,
    },
    gesetzlich: {
      titel: "Statutory depreciation, per year",
      erklaerung: (satz: number, grund: string, paragraf: string) =>
        `${zEn(satz, 1)} percent, ${grund}, ${paragraf}. Secure lower limit, applies without proof`,
    },
    spanneJahr: "Your range per year",
    spanneJahre: (jahre: number) => `Your range over ${jahre} years`,
    spanneJahreErklaerung: "Not ten times as much: deductible interest falls as you repay",
    erhaltung: {
      titel: "Maintenance expenses (Erhaltungsaufwand), one-off",
      erklaerung: "Only if repairs are actually needed after the purchase",
      betrag: (n: number) => `up to ${eurEn(n)}`,
    },
    vermoegen: {
      titel: (jahre: number) => `Wealth built over ${jahre} years`,
      erklaerung: (tilgung: number, wertsteigerung: number) =>
        `${eurEn(tilgung)} repayment and ${eurEn(wertsteigerung)} assumed increase in value`,
    },
    zuzahlung: (jahre: number) => `Your top-up over ${jahre} years`,
    ueberschuss: (jahre: number) => `Your surplus over ${jahre} years`,
    liquiditaetErklaerung: "Rent minus interest, repayment and costs, with the tax relief already offset",
    netto: {
      titel: (jahre: number) => `Bottom line after ${jahre} years`,
      erklaerung: "Wealth built, top-up and incidental purchase costs offset against each other",
    },
  },

  seiteWarum: {
    unterzeile: "Why a property saves tax",
    grundgedankeTitel: "The basic idea",
    grundgedanke1:
      "In the first years, a let apartment costs more than it brings in. Depreciation, interest and running costs exceed the rent. You deduct this loss from your other income before the tax office (Finanzamt) calculates your tax. Your taxable income falls, and so does your tax.",
    grundgedanke2:
      "Most of this loss is depreciation. It is purely an accounting figure: it reduces your income on paper without a single euro leaving your account that year. That is where the leverage lies.",
    bausteineTitel: "The building blocks of your case",
    afaRegulaer: {
      titel: "Building depreciation (AfA), standard",
      erklaerung: (satz: number, gebaeudewert: number) =>
        `${zEn(satz, 1)} percent on a building value of ${eurEn(gebaeudewert)}`,
    },
    afaErhoeht: {
      titel: "Building depreciation, increased",
      erklaerung: (satz: number) => `${zEn(satz, 1)} percent, only with an appraisal of the shorter useful life`,
    },
    zinsen: {
      titel: "Interest",
      erklaerung: (zinsProzent: number) => `Blended rate of ${zEn(zinsProzent, 2)} percent on the purchase price`,
    },
    miete: {
      titel: "Rent on the other side",
      erklaerung: (renditeProzent: number) => `${zEn(renditeProzent, 1)} percent gross rental yield`,
    },
    ehrlichTitel: "What honestly belongs to the picture",
    ehrlichAfa: (
      satzErhoeht: number,
      restnutzungsdauer: number,
      satzRegulaer: number,
      nutzungsdauer: number,
      jahr1Von: number,
      jahr1Bis: number,
    ) =>
      `The calculation uses ${zEn(satzErhoeht, 2)} percent depreciation, i.e. a useful life of ${restnutzungsdauer} years. Not everyone gets this. The statutory rate of ${zEn(satzRegulaer, 1)} percent stands for a useful life of ${nutzungsdauer} years, and only if the actual useful life is shorter does Section 7 (4) sentence 2 EStG allow more at all. The gap from ${nutzungsdauer} to ${restnutzungsdauer} years has to be proven by a remaining useful life appraisal (Restnutzungsdauergutachten) of the specific building; a remaining useful life derived only from the ImmoWertV model is not enough. The appraisal costs money, and the tax office decides case by case whether to accept it. Without this appraisal the statutory rate applies, and then it is ${eurEn(jahr1Von)} in the first year instead of ${eurEn(jahr1Bis)}.`,
    ehrlichErhaltung: (jahre: number, grenzeNetto: number, bruttoAufwand: number) =>
      `Maintenance expenses have a one-off effect: they add to the ongoing relief in the first year, not in the years after, so they must not be multiplied by ${jahre}. Section 6 (1) no. 1a EStG allows 15 percent of the building value excluding VAT within three years of the purchase; 90 percent of this is applied as a safety margin, i.e. ${eurEn(grenzeNetto)} net and ${eurEn(bruttoAufwand)} including VAT. Under Section 82b EStDV you may also spread larger maintenance expenses over two to five years. They only arise if such work is actually needed on your property.`,
    ehrlichZuzahlung: (jahre: number, zuzahlung: number, nebenkostenProzent: number) =>
      `Not all of the relief is free money. In the model the apartment does not pay for itself: over ${jahre} years there is a top-up of ${eurEn(zuzahlung)}, with the tax relief already offset. It is not money lost, most of it is repayment. On top of that comes your own contribution, namely the incidental purchase costs of ${zEn(nebenkostenProzent, 1)} percent: real estate transfer tax (Grunderwerbsteuer), notary and land register. The highest rate in Germany is used, because the transfer tax depends on where the apartment is, and that is not yet known. Depending on the federal state you buy in, this figure can only be lower. Church tax, on the other hand, depends on where you live; without that information it is set at 9 percent. The purchase price itself is financed.`,
    beschaeftigung: (einschaetzung: string, unterlagen: string) =>
      `Your type of employment does not change these figures, the tax scale does not distinguish between professions. It does change the financing: ${einschaetzung} ${unterlagen}`,
  },

  seiteVerlauf: {
    unterzeile: "The trend and your next step",
    titel: (jahre: number) => `Year by year over ${jahre} years`,
    spalten: {
      jahr: "YEAR",
      imJahr: "IN THE YEAR, FROM TO",
      gesamtUnten: "TOTAL, LOWER END",
      gesamtOben: "TOTAL, UPPER END",
    },
    absatz: (jahre: number) =>
      `The range falls slightly over the years, because deductible interest falls as you repay. This analysis deliberately makes no statement beyond ${jahre} years.`,
    naechsterSchritt: "YOUR NEXT STEP",
    schluss:
      "We'll get in touch with you soon for an initial conversation. In it we calculate the exact figures for your case instead of a range.",
    startWunsch: (titel: string) => ` Your preferred start: ${titel}.`,
    kleinTitel: "Assumptions and limits of this calculation",
    klein: (
      preis: number,
      baujahr: number,
      anteilProzent: number,
      zinsProzent: number,
      renditeProzent: number,
      jahre: number,
    ) =>
      `This calculator is based on German tax law and is intended for people who pay income tax in Germany. Simplified model calculation under Section 32a EStG, as of 2026. It includes the standard allowances for income-related expenses and special expenses as well as deductible pension and insurance contributions, plus standardised assumptions on social security contributions, property value, interest, rent and depreciation. Child benefit (Kindergeld) and the related comparison with the child allowance are left out. The property is standardised: a let, previously owned apartment at ${eurEn(preis)}, which is four times your gross annual salary, limited to €180,000 to €600,000, completed in ${baujahr}, building share ${anteilProzent} percent, blended interest rate ${zEn(zinsProzent, 2)} percent, gross rental yield ${zEn(renditeProzent, 1)} percent. No specific property is meant or recommended. This analysis deliberately makes no statement beyond a period of ${jahre} years. Your actual figures may differ. This is a model calculation and not tax advice; it does not replace individual tax or investment advice.`,
  },
};

export const STEUER_PDF_TEXTE = { de, en };
