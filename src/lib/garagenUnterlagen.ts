/**
 * Garagenunterlagen für Käufer (Christian, 17.10.2026, Hauffstraße): Nach
 * dem Notartermin bekommt der Käufer zwei Schreiben, ausgefüllt mit dem, was
 * das CRM weiß:
 *
 * 1. Anschreiben der OS Immobilien Holding an den Käufer „Ihre Garage: Miete
 *    und Subvention für die ersten 12 Monate“ (mit dem Musterschreiben als
 *    Anlage auf Seite 2);
 * 2. das Musterschreiben einzeln, das der Käufer als neuer Eigentümer an den
 *    Nutzer der Garage schickt (Mietanpassung auf 100 €).
 *
 * Der Text ist wörtlich aus den Vorlagen „Brief Eigentümer Garage Subvention
 * (Vorlage).pdf“ und „Anlage Musterschreiben Garagennutzer (Vorlage).pdf“.
 * Was das CRM nicht kennt (IBAN, Telefon, Fristen, Nutzer einer extern
 * vermieteten Garage), bleibt als Lücke zum Ausfüllen. Das Anschreiben setzt
 * eine vermietete Garage voraus; für freie Garagen wird nichts erzeugt.
 */
import jsPDF from "jspdf";
import { ensureUnicodeFont, PDF_FONT, sanitizePdfText } from "./pdfBranding";

export interface GaragenBriefAngaben {
  kaeuferName: string;
  kaeuferStrasse: string;
  kaeuferPlzOrt: string;
  /** „WE 16“ */
  weNr: string;
  /** „38 c“ aus den Listendaten; leer, wenn unbekannt. */
  haus: string;
  garageNr: string;
  /** Aktuelle Garagenmiete je Monat. */
  istMiete: number;
  /** Zielmiete der Garage, bei der Hauffstraße 100 €. */
  zielMiete: number;
  /** Nutzer der Garage, wenn bekannt (etwa der Wohnungsmieter). */
  nutzerName?: string;
  /** ISO-Datum der Übergabe („seit dem … bin ich Eigentümer“). */
  uebergabe?: string;
  /** ISO-Datum des Schreibens. */
  datum: string;
}

const LUECKE = "______";
const eurText = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const datumText = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "TT.MM.JJJJ");
const oder = (wert: string | undefined, platzhalter = LUECKE) => (wert && wert.trim() ? wert.trim() : platzhalter);

