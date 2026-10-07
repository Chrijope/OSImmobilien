/**
 * Grundgebühr-Pakete für das Bewerbungsmanagement.
 *
 * Diese Pakete sind das B2B-Verkaufsmodell der OS Immobilien-Plattform an
 * selbständige Vertriebspartner. Sie sind UNABHÄNGIG von den internen Karrierestufen
 * (Tippgeber / Vertriebspartner / Manager / Vertriebsfirma) der eigenen VPs.
 *
 * Team Lead & Lizenzpartner dürfen Vertriebspartner werben und erhalten
 * dafür einen Provisions-Override (Differenz auf jeden Abschluss des
 * geworbenen Vertriebspartners).
 */

/**
 * Zentraler Schalter für die Overhead-/Strukturprovision (Junior-Override).
 *
 * Stand 09/2026 gibt es im Vertrieb keine Overhead-Provision. Deshalb wird
 * sie nirgendwo mehr angezeigt, berechnet oder in neu erzeugte Verträge
 * gedruckt. Die Logik und die Klauseltexte bleiben im Code stehen und hängen
 * alle an diesem einen Flag: Wird die Overhead-Provision später wieder
 * eingeführt, genügt es, diesen Wert auf true zu setzen.
 */
export const OVERHEAD_AKTIV = false;

export type LizenzPaketId = "junior" | "lead_berater" | "lead" | "team_builder" | "enterprise" | "partner_2" | "tippgeber";
export type Zahlungsweise = "einmal" | "raten_2";

export interface LizenzPaket {
  id: LizenzPaketId;
  titel: string;
  /**
   * Einmalige Setup-/Onboarding-Investition in EUR netto.
   * Bei den aktuellen Paketen 0; nur die Altpakete hatten einen Einmalbetrag.
   * Bleibt aus Kompatibilitätsgründen auch als `preis` exportiert.
   */
  preis: number;
  /**
   * Monatliche CRM-Systemgebühr in EUR brutto inkl. USt.
   *
   * Seit dem 07.09.2026 gibt es bei den aktuellen Paketen kein laufendes
   * Entgelt mehr: Was das Haus stellt, stellt es unentgeltlich. Der Wert ist
   * deshalb bei Vertriebspartner, Lead-Berater und Tippgeber 0 und steht nur
   * noch bei den drei Altpaketen mit Einmalbetrag, weil Bestandspartner diese
   * Gebühr unterschrieben haben (Altfassung des Vertrags, vertragKlauselnAlt.ts).
   */
  monatlich: number;
  /**
   * Steht das Paket für NEUE Bewerber zur Wahl? Die alten Setup-Pakete
   * (Lead Partner, Team Lead, Lizenzpartner, Partner-Vertrag) bleiben in der
   * Liste, weil Bestandsverträge und gespeicherte paketwahl-Werte sie
   * referenzieren. Neu vergeben werden sie nicht mehr, deshalb filtern alle
   * Auswahl-Oberflächen auf `waehlbar !== false`. Fehlt das Feld, gilt das
   * Paket als wählbar.
   *
   * Für alles, was neu gebaut wird, gilt seit dem 25.08.2026 ausdrücklich:
   * Maßstab ist der Vertriebspartner mit 4 Prozent, daneben der Tippgeber.
   * Die vier Altpakete werden nicht mehr gepflegt und nicht mehr erweitert.
   * Ihre Zweige im Vertragsgenerator und in der Provisionsordnung bleiben
   * unberührt stehen, damit Bestandsverträge weiter darstellbar sind, aber
   * sie sind kein Bezugspunkt mehr. Wer den Prozess ändert, richtet ihn am
   * Vertriebspartner aus und lässt die Altpakete, wie sie sind.
   */
  waehlbar?: boolean;
  /**
   * Mindestlaufzeit der Altfassung in Monaten. Die aktuellen Pakete kennen
   * keine Mindestlaufzeit (0); der Handelsvertretervertrag läuft auf
   * unbestimmte Zeit mit den Fristen des § 89 HGB.
   */
  laufzeitMonate: number;
  /** Transparente Aufschlüsselung der einmaligen Investition. */
  einmaligAufschluesselung?: { label: string; betrag: number }[];
  emoji: string;
  kurz: string;
  zielgruppe: string;
  provisionssatz: number; // Standard-Provision in %
  /** Differenz-Override auf geworbene Vertriebspartner (nur TB / Lizenzpartner) */
  juniorOverride?: number; // in Prozentpunkten
  /**
   * Sonderform: reines Honorar-Modell ohne Grundgebühr. Bei `true` wird im
   * generierten Vertrag jede Grundgebühr-Klausel weggelassen bzw. durch eine
   * Honorarvereinbarung (Provision % auf Kaufpreis) ersetzt.
   */
  partnerHonorar?: boolean;
  /**
   * Sonderform Tippgeber: keine Grundgebühr, kein laufendes Entgelt, keine
   * Provisionsordnung. Vergütung wird individuell im Closing-Tab
   * (Festbetrag oder Prozent) hinterlegt. Erzeugt eine reduzierte
   * Tippgebervereinbarung statt Handelsvertretervertrag.
   */
  istTippgeber?: boolean;
  features: string[];
}

