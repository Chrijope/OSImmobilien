/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * Kein pg_cron-Eintrag ruft diese Function. Sie bleibt als Historie liegen und
 * darf nicht ohne Entscheidung von Christian eingeplant werden: Sie wuerde
 * nach 48 Stunden eine Mail "halb fertig" an den Kunden schicken, ohne zu
 * pruefen, ob er ueberhaupt angefangen hat.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { saLinkAblauf } from "../_shared/sa-fester-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SA_FILL_BASE_URL = "https://portal.more.immo/sa";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const cutoff = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    // Offene SA-Tokens, älter als 48h, noch gültig, ohne bisherige Erinnerung
    const { data: tokens, error } = await supabase
      .from("sa_fill_tokens")
      // investment_id gehoert dazu: Ohne sie lief die Pruefung auf "schon
      // unterschrieben" unten ins Leere, und Unterschriebene bekamen die Mail.
      .select("token, kontakt_id, investment_id, email, name, expires_at, created_at")
      .eq("status", "pending")
      .is("reminder_sent_at", null)
      .lt("created_at", cutoff)
      .gt("expires_at", new Date().toISOString())
      .limit(100);

    if (error) throw error;

    let kundeRemindersSent = 0;
    let vpBellsSent = 0;
    const errors: string[] = [];

    for (const t of tokens || []) {
      try {
        // Sicherheitsnetz: SA schon unterschrieben oder befuellt? Dann Token
        // schliessen und keine Erinnerung senden.
        const { data: inv, error: invError } = await supabase
          .from("investments")
          .select("meta")
          .eq("id", t.investment_id)
          .maybeSingle();
        // Ohne Gewissheit keine Erinnerung: lieber eine zu wenig als eine an
        // jemanden, der schon unterschrieben hat.
        if (invError) throw invError;
        const invMeta = (inv?.meta as Record<string, any>) || {};
        if (invMeta.saSigned === true || invMeta.saSignedAt || invMeta.saPdf) {
          await supabase
            .from("sa_fill_tokens")
            .update({ status: "used" })
            .eq("token", t.token);
          continue;
        }

        const fillUrl = `${SA_FILL_BASE_URL}/${t.token}`;

        // Kontakt laden (für zustaendig_id + Name VP)
        const { data: kontakt } = await supabase
          .from("kontakte")
          .select("id, vorname, nachname, zustaendig_id, berater")
          .eq("id", t.kontakt_id)
          .maybeSingle();

        // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die
        // Erinnerung den Platzhalter "MOREImmo Team".
        const berater = await zustaendigerAnsprechpartner(supabase, t.kontakt_id);

        await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "sa-abbrecher-reminder",
            recipientEmail: t.email,
            // Mit Tag: Der feste Link kann nach einem Neuversand wieder eine
            // Erinnerung bekommen, die darf nicht als Doppel gelten.
            idempotencyKey: `sa-reminder-${t.token}-${new Date().toISOString().slice(0, 10)}`,
            templateData: {
              kundeName: t.name,
              fillUrl,
              expiresAt: new Date(t.expires_at).toLocaleDateString("de-DE"),
              ...(berater ? { berater } : {}),
            },
            metadata: { kontaktId: t.kontakt_id, token: t.token },
          },
        });
        kundeRemindersSent++;

        // 2) Bell-Notification an zuständigen VP
        if (kontakt?.zustaendig_id) {
          const kundeName = `${kontakt.vorname} ${kontakt.nachname}`.trim();
          await supabase.from("benachrichtigungen").insert({
            benutzer_id: kontakt.zustaendig_id,
            titel: "SA-Abbrecher",
            nachricht: `${kundeName} hat die Selbstauskunft seit über 48 Stunden offen. Erinnerung wurde versendet.`,
            link: `/kunden/${kontakt.id}`,
            gelesen: false,
          });
          vpBellsSent++;
        }

        // 3) Markierung setzen
        await supabase
          .from("sa_fill_tokens")
          // Die Erinnerung ist Aktivitaet: derselbe feste Link gilt wieder
          // 30 Tage (07.10.2026, siehe _shared/sa-fester-link.ts).
          .update({ reminder_sent_at: new Date().toISOString(), expires_at: saLinkAblauf(new Date(), t.expires_at) })
          .eq("token", t.token);
      } catch (innerErr) {
        console.error(`SA-Reminder Fehler für Token ${t.token}:`, innerErr);
        errors.push(`${t.token}: ${innerErr instanceof Error ? innerErr.message : "unknown"}`);
      }
    }

    console.log(
      `SA-Abbrecher-Reminder: ${kundeRemindersSent} E-Mails, ${vpBellsSent} Bells, ${errors.length} Fehler.`
    );

    return new Response(
      JSON.stringify({
        success: true,
        candidates: tokens?.length ?? 0,
        kundeRemindersSent,
        vpBellsSent,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-sa-abbrecher-reminder Fehler:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});