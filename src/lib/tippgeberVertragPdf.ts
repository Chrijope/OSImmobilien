import jsPDF from "jspdf";
import type { Bewerber } from "./bewerbungStore";
import { vertragsAnschriftZeilen } from "./vertragKlauseln";
import { BRAND, loadLogo, addBrandedHeader, addBrandedFooter, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";

/**
 * Reduzierte Tippgebervereinbarung (Nachweismakler-Modell).
 *
 * Enthält lediglich die zwingend erforderlichen Bestandteile:
 *   • Tippgebervereinbarung (Hauptdokument)
 *   • Anlage 1 – DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheit
 *   • Anlage 2 – Portal- & Qualitätsrichtlinie (Tippgeberportal)
 *
 * Der Tippgeber vermittelt ausschließlich Kontakte und übernimmt keine
 * Beratung. Die Vergütung wird individuell (Festbetrag € oder Prozent
 * vom notariellen Kaufpreis) im Closing-Tab hinterlegt und in die
 * Vereinbarung übernommen.
 */

const GESELLSCHAFT = {
  name: "OS Immobilien Holding GmbH",
  rechtsform: "GmbH",
  zusatz: "",
  adresse: "Am Ostbahnhof 1, 15749 Mittenwalde",
  vertretenDurch: "die Geschäftsführung",
};

const s = (t: string) =>
  (t ?? "")
    .replace(/„/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'")
    .replace(/–/g, "-").replace(/—/g, "-")
    .replace(/€/g, "EUR")
    .replace(/§/g, "\u00A7");

export type TippgeberEinzelKey = "vertrag" | "anlage_1" | "anlage_2";

export interface TippgeberEinzelCtx {
  bewerber: Bewerber;
  bewerberSignatureDataUrl?: string;
  bewerberSignedAt?: string;
  bewerberSignedOrt?: string;
  kurzSignatureDataUrl?: string;
  kurzSignedAt?: string;
  kurzSignedOrt?: string;
}

interface Tools {
  doc: jsPDF;
  h1: (t: string) => void;
  p: (t: string, opts?: { size?: number; gap?: number }) => void;
  bullet: (items: string[]) => void;
  spacer: (n?: number) => void;
  signatures: (opts?: { rightName?: string; leftOrt?: string; rightOrt?: string; leftDate?: string; rightDate?: string; leftSig?: string; rightSig?: string }) => void;
  akzeptanz: () => void;
  getY: () => number;
  setY: (n: number) => void;
}

function makeTools(doc: jsPDF, logo: string | null, title: string, subtitle: string): Tools {
  const W = 210;
  const H = 297;
  const M = 20;
  const CW = W - 2 * M;
  let y = addBrandedHeader(doc, logo, title, subtitle);

  const ensure = (need: number) => {
    if (y + need > H - 30) {
      doc.addPage();
      y = addBrandedHeader(doc, logo, title, subtitle);
    }
  };
  const h1 = (text: string) => {
    ensure(36);
    y += 2;
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(M, y - 4, CW, 9, 1.5, 1.5, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(M, y - 4, 2, 9, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(text), M + 5, y + 1.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += 12;
  };
  const p: Tools["p"] = (text, opts = {}) => {
    const size = opts.size ?? 9;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(size);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(s(text), CW);
    for (const ln of lines) {
      ensure(5);
      doc.text(ln, M, y);
      y += size * 0.55;
    }
    y += opts.gap ?? 2.5;
    doc.setTextColor(0, 0, 0);
  };
  const bullet: Tools["bullet"] = (items) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    for (const it of items) {
      const lines = doc.splitTextToSize(s(it), CW - 8);
      ensure(lines.length * 4.5 + 1);
      doc.setTextColor(...BRAND.accent);
      doc.text("•", M + 1, y);
      doc.setTextColor(40, 40, 40);
      doc.text(lines, M + 6, y);
      y += lines.length * 4.5 + 0.5;
    }
    y += 2;
    doc.setTextColor(0, 0, 0);
  };
  const spacer: Tools["spacer"] = (n = 3) => { y += n; };

  const signatures: Tools["signatures"] = (o = {}) => {
    ensure(50);
    y += 6;
    const colGap = 10;
    const colW = (CW - colGap) / 2;
    const lx = M;
    const rx = M + colW + colGap;
    const yLine = y + 22;
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.line(lx, yLine, lx + colW, yLine);
    doc.line(rx, yLine, rx + colW, yLine);
    if (o.leftSig) { try { doc.addImage(o.leftSig, "PNG", lx + 3, yLine - 16, 40, 15); } catch {} }
    if (o.rightSig) { try { doc.addImage(o.rightSig, "PNG", rx + 3, yLine - 16, 40, 15); } catch {} }
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(`${GESELLSCHAFT.name}, ${o.leftOrt || "Mittenwalde"}${o.leftDate ? ", " + o.leftDate : ""}`), lx, yLine + 5);
    doc.text(s(`${o.rightName || "Tippgeber"}${o.rightOrt ? ", " + o.rightOrt : ""}${o.rightDate ? ", " + o.rightDate : ""}`), rx, yLine + 5);
    doc.setFontSize(7);
    doc.text("Für die Gesellschaft", lx, yLine + 10);
    doc.text("Tippgeber", rx, yLine + 10);
    doc.setTextColor(0, 0, 0);
    y = yLine + 16;
  };

  const akzeptanz = () => {
    ensure(20);
    y += 4;
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(M, y, CW, 12, 1.5, 1.5, "F");
    doc.setFont(PDF_FONT, "italic");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(
      s("Diese Anlage wird mit Unterzeichnung der Tippgebervereinbarung verbindlicher Vertragsbestandteil. Eine gesonderte Einzelunterschrift ist nicht erforderlich."),
      M + 3,
      y + 7,
      { maxWidth: CW - 6 },
    );
    doc.setTextColor(0, 0, 0);
    doc.setFont(PDF_FONT, "normal");
    y += 16;
  };

  return { doc, h1, p, bullet, spacer, signatures, akzeptanz, getY: () => y, setY: (n) => { y = n; } };
}

function renderParteien(t: Tools, bewerber: Bewerber) {
  const { doc } = t;
  const W = 210, M = 20, CW = W - 2 * M;
  const y0 = t.getY();
  const vpName = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "[Tippgeber]";
  // Vertragsanschrift, nie die Rechnungsadresse (die darf eine Firma sein).
  const vpAdrLines = vertragsAnschriftZeilen(bewerber);
  const vpKontakt = [bewerber.email || "", bewerber.telefon ? `Tel.: ${bewerber.telefon}` : ""].filter(Boolean);

  const colGap = 6;
  const colW = (CW - colGap) / 2;
  const lx = M + 6;
  const rx = M + colW + colGap + 6;
  const leftLines = [
    GESELLSCHAFT.zusatz ? `${GESELLSCHAFT.rechtsform} (${GESELLSCHAFT.zusatz})` : GESELLSCHAFT.rechtsform,
    GESELLSCHAFT.adresse,
    `vertreten durch ${GESELLSCHAFT.vertretenDurch}`,
    '— nachfolgend "Gesellschaft" genannt —',
  ];
  const rightLines = [...vpAdrLines, ...vpKontakt, '— nachfolgend "Tippgeber" genannt —'];
  const measure = (lines: string[]) => lines.reduce((n, l) => n + doc.splitTextToSize(s(l), colW - 8).length, 0);
  const maxLines = Math.max(measure(leftLines), measure(rightLines));
  const boxH = 20 + maxLines * 4 + 4;

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, y0, CW, boxH, 2.5, 2.5, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(M, y0, 2.5, boxH, "F");
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.2);
  doc.line(M + colW + colGap / 2 + 1, y0 + 5, M + colW + colGap / 2 + 1, y0 + boxH - 5);

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  doc.text("VERANTWORTLICHER / GESELLSCHAFT", lx, y0 + 7);
  doc.text("TIPPGEBER", rx, y0 + 7);

  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.primary);
  doc.text(s(GESELLSCHAFT.name), lx, y0 + 15);
  doc.text(s(vpName), rx, y0 + 15);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  const writeCol = (lines: string[], x: number) => {
    let yy = y0 + 22;
    for (const ln of lines) for (const w of doc.splitTextToSize(s(ln), colW - 8)) { doc.text(w, x, yy); yy += 4; }
  };
  writeCol(leftLines, lx);
  writeCol(rightLines, rx);
  doc.setTextColor(0, 0, 0);
  t.setY(y0 + boxH + 4);
}

