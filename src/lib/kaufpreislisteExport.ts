import JSZip from "jszip";
import {
  berechneKaufpreisliste, HAUSGELD_KATEGORIEN, hausgeldMonat, kategorieSumme, KPL_STATUS,
  type KplEingaben, type KplErgebnis, type KplZeile, type KplZeilenErgebnis,
} from "./kaufpreisliste";

/*
 * Die Kaufpreisliste als echte .xlsx, weiterbearbeitbar und mit Formeln, im
 * Aufbau der Desktop-Excel (Skript baue.py): Blatt „Kaufpreisliste“ und Blatt
 * „Wirtschaftsplan“. Im Projekt gibt es keine Excel-Bibliothek, daher schreiben
 * wir das Office-XML selbst und packen es mit jszip. Jede Formelzelle bekommt
 * den Wert aus `kaufpreisliste.ts` mit, damit auch Vorschauen ohne
 * Neuberechnung (Mail, Quick Look) Zahlen zeigen; Excel rechnet beim Öffnen neu.
 */

// OS-CI wie in der Desktop-Excel
const GRUEN = "0C3828", PRIM = "1F7A57", HELLGOLD = "F6EFE3", HELLGOLD2 = "F1E7D6", HELLGRUEN = "E8F1EC", GRAU = "F4F5F4", GESAMT = "EADFC9";
const EUR = '#,##0.00 €;-#,##0.00 €;"–"', EUR0 = '#,##0 €;-#,##0 €;"–"', QM = '#,##0.00 "m²"', PCT = '0.00 %;-0.00 %;"–"', ZAHL = "#,##0.0", DAT = "DD.MM.YYYY";

// ── Stile: jede Kombination bekommt einen Eintrag in styles.xml ──
interface Stil {
  b?: boolean; i?: boolean; sz?: number; farbe?: string;
  fill?: string; fmt?: string; rand?: "duenn" | "gesamt";
  h?: "center" | "left" | "right"; v?: "center" | "top"; wrap?: boolean;
  /** Eingabezelle: bleibt trotz Blattschutz bearbeitbar. */
  offen?: boolean;
}

class Stile {
  fonts = ['<font><sz val="9"/><name val="Arial"/></font>'];
  fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  borders = [
    "<border><left/><right/><top/><bottom/><diagonal/></border>",
    '<border><left style="thin"><color rgb="FFC9CFCB"/></left><right style="thin"><color rgb="FFC9CFCB"/></right><top style="thin"><color rgb="FFC9CFCB"/></top><bottom style="thin"><color rgb="FFC9CFCB"/></bottom><diagonal/></border>',
    `<border><left style="thin"><color rgb="FFC9CFCB"/></left><right style="thin"><color rgb="FFC9CFCB"/></right><top style="medium"><color rgb="FF${GRUEN}"/></top><bottom style="medium"><color rgb="FF${GRUEN}"/></bottom><diagonal/></border>`,
  ];
  fmts: string[] = [];
  xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private cache = new Map<string, number>();

  private index(liste: string[], xml: string) {
    const i = liste.indexOf(xml);
    return i >= 0 ? i : liste.push(xml) - 1;
  }

