/**
 * Die Texte des oeffentlichen Steuerrechners, Deutsch und Englisch.
 *
 * Plan Kundensprache, Etappe 6 (S13): `/steuer` und `/steuer/:slug` ermitteln
 * ihre Sprache selbst (`?lang=`, Umschalter, Browser), siehe
 * `src/lib/seitenSprache.ts`. Die Bausteine lesen ihre Woerter hier ueber
 * `useSeitenTexte(STEUERRECHNER_TEXTE)`.
 *
 * DIESELBEN BAUSTEINE LAUFEN IM CRM unter `/steuerrechner`. Dort gibt es keinen
 * Provider, also ist alles Deutsch. Saetze, die es NUR intern gibt (Fassung
 * "intern": Ergebnis sofort, keine Kontaktabfrage), stehen deshalb nicht hier,
 * sondern bleiben deutsch in den Bausteinen. Sie koennen nie englisch
 * erscheinen.
 *
 * Nicht hier, weil sie oeffentlich gar nicht zu sehen sind: die Ergebnisseite
 * (`SteuerErgebnis`, `SteuerMusterrechnung`), das Hebelziel und das
 * Wartefenster (`BerechnungOverlay`, derzeit nirgends eingebunden). Seit dem
 * 17.09.2026 endet die oeffentliche Strecke mit der Kontaktabfrage, das
 * Ergebnis kommt als PDF (`steuerrechnerPdfTexte.ts`).
 *
 * Die Auswahlwerte aus Rechenkern und Strecke (Beschaeftigung, Startzeitpunkt)
 * kommen aus `src/lib/steuerrechnerKennungTexte.ts`, zugeordnet ueber die
 * Kennung. Ihr deutscher Wortlaut geht auch ins CRM und bleibt unangetastet.
 *
 * Englisch nach dem Glossar (`kundenspracheGlossar.ts`): britisch, direktes
 * „you“, deutsche Steuerbegriffe beim ersten Auftreten mit dem deutschen Wort
 * in Klammern, nie „advisor“.
 */
import { euroText, zahlText } from "@/lib/sprachFormat";
import { LEAD_EINWILLIGUNG_FEHLT, LEAD_EINWILLIGUNG_FEHLT_EN } from "@/lib/leadEinwilligung";
import type { SchrittId } from "@/lib/steuerrechnerStrecke";
import type { Steuerklasse } from "@/lib/steuerRechner";

/* Deutsch mit genau dem Formatierer, den die Bausteine bisher benutzt haben,
   damit sich an der deutschen Anzeige kein Zeichen aendert. */
const eurFormatDe = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const eurDe = (n: number) => eurFormatDe.format(Math.round(n));
const eurEn = (n: number) => euroText(Math.round(n), "en");

interface SchrittText {
  /** Stichwort neben der Schrittzaehlung und in der Seitenleiste. */
  kurz: string;
  titel: string;
  hinweis: string;
  knopf: string;
}

