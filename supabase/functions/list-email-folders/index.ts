import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function imapConnect(host: string, port: number) {
  const conn = await Deno.connectTls({ hostname: host, port });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let tagCounter = 0;

  async function sendCommand(cmd: string): Promise<string> {
    const tag = `A${++tagCounter}`;
    await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
    let result = "";
    const buf = new Uint8Array(16384);
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      if (result.includes(`${tag} OK`) || result.includes(`${tag} NO`) || result.includes(`${tag} BAD`)) break;
    }
    return result;
  }

  // Read greeting
  const buf = new Uint8Array(4096);
  await conn.read(buf);

  return { sendCommand, close: () => { try { conn.close(); } catch {} } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("einstellungen")
      .eq("user_id", user.id)
      .single();

    const settings = (settingsRow as any)?.einstellungen;
    const emailKonten = settings?.email?.zusatzKonten || [];

    if (emailKonten.length === 0) {
      return new Response(JSON.stringify({ folders: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allFolders: Array<{ name: string; displayName: string; konto: string }> = [];

    for (const konto of emailKonten) {
      if (!konto.imapServer || !konto.benutzername || !konto.passwort) continue;

      let imap: any = null;
      try {
        imap = await imapConnect(konto.imapServer, konto.imapPort || 993);

        const loginResp = await imap.sendCommand(`LOGIN "${konto.benutzername}" "${konto.passwort}"`);
        if (loginResp.includes("NO") || loginResp.includes("BAD")) continue;

        // LIST all folders
        const listResp = await imap.sendCommand('LIST "" "*"');
        
        // Parse LIST responses: * LIST (\flags) "delimiter" "name"
        const lines = listResp.split("\r\n");
        for (const line of lines) {
          const match = line.match(/\*\s+LIST\s+\(([^)]*)\)\s+"?([^"]*)"?\s+"?([^"]*)"?/i);
          if (!match) continue;
          
          const flags = match[1] || "";
          const name = match[3].replace(/"/g, "").trim();
          
          // Skip \Noselect folders
          if (flags.includes("\\Noselect")) continue;
          if (!name) continue;

          // Create display name (last part of hierarchy)
          const delimiter = match[2].replace(/"/g, "");
          const parts = name.split(delimiter);
          const displayName = parts[parts.length - 1];

          allFolders.push({
            name,
            displayName,
            konto: konto.email,
          });
        }

        await imap.sendCommand("LOGOUT");
        imap.close();
      } catch (e) {
        console.error(`IMAP list error for ${konto.email}:`, e);
        if (imap) imap.close();
      }
    }

    return new Response(
      JSON.stringify({ folders: allFolders }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("List folders error:", err);
    return new Response(
      JSON.stringify({ error: "Ordner konnten nicht geladen werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
