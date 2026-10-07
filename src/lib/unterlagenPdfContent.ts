import { type DocBlock, generateSimpleDocPdf } from "./simpleDocPdf";
import { buildBankpruefungBaseDocs } from "./bankpruefungDocs";
import type { FormatSprache } from "./sprachFormat";

/**
 * Inhalte für alle 12 Vertriebs-/Steuer-PDFs.
 * Verwenden generischen Renderer aus simpleDocPdf.ts.
 */

// ─────────────────────────────────────────
// 1. Checkliste Bonitätsunterlagen
// ─────────────────────────────────────────

/**
 * Baut die Ankreuzzeilen einer Beschäftigungsart aus der Systemliste.
 *
 * Die Checkliste hat ihre Positionen früher selbst aufgezählt und lief dadurch
 * gegen die Abfrage im Investment auseinander: Steuererklärungen,
 * Handelsregisterauszug und Geschäftskontoauszüge fehlten dort, obwohl die
 * Bank sie bei Selbstständigen verlangt. Jetzt kommt beides aus derselben
 * Quelle, `buildBankpruefungBaseDocs`. Ändert sich dort etwas, ändert sich
 * dieses PDF mit.
 *
 * Nur die gemeinsamen Positionen werden ausgelassen, weil sie im Abschnitt
 * "Für alle" stehen und sonst dreimal auftauchen würden.
 */
const GEMEINSAM = new Set([
  "Eigenkapitalnachweis",
  "Kontoauszüge der letzten 3 Monate",
]);

/** Was Angestellte zwingend brauchen. Dient unten als Vergleichsmaßstab. */
const PFLICHT_ANGESTELLT = new Set(
  buildBankpruefungBaseDocs({ beschaeftigungsart: "angestellt", person: 1, variant: "admin" })
    .filter((d) => d.required)
    .map((d) => d.name),
);

/**
 * Die Dokumentnamen der Bankprüfung auf Englisch, nur für die Anzeige im
 * PDF. Gespeichert und abgeglichen wird immer der deutsche Name (Plan
 * Kundensprache, Risiken: gespeicherte Werte nie übersetzen). Ein Name, der
 * hier fehlt, bleibt deutsch stehen; der Test prüft, dass alle bekannt sind.
 */
export const BANK_DOKUMENTE_EN: Record<string, string> = {
  "Lohnsteuerbescheinigung des Vorjahrs": "Wage tax certificate for the previous year (Lohnsteuerbescheinigung)",
  "Steuerbescheide der letzten 3 Jahre": "Tax assessments for the last 3 years",
  "Steuererklärungen der letzten 3 Jahre": "Tax returns for the last 3 years",
  "Bilanz / BWA der letzten 3 Jahre": "Balance sheet / business analysis (BWA) for the last 3 years",
  Handelsregisterauszug: "Extract from the commercial register",
  'Letzter Steuerbescheid / „Negativ-Erklärung"': 'Latest tax assessment / "negative declaration"',
  Arbeitsvertrag: "Employment contract",
  Ernennungsurkunde: "Certificate of appointment (civil servants)",
  "Aktuelle Besoldungsbescheide (letzte 3 Monate)": "Current salary statements (last 3 months)",
  "Aktuelle Renteninformation": "Current pension statement",
  Eigenkapitalnachweis: "Proof of equity",
  "Kontoauszüge der letzten 3 Monate": "Bank statements for the last 3 months",
  "Geschäftskontoauszüge der letzten 3 Monate": "Business account statements for the last 3 months",
  "PKV Nachweis": "Proof of private health insurance",
};

function bankZeilen(beschaeftigungsart: string, sprache: FormatSprache = "de"): DocBlock[] {
  return buildBankpruefungBaseDocs({ beschaeftigungsart, person: 1, variant: "admin" })
    .filter((d) => !GEMEINSAM.has(d.name))
    // In der Abfrage bleiben nicht zutreffende Positionen als unverbindliche
    // Zeile stehen, damit ein nachträglicher Wechsel der Beschäftigungsart
    // nichts verschluckt. Auf einem Ausdruck stiften sie nur Verwirrung: Ein
    // Selbstständiger soll nicht "Arbeitsvertrag (falls vorhanden)" lesen.
    // Deshalb fliegt raus, was hier freiwillig ist, aber bei Angestellten
    // Pflicht wäre. Übrig bleiben echte Sonderfälle wie die Ernennungsurkunde
    // oder der Handelsregisterauszug.
    .filter((d) => d.required || !PFLICHT_ANGESTELLT.has(d.name))
    .map((d) => {
      const name = sprache === "en" ? BANK_DOKUMENTE_EN[d.name] ?? d.name : d.name;
      const optional = sprache === "en" ? " (if applicable)" : " (falls vorhanden)";
      return { type: "checkbox" as const, text: d.required ? name : `${name}${optional}` };
    });
}

/**
 * Die Checkliste in der Sprache des Kunden (Plan Kundensprache, Etappe 5,
 * D18). Ohne Angabe Deutsch, wie bisher.
 */
export const generateChecklisteBonitaetPDF = (sprache: FormatSprache = "de") =>
  sprache === "en" ? generateSimpleDocPdf(checklisteBonitaetEnglisch()) : checklisteBonitaetDeutsch();

/** Die englische Fassung, Begriffe nach `kundenspracheGlossar.ts`. */
export function checklisteBonitaetEnglisch(): Parameters<typeof generateSimpleDocPdf>[0] {
  return {
    title: "Checklist of credit check documents",
    subtitle: "Complete overview for the bank's credit check",
    filename: "MOREImmo_Checklist_credit_check_documents.pdf",
    deckblatt: {
      sprache: "en",
      kennung: "Checklist",
      titel: "Checklist of credit check documents",
      untertitel: "Complete overview for the bank's credit check",
      nummer: "BON-01",
    },
    blocks: [
      { type: "p", text: "This checklist helps you put together all the documents your bank needs for the credit check. A complete file speeds up the financing approval considerably." },
      { type: "p", text: "Find the section for your type of employment below. Everything without a note is mandatory. Items marked \"if applicable\" only need to be submitted if they apply to you." },

      { type: "h2", text: "For everyone" },
      { type: "checkbox", text: "Identity card or passport (front and back, legible)" },
      { type: "checkbox", text: "Certificate of registration (Meldebescheinigung, not older than 3 months)" },
      { type: "checkbox", text: "SCHUFA credit report (selbstauskunft.de)" },
      { type: "checkbox", text: "Proof of equity (bank statements, securities account statements, savings books)" },
      { type: "checkbox", text: "Bank statements for the last 3 months" },
      { type: "checkbox", text: "Your own tenancy agreement or confirmation of rent-free living" },
      { type: "checkbox", text: "Proof of private health insurance (only if privately insured)" },

      { type: "h2", text: "Employees" },
      { type: "checkbox", text: "Last 3 payslips" },
      ...bankZeilen("angestellt", "en"),
      { type: "checkbox", text: "Proof of special payments such as bonuses or a 13th month's salary (if applicable)" },

      { type: "h2", text: "Civil servants" },
      { type: "checkbox", text: "Last 3 salary statements" },
      ...bankZeilen("beamter", "en"),

      { type: "h2", text: "Self-employed and freelancers" },
      ...bankZeilen("selbstaendig", "en"),
      { type: "checkbox", text: "Totals and balances list for the current year" },
      { type: "callout", variant: "info", text: "For self-employed people, the bank does not require an employment contract, wage tax certificate or pension statement. Instead, three years of tax assessments, tax returns and balance sheet or business analysis (BWA) count. Without these three years, no bank will carry out a check." },

      { type: "h2", text: "Assets and liabilities" },
      { type: "checkbox", text: "Overview of all existing loans and leasing contracts" },
      { type: "checkbox", text: "Proof of other assets (life insurance, securities)" },

      { type: "h2", text: "Property documents (provided by us)" },
      { type: "checkbox", text: "Exposé / property description" },
      { type: "checkbox", text: "Extract from the land register (max. 3 months old)" },
      { type: "checkbox", text: "Declaration of division (Teilungserklärung) with allocation plan" },
      { type: "checkbox", text: "Business plan and service charge (Hausgeld) statements for the last 2 years" },
      { type: "checkbox", text: "Energy certificate" },

      { type: "callout", variant: "success", text: "Tip: Collect all documents in ONE PDF (sorted in the order above). Banks process complete files up to 5 days faster." },
    ],
  };
}

