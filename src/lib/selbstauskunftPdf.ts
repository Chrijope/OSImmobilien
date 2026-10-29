import jsPDF from "jspdf";
import type { SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import { BRAND, loadIcon, addCoverPage, textInBreite, sanitizePdfText, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";
import { kreditArt, kreditAuswahlLabel, versicherungenGesamt } from "@/lib/finanzierbarkeitUtils";
import { immobilienPosition, kreditAuswahlText } from "@/lib/kreditPflichtfelder";
import type { Sprache } from "./kundenSprache";
import { SA_ERKLAERUNG, SA_SCHUFA_KLAUSEL, SA_RECHTSTEXT_FASSUNG_EN, SA_WERTE_EN, saWertZweisprachig } from "./selbstauskunftSprache";
import { ZWEISPRACHIG_EINLEITUNG } from "./zweisprachig";
import { hatGueterstand } from "./familienstand";
import { ANLAGE_ZIELE } from "./anlageZiele";
import { ZWEITSPRACHE_FARBE } from "./pdfZweisprachig";

/**
 * Die englischen Beschriftungen des Selbstauskunft-PDF (Plan Kundensprache,
 * Entscheidung 7): Das PDF geht an die Bank, deshalb bleibt Deutsch die erste
 * Zeile, und bei englischen Kunden steht darunter die Übersetzung, etwa
 * „Familienstand“ über „Marital status“. Werte, die der Kunde eingetippt hat,
 * bleiben, wie sie sind; Auswahlwerte bekommen ihre Übersetzung daneben.
 */
export const SA_PDF_BESCHRIFTUNG_EN: Readonly<Record<string, string>> = {
  "A. PERSÖNLICHE VERHÄLTNISSE": "Personal circumstances",
  "B. EINKOMMENSVERHÄLTNISSE (monatlich netto)": "Income (monthly, net)",
  "C. MONATLICHE AUSGABEN": "Monthly expenses",
  "D. VERMÖGENSVERHÄLTNISSE": "Assets",
  "E. IMMOBILIENVERMÖGEN": "Real estate assets",
  "E. VERBINDLICHKEITEN (Kredite / Bürgschaften)": "Liabilities (loans / guarantees)",
  "F. VERBINDLICHKEITEN (Kredite / Bürgschaften)": "Liabilities (loans / guarantees)",
  "BONITÄTSANGABEN": "Creditworthiness",
  "ERKLÄRUNG": "Declaration",
  "Person 1": "Person 1",
  "Person 2": "Person 2",
  Anrede: "Title",
  Titel: "Academic title",
  Vorname: "First name",
  Nachname: "Surname",
  Geburtsname: "Name at birth",
  Geburtsdatum: "Date of birth",
  "Staatsangeh.": "Nationality",
  Familienstand: "Marital status",
  "Wohnhaft seit": "Resident at address since",
  "Steuer-ID": "Tax ID",
  Steuerklasse: "Tax class",
  Kirchensteuer: "Church tax",
  Güterstand: "Matrimonial property regime",
  "Wünsche / Ziele": "Wishes / goals",
  Adresse: "Address",
  "Straße, Nr.": "Street, no.",
  "PLZ / Ort": "Postcode / town",
  Kontakt: "Contact",
  "E-Mail": "Email",
  Telefon: "Telephone",
  Mobil: "Mobile",
  Beschäftigung: "Employment",
  "Art der Tätigkeit": "Type of occupation",
  Arbeitgeber: "Employer",
  Branche: "Industry",
  "Angestellt seit": "Employed since",
  Beruf: "Occupation",
  Probezeit: "Probation period",
  Vertragsart: "Type of contract",
  "Befristet bis": "Fixed-term until",
  "Brutto p.a.": "Gross p.a.",
  Monatsgehälter: "Monthly salaries per year",
  Selbständigkeit: "Self-employment",
  Firma: "Company",
  Seit: "Since",
  Mitarbeiter: "Employees",
  Kinder: "Children",
  "Bankverbindung(en)": "Bank account(s)",
  "Bankverbindungen Person 1": "Bank accounts person 1",
  "Bankverbindungen Person 2": "Bank accounts person 2",
  "Selbst. Tätigkeit": "Self-employment",
  "Rente / Pension": "Pension",
  Mieteinnahmen: "Rental income",
  "Zinsen / Dividenden": "Interest / dividends",
  "Sonstige Einkünfte": "Other income",
  Kindergeld: "Child benefit",
  "Gesamt Einkommen": "Total income",
  "Gesamt Einkommen Person 1 + Person 2": "Total income person 1 + person 2",
  "Jahresbrutto (gesamt), p. a.": "Gross annual income (total), p.a.",
  "Jahresbrutto Person 1 + Person 2, p. a.": "Gross annual income person 1 + person 2, p.a.",
  "Zu verst. Einkommen p. a.": "Taxable income p.a.",
  "Zu versteuerndes Einkommen p. a., gemeinsam (Zusammenveranlagung)": "Taxable income p.a., joint (joint assessment)",
  Wohnsituation: "Housing situation",
  "Fahrzeuge im Haushalt": "Vehicles in household",
  Kaltmiete: "Net cold rent",
  Wohnnebenkosten: "Utilities",
  Lebenshaltung: "Living costs",
  Unterhaltszahlungen: "Maintenance payments",
  "KFZ-Kosten": "Vehicle costs",
  "KFZ-Kosten (alle Fahrzeuge)": "Vehicle costs (all vehicles)",
  Versicherungsbeiträge: "Insurance premiums",
  "Private Krankenvers.": "Private health insurance",
  "Berufsunfähigkeitsvers.": "Occupational disability insurance",
  Riester: "Riester pension",
  "Sonstige Altersvorsorge": "Other retirement provision",
  "Weitere Versicherungen": "Other insurance",
  "Hypotheken (Zins/Tilg.)": "Mortgages (interest/repayment)",
  "Autokredite (Rate mtl.)": "Car loans (monthly instalment)",
  "Privatkredite (Rate mtl.)": "Personal loans (monthly instalment)",
  "Sonstige Kredite (Rate mtl.)": "Other loans (monthly instalment)",
  "Sonstige Ausgaben": "Other expenses",
  "davon wofür": "of which for",
  "Gesamt Ausgaben": "Total expenses",
  "Gesamt Ausgaben Person 1 + Person 2": "Total expenses person 1 + person 2",
  "Frei verfügbares Einkommen (gesamt)": "Disposable income (total)",
  "Keine Angaben": "No details",
  "Gesamt Vermögen": "Total assets",
  "Gesamt Vermögen Person 1": "Total assets person 1",
  "Gesamt Vermögen Person 2": "Total assets person 2",
  "Vermögenswerte Person 2": "Assets person 2",
  Eigentümer: "Owner",
  Art: "Type",
  Baujahr: "Year of construction",
  "Grundstück / Wohnfläche": "Plot / living space",
  Nutzung: "Use",
  Marktwert: "Market value",
  "Kaltmiete Ist": "Current net cold rent",
  "Kaltmiete zukünftig": "Future net cold rent",
  Vermietungsdetails: "Letting details",
  "Bank / Darlehensgeber": "Bank / lender",
  "Art / Bezeichnung": "Type / description",
  Ursprungskredit: "Original loan amount",
  Restschuld: "Remaining debt",
  "Rate monatlich": "Monthly instalment",
  Zinssatz: "Interest rate",
  "Zinsbindung bis": "Fixed interest until",
  Laufzeitende: "End of term",
  Verwendungszweck: "Purpose",
  // Kreditdetails seit 28.09.2026
  "Restschuld per": "Remaining debt as of",
  Kreditnehmer: "Borrower",
  "Zins fest oder variabel": "Fixed or variable interest",
  Sondertilgungsrecht: "Right to make special repayments",
  Fest: "Fixed",
  Variabel: "Variable",
  Unbekannt: "Unknown",
  "Beide gemeinsam": "Both jointly",
  "Immobilien schuldenfrei (Angabe des Antragstellers)": "Properties free of debt (applicant's statement)",
  "Person 1 und Person 2": "Person 1 and person 2",
  "Summe Marktwert Immobilien": "Total market value of real estate",
  "Alle Kredite sind oben den Immobilien zugeordnet": "All loans are assigned to the properties above",
  "Gesamt Restschuld": "Total remaining debt",
  "Gesamt Restschuld (alle Kredite inkl. Immobiliendarlehen)": "Total remaining debt (all loans incl. property loans)",
  "Keine Kredite vorhanden.": "No loans.",
  "Summe der Raten": "Total instalments",
  "Laufendes Mahnverfahren": "Pending dunning proceedings",
  "Schufa-Eintrag bekannt": "SCHUFA entry known",
  "Schufa-Score": "SCHUFA score",
  "Ergänzende Hinweise": "Additional remarks",
  // Tabellenköpfe
  Bank: "Bank",
  Ursprung: "Original",
  "Rate mtl.": "Monthly",
  Zins: "Interest",
  Zinsbindung: "Fixed until",
  "Laufzeit bis": "Term until",
  Zweck: "Purpose",
  // Unterschriften
  "Unterschrift Person 1": "Signature person 1",
  "Unterschrift Person 2": "Signature person 2",
  // Aufbau seit 19.10.2026: Kopf, Kennzahlen, nummerierte Abschnitte, Tabellen
  Antragsteller: "Applicants",
  "Antragsteller 1": "Applicant 1",
  "Antragsteller 2": "Applicant 2",
  Immobilien: "Real estate",
  "Einnahmen / Monat": "Income / month",
  "Ausgaben / Monat": "Expenses / month",
  "Frei verfügbar": "Disposable",
  Vermögen: "Assets",
  "Persönliche Daten · Kontakt · Beschäftigung": "Personal details · contact · employment",
  "Persönliche Daten": "Personal details",
  "Adresse und Kontakt": "Address and contact",
  Meldeadresse: "Registered address",
  Staatsangehörigkeit: "Nationality",
  "Bruttoeinkommen / Jahr": "Gross income / year",
  "Gehälter / Jahr": "Salaries / year",
  Bankverbindung: "Bank account",
  "Wünsche und Ziele": "Wishes and goals",
  Ziele: "Goals",
  "Haushalt und Unterhalt": "Household and maintenance",
  "Keine Kinder angegeben.": "No children stated.",
  "Im Haushalt": "In household",
  Einkommen: "Income",
  "Monatlich netto": "Monthly, net",
  Einkommensart: "Type of income",
  Haushalt: "Household",
  Betrag: "Amount",
  Gesamteinkommen: "Total income",
  "Gesamteinkommen / Monat": "Total income / month",
  "Jahresbrutto gesamt": "Gross annual income, total",
  Ausgaben: "Expenses",
  "Monatlich · Wohnen · Versicherungen · Kreditraten": "Monthly · housing · insurance · loan instalments",
  Ausgabe: "Expense",
  Gesamtausgaben: "Total expenses",
  "Gesamteinnahmen / Monat": "Total income / month",
  "Gesamtausgaben / Monat": "Total expenses / month",
  "Frei verfügbar / Monat": "Disposable / month",
  "Guthaben · Wertpapiere · Vorsorge": "Savings · securities · provision",
  Vermögenswert: "Asset",
  Institut: "Institution",
  Inhaber: "Holder",
  Gesamtvermögen: "Total assets",
  "Vermögen Antragsteller 1": "Assets applicant 1",
  "Vermögen Antragsteller 2": "Assets applicant 2",
  "Marktwert Immobilien": "Market value of real estate",
  "Keine Vermögenswerte angegeben.": "No assets stated.",
  "Bestehender Immobilienbesitz und Darlehen darauf": "Existing real estate and loans on it",
  "Kein Immobilienbesitz vorhanden.": "No real estate owned.",
  Wohnfläche: "Living space",
  Grundstück: "Plot",
  "Kaltmiete Ist / Monat": "Current net cold rent / month",
  "Kaltmiete künftig / Monat": "Future net cold rent / month",
  Darlehen: "Loan",
  "Rate / Monat": "Instalment / month",
  "Marktwert gesamt": "Total market value",
  "Restschuld darauf": "Remaining debt on it",
  Verbindlichkeiten: "Liabilities",
  "Kredite · Restschulden · Bürgschaften": "Loans · remaining debts · guarantees",
  Kredit: "Loan",
  Gesamtrestschuld: "Total remaining debt",
  "Gesamtrestschuld inkl. Immobiliendarlehen": "Total remaining debt incl. property loans",
  "Kreditraten / Monat": "Loan instalments / month",
  Bonität: "Creditworthiness",
  "Mahnverfahren · Schufa": "Dunning proceedings · SCHUFA",
  Erklärung: "Declaration",
  "Richtigkeit der Angaben": "Accuracy of the information",
  "Zu verst. Einkommen p. a., Antragsteller 1": "Taxable income p.a., applicant 1",
  "Zu verst. Einkommen p. a., Antragsteller 2": "Taxable income p.a., applicant 2",
};

/**
 * Die englische Beschriftung zu einer deutschen, auch für die Beschriftungen,
 * die das PDF zusammensetzt („Immobilie 2“, „Gehalt / Lohn (inkl. 13. Gehalt)“).
 * Ohne Treffer `null`, dann bleibt die Zeile einsprachig.
 */
export function saBeschriftungEn(de: string): string | null {
  const fest = SA_PDF_BESCHRIFTUNG_EN[de] ?? SA_WERTE_EN[de];
  if (fest) return fest;
  let m = /^Immobilie (\d+)$/.exec(de);
  if (m) return `Property ${m[1]}`;
  m = /^Kind (\d+)$/.exec(de);
  if (m) return `Child ${m[1]}`;
  m = /^Darlehen (\d+ )?zu Immobilie (\d+)$/.exec(de);
  if (m) return `Loan ${m[1] ?? ""}for property ${m[2]}`;
  m = /^Gehalt \/ Lohn(.*)$/.exec(de);
  if (m) {
    const zusatz = m[1]
      .replace(/inkl\./g, "incl.")
      .replace(/13\./g, "13th")
      .replace(/14\./g, "14th")
      .replace(/ Gehalt\)/g, " salary)");
    return `Salary / wages${zusatz}`;
  }
  m = /^Bürgschaft(: .*)?$/.exec(de);
  if (m) return `Guarantee${m[1] ?? ""}`;
  // Vermögensart mit Institut: „Lebensversicherung (Allianz)“.
  m = /^(.+?) \((.+)\)$/.exec(de);
  if (m && SA_WERTE_EN[m[1]]) return `${SA_WERTE_EN[m[1]]} (${m[2]})`;
  return null;
}

/** Optionen für das PDF. */
export interface SelbstauskunftPdfOptionen {
  /**
   * Die Sprache des Kunden. „en“ beschriftet das PDF zweisprachig, Deutsch
   * zuerst, und setzt die Erklärung mit Vorrangklausel in beide Sprachen.
   * Ohne Angabe bleibt es das bisherige deutsche Dokument.
   */
  sprache?: Sprache;
  /**
   * Zum Unterschreiben auf Papier: leere Unterschriftszeilen ohne den Vermerk
   * „Unterschrift ausstehend“. Nur die eigenständige Fassung ohne CRM.
   */
  papierUnterschrift?: boolean;
  /**
   * Hängt je Beschäftigungsart der Antragsteller die passende
   * Unterlagen-Checkliste als eigene Seite an (Artefakte, Christian, 29.10.2026).
   */
  unterlagenCheckliste?: boolean;
}

/** Die Unterlagen-Checklisten, Stand der Vorlagen vom 29.10.2026. */
export const UNTERLAGEN_CHECKLISTE: Record<"angestellt" | "selbstaendig", { titel: string; punkte: string[] }> = {
  angestellt: {
    titel: "Angestellte",
    punkte: [
      "Selbstauskunft vollständig ausgefüllt und unterschrieben",
      "Personalausweis oder Reisepass (Vorder- und Rückseite, gültig)",
      "Gehaltsabrechnungen der letzten 3 Monate",
      "Gehaltsabrechnung Dezember des Vorjahres bzw. Lohnsteuerbescheinigung",
      "Arbeitsvertrag (bei Probezeit oder Befristung zwingend)",
      "Kontoauszüge des Gehaltskontos der letzten 3 Monate",
      "Eigenkapitalnachweis (Name, Datum und Betrag erkennbar)",
      "Nachweise laufender Kredite mit aktuellem Saldo und Rate (falls vorhanden)",
      "Letzter Einkommensteuerbescheid (falls vorhanden)",
      "Bei Immobilienbesitz: Mietverträge und Darlehensstand je Objekt",
    ],
  },
  selbstaendig: {
    titel: "Selbstständige",
    punkte: [
      "Selbstauskunft vollständig ausgefüllt und unterschrieben",
      "Personalausweis oder Reisepass (Vorder- und Rückseite, gültig)",
      "Einkommensteuerbescheide der letzten 2 Jahre",
      "Einkommensteuererklärungen der letzten 2 Jahre",
      "Bilanzen bzw. Einnahmen-Überschuss-Rechnungen der letzten 2 Jahre",
      "Aktuelle BWA mit Summen- und Saldenliste",
      "Kontoauszüge privat und geschäftlich der letzten 3 Monate",
      "Eigenkapitalnachweis (Name, Datum und Betrag erkennbar)",
      "Nachweise laufender Kredite mit aktuellem Saldo und Rate (falls vorhanden)",
      "Bei Immobilienbesitz: Mietverträge und Darlehensstand je Objekt",
    ],
  },
};

/** Welche Checklisten zu den Antragstellern passen, ohne Doppelte. */
export function checklistenFuer(data: Pick<SelbstauskunftData, "beschaeftigungsart" | "person2" | "person2Data">): ("angestellt" | "selbstaendig")[] {
  const arten = [data.beschaeftigungsart, data.person2 ? data.person2Data?.beschaeftigungsart : undefined];
  return (["angestellt", "selbstaendig"] as const).filter((a) => arten.includes(a));
}

/**
 * Setzt eine Unterschrift ins PDF und meldet zurueck, ob das geklappt hat.
 *
 * Das Dokument entsteht ausdruecklich auch dann, wenn das Bild nicht eingesetzt
 * werden konnte. Ein Dokument mit leerer Unterschriftszeile ist brauchbarer als
 * gar keines. Damit daraus aber keine falsche Behauptung wird, darf der Hinweis
 * "Digital bestaetigt am ..." in diesem Fall NICHT gedruckt werden, siehe die
 * Aufrufstellen. Sonst traegt das Dokument eine Bestaetigung, fuer die es keinen
 * sichtbaren Beleg gibt.
 */
function unterschriftEinsetzen(
  doc: jsPDF,
  bild: string,
  x: number,
  y: number,
  breite: number,
  hoehe: number,
  wer: string,
): boolean {
  try {
    doc.addImage(bild, "PNG", x, y, breite, hoehe);
    return true;
  } catch (fehler) {
    console.error(`Unterschrift ${wer} konnte nicht in das PDF eingesetzt werden:`, fehler);
    return false;
  }
}

export async function generateSelbstauskunftPDF(
  rawData: SelbstauskunftData,
  kunde: { vorname: string; nachname: string; osImmoId: string },
  signatures?: { person1?: { signatureData?: string; signedAt?: string }; person2?: { signatureData?: string; signedAt?: string } },
  optionen: SelbstauskunftPdfOptionen = {},
): Promise<jsPDF> {
  /** Zweisprachig für englische Kunden (Entscheidung 7). */
  const zwei = optionen.sprache === "en";
  /** Ein gespeicherter Auswahlwert, bei Englisch mit Übersetzung: „Verheiratet / Married“. */
  const wert = (v: string | undefined | null): string => (zwei ? saWertZweisprachig(v ?? "", "en") : (v ?? ""));

  // ─── Defensive normalization: ältere/teilweise gespeicherte SA-Daten
  // können verschachtelte Objekte/Arrays fehlen lassen → sonst Crash.
  const ensureAnstellung = (o: any) => ({ firma: "", branche: "", angestelltSeit: "", berufsbezeichnung: "", probezeit: "", ...(o || {}) });
  const ensureSelbst = (o: any) => ({ firma: "", branche: "", selbstaendigSeit: "", anzahlMitarbeiter: "", ...(o || {}) });
  const ensureEinkommen = (o: any) => ({ netto: "", gewerbe: "", rente: "", miet: "", zinsen: "", sonstige: "", kindergeld: "", ...(o || {}) });
  const ensurePerson = (p: any) => p ? ({
    ...p,
    anstellung: ensureAnstellung(p.anstellung),
    selbstaendigkeit: ensureSelbst(p.selbstaendigkeit),
    einkommen: ensureEinkommen(p.einkommen),
  }) : p;
  const data: SelbstauskunftData = {
    ...(rawData || {}),
    anrede: (rawData as any)?.anrede || "",
    titel: (rawData as any)?.titel || "",
    vorname: (rawData as any)?.vorname || "",
    nachname: (rawData as any)?.nachname || "",
    geburtsname: (rawData as any)?.geburtsname || "",
    geburtsdatum: (rawData as any)?.geburtsdatum || "",
    staatsangehoerigkeit: (rawData as any)?.staatsangehoerigkeit || "",
    staatsangehoerigkeitAndere: (rawData as any)?.staatsangehoerigkeitAndere || "",
    familienstand: (rawData as any)?.familienstand || "",
    strasse: (rawData as any)?.strasse || "",
    hausnummer: (rawData as any)?.hausnummer || "",
    plz: (rawData as any)?.plz || "",
    ort: (rawData as any)?.ort || "",
    email: (rawData as any)?.email || "",
    telefon: (rawData as any)?.telefon || "",
    mobilfunk: (rawData as any)?.mobilfunk || "",
    mieteWarm: (rawData as any)?.mieteWarm || "",
    lebenshaltungskosten: (rawData as any)?.lebenshaltungskosten || "",
    sonstigeAusgaben: (rawData as any)?.sonstigeAusgaben || "",
    sonstigeAusgabenWofuer: (rawData as any)?.sonstigeAusgabenWofuer || "",
    anstellung: ensureAnstellung((rawData as any)?.anstellung) as any,
    selbstaendigkeit: ensureSelbst((rawData as any)?.selbstaendigkeit) as any,
    einkommen: ensureEinkommen((rawData as any)?.einkommen) as any,
    kinder: Array.isArray((rawData as any)?.kinder) ? (rawData as any).kinder : [],
    bankkonten: Array.isArray((rawData as any)?.bankkonten) ? (rawData as any).bankkonten : [],
    vermoegenswerte: Array.isArray((rawData as any)?.vermoegenswerte) ? (rawData as any).vermoegenswerte : [],
    buergschaften: Array.isArray((rawData as any)?.buergschaften) ? (rawData as any).buergschaften : [],
    kredite: Array.isArray((rawData as any)?.kredite) ? (rawData as any).kredite : [],
    person2: !!(rawData as any)?.person2,
    person2Data: ensurePerson((rawData as any)?.person2Data),
  } as SelbstauskunftData;
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const W = 210;
  const H = 297;
  const margin = 20;
  const contentW = W - 2 * margin;
  /*
   * Die Angaben stehen in zwei Spalten nebeneinander, je Zeile Bezeichnung
   * links grau und Wert rechtsbündig fett. Beträge beider Personen stehen in
   * Tabellen mit einer Spalte je Antragsteller und dem Haushalt.
   */
  const SPALTENLUFT = 8;
  const spaltenB = (contentW - SPALTENLUFT) / 2;
  const col1 = margin;
  const col2 = margin + spaltenB + SPALTENLUFT;
  /** Oberkante des Inhalts auf jeder Seite und Unterkante über der Fußzeile. */
  const OBEN = 22;
  const UNTEN = H - 24;
  /** Rot aus der Markenrichtlinie (--os-fehler), wenn das Geld nicht reicht. */
  const FEHLER: [number, number, number] = [162, 59, 50];

  const hasP2 = !!(data.person2 && data.person2Data?.vorname);
  const p2 = hasP2 ? data.person2Data : null;

  // Deckblatt. Bewusst ohne Dokumentnummer, die Selbstauskunft traegt keine.
  addCoverPage(doc, await loadIcon(), {
    kennung: zwei ? "Persönliche Angaben / Personal details" : "Persönliche Angaben",
    titel: "Selbstauskunft",
    untertitel: zwei
      ? "Einkommen, Ausgaben, Eigenkapital und bestehende Verpflichtungen als Grundlage für die Finanzierungsanfrage. Self-disclosure: income, expenses, equity and existing obligations as the basis for the financing request."
      : "Einkommen, Ausgaben, Eigenkapital und bestehende Verpflichtungen als Grundlage für die Finanzierungsanfrage.",
    empfaenger: [data.vorname, data.nachname].filter(Boolean).join(" ") || undefined,
  });
  doc.addPage();

  const jetzt = new Date();
  const heute = jetzt.toLocaleDateString("de-DE");
  const nameP1 = [data.vorname, data.nachname].filter(Boolean).join(" ");
  const nameP2 = p2 ? [p2.vorname, p2.nachname].filter(Boolean).join(" ") : "";

  let y = OBEN;
  const neueSeite = () => { doc.addPage(); y = OBEN; };
  const checkPage = (bedarf: number) => {
    if (y + bedarf > UNTEN) neueSeite();
  };

  /** Die englische Beschriftung, nur bei englischen Kunden und nur, wenn sie anders lautet. */
  const en = (de: string): string | null => {
    if (!zwei) return null;
    const e = saBeschriftungEn(de);
    return e && e.trim().toLowerCase() !== de.trim().toLowerCase() ? e : null;
  };
  /** Eine Beschriftung in einer Zeile, bei Englisch „Deutsch / English“. */
  const inEinerZeile = (de: string): string => {
    const e = en(de);
    return e ? `${de} / ${e}` : de;
  };

  /**
   * Gesperrter Text. jsPDF rechnet die Sperrung bei getTextWidth nicht mit,
   * deshalb wird die Breite hier selbst bestimmt, sonst laeuft rechtsbuendig
   * gesetzter Text ueber den Rand.
   */
  const gesperrtBreite = (text: string, sperrung: number) =>
    doc.getTextWidth(text) + Math.max(0, text.length - 1) * sperrung;
  const gesperrt = (text: string, x: number, yy: number, sperrung: number, ausrichtung: "links" | "rechts" | "mitte" = "links") => {
    const t = sanitizePdfText(text);
    const b = gesperrtBreite(t, sperrung);
    const xs = ausrichtung === "rechts" ? x - b : ausrichtung === "mitte" ? x - b / 2 : x;
    doc.text(t, xs, yy, { charSpace: sperrung });
  };

  /**
   * Umbrechen und ein einzelnes zu langes Wort (etwa eine Mailadresse ohne
   * Trennstelle) hart teilen, statt es ueber den Spaltenrand laufen zu lassen.
   * Rechnet mit der gerade gesetzten Schrift.
   */
  const umbrechen = (text: string, breite: number): string[] => {
    const zeilen = doc.splitTextToSize(sanitizePdfText(text), breite) as string[];
    return zeilen.flatMap((z) => {
      if (doc.getTextWidth(z) <= breite) return [z];
      const teile: string[] = [];
      let rest = z;
      while (rest.length > 0 && doc.getTextWidth(rest) > breite) {
        let schnitt = rest.length;
        while (schnitt > 1 && doc.getTextWidth(rest.slice(0, schnitt)) > breite) schnitt--;
        teile.push(rest.slice(0, schnitt));
        rest = rest.slice(schnitt);
      }
      if (rest) teile.push(rest);
      return teile;
    });
  };

  // DE format-safe number parser: "3.000,50" -> 3000.50, "3000" -> 3000
  const parseDE = (v: string | number | undefined): number => {
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    return parseFloat(String(v).replace(/\./g, "").replace(",", ".")) || 0;
  };

  const eurFmt = (v: string | number | undefined) => {
    const n = parseDE(v);
    return n > 0 ? `${n.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €` : "–";
  };
  /** Wie eurFmt, aber ein negativer Betrag bleibt mit Minus sichtbar. */
  const eurMitVorzeichen = (n: number) => (n < 0 ? `-${eurFmt(-n)}` : eurFmt(n));
  /** Das Formular speichert den Zinssatz mit Punkt, gedruckt wird er deutsch: „3,45 %“. */
  const zinsFmt = (v: string | undefined) => ((v || "").trim() ? `${v!.trim().replace(".", ",")} %` : "–");
  const jaNein = (v?: string) => (v === "ja" ? wert("Ja") : v === "nein" ? wert("Nein") : "–");

  // ─── Bausteine des Layouts ───

  type Feld = { label: string; wert: string };
  type Gemessen = { label: string[]; en: string[]; wert: string[]; hoehe: number };
  const ZEILE = 3.6;
  const EN_ZEILE = 3.1;

  /** Misst eine Zelle: Bezeichnung links (umbrochen), Wert rechtsbuendig fett. */
  const messen = (f: Feld, b: number): Gemessen => {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8);
    const wertZ = umbrechen(f.wert || "–", b * 0.6);
    const wertB = Math.max(...wertZ.map((z) => doc.getTextWidth(z)));
    const labelB = Math.max(b - wertB - 4, b * 0.36);
    doc.setFont(PDF_FONT, "normal");
    const labelZ = doc.splitTextToSize(sanitizePdfText(f.label), labelB) as string[];
    const e = en(f.label);
    doc.setFontSize(6.5);
    const enZ = e ? (doc.splitTextToSize(sanitizePdfText(e), labelB) as string[]) : [];
    const links = (labelZ.length - 1) * ZEILE + enZ.length * EN_ZEILE;
    const rechts = (wertZ.length - 1) * ZEILE;
    return { label: labelZ, en: enZ, wert: wertZ, hoehe: Math.max(links, rechts) };
  };

  const zeichneZelle = (m: Gemessen, x: number, b: number, top: number) => {
    const basis = top + 3.4;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    m.label.forEach((z, i) => doc.text(z, x, basis + i * ZEILE));
    if (m.en.length > 0) {
      doc.setFontSize(6.5);
      doc.setTextColor(...ZWEITSPRACHE_FARBE);
      const ab = basis + (m.label.length - 1) * ZEILE;
      m.en.forEach((z, i) => doc.text(z, x, ab + (i + 1) * EN_ZEILE));
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.primary);
    m.wert.forEach((z, i) => doc.text(z, x + b, basis + i * ZEILE, { align: "right" }));
  };

  /** Feine Trennlinie unter den Zellen einer Zeile und Fortschreiben von y. */
  const zeilenEnde = (hoehe: number, spalten: [number, number][]) => {
    const linie = y + 3.4 + hoehe + 3;
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    spalten.forEach(([x, b]) => doc.line(x, linie, x + b, linie));
    y = linie + 1.6;
  };

  /** Eine Rasterzeile mit einer oder zwei Zellen nebeneinander. */
  const rasterZeile = (links: Feld, rechts?: Feld) => {
    const ml = messen(links, spaltenB);
    const mr = rechts ? messen(rechts, spaltenB) : null;
    const hoehe = Math.max(ml.hoehe, mr?.hoehe ?? 0);
    checkPage(hoehe + 8);
    zeichneZelle(ml, col1, spaltenB, y);
    if (mr) zeichneZelle(mr, col2, spaltenB, y);
    zeilenEnde(hoehe, mr ? [[col1, spaltenB], [col2, spaltenB]] : [[col1, spaltenB]]);
  };

  /** Eine Angabe über die volle Breite, für lange Bezeichnungen oder Texte. */
  const zeileBreit = (label: string, w: string) => {
    const m = messen({ label, wert: w }, contentW);
    checkPage(m.hoehe + 8);
    zeichneZelle(m, col1, contentW, y);
    zeilenEnde(m.hoehe, [[col1, contentW]]);
  };

  /** Angaben paarweise von links nach rechts. */
  const paare = (felder: Feld[]) => {
    for (let i = 0; i < felder.length; i += 2) rasterZeile(felder[i], felder[i + 1]);
  };

  /**
   * Nummerierter Abschnitt: Ziffer in Akzentfarbe, Titel, kleiner gesperrter
   * Untertitel und eine Linie darunter. Haelt Kopf und Mindestinhalt auf
   * einer Seite zusammen.
   */
  const abschnitt = (nr: string, titel: string, unter: string, minInhalt = 30) => {
    const titelEn = en(titel);
    const unterEn = en(unter);
    checkPage(22 + (unterEn ? 3.2 : 0) + minInhalt);
    y += 6;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(17);
    doc.setTextColor(...BRAND.accent);
    doc.text(nr, col1, y + 6);
    const tx = col1 + 14;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(14);
    doc.setTextColor(...BRAND.primary);
    doc.text(titel, tx, y + 6);
    if (titelEn) {
      const b = doc.getTextWidth(titel);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(10);
      doc.setTextColor(...ZWEITSPRACHE_FARBE);
      doc.text(` / ${titelEn}`, tx + b, y + 6);
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(6);
    doc.setTextColor(...BRAND.muted);
    gesperrt(unter.toUpperCase(), tx, y + 11.5, 0.9);
    let linie = y + 16;
    if (unterEn) {
      doc.setFont(PDF_FONT, "normal");
      gesperrt(unterEn.toUpperCase(), tx, y + 14.7, 0.9);
      linie += 3.2;
    }
    doc.setDrawColor(...BRAND.accent);
    doc.setLineWidth(0.6);
    doc.line(col1, linie, col1 + contentW, linie);
    doc.setTextColor(0, 0, 0);
    y = linie + 5;
  };

  /** Kleine Unterueberschrift in Akzentfarbe, Versalien, gesperrt. */
  const unterTitel = (de: string, minInhalt = 14) => {
    checkPage(7 + minInhalt);
    y += 2.5;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(...BRAND.accent);
    gesperrt(inEinerZeile(de).toUpperCase(), col1, y, 0.8);
    doc.setTextColor(0, 0, 0);
    y += 1.5;
  };

  /** Ueberschrift eines Blocks (Antragsteller, Immobilie) in Textfarbe. */
  const blockTitel = (text: string, minInhalt = 16) => {
    checkPage(9 + minInhalt);
    y += 4;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    textInBreite(doc, text, col1, y + 1, contentW, 11, 8.5);
    doc.setTextColor(0, 0, 0);
    y += 4.5;
  };

  /** Ein leerer Bereich in einer kurzen Zeile. */
  const hinweis = (de: string) => {
    checkPage(8);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    const zeilen = doc.splitTextToSize(sanitizePdfText(inEinerZeile(de)), contentW) as string[];
    doc.text(zeilen, col1, y + 3);
    doc.setTextColor(0, 0, 0);
    y += 3 + zeilen.length * 3.4 + 2;
  };

  /**
   * Kasten mit Kennzahlen oder Summen in gleich breiten Kacheln: heller
   * Grund, Akzentlinie links, Bezeichnung in gesperrten Versalien, Betrag
   * gross darunter. Der Kasten wird nie ueber zwei Seiten geteilt.
   */
  type Kachel = { label: string; wert: string; farbe?: [number, number, number] };
  const kasten = (kacheln: Kachel[]) => {
    const innenX = margin + 4;
    const kb = (contentW - 6) / kacheln.length;
    const textB = kb - 3;
    const sperrung = 0.6;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(5.8);
    /** Passt der gesperrte Text in eine Zeile, bleibt er einzeilig; sonst wird umbrochen. */
    const labelB = kb - 6;
    const zeilenFuer = (text: string, sp: number): string[] => {
      const zeilen: string[] = [];
      for (const wort of sanitizePdfText(text).split(" ")) {
        const letzte = zeilen[zeilen.length - 1];
        if (letzte !== undefined && gesperrtBreite(`${letzte} ${wort}`, sp) <= labelB) zeilen[zeilen.length - 1] = `${letzte} ${wort}`;
        else zeilen.push(wort);
      }
      return zeilen;
    };
    const gemessen = kacheln.map((k) => {
      const zeilen = zeilenFuer(k.label.toUpperCase(), sperrung);
      const e = en(k.label);
      const enZ = e ? zeilenFuer(e.toUpperCase(), 0.3) : [];
      return { zeilen, enZ };
    });
    const labelH = Math.max(...gemessen.map((g) => (g.zeilen.length - 1) * 2.8 + g.enZ.length * 2.6));
    const hoehe = 16 + labelH;
    checkPage(hoehe + 6);
    y += 2;
    doc.setFillColor(...BRAND.light);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.2);
    // Nichts ist eckig (Markenrichtlinie): runde Ecken wie die Karten im CRM,
    // die Akzentlinie als abgerundeter Strich innerhalb des Kastens.
    doc.roundedRect(margin, y, contentW, hoehe, 3.5, 3.5, "FD");
    doc.setFillColor(...BRAND.accent);
    doc.roundedRect(margin + 2.2, y + 3, 1.2, hoehe - 6, 0.6, 0.6, "F");
    kacheln.forEach((k, i) => {
      const mitte = innenX + i * kb + kb / 2;
      const g = gemessen[i];
      let ty = y + 6;
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(5.8);
      doc.setTextColor(...BRAND.accent);
      g.zeilen.forEach((z) => { gesperrt(z, mitte, ty, sperrung, "mitte"); ty += 2.8; });
      if (g.enZ.length > 0) {
        doc.setFont(PDF_FONT, "normal");
        doc.setFontSize(5.3);
        doc.setTextColor(...ZWEITSPRACHE_FARBE);
        g.enZ.forEach((z) => { gesperrt(z, mitte, ty - 0.2, 0.3, "mitte"); ty += 2.6; });
      }
      // Ein langer Betrag wird kleiner gesetzt, nie abgeschnitten.
      doc.setFont(PDF_FONT, "bold");
      let groesse = 13;
      doc.setFontSize(groesse);
      while (doc.getTextWidth(k.wert) > textB - 2 && groesse > 7) {
        groesse -= 0.5;
        doc.setFontSize(groesse);
      }
      doc.setTextColor(...(k.farbe ?? BRAND.primary));
      doc.text(k.wert, mitte, y + 12.5 + labelH, { align: "center" });
    });
    doc.setTextColor(0, 0, 0);
    y += hoehe + 6;
  };

  /**
   * Tabelle wie im Vorbild: gesperrter Kopf, Linie darunter, je Zeile eine
   * feine Trennlinie, die erste Spalte fett. Eine Summenzeile steht fett
   * unter einer kraeftigen Linie. Unter einer Zeile kann eine graue
   * Zusatzzeile stehen (Kreditdetails, Verwendungszweck). Zellen werden
   * umbrochen, nie abgeschnitten.
   */
  type Spalte = { titel: string; breite: number; rechts?: boolean };
  type TabZeile = { zellen: string[]; summe?: boolean; unter?: string };
  const tabelle = (spalten: Spalte[], zeilen: TabZeile[]) => {
    const mitEn = spalten.some((s) => !!en(s.titel));
    const kopfH = mitEn ? 8.5 : 6;
    const kopf = () => {
      let x = col1;
      spalten.forEach((s) => {
        const tx = s.rechts ? x + s.breite - 1 : x;
        const ausr = s.rechts ? "rechts" : "links";
        doc.setFont(PDF_FONT, "bold");
        doc.setFontSize(5.8);
        doc.setTextColor(...BRAND.muted);
        gesperrt(s.titel.toUpperCase(), tx, y + 3, 0.5, ausr);
        const e = en(s.titel);
        if (e) {
          doc.setFont(PDF_FONT, "normal");
          doc.setFontSize(5.3);
          doc.setTextColor(...ZWEITSPRACHE_FARBE);
          gesperrt(e.toUpperCase(), tx, y + 6, 0.3, ausr);
        }
        x += s.breite;
      });
      y += kopfH;
      doc.setDrawColor(...BRAND.primary);
      doc.setLineWidth(0.35);
      doc.line(col1, y, col1 + contentW, y);
    };
    checkPage(kopfH + Math.min(zeilen.length, 2) * 7 + 2);
    kopf();
    zeilen.forEach((z) => {
      doc.setFontSize(7.5);
      const zellZeilen = z.zellen.map((c, i) => {
        doc.setFont(PDF_FONT, i === 0 || z.summe ? "bold" : "normal");
        // In der Summenzeile bleiben Spalten ohne Summe leer statt „–“.
        return umbrechen(z.summe ? c : c || "–", spalten[i].breite - 2.5);
      });
      const n = Math.max(...zellZeilen.map((l) => l.length));
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(6.5);
      const unterZ = z.unter ? (doc.splitTextToSize(sanitizePdfText(z.unter), contentW - 3) as string[]) : [];
      const h = 3 + n * 3.4 + unterZ.length * 3 + 1.8;
      if (y + h > UNTEN) { neueSeite(); kopf(); }
      if (z.summe) {
        doc.setDrawColor(...BRAND.primary);
        doc.setLineWidth(0.35);
        doc.line(col1, y, col1 + contentW, y);
      }
      let x = col1;
      zellZeilen.forEach((l, i) => {
        const s = spalten[i];
        doc.setFont(PDF_FONT, i === 0 || z.summe ? "bold" : "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...BRAND.primary);
        l.forEach((zeile, j) => {
          if (s.rechts) doc.text(zeile, x + s.breite - 1, y + 4.6 + j * 3.4, { align: "right" });
          else doc.text(zeile, x, y + 4.6 + j * 3.4);
        });
        x += s.breite;
      });
      if (unterZ.length > 0) {
        doc.setFont(PDF_FONT, "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(...BRAND.muted);
        unterZ.forEach((zeile, i) => doc.text(zeile, col1 + 1.5, y + 4.4 + n * 3.4 + i * 3));
      }
      y += h;
      if (!z.summe) {
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.15);
        doc.line(col1, y, col1 + contentW, y);
      }
    });
    doc.setTextColor(0, 0, 0);
    y += 3;
  };

  // ─── Zahlen vorab: die Kennzahlenleiste oben braucht die Summen ───
  // Die Rechenregeln sind dieselben wie bisher, nur die Darstellung ist neu.

  const gehaltExtra = (d: any) => {
    const parts: string[] = [];
    if (d?.gehalt13) parts.push("13.");
    if (d?.gehalt14) parts.push("14.");
    return parts.length ? `inkl. ${parts.join(" + ")} Gehalt` : "";
  };
  const extra1 = gehaltExtra(data);
  const extra2 = hasP2 ? gehaltExtra(p2) : "";
  // Gilt der Zusatz nur für eine Person, sagt die Beschriftung, für welche.
  const gehaltZusatz = !extra1 && !extra2 ? ""
    : !hasP2 || extra1 === extra2 ? ` (${extra1 || extra2})`
    : ` (${[extra1 && `AS 1 ${extra1}`, extra2 && `AS 2 ${extra2}`].filter(Boolean).join(", ")})`;
  const incomeFields: [string, string, string?][] = [
    [`Gehalt / Lohn${gehaltZusatz}`, data.einkommen.netto, p2?.einkommen?.netto],
    ["Selbst. Tätigkeit", data.einkommen.gewerbe, p2?.einkommen?.gewerbe],
    ["Rente / Pension", data.einkommen.rente, p2?.einkommen?.rente],
    ["Mieteinnahmen", data.einkommen.miet, p2?.einkommen?.miet],
    ["Zinsen / Dividenden", data.einkommen.zinsen, p2?.einkommen?.zinsen],
    ["Sonstige Einkünfte", data.einkommen.sonstige, p2?.einkommen?.sonstige],
    ["Kindergeld", data.einkommen.kindergeld, undefined],
  ];
  const sumInc1 = incomeFields.reduce((s, [, v]) => s + parseDE(v), 0);
  const sumInc2 = hasP2 ? incomeFields.reduce((s, [, , v]) => s + parseDE(v), 0) : 0;

  /*
   * Die Zuordnung kommt aus finanzierbarkeitUtils und wird hier nicht
   * nachgebaut, damit PDF und Kundenakte dieselben Zahlen zeigen.
   */
  const rateByType = (kredite: { art?: string; rate?: string; kategorie?: string }[] = []) => {
    const r = { hypo: 0, auto: 0, priv: 0, sonst: 0 };
    const nach: Record<string, keyof typeof r> = {
      hypothek: "hypo", auto: "auto", privat: "priv", sonstige: "sonst",
    };
    kredite.forEach((k) => {
      r[nach[kreditArt(k.art, k.kategorie)]] += parseDE(k.rate);
    });
    return r;
  };
  const r1 = rateByType(data.kredite);
  const r2 = p2 ? rateByType(p2.kredite) : { hypo: 0, auto: 0, priv: 0, sonst: 0 };

  const ausgabenFields: [string, number, number?][] = [
    // Seit der Umstellung auf Kaltmiete plus Wohnnebenkosten ist die Summe
    // nicht mehr doppelt. In Altbestaenden kann im Feld noch eine Warmmiete
    // stehen, das sieht der Berater beim Durchsprechen.
    ["Kaltmiete", parseDE(data.mieteWarm), p2 ? parseDE(p2.mieteWarm) : undefined],
    ["Wohnnebenkosten", parseDE((data as any).nebenkosten), p2 ? parseDE((p2 as any).nebenkosten) : undefined],
    ["Lebenshaltung", parseDE(data.lebenshaltungskosten), p2 ? parseDE(p2.lebenshaltungskosten) : undefined],
    ["Unterhaltszahlungen", parseDE((data as any).unterhalt), p2 ? parseDE((p2 as any).unterhalt) : undefined],
    [
      // Bei mehreren Fahrzeugen ist die Summe gemeint, so steht es auch im
      // Formular. Die Anzahl selbst steht als eigene Angabe darueber.
      (parseInt(String((data as any).kfzAnzahl || "0"), 10) || 0) > 1
        ? "KFZ-Kosten (alle Fahrzeuge)"
        : "KFZ-Kosten",
      parseDE((data as any).kfzKosten),
      p2 ? parseDE((p2 as any).kfzKosten) : undefined,
    ],
    /*
     * Das Sammelfeld nur dann, wenn die Aufschluesselung darunter leer ist.
     * Sonst stand dasselbe Geld zweimal im Dokument. Dieselbe Regel steht in
     * versicherungenGesamt.
     */
    [
      "Versicherungsbeiträge",
      versicherungenGesamt(data) === parseDE((data as any).versicherungsbeitraege)
        ? parseDE((data as any).versicherungsbeitraege) : 0,
      p2
        ? (versicherungenGesamt(p2) === parseDE((p2 as any).versicherungsbeitraege)
            ? parseDE((p2 as any).versicherungsbeitraege) : 0)
        : undefined,
    ],
    ["Private Krankenvers.", parseDE(data.privateKV), p2 ? parseDE(p2.privateKV) : undefined],
    ["Berufsunfähigkeitsvers.", parseDE((data as any).versBU), p2 ? parseDE((p2 as any).versBU) : undefined],
    ["Riester", parseDE((data as any).versRiester), p2 ? parseDE((p2 as any).versRiester) : undefined],
    ["Sonstige Altersvorsorge", parseDE((data as any).versAV), p2 ? parseDE((p2 as any).versAV) : undefined],
    ["Weitere Versicherungen", parseDE((data as any).versWeitere), p2 ? parseDE((p2 as any).versWeitere) : undefined],
    // Hier stehen monatliche Raten, unter Verbindlichkeiten die Restschulden.
    ["Hypotheken (Zins/Tilg.)", r1.hypo, p2 ? r2.hypo : undefined],
    ["Autokredite (Rate mtl.)", r1.auto, p2 ? r2.auto : undefined],
    ["Privatkredite (Rate mtl.)", r1.priv, p2 ? r2.priv : undefined],
    ["Sonstige Kredite (Rate mtl.)", r1.sonst, p2 ? r2.sonst : undefined],
    ["Sonstige Ausgaben", parseDE(data.sonstigeAusgaben), p2 ? parseDE(p2.sonstigeAusgaben) : undefined],
  ];
  const sumA1 = ausgabenFields.reduce((s, [, v]) => s + (v as number), 0);
  const sumA2 = hasP2 ? ausgabenFields.reduce((s, [, , v]) => s + ((v as number) || 0), 0) : 0;
  const einnahmenGesamt = sumInc1 + sumInc2;
  const ausgabenGesamt = sumA1 + sumA2;
  const frei = einnahmenGesamt - ausgabenGesamt;

  const vw1 = data.vermoegenswerte || [];
  const vw2 = (p2?.vermoegenswerte) || [];
  const sumVw1 = vw1.reduce((s, v) => s + parseDE(v.betrag), 0);
  const sumVw2 = vw2.reduce((s, v) => s + parseDE(v.betrag), 0);

  // Immobilien und Kredite beider Personen. Ein Kredit kann einer Immobilie
  // zugeordnet sein, auch einer der anderen Person ("p2:0").
  const immo: NonNullable<SelbstauskunftData["immobilien"]> =
    ((data as any).immobilien || []).concat(hasP2 ? (((p2 as any)?.immobilien) || []) : []);
  type PdfKredit = SelbstauskunftData["kredite"][number] & { person?: string };
  const allKredite: PdfKredit[] = [
    ...data.kredite.map((k) => ({ ...(k as any), person: hasP2 ? "AS 1" : "" })),
    ...(p2 ? p2.kredite.map((k) => ({ ...(k as any), person: "AS 2" })) : []),
  ];
  const anzahlImmoP1 = ((data as any).immobilien || []).length;
  const anzahlImmoP2 = immo.length - anzahlImmoP1;
  // Nur an eine Immobilie, die es (noch) gibt; ein verwaister Verweis faellt
  // in die Kredittabelle.
  const immobilieVon = (k: PdfKredit): number => immobilienPosition(k.immobilie, anzahlImmoP1, anzahlImmoP2);
  const sumRest = allKredite.reduce((s, k) => s + parseDE(k.restschuld), 0);
  // Dieselben Raten, die unter den Ausgaben stehen.
  const sumRaten = [r1, r2].reduce((s, r) => s + r.hypo + r.auto + r.priv + r.sonst, 0);

  // ═══════ Kopf der ersten Inhaltsseite ═══════
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(6.3);
  doc.setTextColor(...BRAND.accent);
  gesperrt(zwei ? "OS REAL ESTATE · VERTRAULICH · CONFIDENTIAL" : "OS REAL ESTATE · VERTRAULICH", col1, y, 0.9);
  doc.setFontSize(24);
  doc.setTextColor(...BRAND.primary);
  doc.text("Selbstauskunft", col1, y + 11);
  if (zwei) {
    const b = doc.getTextWidth("Selbstauskunft");
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(13);
    doc.setTextColor(...ZWEITSPRACHE_FARBE);
    doc.text(" / Self-disclosure", col1 + b, y + 11);
  }
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const kopfTeile = [
    [nameP1, nameP2].filter(Boolean).join(" und "),
    `${hasP2 ? 2 : 1} Antragsteller`,
    data.kinder.length > 0 ? `${data.kinder.length} ${data.kinder.length === 1 ? "Kind" : "Kinder"}` : "",
    `Stand: ${jetzt.toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" })}`,
  ].filter(Boolean);
  textInBreite(doc, kopfTeile.join(" · "), col1, y + 17.5, contentW, 8, 6.5);
  y += 20;

  // Kennzahlenleiste
  kasten([
    { label: "Einnahmen / Monat", wert: eurFmt(einnahmenGesamt) },
    { label: "Ausgaben / Monat", wert: eurFmt(ausgabenGesamt) },
    { label: "Frei verfügbar", wert: eurMitVorzeichen(frei), farbe: frei >= 0 ? BRAND.accent : FEHLER },
    { label: "Vermögen", wert: eurFmt(sumVw1 + sumVw2) },
    { label: "Restschuld", wert: eurFmt(sumRest) },
  ]);

  // ═══════ 01 Antragsteller ═══════
  abschnitt("01", "Antragsteller", "Persönliche Daten · Kontakt · Beschäftigung", 40);

  /** Gilt die Bedingung fuer eine der beiden Personen? Dann steht die Zeile bei beiden. */
  const irgendwer = (f: (p: any) => unknown) => !!f(data) || (!!p2 && !!f(p2));
  const staatsangeh = (p: any) => (p.staatsangehoerigkeit === "deutsch" ? wert("Deutsch") : p.staatsangehoerigkeitAndere);
  const avDe = (v?: string) => v === "unbefristet" ? "Unbefristet" : v === "probezeit" ? "In Probezeit" : v === "befristet" ? "Befristet" : "–";
  const av = (v?: string) => (zwei && v && SA_WERTE_EN[v] ? `${avDe(v)} / ${SA_WERTE_EN[v]}` : avDe(v));

  const personBlock = (nr: 1 | 2, p: any) => {
    // Anrede, Titel, Vor- und Nachname stehen in der Ueberschrift des Blocks.
    const name = [p.anrede, p.titel, p.vorname, p.nachname].filter(Boolean).join(" ");
    blockTitel(`${inEinerZeile(`Antragsteller ${nr}`)}${name ? ` · ${name}` : ""}`, 24);

    unterTitel("Persönliche Daten");
    const persoenlich: Feld[] = [
      { label: "Geburtsdatum", wert: p.geburtsdatum },
      { label: "Staatsangehörigkeit", wert: staatsangeh(p) },
      ...(irgendwer((q) => q.geburtsname) ? [{ label: "Geburtsname", wert: p.geburtsname }] : []),
      // Gespeichert ist der deutsche Wert („Verheiratet“); bei Englisch steht die Übersetzung daneben.
      { label: "Familienstand", wert: wert(p.familienstand) },
      { label: "Wohnhaft seit", wert: wert(p.wohnhaftSeit) || "–" },
      { label: "Steuer-ID", wert: p.steuerId || "–" },
      // Die Bank fragt beides ab, ein fehlender Wert ist eine Aussage.
      { label: "Steuerklasse", wert: p.steuerklasse || "–" },
      { label: "Kirchensteuer", wert: jaNein(p.kirchensteuer) },
    ];
    // Der Güterstand gilt für den Haushalt und ist bei Person 1 erfasst.
    if (nr === 1 && p.gueterstand) {
      const gsMap: Record<string, string> = { gesetzlich: "Zugewinngemeinschaft", guetertrennung: "Gütertrennung", guetergemeinschaft: "Gütergemeinschaft" };
      persoenlich.push({ label: "Güterstand", wert: wert(gsMap[p.gueterstand] || p.gueterstand) });
    }
    paare(persoenlich);

    unterTitel("Adresse und Kontakt");
    const strasse = `${p.strasse || ""} ${p.hausnummer || ""}`.trim();
    const ort = `${p.plz || ""} ${p.ort || ""}`.trim();
    paare([
      { label: "Meldeadresse", wert: [strasse, ort].filter(Boolean).join(", ") },
      { label: "E-Mail", wert: p.email },
      { label: "Telefon", wert: p.telefon },
      ...(irgendwer((q) => q.mobilfunk) ? [{ label: "Mobil", wert: p.mobilfunk }] : []),
    ]);

    unterTitel("Beschäftigung");
    const beruf: Feld[] = [
      { label: "Art der Tätigkeit", wert: wert(p.beschaeftigungsart) || "–" },
      { label: "Beruf", wert: p.anstellung?.berufsbezeichnung },
      { label: "Arbeitgeber", wert: p.anstellung?.firma },
      { label: "Branche", wert: p.anstellung?.branche },
      { label: "Angestellt seit", wert: p.anstellung?.angestelltSeit },
      { label: "Probezeit", wert: jaNein(p.anstellung?.probezeit) },
    ];
    if (irgendwer((q) => q.arbeitsvertragArt)) {
      beruf.push({ label: "Vertragsart", wert: av(p.arbeitsvertragArt) });
      if (irgendwer((q) => q.befristetBis)) beruf.push({ label: "Befristet bis", wert: p.befristetBis || "–" });
    }
    if (irgendwer((q) => q.bruttoJahr)) beruf.push({ label: "Bruttoeinkommen / Jahr", wert: eurFmt(p.bruttoJahr) });
    if (irgendwer((q) => q.monatsgehaelter)) beruf.push({ label: "Gehälter / Jahr", wert: p.monatsgehaelter || "12" });
    paare(beruf);

    if (irgendwer((q) => q.selbstaendigkeit?.firma)) {
      unterTitel("Selbständigkeit");
      paare([
        { label: "Firma", wert: p.selbstaendigkeit?.firma },
        { label: "Branche", wert: p.selbstaendigkeit?.branche },
        { label: "Seit", wert: p.selbstaendigkeit?.selbstaendigSeit },
        { label: "Mitarbeiter", wert: p.selbstaendigkeit?.anzahlMitarbeiter },
      ]);
    }

    // Je Konto links Kontoart und Bank, rechts die IBAN.
    const banken: { institut?: string; konto?: string; iban?: string }[] = Array.isArray(p.bankkonten) ? p.bankkonten : [];
    if (banken.length > 0) {
      unterTitel("Bankverbindung", 8);
      banken.forEach((bk) => rasterZeile(
        { label: wert(bk.konto) || "Konto", wert: bk.institut || "–" },
        { label: "IBAN", wert: bk.iban || "–" },
      ));
    }
  };
  personBlock(1, data);
  if (hasP2 && p2) personBlock(2, p2);

  if (Array.isArray((data as any).wuenscheZiele) && (data as any).wuenscheZiele.length > 0) {
    unterTitel("Wünsche und Ziele", 8);
    // Gespeichert sind Kennungen („vermoegen“), gedruckt wird die Beschriftung aus dem Formular.
    const zielText = (id: string) => ANLAGE_ZIELE.find((z) => z.id === id)?.label ?? id;
    zeileBreit("Ziele", (data as any).wuenscheZiele.map((z: string) => wert(zielText(z))).join(", "));
  }

  // ═══════ 02 Kinder ═══════
  abschnitt("02", "Kinder", "Haushalt und Unterhalt", 10);
  if (data.kinder.length === 0) {
    hinweis("Keine Kinder angegeben.");
  } else {
    // Fehlender Haushaltswert (Altbestand) zaehlt als "im Haushalt".
    data.kinder.forEach((k) => rasterZeile(
      { label: k.name || "Kind", wert: k.geburtsdatum || "–" },
      { label: "Im Haushalt", wert: k.imHaushalt === false ? wert("Nein") : wert("Ja") },
    ));
  }

  /** Spalten einer Betragstabelle: bei zwei Personen je Antragsteller und der Haushalt. */
  const betragSpalten = (erste: string): Spalte[] => hasP2
    ? [{ titel: erste, breite: 74 }, { titel: "Antragsteller 1", breite: 32, rechts: true }, { titel: "Antragsteller 2", breite: 32, rechts: true }, { titel: "Haushalt", breite: 32, rechts: true }]
    : [{ titel: erste, breite: 120 }, { titel: "Betrag", breite: 50, rechts: true }];
  const betragZellen = (label: string, v1: number, v2: number): string[] => hasP2
    ? [label, eurFmt(v1), eurFmt(v2), eurFmt(v1 + v2)]
    : [label, eurFmt(v1)];

  // ═══════ 03 Einkommen ═══════
  abschnitt("03", "Einkommen", "Monatlich netto", 30);
  tabelle(betragSpalten("Einkommensart"), [
    ...incomeFields
      .filter(([, v1, v2]) => parseDE(v1) > 0 || parseDE(v2) > 0)
      .map(([label, v1, v2]) => ({ zellen: betragZellen(label, parseDE(v1), parseDE(v2)) })),
    { zellen: betragZellen("Gesamteinkommen", sumInc1, sumInc2), summe: true },
  ]);

  /*
   * Das Jahresbrutto steht sichtbar neben der Monatssumme, es ist die
   * Grundlage der Steuerberechnung. Es geht nicht in die Monatssumme ein:
   * Ein Jahreswert in einer Monatssumme waere schlicht falsch. Je Person
   * steht es unter Beschäftigung.
   */
  const bruttoJahrGesamt = parseDE((data as any).bruttoJahr) + (hasP2 ? parseDE((p2 as any)?.bruttoJahr) : 0);
  kasten([
    { label: "Gesamteinkommen / Monat", wert: eurFmt(einnahmenGesamt) },
    ...(bruttoJahrGesamt > 0 ? [{ label: "Jahresbrutto gesamt", wert: eurFmt(bruttoJahrGesamt) }] : []),
  ]);

  /*
   * Das zu versteuernde Jahreseinkommen, freiwillig. Bei Ehe oder
   * eingetragener Lebenspartnerschaft das gemeinsame zvE, nur bei Person 1
   * erfasst. Keine Summe beider Personen: Zwei getrennte zvE werden
   * getrennt besteuert.
   */
  // Eine eingetragene 0 ist eine Angabe und wird gedruckt, nur leer fehlt.
  const zvEText = (v: unknown): string | null =>
    typeof v === "string" && /\d/.test(v)
      ? `${parseDE(v).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
      : null;
  const zvEP1 = zvEText((data as any).zvEJahr);
  if (hatGueterstand(data.familienstand)) {
    if (zvEP1) zeileBreit("Zu versteuerndes Einkommen p. a., gemeinsam (Zusammenveranlagung)", zvEP1);
  } else {
    const zvEP2 = hasP2 ? zvEText((p2 as any)?.zvEJahr) : null;
    if (hasP2 && (zvEP1 || zvEP2)) {
      rasterZeile(
        { label: "Zu verst. Einkommen p. a., Antragsteller 1", wert: zvEP1 ?? "–" },
        { label: "Zu verst. Einkommen p. a., Antragsteller 2", wert: zvEP2 ?? "–" },
      );
    } else if (zvEP1) {
      rasterZeile({ label: "Zu verst. Einkommen p. a.", wert: zvEP1 });
    }
  }

  // ═══════ 04 Ausgaben ═══════
  abschnitt("04", "Ausgaben", "Monatlich · Wohnen · Versicherungen · Kreditraten", 30);
  /** Ein Wert je Person in einer Zelle, „1 / –“; bei Gleichheit nur einmal. */
  const beide = (v1: string, v2?: string) => (hasP2 && (v2 || "–") !== (v1 || "–") ? `${v1 || "–"} / ${v2 || "–"}` : v1 || "–");
  {
    const kfz1 = String((data as any).kfzAnzahl || "").trim();
    const kfz2 = p2 ? String((p2 as any).kfzAnzahl || "").trim() : "";
    const wohnen: Feld = { label: "Wohnsituation", wert: beide(wert((data as any).mietart), p2 ? wert((p2 as any).mietart) : undefined) };
    // Die Anzahl der Fahrzeuge ist eine Angabe und kein Betrag.
    rasterZeile(wohnen, kfz1 || kfz2 ? { label: "Fahrzeuge im Haushalt", wert: beide(kfz1, kfz2) } : undefined);
  }
  {
    // Wofuer die sonstigen Ausgaben anfallen, grau unter ihrer Zeile.
    const wofuer1 = String((data as any).sonstigeAusgabenWofuer || "").trim();
    const wofuer2 = p2 ? String((p2 as any).sonstigeAusgabenWofuer || "").trim() : "";
    const wofuer = hasP2
      ? [wofuer1 && `AS 1: ${wofuer1}`, wofuer2 && `AS 2: ${wofuer2}`].filter(Boolean).join(" · ")
      : wofuer1;
    const zeilen: TabZeile[] = ausgabenFields
      .filter(([, v1, v2]) => v1 > 0 || (v2 || 0) > 0)
      .map(([label, v1, v2]) => ({
        zellen: betragZellen(label, v1, v2 || 0),
        unter: label === "Sonstige Ausgaben" && wofuer ? `${inEinerZeile("davon wofür")}: ${wofuer}` : undefined,
      }));
    // Steht nur ein Verwendungszweck ohne Betrag da, geht er nicht verloren.
    if (wofuer && !zeilen.some((z) => z.unter)) zeilen.push({ zellen: betragZellen("Sonstige Ausgaben", 0, 0), unter: `${inEinerZeile("davon wofür")}: ${wofuer}` });
    tabelle(betragSpalten("Ausgabe"), [...zeilen, { zellen: betragZellen("Gesamtausgaben", sumA1, sumA2), summe: true }]);
  }
  kasten([
    { label: "Gesamteinnahmen / Monat", wert: eurFmt(einnahmenGesamt) },
    { label: "Gesamtausgaben / Monat", wert: eurFmt(ausgabenGesamt) },
    { label: "Frei verfügbar / Monat", wert: eurMitVorzeichen(frei), farbe: frei >= 0 ? BRAND.accent : FEHLER },
  ]);

  // ═══════ 05 Vermögen ═══════
  abschnitt("05", "Vermögen", "Guthaben · Wertpapiere · Vorsorge", 24);
  const sumImmo = immo.reduce((s: number, im: any) => s + parseDE(im.marktwert), 0);
  if (vw1.length === 0 && vw2.length === 0) {
    hinweis("Keine Vermögenswerte angegeben.");
  } else {
    // Trägt das Institut denselben Namen wie die Art, steht es nicht doppelt da.
    const institut = (v: { art?: string; institut?: string }) => {
      const inst = (v.institut || "").trim();
      return inst && inst.toLowerCase() !== (v.art || "").toLowerCase() ? inst : "–";
    };
    const spalten: Spalte[] = hasP2
      ? [{ titel: "Vermögenswert", breite: 55 }, { titel: "Institut", breite: 55 }, { titel: "Inhaber", breite: 25 }, { titel: "Betrag", breite: 35, rechts: true }]
      : [{ titel: "Vermögenswert", breite: 70 }, { titel: "Institut", breite: 60 }, { titel: "Betrag", breite: 40, rechts: true }];
    const zeile = (v: (typeof vw1)[number], inhaber: string): TabZeile => ({
      zellen: hasP2
        ? [wert(v.art || "Sonstiges"), institut(v), inhaber, v.betrag ? eurFmt(v.betrag) : "–"]
        : [wert(v.art || "Sonstiges"), institut(v), v.betrag ? eurFmt(v.betrag) : "–"],
    });
    tabelle(spalten, [
      ...vw1.map((v) => zeile(v, "AS 1")),
      ...vw2.map((v) => zeile(v, "AS 2")),
      { zellen: hasP2 ? ["Gesamtvermögen", "", "", eurFmt(sumVw1 + sumVw2)] : ["Gesamtvermögen", "", eurFmt(sumVw1)], summe: true },
    ]);
  }
  kasten([
    ...(hasP2
      ? [{ label: "Vermögen Antragsteller 1", wert: eurFmt(sumVw1) }, { label: "Vermögen Antragsteller 2", wert: eurFmt(sumVw2) }]
      : []),
    { label: "Gesamtvermögen", wert: eurFmt(sumVw1 + sumVw2) },
    { label: "Marktwert Immobilien", wert: eurFmt(sumImmo) },
  ]);

  // ═══════ 06 Immobilien: je Immobilie ein Block samt Darlehen ═══════
  /** Deutscher Wert, bei Englisch mit der Übersetzung dahinter. */
  const wertZwei = (de: string): string => inEinerZeile(de);
  /**
   * Die Kreditangaben seit dem 28.09.2026 (Stichtag der Restschuld,
   * Kreditnehmer, Zinsart, Sondertilgung). Aeltere Kredite haben sie nicht.
   */
  const kreditZusatz = (k: PdfKredit): [string, string][] => ([
    ["Restschuld per", k.restschuldPer || ""],
    ["Kreditnehmer", hasP2 ? kreditAuswahlText("kreditnehmer", k.kreditnehmer) : ""],
    ["Zins fest oder variabel", kreditAuswahlText("zinsart", k.zinsart)],
    ["Sondertilgungsrecht", kreditAuswahlText("sondertilgung", k.sondertilgung)],
  ] as [string, string][]).filter(([, v]) => !!v);
  /** Datumsangaben und Beträge bleiben, wie sie sind; Auswahlwerte bekommen die Übersetzung. */
  const zusatzWert = (label: string, v: string) =>
    ["Restschuld per", "Zinsbindung bis", "Laufzeitende", "Ursprungskredit", "Verwendungszweck"].includes(label) ? v : wertZwei(v);
  const zusatzZeile = (paarListe: [string, string][]) =>
    paarListe.length > 0 ? paarListe.map(([label, v]) => `${wertZwei(label)}: ${zusatzWert(label, v)}`).join(" · ") : undefined;
  const kreditErsteSpalte = (k: PdfKredit): string => {
    const gewaehlt = kreditAuswahlLabel(k.kategorie);
    const bezeichnung = (k.art || "").trim();
    return gewaehlt && bezeichnung && gewaehlt !== bezeichnung
      ? `${gewaehlt} · ${bezeichnung}`
      : gewaehlt || bezeichnung || "Kredit";
  };

  abschnitt("06", "Immobilien", "Bestehender Immobilienbesitz und Darlehen darauf", immo.length > 0 ? 30 : 8);
  if (immo.length === 0) {
    hinweis("Kein Immobilienbesitz vorhanden.");
  } else {
    let restDarauf = 0;
    immo.forEach((im, i) => {
      const titel = [wert(im.art), im.adresse].filter(Boolean).join(", ");
      blockTitel(`${inEinerZeile(`Immobilie ${i + 1}`)}${titel ? ` · ${titel}` : ""}`, 20);
      const nutzungDe = im.nutzung === "eigen" ? "Eigennutzung" : im.nutzung === "fremd" ? "Fremdvermietet" : "–";
      paare([
        { label: "Eigentümer", wert: im.eigentuemer || "–" },
        { label: "Baujahr", wert: im.baujahr || "–" },
        { label: "Wohnfläche", wert: im.wohnflaecheM2 ? `${im.wohnflaecheM2} m²` : "–" },
        { label: "Grundstück", wert: im.grundstueckM2 ? `${im.grundstueckM2} m²` : "–" },
        { label: "Nutzung", wert: zwei && im.nutzung && SA_WERTE_EN[im.nutzung] ? `${nutzungDe} / ${SA_WERTE_EN[im.nutzung]}` : nutzungDe },
        { label: "Marktwert", wert: eurFmt(im.marktwert) },
        { label: "Kaltmiete Ist / Monat", wert: eurFmt(im.kaltmieteIst) },
        { label: "Kaltmiete künftig / Monat", wert: eurFmt(im.kaltmieteZukunft) },
      ]);
      const vd = String(im.vermietungsdetails || "").trim();
      if (vd) zeileBreit("Vermietungsdetails", vd);

      // Die Darlehen dieser Immobilie direkt darunter, damit die Zuordnung klar ist.
      const darlehen = allKredite.filter((k) => immobilieVon(k) === i);
      if (darlehen.length > 0) {
        restDarauf += darlehen.reduce((s, k) => s + parseDE(k.restschuld), 0);
        tabelle(
          [
            { titel: "Darlehen", breite: 62 },
            { titel: "Restschuld", breite: 27, rechts: true },
            { titel: "Rate / Monat", breite: 27, rechts: true },
            { titel: "Zins", breite: 20, rechts: true },
            { titel: "Zinsbindung", breite: 34, rechts: true },
          ],
          darlehen.map((k) => ({
            zellen: [
              [k.bank, kreditErsteSpalte(k)].filter(Boolean).join(" · "),
              eurFmt(k.restschuld),
              eurFmt(k.rate),
              zinsFmt(k.zinssatz),
              (k.zinsbindungBis || "").trim() || "–",
            ],
            // Zinsbindung und Laufzeitende sind zwei Angaben.
            unter: zusatzZeile([
              ...(parseDE(k.ursprung) > 0 ? [["Ursprungskredit", eurFmt(k.ursprung)] as [string, string]] : []),
              ...((k.laufzeitEnde || "").trim() ? [["Laufzeitende", k.laufzeitEnde] as [string, string]] : []),
              ...((k.zweck || "").trim() ? [["Verwendungszweck", k.zweck] as [string, string]] : []),
              ...kreditZusatz(k),
            ]),
          })),
        );
      }
    });
    const mieteIst = immo.reduce((s: number, im: any) => s + parseDE(im.kaltmieteIst), 0);
    kasten([
      { label: "Marktwert gesamt", wert: eurFmt(sumImmo) },
      { label: "Restschuld darauf", wert: eurFmt(restDarauf) },
      { label: "Kaltmiete Ist / Monat", wert: eurFmt(mieteIst) },
    ]);
  }

  // ═══════ 07 Verbindlichkeiten ═══════
  abschnitt("07", "Verbindlichkeiten", "Kredite · Restschulden · Bürgschaften", 20);
  /*
   * „Nein, schuldenfrei“ auf die Frage in Schritt Vermoegenswerte. Steht nur,
   * solange die Person tatsaechlich kein Immobiliendarlehen eingetragen hat.
   */
  {
    const ohneImmoKredit = (kr: PdfKredit[]) => !kr.some((k) => kreditArt(k.art, k.kategorie) === "hypothek");
    const p1Frei = (data as any).immobilienSchuldenfrei === true && ohneImmoKredit(data.kredite);
    const p2Frei = !!p2 && (p2 as any).immobilienSchuldenfrei === true && ohneImmoKredit(p2.kredite);
    if (p1Frei || p2Frei) {
      const wer = !hasP2 ? "Ja" : p1Frei && p2Frei ? "Person 1 und Person 2" : p1Frei ? "Person 1" : "Person 2";
      zeileBreit("Immobilien schuldenfrei (Angabe des Antragstellers)", wertZwei(wer));
    }
  }
  // Zugeordnete Immobiliendarlehen stehen bei ihrer Immobilie. Die
  // Gesamtrestschuld zaehlt trotzdem ALLE Kredite.
  const freieKredite = allKredite.filter((k) => immobilieVon(k) < 0);
  if (allKredite.length > 0) {
    if (freieKredite.length > 0) {
      tabelle(
        [
          { titel: "Kredit", breite: 50 },
          { titel: "Bank", breite: 30 },
          { titel: "Restschuld", breite: 26, rechts: true },
          { titel: "Rate / Monat", breite: 26, rechts: true },
          { titel: "Zins", breite: 14, rechts: true },
          { titel: "Laufzeit bis", breite: 24, rechts: true },
        ],
        freieKredite.map((k) => ({
          zellen: [
            `${k.person ? `${k.person} · ` : ""}${kreditErsteSpalte(k)}`,
            k.bank || "–",
            eurFmt(k.restschuld),
            eurFmt(k.rate),
            zinsFmt(k.zinssatz),
            k.laufzeitEnde || "–",
          ],
          unter: zusatzZeile([
            ...(parseDE(k.ursprung) > 0 ? [["Ursprungskredit", eurFmt(k.ursprung)] as [string, string]] : []),
            ...((k.zinsbindungBis || "").trim() ? [["Zinsbindung bis", k.zinsbindungBis!] as [string, string]] : []),
            ...kreditZusatz(k),
            ...((k.zweck || "").trim() ? [["Verwendungszweck", k.zweck] as [string, string]] : []),
          ]),
        })),
      );
    } else {
      hinweis("Alle Kredite sind oben den Immobilien zugeordnet");
    }
    kasten([
      { label: freieKredite.length < allKredite.length ? "Gesamtrestschuld inkl. Immobiliendarlehen" : "Gesamtrestschuld", wert: eurFmt(sumRest) },
      { label: "Kreditraten / Monat", wert: eurFmt(sumRaten) },
    ]);
  } else {
    hinweis("Keine Kredite vorhanden.");
  }
  // Buergschaften: verbuergt ist eine Gesamtsumme, keine Rate.
  {
    const buerg = [...(data.buergschaften || []), ...(p2?.buergschaften || [])].filter((b) => parseDE(b.betrag) > 0);
    paare(buerg.map((b) => ({ label: `Bürgschaft${b.art ? `: ${b.art}` : ""}`, wert: eurFmt(b.betrag) })));
  }

  // ═══════ 08 Bonität ═══════
  abschnitt("08", "Bonität", "Mahnverfahren · Schufa", 20);
  const bonitaet = (p: any): Feld[] => [
    { label: "Laufendes Mahnverfahren", wert: jaNein(p.mahnverfahren) },
    { label: "Schufa-Eintrag bekannt", wert: jaNein(p.schufaBekannt) },
    { label: "Schufa-Score", wert: p.schufaScore || "–" },
  ];
  if (hasP2 && p2) {
    unterTitel("Antragsteller 1");
    paare(bonitaet(data));
    unterTitel("Antragsteller 2");
    paare(bonitaet(p2));
  } else {
    paare(bonitaet(data));
  }
  if ((data.hinweise || "").trim()) {
    unterTitel("Ergänzende Hinweise", 8);
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.text);
    const hinweisZeilen = doc.splitTextToSize(data.hinweise.trim(), contentW) as string[];
    checkPage(hinweisZeilen.length * 4 + 4);
    doc.text(hinweisZeilen, col1, y + 3.5);
    doc.setTextColor(0, 0, 0);
    y += hinweisZeilen.length * 4 + 4;
  }

  // ═══════ 09 Erklärung und Unterschriften, als zusammenhängender Block ═══════
  // Der Wortlaut steht in `selbstauskunftSprache.ts`, damit Formular, PDF und
  // das ausfüllbare Formular dieselbe Erklärung tragen. Das Deutsche bleibt maßgeblich.
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  const lines1 = doc.splitTextToSize(SA_ERKLAERUNG.de, contentW) as string[];
  const lines2 = doc.splitTextToSize(SA_SCHUFA_KLAUSEL.de, contentW) as string[];
  let erklaerungHoehe = (lines1.length + lines2.length) * 3.5 + 6 + 50;
  if (zwei) {
    doc.setFontSize(7);
    for (const absatz of [SA_ERKLAERUNG.en, SA_SCHUFA_KLAUSEL.en]) {
      erklaerungHoehe += (doc.splitTextToSize(absatz, contentW) as string[]).length * 3.3 + 2.5;
    }
    for (const satz of [ZWEISPRACHIG_EINLEITUNG.de, ZWEISPRACHIG_EINLEITUNG.en]) {
      erklaerungHoehe += (doc.splitTextToSize(satz, contentW) as string[]).length * 3.3 + 1;
    }
    erklaerungHoehe += 12;
  }
  // Passt der ganze Block auf eine Seite, bleibt er zusammen.
  abschnitt("09", "Erklärung", "Richtigkeit der Angaben", Math.min(erklaerungHoehe, UNTEN - OBEN - 30));
  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.text);
  y += 1;
  checkPage(lines1.length * 3.5 + 5);
  doc.text(lines1, col1, y);
  y += lines1.length * 3.5 + 3;
  checkPage(lines2.length * 3.5 + (zwei ? 5 : 40));
  doc.text(lines2, col1, y);
  y += lines2.length * 3.5 + (zwei ? 3 : 8);

  /*
   * Bei Englisch die Übersetzung beider Absätze darunter, heller, und die
   * Vorrangklausel in beiden Sprachen (Plan Kundensprache, Entscheidung 6).
   */
  if (zwei) {
    doc.setFontSize(7);
    doc.setTextColor(...ZWEITSPRACHE_FARBE);
    for (const absatz of [SA_ERKLAERUNG.en, SA_SCHUFA_KLAUSEL.en]) {
      const zeilen = doc.splitTextToSize(absatz, contentW) as string[];
      checkPage(zeilen.length * 3.3 + 4);
      doc.text(zeilen, col1, y);
      y += zeilen.length * 3.3 + 2.5;
    }
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    for (const satz of [ZWEISPRACHIG_EINLEITUNG.de, ZWEISPRACHIG_EINLEITUNG.en]) {
      const zeilen = doc.splitTextToSize(satz, contentW) as string[];
      checkPage(zeilen.length * 3.3 + 3);
      doc.text(zeilen, col1, y);
      y += zeilen.length * 3.3 + 1;
    }
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(`Fassung der englischen Erklärung / Version of the English declaration: ${SA_RECHTSTEXT_FASSUNG_EN}`, col1, y + 1);
    y += 8;
  }
  doc.setTextColor(0, 0, 0);

  // Unterschriften
  checkPage(44);
  const sigLineY = y + 22;
  const sigWidth = 60;
  const sigHeight = 18;

  /** Unterschriftszeile; „Digital bestätigt am“ nur bei wirklich eingesetztem Bild. */
  const unterschrift = (x: number, name: string, nr: 1 | 2, sig?: { signatureData?: string; signedAt?: string }) => {
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.4);
    doc.line(x, sigLineY, x + spaltenB, sigLineY);
    doc.setFontSize(6.8);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.muted);
    const beschriftung = `Ort, Datum · Unterschrift Antragsteller ${nr}${name.trim() ? ` (${name.trim()})` : ""}`;
    textInBreite(doc, beschriftung, x, sigLineY + 4, spaltenB, 6.8, 5.5);
    if (zwei) {
      doc.setTextColor(...ZWEITSPRACHE_FARBE);
      textInBreite(doc, `Place, date · Signature applicant ${nr}`, x, sigLineY + 7, spaltenB, 6, 5);
    }

    const gesetzt = sig?.signatureData
      ? unterschriftEinsetzen(doc, sig.signatureData, x + 5, sigLineY - sigHeight, sigWidth, sigHeight, `Person ${nr}`)
      : false;

    doc.setFontSize(6.5);
    const statusY = sigLineY + (zwei ? 10.5 : 8);
    if (gesetzt) {
      doc.setTextColor(...BRAND.accent);
      const d = sig?.signedAt ? new Date(sig.signedAt) : new Date();
      doc.text((zwei ? "Digital bestätigt am / Digitally confirmed on " : "Digital bestätigt am ") + d.toLocaleDateString("de-DE"), x, statusY);
    } else if (sig?.signatureData) {
      // Unterschrift liegt vor, liess sich aber nicht darstellen. Keine
      // Bestaetigung drucken, sonst behauptet das Dokument etwas Unbelegtes.
      doc.setTextColor(180, 0, 0);
      doc.text("Unterschrift konnte nicht dargestellt werden", x, statusY);
    } else if (!optionen.papierUnterschrift) {
      doc.setTextColor(150, 150, 150);
      doc.text(zwei ? "Unterschrift ausstehend / Signature pending" : "Unterschrift ausstehend", x, statusY);
    }
    doc.setTextColor(0);
  };
  unterschrift(col1, `${data.vorname} ${data.nachname}`, 1, signatures?.person1);
  if (hasP2 && p2) unterschrift(col2, `${p2.vorname} ${p2.nachname}`, 2, signatures?.person2);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  doc.text(
    zwei
      ? "Ihre Angaben werden vertraulich behandelt und ausschließlich zur Prüfung der Finanzierung verwendet. / Your details are treated confidentially and used solely to assess the financing."
      : "Ihre Angaben werden vertraulich behandelt und ausschließlich zur Prüfung der Finanzierung verwendet.",
    col1, sigLineY + 20, { maxWidth: contentW },
  );
  doc.setTextColor(0, 0, 0);

  // ─── Unterlagen-Checkliste je Beschäftigungsart ───
  if (optionen.unterlagenCheckliste) {
    const ORANGE: [number, number, number] = [184, 76, 28];
    for (const art of checklistenFuer(data)) {
      const liste = UNTERLAGEN_CHECKLISTE[art];
      neueSeite();
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...BRAND.muted);
      gesperrt(`UNTERLAGEN · ${liste.titel.toUpperCase()}`, col1 + contentW, y, 0.8, "rechts");
      y += 12;
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(18);
      doc.setTextColor(...BRAND.primary);
      doc.text(`Unterlagen-Checkliste ${liste.titel}`, col1, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.text);
      doc.text("Diese Unterlagen brauchen wir zusätzlich zur Selbstauskunft für die Bonitäts- und Finanzierungsprüfung.", col1, y, { maxWidth: contentW });
      y += 7;
      // Hinweiskasten: nur PDF-Dateien
      const hinweis = umbrechen(
        "Keine Fotos, keine Screenshots, keine Word- oder Bilddateien. Vermögens- und Einkommensnachweise nur als Kontoauszug oder gleichwertiger Nachweis der Bank, auf dem Name des Kunden, Datum und Betrag klar erkennbar sind. Ansichten aus Wallet- oder Banking-Apps ohne Name und Datum werden nicht anerkannt.",
        contentW - 10,
      );
      const kastenH = 12 + hinweis.length * 4;
      doc.setFillColor(...ORANGE);
      doc.rect(col1, y, contentW, kastenH, "F");
      doc.setTextColor(...BRAND.white);
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(10);
      doc.text("WICHTIG: WIR AKZEPTIEREN AUSSCHLIESSLICH PDF-DATEIEN", col1 + 5, y + 7);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8);
      hinweis.forEach((z, i) => doc.text(z, col1 + 5, y + 12.5 + i * 4));
      y += kastenH + 8;
      // Tabelle
      doc.setFillColor(...BRAND.light);
      doc.rect(col1, y, contentW, 7, "F");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.text);
      doc.text("Unterlage", col1 + 3, y + 4.7);
      doc.text("liegt vor", col1 + contentW - 3, y + 4.7, { align: "right" });
      y += 7;
      liste.punkte.forEach((punkt, i) => {
        doc.setFontSize(9);
        doc.setTextColor(...ORANGE);
        doc.text(String(i + 1).padStart(2, "0"), col1 + 3, y + 6);
        doc.setTextColor(...BRAND.text);
        doc.text(punkt, col1 + 13, y + 6, { maxWidth: contentW - 28 });
        doc.setDrawColor(...BRAND.muted);
        doc.setLineWidth(0.3);
        doc.rect(col1 + contentW - 8, y + 2.2, 5, 5);
        y += 9;
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.2);
        doc.line(col1, y, col1 + contentW, y);
      });
      y += 7;
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.muted);
      doc.text("Je nach Bank können einzelne Unterlagen zusätzlich angefordert werden. Bitte alles gesammelt an Ihren Ansprechpartner senden.", col1, y, { maxWidth: contentW });
      y += 9;
      doc.text("Kunde (Name)", col1, y);
      doc.text("Vertriebspartner", col2, y);
      doc.setDrawColor(...BRAND.muted);
      doc.rect(col1, y + 1.5, spaltenB, 8);
      doc.rect(col2, y + 1.5, spaltenB, 8);
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.text);
      const namen = [nameP1, nameP2].filter(Boolean).join(", ");
      if (namen) doc.text(namen, col1 + 2.5, y + 6.8, { maxWidth: spaltenB - 5 });
      doc.setTextColor(0, 0, 0);
    }
  }

  // ─── Fußzeile auf allen Inhaltsseiten ───
  // Das Deckblatt bekommt keine Fusszeile und zaehlt nicht mit.
  const totalPages = doc.getNumberOfPages();
  const vertraulich = zwei ? "VERTRAULICH / CONFIDENTIAL" : "VERTRAULICH";
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(col1, H - 16, col1 + contentW, H - 16);
    const links = zwei ? "OS REAL ESTATE GMBH · SELBSTAUSKUNFT · SELF-DISCLOSURE" : "OS REAL ESTATE GMBH · SELBSTAUSKUNFT";
    const rechts = `${nameP1.toUpperCase()}${nameP1 ? " · " : ""}STAND ${heute} · ${vertraulich} · ${zwei ? "SEITE / PAGE" : "SEITE"} ${i - 1} / ${totalPages - 1}`;
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.muted);
    // Bei langen Namen erst die Sperrung, dann die Schrift verkleinern.
    let groesse = 5.5;
    let sperrung = 0.6;
    doc.setFontSize(groesse);
    while (gesperrtBreite(links, sperrung) + gesperrtBreite(rechts, sperrung) > contentW - 6 && (sperrung > 0 || groesse > 4.5)) {
      if (sperrung > 0) sperrung = Math.max(0, sperrung - 0.2);
      else { groesse -= 0.25; doc.setFontSize(groesse); }
    }
    gesperrt(links, col1, H - 11.5, sperrung);
    gesperrt(rechts, col1 + contentW, H - 11.5, sperrung, "rechts");
  }
  doc.setTextColor(0, 0, 0);

  return doc;
}
