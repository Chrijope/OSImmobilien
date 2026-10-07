// Support Ticket Store – DB-backed via dataCache
import { cacheGet, cacheInsert, cacheUpdate, cacheDelete, cacheSet } from "./dataCache";
import { nameMeintNutzer } from "./beraterNamensabgleich";
import { isTestAccount, localGet, localSet } from "./dbStoreHelper";
import { notifyByRole, notifyUser } from "./bellNotifications";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserId } from "./currentUser";
// Reine Regeldatei, dieselbe Rollenliste wie in der Edge Function.
import { SUPPORT_ROLLEN } from "../../supabase/functions/_shared/support-antwort.ts";

export type TicketStatus = "neu" | "offen" | "in_bearbeitung" | "geloest" | "geschlossen";
export type TicketPrioritaet = "niedrig" | "mittel" | "hoch";
export type TicketKategorie = "allgemein" | "technisch" | "abrechnung" | "objekte" | "vertrag";

export interface TicketNachricht {
  id: string;
  ticketId: string;
  absender: "nutzer" | "backoffice";
  absenderName: string;
  inhalt: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  nummer: number;
  betreff: string;
  kategorie: TicketKategorie;
  status: TicketStatus;
  prioritaet: TicketPrioritaet;
  erstelltAm: string;
  aktualisiertAm: string;
  erstellerName: string;
  erstellerEmail: string;
  erstellerRolle: string;
  zugewiesenAn: string | null;
  nachrichten: TicketNachricht[];
  /**
   * Die Kennung des Absenders aus `support_tickets.benutzer_id`.
   *
   * Sie ist die einzige belastbare Antwort auf die Frage "ist das mein
   * Ticket?". Vorher hat `SupportKontaktieren` nach Name ODER ROLLE
   * gefiltert, und die Rolle passt auf jeden Kollegen mit derselben Rolle.
   * Zusammen mit der damals zu weiten Leseregel sah ein Vertriebspartner so
   * die Tickets aller anderen Vertriebspartner.
   *
   * Beim Testkonto bleibt das Feld leer, dort liegen die Tickets nur im
   * Browser und haben keine Kennung.
   */
  benutzerId?: string | null;
  /**
   * Wann der Ersteller das Ticket zuletzt geoeffnet hat
   * (`meta.gelesen_am_ersteller`). Gesetzt von der Datenbankfunktion
   * `support_ticket_gelesen`, nur fuer das eigene Ticket.
   */
  gelesenAmErsteller?: string | null;
}

const LS_KEY = "mi_support_tickets";

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
}

/**
 * Baut die Zeile fuer das Anlegen eines Tickets.
 *
 * Hier stand frueher `benutzer_id: null, // will be set by RLS`. Das war ein
 * Missverstaendnis: Row Level Security setzt nichts, sie prueft nur. Die
 * INSERT-Regel verlangt `auth.uid() = benutzer_id`, und `auth.uid() = NULL`
 * ergibt NULL, also nicht wahr. Jedes Ticket ueber "Support kontaktieren"
 * wurde deshalb mit Fehler 42501 abgelehnt. Die Kennung des angemeldeten
 * Nutzers muss also mitgeschickt werden.
 *
 * Bewusst nur fuer das Anlegen gedacht: Die Aktualisierungen weiter unten
 * schreiben einzelne Felder ueber `cacheUpdate` und ruehren `benutzer_id`
 * nicht an, damit ein Update den Absender nicht ueberschreibt.
 */
function toDb(t: SupportTicket, benutzerId: string | null): Record<string, any> {
  return {
    id: t.id,
    betreff: t.betreff,
    kategorie: t.kategorie,
    status: t.status,
    prioritaet: t.prioritaet,
    nachricht: t.nachrichten?.[0]?.inhalt || "",
    benutzer_id: benutzerId,
    meta: {
      nummer: t.nummer,
      erstellerName: t.erstellerName,
      erstellerEmail: t.erstellerEmail,
      erstellerRolle: t.erstellerRolle,
      zugewiesenAn: t.zugewiesenAn,
      nachrichten: t.nachrichten,
      aktualisiertAm: t.aktualisiertAm,
    },
  };
}