const checklisteBonitaetDeutsch = () => generateSimpleDocPdf({
  title: "Checkliste Bonitätsunterlagen",
  subtitle: "Vollständige Übersicht für Bank- und Bonitätsprüfung",
  filename: "MOREImmo_Checkliste_Bonitaetsunterlagen.pdf",
  deckblatt: { kennung: "Checkliste", titel: "Checkliste Bonitätsunterlagen", untertitel: "Vollständige Übersicht für Bank- und Bonitätsprüfung", nummer: "BON-01" },
  blocks: [
    { type: "p", text: "Diese Checkliste hilft dir, alle erforderlichen Unterlagen für die Bonitätsprüfung deiner Bank vollständig zusammenzustellen. Eine vollständige Akte beschleunigt die Finanzierungszusage erheblich." },
    { type: "p", text: "Suche dir unten den Abschnitt zu deiner Beschäftigungsart heraus. Alles ohne Zusatz ist Pflicht. Positionen mit dem Hinweis \"falls vorhanden\" reichst du nur ein, wenn sie auf dich zutreffen." },

    { type: "h2", text: "Für alle" },
    { type: "checkbox", text: "Personalausweis oder Reisepass (Vorder- und Rückseite, lesbar)" },
    { type: "checkbox", text: "Meldebescheinigung (nicht älter als 3 Monate)" },
    { type: "checkbox", text: "SCHUFA-BonitätsAuskunft (selbstauskunft.de)" },
    { type: "checkbox", text: "Eigenkapitalnachweis (Kontoauszüge, Depotauszüge, Sparbücher)" },
    { type: "checkbox", text: "Kontoauszüge der letzten 3 Monate" },
    { type: "checkbox", text: "Eigener Mietvertrag oder Mietfrei-Bestätigung" },
    { type: "checkbox", text: "Nachweis der privaten Krankenversicherung (nur bei PKV)" },

    { type: "h2", text: "Angestellte" },
    { type: "checkbox", text: "Letzte 3 Gehaltsabrechnungen" },
    ...bankZeilen("angestellt"),
    { type: "checkbox", text: "Nachweis über Sonderzahlungen wie Boni, Tantiemen oder 13. Gehalt (falls vorhanden)" },

    { type: "h2", text: "Beamte" },
    { type: "checkbox", text: "Letzte 3 Bezügemitteilungen" },
    ...bankZeilen("beamter"),

    { type: "h2", text: "Selbstständige und Freiberufler" },
    ...bankZeilen("selbstaendig"),
    { type: "checkbox", text: "Summen- und Saldenliste des laufenden Jahres" },
    { type: "callout", variant: "info", text: "Bei Selbstständigen verlangt die Bank keinen Arbeitsvertrag, keine Lohnsteuerbescheinigung und keine Renteninformation. Dafür zählen die drei Jahre Steuerbescheide, Steuererklärungen und Bilanz oder BWA. Ohne diese drei Jahre prüft keine Bank."  },

    { type: "h2", text: "Vermögen und Verbindlichkeiten" },
    { type: "checkbox", text: "Übersicht aller bestehenden Kredite und Leasing-Verträge" },
    { type: "checkbox", text: "Nachweis über sonstige Vermögenswerte (Lebensversicherungen, Wertpapiere)" },

    { type: "h2", text: "Objekt-Unterlagen (von uns bereitgestellt)" },
    { type: "checkbox", text: "Exposé / Objektbeschreibung" },
    { type: "checkbox", text: "Grundbuchauszug (max. 3 Monate alt)" },
    { type: "checkbox", text: "Teilungserklärung mit Aufteilungsplan" },
    { type: "checkbox", text: "Wirtschaftsplan und Hausgeldabrechnungen der letzten 2 Jahre" },
    { type: "checkbox", text: "Energieausweis" },

    { type: "callout", variant: "success", text: "Tipp: Sammle alle Dokumente in EINEM PDF (sortiert nach obiger Reihenfolge). Banken bearbeiten vollständige Akten bis zu 5 Tage schneller." },
  ],
});

// ─────────────────────────────────────────
// 2. Lohnsteueroptimierung
// ─────────────────────────────────────────
export const generateLohnsteueroptimierungPDF = () => generateSimpleDocPdf({
  title: "Lohnsteueroptimierung durch Immobilien",
  subtitle: "Mehr Netto vom Brutto durch Eintrag des Freibetrags",
  filename: "MOREImmo_Lohnsteueroptimierung.pdf",
  deckblatt: { kennung: "Steuerwissen", titel: "Lohnsteueroptimierung durch Immobilien", untertitel: "Mehr Netto vom Brutto durch Eintrag des Freibetrags", nummer: "STE-01" },
  blocks: [
    { type: "h2", text: "Das Prinzip" },
    { type: "p", text: "Wer eine vermietete Immobilie kauft, erzielt in den ersten Jahren in der Regel einen Steuerverlust durch AfA (Abschreibung), Schuldzinsen und sonstige Werbungskosten. Diesen Verlust kannst du als Freibetrag direkt in deine Lohnsteuerkarte (ELStAM) eintragen lassen – und zahlst sofort weniger Lohnsteuer. So musst du nicht bis zur nächsten Steuererklärung warten, um deine Liquidität zu verbessern." },
    { type: "h2", text: "Beispielrechnung" },
    { type: "table",
      head: ["Position", "Betrag p.a."],
      rows: [
        ["AfA Gebäude (2 % von 200.000 €)", "4.000 €"],
        ["Schuldzinsen", "8.000 €"],
        ["Sonstige Werbungskosten (HG, Verwaltung)", "2.500 €"],
        ["Mieteinnahmen", "– 9.600 €"],
        ["Steuerlicher Verlust (Freibetrag)", "4.900 €"],
      ],
    },
    { type: "p", text: "Bei einem Spitzensteuersatz von 42 % entspricht der Freibetrag von 4.900 € einer monatlichen Steuerersparnis von rund 170 € – also 170 € mehr Netto pro Monat." },
    { type: "h2", text: "So beantragst du den Freibetrag" },
    { type: "list", ordered: true, items: [
      "Antrag auf Lohnsteuer-Ermäßigung beim zuständigen Finanzamt einreichen (Formular liegt vor).",
      "Nachweis der voraussichtlichen Werbungskosten beilegen (Darlehensvertrag, AfA-Berechnung, HG-Plan).",
      "Finanzamt prüft und überträgt den Freibetrag automatisch in deine ELStAM-Datenbank.",
      "Dein Arbeitgeber zieht ab dem Folgemonat weniger Lohnsteuer ein – dauerhaft bis zum Jahresende.",
    ]},
    { type: "callout", variant: "info", text: "Antrag jährlich neu stellen oder als Mehrjahres-Freibetrag bei stabilen Verhältnissen (max. 2 Jahre)." },
    { type: "h2", text: "Für wen lohnt sich das?" },
    { type: "list", items: [
      "Angestellte mit zu versteuerndem Einkommen ab 30.000 € (Steuersatz ab 30 %)",
      "Beamte und Beamtinnen mit Lohnsteuerabzug",
      "Personen, die regelmäßig Steuererstattungen erhalten",
    ]},
  ],
});

// ─────────────────────────────────────────
// 3. Ehegattenschaukel & Verkauf an Kinder
// ─────────────────────────────────────────
export const generateEhegattenschaukelPDF = () => generateSimpleDocPdf({
  title: "Ehegattenschaukel & Verkauf an Kinder",
  subtitle: "Steuersmarte Übertragungsstrategien nach Ablauf der 10-Jahres-Frist",
  filename: "MOREImmo_Ehegattenschaukel.pdf",
  deckblatt: { kennung: "Steuerwissen", titel: "Ehegattenschaukel & Verkauf an Kinder", untertitel: "Steuersmarte Übertragungsstrategien nach Ablauf der 10-Jahres-Frist", nummer: "STE-02" },
  blocks: [
    { type: "h2", text: "Was ist die Ehegattenschaukel?" },
    { type: "p", text: "Nach Ablauf der 10-jährigen Spekulationsfrist (§ 23 EStG) kannst du eine vermietete Immobilie steuerfrei an deinen Ehepartner verkaufen. Der Ehepartner setzt dabei den aktuellen Marktpreis als neue Anschaffungskosten an – und kann auf diesen höheren Wert erneut AfA in voller Höhe geltend machen." },
    { type: "h2", text: "Beispielrechnung" },
    { type: "table",
      head: ["Position", "Wert"],
      rows: [
        ["Ursprünglicher Kaufpreis (vor 10 Jahren)", "200.000 €"],
        ["Bisherige AfA (10 × 4.000 €)", "40.000 €"],
        ["Aktueller Marktwert", "320.000 €"],
        ["Verkauf an Ehepartner zu Marktwert", "320.000 €"],
        ["Neue AfA-Bemessungsgrundlage Gebäude (80 %)", "256.000 €"],
        ["Neue jährliche AfA (2 %)", "5.120 €"],
      ],
    },
    { type: "callout", variant: "success", text: "Mehr-AfA gegenüber bisheriger Berechnung: 1.120 € pro Jahr. Bei 42 % Spitzensteuersatz = ca. 470 € Steuerersparnis jährlich – über 10 Jahre 4.700 €." },
    { type: "h2", text: "Wichtige Voraussetzungen" },
    { type: "list", ordered: true, items: [
      "10-jährige Haltedauer ist abgelaufen (Verkauf wäre auch an Dritte steuerfrei).",
      "Verkauf erfolgt zum Marktpreis (Sachverständigengutachten empfohlen).",
      "Der Kaufpreis muss tatsächlich gezahlt werden – z. B. durch Bankdarlehen des Ehepartners.",
      "Notarvertrag mit korrekter Beurkundung zwingend erforderlich.",
    ]},
    { type: "h2", text: "Variante: Verkauf an erwachsene Kinder" },
    { type: "p", text: "Auch der Verkauf an volljährige Kinder ist möglich. Sinnvoll, wenn das Kind ein höheres zu versteuerndes Einkommen hat und die AfA-Vorteile besser nutzen kann. Achtung: Bei Schenkungs-/Erbschaftsteuer-Freibeträgen (400.000 € pro Elternteil pro Kind, alle 10 Jahre) prüfen, ob ein Verkauf statt Schenkung sinnvoll ist." },
    { type: "callout", variant: "warn", text: "Achtung Gestaltungsmissbrauch: Der Verkauf darf nicht ausschließlich der Steuerersparnis dienen. Notar und Steuerberater unbedingt vorher konsultieren." },
  ],
});

