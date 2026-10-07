/**
 * Die Texte des Lead-Funnels der Berater-Mikroseite (`LeadFunnelDialog`),
 * auf Deutsch und auf Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 6. Wichtig: Hier steht nur, was
 * der Besucher LIEST. Was an das CRM geht (Notizen, `meta.funnelData`,
 * Quelle), bleibt deutsch und steht als gespeicherter Wert im Dialog selbst.
 * Die Auswahllisten hier gehören deshalb Stelle für Stelle zu den Wertelisten
 * dort, gleiche Reihenfolge, gleiche Länge. Der Test prüft das.
 *
 * Die Einwilligung kommt wörtlich aus `src/lib/leadEinwilligung.ts`, damit
 * der gespeicherte Nachweis genau den Wortlaut trägt, den der Besucher im
 * Formular gelesen hat.
 *
 * Englisch: britisch, freundliches „you“, Beträge in Euro als „€1,234“.
 * Keine Gedankenstriche, in keiner der beiden Sprachen.
 */
import {
  LEAD_EINWILLIGUNG_FEHLT,
  LEAD_EINWILLIGUNG_FEHLT_EN,
  LEAD_EINWILLIGUNG_TEXT,
  LEAD_EINWILLIGUNG_TEXT_EN,
  LEAD_WERBUNG_TEXT,
  LEAD_WERBUNG_TEXT_EN,
} from "@/lib/leadEinwilligung";
import { euroText } from "@/lib/sprachFormat";

/** „€2,500 to €4,000“ */
const vonBis = (von: number, bis: number) => `${euroText(von, "en")} to ${euroText(bis, "en")}`;
/** „€10,000+“ */
const ab = (wert: number) => `${euroText(wert, "en")}+`;

