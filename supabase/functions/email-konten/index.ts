/**
 * Mailkonto anlegen oder ändern (01.11.2026).
 *
 * {aktion: "speichern", id?, adresse, anzeigename?, imap_host, imap_port?,
 *  smtp_host?, smtp_port?, benutzername?, passwort?}
 *
 * Erst wird die Anmeldung am Server geprüft, dann gespeichert. Das Passwort
 * geht direkt in den Tresor und kommt nie zurück in den Browser. Beim Ändern
 * ohne neues Passwort bleibt das alte.
 */
import { antwort, corsHeaders, dienst, nutzerAus } from "../_shared/mail-anfrage.ts";
import { OAUTH, oauthEingerichtet, oauthRueckweg } from "../_shared/oauth.ts";
import { statusSignieren } from "../_shared/kalender-status.ts";
import { anmeldungPruefen, fehlerText, IMAP_PORTS, KONTO_SPALTEN, klein, kontoAbholen, passwortLesen, SMTP_PORTS, type MailKonto } from "../_shared/mailkonto.ts";

const HOST = /^[a-z0-9.-]+\.[a-z]{2,}$/i;
const ADRESSE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Nur die üblichen Mail-Ports; alles andere würde Verbindungen zu beliebigen Diensten erlauben. */
function port(wert: unknown, erlaubt: number[]): number {
  const n = Number(wert);
  return erlaubt.includes(n) ? n : erlaubt[0];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const nutzer = await nutzerAus(req);
  if (!nutzer) return antwort({ error: "Nicht angemeldet" }, 401);
  const b = await req.json().catch(() => ({}));

  // Gmail und Outlook über die Anmeldung beim Anbieter statt mit Passwort.
  if (b?.aktion === "oauth-status") return antwort({ google: oauthEingerichtet("google"), microsoft: oauthEingerichtet("microsoft") });
  if (b?.aktion === "oauth-start") {
    const art = b.art === "microsoft" ? "microsoft" : "google";
    if (!oauthEingerichtet(art)) return antwort({ error: "Diese Anmeldung ist noch nicht eingerichtet." }, 409);
    const herkunft = String(b.herkunft ?? "");
    if (!/^https?:\/\/[^/]+$/.test(herkunft)) return antwort({ error: "Ungültige Herkunft" }, 400);
    const o = OAUTH[art];
    const q = new URLSearchParams({
      client_id: o.id(), redirect_uri: oauthRueckweg(), response_type: "code", scope: o.scope.mail,
      state: await statusSignieren({ u: nutzer.id, a: art, z: "mail", o: herkunft }),
      ...(art === "google" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }),
    });
    return antwort({ url: `${o.auth}?${q}` });
  }
  if (b?.aktion !== "speichern") return antwort({ error: "Unbekannte Aktion" }, 400);

  const adresse = klein(b.adresse);
  const imap_host = String(b.imap_host ?? "").trim().toLowerCase();
  const smtp_host = String(b.smtp_host ?? "").trim().toLowerCase();
  if (!ADRESSE.test(adresse)) return antwort({ error: "Bitte eine gültige E-Mail-Adresse eingeben." }, 400);
  if (!HOST.test(imap_host)) return antwort({ error: "Bitte einen gültigen IMAP-Server eingeben, etwa imap.ionos.de." }, 400);
  if (smtp_host && !HOST.test(smtp_host)) return antwort({ error: "Bitte einen gültigen SMTP-Server eingeben, etwa smtp.ionos.de." }, 400);

  const admin = dienst();
  const felder = {
    adresse,
    anzeigename: String(b.anzeigename ?? "").trim() || null,
    imap_host,
    imap_port: port(b.imap_port, IMAP_PORTS),
    smtp_host: smtp_host || null,
    smtp_port: port(b.smtp_port, SMTP_PORTS),
    benutzername: String(b.benutzername ?? "").trim() || adresse,
  };

  let passwort = typeof b.passwort === "string" && b.passwort !== "" ? b.passwort : null;
  if (b.id) {
    const { data: alt } = await admin.from("email_konten").select("id, art").eq("id", b.id).eq("benutzer_id", nutzer.id).maybeSingle();
    if (!alt) return antwort({ error: "Konto nicht gefunden." }, 404);
    if (alt.art !== "imap") return antwort({ error: "Dieses Konto ist über die Anmeldung verbunden. Zum Ändern trennen und neu verbinden." }, 400);
    if (!passwort) passwort = await passwortLesen(admin, b.id).catch(() => null);
  }
  if (!passwort) return antwort({ error: "Bitte das Passwort oder App-Passwort eingeben." }, 400);

  try {
    await anmeldungPruefen(felder, passwort);
  } catch (e) {
    return antwort({ error: fehlerText(e) }, 422);
  }

  const { data: konto, error } = b.id
    ? await admin.from("email_konten").update({ ...felder, aktiv: true, letzter_fehler: null }).eq("id", b.id).select(KONTO_SPALTEN).single()
    : await admin.from("email_konten").insert({ ...felder, benutzer_id: nutzer.id }).select(KONTO_SPALTEN).single();
  if (error) {
    const doppelt = error.code === "23505";
    return antwort({ error: doppelt ? "Dieses Konto ist schon verbunden." : error.message }, doppelt ? 409 : 500);
  }
  const { error: tresor } = await admin.rpc("email_geheimnis_setzen", { _konto: konto.id, _wert: passwort });
  if (tresor) return antwort({ error: `Passwort konnte nicht sicher abgelegt werden: ${tresor.message}` }, 500);

  // Gleich einmal abholen, damit die Mails sofort da sind. Ein Fehler hier
  // macht das Konto nicht ungültig, er steht dann am Konto.
  let neu = 0;
  try {
    neu = (await kontoAbholen(admin, konto as MailKonto)).neu;
  } catch {
    // steht in letzter_fehler
  }
  return antwort({ ok: true, id: konto.id, neu });
});