// ─────────────────────────────────────────
// 3b. Verkauf & Übertragung an Kinder
// ─────────────────────────────────────────
export const generateVerkaufKinderPDF = () => generateSimpleDocPdf({
  title: "Verkauf & Übertragung an Kinder",
  subtitle: "Vermögensübertragung mit maximaler Steuerersparnis – Schenkung, Verkauf oder Nießbrauch",
  filename: "MOREImmo_Verkauf_Uebertragung_Kinder.pdf",
  deckblatt: { kennung: "Steuerwissen", titel: "Verkauf & Übertragung an Kinder", untertitel: "Vermögensübertragung mit maximaler Steuerersparnis – Schenkung, Verkauf oder Nießbrauch", nummer: "STE-03" },
  blocks: [
    { type: "h2", text: "Drei Wege, drei Strategien" },
    { type: "p", text: "Wer eine vermietete Immobilie an die nächste Generation übertragen will, hat drei Hauptoptionen – jede mit unterschiedlicher Steuerwirkung, Kontrolle und Liquiditätseffekt." },
    { type: "list", items: [
      "Schenkung: Übertragung ohne Gegenleistung. Freibetrag 400.000 € pro Kind und Elternteil – alle 10 Jahre erneut nutzbar.",
      "Verkauf: Echter Kaufvertrag zu fremdüblichen Konditionen. Steuerfrei nach 10 Jahren Haltedauer beim Elternteil. Liquidität für die Eltern.",
      "Schenkung mit Nießbrauch: Eigentum geht auf das Kind über, Mieteinnahmen verbleiben bei den Eltern. Steuerwert wird kapitalisiert reduziert.",
    ]},
    { type: "h2", text: "Schenkungs-Freibeträge nach § 16 ErbStG" },
    { type: "table",
      head: ["Beziehung", "Freibetrag", "Wiederholbar"],
      rows: [
        ["Ehepartner", "500.000 €", "alle 10 Jahre"],
        ["Kinder (pro Elternteil)", "400.000 €", "alle 10 Jahre"],
        ["Enkel", "200.000 €", "alle 10 Jahre"],
        ["Eltern (im Erbfall)", "100.000 €", "alle 10 Jahre"],
        ["Sonstige", "20.000 €", "alle 10 Jahre"],
      ],
    },
    { type: "callout", variant: "success", text: "Praxis-Tipp: Vater + Mutter + 2 Kinder = bis zu 1,6 Mio. € steuerfrei übertragbar (400.000 € × 2 Eltern × 2 Kinder), und das alle 10 Jahre wiederholt." },
    { type: "h2", text: "Strategie: Schenkung mit Nießbrauch" },
    { type: "p", text: "Die Königs-Strategie für vermögende Familien: Eltern übertragen die Immobilie auf die Kinder, behalten sich aber das Nießbrauchrecht vor – sie bekommen weiterhin die Mieteinnahmen, das Kind ist Eigentümer." },
    { type: "list", ordered: true, items: [
      "Wertermittlung: Verkehrswert der Immobilie ermitteln (Gutachten oder Maklerwert). Davon wird der kapitalisierte Nießbrauchwert abgezogen.",
      "Nießbrauch-Wert berechnen: Jährliche Nettokaltmiete × Vervielfältiger nach Lebenserwartung des Schenkers (Anlage 9 zu § 14 BewG). Bei 60-jährigem Schenker ca. Faktor 13-14.",
      "Steuerlich relevanter Wert sinkt drastisch: Beispiel: Immobilienwert 600.000 €, Nießbrauch-Wert 220.000 € → steuerlich relevant nur 380.000 €. Liegt unter dem Freibetrag von 400.000 € → komplett steuerfrei.",
      "Notarieller Vertrag + Grundbucheintrag: Schenkungsvertrag mit Nießbrauchsvorbehalt beim Notar. Eintragung der Eigentumsänderung und des Nießbrauchs im Grundbuch.",
    ]},
    { type: "h2", text: "Beispielrechnung Schenkung mit Nießbrauch" },
    { type: "table",
      head: ["Position", "Wert"],
      rows: [
        ["Verkehrswert der Immobilie", "600.000 €"],
        ["Jahreskaltmiete", "18.000 €"],
        ["Vervielfältiger (Schenker, 60 J)", "13,4"],
        ["Kapitalisierter Nießbrauch", "– 241.200 €"],
        ["Steuerlich anrechenbarer Wert", "358.800 €"],
        ["Schenkungssteuer-Freibetrag", "400.000 €"],
        ["Schenkungssteuer", "0 €"],
      ],
    },
    { type: "h2", text: "Variante: Verkauf an Kinder" },
    { type: "list", items: [
      "Voraussetzung: 10-Jahres-Spekulationsfrist beim Elternteil abgelaufen → steuerfreier Verkaufserlös.",
      "Vorteil für Kinder: Volle Anschaffungskosten als neue AfA-Basis (analog zur Ehegattenschaukel).",
      "Finanzierung: Bank oder Eltern-Darlehen mit marktüblichen Zinsen.",
      "Steuer: Grunderwerbsteuer entfällt zwischen Eltern und Kindern in gerader Linie (§ 3 Nr. 6 GrEStG).",
      "Pflichtteil-Verzicht: Bei größeren Übertragungen ggf. Pflichtteilsverzicht der Geschwister einholen.",
    ]},
    { type: "h2", text: "Wichtig: Beratung durch Experten" },
    { type: "p", text: "Diese Strategien sind komplex und individuell. Vor jeder Übertragung solltest du folgende Beratung einholen:" },
    { type: "list", items: [
      "Steuerberater für individuelle Steuerwirkung und Optimierung",
      "Notar für rechtskonforme Vertragsgestaltung",
      "Fachanwalt für Erbrecht bei mehreren Erben oder besonderen Familienkonstellationen",
    ]},
    { type: "callout", variant: "warn", text: "Hinweis: Diese Übersicht ersetzt keine individuelle Steuer- und Rechtsberatung." },
  ],
});

// ─────────────────────────────────────────
// 4. Checkliste maximale Steuerersparnis
// ─────────────────────────────────────────
export const generateChecklisteSteuerersparnisPDF = () => generateSimpleDocPdf({
  title: "Checkliste maximale Steuerersparnis",
  subtitle: "Schritt-für-Schritt zur optimalen Steueroptimierung mit Immobilien",
  filename: "MOREImmo_Checkliste_Steuerersparnis.pdf",
  deckblatt: { kennung: "Checkliste", titel: "Checkliste maximale Steuerersparnis", untertitel: "Schritt-für-Schritt zur optimalen Steueroptimierung mit Immobilien", nummer: "STE-04" },
  blocks: [
    { type: "h2", text: "Vor dem Kauf" },
    { type: "checkbox", text: "Optimalen AfA-Modus geprüft (linear / degressiv / Denkmal)" },
    { type: "checkbox", text: "Aufteilung Kaufpreis Grund/Gebäude im Notarvertrag separat ausgewiesen" },
    { type: "checkbox", text: "Inventar (Möbel, Einbauküche) separat im Vertrag (keine GrESt darauf)" },
    { type: "checkbox", text: "Eigenkapital-Anteil bewusst gewählt (höhere Schuldzinsen = höhere Werbungskosten)" },
    { type: "h2", text: "Im laufenden Betrieb" },
    { type: "checkbox", text: "Lohnsteuer-Freibetrag beim Finanzamt eingetragen" },
    { type: "checkbox", text: "Alle Werbungskosten dokumentiert (Hausgeld, Verwaltung, Reparaturen, Fahrtkosten)" },
    { type: "checkbox", text: "Erhaltungsaufwand auf 2-5 Jahre verteilt (§ 82b EStDV)" },
    { type: "checkbox", text: "Sonderabschreibung § 7b EStG geprüft (Mietwohnungsneubau)" },
    { type: "checkbox", text: "Renovierungen innerhalb der ersten 3 Jahre kritisch prüfen (15 %-Grenze)" },
    { type: "h2", text: "Nach 10 Jahren" },
    { type: "checkbox", text: "Spekulationsfrist abgelaufen – Verkaufsoption bewerten" },
    { type: "checkbox", text: "Ehegattenschaukel-Strategie evaluiert" },
    { type: "checkbox", text: "Übertragung an Kinder mit Schenkungs-Freibeträgen geprüft" },
    { type: "checkbox", text: "Erneute AfA-Bemessungsgrundlage durch Verkauf kalkuliert" },
    { type: "h2", text: "Spezielle Strategien" },
    { type: "checkbox", text: "Denkmal-AfA-Objekte ergänzend ins Portfolio aufgenommen" },
    { type: "checkbox", text: "Energetische Sanierung mit § 35c EStG / BEG-Förderung kombiniert" },
    { type: "checkbox", text: "GmbH-Struktur für >5 Objekte geprüft (Reinvestitionsrücklage)" },
    { type: "callout", variant: "info", text: "Diese Checkliste ersetzt keine Steuerberatung. Sie ist die Grundlage für das Gespräch mit deinem Steuerberater oder dem Steuerexperten von MOREImmo." },
  ],
});

