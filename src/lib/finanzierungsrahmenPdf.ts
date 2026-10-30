import { jsPDF } from "jspdf";
import { calculateFinanzierbarkeitFromSaData, RAHMEN_PUFFER, RAHMEN_ANNUITAET } from "./finanzierbarkeitUtils";
import { sanitizePdfText } from "./pdfBranding";

/*
 * Finanzierungsrahmen aus einer ausgefüllten Selbstauskunft, für den
 * Vertriebspartner (Christian, 30.10.2026): nach der Selbstauskunft direkt in
 * die Objektwahl, mit Kaufpreis von, Empfehlung und bis.
 *
 * Gerechnet wird ausschließlich mit `calculateFinanzierbarkeitFromSaData`, also
 * genau so wie im Kundenprofil des CRM. Die Kaufpreise sind die drei Werte des
 * Rahmens (Darlehen zu 80, 100 und 120 Prozent plus Eigenkapital); die
 * Kaufnebenkosten werden bewusst nicht abgezogen, sie kommen aus Eigenkapital
 * oder einem Nachrangdarlehen.
 */
export interface Finanzierungsrahmen {
  kaufpreisVon: number;
  kaufpreisEmpfehlung: number;
  kaufpreisBis: number;
  einnahmen: number;
  ausgaben: number;
  ueberschuss: number;
  tragbareRate: number;
  maxDarlehen: number;
  eigenkapital: number;
  zweiPersonen: boolean;
  immobilienHinweis: string | null;
  /** Kein Überschuss, also kein Darlehen: dann gibt es keinen Rahmen zum Anzeigen. */
  ohneRahmen: boolean;
}

export function finanzierungsrahmenAusSelbstauskunft(data: unknown): Finanzierungsrahmen | null {
  const r = calculateFinanzierbarkeitFromSaData(data);
  if (!r) return null;
  return {
    kaufpreisVon: r.minRahmen,
    kaufpreisEmpfehlung: r.empfRahmen,
    kaufpreisBis: r.maxRahmen,
    einnahmen: r.sumEink,
    ausgaben: r.sumAusg,
    ueberschuss: r.ueberschuss,
    tragbareRate: Math.max(0, Math.round(r.ueberschuss * RAHMEN_PUFFER)),
    maxDarlehen: r.maxDarlehen,
    eigenkapital: r.eigenkapital,
    zweiPersonen: r.hasPerson2,
    immobilienHinweis: r.immobilienHinweis,
    ohneRahmen: r.maxDarlehen <= 0,
  };
}

export const euro = (n: number) =>
  `${Math.round(n).toLocaleString("de-DE")} €`;

export const RAHMEN_ERKLAERUNG = [
  `Einnahmen nach Bankansatz: Mieteinnahmen zu 80 %, alles andere wie eingetragen.`,
  `Ausgaben nach Bankansatz: Lebenshaltung mindestens 30 % vom Netto, mindestens 1.000 € je Person.`,
  `Tragbare Rate: ${Math.round(RAHMEN_PUFFER * 100)} % des monatlichen Überschusses.`,
  `Darlehen: Rate × 12 ÷ ${String(RAHMEN_ANNUITAET * 100).replace(".", ",")} % (Zins und Tilgung).`,
  `Kaufpreis von, Empfehlung und bis: Darlehen zu 80 %, 100 % und 120 % plus Eigenkapital. Kaufnebenkosten sind nicht abgezogen.`,
];

/*
 * Gestaltung wie die Exposés (Christian, 30.10.2026): Playfair Display für
 * Überschriften und Beträge, Outfit für Text, Tannengrün und Mint, abgerundete
 * Kästen (2,5 mm wie im Exposé), gesperrte Kleinüberschriften. Die Schriften
 * liegen als TTF unter /fonts, umgewandelt aus den Web-Schriften des CRM.
 * Fehlen sie, entsteht das PDF in Helvetica.
 */
const F = {
  navy: [18, 54, 42] as [number, number, number],
  gruen: [25, 138, 95] as [number, number, number],
  mint: [167, 215, 197] as [number, number, number],
  papier: [243, 246, 244] as [number, number, number],
  grau: [86, 99, 93] as [number, number, number],
  linie: [211, 224, 217] as [number, number, number],
  weiss: [255, 255, 255] as [number, number, number],
};
const SCHRIFTEN: [string, string, string][] = [
  ["PlayfairDisplay-Medium.ttf", "Playfair", "normal"],
  ["PlayfairDisplay-Italic.ttf", "Playfair", "italic"],
  ["Outfit-Regular.ttf", "Outfit", "normal"],
  ["Outfit-SemiBold.ttf", "Outfit", "bold"],
];
let schriftCache: Record<string, string> | null = null;

