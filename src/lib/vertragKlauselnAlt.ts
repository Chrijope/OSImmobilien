// Die lange Vertragsfassung bis zum 2. September 2026, eingefroren.
//
// Bestandspartner haben diesen Text unterschrieben oder zugeschickt bekommen:
// Hauptvertrag mit 18 Paragraphen (samt § 9a bis § 9f) und sechs bis acht
// Anlagen (AGB, Leistungs- und Preisvereinbarung, AVV, Provisionsordnung,
// CRM- und Leadnutzungsbedingungen, Compliance, Individuelle Regelungen,
// Leadpaket). Für sie bleibt "Vertrag neu erstellen" bei genau diesem Text,
// deshalb liegt er hier unverändert und wird nicht weiterentwickelt. Die
// Weiche steht in vertragKlauseln.ts (Fassung "alt"), die gemeinsamen Helfer
// in vertragKonditionen.ts.
//
// Rechtlicher Hinweis für den Code: Die Klauseln zu Vertragsstrafe (§ 9e),
// Eigentum an Kontakten und Daten- und Geheimnisschutz (§§ 9a bis 9d, § 10),
// Haftung (§ 13) und AVV (Anlage 3) sind nach dem Stand der
// BGH-Rechtsprechung formuliert, aber nicht anwaltlich geprüft.

import {
  LEAD_EINZELPREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_PAKET_PREIS,
  OVERHEAD_AKTIV,
  ZAHLUNGSWEISEN,
  berechneRaten,
  formatPreis,
  type LizenzPaketId,
} from "./lizenzPakete";
import {
  ERSATZLEAD_FRIST_TAGE,
  ERSATZLEAD_UNERREICHBAR,
  SCHUTZFRIST_MONATE,
  SCHUTZFRIST_MONATE_PARTNER,
  VERTRAGSSTRAFE_MAX_EINZEL,
  VERTRAGSSTRAFE_MAX_SYSTEMATISCH,
  anlagenBereichText,
  rechnungsAnschriftZeilen,
  regelAus,
  vertragLaufzeitOffen,
  type KlauselKontext,
  type KlauselTools,
  type LeadPaketDaten,
  type VertragsAnlage,
} from "./vertragKonditionen";

/* ── Feste Titel der Altfassung ───────────────────────────────────────── */

/**
 * Titel der Anlagen, an einer Stelle für Anlagenverzeichnis (§ 18),
 * Anhangliste im Vertrags-Tab, Kopfzeilen der PDFs und Einzeldokumente.
 */
export const ANLAGE_TITEL_ALT: Record<number, string> = {
  1: "AGB",
  2: "Leistungs- und Preisvereinbarung",
  3: "DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheitserklärung",
  4: "Provisionsordnung",
  5: "CRM- & Leadnutzungsbedingungen",
  6: "Compliance & Beratungsrichtlinien",
  7: "Team Lead / Lizenzpartner · Struktur- & Overhead-Regelung",
  8: "Individuelle Regelungen (§ 10 Kunden-/Partnerschutz · Erklärte Tätigkeiten)",
  9: "Leadpaket-Vereinbarung",
};

/** Titel der Anlage 2 im Partner-Vertrag (2 % Honorar, Altpaket). */
export const ANLAGE_2_TITEL_HONORAR_ALT = "Honorarvereinbarung (2 % Honorar auf Kaufpreis)";

/**
 * Titel der optionalen Leadpaket-Vereinbarung, an einer Stelle für
 * Vertragsgenerator, Anhangliste und Einzeldokumente. Die Nummer 9 ist fest
 * vergeben, damit sie nie mit Anlage 7 (Struktur) oder Anlage 8
 * (Individualfassung) kollidiert.
 */
export const LEADPAKET_ANLAGE_NUMMER_ALT = "Anlage 9";
export const LEADPAKET_ANLAGE_TITEL_ALT = ANLAGE_TITEL_ALT[9];

/**
 * Paket-spezifische Leadkontingent- und Leadkostenklauseln. Werden in
 * Anlage 2 § 5 und Anlage 5 § 5 gedruckt; der Hauptvertrag verweist nur
 * darauf. Lag früher im Vertragsgenerator, der sie weiter re-exportiert.
 */
export const LEAD_KLAUSELN_ALT: Record<LizenzPaketId, string[]> = {
  // Neues Leadmodell: kein Start-Kontingent, stattdessen optionaler Leadkauf.
  junior: [
    "Im Paket Vertriebspartner ist kein festes Start-Leadkontingent enthalten.",
    `Optional kann der Vertriebspartner jederzeit ein Leadpaket erwerben: ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, jederzeit erneut buchbar. Einzel-Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead sind erst nach der ersten Paketbuchung möglich.`,
    `Ist ein Leadpaket gebucht, gelten ergänzend die Regelungen der Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER_ALT}), insbesondere Qualitätszusage und Ersatzlead-Regelung.`,
    "Eigenakquise und Empfehlungsgeschäft werden ausdrücklich empfohlen; ein Anspruch auf Leadzuteilung ohne gebuchtes Leadpaket besteht nicht.",
  ],
  // Lead-Berater: Leads werden gestellt statt verkauft.
  lead_berater: [
    "Im Paket Lead-Berater stellt die Gesellschaft dem Vertriebspartner Leads zur Unterstützung seiner eigenen Akquisition bereit.",
    "Die Bereitstellung erfolgt nach Verfügbarkeit und billigem Ermessen der Gesellschaft, ohne definierte Stückzahl. Ein Anspruch auf eine bestimmte Lead-Menge, auf eine regelmäßige Zuteilung oder auf Leads bestimmter Herkunft besteht ausdrücklich nicht; § 4 des Hauptvertrages bleibt unberührt.",
    `Ein entgeltlicher Erwerb von Leadpaketen oder Einzel-Leads ist in diesem Paket nicht vorgesehen; eine Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER_ALT}) wird nicht geschlossen.`,
    "Eigenakquise und Empfehlungsgeschäft bleiben ausdrücklich empfohlen; die bereitgestellten Leads dienen lediglich der Unterstützung.",
  ],
  lead: [
    "Im Paket Lead Partner sind 30 Start-Leads inklusive.",
    "Weitere Leads werden 1:1 zum marktüblichen Leadpreis ohne Aufschlag an den Vertriebspartner weitergegeben.",
  ],
  team_builder: [
    "Im Paket Team Lead sind 80 Start-Leads inklusive.",
    "Weitere Leads werden 1:1 zum marktüblichen Leadpreis ohne Aufschlag an den Vertriebspartner weitergegeben.",
  ],
  enterprise: [
    "Im Paket Lizenzpartner übernimmt die Gesellschaft in den ersten 12 Monaten ab Vertragsbeginn sämtliche Leadkosten vollständig.",
    "Ab dem 13. Monat werden die Leadkosten zum marktüblichen Leadpreis 1:1 ohne Aufschlag an den Vertriebspartner weitergegeben.",
  ],
  partner_2: [
    "Im Partner-Vertrag ist kein festes Start-Leadkontingent enthalten.",
    "Leads werden individuell und nach Verfügbarkeit zugewiesen; ein Anspruch auf bestimmte Leadmengen besteht nicht.",
    "Eigenakquise und Empfehlungsgeschäft werden ausdrücklich empfohlen.",
  ],
  tippgeber: [
    "Als Tippgeber besteht kein Leadkontingent - der Tippgeber übermittelt selbst qualifizierte Kontakte an die Gesellschaft.",
    "Eine Auszahlung fester Leadkosten oder Leadpauschalen erfolgt nicht.",
  ],
};

/* ── Anlagenverzeichnis ───────────────────────────────────────────────── */
/**
 * Welche Anlagen gehören zu einem Vertrag? Die eine Quelle für § 18, den
 * Hinweiskasten vor der Unterschrift, die gedruckten Anlagen des Gesamt-PDFs
 * und die Anhangliste im Vertrags-Tab (getVertragsAnhaenge).
 */
export function vertragsAnlagenAlt(
  paketId: LizenzPaketId | string | "",
  individuelleVertragsFassung: boolean = false,
  hatLeadPaket: boolean = false,
): VertragsAnlage[] {
  if (paketId === "tippgeber") {
    return [
      { nummer: 1, titel: "DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl. Verschwiegenheitserklärung" },
      { nummer: 2, titel: "Portal- & Qualitätsrichtlinie (Tippgeberportal)" },
    ];
  }
  const liste: VertragsAnlage[] = [
    { nummer: 1, titel: ANLAGE_TITEL_ALT[1] },
    { nummer: 2, titel: paketId === "partner_2" ? ANLAGE_2_TITEL_HONORAR_ALT : ANLAGE_TITEL_ALT[2] },
    { nummer: 3, titel: ANLAGE_TITEL_ALT[3] },
    { nummer: 4, titel: ANLAGE_TITEL_ALT[4] },
    { nummer: 5, titel: ANLAGE_TITEL_ALT[5] },
    { nummer: 6, titel: ANLAGE_TITEL_ALT[6] },
  ];
  // Anlage 7 gibt es nur, solange die Overhead-Provision aktiv ist.
  if (OVERHEAD_AKTIV && (paketId === "team_builder" || paketId === "enterprise")) {
    liste.push({ nummer: 7, titel: ANLAGE_TITEL_ALT[7] });
  }
  if (individuelleVertragsFassung) liste.push({ nummer: 8, titel: ANLAGE_TITEL_ALT[8] });
  if (hatLeadPaket) liste.push({ nummer: 9, titel: ANLAGE_TITEL_ALT[9] });
  return liste;
}

/** Text des Hinweiskastens vor der Unterschrift des Hauptvertrags. */
export function akzeptanzHinweisTextAlt(ctx: KlauselKontext): string {
  const anlagen = vertragsAnlagenAlt(ctx.paket.id, !!ctx.bewerber.individuelleVertragsFassung, !!ctx.bewerber.leadPaket);
  const bereich = anlagenBereichText(anlagen.map((a) => a.nummer));
  return `Mit Unterzeichnung dieses Hauptvertrages bestätigt der Vertriebspartner ausdrücklich, sämtliche Anlagen ${bereich} erhalten, vollständig gelesen, verstanden und uneingeschränkt akzeptiert zu haben. Eine gesonderte Einzelunterschrift unter den Anlagen ist nicht erforderlich.`;
}

/** Kopfzeile einer Anlage im PDF: Titel und Untertitel. */
export function anlageKopfAlt(nummer: number, ctx: KlauselKontext): { titel: string; untertitel: string } {
  const { paket, bewerber } = ctx;
  const titel = `Anlage ${nummer}`;
  switch (nummer) {
    case 1: return { titel, untertitel: "AGB · Allgemeine Geschäftsbedingungen" };
    case 2: return {
      titel,
      untertitel: paket.partnerHonorar
        ? `Honorarvereinbarung · ${paket.provisionssatz} % Honorar auf den notariellen Kaufpreis`
        : `${ANLAGE_TITEL_ALT[2]} · Paket "${paket.titel}"`,
    };
    case 3: return { titel, untertitel: "AVV · DSGVO-Auftragsverarbeitungsvereinbarung gemäß Art. 28 DSGVO inkl. Verschwiegenheitserklärung" };
    case 4: return { titel, untertitel: "Provisionsordnung · Verbindliche Provisionsregelung" };
    case 5: return { titel, untertitel: "CRM- & Leadnutzungsbedingungen · Nutzung von CRM-System und Leads" };
    case 6: return { titel, untertitel: "Compliance & Beratungsrichtlinien · Vorgaben für Beratung & Kommunikation" };
    case 7: return { titel, untertitel: "Struktur- & Overhead-Regelung · Team Lead / Lizenzpartner" };
    case 8: return { titel, untertitel: "Individuelle Regelungen · § 10 Kunden- und Partnerschutz · Erklärte Tätigkeiten" };
    case 9: return {
      titel: LEADPAKET_ANLAGE_NUMMER_ALT,
      untertitel: bewerber.leadPaket
        ? `${LEADPAKET_ANLAGE_TITEL_ALT} · ${formatPreis(bewerber.leadPaket.betrag)} netto für ${bewerber.leadPaket.anzahl} qualifizierte Leads`
        : LEADPAKET_ANLAGE_TITEL_ALT,
    };
    default: return { titel, untertitel: "" };
  }
}

/** Rendert den Inhalt einer Anlage anhand ihrer Nummer. */
export function renderAnlageNachNummerAlt(nummer: number, t: KlauselTools, ctx: KlauselKontext): void {
  switch (nummer) {
    case 1: return renderAnlage1AgbAlt(t, ctx);
    case 2: return renderAnlage2LeistungAlt(t, ctx);
    case 3: return renderAnlage3AvvAlt(t, ctx);
    case 4: return renderAnlage4ProvisionAlt(t, ctx);
    case 5: return renderAnlage5CrmAlt(t, ctx);
    case 6: return renderAnlage6ComplianceAlt(t);
    case 7: return renderAnlage7StrukturAlt(t);
    case 8: return renderAnlage8IndividuellAlt(t, ctx);
    case 9: {
      if (!ctx.bewerber.leadPaket) throw new Error("Für die Leadpaket-Vereinbarung muss am Bewerber ein Leadpaket hinterlegt sein.");
      return renderLeadpaketAnlageAlt(t, ctx.bewerber.leadPaket);
    }
    default: throw new Error(`Unbekannte Anlage ${nummer}`);
  }
}

/* ── Anlage 9: Leadpaket ──────────────────────────────────────────────── */

/**
 * Rendert den Inhalt der Leadpaket-Vereinbarung (Anlage 9). Sie wird nur
 * erzeugt, wenn am Bewerber ein Leadpaket hinterlegt ist (bewerber.leadPaket).
 */
export function renderLeadpaketAnlageAlt(
  t: Pick<KlauselTools, "h1" | "p" | "bullet">,
  leadPaket: LeadPaketDaten,
): void {
  const { h1, p, bullet } = t;

  h1("§ 1 Gegenstand und Erwerb");
  p(`(1) Der Vertriebspartner erwirbt ein Leadpaket zum Preis von ${formatPreis(leadPaket.betrag)} netto zzgl. der jeweils gültigen Umsatzsteuer. Das Paket umfasst ${leadPaket.anzahl} qualifizierte Leads.`);
  p(`(2) Es gilt das Leadmodell der Gesellschaft: Ein Leadpaket kostet ${formatPreis(LEAD_PAKET_PREIS)} netto und umfasst ${LEAD_PAKET_ANZAHL} qualifizierte Leads. Der Einzelkauf weiterer Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead ist erst nach der ersten Paketbuchung möglich.`);
  p("(3) Der Paketbetrag wird von der Gesellschaft als Werbebudget für die Gewinnung der Leads eingesetzt.");

  h1("§ 2 Qualitätszusage");
  p("Die Gesellschaft sichert für jeden zugeteilten Lead zu:");
  bullet([
    "Der Lead ist durch die Gesellschaft vorqualifiziert.",
    "Der Lead hat echtes Interesse an einer Kapitalanlageimmobilie.",
    "Der Lead verfügt über ein Nettoeinkommen von mindestens 3.000 Euro monatlich.",
    "Der Lead verfügt über Eigenkapital.",
  ]);

  h1("§ 3 Ersatzleads");
  p("(1) Der Vertriebspartner erhält einen Ersatzlead, wenn einer der folgenden Fälle vorliegt:");
  bullet([
    `(a) ${ERSATZLEAD_UNERREICHBAR}`,
    "(b) Die Kontaktdaten des Leads sind falsch.",
    "(c) Der Lead ist eine Dublette.",
    "(d) Der Lead verfehlt die in § 2 zugesicherten Kriterien.",
    "(e) Der Lead hat sich versehentlich eingetragen oder seine Eintragung widerrufen.",
  ]);
  p("(2) Maßgeblich für die Beurteilung ist das Kontaktprotokoll im CRM-System der Gesellschaft. Kontaktversuche, die dort nicht dokumentiert sind, bleiben unberücksichtigt.");
  p(`(3) Eine Reklamation ist binnen ${ERSATZLEAD_FRIST_TAGE} Tagen nach Zuteilung des Leads in Textform gegenüber der Gesellschaft zu erklären.`);
  p("(4) Diese Ersatzlead-Regelung ist mit Anlage 5 § 5a inhaltsgleich; beide Anlagen regeln den Ersatz nicht erreichbarer oder fehlerhafter Leads übereinstimmend.");

  h1("§ 4 Kein Ersatz bei ausbleibenden Abschlüssen");
  p("Ein Anspruch auf Ersatzleads oder Erstattung besteht nicht, wenn ein Lead trotz erfüllter Qualitätszusage nicht zu einem Abschluss führt. Die Gesellschaft schuldet qualifizierte Leads, keinen Vermittlungserfolg.");

  h1("§ 5 Weitere Pakete und Einzel-Leads");
  p("(1) Weitere Leadpakete können jederzeit erneut gebucht werden.");
  p(`(2) Der Erwerb einzelner Leads zu ${formatPreis(LEAD_EINZELPREIS)} netto je Lead ist erst nach der ersten Paketbuchung möglich.`);

  h1("§ 6 Zweckbindung und Qualitätskontrolle");
  p("(1) Die zugeteilten Leads dürfen ausschließlich für die Vermittlung von Kapitalanlageimmobilien über die Gesellschaft eingesetzt werden. Eine anderweitige Nutzung oder Weitergabe ist untersagt; ergänzend gelten Anlage 5 sowie die §§ 9 und 9a bis 9f des Hauptvertrages.");
  p("(2) Die Gesellschaft ist berechtigt, stichprobenartig Qualitätscheck-Anrufe bei zugeteilten Leads durchzuführen.");
}

