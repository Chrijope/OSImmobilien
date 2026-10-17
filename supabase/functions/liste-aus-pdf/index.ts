// Eine Liste aus einem PDF lesen (17.10.2026, Objektdaten): Mieterlisten,
// Kaufpreislisten oder Wirtschaftspläne, die es nur als PDF gibt. Die KI gibt
// die Tabelle als Spaltenköpfe und Zeilen zurück; geprüft und übernommen wird
// im CRM in derselben Vorschau wie bei einer Excel-Liste. Nichts wird hier
// gespeichert.
//
// Nur Admin, Inhaber, Backoffice und Objektpartner (die Rollen der
// Objektdaten). Ohne LOVABLE_API_KEY antwortet die Funktion mit einem klaren
// Hinweis; der Schlüssel wird erst beim Umzug eingetragen.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ROLLEN = ["admin", "inhaber", "backoffice", "objektpartner"];
/** Etwa 8 MB PDF; größere Listen bitte teilen. */
const MAX_BASE64 = 11_000_000;

const antwort = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const ANWEISUNG = `Lies alle Tabellen dieses Dokuments aus, die je Zeile eine Wohneinheit (WE) oder eine Position (etwa eines Wirtschaftsplans) enthalten.
Regeln:
- Spaltenköpfe genau wie im Dokument. Gibt es keine Spalte „WE“, aber eine Nummer der Einheit, nenne diese Spalte „WE“.
- Werte unverändert übernehmen, nichts runden, nichts umrechnen, nichts ergänzen.
- Beträge, Flächen und Prozente als Zahl (deutsches Format 1.404,50 € wird 1404.5); Datumsangaben als Text TT.MM.JJJJ.
- Keine Summen-, Gesamt- oder Zwischenzeilen; keine Zeilen, die nur Text ohne Einheit enthalten.
- Fehlt ein Wert, null. Unleserliches nicht raten, sondern null.
- Antworte ausschließlich über das Werkzeug „tabellen“.`;

const WERKZEUG = {
  type: "function",
  function: {
    name: "tabellen",
    description: "Die ausgelesenen Tabellen des Dokuments.",
    parameters: {
      type: "object",
      properties: {
        blaetter: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              kopf: { type: "array", items: { type: "string" } },
              zeilen: { type: "array", items: { type: "array", items: { type: ["string", "number", "null"] } } },
            },
            required: ["name", "kopf", "zeilen"],
          },
        },
      },
      required: ["blaetter"],
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const auth = req.headers.get("Authorization") || "";
    const nutzerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "", { global: { headers: { Authorization: auth } } });
    const { data: nutzer } = await nutzerClient.auth.getUser();
    const uid = nutzer?.user?.id;
    if (!uid) return antwort({ error: "Bitte anmelden." }, 401);
    const dienst = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rollen } = await dienst.from("user_roles").select("role").eq("user_id", uid);
    if (!(rollen || []).some((r: { role: string }) => ROLLEN.includes(r.role))) {
      return antwort({ error: "Listen lesen nur Admin, Inhaber, Backoffice und Objektpartner." }, 403);
    }
    const rl = await checkRateLimit(req, uid, { scope: "liste-aus-pdf", perHour: 20, perDay: 100 });
    if (!rl.ok) return rateLimitErrorBody("liste-aus-pdf", rl, corsHeaders);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return antwort({ error: "Der KI-Zugang ist in diesem System noch nicht eingerichtet. Bitte die Liste als Excel hochladen." }, 503);
    }

    const { pdfBase64, dateiname } = await req.json();
    if (typeof pdfBase64 !== "string" || !pdfBase64) return antwort({ error: "Kein PDF übergeben." }, 400);
    if (pdfBase64.length > MAX_BASE64) return antwort({ error: "Das PDF ist zu groß (höchstens etwa 8 MB)." }, 413);

    const ki = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Du liest Tabellen aus Immobilienunterlagen exakt aus. Du erfindest nichts." },
          { role: "user", content: [
            { type: "text", text: `Datei: ${String(dateiname || "Liste.pdf").slice(0, 200)}\n\n${ANWEISUNG}` },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
          ] },
        ],
        tools: [WERKZEUG],
        tool_choice: { type: "function", function: { name: "tabellen" } },
      }),
    });
    if (!ki.ok) {
      if (ki.status === 429) return antwort({ error: "Zu viele Anfragen. Bitte in einer Minute erneut versuchen." }, 429);
      if (ki.status === 402) return antwort({ error: "KI-Kontingent erschöpft." }, 402);
      console.error("KI-Fehler", ki.status, await ki.text());
      return antwort({ error: "Das PDF ließ sich nicht auslesen." }, 502);
    }
    const daten = await ki.json();
    const argumente = daten.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const ergebnis = typeof argumente === "string" ? JSON.parse(argumente) : argumente;
    if (!ergebnis || !Array.isArray(ergebnis.blaetter)) return antwort({ error: "Im PDF wurde keine Tabelle gefunden." }, 422);
    return antwort({ blaetter: ergebnis.blaetter });
  } catch (fehler) {
    console.error("liste-aus-pdf", fehler);
    return antwort({ error: "Das PDF ließ sich nicht auslesen." }, 500);
  }
});
