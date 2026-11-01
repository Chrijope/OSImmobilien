/**
 * Abgelöst am 01.11.2026 durch die Functions `kalender` und `kalender-oauth`.
 *
 * Die alte Fassung legte Zugangsdaten im Klartext in user_settings ab. Sie antwortet
 * nur noch mit einem Hinweis, damit eine noch offene alte Oberfläche nicht ins Leere läuft.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return new Response(
    JSON.stringify({ error: "Diese Kalenderanbindung wurde erneuert. Bitte die Seite neu laden." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
