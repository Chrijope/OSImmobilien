import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { meldeErneuteBewerbung, meldeNeuenBewerber } from "../_shared/hr-benachrichtigung.ts";
import { findeBewerbungNachEmail, metaMitWeitererBewerbung } from "../_shared/bewerber-dublette.ts";
import { sorgeFuerBewerberSeite } from "../_shared/bewerber-seite.ts";
import { versendeKennenlernen } from "../_shared/kennenlernen-versand.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-zapier-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ZAPIER_SECRET = Deno.env.get("ZAPIER_WEBHOOK_SECRET") || "";

// Hilfsfunktion: nimmt das erste vorhandene Feld aus mehreren möglichen Schlüsseln
function pick(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return "";
}

function splitName(full: string): { vorname: string; nachname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { vorname: "", nachname: "" };
  if (parts.length === 1) return { vorname: parts[0], nachname: "" };
  return { vorname: parts[0], nachname: parts.slice(1).join(" ") };
}

/*
 * Die Eingangsmail anstossen und das Ergebnis festhalten.
 *
 * Vorher wurde der Rueckgabewert von `invoke` weggeworfen. Das ist bei
 * supabase-js gefaehrlich, denn ein 401 oder 403 wirft keine Ausnahme: Das
 * `catch` greift nie, und der Aufrufer meldet trotzdem Erfolg. Genau so blieb
 * der Ausfall vom 10.09.2026 wochenlang unsichtbar.
 *
 * Jetzt gilt: Schlaegt der Versand fehl, steht das am Bewerber, und zwar mit
 * Grund. Die Bewerbung selbst bleibt gespeichert, denn sie ist das
 * Wichtigere. Der Bewerber ist nicht verloren, nur seine Mail fehlt, und HR
 * sieht das im Profil.
 */
async function stosseEingangsmailAn(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bewerbungId: string,
  quelle: string,
): Promise<void> {
  try {
    /*
     * Direkt im selben Prozess, seit dem 15.09.2026.
     *
     * Vorher lief der Versand ueber einen zweiten Netzaufruf an die Function
     * `send-bewerber-kennenlernen`, ausgewiesen mit einem gemeinsamen
     * Geheimnis. Dieser Umweg ist immer wieder mit „non-2xx" gescheitert, und
     * zwar still: Die Bewerbung stand im CRM, die Mail kam nie an, und HR
     * musste sie von Hand nachschicken. Ein Aufruf ueber das Netz kann an der
     * Anmeldung, am Tor der Plattform und an der Rechtepruefung scheitern,
     * obwohl hier ohnehin schon mit der Service-Rolle gearbeitet wird.
     *
     * Jetzt ruft der Eingang dasselbe Modul auf, das auch die Function
     * benutzt. Es gibt keinen zweiten Aufruf mehr, also nichts, was daran
     * scheitern koennte.
     */
    const ergebnis = await versendeKennenlernen(admin, { bewerbungId });
    if (!ergebnis.versandt) {
      const grund = ergebnis.grund || String(ergebnis.koerper?.error || "unbekannt");
      console.error(`[${quelle}] Eingangsmail fehlgeschlagen`, bewerbungId, grund);
      await vermerkeVersandFehler(admin, bewerbungId, grund);
    }
  } catch (e) {
    console.error(`[${quelle}] Eingangsmail warf eine Ausnahme`, bewerbungId, e);
    await vermerkeVersandFehler(admin, bewerbungId, String(e));
  }
}