function verguetungsSatz(b: Bewerber): string {
  const modell = b.tippgeberProvisionsModell;
  const raw = (b.tippgeberProvisionsBetrag || "").trim();
  if (!modell || !raw) {
    return "Die Vergütung des Tippgebers wird im Einzelfall zwischen den Parteien individuell schriftlich (auch per E-Mail) vereinbart und in einer separaten Anlage dokumentiert.";
  }
  if (modell === "euro") {
    return `Der Tippgeber erhält für jeden von ihm nachweislich vermittelten und erfolgreich zum notariellen Abschluss gebrachten Kontakt eine Vergütung in Höhe von ${raw} EUR inkl. der jeweils gültigen Umsatzsteuer (Bruttobetrag).`;
  }
  return `Der Tippgeber erhält für jeden von ihm nachweislich vermittelten und erfolgreich zum notariellen Abschluss gebrachten Kontakt eine Vergütung in Höhe von ${raw} % des notariellen Nettokaufpreises der vermittelten Immobilie inkl. der jeweils gültigen Umsatzsteuer (Bruttobetrag).`;
}

function renderVertrag(t: Tools, bewerber: Bewerber) {
  const { h1, p, bullet } = t;
  renderParteien(t, bewerber);

  h1("§ 1 Vertragsgegenstand");
  p("(1) Die Gesellschaft vertreibt Kapitalanlageimmobilien für Kapitalanleger, Unternehmer, Ärzte, Expats und Gutverdiener.");
  p("(2) Gegenstand dieser Vereinbarung ist ausschließlich die reine Nachweistätigkeit (Tippgeberrolle) durch den Tippgeber, d.h. das einfache Zuführen bzw. Benennen von Interessenten (nachfolgend \"Kontakte\") an die Gesellschaft.");
  p("(3) Der Tippgeber wird ausdrücklich nicht als Handelsvertreter, Makler i.S.d. §§ 34c/34f GewO oder Anlagevermittler tätig.");

  h1("§ 2 Tätigkeit des Tippgebers");
  p("(1) Der Tippgeber übermittelt geeignete Kontakte ausschließlich über das ihm bereitgestellte Tippgeberportal von OS Immobilien (nachfolgend \"Portal\").");
  p("(2) Die Tätigkeit beschränkt sich auf eine erste Vorqualifizierung (Ansprache, Erhebung von Basisdaten wie Name, Kontakt, grober Investitionsrahmen, Zeitfenster) sowie die Einholung des ausdrücklichen Einverständnisses des Kontakts zur Weitergabe der Daten an OS Immobilien.");
  p("(3) Dem Tippgeber ist es ausdrücklich untersagt,");
  bullet([
    "eigenständig Beratung zu Immobilien, Kapitalanlagen, Steuern, Finanzierungen oder Rechtsfragen zu erbringen",
    "Kaufentscheidungen zu beeinflussen, Renditen zu versprechen oder eigene Exposés zu erstellen",
    "im Namen der Gesellschaft rechtsverbindliche Erklärungen abzugeben",
    "Vertragsverhandlungen mit potenziellen Käufern zu führen",
    "Kontakte an Dritte weiterzugeben",
  ]);
  p("(4) Beratung, Objektpräsentation, Finanzierungsvorprüfung, Abschluss- und Notarabwicklung liegen ausschließlich bei der Gesellschaft.");

  h1("§ 3 Selbstständigkeit");
  p("(1) Der Tippgeber wird ausschließlich selbstständig und weisungsfrei tätig. Ein Arbeits-, Handelsvertreter- oder Dienstverhältnis wird nicht begründet.");
  p("(2) Der Tippgeber trägt sämtliche Steuern, Sozialabgaben und Betriebskosten selbst und ist für die ordnungsgemäße Anmeldung seiner Tätigkeit gegenüber Behörden (Finanzamt, ggf. Gewerbeamt) allein verantwortlich.");

  h1("§ 4 Vergütung");
  p(`(1) ${verguetungsSatz(bewerber)}`);
  p("(2) Der Vergütungsanspruch entsteht ausschließlich bei nachweisbarer Kausalität zwischen der Kontaktvermittlung des Tippgebers und dem tatsächlichen Abschluss eines notariellen Kaufvertrages sowie vollständigem Zahlungseingang des Kaufpreises bei der Gesellschaft bzw. Auszahlung der Provision an die Gesellschaft.");
  p("(3) Kein Vergütungsanspruch besteht insbesondere, wenn");
  bullet([
    "der Kontakt der Gesellschaft bereits vor der Zuführung nachweislich bekannt war",
    "der Kaufvertrag rückabgewickelt, angefochten oder widerrufen wird",
    "die Vergütung der Gesellschaft ihrerseits zurückzuzahlen ist (in diesem Fall entfällt bzw. wird eine bereits ausgezahlte Vergütung zurückerstattet)",
  ]);
  p("(4) Abrechnung und Auszahlung erfolgen monatsweise nach vollständigem Zahlungseingang bei der Gesellschaft. Die Auszahlung erfolgt gegen ordnungsgemäße Rechnungsstellung des Tippgebers.");

  h1("§ 5 Datenweitergabe & Einwilligung");
  p("(1) Der Tippgeber darf personenbezogene Daten eines Kontakts nur mit dessen ausdrücklicher, dokumentierter Einwilligung zur Weitergabe an die Gesellschaft übermitteln.");
  p("(2) Der Tippgeber informiert den Kontakt vor der Weitergabe transparent darüber, dass die Daten an OS Immobilien zur weiteren Beratung übermittelt werden.");
  p("(3) Die Details der datenschutzrechtlichen Zusammenarbeit ergeben sich aus Anlage 1 (DSGVO-Auftragsverarbeitungsvereinbarung inkl. Verschwiegenheitserklärung).");

  h1("§ 6 Pflichten des Tippgebers");
  bullet([
    "wahrheitsgemäße und vollständige Angaben",
    "keine unzulässige Werbung, insbesondere keine Kaltakquise ohne Einwilligung",
    "keine irreführenden Renditeversprechen, keine Beratungsaussagen",
    "Einhaltung der Qualitätsvorgaben aus Anlage 2 (Portal- & Qualitätsrichtlinie)",
    "Wahrung der Interessen und des guten Rufs der Gesellschaft",
    "Vertraulichkeit über sämtliche im Rahmen der Zusammenarbeit erhaltenen Informationen",
  ]);

  h1("§ 7 Nutzung des Tippgeberportals");
  p("(1) Die Gesellschaft stellt dem Tippgeber einen persönlichen, nicht übertragbaren Zugang zum Tippgeberportal zur Verfügung. Im Portal kann der Tippgeber Kontakte einreichen sowie den Status der eingereichten Kontakte einsehen.");
  p("(2) Die Zugangsdaten sind streng vertraulich zu behandeln und dürfen nicht an Dritte weitergegeben werden. Verstöße berechtigen die Gesellschaft zur sofortigen Sperrung.");
  p("(3) Die weiteren Nutzungsbedingungen ergeben sich abschließend aus Anlage 2.");

  h1("§ 8 Keine Erlaubnispflicht nach § 34c / § 34f GewO");
  p("Die Tätigkeit des Tippgebers erschöpft sich in einer reinen Nachweisleistung (Namhaftmachung) und begründet nach übereinstimmender Auffassung der Parteien keine erlaubnispflichtige Vermittlungs- oder Beratungstätigkeit. Sollte im Einzelfall dennoch eine Erlaubnis erforderlich sein, hat der Tippgeber diese vor Aufnahme der Tätigkeit auf eigene Kosten einzuholen und der Gesellschaft nachzuweisen.");

  h1("§ 9 Haftung");
  p("(1) Der Tippgeber haftet für eigenes vorsätzliches oder grob fahrlässiges Fehlverhalten, insbesondere für unzulässige Werbung, Beratungshandlungen entgegen § 2 (3) sowie Datenschutzverstöße.");
  p("(2) Die Gesellschaft haftet nur bei Vorsatz oder grober Fahrlässigkeit; bei leichter Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den typischen, vorhersehbaren Schaden.");

  h1("§ 10 Wettbewerb");
  p("Es besteht kein Exklusivitätsverhältnis. Der Tippgeber darf auch für andere Anbieter tätig sein, sofern er dabei keine ihm im Rahmen dieser Zusammenarbeit anvertrauten Informationen, Kontakte oder Materialien der Gesellschaft nutzt.");

  h1("§ 11 Vertragslaufzeit & Kündigung");
  p("(1) Die Vereinbarung beginnt mit Unterzeichnung und läuft auf unbestimmte Zeit.");
  p("(2) Beide Parteien können die Vereinbarung jederzeit mit einer Frist von 14 Tagen zum Monatsende in Textform kündigen.");
  p("(3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt.");
  p("(4) Bereits entstandene Vergütungsansprüche bleiben vom Ende der Vereinbarung unberührt, sofern der zugrundeliegende Abschluss vor Vertragsende erfolgte.");

  h1("§ 12 Datenschutz");
  p("Es gilt die DSGVO sowie die als Anlage 1 beigefügte Auftragsverarbeitungsvereinbarung (AVV) inklusive Verschwiegenheitserklärung.");

  h1("§ 13 Schlussbestimmungen");
  p("(1) Änderungen und Ergänzungen bedürfen der Textform.");
  p("(2) Sollte eine Bestimmung unwirksam sein, bleiben die übrigen Bestimmungen wirksam.");
  p("(3) Es gilt deutsches Recht. Gerichtsstand ist – soweit zulässig – der Sitz der Gesellschaft.");

  h1("Bestandteile dieser Vereinbarung");
  bullet([
    "Anlage 1 – DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheitserklärung",
    "Anlage 2 – Portal- & Qualitätsrichtlinie (Tippgeberportal)",
  ]);
  p("Mit Unterzeichnung dieser Vereinbarung bestätigt der Tippgeber, sämtliche vorstehend genannten Anlagen erhalten, vollständig gelesen und akzeptiert zu haben. Eine gesonderte Einzelunterschrift unter den Anlagen ist nicht erforderlich.");
}

