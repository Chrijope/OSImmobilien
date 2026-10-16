/**
 * Sichtbare Texte der Berater-Mikroseite (`/vp/:slug`), erster Teil, auf
 * Deutsch und auf Englisch: Leistungen (`bento`), Investorenprofile
 * (`investoren`) und die Bildunterschriften der Investmentkonzepte, die die
 * Handbuch-Seite für ihre Clips liest (`investmentwelten.welten`).
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6 (anonyme Seiten). Die übrigen
 * Abschnitte der alten Mikroseite sind mit dem Umbau auf OS Real Estate
 * (16.10.2026) entfallen; die neue Seite liest `mikroseiteOsTexte.ts`.
 *
 * - Englisch ist britisch, Fachbegriffe nach `kundenspracheGlossar.ts`. Der
 *   Berater heißt nie „advisor“, sondern „your contact“.
 * - Keine Gedankenstriche, in keiner der beiden Sprachen.
 *
 * Ohne `SeitenSpracheProvider` (CRM, Vorschau) gilt immer Deutsch.
 */

/* ══════════════════════════════════════════════════════════════
   Deutsch
   ══════════════════════════════════════════════════════════════ */

const de = {
  bento: {
    kicker: "Was du bekommst",
    titelZeile1: "Alles, was du für ein",
    titelZeile2: "erstes Investment brauchen.",
    text: "Geprüfte Objekte, zwei klare Konzepte und ein Ansprechpartner, der dich über Jahre begleitet. Aus einer Unternehmensgruppe.",
    objekte: {
      eyebrow: "Objekte",
      titel: "Geprüfte Kapitalanlagen in Berlin und Umland.",
      text: "Lage, Miete, Zustand und Unterlagen prüfen wir, bevor wir dir ein Objekt vorstellen.",
    },
    steuern: {
      eyebrow: "Steuern",
      titel: "AfA, Zinsen, Werbungskosten.",
      text: "Die Steuerwirkung ist in jeder Rechnung eingeplant.",
    },
    finanzierung: {
      eyebrow: "Finanzierung",
      titel: "OS Finanzierung.",
      text: "Begleitung auf dem Weg zur Bank, von den Unterlagen bis zur Zusage.",
    },
    strategie: {
      eyebrow: "Strategie",
      titel: "Portfolio-Aufbau über 10 bis 15 Jahre.",
      text: "Klarer Plan statt Einzelkauf, Schritt für Schritt zum eigenen Vermögen.",
    },
    betreuung: {
      eyebrow: "Betreuung",
      titel: "Ein Ansprechpartner. Über Jahre.",
      text: "Kein Callcenter, keine Weitergabe. Du sprichst immer mit derselben Person.",
    },
  },

  investmentwelten: {
    welten: [
      {
        clipAlt: "Rundgang durch das Neubauprojekt, von außen nach innen",
        label: "Neubau",
        claim: "Für die höchste Steuerlast.",
        text: "Erstbezug, volle Gewährleistung, keine Instandhaltungsüberraschungen. Der stärkste Abschreibungshebel in den ersten Jahren und die geringste Arbeit für dich.",
        hebel: "5 % Sonderabschreibung nach § 7b zusätzlich zur degressiven AfA",
        passt: "Hohe Steuerlast, langer Horizont, wenig Zeit",
      },
      {
        clipAlt: "Drohnenanflug über die sanierte Wohnanlage",
        label: "Sanierter Bestand",
        claim: "Der bewährte Einstieg.",
        text: "Gewachsene Lage, vorhandene Mieterstruktur, planbare Mieten und meist der attraktivere Quadratmeterpreis. Kernsaniert, also technisch neuwertig bei Bestandsvorteilen.",
        hebel: "Laufende AfA plus sofort absetzbarer Erhaltungsaufwand",
        passt: "Solider Start mit überschaubarem Risiko",
      },
      {
        clipAlt: "Rundgang durch die möblierte Wohnung",
        label: "WG- & Co-Living",
        claim: "Für die höchste Mietrendite.",
        text: "Eine Wohnung, mehrere möblierte Einheiten, all-inclusive vermietet und professionell verwaltet. Deutlich höhere Rendite pro Quadratmeter bei aktiverem Konzept.",
        hebel: "AfA auf Gebäude und Möblierung, höherer Mietüberschuss",
        passt: "Renditeorientiert, offen für moderne Konzepte",
      },
    ],
  },

  investoren: {
    kicker: "Für wen wir passen",
    titelVor: "Vier Investoren-Profile,",
    titelVarianten: ["ein klares Konzept", "eine klare Strategie", "ein klarer Plan"],
    intro:
      "Es gibt nicht die eine richtige Kapitalanlage. Es gibt die richtige für deine Steuerlast, deine Bonität und deinen Zeithorizont. Welcher Weg das ist, entscheidet deine Situation, nicht unser Angebot.",
    bahnLabel: "Vier Investoren-Profile, seitlich blätterbar",
    profile: [
      {
        kicker: "Unternehmer",
        titel: "Du führst dein eigenes Unternehmen.",
        text: "Du erzielst regelmäßig starke Gewinne und möchtest nicht dein gesamtes Vermögen im Unternehmen binden. Mit der richtigen Immobilienstrategie schaffst du planbare Sachwerte, Steuereffekte und Vermögenswachstum außerhalb des operativen Geschäfts.",
        punkte: [
          "GmbH- oder Holding-Strukturen sinnvoll einbinden",
          "Steuerliche Gestaltungspotenziale strategisch nutzen",
          "Privatvermögen außerhalb des Unternehmens aufbauen",
        ],
        hinweis: "Geeignet ab ca. 8.000 € Gewinn pro Monat",
      },
      {
        kicker: "Gutverdiener",
        titel: "Du verdienst überdurchschnittlich.",
        text: "Du arbeitest erfolgreich, zahlst hohe Steuern und hast wenig Zeit, dich selbst um Objektauswahl, Finanzierung und Strategie zu kümmern. OS Real Estate hilft dir, deine Bonität gezielt für ein Immobilienportfolio einzusetzen.",
        punkte: [
          "Starke Bonität als Investmentvorteil nutzen",
          "Immobilienstrategie mit Steuerfokus entwickeln",
          "Einstiegsoptionen auch ohne großes Eigenkapital prüfen",
        ],
        hinweis: "Geeignet ab ca. 4.500 € netto pro Monat",
      },
      {
        kicker: "Selbstständige",
        titel: "Du bist selbstständig oder freiberuflich tätig.",
        text: "Dein Einkommen ist stark, aber nicht immer gleichmäßig. Viele Banken bewerten Selbstständige zu pauschal. Wir bereiten deine Unterlagen sorgfältig auf und prüfen Finanzierungen mit Partnern, die unternehmerische Einkommen verstehen.",
        punkte: [
          "Finanzierungspartner mit Erfahrung bei Selbstständigen",
          "Sorgfältige Aufbereitung deines Bonitätsprofils",
          "Schritt für Schritt zu einem robusten Portfolio",
        ],
        hinweis: "Geeignet ab ca. 3 Jahren Selbstständigkeit",
      },
      {
        kicker: "Angestellte",
        titel: "Du bist festangestellt und willst strukturiert starten.",
        text: "Stabiles Einkommen und gute Bonität sind ideale Voraussetzungen für den Einstieg in deine erste Kapitalanlage-Immobilie. OS Real Estate hilft dir, die Finanzierung sauber zu planen und Steuervorteile sinnvoll zu nutzen.",
        punkte: [
          "Erste Kapitalanlage sicher und planbar angehen",
          "Einkommen und Bonität gezielt einsetzen",
          "Steuervorteile beim Immobilien-Vermögensaufbau nutzen",
        ],
        hinweis: "Geeignet ab ca. 2.800 € netto pro Monat",
      },
    ],
  },
};

