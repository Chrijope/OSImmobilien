import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hatBeraterRolle } from "../_shared/lead-zuordnung.ts";
import { vergibVpSlug } from "../_shared/vp-slug.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Ungültiger Token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Profil + Rollen laden
    const [profileRes, rolesRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, vp_slug").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (!profileRes.data) {
      return new Response(JSON.stringify({ error: "Profil nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dieselbe Rollenliste wie `get-vp-microsite` und `submit-lead`, sie steht
    // einmal in `lead-zuordnung.ts`. Wer hier ein Kuerzel bekommt, dessen Link
    // loest dort auf und bekommt die Leads daraus. Backoffice steht nicht in
    // der Liste und bekommt deshalb keinen Link.
    if (!hatBeraterRolle(rolesRes.data as Array<{ role?: unknown }> | null)) {
      return new Response(JSON.stringify({ error: "Keine Berater-Rolle" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ein vergebenes Kuerzel bleibt, auch wenn es nicht mehr zum Namen passt.
    // Frueher wurde es hier "repariert", und jeder bereits verschickte Link
    // war danach tot. Begruendung und die Vergabe selbst in `_shared/vp-slug.ts`.
    const slug = await vergibVpSlug(supabaseAdmin, {
      userId,
      aktuellerSlug: profileRes.data.vp_slug as string | null,
      name: profileRes.data.name as string | null,
    });
    if (slug) {
      return new Response(JSON.stringify({ slug }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Kein freies Kürzel gefunden" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
