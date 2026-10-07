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

  async function readUntilTag(tag: string): Promise<string> {
    let result = "";
    const buf = new Uint8Array(32768);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      if (result.includes(`${tag} OK`) || result.includes(`${tag} NO`) || result.includes(`${tag} BAD`)) break;
    }
    return result;
  }

  async function sendCommand(cmd: string): Promise<string> {
    const tag = `A${++tagCounter}`;
    await conn.write(encoder.encode(`${tag} ${cmd}\r\n`));
    return readUntilTag(tag);
  }

  const buf = new Uint8Array(4096);
  await conn.read(buf);

  return { sendCommand, close: () => { try { conn.close(); } catch {} } };
}

function decodeMime(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQ])\?([^?]+)\?=/gi, (_, _charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === "B") return atob(text);
      return text.replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16))).replace(/_/g, " ");
    } catch { return text; }
  });
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

    // Parse optional folder from request body
    let targetFolder = "INBOX";
    let targetOrdner = "posteingang";
    try {
      const body = await req.json();
      if (body?.folder) {
        targetFolder = body.folder;
        // Map known IMAP folder names to local ordner values
        const folderLower = targetFolder.toLowerCase();
        if (folderLower.includes("sent") || folderLower.includes("gesendet")) targetOrdner = "gesendet";
        else if (folderLower.includes("draft") || folderLower.includes("entwu")) targetOrdner = "entwuerfe";
        else if (folderLower.includes("trash") || folderLower.includes("papier") || folderLower.includes("deleted")) targetOrdner = "papierkorb";
        else if (folderLower.includes("archive") || folderLower.includes("archiv")) targetOrdner = "archiviert";
        else if (folderLower === "inbox") targetOrdner = "posteingang";
        else targetOrdner = "posteingang"; // custom folders go to posteingang
      }
    } catch { /* no body */ }

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
      return new Response(JSON.stringify({ error: "Kein E-Mail-Konto konfiguriert", synced: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalSynced = 0;

    for (const konto of emailKonten) {
      if (!konto.imapServer || !konto.benutzername || !konto.passwort) continue;

      let imap: { sendCommand: (cmd: string) => Promise<string>; close: () => void } | null = null;
      try {
        imap = await imapConnect(konto.imapServer, konto.imapPort || 993);

        const loginResp = await imap.sendCommand(`LOGIN "${konto.benutzername}" "${konto.passwort}"`);
        if (loginResp.includes("NO") || loginResp.includes("BAD")) {
          console.error(`Login failed for ${konto.email}`);
          continue;
        }

        // Select the target folder
        const selectResp = await imap.sendCommand(`SELECT "${targetFolder}"`);
        const existsMatch = selectResp.match(/\*\s+(\d+)\s+EXISTS/);
        const totalMessages = existsMatch ? parseInt(existsMatch[1]) : 0;

        if (totalMessages === 0) {
          await imap.sendCommand("LOGOUT");
          imap.close();
          continue;
        }

        const count = 10;
        const start = Math.max(1, totalMessages - count + 1);
        const fetchResp = await imap.sendCommand(
          `FETCH ${start}:${totalMessages} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])`
        );

        const messages: Array<{ from: string; fromEmail: string; subject: string; date: string }> = [];
        const blocks = fetchResp.split(/\*\s+\d+\s+FETCH/);
        for (const block of blocks) {
          if (!block.includes("HEADER.FIELDS")) continue;
          const headerMatch = block.match(/\{(\d+)\}\r?\n([\s\S]*?)(?:\)\r?\n|$)/);
          if (!headerMatch) continue;
          const raw = headerMatch[2];

          const getH = (name: string) => {
            const m = raw.match(new RegExp(`^${name}:\\s*(.+?)(?:\\r?\\n(?=[^\\s])|\\r?\\n\\r?\\n|$)`, "ims"));
            return m ? m[1].replace(/\r?\n\s+/g, " ").trim() : "";
          };

          const fromRaw = getH("From");
          let fromName = fromRaw;
          let fromEmail = fromRaw;
          const emailMatch = fromRaw.match(/<(.+?)>/);
          if (emailMatch) {
            fromEmail = emailMatch[1];
            fromName = fromRaw.replace(/<.+?>/, "").replace(/"/g, "").trim() || fromEmail;
          }

          const subject = decodeMime(getH("Subject"));
          const date = getH("Date");
          if (!fromEmail && !subject) continue;
          messages.push({ from: decodeMime(fromName), fromEmail, subject, date });
        }

        const { data: existing } = await supabase
          .from("emails")
          .select("absender_email, betreff, empfangen_am")
          .eq("benutzer_id", user.id)
          .order("empfangen_am", { ascending: false })
          .limit(100);

        const existingKeys = new Set(
          (existing || []).map((e: any) => `${e.absender_email}|${e.betreff}|${e.empfangen_am?.slice(0, 16)}`)
        );

        const toInsert = [];
        for (const msg of messages) {
          const dateStr = msg.date ? new Date(msg.date).toISOString() : new Date().toISOString();
          const key = `${msg.fromEmail}|${msg.subject}|${dateStr.slice(0, 16)}`;
          if (existingKeys.has(key)) continue;

          toInsert.push({
            benutzer_id: user.id,
            betreff: msg.subject || "(Kein Betreff)",
            inhalt: null,
            absender_name: msg.from,
            absender_email: msg.fromEmail,
            vorschau: msg.subject?.slice(0, 100) || "",
            gelesen: false,
            markiert: false,
            ordner: targetOrdner,
            empfangen_am: dateStr,
          });
        }

        if (toInsert.length > 0) {
          const { error: insertErr } = await supabase.from("emails").insert(toInsert);
          if (insertErr) console.error("Insert error:", insertErr);
          else totalSynced += toInsert.length;
        }

        await imap.sendCommand("LOGOUT");
        imap.close();
      } catch (e) {
        console.error(`IMAP sync error for ${konto.email}:`, e);
        if (imap) imap.close();
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced: totalSynced, message: `${totalSynced} neue E-Mails synchronisiert` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Sync error:", err);
    return new Response(
      JSON.stringify({ error: "Synchronisierung fehlgeschlagen" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
