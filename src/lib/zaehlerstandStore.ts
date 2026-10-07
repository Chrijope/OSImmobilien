import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheFilter } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface Zaehlerstand {
  id: string; mieterId: string; objektId: string; wohneinheitId: string;
  typ: "strom" | "wasser_kalt" | "wasser_warm" | "heizung" | "gas";
  zaehlerNr: string; stand: number; ableseDatum: string; abgelesenVon: string;
  anlass: "regulaer" | "einzug" | "auszug" | "zwischenablesung"; notiz: string;
}

const LS_KEY = "mi_zaehlerstaende";

export const ZAEHLER_TYPEN: { value: Zaehlerstand["typ"]; label: string; einheit: string }[] = [
  { value: "strom", label: "Strom", einheit: "kWh" }, { value: "wasser_kalt", label: "Wasser (kalt)", einheit: "m³" },
  { value: "wasser_warm", label: "Wasser (warm)", einheit: "m³" }, { value: "heizung", label: "Heizung", einheit: "kWh" },
  { value: "gas", label: "Gas", einheit: "m³" },
];
export const ANLASS_LABELS: { value: Zaehlerstand["anlass"]; label: string }[] = [
  { value: "regulaer", label: "Reguläre Ablesung" }, { value: "einzug", label: "Einzug" },
  { value: "auszug", label: "Auszug" }, { value: "zwischenablesung", label: "Zwischenablesung" },
];

function toDb(z: Zaehlerstand): Record<string, any> {
  return { id: z.id, meta: { mieterId: z.mieterId, objektId: z.objektId, wohneinheitId: z.wohneinheitId, typ: z.typ, zaehlerNr: z.zaehlerNr, stand: z.stand, ableseDatum: z.ableseDatum, abgelesenVon: z.abgelesenVon, anlass: z.anlass, notiz: z.notiz } };
}
function fromDb(r: any): Zaehlerstand {
  const meta = r.meta || {};
  return { id: r.id, mieterId: meta.mieterId || "", objektId: meta.objektId || "", wohneinheitId: meta.wohneinheitId || "", typ: meta.typ || "strom", zaehlerNr: meta.zaehlerNr || "", stand: meta.stand || 0, ableseDatum: meta.ableseDatum || "", abgelesenVon: meta.abgelesenVon || "", anlass: meta.anlass || "regulaer", notiz: meta.notiz || "" };
}

export function getZaehlerstaende(): Zaehlerstand[] {
  if (isTestAccount()) return localGet<Zaehlerstand[]>(LS_KEY, []);
  return cacheGet("zaehlerstaende").map(fromDb);
}
export function getZaehlerstaendeByMieter(mieterId: string) { return getZaehlerstaende().filter(z => z.mieterId === mieterId); }
export function getZaehlerstaendeByObjekt(objektId: string) { return getZaehlerstaende().filter(z => z.objektId === objektId); }

export function addZaehlerstand(z: Omit<Zaehlerstand, "id">): Zaehlerstand {
  const neu: Zaehlerstand = { ...z, id: crypto.randomUUID() };
  if (isTestAccount()) { const all = localGet<Zaehlerstand[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("zaehlerstaende", toDb(neu)); }
  return neu;
}

export function updateZaehlerstand(id: string, updates: Partial<Zaehlerstand>) {
  if (isTestAccount()) { const all = localGet<Zaehlerstand[]>(LS_KEY, []); const idx = all.findIndex(z => z.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_KEY, all); } }
  else { const existing = getZaehlerstaende().find(z => z.id === id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("zaehlerstaende", id, u); }
}

export function deleteZaehlerstand(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<Zaehlerstand[]>(LS_KEY, []).filter(z => z.id !== id)); }
  else { cacheDelete("zaehlerstaende", id); }
}

export function getVerbrauch(mieterId: string, typ: Zaehlerstand["typ"], von: string, bis: string): number | null {
  const staende = getZaehlerstaendeByMieter(mieterId).filter(z => z.typ === typ).sort((a, b) => a.ableseDatum.localeCompare(b.ableseDatum));
  const standVon = staende.filter(z => z.ableseDatum <= von).pop();
  const standBis = staende.filter(z => z.ableseDatum <= bis).pop();
  if (!standVon || !standBis || standVon.id === standBis.id) return null;
  return standBis.stand - standVon.stand;
}
