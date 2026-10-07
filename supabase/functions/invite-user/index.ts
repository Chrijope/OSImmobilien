import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { kundenSprache, type Sprache } from "../_shared/kunden-sprache.ts";
import { vorhandenesKontoPruefen } from "../_shared/portal-verknuepfung.ts";
import { einladungOhneFremdeKonditionen, tippgeberKontoAblehnung, tippgeberVerknuepfungAblehnung } from "../_shared/einladung-konditionen.ts";
import { startrollenSetzen } from "../_shared/startrolle.ts";
import { pruefeKundenportalRecht } from "../_shared/kundenportal-recht.ts";

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
    // Verify calling user is admin/inhaber
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("invite-user: No Authorization header");
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller with anon client
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      console.error("invite-user: Caller not authenticated");
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("invite-user: Caller authenticated:", caller.id, caller.email);

    // Rate-Limit: 10/h, 50/Tag pro Nutzer
    const rl = await checkRateLimit(req, caller.id, { scope: "invite-user", perHour: 10, perDay: 50 });
    if (!rl.ok) return rateLimitErrorBody("invite-user", rl, corsHeaders);

    // Check caller role
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: callerRoles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const allowedRoles = ["admin", "inhaber", "vertriebspartner", "vertriebsleiter"];
    const hasPermission = (callerRoles || []).some((r: any) => allowedRoles.includes(r.role));

    if (!hasPermission) {
      console.error("invite-user: No permission. Roles:", callerRoles);
      return new Response(JSON.stringify({ error: "Keine Berechtigung" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ ROLLENMATRIX — wer darf welche Rollen vergeben? ═══
    // - inhaber: jede Rolle (inkl. inhaber)
    // - admin:   jede Rolle AUSSER inhaber
    // - vertriebspartner: ausschließlich 'kunde' und 'tippgeber'
    // Verhindert Privilege-Escalation (z.B. VP lädt sich selbst als admin ein).
    const callerRoleSet = new Set((callerRoles || []).map((r: any) => String(r.role)));
    const callerIsInhaberGlobal = callerRoleSet.has("inhaber");
    const callerIsAdminGlobal = callerRoleSet.has("admin") || callerIsInhaberGlobal;
    const callerIsVpOnly = !callerIsAdminGlobal && callerRoleSet.has("vertriebspartner");
    const callerIsVertriebsleiterOnly =
      !callerIsAdminGlobal && !callerIsVpOnly && callerRoleSet.has("vertriebsleiter");

    const assignableByCaller = (target: string): boolean => {
      if (!target) return false;
      // Das Bewerberportal mit eigenem Konto ist entfernt (28.09.2026).
      // Die Rolle bleibt in der Datenbank, wird aber von niemandem mehr vergeben.
      if (target === "bewerber") return false;
      if (callerIsInhaberGlobal) return true;
      if (callerIsAdminGlobal) return target !== "inhaber";
      if (callerIsVpOnly) return target === "kunde" || target === "tippgeber";
      if (callerIsVertriebsleiterOnly) return target === "kunde" || target === "tippgeber";
      return false;
    };

    const body = await req.json();
    console.log("invite-user: Action:", body.action || "invite", "email:", body.email);

    // ═══ DELETE USER ═══
    if (body.action === "delete") {
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: "userId fehlt" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Only admin/inhaber can delete
      const isAdmin = (callerRoles || []).some((r: any) => ["admin", "inhaber"].includes(r.role));
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Nur Admins können Nutzer löschen" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Super Admins (inhaber) cannot be deleted by regular admins
      const callerIsInhaber = (callerRoles || []).some((r: any) => r.role === "inhaber");
      const { data: targetRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const targetIsInhaber = (targetRoles || []).some((r: any) => r.role === "inhaber");
      if (targetIsInhaber && !callerIsInhaber) {
        return new Response(JSON.stringify({ error: "Super Admins können nicht von Admins gelöscht werden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Die Aktion "send-recovery" ist am 04.10.2026 entfernt. Sie hatte keinen
    // Aufrufer und gab jedem Partner einen fertigen Anmeldelink zu jeder
    // beliebigen Adresse zurueck, also die Uebernahme fremder Konten.
    // Passwort vergessen laeuft ueber die Login-Seite.
    if (body.action === "send-recovery") {
      return new Response(JSON.stringify({ error: "Aktion nicht mehr verfuegbar" }), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ═══ INVITE USER ═══
    // Provisionsbedingungen nur von Admin und Inhaber, siehe einladung-konditionen.ts.
    const { body: einladung, verworfen } = einladungOhneFremdeKonditionen(body, callerIsAdminGlobal);
    if (verworfen.length > 0) {
      console.warn("invite-user: Provisionsbedingungen verworfen (nur Admin und Inhaber):", verworfen.join(", "));
    }
    const { email, name, role, roles, moreId, kontaktId, vorname, nachname, telefon, person2, karriereStufe, teamleaderId, customProvisionRate, customProvisionRateSetter, customProvisionRateEigen, tippgeberId, karriereGatingActive, rollenVariante } = einladung;

    if (!email || !name || !role) {
      return new Response(JSON.stringify({ error: "Fehlende Pflichtfelder" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Einladung zu einem Kontakt (Portal freischalten, Einladung erneut
    // versenden, Person 2): nur Admin, Inhaber und der zustaendige
    // Vertriebspartner dieses Kontakts. Bis zum 23.09.2026 reichte die Rolle,
    // jeder Vertriebspartner konnte fuer jeden Kontakt einladen und dabei die
    // `kontaktId` mit einer Adresse seiner Wahl verknuepfen. Das gilt fuer
    // jede Rolle im Aufruf, denn verknuepft wird unten unabhaengig von ihr.
    // Regel und Begruendung: ../_shared/kundenportal-recht.ts
    if (kontaktId !== undefined && kontaktId !== null && kontaktId !== "") {
      const recht = await pruefeKundenportalRecht(adminClient, caller.id, kontaktId);
      if (!recht.erlaubt) {
        console.warn("invite-user: Kontakt-Einladung abgelehnt fuer", caller.id, "Kontakt", kontaktId);
        return new Response(JSON.stringify({ error: recht.grund }), {
          status: recht.status ?? 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Optionale Anzeige-Variante: keine eigene Rolle, nur der Anzeigename.
    // Erlaubt ist ausschliesslich 'lead_berater' (oder leer). Aufrufe ohne den
    // Parameter verhalten sich exakt wie bisher.
    if (rollenVariante !== undefined && rollenVariante !== null && rollenVariante !== "" && rollenVariante !== "lead_berater") {
      return new Response(JSON.stringify({ error: "Ungueltige rollenVariante, erlaubt ist nur 'lead_berater'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const gewuenschteVariante = rollenVariante === "lead_berater" ? "lead_berater" : null;

    // Rollenmatrix-Prüfung für primäre Rolle + Zusatzrollen
    const requestedRoles: string[] = Array.isArray(roles) && roles.length > 0
      ? Array.from(new Set([role, ...roles].filter((r) => typeof r === "string" && r)))
      : [role];
    const forbidden = requestedRoles.filter((r) => !assignableByCaller(r));
    if (forbidden.length > 0) {
      console.error("invite-user: Rollenvergabe verweigert. Caller roles:",
        Array.from(callerRoleSet), "blocked target roles:", forbidden);
      return new Response(
        JSON.stringify({
          error: `Keine Berechtigung, folgende Rolle(n) zu vergeben: ${forbidden.join(", ")}`,
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Tippgeber-Verknuepfung pruefen, BEVOR ein Konto oder eine Mail entsteht.
    if (tippgeberId) {
      const { data: tg } = await adminClient
        .from("tippgeber")
        .select("zugeordnet_id, benutzer_id")
        .eq("id", tippgeberId)
        .maybeSingle();
      let kontoPasstZurAdresse = false;
      if (tg?.benutzer_id) {
        const { data: konto } = await adminClient.auth.admin.getUserById(tg.benutzer_id);
        kontoPasstZurAdresse = !!konto?.user?.email
          && konto.user.email.trim().toLowerCase() === String(email).trim().toLowerCase();
      }
      const teamleiterVon = new Map<string, string>();
      if (tg && !callerIsAdminGlobal && !callerRoleSet.has("vertriebsleiter")) {
        const { data: einstellungen } = await adminClient
          .from("user_settings")
          .select("user_id, einstellungen");
        for (const zeile of einstellungen || []) {
          const tl = (zeile.einstellungen as Record<string, unknown> | null)?.teamleader_id;
          if (typeof tl === "string" && tl && zeile.user_id) teamleiterVon.set(zeile.user_id, tl);
        }
      }
      const ablehnung = tippgeberVerknuepfungAblehnung({
        aufruferId: caller.id,
        aufruferRollen: callerRoleSet,
        tippgeber: tg ?? null,
        teamleiterVon,
        kontoPasstZurAdresse,
      });
      if (ablehnung) {
        console.error("invite-user: Tippgeber-Verknuepfung abgelehnt", tippgeberId, ablehnung);
        return new Response(JSON.stringify({ error: ablehnung }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Feste Basisadresse statt Origin-Kopf: Den Kopf setzt der Aufrufer
    // selbst, damit liesse sich der Aktivierungslink auf eine fremde Seite
    // lenken, die den Token abgreift.
    const origin = (Deno.env.get("APP_BASE_URL") || "https://osimmobilien.netlify.app").trim().replace(/\/+$/, "");

    /*
     * Die Sprache aus dem Kundenprofil (Plan Kundensprache, Etappe 1, M29).
     * Die Einladungsmail geht in dieser Sprache hinaus, und der Link trägt sie
     * als `lang` mit. So sind Aktivierung, Login, Passwort und 2FA schon vor
     * der ersten Anmeldung in der richtigen Sprache, auch in einem Browser,
     * der zuletzt die andere Sprache gezeigt hat. Nur für Kunden; Partner und
     * Mitarbeiter bekommen Deutsch wie bisher. Rückfall Deutsch.
     */
    const kundenSpr: Sprache | null = role === "kunde" && kontaktId
      ? await kundenSprache(adminClient, { kontaktId })
      : null;

    const redirectTo = (() => {
      if (role === "kunde" && kontaktId) {
        const params = new URLSearchParams({
          portal: "kunde",
          next: `/kunde/stammdaten?kontaktId=${encodeURIComponent(kontaktId)}`,
          loginEmail: email,
          kontaktId,
          kundeName: vorname || name?.split(" ")[0] || "",
          lang: kundenSpr ?? "de",
        });
        return `${origin}/reset-password?${params.toString()}`;
      }
      if (role === "tippgeber") {
        const params = new URLSearchParams({
          portal: "tippgeber",
          next: `/tippgeber-portal`,
          loginEmail: email,
          kundeName: vorname || name?.split(" ")[0] || "",
        });
        return `${origin}/reset-password?${params.toString()}`;
      }
      return `${origin}/reset-password`;
    })();

    const ensurePreferredRole = async (userId: string, preferredRole: string) => {
      const { data: existingSettings, error: settingsError } = await adminClient
        .from("user_settings")
        .select("id, einstellungen")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsError) {
        console.error("user_settings konnten nicht geladen werden", settingsError);
        return;
      }

      const einstellungen = existingSettings?.einstellungen && typeof existingSettings.einstellungen === "object"
        ? { ...(existingSettings.einstellungen as Record<string, unknown>) }
        : {};

      einstellungen.active_role = preferredRole;

      if (existingSettings?.id) {
        const { error: updateSettingsError } = await adminClient
          .from("user_settings")
          .update({ einstellungen, updated_at: new Date().toISOString() })
          .eq("id", existingSettings.id);

        if (updateSettingsError) {
          console.error("user_settings konnten nicht aktualisiert werden", updateSettingsError);
        }
        return;
      }

      const { error: insertSettingsError } = await adminClient
        .from("user_settings")
        .insert({ user_id: userId, einstellungen });

      if (insertSettingsError) {
        console.error("user_settings konnten nicht angelegt werden", insertSettingsError);
      }
    };

    // Helper: find existing auth user by email (paginates if needed)
    const findUserByEmail = async (targetEmail: string) => {
      const needle = targetEmail.toLowerCase();
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
        if (error) {
          console.error("invite-user: listUsers error on page", page, error.message);
          return null;
        }
        const users = data?.users || [];
        const hit = users.find((u: any) => (u.email || "").toLowerCase() === needle);
        if (hit) return hit;
        if (users.length < 200) break;
      }
      return null;
    };

    // ────────────────────────────────────────────────────────────────────
    // Aktivierungs-Flow (7-Tage-Token):
    // Wir erzeugen den Auth-User direkt (ohne Supabase-Invite-Mail) und
    // versenden anschließend eine eigene E-Mail mit einem
    // benutzerdefinierten 7-Tage-Aktivierungs-Token. So sind Links eine
    // ganze Woche gültig und immun gegen Mail-Scanner-Vorabklicks.
    // ────────────────────────────────────────────────────────────────────

    const sendActivationEmail = async (params: { userId: string; isExistingUser: boolean }) => {
      const portalKey = role === "kunde" ? "kunde" : "";
      const nextPath = role === "kunde" && kontaktId
        ? `/kunde/stammdaten?kontaktId=${encodeURIComponent(kontaktId)}`
        : "";
      const kundeNameValue = vorname || name?.split(" ")[0] || "";

      const { data: tokRow, error: tokErr } = await adminClient
        .from("activation_tokens")
        .insert({
          user_id: params.userId,
          email,
          kontakt_id: kontaktId || null,
          portal: portalKey || null,
          kunde_name: kundeNameValue,
          next: nextPath || null,
          role,
          created_by: caller.id,
        })
        .select("token")
        .single();

      if (tokErr || !tokRow) {
        console.error("invite-user: activation_token insert error", tokErr);
        throw new Error("Aktivierungs-Token konnte nicht angelegt werden");
      }

      const linkParams = new URLSearchParams();
      linkParams.set("t", tokRow.token);
      if (portalKey) linkParams.set("portal", portalKey);
      if (kontaktId) linkParams.set("kontaktId", kontaktId);
      if (kundeNameValue) linkParams.set("kundeName", kundeNameValue);
      if (email) linkParams.set("loginEmail", email);
      if (kundenSpr) linkParams.set("lang", kundenSpr);
      const activationLink = `${origin}/aktivieren?${linkParams.toString()}`;
      const { data: sendData, error: sendError } = await adminClient.functions.invoke("send-transactional-email", {
        body: {
          templateName: "activation-invite",
          recipientEmail: email,
          idempotencyKey: `invite-${params.userId}-${Date.now()}`,
          // `sprache` doppelt: in templateData für die Vorlage (sie wählt
          // damit Text und Betreff), oben für `send-transactional-email`,
          // sobald die Function den Parameter kennt (Etappe 2). Bis dahin
          // wird das obere Feld schlicht nicht gelesen.
          templateData: { activationUrl: activationLink, ...(kundenSpr ? { sprache: kundenSpr } : {}) },
          ...(kundenSpr ? { sprache: kundenSpr } : {}),
          metadata: {
            invited_by: caller.id,
            user_id: params.userId,
            existing_user: params.isExistingUser,
            ...(role === "kunde" && kontaktId ? { kontakt_id: kontaktId } : {}),
          },
        },
      });
      if (sendError) {
        console.error("invite-user: send-transactional-email failed", sendError);
        throw new Error(`Aktivierungs-E-Mail konnte nicht versendet werden: ${sendError.message || sendError}`);
      }
      // Status 200 heisst noch nicht versendet: Eine gesperrte Adresse kommt
      // als { success: false, reason: "email_suppressed" } zurueck (Pruefung
      // Codex, 04.10.2026). Bis dahin galt das als verschickt.
      const versand = (sendData && typeof sendData === "object" ? sendData : {}) as { success?: unknown; reason?: unknown };
      if (versand.success === false) {
        const grund = versand.reason === "email_suppressed"
          ? "die Adresse steht auf der Sperrliste (Abmeldung oder Beschwerde)"
          : String(versand.reason || "unbekannter Grund");
        console.error("invite-user: send-transactional-email lehnt ab", versand);
        throw new Error(`Aktivierungs-E-Mail konnte nicht versendet werden: ${grund}`);
      }
      console.log(
        `invite-user: 7-day activation email queued for ${email} (existing=${params.isExistingUser})`,
      );
    };

    let newUser: any = null;

    const existingUser = await findUserByEmail(email);

    // Vorhandenes Konto eines anderen Tippgebers nicht umhaengen, bevor
    // irgendetwas verknuepft wird (Gegenpruefung vom 30.09.2026).
    if (tippgeberId && existingUser) {
      const { data: tippgeberDesKontos } = await adminClient
        .from("tippgeber")
        .select("id")
        .eq("benutzer_id", existingUser.id);
      const ablehnung = tippgeberKontoAblehnung({
        aufruferRollen: callerRoleSet,
        tippgeberId: String(tippgeberId),
        tippgeberDesKontos: (tippgeberDesKontos || []).map((t: { id: string }) => t.id),
      });
      if (ablehnung) {
        console.error("invite-user: Konto gehoert schon einem anderen Tippgeber", tippgeberId);
        return new Response(JSON.stringify({ error: ablehnung }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    /*
     * Zuordnung pruefen, bevor irgendetwas angelegt oder verknuepft wird
     * (Gegenpruefung vom 28.09.2026, A2). Bis dahin haengte die Function das
     * Konto an jeden Kontakt aus dem Aufruf, und ein vorhandenes Konto per
     * E-Mail still dazu. Ein Partner konnte so eine eigene zweite Adresse
     * als Person 2 an einen fremden Kontakt haengen und dessen Daten im
     * Portal lesen, oder ein fremdes Konto an einen eigenen Kontakt.
     *
     * Admin und Inhaber pruefen wir nicht, sie verwalten alle Kontakte.
     */
    if (!callerIsAdminGlobal) {
      if (kontaktId) {
        // Mit der Sitzung des Aufrufers lesen: Die Zeilensicherheit auf
        // `kontakte` entscheidet, ob er den Kontakt betreut oder sehen darf.
        const { data: sichtbar, error: sichtFehler } = await callerClient
          .from("kontakte")
          .select("id")
          .eq("id", kontaktId)
          .maybeSingle();
        if (sichtFehler || !sichtbar) {
          return new Response(
            JSON.stringify({ error: "Diesen Kontakt betreust du nicht. Das Kundenportal kann nur freischalten, wer den Kontakt betreut." }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      if (existingUser) {
        const ablehnung = await vorhandenesKontoPruefen(adminClient, existingUser.id, kontaktId || null);
        if (ablehnung) {
          return new Response(JSON.stringify({ error: ablehnung }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    let neuMailFehler: string | null = null;
    if (existingUser) {
      console.log("invite-user: User exists, re-sending 7-day activation link for", email);
      newUser = { user: existingUser };
      const { data: existingRoles } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", existingUser.id);
      const hasRequestedRole = (existingRoles || []).some((r: any) => r.role === role);
      if (!hasRequestedRole) {
        await adminClient.from("user_roles").insert({ user_id: existingUser.id, role });
        console.log("invite-user: Added role", role, "to user", existingUser.id);
      }
      try {
        await sendActivationEmail({ userId: existingUser.id, isExistingUser: true });
      } catch (mailErr) {
        console.error("invite-user: activation email error (existing)", mailErr);
        return new Response(JSON.stringify({ error: String(mailErr) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
        email,
        email_confirm: false,
        user_metadata: { name, role, kontaktId },
        // Die Rolle gehoert in app_metadata, das nur der Server setzt (20261004120000).
        app_metadata: { role },
      });
      if (createError || !createData?.user) {
        console.error("invite-user: createUser error", createError?.message);
        return new Response(JSON.stringify({ error: createError?.message || "User konnte nicht erstellt werden" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      newUser = createData;
      console.log("invite-user: New auth user created:", newUser.user.id);
      // Der Trigger sieht app_metadata beim Anlegen noch nicht, siehe _shared/startrolle.ts.
      try {
        await startrollenSetzen(adminClient, newUser.user.id, requestedRoles);
      } catch (rollenErr) {
        console.error("invite-user: Startrolle nicht gesetzt", rollenErr);
        return new Response(JSON.stringify({ error: `Konto angelegt, Rolle aber nicht gesetzt: ${String(rollenErr)}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      try {
        await sendActivationEmail({ userId: newUser.user.id, isExistingUser: false });
      } catch (mailErr) {
        console.error("invite-user: activation email error (new)", mailErr);
        // Wie beim vorhandenen Konto melden, aber erst am Ende: Rollen,
        // Einstellungen und die Verknuepfung mit dem Kontakt sollen trotzdem
        // stehen. Bis zum 04.10.2026 kam hier „Erfolg“ zurueck, obwohl nie
        // eine Mail rausging. Ein zweiter Versuch laeuft ueber den Zweig fuer
        // vorhandene Konten und schickt die Mail erneut.
        neuMailFehler = mailErr instanceof Error ? mailErr.message : String(mailErr);
      }
    }


    if (role === "kunde" && newUser?.user?.id) {
      await ensurePreferredRole(newUser.user.id, "kunde");
    }

    // Pre-fill user_settings with profil data + karriere_override from invite form
    if (newUser?.user?.id && (vorname || nachname || telefon || karriereStufe || teamleaderId || customProvisionRate != null || customProvisionRateSetter != null || customProvisionRateEigen != null || typeof karriereGatingActive === "boolean")) {
      const splitVorname = vorname || name?.split(" ")[0] || "";
      const splitNachname = nachname || name?.split(" ").slice(1).join(" ") || "";
      const profilData: Record<string, string> = {
        vorname: splitVorname,
        nachname: splitNachname,
      };
      if (telefon) profilData.telefon = telefon;

      const { data: existingSettings } = await adminClient
        .from("user_settings")
        .select("id, einstellungen")
        .eq("user_id", newUser.user.id)
        .maybeSingle();

      const existing = (existingSettings?.einstellungen as Record<string, unknown>) || {};
      const existingProfil = (existing.profil as Record<string, string>) || {};
      // Only fill empty fields, don't overwrite
      const mergedProfil = { ...profilData, ...Object.fromEntries(Object.entries(existingProfil).filter(([, v]) => v && String(v).trim())) };

      const newEinstellungen: Record<string, unknown> = { ...existing, profil: mergedProfil };
      if (karriereStufe && typeof karriereStufe === "string") {
        newEinstellungen.karriere_override = karriereStufe;
        console.log("invite-user: Karrierestufe override gesetzt:", karriereStufe, "für", newUser.user.id);
      }
      if (teamleaderId && typeof teamleaderId === "string") {
        newEinstellungen.teamleader_id = teamleaderId;
        console.log("invite-user: Teamleiter-ID gesetzt:", teamleaderId, "für", newUser.user.id);
      }
      if (customProvisionRate !== undefined && customProvisionRate !== null && customProvisionRate !== "") {
        const v = typeof customProvisionRate === "number" ? customProvisionRate : parseFloat(String(customProvisionRate));
        if (!isNaN(v)) newEinstellungen.custom_provision_rate = v;
      }
      if (customProvisionRateSetter !== undefined && customProvisionRateSetter !== null && customProvisionRateSetter !== "") {
        const v = typeof customProvisionRateSetter === "number" ? customProvisionRateSetter : parseFloat(String(customProvisionRateSetter));
        if (!isNaN(v)) newEinstellungen.custom_provision_rate_setter = v;
      }
      if (customProvisionRateEigen !== undefined && customProvisionRateEigen !== null && customProvisionRateEigen !== "") {
        const v = typeof customProvisionRateEigen === "number" ? customProvisionRateEigen : parseFloat(String(customProvisionRateEigen));
        if (!isNaN(v)) newEinstellungen.custom_provision_rate_eigen = v;
      }
      if (typeof karriereGatingActive === "boolean") {
        newEinstellungen.karriere_gating_active = karriereGatingActive;
      }

      if (existingSettings?.id) {
        await adminClient
          .from("user_settings")
          .update({ einstellungen: newEinstellungen, updated_at: new Date().toISOString() })
          .eq("id", existingSettings.id);
      } else {
        await adminClient
          .from("user_settings")
          .insert({ user_id: newUser.user.id, einstellungen: newEinstellungen });
      }
      console.log("invite-user: Pre-filled user_settings profil for", newUser.user.id);
    }

    // Add additional roles (beyond the primary role auto-assigned by handle_new_user trigger)
    if (newUser?.user?.id && Array.isArray(roles) && roles.length > 1) {
      const { data: existingRolesData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", newUser.user.id);
      const existingRoleSet = new Set((existingRolesData || []).map((r: any) => r.role));
      const toInsert = roles
        .filter((r: string) => r && !existingRoleSet.has(r))
        .map((r: string) => ({ user_id: newUser.user.id, role: r }));
      if (toInsert.length > 0) {
        const { error: rolesError } = await adminClient.from("user_roles").insert(toInsert);
        if (rolesError) {
          console.error("invite-user: Zusatzrollen konnten nicht eingetragen werden:", rolesError);
        } else {
          console.log("invite-user: Zusatzrollen hinzugefügt:", toInsert.map((r: any) => r.role).join(", "));
        }
      }
    }

    // Update profile with moreId if provided
    if (moreId && newUser.user) {
      await adminClient
        .from("profiles")
        .update({ more_id: moreId })
        .eq("id", newUser.user.id);
    }

    // Anzeige-Variante im Profil hinterlegen (nur wenn angefragt).
    // Fehler hier brechen die Einladung bewusst nicht ab: solange die
    // Migration 20260901170000 (Spalte profiles.rollen_variante) nicht
    // gelaufen ist, schlaegt das Update fehl und der Nutzer wird schlicht
    // als Vertriebspartner angezeigt.
    if (gewuenschteVariante && newUser?.user?.id) {
      const { error: varianteError } = await adminClient
        .from("profiles")
        .update({ rollen_variante: gewuenschteVariante })
        .eq("id", newUser.user.id);
      if (varianteError) {
        console.error("invite-user: rollen_variante konnte nicht gesetzt werden (Migration gelaufen?):", varianteError.message);
      } else {
        console.log("invite-user: rollen_variante", gewuenschteVariante, "gesetzt fuer", newUser.user.id);
      }
    }

    // Link kontakt to auth user
    if (kontaktId && newUser.user) {
      const { data: kontakt } = await adminClient
        .from("kontakte")
        .select("meta")
        .eq("id", kontaktId)
        .maybeSingle();
      if (kontakt) {
        const existingMeta = (kontakt.meta as Record<string, unknown>) || {};
        
        if (person2) {
          // Person 2: store authUserId under meta.person2
          const existingP2 = (existingMeta.person2 as Record<string, unknown>) || {};
          const meta = {
            ...existingMeta,
            person2: {
              ...existingP2,
              authUserId: newUser.user.id,
              portalFreigeschalten: true,
              portalActivatedAt: new Date().toISOString(),
            },
          };
          await adminClient.from("kontakte").update({ meta }).eq("id", kontaktId);
          console.log("invite-user: Person 2 kontakt meta updated for", kontaktId);
        } else {
          // Person 1: store authUserId at top level
          // `portalGesperrt` bleibt, wie es ist. Bis zum 23.09.2026 hob jede
          // Einladung eine Portalsperre stillschweigend auf. Entsperren geht
          // jetzt nur noch ausdruecklich ueber die Function
          // `kundenportal-sperre`, die auch die Anmeldung wieder freigibt.
          const meta = {
            ...existingMeta,
            portalFreigeschalten: true,
            portalActivatedAt: new Date().toISOString(),
            authUserId: newUser.user.id,
          };
          await adminClient.from("kontakte").update({ meta }).eq("id", kontaktId);
          console.log("invite-user: Kontakt meta updated for", kontaktId);
        }
      }
    }

    // Link Tippgeber-Eintrag an Auth-User (Portal-Aktivierung). Wer das darf,
    // ist oben vor der Kontoanlage geprueft (tippgeberVerknuepfungAblehnung).
    if (tippgeberId && newUser?.user?.id) {
      const { error: tippErr } = await adminClient
        .from("tippgeber")
        .update({
          benutzer_id: newUser.user.id,
          portal_aktiv: true,
        })
        .eq("id", tippgeberId);
      if (tippErr) {
        console.error("invite-user: tippgeber link error", tippErr);
      } else {
        console.log("invite-user: tippgeber", tippgeberId, "linked to user", newUser.user.id);
      }
    }

    if (neuMailFehler) {
      return new Response(JSON.stringify({
        error: `Konto angelegt, die Aktivierungs-E-Mail ging aber nicht raus: ${neuMailFehler}. Bitte die Einladung erneut senden.`,
        userId: newUser.user?.id,
        kontoAngelegt: true,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("invite-user: Success for", email);
    return new Response(
      JSON.stringify({ success: true, userId: newUser.user?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("invite-user: Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
