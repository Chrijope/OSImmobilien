// Betriebskostenabrechnung (BKA) Store
import jsPDF from "jspdf";
import type { Mieter } from "./mieterStore";
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type Verteilerschluessel = "flaeche" | "personen" | "einheiten" | "verbrauch" | "direkt";
export type KostenartKategorie = "heizung" | "wasser" | "abwasser" | "muell" | "strassenreinigung" | "gebaeudeversicherung" | "grundsteuer" | "hausmeister" | "gartenpflege" | "treppenhausreinigung" | "aufzug" | "beleuchtung" | "schornsteinfeger" | "kabelanschluss" | "sonstiges";

export interface Kostenart { id: string; kategorie: KostenartKategorie; bezeichnung: string; betrag: number; verteilerschluessel: Verteilerschluessel; umlagefaehig: boolean; }
export interface BKAEinheit { mieterId: string; mieterName: string; wohneinheitId: string; wohneinheitName: string; flaeche: number; personen: number; anteilPromille: number; vorauszahlungen: number; }

export interface Betriebskostenabrechnung {
  id: string; objektId: string; objektName: string; abrechnungsJahr: number; zeitraumVon: string; zeitraumBis: string;
  gesamtflaeche: number; gesamtEinheiten: number; kostenarten: Kostenart[]; einheiten: BKAEinheit[];
  erstelltAm: string; status: "entwurf" | "erstellt" | "versendet";
}

export interface BKAErgebnis { mieterId: string; mieterName: string; wohneinheitName: string; kostenGesamt: number; vorauszahlungen: number; nachzahlung: number; details: { kategorie: string; bezeichnung: string; gesamtBetrag: number; anteil: number; schluessel: string }[]; }

const LS_KEY = "mi_bka";

export const KOSTENART_KATEGORIEN: { value: KostenartKategorie; label: string; umlagefaehig: boolean }[] = [
  { value: "heizung", label: "Heizkosten", umlagefaehig: true }, { value: "wasser", label: "Wasserversorgung", umlagefaehig: true },
  { value: "abwasser", label: "Entwässerung/Abwasser", umlagefaehig: true }, { value: "muell", label: "Müllabfuhr", umlagefaehig: true },
  { value: "strassenreinigung", label: "Straßenreinigung", umlagefaehig: true }, { value: "gebaeudeversicherung", label: "Gebäudeversicherung", umlagefaehig: true },
  { value: "grundsteuer", label: "Grundsteuer", umlagefaehig: true }, { value: "hausmeister", label: "Hausmeister", umlagefaehig: true },
  { value: "gartenpflege", label: "Gartenpflege", umlagefaehig: true }, { value: "treppenhausreinigung", label: "Treppenhausreinigung", umlagefaehig: true },
  { value: "aufzug", label: "Aufzug", umlagefaehig: true }, { value: "beleuchtung", label: "Allgemeinbeleuchtung", umlagefaehig: true },
  { value: "schornsteinfeger", label: "Schornsteinfeger", umlagefaehig: true }, { value: "kabelanschluss", label: "Kabelanschluss/Antenne", umlagefaehig: true },
  { value: "sonstiges", label: "Sonstige Kosten", umlagefaehig: true },
];

export const VERTEILERSCHLUESSEL_LABELS: { value: Verteilerschluessel; label: string }[] = [
  { value: "flaeche", label: "Nach Wohnfläche (m²)" }, { value: "personen", label: "Nach Personen" },
  { value: "einheiten", label: "Nach Einheiten" }, { value: "verbrauch", label: "Nach Verbrauch" }, { value: "direkt", label: "Direkte Zuordnung" },
];

