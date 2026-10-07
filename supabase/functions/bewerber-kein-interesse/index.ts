import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { bewerberPfad, ladeHrEmpfaenger, schreibeGlocke } from "../_shared/hr-benachrichtigung.ts";
import {
  ABMELDUNG_AUTOR,
  SELBST_ABGEMELDET_ABSAGEGRUND,
  abmeldungAbgelaufen,
  abmeldungsGlocke,
  abmeldungsNotiz,
  pruefeKeinInteresseAnfrage,
  zielStatusNachAbmeldung,
} from "../_shared/bewerber-nachfass.ts";

/**
 * Nimmt die Abmeldung „Kein Interesse mehr" aus der Nachfass-Mail entgegen.
 *
 * Öffentlich (verify_jwt = false), nur POST. Der Browser des Bewerbers hat
 * keinerlei Tabellenzugriff, geschrieben wird ausschließlich hier über die
 * Service-Rolle. Geprüft werden Tokenform, Honigtopf, Rate-Limit je Absender
 * und der Zustand des Tokens. Erst dann:
 *
 *   bewerbungen.status      → KeinInteresse (derselbe Wert wie die Absage aus
 *                             dem Erstgespräch), sofern der Bewerber noch in
 *                             einer frühen Stufe steht
 *   meta.selbstAbgemeldetAm, meta.selbstAbgemeldetGrund
 *   meta.erstgespraechSkript.absageGrund und .abgelehntAm, damit die
 *                             vorhandene Absage-Anzeige greift
 *   meta.notizenLog         → Eintrag mit Autor „Bewerber per Mail"
 *   Glocke an alle mit Rolle hr, Muster „Fragebogen ausgefüllt"
 *
 * Ein zweiter Klick ist idempotent: Das Token wird atomar verbraucht (nur die
 * Zeile mit Status „offen" wird umgeschrieben), und wer es nicht gewinnt,
 * bekommt dieselbe Antwort wie beim ersten Mal. Abgelaufene Token (90 Tage)
 * gelten als ungültig. Diese Function verschickt keine Mail und legt nichts
 * an, sie taugt nicht als Versandwerkzeug.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function antwort(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const geprueft = pruefeKeinInteresseAnfrage(body);
    if (!geprueft.ok) {
      // Bot bekommt eine freundliche Antwort, wir schreiben nichts.
      if (geprueft.bot) return antwort({ ok: true });
      return antwort({ error: geprueft.fehler }, 400);
    }
    const { token, grund } = geprueft.anfrage;

    // Etwa 20 Abmeldungen je Absender und Stunde reichen für jeden Menschen.
    const limit = await checkEdgeRateLimit({
      scope: "bewerber-kein-interesse",
      key: `ip:${clientIp(req)}`,
      perHour: 20,
    });
    if (!limit.ok) {
      return antwort({ error: "Zu viele Anfragen. Bitte in einer Stunde noch einmal versuchen." }, 429);
    }

    const { data: abmeldung, error: leseFehler } = await admin
      .from("bewerber_abmeldung")
      .select("id, bewerbung_id, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (leseFehler || !abmeldung) {
      if (leseFehler) console.error("[bewerber-kein-interesse] Token nicht lesbar", leseFehler);
      return antwort({ error: "Link unbekannt" }, 404);
    }
    // Zweiter Klick: dieselbe Antwort wie beim ersten, nichts wird geändert.
    if (abmeldung.status === "bestaetigt") return antwort({ ok: true, bereits: true });
    if (abmeldung.status !== "offen") return antwort({ error: "Link nicht mehr gültig" }, 410);
    if (abmeldungAbgelaufen(abmeldung.expires_at)) return antwort({ error: "Link abgelaufen" }, 410);

    const jetzt = new Date().toISOString();

    // Das Token zuerst und atomar verbrauchen: nur die Zeile, die noch
    // „offen" ist, wird umgeschrieben. Klicken zwei Anfragen gleichzeitig,
    // gewinnt genau eine; die andere findet keine Zeile mehr und bekommt
    // dieselbe Antwort wie ein zweiter Klick. So gibt es nie zwei
    // Verlaufseinträge oder zwei Glocken für dieselbe Abmeldung.
    const { data: verbraucht, error: tokenFehler } = await admin
      .from("bewerber_abmeldung")
      .update({ status: "bestaetigt", verwendet_am: jetzt, grund: grund || null })
      .eq("id", abmeldung.id)
      .eq("status", "offen")
      .select("id");
    if (tokenFehler) {
      console.error("[bewerber-kein-interesse] Token nicht verbraucht", tokenFehler);
      return antwort({ error: "Speichern fehlgeschlagen" }, 500);
    }
    if (!verbraucht || verbraucht.length === 0) return antwort({ ok: true, bereits: true });

    // Ab hier hat diese Anfrage das Token gewonnen. Scheitert das Schreiben
    // in die Akte, wird das Token wieder freigegeben, damit der Bewerber es
    // erneut versuchen kann.
    const tokenFreigeben = async () => {
      const { error } = await admin
        .from("bewerber_abmeldung")
        .update({ status: "offen", verwendet_am: null, grund: null })
        .eq("id", abmeldung.id)
        .eq("status", "bestaetigt");
      if (error) console.error("[bewerber-kein-interesse] Token nicht freigegeben", error);
    };

    const { data: bewerber, error: bewerberFehler } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, status, meta")
      .eq("id", abmeldung.bewerbung_id)
      .maybeSingle();

    if (bewerberFehler || !bewerber) {
      console.error("[bewerber-kein-interesse] Bewerber nicht gefunden", bewerberFehler);
      await tokenFreigeben();
      return antwort({ error: "Link unbekannt" }, 404);
    }

    const meta = (bewerber.meta && typeof bewerber.meta === "object" ? bewerber.meta : {}) as Record<string, unknown>;
    const alterStatus = String(bewerber.status || "");
    const neuerStatus = zielStatusNachAbmeldung(alterStatus);
    const statusGeaendert = neuerStatus !== null;

    const skript = (meta.erstgespraechSkript && typeof meta.erstgespraechSkript === "object"
      ? meta.erstgespraechSkript
      : {}) as Record<string, unknown>;
    const notizenLog = Array.isArray(meta.notizenLog) ? meta.notizenLog : [];
    const notiz = {
      id: crypto.randomUUID(),
      text: abmeldungsNotiz(grund, statusGeaendert, alterStatus),
      datum: jetzt,
      autor: ABMELDUNG_AUTOR,
      autorId: "",
    };

    const neuesMeta: Record<string, unknown> = {
      ...meta,
      selbstAbgemeldetAm: jetzt,
      selbstAbgemeldetGrund: grund,
      notizenLog: [notiz, ...notizenLog],
      // Nur bei echter Statusänderung als Absage vermerken. Sonst stünde bei
      // einem aktiven Partner ein Absagegrund in der Akte.
      ...(statusGeaendert
        ? {
          erstgespraechSkript: {
            ...skript,
            absageGrund: SELBST_ABGEMELDET_ABSAGEGRUND,
            abgelehntAm: jetzt,
            abgelehntVon: ABMELDUNG_AUTOR,
          },
        }
        : {}),
    };

    const { error: schreibFehler } = await admin
      .from("bewerbungen")
      .update({
        meta: neuesMeta,
        ...(statusGeaendert ? { status: neuerStatus } : {}),
      })
      .eq("id", bewerber.id);

    if (schreibFehler) {
      console.error("[bewerber-kein-interesse] Speichern fehlgeschlagen", schreibFehler);
      await tokenFreigeben();
      return antwort({ error: "Speichern fehlgeschlagen" }, 500);
    }

    // Glocke an HR, best-effort. Nur die Anfrage, die das Token gewonnen hat,
    // kommt bis hierher.
    try {
      const name = `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim();
      const { glockenIds } = await ladeHrEmpfaenger(admin);
      await schreibeGlocke(admin, glockenIds, {
        ...abmeldungsGlocke(name, grund, statusGeaendert, alterStatus),
        link: bewerberPfad(bewerber.id),
      });
    } catch (e) {
      console.error("[bewerber-kein-interesse] Glocke fehlgeschlagen", e);
    }

    return antwort({ ok: true });
  } catch (e) {
    console.error("[bewerber-kein-interesse] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler" }, 500);
  }
});
