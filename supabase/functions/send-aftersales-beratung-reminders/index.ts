import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Täglicher Cron: scannt offene Aftersales-Beratungsdokumente und legt
 * Inbox-Tasks/Bell-Notifications für den VP an.
 *
 * Trigger-Regeln (basierend auf meta.investmentDetails / meta.aftersalesBeratung):
 *   T-1 vor Notartermin: Vor-Erinnerung „Am Notartermin gemeinsam ausfüllen"
 *   T0 (= Notartermin heute, kein VP-Sign): „Beratungsdokument ausfüllen & versenden"
 *   +3 / +7 Tage ohne VP-Sign: VP-Eskalation
 *   +3 / +7 Tage ohne Kunde-Sign nach VP-Sign: VP-Eskalation
 *   +14 Tage offen: zusätzlich Admin (rolle inhaber/admin)
 */
function dayDiff(a: Date, b: Date) {
  const ms = a.getTime() - b.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-aftersales-beratung-reminders", corsHeaders);
  if (abgewiesen) return abgewiesen;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: investments, error } = await supabase
    .from("investments")
    .select("id, kunde_id, meta")
    .not("meta", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const insertNotif = async (vpId: string, titel: string, nachricht: string, link: string, dedupeKey: string) => {
    const { data: existing } = await supabase
      .from("benachrichtigungen")
      .select("id")
      .eq("benutzer_id", vpId)
      .ilike("titel", `%${dedupeKey}%`)
      .limit(1)
      .maybeSingle();
    if (existing) return;
    await supabase.from("benachrichtigungen").insert({
      benutzer_id: vpId, titel, nachricht, link, gelesen: false,
    });
  };

  let processed = 0;

  for (const inv of investments || []) {
    const meta = (inv.meta as Record<string, any>) || {};
    // notarTermin, mit grossem T. Genau so schreibt es investmentsStore.
    // Die drei Kleinschreibvarianten gab es nie, weshalb dieser Cron bisher
    // fuer jedes Investment sofort mit continue abgebrochen ist.
    const notarTs = meta.notarTermin || meta.notartermin_bestaetigt_am || meta.notartermin || meta.notarterminDate;
    if (!notarTs) continue;
    const notarDate = new Date(notarTs);
    if (isNaN(notarDate.getTime())) continue;
    notarDate.setHours(0, 0, 0, 0);

    const ab = (meta.aftersalesBeratung as Record<string, any>) || {};
    if (ab.status === "abgeschlossen") continue;

    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("zustaendig_id, vorname, nachname")
      .eq("id", inv.kunde_id)
      .maybeSingle();
    const vpId = kontakt?.zustaendig_id;
    if (!vpId) continue;
    const kundeName = `${kontakt?.vorname || ""} ${kontakt?.nachname || ""}`.trim() || "Kunde";
    const link = `/kunden/${inv.kunde_id}`;
    const diff = dayDiff(today, notarDate);

    // T-1: Vor-Erinnerung
    if (diff === -1 && !ab.vpSignedAt) {
      await insertNotif(vpId,
        `[AB-PRE-${inv.id}] Morgen Notartermin: ${kundeName}`,
        `Bitte am Ende des Notartermins gemeinsam mit ${kundeName} das Aftersales-Beratungsdokument ausfüllen und unterzeichnen.`,
        link, `AB-PRE-${inv.id}`);
      processed++;
      continue;
    }

    // T0: Notartermin heute, noch nicht ausgefüllt
    if (diff === 0 && !ab.vpSignedAt) {
      await insertNotif(vpId,
        `[AB-T0-${inv.id}] Aftersales-Beratung ausfüllen: ${kundeName}`,
        `Heute ist Notartermin. Bitte Beratungsdokument ausfüllen, unterzeichnen und an ${kundeName} senden.`,
        link, `AB-T0-${inv.id}`);
      processed++;
      continue;
    }

    // VP-Eskalation: T+3, T+7 ohne VP-Signatur
    if (!ab.vpSignedAt) {
      if (diff === 3 || diff === 7) {
        await insertNotif(vpId,
          `[AB-VP-${diff}-${inv.id}] Erinnerung Beratungsdokument: ${kundeName}`,
          `Seit ${diff} Tagen offen. Bitte Aftersales-Beratungsdokument ausfüllen und an ${kundeName} versenden.`,
          link, `AB-VP-${diff}-${inv.id}`);
        processed++;
      }
    } else if (!ab.kundeSignedAt) {
      // Kunde-Eskalation T+3, T+7 nach VP-Signatur
      const vpDate = new Date(ab.vpSignedAt);
      vpDate.setHours(0, 0, 0, 0);
      const dSinceVp = dayDiff(today, vpDate);
      if (dSinceVp === 3 || dSinceVp === 7) {
        await insertNotif(vpId,
          `[AB-K-${dSinceVp}-${inv.id}] Kunde hat noch nicht unterschrieben: ${kundeName}`,
          `${kundeName} hat das Beratungsdokument seit ${dSinceVp} Tagen nicht unterzeichnet.`,
          link, `AB-K-${dSinceVp}-${inv.id}`);
        processed++;
      }
    }

    // Admin nach 14 Tagen
    if (diff === 14 && ab.status !== "abgeschlossen") {
      const { data: admins } = await supabase
        .from("user_roles").select("user_id").in("role", ["inhaber", "admin"]);
      for (const a of admins || []) {
        await insertNotif(a.user_id,
          `[AB-ADM-${inv.id}] Aftersales-Beratung 14 Tage offen: ${kundeName}`,
          `Beratungsdokument für ${kundeName} ist seit 14 Tagen offen — bitte beim VP nachfassen.`,
          link, `AB-ADM-${inv.id}`);
      }
      processed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});