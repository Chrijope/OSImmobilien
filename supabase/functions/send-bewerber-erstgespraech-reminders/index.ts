import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BEWERBER_MAIL_BASIS } from "../_shared/bewerber-absender.ts";
import { hrAnsprechpartner } from "../_shared/hr-ansprechpartner.ts";
import {
  faelligeStufe,
  istNeuerProzess,
  stufenFuer,
  terminStoppGrund,
  vorlageFuer,
} from "../_shared/bewerber-termin-erinnerungen.ts";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Called by pg_cron every 10 minutes. Erinnert an einen anstehenden
// Bewerbertermin.
//
// ── Zwei Ablaeufe, zwei Staffeln ──
//
// Im bestehenden Bewerbungsmanagement ist der Termin ein Telefonat: 48, 6 und
// 1 Stunde vorher, Vorlage `bewerber-erstgespraech-erinnerung`. Unveraendert.
//
// Im neuen Bewerberprozess ist er ein Kooperationsgespraech als Videocall:
// 24, 6 und 1 Stunde vorher, Vorlage `bewerber-videocall-erinnerung`, und die
// traegt den Link zum Videoraum. Bis zum 06.09.2026 bekamen auch diese
// Bewerber die Mail mit „ich rufe Sie puenktlich an", und einen Link enthielt
// sie nicht. Die mittlere Stufe kam am 07.09.2026 dazu (Punkt P9).
//
// ── Der behobene Fehler ──
//
// Abgelehnte Bewerber bekamen weiterhin Erinnerungen. Der Lauf las Datum und
// Uhrzeit und fragte nie nach dem Status; ein alter Termin blieb im Meta-Feld
// stehen und erinnerte weiter. Entschieden wird das jetzt in
// `_shared/bewerber-termin-erinnerungen.ts`, wo ein Test es lesen kann.
//
// State tracked in bewerbungen.meta.erstgespraechRemindersSent
// (array of "48h"|"24h"|"6h"|"1h"). Eine frueher zusaetzlich verschickte Kopie an eine
// externe Adresse ist entfernt: Name, Termin und Berater eines Bewerbers sind
// personenbezogene Daten und haben ausserhalb der eigenen Domain nichts zu suchen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Links in Bewerbermails zeigen immer auf osimmobilien.netlify.app, nie auf eine
// per Umgebungsvariable eingetragene andere Adresse (seit 26.09.2026).
const APP_BASE_URL = BEWERBER_MAIL_BASIS;

