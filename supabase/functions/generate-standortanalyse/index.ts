/**
 * Die Standortanalyse eines Objekts, gemessen statt erfunden.
 *
 * Bis zum 23.09.2026 hat hier ein Sprachmodell Kindergärten, Schulen,
 * Haltestellen, Entfernungen, Koordinaten, Arbeitgeber und Einwohnerzahlen aus
 * dem Gedächtnis aufgeschrieben, und das stand anschließend im Exposé. Jetzt
 * wird gemessen, in `_shared/standort-messung.ts`: Lage finden (oder die
 * Koordinate aus Investagon nehmen), Umgebung über Overpass abfragen,
 * Luftlinie rechnen. Was OpenStreetMap nicht kennt, fehlt.
 *
 * WER DARF (seit dem 23.09.2026 abends, Regeln in `regeln.ts`)
 *
 * Vorher konnte jeder mit dem öffentlichen Schlüssel für jede Objekt-ID eine
 * Messung auslösen. Jetzt nur angemeldete Admin und Inhaber, mit einer
 * Mengenbremse. Andere interne Nutzer bekommen die gespeicherte Analyse,
 * Kunden und Unangemeldete nichts. Öffentliche Seiten rufen die Function nie
 * auf; sie lesen die gespeicherte Analyse aus `get-expose` bzw.
 * `get-kundenansicht`.
 *
 * FEST STATT 30 TAGE
 *
 * Eine gemessene Analyse gilt dauerhaft. Gemessen wird beim
 * Investagon-Import einmal (`investagon-import/standort.ts`), danach nur,
 * wenn sich die Adresse geändert hat (`standortAdresseGeaendert`) oder Admin
 * oder Inhaber es ausdrücklich verlangen (`neuMessen: true`).
 *
 * Die Antwort hat dieselbe Form wie vorher, `{ data, cached }`.
 *
 * ACHTUNG: Gepushter Function-Code läuft erst nach dem Ausrollen in Lovable.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  istGemessen,
  koordinatenAusInvestagon,
  koordinatenInMeta,
  messeStandort,
  standortAdresseGeaendert,
  standortInMeta,
} from "../_shared/standort-messung.ts";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";
import { entscheideZugang } from "./regeln.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const antwort = (nutzlast: unknown, status = 200) =>
  new Response(JSON.stringify(nutzlast), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const DIENST = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Anmeldung, bevor irgendetwas gelesen wird ──
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    let nutzerId = "";
    if (jwt && jwt !== ANON) {
      const nutzerClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false },
      });
      const { data } = await nutzerClient.auth.getUser();
      nutzerId = data?.user?.id ?? "";
    }
    if (!nutzerId) return antwort({ error: "Bitte neu anmelden." }, 401);

    const rumpf = await req.json().catch(() => ({}));
    const objektId = typeof rumpf?.objektId === "string" ? rumpf.objektId : "";
    if (!objektId) return antwort({ error: "Missing objektId" }, 400);
    const neuMessen = rumpf?.neuMessen === true;

    const dienst = createClient(SUPABASE_URL, DIENST, { auth: { persistSession: false } });

    // Die Rollen aus `user_roles`, nie aus dem Rumpf der Anfrage.
    const { data: rollenZeilen, error: rollenFehler } = await dienst
      .from("user_roles").select("role").eq("user_id", nutzerId);
    if (rollenFehler) {
      console.error("generate-standortanalyse: Rollen nicht lesbar", rollenFehler.message);
      return antwort({ error: "Die Berechtigung ließ sich nicht prüfen." }, 500);
    }
    const rollen = ((rollenZeilen || []) as Array<{ role?: unknown }>).map((z) => z.role);

    const { data: objekt, error: oErr } = await dienst
      .from("objekte").select("id, titel, adresse, plz, ort, sichtbar, meta").eq("id", objektId).maybeSingle();
    if (oErr) return antwort({ error: "Objekt nicht lesbar" }, 500);

    const zeile = (objekt || {}) as { titel?: unknown; adresse?: unknown; plz?: unknown; ort?: unknown; sichtbar?: unknown; meta?: Record<string, unknown> | null };
    const meta = (zeile.meta || {}) as Record<string, unknown>;
    const vorhanden = istGemessen(meta.standortanalyse) ? meta.standortanalyse : undefined;
    const zugang = entscheideZugang({
      angemeldet: true,
      rollen,
      // Ein fehlendes Objekt behandeln wie ein ausgeblendetes: niemand erfährt, ob es die ID gibt.
      sichtbar: !!objekt && zeile.sichtbar !== false,
      gemessen: !!vorhanden,
      adresseGeaendert: standortAdresseGeaendert(meta.standortanalyse, zeile),
      neuMessen,
    });
    if (zugang.art === "abgelehnt") return antwort({ error: zugang.grund }, zugang.status);
    if (!objekt) return antwort({ error: "Objekt nicht gefunden" }, 404);
    if (zugang.art === "gespeichert") return antwort({ data: vorhanden ?? null, cached: true });

    // ── Messen, nur Admin und Inhaber ──
    const bremse = await checkEdgeRateLimit({ scope: "standortanalyse-messung", key: nutzerId, perHour: 30, perDay: 150 });
    if (!bremse.ok) {
      return antwort({ error: "Zu viele Messungen in kurzer Zeit. Bitte später erneut versuchen.", data: vorhanden ?? null }, 429);
    }

    const messung = await messeStandort(
      { adresse: zeile.adresse, plz: zeile.plz, ort: zeile.ort, titel: zeile.titel },
      // Eine Koordinate aus Investagon hat Vorrang vor jeder Adresssuche.
      { koordinate: koordinatenAusInvestagon(meta) ?? null },
    );

    // Das `meta` unmittelbar vor dem Schreiben frisch lesen und nur die
    // eigenen Schlüssel setzen. In Lovable wird parallel gearbeitet.
    const { data: frisch } = await dienst.from("objekte").select("meta").eq("id", objektId).maybeSingle();
    const metaVorher = ((frisch as { meta?: Record<string, unknown> | null } | null)?.meta || meta) as Record<string, unknown>;
    let metaNeu = messung.ok ? standortInMeta(metaVorher, messung.analyse) : metaVorher;
    if (messung.lage) metaNeu = koordinatenInMeta(metaNeu, messung.lage);
    if (metaNeu !== metaVorher) {
      const { error: schreibFehler } = await dienst.from("objekte").update({ meta: metaNeu } as never).eq("id", objektId);
      if (schreibFehler) console.error("generate-standortanalyse: Speichern fehlgeschlagen", schreibFehler.message);
    }

    if (!messung.ok) {
      const fehlschlag = messung as { art: "adresse" | "dienst"; grund: string };
      console.warn(`generate-standortanalyse: ${objektId} nicht gemessen (${fehlschlag.art}): ${fehlschlag.grund}`);
      // Eine ältere, aber gemessene Analyse ist besser als gar keine.
      if (vorhanden) return antwort({ data: vorhanden, cached: true });
      return antwort({ error: fehlschlag.grund }, fehlschlag.art === "dienst" ? 502 : 422);
    }
    return antwort({ data: messung.analyse, cached: false });
  } catch (e) {
    console.error("generate-standortanalyse:", e);
    return antwort({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }, 500);
  }
});
