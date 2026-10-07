/**
 * Die Umgebung aller Objekte automatisch messen, gedrosselt (24.09.2026).
 *
 * pg_cron ruft diese Function alle zehn Minuten auf
 * (`20260924190000_standort_nachholen_zeitplan.sql`). Sie liest von jedem
 * Objekt nur Adresse, Schema, Messfassung, gemessene Adresse und den
 * Fehlervermerk, wählt nach `nachholAuswahl` höchstens `NACHHOLEN_JE_LAUF`
 * Objekte und misst sie über denselben Ablauf wie der Investagon-Import
 * (`_shared/standort-lauf.ts`): nacheinander, mit Pause, Nominatim höchstens
 * einmal je Sekunde, jede Anfrage mit der Kennung `KENNUNG`.
 *
 * Öffentlich erreichbar (verify_jwt = false), weil pg_cron ohne Anmeldetoken
 * ruft, so wie beim Nachtwächter. Das ist vertretbar: Die Function misst nur,
 * was ohnehin gemessen werden soll, und gibt nichts zurück außer Zahlen.
 * Gegen fremde Dauerschleifen steht eine Mengenbremse für alle Aufrufe
 * zusammen davor.
 *
 * ACHTUNG: Gepushter Function-Code läuft erst nach dem Ausrollen in Lovable.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";
import { FEHLER_META_SCHLUESSEL, standorteMessen, type StandortDb } from "../_shared/standort-lauf.ts";
import {
  alsNachholZeile,
  messGrund,
  nachholAuswahl,
  NACHHOLEN_AUFRUFE_JE_STUNDE,
  NACHHOLEN_AUFRUFE_JE_TAG,
  NACHHOLEN_PAUSE_MS,
  NACHHOLEN_SPALTEN,
  type NachholZeile,
} from "../_shared/standort-nachholen.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const antwort = (nutzlast: unknown, status = 200) =>
  new Response(JSON.stringify(nutzlast), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const laufBeginn = Date.now();
  try {
    const bremse = await checkEdgeRateLimit({
      scope: "standort-nachholen",
      key: "alle",
      perHour: NACHHOLEN_AUFRUFE_JE_STUNDE,
      perDay: NACHHOLEN_AUFRUFE_JE_TAG,
    });
    if (!bremse.ok) return antwort({ error: "Zu viele Läufe in kurzer Zeit." }, 429);

    const dienst = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Seitenweise, damit auch mehr als 1.000 Objekte vollständig gelesen werden.
    const zeilen: NachholZeile[] = [];
    for (let von = 0; von < 20_000; von += 1_000) {
      const { data, error } = await dienst.from("objekte").select(NACHHOLEN_SPALTEN)
        .order("erstellt_am", { ascending: true }).range(von, von + 999);
      if (error) {
        console.error("standort-nachholen: Objekte nicht lesbar", error.message);
        return antwort({ error: "Objekte nicht lesbar." }, 500);
      }
      // supabase-js kennt die Auszüge mit `->` nicht als Spalten und tippt sie als Fehlertext.
      const seite = (data || []) as unknown as Array<Record<string, unknown>>;
      zeilen.push(...seite.map(alsNachholZeile));
      if (seite.length < 1_000) break;
    }

    const { ids, stand } = nachholAuswahl(zeilen, Date.now());
    const bericht = ids.length
      ? await standorteMessen(dienst as unknown as StandortDb, ids, {
        laufBeginn,
        obergrenze: ids.length,
        pauseMs: NACHHOLEN_PAUSE_MS,
        // Mit der frischen Zeile noch einmal prüfen: Vielleicht hat der Import das Objekt eben gemessen.
        brauchtMessung: (zeile) => {
          const meta = (zeile.meta || {}) as Record<string, unknown>;
          return messGrund({
            id: zeile.id, adresse: zeile.adresse, plz: zeile.plz, ort: zeile.ort,
            analyse: meta.standortanalyse, fehler: meta[FEHLER_META_SCHLUESSEL],
          }, Date.now()) !== null;
        },
      })
      : null;

    console.log("standort-nachholen:", JSON.stringify({ stand, bericht }));
    return antwort({ stand, bericht });
  } catch (e) {
    console.error("standort-nachholen:", e);
    return antwort({ error: "Lauf fehlgeschlagen." }, 500);
  }
});