async function base64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Schrift fehlt: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Bettet die Exposé-Schriften ein; gibt zurück, welche Familien gesetzt werden. */
async function exposeSchriften(doc: jsPDF): Promise<{ serif: string; sans: string }> {
  try {
    if (!schriftCache) {
      const daten = await Promise.all(SCHRIFTEN.map(([d]) => base64(`/fonts/${d}`)));
      schriftCache = Object.fromEntries(SCHRIFTEN.map(([d], i) => [d, daten[i]]));
    }
    for (const [datei, familie, stil] of SCHRIFTEN) {
      doc.addFileToVFS(datei, schriftCache[datei]);
      doc.addFont(datei, familie, stil);
    }
    return { serif: "Playfair", sans: "Outfit" };
  } catch (e) {
    console.warn("[Finanzierungsrahmen] Exposé-Schriften nicht ladbar, Helvetica", e);
    return { serif: "times", sans: "helvetica" };
  }
}

/** Eine Seite A4 im Stil der Exposés. */
export async function erstelleFinanzierungsrahmenPdf(
  rahmen: Finanzierungsrahmen,
  kundeName: string,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { serif, sans } = await exposeSchriften(doc);
  const M = 18;
  const B = 210 - 2 * M;
  const datum = new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const t = (s: string) => sanitizePdfText(s);
  const farbe = (c: [number, number, number]) => doc.setTextColor(...c);

  // Gesperrte Kleinüberschrift mit Strich dahinter, wie „10 NACHWEISE ——“ im Exposé.
  const augenbraue = (text: string, y: number) => {
    doc.setFont(sans, "bold");
    doc.setFontSize(7.5);
    farbe(F.gruen);
    const sperr = 1.1;
    doc.text(t(text.toUpperCase()), M, y, { charSpace: sperr });
    const breite = doc.getTextWidth(text.toUpperCase()) + text.length * sperr;
    doc.setDrawColor(...F.gruen);
    doc.setLineWidth(0.3);
    doc.line(M + breite + 3, y - 1.1, M + breite + 15, y - 1.1);
  };

  let y = 24;
  augenbraue("Finanzierungsrahmen", y);
  y += 14;
  // Titel: aufrecht, dann kursiv in Grün, wie die Exposé-Überschriften.
  doc.setFont(serif, "normal");
  doc.setFontSize(26);
  farbe(F.navy);
  const teil1 = "Ihr Rahmen ";
  doc.text(teil1, M, y);
  const x2 = M + doc.getTextWidth(teil1);
  doc.setFont(serif, "italic");
  farbe(F.gruen);
  doc.text(t("für die Objektwahl."), x2, y);
  y += 9;
  doc.setFont(sans, "normal");
  doc.setFontSize(10);
  farbe(F.grau);
  doc.text(t(`${kundeName ? `${kundeName} · ` : ""}Grundlage: Selbstauskunft vom ${datum}${rahmen.zweiPersonen ? ", beide Personen zusammen" : ""}`), M, y);
  y += 11;

  if (rahmen.ohneRahmen) {
    doc.setFillColor(...F.papier);
    doc.roundedRect(M, y, B, 26, 2.5, 2.5, "F");
    doc.setFont(serif, "normal");
    doc.setFontSize(15);
    farbe(F.navy);
    doc.text("Derzeit kein Finanzierungsrahmen", M + 7, y + 11);
    doc.setFont(sans, "normal");
    doc.setFontSize(9.5);
    farbe(F.grau);
    doc.text(t(`Die Ausgaben sind höher als die Einnahmen (Überschuss ${euro(rahmen.ueberschuss)}).`), M + 7, y + 19);
    y += 36;
  } else {
    const kb = (B - 8) / 3;
    const kh = 38;
    const kacheln: [string, number, string, boolean][] = [
      ["Kaufpreis von", rahmen.kaufpreisVon, "80 % des Darlehens + Eigenkapital", false],
      ["Empfehlung", rahmen.kaufpreisEmpfehlung, "Darlehen + Eigenkapital", true],
      ["Kaufpreis bis", rahmen.kaufpreisBis, "120 % des Darlehens + Eigenkapital", false],
    ];
    kacheln.forEach(([titel, wert, unter, hervor], i) => {
      const x = M + i * (kb + 4);
      doc.setFillColor(...(hervor ? F.navy : F.papier));
      doc.roundedRect(x, y, kb, kh, 2.5, 2.5, "F");
      doc.setFont(sans, "bold");
      doc.setFontSize(7);
      farbe(hervor ? F.mint : F.gruen);
      doc.text(t(titel.toUpperCase()), x + 6, y + 9, { charSpace: 0.8 });
      doc.setFont(serif, "normal");
      doc.setFontSize(21);
      farbe(hervor ? F.weiss : F.navy);
      doc.text(t(euro(wert)), x + 6, y + 22);
      doc.setFont(sans, "normal");
      doc.setFontSize(7.5);
      farbe(hervor ? F.mint : F.grau);
      doc.text(t(unter), x + 6, y + 31);
    });
    y += kh + 9;
    doc.setFont(sans, "normal");
    doc.setFontSize(9.5);
    farbe(F.navy);
    const satz = doc.splitTextToSize(
      t(`Für die Objektwahl: Wohnungen mit einem Kaufpreis bis rund ${euro(rahmen.kaufpreisEmpfehlung)} passen zur Empfehlung, ${euro(rahmen.kaufpreisBis)} ist die Obergrenze. Die Kaufnebenkosten kommen aus Eigenkapital oder einem Nachrangdarlehen und sind hier nicht abgezogen.`),
      B,
    );
    doc.text(satz, M, y);
    y += satz.length * 4.8 + 9;
  }

  // Rechenweg in einem abgerundeten Kasten mit Haarlinien.
  augenbraue("Rechenweg", y);
  y += 5;
  const zeilen: [string, string, boolean][] = [
    ["Einnahmen im Monat (Bankansatz)", euro(rahmen.einnahmen), false],
    ["Ausgaben im Monat (Bankansatz)", `− ${euro(rahmen.ausgaben)}`, false],
    ["Überschuss im Monat", euro(rahmen.ueberschuss), true],
    [`Tragbare Rate (${Math.round(RAHMEN_PUFFER * 100)} % des Überschusses)`, euro(rahmen.tragbareRate), false],
    [`Darlehen (Rate × 12 ÷ ${String(RAHMEN_ANNUITAET * 100).replace(".", ",")} %)`, euro(Math.max(0, rahmen.maxDarlehen)), false],
    ["+ Eigenkapital laut Selbstauskunft", euro(rahmen.eigenkapital), false],
    ["= Empfohlener Kaufpreis", euro(rahmen.ohneRahmen ? 0 : rahmen.kaufpreisEmpfehlung), true],
  ];
  const zh = 8;
  doc.setFillColor(...F.papier);
  doc.roundedRect(M, y, B, zeilen.length * zh + 6, 2.5, 2.5, "F");
  let zy = y + 3;
  zeilen.forEach(([label, wert, fett], i) => {
    if (i > 0) {
      doc.setDrawColor(...F.linie);
      doc.setLineWidth(0.25);
      doc.line(M + 6, zy, M + B - 6, zy);
    }
    doc.setFont(sans, fett ? "bold" : "normal");
    doc.setFontSize(9);
    farbe(fett ? F.navy : F.grau);
    doc.text(t(label), M + 6, zy + 5.4);
    doc.setFont(sans, "bold");
    farbe(F.navy);
    doc.text(t(wert), M + B - 6, zy + 5.4, { align: "right" });
    zy += zh;
  });
  y = zy + 3 + 10;

  augenbraue("So wird gerechnet", y);
  y += 5;
  doc.setFont(sans, "normal");
  doc.setFontSize(8.5);
  const absaetze = RAHMEN_ERKLAERUNG.map((x) => doc.splitTextToSize(t(x), B - 18) as string[]);
  const kastenH = absaetze.reduce((h, a) => h + a.length * 4.2 + 2.2, 0) + 6;
  doc.setDrawColor(...F.linie);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, B, kastenH, 2.5, 2.5, "S");
  let py = y + 7;
  for (const a of absaetze) {
    doc.setFillColor(...F.gruen);
    doc.circle(M + 7, py - 1.2, 0.8, "F");
    farbe(F.navy);
    doc.text(a, M + 11, py);
    py += a.length * 4.2 + 2.2;
  }
  y += kastenH + 6;
  if (rahmen.immobilienHinweis) {
    doc.setFontSize(8);
    farbe(F.grau);
    const z = doc.splitTextToSize(t(rahmen.immobilienHinweis), B);
    doc.text(z, M, y);
  }

  // Fuß wie im Exposé: Stand links in Grün, rechts Dokument und Seite.
  doc.setFont(sans, "normal");
  doc.setFontSize(7.5);
  farbe(F.grau);
  doc.text(
    doc.splitTextToSize(t("Unverbindliche Orientierung auf Grundlage der Angaben in der Selbstauskunft. Keine Finanzierungszusage und keine Finanzierungsberatung; die Entscheidung trifft die Bank nach Prüfung der Unterlagen."), B),
    M,
    297 - 27,
  );
  doc.setDrawColor(...F.linie);
  doc.setLineWidth(0.3);
  doc.line(M, 297 - 17, M + B, 297 - 17);
  doc.setFont(sans, "bold");
  doc.setFontSize(7.5);
  farbe(F.gruen);
  doc.text(`Stand ${datum}`, M, 297 - 11);
  doc.setFont(sans, "normal");
  farbe(F.grau);
  doc.text(t(`Finanzierungsrahmen${kundeName ? ` · ${kundeName}` : ""} · 1 / 1`), M + B, 297 - 11, { align: "right" });
  return doc;
}
