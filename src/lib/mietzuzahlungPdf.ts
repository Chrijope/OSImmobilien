import jsPDF from "jspdf";
import { ensureUnicodeFont, PDF_FONT, sanitizePdfText } from "./pdfBranding";
import { betragInWorten, datumDe, euro, rechne, type MietzuzahlungDaten } from "./mietzuzahlung";

/**
 * Die Vereinbarung über eine Mietzuzahlung als PDF, im Wortlaut der Vorlage
 * „Vorlage Mietzuzahlung OS Mietpool Verwaltung (2026-10-23).docx“ (30.10.2026).
 *
 * Vertragspartner 2 ist die OS Mietpool Verwaltung UG, deshalb ohne das
 * Briefpapier der OS Real Estate. Olivers Unterschrift kommt aus
 * `UNTERSCHRIFT_OLIVER`; solange die Datei fehlt, bleibt die Linie frei.
 */
export const UNTERSCHRIFT_OLIVER = "/images/unterschriften/oliver-skowrnowski.png";
const VP2 = "Oliver Skowrnowski";

const W = 210;
const RAND = 22;
const BREITE = W - 2 * RAND;
const UNTEN = 297 - 20;
const LUECKE = "……………";

const bildCache = new Map<string, Promise<string | null>>();
/** Einmal laden je Sitzung: Die Vorschau zeichnet bei jeder Eingabe neu. */
function bildAlsDataUrl(pfad: string): Promise<string | null> {
  if (!bildCache.has(pfad)) bildCache.set(pfad, bildLaden(pfad).then((b) => { if (!b) bildCache.delete(pfad); return b; }));
  return bildCache.get(pfad)!;
}

