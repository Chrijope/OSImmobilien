// Cron: tägliche Prüfung von „Eigene Investments" und Erstellung relevanter Benachrichtigungen.
// Trigger: Anschlussfinanzierung (18/12/6 Mon vor Zinsbindung), Reinvest (>6 Mon nach Kauf),
//          Marktwert-Update (jährlich), Steuer-Cockpit (Januar), Sondertilgungs-Fenster.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { kundenSprache, type Sprache } from "../_shared/kunden-sprache.ts";
import { EIGENE_INVESTMENTS_SPERRE as SPERRE, EIGENE_INVESTMENTS_TEXTE as TEXTE } from "../_shared/kunden-glocke.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function monthsBetween(a: Date, b: Date) {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "eigene-investments-reminders", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: invs, error } = await supabase.from("externe_investments").select("*");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const today = new Date();
  let created = 0;
  const errors: string[] = [];

  // Je Anlass genau eine Glocke: geprueft wird der Sperrschluessel in
  // meta.sperre, nicht mehr das Tagesdatum (siehe EIGENE_INVESTMENTS_SPERRE).
  const insertNotif = async (user_id: string, titel: string, nachricht: string, link: string, sperre: string) => {
    const { data: existing, error: suchFehler } = await supabase
      .from("benachrichtigungen")
      .select("id")
      .eq("benutzer_id", user_id)
      .eq("meta->>sperre", sperre)
      .limit(1);
    // Ohne Gewissheit keine Glocke, sonst kaeme sie bei jedem Fehler erneut.
    if (suchFehler) { errors.push(`${sperre}: ${suchFehler.message}`); return; }
    if (existing && existing.length > 0) return;
    const { error: insFehler } = await supabase
      .from("benachrichtigungen")
      .insert({ benutzer_id: user_id, titel, nachricht, link, meta: { sperre } });
    // 23505: Ein paralleler Lauf war schneller, der eindeutige Index aus
    // 20261004191000 hat die zweite Glocke abgelehnt. Das ist kein Fehler.
    if (insFehler?.code === "23505") return;
    if (insFehler) { errors.push(`${sperre}: ${insFehler.message}`); return; }
    created++;
  };

  // Die Texte gehen in der Sprache aus dem Kundenprofil hinaus (Plan
  // Kundensprache, P18). `user_id` ist der Portalnutzer; je Nutzer nur einmal
  // nachsehen. Findet sich kein Kontakt, gilt Deutsch.
  const sprachen = new Map<string, Sprache>();
  const spracheVon = async (userId: string): Promise<Sprache> => {
    if (!sprachen.has(userId)) sprachen.set(userId, await kundenSprache(supabase, { authUserId: userId }));
    return sprachen.get(userId)!;
  };

  for (const inv of invs || []) {
    const m = (inv.meta || {}) as any;
    const link = `/kunde/investments?tab=eigene&inv=${inv.id}`;
    const sprache = await spracheVon(inv.user_id);

    // Anschlussfinanzierung
    if (m.zinsbindung_bis) {
      const zb = new Date(m.zinsbindung_bis);
      const months = monthsBetween(today, zb);
      if ([18, 12, 6].includes(months)) {
        const t = TEXTE.anschlussfinanzierung(sprache, inv.bezeichnung, months);
        await insertNotif(inv.user_id, t.titel, t.nachricht, link, SPERRE.anschlussfinanzierung(inv.id, String(m.zinsbindung_bis), months));
      }
    }

    // Reinvest-Reminder
    const kaufdatum = inv.kaufdatum || m.uebergabe;
    if (kaufdatum) {
      const kd = new Date(kaufdatum);
      const months = monthsBetween(kd, today);
      if ([6, 12, 18].includes(months)) {
        const t = TEXTE.reinvest(sprache, months);
        await insertNotif(inv.user_id, t.titel, t.nachricht, "/kunde/chat", SPERRE.reinvest(inv.id, months));
      }
    }

    // Marktwert-Update jährlich
    const historie = (m.marktwertHistorie || []) as any[];
    const letzter = historie[historie.length - 1];
    if (!letzter || monthsBetween(new Date(letzter.datum), today) >= 12) {
      // Nur 1× pro Quartal nudgen
      if (today.getDate() === 1 && today.getMonth() % 3 === 0) {
        const t = TEXTE.marktwert(sprache, inv.bezeichnung);
        await insertNotif(inv.user_id, t.titel, t.nachricht, link, SPERRE.marktwert(inv.id, today));
      }
    }

    // Steuer-Cockpit Jahresabschluss (Januar)
    if (today.getMonth() === 0 && today.getDate() === 15) {
      const t = TEXTE.steuer(sprache, inv.bezeichnung);
      await insertNotif(inv.user_id, t.titel, t.nachricht, link, SPERRE.steuer(inv.id, today));
    }

    // Sondertilgungs-Fenster (jährlich am Kauf-Stichtag)
    if (kaufdatum && m.sondertilgung_jahr && m.sondertilgung_jahr > 0) {
      const kd = new Date(kaufdatum);
      if (today.getMonth() === kd.getMonth() && today.getDate() === Math.min(kd.getDate(), 28)) {
        const t = TEXTE.sondertilgung(sprache, inv.bezeichnung, Number(m.sondertilgung_jahr));
        await insertNotif(inv.user_id, t.titel, t.nachricht, link, SPERRE.sondertilgung(inv.id, today));
      }
    }
  }

  // Die Meldungen ins Log, nach aussen nur die Zahl.
  if (errors.length) console.error("eigene-investments-reminders: Fehler:", errors.slice(0, 50).join(" | "));
  return new Response(JSON.stringify({ ok: errors.length === 0, created, fehler: errors.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});