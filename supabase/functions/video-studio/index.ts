/**
 * Video-Studio: sprechende Avatar-Videos ueber die Higgsfield-API.
 *
 * Ein Projekt (`video_projekte`) traegt Skript, Avatar und Format. Diese
 * Function kennt zwei Aktionen:
 *
 *   { aktion: "starten", projektId }   zerlegt das Skript in Clips
 *                                       (`clips.ts`) und gibt jeden Clip an
 *                                       Seedance 2.0 (reference-to-video):
 *                                       Foto des Avatars als Bildvorlage,
 *                                       Stimmprobe als Audiovorlage.
 *   { aktion: "abfragen", projektId }  fragt offene Clips ab, kopiert fertige
 *                                       Videos in den Eimer video-studio
 *                                       (Higgsfield haelt sie nur 7 Tage) und
 *                                       gibt kurzlebige Abspiel-Links zurueck.
 *
 * Gelesen und geschrieben wird mit dem Token des Nutzers. Die Regeln auf
 * Tabellen und Eimer lassen nur Admin und Inhaber zu.
 *
 * Geheimnisse: HIGGSFIELD_API_KEY_ID, HIGGSFIELD_API_KEY_SECRET
 * (console.higgsfield.ai, API-Guthaben ist getrennt vom Website-Abo).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { skriptInClips } from "./clips.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HF_BASIS = "https://api.higgsfield.ai";
const HF_MODELL = "/bytedance/seedance-2.0/reference-to-video";
const EIMER = "video-studio";
// Kostenbremse: 20 Clips sind rund fuenf Minuten Video.
const MAX_CLIPS = 20;
const ENDZUSTAENDE = new Set(["fertig", "fehler"]);

type Clip = {
  text: string;
  sekunden: number;
  request_id?: string;
  status_url?: string;
  status: "wartet" | "fertig" | "fehler";
  video_pfad?: string;
  fehler?: string;
};

function antwort(daten: unknown, status = 200) {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function hfKopf(): Record<string, string> {
  const id = Deno.env.get("HIGGSFIELD_API_KEY_ID");
  const secret = Deno.env.get("HIGGSFIELD_API_KEY_SECRET");
  if (!id || !secret) throw new Error("Higgsfield-Zugang fehlt: HIGGSFIELD_API_KEY_ID und HIGGSFIELD_API_KEY_SECRET im Supabase-Dashboard setzen.");
  return { Authorization: `Key ${id}:${secret}`, "Content-Type": "application/json" };
}

function prompt(text: string, mitStimme: boolean): string {
  // Englische Regieanweisung, deutscher Sprechtext: so folgt das Modell am treuesten.
  return [
    "The person from the reference image speaks directly to the camera in German",
    mitStimme ? ", with exactly the voice, pitch and accent from the reference audio" : "",
    `. They say word for word: "${text}". `,
    "Natural lip sync, friendly and professional expression, subtle natural head movement, ",
    "static camera, same look and background as the reference image. No subtitles, no music, no other people.",
  ].join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return antwort({ error: "Nicht angemeldet" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  let eingabe: { aktion?: string; projektId?: string };
  try {
    eingabe = await req.json();
  } catch {
    return antwort({ error: "Ungueltige Anfrage" }, 400);
  }
  const { aktion, projektId } = eingabe;
  if (!projektId || (aktion !== "starten" && aktion !== "abfragen")) {
    return antwort({ error: "aktion (starten|abfragen) und projektId erforderlich" }, 400);
  }

  // Die Leseregel laesst nur Admin und Inhaber durch; alle anderen sehen nichts.
  const { data: projekt, error: ladeFehler } = await supabase
    .from("video_projekte").select("*").eq("id", projektId).maybeSingle();
  if (ladeFehler) return antwort({ error: ladeFehler.message }, 500);
  if (!projekt) return antwort({ error: "Projekt nicht gefunden oder kein Zugriff" }, 404);

  try {
    if (aktion === "starten") return antwort(await starten(supabase, projekt));
    return antwort(await abfragen(supabase, projekt));
  } catch (fehler) {
    const grund = fehler instanceof Error ? fehler.message : String(fehler);
    console.error("video-studio:", grund);
    // Nur ein gescheiterter Start beendet das Projekt; beim Abfragen fragt die Seite einfach erneut.
    if (aktion === "starten") await supabase.from("video_projekte")
      .update({ status: "fehler", fehler: grund, updated_at: new Date().toISOString() })
      .eq("id", projektId);
    return antwort({ error: grund }, 500);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function signiert(supabase: Db, pfad: string, sekunden = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(EIMER).createSignedUrl(pfad, sekunden);
  if (error || !data?.signedUrl) throw new Error(`Datei nicht lesbar: ${pfad}`);
  return data.signedUrl;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function starten(supabase: Db, projekt: any) {
  if (projekt.status === "laeuft") throw new Error("Dieses Video wird gerade erzeugt.");
  if (!projekt.avatar_id) throw new Error("Kein Avatar gewaehlt.");

  const { data: avatar } = await supabase.from("video_avatare").select("*").eq("id", projekt.avatar_id).maybeSingle();
  if (!avatar) throw new Error("Avatar nicht gefunden.");

  const plan = skriptInClips(projekt.skript ?? "");
  if (plan.length === 0) throw new Error("Das Skript ist leer.");
  if (plan.length > MAX_CLIPS) throw new Error(`Skript zu lang: ${plan.length} Clips, hoechstens ${MAX_CLIPS}.`);

  const kopf = hfKopf();
  const bildUrl = await signiert(supabase, avatar.bild_pfad);
  const stimmeUrl = avatar.stimme_pfad ? await signiert(supabase, avatar.stimme_pfad) : null;

  const clips: Clip[] = [];
  for (const [i, teil] of plan.entries()) {
    const rumpf: Record<string, unknown> = {
      prompt: prompt(teil.text, !!stimmeUrl),
      image_urls: [bildUrl],
      duration: teil.sekunden,
      aspect_ratio: projekt.format,
      resolution: "720p",
      generate_audio: true,
    };
    if (stimmeUrl) rumpf.audio_urls = [stimmeUrl];

    const res = await fetch(HF_BASIS + HF_MODELL, {
      method: "POST",
      headers: { ...kopf, "Idempotency-Key": `${projekt.id}-${projekt.updated_at}-${i}` },
      body: JSON.stringify(rumpf),
    });
    const daten = await res.json().catch(() => ({}));
    if (!res.ok || !daten.request_id) {
      const grund = `Higgsfield ${res.status}: ${JSON.stringify(daten).slice(0, 300)}`;
      console.error("video-studio Clip", i, grund);
      clips.push({ ...teil, status: "fehler", fehler: grund });
      continue;
    }
    clips.push({ ...teil, status: "wartet", request_id: daten.request_id, status_url: daten.status_url });
  }

  const alleFehler = clips.every((c) => c.status === "fehler");
  const { data, error } = await supabase.from("video_projekte").update({
    clips,
    status: alleFehler ? "fehler" : "laeuft",
    fehler: alleFehler ? clips[0].fehler : null,
    updated_at: new Date().toISOString(),
  }).eq("id", projekt.id).select("*").single();
  if (error) throw new Error(error.message);
  return { projekt: data, links: {} };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function abfragen(supabase: Db, projekt: any) {
  const clips: Clip[] = Array.isArray(projekt.clips) ? projekt.clips : [];
  const offen = clips.some((c) => !ENDZUSTAENDE.has(c.status));
  const kopf = offen ? hfKopf() : {};

  for (const [i, clip] of clips.entries()) {
    if (ENDZUSTAENDE.has(clip.status) || !clip.request_id) continue;
    const url = clip.status_url ?? `${HF_BASIS}/requests/${clip.request_id}/status`;
    const res = await fetch(url, { headers: kopf });
    if (!res.ok) continue; // voruebergehend, naechste Abfrage versucht es wieder
    const daten = await res.json();

    if (daten.status === "completed" && daten.video?.url) {
      const video = await fetch(daten.video.url);
      if (!video.ok) continue;
      const pfad = `projekte/${projekt.id}/clip-${String(i + 1).padStart(2, "0")}.mp4`;
      const { error } = await supabase.storage.from(EIMER)
        .upload(pfad, await video.arrayBuffer(), { contentType: "video/mp4", upsert: true });
      if (error) throw new Error(`Clip ${i + 1} nicht gespeichert: ${error.message}`);
      clips[i] = { ...clip, status: "fertig", video_pfad: pfad };
    } else if (["failed", "nsfw", "canceled"].includes(daten.status)) {
      const grund = daten.status === "nsfw" ? "Von der Inhaltspruefung abgelehnt" : (daten.error ?? daten.status);
      clips[i] = { ...clip, status: "fehler", fehler: String(grund) };
    }
  }

  const nochOffen = clips.some((c) => !ENDZUSTAENDE.has(c.status));
  const fehlerClip = clips.find((c) => c.status === "fehler");
  const status = nochOffen ? "laeuft" : fehlerClip ? "fehler" : clips.length ? "fertig" : projekt.status;

  let aktuell = projekt;
  if (offen) {
    const { data, error } = await supabase.from("video_projekte").update({
      clips, status, fehler: fehlerClip?.fehler ?? null, updated_at: new Date().toISOString(),
    }).eq("id", projekt.id).select("*").single();
    if (error) throw new Error(error.message);
    aktuell = data;
  }

  const links: Record<number, string> = {};
  for (const [i, clip] of clips.entries()) {
    if (clip.video_pfad) links[i] = await signiert(supabase, clip.video_pfad);
  }
  return { projekt: aktuell, links };
}
