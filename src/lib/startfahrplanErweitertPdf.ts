import jsPDF from "jspdf";
import {
  getLizenzPaket,
  formatPreis,
  GESTELLT_ZUSATZ_KURZ,
  LEAD_PAKET_PREIS,
  LEAD_PAKET_ANZAHL,
  LEAD_EINZELPREIS,
  LEAD_PAKET_PREIS_PRO_LEAD,
} from "./lizenzPakete";
import { BEISPIEL_KAUFPREIS_EUR, BEISPIEL_PROVISION_EUR } from "./assessmentSkript";
import {
  DIREKT_FALL_KAUFPREIS_EUR,
  DIREKT_FALL_PROVISION_EUR,
  DIREKT_JAHR_PROVISION_EUR,
} from "./closingDirektSkript";
import { PARTNERSTIMMEN } from "./partnerstimmen";
import {
  ZUSAMMENARBEIT,
  IMMOBILIENTYPEN,
  STANDARD_BERATER,
  type PaketUebersichtBerater,
} from "./paketUebersichtPdf";
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

/* ── Blattmaße und Größen, identisch zum bestehenden Startfahrplan. ── */
const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;
const UNTERKANTE = H - 26;

const GR = { gross: 13, titel: 11, text: 9.5, klein: 8.5, mikro: 7.5 };
const ZEILE = 5;
const ZEILE_KLEIN = 4.2;

const s = (t: string) => sanitizePdfText(t ?? "");

const fmtEUR = (n: number): string =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

const prozent = (v: number) => `${String(v).replace(".", ",")} %`;

/* ── Inhalte, wortgleich zur Closing-Präsentation und zu Teil 2. ── */

/** Die Zettelwand des Einzelkämpfers (Folie "Chaos gegen System"). */
const AUFGABEN_ALLEIN = [
  "Ständig neue Objekte suchen",
  "Bauträger und Anbieter einzeln prüfen",
  "Unterschiedliche Unterlagen und Prozesse",
  "Komplizierte Wirtschaftlichkeitsberechnungen",
  "Finanzierungslösungen organisieren",
  "Kunden nachfassen",
  "Dokumente einsammeln",
  "Notartermine koordinieren",
  "Vermietung und Verwaltung erklären",
  "CRM und Systeme selbst aufbauen",
  "Marketing und Leads selbst generieren",
];

/** Die sechs Bausteine des Gegenbilds (Folie "Du machst Vertrieb, wir den Rest"). */
const BAUSTEINE = ["Produkte", "Finanzierung", "Technologie", "Marketing", "Backoffice", "Vertriebs-Know-how"];

/** Die fünf Werte samt Alltagsbeweis (Folie "Wofür wir stehen"). */
const WERTE: { t: string; d: string }[] = [
  { t: "Performance", d: "Wir wollen Ergebnisse und messen Termine, Beratungen, Abschlüsse und Conversion." },
  { t: "Verantwortung", d: "Wir behandeln Kundengeld wie unser eigenes und verkaufen keine Immobilie, nur weil sie verfügbar ist." },
  { t: "Transparenz", d: "Der Kunde sieht echte Kosten, Cashflows und Annahmen." },
  { t: "Partnerschaft", d: "Wir unterstützen dich beim Deal, statt dir nur ein Exposé zu schicken." },
  { t: "Fortschritt", d: "Immobilienvertrieb muss nicht funktionieren wie vor zwanzig Jahren. Prozesse werden digitalisiert und laufend optimiert." },
];

/** Die acht Stationen des Deal-Prozesses (Folie "Vom Kunden zur Provision"). */
const DEAL_SCHRITTE: { titel: string; text: string }[] = [
  { titel: "Lead", text: "Interessent kommt rein" },
  { titel: "Qualifizierung", text: "Situation und Ziele" },
  { titel: "Strategie", text: "Welche Immobilie passt?" },
  { titel: "Objekt", text: "Investmentcase zeigen" },
  { titel: "Finanzierung", text: "Machbarkeit sichern" },
  { titel: "Closing", text: "Entscheidung" },
  { titel: "Notar", text: "Kaufabschluss" },
  { titel: "Provision", text: "Vergütung" },
];

