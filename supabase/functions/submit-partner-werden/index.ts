/**
 * Die Anfrage von der öffentlichen Seite „Partner werden“ (/partner-werden).
 *
 * Legt einen neuen Lead im Bewerberprozess an (Tabelle `bewerbungen`, Status
 * „Eingang“, Quelle „Partner werden“) und meldet ihn per Glocke an die
 * HR-Rolle. Sonst nichts: keine Mail an den Bewerber, keine persönliche
 * Bewerberseite, kein Kennenlernbogen, keine Erinnerungskette (Christian am
 * 30.09.2026: „Neuer Lead, keine Automatik“). Deshalb läuft das hier nicht
 * über `submit-bewerbung`, das genau diese Schritte anstößt und reCAPTCHA
 * verlangt.
 *
 * Schutz, weil die Adresse ohne Anmeldung erreichbar ist:
 *   - Bremse je IP über `check_rate_limit` (10 je Stunde, 30 je Tag),
 *   - Honigtopf und Zeitfalle: freundliches „ok“, geschrieben wird nichts,
 *   - Weg, Bereich, Fragen und Antworten nur aus `_shared/partner-werden.ts`,
 *   - Einwilligung Pflicht, in genau der Fassung und dem Wortlaut der Seite,
 *   - Kampagnenkennung gesäubert (`_shared/kampagne.ts`),
 *   - geschrieben wird allein mit der Service-Rolle.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { bewerberPfad, ladeHrEmpfaenger, schreibeGlocke } from "../_shared/hr-benachrichtigung.ts";
import { saeubereKampagne } from "../_shared/kampagne.ts";
import {
  PARTNER_WERDEN_QUELLE,
  istStilleAblehnung,
  partnerStelleTitel,
  partnerWerdenMeta,
  pruefePartnerAnfrage,
} from "../_shared/partner-werden.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Eine Anfrage ist klein. Alles darüber ist kein Formular. */
const MAX_RUMPF = 20_000;

function antwort(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);

  try {
    const rl = await checkEdgeRateLimit({ scope: "submit-partner-werden", key: clientIp(req), perHour: 10, perDay: 30 });
    if (rl.exceeded) {
      return antwort(
        { error: "rate_limited", message: "Zu viele Anfragen. Bitte versuch es später noch einmal." },
        429,
        { "Retry-After": String(rl.retryAfterSeconds ?? 3600) },
      );
    }

    const roh = await req.text();
    if (roh.length > MAX_RUMPF) return antwort({ error: "Anfrage zu groß" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(roh);
    } catch {
      return antwort({ error: "Ungültige Anfrage" }, 400);
    }

    if (istStilleAblehnung(body)) return antwort({ ok: true });

    const geprueft = pruefePartnerAnfrage(body);
    if (!geprueft.ok) return antwort({ error: "ungueltig", message: geprueft.fehler }, 400);
    const a = geprueft.anfrage;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const id = crypto.randomUUID();
    const beworben = new Date().toISOString();
    const stelleTitel = partnerStelleTitel(a.weg, a.rolle);
    const pw = partnerWerdenMeta(a);
    const kampagne = saeubereKampagne((body as Record<string, unknown>).kampagne);

    const { error } = await admin.from("bewerbungen").insert({
      id,
      vorname: a.kontakt.vorname,
      nachname: a.kontakt.nachname,
      email: a.kontakt.email,
      telefon: a.kontakt.telefon,
      position: stelleTitel,
      status: "Eingang",
      nachricht: "",
      notizen: "",
      meta: {
        ort: "",
        quelle: PARTNER_WERDEN_QUELLE,
        beworben,
        stelleId: "partner-werden",
        stelleTitel,
        bewertung: 0,
        erfahrung: "",
        beschaeftigungsart: `Selbstständig, ${pw.wegText}`,
        lebenslaufUrl: "",
        dokumente: [],
        vertragStatus: "nicht_gesendet",
        feedback: [],
        benachrichtigungen: [],
        chatVerknuepft: false,
        notizenLog: [],
        _type: "bewerber",
        _source: "partner_werden",
        // Das Kennzeichen, an dem Nachfass-Auswahl und Bewerberakte diese
        // Leads erkennen. Nur hier gesetzt.
        partnerWerden: pw,
        einwilligung: a.einwilligung,
        ...(kampagne ? { kampagne } : {}),
        // Gehört in den Bewerberprozess, passend zu PROZESS_NEU in
        // src/lib/bewerberprozessZuordnung.ts (wie submit-bewerbung).
        prozess: "neu",
      },
    });
    if (error) {
      console.error("[submit-partner-werden] Speichern fehlgeschlagen", error);
      return antwort({ error: "Speichern fehlgeschlagen", message: "Das hat leider nicht geklappt. Bitte versuch es gleich noch einmal." }, 500);
    }

    // Nur die Glocke, keine Mail. Best-Effort: Der Lead ist gespeichert.
    const name = `${a.kontakt.vorname} ${a.kontakt.nachname}`.trim();
    const { glockenIds } = await ladeHrEmpfaenger(admin);
    await schreibeGlocke(admin, glockenIds, {
      titel: `Neuer Lead: ${name}`,
      nachricht: `${name} hat sich über „Partner werden“ als ${pw.wegText} (${pw.rolleText}) eingetragen. Es läuft keine Automatik, bitte anrufen.`,
      link: bewerberPfad(id),
    });

    return antwort({ ok: true });
  } catch (e) {
    console.error("[submit-partner-werden] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler", message: "Das hat leider nicht geklappt. Bitte versuch es gleich noch einmal." }, 500);
  }
});
