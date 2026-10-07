import jsPDF from "jspdf";
import type { KaufvertragData } from "@/lib/investmentsStore";
import { BRAND, loadLogo, addBrandedHeader, addBrandedFooter, brandedSectionTitle, brandedRow } from "./pdfBranding";
import { verkaeuferVollerName } from "@/lib/verkaeuferName";
import { KAUFGEGENSTAND_GESAMTOBJEKT } from "./reservierungErklaerung";
import { dolmetscherKennzeichen } from "./notarSprache";
import type { Sprache } from "./kundenSprache";

/** Was der Bogen über die Sprache des Käufers wissen muss. */
export interface NotarbogenOptionen {
  /**
   * Die Sprache aus dem Kundenprofil. Bei Englisch trägt der Bogen das
   * Kennzeichen „Dolmetscher nötig“ (Plan Kundensprache 4.3). Ohne Angabe
   * bleibt der Bogen wie bisher.
   */
  kundenSprache?: Sprache;
  /** Die Dolmetschersprache aus der Reservierung, falls dort erfasst. */
  dolmetscherSprache?: string | null;
}

export async function generateKaufvertragPDF(data: KaufvertragData, optionen: NotarbogenOptionen = {}): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  const W = 210;
  const H = 297;
  const margin = 20;
  const contentW = W - 2 * margin;
  let pageNum = 1;

  const logo = await loadLogo();

  let y = addBrandedHeader(doc, logo, "AUFNAHMEBOGEN NOTAR", "Aufnahme von Angaben zur Vorbereitung einer Beurkundung");

  const checkPage = (needed: number) => {
    if (y + needed > H - 30) {
      addBrandedFooter(doc, pageNum, 0);
      doc.addPage();
      pageNum++;
      y = 18;
    }
  };

  const section = (title: string) => {
    checkPage(14);
    y += 2;
    y = brandedSectionTitle(doc, title, y, margin, contentW);
  };

  const row = (label: string, value: string) => {
    checkPage(7);
    y = brandedRow(doc, label, value, margin, y, 55);
  };

  /**
   * Zeile mit breiterer Beschriftungsspalte.
   *
   * „Wohnungsnummer laut Teilungserklärung“ passt in die 55 Millimeter der
   * normalen Zeile nicht und bekäme Auslassungspunkte. Ausgerechnet die
   * Beschriftung, die den Unterschied zur Wohneinheit erklärt, wäre dann
   * abgeschnitten.
   */
  const rowBreit = (label: string, value: string) => {
    checkPage(7);
    y = brandedRow(doc, label, value, margin, y, 72);
  };

  const checkRow = (label: string, checked: boolean) => {
    checkPage(7);
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.primary);

    // Checkbox
    doc.setDrawColor(...BRAND.accent);
    doc.setLineWidth(0.3);
    doc.rect(margin, y - 3.5, 3.5, 3.5);
    if (checked) {
      doc.setDrawColor(...BRAND.primary);
      doc.setLineWidth(0.5);
      doc.line(margin + 0.5, y - 1.5, margin + 1.5, y - 0.5);
      doc.line(margin + 1.5, y - 0.5, margin + 3, y - 3);
    }
    doc.text(label, margin + 6, y);
    doc.setTextColor(0, 0, 0);
    y += 7;
  };

  // ── Page 1: Verkäufer ──
  /*
   * Eine Firma bekommt eine Zeile „Firma“, eine Privatperson zwei Zeilen für
   * Nachname und Vorname. Wer noch nicht gewählt hat, bekommt den Bogen wie
   * bisher, damit an einem bestehenden Eintrag nichts verschwindet.
   */
  section("Personalien des Verkäufers");
  if (data.vk_art === "firma") {
    row("Firma", verkaeuferVollerName({ art: "firma", name: data.vk_name, vorname: data.vk_vorname }));
  } else {
    row("Name", data.vk_name || "");
    row("Vorname", data.vk_vorname || "");
  }
  row("Geburtsdatum", data.vk_geburtsdatum || "");
  row("Geburtsname", data.vk_geburtsname || "");
  row("Anschrift", data.vk_anschrift || "");
  row("Telefon", data.vk_telefon || "");
  row("E-Mail", data.vk_email || "");
  row("HRB", data.vk_hrb || "");
  y += 4;
  section("Evtl. vertreten durch");
  checkRow("Vollmacht vorhanden", data.vk_vollmacht === "vorhanden");
  checkRow("Vollmacht nicht vorhanden", data.vk_vollmacht === "nicht_vorhanden");

  // ── Page 2: Käufer ──
  addBrandedFooter(doc, pageNum, 0);
  doc.addPage(); pageNum++;
  y = 18;
  section("Personalien des Käufers");
  /*
   * Das Kennzeichen „Dolmetscher nötig“, automatisch bei Kundensprache
   * Englisch. Es steht ganz oben bei den Käuferdaten, damit das Notariat es
   * vor der Terminplanung sieht; die Urkunde selbst bleibt deutsch.
   */
  const kennzeichen = dolmetscherKennzeichen(optionen.kundenSprache ?? "de", optionen.dolmetscherSprache);
  if (kennzeichen) {
    // Erst Schrift und Größe setzen, dann umbrechen, sonst misst jsPDF mit
    // der vorigen Schrift und der Text läuft über den Kasten hinaus.
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    const zeilen = doc.splitTextToSize(kennzeichen.text, contentW - 10) as string[];
    const hoehe = 8 + zeilen.length * 4;
    checkPage(hoehe + 4);
    doc.setFillColor(255, 244, 214);
    doc.setDrawColor(214, 142, 0);
    doc.setLineWidth(0.5);
    doc.rect(margin, y - 4, contentW, hoehe, "FD");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 70, 0);
    doc.setFontSize(9.5);
    doc.text(kennzeichen.titel, margin + 4, y + 1);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.primary);
    doc.text(zeilen, margin + 4, y + 6);
    doc.setTextColor(0, 0, 0);
    y += hoehe + 3;
  }
  row("Name", data.k_name || "");
  row("Vorname", data.k_vorname || "");
  row("Geburtsdatum", data.k_geburtsdatum || "");
  row("Geburtsname", data.k_geburtsname || "");
  row("Anschrift", data.k_anschrift || "");
  row("Telefon", data.k_telefon || "");
  row("E-Mail", data.k_email || "");
  row("Steuer-ID", data.k_steuerid || "");
  y += 4;
  section("Evtl. vertreten durch");
  checkRow("Vollmacht vorhanden", data.k_vollmacht === "vorhanden");
  checkRow("Vollmacht nicht vorhanden", data.k_vollmacht === "nicht_vorhanden");

  // ── Page 3: Vertragsobjekt ──
  addBrandedFooter(doc, pageNum, 0);
  doc.addPage(); pageNum++;
  y = 18;
  section("Vertragsobjekt");
  row("Amtsgericht", data.amtsgericht || "");
  row("Gemarkung", data.gemarkung || "");
  row("Blatt", data.blatt || "");
  row("Fl. Nr.", data.flnr || "");
  row("Adresse", data.obj_adresse || "");
  /*
   * Die Adresse benennt das Haus, diese beiden Zeilen die Wohnung darin.
   * Ohne sie ging der Bogen mit „Roonstraße 3, 95028 Hof“ zum Notar und ließ
   * offen, welche der Wohnungen gemeint ist.
   */
  if (data.obj_gesamtobjekt) {
    // Das ganze Haus: keine Wohnung darin, sondern der Kaufgegenstand wie in der Reservierung.
    rowBreit("Kaufgegenstand", KAUFGEGENSTAND_GESAMTOBJEKT);
  } else {
    row("Wohneinheit", data.obj_wohneinheit || "");
    rowBreit("Wohnungsnummer laut Teilungserklärung", data.obj_wohnungsnummer || "");
  }
  y += 4;
  section("Wie ist das Objekt bebaut?");
  const bebauungen = ["Unbebaut", "Einfamilienhaus", "Doppelhaushälfte", "Mehrfamilienhaus"];
  bebauungen.forEach(b => checkRow(b, data.obj_bebauung === b));
  y += 4;

  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  const hinweis = "Hinweis zu den Erschließungskosten für die Beteiligten: Da die Gemeinde unabhängig von den im Kauf getroffenen Vereinbarungen beim jeweiligen Eigentümer Erschließungsbeiträge anfordert, hat der Notar den Beteiligten geraten, sich vor Beurkundung bei der Gemeinde entsprechend zu informieren.";
  const hinweisLines = doc.splitTextToSize(hinweis, contentW);
  doc.text(hinweisLines, margin, y);
  y += hinweisLines.length * 4 + 6;
  doc.setTextColor(0, 0, 0);
  row("Kaufpreis (€)", data.kaufpreis || "");

  // ── Page 4: Bankverbindung & Besitz ──
  addBrandedFooter(doc, pageNum, 0);
  doc.addPage(); pageNum++;
  y = 18;
  section("Bankverbindung des Verkäufers");
  row("Name", data.bank_name || "");
  row("Bank", data.bank_institut || "");
  row("IBAN", data.bank_iban || "");
  row("BIC", data.bank_bic || "");
  y += 4;
  section("Besitz | Nutzen | Lastenübergang");
  checkRow("vermietet", data.vermietet === true);
  checkRow("nicht vermietet", data.vermietet === false);
  y += 4;

  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  const mieterHinweis = "Falls das Objekt vermietet ist folgender Hinweis an den Verkäufer: Der Verkäufer sollte sich vom Mieter wegen der dem Käufer ausgehändigten Kaution eine Erklärung geben lassen.";
  const mhLines = doc.splitTextToSize(mieterHinweis, contentW);
  doc.text(mhLines, margin, y);
  y += mhLines.length * 4 + 4;
  doc.setTextColor(0, 0, 0);

  // ── Page 5: Rücklage, Inventar, Makler, HV, Bank ──
  addBrandedFooter(doc, pageNum, 0);
  doc.addPage(); pageNum++;
  y = 18;
  section("Instandhaltungsrücklage");
  row("Datum", data.ruecklage_datum || "");
  row("Rücklage gesamt (€)", data.ruecklage_gesamt || "");
  row("Anteilig (€)", data.ruecklage_anteilig || "");
  y += 4;
  section("Inventar");
  row("Wird mitverkauft?", data.inventar_mitverkauft || "");
  row("Auflistung", data.inventar_auflistung || "");
  row("Angesetzter Kaufpreis", data.inventar_kaufpreis || "");
  y += 4;
  section("Vermittlerangaben");
  row("Firmierung", data.makler_name || "");
  row("Anschrift", data.makler_anschrift || "");
  y += 4;
  section("Hausverwaltung");
  row("Name", data.hv_name || "");
  row("Anschrift", data.hv_anschrift || "");
  y += 4;
  section("Abzulösende Bank");
  row("Aktenzeichen", data.bank_aktenzeichen || "");
  row("Anschrift", data.bank_abloesend_anschrift || "");

  // ── Page 6: Sonstige Notizen ──
  addBrandedFooter(doc, pageNum, 0);
  doc.addPage(); pageNum++;
  y = 18;
  section("Sonstige Notizen");
  if (data.sonstige_notizen) {
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.primary);
    const lines = doc.splitTextToSize(data.sonstige_notizen, contentW);
    doc.text(lines, margin, y);
    y += lines.length * 5;
    doc.setTextColor(0, 0, 0);
  } else {
    for (let i = 0; i < 15; i++) {
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.15);
      doc.line(margin, y, W - margin, y);
      y += 10;
    }
  }

  // ─── Add footers to all pages ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, totalPages);
  }

  return doc;
}
