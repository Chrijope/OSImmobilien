import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, onCacheChange, cacheSet, cacheMetaZusammenfuehren, cacheZeileSchreiben, metaUnterschied, gleicherWert } from "./dataCache";
import { istSaHinterlegtAusMeta, istUnterlagenFreigeschaltetAusMeta } from "./unterlagenFreigabe";
import { eigeneSaDataFuerInvestmentRow, saVomVorherigenInvestment } from "./saQuelle";
import { validateKontaktMetaPatch } from "./kontaktMetaSchema";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { withTestFlag } from "./previewFlag";
import { darfVorruecken } from "./pipelineStufen";
import { toast } from "@/hooks/use-toast";
import { normalizePipelineStufe } from "./kontaktPipeline";
import { supabase } from "@/integrations/supabase/client";
import { rvUnterschriftStand } from "./rvUnterschriftMahnung";
import { saNeueUnterschriftAusstehend } from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import { investmentLoeschen, saPdfVermerken } from "./investmentGepruefteWege";

/**
 * Führt eine RPC mit automatischem Retry bei transienten Netzwerkfehlern aus
 * (typisch: "TypeError: Failed to fetch", wenn der Browser bei mehreren
 * gleichzeitigen Klicks eine Verbindung abbricht).
 */
function isTransientRpcError(err: any): boolean {
  const msg = String(err?.message || err?.details || err || "");
  return (
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.toLowerCase().includes("network") ||
    msg.toLowerCase().includes("timeout") ||
    msg.toLowerCase().includes("aborted")
  );
}

async function rpcWithRetry(
  fn: () => Promise<{ data: any; error: any }>,
  attempts = 5,
): Promise<{ data: any; error: any }> {
  let lastResult: { data: any; error: any } = { data: null, error: null };
  for (let i = 0; i < attempts; i++) {
    try {
      lastResult = await fn();
    } catch (error) {
      lastResult = { data: null, error };
    }
    const err = lastResult.error;
    if (!err) return lastResult;
    if (!isTransientRpcError(err)) return lastResult;
    await new Promise((r) => setTimeout(r, 180 + i * 320 + Math.round(Math.random() * 120)));
  }
  return lastResult;
}

type MetaSaveQueueItem = {
  updates: Record<string, any>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  transientRetries: number;
};

const metaSaveQueue = new Map<string, MetaSaveQueueItem>();
/** Der letzte Zeilen-Schreibvorgang aus `updateInvestment` je Investment. */
const zeilenSchreibung = new Map<string, Promise<void>>();
const META_SAVE_DEBOUNCE_MS = 120;
const META_SAVE_MAX_BACKGROUND_RETRIES = 8;

function enqueueInvestmentMetaSave(investmentId: string, updates: Record<string, any>) {
  const item = metaSaveQueue.get(investmentId) || { updates: {}, timer: null, inFlight: false, transientRetries: 0 };
  item.updates = { ...item.updates, ...updates };
  metaSaveQueue.set(investmentId, item);

  if (item.inFlight) return;
  if (item.timer) clearTimeout(item.timer);
  item.timer = setTimeout(() => { void flushInvestmentMetaSave(investmentId); }, META_SAVE_DEBOUNCE_MS);
}

async function flushInvestmentMetaSave(investmentId: string) {
  const item = metaSaveQueue.get(investmentId);
  if (!item || item.inFlight) return;

  const updates = item.updates;
  if (Object.keys(updates).length === 0) {
    metaSaveQueue.delete(investmentId);
    return;
  }

  item.updates = {};
  item.timer = null;
  item.inFlight = true;

  let error: any = null;
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    ({ error } = await rpcWithRetry(async () =>
      await supabase.rpc("merge_investment_meta", {
        _investment_id: investmentId,
        _updates: updates,
      }),
    ));
  } catch (err) {
    error = err;
  }

  item.inFlight = false;

  if (error) {
    item.updates = { ...updates, ...item.updates };
    if (isTransientRpcError(error) && item.transientRetries < META_SAVE_MAX_BACKGROUND_RETRIES) {
      item.transientRetries += 1;
      const delay = 400 + item.transientRetries * 350 + Math.round(Math.random() * 250);
      item.timer = setTimeout(() => { void flushInvestmentMetaSave(investmentId); }, delay);
      console.warn("merge_investment_meta transient error, retrying queued save:", error);
      return;
    }

    console.error("merge_investment_meta queued save error:", error);
    metaSaveQueue.delete(investmentId);
    toast({
      title: "Speichern fehlgeschlagen",
      description: "Bitte erneut versuchen.",
      variant: "destructive",
    });
    return;
  }

  item.transientRetries = 0;
  if (Object.keys(item.updates).length > 0) {
    item.timer = setTimeout(() => { void flushInvestmentMetaSave(investmentId); }, META_SAVE_DEBOUNCE_MS);
  } else {
    metaSaveQueue.delete(investmentId);
  }
}

export interface Investment {
  id: string; kontaktId: string; nummer: number; label: string; pipelineStufe: string;
  objektId?: string; objektTitel?: string; wohnungId?: string; weNr?: string;
  notarTermin?: string; notarUhrzeit?: string; notarName?: string; notarAdresse?: string;
  notarTelefon?: string; notarVerkaeufervertretung?: string; notarVerkaeufer?: string;
  finanzierungsStatus?: "offen" | "bestaetigt" | "abgelehnt"; reviewResultSentAt?: string; erstellt_am: string;
  /**
   * `investments.meta`, nur zum Lesen.
   *
   * Bis zum 29.09.2026 fehlte es hier, und rund fünfzehn Stellen, die
   * `inv.meta.…` lesen, bekamen still immer ein leeres Objekt. Geschrieben
   * wird es über diesen Weg nie: `toDb` baut das Meta aus der Rohzeile im
   * Zwischenspeicher, ein mitgereichtes (womöglich veraltetes) `meta` wird
   * dort nicht gelesen. Schreiben geht über `setInvestmentMetaFields`.
   */
  meta?: Record<string, unknown>;
}
export interface InvestmentDokument { id: string; investmentId: string; name: string; kategorie: "notar_unterlagen" | "sonstige" | "kundenordner"; uploadedBy: string; uploadedAt: string; deleteRequested?: boolean; deleteRequestedBy?: string; }

const LS_KEY = "mi_investments";
const LS_DOK = "mi_investment_docs";

function buildInvestmentMeta(inv: Investment, existingMeta: Record<string, any> = {}): Record<string, any> {
  return {
    ...existingMeta,
    nummer: inv.nummer,
    label: inv.label,
    pipelineStufe: inv.pipelineStufe,
    objektId: inv.objektId,
    objektTitel: inv.objektTitel,
    wohnungId: inv.wohnungId,
    weNr: inv.weNr,
    notarTermin: inv.notarTermin,
    notarUhrzeit: inv.notarUhrzeit,
    notarName: inv.notarName,
    notarAdresse: inv.notarAdresse,
    notarTelefon: inv.notarTelefon,
    notarVerkaeufervertretung: inv.notarVerkaeufervertretung,
    notarVerkaeufer: inv.notarVerkaeufer,
    finanzierungsStatus: inv.finanzierungsStatus,
  };
}

/**
 * Holt den Kaufpreis aus den im Meta mitgefuehrten Objektdaten.
 *
 * Der Typ `Investment` fuehrt selbst keinen Kaufpreis, die Spalte
 * `investments.kaufpreis` wird aber vom Kundenportal direkt gelesen
 * (Portfoliowert, Bruttorendite, Kaufpreis-Kachel, Freigabe des
 * Steuer-Cockpits). Deshalb wird der Wert hier aus den vorhandenen
 * Snapshots abgeleitet, statt die Spalte leer zu lassen.
 */
function kaufpreisAusMeta(meta: Record<string, any>): number {
  const kandidaten = [
    meta?.kaufpreis,
    meta?.rvVirtualWohnung?.kaufpreis,
    meta?.wohnungSnapshot?.kaufpreis,
    meta?.wohnungSnapshot?.vkGesamt,
    meta?.wohnungSnapshot?.vk_gesamt,
    meta?.objektSnapshot?.kaufpreis,
  ];
  for (const k of kandidaten) {
    const n = Number(k);
    if (isFinite(n) && n > 0) return n;
  }
  return 0;
}

function toDb(inv: Investment, existingMeta: Record<string, any> = {}): Record<string, any> {
  const meta = withTestFlag(buildInvestmentMeta(inv, existingMeta));
  const row: Record<string, any> = {
    id: inv.id,
    kunde_id: inv.kontaktId,
    objekt: inv.objektTitel || null,
    wohnung: inv.weNr || null,
    status: "aktiv",
    erstellt_am: inv.erstellt_am,
    meta,
  };
  // Nur setzen, wenn ein echter Kaufpreis bekannt ist. Vorher stand hier fest
  // `kaufpreis: 0`, wodurch jede Aenderung am Investment einen bereits
  // hinterlegten Kaufpreis wieder auf null zurueckgesetzt hat. Ohne bekannten
  // Wert bleibt die Spalte unberuehrt (beim Anlegen greift der DB-Default 0).
  const kaufpreis = kaufpreisAusMeta(meta);
  if (kaufpreis > 0) row.kaufpreis = kaufpreis;
  return row;
}
function fromDb(r: any): Investment {
  const meta = r.meta || {};
  return { id: r.id, kontaktId: r.kunde_id, nummer: meta.nummer || 1, label: meta.label || r.objekt || "Investment", pipelineStufe: meta.pipelineStufe || "neuer_lead", objektId: meta.objektId, objektTitel: meta.objektTitel || r.objekt, wohnungId: meta.wohnungId, weNr: meta.weNr || r.wohnung, notarTermin: meta.notarTermin, notarUhrzeit: meta.notarUhrzeit, notarName: meta.notarName, notarAdresse: meta.notarAdresse, notarTelefon: meta.notarTelefon, notarVerkaeufervertretung: meta.notarVerkaeufervertretung, notarVerkaeufer: meta.notarVerkaeufer, finanzierungsStatus: meta.finanzierungsStatus, erstellt_am: r.erstellt_am || "", meta };
}

/** Get raw DB row for an investment (to access meta directly) */
function getRawRow(investmentId: string): any | null {
  if (isTestAccount()) return null;
  return cacheGet("investments").find((r: any) => r.id === investmentId) || null;
}

