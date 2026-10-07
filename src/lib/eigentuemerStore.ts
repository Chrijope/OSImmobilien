import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheRefreshTable, isTableLoaded } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface Eigentuemer {
  id: string; name: string; typ: "privatperson" | "gesellschaft" | "weg"; anrede: string;
  email: string; telefon: string; strasse: string; plz: string; ort: string;
  steuernummer: string; bankIban: string; bankBic: string;
  verwaltervertragBeginn: string; verwaltervertragEnde: string; verwalterhonorar: number; kuendigungsfrist: string;
  objektIds: string[]; objektNamen: string[];
  wirtschaftsplanJahr: number; wirtschaftsplanBetrag: number;
  instandhaltungsruecklage: number; ruecklageSollMonatlich: number; notizen: string; erstelltAm: string;
  herkunftVertrieb?: boolean; herkunftKontaktId?: string; herkunftInvestmentId?: string; herkunftKontaktName?: string; herkunftNotarDatum?: string;
}

export interface EigentuemerBeschluss { id: string; eigentuemerId: string; datum: string; titel: string; beschreibung: string; ergebnis: "angenommen" | "abgelehnt" | "vertagt"; stimmenDafuer: number; stimmenDagegen: number; enthaltungen: number; }

const LS_ET = "mi_eigentuemer";
const LS_BESCHLUSS = "mi_et_beschluesse";

function toDb(e: Eigentuemer): Record<string, any> {
  return { id: e.id, name: e.name, email: e.email, telefon: e.telefon, adresse: [e.strasse, e.plz, e.ort].filter(Boolean).join(", "), objekte: e.objektIds, notizen: e.notizen, erstellt_am: e.erstelltAm, meta: { typ: e.typ, anrede: e.anrede, strasse: e.strasse, plz: e.plz, ort: e.ort, steuernummer: e.steuernummer, bankIban: e.bankIban, bankBic: e.bankBic, verwaltervertragBeginn: e.verwaltervertragBeginn, verwaltervertragEnde: e.verwaltervertragEnde, verwalterhonorar: e.verwalterhonorar, kuendigungsfrist: e.kuendigungsfrist, objektNamen: e.objektNamen, wirtschaftsplanJahr: e.wirtschaftsplanJahr, wirtschaftsplanBetrag: e.wirtschaftsplanBetrag, instandhaltungsruecklage: e.instandhaltungsruecklage, ruecklageSollMonatlich: e.ruecklageSollMonatlich, herkunftVertrieb: e.herkunftVertrieb, herkunftKontaktId: e.herkunftKontaktId, herkunftInvestmentId: e.herkunftInvestmentId, herkunftKontaktName: e.herkunftKontaktName, herkunftNotarDatum: e.herkunftNotarDatum } };
}

function fromDb(r: any): Eigentuemer {
  const meta = r.meta || {};
  return { id: r.id, name: r.name || "", typ: meta.typ || "privatperson", anrede: meta.anrede || "", email: r.email || "", telefon: r.telefon || "", strasse: meta.strasse || "", plz: meta.plz || "", ort: meta.ort || "", steuernummer: meta.steuernummer || "", bankIban: meta.bankIban || "", bankBic: meta.bankBic || "", verwaltervertragBeginn: meta.verwaltervertragBeginn || "", verwaltervertragEnde: meta.verwaltervertragEnde || "", verwalterhonorar: meta.verwalterhonorar || 0, kuendigungsfrist: meta.kuendigungsfrist || "", objektIds: r.objekte || [], objektNamen: meta.objektNamen || [], wirtschaftsplanJahr: meta.wirtschaftsplanJahr || 0, wirtschaftsplanBetrag: meta.wirtschaftsplanBetrag || 0, instandhaltungsruecklage: meta.instandhaltungsruecklage || 0, ruecklageSollMonatlich: meta.ruecklageSollMonatlich || 0, notizen: r.notizen || "", erstelltAm: r.erstellt_am || "", herkunftVertrieb: meta.herkunftVertrieb, herkunftKontaktId: meta.herkunftKontaktId, herkunftInvestmentId: meta.herkunftInvestmentId, herkunftKontaktName: meta.herkunftKontaktName, herkunftNotarDatum: meta.herkunftNotarDatum };
}

export const EIGENTUEMER_TYPEN: { value: Eigentuemer["typ"]; label: string }[] = [
  { value: "privatperson", label: "Privatperson" }, { value: "gesellschaft", label: "Gesellschaft / GmbH" }, { value: "weg", label: "WEG" },
];

