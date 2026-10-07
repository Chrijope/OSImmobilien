import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events";

/**
 * Gueltiger Zugangstoken fuer den angemeldeten Nutzer.
 *
 * Google-Token laufen nach einer Stunde ab. Frueher stand diese Erneuerung
 * nur im Leseteil. Da jetzt auch geschrieben wird, liegt sie an einer Stelle,
 * sonst laufen beide Wege auseinander.
 */
async function holeZugangsToken(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ token?: string; fehler?: string; gcData?: any }> {
  const { data: settingsRow } = await adminClient
    .from("user_settings")
    .select("einstellungen")
    .eq("user_id", userId)
    .single();

  const gcData = (settingsRow as any)?.einstellungen?.google_calendar;
  if (!gcData?.connected || !gcData?.access_token) {
    return { fehler: "Google Calendar nicht verbunden" };
  }

  if (!gcData.expires_at || Date.now() <= gcData.expires_at - 60_000) {
    return { token: gcData.access_token, gcData };
  }

  if (!gcData.refresh_token) {
    return { fehler: "Kein Refresh Token – bitte erneut verbinden", gcData };
  }

  const refreshRes = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: gcData.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshData = await refreshRes.json();
  if (!refreshRes.ok) {
    return { fehler: "Token-Refresh fehlgeschlagen – bitte erneut verbinden", gcData };
  }

  await adminClient.rpc("merge_user_settings", {
    _user_id: userId,
    _patch: {
      google_calendar: {
        ...gcData,
        access_token: refreshData.access_token,
        expires_at: Date.now() + (refreshData.expires_in || 3600) * 1000,
      },
    },
  });
  return { token: refreshData.access_token, gcData };
}

