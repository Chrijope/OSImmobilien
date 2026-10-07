import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { verifyHmacSignature } from "../_shared/webhook-signature.ts";
import { logWebhook, type SignatureStatus } from "../_shared/webhook-audit.ts";
import { findeBeraterNachName } from "../_shared/berater-namensabgleich.ts";
import { logActivityFromEdge } from "../_shared/activity-log.ts";
import { findeKontaktDublette, type DublettenKandidat } from "../_shared/kontakt-dublette.ts";
import { baueMetaLeadEvent, istGueltigePixelId, sendeMetaLeadEvent } from "../_shared/meta-capi.ts";
import { ladeMetaPixelFreigabe, type FreigabeClient } from "../_shared/meta-pixel-freigabe.ts";
import {
  haengeMarketingNachweisAn,
  ohneEinwilligungsNachweise,
  pixelVerantwortlicherAus,
  pruefePartnerMarketingEinwilligung,
} from "../_shared/cookie-einwilligung.ts";
import {
  beraterAnzeigename,
  beurteileBeraterKennung,
  beurteileLinkKuerzel,
  fremdeDublettenMeldung,
  glockenPlanFuerLead,
  herkunftBezeichnung,
  hatBeraterRolle,
  istFremdeDublette,
  istInKaufphase,
  istRuhenderKontakt,
  istUuid,
  leadAntwort,
  leadHerkunft,
  pipelineStufeFuerLead,
  reaktivierungFuerAnfrage,
  zustaendigNachReaktivierung,
  waehleZuordnungsWeg,
  type KennungBefund,
} from "../_shared/lead-zuordnung.ts";
import { handbuchEinwilligungGueltig, leseEinwilligung } from "../_shared/lead-einwilligung.ts";
import { KUNDENSPRACHE_META, kundenSpracheMetaPatch, normalisiereSprache } from "../_shared/kunden-sprache.ts";
import { kampagneAusLeadFeldern, saeubereKampagne } from "../_shared/kampagne.ts";
import { nurErlaubteLeadMeta } from "../_shared/lead-meta-positivliste.ts";
import {
  crmFelder,
  ermittleAusgang,
  handbuchRahmen,
  HANDBUCH_QUELLE,
  leadNotiz as handbuchLeadNotiz,
  leadQualitaet as handbuchLeadQualitaet,
  neuesHandbuchToken,
  pruefeAntworten,
  bremsAdresse,
  istPlausibleTelefonnummer,
  type HandbuchAntworten,
} from "../_shared/handbuch-funnel.ts";
import {
  HANDBUCH_SA_OFFEN_NOTIZ,
  handbuchAntwort,
  handbuchDublettenAntwort,
  handbuchFunnelFuerDublette,
  handbuchNachLeadAnlegen,
  type HandbuchAnlageErgebnis,
} from "../_shared/handbuch-anlage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IMMOWELTEN_QUELLE = "Website Immowelten-Consult DE";

/**
 * Vereinheitlicht Meta/Facebook-Lead-Quellen auf das Format "Meta Ads: <Stadt>".
 * Lässt alle anderen Quellen (Empfehlung, TikTok, Funnel Lead, …) unverändert.
 */
function formatMetaQuelle(raw: string): string {
  if (!raw) return raw;
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const isMeta = lower.includes("meta") || lower.includes("facebook") || lower.includes("lead form");
  if (!isMeta) return trimmed;
  let city = "";
  // 1. Versuch: Stadt steht direkt nach "netto"
  const m = trimmed.match(/netto\s+([A-ZÄÖÜ][a-zäöüß\-]+)/i);
  if (m) city = m[1];
  // 2. Versuch: erstes großgeschriebenes Wort, das kein Stop-Wort ist
  if (!city) {
    const stop = new Set([
      "Meta","Ads","Lead","Form","Forms","Kampagne","Statis","Stat","Image",
      "Formular","Mit","Fragen","Netto","Final","Copy","Final-copy","Facebook",
    ]);
    const tokens = trimmed.replace(/[:\-–—,]/g, " ").split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (/^[A-ZÄÖÜ][a-zäöüß\-]+$/.test(t) && !stop.has(t)) { city = t; break; }
    }
  }
  return city ? `Meta Ads: ${city}` : trimmed;
}

/** Felder, die fuer die Dublettenpruefung reichen. Absichtlich ohne `meta`. */
const DUBLETTEN_FELDER = "id, vorname, nachname, email, telefon, geloescht";
const DUBLETTEN_SEITE = 1000;
const DUBLETTEN_MAX_SEITEN = 40;

/**
 * Laedt die Kontakte, gegen die geprueft wird.
 *
 * Der Vergleich der Telefonnummer laeuft ueber die reine Ziffernfolge. Diese
 * Form gibt es in der Datenbank nicht als eigene Spalte und damit auch nicht
 * als Filter, ohne dafuer eine Migration anzulegen. Deshalb werden die Zeilen
 * seitenweise geholt und im Code verglichen. Ausgewaehlt sind nur wenige
 * schmale Spalten, `meta` bleibt bewusst draussen.
 *
 * Nach `id` sortiert, damit die Seiten sich nicht ueberlappen oder Zeilen
 * ueberspringen, waehrend nebenher geschrieben wird.
 */
