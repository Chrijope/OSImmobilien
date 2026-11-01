/**
 * Mails abholen (01.11.2026).
 *
 *  - Angemeldet ({} oder {kontoId}): die eigenen Konten, für den Knopf
 *    „Jetzt abholen“.
 *  - Zeitplan ({aktion: "alle"}, alle 5 Minuten, Geheimwort im Kopf): alle
 *    aktiven Konten. Die Antwort enthält nur Zähler, keine Inhalte.
 *
 * Die eigentliche Arbeit steht in `_shared/mailkonto.ts`.
 */
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { antwort, corsHeaders, dienst, nutzerAus } from "../_shared/mail-anfrage.ts";
import { fehlerText, KONTO_SPALTEN, kontoAbholen, type MailKonto } from "../_shared/mailkonto.ts";

/** Function-Laufzeit ist begrenzt; danach keine neuen Konten mehr anfangen. */
const ZEITBUDGET_MS = 100_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const admin = dienst();

  let abfrage = admin.from("email_konten").select(KONTO_SPALTEN).eq("aktiv", true);
  if (body?.aktion === "alle") {
    // Streng: Ohne Geheimwort könnte jeder alle Postfächer abholen lassen.
    const abgewiesen = automatikSchutz(req, "sync-emails", corsHeaders, { streng: true });
    if (abgewiesen) return abgewiesen;
  } else {
    const nutzer = await nutzerAus(req);
    if (!nutzer) return antwort({ error: "Nicht angemeldet" }, 401);
    abfrage = abfrage.eq("benutzer_id", nutzer.id);
    if (typeof body?.kontoId === "string") abfrage = abfrage.eq("id", body.kontoId);
  }

  // Am längsten nicht abgeholte zuerst: Reicht die Zeit nicht für alle,
  // kommen beim nächsten Lauf die übrigen dran.
  const { data: konten, error } = await abfrage.order("zuletzt_abgeholt", { ascending: true, nullsFirst: true });
  if (error) return antwort({ error: error.message }, 500);

  let synced = 0;
  const fehler: { adresse: string; fehler: string }[] = [];
  const ende = Date.now() + ZEITBUDGET_MS;
  let bearbeitet = 0;
  for (const konto of (konten ?? []) as MailKonto[]) {
    if (Date.now() > ende) break;
    bearbeitet++;
    try {
      synced += (await kontoAbholen(admin, konto)).neu;
    } catch (e) {
      fehler.push({ adresse: konto.adresse, fehler: fehlerText(e) });
    }
  }
  // Beim Zeitplan keine Adressen zurückgeben.
  return antwort(body?.aktion === "alle" ? { synced, konten: bearbeitet, offen: (konten?.length ?? 0) - bearbeitet, fehler: fehler.length } : { synced, fehler });
});
