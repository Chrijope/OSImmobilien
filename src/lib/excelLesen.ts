import JSZip from "jszip";

/*
 * Eine .xlsx lesen, ohne Excel-Bibliothek (wie der Export in
 * `kaufpreislisteExport.ts`): Die Datei ist ein Zip mit Office-XML. Gelesen
 * werden die Blätter mit ihren Zellwerten. Bei Formeln zählt der Wert, den
 * Excel beim Speichern mitgeschrieben hat; fehlt er, bleibt die Zelle leer.
 * Formate, Farben und Kommentare bleiben außen vor.
 */

export type Zelle = string | number | boolean | null;

export interface Blatt {
  name: string;
  /** Zeilen ab Zeile 1, Spalten ab A. Leere Zellen sind null. */
  zeilen: Zelle[][];
}

const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function xml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

/** „AB12“ → Spalte 27 (ab 0), Zeile 11 (ab 0). */
export function zellAdresse(ref: string): { spalte: number; zeile: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return { spalte: -1, zeile: -1 };
  let spalte = 0;
  for (const c of m[1]) spalte = spalte * 26 + (c.charCodeAt(0) - 64);
  return { spalte: spalte - 1, zeile: Number(m[2]) - 1 };
}

/*
 * Tags über den lokalen Namen suchen: Manche Programme schreiben jedes Tag mit
 * Präfix (`<x:sheet>`, `<x:c>`), so die Brück-Vertriebsliste. Ohne das fand
 * der Leser dort kein Blatt und meldete nichts.
 */
const tags = (knoten: Document | Element, name: string) => Array.from(knoten.getElementsByTagNameNS("*", name));

/** Text aus `<t>`-Knoten, auch bei formatierten Abschnitten (`<r><t>`). */
function textInhalt(knoten: Element): string {
  return tags(knoten, "t").map((t) => t.textContent ?? "").join("");
}

export async function leseExcel(datei: Blob | ArrayBuffer): Promise<Blatt[]> {
  const zip = await JSZip.loadAsync(datei);
  const lies = async (pfad: string) => {
    const f = zip.file(pfad);
    return f ? f.async("string") : null;
  };
  const mappe = await lies("xl/workbook.xml");
  if (!mappe) throw new Error("Keine Excel-Datei (.xlsx).");

  const geteilt: string[] = [];
  const sst = await lies("xl/sharedStrings.xml");
  if (sst) for (const si of tags(xml(sst), "si")) geteilt.push(textInhalt(si));

  const ziele = new Map<string, string>();
  const rels = await lies("xl/_rels/workbook.xml.rels");
  if (rels) {
    for (const r of tags(xml(rels), "Relationship")) {
      const ziel = r.getAttribute("Target") || "";
      ziele.set(r.getAttribute("Id") || "", ziel.startsWith("/") ? ziel.slice(1) : `xl/${ziel}`);
    }
  }

  const blaetter: Blatt[] = [];
  for (const s of tags(xml(mappe), "sheet")) {
    const rid = s.getAttributeNS(NS_REL, "id") || s.getAttribute("r:id") || "";
    const pfad = ziele.get(rid);
    const inhalt = pfad ? await lies(pfad) : null;
    if (!inhalt) continue;
    const zeilen: Zelle[][] = [];
    for (const c of tags(xml(inhalt), "c")) {
      const { spalte, zeile } = zellAdresse(c.getAttribute("r") || "");
      if (spalte < 0) continue;
      const typ = c.getAttribute("t");
      const v = tags(c, "v")[0]?.textContent ?? null;
      let wert: Zelle = null;
      if (typ === "s") wert = v === null ? null : geteilt[Number(v)] ?? null;
      else if (typ === "inlineStr") wert = textInhalt(c);
      else if (typ === "str" || typ === "e") wert = v;
      else if (typ === "b") wert = v === "1";
      else if (v !== null && v !== "") wert = Number(v);
      if (wert === "" ) wert = null;
      (zeilen[zeile] ||= [])[spalte] = wert;
    }
    // Lücken auffüllen, damit jede Zeile ein echtes Array ist.
    const breite = zeilen.reduce((m, z) => Math.max(m, z?.length ?? 0), 0);
    blaetter.push({
      name: s.getAttribute("name") || "",
      zeilen: Array.from({ length: zeilen.length }, (_, i) => Array.from({ length: breite }, (_, j) => zeilen[i]?.[j] ?? null)),
    });
  }
  return blaetter;
}

/** Excel speichert Datumswerte als Tage seit dem 30.12.1899. */
export function excelDatumIso(wert: Zelle): string {
  if (typeof wert === "number" && wert > 1000 && wert < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(wert) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  if (typeof wert === "string") {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(wert.trim());
    if (m) {
      const jahr = m[3].length === 2 ? (Number(m[3]) > 50 ? 1900 : 2000) + Number(m[3]) : Number(m[3]);
      return `${jahr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(wert)) return wert.slice(0, 10);
  }
  return "";
}