/**
 * Die monatliche CRM-Systemgebühr der Altfassung, brutto inklusive
 * Umsatzsteuer, und ihre Mindestlaufzeit.
 *
 * Nur noch für Bestandspartner: Wer die lange Vertragsfassung unterschrieben
 * hat, zahlt sie weiter, und seine Zusammenfassung und sein neu erzeugter
 * Vertragstext müssen das sagen (vertragKlauselnAlt.ts). Für alles, was neu
 * vergeben wird, gilt seit dem 07.09.2026: kein laufendes Entgelt, keine
 * Mindestlaufzeit. Diese beiden Werte dürfen deshalb an keiner Stelle mehr
 * auftauchen, die neuen Bewerbern etwas zeigt.
 */
export const ALT_CRM_MONATLICH_EUR = 150;
export const ALT_CRM_LAUFZEIT_MONATE = 12;

/* ── Bausteine für Verkaufsmaterial und Oberfläche ────────────────────────
 *
 * Eine Quelle für alle Stellen, die sagen, was das Haus stellt: Präsentation,
 * Skripte, Landingpage, PDFs, Closing. Vorher stand an rund hundert Stellen
 * eine eigene Formulierung; die liefen auseinander.
 */

/** Was nach § 86a HGB ohnehin unentgeltlich ist. */
export const UNENTGELTLICH_KURZ =
  "CRM, Objektzugänge, Exposés, Preislisten, Skripte und alle Pflichtschulungen";

/**
 * Die sechs Leistungen, die bis zum 06.09.2026 als eigener Vertrag für ein
 * Monatsentgelt gebucht werden konnten und seither ebenfalls gestellt werden,
 * in einer Zeile.
 */
export const GESTELLT_ZUSATZ_KURZ =
  "Training über die Pflichtmodule hinaus, persönliche Landingpage und Marketingbaukasten, Verkaufsunterlagen für die eigene Akquisition, Coaching und Vertriebsbegleitung, Partner-Community und erweiterter Support";

/** Alles, was das Haus stellt, in einer Zeile. Der stärkste Satz im Verkaufsgespräch. */
export const GESTELLT_ALLES_KURZ = `${UNENTGELTLICH_KURZ}, dazu ${GESTELLT_ZUSATZ_KURZ}`;

/**
 * Der vollständige Verkaufssatz: Alles wird gestellt, es gibt kein laufendes
 * Entgelt und keinen Einmalbetrag.
 */
export const GESTELLT_ARGUMENT =
  `${GESTELLT_ALLES_KURZ}: Das alles stellen wir dir unentgeltlich zur Verfügung. `
  + "Es gibt kein laufendes Entgelt, keinen Einmalbetrag und keine Mindestlaufzeit; du zahlst nichts, um mit uns zu arbeiten.";

/**
 * Leadmodell für neue Vertriebspartner: Leads werden nicht mehr über
 * Setup-Pakete verkauft, sondern optional als Leadpaket zugekauft.
 * Diese Konstanten sind die einzige Quelle für Preise und Stückzahl,
 * Vertragsklauseln und Rechner leiten sich hieraus ab.
 */