function fromDb(r: any): SupportTicket {
  const meta = r.meta || {};
  // Bug-Reports (über das Dreieck-Menü) speichern die Beschreibung in r.nachricht
  // und legen KEINE meta.nachrichten an. Damit die Beschreibung + Screenshots
  // im Helpdesk-Detail sichtbar werden, synthetisieren wir eine initiale Nachricht.
  let nachrichten: TicketNachricht[] = Array.isArray(meta.nachrichten) ? meta.nachrichten : [];
  if (nachrichten.length === 0 && (r.nachricht || (Array.isArray(meta.bilder) && meta.bilder.length > 0))) {
    const bilderMd = Array.isArray(meta.bilder) && meta.bilder.length > 0
      ? "\n\n" + meta.bilder.map((u: string, i: number) => `![Screenshot ${i + 1}](${u})`).join("\n")
      : "";
    nachrichten = [{
      id: r.id + "-initial",
      ticketId: r.id,
      absender: "nutzer",
      absenderName: meta.reporterName || meta.erstellerName || "Melder",
      inhalt: (r.nachricht || "") + bilderMd,
      timestamp: r.erstellt_am || new Date().toISOString(),
    }];
  }
  return {
    id: r.id,
    nummer: meta.nummer || 0,
    betreff: r.betreff || "",
    kategorie: (r.kategorie || "allgemein") as TicketKategorie,
    status: (r.status || "neu") as TicketStatus,
    prioritaet: (r.prioritaet || "mittel") as TicketPrioritaet,
    erstelltAm: r.erstellt_am || "",
    aktualisiertAm: meta.aktualisiertAm || r.erstellt_am || "",
    erstellerName: meta.erstellerName || meta.reporterName || "",
    erstellerEmail: meta.erstellerEmail || meta.reporterEmail || "",
    erstellerRolle: meta.erstellerRolle || meta.reporterRole || "",
    zugewiesenAn: meta.zugewiesenAn || null,
    nachrichten,
    benutzerId: r.benutzer_id ?? null,
    gelesenAmErsteller: meta.gelesen_am_ersteller ?? null,
  };
}

export function getTickets(): SupportTicket[] {
  if (isTestAccount()) return localGet<SupportTicket[]>(LS_KEY, []);
  return cacheGet("support_tickets").map(fromDb);
}

export function saveTickets(tickets: SupportTicket[]) {
  if (isTestAccount()) { localSet(LS_KEY, tickets); }
  window.dispatchEvent(new Event("tickets-updated"));
}

export function getTicketById(id: string): SupportTicket | undefined {
  return getTickets().find(t => t.id === id);
}

function getNextTicketNummer(tickets: SupportTicket[]): number {
  if (tickets.length === 0) return 1001;
  return Math.max(...tickets.map(t => t.nummer)) + 1;
}

/**
 * Legt ein Ticket an und meldet einen Fehlschlag nach aussen.
 *
 * Die Funktion ist asynchron, weil die Kennung des angemeldeten Nutzers erst
 * bei Supabase erfragt werden muss. Scheitert das Speichern, wird der Fehler
 * weitergereicht, statt ein Ticket zurueckzugeben, das es gar nicht gibt.
 * Der Aufrufer zeigt den Grund an.
 */
