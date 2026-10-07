import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type DienstleisterTyp = "hausmeister" | "reinigung" | "garten" | "winterdienst" | "handwerker" | "versicherung" | "versorger" | "sonstiges";
export interface DienstleisterDokument { id: string; name: string; url: string; typ: "vertrag" | "rechnung" | "angebot" | "versicherung" | "nachweis" | "sonstiges"; erstelltAm: string; }

export interface Dienstleister {
  id: string; firma: string; ansprechpartner: string; email: string; telefon: string; typ: DienstleisterTyp;
  objektIds: string[]; objektNamen?: string[]; vertragBeginn: string; vertragEnde: string; kuendigungsfrist: string;
  kostenMonatlich: number; notizen: string; erstelltAm: string; dokumente: DienstleisterDokument[];
  strasse?: string; plz?: string; ort?: string; webseite?: string; steuernummer?: string; iban?: string;
  bewertung?: number; leistungsbeschreibung?: string;
}

const LS_KEY = "mi_dienstleister";

function toDb(d: Dienstleister): Record<string, any> {
  return { id: d.id, name: d.firma, email: d.email, telefon: d.telefon, kategorie: d.typ, adresse: [d.strasse, d.plz, d.ort].filter(Boolean).join(", "), bewertung: d.bewertung || 0, notizen: d.notizen, erstellt_am: d.erstelltAm, meta: { firma: d.firma, ansprechpartner: d.ansprechpartner, typ: d.typ, objektIds: d.objektIds, objektNamen: d.objektNamen, vertragBeginn: d.vertragBeginn, vertragEnde: d.vertragEnde, kuendigungsfrist: d.kuendigungsfrist, kostenMonatlich: d.kostenMonatlich, dokumente: d.dokumente, strasse: d.strasse, plz: d.plz, ort: d.ort, webseite: d.webseite, steuernummer: d.steuernummer, iban: d.iban, leistungsbeschreibung: d.leistungsbeschreibung } };
}

function fromDb(r: any): Dienstleister {
  const meta = r.meta || {};
  return { id: r.id, firma: meta.firma || r.name || "", ansprechpartner: meta.ansprechpartner || "", email: r.email || "", telefon: r.telefon || "", typ: meta.typ || r.kategorie || "sonstiges", objektIds: meta.objektIds || [], objektNamen: meta.objektNamen, vertragBeginn: meta.vertragBeginn || "", vertragEnde: meta.vertragEnde || "", kuendigungsfrist: meta.kuendigungsfrist || "", kostenMonatlich: meta.kostenMonatlich || 0, notizen: r.notizen || "", erstelltAm: r.erstellt_am || "", dokumente: meta.dokumente || [], strasse: meta.strasse, plz: meta.plz, ort: meta.ort, webseite: meta.webseite, steuernummer: meta.steuernummer, iban: meta.iban, bewertung: r.bewertung || 0, leistungsbeschreibung: meta.leistungsbeschreibung };
}

export function getDienstleister(): Dienstleister[] {
  if (isTestAccount()) return localGet<Dienstleister[]>(LS_KEY, []);
  return cacheGet("dienstleister").map(fromDb);
}
export function getDienstleisterById(id: string) {
  if (isTestAccount()) return localGet<Dienstleister[]>(LS_KEY, []).find(d => d.id === id);
  const row = cacheGet("dienstleister").find((r: any) => r.id === id); return row ? fromDb(row) : undefined;
}

export function addDienstleister(d: Omit<Dienstleister, "id" | "erstelltAm">): Dienstleister {
  const neu: Dienstleister = { ...d, id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  if (isTestAccount()) { const all = localGet<Dienstleister[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("dienstleister", toDb(neu)); }
  return neu;
}

export function updateDienstleister(id: string, updates: Partial<Dienstleister>) {
  if (isTestAccount()) { const all = localGet<Dienstleister[]>(LS_KEY, []); const idx = all.findIndex(d => d.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_KEY, all); } }
  else { const existing = getDienstleisterById(id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("dienstleister", id, u); }
}

export function deleteDienstleister(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<Dienstleister[]>(LS_KEY, []).filter(d => d.id !== id)); }
  else { cacheDelete("dienstleister", id); }
}

export function addDienstleisterDokument(dlId: string, doc: Omit<DienstleisterDokument, "id" | "erstelltAm">) {
  const d = getDienstleisterById(dlId); if (!d) return;
  if (!d.dokumente) d.dokumente = [];
  d.dokumente.push({ ...doc, id: `ddoc-${Date.now()}`, erstelltAm: new Date().toISOString().split("T")[0] });
  updateDienstleister(dlId, { dokumente: d.dokumente });
}

export function removeDienstleisterDokument(dlId: string, docId: string) {
  const d = getDienstleisterById(dlId); if (!d) return;
  updateDienstleister(dlId, { dokumente: (d.dokumente || []).filter(doc => doc.id !== docId) });
}

export const DIENSTLEISTER_TYPEN: { value: DienstleisterTyp; label: string }[] = [
  { value: "hausmeister", label: "Hausmeister" }, { value: "reinigung", label: "Reinigung" },
  { value: "garten", label: "Gartenpflege" }, { value: "winterdienst", label: "Winterdienst" },
  { value: "handwerker", label: "Handwerker" }, { value: "versicherung", label: "Versicherung" },
  { value: "versorger", label: "Versorger" }, { value: "sonstiges", label: "Sonstiges" },
];
export const DL_DOKUMENT_TYPEN: { value: DienstleisterDokument["typ"]; label: string }[] = [
  { value: "vertrag", label: "Vertrag" }, { value: "rechnung", label: "Rechnung" }, { value: "angebot", label: "Angebot" },
  { value: "versicherung", label: "Versicherungsnachweis" }, { value: "nachweis", label: "Nachweis" }, { value: "sonstiges", label: "Sonstiges" },
];
