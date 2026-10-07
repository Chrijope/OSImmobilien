/**
 * Objekteinreichung ueber den offenen Link.
 *
 * WARUM ES DIESE FUNCTION GIBT
 *
 * Bis zum 18.09.2026 schrieb das Formular unter /objekt-akquise direkt in die
 * Tabelle `objekt_einreichungen`. Die Richtlinie
 * "Oeffentliche Einreichungen erstellen" liess das jedem zu, angemeldet oder
 * nicht, ohne jede Bremse. Ein Skript konnte also beliebig viele erfundene
 * Einreichungen mit erfundenen Eigentuemerdaten anlegen.
 *
 * Abfliessen kann dabei nichts, die Angaben traegt der Einreicher selbst ein.
 * Das Risiko liegt in der Gegenrichtung: Muell in der Tabelle und gefaelschte
 * Einreichungen, die jemand von Hand aussortieren muss.
 *
 * ZWEI BREMSEN, BEIDE ABSICHTLICH LEICHT
 *
 *   1. Ein Honigtopf. Das Formular traegt ein Feld, das ein Mensch nie sieht
 *      und nie ausfuellt. Ist es gefuellt, antwortet diese Function freundlich
 *      und schreibt nichts. Der Bot erfaehrt nicht, dass er aufgefallen ist.
 *   2. Ein Kontingent je Anschluss, ueber dieselbe Postgres-Funktion
 *      `check_rate_limit`, die auch `submit-lead` benutzt. Kein zweiter Weg,
 *      kein zweiter Zaehler.
 *
 * Die Grenzen sind bewusst hoch gewaehlt. Ein Buero mit mehreren Kollegen am
 * selben Anschluss reicht sie an einem Tag nicht aus, ein Skript erreicht sie
 * in Sekunden.
 *
 * BILDER DER EINREICHUNG (seit 04.10.2026)
 *
 * Bis dahin lud der Browser selbst nach `objekt-medien/einreichungen/`
 * hoch, ohne Anmeldung nach `public/`, angemeldet in den eigenen Ordner:
 * jede Datei, jede Groesse, ohne Bremse, in einen oeffentlichen Eimer. Jetzt
 * nimmt diese Function die Datei als Formular (`multipart/form-data`, Feld
 * `datei`) entgegen, fuer beide Faelle: nur Bilder (JPEG, PNG, WebP, GIF,
 * HEIC), erkannt am Dateianfang und nicht an der Angabe des Browsers,
 * hoechstens 15 MB, nur mit Laengenangabe, mit eigenem Kontingent je
 * Anschluss. Der Ordner richtet sich nach der Anmeldung wie bisher. Antwort
 * `{ ok, url }` mit der oeffentlichen Adresse.
 *
 * WAS SIE NICHT TUT
 *
 * Sie prueft die Angaben nicht inhaltlich. Das tut das Formular, und danach
 * ein Mensch. Sie setzt nur die Felder zurueck, die allein intern vergeben
 * werden: Status, Notizen, Bewertung und die Uebernahme.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Felder, die nur intern vergeben werden. Was von aussen kommt, faellt weg. */
const INTERNE_FELDER = [
  "id",
  "status",
  "notizen",
  "bewertung",
  "uebernommen_am",
  "uebernommenes_objekt_id",
  "erstellt_am",
];

/**
 * Obergrenze fuer den Koerper. Eine Einreichung mit Bildern besteht aus
 * Adressen und Links, nicht aus Dateien; 400 KB sind dafuer reichlich.
 */
const MAX_KOERPER = 400_000;

/** Kontingent je Anschluss. Grosszuegig, siehe Kopf. */
const PRO_STUNDE = 20;
const PRO_TAG = 60;

/** Ohne Anmeldung traegt die Zeile diese Kennung, wie bisher im Formular. */
const OHNE_ANMELDUNG = "00000000-0000-0000-0000-000000000000";