// ─────────────────────────────────────────
// 5. Elster-Anleitung
// ─────────────────────────────────────────
export const generateElsterAnleitungPDF = () => generateSimpleDocPdf({
  title: "Lohnsteuer senken – Elster-Anleitung",
  subtitle: "Schritt-für-Schritt zur Eintragung des Freibetrags",
  filename: "MOREImmo_Elster_Anleitung.pdf",
  deckblatt: { kennung: "Anleitung", titel: "Lohnsteuer senken – Elster-Anleitung", untertitel: "Schritt-für-Schritt zur Eintragung des Freibetrags", nummer: "STE-05" },
  blocks: [
    { type: "h2", text: "Voraussetzungen" },
    { type: "list", items: [
      "ELSTER-Zertifikat (Registrierung unter elster.de, Aktivierung dauert 2-4 Wochen)",
      "Berechnete Werbungskosten und Mieteinnahmen für das Folgejahr",
      "Darlehensvertrag, AfA-Berechnung, Hausgeldplan zur Hand",
    ]},
    { type: "h2", text: "Schritt-für-Schritt" },
    { type: "list", ordered: true, items: [
      "Im ELSTER-Portal anmelden und 'Antrag auf Lohnsteuer-Ermäßigung' wählen.",
      "Persönliche Daten und Steuer-ID eingeben (vorausgefüllt aus den Stammdaten).",
      "Anlage 'Vermietung und Verpachtung' (V) öffnen.",
      "Adresse der Immobilie und Anteil eintragen (bei Allein-Eigentum 100 %).",
      "Mieteinnahmen für das Folgejahr berechnen (Kaltmiete × 12).",
      "Werbungskosten eintragen: AfA, Schuldzinsen, Hausgeld (umlagefähiger Teil), Verwaltungskosten, Reparaturen.",
      "ELSTER berechnet automatisch den steuerlichen Verlust (Werbungskostenüberschuss).",
      "Antrag elektronisch signieren und absenden.",
      "Nach Bearbeitung (ca. 2-4 Wochen) wird der Freibetrag automatisch in deine ELStAM-Datenbank übertragen.",
    ]},
    { type: "h2", text: "Häufige Fehler vermeiden" },
    { type: "callout", variant: "warn", text: "Keine Tilgungsanteile als Werbungskosten eintragen – nur Zinsen sind absetzbar." },
    { type: "callout", variant: "warn", text: "Nicht-umlagefähige Hausgeld-Bestandteile (Instandhaltungsrücklage) NICHT als Werbungskosten – diese gelten erst, wenn aus der Rücklage tatsächlich Reparaturen bezahlt werden." },
    { type: "callout", variant: "info", text: "Antrag muss bis spätestens 30. November des Vorjahres gestellt werden, damit der Freibetrag ab Januar gilt." },
  ],
});

// ─────────────────────────────────────────
// 6. Aftersales-Beratungsdokument
// ─────────────────────────────────────────
export const generateAftersalesBeratungPDF = () => generateSimpleDocPdf({
  title: "Aftersales-Beratungsdokument",
  subtitle: "Pflicht-Dokument zwischen Vertriebspartner und Kunde nach Verkaufsabschluss",
  filename: "MOREImmo_Aftersales_Beratung.pdf",
  deckblatt: { kennung: "Beratungsdokument", titel: "Aftersales-Beratungsdokument", untertitel: "Pflicht-Dokument zwischen Vertriebspartner und Kunde nach Verkaufsabschluss", nummer: "AFT-01" },
  blocks: [
    { type: "p", text: "Dieses Dokument dokumentiert das vereinbarte Aftersales-Programm zwischen dem Vertriebspartner und dem Kunden im Anschluss an den Immobilienkauf bei MOREImmo." },
    { type: "h2", text: "Vertragspartner" },
    { type: "kv", label: "Kunde", value: "" },
    { type: "kv", label: "Anschrift", value: "" },
    { type: "kv", label: "Vertriebspartner", value: "" },
    { type: "kv", label: "Objekt-Adresse", value: "" },
    { type: "kv", label: "Kaufdatum / Notartermin", value: "" },
    { type: "h2", text: "Aftersales-Leistungen" },
    { type: "checkbox", text: "Begleitung beim ersten Mieterwechsel und Übergabeprotokoll" },
    { type: "checkbox", text: "Jährliche Steuerberatungs-Zusammenfassung (zur Vorlage beim Steuerberater)" },
    { type: "checkbox", text: "Beratung zu Mieterhöhungen nach §§ 558, 559 BGB" },
    { type: "checkbox", text: "Unterstützung bei Hausverwaltungs-Anfragen" },
    { type: "checkbox", text: "Vorbereitung auf den steuerfreien Verkauf nach 10 Jahren" },
    { type: "checkbox", text: "Beratung zur Ehegattenschaukel oder Übertragung an Kinder" },
    { type: "checkbox", text: "Aufnahme ins Empfehlungsprogramm (Provision bei Weiterempfehlung)" },
    { type: "h2", text: "Kontakt-Rhythmus" },
    { type: "list", items: [
      "1. Quartal nach Kauf: Statusgespräch (Vermietung, Mietzahlung, Banküberweisungen)",
      "Halbjährlich: Performance-Review (Cashflow, Mietsteigerung, Marktwert-Entwicklung)",
      "Jährlich: Steuer-Update und Strategie-Anpassung",
      "Ad hoc: Bei jeder Frage erreichbar via E-Mail, Telefon, Portal-Chat",
    ]},
    { type: "h2", text: "Unterschriften" },
    { type: "spacer", size: 10 },
    { type: "kv", label: "Ort, Datum", value: "" },
    { type: "spacer", size: 10 },
    { type: "kv", label: "Unterschrift Kunde", value: "" },
    { type: "spacer", size: 6 },
    { type: "kv", label: "Unterschrift Vertriebspartner", value: "" },
  ],
});

// ─────────────────────────────────────────
// 7. MOREImmo Vertriebs- & Karriereplan
// ─────────────────────────────────────────
export const generateKarriereplanPDF = () => generateSimpleDocPdf({
  title: "MOREImmo Vertriebs- & Karriereplan",
  subtitle: "Stufenmodell und Provisionssystem für Vertriebspartner",
  filename: "MOREImmo_Karriereplan.pdf",
  deckblatt: { kennung: "Vertriebspartner", titel: "MOREImmo Vertriebs- & Karriereplan", untertitel: "Stufenmodell und Provisionssystem für Vertriebspartner", nummer: "VP-01" },
  blocks: [
    { type: "p", text: "Der MOREImmo Karriereplan ist auf langfristigen Erfolg, Teamwachstum und passive Einkommensströme ausgelegt. Mit jeder Karrierestufe steigen Provision, Override-Anteile und exklusive Boni." },
    { type: "h2", text: "Karrierestufen" },
    { type: "table",
      head: ["Stufe", "Voraussetzung", "Eigenprovision", "Override Team"],
      rows: [
        ["Vertriebspartner", "Onboarding + 1 Abschluss", "30 %", "–"],
        ["Vertriebspartner", "5 Abschlüsse / 12 Mon.", "40 %", "5 %"],
        ["Senior VP", "15 Abschlüsse / 24 Mon.", "45 %", "8 %"],
        ["Teamleiter", "30 Abschlüsse + 3 aktive VP", "50 %", "10 % L1 / 3 % L2"],
        ["Regional-Direktor", "100 Abschlüsse + 10 aktive VP", "55 %", "12 % L1 / 5 % L2 / 2 % L3"],
        ["Partner", "auf Einladung", "60 %", "individuell"],
      ],
    },
    { type: "h2", text: "Zusatzleistungen" },
    { type: "list", items: [
      "Abschlussbonus ab dem 3. Abschluss pro Quartal (gestaffelt)",
      "Auto-Bonus ab Senior VP (Leasing-Zuschuss bis 800 € / Monat)",
      "Exklusive Incentive-Reisen (1× pro Jahr für Top 20 %)",
      "Persönliches Branding-Budget (Microsite, Visitenkarten, Marketing)",
      "Premium-Academy-Zugang inkl. 1:1-Coaching mit Top-Closern",
    ]},
    { type: "h2", text: "Karriere-Beispiel" },
    { type: "callout", variant: "success", text: "Sandra startet als Junior VP. Nach 18 Monaten ist sie Senior VP mit 18 Abschlüssen und 4.200 € Eigenprovision pro Abschluss + Override aus ihrem Team. Monatliches Einkommen: ca. 12.000 € + Bonus." },
    { type: "h2", text: "Wichtige Hinweise" },
    { type: "list", items: [
      "Alle Karrierestufen sind dauerhaft – Rückstufung nur bei dauerhafter Inaktivität (>12 Monate ohne Abschluss).",
      "Override-Provisionen werden so lange ausgezahlt, wie der Team-Partner aktiv ist.",
      "Detaillierte Provisionssätze siehe individueller VP-Vertrag.",
    ]},
  ],
});

