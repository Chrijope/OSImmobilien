/**
 * Strukturierte Seed-Daten für die Unterlagen-Seite.
 * Wird über appConfigStore (Schlüssel: "unterlagen_struktur") gespeichert,
 * damit Admins editieren können und alle Nutzer dieselbe Struktur sehen.
 */


export type UnterlagenAktion =
  | "pdf-download"        // generiert ein PDF on-the-fly über pdfKey
  | "internal-link"       // navigiert auf interneRoute innerhalb des CRMs
  | "external-link"       // öffnet url in neuem Tab
  | "upload"              // klassischer Datei-Link (url befüllt)
  | "tool-inline";        // rendert ein Tool/Komponente direkt (toolKey)

export interface UnterlagenDokument {
  id: string;
  name: string;
  beschreibung?: string;
  aktion?: UnterlagenAktion;
  url?: string;
  interneRoute?: string;
  pdfKey?: string;        // Schlüssel auf PDF-Generator
  toolKey?: string;       // Schlüssel auf Inline-Tool (z. B. "rechnungs-generator")
  gesperrt?: boolean;     // "Bald verfügbar" Badge
  nurAdmin?: boolean;     // Admin sieht "Entwurf", VP sieht "Bald verfügbar"
  /**
   * Abgeloeste Fassung. Traegt das Badge "Alt" und wird zusammen mit
   * nurAdmin nur noch der Leitung gezeigt. Loeschen waere endgueltig,
   * deshalb bleiben die alten Praesentationen als Nachschlagewerk erhalten.
   */
  alt?: boolean;
  vorschauUrl?: string;   // Optionales Vorschaubild (z. B. Logo-Thumbnail)
  download?: boolean;     // Direkt herunterladen statt im neuen Tab öffnen
}

export interface UnterlagenAbschnitt {
  id: string;
  name: string;
  beschreibung?: string;
  customRender?: "wissenswert" | "rechnungs-generator";
  dokumente: UnterlagenDokument[];
}

export const UNTERLAGEN_VERSION = "34";

/**
 * Einträge, die es nicht mehr gibt.
 *
 * Die gespeicherte Struktur wird bewusst nicht bei jeder Änderung neu
 * aufgesetzt, sonst gingen Christians eigene Ergänzungen verloren. Ein aus dem
 * Seed gestrichener Eintrag bliebe deshalb in bestehenden Installationen
 * stehen. Diese Ids werden beim Laden gezielt entfernt.
 */
/**
 * Neue Seed-Einträge, die auch in einer schon gespeicherten Liste erscheinen
 * sollen. Ein Versionssprung würde die gespeicherte Liste durch den Seed
 * ersetzen und selbst angelegte Dokumente verwerfen; deshalb werden diese Ids
 * beim Laden gezielt hinter ihrem Vorgänger im Seed eingefügt, falls sie fehlen.
 */
export const NACHGETRAGENE_DOKUMENT_IDS: string[] = [
  // Neuer Zoom-Hintergrund vom 21.10.2026, hinter „Zoom-Hintergrund 8“.
  "m-zoom-desktop-11",
];

export const ENTFERNTE_DOKUMENT_IDS: string[] = [
  // Haushaltsrechner / Bonitätsrechner: die Seite gibt es nicht mehr.
  "b-haushalt",
  // Unsere Kultur ist in den eigenen Abschnitt "kultur" umgezogen (neue Id k-kultur).
  "p-kultur",
  // Abgeloeste Beratungspraesentationen. Es bleibt nur die OS Immobilien-Fassung.
  // Seit 20.10.2026 ist Fassung B die einzige und liegt unter der Haupt-Adresse.
  "p-beratung-b",
  "p-beratung-neu",
  "p-beratung",
  "p-beratung-wg",
  "p-beratung-bestand",
  // Hintergrundbilder 9 und 10 waren byte-gleiche Dubletten von 7 und 8
  // (SHA-256 geprueft am 29.09.2026).
  "m-zoom-desktop-9",
  "m-zoom-desktop-10",
  // "Lead-Pakete & Zuteilung verstehen": veraltet, am 29.09.2026 gelöscht.
  "la-pakete",
  // Vertragsmuster unter "Karriere & Finanzen": am 16.10.2026 entfernt, es bleibt nur die Zielplanung.
  "k-hvv-vertrag",
  "k-hvv-anlage-1",
  "k-hvv-anlage-2",
  "k-hvv-anlage-3",
  "k-hvv-anlage-4",
  "k-hvv-anlage-5",
  "k-hvv-anlage-6",
  "k-hvv-anlage-7",
  // Alte OS-Immobilien-Logos unter "Marketing": am 16.10.2026 entfernt, es bleiben die OS-Real-Estate-Logos.
  "m-logo",
  "m-logo-wortmarke",
  "m-icon",
];

