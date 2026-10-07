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
    const buf = new Uint8Array(65536);
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const n = await conn.read(buf);
      if (n === null) break;
      result += decoder.decode(buf.subarray(0, n));
      if (result.includes(`${tag} OK`) || result.includes(`${tag} NO`) || result.includes(`${tag} BAD`)) break;
    }
    return result;
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

function extractTextBody(raw: string): string {
  // Recursively find text content in multipart messages
  const boundaryMatch = raw.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = raw.split("--" + boundary);

    let plainText = "";
    let htmlText = "";

    for (const part of parts) {
      if (part.startsWith("--") || !part.trim()) continue;

      // Check for nested multipart
      const nestedBoundary = part.match(/boundary="?([^"\r\n;]+)"?/i);
      if (nestedBoundary) {
        const nested = extractTextBody(part);
        if (nested) return nested;
        continue;
      }

      const isPlain = /Content-Type:\s*text\/plain/i.test(part);
      const isHtml = /Content-Type:\s*text\/html/i.test(part);

      if (isPlain && !plainText) {
        plainText = extractPartContent(part);
      } else if (isHtml && !htmlText) {
        htmlText = extractPartContent(part);
      }
    }

    if (plainText) return plainText;
    if (htmlText) return htmlText;
  }

  // Single part
  const headerEnd = raw.indexOf("\r\n\r\n");
  if (headerEnd > -1) {
    const headers = raw.substring(0, headerEnd);
    let body = raw.substring(headerEnd + 4);

    if (headers.match(/Content-Transfer-Encoding:\s*quoted-printable/i)) {
      body = decodeQuotedPrintable(body);
    }
    if (headers.match(/Content-Transfer-Encoding:\s*base64/i)) {
      body = decodeBase64Body(body);
    }
    if (headers.match(/Content-Type:\s*text\/html/i)) {
      return body;
    }
    return body;
  }

  return raw;
}

function extractPartContent(part: string): string {
  let headerEnd = part.indexOf("\r\n\r\n");
  if (headerEnd === -1) {
    headerEnd = part.indexOf("\n\n");
    if (headerEnd === -1) return part;
    const headers = part.substring(0, headerEnd);
    let body = part.substring(headerEnd + 2).replace(/--[^\r\n]*--\s*$/, "").trim();
    if (headers.match(/Content-Transfer-Encoding:\s*base64/i)) body = decodeBase64Body(body);
    if (headers.match(/Content-Transfer-Encoding:\s*quoted-printable/i)) body = decodeQuotedPrintable(body);
    return body;
  }
  const headers = part.substring(0, headerEnd);
  let body = part.substring(headerEnd + 4);
  body = body.replace(/--[^\r\n]*--\s*$/, "").trim();

  if (headers.match(/Content-Transfer-Encoding:\s*quoted-printable/i)) {
    body = decodeQuotedPrintable(body);
  }
  if (headers.match(/Content-Transfer-Encoding:\s*base64/i)) {
    body = decodeBase64Body(body);
  }
  return body;
}

function decodeBase64Body(b64: string): string {
  try {
    const cleaned = b64.replace(/\s/g, "").replace(/--[A-Za-z0-9_=.]+(--)?\s*$/, "");
    const binaryStr = atob(cleaned);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    try { return atob(b64.replace(/\s/g, "")); } catch { return b64; }
  }
}

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
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

    const { emailId, betreff, absender_email, empfangen_am, folder } = await req.json();
    if (!emailId) {
      return new Response(JSON.stringify({ error: "emailId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get IMAP settings
    const { data: settingsRow } = await supabase
      .from("user_settings")
      .select("einstellungen")
      .eq("user_id", user.id)
      .single();

    const settings = (settingsRow as any)?.einstellungen;
    const emailKonten = settings?.email?.zusatzKonten || [];

    if (emailKonten.length === 0) {
      return new Response(JSON.stringify({ error: "Kein E-Mail-Konto konfiguriert" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const konto = emailKonten[0];
    let imap: any = null;

    try {
      imap = await imapConnect(konto.imapServer, konto.imapPort || 993);

      const loginResp = await imap.sendCommand(`LOGIN "${konto.benutzername}" "${konto.passwort}"`);
      if (loginResp.includes("NO") || loginResp.includes("BAD")) {
        throw new Error("IMAP Login fehlgeschlagen");
      }

      // Select the folder
      const imapFolder = folder || "INBOX";
      await imap.sendCommand(`SELECT "${imapFolder}"`);

      // Search for the email by date and from
      let searchCmd = "SEARCH";
      if (absender_email) {
        searchCmd += ` FROM "${absender_email}"`;
      }
      if (empfangen_am) {
        const d = new Date(empfangen_am);
        const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const dateStr = `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`;
        searchCmd += ` ON ${dateStr}`;
      }

      const searchResp = await imap.sendCommand(searchCmd);
      const searchLine = searchResp.split("\r\n").find((l: string) => l.startsWith("* SEARCH"));
      const uids = searchLine ? searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean) : [];

      if (uids.length === 0) {
        // Try broader search without date
        const broadSearch = absender_email ? `SEARCH FROM "${absender_email}"` : "SEARCH ALL";
        const broadResp = await imap.sendCommand(broadSearch);
        const broadLine = broadResp.split("\r\n").find((l: string) => l.startsWith("* SEARCH"));
        const broadUids = broadLine ? broadLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean) : [];
        
        if (broadUids.length === 0) {
          await imap.sendCommand("LOGOUT");
          imap.close();
          return new Response(JSON.stringify({ inhalt: "E-Mail konnte nicht auf dem Server gefunden werden." }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        uids.push(...broadUids);
      }

      // Fetch the most recent matching message body
      const targetUid = uids[uids.length - 1];
      const fetchResp = await imap.sendCommand(`FETCH ${targetUid} (BODY.PEEK[TEXT] BODY.PEEK[HEADER.FIELDS (Content-Type Content-Transfer-Encoding)])`);

      // Also try full body for multipart parsing
      let body = "";
      const fullResp = await imap.sendCommand(`FETCH ${targetUid} (BODY.PEEK[])`);
      
      // Extract the raw message from FETCH response
      const rawStart = fullResp.indexOf("\r\n");
      if (rawStart > -1) {
        let rawMsg = fullResp.substring(rawStart + 2);
        // Remove trailing IMAP response
        const lastParen = rawMsg.lastIndexOf(")");
        if (lastParen > -1) {
          rawMsg = rawMsg.substring(0, lastParen);
        }
        // Remove trailing tag line
        const tagLine = rawMsg.match(/\r\nA\d+ OK/);
        if (tagLine && tagLine.index) {
          rawMsg = rawMsg.substring(0, tagLine.index);
        }
        body = extractTextBody(rawMsg);
      }

      await imap.sendCommand("LOGOUT");
      imap.close();

      // Clean up the body
      body = decodeMime(body).trim();

      // Save to DB
      if (body) {
        await supabase
          .from("emails")
          .update({ inhalt: body })
          .eq("id", emailId)
          .eq("benutzer_id", user.id);
      }

      return new Response(JSON.stringify({ inhalt: body || "Kein Inhalt verfügbar." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (e) {
      console.error("IMAP fetch body error:", e);
      if (imap) imap.close();
      return new Response(JSON.stringify({ inhalt: "Fehler beim Laden des E-Mail-Inhalts." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err) {
    console.error("Fetch email body error:", err);
    return new Response(
      JSON.stringify({ error: "E-Mail-Inhalt konnte nicht geladen werden" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
