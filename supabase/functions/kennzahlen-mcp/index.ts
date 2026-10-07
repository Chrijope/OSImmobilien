// ---------------------------------------------------------------------------
// kennzahlen-mcp: Ein MCP-Server ueber HTTP, nur lesend. Die Kennzahlen und
// seit dem 24.09.2026 die Objektdaten (siehe unten).
//
// WARUM DER ZUGRIFF BEWUSST NUR DIESE EINE FUNKTION ANBIETET
//
// In der Tabelle kennzahlen_tagesstand stehen ausschliesslich Zahlen und keine
// personenbezogenen Daten. Freies SQL wuerde hingegen Kundennamen und
// Bewerberdaten nach aussen tragen, und das ist genau der Grund fuer diesen
// engen Zuschnitt: Diese Function ruft einzig die vorhandene Datenbankfunktion
// public.kennzahlen_verlauf(p_bereich) auf und gibt deren Zeilen als JSON
// zurueck. Keine anderen Tabellen, kein freies SQL, keine Schreibvorgaenge.
//
// SICHERHEIT
//   Der Zugang laeuft ueber ein Geheimnis im Header, gelesen aus der
//   Umgebungsvariable KENNZAHLEN_MCP_SECRET. Fehlt der Header oder stimmt er
//   nicht, kommt 401 zurueck und sonst nichts. Ist das Geheimnis in der
//   Umgebung gar nicht gesetzt, antwortet die Function ueberhaupt nicht,
//   statt offen zu stehen.
//
//   Die Absicherung uebernimmt das Geheimnis, deshalb ist verify_jwt = false
//   in supabase/config.toml gesetzt. Der Datenbankzugriff laeuft ueber den
//   Service-Role-Key aus der Umgebung, so wie es die vorhandenen Functions im
//   Projekt schon machen.
//
// SEIT DEM 24.09.2026: DREI LESEWERKZEUGE FUER DIE OBJEKTDATEN
//
//   Dazu kommen `objekte_liste`, `objekt_details` und `objekt_dokumente` fuer
//   die digitalen Personas. Sie stehen samt Positivlisten in `_shared/objektdaten.ts`
//   und bekommen nur ein Lesegeruest (`nurLesen`), keinen vollen Client:
//   feste Tabellen, feste Spalten, kein Schreiben, kein RPC, keine Personen.
//   Das Geheimnis und der Connector bleiben dieselben.
// ---------------------------------------------------------------------------

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DatenFehler,
  EingabeFehler,
  istObjektWerkzeug,
  nurLesen,
  OBJEKT_WERKZEUGE,
  objektWerkzeugAufrufen,
  type RohClient,
} from "../_shared/objektdaten.ts";

// CORS erlauben, damit ein Browser die Function erreichen kann.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kennzahlen-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Das eine Werkzeug, das dieser MCP-Server anbietet.
const TOOL = {
  name: "kennzahlen",
  description:
    "Die Kennzahlen des Hauses je Abteilung: Stand heute, Stand vor sieben Tagen und die Veraenderung.",
  inputSchema: {
    type: "object",
    properties: {
      bereich: {
        type: "string",
        description:
          "Optional eine einzelne Abteilung. Bleibt leer, werden alle Bereiche geliefert.",
      },
    },
  },
};

/*
 * Vergleich in gleichbleibender Zeit, damit sich das Geheimnis nicht Zeichen
 * fuer Zeichen erraten laesst.
 *
 * Die Laengenpruefung vorweg verraet allerdings die Laenge des Geheimnisses.
 * Das ist bewusst hingenommen und harmlos, solange das Geheimnis zufaellig und
 * lang genug ist. Nur soll der Kommentar nicht mehr versprechen, als der Code
 * haelt.
 */
function geheimeStringsGleich(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

// Liest das Geheimnis aus dem Header. Akzeptiert sowohl den Bearer-Header als
// auch den expliziten x-kennzahlen-secret-Header.
function geheimnisAusHeader(req: Request): string | null {
  const bearer = req.headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  const direkt = req.headers.get("x-kennzahlen-secret");
  if (direkt) return direkt.trim();
  return null;
}

// JSON-RPC-2.0-Antwort zusammenbauen.
function rpcAntwort(id: unknown, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
}

function rpcFehler(
  id: unknown,
  code: number,
  message: string,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" }, status },
  );
}

