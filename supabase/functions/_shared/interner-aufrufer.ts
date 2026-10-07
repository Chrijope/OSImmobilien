/**
 * Darf dieser Aufrufer eine rein interne Function benutzen?
 *
 * Verlangt werden zwei Dinge: eine gueltige Anmeldung (Nutzer-Token, nicht
 * der oeffentliche anon-Schluessel) und eine interne Rolle nach
 * `public.is_internal_role`. Kunden, Tippgeber und Bewerber sind damit
 * draussen, ebenso jeder ohne Anmeldung.
 *
 * Die Gateway-Pruefung (`verify_jwt`) reicht dafuer nicht: Sie laesst den
 * anon-Schluessel durch, und der steht in jedem Browser.
 *
 * Rueckgabe: `{ nutzerId, token }` oder eine fertige Antwort (401, 403, 500),
 * die der Aufrufer unveraendert zurueckgibt. Die Meldungen sind bewusst
 * allgemein.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface InternerAufrufer {
  nutzerId: string;
  /** Das Nutzer-Token, fuer Zugriffe mit den Rechten des Aufrufers. */
  token: string;
}

export async function internerAufrufer(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<InternerAufrufer | Response> {
  const antwort = (fehler: string, status: number) =>
    new Response(JSON.stringify({ error: fehler }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const treffer = /^bearer\s+(.+)$/i.exec((req.headers.get("Authorization") || "").trim());
  const token = treffer ? treffer[1].trim() : "";
  if (!token) return antwort("Nicht angemeldet", 401);

  const url = Deno.env.get("SUPABASE_URL");
  const dienst = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !dienst) return antwort("Server-Konfiguration fehlt", 500);

  const admin = createClient(url, dienst, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  const nutzerId = data?.user?.id;
  if (error || !nutzerId) return antwort("Nicht angemeldet", 401);

  const { data: intern, error: rollenFehler } = await admin.rpc("is_internal_role", { _user_id: nutzerId });
  if (rollenFehler) {
    console.error("[interner-aufrufer] Rolle nicht pruefbar:", rollenFehler.message);
    return antwort("Berechtigung nicht pruefbar", 500);
  }
  if (intern !== true) return antwort("Keine Berechtigung", 403);

  // Ein gesperrtes Profil behaelt Rolle und Token bis zum Ablauf. Die Sperre
  // muss deshalb hier greifen, nicht erst bei der naechsten Anmeldung.
  const { data: profil, error: profilFehler } = await admin
    .from("profiles")
    .select("gesperrt")
    .eq("id", nutzerId)
    .maybeSingle();
  if (profilFehler) {
    console.error("[interner-aufrufer] Profil nicht pruefbar:", profilFehler.message);
    return antwort("Berechtigung nicht pruefbar", 500);
  }
  if (profil?.gesperrt === true) return antwort("Keine Berechtigung", 403);

  return { nutzerId, token };
}
