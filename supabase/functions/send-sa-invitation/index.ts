import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { logActivityFromEdge } from "../_shared/activity-log.ts";
import { sendeVorlage } from '../_shared/transactional-versand.ts';
import { zustaendigerAnsprechpartner } from '../_shared/zustaendiger-ansprechpartner.ts';
import { berlinerZeitNachUtc } from '../_shared/notar-zeitpunkt.ts';
import { andereAdresseOffen, rpcFehlt, saLinkAblauf, saPersonNr } from '../_shared/sa-fester-link.ts';
import { empfaengerAusKontakt, pruefeKontaktZugriff } from '../_shared/kontakt-signatur-zugriff.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SA_FILL_BASE_URL = "https://osimmobilien.netlify.app/sa";

const BERLIN_TAG = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric", month: "2-digit", day: "2-digit",
});

/**
 * Der Zeitpunkt in N Tagen, morgens um neun deutscher Ortszeit, als UTC.
 *
 * Ohne diese Umrechnung erbte die Aufgabe die Uhrzeit des Versands. Wer
 * abends um halb elf eine Einladung verschickt, bekaeme die Aufgabe zwei
 * Wochen spaeter um halb elf nachts. Cron und Deno rechnen in UTC, die
 * Bueroezeit ist aber Berliner Wanduhrzeit, und die verschiebt sich zweimal im
 * Jahr um eine Stunde. `berlinerZeitNachUtc` behandelt genau das.
 */
