// Edge Function: steuer-auswertung-versand
//
// Legt die Steuerauswertung ab und verschickt die Mail MIT DEM PDF IM ANHANG.
//
// DAS PDF HAENGT SEIT DEM 17.09.2026 AN DER MAIL. Vorher trug die Mail nur
// einen Knopf auf die abgelegte Datei. Das war ein sogenannter Bearer-Link:
// Wer ihn hat, kommt 90 Tage lang ohne jede weitere Pruefung an die Auswertung,
// und darin stehen Einkommen, Steuerklasse und Kirchensteuer. Mit dem Anhang
// braucht der Regelfall diesen Link gar nicht mehr.
//
// Die Ablage bleibt trotzdem, und zwar als zweiter Weg fuer genau zwei Faelle:
// ein Postfach sortiert PDF-Anhaenge aus, oder die Mail geht ueberhaupt nicht
// hinaus und der Aufrufer muss dem Interessenten sofort etwas zeigen koennen.
// Die Adresse ist dafuer sicher genug: nicht oeffentlicher Eimer ohne eine
// einzige Policy, zufaellige Kennung aus `crypto.randomUUID()` und eine
// signierte Adresse mit Laufzeit. Erraten laesst sie sich nicht.
//
// Warum es sie gibt: Die Auswertung entsteht im Browser des Interessenten,
// aber der ist nicht angemeldet und darf deshalb nichts in den Speicher
// schreiben. Ein Ablageort, in den ein anonymer Besucher schreiben kann, waere
// eine offene Tuer. Also nimmt diese Function das fertige PDF entgegen, prueft
// es, legt es mit der Service-Rolle in einen NICHT oeffentlichen Eimer und gibt
// eine signierte Adresse mit begrenzter Laufzeit zurueck.
//
// Gebaut nach dem Muster von `startfahrplanVersand.ts`: PDF ablegen, signierte
// Adresse holen, `send-transactional-email` mit einer eigenen Vorlage rufen.
// Ein zweiter Versandweg entsteht dabei bewusst nicht.
//
// Der Lead selbst laeuft unveraendert ueber `submit-lead`. Diese Function legt
// keinen Kontakt an, aendert keinen und weiss nichts von der Pipeline. Faellt
// sie aus, ist der Lead trotzdem da.
//
// DER ANSPRECHPARTNER IN DER MAIL KOMMT SEIT DEM 04.10.2026 VOM SERVER. Vorher
// schickte der Browser Name, Adresse, Telefon und Bezeichnung mit, und jeder
// konnte damit einen beliebigen Absenderblock in eine Mail von uns schreiben.
// Jetzt kommt nur das Kuerzel aus dem Link (oder beim alten Link und im CRM die
// Kennung), und die Angaben stammen aus dem Partnerprofil, nach derselben Regel
// wie `get-vp-microsite` und `submit-lead`. Ist der Partner unbekannt,
// gesperrt oder ohne Beraterrolle, steht kein Ansprechpartner in der Mail.
//
// Dazu eine einfache Bot-Pruefung: Honigtopf `hp` und eine Zeitfalle ueber
// `dauerMs`. Beides antwortet ohne Ablage und ohne Versand mit
// `mailVersendet: false`; die Seite gibt die Auswertung dann direkt heraus,
// falls doch ein Mensch dahintersteht (etwa wenn das Ausfuellen des Browsers
// das versteckte Feld gefuellt hat). Fehlt `dauerMs` (aeltere Seite im
// Zwischenspeicher), entfaellt nur die Zeitfalle.
//
// Mengenbremsen: je Anschluss (20 pro Stunde, 60 pro Tag), je
// Empfaengeradresse (3 pro Tag) und eine Obergrenze fuer alle zusammen
// (100 pro Tag; Stand 04.10.2026 kam bisher hoechstens eine am Tag).
//
// Antwort: { pdfUrl, mailVersendet } oder { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { normalisiereSprache, STANDARD_SPRACHE } from "../_shared/kunden-sprache.ts";
import { beurteileBeraterKennung, istGueltigesKuerzel, istUuid } from "../_shared/lead-zuordnung.ts";
import { berufsbezeichnung, BERUF_IMMOBILIENBERATER } from "../_shared/berufsbezeichnung.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Nicht oeffentlicher Eimer. Angelegt von der Migration, siehe migrations-inbox. */
const BUCKET = "steuer-auswertungen";
/** Wie lange der Knopf in der Mail traegt. Dieselben 90 Tage wie beim Startfahrplan. */
const GUELTIG_SEKUNDEN = 60 * 60 * 24 * 90;
/** Vier Seiten PDF sind rund 300 KB. Sechs Megabyte Base64 sind reichlich Luft. */
const MAX_BASE64 = 6_000_000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Nur das, was in einen Dateinamen darf. */
function saubererName(roh: string): string {
  return roh
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
}