function renderAnlage1AVV(t: Tools, bewerber: Bewerber) {
  const { h1, p, bullet } = t;
  const name = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "[Tippgeber]";
  h1("Präambel");
  p(`Die Parteien schließen diese Auftragsverarbeitungsvereinbarung (AVV) gemäß Art. 28 DSGVO im Rahmen der Zusammenarbeit als Tippgeber gemäß der Tippgebervereinbarung zwischen OS Immobilien und ${name}. OS Immobilien ist Verantwortlicher; der Tippgeber wird als Auftragsverarbeiter tätig, soweit er personenbezogene Daten der Gesellschaft im Portal verarbeitet oder Daten von Kontakten für die Gesellschaft erhebt.`);

  h1("§ 1 Gegenstand & Dauer");
  p("Gegenstand: Erhebung, Übermittlung und portalseitige Verarbeitung personenbezogener Daten von Interessenten für Kapitalanlageimmobilien.");
  p("Dauer: Diese AVV läuft solange die Tippgebervereinbarung besteht und endet automatisch mit deren Beendigung.");

  h1("§ 2 Art & Zweck der Verarbeitung");
  bullet([
    "Erhebung von Basiskontaktdaten (Name, Kontakt, Investitionsinteresse)",
    "Übermittlung der Kontakte an OS Immobilien über das Tippgeberportal",
    "Statusanzeige der eingereichten Kontakte im Portal",
  ]);

  h1("§ 3 Art der Daten & Kategorien Betroffener");
  bullet([
    "Stammdaten (Name, Anschrift, Kontaktdaten)",
    "Investitionsinteresse (grobe Budget-/Zeitangaben)",
    "Kommunikationsdaten (Notizen zur Erstansprache)",
  ]);
  p("Kategorien Betroffener: Interessenten für Kapitalanlageimmobilien, die der Tippgeber der Gesellschaft zuführt.");

  h1("§ 4 Pflichten des Tippgebers als Auftragsverarbeiter");
  bullet([
    "Verarbeitung ausschließlich auf dokumentierte Weisung der Gesellschaft",
    "Einholung und Dokumentation der Einwilligung der Kontakte zur Weitergabe",
    "vertrauliche Behandlung sämtlicher Daten, keine Weitergabe an Dritte",
    "Einhaltung angemessener technischer und organisatorischer Maßnahmen (TOM)",
    "unverzügliche Meldung von Datenpannen (spätestens innerhalb von 24 Stunden)",
    "Unterstützung bei Betroffenenrechten (Auskunft, Berichtigung, Löschung)",
  ]);

  h1("§ 5 Technische und organisatorische Maßnahmen (TOM)");
  bullet([
    "Zugang zum Portal ausschließlich über persönliches Konto mit sicherem Passwort",
    "keine dauerhafte lokale Speicherung von Kontaktdaten außerhalb des Portals",
    "vertrauliche Kommunikation (verschlüsselte Verbindungen)",
    "Sperrung des Zugangs bei Ende der Vereinbarung durch die Gesellschaft",
  ]);

  h1("§ 6 Verschwiegenheit / Vertragsstrafe");
  p("(1) Der Tippgeber verpflichtet sich, sämtliche im Rahmen der Zusammenarbeit bekannt gewordenen Informationen (insbesondere Kontaktdaten, Objektdaten, Preise, Strategien, interne Prozesse) auch nach Ende der Vereinbarung streng vertraulich zu behandeln.");
  p("(2) Für jeden schuldhaften Verstoß gegen diese Verschwiegenheitspflicht ist der Tippgeber verpflichtet, eine Vertragsstrafe in Höhe von bis zu 5.000 EUR je Einzelfall zu zahlen; die Geltendmachung eines weiteren Schadens bleibt vorbehalten.");

  h1("§ 7 Löschung / Rückgabe");
  p("Nach Ende der Zusammenarbeit sind sämtliche noch beim Tippgeber vorhandenen Daten der Gesellschaft unverzüglich zu löschen und die Löschung auf Verlangen schriftlich zu bestätigen.");

  h1("§ 8 Schlussbestimmungen");
  p("Es gilt deutsches Recht. Änderungen bedürfen der Textform. Sollte eine Bestimmung unwirksam sein, bleiben die übrigen unberührt.");
}

