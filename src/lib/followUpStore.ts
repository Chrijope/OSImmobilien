import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheFilter } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export interface FollowUp {
  id: string; kundeId: string; kundeName: string; berater: string; pipelineStufe: string;
  typ: "anruf" | "email" | "meeting" | "erinnerung"; titel: string; beschreibung: string;
  faelligAm: string; erstelltAm: string; erledigtAm?: string;
  status: "offen" | "erledigt" | "ueberfallig"; prioritaet: "niedrig" | "mittel" | "hoch"; automatisch: boolean;
}

export interface FollowUpKette { id: string; name: string; pipelineStufe: string; schritte: FollowUpSchritt[]; aktiv: boolean; }
export interface FollowUpSchritt { id: string; tageNachEvent: number; typ: "anruf" | "email" | "meeting" | "erinnerung"; titel: string; beschreibung: string; prioritaet: "niedrig" | "mittel" | "hoch"; }

const LS_FU = "mi_followups";
const LS_KE = "mi_followup_ketten";

function fuToDb(f: FollowUp): Record<string, any> {
  return { id: f.id, kunde_id: f.kundeId, kunde_name: f.kundeName, berater: f.berater, pipeline_stufe: f.pipelineStufe, typ: f.typ, titel: f.titel, beschreibung: f.beschreibung, faellig_am: f.faelligAm, erstellt_am: f.erstelltAm, erledigt_am: f.erledigtAm || null, status: f.status, prioritaet: f.prioritaet, automatisch: f.automatisch };
}
function fuFromDb(r: any): FollowUp {
  return { id: r.id, kundeId: r.kunde_id, kundeName: r.kunde_name || "", berater: r.berater || "", pipelineStufe: r.pipeline_stufe || "", typ: r.typ || "anruf", titel: r.titel, beschreibung: r.beschreibung || "", faelligAm: r.faellig_am || "", erstelltAm: r.erstellt_am || "", erledigtAm: r.erledigt_am || undefined, status: r.status || "offen", prioritaet: r.prioritaet || "mittel", automatisch: r.automatisch || false };
}
function keToDb(k: FollowUpKette): Record<string, any> {
  return { id: k.id, name: k.name, pipeline_stufe: k.pipelineStufe, schritte: k.schritte, aktiv: k.aktiv };
}
function keFromDb(r: any): FollowUpKette {
  return { id: r.id, name: r.name, pipelineStufe: r.pipeline_stufe || "", schritte: r.schritte || [], aktiv: r.aktiv !== false };
}

function defaultKetten(): FollowUpKette[] {
  return [
    { id: "fk-erstgespraech", name: "Nach Erstgespräch", pipelineStufe: "erstgespraech_geplant", aktiv: true, schritte: [
      { id: "s1", tageNachEvent: 1, typ: "email", titel: "Danke-Mail senden", beschreibung: "Persönliche Danke-Mail nach Erstgespräch", prioritaet: "hoch" },
      { id: "s2", tageNachEvent: 3, typ: "anruf", titel: "Nachfass-Anruf", beschreibung: "Rückfragen klären", prioritaet: "hoch" },
      { id: "s3", tageNachEvent: 7, typ: "email", titel: "Unterlagen zusenden", beschreibung: "Passende Objektunterlagen zusenden", prioritaet: "mittel" },
      { id: "s4", tageNachEvent: 14, typ: "anruf", titel: "Entscheidung nachfragen", beschreibung: "Hat sich der Interessent beschäftigt?", prioritaet: "hoch" },
    ]},
    { id: "fk-bonitaet", name: "Bonitätsunterlagen angefordert", pipelineStufe: "bonitaetsunterlagen", aktiv: true, schritte: [
      { id: "s1", tageNachEvent: 2, typ: "erinnerung", titel: "Erinnerung Unterlagen", beschreibung: "Freundliche Erinnerung", prioritaet: "mittel" },
      { id: "s2", tageNachEvent: 5, typ: "anruf", titel: "Telefonische Nachfrage", beschreibung: "Probleme bei Zusammenstellung?", prioritaet: "hoch" },
    ]},
    { id: "fk-reservierung", name: "Nach Reservierung", pipelineStufe: "reservierung", aktiv: true, schritte: [
      { id: "s1", tageNachEvent: 1, typ: "email", titel: "Reservierungsbestätigung", beschreibung: "Schriftliche Bestätigung", prioritaet: "hoch" },
      { id: "s2", tageNachEvent: 3, typ: "anruf", titel: "Finanzierung besprechen", beschreibung: "Finanzierungsoptionen klären", prioritaet: "hoch" },
    ]},
    { id: "fk-aftersales", name: "Nach Abschluss", pipelineStufe: "faelligkeit", aktiv: true, schritte: [
      { id: "s1", tageNachEvent: 1, typ: "anruf", titel: "Glückwunsch-Anruf", beschreibung: "Herzlichen Glückwunsch!", prioritaet: "hoch" },
      { id: "s2", tageNachEvent: 7, typ: "email", titel: "Empfehlungsprogramm vorstellen", beschreibung: "Empfehlungsprogramm mit Prämie", prioritaet: "mittel" },
      { id: "s3", tageNachEvent: 30, typ: "anruf", titel: "Zufriedenheits-Check", beschreibung: "Wie geht es dem Kunden?", prioritaet: "mittel" },
    ]},
  ];
}