export function getEigentuemer(): Eigentuemer[] {
  if (isTestAccount()) return localGet<Eigentuemer[]>(LS_ET, []);
  return cacheGet("eigentuemer").map(fromDb);
}
export function getEigentuemerById(id: string): Eigentuemer | undefined {
  if (isTestAccount()) return localGet<Eigentuemer[]>(LS_ET, []).find(e => e.id === id);
  const row = cacheGet("eigentuemer").find((r: any) => r.id === id); return row ? fromDb(row) : undefined;
}

export function addEigentuemer(e: Omit<Eigentuemer, "id" | "erstelltAm">): Eigentuemer {
  const neu: Eigentuemer = { ...e, id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  if (isTestAccount()) { const all = localGet<Eigentuemer[]>(LS_ET, []); all.push(neu); localSet(LS_ET, all); }
  else { cacheInsert("eigentuemer", toDb(neu)); }
  return neu;
}

export function updateEigentuemer(id: string, updates: Partial<Eigentuemer>) {
  if (isTestAccount()) { const all = localGet<Eigentuemer[]>(LS_ET, []); const idx = all.findIndex(e => e.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...updates }; localSet(LS_ET, all); } }
  else { const existing = getEigentuemerById(id); if (!existing) return; const merged = { ...existing, ...updates }; const { id: _id, ...u } = toDb(merged); cacheUpdate("eigentuemer", id, u); }
}

export function deleteEigentuemer(id: string) {
  if (isTestAccount()) { localSet(LS_ET, localGet<Eigentuemer[]>(LS_ET, []).filter(e => e.id !== id)); }
  else { cacheDelete("eigentuemer", id); }
}

export interface UebernahmeAngaben { kontaktId: string; kontaktName: string; anrede: string; email: string; telefon: string; strasse: string; plz: string; ort: string; investmentId: string; objektId?: string; objektName?: string; notarDatum?: string; }

function eigentuemerAusAngaben(opts: UebernahmeAngaben): Omit<Eigentuemer, "id" | "erstelltAm"> {
  return { name: opts.kontaktName, typ: "privatperson", anrede: opts.anrede || "", email: opts.email || "", telefon: opts.telefon || "", strasse: opts.strasse || "", plz: opts.plz || "", ort: opts.ort || "", steuernummer: "", bankIban: "", bankBic: "", verwaltervertragBeginn: "", verwaltervertragEnde: "", verwalterhonorar: 0, kuendigungsfrist: "3 Monate", objektIds: opts.objektId ? [opts.objektId] : [], objektNamen: opts.objektName ? [opts.objektName] : [], wirtschaftsplanJahr: new Date().getFullYear(), wirtschaftsplanBetrag: 0, instandhaltungsruecklage: 0, ruecklageSollMonatlich: 0, notizen: `Automatisch übernommen aus Vertrieb (Notar: ${opts.notarDatum || "ohne Datum"})`, herkunftVertrieb: true, herkunftKontaktId: opts.kontaktId, herkunftInvestmentId: opts.investmentId, herkunftKontaktName: opts.kontaktName, herkunftNotarDatum: opts.notarDatum || "" };
}

export function transferFromVertrieb(opts: UebernahmeAngaben): Eigentuemer | null {
  const existing = getEigentuemer().find(e => e.herkunftKontaktId === opts.kontaktId && e.herkunftInvestmentId === opts.investmentId);
  if (existing) return existing;
  return addEigentuemer(eigentuemerAusAngaben(opts));
}

export type UebernahmeErgebnis = { ok: true; id: string } | { ok: false; grund: string };

type RpcAufruf = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

const standardRpc: RpcAufruf = async (name, args) => {
  const { supabase } = await import("@/integrations/supabase/client");
  // Die Funktion steht erst nach der Migration in den erzeugten Typen.
  return (supabase as unknown as { rpc: RpcAufruf }).rpc(name, args);
};

function fehlerCode(fehler: unknown): string {
  return String((fehler as { code?: unknown } | null)?.code ?? "");
}

function fehlerText(fehler: unknown): string {
  const text = (fehler as { message?: unknown } | null)?.message;
  return typeof text === "string" ? text : String(fehler);
}

