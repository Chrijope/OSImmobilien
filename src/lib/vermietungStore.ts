// Vermietung Pipeline Store
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type VermietungStufe = "leerstehend" | "inseriert" | "besichtigung" | "pruefung" | "zusage" | "mietvertrag" | "uebergabe" | "vermietet";
export interface Interessent { name: string; telefon: string; email: string; besichtigungsDatum: string; }

export interface VermietungPipeline {
  id: string; objektId: string; wohneinheitId: string; objektName: string; wohneinheitName: string;
  stufe: VermietungStufe; interessenten: Interessent[]; ausgewaehlterMieterId: string;
  uebergabeDatum: string; uebergabeProtokollUrl: string; mietvertragUrl: string; inseratUrl: string;
  kaltmiete: number; erstelltAm: string; aktualisiertAm: string;
}

const LS_KEY = "mi_vermietung";

export const VERMIETUNG_STUFEN: { value: VermietungStufe; label: string; color: string }[] = [
  { value: "leerstehend", label: "Leerstehend", color: "hsl(0, 70%, 55%)" }, { value: "inseriert", label: "Inseriert", color: "hsl(30, 80%, 50%)" },
  { value: "besichtigung", label: "Besichtigung", color: "hsl(45, 80%, 50%)" }, { value: "pruefung", label: "Prüfung", color: "hsl(157, 45%, 43%)" },
  { value: "zusage", label: "Zusage", color: "hsl(160, 60%, 45%)" }, { value: "mietvertrag", label: "Mietvertrag", color: "hsl(142, 60%, 45%)" },
  { value: "uebergabe", label: "Übergabe", color: "hsl(262, 50%, 55%)" }, { value: "vermietet", label: "Vermietet", color: "hsl(142, 70%, 40%)" },
];

function toDb(v: VermietungPipeline): Record<string, any> {
  return { id: v.id, objekt: v.objektId, wohnung: v.wohneinheitId, mieter_name: v.ausgewaehlterMieterId, miete: v.kaltmiete, status: v.stufe, mietbeginn: v.uebergabeDatum || null, erstellt_am: v.erstelltAm, meta: { objektName: v.objektName, wohneinheitName: v.wohneinheitName, interessenten: v.interessenten, ausgewaehlterMieterId: v.ausgewaehlterMieterId, uebergabeProtokollUrl: v.uebergabeProtokollUrl, mietvertragUrl: v.mietvertragUrl, inseratUrl: v.inseratUrl, aktualisiertAm: v.aktualisiertAm } };
}
function fromDb(r: any): VermietungPipeline {
  const meta = r.meta || {};
  return { id: r.id, objektId: r.objekt || "", wohneinheitId: r.wohnung || "", objektName: meta.objektName || "", wohneinheitName: meta.wohneinheitName || "", stufe: r.status || "leerstehend", interessenten: meta.interessenten || [], ausgewaehlterMieterId: meta.ausgewaehlterMieterId || r.mieter_name || "", uebergabeDatum: r.mietbeginn || "", uebergabeProtokollUrl: meta.uebergabeProtokollUrl || "", mietvertragUrl: meta.mietvertragUrl || "", inseratUrl: meta.inseratUrl || "", kaltmiete: Number(r.miete) || 0, erstelltAm: r.erstellt_am || "", aktualisiertAm: meta.aktualisiertAm || "" };
}

export function getVermietungen(): VermietungPipeline[] {
  if (isTestAccount()) return localGet<VermietungPipeline[]>(LS_KEY, []);
  return cacheGet("vermietungen").map(fromDb);
}
export function getVermietungById(id: string) {
  if (isTestAccount()) return localGet<VermietungPipeline[]>(LS_KEY, []).find(v => v.id === id);
  const row = cacheGet("vermietungen").find((r: any) => r.id === id); return row ? fromDb(row) : undefined;
}

export function addVermietung(v: Omit<VermietungPipeline, "id" | "erstelltAm" | "aktualisiertAm">): VermietungPipeline {
  const now = new Date().toISOString().split("T")[0];
  const neu: VermietungPipeline = { ...v, id: crypto.randomUUID(), erstelltAm: now, aktualisiertAm: now };
  if (isTestAccount()) { const all = localGet<VermietungPipeline[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("vermietungen", toDb(neu)); }
  return neu;
}

export function updateVermietung(id: string, updates: Partial<VermietungPipeline>) {
  if (isTestAccount()) { const all = localGet<VermietungPipeline[]>(LS_KEY, []); const idx = all.findIndex(v => v.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates, aktualisiertAm: new Date().toISOString().split("T")[0] }; localSet(LS_KEY, all); } }
  else { const existing = getVermietungById(id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("vermietungen", id, u); }
}

export function deleteVermietung(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<VermietungPipeline[]>(LS_KEY, []).filter(v => v.id !== id)); }
  else { cacheDelete("vermietungen", id); }
}