/** Preis eines Leadpakets in EUR netto. */
export const LEAD_PAKET_PREIS = 2500;
/** Anzahl qualifizierter Leads je Leadpaket. */
export const LEAD_PAKET_ANZAHL = 20;
/**
 * Preis eines Einzel-Leads in EUR netto, buchbar erst nach dem ersten Paket.
 *
 * Der Einzelkauf ohne vorherige Paketbuchung ist die Ausnahme und hängt am
 * Closing-Schalter `leadEinzelkauf`; regulär bleibt es bei dieser Bedingung.
 */
export const LEAD_EINZELPREIS = 150;
/** Rechnerischer Preis je Lead innerhalb eines Pakets (2.500 / 20 = 125 EUR). */
export const LEAD_PAKET_PREIS_PRO_LEAD = LEAD_PAKET_PREIS / LEAD_PAKET_ANZAHL;

/**
 * Leadpaket-Zeile der Leistungsliste, wie sie bis zum 28.09.2026 lautete.
 * Die Altfassung (vertragKlauselnAlt.ts) druckt die Leistungsliste im
 * Vertrag ab; paketMitAltfassungsGebuehr setzt dort diesen Wortlaut wieder
 * ein, damit Bestandsverträge unverändert erzeugbar bleiben.
 */
export const LEADPAKET_ZEILE_BIS_2026_09_28 = `Optionales Leadpaket: ${LEAD_PAKET_PREIS.toLocaleString("de-DE")} € netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, jederzeit erneut buchbar · Einzel-Leads ${LEAD_EINZELPREIS.toLocaleString("de-DE")} € nach der ersten Paketbuchung`;

/**
 * Unser Teamdurchschnitt: so viele Abschlüsse entstehen im Mittel aus zehn
 * Leads.
 *
 * Bewusst als Zahl je zehn Leads und ausdrücklich nicht als Prozentsatz.
 * „2,33 Prozent" wäre der zehnte Teil davon, also eine völlig andere und viel
 * schlechtere Aussage. Wer diese Zahl irgendwo anzeigt, schreibt deshalb
 * „2,33 von 10 Leads" und nie ein Prozentzeichen dahinter.
 */
export const LEAD_ABSCHLUESSE_JE_10 = 2.33;
export const LEAD_ABSCHLUESSE_JE_10_BEZUG = 10;

