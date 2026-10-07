import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { berlinZeitpunkt, faelligeStufen, hatReaktion, reaktionAb } from "../_shared/follow-up-eskalation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Follow-Up Eskalation – läuft per pg_cron alle 15 Minuten.
 *
 * 3 Stufen:
 *   Stufe 1 – bei Fälligkeit (followUpAm + Uhrzeit, default 09:00) → Push an VP.
 *   Stufe 2 – +3h nach Fälligkeit ohne Aktivität → 2. Push an VP.
 *   Stufe 3 – +24h nach Fälligkeit ohne Aktivität → 3. Push an VP (nur an
 *             zugeordneten Nutzer, kein Admin-Bcc).
 *
 * „Aktivität" = neue Zeile in `aktivitaeten` für den Kontakt nach dem
 * späteren von `meta.followUpGesetztAm` und Fälligkeit, ohne den
 * automatischen Planungseintrag (siehe `_shared/follow-up-eskalation.ts`),
 * ODER `pipelineStufe` ≠ "follow_up" (Lead bewegt).
 * Inbox-Aufgaben werden bereits beim Anlegen des Follow-Ups im Client mit
 * korrektem Fälligkeitsdatum erstellt; diese Funktion kümmert sich nur um
 * die Push-Benachrichtigungen pro Stufe.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const stats = { checked: 0, stage1: 0, stage2: 0, stage3: 0, skipped: 0, errors: [] as string[] };

  try {
    const { data: kontakte, error } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, berater, zustaendig_id, meta, pipelineStufe:meta->>pipelineStufe")
      .filter("meta->>pipelineStufe", "eq", "follow_up")
      .not("meta->>followUpAm", "is", null);

    if (error) throw error;
    stats.checked = kontakte?.length || 0;

    for (const k of kontakte || []) {
      const meta = (k as any).meta || {};
      const followUpAm: string = meta.followUpAm;
      const followUpUhrzeit: string = meta.followUpUhrzeit || "09:00";
      const followUpGesetztAm: string | null = meta.followUpGesetztAm || null;
      const zustaendigId: string | null = (k as any).zustaendig_id || null;

      if (!zustaendigId) { stats.skipped++; continue; }

      // Die Uhrzeit gibt der Partner in deutscher Ortszeit ein. Ohne Zeitzone
      // gelesen galt „09:00" auf dem Server als 09:00 UTC, im Sommer also erst
      // um 11:00.
      const dueAt = berlinZeitpunkt(followUpAm, followUpUhrzeit);
      if (!dueAt) { stats.skipped++; continue; }

      const minutesOverdue = (now.getTime() - dueAt.getTime()) / 60_000;
      if (minutesOverdue < 0) { stats.skipped++; continue; } // noch nicht fällig

      // Reaktion des Partners: eine Aktivität nach dem späteren von Anlegen und
      // Fälligkeit, ohne den automatischen Planungseintrag. Nur für Stufe 2
      // und 3 nötig. Die Spalte heißt `datum`, nicht `erstellt_am`.
      let hatAktivitaet = false;
      if (minutesOverdue >= 180) {
        const ab = reaktionAb(followUpGesetztAm, dueAt);
        const { data: akt, error: aktFehler } = await supabase
          .from("aktivitaeten")
          .select("datum, beschreibung")
          .eq("kunde_id", k.id)
          .gt("datum", ab.toISOString())
          .limit(50);
        if (aktFehler) stats.errors.push(`aktivitaeten ${k.id}: ${aktFehler.message}`);
        hatAktivitaet = hatReaktion(akt || [], ab);
      }
      const stufen = faelligeStufen(meta, minutesOverdue, hatAktivitaet);

      const kundeName = `${(k as any).vorname || ""} ${(k as any).nachname || ""}`.trim();
      const link = `/kunden/${k.id}`;

      const sendBenachrichtigung = async (titel: string, nachricht: string, patchKey: string) => {
        const { error: insErr } = await supabase.from("benachrichtigungen").insert({
          benutzer_id: zustaendigId,
          titel,
          nachricht,
          link,
        });
        if (insErr) { stats.errors.push(`insert ${patchKey}: ${insErr.message}`); return; }
        await supabase.rpc("merge_kontakt_meta", {
          _kontakt_id: k.id,
          _updates: { [patchKey]: new Date().toISOString() } as any,
        });
      };

      // Stufe 1: bei Fälligkeit
      if (stufen.includes("followUpEsk1Sent")) {
        await sendBenachrichtigung(
          `🔔 Follow-Up fällig: ${kundeName}`,
          `Dein Follow-Up ist jetzt fällig. Bitte den Kunden kontaktieren.`,
          "followUpEsk1Sent",
        );
        stats.stage1++;
      }
      // Stufe 2: +3h überfällig, keine Aktivität
      if (stufen.includes("followUpEsk2Sent")) {
        await sendBenachrichtigung(
          `⏰ Follow-Up 3h überfällig: ${kundeName}`,
          `Stufe 2/3: seit 3 Stunden keine Reaktion. Bitte jetzt kontaktieren.`,
          "followUpEsk2Sent",
        );
        stats.stage2++;
      }
      // Stufe 3: +24h überfällig, keine Aktivität
      if (stufen.includes("followUpEsk3Sent")) {
        await sendBenachrichtigung(
          `🚨 Follow-Up DRINGEND (24h): ${kundeName}`,
          `Stufe 3/3: seit 24 Stunden ohne Reaktion. Lead bitte sofort bearbeiten oder verloren markieren.`,
          "followUpEsk3Sent",
        );
        stats.stage3++;
      }
    }

    return new Response(JSON.stringify({ ok: true, now: now.toISOString(), stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("follow-up-eskalation error:", e);
    return new Response(JSON.stringify({ ok: false, error: e.message, stats }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});