import { cacheGet, cacheInsert, cacheUpdate, cacheDelete } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { normalizePipelineStufe, getEffectivePipelineStufe } from "./kontaktPipeline";
import type { KundeData } from "./kundenStore";

export interface EmpfehlungsProgramm {
  id: string; investmentId: string; kontaktId: string; kontaktName: string; beraterName: string;
  provisionsTyp: "fest" | "prozent"; provisionsBetrag: number; provisionsText: string; bedingungen: string;
  freigeschaltet: boolean; erstellt_am: string;
}

/**
 * Alle Statuswerte einer Empfehlung.
 *
 * "neu" und "offen" sind fachlich dasselbe ("neu" wird beim ersten Ansehen der
 * Empfehlungsseite auf "offen" gestellt). "dublette" vergibt die RPC
 * create_empfehlung_kontakt, wenn der empfohlene Kontakt schon existiert.
 */
export type EmpfehlungStatus =
  | "neu" | "offen" | "kontaktiert" | "termin"
  | "in_beratung" | "in_abwicklung" | "abgeschlossen" | "verloren" | "dublette";

export interface Empfehlung {
  id: string; programmId: string; investmentId: string; kontaktId: string; kontaktName: string;
  name: string; email: string; telefon: string; beziehung: string; anmerkungen?: string;
  erstellt_am: string; status: EmpfehlungStatus;
}

/** Alle Statuswerte als Liste, fuer Dropdowns und Vollstaendigkeits-Tests. */
export const ALLE_EMPFEHLUNG_STATUS: EmpfehlungStatus[] = [
  "neu", "offen", "kontaktiert", "termin",
  "in_beratung", "in_abwicklung", "abgeschlossen", "verloren", "dublette",
];

/**
 * Anzeige der Statuswerte in den internen Oberflaechen (Empfehlungsseite,
 * Kundenprofil). Zentral gehalten, damit ein neuer Statuswert nicht wieder
 * als "Unbekannt" durchrutscht; ein Test prueft die Vollstaendigkeit.
 */