export function getFollowUps(): FollowUp[] {
  const heute = new Date().toISOString().split("T")[0];
  const markUeberfaellig = (f: FollowUp): FollowUp =>
    f.status === "offen" && f.faelligAm && f.faelligAm < heute
      ? { ...f, status: "ueberfallig" }
      : f;
  if (isTestAccount()) {
    return localGet<FollowUp[]>(LS_FU, [])
      .map(markUeberfaellig)
      .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
  }
  return cacheGet("follow_ups")
    .map(fuFromDb)
    .map(markUeberfaellig)
    .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));
}

export function getFollowUpsByKunde(kundeId: string): FollowUp[] {
  return getFollowUps().filter(f => f.kundeId === kundeId);
}

/**
 * Ein Follow-up zusaetzlich als Erinnerung in den eigenen Kalender des
 * Mitarbeiters schreiben, sofern er Google oder iCloud verbunden hat und den
 * Schalter "Follow-up Erinnerungen" nicht abgeschaltet hat.
 *
 * Bewusst nebenher und ohne Warten, genau wie beim Termin-Abgleich: Ein
 * hakeliger Kalenderdienst darf das Anlegen im CRM nicht aufhalten und erst
 * recht nicht scheitern lassen. Fehler landen nur in der Konsole.
 *
 * Die Kennung des Kalendereintrags wird nicht zurueckgeschrieben, die Tabelle
 * `follow_ups` hat dafuer keine Spalte. Ein spaeter erledigtes oder geloeschtes
 * Follow-up bleibt deshalb im Kalender stehen.
 */
function uebertrageFollowUpInKalender(fu: FollowUp): void {
  if (!fu.faelligAm || isTestAccount()) return;

  void (async () => {
    try {
      const { legeTerminAn, followUpTerminDaten } = await import("./kalenderSync");
      const daten = followUpTerminDaten(fu);
      if (!daten) return;
      await legeTerminAn(daten, "followUp");
    } catch (e) {
      console.warn("Follow-up nicht in den Kalender uebertragen:", e);
    }
  })();
}

export function addFollowUp(data: Omit<FollowUp, "id" | "erstelltAm" | "status">): FollowUp {
  const fu: FollowUp = { ...data, id: crypto.randomUUID(), erstelltAm: new Date().toISOString(), status: "offen" };
  if (isTestAccount()) { const all = localGet<FollowUp[]>(LS_FU, []); all.push(fu); localSet(LS_FU, all); }
  else { cacheInsert("follow_ups", fuToDb(fu)); uebertrageFollowUpInKalender(fu); }
  return fu;
}

/**
 * Erledigt ein Follow-up.
 *
 * Gibt ein Versprechen zurück, damit der Aufrufer auf das Speichern warten und
 * einen Fehler mit dem echten Grund melden kann. Wer den Rückgabewert nicht
 * braucht, ruft die Funktion weiterhin einfach auf.
 */
