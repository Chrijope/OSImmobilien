import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface KommunikationsEintrag {
  id: string; mieterId: string; datum: string; typ: "anruf" | "email" | "brief" | "persoenlich" | "sms" | "notiz";
  richtung: "eingehend" | "ausgehend" | "intern"; betreff: string; inhalt: string; erstelltVon: string; erstelltAm: string;
}

const LS_KEY = "mi_kommunikation";

export const KOMM_TYPEN: { value: KommunikationsEintrag["typ"]; label: string; emoji: string }[] = [
  { value: "anruf", label: "Anruf", emoji: "📞" }, { value: "email", label: "E-Mail", emoji: "📧" },
  { value: "brief", label: "Brief", emoji: "✉️" }, { value: "persoenlich", label: "Persönlich", emoji: "🤝" },
  { value: "sms", label: "SMS", emoji: "💬" }, { value: "notiz", label: "Interne Notiz", emoji: "📝" },
];
export const RICHTUNG_LABELS: { value: KommunikationsEintrag["richtung"]; label: string }[] = [
  { value: "eingehend", label: "Eingehend" }, { value: "ausgehend", label: "Ausgehend" }, { value: "intern", label: "Intern" },
];

function toDb(k: KommunikationsEintrag): Record<string, any> {
  return { id: k.id, typ: k.typ, betreff: k.betreff, inhalt: k.inhalt, absender: k.erstelltVon, erstellt_am: k.erstelltAm, meta: { mieterId: k.mieterId, datum: k.datum, richtung: k.richtung, erstelltVon: k.erstelltVon } };
}
function fromDb(r: any): KommunikationsEintrag {
  const meta = r.meta || {};
  return { id: r.id, mieterId: meta.mieterId || "", datum: meta.datum || r.erstellt_am || "", typ: r.typ || "notiz", richtung: meta.richtung || "intern", betreff: r.betreff || "", inhalt: r.inhalt || "", erstelltVon: meta.erstelltVon || r.absender || "", erstelltAm: r.erstellt_am || "" };
}

export function getKommunikation(): KommunikationsEintrag[] {
  if (isTestAccount()) return localGet<KommunikationsEintrag[]>(LS_KEY, []);
  return cacheGet("kommunikation").map(fromDb);
}
export function getKommunikationByMieter(mieterId: string) { return getKommunikation().filter(k => k.mieterId === mieterId).sort((a, b) => b.datum.localeCompare(a.datum)); }

export function addKommunikation(k: Omit<KommunikationsEintrag, "id" | "erstelltAm">): KommunikationsEintrag {
  const neu: KommunikationsEintrag = { ...k, id: crypto.randomUUID(), erstelltAm: new Date().toISOString() };
  if (isTestAccount()) { const all = localGet<KommunikationsEintrag[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("kommunikation", toDb(neu)); }
  return neu;
}

export function updateKommunikation(id: string, updates: Partial<KommunikationsEintrag>) {
  if (isTestAccount()) { const all = localGet<KommunikationsEintrag[]>(LS_KEY, []); const idx = all.findIndex(k => k.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_KEY, all); } }
  else { const existing = getKommunikation().find(k => k.id === id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("kommunikation", id, u); }
}

export function deleteKommunikation(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<KommunikationsEintrag[]>(LS_KEY, []).filter(k => k.id !== id)); }
  else { cacheDelete("kommunikation", id); }
}
