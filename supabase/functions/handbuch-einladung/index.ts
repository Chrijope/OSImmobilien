/**
 * Handbuch für einen Lead, den es schon gibt (seit 30.09.2026).
 *
 * Die Willkommensmail nach der Zuweisung (send-lead-zuweisung-mail) trägt
 * einen persönlichen Link /handbuch-einladung/<token>. Der Lead beantwortet
 * dort die sechs Fragen wie im normalen Konfigurator, tippt aber keine
 * Kontaktdaten mehr ein: Er sieht Vorname und gekürzte Mail und setzt nur den
 * Pflicht-Haken zur Einwilligung (Entscheidung Christian, 30.09.2026).
 *
 * Öffentlich (verify_jwt = false), zwei Aktionen:
 *   lesen     Token → Vorname, gekürzte Mail, Partnerkürzel. Kein Nachname,
 *             kein Telefon, nichts änderbar. Eine weitergeleitete Mail soll
 *             niemandem die Daten des Leads zeigen oder umbiegen lassen.
 *   absenden  Token, sechs Antworten, Einwilligung. Danach derselbe Weg wie
 *             eine über die Mail erkannte Dublette in submit-lead: Stand am
 *             Kontakt (der erste bleibt), Handbuch-Zeile, Mail an die
 *             GESPEICHERTE Adresse, keine Links an den Browser. Dazu eine
 *             Glocke an den zuständigen Partner.
 *
 * Das Token steht in `kontakte.meta.handbuchEinladung` ({ token, gueltigBis }),
 * dafür ist keine Migration nötig.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import {
  crmFelder,
  ermittleAusgang,
  handbuchRahmen,
  istHandbuchToken,
  leadNotiz,
  neuesHandbuchToken,
  pruefeAntworten,
} from "../_shared/handbuch-funnel.ts";
import {
  handbuchDublettenAntwort,
  handbuchFunnelFuerDublette,
  handbuchNachLeadAnlegen,
} from "../_shared/handbuch-anlage.ts";
import { handbuchEinwilligungGueltig, leseEinwilligung } from "../_shared/lead-einwilligung.ts";
import { einladungGueltig, maskiereEmail } from "../_shared/handbuch-einladung.ts";
import { spracheAusMeta } from "../_shared/kunden-sprache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);

  const ip = clientIp(req);
  const bremseIp = await checkEdgeRateLimit({ scope: "handbuch-einladung", key: ip, perHour: 30, perDay: 200 });
  if (bremseIp.exceeded) return antwort({ error: "Zu viele Anfragen" }, 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return antwort({ error: "Ungültige Anfrage" }, 400);
  }
  const token = body.token;
  // Gleiche Form wie ein Handbuch-Token: 64 Zeichen Zufall.
  if (!istHandbuchToken(token)) return antwort({ error: "Link unbekannt" }, 404);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: kontakt, error: ladeFehler } = await admin
    .from("kontakte")
    .select("id, vorname, nachname, email, notizen, meta, zustaendig_id, geloescht")
    .eq("meta->handbuchEinladung->>token", token)
    .maybeSingle();
  if (ladeFehler) {
    console.error("[handbuch-einladung] Kontakt nicht lesbar", ladeFehler.message);
    return antwort({ error: "Gerade nicht erreichbar" }, 500);
  }
  const meta = (kontakt?.meta && typeof kontakt.meta === "object" ? kontakt.meta : {}) as Record<string, unknown>;
  // `geloescht` ist eine Spalte, kein Feld in meta. Bis zum 04.10.2026 stand
  // hier meta.geloescht, und ein Kontakt im Papierkorb nahm den Link an.
  if (!kontakt || kontakt.geloescht === true) return antwort({ error: "Link unbekannt" }, 404);
  if (!einladungGueltig(meta.handbuchEinladung)) return antwort({ error: "Link abgelaufen", abgelaufen: true }, 410);

  let beraterSlug: string | null = null;
  if (kontakt.zustaendig_id) {
    const { data: profil } = await admin.from("profiles").select("vp_slug").eq("id", kontakt.zustaendig_id).maybeSingle();
    beraterSlug = String(profil?.vp_slug || "").trim() || null;
  }

  if (body.aktion === "lesen") {
    return antwort({
      ok: true,
      vorname: String(kontakt.vorname || "").trim(),
      emailMaskiert: maskiereEmail(String(kontakt.email || "")),
      beraterSlug,
    });
  }

  if (body.aktion !== "absenden") return antwort({ error: "Unbekannte Aktion" }, 400);

  // Je Link höchstens eine Handvoll Handbücher, gegen einen Bot mit
  // weitergeleiteter Mail. Dieselbe Größenordnung wie die Bremse je Adresse
  // in submit-lead.
  const bremseToken = await checkEdgeRateLimit({ scope: "handbuch-einladung-kontakt", key: String(kontakt.id), perHour: 5, perDay: 10 });
  if (bremseToken.exceeded) return antwort({ error: "Zu viele Anfragen" }, 429);

  const antworten = pruefeAntworten(body.antworten);
  if (!antworten) return antwort({ error: "Antworten unvollständig" }, 400);
  if (!handbuchEinwilligungGueltig(body.dsgvo_consent, "konfigurator")) {
    return antwort({ error: "Einwilligung fehlt" }, 400);
  }
  const einwilligung = leseEinwilligung(body.dsgvo_consent);
  // Der Kontakt ist bekannt, also gilt seine Profilsprache, nicht die des
  // Browsers (M14 vom 04.10.2026).
  const sprache = spracheAusMeta(meta);

  const jetzt = new Date().toISOString();
  const hbToken = neuesHandbuchToken();
  const rahmen = handbuchRahmen(antworten);
  const funnel = {
    antworten,
    ausgang: ermittleAusgang(antworten),
    rahmen: { von: rahmen.von, bis: rahmen.bis, empf: rahmen.empf },
    zeitpunkt: jetzt,
    token: hbToken,
    weg: "einladung",
  };
  const felder = crmFelder(antworten);
  const bisherigeAnfragen = Array.isArray(meta.weitereAnfragen) ? meta.weitereAnfragen : [];
  const neueMeta = {
    ...meta,
    // Der erste Konfigurator-Stand bleibt stehen, wie bei jeder Dublette.
    ...handbuchFunnelFuerDublette(meta, funnel),
    weitereAnfragen: [
      ...bisherigeAnfragen,
      {
        eingegangenAm: jetzt,
        quelle: "Handbuch-Einladung",
        erkanntUeber: "einladung",
        angaben: { handbuchFunnel: funnel, ...felder },
        ...(einwilligung ? { einwilligung } : {}),
      },
    ].slice(-25),
    letzteAnfrageAm: jetzt,
    letzteAnfrageQuelle: "Handbuch-Einladung",
  };
  const datum = new Date().toLocaleDateString("de-DE");
  const alteNotiz = String(kontakt.notizen ?? "").trim();
  const kopf = `Handbuch über die Willkommensmail am ${datum}:`;
  const { error: schreibFehler } = await admin
    .from("kontakte")
    .update({
      meta: neueMeta,
      notizen: alteNotiz ? `${alteNotiz}\n\n${kopf}\n${leadNotiz(antworten)}` : `${kopf}\n${leadNotiz(antworten)}`,
    })
    .eq("id", kontakt.id);
  if (schreibFehler) {
    console.error("[handbuch-einladung] Speichern fehlgeschlagen", schreibFehler.message);
    return antwort({ error: "Speichern fehlgeschlagen" }, 500);
  }

  const name = [kontakt.vorname, kontakt.nachname].filter(Boolean).join(" ").trim();
  const ergebnis = await handbuchNachLeadAnlegen(admin, {
    kontaktId: kontakt.id,
    beraterId: kontakt.zustaendig_id ?? null,
    vorname: String(kontakt.vorname || ""),
    nachname: String(kontakt.nachname || ""),
    email: String(kontakt.email || ""),
    antworten,
    token: hbToken,
    sprache,
    // Wie eine über die Mail erkannte Dublette: Links nur per Mail an die
    // gespeicherte Adresse, nie an den Browser.
    dublette: { erkanntUeber: "email", gespeicherteEmail: String(kontakt.email || ""), gespeicherterName: name },
  });

  // Glocke an den Zuständigen, er soll jetzt anrufen. Nur an ihn.
  if (kontakt.zustaendig_id) {
    const { error: glockeFehler } = await admin.from("benachrichtigungen").insert({
      benutzer_id: kontakt.zustaendig_id,
      titel: `📘 ${name || "Dein Lead"} hat das Handbuch geholt`,
      nachricht: `${name || "Dein Lead"} hat über die Willkommensmail die sechs Fragen beantwortet und das Handbuch bekommen. Jetzt ist ein guter Moment für den Anruf.`,
      link: `/kunden/${kontakt.id}`,
      gelesen: false,
    });
    if (glockeFehler) console.error("[handbuch-einladung] Glocke fehlgeschlagen", glockeFehler.message);
  }

  return antwort(handbuchDublettenAntwort(ergebnis));
});
