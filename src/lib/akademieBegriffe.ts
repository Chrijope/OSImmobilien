// Begriffsliste der Vertriebsakademie.
//
// Diese Datei enthält ausschließlich Inhalt, keine Logik. Die Erkennung im
// Lehrtext steht in `akademieBegriffeErkennung.ts`, die Darstellung in
// `components/vertriebsakademie/BegriffsText.tsx`.
//
// Redaktionelle Regeln für neue Einträge:
//   - Ein Satz Erklärung, kein Aufsatz. Der Kasten ist ein Popover, keine Seite.
//   - Mehrdeutige Alltagswörter wie „Faktor“ gehören nicht in die Liste,
//     sonst wird harmloser Fließtext markiert.
//   - Zusammensetzungen, die eine eigene Bedeutung haben, bekommen einen
//     eigenen Eintrag („Sonder-AfA“ neben „AfA“). Der längere Eintrag gewinnt.
//   - Beugungen und weitere Schreibweisen kommen in `schreibweisen`.
//   - Die Liste bleibt klein. Das große `src/data/lexikon.json` (208 KB) darf
//     nicht in die Kapitelroute wandern, die per `lazyRoute` geladen wird.

export type AkademieBegriff = {
  /** Der Begriff in der Grundform. */
  begriff: string;
  /** Weitere Schreibweisen und Beugungen, die denselben Eintrag treffen. */
  schreibweisen?: readonly string[];
  /** Ein Satz Klartext. */
  erklaerung: string;
  /** Ein Satz, warum das im Verkauf zählt. Optional. */
  imVerkauf?: string;
  /** Sprungziel für die ausführliche Fassung, etwa ins Glossar-Kapitel. */
  mehr?: string;
};

// Bewusst nicht aufgenommen und warum, damit es niemand nachträgt:
//   - „Faktor“: meint im Lehrtext mal die Kennzahl Kaufpreis durch Jahresmiete,
//     mal den Faktor 1,2 der Kapitaldienstfähigkeit, mal „ein wichtiger Faktor“.
//   - „Hebel“: steht überwiegend bildlich („der stärkste Hebel“). Der Eintrag
//     heißt deshalb „Leverage“.
//   - „Beleihung“ allein: bedeutet die Belastung des Grundstücks, nicht den
//     Beleihungsauslauf. Zwei verschiedene Dinge, ein Wort.
//   - „WEG“ als reine Abkürzung: die Erkennung vergleicht kleingeschrieben,
//     und das Wort „weg“ steht rund 80 mal harmlos im Text. Der Eintrag heißt
//     deshalb „Wohnungseigentümergemeinschaft“ und trägt die eindeutigen
//     Zusammensetzungen als Schreibweisen.
//   - „Nutzen“ allein: siehe „Nutzen- und Lastenwechsel“.

