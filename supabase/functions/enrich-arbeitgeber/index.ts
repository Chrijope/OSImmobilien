// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

interface Arbeitgeber {
  name: string;
  branche: string;
  mitarbeiter: number;
  hauptsitz?: boolean;
}

async function fetchArbeitgeber(stadt: string, bundesland: string): Promise<Arbeitgeber[]> {
  const prompt = `Nenne die 6 größten Arbeitgeber der Stadt ${stadt} (${bundesland}, Deutschland).
Fokus: Unternehmen mit Hauptsitz oder größtem Standort in dieser Stadt. Keine Städte/Behörden, keine Krankenhäuser außer Uniklinik.
Antworte ausschließlich als JSON-Array (keine Erklärung, kein Markdown):
[{"name":"...","branche":"...","mitarbeiter":<zahl>,"hauptsitz":true|false}]
mitarbeiter = grobe Schätzung nur für den Standort ${stadt} (nicht weltweit).`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "Du bist ein deutscher Wirtschafts-Datenanalyst. Antworte immer strikt als valides JSON-Array." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  const raw = j?.choices?.[0]?.message?.content ?? "[]";
  const cleaned = raw.replace(/^```json\s*|^```\s*|\s*```$/gm, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  const arr = JSON.parse(match ? match[0] : cleaned);
  return Array.isArray(arr) ? arr.slice(0, 6) : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
  const body = await req.json().catch(() => ({}));
  const limit: number = Math.max(1, Math.min(200, body.limit ?? 60));
  const onlyMissing: boolean = body.onlyMissing ?? true;

  const { data: standorte, error } = await supabase
    .from("standorte")
    .select("id, name, bundesland, ags")
    .order("einwohner", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let processed = 0, upserted = 0;
  const errors: any[] = [];

  for (const s of standorte ?? []) {
    try {
      if (onlyMissing) {
        const { count } = await supabase
          .from("standort_arbeitgeber")
          .select("id", { count: "exact", head: true })
          .eq("standort_id", s.id);
        if ((count ?? 0) > 0) { processed++; continue; }
      }

      const arb = await fetchArbeitgeber(s.name, s.bundesland);
      if (arb.length === 0) { processed++; continue; }

      await supabase.from("standort_arbeitgeber").delete().eq("standort_id", s.id).eq("quelle", "ai");
      const rows = arb.map((a, i) => ({
        standort_id: s.id,
        name: String(a.name ?? "").slice(0, 200),
        branche: String(a.branche ?? "").slice(0, 100),
        mitarbeiter: Number.isFinite(+a.mitarbeiter) ? Math.max(0, +a.mitarbeiter) : null,
        hauptsitz: !!a.hauptsitz,
        rang: i + 1,
        quelle: "ai",
      })).filter((r) => r.name);
      if (rows.length) {
        const { error: insErr } = await supabase.from("standort_arbeitgeber").insert(rows);
        if (insErr) throw insErr;
        upserted += rows.length;
      }
      processed++;
      // AI Gateway rate-limit friendly
      await new Promise((r) => setTimeout(r, 400));
    } catch (e: any) {
      errors.push({ standort: s.name, error: String(e?.message ?? e) });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, standorte: processed, arbeitgeber_upserted: upserted, errors }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});