// ─────────────────────────────────────────
// 8. VP-AGB
// ─────────────────────────────────────────
export const generateVpAgbPDF = () => generateSimpleDocPdf({
  title: "Allgemeine Geschäftsbedingungen Vertriebspartner",
  subtitle: "MOREImmo",
  filename: "MOREImmo_VP_AGB.pdf",
  deckblatt: { kennung: "Vertragsunterlage", titel: "Allgemeine Geschäftsbedingungen Vertriebspartner", untertitel: "MOREImmo", nummer: "VP-02" },
  blocks: [
    { type: "h2", text: "§ 1 Geltungsbereich" },
    { type: "p", text: "Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Zusammenarbeit zwischen der MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach (nachfolgend „MOREImmo\") und freien Vertriebspartnern (nachfolgend „VP\") im Rahmen der Vermittlung von Immobilienanlagen." },
    { type: "h2", text: "§ 2 Status des Vertriebspartners" },
    { type: "list", items: [
      "Der VP ist selbstständiger Handelsvertreter im Sinne des § 84 HGB.",
      "Er handelt im eigenen Namen und auf eigene Rechnung und ist für seine Steuern und Sozialabgaben selbst verantwortlich.",
      "Eine Erlaubnis nach § 34c GewO ist eigenständig vom VP einzuholen.",
    ]},
    { type: "h2", text: "§ 3 Aufgaben und Pflichten" },
    { type: "list", items: [
      "Aktive Vermittlung von Immobilienanlagen aus dem MOREImmo-Portfolio.",
      "Ordnungsgemäße Beratung gemäß §§ 16, 17 FinVermV.",
      "Vollständige und korrekte Dokumentation aller Beratungsgespräche.",
      "Verschwiegenheitspflicht über Geschäfts- und Kundendaten.",
      "Teilnahme an mindestens 2 Schulungen pro Jahr.",
    ]},
    { type: "h2", text: "§ 4 Provisionen" },
    { type: "p", text: "Die Provisionssätze richten sich nach dem aktuellen MOREImmo-Karriereplan in der jeweils gültigen Fassung. Provisionsanspruch entsteht mit notarieller Beurkundung des Kaufvertrags und vollständiger Kaufpreiszahlung." },
    { type: "h2", text: "§ 5 Wettbewerbsverbot" },
    { type: "p", text: "Der VP verpflichtet sich, während der Vertragslaufzeit keine Konkurrenztätigkeit für andere Anbieter denkmalgeschützter Sanierungsobjekte oder Renditeimmobilien im B/C-Lagen-Segment auszuüben. Andere Anlageklassen (Versicherungen, Aktien, Beteiligungen) sind ausdrücklich erlaubt." },
    { type: "h2", text: "§ 6 Vertragsdauer und Kündigung" },
    { type: "list", items: [
      "Der Vertrag wird auf unbestimmte Zeit geschlossen.",
      "Ordentliche Kündigung mit Frist von 3 Monaten zum Quartalsende.",
      "Außerordentliche Kündigung bei wichtigem Grund jederzeit möglich.",
    ]},
    { type: "h2", text: "§ 7 Datenschutz" },
    { type: "p", text: "Beide Parteien verpflichten sich zur Einhaltung der DSGVO und schließen bei gemeinsamer Datenverarbeitung einen separaten Auftragsverarbeitungsvertrag." },
    { type: "h2", text: "§ 8 Schlussbestimmungen" },
    { type: "p", text: "Es gilt das Recht der Bundesrepublik Deutschland. Gerichtsstand ist München. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Regelungen unberührt." },
    { type: "callout", variant: "info", text: "Stand: aktuelle Fassung. Verbindlich ist stets die in deinem persönlichen VP-Vertrag referenzierte Version." },
  ],
});

// ─────────────────────────────────────────
// 9. Mail-Setup
// ─────────────────────────────────────────
// Ein Abzug davon liegt als public/dokumente/moreimmo-mail-einrichten.pdf und
// geht als Link in der Zugangsdaten-Mail an Bewerber ohne CRM-Zugang. Nach
// einer Aenderung hier neu erzeugen, siehe src/lib/mailAnleitungPdf.test.ts.
export const generateMailSetupPDF = () => generateSimpleDocPdf({
  title: "MOREImmo Mail einrichten",
  subtitle: "Schritt-für-Schritt für Apple iPhone, Apple MacBook und Outlook (one.com)",
  filename: "MOREImmo_Mail_Setup.pdf",
  deckblatt: { kennung: "Anleitung", titel: "MOREImmo Mail einrichten", untertitel: "Schritt-für-Schritt für Apple iPhone, Apple MacBook und Outlook (one.com)", nummer: "ORG-01" },
  blocks: [
    { type: "p", text: "Diese Anleitung zeigt dir Schritt für Schritt, wie du deine MOREImmo-E-Mail-Adresse (one.com) auf deinem iPhone, deinem MacBook und in Outlook (Windows oder Mac) einrichtest." },
    { type: "h2", text: "Allgemeine Server-Daten (one.com)" },
    { type: "table",
      head: ["Einstellung", "Wert"],
      rows: [
        ["Posteingang (IMAP)", "imap.one.com"],
        ["IMAP-Port / Sicherheit", "993 / SSL/TLS"],
        ["Postausgang (SMTP)", "send.one.com"],
        ["SMTP-Port / Sicherheit", "465 / SSL/TLS"],
        ["Benutzername", "vollständige E-Mail-Adresse"],
        ["Passwort", "dein E-Mail-Passwort"],
      ],
    },
    { type: "callout", variant: "warn", text: "Initial-Passwort beim ersten Login im Webmailer (mail.one.com) ändern." },

    { type: "pageBreak" },

    // ───────── Apple iPhone ─────────
    { type: "h2", text: "Apple iPhone (iOS Mail-App)" },
    { type: "p", text: "Wenn du deine E-Mail-Adresse von One.com auf deinem iPhone in Apple Mail einrichten möchtest, geht das in wenigen Minuten." },

    { type: "h2", text: "1. E-Mail-Konto auf dem iPhone hinzufügen" },
    { type: "list", ordered: true, items: [
      "Öffne Einstellungen.",
      "Gehe zu Apps → Mail → Mail-Accounts.",
      "Tippe auf „Account hinzufügen“.",
      "Wähle „Andere“.",
      "Tippe auf „Mail-Account hinzufügen“.",
    ]},

    { type: "h2", text: "2. Daten eingeben" },
    { type: "list", items: [
      "Name: dein Name",
      "E-Mail: deine vollständige E-Mail-Adresse",
      "Passwort: dein E-Mail-Passwort",
      "Beschreibung: z. B. „MOREImmo“",
    ]},
    { type: "p", text: "Dann auf „Weiter“ tippen." },

    { type: "h2", text: "3. IMAP auswählen (empfohlen)" },
    { type: "p", text: "Wähle IMAP und gib folgende Daten ein:" },
    { type: "table",
      head: ["Bereich", "Einstellung", "Wert"],
      rows: [
        ["Eingangsserver", "Hostname", "imap.one.com"],
        ["Eingangsserver", "Benutzername", "vollständige E-Mail-Adresse"],
        ["Eingangsserver", "Passwort", "E-Mail-Passwort"],
        ["Ausgangsserver", "Hostname", "send.one.com"],
        ["Ausgangsserver", "Benutzername", "vollständige E-Mail-Adresse"],
        ["Ausgangsserver", "Passwort", "E-Mail-Passwort"],
      ],
    },
    { type: "p", text: "Dann auf „Weiter“ tippen." },

    { type: "h2", text: "4. Falls Apple nach Ports fragt" },
    { type: "table",
      head: ["Server", "Port", "SSL"],
      rows: [
        ["Eingangsserver (IMAP) – imap.one.com", "993", "Ein"],
        ["Ausgangsserver (SMTP) – send.one.com", "465", "Ein"],
      ],
    },
    { type: "callout", variant: "info", text: "Alternativ funktioniert oft auch SMTP-Port 587 mit aktiviertem TLS/STARTTLS." },

    { type: "h2", text: "5. Speichern" },
    { type: "list", ordered: true, items: [
      "„Mail“ aktivieren.",
      "Auf „Sichern“ tippen.",
    ]},
    { type: "callout", variant: "success", text: "Dein MOREImmo-E-Mail-Konto ist nun eingerichtet und synchronisiert sich mit deinem iPhone." },

    { type: "pageBreak" },

    // ───────── Apple MacBook ─────────
    { type: "h2", text: "Apple MacBook (Apple Mail unter macOS)" },
    { type: "p", text: "So richtest du deine MOREImmo-E-Mail-Adresse in Apple Mail auf deinem MacBook ein." },

    { type: "h2", text: "1. Apple Mail öffnen" },
    { type: "list", ordered: true, items: [
      "Öffne die App „Mail“.",
      "Klicke in der Menüleiste auf „Mail“ → „Accounts hinzufügen…“ (oder Systemeinstellungen → Internet-Accounts → Account hinzufügen).",
      "Wähle „Anderer Mail-Account…“ und klicke auf „Fortfahren“.",
    ]},

    { type: "h2", text: "2. Daten eingeben" },
    { type: "list", items: [
      "Name: dein Name",
      "E-Mail-Adresse: deine vollständige E-Mail-Adresse",
      "Passwort: dein E-Mail-Passwort",
    ]},
    { type: "p", text: "Klicke auf „Anmelden“. Wenn Apple Mail die Einstellungen nicht automatisch findet, gib die Serverdaten manuell ein:" },

    { type: "h2", text: "3. Server-Daten manuell" },
    { type: "table",
      head: ["Bereich", "Einstellung", "Wert"],
      rows: [
        ["Allgemein", "Account-Typ", "IMAP"],
        ["Eingangsserver", "Server", "imap.one.com"],
        ["Eingangsserver", "Benutzername", "vollständige E-Mail-Adresse"],
        ["Eingangsserver", "Passwort", "E-Mail-Passwort"],
        ["Ausgangsserver", "Server", "send.one.com"],
        ["Ausgangsserver", "Benutzername", "vollständige E-Mail-Adresse"],
        ["Ausgangsserver", "Passwort", "E-Mail-Passwort"],
      ],
    },
    { type: "p", text: "Klicke auf „Anmelden“." },

    { type: "h2", text: "4. Ports und Verschlüsselung" },
    { type: "table",
      head: ["Server", "Port", "Verschlüsselung"],
      rows: [
        ["IMAP (Eingang) – imap.one.com", "993", "SSL/TLS"],
        ["SMTP (Ausgang) – send.one.com", "465", "SSL/TLS"],
      ],
    },
    { type: "callout", variant: "info", text: "Alternativ funktioniert auch SMTP-Port 587 mit STARTTLS." },

    { type: "h2", text: "5. Apps auswählen" },
    { type: "p", text: "Aktiviere „Mail“ (und optional „Notizen“) und klicke auf „Fertig“." },
    { type: "callout", variant: "success", text: "Apple Mail synchronisiert nun deinen MOREImmo-Posteingang automatisch." },

    { type: "pageBreak" },

    // ───────── Outlook ─────────
    { type: "h2", text: "Microsoft Outlook (Windows & Mac)" },
    { type: "p", text: "So fügst du deine MOREImmo-E-Mail-Adresse in Outlook hinzu." },

    { type: "h2", text: "1. Outlook öffnen und Konto hinzufügen" },
    { type: "list", ordered: true, items: [
      "Öffne Outlook.",
      "Gehe zu „Datei“ → „Konto hinzufügen“ (Windows) bzw. „Outlook“ → „Einstellungen“ → „Konten“ → „+“ (Mac).",
      "E-Mail-Adresse eingeben.",
      "Auf „Verbinden“ klicken.",
    ]},
    { type: "callout", variant: "info", text: "Falls Outlook die Einstellungen nicht automatisch findet, wähle „Erweiterte Optionen“ → „Konto manuell einrichten“ und wähle IMAP." },

    { type: "h2", text: "2. IMAP-Einstellungen (Posteingang)" },
    { type: "table",
      head: ["Einstellung", "Wert"],
      rows: [
        ["Server", "imap.one.com"],
        ["Port", "993"],
        ["Verschlüsselung", "SSL/TLS"],
        ["Benutzername", "vollständige E-Mail-Adresse"],
        ["Passwort", "E-Mail-Passwort"],
      ],
    },

    { type: "h2", text: "3. SMTP-Einstellungen (Postausgang)" },
    { type: "table",
      head: ["Einstellung", "Wert"],
      rows: [
        ["Server", "send.one.com"],
        ["Port", "465"],
        ["Verschlüsselung", "SSL/TLS"],
        ["Benutzername", "vollständige E-Mail-Adresse"],
        ["Passwort", "E-Mail-Passwort"],
      ],
    },
    { type: "p", text: "Bestätige die Eingaben und schließe die Einrichtung ab." },
    { type: "callout", variant: "success", text: "Outlook synchronisiert nun deinen MOREImmo-Posteingang automatisch." },

    { type: "callout", variant: "info", text: "Bei Problemen: Support-Ticket im CRM unter „Support kontaktieren“ öffnen oder direkt an it@more.immo schreiben." },
  ],
});

