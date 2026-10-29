/**
 * Texte der persönlichen Partner-Landingpage (`/vp/:slug`, Vorschau
 * `/berater-microseite`, lokal `/vorschau/mikroseite`).
 *
 * Neu aufgebaut am 29.10.2026 als Spannungsbogen, Reihenfolge nach Christian
 * (29.10.2026): Einstieg, Ausgangslage (Geldentwertung), Vergleich der
 * Anlagen, Wer wir sind, Prinzip, Musterrechnung, Leistungen, zwei Konzepte,
 * Investorenprofile, ehrliche Antworten, Prozess, Erstgespräch. Konkret wird
 * nur die Musterrechnung mit einer echten Wohnung, sonst allgemein.
 * Investorenprofile und Leistungen stehen in `mikroseiteTexte.ts`.
 *
 * Quellen: Beratungspräsentation (`src/lib/beratungOsDaten.ts`), Drive
 * „Verkaufsgespräch“ (PDF „Steuerersparnis mit Immobilien“, Stand
 * 19.10.2026, und Einwandbehandlungs-Handbuch, Stand 15.10.2026). Die
 * Beispielzahlen kommen aus dem Steuer-PDF und tragen dessen Annahmen.
 * Keine Kennzahlen zur Firma, keine Kundenstimmen, keine Zusagen.
 *
 * Anrede Du. Englisch britisch, „you“. Keine Gedankenstriche, in keiner der
 * beiden Sprachen.
 */