export const EMPFEHLUNG_STATUS_CONFIG: Record<EmpfehlungStatus, { label: string; color: string }> = {
  neu: { label: "Neu", color: "bg-info/15 text-info border-info/30" },
  offen: { label: "Offen", color: "bg-info/15 text-info border-info/30" },
  kontaktiert: { label: "Kontaktiert", color: "bg-warning/15 text-warning border-warning/30" },
  termin: { label: "Termin", color: "bg-primary/15 text-primary border-primary/30" },
  in_beratung: { label: "In Beratung", color: "bg-primary/15 text-primary border-primary/30" },
  in_abwicklung: { label: "Abschluss in Abwicklung", color: "bg-warning/15 text-warning border-warning/30" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-success/15 text-success border-success/30" },
  verloren: { label: "Verloren", color: "bg-destructive/15 text-destructive border-destructive/30" },
  dublette: { label: "Bereits bekannt", color: "bg-muted text-muted-foreground" },
};

/** Nur die Labels, fuer Stellen ohne Farbbedarf (z. B. Kundenprofil). */
export const EMPFEHLUNG_STATUS_LABEL: Record<EmpfehlungStatus, string> = Object.fromEntries(
  Object.entries(EMPFEHLUNG_STATUS_CONFIG).map(([status, cfg]) => [status, cfg.label]),
) as Record<EmpfehlungStatus, string>;

/**
 * i18n-Schluessel fuer die Statusanzeige im Kundenportal
 * (KundeEmpfehlungen.tsx). Die Texte selbst stehen in
 * src/i18n/locales/de.json und en.json unter portal.empfehlungen.*.
 */
export const PORTAL_STATUS_TEXT_KEY: Record<EmpfehlungStatus, string> = {
  neu: "portal.empfehlungen.status_submitted",
  offen: "portal.empfehlungen.status_submitted",
  kontaktiert: "portal.empfehlungen.status_in_progress",
  termin: "portal.empfehlungen.status_appointment",
  in_beratung: "portal.empfehlungen.status_in_consultation",
  in_abwicklung: "portal.empfehlungen.status_in_closing",
  abgeschlossen: "portal.empfehlungen.status_completed",
  verloren: "portal.empfehlungen.status_lost",
  dublette: "portal.empfehlungen.status_duplicate",
};

/**
 * Grobe Statusgruppen fuer das Tippgeber-Portal. Tippgeber sehen keine
 * internen Stufennamen, sondern nur diese Gruppen. "dublette" kommt dort
 * nicht vor, weil die Gruppierung direkt aus der Pipelinestufe des
 * geworbenen Kontakts abgeleitet wird.
 */
export type TippgeberGruppe = Exclude<EmpfehlungStatus, "neu" | "dublette">;

export const TIPPGEBER_GRUPPE_LABEL: Record<TippgeberGruppe, string> = {
  offen: "Eingegangen",
  kontaktiert: "Kontakt aufgenommen",
  termin: "Im Gespräch",
  in_beratung: "In Beratung",
  in_abwicklung: "Abschluss in Abwicklung",
  abgeschlossen: "Abgeschlossen",
  verloren: "Nicht zustande gekommen",
};

/**
 * Ordnet eine Pipelinestufe der groben Portal-Gruppe zu. Unbekannte oder
 * fehlende Stufen gelten als "Eingegangen", damit ein frisch angelegter
 * Kontakt ohne Stufe nicht aus der Uebersicht faellt.
 */
export function tippgeberGruppeFuerStufe(stufe: string | null | undefined, archiviert?: boolean): TippgeberGruppe {
  if (archiviert) return "verloren";
  const status = pipelineToEmpfehlungStatus(stufe);
  if (!status || status === "neu" || status === "dublette") return "offen";
  return status;
}

/**
 * Meta-Objekt einer Empfehlung sicher zusammenfuehren statt ersetzen.
 * Frueher ueberschrieb der Statuswechsel auf der Empfehlungsseite das ganze
 * meta-Objekt und verlor dabei Felder wie neuerKontaktId.
 */
export function mergeEmpfehlungMeta(bestehend: unknown, patch: Record<string, any>): Record<string, any> {
  const basis = (bestehend && typeof bestehend === "object" && !Array.isArray(bestehend))
    ? bestehend as Record<string, any>
    : {};
  return { ...basis, ...patch };
}

const LS_PROG = "mi_empfehlungsprogramme";
const LS_EMP = "mi_empfehlungen";

function progToDb(p: EmpfehlungsProgramm): Record<string, any> {
  return { id: p.id, name: p.kontaktName, aktiv: p.freigeschaltet, praemie: p.provisionsText, beschreibung: p.bedingungen, erstellt_am: p.erstellt_am, meta: { investmentId: p.investmentId, kontaktId: p.kontaktId, kontaktName: p.kontaktName, beraterName: p.beraterName, provisionsTyp: p.provisionsTyp, provisionsBetrag: p.provisionsBetrag, provisionsText: p.provisionsText, bedingungen: p.bedingungen, freigeschaltet: p.freigeschaltet } };
}
function progFromDb(r: any): EmpfehlungsProgramm {
  const meta = r.meta || {};
  return { id: r.id, investmentId: meta.investmentId || "", kontaktId: meta.kontaktId || "", kontaktName: meta.kontaktName || r.name || "", beraterName: meta.beraterName || "", provisionsTyp: meta.provisionsTyp || "fest", provisionsBetrag: meta.provisionsBetrag || 0, provisionsText: meta.provisionsText || r.praemie || "", bedingungen: meta.bedingungen || r.beschreibung || "", freigeschaltet: meta.freigeschaltet ?? r.aktiv ?? false, erstellt_am: r.erstellt_am || "" };
}

function empToDb(e: Empfehlung): Record<string, any> {
  return { id: e.id, empfohlen_name: e.name, empfohlen_email: e.email, empfohlen_telefon: e.telefon, empfohlen_von: e.kontaktName, status: e.status, erstellt_am: e.erstellt_am, meta: { programmId: e.programmId, investmentId: e.investmentId, kontaktId: e.kontaktId, kontaktName: e.kontaktName, beziehung: e.beziehung, anmerkungen: e.anmerkungen } };
}
function empFromDb(r: any): Empfehlung {
  const meta = r.meta || {};
  return { id: r.id, programmId: meta.programmId || "", investmentId: meta.investmentId || "", kontaktId: meta.kontaktId || "", kontaktName: meta.kontaktName || r.empfohlen_von || "", name: r.empfohlen_name || "", email: r.empfohlen_email || "", telefon: r.empfohlen_telefon || "", beziehung: meta.beziehung || "", anmerkungen: meta.anmerkungen, erstellt_am: r.erstellt_am || "", status: r.status || "neu" };
}

export function getProgrammByInvestment(investmentId: string): EmpfehlungsProgramm | undefined {
  if (isTestAccount()) return localGet<EmpfehlungsProgramm[]>(LS_PROG, []).find(p => p.investmentId === investmentId);
  return cacheGet("empfehlungsprogramme").map(progFromDb).find(p => p.investmentId === investmentId);
}

export function createProgramm(data: Omit<EmpfehlungsProgramm, "id" | "erstellt_am">): EmpfehlungsProgramm {
  const prog: EmpfehlungsProgramm = { ...data, id: crypto.randomUUID(), erstellt_am: new Date().toISOString() };
  if (isTestAccount()) { const all = localGet<EmpfehlungsProgramm[]>(LS_PROG, []); all.push(prog); localSet(LS_PROG, all); }
  else { cacheInsert("empfehlungsprogramme", progToDb(prog)); }
  return prog;
}

export function updateProgramm(id: string, fields: Partial<EmpfehlungsProgramm>) {
  if (isTestAccount()) { const all = localGet<EmpfehlungsProgramm[]>(LS_PROG, []); const idx = all.findIndex(p => p.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...fields }; localSet(LS_PROG, all); } }
  else { const existing = cacheGet("empfehlungsprogramme").map(progFromDb).find(p => p.id === id); if (!existing) return; const merged = { ...existing, ...fields }; const { id: _id, ...u } = progToDb(merged); cacheUpdate("empfehlungsprogramme", id, u); }
}