// ─────────────────────────────────────────
// 10. Leitfaden Kaltakquise
// ─────────────────────────────────────────
export const generateLeitfadenKaltakquisePDF = () => generateSimpleDocPdf({
  title: "Leitfaden Kaltakquise",
  subtitle: "Verkaufspsychologisch aufgebaute Gesprächsführung für Erstkontakte",
  filename: "MOREImmo_Leitfaden_Kaltakquise.pdf",
  deckblatt: { kennung: "Gesprächsleitfaden", titel: "Leitfaden Kaltakquise", untertitel: "Verkaufspsychologisch aufgebaute Gesprächsführung für Erstkontakte", nummer: "LTF-01" },
  blocks: [
    { type: "h2", text: "Mindset vor dem Anruf" },
    { type: "list", items: [
      "Du bietest einen Mehrwert – keine Belästigung.",
      "Ein Nein ist kein persönliches Nein, sondern eine Information.",
      "Lächle beim Sprechen – das hört man am Telefon.",
      "Stehe auf, halte aufrechte Körperhaltung – das verändert deine Stimme.",
    ]},
    { type: "h2", text: "Phase 1: Einstieg (10 Sekunden)" },
    { type: "callout", text: "„Hallo [Vorname], hier ist [dein Name] von MOREImmo in München. Ich rufe an, weil [konkreter Anlass / Empfehlung / Recherche]. Hast du 2 Minuten?\"" },
    { type: "p", text: "Wichtig: Konkreter Anlass = Vertrauen. Z. B. 'Du hast dir auf unserer Website das Analysetool angeschaut' oder 'Du wurdest uns von Herrn X empfohlen'." },
    { type: "h2", text: "Phase 2: Bedarfsanalyse (offene Fragen)" },
    { type: "list", items: [
      "„Was war der Grund, warum du dich für das Thema Kapitalanlage-Immobilie interessiert hast?\"",
      "„Wie sieht deine aktuelle Altersvorsorge aus?\"",
      "„Welche Erfahrungen hast du bisher mit Kapitalanlagen gemacht?\"",
      "„Was wäre für dich persönlich der größte Mehrwert einer Immobilie als Kapitalanlage?\"",
    ]},
    { type: "h2", text: "Phase 3: Nutzen-Argumentation" },
    { type: "p", text: "Vermeide Produkt-Pitches. Spiegle die Antworten des Kunden zurück und verbinde sie mit konkretem Nutzen." },
    { type: "callout", variant: "info", text: "„Du sagst, dir ist Sicherheit besonders wichtig. Genau deshalb arbeiten wir ausschließlich mit B/C-Lagen-Bestandsobjekten – die sind weniger volatil als A-Städte und haben höhere Mietrenditen.\"" },
    { type: "h2", text: "Phase 4: Termin-Closing" },
    { type: "list", items: [
      "„Macht es für dich Sinn, dass wir uns einmal in Ruhe online unterhalten – 30 Minuten?\"",
      "„Wann passt es dir besser – diese Woche Donnerstag um 18 Uhr oder lieber Freitag um 17 Uhr?\"",
      "Alternative-Frage statt Ja/Nein-Frage stellen!",
    ]},
    { type: "h2", text: "Phase 5: Bestätigung" },
    { type: "p", text: "Schicke direkt im Anschluss eine WhatsApp oder E-Mail mit Termin-Bestätigung, kurzer Agenda und einem hochwertigen Vorab-Material (z. B. PDF Marktanalyse)." },
    { type: "callout", variant: "success", text: "Erfolgsformel: 70 % zuhören, 30 % sprechen. Wer fragt, führt." },
  ],
});