export async function createTicket(data: {
  betreff: string;
  kategorie: TicketKategorie;
  prioritaet: TicketPrioritaet;
  nachricht: string;
  erstellerName: string;
  erstellerEmail: string;
  erstellerRolle: string;
}): Promise<SupportTicket> {
  const tickets = getTickets();
  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: generateId(),
    nummer: getNextTicketNummer(tickets),
    betreff: data.betreff,
    kategorie: data.kategorie,
    status: "neu",
    prioritaet: data.prioritaet,
    erstelltAm: now,
    aktualisiertAm: now,
    erstellerName: data.erstellerName,
    erstellerEmail: data.erstellerEmail,
    erstellerRolle: data.erstellerRolle,
    zugewiesenAn: "Backoffice",
    nachrichten: [{
      id: generateId(), ticketId: "", absender: "nutzer",
      absenderName: data.erstellerName, inhalt: data.nachricht, timestamp: now,
    }],
  };
  ticket.nachrichten[0].ticketId = ticket.id;

  if (isTestAccount()) {
    const all = localGet<SupportTicket[]>(LS_KEY, []);
    all.unshift(ticket);
    localSet(LS_KEY, all);
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    // Damit das frische Ticket sofort als eigenes erkannt wird, ohne auf den
    // naechsten Ladevorgang des Zwischenspeichers zu warten.
    ticket.benutzerId = user?.id ?? null;
    // Still schreiben: Den Hinweis zeigt der Aufrufer, und zwar mit dem Grund.
    await cacheInsert("support_tickets", toDb(ticket, user?.id ?? null), { silent: true });
  }
  window.dispatchEvent(new Event("tickets-updated"));
  // Bell-Benachrichtigung an Admin/Inhaber/Backoffice
  try {
    notifyByRole(["admin", "inhaber", "backoffice"], {
      titel: `Neues Support-Ticket T-${ticket.nummer}`,
      nachricht: `${ticket.erstellerName} (${ticket.erstellerRolle}): ${ticket.betreff}`,
      link: "/helpdesk",
    });
  } catch (e) {
    console.warn("Helpdesk notify failed:", e);
  }
  return ticket;
}

/**
 * Die Datenbankfunktion gibt es noch nicht, die Migration
 * 20260928130000_support_antworten_melden ist nicht gelaufen. Nur dann darf
 * der alte Weg genommen werden, jeder andere Fehler ist ein echter.
 */
export function funktionFehlt(fehler: unknown): boolean {
  const code = String((fehler as { code?: string } | null)?.code || "");
  const text = String((fehler as { message?: string } | null)?.message || "");
  return code === "PGRST202" || code === "42883" || /could not find the function/i.test(text);
}

/** Wer im Helpdesk antworten und "Antwort erneut melden" darf, nach aktiver Rolle. */
export function darfSupportAntworten(rolle: string | undefined | null): boolean {
  return !!rolle && SUPPORT_ROLLEN.includes(rolle);
}

/** Anzeigename einer Support-Antwort, gleich gebaut wie in der Datenbankfunktion. */
export function supportAbsenderName(name: string | undefined | null): string {
  const vorname = String(name || "").trim().split(/\s+/)[0] || "";
  return vorname ? `MOREImmo Support (${vorname})` : "MOREImmo Support";
}

function glockeLink(ticketId: string): string {
  return `/support-kontaktieren?ticket=${ticketId}`;
}

/** Eine Zeile nur im Zwischenspeicher ersetzen, die Datenbank ist schon aktuell. */
function zeileLokalAktualisieren(ticketId: string, aendern: (r: any) => any) {
  const zeilen = cacheGet("support_tickets");
  if (!zeilen.some((r: any) => r.id === ticketId)) return;
  cacheSet("support_tickets", zeilen.map((r: any) => (r.id === ticketId ? aendern(r) : r)));
}

export type SupportMailErgebnis = { mail: boolean; grund?: string };

/**
 * Stoesst die Mail an den Ersteller an. Wirft nie: Eine fehlende Mail darf
 * die gespeicherte Antwort nicht rueckgaengig aussehen lassen. Ob wirklich
 * eine Mail hinausgeht, entscheidet die Function (15-Minuten-Bremse).
 */
export async function supportMailAnstossen(ticketId: string): Promise<SupportMailErgebnis> {
  try {
    const { data, error } = await supabase.functions.invoke("support-antwort-mail", { body: { ticketId } });
    if (error) {
      const status = (error as { context?: { status?: unknown } }).context?.status;
      return { mail: false, grund: status === 404 || typeof status !== "number" ? "nicht_erreichbar" : "fehler" };
    }
    return { mail: !!data?.mail, grund: data?.grund };
  } catch (fehler) {
    console.warn("Support-Mail nicht angestossen:", fehler);
    return { mail: false, grund: "nicht_erreichbar" };
  }
}

