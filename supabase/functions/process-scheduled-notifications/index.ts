import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { saErinnerungStoppen } from "../_shared/sa-erinnerung-stopp.ts";
import { empfaengerZumVersand } from "../_shared/glocke-zustaendiger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Läuft jede Minute per pg_cron.
 * Nimmt alle `scheduled_notifications` mit status='pending' und trigger_at <= now(),
 * schreibt sie in `benachrichtigungen` und markiert sie als 'sent' bzw. 'skipped'.
 *
 * Ersetzt die vorherigen client-seitigen setTimeout-Reminder in bellNotifications.ts,
 * die verloren gingen, sobald der Browser-Tab geschlossen wurde.
 */

/**
 * Kundenerinnerungen zur Selbstauskunft, seit 15.09.2026 abgeschaltet.
 *
 * send-sa-invitation plant diese Kategorien nicht mehr. Zeilen, die vor der
 * Abschaltung geplant wurden, duerfen trotzdem nicht rausgehen, deshalb
 * werden sie hier stillgelegt statt verschickt. Die Migration 20260915150000
 * raeumt den Bestand einmalig auf; diese Pruefung faengt, was danach noch
 * auftaucht, etwa aus einer noch nicht neu ausgerollten Function.
 */
const KUNDENERINNERUNGEN_ABGESCHALTET = new Set(["sa_reminder_1", "sa_reminder_2", "sa_reminder_3"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const stats = { picked: 0, sent: 0, skipped: 0, cancelled: 0, errors: [] as string[] };

  try {
    // Fetch due reminders (batch of 200 per run – cron runs every minute)
    const { data: due, error } = await supabase
      .from("scheduled_notifications")
      .select("*")
      .eq("status", "pending")
      .lte("trigger_at", new Date().toISOString())
      .order("trigger_at", { ascending: true })
      .limit(200);

    if (error) throw error;
    stats.picked = due?.length || 0;

    for (const row of due || []) {
      try {
        // ── Abgeschaltete Kundenerinnerungen stilllegen, nicht verschicken ──
        if (KUNDENERINNERUNGEN_ABGESCHALTET.has(row.category)) {
          await supabase
            .from("scheduled_notifications")
            .update({
              status: "cancelled",
              sent_at: new Date().toISOString(),
              error: "Kundenerinnerungen seit 15.09.2026 abgeschaltet",
            })
            .eq("id", row.id);
          stats.cancelled++;
          continue;
        }

        // ── Skip-Bedingungen prüfen ──
        //
        // Der Name "sa_signed" ist historisch. Geprüft wird inzwischen mehr als
        // nur die Unterschrift: auch die ausgefüllte Selbstauskunft, ein
        // verlorener oder archivierter Kunde und ein Investment, das die
        // Selbstauskunft längst hinter sich hat. Eine Erinnerung an jemanden,
        // der fertig ist oder gar kein Kunde mehr ist, ist schlimmer als keine.
        if (row.skip_condition === "sa_signed") {
          const stopp = await saErinnerungStoppen(supabase, row.investment_id, row.kontakt_id);
          if (stopp.stoppen) {
            await supabase
              .from("scheduled_notifications")
              .update({ status: "skipped", sent_at: new Date().toISOString(), error: stopp.grund || null })
              .eq("id", row.id);
            stats.skipped++;
            continue;
          }
        }

        // ── Empfaenger zum Versandzeitpunkt: der aktuelle Zustaendige ──
        //
        // Regel vom 29.09.2026: Geplant wurde fuer den, der damals zustaendig
        // war. Liegt der Kontakt inzwischen bei einem anderen Partner oder in
        // der Zentrale, geht die Erinnerung an den aktuellen Zustaendigen,
        // ohne ihn an die Leitung. Regeln in `_shared/glocke-zustaendiger.ts`.
        let umgeleitetAn: string[] | null = null;
        let umleitungsVermerk: string | null = null;
        const einzelnerEmpfaenger = !row.target_role && row.target_user_id &&
          row.target_user_id !== "00000000-0000-0000-0000-000000000000";
        if (einzelnerEmpfaenger && row.kontakt_id) {
          const entscheidung = await empfaengerZumVersand(supabase, row);
          if (entscheidung.art === "entfaellt") {
            await supabase
              .from("scheduled_notifications")
              .update({ status: "skipped", sent_at: new Date().toISOString(), error: entscheidung.vermerk })
              .eq("id", row.id);
            stats.skipped++;
            continue;
          }
          if (entscheidung.art === "umleiten") {
            umgeleitetAn = entscheidung.an;
            umleitungsVermerk = entscheidung.vermerk;
          }
        }
        // Bei genau einem neuen Empfaenger wandert die Zeile mit: Die Lesebedingung
        // zeigt sie dann ihm statt dem Frueheren, und Schwesterzeilen derselben
        // Erinnerung erkennen daran, dass er sie schon hat.
        const zeileAbschliessen = (felder: Record<string, unknown>) =>
          supabase
            .from("scheduled_notifications")
            .update({
              ...felder,
              ...(umleitungsVermerk ? { error: umleitungsVermerk } : {}),
              ...(umgeleitetAn?.length === 1 ? { target_user_id: umgeleitetAn[0] } : {}),
            })
            .eq("id", row.id);

        // ── Sonderfall: Aufgabe an den Vertriebspartner nach 14 Tagen ──
        if (row.category === "sa_vp_nudge") {
          const vpId: string | null = umgeleitetAn?.[0] ?? row.target_user_id;
          if (vpId) {
            await supabase.from("benachrichtigungen").insert({
              benutzer_id: vpId,
              titel: row.titel,
              nachricht: row.nachricht || "",
              link: row.link || "",
              gelesen: false,
            });
            // Aufgabe für den VP anlegen (fällig heute).
            //
            // `investment_id` haengt die Aufgabe an das richtige Investment,
            // `ausloeser_schluessel` verhindert datenbankseitig, dass bei einem
            // erneuten Versand eine zweite offene Aufgabe zum selben Vorgang
            // entsteht. Ein doppelter Schluessel laesst den Insert scheitern,
            // das ist hier der gewuenschte Ausgang und kein Fehler.
            const { error: aufgabeFehler } = await supabase.from("aufgaben").insert({
              benutzer_id: vpId,
              zugewiesen_an: vpId,
              kontakt_id: row.kontakt_id,
              investment_id: row.investment_id,
              typ: "callback",
              prioritaet: "hoch",
              status: "offen",
              titel: row.titel,
              beschreibung: row.nachricht || "",
              faellig_am: new Date().toISOString().slice(0, 10),
              ausloeser_schluessel: `selbstauskunft_offen:${row.investment_id || row.kontakt_id}`,
            });
            if (aufgabeFehler) {
              console.log(`SA-Aufgabe nicht angelegt (${row.id}): ${aufgabeFehler.message}`);
            }
          }
          await zeileAbschliessen({ status: "sent", sent_at: new Date().toISOString() });
          stats.sent++;
          continue;
        }

        // ── Rolle statt einzelnem User? Alle Nutzer der Rolle bedienen ──
        let targetUserIds: string[] = [];
        if (row.target_role) {
          // Bis 28.09.2026 plante der Browser Erinnerungen ohne Zustaendigen
          // an die ganze Rolle "vertriebspartner", mit Kundennamen im Text.
          // Solche Zeilen liegen noch in der Warteschlange. Sie gehen an die
          // Leitung (Admin, Inhaber, Vertriebsleitung), nie an alle Partner,
          // wie jede Prozess-Glocke ohne Zustaendigen (seit 28.09.2026, vorher
          // Backoffice statt Vertriebsleitung). Jede Person einmal, siehe unten.
          const rollen = row.target_role === "vertriebspartner"
            ? ["admin", "inhaber", "vertriebsleiter"]
            : [row.target_role];
          const { data: userRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .in("role", rollen);
          targetUserIds = [...new Set((userRoles || []).map((u: any) => u.user_id as string))];
        } else if (einzelnerEmpfaenger) {
          targetUserIds = umgeleitetAn ?? [row.target_user_id];
        }

        if (targetUserIds.length === 0) {
          await supabase
            .from("scheduled_notifications")
            .update({ status: "skipped", sent_at: new Date().toISOString(), error: "no target users" })
            .eq("id", row.id);
          stats.skipped++;
          continue;
        }

        // ── In benachrichtigungen einfügen ──
        const inserts = targetUserIds.map((uid) => ({
          benutzer_id: uid,
          titel: row.titel,
          nachricht: row.nachricht || "",
          link: row.link || "",
          gelesen: false,
        }));

        const { error: insErr } = await supabase.from("benachrichtigungen").insert(inserts);
        if (insErr) throw insErr;

        await zeileAbschliessen({ status: "sent", sent_at: new Date().toISOString() });
        stats.sent++;
      } catch (e: any) {
        stats.errors.push(`${row.id}: ${e.message || String(e)}`);
        await supabase
          .from("scheduled_notifications")
          .update({ status: "failed", error: e.message || String(e) })
          .eq("id", row.id);
      }
    }
  } catch (e: any) {
    stats.errors.push(`fatal: ${e.message || String(e)}`);
  }

  return new Response(JSON.stringify(stats), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});