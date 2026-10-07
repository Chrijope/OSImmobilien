// Nach dem Zusammenführen zweier Kontakte: Dateien des aufgelösten Kontakts
// in die Ordner des behaltenen verschieben und alle Verweise umschreiben.
//
// Body: { behaltenId: uuid, aufgeloestId: uuid }
// Auth: angemeldeter Nutzer. Die Rechte prüft die Datenbankfunktion
// kontakt_dateipfade_umschreiben (Migration 20260927000000), bevor hier eine
// Datei angefasst wird. Ablauf und Sicherheitsnetz: _shared/kontaktDateienVerschieben.ts.
// Wiederholbar: Ein zweiter Aufruf erkennt schon kopierte Dateien wieder.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import {
  kontaktKennung,
  verschiebeKontaktDateien,
  type Eintrag,
  type Speicher,
} from "../_shared/kontaktDateienVerschieben.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "unterlagen";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function fehlendeFunktion(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || error.code === "42883"
    || /could not find the function|does not exist/i.test(error.message || "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader.slice(7));
    const aufrufer = userData?.user?.id;
    if (userErr || !aufrufer) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const behaltenId = String(body?.behaltenId || "");
    const aufgeloestId = String(body?.aufgeloestId || "");
    if (!UUID.test(behaltenId) || !UUID.test(aufgeloestId) || behaltenId === aufgeloestId) {
      return json({ error: "behaltenId und aufgeloestId (uuid) erforderlich" }, 400);
    }

    const umschreiben = async (abbildung: Record<string, string>) => {
      const { data, error } = await admin.rpc("kontakt_dateipfade_umschreiben", {
        _aufrufer: aufrufer,
        _behalten: behaltenId,
        _aufgeloest: aufgeloestId,
        _abbildung: abbildung,
      });
      if (error) throw Object.assign(new Error(error.message), { code: error.code });
      return data;
    };

    // Rechte und Zustand prüfen, bevor eine Datei angefasst wird.
    try {
      await umschreiben({});
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (fehlendeFunktion(err)) return json({ ok: false, migrationFehlt: true });
      if (err.code === "42501") return json({ error: err.message }, 403);
      return json({ error: err.message }, 400);
    }

    const { data: aufgeloest } = await admin.from("kontakte").select("meta").eq("id", aufgeloestId).maybeSingle();
    const kennung = kontaktKennung(aufgeloestId, aufgeloest?.meta);

    const eimer = admin.storage.from(BUCKET);
    const speicher: Speicher = {
      async liste(ordner) {
        const alle: Eintrag[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await eimer.list(ordner, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
          if (error) throw new Error(error.message);
          for (const e of data || []) {
            const meta = (e.metadata || {}) as Record<string, unknown>;
            alle.push({
              name: e.name,
              // Ordner haben in der Liste weder id noch metadata.
              istOrdner: !e.id && !e.metadata,
              size: typeof meta.size === "number" ? meta.size : null,
              etag: typeof meta.eTag === "string" ? meta.eTag : null,
            });
          }
          if (!data || data.length < 1000) return alle;
        }
      },
      async kopiere(von, nach) {
        const { error } = await eimer.copy(von, nach);
        if (error) throw new Error(error.message);
      },
      async loesche(pfade) {
        const { error } = await eimer.remove(pfade);
        return error ? pfade : [];
      },
    };

    const ergebnis = await verschiebeKontaktDateien({
      speicher,
      umschreiben: async (abbildung) => { await umschreiben(abbildung); },
      vonId: aufgeloestId,
      nachId: behaltenId,
      kennung,
    });

    if (ergebnis.verschoben > 0 || ergebnis.nichtVerschoben.length > 0) {
      const { error: logErr } = await admin.from("audit_log").insert({
        action: "kontakt_dateien_verschoben",
        entity: "kontakt",
        entity_id: behaltenId,
        actor: aufrufer,
        meta: { aufgeloest: aufgeloestId, ...ergebnis },
      });
      if (logErr) console.warn("[kontakte-zusammenfuehren-dateien] Protokoll nicht geschrieben:", logErr.message);
    }

    return json({ ok: ergebnis.nichtVerschoben.length === 0, ...ergebnis });
  } catch (e) {
    console.error("[kontakte-zusammenfuehren-dateien]", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
