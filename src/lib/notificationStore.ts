// Notification store – DB-backed via dataCache for persistent notifications
import { cacheGet, cacheInsert, cacheUpdate } from "./dataCache";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { supabase } from "@/integrations/supabase/client";

export interface MentionNotification {
  id: string;
  chatId: string;
  chatName: string;
  /**
   * Die Kennung des Erwaehnten, also wer die Benachrichtigung bekommt.
   *
   * Bis zum 19.09.2026 gab es dieses Feld nicht, und die Meldung landete
   * deshalb beim ABSENDER: `addNotifOfType` setzte als Empfaenger schlicht das
   * angemeldete Konto. Wer jemanden erwaehnte, benachrichtigte damit sich
   * selbst, und der Erwaehnte erfuhr nie davon.
   */
  mentionedId?: string;
  mentionedName: string;
  mentionedById: string;
  mentionedByName: string;
  messageText: string;
  timestamp: string;
  read: boolean;
}

export interface PrizeNotification {
  id: string;
  type: "prize_request" | "prize_confirmed";
  levelNum: number;
  levelName: string;
  prizeName: string;
  requesterName: string;
  requesterMoreId: string;
  requesterAddress?: string;
  requesterPhone?: string;
  requesterEmail?: string;
  targetRole: "admin" | "backoffice" | "vertriebspartner";
  timestamp: string;
  read: boolean;
}

export interface DeleteRequestNotification {
  id: string;
  kundeId: string;
  kundeName: string;
  requesterName: string;
  grund: string;
  timestamp: string;
  read: boolean;
  status: "offen" | "akzeptiert" | "abgelehnt";
}

export interface DocNotification {
  id: string;
  /**
   * Was passiert ist.
   *
   * `reservierung_versandt` kam am 16.09.2026 dazu. Vorher gab es fuer diesen
   * Fall gar keine Art, und das Reservierungsformular hat deshalb
   * `alle_hochgeladen` mitbenutzt. In der Glocke stand dann „Alle
   * Pflichtunterlagen wurden hochgeladen, bitte pruefen und freigeben“,
   * waehrend in Wahrheit nur eine Reservierung zur Unterschrift hinausging.
   * Christian ist es bei Jonas Lins aufgefallen: Im Investment lag keine
   * einzige Bonitaetsunterlage.
   */
  type: "alle_hochgeladen" | "pflichtdocs_fehlen" | "reservierung_versandt";
  kundeId: string;
  kundeName: string;
  investmentId: string;
  beraterName: string;
  fehlendeDocs?: string[];
  timestamp: string;
  read: boolean;
}

export interface AnalyseLeadNotification {
  id: string;
  kontaktId: string;
  kontaktName: string;
  telefon: string;
  email: string;
  beraterName: string;
  leadQuality: string;
  timestamp: string;
  read: boolean;
}

// ── DB helpers ──
// All notification types use the benachrichtigungen table with meta JSONB for type-specific data

type NotifType = "mention" | "prize" | "delete_request" | "doc" | "analyse_lead";

function toDb(type: NotifType, data: any, userId?: string): Record<string, any> {
  return {
    id: data.id,
    benutzer_id: userId || "00000000-0000-0000-0000-000000000000",
    titel: getTitleForType(type, data),
    nachricht: getMessageForType(type, data),
    gelesen: data.read || false,
    link: getLinkForType(type, data),
    meta: {
      notif_type: type,
      ...(data.investmentId ? { investmentId: data.investmentId } : {}),
      ...(data.kundeId ? { kundeId: data.kundeId } : {}),
      ...(data.type ? { docType: data.type } : {}),
      ...(data.kontaktId ? { kontaktId: data.kontaktId } : {}),
      ...(data.chatId ? { chatId: data.chatId } : {}),
      payload: data,
    },
  };
}

function getTitleForType(type: NotifType, data: any): string {
  switch (type) {
    case "mention": return `@Erwähnung von ${data.mentionedByName}`;
    case "prize": return data.type === "prize_request" ? `Prämie angefordert: ${data.prizeName}` : `Prämie bestätigt: ${data.prizeName}`;
    case "delete_request": return `Löschanfrage: ${data.kundeName}`;
    case "doc":
      if (data.type === "reservierung_versandt") return `Reservierung versandt: ${data.kundeName}`;
      return data.type === "alle_hochgeladen" ? `Dokumente vollständig: ${data.kundeName}` : `Dokumente fehlen: ${data.kundeName}`;
    case "analyse_lead": return `Neuer Lead: ${data.kontaktName}`;
    default: return "Benachrichtigung";
  }
}