export function seedUnterlagen(): UnterlagenAbschnitt[] {
  return [
    // ─── 0. Unsere Werte, unsere Kultur ───
    // Eigener Abschnitt ueber der Praesentation (Wunsch Christian,
    // 30.08.2026): Bei Praesentation bleiben nur Webfassung und PDF der
    // Beratungspraesentation, die Kultur bekommt ihr eigenes Zuhause.
    {
      id: "kultur",
      name: "Unsere Werte, unsere Kultur",
      beschreibung: "Wofür wir stehen und wogegen wir antreten",
      dokumente: [
        {
          id: "k-kultur",
          name: "Unsere Kultur",
          beschreibung: "Werte, Standards, Glaubenssätze und wogegen wir antreten. Mit den Glaubenssätzen als Plakatseiten zum Aufhängen",
          aktion: "pdf-download",
          pdfKey: "kultur-manifest",
        },
      ],
    },

    // ─── 1. Präsentation ───
    {
      id: "praesentation",
      name: "Präsentation",
      beschreibung: "Beratungspräsentation und Verkaufsmaterialien",
      dokumente: [
        // Die aktuelle Fassung steht oben und ist die einzige, die alle sehen.
        {
          id: "p-beratung-hv",
          name: "Beratungspräsentation OS Immobilien",
          beschreibung: "Der aktuelle Gesprächsablauf mit Fragenblock, drei durchgerechneten Objekten und der Selbstauskunft am Ende",
          aktion: "internal-link",
          interneRoute: "/beratungspraesentation-osimmobilien",
        },
        {
          id: "p-beratung-pdf",
          name: "Beratungspräsentation als PDF",
          beschreibung: "Zum Herunterladen und Präsentieren, mit ausfüllbaren Feldern. Im Termin bevorzugt die Webfassung (Beratungspräsentation OS Immobilien) nutzen",
          aktion: "external-link",
          url: "/dokumente/beratungspraesentation.pdf",
        },
        // Nur noch die aktuelle OS Immobilien-Fassung. Die abgeloesten Varianten
        // wurden entfernt, damit ueberall dieselbe Praesentation steht.
      ],
    },

    // ─── 2. Lead-Arbeit ───
    {
      id: "leadarbeit",
      name: "Lead-Arbeit",
      beschreibung: "Lead-Handling, Erstkontakt, Follow-Up & DSGVO – dein Komplett-Playbook",
      dokumente: [
        {
          id: "la-24h",
          name: "24-h-Regel: Warum Speed alles entscheidet",
          beschreibung: "Reaktionsfenster, Wochenend-Leads, WhatsApp-Brücke & Voicemail",
          aktion: "internal-link",
          interneRoute: "/leadarbeit/24h-regel",
        },
        {
          id: "la-erstkontakt",
          name: "Erstkontakt-Skript & Qualifizierung",
          beschreibung: "BANT, Termin-Setting & der direkte Sprung ins Kundenprofil",
          aktion: "internal-link",
          interneRoute: "/leadarbeit/erstkontakt",
        },
        {
          id: "la-warm-kalt",
          name: "Warm vs. Kalt – richtig priorisieren",
          beschreibung: "Sofort-Anruf vs. WhatsApp-Brücke – die richtige Reihenfolge",
          aktion: "internal-link",
          interneRoute: "/leadarbeit/warm-vs-kalt",
        },
        {
          id: "la-followup",
          name: "Follow-Up-Strategie & Nachfass-Rhythmus",
          beschreibung: "Gestaffelte Wartezeiten bis zum 15. Versuch, Multi-Kanal & der automatische Lost-Trigger",
          aktion: "internal-link",
          interneRoute: "/leadarbeit/follow-up",
        },
        {
          id: "la-dsgvo",
          name: "Häufige Fehler & DSGVO-Stolpersteine",
          beschreibung: "B2C-Spezialfall, Cold-Mail-Verbot, Duplikate, Lösch-Anfragen",
          aktion: "internal-link",
          interneRoute: "/leadarbeit/fehler-dsgvo",
        },
      ],
    },

    // ─── 3. Bonitätsunterlagen ───
    {
      id: "bonitaet",
      name: "Bonitätsunterlagen",
      beschreibung: "Alles rund um Bonitätsprüfung und Bankunterlagen",
      dokumente: [
        {
          id: "b-schufa",
          name: "Schufa-Bestellung (selbstauskunft.de)",
          beschreibung: "Direkter Bestelllink für die Schufa-Selbstauskunft",
          aktion: "external-link",
          url: "https://selbstauskunft.de/?gad_source=1&gad_campaignid=20743780254#form",
        },
        {
          id: "b-mietfrei",
          name: "Mietfreibestätigung",
          beschreibung: "PDF-Vorlage für mietfreies Wohnen (verbessert die Bonität)",
          aktion: "pdf-download",
          pdfKey: "mietfreibestaetigung",
        },
        {
          id: "b-checkliste",
          name: "Checkliste Bonitätsunterlagen",
          beschreibung: "Vollständige Übersicht mit Erklärung, warum jede Unterlage benötigt wird",
          aktion: "internal-link",
          interneRoute: "/bonitaet/checkliste",
        },
      ],
    },

    // ─── 3. Beratung & Abschluss ───
    {
      id: "beratung-abschluss",
      name: "Beratung & Abschluss",
      beschreibung: "Tools und Steuer-Strategien für die Abschlussphase",
      dokumente: [
        {
          id: "ba-kundentypen",
          name: "Die vier Kundentypen",
          beschreibung: "Rot, Gelb, Grün, Blau erkennen und richtig führen. Kurzfassung mit Grafiken, Präsentation als PDF oben rechts",
          aktion: "internal-link",
          interneRoute: "/unterlagen/kundentypen",
        },
        {
          id: "ba-afa",
          name: "AfA-Rechner",
          beschreibung: "Berechnung der Abschreibungen für die Steueroptimierung",
          aktion: "internal-link",
          interneRoute: "/afa-rechner",
        },
        {
          id: "ba-lohnsteuer",
          name: "Lohnsteueroptimierung durch Immobilien",
          beschreibung: "Eintragung in die Lohnsteuerkarte – Mehr Netto vom Brutto",
          aktion: "internal-link",
          interneRoute: "/aftersales/lohnsteueroptimierung",
        },
        {
          id: "ba-ehegatten",
          name: "Ehegattenschaukel",
          beschreibung: "AfA-Volumen erneuern nach 10-Jahres-Frist",
          aktion: "internal-link",
          interneRoute: "/aftersales/ehegattenschaukel",
        },
        {
          id: "ba-kinder",
          name: "Verkauf & Übertragung an Kinder",
          beschreibung: "Schenkung, Verkauf oder Nießbrauch – Vermögensübertragung steueroptimiert",
          aktion: "internal-link",
          interneRoute: "/aftersales/verkauf-an-kinder",
        },
      ],
    },

    // ─── 4. Aftersales – Steuerwissen ───
    {
      id: "aftersales",
      name: "Aftersales & Steuerwissen",
      beschreibung: "Steuerstrategien rund um den Verkauf nach 10 Jahren",
      dokumente: [
        {
          id: "as-steuerwissen",
          name: "Steuerwissen kompakt – Kapitalanlageimmobilie",
          beschreibung: "Hochwertiger Leitfaden für den steueroptimierten Verkauf",
          aktion: "internal-link",
          interneRoute: "/aftersales/steuerwissen",
        },
        {
          id: "as-steuersaetze",
          name: "Steuersätze nach Einkommenshöhe",
          beschreibung: "Übersicht der relevanten Steuersätze mit Beispielrechnungen",
          aktion: "internal-link",
          interneRoute: "/aftersales/steuersaetze",
        },
        {
          id: "as-checkliste-steuer",
          name: "Checkliste maximale Steuerersparnis",
          beschreibung: "Schritt-für-Schritt zur optimalen Steuerersparnis",
          aktion: "internal-link",
          interneRoute: "/aftersales/steuerersparnis",
        },
        {
          id: "as-elter-anleitung",
          name: "Senkung der Lohnsteuer – Elster-Anleitung",
          beschreibung: "Anleitung zur Eintragung des Freibetrags in Elster",
          aktion: "internal-link",
          interneRoute: "/aftersales/elster-anleitung",
        },
        {
          id: "as-beratungsdokument",
          name: "Aftersales-Beratungsdokument",
          beschreibung: "Pflicht-Dokument zwischen VP und Kunde nach Verkaufsabschluss",
          aktion: "pdf-download",
          pdfKey: "aftersales-beratung",
        },
      ],
    },

    // ─── 5. Wissenswert ───
    {
      id: "wissenswert",
      name: "Wissenswert",
      beschreibung: "Aktuelle Artikel rund um Immobilien als Kapitalanlage",
      customRender: "wissenswert",
      dokumente: [],
    },

    // ─── 6. Karriere & Finanzen ───
    {
      id: "karriere",
      name: "Karriere & Finanzen",
      beschreibung: "Zielplanung",
      dokumente: [
        {
          id: "k-zielplanung",
          name: "Zielplanung",
          beschreibung: "Berechne und speichere deine Provisionsziele",
          aktion: "internal-link",
          interneRoute: "/zielplanung",
        },
      ],
    },

    // ─── 7. Marketing ───
    {
      id: "marketing",
      name: "Marketing",
      beschreibung: "Logos und Marketing-Materialien",
      dokumente: [
        {
          id: "m-logo-real-estate-gestapelt",
          name: "OS Real Estate GmbH Logo, gestapelt (transparent)",
          beschreibung: "OS oben, darunter REAL ESTATE und GMBH. PNG ohne Hintergrund",
          aktion: "external-link",
          url: "/images/os-real-estate-logo-gestapelt.png",
          vorschauUrl: "/images/os-real-estate-logo-gestapelt.png",
          download: true,
        },
        {
          id: "m-logo-real-estate-quer",
          name: "OS Real Estate GmbH Logo, quer (transparent)",
          beschreibung: "OS groß links, rechts REAL ESTATE und darunter GMBH. PNG ohne Hintergrund",
          aktion: "external-link",
          url: "/images/os-real-estate-logo-quer.png",
          vorschauUrl: "/images/os-real-estate-logo-quer.png",
          download: true,
        },
        {
          id: "m-zoom-desktop-1",
          name: "Zoom-Hintergrund 1: Konferenzraum, Milchglas",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-1.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-1.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-2",
          name: "Zoom-Hintergrund 2: Betonwand, Tageslicht",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-2.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-2.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-3",
          name: "Zoom-Hintergrund 3: Konferenzraum, Abendlicht",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-3.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-3.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-4",
          name: "Zoom-Hintergrund 4: Chefbüro, Holzwand",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-4.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-4.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-5",
          name: "Zoom-Hintergrund 5: Besprechungsraum, Grün",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-5.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-5.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-6",
          name: "Zoom-Hintergrund 6: Großraumbüro, Blick über Berlin",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-6.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-6.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-7",
          name: "Zoom-Hintergrund 7: Beratungsraum, hell",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-7.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-7.jpg?v=2",
          download: true,
        },
        {
          id: "m-zoom-desktop-8",
          name: "Zoom-Hintergrund 8: Betonwand, Abend",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-8.jpg?v=2",
          vorschauUrl: "/images/zoom/os-real-estate-buero-8.jpg?v=2",
          download: true,
        },
        {
          // Christian, 21.10.2026. Id 11, weil 9 und 10 als entfernte Dubletten gesperrt sind.
          id: "m-zoom-desktop-11",
          name: "Zoom-Hintergrund 9: Betonwand, Lichtleiste",
          beschreibung: "Wirkt wie unser Büro: 1920 × 1080, mit OS Real Estate Logo",
          aktion: "external-link",
          url: "/images/zoom/os-real-estate-buero-11.jpg?v=1",
          vorschauUrl: "/images/zoom/os-real-estate-buero-11.jpg?v=1",
          download: true,
        },
      ],
    },

    // ─── 8. Organisation ───
    {
      id: "organisation",
      name: "Organisation",
      beschreibung: "Anleitungen und Tools für deinen Arbeitsalltag",
      dokumente: [
        {
          id: "o-mail-anleitung",
          name: "Anleitung OS Immobilien Mail einrichten",
          beschreibung: "Komplette Anleitung für Apple iPhone, Apple MacBook und Outlook (one.com) – PDF zum Download",
          aktion: "pdf-download",
          pdfKey: "mail-setup-anleitung",
        },
        {
          id: "o-rechnung",
          name: "Rechnungsvorlage für Partner",
          beschreibung: "Erstelle Rechnungen mit deinen Stammdaten und versende direkt an die Buchhaltung",
          aktion: "internal-link",
          interneRoute: "/unterlagen/rechnungsvorlage",
        },
        {
          id: "o-email-signatur",
          name: "E-Mail-Signatur für Apple Mail",
          beschreibung: "Einheitliche OS Immobilien-Signatur mit deinen persönlichen Daten + Schritt-für-Schritt-Anleitung",
          aktion: "internal-link",
          interneRoute: "/unterlagen/email-signatur",
        },
      ],
    },

    // ─── 9. Vorlagen & Leitfäden ───
    {
      id: "leitfaeden",
      name: "Vorlagen & Leitfäden",
      beschreibung: "Gesprächsleitfäden für Kalt- und Warmkontakte",
      dokumente: [
        {
          id: "l-kaltakquise",
          name: "Leitfaden Kaltakquise",
          beschreibung: "Verkaufspsychologisch aufgebaute Gesprächsleitfäden",
          aktion: "internal-link",
          interneRoute: "/leitfaeden/kaltakquise",
        },
        {
          id: "l-warm",
          name: "Leitfaden Warmkontakte / Empfehlungen",
          beschreibung: "Authentische Eröffnung für Empfehlungs-Kontakte",
          aktion: "internal-link",
          interneRoute: "/leitfaeden/warmkontakte",
        },
        {
          id: "l-einwand",
          name: "Einwandbehandlung Kapitalanlage",
          beschreibung: "Antworten auf typische Einwände im Immobilienvertrieb",
          aktion: "internal-link",
          interneRoute: "/leitfaeden/einwandbehandlung",
        },
      ],
    },
  ];
}