export const AKADEMIE_BEGRIFFE: readonly AkademieBegriff[] = [
  // ---------------------------------------------------------------- Steuer
  {
    begriff: "AfA",
    schreibweisen: ["Absetzung für Abnutzung", "Abschreibung", "Abschreibungen", "Gebäude-AfA", "AfA-Satz", "AfA-Sätze"],
    erklaerung:
      "Absetzung für Abnutzung: Der Kaufpreis des Gebäudes wird nach Paragraf 7 Einkommensteuergesetz über viele Jahre in Teilbeträgen von den Mieteinnahmen abgezogen. Der Anteil für Grund und Boden bleibt außen vor, weil Boden sich nicht abnutzt.",
    imVerkauf:
      "Sie senkt die Steuer, ohne dass Geld abfließt. Wer diesen einen Punkt erklären kann, hat den Kern der Rechnung erklärt.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=afa",
  },
  {
    begriff: "Gebäudeanteil",
    schreibweisen: ["Gebäudeanteils", "Gebäudewert"],
    erklaerung:
      "Der Teil des Kaufpreises, der auf das Gebäude entfällt und nicht auf den Grund und Boden. Nur dieser Teil wird abgeschrieben. Die Aufteilung richtet sich nach dem Einzelfall, üblich sind Bodenrichtwert oder Gutachten.",
    imVerkauf:
      "Ohne diesen Anteil fällt jede Steuerrechnung um 20 bis 40 Prozent zu hoch aus. Er gehört in jede Zahl, die du dem Kunden nennst.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=afa",
  },
  {
    begriff: "Bodenrichtwert",
    schreibweisen: ["Bodenrichtwerte", "Bodenrichtwerts"],
    erklaerung:
      "Der durchschnittliche Lagewert eines Quadratmeters Boden, den die amtlichen Gutachterausschüsse nach Paragraf 196 Baugesetzbuch veröffentlichen. Er ist ein Anhaltspunkt für die Aufteilung des Kaufpreises, kein Preis für das einzelne Grundstück.",
    imVerkauf:
      "Er ist die nachprüfbare Quelle, wenn der Kunde fragt, woher die Aufteilung zwischen Boden und Gebäude kommt.",
  },
  {
    begriff: "Grenzsteuersatz",
    schreibweisen: ["Grenzsteuersatzes", "Grenzsteuersätze"],
    erklaerung:
      "Der Steuersatz auf den zuletzt verdienten Euro, nicht der Durchschnitt über das ganze Einkommen. Sinkt das zu versteuernde Einkommen, wirkt die Entlastung mit genau diesem Satz.",
    imVerkauf:
      "Er beantwortet die Frage, was eine Abschreibung diesem einen Kunden bringt. Ohne ihn ist jede genannte Steuerersparnis geraten.",
  },
  {
    begriff: "Werbungskosten",
    erklaerung:
      "Ausgaben, die mit den Mieteinnahmen zusammenhängen und nach Paragraf 9 Einkommensteuergesetz von ihnen abgezogen werden, zum Beispiel Schuldzinsen, Abschreibung, Verwaltervergütung, Grundsteuer und Versicherung. Die Tilgung gehört nicht dazu.",
    imVerkauf:
      "Der häufigste Irrtum im Gespräch ist, die ganze Rate sei absetzbar. Absetzbar ist der Zinsanteil, nicht die Rückzahlung.",
  },
  {
    begriff: "Sonder-AfA",
    schreibweisen: ["Sonderabschreibung", "Sonderabschreibungen", "Sonder-AfA nach § 7b", "Sonder-Abschreibung"],
    erklaerung:
      "Eine zusätzliche Abschreibung für neu geschaffenen Mietwohnraum nach Paragraf 7b Einkommensteuergesetz, neben der normalen Abschreibung. Sie hängt an engen Voraussetzungen, unter anderem am Zeitpunkt des Bauantrags, an Baukostengrenzen, am Energiestandard und an der Vermietung zu Wohnzwecken.",
    imVerkauf:
      "Das Wort „förderfähig“ im Exposé entscheidet über mehrere tausend Euro im Jahr. Nenne die Voraussetzung mit, sonst versprichst du etwas, das im Einzelfall nicht gilt.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=afa",
  },
  {
    begriff: "degressive AfA",
    schreibweisen: ["degressive Abschreibung", "degressiven AfA", "degressiv"],
    erklaerung:
      "Eine Abschreibung, die nicht jedes Jahr gleich hoch ist, sondern in Prozent vom jeweiligen Restwert gerechnet wird: am Anfang hoch, dann sinkend. Für Wohngebäude ist sie nach Paragraf 7 Absatz 5a Einkommensteuergesetz nur bei Baubeginn in einem befristeten Zeitfenster möglich.",
    imVerkauf:
      "Wer in der Beratungspräsentation „5 plus 5 Prozent“ hört, sieht hier zwei verschiedene Dinge: die Sonderabschreibung und diese Form der normalen Abschreibung.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=afa",
  },
  {
    begriff: "Denkmal-AfA",
    schreibweisen: ["Denkmalabschreibung", "Denkmal-Abschreibung", "erhöhte Absetzungen"],
    erklaerung:
      "Erhöhte Abschreibung auf den Sanierungsanteil eines Baudenkmals nach Paragraf 7i Einkommensteuergesetz, bei Vermietung 9 Prozent in den ersten acht und 7 Prozent in den vier folgenden Jahren. Voraussetzung ist eine Bescheinigung der Denkmalbehörde. Paragraf 7h regelt dasselbe für förmlich festgelegte Sanierungsgebiete.",
    imVerkauf:
      "Die hohen Sätze gelten nur auf den Sanierungsanteil, nicht auf den ganzen Kaufpreis. Genau dort entsteht sonst die Enttäuschung im zweiten Gespräch.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=afa",
  },
  {
    begriff: "Restnutzungsdauer",
    schreibweisen: ["Restnutzungsdauergutachten", "Restnutzungsdauer-Gutachten"],
    erklaerung:
      "Die Zeit, die ein Gebäude wirtschaftlich noch nutzbar ist. Weist ein Gutachten eine kürzere Dauer nach als die pauschal unterstellte, kann die jährliche Abschreibung nach Paragraf 7 Absatz 4 Satz 2 Einkommensteuergesetz höher ausfallen. Das Finanzamt prüft das im Einzelfall.",
    imVerkauf:
      "Bei älterem Bestand ist das der Unterschied zwischen 2 Prozent und deutlich mehr. Versprich das Ergebnis nicht, nenne die Möglichkeit.",
  },
  {
    begriff: "Erhaltungsaufwand",
    schreibweisen: ["Erhaltungsaufwendungen", "Erhaltungsaufwands"],
    erklaerung:
      "Ausgaben, die etwas Vorhandenes instand setzen oder ersetzen, zum Beispiel eine neue Heizung an der Stelle der alten. Bei Vermietung sind sie im Jahr der Zahlung in voller Höhe abziehbar.",
    imVerkauf:
      "Ob eine Rechnung Erhaltungsaufwand ist oder nicht, entscheidet, ob die Entlastung sofort kommt oder sich über Jahrzehnte verteilt.",
  },
  {
    begriff: "Herstellungskosten",
    erklaerung:
      "Ausgaben, die etwas Neues schaffen, den Standard deutlich heben oder die Fläche vergrößern (Paragraf 255 Absatz 2 Handelsgesetzbuch). Sie wirken nicht sofort, sondern erhöhen die Grundlage der jährlichen Abschreibung.",
    imVerkauf:
      "Das ist die andere Hälfte der Frage „sofort abziehbar oder über die Abschreibung“. Wer beide Wörter kennt, kann die Steuerwirkung des ersten Jahres erklären.",
  },
  {
    begriff: "anschaffungsnahe Herstellungskosten",
    schreibweisen: ["anschaffungsnah", "anschaffungsnahe Aufwendungen", "15-Prozent-Grenze", "15 %-Grenze"],
    erklaerung:
      "Wer in den ersten drei Jahren nach dem Kauf mehr als 15 Prozent der Anschaffungskosten des Gebäudes ohne Umsatzsteuer für Instandsetzung und Modernisierung ausgibt, muss diese Kosten nach Paragraf 6 Absatz 1 Nummer 1a Einkommensteuergesetz abschreiben statt sofort abziehen. Jährlich übliche Erhaltungsarbeiten zählen nicht mit.",
    imVerkauf:
      "Ein Bestandskäufer, der gleich nach dem Kauf renoviert, verliert sonst die Entlastung, mit der die Rechnung im Gespräch aufgeht.",
  },
  {
    begriff: "Spekulationsfrist",
    schreibweisen: ["Spekulationssteuer", "Zehnjahresfrist", "Haltefrist"],
    erklaerung:
      "Zehn Jahre zwischen Kauf und Verkauf: Danach bleibt der Gewinn aus einem privaten Verkauf nach Paragraf 23 Einkommensteuergesetz steuerfrei. Bei Selbstnutzung gelten kürzere Fristen, bei gewerblichem Grundstückshandel gilt die Befreiung nicht.",
    imVerkauf:
      "Sie ist der Grund, warum in der Beratung von zehn Jahren die Rede ist und nicht von fünf oder fünfzehn.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=steuerfristen",
  },
  {
    begriff: "nicht umlagefähige Kosten",
    schreibweisen: [
      "nicht umlagefähigen Kosten",
      "nicht-umlagefähige Kosten",
      "nicht-umlagefähigen Kosten",
      "nicht umlagefähige Nebenkosten",
      "nicht umlagefähig",
      "nicht umlagefähige",
    ],
    erklaerung:
      "Betriebskosten, die der Eigentümer selbst trägt und nach Paragraf 1 Absatz 2 Betriebskostenverordnung nicht auf den Mieter umlegen darf, vor allem die Verwaltervergütung und die Instandhaltung.",
    imVerkauf:
      "Dieser Posten verschiebt eine schöne Rechnung um 100 bis 200 Euro im Monat. Wer ihn von sich aus nennt, nimmt dem Kunden die spätere Überraschung.",
  },
  {
    begriff: "Anlage V",
    schreibweisen: ["Anlage V (Vermietung & Verpachtung)", "Anlage V und V"],
    erklaerung:
      "Der Teil der Einkommensteuererklärung für Einkünfte aus Vermietung und Verpachtung. Dort stehen die Mieteinnahmen auf der einen und die Werbungskosten auf der anderen Seite.",
    imVerkauf:
      "Der Bescheid nach der ersten Anlage V ist der Moment, in dem der Kunde die versprochene Entlastung schwarz auf weiß sieht.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=steuerfristen",
  },
  {
    begriff: "stille Reserven",
    schreibweisen: ["stillen Reserven", "stille Reserve"],
    erklaerung:
      "Der Unterschied zwischen dem Wert, mit dem ein Wirtschaftsgut in den Büchern steht, und seinem tatsächlichen Wert. Er entsteht durch Abschreibung und Wertsteigerung und wird erst beim Verkauf sichtbar.",
    imVerkauf:
      "Ohne dieses Wort bleibt Paragraf 6b Einkommensteuergesetz eine Vokabel zum Auswendiglernen statt einer Sache, die man erklären kann.",
  },
  {
    begriff: "Privatvermögen",
    schreibweisen: ["Privatvermögens", "im Privatvermögen"],
    erklaerung:
      "Immobilien, die eine Privatperson außerhalb eines Betriebs hält. Die Mieten zählen dort zu den Einkünften aus Vermietung und Verpachtung, und ein Verkauf ist nach Ablauf der Spekulationsfrist regelmäßig steuerfrei.",
  },
  {
    begriff: "Betriebsvermögen",
    schreibweisen: ["Betriebsvermögens", "im Betriebsvermögen"],
    erklaerung:
      "Immobilien, die zu einem Betrieb oder einer Gesellschaft gehören. Ein Verkauf ist dort unabhängig von einer Haltefrist steuerpflichtig, dafür sind andere Gestaltungen möglich. Welche Folgen im Einzelfall entstehen, gehört zum Steuerberater.",
    imVerkauf:
      "Der Vergleich „GmbH gegen privat“ endet ohne diesen Unterschied bei einer Zahl, die den Verkauf und die Ausschüttung ausblendet.",
  },
  {
    begriff: "3-Objekt-Grenze",
    schreibweisen: ["Drei-Objekt-Grenze", "gewerblicher Grundstückshandel", "gewerblichen Grundstückshandel"],
    erklaerung:
      "Keine Vorschrift, sondern eine Leitlinie aus der Rechtsprechung des Bundesfinanzhofs: Wer innerhalb von etwa fünf Jahren mehr als drei Objekte kauft und wieder verkauft, gilt regelmäßig als gewerblicher Händler. Es ist ein Anhaltspunkt, im Einzelfall kann auch weniger genügen.",
    imVerkauf:
      "Aktive Vermittler mit eigenem Bestand laufen selbst hinein. Wer das anspricht, wirkt vorsichtig statt ahnungslos.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=steuerfristen",
  },
  {
    begriff: "Grunderwerbsteuer",
    schreibweisen: ["GrESt", "Grunderwerbssteuer", "GrESt-Anzeige"],
    erklaerung:
      "Steuer auf den Erwerb eines Grundstücks nach dem Grunderwerbsteuergesetz. Den Satz legt jedes Bundesland selbst fest, er reicht derzeit von 3,5 bis 6,5 Prozent des Kaufpreises. Der Notar zeigt den Kauf beim Finanzamt an.",
    imVerkauf:
      "Sie ist der größte Einzelposten der Kaufnebenkosten und der Grund, warum dieselbe Wohnung in zwei Bundesländern unterschiedlich viel Eigenkapital verlangt.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=grunderwerbsteuer",
  },
  {
    begriff: "Kaufnebenkosten",
    schreibweisen: ["KNK", "Kaufnebenkosten (KNK)", "Erwerbsnebenkosten", "Ankaufsnebenkosten"],
    erklaerung:
      "Die Kosten neben dem Kaufpreis: Grunderwerbsteuer, Notar, Grundbuch und gegebenenfalls Makler. Zusammen sind es je nach Bundesland und Vermittlungsweg meist 8 bis 12 Prozent. Sie sind nicht sofort absetzbar, sondern erhöhen die Grundlage der Abschreibung.",
    imVerkauf:
      "Banken finanzieren sie oft nicht mit. Das ist der Betrag, den der Kunde bar braucht, und die häufigste Fehlannahme im Erstgespräch.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=notar-knk",
  },

  // ----------------------------------------------------------- Finanzierung
  {
    begriff: "Belastungsvollmacht",
    schreibweisen: ["Belastungsvollmachten", "Finanzierungsvollmacht"],
    erklaerung:
      "Die Erlaubnis des Verkäufers, das noch ihm gehörende Grundstück schon vor der Umschreibung mit der Grundschuld der Käuferbank zu belasten. Sie steht im Kaufvertrag und wird mit beurkundet.",
    imVerkauf:
      "Ohne sie kann die Bank nicht auszahlen, denn sie braucht ihre Sicherheit im Grundbuch, bevor das Geld fließt. Sie ist der Grund, warum Kaufvertrag und Finanzierung zeitlich ineinandergreifen.",
  },
  {
    begriff: "QNG",
    schreibweisen: ["Qualitätssiegel Nachhaltiges Gebäude", "QNG-Siegel"],
    erklaerung:
      "Qualitätssiegel Nachhaltiges Gebäude: ein staatliches Siegel des Bundesbauministeriums, das ein Gebäude über den reinen Energieverbrauch hinaus bewertet, etwa Baustoffe, Rückbaufähigkeit und Innenraumluft. Es wird von zugelassenen Stellen vergeben.",
    imVerkauf:
      "Es entscheidet über die Förderhöhe: Die höchste KfW-Stufe der Klimafreundlichen Neubauförderung gibt es nur mit QNG, ohne Siegel bleibt der Kredit kleiner.",
  },
  {
    begriff: "Beleihungswert",
    schreibweisen: ["Beleihungswerts", "Beleihungswertes"],
    erklaerung:
      "Der Wert, den die Bank einer Immobilie dauerhaft zutraut, bewusst vorsichtiger angesetzt als der Kaufpreis. Er ist die Grundlage der Kreditentscheidung, nicht der Preis, den der Käufer zahlt.",
    imVerkauf:
      "Er erklärt, warum zwei Banken bei demselben Kaufpreis unterschiedlich viel finanzieren.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Beleihungsauslauf",
    schreibweisen: ["LTV", "Loan-to-Value", "Loan to Value", "Beleihungsauslaufs"],
    erklaerung:
      "Der Anteil des Darlehens am Wert der Immobilie. Je niedriger er ist, desto günstiger ist meist der Zins. Gerechnet wird Darlehen geteilt durch Beleihungswert; die englische Abkürzung LTV bezieht sich je nach Bank auf den Kaufpreis, deshalb lohnt die Rückfrage, worauf sich eine genannte Zahl bezieht.",
    imVerkauf:
      "Aus ihm folgt der Zinsaufschlag. Wer ihn kennt, kann erklären, was 10.000 Euro mehr Eigenkapital an der Rate ändern.",
  },
  {
    begriff: "Annuität",
    schreibweisen: ["Annuitäten", "Annuitätendarlehen", "Annuitätsformel"],
    erklaerung:
      "Die gleichbleibende Rate aus Zins und Tilgung. Sie bleibt über die Zinsbindung konstant, während der Zinsanteil von Monat zu Monat sinkt und der Tilgungsanteil im selben Maß steigt.",
    imVerkauf:
      "Die Faustformel für die Startrate lautet Darlehen mal Zins plus Tilgung, geteilt durch 12. Damit rechnest du im Gespräch mit.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=finanzierung-zahlen",
  },
  {
    begriff: "Tilgung",
    schreibweisen: ["Tilgungen", "anfängliche Tilgung", "Tilgungssatz", "Tilgungsanteil"],
    erklaerung:
      "Der Teil der Rate, mit dem das Darlehen zurückgezahlt wird. Er senkt die Restschuld, ist aber kein Aufwand und deshalb nicht von der Steuer absetzbar.",
    imVerkauf:
      "„Die Rate ist absetzbar“ ist falsch und fällt beim Steuerberater sofort auf. Absetzbar ist der Zins, nicht die Rückzahlung.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=finanzierung-zahlen",
  },
  {
    begriff: "Kapitaldienstfähigkeit",
    schreibweisen: ["kapitaldienstfähig", "Kapitaldienst", "Kapitaldienstrechnung"],
    erklaerung:
      "Die Prüfung der Bank, ob das Einkommen die neue Rate dauerhaft trägt. Vom Haushaltsnetto werden Lebenshaltung, laufende Kredite und die selbst gezahlte Miete abgezogen; die erwartete Mieteinnahme des Objekts rechnet die Bank nur zu einem Teil an. Die Pauschalen setzt jedes Haus selbst.",
    imVerkauf:
      "Sie entscheidet vor allem anderen, ob der Kunde überhaupt kaufen kann. Deshalb steht sie am Anfang und nicht am Ende.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=finanzierung-zahlen",
  },
  {
    begriff: "Zinsbindung",
    schreibweisen: ["Zinsbindungsfrist", "Sollzinsbindung", "Zinsfestschreibung"],
    erklaerung:
      "Der Zeitraum, für den der vereinbarte Zinssatz fest gilt. Danach wird zum dann geltenden Zins weiterfinanziert, oder das Darlehen ist bereits zurückgezahlt.",
    imVerkauf:
      "Die Frage „und was ist danach?“ kommt in fast jedem Bankgespräch. Die Antwort steht beim Sonderkündigungsrecht nach Paragraf 489 BGB.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=finanzierung-zahlen",
  },
  {
    begriff: "Sollzins",
    schreibweisen: ["Sollzinssatz", "Nominalzins"],
    erklaerung:
      "Der Zinssatz, mit dem die Bank die Restschuld verzinst. Er steckt in der Rate und ist die Zahl, mit der die Ratenformel rechnet.",
  },
  {
    begriff: "Effektivzins",
    schreibweisen: ["effektiver Jahreszins", "effektiven Jahreszins", "Effektivzinssatz", "effektive Jahreszins"],
    erklaerung:
      "Der Jahreszins einschließlich der Kosten, die zur Kreditaufnahme gehören. Wie er zu berechnen ist, regelt die Preisangabenverordnung. Er dient dem Vergleich von Angeboten und liegt deshalb meist über dem Sollzins.",
    imVerkauf:
      "Wer beide Zahlen verwechselt, rechnet dem Kunden eine Rate vor, die das Angebot nicht hergibt.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Sonderkündigungsrecht nach § 489 BGB",
    schreibweisen: ["§ 489 BGB", "Paragraf 489 BGB", "489 BGB", "Sonderkündigungsrecht"],
    erklaerung:
      "Ein Darlehen mit festem Zins kann der Darlehensnehmer nach Paragraf 489 Absatz 1 Nummer 2 BGB zehn Jahre nach vollständigem Empfang mit sechs Monaten Frist kündigen, ohne Vorfälligkeitsentschädigung. Das gilt unabhängig davon, wie lange die Zinsbindung noch läuft.",
    imVerkauf:
      "Es beantwortet die häufigste Sorge bei einer langen Zinsbindung: gebunden ist der Kunde faktisch zehn Jahre, nicht zwanzig.",
  },
  {
    begriff: "Bereitstellungszinsen",
    schreibweisen: ["Bereitstellungszins", "bereitstellungsfreie Zeit", "zinsfreie Bereitstellung"],
    erklaerung:
      "Eine Gebühr dafür, dass die Bank einen bewilligten Kreditteil bereithält, den der Kunde noch nicht abgerufen hat. Sie fällt vor allem beim Neubau an, weil dort nach Baufortschritt gezahlt wird, und beginnt erst nach einer bereitstellungsfreien Zeit, die im Vertrag steht.",
    imVerkauf:
      "Die Länge dieser freien Zeit ist verhandelbar und bei langer Bauzeit oft mehr wert als ein Zehntelprozent beim Zins.",
  },
  {
    begriff: "Volltilger",
    schreibweisen: ["Volltilgerdarlehen", "Volltilgung", "Volltilger-Darlehen"],
    erklaerung:
      "Ein Darlehen, das am Ende der Zinsbindung vollständig zurückgezahlt ist. Es gibt kein Anschlussdarlehen und damit kein Zinsänderungsrisiko, dafür ist die Rate höher.",
  },
  {
    begriff: "Sondertilgung",
    schreibweisen: ["Sondertilgungen", "Sondertilgungsrecht", "Sondertilgungsrechte"],
    erklaerung:
      "Eine zusätzliche Rückzahlung außerhalb der laufenden Rate. Sie ist nur möglich, wenn der Vertrag sie ausdrücklich erlaubt; üblich ist ein jährliches Recht auf einen Prozentsatz der ursprünglichen Darlehenssumme.",
    imVerkauf:
      "Sie kostet die Bank wenig und ist deshalb einer der leichtesten Verhandlungspunkte im Finanzierungsgespräch.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=finanzierung-zahlen",
  },
  {
    begriff: "Forward-Darlehen",
    schreibweisen: ["Forwarddarlehen", "Forward-Aufschlag", "Forward"],
    erklaerung:
      "Ein Darlehen, dessen Zins heute festgelegt wird, obwohl es erst in einigen Jahren ausgezahlt wird. Für die Wartezeit verlangt die Bank einen Aufschlag, und der Kunde ist zur Abnahme verpflichtet.",
    imVerkauf:
      "Es schützt vor steigenden Zinsen und kostet, wenn die Zinsen fallen. Beides gehört in denselben Satz.",
  },
  {
    begriff: "Anschlussfinanzierung",
    schreibweisen: ["Anschlussdarlehen", "Prolongation"],
    erklaerung:
      "Das Darlehen, das nach dem Ende der Zinsbindung an die Stelle des alten tritt, zum dann geltenden Zins. Bleibt es bei derselben Bank, heißt es Prolongation.",
  },
  {
    begriff: "Leverage",
    schreibweisen: ["Leverage-Effekt", "Hebelwirkung", "Leverage-Wirkung"],
    erklaerung:
      "Der Effekt, dass ein kleiner Eigenkapitaleinsatz die Rendite auf dieses Eigenkapital vergrößert, weil die Bank den Rest finanziert und nur ihren Zins bekommt. Er wirkt in beide Richtungen: Fällt der Wert, fällt er ebenso vervielfacht auf das eingesetzte Geld.",
    imVerkauf:
      "Nur mit der zweiten Hälfte des Satzes ist die Aussage vollständig. Ein Kunde, der später nur die Hälfte gehört hat, fühlt sich getäuscht.",
  },
  {
    begriff: "KfW",
    schreibweisen: ["Kreditanstalt für Wiederaufbau", "KfW-Förderung", "KfW-Darlehen"],
    erklaerung:
      "Kreditanstalt für Wiederaufbau, eine staatliche Förderbank. Sie vergibt zinsvergünstigte Darlehen und Zuschüsse über die Hausbank. Welche Programme für eine vermietete Wohnung offenstehen, hängt vom einzelnen Programm ab und ändert sich häufig.",
    imVerkauf:
      "Eine Förderzusage ist erst dann eine, wenn Programm, Stand und Voraussetzung dabeistehen. Sonst steht das Versprechen ohne Deckung im Raum.",
  },
  {
    begriff: "Bonität",
    erklaerung:
      "Die Einschätzung, wie zuverlässig jemand einen Kredit zurückzahlt. Sie ergibt sich aus Einkommen, laufenden Verpflichtungen, Vermögen und dem Zahlungsverhalten der Vergangenheit.",
  },
  {
    begriff: "SCHUFA",
    schreibweisen: ["Schufa-Auskunft", "SCHUFA-Score"],
    erklaerung:
      "Eine private Auskunftei, die Daten über das Zahlungsverhalten von Verbrauchern sammelt. Banken fragen sie vor einer Kreditzusage ab. Nach Artikel 15 Datenschutz-Grundverordnung kann jede Person Auskunft über die zu ihr gespeicherten Daten verlangen.",
    imVerkauf:
      "Ein alter Negativeintrag kippt die Finanzierung spät. Wer früh danach fragt, verliert keine Wochen.",
  },
  {
    begriff: "Selbstauskunft",
    schreibweisen: ["Selbstauskünfte", "Bank-Selbstauskunft"],
    erklaerung:
      "Das Formular, in dem der Kunde der Bank Einkommen, Ausgaben, Vermögen und Verbindlichkeiten offenlegt. Es ist die Grundlage der Kreditentscheidung, und unrichtige Angaben können den Vertrag gefährden.",
    imVerkauf:
      "Sie ist der erste verbindliche Schritt des Kunden und damit ein ehrlicher Prüfstein für echtes Interesse.",
  },
  {
    begriff: "Grundschuld",
    schreibweisen: ["Grundschulden", "Grundschuldbestellung", "Grundpfandrecht"],
    erklaerung:
      "Ein Recht der Bank am Grundstück, das im Grundbuch eingetragen wird (Paragrafen 1191 folgende BGB). Zahlt der Kunde nicht, kann die Bank daraus die Zwangsversteigerung betreiben. Sie bleibt bestehen, auch wenn das Darlehen getilgt ist, bis sie gelöscht wird.",
    mehr: "/immobilien-lexikon",
  },

  // ---------------------------------------------------------------- Rendite
  {
    begriff: "Bruttomietrendite",
    schreibweisen: ["Bruttorendite", "Brutto-Mietrendite", "Bruttomietrenditen"],
    erklaerung:
      "Jahres-Kaltmiete geteilt durch den Kaufpreis, mal 100. Ein grober Vergleichswert, der Kaufnebenkosten und laufende Kosten bewusst außen vor lässt.",
    imVerkauf:
      "Sie taugt zum Sortieren von Objekten, nicht zum Rechnen mit dem Kunden. Dafür ist die Nettomietrendite da.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=renditen",
  },
  {
    begriff: "Nettomietrendite",
    schreibweisen: ["Nettorendite", "Netto-Mietrendite", "Netto-Rendite"],
    erklaerung:
      "Jahres-Kaltmiete abzüglich der nicht umlagefähigen Kosten, geteilt durch Kaufpreis plus Kaufnebenkosten, mal 100. Die realistischere Zahl, weil sie beide Seiten mitnimmt.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=renditen",
  },
  {
    begriff: "Objekt-Gesamtrendite",
    schreibweisen: ["Gesamtrendite", "Objektrendite"],
    erklaerung:
      "Die Rendite bezogen auf das gesamte im Objekt gebundene Kapital, also Eigenkapital und Darlehen zusammen. Sie enthält neben der laufenden Miete auch die unterstellte Wertentwicklung und ist deshalb nur so belastbar wie diese Annahme.",
    imVerkauf:
      "Der Hebel trägt nur, solange diese Rendite über dem Zinssatz liegt. Das ist die Bedingung, die zum Satz vom Hebel dazugehört.",
  },
  {
    begriff: "Cashflow",
    schreibweisen: ["Cashflows", "Cash-Flow", "Cashflow nach Steuern", "Cashflow-Berechnung"],
    erklaerung:
      "Was am Monatsende tatsächlich übrig bleibt oder fehlt: Miete minus Zins, minus Tilgung, minus nicht umlagefähige Kosten, verrechnet mit der Steuerwirkung. Ohne den Zusatz „vor“ oder „nach Steuer“ ist die Zahl nicht vergleichbar.",
    imVerkauf:
      "Das ist die einzige Zahl, die der Kunde jeden Monat auf dem Konto sieht. Nenne immer dazu, ob sie vor oder nach Steuer gilt.",
    mehr: "/vertriebsakademie/glossar-zahlen?vaScrollTo=renditen",
  },

  // ------------------------------------------------------- WEG und Verwaltung
  {
    begriff: "Wohnungseigentümergemeinschaft",
    schreibweisen: ["Eigentümergemeinschaft", "WEG-Recht", "WEG-Vorteil", "WEG-Themen", "Wohnungseigentumsgesetz"],
    erklaerung:
      "Sobald ein Haus in einzelne Wohnungen aufgeteilt ist, bilden alle Eigentümer zusammen eine Gemeinschaft nach dem Wohnungseigentumsgesetz. Sie beschließt über alles, was das ganze Haus betrifft, und wird nach außen von der Verwaltung vertreten.",
    imVerkauf:
      "Der Käufer kauft nicht nur eine Wohnung, sondern einen Anteil an einer Gemeinschaft. Beschlüsse und Rücklage gehören deshalb in jede Objektprüfung.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Teilungserklärung",
    schreibweisen: ["Teilungserklärungen"],
    erklaerung:
      "Die Urkunde, mit der ein Haus nach Paragraf 8 Wohnungseigentumsgesetz in einzelne Wohnungen aufgeteilt wird. Sie legt fest, was zu welcher Wohnung gehört, wie die Kosten verteilt werden und welche Sondernutzungsrechte bestehen.",
    imVerkauf:
      "Sie beantwortet die Fragen, die im Notartermin zu spät kommen: Wem gehört der Stellplatz, wer zahlt den Aufzug.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Sondereigentum",
    schreibweisen: ["Sondereigentums", "Sondereigentum (SE)"],
    erklaerung:
      "Alles, was einem einzelnen Eigentümer allein gehört, im Kern die Räume hinter der Wohnungstür. Was genau dazugehört, steht in der Teilungserklärung.",
    imVerkauf:
      "Die Merkregel im Gespräch: alles hinter deiner Wohnungstür gehört dir, alles was alle betrifft gehört allen.",
  },
  {
    begriff: "Gemeinschaftseigentum",
    schreibweisen: ["Gemeinschaftseigentums", "gemeinschaftliches Eigentum"],
    erklaerung:
      "Alles, was allen Eigentümern gemeinsam gehört: Grundstück, Dach, Fassade, Treppenhaus, tragende Wände und die zentralen Leitungen. Kosten dafür trägt die Gemeinschaft.",
  },
  {
    begriff: "Hausgeld",
    schreibweisen: ["Hausgelds", "Hausgeldzahlung", "Wohngeld"],
    erklaerung:
      "Der monatliche Vorschuss, den jeder Eigentümer an die Gemeinschaft zahlt. Er deckt die Betriebskosten des Hauses und den Beitrag zur Rücklage. Ein Teil ist auf den Mieter umlegbar, ein Teil bleibt beim Eigentümer.",
    imVerkauf:
      "Nur der nicht umlagefähige Teil belastet den Kunden wirklich. Wer das Hausgeld ungeteilt nennt, rechnet zu schlecht oder zu gut.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Instandhaltungsrücklage",
    // „Rücklage“ allein bleibt draußen: in Kapitel 15 meint das Wort die
    // steuerliche Reinvestitionsrücklage nach Paragraf 6b EStG, also etwas
    // ganz anderes als das Sparbuch der Eigentümergemeinschaft.
    schreibweisen: ["Erhaltungsrücklage", "Instandhaltungsrücklagen", "Rücklagenhöhe"],
    erklaerung:
      "Das gemeinsame Sparbuch der Eigentümergemeinschaft für künftige Reparaturen und Erhaltungsmaßnahmen. Seit der Reform des Wohnungseigentumsgesetzes heißt sie im Gesetz Erhaltungsrücklage.",
    imVerkauf:
      "Eine dünne Rücklage ist kein Detail, sondern eine spätere Sonderumlage. Frage nach Höhe, Beschlüssen und Protokollen der letzten drei Jahre.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Sonderumlage",
    schreibweisen: ["Sonderumlagen"],
    erklaerung:
      "Eine zusätzliche Zahlung, welche die Eigentümerversammlung beschließt, wenn die Rücklage für eine anstehende Maßnahme nicht reicht. Jeder Eigentümer zahlt sie nach seinem Anteil, unabhängig davon, ob er dafür gestimmt hat.",
    imVerkauf:
      "Das ist das konkrete Risiko hinter dem Wort Rücklage. Es kommt selten, aber dann vierstellig.",
  },
  {
    begriff: "WEG-Verwaltung",
    schreibweisen: ["WEG-Verwalter", "Hausverwaltung", "WEG-Verwalterin"],
    erklaerung:
      "Die Verwaltung des gemeinschaftlichen Eigentums: Sie kümmert sich um Instandhaltung und Betrieb der gemeinsamen Flächen und rechnet das Hausgeld ab. Für alles innerhalb der eigenen Wohnung bleibt der Eigentümer selbst zuständig, einschließlich Mieterwechsel.",
    imVerkauf:
      "Ihre Kosten stecken bereits im Hausgeld. Wer sie zusätzlich ansetzt, rechnet doppelt.",
  },
  {
    begriff: "Sondereigentumsverwaltung",
    schreibweisen: ["SEV", "Sondereigentumsverwalter", "Sondereigentumsverwaltungen"],
    erklaerung:
      "Eine beauftragte Verwaltung, die dem Eigentümer die Arbeit an der eigenen Wohnung abnimmt, einschließlich Mieterwechsel und Abrechnung mit dem Mieter. Sie kostet einen monatlichen Festbetrag oder einen Anteil der Miete und kommt zum Hausgeld hinzu.",
    imVerkauf:
      "Sie ist die Antwort auf „ich habe keine Zeit für Mieter“: weniger Aufwand, dafür etwas weniger Rendite.",
  },
  {
    begriff: "Mietpool",
    schreibweisen: ["Mietpools", "Mietenpool"],
    erklaerung:
      "Mehrere Eigentümer eines Hauses legen ihre Mieteinnahmen zusammen und teilen sie nach Anteilen. Leerstand und Mietausfall treffen dadurch alle ein wenig statt einen ganz. Im Gegenzug hängt die eigene Auszahlung am Ergebnis der anderen.",
    imVerkauf:
      "Chance und Risiko in einem Satz: weniger Ausschlag nach unten, aber auch kein voller Vorteil, wenn die eigene Wohnung besser läuft.",
  },

  // ------------------------------------------------------------ Kauf und Notar
  {
    begriff: "Bauträger",
    schreibweisen: ["Bauträgers", "Bauträgern", "Bauträgerobjekt", "Bauträgerkauf"],
    erklaerung:
      "Ein Unternehmen, das auf eigenem Grundstück baut und die fertige oder noch zu bauende Immobilie verkauft. Der Käufer erwirbt Grundstück und Bauleistung in einem Vertrag. Bauträger brauchen eine eigene Erlaubnis nach Paragraf 34c Absatz 1 Satz 1 Nummer 3 Gewerbeordnung und unterliegen der Makler- und Bauträgerverordnung.",
    imVerkauf:
      "Beim Bauträgerkauf zahlt der Kunde nach Baufortschritt statt auf einmal. Was er wann zahlt, begrenzt Paragraf 3 Absatz 2 der Makler- und Bauträgerverordnung.",
    mehr: "/vertriebsakademie/verhandlung?vaScrollTo=zahlungsplan",
  },
  {
    begriff: "Notaranderkonto",
    schreibweisen: ["Notaranderkontos", "Anderkonto", "Notar-Anderkonto"],
    erklaerung:
      "Ein Treuhandkonto des Notars, auf das der Kaufpreis fließt, bis alle Voraussetzungen für die Auszahlung erfüllt sind. Es ist die Ausnahme und nur zulässig, wenn ein berechtigtes Sicherungsinteresse besteht (Paragraf 57 Beurkundungsgesetz).",
    imVerkauf:
      "Im Regelfall zahlt der Käufer direkt an den Verkäufer, sobald der Notar die Fälligkeit mitteilt. Wer das Anderkonto als Normalfall darstellt, verunsichert ohne Grund.",
    mehr: "/vertriebsakademie/notar?vaScrollTo=geld-und-sicherung",
  },
  {
    begriff: "Nutzen- und Lastenwechsel",
    schreibweisen: [
      "Nutzen und Lasten",
      "Übergang von Nutzen und Lasten",
      "Nutzen-Lasten-Wechsel",
      "Lastenwechsel",
      "Besitzübergang",
    ],
    erklaerung:
      "Der im Kaufvertrag vereinbarte Stichtag, ab dem die Miete dem Käufer zusteht und Hausgeld, Grundsteuer, Versicherung und Risiko auf ihn übergehen. Er liegt in aller Regel nach der Kaufpreiszahlung und lange vor der Eintragung im Grundbuch.",
    imVerkauf:
      "Das ist die häufigste Kundenfrage nach dem Notartermin: ab wann gehört mir die Miete. Der Termin steht im Vertrag, nicht im Kalender des Notars.",
  },
  {
    begriff: "Auflassungsvormerkung",
    schreibweisen: ["Auflassungsvormerkungen", "Vormerkung"],
    erklaerung:
      "Ein Vermerk im Grundbuch nach Paragraf 883 BGB, der den Anspruch des Käufers auf die Eigentumsumschreibung sichert. Der Käufer ist damit noch nicht Eigentümer, aber niemand kann ihm die Wohnung mehr wegkaufen oder neu belasten.",
    imVerkauf:
      "Sie ist die Antwort auf „ich zahle und stehe dann ohne alles da“. Genau dafür gibt es sie.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Löschungsbewilligung",
    schreibweisen: ["Löschungsbewilligungen"],
    erklaerung:
      "Die Erklärung des bisherigen Gläubigers, dass seine Grundschuld aus dem Grundbuch gelöscht werden darf. Der Notar holt sie bei der Bank des Verkäufers ein, bevor der Kaufpreis fällig wird.",
    imVerkauf:
      "Sie ist ein häufiger Grund für Verzögerungen, weil sie von einer fremden Bank kommt. Wer das früh sagt, verkauft keine falsche Geschwindigkeit.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Freistellungserklärung",
    schreibweisen: ["Freistellungserklärungen", "Freistellungsverpflichtung"],
    erklaerung:
      "Die Zusage der Bank des Bauträgers, das gekaufte Wohnungseigentum aus ihrer Globalgrundschuld zu entlassen. Sie gehört nach Paragraf 3 Makler- und Bauträgerverordnung zu den Voraussetzungen, bevor der Käufer beim Neubau zahlen muss.",
    imVerkauf:
      "Sie ist der Grund, warum ein Neubaukäufer nicht ins Risiko der Bauträgerbank gerät. Das beruhigt genau die Kunden, die von Insolvenzen gelesen haben.",
  },
  {
    begriff: "MaBV",
    schreibweisen: ["Makler- und Bauträgerverordnung", "MaBV-Ratenplan"],
    erklaerung:
      "Die Makler- und Bauträgerverordnung. Sie schreibt vor, welche Sicherheiten vorliegen müssen und in welchen Raten nach Baufortschritt ein Bauträger Geld verlangen darf. Sie begrenzt, was der Bauträger fordern darf, nicht was er dem Käufer zugestehen kann.",
    imVerkauf:
      "Sie erklärt dem Kunden, warum er beim Neubau nicht in Vorkasse geht, und dir, warum ein angepasster Zahlungsplan trotzdem verhandelbar bleibt.",
  },
  {
    begriff: "GwG",
    schreibweisen: ["Geldwäschegesetz", "Geldwäschegesetzes"],
    erklaerung:
      "Das Geldwäschegesetz. Es verpflichtet unter anderem Notare, die Beteiligten anhand eines gültigen Ausweises zu identifizieren und die Herkunft der Mittel zu prüfen. Ohne gültiges Ausweisdokument wird nicht beurkundet.",
    imVerkauf:
      "Ein abgelaufener Personalausweis lässt den Notartermin platzen. Diese eine Erinnerung vorab spart dem Kunden Wochen.",
  },
  {
    begriff: "§ 34c GewO",
    schreibweisen: ["34c GewO", "§ 34c", "Paragraf 34c GewO", "34c-Erlaubnis"],
    erklaerung:
      "Die Erlaubnis nach Paragraf 34c Gewerbeordnung für die gewerbsmäßige Vermittlung von Immobilien, erteilt von der zuständigen Behörde. Wer als Handelsvertreter für einen Erlaubnisinhaber tätig ist, arbeitet unter dessen Erlaubnis; wo die Grenze verläuft, hängt an der einzelnen Tätigkeit.",
    imVerkauf:
      "Die Grenze zwischen bloßem Hinweis und Vermittlung entscheidet über die eigene Haftung. Im Zweifel gilt der Vertriebspartnervertrag, nicht das Bauchgefühl.",
  },

  // ------------------------------------------------------------------- Miete
  {
    begriff: "ortsübliche Vergleichsmiete",
    schreibweisen: ["Vergleichsmiete", "ortsübliche Miete", "ortsüblichen Vergleichsmiete", "Mietspiegel"],
    erklaerung:
      "Das übliche Entgelt für vergleichbare Wohnungen am Ort, gebildet aus den Mieten der letzten Jahre (Paragraf 558 Absatz 2 BGB). Belegt wird sie meist über den Mietspiegel, ein Gutachten oder Vergleichswohnungen.",
    imVerkauf:
      "Sie ist die Obergrenze jeder Mieterhöhung im Bestand und damit die Grundlage für die Frage, ob eine Miete noch Luft hat.",
  },
  {
    begriff: "Kappungsgrenze",
    schreibweisen: ["Kappungsgrenzen"],
    erklaerung:
      "Die Grenze, um wie viel eine Bestandsmiete innerhalb von drei Jahren steigen darf: nach Paragraf 558 Absatz 3 BGB höchstens 20 Prozent, in Gebieten mit angespanntem Wohnungsmarkt höchstens 15 Prozent, wenn das Bundesland dies festgelegt hat.",
    imVerkauf:
      "Sie deckelt jede Mietsteigerung, die du in einer Prognose ansetzt. Eine Kalkulation ohne sie ist im Bestand zu optimistisch.",
  },
  {
    begriff: "Mietpreisbremse",
    erklaerung:
      "In Gebieten mit angespanntem Wohnungsmarkt darf die Miete bei Neuvermietung nach den Paragrafen 556d folgende BGB höchstens 10 Prozent über der ortsüblichen Vergleichsmiete liegen. Paragraf 556f nimmt Neubauten und umfassend modernisierte Wohnungen davon aus.",
    imVerkauf:
      "Für Neubau und umfassend sanierten Bestand gilt sie oft gerade nicht. Diese Ausnahme gehört zur Regel dazu, sonst rechnest du zu vorsichtig.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Staffelmiete",
    schreibweisen: ["Staffel-Miete", "Staffelmietvertrag"],
    erklaerung:
      "Eine Mietvereinbarung nach Paragraf 557a BGB, in der die Miete für feste Zeitpunkte in feste Beträge gestaffelt ist. Jede Stufe muss im Vertrag beziffert sein und mindestens ein Jahr gelten.",
    imVerkauf:
      "Sie macht die Mietentwicklung planbar, ohne Verhandlung mit dem Mieter. Das ist im Gespräch das stärkere Argument als der Prozentsatz.",
  },
  {
    begriff: "Indexmiete",
    schreibweisen: ["Index-Miete", "Indexmietvertrag"],
    erklaerung:
      "Eine Mietvereinbarung nach Paragraf 557b BGB, bei der sich die Miete am Verbraucherpreisindex des Statistischen Bundesamtes ausrichtet. Die Anpassung muss der Vermieter in Textform verlangen, sie geschieht nicht von selbst.",
    imVerkauf:
      "Sie ist der übliche Inflationsschutz auf der Mietseite. Wichtig für den Kunden: der Index kann auch stagnieren.",
    mehr: "/immobilien-lexikon",
  },
  {
    begriff: "Modernisierungsumlage",
    schreibweisen: ["Modernisierungsmieterhöhung", "§ 559 BGB", "Paragraf 559 BGB"],
    erklaerung:
      "Nach einer Modernisierung darf der Vermieter einen Teil der Kosten nach Paragraf 559 BGB dauerhaft auf die Jahresmiete umlegen. Das Gesetz begrenzt den Anteil und deckelt zusätzlich, um wie viel die Miete je Quadratmeter dadurch in sechs Jahren steigen darf.",
    imVerkauf:
      "Sie ist der Grund, warum eine Sanierung im Bestand nicht nur Kosten ist. Die Deckelung gehört in denselben Satz.",
    mehr: "/immobilien-lexikon",
  },

  // ----------------------------------------------------------------- Vertrieb
  {
    begriff: "Setterin",
    schreibweisen: ["Setter", "Setterinnen", "Setter-Performance", "Setterin oder Setter"],
    erklaerung:
      "Die Person, die Kontakte anspricht, vorqualifiziert und Termine für die Beratung bucht. Sie berät nicht und verkauft nicht, sie füllt den Kalender.",
    imVerkauf:
      "Die Trennung von Terminieren und Beraten ist der erste echte Skalierungsschritt. Vorher verkaufst du und terminierst nebenbei.",
  },
  {
    begriff: "Lead",
    schreibweisen: ["Leads", "Lead-Quelle", "Meta-Leads"],
    erklaerung:
      "Ein Kontakt, der grundsätzlich in Frage kommt und dessen Daten vorliegen. Ein Lead ist noch kein Interessent und erst recht kein Kunde, sondern der Rohstoff am Anfang der Strecke.",
    imVerkauf:
      "Wer Leads und Termine in einen Topf wirft, sucht den Fehler an der falschen Stelle der Kette.",
  },
  {
    begriff: "Funnel",
    schreibweisen: ["Funnels", "Vertriebsfunnel", "Trichter"],
    erklaerung:
      "Das Bild vom Trichter für den Weg vom ersten Kontakt bis zum Abschluss: oben viele, unten wenige. Jede Stufe hat ihre eigene Zahl, und die Verluste dazwischen sind normal.",
    imVerkauf:
      "Fehlt unten der Abschluss, liegt die Ursache fast immer ein bis zwei Stufen weiter oben. Deshalb misst man jede Stufe einzeln.",
  },
  {
    begriff: "Conversion",
    schreibweisen: ["Conversions", "Conversion-Rate", "Konversion", "Conversionrate"],
    erklaerung:
      "Der Anteil, der von einer Stufe zur nächsten kommt. Aus 10 Kontakten 3 Erstgespräche sind 30 Prozent.",
    imVerkauf:
      "Eine Zahl ohne die Angabe, von welcher Stufe zu welcher, ist wertlos. Nenne immer beide Enden.",
  },
  {
    begriff: "No-Show",
    schreibweisen: ["No-Shows", "No Show", "Nichterscheinen"],
    erklaerung:
      "Ein vereinbarter Termin, zu dem der Kontakt nicht erscheint und den er auch nicht absagt.",
    imVerkauf:
      "Die Quote entsteht nicht am Termintag, sondern in den letzten Minuten des vorherigen Gesprächs. Dort wird Verbindlichkeit hergestellt.",
  },
  {
    begriff: "Perfect Client Profile",
    schreibweisen: ["PCP", "Wunschkundenprofil", "Perfect-Client-Profile"],
    erklaerung:
      "Die schriftliche Beschreibung des Kunden, für den das Produkt wirklich passt, mit nachprüfbaren Merkmalen wie Einkommen, Steuerlast und Lebenssituation. Sie sagt vor allem, wen man nicht anspricht.",
    imVerkauf:
      "Sie spart die Stunden mit den Falschen. Wer sie nicht schriftlich hat, hat sie nicht.",
  },
  {
    begriff: "Tippgeber",
    schreibweisen: ["Tippgeberin", "Tippgebers", "Tippgebern", "Tippgebertätigkeit", "Tippgeberprovision"],
    erklaerung:
      "Wer nur den Kontakt zwischen einem Interessenten und dem Maklerbetrieb herstellt: benennen, Kontaktdaten mit Einverständnis weitergeben, allgemein auf das Angebot hinweisen, einen Termin vereinbaren. Diese vier Handlungen sind nach Paragraf 1 Absatz 3a des Vertriebspartnervertrags erlaubnisfrei.",
    imVerkauf:
      "Die Grenze ist wichtig für dich selbst: Sobald du das Objekt erklärst oder eine Zahl zu Preis, Miete, Rendite oder Steuer nennst, brauchst du die eigene Erlaubnis nach Paragraf 34c Gewerbeordnung.",
    mehr: "/vertriebsakademie/positionierung?vaScrollTo=34c-erlaubnis",
  },
];