function getMessageForType(type: NotifType, data: any): string {
  switch (type) {
    case "mention": return data.messageText;
    case "prize": return `${data.requesterName} - Level ${data.levelNum} ${data.levelName}`;
    case "delete_request": return data.grund;
    case "doc":
      if (data.type === "reservierung_versandt") return "Die Reservierungsvereinbarung wurde zur Unterschrift versandt.";
      return data.fehlendeDocs?.join(", ") || "";
    case "analyse_lead": return `${data.leadQuality} - ${data.beraterName}`;
    default: return "";
  }
}

function getLinkForType(type: NotifType, data: any): string {
  switch (type) {
    case "mention": return `/chat`;
    case "delete_request": return `/kunden/${data.kundeId}`;
    case "doc": return `/kontakte/${data.kundeId}`;
    case "analyse_lead": return `/kontakte/${data.kontaktId}`;
    default: return "";
  }
}

/**
 * Die Meldungen einer Art, wahlweise nur die eigenen.
 *
 * WARUM `nurFuer` NOTWENDIG IST
 *
 * Admin und Inhaber duerfen laut Zeilensicherheit ALLE Benachrichtigungen
 * lesen. Aendern duerfen sie nur die eigenen: Die UPDATE-Regel verlangt
 * `auth.uid() = benutzer_id`. Ohne Empfaengerfilter landen deshalb fremde
 * Meldungen in der eigenen Glocke, und der Klick auf „gelesen" verpufft
 * stillschweigend. Beim naechsten Laden stehen sie wieder da.
 *
 * Genau das hat Christian am 17.09.2026 gemeldet: „Reservierung versandt:
 * Jonas Lins" tauchte bei ihm immer wieder auf, obwohl die Meldung an
 * p.pintat@more.immo zugestellt war und er sie mehrfach als gelesen markiert
 * hatte.
 *
 * Die Liste der uebrigen Meldungen in `HeaderBar` filtert seit jeher richtig,
 * dieser zweite Weg tat es nicht. Ein Tag zuvor war bereits die Einblendung
 * aus demselben Grund repariert worden; dieser dritte Weg blieb uebrig.
 *
 * `nurFuer` bleibt optional: Ohne Angabe verhaelt sich die Funktion wie
 * bisher. So bleibt jeder Aufrufer heil, der die eigene Kennung gar nicht
 * kennt, und im Zweifel wird eher zu viel gezeigt als zu wenig.
 */
function fromDbByType<T>(type: NotifType, nurFuer?: string): T[] {
  if (isTestAccount()) {
    const key = getLocalKeyForType(type);
    return localGet<T[]>(key, []);
  }
  return cacheGet("benachrichtigungen")
    .filter((r: any) => !nurFuer || r.benutzer_id === nurFuer)
    .filter((r: any) => {
      if (r.meta?.notif_type === type) return true;
      // Fallback: try parsing nachricht as JSON for type detection
      try {
        const parsed = typeof r.nachricht === "string" && r.nachricht.startsWith("{") ? JSON.parse(r.nachricht) : null;
        return parsed?.notif_type === type;
      } catch { return false; }
    })
    .map((r: any) => {
      const metaData = r.meta || (() => { try { return typeof r.nachricht === "string" && r.nachricht.startsWith("{") ? JSON.parse(r.nachricht) : {}; } catch { return {}; } })();
      /*
       * `payload` aufmachen. Bis zum 16.09.2026 blieb es zu.
       *
       * `toDb` legt die vollstaendigen Daten unter `meta.payload` ab und
       * hebt nur einige Schluessel zum Suchen auf die obere Ebene
       * (investmentId, kundeId, docType, kontaktId, chatId). Gelesen wurde
       * hier aber nur diese obere Ebene. Alles, was allein im Payload steht,
       * fehlte damit in der Anzeige: `kundeName`, `timestamp`, `type`.
       *
       * Die Folge war nicht nur haesslich, sondern irrefuehrend. Christian
       * bekam am 16.09.2026 die Glockenmeldung „Pflichtunterlagen fehlen:
       * undefined … Vor NaN Tagen", waehrend in der Datenbank „Dokumente
       * vollstaendig: Jonas Lins" stand. Weil `type` fehlte, fiel die
       * Anzeige in den Zweig fuer die GEGENTEILIGE Meldung.
       *
       * Der Payload gewinnt, weil er der vollstaendige Satz ist. Die obere
       * Ebene ist nur eine Auswahl daraus.
       */
      const payload = metaData?.payload && typeof metaData.payload === "object" && !Array.isArray(metaData.payload)
        ? metaData.payload as Record<string, unknown>
        : {};
      return {
        ...metaData,
        ...payload,
        id: r.id,
        read: r.gelesen,
        /*
         * Der Zeitpunkt kommt notfalls aus der Tabellenspalte. Sie ist die
         * verlaesslichste Quelle und lag die ganze Zeit ungenutzt daneben;
         * ohne sie rechnete die Anzeige mit einem leeren Wert und schrieb
         * „Vor NaN Tagen".
         */
        timestamp: payload.timestamp || metaData?.timestamp || r.erstellt_am,
      };
    }) as T[];
}

