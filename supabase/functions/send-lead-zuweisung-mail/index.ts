/**
 * Willkommensmail an den Lead, sobald ihm intern ein Vertriebspartner
 * zugewiesen ist.
 *
 * Geschichte: Bis zum 26.09.2026 ging hier eine Bestätigungsmail raus, dann
 * war sie auf Christians Wunsch stillgelegt. Seit dem 30.09.2026 verschickt
 * die Function die neue Willkommensmail `lead-willkommen` mit dem Link auf den
 * Handbuch-Konfigurator des Partners.
 *
 * Aufgerufen aus `leadZuweisenWennFrei` (src/lib/kundenStore.ts), über die
 * jede Zuweisung läuft. Warum erst nach der Zuweisung: Dann steht der Partner
 * fest und die Mail trägt dessen Namen und Kontaktdaten. Den Partner liest
 * send-transactional-email selbst aus `kontakte.zustaendig_id`.
 *
 * Wer darf auslösen: ein angemeldeter Mensch, der entweder selbst zuständig
 * ist oder Admin, Inhaber oder Vertriebsleitung ist. Mit dem öffentlichen
 * Schlüssel allein geht nichts raus.
 *
 * Doppelversand ist zweifach ausgeschlossen: die Merkmarke
 * meta.leadWillkommenGesendet am Kontakt und der Idempotenzschlüssel.
 * Handbuch-Leads bekommen keine, sie haben das Handbuch schon angefordert.
 *
 * Seit dem 30.09.2026 führt der Hauptknopf auf einen persönlichen Link
 * (/handbuch-einladung/<token>, Function handbuch-einladung): sechs Fragen,
 * aber kein Formular mehr, die Kontaktdaten sind ja schon da.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nutzerAusJwt } from "../_shared/ansprechpartner.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { einladungsLink, neueEinladung } from "../_shared/handbuch-einladung.ts";
import { spracheAusMeta } from "../_shared/kunden-sprache.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PORTAL = "https://portal.more.immo";
const LEITUNG = new Set(["admin", "inhaber", "vertriebsleiter"]);
const KAMPAGNE = "utm_source=mail&utm_medium=email&utm_campaign=willkommen";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const aufrufer = nutzerAusJwt(req.headers.get("authorization"));
  if (!aufrufer) return json({ error: "anmeldung_noetig" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { kontaktId } = await req.json();
    if (!kontaktId) return json({ error: "kontaktId erforderlich" }, 400);

    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, email, meta, zustaendig_id")
      .eq("id", kontaktId)
      .maybeSingle();
    if (!kontakt) return json({ ok: false, grund: "kontakt_nicht_gefunden" });

    const zustaendig = String(kontakt.zustaendig_id || "").trim();
    if (!zustaendig) return json({ ok: false, grund: "nicht_zugeordnet" });

    if (aufrufer !== zustaendig) {
      const { data: rollen } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", aufrufer);
      const darf = ((rollen ?? []) as Array<{ role?: string }>).some((r) => LEITUNG.has(String(r.role || "")));
      if (!darf) return json({ error: "keine_berechtigung" }, 403);
    }

    const meta = (kontakt.meta as Record<string, unknown>) || {};
    if (meta.leadWillkommenGesendet) return json({ ok: true, grund: "bereits_gesendet" });
    if (meta.handbuchFunnel || meta.handbuchSelbstauskunft) {
      return json({ ok: true, grund: "handbuch_lead" });
    }

    const empfaenger = String(kontakt.email || "").trim();
    if (!empfaenger || empfaenger.endsWith("@noemail.local")) {
      return json({ ok: false, grund: "keine_email" });
    }

    // Das Kürzel führt auf die Handbuchseite des Partners, dann landet ein
    // neu angelegter Stand gleich bei ihm. Ohne Kürzel die allgemeine Seite.
    const { data: profil } = await supabase
      .from("profiles")
      .select("vp_slug")
      .eq("id", zustaendig)
      .maybeSingle();
    const kuerzel = String(profil?.vp_slug || "").trim();
    const basis = `${PORTAL}/handbuch${kuerzel ? `/${encodeURIComponent(kuerzel)}` : ""}`;
    // Die Links öffnen in der Profilsprache, wie die Mail selbst (M14).
    const kampagne = spracheAusMeta(meta) === "en" ? `${KAMPAGNE}&lang=en` : KAMPAGNE;

    // Der persönliche Link muss am Kontakt stehen, bevor die Mail rausgeht.
    const einladung = neueEinladung();
    const { error: einladungFehler } = await supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: kontakt.id,
      _updates: { handbuchEinladung: einladung },
    });
    // Ohne gespeicherten Link führt der Knopf wie bisher auf den normalen
    // Konfigurator des Partners, die Mail geht trotzdem.
    const konfiguratorLink = einladungFehler
      ? `${basis}/konfigurator?${kampagne}`
      : einladungsLink(PORTAL, einladung.token, kampagne);
    if (einladungFehler) console.error("[send-lead-zuweisung-mail] Einladung nicht gespeichert", einladungFehler.message);

    const ergebnis = await sendeVorlage(supabase, {
      templateName: "lead-willkommen",
      recipientEmail: empfaenger,
      idempotencyKey: `lead-willkommen-${kontakt.id}`,
      kontaktId: kontakt.id,
      templateData: {
        kundeName: `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim(),
        konfiguratorLink,
        handbuchLink: `${basis}?${kampagne}`,
      },
    });
    if (!ergebnis.ok) {
      console.error("[send-lead-zuweisung-mail] Versand fehlgeschlagen", ergebnis.grund);
      return json({ ok: false, grund: ergebnis.grund || "versand_fehlgeschlagen" }, 500);
    }

    await supabase.rpc("merge_kontakt_meta", {
      _kontakt_id: kontakt.id,
      _updates: {
        leadWillkommenGesendet: new Date().toISOString(),
        leadWillkommenPartner: zustaendig,
      },
    });

    return json({ ok: true });
  } catch (e) {
    console.error("[send-lead-zuweisung-mail]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
