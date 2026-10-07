/**
 * Strukturierte Seed-Daten für die Unterlagen-Seite.
 * Wird über appConfigStore (Schlüssel: "unterlagen_struktur") gespeichert,
 * damit Admins editieren können und alle Nutzer dieselbe Struktur sehen.
 */

import zoomDesktopHintergrundbild1 from "@/assets/zoom-desktop-hintergrundbild-1.png.asset.json";
import zoomDesktopHintergrundbild2 from "@/assets/zoom-desktop-hintergrundbild-2.png.asset.json";
import zoomDesktopHintergrundbild3 from "@/assets/zoom-desktop-hintergrundbild-3.png.asset.json";
import zoomDesktopHintergrundbild4 from "@/assets/zoom-desktop-hintergrundbild-4.png.asset.json";
import zoomDesktopHintergrundbild5 from "@/assets/zoom-desktop-hintergrundbild-5.png.asset.json";
import zoomDesktopHintergrundbild6 from "@/assets/zoom-desktop-hintergrundbild-6.png.asset.json";
import zoomDesktopHintergrundbild7 from "@/assets/zoom-desktop-hintergrundbild-7.png.asset.json";
import zoomDesktopHintergrundbild8 from "@/assets/zoom-desktop-hintergrundbild-8.png.asset.json";

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

export const UNTERLAGEN_VERSION = "33";

/**
 * Einträge, die es nicht mehr gibt.
 *
 * Die gespeicherte Struktur wird bewusst nicht bei jeder Änderung neu
 * aufgesetzt, sonst gingen Christians eigene Ergänzungen verloren. Ein aus dem
 * Seed gestrichener Eintrag bliebe deshalb in bestehenden Installationen
 * stehen. Diese Ids werden beim Laden gezielt entfernt.
 */