async function ladeDublettenKandidaten(
  supabaseAdmin: any,
): Promise<DublettenKandidat[]> {
  const kandidaten: DublettenKandidat[] = [];
  for (let seite = 0; seite < DUBLETTEN_MAX_SEITEN; seite++) {
    const von = seite * DUBLETTEN_SEITE;
    const { data, error } = await supabaseAdmin
      .from("kontakte")
      .select(DUBLETTEN_FELDER)
      .order("id", { ascending: true })
      .range(von, von + DUBLETTEN_SEITE - 1);
    if (error) throw new Error(error.message);
    const zeilen = (data || []) as any[];
    for (const zeile of zeilen) {
      // Geloeschte Kontakte duerfen keine neue Anfrage aufsaugen, sie sind in
      // keiner Arbeitsliste mehr sichtbar.
      if (zeile?.geloescht === true) continue;
      kandidaten.push(zeile as DublettenKandidat);
    }
    if (zeilen.length < DUBLETTEN_SEITE) break;
  }
  return kandidaten;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const t0 = Date.now();
  const ip = clientIp(req);
  const userAgent = req.headers.get("user-agent");
  let signatureStatus: SignatureStatus = "not_required";
  let signatureReason: string | null = null;
  let parsedPayload: unknown = null;

  try {
    const rawBody = await req.text();

    // Edge-Rate-Limit pro IP (Spam-/Bot-Schutz für öffentliches Lead-Formular)
    const rl = await checkEdgeRateLimit({ scope: "submit-lead", key: ip, perHour: 30, perDay: 200 });
    if (rl.exceeded) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 429, ip, user_agent: userAgent,
        signature_status: signatureStatus, error_message: "rate_limited", duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "rate_limited", message: "Zu viele Anfragen. Bitte später erneut versuchen." }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(rl.retryAfterSeconds ?? 3600),
          },
        },
      );
    }

    // Optionale HMAC-Signaturprüfung für Server-zu-Server-Aufrufe (z. B. Lead-API)
    if (req.headers.get("x-webhook-signature")) {
      const secret = Deno.env.get("INGEST_SHARED_SECRET");
      if (!secret) {
        signatureStatus = "invalid";
        signatureReason = "secret_not_configured";
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 500, ip, user_agent: userAgent,
          signature_status: signatureStatus, signature_reason: signatureReason,
          error_message: "signature_not_configured", duration_ms: Date.now() - t0,
        });
        return new Response(JSON.stringify({ error: "signature_not_configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await verifyHmacSignature(req, rawBody, secret);
      signatureStatus = result.valid ? "verified" : "invalid";
      signatureReason = result.reason ?? null;
      if (!result.valid) {
        console.warn("submit-lead: invalid signature", result.reason);
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 401, ip, user_agent: userAgent,
          signature_status: signatureStatus, signature_reason: signatureReason,
          payload: { rawPreview: rawBody.slice(0, 500) },
          error_message: "invalid_signature", duration_ms: Date.now() - t0,
        });
        return new Response(JSON.stringify({ error: "invalid_signature", reason: result.reason }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = JSON.parse(rawBody || "{}");
    parsedPayload = body;

    /* Honigtopf. Das Feld `hp` steht in den oeffentlichen Formularen
       ausserhalb des Bildschirms, ein Mensch sieht es nie und fuellt es nie.
       Ist es gefuellt, antworten wir freundlich und schreiben nichts: Der Bot
       soll nicht merken, dass er aufgefallen ist, sonst probiert er es gleich
       ohne das Feld noch einmal. Seit dem 18.09.2026, zuerst fuer den EXPATS
       Calculator, der als Anzeigenziel am meisten abbekommt. */
    if (typeof body?.hp === "string" && body.hp.trim().length > 0) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 200, ip, user_agent: userAgent,
        signature_status: signatureStatus, error_message: "honigtopf", duration_ms: Date.now() - t0,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let {
      vorname,
      nachname,
      email,
      telefon,
      notizen,
      strasse,
      hausnummer,
      plz,
      ort,
      position,
      quelle,
      beraterName,
      beraterUserId,
      finanzierbarkeit,
      termin_datum,
      termin_uhrzeit,
      qualZiel,
      qualEinkommen,
      qualEigenkapital,
      qualBeruflicheSituation,
      meta,
    } = body;

    // Nachweise der Pixel-Einwilligung entstehen nur aus der Pruefung auf dem
    // Server (DS-001). Was von aussen unter diesen Schluesseln kommt, fliegt
    // hier raus, bevor irgendetwas aus `meta` gebaut wird.
    meta = ohneEinwilligungsNachweise(meta);
    // Von `meta` kommt nur durch, was die Seiten wirklich schicken. Zugang,
    // Ersteller, Zustaendigkeit und aehnliches setzt allein der Server (A1
    // der Gegenpruefung vom 28.09.2026), siehe `_shared/lead-meta-positivliste.ts`.
    meta = nurErlaubteLeadMeta(meta);

    // Event-ID des Browser-Pixels fuer die Conversion-API-Deduplizierung.
    // Kommt nur mit, wenn der Besucher dem Pixel zugestimmt hat.
    const metaEventId: unknown = body.metaEventId;

    /*
     * ─── Kampagnenkennungen pruefen ─────────────────────────
     *
     * `meta` wird weiter unten ungefiltert in den Kontakt ausgebreitet. Die
     * Kampagnenkennungen stammen aber aus der Adresse einer oeffentlichen
     * Seite und damit von aussen. Sie werden deshalb hier auf die sieben
     * bekannten Felder, den erlaubten Zeichenvorrat und eine feste
     * Hoechstlaenge zurechtgestutzt, siehe `_shared/kampagne.ts`. Bleibt
     * nichts uebrig, verschwindet das Feld ganz, statt als Rest liegen zu
     * bleiben. Das gilt fuer beide Wege, den neuen Kontakt wie die Dublette.
     */
    if (meta && typeof meta === "object") {
      const gepruefteKampagne = saeubereKampagne((meta as any).kampagne);
      if (gepruefteKampagne) (meta as any).kampagne = gepruefteKampagne;
      else delete (meta as any).kampagne;
    }

    /*
     * Formularleads von Meta ueber Zapier haben keine Adresse und damit keine
     * UTM-Parameter. Liefert der Zap Kampagnen-, Anzeigengruppen- oder
     * Anzeigennamen mit, werden sie zur Kampagnenkennung, in derselben
     * Aufteilung wie beim Werbelink (`_shared/kampagne.ts`). Eine Kennung
     * aus dem Browser hat Vorrang. Fehlt beides, bleibt das Feld leer.
     */
    if (!(meta && typeof meta === "object" && (meta as any).kampagne)) {
      const ausLeadFeldern = kampagneAusLeadFeldern(body);
      if (ausLeadFeldern) {
        meta = { ...(meta && typeof meta === "object" ? meta : {}), kampagne: ausLeadFeldern };
      }
    }

    /*
     * Die Cookie-Einwilligung des Besuchers, wie der Browser sie mitschickt.
     * Geprueft wird sie weiter unten, sobald der Partner feststeht
     * (`marketingNachweis`). Fehlt sie (Zapier, aeltere Seiten), gilt sie als
     * nicht erteilt.
     */
    const cookieEinwilligung = (body as any)?.cookieEinwilligung;

    /*
     * ─── Handbuch-Seite (seit dem 26.09.2026) ─────────────────
     *
     * Kommt der Lead aus dem Konfigurator der Handbuch-Seite, schickt der
     * Browser die sechs Antworten in `handbuchFunnel.antworten`. Der Server
     * prueft sie gegen die bekannten Werte und rechnet Ausgang, Rahmen und
     * die Felder am Kontakt selbst nach (`_shared/handbuch-funnel.ts`), statt
     * den Zahlen aus dem Browser zu glauben. Quelle, Notiz und
     * Qualifizierungsfelder kommen deshalb von hier.
     *
     * Zwei Dinge sind auf diesem Weg anders:
     *   - Die Handynummer ist Pflicht und wird auf Plausibilitaet geprueft (seit 26.09.2026, vorher freiwillig).
     *   - Eine Zeitfalle: Wer den ganzen Konfigurator in unter drei Sekunden
     *     durchlaeuft, ist kein Mensch. Er bekommt dieselbe freundliche Antwort
     *     wie beim Honigtopf, geschrieben wird nichts.
     *
     * Dazu seit dem 26.09.2026 die OFFENE Selbstauskunft der Handbuch-Seite
     * (/handbuch/selbstauskunft, ohne Token): Der Browser schickt nur Name,
     * E-Mail, Einwilligung und `handbuchSelbstauskunft: { dauerMs }`. Es gilt
     * alles wie beim Konfigurator (Quelle, Partner nur aus dem Kuerzel,
     * Bremse je Adresse, Zeitfalle, Honigtopf), nur ohne Antworten und ohne
     * Handbuch. Heraus kommt die Standard-Selbstauskunft (`/sa/:token`, wie
     * „An Kunde senden“): fuer einen NEUEN Kontakt der Link an den Browser und
     * per Mail, fuer eine ueber die E-Mail erkannte Dublette nur per Mail an
     * die gespeicherte Adresse, siehe `handbuchNachLeadAnlegen`.
     */
    const handbuchRoh = (body as any)?.handbuchFunnel;
    const hbAntworten: HandbuchAntworten | null = handbuchRoh ? pruefeAntworten(handbuchRoh.antworten) : null;
    const saOffenRoh = (body as any)?.handbuchSelbstauskunft;
    const hbSaOffen = !handbuchRoh && !!saOffenRoh && typeof saOffenRoh === "object";
    // Einer der beiden Wege der Handbuch-Seite. Fuer alles, was beide teilen.
    const hbWeg = !!hbAntworten || hbSaOffen;
    if (handbuchRoh && !hbAntworten) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
        signature_status: signatureStatus, error_message: "handbuch_antworten_ungueltig", duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "Antworten ungültig" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (hbWeg) {
      const dauer = Number(hbAntworten ? handbuchRoh?.dauerMs : saOffenRoh?.dauerMs);
      if (Number.isFinite(dauer) && dauer >= 0 && dauer < 3000) {
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 200, ip, user_agent: userAgent,
          signature_status: signatureStatus, error_message: hbAntworten ? "handbuch_zeitfalle" : "handbuch_sa_zeitfalle", duration_ms: Date.now() - t0,
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      /*
       * Ohne gueltige Einwilligung weder Kontakt noch Mail (Befund HB-007).
       * Im Browser ist der Haken Pflicht, hier wird es erzwungen: Ein selbst
       * gebauter Aufruf ohne Haken bekommt 400, und es passiert nichts.
       * Fassungen siehe HANDBUCH_FASSUNGEN in `_shared/lead-einwilligung.ts`.
       */
      if (!handbuchEinwilligungGueltig((body as any)?.dsgvo_consent, hbAntworten ? "konfigurator" : "selbstauskunft")) {
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
          signature_status: signatureStatus, error_message: "handbuch_einwilligung_fehlt", duration_ms: Date.now() - t0,
        });
        return new Response(
          JSON.stringify({ error: "Einwilligung fehlt", message: "Bitte bestätigen Sie die Einwilligung." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    // Das Token entsteht hier, damit es schon am Kontakt steht, bevor die
    // Zeile in `handbuch_anforderungen` angelegt ist.
    const hbToken = hbAntworten ? neuesHandbuchToken() : "";
    if (hbAntworten) {
      const felder = crmFelder(hbAntworten);
      const rahmen = handbuchRahmen(hbAntworten);
      quelle = HANDBUCH_QUELLE;
      qualZiel = felder.qualZiel;
      qualBeruflicheSituation = felder.qualBeruflicheSituation;
      qualEinkommen = felder.qualEinkommen;
      qualEigenkapital = felder.qualEigenkapital;
      finanzierbarkeit = felder.finanzierbarkeit;
      notizen = handbuchLeadNotiz(hbAntworten);
      // Von `meta` zaehlt auf diesem Weg nur die Kampagnenkennung (schon oben
      // gesaeubert). Alles andere, etwa `erstelltVonId`, setzt der Server.
      // Sonst koennte ein selbst gebauter Aufruf einen Lead einem Partner
      // zuschanzen, der ihn per Zeilensicherheit dauerhaft saehe.
      const kampagneAusBrowser = meta && typeof meta === "object" ? (meta as Record<string, unknown>).kampagne : undefined;
      // Ebenso entscheidet allein das Kuerzel ueber den Partner, kein Name und
      // keine Kennung aus dem Rumpf.
      beraterName = "";
      beraterUserId = undefined;
      meta = {
        ...(kampagneAusBrowser ? { kampagne: kampagneAusBrowser } : {}),
        leadQuality: handbuchLeadQualitaet(hbAntworten),
        handbuchFunnel: {
          antworten: hbAntworten,
          ausgang: ermittleAusgang(hbAntworten),
          rahmen: { von: rahmen.von, bis: rahmen.bis, empf: rahmen.empf },
          zeitpunkt: new Date().toISOString(),
          token: hbToken,
        },
      };
    }
    if (hbSaOffen) {
      quelle = HANDBUCH_QUELLE;
      notizen = HANDBUCH_SA_OFFEN_NOTIZ;
      // Dieselbe Strenge wie beim Konfigurator: von `meta` nur die Kampagne,
      // Partner allein ueber das Kuerzel.
      const kampagneAusBrowser = meta && typeof meta === "object" ? (meta as Record<string, unknown>).kampagne : undefined;
      beraterName = "";
      beraterUserId = undefined;
      finanzierbarkeit = undefined;
      qualZiel = undefined;
      qualEinkommen = undefined;
      qualEigenkapital = undefined;
      qualBeruflicheSituation = undefined;
      meta = {
        ...(kampagneAusBrowser ? { kampagne: kampagneAusBrowser } : {}),
        handbuchSelbstauskunft: { zeitpunkt: new Date().toISOString() },
      };
    }

    // ─── Meta Lead Ads / Zapier Aliase ──────────────────────
    // Meta liefert nur "Full Name" – splitten falls vorname/nachname leer.
    // Akzeptiere auch alternative Feldnamen ("phone number", "phone", "first_name" etc.)
    const pickStr = (...keys: string[]): string => {
      for (const k of keys) {
        const v = (body as any)?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number") return String(v);
      }
      return "";
    };
    if (!vorname || !nachname) {
      const fullName = pickStr("full_name", "fullName", "Full Name", "name");
      if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (!vorname) vorname = parts[0] || "";
        if (!nachname) nachname = parts.length > 1 ? parts.slice(1).join(" ") : "";
      }
    }
    if (!telefon) {
      telefon = pickStr("phone number", "phone_number", "phone", "phoneNumber", "mobile", "handy");
    }
    if (!email) {
      email = pickStr("email_address", "e_mail", "Email");
    }
    if (!vorname) vorname = pickStr("first_name", "firstName", "given_name");
    if (!nachname) nachname = pickStr("last_name", "lastName", "family_name");

    // Hat der Kunde im Meta-Formular nur einen einzelnen Namen eingetragen
    // (z. B. nur "Bernd"), wird der Lead trotzdem angenommen und der fehlende
    // Teil bleibt leer, in der Lead-Verwaltung ergaenzbar. Bis zum 04.10.2026
    // stand dort ein Gedankenstrich, der in Anrede und Mails landete.
    if (typeof vorname !== "string") vorname = "";
    if (typeof nachname !== "string") nachname = "";

    // Auf der Handbuch-Seite ist die Handynummer seit dem 26.09.2026 Pflicht
    // (der Berater ruft nach dem Handbuch einmal kurz an). Sie muss plausibel
    // aussehen; die Pruefung steht in `istPlausibleTelefonnummer`.
    if (hbWeg && typeof telefon !== "string") telefon = "";
    if (hbWeg && !istPlausibleTelefonnummer(telefon)) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
        signature_status: signatureStatus, error_message: "handbuch_telefon_ungueltig", duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "Telefon ungültig", message: "Bitte geben Sie eine gültige Handynummer an." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /*
     * Handbuch-Seite: Namen stehen in der Anrede der Zustellmail. Damit
     * niemand ueber das Formular Mails mit eigenem Text oder Link an fremde
     * Adressen schickt, sind sie begrenzt und duerfen keine Adresse enthalten.
     */
    if (hbWeg) {
      const unzulaessig = (n: unknown) =>
        typeof n === "string" && (n.trim().length > 60 || /https?:|www\.|@|<|>/i.test(n));
      if (unzulaessig(vorname) || unzulaessig(nachname)) {
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
          signature_status: signatureStatus, error_message: "handbuch_name_unzulaessig", duration_ms: Date.now() - t0,
        });
        return new Response(
          JSON.stringify({ error: "Name ungültig", message: "Bitte geben Sie Ihren Vor- und Nachnamen ohne Links an." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Basic validation – Vorname ODER Nachname muss vorhanden sein, sowie Email + Telefon.
    if ((!vorname?.trim() && !nachname?.trim()) || !email?.trim() || !telefon?.trim()) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason, payload: parsedPayload,
        error_message: "Pflichtfelder fehlen", duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "Pflichtfelder fehlen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 400, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason, payload: parsedPayload,
        error_message: "Ungültige E-Mail-Adresse", duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "Ungültige E-Mail-Adresse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
     * Handbuch-Seite: hoechstens fuenf Anforderungen je Stunde und zehn je Tag
     * an dieselbe Adresse. Sonst liesse sich ueber das Formular eine fremde
     * Adresse mit Handbuch-Mails zuschuetten. Die Adresse steht dabei nur als
     * Pruefsumme in der Tabelle der Bremse, nicht im Klartext.
     */
    if (hbWeg) {
      // Plus-Adressen und Gmail-Punkte zaehlen als dieselbe Adresse, sonst
      // liesse sich die Bremse mit name+1@, name+2@ umgehen.
      const roh = new TextEncoder().encode(bremsAdresse(email));
      const summe = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", roh)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const bremseMail = await checkEdgeRateLimit({ scope: "handbuch-email", key: `mail:${summe}`, perHour: 5, perDay: 10 });
      if (bremseMail.exceeded) {
        await logWebhook({
          source: "submit-lead", method: req.method, status_code: 429, ip, user_agent: userAgent,
          signature_status: signatureStatus, error_message: "handbuch_rate_limited_email", duration_ms: Date.now() - t0,
        });
        return new Response(
          JSON.stringify({ error: "rate_limited", message: "Für diese Adresse wurden gerade schon mehrere Handbücher angefordert. Bitte versuchen Sie es später noch einmal." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(bremseMail.retryAfterSeconds ?? 3600) } },
        );
      }
    }

    // Service role bypasses RLS – needed for anonymous public submissions
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── Termin-Lead Erkennung ───────────────────────────────
    // Beide Bedingungen müssen zutreffen:
    // 1. Quelle = "Website Immowelten-Consult DE"
    // 2. notizen beginnt mit "Terminbuchung" ODER termin_datum vorhanden
    const isImmowelten = (typeof quelle === "string" && quelle.trim() === IMMOWELTEN_QUELLE);
    const hasTerminMarker =
      (typeof notizen === "string" && notizen.trim().toLowerCase().startsWith("terminbuchung")) ||
      (typeof termin_datum === "string" && termin_datum.trim().length > 0);
    const isTerminLead = isImmowelten && hasTerminMarker;

    // ─── Berater-Zuweisung ──────────────────────────────────
    // 1. Das Link-Kürzel (`beraterSlug`) hat Vorrang, der Server ermittelt den
    //    Partner selbst daraus. Nur ohne Kürzel zählt eine mitgeschickte
    //    `beraterUserId` (alter Link mit `?b=`), und auch die erst, nachdem
    //    sie serverseitig geprüft wurde, siehe unten. Ungeprüft übernommen
    //    konnte jeder, der eine fremde Nutzerkennung kennt, Leads im Namen
    //    eines anderen Partners anlegen.
    // 2. Sonst: Lead landet UNZUGEWIESEN im offenen Pool (zustaendig_id = NULL,
    //    meta.offenerLead = true). Setter/Admins claimen den Lead via
    //    claim_lead RPC (Erstkontakt oder „Übernehmen"-Button). KEIN
    //    Auto-Fallback mehr auf Christian Peetz – das verhindert das
    //    Single-Point-of-Failure und verteilt die Last über alle Setter.
    // 3. Kommt nur ein beraterName ohne ID, wird der Name unten gegen die
    //    Profile geprüft. Nur ein eindeutiger Treffer weist zu, sonst bleibt der
    //    Lead im offenen Pool.
    // Die Zuweisung erfolgt sonst manuell in der Lead-Verwaltung über den
    // „Zuweisen"-Button.
    /*
     * ─── Seit dem 24.09.2026: Der Server ermittelt den Partner aus dem Link ───
     *
     * Die persoenlichen Links (/steuer/<kuerzel>, /analyse/<kuerzel>,
     * /vp/<kuerzel>) schicken jetzt das Kuerzel als `beraterSlug` mit. Der
     * Partner wird HIER daraus ermittelt, nicht aus der `beraterUserId`, die
     * der Browser nach der Aufloesung zurueckschickt. Kommt beides, gewinnt
     * das Kuerzel, und eine abweichende Kennung wird nur protokolliert.
     *
     * Nur wo gar kein Kuerzel kommt, gilt die Kennung weiter. Das ist der alte
     * Linktyp `?b=`, der bereits verschickt ist und nicht ins Leere laufen
     * soll. Er wird im Log als "alter Link" gekennzeichnet. Die Regel steht in
     * `waehleZuordnungsWeg` in `lead-zuordnung.ts`.
     */
    const zuordnungsWeg = waehleZuordnungsWeg({
      beraterSlug: (body as any)?.beraterSlug,
      beraterUserId,
    });

    let zustaendigId: string | null =
      zuordnungsWeg.weg === "alter_link" ? zuordnungsWeg.kennung : null;
    let beraterFinal: string =
      typeof beraterName === "string" && beraterName.trim()
        ? beraterName.trim()
        : "";

    // Eine verworfene Kennung wird am Kontakt vermerkt, damit spaeter
    // nachvollziehbar ist, was der Absender behauptet hat.
    let verworfeneBeraterId = "";
    let verworfenerBefund = "";
    let verworfenesKuerzel = "";
    // Ein Name, der mit einem Kuerzel kam, weist nichts zu. Er bleibt nur als
    // Hinweis stehen, wenn das Kuerzel nicht aufging.
    let beraterHinweis = "";

    if (zuordnungsWeg.weg === "link_kuerzel") {
      // Auf diesem Weg entscheidet allein das Kuerzel. Der mitgeschickte Name
      // geht deshalb NICHT in den Namensabgleich weiter unten: Ein Lead mit
      // unbekanntem Kuerzel landet unzugewiesen bei der Leitung, so wie ein
      // Lead ohne Partner.
      const gelieferterName = beraterFinal;
      beraterFinal = "";
      let befund: KennungBefund = "kuerzel_ungueltig";
      let linkInhaber: { id: string; name: string | null } | null = null;
      if (zuordnungsWeg.kuerzelGueltig) {
        try {
          const { data: kuerzelProfil, error: kuerzelFehler } = await supabaseAdmin
            .from("profiles")
            .select("id, name, gesperrt")
            .eq("vp_slug", zuordnungsWeg.kuerzel)
            .maybeSingle();
          if (kuerzelFehler) throw new Error(kuerzelFehler.message);

          let kuerzelRollen: Array<{ role?: unknown }> | null = null;
          if (kuerzelProfil?.id) {
            const { data: rollenZeilen, error: rollenFehler } = await supabaseAdmin
              .from("user_roles")
              .select("role")
              .eq("user_id", kuerzelProfil.id);
            if (rollenFehler) throw new Error(rollenFehler.message);
            kuerzelRollen = rollenZeilen as Array<{ role?: unknown }> | null;
          }

          befund = beurteileLinkKuerzel({
            kuerzelGueltig: true,
            profil: kuerzelProfil,
            rollen: kuerzelRollen,
          });
          if (befund === "ok" && kuerzelProfil?.id) {
            linkInhaber = { id: String(kuerzelProfil.id), name: kuerzelProfil.name ?? null };
          }
        } catch (e) {
          // Wie bei der Kennung: lieber im Pool als beim falschen Partner.
          console.error("Link-Kuerzel: Pruefung fehlgeschlagen:", e);
          befund = "kuerzel_unbekannt";
        }
      }

      if (linkInhaber) {
        zustaendigId = linkInhaber.id;
        beraterFinal = beraterAnzeigename({ profilName: linkInhaber.name, gelieferterName });
      } else {
        verworfenesKuerzel = zuordnungsWeg.kuerzel;
        verworfenerBefund = befund;
        if (gelieferterName) beraterHinweis = gelieferterName;
        await logWebhook({
          source: "submit-lead",
          event: "berater_kuerzel_verworfen",
          method: req.method,
          ip,
          user_agent: userAgent,
          signature_status: signatureStatus,
          signature_reason: signatureReason,
          payload: { beraterSlug: zuordnungsWeg.kuerzel, befund, quelle: quelle ?? null },
          error_message: `Link-Kürzel ungültig oder unbekannt (${befund}), Lead geht unzugewiesen an die Leitung`,
          duration_ms: Date.now() - t0,
        });
        console.warn(`submit-lead: Link-Kuerzel verworfen (${befund}) für ${zuordnungsWeg.kuerzel}`);
      }

      // Eine mitgeschickte Kennung, die nicht zum Kuerzel passt, gibt keinen
      // Ausschlag. Sie wird festgehalten, weil sie auf eine von Hand gebaute
      // Anfrage hindeuten kann.
      if (zuordnungsWeg.mitgeschickteKennung && zuordnungsWeg.mitgeschickteKennung !== zustaendigId) {
        await logWebhook({
          source: "submit-lead",
          event: "berater_kennung_ignoriert",
          method: req.method,
          ip,
          user_agent: userAgent,
          signature_status: signatureStatus,
          signature_reason: signatureReason,
          payload: {
            beraterSlug: zuordnungsWeg.kuerzel,
            beraterUserId: zuordnungsWeg.mitgeschickteKennung,
            ermittelt: zustaendigId,
            quelle: quelle ?? null,
          },
          error_message: "Mitgeschickte Beraterkennung ignoriert, das Link-Kürzel entscheidet",
          duration_ms: Date.now() - t0,
        });
      }
    }

    if (zuordnungsWeg.weg === "alter_link") {
      // Bereits verschickte Links mit `?b=` tragen die Kennung offen im Link.
      // Sie laufen weiter, werden aber sichtbar gekennzeichnet, damit sich
      // ablesen laesst, wann keiner mehr hereinkommt.
      await logWebhook({
        source: "submit-lead",
        event: "berater_alter_link",
        method: req.method,
        ip,
        user_agent: userAgent,
        signature_status: signatureStatus,
        signature_reason: signatureReason,
        payload: { beraterUserId: zuordnungsWeg.kennung, quelle: quelle ?? null },
        error_message: "alter Link: Partner über die Kennung statt über das Link-Kürzel zugeordnet",
        duration_ms: Date.now() - t0,
      });
    }

    /*
     * ─── Die mitgeschickte Kennung wird geprueft ───────────
     *
     * Der alte Linktyp `/analyse?b=<base64>` traegt die Nutzerkennung des
     * Partners offen in der Adresse mit. Sie war bisher zugleich der Beleg
     * dafuer, dass der Lead diesem Partner gehoert, und das war keiner: Wer
     * eine fremde Kennung kannte oder eine raten wollte, konnte damit Leads
     * unter fremdem Namen anlegen.
     *
     * Deshalb wird jetzt serverseitig geprueft, ob die Kennung ueberhaupt zu
     * einem nicht gesperrten Profil mit Beraterrolle gehoert. Dieselbe
     * Rollenliste wie in `get-vp-microsite`, sie steht in `lead-zuordnung.ts`.
     *
     * Wichtig fuer den Bestand: Stimmt die Kennung, funktioniert der alte Link
     * unveraendert weiter. Verworfen werden nur erfundene Kennungen. Ein
     * verworfener Lead geht nicht verloren, er landet dort, wo er auch ohne
     * Kennung gelandet waere, also im offenen Pool und nicht bei einem
     * fremden Partner.
     *
     * Seit dem 24.09.2026 laeuft diese Pruefung nur noch fuer den alten Link.
     * Beim Link-Kuerzel ist der Partner oben bereits serverseitig ermittelt.
     */
    if (zuordnungsWeg.weg === "alter_link" && zustaendigId) {
      const gelieferteKennung = zustaendigId;
      let befund: KennungBefund = "kein_uuid_format";
      if (istUuid(gelieferteKennung)) {
        try {
          const { data: kennungProfil, error: kennungFehler } = await supabaseAdmin
            .from("profiles")
            .select("id, name, gesperrt")
            .eq("id", gelieferteKennung)
            .maybeSingle();
          if (kennungFehler) throw new Error(kennungFehler.message);

          const { data: kennungRollen, error: rollenFehler } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", gelieferteKennung);
          if (rollenFehler) throw new Error(rollenFehler.message);

          befund = beurteileBeraterKennung({
            kennung: gelieferteKennung,
            profil: kennungProfil,
            rollen: kennungRollen,
          });
          /*
           * Der Name kommt aus dem Profil, nicht aus dem Anfragekoerper.
           *
           * Er landet in der Spalte `berater` und damit im Kundenprofil unter
           * Stammdaten in der Zeile "Vertriebspartner". Frueher gewann der
           * mitgeschickte `beraterName`, ein freier Text aus einem
           * oeffentlichen Formular. Stimmte er nicht genau mit dem Profilnamen
           * ueberein, stand in den Stammdaten ein anderer Name als der, dem
           * der Lead ueber `zustaendig_id` tatsaechlich gehoert. Schlimmer
           * noch: Das Kundenprofil vergleicht an mehreren Stellen
           * `kunde.berater` mit dem eigenen Namen, um die eigenen Kunden zu
           * erkennen. Bei abweichender Schreibweise verlor der Partner die
           * Rechte an seinem eigenen Lead.
           *
           * Steht im Profil kein Name, bleibt der gelieferte als Notnagel.
           */
          if (befund === "ok") {
            beraterFinal = beraterAnzeigename({
              profilName: kennungProfil?.name,
              gelieferterName: beraterFinal,
            });
          }
        } catch (e) {
          // Die Pruefung konnte nicht durchgefuehrt werden. Dann gilt die
          // sichere Seite: keine Zuweisung. Ein Lead im offenen Pool ist
          // sichtbar und einholbar, ein Lead beim falschen Partner nicht.
          console.error("Berater-Kennung: Pruefung fehlgeschlagen:", e);
          befund = "profil_unbekannt";
        }
      }

      if (befund !== "ok") {
        zustaendigId = null;
        // Der gelieferte Name allein weist nichts zu, er geht weiter unten in
        // den Namensabgleich und wird sonst nur als Hinweis vermerkt.
        await logWebhook({
          source: "submit-lead",
          event: "berater_kennung_verworfen",
          method: req.method,
          ip,
          user_agent: userAgent,
          signature_status: signatureStatus,
          signature_reason: signatureReason,
          payload: { beraterUserId: gelieferteKennung, befund, quelle: quelle ?? null },
          error_message: `berater_kennung_${befund}`,
          duration_ms: Date.now() - t0,
        });
        console.warn(
          `submit-lead: Beraterkennung verworfen (${befund}) für ${gelieferteKennung}`,
        );
        verworfeneBeraterId = gelieferteKennung;
        verworfenerBefund = befund;
      }
    }

    // Kam der Zustaendige ausdruecklich als ID mit (Microseite, Analysetool)
    // UND hat die Pruefung bestanden? Nur solche Leads bekommen weiter unten
    // die Microseiten-Bestaetigungsmail.
    const zustaendigAusUebergebenerId = !!zustaendigId;

    /*
     * ─── Auf welchem Weg kam der Lead herein? ───────────────
     *
     * Genau hier verlaeuft die Trennlinie des Geschaeftsfuehrers zwischen den
     * Kampagnen des Hauses und den persoenlichen Wegen der Partner. Sie haengt
     * allein an der oben GEPRUEFTEN Beraterkennung, also an einem
     * personalisierten Link. Die Begruendung, warum weder `quelle` noch `meta`
     * noch der Beraternamen dafuer taugen, steht in `lead-zuordnung.ts`.
     *
     * Wichtig: Diese Zeile steht VOR dem Namensabgleich weiter unten. Der darf
     * die Zustaendigkeit noch setzen, aber die Herkunft nicht mehr aendern.
     */
    const herkunft = leadHerkunft({ beraterKennungGeprueft: zustaendigAusUebergebenerId });
    const persoenlicherPartnerWeg = herkunft === "partner_persoenlich";

    // Fuer die Meta-Conversion zaehlt der Partner, auf dessen Landingpage der
    // Besucher war, also die ausdruecklich uebergebene ID. Ein spaeterer
    // Namensabgleich aendert daran nichts.
    const metaPixelPartnerId: string | null = zustaendigAusUebergebenerId ? zustaendigId : null;

    /*
     * Die Marketing-Einwilligung fuer das Pixel GENAU dieses Partners, gegen
     * die gueltigen Fassungen des Cookie-Hinweises, einen plausiblen Zeitpunkt
     * und die Partnerkennung geprueft (`_shared/cookie-einwilligung.ts`). Nur
     * mit Nachweis geht etwas an die Meta Conversion-API. Der Nachweis steht
     * am Lead (`meta.marketingEinwilligung`), nicht im Log. Einen Wert gleichen
     * Namens aus dem Browser gibt es nicht, er wird verworfen.
     */
    // Die offene Selbstauskunft der Handbuch-Seite meldet nie an Meta
    // (27.09.2026, Punkt 6, Anlage 4 § 1 Abs. 1): Dort laedt kein Pixel, also
    // gibt es auch keinen Nachweis und keine Conversion, egal was mitkommt.
    const marketingNachweis = hbSaOffen
      ? null
      : pruefePartnerMarketingEinwilligung(cookieEinwilligung, metaPixelPartnerId);
    if (marketingNachweis) {
      meta = { ...(meta && typeof meta === "object" ? meta : {}), marketingEinwilligung: marketingNachweis };
    }

    // Den Namen zur geprueften Kennung holt bereits die Pruefung oben aus dem
    // Profil, eine zweite Abfrage braucht es hier nicht mehr.

    // Gegenrichtung: nur ein Name kam mit, keine ID. Ohne `zustaendig_id` darf
    // per RLS niemand den Lead sehen, gleichzeitig faellt er wegen des gesetzten
    // Namens aus dem offenen Pool. Der Lead waere dann in keiner Arbeitsliste.
    // Deshalb den Namen gegen die Profile pruefen und daraus eine echte
    // Zustaendigkeit machen.
    if (!zustaendigId && beraterFinal) {
      const gelieferterName = beraterFinal;
      let profile: { id: string; name: string | null }[] = [];
      try {
        const { data: profilRows, error: profilErr } = await supabaseAdmin
          .from("profiles")
          .select("id, name, gesperrt");
        if (profilErr) {
          // Ohne Profile gibt es keinen Treffer. Der Lead landet dann im Pool,
          // das ist die sichere Seite, muss aber sichtbar sein.
          console.error("Berater-Namensabgleich: profiles-Abfrage fehlgeschlagen:", profilErr.message);
        }
        // Gesperrte Nutzer koennen den Lead nicht bearbeiten, sie sind kein Treffer.
        profile = ((profilRows || []) as any[])
          .filter((p) => !p.gesperrt)
          .map((p) => ({ id: String(p.id), name: p.name ?? null }));
      } catch (e) {
        console.error("Berater-Namensabgleich: profiles konnten nicht geladen werden:", e);
      }

      const treffer = findeBeraterNachName(gelieferterName, profile);
      if (treffer.art === "eindeutig") {
        zustaendigId = treffer.id;
        beraterFinal = treffer.name;
      } else {
        // Kein oder kein eindeutiger Treffer: der Lead gehoert sauber in den
        // offenen Pool. Den gelieferten Namen nicht ins Feld `berater`
        // schreiben, sondern nur als Hinweis in meta festhalten, damit
        // nachvollziehbar bleibt, wen der Zulieferer gemeint hat.
        beraterFinal = "";
        beraterHinweis = gelieferterName;
        await logWebhook({
          source: "submit-lead",
          event: "berater_name_unzuordenbar",
          method: req.method,
          ip,
          user_agent: userAgent,
          signature_status: signatureStatus,
          signature_reason: signatureReason,
          payload: {
            beraterName: gelieferterName,
            treffer: treffer.art,
            anzahl: treffer.art === "mehrdeutig" ? treffer.anzahl : 0,
          },
          error_message:
            treffer.art === "mehrdeutig" ? "berater_name_mehrdeutig" : "berater_name_unbekannt",
          duration_ms: Date.now() - t0,
        });
      }
    }


    // ─── Meta zusammenbauen ─────────────────────────────────
    const baseMeta: Record<string, unknown> = {
      leadTyp: isTerminLead ? "erstgespraech" : "meta",
      ...(meta || {}),
    };

    /*
     * ─── Die Stufe steht an genau einer Stelle ──────────────
     *
     * Die Regel selbst liegt in `lead-zuordnung.ts`, dort ist auch begruendet,
     * warum die Trennlinie an der geprueften Beraterkennung haengt. Hier wird
     * sie nur angewandt, und zwar nach dem Ausbreiten von `meta`, damit ein
     * oeffentliches Formular sie nicht mit einer eigenen Vorgabe aushebeln
     * kann.
     */
    (baseMeta as any).pipelineStufe = pipelineStufeFuerLead({
      istTerminLead: isTerminLead,
      persoenlicherPartnerWeg,
      vorgabe: (meta as any)?.pipelineStufe,
    });
    // Damit spaeter ohne Ratespiel ablesbar ist, welcher der beiden Wege es war.
    (baseMeta as any).leadHerkunft = herkunft;
    if ((baseMeta as any).pipelineStufe === "zugewiesen" && !(baseMeta as any).zugewiesenAm) {
      (baseMeta as any).zugewiesenAm = new Date().toISOString();
    }
    // Top-Level Qualifizierungsfelder aus Zapier/Meta direkt ins Meta übernehmen
    if (typeof qualZiel === "string" && qualZiel.trim()) {
      (baseMeta as any).qualZiel = qualZiel.trim();
    }
    if (typeof qualEinkommen === "string" && qualEinkommen.trim()) {
      (baseMeta as any).qualEinkommen = qualEinkommen.trim();
    }
    if (typeof qualEigenkapital === "string" && qualEigenkapital.trim()) {
      (baseMeta as any).qualEigenkapital = qualEigenkapital.trim();
    }
    if (typeof qualBeruflicheSituation === "string" && qualBeruflicheSituation.trim()) {
      (baseMeta as any).qualBeruflicheSituation = qualBeruflicheSituation.trim();
    }
    // Der frühere Sonderfall "Lead mit Microseiten-Kürzel wird zugewiesen"
    // steht nicht mehr hier. Er ist in `pipelineStufeFuerLead` aufgegangen,
    // wo er ohne Umweg über das Kürzel an der Partnerzuordnung hängt.

    /*
     * Einwilligung mitspeichern, sofern das Formular eine geschickt hat.
     *
     * Mit Zeitpunkt und Wortlaut, sonst ist sie im Streitfall nicht
     * nachweisbar. Ein Lead ohne Einwilligungsfeld geht weiter durch: Meta
     * Lead Ads und Zapier holen ihre Einwilligung an anderer Stelle ein, und
     * ein fehlendes Feld darf keinen Lead verschlucken.
     */
    const einwilligung = leseEinwilligung((body as any).dsgvo_consent);
    if (einwilligung) {
      (baseMeta as any).einwilligung = einwilligung;
    }

    /*
     * Kundensprache (Plan Kundensprache vom 25.09.2026, 2.4 Punkt 2): Die
     * Sprache kommt aus der Seite, auf der das Formular abgeschickt wurde.
     * Gelesen wird `sprache` im Rumpf, ersatzweise die Fassung der
     * Einwilligung: Die englische endet auf "-en" (Expats-Rechner
     * "2026-09-v1-en"). Frei ueber `meta` mitgeschickte Sprachschluessel
     * werden verworfen, ein oeffentliches Formular setzt sie nicht selbst.
     * Ohne erkennbare Sprache bleibt alles wie bisher: Der Kontakt gilt als
     * Deutsch, und vor dem ersten Versand fragt das CRM einmal nach.
     */
    for (const schluessel of Object.values(KUNDENSPRACHE_META)) delete (baseMeta as any)[schluessel];
    const leadSprache = normalisiereSprache((body as any).sprache)
      ?? (typeof einwilligung?.version === "string" && einwilligung.version.toLowerCase().endsWith("-en") ? "en" : null);
    if (leadSprache) {
      const seite = typeof quelle === "string" && quelle.trim() ? quelle.trim().slice(0, 80) : "Formular";
      Object.assign(baseMeta, kundenSpracheMetaPatch(leadSprache, `lead:${seite}`));
    }

    // Eine erfundene Beraterkennung geht nicht spurlos unter.
    if (verworfeneBeraterId) {
      (baseMeta as any).verworfeneBeraterId = verworfeneBeraterId;
      (baseMeta as any).verworfeneBeraterIdGrund = verworfenerBefund;
    }
    // Ebenso ein Link-Kuerzel, das zu keinem Partner fuehrte.
    if (verworfenesKuerzel) {
      (baseMeta as any).verworfenesLinkKuerzel = verworfenesKuerzel;
      (baseMeta as any).verworfenesLinkKuerzelGrund = verworfenerBefund;
    }
    // Ueber welchen Weg der Partner feststand. "alter_link" heisst: ueber die
    // Kennung aus einem Link mit `?b=`, nicht ueber das Kuerzel.
    if (zuordnungsWeg.weg !== "ohne_link") {
      (baseMeta as any).partnerZuordnungUeber = zuordnungsWeg.weg;
    }

    // Markiere unzugewiesene Leads für die Pool-Ansicht (gelber „Offen"-Badge
    // + „Übernehmen"-Button in der Lead-Verwaltung).
    if (!zustaendigId) {
      (baseMeta as any).offenerLead = true;
    }
    // Der Zulieferer hat einen Berater genannt, der sich keinem Profil eindeutig
    // zuordnen liess. Die Information geht nicht verloren, sie steuert aber auch
    // nichts: die Zuweisung passiert weiterhin von Hand.
    if (beraterHinweis) {
      (baseMeta as any).beraterHinweis = beraterHinweis;
    }

    // "Erstellt von" = der zugewiesene Berater (Analysetool-/Microseiten-Self-Service).
    // So erscheint der Berater nicht nur in der Berater-Spalte, sondern auch in
    // "Alle Kontakte" / "Kontakte" als Ersteller. Aus dem Aufruf kommt
    // `erstelltVonId` seit dem 28.09.2026 nicht mehr durch (Positivliste oben).
    if (zustaendigId && !(baseMeta as any).erstelltVonId) {
      (baseMeta as any).erstelltVonId = zustaendigId;
      (baseMeta as any).erstelltVonName = beraterFinal || (baseMeta as any).erstelltVonName || "";
    }
    // Reine Funnel-/Zapier-Leads ohne expliziten Ersteller bekommen "Funnel Lead".
    if (!(baseMeta as any).erstelltVonName) {
      (baseMeta as any).erstelltVonName = "Funnel Lead";
    }

    if (isTerminLead) {
      if (typeof termin_datum === "string" && termin_datum.trim()) {
        baseMeta.terminDatum = termin_datum.trim();
      }
      if (typeof termin_uhrzeit === "string" && termin_uhrzeit.trim()) {
        baseMeta.terminUhrzeit = termin_uhrzeit.trim();
      }
      baseMeta.terminGebuchtAm = new Date().toISOString();
      baseMeta.prioritaet = "hoch";
    }

    const quelleFinal = formatMetaQuelle(
      (typeof quelle === "string" && quelle.trim()) ? quelle.trim() : "Funnel Lead",
    );
    const kontaktName = `${vorname.trim()} ${nachname.trim()}`.trim();

    // Keine automatische Bestaetigungsmail an den Interessenten mehr. Die
    // Microseiten-Vorlage ist am 26.09.2026 auf Christians Wunsch entfallen,
    // der Partner meldet sich selbst. Glocke und Partnermail bleiben.

    /**
     * Lead-Ereignis serverseitig an die Meta Conversion-API melden.
     *
     * Best effort in jeder Hinsicht: Fehlt das Token, die Pixel-ID, die
     * Event-ID aus dem Browser oder sogar die ganze Tabelle (Migration noch
     * nicht gelaufen), wird still uebersprungen. Ein Fehler landet im Log,
     * haelt den Lead aber niemals auf. Das Token selbst steht in keinem Log.
     */
    const meldeMetaConversion = async () => {
      try {
        if (typeof metaEventId !== "string" || !metaEventId.trim()) return;
        // Ohne gepruefte Einwilligung fuer diesen Partner geht nichts an Meta,
        // auch dann nicht, wenn eine Event-ID mitkommt.
        if (!marketingNachweis) return;
        if (!metaPixelPartnerId) return;

        const { data: tokenZeile, error: tokenFehler } = await supabaseAdmin
          .from("vp_marketing_einstellungen")
          .select("meta_capi_token")
          .eq("user_id", metaPixelPartnerId)
          .maybeSingle();
        if (tokenFehler) {
          const msg = String(tokenFehler.message || "");
          const tabelleFehlt =
            tokenFehler.code === "42P01" ||
            tokenFehler.code === "PGRST205" ||
            msg.includes("does not exist") ||
            msg.includes("schema cache");
          if (!tabelleFehlt) {
            console.error("Meta-Conversion: Token-Abfrage fehlgeschlagen:", msg);
          }
          return;
        }
        const token = tokenZeile?.meta_capi_token;
        if (typeof token !== "string" || !token.trim()) return;

        // Pixel-ID aus derselben Quelle, die auch die Landingpage nutzt.
        const { data: settingsZeile } = await supabaseAdmin
          .from("user_settings")
          .select("einstellungen")
          .eq("user_id", metaPixelPartnerId)
          .maybeSingle();
        const pixelId = settingsZeile?.einstellungen?.marketing?.metaPixelId;
        if (!istGueltigePixelId(pixelId)) return;
        // Pixel und Token nur mit Anlage 4, Bestandsschutz oder als Admin.
        if (!(await ladeMetaPixelFreigabe(supabaseAdmin as unknown as FreigabeClient, metaPixelPartnerId)).erlaubt) return;
        // Wie in `get-vp-microsite`: ohne Geschaeftsanschrift kein Pixel, also
        // auch keine Meldung vom Server (der Name zaehlt hier nicht).
        if (!pixelVerantwortlicherAus(settingsZeile?.einstellungen?.gewerbedaten, "Partner")) return;

        const microSlug =
          meta && typeof meta === "object" && typeof meta.microseiteSlug === "string"
            ? meta.microseiteSlug.trim()
            : "";
        const event = await baueMetaLeadEvent({
          eventId: metaEventId.trim(),
          eventTime: Date.now() / 1000,
          eventSourceUrl: hbWeg
            ? `https://osimmobilien.netlify.app/handbuch${zuordnungsWeg.weg === "link_kuerzel" ? `/${encodeURIComponent(zuordnungsWeg.kuerzel)}` : ""}${hbSaOffen ? "/selbstauskunft" : ""}`
            : microSlug
              ? `https://osimmobilien.netlify.app/vp/${encodeURIComponent(microSlug)}`
              : "https://osimmobilien.netlify.app/",
          email,
          telefon,
        });
        const ergebnis = await sendeMetaLeadEvent({ pixelId: pixelId.trim(), token, event });
        if (!ergebnis.ok) {
          console.error(
            "Meta-Conversion: Senden fehlgeschlagen:",
            ergebnis.status ?? "",
            ergebnis.fehler ?? "",
          );
        }
      } catch (e) {
        console.error("Meta-Conversion: unerwarteter Fehler:", e instanceof Error ? e.message : e);
      }
    };

    // ─── Dublettenprüfung ───────────────────────────────────
    // Ein bekannter Interessent, der ein weiteres Formular ausfüllt, bekommt
    // keinen zweiten Kontakt. Die neue Anfrage wird an den bestehenden Kontakt
    // gehängt. Sein Zustand bleibt dabei unangetastet: Wer schon in der
    // Finanzierung steckt, fällt nicht auf "neuer_lead" in den Pool zurück.
    let dublette: ReturnType<typeof findeKontaktDublette> = { art: "keine" };
    try {
      const kandidaten = await ladeDublettenKandidaten(supabaseAdmin);
      dublette = findeKontaktDublette(
        { email: email.trim(), telefon: telefon.trim(), nachname: nachname.trim() },
        kandidaten,
      );
    } catch (e) {
      // Ohne Prüfung lieber eine Dublette als ein verlorener Lead. Damit das
      // nicht unbemerkt bleibt, steht es im Audit-Log.
      console.error("Dublettenprüfung fehlgeschlagen:", e);
      await logWebhook({
        source: "submit-lead", event: "dublettenpruefung_fehlgeschlagen",
        method: req.method, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason,
        error_message: e instanceof Error ? e.message : "dublettenpruefung_fehlgeschlagen",
        duration_ms: Date.now() - t0,
      });
    }

    if (dublette.art === "mehrdeutig") {
      // Mehrere verschiedene Kontakte passen. Welcher gemeint ist, wäre
      // geraten, und ein falsches Zusammenlegen lässt sich nicht mehr
      // auftrennen. Also normal anlegen und den Verdacht festhalten.
      (baseMeta as any).dublettenVerdacht = dublette.grund;
      (baseMeta as any).dublettenVerdachtAnzahl = dublette.anzahl;
      await logWebhook({
        source: "submit-lead", event: "dublette_mehrdeutig",
        method: req.method, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason,
        payload: { grund: dublette.grund, anzahl: dublette.anzahl },
        error_message: "dublette_mehrdeutig", duration_ms: Date.now() - t0,
      });
    }

    if (dublette.art === "email" || dublette.art === "telefon") {
      const bestandsId = dublette.id;
      const erkanntUeber = dublette.art;
      const { data: bestehend, error: ladeFehler } = await supabaseAdmin
        .from("kontakte")
        .select("id, vorname, nachname, email, telefon, strasse, hausnummer, plz, ort, notizen, meta, zustaendig_id, berater, archiviert, status, aktualisiert_am")
        .eq("id", bestandsId)
        .maybeSingle();

      if (ladeFehler || !bestehend) {
        // Der Kontakt ist zwischen Prüfung und Nachladen verschwunden. Dann
        // gilt der normale Weg weiter unten, der Lead geht nicht verloren.
        console.warn("Dublette konnte nicht nachgeladen werden, lege normal an:", ladeFehler?.message);
      } else {
        const eingegangenAm = new Date().toISOString();
        const angaben: Record<string, unknown> = {};
        const uebernehmen = (schluessel: string, wert: unknown) => {
          if (typeof wert === "string" && wert.trim()) angaben[schluessel] = wert.trim();
        };
        uebernehmen("strasse", strasse);
        uebernehmen("hausnummer", hausnummer);
        uebernehmen("plz", plz);
        uebernehmen("ort", ort);
        uebernehmen("position", position);
        uebernehmen("finanzierbarkeit", finanzierbarkeit);
        uebernehmen("qualZiel", qualZiel);
        uebernehmen("qualEinkommen", qualEinkommen);
        uebernehmen("qualEigenkapital", qualEigenkapital);
        uebernehmen("qualBeruflicheSituation", qualBeruflicheSituation);
        uebernehmen("terminDatum", termin_datum);
        uebernehmen("terminUhrzeit", termin_uhrzeit);
        if (meta && typeof meta === "object") angaben.meta = meta;
        if (beraterFinal) angaben.genannterBerater = beraterFinal;

        const anfrage = {
          eingegangenAm,
          quelle: quelleFinal,
          erkanntUeber,
          name: kontaktName,
          email: email.trim(),
          telefon: telefon.trim(),
          notizen: typeof notizen === "string" ? notizen.trim() : "",
          angaben,
          // Auch eine erneute Anfrage traegt ihre eigene Einwilligung. Sie
          // haengt an dieser Anfrage und nicht am Kontakt, damit spaeter
          // ablesbar bleibt, wofuer wann zugestimmt wurde.
          ...(einwilligung ? { einwilligung } : {}),
        };

        const bestehendeMeta =
          bestehend.meta && typeof bestehend.meta === "object" ? { ...(bestehend.meta as any) } : {};
        const bisherigeAnfragen = Array.isArray(bestehendeMeta.weitereAnfragen)
          ? bestehendeMeta.weitereAnfragen
          : [];
        /*
         * Der Nachweis der Pixel-Einwilligung dieser Anfrage steht in
         * `weitereAnfragen` ungeschuetzt und faellt nach 25 Eintraegen heraus.
         * Deshalb zusaetzlich in `marketingEinwilligungen` auf oberster Ebene,
         * einer Liste, die nur waechst (Punkt 9). Angehaengt wird atomar ueber
         * die Datenbank, VOR dem Schreiben des ganzen meta weiter unten: Das
         * traegt die Liste dann nicht mit, und der Ausloeser laesst den eben
         * angehaengten Stand stehen (DS-002, Migration 20260927090000).
         * Fehlt die Funktion noch, haengt das ganze meta wie bisher an.
         * ponytail: ohne Obergrenze; noetig waere eine nur bei einem Bot, der
         * gueltige Einwilligungen je Partner erzeugt und die Anfragebremse
         * je IP umgeht.
         */
        const nachweisWeg = marketingNachweis
          ? await haengeMarketingNachweisAn(
              { rpc: (fn, args) => supabaseAdmin.rpc(fn, args) },
              bestandsId,
              marketingNachweis,
            )
          : null;
        const bisherigeNachweise = Array.isArray(bestehendeMeta.marketingEinwilligungen)
          ? bestehendeMeta.marketingEinwilligungen
          : [];
        // Begrenzt, damit ein Formular-Bot die Zeile nicht unbegrenzt aufbläht.
        const neueMeta = {
          ...bestehendeMeta,
          weitereAnfragen: [...bisherigeAnfragen, anfrage].slice(-25),
          // Nur im Rueckfall (Migration fehlt) traegt das ganze meta die Liste.
          ...(marketingNachweis && nachweisWeg === "rueckfall"
            ? { marketingEinwilligungen: [...bisherigeNachweise, marketingNachweis] }
            : {}),
          letzteAnfrageAm: eingegangenAm,
          letzteAnfrageQuelle: quelleFinal,
          // Der erste Konfigurator-Stand bleibt stehen, eine weitere
          // Einsendung steht nur in `weitereAnfragen` (Befund HB-001).
          ...(hbAntworten && meta && typeof meta === "object"
            ? handbuchFunnelFuerDublette(bestehendeMeta, (meta as any).handbuchFunnel)
            : {}),
          // Die Kampagnenkennung zaehlt den ersten Kontakt. Hatte der
          // bestehende Kontakt noch keine, bekommt er die dieser Anfrage;
          // eine vorhandene wird nie ueberschrieben.
          ...(!bestehendeMeta.kampagne && meta && typeof meta === "object" && (meta as any).kampagne
            ? { kampagne: (meta as any).kampagne }
            : {}),
        };

        /*
         * ─── Ruhender Kontakt kommt zurück (seit 04.10.2026, M16) ───
         *
         * War der Kontakt archiviert oder verloren, sah die neue Anfrage
         * niemand. Jetzt wird er wieder aktiv, aber nie ueber die Kaufphase
         * hinweg (Kontakt oder ein Investment ab Reservierung) und nie zu
         * einem anderen Partner: Der bisherige Zustaendige bleibt, nur ein
         * gesperrter oder einer ohne Beraterrolle gibt ihn an den Lead-Pool
         * ab. Ohne Zustaendigen zaehlt allein ein gepruefter Partnerlink.
         * Siehe `lead-zuordnung.ts`.
         */
        const bisherZustaendig: string | null = bestehend.zustaendig_id ?? null;
        let neuerZustaendig: string | null = bisherZustaendig;
        let reaktivierung: ReturnType<typeof reaktivierungFuerAnfrage> | null = null;
        let ruhendInKaufphase = false;
        if (istRuhenderKontakt(bestehend)) {
          const { data: invZeilen, error: invFehler } = await supabaseAdmin
            .from("investments")
            .select("meta, status")
            .eq("kunde_id", bestandsId);
          // Ohne Gewissheit ueber die Kaufphase lieber nicht reaktivieren.
          if (invFehler) console.error("Reaktivierung: Investments nicht lesbar:", invFehler.message);
          ruhendInKaufphase = !!invFehler || istInKaufphase(bestehend.meta, (invZeilen || []) as any[]);
          if (!ruhendInKaufphase) {
            let bisherGueltig = true;
            if (bisherZustaendig) {
              const [{ data: profil, error: profilFehler }, { data: rollen, error: rollenFehler }] = await Promise.all([
                supabaseAdmin.from("profiles").select("gesperrt").eq("id", bisherZustaendig).maybeSingle(),
                supabaseAdmin.from("user_roles").select("role").eq("user_id", bisherZustaendig),
              ]);
              // Bei einem Lesefehler bleibt er zustaendig: Umhaengen ist der
              // groessere Schaden.
              if (!profilFehler && !rollenFehler) {
                bisherGueltig = !!profil && profil.gesperrt !== true && hatBeraterRolle(rollen as any[]);
              }
            }
            neuerZustaendig = zustaendigNachReaktivierung({
              bisherId: bisherZustaendig,
              bisherGueltig,
              linkInhaberId: zustaendigAusUebergebenerId ? zustaendigId : null,
            });
            reaktivierung = reaktivierungFuerAnfrage({
              bisher: bestehend,
              zustaendigNeu: neuerZustaendig,
              beraterNameNeu: neuerZustaendig === bisherZustaendig ? String(bestehend.berater || "") : beraterFinal,
              pipelineStufe: pipelineStufeFuerLead({ istTerminLead: isTerminLead, persoenlicherPartnerWeg: !!neuerZustaendig }),
              leadTyp: String((baseMeta as any).leadTyp || "meta"),
              jetzt: eingegangenAm,
            });
            Object.assign(neueMeta, reaktivierung.metaPatch);
          }
        }

        // Nur leere Felder werden ergänzt. Vorhandene Angaben des bestehenden
        // Kontakts werden nie überschrieben, ebenso wenig Status,
        // Pipelinestufe oder Zuständigkeit. Ausnahme ist der ruhende Kontakt
        // oben.
        const ergaenzung: Record<string, unknown> = { meta: neueMeta, ...(reaktivierung?.spalten ?? {}) };
        const ergaenzeWennLeer = (feld: string, wert: unknown) => {
          const vorhanden = String((bestehend as any)[feld] ?? "").trim();
          if (!vorhanden && typeof wert === "string" && wert.trim()) {
            ergaenzung[feld] = wert.trim();
          }
        };
        ergaenzeWennLeer("email", email);
        ergaenzeWennLeer("telefon", telefon);
        ergaenzeWennLeer("strasse", strasse);
        ergaenzeWennLeer("hausnummer", hausnummer);
        ergaenzeWennLeer("plz", plz);
        ergaenzeWennLeer("ort", ort);

        // Die Notiz aus dem Formular gehört dorthin, wo der Zuständige
        // hinsieht. Angehängt, nie ersetzt.
        if (typeof notizen === "string" && notizen.trim()) {
          const datum = new Date().toLocaleDateString("de-DE");
          const kopf = `Neue Anfrage am ${datum} über ${quelleFinal}:`;
          const alt = String(bestehend.notizen ?? "").trim();
          ergaenzung.notizen = alt
            ? `${alt}\n\n${kopf}\n${notizen.trim()}`
            : `${kopf}\n${notizen.trim()}`;
        }

        /*
         * Optimistische Sperre fuer die Reaktivierung: Geschrieben wird nur,
         * wenn Zustaendigkeit und aktualisiert_am noch so stehen wie gelesen.
         * Hat in der Zwischenzeit jemand den Kontakt geaendert, etwa
         * zugewiesen, aendert diese Anfrage nichts; sie steht dann nur im
         * Verlauf, und die Glocke geht wie ohne Reaktivierung.
         */
        let schreiben = supabaseAdmin.from("kontakte").update(ergaenzung).eq("id", bestandsId);
        if (reaktivierung) {
          schreiben = bestehend.aktualisiert_am
            ? schreiben.eq("aktualisiert_am", bestehend.aktualisiert_am)
            : schreiben.is("aktualisiert_am", null);
          schreiben = bisherZustaendig
            ? schreiben.eq("zustaendig_id", bisherZustaendig)
            : schreiben.is("zustaendig_id", null);
        }
        const { data: geschrieben, error: updateFehler } = await schreiben.select("id");
        let reaktivierungVerworfen = false;
        if (!updateFehler && reaktivierung && (geschrieben || []).length === 0) {
          console.warn("Reaktivierung verworfen: Kontakt wurde zwischenzeitlich geaendert", bestandsId);
          reaktivierung = null;
          neuerZustaendig = bisherZustaendig;
          reaktivierungVerworfen = true;
        }

        if (updateFehler) {
          console.error("Anhängen an bestehenden Kontakt fehlgeschlagen:", updateFehler);
          await logWebhook({
            source: "submit-lead", event: "dublette_anhaengen_fehlgeschlagen",
            method: req.method, status_code: 500, ip, user_agent: userAgent,
            signature_status: signatureStatus, signature_reason: signatureReason,
            payload: parsedPayload,
            error_message: `db_update_failed: ${updateFehler.message}`,
            duration_ms: Date.now() - t0,
          });
          return new Response(
            // Ohne Details: Update- und Insert-Fehler sollen gleich aussehen,
            // sonst verraeten sie eine Dublette (HB-002). Der Grund steht im Log.
            JSON.stringify({ error: "Speichern fehlgeschlagen" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        await logActivityFromEdge(supabaseAdmin, {
          kontaktId: bestandsId,
          action: "lead_erneut_eingegangen",
          meta: {
            quelle: quelleFinal,
            erkanntUeber,
            notizen: anfrage.notizen,
            angaben,
            // Archiviert oder verloren, aber in der Kaufphase: bleibt, wo er ist.
            ...(ruhendInKaufphase ? { ruhendInKaufphase: true } : {}),
            // Zwischen Lesen und Schreiben geaendert: nichts uebernommen.
            ...(reaktivierungVerworfen ? { reaktivierungVerworfen: true } : {}),
          },
          source: "edge:submit-lead",
        });
        // Im Verlauf des Kontakts steht, dass und warum er wieder offen ist.
        if (reaktivierung) {
          await logActivityFromEdge(supabaseAdmin, {
            kontaktId: bestandsId,
            action: "lead_reaktiviert",
            meta: {
              quelle: quelleFinal,
              vorherZustaendigId: bisherZustaendig,
              vorherBerater: String(bestehend.berater || "") || null,
              zustaendigId: neuerZustaendig,
              vorherStatus: bestehend.status ?? null,
              vorherArchiviert: bestehend.archiviert === true,
            },
            source: "edge:submit-lead",
          });
        }

        // ─── Wer erfährt davon? ───────────────────────────────
        // Hat der Kontakt einen Zuständigen, geht die Meldung an ihn, sonst
        // an Admin, Inhaber und Vertriebsleitung. Beim reaktivierten Kontakt
        // zählt die Zuständigkeit von oben.
        const bestandsVpId: string | null = neuerZustaendig;
        const bestandsName =
          `${(bestehend.vorname || "").trim()} ${(bestehend.nachname || "").trim()}`.trim() ||
          kontaktName;
        // Eine Terminbuchung eines bekannten Kontakts darf nicht in einer
        // allgemeinen Meldung untergehen, deshalb steht sie im Text.
        const terminHinweis =
          typeof termin_datum === "string" && termin_datum.trim()
            ? ` Es wurde ein Termin am ${termin_datum.trim()}` +
              (typeof termin_uhrzeit === "string" && termin_uhrzeit.trim()
                ? ` um ${termin_uhrzeit.trim()} Uhr`
                : "") +
              " gebucht."
            : "";
        const notifText =
          `${bestandsName} hat sich erneut gemeldet, über ${quelleFinal}. ` +
          "Der bestehende Kontakt wurde ergänzt, es wurde kein zweiter angelegt." +
          (reaktivierung
            ? bestandsVpId
              ? " Er war archiviert oder verloren und ist jetzt wieder aktiv."
              : " Er war archiviert oder verloren und liegt jetzt wieder im Lead-Pool."
            : ruhendInKaufphase
              ? " Er ist archiviert oder verloren, steht aber in der Kaufphase und bleibt deshalb, wo er ist."
              : "") +
          terminHinweis;
        const notifMeta: Record<string, unknown> = {
          notif_type: "kontakt_erneut_angefragt",
          kontaktId: bestandsId,
          kontaktName: bestandsName,
          telefon: telefon.trim(),
          email: email.trim(),
          source: quelleFinal,
          erkanntUeber,
        };
        if (angaben.terminDatum) notifMeta.terminDatum = angaben.terminDatum;
        if (angaben.terminUhrzeit) notifMeta.terminUhrzeit = angaben.terminUhrzeit;

        try {
          let empfaenger: string[] = [];
          if (bestandsVpId) {
            empfaenger = [bestandsVpId];
          } else {
            const { data: roleRows } = await supabaseAdmin
              .from("user_roles")
              .select("user_id")
              .in("role", ["admin", "inhaber", "vertriebsleiter"] as any);
            empfaenger = Array.from(
              new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean)),
            );
          }

          if (empfaenger.length === 0) {
            console.warn("Erneute Anfrage: keine Empfänger gefunden für Kontakt", bestandsId);
          } else {
            const { error: notifErr } = await supabaseAdmin.from("benachrichtigungen").insert(
              empfaenger.map((uid) => ({
                benutzer_id: uid,
                titel: bestandsVpId
                  ? `🔁 Dein Kontakt hat erneut angefragt: ${bestandsName}`
                  : `🔁 Bekannter Kontakt hat erneut angefragt: ${bestandsName}`,
                nachricht: JSON.stringify({ text: notifText, ...notifMeta }),
                link: `/kunden/${bestandsId}`,
                gelesen: false,
              })),
            );
            if (notifErr) console.error("Benachrichtigung erneute Anfrage fehlgeschlagen:", notifErr);
          }
        } catch (e) {
          console.error("Benachrichtigung erneute Anfrage fehlgeschlagen:", e);
        }

        /*
         * ─── Fremde Dublette: Hinweis an die Admin-Rolle ─────────
         *
         * Entscheidung vom 24.09.2026: Kam der bekannte Kontakt ueber den Link
         * von Partner A, gehoert aber schon Partner B, bleibt er bei B. A
         * bekommt nichts, weder Glocke noch Aufgabe noch Mail, und damit auch
         * keine Kundendaten. Die Glocke an B oben bleibt, wie sie war.
         * Zusaetzlich erfahren alle mit der Rolle admin davon, damit sie den
         * Fall mit beiden klaeren koennen.
         *
         * Die Namen kommen ueber die Kennung aus `profiles`, nie ueber einen
         * Namensvergleich. Ein Fehler hier haelt den Lead nicht auf.
         */
        if (
          istFremdeDublette({
            persoenlicherPartnerWeg,
            linkInhaberId: zustaendigId,
            // Der Hinweis vom 24.09.2026 haengt am bisherigen Zustaendigen.
            bestandsZustaendigId: bisherZustaendig,
          })
        ) {
          try {
            const [{ data: adminZeilen }, { data: namenZeilen }] = await Promise.all([
              supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin"),
              supabaseAdmin
                .from("profiles")
                .select("id, name")
                .in("id", [bisherZustaendig, zustaendigId].filter(Boolean) as string[]),
            ]);
            const nameVon = (id: string | null) =>
              String(((namenZeilen || []) as any[]).find((p) => p?.id === id)?.name || "").trim();
            const meldung = fremdeDublettenMeldung({
              kontaktName: bestandsName,
              bisherBei: nameVon(bisherZustaendig) || String(bestehend.berater || ""),
              linkVon: nameVon(zustaendigId) || beraterFinal,
              quelle: quelleFinal,
            });
            const adminIds = Array.from(
              new Set(((adminZeilen || []) as any[]).map((r) => r?.user_id).filter(Boolean)),
            ) as string[];
            if (adminIds.length === 0) {
              console.warn("Fremde Dublette: keine Nutzer mit Rolle admin gefunden für Kontakt", bestandsId);
            } else {
              const { error: adminNotifErr } = await supabaseAdmin.from("benachrichtigungen").insert(
                adminIds.map((uid) => ({
                  benutzer_id: uid,
                  titel: meldung.titel,
                  nachricht: JSON.stringify({
                    text: meldung.text,
                    notif_type: "kontakt_fremder_partnerlink",
                    kontaktId: bestandsId,
                    kontaktName: bestandsName,
                    bisherZustaendigId: bisherZustaendig,
                    linkInhaberId: zustaendigId,
                    source: quelleFinal,
                  }),
                  link: `/kunden/${bestandsId}`,
                  gelesen: false,
                })),
              );
              if (adminNotifErr) console.error("Glocke fremde Dublette fehlgeschlagen:", adminNotifErr);
            }
            await logWebhook({
              source: "submit-lead", event: "dublette_fremder_partnerlink",
              method: req.method, ip, user_agent: userAgent,
              signature_status: signatureStatus, signature_reason: signatureReason,
              payload: {
                kontaktId: bestandsId,
                bisherZustaendigId: bisherZustaendig,
                linkInhaberId: zustaendigId,
                quelle: quelleFinal,
              },
              duration_ms: Date.now() - t0,
            });
          } catch (e) {
            console.error("Glocke fremde Dublette fehlgeschlagen:", e);
          }
        }

        // Auch eine erneute Anfrage ist eine Conversion auf der Landingpage
        // des Partners. Dieselbe event_id wie im Browser, Meta dedupliziert.
        await meldeMetaConversion();

        // Auch ein bekannter Kontakt bekommt sein neues Handbuch (Strategie,
        // Kapitel 6: „Dubletten ... ein zweites Handbuch trotzdem verschicken“).
        // Zustaendig bleibt, wer es schon war.
        const hbDublette: HandbuchAnlageErgebnis | null = hbWeg
          ? await handbuchNachLeadAnlegen(supabaseAdmin, {
              kontaktId: bestandsId,
              beraterId: bestandsVpId,
              vorname: vorname.trim(),
              nachname: nachname.trim(),
              email: email.trim(),
              antworten: hbAntworten,
              token: hbToken,
              // Keine Sprache aus dem Formular: Bei einem bekannten Kontakt
              // gilt seine Profilsprache, siehe `spracheFuerHandbuch`.
              dublette: {
                erkanntUeber,
                gespeicherteEmail: String(bestehend.email ?? ""),
                gespeicherterName: [bestehend.vorname, bestehend.nachname].filter(Boolean).join(" "),
              },
            })
          : null;

        await logWebhook({
          source: "submit-lead", event: "dublette_angehaengt",
          method: req.method, status_code: 200, ip, user_agent: userAgent,
          signature_status: signatureStatus, signature_reason: signatureReason,
          payload: parsedPayload, duration_ms: Date.now() - t0,
        });

        // Auf den Wegen der Handbuch-Seite bekommt der Browser bei einer
        // Dublette weder Token noch Kontaktkennung noch den Hinweis, dass es
        // den Kontakt schon gibt: dieselbe Form wie bei einem neuen Kontakt
        // (`handbuchAntwort`). Wer nur Adresse oder Nummer eines Kunden kennt,
        // soll nichts über dessen Vorgang erfahren. Das Handbuch zeigt die
        // Seite trotzdem, aus den eigenen Antworten.
        if (hbDublette) {
          return new Response(JSON.stringify(handbuchDublettenAntwort(hbDublette)), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Ohne Signatur dieselbe Antwort wie fuer einen neuen Lead (HB-002).
        return new Response(
          JSON.stringify(leadAntwort({
            signiert: signatureStatus === "verified",
            kontaktId: bestandsId,
            leadTyp: isTerminLead ? "erstgespraech" : "standard",
            zugewiesenAn: bestandsVpId,
            dublette: { erkanntUeber },
          })),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ─── moreId (MI-XXXXX) vergeben ─────────────────────────
    // Jeder Lead bekommt eine fortlaufende moreId, damit er im Kundenprofil
    // eine eindeutige Anzeige-ID erhält (z. B. MI-00042). Wir lesen den
    // aktuellen Maximalwert und erhöhen um 1. Bei sehr seltenen Race-Conditions
    // kann es theoretisch zu Duplikaten kommen – Anzeige-ID, nicht PK.
    try {
      const { data: maxRow } = await supabaseAdmin
        .from("kontakte")
        .select("meta")
        .not("meta->>moreId", "is", null)
        .order("meta->moreId", { ascending: false })
        .limit(1);
      let maxMoreId = 0;
      if (Array.isArray(maxRow)) {
        for (const r of maxRow as any[]) {
          const v = Number(r?.meta?.moreId);
          if (Number.isFinite(v) && v > maxMoreId) maxMoreId = v;
        }
      }
      // Fallback: kompletten Scan falls Ordering nicht greift (jsonb-Sortierung)
      if (maxMoreId === 0) {
        const { data: allRows } = await supabaseAdmin.from("kontakte").select("meta");
        for (const r of (allRows || []) as any[]) {
          const v = Number(r?.meta?.moreId);
          if (Number.isFinite(v) && v > maxMoreId) maxMoreId = v;
        }
      }
      (baseMeta as any).moreId = maxMoreId + 1;
    } catch (e) {
      console.error("moreId-Vergabe fehlgeschlagen:", e);
    }

    // ─── Insert in kontakte ─────────────────────────────────
    const insertPayload: Record<string, unknown> = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      email: email.trim(),
      telefon: telefon.trim(),
      strasse: typeof strasse === "string" ? strasse : "",
      hausnummer: typeof hausnummer === "string" ? hausnummer : "",
      plz: typeof plz === "string" ? plz : "",
      ort: typeof ort === "string" ? ort : "",
      position: typeof position === "string" ? position : "",
      quelle: quelleFinal,
      status: "neu",
      berater: beraterFinal,
      finanzierbarkeit: typeof finanzierbarkeit === "string" ? finanzierbarkeit : null,
      notizen: notizen || "",
      meta: baseMeta,
    };
    if (zustaendigId) insertPayload.zustaendig_id = zustaendigId;

    const { data: insertedRows, error } = await supabaseAdmin
      .from("kontakte")
      .insert(insertPayload)
      .select("id")
      .limit(1);

    if (error) {
      console.error("Insert error:", error);
      await logWebhook({
        source: "submit-lead", method: req.method, status_code: 500, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason, payload: parsedPayload,
        error_message: `db_insert_failed: ${error.message}`, duration_ms: Date.now() - t0,
      });
      return new Response(
        JSON.stringify({ error: "Speichern fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newKontaktId = insertedRows?.[0]?.id ?? null;

    // ─── Meta Conversion-API (best effort, blockiert nie) ────
    await meldeMetaConversion();

    // ─── Inbox-Aufgabe für VP (nur bei Funnel-Leads mit Berater) ─────
    const isFunnelLead = !isTerminLead && !!zustaendigId;
    if (isFunnelLead && newKontaktId) {
      try {
        const faelligAm = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
        const { error: aufgabeErr } = await supabaseAdmin.from("aufgaben").insert({
          benutzer_id: zustaendigId,
          zugewiesen_an: zustaendigId,
          kontakt_id: newKontaktId,
          titel: `Neuer Lead erhalten: ${kontaktName}`,
          beschreibung: `Neuer Lead erhalten: ${kontaktName}. Bitte anrufen und qualifizieren. Viel Erfolg!${notizen ? `\n\n${notizen}` : ""}`,
          typ: "anruf",
          status: "offen",
          prioritaet: "hoch",
          faellig_am: faelligAm,
        });
        if (aufgabeErr) console.error("Inbox-Aufgabe konnte nicht erstellt werden:", aufgabeErr);
      } catch (e) {
        console.error("Inbox task error:", e);
      }
    }

    // ─── Mail an den Vertriebspartner ────────────────────────
    // Landingpage- und Analysetool-Leads sind serverseitig bereits zugewiesen.
    // Ohne diese Mail erfuhr der Partner davon nur ueber die Inbox-Aufgabe,
    // also erst beim naechsten Login. Die Function dedupliziert selbst ueber
    // die Merkmarke am Kontakt, ein Fehlschlag darf den Lead nicht aufhalten.
    if (isFunnelLead && newKontaktId) {
      try {
        await supabaseAdmin.functions.invoke("send-lead-partner-mail", {
          body: { kontaktId: newKontaktId, partnerId: zustaendigId },
        });
      } catch (e) {
        console.error("Partner-Mail konnte nicht angestossen werden:", e);
      }
    }

    /*
     * ─── Welche Glocken gehen raus? ─────────────────────────
     *
     * Die Entscheidung steht in `lead-zuordnung.ts` und ist dort begruendet.
     * Sie hier zu treffen hiesse, dieselbe Bedingung dreimal hinzuschreiben,
     * und genau so ist die Glocke an die Fuehrung darauf stehengeblieben,
     * jedem Lead hinterherzurufen.
     */
    const glocken = glockenPlanFuerLead({
      istTerminLead: isTerminLead,
      persoenlicherPartnerWeg,
      hatZustaendigen: !!zustaendigId,
    });

    /*
     * ─── Glocke an den Partner, wenn es sein Lead ist ───────
     *
     * Hier stand bisher, dass Vertriebspartner fuer neue Leads bewusst KEINE
     * Glocke bekommen, weil solche Leads in der Lead-Verwaltung liegen und die
     * Fuehrung sie verteilt. Fuer die Leads der Gesellschaft stimmt das
     * weiterhin. Fuer einen Lead ueber den persoenlichen Link des Partners
     * stimmte es nie: Der Lead gehoert ihm sofort, steht gar nicht in der
     * Lead-Verwaltung, und er erfuhr davon erst beim naechsten Login ueber die
     * Inbox-Aufgabe.
     *
     * Deshalb bekommt er jetzt eine Glocke, sobald ein Lead ueber Beraterseite,
     * Analysetool oder Steuerrechner hereinkommt. Sie nennt den Weg und den
     * Namen und fuehrt ins Kundenprofil, nicht in die Lead-Verwaltung, wo
     * dieser Lead ohnehin nicht steht.
     */
    if (glocken.partner) {
      try {
        const link = newKontaktId ? `/kunden/${newKontaktId}` : "/alle-kontakte";
        const ueber = herkunftBezeichnung(
          quelleFinal,
          (meta && typeof meta === "object" ? (meta as any).microseiteSlug : null),
        );
        const { error: partnerNotifError } = await supabaseAdmin
          .from("benachrichtigungen")
          .insert({
            benutzer_id: zustaendigId,
            titel: `🔔 Neuer Lead über ${ueber}: ${kontaktName}`,
            nachricht: JSON.stringify({
              text:
                `${kontaktName} hat sich über ${ueber} gemeldet und ist dir zugewiesen. ` +
                "Bitte zeitnah anrufen und qualifizieren.",
              notif_type: "partner_lead_persoenlich",
              kontaktId: newKontaktId,
              kontaktName,
              telefon: telefon.trim(),
              email: email.trim(),
              source: quelleFinal,
              herkunft,
            }),
            link,
            gelesen: false,
          });
        if (partnerNotifError) {
          console.error("Partner-Notification insert failed:", partnerNotifError);
        }
      } catch (e) {
        console.error("Partner-Notification error:", e);
      }
    }

    // Termin-Buchungen (Erstgespräch) gehen weiterhin direkt an den
    // zuständigen VP, mit eigenem Text und eigenen Termindaten.
    if (glocken.partnerTermin) {
      try {
        const link = newKontaktId ? `/kunden/${newKontaktId}` : "/alle-kontakte";

        const notifMeta: Record<string, unknown> = {
          notif_type: "termin_gebucht",
          kontaktId: newKontaktId,
          kontaktName,
          telefon: telefon.trim(),
          email: email.trim(),
          beraterName: beraterFinal,
          source: quelle || "Microseite",
        };

        const datum = (typeof termin_datum === "string" && termin_datum.trim()) || "(unbekannt)";
        const uhrzeit = (typeof termin_uhrzeit === "string" && termin_uhrzeit.trim()) || "";
        const titel = "📅 Neues Erstgespräch gebucht";
        const nachricht = uhrzeit
          ? `${kontaktName} hat einen Termin am ${datum} um ${uhrzeit} Uhr gebucht.`
          : `${kontaktName} hat einen Termin am ${datum} gebucht.`;
        notifMeta.terminDatum = datum;
        notifMeta.terminUhrzeit = uhrzeit;

        const { error: notifError } = await supabaseAdmin.from("benachrichtigungen").insert({
          benutzer_id: zustaendigId,
          titel,
          nachricht: JSON.stringify({ text: nachricht, ...notifMeta }),
          link,
          gelesen: false,
        });
        if (notifError) {
          console.error("Termin-Notification insert failed:", notifError);
        } else {
          console.log(`Termin-Notification sent to user ${zustaendigId} for lead ${newKontaktId}`);
        }
      } catch (notifErr) {
        console.error("Termin-Notification insert error:", notifErr);
      }
    }

    /*
     * ─── Pool-Glocke an Admin / Inhaber / Vertriebsleiter / Setterin ───
     *
     * Nur noch fuer Leads ohne Zustaendigen (seit 04.10.2026, M8). Genau die
     * stehen in der Lead-Verwaltung und muessen von Hand verteilt werden, und
     * genau darum bittet der Text dieser Meldung. Ordnet der Namensabgleich
     * einen Lead der Gesellschaft einem Partner zu, laeutet es bei ihm.
     *
     * Fuer einen Lead ueber den persoenlichen Link eines Partners war sie
     * gegenstandslos: Sie sagte "Bitte in der Lead-Verwaltung pruefen" und
     * verlinkte dorthin, wo dieser Lead gar nicht steht. Wer ihr folgte, sah
     * eine Liste ohne den gemeldeten Lead. Der Partner bekommt fuer diese Leads
     * jetzt seine eigene Glocke, siehe oben.
     */
    if (glocken.leitung) {
      try {
        const link = newKontaktId ? `/lead-verwaltung` : "/lead-verwaltung";
        const sourceLabel = quelleFinal;

        // Empfänger: admin / inhaber / vertriebsleiter. Die Setter-Rolle ruht
        // seit dem 29.09.2026.
        const { data: roleRows } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .in("role", ["admin", "inhaber", "vertriebsleiter"] as any);

        const recipientIds = Array.from(
          new Set((roleRows || []).map((r: any) => r.user_id).filter(Boolean))
        );

        if (recipientIds.length === 0) {
          console.warn("Pool-Notification: keine Empfänger (Setter/Admin/Vertriebsleiter) gefunden für Lead", newKontaktId);
        } else {
          const notifMeta = {
            notif_type: "pool_lead_offen",
            kontaktId: newKontaktId,
            kontaktName,
            telefon: telefon.trim(),
            email: email.trim(),
            source: sourceLabel,
            beraterName: beraterFinal || null,
          };
          const rows = recipientIds.map((uid) => ({
            benutzer_id: uid,
            titel: `📥 Neuer Lead über ${sourceLabel}: ${kontaktName}`,
            nachricht: JSON.stringify({
              text: beraterFinal
                ? `Neuer Lead über ${sourceLabel} eingegangen (zugewiesen an ${beraterFinal}). Bitte in der Lead-Verwaltung prüfen.`
                : `Neuer Lead über ${sourceLabel} eingegangen. Bitte in der Lead-Verwaltung prüfen und einem Vertriebspartner zuweisen.`,
              ...notifMeta,
            }),
            link,
            gelesen: false,
          }));
          const { error: poolNotifErr } = await supabaseAdmin
            .from("benachrichtigungen")
            .insert(rows);
          if (poolNotifErr) {
            console.error("Pool-Notification insert failed:", poolNotifErr);
          } else {
            console.log(`Pool-Notification an ${recipientIds.length} Empfänger (Setter/Admin/Vertriebsleiter) für Lead ${newKontaktId}`);
          }
        }
      } catch (e) {
        console.error("Pool-Notification error:", e);
      }
    }

    // ─── Handbuch: Selbstauskunft-Link, Anforderung, Zustellmail ───
    const hbNeu: HandbuchAnlageErgebnis | null = hbWeg && newKontaktId
      ? await handbuchNachLeadAnlegen(supabaseAdmin, {
          kontaktId: newKontaktId,
          beraterId: zustaendigId,
          vorname: vorname.trim(),
          nachname: nachname.trim(),
          email: email.trim(),
          telefon: typeof telefon === "string" ? telefon.trim() : "",
          antworten: hbAntworten,
          token: hbToken,
          sprache: leadSprache,
        })
      : null;

    await logWebhook({
      source: "submit-lead", event: isTerminLead ? "erstgespraech" : hbAntworten ? "handbuch" : hbSaOffen ? "handbuch_sa_offen" : "standard",
      method: req.method, status_code: 200, ip, user_agent: userAgent,
      signature_status: signatureStatus, signature_reason: signatureReason,
      payload: parsedPayload, duration_ms: Date.now() - t0,
      ...(hbNeu && hbNeu.hinweise.length ? { error_message: `handbuch: ${hbNeu.hinweise.join(", ")}` } : {}),
    });
    if (hbWeg) {
      // Dieselbe Form wie bei einer Dublette, siehe dort.
      return new Response(JSON.stringify(handbuchAntwort(hbNeu)), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify(leadAntwort({
        signiert: signatureStatus === "verified",
        kontaktId: newKontaktId,
        leadTyp: isTerminLead ? "erstgespraech" : "standard",
        zugewiesenAn: zustaendigId,
      })),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Function error:", err);
    await logWebhook({
      source: "submit-lead", method: req.method, status_code: 500, ip, user_agent: userAgent,
      signature_status: signatureStatus, signature_reason: signatureReason, payload: parsedPayload,
      error_message: err instanceof Error ? err.message : "internal_error",
      duration_ms: Date.now() - t0,
    });
    return new Response(
      JSON.stringify({ error: "Interner Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
