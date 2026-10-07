/**
 * Die Texte der Berater-Mikroseite (`/vp/:slug`), zweiter Teil: Abschnitte 11
 * bis 16 (Kundenstimmen, Prozess, Vergleich, Bankpartner, Fragen samt
 * Ansprechpartner, Aufruf und Fußzeile), dazu der schwebende Ansprechpartner
 * und der Seitenrahmen (Kopf, „nicht gefunden“, Titel und Beschreibung für
 * Suchmaschinen).
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6. Die Seite ermittelt ihre
 * Sprache selbst, siehe `src/lib/seitenSprache.ts`. Ohne Provider (CRM,
 * Tests) ist alles Deutsch, die deutschen Texte stehen hier unverändert.
 *
 * Englisch: britisch, freundliches „you“. Der Berater heißt nie „advisor“,
 * sondern „your contact person“ (Entscheidung 16). Namen, Orte und Marken
 * bleiben, wie sie sind.
 *
 * Keine Gedankenstriche, in keiner der beiden Sprachen.
 */
import { BERUF_IMMOBILIENBERATER, nurEchteBezeichnung } from "@/lib/berufsbezeichnung";
import type { Sprache } from "@/lib/seitenSprache";

const de = {
  rahmen: {
    laden: "Seite wird geladen",
    nichtGefundenTitel: "Vertriebspartner nicht gefunden",
    nichtGefundenText: "Diese Seite existiert nicht oder wurde deaktiviert.",
    nichtGefundenLink: "Weiter zu osimmobilien.netlify.app",
    seoTitel: (name: string) => `${name}: Vermögensaufbau mit Immobilien | OS Immobilien`,
    seoBeschreibung: (name: string) =>
      `Persönliche Beratung von ${name}: Vermögen aufbauen, Steuern sparen und finanzielle Freiheit erreichen. Jetzt kostenloses Erstgespräch sichern.`,
  },

  erstberatungKnopf: "Kostenlose Erstberatung vereinbaren",

  kundenstimmen: {
    oberzeile: "Stimmen unserer Kunden",
    titel: "Was unsere ",
    titelAkzent: "Kunden sagen",
    unterzeile: "Echte Strategien. Echte Standorte. Messbare Ergebnisse.",
    pausieren: "Kundenstimmen pausieren",
    weiter: "Kundenstimmen weiterlaufen lassen",
    region: "Kundenstimmen",
    /** In der Reihenfolge der Personen in `SocialProofSection`. */
    orte: ["München", "Nürnberg", "Augsburg", "Regensburg", "Würzburg", "Ingolstadt", "Erlangen", "Bamberg", "Fürth"],
    stimmen: [
      "Ich arbeite selbst in der Finanzbranche und habe selten einen so sauberen, strukturierten Prozess gesehen. Was mir besonders gefallen hat: Die Strategie war auf meine Situation zugeschnitten, keine Pauschalempfehlung. Auch steuerlich optimal geplant. Top Leistung, top Partner.",
      "Ich hatte schon mit anderen Anbietern gesprochen, vieles wirkte aufgeblasen oder vage. Hier war es ganz anders: kein Verkaufsdruck, sondern echtes Interesse an meiner Situation. Die perfekte Mischung aus persönlicher Begleitung und digitaler Effizienz.",
      "Was Christian aufgebaut hat, ist nicht nur ein System, sondern ein echtes Vertrauensgerüst für jeden, der Vermögen aufbauen will. Ich wusste an jedem Punkt, was als Nächstes passiert. Ich war nicht nur Kunde, ich war Teil einer durchdachten Strategie.",
      "Ich habe meine erste Kapitalanlage-Wohnung über Christian und sein Team gekauft und hätte mir keinen besseren Start wünschen können. Die Beratung war ehrlich, transparent und ohne typisches Maklergerede. Danke für die starke Begleitung!",
      "Ich habe lange gezögert, in Immobilien zu investieren, zu komplex, dachte ich. Christian hat mir das Thema so klar erklärt, dass ich endlich Sicherheit hatte. Keine leeren Versprechen, sondern ehrliche Beratung mit Plan. Klare Empfehlung!",
      "Als Unternehmer war für mich klar, dass Immobilien ins Portfolio gehören. Aber das alleine stemmen? Keine Chance. Christian und sein Team haben den gesamten Prozess für mich übernommen, von der Objektauswahl bis zum Notar. Ich war beeindruckt, wie reibungslos alles lief.",
      "Eine Freundin hat es empfohlen und ich bin so froh, dass ich den Schritt gegangen bin. In weniger als sechs Wochen war ich Eigentümerin. Das Team war immer erreichbar und hat mich durch jeden Schritt geführt. Besser geht es nicht.",
      "Ich habe schon mehrere Investments getätigt, aber die Qualität der Betreuung bei OS Immobilien ist außergewöhnlich. Alles durchdacht, jede Frage beantwortet, kein Detail vergessen. Wer ernsthaft in Immobilien investieren möchte, ist hier genau richtig.",
      "Ich habe den Schritt erst Ende 40 gewagt, und bereue nur, nicht früher angefangen zu haben. Die Steueroptimierung war ein Game Changer. Und das Beste: Ich muss mich um nichts kümmern. Es läuft einfach.",
    ],
    /** In der Reihenfolge der Zahlen in `SocialProofSection`. */
    kennzahlen: ["Betreute Investoren", "Vermittelte Einheiten", "Berater & Mitarbeiter", "Bankpartner"],
  },

  prozess: {
    oberzeile: "Unser Prozess · Auf Jahre angelegt",
    titel: "Ein Kreislauf, kein einzelner Termin.",
    einleitung:
      "Jeder Schritt baut auf dem vorherigen auf. Nach dem letzten beginnt der nächste Zyklus, mit mehr Erfahrung und einer besseren Ausgangslage.",
    aufruf: "Lass uns prüfen, welche Immobilienstrategie zu deiner Situation passt.",
    schritt: (nummer: string) => `Schritt ${nummer}`,
    schrittMitMeta: (nummer: string, meta: string) => `Schritt ${nummer} · ${meta}`,
    schritte: [
      {
        kurz: "Ausgangsanalyse",
        kurzHandy: "Analyse",
        meta: "Einkommen · Steuerlast · Bonität",
        titel: "Persönliche Ausgangsanalyse",
        satz: "Wir sehen uns Einkommen, Steuerlast, Bonität und Ziele an und halten deine Ausgangslage fest.",
      },
      {
        kurz: "Investmentstrategie",
        kurzHandy: "Strategie",
        meta: "Objektprofil · Finanzierungsrahmen",
        titel: "Individuelle Investmentstrategie",
        satz: "Du bekommst ein Konzept mit passenden Objekten, Finanzierungsrahmen und Blick auf zehn Jahre.",
      },
      {
        kurz: "Finanzierung",
        kurzHandy: "Finanzierung",
        meta: "Bankennetzwerk · Konditionenvergleich",
        titel: "Strukturierte Finanzierung",
        satz: "Mit unserem Bankennetzwerk stimmen wir die Finanzierung auf Bonität und Eigenkapital ab.",
      },
      {
        kurz: "Kaufbegleitung",
        kurzHandy: "Kaufprozess",
        meta: "Unterlagen · Notar · Übergabe",
        titel: "Kaufbegleitung und Umsetzung",
        satz: "Wir begleiten Objektprüfung, Unterlagen und alle Termine bis zur Übergabe.",
      },
      {
        kurz: "Vermietung",
        kurzHandy: "Vermietung",
        meta: "Mieterauswahl · Verwaltung",
        titel: "Vermietung und Verwaltung",
        satz: "Unsere Partner übernehmen Mieterauswahl, Mietmanagement und die laufende Betreuung.",
      },
      {
        kurz: "Portfolioaufbau",
        kurzHandy: "Portfolio",
        meta: "Nächstes Objekt · Steuerhebel",
        titel: "Strategischer Portfolioaufbau",
        satz: "Ist das erste Objekt sauber eingebunden, planen wir mit dir den nächsten Schritt.",
      },
    ],
    ring: {
      unterzeile: "JAHRE · KEINE WOCHEN",
      schritt: (nummer: string) => `SCHRITT ${nummer}`,
      beschreibung: (anzahl: number, namen: string) => `Kreislauf aus ${anzahl} Schritten: ${namen}.`,
    },
    grafik: {
      beschreibung: (name: string) => `Schematische Darstellung: ${name}`,
      fusszeile: "Ablauf, schematisch",
      analyseZeilen: ["Einkommen", "Steuerlast", "Bonität", "Ziele"],
      analyseUnten: "Vier Angaben, ein Bild deiner Ausgangslage",
      strategieObjekte: ["Objekt A", "Objekt B", "Objekt C"],
      strategiePasst: "passt zu deinem Profil",
      strategieZurueck: "geprüft, zurückgestellt",
      strategieUnten: "Ein Konzept, mehrere geprüfte Wege",
      finanzierungBanken: ["Bank 1", "Bank 2", "Bank 3"],
      finanzierungOben: "Konditionen im Vergleich",
      finanzierungUnten: "Das passende Angebot statt des erstbesten",
      kaufStationen: ["Prüfung", "Unterlagen", "Notar", "Übergabe"],
      kaufOben: "Vier Stationen bis zum Eigentum",
      kaufUnten: "Termine und Unterlagen laufen über uns",
      vermietungHaus: "vermietet",
      vermietungMiete: "Mieteingang je Monat",
      vermietungPartner: "Verwaltung und Mieterauswahl über Partner",
      vermietungUnten: "Du bleibst Eigentümer, nicht Hausmeister",
      portfolioObjekte: ["Objekt 1", "Objekt 2", "Objekt 3"],
      portfolioNaechster: "nächster Schritt",
      portfolioUnten: "Ein Objekt nach dem anderen, sauber integriert",
    },
  },

  vergleich: {
    oberzeile: "Im Vergleich",
    titel: "Wie wir uns von klassischen ",
    titelAkzent: "Anbietern unterscheiden.",
    einleitung:
      "Andere verkaufen einzelne Produkte. Wir begleiten dich strategisch beim Aufbau eines ganzen Immobilien-Portfolios. Steueroptimiert, finanziert und verwaltet.",
    leistung: "Leistung",
    spalten: ["Klassischer Makler", "Banking-Berater", "OS Immobilien"],
    empfohlen: "Empfohlen",
    /** In der Reihenfolge der Zeilen in `ComparisonSection`. */
    zeilen: [
      "Persönlicher Ansprechpartner über Jahre",
      "Geprüfte Kapitalanlage-Immobilien",
      "Steueroptimierte Investmentkonzepte",
      "Eigenes Bankennetzwerk (700+ Partner)",
      "Begleitung von Analyse bis Notar",
      "Vermietung & Verwaltung nach Kauf",
      "Langfristiger Portfolioaufbau (10 bis 15 Jahre)",
      "Unabhängig von einzelnen Banken / Produkten",
    ],
    vollstaendig: "Vollständig",
    teilweise: "Teilweise",
    nichtEnthalten: "Nicht enthalten",
  },

  banken: {
    oberzeile: "Finanzierungspartner",
    titel: "Unsere ",
    titelAkzent: "Bankpartner",
    logo: (bank: string) => `${bank} Logo`,
    weitere: "via API-Schnittstelle über 900 weitere Finanzierungspartner",
  },

  fragen: {
    oberzeile: "Persönliche Beratung",
    titel: "Dein persönlicher ",
    titelAkzent: "Ansprechpartner",
    einleitung: "Fragen, die hier nicht beantwortet sind, klären wir am schnellsten im Gespräch.",
    fragenOberzeile: "Deine Fragen",
    fragenTitel: "Häufig gestellte ",
    fragenTitelAkzent: "Fragen",
    liste: [
      { frage: "Sind Immobilien gerade nicht zu teuer?", antwort: "Die Preise haben 2022/23 spürbar korrigiert und stabilisieren sich seitdem. Entscheidend ist ohnehin nicht der absolute Preis, sondern das Verhältnis aus Kaufpreis, Miete, Zins und Steuereffekt. Genau das rechnen wir für deine Situation durch, wenn es sich nicht trägt, sagen wir dir das." },
      { frage: "Warum nicht einfach ETFs?", antwort: "ETFs sind eine sehr gute Anlageform, und wir raten niemandem davon ab. Eine Immobilie kann aber zwei Dinge, die ein Depot nicht kann: Sie lässt sich zu großen Teilen mit Bankgeld finanzieren, und sie senkt deine laufende Steuerlast. Für viele ist die Kombination aus beidem die beste Lösung, nicht das Entweder-oder." },
      { frage: "Was passiert, wenn der Mieter nicht zahlt?", antwort: "Eine berechtigte Sorge. Deshalb prüfen unsere Verwaltungspartner Mieter vor Vertragsabschluss, und für den Ernstfall gibt es Mietausfallversicherungen. In der Kalkulation rechnen wir zusätzlich mit Puffern statt mit Vollvermietung über die gesamte Laufzeit." },
      { frage: "Ich habe wenig Eigenkapital, geht das trotzdem?", antwort: "Häufig ja. In vielen Fällen wird der Kaufpreis vollständig finanziert, und du bringst nur die Kaufnebenkosten von rund 7 % ein. Ob das in deinem Fall darstellbar ist, hängt von Einkommen und Bonität ab und lässt sich im Erstgespräch schnell klären." },
      { frage: "Was ist mit Sanierungspflicht und Energiegesetzgebung?", antwort: "Ein Grund, warum wir auf Neubau und kernsanierte Objekte setzen: Beide erfüllen aktuelle energetische Anforderungen bereits. Bei Bestandsobjekten prüfen wir den Energiestandard vorab und kalkulieren eine Modernisierungsrücklage von Anfang an mit ein." },
      { frage: "Wie hoch ist mein Eigenkapitaleinsatz?", antwort: "Das hängt von Bonität, Einkommen und Zielsetzung ab. In vielen Fällen strukturieren wir Finanzierungen mit minimalem Eigenkapitaleinsatz, bis hin zu 100 % Bankfinanzierung des Kaufpreises. Der genaue Rahmen wird im Erstgespräch ermittelt." },
      { frage: "Welche Renditen sind realistisch?", antwort: "Wir arbeiten mit Szenarioanalysen über 10 und 15 Jahre. Rendite entsteht aus vier Quellen: Mietüberschuss, Steuerersparnis, Tilgung durch den Mieter und Wertentwicklung. Im Konzept zeigen wir jeden Hebel einzeln, inklusive der Jahre, in denen die Immobilie Geld kostet." },
      { frage: "Wie sicher ist die Kapitalanlage?", antwort: "Sicherheit entsteht durch Standort, Substanz und Struktur. Wir investieren in wirtschaftsstarke Regionen mit nachhaltigem Nachfrageüberhang und prüfen jedes Objekt baulich, rechtlich und steuerlich. Ein Restrisiko bleibt, wie bei jeder Anlage, wir machen es transparent, statt es wegzureden." },
      { frage: "Muss ich mich selbst um die Vermietung kümmern?", antwort: "Nein. Vermietung, Mieterprüfung, Mietmanagement und laufende Betreuung übernehmen wir beziehungsweise unsere geprüften Verwaltungspartner. Du investierst Kapital, nicht Zeit." },
      { frage: "Wie funktioniert die Finanzierung?", antwort: "Über unser Bankennetzwerk entwickeln wir das passende Modell, vergleichen Konditionen, strukturieren Tilgung und Laufzeit und begleiten den gesamten Antragsprozess. Wo möglich, binden wir zinsgünstige KfW-Förderdarlehen ein." },
      { frage: "Wie lange dauert der Prozess?", antwort: "Das Erstgespräch dauert etwa 45 Minuten. Strategie, Objektauswahl und Finanzierung sind in der Regel in wenigen Wochen umgesetzt, abhängig vom individuellen Setup." },
    ],
  },

  ansprechpartner: {
    oberzeile: "Dein Ansprechpartner",
    /** Nur, wenn gar kein Profil geladen ist (Vorschau im CRM ohne Einstellungen). */
    ersatzName: "Dein Ansprechpartner",
    /** Feste Bezeichnung, wenn der Partner keine eigene gepflegt hat. */
    rueckfallPosition: BERUF_IMMOBILIENBERATER,
    zitat:
      "„Ich begleite dich persönlich auf dem Weg zu deiner Kapitalanlage Immobilie, von der ersten Beratung bis zur schlüsselfertigen Übergabe. Lass uns gemeinsam deine beste Investition finden.\"",
  },

  schwebend: {
    kopf: "Dein persönlicher Ansprechpartner",
    schliessen: "Schließen",
    buchen: "Erstgespräch buchen",
    mehr: "Mehr erfahren",
    knopf: "Dein Ansprechpartner",
  },

  abschluss: {
    titel: "Starte jetzt in deine ",
    titelAkzent: "finanzielle Zukunft",
    einleitung:
      "In einem kostenlosen Erstgespräch analysieren wir deine Situation und zeigen dir, wie du mit einer Kapitalanlage Immobilie Vermögen aufbaust und Steuern sparst.",
    ohneRisiko: "Keine versteckten Kosten. Kein Risiko. Nur Mehrwert.",
    vorteile: [
      "100 % kostenlos & unverbindlich",
      "Persönliche Beratung in 15 Minuten",
      "Individuelle Steuerberechnung inklusive",
    ],
  },

  fuss: {
    marke:
      "Immobilien als Kapitalanlage ohne Eigenkapital. Steueroptimierte Investmentstrategien mit Full-Service-Betreuung.",
    mailBeschriftung: "E-Mail",
    aufDieserSeite: "Auf dieser Seite",
    erstberatung: "Erstberatung",
    investmentCheck: "KI-Investment-Check",
    unternehmen: "Unternehmen",
    kontakt: "Kontakt",
    erstgespraech: "Erstgespräch buchen",
    rechtliches: "Rechtliches",
    impressum: "Impressum",
    datenschutz: "Datenschutz",
    rechte: (jahr: number) => `© ${jahr} OS Immobilien Holding GmbH. Alle Rechte vorbehalten.`,
    gemacht: "Made with care in Germany.",
  },
};