function renderAnlage2Portal(t: Tools) {
  const { h1, p, bullet } = t;
  h1("§ 1 Zugang zum Tippgeberportal");
  p("Der Tippgeber erhält einen persönlichen, nicht übertragbaren Zugang. Die Zugangsdaten sind vertraulich zu behandeln. Ein Teilen des Accounts, das Anlegen von Zweitkonten oder das Ausleihen der Zugangsdaten ist untersagt und berechtigt die Gesellschaft zur sofortigen Sperrung.");

  h1("§ 2 Einreichen von Kontakten");
  bullet([
    "Es sind ausschließlich Kontakte einzureichen, die einer Kontaktaufnahme durch OS Immobilien nachweislich zugestimmt haben.",
    "Pflichtangaben je Kontakt: Vor- und Nachname, E-Mail und/oder Telefon, kurze Notiz zum Interesse.",
    "Doppel-Einreichungen sowie bereits laufende Kontakte werden vom System automatisch geprüft.",
    "Erfundene, generierte oder in irgendeiner Form gekaufte Kontakte sind ausdrücklich untersagt.",
  ]);

  h1("§ 3 Qualitätskriterien");
  bullet([
    "Kontakt hat grundsätzliches Interesse an Kapitalanlageimmobilien geäußert",
    "realistische Bonitätsgrundlage (Einkommen / Eigenkapital / Zeitfenster) wurde grob erfragt",
    "Kontakt weiß, dass OS Immobilien sich melden wird",
  ]);
  p("Kontakte, die diesen Kriterien nicht entsprechen, können ohne Vergütungsanspruch abgelehnt werden.");

  h1("§ 4 Statusverfolgung");
  p("Im Portal sieht der Tippgeber jederzeit den aktuellen Status seiner eingereichten Kontakte (z.B. Neuer Lead / Kontaktiert / Erstgespräch / Follow-Up / Abgeschlossen / Verloren). Beratung und Kommunikation mit dem Kontakt liegen ausschließlich bei OS Immobilien.");

  h1("§ 5 Sanktionen");
  p("Bei Verstößen gegen § 1 - § 3 (insbesondere gefakte Kontakte, unzulässige Werbung, fehlende Einwilligungen) kann die Gesellschaft den Portalzugang mit sofortiger Wirkung sperren und die Zusammenarbeit außerordentlich beenden. Bereits entstandene, aber noch nicht abgerechnete Vergütungsansprüche können bei nachweislichen Verstößen entfallen.");

  h1("§ 6 Marke & Kommunikation");
  p("Der Tippgeber darf die Marke \"OS Immobilien\" nur im Rahmen der internen Kontaktansprache erwähnen (z.B. \"Ich kenne bei OS Immobilien jemanden, der sich bei Dir meldet\"). Eigene Werbung mit dem Logo, eigenen Landing Pages oder Ads unter der Marke ist ohne schriftliche Freigabe untersagt.");

  h1("§ 7 Änderungen");
  p("OS Immobilien kann diese Portal- & Qualitätsrichtlinie mit einer Ankündigungsfrist von 4 Wochen anpassen. Die jeweils aktuelle Fassung ist im Portal einsehbar.");
}

