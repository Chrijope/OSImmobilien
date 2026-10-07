import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called by pg_cron every 10 minutes. Sends 48h/6h/1h reminders for
// scheduled Bewerber Closing-Termine. State tracked in
// bewerbungen.meta.closingRemindersSent (array of "48h"|"6h"|"1h").
// Kopie an eine externe Adresse gab es hier frueher. Sie ist entfernt: Name,
// Termin und Berater eines Bewerbers sind personenbezogene Daten und haben
// ausserhalb der eigenen Domain nichts zu suchen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const THRESHOLDS: [string, number, number, string][] = [
  ["48h", 47.5, 48.5, "in 48 Stunden"],
  ["6h", 5.5, 6.5, "in 6 Stunden"],
  ["1h", 0.5, 1.5, "in 1 Stunde"],
];

function parseDatum(d: string): string | null {
  // accepts dd.mm.yyyy or yyyy-mm-dd → returns yyyy-mm-dd
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Interpret the stored datum/uhrzeit as Europe/Berlin wall clock time
// and return the corresponding UTC Date. Without this the Deno runtime
// (UTC) would treat "17:00" as 17:00 UTC, i.e. 18:00/19:00 Berlin time,
// causing reminders to fire 1–2 h too late.
function berlinWallClockToUtc(datum: string, uhrzeit: string): Date {
  const [y, mo, d] = datum.split("-").map(Number);
  const [h, mi] = uhrzeit.split(":").map(Number);
  // Start from the naive UTC instant, then shift by Berlin's offset at that instant.
  const naiveUtc = Date.UTC(y, (mo - 1), d, h, mi, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(naiveUtc)).reduce<Record<string,string>>((a,p)=>{a[p.type]=p.value;return a;},{});
  const asBerlin = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute), Number(parts.second),
  );
  const offsetMs = asBerlin - naiveUtc; // Berlin offset from UTC at that moment
  return new Date(naiveUtc - offsetMs);
}

function buildIcsUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  return `${SUPABASE_URL}/functions/v1/get-ics?${qs}`;
}

/**
 * Die HR-Managerin fuer den Ansprechpartner-Kasten. Einmal je Lauf geladen,
 * nicht je Mail: Der Kasten ist fuer alle Empfaenger derselbe.
 */
let hrKontaktCache: Awaited<ReturnType<typeof hrAnsprechpartner>> | undefined;
let hrKontaktGeladen = false;
async function holeHrKontakt(db: any) {
  if (!hrKontaktGeladen) {
    hrKontaktCache = await hrAnsprechpartner(db);
    hrKontaktGeladen = true;
  }
  return hrKontaktCache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-bewerber-closing-reminders", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: bewerber, error } = await supabase
      .from("bewerbungen")
      .select("id, vorname, nachname, email, meta")
      .not("email", "is", null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    let sent = 0;

    for (const b of bewerber || []) {
      const meta = (b.meta as Record<string, any>) || {};
      const datumRaw = meta.closingTerminDatum as string | undefined;
      const uhrzeit = meta.closingTerminUhrzeit as string | undefined;
      const datum = datumRaw ? parseDatum(datumRaw) : null;
      if (!datum || !uhrzeit) continue;

      const terminDate = berlinWallClockToUtc(datum, uhrzeit);
      if (isNaN(terminDate.getTime()) || terminDate <= now) continue;

      const hoursUntil = (terminDate.getTime() - now.getTime()) / 3600000;
      const alreadySent: string[] = meta.closingRemindersSent || [];

      const beraterName = (meta.closingBeraterName as string) || "";
      const beraterEmail = (meta.closingBeraterEmail as string) || "";
      const beraterTelefon = (meta.closingBeraterTelefon as string) || "";
      const displayDate = `${datum.split("-").reverse().join(".")}`;

      for (const [label, minH, maxH, vorText] of THRESHOLDS) {
        if (hoursUntil < (minH as number) || hoursUntil > (maxH as number)) continue;
        if (alreadySent.includes(label as string)) continue;

        const hrKontakt = await holeHrKontakt(supabase);

        const templateData = {

          ...(hrKontakt ? { hrKontakt } : {}),
          bewerberName: `${b.vorname} ${b.nachname}`.trim(),
          beraterName, beraterEmail, beraterTelefon,
          terminDatum: displayDate, terminUhrzeit: uhrzeit,
          vorText,
        };

        // Primary recipient
        const { error: e1 } = await supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "bewerber-closing-erinnerung",
            recipientEmail: b.email,
            // Datum und Uhrzeit gehoeren in den Schluessel: Ein verschobener Termin
            // ist eine neue Erinnerung und darf nicht als Dublette des alten gelten.
            idempotencyKey: `bewerber-closing-reminder-${b.id}-${datum}-${uhrzeit}-${label}`,
            templateData,
          },
        });
        if (e1) { console.error("Reminder send failed", b.id, label, e1); continue; }


        alreadySent.push(label as string);
        sent++;

        await supabase.from("bewerbungen").update({
          meta: { ...meta, closingRemindersSent: alreadySent },
        }).eq("id", b.id);
        // mutate local meta so subsequent thresholds see updated state
        meta.closingRemindersSent = alreadySent;
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});