/* ── Hauptvertrag ─────────────────────────────────────────────────────── */

/**
 * Rendert den Hauptvertrag von Paragraf 1 bis Paragraf 18. Unterschriften,
 * Kopfzeilen und Anlagen bleiben Sache des jeweiligen Erzeugers.
 */
export function renderHauptvertragAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet, spacer, ensure, infoBox } = t;
  const { bewerber, paket, hasCrmGebuehr, hasOverride, effektiverSatzText } = ctx;
  const anwendungsregel = regelAus(ctx);
  // Eine Laufzeit für Vertrag und CRM-Nutzung. Bei den Paketen mit
  // Vertragsschaltern entscheidet der Bewerber, sonst das Paket.
  const laufzeitOffen = vertragLaufzeitOffen(paket.id, bewerber);
  const mindestlaufzeit = laufzeitOffen ? 0 : (paket.laufzeitMonate > 0 ? paket.laufzeitMonate : 12);
  const schutzMonate = paket.partnerHonorar ? SCHUTZFRIST_MONATE_PARTNER : SCHUTZFRIST_MONATE;
  const anlage2 = paket.partnerHonorar ? "Honorarvereinbarung" : ANLAGE_TITEL_ALT[2];

  // ─── §1 ───
  h1("§ 1 Vertragsgegenstand");
  p("(1) Die Gesellschaft vertreibt Kapitalanlageimmobilien, insbesondere:");
  bullet([
    "sanierte Bestandsimmobilien",
    "WG-/Co-Living-Konzepte",
    "KfW40-/QNG-Neubauprojekte",
    "steueroptimierte Immobilieninvestments",
    "Immobilienlösungen für Kapitalanleger, Unternehmer, Ärzte, Expats und Gutverdiener",
  ]);
  p("(2) Der Vertriebspartner wird als selbstständiger Handelsvertreter gemäß §§ 84 ff. HGB tätig.");
  p("(3) Gegenstand dieses Vertrages ist die Vermittlung und/oder Zuführung von Interessenten für Kapitalanlageimmobilien der Gesellschaft.");
  p("(4) Der Vertriebspartner ist weder Arbeitnehmer noch Franchisenehmer der Gesellschaft.");

  // ─── §2 ───
  h1("§ 2 Selbstständigkeit");
  p("(1) Der Vertriebspartner handelt selbstständig und eigenverantwortlich.");
  p("(2) Er trägt sämtliche Steuern, Sozialabgaben, Versicherungen und Betriebskosten selbst.");
  p("(3) Der Vertriebspartner ist nicht berechtigt, rechtsverbindliche Erklärungen im Namen der Gesellschaft abzugeben, sofern keine schriftliche Vollmacht vorliegt.");

  // ─── §3 Vertragsmodell ───
  if (paket.partnerHonorar) {
    h1("§ 3 Vertragsmodell & Honorar");
    p("(1) Die Zusammenarbeit zwischen Gesellschaft und Vertriebspartner erfolgt ausschließlich auf erfolgsabhängiger Honorarbasis. Es wird keine Onboardinggebühr erhoben.");
    p(`(2) Für jede vom Vertriebspartner wirksam vermittelte Kapitalanlageimmobilie erhält dieser ein Honorar in Höhe von ${paket.provisionssatz} % des notariellen Kaufpreises der vermittelten Immobilie. Die verbindlichen Konditionen ergeben sich abschließend aus Anlage 2 ("Honorarvereinbarung") in Verbindung mit Anlage 4 ("Provisionsordnung").`);
    p("(3) Leadkontingent und Leadkostenmodell ergeben sich aus Anlage 5 (\"CRM- & Leadnutzungsbedingungen\") in Verbindung mit Anlage 2.");
    p("(4) Sämtliche paketspezifischen Konditionen sind ausschließlich in den vorgenannten Anlagen geregelt.");
  } else {
    h1(paket.preis > 0 ? "§ 3 Vertragsmodell & Paket" : "§ 3 Vertragsmodell");
    p(paket.preis > 0
      ? "(1) Die Zusammenarbeit zwischen Gesellschaft und Vertriebspartner erfolgt auf Basis einer einmaligen Onboardinggebühr für die Bereitstellung der Vertriebsinfrastruktur sowie nachfolgender, erfolgsabhängiger Provisionen."
      : hasCrmGebuehr
        ? `(1) Die Vergütung des Vertriebspartners erfolgt ausschließlich erfolgsabhängig über Provisionen. Für die Bereitstellung und laufende Nutzung der Vertriebsinfrastruktur entrichtet der Vertriebspartner die monatliche CRM-Systemgebühr in Höhe von ${formatPreis(paket.monatlich)} brutto/Monat inkl. der jeweils gültigen gesetzlichen Umsatzsteuer nach § 4 dieses Vertrages. Ein Einmalbetrag für den Einstieg wird nicht vereinbart.`
        : "(1) Die Vergütung des Vertriebspartners erfolgt ausschließlich erfolgsabhängig über Provisionen. Die Vertriebsinfrastruktur wird für diesen Vertrag ohne gesonderte Vergütung bereitgestellt. Weder ein Einmalbetrag für den Einstieg noch eine laufende Gebühr wird vereinbart.");
    p(paket.preis > 0
      ? `(2) Der Vertriebspartner bucht eines der von der Gesellschaft angebotenen Pakete. Das konkret gebuchte Paket, der enthaltene Leistungsumfang, die Höhe der einmaligen Onboardinggebühr, die Zahlungsweise sowie der verbindliche Ratenplan ergeben sich abschließend aus Anlage 2 ("${anlage2}"). Anlage 2 ist verbindlicher Bestandteil dieses Vertrages.`
      : `(2) Der Vertriebspartner bucht eines der von der Gesellschaft angebotenen Pakete. Das konkret gebuchte Paket, der enthaltene Leistungsumfang und die vereinbarten Kosten ergeben sich abschließend aus Anlage 2 ("${anlage2}"). Anlage 2 ist verbindlicher Bestandteil dieses Vertrages.`);
    p(OVERHEAD_AKTIV
      ? "(3) Die zum gebuchten Paket gehörenden Provisionssätze (Standardprovision sowie etwaige Strukturvergütung) ergeben sich abschließend aus Anlage 4 (\"Provisionsordnung\")."
      : "(3) Die zum gebuchten Paket gehörenden Provisionssätze ergeben sich abschließend aus Anlage 4 (\"Provisionsordnung\").");
    p("(4) Leadkontingent und Leadkostenmodell des gebuchten Pakets ergeben sich aus Anlage 5 (\"CRM- & Leadnutzungsbedingungen\") in Verbindung mit Anlage 2.");
    p("(5) Der Hauptvertrag ist inhaltlich für sämtliche Pakete identisch. Sämtliche paketspezifischen Konditionen sind ausschließlich in den vorgenannten Anlagen geregelt.");
  }

  infoBox(
    paket.partnerHonorar ? `Vertragstyp: ${paket.titel}` : `Gebuchtes Paket: ${paket.titel}`,
    paket.partnerHonorar
      ? "Verbindliche Konditionen und Leistungsumfang: siehe Anlage 2."
      : "Verbindliche Konditionen, Leistungsumfang und Zahlungsplan: siehe Anlage 2.",
  );

  // ─── §4 Leistungen ───
  h1("§ 4 Leistungsumfang der Gesellschaft");
  p("(1) Die Gesellschaft stellt dem Vertriebspartner eine vollständige Vertriebsinfrastruktur für die Vermittlung von Kapitalanlageimmobilien bereit. Diese umfasst insbesondere:");
  bullet([
    "CRM-System more.immo inkl. Pipeline-, Lead- und Kundenverwaltung",
    "Objektzugänge (eigene und Drittobjekte)",
    "Academy mit Schulungen, Webinaren und Pflichtmodulen",
    "Verkaufsskripte, Beratungsleitfäden und Vorlagen",
    "Beratungs- und Closing-Präsentationen",
    "Finanzierungsvorprüfung und Bankenkontakte",
    "Leadmanagement",
    "Recruiting- und Teamaufbau-Strukturen",
    "laufenden Support und Coaching",
  ]);
  p("(2) Der konkrete, paketabhängige Leistungs- und Funktionsumfang (insbesondere Leadkontingent, Pflichtmodule, Whitelabel-Optionen, Strukturfunktionen) ergibt sich abschließend aus Anlage 2.");
  if (!hasCrmGebuehr) {
    p("(3) Die Nutzung des CRM-Systems ist während der gesamten aktiven Zusammenarbeit vollständig abgedeckt; monatliche oder laufende CRM-Folgekosten entstehen ausdrücklich nicht.");
    p("(4) Ein Anspruch auf eine bestimmte Lead-, Objekt- oder Schulungsmenge sowie auf bestimmte Umsätze oder Abschlüsse besteht ausdrücklich nicht.");
  } else {
    p(`(3) Der Vertriebspartner erhält für die Dauer dieses Vertrags ein nicht-ausschließliches, nicht übertragbares Nutzungsrecht am MOREImmo-CRM-System (more.immo) inkl. der vereinbarten Module, Automatisierungen, Hosting und Wartung („CRM-Leistungen"). Hierfür entrichtet er eine monatliche CRM-Systemgebühr in Höhe von ${formatPreis(paket.monatlich)} brutto/Monat inkl. der jeweils gültigen gesetzlichen Umsatzsteuer.${paket.preis > 0 ? " Diese Gebühr ist unabhängig von der einmaligen Onboardinggebühr gemäß § 5." : ""}`);
    // Eine Laufzeit: Die CRM-Nutzung hat keine eigene Mindestlaufzeit und keine
    // eigene Kündigung mehr, sie hängt am Vertrag (§ 14). Vorher standen zwei
    // getrennte, gleich lange Laufzeiten im Vertrag.
    p(`(4) Die CRM-Nutzung ist an diesen Vertrag gebunden: Sie beginnt mit Vertragsbeginn, teilt Laufzeit, Mindestlaufzeit und Kündigung dieses Vertrages nach § 14 und endet mit dessen Beendigung. Eine gesonderte Laufzeit oder Kündigung der CRM-Nutzung gibt es nicht. Die CRM-Systemgebühr ist für die gesamte Vertragsdauer geschuldet${mindestlaufzeit > 0 ? `, bei der Mindestlaufzeit nach § 14 also mindestens für ${mindestlaufzeit} Monate` : "; eine Mindestlaufzeit besteht nicht (individuell vereinbart)"}.`);
    p("(5) Die CRM-Systemgebühr wird monatlich im Voraus per Überweisung oder SEPA-Lastschrift abgerechnet; bei unterjährigem Beginn erfolgt eine pro-rata-temporis-Abrechnung.");
    p("(6) Die Gesellschaft ist berechtigt, die CRM-Systemgebühr mit einer Ankündigungsfrist von 3 Monaten zum Monatsende anzupassen. Im Fall einer Erhöhung steht dem Vertriebspartner ein Sonderkündigungsrecht zum Wirksamkeitsdatum der Anpassung zu.");
    p("(7) Einmalige Setup- und Leadkosten gemäß § 5 bzw. Anlage 2 sind von der CRM-Systemgebühr unabhängig und werden bei einer Kündigung nicht anteilig erstattet.");
    p("(8) Ein Anspruch auf eine bestimmte Lead-, Objekt- oder Schulungsmenge sowie auf bestimmte Umsätze oder Abschlüsse besteht ausdrücklich nicht.");
  }

  // ─── §5 Onboardinggebühr / CRM-Gebühr ───
  if (paket.partnerHonorar) {
    h1("§ 5 Honorar");
    p(`(1) Für jede vom Vertriebspartner wirksam vermittelte Kapitalanlageimmobilie erhält dieser ein Honorar in Höhe von ${paket.provisionssatz} % des notariellen Kaufpreises der vermittelten Immobilie inkl. der jeweils gültigen Umsatzsteuer (Bruttobetrag).`);
    p("(2) Eine Onboardinggebühr, Eintrittsgebühr oder sonstige laufende Pauschalvergütung wird ausdrücklich nicht erhoben.");
    p("(3) Die Abrechnung und Auszahlung erfolgt gemäß Anlage 4 (\"Provisionsordnung\"); der Honoraranspruch entsteht erst, wenn die Gesellschaft die zugrundeliegende Provision vom Bauträger / Verkäufer vollständig vereinnahmt hat.");
  } else if (paket.preis > 0) {
    h1("§ 5 Onboardinggebühr & Zahlungsplan");
    p("(1) Für die Inanspruchnahme der in § 4 beschriebenen Vertriebsinfrastruktur entrichtet der Vertriebspartner eine einmalige Onboardinggebühr zzgl. der jeweils gültigen Umsatzsteuer.");
    p(`(2) Höhe der Onboardinggebühr, gewählte Zahlungsweise (Einmalzahlung oder Ratenzahlung) sowie der verbindliche Ratenplan inklusive Fälligkeiten ergeben sich aus Anlage 2 ("${anlage2}"). Anlage 2 wird mit Unterzeichnung dieses Hauptvertrages verbindlicher Bestandteil des Gesamtvertragswerks.`);
    p("(3) Die Zahlung erfolgt per Überweisung auf das auf der separat zugesandten Rechnung angegebene Konto der Gesellschaft.");
    p("(4) Die Onboardinggebühr dient ausschließlich der Vergütung der von der Gesellschaft bereitgestellten Vertriebsinfrastruktur, insbesondere CRM-System, Academy, Schulungen, Vertriebsunterlagen, Objektzugänge, Leadmanagement, Finanzierungsvorprüfung sowie Supportleistungen im Umfang des in Anlage 2 gebuchten Pakets.");
    p("(5) Die Onboardinggebühr steht in keinem Zusammenhang mit dem Provisionsanspruch des Vertriebspartners als Handelsvertreter. Die Zahlung der Onboardinggebühr begründet insbesondere keinen Anspruch auf bestimmte Umsätze, Abschlüsse, Provisionen, Leads oder wirtschaftliche Erfolge.");
    p("(6) Die Onboardinggebühr ist ein Entgelt für die laufende Bereitstellung der Vertriebsinfrastruktur und nicht an einen wirtschaftlichen Erfolg gekoppelt. Eine Rückerstattung bei vorzeitiger Vertragsbeendigung durch den Vertriebspartner ist - soweit gesetzlich zulässig - ausgeschlossen.");
  } else if (hasCrmGebuehr) {
    h1("§ 5 CRM-Systemgebühr (keine Onboardinggebühr)");
    p(`(1) Im Paket "${paket.titel}" wird keine einmalige Onboardinggebühr erhoben. Es fällt ausschließlich die in § 4 (3) bis (7) geregelte monatliche CRM-Systemgebühr in Höhe von ${formatPreis(paket.monatlich)} brutto/Monat inkl. USt. an${mindestlaufzeit > 0 ? `; die Mindestlaufzeit nach § 14 beträgt ${mindestlaufzeit} Monate` : "; eine Mindestlaufzeit besteht nicht (individuell vereinbart)"}.`);
    p(mindestlaufzeit > 0
      ? "(2) Laufzeit, Mindestlaufzeit und Kündigung gelten einheitlich für diesen Vertrag und die CRM-Nutzung und richten sich abschließend nach § 14; nach Ablauf der Mindestlaufzeit läuft der Vertrag auf unbestimmte Zeit weiter und ist mit einer Frist von einem Monat zum Monatsende in Textform an office@more.immo kündbar."
      : "(2) Laufzeit und Kündigung gelten einheitlich für diesen Vertrag und die CRM-Nutzung und richten sich abschließend nach § 14; der Vertrag läuft auf unbestimmte Zeit und ist jederzeit mit einer Frist von einem Monat zum Monatsende in Textform an office@more.immo kündbar.");
    p("(3) Die Abrechnung der CRM-Systemgebühr erfolgt monatlich im Voraus. Die jeweils aktuellen Konditionen ergeben sich aus Anlage 2.");
  } else {
    h1("§ 5 Keine Onboarding- und keine CRM-Systemgebühr");
    p(`(1) Für das Paket "${paket.titel}" wurde individuell vereinbart, dass weder eine einmalige Onboardinggebühr noch eine monatliche CRM-Systemgebühr erhoben wird.`);
    p("(2) Die monatliche CRM-Systemgebühr entfällt für diesen Vertriebspartner. Die Bereitstellung von CRM, Pipeline, Academy und Support erfolgt unentgeltlich.");
    p("(3) Die Nutzung des CRM-Systems more.immo sowie der übrigen in § 4 (1) genannten Vertriebsinfrastruktur ist während der gesamten aktiven Zusammenarbeit vollständig abgedeckt; laufende oder wiederkehrende Gebühren entstehen ausdrücklich nicht.");
    p("(4) Die Vergütung des Vertriebspartners erfolgt ausschließlich erfolgsabhängig gemäß § 8 dieses Vertrages und Anlage 4 (Provisionsordnung).");
    // Ohne Gebühr keine Bindung: Das ist die ausdrückliche Folge des Schalters.
    p("(5) Da keine laufende Gebühr geschuldet ist, wird der Vertriebspartner auch nicht an eine Mindestlaufzeit gebunden; der Vertrag läuft nach § 14 auf unbestimmte Zeit und ist monatlich kündbar.");
  }

  // ─── §6 Tippgeberregelung ───
  h1("§ 6 Tippgeberregelung & Erlaubnispflicht (§34c GewO)");
  p("(1) Tippgeber dürfen ausschließlich Kontakte vermitteln und insbesondere nicht beraten, Objektgespräche führen, Finanzierungen vermitteln, Vertragsverhandlungen führen oder Kaufentscheidungen beeinflussen.");
  p("(2) Soweit die Tätigkeit des Vertriebspartners eine Erlaubnis nach §34c GewO erfordert, weist der Vertriebspartner diese vor Aufnahme der Tätigkeit nach. Ohne Erlaubnis ist ausschließlich eine Tätigkeit als Tippgeber zulässig.");
  p("(3) Der Vertriebspartner haftet selbst für die Einhaltung regulatorischer Vorgaben.");

  // ─── §7 Pflichten ───
  h1("§ 7 Pflichten des Vertriebspartners");
  p("Der Vertriebspartner verpflichtet sich insbesondere:");
  bullet([
    "die Interessen der Gesellschaft zu wahren",
    "ausschließlich wahrheitsgemäße Aussagen zu treffen",
    "gesetzliche Vorschriften einzuhalten",
    "keine unzulässigen Werbeaussagen zu tätigen",
    "Datenschutzvorgaben einzuhalten",
    "keine eigenen Exposés ohne Freigabe zu erstellen",
    "vertrauliche Informationen geheim zu halten",
    "keine Wettbewerbsverstöße zu begehen",
  ]);

  // ─── §8 Provision ───
  h1("§ 8 Provision");
  p("(1) Der Vertriebspartner erhält für jede von ihm wirksam vermittelte Kapitalanlageimmobilie eine erfolgsabhängige Provision. Berechnungsgrundlage ist der notarielle Kaufpreis der vermittelten Immobilie.");
  p(OVERHEAD_AKTIV
    ? "(1.1) Sämtliche in diesem Vertrag und seinen Anlagen genannten Provisions-, Honorar- und Override-Sätze verstehen sich als Bruttobeträge inkl. der jeweils gültigen gesetzlichen Umsatzsteuer."
    : "(1.1) Sämtliche in diesem Vertrag und seinen Anlagen genannten Provisions- und Honorarsätze verstehen sich als Bruttobeträge inkl. der jeweils gültigen gesetzlichen Umsatzsteuer.");
  if (hasOverride) {
    p(`(1a) Abweichend vom Standardsatz des Pakets "${paket.titel}" (${paket.provisionssatz}%) gelten in diesem Vertrag folgende individuell vereinbarte Provisionssätze: ${effektiverSatzText}. ${anwendungsregel} Diese Sätze gehen jeder anderen Provisionsangabe in diesem Vertrag und seinen Anlagen vor.`);
  }
  p("(1b) Der ausgewiesene Verkaufs- bzw. notarielle Kaufpreis eines Objekts kann in Abstimmung zwischen Vertriebspartner und Gesellschaft im Rahmen des jeweils vom Bauträger/Verkäufer freigegebenen Preiskorridors einvernehmlich angepasst werden, um für den Vertriebspartner eine zusätzliche Marge zu ermöglichen. Voraussetzung ist die vorherige Freigabe durch die Gesellschaft in Textform sowie die Wirtschaftlichkeit und marktgerechte Darstellbarkeit für den Endkunden.");
  p(OVERHEAD_AKTIV
    ? "(2) Höhe der Standardprovision, etwaige Strukturvergütung (Overhead-Provision auf Abschlüsse geworbener Vertriebspartner), Voraussetzungen, Entstehung, Verjährung sowie Abrechnung und Auszahlung ergeben sich abschließend aus Anlage 4 (\"Provisionsordnung\"); strukturbezogene Ergänzungen für Team Lead / Lizenzpartner aus Anlage 7."
    : "(2) Höhe der Standardprovision, Voraussetzungen, Entstehung, Verjährung sowie Abrechnung und Auszahlung ergeben sich abschließend aus Anlage 4 (\"Provisionsordnung\").");
  // Eine Verrechnung von Leadkosten gibt es nur in den Altpaketen mit
  // Start-Leads. Beim Vertriebspartner wird ein Leadpaket vorab bezahlt, beim
  // Lead-Berater gibt es keine Leadkosten.
  p(paket.preis > 0
    ? "(3) Paketabhängige Leadkosten werden gemäß Anlage 2 § 5 und Anlage 4 mit den Provisionsansprüchen verrechnet."
    : `(3) Eine Verrechnung von Leadkosten mit Provisionsansprüchen findet nicht statt. Ein optional gebuchtes Leadpaket wird gesondert nach der Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER_ALT}) abgerechnet.`);
  // Keine einseitige Änderung der Provisionsordnung mehr: Vorher durfte die
  // Gesellschaft sie mit drei Monaten Vorlauf anpassen. Jetzt gilt für alle
  // Pakete dieselbe Regel wie im Partner-Vertrag: nur einvernehmlich in Textform.
  p("(4) Bei Widersprüchen zwischen diesem Hauptvertrag und der Provisionsordnung (Anlage 4) gehen die Regelungen der Provisionsordnung vor. Eine Änderung der Provisionsordnung, der Provisions- bzw. Honorarsätze sowie sonstiger wirtschaftlicher Kernkonditionen ist ausschließlich einvernehmlich in Textform zwischen der Gesellschaft und dem Vertriebspartner möglich; eine einseitige Änderung durch die Gesellschaft ist ausgeschlossen. Die vereinbarten Sätze gelten unverändert fort, bis die Parteien etwas anderes vereinbaren. Bereits entstandene Provisions- bzw. Honoraransprüche bleiben in jedem Fall unberührt.");

  // ─── §9 Leads & CRM ───
  h1("§ 9 Leads und CRM");
  p("(1) Leads bleiben Eigentum der Gesellschaft. Eine Weitergabe an Dritte ist untersagt.");
  p("(2) CRM-Zugänge sind personenbezogen und dürfen nicht geteilt werden.");
  if (!hasCrmGebuehr) {
    p("(3) Die Nutzung des CRM-Systems ist während der aktiven Zusammenarbeit mit der Gesellschaft vollständig abgegolten. Monatliche oder laufende CRM-Folgekosten entstehen nicht.");
    p(`(4) Leadkontingent, Lead-Inklusivleistungen und Leadkostenmodell ergeben sich verbindlich aus Anlage 5 § 5 ("CRM- & Leadnutzungsbedingungen") in Verbindung mit Anlage 2 ("${anlage2}").`);
  } else {
    p(`(3) Die Nutzung des CRM-Systems wird über die monatliche CRM-Systemgebühr (${formatPreis(paket.monatlich)} brutto/Monat inkl. USt., ${mindestlaufzeit > 0 ? `Mindestlaufzeit ${mindestlaufzeit} Monate` : "keine Mindestlaufzeit"}) gemäß § 4 (3) abgedeckt.`);
    p("(4) Leadkontingent, Lead-Inklusivleistungen und Leadkostenmodell sind paketabhängig und ergeben sich verbindlich aus Anlage 5 § 5 (\"CRM- & Leadnutzungsbedingungen\") in Verbindung mit dem in Anlage 2 gebuchten Paket.");
  }
  // Das alte Leadmodell (Meta-Werbekosten 1:1 durchgereicht) gilt nur noch in
  // den Altpaketen mit Start-Leads. Neue Verträge kennen Leadpakete zum
  // Festpreis (Anlage 9) oder gestellte Leads (Lead-Berater).
  if (paket.preis > 0) {
    p("(5) Die Leadpreise basieren auf den tatsächlich angefallenen Kosten der von der Gesellschaft durchgeführten Marketingmaßnahmen, insbesondere Meta-Werbekampagnen. Die Gesellschaft gibt diese Leadkosten ohne Aufschlag und ohne Gewinnerzielungsabsicht 1:1 an den Vertriebspartner weiter. Die jeweils aktuellen Leadkosten werden transparent dokumentiert und dem Vertriebspartner auf Anfrage offengelegt.");
  } else if (paket.id === "lead_berater") {
    p("(5) Leads werden dem Vertriebspartner nach Anlage 2 § 5 zur Unterstützung gestellt. Ein entgeltlicher Erwerb von Leads ist in diesem Paket nicht vorgesehen; Leadkosten fallen nicht an.");
  } else {
    p(`(5) Leads werden nicht paketabhängig abgerechnet. Der optionale Erwerb von Leadpaketen und Einzel-Leads richtet sich nach Anlage 2 § 5 und, sofern ein Leadpaket gebucht ist, nach der Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER_ALT}) mit den dort genannten Festpreisen.`);
  }

  // ─── §9a Kunden-, Lead- & Herkunftsschutz ───
  // Die Zuordnung folgt der Herkunft im CRM: Was der Vertriebspartner selbst
  // anlegt (manuell oder per CSV), ist sein Eigenkontakt. Alles andere ist
  // Gesellschaftskontakt. Dieselbe Definition steht in Anlage 5 § 8.
  //
  // Seit Fassung 2026-09-02 ist § 9a eine Eigentums- und Datenregel, keine
  // Wettbewerbsabrede: Absatz 7 gilt nur während der Laufzeit (§ 86 HGB),
  // Absatz 8 regelt für die Zeit danach allein den Umgang mit den Daten der
  // Gesellschaft. Vorher stand hier eine 24-monatige Ansprache-Sperre.
  h1("§ 9a Kunden-, Lead- und Herkunftsschutz");
  p("(1) Dieser Vertrag unterscheidet zwischen Gesellschaftskontakten und Eigenkontakten des Vertriebspartners. Die Zuordnung richtet sich nach der Herkunft des Kontakts, wie sie im CRM-System der Gesellschaft festgehalten ist.");
  p("(2) Gesellschaftskontakte sind alle Kunden, Interessenten, Leads und Kontakte, die der Vertriebspartner nicht selbst im Sinne von Absatz 3 angelegt hat. Dazu gehören insbesondere Kontakte, die dem Vertriebspartner von der Gesellschaft zugewiesen werden, die aus einem erworbenen oder gestellten Leadpaket stammen, die aus dem Bestand oder dem Netzwerk der Gesellschaft übernommen wurden, die über Marketingmaßnahmen, Landingpages, Kampagnen, Empfehlungsprogramme oder Veranstaltungen der Gesellschaft entstanden sind sowie Kontakte, die im CRM-System bereits erfasst waren. Gesellschaftskontakte sind und bleiben mit sämtlichen zugehörigen Daten Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG, während der Vertragslaufzeit und nach Vertragsende.");
  p("(3) Eigenkontakte sind Kunden und Interessenten, die der Vertriebspartner selbst im CRM-System der Gesellschaft anlegt, sei es manuell oder per Datei-Import (CSV), und die zu diesem Zeitpunkt dort noch nicht erfasst sind. Das CRM-System hält fest, ob ein Kontakt vom Vertriebspartner angelegt oder von der Gesellschaft zugewiesen wurde; diese Herkunft ist für die Zuordnung maßgeblich. Eigenkontakte sind und bleiben Eigentum des Vertriebspartners, auch nach Vertragsende. Sie gehen weder während der Vertragslaufzeit noch mit Vertragsende auf die Gesellschaft über; der Vertriebspartner darf sie nach Vertragsende frei nutzen.");
  p("(4) Legt der Vertriebspartner einen Kontakt selbst an, der aus Leads, Marketingmaßnahmen, Daten oder sonstigen Mitteln der Gesellschaft im Sinne von Absatz 2 stammt, ändert das die Zuordnung nicht; ein solcher Kontakt bleibt Gesellschaftskontakt. Bereits vor Vertragsbeginn bestehende Kunden und Geschäftsbeziehungen kann der Vertriebspartner bei Vertragsbeginn per Datei-Import als Eigenkontakte anlegen.");
  p("(5) Der Vertriebspartner verpflichtet sich, sämtliche Kontakte, die er über die Gesellschaft berät oder vermittelt, vollständig im CRM-System der Gesellschaft zu erfassen, dort zu pflegen und Kommunikation, Termine, Statusänderungen und Ergebnisse nachvollziehbar zu dokumentieren. Diese Pflicht gilt für Eigenkontakte gleichermaßen, solange und soweit sie über die Gesellschaft vermittelt werden; sie dient der Provisionsabrechnung, der Dublettenvermeidung und den aufsichts- und datenschutzrechtlichen Nachweispflichten und begründet keine Zuordnung des Kontakts zur Gesellschaft.");
  p("(6) Eine Nutzung, Weitergabe, Speicherung oder Bearbeitung von Kunden- und Leaddaten der Gesellschaft außerhalb der von ihr freigegebenen Systeme ist während der Vertragslaufzeit untersagt. Ein Export von Daten aus dem CRM-System ist unzulässig. Unberührt bleibt das Recht des Vertriebspartners, die ihm zu seinen Eigenkontakten ohnehin vorliegenden eigenen Kontaktdaten weiter zu nutzen.");
  p("(7) Während der Vertragslaufzeit darf der Vertriebspartner Gesellschaftskontakte im Sinne von Absatz 2 sowie Empfehlungsgeber, Bauträger, Objektzuträger und Tippgeber der Gesellschaft nicht für eigene Zwecke oder für Dritte abwerben, vermitteln, beraten oder anderweitig nutzen, soweit dies in einem sachlichen Zusammenhang mit dem Geschäftsbereich der Gesellschaft (Vertrieb von Kapitalanlageimmobilien und damit verbundene Beratungs- und Vermittlungsleistungen) steht. Dies folgt aus der Pflicht des Handelsvertreters zur Wahrung der Interessen der Gesellschaft (§ 86 Absatz 1 HGB) und gilt neben § 10.");
  p(`(8) Nach Vertragsende besteht kein Wettbewerbsverbot und keine Beschränkung der Ansprache von Kunden. Die Daten der Gesellschaftskontakte sowie die Daten der Empfehlungsgeber, Bauträger, Objektzuträger und Tippgeber der Gesellschaft bleiben jedoch Eigentum und Geschäftsgeheimnis der Gesellschaft: Sie sind bei Vertragsende nach § 9f herauszugeben und zu löschen und dürfen danach für einen Zeitraum von ${schutzMonate} Monaten weder genutzt noch weitergegeben noch verwertet werden, insbesondere nicht für eine Kontaktaufnahme, Beratung oder Vermittlung für eigene Zwecke oder für Dritte. Eine Kontaktaufnahme, die sich nicht auf diese Daten stützt, wird durch diesen Vertrag nicht beschränkt. Für Geschäftsgeheimnisse im Sinne des GeschGehG gilt ergänzend § 11.`);
  p("(9) Für Eigenkontakte im Sinne von Absatz 3 gelten die Absätze 7 und 8 nicht. Der Vertriebspartner darf sie während der Vertragslaufzeit und nach Vertragsende frei betreuen, beraten und vermitteln; § 10 bleibt für die Vertragslaufzeit unberührt. Ausgenommen sind ausschließlich Vorgänge, die bei Vertragsende bereits konkret angebahnt sind, insbesondere laufende Reservierungen sowie Fälle mit bereits erteiltem Notarauftrag; diese werden über die Gesellschaft zu Ende geführt und nach Maßgabe der Provisionsordnung abgerechnet.");
  p("(10) Für die Zuordnung im Streitfall gilt die Prioritäts- und Dublettenregelung des § 9c. War ein Kontakt zum Zeitpunkt seiner Anlage durch den Vertriebspartner bereits im CRM-System der Gesellschaft erfasst, ist er Gesellschaftskontakt; eine Kennzeichnung als Eigenkontakt ist dann ausgeschlossen.");

  // ─── §9b Bauträger-, Projekt- & Geschäftschancenschutz ───
  // Absatz 4 gilt nur während der Laufzeit, Absatz 5 schützt danach allein
  // die Bauträger- und Geschäftspartnerdaten als Eigentum der Gesellschaft.
  h1("§ 9b Bauträger-, Projekt- und Geschäftschancenschutz");
  p("(1) Sämtliche Geschäftsbeziehungen zu Bauträgern, Projektentwicklern, Objektanbietern, Maklern, Asset Managern und vergleichbaren Lieferanten von Kapitalanlageobjekten, die im Rahmen der Tätigkeit für die Gesellschaft entstehen, ausgebaut oder gepflegt werden, gelten als Geschäftsbeziehungen der Gesellschaft. Die zugehörigen Daten, insbesondere Kontakte, Konditionen, Einkaufspreise, Margenstrukturen, Reservierungslisten, Objektlisten und Projektpipelines (Bauträger- und Geschäftspartnerdaten), sind Eigentum und Geschäftsgeheimnis der Gesellschaft im Sinne des § 90 HGB und des GeschGehG.");
  p("(2) Dies gilt insbesondere für Bauträger und Projekte, die der Vertriebspartner über die Gesellschaft, deren Netzwerk, deren CRM oder deren Bestandsbeziehungen kennengelernt hat, sowie für Bauträger und Projekte, die er während der Vertragslaufzeit für die Gesellschaft betreut, beliefert oder vermittelt hat.");
  p("(3) Der Vertriebspartner verpflichtet sich, sämtliche Bauträger- und Projektkontakte, Konditionen, Einkaufspreise, Margenstrukturen, Reservierungslisten, Objektlisten und Projektpipelines ausschließlich im CRM bzw. in den dafür vorgesehenen Systemen der Gesellschaft zu dokumentieren.");
  p("(4) Während der Vertragslaufzeit ist es dem Vertriebspartner untersagt, mit diesen Bauträgern, Projektentwicklern oder Objektanbietern außerhalb des Systems der Gesellschaft Geschäfte über Kapitalanlageimmobilien anzubahnen, abzuwickeln, zu vermitteln oder Dritten zu vermitteln. Erfasst sind insbesondere konkurrierende Vermittlungs-, Vertriebs- und Beratungsleistungen für identische oder vergleichbare Objekte und Projekte. Eine eigenständige Übernahme von Bauträger- oder Projektbeziehungen in eine andere, konkurrierende Struktur ist während der Vertragslaufzeit unzulässig.");
  p(`(5) Nach Vertragsende besteht insoweit kein Wettbewerbsverbot. Die Bauträger- und Geschäftspartnerdaten nach Absatz 1 bleiben jedoch Eigentum und Geschäftsgeheimnis der Gesellschaft: Sie sind bei Vertragsende nach § 9f herauszugeben und zu löschen und dürfen danach für einen Zeitraum von ${schutzMonate} Monaten weder genutzt noch weitergegeben noch verwertet werden; § 11 gilt ergänzend. Die Gesellschaft kann gegenüber dem Bauträger jederzeit klarstellen, dass der jeweilige Kontakt im Rahmen der Tätigkeit des Vertriebspartners für die Gesellschaft entstanden bzw. ausgebaut wurde.`);

  // ─── §9c Dubletten- und Prioritätsregelung ───
  h1("§ 9c Dubletten- und Prioritätsregelung");
  p("(1) Maßgeblich für die Zuordnung von Kunden, Interessenten, Bauträgern und Objektzuträgern ist ausschließlich die Erfassung im CRM-System der Gesellschaft. Es gilt das Prioritätsprinzip: maßgeblich ist der Zeitpunkt der erstmaligen, vollständigen und nachvollziehbaren Erfassung im CRM.");
  p("(2) Mündliche, parallele oder externe Aufzeichnungen (z. B. in privaten Tools, Excel-Listen, E-Mail-Postfächern, Notizen, Drittsystemen) begründen keinen vorrangigen Anspruch auf einen Kunden, Lead, Bauträger oder eine Geschäftschance gegenüber der Gesellschaft oder anderen Vertriebspartnern.");
  p("(3) Im Falle von Dubletten oder Mehrfachzuordnungen entscheidet die Gesellschaft auf Basis der CRM-Daten und der dort dokumentierten Bearbeitungs- und Kontakthistorie verbindlich über die Zuordnung. Eine Anfechtung dieser Zuordnung ist nur bei nachweislich falscher oder unvollständiger CRM-Dokumentation möglich.");
  p("(4) Der Vertriebspartner ist verpflichtet, bei jeder Aufnahme eines neuen Kontakts vor Beginn der inhaltlichen Bearbeitung eine Dublettenprüfung im CRM durchzuführen.");

  // ─── §9d Schutz laufender Geschäftschancen ───
  h1("§ 9d Schutz laufender Geschäftschancen");
  p("(1) Geschäftschancen, die im Zuge der Tätigkeit für die Gesellschaft entstehen (insbesondere konkrete Vermittlungs-, Reservierungs- oder Abschlussgelegenheiten bei Kunden oder Bauträgern), sind ausschließlich über die Gesellschaft zu realisieren.");
  p("(2) Während der Vertragslaufzeit ist es dem Vertriebspartner untersagt, solche Geschäftschancen selbst, über Dritte oder über andere Strukturen außerhalb der Gesellschaft zu realisieren, abzuwickeln oder zu vermitteln.");
  p("(3) Dies gilt insbesondere für laufende Reservierungen, fortgeschrittene Beratungs- und Finanzierungsprozesse sowie konkrete Objekt- oder Projektgespräche, die aus der Tätigkeit für die Gesellschaft hervorgegangen sind.");
  p("(4) Vorgänge, die bei Vertragsende bereits konkret angebahnt sind, insbesondere laufende Reservierungen und Fälle mit bereits erteiltem Notarauftrag, werden über die Gesellschaft zu Ende geführt und nach Maßgabe der Provisionsordnung abgerechnet; das gilt für Gesellschaftskontakte und Eigenkontakte gleichermaßen (§ 9a Absatz 9). Im Übrigen unterliegen Geschäftschancen nach Vertragsende keiner Beschränkung; für die Daten der Gesellschaft gelten § 9a Absatz 8, § 9b Absatz 5, § 9f und § 11.");
  // Klarstellung statt Wettbewerbsabrede: Vorher verwies dieser Absatz auf
  // § 90a HGB samt Entschädigungsanspruch. Jetzt gibt es nach Vertragsende
  // keine Beschränkung der Tätigkeit mehr, nur Eigentum an Kontakten und
  // Schutz der Daten und Geschäftsgeheimnisse.
  p("(5) Die §§ 9a bis 9d begründen kein nachvertragliches Wettbewerbsverbot und keine Beschränkung der beruflichen Tätigkeit des Vertriebspartners nach Vertragsende. Sie regeln, wem Kontakte und Daten gehören, und schützen die Daten und Geschäftsgeheimnisse der Gesellschaft (§ 90 HGB, GeschGehG) ebenso wie die Eigenkontakte des Vertriebspartners als sein Eigentum.");

  // ─── §9e Vertragsstrafe (das einzige Strafregime des Vertragswerks) ───
  if (paket.partnerHonorar) {
    h1("§ 9e Schadensersatz und Unterlassung");
    p("(1) Bei einem schuldhaften Verstoß des Vertriebspartners gegen die Pflichten während der Vertragslaufzeit nach §§ 9a bis 9d und § 10, gegen die Daten- und Geheimnisschutzpflichten nach § 9a Absätze 6 und 8, § 9b Absatz 5, § 9f und § 11, gegen das Verbot der Datenabwerbung und des Datenexports (Anlage 5 § 8) oder gegen die Verschwiegenheitserklärung (Anlage 3 Teil II) richten sich die Ansprüche der Gesellschaft ausschließlich nach den allgemeinen gesetzlichen Vorschriften.");
    p("(2) Die Gesellschaft kann insbesondere Unterlassung, Beseitigung sowie Ersatz des ihr nachweislich entstandenen Schadens einschließlich entgangenen Gewinns nach den §§ 280 ff., 823 ff. BGB sowie nach den Vorschriften des UWG und des GeschGehG verlangen. Eine pauschalierte Vertragsstrafe wird ausdrücklich nicht vereinbart; die Anlagen dieses Vertrages begründen keine Vertragsstrafe.");
    p("(3) Die Geltendmachung weitergehender gesetzlicher Ansprüche, insbesondere auf Auskunft und Rechnungslegung, bleibt unberührt.");
  } else {
    h1("§ 9e Vertragsstrafe, Auskunft und Schadensersatz");
    p("(1) Für jeden schuldhaften Verstoß gegen die Pflichten während der Vertragslaufzeit nach § 9a Absatz 7, § 9b Absatz 4, § 9d Absatz 2 und § 10, gegen die Daten- und Geheimnisschutzpflichten nach § 9a Absätze 6 und 8, § 9b Absatz 5, § 9f Absatz 2 und § 11, gegen das Verbot der Datenabwerbung und des Datenexports (Anlage 5 § 8) oder gegen die Verschwiegenheitserklärung (Anlage 3 Teil II) kann die Gesellschaft eine Vertragsstrafe verlangen. Dies ist das einzige Vertragsstrafenversprechen dieses Vertragswerks; die Anlagen verweisen hierauf und begründen keine weiteren Vertragsstrafen.");
    p(`(2) Die Höhe der Vertragsstrafe bestimmt die Gesellschaft nach billigem Ermessen (§ 315 BGB) unter Berücksichtigung von Art, Umfang, Dauer und Schwere des Verstoßes, des Grades des Verschuldens sowie des Werts des betroffenen Kontakts, Geschäftspartners, Datenbestands oder der betroffenen Geschäftschance. Sie beträgt höchstens ${formatPreis(VERTRAGSSTRAFE_MAX_EINZEL)} je Verstoß. Bei systematischer Abwerbung mehrerer Kontakte oder Geschäftspartner während der Vertragslaufzeit sowie bei Nutzung, Weitergabe oder Export ganzer Datenbestände beträgt sie höchstens ${formatPreis(VERTRAGSSTRAFE_MAX_SYSTEMATISCH)} je Verstoß. Die Angemessenheit der festgesetzten Vertragsstrafe kann im Streitfall durch das zuständige Gericht überprüft werden.`);
    p("(3) Jeder Verstoß kann gesondert sanktioniert werden. Mehrere Handlungen, die auf einem einheitlichen Entschluss beruhen und denselben Kontakt, Geschäftspartner oder dieselbe Geschäftschance betreffen, gelten als ein Verstoß. Bloße Verstöße gegen Dokumentations- und Formpflichten (§ 9a Absatz 5, § 9b Absatz 3, § 9c Absatz 4) lösen keine Vertragsstrafe aus.");
    p("(4) Weitergehende Schadensersatzansprüche, Unterlassungsansprüche und Ansprüche auf Herausgabe entgangenen Gewinns bleiben hiervon ausdrücklich unberührt. Eine gezahlte Vertragsstrafe wird auf einen darüber hinausgehenden Schadensersatzanspruch angerechnet.");
  }

  // ─── §9f Auskunft, Herausgabe & Löschung ───
  h1("§ 9f Auskunft, Herausgabe und Löschung");
  p("(1) Der Vertriebspartner ist auf Verlangen der Gesellschaft jederzeit, insbesondere bei Vertragsende oder bei begründetem Verdacht eines Verstoßes, verpflichtet, vollständige und wahrheitsgemäße Auskunft über alle von ihm bearbeiteten Kunden, Leads, Bauträger, Projekte und Geschäftschancen zu erteilen.");
  p("(2) Sämtliche Kunden-, Lead-, Bauträger-, Objekt- und Projektdaten, Listen, Auswertungen, Unterlagen, Korrespondenzen und Aufzeichnungen, die im Rahmen der Tätigkeit für die Gesellschaft entstanden oder verwendet wurden, sind Eigentum der Gesellschaft und bei Vertragsende unverzüglich und vollständig an die Gesellschaft herauszugeben und auf allen eigenen Systemen, Geräten und Speichermedien nachweislich und unwiderruflich zu löschen. Eigenkontakte (§ 9a Absatz 3) und die eigenen Kontaktdaten des Vertriebspartners zu ihnen sind hiervon ausgenommen; sie bleiben sein Eigentum.");
  p("(3) Die ordnungsgemäße Löschung ist der Gesellschaft auf Verlangen schriftlich oder in Textform zu bestätigen.");

  // ─── §10 Wettbewerb ───
  if (bewerber.individuelleVertragsFassung) {
    // Individualfassung: kein allgemeines Wettbewerbsverbot, dafür gelten die
    // §§ 9a bis 9e unverändert. Vorher hatte § 10 hier eine eigene Schutzfrist
    // (36 Monate) und eine eigene Strafe (15.000 EUR fest) neben § 9e.
    h1("§ 10 Nebentätigkeit, Kunden- und Partnerschutz (Individualfassung)");
    p("(1) Für den Vertriebspartner besteht weder während noch nach Beendigung dieses Vertrages ein allgemeines Wettbewerbsverbot. Er ist berechtigt, parallel für andere Unternehmen, auch im Bereich Kapitalanlage-Immobilien, tätig zu sein, soweit hierdurch die ordnungsgemäße Erfüllung dieses Vertrages nicht beeinträchtigt wird. Die bei Vertragsbeginn bestehenden Tätigkeiten für andere Vertriebe oder Bauträger sind in Anlage 8 erklärt; die spätere Aufnahme oder Beendigung solcher Tätigkeiten ist der Gesellschaft in Textform vorab anzuzeigen (Anzeigepflicht, keine Zustimmungspflicht).");
    p("(2) Der Kunden-, Lead- und Herkunftsschutz nach § 9a, der Bauträger- und Geschäftschancenschutz nach §§ 9b und 9d sowie die Dublettenregelung nach § 9c gelten uneingeschränkt, einschließlich der dort vereinbarten Eigentums-, Daten- und Geheimnisschutzregeln für die Zeit nach Vertragsende (§ 9a Absatz 8, § 9b Absatz 5, § 9f, § 11). Von der Gesellschaft bezogene oder über sie erlangte Leads und Gesellschaftskontakte dürfen ausschließlich über die Gesellschaft beraten, bearbeitet und eingereicht werden; ihre Einreichung, Vermittlung oder sonstige Verwertung bei oder über andere Vertriebe, Vermittler, Plattformen oder Bauträger ist untersagt.");
    p("(3) Eigenkontakte im Sinne von § 9a Absatz 3, insbesondere die vom Vertriebspartner bei Vertragsbeginn selbst angelegten Bestandskunden, darf der Vertriebspartner auch im Rahmen seiner Tätigkeit für andere Unternehmen frei betreuen. Objekte, Projekte, Konditionen und Geschäftspartner der Gesellschaft darf er dabei nicht einsetzen; § 9b und § 11 bleiben unberührt.");
    p("(4) Bei einer zulässigen Tätigkeit für andere Unternehmen hält der Vertriebspartner Systeme, Unterlagen und Kommunikationswege strikt getrennt (§ 11 Absatz 4). Für schuldhafte Verstöße gegen die Absätze 2 und 3 gilt ausschließlich § 9e.");
  } else {
    h1("§ 10 Wettbewerbsverbot");
    p("(1) Während der Vertragslaufzeit darf der Vertriebspartner keine konkurrierenden Immobilienvertriebe mit identischem Geschäftsmodell aktiv vertreiben oder aufbauen. Dies entspricht dem gesetzlichen Wettbewerbsverbot des Handelsvertreters während der Vertragslaufzeit (§ 86 Absatz 1 HGB).");
    p("(2) Bereits bestehende Tätigkeiten sind der Gesellschaft schriftlich offenzulegen.");
    p("(3) Dem Vertriebspartner wird kein Gebietsschutz eingeräumt. Die Gesellschaft ist berechtigt, mehrere Vertriebspartner parallel in denselben Regionen, Zielgruppen oder Kundensegmenten einzusetzen. Umgekehrt ist der Vertriebspartner frei, bundesweit zu akquirieren und Interessenten zu gewinnen. Die Zuordnung einzelner Kontakte richtet sich ausschließlich nach § 9a und dem Prioritätsprinzip des § 9c; die dort geregelte Zuordnung von Eigenkontakten bleibt unberührt.");
    p("(4) Das Wettbewerbsverbot nach Absatz (1) beschränkt sich auf konkurrierende Geschäftsmodelle im Bereich der Kapitalanlage-Immobilien und damit zusammenhängender Vertriebs-, Vermittlungs- und Beratungsleistungen. Hierzu zählen insbesondere steueroptimierte Kapitalanlageimmobilien, möblierte WG- und Co-Living-Konzepte, Neubau-Kapitalanlagen, Bauträgervertriebe für Kapitalanleger sowie datenbasierte Investment- und Vermittlungsberatung im Bereich Wohnimmobilien als Kapitalanlage. Eine darüber hinausgehende, allgemeine Berufsausübung des Vertriebspartners (z. B. selbstgenutzte Immobilien, Gewerbeimmobilien außerhalb des Kapitalanlagebereichs, völlig andere Branchen) wird durch diesen Vertrag nicht beschränkt.");
    p("(5) Nach Vertragsende besteht kein Wettbewerbsverbot und keine Beschränkung der Ansprache von Kunden. Es gelten ausschließlich die Eigentums-, Daten- und Geheimnisschutzregeln der §§ 9a bis 9d, 9f und 11: Eigenkontakte bleiben Eigentum des Vertriebspartners; zugewiesene Leads, Gesellschaftskontakte sowie Bauträger- und Geschäftspartnerdaten bleiben Eigentum und Geschäftsgeheimnis der Gesellschaft, sind bei Vertragsende herauszugeben und zu löschen und dürfen danach nicht genutzt, weitergegeben oder verwertet werden.");
  }

  // ─── §11 Geheimhaltung ───
  h1("§ 11 Geheimhaltung");
  p("(1) Sämtliche internen Informationen der Gesellschaft sind vertraulich zu behandeln. Hierzu gehören insbesondere, ohne hierauf beschränkt zu sein, Objektlisten und Projektpipelines, Bauträger- und Projektentwicklerkontakte sowie deren Konditionen, Einkaufspreise, Margenstrukturen, Kalkulationsgrundlagen, CRM-Daten, Kunden- und Leaddaten, Funnel- und Prozessstrukturen, Vertriebs-, Beratungs- und Verkaufsskripte, Schulungsunterlagen, Automationen, Templates, Preislisten, strategische Pläne sowie sämtliche Geschäftsgeheimnisse im Sinne des GeschGehG.");
  p(`(2) Diese Verpflichtung gilt während der gesamten Vertragslaufzeit sowie nach Vertragsende fort. Für Informationen, die Geschäftsgeheimnisse im Sinne des GeschGehG darstellen, gilt die Geheimhaltungspflicht zeitlich unbeschränkt. Für sonstige vertrauliche Informationen gilt sie für einen Zeitraum von ${schutzMonate} Monaten nach Vertragsende fort, soweit die jeweilige Information nicht zwischenzeitlich ohne Verschulden des Vertriebspartners öffentlich bekannt geworden ist.`);
  p("(3) Eine Nutzung der vorgenannten Informationen zugunsten konkurrierender Geschäftsmodelle oder zur Aufbauunterstützung eigener oder fremder konkurrierender Strukturen ist während des gesamten Geheimhaltungszeitraums untersagt.");
  p("(4) Ist der Vertriebspartner zulässigerweise für andere Unternehmen tätig, gelten diese Unternehmen und deren Mitarbeiter ausdrücklich als Dritte im Sinne dieses § 11. Untersagt sind insbesondere: die Gewährung von Einblicken in das CRM-System der Gesellschaft, auch durch Bildschirmübertragung, Demonstration oder Mitbenutzung des Zugangs; die Übernahme, Nachbildung oder Weitergabe von Prozessen, Abläufen, Skripten, Vorlagen, Kalkulationen oder Schulungsinhalten der Gesellschaft in oder an fremde Strukturen; sowie jede Speicherung oder Verarbeitung von Daten der Gesellschaft in Systemen Dritter. Systeme, Unterlagen und Kommunikationswege sind strikt getrennt zu halten.");
  p("(5) Die Verschwiegenheitserklärung in Anlage 3 Teil II konkretisiert diese Pflichten. Für schuldhafte Verstöße gilt § 9e.");

  // ─── §12 Marke ───
  h1("§ 12 Marken- und Nutzungsrechte");
  p('(1) Die Gesellschaft gestattet dem Vertriebspartner während der Vertragslaufzeit die Nutzung der Marke "MORE Immo" ausschließlich für vertragsgemäße Zwecke.');
  p("(2) Nach Vertragsende endet das Nutzungsrecht sofort.");

  // ─── §13 Haftung ───
  h1("§ 13 Haftung");
  if (paket.partnerHonorar) {
    p("(1) Beide Vertragsparteien haften einander, soweit gesetzlich zulässig, ausschließlich für Vorsatz und grobe Fahrlässigkeit. Diese Haftungsbeschränkung gilt symmetrisch sowohl für die Gesellschaft als auch für den Vertriebspartner.");
    p("(2) Unberührt hiervon bleibt die unbeschränkte Haftung beider Parteien bei Vorsatz, bei der Verletzung des Lebens, des Körpers oder der Gesundheit sowie in sonstigen Fällen einer nach zwingendem Recht (insbesondere ProdHaftG) nicht abdingbaren Haftung.");
    p("(3) Bei leicht fahrlässiger Verletzung wesentlicher Vertragspflichten (sog. Kardinalpflichten) ist die Haftung beider Parteien auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Wesentliche Vertragspflichten sind solche Pflichten, deren Erfüllung die ordnungsgemäße Durchführung dieses Vertrages überhaupt erst ermöglicht und auf deren Einhaltung die jeweils andere Partei regelmäßig vertrauen darf.");
    p("(4) Soweit der Vertriebspartner aufgrund zwingender berufsrechtlicher oder aufsichtsrechtlicher Vorschriften (z. B. §§ 34c, 34f, 34i GewO, MaBV) gegenüber Kunden oder Aufsichtsbehörden persönlich haftet, bleibt diese gesetzliche Eigenhaftung des Vertriebspartners gegenüber Dritten unberührt; die vorstehende Haftungsbeschränkung gilt insoweit nur im Innenverhältnis der Vertragsparteien zueinander.");
    p("(5) Die Gesellschaft übernimmt keine Garantie für bestimmte Umsätze, Provisionen, steuerliche Vorteile, Finanzierungszusagen, Wertentwicklungen oder wirtschaftliche Ergebnisse der vermittelten Immobilieninvestments.");
  } else {
    p("(1) Der Vertriebspartner haftet für eigene Beratungsfehler, Falschaussagen, Pflichtverletzungen, Datenschutzverstöße sowie Verstöße gegen gesetzliche Vorschriften selbst.");
    // Gerichtsfeste Standardfassung: Vorher stand hier ein pauschales
    // "Im Übrigen ist die Haftung ausgeschlossen", das den Ausschluss nicht auf
    // einfache Fahrlässigkeit begrenzte und das ProdHaftG nicht ausnahm.
    p("(2) Die Gesellschaft haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit.");
    p("(3) Bei einfacher Fahrlässigkeit haftet die Gesellschaft nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten), also solcher Pflichten, deren Erfüllung die ordnungsgemäße Durchführung dieses Vertrages überhaupt erst ermöglicht und auf deren Einhaltung der Vertriebspartner regelmäßig vertrauen darf. In diesem Fall ist die Haftung auf den vorhersehbaren, vertragstypischen Schaden begrenzt.");
    p("(4) Im Übrigen ist die Haftung der Gesellschaft bei einfacher Fahrlässigkeit ausgeschlossen. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt.");
    p("(5) Die Gesellschaft übernimmt keine Garantie für bestimmte Umsätze, Provisionen, steuerliche Vorteile, Finanzierungszusagen, Wertentwicklungen oder wirtschaftliche Ergebnisse der vermittelten Immobilieninvestments.");
  }

  // ─── §14 Laufzeit (Vertrag und CRM-Nutzung gemeinsam) ───
  h1("§ 14 Vertragslaufzeit & Kündigung");
  p("(1) Der Vertrag beginnt mit Unterzeichnung.");
  if (mindestlaufzeit === 0) {
    p("(2) Der Vertrag wird auf unbestimmte Zeit geschlossen; eine Mindestlaufzeit besteht nicht (individuell vereinbart).");
    p("(3) Der Vertrag kann von beiden Parteien jederzeit monatlich mit einer Frist von einem Monat zum Monatsende in Textform (§ 126b BGB, z. B. per E-Mail an office@more.immo) ordentlich gekündigt werden. Eine automatische Verlängerung um feste weitere Zeiträume findet nicht statt.");
  } else {
    p(`(2) Die Mindestlaufzeit beträgt ${mindestlaufzeit} Monate. Innerhalb der Mindestlaufzeit ist eine ordentliche Kündigung ausgeschlossen.`);
    p(`(3) Nach Ablauf der Mindestlaufzeit von ${mindestlaufzeit} Monaten verlängert sich der Vertrag auf unbestimmte Zeit und kann von beiden Parteien mit einer Frist von einem Monat zum Monatsende in Textform (§ 126b BGB, z. B. per E-Mail an office@more.immo) ordentlich gekündigt werden. Eine automatische Verlängerung um feste weitere Zeiträume findet nicht statt.`);
  }
  p("(4) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund (§ 314 BGB, § 89a HGB) bleibt für beide Parteien unberührt.");
  p(mindestlaufzeit === 0
    ? "(5) Laufzeit und Kündigung gelten einheitlich für diesen Vertrag und die Nutzung des CRM-Systems nach § 4; mit Beendigung des Vertrages endet die CRM-Nutzung, und es gilt § 9f."
    : "(5) Laufzeit, Mindestlaufzeit und Kündigung gelten einheitlich für diesen Vertrag und die Nutzung des CRM-Systems nach § 4; mit Beendigung des Vertrages endet die CRM-Nutzung, und es gilt § 9f.");

  // ─── §15 Kein Widerruf ───
  h1("§ 15 Kein Widerrufsrecht");
  p("(1) Der Vertriebspartner handelt ausschließlich als Unternehmer im Sinne des §14 BGB.");
  p("(2) Ein gesetzliches Widerrufsrecht besteht daher nicht.");
  p("(3) Der Vertriebspartner bestätigt ausdrücklich, den Vertrag im Rahmen seiner gewerblichen bzw. selbstständigen Tätigkeit abzuschließen.");

  // ─── §16 Datenschutz ───
  h1("§ 16 Datenschutz");
  p("(1) Beide Parteien verpflichten sich zur Einhaltung der DSGVO.");
  p("(2) Personenbezogene Daten dürfen ausschließlich zur Vertragsdurchführung verarbeitet werden.");
  p("(3) Der Vertriebspartner verpflichtet sich insbesondere zur vertraulichen Behandlung von Kundendaten. Einzelheiten regelt Anlage 3.");

  // ─── §17 Schluss ───
  h1("§ 17 Schlussbestimmungen");
  p("(1) Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform.");
  p("(2) Sollten einzelne Bestimmungen unwirksam sein oder werden, bleibt die Wirksamkeit des übrigen Vertrages unberührt.");
  p("(3) Gerichtsstand ist - soweit zulässig - der Sitz der Gesellschaft.");
  p("(4) Es gilt deutsches Recht.");

  // ─── §18 Vertragsbestandteile (aus derselben Quelle wie die gedruckten Anlagen) ───
  spacer(4);
  ensure(130);
  h1("§ 18 Vertragsbestandteile & Akzeptanz der Anlagen");
  p("(1) Folgende Anlagen sind verbindlicher Bestandteil dieses Vertrages und dem Vertriebspartner vor Unterzeichnung vollständig zur Kenntnis gebracht worden:");
  const anlagen = vertragsAnlagenAlt(paket.id, !!bewerber.individuelleVertragsFassung, !!bewerber.leadPaket);
  bullet(anlagen.map((a) => `Anlage ${a.nummer} - ${a.titel}${a.nummer === 9 ? " (optionales Leadpaket)" : ""}`));
  p("(2) Mit seiner Unterschrift unter diesen Hauptvertrag bestätigt der Vertriebspartner ausdrücklich, dass er sämtliche vorstehend aufgeführten Anlagen rechtzeitig vor Unterzeichnung erhalten, vollständig gelesen, inhaltlich verstanden und uneingeschränkt als rechtsverbindlichen Bestandteil dieses Vertrages akzeptiert hat. Eine gesonderte Einzelunterschrift unter den einzelnen Anlagen ist ausdrücklich nicht erforderlich; die Anlagen werden mit Unterzeichnung dieses Hauptvertrages verbindlicher Bestandteil des Gesamtvertragswerks und stehen rechtlich auf einer Stufe mit dem Hauptvertrag.");
  p("(3) Im Falle von Widersprüchen zwischen dem Hauptvertrag und einer Anlage gehen die Regelungen dieses Hauptvertrages vor, soweit in der jeweiligen Anlage nicht ausdrücklich Abweichendes geregelt ist.");
}