export function getEmpfehlungenByProgramm(programmId: string): Empfehlung[] {
  if (isTestAccount()) return localGet<Empfehlung[]>(LS_EMP, []).filter(e => e.programmId === programmId).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  return cacheGet("empfehlungen").map(empFromDb).filter(e => e.programmId === programmId).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
}

export function getEmpfehlungenByInvestment(investmentId: string): Empfehlung[] {
  if (isTestAccount()) return localGet<Empfehlung[]>(LS_EMP, []).filter(e => e.investmentId === investmentId).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  return cacheGet("empfehlungen").map(empFromDb).filter(e => e.investmentId === investmentId).sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
}

export function addEmpfehlung(data: Omit<Empfehlung, "id" | "erstellt_am" | "status">): Empfehlung {
  const emp: Empfehlung = { ...data, id: crypto.randomUUID(), erstellt_am: new Date().toISOString(), status: "neu" };
  if (isTestAccount()) { const all = localGet<Empfehlung[]>(LS_EMP, []); all.push(emp); localSet(LS_EMP, all); }
  else { cacheInsert("empfehlungen", empToDb(emp)); }
  return emp;
}

export function updateEmpfehlungStatus(id: string, status: Empfehlung["status"]) {
  if (isTestAccount()) { const all = localGet<Empfehlung[]>(LS_EMP, []); const idx = all.findIndex(e => e.id === id); if (idx >= 0) { all[idx].status = status; localSet(LS_EMP, all); } }
  else { cacheUpdate("empfehlungen", id, { status }); }
}

/**
 * Ordnung der Statuswerte fuer die Monotonie-Regel: Die Automatik bewegt eine
 * Empfehlung nur vorwaerts, nie rueckwaerts. "neu" und "offen" teilen sich den
 * Rang 0. "verloren" und "dublette" stehen bewusst nicht in der Ordnung, fuer
 * sie gelten Sonderregeln (siehe entscheideEmpfehlungStatusSync).
 */
const STATUS_ORDNUNG: Partial<Record<EmpfehlungStatus, number>> = {
  neu: 0,
  offen: 0,
  kontaktiert: 1,
  termin: 2,
  in_beratung: 3,
  in_abwicklung: 4,
  abgeschlossen: 5,
};