/** Traegt den Fehlschlag am Bewerber ein, damit HR ihn im Profil sieht. */
async function vermerkeVersandFehler(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bewerbungId: string,
  grund: string,
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("bewerbungen")
      .select("meta")
      .eq("id", bewerbungId)
      .maybeSingle();
    const meta = ((row?.meta || {}) as Record<string, unknown>);
    const bisher = (typeof meta.kennenlernen === "object" && meta.kennenlernen ? meta.kennenlernen : {}) as Record<string, unknown>;
    await admin
      .from("bewerbungen")
      .update({
        meta: {
          ...meta,
          kennenlernen: { ...bisher, versandOk: false, versandGrund: grund, versandVersuchAm: new Date().toISOString() },
        },
      })
      .eq("id", bewerbungId);
  } catch (e) {
    console.error("[vermerkeVersandFehler] konnte nicht schreiben", bewerbungId, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Shared-Secret-Auth (Header ODER Query ?secret=...)
  const url = new URL(req.url);
  const providedSecret =
    req.headers.get("x-zapier-secret") ||
    url.searchParams.get("secret") ||
    "";
  if (!ZAPIER_SECRET || providedSecret !== ZAPIER_SECRET) {
    console.warn("[zapier-bewerber-webhook] unauthorized");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Flache Map — Zapier kann je nach Trigger unterschiedliche Feldnamen liefern.
  // Wir akzeptieren möglichst viele Aliase (Meta Lead Ads, Facebook Lead Ads, generisch).
  let vorname = pick(body, ["vorname", "first_name", "firstName", "given_name"]);
  let nachname = pick(body, ["nachname", "last_name", "lastName", "family_name"]);
  const fullName = pick(body, ["full_name", "fullName", "name"]);
  if ((!vorname || !nachname) && fullName) {
    const split = splitName(fullName);
    if (!vorname) vorname = split.vorname;
    if (!nachname) nachname = split.nachname;
  }

  const email = pick(body, ["email", "email_address", "e_mail"]).toLowerCase();
  const telefon = pick(body, [
    "telefon", "phone", "phone_number", "phoneNumber", "mobile", "handy",
  ]);
  const ort = pick(body, ["ort", "city", "stadt", "location"]);
  // Zapier-Leads sollen immer als "Vertriebspartner" angelegt werden,
  // unabhängig davon, was im Payload steht.
  const stelleTitel = "Vertriebspartner";
  const erfahrung = pick(body, ["erfahrung", "experience", "berufserfahrung"]);
  const motivation = pick(body, [
    "motivation", "nachricht", "message", "comment", "kommentar", "warum",
  ]);
  const quelle =
    pick(body, ["quelle", "source", "platform", "lead_source", "kampagne"]) ||
    "Meta (Zapier)";

  // Neue Meta-Bewerbungsfragen (Zapier liefert i. d. R. snake_case)
  const vertriebserfahrung = pick(body, ["vertriebserfahrung"]);
  const vertriebsbereich = pick(body, ["vertriebsbereich"]);
  const immobilienErfahrung = pick(body, ["immobilienErfahrung", "immobilien_erfahrung"]);
  const monatlichesEinkommen = pick(body, ["monatlichesEinkommen", "monatliches_einkommen"]);
  const stundenProWoche = pick(body, ["stundenProWoche", "stunden_pro_woche"]);
  const aktuelleSituation = pick(body, ["aktuelleSituation", "aktuelle_situation"]);
  const alter = pick(body, ["alter", "age"]);
  const adId = pick(body, ["ad_id", "adId"]);
  const pageName = pick(body, ["page_name", "pageName"]);
  const formName = pick(body, ["form_name", "formName"]);

  if (!email && !telefon) {
    return new Response(
      JSON.stringify({ error: "email oder telefon erforderlich" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!vorname && !nachname && fullName) {
    // Wenn nichts gesetzt war, nimm fullName als Nachname
    nachname = fullName;
  }
  // Fehlt ein Teil des Namens, bleibt er leer. Bis zum 04.10.2026 stand hier
  // ein Gedankenstrich, und der landete in Anrede und Mails.

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Zweite Bewerbung derselben Adresse: an die bestehende haengen und HR
  // informieren, siehe _shared/bewerber-dublette.ts. Scheitert die Suche,
  // lieber eine Dublette als eine verlorene Bewerbung.
  if (email) {
    let existing: Awaited<ReturnType<typeof findeBewerbungNachEmail>> = null;
    try {
      existing = await findeBewerbungNachEmail(admin, email);
    } catch (e) {
      console.error("[zapier-bewerber-webhook] Dublettensuche fehlgeschlagen", e);
    }
    if (existing?.id) {
      const eingegangenAm = new Date().toISOString();
      const neueMeta = metaMitWeitererBewerbung(existing.meta, {
        eingegangenAm,
        quelle,
        angaben: {
          vorname, nachname, telefon, ort, motivation, erfahrung,
          vertriebserfahrung, vertriebsbereich, immobilienErfahrung, monatlichesEinkommen,
          stundenProWoche, aktuelleSituation, alter, adId, pageName, formName,
          _source: "zapier_meta",
        },
      });
      const { error: anhangFehler } = await admin
        .from("bewerbungen")
        .update({ meta: neueMeta, ...(!String(existing.telefon || "").trim() && telefon ? { telefon } : {}) })
        .eq("id", existing.id);
      if (anhangFehler) {
        console.error("[zapier-bewerber-webhook] Anhaengen fehlgeschlagen", anhangFehler);
        return new Response(JSON.stringify({ error: "Speichern fehlgeschlagen" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await meldeErneuteBewerbung(admin, {
        id: existing.id,
        name: `${existing.vorname || ""} ${existing.nachname || ""}`.trim() || `${vorname} ${nachname}`.trim(),
        quelle,
      });
      return new Response(
        JSON.stringify({ ok: true, duplicate: true, id: existing.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  const id = crypto.randomUUID();
  const beworben = new Date().toISOString();

  const { error } = await admin.from("bewerbungen").insert({
    id,
    vorname,
    nachname,
    email: email || `unbekannt+${id}@noemail.local`,
    telefon,
    position: stelleTitel,
    status: "Eingang",
    nachricht: motivation,
    notizen: "",
    meta: {
      ort,
      quelle,
      beworben,
      stelleId: "meta-zapier",
      stelleTitel,
      bewertung: 0,
      erfahrung,
      beschaeftigungsart: "",
      dokumente: [],
      vertragStatus: "nicht_gesendet",
      feedback: [],
      benachrichtigungen: [],
      chatVerknuepft: false,
      notizenLog: [],
      _type: "bewerber",
      _source: "zapier_meta",
      /*
       * Wie im Bewerbungseingang der Karriereseite: Ohne dieses Kennzeichen
       * landet der Lead im alten Bewerbungsmanagement. Der Wert muss zu
       * PROZESS_NEU in src/lib/bewerberprozessZuordnung.ts passen.
       */
      prozess: "neu",
      vertriebserfahrung,
      vertriebsbereich,
      immobilienErfahrung,
      monatlichesEinkommen,
      stundenProWoche,
      aktuelleSituation,
      alter,
      adId,
      pageName,
      formName,
      _raw: body,
    },
  });

  if (error) {
    console.error("[zapier-bewerber-webhook] insert failed", error);
    return new Response(JSON.stringify({ error: "Speichern fehlgeschlagen" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  /*
   * Die persönliche Seite entsteht mit dem Eingang der Bewerbung, auf allen
   * Eingangswegen gleich. Ein Bewerber aus einer Anzeige bekommt dieselbe
   * Seite wie einer über das Formular; sonst hängt sein ganzer Prozess wieder
   * an einer einzigen Mail. Best-Effort, wie in `submit-bewerbung`.
   */
  await sorgeFuerBewerberSeite(admin as never, id);

  // Interne Meldung an die HR-Rolle.
  //
  // Hier stand vorher eine feste Nutzer-ID für Christian Peetz neben der
  // HR-Rolle. Eine ID im Code veraltet unbemerkt, sobald sich ein Konto ändert,
  // und niemand merkt, dass die Meldung ins Leere geht. Jetzt entscheidet
  // ausschließlich die Rolle, wie in submit-bewerbung auch.
  await meldeNeuenBewerber(admin, {
    id,
    vorname,
    nachname,
    email,
    telefon,
    ort,
    quelle,
    stelleTitel,
    beworbenAm: beworben,
    /*
     * Die vier Bewerbungsfragen der Anzeige gehen mit in die Meldung.
     *
     * Nur dieser Eingangsweg hat sie: Der Bewerber beantwortet sie beim Klick
     * auf die Anzeige, also bevor diese Mail hinausgeht. Daraus entsteht in
     * `meldeNeuenBewerber` die Vorabeinschaetzung. Der Kennenlernbogen ist zu
     * diesem Zeitpunkt noch nicht ausgefuellt, der richtige Score existiert
     * also noch gar nicht und kann hier auch nicht stehen.
     */
    metaAngaben: {
      immobilienErfahrung,
      vertriebsbereich,
      vertriebserfahrung,
      stundenProWoche,
    },
  });

  /*
   * Eingangsbestaetigung mit dem Kennenlernbogen (Best-Effort). Alle
   * Eingangskanaele loesen dieselbe Mail aus, damit jeder Bewerber dieselbe
   * Strecke durchlaeuft; seit dem Umzug ist das der Kennenlernbogen.
   */
  try {
    if (email && !email.endsWith("@noemail.local")) {
      await stosseEingangsmailAn(admin, id, "zapier-bewerber-webhook");
    }
  } catch (e) {
    console.error("[zapier-bewerber-webhook] Kennenlern-Einladung fehlgeschlagen", e);
  }

  return new Response(JSON.stringify({ ok: true, id }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});