function finalize(doc: jsPDF): Blob {
  const total = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, total);
  }
  return doc.output("blob");
}

export async function buildTippgeberVertragPdf(opts: {
  bewerber: Bewerber;
  hrName: string;
  version: number;
}): Promise<Blob> {
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);

  const t1 = makeTools(doc, logo, "Tippgebervereinbarung", "Reine Nachweistätigkeit · OS Immobilien");
  renderVertrag(t1, opts.bewerber);
  t1.signatures({
    rightName: [opts.bewerber.vorname, opts.bewerber.nachname].filter(Boolean).join(" ") || "Tippgeber",
  });

  doc.addPage();
  const t2 = makeTools(doc, logo, "Anlage 1 – DSGVO-AVV", "inkl. Verschwiegenheitserklärung");
  renderAnlage1AVV(t2, opts.bewerber);
  t2.akzeptanz();

  doc.addPage();
  const t3 = makeTools(doc, logo, "Anlage 2 – Portal- & Qualitätsrichtlinie", "Tippgeberportal · Nutzung & Qualität");
  renderAnlage2Portal(t3);
  t3.akzeptanz();

  return finalize(doc);
}

export async function buildTippgeberEinzelPdf(
  key: TippgeberEinzelKey,
  ctx: TippgeberEinzelCtx,
): Promise<Blob> {
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Hausschrift wie im Gesamt-PDF; ohne diesen Aufruf erschienen die
  // Einzeldokumente des Tippgebers in Helvetica.
  await ensureUnicodeFont(doc);
  if (key === "vertrag") {
    const t = makeTools(doc, logo, "Tippgebervereinbarung", "Reine Nachweistätigkeit · OS Immobilien");
    renderVertrag(t, ctx.bewerber);
    const fmtDate = (iso?: string) => { if (!iso) return ""; try { return new Date(iso).toLocaleDateString("de-DE"); } catch { return ""; } };
    t.signatures({
      rightName: [ctx.bewerber.vorname, ctx.bewerber.nachname].filter(Boolean).join(" ") || "Tippgeber",
      leftOrt: ctx.kurzSignedOrt || "Mittenwalde",
      leftDate: fmtDate(ctx.kurzSignedAt),
      leftSig: ctx.kurzSignatureDataUrl,
      rightOrt: ctx.bewerberSignedOrt || ctx.bewerber.ort || "",
      rightDate: fmtDate(ctx.bewerberSignedAt),
      rightSig: ctx.bewerberSignatureDataUrl,
    });
    return finalize(doc);
  }
  if (key === "anlage_1") {
    const t = makeTools(doc, logo, "Anlage 1 – DSGVO-AVV", "inkl. Verschwiegenheitserklärung");
    renderAnlage1AVV(t, ctx.bewerber);
    t.akzeptanz();
    return finalize(doc);
  }
  const t = makeTools(doc, logo, "Anlage 2 – Portal- & Qualitätsrichtlinie", "Tippgeberportal · Nutzung & Qualität");
  renderAnlage2Portal(t);
  t.akzeptanz();
  return finalize(doc);
}