// ─────────────────────────────────────────
// 11. Leitfaden Warmkontakte / Empfehlungen
// ─────────────────────────────────────────
export const generateLeitfadenWarmkontaktePDF = () => generateSimpleDocPdf({
  title: "Leitfaden Warmkontakte & Empfehlungen",
  subtitle: "Authentische Eröffnung für Empfehlungs-Gespräche",
  filename: "MOREImmo_Leitfaden_Warmkontakte.pdf",
  deckblatt: { kennung: "Gesprächsleitfaden", titel: "Leitfaden Warmkontakte & Empfehlungen", untertitel: "Authentische Eröffnung für Empfehlungs-Gespräche", nummer: "LTF-02" },
  blocks: [
    { type: "h2", text: "Der Unterschied zu Kalt" },
    { type: "p", text: "Empfehlungen sind das wertvollste Asset im Vertrieb: hohe Conversion, kurzer Sales Cycle, niedrige CAC. Aber Empfehlungen können auch verbrennen, wenn die Eröffnung schlecht ist. Authentizität schlägt Verkauf." },
    { type: "h2", text: "Phase 1: Eröffnung mit Bezug zum Empfehler" },
    { type: "callout", text: "„Hallo [Vorname], hier ist [dein Name]. [Empfehler-Vorname] hat mir deine Nummer gegeben und meinte, dass du dich gerade mit dem Thema Vermögensaufbau beschäftigst. Passt es dir kurz?\"" },
    { type: "h2", text: "Phase 2: Brücke schlagen" },
    { type: "list", items: [
      "„[Empfehler-Vorname] und ich kennen uns seit [Anlass / Zeitraum].\"",
      "„Wir haben gemeinsam an seiner Strategie gearbeitet, jetzt hat er gemeint, ich soll auch mit dir sprechen.\"",
      "„Ich verspreche dir: Kein Verkaufsgespräch, sondern erst einmal kennenlernen.\"",
    ]},
    { type: "h2", text: "Phase 3: Bedarfsanalyse" },
    { type: "list", items: [
      "„Was hat dich an dem Thema interessiert, als [Empfehler] das mit dir besprochen hat?\"",
      "„Was würdest du dir von einem Erstgespräch wünschen, damit es sich für dich gelohnt hat?\"",
      "„Wie sieht deine aktuelle finanzielle Situation aus – grob umrissen?\"",
    ]},
    { type: "h2", text: "Phase 4: Vertrauen festigen" },
    { type: "p", text: "Empfehlungs-Kunden vergleichen dich mit dem Empfehler. Erzähle eine kurze Story über die gemeinsame Zusammenarbeit (mit dessen Einverständnis), das schafft Vertrauen." },
    { type: "h2", text: "Phase 5: Termin-Closing" },
    { type: "callout", variant: "info", text: "„Ich schlage vor, wir machen es genauso wie mit [Empfehler]: 30 Minuten online, du schaust dir an, was wir machen, und entscheidest dann, ob es für dich passt. Wann passt es dir?\"" },
    { type: "h2", text: "Nach dem Termin: Empfehler informieren" },
    { type: "list", items: [
      "Bedanke dich beim Empfehler unmittelbar – persönliche WhatsApp oder Anruf.",
      "Halte ihn auf dem Laufenden über das Ergebnis (DSGVO-konform: nur grob).",
      "Bei Abschluss: Danke-Geschenk oder Empfehlungsprovision auszahlen.",
    ]},
    { type: "callout", variant: "success", text: "Studien zeigen: Empfehlungs-Kunden haben 4× höhere Lifetime-Value und empfehlen selbst 2× häufiger weiter." },
  ],
});

// ─────────────────────────────────────────
// 12. Einwandbehandlung Kapitalanlage
// ─────────────────────────────────────────
// ─────────────────────────────────────────
// 13. Steuerwissen kompakt – Kapitalanlageimmobilie
// ─────────────────────────────────────────
export const generateSteuerwissenPDF = () => generateSimpleDocPdf({
  title: "Steuerwissen kompakt",
  subtitle: "Der Leitfaden zur Kapitalanlage-Immobilie",
  filename: "MOREImmo_Steuerwissen_Kompakt.pdf",
  deckblatt: { kennung: "Steuerwissen", titel: "Steuerwissen kompakt", untertitel: "Der Leitfaden zur Kapitalanlage-Immobilie", nummer: "STE-06" },
  blocks: [
    { type: "p", text: "Eine vermietete Immobilie ist eines der steuerlich attraktivsten Investments in Deutschland. Dieser Leitfaden fasst die wichtigsten steuerlichen Hebel zusammen – von der Anschaffung über die Haltephase bis zum steuerfreien Verkauf nach 10 Jahren." },

    { type: "h2", text: "1. Anschaffungsphase – Was ist steuerlich absetzbar?" },
    { type: "list", items: [
      "Notarkosten und Grundbuchgebühren (anteilig auf Gebäude)",
      "Maklercourtage (anteilig auf Gebäude)",
      "Grunderwerbsteuer (anteilig auf Gebäude)",
      "Finanzierungsnebenkosten (Bereitstellungszinsen, Schätzgebühr) zu 100 %",
      "Fahrt- und Beratungskosten rund um den Erwerb",
    ]},
    { type: "callout", variant: "info", text: "Kaufnebenkosten werden auf Grundstück und Gebäude aufgeteilt. Nur der Gebäudeanteil ist über die AfA absetzbar – das Grundstück nicht." },

    { type: "h2", text: "2. AfA – Die wichtigste Steuerersparnis" },
    { type: "p", text: "Die Absetzung für Abnutzung (AfA) verteilt die Anschaffungskosten des Gebäudes auf die voraussichtliche Nutzungsdauer und mindert dein steuerpflichtiges Einkommen jedes Jahr." },
    { type: "table",
      head: ["Baujahr", "AfA-Satz", "Nutzungsdauer"],
      rows: [
        ["Neubau ab 2023", "3,0 % linear", "33 Jahre"],
        ["Baujahr ab 1925", "2,0 % linear", "50 Jahre"],
        ["Baujahr vor 1925", "2,5 % linear", "40 Jahre"],
        ["Denkmalimmobilie (Sanierungsanteil)", "9 % p.a. (8 J.) + 7 % p.a. (4 J.)", "12 Jahre"],
      ],
    },
    { type: "callout", variant: "success", text: "Beispiel: Gebäudewert 200.000 € × 2 % AfA = 4.000 € steuerlicher Verlust pro Jahr – bei 42 % Spitzensteuersatz = 1.680 € Erstattung." },

    { type: "h2", text: "3. Laufende Werbungskosten – Diese Posten kannst du absetzen" },
    { type: "list", items: [
      "Schuldzinsen aus dem Immobiliendarlehen (Tilgung NICHT)",
      "Hausgeld (außer Instandhaltungsrücklage – die wird erst bei Verbrauch wirksam)",
      "Reparatur- und Renovierungskosten",
      "Verwalterhonorar und Mietersuche",
      "Versicherungen (Wohngebäude, Haftpflicht)",
      "Grundsteuer",
      "Fahrtkosten zur Immobilie (0,30 €/km)",
      "Kontoführungsgebühren für das Mietkonto",
    ]},

    { type: "h2", text: "4. Sonderfall: Erhaltungsaufwand vs. Herstellungskosten" },
    { type: "p", text: "Reparaturen sind sofort absetzbar (Erhaltungsaufwand). Maßnahmen, die den Standard heben, gelten als Herstellungskosten und werden über die AfA verteilt." },
    { type: "callout", variant: "warn", text: "15-%-Regel: Liegen die Renovierungskosten innerhalb der ersten 3 Jahre über 15 % der Gebäude-Anschaffungskosten (netto), werden sie zwingend als Herstellungsaufwand gewertet – nicht sofort absetzbar." },

    { type: "h2", text: "5. Die 10-Jahres-Spekulationsfrist" },
    { type: "p", text: "Vermietete Immobilien können nach 10 Jahren STEUERFREI verkauft werden. Die gesamte Wertsteigerung – egal wie hoch – ist steuerfrei. Selbstgenutzte Immobilien sogar sofort." },
    { type: "table",
      head: ["Variante", "Steuer auf Veräußerungsgewinn"],
      rows: [
        ["Verkauf vor 10 Jahren (vermietet)", "Voller persönlicher Steuersatz (bis 45 %)"],
        ["Verkauf nach 10 Jahren (vermietet)", "0 € – steuerfrei"],
        ["Selbstgenutzte Immobilie", "Steuerfrei (nach 2 vollen Kalenderjahren Eigennutzung)"],
      ],
    },

    { type: "h2", text: "6. Mieteinnahmen versteuern" },
    { type: "p", text: "Mieteinnahmen abzüglich aller Werbungskosten ergeben die „Einkünfte aus Vermietung und Verpachtung\" (Anlage V). Diese werden mit deinem persönlichen Einkommensteuersatz versteuert. Durch AfA + Schuldzinsen + Werbungskosten entsteht in den ersten Jahren meist ein Verlust, der dein zu versteuerndes Einkommen senkt." },

    { type: "h2", text: "7. Tipps zur Steueroptimierung" },
    { type: "list", ordered: true, items: [
      "Freibetrag in die Lohnsteuerkarte (ELStAM) eintragen → sofort mehr Netto.",
      "Tilgung niedrig halten, Sondertilgung statt hoher Annuität → Schuldzinsen bleiben hoch = absetzbar.",
      "Renovierungen über mehrere Jahre verteilen, um die 15-%-Grenze zu wahren.",
      "Ehegattenschaukel nach 10 Jahren prüfen → AfA-Volumen erneuern, weiter steuerfrei.",
      "Übertragung an Kinder als vorgezogene Erbfolge mit Nießbrauch.",
    ]},
    { type: "callout", variant: "info", text: "Dieser Leitfaden ersetzt keine Steuerberatung. Konsultiere bei größeren Entscheidungen immer einen Steuerberater oder Fachanwalt für Steuerrecht." },
  ],
});

