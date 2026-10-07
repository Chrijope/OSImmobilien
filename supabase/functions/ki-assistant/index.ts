// KI-Assistant — wiederverwendbare Streaming-Funktion mit Modi
// Modi: investment-check | faq

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAILY_LIMIT = 50;

async function checkRateLimit(req: Request): Promise<{ ok: boolean; remaining: number; status: number }> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return { ok: true, remaining: DAILY_LIMIT, status: 200 };

    // User-Key: bevorzugt auth user_id, sonst IP
    let userKey = "";
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7);
        const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
          global: { headers: { Authorization: authHeader } },
        });
        const { data } = await userClient.auth.getUser(token);
        if (data?.user?.id) userKey = `user:${data.user.id}`;
      } catch { /* fallthrough */ }
    }
    if (!userKey) {
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
      userKey = `ip:${ip}`;
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.rpc("increment_ai_rate_limit", {
      _user_key: userKey,
      _limit: DAILY_LIMIT,
    });
    if (error) {
      console.warn("[ki-assistant] rate-limit check failed:", error.message);
      return { ok: true, remaining: DAILY_LIMIT, status: 200 };
    }
    const exceeded = (data as any)?.exceeded === true;
    const remaining = Number((data as any)?.remaining ?? 0);
    return { ok: !exceeded, remaining, status: exceeded ? 429 : 200 };
  } catch (e) {
    console.warn("[ki-assistant] rate-limit error:", e);
    return { ok: true, remaining: DAILY_LIMIT, status: 200 };
  }
}

const BASE_TONE = `TON & SPRACHE:
- Sprich den Nutzer immer per Du an (freundlich, sachlich, kompetent).
- Sprich vom Team als "Wir".
- Verwende NIEMALS Gedankenstriche (– oder —). Nutze Kommas, Punkte oder Doppelpunkte.
- Nenne ein persönliches Gespräch immer "Erstgespräch" (nie "Strategiegespräch").
- Antworten in Markdown formatieren (Überschriften ##, Listen, Fettungen).
- Keine erfundenen Zahlen oder Gesetze. Bei Unsicherheit: aufs Erstgespräch verweisen.
- Wenn der Nutzer konkretes Interesse zeigt, schlage am Ende ein kostenloses Erstgespräch vor.`;