/** Startzeit plus Dauer in das Format, das Google erwartet. */
function zeitraum(start: string, dauerMinuten: number) {
  const von = new Date(start);
  const bis = new Date(von.getTime() + Math.max(5, dauerMinuten) * 60_000);
  return {
    start: { dateTime: von.toISOString(), timeZone: "Europe/Berlin" },
    end: { dateTime: bis.toISOString(), timeZone: "Europe/Berlin" },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET");
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar`;

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "Google Calendar Credentials nicht konfiguriert" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── OAuth Callback (GET from Google redirect) ──
    if (req.method === "GET") {
      const url = new URL(req.url);
      const code = url.searchParams.get("code");
      const stateB64 = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(
          `<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'${error}'},'*');window.close();</script><p>Fehler: ${error}. Fenster schließen.</p></body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      }

      if (!code || !stateB64) {
        return new Response("Fehlende Parameter", { status: 400 });
      }

      let userId: string;
      try {
        const state = JSON.parse(atob(stateB64));
        userId = state.userId;
      } catch {
        return new Response("Ungültiger State-Parameter", { status: 400 });
      }

      const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return new Response(
          `<html><body><script>window.opener?.postMessage({type:'google-calendar-error',error:'Token-Austausch fehlgeschlagen'},'*');window.close();</script><p>Token-Fehler. Fenster schließen.</p></body></html>`,
          { headers: { "Content-Type": "text/html" } },
        );
      }

      const [calListRes, userInfoRes] = await Promise.all([
        fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }),
        fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }),
      ]);
      const calListData = await calListRes.json();
      const userInfo = await userInfoRes.json();
      const calendars = (calListData.items || []).map((c: any) => ({
        id: c.id,
        name: c.summary || c.id,
        primary: c.primary || false,
      }));

      const googleCalData = {
        connected: true,
        email: userInfo.email || "",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + (tokenData.expires_in || 3600) * 1000,
        calendars,
        connected_at: new Date().toISOString(),
      };

      const adminClient = createClient(supabaseUrl, serviceRoleKey);
      await adminClient.rpc("merge_user_settings", {
        _user_id: userId,
        _patch: { google_calendar: googleCalData },
      });

      const successPayload = JSON.stringify({
        type: "google-calendar-success",
        email: userInfo.email,
        calendars,
      });
      return new Response(
        `<html><body><script>window.opener?.postMessage(${successPayload},'*');window.close();</script><p>Google Calendar verbunden! Du kannst dieses Fenster schließen.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } },
      );
    }

    // ── POST actions require auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const { action } = body;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (action === "get-auth-url") {
      const state = JSON.stringify({ userId: user.id });
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES,
        access_type: "offline",
        prompt: "consent",
        state: btoa(state),
      });
      return new Response(JSON.stringify({ url: `${GOOGLE_AUTH_URL}?${params.toString()}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      await adminClient.rpc("merge_user_settings", {
        _user_id: user.id,
        _patch: { google_calendar: null },
      });
      return new Response(JSON.stringify({ connected: false, message: "Google Calendar getrennt." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "fetch-events") {
      const zugang = await holeZugangsToken(adminClient, user.id, clientId, clientSecret);
      if (!zugang.token) {
        return new Response(JSON.stringify({ error: zugang.fehler }), {
          status: zugang.fehler === "Token-Refresh fehlgeschlagen – bitte erneut verbinden" ? 200 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const accessToken = zugang.token;

      const { calendarId, timeMin, timeMax } = body;
      const calId = calendarId || "primary";
      const min = timeMin || new Date(Date.now() - 30 * 86400000).toISOString();
      const max = timeMax || new Date(Date.now() + 90 * 86400000).toISOString();

      const eventsRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?timeMin=${encodeURIComponent(min)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=250`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!eventsRes.ok) {
        const errText = await eventsRes.text();
        return new Response(JSON.stringify({ error: `Google API Fehler (${eventsRes.status})`, details: errText }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const eventsData = await eventsRes.json();
      const events = (eventsData.items || []).map((e: any) => ({
        id: e.id,
        summary: e.summary || "Ohne Titel",
        start: e.start?.dateTime || e.start?.date || "",
        end: e.end?.dateTime || e.end?.date || "",
        location: e.location || "",
        status: e.status,
      }));

      return new Response(JSON.stringify({ events }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Termine aus dem CRM in den Google-Kalender schreiben ──
    if (action === "create-event" || action === "update-event" || action === "delete-event") {
      const zugang = await holeZugangsToken(adminClient, user.id, clientId, clientSecret);
      if (!zugang.token) {
        return new Response(JSON.stringify({ error: zugang.fehler }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { calendarId, eventId, titel, beschreibung, ort, start, dauerMinuten } = body;
      const calId = calendarId
        || (zugang.gcData?.calendars || []).find((c: any) => c.primary)?.id
        || "primary";
      const basis = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;

      if (action === "delete-event") {
        if (!eventId) {
          return new Response(JSON.stringify({ error: "eventId fehlt" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const res = await fetch(`${basis}/${encodeURIComponent(eventId)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${zugang.token}` },
        });
        // 410 heisst: war schon weg. Fuer uns dasselbe Ergebnis.
        const ok = res.ok || res.status === 410 || res.status === 404;
        return new Response(JSON.stringify({ ok }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!start) {
        return new Response(JSON.stringify({ error: "Startzeit fehlt" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const inhalt = {
        summary: titel || "Termin",
        description: beschreibung || undefined,
        location: ort || undefined,
        ...zeitraum(start, Number(dauerMinuten) || 60),
      };

      const res = await fetch(
        action === "create-event" ? basis : `${basis}/${encodeURIComponent(eventId)}`,
        {
          method: action === "create-event" ? "POST" : "PATCH",
          headers: { Authorization: `Bearer ${zugang.token}`, "Content-Type": "application/json" },
          body: JSON.stringify(inhalt),
        },
      );

      if (!res.ok) {
        const details = await res.text();
        console.error("google-calendar schreiben fehlgeschlagen:", res.status, details);
        return new Response(JSON.stringify({ error: `Google API Fehler (${res.status})` }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const angelegt = await res.json();
      return new Response(JSON.stringify({ ok: true, eventId: angelegt.id, htmlLink: angelegt.htmlLink }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unbekannte Aktion" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("google-calendar error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