export type MikroseiteTexte = typeof de;

/* ══════════════════════════════════════════════════════════════
   Englisch
   ══════════════════════════════════════════════════════════════ */

const en: MikroseiteTexte = {
  bento: {
    kicker: "What you get",
    titelZeile1: "Everything you need for your",
    titelZeile2: "first investment.",
    text: "Checked properties, two clear concepts and one contact person who supports you for years. All from one group of companies.",
    objekte: {
      eyebrow: "Properties",
      titel: "Checked investment properties in Berlin and the surrounding region.",
      text: "We check location, rent, condition and documents before we present a property to you.",
    },
    steuern: {
      eyebrow: "Taxes",
      titel: "Depreciation (AfA), interest, expenses.",
      text: "The tax effect is part of every calculation.",
    },
    finanzierung: {
      eyebrow: "Financing",
      titel: "OS Finanzierung.",
      text: "Support on the way to the bank, from the documents to the approval.",
    },
    strategie: {
      eyebrow: "Strategy",
      titel: "Portfolio building over 10 to 15 years.",
      text: "A clear plan instead of a one-off purchase, step by step towards your own wealth.",
    },
    betreuung: {
      eyebrow: "Support",
      titel: "One contact person. For years.",
      text: "No call centre, no hand-offs. You always speak to the same person.",
    },
  },

  investmentwelten: {
    welten: [
      {
        clipAlt: "Tour of the new-build project, from outside to inside",
        label: "New build",
        claim: "For the highest tax burden.",
        text: "First occupancy, full warranty, no maintenance surprises. The strongest depreciation lever in the early years and the least work for you.",
        hebel: "5% special depreciation (Section 7b EStG) on top of declining-balance depreciation (AfA)",
        passt: "High tax burden, long horizon, little time",
      },
      {
        clipAlt: "Drone approach over the refurbished residential complex",
        label: "Refurbished existing property",
        claim: "The proven way in.",
        text: "Established location, existing tenants, predictable rents and usually the more attractive price per square metre. Fully refurbished, so technically as good as new with the advantages of an existing building.",
        hebel: "Ongoing depreciation plus immediately deductible maintenance expenses (Erhaltungsaufwand)",
        passt: "A solid start with manageable risk",
      },
      {
        clipAlt: "Tour of the furnished flat",
        label: "Shared flat & co-living",
        claim: "For the highest rental yield.",
        text: "One flat, several furnished units, let all-inclusive and professionally managed. Significantly higher yield per square metre with a more active concept.",
        hebel: "Depreciation on the building and furnishings, higher rental surplus",
        passt: "Yield-focused investors open to modern concepts",
      },
    ],
  },

  investoren: {
    kicker: "Who we're right for",
    titelVor: "Four investor profiles,",
    titelVarianten: ["one clear concept", "one clear strategy", "one clear plan"],
    intro:
      "There's no single right investment. There's the right one for your tax burden, your creditworthiness and your time horizon. Which route that is depends on your situation, not on what we offer.",
    bahnLabel: "Four investor profiles, swipe sideways",
    profile: [
      {
        kicker: "Business owners",
        titel: "You run your own company.",
        text: "You regularly make strong profits and don't want to tie up all your wealth in the business. With the right property strategy, you build predictable real assets, tax effects and wealth growth outside your operating business.",
        punkte: [
          "Integrate limited company (GmbH) or holding structures sensibly",
          "Use tax planning opportunities strategically",
          "Build private wealth outside the company",
        ],
        hinweis: "Suitable from approx. €8,000 profit per month",
      },
      {
        kicker: "High earners",
        titel: "You earn above average.",
        text: "You're successful at work, pay high taxes and have little time to handle property selection, financing and strategy yourself. OS Real Estate helps you use your creditworthiness specifically for a property portfolio.",
        punkte: [
          "Use strong creditworthiness as an investment advantage",
          "Develop a property strategy with a tax focus",
          "Explore ways in even without much equity",
        ],
        hinweis: "Suitable from approx. €4,500 net per month",
      },
      {
        kicker: "Self-employed",
        titel: "You're self-employed or a freelancer.",
        text: "Your income is strong, but not always steady. Many banks assess the self-employed too broadly. We prepare your documents professionally and check financing with partners who understand entrepreneurial income.",
        punkte: [
          "Financing partners experienced with the self-employed",
          "Professional preparation of your credit profile",
          "Step by step to a robust portfolio",
        ],
        hinweis: "Suitable after approx. 3 years of self-employment",
      },
      {
        kicker: "Employees",
        titel: "You're permanently employed and want a structured start.",
        text: "A stable income and good creditworthiness are ideal for getting into your first investment property. OS Real Estate helps you plan financing properly and use tax advantages sensibly.",
        punkte: [
          "Approach your first investment safely and predictably",
          "Use income and creditworthiness purposefully",
          "Use tax advantages when building wealth through property",
        ],
        hinweis: "Suitable from approx. €2,800 net per month",
      },
    ],
  },
};

export const MIKROSEITE_TEXTE = { de, en };
