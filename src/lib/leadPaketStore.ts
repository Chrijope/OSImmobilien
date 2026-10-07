/**
 * Leadpakete: welcher Lead aus welchem Paket geliefert wurde.
 *
 * Tabellen `lead_pakete` und `lead_paket_zuweisungen` aus der Migration
 * 20260930130000_lead_pakete.sql. Lesen regelt RLS (Leitung alles, Partner
 * nur eigene Pakete), geschrieben wird nur über die vier Funktionen dort.
 *
 * Bewusst direkt über Supabase und nicht über `dataCache`, aus demselben
 * Grund wie in `abwesenheitStore.ts`: Solange die Migration fehlt, gibt es
 * die Tabellen nicht, und eine fehlende Tabelle in der Ladeliste des
 * Zwischenspeichers reißt den Realtime-Kanal mit. Ohne Migration liefert
 * `ladeLeadPakete` `migrationFehlt`, und die Oberfläche blendet das Feld aus.
 */
import { supabase } from "@/integrations/supabase/client";
import { istTabelleUnbekannt } from "@/lib/abwesenheitStore";

// Die erzeugten Supabase-Typen kennen die neuen Tabellen und Funktionen noch nicht.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const LEAD_PAKET_MIGRATION = "20260930130000_lead_pakete.sql";

export type LeadPaketStatus = "offen" | "erfuellt" | "beendet";

export interface LeadPaket {
  id: string;
  partner_id: string;
  anzahl: number;
  paketpreis: number;
  /** JJJJ-MM-TT oder `null`. */
  bezahlt_am: string | null;
  /** JJJJ-MM-TT oder `null`. */
  freigeschaltet_am: string | null;
  status: LeadPaketStatus;
  bemerkung: string | null;
  erstellt_am: string;
}

export interface LeadPaketZuweisung {
  id: string;
  paket_id: string;
  kontakt_id: string;
  zugewiesen_am: string;
  zugewiesen_von: string | null;
  reklamiert_am: string | null;
  reklamationsgrund: string | null;
  ersatz_fuer: string | null;
}

export interface LeadPaketDaten {
  pakete: LeadPaket[];
  zuweisungen: LeadPaketZuweisung[];
  migrationFehlt: boolean;
  fehler: string | null;
}

export async function ladeLeadPakete(): Promise<LeadPaketDaten> {
  const leer = { pakete: [], zuweisungen: [] };
  let p: { data: unknown[] | null; error: { code?: string; message?: string } | null };
  let z: typeof p;
  try {
    [p, z] = await Promise.all([
      db.from("lead_pakete").select("*").order("erstellt_am", { ascending: true }),
      db.from("lead_paket_zuweisungen").select("*").order("zugewiesen_am", { ascending: true }),
    ]);
  } catch (e) {
    return { ...leer, migrationFehlt: false, fehler: e instanceof Error ? e.message : "Unbekannter Fehler" };
  }
  const error = p.error || z.error;
  if (error) {
    if (istTabelleUnbekannt(error)) return { ...leer, migrationFehlt: true, fehler: null };
    return { ...leer, migrationFehlt: false, fehler: error.message || "Unbekannter Fehler" };
  }
  return {
    pakete: ((p.data || []) as LeadPaket[]).map((x) => ({ ...x, paketpreis: Number(x.paketpreis) })),
    zuweisungen: (z.data || []) as LeadPaketZuweisung[],
    migrationFehlt: false,
    fehler: null,
  };
}

// ─── Zählung ───

export interface PaketZaehlung {
  /** Alle Lieferungen, auch reklamierte. */
  zugewiesen: number;
  /** Lieferungen ohne Reklamation. Ersatzleads zählen mit. */
  geliefert: number;
  reklamiert: number;
  /** Reklamierte, für die schon ein Ersatz geliefert ist. */
  ersetzt: number;
  /** Noch zu liefern: Anzahl minus geliefert, nie unter null. */
  offen: number;
}

/** Dieselbe Regel wie in der Migration (Kopfkommentar). */
export function paketZaehlung(paket: Pick<LeadPaket, "id" | "anzahl">, alle: LeadPaketZuweisung[]): PaketZaehlung {
  const eigene = alle.filter((z) => z.paket_id === paket.id);
  const reklamiert = eigene.filter((z) => z.reklamiert_am);
  const ersetztIds = new Set(eigene.map((z) => z.ersatz_fuer).filter(Boolean));
  const geliefert = eigene.length - reklamiert.length;
  return {
    zugewiesen: eigene.length,
    geliefert,
    reklamiert: reklamiert.length,
    ersetzt: reklamiert.filter((z) => ersetztIds.has(z.id)).length,
    offen: Math.max(paket.anzahl - geliefert, 0),
  };
}