/** Die Texte der beiden Schreiben mit eingesetzten Werten, ohne Layout. */
export function garagenBriefTexte(a: GaragenBriefAngaben) {
  const garage = oder(a.garageNr);
  const haus = a.haus ? `38 ${a.haus.replace(/^38\s*/, "")}` : "38 _";
  const mehr = Math.max(0, a.zielMiete - a.istMiete);
  return {
    anschreiben: {
      absenderZeile: "OS Immobilien Holding GmbH · Am Ostbahnhof 1 · 15749 Mittenwalde",
      empfaenger: [oder(a.kaeuferName, "Vorname Nachname"), oder(a.kaeuferStrasse, "Straße Hausnummer"), oder(a.kaeuferPlzOrt, "PLZ Ort")],
      angaben: [["Objekt", "Hauffstraße 38 a–f, Geltow"], ["Wohnung", `${a.weNr}, Haus ${haus}`], ["Garage", `Nr. ${garage}`], ["Datum", `Mittenwalde, ${datumText(a.datum)}`]],
      betreff: `Ihre Garage: Miete und Subvention für die ersten 12 Monate`,
      absaetze: [
        "Sehr geehrte Damen und Herren,",
        "nach Zahlung des Kaufpreises stehen Ihnen ab dem Ersten des Folgemonats die Mieten Ihrer Wohnung und Ihrer Garage zu.",
        `Die Garage Nr. ${garage} ist über einen eigenen Mietvertrag mit drei Monaten Kündigungsfrist vermietet, derzeit für ${eurText(a.istMiete)} € im Monat.`,
        `Weil Garagen in der Wohnanlage stark nachgefragt sind, können Sie mit dem Nutzer eine Miete von ${eurText(a.zielMiete).replace(",00", "")} € im Monat vereinbaren oder die Garage nach Kündigung zu diesem Preis neu vermieten; den Nutzer informieren wir vorab, ein Musterschreiben dafür liegt bei.`,
        `Für 12 Monate ab Übergabe gleichen wir die Differenz zwischen der tatsächlich gezahlten Garagenmiete und ${eurText(a.zielMiete).replace(",00", "")} € im Monat aus.`,
        "Danach erhalten Sie die Garagenmiete allein vom Nutzer; bei Fragen sind wir gern für Sie da.",
        "Mit freundlichen Grüßen",
      ],
      unterschrift: ["Oliver Skowrnowski", "Geschäftsführer, OS Immobilien Holding GmbH"],
      anlage: "Anlage: Musterschreiben an den Nutzer der Garage",
      fuss: ["OS Immobilien Holding GmbH · Am Ostbahnhof 1 · 15749 Mittenwalde", "Tel. +49 (0) 30 863289210 · os@os-immobilien.com · os-immobilien.com", "Geschäftsführer: Oliver Skowrnowski · Amtsgericht Potsdam · HRB 35976 P"],
    },
    muster: {
      kopf: "ANLAGE · MUSTERSCHREIBEN DES EIGENTÜMERS AN DEN NUTZER DER GARAGE",
      absender: [oder(a.kaeuferName, "Vorname Nachname (Eigentümer/in)"), oder(a.kaeuferStrasse, "Straße Hausnummer"), oder(a.kaeuferPlzOrt, "PLZ Ort"), "Telefon / E-Mail"],
      empfaenger: [oder(a.nutzerName, "Vorname Nachname (Nutzer/in der Garage)"), `Hauffstraße ${haus}`, "14548 Schwielowsee OT Geltow"],
      ortDatum: "Ort, TT.MM.JJJJ",
      betreff: `Ihre Garage Nr. ${garage}, Hauffstraße 38, Geltow: Anpassung der Miete`,
      absaetze: [
        a.nutzerName ? `Sehr geehrte/r ${a.nutzerName},` : "Sehr geehrte/r Frau/Herr Nachname,",
        `seit dem ${datumText(a.uebergabe)} bin ich Eigentümer/in der Garage Nr. ${garage} und damit Ihr/e neue/r Vermieter/in. Ihr Mietvertrag läuft zunächst unverändert weiter; derzeit zahlen Sie ${eurText(a.istMiete)} € im Monat.`,
        `Garagen in der Wohnanlage sind sehr gefragt, und für vergleichbare Garagen werden heute ${eurText(a.zielMiete).replace(",00", "")} € im Monat gezahlt. Ich möchte Ihnen die Garage gern weiter überlassen und biete Ihnen an, das Mietverhältnis ab dem TT.MM.JJJJ zu einer Miete von ${eurText(a.zielMiete).replace(",00", "")} € im Monat fortzusetzen. Das sind ${eurText(mehr)} € mehr als bisher.`,
        `Bitte senden Sie mir den Abschnitt unten bis zum TT.MM.JJJJ unterschrieben zurück. Die Miete überweisen Sie ab dann bitte auf mein Konto: IBAN ${LUECKE}, Verwendungszweck „Garage Nr. ${garage}“.`,
        "Ich bitte um Verständnis: Sollten Sie mit der neuen Miete nicht einverstanden sein, sähe ich mich gezwungen, das Mietverhältnis über die Garage mit der vertraglichen Frist von drei Monaten zu kündigen und die Garage neu zu vermieten, da genügend Anfragen zu 100 € im Monat vorliegen. Das möchte ich gern vermeiden und würde mich freuen, wenn Sie die Garage weiter nutzen.",
        `Für Rückfragen erreichen Sie mich unter Telefon / E-Mail ${LUECKE}.`,
        "Mit freundlichen Grüßen",
      ],
      unterschrift: oder(a.kaeuferName, "Vorname Nachname"),
      rueckantwort: [
        `Rückantwort an ${oder(a.kaeuferName, "Vorname Nachname (Eigentümer/in)")}`,
        `Garage Nr. ${garage}, Hauffstraße 38, 14548 Schwielowsee OT Geltow`,
        `Ich bin damit einverstanden, dass die Miete für die Garage ab dem TT.MM.JJJJ ${eurText(a.zielMiete).replace(",00", "")} € im Monat beträgt. Alle übrigen Vereinbarungen des Mietvertrags bleiben unverändert.`,
      ],
    },
  };
}

// ── PDF ──

const W = 210, M = 22, BREITE = W - 2 * M;

function absatz(doc: jsPDF, text: string, y: number, groesse = 10, fett = false): number {
  doc.setFont(PDF_FONT, fett ? "bold" : "normal");
  doc.setFontSize(groesse);
  const zeilen = doc.splitTextToSize(sanitizePdfText(text), BREITE) as string[];
  doc.text(zeilen, M, y);
  return y + zeilen.length * groesse * 0.42 + 2.5;
}

