import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { bonitaetPfadFuerInvestment, bonitaetUrlFuerInvestment } from "../_shared/unterlagen-erinnerung-link.ts";
import { spracheAusMeta } from "../_shared/kunden-sprache.ts";
import { saGlockeLeitung } from "../_shared/sa-glocke.ts";
import { unterlagenErinnerungText } from "../_shared/kunden-glocke.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import {
  ovDatumUhrzeit, ovFehlendeUnterlagen, ovSperrSchluessel, ovTerminFaellig, type OvTermin,
} from "../_shared/objektvorstellung-unterlagen.ts";

/**
 * Kundenerinnerung zwei Tage vor der Objektvorstellung (Nachfassplan, seit
 * 16.10.2026): Fehlen Ausweis oder letzte Gehaltsabrechnung noch, bekommt der
 * Kunde einmal je Termin die Mail `erinnerung-unterlagen-objektvorstellung`.
 * Die Regel steht in `_shared/objektvorstellung-unterlagen.ts`, die Liste der
 * Unterlagen in `fehlendeMindestunterlagenAusMeta`.
 *
 * Gegen doppelten Versand steht dieselbe Sperre wie bei den
 * Terminerinnerungen (`buchung_mail_claim`), je Termin und Zeitpunkt. Ohne
 * Sperre geht nichts hinaus. Die Partner-Aufgabe zum selben Anlass legt das
 * CRM an (`useInvestmentInboxTriggers`).
 */
async function erinnereVorObjektvorstellung(supabase: any, jetzt: Date): Promise<number> {
  const { data: termine, error } = await supabase
    .from("aktivitaeten")
    .select("id, kunde_id, beschreibung, faellig_am, uhrzeit, erledigt_am")
    .eq("art", "meeting")
    .is("erledigt_am", null)
    .ilike("beschreibung", "%objektvorstellung%");
  if (error) {
    console.error("[ov-unterlagen] Termine nicht ladbar", error);
    return 0;
  }
  let gesendet = 0;
  for (const t of (termine || []) as OvTermin[]) {
    const zeit = ovTerminFaellig(t, jetzt);
    if (!zeit) continue;
    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("id, anrede, vorname, nachname, email, archiviert, geloescht")
      .eq("id", t.kunde_id)
      .maybeSingle();
    const email = String(kontakt?.email || "").trim();
    if (!kontakt || kontakt.archiviert || kontakt.geloescht || !email) continue;
    const { data: investments } = await supabase.from("investments").select("id, meta").eq("kunde_id", kontakt.id);
    const offen = ovFehlendeUnterlagen(investments || []);
    if (!offen) continue;

    const sperre = ovSperrSchluessel(t.id, zeit);
    const { data: claim, error: claimFehler } = await supabase.rpc("buchung_mail_claim", { _schluessel: sperre });
    if (claimFehler) {
      console.error("[ov-unterlagen] Sperre nicht moeglich, es wird nichts gesendet", claimFehler);
      return gesendet;
    }
    if (claim !== "frei") continue;

    const { datum, uhrzeit } = ovDatumUhrzeit(zeit);
    const a = String(kontakt.anrede || "").toLowerCase();
    const titel = a.includes("frau") ? "Frau" : a.includes("herr") ? "Herr" : "";
    const nachname = String(kontakt.nachname || "").trim();
    const kundeName = titel && nachname ? `${titel} ${nachname}` : `${kontakt.vorname || ""} ${nachname}`.trim();
    const beraterSignatur = await zustaendigerAnsprechpartner(supabase, kontakt.id);
    const ergebnis = await sendeVorlage(supabase, {
      templateName: "erinnerung-unterlagen-objektvorstellung",
      recipientEmail: email,
      idempotencyKey: sperre,
      kontaktId: kontakt.id,
      templateData: {
        kundeName,
        terminDatum: datum,
        terminUhrzeit: uhrzeit,
        fehlend: offen.fehlend,
        uploadUrl: bonitaetUrlFuerInvestment(offen.investmentId),
        ...(beraterSignatur ? { berater: beraterSignatur } : {}),
      },
    });
    // ponytail: ein Fehlschlag gibt die Sperre frei und der naechste Lauf
    // versucht es erneut, begrenzt durch das Zwei-Tage-Fenster. Eine
    // Versuchszaehlung wie in send-termin-erinnerungen, falls das stoert.
    await supabase.rpc("buchung_mail_fertig", { _schluessel: sperre, _erfolg: ergebnis.ok });
    if (ergebnis.ok) gesendet++;
    else console.error(`[ov-unterlagen] Kontakt ${kontakt.id}: ${ergebnis.grund}`);
  }
  return gesendet;
}

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

    // Ein Fehler hier haelt die Unterlagen-Erinnerungen oben nicht auf.
    let ovErinnerungen = 0;
    try {
      ovErinnerungen = await erinnereVorObjektvorstellung(supabase, now);
    } catch (fehler) {
      console.error("[ov-unterlagen] unerwarteter Fehler", fehler);
    }

    return new Response(
      JSON.stringify({ success: true, remindersSent, ovErinnerungen }),
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
