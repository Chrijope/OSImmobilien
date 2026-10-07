/**
 * Mail an den Vertriebspartner, sobald ihm ein Lead zugewiesen wurde.
 *
 * Die Glocke im CRM gab es schon, eine Mail nicht. Wer nicht gerade im System
 * ist, erfuhr von einem neuen Lead deshalb erst beim naechsten Login.
 *
 * Zwei Betriebsarten:
 *  - `kontaktId`: eine Einzelmail fuer genau diesen Kontakt.
 *  - `kontaktIds`: mehrere Kontakte auf einmal, etwa aus der Massenzuweisung.
 *    Ab drei noch nicht gemeldeten Kontakten geht eine Sammelmail raus statt
 *    vieler Einzelmails, darunter laufen sie einzeln wie bisher.
 *
 * Doppelversand ist zweifach ausgeschlossen: die Merkmarke
 * meta.leadPartnerMailGesendet am Kontakt (je Partner) und der
 * Idempotenzschluessel des Mailversands.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { LEAD_MAIL_NACHLESEN_MS, teileNachZuordnung } from "../_shared/lead-partner-mail-pruefung.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL = "https://portal.more.immo";

/** Ab dieser Zahl noch offener Kontakte wird gebuendelt statt einzeln gemailt. */
const SAMMEL_SCHWELLE = 3;

/** Mehr Namen zeigt die Sammelmail nicht, der Rest wird als Zahl genannt. */
const SAMMEL_MAX_NAMEN = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface KontaktZeile {
  id: string;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  telefon: string | null;
  ort: string | null;
  quelle: string | null;
  meta: Record<string, unknown> | null;
  zustaendig_id: string | null;
}

/** Kurzer, stabiler Streuwert fuer den Idempotenzschluessel der Sammelmail. */
function kurzHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}

