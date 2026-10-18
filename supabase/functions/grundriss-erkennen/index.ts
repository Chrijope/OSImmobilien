// Edge Function: grundriss-erkennen (18.10.2026)
//
// Liest aus dem Bild eines Grundrisses Wände, Türen, Fenster, Räume und
// Maßketten per Lovable AI Gateway. Koordinaten kommen auf 0 bis 1000 je
// Bildachse normiert zurück, roh und ohne Maßstab: Umrechnen in Meter,
// Einrasten und Prüfen macht der Browser (`src/components/grundriss3d/kiErkennung.ts`),
// dort ist es testbar. Nichts wird gespeichert, das Ergebnis ist ein Entwurf.
//
// Nur für Angemeldete mit interner Rolle. Das Bild schickt der Browser mit,
// die Function lädt keine Adressen nach (kein Abrufdienst für Fremde).

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { internerAufrufer } from "../_shared/interner-aufrufer.ts";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

/** Der Browser verkleinert auf 1600 Bildpunkte, das sind als JPEG wenige hundert KB. */
const MAX_ZEICHEN = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ANWEISUNG = `Du liest Wohnungsgrundrisse (Architektenpläne, Exposé-Grundrisse, Scans).
Gib die Geometrie des Plans als JSON zurück. Alle Koordinaten sind ganze Zahlen von 0 bis 1000,
normiert je Bildachse: x = 0 linker Bildrand, 1000 rechter; y = 0 oberer Bildrand, 1000 unterer.

{
  "waende": [{ "x1": 0, "y1": 0, "x2": 0, "y2": 0, "aussen": true }],
  "oeffnungen": [{ "art": "tuer", "x1": 0, "y1": 0, "x2": 0, "y2": 0 }],
  "raeume": [{ "name": "Wohnen", "typ": "wohnen", "flaecheQm": 24.5, "punkte": [[0, 0], [0, 0], [0, 0]] }],
  "massketten": [{ "x1": 0, "y1": 0, "x2": 0, "y2": 0, "meter": 4.25 }]
}

Regeln:
- waende: jede gerade Wand als Mittellinie, von Ecke zu Ecke. Wände treffen sich an Ecken in exakt
  denselben Koordinaten. "aussen" ist true für Außenwände der Wohnung, sonst false.
  Wände laufen durch Türen und Fenster hindurch (die Öffnung ist keine Lücke in der Wand).
- oeffnungen: "art" ist "tuer" oder "fenster". x1/y1 und x2/y2 sind Anfang und Ende der Öffnung
  auf der Wandmittellinie.
- raeume: jeder Raum als Umriss entlang der Wandinnenseiten, mindestens drei Punkte, im Uhrzeigersinn.
  "typ" ist einer von: zimmer, wohnen, schlafen, kueche, bad, flur, balkon, abstell.
  "flaecheQm" ist die im Plan beschriftete Fläche des Raums, sonst null. "name" wie im Plan beschriftet.
- massketten: nur beschriftete Maßlinien, die du sicher lesen kannst; "meter" ist der Wert in Metern
  (Maße in cm umrechnen). Höchstens acht, die längsten zuerst.
- Nur die Wohnung selbst, keine Möbel, keine Nachbarwohnungen, keine Legende, kein Plankopf.
- Ist das Bild kein Grundriss, gib {"keinGrundriss": true} zurück.

Antworte ausschließlich mit dem JSON, ohne Markdown und ohne weiteren Text.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const aufrufer = await internerAufrufer(req, corsHeaders);
  if (aufrufer instanceof Response) return aufrufer;

  try {
    if (!LOVABLE_API_KEY) {
      console.error("grundriss-erkennen: LOVABLE_API_KEY fehlt");
      return json({ error: "Erkennung nicht verfügbar" }, 500);
    }

    // Eine Erkennung kostet je Plan einen teuren KI-Aufruf; pro Einheit braucht es ihn einmal.
    const rl = await checkRateLimit(req, aufrufer.nutzerId, { scope: "grundriss-erkennen", perHour: 20, perDay: 100 });
    if (!rl.ok) return rateLimitErrorBody("grundriss-erkennen", rl, corsHeaders);

    const body = await req.json().catch(() => null) as { bild?: unknown } | null;
    const bild = body?.bild;
    if (typeof bild !== "string" || bild.length > MAX_ZEICHEN || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(bild)) {
      return json({ error: "Kein gültiges Bild (JPEG, PNG oder WebP als data-URL)." }, 400);
    }

    const antwort = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Pro statt Flash: Lage und Länge der Linien sind hier das Ergebnis, nicht nur der Text.
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: ANWEISUNG },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: bild } },
              { type: "text", text: "Lies diesen Grundriss aus." },
            ],
          },
        ],
      }),
    });

    if (!antwort.ok) {
      if (antwort.status === 429) return json({ error: "Die KI ist gerade ausgelastet, bitte kurz warten." }, 429);
      if (antwort.status === 402) return json({ error: "Das KI-Guthaben ist aufgebraucht." }, 402);
      console.error("grundriss-erkennen: Gateway", antwort.status, await antwort.text());
      return json({ error: "Die Erkennung ist fehlgeschlagen." }, 502);
    }

    const ergebnis = await antwort.json();
    let text = String(ergebnis.choices?.[0]?.message?.content ?? "").trim();
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "").trim();

    let roh: unknown;
    try {
      roh = JSON.parse(text);
    } catch {
      console.error("grundriss-erkennen: keine JSON-Antwort", text.slice(0, 500));
      return json({ error: "Die KI-Antwort ließ sich nicht lesen." }, 422);
    }
    return json({ roh });
  } catch (e) {
    console.error("grundriss-erkennen:", e);
    return json({ error: "Interner Fehler" }, 500);
  }
});