/* ── Anlage 1: AGB ────────────────────────────────────────────────────── */

export function renderAnlage1AgbAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet } = t;
  const { paket, bewerber } = ctx;

  h1("§ 1 Geltungsbereich");
  p('(1) Diese AGB gelten für sämtliche Geschäftsbeziehungen zwischen MOREImmo / ehemals Immosparplan ("Gesellschaft") und deren Vertriebspartnern, Tippgebern sowie Untervertriebspartnern.');
  p("(2) Abweichende Bedingungen des Vertriebspartners gelten nur bei ausdrücklicher schriftlicher Zustimmung der Gesellschaft.");
  p("(3) Diese AGB sind Bestandteil des Handelsvertretervertrages. Bei Widersprüchen gehen der Hauptvertrag und seine Anlagen 2 bis 9 diesen AGB vor.");

  h1("§ 2 Leistungen der Gesellschaft");
  p(paket.partnerHonorar
    ? "Die Gesellschaft stellt dem Vertriebspartner gemäß Anlage 2 insbesondere folgende Leistungen zur Verfügung:"
    : "Die Gesellschaft stellt, je nach gebuchtem Paket gemäß Anlage 2, insbesondere folgende Leistungen zur Verfügung:");
  bullet([
    "CRM-System (more.immo)",
    "Vertriebsinfrastruktur & Closing-Support",
    "Schulungen, Academy & Webinare",
    "Objektzugänge (eigene und Drittobjekte)",
    "Vertriebsunterlagen, Exposés, Präsentationen",
    "Leads (gemäß Paket und Verfügbarkeit)",
    "Verkaufsskripte & Beratungsleitfäden",
    "Finanzierungsvorprüfung & Bankenkontakte",
    "Teamaufbau-Systeme",
    "laufender Support und Coaching",
  ]);
  p("Ein Anspruch auf bestimmte Umsätze, Abschlüsse oder Leadmengen besteht nicht.");

  h1("§ 3 Vertragsschluss");
  p("(1) Der Vertrag kommt durch Unterzeichnung oder digitale Zustimmung (elektronische Signatur oder Textform mit Token-Bestätigung) zustande.");
  p("(2) Die Gesellschaft kann Bewerbungen ohne Angabe von Gründen ablehnen.");

  h1("§ 4 Unternehmerstatus");
  p("(1) Die Angebote richten sich ausschließlich an Unternehmer gemäß § 14 BGB.");
  p("(2) Verbraucher i.S.d. § 13 BGB sind ausgeschlossen.");
  p("(3) Ein Widerrufsrecht besteht nicht.");

  h1("§ 5 Vergütung und Provision");
  p("(1) Die Provision richtet sich nach der jeweils gültigen Provisionsordnung (Anlage 4) und den im Hauptvertrag (§ 8) vereinbarten Sätzen.");
  p("(2) Ein Provisionsanspruch entsteht erst nach vollständigem Zahlungseingang bei der Gesellschaft.");
  p("(3) Rückbelastungen bei Rückabwicklung können verrechnet werden.");

  h1("§ 6 Nutzung der Infrastruktur");
  p("(1) Sämtliche Systeme, CRM-Zugänge, Leads, Gesellschaftskontakte, Vorlagen und Schulungsinhalte bleiben Eigentum der Gesellschaft. Eigenkontakte des Vertriebspartners (§ 9a Absatz 3 des Hauptvertrages) bleiben sein Eigentum, auch nach Vertragsende.");
  p("(2) Eine Weitergabe an Dritte ist untersagt.");
  p("(3) Die Gesellschaft kann Zugänge bei Verstößen sofort sperren.");

  // Bei der Individualfassung darf hier kein Wettbewerbsverbot stehen, das
  // § 10 des Hauptvertrages ausdrücklich nicht enthält. Nach Vertragsende
  // gibt es in keiner Fassung ein Wettbewerbsverbot, nur Daten- und
  // Geheimnisschutz.
  h1("§ 7 Wettbewerb und Nebentätigkeit");
  p(bewerber.individuelleVertragsFassung
    ? "Für den Vertriebspartner gilt die in § 10 des Hauptvertrages vereinbarte Individualfassung: Eine Tätigkeit für andere Unternehmen ist zulässig. Die Eigentums-, Daten- und Geheimnisschutzregeln der §§ 9a bis 9d, 9f und 11 des Hauptvertrages gelten uneingeschränkt. Ein Wettbewerbsverbot wird durch diese AGB nicht begründet."
    : "Während der Vertragslaufzeit darf kein konkurrierendes Vertriebssystem mit identischem Geschäftsmodell betrieben oder aktiv beworben werden. Umfang und Grenzen regelt § 10 des Hauptvertrages. Nach Vertragsende besteht kein Wettbewerbsverbot; es gelten ausschließlich die Eigentums-, Daten- und Geheimnisschutzregeln der §§ 9a bis 9d, 9f und 11 des Hauptvertrages.");

  h1("§ 8 Haftung");
  if (paket.partnerHonorar) {
    p("(1) Beide Vertragsparteien haften einander, soweit gesetzlich zulässig, ausschließlich für Vorsatz und grobe Fahrlässigkeit. Diese Haftungsbeschränkung gilt symmetrisch für die Gesellschaft und den Vertriebspartner; im Übrigen gilt § 13 des Hauptvertrages.");
    p("(2) Für wirtschaftliche Ergebnisse oder steuerliche Auswirkungen der vermittelten Immobilieninvestments wird von keiner der Parteien eine Haftung übernommen.");
    p("(3) Eine etwaige berufs- oder aufsichtsrechtliche Eigenhaftung des Vertriebspartners gegenüber Kunden oder Behörden bleibt unberührt.");
  } else {
    p("(1) Die Gesellschaft haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit; bei einfacher Fahrlässigkeit nur bei Verletzung wesentlicher Vertragspflichten (Kardinalpflichten) und begrenzt auf den vorhersehbaren, vertragstypischen Schaden. Die Haftung nach dem Produkthaftungsgesetz bleibt unberührt. Einzelheiten regelt § 13 des Hauptvertrages.");
    p("(2) Für wirtschaftliche Ergebnisse oder steuerliche Auswirkungen der Immobilieninvestments wird keine Haftung übernommen.");
  }

  h1("§ 9 Datenschutz");
  p(`Es gelten die Datenschutzbestimmungen sowie die ${ANLAGE_TITEL_ALT[3]} (Anlage 3).`);

  h1("§ 10 Schlussbestimmungen");
  p("(1) Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts.");
  p("(2) Gerichtsstand ist, soweit zulässig, der Sitz der Gesellschaft (Bad Feilnbach).");
  p("(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.");
}

