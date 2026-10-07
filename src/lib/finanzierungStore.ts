/**
 * Finanzierung eines INVESTMENTS.
 *
 * Wichtig zum Verstaendnis: Die Datenbankspalte heisst historisch `kunde_id`,
 * enthaelt aber die Investment-ID. So wird sie seit jeher geschrieben, und die
 * Loeschroutine in Migration 20260603110100 setzt das ebenfalls voraus. Nur
 * die Pipeline las frueher mit der Kontakt-ID und fand deshalb nie etwas.
 *
 * Am Investment und nicht am Kunden zu haengen ist nicht kosmetisch: Ein Kunde
 * mit zwei Investments haette sonst fuer beide dieselben Bankangebote.
 */
import { cacheGet, cacheInsert, cacheUpdate, cacheFilter } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";

export type FinanzDocStatus = "none" | "uploaded" | "signed";
export interface FinanzDokument { id: string; name: string; status: FinanzDocStatus; isDefault: boolean; fileUrl?: string; }
export interface MischzinsTranche { bezeichnung: string; betrag: number; zinssatz: number; tilgung: number; }
export interface FinanzierungsAngebot {
  id: string; label: string; bank: string; summe: number; zins: string; tilgung: string;
  laufzeit: string; anmerkungen: string; dokumente: FinanzDokument[];
  gesendet: boolean; akzeptiert: boolean; bankFinal: boolean;
  tranchen?: MischzinsTranche[];
}
/**
 * Der Zustand einer Finanzierung ergibt sich aus den Dokumenten, nicht aus
 * einem eigenen Statusfeld. Das frühere Phasenmodell mit fünf Stufen wurde
 * entfernt: Die drei Funktionen, die es weiterschalteten, hatten nie einen
 * Aufrufer, `phase` blieb deshalb bei jedem Kunden dauerhaft auf "offen" und
 * das Badge "Bestätigt" ist nie erschienen.
 */
export interface FinanzierungData { angebote: FinanzierungsAngebot[]; }

