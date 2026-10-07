import { holeJson, liste, zugaenge } from "./api.ts";
import { kennung, projektKennungVon } from "./mapping.ts";

/**
 * Die Warteschlange fuer Investagon-Ereignisse.
 *
 * Der Webhook nimmt eine Meldung entgegen und legt sie hier ab, mehr nicht.
 * Die eigentliche Arbeit macht derselbe Import wie beim vollen Abgleich, nur
 * auf die betroffenen Projekte beschraenkt. So gibt es genau einen Schreibweg
 * in die Objekte und Wohnungen.
 *
 * Warum ueberhaupt eine Warteschlange: Investagon wiederholt eine misslungene
 * Zustellung nicht. Ohne Ablage waere jede Meldung, die waehrend eines
 * Ausfalls ankommt, fuer immer verloren. Ein Eintrag bleibt deshalb liegen,
 * bis er wirklich verarbeitet ist, und wird bei einem Fehler mit wachsendem
 * Abstand erneut versucht.
 */

export const MAX_VERSUCHE = 6;

/** Wartezeit vor dem naechsten Versuch: 1, 2, 4, 8, 16, 32 Minuten. */
export function abstandMinuten(versuche: number): number {
  return Math.min(2 ** Math.max(0, versuche - 1), 32);
}

export interface Aufgabe {
  id: string;
  art: string;
  kennung: string;
  ereignis: string;
  versuche: number;
}

// deno-lint-ignore no-explicit-any
type Db = any;

/**
 * Faellige Eintraege uebernehmen und auf `laeuft` setzen.
 *
 * Der Statuswechsel ist die Sperre: ein zweiter, gleichzeitig gestarteter
 * Lauf findet die Zeilen dann nicht mehr als offen vor.
 */
export async function aufgabenHolen(db: Db, anzahl = 25): Promise<Aufgabe[]> {
  const { data, error } = await db
    .from("investagon_sync_queue")
    .select("id, art, kennung, ereignis, versuche")
    .eq("status", "offen")
    .lte("naechster_versuch", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(anzahl);
  if (error) throw error;
  const aufgaben = (data || []) as Aufgabe[];
  if (aufgaben.length === 0) return [];
  const { data: gesperrt, error: sperrFehler } = await db
    .from("investagon_sync_queue")
    .update({ status: "laeuft" })
    .in("id", aufgaben.map((a) => a.id))
    .eq("status", "offen")
    .select("id, art, kennung, ereignis, versuche");
  if (sperrFehler) throw sperrFehler;
  return (gesperrt || []) as Aufgabe[];
}

/**
 * Zu einer Meldung das betroffene Projekt finden.
 *
 * Zuerst im eigenen Bestand nachsehen, das kostet keinen fremden Aufruf und
 * beantwortet den haeufigsten Fall (eine bekannte Wohnung aendert sich).
 * Erst danach Investagon fragen.
 */
export async function projektZuAufgabe(
  db: Db,
  aufgabe: Aufgabe,
): Promise<string> {
  if (aufgabe.art === "projekt") return aufgabe.kennung;

  let propertyId = aufgabe.kennung;

  if (aufgabe.art === "reservierung") {
    propertyId = "";
    for (const z of zugaenge(Deno.env)) {
      try {
        const r = await holeJson<Record<string, unknown>>(
          z,
          `/api/reservations/${encodeURIComponent(aufgabe.kennung)}`,
        );
        const roh = (r?.property ?? r?.api_property ?? r?.propertyId) as
          | Record<string, unknown>
          | string
          | undefined;
        propertyId = typeof roh === "string"
          ? roh.split("/").filter(Boolean).pop() || ""
          : roh
          ? kennung(roh as Record<string, unknown>)
          : "";
        if (propertyId) break;
      } catch { /* naechster Zugang */ }
    }
    if (!propertyId) throw new Error("Reservierung ohne erkennbare Wohnung");
  }

  // 1. Eigener Bestand
  const { data: wohnung } = await db
    .from("wohnungen")
    .select("objekt_id")
    .eq("meta->>investagonId", propertyId)
    .maybeSingle();
  if (wohnung?.objekt_id) {
    const { data: objekt } = await db
      .from("objekte")
      .select("meta")
      .eq("id", wohnung.objekt_id)
      .maybeSingle();
    const slug = objekt?.meta?.investagonSlug;
    if (typeof slug === "string" && slug) return slug;
  }

  // 2. Investagon fragen
  for (const z of zugaenge(Deno.env)) {
    try {
      const detail = await holeJson<Record<string, unknown>>(
        z,
        `/api/properties/${encodeURIComponent(propertyId)}`,
      );
      const projekt = projektKennungVon(detail);
      if (projekt) return projekt;
      // Einzelwohnung ohne Projekt: sie ist im CRM ihr eigenes Objekt.
      if (detail && kennung(detail)) return kennung(detail);
    } catch { /* naechster Zugang */ }
  }

  /*
   * Geloeschte Wohnungen beantwortet Investagon mit 404. Dann bleibt nur der
   * eigene Bestand, und dort wird nichts geloescht: Der volle Abgleich
   * entscheidet darueber, mit seinen Schutzregeln fuer Kundenbindungen.
   */
  throw new Error(`Kein Projekt zu ${aufgabe.art} ${propertyId} gefunden`);
}

/** Erledigt. */
export async function fertig(db: Db, ids: string[]) {
  if (!ids.length) return;
  await db.from("investagon_sync_queue")
    .update({ status: "fertig", letzter_fehler: null })
    .in("id", ids);
}

/** Nicht geklappt: spaeter erneut, und nach genug Versuchen aufgeben. */
export async function spaeterErneut(
  db: Db,
  aufgabe: Aufgabe,
  grund: string,
) {
  const versuche = aufgabe.versuche + 1;
  const aufgegeben = versuche >= MAX_VERSUCHE;
  await db.from("investagon_sync_queue").update({
    status: aufgegeben ? "fehler" : "offen",
    versuche,
    letzter_fehler: grund.slice(0, 500),
    naechster_versuch: new Date(
      Date.now() + abstandMinuten(versuche) * 60_000,
    ).toISOString(),
  }).eq("id", aufgabe.id);
}

/** Nur fuer die Diagnose: wie viele Meldungen warten gerade? */
export async function warteschlangeStand(db: Db) {
  const { data } = await db.from("investagon_sync_queue")
    .select("status")
    .in("status", ["offen", "laeuft", "fehler"]);
  const stand = { offen: 0, laeuft: 0, fehler: 0 };
  for (const z of liste(data || [])) {
    const s = String(z.status);
    if (s in stand) stand[s as keyof typeof stand]++;
  }
  return stand;
}