/* ── Anlage 2: Leistungs- und Preisvereinbarung / Honorarvereinbarung ─── */

export function renderAnlage2LeistungAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet } = t;
  const { paket, bewerber, hasCrmGebuehr, hasOverride, effektiverSatzText } = ctx;
  const anwendungsregel = regelAus(ctx);
  const laufzeitOffen = vertragLaufzeitOffen(paket.id, bewerber);
  const mindestlaufzeit = laufzeitOffen ? 0 : (paket.laufzeitMonate > 0 ? paket.laufzeitMonate : 12);
  const rechnung = rechnungsAnschriftZeilen(bewerber);

  if (paket.partnerHonorar) {
    h1("§ 1 Vertragstyp");
    p(`(1) Diese Anlage regelt die ausschließlich erfolgsabhängige Vergütung des Vertriebspartners im Rahmen des Vertragstyps "${paket.titel}".`);
    p("(2) Eine Onboardinggebühr, Eintrittsgebühr oder laufende Pauschalvergütung wird ausdrücklich nicht erhoben.");

    h1("§ 2 Honorar");
    p(`(1) Das Honorar beträgt ${paket.provisionssatz} % des notariellen Kaufpreises jeder vom Vertriebspartner wirksam vermittelten Kapitalanlageimmobilie inkl. der jeweils gültigen Umsatzsteuer (Bruttobetrag).`);
    p("(2) Berechnungsgrundlage ist ausschließlich der notariell beurkundete Kaufpreis. Nebenkosten (z. B. Grunderwerbsteuer, Notar, Grundbuch, Maklergebühren) sind nicht Bestandteil der Berechnungsgrundlage.");
    p("(3) Der Honoraranspruch entsteht erst, wenn (a) der Kaufvertrag notariell wirksam beurkundet wurde, (b) die Gesellschaft die Provision vom Bauträger / Verkäufer vollständig erhalten hat, (c) keine Rückabwicklung erfolgt und (d) der Vertriebspartner eine ordnungsgemäße Rechnung gestellt hat.");

    h1("§ 3 Im Vertrag enthaltener Leistungs- & Funktionsumfang");
    bullet(paket.features);
    p("Darüber hinaus erhält der Vertriebspartner Zugriff auf die in § 4 (1) des Hauptvertrages aufgeführte allgemeine Vertriebsinfrastruktur.");

    h1("§ 4 Leadkontingent & Leadkostenmodell");
    bullet(LEAD_KLAUSELN_ALT[paket.id]);
    p("Allgemeine CRM- und Leadnutzungsbedingungen ergänzend in Anlage 5.");

    h1("§ 5 Abrechnung & Auszahlung");
    p("Die Abrechnung des Honorars erfolgt monatlich nach Provisionseingang bei der Gesellschaft. Die Auszahlung erfolgt nach Rechnungsstellung des Vertriebspartners innerhalb von 14 Tagen.");

    h1("§ 6 Nutzungsbeschränkungen");
    bullet(NUTZUNGSBESCHRAENKUNGEN);

    h1("§ 7 Geistiges Eigentum");
    p("Alle Inhalte, Marken, Prozesse, Skripte, Vorlagen, Software und Systeme bleiben ausschließliches Eigentum der Gesellschaft. Der Vertriebspartner erwirbt kein Eigentum, sondern lediglich ein nicht übertragbares, widerrufliches Nutzungsrecht.");

    h1("§ 8 Beendigung");
    p("Mit Beendigung des Hauptvertrages enden automatisch sämtliche Nutzungsrechte aus dieser Honorarvereinbarung. Zugänge werden unverzüglich deaktiviert; bereits entstandene, aber noch nicht ausgezahlte Honoraransprüche bleiben hiervon unberührt.");
    return;
  }

  h1("§ 1 Gebuchtes Paket");
  p(`(1) Der Vertriebspartner bucht das Paket "${paket.titel}".`);
  p(paket.preis > 0
    ? "(2) Diese Anlage legt für das gebuchte Paket den vollständigen Leistungsumfang, die einmalige Onboardinggebühr, die Zahlungsweise sowie das paketspezifische Leadkontingent verbindlich fest. Sie ergänzt § 3, § 4 und § 5 des Hauptvertrages, die hierfür ausdrücklich auf Anlage 2 verweisen."
    : "(2) Diese Anlage legt für das gebuchte Paket den vollständigen Leistungsumfang, die vereinbarten Kosten sowie das paketspezifische Leadkontingent verbindlich fest. Sie ergänzt § 3, § 4 und § 5 des Hauptvertrages, die hierfür ausdrücklich auf Anlage 2 verweisen.");

  h1("§ 2 Im Paket enthaltener Leistungs- & Funktionsumfang");
  p(paket.preis > 0
    ? `Im Paket "${paket.titel}" sind die folgenden Leistungen vollständig und abschließend enthalten. Sämtliche Leistungen werden während der gesamten aktiven Vertragslaufzeit bereitgestellt; ein gesondertes Entgelt entsteht hierfür, mit Ausnahme der einmaligen Onboardinggebühr nach § 3 dieser Anlage, ausdrücklich nicht:`
    : `Im Paket "${paket.titel}" sind die folgenden Leistungen vollständig und abschließend enthalten. Sämtliche Leistungen werden während der gesamten aktiven Vertragslaufzeit bereitgestellt; ein gesondertes Entgelt entsteht hierfür ausdrücklich nicht:`);
  bullet(paket.features);
  p("Darüber hinaus erhält der Vertriebspartner Zugriff auf die in § 4 (1) des Hauptvertrages aufgeführte allgemeine Vertriebsinfrastruktur im Umfang des gebuchten Pakets.");

  h1(
    paket.preis > 0 && hasCrmGebuehr
      ? "§ 3 Investition: einmalige Onboardinggebühr & monatliche CRM-Systemgebühr"
      : paket.preis > 0
        ? "§ 3 Investition: einmalige Onboardinggebühr (keine monatliche CRM-Systemgebühr)"
        : hasCrmGebuehr
          ? "§ 3 Investition: monatliche CRM-Systemgebühr"
          : "§ 3 Investition: keine laufenden Kosten",
  );
  const laufzeitSatz = mindestlaufzeit > 0
    ? `Die Mindestlaufzeit beträgt ${mindestlaufzeit} Monate ab Vertragsbeginn; sie gilt einheitlich für den Vertrag und die CRM-Nutzung (§ 14 des Hauptvertrages). Nach Ablauf der Mindestlaufzeit läuft der Vertrag auf unbestimmte Zeit weiter und kann von beiden Parteien mit einer Frist von einem Monat zum Monatsende in Textform (§ 126b BGB, z. B. per E-Mail an office@more.immo) ordentlich gekündigt werden. Eine automatische Verlängerung um feste weitere Zeiträume findet nicht statt.`
    : "Eine Mindestlaufzeit besteht nicht (individuell vereinbart). Der Vertrag und mit ihm die CRM-Nutzung laufen auf unbestimmte Zeit und können von beiden Parteien jederzeit mit einer Frist von einem Monat zum Monatsende in Textform (§ 126b BGB, z. B. per E-Mail an office@more.immo) ordentlich gekündigt werden (§ 14 des Hauptvertrages).";
  if (paket.preis > 0) {
    const zw = ZAHLUNGSWEISEN.find((z) => z.id === ctx.zahlungsweise) ?? ZAHLUNGSWEISEN[0];
    const raten = berechneRaten(paket.preis, zw.id);
    p(`(1) Die einmalige Onboardinggebühr für das Paket "${paket.titel}" beträgt ${formatPreis(paket.preis)} netto zzgl. der jeweils gültigen Umsatzsteuer.`);
    if (paket.einmaligAufschluesselung && paket.einmaligAufschluesselung.length > 0) {
      p("Diese setzt sich zusammen aus:");
      bullet(paket.einmaligAufschluesselung.map((it) => `${it.label}: ${formatPreis(it.betrag)} netto`));
    }
    p(`(2) Vereinbarte Zahlungsweise: ${zw.label}. Ratenplan:`);
    bullet(raten.map((betrag, idx) =>
      `Rate ${idx + 1} von ${raten.length}: ${formatPreis(betrag)} netto, ${idx === 0 ? "fällig sofort bei Vertragsunterzeichnung" : `fällig 30 Tage nach Rate ${idx}`}`,
    ));
    p("(3) Die Zahlung der Onboardinggebühr erfolgt per Überweisung auf das auf der separat zugesandten Rechnung angegebene Konto der Gesellschaft.");
    p("(4) Die Onboardinggebühr ist Entgelt für die einmalige Bereitstellung der Setup-Leistungen (insbesondere persönliche Landingpage, Start-Leadpaket bzw. übernommene Leadkosten gemäß Aufschlüsselung in Absatz 1).");
    if (hasCrmGebuehr) {
      p(`(5) Zusätzlich zur einmaligen Onboardinggebühr entrichtet der Vertriebspartner eine monatliche CRM-Systemgebühr in Höhe von ${formatPreis(paket.monatlich)} brutto/Monat inkl. der jeweils gültigen gesetzlichen Umsatzsteuer. ${laufzeitSatz} Im Übrigen gilt § 4 (3) bis (7) des Hauptvertrages. Die CRM-Systemgebühr deckt die laufende Bereitstellung von CRM, Pipeline, Academy, Objektzugängen und Support ab und wird monatlich im Voraus abgerechnet.`);
    } else {
      p("(5) Eine monatliche CRM-Systemgebühr wird für dieses Paket ausdrücklich nicht erhoben. Die CRM-Nutzung ist während der aktiven Zusammenarbeit vollständig abgegolten.");
    }
    if (rechnung.length > 0) p(`(6) Rechnungen der Gesellschaft werden an folgende Rechnungsanschrift gestellt: ${rechnung.join(", ")}.`);
  } else if (hasCrmGebuehr) {
    // Brutto, wie in lizenzPakete.ts und im Hauptvertrag. Hier stand "netto
    // zzgl. USt.", also 178,50 EUR statt 150 EUR.
    p(`(1) Im Paket "${paket.titel}" fällt ausschließlich eine monatliche CRM-Systemgebühr in Höhe von ${formatPreis(paket.monatlich)} brutto/Monat inkl. der jeweils gültigen gesetzlichen Umsatzsteuer an. Ein Einmalbetrag wird nicht vereinbart.`);
    p(`(2) ${laufzeitSatz}`);
    p("(3) Das Recht zur außerordentlichen Kündigung aus wichtigem Grund (§ 314 BGB, § 89a HGB) bleibt unberührt.");
    p("(4) Die CRM-Systemgebühr deckt die laufende Bereitstellung von CRM, Pipeline, Academy, Objektzugängen und Support ab und wird monatlich im Voraus per Überweisung oder SEPA-Lastschrift abgerechnet; bei unterjährigem Beginn pro rata temporis.");
    p("(5) Die Gesellschaft kann die CRM-Systemgebühr mit einer Ankündigungsfrist von 3 Monaten zum Monatsende anpassen; bei einer Erhöhung steht dem Vertriebspartner ein Sonderkündigungsrecht zum Wirksamkeitsdatum zu.");
    p("(6) Eine Ratenwahl entfällt, da kein Einmalbetrag vereinbart ist.");
    if (rechnung.length > 0) p(`(7) Rechnungen der Gesellschaft werden an folgende Rechnungsanschrift gestellt: ${rechnung.join(", ")}.`);
  } else {
    p(`(1) Im Paket "${paket.titel}" werden für diesen Vertrag individuell keine Gebühren erhoben, weder einmalig noch laufend.`);
    p("(2) Die monatliche CRM-Systemgebühr entfällt für diesen Vertriebspartner. Die Bereitstellung von CRM, Pipeline, Academy und Support erfolgt unentgeltlich.");
    p("(3) Die Nutzung des CRM-Systems more.immo sowie der in § 4 (1) des Hauptvertrages genannten Vertriebsinfrastruktur ist während der gesamten aktiven Zusammenarbeit vollständig abgedeckt; laufende oder wiederkehrende Gebühren entstehen ausdrücklich nicht.");
    p("(4) Die Vergütung des Vertriebspartners erfolgt ausschließlich erfolgsabhängig gemäß Anlage 4 (Provisionsordnung).");
    p("(5) Eine Ratenwahl entfällt mangels Einmalbetrag.");
    p("(6) Eine Mindestlaufzeit besteht nicht; der Vertrag läuft nach § 14 des Hauptvertrages auf unbestimmte Zeit und ist monatlich kündbar.");
  }

  h1(OVERHEAD_AKTIV ? "§ 4 Paketbezogene Provisions- & Strukturkonditionen" : "§ 4 Paketbezogene Provisionskonditionen");
  if (hasOverride) {
    p(`(1) Individuell vereinbarte Provisionssätze dieses Vertrages: ${effektiverSatzText}. ${anwendungsregel} Diese Sätze ersetzen den Standardsatz des Pakets (${paket.provisionssatz}%) überall dort, wo ein individueller Satz vereinbart ist (§ 8 (1a) des Hauptvertrages).`);
  } else {
    p(`(1) Standardprovision dieses Pakets: ${paket.provisionssatz}% des notariellen Kaufpreises der vermittelten Immobilie.`);
  }
  if (OVERHEAD_AKTIV) {
    if (paket.juniorOverride) {
      p(`(2) Strukturvergütung dieses Pakets: ${paket.juniorOverride} Prozentpunkte Overhead-Provision auf den notariellen Kaufpreis jedes Abschlusses eines geworbenen und aktiv geführten Vertriebspartners.`);
    } else {
      p("(2) Eine Strukturvergütung (Overhead auf Vertriebspartner-Abschlüsse) ist in diesem Paket nicht enthalten.");
    }
    p("(3) Die vollständigen Provisionsregelungen, Voraussetzungen und Auszahlungsmodalitäten ergeben sich aus Anlage 4 (\"Provisionsordnung\"); ergänzende Strukturregelungen für Team Lead / Lizenzpartner aus Anlage 7.");
  } else {
    p("(2) Die vollständigen Provisionsregelungen, Voraussetzungen und Auszahlungsmodalitäten ergeben sich aus Anlage 4 (\"Provisionsordnung\").");
  }

  h1("§ 5 Paketbezogenes Leadkontingent & Leadkostenmodell");
  p("Für das gebuchte Paket gelten folgende, verbindliche Lead-Konditionen:");
  bullet(LEAD_KLAUSELN_ALT[paket.id]);
  p("Allgemeine CRM- und Leadnutzungsbedingungen ergänzend in Anlage 5.");

  h1("§ 6 Nutzungsbeschränkungen");
  bullet(NUTZUNGSBESCHRAENKUNGEN);

  h1("§ 7 Geistiges Eigentum");
  p("Alle Inhalte, Marken, Prozesse, Skripte, Vorlagen, Software und Systeme bleiben ausschließliches Eigentum der Gesellschaft. Der Vertriebspartner erwirbt kein Eigentum, sondern lediglich ein nicht übertragbares, widerrufliches Nutzungsrecht im Umfang des gebuchten Pakets.");

  h1("§ 8 Beendigung der Paketnutzung");
  p("Mit Beendigung des Hauptvertrages endet automatisch jedes Nutzungsrecht aus dem gebuchten Paket. Zugänge werden unverzüglich deaktiviert; etwaige Kopien, Exporte oder Sicherungen sind zu vernichten und die Vernichtung ist auf Verlangen schriftlich zu bestätigen. Für schuldhafte Verstöße gegen §§ 6 und 8 gilt § 9e des Hauptvertrages.");

  h1("§ 9 Andere Pakete");
  p(paket.preis > 0
    ? "Sämtliche von der Gesellschaft sonst angebotenen Pakete sind nicht Bestandteil dieses Vertrages. Ein Wechsel des Pakets bedarf einer gesonderten schriftlichen Vereinbarung; bereits gezahlte Einmalbeträge werden in diesem Fall auf das neue Paket angerechnet."
    : "Sämtliche von der Gesellschaft sonst angebotenen Pakete sind nicht Bestandteil dieses Vertrages. Ein Wechsel des Pakets bedarf einer gesonderten schriftlichen Vereinbarung.");
}