/** Satz für den Schirm, ohne Punkt am Ende. */
export function lesbarerUebernahmeGrund(fehler: unknown): string {
  const text = fehlerText(fehler);
  if (fehlerCode(fehler) === "42501" || /row-level security|permission denied|keine berechtigung|not authorized/i.test(text)) {
    return "Keine Berechtigung, den Eigentümer in der Hausverwaltung anzulegen";
  }
  if (/failed to fetch|network|load failed/i.test(text)) return "Keine Verbindung zum Server";
  return text.trim().replace(/\.$/, "") || "Unbekannter Fehler";
}

/**
 * Übernimmt den Käufer nach dem Notartermin als Eigentümer in die
 * Hausverwaltung und meldet erst danach Erfolg.
 *
 * Seit 20260930120000 dürfen nur Hausverwaltung, Admin und Inhaber direkt in
 * `eigentuemer` anlegen. Partner und Backoffice gehen deshalb über die
 * geprüfte Funktion `eigentuemer_aus_investment` (Migration
 * 20261004160000). Sie legt je Investment genau einmal an. Fehlt sie noch,
 * gilt der alte direkte Weg, jetzt aber mit Warten auf die Datenbank.
 */
export async function eigentuemerAusInvestment(
  angaben: UebernahmeAngaben,
  rpc: RpcAufruf = standardRpc,
): Promise<UebernahmeErgebnis> {
  if (isTestAccount()) {
    const e = transferFromVertrieb(angaben);
    return e ? { ok: true, id: e.id } : { ok: false, grund: "Unbekannter Fehler" };
  }

  let antwort: { data: unknown; error: unknown };
  try {
    antwort = await rpc("eigentuemer_aus_investment", { _investment_id: angaben.investmentId });
  } catch (e) {
    return { ok: false, grund: lesbarerUebernahmeGrund(e) };
  }

  if (!antwort.error && typeof antwort.data === "string" && antwort.data) {
    if (isTableLoaded("eigentuemer")) void cacheRefreshTable("eigentuemer");
    return { ok: true, id: antwort.data };
  }

  const code = fehlerCode(antwort.error);
  if (antwort.error && code !== "PGRST202" && code !== "42883") {
    console.error("eigentuemer_aus_investment:", antwort.error);
    return { ok: false, grund: lesbarerUebernahmeGrund(antwort.error) };
  }
  if (!antwort.error) return { ok: false, grund: "Unerwartete Antwort vom Server" };

  // Rückfall, solange die Migration fehlt: direkt anlegen und auf die
  // Datenbank warten. Klappt für Admin, Inhaber und Hausverwaltung.
  const vorhanden = getEigentuemer().find(e => e.herkunftInvestmentId === angaben.investmentId);
  if (vorhanden) return { ok: true, id: vorhanden.id };
  const neu: Eigentuemer = { ...eigentuemerAusAngaben(angaben), id: crypto.randomUUID(), erstelltAm: new Date().toISOString().split("T")[0] };
  try {
    await cacheInsert("eigentuemer", toDb(neu), { silent: true });
    return { ok: true, id: neu.id };
  } catch (e) {
    return { ok: false, grund: lesbarerUebernahmeGrund(e) };
  }
}

// Beschlüsse – now stored in eigentuemer meta._beschluesse
export function getBeschluesse(eigentuemerId: string): EigentuemerBeschluss[] {
  if (isTestAccount()) return localGet<EigentuemerBeschluss[]>(LS_BESCHLUSS, []).filter(b => b.eigentuemerId === eigentuemerId);
  const row = cacheGet("eigentuemer").find((r: any) => r.id === eigentuemerId);
  if (!row) return [];
  return ((row.meta || {})._beschluesse as EigentuemerBeschluss[]) || [];
}

export function addBeschluss(b: Omit<EigentuemerBeschluss, "id">): EigentuemerBeschluss {
  const neu: EigentuemerBeschluss = { ...b, id: `beschl-${Date.now()}` };
  if (isTestAccount()) {
    const all = localGet<EigentuemerBeschluss[]>(LS_BESCHLUSS, []);
    all.push(neu); localSet(LS_BESCHLUSS, all); return neu;
  }
  const row = cacheGet("eigentuemer").find((r: any) => r.id === b.eigentuemerId);
  if (row) {
    const meta = { ...(row.meta || {}), _beschluesse: [...((row.meta || {})._beschluesse || []), neu] };
    cacheUpdate("eigentuemer", b.eigentuemerId, { meta });
  }
  return neu;
}
