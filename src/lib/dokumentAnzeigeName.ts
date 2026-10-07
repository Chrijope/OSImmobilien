/**
 * Anzeigenamen für Unterlagen und Kundenordner-Kategorien im Kundenportal.
 *
 * Plan Kundensprache vom 25.09.2026, K11 und Risiko „gespeicherte deutsche
 * Texte“: Die Namen der Unterlagen sind zugleich ihr Schlüssel. Sie stehen
 * deutsch in `investments.meta.docStatuses`, `docFileUrls`,
 * `meta.kundenordner[].kategorie` und in den Listen aus
 * `bankpruefungDocs.ts`, `portalUnterlagenListe.ts` und
 * `KUNDENORDNER_DEFAULT_KATEGORIEN`. Prüfungen im CRM vergleichen genau
 * diesen Text. Deshalb wird nie der gespeicherte Wert übersetzt, sondern nur
 * das, was auf dem Bildschirm steht.
 *
 * Unbekannte Namen (etwa von Hand ergänzte Unterlagen oder eigene
 * Kategorien eines Beraters) bleiben, wie sie sind. Der Berater hat sie so
 * geschrieben, eine Übersetzung zur Laufzeit gibt es nicht (Plan 5,
 * Übersetzungsweg).
 *
 * Fachbegriffe nach `kundenspracheGlossar.ts`: Grundschuld, Selbstauskunft,
 * Auflassungsvormerkung stehen mit dem deutschen Wort in Klammern, weil der
 * Kunde sie so auf deutschen Dokumenten wiederfindet.
 */
import type { Sprache } from "../../supabase/functions/_shared/kunden-sprache.ts";

/** Deutsch → Englisch. Schlüssel exakt so, wie sie gespeichert werden. */
export const DOKUMENT_NAMEN_EN: Readonly<Record<string, string>> = {
  // Bonitätscheck
  Selbstauskunft: "Self-disclosure (Selbstauskunft)",
  Personalausweis: "ID card",
  "Letzter Gehaltsnachweis": "Most recent payslip",
  "Vorletzter Gehaltsnachweis": "Second most recent payslip",
  "Vorvorletzter Gehaltsnachweis": "Third most recent payslip",
  "Gehaltsnachweis Dezember Vorjahr": "December payslip of the previous year",
  "Schufa-Bonitätsauskunft": "SCHUFA credit report",

  // Bankprüfung
  "Lohnsteuerbescheinigung des Vorjahrs": "Wage tax certificate for the previous year (Lohnsteuerbescheinigung)",
  "Lohnsteuerbescheinigung Vorjahr": "Wage tax certificate for the previous year (Lohnsteuerbescheinigung)",
  "Steuerbescheide der letzten 3 Jahre": "Tax assessments for the last 3 years",
  "Steuererklärungen der letzten 3 Jahre": "Tax returns for the last 3 years",
  "Bilanz / BWA der letzten 3 Jahre": "Balance sheets / business analyses (BWA) for the last 3 years",
  Handelsregisterauszug: "Commercial register extract",
  'Letzter Steuerbescheid / „Negativ-Erklärung"': "Latest tax assessment / nil declaration (Negativ-Erklärung)",
  'Steuerbescheid / „Negativ-Erklärung"': "Tax assessment / nil declaration (Negativ-Erklärung)",
  Arbeitsvertrag: "Employment contract",
  Ernennungsurkunde: "Certificate of appointment (civil service)",
  "Aktuelle Besoldungsbescheide (letzte 3 Monate)": "Current civil service pay statements (last 3 months)",
  "Aktuelle Renteninformation": "Current pension statement (Renteninformation)",
  Eigenkapitalnachweis: "Proof of equity",
  "Kontoauszüge der letzten 3 Monate": "Bank statements for the last 3 months",
  "Geschäftskontoauszüge der letzten 3 Monate": "Business account statements for the last 3 months",
  "PKV Nachweis": "Proof of private health insurance",
  Mietfreibestätigung: "Rent-free confirmation",
  Mietvertrag: "Tenancy agreement",
  'Eigener Mietvertrag / „Mietfrei-Bestätigung"': "Own tenancy agreement / rent-free confirmation",
  "Kreditvertrag Autokredit": "Loan agreement, car loan",
  "Kreditvertrag Privatkredit": "Loan agreement, personal loan",
  "Kreditvertrag Sonstige": "Loan agreement, other",
  "Darlehensvertrag Hypothek": "Mortgage loan agreement",
  "Mietvertrag Vermietungsobjekt": "Tenancy agreement for a let property",

  // Kundenordner (KUNDENORDNER_DEFAULT_KATEGORIEN)
  Reservierungsvertrag: "Reservation agreement",
  Reservierungsvereinbarung: "Reservation agreement",
  "IBAN Immobilienkonto": "IBAN of the property account",
  Kaufvertragsentwurf: "Draft purchase contract",
  Grundschuld: "Land charge (Grundschuld)",
  Kaufvertrag: "Purchase contract",
  Kaufpreisfälligkeit: "Purchase price due notice (Kaufpreisfälligkeit)",
  "GBA Erwerbvormerkung": "Land register extract with priority notice of conveyance (Auflassungsvormerkung)",
  Darlehensvertrag: "Loan agreement",
  Finanzierungsangebot: "Financing offer",
  Kaufnebenkosten: "Incidental purchase costs",
  Beratungsdokument: "Consultation record",
};

/** Teile in „Nachweis: …“, die aus Auswahllisten der Selbstauskunft stammen. */
const NACHWEIS_TEILE_EN: Readonly<Record<string, string>> = {
  "Bank- & Sparguthaben": "Bank & savings balances",
  "Wertpapiere / Depot": "Securities / custody account",
  Bausparvertrag: "Building savings contract (Bausparvertrag)",
  Lebensversicherung: "Life insurance",
  Immobilien: "Real estate",
  Sonstige: "Other",
  Konto: "Account",
  Girokonto: "Current account",
  Sparkonto: "Savings account",
  Tagesgeld: "Instant-access savings",
  Depot: "Custody account",
};

const PERSON2 = " Person 2";
const NACHWEIS = "Nachweis: ";

function englisch(name: string): string {
  const direkt = DOKUMENT_NAMEN_EN[name];
  if (direkt) return direkt;

  if (name.endsWith(PERSON2)) {
    const basis = name.slice(0, -PERSON2.length);
    const uebersetzt = englisch(basis);
    return uebersetzt === basis ? name : `${uebersetzt} (person 2)`;
  }

  if (name.startsWith(NACHWEIS)) {
    // „Nachweis: Girokonto – Sparkasse“: nur die Art übersetzen, das Institut bleibt.
    const rest = name.slice(NACHWEIS.length);
    const [art, ...institut] = rest.split(" – ");
    const artEn = NACHWEIS_TEILE_EN[art] ?? art;
    return `Proof: ${[artEn, ...institut].join(" – ")}`;
  }

  return name;
}

/**
 * Der Name einer Unterlage oder Kategorie, wie ihn der Kunde lesen soll.
 * Deutsch bleibt unverändert. Den gespeicherten Namen nie hierdurch ersetzen.
 */
export function dokumentAnzeigeName(name: string, sprache: Sprache): string {
  if (sprache !== "en" || !name) return name;
  return englisch(name);
}