const NUTZUNGSBESCHRAENKUNGEN = [
  "Weitergabe von Zugangsdaten ist untersagt",
  "Kopieren von Schulungen, Skripten und Vorlagen ist untersagt",
  "Vertrieb außerhalb genehmigter Strukturen ist untersagt",
  "Reverse Engineering von Prozessen und Software ist untersagt",
  "Nutzung der Marke MOREImmo nach Vertragsende ist untersagt",
];

/* ── Anlage 3: AVV inkl. Verschwiegenheitserklärung ───────────────────── */

export function renderAnlage3AvvAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet, spacer } = t;
  const { bewerber, paket } = ctx;
  const vpName = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "[Vertriebspartner]";

  h1("Präambel");
  p("Die Parteien schließen diese Vereinbarung gemäß Art. 28 DSGVO zur Verarbeitung personenbezogener Daten im Rahmen der Vermittlung von Kapitalanlageimmobilien. Verantwortlicher im Sinne der DSGVO ist die MOREImmo; der Vertriebspartner wird als Auftragsverarbeiter tätig, soweit er personenbezogene Daten der Gesellschaft im Auftrag verarbeitet. Für seine Eigenkontakte ist der Vertriebspartner selbst Verantwortlicher (§ 1).");

  h1("§ 1 Gegenstand, Dauer und Rollenverteilung");
  p("Gegenstand: Verarbeitung von Interessenten-, Kunden- und Investmentdaten zur Vermittlung von Kapitalanlageimmobilien sowie zur Nutzung des CRM-Systems der Gesellschaft.");
  p("Dauer: Diese Vereinbarung läuft, solange der zugrundeliegende Handelsvertretervertrag besteht, und endet automatisch mit dessen Beendigung.");
  // Klarstellung der Rollen nach der Kontaktzuordnung des § 9a: Für
  // Gesellschaftskontakte ist der Partner Auftragsverarbeiter, für seine
  // Eigenkontakte eigener Verantwortlicher.
  p("Rollenverteilung: Für Gesellschaftskontakte (§ 9a Absatz 2 des Hauptvertrages) ist die Gesellschaft Verantwortliche und der Vertriebspartner Auftragsverarbeiter; diese Vereinbarung gilt für sie in vollem Umfang. Für seine Eigenkontakte (§ 9a Absatz 3 des Hauptvertrages) ist der Vertriebspartner selbst Verantwortlicher im Sinne des Art. 4 Nr. 7 DSGVO. Er trägt insoweit allein die Verantwortung für die Rechtsgrundlage der Verarbeitung, die Information der Betroffenen (Art. 13 und 14 DSGVO) und die Wahrung der Betroffenenrechte. Soweit Eigenkontakte im CRM-System der Gesellschaft gespeichert werden, stellt die Gesellschaft dem Vertriebspartner das System hierfür als technische Plattform zur Verfügung; die technischen und organisatorischen Maßnahmen nach § 6 gelten auch für diese Daten.");

  h1("§ 2 Art und Zweck der Verarbeitung");
  bullet(["Kundenberatung", "Immobilienvermittlung", "Finanzierungsvorprüfung", "CRM-Nutzung", "Leadbearbeitung & Pipeline-Pflege", "Kommunikation per E-Mail, Telefon, Chat"]);

  h1("§ 3 Art der Daten und Kategorien Betroffener");
  bullet([
    "Stammdaten (Name, Anschrift, Geburtsdatum, Kontaktdaten)",
    "Vertragsdaten (Investmentdaten, Kaufpreise, Notarunterlagen)",
    "Bonitätsdaten (Einkommen, Beschäftigung, SCHUFA)",
    "Kommunikationsdaten (E-Mails, Chatverläufe, Anrufnotizen)",
  ]);
  p("Kategorien: Interessenten/Leads, Kunden/Käufer, Empfehlungsgeber.");

  h1("§ 4 Pflichten des Auftragsverarbeiters");
  bullet([
    "Verarbeitung ausschließlich auf dokumentierte Weisung des Verantwortlichen",
    "Daten vertraulich behandeln und nicht unbefugt weitergeben",
    "ausschließlich DSGVO-konforme Systeme verwenden",
    "TOMs gemäß § 6 einhalten",
    "Unterstützung bei Betroffenenrechten (Auskunft, Berichtigung, Löschung)",
    "Meldung von Datenpannen innerhalb von 24 Stunden",
  ]);

  h1("§ 5 Unterauftragsverhältnisse");
  p("Unterauftragsverarbeiter dürfen nur mit vorheriger schriftlicher Zustimmung der Gesellschaft eingesetzt werden. Die von der Gesellschaft selbst eingesetzten Plattform-Dienstleister (Hosting und Datenbank in der EU) werden dem Vertriebspartner auf Anfrage benannt.");

  h1("§ 6 Technische und organisatorische Maßnahmen (TOM)");
  bullet([
    "Zugangskontrolle: Authentifizierung über E-Mail/Passwort, optional 2FA",
    "Zugriffskontrolle: rollenbasierte Berechtigungen, Row-Level-Security",
    "Übertragungskontrolle: TLS 1.2+ für alle Verbindungen",
    "Eingabekontrolle: Audit-Log-Protokollierung relevanter Änderungen",
    "Verfügbarkeit: tägliche Backups, 30 Tage Retention, Point-in-Time-Recovery",
    "Verschlüsselung: Daten in Ruhe (at rest) verschlüsselt, sensible Dokumente nur über signierte URLs zugänglich",
  ]);

  h1("§ 7 Löschung und Rückgabe");
  p("Nach Beendigung sind sämtliche personenbezogenen Daten unverzüglich zu löschen oder, nach Wahl des Verantwortlichen, zurückzugeben. Sicherungskopien werden binnen 30 Tagen vernichtet, soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen. Die Löschung ist auf Verlangen schriftlich zu bestätigen. Eigenkontakte des Vertriebspartners (§ 9a Absatz 3 des Hauptvertrages) sind hiervon ausgenommen; sie bleiben sein Eigentum und in seiner datenschutzrechtlichen Verantwortung (§ 1).");

  h1("§ 8 Kontrollrechte");
  p("Die Gesellschaft hat das Recht, die vereinbarten TOMs zu kontrollieren, im Regelfall durch Anforderung aktueller Audit-Nachweise.");

  spacer(3);
  h1("Teil II: Verschwiegenheitserklärung");
  p(`Verpflichtete Person: ${vpName}`);

  h1("§ 9 Verpflichtung zur Verschwiegenheit");
  p("(1) Die verpflichtete Person verpflichtet sich, über sämtliche im Rahmen der Tätigkeit für die MOREImmo bekannt gewordenen Informationen Stillschweigen zu bewahren. Dies umfasst insbesondere personenbezogene Daten von Kunden, Interessenten, Mitarbeitenden und Empfehlungsgebern, Betriebs- und Geschäftsgeheimnisse, Geschäftsstrategien, Konditionen, Provisionsstrukturen, Objektpipelines, Eigentümerdaten, Kalkulationen, CRM-Inhalte sowie sämtliche Schulungs- und Vertriebsunterlagen.");
  p("(2) Die Verpflichtung gilt für Geschäftsgeheimnisse zeitlich unbeschränkt und besteht auch nach Beendigung der Tätigkeit fort; im Übrigen gilt § 11 (2) des Hauptvertrages.");
  p("(3) Eine Weitergabe vertraulicher Informationen an Dritte, auch innerhalb derselben Unternehmensgruppe oder an Familienangehörige, ist ohne vorherige schriftliche Zustimmung der Gesellschaft untersagt.");

  h1("§ 10 Pflichten im Umgang mit Daten");
  bullet([
    "vertrauliche Dokumente sicher aufbewahren und vor unbefugtem Zugriff schützen",
    "keine Kopien, Fotos, Screenshots oder Exporte außerhalb genehmigter Systeme erstellen",
    "Zugangsdaten geheim halten und nicht an Dritte weitergeben",
    "bei Verlust oder Diebstahl von Daten/Geräten unverzügliche Meldung an die Gesellschaft",
    "nach Vertragsende sämtliche Unterlagen und Kopien unverzüglich vernichten oder zurückgeben",
  ]);

  h1("§ 11 Folgen von Verstößen");
  p(paket.partnerHonorar
    ? "(1) Bei schuldhaften Verstößen gegen §§ 9 und 10 richten sich die Ansprüche der Gesellschaft nach § 9e des Hauptvertrages (allgemeine gesetzliche Vorschriften). Diese Anlage begründet keine Vertragsstrafe."
    : "(1) Für schuldhafte Verstöße gegen §§ 9 und 10 gilt ausschließlich die Vertragsstrafenregelung des § 9e des Hauptvertrages. Diese Anlage begründet keine weitere oder abweichende Vertragsstrafe.");
  p("(2) Soweit Verstöße gleichzeitig Straftatbestände (insbesondere § 23 GeschGehG, §§ 202a ff., 203 StGB, Art. 83 DSGVO) erfüllen, behält sich die Gesellschaft strafrechtliche Schritte ausdrücklich vor.");

  h1("§ 12 Unterlassungsanspruch");
  p("Bei Verstößen kann die Gesellschaft Unterlassung sowie Beseitigung verlangen. Im Eilfall ist sie berechtigt, eine einstweilige Verfügung ohne vorherige Abmahnung zu beantragen.");

  h1("§ 13 Schlussbestimmungen");
  p("(1) Änderungen und Ergänzungen bedürfen der Schriftform. Dies gilt auch für die Aufhebung dieses Schriftformerfordernisses.");
  p("(2) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen unberührt.");
  p("(3) Gerichtsstand ist, soweit zulässig, der Sitz der Gesellschaft. Es gilt deutsches Recht.");
}