/** Read a key from investment meta */
function getMetaField<T>(investmentId: string, key: string, fallback: T): T {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(`mi_${key}_${investmentId}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }
  const row = getRawRow(investmentId);
  if (!row) return fallback;
  const meta = row.meta || {};
  return meta[key] !== undefined ? meta[key] : fallback;
}

/** Write a key to investment meta */
function setMetaField(investmentId: string, key: string, value: any): void {
  if (isTestAccount()) {
    localStorage.setItem(`mi_${key}_${investmentId}`, JSON.stringify(value));
    return;
  }
  const row = getRawRow(investmentId);
  if (!row) return;
  const meta = { ...(row.meta || {}), [key]: value };
  const rows = cacheGet("investments");
  const idx = rows.findIndex((r: any) => r.id === investmentId);
  if (idx >= 0) {
    const nextRows = [...rows];
    nextRows[idx] = { ...nextRows[idx], meta };
    cacheSet("investments", nextRows);
  }
  enqueueInvestmentMetaSave(investmentId, { [key]: value });
}

/** Write multiple keys to investment meta atomically (single DB write) */
function setMetaFields(investmentId: string, updates: Record<string, any>): void {
  if (isTestAccount()) {
    for (const [k, v] of Object.entries(updates)) {
      localStorage.setItem(`mi_${k}_${investmentId}`, JSON.stringify(v));
    }
    return;
  }
  const row = getRawRow(investmentId);
  if (!row) return;
  const meta = { ...(row.meta || {}), ...updates };
  const rows = cacheGet("investments");
  const idx = rows.findIndex((r: any) => r.id === investmentId);
  if (idx >= 0) {
    const nextRows = [...rows];
    nextRows[idx] = { ...nextRows[idx], meta };
    cacheSet("investments", nextRows);
  }
  enqueueInvestmentMetaSave(investmentId, updates);
}

/** PUBLIC: Read an arbitrary key from investment meta (additive helper). */
export function getInvestmentMeta<T>(investmentId: string, key: string, fallback: T): T {
  return getMetaField<T>(investmentId, key, fallback);
}

/** PUBLIC: Write an arbitrary key to investment meta (additive helper). */
export function setInvestmentMeta(investmentId: string, key: string, value: any): void {
  setMetaField(investmentId, key, value);
}

/**
 * Meta-Schlüssel nur im Zwischenspeicher setzen, ohne Schreibauftrag an die
 * Datenbank.
 *
 * Gedacht für den Fall, dass eine eigene Datenbankfunktion bereits
 * geschrieben hat und nur noch die Anzeige nachziehen soll. Der übliche Weg
 * `setInvestmentMeta` würde denselben Stand ein zweites Mal über
 * `merge_investment_meta` schicken. Für einen Kunden verwirft diese Funktion
 * ohnehin alles außer zwei Schlüsseln, der zweite Aufruf wäre also nur Lärm
 * im Serverprotokoll.
 */
export function setInvestmentMetaNurLokal(investmentId: string, key: string, value: any): void {
  if (isTestAccount()) {
    localStorage.setItem(`mi_${key}_${investmentId}`, JSON.stringify(value));
    return;
  }
  const row = getRawRow(investmentId);
  if (!row) return;
  const meta = { ...(row.meta || {}), [key]: value };
  const rows = cacheGet("investments");
  const idx = rows.findIndex((r: any) => r.id === investmentId);
  if (idx >= 0) {
    const nextRows = [...rows];
    nextRows[idx] = { ...nextRows[idx], meta };
    cacheSet("investments", nextRows);
  }
}

/** Exported wrapper for setMetaFields – use when persisting custom investment meta keys
 *  (z. B. quelle, rvVirtualWohnung, investagonRef) ohne den Investment-Hauptrecord anzufassen. */
export function setInvestmentMetaFields(investmentId: string, updates: Record<string, any>): void {
  setMetaFields(investmentId, updates);
}

/**
 * Wartet, bis die offenen Schreibvorgänge dieses Investments in der Datenbank
 * angekommen sind (seit 29.09.2026).
 *
 * `updateInvestment` und `setInvestmentMetaFields` schreiben im Hintergrund,
 * Letzteres sogar entprellt. Liest direkt danach eine Edge Function die Zeile,
 * etwa `send-reservation-signature` das eben eingetragene Objekt, sähe sie
 * sonst womöglich den alten Stand.
 */
export async function investmentGespeichert(investmentId: string): Promise<void> {
  await zeilenSchreibung.get(investmentId);
  const item = metaSaveQueue.get(investmentId);
  if (item?.timer && !item.inFlight) {
    clearTimeout(item.timer);
    item.timer = null;
    void flushInvestmentMetaSave(investmentId);
  }
  // ponytail: Abfrage alle 50 ms, höchstens 5 s; danach geht es ohne Gewähr weiter.
  for (let i = 0; i < 100 && metaSaveQueue.has(investmentId); i++) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Exported read helper for investment meta (e.g. setterSkript, gespraechsnotizenAI).
 *  Liest direkt aus dem Cache – inkl. Test-Account-Fallback. */
export function getInvestmentMetaField<T>(investmentId: string, key: string, fallback: T): T {
  return getMetaField<T>(investmentId, key, fallback);
}

/** Atomically write all notar fields (notarData + top-level mirrors) in a single DB update.
 *  Prevents race condition between setInvestmentNotarData() + updateInvestment() that could
 *  drop fields like notarUhrzeit when both writes overlap.
 */
export function setInvestmentNotarFields(investmentId: string, fields: Partial<{
  datum: string; uhrzeit: string; name: string; adresse: string; telefon: string;
  verkaeufer: string; vertretung: string;
}>): void {
  if (isTestAccount()) {
    const current = getMetaField<Record<string, string>>(investmentId, "notarData", {});
    const merged = { ...current, ...fields };
    localStorage.setItem(`mi_notarData_${investmentId}`, JSON.stringify(merged));
    return;
  }
  const row = getRawRow(investmentId);
  const currentMeta: any = row?.meta || {};
  const currentNotarData: Record<string, string> = currentMeta.notarData || {};
  const newNotarData = { ...currentNotarData, ...fields };
  const updates: Record<string, any> = { notarData: newNotarData };
  if (fields.datum !== undefined) updates.notarTermin = fields.datum;
  if (fields.uhrzeit !== undefined) updates.notarUhrzeit = fields.uhrzeit;
  if (fields.name !== undefined) updates.notarName = fields.name;
  if (fields.adresse !== undefined) updates.notarAdresse = fields.adresse;
  if (fields.telefon !== undefined) updates.notarTelefon = fields.telefon;
  if (fields.verkaeufer !== undefined) updates.notarVerkaeufer = fields.verkaeufer;
  if (fields.vertretung !== undefined) updates.notarVerkaeufervertretung = fields.vertretung;
  setMetaFields(investmentId, updates);
}

/** Read a key from kontakte meta (for kontakt-level settings like unterlagenFreigeschaltet) */
function getKontaktMetaField<T>(kontaktId: string, key: string, fallback: T): T {
  if (isTestAccount()) {
    try { const raw = localStorage.getItem(`mi_k_${key}_${kontaktId}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
  }
  const row = cacheGet("kontakte").find((r: any) => r.id === kontaktId);
  if (!row) return fallback;
  const meta = row.meta || {};
  return meta[key] !== undefined ? meta[key] : fallback;
}

/** Write a key to kontakte meta – uses server-side atomic JSONB merge to prevent race conditions */
function setKontaktMetaField(kontaktId: string, key: string, value: any): void {
  if (isTestAccount()) {
    localStorage.setItem(`mi_k_${key}_${kontaktId}`, JSON.stringify(value));
    return;
  }
  // Optimistic local update first – ueber cacheSet, damit die Tabellenversion
  // steigt und die Anzeige nachzieht (eine Aenderung am Array an Ort und Stelle
  // wuerde von der Abbildung in kundenStore nicht bemerkt).
  const row = cacheGet("kontakte").find((r: any) => r.id === kontaktId);
  if (row) {
    const meta = { ...(row.meta || {}), [key]: value };
    const arr = cacheGet("kontakte");
    const idx = arr.findIndex((r: any) => r.id === kontaktId);
    if (idx >= 0) {
      const naechste = [...arr];
      naechste[idx] = { ...naechste[idx], meta };
      cacheSet("kontakte", naechste);
    }
  }
  // Atomic server-side merge – prevents other concurrent meta updates from overwriting this key
  const patch = { [key]: value };
  const validation = validateKontaktMetaPatch(patch);
  if (validation.success === false) {
    console.warn("Kontakt-Meta-Validierung fehlgeschlagen:", validation.errors.join("; "));
  }
  import("@/integrations/supabase/client").then(({ supabase }) => {
    supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: kontaktId,
      _updates: patch,
    }).then(({ data, error }) => {
      if (error) {
        console.error("merge_kontakt_meta error:", error);
      } else if (data) {
        // Update cache with the authoritative merged meta from DB
        const arr2 = cacheGet("kontakte");
        const idx2 = arr2.findIndex((r: any) => r.id === kontaktId);
        if (idx2 >= 0) {
          const naechste2 = [...arr2];
          naechste2[idx2] = { ...naechste2[idx2], meta: data };
          cacheSet("kontakte", naechste2);
        }
      }
    });
  });
}

// ── Cached investment mapping to avoid repeated .map(fromDb) ──
let _investmentsCacheLen = -1;
let _investmentsCacheRef: any[] | null = null;
let _investmentsMapped: Investment[] = [];
let _investmentsByKontaktIdx: Map<string, Investment[]> = new Map();

function rebuildInvestmentIndex() {
  const raw = cacheGet("investments");
  if (raw === _investmentsCacheRef && raw.length === _investmentsCacheLen) return;
  _investmentsCacheRef = raw;
  _investmentsCacheLen = raw.length;
  _investmentsMapped = raw.map(fromDb);
  // Build kontakt index
  _investmentsByKontaktIdx = new Map();
  for (const inv of _investmentsMapped) {
    let arr = _investmentsByKontaktIdx.get(inv.kontaktId);
    if (!arr) { arr = []; _investmentsByKontaktIdx.set(inv.kontaktId, arr); }
    arr.push(inv);
  }
  // Sort each group by nummer
  for (const arr of _investmentsByKontaktIdx.values()) {
    // Stabil nach Erstellungszeit sortieren, dann nummer/label aus der Reihenfolge ableiten.
    // Damit werden doppelte „nummer" (Race beim parallelen Anlegen) im UI automatisch korrigiert.
    arr.sort((a, b) => {
      const ta = new Date(a.erstellt_am).getTime();
      const tb = new Date(b.erstellt_am).getTime();
      if (ta !== tb) return ta - tb;
      return (a.nummer || 0) - (b.nummer || 0);
    });
    arr.forEach((inv, idx) => {
      const n = idx + 1;
      if (inv.nummer !== n) inv.nummer = n;
      if (!inv.label || /^Investment \d+$/.test(inv.label)) inv.label = `Investment ${n}`;
    });
  }
}