/** Der bisherige Weg, nur noch fuer das Testkonto und ohne Migration. */
function nachrichtAltAnhaengen(ticketId: string, nachricht: { absender: "nutzer" | "backoffice"; absenderName: string; inhalt: string }) {
  const now = new Date().toISOString();
  const neu: TicketNachricht = { id: generateId(), ticketId, absender: nachricht.absender, absenderName: nachricht.absenderName, inhalt: nachricht.inhalt, timestamp: now };
  if (isTestAccount()) {
    const tickets = localGet<SupportTicket[]>(LS_KEY, []);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    ticket.nachrichten.push(neu);
    ticket.aktualisiertAm = now;
    if (nachricht.absender === "backoffice" && ticket.status === "neu") ticket.status = "in_bearbeitung";
    localSet(LS_KEY, tickets);
    return;
  }
  const existing = cacheGet("support_tickets").find((r: any) => r.id === ticketId);
  if (!existing) return;
  const t = fromDb(existing);
  t.nachrichten.push(neu);
  // Original-Meta erhalten (bilder, reporter, url etc.) und nur Nachrichten/Zeitstempel mergen
  const mergedMeta = { ...(existing.meta || {}), nachrichten: t.nachrichten, aktualisiertAm: now };
  cacheUpdate("support_tickets", ticketId, { meta: mergedMeta });
  if (nachricht.absender === "backoffice") {
    const ersteller = existing.benutzer_id as string | null;
    if (ersteller && ersteller !== getCurrentUserId()) {
      notifyUser(ersteller, {
        titel: `Antwort vom Support zu T-${t.nummer || "?"}`,
        nachricht: t.betreff || "Dein Support-Ticket",
        link: glockeLink(ticketId),
      });
    }
  }
}

/**
 * Haengt eine Nachricht an ein Ticket an.
 *
 * Frueher las der Browser die Nachrichtenliste aus dem Zwischenspeicher,
 * haengte an und schrieb die ganze Liste zurueck. Zwei Antworten kurz
 * nacheinander, und eine war weg. Jetzt haengt die Datenbankfunktion
 * `support_ticket_nachricht_anhaengen` unter Zeilensperre an, setzt Absender
 * und Namen aus der Sitzung, stellt "neu" auf "in_bearbeitung" und schreibt
 * bei einer Support-Antwort die Glocke fuer den Ersteller. Danach stoesst der
 * Browser die Mail an.
 *
 * Ohne Migration: der alte Weg, mit Glocke aus dem Browser und ohne Mail.
 * Jeder andere Fehler wird weitergereicht, der Aufrufer zeigt ihn an.
 */
export async function addNachricht(
  ticketId: string,
  nachricht: { absender: "nutzer" | "backoffice"; absenderName: string; inhalt: string },
): Promise<void> {
  const inhalt = nachricht.inhalt.trim();
  if (!inhalt) return;
  if (isTestAccount()) {
    nachrichtAltAnhaengen(ticketId, { ...nachricht, inhalt });
    window.dispatchEvent(new Event("tickets-updated"));
    return;
  }
  const { data, error } = await (supabase as any).rpc("support_ticket_nachricht_anhaengen", {
    p_ticket_id: ticketId,
    p_inhalt: inhalt,
    p_als: nachricht.absender === "backoffice" ? "support" : "nutzer",
  });
  if (error) {
    if (!funktionFehlt(error)) throw error;
    nachrichtAltAnhaengen(ticketId, { ...nachricht, inhalt });
  } else {
    // Sofort zeigen, statt auf die Echtzeitmeldung zu warten.
    if (data?.meta) zeileLokalAktualisieren(ticketId, (r) => ({ ...r, meta: data.meta, status: data.status ?? r.status }));
    if (nachricht.absender === "backoffice") void supportMailAnstossen(ticketId);
  }
  window.dispatchEvent(new Event("tickets-updated"));
}

/**
 * "Antwort erneut melden": Glocke und Mail an den Ersteller, ohne neue
 * Nachricht. Fuer Antworten von vor dem 28.09.2026, die nie gemeldet wurden.
 * Die Mail unterliegt derselben 15-Minuten-Bremse.
 */