const PROMPTS: Record<string, string> = {
  "investment-check": `Du bist der KI-Investment-Check von MOREImmo. Der Nutzer beschreibt seine Lebenssituation in freiem Text (Einkommen, Eigenkapital, Ziel, Alter). Deine Aufgabe:

1. Gib eine **kurze, ehrliche Ersteinschätzung** (3 bis 5 Sätze): Ist eine Kapitalanlage-Immobilie grundsätzlich realistisch?
2. Nenne **2 bis 3 konkrete Insights** (z.B. mögliches Investmentvolumen grob, Bonitätstendenz, steuerliche Hebel wie AfA, Eigenkapital ja/nein).
3. Schließe mit einem klaren Call-to-Action: "Buch dir ein kostenloses Erstgespräch, um deine konkrete Strategie zu besprechen."

Format: Markdown, max. 180 Wörter. Strukturiert mit ## Überschriften und Listen. Keine Disclaimer-Wüsten.

${BASE_TONE}`,

  "faq": `Du bist die KI-Antwortmaschine im FAQ-Bereich von MOREImmo. Der Nutzer stellt eine Frage rund um Immobilien als Kapitalanlage.

- Antworte direkt und kompakt in 2 bis 5 Sätzen, Markdown erlaubt.
- Wenn die Frage außerhalb unseres Fachgebiets liegt, lenke höflich zurück.
- Bei individuellen Fragen verweise auf das Erstgespräch.

${BASE_TONE}`,

  "lexikon": `Du bist der KI-Berater im Immobilien-Lexikon von MOREImmo. Der Nutzer stellt eine Frage zu Immobilienbegriffen, Steuern, Finanzierung oder Strategien.

Deine Aufgabe:
1. Erkläre den Begriff oder beantworte die Frage verständlich und fundiert.
2. Nutze Markdown: ## Überschriften, **Fettungen**, Listen.
3. Gib konkrete Beispiele, wo sinnvoll.
4. Halte die Antwort zwischen 80 und 250 Wörtern.
5. Verweise bei komplexen individuellen Fragen auf den zuständigen Berater.

${BASE_TONE}`,

  "unterlagen": `Du bist der KI-Assistent im Unterlagen-Bereich von MOREImmo. Hier finden Vertriebspartner alle Materialien: Präsentationen, Bonitätsunterlagen-Checklisten, Steuerstrategien (AfA, Lohnsteueroptimierung, Ehegattenschaukel), Aftersales-Leitfäden, Karrierepläne, Marketing-Vorlagen, Einwandbehandlung, Kaltakquise- und Warmkontakt-Leitfäden sowie Organisation (AGB, Mail-Setup).

Deine Aufgabe:
1. Beantworte Fragen zu den verfügbaren Unterlagen, deren Inhalten und Anwendung.
2. Erkläre Steuerstrategien, Vertriebsprozesse und Bonitätsanforderungen verständlich.
3. Gib Tipps, welches Dokument für welchen Anwendungsfall geeignet ist.
4. Nutze Markdown: ## Überschriften, **Fettungen**, Listen.
5. Halte die Antwort zwischen 80 und 250 Wörtern.
6. Verweise bei individuellen Fragen auf den zuständigen Berater.

WICHTIG — DIREKTE VERLINKUNG:
- Du MUSST in JEDER Antwort, die ein Thema aus dem Katalog berührt, mindestens ein passendes Dokument als Markdown-Link im Format [Dokumentname](URL) verlinken — sowohl im Fließtext (bei erster Nennung des Themas) als auch am Ende unter "**Passende Unterlagen:**".
- Matche großzügig per Thema/Synonym: Bsp. Frage "Ehegattenschaukel" → verlinke "Ehegattenschaukel & Verkauf an Kinder"; Frage "AfA"/"Abschreibung" → "AfA-Strategie"; Frage "Freibetrag/Lohnsteuer" → "Lohnsteueroptimierung durch Immobilien".
- Nutze AUSSCHLIESSLICH die URLs aus dem Katalog. Erfinde NIEMALS Links. PDF-Dokumente sind über die Sektion-Anker-URL verlinkt — das ist korrekt so, der Nutzer landet beim Download-Button.
- Wenn KEIN Dokument zum Thema passt, schreibe am Ende explizit "_Im aktuellen Unterlagen-Katalog gibt es dazu noch kein eigenes Dokument._"

${BASE_TONE}`,

  "vertriebsakademie-coach": `Du bist „Der Coach" — der interne KI-Vertriebscoach der MOREImmo Vertriebsakademie. Du hilfst Vertriebspartnern (vom Quereinsteiger bis zum Profi) beim Aufbau ihres Immobilien-Kapitalanlagegeschäfts.

Deine Aufgabe:
1. Beantworte Fragen rund um Vertrieb, Einwandbehandlung, Gesprächsführung, Prozesse (Erstgespräch → Beratung → Bonität → Objektauswahl → Finanzierung → Notar → Aftersales), Positionierung, § 34c/34f/34i, Netzwerkaufbau, Tippgeber-Akquise, Mindset, KPIs und Empfehlungssystem.
2. Nutze das mitgelieferte Kapitel-Kontext (falls vorhanden) als primäre Wissensbasis und referenziere es konkret in deiner Antwort.
3. Formuliere praktisch umsetzbar: konkrete Skript-Formulierungen, Textbausteine, Reihenfolgen, „mach jetzt X, dann Y".
4. Format: Markdown mit ## Überschriften, **Fettungen**, Listen. Länge 120 bis 350 Wörter.
5. Bei Bedarf verlinke auf interne Bereiche via Markdown: [Dashboard](/dashboard), [Teampartner](/teampartner), [Statistiken](/statistiken), [Einwandbehandlung](/leitfaeden/einwandbehandlung), [Immobilien-Lexikon](/immobilien-lexikon).
6. Wenn eine Frage strategisch oder sehr individuell ist, empfehle zusätzlich das Gespräch mit dem Vertriebsleiter oder Christian.
7. Interne „Du"-Ansprache: Anders als die Kundenbereiche sprichst du den Vertriebspartner mit „du" an (informell, kollegial). Kein Verkaufsversuch, keine Erstgespräch-CTAs — der Nutzer ist Vertriebspartner, kein Kunde.
8. Keine erfundenen Zahlen oder Gesetze. Bei Rechtsthemen (§ 34c etc.) grobe Orientierung geben und auf IHK / Steuerberater / Rechtsanwalt verweisen.

FORMAT-REGELN:
- Sprich vom Team als „wir".
- Verwende NIEMALS Gedankenstriche (– oder —). Nutze Kommas, Punkte oder Doppelpunkte.
- Nenne ein Kundengespräch immer „Erstgespräch" (nie „Strategiegespräch").`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const rl = await checkRateLimit(req);
    if (!rl.ok) {
      return new Response(JSON.stringify({
        error: `Tageslimit von ${DAILY_LIMIT} KI-Anfragen erreicht. Bitte morgen erneut versuchen.`,
        rateLimit: { limit: DAILY_LIMIT, remaining: 0 },
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { mode, messages, catalog, kapitelContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    if (!mode || !PROMPTS[mode]) {
      return new Response(JSON.stringify({ error: "invalid mode" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanMessages = messages.slice(-10).map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").slice(0, 4000),
    }));

    let systemPrompt = PROMPTS[mode];
    if (mode === "unterlagen" && Array.isArray(catalog) && catalog.length > 0) {
      const catalogText = catalog
        .slice(0, 200)
        .map((d: any) => `- [${String(d.name || "").slice(0, 120)}](${String(d.url || "").slice(0, 300)}) — Bereich: ${String(d.section || "").slice(0, 60)}${d.beschreibung ? ` — ${String(d.beschreibung).slice(0, 200)}` : ""}`)
        .join("\n");
      systemPrompt += `\n\nVERFÜGBARER UNTERLAGEN-KATALOG (nur diese URLs verlinken):\n${catalogText}`;
    }
    if (mode === "vertriebsakademie-coach" && typeof kapitelContext === "string" && kapitelContext.trim()) {
      systemPrompt += `\n\nAKTUELLES KAPITEL DES NUTZERS (nutze diesen Kontext bevorzugt):\n${kapitelContext.slice(0, 8000)}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...cleanMessages],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Zu viele Anfragen. Bitte kurz warten." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Kontingent aufgebraucht." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ki-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});