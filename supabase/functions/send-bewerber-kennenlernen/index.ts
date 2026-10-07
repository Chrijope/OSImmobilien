import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { versendeKennenlernen } from "../_shared/kennenlernen-versand.ts";
import { darfBewerberbereich } from "../_shared/bewerber-rollen.ts";

/**
 * Legt für einen Bewerber ein Token an und verschickt die Einladung zum
 * Kennenlernen.
 *
 * Das Gegenstück zu `send-bewerber-formular`, für den neuen Bewerberprozess.
 * Bewusst eine eigene Function und kein Schalter an der alten: Die alte wird
 * aus `submit-bewerbung` und aus dem Zapier-Webhook aufgerufen, also nach jeder
 * eingehenden Bewerbung. Ein Schalter dort würde den laufenden Betrieb
 * anfassen; diese Function wird ausschließlich von Hand aus dem neuen Bereich
 * aufgerufen.
 *
 * Beide schreiben in dieselbe Tabelle `bewerber_formular`. Welchen Bogen der
 * Bewerber sieht, entscheidet allein der Link in der Mail. Deshalb braucht es
 * keine zweite Tabelle und keine Migration.
 *
 * Ein erneuter Versand erzeugt ein neues Token und setzt das alte auf
 * "ersetzt". So ist immer nur ein Link gültig.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/**
 * Wer darf das Kennenlernen verschicken? Seit dem 27.09.2026 hr, admin,
 * inhaber und backoffice, dieselben Rollen wie `kannBewerberVerwalten` in
 * `src/lib/bewerberRechte.ts`. Die Liste steht in `_shared/bewerber-rollen.ts`.
 */

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    /*
     * Die Rechtepruefung, seit dem 08.09.2026.
     *
     * `verify_jwt = true` sichert bisher nur, dass ueberhaupt jemand
     * angemeldet ist. Verschickt wird aber eine echte Mail an einen Bewerber,
     * und das duerfen nur HR, Admin, Inhaber und Backoffice. Ein ausgeblendeter
     * Knopf im CRM ist keine Zugriffskontrolle; dasselbe Muster steht in
     * `send-bewerber-zugangsdaten`.
     */
    /*
     * Zwei Wege fuehren hierher, und sie brauchen verschiedene Nachweise.
     *
     * Der eine ist der Klick im Bewerberprofil. Dahinter steht ein Mensch mit
     * einem Konto, und der muss HR, Admin, Inhaber oder Backoffice sein.
     *
     * Der andere ist der automatische Eingang: Eine Bewerbung kommt ueber die
     * Website, ueber Zapier oder ueber die Erfassung herein, und die
     * Eingangsmail soll sofort hinaus. Dabei ist niemand angemeldet, und das
     * ist auch richtig so. Der Bewerberprozess gehoert zu HR, aber er darf
     * nicht davon abhaengen, dass gerade jemand aus HR im CRM sitzt.
     *
     * Bis zum 10.09.2026 passte das nicht zusammen: Die Rollenpruefung kam am
     * 08.09., der automatische Aufruf am 10.09., und seitdem antwortete diese
     * Funktion dem Webhook mit 401. Der Webhook wertete die Antwort nicht aus
     * und meldete Zapier trotzdem Erfolg. Ergebnis: Der Bewerber bekam nichts,
     * und niemand sah es.
     *
     * Der interne Weg weist sich mit demselben gemeinsamen Geheimnis aus, das
     * im Projekt schon an mehreren Stellen dafuer benutzt wird, etwa in
     * `finalize-selbstauskunft` und `dsgvo-purge-expired`. Fehlt das Geheimnis
     * in der Umgebung, gilt der Aufruf nicht als intern, und es bleibt bei der
     * Rollenpruefung. Ein leerer Header oeffnet also nichts.
     */
    /*
     * Beide Seiten getrimmt: Ein Kopfwert kommt ohne Leerzeichen an den
     * Enden an, das schreibt der HTTP-Standard vor. Der Wert aus der
     * Umgebung nicht. Ein einziges Leerzeichen beim Einfuegen des
     * Geheimnisses haette den internen Weg sonst lautlos geschlossen.
     */
    const internesGeheimnis = (Deno.env.get("INGEST_SHARED_SECRET") || "").trim();
    const mitgeschickt = (req.headers.get("x-internal-secret") || "").trim();
    const internerAufruf = !!internesGeheimnis && mitgeschickt === internesGeheimnis;

    /*
     * Wer den Versand von Hand ausloest. Nur beim Klick im CRM gesetzt; der
     * automatische Eingang hat keinen Menschen dahinter.
     */
    let ausgeloestVon: { id: string; name: string } | undefined;

    if (!internerAufruf) {
      // Der Grund gehoert ins Log und in die Antwort. „Nicht autorisiert"
      // allein sagt nicht, ob ein Ausweis mitkam und nur nicht passte.
      if (mitgeschickt) {
        console.warn("[send-bewerber-kennenlernen] Interner Ausweis passt nicht, Laenge", mitgeschickt.length, "erwartet", internesGeheimnis.length);
      }
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return antwort({ error: mitgeschickt ? "Interner Ausweis passt nicht" : "Nicht autorisiert" }, 401);
      }
      const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user: caller } } = await callerClient.auth.getUser();
      if (!caller) {
        console.warn("[send-bewerber-kennenlernen] Kein angemeldeter Nutzer, Ausweis mitgeschickt:", !!mitgeschickt);
        return antwort({ error: mitgeschickt ? "Interner Ausweis passt nicht" : "Nicht angemeldet" }, 401);
      }

      const darf = await darfBewerberbereich(admin, caller.id);
      if (!darf) {
        console.warn("[send-bewerber-kennenlernen] Versand ohne Berechtigung abgewiesen", caller.id);
        return antwort({ error: "Keine Berechtigung" }, 403);
      }

      const { data: profil } = await admin
        .from("profiles")
        .select("name")
        .eq("id", caller.id)
        .maybeSingle();
      ausgeloestVon = { id: caller.id, name: String(profil?.name || "").trim() || "HR" };
    }


    const body = await req.json().catch(() => ({}));
    const bewerbungId = String(body.bewerbungId || "").trim();
    if (!bewerbungId) return antwort({ error: "bewerbungId fehlt" }, 400);

    /*
     * Der eigentliche Versand liegt seit dem 15.09.2026 in
     * `_shared/kennenlernen-versand.ts`. Der automatische Eingang ruft
     * dasselbe Modul direkt auf, ohne Netzaufruf; hier davor steht nur noch
     * die Rechtepruefung.
     */
    const ergebnis = await versendeKennenlernen(admin, {
      bewerbungId,
      // Ausdrueckliche Wiederholung aus dem CRM, trotz vorliegendem Bogen.
      erneutSenden: body.erneutSenden === true,
      // Nur den Link liefern, ohne Mail: gebraucht von „Link kopieren" und
      // „So sieht es aus" in der Akte.
      nurLink: body?.nurLink === true,
      // Der Link entsteht fuer die Akte, nicht fuer eine Mail. Die neue Zeile
      // wird entsprechend gekennzeichnet.
      ohneMail: body?.ohneMail === true,
      ausgeloestVon,
    });
    return antwort(ergebnis.koerper, ergebnis.status);
  } catch (e) {
    console.error("[send-bewerber-kennenlernen] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler" }, 500);
  }
});