const de = {
  dialogTitel: "Beratung anfragen",
  schrittVon: (schritt: number, gesamt: number) => `Schritt ${schritt} von ${gesamt}`,

  beruf: {
    titel: "Berufliche Situation",
    untertitel: "Was beschreibt dich am besten?",
    optionen: ["Angestellt", "Selbstständig", "Unternehmer/in", "Freiberufler/in", "Beamter/Beamtin", "Aktuell ohne Einkommen"],
  },

  /* Die angezeigten deutschen Spannen sind dieselben Texte wie die
     gespeicherten Werte im Dialog, deshalb stehen sie hier wörtlich. */
  einkommen: {
    angestellt: {
      titel: "Monatliches Nettoeinkommen",
      untertitel: "Damit wir passende Objekte für dich finden",
      optionen: ["2.500, 4.000 €", "4.000, 6.000 €", "6.000, 10.000 €", "10.000+ €"],
    },
    selbststaendig: {
      titel: "Jährlicher Gesamtumsatz / Gewinn",
      untertitel: "Für eine individuelle Empfehlung",
      optionen: ["50.000, 100.000 €", "100.000, 200.000 €", "200.000, 500.000 €", "500.000+ €"],
    },
    unternehmer: {
      titel: "Jährlicher Unternehmensgewinn / Entnahme",
      untertitel: "Zur Einschätzung deines Investitionsrahmens",
      optionen: ["80.000, 150.000 €", "150.000, 300.000 €", "300.000, 500.000 €", "500.000+ €"],
    },
  },

  immobilien: {
    titel: "Bestehende Immobilien",
    untertitel: "Besitzt du bereits Kapitalanlagen?",
    optionen: ["Nein, keine", "Ja, 1 Immobilie", "Ja, 2 bis 3 Immobilien", "Ja, 4+ Immobilien"],
  },

  eigenkapital: {
    titel: "Verfügbares Eigenkapital",
    untertitel: "Wie viel könntest du einbringen?",
    optionen: ["Kein Eigenkapital", "5.000, 20.000 €", "20.000, 50.000 €", "50.000, 100.000 €", "100.000+ €"],
  },

  ziele: {
    titel: "Deine Anlageziele",
    untertitel: "Mehrfachauswahl möglich",
    optionen: [
      "Vermögensaufbau",
      "Steueroptimierung",
      "Altersvorsorge",
      "Nächste Generation absichern",
      "Inflationsschutz",
      "Passives Einkommen",
    ],
  },

  rahmen: {
    titel: "Investitionsrahmen",
    untertitel: "Hilft uns, passende Objekte auszuwählen",
    volumenFrage: "Gewünschtes Investitionsvolumen",
    volumenOptionen: ["100.000, 200.000 €", "200.000, 350.000 €", "350.000, 500.000 €", "500.000+ €", "Bin mir noch unsicher"],
    zeitFrage: "Wann möchtest du investieren?",
    zeitOptionen: [
      "So schnell wie möglich",
      "In den nächsten 3 Monaten",
      "In den nächsten 6 Monaten",
      "In den nächsten 12 Monaten",
      "Nur informieren",
    ],
  },

  kontakt: {
    titel: "Deine Kontaktdaten",
    untertitel: "Für dein persönliches Erstgespräch",
    vorname: "Vorname *",
    nachname: "Nachname *",
    email: "E-Mail *",
    telefon: "Telefonnummer *",
    kontaktzeit: "Bevorzugte Kontaktzeit *",
    beispielVorname: "Max",
    beispielNachname: "Mustermann",
    beispielEmail: "max@beispiel.de",
    beispielTelefon: "+49 123 456 7890",
    kontaktzeitOptionen: [
      "Vormittags (9 bis 12 Uhr)",
      "Mittags (12 bis 14 Uhr)",
      "Nachmittags (14 bis 17 Uhr)",
      "Abends (17 bis 20 Uhr)",
      "Flexibel",
    ],
    kostenlosTitel: "100 % kostenlos & unverbindlich",
    kostenlosText: "Kein Kleingedrucktes. Kein Risiko. Nur Mehrwert für dich.",
  },

  fehler: {
    vorname: "Vorname ist erforderlich",
    nachname: "Nachname ist erforderlich",
    emailFehlt: "E-Mail ist erforderlich",
    emailUngueltig: "Bitte gültige E-Mail eingeben",
    telefonFehlt: "Telefonnummer ist erforderlich",
    telefonUngueltig: "Bitte gültige Telefonnummer eingeben",
    kontaktzeit: "Bitte wähle eine Kontaktzeit",
  },

  einwilligung: {
    pflicht: LEAD_EINWILLIGUNG_TEXT,
    werbung: LEAD_WERBUNG_TEXT,
    fehlt: LEAD_EINWILLIGUNG_FEHLT,
    datenschutz: "Mehr dazu in der Datenschutzerklärung",
  },

  sendeFehlerTitel: "Deine Anfrage kam nicht an",

  knopf: {
    zurueck: "Zurück",
    weiter: "Weiter",
    absenden: "Erstgespräch anfordern",
    erneut: "Erneut senden",
    sendet: "Wird gesendet...",
  },

  danke: {
    srTitel: "Anfrage gesendet",
    titel: (vorname: string) => `Vielen Dank, ${vorname}!`,
    textVor: "Wir haben deine Anfrage erhalten und melden uns ",
    textNach: " bei dir, persönlich und unverbindlich.",
    /** Dieselbe Reihenfolge wie `kontakt.kontaktzeitOptionen`. */
    zeiten: [
      "vormittags (9 bis 12 Uhr)",
      "mittags (12 bis 14 Uhr)",
      "nachmittags (14 bis 17 Uhr)",
      "abends (17 bis 20 Uhr)",
      "flexibel",
    ],
    zurueck: "Zurück zur Seite",
  },

  ohneEinkommen: {
    srTitel: "Hinweis",
    titel: "Vielen Dank für dein Interesse",
    text1:
      "Für eine Investition in Kapitalanlage-Immobilien ist ein regelmäßiges Einkommen eine Grundvoraussetzung für die Finanzierung.",
    text2: "Sobald sich deine berufliche Situation ändert, komm gerne wieder auf uns zu.",
    knopf: "Verstanden",
  },
};

export type LeadFunnelTexte = typeof de;