/**
 * Pakete eines Partners, aus denen noch geliefert werden kann, ältestes
 * zuerst. Das erste ist die Vorauswahl beim Zuweisen.
 */
export function offenePaketeFuer(partnerId: string, daten: Pick<LeadPaketDaten, "pakete" | "zuweisungen">): LeadPaket[] {
  return daten.pakete
    .filter((p) => p.partner_id === partnerId && p.status !== "beendet" && paketZaehlung(p, daten.zuweisungen).offen > 0)
    .sort((a, b) => a.erstellt_am.localeCompare(b.erstellt_am));
}

/**
 * Einsatzfrist nach Anlage 3 § 1a: ein Monat ab Zahlungseingang, frühestens
 * ab Freischaltung im CRM. Beginn ist deshalb der spätere der beiden Tage;
 * fehlt einer, hat die Frist noch nicht begonnen (`null`). Ende nach § 188
 * Abs. 2 und 3 BGB: gleiche Tageszahl im Folgemonat, fehlt sie, der letzte
 * Tag des Monats.
 */
export function einsatzfrist(paket: Pick<LeadPaket, "bezahlt_am" | "freigeschaltet_am">): { beginn: string; ende: string } | null {
  const { bezahlt_am: b, freigeschaltet_am: f } = paket;
  if (!b || !f) return null;
  const beginn = f > b ? f : b;
  const [j, m, t] = beginn.slice(0, 10).split("-").map(Number);
  const letzterTag = new Date(Date.UTC(j, m + 1, 0)).getUTCDate();
  const ende = new Date(Date.UTC(j, m, Math.min(t, letzterTag)));
  return { beginn: beginn.slice(0, 10), ende: ende.toISOString().slice(0, 10) };
}

// ─── Schreiben, nur über die geprüften Funktionen ───

export type RpcErgebnis = { ok: boolean; meldung?: string };

/**
 * Die Meldungen, die die Funktionen der Migration selbst auslösen. Sie sind
 * schon verständlich und gehen unverändert an den Nutzer. Der Test hält sie
 * an der Migration fest.
 */
export const BEKANNTE_MELDUNGEN = [
  "Nur Admin und Inhaber legen Leadpakete an.",
  "Leadpakete gibt es nur für Konten mit Partnerrolle.",
  "Die Anzahl der Leads muss größer als null sein.",
  "Der Paketpreis darf nicht negativ sein.",
  "Nur Admin und Inhaber ändern Leadpakete.",
  "Dieses Leadpaket gibt es nicht.",
  "Nur Admin, Inhaber und Vertriebsleitung vermerken Paketlieferungen.",
  "Dieses Leadpaket ist beendet.",
  "Der Lead gehört nicht dem Partner dieses Pakets.",
  "Das ist ein Eigenkontakt des Partners und kein Lead der Gesellschaft.",
  "Dieser Lead zählt schon für ein Leadpaket.",
  "Dieser Lead wurde aus diesem Paket schon reklamiert und zählt nicht erneut darauf.",
  "Dieses Leadpaket ist vollständig geliefert.",
  "Nur Admin, Inhaber und Vertriebsleitung erfassen Reklamationen.",
  "Bitte einen Reklamationsgrund angeben.",
  "Diese Lieferung gibt es nicht oder sie ist schon reklamiert.",
  "Im eigenen Leadpaket vermerken und reklamieren nur Admin und Inhaber.",
  "Dieser Lead ist gelöscht und zählt nicht auf ein Paket.",
  "Leadpakete aus der Bewerbung legen nur HR, Admin, Inhaber und Backoffice an.",
] as const;

/** Meldung, wenn ein Lead schon für ein Paket zählt. */
export const SCHON_GEZAEHLT = "Dieser Lead zählt schon für ein Leadpaket.";

/** Rohe Datenbank- oder Netzmeldung in einen Satz für den Nutzer übersetzen. */
export function verstaendlicheMeldung(roh: string | undefined | null): string {
  const text = (roh || "").trim();
  const bekannt = BEKANNTE_MELDUNGEN.find((m) => text.includes(m));
  if (bekannt) return bekannt;
  if (/duplicate key|unique/i.test(text)) return "Dieser Lead zählt schon für ein Leadpaket.";
  if (/permission denied|42501/i.test(text)) return "Dir fehlt das Recht für diese Änderung.";
  if (/could not find the function|does not exist|schema cache|PGRST202/i.test(text)) {
    return "Die Leadpakete sind in der Datenbank noch nicht eingerichtet.";
  }
  if (/fetch|network|timeout/i.test(text)) return "Keine Verbindung zum Server. Bitte versuch es gleich noch einmal.";
  return "Das ließ sich gerade nicht speichern. Bitte versuch es noch einmal.";
}

