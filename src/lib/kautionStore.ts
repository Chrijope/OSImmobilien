import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface KautionEintrag {
  id: string; mieterId: string; betrag: number; eingezahltAm: string;
  rate1: number; rate1Datum: string; rate2: number; rate2Datum: string; rate3: number; rate3Datum: string;
  zinssatz: number; zinsStart: string; rueckzahlungBetrag: number; rueckzahlungDatum: string;
  einbehalte: KautionEinbehalt[]; status: "offen" | "vollstaendig" | "teilweise" | "rueckzahlung" | "abgeschlossen"; notiz: string;
}
export interface KautionEinbehalt { id: string; grund: "schaeden" | "offene_nk" | "offene_miete" | "reinigung" | "sonstiges"; beschreibung: string; betrag: number; datum: string; }

const LS_KEY = "mi_kautionen";
export const EINBEHALT_GRUENDE: { value: KautionEinbehalt["grund"]; label: string }[] = [
  { value: "schaeden", label: "Schäden" }, { value: "offene_nk", label: "Offene Nebenkosten" },
  { value: "offene_miete", label: "Offene Miete" }, { value: "reinigung", label: "Reinigungskosten" }, { value: "sonstiges", label: "Sonstiges" },
];

function toDb(k: KautionEintrag): Record<string, any> {
  return { id: k.id, mieter_name: k.mieterId, betrag: k.betrag, eingegangen_am: k.eingezahltAm || null, status: k.status, notizen: k.notiz, meta: { mieterId: k.mieterId, rate1: k.rate1, rate1Datum: k.rate1Datum, rate2: k.rate2, rate2Datum: k.rate2Datum, rate3: k.rate3, rate3Datum: k.rate3Datum, zinssatz: k.zinssatz, zinsStart: k.zinsStart, rueckzahlungBetrag: k.rueckzahlungBetrag, rueckzahlungDatum: k.rueckzahlungDatum, einbehalte: k.einbehalte } };
}
function fromDb(r: any): KautionEintrag {
  const meta = r.meta || {};
  return { id: r.id, mieterId: meta.mieterId || r.mieter_name || "", betrag: Number(r.betrag) || 0, eingezahltAm: r.eingegangen_am || "", rate1: meta.rate1 || 0, rate1Datum: meta.rate1Datum || "", rate2: meta.rate2 || 0, rate2Datum: meta.rate2Datum || "", rate3: meta.rate3 || 0, rate3Datum: meta.rate3Datum || "", zinssatz: meta.zinssatz || 0.01, zinsStart: meta.zinsStart || "", rueckzahlungBetrag: meta.rueckzahlungBetrag || 0, rueckzahlungDatum: meta.rueckzahlungDatum || "", einbehalte: meta.einbehalte || [], status: r.status || "offen", notiz: r.notizen || "" };
}

export function getKautionen(): KautionEintrag[] {
  if (isTestAccount()) return localGet<KautionEintrag[]>(LS_KEY, []);
  return cacheGet("kautionen").map(fromDb);
}
export function getKautionByMieter(mieterId: string) { return getKautionen().find(k => k.mieterId === mieterId); }

export function saveKaution(kaution: KautionEintrag) {
  if (isTestAccount()) { const all = localGet<KautionEintrag[]>(LS_KEY, []); const idx = all.findIndex(k => k.id === kaution.id); if (idx >= 0) all[idx] = kaution; else all.push(kaution); localSet(LS_KEY, all); return; }
  const existing = cacheGet("kautionen").find((r: any) => r.id === kaution.id);
  if (existing) { const { id: _id, ...u } = toDb(kaution); cacheUpdate("kautionen", kaution.id, u); }
  else { cacheInsert("kautionen", toDb(kaution)); }
}

export function deleteKaution(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<KautionEintrag[]>(LS_KEY, []).filter(k => k.id !== id)); }
  else { cacheDelete("kautionen", id); }
}

export function createKaution(mieterId: string, betrag: number, mietbeginn: string): KautionEintrag {
  const r = Math.ceil(betrag / 3);
  return { id: crypto.randomUUID(), mieterId, betrag, eingezahltAm: "", rate1: r, rate1Datum: "", rate2: r, rate2Datum: "", rate3: betrag - r * 2, rate3Datum: "", zinssatz: 0.01, zinsStart: mietbeginn, rueckzahlungBetrag: 0, rueckzahlungDatum: "", einbehalte: [], status: "offen", notiz: "" };
}

export function berechneKautionZinsen(kaution: KautionEintrag): number {
  if (!kaution.zinsStart || kaution.betrag <= 0) return 0;
  const start = new Date(kaution.zinsStart); const ende = kaution.rueckzahlungDatum ? new Date(kaution.rueckzahlungDatum) : new Date();
  const jahre = (ende.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (jahre <= 0) return 0;
  return Math.round((kaution.betrag * Math.pow(1 + kaution.zinssatz / 100, jahre) - kaution.betrag) * 100) / 100;
}

export function berechneRueckzahlung(kaution: KautionEintrag) {
  const zinsen = berechneKautionZinsen(kaution); const brutto = kaution.betrag + zinsen;
  const einbehalte = kaution.einbehalte.reduce((s, e) => s + e.betrag, 0);
  return { brutto, einbehalte, netto: brutto - einbehalte, zinsen };
}