export async function antwortErneutMelden(ticketId: string): Promise<SupportMailErgebnis> {
  const { error } = await (supabase as any).rpc("support_ticket_antwort_melden", { p_ticket_id: ticketId });
  if (error) {
    if (!funktionFehlt(error)) throw error;
    const zeile = cacheGet("support_tickets").find((r: any) => r.id === ticketId);
    if (!zeile?.benutzer_id) throw new Error("Ticket hat keinen Ersteller");
    const t = fromDb(zeile);
    notifyUser(zeile.benutzer_id, {
      titel: `Antwort vom Support zu T-${t.nummer || "?"}`,
      nachricht: t.betreff || "Dein Support-Ticket",
      link: glockeLink(ticketId),
    });
    return { mail: false, grund: "migration_fehlt" };
  }
  return supportMailAnstossen(ticketId);
}

// ─── Gelesen und ungelesen ───

const LS_GELESEN = "mi_support_gelesen";

/** Zeitpunkt der letzten Support-Nachricht, oder null. */
export function letzteSupportAntwortAm(t: Pick<SupportTicket, "nachrichten">): string | null {
  let letzte: string | null = null;
  for (const n of t.nachrichten || []) {
    if (n.absender !== "backoffice" || !n.timestamp) continue;
    if (!letzte || Date.parse(n.timestamp) > Date.parse(letzte)) letzte = n.timestamp;
  }
  return letzte;
}

/**
 * Ungelesen heisst: Die letzte Support-Nachricht ist neuer als "zuletzt
 * gelesen" des Erstellers. Ohne Lesemarke zaehlt jedes Ticket mit einer
 * Support-Antwort als ungelesen, so greift die Zahl auch fuer Tickets, die
 * vor dieser Aenderung beantwortet wurden.
 *
 * `lokalGelesenAm` ist die Lesemarke aus dem Browser, nur fuer den Fall ohne
 * Migration.
 */
export function istTicketUngelesen(
  t: Pick<SupportTicket, "nachrichten" | "gelesenAmErsteller">,
  lokalGelesenAm?: string | null,
): boolean {
  const letzte = letzteSupportAntwortAm(t);
  if (!letzte) return false;
  const marken = [t.gelesenAmErsteller, lokalGelesenAm]
    .map((m) => (m ? Date.parse(m) : NaN))
    .filter((m) => !Number.isNaN(m));
  if (marken.length === 0) return true;
  return Date.parse(letzte) > Math.max(...marken);
}

function lokaleLesemarken(): Record<string, string> {
  return localGet<Record<string, string>>(LS_GELESEN, {}) || {};
}

/**
 * Ungelesene eigene Tickets, an der Kennung erkannt. Beim Testkonto haben die
 * Tickets keine Kennung, dort zaehlt der Name wie in "Meine Tickets".
 */
export function ungeleseneTicketIds(
  userId: string | null | undefined,
  tickets: SupportTicket[] = getTickets(),
  userName?: string,
): Set<string> {
  const ids = new Set<string>();
  const lokal = lokaleLesemarken();
  for (const t of tickets) {
    // Der Name nur ohne Kennung und nur, wenn er genau einen Nutzer meint.
    const eigenes = t.benutzerId ? !!userId && t.benutzerId === userId : nameMeintNutzer(t.erstellerName, { userId, userName });
    if (eigenes && istTicketUngelesen(t, lokal[t.id])) ids.add(t.id);
  }
  return ids;
}

/**
 * Der Ersteller hat sein Ticket geoeffnet. Setzt die Lesemarke ueber die
 * Datenbankfunktion, die nur das eigene Ticket und nur dieses eine Feld
 * aendert. Ohne Migration bleibt die Marke im Browser. Wirft nie.
 */
export async function ticketGelesenSetzen(ticketId: string): Promise<void> {
  const jetzt = new Date().toISOString();
  const lokalMerken = () => {
    const marken = lokaleLesemarken();
    marken[ticketId] = jetzt;
    localSet(LS_GELESEN, marken);
    window.dispatchEvent(new Event("tickets-updated"));
  };
  if (isTestAccount()) { lokalMerken(); return; }
  try {
    const { error } = await (supabase as any).rpc("support_ticket_gelesen", { p_ticket_id: ticketId });
    if (error) {
      if (funktionFehlt(error)) lokalMerken();
      else console.warn("Lesemarke nicht gesetzt:", error);
      return;
    }
    // Eine alte Marke aus der Zeit ohne Migration darf ein spaeteres
    // "Antwort erneut melden" nicht verdecken.
    const marken = lokaleLesemarken();
    if (marken[ticketId]) { delete marken[ticketId]; localSet(LS_GELESEN, marken); }
    zeileLokalAktualisieren(ticketId, (r) => ({ ...r, meta: { ...(r.meta || {}), gelesen_am_ersteller: jetzt } }));
  } catch (fehler) {
    console.warn("Lesemarke nicht gesetzt:", fehler);
  }
}