/** Hoechstgroesse einer Datei. Handyfotos im Original liegen darunter. */
const MAX_DATEI = 15 * 1024 * 1024;
/** Kontingent fuer Dateien je Anschluss. Ein Bild sind zwei Dateien. */
const DATEIEN_PRO_STUNDE = 40;
const DATEIEN_PRO_TAG = 60;

/** Der Dateityp nach den ersten Bytes. Die Angabe des Browsers zaehlt nicht. */
function dateityp(b: Uint8Array): { endung: string; mime: string } | null {
  const text = (von: number, bis: number) => String.fromCharCode(...b.subarray(von, bis));
  const beginntMit = (bytes: number[]) => bytes.every((wert, i) => b[i] === wert);
  if (b.length < 12) return null;
  if (beginntMit([0xff, 0xd8, 0xff])) return { endung: "jpg", mime: "image/jpeg" };
  if (beginntMit([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { endung: "png", mime: "image/png" };
  if (text(0, 6) === "GIF87a" || text(0, 6) === "GIF89a") return { endung: "gif", mime: "image/gif" };
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return { endung: "webp", mime: "image/webp" };
  if (text(4, 8) === "ftyp" && ["heic", "heix", "mif1", "msf1"].includes(text(8, 12))) {
    return { endung: "heic", mime: "image/heic" };
  }
  return null;
}

async function dateiHochladen(req: Request): Promise<Response> {
  const bremse = await checkEdgeRateLimit({
    scope: "objekt-einreichung-datei",
    key: `ip:${clientIp(req)}`,
    perHour: DATEIEN_PRO_STUNDE,
    perDay: DATEIEN_PRO_TAG,
    failClosed: true,
  });
  if (bremse.unavailable) {
    return antwort({ ok: false, fehler: "Der Upload ist gerade nicht moeglich. Bitte versuche es gleich noch einmal." }, 503);
  }
  if (bremse.exceeded) {
    return antwort({ ok: false, fehler: "Zu viele Dateien in kurzer Zeit. Bitte versuche es spaeter noch einmal." }, 429);
  }

  // Ohne Laengenangabe kein Upload: Sonst liest der Server erst alles ein,
  // bevor er die Groesse kennt.
  const laenge = Number(req.headers.get("content-length") ?? "");
  if (!Number.isFinite(laenge) || laenge <= 0) return antwort({ ok: false, fehler: "Laenge fehlt." }, 411);
  if (laenge > MAX_DATEI + 64 * 1024) return antwort({ ok: false, fehler: "Die Datei ist zu gross." }, 413);

  const formular = await req.formData().catch(() => null);
  const datei = formular?.get("datei");
  if (!(datei instanceof File)) return antwort({ ok: false, fehler: "Keine Datei." }, 400);
  if (datei.size > MAX_DATEI) return antwort({ ok: false, fehler: "Die Datei ist zu gross." }, 413);

  const bytes = new Uint8Array(await datei.arrayBuffer());
  const typ = dateityp(bytes);
  if (!typ) return antwort({ ok: false, fehler: "Nur Bilder." }, 415);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // Der Ordner kommt aus der Anmeldung, nicht aus dem Koerper; ohne gueltige
  // Anmeldung `public`. Der Name entsteht hier, nicht im Browser.
  let ordner = "public";
  const kopf = req.headers.get("Authorization") || "";
  const jwt = kopf.toLowerCase().startsWith("bearer ") ? kopf.slice(7) : "";
  if (jwt) {
    const { data } = await admin.auth.getUser(jwt);
    if (data?.user?.id) ordner = data.user.id;
  }
  const pfad = `einreichungen/${ordner}/${Date.now()}_${crypto.randomUUID()}.${typ.endung}`;
  const { error } = await admin.storage
    .from("objekt-medien")
    .upload(pfad, bytes, { contentType: typ.mime, upsert: false });
  if (error) {
    console.error("submit-objekt-einreichung upload:", error.message);
    return antwort({ ok: false, fehler: "Die Datei konnte nicht abgelegt werden." }, 500);
  }
  const url = admin.storage.from("objekt-medien").getPublicUrl(pfad).data.publicUrl;
  return antwort({ ok: true, url });
}

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ ok: false, fehler: "method_not_allowed" }, 405);

  try {
    if ((req.headers.get("content-type") || "").toLowerCase().startsWith("multipart/form-data")) {
      return await dateiHochladen(req);
    }

    const roh = await req.text();
    if (roh.length > MAX_KOERPER) {
      return antwort({ ok: false, fehler: "Die Einreichung ist zu gross." }, 413);
    }

    let koerper: Record<string, unknown>;
    try {
      koerper = JSON.parse(roh || "{}") as Record<string, unknown>;
    } catch {
      return antwort({ ok: false, fehler: "Ungueltige Daten." }, 400);
    }

    // 1) Honigtopf. Freundlich antworten, nichts schreiben.
    const honigtopf = koerper.hp;
    if (typeof honigtopf === "string" && honigtopf.trim().length > 0) {
      return antwort({ ok: true });
    }

    // 2) Kontingent je Anschluss.
    const bremse = await checkEdgeRateLimit({
      scope: "objekt-einreichung",
      key: `ip:${clientIp(req)}`,
      perHour: PRO_STUNDE,
      perDay: PRO_TAG,
      failClosed: true,
    });
    if (bremse.unavailable) {
      return antwort({ ok: false, fehler: "Der Versand ist gerade nicht moeglich. Bitte versuche es gleich noch einmal." }, 503);
    }
    if (bremse.exceeded) {
      return new Response(
        JSON.stringify({
          ok: false,
          fehler: "Zu viele Einreichungen in kurzer Zeit. Bitte versuche es spaeter noch einmal.",
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(bremse.retryAfterSeconds ?? 3600),
          },
        },
      );
    }

    const zeile = koerper.zeile;
    if (!zeile || typeof zeile !== "object" || Array.isArray(zeile)) {
      return antwort({ ok: false, fehler: "Ungueltige Daten." }, 400);
    }
    const daten = { ...(zeile as Record<string, unknown>) };
    for (const feld of INTERNE_FELDER) delete daten[feld];

    // Ohne Adresse ist die Einreichung wertlos. Die ausfuehrliche Pruefung
    // macht das Formular, hier steht nur der Mindestbestand.
    const text = (wert: unknown) => (typeof wert === "string" ? wert.trim() : "");
    if (!text(daten.strasse) || !text(daten.ort)) {
      return antwort({ ok: false, fehler: "Strasse und Ort fehlen." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    /* Die Kennung des Einreichers kommt aus der Anmeldung und nicht aus dem
       Koerper. Sonst koennte jeder eine fremde Kennung eintragen. Ohne
       Anmeldung bleibt es bei der Nullkennung, so war es auch bisher. */
    let benutzerId = OHNE_ANMELDUNG;
    const kopf = req.headers.get("Authorization") || "";
    const jwt = kopf.toLowerCase().startsWith("bearer ") ? kopf.slice(7) : "";
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt);
      if (data?.user?.id) benutzerId = data.user.id;
    }

    const { data: neu, error } = await admin
      .from("objekt_einreichungen")
      .insert({ ...daten, benutzer_id: benutzerId, status: "eingereicht" })
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("submit-objekt-einreichung insert:", error.message);
      /* Die Meldung geht unveraendert zurueck. Das Formular unterscheidet
         daran den einen Fall, den es selbst auffangen kann: die noch nicht
         angelegte Spalte `details`. */
      return antwort({ ok: false, fehler: error.message }, 200);
    }

    return antwort({ ok: true, id: neu?.id ?? null });
  } catch (e) {
    console.error("submit-objekt-einreichung:", e);
    return antwort({ ok: false, fehler: "Unerwarteter Fehler." }, 500);
  }
});