function parseDatum(d: string): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// See bewerber-closing-reminders: Deno runs in UTC, but the stored
// uhrzeit is Europe/Berlin wall-clock time. Without this conversion the
// 48h/6h/1h reminders fire 1–2 h too late.
function berlinWallClockToUtc(datum: string, uhrzeit: string): Date {
  const [y, mo, d] = datum.split("-").map(Number);
  const [h, mi] = uhrzeit.split(":").map(Number);
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
  const offsetMs = asBerlin - naiveUtc;
  return new Date(naiveUtc - offsetMs);
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

/**
 * Der Videoraum und der persoenliche Link eines Bewerbers im neuen Ablauf.
 *
 * Beides ist optional: Solange die Migration `20260906120000` in Supabase
 * nicht gelaufen ist, gibt es die Spalte `buchungen.bewerbung_id` nicht, und
 * dann bleibt der Knopf einfach weg. Eine Erinnerung ohne Link ist besser als
 * keine Erinnerung, und `Handlung` zeichnet ohne Ziel bewusst keinen Knopf.
 *
 * Deshalb faengt diese Funktion jeden Fehler ab und gibt leere Zeichenketten
 * zurueck, statt den ganzen Lauf zu verderben.
 */
async function zugangFuer(db: any, bewerbungId: string): Promise<{ zugangUrl: string; verwaltenUrl: string }> {
  let zugangUrl = "";
  let verwaltenUrl = "";
  try {
    const { data: buchungen } = await db
      .from("buchungen")
      .select("videoraum_id")
      .eq("bewerbung_id", bewerbungId)
      .eq("status", "offen")
      .order("start_at", { ascending: false })
      .limit(1);
    const raumId = (buchungen || [])[0]?.videoraum_id;
    if (raumId) {
      const { data: raum } = await db
        .from("videoraeume").select("token").eq("id", raumId).maybeSingle();
      if (raum?.token) zugangUrl = `${APP_BASE_URL}/raum/${raum.token}`;
    }
  } catch (e) {
    console.error("[erstgespraech-reminders] Videoraum nicht lesbar", bewerbungId, e);
  }

  try {
    const { data: boegen } = await db
      .from("bewerber_formular")
      .select("token")
      .eq("bewerbung_id", bewerbungId)
      .eq("status", "eingereicht")
      .order("created_at", { ascending: false })
      .limit(1);
    const bogenToken = (boegen || [])[0]?.token;
    if (bogenToken) verwaltenUrl = `${APP_BASE_URL}/kennenlernen/${bogenToken}`;
  } catch (e) {
    console.error("[erstgespraech-reminders] Bogen nicht lesbar", bewerbungId, e);
  }

  return { zugangUrl, verwaltenUrl };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-bewerber-erstgespraech-reminders", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // `status` gehoert mit in die Auswahl: Ohne ihn laesst sich nicht
    // erkennen, dass ein Bewerber abgelehnt ist, und genau daran lag der
    // gemeldete Fehler.
    const { data: bewerber, error } = await supabase
      .from("bewerbungen")
      .select("id, vorname, nachname, email, status, meta")
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
      const datumRaw = meta.erstgespraechDatum as string | undefined;
      const uhrzeit = meta.erstgespraechUhrzeit as string | undefined;
      const datum = datumRaw ? parseDatum(datumRaw) : null;
      if (!datum || !uhrzeit) continue;

      const terminDate = berlinWallClockToUtc(datum, uhrzeit);
      if (isNaN(terminDate.getTime())) continue;

      const hoursUntil = (terminDate.getTime() - now.getTime()) / 3600000;
      const alreadySent: string[] = meta.erstgespraechRemindersSent || [];

      /*
       * Erst die Stoppbedingungen, dann die Uhr.
       *
       * Abgelehnte Bewerber bekamen bis zum 06.09.2026 weiter Erinnerungen:
       * Ihr Termin blieb im Meta-Feld stehen, und nach dem Status hat hier
       * niemand gefragt. Der Status kommt jetzt aus derselben Zeile und wird
       * in `_shared/bewerber-termin-erinnerungen.ts` geprueft.
       */
      const stand = {
        bewerberStatus: (b as { status?: string | null }).status ?? null,
        hatTermin: true,
        stundenBis: hoursUntil,
      };
      if (terminStoppGrund(stand)) continue;

      const stufe = faelligeStufe(stand, stufenFuer(meta), alreadySent);
      if (!stufe) continue;

      // `erstgespraechBerater` ist das Feld, unter dem die Oberflaeche den Namen
      // tatsaechlich ablegt (siehe bewerbungStore). Die beiden anderen Schreibweisen
      // bleiben als Rueckfallebene stehen, damit Altbestaende weiter greifen.
      const beraterName = (meta.erstgespraechBerater as string)
        || (meta.erstgespraechBeraterName as string)
        || (meta.closingBeraterName as string) || "";
      const beraterEmail = (meta.erstgespraechBeraterEmail as string)
        || (meta.closingBeraterEmail as string) || "";
      const beraterTelefon = (meta.erstgespraechBeraterTelefon as string)
        || (meta.closingBeraterTelefon as string) || "";
      const displayDate = `${datum.split("-").reverse().join(".")}`;

      const hrKontakt = await holeHrKontakt(supabase);

      /*
       * Im neuen Ablauf kommt der Weg in den Videoraum dazu.
       *
       * Ohne ihn stand in der Erinnerung ein Termin ohne Ort. Der Bewerber
       * musste die alte Bestaetigungsmail wiederfinden, und wenn er die nicht
       * mehr hatte, blieb ihm nur eine Rueckfrage.
       */
      const neu = istNeuerProzess(meta);
      const { zugangUrl, verwaltenUrl } = neu
        ? await zugangFuer(supabase, b.id)
        : { zugangUrl: "", verwaltenUrl: "" };

      const templateData = {
        ...(hrKontakt ? { hrKontakt } : {}),
        bewerberName: `${b.vorname} ${b.nachname}`.trim(),
        beraterName, beraterEmail, beraterTelefon,
        terminDatum: displayDate, terminUhrzeit: uhrzeit,
        vorText: stufe.vorText,
        /*
         * Die Uhrzeit im Fliesstext, aber nur bei der letzten Stufe.
         *
         * Christians Punkt P9: „in einer Stunde" zwingt jeden zum Rechnen, und
         * wer die Mail zwanzig Minuten spaeter oeffnet, rechnet falsch. Welche
         * Stufe die Uhrzeit bekommt, entscheidet die Staffel in
         * `_shared/bewerber-termin-erinnerungen.ts`, damit ein Test es lesen
         * kann.
         */
        ...(stufe.mitUhrzeit ? { uhrzeitImText: uhrzeit } : {}),
        ...(zugangUrl ? { zugangUrl } : {}),
        ...(verwaltenUrl ? { verwaltenUrl } : {}),
      };

      const { error: e1 } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: vorlageFuer(meta),
          recipientEmail: b.email,
          // Datum und Uhrzeit gehoeren in den Schluessel: Ein verschobener Termin
          // ist eine neue Erinnerung und darf nicht als Dublette des alten gelten.
          idempotencyKey: `bewerber-erstgespraech-reminder-${b.id}-${datum}-${uhrzeit}-${stufe.label}`,
          templateData,
        },
      });
      if (e1) { console.error("Reminder send failed", b.id, stufe.label, e1); continue; }

      alreadySent.push(stufe.label);
      sent++;

      await supabase.from("bewerbungen").update({
        meta: { ...meta, erstgespraechRemindersSent: alreadySent },
      }).eq("id", b.id);
      meta.erstgespraechRemindersSent = alreadySent;
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