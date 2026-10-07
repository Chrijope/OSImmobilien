import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { bewerberPfad, ladeHrEmpfaenger, schreibeGlocke } from "../_shared/hr-benachrichtigung.ts";
import {
  ABMELDUNG_AUTOR,
  SELBST_ABGEMELDET_ABSAGEGRUND,
  zielStatusNachAbmeldung,
} from "../_shared/bewerber-nachfass.ts";
import { antwortFrist, pruefeAnfrage, type SeitenAktion } from "../_shared/bewerber-seite.ts";

/**
 * Was der Bewerber von seiner persönlichen Seite aus auslöst.
 *
 * Öffentlich (verify_jwt = false), nur POST. Der Browser des Bewerbers hat
 * keinerlei Tabellenzugriff, geschrieben wird ausschließlich hier über die
 * Service-Rolle. Geprüft werden Tokenform, Honigtopf, Rate-Limit je Absender
 * und der Zustand des Bewerbers.
 *
 * ── Warum es diese Function überhaupt gibt ──
 *
 * Pause und Ausstieg setzten bisher nur einen Bildschirmzustand. Der Server
 * erfuhr davon nichts. Folge: Wer im Kennenlernen auf „Passt nicht für mich"
 * geklickt hat, bekam trotzdem die Erinnerungen an Tag 3 und Tag 8 und löste
 * an Tag 11 den Anruf aus, obwohl auf dem Pausenbildschirm wörtlich stand
 * „Eine Pause ist keine Absage, und ein Anruf kommt deswegen nicht". Genau
 * dieser Satz stimmt erst, seit diese Function die Pause vermerkt und
 * `_shared/kennenlernen-erinnerungen.ts` sie als Stoppbedingung liest.
 *
 * ── Die fünf Aktionen ──
 *
 *   pause       meta.kennenlernen.pause = { gesetztAm, erinnerungAm }
 *               Kein Status, keine Absage. Hält die Kette an und schaltet
 *               Tag 11 dauerhaft ab.
 *   weiter      hebt die Pause wieder auf.
 *   frage       meta.kennenlernen.frage = { gestelltAm, text, bisAm }
 *               Damit ist MOREImmo am Zug, obwohl der Bewerber formal in der
 *               Stufe Eingang steht. Glocke an HR.
 *   kein_anruf  meta.kennenlernen.anrufWidersprochen = true
 *               Der sechste Stopp. Er wurde in der Erinnerungskette gelesen
 *               und nirgends geschrieben; „interessiert, aber bitte nicht
 *               anrufen" war damit nicht erreichbar. Jetzt ist er es.
 *   ausstieg    Status KeinInteresse, mit Vermerk und Glocke, nach demselben
 *               Muster wie `bewerber-kein-interesse`.
 *
 * Diese Function verschickt keine Mail. Sie taugt nicht als Versandwerkzeug.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function antwort(koerper: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Fehlt die Tabelle noch? Postgres meldet 42P01, PostgREST zusätzlich einen Text. */
function tabelleFehlt(fehler: { code?: string; message?: string } | null): boolean {
  if (!fehler) return false;
  if (fehler.code === "42P01" || fehler.code === "PGRST205") return true;
  return /does not exist|could not find the table|schema cache/i.test(fehler.message || "");
}

/**
 * Von welchem Bewerber dieses Token stammt.
 *
 * Zwei gültige Wege, beide 32 Byte Zufall: die persönliche Seite und der Bogen
 * des Kennenlernens. Der zweite ist der Grund, warum das Kennenlernen selbst
 * pausieren und aussteigen kann, ohne ein zweites Token zu kennen.
 */
