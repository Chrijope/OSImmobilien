/**
 * Rückweg der Anmeldung bei Google und Microsoft (01.11.2026).
 *
 * Öffentlich erreichbar (der Anbieter leitet ohne Anmeldetoken hierher),
 * deshalb zählt der signierte Status (kalender-status.ts). Abgeschlossen wird
 * die Verbindung erst mit der Anmeldung desselben Nutzers im CRM-Fenster.
 */
import { antwort, corsHeaders, dienst, nutzerAus } from "../_shared/mail-anfrage.ts";
import { type Verbindung } from "../_shared/kalender.ts";
import { adresseAusIdToken, oauthRueckweg, tokenHolen } from "../_shared/oauth.ts";
import { KONTO_SPALTEN, kontoAbholen, type MailKonto } from "../_shared/mailkonto.ts";
import { statusPruefen } from "../_shared/kalender-status.ts";

/**
 * Kleine Seite für das Anmeldefenster. Sie meldet nur Code und Status an das
 * CRM-Fenster, das die Anmeldung gestartet hat (signierte Herkunft). Getauscht
 * wird erst, wenn dieses Fenster mit der Anmeldung desselben Nutzers zurückruft
 * (POST unten). Ein untergeschobener Anmeldelink läuft so ins Leere: Ohne das
 * eigene CRM-Fenster als Öffner wird nichts verbunden, und mit einem fremden
 * Nutzer passt der Status nicht.
 */
function seite(ziel: string | null, nachricht: Record<string, string>, text: string, status = 200): Response {
  // In <script> nie ein rohes „<“, sonst ließe sich das Skript mit „</script>“ beenden.
  const js = (w: unknown) => JSON.stringify(w).replace(/</g, "\\u003c");
  const sicher = (s: string) => s.replace(/[<>&"']/g, (z) => `&#${z.charCodeAt(0)};`);
  const skript = ziel
    ? `<script>try{window.opener&&window.opener.postMessage(${js(nachricht)},${js(ziel)});}catch(e){}setTimeout(function(){window.close()},1500);</script>`
    : "";
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Anmeldung</title><body style="font-family:system-ui;padding:24px"><p>${sicher(text)}</p>${skript}</body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'" } },
  );
}

/** Gmail oder Outlook-Postfach: Konto anlegen, Token in den Tresor, gleich abholen. */
async function postfachVerbinden(status: { u: string; a: "google" | "microsoft" }, token: Awaited<ReturnType<typeof tokenHolen>>) {
  const adresse = adresseAusIdToken(token.id_token);
  if (!adresse) return antwort({ error: "Die Adresse des Postfachs war nicht lesbar." }, 422);
  const server = status.a === "google"
    ? { imap_host: "imap.gmail.com", imap_port: 993, smtp_host: "smtp.gmail.com", smtp_port: 465 }
    : { imap_host: "outlook.office365.com", imap_port: 993, smtp_host: "smtp.office365.com", smtp_port: 587 };
  const admin = dienst();
  const { data: konto, error } = await admin.from("email_konten")
    .upsert({ benutzer_id: status.u, art: status.a, adresse, benutzername: adresse, ...server, aktiv: true, letzter_fehler: null }, { onConflict: "benutzer_id,adresse" })
    .select(KONTO_SPALTEN).single();
  if (error) return antwort({ error: `Postfach nicht gespeichert: ${error.message}` }, 500);
  await admin.rpc("email_geheimnis_setzen", {
    _konto: konto.id,
    _wert: JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: token.expires_at }),
  });
  await kontoAbholen(admin, konto as MailKonto).catch(() => {});
  return antwort({ ok: true, text: `Postfach ${adresse} verbunden.` });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 1) Der Anbieter leitet das Anmeldefenster hierher: nur weitermelden.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const roh = url.searchParams.get("state");
    const status = await statusPruefen(roh);
    if (!status) return seite(null, {}, "Die Anmeldung ist abgelaufen oder ungültig. Bitte im CRM erneut starten.", 400);
    const code = url.searchParams.get("code");
    if (!code) return seite(status.o, { type: "kalender-fehler", text: "Die Anmeldung wurde abgebrochen." }, "Die Anmeldung wurde abgebrochen.");
    return seite(status.o, { type: "oauth-code", code, state: roh! }, "Anmeldung bestätigt. Das CRM schließt die Verbindung ab, dieses Fenster schließt sich.");
  }

  // 2) Das CRM-Fenster schließt ab, mit der Anmeldung des Nutzers.
  const nutzer = await nutzerAus(req);
  if (!nutzer) return antwort({ error: "Nicht angemeldet" }, 401);
  const b = await req.json().catch(() => ({}));
  const status = await statusPruefen(String(b.state ?? ""));
  if (!status || status.u !== nutzer.id) return antwort({ error: "Die Anmeldung gehört nicht zu diesem Konto oder ist abgelaufen." }, 403);
  if (typeof b.code !== "string" || !b.code) return antwort({ error: "Code fehlt" }, 400);

  try {
    const token = await tokenHolen(status.a, { grant_type: "authorization_code", code: b.code, redirect_uri: oauthRueckweg() });
    if (status.z === "mail") return await postfachVerbinden(status, token);
    let konto = "";
    let kalender: Verbindung["kalender"] = [];
    const kopf = { Authorization: `Bearer ${token.access_token}` };
    if (status.a === "google") {
      const ich = await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: kopf })).json();
      konto = ich.email ?? "Google";
      const liste = await (await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader", { headers: kopf })).json();
      // Nur die Kalender, die der Nutzer in Google auch anzeigt.
      // deno-lint-ignore no-explicit-any
      kalender = ((liste.items ?? []) as any[]).filter((c) => c.selected || c.primary).map((c) => ({ id: c.id, name: c.summary ?? c.id, primary: !!c.primary }));
    } else {
      const ich = await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: kopf })).json();
      konto = ich.mail ?? ich.userPrincipalName ?? "Microsoft";
      const liste = await (await fetch("https://graph.microsoft.com/v1.0/me/calendars", { headers: kopf })).json();
      // deno-lint-ignore no-explicit-any
      kalender = ((liste.value ?? []) as any[]).map((c) => ({ id: c.id, name: c.name, primary: !!c.isDefaultCalendar }));
    }
    const admin = dienst();
    const { data: v, error } = await admin.from("kalender_verbindungen")
      .upsert({ benutzer_id: nutzer.id, art: status.a, konto, kalender, letzter_fehler: null }, { onConflict: "benutzer_id,art,konto" })
      .select("id").single();
    if (error) throw new Error(error.message);
    await admin.rpc("kalender_geheimnis_setzen", { _verbindung: v.id, _wert: JSON.stringify({ access_token: token.access_token, refresh_token: token.refresh_token, expires_at: token.expires_at }) });
    // Der erste schreibbare Kalender wird Ziel für neue CRM-Termine.
    const { count } = await admin.from("kalender_verbindungen").select("id", { count: "exact", head: true }).eq("benutzer_id", nutzer.id).eq("schreibziel", true);
    if (!count) await admin.from("kalender_verbindungen").update({ schreibziel: true }).eq("id", v.id);
    return antwort({ ok: true, text: `${status.a === "google" ? "Google" : "Microsoft"}-Kalender verbunden.` });
  } catch (e) {
    return antwort({ error: `Verbinden fehlgeschlagen: ${String((e as Error)?.message ?? e).slice(0, 200)}` }, 502);
  }
});