function leadQuelle(kontakt: KontaktZeile): string {
  const meta = (kontakt.meta as Record<string, unknown>) || {};
  return String(
    (meta.quelle as string) || (meta.leadQuelle as string) || kontakt.quelle || "",
  ).trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { kontaktId, kontaktIds, partnerId } = await req.json();
    const ids: string[] = Array.isArray(kontaktIds) && kontaktIds.length > 0
      ? kontaktIds.map(String).filter(Boolean)
      : kontaktId
        ? [String(kontaktId)]
        : [];
    if (ids.length === 0 || !partnerId) {
      return json({ error: "kontaktId oder kontaktIds und partnerId erforderlich" }, 400);
    }

    const { data: profil } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", partnerId)
      .maybeSingle();

    const empfaenger = String(profil?.email || "").trim();
    if (!empfaenger || empfaenger.endsWith("@noemail.local")) {
      return json({ ok: false, grund: "keine_email" });
    }
    const partnerVorname = String(profil?.name || "").trim().split(" ")[0] || "";

    const ladeKontakte = async (kennungen: string[]): Promise<KontaktZeile[]> => {
      const { data, error } = await supabase
        .from("kontakte")
        .select("id, vorname, nachname, email, telefon, ort, quelle, meta, zustaendig_id")
        .in("id", kennungen);
      if (error) throw new Error(error.message);
      return (data || []) as KontaktZeile[];
    };

    const geladen = await ladeKontakte(ids);
    if (geladen.length === 0) return json({ ok: false, grund: "kontakt_nicht_gefunden" });

    // Nur Kontakte, die diesem Partner wirklich zugeordnet sind. Die
    // Zuweisung im CRM speichert ohne await, deshalb vor dem Verwerfen noch
    // einmal nachlesen. Begruendung in `_shared/lead-partner-mail-pruefung.ts`.
    let { zugeordnet: kontakte, fremd } = teileNachZuordnung(geladen, String(partnerId));
    for (const pause of LEAD_MAIL_NACHLESEN_MS) {
      if (fremd.length === 0) break;
      await new Promise((r) => setTimeout(r, pause));
      const nachgelesen = teileNachZuordnung(await ladeKontakte(fremd.map((k) => k.id)), String(partnerId));
      kontakte = [...kontakte, ...nachgelesen.zugeordnet];
      fremd = nachgelesen.fremd;
    }
    if (fremd.length > 0) {
      console.warn(
        "[send-lead-partner-mail] Kontakt nicht beim Empfaenger, keine Mail",
        JSON.stringify({ partnerId, kontakte: fremd.map((k) => k.id) }),
      );
    }
    if (kontakte.length === 0) return json({ ok: false, grund: "nicht_zugeordnet" });

    // Nur Kontakte, fuer die dieser Partner noch keine Mail bekommen hat.
    const offen = kontakte.filter((k) => {
      const meta = (k.meta as Record<string, unknown>) || {};
      const bereits = (meta.leadPartnerMailGesendet as Record<string, string> | undefined) || {};
      return !bereits[partnerId];
    });
    if (offen.length === 0) return json({ ok: true, grund: "bereits_gesendet" });

    const jetzt = new Date().toISOString();
    const merkeGesendet = async (kontakt: KontaktZeile) => {
      const meta = (kontakt.meta as Record<string, unknown>) || {};
      const bereits = (meta.leadPartnerMailGesendet as Record<string, string> | undefined) || {};
      await supabase.rpc("merge_kontakt_meta", {
        _kontakt_id: kontakt.id,
        _updates: { leadPartnerMailGesendet: { ...bereits, [partnerId]: jetzt } },
      });
    };

    // ── Sammelmail ab der Schwelle ───────────────────────────────────────
    if (offen.length >= SAMMEL_SCHWELLE) {
      const sortierteIds = offen.map((k) => k.id).sort();
      const gezeigt = offen.slice(0, SAMMEL_MAX_NAMEN);
      const ergebnis = await sendeVorlage(supabase, {
        templateName: "leads-zugewiesen-sammel",
        recipientEmail: empfaenger,
        idempotencyKey: `lead-partner-sammel-${partnerId}-${kurzHash(sortierteIds.join(","))}`,
        templateData: {
          partnerVorname,
          anzahl: offen.length,
          leads: gezeigt.map((k) => ({
            name: `${k.vorname || ""} ${k.nachname || ""}`.trim() || "Unbenannter Kontakt",
            url: `${PORTAL}/kunden/${k.id}`,
          })),
          weitere: Math.max(0, offen.length - gezeigt.length),
          uebersichtUrl: `${PORTAL}/kontakte`,
        },
      });

      if (!ergebnis.ok) {
        console.error("[send-lead-partner-mail] Sammelversand fehlgeschlagen", ergebnis.grund);
        return json({ ok: false, grund: ergebnis.grund }, 500);
      }
      for (const k of offen) await merkeGesendet(k);
      return json({ ok: true, empfaenger, sammel: true, anzahl: offen.length });
    }

    // ── Einzelmails unterhalb der Schwelle ───────────────────────────────
    let gesendet = 0;
    for (const kontakt of offen) {
      const leadName = `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim();
      const leadEmail = String(kontakt.email || "").trim();

      const ergebnis = await sendeVorlage(supabase, {
        templateName: "neuer-lead-partner",
        recipientEmail: empfaenger,
        idempotencyKey: `lead-partner-${kontakt.id}-${partnerId}`,
        templateData: {
          partnerVorname,
          leadName,
          leadTelefon: String(kontakt.telefon || "").trim(),
          leadEmail: leadEmail.endsWith("@noemail.local") ? "" : leadEmail,
          leadOrt: String(kontakt.ort || "").trim(),
          leadQuelle: leadQuelle(kontakt),
          profilUrl: `${PORTAL}/kunden/${kontakt.id}`,
        },
      });

      if (!ergebnis.ok) {
        console.error("[send-lead-partner-mail] Versand fehlgeschlagen", ergebnis.grund);
        // Einzelfehler nur melden, wenn gar nichts rausging. Sonst wuerde ein
        // Fehlversand den Erfolg der uebrigen Mails verschweigen.
        if (gesendet === 0 && offen.length === 1) {
          return json({ ok: false, grund: ergebnis.grund }, 500);
        }
        continue;
      }
      await merkeGesendet(kontakt);
      gesendet++;
    }

    return json({ ok: gesendet > 0, empfaenger, anzahl: gesendet });
  } catch (e) {
    console.error("[send-lead-partner-mail]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