/* ── Anlage 4: Provisionsordnung ──────────────────────────────────────── */

export function renderAnlage4ProvisionAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, infoBox } = t;
  const { paket, hasOverride, effektiverSatzText } = ctx;
  const anwendungsregel = regelAus(ctx);

  h1("§ 1 Provisionsmodell für das gebuchte Paket");
  infoBox(
    hasOverride
      ? `Gebuchtes Paket: ${paket.titel} - individuell vereinbarte Provisionssätze`
      : `Gebuchtes Paket: ${paket.titel} - ${paket.provisionssatz}% Standardprovision`,
    "Berechnungsgrundlage: notarieller Kaufpreis",
  );
  if (OVERHEAD_AKTIV && paket.juniorOverride) {
    p(`Zusätzlich ${paket.juniorOverride} Prozentpunkte Overhead-Provision auf Abschlüsse geworbener Vertriebspartner.`);
  }

  // Nur das gebuchte Paket. Die frühere Übersicht aller sieben Pakete samt
  // Altpaketen und "Tippgeber: 0 %" hatte keine Regelungswirkung und verriet
  // Konditionen anderer Modelle.
  h1("§ 2 Geltende Provisionssätze");
  if (hasOverride) {
    p(`(1) Für diesen Vertrag gelten die individuell vereinbarten Provisionssätze: ${effektiverSatzText}.`);
    p(`(2) ${anwendungsregel}`);
    p(`(3) Die individuell vereinbarten Sätze gehen dem Standardsatz des Pakets "${paket.titel}" (${paket.provisionssatz}%) und jeder anderen Provisionsangabe vor (§ 8 (1a) des Hauptvertrages).`);
  } else {
    p(`(1) Für diesen Vertrag gilt der Standardsatz des Pakets "${paket.titel}": ${paket.provisionssatz}% des notariellen Kaufpreises jeder wirksam vermittelten Kapitalanlageimmobilie.`);
    p("(2) Individuelle Provisionssätze sind nicht vereinbart.");
  }
  p(OVERHEAD_AKTIV
    ? "Sämtliche in dieser Provisionsordnung genannten Provisions- und Override-Sätze verstehen sich als Bruttobeträge inkl. der jeweils gültigen gesetzlichen Umsatzsteuer."
    : "Sämtliche in dieser Provisionsordnung genannten Provisionssätze verstehen sich als Bruttobeträge inkl. der jeweils gültigen gesetzlichen Umsatzsteuer.");

  h1("§ 3 Voraussetzungen für den Provisionsanspruch");
  p("Provisionen entstehen nur, wenn (a) der Kaufvertrag notariell wirksam beurkundet wurde, (b) die Gesellschaft die Provision vollständig erhalten hat, (c) keine Rückabwicklung erfolgt und (d) der Vertriebspartner eine ordnungsgemäße Rechnung gestellt hat.");

  h1("§ 4 Rückforderung bei Rückabwicklung");
  p("(1) Bei Rückabwicklung des Kaufvertrags oder Nichtzahlung des Kunden entfällt der Provisionsanspruch. Bereits ausgezahlte Provisionen sind unverzüglich zurückzuzahlen oder werden mit zukünftigen Provisionen verrechnet.");
  p("(2) Die Gesellschaft ist berechtigt, Provisionen zurückzufordern, wenn Kaufverträge rückabgewickelt werden, Kunden falsche Angaben gemacht haben oder der Vertriebspartner gegen Vertragspflichten verstoßen hat.");

  h1("§ 5 Eigenprovisionen");
  p("Eigengeschäfte (Erwerb durch den Vertriebspartner selbst oder durch nahe Angehörige) sind vor Abschluss schriftlich offenzulegen. Über die Provisionsfähigkeit entscheidet die Gesellschaft im Einzelfall.");

  // Der Overhead-Paragraph entfällt, solange die Overhead-Provision
  // abgeschaltet ist; die folgenden Paragraphen rücken dann eine Nummer auf.
  const nr = (n: number) => `§ ${OVERHEAD_AKTIV ? n : n - 1}`;
  if (OVERHEAD_AKTIV) {
    h1("§ 6 Overhead-Provision (Strukturvergütung)");
    p("Vertriebspartner der Pakete Team Lead und Lizenzpartner erhalten zusätzlich zur eigenen Provision eine Overhead-Provision auf sämtliche Abschlüsse der von ihnen geworbenen und aktiv geführten Vertriebspartner: Team Lead 1,5 Prozentpunkte, Lizenzpartner 2,0 Prozentpunkte - jeweils auf den notariellen Kaufpreis des Junior-Abschlusses. Für die Pakete Vertriebspartner und Lead Partner ist keine Overhead-Provision vorgesehen. Eine darüber hinausgehende, separate Untervertriebs- oder Sub-Provision wird nicht vergütet; sämtliche strukturbezogenen Vergütungsansprüche sind mit der Overhead-Provision abschließend abgegolten. Ergänzende organisatorische Regelungen siehe Anlage 7.");
  }
  h1(`${nr(7)} Leadkosten`);
  p(paket.preis > 0
    ? "Paketabhängige Leadkosten gemäß Anlage 2 § 5 werden mit den Provisionsansprüchen verrechnet."
    : `Eine Verrechnung von Leadkosten mit Provisionsansprüchen findet nicht statt. Ein optional gebuchtes Leadpaket wird gesondert nach der Leadpaket-Vereinbarung (${LEADPAKET_ANLAGE_NUMMER_ALT}) abgerechnet (§ 8 (3) des Hauptvertrages).`);
  h1(`${nr(8)} Abrechnung & Auszahlung`);
  p("Die Abrechnung erfolgt monatlich nach Provisionseingang bei der Gesellschaft; die Auszahlung erfolgt nach Rechnungsstellung des Vertriebspartners innerhalb von 14 Tagen.");
  // Keine vertragliche Ausschlussfrist mehr: Vorher verfielen Ansprüche, die
  // nicht binnen zwölf Monaten geltend gemacht wurden. Es gilt die
  // gesetzliche Verjährung.
  h1(`${nr(9)} Verjährung von Provisionsansprüchen`);
  p("(1) Provisionsansprüche des Vertriebspartners verjähren nach den gesetzlichen Vorschriften (§§ 195, 199 BGB). Eine vertragliche Ausschlussfrist wird nicht vereinbart.");
  p("(2) Der gesetzliche Anspruch des Vertriebspartners auf Abrechnung und Buchauszug (§ 87c HGB) bleibt unberührt.");
  // Für alle Pakete dieselbe Regel: Änderungen nur einvernehmlich in
  // Textform. Vorher durfte die Gesellschaft die Provisionsordnung mit drei
  // Monaten Vorlauf einseitig anpassen.
  h1(`${nr(10)} Änderung der Provisionsordnung`);
  p("(1) Eine Änderung dieser Provisionsordnung, insbesondere der in § 2 genannten Provisions- bzw. Honorarsätze sowie sonstiger wirtschaftlicher Kernkonditionen, bedarf der einvernehmlichen Vereinbarung beider Parteien in Textform. Eine einseitige Änderung durch die Gesellschaft ist ausgeschlossen; die vereinbarten Sätze gelten unverändert fort, bis die Parteien etwas anderes vereinbaren.");
  p("(2) Rein redaktionelle, klarstellende oder zwingend gesetzlich bzw. aufsichtsrechtlich erforderliche Anpassungen bleiben hiervon unberührt, soweit sie die wirtschaftliche Position des Vertriebspartners nicht zu seinem Nachteil verändern.");
  p("(3) Bereits entstandene Provisions- bzw. Honoraransprüche bleiben in jedem Fall unberührt. Bei Widersprüchen zwischen Hauptvertrag und dieser Provisionsordnung gehen die Regelungen dieser Provisionsordnung vor.");
  h1(`${nr(11)} Individuelle Anpassung des Verkaufspreises (Zusatzmarge)`);
  p("(1) Der Vertriebspartner und die Gesellschaft sind sich einig, dass der ausgewiesene Verkaufs- bzw. notarielle Kaufpreis eines Objekts nach vorheriger Abstimmung im Einzelfall angepasst werden kann, um dem Vertriebspartner eine zusätzliche wirtschaftliche Marge zu ermöglichen.");
  p("(2) Eine solche Preisanpassung ist ausschließlich innerhalb des vom jeweiligen Bauträger, Projektentwickler bzw. Verkäufer freigegebenen Preiskorridors zulässig und bedarf der vorherigen Freigabe durch die Gesellschaft in Textform (z. B. per E-Mail). Zulässig sind ausschließlich Anpassungen, die für den Endkunden wirtschaftlich darstellbar und marktgerecht sind.");
  p(`(3) Ein etwaiger Mehrerlös aus einer freigegebenen Preisanpassung wird gesondert einzelvertraglich zwischen der Gesellschaft und dem Vertriebspartner geregelt und ist von der regulären Provisionsabrechnung nach ${nr(8)} unabhängig. Ansprüche des Endkunden bleiben in jedem Fall unberührt.`);
}