/**
 * Fuegt neue Seed-Eintraege (NACHGETRAGENE_DOKUMENT_IDS) in eine gespeicherte
 * Liste ein, hinter ihren Vorgaenger im Seed, sonst ans Ende des Abschnitts.
 */
export function mitNachgetragenen(abschnitte: UnterlagenAbschnitt[]): { daten: UnterlagenAbschnitt[]; geaendert: boolean } {
  const seed = seedUnterlagen();
  let geaendert = false;
  const daten = abschnitte.map((a) => {
    const seedDoks = seed.find((s) => s.id === a.id)?.dokumente || [];
    let dokumente = a.dokumente;
    for (const id of NACHGETRAGENE_DOKUMENT_IDS) {
      const i = seedDoks.findIndex((d) => d.id === id);
      if (i < 0 || dokumente.some((d) => d.id === id)) continue;
      const pos = i > 0 ? dokumente.findIndex((d) => d.id === seedDoks[i - 1].id) : -1;
      dokumente = pos < 0 ? [...dokumente, seedDoks[i]] : [...dokumente.slice(0, pos + 1), seedDoks[i], ...dokumente.slice(pos + 1)];
      geaendert = true;
    }
    return dokumente === a.dokumente ? a : { ...a, dokumente };
  });
  return { daten, geaendert };
}
