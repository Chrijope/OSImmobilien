import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { bonitaetPfadFuerInvestment, bonitaetUrlFuerInvestment } from "../_shared/unterlagen-erinnerung-link.ts";
import { spracheAusMeta } from "../_shared/kunden-sprache.ts";
import { saGlockeLeitung } from "../_shared/sa-glocke.ts";
import { unterlagenErinnerungText } from "../_shared/kunden-glocke.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "check-document-reminders", corsHeaders);
  if (abgewiesen) return abgewiesen;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find kontakte with portal activated but incomplete documents
    const { data: kontakte, error } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, email, meta, berater, zustaendig_id")
      .not("meta", "is", null);

    if (error) {
      console.error("Error fetching kontakte:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let remindersSent = 0;

    for (const kontakt of (kontakte || [])) {
      const meta = (kontakt.meta as any) || {};
      if (!meta.portalFreigeschalten || meta.portalGesperrt) continue;

      const activatedAt = meta.portalActivatedAt ? new Date(meta.portalActivatedAt) : null;
      if (!activatedAt) continue;

      const hoursSinceActivation = (now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60);

      // Check investments for this kontakt
      const { data: investments } = await supabase
        .from("investments")
        .select("id, meta")
        .eq("kunde_id", kontakt.id);

      // Track ob für diesen Kontakt in diesem Lauf bereits Berater/Kunde benachrichtigt wurden
      // -> verhindert Mehrfach-Benachrichtigungen bei mehreren Investments
      let beraterNotifiedThisRun = false;
      let kundeNotifiedThisRun = false;
      let emailSentThisRun = false;

      for (const inv of (investments || [])) {
        const invMeta = (inv.meta as any) || {};

        // Skip if already sent or all docs complete
        if (invMeta.unterlagenGesendet) continue;

        // Erinnerungen erst NACH unterschriebener Reservierung starten.
        // Ohne signierte RV werden keine Unterlagen-Erinnerungen versendet.
        if (!invMeta.rvSigned) continue;

        // Kunde finanziert selbst: Die Bonitaetsunterlagen werden nicht
        // gebraucht, also darf ihn auch nichts mehr danach fragen. Der Vermerk
        // wird im CRM an der Objektauswahl gesetzt (16.09.2026).
        if (invMeta.selbstauskunftEntfaellt?.aktiv) continue;

        const lastReminder = invMeta.lastDocReminder ? new Date(invMeta.lastDocReminder) : null;
        const reminderCount = invMeta.docReminderCount || 0;

        // Basis für den 24h/48h-Rhythmus: Zeitpunkt der RV-Unterschrift
        // (Fallback auf Portal-Aktivierung, falls rvSignedAt fehlt)
        const rvSignedAt = invMeta.rvSignedAt ? new Date(invMeta.rvSignedAt) : activatedAt;
        const hoursSinceRvSigned = (now.getTime() - rvSignedAt.getTime()) / (1000 * 60 * 60);

        // Determine if reminder is due
        let shouldRemind = false;

        if (reminderCount === 0 && hoursSinceRvSigned >= 24) {
          shouldRemind = true; // 24h nach RV-Unterschrift
        } else if (reminderCount === 1 && lastReminder) {
          const hoursSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder >= 24) {
            shouldRemind = true; // 48h nach RV-Unterschrift (24h nach erster Erinnerung)
          }
        }

        if (!shouldRemind) continue;

        // Find the kontakt's auth user ID for notification
        const authUserId = meta.authUserId;

        // Send in-app notification to kunde
        if (authUserId && !kundeNotifiedThisRun) {
          // In der Sprache aus dem Kundenprofil (Plan Kundensprache, P18).
          const glocke = unterlagenErinnerungText(spracheAusMeta(meta));
          await supabase.from("benachrichtigungen").insert({
            benutzer_id: authUserId,
            titel: glocke.titel,
            nachricht: glocke.nachricht,
            // Direkt zur Bonität dieses Investments, nicht mehr auf /kunde/profil.
            link: bonitaetPfadFuerInvestment(inv.id),
            gelesen: false,
          });
          kundeNotifiedThisRun = true;
        }

        // Send email reminder via queue
        if (kontakt.email && !emailSentThisRun) {
          try {
            const subject = reminderCount === 0
              ? "Erinnerung: Deine Unterlagen fehlen noch"
              : "Letzte Erinnerung: Bitte Unterlagen hochladen";
            const greetingName = kontakt.vorname || "";
            // Fuehrt zur Bonitaet genau dieses Investments, mit Hervorhebung
            // wie der Knopf "Jetzt fortfahren" (unterlagen-erinnerung-link.ts).
            const portalUrl = bonitaetUrlFuerInvestment(inv.id);
            // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die
            // Erinnerung den Platzhalter "OS Immobilien Team".
            const beraterSignatur = await zustaendigerAnsprechpartner(supabase, kontakt.id);
            await supabase.functions.invoke("send-transactional-email", {
              body: {
                templateName: "document-reminder",
                recipientEmail: kontakt.email,
                idempotencyKey: `doc-reminder-${kontakt.id}-${inv.id}-${reminderCount + 1}`,
                kontaktId: kontakt.id,
                templateData: {
                  kundeName: greetingName,
                  portalUrl,
                  reminderNumber: reminderCount + 1,
                  reminderTotal: 2,
                  subject,
                  ...(beraterSignatur ? { berater: beraterSignatur } : {}),
                },
              },
            });
          } catch (emailErr) {
            console.error("Email queue error:", emailErr);
          }
          emailSentThisRun = true;
        }

        // Notify the assigned Berater
        // Nur der aktuelle Zustaendige, ohne ihn die Leitung (Regel vom
        // 29.09.2026). Der Name zaehlt nicht mehr als Rueckfall, er kann auf
        // einen frueheren Partner zeigen.
        const empfaenger: string[] = beraterNotifiedThisRun
          ? []
          : kontakt.zustaendig_id ? [kontakt.zustaendig_id] : await saGlockeLeitung(supabase);
        if (empfaenger.length > 0) {
          await supabase.from("benachrichtigungen").insert(empfaenger.map((uid) => ({
            benutzer_id: uid,
            titel: `Unterlagen ausstehend: ${kontakt.vorname} ${kontakt.nachname}`,
            nachricht: `${kontakt.vorname} ${kontakt.nachname} hat nach ${reminderCount === 0 ? "24" : "48"} Stunden noch nicht alle Unterlagen hochgeladen. Erinnerung ${reminderCount + 1}/2 wurde gesendet.`,
            link: `/kunden/${kontakt.id}`,
            gelesen: false,
          })));
          beraterNotifiedThisRun = true;
        }

        // Update investment meta with reminder tracking
        await supabase
          .from("investments")
          .update({
            meta: {
              ...invMeta,
              lastDocReminder: now.toISOString(),
              docReminderCount: reminderCount + 1,
            },
          })
          .eq("id", inv.id);

        remindersSent++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, remindersSent }),
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
