import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Rate-Limit: 30/h, 200/Tag — User-Key wenn möglich, sonst IP-Fallback.
    let _ruid: string | null = null;
    const _auth = req.headers.get("Authorization");
    if (_auth?.startsWith("Bearer ")) {
      try {
        const _uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") || "", {
          global: { headers: { Authorization: _auth } },
        });
        const { data } = await _uc.auth.getUser();
        _ruid = data?.user?.id ?? null;
      } catch { /* ignore */ }
    }
    const rl = await checkRateLimit(req, _ruid, { scope: "extract-lead-from-photo", perHour: 30, perDay: 200 });
    if (!rl.ok) return rateLimitErrorBody("extract-lead-from-photo", rl, corsHeaders);

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "Kein Bild übermittelt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine mime type from base64 prefix or default to jpeg
    let mimeType = "image/jpeg";
    let rawBase64 = imageBase64;
    if (imageBase64.startsWith("data:")) {
      const match = imageBase64.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        rawBase64 = match[2];
      }
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du bist ein OCR-Assistent. Extrahiere aus dem Bild folgende Daten eines Leads:
- Vorname
- Nachname
- Telefonnummer
- E-Mail-Adresse
- Qualifizierungsfragen und Antworten (z.B. Ziel/Wunsch, monatliches Einkommen, Eigenkapital, berufliche Situation, Familienstand, Kinderzahl, etc.)

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt. Nutze diese Struktur:
{
  "vorname": "...",
  "nachname": "...",
  "telefon": "...",
  "email": "...",
  "qualZiel": "...",
  "qualEinkommen": "...",
  "qualEigenkapital": "...",
  "qualBeruflicheSituation": "...",
  "qualFamilienstand": "...",
  "qualKinder": "...",
  "qualNotizen": "..."
}

Falls ein Feld nicht erkennbar ist, setze es auf einen leeren String "".
Gib NUR das JSON zurück, ohne Markdown-Codeblöcke oder sonstigen Text.`
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${rawBase64}`,
                },
              },
              {
                type: "text",
                text: "Bitte extrahiere alle Lead-Daten aus diesem Bild.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate-Limit erreicht, bitte kurz warten." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Guthaben aufgebraucht. Bitte lade dein Konto auf." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI Gateway error:", response.status, errText);
      throw new Error("AI-Anfrage fehlgeschlagen");
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (strip potential markdown code blocks)
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();
    }

    let extracted: Record<string, string>;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", cleaned);
      return new Response(
        JSON.stringify({ error: "KI-Antwort konnte nicht verarbeitet werden", raw: cleaned }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extracted }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