/** Force invalidation of investment cache (call after realtime updates) */
export function invalidateInvestmentsCache() {
  _investmentsCacheRef = null;
  _investmentsCacheLen = -1;
}

// Auto-invalidate on realtime changes
onCacheChange((table) => {
  if (table === "investments") invalidateInvestmentsCache();
});

export function getInvestments(): Investment[] {
  if (isTestAccount()) return localGet<Investment[]>(LS_KEY, []);
  rebuildInvestmentIndex();
  return _investmentsMapped;
}
function saveInvestments(investments: Investment[]) { localSet(LS_KEY, investments); }

export function getInvestmentsByKontakt(kontaktId: string) {
  if (isTestAccount()) {
    const arr = getInvestments()
      .filter(inv => inv.kontaktId === kontaktId)
      .sort((a, b) => {
        const ta = new Date(a.erstellt_am).getTime();
        const tb = new Date(b.erstellt_am).getTime();
        if (ta !== tb) return ta - tb;
        return (a.nummer || 0) - (b.nummer || 0);
      });
    arr.forEach((inv, idx) => {
      const n = idx + 1;
      if (inv.nummer !== n) inv.nummer = n;
      if (!inv.label || /^Investment \d+$/.test(inv.label)) inv.label = `Investment ${n}`;
    });
    return arr;
  }
  rebuildInvestmentIndex();
  return _investmentsByKontaktIdx.get(kontaktId) || [];
}
export function getInvestmentById(id: string) { return getInvestments().find(inv => inv.id === id); }

/**
 * Kennung des Kontakts, dem ein Investment gehoert, oder `null`.
 *
 * Fuer alles, was an den Kunden geht (Glocke, Mail): Empfaenger ist immer der
 * Kontakt, nie das Investment. Eine Investment-Kennung an `notifyKunde`
 * uebergeben findet keinen Kontakt, die Meldung geht dann an niemanden.
 */
export function kontaktIdZumInvestment(investmentId: string): string | null {
  return getInvestmentById(investmentId)?.kontaktId || null;
}

export async function createInvestment(kontaktId: string, label?: string): Promise<Investment> {
  const existing = getInvestmentsByKontakt(kontaktId);
  const nummer = existing.length > 0 ? Math.max(...existing.map(e => e.nummer)) + 1 : 1;

  /*
   * Wo ein neues Investment anfängt.
   *
   * Das ERSTE Investment übernimmt die Stufe des Kontakts. So wird ein frisch
   * reingekommener Meta- oder Zapier-Lead nicht fälschlich als „Erstgespräch
   * geführt" markiert, obwohl er noch nie erreicht wurde. Bestandsimport-
   * Kontakte gehen weiterhin direkt in „Beratungsgespräch" (Pre-Funnel → Funnel).
   *
   * JEDES WEITERE Investment beginnt dagegen immer ganz vorne, unabhängig
   * davon, wie weit der Kunde bei seinem ersten Investment schon ist. Vorher
   * erbte es die Kontaktstufe, und damit sprang ein zweites Investment sofort
   * mitten in den Prozess: Bonitätsunterlagen aufgedeckt, obwohl für dieses
   * Investment noch keine Selbstauskunft ausgefüllt oder unterschrieben war.
   * Jedes Investment ist ein eigener Vorgang und durchläuft den Weg von vorn.
   */
  let initialStufe: any = "neuer_lead";
  try {
    const kontaktRow: any = cacheGet("kontakte").find((r: any) => r.id === kontaktId);
    const aktuelleStufe = kontaktRow?.pipeline_stufe || kontaktRow?.meta?.pipelineStufe;
    if (existing.length > 0) {
      initialStufe = "neuer_lead";
    } else if (aktuelleStufe && aktuelleStufe !== "bestandsimport") {
      /*
       * Die geerbte Stufe wird bei "selbstauskunft" gedeckelt.
       *
       * Ein frisch angelegtes Investment hat keine unterschriebene
       * Selbstauskunft, das ist nicht zu bezweifeln. Steht der Kontakt aber
       * schon auf "objektauswahl" oder weiter, weil ein anderes Investment ihn
       * dorthin gezogen hat, erbte der neue Vorgang diese Stufe bis zum
       * 21.09.2026 einfach mit und stand ohne Selbstauskunft in der
       * Objektauswahl.
       *
       * Das greift nur beim ERSTEN Investment, jedes weitere faengt ohnehin
       * vorne an. Der Fall entsteht trotzdem: Ist der Zwischenspeicher beim
       * Anlegen noch nicht gefuellt, gilt auch ein spaeteres Investment als
       * erstes.
       */
      initialStufe = darfVorruecken("selbstauskunft", aktuelleStufe)
        ? "selbstauskunft"
        : aktuelleStufe;
    }
    if (aktuelleStufe === "bestandsimport" && existing.length === 0) {
      initialStufe = "beratungsgespraech";
      try {
        const { updateKontakt } = await import("./kundenStore");
        updateKontakt(kontaktId, { pipelineStufe: "beratungsgespraech" as any });
      } catch (e) { console.warn("Bestandsimport→Beratungsgespräch update failed", e); }
      try {
        const { addAktivitaet } = await import("./aktivitaetenStore");
        addAktivitaet({ kundeId: kontaktId, art: "notiz", beschreibung: "Bestandskunde aktiviert (Investment angelegt → Beratungsgespräch)", von: "System" });
      } catch {}
    }
  } catch {}

  const inv: Investment = { id: crypto.randomUUID(), kontaktId, nummer, label: label || `Investment ${nummer}`, pipelineStufe: initialStufe, erstellt_am: new Date().toISOString() };

  // Der Provisionssatz wird NICHT mehr hier im Browser festgeschrieben.
  //
  // Vorher rechnete der anlegende Client den Satz aus cacheGet("user_settings")
  // aus. Legte aber ein Team Lead oder das Backoffice das Investment für einen
  // Partner an, dessen user_settings er per RLS nicht lesen darf, fehlte die
  // Zeile im Cache, und es wurden stillschweigend 3 % eingefroren.
  //
  // Jetzt schreibt ein Trigger auf public.investments den Satz serverseitig
  // fest, seit 20260929140000 erst beim Eintritt in die Reservierung und neu
  // beim Partnerwechsel. Bis dahin rechnet die Anzeige über die laufende
  // Kette aus getEffectiveRateInfoForKontakt mit dem Satz des Zuständigen.
  const dbRow = toDb(inv);

  /*
   * Ist der Kunde auf Kontakt-Ebene bereits freigeschaltet (ausdrücklich oder
   * über die Portal-Aktivierung), bekommt jedes neue Investment das eigene
   * Freischalt-Flag direkt mitgeschrieben. So erscheint das Investment sofort
   * vollständig im Kundenportal, und die Freischaltung hängt nicht an der
   * Rückfall-Logik. Uploads, Bonitätscheck und Bankprüfung laufen trotzdem
   * von vorn, weil docStatuses pro Investment geführt werden.
   */
  try {
    if (getUnterlagenFreigeschalten(kontaktId)) {
      dbRow.meta = {
        ...(dbRow.meta || {}),
        unterlagenFreigeschaltet: true,
        unterlagenFreigeschaltetAt: new Date().toISOString(),
      };
    }
  } catch (e) {
    console.warn("Unterlagen-Freischaltung fuer neues Investment nicht ermittelbar", e);
  }

  if (isTestAccount()) { const all = localGet<Investment[]>(LS_KEY, []); all.push(inv); saveInvestments(all); }
  else { await cacheInsert("investments", dbRow); }
  return inv;
}

/**
 * Zeitstempel, die beim Stufenwechsel gesetzt werden.
 *
 * Ohne sie laufen die eingebauten Erinnerungsketten ins Leere: Die Trigger
 * fragen "seit wann steht dieses Investment in dieser Stufe", und niemand hat
 * je eine Antwort geschrieben. Die Schluessel sind so benannt, wie sie in
 * `useInvestmentInboxTriggers` und im Dashboard bereits gelesen werden.
 */
const STUFEN_STEMPEL: Record<string, string> = {
  bonitaetsunterlagen: "bonitaetSeit",
  objektauswahl: "objektauswahlSeit",
  reservierung: "reserviertAm",
  finanzierung: "finanzierungSeit",
};

/**
 * Was ein Schreibvorgang an einem Investment ändert: die geänderten Spalten
 * und die geänderten meta-Schlüssel, samt Zeitstempeln. `null`, wenn die
 * Zeile nicht im Speicher liegt.
 */
function investmentAenderung(
  id: string,
  fields: Partial<Investment>,
  zusatzMeta: Record<string, unknown> = {},
): { spalten: Record<string, any>; patch: Record<string, unknown> } | null {
  const raw = getRawRow(id);
  if (!raw) return null;
  const existing = fromDb(raw);
  const merged = { ...existing, ...fields };
  const altesMeta = (raw.meta as Record<string, any>) || {};

  // Zeitstempel im selben Schreibvorgang mitgeben, nicht in einem zweiten.
  // Ein getrennter Schreibvorgang koennte den ersten ueberholen.
  const stempel: Record<string, any> = {};
  const jetzt = new Date().toISOString();
  if (fields.pipelineStufe && fields.pipelineStufe !== existing.pipelineStufe) {
    // Zeitpunkt des letzten Stufenwechsels, unabhaengig von der Stufe.
    stempel.pipelineSeit = jetzt;
    const feld = STUFEN_STEMPEL[fields.pipelineStufe as string];
    if (feld) stempel[feld] = jetzt;
  }
  // Objektzuweisung: erst ab hier laeuft die Frist "seit wann liegt dem
  // Kunden ein Objekt vor, ohne dass etwas passiert".
  const wohnungNeu = fields.wohnungId && fields.wohnungId !== existing.wohnungId;
  const objektNeu = fields.objektId && fields.objektId !== existing.objektId;
  if (wohnungNeu || objektNeu) stempel.objektZugewiesenAm = jetzt;

  // Seit dem 04.10.2026 (H11) nur noch das Geänderte: Spalten direkt,
  // meta-Schlüssel über merge_investment_meta. Vorher ging das ganze meta
  // aus dem Zwischenspeicher zurück und konnte frischere Werte
  // überschreiben, die eine Function oder ein anderer Tab geschrieben hatte.
  const { id: _id, meta: neuMeta, ...spalten } = toDb(merged, { ...altesMeta, ...zusatzMeta, ...stempel });
  const geaendert: Record<string, any> = {};
  for (const [k, v] of Object.entries(spalten)) {
    if (v === undefined) continue;
    if (!gleicherWert(v, (raw as Record<string, any>)[k])) geaendert[k] = v;
  }
  const patch = metaUnterschied(altesMeta, neuMeta);
  return { spalten: geaendert, patch };
}