/** Abgestimmte Hausformulierung, wortgleich zu ablaufplan.ts. */
const GESAMTDAUER =
  "Die erste Provision fließt nach Kaufpreisfälligkeit, meist 8 bis 10 Wochen nach dem Erstkontakt mit dem Kunden.";

/** Erwartungen auf Augenhöhe (Folie "Passt das zu dir?"). */
const ERWARTEN_WIR = [
  "Du betreibst Vertrieb nebenberuflich, im besten Fall hauptberuflich.",
  "Du gewinnst aktiv Kunden und wartest nicht auf Zuteilung.",
  "Du arbeitest mit unseren Prozessen und im CRM.",
  "Du übernimmst Verantwortung für deine Ergebnisse.",
];
const BEKOMMST_DU = [
  "System, Produktzugang und Finanzierungspartner ab Tag eins.",
  "Backoffice und Support für Abwicklung und Papierkram.",
  "Trainings und Begleitung für deine Beratung.",
  "Klare Vergütungssätze, schriftlich im Vertrag.",
];

/**
 * Der Start Woche für Woche (Folie "Dein Start"). Bei "Heute" steht bewusst
 * nur "Deine Entscheidung": Ob sie schon gefallen ist, weiß das Dokument
 * nicht, und eine Unterstellung an dieser Stelle wirkt übergriffig.
 */
const START_SCHRITTE: { wann: string; was: string }[] = [
  { wann: "Heute", was: "Deine Entscheidung." },
  { wann: "Danach", was: "Dein Vertrag kommt digital per Mail zur Unterschrift." },
  { wann: "Tag 1", was: "Onboarding: Zugänge werden freigeschaltet, deine persönliche OS Immobilien E-Mail-Adresse wird eingerichtet." },
  { wann: "Woche 1", was: "Systemzugang, CRM und Investagon. Deine persönliche Erfolgsstrategie mit Zielplanung. Produkt- und Beratungstraining." },
  { wann: "Woche 2", was: "Erste Kundenfälle, begleitet von deinem Ansprechpartner." },
  { wann: "Danach", was: "Der laufende Prozess: Beratung, Objekt, Finanzierung, Notar." },
];

/**
 * Erzeugt den ERWEITERTEN Startfahrplan.
 *
 * Er geht raus, wenn Teil 1 des Erstgesprächs UND Teil 2 "Closing direkt"
 * komplett durchlaufen wurden (Fassungswahl in startfahrplanVersand.ts), und
 * zeichnet die Dramaturgie der Closing-Präsentation schriftlich nach: das
 * Problem des Einzelkämpfers, das Gegenbild, Werte, System, Objekte,
 * Deal-Prozess, Partnerstimmen, ein echter Fall, die eigenen Zahlen aus dem
 * Gespräch, die zwei Wege, das Paket mit den echten Konditionen, Erwartungen
 * auf Augenhöhe, der Start Woche für Woche und ein ruhiger Abschluss: Der
 * nächste Schritt ist nur noch die Unterschrift, der Vertrag kommt per Mail.
 *
 * Ehrlichkeitsregel wie überall: keine erfundenen Zahlen, keine
 * Einkommensversprechen. Alle Beträge stammen aus lizenzPakete.ts,
 * assessmentSkript.ts und closingDirektSkript.ts. Overhead-Provision,
 * Altpakete und Tippgeber kommen nicht vor. Der BESTEHENDE Startfahrplan
 * (buildPaketUebersichtPdf) bleibt unverändert und geht weiterhin raus, wenn
 * nur Teil 1 lief.
 */