function morgensInTagen(tage: number): string {
  const tag = BERLIN_TAG.format(new Date(Date.now() + tage * 24 * 60 * 60 * 1000));
  const zeitpunkt = berlinerZeitNachUtc(tag, "09:00");
  // Faellt die Umrechnung aus, lieber die schlichte Rechnung als gar keine
  // Erinnerung.
  return (zeitpunkt ?? new Date(Date.now() + tage * 24 * 60 * 60 * 1000)).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate-Limit: 20/h, 100/Tag pro Nutzer
    const rl = await checkRateLimit(req, caller.id, { scope: "send-sa-invitation", perHour: 20, perDay: 100 });
    if (!rl.ok) return rateLimitErrorBody("send-sa-invitation", rl, corsHeaders);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const anfrage = await req.json();
    const { kontaktId, investmentId, prefillData } = anfrage;
    const personNr = saPersonNr(anfrage.personNr);
    const antwort = (status: number, error: string) =>
      new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!kontaktId || !investmentId || personNr === null) return antwort(400, "Pflichtfelder fehlen");

    /*
     * Berechtigung, bevor der Service-Role-Schluessel irgendetwas anfasst
     * (Pruefung vom 07.10.2026). Vorher genuegte eine Anmeldung: Jeder
     * angemeldete Nutzer, auch ein Kunde, konnte fuer eine fremde Kennung
     * einen Link an eine beliebige Adresse ausstellen lassen.
     *   1. Der Aufrufer darf diesen Kontakt im CRM bearbeiten (dieselben
     *      Regeln wie die Tabelle `kontakte`), der Kunde selbst zaehlt hier
     *      nicht: Die Einladung verschickt nur das CRM.
     *   2. Das Investment gehoert zu diesem Kontakt.
     *   3. Empfaenger ist immer die Adresse am Kontakt (Person 2: ihre eigene,
     *      sonst die von Person 1), nie eine aus der Anfrage. So arbeitet auch
     *      `send-signature-request`. Eine geaenderte Adresse traegt der Berater
     *      zuerst am Kontakt ein, das steht im Verlauf des Kontakts.
     */
    // Dieselbe Umwandlung wie in send-signature-request: der Helfer kennt nur
    // die schmale Lese- und Rpc-Schnittstelle.
    const zugriff = await pruefeKontaktZugriff(
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      String(kontaktId), caller.id, null, { ohneKunde: true },
    );
    if (!zugriff.erlaubt || !zugriff.kontakt) return antwort(403, "Für diesen Kontakt darf keine Selbstauskunft versendet werden.");

    const { data: investmentZeile, error: investmentFehler } = await supabase
      .from("investments")
      .select("id, kunde_id")
      .eq("id", investmentId)
      .maybeSingle();
    if (investmentFehler) return antwort(500, "Das Investment konnte gerade nicht geprüft werden.");
    if (!investmentZeile || String(investmentZeile.kunde_id ?? "") !== String(kontaktId)) {
      return antwort(403, "Für diesen Kontakt darf keine Selbstauskunft versendet werden.");
    }

    const empfaenger = empfaengerAusKontakt(zugriff.kontakt, personNr === 2 ? "person2" : "person1");
    const kundeEmail = empfaenger.email;
    const kundeName = empfaenger.name || String(anfrage.kundeName ?? "").trim();
    if (!kundeEmail) return antwort(400, "Am Kontakt ist keine E-Mail-Adresse hinterlegt.");

    /*
     * Ist das der erste Versand oder eine Wiederholung?
     *
     * Bis zum 22.09.2026 gab es nur einen Schluessel, `sa_invitation_resent`,
     * angezeigt als „Selbstauskunft-Einladung erneut versendet". Er stand auch
     * unter dem allerersten Versand, und im Protokoll sah es so aus, als sei
     * schon einmal nachgefasst worden.
     *
     * Entschieden wird hier und nicht beim Aufrufer: Es gibt zwei Wege in
     * diese Function, und nur einer von ihnen weiss, ob er wiederholt. Gezaehlt
     * werden die bereits ausgestellten Ausfuell-Links dieses Vorgangs. Schlaegt
     * die Zaehlung fehl, bleibt es beim bisherigen Schluessel, denn eine
     * fehlende Zahl ist kein Beweis fuer einen Erstversand.
     */
    let istErstversand = false;
    try {
      const { count, error: zaehlFehler } = await supabase
        .from("sa_fill_tokens")
        .select("token", { count: "exact", head: true })
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId);
      if (!zaehlFehler && typeof count === "number") istErstversand = count === 0;
    } catch (e) {
      console.warn("SA-Einladung: Vorgaenger konnten nicht gezaehlt werden", e);
    }

    /*
     * Vor- und Nachname getrennt in die Vorbelegung, falls der Entwurf keinen
     * Namen trägt. Die Kundenseite kann den Kontakt ohne Anmeldung nicht lesen
     * und hat sonst nur `kundeName`, und den darf sie nicht zerlegen
     * („Anna Maria Müller“). Nur für Person 1, denn der Entwurf gehört ihr.
     */
    const vorbelegung: Record<string, unknown> =
      prefillData && typeof prefillData === "object" && !Array.isArray(prefillData) ? { ...prefillData } : {};
    const gefuellt = (w: unknown) => typeof w === "string" && w.trim() !== "";
    if (personNr === 1 && !gefuellt(vorbelegung.vorname) && !gefuellt(vorbelegung.nachname)) {
      if (gefuellt(zugriff.kontakt.vorname) || gefuellt(zugriff.kontakt.nachname)) {
        vorbelegung.vorname = String(zugriff.kontakt.vorname || "").trim();
        vorbelegung.nachname = String(zugriff.kontakt.nachname || "").trim();
      }
    }

    /*
     * Ein fester Link je Kontakt, Investment und Person (07.10.2026). Die
     * Datenbank entscheidet in einer Transaktion (`sa_link_ausstellen`):
     * offene Links an eine andere Adresse widerrufen, einen offenen Link an
     * dieselbe Adresse wiederverwenden und auf 30 Tage verlaengern, sonst
     * einen neuen anlegen. Fehlt die Funktion noch (Migration offen), bleibt
     * es beim alten Weg: je Versand ein neuer Link, 30 Tage gueltig.
     */
    const jetzt = new Date();
    let tokenRow: { token: string } | null = null;
    const { data: ausgestellt, error: ausstellFehler } = await supabase.rpc("sa_link_ausstellen", {
      _kontakt_id: String(kontaktId),
      _investment_id: String(investmentId),
      _person_nr: personNr,
      _email: kundeEmail,
      _name: kundeName,
      _created_by: caller.id,
      _prefill: vorbelegung,
    });
    if (!ausstellFehler && typeof (ausgestellt as { token?: unknown } | null)?.token === "string") {
      tokenRow = { token: (ausgestellt as { token: string }).token };
    } else if (ausstellFehler && !rpcFehlt(ausstellFehler)) {
      console.error("SA-Link nicht ausgestellt:", ausstellFehler);
      return antwort(500, "Token konnte nicht erstellt werden");
    }

    if (!tokenRow) {
      /*
       * Rueckfall ohne Migration: Widerrufen kann nur die Datenbankfunktion.
       * Liegt schon ein offener Link an einer ANDEREN Adresse draussen, darf
       * kein zweiter daneben entstehen, sonst arbeitet der falsche Empfaenger
       * weiter. Dann lieber abbrechen und die Erweiterung einspielen lassen.
       */
      const { data: offene, error: offeneFehler } = await supabase
        .from("sa_fill_tokens")
        .select("email")
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId)
        .eq("person_nr", personNr)
        .eq("status", "pending");
      if (offeneFehler) return antwort(500, "Token konnte nicht erstellt werden");
      if (andereAdresseOffen(offene || [], kundeEmail)) {
        return antwort(409, "Bitte zuerst die Datenbank-Erweiterung einspielen. Für diese Selbstauskunft ist noch ein Link an eine andere E-Mail-Adresse offen.");
      }

      const { data: neu, error: insertError } = await supabase
        .from("sa_fill_tokens")
        .insert({
          kontakt_id: kontaktId,
          investment_id: investmentId,
          email: kundeEmail,
          name: kundeName,
          created_by: caller.id,
          prefill_data: vorbelegung,
          person_nr: personNr,
          expires_at: saLinkAblauf(jetzt),
        })
        .select("token")
        .single();

      if (insertError || !neu) {
        console.error("Token insert error:", insertError);
        return antwort(500, "Token konnte nicht erstellt werden");
      }
      tokenRow = neu;
    }

    const fillUrl = `${SA_FILL_BASE_URL}/${tokenRow.token}`;

    // Delegate to the unified transactional email pipeline so the registered,
    // branded React-Email template (formal "Sie"-Form) is used.
    /*
     * Ueber sendeVorlage statt direkt ueber functions.invoke.
     *
     * `invoke` meldet nur einen Fehler ab Status 400.
     * send-transactional-email antwortet aber mit Status 200 und
     * `{ success: false, reason: 'email_suppressed' }`, wenn die Adresse auf
     * der Sperrliste steht. Der Fehlschlag sah dadurch wie Erfolg aus.
     * Gefunden ueber den Fall Kai Laube in send-signature-request.
     */
    // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die Mail den
    // Platzhalter "OS Immobilien Team".
    const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);

    // Kein Zaehlpixel mehr (seit 26.09.2026): Ein Oeffnungspixel braucht nach
    // Paragraf 25 TDDDG eine Einwilligung. Gezaehlt wird nur noch der Aufruf
    // des persoenlichen Links, `sa_fill_tokens.link_opened_at`.

    const versand = await sendeVorlage(supabase, {
      templateName: "sa-invitation",
      recipientEmail: kundeEmail,
      // Mit Minute: Derselbe Link geht bei jedem Neuversand wieder hinaus und
      // darf nicht als Doppel gelten, ein Doppelklick in derselben Minute schon.
      idempotencyKey: `sa-fill-${tokenRow.token}-${Math.floor(jetzt.getTime() / 60000)}`,
      // Deutsch oder Englisch aus dem Kundenprofil, ermittelt beim Versand.
      kontaktId,
      templateData: { kundeName, fillUrl, ...(berater ? { berater } : {}) },
    });
    const sendErr = versand.ok ? null : new Error(versand.grund || 'Versand fehlgeschlagen');
    if (sendErr) {
      console.error("send-transactional-email invoke failed", sendErr);
      return new Response(JSON.stringify({ error: `E-Mail-Versand fehlgeschlagen: ${versand.grund}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit-Log: Selbstauskunft-Einladung versendet
    await logActivityFromEdge(supabase, {
      kontaktId,
      actorId: caller.id,
      action: istErstversand ? "sa_invitation_sent" : "sa_invitation_resent",
      entityType: "email",
      meta: {
        template: "sa-invitation",
        empfaenger: kundeEmail,
        kundeName,
        investmentId,
        personNr,
        fillUrl,
      },
      source: "edge:send-sa-invitation",
    });

    console.log(`SA invitation sent to ${kundeEmail} for kontakt ${kontaktId}`);

    // ── Erinnerung planen: Tag 14 an den Vertriebspartner ──
    //
    // Bis zum 15.09.2026 gingen hier zusaetzlich zwei Mails an den Kunden
    // (Tag 4 und Tag 10, Kategorien sa_reminder_1 und sa_reminder_2). Christian
    // hat sie abgeschaltet: Nach der Einladung bekommt der Kunde keine
    // automatische Erinnerung mehr. Was bleibt, ist der Weg zum Menschen: die
    // beiden Nachfass-Aufgaben aus dem Browser (+48 h, +96 h) und die Aufgabe
    // hier an Tag 14, der von Christian gesetzten Obergrenze. Ab dann
    // uebernimmt der zustaendige Vertriebspartner persoenlich.
    //
    // Vorherige offene Erinnerungen fuer dieses Investment stornieren, damit
    // ein erneuter Versand die Zeitachse zuruecksetzt. Die alten
    // Kundenkategorien bleiben in der Liste, damit Reste aus der Zeit vor der
    // Abschaltung mit storniert werden.
    try {
      await supabase
        .from("scheduled_notifications")
        .update({ status: "cancelled", sent_at: new Date().toISOString() })
        .eq("investment_id", investmentId)
        .eq("status", "pending")
        .in("category", ["sa_reminder_1", "sa_reminder_2", "sa_reminder_3", "sa_vp_nudge"]);

      // Zustaendigen VP holen (fuer die Aufgabe an Tag 14)
      const { data: kontaktRow } = await supabase
        .from("kontakte")
        .select("zustaendig_id, vorname, nachname")
        .eq("id", kontaktId)
        .maybeSingle();
      const vpId = kontaktRow?.zustaendig_id as string | null;
      const kundeAnzeigename = [kontaktRow?.vorname, kontaktRow?.nachname].filter(Boolean).join(" ") || kundeName;

      // Ohne zustaendigen Partner gibt es niemanden, der die Aufgabe lesen
      // koennte. Dann wird nichts geplant; der Nachtwaechter meldet den
      // Kontakt ohne Betreuer, und das ist dann das eigentliche Problem.
      if (!vpId) {
        console.log(`Kein zustaendiger Partner fuer Kontakt ${kontaktId}, keine SA-Aufgabe geplant`);
      } else {
        const { error: schedErr } = await supabase
          .from("scheduled_notifications")
          .insert({
            category: "sa_vp_nudge",
            titel: `Bitte bei ${kundeAnzeigename} nachfragen, Selbstauskunft noch nicht ausgefüllt`,
            nachricht: `${kundeAnzeigename} hat die Online-Selbstauskunft seit 14 Tagen nicht abgeschlossen. Eine automatische Erinnerung an den Kunden gibt es nicht mehr. Bitte persönlich nachfragen, ob Unterstützung gebraucht wird.`,
            link: `/kunden/${kontaktId}`,
            trigger_at: morgensInTagen(14),
            kontakt_id: kontaktId,
            investment_id: investmentId,
            target_user_id: vpId,
            skip_condition: "sa_signed",
            dedupe_key: `sa_vp_nudge:${investmentId}:${Date.now()}`,
            status: "pending",
          });
        // Als Fehler, nicht als Warnung: Genau dieser Eintrag blieb frueher
        // unbemerkt, weil er nur eine Warnung war.
        if (schedErr) console.error("SA-Aufgabe an Tag 14 konnte nicht geplant werden:", schedErr);
        else console.log(`Scheduled SA vp nudge for investment ${investmentId}`);
      }
    } catch (e) {
      console.warn("Reminder scheduling failed (non-fatal):", e);
    }

    return new Response(
      JSON.stringify({ success: true, token: tokenRow.token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
