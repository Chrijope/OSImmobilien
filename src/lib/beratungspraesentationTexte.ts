/**
 * Alle sichtbaren Texte der Beratungspräsentation OS Immobilien
 * (`src/pages/BeratungspraesentationHV.tsx`, Route `/beratungspraesentation-moreimmo`),
 * auf Deutsch und auf Englisch.
 *
 * Warum eine eigene Datei und nicht `src/i18n/locales/*.json`: Die Präsentation
 * spricht den Kunden auf Deutsch wahlweise mit Du oder Sie an, das ist ein
 * zweites Merkmal neben der Sprache. Ein deutscher Eintrag ist deshalb entweder
 * ein Text oder ein Paar `{ sie, du }`. Das JSON des Portals kennt das nicht,
 * und seine Sprache gilt browserweit (siehe `beratungspraesentationSprache.ts`).
 *
 * Aufbau:
 * - `[[Wort]]` hebt ein Wort in einer Überschrift blau hervor (Akzent).
 * - Funktionen nehmen Zahlen entgegen und formatieren sie selbst in der
 *   Schreibweise ihrer Sprache. Beträge bleiben immer in Euro.
 * - Das Englische hat keine Anrede-Varianten, "Du" und "Sie" werden zu "you".
 * - Deutsche Rechts- und Steuerbegriffe, die es so nur in Deutschland gibt,
 *   stehen im Englischen beim ersten Auftreten mit dem deutschen Begriff in
 *   Klammern.
 *
 * Kundendaten, Namen, Beträge und Objektadressen werden nicht übersetzt.
 * Keine Gedankenstriche, in keiner der beiden Sprachen.
 */
import { ANLAGE_ZIELE } from "@/lib/anlageZiele";
import { rateRechenweg } from "@/lib/rateAnteile";
import {
  euroText,
  prozentText,
  zahlText,
  type PraesentationsSprache,
} from "@/lib/beratungspraesentationSprache";

/** Ein Text, der auf Deutsch von der Anrede abhängen kann. */
export type AnredeWert = string | { readonly sie: string; readonly du: string };

/**
 * Macht aus dem Typ der deutschen Texte den Typ, den jede Sprache erfüllen
 * muss: gleiche Schlüssel, gleiche Listenlängen, gleiche Funktionsparameter,
 * und an jeder Textstelle wahlweise ein Text oder ein Anrede-Paar.
 */
type Breit<T> = T extends string
  ? AnredeWert
  : T extends { readonly sie: string; readonly du: string }
  ? AnredeWert
  : T extends (...args: infer A) => infer R
  ? (...args: A) => Breit<R>
  : { readonly [K in keyof T]: Breit<T[K]> };

const eDe = (n: number, nachkomma = 0) => euroText(n, "de", nachkomma);
const eEn = (n: number, nachkomma = 0) => euroText(n, "en", nachkomma);
const zDe = (n: number, nachkomma = 0) => zahlText(n, "de", nachkomma);
const zEn = (n: number, nachkomma = 0) => zahlText(n, "en", nachkomma);

/** Englische Beschriftungen der Anlageziele, Schlüssel ist die Kennung aus `anlageZiele.ts`. */
export const ANLAGE_ZIELE_EN: Record<string, string> = {
  vermoegen: "Building wealth and creating assets",
  steuer: "Securing tax advantages",
  inflation: "Investing and protecting against inflation",
  freiheit: "Financial freedom through passive income",
  portfolio: "Building and expanding my own property portfolio",
  eigenheim: "Building capital for a future home of my own",
  rente: "A worry-free retirement through a property pension",
  kinder: "A secure financial future for the children",
  fremdkapital: "Leveraging borrowed capital with little equity",
};

/* ══════════════════════════════════════════════════════════════
   Deutsch
   ══════════════════════════════════════════════════════════════ */