/** „2,33", in deutscher Schreibweise, für die Anzeige. */
export const LEAD_ABSCHLUESSE_JE_10_TEXT = LEAD_ABSCHLUESSE_JE_10.toLocaleString("de-DE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Leadanzahl für einen individuell vereinbarten Leadpaket-Betrag:
 * Betrag geteilt durch den Paket-Leadpreis, abgerundet. Beträge unter dem
 * Mindestbetrag (ein Standardpaket) sind ungültig und ergeben 0.
 */
export const berechneLeadAnzahl = (betrag: number): number => {
  if (!isFinite(betrag) || betrag < LEAD_PAKET_PREIS) return 0;
  return Math.floor(betrag / LEAD_PAKET_PREIS_PRO_LEAD);
};

export const LIZENZ_PAKETE: LizenzPaket[] = [
  {
    id: "junior",
    titel: "Vertriebspartner",
    preis: 0,
    monatlich: 0,
    laufzeitMonate: 0,
    emoji: "🌱",
    kurz: "Der einheitliche Einstieg in den Immobilienvertrieb",
    zielgruppe: "Alle neuen Vertriebspartner",
    provisionssatz: 4,
    einmaligAufschluesselung: [],
    features: [
      `CRM, Objektzugänge, Exposés, Skripte und Pflichtschulungen unentgeltlich (§ 86a HGB)`,
      `${GESTELLT_ZUSATZ_KURZ}: ebenfalls gestellt, kein laufendes Entgelt, keine Mindestlaufzeit`,
      "Einheitlich 4 % Provision auf Lead- und Eigenkontakte",
      "Vollzugriff CRM & Pipeline",
      "Academy Grundkurse",
      "Zugang zu Investmentobjekten",
      // Bewusst toLocaleString statt formatPreis: formatPreis steht weiter
      // unten in der Datei und wäre beim Auswerten dieses Arrays noch nicht
      // initialisiert (temporal dead zone).
      `Optionales Leadpaket: ${LEAD_PAKET_PREIS.toLocaleString("de-DE")} € netto Paketpreis für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, Einsatz für Werbemaßnahmen binnen eines Monats ab Zahlungseingang, Zuteilung nach Eingang, fehlende Leads werden nachgeliefert, jederzeit erneut buchbar · Einzel-Leads ${LEAD_EINZELPREIS.toLocaleString("de-DE")} € nach der ersten Paketbuchung`,
    ],
  },
  {
    // 1:1-Duplikat des Vertriebspartner-Pakets, nur das Lead-Kapitel ist
    // anders: Leads werden zur Unterstützung gestellt (nach Verfügbarkeit,
    // ohne Anspruch), ein Leadpaket-Kauf (Anlage 9) ist nicht vorgesehen.
    id: "lead_berater",
    titel: "Lead-Berater",
    preis: 0,
    monatlich: 0,
    laufzeitMonate: 0,
    emoji: "🎯",
    kurz: "Vertriebspartner mit gestellten Leads zur Unterstützung",
    zielgruppe: "Neue Vertriebspartner, die mit gestellten Leads unterstützt werden",
    provisionssatz: 4,
    einmaligAufschluesselung: [],
    features: [
      `CRM, Objektzugänge, Exposés, Skripte und Pflichtschulungen unentgeltlich (§ 86a HGB)`,
      `${GESTELLT_ZUSATZ_KURZ}: ebenfalls gestellt, kein laufendes Entgelt, keine Mindestlaufzeit`,
      "Einheitlich 4 % Provision auf Lead- und Eigenkontakte",
      "Vollzugriff CRM & Pipeline",
      "Academy Grundkurse",
      "Zugang zu Investmentobjekten",
      "Bereitstellung von Leads zur Unterstützung der eigenen Akquisition, nach Verfügbarkeit, ohne definierte Stückzahl und ohne Anspruch auf eine bestimmte Menge",
    ],
  },
  {
    // Bestandspaket, wird nicht mehr neu vergeben (siehe `waehlbar`). Die
    // Leistungszeile nennt weiter die CRM-Systemgebühr, weil die Partner
    // dieses Pakets genau das unterschrieben haben (Altfassung des Vertrags,
    // vertragKlauselnAlt.ts). Nicht umschreiben, die Gebühr heißt dort so.
    id: "lead",
    waehlbar: false,
    titel: "Lead Partner",
    preis: 5000,
    monatlich: ALT_CRM_MONATLICH_EUR,
    laufzeitMonate: ALT_CRM_LAUFZEIT_MONATE,
    emoji: "🔥",
    kurz: "Erfahrener Vertriebspartner mit eigener Akquise",
    zielgruppe: "Vertriebspartner mit ersten Abschlüssen",
    provisionssatz: 4,
    einmaligAufschluesselung: [
      { label: "Persönliche Landingpage & Setup", betrag: 2000 },
      { label: "Leadpaket · 30 Start-Leads", betrag: 3000 },
    ],
    features: [
      "Alles aus Vertriebspartner",
      `CRM-Systemgebühr ${ALT_CRM_MONATLICH_EUR} € brutto/Monat inkl. USt. · ${ALT_CRM_LAUFZEIT_MONATE} Monate Laufzeit`,
      "Einmalige Setup-Investition 5.000 € (Landingpage & Start-Leadpaket)",
      "Umfangreiche Tax Unterlagen und Wissensartikel",
      "Eigene Empfehlungsprogramme",
      "Erweiterte Beratungs-Präsentation",
      "Höhere Provisionsstaffel",
      "30 Start-Leads inklusive – weitere Leads 1:1 zum marktüblichen Leadpreis",
      "Eigene Lead-Generierung: warme, von uns umfangreich vorqualifizierte Leads werden direkt an dich übergeben – unsere gewonnenen Leads verdienen im Schnitt 4.500 € netto/Monat und mehr",
    ],
  },
  {
    // Bestandspaket, wird nicht mehr neu vergeben (siehe `waehlbar`). Die
    // Leistungszeile nennt weiter die CRM-Systemgebühr, weil die Partner
    // dieses Pakets genau das unterschrieben haben (Altfassung des Vertrags,
    // vertragKlauselnAlt.ts). Nicht umschreiben, die Gebühr heißt dort so.
    id: "team_builder",
    waehlbar: false,
    titel: "Team Lead",
    preis: 10000,
    monatlich: ALT_CRM_MONATLICH_EUR,
    laufzeitMonate: ALT_CRM_LAUFZEIT_MONATE,
    emoji: "🏆",
    kurz: "Aufbau eines eigenen Vertriebsteams",
    zielgruppe: "Vertriebspartner mit Recruiting-Ambition",
    provisionssatz: 4.5,
    // Strukturvergütung nur, solange die Overhead-Provision aktiv ist.
    ...(OVERHEAD_AKTIV ? { juniorOverride: 1.5 } : {}),
    einmaligAufschluesselung: [
      { label: "Persönliche Landingpage & Team-Setup", betrag: 2500 },
      { label: "Leadpaket · 80 Start-Leads", betrag: 7500 },
    ],
    features: [
      "Alles aus Lead Partner",
      `CRM-Systemgebühr ${ALT_CRM_MONATLICH_EUR} € brutto/Monat inkl. USt. · ${ALT_CRM_LAUFZEIT_MONATE} Monate Laufzeit`,
      "Einmalige Setup-Investition 10.000 € (Landingpage, Team-Setup & 80 Start-Leads)",
      "Vertriebspartner werben & coachen",
      ...(OVERHEAD_AKTIV ? ["Overhead-Provision 1,5 % auf jeden Vertriebspartner-Abschluss"] : []),
      "Team-Dashboard & Statistiken",
      "Zielplanungs-Tool für das Team",
      "80 Start-Leads inklusive – weitere Leads 1:1 zum marktüblichen Leadpreis",
      "Eigene Lead-Generierung: warme, von uns umfangreich vorqualifizierte Leads werden direkt an dich übergeben – unsere gewonnenen Leads verdienen im Schnitt 4.500 € netto/Monat und mehr",
    ],
  },
  {
    // Bestandspaket, wird nicht mehr neu vergeben (siehe `waehlbar`). Die
    // Leistungszeile nennt weiter die CRM-Systemgebühr, weil die Partner
    // dieses Pakets genau das unterschrieben haben (Altfassung des Vertrags,
    // vertragKlauselnAlt.ts). Nicht umschreiben, die Gebühr heißt dort so.
    id: "enterprise",
    waehlbar: false,
    titel: "Lizenzpartner",
    preis: 25000,
    monatlich: ALT_CRM_MONATLICH_EUR,
    laufzeitMonate: ALT_CRM_LAUFZEIT_MONATE,
    emoji: "👑",
    kurz: "Eigene Vertriebsfirma unter OS Immobilien",
    zielgruppe: "Etablierte Vertriebsstrukturen",
    provisionssatz: 5,
    // Strukturvergütung nur, solange die Overhead-Provision aktiv ist.
    ...(OVERHEAD_AKTIV ? { juniorOverride: 2 } : {}),
    einmaligAufschluesselung: [
      { label: "Whitelabel, Marke & strategisches Setup", betrag: 4000 },
      { label: "12 Monate Leadkosten komplett übernommen", betrag: 21000 },
    ],
    features: [
      "Alles aus Team Lead",
      `CRM-Systemgebühr ${ALT_CRM_MONATLICH_EUR} € brutto/Monat inkl. USt. · ${ALT_CRM_LAUFZEIT_MONATE} Monate Laufzeit`,
      "Einmalige Setup-Investition 25.000 € (Whitelabel-Setup & 12 Monate Leadkosten übernommen)",
      ...(OVERHEAD_AKTIV ? ["Overhead-Provision 2 % auf jeden Vertriebspartner-Abschluss"] : []),
      "Whitelabel-Optionen für eigene Marke",
      "Direkter Ansprechpartner aus der Geschäftsleitung",
      "Strategische Mitgestaltung",
      "12 Monate Leadkosten komplett übernommen – ab Monat 13 zum marktüblichen Leadpreis 1:1 weitergegeben",
      "Eigene Lead-Generierung: warme, von uns umfangreich vorqualifizierte Leads werden direkt an dich übergeben – unsere gewonnenen Leads verdienen im Schnitt 4.500 € netto/Monat und mehr",
    ],
  },
  {
    // Bestandspaket, wird nicht mehr neu vergeben (siehe `waehlbar`). Die
    // Leistungszeile nennt weiter die CRM-Systemgebühr, weil die Partner
    // dieses Pakets genau das unterschrieben haben (Altfassung des Vertrags,
    // vertragKlauselnAlt.ts). Nicht umschreiben, die Gebühr heißt dort so.
    id: "partner_2",
    waehlbar: false,
    titel: "Partner-Vertrag (2 % Honorar)",
    preis: 0,
    monatlich: 0,
    laufzeitMonate: 0,
    emoji: "🤝",
    kurz: "Individueller Partner-Vertrag ohne Grundgebühr",
    zielgruppe: "Strategische Partner & Sondervereinbarungen",
    provisionssatz: 2,
    partnerHonorar: true,
    features: [
      "Keine Grundgebühr – ausschließlich Honorar auf den notariellen Kaufpreis",
      "2 % Honorar auf den notariellen Kaufpreis jeder vermittelten Immobilie",
      "Vollzugriff CRM, Pipeline und Objektzugänge",
      "Persönlicher Ansprechpartner aus der Geschäftsleitung",
    ],
  },
  {
    id: "tippgeber",
    titel: "Tippgeber",
    preis: 0,
    monatlich: 0,
    laufzeitMonate: 0,
    emoji: "🤝",
    kurz: "Individuelle Absprache · nur Kontaktvermittlung",
    zielgruppe: "Empfehlungsgeber ohne Beratungsrolle",
    provisionssatz: 0,
    istTippgeber: true,
    features: [
      "Kostenfrei, kein laufendes Entgelt",
      "Individuelle Vergütung pro vermitteltem Abschluss (Festbetrag € oder % vom Kaufpreis)",
      "Ausschließlich Kontaktvermittlung über das Tippgeberportal",
      "Keine Beratung, keine Vermittlung i.S.d. § 34c / § 34f GewO",
      "Volle Transparenz zum Status der eingereichten Kontakte",
    ],
  },
];

/**
 * Pakete, die neuen Bewerbern zur Wahl stehen (aktuell Vertriebspartner und
 * Tippgeber). Alle Auswahl-Oberflächen (ClosingTab, VertragsTab,
 * Mustervertrag-Auswahl) zeigen nur diese Liste; Bestandsdaten mit alten
 * Paket-IDs werden über LIZENZ_PAKETE weiterhin korrekt aufgelöst.
 */
export const WAEHLBARE_LIZENZ_PAKETE = LIZENZ_PAKETE.filter((p) => p.waehlbar !== false);

/**
 * Pakete, bei denen die Vertragsschalter des Closings greifen: individuelle
 * Provisionssätze, die Leadauswahl und die Individualfassung des
 * Wettbewerbsparagraphen. Lead-Berater ist ein 1:1-Duplikat des
 * Vertriebspartners, deshalb hängen beide an derselben Liste statt an
 * verstreuten "junior"-Vergleichen.
 */
export const PAKETE_MIT_VERTRAGSSCHALTERN: LizenzPaketId[] = ["junior", "lead_berater"];

export const ZAHLUNGSWEISEN: { id: Zahlungsweise; label: string; raten: number }[] = [
  { id: "einmal", label: "Einmalzahlung", raten: 1 },
  { id: "raten_2", label: "2 Raten", raten: 2 },
];

export const getLizenzPaket = (id: string | null | undefined): LizenzPaket | null => {
  if (!id) return null;
  return LIZENZ_PAKETE.find((p) => p.id === id) ?? null;
};

export const formatPreis = (preis: number): string =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(preis);

/**
 * Formatiert die monatliche CRM-Systemgebühr der Altpakete samt Laufzeit.
 * Bei den aktuellen Paketen (monatlich 0) kommt ein leerer Text zurück.
 */
export const formatMonatlich = (paket: Pick<LizenzPaket, "monatlich" | "laufzeitMonate">): string => {
  if (!paket.monatlich) return "";
  return `${formatPreis(paket.monatlich)} / Monat · ${paket.laufzeitMonate} Monate Laufzeit`;
};

export const berechneRaten = (preis: number, zw: Zahlungsweise): number[] => {
  const z = ZAHLUNGSWEISEN.find((x) => x.id === zw) ?? ZAHLUNGSWEISEN[0];
  const proRate = Math.round((preis / z.raten) * 100) / 100;
  return Array.from({ length: z.raten }, () => proRate);
};