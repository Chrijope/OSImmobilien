import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheFilter } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type VersicherungsTyp = "gebaeudeversicherung" | "haftpflicht" | "glasbruch" | "elementar" | "mietausfall" | "rechtsschutz" | "sonstiges";

export interface Versicherung {
  id: string; objektId: string; objektName: string; typ: VersicherungsTyp; versicherer: string; policenNr: string;
  praemieJaehrlich: number; vertragBeginn: string; vertragEnde: string; kuendigungsfrist: string;
  deckungssumme: number; selbstbeteiligung: number; ansprechpartner: string; telefon: string; email: string;
  notizen: string; erstelltAm: string;
}

export interface Schadenmeldung {
  id: string; versicherungId: string; objektId: string; schadenDatum: string; schadensNr: string;
  beschreibung: string; schadenshoehe: number; regulierungsBetrag: number;
  status: "gemeldet" | "in_bearbeitung" | "reguliert" | "abgelehnt"; erstelltAm: string;
}

const LS_VERS = "mi_versicherungen";
const LS_SCHADEN = "mi_schadensmeldungen";

function versToDb(v: Versicherung): Record<string, any> {
  return { id: v.id, name: v.versicherer, objekt: v.objektId, typ: v.typ, police_nr: v.policenNr, praemie: v.praemieJaehrlich, gueltig_ab: v.vertragBeginn, gueltig_bis: v.vertragEnde, anbieter: v.versicherer, notizen: v.notizen, erstellt_am: v.erstelltAm, meta: { objektName: v.objektName, kuendigungsfrist: v.kuendigungsfrist, deckungssumme: v.deckungssumme, selbstbeteiligung: v.selbstbeteiligung, ansprechpartner: v.ansprechpartner, telefon: v.telefon, email: v.email } };
}

function versFromDb(r: any): Versicherung {
  const meta = r.meta || {};
  return { id: r.id, objektId: r.objekt || "", objektName: meta.objektName || "", typ: r.typ || "sonstiges", versicherer: r.anbieter || r.name || "", policenNr: r.police_nr || "", praemieJaehrlich: Number(r.praemie) || 0, vertragBeginn: r.gueltig_ab || "", vertragEnde: r.gueltig_bis || "", kuendigungsfrist: meta.kuendigungsfrist || "", deckungssumme: meta.deckungssumme || 0, selbstbeteiligung: meta.selbstbeteiligung || 0, ansprechpartner: meta.ansprechpartner || "", telefon: meta.telefon || "", email: meta.email || "", notizen: r.notizen || "", erstelltAm: r.erstellt_am || "" };
}

export const VERSICHERUNGS_TYPEN: { value: VersicherungsTyp; label: string }[] = [
  { value: "gebaeudeversicherung", label: "Gebäudeversicherung" }, { value: "haftpflicht", label: "Haus- & Grundbesitzer-Haftpflicht" },
  { value: "glasbruch", label: "Glasbruchversicherung" }, { value: "elementar", label: "Elementarversicherung" },
  { value: "mietausfall", label: "Mietausfallversicherung" }, { value: "rechtsschutz", label: "Rechtsschutzversicherung" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function getVersicherungen(): Versicherung[] {
  if (isTestAccount()) return localGet<Versicherung[]>(LS_VERS, []);
  return cacheGet("versicherungen").map(versFromDb);
}
export function getVersicherungenByObjekt(objektId: string) { return getVersicherungen().filter(v => v.objektId === objektId); }

export function addVersicherung(v: Omit<Versicherung, "id" | "erstelltAm">): Versicherung {
  const neu: Versicherung = { ...v, id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  if (isTestAccount()) { const all = localGet<Versicherung[]>(LS_VERS, []); all.push(neu); localSet(LS_VERS, all); }
  else { cacheInsert("versicherungen", versToDb(neu)); }
  return neu;
}

export function updateVersicherung(id: string, updates: Partial<Versicherung>) {
  if (isTestAccount()) { const all = localGet<Versicherung[]>(LS_VERS, []); const idx = all.findIndex(v => v.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_VERS, all); } }
  else { const existing = getVersicherungen().find(v => v.id === id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = versToDb(merged); cacheUpdate("versicherungen", id, u); }
}

export function deleteVersicherung(id: string) {
  if (isTestAccount()) { localSet(LS_VERS, localGet<Versicherung[]>(LS_VERS, []).filter(v => v.id !== id)); }
  else { cacheDelete("versicherungen", id); }
}

// Schadensmeldungen stored in localStorage for now (no dedicated DB table)
export function getSchadensmeldungen(): Schadenmeldung[] { return localGet<Schadenmeldung[]>(LS_SCHADEN, []); }
export function getSchadenByVersicherung(versId: string) { return getSchadensmeldungen().filter(s => s.versicherungId === versId); }

export function addSchadenmeldung(s: Omit<Schadenmeldung, "id" | "erstelltAm">): Schadenmeldung {
  const all = getSchadensmeldungen();
  const neu: Schadenmeldung = { ...s, id: `schaden-${Date.now()}`, erstelltAm: new Date().toISOString().split("T")[0] };
  all.push(neu); localSet(LS_SCHADEN, all); return neu;
}

export function updateSchadenmeldung(id: string, updates: Partial<Schadenmeldung>) {
  const all = getSchadensmeldungen(); const idx = all.findIndex(s => s.id === id);
  if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_SCHADEN, all); }
}