async function rufe(fn: string, args: Record<string, unknown>): Promise<RpcErgebnis> {
  try {
    const { error } = await db.rpc(fn, args);
    return error ? { ok: false, meldung: verstaendlicheMeldung(error.message) } : { ok: true };
  } catch (e) {
    return { ok: false, meldung: verstaendlicheMeldung(e instanceof Error ? e.message : "") };
  }
}

export function leadPaketAnlegen(a: {
  partnerId: string;
  anzahl: number;
  paketpreis: number;
  bezahltAm: string | null;
  freigeschaltetAm: string | null;
  bemerkung: string;
}): Promise<RpcErgebnis> {
  return rufe("lead_paket_anlegen", {
    _partner_id: a.partnerId,
    _anzahl: a.anzahl,
    _paketpreis: a.paketpreis,
    _bezahlt_am: a.bezahltAm || null,
    _freigeschaltet_am: a.freigeschaltetAm || null,
    _bemerkung: a.bemerkung,
  });
}

export function leadPaketAendern(a: {
  paketId: string;
  bezahltAm: string | null;
  freigeschaltetAm: string | null;
  beendet: boolean;
  bemerkung: string | null;
}): Promise<RpcErgebnis> {
  return rufe("lead_paket_aendern", {
    _paket_id: a.paketId,
    _bezahlt_am: a.bezahltAm || null,
    _freigeschaltet_am: a.freigeschaltetAm || null,
    _beendet: a.beendet,
    _bemerkung: a.bemerkung,
  });
}

export function leadPaketZuweisungVermerken(paketId: string, kontaktId: string): Promise<RpcErgebnis> {
  return rufe("lead_paket_zuweisung_vermerken", { _paket_id: paketId, _kontakt_id: kontaktId });
}

/**
 * Legt das Paket einer Bewerbung an oder ergänzt die Freischaltung, nach
 * bestätigter Zahlung und beim Anlegen des Nutzers. Alle Werte liest die
 * Datenbank selbst aus der Bewerbung; ist noch nichts anzulegen, passiert
 * nichts. Dürfen HR, Admin, Inhaber und Backoffice (wie beim Bearbeiten von
 * Bewerbungen); für andere Rollen und ohne Migration bleibt es still, damit
 * der Bewerberweg nicht an den Leadpaketen hängt.
 */
export type PaketAusBewerbungStatus =
  | "angelegt"
  | "ergaenzt"
  | "vorhanden"
  | "kein_paket"
  | "nicht_bezahlt"
  | "kein_konto"
  | "email_abweichend";

export interface PaketAusBewerbungErgebnis extends RpcErgebnis {
  /** Fehlt bei Rollen ohne Recht und ohne Migration: dann ist nichts passiert. */
  status?: PaketAusBewerbungStatus;
  anzahl?: number;
}

export async function leadPaketAusBewerbung(bewerbungId: string): Promise<PaketAusBewerbungErgebnis> {
  let data: unknown;
  let meldung: string | undefined;
  try {
    const r = await db.rpc("lead_paket_aus_bewerbung", { _bewerbung_id: bewerbungId });
    data = r.data;
    meldung = r.error ? verstaendlicheMeldung(r.error.message) : undefined;
  } catch (e) {
    meldung = verstaendlicheMeldung(e instanceof Error ? e.message : "");
  }
  if (meldung) {
    // Rollen außerhalb des Bewerberbereichs und fehlende Migration: still.
    if (/legen nur HR, Admin, Inhaber und Backoffice an|noch nicht eingerichtet/.test(meldung)) return { ok: true };
    return { ok: false, meldung };
  }
  const d = (data || {}) as { status?: PaketAusBewerbungStatus; anzahl?: number };
  return { ok: true, status: d.status, anzahl: typeof d.anzahl === "number" ? d.anzahl : undefined };
}

export function leadPaketReklamieren(zuweisungId: string, grund: string): Promise<RpcErgebnis> {
  return rufe("lead_paket_reklamation", { _zuweisung_id: zuweisungId, _grund: grund });
}
