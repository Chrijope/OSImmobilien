/**
 * Texte der persönlichen Partner-Landingpage (`/vp/:slug`, Vorschau
 * `/berater-microseite`) nach dem Umbau vom 16.10.2026 auf OS Real Estate.
 *
 * Inhalte nur, was belegt ist: Objektdaten und Musterrechnung aus den
 * Exposés (Stand Oktober 2026, siehe auch `src/lib/beratungOsDaten.ts`),
 * keine Kennzahlen zur Firma, keine Kundenstimmen. Anrede Du, wie die
 * Beratungspräsentation (Entscheidung Christian, 16.10.2026). Englisch
 * britisch, „you“.
 *
 * Keine Gedankenstriche, in keiner der beiden Sprachen. Minuszeichen in
 * Beträgen sind das echte Minus (U+2212).
 */

export type KonzeptOs = "steuer" | "alter";

const de = {
  kopf: {
    logoAlt: "OS Real Estate GmbH",
  },

  hero: {
    kicker: "OS Real Estate · Berlin und Umland",
    titelZeile1: "Vermögen aufbauen mit",
    titelZeile2: "Immobilien, die sich rechnen.",
    text:
      "Kapitalanlage-Immobilien in Berlin und Brandenburg, ausgewählt, durchgerechnet und persönlich begleitet. Für alle, die Steuern senken oder fürs Alter vorsorgen wollen.",
    knopfTermin: "Kostenloses Erstgespräch vereinbaren",
    knopfObjekte: "Unsere Objekte ansehen",
    bildAlt: "Doppelhaushälfte mit Garten in Zossen-Wünsdorf",
    bildOrt: "Zossen-Wünsdorf, Doppelhaushälfte mit Garten",
    portraetUeber: "Dein persönlicher Ansprechpartner",
  },

  problem: {
    kicker: "Die Ausgangslage",
    titel: "Die gesetzliche Rente allein reicht den meisten nicht.",
    punkte: [
      {
        titel: "Die Rentenlücke",
        text: "Das Rentenniveau liegt bei rund 48 Prozent des Durchschnittsverdiensts, vor Steuern. Wer mehr verdient, dem fehlt im Ruhestand im Verhältnis noch mehr.",
      },
      {
        titel: "Die Steuerlast",
        text: "Ab rund 70.000 € zu versteuerndem Einkommen gehen von jedem zusätzlichen Euro 42 Cent Einkommensteuer ab.",
      },
      {
        titel: "Die Inflation",
        text: "Bei rund 2 Prozent Inflation verliert Erspartes in zehn Jahren etwa ein Fünftel seiner Kaufkraft.",
      },
    ],
    schluss:
      "Eine vermietete Immobilie setzt an allen drei Punkten an: Mieter und Steuerwirkung tragen einen großen Teil der Rate, und am Ende steht ein Sachwert, der dir gehört.",
  },

  konzepte: {
    kicker: "Zwei Konzepte",
    titel: "Steuern senken oder fürs Alter vorsorgen.",
    intro:
      "Welches Konzept passt, hängt von deinem Einkommen, deinem Steuersatz und deinem Ziel ab. Das klären wir gemeinsam im Erstgespräch.",
    nummer: (n: number) => `Konzept ${n}`,
    karten: {
      steuer: {
        marke: "Steuerhebel",
        titel: "Mehr Netto vom Brutto.",
        text: "Für Einkommen mit hohem Steuersatz. Abschreibung, Zinsen und Kosten der vermieteten Wohnung senken das zu versteuernde Einkommen. So fließt ein Teil deiner Lohnsteuer in dein eigenes Vermögen statt ans Finanzamt.",
        objekte: "Unser Objekt: Barfusstraße 9, Berlin-Wedding",
      },
      alter: {
        marke: "Altersvorsorge",
        titel: "Heute kaufen, später Zusatzrente.",
        text: "Für den langfristigen Vermögensaufbau. Mieter und Steuerwirkung zahlen die Immobilie über die Jahre ab. Im Ruhestand gehört sie dir, und die Miete wird zu deiner zweiten Rente.",
        objekte: "Unsere Objekte: Hauffstraße 38 bei Potsdam und Doppelhaushälften in Zossen-Wünsdorf",
      },
    } satisfies Record<KonzeptOs, { marke: string; titel: string; text: string; objekte: string }>,
  },

  objekte: {
    kicker: "Unsere Objekte",
    titel: "Drei Standorte in Berlin und Umland.",
    intro:
      "Zu jedem Objekt gibt es Exposé, Musterrechnung und Unterlagen. Dein Ansprechpartner stellt dir vor, was zu deinem Konzept passt.",
    marke: { steuer: "Steuersparobjekt", alter: "Altersvorsorgeobjekt" } satisfies Record<KonzeptOs, string>,
    liste: [
      {
        ort: "Berlin-Wedding",
        titel: "Barfusstraße 9",
        daten: ["Gründerzeit-Altbau um 1900", "28 Wohnungen", "37 bis 92 m²"],
        preis: "ab 186.850 €",
        bilder: ["Fassade des Gründerzeit-Altbaus", "Luftbild des Altbaus im Wedding", "Altbauwohnung von innen", "Helle Altbaufassade", "Innenhof des Altbaus", "Zimmer mit Dielenboden", "Historische Wohnungstür"],
      },
      {
        ort: "Schwielowsee bei Potsdam",
        titel: "Hauffstraße 38",
        daten: ["Baujahr 2000", "46 Wohnungen", "42 bis 80 m²"],
        preis: "ab 176.000 € inkl. Garage",
        bilder: ["Fassade der Wohnanlage", "Wohnanlage mit Garten", "Luftbild der Wohnanlage am Schwielowsee", "Gläserner Aufzugsturm", "Straßenseite der Wohnanlage", "Wohnraum mit Balkontür", "Helles Zimmer"],
      },
      {
        ort: "Zossen-Wünsdorf",
        titel: "Doppelhaushälften",
        daten: ["600 bis 800 m² Grundstück", "kein Hausgeld"],
        preis: "ab 379.000 €",
        bilder: ["Doppelhaushälfte mit Garten", "Haus an der Luisenstraße in Zossen", "Hausansicht mit Garten in Zossen-Wünsdorf", "Großer Garten", "Flur mit Treppe", "Neue Küche", "Helles Zimmer"],
      },
    ],
    diashow: (objekt: string) => `Bilder ${objekt}`,
    vorher: "Vorheriges Bild",
    weiter: "Nächstes Bild",
    bildNummer: (nummer: number, gesamt: number) => `Bild ${nummer} von ${gesamt}`,
    hinweis: "Angaben laut Exposé, Stand Oktober 2026. Verfügbarkeit und Preise können sich ändern.",
  },

  muster: {
    kicker: "Musterrechnung",
    titel: "So rechnet sich eine Kapitalanlage.",
    intro:
      "Beispiel Hauffstraße 38, Wohnung 01: 42,53 m², 176.000 € inklusive Garage. Monatswerte im ersten Jahr, aus dem Exposé.",
    spalte: "Im Monat, 1. Jahr",
    zeilen: [
      { text: "Miete vom Mieter", betrag: "+ 553 €", ton: "plus" },
      { text: "Garagenmiete", betrag: "+ 100 €", ton: "plus" },
      { text: "Zins und Tilgung (4,8 % / 1,2 %)", betrag: "− 880 €", ton: "minus" },
      { text: "Hausgeld, nicht umlagefähig", betrag: "− 164 €", ton: "minus" },
      { text: "Ergebnis vor Steuern", betrag: "− 391 €", ton: "summe" },
      { text: "Steuerwirkung (3,1 % AfA, 42 %)", betrag: "+ 241 €", ton: "plus" },
      { text: "Dein Eigenanteil nach Steuern", betrag: "− 151 €", ton: "ergebnis" },
      { text: "mit Regel-AfA 2 %", betrag: "≈ − 210 €", ton: "klein" },
    ] as ReadonlyArray<{ text: string; betrag: string; ton: "plus" | "minus" | "summe" | "ergebnis" | "klein" }>,
    karten: [
      { wert: "176 €", text: "Tilgung im Monat, schon im Eigenanteil enthalten. Das ist Vermögen, das dir gehört." },
      { wert: "26.318 €", text: "nach 10 Jahren getilgt" },
      { wert: "278.000 €", text: "Vermögen nach 30 Jahren" },
      { wert: "rund 920 €", text: "Zusatzrente im Monat ab 2061, nach laufenden Kosten rund 590 €" },
      { wert: "14.960 €", text: "Nebenkosten aus Eigenkapital" },
    ],
    fuss:
      "Szenario aus dem Exposé, keine Zusage und keine Steuerberatung. Steuerwirkung als Ersteinschätzung mit 3,1 % AfA (setzt ein Gutachten voraus) und 42 % Grenzsteuersatz einer Musterperson mit 80.000 € brutto im Jahr. Dein Ergebnis hängt von Einkommen, Steuersatz und Finanzierung ab. Die Zusatzrente von 2061 entspricht heute weniger Kaufkraft.",
  },

  warum: {
    kicker: "Warum OS Real Estate",
    titel: "Regional verwurzelt. Persönlich begleitet.",
    intro:
      "Wir konzentrieren uns auf Berlin und das Umland in Brandenburg, zum Beispiel Potsdam und Cottbus. Wir bieten an, was wir kennen.",
    punkte: [
      { titel: "Fokus Berlin und Umland", text: "Berlin, Potsdam, Cottbus und weitere Standorte in Brandenburg statt Objekten quer durch Deutschland." },
      { titel: "Geprüfte Objekte", text: "Lage, Miete, Zustand und Unterlagen prüfen wir, bevor wir ein Objekt anbieten." },
      { titel: "Deine Zahlen zuerst", text: "Jede Rechnung mit deinem Einkommen, vor und nach Steuern. Passt es nicht, sagen wir es offen." },
      { titel: "Ein Ansprechpartner", text: "Vom Erstgespräch über Bank und Notar bis zur Übergabe." },
      { titel: "Offen gesagt", text: "Wir verdienen an der Vermittlung. Steuer-, Rechts- und Finanzierungsberatung leisten Steuerberater, Notare und Banken." },
    ],
    gruppeTitel: "Eine Unternehmensgruppe",
    gruppeText:
      "Die OS Real Estate GmbH gehört zur OS Immobilien Holding GmbH. Unter demselben Dach arbeiten die OS Verwaltungs GmbH für Vermietung und Verwaltung und OS Finanzierung für den Weg zur Bank.",
  },

  referenzen: {
    kicker: "Ausgewählte Referenzen",
    titel: "Unsere Standorte im Bild.",
    intro: "Berlin-Wedding, Schwielowsee bei Potsdam und Zossen-Wünsdorf: drei Standorte, an denen wir heute Objekte anbieten.",
    bilder: [
      { ort: "Berlin-Wedding", alt: "Luftbild Barfusstraße 9 im Wedding" },
      { ort: "Schwielowsee bei Potsdam", alt: "Wohnanlage Hauffstraße 38 mit Garten" },
      { ort: "Zossen-Wünsdorf", alt: "Hausansicht mit Garten in Zossen-Wünsdorf" },
      { ort: "Berlin-Wedding", alt: "Altbauwohnung in der Barfusstraße 9" },
      { ort: "Schwielowsee bei Potsdam", alt: "Luftbild der Wohnanlage Hauffstraße 38" },
      { ort: "Zossen-Wünsdorf", alt: "Haus an der Luisenstraße in Zossen" },
    ],
  },

  prozess: {
    kicker: "Unser Prozess",
    titel: "Elf Schritte bis zum Eigentum.",
    intro: "In fester Reihenfolge. Du weißt bei jedem Schritt, was als Nächstes kommt.",
    schritte: [
      { titel: "Erstgespräch", text: "Deine Situation und deine Ziele." },
      { titel: "Beratungspräsentation", text: "Konzept, Objekte und Rechnung mit deinen Zahlen." },
      { titel: "Selbstauskunft", text: "Einkommen, Ausgaben und Vermögen." },
      { titel: "Unterlagen", text: "Nachweise für die Bank." },
      { titel: "Objektvorstellung", text: "Das Objekt, das zu deinem Konzept passt." },
      { titel: "Reservierung", text: "Kostenfrei." },
      { titel: "Besichtigung", text: "Du siehst das Objekt vor Ort." },
      { titel: "Termin Bankgutachter", text: "Die Bank bewertet das Objekt." },
      { titel: "Finanzierung", text: "Die Zusage der Bank." },
      { titel: "Notar", text: "Beurkundung des Kaufvertrags." },
      { titel: "Kaufpreisfälligkeit", text: "Zahlung des Kaufpreises." },
    ],
  },

  kontakt: {
    kicker: "Dein Ansprechpartner",
    titel: "Lernen wir uns kennen.",
    text:
      "Im Erstgespräch klären wir deine Ausgangslage, dein Ziel und welches Konzept zu dir passt. Kostenlos und unverbindlich.",
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
    kicker: "OS Real Estate · Berlin and region",
    titelZeile1: "Build wealth with",
    titelZeile2: "property that adds up.",
    text:
      "Investment property in Berlin and Brandenburg, carefully selected, fully calculated and with personal support. For anyone who wants to lower their tax or provide for retirement.",
    knopfTermin: "Book a free initial consultation",
    knopfObjekte: "See our properties",
    bildAlt: "Semi-detached house with garden in Zossen-Wünsdorf",
    bildOrt: "Zossen-Wünsdorf, semi-detached house with garden",
    portraetUeber: "Your personal contact",
  },

  problem: {
    kicker: "The starting point",
    titel: "For most people, the state pension alone is not enough.",
    punkte: [
      {
        titel: "The pension gap",
        text: "The German pension level is around 48 percent of average earnings, before tax. The more you earn, the larger the share you lose in retirement.",
      },
      {
        titel: "The tax burden",
        text: "From around €70,000 of taxable income, 42 cents of every additional euro go to income tax.",
      },
      {
        titel: "Inflation",
        text: "At around 2 percent inflation, savings lose about a fifth of their purchasing power in ten years.",
      },
    ],
    schluss:
      "A let property addresses all three: the tenant and the tax effect carry a large part of the instalment, and in the end you own a real asset.",
  },

  konzepte: {
    kicker: "Two concepts",
    titel: "Lower your tax or provide for retirement.",
    intro:
      "Which concept suits you depends on your income, your tax rate and your goal. We work that out together in the initial consultation.",
    nummer: (n: number) => `Concept ${n}`,
    karten: {
      steuer: {
        marke: "Tax lever",
        titel: "More net from your gross.",
        text: "For incomes with a high tax rate. Depreciation, interest and the costs of the let flat reduce your taxable income. Part of your income tax flows into your own wealth instead of to the tax office.",
        objekte: "Our property: Barfusstraße 9, Berlin-Wedding",
      },
      alter: {
        marke: "Retirement",
        titel: "Buy today, extra pension later.",
        text: "For long-term wealth building. The tenant and the tax effect pay off the property over the years. In retirement it belongs to you, and the rent becomes your second pension.",
        objekte: "Our properties: Hauffstraße 38 near Potsdam and semi-detached houses in Zossen-Wünsdorf",
      },
    },
  },

  objekte: {
    kicker: "Our properties",
    titel: "Three locations in Berlin and the surrounding region.",
    intro:
      "Every property comes with a brochure, a sample calculation and documents. Your contact presents what suits your concept.",
    marke: { steuer: "Tax saving property", alter: "Retirement property" },
    liste: [
      {
        ort: "Berlin-Wedding",
        titel: "Barfusstraße 9",
        daten: ["Period building from around 1900", "28 flats", "37 to 92 m²"],
        preis: "from €186,850",
        bilder: ["Facade of the period building", "Aerial view of the building in Wedding", "Interior of a period flat", "Bright period facade", "Courtyard of the building", "Room with wooden floor", "Historic apartment door"],
      },
      {
        ort: "Schwielowsee near Potsdam",
        titel: "Hauffstraße 38",
        daten: ["Built in 2000", "46 flats", "42 to 80 m²"],
        preis: "from €176,000 incl. garage",
        bilder: ["Facade of the residential complex", "Residential complex with garden", "Aerial view of the complex at Schwielowsee", "Glass lift tower", "Street side of the complex", "Living room with balcony door", "Bright room"],
      },
      {
        ort: "Zossen-Wünsdorf",
        titel: "Semi-detached houses",
        daten: ["600 to 800 m² plot", "no service charge"],
        preis: "from €379,000",
        bilder: ["Semi-detached house with garden", "House on Luisenstraße in Zossen", "House with garden in Zossen-Wünsdorf", "Large garden", "Hallway with stairs", "New kitchen", "Bright room"],
      },
    ],
    diashow: (objekt: string) => `Pictures of ${objekt}`,
    vorher: "Previous picture",
    weiter: "Next picture",
    bildNummer: (nummer: number, gesamt: number) => `Picture ${nummer} of ${gesamt}`,
    hinweis: "Details as per brochure, October 2026. Availability and prices may change.",
  },

  muster: {
    kicker: "Sample calculation",
    titel: "How an investment property adds up.",
    intro:
      "Example Hauffstraße 38, flat 01: 42.53 m², €176,000 including garage. Monthly figures in the first year, taken from the brochure.",
    spalte: "Per month, year 1",
    zeilen: [
      { text: "Rent from the tenant", betrag: "+ €553", ton: "plus" },
      { text: "Garage rent", betrag: "+ €100", ton: "plus" },
      { text: "Interest and repayment (4.8% / 1.2%)", betrag: "− €880", ton: "minus" },
      { text: "Service charge, not recoverable", betrag: "− €164", ton: "minus" },
      { text: "Result before tax", betrag: "− €391", ton: "summe" },
      { text: "Tax effect (3.1% depreciation, 42%)", betrag: "+ €241", ton: "plus" },
      { text: "Your own share after tax", betrag: "− €151", ton: "ergebnis" },
      { text: "with standard depreciation of 2%", betrag: "≈ − €210", ton: "klein" },
    ],
    karten: [
      { wert: "€176", text: "repayment per month, already included in your share. That is wealth that belongs to you." },
      { wert: "€26,318", text: "repaid after 10 years" },
      { wert: "€278,000", text: "wealth after 30 years" },
      { wert: "around €920", text: "extra pension per month from 2061, around €590 after running costs" },
      { wert: "€14,960", text: "purchase costs from own funds" },
    ],
    fuss:
      "Scenario from the brochure, not a promise and not tax advice. Tax effect as an initial estimate with 3.1% depreciation (requires a surveyor’s report) and a 42% marginal tax rate for a sample person earning €80,000 gross a year. Your result depends on income, tax rate and financing. The extra pension in 2061 will buy less than today.",
  },

  warum: {
    kicker: "Why OS Real Estate",
    titel: "Rooted in the region. Personal support.",
    intro:
      "We focus on Berlin and the surrounding region of Brandenburg, for example Potsdam and Cottbus. We offer what we know.",
    punkte: [
      { titel: "Focus on Berlin and region", text: "Berlin, Potsdam, Cottbus and other locations in Brandenburg instead of properties all over Germany." },
      { titel: "Checked properties", text: "We check location, rent, condition and documents before we offer a property." },
      { titel: "Your figures first", text: "Every calculation uses your income, before and after tax. If it does not fit, we say so openly." },
      { titel: "One contact", text: "From the initial consultation through bank and notary to the handover." },
      { titel: "To be clear", text: "We earn from the brokerage. Tax, legal and financing advice comes from tax advisers, notaries and banks." },
    ],
    gruppeTitel: "One group of companies",
    gruppeText:
      "OS Real Estate GmbH is part of OS Immobilien Holding GmbH. Under the same roof, OS Verwaltungs GmbH handles letting and management, and OS Finanzierung supports you on the way to the bank.",
  },

  referenzen: {
    kicker: "Selected references",
    titel: "Our locations in pictures.",
    intro: "Berlin-Wedding, Schwielowsee near Potsdam and Zossen-Wünsdorf: three locations where we offer properties today.",
    bilder: [
      { ort: "Berlin-Wedding", alt: "Aerial view of Barfusstraße 9 in Wedding" },
      { ort: "Schwielowsee near Potsdam", alt: "Hauffstraße 38 complex with garden" },
      { ort: "Zossen-Wünsdorf", alt: "House with garden in Zossen-Wünsdorf" },
      { ort: "Berlin-Wedding", alt: "Period flat at Barfusstraße 9" },
      { ort: "Schwielowsee near Potsdam", alt: "Aerial view of the Hauffstraße 38 complex" },
      { ort: "Zossen-Wünsdorf", alt: "House on Luisenstraße in Zossen" },
    ],
  },

  prozess: {
    kicker: "Our process",
    titel: "Eleven steps to ownership.",
    intro: "In a fixed order. At every step you know what comes next.",
    schritte: [
      { titel: "Initial consultation", text: "Your situation and your goals." },
      { titel: "Consultation presentation", text: "Concept, properties and calculation with your figures." },
      { titel: "Personal disclosure", text: "Income, outgoings and assets." },
      { titel: "Documents", text: "Evidence for the bank." },
      { titel: "Property presentation", text: "The property that suits your concept." },
      { titel: "Reservation", text: "Free of charge." },
      { titel: "Viewing", text: "You see the property on site." },
      { titel: "Bank valuation", text: "The bank values the property." },
      { titel: "Financing", text: "The bank’s approval." },
      { titel: "Notary", text: "Notarisation of the purchase contract." },
      { titel: "Purchase price due", text: "Payment of the purchase price." },
    ],
  },

  kontakt: {
    kicker: "Your contact",
    titel: "Let’s get to know each other.",
    text:
      "In the initial consultation we look at your starting point, your goal and which concept suits you. Free of charge and without obligation.",
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
