/**
 * Regeln des Vergleichslinks (25.10.2026), ohne Netz, damit Deno sie prüft.
 *
 * Ein Vergleich bündelt zwei bis drei bereits gesendete Kunden-Exposés eines
 * Kunden und Investments. Er ist nur so lange gültig wie das früheste
 * gebündelte Exposé, und er gilt nur für Einheiten-Exposés, die selbst noch
 * gelten. Objektübersichten (`art = objektuebersicht`) und Objekt-Exposés
 * ohne Einheit gehören nicht hinein.
 */
import { linkZustand } from "../_shared/expose-kundenlink.ts";
import { KUNDEN_EXPOSE_BASIS } from "../_shared/kunden-expose.ts";

export const VERGLEICH_MIN = 2;
export const VERGLEICH_MAX = 3;

export interface VergleichAuftrag {
  kontaktId: string;
  investmentId: string;
  exposeIds: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pruefeVergleichAuftrag(body: unknown): { ok: true; auftrag: VergleichAuftrag } | { ok: false; fehler: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kontaktId = typeof b.kontaktId === "string" ? b.kontaktId : "";
  const investmentId = typeof b.investmentId === "string" ? b.investmentId : "";
  const roh = Array.isArray(b.exposeIds) ? b.exposeIds : [];
  const exposeIds = [...new Set(roh.filter((x): x is string => typeof x === "string"))];
  if (!UUID.test(kontaktId) || !UUID.test(investmentId)) return { ok: false, fehler: "Kunde oder Investment fehlt." };
  if (exposeIds.length !== roh.length || !exposeIds.every((id) => UUID.test(id))) return { ok: false, fehler: "Ungültige Auswahl." };
  if (exposeIds.length < VERGLEICH_MIN || exposeIds.length > VERGLEICH_MAX) {
    return { ok: false, fehler: `Bitte ${VERGLEICH_MIN} bis ${VERGLEICH_MAX} Exposés wählen.` };
  }
  return { ok: true, auftrag: { kontaktId, investmentId, exposeIds } };
}

export interface ExposeZeileFuerVergleich {
  id: string;
  kontakt_id: string | null;
  investment_id: string | null;
  wohnung_id: string | null;
  art?: string | null;
  gueltig_bis: string | null;
  zurueckgezogen_am?: string | null;
}

/**
 * Passen die geladenen Exposés zum Auftrag? Gibt die früheste Frist zurück
 * oder einen Grund, warum nicht. Jede Kennung muss genau einmal gefunden sein.
 */
export function pruefeExposesFuerVergleich(
  auftrag: VergleichAuftrag,
  zeilen: ExposeZeileFuerVergleich[],
  jetzt: number = Date.now(),
): { ok: true; gueltigBis: string } | { ok: false; fehler: string } {
  const nachId = new Map(zeilen.map((z) => [z.id, z]));
  const fristen: number[] = [];
  for (const id of auftrag.exposeIds) {
    const z = nachId.get(id);
    if (!z || z.kontakt_id !== auftrag.kontaktId || z.investment_id !== auftrag.investmentId) {
      return { ok: false, fehler: "Ein gewähltes Exposé gehört nicht zu diesem Kunden und Investment." };
    }
    if ((z.art && z.art !== "expose") || !z.wohnung_id) return { ok: false, fehler: "Nur Exposés einzelner Einheiten lassen sich vergleichen." };
    if (linkZustand(z, jetzt) !== "gueltig" || !z.gueltig_bis) return { ok: false, fehler: "Ein gewähltes Exposé ist abgelaufen oder zurückgezogen." };
    fristen.push(Date.parse(z.gueltig_bis));
  }
  return { ok: true, gueltigBis: new Date(Math.min(...fristen)).toISOString() };
}

export function vergleichLink(token: string): string {
  return `${KUNDEN_EXPOSE_BASIS}/vergleich/${encodeURIComponent(token)}`;
}

/** „Mira hat deinen Vergleich geöffnet“. */
export function vergleichGlockenTitel(vorname: string | null | undefined, nachname?: string | null): string {
  const wer = (vorname || "").trim() || (nachname || "").trim() || "Dein Kunde";
  return `${wer} hat deinen Vergleich geöffnet`;
}