async function bildLaden(pfad: string): Promise<string | null> {
  try {
    const antwort = await fetch(pfad);
    if (!antwort.ok || !(antwort.headers.get("content-type") || "").startsWith("image/")) return null;
    const blob = await antwort.blob();
    return await new Promise((fertig) => {
      const leser = new FileReader();
      leser.onload = () => fertig(typeof leser.result === "string" ? leser.result : null);
      leser.onerror = () => fertig(null);
      leser.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Unterschrift des Käufers aus der Signaturseite (data:image/png). */
export interface KaeuferUnterschrift {
  signatureData: string;
  ort?: string;
  /** ISO-Datum der Unterschrift */
  datum?: string;
}

export async function erzeugeMietzuzahlungPdf(d: MietzuzahlungDaten, kaeufer?: KaeuferUnterschrift): Promise<jsPDF> {
  const r = rechne(d);
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const unterschrift = await bildAlsDataUrl(UNTERSCHRIFT_OLIVER);
  let y = 26;

  /** Wert oder Lücke wie in der Vorlage. */
  const v = (s: string | number | undefined | null) => (s === undefined || s === null || s === "" || s === 0 ? LUECKE : String(s));
  const e = (n: number) => (n > 0 ? euro(n) : LUECKE);
  const dt = (iso: string) => datumDe(iso) || LUECKE;

  const platz = (noetig: number) => {
    if (y + noetig <= UNTEN) return;
    doc.addPage();
    y = 22;
  };
  const text = (t: string, opt: { groesse?: number; fett?: boolean; mitte?: boolean; einzug?: number; nach?: number } = {}) => {
    const groesse = opt.groesse ?? 10;
    doc.setFont(PDF_FONT, opt.fett ? "bold" : "normal");
    doc.setFontSize(groesse);
    doc.setTextColor(20, 20, 20);
    const einzug = opt.einzug ?? 0;
    const zeilen: string[] = doc.splitTextToSize(sanitizePdfText(t), BREITE - einzug);
    const hoehe = groesse * 0.47;
    for (const zeile of zeilen) {
      platz(hoehe);
      if (opt.mitte) doc.text(zeile, W / 2, y, { align: "center" });
      else doc.text(zeile, RAND + einzug, y);
      y += hoehe;
    }
    y += opt.nach ?? 2.2;
  };

  text("V E R E I N B A R U N G", { groesse: 15, fett: true, mitte: true, nach: 1 });
  text("über eine Mietzuzahlung", { groesse: 11, mitte: true, nach: 6 });
  text("zwischen", { mitte: true });
  text(`Frau / Herrn ${v(d.kaeuferName)}, wohnhaft ${v(d.kaeuferAnschrift)}`, { mitte: true });
  text("nachfolgend auch genannt „Vertragspartner 1 und/oder Käufer“", { mitte: true, nach: 4 });
  text("und", { mitte: true });
  text(`OS Mietpool Verwaltung UG i. G., vertreten durch den Geschäftsführer Herrn ${VP2},`, { mitte: true });
  text("nachfolgend auch genannt „Vertragspartner 2“.", { mitte: true, nach: 6 });

  text("Präambel", { fett: true, groesse: 11 });
  const garageSatz = d.garageNr.trim() ? `, nebst der zugeordneten Garage / dem Stellplatz ${d.garageNr.trim()}` : "";
  text(`Der Vertragspartner 1 beabsichtigt die Immobilie Wohnung Nr. ${v(d.weNr)} (ETW${d.lage.trim() ? `, ${d.lage.trim()}` : ""}) in der ${v(d.strasse)}, ${v(d.ort)}${garageSatz}, eingetragen im Grundbuch von ${v(d.grundbuchVon)} (Amtsgericht ${v(d.amtsgericht)}) zu Blatt ${v(d.blatt)} („Kaufgegenstand“) zu erwerben. Der Kaufgegenstand ist vermietet. Dem Käufer ist der bestehende Mietvertrag nebst eventuellen Vertragsänderungen (bspw. Mieterhöhungsverlangen/-vereinbarungen) bekannt. Der Käufer erklärt, dass bei der Kaufpreisfindung für den Kaufgegenstand bereits die Höhe der aktuellen Mieteinnahmen eingeflossen ist.`);
  const ist = Number((d.istMiete || "").replace(/\./g, "").replace(",", ".")) || 0;
  const garageMiete = r.garage ? ` im Monat, für die Garage bei ${e(r.garage.ist)} EUR` : "";
  text(`Die aktuelle Grundmiete für den Kaufgegenstand liegt bei ${e(ist)} EUR (netto)${garageMiete} im Monat. Die vom Vertragspartner 1 angestrebte Zielgrundmiete liegt bei ${v(d.zielQm)} EUR/m² in ${v(d.laufzeitMonate)} Monaten ab Übergabestichtag. Eine Garantie oder Zusicherung für das Erreichen der Zielgrundmiete kann und wird vom Vertragspartner 2 ausdrücklich nicht übernommen.`);
  text(`Der Kaufpreis für den Kaufgegenstand ist um den Betrag zwischen der aktuellen Grundmiete (netto) und der Zielgrundmiete (netto) von ${v(d.zielQm)} EUR/m² für höchstens ${v(d.laufzeitMonate)} Monate ab Übergabestichtag reduziert. Dem liegt folgende Formel zu Grunde:`);
  text(`[${v(d.zielQm)} EUR – aktueller Mietzins (netto) EUR/m²] × Quadratmeteranzahl × Anzahl der Monate,`, { mitte: true });
  text(`jeweils bis zur nächsten möglichen Mieterhöhung und insgesamt höchstens ${v(d.laufzeitMonate)} Monate.`);

  let satz = `Bei der hier vorliegenden Wohnungsgröße von ${v(d.flaeche)} m² und einer aktuellen Grundmiete (netto) von ${e(r.istQm)} EUR/m² (${e(ist)} EUR) ergibt sich vom Übergabestichtag am ${dt(d.uebergabe)}`;
  if (r.phase2) {
    satz += ` bis zum Stichtag der nächsten möglichen Mieterhöhung am ${dt(r.naechsteErhoehung)}${d.letzteErhoehung ? ` (letzte Mieterhöhung am ${dt(d.letzteErhoehung)})` : ""} ein Betrag von ${e(r.phase1.differenz)} EUR im Monat × ${r.phase1.monate} Monate = ${e(r.phase1.betrag)} EUR. Ab dem ${dt(r.phase2.von)} wird die dann höchstens zulässige Grundmiete (netto) von ${e(r.phase2.neueMiete)} EUR (${e(r.phase2.neueMieteQm)} EUR/m², Kappungsgrenze von ${v(d.erhoehungProzent)} %) zu Grunde gelegt; bis zum Ablauf von ${v(d.laufzeitMonate)} Monaten ab Übergabestichtag am ${dt(d.uebergabe)} ergibt sich ein Betrag von ${e(r.phase2.differenz)} EUR im Monat × ${r.phase2.monate} Monate = ${e(r.phase2.betrag)} EUR.`;
  } else {
    satz += ` für ${r.phase1.monate} Monate ein Betrag von ${e(r.phase1.differenz)} EUR im Monat × ${r.phase1.monate} Monate = ${e(r.phase1.betrag)} EUR.`;
  }
  if (r.garage) satz += ` Zusätzlich wird die Garagenmiete für ${r.garage.monate} Monate ab Übergabestichtag auf ${e(r.garage.auf)} EUR im Monat bezuschusst: (${e(r.garage.auf)} EUR – ${e(r.garage.ist)} EUR) × ${r.garage.monate} Monate = ${e(r.garage.betrag)} EUR.`;
  satz += ` Insgesamt ergibt sich folglich hier ein Betrag in Höhe von ${e(r.gesamt)} EUR.`;
  text(satz);

  // Tabelle der Teilbeträge
  const zeilen: Array<[string, string]> = [
    [`Wohnung, ${dt(r.phase1.von)} bis ${dt(r.phase1.bis)}: ${e(r.zielMiete)} EUR – ${e(ist)} EUR = ${e(r.phase1.differenz)} EUR × ${r.phase1.monate} Monate`, `${e(r.phase1.betrag)} EUR`],
  ];
  if (r.phase2) zeilen.push([`Wohnung, ${dt(r.phase2.von)} bis ${dt(r.phase2.bis)}: ${e(r.zielMiete)} EUR – ${e(r.phase2.neueMiete)} EUR = ${e(r.phase2.differenz)} EUR × ${r.phase2.monate} Monate`, `${e(r.phase2.betrag)} EUR`]);
  if (r.garage) zeilen.push([`Garage ${d.garageNr.trim()}, ${r.garage.monate} Monate: ${e(r.garage.auf)} EUR – ${e(r.garage.ist)} EUR = ${e(r.garage.differenz)} EUR × ${r.garage.monate} Monate`, `${e(r.garage.betrag)} EUR`]);
  zeilen.push(["Mietzuzahlung gesamt", `${e(r.gesamt)} EUR`]);
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  zeilen.forEach(([links, rechts], i) => {
    const letzte = i === zeilen.length - 1;
    doc.setFont(PDF_FONT, letzte ? "bold" : "normal");
    doc.setFontSize(9);
    const teile: string[] = doc.splitTextToSize(sanitizePdfText(links), BREITE - 40);
    const hoehe = teile.length * 4.2 + 2.5;
    platz(hoehe);
    doc.rect(RAND, y - 4, BREITE, hoehe);
    doc.line(RAND + BREITE - 36, y - 4, RAND + BREITE - 36, y - 4 + hoehe);
    teile.forEach((t, j) => doc.text(t, RAND + 2, y + j * 4.2));
    doc.text(sanitizePdfText(rechts), RAND + BREITE - 2, y, { align: "right" });
    y += hoehe;
  });
  y += 4;

  text("Unter Berücksichtigung der vorstehenden Präambel wird zwischen den Vertragspartnern 1 und 2 die folgende Mietzuzahlungsvereinbarung geschlossen:");
  text("§ 1 Mietzuzahlung", { fett: true, groesse: 11 });
  text(`• Der Vertragspartner 2 verpflichtet sich an den Vertragspartner 1 eine Mietzuzahlung in Höhe von ${e(r.gesamt)} EUR (in Worten: ${r.gesamt > 0 ? betragInWorten(r.gesamt) : `${LUECKE} Euro`}) zu zahlen, wenn der Vertragspartner 1 einen wirksamen, notariell beurkundeten Kaufvertrag über die Kaufimmobilie mit dem Verkäufer geschlossen hat und der Kaufpreis nach übermittelter Fälligkeitsmitteilung des beurkundenden Notars an den Verkäufer geleistet wurde. Bei Vorliegen der vorstehenden Voraussetzungen ist die Mietzuzahlung fällig und zahlbar 6 Wochen nach Übergabestichtag des Kaufgegenstands. Die Mietzuzahlung erfolgt bei Fälligkeit auf das Konto des Vertragspartners 1 bei der`, { einzug: 3 });
  text(`Bank: ${v(d.bank)}`, { einzug: 8, nach: 0.5 });
  text(`zu IBAN: ${v(d.iban)}`, { einzug: 8, nach: 0.5 });
  text(`Verwendungszweck: „Mietzuzahlung ETW Nr. ${v(d.weNr)}“.`, { einzug: 8 });
  text("• Im Falle eines Rücktritts vom Kaufvertrag über die Kaufimmobilie oder einer Rückabwicklung oder vergleichbarer Sachverhalte ist der Vertragspartner 1 zur sofortigen Rückzahlung der geleisteten Mietzuzahlung an den Vertragspartner 2 verpflichtet.", { einzug: 3 });
  text(`• Der Käufer bleibt berechtigt alle rechtlich zulässigen und zumutbaren Möglichkeiten auszuschöpfen, um die Grundmiete zu erhöhen/durchzusetzen/ bzw. zu vereinbaren (insbesondere Mieterhöhungsverlangen, höhere Grundmietenvereinbarung bei Neuvermietung usw.), auch wenn dadurch eine Grundmiete von über ${v(d.zielQm)} EUR/m² innerhalb der ersten ${v(d.laufzeitMonate)} Monate nach Übergabe des Kaufgegenstands erreicht wird.`, { einzug: 3 });

  text("§ 2 Vertraulichkeitsverpflichtung, Schriftform, salvatorische Klausel", { fett: true, groesse: 11 });
  text("1. Die Vertragsparteien verpflichten sich, vertrauliche Informationen, die sie über den jeweiligen Vertragspartner erhalten oder sonstige vertrauliche Informationen nicht an Dritte weiterzugeben, oder diese Dritten zugänglich zu machen; es sei denn, der Vertragspartner hat einer Weitergabe zugestimmt oder es handelt sich um Informationen, die von staatlichen Stellen / Behörden gefordert werden dürfen – jedoch nur soweit es für vertragliche Zwecke erforderlich ist.");
  text("2. Eventuelle Veränderungen bzw. Ergänzungen dieses Vertrages bedürfen der Schriftform. Das Schriftformerfordernis kann nur schriftlich geändert oder aufgehoben werden. Nebenabreden bestehen nicht.");
  text("3. Sollten einzelne Bestimmungen dieses Vertrages unwirksam sein/werden, so wird hierdurch die Wirksamkeit des übrigen Vertrages nicht berührt. An die Stelle der unwirksamen Bestimmung tritt eine Regelung, die dem Willen der Parteien bei Abschluss des Vertrages wirtschaftlich am nächsten kommt.");

  // Unterschriften
  platz(48);
  y += 14;
  const spalte = (BREITE - 12) / 2;
  const block = (x: number, ort: string, datum: string, titel: string, bild?: string | null) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(10);
    doc.text(sanitizePdfText(`${v(ort)}, den ${datum ? datumDe(datum) : LUECKE}`), x, y);
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text("Ort, Datum", x, y + 4);
    if (bild) {
      try { doc.addImage(bild, "PNG", x, y + 7, 48, 16); } catch { /* ohne Bild bleibt die Linie frei */ }
    }
    doc.setDrawColor(60, 60, 60);
    doc.line(x, y + 25, x + spalte, y + 25);
    const zeilenT: string[] = doc.splitTextToSize(sanitizePdfText(titel), spalte);
    zeilenT.forEach((t, i) => doc.text(t, x, y + 29 + i * 3.6));
    doc.setTextColor(20, 20, 20);
  };
  block(RAND, kaeufer?.ort || d.ort1, kaeufer?.datum || d.datum1, `Unterschrift Vertragspartner 1 (${d.kaeuferName || LUECKE})`, kaeufer?.signatureData);
  block(RAND + spalte + 12, d.ort2, d.datum2, `Unterschrift Vertragspartner 2 (${VP2}, Geschäftsführer OS Mietpool Verwaltung UG i. G.)`, unterschrift);
  return doc;
}