/**
 * Schreibt ein Investment. Gibt zurück, ob die Datenbank die Änderung
 * übernommen hat (seit 04.10.2026). Wer nicht wartet, merkt eine Ablehnung
 * trotzdem: Der Zwischenspeicher meldet sie und stellt den Stand zurück.
 */
export function updateInvestment(id: string, fields: Partial<Investment>): Promise<boolean> {
  let ergebnis: Promise<boolean> = Promise.resolve(true);
  if (isTestAccount()) { const all = localGet<Investment[]>(LS_KEY, []); const idx = all.findIndex(inv => inv.id === id); if (idx >= 0) { all[idx] = { ...all[idx], ...fields }; saveInvestments(all); } }
  else {
    const aenderung = investmentAenderung(id, fields);
    if (!aenderung) return Promise.resolve(false);
    const { spalten: geaendert, patch } = aenderung;
    // Erst Spalten, dann meta; nichts wird zurückgeschrieben (cacheZeileSchreiben).
    // Fehler melden die Schreibwege selbst; hier wird nur gemerkt, wann es
    // fertig ist und ob es geklappt hat.
    ergebnis = cacheZeileSchreiben("investments", id, geaendert, patch).then(() => true, () => false);
    zeilenSchreibung.set(id, ergebnis.then(() => undefined));
  }
  // Kontakt-Stufe mit Investment-Stufe synchronisieren, damit Pipeline &
  // Kundenprofil nicht mehr divergieren. Wir schreiben nur, wenn die neue
  // Investment-Stufe echt „weiter" ist als die aktuelle Kontakt-Stufe.
  if (fields.pipelineStufe) {
    try {
      const invRow = (cacheGet("investments") as any[]).find((r: any) => r.id === id);
      const kundeId = invRow?.kunde_id;
      if (!kundeId) return ergebnis;
      const kRow: any = (cacheGet("kontakte") as any[]).find((r: any) => r.id === kundeId);
      if (!kRow) return ergebnis;
      const currentK = normalizePipelineStufe(kRow?.meta?.pipelineStufe);
      const nextI = normalizePipelineStufe(fields.pipelineStufe);
      // Dieselbe Regel wie überall (pipelineStufen.ts, M20): nur nach vorn,
      // Endzustände nie. Vorher zählte die Position in PIPELINE_STUFEN, ein
      // Investment auf „verloren“ zog den ganzen Kontakt mit.
      if (nextI && darfVorruecken(currentK, nextI)) {
        // Nur der eine Schlüssel. Eine Ablehnung meldet der Zwischenspeicher selbst.
        cacheMetaZusammenfuehren("kontakte", kundeId, { pipelineStufe: nextI }).catch(() => {});
      }
      // Empfehlungs-Automatik: Dieser Pfad schreibt die Kontakt-Stufe per
      // direktem cacheUpdate an kundenStore.updateKontakt vorbei, deshalb
      // wird der Statusabgleich der Empfehlung hier mit der effektiven Stufe
      // nachgezogen. Dynamischer Import, weil ein statischer den Kreis
      // investmentsStore -> empfehlungenStore -> kontaktPipeline ->
      // investmentsStore schliessen wuerde.
      void (async () => {
        try {
          const [{ getKontaktById }, { syncEmpfehlungFuerKontakt }] = await Promise.all([
            import("./kundenStore"),
            import("./empfehlungenStore"),
          ]);
          const kunde = getKontaktById(kundeId);
          if (kunde) syncEmpfehlungFuerKontakt(kunde);
        } catch (fehler) {
          console.error("Empfehlungs-Sync fehlgeschlagen:", fehler);
        }
      })();
    } catch (err) {
      console.warn("kontakt-stufe sync skipped", err);
    }
  }
  return ergebnis;
}

/**
 * Wie `updateInvestment`, aber erst meta, dann die Spalten, und mit Auskunft,
 * welcher Schritt scheiterte (06.10.2026, „Reservierung aufheben“).
 *
 * `zusatzMeta` geht im selben meta-Schreibvorgang mit hinaus. Scheitert meta,
 * ist nichts geändert und die Spalten bleiben unberührt. Scheitern danach die
 * Spalten (`objekt`, `wohnung`), gilt meta trotzdem. Meldungen gibt es keine,
 * die macht der Aufrufer. `nachMeta` läuft, sobald die Datenbank meta
 * bestätigt hat, mit ihrem Stand und den gesendeten Schlüsseln. Die Kontakt-Stufe
 * wird hier nicht nachgezogen, das macht der Aufrufer über `updateKontakt`.
 */
export async function updateInvestmentMetaZuerst(
  id: string,
  fields: Partial<Investment>,
  zusatzMeta: Record<string, unknown>,
  nachMeta?: (dbMeta: Record<string, unknown>, gesendet: string[]) => void,
): Promise<"ok" | "meta" | "spalten"> {
  if (isTestAccount()) {
    await updateInvestment(id, fields);
    setMetaFields(id, zusatzMeta);
    return "ok";
  }
  const aenderung = investmentAenderung(id, fields, zusatzMeta);
  if (!aenderung) return "meta";
  const lauf = (async (): Promise<"ok" | "meta" | "spalten"> => {
    try {
      const dbMeta = await cacheMetaZusammenfuehren("investments", id, aenderung.patch, { silent: true });
      if (dbMeta) nachMeta?.(dbMeta, Object.keys(aenderung.patch));
    } catch {
      return "meta";
    }
    try {
      if (Object.keys(aenderung.spalten).length > 0) await cacheUpdate("investments", id, aenderung.spalten, { silent: true });
    } catch {
      return "spalten";
    }
    return "ok";
  })();
  zeilenSchreibung.set(id, lauf.then(() => undefined));
  return lauf;
}

/**
 * Löschen über `investment_loeschen` (seit 30.09.2026): Direkt löschen dürfen
 * nur noch Admin und Inhaber, der zuständige Partner nur vor der Reservierung.
 * Eine Ablehnung kommt als `AktionVerweigert` mit einem Satz für den Nutzer.
 */
export async function deleteInvestment(id: string) {
  if (isTestAccount()) { saveInvestments(localGet<Investment[]>(LS_KEY, []).filter(inv => inv.id !== id)); }
  else if (await investmentLoeschen(id) === "alterWeg") { await cacheDelete("investments", id); }
  else { cacheSet("investments", cacheGet<{ id: string }>("investments").filter((r) => r.id !== id)); }
  if (isTestAccount()) localSet(LS_DOK, localGet<InvestmentDokument[]>(LS_DOK, []).filter(d => d.investmentId !== id));
}

// Investment documents – now stored in investment meta
function getInvestmentDocs(): InvestmentDokument[] {
  if (isTestAccount()) return localGet<InvestmentDokument[]>(LS_DOK, []);
  // Collect docs from all investments' meta
  return cacheGet("investments").flatMap((r: any) => {
    const meta = r.meta || {};
    return (meta._docs as InvestmentDokument[]) || [];
  });
}

export function getDocsByInvestment(investmentId: string) {
  if (isTestAccount()) return localGet<InvestmentDokument[]>(LS_DOK, []).filter(d => d.investmentId === investmentId);
  return getMetaField<InvestmentDokument[]>(investmentId, "_docs", []);
}