  id(s: Stil = {}): number {
    const schluessel = JSON.stringify(s);
    const alt = this.cache.get(schluessel);
    if (alt !== undefined) return alt;
    const font = this.index(this.fonts, `<font>${s.b ? "<b/>" : ""}${s.i ? "<i/>" : ""}<sz val="${s.sz ?? 9}"/>${s.farbe ? `<color rgb="FF${s.farbe}"/>` : ""}<name val="Arial"/></font>`);
    const fill = s.fill ? this.index(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const border = s.rand === "duenn" ? 1 : s.rand === "gesamt" ? 2 : 0;
    const fmt = s.fmt ? 164 + this.index(this.fmts, s.fmt) : 0;
    const align = s.h || s.v || s.wrap ? `<alignment${s.h ? ` horizontal="${s.h}"` : ""}${s.v ? ` vertical="${s.v}"` : ""}${s.wrap ? ' wrapText="1"' : ""}/>` : "";
    const schutz = s.offen ? '<protection locked="0"/>' : "";
    const xf = `<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${fmt ? ' applyNumberFormat="1"' : ""} applyFont="1"${fill ? ' applyFill="1"' : ""}${border ? ' applyBorder="1"' : ""}${align ? ' applyAlignment="1"' : ""}${schutz ? ' applyProtection="1"' : ""}>${align}${schutz}</xf>`;
    const id = this.xfs.push(xf) - 1;
    this.cache.set(schluessel, id);
    return id;
  }

  xml(): string {
    const fmts = this.fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${esc(f)}"/>`).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${this.fmts.length}">${fmts}</numFmts><fonts count="${this.fonts.length}">${this.fonts.join("")}</fonts><fills count="${this.fills.length}">${this.fills.join("")}</fills><borders count="${this.borders.length}">${this.borders.join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xfs.length}">${this.xfs.join("")}</cellXfs><cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Spaltenbuchstabe zu 1-basierter Nummer. */
export function spalte(nr: number): string {
  let s = "";
  for (let n = nr; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** ISO-Datum als Excel-Seriennummer, leer bleibt leer. */
function excelDatum(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000 : null;
}

type Wert = string | number | null | undefined;

/** Ein Tabellenblatt im Aufbau: Zellen je Zeile, dazu Breiten, Zusammenfassungen und Auswahllisten. */
class Blatt {
  zeilen = new Map<number, Map<number, string>>();
  hoehen = new Map<number, number>();
  breiten: number[] = [];
  merges: string[] = [];
  listen: { sqref: string; werte: string }[] = [];
  constructor(private stile: Stile) {}

  private setze(r: number, c: number, xml: string) {
    if (!this.zeilen.has(r)) this.zeilen.set(r, new Map());
    this.zeilen.get(r)!.set(c, xml);
  }

  wert(r: number, c: number, w: Wert, s?: Stil) {
    const ref = `${spalte(c)}${r}`, st = this.stile.id(s);
    if (w === null || w === undefined || w === "") this.setze(r, c, `<c r="${ref}" s="${st}"/>`);
    else if (typeof w === "number") this.setze(r, c, `<c r="${ref}" s="${st}"><v>${w}</v></c>`);
    else this.setze(r, c, `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${esc(w)}</t></is></c>`);
  }

  /** Formel ohne führendes „=“; `ergebnis` ist der vorab berechnete Wert. */
  formel(r: number, c: number, f: string, ergebnis: Wert, s?: Stil) {
    const ref = `${spalte(c)}${r}`, st = this.stile.id(s);
    const istZahl = typeof ergebnis === "number" && Number.isFinite(ergebnis);
    this.setze(r, c, `<c r="${ref}" s="${st}"${istZahl ? "" : ' t="str"'}><f>${esc(f)}</f><v>${istZahl ? ergebnis : esc(String(ergebnis ?? ""))}</v></c>`);
  }

  xml(o: { freeze?: string; fitA3?: boolean; quer?: boolean; fuss: string }): string {
    const zeilen = [...this.zeilen.keys()].sort((a, b) => a - b).map((r) => {
      const zellen = this.zeilen.get(r)!;
      const h = this.hoehen.get(r);
      return `<row r="${r}"${h ? ` ht="${h}" customHeight="1"` : ""}>${[...zellen.keys()].sort((a, b) => a - b).map((c) => zellen.get(c)).join("")}</row>`;
    }).join("");
    const cols = this.breiten.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join("");
    let pane = "";
    if (o.freeze) {
      const m = /^([A-Z]+)(\d+)$/.exec(o.freeze)!;
      const x = m[1].charCodeAt(0) - 65, y = Number(m[2]) - 1;
      pane = `<pane${x ? ` xSplit="${x}"` : ""} ySplit="${y}" topLeftCell="${o.freeze}" activePane="${x ? "bottomRight" : "bottomLeft"}" state="frozen"/>`;
    }
    const listen = this.listen.length
      ? `<dataValidations count="${this.listen.length}">${this.listen.map((l) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${l.sqref}"><formula1>"${esc(l.werte)}"</formula1></dataValidation>`).join("")}</dataValidations>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="12"/><cols>${cols}</cols><sheetData>${zeilen}</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" formatColumns="0" autoFilter="0" sort="0"/>${this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}${listen}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="${o.fitA3 ? 8 : 9}" orientation="${o.quer ? "landscape" : "portrait"}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;7${esc(o.fuss)}&amp;R&amp;7Seite &amp;P von &amp;N</oddFooter></headerFooter></worksheet>`;
  }
}

// ── Spalten der Kaufpreisliste, Reihenfolge wie in der Desktop-Excel ──
type Art = "e" | "f";
interface Sp { k: string; titel: string; breite: number; fmt?: string; art: Art; gruppe: string }
const SP: Sp[] = [
  { k: "we", titel: "WE", breite: 7, art: "e", gruppe: "Einheit" },
  { k: "lage", titel: "Lage / Nutzung", breite: 24, art: "e", gruppe: "Einheit" },
  { k: "status", titel: "Status", breite: 11, art: "e", gruppe: "Einheit" },
  { k: "mieter", titel: "Mieter", breite: 24, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "mv", titel: "MV-Beginn", breite: 11, fmt: DAT, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "flaeche", titel: "Fläche", breite: 10, fmt: QM, art: "e", gruppe: "Einheit" },
  { k: "mea", titel: "MEA", breite: 8, fmt: ZAHL, art: "e", gruppe: "Einheit" },
  { k: "ist", titel: "Nettokaltmiete mtl.", breite: 12, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "istqm", titel: "Ist €/m²", breite: 9, fmt: EUR, art: "f", gruppe: "Mieterliste (Ist)" },
  { k: "bk", titel: "BK-Vorausz.", breite: 10, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "hk", titel: "HK-Vorausz.", breite: 10, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "strom", titel: "Strom pausch.", breite: 10, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "wasser", titel: "Wasser/Heizung pausch.", breite: 11, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "nk", titel: "NK pausch.", breite: 10, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "mwst", titel: "MwSt.", breite: 9, fmt: EUR, art: "e", gruppe: "Mieterliste (Ist)" },
  { k: "gesmiete", titel: "Gesamtmiete mtl.", breite: 12, fmt: EUR, art: "f", gruppe: "Mieterliste (Ist)" },
  { k: "istjahr", titel: "Ist-Miete Jahr", breite: 12, fmt: EUR, art: "f", gruppe: "Mieterliste (Ist)" },
  { k: "sollqm", titel: "Soll €/m²", breite: 9, fmt: EUR, art: "e", gruppe: "Soll-Miete" },
  { k: "soll", titel: "Sollmiete mtl.", breite: 11, fmt: EUR, art: "f", gruppe: "Soll-Miete" },
  { k: "solljahr", titel: "Sollmiete Jahr", breite: 12, fmt: EUR, art: "f", gruppe: "Soll-Miete" },
  { k: "vk", titel: "Verkaufspreis", breite: 13, fmt: EUR0, art: "e", gruppe: "Kaufpreis & Rendite" },
  { k: "vkqm", titel: "VK €/m²", breite: 10, fmt: EUR, art: "f", gruppe: "Kaufpreis & Rendite" },
  { k: "rist", titel: "Mietrendite Ist", breite: 9, fmt: PCT, art: "f", gruppe: "Kaufpreis & Rendite" },
  { k: "rsoll", titel: "Mietrendite Soll", breite: 9, fmt: PCT, art: "f", gruppe: "Kaufpreis & Rendite" },
  { k: "hg_uml", titel: "umlagefähig mtl.", breite: 10, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "hg_hk", titel: "Heizkosten mtl.", breite: 10, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "hg_numl", titel: "nicht umlagef. mtl.", breite: 10, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "hg_er", titel: "Erhaltungsrückl. mtl.", breite: 10, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "hg", titel: "Hausgeld gesamt mtl.", breite: 11, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "ueber", titel: "Überschuss Soll mtl.", breite: 11, fmt: EUR, art: "f", gruppe: "Hausgeld (aus Wirtschaftsplan)" },
  { k: "subv", titel: "Mietsubvention", breite: 12, fmt: EUR, art: "f", gruppe: "Vertrieb" },
  { k: "res", titel: "Reserviert (Name/Datum)", breite: 20, art: "e", gruppe: "Vertrieb" },
];
const C: Record<string, string> = Object.fromEntries(SP.map((s, i) => [s.k, spalte(i + 1)]));

/** Eingabewerte einer Zeile je Spaltenschlüssel. */
function eingabe(z: KplZeile, k: string): Wert {
  switch (k) {
    case "we": return z.we; case "lage": return z.lage; case "status": return z.status; case "mieter": return z.mieter;
    case "mv": return excelDatum(z.mvBeginn); case "flaeche": return z.flaeche; case "mea": return z.mea; case "ist": return z.ist;
    case "bk": return z.bk; case "hk": return z.hk; case "strom": return z.strom; case "wasser": return z.wasser; case "nk": return z.nk;
    case "mwst": return z.mwst; case "sollqm": return z.sollQm; case "vk": return z.vk; case "res": return z.reserviert;
  }
  return null;
}

/** Vorab berechneter Wert einer Formelspalte. */
function ergebnis(r: KplZeilenErgebnis | undefined, k: string): Wert {
  if (!r) return "";
  const w: Record<string, number | null> = {
    istqm: r.istQm, gesmiete: r.gesamtmiete, istjahr: r.istJahr, soll: r.soll, solljahr: r.sollJahr, vkqm: r.vkQm,
    rist: r.renditeIst, rsoll: r.renditeSoll, hg_uml: r.hgUml, hg_hk: r.hgHk, hg_numl: r.hgNuml, hg_er: r.hgEr, hg: r.hg,
    ueber: r.ueberschuss, subv: r.subvention,
  };
  return w[k] ?? "";
}

const WP_START = 10;

export function baueKaufpreislisteXlsxDateien(e: KplEingaben): Record<string, string> {
  const r: KplErgebnis = berechneKaufpreisliste(e);
  const stile = new Stile();
  const wp = e.wirtschaftsplan;

  // ================= Wirtschaftsplan =================
  const w = new Blatt(stile);
  w.breiten = [34, 22, 15, 14, 40];
  const WP_END = WP_START + Math.max(45, wp.positionen.length + 5) - 1;
  w.wert(1, 1, "Wirtschaftsplan (Gesamtansätze pro Jahr)", { sz: 14, b: true, farbe: GRUEN });
  w.wert(2, 1, "Aus dem Wirtschaftsplan der Gemeinschaft übernehmen. Je Position den Verteiler wählen: MEA (nach Miteigentumsanteil) oder WE (gleich je Einheit).", { i: true, farbe: "555555" });
  const kopf: [string, Wert, string?][] = [
    ["Gesamt-MEA (Gesamtverteiler)", wp.gesamtMea, ZAHL], ["Anzahl Einheiten (Verteiler WE)", wp.anzahlEinheiten, "#,##0"],
    ["Gesamtfläche lt. Plan (m²)", wp.gesamtflaeche, "#,##0.00"], ["Plan gültig ab", wp.gueltigAb, "@"],
  ];
  kopf.forEach(([t, v, fmt], i) => {
    w.wert(4 + i, 1, t, { b: true });
    w.wert(4 + i, 2, v, { fill: HELLGOLD, rand: "duenn", fmt, offen: true, h: i < 2 ? "right" : undefined });
  });
  ["Position", "Kategorie", "Ansatz €/Jahr", "Verteiler", "Hinweis"].forEach((h, j) =>
    w.wert(9, j + 1, h, { b: true, farbe: "FFFFFF", fill: GRUEN, rand: "duenn", h: "center", v: "center", wrap: true }));
  for (let zr = WP_START; zr <= WP_END; zr++) {
    const p = wp.positionen[zr - WP_START];
    w.wert(zr, 1, p?.position, { rand: "duenn", offen: true, fill: "FFFFFF" });
    w.wert(zr, 2, p?.kategorie, { rand: "duenn", offen: true, fill: "FFFFFF" });
    w.wert(zr, 3, p?.ansatzJahr, { rand: "duenn", offen: true, fill: HELLGOLD, fmt: EUR });
    w.wert(zr, 4, p ? p.verteiler : null, { rand: "duenn", offen: true, fill: "FFFFFF", h: "center" });
    w.wert(zr, 5, p?.hinweis, { rand: "duenn", offen: true, i: true, farbe: "666666" });
  }
  w.listen.push({ sqref: `B${WP_START}:B${WP_END}`, werte: HAUSGELD_KATEGORIEN.join(",") }, { sqref: `D${WP_START}:D${WP_END}`, werte: "MEA,WE" });
  const rs = WP_END + 2;
  w.wert(rs, 1, "Summen je Kategorie", { b: true, farbe: GRUEN, sz: 10 });
  HAUSGELD_KATEGORIEN.forEach((k, i) => {
    w.wert(rs + 1 + i, 1, k, { rand: "duenn" });
    w.formel(rs + 1 + i, 3, `SUMIFS($C$${WP_START}:$C$${WP_END},$B$${WP_START}:$B$${WP_END},A${rs + 1 + i})`, kategorieSumme(wp, k), { rand: "duenn", fmt: EUR });
  });
  const su = rs + 5;
  w.wert(su, 1, "Summe der Ausgaben insgesamt", { b: true, fill: HELLGRUEN, rand: "duenn" });
  w.formel(su, 3, `SUM(C${rs + 1}:C${rs + 4})`, HAUSGELD_KATEGORIEN.reduce((s, k) => s + kategorieSumme(wp, k), 0), { b: true, fill: HELLGRUEN, rand: "duenn", fmt: EUR });
  const pr = su + 2;
  const bereich = (sp: string) => `$${sp}$${WP_START}:$${sp}$${WP_END}`;
  w.wert(pr, 1, "Prüfung: Hausgeld einer Einheit", { b: true, farbe: GRUEN, sz: 10 });
  w.wert(pr + 1, 1, "MEA der Einheit");
  w.wert(pr + 1, 2, wp.pruefMea, { fill: HELLGOLD, rand: "duenn", offen: true, fmt: ZAHL });
  w.wert(pr + 2, 1, "Hausgeld pro Monat");
  w.formel(pr + 2, 2,
    `IF(OR(B${pr + 1}="",$B$4="",$B$4=0),"",(SUMPRODUCT((${bereich("D")}="MEA")*${bereich("C")})*B${pr + 1}/$B$4+IF(OR($B$5="",$B$5=0),0,SUMPRODUCT((${bereich("D")}="WE")*${bereich("C")})/$B$5))/12)`,
    hausgeldMonat(wp, wp.pruefMea) ?? "", { b: true, fmt: EUR });
  w.wert(pr + 2, 3, "Zum Abgleich mit dem Einzelwirtschaftsplan einer Einheit", { i: true, farbe: "666666" });

  // Hausgeld-Formel je Kategorie für eine Zeile, wie in der Desktop-Excel
  const WB = (sp: string) => `Wirtschaftsplan!$${sp}$${WP_START}:$${sp}$${WP_END}`;
  const hg = (kat: string, zr: number) => {
    const mea = `${C.mea}${zr}`;
    return `IF(OR(${mea}="",Wirtschaftsplan!$B$4="",Wirtschaftsplan!$B$4=0),"",`
      + `(SUMPRODUCT((${WB("B")}="${kat}")*(${WB("D")}="MEA")*${WB("C")})*${mea}/Wirtschaftsplan!$B$4`
      + `+IF(OR(Wirtschaftsplan!$B$5="",Wirtschaftsplan!$B$5=0),0,SUMPRODUCT((${WB("B")}="${kat}")*(${WB("D")}="WE")*${WB("C")})/Wirtschaftsplan!$B$5))/12)`;
  };

  // ================= Kaufpreisliste =================
  const k = new Blatt(stile);
  k.breiten = SP.map((s) => s.breite);
  k.hoehen.set(1, 30);
  k.wert(1, 1, "OS Immobilien", { b: true, sz: 12, farbe: PRIM, v: "center" });
  k.wert(1, 4, "Kaufpreisliste", { sz: 18, b: true, farbe: GRUEN, v: "center" });
  const gold = { fill: HELLGOLD, rand: "duenn" as const, offen: true };
  ([["Objekt", e.objektName], ["Ort", e.ort], ["Stand", excelDatum(e.stand)]] as [string, Wert][]).forEach(([t, v], i) => {
    k.wert(2 + i, 4, t, { b: true });
    k.wert(2 + i, 5, v, t === "Stand" ? { ...gold, fmt: DAT, h: "left" } : gold);
  });
  k.wert(2, 8, "Soll-Miete Vorgabe €/m²", { b: true });
  k.wert(2, 11, e.sollQmVorgabe, { ...gold, fmt: EUR });
  k.wert(3, 8, "Mietsubvention gesamt (wird nach Verkaufspreis verteilt)", { b: true });
  k.wert(3, 11, e.subventionGesamt, { ...gold, fmt: EUR0 });
  k.wert(2, 13, "Goldene Felder sind Eingaben, alles andere rechnet automatisch. Hausgeld kommt aus dem Blatt „Wirtschaftsplan“ über die MEA.", { i: true, farbe: "555555" });

  const G = 5, H = 6, D0 = 7;
  const anzahl = Math.max(15, e.zeilen.length + 3); // freie Zeilen zum Weiterschreiben in Excel
  const E = D0 + anzahl - 1;
  // Gruppenköpfe
  let a = 0;
  while (a < SP.length) {
    let b = a;
    while (b + 1 < SP.length && SP[b + 1].gruppe === SP[a].gruppe) b++;
    const fill = SP[a].gruppe.startsWith("Hausgeld") ? PRIM : GRUEN;
    for (let c = a; c <= b; c++) k.wert(G, c + 1, c === a ? SP[a].gruppe : null, { b: true, farbe: "FFFFFF", fill, rand: "duenn", h: "center", v: "center" });
    if (b > a) k.merges.push(`${spalte(a + 1)}${G}:${spalte(b + 1)}${G}`);
    a = b + 1;
  }
  SP.forEach((s, i) => k.wert(H, i + 1, s.titel, { b: true, farbe: GRUEN, fill: HELLGRUEN, rand: "duenn", h: "center", v: "center", wrap: true }));
  k.hoehen.set(G, 16);
  k.hoehen.set(H, 30);

  const zentriert = new Set(["we", "status", "mv", "mea"]);
  for (let n = 0; n < anzahl; n++) {
    const zr = D0 + n;
    const z = e.zeilen[n];
    const er = r.zeilen[n];
    const fl = `${C.flaeche}${zr}`;
    const f: Record<string, string> = {
      istqm: `IF(OR(${fl}="",${fl}=0),"",${C.ist}${zr}/${fl})`,
      gesmiete: `IF(${fl}="","",SUM(${C.ist}${zr},${C.bk}${zr}:${C.mwst}${zr}))`,
      istjahr: `IF(${fl}="","",N(${C.ist}${zr})*12)`,
      soll: `IF(${fl}="","",${fl}*IF(${C.sollqm}${zr}="",$K$2,${C.sollqm}${zr}))`,
      solljahr: `IF(${fl}="","",${C.soll}${zr}*12)`,
      vkqm: `IF(OR(${fl}="",${fl}=0,${C.vk}${zr}=""),"",${C.vk}${zr}/${fl})`,
      rist: `IF(OR(${C.vk}${zr}="",${C.vk}${zr}=0,${fl}=""),"",${C.istjahr}${zr}/${C.vk}${zr})`,
      rsoll: `IF(OR(${C.vk}${zr}="",${C.vk}${zr}=0,${fl}=""),"",${C.solljahr}${zr}/${C.vk}${zr})`,
      hg_uml: hg("umlagefähig", zr), hg_hk: hg("Heizkosten", zr), hg_numl: hg("nicht umlagefähig", zr), hg_er: hg("Erhaltungsrücklage", zr),
      hg: `IF(${C.mea}${zr}="","",SUM(${C.hg_uml}${zr}:${C.hg_er}${zr}))`,
      ueber: `IF(OR(${fl}="",${C.mea}${zr}=""),"",${C.soll}${zr}-${C.hg_numl}${zr}-${C.hg_er}${zr})`,
      subv: `IF(OR(${C.vk}${zr}="",$K$3="",SUM($${C.vk}$${D0}:$${C.vk}$${E})=0),"",$K$3*${C.vk}${zr}/SUM($${C.vk}$${D0}:$${C.vk}$${E}))`,
    };
    SP.forEach((s, i) => {
      const basis: Stil = { rand: "duenn", fmt: s.fmt, h: zentriert.has(s.k) ? "center" : undefined };
      if (s.art === "f") k.formel(zr, i + 1, f[s.k], ergebnis(er, s.k), { ...basis, fill: n % 2 ? GRAU : "FFFFFF" });
      else k.wert(zr, i + 1, z ? eingabe(z, s.k) : null, { ...basis, offen: true, fill: n % 2 ? HELLGOLD2 : HELLGOLD });
    });
  }
  k.listen.push({ sqref: `${C.status}${D0}:${C.status}${E}`, werte: KPL_STATUS.join(",") });

  // GESAMT
  const S = E + 1;
  const g = r.gesamt;
  k.hoehen.set(S, 20);
  const summen: Record<string, number> = {
    flaeche: g.flaeche, mea: g.mea, ist: g.ist, bk: g.bk, hk: g.hk, strom: g.strom, wasser: g.wasser, nk: g.nk, mwst: g.mwst,
    gesmiete: g.gesamtmiete, istjahr: g.istJahr, soll: g.soll, solljahr: g.sollJahr, vk: g.vk,
    hg_uml: g.hgUml, hg_hk: g.hgHk, hg_numl: g.hgNuml, hg_er: g.hgEr, hg: g.hg, ueber: g.ueberschuss, subv: g.subvention,
  };
  const quote = (zaehler: string, nenner: string, wert: number | null) => [`IF(${nenner}${S}=0,"",${zaehler}${S}/${nenner}${S})`, wert ?? ""] as const;
  const besondere: Record<string, readonly [string, Wert]> = {
    istqm: quote(C.ist, C.flaeche, g.istQm), sollqm: quote(C.soll, C.flaeche, g.sollQm), vkqm: quote(C.vk, C.flaeche, g.vkQm),
    rist: quote(C.istjahr, C.vk, g.renditeIst), rsoll: quote(C.solljahr, C.vk, g.renditeSoll),
    status: [`COUNTIF(${C.status}${D0}:${C.status}${E},"vermietet")&" verm. / "&COUNTA(${C.we}${D0}:${C.we}${E})&" WE"`, `${g.vermietet} verm. / ${g.einheiten} WE`],
  };
  SP.forEach((s, i) => {
    const st: Stil = { b: true, farbe: GRUEN, fill: GESAMT, rand: "gesamt", fmt: s.fmt, h: zentriert.has(s.k) ? "center" : undefined };
    const sp = spalte(i + 1);
    if (s.k === "we") k.wert(S, i + 1, "GESAMT", st);
    else if (s.k in summen) k.formel(S, i + 1, `SUM(${sp}${D0}:${sp}${E})`, summen[s.k], st);
    else if (s.k in besondere) k.formel(S, i + 1, besondere[s.k][0], besondere[s.k][1], st);
    else k.wert(S, i + 1, null, st);
  });
  k.wert(S + 2, 1, "Hinweise: Hausgeld je Einheit = Ansätze des Wirtschaftsplans nach Verteiler (MEA-Anteil bzw. je Einheit) / 12. Mietrendite = Jahresmiete / Verkaufspreis. Überschuss Soll = Sollmiete – nicht umlagefähiges Hausgeld – Erhaltungsrücklage. Mietsubvention = Gesamtbetrag anteilig nach Verkaufspreis. Alle Angaben ohne Gewähr.", { i: true, farbe: "666666", sz: 8 });

  const fuss = "OS Immobilien Holding GmbH · Am Ostbahnhof 1 · 15749 Mittenwalde";
  const ns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${ns}"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Kaufpreisliste" sheetId="1" r:id="rId1"/><sheet name="Wirtschaftsplan" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">Kaufpreisliste!$${G}:$${H}</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${ns}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${ns}/styles" Target="styles.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": k.xml({ freeze: `C${D0}`, fitA3: true, quer: true, fuss }),
    "xl/worksheets/sheet2.xml": w.xml({ freeze: `A${WP_START}`, fuss }),
    "xl/styles.xml": stile.xml(),
  };
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function baueKaufpreislisteXlsx(e: KplEingaben): Promise<Blob> {
  const zip = new JSZip();
  for (const [pfad, inhalt] of Object.entries(baueKaufpreislisteXlsxDateien(e))) zip.file(pfad, inhalt);
  return zip.generateAsync({ type: "blob", mimeType: XLSX_MIME, compression: "DEFLATE" });
}

/** Datei im Browser speichern. */
export function dateiHerunterladen(datei: Blob, name: string) {
  const url = URL.createObjectURL(datei);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type VersandWeg = "teilen" | "mailto" | "abgebrochen";

/**
 * „Per Mail versenden“, Übergangslösung bis der Mailversand des CRM läuft:
 * Wo der Browser Dateien teilen kann (Safari/macOS, iOS, Android), öffnet
 * sich das System-Teilen-Menü mit den Dateien, darin z. B. Mail. Sonst
 * werden die Dateien heruntergeladen und ein Mailentwurf mit Betreff und
 * Text geöffnet; anhängen muss man sie dann selbst.
 *
 * Später hier den echten Versand über die Edge Function
 * `send-transactional-email` anschließen (Empfänger abfragen, Dateien als
 * Anhang hochladen); die Seite ruft nur diese Funktion auf.
 */
export async function kaufpreislisteVersenden(objektName: string, dateien: File[]): Promise<VersandWeg> {
  const betreff = `Kaufpreisliste ${objektName.trim()}`.trim();
  const text = `Guten Tag,\n\nanbei die ${betreff}.\n\nMit freundlichen Grüßen\nOS Immobilien`;
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: dateien })) {
    try {
      await navigator.share({ files: dateien, title: betreff, text });
      return "teilen";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "abgebrochen";
      // Teilen verweigert (z. B. fehlende Nutzergeste): weiter mit Download und Mailentwurf.
      console.warn("Teilen nicht möglich", err);
    }
  }
  dateien.forEach((d) => dateiHerunterladen(d, d.name));
  window.location.href = `mailto:?subject=${encodeURIComponent(betreff)}&body=${encodeURIComponent(`${text}\n\n(Bitte die heruntergeladene Datei anhängen: ${dateien.map((d) => d.name).join(", ")})`)}`;
  return "mailto";
}
