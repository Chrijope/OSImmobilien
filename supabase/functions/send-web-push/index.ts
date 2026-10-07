import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";
import { istDienstAnfrage } from "../_shared/objekt-texte-sammel.ts";

/*
 * Seit dem 04.10.2026 nur noch fuer andere Functions und die Datenbank mit
 * dem Dienstschluessel. Vorher konnte jeder mit dem oeffentlichen Schluessel
 * an beliebige Nutzer Pushes mit beliebigem Text und Link schicken.
 *
 * Stand 04.10.2026 ruft niemand diese Function auf: Der Ausloeser
 * `trigger_send_web_push` an `benachrichtigungen` tut seit 20260623094942
 * nichts mehr. Wer Push wieder einschaltet, muss den Dienstschluessel
 * mitschicken (etwa aus dem Tresor wie bei der Mailschlange).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Nur eigene relative Pfade wie "/kunden/123". Alles andere wird "/". */
function eigenerPfad(wert: unknown): string {
  if (typeof wert !== "string") return "/";
  const pfad = wert.trim();
  if (!pfad.startsWith("/") || pfad.startsWith("//") || pfad.includes("\\") || /[\u0000-\u001f]/.test(pfad)) return "/";
  return pfad.slice(0, 500);
}

const VAPID_PUBLIC_KEY = "BPhz2MPmqw8DQ7fQlPLh60BzlwTQms15UC1_ooMJnIGkB1iCPdZRYWvs8A1iziIk659fnUDcJE4iYn9cJapn9nM";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!istDienstAnfrage(req.headers, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))) {
    return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@more.immo";

    if (!privateKey) {
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, privateKey);

    const body = await req.json();
    const { user_id, title, body: msg, url, tag, icon } = body;

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title,
      body: msg || "",
      url: eigenerPfad(url),
      tag: tag || undefined,
      icon: icon ? eigenerPfad(icon) : "/favicon.png",
    });

    let sent = 0;
    let removed = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload
          );
          sent++;
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("id", sub.id);
            removed++;
          } else {
            console.error("Push send failed:", err?.statusCode, err?.body);
          }
        }
      })
    );

    return new Response(JSON.stringify({ sent, removed, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-web-push error:", err);
    return new Response(JSON.stringify({ error: "Push fehlgeschlagen" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});