const de = {
  sprache: {
    label: "Sprache",
  },

  kopf: {
    nav: {
      heute: "Heute",
      funktion: "So funktioniert es",
      konzepte: "Konzepte",
      referenzen: "Referenzen",
      rechnung: "Die Rechnung",
      schritt: "Nächster Schritt",
    },
    selbstauskunft: "Selbstauskunft",
    menue: "Menü",
    trainerEin: "Sprechskripte einblenden",
    trainerAus: "Sprechskripte ausblenden",
    sprung: "Zur Selbstauskunft",
  },

  hero: {
    videoLabel: "Persönliche OS Immobilien Beratung",
    kicker: "OS Immobilien · Premium Real Estate Investment",
    willkommen: "Herzlich Willkommen",
    titel: "Strategischer Immobilien-Portfolioaufbau",
    schreibmaschine: "mit OS Immobilien.",
    claim: "Steueroptimiert. Renditestark. Professionell begleitet.",
    start: "Beratung starten",
    konzepte: "Konzepte ansehen",
  },

  heute: {
    titel: "Was machen wir [[heute]]?",
    vorspann: {
      sie: "Bevor wir starten: Heute geht es nicht ums Entscheiden, sondern ums Verstehen. Unser Ziel ist, dass Sie am Ende wissen, welche Möglichkeiten zu Ihrer Situation passen.",
      du: "Bevor wir starten: Heute geht es nicht ums Entscheiden, sondern ums Verstehen. Unser Ziel ist, dass du am Ende weißt, welche Möglichkeiten zu deiner Situation passen.",
    },
    agenda: [
      "Aktuelle Situation & Ziele",
      "Funktionsweise Kapitalanlageimmobilie",
      "Immobilienkonzepte",
      "Beispielrechnung",
      // Stand hier mit Gedankenstrich; der ist in Nutzertexten nicht erlaubt.
      "Ablauf: unser gemeinsamer Fahrplan",
    ],
    zielFett: "Ziel des Gesprächs",
    zielRest:
      "ist eine erste klare Strategie. Am Ende besprechen wir gemeinsam, ob und wie es sinnvoll weitergeht.",
  },

  ueberleitungen: {
    nichtstun: {
      text: "Bevor wir über Immobilien reden, eine Frage:",
      betont: {
        sie: "Was passiert eigentlich, wenn Sie gar nichts tun?",
        du: "Was passiert eigentlich, wenn du gar nichts tust?",
      },
    },
    ueberUns: {
      text: {
        sie: "Damit Sie einschätzen können, ob unsere Arbeitsweise zu Ihnen passt, kurz",
        du: "Damit du einschätzen kannst, ob unsere Arbeitsweise zu dir passt, kurz",
      },
      betont: {
        sie: "wer hier eigentlich vor Ihnen sitzt.",
        du: "wer hier eigentlich vor dir sitzt.",
      },
    },
    motto: {
      text: "Unser Motto!",
      betont: {
        sie: "Erst Ihre Ziele. Dann die passende Immobilie. Nicht umgekehrt.",
        du: "Erst deine Ziele. Dann die passende Immobilie. Nicht umgekehrt.",
      },
    },
    funktion: {
      text: "Bevor wir über Konzepte sprechen:",
      betont: "Werfen wir einen Blick darauf, wie eine Immobilie Vermögen aufbaut.",
    },
    vergleich: {
      text: "Und die Frage, die sich hier jeder stellt:",
      betont: "Warum dann nicht einfach sparen oder Aktien kaufen?",
    },
    konzepte: {
      text: {
        sie: "Wenn das für Sie passt, bleibt nur noch eine Frage:",
        du: "Wenn das für dich passt, bleibt nur noch eine Frage:",
      },
      betont: {
        sie: "Welches der drei Konzepte passt zu Ihrem Ziel?",
        du: "Welches der drei Konzepte passt zu deinem Ziel?",
      },
    },
    beispiel: {
      text: {
        sie: "Klingt das bis hierhin nach Ihrer Situation?",
        du: "Klingt das bis hierhin nach deiner Situation?",
      },
      betont: "Dann rechnen wir es Zahl für Zahl durch.",
    },
    steuer: {
      text: {
        sie: "Was zahlen Sie eigentlich im Jahr an Steuern, und was bleibt davon bei Ihnen?",
        du: "Was zahlst du eigentlich im Jahr an Steuern, und was bleibt davon bei dir?",
      },
      betont: "Genau hier wird es interessant.",
    },
    referenzen: {
      text: "Und wie sieht so etwas am Ende wirklich aus?",
      betont: { sie: "Sehen Sie selbst.", du: "Schau selbst." },
    },
    rueckblick: {
      text: "Alles, was wir bis hier besprochen haben, war allgemein.",
      betont: { sie: "Ab jetzt geht es um Sie.", du: "Ab jetzt geht es um dich." },
    },
  },

  nichtstun: {
    nummer: "Der Preis des Nichtstuns",
    titel: "Geld auf dem Konto wird [[jedes Jahr weniger wert]]",
    vorspann:
      "Kein Weltuntergang, nur Mathematik. Nehmen wir 50.000 Euro auf einem gut verzinsten Tagesgeldkonto, zwei Prozent Zinsen, zweieinhalb Prozent Geldentwertung.",
    heute: "Heute",
    heuteText: "auf dem Konto, jederzeit verfügbar",
    papier: "In 10 Jahren, auf dem Papier",
    papierText: "nach zwei Prozent Zinsen. Sieht nach mehr aus.",
    korb: "In 10 Jahren, im Einkaufskorb",
    korbText: "Das ist die Kaufkraft in heutigem Geld. Rund 2.400 Euro weniger als zu Beginn.",
    fazit: "Die Zinsen holen die Geldentwertung nicht ein.",
    fazitFrage: {
      sie: "Was macht Ihr Erspartes gerade?",
      du: "Was macht dein Erspartes gerade?",
    },
    fazitText:
      "Das ist kein Argument für eine Immobilie. Es ist nur der Grund, warum es sich lohnt, sich die nächste Stunde Zeit zu nehmen.",
  },

  ueberUns: {
    titel: "OS Immobilien in einem Satz",
    vorspann:
      "Unser Ziel ist nicht der Kauf einer einzelnen Immobilie, sondern der systematische Aufbau eines Immobilienportfolios.",
    leistungen: [
      { titel: "Persönliche Investmentstrategie", text: "Erst die Strategie. Dann die passende Immobilie." },
      {
        titel: "Geprüfte Immobilien",
        text: "Für jede Immobilie gelten dieselben Qualitäts- und Auswahlkriterien.",
        // Die Marke steht in beiden Sprachen gleich, sie wählt auch das Logo.
        partner: {
          marke: "OS Immobilien",
          rolle: "Objektpartner",
          satz: "Über OS Immobilien vertreiben wir die Objekte und Einheiten.",
        },
      },
      {
        titel: "Finanzierung",
        text: "Finanzierungsstrategie, Bankgespräche und optimale Konditionen aus einer Hand.",
        partner: {
          marke: "MORE Finance",
          rolle: "Finanzierungspartner",
          satz: "MORE Finance übernimmt die Finanzierung.",
        },
      },
      { titel: "Steuerliche Gestaltung", text: "Steuerliche Potenziale frühzeitig erkennen und gezielt nutzen." },
      {
        titel: "Kaufbegleitung",
        text: {
          sie: "Von der Reservierung über den Notartermin bis zur erfolgreichen Umsetzung Ihrer Vermögensstrategie.",
          du: "Von der Reservierung über den Notartermin bis zur erfolgreichen Umsetzung deiner Vermögensstrategie.",
        },
      },
      {
        titel: "Vermietung und Verwaltung",
        text: {
          sie: "Professionell organisiert, damit Sie sich um nichts kümmern müssen.",
          du: "Professionell organisiert, damit du dich um nichts kümmern musst.",
        },
      },
    ],
    anspruch: "Unser Anspruch: persönlich, transparent und langfristig gedacht.",
    ansprechpartner: {
      sie: "Ihr persönlicher Ansprechpartner",
      du: "Dein persönlicher Ansprechpartner",
    },
    fest: {
      sie: "Sie haben ab heute einen festen Ansprechpartner, nicht eine Hotline.",
      du: "Du hast ab heute einen festen Ansprechpartner, nicht eine Hotline.",
    },
    bisNotar: "Vom Erstgespräch bis lange nach dem Notartermin.",
  },

  arbeitsweise: {
    titel: "Wir verkaufen nicht einfach [[irgendeine Immobilie]]",
    vorspann:
      "Die richtige Immobilie beginnt mit den richtigen Fragen. Bevor wir über konkrete Angebote sprechen, beantworten wir gemeinsam sechs zentrale Fragen.",
    frage: (nummer: number) => `Frage ${nummer}`,
    erwartungFrage: {
      sie: "Was ist Ihre Erwartungshaltung an das heutige Gespräch?",
      du: "Was ist deine Erwartungshaltung an das heutige Gespräch?",
    },
    erwartungPlatzhalter:
      "z.B. einen ehrlichen Überblick bekommen, konkrete Zahlen sehen, offene Fragen klären",
    erfahrungFrage: {
      sie: "Welche Erfahrungen haben Sie bereits mit Immobilien gemacht?",
      du: "Welche Erfahrungen hast du bereits mit Immobilien gemacht?",
    },
    erfahrungPlatzhalter: "z.B. eigengenutzte Wohnung, eine vermietete Einheit, oder bisher keine",
    zieleGewaehlt: (anzahl: number, hoechstens: number) => `${anzahl} / ${hoechstens} gewählt`,
    zieleFrage: {
      sie: "Welche Ziele sind Ihnen besonders wichtig?",
      du: "Welche Ziele sind dir besonders wichtig?",
    },
    zieleHinweis: (hoechstens: number) =>
      `Mehrfachauswahl möglich, höchstens ${hoechstens}. Das zuerst gewählte Ziel führt.`,
    hauptziel: "Hauptziel",
    beitragFrage: {
      sie: "Welcher monatliche Eigenaufwand ist für Sie gut darstellbar?",
      du: "Welcher monatliche Eigenaufwand ist für dich gut darstellbar?",
    },
    beitragPlatzhalter: "z.B. 200 bis 250",
    finanzierungFrage: "Welche Finanzierung ist realistisch?",
    finanzierungText: "Wir schätzen nicht, wir rechnen. Was bleibt am Monatsende übrig?",
    feldEinnahmen: "Einnahmen im Monat (Netto)",
    feldAusgaben: "Ausgaben im Monat",
    feldEigenkapitalGesamt: "Eigenkapital gesamt",
    feldEigenkapital: "davon liquide verfügbar",
    ueberschuss: "Überschuss im Monat",
    tragbar: "Davon tragbar",
    rahmen: "Finanzierungsrahmen",
    rahmenErklaerung: {
      sie: "Gerechnet mit 80 Prozent des Überschusses als tragbarer Rate, einer Annuität aus Zins und Tilgung von 6 Prozent und Ihrem Eigenkapital obendrauf.",
      du: "Gerechnet mit 80 Prozent des Überschusses als tragbarer Rate, einer Annuität aus Zins und Tilgung von 6 Prozent und deinem Eigenkapital obendrauf.",
    },
    orientierung: "Eine Orientierung, keine Zusage. Die verbindliche Haushaltsrechnung macht die Bank.",
    wichtigFrage: {
      sie: "Was ist Ihnen bei einem Immobilieninvestment besonders wichtig?",
      du: "Was ist dir bei einem Immobilieninvestment besonders wichtig?",
    },
    wichtigPlatzhalter: "z.B. sichere Lage, wenig Aufwand, planbarer Ertrag",
    uebernommen: "Aus Erstgespräch übernommen",
  },

  prozess: {
    titel: "Der Weg, den wir [[gemeinsam]] gehen",
    vorspann:
      "Sechs Schritte. Klare Orientierung von Anfang an. Heute legen wir gemeinsam den Grundstein mit Schritt 1.",
    schritte: [
      { titel: "Erstgespräch", text: "Situation, Ziele und Wünsche verstehen.", marke: "Heute" },
      {
        titel: "Selbstauskunft",
        text: "Einkommen, Ausgaben, Eigenkapital und bestehende Kredite prüfen.",
        marke: "Nächster Schritt",
      },
      {
        titel: "Strategie entwickeln",
        text: "Passendes Konzept und möglichen Finanzierungsrahmen bestimmen.",
        marke: "Wir im Hintergrund",
      },
      {
        titel: "Objektvorschlag",
        text: "Vorstellung einer konkreten Immobilie inklusive vollständiger Rechnung.",
        marke: "Nächster Termin",
      },
      {
        titel: "Finanzierung und Kauf",
        text: "Bankprüfung, Kaufvertrag und Notartermin.",
        marke: { sie: "Nur wenn Sie Ja sagen", du: "Nur wenn du Ja sagst" },
      },
      {
        titel: "Vermietung und Betreuung",
        text: "Vermietung, Verwaltung und langfristiger Portfolioaufbau.",
        marke: "Dauerhaft",
      },
    ],
    fazit: "Schritt eins machen wir heute.",
    fazitBetont: "Schritt zwei ist der nächste, das Tempo bestimmen wir gemeinsam.",
    grundlage: {
      sie: "Heute schaffen wir die Grundlage. Am Ende des Gesprächs haben Sie Klarheit über Ihre Möglichkeiten, und wir besprechen gemeinsam das weitere Vorgehen.",
      du: "Heute schaffen wir die Grundlage. Am Ende des Gesprächs hast du Klarheit über deine Möglichkeiten, und wir besprechen gemeinsam das weitere Vorgehen.",
    },
  },

  mockup: {
    frage: { sie: "Was möchten Sie erreichen?", du: "Was möchtest du erreichen?" },
    antwort: "Vorsorge fürs Alter.",
    nettoeinkommen: "Nettoeinkommen",
    ausgaben: "Ausgaben",
    eigenkapital: "Eigenkapital",
    konzepteVergleich: "Konzepte im Vergleich",
    balken: ["Neubau", "WG", "Bestand"],
    rahmen: "Rahmen",
    zimmer: "2 Zimmer · 58 m²",
    ort: "Nürnberg",
    miete: (betrag: number) => `Miete ${eDe(betrag)}`,
    darlehen: "Darlehen",
    zins: "Zins",
    tilgung: "Tilgung",
    notartermin: "Notartermin",
    notarDatum: "14.08.",
    mieteinnahme: "Mieteinnahme",
    proMonat: (betrag: number) => `${eDe(betrag)} / Monat`,
    vermietet: "Vermietet · verwaltet",
  },

  funktion: {
    titel: "Vier Bausteine, die [[zusammenarbeiten]]",
    vorspann:
      "Vier Bausteine, ein gemeinsames Ziel. Der Erfolg einer Kapitalanlageimmobilie beruht nicht auf einem einzelnen Vorteil. Entscheidend ist das Zusammenspiel dieser vier Bausteine.",
    bausteine: [
      {
        titel: "Mieteinnahmen",
        text: "Die Mieteinnahmen tragen einen wesentlichen Teil der laufenden Finanzierung.",
      },
      {
        titel: "Steuer",
        text: "Abschreibungen und steuerliche Gestaltung schaffen messbare finanzielle Vorteile.",
      },
      {
        titel: "Tilgung",
        text: {
          sie: "Ein Teil jeder Finanzierung fliesst direkt in Ihren Vermögensaufbau.",
          du: "Ein Teil jeder Finanzierung fliesst direkt in deinen Vermögensaufbau.",
        },
      },
      {
        titel: "Wertentwicklung",
        text: "Historisch haben Immobilien über lange Zeiträume massgeblich zum Vermögensaufbau beigetragen.",
      },
    ],
    kicker: "Die entscheidende Frage",
    frage: {
      sie: "Wer trägt eigentlich Ihre monatliche Rate?",
      du: "Wer trägt eigentlich deine monatliche Rate?",
    },
    text: {
      sie: "Mieter, Steuerersparnis und Ihr eigener Beitrag bauen gemeinsam Vermögen auf. Den größten Teil davon trägt nicht Ihr Konto.",
      du: "Mieter, Steuerersparnis und dein eigener Beitrag bauen gemeinsam Vermögen auf. Den größten Teil davon trägt nicht dein Konto.",
    },
    textZusatz: "Genau das kann eine Kapitalanlageimmobilie, und ein Sparplan kann es nicht.",
    mieter: "Der Mieter",
    mieterText: {
      sie: "trägt mit der Miete den größten Teil Ihrer monatlichen Rate.",
      du: "trägt mit der Miete den größten Teil deiner monatlichen Rate.",
    },
    finanzamt: "Das Finanzamt",
    finanzamtText: "kommt über die Steuerwirkung dazu, statt einfach abzufließen.",
    selbst: { sie: "Sie selbst", du: "Du selbst" },
    selbstText: {
      sie: "bleiben als Ihr eigener Beitrag jeden Monat übrig.",
      du: "bleibt als dein eigener Beitrag jeden Monat übrig.",
    },
    /** Der deutsche Rechenweg kommt unverändert aus `rateAnteile.ts`. */
    rechenweg: (
      kaltmiete: number,
      nichtUmlagefaehig: number,
      rate: number,
      entlastungAbJahrZwei: number,
      eigenbeitragAbJahrZwei: number,
    ) =>
      rateRechenweg({ kaltmiete, nichtUmlagefaehig, rate, entlastungAbJahrZwei, eigenbeitragAbJahrZwei }),
    dauerzustand:
      "Gezeigt ist der Dauerzustand ab dem zweiten Jahr. Im ersten Jahr trägt das Finanzamt wegen des einmaligen Erhaltungsaufwands sogar über die Hälfte.",
  },

  vergleich: {
    titel: "[[Immobilie]], Aktien, Tagesgeld",
    vorspann:
      "Ein ehrlicher Vergleich. Immobilien sind nicht grundsätzlich besser. Sie können nur eines, was die anderen beiden nicht können.",
    kopf: ["Eigenschaft", "Immobilie", "Aktien und Fonds", "Tagesgeld"],
    zeilen: [
      ["Finanzierung mit Fremdkapital", "möglich", "normalerweise nicht", "nicht möglich"],
      ["Laufende Einnahmen", "Miete", "Dividenden möglich", "Zinsen"],
      ["Steuerliche Gestaltung", "Abschreibung und Kosten", "eingeschränkt", "kaum"],
      ["Eigene Einflussmöglichkeiten", "hoch", "gering", "keine"],
      ["Verfügbarkeit", "gering", "hoch", "sehr hoch"],
      ["Schwankungen", "weniger sichtbar", "täglich sichtbar", "gering"],
    ],
    unterschied: "Der eine entscheidende Unterschied",
    unterschiedText: {
      sie: "Sie können mit Bankkapital einen großen Sachwert erwerben, während der Mieter einen Teil der Finanzierung übernimmt. Für ein Aktiendepot leiht Ihnen keine Bank 350.000 Euro.",
      du: "Du kannst mit Bankkapital einen großen Sachwert erwerben, während der Mieter einen Teil der Finanzierung übernimmt. Für ein Aktiendepot leiht dir keine Bank 350.000 Euro.",
    },
    einschraenkung: "Und die ehrliche Einschränkung",
    einschraenkungText:
      "Eine Immobilie ist nicht schnell verfügbar und nicht für jeden das Richtige. Sie eignet sich für langfristigen, kreditfinanzierten Vermögensaufbau. Wer in zwei Jahren an sein Geld muss, ist woanders besser aufgehoben.",
  },

  konzepte: {
    titel: "Drei Konzepte, drei Ziele",
    vorspann: {
      sie: "Jedes Konzept verfolgt einen anderen Schwerpunkt, passend zu Ihren persönlichen Zielen.",
      du: "Jedes Konzept verfolgt einen anderen Schwerpunkt, passend zu deinen persönlichen Zielen.",
    },
    ansehen: "Ansehen",
    konzeptTitel: (name: string) => `Konzept: ${name}`,
    vorteile: "Vorteile",
    geeignetFuer: "Geeignet für",
    liste: {
      bestand: {
        name: "Sanierter Bestand",
        kurz: "Etablierte Lagen, starker Steuereffekt",
        fokus: "Fokus auf etablierte Lagen und steuerliche Effekte.",
        einleitung: "Ausgewählte Bestandswohnungen in etablierten Lagen.",
        vorteile: [
          "bestehende und bewährte Wohnlagen",
          "direkte Vermietbarkeit nach Fertigstellung",
          "mögliche Wertsteigerung durch Sanierung",
          "reguläre Gebäude-Abschreibung",
          "möglicher sofort abzugsfähiger Erhaltungsaufwand",
        ],
        geeignet: [
          "gutverdienende Angestellte",
          "Kunden mit höherer Steuerlast",
          "langfristig orientierte Investoren",
          "Kunden, die Lage und Steueroptimierung verbinden möchten",
        ],
      },
      wg: {
        name: "WG und Co-Living",
        kurz: "Höhere Mieteinnahmen, Renditefokus",
        fokus: "Fokus auf höhere Mieteinnahmen und Rendite.",
        einleitung: "Wohnungen werden möbliert und zimmerweise vermietet.",
        vorteile: [
          "deutlich höhere Mieteinnahmen je Quadratmeter",
          "Nachfrage von Studierenden, Azubis und Berufspendlern",
          "professionelles Vermietungsmanagement",
          "Streuung über mehrere Mietverhältnisse in einer Wohnung",
        ],
        geeignet: [
          "Kunden mit Renditefokus",
          "Investoren mit langfristigem Anlagehorizont",
          "Kunden, die professionelles Vermietungsmanagement nutzen möchten",
        ],
        bloecke: [
          {
            titel: "München",
            punkte: [
              "sehr hohe Nachfrage",
              "hohe Zimmermieten",
              "besonders starke und stabile Lage",
              "höherer Kaufpreis",
            ],
          },
          {
            titel: "Nürnberg",
            punkte: [
              "geringerer Einstiegspreis",
              "attraktive Mietrenditen",
              "starke Metropolregion",
              "gutes Verhältnis zwischen Kaufpreis und Miete",
            ],
          },
        ],
      },
      kfw: {
        name: "KfW 40 QNG",
        kurz: "Neubau, Förderung, Planbarkeit",
        fokus: "Fokus auf Energieeffizienz, Förderung und Planbarkeit.",
        einleitung: "Energieeffiziente Neubauimmobilien mit QNG-Zertifizierung.",
        vorteile: [
          "moderner und energieeffizienter Neubau",
          "mögliche KfW-Förderkredite",
          "mögliche steuerliche Sonderabschreibung",
          "geringer Sanierungsbedarf",
          "gute Planbarkeit",
          "hohe Attraktivität für Mieter",
        ],
        geeignet: [
          "Kunden mit Fokus auf Planbarkeit",
          "sicherheitsorientierte Anleger",
          "Kunden, die moderne Neubauten bevorzugen",
          "Investoren, die Förderungen und steuerliche Vorteile nutzen möchten",
        ],
      },
    },
  },

  beispiel: {
    titel: "Drei Objekte, [[Zahl für Zahl]]",
    vorspann:
      "Drei Beispielberechnungen zu Wohnungen aus unserem Bestand in Nürnberg, Ansbach und München, jede vollständig durchgerechnet. Wir rechnen mit den echten Zahlen dieser Objekte: Kaufpreis, Wohnfläche, Miete und Sanierungsanteil stammen aus den Objektunterlagen, nicht aus einem Musterfall.",
    passtZuZiel: {
      sie: " · passt zu Ihrem Ziel aus Abschnitt 03",
      du: " · passt zu deinem Ziel aus Abschnitt 03",
    },
    situation: "Persönliche Situation",
    wohnung: "Die Wohnung",
    herkunftTitel: "Woher diese Zahlen kommen",
    mechanik: {
      sie: "Die Rechnung zeigt die Mechanik, sie ist keine Zusage. Die tatsächlichen Zahlen hängen vom konkreten Objekt, den Konditionen der Bank und Ihrer persönlichen Steuersituation ab.",
      du: "Die Rechnung zeigt die Mechanik, sie ist keine Zusage. Die tatsächlichen Zahlen hängen vom konkreten Objekt, den Konditionen der Bank und deiner persönlichen Steuersituation ab.",
    },
  },

  /**
   * Die drei Musterrechnungen. Die Zahlen für Grafiken und Rechenwege
   * (Kaufpreis, Tilgung, Entlastung) stehen als Zahlen in der Seite, hier
   * steht nur, was als Text auf der Folie erscheint.
   */
  rechnungen: {
    bestand: {
      name: "Sanierter Bestand",
      ort: "Nürnberg",
      kurz: "350.000 €, 100 m², Altbau",
      adresse: "Breitscheidstraße 18, 90459 Nürnberg",
      merkmale: [
        "Produktklasse Erhaltungsaufwand",
        "Möblierte Vermietung und Premium Co-Living",
        "24 Monate Mietgarantie ab wirtschaftlichem Übergang",
        "360-Grad-Verwaltung, Einbauküche und Vollmöblierung inklusive",
      ],
      herkunft:
        "Objekt, Lage, Baujahr und Ausstattung stammen aus den Unterlagen zur Breitscheidstraße 18. Die Rechnung daneben ist auf eine 100-Quadratmeter-Einheit gerechnet und damit auf das Modell, nicht auf genau diese Wohnung.",
      bildTitel: [
        "Straßenansicht",
        "Hofseite",
        "Dachgeschoss vor der Sanierung",
        "Flur nach der Sanierung",
        "Wohnraum",
        "Wohnraum, zweite Ansicht",
        "Küchenzeile",
        "Bad",
      ],
      kunde: [
        ["Nettoeinkommen", "4.600 € monatlich"],
        ["Veranlagung", "Grundtabelle"],
        ["Grenzsteuersatz", "42 %"],
        ["Ziel", "langfristiger Vermögensaufbau"],
        ["Eigenkapital", "19.250 €"],
      ],
      objekt: [
        ["Kaufpreis", "350.000 €"],
        ["Wohnfläche", "100 m², 3.500 €/m²"],
        ["Kaltmiete", "1.400 € monatlich, 14 €/m²"],
        ["Bruttomietrendite", "4,8 %"],
        ["Gebäudeanteil", "80 %"],
        ["Kaufnebenkosten", "19.250 €, aus Eigenkapital"],
      ],
      zeilen: [
        { pos: "Kaltmiete", betrag: "+1.400 €" },
        { pos: "Zins und Tilgung", betrag: "−1.604 €" },
        { pos: "Nicht umlagefähige Kosten", betrag: "−150 €" },
      ],
      beitragVorSteuer: "ca. −354 €",
      afa: [
        {
          titel: "Gebäude-AfA 2 %",
          text: "§ 7 Abs. 4 EStG, Fertigstellung zwischen 1925 und 2022",
          betrag: "5.908 € pro Jahr",
        },
        {
          titel: "Finanzierungszinsen",
          text: "§ 9 Abs. 1 Satz 3 Nr. 1 EStG, in voller Höhe",
          betrag: "14.000 € im ersten Jahr",
        },
        { titel: "Verwaltergebühr", text: "sofort abziehbar, anders als die Rücklage", betrag: "480 € pro Jahr" },
        { titel: "Erhaltungsaufwand", text: "einmalig, unterhalb der 15-Prozent-Grenze", betrag: "20.000 € einmalig" },
      ],
      steuerZeilen: [
        ["Kaltmiete", "+16.800 €"],
        ["Gebäude-AfA 2 %", "−5.908 €"],
        ["Schuldzinsen", "−14.000 €"],
        ["Verwaltergebühr", "−480 €"],
        ["Erhaltungsaufwand", "−20.000 €"],
      ],
      steuerErgebnis: "−23.588 €",
      entlastungLabel: "Steuerentlastung im ersten Jahr",
      spaeter: {
        titel: "Und ab dem zweiten Jahr",
        entlastungMonat: "126 €",
        beitragMonat: "−228 €",
        text: "Ohne den einmaligen Erhaltungsaufwand bleibt ein steuerliches Ergebnis von −3.588 Euro, also rund 1.507 Euro Entlastung im Jahr. Der grosse Effekt des ersten Jahres kommt genau einmal.",
      },
      hinweis:
        "Von den 150 Euro nicht umlagefähigen Kosten ist nur die Verwaltergebühr sofort abziehbar. Die Zuführung zur Instandhaltungsrücklage wirkt steuerlich erst, wenn die Eigentümergemeinschaft das Geld tatsächlich ausgibt. Der Erhaltungsaufwand von 20.000 Euro liegt unter der 15-Prozent-Grenze des § 6 Abs. 1 Nr. 1a EStG, die hier bei 44.310 Euro liegt. Wird sie innerhalb von drei Jahren überschritten, kippt der gesamte Aufwand in Herstellungskosten, nicht nur der Teil darüber. Hinweis: Mit einem Restnutzungsdauergutachten kann die Gebäude-AfA in vielen Fällen deutlich höher ausfallen. Das verstärkt den steuerlichen Effekt zusätzlich.",
      tilgungText: "4 % Zins, 1,5 % anfängliche Tilgung",
    },

    neubau: {
      name: "Neubau KfW 40 QNG",
      ort: "Ansbach",
      kurz: "310.000 €, 38,3 m², Fertigstellung 2027",
      adresse: "Park-Living, Wohnbaustraße, 91522 Ansbach",
      merkmale: [
        "Neubau nach KfW 40 QNG",
        "Quartiersentwicklung Park-Living",
        "Sonderabschreibung nach § 7b in den ersten vier Jahren",
        "Förderfähige Finanzierung über die KfW",
      ],
      herkunft:
        "Bilder, Grundrisse und Übersichtsplan stammen aus den Unterlagen zum Projekt Park-Living in Ansbach. Die Rechnung folgt der vorliegenden Immobilienberechnung und ist auf eine kleinere Einheit gerechnet.",
      bildTitel: [
        "Außenansicht",
        "Außenansicht, zweite Perspektive",
        "Übersichtsplan Park-Living",
        "Grundriss Erdgeschoss",
        "Grundriss Obergeschoss",
        "Grundriss Dachgeschoss",
      ],
      kunde: [
        ["Zu versteuerndes Einkommen", "150.000 €"],
        ["Veranlagung", "Splittingtabelle"],
        ["Grenzsteuersatz", "42 %"],
        ["Einkommensteuer vorher", "40.728 €"],
        ["Ziel", "Steuerwirkung und Planbarkeit"],
        ["Eigenkapital", "17.050 €"],
      ],
      objekt: [
        ["Kaufpreis", "310.000 €"],
        ["Wohnfläche", "38,30 m², Ansbach"],
        ["davon Grund und Boden", "160.000 €, 51,61 %"],
        ["davon Gebäude", "150.000 €, 48,39 %"],
        ["Kaltmiete", "807,70 € monatlich, 21,09 €/m²"],
        ["Erwerbsnebenkosten", "17.050 €, aus Eigenkapital"],
      ],
      zeilen: [
        { pos: "Kaltmiete", betrag: "+824 €" },
        { pos: "Zins und Tilgung, Bank und KfW", betrag: "−986 €" },
        { pos: "Verwaltung SE und WEG", betrag: "−60 €" },
      ],
      beitragVorSteuer: "ca. −222 €",
      afa: [
        {
          titel: "Sonder-AfA 5 %",
          text: "§ 7b EStG, vier Jahre lang, Effizienzhaus 40 mit QNG",
          betrag: "7.575 € pro Jahr",
        },
        { titel: "Degressive AfA 5 %", text: "§ 7 Abs. 5a EStG, vom jeweiligen Restbuchwert", betrag: "sinkt jährlich" },
        {
          titel: "Finanzierungszinsen",
          text: "Bankdarlehen 3,80 % und KfW 2,50 %",
          betrag: "9.762 € im ersten vollen Jahr",
        },
        { titel: "Verwaltung", text: "Sondereigentum und Gemeinschaft", betrag: "717 € pro Jahr" },
      ],
      steuerZeilen: [
        ["Kaltmiete", "+9.886 €"],
        ["Abschreibung gesamt, 5 % plus 5 %", "−14.992 €"],
        ["Schuldzinsen", "−9.762 €"],
        ["Verwaltung", "−717 €"],
      ],
      steuerErgebnis: "−15.585 €",
      entlastungLabel: "Steuerentlastung im ersten vollen Jahr",
      spaeter: {
        titel: "Und ab dem fünften Jahr",
        entlastungMonat: "155 €",
        beitragMonat: "−260 €",
        text: "Nach vier Jahren läuft die Sonderabschreibung nach § 7b aus, gleichzeitig beginnt die Tilgung des KfW-Darlehens. Aus einem Überschuss wird dann wieder ein Beitrag. Wer nur die ersten vier Jahre zeigt, verkauft eine Illusion.",
      },
      hinweis:
        "Die 5 plus 5 Prozent sind zwei verschiedene Dinge: die Sonderabschreibung nach § 7b EStG über vier Jahre und die degressive AfA nach § 7 Abs. 5a EStG vom Restbuchwert. Dass beides nebeneinander zulässig ist, steht ausdrücklich in § 7b Abs. 1 Satz 1. Voraussetzung sind Bauantrag zwischen 2023 und 2029, Baukosten höchstens 5.200 Euro je Quadratmeter, Bemessungsgrundlage höchstens 4.000 Euro je Quadratmeter und der Standard Effizienzhaus 40 mit QNG-Siegel. Beim sanierten Bestand gibt es beides nicht.",
      tilgungText: "Bank 3,80 % mit 1,25 %, KfW 2,50 % tilgungsfrei für zwei Jahre",
    },

    wg: {
      name: "WG und Co-Living",
      // Stand bisher aus dem letzten Teil der Beschreibung hergeleitet unter dem Reiter.
      ort: "saniert",
      kurz: "413.500 €, 38,33 m², WG-Wohnung",
      adresse: "WG-Wohnung, 38,33 m², 2 Zimmer, 3. OG, Baujahr 1968, saniert",
      merkmale: [
        "Anlageklasse WG-Wohnung, saniert",
        "Möblierte Vermietung, zimmerweise",
        "24 Monate Mietgarantie kalt ab wirtschaftlichem Übergang",
        "Verwaltung über WEG und Sondereigentum",
      ],
      herkunft:
        "Kaufpreis, Wohnfläche, Kaltmiete, Sanierungsanteil und Hausgeld stammen aus den Objektunterlagen. Die übrigen Annahmen wie Grenzsteuersatz, Eigenkapital und AfA sind wie beim sanierten Bestand angesetzt und im Einzelfall zu prüfen.",
      bildTitel: ["", "", "", "", ""],
      kunde: [
        ["Nettoeinkommen", "4.600 € monatlich"],
        ["Veranlagung", "Grundtabelle"],
        ["Grenzsteuersatz", "42 %"],
        ["Ziel", "langfristiger Vermögensaufbau"],
        ["Eigenkapital", "22.743 €"],
      ],
      objekt: [
        ["Kaufpreis", "413.500 €"],
        ["Wohnfläche", "38,33 m², 41,74 €/m²"],
        ["Kaltmiete", "1.600 € monatlich, 41,74 €/m²"],
        ["Bruttomietrendite", "4,64 %"],
        ["Gebäudeanteil", "80 %"],
        ["Kaufnebenkosten", "22.743 €, aus Eigenkapital"],
      ],
      zeilen: [
        { pos: "Kaltmiete", betrag: "+1.600 €" },
        { pos: "Zins und Tilgung", betrag: "−1.895 €" },
        { pos: "Nicht umlagefähige Kosten", betrag: "−73 €" },
      ],
      beitragVorSteuer: "ca. −368 €",
      afa: [
        {
          titel: "Gebäude-AfA 2 %",
          text: "§ 7 Abs. 4 EStG, Fertigstellung zwischen 1925 und 2022",
          betrag: "6.980 € pro Jahr",
        },
        {
          titel: "Finanzierungszinsen",
          text: "§ 9 Abs. 1 Satz 3 Nr. 1 EStG, in voller Höhe",
          betrag: "16.540 € im ersten Jahr",
        },
        { titel: "Verwaltergebühr", text: "sofort abziehbar, anders als die Rücklage", betrag: "480 € pro Jahr" },
        { titel: "Erhaltungsaufwand", text: "einmalig, unterhalb der 15-Prozent-Grenze", betrag: "30.800 € einmalig" },
      ],
      steuerZeilen: [
        ["Kaltmiete", "+19.200 €"],
        ["Gebäude-AfA 2 %", "−6.980 €"],
        ["Schuldzinsen", "−16.540 €"],
        ["Verwaltergebühr", "−480 €"],
        ["Erhaltungsaufwand", "−30.800 €"],
      ],
      steuerErgebnis: "−35.600 €",
      entlastungLabel: "Steuerentlastung im ersten Jahr",
      spaeter: {
        titel: "Und ab dem zweiten Jahr",
        entlastungMonat: "168 €",
        beitragMonat: "−200 €",
        text: "Ohne den einmaligen Erhaltungsaufwand bleibt ein steuerliches Ergebnis von −4.800 Euro, also rund 2.016 Euro Entlastung im Jahr. Der grosse Effekt des ersten Jahres kommt genau einmal.",
      },
      hinweis: {
        sie: "Vier einzeln vermietete Zimmer bringen die höchste Miete je Quadratmeter, aber auch den höchsten Aufwand: vier Mietverhältnisse, mehr Wechsel, Möblierung, die ersetzt werden muss, und eine Verwaltung, die Co-Living beherrschen muss. Ob der Sanierungsanteil in voller Höhe sofort abziehbar ist oder ob § 6 Abs. 1 Nr. 1a EStG greift und daraus Herstellungskosten werden, entscheidet das Finanzamt und nicht der Verkäufer. Diese Rechnung ersetzt deshalb kein Gespräch mit Ihrem Steuerberater. Hinweis: Mit einem Restnutzungsdauergutachten kann die Gebäude-AfA in vielen Fällen deutlich höher ausfallen. Das verstärkt den steuerlichen Effekt zusätzlich.",
        du: "Vier einzeln vermietete Zimmer bringen die höchste Miete je Quadratmeter, aber auch den höchsten Aufwand: vier Mietverhältnisse, mehr Wechsel, Möblierung, die ersetzt werden muss, und eine Verwaltung, die Co-Living beherrschen muss. Ob der Sanierungsanteil in voller Höhe sofort abziehbar ist oder ob § 6 Abs. 1 Nr. 1a EStG greift und daraus Herstellungskosten werden, entscheidet das Finanzamt und nicht der Verkäufer. Diese Rechnung ersetzt deshalb kein Gespräch mit deinem Steuerberater. Hinweis: Mit einem Restnutzungsdauergutachten kann die Gebäude-AfA in vielen Fällen deutlich höher ausfallen. Das verstärkt den steuerlichen Effekt zusätzlich.",
      },
      tilgungText: "4 % Zins, 1,5 % anfängliche Tilgung",
    },
  },

  rechnung: {
    titel: "Die Rechnung, [[Zeile für Zeile]]",
    vorspann: (name: string, tilgungText: string) => `${name}. ${tilgungText}. Nichts davon ist geschönt.`,
    beitragVorSteuer: {
      sie: "Ihr monatlicher Beitrag vor Steuer",
      du: "Dein monatlicher Beitrag vor Steuer",
    },
    entlastungProMonat: "Steuerentlastung pro Monat",
    tilgungProMonat: "Tilgung pro Monat im Schnitt",
    tilgungHinweis: {
      sie: "Das ist kein Aufwand, das ist Ihr Vermögen.",
      du: "Das ist kein Aufwand, das ist dein Vermögen.",
    },
  },

  schere: {
    kicker: "Nach zehn Jahren",
    titel: { sie: "Was am Ende Ihnen gehört", du: "Was am Ende dir gehört" },
    vermoegensaufbau: "Vermögensaufbau",
    kaufpreis: "Kaufpreis",
    laufzeit: "Laufzeit",
    jahre: (anzahl: number) => `${anzahl} Jahre`,
    immobilienwert: "Immobilienwert",
    vermoegen: { sie: "Ihr Vermögen", du: "Dein Vermögen" },
    restschuld: "Restschuld bei der Bank",
    getilgt: (betrag: number) => `${eDe(betrag)} getilgt`,
    regler: "Angenommene Wertsteigerung pro Jahr",
    reglerNull: {
      sie: "Ziehen Sie den Regler ruhig auf null.",
      du: "Zieh den Regler ruhig auf null.",
    },
    selbstDann: "Selbst dann bleiben",
    selbstDannRest:
      "übrig, weil die Tilgung unabhängig von jeder Wertentwicklung läuft. Alles darüber ist Zugabe, nicht Grundlage.",
    haftung:
      "Unverbindliches Berechnungsbeispiel bei gleichbleibendem Zins und gleichbleibender Miete. Kaufnebenkosten, Verkaufskosten, Instandhaltung und Mietausfall sind nicht eingerechnet. Ein Verkauf nach mehr als zehn Jahren ist im Privatvermögen nach § 23 EStG steuerfrei, die Frist läuft ab dem Notarvertrag. Eine Wertsteigerung ist nicht garantiert.",
  },

  rendite: {
    titel: "Was ein Sparplan [[leisten müsste]]",
    vorspann: {
      sie: "Dasselbe Vermögen mit reinem Sparen aufzubauen, verlangt eine Rendite, die kaum eine Anlage netto steuerfrei liefert. Genau das rechnet dieser Abschnitt für Ihr Konzept aus.",
      du: "Dasselbe Vermögen mit reinem Sparen aufzubauen, verlangt eine Rendite, die kaum eine Anlage netto steuerfrei liefert. Genau das rechnet dieser Abschnitt für dein Konzept aus.",
    },
    weg: {
      sie: "Von Ihrem Einsatz zum Endvermögen",
      du: "Von deinem Einsatz zum Endvermögen",
    },
    ek: "Eigenkapital, einmalig",
    cashflow: "Monatlicher Cashflow nach Steuer × 120 Monate",
    vermoegen10: {
      sie: "Ihr Vermögen nach zehn Jahren",
      du: "Dein Vermögen nach zehn Jahren",
    },
    endText: (getilgt: number, wertsteigerung: number) =>
      `Das Endvermögen folgt demselben Regler wie die Immobilienschere: ${zDe(getilgt)} Euro getilgtes Darlehen plus die angenommene Wertsteigerung von ${zDe(wertsteigerung, 1)} Prozent pro Jahr.`,
    live: {
      sie: "Ziehen Sie den Regler dort, rechnet diese Zahl live mit.",
      du: "Ziehst du den Regler dort, rechnet diese Zahl live mit.",
    },
    noetig: "Nötige Sparplan-Rendite pro Jahr",
    netto: "netto steuerfrei",
    soViel:
      "So viel müsste ein Sparplan Jahr für Jahr abwerfen, um mit demselben Einsatz dasselbe Vermögen zu erreichen.",
    bedeutet: { sie: "Bedeutet für Sie:", du: "Bedeutet für dich:" },
    bedeutetText: (eigenkapital: number, sparrate: number, rendite: number) =>
      `Eigenkapital ${zDe(eigenkapital)} Euro plus Cashflow monatlich nach Steuer ${zDe(sparrate)} Euro ergibt eine Rendite von ${zDe(rendite, 1)} Prozent netto steuerfrei.`,
    steuerfrei:
      "Steuerfrei, weil ein Verkauf nach mehr als zehn Jahren im Privatvermögen nach § 23 EStG steuerfrei ist.",
    versteuern: {
      sie: "Eine Sparplan-Rendite müssten Sie versteuern, um netto dasselbe übrig zu haben, läge die nötige Rendite vor Steuer noch höher.",
      du: "Eine Sparplan-Rendite müsstest du versteuern, um netto dasselbe übrig zu haben, läge die nötige Rendite vor Steuer noch höher.",
    },
  },

  steuer: {
    titel: "Die Steuerwirkung, [[Position für Position]]",
    vorspann: {
      sie: "Was Sie ohnehin an Steuern zahlen, fliesst bisher ab, ohne dass etwas zurückbleibt. Mit einer vermieteten Immobilie ändert sich, wohin ein Teil davon geht.",
      du: "Was du ohnehin an Steuern zahlst, fliesst bisher ab, ohne dass etwas zurückbleibt. Mit einer vermieteten Immobilie ändert sich, wohin ein Teil davon geht.",
    },
    vuv: "Einkünfte aus Vermietung und Verpachtung",
    ergebnis: "Steuerliches Ergebnis",
    beiGrenzsteuersatz: "Bei 42 Prozent Grenzsteuersatz ergibt das",
    proJahr: "pro Jahr",
    alsoRund: (monat: number, label: string) => `also rund ${zDe(monat)} Euro im Monat. ${label}.`,
    entlastung: "Entlastung",
    beitrag: { sie: "Ihr Beitrag", du: "Dein Beitrag" },
    proMonat: "pro Monat",
    ehrlich: "Was wir ehrlich dazusagen",
    haftung: {
      sie: "Unverbindliches Berechnungsbeispiel. Die genaue Wirkung hängt von Ihrem persönlichen Steuersatz und der steuerlichen Anerkennung ab und gehört zu Ihrem Steuerberater. Wer Ihnen etwas anderes verspricht, rechnet Ihnen etwas vor.",
      du: "Unverbindliches Berechnungsbeispiel. Die genaue Wirkung hängt von deinem persönlichen Steuersatz und der steuerlichen Anerkennung ab und gehört zu deinem Steuerberater. Wer dir etwas anderes verspricht, rechnet dir etwas vor.",
    },
  },

  pruefung: {
    titel: "Was wir bei [[jedem]] Objekt prüfen",
    vorspann: {
      sie: "Diese Liste ist der Grund, warum wir Ihnen nicht jede Wohnung zeigen, die auf den Markt kommt.",
      du: "Diese Liste ist der Grund, warum wir dir nicht jede Wohnung zeigen, die auf den Markt kommt.",
    },
    katalog: [
      "Standort und Wohnraumnachfrage",
      "realistische Miethöhe",
      "Kaufpreis und Vergleichspreise",
      "Zustand der Immobilie",
      "Unterlagen der Eigentümergemeinschaft und Rücklagen",
      "nicht umlagefähige Kosten",
      "mögliche Sanierungsrisiken",
      "Finanzierung und monatliche Belastung",
      "steuerliche Gestaltungsmöglichkeiten",
      "langfristige Wiederverkaufbarkeit",
    ],
  },

  rueckblick: {
    nummer: { sie: "Ihre Angaben", du: "Deine Angaben" },
    titel: { sie: "Was [[Sie]] heute gesagt haben", du: "Was [[du]] heute gesagt hast" },
    vorspann: {
      sie: "Kurz zusammengefasst, damit wir beide sicher sind, dass ich Sie richtig verstanden habe.",
      du: "Kurz zusammengefasst, damit wir beide sicher sind, dass ich dich richtig verstanden habe.",
    },
    ziele: { sie: "Ihre Ziele", du: "Deine Ziele" },
    ziel: { sie: "Ihr wichtigstes Ziel", du: "Dein wichtigstes Ziel" },
    rahmen: { sie: "Ihr Finanzierungsrahmen", du: "Dein Finanzierungsrahmen" },
    rund: (betrag: number) => `rund ${eDe(betrag)}`,
    beitrag: { sie: "Ihr monatlicher Beitrag", du: "Dein monatlicher Beitrag" },
    erfahrung: { sie: "Ihre Erfahrung mit Immobilien", du: "Deine Erfahrung mit Immobilien" },
    wichtig: { sie: "Das ist Ihnen besonders wichtig", du: "Das ist dir besonders wichtig" },
    erwartung: {
      sie: "Ihre Erwartung an das heutige Gespräch",
      du: "Deine Erwartung an das heutige Gespräch",
    },
    erfuellt: "Haben wir diese Erwartung im heutigen Gespräch erfüllt?",
    zahlen1: {
      sie: "Genau dafür brauchen wir jetzt Ihre vollständigen Zahlen.",
      du: "Genau dafür brauchen wir jetzt deine vollständigen Zahlen.",
    },
    zahlen2: {
      sie: "Alles, was Sie oben gesagt haben, ist die halbe Selbstauskunft.",
      du: "Alles, was du oben gesagt hast, ist die halbe Selbstauskunft.",
    },
    zahlen3: {
      sie: "Den Rest füllen wir gleich gemeinsam aus, dann rechnet der nächste Termin mit Ihren Zahlen statt mit einem Beispiel.",
      du: "Den Rest füllen wir gleich gemeinsam aus, dann rechnet der nächste Termin mit deinen Zahlen statt mit einem Beispiel.",
    },
  },

  schritt: {
    titel: "Den nächsten Schritt machen wir [[jetzt gemeinsam]]",
    text: {
      sie: "Wir füllen Ihre Selbstauskunft direkt hier im Termin zusammen aus. Nicht als Hausaufgabe, nicht per Mail hinterher, sondern jetzt, solange ich Ihre Fragen sofort beantworten kann.",
      du: "Wir füllen deine Selbstauskunft direkt hier im Termin zusammen aus. Nicht als Hausaufgabe, nicht per Mail hinterher, sondern jetzt, solange ich deine Fragen sofort beantworten kann.",
    },
    erfassen: "Das erfassen wir zusammen",
    inhalt: [
      "Einkommen und berufliche Situation",
      "monatliche Ausgaben",
      "bestehende Kredite",
      "Eigenkapital und Rücklagen",
      "Immobilienbesitz",
      "gewünschter monatlicher Beitrag",
      "persönliche Ziele",
    ],
    warum: "Warum genau jetzt",
    warumText: {
      sie: "Ohne diese Angaben ist jeder Objektvorschlag geraten. Mit ihnen bekommen Sie beim nächsten Termin eine Rechnung auf Ihre Zahlen statt auf ein Beispiel. Die Selbstauskunft ist dabei ausdrücklich noch keine Kaufentscheidung und verpflichtet Sie zu nichts.",
      du: "Ohne diese Angaben ist jeder Objektvorschlag geraten. Mit ihnen bekommst du beim nächsten Termin eine Rechnung auf deine Zahlen statt auf ein Beispiel. Die Selbstauskunft ist dabei ausdrücklich noch keine Kaufentscheidung und verpflichtet dich zu nichts.",
    },
    knopf: "Selbstauskunft jetzt gemeinsam ausfüllen",
    kontextHinweis:
      "Aus dem Kundenprofil geöffnet, ist die Selbstauskunft direkt mit diesem Kunden und Investment verbunden.",
    grundlage:
      "Die Selbstauskunft ist die Grundlage für Schritt 17. Ohne sie gibt es keinen konkreten Objektvorschlag und keine persönliche Berechnung, sondern nur wieder ein Beispiel.",
  },

  termin: {
    titel: {
      sie: "Was Sie beim [[nächsten Termin]] bekommen",
      du: "Was du beim [[nächsten Termin]] bekommst",
    },
    vorspann: {
      sie: "Ihre Selbstauskunft ist die Grundlage, mit der wir uns intern gezielt auf genau diese Punkte vorbereiten. Wenn wir uns wiedersehen, liegen Ihre persönliche Strategie, passende Objekte und die durchgerechneten Zahlen bereits fertig auf dem Tisch, zugeschnitten auf Sie. Sechs Dinge, konkret und auf Ihre Zahlen gerechnet.",
      du: "Deine Selbstauskunft ist die Grundlage, mit der wir uns intern gezielt auf genau diese Punkte vorbereiten. Wenn wir uns wiedersehen, liegen deine persönliche Strategie, passende Objekte und die durchgerechneten Zahlen bereits fertig auf dem Tisch, zugeschnitten auf dich. Sechs Dinge, konkret und auf deine Zahlen gerechnet.",
    },
    punkte: [
      "einen konkreten Objektvorschlag",
      "eine verständliche Wirtschaftlichkeitsberechnung",
      "eine persönliche Cashflow-Berechnung",
      "eine Einordnung der möglichen Steuerwirkung",
      "einen möglichen Finanzierungsvorschlag",
      "eine klare Chancen- und Risikoanalyse",
    ],
    katalog: {
      sie: "Nichts davon kommt aus einem Katalog. Jeder dieser sechs Punkte wird aus Ihrer Selbstauskunft heraus für Sie vorbereitet, bevor wir uns wiedersehen. Beim nächsten Termin geht es deshalb nicht mehr darum, ob eine Immobilie für Sie funktioniert, sondern welche.",
      du: "Nichts davon kommt aus einem Katalog. Jeder dieser sechs Punkte wird aus deiner Selbstauskunft heraus für dich vorbereitet, bevor wir uns wiedersehen. Beim nächsten Termin geht es deshalb nicht mehr darum, ob eine Immobilie für dich funktioniert, sondern welche.",
    },
    entscheiden: {
      sie: "Danach entscheiden Sie in Ruhe: Passt dieses Objekt zu Ihnen,",
      du: "Danach entscheidest du in Ruhe: Passt dieses Objekt zu dir,",
    },
    weiter: "oder suchen wir weiter?",
    beides: {
      sie: "Beides ist ein gutes Ergebnis. Ein Nein zum falschen Objekt ist uns lieber als ein Ja, das Sie in zwei Jahren bereuen.",
      du: "Beides ist ein gutes Ergebnis. Ein Nein zum falschen Objekt ist uns lieber als ein Ja, das du in zwei Jahren bereust.",
    },
    knopf: "Selbstauskunft ausfüllen",
  },

  fuss: {
    haftung: {
      sie: "Alle Zahlen in dieser Präsentation dienen der Veranschaulichung. Die steuerliche Wirkung hängt von Ihrer persönlichen Situation ab und ist mit einem Steuerberater zu prüfen. Eine Wertsteigerung ist nicht garantiert.",
      du: "Alle Zahlen in dieser Präsentation dienen der Veranschaulichung. Die steuerliche Wirkung hängt von deiner persönlichen Situation ab und ist mit einem Steuerberater zu prüfen. Eine Wertsteigerung ist nicht garantiert.",
    },
  },

  galerie: {
    zurueck: "Vorheriges Bild",
    weiter: "Nächstes Bild",
  },

  /** Beschriftung eines Anlageziels. Auf Deutsch die aus `anlageZiele.ts`. */
  zielLabel: (id: string) => ANLAGE_ZIELE.find((z) => z.id === id)?.label ?? id,
} as const;