function anschreibenSeite(doc: jsPDF, t: ReturnType<typeof garagenBriefTexte>["anschreiben"]) {
  doc.setTextColor(30, 30, 30);
  doc.setFont(PDF_FONT, "normal"); doc.setFontSize(7.5);
  doc.text(sanitizePdfText(t.absenderZeile), M, 45);
  doc.setFontSize(10);
  t.empfaenger.forEach((z, i) => doc.text(sanitizePdfText(z), M, 52 + i * 5));
  t.angaben.forEach(([k, v], i) => {
    doc.setFont(PDF_FONT, "bold"); doc.text(sanitizePdfText(k), 125, 52 + i * 5);
    doc.setFont(PDF_FONT, "normal"); doc.text(sanitizePdfText(v), 145, 52 + i * 5);
  });
  let y = absatz(doc, t.betreff, 92, 11.5, true) + 3;
  for (const a of t.absaetze) y = absatz(doc, a, y);
  y += 12;
  t.unterschrift.forEach((z, i) => { doc.setFont(PDF_FONT, i === 0 ? "bold" : "normal"); doc.text(sanitizePdfText(z), M, y + i * 5); });
  absatz(doc, t.anlage, y + 18, 9);
  doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
  t.fuss.forEach((z, i) => doc.text(sanitizePdfText(z), M, 280 + i * 4));
  doc.setTextColor(30, 30, 30);
}

function musterSeite(doc: jsPDF, t: ReturnType<typeof garagenBriefTexte>["muster"]) {
  doc.setTextColor(30, 30, 30);
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(8);
  doc.text(sanitizePdfText(t.kopf), M, 20);
  doc.setFont(PDF_FONT, "normal"); doc.setFontSize(9.5);
  t.absender.forEach((z, i) => doc.text(sanitizePdfText(z), W - M, 30 + i * 4.6, { align: "right" }));
  t.empfaenger.forEach((z, i) => doc.text(sanitizePdfText(z), M, 52 + i * 4.6));
  doc.text(sanitizePdfText(t.ortDatum), W - M, 72, { align: "right" });
  let y = absatz(doc, t.betreff, 82, 11, true) + 1;
  for (const a of t.absaetze) y = absatz(doc, a, y, 9.5);
  y += 8;
  doc.setFont(PDF_FONT, "normal"); doc.text(sanitizePdfText(t.unterschrift), M, y);
  y += 10;
  doc.setDrawColor(150, 150, 150); doc.setLineDashPattern([1, 1], 0); doc.line(M, y, W - M, y); doc.setLineDashPattern([], 0);
  y += 6;
  y = absatz(doc, t.rueckantwort[0], y, 9.5, true);
  y = absatz(doc, t.rueckantwort[1], y, 9);
  y = absatz(doc, t.rueckantwort[2], y, 9) + 12;
  doc.setFontSize(8.5);
  doc.line(M, y, M + 60, y); doc.line(W - M - 70, y, W - M, y);
  doc.text("Ort, Datum", M, y + 4); doc.text("Unterschrift Nutzer/in der Garage", W - M - 70, y + 4);
}

/** Anschreiben mit Anlage (2 Seiten) und das Musterschreiben einzeln (1 Seite). */
export async function garagenUnterlagenPdfs(a: GaragenBriefAngaben): Promise<{ anschreiben: Blob; muster: Blob }> {
  const t = garagenBriefTexte(a);
  const neu = async () => { const d = new jsPDF({ unit: "mm", format: "a4" }); await ensureUnicodeFont(d); return d; };
  const brief = await neu();
  anschreibenSeite(brief, t.anschreiben);
  brief.addPage();
  musterSeite(brief, t.muster);
  const muster = await neu();
  musterSeite(muster, t.muster);
  return { anschreiben: brief.output("blob"), muster: muster.output("blob") };
}

export function garagenDateinamen(a: Pick<GaragenBriefAngaben, "weNr" | "garageNr">) {
  const s = (t: string) => t.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "");
  return {
    anschreiben: `Ihre_Garage_Hauffstrasse_38_${s(a.weNr)}_Garage_${s(a.garageNr)}.pdf`,
    muster: `Musterschreiben_Garagennutzer_Garage_${s(a.garageNr)}.pdf`,
  };
}