/** Schneller als ein Mensch das Formular ausfuellt. */
const MINDESTDAUER_MS = 1500;
/** Mails an dieselbe Adresse je Tag. */
const JE_EMPFAENGER_PRO_TAG = 3;
/** Obergrenze fuer alle Versendungen zusammen je Tag. */
const GESAMT_PRO_TAG = 100;

interface BeraterAngaben {
  beraterName?: string;
  beraterEmail?: string;
  beraterTelefon?: string;
  beraterPosition?: string;
}

/**
 * Der Ansprechpartner aus dem Partnerprofil, gefunden ueber das Kuerzel oder
 * die Kennung. Dieselben Quellen wie in `get-vp-microsite`. Ohne gueltigen
 * Partner ein leeres Objekt, dann bleibt der Block in der Mail weg.
 */
// deno-lint-ignore no-explicit-any
async function beraterAusProfil(admin: any, slugRoh: unknown, kennungRoh: unknown): Promise<BeraterAngaben> {
  const slug = typeof slugRoh === "string" ? slugRoh.trim().toLowerCase() : "";
  const kennung = typeof kennungRoh === "string" ? kennungRoh.trim() : "";
  let abfrage = admin.from("profiles").select("id, name, email, gesperrt");
  if (slug) {
    if (!istGueltigesKuerzel(slug)) return {};
    abfrage = abfrage.eq("vp_slug", slug);
  } else if (istUuid(kennung)) {
    abfrage = abfrage.eq("id", kennung);
  } else {
    return {};
  }
  const { data: profil } = await abfrage.maybeSingle();
  if (!profil) return {};

  const { data: rollenZeilen } = await admin.from("user_roles").select("role").eq("user_id", profil.id);
  if (beurteileBeraterKennung({ kennung: profil.id, profil, rollen: rollenZeilen }) !== "ok") return {};

  const { data: einstellung } = await admin
    .from("user_settings")
    .select("einstellungen")
    .eq("user_id", profil.id)
    .maybeSingle();
  // deno-lint-ignore no-explicit-any
  const eins: any = einstellung?.einstellungen || {};
  const p = eins.profil || {};
  const vname = String(p.vorname || "").trim();
  const nname = String(p.nachname || "").trim();
  const name = vname || nname ? `${vname} ${nname}`.trim() : String(profil.name || "");
  if (!name) return {};
  const rollen = ((rollenZeilen ?? []) as Array<{ role?: string }>).map((r) => String(r?.role || "")).filter(Boolean);
  return {
    beraterName: name,
    beraterEmail: eins.email?.signatur?.email || profil.email || undefined,
    beraterTelefon: p.telefon || eins.telefon || undefined,
    beraterPosition: berufsbezeichnung(rollen, p.position || eins.position) || BERUF_IMMOBILIENBERATER,
  };
}

