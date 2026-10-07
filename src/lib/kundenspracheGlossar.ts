/**
 * Das Glossar für alle englischen Kundentexte.
 *
 * Übernommen aus dem Plan Kundensprache vom 25.09.2026 (Abschnitt 5), der es
 * aus `beratungspraesentationTexte.ts` und dem Portal-Englisch zusammengestellt
 * hat. Christian hat den Plan am 25.09.2026 freigegeben, samt Entscheidung 16
 * zum Wort für den Berater.
 *
 * Regeln für jeden, der englische Kundentexte schreibt:
 *   - Ein deutscher Begriff hat genau eine englische Entsprechung. Wer eine
 *     andere will, ändert sie hier und nicht in einem einzelnen Text.
 *   - Deutsche Rechts- und Steuerbegriffe stehen beim ersten Auftreten im
 *     Text mit dem deutschen Wort in Klammern, etwa
 *     „service charge (Hausgeld)“. Die Spalte `ersterAuftritt` hat genau
 *     diese Form. Danach reicht `en`.
 *   - Britisches Englisch (programme, appraisal), passend zu `en-GB` in
 *     `sprachFormat.ts`.
 *   - Du-Texte werden „you“ mit freundlichem, direktem Ton; Gruppe F
 *     (Verträge, Datenschutz, Selbstauskunft, Notar) „Dear Mr/Ms {Nachname}“
 *     und förmlich, ohne Kurzformen. Siehe Plan 4.4.
 *
 * Die Beratungspräsentation darf dieses Glossar mitnutzen; ihre eigenen Texte
 * in `beratungspraesentationTexte.ts` bleiben davon unberührt.
 */

export interface GlossarEintrag {
  /** Der deutsche Begriff, wie er im CRM steht. */
  de: string;
  /** Die englische Entsprechung im laufenden Text. */
  en: string;
  /**
   * Die Form beim ersten Auftreten, mit dem deutschen Wort in Klammern.
   * Fehlt sie, ist `en` auch beim ersten Mal richtig.
   */
  ersterAuftritt?: string;
  /** Wofür der Eintrag gilt oder wovor er warnt. */
  hinweis?: string;
}