export function addInvestmentDoc(doc: Omit<InvestmentDokument, "id">) {
  const newDoc: InvestmentDokument = { ...doc, id: `idoc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  if (isTestAccount()) { const all = localGet<InvestmentDokument[]>(LS_DOK, []); all.push(newDoc); localSet(LS_DOK, all); }
  else { const docs = getMetaField<InvestmentDokument[]>(doc.investmentId, "_docs", []); docs.push(newDoc); setMetaField(doc.investmentId, "_docs", docs); }
  return newDoc;
}

export function removeInvestmentDoc(docId: string) {
  if (isTestAccount()) { localSet(LS_DOK, localGet<InvestmentDokument[]>(LS_DOK, []).filter(d => d.id !== docId)); return; }
  // Find which investment has this doc
  for (const r of cacheGet("investments")) {
    const meta = r.meta || {};
    const docs: InvestmentDokument[] = meta._docs || [];
    if (docs.some(d => d.id === docId)) {
      setMetaField(r.id, "_docs", docs.filter(d => d.id !== docId));
      return;
    }
  }
}

export function requestDeleteDoc(docId: string, requesterName: string) {
  if (isTestAccount()) { const all = localGet<InvestmentDokument[]>(LS_DOK, []); const idx = all.findIndex(d => d.id === docId); if (idx >= 0) { all[idx].deleteRequested = true; all[idx].deleteRequestedBy = requesterName; localSet(LS_DOK, all); } return; }
  for (const r of cacheGet("investments")) {
    const meta = r.meta || {};
    const docs: InvestmentDokument[] = meta._docs || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx >= 0) { docs[idx].deleteRequested = true; docs[idx].deleteRequestedBy = requesterName; setMetaField(r.id, "_docs", docs); return; }
  }
}

// Per-investment data helpers – now stored in investment meta
export function getInvestmentDocStatuses(investmentId: string): Record<string, "none" | "uploaded" | "approved" | "rejected"> { return getMetaField(investmentId, "docStatuses", {}); }
export function setInvestmentDocStatus(investmentId: string, docName: string, status: "none" | "uploaded" | "approved" | "rejected") {
  const s = { ...getInvestmentDocStatuses(investmentId), [docName]: status };
  setMetaField(investmentId, "docStatuses", s);
}
export function getDocRejectReasons(investmentId: string): Record<string, string> { return getMetaField(investmentId, "docRejectReasons", {}); }
export function setDocRejectReason(investmentId: string, docName: string, reason: string) { const r = getDocRejectReasons(investmentId); r[docName] = reason; setMetaField(investmentId, "docRejectReasons", r); }
export function clearDocRejectReason(investmentId: string, docName: string) { const r = getDocRejectReasons(investmentId); delete r[docName]; setMetaField(investmentId, "docRejectReasons", r); }
/** Atomar: Status + Ablehnungsgrund in EINEM Schreibvorgang setzen.
 *  Verhindert, dass zwei sequentielle Saves (Status, Grund) durch
 *  Netzwerkfehler nur teilweise persistiert werden. */
export function rejectInvestmentDoc(investmentId: string, docName: string, reason: string) {
  const statuses = { ...getInvestmentDocStatuses(investmentId), [docName]: "rejected" as const };
  const reasons = { ...getDocRejectReasons(investmentId), [docName]: reason };
  setMetaFields(investmentId, { docStatuses: statuses, docRejectReasons: reasons });
}
export function getInvestmentSaPdf(investmentId: string): string { return getMetaField(investmentId, "saPdf", ""); }
export function setInvestmentSaPdf(investmentId: string, filename: string) { setMetaField(investmentId, "saPdf", filename); }
/** PDF-Weg der Selbstauskunft: wann "PDF an Kunden senden" zuerst geklickt wurde. Steuert die Sichtbarkeit des Upload-Bereichs. */
export function getSaPdfWegGestartet(investmentId: string): string { return getMetaField(investmentId, "saPdfWegGestartetAm", ""); }
export function setSaPdfWegGestartet(investmentId: string) { setMetaField(investmentId, "saPdfWegGestartetAm", new Date().toISOString()); }
/** Speicherpfad der hochgeladenen Papier-Selbstauskunft (Bucket unterlagen). Gesetzt = Papierweg abgeschlossen, Bearbeiten-Knopf entfaellt. */
export function getSaPapierUpload(investmentId: string): string { return getMetaField(investmentId, "saPapierUploadPfad", ""); }
export function setSaPapierUpload(investmentId: string, storagePath: string) { setMetaField(investmentId, "saPapierUploadPfad", storagePath); }
/**
 * Selbstauskunft als vorliegend vermerken: nach dem Papier-Upload (mit Pfad)
 * oder bei der Freigabe (ohne). `saPdf` setzt seit 30.09.2026 nur noch die
 * Datenbankfunktion, sie prüft Datei und Unterschrift. Ohne die Migration
 * läuft der alte Weg.
 */
export async function vermerkeSaPdf(investmentId: string, dateiname: string, papierPfad?: string): Promise<void> {
  if (!isTestAccount() && await saPdfVermerken(investmentId, dateiname, papierPfad) === "ok") {
    if (papierPfad) setInvestmentMetaNurLokal(investmentId, "saPapierUploadPfad", papierPfad);
    setInvestmentMetaNurLokal(investmentId, "saPdf", dateiname);
    return;
  }
  if (papierPfad) setSaPapierUpload(investmentId, papierPfad);
  setInvestmentSaPdf(investmentId, dateiname);
}
export function getInvestmentRvPdf(investmentId: string): string { return getMetaField(investmentId, "rvPdf", ""); }
/**
 * Reservierungsvereinbarung hinterlegen.
 *
 * Zusaetzlich zum Dateinamen wird der Zeitpunkt festgehalten. Der Trigger
 * "Reservierung liegt vor, ist aber nicht unterschrieben" braucht ihn, um
 * ueberhaupt eine Frist rechnen zu koennen. Ein bereits gesetzter Zeitpunkt
 * bleibt stehen, damit ein erneutes Hochladen die Frist nicht zurueckstellt.
 */
export function setInvestmentRvPdf(investmentId: string, filename: string) {
  const bereitsGeoeffnet = getMetaField<string>(investmentId, "rvOpenedAt", "");
  setMetaFields(investmentId, {
    rvPdf: filename,
    ...(bereitsGeoeffnet ? {} : { rvOpenedAt: new Date().toISOString() }),
  });
}
export function getInvestmentNotarData(investmentId: string): Record<string, string> { return getMetaField(investmentId, "notarData", {}); }
export function setInvestmentNotarData(investmentId: string, data: Record<string, string>) { setMetaField(investmentId, "notarData", data); }
export function getNotarGesendet(investmentId: string): boolean { return getMetaField(investmentId, "notarGesendet", false); }
export function setNotarGesendet(investmentId: string, value: boolean) { setMetaField(investmentId, "notarGesendet", value); if (value) setMetaField(investmentId, "notarGesendetAt", new Date().toISOString()); }
export function getNotarGesendetAt(investmentId: string): string { return getMetaField(investmentId, "notarGesendetAt", ""); }
export function getNotarTerminPortalFreigabe(investmentId: string): boolean { return getMetaField(investmentId, "notarTerminPortalFreigabe", false); }
export function setNotarTerminPortalFreigabe(investmentId: string, value: boolean) { setMetaField(investmentId, "notarTerminPortalFreigabe", value); if (value) setMetaField(investmentId, "notarTerminPortalFreigabeAt", new Date().toISOString()); }
export function getNotarTerminPortalFreigabeAt(investmentId: string): string { return getMetaField(investmentId, "notarTerminPortalFreigabeAt", ""); }
export function getInvestmentNotarFoto(investmentId: string): string { return getMetaField(investmentId, "notarFoto", ""); }
export function setInvestmentNotarFoto(investmentId: string, filename: string) { setMetaField(investmentId, "notarFoto", filename); }
export function getUnterlagenFreigeschalten(kontaktId: string): boolean {
  // Die Regel selbst (hinterlegte Selbstauskunft ODER explizite Freischaltung
  // ODER aktiviertes Kundenportal) liegt in unterlagenFreigabe.ts, damit das
  // Kundenportal exakt dieselbe Entscheidung trifft, ohne diesen Store (und
  // damit den dataCache) zu laden. Auf Kontakt-Ebene zaehlt die SA jedes
  // Investments: Sobald irgendeine hinterlegt ist, sind die Unterlagen offen.
  type InvZeile = { kunde_id?: string; meta?: Record<string, unknown> };
  const zeilen = (cacheGet("investments") as InvZeile[]).filter((r) => r.kunde_id === kontaktId);
  if (zeilen.some((r) => istSaHinterlegtAusMeta(r?.meta))) return true;
  return istUnterlagenFreigeschaltetAusMeta(undefined, {
    unterlagenFreigeschaltet: getKontaktMetaField(kontaktId, "unterlagenFreigeschaltet", false),
    portalFreigeschalten: getKontaktMetaField(kontaktId, "portalFreigeschalten", false),
    portalAktiviert: getKontaktMetaField(kontaktId, "portalAktiviert", false),
  });
}
export function setUnterlagenFreigeschalten(kontaktId: string, value: boolean) {
  if (isTestAccount()) {
    localStorage.setItem(`mi_k_unterlagenFreigeschaltet_${kontaktId}`, JSON.stringify(value));
    if (value) localStorage.setItem(`mi_k_unterlagenFreigeschaltetAt_${kontaktId}`, JSON.stringify(new Date().toISOString()));
    else localStorage.setItem(`mi_k_unterlagenFreigeschaltetAt_${kontaktId}`, JSON.stringify(""));
    return;
  }
  // Single atomic merge with both fields to prevent race condition
  const updates: Record<string, any> = { unterlagenFreigeschaltet: value };
  if (value) updates.unterlagenFreigeschaltetAt = new Date().toISOString();
  else updates.unterlagenFreigeschaltetAt = "";
  // Optimistic local update – ueber cacheSet, damit die Tabellenversion steigt
  // und die Anzeige nachzieht.
  const row = cacheGet("kontakte").find((r: any) => r.id === kontaktId);
  if (row) {
    const meta = { ...(row.meta || {}), ...updates };
    const arr = cacheGet("kontakte");
    const idx = arr.findIndex((r: any) => r.id === kontaktId);
    if (idx >= 0) {
      const naechste = [...arr];
      naechste[idx] = { ...naechste[idx], meta };
      cacheSet("kontakte", naechste);
    }
  }
  // Atomic server-side merge
  import("@/integrations/supabase/client").then(({ supabase }) => {
    supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: kontaktId,
      _updates: updates,
    }).then(({ data, error }) => {
      if (error) console.error("merge_kontakt_meta error:", error);
      else if (data) {
        const arr2 = cacheGet("kontakte");
        const idx2 = arr2.findIndex((r: any) => r.id === kontaktId);
        if (idx2 >= 0) {
          const naechste2 = [...arr2];
          naechste2[idx2] = { ...naechste2[idx2], meta: data };
          cacheSet("kontakte", naechste2);
        }
      }
    });
  });
}
export function getUnterlagenFreigeschaltetAt(kontaktId: string): string { return getKontaktMetaField(kontaktId, "unterlagenFreigeschaltetAt", ""); }

// ── Per-Investment Unterlagen-Freischaltung ──────────────────────────────
// Hat das Investment ein eigenes boolesches Flag, gilt das Flag. Ohne eigenes
// Flag fällt JEDES Investment auf die Kontakt-Ebene zurück (inklusive
// Auto-Freischaltung über die Portal-Aktivierung). Dieselbe Regel nutzt das
// Kundenportal über istUnterlagenFreigeschaltetAusMeta (unterlagenFreigabe.ts);
// Änderungen hier müssen dort nachgezogen werden.
export function getInvestmentUnterlagenFreigeschalten(investmentId: string): boolean {
  const inv = getInvestmentById(investmentId);
  if (!inv) return false;
  const raw = getRawRow(investmentId);
  const meta: any = raw?.meta || {};
  // Hinterlegte SA schaltet frei, auch ueber ein sperrendes Investment-Flag
  // hinweg (gleiche Reihenfolge wie istUnterlagenFreigeschaltetAusMeta).
  if (istSaHinterlegtAusMeta(meta)) return true;
  if (typeof meta.unterlagenFreigeschaltet === "boolean") return meta.unterlagenFreigeschaltet;
  // Fallback: Kontakt-Level-Flag (inkl. SA anderer Investments und
  // Auto-Freischaltung via Portal-Aktivierung)
  return getUnterlagenFreigeschalten(inv.kontaktId);
}
export function getInvestmentUnterlagenFreigeschaltetAt(investmentId: string): string {
  const inv = getInvestmentById(investmentId);
  if (!inv) return "";
  const raw = getRawRow(investmentId);
  const meta: any = raw?.meta || {};
  if (meta.unterlagenFreigeschaltetAt !== undefined) return meta.unterlagenFreigeschaltetAt || "";
  if (inv.nummer === 1) return getUnterlagenFreigeschaltetAt(inv.kontaktId);
  return "";
}
export function setInvestmentUnterlagenFreigeschalten(investmentId: string, value: boolean) {
  const updates: Record<string, any> = { unterlagenFreigeschaltet: value };
  updates.unterlagenFreigeschaltetAt = value ? new Date().toISOString() : "";
  setMetaFields(investmentId, updates);
}

// Custom bank docs added by VP/Admin
export interface CustomBankDoc { id: string; name: string; required: boolean; addedBy: string; addedAt: string; }
export function getCustomBankDocs(kontaktId: string): CustomBankDoc[] { return getKontaktMetaField<CustomBankDoc[]>(kontaktId, "customBankDocs", []); }
export function addCustomBankDoc(kontaktId: string, name: string, addedBy: string): CustomBankDoc {
  const docs = getCustomBankDocs(kontaktId);
  const doc: CustomBankDoc = { id: `cbd-${Date.now()}`, name, required: true, addedBy, addedAt: new Date().toISOString() };
  docs.push(doc);
  setKontaktMetaField(kontaktId, "customBankDocs", docs);
  return doc;
}
export function removeCustomBankDoc(kontaktId: string, docId: string) {
  const docs = getCustomBankDocs(kontaktId).filter(d => d.id !== docId);
  setKontaktMetaField(kontaktId, "customBankDocs", docs);
}
export function getUnterlagenGesendet(kontaktId: string, investmentId: string): boolean { return getMetaField(investmentId, "unterlagenGesendet", false); }
export function setUnterlagenGesendet(kontaktId: string, investmentId: string) { setMetaField(investmentId, "unterlagenGesendet", true); }
export type SaEditStatus = "none" | "beantragt" | "freigegeben" | "in_bearbeitung" | "unterschrift_versendet" | "abgeschlossen";
export function getSaEditStatus(investmentId: string): SaEditStatus { return getMetaField(investmentId, "saEditStatus", "none"); }
export function setSaEditStatus(investmentId: string, status: SaEditStatus) { setMetaField(investmentId, "saEditStatus", status); if (status !== "none") setMetaField(investmentId, "saEditTimestamp", new Date().toISOString()); }
export function getSaEditTimestamp(investmentId: string): string { return getMetaField(investmentId, "saEditTimestamp", ""); }
export function getSaSignaturePending(investmentId: string): boolean { return getMetaField(investmentId, "saSignaturePending", false); }
export function setSaSignaturePending(investmentId: string, value: boolean) { setMetaField(investmentId, "saSignaturePending", value); }
export function getSaSigned(investmentId: string): boolean { return getMetaField(investmentId, "saSigned", false); }
export function setSaSigned(investmentId: string, value: boolean) { setMetaField(investmentId, "saSigned", value); }
/**
 * Wartet die korrigierte Selbstauskunft auf ihre neue Unterschrift?
 *
 * Dann gilt ein noch vorhandenes `saPdf` nicht als „liegt vor“. Die Regel
 * steht in `supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts`.
 */
export function getSaNeueUnterschriftAusstehend(investmentId: string): boolean {
  return saNeueUnterschriftAusstehend({
    saSigned: getMetaField<unknown>(investmentId, "saSigned", undefined),
    saSignaturePending: getMetaField<unknown>(investmentId, "saSignaturePending", undefined),
    saPdf: getMetaField<unknown>(investmentId, "saPdf", undefined),
    saPapierUpload: getMetaField<unknown>(investmentId, "saPapierUpload", undefined),
    saNeueUnterschriftSeit: getMetaField<unknown>(investmentId, "saNeueUnterschriftSeit", undefined),
  });
}
export function getRvSignaturePending(investmentId: string): boolean { return getMetaField(investmentId, "rvSignaturePending", false); }
export function setRvSignaturePending(investmentId: string, value: boolean) { setMetaField(investmentId, "rvSignaturePending", value); }
export function getRvSigned(investmentId: string): boolean { return getMetaField(investmentId, "rvSigned", false); }
export function setRvSigned(investmentId: string, value: boolean) { setMetaField(investmentId, "rvSigned", value); }
export function getRvSignatureSentAt(investmentId: string): string { return getMetaField(investmentId, "rvSignatureSentAt", ""); }
export function setRvSignatureSentAt(investmentId: string, value: string) { setMetaField(investmentId, "rvSignatureSentAt", value); }
export function getRvEditApproved(investmentId: string): boolean { return getMetaField(investmentId, "rvEditApproved", false); }
export function setRvEditApproved(investmentId: string, value: boolean) { setMetaField(investmentId, "rvEditApproved", value); }

/**
 * Die Reservierungsvereinbarungen dieses Kunden, die auf die Unterschrift
 * warten.
 *
 * Gebraucht von der Kachel "Nächste Aktion" im Kundenprofil. Dort stand
 * bisher "Nichts geplant", während die Vereinbarung beim Kunden lag: Eine
 * ausstehende Unterschrift ist weder Termin noch Aufgabe und tauchte deshalb
 * in keiner der Quellen auf.
 *
 * Gilt fuer alle offenen Vereinbarungen, auch fuer solche vor dem Stichtag
 * der Erinnerungen (`RV_ERINNERUNG_AB`): Das hier ist Anzeige, keine
 * Erinnerung. Ohne `rvSignatureSentAt` steht `versendetMs` auf null, die
 * Kachel nennt dann keine Dauer.
 */
export function getWartendeRvUnterschriften(
  kontaktId: string,
): Array<{ investmentId: string; bezeichnung: string; versendetMs: number | null }> {
  if (!kontaktId) return [];
  const treffer: Array<{ investmentId: string; bezeichnung: string; versendetMs: number | null }> = [];
  for (const inv of getInvestmentsByKontakt(kontaktId)) {
    const stand = rvUnterschriftStand({
      rvSignaturePending: getMetaField<boolean>(inv.id, "rvSignaturePending", false),
      rvSigned: getMetaField<boolean>(inv.id, "rvSigned", false),
      rvSignatureSentAt: getMetaField<string>(inv.id, "rvSignatureSentAt", ""),
      rvReservierungEntfallenAm: getMetaField<string>(inv.id, "rvReservierungEntfallenAm", ""),
      rvPdf: getMetaField<string>(inv.id, "rvPdf", ""),
    });
    if (!stand.wartet) continue;
    treffer.push({ investmentId: inv.id, bezeichnung: "Reservierungsvereinbarung", versendetMs: stand.seit ? stand.seit.getTime() : null });
  }
  return treffer;
}

/** Clear all reservation-agreement related data (signed PDF, signatures, form data, status flags). */
export function clearRvSignatureData(investmentId: string): void {
  setMetaFields(investmentId, {
    rvPdf: "",
    rvData: null,
    rvSignatures: null,
    rvSigned: false,
    rvSignaturePending: false,
    rvSignatureSentAt: "",
    rvEditApproved: false,
    reserviertAm: null,
  });
}

export function clearEinheitGewechselt(investmentId: string): void {
  setMetaFields(investmentId, {
    einheitGewechseltAm: null,
    einheitGewechseltVon: null,
  });
}

/** Persist the full SA form data to investment meta so it survives page reloads / draft clears */
export function getSaData(investmentId: string): any | null { return getMetaField(investmentId, "saData", null); }
/**
 * Wann der Kunde zuletzt selbst an seiner Selbstauskunft gearbeitet hat.
 *
 * Grundlage der Vorfahrtsregel: Arbeiten Berater und Kunde am selben Stand,
 * gewinnen immer die Angaben des Kunden. Gesetzt wird der Wert von den Edge
 * Functions `update-sa-signature-data` und `finalize-selbstauskunft`.
 */
export function getSaKundeStandAm(investmentId: string): string | null { return getMetaField(investmentId, "saKundeStandAm", null); }
export function setSaData(investmentId: string, data: any) { setMetaField(investmentId, "saData", data); }

/**
 * NUR die eigene Selbstauskunft eines Investments, ohne jeden Rückfall.
 *
 * Anders als `getSaData` zählt der Snapshot `saSnapshot` mit. Das ist
 * dieselbe Selbstauskunft, nur an der zweiten Stelle abgelegt, an der sie
 * historisch landet. Regel und Begründung stehen in saQuelle.ts.
 */
export function getEigeneSaData(investmentId: string): any | null {
  const row = cacheGet("investments").find((r: any) => r.id === investmentId) || null;
  return eigeneSaDataFuerInvestmentRow(row);
}

/**
 * Die Selbstauskunft des VORHERIGEN Investments, AUSSCHLIESSLICH zur
 * Vorbelegung des Selbstauskunfts-Formulars.
 *
 * Der Name sagt bewusst, was hier passiert: Es wird übernommen. Das ist an
 * dieser einen Stelle gewollt, damit der Kunde beim zweiten Investment nicht
 * alles noch einmal tippen muss, sondern nur korrigiert. Er bestätigt danach
 * selbst, und erst diese Bestätigung macht die Angaben zur Selbstauskunft
 * des neuen Investments.
 *
 * Wird `investmentId` übergeben, ist die Quelle das Investment davor: Für
 * Investment 5 also Investment 4, und wenn das keine hat, das nächste davor,
 * das eine hat. Ohne `investmentId` gilt das letzte Investment der Reihe.
 *
 * Zurück kommt neben den Angaben immer die Nummer des Quell-Investments. Sie
 * gehört in den Hinweis am Formular, denn eine Übernahme ohne sichtbare
 * Herkunft ist genau das, was hier nicht passieren soll.
 *
 * Für jede Anzeige gilt das Gegenteil, siehe `getEigeneSaData` und
 * saQuelle.ts. Diese Funktion darf deshalb nirgendwo sonst aufgerufen werden.
 */
export function getSaDataZurVorbelegung(
  kontaktId: string,
  investmentId?: string,
): { data: any; ausInvestment: number } | null {
  if (isTestAccount()) return null;
  const rows = cacheGet("investments").filter((r: any) => r.kunde_id === kontaktId);
  const quelle = saVomVorherigenInvestment(investmentId || null, rows);
  if (!quelle) return null;
  return { data: quelle.saData, ausInvestment: quelle.nummer };
}

export const KUNDENORDNER_DEFAULT_KATEGORIEN = ["Reservierungsvertrag", "IBAN Immobilienkonto", "Kaufvertragsentwurf", "Grundschuld", "Kaufvertrag", "Kaufpreisfälligkeit", "GBA Erwerbvormerkung", "Darlehensvertrag", "Kaufnebenkosten", "Beratungsdokument"] as const;
export const KUNDENORDNER_KATEGORIEN = KUNDENORDNER_DEFAULT_KATEGORIEN;
export type KundenordnerKategorie = string;
export interface KundenordnerDokument { id: string; investmentId: string; kategorie: KundenordnerKategorie; filename: string; uploadedBy: string; uploadedAt: string; linkedPdf?: string; fileUrl?: string; freigegeben?: boolean; }

/** Get custom categories added by admin for this investment */
export function getCustomKundenordnerKategorien(investmentId: string): string[] { return getMetaField<string[]>(investmentId, "kundenordnerCustomKat", []); }
export function setCustomKundenordnerKategorien(investmentId: string, kats: string[]) { setMetaField(investmentId, "kundenordnerCustomKat", kats); }
/** Get all categories (default + custom) */
export function getAllKundenordnerKategorien(investmentId: string): string[] { return [...KUNDENORDNER_DEFAULT_KATEGORIEN, ...getCustomKundenordnerKategorien(investmentId)]; }
/** Get renamed categories map */
export function getKundenordnerRenames(investmentId: string): Record<string, string> { return getMetaField(investmentId, "kundenordnerRenames", {}); }
export function setKundenordnerRenames(investmentId: string, renames: Record<string, string>) { setMetaField(investmentId, "kundenordnerRenames", renames); }
/** Get removed default categories */
export function getRemovedKundenordnerKat(investmentId: string): string[] { return getMetaField<string[]>(investmentId, "kundenordnerRemovedKat", []); }
export function setRemovedKundenordnerKat(investmentId: string, removed: string[]) { setMetaField(investmentId, "kundenordnerRemovedKat", removed); }
/** Get visible categories (default - removed + custom) */
export function getVisibleKundenordnerKategorien(investmentId: string): string[] {
  const removed = getRemovedKundenordnerKat(investmentId);
  const defaults = KUNDENORDNER_DEFAULT_KATEGORIEN.filter(k => !removed.includes(k));
  const custom = getCustomKundenordnerKategorien(investmentId);
  return [...defaults, ...custom];
}

export function getKundenordnerByInvestment(investmentId: string) { return getMetaField<KundenordnerDokument[]>(investmentId, "kundenordner", []); }
export function addKundenordnerDokument(doc: Omit<KundenordnerDokument, "id">) { const all = getKundenordnerByInvestment(doc.investmentId); const newDoc: KundenordnerDokument = { ...doc, id: `ko-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }; all.push(newDoc); setMetaField(doc.investmentId, "kundenordner", all); return newDoc; }
export function updateKundenordnerDokument(docId: string, fields: Partial<KundenordnerDokument>) {
  if (isTestAccount()) return;
  for (const r of cacheGet("investments")) {
    const docs: KundenordnerDokument[] = ((r.meta || {}).kundenordner as any) || [];
    const idx = docs.findIndex(d => d.id === docId);
    if (idx >= 0) { docs[idx] = { ...docs[idx], ...fields }; setMetaField(r.id, "kundenordner", docs); return; }
  }
}
export function removeKundenordnerDokument(docId: string) {
  // Find which investment has this doc
  if (isTestAccount()) { localSet("mi_kundenordner", localGet<KundenordnerDokument[]>("mi_kundenordner", []).filter(d => d.id !== docId)); return; }
  for (const r of cacheGet("investments")) {
    const docs = ((r.meta || {}).kundenordner as KundenordnerDokument[]) || [];
    if (docs.some(d => d.id === docId)) { setMetaField(r.id, "kundenordner", docs.filter(d => d.id !== docId)); return; }
  }
}

