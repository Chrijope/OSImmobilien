import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type HvTicketKategorie = "schaden" | "wartung" | "anfrage" | "notfall";
export type HvTicketPrioritaet = "niedrig" | "mittel" | "hoch" | "dringend";
export type HvTicketStatus = "neu" | "in_bearbeitung" | "beauftragt" | "erledigt";

export interface HvTicket {
  id: string; objektId: string; objektName: string; wohneinheitId: string; wohneinheitName: string;
  mieterId: string; mieterName: string; kategorie: HvTicketKategorie; prioritaet: HvTicketPrioritaet;
  titel: string; beschreibung: string; zugewiesenerDienstleisterId: string; zugewiesenerDienstleisterName: string;
  status: HvTicketStatus; erstelltAm: string; aktualisiertAm: string;
}

const LS_KEY = "mi_hv_tickets";

function toDb(t: HvTicket): Record<string, any> {
  return { id: t.id, titel: t.titel, beschreibung: t.beschreibung, kategorie: t.kategorie, prioritaet: t.prioritaet, status: t.status, objekt: t.objektId, wohnung: t.wohneinheitId, melder: t.mieterName, zugewiesen_an: t.zugewiesenerDienstleisterName, erstellt_am: t.erstelltAm, aktualisiert_am: t.aktualisiertAm, meta: { objektName: t.objektName, wohneinheitName: t.wohneinheitName, mieterId: t.mieterId, mieterName: t.mieterName, zugewiesenerDienstleisterId: t.zugewiesenerDienstleisterId, zugewiesenerDienstleisterName: t.zugewiesenerDienstleisterName } };
}

function fromDb(r: any): HvTicket {
  const meta = r.meta || {};
  return { id: r.id, objektId: r.objekt || "", objektName: meta.objektName || r.objekt || "", wohneinheitId: r.wohnung || "", wohneinheitName: meta.wohneinheitName || r.wohnung || "", mieterId: meta.mieterId || "", mieterName: meta.mieterName || r.melder || "", kategorie: r.kategorie || "anfrage", prioritaet: r.prioritaet || "mittel", titel: r.titel, beschreibung: r.beschreibung || "", zugewiesenerDienstleisterId: meta.zugewiesenerDienstleisterId || "", zugewiesenerDienstleisterName: meta.zugewiesenerDienstleisterName || r.zugewiesen_an || "", status: r.status || "neu", erstelltAm: r.erstellt_am || "", aktualisiertAm: r.aktualisiert_am || "" };
}

export function getHvTickets(): HvTicket[] {
  if (isTestAccount()) return localGet<HvTicket[]>(LS_KEY, []);
  return cacheGet("hv_tickets").map(fromDb);
}
export function getHvTicketById(id: string) {
  if (isTestAccount()) return localGet<HvTicket[]>(LS_KEY, []).find(t => t.id === id);
  const row = cacheGet("hv_tickets").find((r: any) => r.id === id);
  return row ? fromDb(row) : undefined;
}

export function addHvTicket(t: Omit<HvTicket, "id" | "erstelltAm" | "aktualisiertAm">): HvTicket {
  const now = new Date().toISOString().split("T")[0];
  const neu: HvTicket = { ...t, id: crypto.randomUUID(), erstelltAm: now, aktualisiertAm: now };
  if (isTestAccount()) { const all = localGet<HvTicket[]>(LS_KEY, []); all.push(neu); localSet(LS_KEY, all); }
  else { cacheInsert("hv_tickets", toDb(neu)); }
  return neu;
}

export function updateHvTicket(id: string, updates: Partial<HvTicket>) {
  if (isTestAccount()) {
    const all = localGet<HvTicket[]>(LS_KEY, []); const idx = all.findIndex(t => t.id === id);
    if (idx >= 0) { all[idx] = { ...all[idx], ...updates, aktualisiertAm: new Date().toISOString().split("T")[0] }; localSet(LS_KEY, all); }
  } else {
    const existing = getHvTicketById(id); if (!existing) return;
    const merged = { ...existing, ...updates }; const { id: _id, ...dbUpdates } = toDb(merged);
    cacheUpdate("hv_tickets", id, dbUpdates);
  }
}

export function deleteHvTicket(id: string) {
  if (isTestAccount()) { localSet(LS_KEY, localGet<HvTicket[]>(LS_KEY, []).filter(t => t.id !== id)); }
  else { cacheDelete("hv_tickets", id); }
}

export const HV_KATEGORIEN: { value: HvTicketKategorie; label: string }[] = [
  { value: "schaden", label: "Schaden" }, { value: "wartung", label: "Wartung" },
  { value: "anfrage", label: "Anfrage" }, { value: "notfall", label: "Notfall" },
];
export const HV_PRIORITAETEN: { value: HvTicketPrioritaet; label: string }[] = [
  { value: "niedrig", label: "Niedrig" }, { value: "mittel", label: "Mittel" },
  { value: "hoch", label: "Hoch" }, { value: "dringend", label: "Dringend" },
];
