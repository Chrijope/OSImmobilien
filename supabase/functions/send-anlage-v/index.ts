/**
 * Versendet die Anlage-V-Aufstellung eines Kunden als PDF-Anhang an dessen
 * Steuerberater. Aufgerufen aus dem Kundenportal (Steuer-Bereich), das PDF
 * entsteht im Browser (anlageVPdf.ts) und kommt als Base64 mit.
 *
 * Ablauf: Eingabe pruefen, Rate-Limit, dann ueber sendeVorlage an
 * send-transactional-email (Vorlage "anlage-v-aufstellung"). Von dort laeuft
 * die Mail durch die uebliche Warteschlange (email_send_log, Wiederholungen).
 *
 * Bewusste Entscheidungen:
 *
 *   Sperrliste (suppressed_emails): Der Empfaenger ist der Steuerberater des
 *   Kunden, kein Newsletter-Empfaenger. Eine alte Abmeldung oder ein Bounce
 *   darf diese vom Kunden ausdruecklich ausgeloeste Zustellung nicht stumm
 *   blockieren. Deshalb steht "anlage-v-aufstellung" in send-transactional-email
 *   auf der PFLICHTMAILS-Liste; nur eine Spam-Beschwerde sperrt weiterhin.
 *
 *   Reply-To: Antworten des Steuerberaters sollen beim Kunden ankommen, nicht
 *   bei noreply@. Deshalb wird die Anmeldeadresse des eingeloggten Kunden als
 *   Reply-To durchgereicht.
 *
 *   Rate-Limit: hoechstens 10 Versendungen je Nutzer und Stunde, ueber die
 *   vorhandene check_rate_limit-Infrastruktur (rate_limit_buckets), keine
 *   neue Tabelle.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** 5 MB Binaerdaten entsprechen etwa 6,7 Mio. Base64-Zeichen (4/3-Faktor). */
const MAX_PDF_BASE64_ZEICHEN = 7_000_000;

export interface AnlageVAuftrag {
  empfaengerEmail: string;
  betreff?: string;
  nachricht?: string;
  pdfBase64: string;
  dateiname: string;
  investmentBezeichnung: string;
  jahr: number;
}

/**
 * Reine Eingabepruefung, bewusst ohne Aussenwelt, damit sie fuer sich
 * nachvollziehbar (und bei Bedarf testbar) bleibt. Liefert den bereinigten
 * Auftrag oder eine Fehlermeldung fuer den Aufrufer.
 */
export function pruefeAnlageVAuftrag(
  body: unknown,
): { ok: true; auftrag: AnlageVAuftrag } | { ok: false; fehler: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const empfaengerEmail = typeof b.empfaengerEmail === "string" ? b.empfaengerEmail.trim() : "";
  // Bewusst dieselbe pragmatische Pruefung wie istEmail im Frontend
  // (buchungAuswahl.ts): ein @, ein Punkt in der Domain, keine Leerzeichen.
  if (
    !empfaengerEmail ||
    empfaengerEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(empfaengerEmail)
  ) {
    return { ok: false, fehler: "Bitte eine gültige E-Mail-Adresse angeben." };
  }

  const pdfBase64 = typeof b.pdfBase64 === "string" ? b.pdfBase64 : "";
  if (!pdfBase64) {
    return { ok: false, fehler: "Das PDF fehlt." };
  }
  if (pdfBase64.length > MAX_PDF_BASE64_ZEICHEN) {
    return { ok: false, fehler: "Das PDF ist zu groß (mehr als 5 MB)." };
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
    return { ok: false, fehler: "Das PDF ist nicht als Base64 kodiert." };
  }

  const jahr = Number(b.jahr);
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    return { ok: false, fehler: "Das Veranlagungsjahr ist ungültig." };
  }

  const investmentBezeichnung =
    (typeof b.investmentBezeichnung === "string" ? b.investmentBezeichnung.trim() : "").slice(0, 200) ||
    "Investment";

  // Dateiname auf harmlose Zeichen begrenzen, er landet im Mailanhang.
  const dateinameRoh = typeof b.dateiname === "string" ? b.dateiname.trim() : "";
  const dateiname =
    dateinameRoh.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120) ||
    `anlage-v-vorbereitung_${jahr}.pdf`;

  const betreff = (typeof b.betreff === "string" ? b.betreff.trim() : "").slice(0, 200) || undefined;
  const nachricht = (typeof b.nachricht === "string" ? b.nachricht.trim() : "").slice(0, 2000) || undefined;

  return {
    ok: true,
    auftrag: { empfaengerEmail, betreff, nachricht, pdfBase64, dateiname, investmentBezeichnung, jahr },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // verify_jwt = true prueft den Token bereits am Gateway; hier wird
    // zusaetzlich der Nutzer aufgeloest, weil seine Adresse als Reply-To
    // in die Mail gehoert.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller || !caller.email) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Ungültige Anfrage" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geprueft = pruefeAnlageVAuftrag(body);
    if (!geprueft.ok) {
      return new Response(JSON.stringify({ error: geprueft.fehler }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auftrag = geprueft.auftrag;

    // Hoechstens 10 Versendungen je Nutzer und Stunde.
    const limit = await checkRateLimit(req, caller.id, { scope: "send-anlage-v", perHour: 10 });
    if (!limit.ok) {
      return rateLimitErrorBody("send-anlage-v", limit, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Name des Kunden fuer den Mailtext; die Mail geht auch ohne Profil raus.
    let kundenName = "";
    try {
      const { data: profil } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", caller.id)
        .maybeSingle();
      kundenName = typeof profil?.name === "string" ? profil.name.trim() : "";
    } catch {
      // Beiwerk, siehe oben.
    }

    const versand = await sendeVorlage(supabase, {
      templateName: "anlage-v-aufstellung",
      recipientEmail: auftrag.empfaengerEmail,
      idempotencyKey: `anlage-v-${crypto.randomUUID()}`,
      templateData: {
        subject: auftrag.betreff,
        kundenName,
        kundenEmail: caller.email,
        investmentBezeichnung: auftrag.investmentBezeichnung,
        jahr: auftrag.jahr,
        dateiname: auftrag.dateiname,
        nachricht: auftrag.nachricht,
      },
      // Landet in email_send_log.metadata, damit nachvollziehbar bleibt,
      // wer welche Aufstellung verschickt hat.
      metadata: { sent_by: caller.id, investment: auftrag.investmentBezeichnung, jahr: auftrag.jahr },
      replyTo: caller.email,
      attachments: [
        {
          filename: auftrag.dateiname,
          content: auftrag.pdfBase64,
          type: "application/pdf",
        },
      ],
    });

    if (!versand.ok) {
      console.error("Anlage-V-Versand fehlgeschlagen:", versand.grund);
      return new Response(
        JSON.stringify({ error: versand.grund || "Versand fehlgeschlagen" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true, queued: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-anlage-v:", error);
    return new Response(
      JSON.stringify({ error: "Unerwarteter Fehler beim Versand" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