export type MikroseiteAbschlussTexte = typeof de;

const en: MikroseiteAbschlussTexte = {
  rahmen: {
    laden: "Loading page",
    nichtGefundenTitel: "Sales partner not found",
    nichtGefundenText: "This page does not exist or has been deactivated.",
    nichtGefundenLink: "Continue to osimmobilien.netlify.app",
    seoTitel: (name: string) => `${name}: Building wealth with property | OS Immobilien`,
    seoBeschreibung: (name: string) =>
      `A personal consultation with ${name}: build wealth, save tax and work towards financial freedom. Book your free initial consultation now.`,
  },

  erstberatungKnopf: "Book a free initial consultation",

  kundenstimmen: {
    oberzeile: "Customer voices",
    titel: "What our ",
    titelAkzent: "customers say",
    unterzeile: "Real strategies. Real locations. Measurable results.",
    pausieren: "Pause customer reviews",
    weiter: "Resume customer reviews",
    region: "Customer reviews",
    orte: ["Munich", "Nuremberg", "Augsburg", "Regensburg", "Würzburg", "Ingolstadt", "Erlangen", "Bamberg", "Fürth"],
    stimmen: [
      "I work in the finance industry myself and have rarely seen such a clean, well-structured process. What I liked most: the strategy was tailored to my situation, not a one-size-fits-all recommendation. The tax side was planned perfectly too. Top service, top partner.",
      "I had already spoken to other providers, and a lot of it felt inflated or vague. Here it was completely different: no sales pressure, just genuine interest in my situation. The perfect mix of personal support and digital efficiency.",
      "What Christian has built isn't just a system, it's a real framework of trust for anyone who wants to build wealth. At every point I knew what would happen next. I wasn't just a customer, I was part of a well-thought-out strategy.",
      "I bought my first investment flat through Christian and his team and couldn't have wished for a better start. The consultation was honest, transparent and free of the usual estate agent talk. Thanks for the great support!",
      "I hesitated for a long time to invest in property; too complex, I thought. Christian explained it so clearly that I finally felt confident. No empty promises, just honest guidance with a plan. Highly recommended!",
      "As a business owner, it was clear to me that property belongs in my portfolio. But handling it all on my own? No chance. Christian and his team took over the entire process for me, from choosing the property to the notary. I was impressed by how smoothly everything went.",
      "A friend recommended it and I'm so glad I took the step. In less than six weeks I was a property owner. The team was always available and guided me through every step. It doesn't get any better.",
      "I've made several investments before, but the quality of support at OS Immobilien is exceptional. Everything well thought through, every question answered, no detail forgotten. If you're serious about investing in property, this is the right place.",
      "I only took the plunge in my late forties, and my only regret is not starting sooner. The tax optimisation was a game changer. And the best part: I don't have to take care of anything. It just runs.",
    ],
    kennzahlen: ["Investors supported", "Units brokered", "Sales partners and staff", "Bank partners"],
  },

  prozess: {
    oberzeile: "Our process · Built for years",
    titel: "A cycle, not a one-off appointment.",
    einleitung:
      "Each step builds on the one before. After the last one, the next cycle begins, with more experience and a better starting position.",
    aufruf: "Let's check which property strategy suits your situation.",
    schritt: (nummer: string) => `Step ${nummer}`,
    schrittMitMeta: (nummer: string, meta: string) => `Step ${nummer} · ${meta}`,
    schritte: [
      {
        kurz: "Initial analysis",
        kurzHandy: "Analysis",
        meta: "Income · Tax burden · Creditworthiness",
        titel: "Personal initial analysis",
        satz: "We look at your income, tax burden, creditworthiness and goals and record your starting position.",
      },
      {
        kurz: "Investment strategy",
        kurzHandy: "Strategy",
        meta: "Property profile · Financing framework",
        titel: "Individual investment strategy",
        satz: "You receive a concept with suitable properties, a financing framework and a ten-year outlook.",
      },
      {
        kurz: "Financing",
        kurzHandy: "Financing",
        meta: "Banking network · Comparison of terms",
        titel: "Structured financing",
        satz: "Using our banking network, we tailor the financing to your creditworthiness and equity.",
      },
      {
        kurz: "Purchase support",
        kurzHandy: "Purchase",
        meta: "Documents · Notary · Handover",
        titel: "Purchase support and completion",
        satz: "We support you through the property checks, the documents and every appointment up to the handover.",
      },
      {
        kurz: "Letting",
        kurzHandy: "Letting",
        meta: "Tenant selection · Management",
        titel: "Letting and management",
        satz: "Our partners take care of tenant selection, rent management and ongoing support.",
      },
      {
        kurz: "Portfolio building",
        kurzHandy: "Portfolio",
        meta: "Next property · Tax leverage",
        titel: "Strategic portfolio building",
        satz: "Once the first property is properly integrated, we plan the next step with you.",
      },
    ],
    ring: {
      unterzeile: "YEARS · NOT WEEKS",
      schritt: (nummer: string) => `STEP ${nummer}`,
      beschreibung: (anzahl: number, namen: string) => `A cycle of ${anzahl} steps: ${namen}.`,
    },
    grafik: {
      beschreibung: (name: string) => `Schematic illustration: ${name}`,
      fusszeile: "Process, schematic",
      analyseZeilen: ["Income", "Tax burden", "Creditworthiness", "Goals"],
      analyseUnten: "Four details, one picture of your starting position",
      strategieObjekte: ["Property A", "Property B", "Property C"],
      strategiePasst: "matches your profile",
      strategieZurueck: "checked, set aside",
      strategieUnten: "One concept, several vetted options",
      finanzierungBanken: ["Bank 1", "Bank 2", "Bank 3"],
      finanzierungOben: "Terms compared",
      finanzierungUnten: "The right offer, not the first one",
      kaufStationen: ["Checks", "Documents", "Notary", "Handover"],
      kaufOben: "Four stages to ownership",
      kaufUnten: "We handle appointments and documents",
      vermietungHaus: "let",
      vermietungMiete: "Rent received per month",
      vermietungPartner: "Managed and let via partners",
      vermietungUnten: "You stay the owner, not the caretaker",
      portfolioObjekte: ["Property 1", "Property 2", "Property 3"],
      portfolioNaechster: "next step",
      portfolioUnten: "One property at a time, properly integrated",
    },
  },

  vergleich: {
    oberzeile: "Comparison",
    titel: "How we differ from ",
    titelAkzent: "traditional providers.",
    einleitung:
      "Others sell individual products. We support you strategically as you build an entire property portfolio. Tax-optimised, financed and managed.",
    leistung: "Service",
    spalten: ["Traditional estate agent", "Bank consultant", "OS Immobilien"],
    empfohlen: "Recommended",
    zeilen: [
      "Personal contact person for years",
      "Vetted investment properties",
      "Tax-optimised investment concepts",
      "Own banking network (700+ partners)",
      "Support from analysis to notary",
      "Letting and management after purchase",
      "Long-term portfolio building (10 to 15 years)",
      "Independent of individual banks or products",
    ],
    vollstaendig: "Fully included",
    teilweise: "Partly",
    nichtEnthalten: "Not included",
  },

  banken: {
    oberzeile: "Financing partners",
    titel: "Our ",
    titelAkzent: "bank partners",
    logo: (bank: string) => `${bank} logo`,
    weitere: "plus more than 900 further financing partners via API connection",
  },

  fragen: {
    oberzeile: "Personal consultation",
    titel: "Your personal ",
    titelAkzent: "contact person",
    einleitung: "Anything not answered here is quickest to clear up in a conversation.",
    fragenOberzeile: "Your questions",
    fragenTitel: "Frequently asked ",
    fragenTitelAkzent: "questions",
    liste: [
      { frage: "Isn't property too expensive right now?", antwort: "Prices corrected noticeably in 2022/23 and have been stabilising since. In any case, what matters isn't the absolute price but the relationship between purchase price, rent, interest and tax effect. That's exactly what we calculate for your situation, and if it doesn't add up, we'll tell you." },
      { frage: "Why not just ETFs?", antwort: "ETFs are a very good form of investment, and we don't talk anyone out of them. But a property can do two things a securities account can't: it can largely be financed with the bank's money, and it lowers your ongoing tax burden. For many people the combination of both is the best solution, not one or the other." },
      { frage: "What happens if the tenant doesn't pay?", antwort: "A fair concern. That's why our property management partners check tenants before a tenancy agreement is signed, and rent default insurance is available for the worst case. In our calculations we also build in buffers instead of assuming full occupancy for the entire term." },
      { frage: "I don't have much equity. Can it still work?", antwort: "Often, yes. In many cases the purchase price is fully financed and you only contribute the incidental purchase costs of around 7%. Whether that is feasible in your case depends on your income and creditworthiness and can be clarified quickly in the initial consultation." },
      { frage: "What about renovation obligations and energy legislation?", antwort: "That's one reason why we focus on new builds and fully refurbished properties: both already meet current energy requirements. For existing buildings we check the energy standard in advance and factor in a modernisation reserve from the start." },
      { frage: "How much equity do I need to put in?", antwort: "That depends on your creditworthiness, income and goals. In many cases we structure financing with minimal equity, up to 100% bank financing of the purchase price. The exact scope is worked out in the initial consultation." },
      { frage: "What returns are realistic?", antwort: "We work with scenario analyses over 10 and 15 years. Returns come from four sources: rental surplus, tax relief, repayment funded by the tenant and increase in value. In the concept we show each lever separately, including the years in which the property costs money." },
      { frage: "How safe is the investment?", antwort: "Safety comes from location, substance and structure. We invest in economically strong regions with lasting excess demand and check every property structurally, legally and for tax purposes. As with any investment, some residual risk remains; we make it transparent instead of talking it away." },
      { frage: "Do I have to handle the letting myself?", antwort: "No. Letting, tenant screening, rent management and ongoing support are handled by us or our vetted property management partners. You invest capital, not time." },
      { frage: "How does the financing work?", antwort: "Through our banking network we develop the right model, compare terms, structure repayment and term, and support you through the entire application process. Where possible, we include low-interest KfW development loans." },
      { frage: "How long does the process take?", antwort: "The initial consultation takes about 45 minutes. Strategy, choice of property and financing are usually completed within a few weeks, depending on your individual set-up." },
    ],
  },

  ansprechpartner: {
    oberzeile: "Your contact person",
    ersatzName: "Your contact person",
    rueckfallPosition: "Sales partner",
    zitat:
      "“I’ll personally guide you on your way to your investment property, from the first consultation to the turnkey handover. Let’s find your best investment together.”",
  },

  schwebend: {
    kopf: "Your contact person at OS Immobilien",
    schliessen: "Close",
    buchen: "Book an initial call",
    mehr: "Find out more",
    knopf: "Your contact person",
  },

  abschluss: {
    titel: "Start building your ",
    titelAkzent: "financial future",
    einleitung:
      "In a free initial consultation we analyse your situation and show you how an investment property can help you build wealth and save tax.",
    ohneRisiko: "No hidden costs. No risk. Just added value.",
    vorteile: [
      "100% free and without obligation",
      "Personal consultation within 15 minutes",
      "Individual tax calculation included",
    ],
  },

  fuss: {
    marke:
      "Investment property without equity. Tax-optimised investment strategies with full-service support.",
    mailBeschriftung: "Email",
    aufDieserSeite: "On this page",
    erstberatung: "Initial consultation",
    investmentCheck: "AI investment check",
    unternehmen: "Company",
    kontakt: "Contact",
    erstgespraech: "Book an initial call",
    rechtliches: "Legal",
    impressum: "Legal notice (Impressum)",
    datenschutz: "Privacy policy",
    rechte: (jahr: number) =>
      `© ${jahr} OS Immobilien Holding GmbH. All rights reserved.`,
    gemacht: "Made with care in Germany.",
  },
};

export const MIKROSEITE_ABSCHLUSS_TEXTE = { de, en };

/**
 * Die Berufsbezeichnung unter dem Namen des Partners.
 *
 * Eine selbst gepflegte Bezeichnung aus der Datenbank bleibt, wie sie ist,
 * auch auf der englischen Seite. Nur der feste deutsche Rückfall
 * „Immobilienberater“ wird auf Englisch zu „Sales partner“, wie im Kopf der Seite, nie
 * „advisor“ (Entscheidung 16).
 *
 * Annahme: Die Seite setzt den Rückfall schon beim Laden ein
 * (`BeraterMicroseite.tsx`), danach ist er von einer gleichlautenden eigenen
 * Angabe nicht mehr zu unterscheiden. Beide werden deshalb gleich behandelt.
 */
export function positionFuerAnzeige(position: string | null | undefined, sprache: Sprache): string {
  const echt = nurEchteBezeichnung(position);
  if (!echt || echt === BERUF_IMMOBILIENBERATER) return MIKROSEITE_ABSCHLUSS_TEXTE[sprache].ansprechpartner.rueckfallPosition;
  return echt;
}
