import { createClient } from "npm:@supabase/supabase-js@2";
import { kundenSprache } from "../_shared/kunden-sprache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/*
 * Fehler tragen zusätzlich ein `code`, damit die Aktivierungsseite sie in der
 * Sprache des Kunden zeigen kann (Plan Kundensprache, Etappe 1). Der deutsche
 * Text in `error` bleibt für ältere Seitenstände und für das Protokoll.
 */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "redeem");
    const token = String(body.token || "").trim();

    if (!token || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
      return json({ error: "Ungültiges Token-Format", code: "invalid_token_format" }, 400);
    }

    // ── INFO ────────────────────────────────────────────────────────────
    // Returns metadata about the token (name, email, status) for the
    // activation page to render a friendly form before the user submits
    // a password. Does NOT consume the token.
    if (action === "info") {
      const { data, error } = await admin.rpc("get_activation_token", { _token: token });
      if (error) {
        console.error("redeem-activation-token: info error", error.message);
        return json({ error: error.message }, 400);
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return json({ error: "Token nicht gefunden", code: "token_not_found" }, 404);
      // Ein benutzter oder abgelaufener Link verrät nichts mehr über das Konto:
      // keine Adresse, kein Name, keine Sprache. Die Seite zeigt dann nur den
      // passenden Hinweis.
      if (row.used || row.expired) {
        return json({ used: !!row.used, expired: !row.used && !!row.expired });
      }
      // Die Profilsprache des Kunden, damit Aktivierung, Login und 2FA schon
      // vor der Anmeldung passen. Nur für Kunden; alle anderen Rollen sehen
      // die Seiten deutsch. Rückfall Deutsch, auch bei Fehlern.
      const sprache = row.role === "kunde"
        ? await kundenSprache(admin, { kontaktId: row.kontakt_id, authUserId: row.user_id })
        : undefined;
      // Ohne Namen am Token den Vornamen aus dem Profil. Bis zum 04.10.2026
      // holte die Seite ihn selbst per E-Mail-Adresse (lookup_activation_name),
      // das ging ohne Anmeldung für jede Adresse. Hier zählt nur das Token.
      let kundeName = String(row.kunde_name || "").trim();
      if (!kundeName && row.user_id) {
        const { data: profil } = await admin.from("profiles").select("name").eq("id", row.user_id).maybeSingle();
        kundeName = String(profil?.name || "").trim().split(/\s+/)[0] || "";
      }
      return json({
        ...(sprache ? { sprache } : {}),
        email: row.email,
        kundeName,
        portal: row.portal || "",
        kontaktId: row.kontakt_id || "",
        role: row.role || "",
        next: row.next || "",
        expiresAt: row.expires_at,
        used: !!row.used,
        expired: !!row.expired,
      });
    }

    // ── REDEEM ──────────────────────────────────────────────────────────
    const password = String(body.password || "");
    if (password.length < 8) {
      return json({ error: "Passwort muss mindestens 8 Zeichen lang sein", code: "password_too_short" }, 400);
    }

    const { data: infoData, error: infoErr } = await admin.rpc("get_activation_token", { _token: token });
    if (infoErr) return json({ error: infoErr.message }, 400);
    const info = Array.isArray(infoData) ? infoData[0] : infoData;
    if (!info) return json({ error: "Token nicht gefunden", code: "token_not_found" }, 404);
    if (info.used) return json({ error: "Dieser Aktivierungslink wurde bereits verwendet", code: "token_used" }, 410);
    if (info.expired) return json({ error: "Dieser Aktivierungslink ist abgelaufen", code: "token_expired" }, 410);

    const userId = info.user_id as string;
    if (!userId) return json({ error: "Kein Nutzer für dieses Token gefunden" }, 400);

    // WICHTIG: Passwort ZUERST setzen. Erst wenn das klappt, Token verbrauchen.
    // Sonst sperrt ein abgelehntes Passwort (HIBP/Leak) den Link dauerhaft.
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updErr) {
      console.error("redeem-activation-token: updateUser error", updErr.message);
      const msg = updErr.message || "";
      const geleakt = /weak|pwned|compromis|leak|breach/i.test(msg);
      const friendly = geleakt
        ? "Dieses Passwort ist in bekannten Datenlecks aufgetaucht und daher unsicher. Bitte wähle ein anderes Passwort (z. B. eine längere Passphrase mit Sonderzeichen)."
        : "Passwort konnte nicht gesetzt werden: " + msg;
      return json({ error: friendly, code: geleakt ? "password_rejected" : "password_set_failed" }, 400);
    }

    // Erst nach erfolgreichem Passwort-Update Token atomar verbrauchen
    const { error: consumeErr } = await admin.rpc("consume_activation_token", { _token: token });
    if (consumeErr) {
      console.error("redeem-activation-token: consume error (Passwort ist trotzdem gesetzt)", consumeErr.message);
    }

    return json({
      success: true,
      email: info.email,
      kundeName: info.kunde_name || "",
      portal: info.portal || "",
      kontaktId: info.kontakt_id || "",
      next: info.next || "",
    });
  } catch (err) {
    console.error("redeem-activation-token: unexpected error", err);
    return json({ error: String(err) }, 500);
  }
});