function toDb(bka: Betriebskostenabrechnung): Record<string, any> {
  return { id: bka.id, objekt: bka.objektId, jahr: bka.abrechnungsJahr, status: bka.status, erstellt_am: bka.erstelltAm, meta: { objektName: bka.objektName, zeitraumVon: bka.zeitraumVon, zeitraumBis: bka.zeitraumBis, gesamtflaeche: bka.gesamtflaeche, gesamtEinheiten: bka.gesamtEinheiten, kostenarten: bka.kostenarten, einheiten: bka.einheiten } };
}
function fromDb(r: any): Betriebskostenabrechnung {
  const meta = r.meta || {};
  return { id: r.id, objektId: r.objekt || "", objektName: meta.objektName || "", abrechnungsJahr: r.jahr || 0, zeitraumVon: meta.zeitraumVon || "", zeitraumBis: meta.zeitraumBis || "", gesamtflaeche: meta.gesamtflaeche || 0, gesamtEinheiten: meta.gesamtEinheiten || 0, kostenarten: meta.kostenarten || [], einheiten: meta.einheiten || [], erstelltAm: r.erstellt_am || "", status: r.status || "entwurf" };
}

export function getBKAs(): Betriebskostenabrechnung[] {
  if (isTestAccount()) return localGet<Betriebskostenabrechnung[]>(LS_KEY, []);
  return cacheGet("betriebskosten").map(fromDb);
}
export function getBKAById(id: string) { return getBKAs().find(b => b.id === id); }
export function getBKAsByObjekt(objektId: string) { return getBKAs().filter(b => b.objektId === objektId); }

export function addBKA(bka: Omit<Betriebskostenabrechnung, "id" | "erstelltAm">): Betriebskostenabrechnung {
  const neu: Betriebskostenabrechnung = { ...bka, id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  if (isTestAccount()) { const all = localGet<Betriebskostenabrechnung[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("betriebskosten", toDb(neu)); }
  return neu;
}

export function updateBKA(id: string, updates: Partial<Betriebskostenabrechnung>) {
  if (isTestAccount()) { const all = localGet<Betriebskostenabrechnung[]>(LS_KEY, []); const idx = all.findIndex(b => b.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_KEY, all); } }
  else { const existing = getBKAById(id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("betriebskosten", id, u); }
}

export function deleteBKA(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<Betriebskostenabrechnung[]>(LS_KEY, []).filter(b => b.id !== id)); }
  else { cacheDelete("betriebskosten", id); }
}

// ── Berechnung ──
export function berechneBKA(bka: Betriebskostenabrechnung): BKAErgebnis[] {
  const gesamtFlaeche = bka.einheiten.reduce((s, e) => s + e.flaeche, 0) || bka.gesamtflaeche || 1;
  const gesamtPersonen = bka.einheiten.reduce((s, e) => s + e.personen, 0) || 1;
  const gesamtEinheiten = bka.einheiten.length || 1;
  return bka.einheiten.map(einheit => {
    let kostenGesamt = 0;
    const details: BKAErgebnis["details"] = [];
    bka.kostenarten.filter(k => k.umlagefaehig).forEach(k => {
      let anteil = 0; let schluesselLabel = "";
      switch (k.verteilerschluessel) {
        case "flaeche": anteil = (einheit.flaeche / gesamtFlaeche) * k.betrag; schluesselLabel = `${einheit.flaeche}/${gesamtFlaeche} m²`; break;
        case "personen": anteil = (einheit.personen / gesamtPersonen) * k.betrag; schluesselLabel = `${einheit.personen}/${gesamtPersonen} Pers.`; break;
        case "einheiten": anteil = k.betrag / gesamtEinheiten; schluesselLabel = `1/${gesamtEinheiten} Einh.`; break;
        case "verbrauch": anteil = k.betrag / gesamtEinheiten; schluesselLabel = "nach Verbrauch"; break;
        case "direkt": anteil = k.betrag / gesamtEinheiten; schluesselLabel = "direkt"; break;
      }
      anteil = Math.round(anteil * 100) / 100; kostenGesamt += anteil;
      details.push({ kategorie: k.kategorie, bezeichnung: k.bezeichnung, gesamtBetrag: k.betrag, anteil, schluessel: schluesselLabel });
    });
    kostenGesamt = Math.round(kostenGesamt * 100) / 100;
    return { mieterId: einheit.mieterId, mieterName: einheit.mieterName, wohneinheitName: einheit.wohneinheitName, kostenGesamt, vorauszahlungen: einheit.vorauszahlungen, nachzahlung: Math.round((kostenGesamt - einheit.vorauszahlungen) * 100) / 100, details };
  });
}

