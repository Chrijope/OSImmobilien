import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseUserAgent(ua: string): { browser: string; os: string } {
  let browser = "Unbekannt";
  let os = "Unbekannt";

  // Browser detection
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("OPR/") || ua.includes("Opera")) browser = "Opera";
  else if (ua.includes("Chrome/") && !ua.includes("Edg/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome/")) browser = "Safari";
  else if (ua.includes("Firefox/")) browser = "Firefox";

  // OS detection
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X") || ua.includes("Macintosh")) os = "macOS";
  else if (ua.includes("Linux") && !ua.includes("Android")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return { browser, os };
}

// IP-Geolocation via ip-api.com (kostenlos, kein Key, 45 req/min)
async function geolocateIp(ip: string): Promise<{ country: string | null; city: string | null }> {
  if (!ip || ip === "Unbekannt" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { country: null, city: null };
  }
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`, {
      signal: ctrl.signal,
    });
    clearTimeout(to);
    if (!res.ok) return { country: null, city: null };
    const data = await res.json();
    if (data?.status !== "success") return { country: null, city: null };
    return { country: data.country || null, city: data.city || null };
  } catch {
    return { country: null, city: null };
  }
}

type AnomalyResult = { level: "low" | "medium" | "critical" | null; reason: string | null };

function detectAnomaly(args: {
  current: { ip: string; country: string | null; browser: string; os: string };
  previous: { ip_address: string | null; country: string | null; browser: string | null; os: string | null; logged_in_at: string } | null;
  knownUaCombos: Set<string>;
}): AnomalyResult {
  const { current, previous, knownUaCombos } = args;

  // Erste Session überhaupt -> kein Anomaly
  if (!previous) return { level: null, reason: null };

  // Kritisch: Country-Wechsel + < 1h Zeitdifferenz (physisch unmöglich)
  if (
    current.country && previous.country &&
    current.country !== previous.country
  ) {
    const deltaMs = Date.now() - new Date(previous.logged_in_at).getTime();
    if (deltaMs < 60 * 60 * 1000) {
      return {
        level: "critical",
        reason: `Länderwechsel ${previous.country} → ${current.country} innerhalb ${Math.round(deltaMs / 60000)} Min`,
      };
    }
    return {
      level: "medium",
      reason: `Neuer Login aus ${current.country} (vorher ${previous.country})`,
    };
  }

  // Mittel: neuer User-Agent (Browser+OS-Kombi unbekannt)
  const uaKey = `${current.browser}|${current.os}`;
  if (!knownUaCombos.has(uaKey) && knownUaCombos.size > 0) {
    return {
      level: "medium",
      reason: `Neues Gerät: ${current.browser} / ${current.os}`,
    };
  }

  // Niedrig: neue IP gleiches Land
  if (previous.ip_address && current.ip && previous.ip_address !== current.ip) {
    return {
      level: "low",
      reason: `Neue IP-Adresse (${current.country || "?"})`,
    };
  }

  return { level: null, reason: null };
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action } = body;

    // ── RECORD LOGIN ──
    if (action === "record") {
      const ua = body.userAgent || req.headers.get("User-Agent") || "";
      const { browser, os } = parseUserAgent(ua);
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("cf-connecting-ip")
        || "Unbekannt";

      // 1) Geolocation
      const { country, city } = await geolocateIp(ip);

      // 2) Letzte aktive Session + bekannte UA-Kombis (letzte 30 Tage) laden
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: history } = await adminClient
        .from("login_sessions")
        .select("ip_address, country, browser, os, logged_in_at")
        .eq("user_id", user.id)
        .gte("logged_in_at", since)
        .order("logged_in_at", { ascending: false })
        .limit(50);

      const previous = (history && history.length > 0) ? history[0] : null;
      const knownUaCombos = new Set<string>(
        (history || []).map((h: any) => `${h.browser || ""}|${h.os || ""}`)
      );

      const anomaly = detectAnomaly({
        current: { ip, country, browser, os },
        previous,
        knownUaCombos,
      });

      // 3) Session einfügen
      const { data: newSession, error } = await adminClient.from("login_sessions").insert({
        user_id: user.id,
        browser,
        os,
        ip_address: ip,
        user_agent: ua,
        country,
        city,
        anomaly_level: anomaly.level,
        anomaly_reason: anomaly.reason,
      }).select("id").maybeSingle();

      if (error) {
        console.error("Record session error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 3b) Bei JEDER Anomalie (low/medium/critical) → In-App-Benachrichtigung an alle Admins/Inhaber
      if (anomaly.level) {
        try {
          const { data: userProfile } = await adminClient
            .from("profiles")
            .select("vorname, nachname, email")
            .eq("id", user.id)
            .maybeSingle();
          const userLabel = [userProfile?.vorname, userProfile?.nachname].filter(Boolean).join(" ")
            || userProfile?.email || user.id.slice(0, 8);

          const { data: adminRoles } = await adminClient
            .from("user_roles")
            .select("user_id")
            .in("role", ["admin", "inhaber"]);
          const adminIds = Array.from(new Set((adminRoles || []).map((r: any) => r.user_id)));

          if (adminIds.length > 0) {
            const levelLabel = anomaly.level === "critical" ? "Kritisch"
              : anomaly.level === "medium" ? "Mittel" : "Niedrig";
            const levelEmoji = anomaly.level === "critical" ? "🚨"
              : anomaly.level === "medium" ? "⚠️" : "ℹ️";
            const ortLabel = [city, country].filter(Boolean).join(", ") || "Unbekannt";

            const rows = adminIds.map((aid: string) => ({
              benutzer_id: aid,
              titel: `${levelEmoji} Session-Anomalie (${levelLabel})`,
              nachricht: `${userLabel}: ${anomaly.reason || "Auffälliger Login"} — ${ortLabel}`,
              link: "/session-anomalien",
              ziel_rolle: "admin",
            }));
            await adminClient.from("benachrichtigungen").insert(rows);
          }
        } catch (e) {
          console.warn("session-anomaly benachrichtigung failed:", e);
        }
      }

      // 4) Bei kritisch oder mittel → User benachrichtigen + Audit-Log
      if (anomaly.level === "critical" || anomaly.level === "medium") {
        try {
          // Rollen + E-Mail laden
          const { data: profile } = await adminClient
            .from("profiles")
            .select("email, vorname, nachname")
            .eq("id", user.id)
            .maybeSingle();
          const { data: roles } = await adminClient
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);
          const roleList = (roles || []).map((r: any) => r.role);
          const isPrivileged = roleList.some((r: string) => ["admin", "inhaber"].includes(r));

          const templateData = {
            name: profile?.vorname || "",
            level: anomaly.level,
            reason: anomaly.reason || "",
            country: country || "Unbekannt",
            city: city || "",
            ip,
            browser,
            os,
            zeitpunkt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
          };

          if (profile?.email) {
            await adminClient.functions.invoke("send-transactional-email", {
              body: {
                templateName: "session-anomalie",
                recipientEmail: profile.email,
                idempotencyKey: `session-anomalie-${newSession?.id}`,
                templateData,
              },
            });
          }

          // Bei Admin/Inhaber zusätzlich an alle Inhaber
          if (isPrivileged) {
            const { data: inhaber } = await adminClient
              .from("user_roles")
              .select("user_id")
              .eq("role", "inhaber");
            const ids = (inhaber || []).map((r: any) => r.user_id).filter((i: string) => i !== user.id);
            if (ids.length > 0) {
              const { data: inhaberProfiles } = await adminClient
                .from("profiles")
                .select("email")
                .in("id", ids);
              for (const p of inhaberProfiles || []) {
                if (p.email) {
                  await adminClient.functions.invoke("send-transactional-email", {
                    body: {
                      templateName: "session-anomalie",
                      recipientEmail: p.email,
                      idempotencyKey: `session-anomalie-inhaber-${newSession?.id}-${p.email}`,
                      templateData: {
                        ...templateData,
                        name: "Team",
                        adminAlert: `Admin/Inhaber-Login: ${profile?.vorname || ""} ${profile?.nachname || ""}`.trim(),
                      },
                    },
                  });
                }
              }
            }
          }

          await adminClient.from("login_sessions").update({ alert_sent_at: new Date().toISOString() }).eq("id", newSession?.id);
        } catch (e) {
          console.warn("session-anomaly alert failed:", e);
        }

        try {
          await adminClient.from("audit_log").insert({
            actor: user.id,
            action: "session_anomaly_detected",
            entity: "login_sessions",
            entity_id: newSession?.id ?? null,
            meta: {
              level: anomaly.level,
              reason: anomaly.reason,
              country,
              city,
              ip,
              browser,
              os,
            },
          });
        } catch (e) {
          console.warn("audit_log insert failed:", e);
        }
      }

      return new Response(JSON.stringify({ success: true, anomaly_level: anomaly.level, anomaly_reason: anomaly.reason }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST SESSIONS ──
    if (action === "list") {
      const { data, error } = await adminClient
        .from("login_sessions")
        .select("*")
        .eq("user_id", user.id)
        .eq("aktiv", true)
        .order("logged_in_at", { ascending: false })
        .limit(200);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Dedupe: pro Gerät (Browser + OS + IP) nur die neueste Session behalten,
      // damit wiederholte Logins vom gleichen Rechner nicht als 20 „aktive
      // Sitzungen" erscheinen.
      const seen = new Set<string>();
      const deduped = (data || []).filter((s: any) => {
        const key = `${s.browser || ""}|${s.os || ""}|${s.ip_address || ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      return new Response(JSON.stringify({ sessions: deduped }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LOGOUT ALL (invalidate all sessions) ──
    if (action === "logout-all") {
      await adminClient
        .from("login_sessions")
        .update({ aktiv: false })
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ADMIN: FORCE LOGOUT a target user (signs out ALL sessions globally) ──
    if (action === "admin-force-logout") {
      const targetUserId: string | undefined = body.targetUserId;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "targetUserId fehlt" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Caller-Rolle prüfen: nur admin/inhaber
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isAdmin = (roles || []).some((r: any) => r.role === "admin" || r.role === "inhaber");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Schutz: Inhaber dürfen nicht von Nicht-Inhabern force-logged-out werden
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUserId);
      const targetIsInhaber = (targetRoles || []).some((r: any) => r.role === "inhaber");
      const callerIsInhaber = (roles || []).some((r: any) => r.role === "inhaber");
      if (targetIsInhaber && !callerIsInhaber) {
        return new Response(JSON.stringify({ error: "Inhaber dürfen nur von Inhabern abgemeldet werden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Alle Auth-Sessions des Ziel-Users löschen. Früher stand hier
      // auth.admin.signOut(targetUserId); die Methode erwartet aber das
      // Zugangstoken einer Sitzung, keine Nutzerkennung, und scheiterte immer.
      // sitzungen_beenden kommt aus 20260926200000_naechtliche_abmeldung.sql.
      const { data: beendet, error: beendenErr } = await adminClient.rpc("sitzungen_beenden", {
        p_user_id: targetUserId,
      });
      if (beendenErr) {
        console.error("sitzungen_beenden error:", beendenErr);
        const meldung = beendenErr.message || "";
        const fehlt = beendenErr.code === "PGRST202" ||
          (/sitzungen_beenden/.test(meldung) && /could not find|does not exist/i.test(meldung));
        const text = fehlt
          ? "Migration ausstehend: 20260926200000_naechtliche_abmeldung.sql ist noch nicht gelaufen. Die Sitzungen wurden nicht beendet."
          : `Die Sitzungen konnten nicht beendet werden: ${meldung}`;
        return new Response(JSON.stringify({ error: text }), {
          status: fehlt ? 503 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2) Eigene login_sessions-Tabelle als inaktiv markieren
      await adminClient
        .from("login_sessions")
        .update({ aktiv: false })
        .eq("user_id", targetUserId);

      // 3) Audit-Log
      try {
        await adminClient.from("audit_log").insert({
          actor: user.id,
          action: "admin_force_logout",
          entity: "auth.users",
          entity_id: targetUserId,
          meta: { reason: body.reason || null, sitzungen: beendet ?? 0 },
        });
      } catch (e) {
        console.warn("audit_log insert failed:", e);
      }

      return new Response(JSON.stringify({ success: true, sitzungen: beendet ?? 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unbekannte Aktion" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("manage-sessions error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