const de = {
  kopf: {
    logoAlt: "OS Real Estate GmbH",
  },

  hero: {
    kicker: "OS Real Estate · Vermögensaufbau mit Immobilien",
    titelZeile1: "Vermögen aufbauen,",
    titelZeile2: "das Mieter und Steuer mitbezahlen.",
    text:
      "Mit einer vermieteten Wohnung trägt dein Mieter den größten Teil der Rate, die Steuerwirkung einen weiteren. Du baust Monat für Monat Eigentum auf: für mehr Netto heute und mehr Rente später.",
    knopfTermin: "Kostenloses Erstgespräch vereinbaren",
    knopfPrinzip: "So funktioniert es",
    vorteile: ["Provisionsfrei direkt vom Bauträger", "Finanzierung und Verwaltung aus einer Hand", "Ein persönlicher Ansprechpartner"],
    bildAlt: "Wohnhaus mit Garten aus unserem Bestand in Brandenburg",
    portraetUeber: "Dein persönlicher Ansprechpartner",
    portraetTermin: "Termin buchen",
  },

  lage: {
    kicker: "Die Ausgangslage",
    titel: "Dein Geld steht unter Druck. Von drei Seiten.",
    punkte: [
      {
        wert: "48 %",
        titel: "Die Rentenlücke",
        text: "So hoch ist das Rentenniveau im Verhältnis zum Durchschnittsverdienst, vor Steuern. Wer mehr verdient, dem fehlt im Ruhestand im Verhältnis noch mehr.",
      },
      {
        wert: "42 %",
        titel: "Die Steuerlast",
        text: "Ab rund 70.000 € zu versteuerndem Einkommen gehen von jedem zusätzlichen Euro 42 Cent Einkommensteuer ab. Ohne Gegenwert für dich.",
      },
      {
        wert: "−20 %",
        titel: "Die Inflation",
        text: "Bei rund 2 Prozent Inflation verliert Erspartes in zehn Jahren etwa ein Fünftel seiner Kaufkraft.",
      },
    ],
    nichtstun: {
      titel: "Was Abwarten kostet",
      text: "50.000 € auf dem Tagesgeld, zehn Jahre lang.",
      balken: [
        { label: "Heute", wert: "50.000 €", anteil: 82 },
        { label: "Nach 10 Jahren mit 2 % Zinsen", wert: "60.950 €", anteil: 100 },
        { label: "Kaufkraft bei 2,5 % Inflation", wert: "47.615 €", anteil: 78, warnung: true },
      ] as ReadonlyArray<{ label: string; wert: string; anteil: number; warnung?: boolean }>,
      satz: "Mehr auf dem Konto, weniger in der Hand. Und wer ein Jahr wartet, verschenkt ein Jahr Tilgung.",
    },
    schluss:
      "Die Frage ist also nicht, ob du dein Geld anlegst, sondern wo es gegen alle drei Punkte arbeitet.",
  },

  vergleich: {
    kicker: "Der Vergleich",
    titel: "Warum gerade eine Immobilie?",
    intro:
      "Tagesgeld, Aktien, Gold oder Immobilie: Jede Anlage hat ihre Stärken. Aber nur eine wird von der Bank mitfinanziert, vom Mieter mitbezahlt und vom Finanzamt gefördert.",
    spalten: ["Tagesgeld", "Aktien und ETF", "Gold", "Vermietete Immobilie"],
    zeilen: [
      { kriterium: "Wächst mit der Inflation", werte: ["nein", "ja", "teil", "ja"] },
      { kriterium: "Die Bank finanziert mit", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Ein anderer zahlt mit", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Laufender Steuervorteil", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Laufende Einnahmen", werte: ["teil", "teil", "nein", "ja"] },
      { kriterium: "Ruhiger Wertverlauf", werte: ["ja", "nein", "teil", "ja"] },
      { kriterium: "Jederzeit verkäuflich", werte: ["ja", "ja", "ja", "nein"] },
    ] as ReadonlyArray<{ kriterium: string; werte: ReadonlyArray<"ja" | "teil" | "nein"> }>,
    bewertung: { ja: "Ja", teil: "Teilweise", nein: "Nein" },
    fazitTitel: "Der Unterschied ist der Hebel.",
    fazitText:
      "Bei Tagesgeld, Aktien und Gold arbeitet nur dein eigenes Geld. Bei der Immobilie finanziert die Bank, dein Mieter zahlt die Rate mit und deine Steuer sinkt. So entsteht Vermögen, das du allein kaum ansparen würdest.",
    ehrlich:
      "Ehrlich gesagt: Eine Immobilie ist eine Anlage für viele Jahre und nicht von heute auf morgen verkauft. Genau deshalb rechnen wir sie vorher mit dir durch.",
    fuss:
      "Vereinfachte, allgemeine Einordnung, keine Anlageberatung. Der ruhige Wertverlauf gilt für Wohnimmobilien in gefragten Lagen über lange Zeiträume; auch Immobilienpreise können fallen.",
  },

  prinzip: {
    kicker: "Das Prinzip",
    titel: "Wer bezahlt eigentlich deine Wohnung?",
    intro:
      "Rate und laufende Kosten teilen sich drei Beteiligte. Den größten Teil trägt dein Mieter, einen weiteren die Steuerwirkung. Dein eigener Anteil ist der kleinste, und er landet als Tilgung in deinem eigenen Vermögen.",
    frage: "Wer trägt die monatliche Belastung?",
    anteile: [
      { teil: "mieter", label: "Dein Mieter", prozent: 61, text: "zahlt die Miete" },
      { teil: "steuer", label: "Die Steuerwirkung", prozent: 22, text: "über weniger Lohnsteuer" },
      { teil: "du", label: "Du", prozent: 17, text: "zahlst den Rest zu" },
    ] as ReadonlyArray<{ teil: "mieter" | "steuer" | "du"; label: string; prozent: number; text: string }>,
    bausteine: [
      { titel: "Miete", text: "Dein Mieter trägt den größten Teil der Rate." },
      { titel: "Tilgung", text: "Jeden Monat gehört dir ein Stück mehr der Immobilie." },
      { titel: "Steuer", text: "Zinsen, Kosten und Abschreibung können deine Steuer senken." },
      { titel: "Sachwert", text: "Eine Immobilie, die langfristig mit der Inflation wachsen kann." },
    ],
    kennerTitel: "Für Kenner",
    kennerText:
      "Zinsen, nicht umlagefähige Kosten und die Abschreibung (AfA) sind Werbungskosten bei Einkünften aus Vermietung. Die Tilgung ist es nicht, sie ist dein Vermögensaufbau. Über einen Freibetrag im Lohnsteuerabzug wirkt der Effekt schon jeden Monat statt einmal im Jahr.",
    fuss:
      "Beispielrechnung aus unserer Beratung, gerundet: 65.000 € brutto im Jahr, Steuerklasse I, Wohnung um 285.000 €, Rate und nicht umlagefähiges Hausgeld im ersten Jahr, 4 % AfA mit Restnutzungsdauer-Gutachten. Keine Zusage, dein Ergebnis hängt von Einkommen, Objekt und Finanzierung ab.",
  },

  muster: {
    kicker: "Die Musterrechnung",
    titel: "So rechnet sich eine echte Wohnung.",
    intro:
      "Keine Theorie, sondern eine Wohnung aus unserem Angebot. Monatswerte im ersten Jahr, genau wie im Exposé.",
    objekt: "Barfusstraße 9, Wohnung 25",
    ort: "Berlin-Wedding · Gründerzeit-Altbau um 1900",
    daten: ["40 m²", "200.000 € Kaufpreis", "Kaltmiete 13,50 €/m² garantiert"],
    bildAlt: "Gründerzeit-Fassade der Barfusstraße 9 in Berlin-Wedding",
    rechnungTitel: "Monatliche Rechnung im ersten Jahr",
    zeilen: [
      { label: "Garantierte Kaltmiete", wert: "+540 €", art: "plus" },
      { label: "Kreditrate, 4,8 % Zins und 1,2 % Tilgung", wert: "−1.000 €", art: "minus" },
      { label: "Hausgeld, nicht umlagefähig, mit Rücklage", wert: "−62 €", art: "minus" },
      { label: "Ergebnis vor Steuer", wert: "−522 €", art: "summe" },
      { label: "Steuerersparnis bei 42 % Grenzsteuersatz", wert: "+520 €", art: "plus" },
      { label: "Ergebnis nach Steuer", wert: "−2 €", art: "ergebnis" },
    ] as ReadonlyArray<{ label: string; wert: string; art: "plus" | "minus" | "summe" | "ergebnis" }>,
    kennzahlen: [
      { wert: "2 €", text: "zahlst du nach Steuer im Monat zu" },
      { wert: "200 €", text: "Tilgung im Monat, die dein Vermögen wird" },
      { wert: "58.892 €", text: "Steuerersparnis in zehn Jahren" },
    ],
    satz: "Mieter und Finanzamt tragen fast die ganze Rate. Du zahlst 2 € im Monat, und jeden Monat gehört dir ein Stück mehr von deiner Wohnung.",
    ehrlich:
      "Ehrlich gerechnet: Vor Steuer zahlst du 522 € im Monat zu. Die Ersparnis kommt über die Lohnsteuer jeden Monat oder einmal im Jahr über die Steuererklärung. Plane deshalb mit dem Betrag vor Steuer.",
    fuss:
      "Musterrechnung aus dem Exposé (Stand 14.10.2026), keine Zusage und keine Steuerberatung. Annahmen: 80.000 € brutto im Jahr, Steuerklasse I, Kaufpreis voll finanziert, Kaufnebenkosten von 8 % aus Eigenkapital. Die Steuerersparnis setzt eine erhöhte AfA von 5,6 % voraus (Restnutzungsdauer 18 Jahre); dafür braucht es ein Gutachten, das das Finanzamt anerkennt. Die garantierte Miete ist eine Vereinbarung mit dem Bauträger. Dein Ergebnis hängt von Einkommen, Steuersatz und Finanzierung ab.",
  },

  konzepte: {
    kicker: "Zwei Konzepte",
    titel: "Mehr Netto heute. Mehr Rente später.",
    intro:
      "Dieselbe Immobilie, zwei Ziele. Welches für dich an erster Stelle steht, hängt von deinem Einkommen, deinem Steuersatz und deinem Zeithorizont ab.",
    kennerKnopf: "Für Kenner: die Details",
    steuer: {
      nummer: "Konzept 1",
      marke: "Steueroptimierung",
      titel: "Mehr Netto vom Brutto.",
      text:
        "Einen Teil deines Einkommens zahlst du ohnehin als Lohnsteuer, ohne Gegenwert. Mit einer vermieteten Wohnung senken Zinsen, Kosten und Abschreibung dein zu versteuerndes Einkommen. So fließt ein Teil dieser Steuer in dein eigenes Vermögen statt ans Finanzamt.",
      beispielKopf: "Beispiel: 65.000 € brutto im Jahr, Lohnsteuer im Monat",
      beispiel: [
        { text: "Ohne Immobilie", wert: "898 €", anteil: 100, plus: "" },
        { text: "Mit Immobilie, reguläre AfA 2 %", wert: "654 €", anteil: 73, plus: "+ 244 € netto" },
        { text: "Mit Gutachten, AfA 4 %", wert: "525 €", anteil: 58, plus: "+ 373 € netto" },
      ] as ReadonlyArray<{ text: string; wert: string; anteil: number; plus: string }>,
      passt: "Passt besonders bei hohem Steuersatz: Angestellte mit gutem Einkommen, Selbstständige, Unternehmer.",
      kenner: [
        "Lineare AfA: 2 % bei Baujahr ab 1925, 2,5 % vor 1925, 3 % bei Neubau ab 2023.",
        "Ein höherer Satz setzt eine kürzere, nachgewiesene Restnutzungsdauer voraus (§ 7 Abs. 4 Satz 2 EStG). Das Finanzamt muss das Gutachten anerkennen.",
        "Die Rechnung muss vor Steuern und mit regulärer AfA tragen. Alles darüber ist ein möglicher Bonus.",
        "Freibetrag im Lohnsteuerabzug (§ 39a EStG): mehr Netto jeden Monat, in der Regel ab dem Jahr nach dem Kauf.",
      ],
      fuss:
        "Musterrechnung aus dem PDF „Steuerersparnis mit Immobilien“: Steuerklasse I, kinderlos, ohne Kirchensteuer, Werte 2026, erstes volles Jahr. Keine Steuerberatung.",
    },
    alter: {
      nummer: "Konzept 2",
      marke: "Altersvorsorge",
      titel: "Heute kaufen. Im Ruhestand ernten.",
      text:
        "Mieter und Steuerwirkung zahlen deine Immobilie über die Jahre ab. Zum Ruhestand gehört sie dir, und du entscheidest, was sie für dich tut.",
      zeitachse: [
        { titel: "Heute", text: "Du kaufst mit Bankdarlehen." },
        { titel: "Die Jahre dazwischen", text: "Mieter und Steuer tilgen mit." },
        { titel: "Ruhestand", text: "Du hast die Wahl." },
      ],
      wege: [
        {
          marke: "Weg A",
          titel: "Verkaufen: ein Betrag für den Ruhestand.",
          text: "Du verkaufst die Wohnung. Was nach der Restschuld bleibt, gehört dir auf einen Schlag, für Reisen, Familie oder als Reserve.",
        },
        {
          marke: "Weg B",
          titel: "Behalten: Miete als Zusatzrente.",
          text: "Die Wohnung ist abbezahlt. Die Miete fließt jeden Monat zu dir, nach laufenden Kosten als zweite Rente.",
        },
      ],
      passt: "Passt besonders, wenn du langfristig denkst und im Ruhestand mehr willst als die gesetzliche Rente.",
      kenner: [
        "Die Tilgung baut jeden Monat Eigenkapital auf, unabhängig vom Marktwert.",
        "Verkauf nach mehr als zehn Jahren: kein privates Veräußerungsgeschäft (§ 23 EStG). Bei mehreren Verkäufen kann gewerblicher Grundstückshandel vorliegen, das klärt deine Steuerberatung.",
        "Wir rechnen ohne Wertsteigerung. Steigt der Wert, ist das ein Bonus.",
        "Zinsbindung und Anschlussfinanzierung planen wir von Anfang an mit ein.",
      ],
    },
    beide: "Viele verbinden beides: Die Steuerersparnis von heute zahlt die Zusatzrente von morgen ab.",
  },

  zwischenruf: {
    titel: "Welches Konzept passt zu dir?",
    text: "Das klären wir im kostenlosen Erstgespräch, mit deinen Zahlen statt mit Prospektwerten.",
    knopf: "Erstgespräch vereinbaren",
  },

  werWir: {
    kicker: "Wer wir sind",
    titel: "Wir bauen, vermitteln und begleiten.",
    intro:
      "Die OS Real Estate GmbH entwickelt und vermittelt vermietete Wohnimmobilien in Berlin und Brandenburg. Weil wir selbst Bauträger sind, kaufst du direkt bei uns. Und weil Verwaltung und Finanzierung zur selben Gruppe gehören, sind die Wege kurz.",
    dach: "OS Immobilien Holding GmbH",
    dachText: "Das Dach der Gruppe, mit Sitz in Mittenwalde bei Berlin",
    marken: [
      { name: "OS Real Estate GmbH", rolle: "Objekte und Beratung", text: "Auswahl, Entwicklung und Verkauf geprüfter Kapitalanlagen. Dein Ansprechpartner bis zum Notar." },
      { name: "OS Verwaltungs GmbH", rolle: "Vermietung und Verwaltung", text: "Hausverwaltung und Mietverwaltung, damit aus Eigentum kein zweiter Job wird." },
      { name: "OS Finanzierung", rolle: "Der Weg zur Bank", text: "Unterlagen vorbereiten, Banken anfragen, begleiten bis zur Entscheidung der Bank." },
    ],
    vorteile: [
      { titel: "Provisionsfrei", text: "Du kaufst direkt vom Bauträger, ohne Maklerprovision." },
      { titel: "Rundum begleitet", text: "Von der Auswahl über Bank und Notar bis nach der Vermietung." },
      { titel: "Regional verwurzelt", text: "Berlin, Potsdam, Cottbus und Brandenburg. Wir bieten an, was wir kennen." },
      { titel: "Ehrliche Rechnung", text: "Belastung vor Steuern zuerst. Passt es nicht, sagen wir es offen." },
    ],
    fuss:
      "Jede Zahl und alle Unterlagen bekommst du vor deiner Entscheidung. Steuer-, Rechts- und Finanzierungsfragen klärst du mit Steuerberatung, Notar und Bank, dazu ermutigen wir ausdrücklich.",
  },

  faq: {
    kicker: "Ehrlich gesagt",
    titel: "Die Fragen, die sich jeder stellt.",
    intro: "Gute Fragen verdienen ehrliche Antworten. Die häufigsten, kurz beantwortet.",
    fragen: [
      {
        frage: "Ich kenne mich mit Immobilien nicht aus. Ist das ein Problem?",
        antwort: "Nein. Wir erklären Schritt für Schritt und machen jede Annahme in der Rechnung sichtbar. Du entscheidest erst, wenn du Konzept und Immobilie nachvollziehen kannst.",
      },
      {
        frage: "Sind die Zinsen nicht gerade zu hoch?",
        antwort: "Der Zinssatz allein entscheidet nicht über eine gute Kapitalanlage. Entscheidend ist die Gesamtrechnung aus Kaufpreis, Zins, Tilgung, Miete, Kosten und Steuer. Eine spätere Zinssenkung ist ein Bonus, kein Teil der Rechnung.",
      },
      {
        frage: "Und wenn der Mieter nicht zahlt?",
        antwort: "Das kann passieren, deshalb planen wir es ein: mit einer Reserve, die einige Monatsraten trägt, und einem Stresstest, der zeigt, was drei oder sechs Monate ohne Miete für dich bedeuten.",
      },
      {
        frage: "Sind die Steuervorteile nicht unsicher?",
        antwort: "Die Steuerwirkung ist ein Baustein, nicht der Grund für den Kauf. Wir zeigen dir die Belastung zuerst vor Steuern und dann mit der regulären Abschreibung. Was darüber hinausgeht, prüft deine Steuerberatung.",
      },
      {
        frage: "Wie viel Eigenkapital brauche ich?",
        antwort: "Das hängt von Einkommen, Objekt und Bank ab. In der Regel sollten die Kaufnebenkosten aus Erspartem kommen, und deine Sicherheitsreserve bleibt unangetastet. Passt es heute nicht, ist es eine Frage des Zeitpunkts.",
      },
      {
        frage: "Ich habe keine Zeit, mich um eine Wohnung zu kümmern.",
        antwort: "Für den Alltag gibt es die Hausverwaltung und auf Wunsch eine Mietverwaltung aus unserer Gruppe. Bei dir bleiben wenige Entscheidungen im Jahr und die Belege für die Steuererklärung.",
      },
      {
        frage: "Ich lege lieber in ETFs an.",
        antwort: "Ein guter Baustein, den du behalten solltest. Die Immobilie ist eine Ergänzung mit anderen Eigenschaften: überwiegend von der Bank finanziert, vom Mieter mitgetragen, ein Sachwert. Viele kombinieren beides.",
      },
    ],
  },

  prozess: {
    kicker: "Unser Prozess",
    titel: "Sieben Schritte bis zum Eigentum.",
    intro: "In fester Reihenfolge, mit einem Ansprechpartner. Nach jedem Schritt entscheidest du, ob es weitergeht.",
    schritte: [
      { titel: "Qualifizierungsgespräch", text: "Deine Ziele und deine Lage.", ergebnis: "Du weißt, ob eine Kapitalanlage zu dir passen kann." },
      { titel: "Beratungspräsentation", text: "Konzept und Rechnung mit deinen Zahlen.", ergebnis: "Du verstehst Chancen, Kosten und Risiken." },
      { titel: "Objektpräsentation", text: "Das passende Objekt für dich.", ergebnis: "Exposé, Kalkulation und Unterlagen zum Nachlesen." },
      { titel: "Reservierung", text: "Kostenfrei.", ergebnis: "Du sicherst dir Zeit für die Prüfung." },
      { titel: "Finanzierung", text: "Die Zusage der Bank.", ergebnis: "OS Finanzierung begleitet dich bis zur Entscheidung." },
      { titel: "Besichtigung", text: "Am Notartag oder am Vortag, auch online.", ergebnis: "Du machst dir dein eigenes Bild." },
      { titel: "Notar", text: "Beurkundung des Kaufvertrags.", ergebnis: "Die Wohnung gehört dir." },
    ],
  },

  kontakt: {
    kicker: "Dein nächster Schritt",
    titel: "Lernen wir uns kennen.",
    text: "Im Erstgespräch schauen wir gemeinsam auf deine Situation. Das bekommst du:",
    punkte: [
      "Einen klaren Blick auf deine Ausgangslage und dein Ziel",
      "Welches Konzept zu dir passt, Steuer, Rente oder beides",
      "Eine ehrliche Einschätzung, auch wenn sie Nein heißt",
    ],
    zusage: "Kostenlos, unverbindlich und ohne Verkaufsdruck.",
    ersatzName: "Dein Ansprechpartner",
    terminBuchen: "Termin direkt buchen",
    anfrage: "Anfrage senden",
  },

  fuss: {
    marke: "Kapitalanlage-Immobilien in Berlin und Umland. Ein Unternehmen der OS Immobilien Holding GmbH.",
    rechtliches: "Rechtliches",
    impressum: "Impressum",
    datenschutz: "Datenschutz",
    rechte: (jahr: number) => `© ${jahr} OS Real Estate GmbH`,
  },
};

export type MikroseiteOsTexte = typeof de;

const en: MikroseiteOsTexte = {
  kopf: {
    logoAlt: "OS Real Estate GmbH",
  },

  hero: {
    kicker: "OS Real Estate · Building wealth with property",
    titelZeile1: "Build wealth",
    titelZeile2: "that your tenant and the tax effect help pay for.",
    text:
      "With a let flat, your tenant carries most of the instalment and the tax effect another part. Month by month you build up ownership: more net income today and more pension later.",
    knopfTermin: "Book a free initial consultation",
    knopfPrinzip: "How it works",
    vorteile: ["Commission free, directly from the developer", "Financing and management from one source", "One personal contact"],
    bildAlt: "Residential house with garden from our portfolio in Brandenburg",
    portraetUeber: "Your personal contact",
    portraetTermin: "Book a call",
  },

  lage: {
    kicker: "The starting point",
    titel: "Your money is under pressure. From three sides.",
    punkte: [
      {
        wert: "48%",
        titel: "The pension gap",
        text: "That is the German pension level relative to average earnings, before tax. The more you earn, the larger the share you lose in retirement.",
      },
      {
        wert: "42%",
        titel: "The tax burden",
        text: "From around €70,000 of taxable income, 42 cents of every additional euro go to income tax. With nothing in return for you.",
      },
      {
        wert: "−20%",
        titel: "Inflation",
        text: "At around 2 percent inflation, savings lose about a fifth of their purchasing power in ten years.",
      },
    ],
    nichtstun: {
      titel: "What waiting costs",
      text: "€50,000 in a savings account, for ten years.",
      balken: [
        { label: "Today", wert: "€50,000", anteil: 82 },
        { label: "After 10 years at 2% interest", wert: "€60,950", anteil: 100 },
        { label: "Purchasing power at 2.5% inflation", wert: "€47,615", anteil: 78, warnung: true },
      ],
      satz: "More in the account, less in your hand. And waiting a year means giving away a year of repayment.",
    },
    schluss:
      "So the question is not whether you invest your money, but where it works against all three.",
  },

  vergleich: {
    kicker: "The comparison",
    titel: "Why property of all things?",
    intro:
      "Savings account, shares, gold or property: every investment has its strengths. But only one is co-financed by the bank, co-paid by the tenant and supported by the tax office.",
    spalten: ["Savings account", "Shares and ETFs", "Gold", "Let property"],
    zeilen: [
      { kriterium: "Grows with inflation", werte: ["nein", "ja", "teil", "ja"] },
      { kriterium: "The bank co-finances", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Someone else co-pays", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Ongoing tax advantage", werte: ["nein", "nein", "nein", "ja"] },
      { kriterium: "Regular income", werte: ["teil", "teil", "nein", "ja"] },
      { kriterium: "Steady value development", werte: ["ja", "nein", "teil", "ja"] },
      { kriterium: "Can be sold at any time", werte: ["ja", "ja", "ja", "nein"] },
    ],
    bewertung: { ja: "Yes", teil: "Partly", nein: "No" },
    fazitTitel: "The difference is leverage.",
    fazitText:
      "With savings, shares and gold, only your own money works. With property, the bank finances, your tenant co-pays the instalment and your tax goes down. That builds wealth you would hardly save up on your own.",
    ehrlich:
      "To be honest: property is an investment for many years and cannot be sold overnight. That is exactly why we work through the figures with you first.",
    fuss:
      "Simplified, general overview, not investment advice. Steady value development applies to residential property in sought-after locations over long periods; property prices can fall too.",
  },

  prinzip: {
    kicker: "The principle",
    titel: "Who actually pays for your flat?",
    intro:
      "Three parties share the instalment and running costs. Your tenant carries the largest part, the tax effect another. Your own share is the smallest, and it ends up as repayment in your own wealth.",
    frage: "Who carries the monthly cost?",
    anteile: [
      { teil: "mieter", label: "Your tenant", prozent: 61, text: "pays the rent" },
      { teil: "steuer", label: "The tax effect", prozent: 22, text: "through lower income tax" },
      { teil: "du", label: "You", prozent: 17, text: "top up the rest" },
    ],
    bausteine: [
      { titel: "Rent", text: "Your tenant carries most of the instalment." },
      { titel: "Repayment", text: "Every month a little more of the property belongs to you." },
      { titel: "Tax", text: "Interest, costs and depreciation can lower your tax." },
      { titel: "Real asset", text: "A property that can grow with inflation over the long term." },
    ],
    kennerTitel: "For experts",
    kennerText:
      "Interest, non recoverable costs and depreciation (AfA) are deductible expenses on rental income. Repayment is not, it is your wealth building. With an allowance in your payroll tax, the effect arrives every month instead of once a year.",
    fuss:
      "Sample calculation from our consultation, rounded: €65,000 gross a year, tax class I, flat at around €285,000, instalment and non recoverable service charge in the first year, 4% depreciation with a remaining useful life report. Not a promise, your result depends on income, property and financing.",
  },

  muster: {
    kicker: "The sample calculation",
    titel: "How a real flat adds up.",
    intro:
      "No theory, but a flat from our portfolio. Monthly figures in the first year, exactly as in the brochure.",
    objekt: "Barfusstraße 9, flat 25",
    ort: "Berlin-Wedding · period building from around 1900",
    daten: ["40 m²", "€200,000 purchase price", "Rent of €13.50 per m² guaranteed"],
    bildAlt: "Period facade of Barfusstraße 9 in Berlin-Wedding",
    rechnungTitel: "Monthly calculation in the first year",
    zeilen: [
      { label: "Guaranteed basic rent", wert: "+€540", art: "plus" },
      { label: "Loan instalment, 4.8% interest and 1.2% repayment", wert: "−€1,000", art: "minus" },
      { label: "Non-recoverable service charge incl. reserve", wert: "−€62", art: "minus" },
      { label: "Result before tax", wert: "−€522", art: "summe" },
      { label: "Tax saving at a 42% marginal rate", wert: "+€520", art: "plus" },
      { label: "Result after tax", wert: "−€2", art: "ergebnis" },
    ],
    kennzahlen: [
      { wert: "€2", text: "is what you add each month after tax" },
      { wert: "€200", text: "repayment each month that becomes your wealth" },
      { wert: "€58,892", text: "tax saving over ten years" },
    ],
    satz: "Tenant and tax office carry almost the whole instalment. You pay €2 a month, and every month a little more of your flat belongs to you.",
    ehrlich:
      "Calculated honestly: before tax you add €522 a month. The saving arrives monthly via income tax or once a year via your tax return. So plan with the figure before tax.",
    fuss:
      "Sample calculation from the brochure (as of 14.10.2026), no promise and no tax advice. Assumptions: €80,000 gross a year, tax class I, purchase price fully financed, purchase costs of 8% from own funds. The tax saving requires an increased depreciation rate of 5.6% (remaining useful life 18 years); this needs an expert report recognised by the tax office. The guaranteed rent is an agreement with the developer. Your result depends on income, tax rate and financing.",
  },

  konzepte: {
    kicker: "Two concepts",
    titel: "More net income today. More pension later.",
    intro:
      "The same property, two goals. Which comes first for you depends on your income, your tax rate and your time horizon.",
    kennerKnopf: "For experts: the details",
    steuer: {
      nummer: "Concept 1",
      marke: "Tax optimisation",
      titel: "More net from your gross.",
      text:
        "Part of your income goes to payroll tax anyway, with nothing in return. With a let flat, interest, costs and depreciation reduce your taxable income. Part of that tax flows into your own wealth instead of to the tax office.",
      beispielKopf: "Example: €65,000 gross a year, payroll tax per month",
      beispiel: [
        { text: "Without property", wert: "€898", anteil: 100, plus: "" },
        { text: "With property, standard depreciation 2%", wert: "€654", anteil: 73, plus: "+ €244 net" },
        { text: "With a report, depreciation 4%", wert: "€525", anteil: 58, plus: "+ €373 net" },
      ],
      passt: "Works especially well with a high tax rate: well paid employees, the self employed, business owners.",
      kenner: [
        "Straight line depreciation: 2% for buildings from 1925, 2.5% before 1925, 3% for new builds from 2023.",
        "A higher rate requires a shorter, proven remaining useful life (§ 7 (4) sentence 2 EStG). The tax office must accept the report.",
        "The calculation must work before tax and with standard depreciation. Anything beyond that is a possible bonus.",
        "Allowance in your payroll tax (§ 39a EStG): more net income every month, usually from the year after purchase.",
      ],
      fuss:
        "Sample calculation from our brochure “Tax savings with property”: tax class I, no children, no church tax, 2026 figures, first full year. Not tax advice.",
    },
    alter: {
      nummer: "Concept 2",
      marke: "Retirement",
      titel: "Buy today. Reap the rewards in retirement.",
      text:
        "The tenant and the tax effect pay off your property over the years. By retirement it belongs to you, and you decide what it does for you.",
      zeitachse: [
        { titel: "Today", text: "You buy with a bank loan." },
        { titel: "The years in between", text: "Tenant and tax help repay." },
        { titel: "Retirement", text: "You have the choice." },
      ],
      wege: [
        {
          marke: "Option A",
          titel: "Sell: a lump sum for retirement.",
          text: "You sell the flat. What remains after the outstanding loan is yours in one go, for travel, family or as a reserve.",
        },
        {
          marke: "Option B",
          titel: "Keep: rent as an extra pension.",
          text: "The flat is paid off. The rent comes to you every month, after running costs as a second pension.",
        },
      ],
      passt: "Works especially well if you think long term and want more in retirement than the state pension.",
      kenner: [
        "Repayment builds equity every month, regardless of market value.",
        "Selling after more than ten years: no private sale for tax purposes (§ 23 EStG). Several sales may count as commercial property dealing; your tax adviser clarifies this.",
        "We calculate without any increase in value. If the value rises, that is a bonus.",
        "We plan the fixed interest period and follow up financing from the start.",
      ],
    },
    beide: "Many combine both: today’s tax saving pays off tomorrow’s extra pension.",
  },

  zwischenruf: {
    titel: "Which concept suits you?",
    text: "We work that out in the free initial consultation, with your figures instead of brochure values.",
    knopf: "Arrange a consultation",
  },

  werWir: {
    kicker: "Who we are",
    titel: "We build, sell and support.",
    intro:
      "OS Real Estate GmbH develops and sells let residential property in Berlin and Brandenburg. Because we are the developer ourselves, you buy directly from us. And because management and financing belong to the same group, everything is close at hand.",
    dach: "OS Immobilien Holding GmbH",
    dachText: "The roof of the group, based in Mittenwalde near Berlin",
    marken: [
      { name: "OS Real Estate GmbH", rolle: "Properties and consultation", text: "Selection, development and sale of checked investment property. Your contact up to the notary." },
      { name: "OS Verwaltungs GmbH", rolle: "Letting and management", text: "Property management and letting management, so that ownership does not become a second job." },
      { name: "OS Finanzierung", rolle: "The way to the bank", text: "Preparing documents, approaching banks and supporting you until the bank decides." },
    ],
    vorteile: [
      { titel: "Commission free", text: "You buy directly from the developer, without an estate agent’s commission." },
      { titel: "Full support", text: "From selection through bank and notary to after the letting." },
      { titel: "Rooted in the region", text: "Berlin, Potsdam, Cottbus and Brandenburg. We offer what we know." },
      { titel: "Honest figures", text: "Cost before tax comes first. If it does not fit, we say so openly." },
    ],
    fuss:
      "You receive every figure and all documents before you decide. Tax, legal and financing questions are for your tax adviser, notary and bank, and we expressly encourage that.",
  },

  faq: {
    kicker: "To be honest",
    titel: "The questions everyone asks.",
    intro: "Good questions deserve honest answers. The most common ones, answered briefly.",
    fragen: [
      {
        frage: "I know nothing about property. Is that a problem?",
        antwort: "No. We explain step by step and make every assumption in the calculation visible. You only decide once you can follow the concept and the property.",
      },
      {
        frage: "Aren’t interest rates too high right now?",
        antwort: "The interest rate alone does not make a good investment. What counts is the overall calculation of price, interest, repayment, rent, costs and tax. A later fall in rates is a bonus, not part of the calculation.",
      },
      {
        frage: "And if the tenant does not pay?",
        antwort: "It can happen, so we plan for it: with a reserve that covers a few monthly instalments and a stress test that shows what three or six months without rent would mean for you.",
      },
      {
        frage: "Aren’t the tax benefits uncertain?",
        antwort: "The tax effect is one building block, not the reason to buy. We show you the cost before tax first, then with standard depreciation. Anything beyond that is checked by your tax adviser.",
      },
      {
        frage: "How much equity do I need?",
        antwort: "That depends on income, property and bank. As a rule, the purchase costs should come from savings, and your safety reserve stays untouched. If it does not fit today, it is a question of timing.",
      },
      {
        frage: "I have no time to look after a flat.",
        antwort: "Day to day, there is the property management and, if you like, a letting management from our group. What stays with you are a few decisions a year and the receipts for your tax return.",
      },
      {
        frage: "I would rather invest in ETFs.",
        antwort: "A good building block that you should keep. Property is an addition with different features: mostly financed by the bank, supported by the tenant, a real asset. Many combine both.",
      },
    ],
  },

  prozess: {
    kicker: "Our process",
    titel: "Seven steps to ownership.",
    intro: "In a fixed order, with one contact. After every step you decide whether to continue.",
    schritte: [
      { titel: "Qualification call", text: "Your goals and your situation.", ergebnis: "You know whether an investment property could suit you." },
      { titel: "Consultation presentation", text: "Concept and calculation with your figures.", ergebnis: "You understand opportunities, costs and risks." },
      { titel: "Property presentation", text: "The right property for you.", ergebnis: "Brochure, calculation and documents to read at leisure." },
      { titel: "Reservation", text: "Free of charge.", ergebnis: "You secure time for your review." },
      { titel: "Financing", text: "The bank’s approval.", ergebnis: "OS Finanzierung supports you until the bank decides." },
      { titel: "Viewing", text: "On the notary day or the day before, online if you prefer.", ergebnis: "You see it for yourself." },
      { titel: "Notary", text: "Notarisation of the purchase contract.", ergebnis: "The flat is yours." },
    ],
  },

  kontakt: {
    kicker: "Your next step",
    titel: "Let’s get to know each other.",
    text: "In the initial consultation we look at your situation together. Here is what you get:",
    punkte: [
      "A clear view of your starting point and your goal",
      "Which concept suits you, tax, pension or both",
      "An honest assessment, even if the answer is no",
    ],
    zusage: "Free of charge, without obligation and without sales pressure.",
    ersatzName: "Your contact",
    terminBuchen: "Book an appointment",
    anfrage: "Send an enquiry",
  },

  fuss: {
    marke: "Investment property in Berlin and the surrounding region. A company of OS Immobilien Holding GmbH.",
    rechtliches: "Legal",
    impressum: "Legal notice (Impressum)",
    datenschutz: "Privacy policy",
    rechte: (jahr: number) => `© ${jahr} OS Real Estate GmbH`,
  },
};

export const MIKROSEITE_OS_TEXTE = { de, en };