// ── PDF-Generator ──
export function generateBKAPDF(bka: Betriebskostenabrechnung, ergebnis: BKAErgebnis, absenderFirma: string, absenderAdresse: string): jsPDF {
  const doc = new jsPDF(); const m = 20; let y = 25; const lh = 5.5; const pw = 170;
  const line = (text: string, bold = false, size = 10) => { doc.setFontSize(size); doc.setFont("helvetica", bold ? "bold" : "normal"); const lines = doc.splitTextToSize(text, pw); lines.forEach((l: string) => { if (y > 270) { doc.addPage(); y = 25; } doc.text(l, m, y); y += lh; }); };
  const gap = (h = 3) => { y += h; };
  const fmt = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  const fmtDate = (d: string) => { const parts = d.split("-"); return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : d; };
  line(absenderFirma, true, 11); line(absenderAdresse, false, 9); gap(6);
  line(ergebnis.mieterName); line(ergebnis.wohneinheitName); gap(8);
  doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.text("Betriebskostenabrechnung", m, y); y += 4;
  doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Abrechnungszeitraum: ${fmtDate(bka.zeitraumVon)} – ${fmtDate(bka.zeitraumBis)}`, m, y); y += 8;
  line(`Objekt: ${bka.objektName}`); line(`Wohneinheit: ${ergebnis.wohneinheitName}`); gap(4);
  line("Sehr geehrte/r Mieter/in,"); gap(2); line("nachfolgend erhalten Sie die Betriebskostenabrechnung gemäß § 556 BGB:"); gap(6);
  line("Kostenaufstellung:", true, 11); gap(2);
  doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.text("Kostenart", m, y); doc.text("Gesamt", m + 80, y); doc.text("Schlüssel", m + 110, y); doc.text("Ihr Anteil", m + 145, y); y += lh; doc.line(m, y - 2, m + pw, y - 2);
  doc.setFont("helvetica", "normal");
  ergebnis.details.forEach(d => { if (y > 265) { doc.addPage(); y = 25; } doc.text(d.bezeichnung, m, y); doc.text(fmt(d.gesamtBetrag), m + 80, y); doc.text(d.schluessel, m + 110, y); doc.text(fmt(d.anteil), m + 145, y); y += lh; });
  doc.line(m, y, m + pw, y); y += lh; doc.setFont("helvetica", "bold");
  doc.text("Gesamtkosten:", m, y); doc.text(fmt(ergebnis.kostenGesamt), m + 145, y); y += lh + 2;
  doc.text("Vorauszahlungen:", m, y); doc.text(`– ${fmt(ergebnis.vorauszahlungen)}`, m + 145, y); y += lh;
  doc.line(m + 130, y, m + pw, y); y += lh;
  const label = ergebnis.nachzahlung > 0 ? "Nachzahlung:" : "Guthaben:";
  doc.setFontSize(11); doc.text(label, m, y); doc.text(fmt(Math.abs(ergebnis.nachzahlung)), m + 145, y); y += 10;
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  if (ergebnis.nachzahlung > 0) line(`Wir bitten Sie, den Nachzahlungsbetrag von ${fmt(ergebnis.nachzahlung)} innerhalb von 30 Tagen zu überweisen.`);
  else line(`Ihr Guthaben von ${fmt(Math.abs(ergebnis.nachzahlung))} wird Ihnen in den nächsten Tagen erstattet.`);
  gap(6); line("Mit freundlichen Grüßen"); gap(8); line(absenderFirma);
  return doc;
}
