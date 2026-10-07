/*
 * Stillgelegt am 23.09.2026.
 *
 * Diese Function gehörte ausschließlich zur interaktiven Objektvorstellung
 * (`/objektvorstellung/:token`). Die ist abgeschaltet, Exposé, Kundenansicht
 * und „Kundenlink senden“ decken sie ab. Vorher nahm sie zu einem gültigen
 * Token Aufträge ohne Anmeldung an, schickte Kundendaten an die KI und schrieb
 * das Ergebnis in `objektvorstellungen.konfig`.
 *
 * Bewusst eine leere Hülle statt gelöschter Datei: Eine gelöschte Function
 * bliebe in der zuletzt ausgerollten Fassung auf dem Server erreichbar. Diese
 * Fassung liest nichts, schreibt nichts und ruft keine KI mehr auf. Sobald sie
 * ausgerollt ist, kann die Function in Lovable entfernt und der Ordner hier
 * gelöscht werden.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({ error: "Nicht mehr verfügbar" }), {
    status: 410,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
});
