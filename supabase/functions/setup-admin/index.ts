import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { startrollenSetzen } from "../_shared/startrolle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { email, password, name, role } = await req.json();

    // Security: Only allow if no admin exists yet
    const { data: existingAdmins } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1);

    const { data: existingInhabers } = await adminClient
      .from("user_roles")
      .select("id")
      .eq("role", "inhaber")
      .limit(1);

    if ((existingAdmins && existingAdmins.length > 0) || (existingInhabers && existingInhabers.length > 0)) {
      return new Response(JSON.stringify({ error: "Admin-Account existiert bereits" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create admin user
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: role || "admin" },
      // Die Rolle gehoert in app_metadata, das nur der Server setzt (20261004120000).
      app_metadata: { role: role || "admin" },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Der Trigger sieht app_metadata beim Anlegen noch nicht, siehe _shared/startrolle.ts.
    await startrollenSetzen(adminClient, newUser.user.id, [role || "admin"]);

    return new Response(
      JSON.stringify({ success: true, userId: newUser.user?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