export async function migrateKundeToInvestment(kontaktId: string, kundeData: { pipelineStufe?: string; objektId?: string; objektTitel?: string; wohnungId?: string; weNr?: string; notarTermin?: string; notarUhrzeit?: string; notarName?: string; notarAdresse?: string; notarVerkaeufervertretung?: string; finanzierungsStatus?: "offen" | "bestaetigt" | "abgelehnt"; }): Promise<Investment> {
  const existing = getInvestmentsByKontakt(kontaktId);
  if (existing.length > 0) return existing[0];
  /*
   * Gegenprobe in der Datenbank, bevor angelegt wird.
   *
   * Der Zwischenspeicher kann beim Seitenaufruf noch leer sein. Ohne diese
   * Prüfung hat jeder Neuladevorgang eines Kundenprofils ein weiteres
   * Investment erzeugt, weil die Altbestands-Migration den leeren Cache für
   * „hat noch kein Investment" gehalten hat.
   */
  if (!isTestAccount()) {
    const { data: vorhanden } = await supabase
      .from("investments")
      .select("id")
      .eq("kunde_id", kontaktId)
      .limit(1);
    if (vorhanden && vorhanden.length > 0) {
      const wieder = getInvestmentsByKontakt(kontaktId);
      if (wieder.length > 0) return wieder[0];
      throw new Error("Investment bereits vorhanden – Anlage abgebrochen");
    }
  }
  const inv = await createInvestment(kontaktId, kundeData.objektTitel ? `${kundeData.objektTitel}${kundeData.weNr ? ` WE ${kundeData.weNr}` : ""}` : "Investment 1");
  updateInvestment(inv.id, { pipelineStufe: kundeData.pipelineStufe || "neuer_lead", objektId: kundeData.objektId, objektTitel: kundeData.objektTitel, wohnungId: kundeData.wohnungId, weNr: kundeData.weNr, notarTermin: kundeData.notarTermin, notarUhrzeit: kundeData.notarUhrzeit, notarName: kundeData.notarName, notarAdresse: kundeData.notarAdresse, notarVerkaeufervertretung: kundeData.notarVerkaeufervertretung, finanzierungsStatus: kundeData.finanzierungsStatus });
  return { ...inv, ...kundeData } as Investment;
}

