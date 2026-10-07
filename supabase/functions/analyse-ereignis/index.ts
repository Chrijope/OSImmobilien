/**
 * Der Zaehler der beiden oeffentlichen Rechner.
 *
 * WARUM ES DIESE FUNCTION GIBT
 *
 * Analysetool und Steuerrechner zaehlen ihre Stufen in die Tabelle
 * `analysetool_ereignisse`. Bis zum 18.09.2026 schrieb der Browser direkt
 * hinein, erlaubt durch eine Richtlinie mit `WITH CHECK (true)` fuer jeden
 * nicht angemeldeten Besucher. Ein Skript konnte die Tabelle damit beliebig
 * vollschreiben und nebenbei jede Auswertung verfaelschen.
 *
 * Personenbezug gibt es hier keinen, gezaehlt werden nur Stufe, Werkzeug,
 * Vertriebspartner und Kampagne. Es geht allein darum, dass die Zahlen etwas
 * wert bleiben.
 *
 * DIE BREMSE
 *
 * Ein Kontingent je Anschluss ueber dieselbe Postgres-Funktion
 * `check_rate_limit`, die auch `submit-lead` benutzt. Die Grenze ist hoch
 * angesetzt: Ein Besucher loest hoechstens vier Ereignisse aus, mehrere
 * Kollegen am selben Anschluss oder ein ganzes Mobilfunknetz hinter einer
 * Adresse kommen also nicht in die Naehe. Und selbst wer sie erreicht, merkt
 * nichts davon: Es wird dann nur nicht gezaehlt, der Rechner laeuft weiter.
 *
 * Einen Honigtopf braucht es hier nicht, es gibt kein Formular. Den tragen
 * die beiden Formulare, die am Ende der Rechner stehen.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Die vier Stufen, die die Pruefbedingung der Tabelle zulaesst. */
const TYPEN = [
  "analyse_gestartet",
  "analyse_beendet",
  "eintragung_gesehen",
  "eintragung_abgesendet",
];

/**
 * Die Stufen der Handbuch-Seite (seit dem 26.09.2026). Sie gelten nur mit dem
 * Werkzeug "handbuch" und brauchen die Migration 20260926170000; ohne sie
 * weist die Pruefbedingung der Tabelle sie ab, und es wird schlicht nichts
 * gezaehlt. Die Liste steht in `_shared/handbuch-ereignisse.ts`, damit die
 * Seite im Browser dieselben Namen benutzt.
 */
import { HANDBUCH_EREIGNISSE } from "../_shared/handbuch-ereignisse.ts";

/** Die Werkzeuge, die in dieselbe Tabelle zaehlen. */
const WERKZEUGE = ["analysetool", "steuerrechner", "handbuch"];

/** Kontingent je Anschluss. Siehe Kopf: absichtlich weit. */
const PRO_STUNDE = 240;
const PRO_TAG = 2000;

/** Laenger als das ist kein Kampagnenname, sondern ein Versuch. */
const MAX_KAMPAGNE = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "method_not_allowed" }, 405);

  try {
    const roh = await req.text();
    if (roh.length > 4000) return antwort({ ok: false, fehler: "zu_gross" }, 413);

    let koerper: Record<string, unknown>;
    try {
      koerper = JSON.parse(roh || "{}") as Record<string, unknown>;
    } catch {
      return antwort({ ok: false, fehler: "ungueltig" }, 400);
    }

    const typ = typeof koerper.typ === "string" ? koerper.typ : "";
    const werkzeug =
      typeof koerper.werkzeug === "string" && WERKZEUGE.includes(koerper.werkzeug)
        ? koerper.werkzeug
        : "analysetool";
    // Die Handbuch-Stufen nur zusammen mit dem Werkzeug "handbuch", die vier
    // alten nur mit den beiden alten Werkzeugen. So kann kein Ereignis der
    // einen Strecke in den Trichter der anderen fallen.
    const erlaubt = werkzeug === "handbuch"
      ? (HANDBUCH_EREIGNISSE as readonly string[]).includes(typ)
      : TYPEN.includes(typ);
    if (!erlaubt) return antwort({ ok: false, fehler: "unbekannte_stufe" }, 400);

    const beraterId =
      typeof koerper.berater_id === "string" && UUID.test(koerper.berater_id)
        ? koerper.berater_id
        : null;

    const kampagne =
      typeof koerper.kampagne === "string" && koerper.kampagne.trim()
        ? koerper.kampagne.trim().slice(0, MAX_KAMPAGNE)
        : null;

    const bremse = await checkEdgeRateLimit({
      scope: "analyse-ereignis",
      key: `ip:${clientIp(req)}`,
      perHour: PRO_STUNDE,
      perDay: PRO_TAG,
    });
    // Ein Zaehler darf niemandem den Weg versperren. Wer ueber dem Kontingent
    // liegt, bekommt eine freundliche Antwort, gezaehlt wird nur nichts.
    if (bremse.exceeded) return antwort({ ok: true, gezaehlt: false });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const grundzeile = { typ, werkzeug, berater_id: beraterId };
    const { error } = await admin
      .from("analysetool_ereignisse")
      .insert({ ...grundzeile, kampagne });

    if (error) {
      /* Wahrscheinlichster Grund: Die Spalte `kampagne` gibt es noch nicht,
         die Migration 20260908170000 ist nicht gelaufen. Dann wenigstens die
         Stufe zaehlen, lieber der Trichter ohne Kampagnen als gar keiner. */
      const { error: zweiter } = await admin
        .from("analysetool_ereignisse")
        .insert(grundzeile);
      if (zweiter) {
        console.error("analyse-ereignis insert:", zweiter.message);
        return antwort({ ok: true, gezaehlt: false });
      }
    }

    return antwort({ ok: true, gezaehlt: true });
  } catch (e) {
    console.error("analyse-ereignis:", e);
    // Auch hier: der Rechner soll nichts davon merken.
    return antwort({ ok: true, gezaehlt: false });
  }
});
