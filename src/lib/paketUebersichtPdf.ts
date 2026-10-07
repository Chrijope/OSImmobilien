import jsPDF from "jspdf";
import {
  getLizenzPaket,
  formatPreis,
  LEAD_PAKET_PREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_EINZELPREIS,
  GESTELLT_ZUSATZ_KURZ,
  LEAD_PAKET_PREIS_PRO_LEAD,
} from "./lizenzPakete";
import { ABLAUF_STATIONEN, ABLAUF_GESAMTDAUER } from "./ablaufplan";
import { supabase } from "@/integrations/supabase/client";
import {
  BRAND,
  loadLogo,
  loadIcon,
  addCoverPage,
  addBrandedHeader,
  addBrandedFooter,
  brandedSectionTitle,
  sanitizePdfText,
  PDF_FONT,
  ensureUnicodeFont,
} from "./pdfBranding";

/* ── Blattmaße. Rand und Fußzeile folgen dem Hausmuster aus pdfBranding. ── */
const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;
/** Letzte Grundlinie, die noch sicher über der Fußzeile liegt. */
const UNTERKANTE = H - 26;

/**
 * Nur vier Größenstufen. Mehr Stufen lassen ein Dokument unruhig wirken,
 * und genau das war der Hauptmangel der früheren Fassung.
 */
const GR = { gross: 13, titel: 11, text: 9.5, klein: 8.5, mikro: 7.5 };
const ZEILE = 5;
const ZEILE_KLEIN = 4.2;

const s = (t: string) => sanitizePdfText(t ?? "");

/** Beispielkaufpreis der Beispielrechnung: 300.000 Euro ergeben bei 4 % genau 12.000 Euro. */
const KAUFPREIS_BEISPIEL = 300_000;

const fmtEUR = (n: number): string =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const prozent = (v: number) => `${String(v).replace(".", ",")} %`;

/**
 * Was der Partner bekommt und was ihm das jeweils erspart. Exportiert, weil
 * der erweiterte Startfahrplan (startfahrplanErweitertPdf.ts) dieselbe
 * Tabelle druckt und beide Fassungen nie auseinanderlaufen sollen.
 */
export const ZUSAMMENARBEIT: { bekommst: string; spart: string }[] = [
  {
    bekommst: "Eigenes CRM und Kundenverwaltung",
    spart: "Teure Software-Lizenzen und Entwicklungskosten",
  },
  {
    bekommst: "Objektzugang und Investagon für die Kalkulation",
    spart: "Eigene Objektakquise und den Aufbau einer eigenen Kalkulation",
  },
  {
    bekommst: "Qualifizierte Leads auf Wunsch",
    spart: "Den Start bei null",
  },
  {
    bekommst: "Etablierte Marke",
    spart: "Markenaufbau von mehreren tausend Euro",
  },
  {
    bekommst: "Academy und Mentoring",
    spart: "Teure externe Schulungen",
  },
  {
    bekommst: "Backoffice, Finanzierung und rechtliche Infrastruktur",
    spart: "Eigene Verwaltung und Rechtsberatung",
  },
];

/**
 * Die drei Assetklassen, wortgleich zur Closing-Präsentation. Exportiert für
 * den erweiterten Startfahrplan, gleiche Begründung wie bei ZUSAMMENARBEIT.
 */
export const IMMOBILIENTYPEN: { titel: string; text: string }[] = [
  {
    titel: "Sanierter Bestand",
    text: "Meist mit erhöhtem Restnutzungsdauer-Gutachten und Erhaltungsaufwand, also echter steuerlicher Substanz.",
  },
  {
    titel: "Neubau KfW 40 QNG",
    text: "Energieeffizienter Neubau mit KfW-Kredit, beste Energieeffizienz und Nachhaltigkeit.",
  },
  {
    titel: "WG- und Co-Living-Konzepte",
    text: "Mietkonzept für Kunden mit stärkerem Renditefokus.",
  },
];