export type BeratungTexte = Breit<typeof de>;

/* ══════════════════════════════════════════════════════════════
   Englisch
   ══════════════════════════════════════════════════════════════ */

const en: BeratungTexte = {
  sprache: {
    label: "Language",
  },

  kopf: {
    nav: {
      heute: "Today",
      funktion: "How it works",
      konzepte: "Concepts",
      referenzen: "References",
      rechnung: "The numbers",
      schritt: "Next step",
    },
    selbstauskunft: "Self-disclosure",
    menue: "Menu",
    trainerEin: "Show speaking scripts",
    trainerAus: "Hide speaking scripts",
    sprung: "Go to self-disclosure",
  },

  hero: {
    videoLabel: "Personal OS Immobilien consultation",
    kicker: "OS Immobilien · Premium Real Estate Investment",
    willkommen: "Welcome",
    titel: "Strategic property portfolios",
    schreibmaschine: "with OS Immobilien.",
    claim: "Tax-optimised. Strong returns. Professionally guided.",
    start: "Start consultation",
    konzepte: "View concepts",
  },

  heute: {
    titel: "What are we doing [[today]]?",
    vorspann:
      "Before we start: today is not about making a decision, it is about understanding. Our goal is that by the end you know which options suit your situation.",
    agenda: [
      "Current situation & goals",
      "How an investment property works",
      "Real estate concepts",
      "Sample calculation",
      "Process: our joint roadmap",
    ],
    zielFett: "The goal of this conversation",
    zielRest:
      "is a first, clear strategy. At the end we will discuss together whether and how it makes sense to continue.",
  },

  ueberleitungen: {
    nichtstun: {
      text: "Before we talk about property, one question:",
      betont: "What actually happens if you do nothing at all?",
    },
    ueberUns: {
      text: "So that you can judge whether our way of working suits you, a quick word on",
      betont: "who is actually sitting across from you.",
    },
    motto: {
      text: "Our motto!",
      betont: "Your goals first. Then the right property. Not the other way round.",
    },
    funktion: {
      text: "Before we talk about concepts:",
      betont: "Let's look at how a property builds wealth.",
    },
    vergleich: {
      text: "And the question everyone asks at this point:",
      betont: "So why not simply save or buy shares?",
    },
    konzepte: {
      text: "If that works for you, only one question remains:",
      betont: "Which of the three concepts fits your goal?",
    },
    beispiel: {
      text: "Does this sound like your situation so far?",
      betont: "Then let's work through it figure by figure.",
    },
    steuer: {
      text: "How much tax do you actually pay each year, and how much of it stays with you?",
      betont: "This is where it gets interesting.",
    },
    referenzen: {
      text: "And what does something like this really look like in the end?",
      betont: "See for yourself.",
    },
    rueckblick: {
      text: "Everything we have discussed so far was general.",
      betont: "From now on, it is about you.",
    },
  },

  nichtstun: {
    nummer: "The cost of doing nothing",
    titel: "Money in the bank [[loses value every year]]",
    vorspann:
      "Not the end of the world, just maths. Let's take 50,000 euros in a well-paying instant-access savings account: two percent interest, two and a half percent inflation.",
    heute: "Today",
    heuteText: "in the account, available at any time",
    papier: "In 10 years, on paper",
    papierText: "after two percent interest. Looks like more.",
    korb: "In 10 years, in your shopping basket",
    korbText: "That is the purchasing power in today's money. Around 2,400 euros less than at the start.",
    fazit: "The interest does not keep up with inflation.",
    fazitFrage: "What are your savings doing right now?",
    fazitText:
      "This is not an argument for property. It is simply the reason why the next hour is worth your time.",
  },

  ueberUns: {
    titel: "OS Immobilien in one sentence",
    vorspann:
      "Our goal is not the purchase of a single property, but the systematic building of a real estate portfolio.",
    leistungen: [
      { titel: "Personal investment strategy", text: "Strategy first. Then the right property." },
      {
        titel: "Vetted properties",
        text: "Every property is held to the same quality and selection criteria.",
        partner: {
          marke: "OS Immobilien",
          rolle: "Property partner",
          satz: "We market the properties and units through OS Immobilien.",
        },
      },
      {
        titel: "Financing",
        text: "Financing strategy, bank negotiations and optimal terms from a single source.",
        partner: {
          marke: "MORE Finance",
          rolle: "Financing partner",
          satz: "MORE Finance handles the financing.",
        },
      },
      { titel: "Tax planning", text: "Identify tax potential early and use it in a targeted way." },
      {
        titel: "Purchase support",
        text: "From the reservation through the notary appointment (Notartermin) to the successful implementation of your wealth strategy.",
      },
      {
        titel: "Letting and management",
        text: "Professionally organised, so you do not have to take care of anything.",
      },
    ],
    anspruch: "Our standard: personal, transparent and focused on the long term.",
    ansprechpartner: "Your personal contact",
    fest: "From today, you have a dedicated contact person, not a hotline.",
    bisNotar: "From the first meeting until long after the notary appointment.",
  },

  arbeitsweise: {
    titel: "We don't just sell [[any property]]",
    vorspann:
      "The right property starts with the right questions. Before we talk about specific offers, we will answer six key questions together.",
    frage: (nummer: number) => `Question ${nummer}`,
    erwartungFrage: "What do you expect from today's conversation?",
    erwartungPlatzhalter: "e.g. get an honest overview, see concrete figures, clarify open questions",
    erfahrungFrage: "What experience do you already have with real estate?",
    erfahrungPlatzhalter: "e.g. an owner-occupied flat, one rented unit, or none so far",
    zieleGewaehlt: (anzahl: number, hoechstens: number) => `${anzahl} / ${hoechstens} selected`,
    zieleFrage: "Which goals matter most to you?",
    zieleHinweis: (hoechstens: number) =>
      `Multiple selection possible, up to ${hoechstens}. The first goal selected takes priority.`,
    hauptziel: "Main goal",
    beitragFrage: "What monthly contribution of your own can you comfortably afford?",
    beitragPlatzhalter: "e.g. 200 to 250",
    finanzierungFrage: "What level of financing is realistic?",
    finanzierungText: "We don't estimate, we calculate. What is left at the end of the month?",
    feldEinnahmen: "Monthly income (net)",
    feldAusgaben: "Monthly expenses",
    feldEigenkapitalGesamt: "Total equity",
    feldEigenkapital: "of which available in cash",
    ueberschuss: "Monthly surplus",
    tragbar: "Of which affordable",
    rahmen: "Financing capacity",
    rahmenErklaerung:
      "Calculated with 80 percent of the surplus as the affordable instalment, an annuity of interest and repayment of 6 percent, plus your equity on top.",
    orientierung: "A guide, not a commitment. The binding household budget calculation is carried out by the bank.",
    wichtigFrage: "What matters most to you in a real estate investment?",
    wichtigPlatzhalter: "e.g. a secure location, little effort, predictable income",
    uebernommen: "Taken from the first meeting",
  },

  prozess: {
    titel: "The path we take [[together]]",
    vorspann: "Six steps. Clear direction from the start. Today we lay the foundation together with step 1.",
    schritte: [
      { titel: "First meeting", text: "Understand your situation, goals and wishes.", marke: "Today" },
      {
        titel: "Self-disclosure (Selbstauskunft)",
        text: "Review income, expenses, equity and existing loans.",
        marke: "Next step",
      },
      {
        titel: "Develop a strategy",
        text: "Determine the right concept and the possible financing capacity.",
        marke: "Behind the scenes",
      },
      {
        titel: "Property proposal",
        text: "Presentation of a specific property including a complete calculation.",
        marke: "Next appointment",
      },
      {
        titel: "Financing and purchase",
        text: "Bank review, purchase contract and notary appointment.",
        marke: "Only if you say yes",
      },
      {
        titel: "Letting and support",
        text: "Letting, management and long-term portfolio building.",
        marke: "Ongoing",
      },
    ],
    fazit: "We take step one today.",
    fazitBetont: "Step two comes next, and we set the pace together.",
    grundlage:
      "Today we lay the groundwork. By the end of the conversation you will have clarity about your options, and we will agree on the next steps together.",
  },

  mockup: {
    frage: "What would you like to achieve?",
    antwort: "Provision for retirement.",
    nettoeinkommen: "Net income",
    ausgaben: "Expenses",
    eigenkapital: "Equity",
    konzepteVergleich: "Concepts compared",
    balken: ["New build", "Shared", "Existing"],
    rahmen: "Capacity",
    zimmer: "2 rooms · 58 m²",
    ort: "Nuremberg",
    miete: (betrag: number) => `Rent ${eEn(betrag)}`,
    darlehen: "Loan",
    zins: "Interest",
    tilgung: "Repayment",
    notartermin: "Notary",
    notarDatum: "14 Aug",
    mieteinnahme: "Rental income",
    proMonat: (betrag: number) => `${eEn(betrag)} / month`,
    vermietet: "Let · managed",
  },

  funktion: {
    titel: "Four building blocks that [[work together]]",
    vorspann:
      "Four building blocks, one common goal. The success of an investment property does not rest on a single advantage. What matters is how these four building blocks work together.",
    bausteine: [
      {
        titel: "Rental income",
        text: "The rental income covers a substantial part of the ongoing financing.",
      },
      {
        titel: "Tax",
        text: "Depreciation (AfA) and tax planning create measurable financial benefits.",
      },
      {
        titel: "Repayment",
        text: "Part of every financing payment goes directly into building your wealth.",
      },
      {
        titel: "Value development",
        text: "Historically, real estate has contributed significantly to building wealth over long periods.",
      },
    ],
    kicker: "The key question",
    frage: "Who actually pays your monthly instalment?",
    text: "The tenant, tax savings and your own contribution build wealth together. Most of it is not paid from your account.",
    textZusatz: "That is exactly what an investment property can do, and a savings plan cannot.",
    mieter: "The tenant",
    mieterText: "covers the largest part of your monthly instalment with the rent.",
    finanzamt: "The tax office",
    finanzamtText: "contributes through the tax effect, instead of that money simply flowing away.",
    selbst: "You",
    selbstText: "is what remains as your own contribution each month.",
    rechenweg: (
      kaltmiete: number,
      nichtUmlagefaehig: number,
      rate: number,
      entlastungAbJahrZwei: number,
      eigenbeitragAbJahrZwei: number,
    ) =>
      `${eEn(kaltmiete)} net cold rent (Kaltmiete) minus ${eEn(nichtUmlagefaehig)} non-recoverable costs ` +
      `leaves ${eEn(kaltmiete - nichtUmlagefaehig)} from the tenant, plus ${eEn(entlastungAbJahrZwei)} tax relief ` +
      `from the second year and ${eEn(eigenbeitragAbJahrZwei)} own contribution. ` +
      `Together, exactly the instalment of ${eEn(rate)}.`,
    dauerzustand:
      "Shown is the steady state from the second year onwards. In the first year, the tax office even covers more than half because of the one-off maintenance expenses (Erhaltungsaufwand).",
  },

  vergleich: {
    titel: "[[Property]], shares, savings account",
    vorspann:
      "An honest comparison. Property is not better in principle. It can simply do one thing that the other two cannot.",
    kopf: ["Feature", "Property", "Shares and funds", "Savings account"],
    zeilen: [
      ["Financing with borrowed capital", "possible", "usually not", "not possible"],
      ["Ongoing income", "rent", "dividends possible", "interest"],
      ["Tax planning", "depreciation and costs", "limited", "hardly any"],
      ["Personal influence", "high", "low", "none"],
      ["Liquidity", "low", "high", "very high"],
      ["Fluctuations", "less visible", "visible daily", "low"],
    ],
    unterschied: "The one decisive difference",
    unterschiedText:
      "You can acquire a large tangible asset with the bank's capital while the tenant covers part of the financing. No bank will lend you 350,000 euros for a share portfolio.",
    einschraenkung: "And the honest limitation",
    einschraenkungText:
      "A property cannot be turned into cash quickly and is not right for everyone. It is suited to long-term, loan-financed wealth building. Anyone who needs access to their money within two years is better off elsewhere.",
  },

  konzepte: {
    titel: "Three concepts, three goals",
    vorspann: "Each concept has a different focus, matched to your personal goals.",
    ansehen: "View",
    konzeptTitel: (name: string) => `Concept: ${name}`,
    vorteile: "Advantages",
    geeignetFuer: "Suitable for",
    liste: {
      bestand: {
        name: "Renovated Existing Property",
        kurz: "Established locations, strong tax effect",
        fokus: "Focus on established locations and tax effects.",
        einleitung: "Selected existing flats in established locations.",
        vorteile: [
          "existing, proven residential locations",
          "can be let immediately after completion",
          "possible increase in value through renovation",
          "standard building depreciation",
          "possible immediately deductible maintenance expenses",
        ],
        geeignet: [
          "high-earning employees",
          "clients with a higher tax burden",
          "investors with a long-term focus",
          "clients who want to combine location and tax optimisation",
        ],
      },
      wg: {
        name: "Shared Flats and Co-Living",
        kurz: "Higher rental income, focus on returns",
        fokus: "Focus on higher rental income and returns.",
        einleitung: "Flats are furnished and let room by room as shared flats (Wohngemeinschaft, WG).",
        vorteile: [
          "significantly higher rental income per square metre",
          "demand from students, apprentices and commuters",
          "professional letting management",
          "risk spread across several tenancies in one flat",
        ],
        geeignet: [
          "clients focused on returns",
          "investors with a long-term investment horizon",
          "clients who want to use professional letting management",
        ],
        bloecke: [
          {
            titel: "Munich",
            punkte: [
              "very high demand",
              "high room rents",
              "particularly strong and stable location",
              "higher purchase price",
            ],
          },
          {
            titel: "Nuremberg",
            punkte: [
              "lower entry price",
              "attractive rental yields",
              "strong metropolitan region",
              "good ratio between purchase price and rent",
            ],
          },
        ],
      },
      kfw: {
        name: "KfW 40 QNG",
        kurz: "New build, subsidies, predictability",
        fokus: "Focus on energy efficiency, subsidies and predictability.",
        einleitung:
          "Energy-efficient new-build properties with QNG certification (Qualitätssiegel Nachhaltiges Gebäude, the German quality seal for sustainable buildings).",
        vorteile: [
          "modern, energy-efficient new build",
          "possible subsidised loans from KfW, the German state development bank",
          "possible special tax depreciation (Sonderabschreibung)",
          "little need for renovation",
          "good predictability",
          "highly attractive to tenants",
        ],
        geeignet: [
          "clients focused on predictability",
          "security-minded investors",
          "clients who prefer modern new builds",
          "investors who want to use subsidies and tax benefits",
        ],
      },
    },
  },

  beispiel: {
    titel: "Three properties, [[figure by figure]]",
    vorspann:
      "Three sample calculations for flats from our portfolio in Nuremberg, Ansbach and Munich, each worked through in full. We use the real figures of these properties: purchase price, living space, rent and renovation share come from the property documents, not from a model case.",
    passtZuZiel: " · matches your goal from section 03",
    situation: "Personal situation",
    wohnung: "The flat",
    herkunftTitel: "Where these figures come from",
    mechanik:
      "The calculation shows the mechanics, it is not a commitment. The actual figures depend on the specific property, the bank's terms and your personal tax situation.",
  },

  rechnungen: {
    bestand: {
      name: "Renovated Existing Property",
      ort: "Nuremberg",
      kurz: "€350,000, 100 m², period building",
      adresse: "Breitscheidstraße 18, 90459 Nürnberg",
      merkmale: [
        "Product class: maintenance expenses (Erhaltungsaufwand)",
        "Furnished letting and premium co-living",
        "24-month rent guarantee from the transfer of benefits and burdens (wirtschaftlicher Übergang)",
        "360-degree management, fitted kitchen and full furnishing included",
      ],
      herkunft:
        "Property, location, year of construction and fittings come from the documents for Breitscheidstraße 18. The calculation alongside is based on a 100-square-metre unit, and therefore on the model, not on this exact flat.",
      bildTitel: [
        "Street view",
        "Courtyard side",
        "Attic before renovation",
        "Hallway after renovation",
        "Living room",
        "Living room, second view",
        "Kitchenette",
        "Bathroom",
      ],
      kunde: [
        ["Net income", "€4,600 per month"],
        ["Tax assessment", "basic tax table (Grundtabelle), single"],
        ["Marginal tax rate", "42%"],
        ["Goal", "long-term wealth building"],
        ["Equity", "€19,250"],
      ],
      objekt: [
        ["Purchase price", "€350,000"],
        ["Living space", "100 m², €3,500/m²"],
        ["Net cold rent", "€1,400 per month, €14/m²"],
        ["Gross rental yield", "4.8%"],
        ["Building share", "80%"],
        ["Incidental purchase costs", "€19,250, from equity"],
      ],
      zeilen: [
        { pos: "Net cold rent", betrag: "+€1,400" },
        { pos: "Interest and repayment", betrag: "−€1,604" },
        { pos: "Non-recoverable costs", betrag: "−€150" },
      ],
      beitragVorSteuer: "approx. −€354",
      afa: [
        {
          titel: "Building depreciation (AfA) 2%",
          text: "Section 7(4) EStG, completed between 1925 and 2022",
          betrag: "€5,908 per year",
        },
        {
          titel: "Financing interest",
          text: "Section 9(1) sentence 3 no. 1 EStG, deductible in full",
          betrag: "€14,000 in the first year",
        },
        { titel: "Management fee", text: "immediately deductible, unlike the reserve", betrag: "€480 per year" },
        { titel: "Maintenance expenses", text: "one-off, below the 15 percent threshold", betrag: "€20,000 one-off" },
      ],
      steuerZeilen: [
        ["Net cold rent", "+€16,800"],
        ["Building depreciation 2%", "−€5,908"],
        ["Loan interest", "−€14,000"],
        ["Management fee", "−€480"],
        ["Maintenance expenses", "−€20,000"],
      ],
      steuerErgebnis: "−€23,588",
      entlastungLabel: "Tax relief in the first year",
      spaeter: {
        titel: "And from the second year",
        entlastungMonat: "€126",
        beitragMonat: "−€228",
        text: "Without the one-off maintenance expenses, the taxable result is −3,588 euros, which means around 1,507 euros of tax relief per year. The large effect of the first year happens exactly once.",
      },
      hinweis:
        "Of the 150 euros in non-recoverable costs, only the management fee is immediately deductible. Contributions to the maintenance reserve (Instandhaltungsrücklage) only have a tax effect once the owners' association (Eigentümergemeinschaft) actually spends the money. The maintenance expenses of 20,000 euros are below the 15 percent threshold of Section 6(1) no. 1a EStG, which here is 44,310 euros. If the threshold is exceeded within three years, the entire expense is reclassified as production costs (Herstellungskosten), not just the part above it. Note: with a remaining useful life appraisal (Restnutzungsdauergutachten), building depreciation can be significantly higher in many cases. This further increases the tax effect.",
      tilgungText: "4% interest, 1.5% initial repayment",
    },

    neubau: {
      name: "New Build KfW 40 QNG",
      ort: "Ansbach",
      kurz: "€310,000, 38.3 m², completion 2027",
      adresse: "Park-Living, Wohnbaustraße, 91522 Ansbach",
      merkmale: [
        "New build to the KfW 40 QNG standard",
        "Park-Living neighbourhood development",
        "Special depreciation under Section 7b EStG in the first four years",
        "Financing eligible for KfW subsidies",
      ],
      herkunft:
        "Images, floor plans and site plan come from the documents for the Park-Living project in Ansbach. The calculation follows the available property calculation and is based on a smaller unit.",
      bildTitel: [
        "Exterior view",
        "Exterior view, second perspective",
        "Park-Living site plan",
        "Ground floor plan",
        "Upper floor plan",
        "Attic floor plan",
      ],
      kunde: [
        ["Taxable income", "€150,000"],
        ["Tax assessment", "splitting table (Splittingtabelle), joint"],
        ["Marginal tax rate", "42%"],
        ["Income tax before", "€40,728"],
        ["Goal", "tax effect and predictability"],
        ["Equity", "€17,050"],
      ],
      objekt: [
        ["Purchase price", "€310,000"],
        ["Living space", "38.30 m², Ansbach"],
        ["of which land", "€160,000, 51.61%"],
        ["of which building", "€150,000, 48.39%"],
        ["Net cold rent", "€807.70 per month, €21.09/m²"],
        ["Acquisition costs", "€17,050, from equity"],
      ],
      zeilen: [
        { pos: "Net cold rent", betrag: "+€824" },
        { pos: "Interest and repayment, bank and KfW", betrag: "−€986" },
        { pos: "Management, unit (SE) and owners' association (WEG)", betrag: "−€60" },
      ],
      beitragVorSteuer: "approx. −€222",
      afa: [
        {
          titel: "Special depreciation 5%",
          text: "Section 7b EStG, for four years, Efficiency House (Effizienzhaus) 40 with QNG",
          betrag: "€7,575 per year",
        },
        {
          titel: "Declining-balance depreciation 5%",
          text: "Section 7(5a) EStG, on the respective residual book value",
          betrag: "decreases annually",
        },
        {
          titel: "Financing interest",
          text: "bank loan 3.80% and KfW 2.50%",
          betrag: "€9,762 in the first full year",
        },
        { titel: "Management", text: "individual unit (Sondereigentum) and owners' association", betrag: "€717 per year" },
      ],
      steuerZeilen: [
        ["Net cold rent", "+€9,886"],
        ["Total depreciation, 5% plus 5%", "−€14,992"],
        ["Loan interest", "−€9,762"],
        ["Management", "−€717"],
      ],
      steuerErgebnis: "−€15,585",
      entlastungLabel: "Tax relief in the first full year",
      spaeter: {
        titel: "And from the fifth year",
        entlastungMonat: "€155",
        beitragMonat: "−€260",
        text: "After four years, the special depreciation under Section 7b expires, and at the same time repayment of the KfW loan begins. A surplus then turns back into a contribution. Anyone who only shows the first four years is selling an illusion.",
      },
      hinweis:
        "The 5 plus 5 percent are two different things: the special depreciation under Section 7b EStG over four years and the declining-balance depreciation under Section 7(5a) EStG on the residual book value. That both may be claimed alongside each other is expressly stated in Section 7b(1) sentence 1. The requirements are a building application submitted between 2023 and 2029, construction costs of no more than 5,200 euros per square metre, a depreciation base of no more than 4,000 euros per square metre, and the Efficiency House 40 standard with the QNG seal. Neither is available for renovated existing property.",
      tilgungText: "Bank 3.80% with 1.25% repayment, KfW 2.50% repayment-free for two years",
    },

    wg: {
      name: "Shared Flats and Co-Living",
      ort: "renovated",
      kurz: "€413,500, 38.33 m², shared flat",
      adresse: "Shared flat, 38.33 m², 2 rooms, 3rd floor, built in 1968, renovated",
      merkmale: [
        "Asset class: shared flat, renovated",
        "Furnished letting, room by room",
        "24-month rent guarantee on the net cold rent from the transfer of benefits and burdens",
        "Management via the owners' association (WEG) and the individual unit (Sondereigentum)",
      ],
      herkunft:
        "Purchase price, living space, net cold rent, renovation share and service charge (Hausgeld) come from the property documents. The other assumptions, such as marginal tax rate, equity and depreciation, are set as for the renovated existing property and must be checked in each individual case.",
      bildTitel: ["", "", "", "", ""],
      kunde: [
        ["Net income", "€4,600 per month"],
        ["Tax assessment", "basic tax table (Grundtabelle), single"],
        ["Marginal tax rate", "42%"],
        ["Goal", "long-term wealth building"],
        ["Equity", "€22,743"],
      ],
      objekt: [
        ["Purchase price", "€413,500"],
        ["Living space", "38.33 m², €41.74/m²"],
        ["Net cold rent", "€1,600 per month, €41.74/m²"],
        ["Gross rental yield", "4.64%"],
        ["Building share", "80%"],
        ["Incidental purchase costs", "€22,743, from equity"],
      ],
      zeilen: [
        { pos: "Net cold rent", betrag: "+€1,600" },
        { pos: "Interest and repayment", betrag: "−€1,895" },
        { pos: "Non-recoverable costs", betrag: "−€73" },
      ],
      beitragVorSteuer: "approx. −€368",
      afa: [
        {
          titel: "Building depreciation (AfA) 2%",
          text: "Section 7(4) EStG, completed between 1925 and 2022",
          betrag: "€6,980 per year",
        },
        {
          titel: "Financing interest",
          text: "Section 9(1) sentence 3 no. 1 EStG, deductible in full",
          betrag: "€16,540 in the first year",
        },
        { titel: "Management fee", text: "immediately deductible, unlike the reserve", betrag: "€480 per year" },
        { titel: "Maintenance expenses", text: "one-off, below the 15 percent threshold", betrag: "€30,800 one-off" },
      ],
      steuerZeilen: [
        ["Net cold rent", "+€19,200"],
        ["Building depreciation 2%", "−€6,980"],
        ["Loan interest", "−€16,540"],
        ["Management fee", "−€480"],
        ["Maintenance expenses", "−€30,800"],
      ],
      steuerErgebnis: "−€35,600",
      entlastungLabel: "Tax relief in the first year",
      spaeter: {
        titel: "And from the second year",
        entlastungMonat: "€168",
        beitragMonat: "−€200",
        text: "Without the one-off maintenance expenses, the taxable result is −4,800 euros, which means around 2,016 euros of tax relief per year. The large effect of the first year happens exactly once.",
      },
      hinweis:
        "Four individually let rooms bring the highest rent per square metre, but also the highest effort: four tenancies, more tenant changes, furniture that has to be replaced, and a property manager who must master co-living. Whether the renovation share is immediately deductible in full, or whether Section 6(1) no. 1a EStG applies and it becomes production costs (Herstellungskosten), is decided by the tax office, not by the seller. This calculation is therefore no substitute for a conversation with your tax adviser. Note: with a remaining useful life appraisal (Restnutzungsdauergutachten), building depreciation can be significantly higher in many cases. This further increases the tax effect.",
      tilgungText: "4% interest, 1.5% initial repayment",
    },
  },

  rechnung: {
    titel: "The calculation, [[line by line]]",
    vorspann: (name: string, tilgungText: string) => `${name}. ${tilgungText}. None of it is embellished.`,
    beitragVorSteuer: "Your monthly contribution before tax",
    entlastungProMonat: "Tax relief per month",
    tilgungProMonat: "Average repayment per month",
    tilgungHinweis: "This is not an expense, it is your wealth.",
  },

  schere: {
    kicker: "After ten years",
    titel: "What you own in the end",
    vermoegensaufbau: "Wealth built",
    kaufpreis: "Purchase price",
    laufzeit: "Period",
    jahre: (anzahl: number) => `${anzahl} years`,
    immobilienwert: "Property value",
    vermoegen: "Your wealth",
    restschuld: "Remaining debt to the bank",
    getilgt: (betrag: number) => `${eEn(betrag)} repaid`,
    regler: "Assumed increase in value per year",
    reglerNull: "Feel free to drag the slider all the way to zero.",
    selbstDann: "Even then,",
    selbstDannRest:
      "remains, because repayment continues regardless of how the value develops. Anything above that is a bonus, not the foundation.",
    haftung:
      "Non-binding sample calculation assuming constant interest and constant rent. Incidental purchase costs, selling costs, maintenance and loss of rent are not included. For property held as private assets (Privatvermögen), a sale after more than ten years is tax-free under Section 23 of the German Income Tax Act (§ 23 EStG); the period runs from the date of the notarised purchase contract. An increase in value is not guaranteed.",
  },

  rendite: {
    titel: "What a savings plan [[would have to deliver]]",
    vorspann:
      "Building the same wealth by saving alone requires a return that hardly any investment delivers net and tax-free. This section calculates exactly that for your concept.",
    weg: "From your investment to your final wealth",
    ek: "Equity, one-off",
    cashflow: "Monthly cash flow after tax × 120 months",
    vermoegen10: "Your wealth after ten years",
    endText: (getilgt: number, wertsteigerung: number) =>
      `Final wealth follows the same slider as the chart above: ${eEn(getilgt)} of repaid loan plus the assumed increase in value of ${zEn(wertsteigerung, 1)} percent per year.`,
    live: "If you move the slider there, this figure updates live.",
    noetig: "Required savings plan return per year",
    netto: "net, tax-free",
    soViel:
      "This is what a savings plan would have to yield year after year to reach the same wealth with the same investment.",
    bedeutet: "What this means for you:",
    bedeutetText: (eigenkapital: number, sparrate: number, rendite: number) =>
      `Equity of ${eEn(eigenkapital)} plus a monthly after-tax cash flow of ${eEn(sparrate)} results in a return of ${zEn(rendite, 1)} percent, net and tax-free.`,
    steuerfrei:
      "Tax-free, because for private assets a sale after more than ten years is tax-free under § 23 EStG.",
    versteuern:
      "You would have to pay tax on the return of a savings plan, so to be left with the same amount net, the required return before tax would be even higher.",
  },

  steuer: {
    titel: "The tax effect, [[item by item]]",
    vorspann:
      "The tax you pay anyway currently flows out without anything remaining for you. A rented property changes where part of it goes.",
    vuv: "Income from letting and leasing (Vermietung und Verpachtung)",
    ergebnis: "Taxable result",
    beiGrenzsteuersatz: "At a marginal tax rate of 42 percent, this results in",
    proJahr: "per year",
    alsoRund: (monat: number, label: string) => `so around ${eEn(monat)} per month. ${label}.`,
    entlastung: "Tax relief",
    beitrag: "Your contribution",
    proMonat: "per month",
    ehrlich: "What we honestly point out",
    haftung:
      "Non-binding sample calculation. The exact effect depends on your personal tax rate and on recognition by the tax authorities, and is a matter for your tax adviser. Anyone who promises you otherwise is just dressing up the numbers.",
  },

  pruefung: {
    titel: "What we check for [[every]] property",
    vorspann: "This list is the reason why we do not show you every flat that comes onto the market.",
    katalog: [
      "Location and housing demand",
      "realistic rent level",
      "purchase price and comparable prices",
      "condition of the property",
      "documents of the owners' association and reserves",
      "non-recoverable costs",
      "possible renovation risks",
      "financing and monthly burden",
      "tax planning options",
      "long-term resale potential",
    ],
  },

  rueckblick: {
    nummer: "Your answers",
    titel: "What [[you]] told us today",
    vorspann: "A short summary, so that we can both be sure I have understood you correctly.",
    ziele: "Your goals",
    ziel: "Your most important goal",
    rahmen: "Your financing capacity",
    rund: (betrag: number) => `around ${eEn(betrag)}`,
    beitrag: "Your monthly contribution",
    erfahrung: "Your experience with real estate",
    wichtig: "What matters most to you",
    erwartung: "Your expectation for today's conversation",
    erfuellt: "Have we met this expectation in today's conversation?",
    zahlen1: "That is exactly why we now need your complete figures.",
    zahlen2: "Everything you said above is half of the self-disclosure.",
    zahlen3:
      "We will fill in the rest together in a moment, so that the next appointment works with your figures instead of an example.",
  },

  schritt: {
    titel: "We take the next step [[together, now]]",
    text: "We will fill in your self-disclosure together, right here in this meeting. Not as homework, not by email afterwards, but now, while I can answer your questions straight away.",
    erfassen: "What we record together",
    inhalt: [
      "Income and employment situation",
      "monthly expenses",
      "existing loans",
      "equity and reserves",
      "property ownership",
      "desired monthly contribution",
      "personal goals",
    ],
    warum: "Why right now",
    warumText:
      "Without this information, every property proposal is guesswork. With it, at the next appointment you will receive a calculation based on your figures instead of an example. The self-disclosure is expressly not yet a purchase decision and does not commit you to anything.",
    knopf: "Fill in the self-disclosure together now",
    kontextHinweis:
      "When opened from the client profile, the self-disclosure is linked directly to this client and investment.",
    grundlage:
      "The self-disclosure is the basis for step 17. Without it there is no specific property proposal and no personal calculation, only another example.",
  },

  termin: {
    titel: "What you get at the [[next appointment]]",
    vorspann:
      "Your self-disclosure is the basis on which we prepare internally for exactly these points. When we meet again, your personal strategy, suitable properties and the fully calculated figures will already be on the table, tailored to you. Six things, concrete and calculated on your figures.",
    punkte: [
      "a specific property proposal",
      "a clear profitability calculation",
      "a personal cash flow calculation",
      "an assessment of the possible tax effect",
      "a possible financing proposal",
      "a clear analysis of opportunities and risks",
    ],
    katalog:
      "None of this comes from a catalogue. Each of these six points is prepared for you from your self-disclosure before we meet again. So at the next appointment, the question is no longer whether a property works for you, but which one.",
    entscheiden: "Then you decide in your own time: is this property right for you,",
    weiter: "or do we keep looking?",
    beides:
      "Both are a good outcome. We would rather hear a no to the wrong property than a yes that you regret in two years.",
    knopf: "Fill in the self-disclosure",
  },

  fuss: {
    haftung:
      "All figures in this presentation are for illustration purposes. The tax effect depends on your personal situation and must be reviewed with a tax adviser. An increase in value is not guaranteed.",
  },

  galerie: {
    zurueck: "Previous image",
    weiter: "Next image",
  },

  zielLabel: (id: string) => ANLAGE_ZIELE_EN[id] ?? ANLAGE_ZIELE.find((z) => z.id === id)?.label ?? id,
};

export const BERATUNG_TEXTE: Record<PraesentationsSprache, BeratungTexte> = { de, en };

/** Löst einen Text in der aktiven Anrede auf. Englische Texte sind immer schon fertig. */
export function inAnrede(wert: AnredeWert, anrede: "du" | "sie"): string {
  return typeof wert === "string" ? wert : wert[anrede];
}

/**
 * Beträge, Zahlen und Prozent in der Sprache der Präsentation, damit die Seite
 * nirgends selbst mit "de-DE" formatiert.
 */
export const formatierer = (sprache: PraesentationsSprache) => ({
  euro: (n: number, nachkomma = 0) => euroText(n, sprache, nachkomma),
  zahl: (n: number, nachkomma = 0) => zahlText(n, sprache, nachkomma),
  prozent: (n: number, nachkomma = 1) => prozentText(n, sprache, nachkomma),
});