async function bewerberZuToken(admin: any, token: string): Promise<string> {
  const { data: seite, error: seiteFehler } = await admin
    .from("bewerber_seite")
    .select("bewerbung_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (seiteFehler && !tabelleFehlt(seiteFehler)) {
    console.error("[bewerber-seite] Zugang nicht lesbar", seiteFehler);
  }
  if (seite?.bewerbung_id && (!seite.expires_at || new Date(seite.expires_at) > new Date())) {
    return String(seite.bewerbung_id);
  }

  const { data: bogen, error: bogenFehler } = await admin
    .from("bewerber_formular")
    .select("bewerbung_id")
    .eq("token", token)
    .maybeSingle();
  if (bogenFehler) console.error("[bewerber-seite] Bogen nicht lesbar", bogenFehler);
  return bogen?.bewerbung_id ? String(bogen.bewerbung_id) : "";
}

/** Der Titel der Glocke je Aktion. Nur drei melden sich bei HR. */
const GLOCKEN_TITEL: Partial<Record<SeitenAktion, string>> = {
  frage: "Frage vor dem Kennenlernen",
  kein_anruf: "Kein Anruf gewünscht",
  ausstieg: "Bewerbung selbst beendet",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return antwort({ error: "Nur POST" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({}));
    const geprueft = pruefeAnfrage(body);
    if (!geprueft.ok) {
      // Bot bekommt eine freundliche Antwort, wir schreiben nichts.
      if (geprueft.bot) return antwort({ ok: true });
      return antwort({ error: geprueft.fehler }, 400);
    }
    const { token, aktion, text: freitext, erinnerungAm } = geprueft;

    // Etwa 30 Klicks je Absender und Stunde reichen für jeden Menschen.
    const limit = await checkEdgeRateLimit({
      scope: "bewerber-seite",
      key: `ip:${clientIp(req)}`,
      perHour: 30,
    });
    if (!limit.ok) {
      return antwort({ error: "Zu viele Anfragen. Bitte in einer Stunde noch einmal versuchen." }, 429);
    }

    const bewerbungId = await bewerberZuToken(admin, token);
    if (!bewerbungId) return antwort({ error: "Link unbekannt" }, 404);

    const { data: bewerber, error: leseFehler } = await admin
      .from("bewerbungen")
      .select("id, vorname, nachname, status, meta")
      .eq("id", bewerbungId)
      .maybeSingle();

    if (leseFehler || !bewerber) {
      console.error("[bewerber-seite] Bewerber nicht gefunden", leseFehler);
      return antwort({ error: "Link unbekannt" }, 404);
    }

    const jetzt = new Date().toISOString();
    const meta = (bewerber.meta && typeof bewerber.meta === "object" ? bewerber.meta : {}) as Record<string, unknown>;
    const block = (meta.kennenlernen && typeof meta.kennenlernen === "object" && !Array.isArray(meta.kennenlernen)
      ? meta.kennenlernen
      : {}) as Record<string, unknown>;
    const alterStatus = String(bewerber.status || "");
    const name = `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim() || "Ein Bewerber";

    let neuerBlock: Record<string, unknown> = block;
    let neuesMeta: Record<string, unknown> = meta;
    let neuerStatus: string | null = null;
    let glockenText = "";

    if (aktion === "pause") {
      /*
       * Eine Pause ist kein fehlendes Interesse und wird auch nicht so
       * gespeichert. Es wird kein Status gesetzt, nur ein Vermerk. Genau das
       * ist die Unterscheidung, die im CRM bisher fehlte.
       */
      neuerBlock = { ...block, pause: { gesetztAm: jetzt, erinnerungAm } };
    } else if (aktion === "weiter") {
      neuerBlock = { ...block, pause: null };
    } else if (aktion === "kein_anruf") {
      neuerBlock = { ...block, anrufWidersprochen: true, anrufWidersprochenAm: jetzt };
      glockenText =
        `${name} möchte weitermachen, aber nicht angerufen werden. ` +
        "Die Mitteilung an Tag 11 entfällt deshalb. Interesse besteht weiterhin.";
    } else if (aktion === "frage") {
      const bisAm = antwortFrist(new Date(jetzt));
      neuerBlock = {
        ...block,
        frage: { gestelltAm: jetzt, text: freitext, bisAm, beantwortetAm: "" },
      };
      glockenText =
        `${name} hat vor dem Kennenlernen eine Frage gestellt: „${freitext}“ ` +
        `Zugesagt ist eine Antwort bis zum ${new Date(bisAm).toLocaleDateString("de-DE")}.`;
    } else {
      // ausstieg
      neuerStatus = zielStatusNachAbmeldung(alterStatus);
      neuerBlock = { ...block, ausstiegAm: jetzt, ausstiegGrund: freitext, pause: null };
      glockenText = neuerStatus
        ? `${name} hat die Bewerbung selbst beendet.${freitext ? ` Grund: „${freitext}“` : ""}`
        : `${name} hat auf seiner Seite „kein Interesse mehr“ geklickt. Der Status blieb ` +
          `unverändert, weil die Bewerbung schon weiter fortgeschritten ist.`;
    }

    neuesMeta = { ...meta, kennenlernen: neuerBlock };

    if (aktion === "ausstieg" && neuerStatus) {
      /*
       * Der selbst gewählte Ausstieg wird als Absage vermerkt, damit die
       * vorhandene Anzeige im Bewerbermanagement greift, aber mit einem
       * eigenen Grund und einem eigenen Autor. Die Herkunft bleibt damit
       * sichtbar: „Der selbst gewählte Ausstieg gehört nicht in denselben
       * Endstatus wie eine Absage durch MOREImmo."
       */
      const skript = (meta.erstgespraechSkript && typeof meta.erstgespraechSkript === "object"
        ? meta.erstgespraechSkript
        : {}) as Record<string, unknown>;
      const notizenLog = Array.isArray(meta.notizenLog) ? meta.notizenLog : [];
      neuesMeta = {
        ...neuesMeta,
        selbstAbgemeldetAm: jetzt,
        selbstAbgemeldetGrund: freitext,
        notizenLog: [
          {
            id: crypto.randomUUID(),
            text: freitext
              ? `Bewerbung auf der persönlichen Seite selbst beendet. Grund: ${freitext}`
              : "Bewerbung auf der persönlichen Seite selbst beendet.",
            datum: jetzt,
            autor: ABMELDUNG_AUTOR,
            autorId: "",
          },
          ...notizenLog,
        ],
        erstgespraechSkript: {
          ...skript,
          absageGrund: SELBST_ABGEMELDET_ABSAGEGRUND,
          abgelehntAm: jetzt,
          abgelehntVon: ABMELDUNG_AUTOR,
        },
      };
    }

    const { error: schreibFehler } = await admin
      .from("bewerbungen")
      .update({
        meta: neuesMeta,
        ...(neuerStatus ? { status: neuerStatus } : {}),
      })
      .eq("id", bewerber.id);

    if (schreibFehler) {
      console.error("[bewerber-seite] Speichern fehlgeschlagen", schreibFehler);
      return antwort({ error: "Speichern fehlgeschlagen" }, 500);
    }

    // Glocke an HR, best-effort. Eine Pause meldet sich bewusst nicht: Sie ist
    // ein normaler Zustand und keine Aufgabe für einen Menschen.
    if (glockenText) {
      try {
        const { glockenIds } = await ladeHrEmpfaenger(admin as never);
        await schreibeGlocke(admin as never, glockenIds, {
          titel: `${GLOCKEN_TITEL[aktion] || "Bewerberseite"}: ${name}`,
          nachricht: glockenText,
          link: bewerberPfad(bewerber.id),
        });
      } catch (e) {
        console.error("[bewerber-seite] Glocke fehlgeschlagen", e);
      }
    }

    return antwort({ ok: true });
  } catch (e) {
    console.error("[bewerber-seite] Fehler", e);
    return antwort({ error: "Unerwarteter Fehler" }, 500);
  }
});