function getLocalKeyForType(type: NotifType): string {
  const map: Record<NotifType, string> = {
    mention: "mi_mention_notifications",
    prize: "mi_prize_notifications",
    delete_request: "mi_delete_requests",
    doc: "mi_doc_notifications",
    analyse_lead: "mi_analyse_lead_notifications",
  };
  return map[type];
}

async function addNotifOfType<T extends { id?: string; timestamp?: string; read?: boolean }>(
  type: NotifType, data: Omit<T, "id" | "timestamp" | "read">, eventName: string,
  empfaengerId?: string,
) {
  const entry = {
    ...data,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    read: false,
  } as any;

  if (isTestAccount()) {
    const key = getLocalKeyForType(type);
    const all = localGet<any[]>(key, []);
    all.unshift(entry);
    localSet(key, all);
  } else {
    /*
     * Empfaenger ist, wer gemeint ist, und nicht, wer schreibt.
     *
     * Hier stand bis zum 19.09.2026 ausschliesslich das angemeldete Konto,
     * mit der Begruendung "for RLS compliance". Das war schon damals nicht
     * noetig und heute erst recht nicht: Die Regel "Nutzer erstellen eigene
     * Benachrichtigungen" erlaubt ausdruecklich auch, jemandem zu schreiben,
     * mit dem man in einem Chat sitzt.
     *
     * Die Folge war, dass jede Erwaehnung beim Absender landete. Wer einen
     * Kollegen mit @ ansprach, benachrichtigte sich selbst, und der Kollege
     * erfuhr nie davon.
     *
     * Ohne ausdruecklichen Empfaenger bleibt es beim bisherigen Verhalten,
     * denn die uebrigen Benachrichtigungsarten meinen tatsaechlich den
     * eigenen Nutzer.
     */
    const { data: { user } } = await supabase.auth.getUser();
    const userId = empfaengerId || user?.id || undefined;
    await benachrichtigungSchreiben(toDb(type, entry, userId));
  }
  window.dispatchEvent(new CustomEvent(eventName));
}

/** Erkennt die PostgREST-Meldung "Could not find the 'meta' column". */
function fehlendeMetaSpalte(fehler: unknown): boolean {
  const f = fehler as { code?: string; message?: string } | null;
  const text = String(f?.message || "").toLowerCase();
  return String(f?.code || "") === "PGRST204"
    || (text.includes("could not find") && text.includes("'meta'"));
}

/**
 * Legt die Benachrichtigung an und bleibt dabei still.
 *
 * Zwei Dinge sind hier wichtig, beide durch eine Meldung von Philipp Pintat am
 * 16.09.2026 aufgefallen:
 *
 * 1. Die Spalte `meta` fehlte in der Tabelle, bis die Migration
 *    20260916090000 laeuft. Solange sie fehlt, wird der Eintrag ein zweites
 *    Mal ohne `meta` geschrieben. Der Nutzer sieht seine Benachrichtigung dann
 *    in der Glocke; nur die Zuordnung zur Art (Dokumente, Erwaehnung, Praemie)
 *    fehlt, bis die Spalte da ist.
 * 2. Eine Benachrichtigung ist eine Nebenwirkung, nie der eigentliche Zweck
 *    eines Klicks. Scheitert sie, darf der Partner keinen roten Hinweis sehen,
 *    der so aussieht, als waere seine Reservierung nicht angekommen. Deshalb
 *    `silent` und ein Auffangen am Ende: Der Fehler steht in der Konsole, nicht
 *    im Weg.
 */