const en: LeadFunnelTexte = {
  dialogTitel: "Request a consultation",
  schrittVon: (schritt: number, gesamt: number) => `Step ${schritt} of ${gesamt}`,

  beruf: {
    titel: "Your professional situation",
    untertitel: "What describes you best?",
    optionen: [
      "Employed",
      "Self-employed",
      "Business owner",
      "Freelancer",
      "Civil servant (Beamter)",
      "Currently without income",
    ],
  },

  einkommen: {
    angestellt: {
      titel: "Monthly net income",
      untertitel: "So we can find suitable properties for you",
      optionen: [vonBis(2500, 4000), vonBis(4000, 6000), vonBis(6000, 10000), ab(10000)],
    },
    selbststaendig: {
      titel: "Annual total revenue / profit",
      untertitel: "For an individual recommendation",
      optionen: [vonBis(50000, 100000), vonBis(100000, 200000), vonBis(200000, 500000), ab(500000)],
    },
    unternehmer: {
      titel: "Annual company profit / withdrawals",
      untertitel: "To assess your investment scope",
      optionen: [vonBis(80000, 150000), vonBis(150000, 300000), vonBis(300000, 500000), ab(500000)],
    },
  },

  immobilien: {
    titel: "Existing properties",
    untertitel: "Do you already own investment properties?",
    optionen: ["No, none", "Yes, 1 property", "Yes, 2 to 3 properties", "Yes, 4+ properties"],
  },

  eigenkapital: {
    titel: "Available equity",
    untertitel: "How much could you contribute?",
    optionen: ["No equity", vonBis(5000, 20000), vonBis(20000, 50000), vonBis(50000, 100000), ab(100000)],
  },

  ziele: {
    titel: "Your investment goals",
    untertitel: "You can choose more than one",
    optionen: [
      "Building wealth",
      "Tax optimisation",
      "Retirement provision",
      "Providing for the next generation",
      "Protection against inflation",
      "Passive income",
    ],
  },

  rahmen: {
    titel: "Investment framework",
    untertitel: "Helps us select suitable properties",
    volumenFrage: "Desired investment volume",
    volumenOptionen: [
      vonBis(100000, 200000),
      vonBis(200000, 350000),
      vonBis(350000, 500000),
      ab(500000),
      "I'm not sure yet",
    ],
    zeitFrage: "When would you like to invest?",
    zeitOptionen: [
      "As soon as possible",
      "In the next 3 months",
      "In the next 6 months",
      "In the next 12 months",
      "Just gathering information",
    ],
  },

  kontakt: {
    titel: "Your contact details",
    untertitel: "For your personal initial consultation",
    vorname: "First name *",
    nachname: "Last name *",
    email: "Email *",
    telefon: "Phone number *",
    kontaktzeit: "Preferred contact time *",
    beispielVorname: "Jane",
    beispielNachname: "Smith",
    beispielEmail: "jane@example.com",
    beispielTelefon: "+49 123 456 7890",
    kontaktzeitOptionen: [
      "Morning (9:00 to 12:00)",
      "Midday (12:00 to 14:00)",
      "Afternoon (14:00 to 17:00)",
      "Evening (17:00 to 20:00)",
      "Flexible",
    ],
    kostenlosTitel: "100% free and without obligation",
    kostenlosText: "No small print. No risk. Just added value for you.",
  },

  fehler: {
    vorname: "First name is required",
    nachname: "Last name is required",
    emailFehlt: "Email is required",
    emailUngueltig: "Please enter a valid email address",
    telefonFehlt: "Phone number is required",
    telefonUngueltig: "Please enter a valid phone number",
    kontaktzeit: "Please choose a contact time",
  },

  einwilligung: {
    pflicht: LEAD_EINWILLIGUNG_TEXT_EN,
    werbung: LEAD_WERBUNG_TEXT_EN,
    fehlt: LEAD_EINWILLIGUNG_FEHLT_EN,
    datenschutz: "More in our privacy policy",
  },

  sendeFehlerTitel: "Your request didn't reach us",

  knopf: {
    zurueck: "Back",
    weiter: "Next",
    absenden: "Request initial consultation",
    erneut: "Send again",
    sendet: "Sending...",
  },

  danke: {
    srTitel: "Request sent",
    titel: (vorname: string) => `Thank you, ${vorname}!`,
    textVor: "We've received your request and will get in touch ",
    textNach: ", personally and without obligation.",
    zeiten: [
      "in the morning (9:00 to 12:00)",
      "around midday (12:00 to 14:00)",
      "in the afternoon (14:00 to 17:00)",
      "in the evening (17:00 to 20:00)",
      "at a time that suits you",
    ],
    zurueck: "Back to the page",
  },

  ohneEinkommen: {
    srTitel: "Note",
    titel: "Thank you for your interest",
    text1: "A regular income is a basic requirement for financing an investment property.",
    text2: "As soon as your professional situation changes, feel free to get back in touch.",
    knopf: "Understood",
  },
};