/** Die vier Schritte nach dem Closing-Gespräch. */
const NAECHSTE_SCHRITTE: { t: string; d: string }[] = [
  {
    t: "Persönliches Gespräch",
    d: "Wir gehen die Zusammenarbeit gemeinsam im Detail und in der Tiefe durch, rechnen deine Zahlen konkret und klären die nächsten Schritte.",
  },
  {
    t: "Vertrag",
    d: "Der Vertriebspartnervertrag wird nach dem persönlichen Gespräch ausgestellt.",
  },
  {
    t: "Onboarding-Termin",
    d: "Sobald der unterschriebene Vertrag vorliegt: Wir schalten deine Zugänge frei und richten deine persönliche OS Immobilien E-Mail-Adresse ein.",
  },
  {
    t: "Start",
    d: "Du startest mit deinen ersten Kundenfällen, begleitet von deinem Ansprechpartner.",
  },
];

/** Der Ansprechpartner im Kontaktkasten am Ende des Startfahrplans. */
export interface PaketUebersichtBerater {
  name?: string;
  email?: string;
  telefon?: string;
}

/**
 * Rückfall, wenn kein Ansprechpartner übergeben wurde. Alle drei Angaben
 * gehören zu derselben Person; vorher standen diese Kontaktdaten fest im
 * Kontaktkasten, egal welcher Name darüber stand.
 */
export const STANDARD_BERATER: PaketUebersichtBerater = {
  name: "Christian Peetz",
  email: "os@os-immobilien.com",
  telefon: "+49 30 863289210",
};

/**
 * Erzeugt den "Startfahrplan" für einen Bewerber.
 *
 * Das Dokument fasst nach dem Closing-Gespräch kurz und bündig zusammen, was
 * in Erstgespräch und Closing-Präsentation besprochen wurde: wer OS Immobilien ist,
 * welche Immobilientypen es gibt, wie die vertriebliche Zusammenarbeit
 * aussieht, wie ein Deal abläuft, was der Partner bekommt, was es kostet und
 * wie es weitergeht.
 *
 * Aufbau im Haus-CI: dunkles Deckblatt aus addCoverPage, danach Inhaltsseiten
 * mit addBrandedHeader und addBrandedFooter, Zählung ohne Deckblatt. Alle
 * Beträge stammen aus den Konstanten in lizenzPakete.ts, der Ablauf aus
 * ablaufplan.ts, damit Vertrag, Präsentation und Fahrplan nie auseinanderlaufen.
 */