async function benachrichtigungSchreiben(zeile: Record<string, any>): Promise<void> {
  try {
    await cacheInsert("benachrichtigungen", zeile, { silent: true });
    return;
  } catch (fehler) {
    if (!fehlendeMetaSpalte(fehler)) {
      console.warn("[notificationStore] Benachrichtigung nicht gespeichert:", fehler);
      return;
    }
  }

  const { meta, ...ohneMeta } = zeile;
  try {
    await cacheInsert("benachrichtigungen", ohneMeta, { silent: true });
    console.warn(
      "[notificationStore] Spalte 'meta' fehlt noch, Benachrichtigung ohne Zuordnung gespeichert."
        + " Migration 20260916090000_benachrichtigungen_meta.sql ausfuehren.",
    );
  } catch (fehler) {
    console.warn("[notificationStore] Benachrichtigung auch ohne meta nicht gespeichert:", fehler);
  }
}

function markNotifRead(type: NotifType, id: string) {
  if (isTestAccount()) {
    const key = getLocalKeyForType(type);
    const all = localGet<any[]>(key, []).map(n => n.id === id ? { ...n, read: true } : n);
    localSet(key, all);
  } else {
    cacheUpdate("benachrichtigungen", id, { gelesen: true });
  }
}

// ── Analyse Lead ──

export function getAnalyseLeadNotifications(): AnalyseLeadNotification[] {
  return fromDbByType<AnalyseLeadNotification>("analyse_lead");
}

export function addAnalyseLeadNotification(n: Omit<AnalyseLeadNotification, "id" | "timestamp" | "read">) {
  addNotifOfType<AnalyseLeadNotification>("analyse_lead", n, "analyse-lead-notification");
}

export function markAnalyseLeadRead(id: string) { markNotifRead("analyse_lead", id); }

export function getUnreadAnalyseLeadCount(): number {
  return getAnalyseLeadNotifications().filter(n => !n.read).length;
}

// ── Mention notifications ──

/**
 * Die Erwaehnungen, die MIR gelten.
 *
 * `nurFuer` ist die eigene Kennung und gehoert hier zwingend hin. Eine
 * Erwaehnung gilt genau einer Person, aber die Zeilensicherheit laesst
 * Verwaltende ALLE Zeilen lesen. Ohne diesen Filter stand in Christians
 * Glocke am 21.09.2026 viermal "@Erwaehnung von Christian Peetz ... @Christian
 * Kurz test": Meldungen, die an Christian Kurz gingen, angezeigt bei Christian
 * Peetz, nicht wegklickbar, weil das Schreibrecht nur fuer eigene Zeilen gilt.
 *
 * Dieselbe Lehre wie bei den Dokumentmeldungen am 17.09.2026, siehe
 * `getDocNotifications`. Ohne Kennung bleibt es beim alten Verhalten, damit
 * ein Aufruf ohne angemeldetes Konto nicht stillschweigend leer laeuft.
 */
export function getMentionNotifications(nurFuer?: string): MentionNotification[] {
  return fromDbByType<MentionNotification>("mention", nurFuer);
}

export function saveMentionNotifications(notifs: MentionNotification[]) {
  if (isTestAccount()) localSet(getLocalKeyForType("mention"), notifs);
}

export function addMentionNotification(n: Omit<MentionNotification, "id" | "timestamp" | "read">) {
  // `mentionedId` ist der Empfaenger. Fehlt er, bleibt es beim alten Verhalten.
  addNotifOfType<MentionNotification>("mention", n, "mention-notification", n.mentionedId);
}

export function markMentionRead(id: string) { markNotifRead("mention", id); }