const de = {
  /** Betrag ohne Nachkommastellen: „85.000 €“. */
  betrag: (n: number) => eurDe(n),
  /** Zahl mit Tausendertrennung, fuer die Eingabefelder: „85.000“. */
  zahl: (n: number) => zahlText(n, "de"),

  seite: {
    kicker: "Kostenloser Steuerrechner",
    titelVor: "Wie viel Steuern kannst du mit einer Immobilie",
    titelBetont: "sparen",
    titelNach: "?",
    einleitung:
      "Abschreibung und Zinsen senken dein zu versteuerndes Einkommen, Jahr für Jahr. Wenige Angaben genügen, deine Auswertung bekommst du als PDF per Mail.",
    pillen: ["Unter einer Minute", "Kostenlos und unverbindlich", "Auswertung als PDF per Mail"],
    knopf: "Steuerersparnis berechnen",
    soGehtEs: "So funktioniert es",
    partnerLaedt: "Vertriebspartner wird geladen …",
    bereitgestelltVon: (name: string) => `Bereitgestellt von ${name}`,
    /**
     * Entscheidung 13, nur Englisch: Der Rechner beruht auf deutschem
     * Steuerrecht. Auf Deutsch ist alles leer, die Seite zeigt dann keinen
     * Hinweis.
     */
    steuerrecht: {
      titel: "",
      text: "",
      expatsFrage: "",
      expatsLink: "",
    },
  },

  strecke: {
    schritte: {
      einkommen: {
        kurz: "Einkommen",
        titel: "Was verdienst du im Jahr, brutto?",
        hinweis:
          "Das Bruttogehalt vor allen Abzügen, so wie es im Arbeitsvertrag steht. Bei monatlicher Zahlung: Brutto mal zwölf, plus Weihnachts- und Urlaubsgeld.",
        knopf: "Weiter",
      },
      beschaeftigung: {
        kurz: "Beschäftigung",
        titel: "Wie verdienst du dein Geld?",
        hinweis:
          "Auf deine Steuer hat das keinen Einfluss, der Tarif kennt keine Berufsgruppen. Auf die Finanzierung hat es großen Einfluss, deshalb sagen wir dir im Ergebnis, was deine Bank dafür sehen will.",
        knopf: "Weiter",
      },
      steuerklasse: {
        kurz: "Steuerklasse",
        titel: "Welche Steuerklasse hast du?",
        hinweis:
          "Sie steht auf deiner Gehaltsabrechnung. Für die Jahressteuer zählt nicht die Klasse selbst, sondern ob du einzeln oder gemeinsam mit deinem Partner veranlagt wirst.",
        knopf: "Weiter",
      },
      partner: {
        kurz: "Partnereinkommen",
        titel: "Was verdient dein Partner im Jahr, brutto?",
        hinweis:
          "Beim Ehegattensplitting berechnet das Finanzamt die Steuer für euch beide zusammen. Ohne das zweite Gehalt wäre das Ergebnis schlicht falsch.",
        knopf: "Weiter",
      },
      kinder: {
        kurz: "Kinder",
        titel: "Wie viele Kinder hast du?",
        hinweis: "Jedes Kind senkt dein zu versteuerndes Einkommen über den Kinderfreibetrag.",
        knopf: "Weiter",
      },
      wohnort: {
        kurz: "Wohnsitz",
        titel: "Wo wohnst du?",
        hinweis:
          "Wähle dein Bundesland im Auswahlfeld. Davon hängt der Kirchensteuersatz ab, 8 Prozent in Bayern und Baden-Württemberg, sonst 9. Die Grunderwerbsteuer richtet sich dagegen nach der Lage der Wohnung, deshalb rechnen wir dort mit dem höchsten Satz in Deutschland.",
        knopf: "Weiter",
      },
      bestand: {
        kurz: "Bestand",
        titel: "Besitzt du schon Anlageimmobilien?",
        hinweis:
          "Wer bereits Objekte hält, hat einen Teil seines Steuerhebels genutzt. Wir ziehen das ab, statt es zweimal zu zählen.",
        knopf: "Weiter",
      },
      zeitpunkt: {
        kurz: "Startzeitpunkt",
        titel: "Wann möchtest du starten?",
        hinweis:
          "Die letzte Frage. Sie hat auf die Rechnung keinen Einfluss, sie entscheidet nur, wie dein Ansprechpartner auf dich zugeht.",
        knopf: "Ergebnis berechnen",
      },
    } as Record<SchrittId, SchrittText>,
    /** Die stille Ansage beim Schrittwechsel. */
    ansage: (schritt: number, gesamt: number, kurz: string) => `Schritt ${schritt} von ${gesamt}, ${kurz}`,
    kontakt: "Kontakt",
    weiterLetzter: "Weiter zum letzten Schritt",
    zurueck: "Eine Frage zurück",
    angabenTitel: "Deine Angaben",
    navHinweisTitel: "Auswertung per Mail",
    navHinweisText: "Nach dem letzten Schritt schicken wir dir deine Auswertung als PDF an deine E-Mail.",
    warumFragen: "Warum fragen wir das?",
    wozuTitel: "Wozu diese Angabe?",
    weiterTitel: "So geht es weiter",
    weiterText:
      "Angaben ergänzen, Kontaktdaten eintragen, dann bekommst du deine Auswertung als PDF per Mail und dein Ansprechpartner meldet sich bei dir.",
    rechnungTitel: "Was zeigt die Rechnung?",
    rechnungText:
      "Eine vereinfachte Modellrechnung mit nachvollziehbaren Annahmen. Die tatsächlichen Werte können abweichen.",
  },

  bausteine: {
    fortschritt: (schritt: number, gesamt: number) => `Schritt ${schritt} von ${gesamt}`,
    vertrauen: ["Kostenlos und unverbindlich", "Unter einer Minute", "Auswertung als PDF per Mail"],
  },

  felder: {
    einkommen: {
      label: "Jahresbrutto in Euro",
      regler: "Jahresbrutto",
      hinweis: (min: number, max: number) =>
        `Vor Abzügen, inklusive Sonderzahlungen. Berechenbarer Bereich: ${eurDe(min)} bis ${eurDe(max)}.`,
    },
    klassen: {
      I: { titel: "Klasse I, ledig", unterzeile: "Einzeln veranlagt, Grundtarif." },
      II: {
        titel: "Klasse II, alleinerziehend",
        unterzeile: "Wie Klasse I, zusätzlich mit dem Entlastungsbetrag für Alleinerziehende.",
      },
      III: {
        titel: "Klasse III, verheiratet, ich verdiene mehr",
        unterzeile: "Gemeinsam veranlagt, wir rechnen mit dem Ehegattensplitting.",
      },
      IV: {
        titel: "Klasse IV, verheiratet, beide ähnlich",
        unterzeile: "Gemeinsam veranlagt, beide Gehälter liegen nah beieinander.",
      },
      V: {
        titel: "Klasse V, verheiratet, mein Partner verdient mehr",
        unterzeile: "Gemeinsam veranlagt, dein Partner hat Klasse III.",
      },
    } as Record<Steuerklasse, { titel: string; unterzeile: string }>,
    partner: {
      unterschrift: "Jahresbrutto deines Partners",
      hinweis:
        "Vorbelegt ist die übliche Aufteilung deiner Steuerklasse. Bitte trag den echten Wert ein, beim Splitting wird die Steuer für euch beide zusammen berechnet.",
    },
    kinder: {
      voll: (freibetrag: number) =>
        `Bei gemeinsamer Veranlagung steht dir der volle Kinderfreibetrag von ${eurDe(freibetrag)} je Kind zu.`,
      halb: (halberFreibetrag: number) =>
        `Einzeln veranlagt steht dir der halbe Kinderfreibetrag zu, also ${eurDe(halberFreibetrag)} je Kind. Die andere Hälfte gehört dem anderen Elternteil, solange sie nicht übertragen wurde.`,
    },
    wohnort: {
      label: "Bundesland deines Wohnsitzes",
      bitteWaehlen: "Bitte wählen",
      auswahl: "Bundesland",
      kirche: "Ich zahle Kirchensteuer",
      kircheSatz: "8 Prozent in Bayern und Baden-Württemberg, sonst 9 Prozent",
      kircheSchalter: "Kirchensteuer",
      fehlt:
        "Bitte wähle dein Bundesland. Davon hängt ab, ob wir mit 8 oder 9 Prozent Kirchensteuer rechnen.",
      hinweis: (hoechstsatz: number) =>
        `Dein Wohnsitz bestimmt den Kirchensteuersatz. Ohne Angabe rechnen wir mit 9 Prozent. Die Grunderwerbsteuer hängt dagegen nicht an deinem Wohnsitz, sondern an der Lage der Wohnung, und die steht hier noch nicht fest. Deshalb rechnen wir die Kaufnebenkosten mit dem höchsten Satz in Deutschland: ${hoechstsatz.toLocaleString("de-DE")} Prozent, also 6,5 Prozent Grunderwerbsteuer plus 2 Prozent Notar und Grundbuch. Je nachdem, in welchem Bundesland du kaufst, weicht dieser Wert nur nach unten ab, dann brauchst du weniger Eigenkapital. Nach oben geht es nicht, 8,5 Prozent ist der höchste Satz in Deutschland.`,
    },
    /** In der Reihenfolge 0, 1, 2, 3 oder mehr. */
    bestand: [
      { titel: "Noch keine", unterzeile: "Du steigst zum ersten Mal ein." },
      { titel: "Eine", unterzeile: "Ein Teil deines Steuerhebels ist bereits genutzt." },
      { titel: "Zwei", unterzeile: "Der Steuerhebel ist weitgehend ausgeschöpft." },
      { titel: "Drei oder mehr", unterzeile: "Für dich zählt ab hier vor allem die Mietrendite." },
    ],
  },

  formular: {
    titel: "Wohin dürfen wir deine Auswertung schicken?",
    titelAlt: "Deine detaillierte Analyse anfordern",
    einleitung:
      "Deine Zahlen sind gerechnet. Deine Auswertung bekommst du als PDF per Mail, mit deinen Zahlen und der Erklärung, warum eine vermietete Wohnung Steuern spart. Auf dem Bildschirm zeigen wir sie nicht, sie geht an deine E-Mail. Dazu melden wir uns zeitnah für ein Erstgespräch, in dem wir die genauen Zahlen für deinen Fall rechnen statt einer Spanne.",
    einleitungAlt:
      "Du bekommst deine Auswertung als PDF per Mail, mit deinen Zahlen und der Erklärung, warum eine vermietete Wohnung Steuern spart. Dazu melden wir uns zeitnah für ein Erstgespräch, in dem wir die genauen Zahlen für deinen Fall rechnen statt einer Spanne.",
    mitnehmenTitel: "Das nimmst du mit",
    mitnehmenText:
      "Deine Angaben und Modellwerte, die Erklärung der Spanne und eine Grundlage für die persönliche Beratung.",
    adresseHinweis: "Die Auswertung kommt als PDF an deine E-Mail, deshalb bitte die Adresse, die du wirklich liest.",
    adresseHinweisAlt: "Dein Ergebnis bleibt frei einsehbar.",
    vorname: "Vorname *",
    nachname: "Nachname *",
    email: "E-Mail *",
    telefon: "Telefon *",
    emailUngueltig: "Bitte gib eine gültige E-Mail ein.",
    absenden: "Auswertung per Mail anfordern",
    einwilligungFehlt: LEAD_EINWILLIGUNG_FEHLT,
    fehlerAllgemein: "Das hat nicht geklappt.",
    hinweisAblage:
      "Deine Auswertung liegt bereit. Der Versand per Mail hat nicht geklappt, deshalb öffne sie bitte hier.",
    hinweisDownload: "Deine Auswertung liegt in deinem Download-Ordner. Der Versand per Mail hat nicht geklappt.",
    hinweisNichtZugestellt:
      "Deine Anfrage ist angekommen. Die Auswertung konnten wir gerade nicht zustellen, dein Ansprechpartner schickt sie dir zu.",
    hinweisNichtErstellt:
      "Deine Anfrage ist angekommen. Die Auswertung konnten wir gerade nicht erstellen, dein Ansprechpartner schickt sie dir zu.",
    fertigTitel: "Deine Auswertung ist unterwegs",
    fertigTitelHinweis: "Deine Anfrage ist angekommen",
    fertigGeschickt: (email: string) =>
      `Wir haben sie an ${email} geschickt, als PDF im Anhang, mit deinen Zahlen und der Erklärung dazu.`,
    meldetSichName: (name: string) =>
      `${name} meldet sich zeitnah für ein Erstgespräch und rechnet darin die genauen Zahlen für deinen Fall.`,
    meldetSich:
      "Dein Ansprechpartner meldet sich zeitnah für ein Erstgespräch und rechnet darin die genauen Zahlen für deinen Fall.",
    auswertungOeffnen: "Auswertung öffnen",
    wieWeiter: "Wie es jetzt weitergeht",
    ergebnisAnsehen: "Ergebnis ansehen",
  },

  hilfe: {
    /** Rueckfall ohne Namen. Deutsch gebeugt: „dein“ und „deinen“. */
    ansprechpartnerWer: "dein Ansprechpartner",
    ansprechpartnerWen: "deinen Ansprechpartner",
    soGehtEsTitel: "So einfach geht's",
    ausfuellenTitel: "Rechner ausfüllen",
    ausfuellenText:
      "Wenige Fragen, in unter einer Minute beantwortet. Am Ende trägst du Name, E-Mail und Telefon ein.",
    mailTitel: "Deine Auswertung kommt per Mail",
    mailText: (wen: string) =>
      `Wir schicken sie als PDF an deine E-Mail, mit deinen Zahlen und der Erklärung dazu. Auf dem Bildschirm erscheint sie nicht, deshalb trag bitte die Adresse ein, die du wirklich liest. Gleichzeitig gehen deine Angaben an ${wen}, und du bekommst einen Anruf oder eine E-Mail, um die Rechnung gemeinsam durchzugehen. Ohne deine Eintragung passiert nichts.`,
    gespraechTitel: "Wenn du möchtest, ein Gespräch",
    gespraechText:
      "Passt es für dich, folgt ein kostenloses und unverbindliches Gespräch über deine persönliche Strategie. Passt es nicht, bleibt es bei der Auswertung.",
    fragenTitel: "Häufige Fragen",
    steuerberatungFrage: "Ist das eine Steuerberatung?",
    steuerberatungAntwort:
      "Nein. Dieser Rechner erstellt eine unverbindliche Modellrechnung. Sie zeigt die Größenordnung deines Falls auf Grundlage deiner Angaben und typisierter Annahmen zu Objekt, Zins, Miete und Abschreibung. Sie ersetzt keine individuelle Steuer- oder Anlageberatung. Eine Steuerberatung darf nur leisten, wer dazu befugt ist. Für die verbindliche Beurteilung deines Falls sprich bitte mit deinem Steuerberater.",
    kostenFrage: "Was kostet das?",
    kostenAntwort:
      "Nichts. Der Rechner, die Auswertung als PDF und ein anschließendes Gespräch sind kostenlos und unverbindlich. Du gehst damit keine Verpflichtung ein und schließt nichts ab.",
    telefonFrage: "Warum braucht ihr meine Telefonnummer?",
    telefonAntwort: (wer: string) =>
      `Weil zum Ergebnis ein Mensch gehört: ${wer} ruft an, ordnet die Zahlen für deinen Fall ein und beantwortet, was offen geblieben ist. Eine Zahl allein beantwortet selten die Frage, die dahintersteht. Deine Angaben werden ausschließlich dafür verwendet, Näheres steht in der Datenschutzerklärung.`,
    weiterFrage: "Wie geht es weiter?",
    weiterAntwort: (wer: string) =>
      `Nach der letzten Frage trägst du Name, E-Mail und Telefon ein. Danach schicken wir dir deine Auswertung als PDF an deine E-Mail. Auf dem Bildschirm zeigen wir sie nicht, sie kommt per Mail. Anschließend meldet sich ${wer} bei dir. Ob daraus ein Gespräch wird und ob du danach etwas tust, entscheidest allein du.`,
    impressum: "Impressum",
    datenschutz: "Datenschutz",
  },

  einblender: {
    titel: "Wie es jetzt weitergeht",
    mitPartner: (name: string) =>
      `${name} meldet sich zeitnah bei dir, um alles Weitere mit dir abzustimmen. Du kannst dich aber jederzeit auch selbst melden.`,
    ohnePartner:
      "Wir melden uns zeitnah bei dir zurück, um mit dir persönlich deine individuellen Möglichkeiten zu besprechen.",
    schliessen: "Alles klar",
  },
};