/** Prozentwert aus einem Textfeld lesen, auch mit Komma als Dezimaltrennzeichen. */
function prozent(wert: unknown): number {
  const n = parseFloat(String(wert ?? "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

/**
 * Monatliche Annuitaet eines Finanzierungsangebots.
 *
 * Ein Angebot fuehrt kein fertiges Ratenfeld, sondern nur Summe, Zins und
 * Tilgung (bzw. mehrere Tranchen beim Mischzins). Mehrere Kundenkarten haben
 * deshalb ein nicht existierendes Feld `rateMonatlich` gelesen und dadurch
 * dauerhaft 0 Euro Rate angezeigt, was den Cashflow zu positiv aussehen liess.
 * Diese Funktion ist die eine gemeinsame Quelle und rechnet wie die
 * Finanzierungsansicht im CRM: Betrag mal (Zins plus Tilgung) durch 100 durch 12.
 */
export function monatsrateAusAngebot(angebot: Partial<FinanzierungsAngebot> | null | undefined): number {
  if (!angebot) return 0;
  const tranchen = angebot.tranchen || [];
  if (tranchen.length > 0) {
    return tranchen.reduce(
      (summe, t) => summe + (Number(t?.betrag) || 0) * (prozent(t?.zinssatz) + prozent(t?.tilgung)) / 100 / 12,
      0,
    );
  }
  const summe = Number(angebot.summe) || 0;
  if (summe <= 0) return 0;
  return summe * (prozent(angebot.zins) + prozent(angebot.tilgung)) / 100 / 12;
}

const LS_PREFIX = "mi_finanzierung_v2_";

function lsGet(investmentId: string): FinanzierungData {
  return localGet<FinanzierungData>(`${LS_PREFIX}${investmentId}`, { angebote: [] });
}

function dbRowExists(investmentId: string): boolean {
  return !!cacheGet("finanzierungen").find((r: any) => r.kunde_id === investmentId);
}

function dbGet(investmentId: string): FinanzierungData {
  const row = cacheGet("finanzierungen").find((r: any) => r.kunde_id === investmentId);
  if (!row) return { angebote: [] };
  return { angebote: row.angebote || [] };
}

function dbSave(investmentId: string, data: FinanzierungData) {
  const existing = cacheGet("finanzierungen").find((r: any) => r.kunde_id === investmentId);
  const row = { kunde_id: investmentId, angebote: data.angebote, aktualisiert_am: new Date().toISOString() };
  if (existing) { cacheUpdate("finanzierungen", existing.id, row); }
  else { cacheInsert("finanzierungen", { id: crypto.randomUUID(), ...row, erstellt_am: new Date().toISOString() }); }
}

/** Ensure every Angebot has the 3 default docs (backfill for older data). */
function ensureDefaultDocs(data: FinanzierungData): FinanzierungData {
  const DEFAULTS = ["Finanzierungsangebot", "Grundschuld", "Darlehensvertrag"];
  let changed = false;
  for (const a of data.angebote) {
    if (!Array.isArray(a.dokumente)) a.dokumente = [];
    for (let di = 0; di < DEFAULTS.length; di++) {
      const name = DEFAULTS[di];
      if (!a.dokumente.some(d => d.name === name)) {
        // Insert at correct position (after the previous default)
        const insertIdx = a.dokumente.findIndex((d, i) => {
          const prevDefault = DEFAULTS[di - 1];
          return prevDefault && d.name === prevDefault ? false : i >= di;
        });
        a.dokumente.splice(Math.max(0, di), 0, {
          id: `fd-backfill-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name, status: "none", isDefault: true,
        });
        changed = true;
      }
    }
  }
  return data;
}

/**
 * Eine eigene Kopie der Finanzierungsdaten.
 *
 * `dbGet` reicht das Angebots-Array aus dem Zwischenspeicher unveraendert
 * weiter. Ohne diese Kopie arbeiten der Aufrufer und der Zwischenspeicher auf
 * demselben Array: `createAngebot` haengt ein Angebot an, und damit steht es
 * unbemerkt auch schon in der Liste, die die Oberflaeche gerade anzeigt. Haengt
 * die Oberflaeche es dann selbst noch einmal an, werden aus einem Klick auf
 * "Neues Angebot erstellen" zwei Angebote. Aus demselben Grund darf auch
 * `ensureDefaultDocs` nur auf der Kopie arbeiten, denn es fuegt fehlende
 * Standarddokumente per `splice` direkt in die Liste ein.
 */
function eigeneKopie(data: FinanzierungData): FinanzierungData {
  return {
    angebote: (data.angebote || []).map((a) => ({
      ...a,
      dokumente: Array.isArray(a.dokumente) ? a.dokumente.map((d) => ({ ...d })) : [],
      ...(a.tranchen ? { tranchen: a.tranchen.map((t) => ({ ...t })) } : {}),
    })),
  };
}

export function getFinanzierung(investmentId: string): FinanzierungData {
  // DB ist die Quelle der Wahrheit. LocalStorage nur als Seed verwenden, wenn
  // für diesen Kunden NOCH KEIN DB-Datensatz existiert (sonst zeigt es alte LS-Stände
  // und beim ersten "Neues Angebot" werden plötzlich zwei Angebote sichtbar).
  if (dbRowExists(investmentId)) return ensureDefaultDocs(eigeneKopie(dbGet(investmentId)));
  if (isTestAccount()) return ensureDefaultDocs(eigeneKopie(lsGet(investmentId)));
  return ensureDefaultDocs(eigeneKopie(dbGet(investmentId)));
}

export function saveFinanzierung(investmentId: string, data: FinanzierungData) {
  // Always persist to DB so customer portal can read the data
  dbSave(investmentId, data);
  if (isTestAccount()) { localSet(`${LS_PREFIX}${investmentId}`, data); }
  window.dispatchEvent(new CustomEvent("finanzierung-updated"));
}

export function createAngebot(investmentId: string): FinanzierungsAngebot {
  const data = getFinanzierung(investmentId);
  const nr = data.angebote.length + 1;
  const angebot: FinanzierungsAngebot = {
    id: `fa-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, label: `Angebot ${nr}`,
    bank: "", summe: 0, zins: "", tilgung: "", laufzeit: "", anmerkungen: "",
    dokumente: [
      { id: `fd-${Date.now()}-1`, name: "Finanzierungsangebot", status: "none", isDefault: true },
      { id: `fd-${Date.now()}-2`, name: "Grundschuld", status: "none", isDefault: true },
      { id: `fd-${Date.now()}-3`, name: "Darlehensvertrag", status: "none", isDefault: true },
    ],
    gesendet: false, akzeptiert: false, bankFinal: false,
  };
  data.angebote.push(angebot);
  saveFinanzierung(investmentId, data);
  return angebot;
}

export function updateAngebot(investmentId: string, angebotId: string, updates: Partial<FinanzierungsAngebot>) {
  const data = getFinanzierung(investmentId);
  const idx = data.angebote.findIndex(a => a.id === angebotId);
  if (idx >= 0) { data.angebote[idx] = { ...data.angebote[idx], ...updates }; saveFinanzierung(investmentId, data); }
}

export function addDokumentToAngebot(investmentId: string, angebotId: string, docName: string) {
  const data = getFinanzierung(investmentId);
  const angebot = data.angebote.find(a => a.id === angebotId);
  if (angebot) { angebot.dokumente.push({ id: `fd-${Date.now()}`, name: docName, status: "none", isDefault: false }); saveFinanzierung(investmentId, data); }
}

export function updateDokumentStatus(investmentId: string, angebotId: string, docId: string, status: FinanzDocStatus, fileUrl?: string) {
  const data = getFinanzierung(investmentId);
  const angebot = data.angebote.find(a => a.id === angebotId);
  if (angebot) { const doc = angebot.dokumente.find(d => d.id === docId); if (doc) { doc.status = status; if (fileUrl) doc.fileUrl = fileUrl; } saveFinanzierung(investmentId, data); }
}

export function removeDokument(investmentId: string, angebotId: string, docId: string) {
  const data = getFinanzierung(investmentId);
  const angebot = data.angebote.find(a => a.id === angebotId);
  if (angebot) { angebot.dokumente = angebot.dokumente.filter(d => d.id !== docId); saveFinanzierung(investmentId, data); }
}




export function removeAngebot(investmentId: string, angebotId: string) {
  const data = getFinanzierung(investmentId); data.angebote = data.angebote.filter(a => a.id !== angebotId); saveFinanzierung(investmentId, data);
}

/** Check if a specific doc name is uploaded in any finanzierung angebot */
export function getFinanzierungDocStatus(investmentId: string, docName: string): { uploaded: boolean; fileUrl?: string } {
  const data = getFinanzierung(investmentId);
  for (const angebot of data.angebote) {
    const doc = angebot.dokumente.find(d => d.name === docName && d.status !== "none");
    if (doc) return { uploaded: true, fileUrl: (doc as any).fileUrl };
  }
  return { uploaded: false };
}