export async function buildStartfahrplanErweitertPdf(opts: {
  empfaengerName?: string;
  berater?: PaketUebersichtBerater;
  /**
   * Gewähltes Paket des Bewerbers. Beim Lead-Berater ersetzt der
   * Bereitstellungs-Absatz (Leads werden gestellt, kein Anspruch auf eine
   * bestimmte Menge) den Abschnitt über den qualifizierten Lead-Zugang.
   */
  paketId?: string;
  /**
   * Das in Teil 2 erfasste Abschlusstempo des Bewerbers
   * (closingDirekt.notizen.rechnerAbschluesse, z. B. "1 bis 2"). Fließt in
   * den Abschnitt "Deine Zahlen aus dem Gespräch" ein; ohne Angabe bleibt
   * der Abschnitt bei der allgemeinen Beispielrechnung.
   */
  abschluesseProMonat?: string;
} = {}): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  const junior = getLizenzPaket("junior");
  const provisionssatz = junior?.provisionssatz ?? 4;

  const vollerName = (opts.empfaengerName || "").trim();
  const vorname = vollerName.split(" ")[0] || "";
  const berater = opts.berater?.name?.trim() ? opts.berater : STANDARD_BERATER;
  const beraterName = (berater.name || "").trim();
  const abschluesse = (opts.abschluesseProMonat || "").trim();
  const heute = new Date().toLocaleDateString("de-DE");

  /* ── Seitenführung, identisch zum bestehenden Startfahrplan. ── */
  let y = 0;

  const neueSeite = () => {
    doc.addPage();
    y = addBrandedHeader(doc, logo, "Startfahrplan");
  };

  const platzPruefen = (hoehe: number) => {
    if (y + hoehe > UNTERKANTE) neueSeite();
  };

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
    zeilen: { links: string; rechts: string }[],
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
      const linksZeilen = doc.splitTextToSize(s(zeile.links), spalteB - 4) as string[];
      doc.setFont(PDF_FONT, "normal");
      const rechtsZeilen = doc.splitTextToSize(s(zeile.rechts), spalteB - 4) as string[];
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

  /** Zettelwand: kleine Chips, die den Einzelkämpfer-Alltag zeigen. */
  const chipWand = (chips: string[]) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.mikro);
    const pad = 3;
    const hoeheChip = 6.4;
    const abstandX = 2.5;
    const abstandY = 2.5;
    platzPruefen(hoeheChip * 3 + 8);
    let cx = M;
    for (const chip of chips) {
      const tb = doc.getTextWidth(s(chip)) + 2 * pad;
      if (cx + tb > M + CW) {
        cx = M;
        y += hoeheChip + abstandY;
        platzPruefen(hoeheChip + 4);
      }
      doc.setFillColor(...BRAND.light);
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx, y - 4.4, tb, hoeheChip, 1.6, 1.6, "FD");
      doc.setTextColor(...BRAND.muted);
      doc.text(s(chip), cx + pad, y);
      cx += tb + abstandX;
    }
    y += hoeheChip + 4;
  };

  /** Hervorhebungskasten mit Akzentbalken links, Bauart wie der Kontaktkasten. */
  const hinweisKasten = (titel: string, text: string) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.klein);
    const zeilen = doc.splitTextToSize(s(text), CW - 16) as string[];
    const hoehe = 12 + zeilen.length * ZEILE_KLEIN + 4;
    platzPruefen(hoehe + 6);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(M, y, CW, hoehe, 2, 2, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(M, y, 1.6, hoehe, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(GR.mikro);
    doc.setTextColor(...BRAND.accentDark);
    doc.text(s(titel.toUpperCase()), M + 8, y + 7, { charSpace: 0.8 });
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.klein);
    doc.setTextColor(...BRAND.text);
    let yy = y + 13;
    for (const z of zeilen) {
      doc.text(z, M + 8, yy);
      yy += ZEILE_KLEIN;
    }
    y += hoehe + 6;
  };

  /** Zeitleiste mit Akzentpunkten: Titel links, Kurztext rechtsbündig. */
  const zeitleiste = (stationen: { titel: string; rechts?: string }[]) => {
    stationen.forEach((st, i) => {
      const hoehe = 7;
      if (y + hoehe > UNTERKANTE) neueSeite();
      const punktY = y - 1.4;
      if (i < stationen.length - 1) {
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.5);
        doc.line(M + 2.2, punktY + 2, M + 2.2, punktY + hoehe);
      }
      doc.setFillColor(...BRAND.accent);
      doc.circle(M + 2.2, punktY, 1.6, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.klein);
      doc.setTextColor(...BRAND.primary);
      doc.text(s(st.titel), M + 8, y);
      if (st.rechts) {
        doc.setFont(PDF_FONT, "normal");
        doc.setFontSize(GR.mikro);
        doc.setTextColor(...BRAND.accentDark);
        doc.text(s(st.rechts), W - M, y, { align: "right" });
      }
      y += hoehe;
    });
  };

  /** Der Start Woche für Woche: Zeitpunkt links, Text rechts daneben. */
  const wochenPlan = (schritte: { wann: string; was: string }[]) => {
    for (let i = 0; i < schritte.length; i++) {
      const st = schritte[i];
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.text);
      const textZeilen = doc.splitTextToSize(s(st.was), CW - 34) as string[];
      const hoehe = Math.max(9, textZeilen.length * ZEILE + 4);
      if (y + hoehe > UNTERKANTE) neueSeite();
      const punktY = y - 1.4;
      if (i < schritte.length - 1) {
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.5);
        doc.line(M + 2.2, punktY + 2.2, M + 2.2, punktY + hoehe + 1);
      }
      doc.setFillColor(...BRAND.accent);
      doc.circle(M + 2.2, punktY, 1.6, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.accentDark);
      doc.text(s(st.wann.toUpperCase()), M + 8, y, { charSpace: 0.6 });
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.text);
      doc.setTextColor(...BRAND.text);
      let yy = y;
      for (const z of textZeilen) {
        doc.text(z, M + 34, yy);
        yy += ZEILE;
      }
      y += hoehe;
    }
    y += 2;
  };

  /** Zwei Partnerstimmen als ruhige Karten nebeneinander. */
  const stimmenKarten = (stimmen: { name: string; rolle: string; vorher: string; jetzt: string }[]) => {
    if (stimmen.length === 0) return;
    const abstand = 5;
    const breite = (CW - (stimmen.length - 1) * abstand) / stimmen.length;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(GR.mikro);
    const inhalte = stimmen.map((st) => ({
      vorher: doc.splitTextToSize(s(st.vorher), breite - 10) as string[],
      jetzt: doc.splitTextToSize(s(st.jetzt), breite - 10) as string[],
    }));
    const blockH = (i: number) =>
      inhalte[i].vorher.length * ZEILE_KLEIN + 2 + inhalte[i].jetzt.length * ZEILE_KLEIN;
    const hoehe = 10 + Math.max(...stimmen.map((_, i) => blockH(i))) + 12;
    platzPruefen(hoehe + 4);
    stimmen.forEach((st, i) => {
      const cx = M + i * (breite + abstand);
      doc.setFillColor(...BRAND.light);
      doc.roundedRect(cx, y, breite, hoehe, 2, 2, "F");
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(14);
      doc.setTextColor(...BRAND.accent);
      doc.text("„", cx + 4, y + 8);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.muted);
      let yy = y + 12;
      for (const z of inhalte[i].vorher) {
        doc.text(z, cx + 5, yy);
        yy += ZEILE_KLEIN;
      }
      yy += 2;
      doc.setTextColor(...BRAND.text);
      for (const z of inhalte[i].jetzt) {
        doc.text(z, cx + 5, yy);
        yy += ZEILE_KLEIN;
      }
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(GR.mikro);
      doc.setTextColor(...BRAND.primary);
      doc.text(s(`${st.name} · ${st.rolle}`), cx + 5, y + hoehe - 4);
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
      "Unser komplettes Gespräch auf einen Blick: warum ein System, was du bekommst, deine Zahlen und wie dein Start aussieht.",
    empfaenger: vollerName || undefined,
    datum: heute,
    fusszeile: "Unverbindliche Information. Verbindlich ist allein der Vertriebspartnervertrag.",
  });

  // ═══════════════════════════════════════════════════════════════════
  // Inhalt: Anrede, dann der Spannungsbogen der Präsentation
  // ═══════════════════════════════════════════════════════════════════
  neueSeite();

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(GR.gross);
  doc.setTextColor(...BRAND.primary);
  doc.text(vorname ? s(`Hallo ${vorname},`) : "Hallo,", M, y);
  y += 8;

  absatz(
    "wir haben in unserem Gespräch alles durchgesprochen, was für deine Entscheidung zählt: warum der Alleingang so schwer ist, wie das OS Immobilien System dich trägt, wie ein echter Deal läuft, deine eigenen Zahlen und deine Konditionen. Hier steht das alles noch einmal Schwarz auf Weiß, in derselben Reihenfolge. Am Ende bleibt nur noch ein Schritt offen, und der ist bewusst klein.",
  );
  y += 6;

  abschnitt("Warum die meisten Einzelkämpfer nicht am Verkaufen scheitern", 40);
  absatz("Die meisten, die im Immobilienvertrieb alleine starten, verkaufen nicht. Sie verwalten Probleme:");
  y += 2;
  chipWand(AUFGABEN_ALLEIN);
  y += 2;
  absatz(
    "Der Engpass ist selten der Vertrieb. Der Engpass ist die Infrastruktur dahinter. Wer sie alleine aufbauen will, verliert Monate, oft Jahre, bevor der erste Euro fließt.",
  );
  y += 6;

  abschnitt("Das Gegenbild: Du machst Vertrieb, wir den Rest", 36);
  absatz(
    "Bei OS Immobilien konzentrierst du dich auf die drei Dinge, für die es dich wirklich braucht: Du gewinnst Kunden. Du berätst. Du schließt ab. Alles andere baut OS Immobilien um dich herum:",
  );
  y += 2;
  chipWand(BAUSTEINE);
  y += 2;
  absatz(
    "Das heißt für dich: keine eigene Firma mit fünfzehn verschiedenen Dienstleistern aufbauen. Du steigst in ein laufendes System ein und fängst dort an, wo andere erst nach Jahren ankommen.",
  );
  y += 6;

  abschnitt("Wofür OS Immobilien steht", 44);
  absatz(
    "Wir wollen Immobilieninvestment einfacher, transparenter und erfolgreicher machen. Dahinter stehen fünf Werte, an denen du uns messen kannst:",
    GR.klein,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 4;
  punktListe(WERTE);
  y += 4;

  abschnitt("Das System: was du bekommst und was es dir spart", 44);
  absatz(
    "Du arbeitest als selbständiger Vertriebspartner mit der kompletten Infrastruktur von OS Immobilien im Rücken:",
    GR.klein,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;
  zweiSpaltenTabelle(
    "Was du von uns bekommst",
    "Was es dir spart",
    ZUSAMMENARBEIT.map((z) => ({ links: z.bekommst, rechts: z.spart })),
  );
  y += 4;

  abschnitt("Echte Objekte an starken Standorten", 44);
  kartenReihe(IMMOBILIENTYPEN);
  absatz(
    "Unser Fokus liegt in Bayern mit München und Umland, Augsburg und Nürnberg. Dazu kommen ausgewählte Objekte deutschlandweit und immer wieder Offmarket-Objekte außerhalb der Portale. Und ganz wichtig: Nicht das Produkt steht zuerst, der Kunde steht zuerst. Aus seinen Zielen ergibt sich die Strategie, und daraus das passende Objekt.",
    GR.klein,
    BRAND.text,
    ZEILE_KLEIN,
  );
  y += 8;

  abschnitt("Vom Kunden zur Provision: der Deal-Prozess", 50);
  zeitleiste(DEAL_SCHRITTE.map((d, i) => ({ titel: `${i + 1}. ${d.titel}`, rechts: d.text })));
  y += 2;
  absatz(GESAMTDAUER, GR.klein, BRAND.text, ZEILE_KLEIN);
  absatz("Du führst den Kunden, das System trägt die Abwicklung.", GR.klein, BRAND.muted, ZEILE_KLEIN);
  y += 6;

  // Nur echte, freigegebene Stimmen aus partnerstimmen.ts. Ist die Liste
  // leer, entfällt der Abschnitt komplett, wie in der Präsentation.
  if (PARTNERSTIMMEN.length > 0) {
    abschnitt("Die, die schon losgelegt haben", 50);
    stimmenKarten(PARTNERSTIMMEN.slice(0, 2));
  }

  abschnitt("Ein echter Deal, echte Zahlen", 40);
  absatz(
    `Ein typischer Fall aus unserem Alltag: Ein Kunde mit 4.500 Euro netto im Monat will Vermögen aufbauen und Steuern optimieren. Er kauft eine Wohnung für ${fmtEUR(DIREKT_FALL_KAUFPREIS_EUR)}, voll finanziert. Deine Vergütung bei unseren ${prozent(provisionssatz)}: ${fmtEUR(DIREKT_FALL_PROVISION_EUR)} für einen einzigen Abschluss. Ein Kunde, ein Objekt, ein Abschluss.`,
  );
  y += 2;
  absatz(
    "Das ist eine Beispielrechnung, abhängig von Provisionsbasis und Dealstruktur, vor Kosten und Steuern. Wir versprechen dir kein Einkommen, wir zeigen dir die Rechnung.",
    GR.mikro,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;

  abschnitt("Deine Zahlen aus dem Gespräch", 52);
  absatz(
    abschluesse
      ? `Im Gespräch haben wir mit deinem eigenen Abschlusstempo gerechnet, deine Annahme: ${abschluesse} Abschlüsse im Monat. Den Kaufpreis legen wir bewusst nicht fest, er richtet sich beim echten Deal nach der Bonität deines Kunden. Gerechnet haben wir mit einem Beispielwert von ${fmtEUR(BEISPIEL_KAUFPREIS_EUR)}.`
      : `Zur Einordnung: Im ersten Jahr sind ein bis zwei Abschlüsse im Monat ein realistisches Ziel. Den Kaufpreis legen wir bewusst nicht fest, er richtet sich beim echten Deal nach der Bonität deines Kunden. Gerechnet wird deshalb mit einem Beispielwert von ${fmtEUR(BEISPIEL_KAUFPREIS_EUR)}.`,
  );
  y += 4;
  kennzahlKacheln([
    {
      wert: fmtEUR(BEISPIEL_PROVISION_EUR),
      sub: `Vergütung je Abschluss beim Beispielwert von ${fmtEUR(BEISPIEL_KAUFPREIS_EUR)} Kaufpreis und ${prozent(provisionssatz)}`,
    },
    {
      wert: fmtEUR(DIREKT_JAHR_PROVISION_EUR),
      sub: "aufs Jahr gerechnet bei einem Abschluss pro Monat, vor Kosten und Steuern",
    },
    {
      wert: "8 bis 10 Wochen",
      sub: "vom Erstkontakt mit dem Kunden bis zur ersten Provision, im Regelfall",
    },
  ]);
  hinweisKasten(
    "Was Warten kostet",
    "Jeder Monat, den du wartest, ist ein Monat, in dem diese Rechnung für dich bei null steht. Die Kunden und die Objekte warten nicht auf deinen Startzeitpunkt.",
  );
  absatz(
    "Auch das ist eine Beispielrechnung, kein Einkommensversprechen. Tatsächliche Kaufpreise, Provisionshöhe und Abschlussfrequenz variieren je nach Objekt, Kunde und eigener Aktivität.",
    GR.mikro,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;

  abschnitt("Zwei Wege, ein Satz", 34);
  absatz(
    `Es gibt zwei Wege und ein System dahinter. Der erste Weg sind eigene Kunden aus deinem Netzwerk, damit startet der Großteil unserer Partner. Der zweite Weg ist die Arbeit mit Leads aus unserem Marketingsystem. Das Entscheidende: Für beide Wege gilt derselbe Satz, ${prozent(provisionssatz)} auf jeden Abschluss. Keine Stufen, die du dir erst verdienen musst, keine kleinere Einstiegsprovision.`,
  );
  y += 6;

  const paket = getLizenzPaket(opts.paketId);
  const paketTitel = paket && !paket.istTippgeber ? paket.titel : "Vertriebspartner";
  abschnitt(`Dein Paket: ${paketTitel}`, 52);
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
    `CRM, Investagon, Objektzugänge, Exposés und alle Pflichtschulungen sind unentgeltlich. Ebenfalls gestellt, ohne eigenen Vertrag und ohne Monatsgebühr: ${GESTELLT_ZUSATZ_KURZ}. Ein einziger Abschluss beim Beispielwert von ${fmtEUR(BEISPIEL_KAUFPREIS_EUR)} bringt dir ${fmtEUR(BEISPIEL_PROVISION_EUR)}, und davon geht nichts für das System ab. Der Hebel liegt im Abschluss.`,
  );
  y += 2;
  absatz(
    "Und was wir nicht sind: Wir sind kein Strukturvertrieb ohne Produkt. Deine Vergütung kommt aus echten Immobilienabschlüssen mit echten Kunden, nicht aus dem Anwerben neuer Partner.",
    GR.klein,
    BRAND.text,
    ZEILE_KLEIN,
  );
  y += 6;

  if (opts.paketId === "lead_berater") {
    // Lead-Berater: kein käuflicher Leadzugang. Stattdessen die
    // Bereitstellungszusage, wortgleich zum bestehenden Startfahrplan.
    abschnitt("Leads zur Unterstützung", 30);
    absatz(
      "Im Paket Lead-Berater stellen wir dir Leads zur Unterstützung deiner eigenen Akquisition bereit. Die Bereitstellung erfolgt nach Verfügbarkeit, ohne definierte Stückzahl und ohne Anspruch auf eine bestimmte Menge. Ein Kauf von Leadpaketen oder Einzel-Leads ist in diesem Paket nicht vorgesehen.",
    );
    y += 2;
    punktListe([
      { d: "Die gestellten Leads dienen der Unterstützung, nicht als garantierter Zulauf." },
      { d: "Eigenakquise und Empfehlungsgeschäft bleiben ausdrücklich empfohlen." },
    ]);
    y += 4;
  } else {
    // Der Leadkauf steht jedem Partner offen, als optionaler Beschleuniger.
    // Formulierung entlang des Preis-Abschnitts in Teil 2
    // (closingDirektSkript.ts) und des bestehenden Startfahrplans. Gestellte
    // Leads über den Folge-Call sind reine Ermessenssache und werden hier
    // bewusst nicht versprochen.
    abschnitt("Dein eigener Leadkanal (optional)", 44);
    absatz(
      `Wenn du von Anfang an mehr Gespräche führen willst, kannst du dir jederzeit qualifizierte Leads dazukaufen: ${formatPreis(LEAD_PAKET_PREIS)} netto für ${LEAD_PAKET_ANZAHL} qualifizierte Leads, also ${formatPreis(LEAD_PAKET_PREIS_PRO_LEAD)} je Lead, jederzeit erneut buchbar, einzelne Leads für ${formatPreis(LEAD_EINZELPREIS)} netto. Dein Betrag wird eins zu eins als Werbebudget für die Gewinnung deiner Leads eingesetzt.`,
    );
    y += 2;
    punktListe([
      { d: "Qualifiziert heißt: echtes Interesse an einer Kapitalanlage, mindestens 3.000 Euro netto im Monat, Eigenkapital vorhanden." },
      { d: "Erfüllt ein Lead diese Zusage nicht, ist er nicht erreichbar oder falsch hinterlegt, bekommst du einen Ersatzlead." },
      { d: "Ein Muss ist das nicht, dein eigenes Netzwerk reicht völlig für den Start." },
    ]);
    // Gestellte Leads nur als dezente Randnotiz, ohne Hürden-Ton und ohne
    // Zusage: Die Abstimmung liegt bei der Geschäftsführung (dad14e4e).
    absatz(
      "Besonders überzeugende Partner können nach Abstimmung mit der Geschäftsführung zusätzlich mit gestellten Leads unterstützt werden.",
      GR.mikro,
      BRAND.muted,
      ZEILE_KLEIN,
    );
    y += 4;
  }

  abschnitt("Erwartungen auf Augenhöhe", 44);
  absatz(
    "Die Zusammenarbeit trägt nur, wenn beide Seiten liefern. Deshalb stand es im Gespräch, und deshalb steht es auch hier:",
    GR.klein,
    BRAND.muted,
    ZEILE_KLEIN,
  );
  y += 6;
  zweiSpaltenTabelle(
    "Was wir von dir erwarten",
    "Was du von uns bekommst",
    ERWARTEN_WIR.map((e, i) => ({ links: e, rechts: BEKOMMST_DU[i] })),
  );
  absatz("OS Immobilien gibt dir die Plattform. Was du daraus machst, liegt bei dir.", GR.text, BRAND.accentDark);
  y += 6;

  // Der Wochenplan ist das Kernstück und bleibt ungeteilt auf einer Seite.
  platzPruefen(120);
  abschnitt("Dein Start, Woche für Woche", 60);
  wochenPlan(START_SCHRITTE);
  absatz(
    "Zwei Dinge brauchst du formal: dein eigenes Gewerbe und die Erlaubnis nach Paragraf 34c. Fehlt davon noch etwas, ist das kein Hindernis, wir unterstützen dich beim Antrag.",
    GR.klein,
    BRAND.text,
    ZEILE_KLEIN,
  );
  y += 8;

  // Der Schlussteil braucht Text und Kontaktkasten am Stück.
  platzPruefen(110);
  abschnitt("Der letzte Schritt", 40);
  absatz(
    vorname
      ? `Du hast alles gesehen, ${vorname}: das System, die Produkte, den Prozess, deine Zahlen und deine Konditionen. Es gibt keine offene Frage mehr, die zwischen dir und dem Start steht. Der nächste Schritt ist nur noch deine Unterschrift.`
      : "Du hast alles gesehen: das System, die Produkte, den Prozess, deine Zahlen und deine Konditionen. Es gibt keine offene Frage mehr, die zwischen dir und dem Start steht. Der nächste Schritt ist nur noch deine Unterschrift.",
  );
  y += 2;
  absatz(
    "Dein Vertriebspartnervertrag kommt mit genau den besprochenen Konditionen per Mail. Du schaust in Ruhe drüber und unterschreibst digital, da drängt dich niemand. Sobald uns deine Unterschrift vorliegt, melden wir uns wegen deines Onboarding-Termins. Und noch etwas, das dir wichtig sein dürfte: Was du hier aufbaust, gehört dir. Deine eigenen Kunden bleiben deine, auch wenn wir irgendwann nicht mehr zusammenarbeiten sollten.",
  );
  y += 8;

  // Kontaktkasten, Bauart und Rückfall wie im bestehenden Startfahrplan.
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
  doc.text("Wir freuen uns auf die Zusammenarbeit.", M, y);
  y += 5;

  // Rechtlicher Hinweis am Fuß der letzten Seite, Mechanik wie im Bestand.
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(GR.mikro - 0.5);
  doc.setTextColor(...BRAND.muted);
  const hinweis =
    "Alle Preise verstehen sich wie angegeben (Leadpreise netto zzgl. USt., Provisionssätze brutto inkl. USt.). Alle Rechenbeispiele sind Beispielrechnungen ohne Einkommenszusage. Verbindlich ist ausschließlich der jeweilige Vertriebspartnervertrag mit seinen Anlagen.";
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
