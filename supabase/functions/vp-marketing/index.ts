import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pruefeMetaVerbindung } from "../_shared/meta-verbindung.ts";
import { ladeMetaPixelFreigabe, type FreigabeClient } from "../_shared/meta-pixel-freigabe.ts";
// Seit 27.09.2026: Pixel und Token nur mit Anlage 4 zum Vertrag, mit
// Bestandsschutz oder als Admin. Entfernen ist immer erlaubt.
const OHNE_ANLAGE_4 = "Ein eigenes Meta Pixel ist mit dem Vertragsstand ab Oktober 2026 (Anlage 4) möglich. Sprich uns an.";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return reply({ ok: false }, 405);
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const jwt = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!jwt) return reply({ ok: false, fehler: "Bitte erneut anmelden." }, 401);
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !auth.user) return reply({ ok: false, fehler: "Bitte erneut anmelden." }, 401);
    const raw = await req.text();
    if (raw.length > 10000) return reply({ ok: false }, 413);
    const body = JSON.parse(raw);
    // Always the authenticated account: client cannot choose a different partner.
    if (body.userId !== auth.user.id) return reply({ ok: false, fehler: "Kein Zugriff auf diese Einstellungen." }, 403);
    const userId = auth.user.id;
    const action = body.action;
    if (!["status", "save", "delete", "check", "entfernen"].includes(action)) return reply({ ok: false }, 400);
    // "entfernen": Pixel-ID leeren, Token loeschen, Bestandsschutz beenden,
    // immer erlaubt (Codex-Pruefung 27.09.2026, A4-07). Mit Migration
    // 20260927040000 in einer Transaktion (meta_pixel_entfernen). Ohne sie
    // Schritt fuer Schritt; jeder Fehler geht sichtbar an die Oberflaeche.
    if (action === "entfernen") {
      const { error: rpcError } = await admin.rpc("meta_pixel_entfernen", { p_user_id: userId });
      if (!rpcError) return reply({ ok: true });
      const fehltFunktion = rpcError.code === "PGRST202" || rpcError.code === "42883";
      if (!fehltFunktion) {
        console.error("meta_pixel_entfernen fehlgeschlagen:", rpcError.message);
        return reply({ ok: false, fehler: "Das Pixel konnte nicht entfernt werden. Bitte Administrator kontaktieren." });
      }
      const { data: zeile, error: leseFehler } = await admin.from("user_settings").select("einstellungen").eq("user_id", userId).maybeSingle();
      if (leseFehler) return reply({ ok: false, fehler: "Das Pixel konnte nicht entfernt werden. Bitte Administrator kontaktieren." });
      if (zeile) {
        const eins = (zeile.einstellungen ?? {}) as Record<string, unknown>;
        const marketing = { ...((eins.marketing ?? {}) as Record<string, unknown>), metaPixelId: "" };
        const { error: schreibFehler } = await admin.from("user_settings")
          .update({ einstellungen: { ...eins, marketing }, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (schreibFehler) return reply({ ok: false, fehler: "Das Pixel konnte nicht entfernt werden. Bitte Administrator kontaktieren." });
      }
      const { error: tokenFehler } = await admin.from("vp_marketing_einstellungen")
        .update({ meta_capi_token: null, updated_at: new Date().toISOString() }).eq("user_id", userId);
      if (tokenFehler && !["42P01", "PGRST205"].includes(tokenFehler.code)) {
        return reply({ ok: false, fehler: "Pixel-ID entfernt, das Token aber nicht. Bitte Administrator kontaktieren." });
      }
      return reply({ ok: true });
    }
    const freigabe = await ladeMetaPixelFreigabe(admin as unknown as FreigabeClient, userId);
    if (action === "save" && !freigabe.erlaubt) return reply({ ok: false, gesperrt: true, fehler: OHNE_ANLAGE_4 });
    if (action === "save" || action === "delete") {
      const token = action === "delete" ? null : typeof body.token === "string" ? body.token.trim() : "";
      if (action === "save" && (!token || token.length > 4096 || /\s/.test(token))) return reply({ ok: false, fehler: "Bitte ein gültiges Token einfügen." });
      const { error } = await admin.from("vp_marketing_einstellungen").upsert({ user_id: userId, meta_capi_token: token, updated_at: new Date().toISOString() });
      if (error) return reply({ ok: false, fehler: "Token konnte nicht gespeichert werden. Bitte Administrator kontaktieren." });
      return reply({ ok: true });
    }
    const { data, error } = await admin.from("vp_marketing_einstellungen").select("meta_capi_token").eq("user_id", userId).maybeSingle();
    const pixelFreigabe = { pixelErlaubt: freigabe.erlaubt, freigabeGrund: freigabe.grund };
    if (error) return reply({ ok: false, hinterlegt: false, tabelleFehlt: ["42P01", "PGRST205"].includes(error.code), fehler: "Marketing-Einstellungen sind derzeit nicht verfügbar.", ...pixelFreigabe });
    const token = data?.meta_capi_token || "";
    if (action === "status") return reply({ ok: true, hinterlegt: !!token, tabelleFehlt: false, ...pixelFreigabe });
    const { data: settings, error: settingsError } = await admin.from("user_settings").select("einstellungen").eq("user_id", userId).maybeSingle();
    if (settingsError) return reply({ ok: false, fehler: "Pixel-ID konnte nicht geladen werden." });
    const pixelId = settings?.einstellungen?.marketing?.metaPixelId?.trim() || "";
    return reply({ ...await pruefeMetaVerbindung(pixelId, token), pixelId });
  } catch { return reply({ ok: false, fehler: "Die Anfrage konnte nicht verarbeitet werden." }, 500); }
});