export type SteuerrechnerTexte = typeof de;

const en: SteuerrechnerTexte = {
  betrag: (n: number) => eurEn(n),
  zahl: (n: number) => zahlText(n, "en"),

  seite: {
    kicker: "Free tax calculator",
    titelVor: "How much tax could you",
    titelBetont: "save",
    titelNach: " with a property?",
    einleitung:
      "Depreciation and interest reduce your taxable income, year after year. A few details are enough, and you'll get your analysis as a PDF by email.",
    pillen: ["Under a minute", "Free and non-binding", "Analysis as a PDF by email"],
    knopf: "Calculate your tax relief",
    soGehtEs: "How it works",
    partnerLaedt: "Loading your contact …",
    bereitgestelltVon: (name: string) => `Provided by ${name}`,
    steuerrecht: {
      titel: "This calculator is based on German tax law.",
      text: "It is intended for people who pay income tax in Germany.",
      expatsFrage: "Working in Germany on an expat contract?",
      expatsLink: "Try the EXPATS Calculator.",
    },
  },

  strecke: {
    schritte: {
      einkommen: {
        kurz: "Income",
        titel: "What do you earn per year, gross?",
        hinweis:
          "Your gross salary before any deductions, as stated in your employment contract. If you're paid monthly: gross times twelve, plus any Christmas and holiday bonuses.",
        knopf: "Next",
      },
      beschaeftigung: {
        kurz: "Employment",
        titel: "How do you earn your money?",
        hinweis:
          "It has no effect on your tax, the tax scale does not distinguish between professions. It has a big effect on financing, so we'll tell you in the result what your bank will want to see.",
        knopf: "Next",
      },
      steuerklasse: {
        kurz: "Tax class",
        titel: "Which tax class (Steuerklasse) are you in?",
        hinweis:
          "You'll find it on your payslip. For your annual tax, what counts is not the class itself but whether you're assessed individually or jointly with your partner.",
        knopf: "Next",
      },
      partner: {
        kurz: "Partner's income",
        titel: "What does your partner earn per year, gross?",
        hinweis:
          "With income splitting for married couples (Ehegattensplitting), the tax office calculates the tax for both of you together. Without the second salary, the result would simply be wrong.",
        knopf: "Next",
      },
      kinder: {
        kurz: "Children",
        titel: "How many children do you have?",
        hinweis: "Each child reduces your taxable income through the child allowance (Kinderfreibetrag).",
        knopf: "Next",
      },
      wohnort: {
        kurz: "Residence",
        titel: "Where do you live?",
        hinweis:
          "Choose your federal state from the list. It determines the church tax (Kirchensteuer) rate: 8 percent in Bayern (Bavaria) and Baden-Württemberg, 9 percent everywhere else. Real estate transfer tax (Grunderwerbsteuer), on the other hand, depends on where the apartment is, so we use the highest rate in Germany for it.",
        knopf: "Next",
      },
      bestand: {
        kurz: "Existing properties",
        titel: "Do you already own investment properties?",
        hinweis:
          "If you already own properties, you've used part of your tax leverage. We deduct that instead of counting it twice.",
        knopf: "Next",
      },
      zeitpunkt: {
        kurz: "Start",
        titel: "When would you like to start?",
        hinweis:
          "The last question. It has no effect on the calculation, it only decides how your contact person at MOREImmo approaches you.",
        knopf: "Calculate result",
      },
    },
    ansage: (schritt: number, gesamt: number, kurz: string) => `Step ${schritt} of ${gesamt}, ${kurz}`,
    kontakt: "Contact",
    weiterLetzter: "Continue to the last step",
    zurueck: "Back one question",
    angabenTitel: "Your details",
    navHinweisTitel: "Analysis by email",
    navHinweisText: "After the last step, we'll send your analysis as a PDF to your email address.",
    warumFragen: "Why do we ask?",
    wozuTitel: "Why this detail?",
    weiterTitel: "What happens next",
    weiterText:
      "Complete your details and enter your contact details. You'll then get your analysis as a PDF by email, and your contact person at MOREImmo will get in touch with you.",
    rechnungTitel: "What does the calculation show?",
    rechnungText:
      "A simplified model calculation with transparent assumptions. Your actual figures may differ.",
  },

  bausteine: {
    fortschritt: (schritt: number, gesamt: number) => `Step ${schritt} of ${gesamt}`,
    vertrauen: ["Free and non-binding", "Under a minute", "Analysis as a PDF by email"],
  },

  felder: {
    einkommen: {
      label: "Gross annual salary in euros",
      regler: "Gross annual salary",
      hinweis: (min: number, max: number) =>
        `Before deductions, including bonuses. Range the calculator covers: ${eurEn(min)} to ${eurEn(max)}.`,
    },
    klassen: {
      I: { titel: "Class I, single", unterzeile: "Assessed individually, basic tax table (Grundtabelle)." },
      II: {
        titel: "Class II, single parent",
        unterzeile: "Like class I, plus the tax relief for single parents.",
      },
      III: {
        titel: "Class III, married, I earn more",
        unterzeile: "Assessed jointly, we calculate with income splitting (Ehegattensplitting).",
      },
      IV: {
        titel: "Class IV, married, both earn about the same",
        unterzeile: "Assessed jointly, both salaries are close to each other.",
      },
      V: {
        titel: "Class V, married, my partner earns more",
        unterzeile: "Assessed jointly, your partner is in class III.",
      },
    },
    partner: {
      unterschrift: "Your partner's gross annual salary",
      hinweis:
        "We've pre-filled the usual split for your tax class. Please enter the real figure, as with income splitting the tax is calculated for both of you together.",
    },
    kinder: {
      voll: (freibetrag: number) =>
        `With joint assessment, you're entitled to the full child allowance (Kinderfreibetrag) of ${eurEn(freibetrag)} per child.`,
      halb: (halberFreibetrag: number) =>
        `If you're assessed individually, you're entitled to half the child allowance (Kinderfreibetrag), i.e. ${eurEn(halberFreibetrag)} per child. The other half belongs to the other parent unless it has been transferred.`,
    },
    wohnort: {
      label: "Federal state you live in",
      bitteWaehlen: "Please choose",
      auswahl: "Federal state",
      kirche: "I pay church tax (Kirchensteuer)",
      kircheSatz: "8 percent in Bayern (Bavaria) and Baden-Württemberg, otherwise 9 percent",
      kircheSchalter: "Church tax",
      fehlt: "Please choose your federal state. It decides whether we use 8 or 9 percent church tax.",
      hinweis: (hoechstsatz: number) =>
        `Where you live determines the church tax rate. Without this information we use 9 percent. Real estate transfer tax (Grunderwerbsteuer), on the other hand, does not depend on where you live but on where the apartment is, and that isn't known yet. That's why we calculate the incidental purchase costs with the highest rate in Germany: ${hoechstsatz.toLocaleString("en-GB")} percent, i.e. 6.5 percent real estate transfer tax plus 2 percent for the notary and land register. Depending on the federal state you buy in, this figure can only be lower, and then you need less equity. It can't be higher, 8.5 percent is the highest rate in Germany.`,
    },
    bestand: [
      { titel: "None yet", unterzeile: "You're investing for the first time." },
      { titel: "One", unterzeile: "Part of your tax leverage is already used." },
      { titel: "Two", unterzeile: "Your tax leverage is largely used up." },
      { titel: "Three or more", unterzeile: "From here on, rental yield is what mainly counts for you." },
    ],
  },

  formular: {
    titel: "Where should we send your analysis?",
    titelAlt: "Request your detailed analysis",
    einleitung:
      "Your figures are calculated. You'll get your analysis as a PDF by email, with your figures and an explanation of why a let apartment saves tax. We don't show it on screen, it goes to your email. We'll also get in touch with you soon for an initial conversation, in which we calculate the exact figures for your case instead of a range.",
    einleitungAlt:
      "You'll get your analysis as a PDF by email, with your figures and an explanation of why a let apartment saves tax. We'll also get in touch with you soon for an initial conversation, in which we calculate the exact figures for your case instead of a range.",
    mitnehmenTitel: "What you get",
    mitnehmenText:
      "Your details and model figures, an explanation of the range and a basis for a personal conversation.",
    adresseHinweis: "Your analysis arrives as a PDF by email, so please use an address you actually read.",
    adresseHinweisAlt: "Your result remains freely accessible.",
    vorname: "First name *",
    nachname: "Last name *",
    email: "Email *",
    telefon: "Phone *",
    emailUngueltig: "Please enter a valid email address.",
    absenden: "Request analysis by email",
    einwilligungFehlt: LEAD_EINWILLIGUNG_FEHLT_EN,
    fehlerAllgemein: "That didn't work.",
    hinweisAblage: "Your analysis is ready. Sending it by email didn't work, so please open it here.",
    hinweisDownload: "Your analysis is in your downloads folder. Sending it by email didn't work.",
    hinweisNichtZugestellt:
      "Your request has arrived. We couldn't deliver your analysis just now, your contact person at MOREImmo will send it to you.",
    hinweisNichtErstellt:
      "Your request has arrived. We couldn't create your analysis just now, your contact person at MOREImmo will send it to you.",
    fertigTitel: "Your analysis is on its way",
    fertigTitelHinweis: "Your request has arrived",
    fertigGeschickt: (email: string) =>
      `We've sent it to ${email} as a PDF attachment, with your figures and an explanation.`,
    meldetSichName: (name: string) =>
      `${name} will get in touch with you soon for an initial conversation and will calculate the exact figures for your case.`,
    meldetSich:
      "Your contact person at MOREImmo will get in touch with you soon for an initial conversation and will calculate the exact figures for your case.",
    auswertungOeffnen: "Open analysis",
    wieWeiter: "What happens next",
    ergebnisAnsehen: "View result",
  },

  hilfe: {
    ansprechpartnerWer: "your contact person at MOREImmo",
    ansprechpartnerWen: "your contact person at MOREImmo",
    soGehtEsTitel: "It's that simple",
    ausfuellenTitel: "Fill in the calculator",
    ausfuellenText:
      "A few questions, answered in under a minute. At the end, you enter your name, email and phone number.",
    mailTitel: "Your analysis arrives by email",
    mailText: (wen: string) =>
      `We send it as a PDF to your email, with your figures and an explanation. It doesn't appear on screen, so please enter an address you actually read. At the same time, your details go to ${wen}, and you'll get a call or an email to go through the calculation together. Nothing happens without your entry.`,
    gespraechTitel: "A conversation, if you like",
    gespraechText:
      "If it suits you, there's a free and non-binding conversation about your personal strategy. If not, you simply keep your analysis.",
    fragenTitel: "Frequently asked questions",
    steuerberatungFrage: "Is this tax advice?",
    steuerberatungAntwort:
      "No. This calculator produces a non-binding model calculation based on German tax law. It shows the order of magnitude of your case based on your details and standardised assumptions about the property, interest, rent and depreciation. It does not replace individual tax or investment advice. Only people who are authorised to do so may give tax advice. For a binding assessment of your case, please speak to your tax consultant.",
    kostenFrage: "What does it cost?",
    kostenAntwort:
      "Nothing. The calculator, the PDF analysis and a follow-up conversation are free and non-binding. You don't enter into any obligation and don't sign anything.",
    telefonFrage: "Why do you need my phone number?",
    telefonAntwort: (wer: string) =>
      `Because a person belongs with the result: ${wer} will call you, put the figures into context for your case and answer anything that's still open. A figure on its own rarely answers the question behind it. Your details are used only for this purpose; you'll find more in the privacy policy.`,
    weiterFrage: "What happens next?",
    weiterAntwort: (wer: string) =>
      `After the last question, you enter your name, email and phone number. We then send your analysis as a PDF to your email. We don't show it on screen, it comes by email. After that, ${wer} will get in touch with you. Whether this leads to a conversation, and whether you do anything afterwards, is entirely up to you.`,
    impressum: "Legal notice",
    datenschutz: "Privacy policy",
  },

  einblender: {
    titel: "What happens next",
    mitPartner: (name: string) =>
      `${name} will be in touch with you soon to arrange the next steps. You're also welcome to get in touch yourself at any time.`,
    ohnePartner: "We'll get back to you soon to discuss your individual options with you personally.",
    schliessen: "Got it",
  },
};

export const STEUERRECHNER_TEXTE = { de, en };
