import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { beraterKennung, kennungMitNamensprobe } from "../_shared/berater-namensabgleich.ts";
import { berufsbezeichnung } from "../_shared/berufsbezeichnung.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Interpret a stored datum (yyyy-mm-dd or dd.mm.yyyy) + uhrzeit (HH:mm) as
// Europe/Berlin wall-clock time and return the corresponding UTC Date.
// Deno runs in UTC, so without this the reminders fire 1–2 h too late.
function berlinWallClockToUtc(datumIn: string, uhrzeit: string): Date | null {
  if (!datumIn || !uhrzeit) return null;
  let datum = datumIn;
  const m = datumIn.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) datum = `${m[3]}-${m[2]}-${m[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  const [y, mo, d] = datum.split("-").map(Number);
  const [h, mi] = uhrzeit.split(":").map(Number);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  const naiveUtc = Date.UTC(y, mo - 1, d, h, mi, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(naiveUtc)).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const asBerlin = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = asBerlin - naiveUtc;
  return new Date(naiveUtc - offsetMs);
}

/**
 * send-erstgespraech-reminders
 *
 * Called by pg_cron every 10 minutes. Checks kontakte with upcoming
 * Erstgespräch appointments and sends email reminders at 24h, 6h, and 1h before.
 *
 * Reminder state is tracked in kontakte.meta.remindersSent (array of strings like "24h", "6h", "1h").
 *
 * Berater-Auflösung (Priorität):
 *   1. meta.setterCloser  – Berater, dem die Setterin den Termin zugewiesen hat
 *   2. kontakte.berater   – aktueller Berater im Kundenprofil (Fallback)
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: kontakte, error } = await supabase
      .from("kontakte")
      .select("id, vorname, nachname, email, berater, zustaendig_id, meta")
      .not("email", "is", null)
      .eq("archiviert", false)
      .eq("geloescht", false);

    if (error) {
      console.error("Query error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let sentCount = 0;

    const THRESHOLDS: [string, number, number][] = [
      ["24h", 23.5, 24.5],
      ["6h", 5.5, 6.5],
      ["1h", 0.5, 1.5],
    ];

    const VOR_TEXT_MAP: Record<string, string> = {
      "24h": "in 24 Stunden",
      "6h": "in 6 Stunden",
      "1h": "in 1 Stunde",
    };

    for (const kontakt of kontakte || []) {
      const meta = kontakt.meta as Record<string, any> | null;
      if (!meta) continue;

      const terminDatum = meta.setterTerminDatum;
      const terminUhrzeit = meta.setterTerminUhrzeit;

      // Berater-Auflösung: zugewiesener Berater (Setter) > Kundenprofil-Berater
      const berater: string =
        (meta.setterCloser as string | undefined) ||
        (kontakt.berater as string | undefined) ||
        "";

      if (!terminDatum || !terminUhrzeit) continue;

      const terminDate = berlinWallClockToUtc(String(terminDatum), String(terminUhrzeit));
      if (!terminDate || isNaN(terminDate.getTime())) continue;
      if (terminDate <= now) continue;

      const hoursUntil = (terminDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      const remindersSent: string[] = meta.remindersSent || [];

      // Berater-Profil + Einstellungen laden (für personalisierte Mail)
      let beraterEmail = "";
      let beraterTelefon = "";
      let beraterBild = "";
      let beraterPosition = "";
      let beraterAnzeigeName = berater;

      // Kennungen zuerst: setterCloserId, dann zustaendig_id. Die Namen nur
      // als eindeutiger Rueckfall, in derselben Rangfolge wie oben.
      const beraterId =
        // setterCloserId nur, wenn der Name dahinter zu setterCloser passt.
        await kennungMitNamensprobe(supabase, meta.setterCloserId as string | undefined, meta.setterCloser as string | undefined) ||
        await beraterKennung(supabase, (kontakt as any).zustaendig_id, [kontakt.berater as string | undefined]);

      if (beraterId) {
        const { data: beraterProfile } = await supabase
          .from("profiles")
          .select("id, name, email, avatar_url")
          .eq("id", beraterId)
          .maybeSingle();

        if (beraterProfile) {
          beraterAnzeigeName = beraterProfile.name || berater;
          beraterEmail = beraterProfile.email || "";
          beraterBild = beraterProfile.avatar_url || "";

          // Telefon + Position aus user_settings.einstellungen.profil
          const { data: settings } = await supabase
            .from("user_settings")
            .select("einstellungen")
            .eq("user_id", beraterProfile.id)
            .maybeSingle();

          const profil = (settings?.einstellungen as any)?.profil || {};
          beraterTelefon = profil.telefon || "";
          // Die Bezeichnung kommt aus der Rolle. Im Positionsfeld steht bei
          // vielen Nutzern noch die Rollenkennung, etwa "Admin", und die
          // liest hier der Kunde in Mail und Analyse-Link.
          const { data: rollenZeilen } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", beraterProfile.id);
          beraterPosition = berufsbezeichnung(
            ((rollenZeilen ?? []) as Array<{ role?: string }>)
              .map((r) => String(r?.role || ""))
              .filter(Boolean),
            profil.position,
          );
        }
      }

      // Analyse-URL mit Berater-Kontext
      let analyseUrl = "https://osimmobilien.netlify.app/analyse?source=reminder";
      if (beraterAnzeigeName) {
        const beraterPayload = btoa(
          unescape(
            encodeURIComponent(
              JSON.stringify({
                name: beraterAnzeigeName,
                email: beraterEmail,
                telefon: beraterTelefon,
                bild: beraterBild,
                position: beraterPosition,
              }),
            ),
          ),
        );
        analyseUrl += `&b=${encodeURIComponent(beraterPayload)}`;
      }

      for (const [label, minH, maxH] of THRESHOLDS) {
        if (hoursUntil >= minH && hoursUntil <= maxH && !remindersSent.includes(label)) {
          const parts = terminDatum.split("-");
          const displayDate = parts.length === 3
            ? `${parts[2]}.${parts[1]}.${parts[0]}`
            : terminDatum;

          const idempotencyKey = `erstgespraech-reminder-${kontakt.id}-${label}`;
          const templateName = `erstgespraech-erinnerung-${label}`;

          const { error: sendError } = await supabase.functions.invoke(
            "send-transactional-email",
            {
              body: {
                templateName,
                recipientEmail: kontakt.email,
                idempotencyKey,
                kontaktId: kontakt.id,
                templateData: {
                  kundeName: `${kontakt.vorname} ${kontakt.nachname}`,
                  beraterName: beraterAnzeigeName,
                  beraterEmail,
                  beraterTelefon,
                  beraterBild,
                  beraterPosition,
                  terminDatum: displayDate,
                  terminUhrzeit: terminUhrzeit,
                  vorText: VOR_TEXT_MAP[label],
                  analyseUrl,
                },
              },
            },
          );

          if (sendError) {
            console.error(`Failed to send ${label} reminder for ${kontakt.id}:`, sendError);
            continue;
          }

          const updatedReminders = [...remindersSent, label];
          await supabase.rpc("merge_kontakt_meta", {
            _kontakt_id: kontakt.id,
            _updates: { remindersSent: updatedReminders },
          });

          remindersSent.push(label);
          sentCount++;
          console.log(
            `Sent ${label} reminder to ${kontakt.email} for termin ${terminDatum} ${terminUhrzeit} (Berater: ${beraterAnzeigeName})`,
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, sent: sentCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Reminder error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