export function getSaInvitationSentAt(investmentId: string): string { return getMetaField(investmentId, "saInvitationSentAt", ""); }
export function setSaInvitationSentAt(investmentId: string) { setMetaField(investmentId, "saInvitationSentAt", new Date().toISOString()); }

// ── Kaufvertrag (Aufnahmebogen Notar) ──
export interface KaufvertragData {
  // Verkäufer
  /**
   * Firma oder Privatperson, ausdrücklich gewählt.
   *
   * Bei einer Firma steht der Firmenname allein in `vk_name` und `vk_vorname`
   * bleibt leer. Bei einer Privatperson sind es Nachname und Vorname. Leer
   * heißt: noch nicht gewählt, dann bleibt stehen, was da ist. Siehe
   * `verkaeuferName.ts`.
   */
  vk_art?: "firma" | "person" | "";
  vk_name?: string; vk_vorname?: string; vk_geburtsdatum?: string; vk_geburtsname?: string;
  vk_anschrift?: string; vk_telefon?: string; vk_email?: string; vk_familienstand?: string;
  vk_steuerid?: string; vk_hrb?: string; vk_vollmacht?: "vorhanden" | "nicht_vorhanden" | "";
  vk_vollmacht_datei?: string;
  // Käufer
  k_name?: string; k_vorname?: string; k_geburtsdatum?: string; k_geburtsname?: string;
  k_anschrift?: string; k_telefon?: string; k_email?: string; k_familienstand?: string;
  k_steuerid?: string; k_vollmacht?: "vorhanden" | "nicht_vorhanden" | "";
  k_vollmacht_datei?: string;
  // Vertragsobjekt
  amtsgericht?: string; gemarkung?: string; blatt?: string; flnr?: string;
  obj_adresse?: string; obj_bebauung?: string; kaufpreis?: string;
  /**
   * Um welche Wohnung im Haus es geht.
   *
   * Die Adresse benennt bis hierher nur das Haus, also „Roonstraße 3, 95028
   * Hof“. Welche der Wohnungen darin verkauft wird, stand im Bogen nirgends,
   * und damit wusste der Notar es auch nicht.
   *
   * Es sind zwei verschiedene Angaben, deshalb zwei Felder:
   *
   *   `obj_wohneinheit` ist die Nummer, unter der die Wohnung im Haus geführt
   *   wird. Seit 09/2026 eine reine Zahl. Sie kommt aus Schritt 1 der
   *   Objektauswahl und steht auch in der Reservierungsvereinbarung.
   *
   *   `obj_wohnungsnummer` ist die Bezeichnung laut Teilungserklärung, also
   *   aus der notariellen Urkunde. Sie kann von der Wohneinheit abweichen und
   *   ist die rechtlich maßgebliche. Für den Notar zählt diese.
   */
  obj_wohneinheit?: string; obj_wohnungsnummer?: string;
  /**
   * Das ganze Haus (Globalobjekt), seit dem 23.09.2026. Dann gibt es keine
   * Wohnung im Haus, und der Bogen fragt weder nach Wohneinheit noch nach
   * Wohnungsnummer laut Teilungserklärung. Gesetzt aus dem Kennzeichen
   * `globalObjekt` am Investment, das die Reservierung des Hauses schreibt.
   */
  obj_gesamtobjekt?: boolean;
  // Bankverbindung Verkäufer
  bank_name?: string; bank_institut?: string; bank_iban?: string; bank_bic?: string;
  // Besitz
  vermietet?: boolean;
  // Instandhaltungsrücklage
  ruecklage_datum?: string; ruecklage_gesamt?: string; ruecklage_anteilig?: string;
  // Inventar
  inventar_mitverkauft?: string; inventar_auflistung?: string; inventar_kaufpreis?: string;
  // Makler
  makler_name?: string; makler_anschrift?: string; makler_provision?: string;
  // Hausverwaltung
  hv_name?: string; hv_anschrift?: string;
  // Abzulösende Bank
  bank_aktenzeichen?: string; bank_abloesend_anschrift?: string;
  // Sonstige Notizen
  sonstige_notizen?: string;
}
export function getKaufvertragData(investmentId: string): KaufvertragData { return getMetaField(investmentId, "kaufvertragData", {}); }
export function setKaufvertragData(investmentId: string, data: KaufvertragData) { setMetaField(investmentId, "kaufvertragData", data); setMetaField(investmentId, "kaufvertragUpdatedAt", new Date().toISOString()); }
export function getKaufvertragUpdatedAt(investmentId: string): string { return getMetaField(investmentId, "kaufvertragUpdatedAt", ""); }
export function getKaufvertragPdf(investmentId: string): string { return getMetaField(investmentId, "kaufvertragPdf", ""); }
export function setKaufvertragPdf(investmentId: string, filename: string) { setMetaField(investmentId, "kaufvertragPdf", filename); }
export function deleteKaufvertragPdf(investmentId: string) {
  // Atomarer Reset: Aufnahmebogen, Notar-Daten, Modus, Vorschläge, Bestätigung, Portal-Freigabe
  // in EINEM einzigen DB-Write – verhindert Race Conditions, durch die Reste im Kundenportal blieben.
  setMetaFields(investmentId, {
    kaufvertragPdf: "",
    kaufvertragData: {},
    kaufvertragUpdatedAt: "",
    notarData: {},
    notarGesendet: false,
    notarGesendetAt: "",
    notarFreigegeben: false,
    notarTermin: "",
    notarUhrzeit: "",
    notarName: "",
    notarAdresse: "",
    notarTelefon: "",
    notarVerkaeufervertretung: "",
    notarVerkaeufer: "",
    notarTerminModus: "gesetzt",
    notarTerminVorschlaege: [],
    notarTerminVorschlaegeFreigegeben: [],
    notarTerminBestaetigt: null,
    notarTerminPortalFreigabe: false,
    notarTerminPortalFreigabeAt: "",
  });
}
// Notar-Email
export function getNotarEmail(investmentId: string): string { return getMetaField(investmentId, "notarEmail", ""); }
export function setNotarEmail(investmentId: string, value: string) { setMetaField(investmentId, "notarEmail", value); }
// Notartermin Zeitstempel
export function getNotarterminEingetragenAt(investmentId: string): string { return getMetaField(investmentId, "notarterminEingetragenAt", ""); }
export function setNotarterminEingetragenAt(investmentId: string) { setMetaField(investmentId, "notarterminEingetragenAt", new Date().toISOString()); }

