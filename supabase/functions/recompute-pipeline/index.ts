import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Nightly Pipeline Recompute.
 * - Notartermin vorbei → Fälligkeit
 * - 4+ Kontaktversuche & letzter Versuch > 3 Tage her → Verloren
 * - Empfehlungsstatus aus der effektiven Pipelinestufe des geworbenen
 *   Kontakts nachziehen (Netz für Schreibwege außerhalb des Browsers)
 *
 * Aufgerufen via pg_cron (täglich 03:00).
 */

/* ============================================================
 * Empfehlungs-Status-Automatik, serverseitiges Netz.
 *
 * QUELLE: src/lib/empfehlungenStore.ts (Mapping und Entscheidungsregeln)
 * sowie src/lib/kontaktPipeline.ts (effektive Stufe). Änderungen dort
 * müssen hier gespiegelt werden. Die effektive Stufe ist bewusst eine
 * vereinfachte Spiegelung: Signatur-Feinheiten (Selbstauskunft
 * unterschrieben usw.) verschieben die Stufe nur innerhalb derselben
 * Statusgruppe und ändern das Ergebnis des Mappings nicht.
 * ============================================================ */

/** Reihenfolge der Stufen, gespiegelt aus PIPELINE_STUFEN (pipelineStufen.ts). */
const PIPELINE_ORDER = [
  "neuer_lead", "nicht_erreicht", "erreicht", "follow_up",
  "erstgespraech_geplant", "erstgespraech", "eg_noshow",
  "beratungsgespraech", "bg_noshow", "selbstauskunft", "objektauswahl",
  "follow_up_objekt", "reservierung", "bonitaetsunterlagen", "finanzierung", "notar",
  "faelligkeit", "abrechnung", "abgeschlossen", "bestandsimport",
  "archiviert", "verloren",
];
const PIPELINE_SET = new Set(PIPELINE_ORDER);

/** Legacy-Aliase, gespiegelt aus normalizePipelineStufe (kontaktPipeline.ts). */
function normalizeStufe(stufe: string | null | undefined): string | null {
  if (!stufe) return null;
  let s = stufe;
  if (s === "after_sales" || s === "aftersales") s = "faelligkeit";
  if (s === "closing") s = "objektauswahl";
  if (s === "zugewiesen") s = "neuer_lead";
  if (s === "vermoegensaufbau") s = "follow_up";
  if (s === "kontaktversuche") s = "nicht_erreicht";
  if (s === "notar_mit_gs" || s === "notar_ohne_gs") s = "notar";
  return PIPELINE_SET.has(s) ? s : null;
}

