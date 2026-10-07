import jsPDF from "jspdf";
import type { SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import { BRAND, loadLogo, loadIcon, addCoverPage, addBrandedHeader, addBrandedFooter, brandedSectionTitle, brandedRow, textInBreite, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";
import { kreditArt, kreditAuswahlLabel, versicherungenGesamt } from "@/lib/finanzierbarkeitUtils";
import { immobilienPosition, kreditAuswahlText } from "@/lib/kreditPflichtfelder";
import type { Sprache } from "./kundenSprache";
import { SA_ERKLAERUNG, SA_SCHUFA_KLAUSEL, SA_RECHTSTEXT_FASSUNG_EN, SA_WERTE_EN, saWertZweisprachig } from "./selbstauskunftSprache";
import { ZWEISPRACHIG_EINLEITUNG } from "./zweisprachig";
import { hatGueterstand } from "./familienstand";
import { ZWEITSPRACHE_FARBE, zweisprachigeZeile, zweisprachigerAbschnitt } from "./pdfZweisprachig";

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
  "Keine Kredite": "No loans",
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
  kunde: { vorname: string; nachname: string; moreId: string },
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
  const col1 = margin;
  const col2 = W / 2 + 5;
  let pageNum = 1;

  const hasP2 = !!(data.person2 && data.person2Data?.vorname);
  const p2 = hasP2 ? data.person2Data : null;

  // Ohne zweite Person gibt es nichts, wofür man die rechte Blatthälfte
  // freihalten müsste. Die Zeilen laufen dann über die gesamte Breite, mit
  // einer entsprechend breiteren Beschriftungsspalte. Steht eine zweite Person
  // daneben, bleibt es bei zwei Spalten: links Person 1, rechts Person 2.
  const labelOffset = hasP2 ? 48 : 62;
  const zeilenBreite = hasP2 ? labelOffset + 40 : contentW;

  const logo = await loadLogo();

  // Deckblatt. Bewusst ohne Dokumentnummer, die Selbstauskunft traegt keine.
  // Danach beginnt der Inhalt unveraendert auf der naechsten Seite.
  addCoverPage(doc, await loadIcon(), {
    kennung: zwei ? "Persönliche Angaben / Personal details" : "Persönliche Angaben",
    titel: "Selbstauskunft",
    untertitel: zwei
      ? "Einkommen, Ausgaben, Eigenkapital und bestehende Verpflichtungen als Grundlage für die Finanzierungsanfrage. Self-disclosure: income, expenses, equity and existing obligations as the basis for the financing request."
      : "Einkommen, Ausgaben, Eigenkapital und bestehende Verpflichtungen als Grundlage für die Finanzierungsanfrage.",
    empfaenger: [data.vorname, data.nachname].filter(Boolean).join(" ") || undefined,
  });
  doc.addPage();

  const erstelltAm = `Erstellt am: ${new Date().toLocaleDateString("de-DE")}`;

  /**
   * Kopfzeile jeder Inhaltsseite.
   *
   * Vorher gab es zwei verschiedene: Seite 2 bekam den Hauskopf mit Wortmarke
   * links und Dokumenttitel rechts, jede weitere Seite dagegen ein mittig
   * gesetztes Bildlogo. Im fertigen Dokument sah jede zweite Seite anders aus.
   * Es gibt jetzt nur noch diese eine.
   */
  const addPageHeader = (mitDatum = false): number =>
    addBrandedHeader(doc, logo, zwei ? "SELBSTAUSKUNFT · SELF-DISCLOSURE" : "SELBSTAUSKUNFT", mitDatum ? erstelltAm : undefined);

  let y = addPageHeader(true);

  const FOOTER_RESERVED = 34;

  const checkPage = (needed: number) => {
    if (y + needed > H - FOOTER_RESERVED) {
      doc.addPage();
      pageNum++;
      y = addPageHeader();
    }
  };

  // Abschnitt: hält Titel + Mindestinhalt zusammen — bricht ggf. komplett auf neue Seite um
  const section = (title: string, minContent: number = 28) => {
    if (y + 14 + minContent > H - FOOTER_RESERVED) {
      doc.addPage();
      pageNum++;
      y = addPageHeader();
    }
    y += 3;
    const titelEn = zwei ? saBeschriftungEn(title) : null;
    y = titelEn
      ? zweisprachigerAbschnitt(doc, title, titelEn, y, margin, contentW)
      : brandedSectionTitle(doc, title, y, margin, contentW);
  };

  // Die rechte Spalte endet am rechten Seitenrand. Vorher lief sie mit der
  // Standardbreite zwei Millimeter darueber hinaus.
  const rechteBreite = W - margin - col2;

  /**
   * Platzbedarf einer Zeile VOR dem Zeichnen ermitteln.
   *
   * checkPage(14) reichte fuer hoechstens drei Umbruchzeilen. Ein laengerer
   * Wert, etwa eine vollstaendig ausgeschriebene Bankbezeichnung oder eine
   * lange Mailadresse bei zwei Personen, lief darueber hinaus in die
   * Fusszeile und ueberdeckte sie.
   */
  const zeilenAnzahl = (wert: string | undefined, breite: number): number => {
    doc.setFontSize(8);
    const zeilen = doc.splitTextToSize(String(wert || "–"), breite) as string[];
    return Math.max(1, zeilen.length);
  };

  const row = (label: string, val1: string, val2?: string) => {
    const breite1 = hasP2 ? zeilenBreite - labelOffset : contentW;
    const n1 = zeilenAnzahl(val1, breite1);
    const n2 = hasP2 ? zeilenAnzahl(val2 || "–", rechteBreite - labelOffset) : 1;
    checkPage(6 + Math.max(n1, n2) * 3.6 + (zwei ? 2 : 0));
    const start = y;
    const en = zwei ? saBeschriftungEn(label) : null;
    const unten1 = zwei
      ? zweisprachigeZeile(doc, label, en, val1, col1, y, labelOffset, zeilenBreite, false, !hasP2)
      : brandedRow(doc, label, val1, col1, y, labelOffset, zeilenBreite, !hasP2);
    let unten2 = unten1;
    if (hasP2) {
      // Beide Spalten stehen auf derselben Grundlinie. Vorher setzte die
      // rechte Spalte um anderthalb Millimeter tiefer an und die Trennstriche
      // lagen ebenfalls versetzt, was das ganze Blatt schief wirken liess.
      unten2 = zwei
        ? zweisprachigeZeile(doc, label, en, val2 || "–", col2, start, labelOffset, rechteBreite)
        : brandedRow(doc, label, val2 || "–", col2, start, labelOffset, rechteBreite);
    }
    /*
     * Die tiefere der beiden Spalten bestimmt, wo es weitergeht.
     *
     * Bricht ein Wert um, wird seine Spalte hoeher. Wuerde weiter mit der
     * Hoehe von Person 1 gerechnet, liefe die naechste Zeile in den
     * umgebrochenen Wert von Person 2 hinein.
     */
    y = Math.max(unten1, unten2);
  };

  const rowSingle = (label: string, value: string) => {
    checkPage(zwei ? 9 : 6);
    y = zwei
      ? zweisprachigeZeile(doc, label, saBeschriftungEn(label), value, col1, y, labelOffset, hasP2 ? contentW : zeilenBreite, false, !hasP2)
      : brandedRow(doc, label, value, col1, y, labelOffset, hasP2 ? contentW : zeilenBreite, !hasP2);
  };

  /**
   * Breite Beschriftungsspalte für Aufzählungen mit frei getippten Namen
   * (Vermögenswerte, Kredite, Bürgschaften). Dort steht etwa
   * "Lebensversicherung (Allianz Lebensversicherung AG)", was in der schmalen
   * Spalte in den Betrag hineinlief.
   *
   * Diese Aufzählungen stehen auch bei zwei Personen untereinander, erst der
   * Block von Person 1, dann der von Person 2. Sie dürfen deshalb immer die
   * volle Breite nutzen.
   */
  const weiterOffset = 104;
  const rowWeit = (label: string, value: string) => {
    checkPage(zwei ? 9 : 6);
    y = zwei
      ? zweisprachigeZeile(doc, label, saBeschriftungEn(label), value, col1, y, weiterOffset, contentW, false, true)
      : brandedRow(doc, label, value, col1, y, weiterOffset, contentW, true);
  };

  /**
   * Zwischenüberschrift innerhalb eines Abschnitts.
   *
   * Reserviert Platz für die Überschrift und den ersten Inhalt darunter.
   * Ohne diese Reserve landete etwa "Bankverbindung(en)" als letzte Zeile
   * einer Seite und die Konten selbst allein auf der nächsten, die dann bis
   * unten leer blieb.
   */
  const unterTitel = (deutsch: string, minInhalt = 12, auchRechts = false) => {
    checkPage(6 + minInhalt);
    y += 2;
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.accent);
    const en = zwei ? saBeschriftungEn(deutsch) : null;
    const text = en && en !== deutsch ? `${deutsch} / ${en}` : deutsch;
    doc.text(text, col1, y);
    if (auchRechts && hasP2) doc.text(text, col2, y);
    doc.setTextColor(0, 0, 0);
    y += 5;
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
  /** Das Formular speichert den Zinssatz mit Punkt, gedruckt wird er deutsch: „3,45 %“. */
  const zinsFmt = (v: string | undefined) => ((v || "").trim() ? `${v!.trim().replace(".", ",")} %` : "–");

  /** Eine Beschriftung in einer Zeile, bei Englisch „Deutsch / English“. */
  const inEinerZeile = (deutsch: string): string => {
    const en = zwei ? saBeschriftungEn(deutsch) : null;
    return en && en !== deutsch ? `${deutsch} / ${en}` : deutsch;
  };

  const sumRow = (deutsch: string, sum1: number, sum2?: number, offset: number = labelOffset) => {
    const label = inEinerZeile(deutsch);
    checkPage(6);
    y += 1;
    doc.setDrawColor(...BRAND.accent);
    doc.setLineWidth(0.3);
    // Die Summenlinie laeuft so weit wie die Zeilen darueber. Rechts wird sie
    // nur gezogen, wenn dort auch eine zweite Summe steht, sonst blieb ein
    // blauer Strich ins Leere stehen.
    // Eine Summe, die sich nicht in zwei Spalten teilt, laeuft ueber die volle
    // Blattbreite und steht rechtsbuendig, genau wie die Zeilen darueber.
    // Vorher endete sie irgendwo in der Blattmitte, waehrend die Einzelbetraege
    // rechts standen.
    const linksBreite = hasP2 && sum2 !== undefined ? offset + 30 : contentW;
    doc.line(col1, y - 1, col1 + linksBreite, y - 1);
    if (hasP2 && sum2 !== undefined) doc.line(col2, y - 1, col2 + labelOffset + 30, y - 1);
    doc.setFontSize(8.5);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    if (hasP2 && sum2 !== undefined) {
      textInBreite(doc, label, col1, y + 2, offset - 2, 8.5, 6.5);
      doc.text(sum1 > 0 ? eurFmt(sum1) : "–", col1 + offset, y + 2);
    } else {
      textInBreite(doc, label, col1, y + 2, linksBreite - 45, 8.5, 6.5);
      doc.text(sum1 > 0 ? eurFmt(sum1) : "–", col1 + linksBreite, y + 2, { align: "right" });
    }
    if (hasP2 && sum2 !== undefined) {
      textInBreite(doc, label, col2, y + 2, labelOffset - 2, 8.5, 6.5);
      doc.text(sum2 > 0 ? eurFmt(sum2) : "–", col2 + labelOffset, y + 2);
    }
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  // Combined total across Person 1 + Person 2 on a single full-width line
  const combinedSumRow = (deutsch: string, total: number) => {
    if (!hasP2) return;
    const label = inEinerZeile(deutsch);
    checkPage(6);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.4);
    doc.line(col1, y - 1, col1 + contentW, y - 1);
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    // Die Gesamtsumme beider Personen gehoert an den rechten Blattrand, dort
    // enden auch alle Einzelbetraege.
    textInBreite(doc, label, col1, y + 2, contentW - 45, 9, 7);
    doc.text(total > 0 ? eurFmt(total) : "–", col1 + contentW, y + 2, { align: "right" });
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  // Neue Seite erzwingen
  const forcePage = () => { doc.addPage(); pageNum++; y = addPageHeader(); };

  // Grüne Highlight-Zeile
  const highlightRow = (deutsch: string, value: number) => {
    const label = inEinerZeile(deutsch);
    checkPage(9);
    y += 1;
    const positive = value >= 0;
    const bg: [number, number, number] = positive ? [232, 245, 233] : [253, 232, 232];
    const fg: [number, number, number] = positive ? [46, 125, 50] : [183, 28, 28];
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(col1, y - 3, contentW, 8, "F");
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(fg[0], fg[1], fg[2]);
    doc.text(label, col1 + 2, y + 2.5);
    doc.text(eurFmt(value), col1 + contentW - 2, y + 2.5, { align: "right" });
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += 9;
  };

  // Kleine Tabelle (Header + Zeilen), zebra.
  // subRows: optionale Zusatzzeile je Tabellenzeile (volle Breite, grau,
  // mehrzeilig umgebrochen). Bleibt sie leer, aendert sich nichts.
  const table = (headers: string[], rows: string[][], widths: number[], subRows?: (string | undefined)[]) => {
    const rowH = 6;
    const headerH = zwei ? 9.5 : 6.5;
    checkPage(headerH + Math.min(rows.length, 3) * rowH + 2);
    const drawHeader = () => {
      doc.setFillColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
      doc.rect(col1, y, contentW, headerH, "F");
      doc.setFontSize(7.5);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(255, 255, 255);
      let xh = col1 + 1.5;
      headers.forEach((h, i) => {
        doc.text(h, xh, y + 4.5);
        // Bei Englisch die Übersetzung klein darunter.
        const en = zwei ? saBeschriftungEn(h) : null;
        if (en && en !== h) {
          doc.setFont(PDF_FONT, "normal");
          doc.setFontSize(6);
          doc.text(en, xh, y + 8);
          doc.setFont(PDF_FONT, "bold");
          doc.setFontSize(7.5);
        }
        xh += widths[i];
      });
      y += headerH;
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(7.5);
    };
    drawHeader();
    rows.forEach((r, idx) => {
      /*
       * Jede Zelle vollstaendig ausschreiben statt nach der ersten Zeile
       * abzuschneiden. Vorher wurde nur die erste Umbruchzeile gedruckt, aus
       * "Deutsche Kreditbank AG" wurde in der schmalen Bank-Spalte ein
       * wortloser Rest. Die Zeile waechst jetzt mit der laengsten Zelle,
       * der Inhalt bleibt eins zu eins erhalten.
       */
      doc.setFontSize(7.5);
      const zellZeilen = r.map((cell, i) => {
        const zeilen = doc.splitTextToSize(cell || "–", widths[i] - 2) as string[];
        return zeilen.length > 0 ? zeilen : ["–"];
      });
      const maxZeilen = Math.max(...zellZeilen.map(z => z.length));
      const zeileH = 2.2 + maxZeilen * 3.8;
      if (y + zeileH > H - FOOTER_RESERVED) { forcePage(); drawHeader(); }
      if (idx % 2 === 0) {
        doc.setFillColor(245, 245, 248);
        doc.rect(col1, y, contentW, zeileH, "F");
      }
      let xr = col1 + 1.5;
      zellZeilen.forEach((zeilen, i) => {
        zeilen.forEach((zeile, j) => doc.text(zeile, xr, y + 4 + j * 3.8));
        xr += widths[i];
      });
      y += zeileH;
      /*
       * Zusatzzeile unter der Tabellenzeile, etwa Vermietungsdetails einer
       * Immobilie. Grau und eingerueckt, damit sie als Anmerkung zur Zeile
       * darueber lesbar ist. Langer Text wird ueber die volle Breite
       * umgebrochen statt abgeschnitten.
       */
      const sub = subRows?.[idx];
      if (sub) {
        doc.setFontSize(7);
        doc.setTextColor(90, 90, 90);
        const subLines = doc.splitTextToSize(sub, contentW - 8) as string[];
        subLines.forEach(line => {
          if (y + 4.5 > H - FOOTER_RESERVED) { forcePage(); }
          doc.text(line, col1 + 4, y + 3.2);
          y += 4.5;
        });
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(7.5);
        y += 0.5;
      }
    });
    y += 2;
  };

  // ═══════ PAGE 1: Persönliche Verhältnisse ═══════
  section("A. PERSÖNLICHE VERHÄLTNISSE");

  // Ohne zweite Person braucht keine Spalte eine Beschriftung, es gibt nur die
  // eine. Die Ueberschrift stand vorher trotzdem da.
  if (hasP2) {
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.accent);
    doc.text("Person 1", col1, y);
    doc.text("Person 2", col2, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  row("Anrede", wert(data.anrede), p2 ? wert(p2.anrede) : undefined);
  if (data.titel || p2?.titel) row("Titel", data.titel, p2?.titel);
  row("Vorname", data.vorname, p2?.vorname);
  row("Nachname", data.nachname, p2?.nachname);
  if (data.geburtsname || p2?.geburtsname) row("Geburtsname", data.geburtsname, p2?.geburtsname);
  row("Geburtsdatum", data.geburtsdatum, p2?.geburtsdatum);
  row("Staatsangeh.", data.staatsangehoerigkeit === "deutsch" ? wert("Deutsch") : data.staatsangehoerigkeitAndere,
    p2 ? (p2.staatsangehoerigkeit === "deutsch" ? wert("Deutsch") : p2.staatsangehoerigkeitAndere) : undefined);
  // Gespeichert ist der deutsche Wert („Verheiratet“); bei Englisch steht die Übersetzung daneben.
  row("Familienstand", wert(data.familienstand), p2 ? wert(p2.familienstand) : undefined);
  row("Wohnhaft seit", wert((data as any).wohnhaftSeit) || "–", p2 ? (wert((p2 as any).wohnhaftSeit) || "–") : undefined);
  row("Steuer-ID", (data as any).steuerId || "–", p2 ? ((p2 as any).steuerId || "–") : undefined);
  // Steuerklasse und Kirchensteuer standen vorher nur da, wenn sie gefuellt
  // waren. Die Bank fragt beides ab, ein fehlender Wert ist eine Aussage.
  row("Steuerklasse", (data as any).steuerklasse || "–", p2 ? ((p2 as any).steuerklasse || "–") : undefined);
  const jaNein = (v?: string) => (v === "ja" ? wert("Ja") : v === "nein" ? wert("Nein") : "–");
  row("Kirchensteuer", jaNein((data as any).kirchensteuer), p2 ? jaNein((p2 as any).kirchensteuer) : undefined);
  if ((data as any).gueterstand) {
    const gsMap: Record<string, string> = { gesetzlich: "Zugewinngemeinschaft", guetertrennung: "Gütertrennung", guetergemeinschaft: "Gütergemeinschaft" };
    rowSingle("Güterstand", wert(gsMap[(data as any).gueterstand] || (data as any).gueterstand));
  }
  if (Array.isArray((data as any).wuenscheZiele) && (data as any).wuenscheZiele.length > 0) {
    rowSingle("Wünsche / Ziele", (data as any).wuenscheZiele.map((z: string) => wert(z)).join(", "));
  }

  unterTitel("Adresse", 14, true);

  row("Straße, Nr.", `${data.strasse} ${data.hausnummer}`.trim(),
    p2 ? `${p2.strasse} ${p2.hausnummer}`.trim() : undefined);
  row("PLZ / Ort", `${data.plz} ${data.ort}`.trim(),
    p2 ? `${p2.plz} ${p2.ort}`.trim() : undefined);

  unterTitel("Kontakt", 14, true);

  row("E-Mail", data.email, p2?.email);
  row("Telefon", data.telefon, p2?.telefon);
  if (data.mobilfunk || p2?.mobilfunk) row("Mobil", data.mobilfunk, p2?.mobilfunk);

  unterTitel("Beschäftigung", 14, true);

  row("Art der Tätigkeit", wert((data as any).beschaeftigungsart) || "–", p2 ? (wert((p2 as any).beschaeftigungsart) || "–") : undefined);
  row("Arbeitgeber", data.anstellung.firma, p2?.anstellung.firma);
  row("Branche", data.anstellung.branche, p2?.anstellung.branche);
  row("Angestellt seit", data.anstellung.angestelltSeit, p2?.anstellung.angestelltSeit);
  row("Beruf", data.anstellung.berufsbezeichnung, p2?.anstellung.berufsbezeichnung);
  row("Probezeit", jaNein(data.anstellung.probezeit), p2 ? jaNein(p2.anstellung?.probezeit) : undefined);
  if ((data as any).arbeitsvertragArt || (p2 as any)?.arbeitsvertragArt) {
    const avDe = (v?: string) => v === "unbefristet" ? "Unbefristet" : v === "probezeit" ? "In Probezeit" : v === "befristet" ? "Befristet" : "–";
    const av = (v?: string) => (zwei && v && SA_WERTE_EN[v] ? `${avDe(v)} / ${SA_WERTE_EN[v]}` : avDe(v));
    row("Vertragsart", av((data as any).arbeitsvertragArt), p2 ? av((p2 as any).arbeitsvertragArt) : undefined);
    if ((data as any).befristetBis || (p2 as any)?.befristetBis) row("Befristet bis", (data as any).befristetBis || "–", (p2 as any)?.befristetBis);
  }
  if ((data as any).bruttoJahr || (p2 as any)?.bruttoJahr) row("Brutto p.a.", eurFmt((data as any).bruttoJahr), p2 ? eurFmt((p2 as any).bruttoJahr) : undefined);
  if ((data as any).monatsgehaelter || (p2 as any)?.monatsgehaelter) row("Monatsgehälter", (data as any).monatsgehaelter || "12", p2 ? ((p2 as any).monatsgehaelter || "12") : undefined);

  if (data.selbstaendigkeit.firma || p2?.selbstaendigkeit?.firma) {
    unterTitel("Selbständigkeit", 14, true);
    row("Firma", data.selbstaendigkeit.firma, p2?.selbstaendigkeit?.firma);
    row("Branche", data.selbstaendigkeit.branche, p2?.selbstaendigkeit?.branche);
    row("Seit", data.selbstaendigkeit.selbstaendigSeit, p2?.selbstaendigkeit?.selbstaendigSeit);
    row("Mitarbeiter", data.selbstaendigkeit.anzahlMitarbeiter, p2?.selbstaendigkeit?.anzahlMitarbeiter);
  }

  if (data.kinder.length > 0) {
    y += 2;
    // Fehlender Haushaltswert (Altbestand) zaehlt als "im Haushalt".
    rowSingle("Kinder", data.kinder.map(k => {
      const haushalt = k.imHaushalt === false
        ? (zwei ? "nicht im Haushalt / not in household" : "nicht im Haushalt")
        : (zwei ? "im Haushalt / in household" : "im Haushalt");
      const teile = [k.geburtsdatum || "", haushalt].filter(Boolean);
      return `${k.name} (${teile.join(", ")})`;
    }).join(", "));
  }

  const renderBanks = (title: string, banks: {institut?:string; konto?:string; iban?:string}[]) => {
    if (!banks || banks.length === 0) return;
    unterTitel(title, 12);
    banks.forEach(bk => {
      checkPage(10);
      doc.setFontSize(8);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...BRAND.primary);
      const bankLine = [bk.institut, wert(bk.konto)].filter(Boolean).join(" – ") || "–";
      doc.text(bankLine, col1, y);
      y += 4.5;
      if (bk.iban) {
        doc.text(`IBAN: ${bk.iban}`, col1, y);
        y += 4.5;
      }
      doc.setTextColor(0, 0, 0);
    });
  };
  renderBanks(hasP2 ? "Bankverbindungen Person 1" : "Bankverbindung(en)", data.bankkonten);
  if (hasP2 && p2) renderBanks("Bankverbindungen Person 2", (p2 as any).bankkonten || []);

  // ═══════ Einkommen + Ausgaben + Vermögen ═══════
  //
  // Hier stand ein bedingungsloser Seitenumbruch. Bei einer Selbstauskunft
  // ohne zweite Person endete Abschnitt A oben auf der Seite und die
  // Bankverbindung blieb allein auf einer sonst leeren Seite stehen. Der
  // Umbruch kommt jetzt nur, wenn der Platz wirklich nicht reicht, darum
  // kuemmert sich section() selbst.
  section("B. EINKOMMENSVERHÄLTNISSE (monatlich netto)", 60);
  // Ohne zweite Person braucht keine Spalte eine Beschriftung, es gibt nur die
  // eine. Die Ueberschrift stand vorher trotzdem da.
  if (hasP2) {
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.accent);
    doc.text("Person 1", col1, y);
    doc.text("Person 2", col2, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  const gehaltExtra = (d: any) => {
    const parts: string[] = [];
    if (d?.gehalt13) parts.push("13.");
    if (d?.gehalt14) parts.push("14.");
    return parts.length ? ` (inkl. ${parts.join(" + ")} Gehalt)` : "";
  };
  const p1Extra = gehaltExtra(data);
  const p2Extra = hasP2 ? gehaltExtra(p2) : "";
  const gehaltLabel = p1Extra || p2Extra
    ? `Gehalt / Lohn${p1Extra && p2Extra && p1Extra === p2Extra ? p1Extra : p1Extra && !p2Extra ? ` — P1${p1Extra}` : !p1Extra && p2Extra ? ` — P2${p2Extra}` : p1Extra && p2Extra ? ` — P1${p1Extra} / P2${p2Extra}` : ""}`
    : "Gehalt / Lohn";
  const incomeFields: [string, string, string?][] = [
    [gehaltLabel, data.einkommen.netto, p2?.einkommen?.netto],
    ["Selbst. Tätigkeit", data.einkommen.gewerbe, p2?.einkommen?.gewerbe],
    ["Rente / Pension", data.einkommen.rente, p2?.einkommen?.rente],
    ["Mieteinnahmen", data.einkommen.miet, p2?.einkommen?.miet],
    ["Zinsen / Dividenden", data.einkommen.zinsen, p2?.einkommen?.zinsen],
    ["Sonstige Einkünfte", data.einkommen.sonstige, p2?.einkommen?.sonstige],
    ["Kindergeld", data.einkommen.kindergeld, undefined],
  ];
  incomeFields.forEach(([label, v1, v2]) => {
    row(label, v1 ? eurFmt(v1) : "", v2 ? eurFmt(v2) : "");
  });

  const sumInc1 = incomeFields.reduce((s, [, v]) => s + parseDE(v), 0);
  const sumInc2 = hasP2 ? incomeFields.reduce((s, [,, v]) => s + parseDE(v), 0) : 0;
  sumRow("Gesamt Einkommen", sumInc1, sumInc2);
  combinedSumRow("Gesamt Einkommen Person 1 + Person 2", sumInc1 + sumInc2);

  /*
   * Das Jahresbrutto gehört sichtbar in den Einkommensblock, es ist die
   * Grundlage der Steuerberechnung. Es steht bewusst UNTER der Monatssumme
   * und geht nicht in sie ein: Der ganze Abschnitt führt Monatswerte, ein
   * Jahreswert in derselben Summe wäre schlicht falsch. Die Beschriftung
   * nennt deshalb ausdrücklich "p. a.".
   */
  const bruttoJahrP1 = parseDE((data as any).bruttoJahr);
  const bruttoJahrP2 = hasP2 ? parseDE((p2 as any)?.bruttoJahr) : 0;
  if (bruttoJahrP1 > 0 || bruttoJahrP2 > 0) {
    y += 2;
    row(
      "Jahresbrutto (gesamt), p. a.",
      bruttoJahrP1 > 0 ? eurFmt(bruttoJahrP1) : "–",
      hasP2 ? (bruttoJahrP2 > 0 ? eurFmt(bruttoJahrP2) : "–") : undefined,
    );
    // Die Haushaltssumme ueber die volle Blattbreite, wie bei den Monatswerten
    // darueber. In der schmalen Beschriftungsspalte der Zweispalten-Zeilen
    // waere der lange Text abgeschnitten worden.
    combinedSumRow("Jahresbrutto Person 1 + Person 2, p. a.", bruttoJahrP1 + bruttoJahrP2);
  }

  /*
   * Das zu versteuernde Jahreseinkommen, freiwillig. Bei Ehe oder
   * eingetragener Lebenspartnerschaft steht dort das gemeinsame zvE aus dem
   * Steuerbescheid, nur bei Person 1 erfasst; die Zeile läuft dann über die
   * volle Breite und sagt das. Keine Summe beider Personen: Zwei getrennte
   * zvE werden getrennt besteuert, eine Addition wäre keine Steuergröße.
   */
  // Eine eingetragene 0 ist eine Angabe und wird gedruckt, nur leer fehlt.
  const zvEText = (v: unknown): string | null =>
    typeof v === "string" && /\d/.test(v)
      ? `${parseDE(v).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
      : null;
  const zvEP1 = zvEText((data as any).zvEJahr);
  if (hatGueterstand(data.familienstand)) {
    if (zvEP1) rowWeit("Zu versteuerndes Einkommen p. a., gemeinsam (Zusammenveranlagung)", zvEP1);
  } else {
    const zvEP2 = hasP2 ? zvEText((p2 as any)?.zvEJahr) : null;
    if (zvEP1 || zvEP2) {
      row("Zu verst. Einkommen p. a.", zvEP1 ?? "–", hasP2 ? (zvEP2 ?? "–") : undefined);
    }
  }

  section("C. MONATLICHE AUSGABEN", 60);
  if (hasP2) {
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.accent);
    doc.text("Person 1", col1, y);
    doc.text("Person 2", col2, y);
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  /*
   * Die Zuordnung kommt aus finanzierbarkeitUtils und wird hier nicht mehr
   * nachgebaut. Vorher stand hier eine eigene, kuerzere Stichwortliste, und
   * dieselbe Selbstauskunft zeigte deshalb im PDF andere Zahlen als in der
   * Kundenakte. Ein Bausparvertrag zaehlte dort zur Hypothek und hier zu
   * Sonstige, eine Kreditkarte umgekehrt.
   */
  const rateByType = (kredite: { art?: string; rate?: string; kategorie?: string }[] = []) => {
    const r = { hypo: 0, auto: 0, priv: 0, sonst: 0 };
    const nach: Record<string, keyof typeof r> = {
      hypothek: "hypo", auto: "auto", privat: "priv", sonstige: "sonst",
    };
    kredite.forEach(k => {
      r[nach[kreditArt(k.art, k.kategorie)]] += parseDE(k.rate);
    });
    return r;
  };
  const r1 = rateByType(data.kredite);
  const r2 = p2 ? rateByType(p2.kredite) : { hypo: 0, auto: 0, priv: 0, sonst: 0 };

  row("Wohnsituation", wert((data as any).mietart) || "–", p2 ? (wert((p2 as any).mietart) || "–") : undefined);
  /*
   * Die Anzahl der Fahrzeuge ist eine Angabe und kein Betrag, sie gehoert
   * deshalb hierher und nicht als Klammerzusatz an die Kosten. Vorher war sie
   * im PDF nicht auffindbar: Sie hing an der Kostenzeile, und die faellt weg,
   * wenn keine Kosten eingetragen sind.
   */
  {
    const kfz1 = String((data as any).kfzAnzahl || "").trim();
    const kfz2 = p2 ? String((p2 as any).kfzAnzahl || "").trim() : "";
    if (kfz1 || kfz2) {
      row("Fahrzeuge im Haushalt", kfz1 || "–", p2 ? (kfz2 || "–") : undefined);
    }
  }

  const ausgabenFields: [string, number, number?][] = [
    // Seit der Umstellung auf Kaltmiete plus Wohnnebenkosten ist die Summe
    // nicht mehr doppelt. In Altbestaenden kann im Feld noch eine Warmmiete
    // stehen, das sieht der Berater beim Durchsprechen.
    ["Kaltmiete", parseDE(data.mieteWarm), p2 ? parseDE(p2.mieteWarm) : undefined],
    ["Wohnnebenkosten", parseDE((data as any).nebenkosten), p2 ? parseDE((p2 as any).nebenkosten) : undefined],
    ["Lebenshaltung", parseDE(data.lebenshaltungskosten), p2 ? parseDE(p2.lebenshaltungskosten) : undefined],
    ["Unterhaltszahlungen", parseDE((data as any).unterhalt), p2 ? parseDE((p2 as any).unterhalt) : undefined],
    /*
     * Die Anzahl gehoert dazu. 230 Euro fuer ein Fahrzeug ist eine andere
     * Aussage als 230 Euro fuer drei, und die Bank kann die Zahl sonst nicht
     * einordnen. Im Formular ist ausdruecklich die Summe aller Fahrzeuge
     * gemeint.
     */
    [
      // Bei mehreren Fahrzeugen ist die Summe gemeint, so steht es auch im
      // Formular. Die Anzahl selbst steht oben unter den Angaben.
      (parseInt(String((data as any).kfzAnzahl || "0"), 10) || 0) > 1
        ? "KFZ-Kosten (alle Fahrzeuge)"
        : "KFZ-Kosten",
      parseDE((data as any).kfzKosten),
      p2 ? parseDE((p2 as any).kfzKosten) : undefined,
    ],
    /*
     * Das Sammelfeld nur dann, wenn die Aufschluesselung darunter leer ist.
     * Sonst stand dasselbe Geld zweimal im Dokument, einmal als Summe und
     * einmal aufgeteilt, und die Gesamtausgaben waren um diesen Betrag zu
     * hoch. Dieselbe Regel steht in versicherungenGesamt.
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
    /*
     * Hier stehen monatliche Raten, unter Verbindlichkeiten die Restschulden.
     * Ohne den Zusatz suchte man die Zahl von hier dort vergeblich und hielt
     * es fuer einen Fehler.
     */
    ["Hypotheken (Zins/Tilg.)", r1.hypo, p2 ? r2.hypo : undefined],
    ["Autokredite (Rate mtl.)", r1.auto, p2 ? r2.auto : undefined],
    ["Privatkredite (Rate mtl.)", r1.priv, p2 ? r2.priv : undefined],
    ["Sonstige Kredite (Rate mtl.)", r1.sonst, p2 ? r2.sonst : undefined],
    ["Sonstige Ausgaben", parseDE(data.sonstigeAusgaben), p2 ? parseDE(p2.sonstigeAusgaben) : undefined],
  ];
  ausgabenFields.filter(([, v1, v2]) => (v1 as number) > 0 || ((v2 as number) || 0) > 0).forEach(([label, v1, v2]) => {
    row(label as string, (v1 as number) > 0 ? eurFmt(v1 as number) : "", v2 !== undefined && (v2 as number) > 0 ? eurFmt(v2 as number) : "");
  });
  /*
   * Wofuer die sonstigen Ausgaben anfallen, als eigene Zeile unter der Liste.
   *
   * Nicht in der Beschriftung: Bei zwei Personen koennen dort zwei
   * verschiedene Angaben stehen, und eine Beschriftung traegt nur eine. So
   * steht bei jeder Person ihre eigene, in derselben Spalte wie ihr Betrag.
   */
  {
    const wofuer1 = String((data as any).sonstigeAusgabenWofuer || "").trim();
    const wofuer2 = p2 ? String((p2 as any).sonstigeAusgabenWofuer || "").trim() : "";
    if (wofuer1 || wofuer2) {
      row("davon wofür", wofuer1 || "–", p2 ? (wofuer2 || "–") : undefined);
    }
  }

  const sumA1 = ausgabenFields.reduce((s, [, v]) => s + (v as number), 0);
  const sumA2 = hasP2 ? ausgabenFields.reduce((s, [, , v]) => s + ((v as number) || 0), 0) : undefined;
  sumRow("Gesamt Ausgaben", sumA1, sumA2);
  combinedSumRow("Gesamt Ausgaben Person 1 + Person 2", sumA1 + (sumA2 || 0));

  // Frei verfügbares Einkommen
  const freiVerfuegbar = (sumInc1 + sumInc2) - (sumA1 + (sumA2 || 0));
  highlightRow("Frei verfügbares Einkommen (gesamt)", freiVerfuegbar);

  section("D. VERMÖGENSVERHÄLTNISSE", 30);
  const vw1 = data.vermoegenswerte || [];
  const vw2 = (p2?.vermoegenswerte) || [];
  if (vw1.length === 0 && vw2.length === 0) {
    rowWeit("Keine Angaben", "–");
    y += 3;
  } else {
    // Trägt das Institut denselben Namen wie die Art, stand da zweimal
    // dasselbe: "Lebensversicherung (Lebensversicherung)".
    const vwLabel = (v: { art?: string; institut?: string }) => {
      const art = v.art || "Sonstiges";
      const inst = (v.institut || "").trim();
      return inst && inst.toLowerCase() !== art.toLowerCase() ? `${art} (${inst})` : art;
    };
    vw1.forEach(v => rowWeit(vwLabel(v), v.betrag ? eurFmt(v.betrag) : "–"));
    const sum1 = vw1.reduce((s, v) => s + parseDE(v.betrag), 0);
    if (vw1.length > 0) sumRow(hasP2 ? "Gesamt Vermögen Person 1" : "Gesamt Vermögen", sum1, undefined, weiterOffset);
    if (hasP2 && vw2.length > 0) {
      unterTitel("Vermögenswerte Person 2", 14);
      vw2.forEach(v => rowWeit(vwLabel(v), v.betrag ? eurFmt(v.betrag) : "–"));
      const sum2 = vw2.reduce((s, v) => s + parseDE(v.betrag), 0);
      sumRow("Gesamt Vermögen Person 2", sum2, undefined, weiterOffset);
    }
  }

  // ═══════ Immobilienvermögen: je Immobilie ein Block samt Darlehen ═══════
  //
  // Die fruehere Sammel-Tabelle stellte alle Immobilien in eine Reihe und die
  // Darlehen weit weg in die Kredittabelle. Wer zwei Objekte mit zwei
  // Finanzierungen hatte, konnte nicht zuordnen, welches Darlehen zu welchem
  // Objekt gehoert. Jetzt: Immobilie 1 mit ihren Angaben, direkt darunter
  // ihre Darlehen, dann Immobilie 2, und so weiter. Die Zuordnung trifft der
  // Ausfueller im Formular (Kredit-Details, "Gehoert zu Immobilie").
  const immo = ((data as any).immobilien || []).concat(hasP2 ? (((p2 as any)?.immobilien) || []) : []);
  const allKredite = [
    ...data.kredite.map(k => ({ ...(k as any), person: hasP2 ? "P1" : "" })),
    ...(p2 ? p2.kredite.map(k => ({ ...(k as any), person: "P2" })) : []),
  ];
  type PdfKredit = SelbstauskunftData["kredite"][number] & { person?: string };
  // Kredite beider Personen koennen zugeordnet sein, auch an eine Immobilie
  // der anderen Person ("p2:0" zeigt auf die erste Immobilie von Person 2).
  // Nur an eine Immobilie, die es (noch) gibt; ein verwaister Verweis faellt
  // in die Kredittabelle.
  const anzahlImmoP1 = ((data as any).immobilien || []).length;
  const anzahlImmoP2 = immo.length - anzahlImmoP1;
  const immobilieVon = (k: PdfKredit): number => immobilienPosition(k.immobilie, anzahlImmoP1, anzahlImmoP2);
  /** Deutscher Wert, bei Englisch mit der Übersetzung dahinter. */
  const wertZwei = (de: string): string => {
    const en = zwei ? saBeschriftungEn(de) : null;
    return en && en !== de ? `${de} / ${en}` : de;
  };
  /**
   * Die Kreditangaben seit dem 28.09.2026 (Stichtag der Restschuld,
   * Kreditnehmer, Zinsart, Sondertilgung). Aeltere Kredite haben sie nicht,
   * dann bleibt die Zusatzzeile leer.
   */
  const kreditZusatz = (k: PdfKredit): [string, string][] => ([
    ["Restschuld per", k.restschuldPer || ""],
    ["Kreditnehmer", hasP2 ? kreditAuswahlText("kreditnehmer", k.kreditnehmer) : ""],
    ["Zins fest oder variabel", kreditAuswahlText("zinsart", k.zinsart)],
    ["Sondertilgungsrecht", kreditAuswahlText("sondertilgung", k.sondertilgung)],
  ] as [string, string][]).filter(([, v]) => !!v);
  /** Datumsangaben bleiben, wie sie sind; Auswahlwerte bekommen die Übersetzung. */
  const zusatzWert = (label: string, v: string) => (label === "Restschuld per" || label === "Zinsbindung bis" ? v : wertZwei(v));
  const kreditErsteSpalte = (k: PdfKredit): string => {
    const gewaehlt = kreditAuswahlLabel(k.kategorie);
    const bezeichnung = (k.art || "").trim();
    return gewaehlt && bezeichnung && gewaehlt !== bezeichnung
      ? `${gewaehlt} · ${bezeichnung}`
      : gewaehlt || bezeichnung || "Kredit";
  };

  if (immo.length > 0) {
    section("E. IMMOBILIENVERMÖGEN", 30);
    immo.forEach((im: NonNullable<SelbstauskunftData["immobilien"]>[number], i: number) => {
      unterTitel(`Immobilie ${i + 1}`, 20);
      rowWeit("Eigentümer", im.eigentuemer || "–");
      rowWeit("Art", wert(im.art) || "–");
      rowWeit("Adresse", im.adresse || "–");
      rowWeit("Baujahr", im.baujahr || "–");
      rowWeit("Grundstück / Wohnfläche", `${im.grundstueckM2 || "–"} m² / ${im.wohnflaecheM2 || "–"} m²`);
      const nutzungDe = im.nutzung === "eigen" ? "Eigennutzung" : im.nutzung === "fremd" ? "Fremdvermietet" : "–";
      rowWeit("Nutzung", zwei && im.nutzung && SA_WERTE_EN[im.nutzung] ? `${nutzungDe} / ${SA_WERTE_EN[im.nutzung]}` : nutzungDe);
      rowWeit("Marktwert", eurFmt(im.marktwert));
      rowWeit("Kaltmiete Ist", eurFmt(im.kaltmieteIst));
      if (parseDE(im.kaltmieteZukunft) > 0) rowWeit("Kaltmiete zukünftig", eurFmt(im.kaltmieteZukunft));
      const vd = String(im.vermietungsdetails || "").trim();
      if (vd) rowWeit("Vermietungsdetails", vd);

      const darlehen = allKredite.filter(k => immobilieVon(k) === i);
      darlehen.forEach((k: PdfKredit, d: number) => {
        unterTitel(darlehen.length > 1
          ? `Darlehen ${d + 1} zu Immobilie ${i + 1}`
          : `Darlehen zu Immobilie ${i + 1}`, 14);
        rowWeit("Bank / Darlehensgeber", k.bank || "–");
        rowWeit("Art / Bezeichnung", kreditErsteSpalte(k));
        if (parseDE(k.ursprung) > 0) rowWeit("Ursprungskredit", eurFmt(k.ursprung));
        rowWeit("Restschuld", eurFmt(k.restschuld));
        rowWeit("Rate monatlich", eurFmt(k.rate));
        if ((k.zinssatz || "").trim()) rowWeit("Zinssatz", zinsFmt(k.zinssatz));
        // Zinsbindung und Laufzeitende sind zwei Angaben; frueher stand das
        // Laufzeitende ersatzweise unter „Zinsbindung bis“.
        if ((k.zinsbindungBis || "").trim()) rowWeit("Zinsbindung bis", k.zinsbindungBis!);
        if ((k.laufzeitEnde || "").trim()) rowWeit("Laufzeitende", k.laufzeitEnde);
        if ((k.zweck || "").trim()) rowWeit("Verwendungszweck", k.zweck);
        kreditZusatz(k).forEach(([label, v]) => rowWeit(label, zusatzWert(label, v)));
      });
      y += 2;
    });
    const sumImmo = immo.reduce((s: number, im: any) => s + parseDE(im.marktwert), 0);
    sumRow("Summe Marktwert Immobilien", sumImmo, undefined, weiterOffset);
  }

  section(immo.length > 0 ? "F. VERBINDLICHKEITEN (Kredite / Bürgschaften)" : "E. VERBINDLICHKEITEN (Kredite / Bürgschaften)", 30);
  /*
   * Die Tabelle steht jetzt immer, nicht nur wenn jemand Detailfelder
   * ausgefuellt hat.
   *
   * Vorher gab es zwei Darstellungen: die volle Tabelle mit Rate, und eine
   * einfache Liste, die nur die Restschuld zeigte. Wer nur Art und Rate
   * eintrug, bekam die einfache und fand seine monatliche Rate im ganzen
   * Dokument an keiner Stelle einzeln wieder. Oben unter den Ausgaben stand
   * eine Summe, unten standen Restschulden, und niemand konnte die eine mit
   * der anderen zusammenbringen.
   *
   * Die erste Spalte nennt beides: die gewaehlte Art und dahinter die
   * Bezeichnung des Kunden. So sieht die Bank auf einen Blick, dass ein
   * Autokredit bei der VW Bank laeuft.
   */
  // Zugeordnete Immobiliendarlehen stehen oben bei ihrer Immobilie und
  // tauchen hier nicht noch einmal auf. Die Gesamt-Restschuld unten zaehlt
  // trotzdem ALLE Kredite, damit die Summe an einer Stelle vollstaendig ist.
  const freieKredite = allKredite.filter(k => immobilieVon(k) < 0);
  /*
   * „Nein, schuldenfrei“ auf die Frage in Schritt Vermoegenswerte. Steht nur,
   * solange die Person tatsaechlich kein Immobiliendarlehen eingetragen hat,
   * sonst widerspraeche die Zeile der Tabelle darunter.
   */
  {
    const ohneImmoKredit = (kr: PdfKredit[]) => !kr.some(k => kreditArt(k.art, k.kategorie) === "hypothek");
    const p1Frei = (data as any).immobilienSchuldenfrei === true && ohneImmoKredit(data.kredite);
    const p2Frei = !!p2 && (p2 as any).immobilienSchuldenfrei === true && ohneImmoKredit(p2.kredite);
    if (p1Frei || p2Frei) {
      const wer = !hasP2 ? "Ja" : p1Frei && p2Frei ? "Person 1 und Person 2" : p1Frei ? "Person 1" : "Person 2";
      rowWeit("Immobilien schuldenfrei (Angabe des Antragstellers)", wertZwei(wer));
    }
  }
  if (allKredite.length > 0) {
    if (freieKredite.length > 0) {
      // Die Spalte zeigt das Laufzeitende (bei fast allen Arten Pflicht), eine
      // Zinsbindung steht in der Zusatzzeile darunter.
      const kh = ["Art / Bezeichnung", "Bank", "Ursprung", "Restschuld", "Rate mtl.", "Zins", "Laufzeit bis", "Zweck"];
      // Betragsspalten breit genug für „280.000,00 €“ in einer Zeile.
      const kw = [40, 19, 21, 21, 18, 11, 19, 21];
      const kr = freieKredite.map((k: PdfKredit) => [
        `${k.person ? k.person + " " : ""}${kreditErsteSpalte(k)}`,
        k.bank || "–",
        eurFmt(k.ursprung),
        eurFmt(k.restschuld),
        eurFmt(k.rate),
        zinsFmt(k.zinssatz),
        k.laufzeitEnde || "–",
        k.zweck || "–",
      ]);
      const zusatz = freieKredite.map((k: PdfKredit) => {
        const zinsbindung: [string, string][] = (k.zinsbindungBis || "").trim() ? [["Zinsbindung bis", k.zinsbindungBis!]] : [];
        const teile = [...zinsbindung, ...kreditZusatz(k)].map(([label, v]) => `${wertZwei(label)}: ${zusatzWert(label, v)}`);
        return teile.length > 0 ? teile.join(" · ") : undefined;
      });
      table(kh, kr, kw, zusatz);
    } else {
      rowWeit("Alle Kredite sind oben den Immobilien zugeordnet", "–");
    }
    const sumRest = allKredite.reduce((s: number, k: any) => s + parseDE(k.restschuld), 0);
    sumRow(freieKredite.length < allKredite.length ? "Gesamt Restschuld (alle Kredite inkl. Immobiliendarlehen)" : "Gesamt Restschuld", sumRest, undefined, weiterOffset);
  } else {
    /*
     * Ohne Kredite bleibt nur der Hinweis. Die frueher hier stehende zweite
     * Darstellung ist entfallen, sie zeigte Restschulden statt Raten und war
     * damit nicht mit den Ausgaben oben vergleichbar.
     */
    rowWeit("Keine Kredite", "–");
  }

  // Buergschaften stehen unabhaengig von den Krediten, auch wenn es keine gibt.
  {
    const allBuergSep = [...(data.buergschaften || []), ...(p2?.buergschaften || [])];
    allBuergSep.filter(b => parseDE(b.betrag) > 0).forEach(b => {
      rowWeit(`Bürgschaft${b.art ? `: ${b.art}` : ""}`, eurFmt(b.betrag));
    });
  }
  y += 3;

  // ═══════ Bonitaetsangaben ═══════
  //
  // Mahnverfahren, Schufa-Kenntnis und Schufa-Score standen im Formular, aber
  // in keinem einzigen Dokument. Genau danach fragt die Bank als Erstes.
  section("BONITÄTSANGABEN", 24);
  row("Laufendes Mahnverfahren", jaNein(data.mahnverfahren), p2 ? jaNein(p2.mahnverfahren) : undefined);
  row("Schufa-Eintrag bekannt", jaNein(data.schufaBekannt), p2 ? jaNein(p2.schufaBekannt) : undefined);
  row("Schufa-Score", data.schufaScore || "–", p2 ? (p2.schufaScore || "–") : undefined);

  if ((data.hinweise || "").trim()) {
    unterTitel("Ergänzende Hinweise", 12);
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    const hinweisZeilen = doc.splitTextToSize(data.hinweise.trim(), contentW) as string[];
    checkPage(hinweisZeilen.length * 4 + 4);
    doc.text(hinweisZeilen, col1, y);
    y += hinweisZeilen.length * 4 + 3;
  }
  y += 3;

  // ═══════ ERKLÄRUNG + UNTERSCHRIFT — als zusammenhängender Block ═══════
  // Zweisprachig steht die Erklärung zweimal da, plus Vorrangklausel.
  const sigBlockHeight = zwei ? 150 : 90;
  checkPage(sigBlockHeight);

  section("ERKLÄRUNG", sigBlockHeight - 14);
  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(60, 60, 60);

  // Der Wortlaut steht in `selbstauskunftSprache.ts`, damit Formular, PDF und
  // das ausfüllbare Formular dieselbe Erklärung tragen. Das Deutsche ist
  // unverändert und bleibt maßgeblich.
  const erklaerungText = SA_ERKLAERUNG.de;
  const lines1 = doc.splitTextToSize(erklaerungText, contentW);
  checkPage(lines1.length * 3.5 + 5);
  doc.text(lines1, col1, y);
  y += lines1.length * 3.5 + 3;

  const schufaText = SA_SCHUFA_KLAUSEL.de;
  const lines2 = doc.splitTextToSize(schufaText, contentW);
  checkPage(lines2.length * 3.5 + (zwei ? 5 : 40));
  doc.text(lines2, col1, y);
  y += lines2.length * 3.5 + (zwei ? 3 : 12);

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
    y += 12;
  }
  doc.setTextColor(0, 0, 0);

  // Unterschriften
  checkPage(35);
  const sigLineY = y + 18;
  const sigWidth = 60;
  const sigHeight = 18;

  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.3);
  doc.line(col1, sigLineY, col1 + 70, sigLineY);
  doc.setFontSize(7);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.primary);
  doc.text(`${data.vorname} ${data.nachname}`, col1, sigLineY + 4);
  doc.text(zwei ? "Unterschrift Person 1 / Signature person 1" : "Unterschrift Person 1", col1, sigLineY + 8);

  const p1Gesetzt = signatures?.person1?.signatureData
    ? unterschriftEinsetzen(doc, signatures.person1.signatureData, col1 + 5, sigLineY - sigHeight, sigWidth, sigHeight, "Person 1")
    : false;

  doc.setFontSize(6.5);
  if (p1Gesetzt) {
    doc.setTextColor(0, 128, 0);
    const d1 = signatures?.person1?.signedAt ? new Date(signatures.person1.signedAt) : new Date();
    doc.text((zwei ? "Digital bestätigt am / Digitally confirmed on " : "Digital bestätigt am ") + d1.toLocaleDateString("de-DE"), col1, sigLineY + 12);
  } else if (signatures?.person1?.signatureData) {
    // Unterschrift liegt vor, liess sich aber nicht darstellen. Keine
    // Bestaetigung drucken, sonst behauptet das Dokument etwas Unbelegtes.
    doc.setTextColor(180, 0, 0);
    doc.text("Unterschrift konnte nicht dargestellt werden", col1, sigLineY + 12);
  } else {
    doc.setTextColor(150, 150, 150);
    doc.text(zwei ? "Unterschrift ausstehend / Signature pending" : "Unterschrift ausstehend", col1, sigLineY + 12);
  }
  doc.setTextColor(0);

  if (hasP2 && p2) {
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.3);
    doc.line(col2, sigLineY, col2 + 70, sigLineY);
    doc.setFontSize(7);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.primary);
    doc.text(`${p2.vorname} ${p2.nachname}`, col2, sigLineY + 4);
    doc.text(zwei ? "Unterschrift Person 2 / Signature person 2" : "Unterschrift Person 2", col2, sigLineY + 8);

    const p2Gesetzt = signatures?.person2?.signatureData
      ? unterschriftEinsetzen(doc, signatures.person2.signatureData, col2 + 5, sigLineY - sigHeight, sigWidth, sigHeight, "Person 2")
      : false;

    doc.setFontSize(6.5);
    if (p2Gesetzt) {
      doc.setTextColor(0, 128, 0);
      const d2 = signatures?.person2?.signedAt ? new Date(signatures.person2.signedAt) : new Date();
      doc.text((zwei ? "Digital bestätigt am / Digitally confirmed on " : "Digital bestätigt am ") + d2.toLocaleDateString("de-DE"), col2, sigLineY + 12);
    } else if (signatures?.person2?.signatureData) {
      doc.setTextColor(180, 0, 0);
      doc.text("Unterschrift konnte nicht dargestellt werden", col2, sigLineY + 12);
    } else {
      doc.setTextColor(150, 150, 150);
      doc.text(zwei ? "Unterschrift ausstehend / Signature pending" : "Unterschrift ausstehend", col2, sigLineY + 12);
    }
    doc.setTextColor(0);
  }

  // ─── Add footers to all pages ───
  // Das Deckblatt bekommt keine Fusszeile und zaehlt nicht mit.
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, totalPages - 1);
  }

  return doc;
}
