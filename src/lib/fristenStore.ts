// Fristenüberwachung – sammelt Fristen aus allen Modulen

import { getMieter } from "./mieterStore";
import { getDienstleister } from "./dienstleisterStore";
import { getVersicherungen } from "./versicherungStore";
import { getEigentuemer } from "./eigentuemerStore";
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount } from "./dbStoreHelper";

export interface Frist {
  id: string;
  typ: "mietvertrag" | "kuendigung" | "dienstleister" | "versicherung" | "verwaltervertrag" | "bka" | "tuev" | "rauchmelder" | "legionellen";
  titel: string;
  beschreibung: string;
  faelligAm: string;
  bezugObjekt: string;
  bezugPerson: string;
  prioritaet: "niedrig" | "mittel" | "hoch" | "kritisch";
  erledigt: boolean;
}

// localStorage fallback keys for testaccount
const CUSTOM_FRISTEN_KEY = "mi_custom_fristen";

function loadCustom(): Frist[] {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(CUSTOM_FRISTEN_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  // Live: read from DB-backed cache
  return cacheGet<any>("fristen").map((r: any) => ({
    id: r.id,
    typ: r.kategorie || "tuev",
    titel: r.titel,
    beschreibung: r.beschreibung || "",
    faelligAm: r.faellig_am || "",
    bezugObjekt: r.objekt || "",
    bezugPerson: "",
    prioritaet: r.status === "kritisch" ? "kritisch" : r.status === "hoch" ? "hoch" : r.status === "mittel" ? "mittel" : "niedrig",
    erledigt: r.status === "erledigt",
  } as Frist));
}

function saveCustomLS(d: Frist[]) { localStorage.setItem(CUSTOM_FRISTEN_KEY, JSON.stringify(d)); }

export function addCustomFrist(f: Omit<Frist, "id">): Frist {
  if (isTestAccount()) {
    const all = loadCustom();
    const neu: Frist = { ...f, id: `frist-${Date.now()}` };
    all.push(neu);
    saveCustomLS(all);
    return neu;
  }
  // Live: insert into DB via cache
  const id = crypto.randomUUID();
  const row = {
    id,
    titel: f.titel,
    beschreibung: f.beschreibung || null,
    faellig_am: f.faelligAm || null,
    kategorie: f.typ || "tuev",
    objekt: f.bezugObjekt || null,
    status: f.prioritaet || "mittel",
    erstellt_am: new Date().toISOString(),
  };
  cacheInsert("fristen", row);
  return { ...f, id } as Frist;
}

export function updateCustomFrist(id: string, updates: Partial<Frist>) {
  if (isTestAccount()) {
    const all = loadCustom();
    const idx = all.findIndex(f => f.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; saveCustomLS(all); }
    return;
  }
  const dbUpdates: Record<string, any> = {};
  if (updates.titel !== undefined) dbUpdates.titel = updates.titel;
  if (updates.beschreibung !== undefined) dbUpdates.beschreibung = updates.beschreibung;
  if (updates.faelligAm !== undefined) dbUpdates.faellig_am = updates.faelligAm;
  if (updates.erledigt) dbUpdates.status = "erledigt";
  if (updates.prioritaet) dbUpdates.status = updates.prioritaet;
  if (updates.bezugObjekt !== undefined) dbUpdates.objekt = updates.bezugObjekt;
  if (updates.typ !== undefined) dbUpdates.kategorie = updates.typ;
  cacheUpdate("fristen", id, dbUpdates);
}

export function deleteCustomFrist(id: string) {
  if (isTestAccount()) { saveCustomLS(loadCustom().filter(f => f.id !== id)); return; }
  cacheDelete("fristen", id);
}

function daysBetween(d1: string, d2: Date): number {
  const target = new Date(d1);
  return Math.ceil((target.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

function prioritaetFromDays(days: number): Frist["prioritaet"] {
  if (days <= 7) return "kritisch";
  if (days <= 30) return "hoch";
  if (days <= 90) return "mittel";
  return "niedrig";
}

export function getAlleFristen(): Frist[] {
  const now = new Date();
  const fristen: Frist[] = [];

  // 1. Mietverträge auslaufend
  getMieter().filter(m => m.status === "aktiv" && m.mietvertragEnde).forEach(m => {
    const days = daysBetween(m.mietvertragEnde, now);
    if (days > 0 && days <= 180) {
      fristen.push({
        id: `frist-mv-${m.id}`, typ: "mietvertrag",
        titel: `Mietvertrag ${m.vorname} ${m.nachname} läuft aus`,
        beschreibung: `Ende: ${new Date(m.mietvertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
        faelligAm: m.mietvertragEnde,
        bezugObjekt: m.objektName || m.objektId,
        bezugPerson: `${m.vorname} ${m.nachname}`,
        prioritaet: prioritaetFromDays(days), erledigt: false,
      });
    }
  });

  // 2. Kündigungsfristen
  getMieter().filter(m => m.status === "gekuendigt" && m.kuendigungsdatum).forEach(m => {
    const days = daysBetween(m.kuendigungsdatum!, now);
    if (days > 0) {
      fristen.push({
        id: `frist-kuend-${m.id}`, typ: "kuendigung",
        titel: `Kündigung ${m.vorname} ${m.nachname}`,
        beschreibung: `Kündigung zum: ${new Date(m.kuendigungsdatum!).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
        faelligAm: m.kuendigungsdatum!,
        bezugObjekt: m.objektName || m.objektId,
        bezugPerson: `${m.vorname} ${m.nachname}`,
        prioritaet: prioritaetFromDays(days), erledigt: false,
      });
    }
  });

  // 3. Dienstleisterverträge auslaufend
  getDienstleister().filter(d => d.vertragEnde).forEach(d => {
    const days = daysBetween(d.vertragEnde, now);
    if (days > 0 && days <= 180) {
      fristen.push({
        id: `frist-dl-${d.id}`, typ: "dienstleister",
        titel: `Vertrag ${d.firma} läuft aus`,
        beschreibung: `Ende: ${new Date(d.vertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })} · Kündigungsfrist: ${d.kuendigungsfrist}`,
        faelligAm: d.vertragEnde,
        bezugObjekt: d.objektNamen?.join(", ") || "",
        bezugPerson: d.ansprechpartner,
        prioritaet: prioritaetFromDays(days), erledigt: false,
      });
    }
  });

  // 4. Versicherungen auslaufend
  getVersicherungen().filter(v => v.vertragEnde).forEach(v => {
    const days = daysBetween(v.vertragEnde, now);
    if (days > 0 && days <= 180) {
      fristen.push({
        id: `frist-vers-${v.id}`, typ: "versicherung",
        titel: `Versicherung ${v.versicherer} läuft aus`,
        beschreibung: `${v.typ} · Polize: ${v.policenNr}`,
        faelligAm: v.vertragEnde,
        bezugObjekt: v.objektName,
        bezugPerson: v.ansprechpartner,
        prioritaet: prioritaetFromDays(days), erledigt: false,
      });
    }
  });

  // 5. Verwalterverträge
  getEigentuemer().forEach(e => {
    if (e.verwaltervertragEnde) {
      const days = daysBetween(e.verwaltervertragEnde, now);
      if (days > 0 && days <= 365) {
        fristen.push({
          id: `frist-vv-${e.id}`, typ: "verwaltervertrag",
          titel: `Verwaltervertrag ${e.name} läuft aus`,
          beschreibung: `Ende: ${new Date(e.verwaltervertragEnde).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`,
          faelligAm: e.verwaltervertragEnde,
          bezugObjekt: e.objektNamen.join(", "),
          bezugPerson: e.name,
          prioritaet: prioritaetFromDays(days), erledigt: false,
        });
      }
    }
  });

  // 6. Custom fristen (TÜV, Rauchmelder, Legionellen, BKA)
  loadCustom().filter(f => !f.erledigt).forEach(f => {
    const days = daysBetween(f.faelligAm, now);
    if (days > -30) { // show up to 30 days overdue
      fristen.push({ ...f, prioritaet: days <= 0 ? "kritisch" : prioritaetFromDays(days) });
    }
  });

  // Sort by date
  return fristen.sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
}

export function getFristenSummary(): { kritisch: number; hoch: number; mittel: number; gesamt: number } {
  const all = getAlleFristen();
  return {
    kritisch: all.filter(f => f.prioritaet === "kritisch").length,
    hoch: all.filter(f => f.prioritaet === "hoch").length,
    mittel: all.filter(f => f.prioritaet === "mittel").length,
    gesamt: all.length,
  };
}
