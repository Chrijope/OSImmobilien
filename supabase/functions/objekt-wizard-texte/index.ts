// Edge Function: objekt-wizard-texte (18.10.2026)
//
// Schreibt im Wizard „Neues Objekt anlegen“ einen Vorschlag für die
// Standortargumente (aus der Adresse) oder die Objektbeschreibung (aus allen
// Angaben und den Bildern). Das Objekt gibt es noch nicht in der Datenbank,
// der Browser schickt die Angaben mit. Nichts wird gespeichert; der Text
// landet im Formular und wird mit dem Objekt gespeichert.
//
// Nur Admin, Inhaber und Objektpartner (die Rollen, die Objekte pflegen).
// Ohne LOVABLE_API_KEY antwortet die Function mit einem klaren Hinweis; der
// Schlüssel wird erst beim Umzug eingetragen. Auftrag und Bereinigung stehen
// in `_shared/objekt-wizard-texte.ts`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import {
  argumenteBereinigen,
  beschreibungAuftrag,
  beschreibungBereinigen,
  darfObjektTexteErstellen,
  eingabeBereinigen,
  kiJson,
  MAX_WIZARD_BILDER,
  standortAuftrag,
} from "../_shared/objekt-wizard-texte.ts";

/** Je Bild etwa 1,5 MB als data-URL; der Browser verkleinert vorher auf 1024 Bildpunkte. */
const MAX_BILD_ZEICHEN = 2 * 1024 * 1024;
const BILD = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = /^bearer\s+(.+)$/i.exec((req.headers.get("Authorization") || "").trim())?.[1]?.trim();
    if (!token) return json({ error: "Bitte anmelden." }, 401);
    const dienst = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: nutzer } = await dienst.auth.getUser(token);
    const uid = nutzer?.user?.id;
    if (!uid) return json({ error: "Bitte anmelden." }, 401);
    const [{ data: rollen }, { data: profil }] = await Promise.all([
      dienst.from("user_roles").select("role").eq("user_id", uid),
      dienst.from("profiles").select("gesperrt").eq("id", uid).maybeSingle(),
    ]);
    if (profil?.gesperrt === true || !darfObjektTexteErstellen((rollen || []).map((r: { role: string }) => r.role))) {
      return json({ error: "Texte mit KI erstellen nur Admin, Inhaber und Objektpartner." }, 403);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return json({ error: "Der KI-Zugang ist in diesem System noch nicht eingerichtet. Bitte den Text vorerst von Hand schreiben." }, 503);
    }

    const rl = await checkRateLimit(req, uid, { scope: "objekt-wizard-texte", perHour: 40, perDay: 200 });
    if (!rl.ok) return rateLimitErrorBody("objekt-wizard-texte", rl, corsHeaders);

    const body = await req.json().catch(() => null) as { art?: unknown; angaben?: unknown; bilder?: unknown } | null;
    const art = body?.art;
    if (art !== "standortargumente" && art !== "beschreibung") return json({ error: "Unbekannte Art." }, 400);
    const angaben = eingabeBereinigen(body?.angaben);
    if (!angaben.adresse && !angaben.ort) return json({ error: "Bitte zuerst Adresse und Ort eintragen." }, 400);

    const bilder = art === "beschreibung" && Array.isArray(body?.bilder)
      ? body!.bilder.filter((b): b is string => typeof b === "string" && b.length <= MAX_BILD_ZEICHEN && BILD.test(b)).slice(0, MAX_WIZARD_BILDER)
      : [];
    const auftrag = art === "standortargumente" ? standortAuftrag(angaben) : beschreibungAuftrag(angaben, bilder.length);

    const antwort = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Pro für die Beschreibung: Sie wertet die Bilder aus und ist der Text im Exposé.
        model: art === "beschreibung" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: auftrag.system },
          {
            role: "user",
            content: [
              ...bilder.map((url) => ({ type: "image_url", image_url: { url } })),
              { type: "text", text: auftrag.nutzer },
            ],
          },
        ],
      }),
    });
    if (!antwort.ok) {
      if (antwort.status === 429) return json({ error: "Die KI ist gerade ausgelastet, bitte kurz warten." }, 429);
      if (antwort.status === 402) return json({ error: "Das KI-Guthaben ist aufgebraucht." }, 402);
      console.error("objekt-wizard-texte: Gateway", antwort.status, await antwort.text());
      return json({ error: "Die KI hat keinen Text geliefert." }, 502);
    }
    const ergebnis = await antwort.json();
    const roh = kiJson(String(ergebnis.choices?.[0]?.message?.content ?? ""));
    if (roh === undefined) return json({ error: "Die KI-Antwort ließ sich nicht lesen. Bitte noch einmal versuchen." }, 422);

    if (art === "standortargumente") {
      const fertig = argumenteBereinigen(roh);
      if (!fertig.standortargumente.length) return json({ error: "Die KI hat keine Standortargumente geliefert." }, 422);
      return json(fertig);
    }
    const fertig = beschreibungBereinigen(roh);
    if (!fertig.beschreibung) return json({ error: "Die KI hat keine Beschreibung geliefert." }, 422);
    return json({ ...fertig, bilder: bilder.length });
  } catch (e) {
    console.error("objekt-wizard-texte:", e);
    return json({ error: "Interner Fehler" }, 500);
  }
});
