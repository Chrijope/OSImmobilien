import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { startrollenSetzen } from "../_shared/startrolle.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TEST_ACCOUNTS = [
  { email: "test.inhaber@os-immobilien.com", name: "Test Inhaber", role: "inhaber" },
  { email: "test.admin@os-immobilien.com", name: "Test Admin", role: "admin" },
  { email: "test.vertriebspartner@os-immobilien.com", name: "Test Vertriebspartner", role: "vertriebspartner" },
  { email: "test.objektpartner@os-immobilien.com", name: "Test Objektpartner", role: "objektpartner" },
  { email: "test.finanzierungspartner@os-immobilien.com", name: "Test Finanzierungspartner", role: "finanzierungspartner" },
  { email: "test.hausverwaltung@os-immobilien.com", name: "Test Hausverwaltung", role: "hausverwaltung" },
  { email: "test.buchhaltung@os-immobilien.com", name: "Test Buchhaltung", role: "buchhaltung" },
  { email: "test.setterin@os-immobilien.com", name: "Test Setterin", role: "setterin" },
  { email: "test.kunde@os-immobilien.com", name: "Test Kunde", role: "kunde" },
  { email: "test.testaccount@os-immobilien.com", name: "Test Testaccount", role: "testaccount" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller is admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoles } = await adminClient
      .from("user_roles").select("role").eq("user_id", caller.id);
    const isAdmin = (callerRoles || []).some((r: any) => ["admin", "inhaber"].includes(r.role));
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Nur Admins" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { password } = await req.json();
    const results: Array<{ email: string; status: string; error?: string }> = [];

    for (const account of TEST_ACCOUNTS) {
      try {
        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
          email: account.email,
          password: password || "test2026",
          email_confirm: true,
          user_metadata: { name: account.name, role: account.role },
          // Die Rolle gehoert in app_metadata, das nur der Server setzt (20261004120000).
          app_metadata: { role: account.role },
        });

        if (createError) {
          results.push({ email: account.email, status: "error", error: createError.message });
        } else {
          // Der Trigger sieht app_metadata beim Anlegen noch nicht, siehe _shared/startrolle.ts.
          await startrollenSetzen(adminClient, newUser.user.id, [account.role]);
          results.push({ email: account.email, status: "created" });
        }
      } catch (e) {
        results.push({ email: account.email, status: "error", error: String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