export const LEAD_FUNNEL_TEXTE = { de, en };

/**
 * Die gespeicherten Werte zu den Auswahllisten oben. NIE übersetzen.
 *
 * Sie gehen so, wie sie hier stehen, in die Notizen und in `meta.funnelData`
 * an das CRM, auch ein im Browser liegender Entwurf trägt sie. Deshalb sind
 * sie in jeder Sprache deutsch. Angezeigt wird der Text mit demselben Index
 * aus `LEAD_FUNNEL_TEXTE`. Die Kontaktzeiten behalten ihren alten Wortlaut
 * samt Bis-Strich, damit bestehende Notizen und Entwürfe gleich bleiben; die
 * Anzeige steht ohne Strich in `kontakt.kontaktzeitOptionen`.
 */
export const LEAD_FUNNEL_WERTE = {
  /** Reihenfolge wie `beruf.optionen`. Das Zeichen davor ist Schmuck, kein Text. */
  beruf: [
    { value: "angestellt", icon: "💼" },
    { value: "selbststaendig", icon: "🏠" },
    { value: "unternehmer", icon: "🚀" },
    { value: "freiberufler", icon: "✏️" },
    { value: "beamter", icon: "🏛️" },
    { value: "arbeitslos", icon: "⏸️" },
  ],
  einkommen: {
    angestellt: ["2.500, 4.000 €", "4.000, 6.000 €", "6.000, 10.000 €", "10.000+ €"],
    selbststaendig: ["50.000, 100.000 €", "100.000, 200.000 €", "200.000, 500.000 €", "500.000+ €"],
    unternehmer: ["80.000, 150.000 €", "150.000, 300.000 €", "300.000, 500.000 €", "500.000+ €"],
  } satisfies Record<keyof LeadFunnelTexte["einkommen"], string[]>,
  /** Reihenfolge wie `ziele.optionen`. */
  ziele: [
    { value: "vermögensaufbau", icon: "📈" },
    { value: "steueroptimierung", icon: "💰" },
    { value: "altersvorsorge", icon: "🏖️" },
    { value: "naechste-generation", icon: "👨‍👩‍👧‍👦" },
    { value: "inflationsschutz", icon: "🛡️" },
    { value: "passives-einkommen", icon: "🔄" },
  ],
  eigenkapital: ["Kein Eigenkapital", "5.000, 20.000 €", "20.000, 50.000 €", "50.000, 100.000 €", "100.000+ €"],
  volumen: ["100.000, 200.000 €", "200.000, 350.000 €", "350.000, 500.000 €", "500.000+ €", "Bin mir noch unsicher"],
  zeitrahmen: [
    "So schnell wie möglich",
    "In den nächsten 3 Monaten",
    "In den nächsten 6 Monaten",
    "In den nächsten 12 Monaten",
    "Nur informieren",
  ],
  immobilien: ["keine", "1", "2-3", "4+"],
  kontaktzeit: ["Vormittags (9–12 Uhr)", "Mittags (12–14 Uhr)", "Nachmittags (14–17 Uhr)", "Abends (17–20 Uhr)", "Flexibel"],
};