/** Mapping Stufe → Empfehlungsstatus, gespiegelt aus pipelineToEmpfehlungStatus. */
function stufeZuStatus(stufe: string | null | undefined): string | null {
  const s = normalizeStufe(stufe);
  if (!s) return null;
  switch (s) {
    case "neuer_lead":
    case "bestandsimport":
      return "offen";
    case "nicht_erreicht":
    case "erreicht":
    case "follow_up":
    case "eg_noshow":
      return "kontaktiert";
    case "erstgespraech_geplant":
    case "erstgespraech":
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

/** Rangordnung, gespiegelt aus STATUS_ORDNUNG (empfehlungenStore.ts). */
const STATUS_ORDNUNG: Record<string, number> = {
  neu: 0, offen: 0, kontaktiert: 1, termin: 2,
  in_beratung: 3, in_abwicklung: 4, abgeschlossen: 5,
};

/** Entscheidungsregeln, gespiegelt aus entscheideEmpfehlungStatusSync. */
function entscheideStatus(
  aktuellerStatus: string | null | undefined,
  statusManuell: boolean,
  pipelineStufe: string | null | undefined,
): string | null {
  const ziel = stufeZuStatus(pipelineStufe);
  if (!ziel) return null;
  const aktuell = aktuellerStatus || "neu";
  if (aktuell === "dublette") return null;
  if (statusManuell && ziel !== "abgeschlossen" && ziel !== "verloren") return null;
  if (ziel === aktuell) return null;
  if (ziel === "verloren") return "verloren";
  if (aktuell === "verloren") return ziel;
  const rangAktuell = STATUS_ORDNUNG[aktuell] ?? 0;
  const rangZiel = STATUS_ORDNUNG[ziel] ?? 0;
  return rangZiel > rangAktuell ? ziel : null;
}

type KontaktRow = {
  id: string;
  status: string | null;
  archiviert: boolean | null;
  geloescht: boolean | null;
  meta: Record<string, unknown> | null;
};

/**
 * Effektive Pipelinestufe, vereinfachte Spiegelung von
 * getEffectivePipelineStufe (kontaktPipeline.ts): archiviert/verloren
 * gewinnen, danach die höchste Investment-Stufe ab "selbstauskunft"
 * (aktive Investments bevorzugt), dann die Kontakt-Stufe, dann der
 * Status-Fallback.
 */
function effektiveStufe(kontakt: KontaktRow, investmentStufen: string[]): string {
  if (kontakt.archiviert) return "archiviert";
  if (kontakt.status === "verloren" || kontakt.status === "inaktiv") return "verloren";

  const normalisiert = investmentStufen
    .map((s) => normalizeStufe(s))
    .filter((s): s is string => !!s);
  const aktive = normalisiert.filter(
    (s) => s !== "abgeschlossen" && s !== "archiviert" && s !== "verloren",
  );
  const pool = aktive.length > 0 ? aktive : normalisiert;
  const minIdx = PIPELINE_ORDER.indexOf("selbstauskunft");
  let best = -1;
  for (const s of pool) {
    const idx = PIPELINE_ORDER.indexOf(s);
    if (idx >= minIdx && idx > best) best = idx;
  }
  if (best >= 0) return PIPELINE_ORDER[best];

  const meta = (kontakt.meta || {}) as Record<string, unknown>;
  const direkt = normalizeStufe(meta.pipelineStufe as string | undefined);
  if (direkt) return direkt;

  // Status-Fallback. "kunde" landet im Original je nach Objekt auf
  // "abgeschlossen" oder "faelligkeit"; beide mappen auf den Status
  // "abgeschlossen", die Unterscheidung ist hier deshalb egal.
  if (kontakt.status === "kunde") return "faelligkeit";
  if (kontakt.status === "qualifiziert") return "bonitaetsunterlagen";
  if (kontakt.status === "kontaktiert") return "erreicht";
  return "neuer_lead";
}

/**
 * Zieht den Status aller verknüpften Empfehlungen nach. Fängt Schreibwege
 * außerhalb des Browsers ein (RPCs, Importe, direkte Updates), die den
 * Client-Sync in kundenStore/investmentsStore nicht durchlaufen.
 */
async function syncEmpfehlungsStatus(supabase: SupabaseClient) {
  // kontakt_id zuerst; solange die Migration 20260818160000 nicht gelaufen
  // ist, fehlt die Spalte und es zählt nur meta->>neuerKontaktId.
  let empfehlungen: Array<Record<string, unknown>> | null = null;
  let { data, error } = await supabase
    .from("empfehlungen")
    .select("id, status, meta, kontakt_id");
  if (error && String(error.message || "").includes("kontakt_id")) {
    ({ data, error } = await supabase.from("empfehlungen").select("id, status, meta"));
  }
  if (error) throw error;
  empfehlungen = data || [];

  const verknuepfte = empfehlungen
    .map((e) => {
      const meta = (e.meta || {}) as Record<string, unknown>;
      const kontaktId = (e.kontakt_id as string | undefined) || (meta.neuerKontaktId as string | undefined) || null;
      return { id: e.id as string, status: (e.status as string) || "neu", meta, kontaktId };
    })
    .filter((e): e is typeof e & { kontaktId: string } => !!e.kontaktId);

  if (verknuepfte.length === 0) return { geprueft: 0, geaendert: 0, fehler: 0 };

  const kontaktIds = Array.from(new Set(verknuepfte.map((e) => e.kontaktId)));

  // Kontakte und Investments in Blöcken laden, damit die IN-Liste nicht
  // unbegrenzt wächst.
  const kontakte = new Map<string, KontaktRow>();
  const investmentStufen = new Map<string, string[]>();
  for (let i = 0; i < kontaktIds.length; i += 100) {
    const block = kontaktIds.slice(i, i + 100);
    const [kRes, iRes] = await Promise.all([
      supabase.from("kontakte").select("id, status, archiviert, geloescht, meta").in("id", block),
      supabase.from("investments").select("kunde_id, meta").in("kunde_id", block),
    ]);
    if (kRes.error) throw kRes.error;
    if (iRes.error) throw iRes.error;
    for (const k of kRes.data || []) kontakte.set(k.id as string, k as KontaktRow);
    for (const inv of iRes.data || []) {
      const kundeId = inv.kunde_id as string;
      const stufe = ((inv.meta || {}) as Record<string, unknown>).pipelineStufe as string | undefined;
      if (!stufe) continue;
      const liste = investmentStufen.get(kundeId) || [];
      liste.push(stufe);
      investmentStufen.set(kundeId, liste);
    }
  }

  let geaendert = 0;
  let fehler = 0;
  for (const emp of verknuepfte) {
    const kontakt = kontakte.get(emp.kontaktId);
    if (!kontakt || kontakt.geloescht) continue;

    const stufe = effektiveStufe(kontakt, investmentStufen.get(emp.kontaktId) || []);
    const statusManuell = emp.meta.statusManuell === true;
    const neuerStatus = entscheideStatus(emp.status, statusManuell, stufe);

    const update: Record<string, unknown> = {};
    if (neuerStatus) update.status = neuerStatus;

    // Prämien-Automatik, gespiegelt aus praemiePatchFuerAbschluss:
    // idempotent, greift auch wenn der Status schon "abgeschlossen" war.
    const zielIstAbschluss = stufeZuStatus(stufe) === "abgeschlossen";
    const statusIstAbschluss = neuerStatus === "abgeschlossen"
      || (neuerStatus === null && emp.status === "abgeschlossen");
    if (zielIstAbschluss && statusIstAbschluss && emp.status !== "dublette") {
      const patch: Record<string, unknown> = {};
      if (emp.meta.praemieStatus !== "ausgezahlt" && emp.meta.praemieStatus !== "berechtigt") {
        patch.praemieStatus = "berechtigt";
      }
      if (!emp.meta.abgeschlossenAm) {
        patch.abgeschlossenAm = new Date().toISOString().split("T")[0];
      }
      if (Object.keys(patch).length > 0) update.meta = { ...emp.meta, ...patch };
    }

    if (Object.keys(update).length === 0) continue;
    const { error: updateFehler } = await supabase
      .from("empfehlungen")
      .update(update)
      .eq("id", emp.id);
    if (updateFehler) {
      console.error("Empfehlung", emp.id, "konnte nicht aktualisiert werden:", updateFehler);
      fehler++;
    } else {
      geaendert++;
    }
  }

  return { geprueft: verknuepfte.length, geaendert, fehler };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "recompute-pipeline", corsHeaders);
  if (abgewiesen) return abgewiesen;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc("bulk_recompute_pipeline");
    if (error) throw error;

    // Empfehlungsstatus nachziehen. Ein Fehler hier darf das Ergebnis des
    // Pipeline-Laufs nicht verwerfen, wird aber sichtbar zurückgemeldet.
    let empfehlungen: { geprueft: number; geaendert: number; fehler: number } | { fehler: string };
    try {
      empfehlungen = await syncEmpfehlungsStatus(supabase);
    } catch (syncFehler) {
      console.error("Empfehlungs-Sync fehlgeschlagen:", syncFehler);
      empfehlungen = { fehler: syncFehler instanceof Error ? syncFehler.message : "Unbekannter Fehler" };
    }

    return new Response(
      JSON.stringify({ success: true, result: data, empfehlungen }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("recompute-pipeline error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
