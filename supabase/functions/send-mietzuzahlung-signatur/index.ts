import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { signaturAblauf, signaturAblaufText } from "../_shared/signatur-frist.ts";
import {
  emailIstBrauchbar,
  empfaengerAusKontakt,
  pruefeKontaktZugriff,
  ZUGRIFF_ABGELEHNT,
} from "../_shared/kontakt-signatur-zugriff.ts";

/**
 * Vereinbarung über eine Mietzuzahlung an den Kunden zur Unterschrift
 * schicken (30.10.2026), gebaut wie `send-reservation-signature`.
 *
 * - Anmeldung, Zugriff auf den Kontakt (`pruefeKontaktZugriff`) und
 *   Zugehörigkeit des Investments werden hier geprüft.
 * - Inhalt ist der gespeicherte Entwurf `investments.meta.mietzuzahlungEntwurf`,
 *   nicht der Aufruf. Vertragspartner 2 unterschreibt immer in Mittenwalde
 *   mit dem Tag des Versands.
 * - Empfänger aus dem Kontakt, der Token geht nie an den Browser.
 * - Offene ältere Anfragen werden überholt, damit nur ein Link gilt.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";
export const PERSON_TYPE = "mietzuzahlung_kunde";

const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const heuteIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return antwort({ error: "Nicht autorisiert" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return antwort({ error: "Nicht autorisiert" }, 401);

    const rl = await checkRateLimit(req, caller.id, { scope: "send-mietzuzahlung-signatur", perHour: 10, perDay: 50 });
    if (!rl.ok) return rateLimitErrorBody("send-mietzuzahlung-signatur", rl, corsHeaders);

    const { investmentId } = await req.json().catch(() => ({}));
    if (typeof investmentId !== "string" || !investmentId.trim()) return antwort({ error: "Investment fehlt." }, 400);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: inv, error: invFehler } = await supabase
      .from("investments").select("kunde_id, meta, objekt, wohnung").eq("id", investmentId).maybeSingle();
    if (invFehler || !inv?.kunde_id) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);
    const kontaktId = inv.kunde_id as string;

    // Darf DIESER Nutzer für DIESEN Kunden handeln? Der Kontakt kommt aus dem Investment, nie aus dem Aufruf.
    const { erlaubt, kontakt } = await pruefeKontaktZugriff(
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      kontaktId,
      caller.id,
    );
    if (!erlaubt || !kontakt) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);

    const meta = (inv.meta ?? {}) as Record<string, any>;
    const entwurf = meta.mietzuzahlungEntwurf;
    if (!entwurf || typeof entwurf !== "object") {
      return antwort({ error: "Bitte das Mietzuzahlungsschreiben zuerst erstellen." }, 400);
    }
    if (meta.mietzuzahlung?.status === "unterschrieben") {
      return antwort({ error: "Die Vereinbarung ist bereits unterschrieben." }, 409);
    }
    const daten = { ...entwurf, ort2: "Mittenwalde", datum2: heuteIso() };

    const empfaenger = empfaengerAusKontakt(kontakt, "person1");
    if (!emailIstBrauchbar(empfaenger.email)) {
      return antwort({ error: "Am Kontakt ist keine gültige E-Mail-Adresse hinterlegt. Bitte zuerst in den Stammdaten eintragen." }, 400);
    }

    // Nur ein Link gilt: offene ältere Anfragen dieses Investments überholen.
    await supabase.from("signature_requests").update({ status: "ueberholt" })
      .eq("investment_id", investmentId).eq("person_type", PERSON_TYPE).eq("status", "pending");

    const token = crypto.randomUUID();
    const expiresAt = signaturAblauf();
    const { error: insertFehler } = await supabase.from("signature_requests").insert({
      token,
      kontakt_id: kontaktId,
      investment_id: investmentId,
      name: empfaenger.name || daten.kaeuferName || "",
      email: empfaenger.email,
      person_type: PERSON_TYPE,
      sa_data: { mietzuzahlung: daten },
      status: "pending",
      expires_at: expiresAt,
    });
    if (insertFehler) {
      console.error("Mietzuzahlung: Anfrage nicht angelegt", insertFehler);
      return antwort({ error: "Die Anfrage konnte nicht angelegt werden." }, 500);
    }

    const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);
    const objektTitel = [daten.strasse, daten.weNr ? `WE ${daten.weNr}` : ""].filter(Boolean).join(", ");
    const versand = await sendeVorlage(supabase, {
      templateName: "mietzuzahlung-signatur",
      recipientEmail: empfaenger.email,
      idempotencyKey: `mietzu-sig-${token}`,
      templateData: {
        name: empfaenger.name,
        signUrl: `${SIGNATURE_BASE_URL}?token=${token}&type=${PERSON_TYPE}`,
        gueltigBis: signaturAblaufText(expiresAt),
        objektTitel,
        ...(berater ? { berater } : {}),
      },
      metadata: { kontakt_id: kontaktId, investment_id: investmentId, person_type: PERSON_TYPE },
    });

    // Frisch lesen, damit eine Änderung seit dem Laden nicht verloren geht. `mietzuzahlung` schreibt nur der Server.
    const { data: frisch } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const aktuell = (frisch?.meta ?? meta) as Record<string, unknown>;
    await supabase.from("investments").update({
      meta: {
        ...aktuell,
        mietzuzahlung: {
          status: "gesendet",
          gesendetAm: new Date().toISOString(),
          gesendetAn: empfaenger.email,
          versandOk: versand.ok,
          ...(versand.ok ? {} : { versandGrund: versand.grund }),
        },
      },
    }).eq("id", investmentId);

    if (!versand.ok) return antwort({ ok: false, grund: versand.grund || "Mail nicht zugestellt" }, 502);
    return antwort({ ok: true, email: empfaenger.email });
  } catch (e) {
    console.error("send-mietzuzahlung-signatur", e);
    return antwort({ error: "Unerwarteter Fehler beim Versand." }, 500);
  }
});
