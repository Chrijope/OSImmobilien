import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** CalDAV-Zeitstempel: 20260803T140000Z */
function caldavZeit(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Zeilen in iCalendar duerfen nicht beliebig lang sein und brauchen Maskierung. */
function icalText(wert: string): string {
  return String(wert || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function baueIcs(params: {
  uid: string;
  titel: string;
  beschreibung?: string;
  ort?: string;
  start: string;
  dauerMinuten: number;
}): string {
  const von = new Date(params.start);
  const bis = new Date(von.getTime() + Math.max(5, params.dauerMinuten) * 60_000);
  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OS Immobilien//CRM//DE",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${caldavZeit(new Date())}`,
    `DTSTART:${caldavZeit(von)}`,
    `DTEND:${caldavZeit(bis)}`,
    `SUMMARY:${icalText(params.titel)}`,
  ];
  if (params.beschreibung) zeilen.push(`DESCRIPTION:${icalText(params.beschreibung)}`);
  if (params.ort) zeilen.push(`LOCATION:${icalText(params.ort)}`);
  zeilen.push("END:VEVENT", "END:VCALENDAR");
  return zeilen.join("\r\n") + "\r\n";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await callerClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, appleId, appPassword } = body;

    if (action === "test-connection") {
      // Test CalDAV connection to iCloud
      if (!appleId || !appPassword) {
        return new Response(JSON.stringify({ error: "Apple-ID und App-spezifisches Passwort erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const credentials = btoa(`${appleId}:${appPassword}`);

      // PROPFIND request to discover CalDAV principal
      const principalRes = await fetch("https://caldav.icloud.com/", {
        method: "PROPFIND",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/xml; charset=utf-8",
          "Depth": "0",
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:current-user-principal/>
    <d:displayname/>
  </d:prop>
</d:propfind>`,
      });

      if (!principalRes.ok) {
        const status = principalRes.status;
        if (status === 401) {
          return new Response(JSON.stringify({ 
            error: "Authentifizierung fehlgeschlagen. Bitte prüfe deine Apple-ID und das app-spezifische Passwort.",
            connected: false 
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ 
          error: `CalDAV-Verbindungsfehler (HTTP ${status})`,
          connected: false 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const principalXml = await principalRes.text();

      // Extract principal URL
      const principalMatch = principalXml.match(/<d:href[^>]*>([^<]+)<\/d:href>/i) ||
                              principalXml.match(/<D:href[^>]*>([^<]+)<\/D:href>/i);
      
      let principalUrl = "";
      // Try to find current-user-principal href
      const cpMatch = principalXml.match(/current-user-principal[\s\S]*?<[dD]:href>([^<]+)<\/[dD]:href>/i);
      if (cpMatch) {
        principalUrl = cpMatch[1];
      }

      // Now discover calendars
      const calendarHomeUrl = principalUrl 
        ? `https://caldav.icloud.com${principalUrl}` 
        : "https://caldav.icloud.com/";

      const calRes = await fetch(calendarHomeUrl, {
        method: "PROPFIND",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/xml; charset=utf-8",
          "Depth": "1",
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`,
      });

      let calendars: { name: string; url: string }[] = [];
      if (calRes.ok) {
        const calXml = await calRes.text();
        // Parse calendar names from multi-status response
        const responses = calXml.split(/<[dD]:response>/gi).slice(1);
        for (const resp of responses) {
          const isCalendar = resp.includes("calendar") && resp.includes("resourcetype");
          const nameMatch = resp.match(/<[dD]:displayname>([^<]*)<\/[dD]:displayname>/i);
          const hrefMatch = resp.match(/<[dD]:href>([^<]+)<\/[dD]:href>/i);
          if (nameMatch && hrefMatch && isCalendar) {
            calendars.push({ name: nameMatch[1], url: hrefMatch[1] });
          }
        }
      }

      // Store credentials in user_settings
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      await adminClient
        .from("user_settings")
        .update({ 
          apple_calendar: {
            connected: true,
            apple_id: appleId,
            app_password: appPassword, // stored server-side only
            principal_url: principalUrl,
            calendars: calendars,
            connected_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ 
        connected: true, 
        calendars,
        message: `Erfolgreich verbunden! ${calendars.length} Kalender gefunden.` 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      await adminClient
        .from("user_settings")
        .update({ 
          apple_calendar: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ connected: false, message: "Apple Kalender getrennt." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch-events") {
      // Fetch events from iCloud CalDAV
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const { data: settingsRow } = await adminClient
        .from("user_settings")
        .select("apple_calendar")
        .eq("user_id", user.id)
        .single();

      const calData = (settingsRow as any)?.apple_calendar;
      if (!calData?.connected || !calData?.apple_id || !calData?.app_password) {
        return new Response(JSON.stringify({ error: "Kein Apple Kalender verbunden" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const credentials = btoa(`${calData.apple_id}:${calData.app_password}`);
      const { calendarUrl, startDate, endDate } = body;

      const targetUrl = calendarUrl 
        ? `https://caldav.icloud.com${calendarUrl}`
        : `https://caldav.icloud.com${calData.principal_url || "/"}`;

      // Build time-range filter
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
      const end = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

      const reportRes = await fetch(targetUrl, {
        method: "REPORT",
        headers: {
          "Authorization": `Basic ${credentials}`,
          "Content-Type": "application/xml; charset=utf-8",
          "Depth": "1",
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${start}" end="${end}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`,
      });

      if (!reportRes.ok) {
        return new Response(JSON.stringify({ error: `Fehler beim Abrufen der Termine (HTTP ${reportRes.status})` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const eventsXml = await reportRes.text();

      // Parse iCal events from response
      const events: { summary: string; start: string; end: string; uid: string }[] = [];
      const calDataBlocks = eventsXml.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/gi) || [];
      
      for (const block of calDataBlocks) {
        const summary = block.match(/SUMMARY:(.+)/i)?.[1]?.trim() || "Ohne Titel";
        const dtstart = block.match(/DTSTART[^:]*:(.+)/i)?.[1]?.trim() || "";
        const dtend = block.match(/DTEND[^:]*:(.+)/i)?.[1]?.trim() || "";
        const uid = block.match(/UID:(.+)/i)?.[1]?.trim() || "";
        events.push({ summary, start: dtstart, end: dtend, uid });
      }

      return new Response(JSON.stringify({ events }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Termine aus dem CRM in den iCloud-Kalender schreiben ──
    if (action === "create-event" || action === "update-event" || action === "delete-event") {
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      const { data: settingsRow } = await adminClient
        .from("user_settings")
        .select("apple_calendar")
        .eq("user_id", user.id)
        .single();

      const calData = (settingsRow as any)?.apple_calendar;
      if (!calData?.connected || !calData?.apple_id || !calData?.app_password) {
        return new Response(JSON.stringify({ error: "Kein Apple Kalender verbunden" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const credentials = btoa(`${calData.apple_id}:${calData.app_password}`);
      const { calendarUrl, eventId, titel, beschreibung, ort, start, dauerMinuten } = body;

      // Ohne ausdrueckliche Wahl der erste gefundene Kalender.
      const zielKalender: string | undefined = calendarUrl || (calData.calendars || [])[0]?.url;
      if (!zielKalender) {
        return new Response(JSON.stringify({ error: "Kein Kalender gefunden, bitte neu verbinden" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Die Kennung ist zugleich der Dateiname. Damit findet ein spaeteres
      // Aendern oder Loeschen denselben Eintrag wieder.
      const uid = eventId || `moreimmo-${crypto.randomUUID()}`;
      const ziel = `https://caldav.icloud.com${zielKalender.replace(/\/$/, "")}/${uid}.ics`;

      if (action === "delete-event") {
        const res = await fetch(ziel, {
          method: "DELETE",
          headers: { Authorization: `Basic ${credentials}` },
        });
        return new Response(JSON.stringify({ ok: res.ok || res.status === 404 }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!start) {
        return new Response(JSON.stringify({ error: "Startzeit fehlt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const res = await fetch(ziel, {
        method: "PUT",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "text/calendar; charset=utf-8",
        },
        body: baueIcs({
          uid,
          titel: titel || "Termin",
          beschreibung,
          ort,
          start,
          dauerMinuten: Number(dauerMinuten) || 60,
        }),
      });

      if (!res.ok) {
        const details = await res.text();
        console.error("apple-calendar schreiben fehlgeschlagen:", res.status, details);
        return new Response(JSON.stringify({ error: `iCloud antwortete mit ${res.status}` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: true, eventId: uid }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unbekannte Aktion" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("apple-calendar error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