// Ein einzelner JSON-RPC-Aufruf. Gibt eine fertige Response zurueck.
async function bearbeiteAufruf(
  req: Request,
  body: Record<string, unknown>,
  supabaseUrl: string,
  serviceRole: string,
): Promise<Response> {
  const { id, method } = body;
  const params = (body.params ?? {}) as Record<string, unknown>;

  /*
   * Eine Benachrichtigung traegt keine Kennung und erwartet keine Antwort.
   * Genau eine schickt jeder Client gleich nach dem Verbinden:
   * `notifications/initialized`. Vorher lief sie bis ans Ende durch und bekam
   * "Methode nicht gefunden" zurueck. Manche Clients werten das als
   * gescheiterten Handshake und trennen wieder, und dann sieht es aus, als
   * stimme etwas mit dem Zugang nicht.
   *
   * Die Spezifikation verlangt hier 202 und einen leeren Koerper.
   */
  const istBenachrichtigung =
    (typeof method === "string" && method.startsWith("notifications/")) ||
    id === undefined || id === null;
  if (istBenachrichtigung) {
    return new Response(null, { headers: corsHeaders, status: 202 });
  }

  if (method === "initialize") {
    return rpcAntwort(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "kennzahlen-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    return rpcAntwort(id, { tools: [TOOL, ...OBJEKT_WERKZEUGE] });
  }

  if (method === "tools/call") {
    const name = params.name;
    if (istObjektWerkzeug(name)) {
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const admin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false },
      });
      try {
        // Nur das Lesegeruest geht an die Werkzeuge, nie der Client selbst.
        const daten = await objektWerkzeugAufrufen(
          name,
          args,
          nurLesen(admin as unknown as RohClient),
        );
        return rpcAntwort(id, {
          content: [{ type: "text", text: JSON.stringify(daten) }],
        });
      } catch (fehler) {
        if (fehler instanceof EingabeFehler) {
          return rpcFehler(id, -32602, fehler.message);
        }
        // Rohe Datenbankmeldungen nur ins Protokoll, nach aussen ein allgemeiner Satz.
        console.error(
          "[kennzahlen-mcp]",
          name,
          fehler instanceof DatenFehler || fehler instanceof Error ? fehler.message : fehler,
        );
        return rpcFehler(id, -32603, "Objektdaten konnten nicht geladen werden.");
      }
    }
    if (name !== "kennzahlen") {
      return rpcFehler(id, -32601, `Methode oder Werkzeug nicht gefunden: ${name}`);
    }
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    // bereich darf leer bleiben; dann werden alle Bereiche geliefert.
    const bereich =
      typeof args.bereich === "string" && args.bereich.trim() !== ""
        ? args.bereich.trim()
        : null;

    const admin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin.rpc("kennzahlen_verlauf", {
      p_bereich: bereich,
    });

    if (error) {
      // Rohe Datenbankmeldungen gehen nicht nach aussen, nur ein allgemeiner Satz.
      return rpcFehler(id, -32603, "Kennzahlen konnten nicht geladen werden.");
    }

    return rpcAntwort(id, {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
    });
  }

  return rpcFehler(id, -32601, `Methode nicht gefunden: ${method}`);
}

Deno.serve(async (req: Request) => {
  // OPTIONS fuer CORS vorbelegen.
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Ohne gesetztes Geheimnis antwortet die Function gar nicht, statt offen
  // zu stehen. Ein unbedingter 503 macht klar: hier ist nichts konfiguriert.
  const geheimnis = Deno.env.get("KENNZAHLEN_MCP_SECRET");
  if (!geheimnis) {
    return new Response("Service nicht konfiguriert", {
      headers: corsHeaders,
      status: 503,
    });
  }

  // Absicherung ueber das Geheimnis im Header.
  const uebergeben = geheimnisAusHeader(req);
  if (!uebergeben || !geheimeStringsGleich(uebergeben, geheimnis)) {
    return new Response("Nicht autorisiert", {
      headers: corsHeaders,
      status: 401,
    });
  }

  if (req.method !== "POST") {
    return new Response("Nur POST erlaubt", { headers: corsHeaders, status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Ein einzelner JSON-RPC-Aufruf je Anfrage. Batch-Aufrufe (Array) werden
  // ebenfalls unterstuetzt, indem jeder Eintrag einzeln beantwortet wird.
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return rpcFehler(null, -32700, "Ungueltiger JSON-RPC-Aufruf");
  }

  if (Array.isArray(payload)) {
    const antworten = await Promise.all(
      payload.map((eintrag) =>
        bearbeiteAufruf(req, eintrag as Record<string, unknown>, supabaseUrl, serviceRole).then(
          (r) => r.text(),
        ),
      ),
    );
    /*
     * Benachrichtigungen im Stapel liefern einen leeren Koerper. Der fiel
     * vorher in JSON.parse und riss den ganzen Stapel mit, obwohl die uebrigen
     * Aufrufe in Ordnung waren. Sie werden deshalb uebersprungen.
     */
    const geparst = antworten
      .filter((t) => t.trim() !== "")
      .map((t) => JSON.parse(t));
    // Bestehen alle Eintraege aus Benachrichtigungen, bleibt nichts zu
    // antworten. Auch dann gilt 202 mit leerem Koerper.
    if (geparst.length === 0) {
      return new Response(null, { headers: corsHeaders, status: 202 });
    }
    return new Response(JSON.stringify(geparst), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }

  return bearbeiteAufruf(
    req,
    payload as Record<string, unknown>,
    supabaseUrl,
    serviceRole,
  );
});