/* ── Anlage 5: CRM- & Leadnutzungsbedingungen ─────────────────────────── */

export function renderAnlage5CrmAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet } = t;
  const { paket, hasCrmGebuehr } = ctx;
  const schutzMonate = paket.partnerHonorar ? SCHUTZFRIST_MONATE_PARTNER : SCHUTZFRIST_MONATE;

  h1("§ 1 Geltungsbereich");
  p("Diese Bedingungen regeln die Nutzung des CRM-Systems more.immo, der Kundendaten, der Leads, der Kommunikationssysteme und der Vertriebsinfrastruktur durch den Vertriebspartner.");
  h1("§ 2 Eigentum");
  p("Sämtliche CRM-Systeme, Datenbanken, Leads, Kontakte der Gesellschaft, Automationen, Prozesse, Vorlagen und Vertriebsdaten bleiben ausschließlich Eigentum der Gesellschaft, auch nach Vertragsende. Dem Vertriebspartner wird lediglich ein widerrufliches, nicht übertragbares Nutzungsrecht eingeräumt. Eigenkontakte des Vertriebspartners (§ 9a Absatz 3 des Hauptvertrages) sind und bleiben sein Eigentum, auch nach Vertragsende.");
  h1("§ 3 Leaddefinition");
  bullet([
    "Interessentenanfragen über Website, Funnel oder Anzeigen",
    "Terminbuchungen",
    "Kundenkontakte aus dem Bestand der Gesellschaft",
    "Empfehlungen aus dem Empfehlungsprogramm",
    "Bewerberdaten aus dem Recruiting",
    "Social-Media-Anfragen",
    "Bestandskundenkontakte (Reaktivierung)",
    "Eventkontakte",
    "Finanzierungsanfragen",
  ]);
  h1("§ 4 Nutzung der Leads");
  p("Leads dürfen ausschließlich zur Vermittlung von Kapitalanlageimmobilien innerhalb des MOREImmo Systems genutzt werden. Untersagt sind insbesondere:");
  bullet([
    "Weitergabe an Dritte",
    "Verkauf oder Vermietung von Lead-Daten",
    "private Nutzung",
    "Nutzung für Konkurrenzangebote",
    "Speicherung außerhalb freigegebener Systeme",
    "Export ohne ausdrückliche Genehmigung",
  ]);
  h1("§ 5 Leadschutz und Zuordnung");
  p("Die Leadzuweisung erfolgt ausschließlich durch die Gesellschaft bzw. das CRM-System.");
  p(`Verbindliches Leadkontingent und Leadkostenmodell des gebuchten Pakets "${paket.titel}":`);
  bullet(LEAD_KLAUSELN_ALT[paket.id]);
  p("Ein darüber hinausgehender Anspruch auf eine bestimmte Leadmenge besteht nicht. Die hier dargestellten Kontingente und Kostenregelungen sind verbindlich und ergänzen § 9 des Hauptvertrages.");
  h1("§ 5a Leadqualität und Ersatzleads");
  p("(1) Ein Lead gilt als geliefert, sobald dieser dem Vertriebspartner im CRM-System der Gesellschaft zugewiesen wurde.");
  p("(2) Die Gesellschaft bemüht sich um eine laufende Qualitätskontrolle der Leads.");
  p(`(3) Der Vertriebspartner erhält einen Ersatzlead, wenn der Lead nachweislich ein Fake-Kontakt ist, seine Kontaktdaten falsch sind, er eine Dublette ist, er sich versehentlich eingetragen oder seine Eintragung widerrufen hat oder wenn er die Qualitätskriterien eines gebuchten Leadpakets (${LEADPAKET_ANLAGE_NUMMER_ALT} § 2) verfehlt. Die Reklamation ist binnen ${ERSATZLEAD_FRIST_TAGE} Tagen nach Zuweisung in Textform zu erklären.`);
  p("(4) Dubletten werden durch die CRM-Systeme der Gesellschaft automatisiert erkannt und nach Möglichkeit bereits vor Zuweisung ausgeschlossen.");
  // Wortgleich mit Anlage 9 § 3 (1) (a). Vorher: "Nichterreichbarkeit
  // begründet keinen Austausch", in Anlage 9 das Gegenteil.
  p(`(5) Ein nicht erreichbarer Lead wird ersetzt, wenn gilt: ${ERSATZLEAD_UNERREICHBAR} Maßgeblich ist das Kontaktprotokoll im CRM-System; dort nicht dokumentierte Kontaktversuche bleiben unberücksichtigt.`);
  p("(6) Fehlende Rückmeldungen nach erfolgtem Kontakt, Terminabsagen, mangelndes Kaufinteresse oder ein späterer Nichtabschluss begründen keinen Anspruch auf Austausch oder Erstattung eines Leads. Die Gesellschaft schuldet qualifizierte Leads, keinen Vermittlungserfolg.");
  p(`(7) Für ein gebuchtes Leadpaket gilt ergänzend ${LEADPAKET_ANLAGE_NUMMER_ALT}; die dortige Ersatzlead-Regelung ist mit diesem § 5a inhaltsgleich.`);
  h1("§ 6 Bearbeitungspflichten");
  bullet([
    "Leads zeitnah kontaktieren",
    "CRM-Einträge vollständig pflegen",
    "Gesprächsnotizen dokumentieren",
    "Statusänderungen aktuell halten",
    "Termine und Follow-Ups eintragen",
  ]);
  h1("§ 7 CRM-Zugänge");
  p("CRM-Zugänge sind personenbezogen. Mehrfachnutzung oder Weitergabe sind untersagt.");
  p(!hasCrmGebuehr && paket.preis > 0
    ? "Die Nutzung des CRM-Systems ist über die einmalige Onboardinggebühr während der gesamten aktiven Zusammenarbeit mit der Gesellschaft vollständig abgedeckt. Es entstehen keine monatlichen oder laufenden CRM-Folgekosten."
    : !hasCrmGebuehr
      ? "Die Nutzung des CRM-Systems ist während der gesamten aktiven Zusammenarbeit mit der Gesellschaft vollständig abgedeckt. Es entstehen keine monatlichen oder laufenden CRM-Folgekosten."
      : "Die Nutzung des CRM-Systems ist über die monatliche CRM-Systemgebühr nach Anlage 2 abgedeckt; Laufzeit und Kündigung richten sich einheitlich nach § 14 des Hauptvertrages.");
  // Dieselbe Definition wie § 9a des Hauptvertrages. Vorher erklärte dieser
  // Absatz jeden bearbeiteten Kontakt "unabhängig von seiner Herkunft" zum
  // Gesellschaftskontakt und widersprach damit § 9a (3).
  h1("§ 8 Eigentum an Kontakten, Daten- und Bauträgerschutz");
  p("(1) Gesellschaftskontakte im Sinne von § 9a Absatz 2 des Hauptvertrages, also alle Kunden, Interessenten, Leads, Empfehlungsgeber, Bauträger, Projektentwickler, Objektanbieter und Tippgeber, die der Vertriebspartner nicht selbst im CRM-System angelegt hat, sind Kontakte und Eigentum der Gesellschaft. Eigenkontakte im Sinne von § 9a Absatz 3 des Hauptvertrages, also Kontakte, die der Vertriebspartner selbst manuell oder per Datei-Import (CSV) im CRM-System angelegt hat, sind und bleiben Eigentum des Vertriebspartners, auch nach Vertragsende. Alle Kontakte, die über die Gesellschaft bearbeitet werden, sind vollständig im CRM-System der Gesellschaft zu erfassen und zu pflegen.");
  p("(2) Während der Vertragslaufzeit ist es untersagt, Gesellschaftskontakte, Bauträger- oder Projektbeziehungen aus dem CRM bzw. aus dem Geschäftsbereich der Gesellschaft für eigene Zwecke oder für Dritte abzuwerben, zu nutzen, zu vermitteln oder weiterzugeben. Datenexport und Datenweitergabe außerhalb der freigegebenen Systeme sind während der Vertragslaufzeit und nach Vertragsende untersagt.");
  p(`(3) Nach Vertragsende besteht kein Wettbewerbsverbot. Die Daten der Gesellschaftskontakte sowie die Bauträger- und Geschäftspartnerdaten bleiben jedoch Eigentum und Geschäftsgeheimnis der Gesellschaft: Sie sind nach § 10 dieser Anlage und § 9f des Hauptvertrages herauszugeben und zu löschen und dürfen für ${schutzMonate} Monate nach Vertragsende weder genutzt noch weitergegeben noch verwertet werden.`);
  p("(4) Die Regelungen der §§ 9a, 9b, 9c und 9d des Hauptvertrages (Kunden-, Lead-, Herkunfts-, Bauträger-, Dubletten- und Geschäftschancenschutz) gelten ergänzend und vollumfänglich auch im Rahmen dieser Anlage 5 und werden hierdurch nicht eingeschränkt.");
  p("(5) Bei Konflikten zwischen dieser Anlage und den §§ 9a bis 9d des Hauptvertrages gehen die Regelungen des Hauptvertrages vor.");
  h1("§ 9 Folgen von Verstößen");
  p(paket.partnerHonorar
    ? "Bei einem schuldhaften Verstoß gegen diese Anlage, insbesondere gegen § 8, richten sich die Ansprüche der Gesellschaft nach § 9e des Hauptvertrages (allgemeine gesetzliche Vorschriften). Der Auskunfts- und Herausgabeanspruch nach § 9f des Hauptvertrages bleibt unberührt."
    : "Für schuldhafte Verstöße gegen diese Anlage, insbesondere gegen § 8, gilt ausschließlich die Vertragsstrafenregelung des § 9e des Hauptvertrages. Diese Anlage begründet keine weitere oder abweichende Vertragsstrafe. Der Auskunfts- und Herausgabeanspruch nach § 9f des Hauptvertrages bleibt unberührt.");
  h1("§ 10 Löschung und Rückgabe");
  p("Nach Vertragsende sind sämtliche Kundendaten, Leads, Exporte, Dokumente, Listen und Aufzeichnungen der Gesellschaft unverzüglich zu löschen. Auf Verlangen ist die Löschung schriftlich nachzuweisen. Eigenkontakte (§ 9a Absatz 3 des Hauptvertrages) und die eigenen Kontaktdaten zu ihnen darf der Vertriebspartner behalten; sie bleiben sein Eigentum.");
  h1("§ 11 Monitoring");
  p("Die Gesellschaft ist berechtigt, CRM-Aktivitäten technisch zu protokollieren (Logins, Exporte, Kommunikation, Leadbewegungen, Bearbeitungszeiten) zur Qualitätskontrolle, Sicherheit und Vertragsdurchführung. Die Protokollierung dient nicht der Leistungs- oder Verhaltenskontrolle im arbeitsrechtlichen Sinne.");
}