export const ENTFERNTE_DOKUMENT_IDS: string[] = [
  // Haushaltsrechner / Bonitätsrechner: die Seite gibt es nicht mehr.
  "b-haushalt",
  // Unsere Kultur ist in den eigenen Abschnitt "kultur" umgezogen (neue Id k-kultur).
  "p-kultur",
  // Abgeloeste Beratungspraesentationen. Es bleibt nur die MOREImmo-Fassung.
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
          name: "Beratungspräsentation MOREImmo",
          beschreibung: "Der aktuelle Gesprächsablauf mit Fragenblock, drei durchgerechneten Objekten und der Selbstauskunft am Ende",
          aktion: "internal-link",
          interneRoute: "/beratungspraesentation-moreimmo",
        },
        {
          id: "p-beratung-pdf",
          name: "Beratungspräsentation als PDF",
          beschreibung: "Zum Herunterladen und Präsentieren, mit ausfüllbaren Feldern. Im Termin bevorzugt die Webfassung (Beratungspräsentation MOREImmo) nutzen",
          aktion: "external-link",
          url: "/dokumente/beratungspraesentation.pdf",
        },
        // Nur noch die aktuelle MOREImmo-Fassung. Die abgeloesten Varianten
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
      beschreibung: "Karriereplan, Zielplanung und Vertriebsunterlagen",
      dokumente: [
        {
          id: "k-zielplanung",
          name: "Zielplanung",
          beschreibung: "Berechne und speichere deine Karriere- und Provisionsziele",
          aktion: "internal-link",
          interneRoute: "/zielplanung",
        },
        {
          id: "k-hvv-vertrag",
          name: "Leadberatervertrag (Muster)",
          beschreibung: "Hauptvertrag für Lead Partner – mit Max Mustermann als Beispiel-Vertriebspartner",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-vertrag",
        },
        {
          id: "k-hvv-anlage-1",
          name: "Leadberatervertrag · Anlage 1 – AGB (Muster)",
          beschreibung: "Allgemeine Geschäftsbedingungen",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-1",
        },
        {
          id: "k-hvv-anlage-2",
          name: "Leadberatervertrag · Anlage 2 – Grundgebühr-Paket (Muster)",
          beschreibung: "Leistungs- und Preisvereinbarung",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-2",
        },
        {
          id: "k-hvv-anlage-3",
          name: "Leadberatervertrag · Anlage 3 – DSGVO-AVV & Verschwiegenheit (Muster)",
          beschreibung: "Auftragsverarbeitungsvereinbarung inkl. Verschwiegenheitserklärung",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-3",
        },
        {
          id: "k-hvv-anlage-4",
          name: "Leadberatervertrag · Anlage 4 – Provisionsordnung (Muster)",
          beschreibung: "Verbindliche Provisionsregelung",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-4",
        },
        {
          id: "k-hvv-anlage-5",
          name: "Leadberatervertrag · Anlage 5 – CRM- & Leadnutzung (Muster)",
          beschreibung: "Nutzung von CRM, Leads und Vertriebsinfrastruktur",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-5",
        },
        {
          id: "k-hvv-anlage-6",
          name: "Leadberatervertrag · Anlage 6 – Compliance & Beratungsrichtlinien (Muster)",
          beschreibung: "Verbindliche Vorgaben für Beratung & Kommunikation",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-6",
        },
        {
          id: "k-hvv-anlage-7",
          name: "Leadberatervertrag · Anlage 7 – Team & Lizenzpartner Struktur (Muster)",
          beschreibung: "Aufbau, Führung und Vergütung eigener Strukturen",
          aktion: "pdf-download",
          pdfKey: "hvv-muster-anlage-7",
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
          id: "m-logo",
          name: "MOREImmo Logo (Download)",
          beschreibung: "Klick auf die Vorschau lädt das Logo ohne Hintergrund herunter",
          aktion: "external-link",
          url: "/images/moreimmo-logo.png",
          vorschauUrl: "/images/moreimmo-logo.png",
          download: true,
        },
        {
          id: "m-logo-wortmarke",
          name: "MOREImmo Logo – Wortmarke (Icon + Schriftzug)",
          beschreibung: "Vollständiges Logo mit Bildmarke und Schriftzug „Immo\" – ideal für Briefköpfe, Präsentationen und Werbemittel",
          aktion: "external-link",
          url: "/images/moreimmo-logo-wortmarke.png",
          vorschauUrl: "/images/moreimmo-logo-wortmarke.png",
          download: true,
        },
        {
          id: "m-icon",
          name: "MOREImmo Bildmarke – Icon (nur Haus)",
          beschreibung: "Reines Icon ohne Schriftzug – ideal für Social Media, Favicons und Avatare",
          aktion: "external-link",
          url: "/images/moreimmo-icon.png",
          vorschauUrl: "/images/moreimmo-icon.png",
          download: true,
        },
        {
          id: "m-zoom-desktop-1",
          name: "Zoom / Desktop Hintergrundbild 1",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild1.url,
          vorschauUrl: zoomDesktopHintergrundbild1.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-2",
          name: "Zoom / Desktop Hintergrundbild 2",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild2.url,
          vorschauUrl: zoomDesktopHintergrundbild2.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-3",
          name: "Zoom / Desktop Hintergrundbild 3",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild3.url,
          vorschauUrl: zoomDesktopHintergrundbild3.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-4",
          name: "Zoom / Desktop Hintergrundbild 4",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild4.url,
          vorschauUrl: zoomDesktopHintergrundbild4.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-5",
          name: "Zoom / Desktop Hintergrundbild 5",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild5.url,
          vorschauUrl: zoomDesktopHintergrundbild5.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-6",
          name: "Zoom / Desktop Hintergrundbild 6",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild6.url,
          vorschauUrl: zoomDesktopHintergrundbild6.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-7",
          name: "Zoom / Desktop Hintergrundbild 7",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild7.url,
          vorschauUrl: zoomDesktopHintergrundbild7.url,
          download: true,
        },
        {
          id: "m-zoom-desktop-8",
          name: "Zoom / Desktop Hintergrundbild 8",
          beschreibung: "Hochauflösendes Hintergrundbild für Zoom und Desktop",
          aktion: "external-link",
          url: zoomDesktopHintergrundbild8.url,
          vorschauUrl: zoomDesktopHintergrundbild8.url,
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
          name: "Anleitung MOREImmo Mail einrichten",
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
          beschreibung: "Einheitliche MOREImmo-Signatur mit deinen persönlichen Daten + Schritt-für-Schritt-Anleitung",
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
