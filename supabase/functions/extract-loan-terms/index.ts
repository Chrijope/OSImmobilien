// Edge Function: extract-loan-terms
// Lädt einen freigegebenen Darlehensvertrag (PDF) aus dem Eimer `unterlagen`,
// extrahiert per Lovable AI Gateway den Sollzinssatz (Nominalzins p.a.)
// und gibt diesen als Number zurück. Kein Speichern – das macht der Client.
//
// Seit dem 04.10.2026 nur für Angemeldete mit interner Rolle. Die Datei wird
// mit dem Token des Aufrufers geladen, nicht mit dem Dienstschlüssel: Wer sie
// im Browser nicht öffnen darf, bekommt sie auch hier nicht. Eine fremde
// Adresse (`fileUrl`) nimmt die Function nicht mehr an, sonst ließe sie sich
// als Abrufdienst für beliebige Adressen missbrauchen.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { internerAufrufer } from "../_shared/interner-aufrufer.ts";

interface RequestBody {
  filePath?: string;         // Pfad im Eimer `unterlagen`, z. B. "finanzierung/<investmentId>/<angebotId>/<datei>.pdf"
}

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/** Ein Darlehensvertrag ist ein paar MB groß, mehr schickt niemand an die KI. */
const MAX_BYTES = 20 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Positivliste: nur Finanzierungsunterlagen, nur harmlose Zeichen. */
const PFAD_MUSTER = /^finanzierung\/[A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)+$/;

/** Kein Teilstück nur aus Punkten, sonst ginge es aus dem Ordner heraus. */
function gueltigerPfad(pfad: unknown): pfad is string {
  return typeof pfad === "string"
    && pfad.length < 500
    && PFAD_MUSTER.test(pfad)
    && !pfad.split("/").some((teil) => /^\.+$/.test(teil));
}

/** In Stücken, sonst sprengt eine größere PDF den Aufrufstapel. */
function alsBase64(bytes: Uint8Array): string {
  let binaer = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binaer += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binaer);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const aufrufer = await internerAufrufer(req, corsHeaders);
  if (aufrufer instanceof Response) return aufrufer;

  try {
    if (!LOVABLE_API_KEY || !SUPABASE_ANON_KEY) {
      console.error("extract-loan-terms: LOVABLE_API_KEY oder SUPABASE_ANON_KEY fehlt");
      return json({ error: "Auslesen nicht verfügbar" }, 500);
    }
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    if (!gueltigerPfad(body.filePath)) return json({ error: "Ungültige Anfrage" }, 400);

    // 1) PDF mit den Rechten des Aufrufers laden
    const alsNutzer = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${aufrufer.token}` } },
    });
    const { data: datei, error: ladeFehler } = await alsNutzer.storage.from("unterlagen").download(body.filePath);
    if (ladeFehler || !datei) {
      console.error("extract-loan-terms: Download fehlgeschlagen", ladeFehler?.message);
      return json({ error: "Datei nicht verfügbar" }, 404);
    }
    if (datei.size > MAX_BYTES) return json({ error: "Datei zu groß" }, 413);
    const pdfBytes = new Uint8Array(await datei.arrayBuffer());
    if (pdfBytes.length < 5 || String.fromCharCode(...pdfBytes.subarray(0, 4)) !== "%PDF") {
      return json({ error: "Keine PDF-Datei" }, 400);
    }

    // 2) base64 für AI Gateway
    const base64 = alsBase64(pdfBytes);

    // 3) Lovable AI Gateway – tool calling für strukturierte Ausgabe
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content:
              "Du extrahierst aus einem deutschen Immobilien-Darlehensvertrag den Sollzinssatz (Nominalzins) p.a. " +
              "Gib NUR diesen Wert via Tool-Call zurück. Wenn unklar, gib zinssatz=null zurück.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Bitte den Sollzinssatz (Nominalzins p.a., NICHT den Effektivzins) auslesen." },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "report_loan_terms",
              description: "Gibt den extrahierten Sollzinssatz zurück.",
              parameters: {
                type: "object",
                properties: {
                  zinssatz: {
                    type: ["number", "null"],
                    description: "Sollzinssatz / Nominalzins in Prozent p.a. (z. B. 3.85). Null falls nicht erkennbar.",
                  },
                  fundstelle: {
                    type: "string",
                    description: "Kurzer Hinweis, woher der Wert stammt (z. B. 'Sollzinsbindung 10 Jahre, 3,85 % p.a.').",
                  },
                },
                required: ["zinssatz"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "report_loan_terms" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate Limit erreicht – bitte später erneut versuchen." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI-Guthaben aufgebraucht – bitte Workspace-Usage prüfen." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("AI Gateway Fehler", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI Gateway Fehler" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    let zinssatz: number | null = null;
    let fundstelle = "";
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (typeof args.zinssatz === "number") zinssatz = args.zinssatz;
        if (typeof args.fundstelle === "string") fundstelle = args.fundstelle;
      } catch (e) {
        console.error("Tool-Call-Argumente konnten nicht geparst werden:", e);
      }
    }

    return new Response(JSON.stringify({ zinssatz, fundstelle }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-loan-terms Fehler:", e);
    return json({ error: "Auslesen fehlgeschlagen" }, 500);
  }
});