export function updateTicketStatus(ticketId: string, status: TicketStatus) {
  if (isTestAccount()) {
    const tickets = localGet<SupportTicket[]>(LS_KEY, []);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    ticket.status = status;
    ticket.aktualisiertAm = new Date().toISOString();
    localSet(LS_KEY, tickets);
  } else {
    // Nur die Spalte. Frueher ging `meta` als Ganzes aus dem Zwischenspeicher
    // mit, und eine gerade angehaengte Nachricht konnte dabei verloren gehen.
    if (!cacheGet("support_tickets").some((r: any) => r.id === ticketId)) return;
    cacheUpdate("support_tickets", ticketId, { status });
  }
  window.dispatchEvent(new Event("tickets-updated"));
}

export function updateTicketPrioritaet(ticketId: string, prioritaet: TicketPrioritaet) {
  if (isTestAccount()) {
    const tickets = localGet<SupportTicket[]>(LS_KEY, []);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    ticket.prioritaet = prioritaet;
    ticket.aktualisiertAm = new Date().toISOString();
    localSet(LS_KEY, tickets);
  } else {
    // Nur die Spalte, aus demselben Grund wie beim Status.
    if (!cacheGet("support_tickets").some((r: any) => r.id === ticketId)) return;
    cacheUpdate("support_tickets", ticketId, { prioritaet });
  }
  window.dispatchEvent(new Event("tickets-updated"));
}

export function updateTicketZuweisung(ticketId: string, zugewiesenAn: string) {
  if (isTestAccount()) {
    const tickets = localGet<SupportTicket[]>(LS_KEY, []);
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    ticket.zugewiesenAn = zugewiesenAn;
    ticket.aktualisiertAm = new Date().toISOString();
    localSet(LS_KEY, tickets);
  } else {
    const existing = cacheGet("support_tickets").find((r: any) => r.id === ticketId);
    if (!existing) return;
    const mergedMeta = { ...(existing.meta || {}), zugewiesenAn, aktualisiertAm: new Date().toISOString() };
    cacheUpdate("support_tickets", ticketId, { meta: mergedMeta });
  }
  window.dispatchEvent(new Event("tickets-updated"));
}

export function deleteTicket(ticketId: string) {
  if (isTestAccount()) {
    const tickets = localGet<SupportTicket[]>(LS_KEY, []);
    localSet(LS_KEY, tickets.filter(t => t.id !== ticketId));
  } else {
    cacheDelete("support_tickets", ticketId);
  }
  window.dispatchEvent(new Event("tickets-updated"));
}

export function getTicketStats() {
  const tickets = getTickets();
  const neu = tickets.filter(t => t.status === "neu").length;
  const offen = tickets.filter(t => t.status === "offen").length;
  const inBearbeitung = tickets.filter(t => t.status === "in_bearbeitung").length;
  const geloest = tickets.filter(t => t.status === "geloest").length;
  const geschlossen = tickets.filter(t => t.status === "geschlossen").length;
  const gesamt = tickets.length;
  // Antwort- und Lösungszeit standen hier als feste Werte im Code, sobald
  // überhaupt ein Ticket existierte. Auf dem Dashboard sah das aus wie eine
  // gemessene Zahl. Bis die Zeiten wirklich erfasst werden, bleibt das Feld
  // leer, statt eine Zahl zu behaupten.
  const avgAntwortzeit = "–";
  const avgLoesungszeit = "–";
  const loesungsrate = gesamt > 0 ? Math.round(((geloest + geschlossen) / gesamt) * 100) : 0;
  const zufriedenheit = 0;
  return { neu, offen, inBearbeitung, geloest, geschlossen, gesamt, avgAntwortzeit, avgLoesungszeit, loesungsrate, zufriedenheit };
}
