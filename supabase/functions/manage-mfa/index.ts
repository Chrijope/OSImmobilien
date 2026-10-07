import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import {
  hatZweitenFaktor,
  istReinesKundenkonto,
  ZWEITER_FAKTOR_NOETIG,
  ZWEITER_FAKTOR_TEXT,
} from "../_shared/mfa-stufe.ts";

/**
 * Zehn Wiederherstellungscodes ausstellen.
 *
 * Die alten werden zuerst geloescht: Eine neue Ausgabe entwertet die alte,
 * sonst laegen zwei gueltige Zettel im Umlauf. Genau deshalb darf diese
 * Funktion nur laufen, wenn der zweite Faktor nachgewiesen ist, siehe
 * `_shared/mfa-stufe.ts` und die beiden Aufrufstellen weiter unten.
 *
 * Zurueck kommt der Klartext, und zwar genau einmal. Gespeichert wird nur der
 * SHA-256-Pruefwert.
 */
async function wiederherstellungscodesErzeugen(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ codes: string[]; fehler: string | null }> {
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);

  const codes: string[] = [];
  const rows: { user_id: string; code_hash: string }[] = [];
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne I,O,1,0
  const buf = new Uint8Array(40);
  for (let i = 0; i < 10; i++) {
    crypto.getRandomValues(buf);
    let raw = "";
    for (let j = 0; j < 10; j++) raw += ALPHABET[buf[j] % ALPHABET.length];
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    codes.push(formatted);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(formatted));
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    rows.push({ user_id: userId, code_hash: hash });
  }

  const { error: insErr } = await admin.from("mfa_recovery_codes").insert(rows);
  if (insErr) return { codes: [], fehler: insErr.message };

  await admin.from("audit_log").insert({
    actor: userId,
    action: "mfa_recovery_codes_generated",
    entity: "mfa_recovery_codes",
    entity_id: userId,
    meta: { count: codes.length },
  });

  return { codes, fehler: null };
}

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const body = await req.json();
    const { action } = body;

    // Rate-Limit nur für sicherheitsrelevante Actions (verify = TOTP-Code-Eingabe → Brute-Force-Schutz).
    // list/enroll sind harmlos. 10 Verify-Versuche/Stunde pro User.
    if (action === "verify") {
      const rl = await checkRateLimit(req, user.id, { scope: "manage-mfa:verify", perHour: 10 });
      if (!rl.ok) return rateLimitErrorBody("manage-mfa:verify", rl, corsHeaders);
    }

    // Brute-Force-Schutz für Recovery-Code-Einlösung: 5/Stunde pro User
    if (action === "consume_recovery_code") {
      const rl = await checkRateLimit(req, user.id, { scope: "manage-mfa:recovery", perHour: 5 });
      if (!rl.ok) return rateLimitErrorBody("manage-mfa:recovery", rl, corsHeaders);
    }

    // ── LIST FACTORS ──
    if (action === "list") {
      const { data, error } = await userClient.auth.mfa.listFactors();
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ factors: data }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ENROLL ──
    if (action === "enroll") {
      const { data: existingFactors, error: listErr } = await userClient.auth.mfa.listFactors();
      if (listErr) {
        console.error("manage-mfa enroll: listFactors failed", listErr.message);
        return new Response(JSON.stringify({ error: "2FA-Status konnte nicht geprüft werden. Bitte lade die Seite neu und versuche es erneut." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const verifiedTotp = (existingFactors?.totp || []).find((f: any) => f.status === "verified");
      if (verifiedTotp) {
        // Die Kennung `code` ist maschinenlesbar. Die Oberfläche schaltet damit
        // auf die Codeabfrage um, statt den Kunden auf der Einrichtung stehen
        // zu lassen. Der Text sagt zusätzlich, was ohne Code zu tun ist.
        return new Response(JSON.stringify({
          code: "mfa_bereits_aktiv",
          error: "Die Zwei-Faktor-Authentifizierung ist für dieses Konto bereits aktiviert. Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein. Wenn du keinen Code erzeugen kannst, weil dir das Handy oder die App fehlt, löse auf dem Codebildschirm unter \"Kein Code zur Hand?\" einen deiner Wiederherstellungscodes ein. Hast du auch den nicht mehr, melde dich bitte bei deinem Ansprechpartner bei OS Immobilien.",
        }), {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const staleTotp = [
        ...(existingFactors?.all || []),
        ...(existingFactors?.totp || []),
      ].filter((f: any) => f?.factor_type === "totp" && f?.status !== "verified");
      const seenStale = new Set<string>();
      for (const factor of staleTotp) {
        if (!factor?.id || seenStale.has(factor.id)) continue;
        seenStale.add(factor.id);
        const { error: unenrollErr } = await userClient.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollErr) {
          console.error("manage-mfa enroll: stale factor cleanup failed", unenrollErr.message);
        }
      }

      const { data, error } = await userClient.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: body.friendlyName || "OS Immobilien CRM",
      });
      if (error) {
        console.error("manage-mfa enroll: enroll failed", error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── VERIFY (activate factor after enrollment) ──
    if (action === "verify") {
      const { factorId, code } = body;
      if (!factorId || !code) {
        return new Response(JSON.stringify({ error: "factorId und code erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create challenge
      const { data: challenge, error: chalErr } = await userClient.auth.mfa.challenge({ factorId });
      if (chalErr) {
        return new Response(JSON.stringify({ error: chalErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify
      const { data: verifyData, error: verErr } = await userClient.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verErr) {
        return new Response(JSON.stringify({ error: verErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Die Wiederherstellungscodes der Einrichtung ──
      //
      // Sie entstehen hier und nicht in einem zweiten Aufruf, und das ist der
      // Kern der Loesung fuer Audit-Befund F04.
      //
      // Das Problem: Die Sitzung im Browser bleibt nach dieser Zeile auf
      // `aal1`. `auth.mfa.verify` laeuft hier im Server, GoTrue gibt die neue
      // Sitzung an diese Function zurueck, nicht an den Browser. Wer sich
      // gerade erst eingerichtet hat, kann also niemals einen `aal2`-Aufruf
      // absetzen, und eine Stufenpruefung auf `generate_recovery_codes` wuerde
      // genau ihn aussperren.
      //
      // Die Unterscheidung laeuft deshalb nicht ueber die Sitzung, sondern
      // ueber den Nachweis selbst: Wer bis hierher kommt, hat soeben einen
      // gueltigen Code aus der Authenticator-App eingegeben. Das ist derselbe
      // Besitznachweis, den `aal2` bescheinigt, nur eine Zeile frueher. Ein
      // Angreifer mit uebernommener Sitzung kommt hier nicht vorbei: Ohne
      // gueltigen Code bricht `verify` vorher ab, und `enroll` weist ihn mit
      // "mfa_bereits_aktiv" zurueck, solange ein bestaetigter Faktor besteht.
      //
      // Scheitert die Ausstellung, gilt die Einrichtung trotzdem: Der Faktor
      // ist bestaetigt, der Nutzer kommt hinein. Die Oberflaeche sagt ihm dann,
      // dass die Codes fehlen.
      const adminFuerCodes = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { codes: neueCodes, fehler: codeFehler } = await wiederherstellungscodesErzeugen(adminFuerCodes, user.id);
      if (codeFehler) console.error("manage-mfa verify: Wiederherstellungscodes fehlgeschlagen", codeFehler);

      return new Response(JSON.stringify({
        success: true,
        recoveryCodes: neueCodes,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UNENROLL ──
    if (action === "unenroll") {
      const { factorId } = body;
      if (!factorId) {
        return new Response(JSON.stringify({ error: "factorId erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await userClient.auth.mfa.unenroll({ factorId });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DEAKTIVIEREN: nur Kunden, nur mit aktuellem Code ──
    //
    // Seit dem 25.09.2026 ist die Zwei-Faktor-Anmeldung fuer Kunden freiwillig
    // (Entscheidung Christian). Wer sie eingeschaltet hat, darf sie auch
    // wieder ausschalten, aber nur mit einem Code, den er gerade aus seiner
    // Authenticator-App abliest. Eine laufende Sitzung allein genuegt nicht:
    // Wer eine fremde Sitzung uebernommen hat, soll den Schutz nicht einfach
    // abschalten koennen.
    //
    // Interne Rollen bleiben aussen vor. Fuer sie ist die Zwei-Faktor-
    // Anmeldung Pflicht, daran aendert diese Aktion nichts.
    if (action === "deaktivieren") {
      const rl = await checkRateLimit(req, user.id, { scope: "manage-mfa:deaktivieren", perHour: 10 });
      if (!rl.ok) return rateLimitErrorBody("manage-mfa:deaktivieren", rl, corsHeaders);

      const code = String(body.code || "").replace(/\D/g, "");
      if (code.length !== 6) {
        return new Response(JSON.stringify({ code: "code_ungueltig", error: "Bitte gib den 6-stelligen Code aus deiner App ein." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

      // Nur reine Kundenkonten. Die Rolle kommt aus der Datenbank, nicht aus
      // dem Aufruf.
      const { data: rollen, error: rollenErr } = await admin
        .from("user_roles").select("role").eq("user_id", user.id);
      if (rollenErr) {
        return new Response(JSON.stringify({ error: "Berechtigung konnte nicht geprueft werden." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Kunde, hoechstens zusaetzlich Tippgeber (`istReinesKundenkonto`).
      // Wer daneben eine interne Rolle hat, faellt unter die interne Pflicht.
      if (!istReinesKundenkonto((rollen ?? []).map((r: any) => String(r.role)))) {
        return new Response(JSON.stringify({
          code: "nur_kunden",
          error: "Die Zwei-Faktor-Anmeldung kann hier nur fuer Kundenkonten ausgeschaltet werden.",
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Den bestaetigten Faktor des Aufrufers suchen. Eine mitgeschickte
      // Kennung zaehlt nur, wenn sie zu ihm gehoert.
      const { data: liste, error: listErr } = await userClient.auth.mfa.listFactors();
      if (listErr) {
        return new Response(JSON.stringify({ error: "2FA-Status konnte nicht geprueft werden." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const bestaetigt = (liste?.totp ?? []).filter((f: any) => f?.status === "verified");
      const faktor = bestaetigt.find((f: any) => f.id === body.factorId) ?? bestaetigt[0];
      if (!faktor) {
        return new Response(JSON.stringify({ success: true, bereitsAus: true }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Der Besitznachweis: ein gueltiger Code fuer genau diesen Faktor.
      const { data: challenge, error: chalErr } = await userClient.auth.mfa.challenge({ factorId: faktor.id });
      if (chalErr) {
        return new Response(JSON.stringify({ error: chalErr.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error: verErr } = await userClient.auth.mfa.verify({ factorId: faktor.id, challengeId: challenge.id, code });
      if (verErr) {
        return new Response(JSON.stringify({ code: "code_ungueltig", error: "Der Code stimmt nicht." }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Entfernt wird ueber den Dienstschluessel. Der Code ist eben geprueft
      // worden, das ist derselbe Nachweis, den eine aal2-Sitzung bescheinigt.
      // Der Weg ueber die Nutzersitzung waere davon abhaengig, ob GoTrue die
      // gerade erzeugte aal2-Sitzung an diesen Client zurueckgibt.
      let entfernt = 0;
      let fehlgeschlagen = 0;
      const gesehen = new Set<string>();
      for (const f of [...(liste?.all ?? []), ...(liste?.totp ?? [])]) {
        if (!f?.id || gesehen.has(f.id) || (f.factor_type && f.factor_type !== "totp")) continue;
        gesehen.add(f.id);
        const { error: delErr } = await (admin as any).auth.admin.mfa.deleteFactor({ userId: user.id, id: f.id });
        if (delErr) {
          fehlgeschlagen++;
          console.error("deaktivieren: deleteFactor failed", delErr.message);
        } else {
          entfernt++;
        }
      }
      if (fehlgeschlagen > 0) {
        return new Response(JSON.stringify({
          code: "mfa_reset_fehlgeschlagen",
          error: "Die Zwei-Faktor-Anmeldung konnte nicht ausgeschaltet werden.",
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ohne Faktor sind die Wiederherstellungscodes wertlos. Stehen lassen
      // hiesse: Ein alter Zettel koennte spaeter einen neuen Faktor loeschen.
      await admin.from("mfa_recovery_codes").delete().eq("user_id", user.id);

      await admin.from("audit_log").insert({
        actor: user.id,
        action: "mfa_kunde_deaktiviert",
        entity: "auth.users",
        entity_id: user.id,
        meta: { entfernte_faktoren: entfernt },
      });

      return new Response(JSON.stringify({ success: true, entfernt }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RECOVERY CODES: STATUS (Counts; nie Klartext) ──
    if (action === "recovery_status") {
      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data, error } = await admin.rpc("mfa_recovery_codes_status", { _user_id: user.id });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ status: data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RECOVERY CODES: GENERIEREN (10 Codes, gehasht speichern, Klartext einmalig zurück) ──
    //
    // Audit-Befund F04 vom 15.09.2026: Diese Aktion loescht zuerst alle alten
    // Codes. Sie stand bis zum 16.09.2026 jeder angemeldeten Sitzung offen,
    // auch einer uebernommenen. Damit liess sich der echte Besitzer aussperren.
    //
    // Deshalb verlangt sie jetzt die Stufe `aal2`, also eine Sitzung, die den
    // zweiten Faktor tatsaechlich benutzt hat.
    //
    // Der Ersteinrichtungsfall laeuft NICHT hierueber: Die Codes der
    // Einrichtung kommen aus der Aktion `verify` zurueck, wo der Besitz der
    // Authenticator-App gerade nachgewiesen wurde. Die Begruendung steht dort.
    if (action === "generate_recovery_codes") {
      if (!hatZweitenFaktor(authHeader)) {
        return new Response(JSON.stringify({
          code: ZWEITER_FAKTOR_NOETIG,
          error: ZWEITER_FAKTOR_TEXT,
        }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { codes, fehler } = await wiederherstellungscodesErzeugen(admin, user.id);
      if (fehler) {
        return new Response(JSON.stringify({ error: fehler }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ codes }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── RECOVERY CODES: EINLÖSEN (alle TOTP-Faktoren entfernen → Re-Enrollment erforderlich) ──
    if (action === "consume_recovery_code") {
      const codeRaw = String(body.code || "").trim().toUpperCase().replace(/\s+/g, "");
      const code = codeRaw.includes("-") ? codeRaw : (codeRaw.length === 10 ? `${codeRaw.slice(0,5)}-${codeRaw.slice(5)}` : codeRaw);
      if (!code || code.length < 10) {
        return new Response(JSON.stringify({ error: "Ungültiger Code" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
               || req.headers.get("cf-connecting-ip") || null;

      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
      const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data: ok, error } = await admin.rpc("consume_mfa_recovery_code", {
        _user_id: user.id, _code_hash: hash, _ip: ip,
      });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!ok) {
        return new Response(JSON.stringify({ error: "Code ungültig oder bereits verbraucht" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Alle TOTP-Faktoren entfernen → User muss neu enrollen (Authenticator-Verlust).
      // Wichtig: Das Entfernen eines bestätigten Faktors verlangt in GoTrue eine
      // Sitzung, die den zweiten Faktor bereits verwendet hat. Genau die hat
      // niemand, der seinen Authenticator verloren hat. Deshalb wird zuerst der
      // normale Weg versucht und danach der Service-Role-Weg. Schlägt beides
      // fehl, darf hier NICHT "erfolgreich" gemeldet werden, sonst ist der Code
      // verbraucht und der Nutzer sitzt weiter fest.
      let entfernt = 0;
      let fehlgeschlagen = 0;
      try {
        const { data: factors } = await userClient.auth.mfa.listFactors();
        const allFactors = [...(factors?.all ?? []), ...(factors?.totp ?? [])];
        const seen = new Set<string>();
        for (const f of allFactors) {
          if (!f?.id || seen.has(f.id)) continue;
          seen.add(f.id);
          const { error: unErr } = await userClient.auth.mfa.unenroll({ factorId: f.id });
          if (!unErr) { entfernt++; continue; }
          console.warn("recovery: unenroll via user client failed", unErr.message);
          const { error: adminErr } = await (admin as any).auth.admin.mfa.deleteFactor({
            userId: user.id,
            id: f.id,
          });
          if (adminErr) {
            fehlgeschlagen++;
            console.error("recovery: admin deleteFactor failed", adminErr.message);
          } else {
            entfernt++;
          }
        }
      } catch (e) {
        fehlgeschlagen++;
        console.error("recovery: unenroll factors failed", e);
      }

      if (fehlgeschlagen > 0 && entfernt === 0) {
        return new Response(JSON.stringify({
          code: "mfa_reset_fehlgeschlagen",
          error: "Der Code war gültig, die Zwei-Faktor-Authentifizierung konnte aber nicht zurückgesetzt werden. Bitte melde dich bei deinem Ansprechpartner bei OS Immobilien.",
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Admins informieren
      try {
        const { data: adminRoles } = await admin
          .from("user_roles").select("user_id").in("role", ["admin", "inhaber"]);
        const { data: profile } = await admin
          .from("profiles").select("name, email").eq("id", user.id).maybeSingle();
        const notifs = (adminRoles ?? []).map((r: any) => ({
          benutzer_id: r.user_id,
          titel: "2FA per Recovery-Code zurückgesetzt",
          nachricht: `${profile?.name || profile?.email || user.email} hat 2FA via Recovery-Code zurückgesetzt (IP: ${ip || "unbekannt"}). Re-Enrollment ist erforderlich.`,
          link: "/session-anomalien",
        }));
        if (notifs.length) await admin.from("benachrichtigungen").insert(notifs);
      } catch (e) {
        console.error("recovery: admin notify failed", e);
      }

      return new Response(JSON.stringify({ success: true, reenrollRequired: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ADMIN: ZWEITEN FAKTOR EINES ANDEREN NUTZERS ZURUECKSETZEN ──
    //
    // Bis zum 11.09.2026 konnte niemand im Haus einem Kunden helfen, der sein
    // Telefon verloren hatte. Der Kunde kam nur ueber einen Recovery-Code
    // wieder hinein, und wer den nicht hatte, sass fest. Entscheidung
    // Christians vom 11.09.2026: Admins duerfen zuruecksetzen.
    //
    // Das Entfernen laeuft ueber den Dienstschluessel, weil GoTrue fuer das
    // Loeschen eines bestaetigten Faktors sonst eine Sitzung verlangt, die
    // diesen Faktor bereits benutzt hat. Genau die hat der Betroffene nicht.
    if (action === "admin_reset") {
      let zielUserId = String(body.zielUserId || "").trim();
      const zielEmail = String(body.email || "").trim().toLowerCase();
      if (!zielUserId && !zielEmail) {
        return new Response(JSON.stringify({ error: "zielUserId oder email erforderlich" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

      // Rolle des Aufrufers serverseitig pruefen. Ein ausgeblendeter Knopf ist
      // keine Zugriffskontrolle.
      const { data: rollen, error: rollenErr } = await admin
        .from("user_roles").select("role").eq("user_id", user.id);
      if (rollenErr) {
        return new Response(JSON.stringify({ error: "Berechtigung konnte nicht geprueft werden." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const darf = (rollen ?? []).some((r: any) => r.role === "admin" || r.role === "inhaber");
      if (!darf) {
        return new Response(JSON.stringify({ error: "Nur Admin und Inhaber duerfen die Zwei-Faktor-Anmeldung zuruecksetzen." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Aeltere Kontakte tragen keine `authUserId` in ihren Zusatzdaten, weil
      // sie vor deren Einfuehrung freigeschaltet wurden. Fuer sie wird ueber
      // die Mailadresse nachgeschlagen.
      if (!zielUserId) {
        const { data: profil } = await admin
          .from("profiles").select("id").ilike("email", zielEmail).maybeSingle();
        if (!profil?.id) {
          return new Response(JSON.stringify({ error: "Zu dieser Mailadresse gibt es kein Konto." }), {
            status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        zielUserId = profil.id;
      }

      // Das eigene Konto nie: Wer seinen Faktor verloren hat, nimmt einen
      // Wiederherstellungscode oder bittet die zweite Admin-Person.
      if (zielUserId === user.id) {
        return new Response(JSON.stringify({ error: "Die eigene Zwei-Faktor-Anmeldung kannst du hier nicht zuruecksetzen." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Faktoren des Zielnutzers holen und entfernen.
      let entfernt = 0;
      let fehlgeschlagen = 0;
      try {
        const { data: liste, error: listErr } = await (admin as any).auth.admin.mfa.listFactors({ userId: zielUserId });
        if (listErr) throw new Error(listErr.message);
        const faktoren = [...(liste?.factors ?? []), ...(liste?.all ?? []), ...(liste?.totp ?? [])];
        const gesehen = new Set<string>();
        for (const f of faktoren) {
          if (!f?.id || gesehen.has(f.id)) continue;
          gesehen.add(f.id);
          const { error: delErr } = await (admin as any).auth.admin.mfa.deleteFactor({
            userId: zielUserId, id: f.id,
          });
          if (delErr) {
            fehlgeschlagen++;
            console.error("admin_reset: deleteFactor failed", delErr.message);
          } else {
            entfernt++;
          }
        }
      } catch (e) {
        console.error("admin_reset: listFactors failed", e);
        return new Response(JSON.stringify({ error: "Die Faktoren konnten nicht gelesen werden." }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (fehlgeschlagen > 0 && entfernt === 0) {
        return new Response(JSON.stringify({
          code: "mfa_reset_fehlgeschlagen",
          error: "Die Zwei-Faktor-Anmeldung konnte nicht zurueckgesetzt werden.",
        }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Alte Recovery-Codes verfallen mit. Sonst koennte ein Zettel von frueher
      // den zuruckgesetzten Zugang erneut oeffnen.
      await admin.from("mfa_recovery_codes").delete().eq("user_id", zielUserId);

      await admin.from("audit_log").insert({
        actor: user.id,
        action: "mfa_admin_reset",
        entity: "auth.users",
        entity_id: zielUserId,
        meta: { entfernte_faktoren: entfernt, fehlgeschlagen },
      });

      return new Response(JSON.stringify({ success: true, entfernt, reenrollRequired: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unbekannte Aktion" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("manage-mfa error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