export async function buildPaketUebersichtPdf(opts: {
  empfaengerName?: string;
  berater?: PaketUebersichtBerater;
  /**
   * Bereits gewähltes Paket des Bewerbers. Beim Lead-Berater ersetzt der
   * Bereitstellungs-Absatz (Leads werden gestellt, kein Anspruch auf eine
   * bestimmte Menge) den Leadpaket-Kaufabsatz. Ohne Angabe bleibt der
   * Fahrplan generisch mit dem optionalen Leadpaket.
   */
  paketId?: string;
} = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  const junior = getLizenzPaket("junior");
  const provisionssatz = junior?.provisionssatz ?? 4;
  const provisionBeispiel = (KAUFPREIS_BEISPIEL * provisionssatz) / 100;

  const vollerName = (opts.empfaengerName || "").trim();
  const vorname = vollerName.split(" ")[0] || "";
  // Ohne Namen kein halber Kontaktkasten: dann gilt der Rückfall komplett.
  const berater = opts.berater?.name?.trim() ? opts.berater : STANDARD_BERATER;
  const beraterName = (berater.name || "").trim();
  const heute = new Date().toLocaleDateString("de-DE");

  /* ── Seitenführung ───────────────────────────────────────────────
   * Alle Innenseiten bekommen denselben Kopf und beginnen auf derselben
   * Höhe. `platzPruefen` sorgt dafür, dass nichts über die Fußzeile läuft.
   * ------------------------------------------------------------- */
  let y = 0;

  const neueSeite = () => {
    doc.addPage();
    y = addBrandedHeader(doc, logo, "Startfahrplan");
  };

  const platzPruefen = (hoehe: number) => {
    if (y + hoehe > UNTERKANTE) neueSeite();
  };

  /** Abschnittstitel. Bricht vorher um, wenn darunter kein Inhalt mehr passt. */
  const abschnitt = (text: string, mindestInhalt = 26) => {
    platzPruefen(14 + mindestInhalt);
    y = brandedSectionTitle(doc, text, y, M, CW);
  };

  const absatz = (
    text: string,
    groesse = GR.text,
    farbe: [number, number, number] = BRAND.text,
    zeilenh = ZEILE,
  ) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(groesse);
    const zeilen = doc.splitTextToSize(s(text), CW) as string[];
    doc.setTextColor(...farbe);
    for (const z of zeilen) {
      platzPruefen(zeilenh);
      doc.text(z, M, y);
      y += zeilenh;
    }
  };

  /** Aufzählung mit Akzentpunkt, wahlweise mit fettem Titel vor dem Text. */
  const punktListe = (eintraege: { t?: string; d: string }[]) => {
    for (const it of eintraege) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.klein);
      const zeilen = doc.splitTextToSize(s(it.d), CW - 8) as string[];
      const hoehe = (it.t ? 5 : 0) + zeilen.length * ZEILE_KLEIN + 4;
      platzPruefen(hoehe);

      doc.setFillColor(...BRAND.accent);
      doc.circle(M + 1.4, y - 1.3, 1.1, "F");
      let yy = y;
      if (it.t) {
        doc.setFont(PDF_FONT, "bold");
        doc.setFontSize(GR.klein);
        doc.setTextColor(...BRAND.primary);
        doc.text(s(it.t), M + 8, y);
        yy = y + 5;
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.klein);
      doc.setTextColor(...BRAND.text);
      for (const z of zeilen) {
        doc.text(z, M + 8, yy);
        yy += ZEILE_KLEIN;
      }
      y = yy + 4;
    }
  };

  /** Drei gleich breite Karten nebeneinander, Titel oben, Text darunter. */
  const kartenReihe = (karten: { titel: string; text: string }[]) => {
    const abstand = 5;
    const breite = (CW - (karten.length - 1) * abstand) / karten.length;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.mikro);
    const zeilen = karten.map((k) => doc.splitTextToSize(s(k.text), breite - 8) as string[]);
    const titelZeilen = karten.map((k) => {
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.klein);
      return doc.splitTextToSize(s(k.titel), breite - 8) as string[];
    });
    const titelMax = Math.max(...titelZeilen.map((z) => z.length));
    const hoehe = 8 + titelMax * 4.6 + Math.max(...zeilen.map((z) => z.length)) * ZEILE_KLEIN + 6;
    platzPruefen(hoehe);

    karten.forEach((_, i) => {
      const cx = M + i * (breite + abstand);
      doc.setFillColor(...BRAND.light);
      doc.roundedRect(cx, y, breite, hoehe, 2, 2, "F");
      doc.setFillColor(...BRAND.accent);
      doc.rect(cx + 2, y, breite - 4, 1, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.klein);
      doc.setTextColor(...BRAND.primary);
      let ty = y + 8;
      for (const z of titelZeilen[i]) {
        doc.text(z, cx + 4, ty);
        ty += 4.6;
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.text);
      let yy = y + 8 + titelMax * 4.6 + 2;
      for (const z of zeilen[i]) {
        doc.text(z, cx + 4, yy);
        yy += ZEILE_KLEIN;
      }
    });
    y += hoehe + 8;
  };

  /** Zweispaltige Tabelle mit Kopfzeile und Haarlinien zwischen den Zeilen. */
  const zweiSpaltenTabelle = (
    kopfLinks: string,
    kopfRechts: string,
    zeilen: { bekommst: string; spart: string }[],
  ) => {
    const spalteB = (CW - 6) / 2;
    const xL = M;
    const xR = M + spalteB + 6;

    const kopfZeichnen = () => {
      platzPruefen(10 + 12);
      doc.setFillColor(...BRAND.light);
      doc.rect(M, y - 4.5, CW, 8, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.accentDark);
      doc.text(s(kopfLinks.toUpperCase()), xL + 2, y, { charSpace: 0.6 });
      doc.text(s(kopfRechts.toUpperCase()), xR + 2, y, { charSpace: 0.6 });
      y += 8;
    };

    kopfZeichnen();

    for (const zeile of zeilen) {
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.klein);
      const linksZeilen = doc.splitTextToSize(s(zeile.bekommst), spalteB - 4) as string[];
      doc.setFont(PDF_FONT, "normal");
      const rechtsZeilen = doc.splitTextToSize(s(zeile.spart), spalteB - 4) as string[];
      const hoehe = Math.max(linksZeilen.length, rechtsZeilen.length) * ZEILE_KLEIN + 5;

      if (y + hoehe > UNTERKANTE) {
        neueSeite();
        kopfZeichnen();
      }

      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.klein);
      doc.setTextColor(...BRAND.primary);
      let ly = y;
      for (const z of linksZeilen) {
        doc.text(z, xL + 2, ly);
        ly += ZEILE_KLEIN;
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.klein);
      doc.setTextColor(...BRAND.text);
      let ry = y;
      for (const z of rechtsZeilen) {
        doc.text(z, xR + 2, ry);
        ry += ZEILE_KLEIN;
      }

      y += hoehe;
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.15);
      doc.line(M, y - 3, M + CW, y - 3);
    }
    y += 4;
  };

  /** Drei Kennzahl-Kacheln nebeneinander: große Zahl, Erklärung darunter. */
  const kennzahlKacheln = (kacheln: { wert: string; sub: string }[]) => {
    const abstand = 5;
    const breite = (CW - (kacheln.length - 1) * abstand) / kacheln.length;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.mikro);
    const zeilen = kacheln.map((k) => doc.splitTextToSize(s(k.sub), breite - 8) as string[]);
    const hoehe = 16 + Math.max(...zeilen.map((z) => z.length)) * ZEILE_KLEIN + 4;
    platzPruefen(hoehe);
    kacheln.forEach((k, i) => {
      const cx = M + i * (breite + abstand);
      doc.setFillColor(...BRAND.light);
      doc.roundedRect(cx, y, breite, hoehe, 2, 2, "F");
      doc.setFillColor(...BRAND.accent);
      doc.rect(cx + 2, y, breite - 4, 1, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.gross);
      doc.setTextColor(...BRAND.accentDark);
      doc.text(s(k.wert), cx + 4, y + 10);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.muted);
      let yy = y + 16;
      for (const z of zeilen[i]) {
        doc.text(z, cx + 4, yy);
        yy += ZEILE_KLEIN;
      }
    });
    y += hoehe + 8;
  };

  // ═══════════════════════════════════════════════════════════════════
  // Deckblatt
  // ═══════════════════════════════════════════════════════════════════
  addCoverPage(doc, await loadIcon(), {
    kennung: "Für Vertriebspartner",
    titel: "Dein Startfahrplan",
    untertitel:
      "OS Immobilien auf einen Blick: wer wir sind, wie wir arbeiten und wie dein Start aussieht.",
    empfaenger: vollerName || undefined,
    datum: heute,
    fusszeile: "Unverbindliche Information. Verbindlich ist allein der Vertriebspartnervertrag.",
  });

  // ═══════════════════════════════════════════════════════════════════
  // Inhalt — Anrede, danach die sieben Abschnitte in einem Fluss
  // ═══════════════════════════════════════════════════════════════════
  neueSeite();

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(GR.gross);
  doc.setTextColor(...BRAND.primary);
  doc.text(vorname ? s(`Hallo ${vorname},`) : "Hallo,", M, y);
  y += 8;

  absatz(
    "hier steht alles noch einmal kurz und bündig, was wir in unseren Gesprächen besprochen haben: wer wir sind, welche Immobilien wir anbieten, wie die Zusammenarbeit aussieht, was du bekommst, was es kostet und wie es weitergeht.",
  );
  y += 6;

  abschnitt("Wer wir sind", 34);

  absatz(
    "OS Immobilien ist ein Vertrieb für Kapitalanlageimmobilien. Unsere Kunden sind besser verdienende Menschen: Unternehmer, Ärzte und High Experts, typischerweise mit 80.000 bis 100.000 Euro Jahreseinkommen und mehr und sehr guter Bonität.",
  );
  y += 2;
  absatz(
    "Ihnen zeigen wir über ein Immobilien-Investment, wie sie ihre Steuern optimieren und Vermögen aufbauen. Für dich heißt das: eine klare Zielgruppe, geprüfte Objekte und ein System, das den ganzen Weg vom Lead bis zur Provision trägt.",
  );
  y += 8;

  abschnitt("Unsere Immobilientypen und Standorte", 44);

  kartenReihe(IMMOBILIENTYPEN);

  absatz(
    "Unser Fokus liegt in Bayern mit München und Umland, Augsburg und Nürnberg. Dazu kommen ausgewählte Objekte deutschlandweit.",
    GR.klein,
    BRAND.text,
    ZEILE_KLEIN,
  );

  y += 8;

  // Ab hier fliesst der Inhalt weiter. Die Abschnitte brechen nur um, wenn
  // unter der Ueberschrift nichts Sinnvolles mehr aufs Blatt passt; feste
  // Seitenwechsel je Abschnitt haetten halbleere Seiten hinterlassen.
  abschnitt("Wie die Zusammenarbeit aussieht", 44);

  absatz(
    "Du arbeitest als selbständiger Vertriebspartner mit der kompletten Infrastruktur von OS Immobilien im Rücken. Was das im Einzelnen bedeutet:",
    GR.klein,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;

  zweiSpaltenTabelle("Was du von uns bekommst", "Was es dir spart", ZUSAMMENARBEIT);
  y += 4;

  abschnitt("Wie ein Deal abläuft", 44);

  // Kompakte Zeitleiste aus ablaufplan.ts, auf Titel und Zeitangabe gekürzt.
  ABLAUF_STATIONEN.forEach((station, i) => {
    const istLetzte = i === ABLAUF_STATIONEN.length - 1;
    const hoehe = 7;
    if (y + hoehe > UNTERKANTE) neueSeite();

    const punktY = y - 1.4;
    if (!istLetzte) {
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.5);
      doc.line(M + 2.2, punktY + 2, M + 2.2, punktY + hoehe);
    }
    doc.setFillColor(...BRAND.accent);
    doc.circle(M + 2.2, punktY, 1.6, "F");

    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(GR.klein);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(station.titel), M + 8, y);

    const zeitText = station.zeit
      ? station.zeitZusatz
        ? `${station.zeit} ${station.zeitZusatz}`
        : station.zeit
      : "";
    if (zeitText) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.accentDark);
      doc.text(s(zeitText), W - M, y, { align: "right" });
    }
    y += hoehe;
  });

  y += 2;
  absatz(ABLAUF_GESAMTDAUER, GR.klein, BRAND.text, ZEILE_KLEIN);

  y += 8;

  abschnitt("Deine Konditionen", 46);

  kennzahlKacheln([
    {
      wert: prozent(provisionssatz),
      sub: "Provision auf jeden Abschluss, auf eigene Kunden und auf Leads gleichermaßen",
    },
    {
      wert: `${formatPreis(0)} / Monat`,
      sub: "Laufendes Entgelt. Es gibt keine Monatsgebühr und keine Mindestlaufzeit",
    },
    {
      wert: formatPreis(0),
      sub: "Setup. Du startest ohne Einmalbetrag",
    },
  ]);

  absatz(
    `Beispielrechnung: Bei einem Kaufpreis von ${fmtEUR(KAUFPREIS_BEISPIEL)} sind ${prozent(provisionssatz)} Provision genau ${fmtEUR(provisionBeispiel)} je Abschluss. Davon geht nichts für System oder Begleitung ab; beides stellen wir Dir.`,
  );
  y += 2;
  absatz(
    `CRM, Investagon, Objektzugänge, Exposés, Preislisten, Skripte und alle Pflichtschulungen stellen wir unentgeltlich zur Verfügung; dafür zahlst Du nichts. `
    + `Ebenfalls gestellt, ohne eigenen Vertrag und ohne Monatsgebühr: ${GESTELLT_ZUSATZ_KURZ}.`,
    GR.klein,
    BRAND.text,
    ZEILE_KLEIN,
  );
  y += 2;
  absatz(
    "Tatsächliche Kaufpreise, Provisionshöhe und Abschlussfrequenz variieren je nach Objekt, Kunde und eigener Aktivität.",
    GR.mikro,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;

  if (opts.paketId === "lead_berater") {
    // Lead-Berater: kein käufliches Leadpaket. Stattdessen die
    // Bereitstellungszusage aus den LEAD_KLAUSELN, ohne Mengenanspruch.
    abschnitt("Leads zur Unterstützung", 30);

    absatz(
      "Im Paket Lead-Berater stellen wir dir Leads zur Unterstützung deiner eigenen Akquisition bereit. Die Bereitstellung erfolgt nach Verfügbarkeit, ohne definierte Stückzahl und ohne Anspruch auf eine bestimmte Menge. Ein Kauf von Leadpaketen oder Einzel-Leads ist in diesem Paket nicht vorgesehen.",
    );
    y += 2;

    punktListe([
      { d: "Die gestellten Leads dienen der Unterstützung, nicht als garantierter Zulauf." },
      { d: "Eigenakquise und Empfehlungsgeschäft bleiben ausdrücklich empfohlen." },
    ]);

    y += 6;
  } else {
    abschnitt("Dein eigener Leadkanal (optional)", 44);

    absatz(
      `Wenn du nicht nur über dein eigenes Netzwerk arbeiten willst, buchst du ein Leadpaket: ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, also ${formatPreis(LEAD_PAKET_PREIS_PRO_LEAD)} je Lead. Das Paket ist jederzeit erneut buchbar, einzelne Leads kosten ${formatPreis(LEAD_EINZELPREIS)} netto. Dein Betrag wird eins zu eins als Werbebudget für die Gewinnung deiner Leads eingesetzt.`,
    );
    y += 2;

    punktListe([
      { d: "Qualifiziert heißt: echtes Interesse an einer Kapitalanlage, mindestens 3.000 Euro netto im Monat, Eigenkapital vorhanden." },
      { d: "Erfüllt ein Lead diese Zusage nicht, ist er nicht erreichbar oder falsch hinterlegt, bekommst du einen Ersatzlead." },
      { d: "Unsere Qualitätsabteilung ruft zugeteilte Leads stichprobenartig an und fragt nach, wie gut sie betreut werden." },
      { d: "Der Leadkauf ist kein Muss. Viele Partner starten mit dem eigenen Netzwerk." },
    ]);

    y += 6;
  }

  // Der Schlussteil braucht Schritte und Kontaktkasten am Stueck, sonst
  // steht die Kontaktbox allein auf der letzten Seite.
  platzPruefen(150);
  abschnitt("So geht es weiter", 46);

  const marke = 4.4;          // Radius der Nummernmarke
  const textX = M + 2 * marke + 7;
  const textB = CW - (2 * marke + 7);
  let markeUntenY: number | null = null;

  NAECHSTE_SCHRITTE.forEach((st, i) => {
    // Höhe des Schritts vorab bestimmen, damit er nie mitten in der Zeile bricht.
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.text);
    const textZeilen = doc.splitTextToSize(s(st.d), textB) as string[];
    const hoehe = 8 + textZeilen.length * ZEILE + 5;

    if (y + hoehe > UNTERKANTE) {
      neueSeite();
      markeUntenY = null;
    }

    const mitteY = y + 1;

    // Ruhige senkrechte Führung zwischen den Marken, nur innerhalb einer Seite.
    if (markeUntenY !== null) {
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.6);
      doc.line(M + marke, markeUntenY, M + marke, mitteY - marke);
    }

    doc.setFillColor(...BRAND.accent);
    doc.circle(M + marke, mitteY, marke, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(GR.klein);
    doc.setTextColor(...BRAND.white);
    doc.text(String(i + 1), M + marke, mitteY + 1.5, { align: "center" });

    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(GR.titel);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(st.t), textX, y + 2);

    let yy = y + 8;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.text);
    doc.setTextColor(...BRAND.text);
    for (const z of textZeilen) {
      doc.text(z, textX, yy);
      yy += ZEILE;
    }

    markeUntenY = mitteY + marke;
    y = yy + 5;
  });

  y += 4;

  const kontaktH = 34;
  platzPruefen(kontaktH + 16);
  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, y, CW, kontaktH, 2, 2, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(M, y, 1.6, kontaktH, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(GR.mikro);
  doc.setTextColor(...BRAND.muted);
  doc.text("DEIN ANSPRECHPARTNER", M + 8, y + 8, { charSpace: 0.8 });
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(GR.gross);
  doc.setTextColor(...BRAND.primary);
  doc.text(s(beraterName), M + 8, y + 16.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(GR.klein);
  doc.setTextColor(...BRAND.text);
  // Fehlende Angaben im Profil werden weggelassen statt als leere Zeile gedruckt.
  let kontaktY = y + 23;
  for (const zeile of [berater.email, berater.telefon]) {
    if (!zeile?.trim()) continue;
    doc.text(s(zeile.trim()), M + 8, kontaktY);
    kontaktY += 5.5;
  }
  y += kontaktH + 10;

  platzPruefen(16);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(GR.text);
  doc.setTextColor(...BRAND.accentDark);
  doc.text(
    vorname
      ? s(`Ich freue mich, wenn wir gemeinsam loslegen, ${vorname}.`)
      : "Ich freue mich, wenn wir gemeinsam loslegen.",
    M,
    y,
  );

  y += 5;

  // Rechtlicher Hinweis. Er steht am Fuß der letzten Seite, rutscht aber nach
  // unten hinter den Schlusssatz, falls dieser tief genug steht. Vorher saß er
  // auf einer festen Höhe und lief bei langem Inhalt in den Schlusssatz hinein.
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(GR.mikro - 0.5);
  doc.setTextColor(...BRAND.muted);
  const hinweis = "Alle Preise verstehen sich netto zzgl. der gesetzlichen Umsatzsteuer. Verbindlich ist ausschließlich der jeweilige Vertriebspartnervertrag mit seinen Anlagen.";
  const hinweisZeilen = doc.splitTextToSize(s(hinweis), CW) as string[];
  const hinweisH = hinweisZeilen.length * ZEILE_KLEIN;
  let hy = Math.max(y, H - 30 - hinweisH);
  if (hy + hinweisH > UNTERKANTE) {
    neueSeite();
    hy = y;
  }
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(GR.mikro - 0.5);
  doc.setTextColor(...BRAND.muted);
  for (const z of hinweisZeilen) {
    doc.text(z, M, hy);
    hy += ZEILE_KLEIN;
  }
  doc.setTextColor(0, 0, 0);

  // Fußzeile auf allen Seiten außer dem Deckblatt.
  const gesamt = doc.getNumberOfPages();
  for (let i = 2; i <= gesamt; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, gesamt - 1);
  }

  return doc.output("blob");
}

export async function uploadPaketUebersichtPdf(bewerberId: string, blob: Blob): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `paket-uebersicht/${bewerberId}/uebersicht-${stamp}.pdf`;
  const { error } = await supabase.storage.from("bewerbungen").upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from("bewerbungen").createSignedUrl(path, 60 * 60 * 24 * 90);
  return data?.signedUrl ?? path;
}
