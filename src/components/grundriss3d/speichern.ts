import { supabase } from "@/integrations/supabase/client";
import { cacheReload } from "@/lib/dataCache";
import { PLAN_VERSION, type Grundriss3dPlan } from "./plan";

/*
 * Speichern des Plans in `wohnungen.meta.grundriss3d`. Keine Migration
 * nötig, `meta` ist JSON.
 *
 * Ohne Datenverlust: `meta` wird frisch aus der Datenbank gelesen und nur der
 * eine Schlüssel ersetzt, damit Änderungen anderer an der Einheit stehen
 * bleiben. ponytail: Lesen und Schreiben sind zwei Schritte; schreibt jemand
 * genau dazwischen `meta`, gewinnt dieser Stand. Eine Datenbankfunktion mit
 * jsonb_set wäre der Weg, falls das je stört.
 */

export const META_SCHLUESSEL = "grundriss3d";

/** Fehlercodes, wenn es die Datenbankfunktion noch nicht gibt. */
const FUNKTION_FEHLT = new Set(["PGRST202", "42883"]);

/** Bildadressen, die nur in diesem Browser gelten, werden nicht gespeichert. */
export function zumSpeichern(plan: Grundriss3dPlan, jetzt = new Date()): Grundriss3dPlan {
  const h = plan.hintergrund;
  const nurLokal = !!h && /^(blob:|data:)/.test(h.url);
  return {
    ...plan,
    version: PLAN_VERSION,
    geaendertAm: jetzt.toISOString(),
    ...(h ? { hintergrund: { url: nurLokal ? "" : h.url, pxProMeter: h.pxProMeter } } : {}),
  };
}

export async function speichereEinheitPlan(wohnungId: string, plan: Grundriss3dPlan): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wie in objekteStore: Tabellentypen ohne meta-Feldtypen
  const db = supabase as any;
  /*
   * Seit 17.10.2026 über `grundriss3d_speichern`: Jede interne Rolle darf
   * genau diesen einen Schlüssel setzen, in einem Schritt (jsonb_set).
   * Fehlt die Funktion noch (Migration nicht eingespielt), der alte Weg
   * darunter, der nur Admin, Inhaber und Objektpartner durchlässt.
   */
  const rpc = await db.rpc("grundriss3d_speichern", { _wohnung_id: wohnungId, _plan: zumSpeichern(plan) });
  if (!rpc.error) {
    if (rpc.data !== true) throw new Error("Einheit nicht gefunden.");
    entwurfLoeschen(wohnungId);
    await cacheReload("wohnungen");
    return;
  }
  if (!FUNKTION_FEHLT.has(String(rpc.error.code))) throw new Error(`Nicht gespeichert: ${rpc.error.message}`);
  const { data: zeile, error: lesefehler } = await db.from("wohnungen").select("meta").eq("id", wohnungId).maybeSingle();
  if (lesefehler) throw new Error(`Einheit konnte nicht gelesen werden: ${lesefehler.message}`);
  if (!zeile) throw new Error("Einheit nicht gefunden.");
  const meta = { ...((zeile.meta as Record<string, unknown>) || {}), [META_SCHLUESSEL]: zumSpeichern(plan) };
  const { data, error } = await db.from("wohnungen").update({ meta }).eq("id", wohnungId).select("id");
  if (error) throw new Error(`Nicht gespeichert: ${error.message}`);
  // Lehnt die Zeilensicherheit ab, kommt kein Fehler, sondern keine Zeile.
  if (!Array.isArray(data) || data.length === 0) throw new Error("Diese Einheit darfst du nicht ändern. Das können Admin, Inhaber und der Objektpartner am eigenen Objekt.");
  entwurfLoeschen(wohnungId);
  await cacheReload("wohnungen");
}

/* ── Entwurf im Browser: nichts geht verloren, wenn das Fenster zugeht ── */

const entwurfSchluessel = (id: string) => `grundriss3d-entwurf:${id}`;

export function entwurfSichern(id: string, plan: Grundriss3dPlan): void {
  try { localStorage.setItem(entwurfSchluessel(id), JSON.stringify({ gesichertAm: new Date().toISOString(), plan })); } catch { /* voller oder gesperrter Speicher */ }
}

export function entwurfLaden(id: string): { gesichertAm: string; plan: Grundriss3dPlan } | null {
  try {
    const roh = localStorage.getItem(entwurfSchluessel(id));
    return roh ? JSON.parse(roh) : null;
  } catch {
    return null;
  }
}

export function entwurfLoeschen(id: string): void {
  try { localStorage.removeItem(entwurfSchluessel(id)); } catch { /* egal */ }
}