// Notartermin-Modus: VP wählt zwischen "gesetzt" (fixer Termin) oder "vorschlaege" (Kunde wählt)
export type NotarTerminModus = "gesetzt" | "vorschlaege";
export function getNotarTerminModus(investmentId: string): NotarTerminModus {
  return getMetaField(investmentId, "notarTerminModus", "gesetzt");
}
export function setNotarTerminModus(investmentId: string, modus: NotarTerminModus) {
  setMetaField(investmentId, "notarTerminModus", modus);
}

// Notartermin-Vorschläge (mehrere Alternativtermine zur Kundenwahl)
export interface NotarTerminVorschlag { datum: string; uhrzeit: string; }
export function getNotarTerminVorschlaege(investmentId: string): NotarTerminVorschlag[] {
  return getMetaField(investmentId, "notarTerminVorschlaege", []);
}
export function setNotarTerminVorschlaege(investmentId: string, vorschlaege: NotarTerminVorschlag[]) {
  setMetaField(investmentId, "notarTerminVorschlaege", vorschlaege);
}
// Nur die vom VP explizit freigegebenen Vorschläge sind im Kundenportal sichtbar
export function getNotarTerminVorschlaegeFreigegeben(investmentId: string): NotarTerminVorschlag[] {
  return getMetaField(investmentId, "notarTerminVorschlaegeFreigegeben", []);
}
export function setNotarTerminVorschlaegeFreigegeben(investmentId: string, vorschlaege: NotarTerminVorschlag[]) {
  setMetaField(investmentId, "notarTerminVorschlaegeFreigegeben", vorschlaege);
}
export function getNotarTerminBestaetigt(investmentId: string): { datum: string; uhrzeit: string; bestaetigtAm: string } | null {
  return getMetaField(investmentId, "notarTerminBestaetigt", null);
}
export function setNotarTerminBestaetigt(investmentId: string, datum: string, uhrzeit: string) {
  setMetaField(investmentId, "notarTerminBestaetigt", { datum, uhrzeit, bestaetigtAm: new Date().toISOString() });
}
export function clearNotarTerminBestaetigt(investmentId: string) {
  setMetaField(investmentId, "notarTerminBestaetigt", null);
}

/**
 * Atomare Notartermin-Portal-Freigabe in EINEM DB-Update.
 * Verhindert Race-Conditions zwischen mehreren setMetaField-Aufrufen,
 * die sonst gegenseitig Felder im meta-Objekt überschreiben würden
 * ("Speichern fehlgeschlagen" / Termin nicht im Portal sichtbar).
 */
export function freigebenNotarTerminPortal(
  investmentId: string,
  options: {
    vorschlaegeFreigegeben?: NotarTerminVorschlag[];
    clearBestaetigt?: boolean;
    pipelineStufe?: string;
  } = {},
): void {
  const updates: Record<string, any> = {
    notarTerminPortalFreigabe: true,
    notarTerminPortalFreigabeAt: new Date().toISOString(),
  };
  if (options.vorschlaegeFreigegeben !== undefined) {
    updates.notarTerminVorschlaegeFreigegeben = options.vorschlaegeFreigegeben;
  }
  if (options.clearBestaetigt) {
    updates.notarTerminBestaetigt = null;
  }
  if (options.pipelineStufe) {
    updates.pipelineStufe = options.pipelineStufe;
  }
  setMetaFields(investmentId, updates);
}

/**
 * Atomares Zurückziehen der Portal-Freigabe + zugehöriger Felder.
 */
export function zurueckziehenNotarTerminPortal(investmentId: string): void {
  setMetaFields(investmentId, {
    notarTerminPortalFreigabe: false,
    notarTerminVorschlaegeFreigegeben: [],
    notarTerminBestaetigt: null,
  });
}

/**
 * Atomarer Notartermin-Modus-Wechsel.
 * Vorher wurden bis zu 4 separate merge_investment_meta RPCs parallel gefeuert
 * (setNotarTerminModus + zurueckziehenNotarTerminPortal + setInvestmentNotarFields +
 * clearNotarTerminBestaetigt) – das führte zu Race-Conditions und
 * "Speichern fehlgeschlagen"-Toasts. Jetzt EIN atomarer Write.
 */
export function switchNotarTerminModus(
  investmentId: string,
  next: NotarTerminModus,
): void {
  const row = getRawRow(investmentId);
  const currentMeta: any = row?.meta || {};
  const currentNotarData: Record<string, string> = currentMeta.notarData || {};
  const updates: Record<string, any> = {
    notarTerminModus: next,
    // Portal-Freigabe in jedem Fall zurücksetzen, damit nichts Altes hängenbleibt
    notarTerminPortalFreigabe: false,
    notarTerminVorschlaegeFreigegeben: [],
    notarTerminBestaetigt: null,
  };
  if (next === "gesetzt") {
    // Vorschläge entfernen, fixer Termin wird neu eingetragen
    updates.notarTerminVorschlaege = [];
  } else {
    // Fixer Termin entfernen, damit Kunde keinen veralteten Termin sieht
    updates.notarData = { ...currentNotarData, datum: "", uhrzeit: "" };
    updates.notarTermin = "";
    updates.notarUhrzeit = "";
  }
  setMetaFields(investmentId, updates);
}

// SA Bearbeitungs-Version Zeitstempel
export function getSaEditVersion(investmentId: string): number { return getMetaField(investmentId, "saEditVersion", 1); }
export function setSaEditVersion(investmentId: string, v: number) { setMetaField(investmentId, "saEditVersion", v); }
export function getSaEditVersionAt(investmentId: string): string { return getMetaField(investmentId, "saEditVersionAt", ""); }
export function setSaEditVersionAt(investmentId: string) { setMetaField(investmentId, "saEditVersionAt", new Date().toISOString()); }

/**
 * Check if Grundschuld is uploaded for a given kundeId.
 * Looks at finanzierung angebote docs for a doc named "Grundschuld" with status !== "none".
 */
export function isGrundschuldUploaded(kundeId: string): boolean {
  try {
    const { getFinanzierung } = require("./finanzierungStore");
    // Check finanzierung stored under kontakt-ID
    const checkFin = (id: string) => {
      const fin = getFinanzierung(id);
      if (!fin.angebote || fin.angebote.length === 0) return false;
      return fin.angebote.some((a: any) =>
        (a.dokumente || []).some((d: any) => d.name === "Grundschuld" && d.status !== "none")
      );
    };
    if (checkFin(kundeId)) return true;
    // Also check finanzierung stored under each investment-ID
    const investments = getInvestmentsByKontakt(kundeId);
    return investments.some(inv => checkFin(inv.id));
  } catch { return false; }
}

/**
 * Compute display status for a Wohnung based on investment data.
 * Once notarTermin is entered → "Notar". If Grundschuld uploaded → "Notar mit GS", otherwise "Notar ohne GS".
 * "Notar mit GS" and "Notar ohne GS" are internal-only statuses (not shown in Kundenportal).
 * @param forPortal if true, returns only "Notar" (never the GS variants)
 * @param wohnungId optional – wenn gesetzt, werden nur Investments betrachtet, die genau diese Wohnung referenzieren.
 *                  Verhindert, dass alte abgeschlossene Investments (mit Notartermin) den Status einer neu reservierten
 *                  Wohnung in einem späteren Investment desselben Kunden überschreiben.
 */
export function getWohnungDisplayStatus(wohnungStatus: string, kundeId?: string, forPortal = false, wohnungId?: string): { label: string; key: string } {
  if (wohnungStatus !== "reserviert" || !kundeId) {
    if (wohnungStatus === "verkauft") return { label: "Verkauft", key: "verkauft" };
    if (wohnungStatus === "reserviert") return { label: "Reserviert", key: "reserviert" };
    return { label: "Frei", key: "frei" };
  }

  // Check investment for notarTermin
  const allInvestments = getInvestmentsByKontakt(kundeId);
  // Wenn eine Wohnungs-ID übergeben wurde: nur Investments betrachten, die genau diese Wohnung
  // reserviert haben. Sonst würde ein altes, bereits abgeschlossenes Investment den Status einer
  // neu reservierten Wohnung in einem neuen Investment fälschlich auf "Notar" setzen.
  const investments = wohnungId
    ? allInvestments.filter(inv => inv.wohnungId === wohnungId)
    : allInvestments.filter(inv => inv.pipelineStufe !== "abgeschlossen" && inv.pipelineStufe !== "archiviert");
  for (const inv of investments) {
    if (!inv.notarTermin) continue;

    // Notartermin is entered → customer moves to "Notar"
    // For portal: always show just "Notar"
    if (forPortal) return { label: "Notar", key: "notar" };

    // Internal: check Grundschuld status
    const gsUploaded = isGrundschuldUploaded(kundeId);
    if (gsUploaded) {
      return { label: "Notar mit GS", key: "notar_mit_gs" };
    } else {
      return { label: "Notar ohne GS", key: "notar_ohne_gs" };
    }
  }

  return { label: "Reserviert", key: "reserviert" };
}