/**
 * Bildet eine Pipelinestufe des Kontakts auf den Empfehlungsstatus ab.
 *
 * Die Stufe wird zuerst durch normalizePipelineStufe geschickt, damit auch
 * Legacy-Werte (zugewiesen, kontaktversuche, vermoegensaufbau, closing,
 * after_sales, notar_mit_gs, notar_ohne_gs) richtig landen. Unbekannte Stufen
 * ergeben null, dann bleibt der Status unangetastet.
 */
export function pipelineToEmpfehlungStatus(stufe: string | null | undefined): EmpfehlungStatus | null {
  const s = normalizePipelineStufe(stufe);
  if (!s) return null;
  switch (s) {
    case "neuer_lead":
    case "bestandsimport":
    // Der zugewiesene Lead ist noch unbearbeitet, also offen.
    case "zugewiesen":
      return "offen";
    case "nicht_erreicht":
    case "erreicht":
    case "follow_up":
    case "eg_noshow":
    // Laufende Kontaktversuche und der Vermögensaufbau-Zweig zählen als
    // kontaktiert. Beide waren früher Aliase und werden jetzt als eigene
    // Stufen geführt, brauchen hier also einen eigenen Fall.
    case "kontaktversuche":
    case "vermoegensaufbau":
      return "kontaktiert";
    case "erstgespraech_geplant":
    case "beratungsgespraech":
    case "bg_noshow":
      return "termin";
    case "selbstauskunft":
    case "objektauswahl":
    case "follow_up_objekt":
      return "in_beratung";
    case "reservierung":
    case "bonitaetsunterlagen":
    case "finanzierung":
    case "notar":
      return "in_abwicklung";
    case "faelligkeit":
    case "abrechnung":
    case "abgeschlossen":
      return "abgeschlossen";
    case "verloren":
    case "archiviert":
      return "verloren";
    default:
      return null;
  }
}

/**
 * Entscheidet, ob und auf welchen Status die Automatik eine Empfehlung stellt.
 * Reine Funktion ohne Datenzugriff, damit sie sich vollstaendig testen laesst.
 *
 * Regeln:
 * - "dublette" wird NIE ueberschrieben.
 * - Manuell gesetzte Status (meta.statusManuell === true) werden nur dann
 *   ueberschrieben, wenn das Ziel "abgeschlossen" oder "verloren" ist.
 * - "verloren" ist von ueberall erreichbar (auch aus "abgeschlossen").
 * - Aus "verloren" heraus folgt die Automatik der Pipeline: Wird der Kontakt
 *   wiederbelebt, darf die Empfehlung wieder aktiv werden.
 * - Sonst gilt strenge Monotonie: offen < kontaktiert < termin < in_beratung
 *   < in_abwicklung < abgeschlossen, nie rueckwaerts, gleicher Rang aendert
 *   nichts.
 *
 * @returns den neuen Status oder null, wenn nichts geaendert werden darf.
 */
export function entscheideEmpfehlungStatusSync(
  aktuellerStatus: string | null | undefined,
  statusManuell: boolean,
  pipelineStufe: string | null | undefined,
): EmpfehlungStatus | null {
  const ziel = pipelineToEmpfehlungStatus(pipelineStufe);
  if (!ziel) return null;
  const aktuell = (aktuellerStatus || "neu") as EmpfehlungStatus;
  if (aktuell === "dublette") return null;
  if (statusManuell && ziel !== "abgeschlossen" && ziel !== "verloren") return null;
  if (ziel === aktuell) return null;
  if (ziel === "verloren") return "verloren";
  if (aktuell === "verloren") return ziel;
  const rangAktuell = STATUS_ORDNUNG[aktuell] ?? 0;
  const rangZiel = STATUS_ORDNUNG[ziel] ?? 0;
  return rangZiel > rangAktuell ? ziel : null;
}

/**
 * Meta-Aenderungen, wenn eine Empfehlung den Status "abgeschlossen" erreicht.
 * Entspricht dem manuellen Weg auf der Empfehlungsseite: Die Praemie wird
 * "berechtigt" (ausser sie ist schon "ausgezahlt") und das Abschlussdatum wird
 * gesetzt, falls es noch fehlt.
 *
 * @returns den Meta-Patch oder null, wenn nichts zu aendern ist.
 */
