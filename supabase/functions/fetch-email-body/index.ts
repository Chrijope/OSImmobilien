/**
 * Alter Name, neuer Weg (01.11.2026): Der Text einer Mail kommt jetzt über
 * ihre UID (email-aktion, aktion "inhalt"). Die frühere Suche über Absender
 * und Datum konnte die falsche Mail treffen und baute IMAP-Befehle aus
 * ungeprüften Werten. Diese Function leitet nur noch weiter.
 */
import { corsHeaders } from "../_shared/mail-anfrage.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const b = await req.json().catch(() => ({}));
  const id = b?.emailId ?? b?.id;
  return fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-aktion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers.get("Authorization") ?? "",
      apikey: req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    },
    body: JSON.stringify({ aktion: "inhalt", id }),
  }).then(async (r) => new Response(await r.text(), { status: r.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }));
});