export function markAllMentionsRead(nurFuer?: string) {
  if (isTestAccount()) {
    const all = localGet<any[]>(getLocalKeyForType("mention"), []).map(n => ({ ...n, read: true }));
    localSet(getLocalKeyForType("mention"), all);
  } else {
    // Nur die eigenen. Fremde Zeilen darf die Schreibregel gar nicht aendern,
    // der Versuch scheitert still und die Meldung kommt beim naechsten Laden
    // wieder.
    getMentionNotifications(nurFuer).filter(n => !n.read).forEach(n => {
      cacheUpdate("benachrichtigungen", n.id, { gelesen: true });
    });
  }
}

export function getUnreadMentionCount(nurFuer?: string): number {
  return getMentionNotifications(nurFuer).filter(n => !n.read).length;
}

/** Extract @-mentioned names from message text */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@([A-Za-zÀ-ÿ]+\s[A-Za-zÀ-ÿ]+)/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = mentionRegex.exec(text)) !== null) {
    names.push(match[1]);
  }
  return names;
}

// ── Prize notifications ──

export function getPrizeNotifications(): PrizeNotification[] {
  return fromDbByType<PrizeNotification>("prize");
}

export function savePrizeNotifications(notifs: PrizeNotification[]) {
  if (isTestAccount()) localSet(getLocalKeyForType("prize"), notifs);
}

export function addPrizeNotification(n: Omit<PrizeNotification, "id" | "timestamp" | "read">) {
  addNotifOfType<PrizeNotification>("prize", n, "prize-notification");
}

export function markPrizeNotifRead(id: string) { markNotifRead("prize", id); }

export function getUnreadPrizeCount(role: string): number {
  const target = (role === "admin" || role === "inhaber" || role === "backoffice") ? "admin" : "vertriebspartner";
  return getPrizeNotifications().filter(n => !n.read && n.targetRole === target).length;
}

// ── Delete request notifications ──

export function getDeleteRequests(): DeleteRequestNotification[] {
  return fromDbByType<DeleteRequestNotification>("delete_request");
}

export function saveDeleteRequests(notifs: DeleteRequestNotification[]) {
  if (isTestAccount()) localSet(getLocalKeyForType("delete_request"), notifs);
}

export function addDeleteRequest(n: Omit<DeleteRequestNotification, "id" | "timestamp" | "read" | "status">) {
  const entry = { ...n, status: "offen" as const };
  addNotifOfType<DeleteRequestNotification>("delete_request", entry as any, "delete-request-notification");
}

export function getUnreadDeleteRequestCount(): number {
  return getDeleteRequests().filter(n => !n.read && n.status === "offen").length;
}

// ── Document notifications ──

export function getDocNotifications(nurFuer?: string): DocNotification[] {
  return fromDbByType<DocNotification>("doc", nurFuer);
}

export function saveDocNotifications(notifs: DocNotification[]) {
  if (isTestAccount()) localSet(getLocalKeyForType("doc"), notifs);
}

export async function addDocNotification(n: Omit<DocNotification, "id" | "timestamp" | "read">) {
  if (isTestAccount()) {
    const all = localGet<DocNotification[]>(getLocalKeyForType("doc"), []);
    if (all.some(x => x.investmentId === n.investmentId && x.type === n.type)) return;
  } else {
    // Cache-Dedupe (best-effort, falls Cache aktuell)
    const existingCache = getDocNotifications().find((d) =>
      d.investmentId === n.investmentId && d.type === n.type
    );
    if (existingCache) return;
    // DB-Dedupe (autoritativ): existiert bereits eine Notification mit diesem investmentId+docType?
    try {
      const { data: existingDb } = await supabase
        .from("benachrichtigungen")
        .select("id")
        .eq("meta->>notif_type", "doc")
        .eq("meta->>investmentId", n.investmentId)
        .eq("meta->>docType", n.type)
        .limit(1);
      if (existingDb && existingDb.length > 0) return;
    } catch (e) {
      console.warn("Doc-notif DB-Dedupe failed", e);
    }
  }
  await addNotifOfType<DocNotification>("doc", n, "doc-notification");
}

export function markDocNotifRead(id: string) { markNotifRead("doc", id); }

export function getUnreadDocNotifCount(nurFuer?: string): number {
  return getDocNotifications(nurFuer).filter(n => !n.read).length;
}
