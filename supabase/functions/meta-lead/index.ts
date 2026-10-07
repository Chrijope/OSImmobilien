import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeMetaLeadEvent } from "../_shared/meta-capi.ts";
import { ladeMetaPixelFreigabe, type FreigabeClient } from "../_shared/meta-pixel-freigabe.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type" };
const reply = (status = 204) => new Response(null, { status, headers: { ...cors, "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return reply();
  if (req.method !== "POST") return reply(405);
  try {
    const raw = await req.text();
    if (raw.length > 200) return reply(400);
    const { receipt } = JSON.parse(raw);
    if (typeof receipt !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(receipt)) return reply(400);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("meta_lead_freigaben").delete().lt("expires_at", new Date().toISOString());
    // Atomic consume: replay/concurrent requests cannot send a second conversion.
    const { data, error } = await admin.from("meta_lead_freigaben").delete().eq("id", receipt).gt("expires_at", new Date().toISOString()).select("partner_id,pixel_id,event").maybeSingle();
    if (error || !data) return reply();
    const { data: settings } = await admin.from("user_settings").select("einstellungen").eq("user_id", data.partner_id).maybeSingle();
    if (settings?.einstellungen?.marketing?.metaPixelId?.trim() !== data.pixel_id) return reply();
    const { data: marketing } = await admin.from("vp_marketing_einstellungen").select("meta_capi_token").eq("user_id", data.partner_id).maybeSingle();
    if (!marketing?.meta_capi_token) return reply();
    // Pixel und Token nur mit Anlage 4, Bestandsschutz oder als Admin.
    if (!(await ladeMetaPixelFreigabe(admin as unknown as FreigabeClient, data.partner_id)).erlaubt) return reply();
    const result = await sendeMetaLeadEvent({ pixelId: data.pixel_id, token: marketing.meta_capi_token, event: data.event });
    if (!result.ok) console.warn("Meta lead delivery failed", result.status ?? "network");
    return reply();
  } catch { return reply(500); }
});
