/**
 * Gibt die Verbindungsserver fuer den eigenen Videoraum heraus.
 *
 * STUN sagt einem Browser nur, wie er von aussen aussieht. Das reicht in den
 * meisten Netzen. Sitzt eine Seite hinter einer strengen Firewall, muss der
 * Datenstrom ueber einen TURN-Server durchgereicht werden. Dessen Zugangsdaten
 * duerfen nicht im ausgelieferten Programm stehen, deshalb dieser Umweg.
 *
 * Erwartete Geheimnisse (optional, fehlen sie, bleibt es bei STUN):
 *   TURN_URLS    z. B. "turn:turn.more.immo:3478,turns:turn.more.immo:5349"
 *   TURN_SECRET  gemeinsames Geheimnis des coturn-Servers (static-auth-secret)
 *   TURN_USER    fester Benutzer, falls kein Geheimnis genutzt wird
 *   TURN_PASS    festes Passwort dazu
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const OEFFENTLICHE_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/** coturn erwartet Benutzer "ablaufzeitpunkt:name" und HMAC-SHA1 als Passwort. */
async function kurzlebigeZugangsdaten(secret: string, gueltigSekunden = 3 * 60 * 60) {
  const ablauf = Math.floor(Date.now() / 1000) + gueltigSekunden;
  const benutzer = `${ablauf}:videoraum`;
  const schluessel = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signatur = await crypto.subtle.sign("HMAC", schluessel, new TextEncoder().encode(benutzer));
  const passwort = btoa(String.fromCharCode(...new Uint8Array(signatur)));
  return { benutzer, passwort };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const iceServers: Array<Record<string, unknown>> = [...OEFFENTLICHE_STUN];

  const urls = (Deno.env.get("TURN_URLS") ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  const secret = Deno.env.get("TURN_SECRET");
  const user = Deno.env.get("TURN_USER");
  const pass = Deno.env.get("TURN_PASS");

  if (urls.length > 0) {
    try {
      if (secret) {
        const { benutzer, passwort } = await kurzlebigeZugangsdaten(secret);
        iceServers.push({ urls, username: benutzer, credential: passwort });
      } else if (user && pass) {
        iceServers.push({ urls, username: user, credential: pass });
      }
    } catch (fehler) {
      console.error("TURN-Zugangsdaten konnten nicht erzeugt werden:", fehler);
    }
  }

  return new Response(JSON.stringify({ iceServers }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