export async function completeFollowUp(id: string): Promise<void> {
  if (isTestAccount()) {
    const all = localGet<FollowUp[]>(LS_FU, []);
    const idx = all.findIndex(f => f.id === id);
    if (idx >= 0) { all[idx].status = "erledigt"; all[idx].erledigtAm = new Date().toISOString(); localSet(LS_FU, all); }
    return;
  }
  await cacheUpdate("follow_ups", id, { status: "erledigt", erledigt_am: new Date().toISOString() });
}

/** Nimmt das Erledigen zurück, siehe completeFollowUp. */
export async function uncompleteFollowUp(id: string): Promise<void> {
  if (isTestAccount()) {
    const all = localGet<FollowUp[]>(LS_FU, []);
    const idx = all.findIndex(f => f.id === id);
    if (idx >= 0) { all[idx].status = "offen"; all[idx].erledigtAm = undefined; localSet(LS_FU, all); }
    return;
  }
  await cacheUpdate("follow_ups", id, { status: "offen", erledigt_am: null });
}

export function deleteFollowUp(id: string) {
  if (isTestAccount()) { localSet(LS_FU, localGet<FollowUp[]>(LS_FU, []).filter(f => f.id !== id)); }
  else { cacheDelete("follow_ups", id); }
}

/**
 * Storniert alle offenen, automatisch erzeugten Follow-Ups eines Kunden,
 * die NICHT zur aktuellen Pipeline-Stufe gehören. Wird beim Stufenwechsel
 * aufgerufen, damit alte Erinnerungen nicht "überfällig" auflaufen.
 */
export function cancelStaleAutoFollowUps(kundeId: string, neueStufe: string): number {
  const all = getFollowUps().filter(
    f => f.kundeId === kundeId
      && f.automatisch
      && (f.status === "offen" || f.status === "ueberfallig")
      && f.pipelineStufe !== neueStufe
  );
  all.forEach(f => deleteFollowUp(f.id));
  return all.length;
}

export function getFollowUpKetten(): FollowUpKette[] {
  if (isTestAccount()) {
    const data = localGet<FollowUpKette[]>(LS_KE, []);
    return data.length > 0 ? data : defaultKetten();
  }
  const rows = cacheGet("follow_up_ketten").map(keFromDb);
  return rows.length > 0 ? rows : defaultKetten();
}

export function toggleKette(id: string) {
  if (isTestAccount()) {
    const all = getFollowUpKetten();
    const idx = all.findIndex(k => k.id === id);
    if (idx >= 0) { all[idx].aktiv = !all[idx].aktiv; localSet(LS_KE, all); }
  } else {
    const row = cacheGet("follow_up_ketten").find((r: any) => r.id === id);
    if (row) cacheUpdate("follow_up_ketten", id, { aktiv: !row.aktiv });
  }
}

export function generateFollowUpsFromKette(kundeId: string, kundeName: string, berater: string, pipelineStufe: string) {
  const ketten = getFollowUpKetten().filter(k => k.aktiv && k.pipelineStufe === pipelineStufe);
  const created: FollowUp[] = [];
  ketten.forEach(kette => {
    kette.schritte.forEach(schritt => {
      const faellig = new Date(); faellig.setDate(faellig.getDate() + schritt.tageNachEvent);
      const fu = addFollowUp({ kundeId, kundeName, berater, pipelineStufe, typ: schritt.typ, titel: schritt.titel, beschreibung: schritt.beschreibung, faelligAm: faellig.toISOString().split("T")[0], prioritaet: schritt.prioritaet, automatisch: true });
      created.push(fu);
    });
  });
  return created;
}

export function getKundenOhneKontakt(tage: number = 14) {
  const allFU = getFollowUps();
  const kundenMap = new Map<string, { kundeName: string; berater: string; letzterKontakt: string }>();
  allFU.forEach(f => { const existing = kundenMap.get(f.kundeId); const datum = f.erledigtAm || f.erstelltAm; if (!existing || datum > existing.letzterKontakt) kundenMap.set(f.kundeId, { kundeName: f.kundeName, berater: f.berater, letzterKontakt: datum }); });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - tage);
  return Array.from(kundenMap.entries()).filter(([, v]) => v.letzterKontakt < cutoff.toISOString()).map(([kundeId, v]) => ({ kundeId, ...v }));
}

export function seedFollowUps() { /* No-op in live mode */ }