function base64ZuBytes(base64: string): Uint8Array {
  const roh = atob(base64);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const ip = clientIp(req);
  const rl = await checkEdgeRateLimit({
    scope: "steuer-auswertung-versand",
    key: ip,
    perHour: 20,
    perDay: 60,
    failClosed: true,
  });
  if (rl.unavailable) {
    return json({ error: "Der Versand ist gerade nicht möglich. Bitte versuch es gleich noch einmal." }, 503);
  }
  if (!rl.ok) {
    return json({ error: "Zu viele Anfragen. Bitte versuch es später erneut." }, 429);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server-Konfiguration fehlt" }, 500);

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Ungültige Anfrage" }, 400);

    const { pdfBase64, vorname, nachname, email, beraterSlug, beraterUserId, hp, dauerMs } =
      body as Record<string, unknown>;

    // Bot-Pruefung. Nichts ablegen, nichts versenden; die Seite zeigt die
    // Auswertung dann selbst.
    const zuSchnell = typeof dauerMs === "number" && Number.isFinite(dauerMs) && dauerMs < MINDESTDAUER_MS;
    if ((typeof hp === "string" && hp.trim().length > 0) || zuSchnell) {
      console.warn("[steuer-auswertung-versand] Bot-Pruefung angeschlagen", { honigtopf: !!hp, zuSchnell });
      return json({ pdfUrl: null, mailVersendet: false });
    }

    /* Die Sprache der oeffentlichen Seite (Plan Kundensprache, Etappe 6, M33).
       Ohne erkennbare Angabe Deutsch, wie bisher. Sie geht als `sprache` an
       `send-transactional-email` und bestimmt hier nur den Namen des Anhangs.
       Der Ablagepfad im Eimer bleibt deutsch, er ist intern. */
    const sprache = normalisiereSprache((body as Record<string, unknown>).sprache) ?? STANDARD_SPRACHE;

    if (typeof pdfBase64 !== "string" || pdfBase64.length === 0) {
      return json({ error: "Keine Auswertung übermittelt" }, 400);
    }
    if (pdfBase64.length > MAX_BASE64) {
      return json({ error: "Die Auswertung ist zu groß" }, 413);
    }
    if (!/^[A-Za-z0-9+/=]+$/.test(pdfBase64)) {
      return json({ error: "Die Auswertung ist nicht lesbar" }, 400);
    }
    const empfaengerMail = typeof email === "string" ? email.trim() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(empfaengerMail)) {
      return json({ error: "Ungültige E-Mail-Adresse" }, 400);
    }

    // Je Adresse und fuer alle zusammen. Gezaehlt wird vor der Ablage, ein
    // abgewiesener Versuch zaehlt also mit; das ist bei diesen Grenzen egal.
    const jeEmpfaenger = await checkEdgeRateLimit({
      scope: "steuer-auswertung-empfaenger",
      key: `mail:${empfaengerMail.toLowerCase()}`,
      perDay: JE_EMPFAENGER_PRO_TAG,
      failClosed: true,
    });
    const gesamt = jeEmpfaenger.ok
      ? await checkEdgeRateLimit({ scope: "steuer-auswertung-gesamt", key: "alle", perDay: GESAMT_PRO_TAG, failClosed: true })
      : jeEmpfaenger;
    if (gesamt.unavailable) {
      return json({ error: "Der Versand ist gerade nicht möglich. Bitte versuch es gleich noch einmal." }, 503);
    }
    if (!gesamt.ok) {
      console.warn("[steuer-auswertung-versand] Bremse:", jeEmpfaenger.ok ? "gesamt" : "empfaenger");
      return json({ error: "Zu viele Anfragen. Bitte versuch es später erneut." }, 429);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const bytes = base64ZuBytes(pdfBase64);
    // Ein PDF beginnt mit %PDF. Wer etwas anderes hochlaedt, kommt nicht durch.
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") {
      return json({ error: "Die Auswertung ist keine PDF-Datei" }, 400);
    }

    const jahr = new Date().getUTCFullYear();
    const kennung = crypto.randomUUID();
    const namensteil =
      saubererName(`${typeof vorname === "string" ? vorname : ""}-${typeof nachname === "string" ? nachname : ""}`) ||
      "auswertung";
    const pfad = `${jahr}/${kennung}/moreimmo-steuerauswertung-${namensteil}.pdf`;
    /* Englisch ohne Umlaute (Plan K4). */
    const anhangName =
      sprache === "en"
        ? `moreimmo-tax-analysis-${namensteil}.pdf`
        : `moreimmo-steuerauswertung-${namensteil}.pdf`;

    const { error: uploadFehler } = await admin.storage
      .from(BUCKET)
      .upload(pfad, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadFehler) {
      console.error("[steuer-auswertung-versand] upload:", uploadFehler);
      return json({ error: "Die Auswertung konnte nicht abgelegt werden" }, 500);
    }

    const { data: urlDaten, error: urlFehler } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(pfad, GUELTIG_SEKUNDEN);
    if (urlFehler || !urlDaten?.signedUrl) {
      console.error("[steuer-auswertung-versand] signed url:", urlFehler);
      return json({ error: "Die Auswertung konnte nicht bereitgestellt werden" }, 500);
    }
    const pdfUrl = urlDaten.signedUrl;

    const berater = await beraterAusProfil(admin, beraterSlug, beraterUserId).catch((e) => {
      console.error("[steuer-auswertung-versand] Partner nicht lesbar:", e);
      return {} as BeraterAngaben;
    });

    /* Die Mail. Schlaegt sie fehl, ist die Auswertung trotzdem abgelegt: Der
       Aufrufer bekommt die Adresse und kann sie dem Interessenten sofort
       anzeigen, statt ihn mit nichts zurueckzulassen. */
    let mailVersendet = true;
    try {
      const { data: mailDaten, error: mailFehler } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "steuer-auswertung",
          recipientEmail: empfaengerMail,
          /* Die Vorlagen-Mechanik fuer Englisch baut eine andere Etappe. Bis
             dahin ignoriert der Versender das Feld, die Mail bleibt deutsch. */
          sprache,
          idempotencyKey: `steuer-auswertung-${kennung}`,
          /* Das PDF liegt der Mail bei. Denselben Weg gehen `send-anlage-v` und
             `finalize-reservierung`, es entsteht also kein zweiter Versandweg.
             `pdfBase64` ist oben bereits geprueft: Laenge, Zeichenvorrat und
             die Magic Bytes `%PDF`. */
          attachments: [
            {
              filename: anhangName,
              content: pdfBase64,
              type: "application/pdf",
            },
          ],
          templateData: {
            kundeName: [vorname, nachname].filter((t) => typeof t === "string" && t).join(" "),
            pdfUrl,
            ...berater,
          },
        },
      });
      if (mailFehler) throw mailFehler;
      /* Steht die Adresse auf der Sperrliste, antwortet der Versender mit
         Status 200 und `success: false`. Das ist kein Fehler, aber die Mail
         kommt eben doch nicht an. Genau deshalb wird es hier gelesen: Der
         Aufrufer zeigt dann die Auswertung direkt auf der Seite. */
      if (mailDaten && (mailDaten as { success?: boolean }).success === false) {
        console.warn(
          "[steuer-auswertung-versand] Mail nicht zugestellt:",
          (mailDaten as { reason?: string }).reason,
        );
        mailVersendet = false;
      }
    } catch (mailAusnahme) {
      console.error("[steuer-auswertung-versand] mail:", mailAusnahme);
      mailVersendet = false;
    }

    return json({ pdfUrl, mailVersendet });
  } catch (fehler) {
    console.error("[steuer-auswertung-versand] unerwartet:", fehler);
    return json({ error: "Unerwarteter Fehler" }, 500);
  }
});