/* ── Anlage 6: Compliance ─────────────────────────────────────────────── */

export function renderAnlage6ComplianceAlt(t: KlauselTools): void {
  const { h1, p, bullet } = t;
  h1("§ 1 Pflichtvorgaben für die Beratung");
  bullet([
    "keine steuerliche Beratung durchführen (Vorbehalt § 2 StBerG)",
    "keine Garantien hinsichtlich Wertentwicklung oder Mietrendite versprechen",
    "keine unrealistischen Renditen darstellen",
    "keine Falschaussagen über Objekte, Lage, Zustand oder Vermietung tätigen",
    "keine unerlaubte Finanzierungsvermittlung (§ 34i GewO beachten)",
    "keine Versicherungsvermittlung ohne entsprechende Erlaubnis (§ 34d GewO)",
  ]);
  h1("§ 2 Pflicht-Hinweise gegenüber Kunden");
  p("Kunden sind in jeder Beratung darauf hinzuweisen, dass:");
  bullet([
    "Immobilieninvestments mit Risiken verbunden sind (Marktrisiko, Mietausfall, Sanierungsbedarf)",
    "steuerliche Vorteile individuell durch einen Steuerberater zu prüfen sind",
    "Finanzierungen bankabhängig und nicht garantiert sind",
    "vergangene Wertentwicklungen keine Garantie für die Zukunft darstellen",
  ]);
  h1("§ 3 Beratungsdokumentation");
  p("Jede Beratung ist im CRM vollständig zu dokumentieren (Gesprächsdatum, Inhalt, gezeigte Objekte, Risikohinweise, Folgeaktionen). Die Dokumentation dient als Nachweis für die ordnungsgemäße Beratung im Streitfall.");
  h1("§ 4 Werberichtlinien");
  p('Unzulässig sind insbesondere Aussagen wie "garantierte Rendite", "risikofrei", "steuerfrei", "sichere Gewinne", "Spitzenrendite ohne Risiko". Sämtliche Werbeaussagen müssen sachlich richtig und nachprüfbar sein (§§ 3, 5 UWG).');
  h1("§ 5 Social-Media-Richtlinien");
  p("Werbematerialien, Reels, Posts und Social-Media-Anzeigen, die das MOREImmo-System, Objekte oder Provisionsstrukturen darstellen, dürfen nur nach vorheriger schriftlicher Freigabe durch die Gesellschaft veröffentlicht werden. Verstöße können zur sofortigen Sperrung führen.");
  h1("§ 6 Geldwäscheprävention (GwG)");
  p("Der Vertriebspartner unterstützt die Gesellschaft bei der Erfüllung ihrer Pflichten nach dem Geldwäschegesetz (Identifizierung, Mittelherkunft, PEP-Prüfung) und meldet auffällige Sachverhalte unverzüglich an die Geschäftsleitung.");
  h1("§ 7 Sanktionen bei Verstößen");
  p("Bei Verstößen gegen diese Richtlinien kann die Gesellschaft Abmahnungen aussprechen, Provisionen einbehalten, Zugänge sperren oder den Vertrag außerordentlich kündigen. Strafrechtliche und zivilrechtliche Konsequenzen bleiben unberührt; eine Vertragsstrafe begründet diese Anlage nicht.");
}

/* ── Anlage 7: Struktur (nur bei aktiver Overhead-Provision) ──────────── */

export function renderAnlage7StrukturAlt(t: KlauselTools): void {
  const { h1, p, bullet } = t;
  h1("§ 1 Strukturaufbau");
  p("Vertriebspartner der Pakete Team Lead und Lizenzpartner sind berechtigt, eigene Vertriebspartner zu werben, einzuarbeiten und dauerhaft fachlich zu führen.");
  h1("§ 2 Verantwortung");
  bullet([
    "regelkonformes Verhalten der gesamten Struktur",
    "DSGVO-Compliance der Untervertriebspartner",
    "korrekte und vollständige Beratung",
    "Einhaltung gesetzlicher Vorgaben (insb. § 34c GewO)",
    "laufende Schulung und Qualitätssicherung",
  ]);
  h1("§ 3 Registrierungspflicht");
  p("Jeder Vertriebspartner muss bei der Gesellschaft registriert werden, einen eigenen Handelsvertretervertrag unterzeichnen und sämtliche Compliance-Vorgaben akzeptieren. Eine Tätigkeit ohne Registrierung ist untersagt.");
  h1("§ 4 Overhead-Provision");
  p("Für jeden Abschluss eines selbst geworbenen und aktiv geführten Vertriebspartners erhält der Team Lead bzw. Lizenzpartner eine Overhead-Provision in Höhe von 1,5 (Team Lead) bzw. 2,0 (Lizenzpartner) Prozentpunkten auf den notariellen Kaufpreis. Die Auszahlung erfolgt jeweils gemeinsam mit der regulären Provisionsabrechnung. Höhe und Bedingungen sind abschließend in der Provisionsordnung (Anlage 4 § 6) sowie in § 8 des Hauptvertrages geregelt; eine darüber hinausgehende Untervertriebs- oder Sub-Provision entsteht nicht.");
  h1("§ 5 Abwerbeverbot");
  p(`Vertriebspartner dürfen nicht außerhalb der bestehenden MOREImmo-Struktur aktiv abgeworben werden. Das Abwerbeverbot gilt während der Vertragslaufzeit sowie für ${SCHUTZFRIST_MONATE} Monate nach Vertragsende. Für schuldhafte Verstöße gilt § 9e des Hauptvertrages.`);
  h1("§ 6 Compliance & Kündigung");
  p("Bei schweren Verstößen innerhalb der Struktur (Beratungsfehler, DSGVO-Verstöße, Geldwäscheverdacht) kann die Gesellschaft Unterpartner sperren, Provisionen einfrieren oder die gesamte Struktur außerordentlich kündigen.");
}

/* ── Anlage 8: Individuelle Regelungen (Erklärung der Nebentätigkeiten) ── */

/**
 * Anlage 8 gibt es nur bei individuell vereinbarter Vertragsfassung. Sie hält
 * die bei Vertragsbeginn erklärten Tätigkeiten für andere Vertriebe fest, auf
 * die § 10 (1) verweist. Sie ist eine Erklärung, kein eigener Vertrag: Die
 * frühere Einzelfassung mit acht Paragraphen, eigener Schutzfrist und eigener
 * Strafe ist entfallen, sie doppelte den Hauptvertrag und widersprach ihm.
 * Unterschrieben wird sie über § 18 mit dem Hauptvertrag, nicht gesondert.
 */
export function renderAnlage8IndividuellAlt(t: KlauselTools, ctx: KlauselKontext): void {
  const { h1, p, bullet } = t;
  const { bewerber } = ctx;
  const vertriebe = String(bewerber.andereVertriebe || "")
    .split(/\r?\n/)
    .map((zeile) => zeile.trim())
    .filter(Boolean);

  h1("Zweck dieser Anlage");
  p("Diese Anlage ist Bestandteil des Handelsvertretervertrages und konkretisiert § 10 (Nebentätigkeit, Kunden- und Partnerschutz, Individualfassung). Sie hält fest, für welche weiteren Unternehmen der Vertriebspartner bei Vertragsbeginn im Bereich Vermittlung oder Vertrieb tätig ist. Sie ändert weder den Kunden-, Bauträger- und Geschäftschancenschutz nach §§ 9a bis 9d noch die Vertragsstrafenregelung des § 9e.");

  h1("Erklärte Tätigkeiten für andere Vertriebe");
  p(vertriebe.length > 0
    ? "Der Vertriebspartner erklärt, bei Vertragsbeginn für folgende weitere Unternehmen im Bereich Vermittlung oder Vertrieb tätig zu sein:"
    : "Der Vertriebspartner erklärt, bei Vertragsbeginn für keine weiteren Unternehmen im Bereich Vermittlung oder Vertrieb tätig zu sein.");
  if (vertriebe.length > 0) bullet(vertriebe);
  p("Die Anzeigepflicht nach § 10 (1) für die spätere Aufnahme oder Beendigung solcher Tätigkeiten bleibt unberührt; einer Zustimmung der Gesellschaft bedarf es nicht. Diese Erklärung dient der Transparenz und der Abgrenzung nach § 10 (2) bis (4) und § 11 (4); sie begründet keine Ausnahme vom Kunden- und Partnerschutz.");

  h1("Bestandskunden des Vertriebspartners");
  p("Kunden und Interessenten, die der Vertriebspartner bereits vor Vertragsbeginn betreut hat, legt er bei Vertragsbeginn selbst im CRM-System an, manuell oder per Datei-Import (CSV). Sie sind damit Eigenkontakte nach § 9a Absatz 3 des Hauptvertrages und bleiben seine Kontakte; § 10 (3) gilt. Eine namentliche Auflistung in dieser Anlage erfolgt nicht. Kontakte, die zum Zeitpunkt der Anlage bereits im CRM-System der Gesellschaft erfasst sind, bleiben nach § 9c Gesellschaftskontakte.");
}