// ─────────────────────────────────────────
// 14. Steuersätze nach Einkommenshöhe
// ─────────────────────────────────────────
export const generateSteuersaetzePDF = () => generateSimpleDocPdf({
  title: "Steuersätze nach Einkommenshöhe",
  subtitle: "Übersicht 2025 mit Beispielrechnungen",
  filename: "MOREImmo_Steuersaetze_Einkommenshoehe.pdf",
  deckblatt: { kennung: "Steuerwissen", titel: "Steuersätze nach Einkommenshöhe", untertitel: "Übersicht 2025 mit Beispielrechnungen", nummer: "STE-07" },
  blocks: [
    { type: "p", text: "Die deutsche Einkommensteuer ist progressiv aufgebaut. Diese Übersicht zeigt, wie hoch dein Grenzsteuersatz tatsächlich ist – und wie viel eine vermietete Immobilie an Steuern spart." },

    { type: "h2", text: "Tarifstufen 2025 (Single)" },
    { type: "table",
      head: ["Einkommen p.a.", "Grenzsteuersatz", "Bezeichnung"],
      rows: [
        ["bis 12.096 €", "0 %", "Grundfreibetrag"],
        ["12.097 – 17.443 €", "14 – 24 %", "Eingangszone"],
        ["17.444 – 68.480 €", "24 – 42 %", "Progressionszone 2"],
        ["68.481 – 277.825 €", "42 %", "Spitzensteuersatz"],
        ["ab 277.826 €", "45 %", "Reichensteuer"],
      ],
    },
    { type: "callout", variant: "info", text: "Verheiratete (Splittingverfahren): Alle Grenzen verdoppeln sich. Beispiel: Spitzensteuersatz greift erst ab 136.961 € gemeinsamem Einkommen." },

    { type: "h2", text: "Steuerersparnis durch 5.000 € Werbungskostenüberschuss (Immobilie)" },
    { type: "table",
      head: ["Brutto-Einkommen", "Steuersatz", "Ersparnis p.a.", "Ersparnis p.M."],
      rows: [
        ["30.000 €", "ca. 28 %", "1.400 €", "117 €"],
        ["50.000 €", "ca. 36 %", "1.800 €", "150 €"],
        ["75.000 €", "42 %", "2.100 €", "175 €"],
        ["100.000 €", "42 %", "2.100 €", "175 €"],
        ["150.000 €", "42 %", "2.100 €", "175 €"],
        ["300.000 €", "45 %", "2.250 €", "188 €"],
      ],
    },

    { type: "h2", text: "Solidaritätszuschlag und Kirchensteuer" },
    { type: "list", items: [
      "Soli: Seit 2021 nur noch ab ca. 73.000 € zu versteuerndem Einkommen (Single). Maximal 5,5 % der Einkommensteuer.",
      "Kirchensteuer: 8 % (BY, BW) bzw. 9 % (übrige Bundesländer) auf die Einkommensteuer.",
      "Effektiver Spitzensteuersatz mit Soli + KiSt (NRW, 9 %): rund 48,3 %.",
    ]},

    { type: "h2", text: "Beispielrechnung: Single, 70.000 € brutto" },
    { type: "table",
      head: ["Position", "Betrag"],
      rows: [
        ["Bruttoeinkommen", "70.000 €"],
        ["Werbungskosten Vermietung (AfA + Zinsen)", "– 5.000 €"],
        ["Zu versteuerndes Einkommen", "65.000 €"],
        ["Einkommensteuer ohne Immobilie", "ca. 18.450 €"],
        ["Einkommensteuer mit Immobilie", "ca. 16.350 €"],
        ["Ersparnis pro Jahr", "ca. 2.100 €"],
        ["Ersparnis pro Monat", "ca. 175 €"],
      ],
    },
    { type: "callout", variant: "success", text: "Faustregel: Pro 1.000 € steuerlichem Verlust sparst du im Spitzensteuersatz rund 420 € Steuern – das entspricht 35 € mehr Netto pro Monat." },

    { type: "h2", text: "Tipp: Freibetrag direkt nutzen" },
    { type: "p", text: "Trage den steuerlichen Verlust in deine Lohnsteuerkarte (ELStAM) ein – so reduziert dein Arbeitgeber den Lohnsteuerabzug ab dem Folgemonat. Du musst nicht bis zur nächsten Steuererklärung warten." },
    { type: "callout", variant: "warn", text: "Alle Werte beruhen auf dem Steuertarif 2025. Soli und Kirchensteuer variieren regional. Diese Tabelle ersetzt keine Steuerberatung." },
  ],
});

// ─────────────────────────────────────────
// 15. Einwandbehandlung Kapitalanlage
// ─────────────────────────────────────────
export const generateEinwandbehandlungPDF = () => generateSimpleDocPdf({
  title: "Einwandbehandlung Kapitalanlage-Immobilie",
  subtitle: "Antworten auf typische Einwände im Immobilienvertrieb",
  filename: "MOREImmo_Einwandbehandlung.pdf",
  deckblatt: { kennung: "Gesprächsleitfaden", titel: "Einwandbehandlung Kapitalanlage-Immobilie", untertitel: "Antworten auf typische Einwände im Immobilienvertrieb", nummer: "LTF-03" },
  blocks: [
    { type: "p", text: "Einwände sind ein Zeichen von Interesse. Wer keine Einwände hat, hat meist auch keine Kaufabsicht. Antworten ehrlich, sachlich und mit Zahlen – nie defensiv." },
    { type: "h2", text: "„Das ist mir zu teuer / zu hoher Eigenkapital-Bedarf\"" },
    { type: "callout", variant: "info", text: "„Verstehe ich. Lass uns kurz rechnen: Bei 12 % Kaufnebenkosten auf 250.000 € sind das 30.000 € EK. Die Bank finanziert die restlichen 250.000 €. Bei einer Bruttomiete von 900 €/Monat und 800 €/Monat Annuität ist dein Cashflow nahezu neutral. Dein EK arbeitet, dein Vermögen wächst – ohne dass du monatlich was draufzahlst.\"" },
    { type: "h2", text: "„Ich habe keine Zeit, mich um eine Immobilie zu kümmern\"" },
    { type: "callout", variant: "info", text: "„Das ist genau der Grund, warum wir das Property-Management mitliefern. Du investierst genau einmal Zeit – beim Kauf. Danach kümmert sich die Hausverwaltung um Mieterauswahl, Reparaturen, Nebenkostenabrechnung. Deine einzige Aufgabe: einmal im Jahr die Steuererklärung an deinen Steuerberater geben.\"" },
    { type: "h2", text: "„Was ist, wenn der Mieter nicht zahlt?\"" },
    { type: "callout", variant: "info", text: "„Eine berechtigte Frage. Wir haben drei Sicherungsmechanismen: 1) SCHUFA-Prüfung jeder Mietinteressenten, 2) Drei-Monats-Kaution, 3) Mietausfall-Versicherung als Option für 12-15 € pro Monat. Statistisch liegt die Mietausfallquote in unseren Objekten bei unter 0,8 %.\"" },
    { type: "h2", text: "„Ich glaube, Immobilien-Markt ist zu hoch / blasenartig\"" },
    { type: "callout", variant: "info", text: "„Eine berechtigte Wahrnehmung – allerdings für die A-Städte. Wir investieren bewusst in B/C-Lagen mit positivem Bevölkerungstrend, dort sind Kaufpreisfaktoren von 14-18 normal. Außerdem hat sich der Markt 2023-2024 bereits um rund 13 % korrigiert. Wir sind in der Bodenbildungsphase, nicht in einer Blase.\"" },
    { type: "h2", text: "„Aktien sind doch viel rentabler\"" },
    /*
      Bis zum 21.09.2026 stand hier „Mit dem Hebel kommst du auf eine
      Eigenkapitalrendite von 22-30 %". Die Zahl kam aus keiner Rechnung: Die
      8,0 Prozent sind Wertsteigerung PLUS Mietrendite und wurden trotzdem wie
      eine Mietrendite gehebelt, ohne Tilgung, Kosten, Steuer und Zeitverlauf.
      Der Partner nennt jetzt keine Renditezahl mehr, sondern erzeugt sie live
      im Investmentrechner. Eine Rechnung auf dem Bildschirm ist im Gespraech
      staerker als eine Faustformel, und sie haelt jeder Nachfrage stand.
    */
    { type: "callout", variant: "info", text: "„Verstehe ich, das höre ich oft. Darf ich kurz fragen: Geht es dir um die Prozentzahl oder darum, was am Ende bei dir ankommt? Die Prozentzahl liegt bei beiden ähnlich. Der Unterschied ist, wessen Geld arbeitet: Für ein Depot bekommst du kaum Kredit, für eine vermietete Wohnung finanziert die Bank 80 bis 100 Prozent, und den größten Teil der Rate zahlt der Mieter. Fair ist auch die andere Seite: Dieser Hebel wirkt in beide Richtungen, deshalb schauen wir uns Lage und Miete genauso genau an wie die Rendite. Was dabei für dich herauskommt, rechnen wir jetzt gemeinsam für dieses Objekt aus, mit deiner Finanzierung und deinem Steuersatz.\"" },
    { type: "h2", text: "„Ich muss das erst mit meinem Steuerberater besprechen\"" },
    { type: "callout", variant: "info", text: "„Sehr gerne, das machen die meisten unserer Kunden. Damit dein Steuerberater alle Infos hat, schicke ich dir eine vollständige steuerliche Rechnung mit AfA, Schuldzinsen und deinem persönlichen Steuersatz. Wann passt dir unser Folgegespräch – diese oder nächste Woche?\"" },
    { type: "h2", text: "„Ich brauche noch Bedenkzeit\"" },
    { type: "callout", variant: "info", text: "„Absolut, eine Immobilie kauft man nicht aus dem Bauch heraus. Was genau möchtest du noch klären? Ist es eine Frage zur Finanzierung, zum Objekt selbst oder zu uns als Anbieter?\"" },
    { type: "callout", variant: "success", text: "Goldene Regel: Den Einwand erst paraphrasieren, dann mit einer Frage öffnen, dann mit Fakten antworten. Niemals widersprechen, immer 'verstehe ich' voranstellen." },
  ],
});
