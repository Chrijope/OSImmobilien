/**
 * Frueher: den Finanzierungspartner per Mail rufen, wenn die Bonität
 * freigegeben ist.
 *
 * Seit dem 27.10.2026 abgeschaltet: Die Mail ging an alle Finanzierer und
 * nannte jedem den Kunden. Finanzierer erfahren jetzt nur noch von Kunden,
 * die ihnen eingereicht werden (`finanzierung-partner-benachrichtigen`,
 * Migration 20261027120000). Die Function bleibt bestehen, weil eine
 * geloeschte Function auf dem Server weiterliefe; sie antwortet nur noch.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve((req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return new Response(JSON.stringify({ versendet: 0, grund: 'abgeschaltet seit 27.10.2026' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