export function praemiePatchFuerAbschluss(
  meta: Record<string, any> | null | undefined,
  heute: string = new Date().toISOString().split("T")[0],
): Record<string, any> | null {
  const patch: Record<string, any> = {};
  if (meta?.praemieStatus !== "ausgezahlt" && meta?.praemieStatus !== "berechtigt") {
    patch.praemieStatus = "berechtigt";
  }
  if (!meta?.abgeschlossenAm) {
    patch.abgeschlossenAm = heute;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Gleicht den Empfehlungsstatus ab, wenn sich die Pipeline des geworbenen
 * Kontakts aendert. Wird aus updateKontakt aufgerufen; der Aufrufer uebergibt
 * die EFFEKTIVE Pipelinestufe (getEffectivePipelineStufe), nicht den rohen
 * meta-Wert.
 */
export function syncEmpfehlungFromPipeline(kontaktMeta: Record<string, any> | undefined, pipelineStufe: string) {
  if (!kontaktMeta?.empfehlungId) return;
  const empId = kontaktMeta.empfehlungId;

  if (isTestAccount()) {
    // Testkonto: nur der Status, die lokale Struktur kennt keine Praemien-Meta.
    const all = localGet<Empfehlung[]>(LS_EMP, []);
    const idx = all.findIndex(e => e.id === empId);
    if (idx < 0) return;
    const neuerStatus = entscheideEmpfehlungStatusSync(all[idx].status, false, pipelineStufe);
    if (!neuerStatus) return;
    all[idx].status = neuerStatus;
    localSet(LS_EMP, all);
    return;
  }

  const existing = cacheGet("empfehlungen").find((r: any) => r.id === empId);
  if (!existing) return;
  const meta = (existing.meta && typeof existing.meta === "object" && !Array.isArray(existing.meta))
    ? existing.meta as Record<string, any>
    : {};
  const statusManuell = meta.statusManuell === true;

  const neuerStatus = entscheideEmpfehlungStatusSync(existing.status, statusManuell, pipelineStufe);

  const update: Record<string, any> = {};
  if (neuerStatus) update.status = neuerStatus;

  // Praemien-Automatik: greift beim Erreichen von "abgeschlossen" und ist
  // idempotent, damit ein frueherer Sync ohne Praemie nachgezogen wird.
  const zielIstAbschluss = pipelineToEmpfehlungStatus(pipelineStufe) === "abgeschlossen";
  const statusIstAbschluss = neuerStatus === "abgeschlossen"
    || (neuerStatus === null && existing.status === "abgeschlossen");
  if (zielIstAbschluss && statusIstAbschluss && existing.status !== "dublette") {
    const praemiePatch = praemiePatchFuerAbschluss(meta);
    if (praemiePatch) update.meta = { ...meta, ...praemiePatch };
  }

  if (Object.keys(update).length === 0) return;
  cacheUpdate("empfehlungen", empId, update);
}

/**
 * Gemeinsame Einstiegsstelle fuer den Statusabgleich: leitet die EFFEKTIVE
 * Pipelinestufe des Kontakts ab (Investment gewinnt, verloren gewinnt) und
 * stoesst syncEmpfehlungFromPipeline an. Wird vom Investment-Schreibpfad
 * genutzt; kundenStore.updateKontakt macht fachlich dasselbe.
 */
export function syncEmpfehlungFuerKontakt(kunde: KundeData): void {
  const raw = cacheGet("kontakte").find((r: any) => r.id === kunde.id);
  const empfehlungId = raw?.meta?.empfehlungId || (kunde as any).meta?.empfehlungId;
  if (!empfehlungId) return;
  syncEmpfehlungFromPipeline({ empfehlungId }, getEffectivePipelineStufe(kunde));
}

/**
 * Erkennt die PostgREST-Meldung fuer eine fehlende Spalte kontakt_id.
 * Solange die Migration fuer empfehlungen.kontakt_id noch nicht gelaufen ist,
 * schreiben die Anlagepfade die Verknuepfung nur in meta.neuerKontaktId und
 * versuchen es beim naechsten Mal wieder mit der Spalte.
 */
export function fehltKontaktIdSpalte(fehler: { code?: string; message?: string } | null | undefined): boolean {
  if (!fehler) return false;
  return fehler.code === "PGRST204"
    || (typeof fehler.message === "string" && fehler.message.includes("kontakt_id"));
}