export const KUNDENSPRACHE_GLOSSAR: readonly GlossarEintrag[] = [
  { de: "Kaufpreis", en: "purchase price" },
  { de: "Eigenkapital", en: "equity" },
  { de: "Eigenanteil", en: "own contribution" },
  { de: "Kaufnebenkosten", en: "incidental purchase costs" },
  { de: "Bruttomietrendite", en: "gross rental yield" },
  { de: "Kaltmiete", en: "net cold rent", ersterAuftritt: "net cold rent (Kaltmiete)" },
  { de: "Mieteinnahmen", en: "rental income" },
  { de: "Mietgarantie", en: "rent guarantee" },
  { de: "Hausgeld", en: "service charge", ersterAuftritt: "service charge (Hausgeld)" },
  { de: "Nicht umlagefähige Kosten", en: "non-recoverable costs" },
  { de: "Verwaltergebühr", en: "management fee" },
  { de: "Sondereigentum", en: "individual unit", ersterAuftritt: "individual unit (Sondereigentum)" },
  {
    de: "WEG / Eigentümergemeinschaft",
    en: "owners’ association",
    ersterAuftritt: "owners’ association (WEG / Eigentümergemeinschaft)",
  },
  {
    de: "Instandhaltungsrücklage",
    en: "maintenance reserve",
    ersterAuftritt: "maintenance reserve (Instandhaltungsrücklage)",
  },
  { de: "Zins und Tilgung", en: "interest and repayment" },
  { de: "Tilgung", en: "repayment" },
  { de: "Anfängliche Tilgung", en: "initial repayment" },
  { de: "Restschuld", en: "remaining debt" },
  { de: "Finanzierungszinsen", en: "financing interest" },
  { de: "Finanzierung", en: "financing" },
  { de: "Bonitätsprüfung", en: "credit check" },
  { de: "Selbstauskunft", en: "self-disclosure", ersterAuftritt: "self-disclosure (Selbstauskunft)" },
  { de: "Reservierung", en: "reservation" },
  { de: "Reservierungsvereinbarung", en: "reservation agreement" },
  { de: "Notar", en: "notary" },
  { de: "Notartermin", en: "notary appointment", ersterAuftritt: "notary appointment (Notartermin)" },
  { de: "Kundenordner", en: "customer folder" },
  { de: "Empfehlung", en: "referral" },
  { de: "Empfehlungsprogramm", en: "referral programme" },
  { de: "Gebäude-AfA", en: "building depreciation", ersterAuftritt: "building depreciation (AfA)" },
  {
    de: "Sonder-AfA § 7b EStG",
    en: "special depreciation",
    ersterAuftritt: "special depreciation (Section 7b EStG)",
  },
  { de: "Degressive AfA", en: "declining-balance depreciation" },
  {
    de: "Erhaltungsaufwand",
    en: "maintenance expenses",
    ersterAuftritt: "maintenance expenses (Erhaltungsaufwand)",
  },
  { de: "Herstellungskosten", en: "production costs", ersterAuftritt: "production costs (Herstellungskosten)" },
  {
    de: "Restnutzungsdauergutachten",
    en: "remaining useful life appraisal",
    ersterAuftritt: "remaining useful life appraisal (Restnutzungsdauergutachten)",
  },
  { de: "Grenzsteuersatz", en: "marginal tax rate" },
  { de: "Steuerersparnis", en: "tax relief" },
  { de: "Steuerentlastung", en: "tax relief" },
  { de: "Grundtabelle", en: "basic tax table", ersterAuftritt: "basic tax table (Grundtabelle)" },
  { de: "Splittingtabelle", en: "splitting table", ersterAuftritt: "splitting table (Splittingtabelle)" },
  {
    de: "Einkünfte aus Vermietung und Verpachtung",
    en: "income from letting and leasing",
    ersterAuftritt: "income from letting and leasing (Vermietung und Verpachtung)",
  },
  { de: "Privatvermögen", en: "private assets", ersterAuftritt: "private assets (Privatvermögen)" },
  {
    de: "Wirtschaftlicher Übergang",
    en: "transfer of benefits and burdens",
    ersterAuftritt: "transfer of benefits and burdens (wirtschaftlicher Übergang)",
  },
  { de: "Wertsteigerung", en: "increase in value" },
  { de: "Wohnfläche", en: "living space" },
  // Im Plan „neu festzulegen“, mit der Freigabe vom 25.09.2026 übernommen.
  { de: "Grundbuch", en: "land register" },
  { de: "Zinsbindung", en: "fixed-interest period" },
  { de: "Kaufvertrag", en: "purchase contract" },
  {
    de: "Auflassungsvormerkung",
    en: "priority notice of conveyance",
    ersterAuftritt: "priority notice of conveyance (Auflassungsvormerkung)",
  },
  { de: "Güterstand", en: "matrimonial property regime" },
  // Entscheidung 16: „advisor“ klingt nach Anlageberatung, die Grenze zwischen
  // Vermittlung und Beratung ist heikel. Deshalb nie „advisor“.
  {
    de: "Ansprechpartner",
    en: "your contact",
    ersterAuftritt: "your contact person at OS Immobilien",
    hinweis: "Nie „advisor“. Langform „your contact person at OS Immobilien“, danach „your contact“.",
  },
  {
    de: "Berater",
    en: "your contact",
    ersterAuftritt: "your contact person at OS Immobilien",
    hinweis: "Wie „Ansprechpartner“. Nie „advisor“.",
  },
  {
    de: "Vertriebspartner",
    en: "sales partner",
    hinweis: "Nur, wo die Rolle gemeint ist. Als Ansprechpartner des Kunden „your contact“.",
  },
];

/**
 * Die englische Entsprechung zu einem deutschen Begriff, oder `undefined`.
 * Groß- und Kleinschreibung zählt nicht.
 *
 * @param ersterAuftritt  Die Form mit dem deutschen Wort in Klammern, sofern es eine gibt.
 */
export function glossarEnglisch(deutsch: string, ersterAuftritt = false): string | undefined {
  const suche = deutsch.trim().toLowerCase();
  const treffer = KUNDENSPRACHE_GLOSSAR.find((e) => e.de.toLowerCase() === suche);
  if (!treffer) return undefined;
  return ersterAuftritt ? treffer.ersterAuftritt ?? treffer.en : treffer.en;
}
