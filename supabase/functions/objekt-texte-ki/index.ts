/**
 * Erzeugt zu einem Objekt Kurzbeschreibung, fünf Standortargumente, bis zu
 * drei Marktargumente und die Liste der Sanierungen.
 *
 * WIE SIE ARBEITET
 *
 * 1. Fehlt am Objekt eine gemessene Standortanalyse der aktuellen
 *    Messfassung, misst sie die Umgebung zuerst (`_shared/standort-messung.ts`)
 *    und legt das Ergebnis unter `meta.standortanalyse` ab, die Koordinate des
 *    Hauses unter `meta.koordinaten`. Dieselbe Messung nutzt das Exposé.
 *    Scheitert die Messung trotz aller Rückfälle, geht es ohne Umgebungsdaten
 *    weiter; der Grund steht im Vermerk `umgebung` am Stand, sichtbar nur für
 *    Admin und Inhaber.
 * 2. Sie sammelt die Tatsachen: gepflegte Objektangaben, Investagon-Freitexte
 *    und neutrale Merkmale, Sanierungsjahre der Einheiten, die gemessene
 *    Umgebung, erhobene Kennzahlen der Marktanalyse
 *    (`_shared/objekt-texte-markt.ts`) und die Unterlagen von Objekt und
 *    Einheiten (`_shared/objekt-texte-unterlagen.ts`, ohne Mietverträge,
 *    Grundbuch und Verträge).
 * 3. Sie fragt das Sprachmodell über den Lovable AI Gateway, mit Werkzeug,
 *    also ohne Freitextantwort. Scheitert die Anfrage mit Unterlagen, fragt
 *    sie ein zweites Mal ohne.
 * 4. Sie prüft die Antwort und legt sie unter `meta.objekttexteKi` ab.
 *    Zusätzlich füllt sie `meta.kurzbeschreibung`, `meta.standortargumente`
 *    und `meta.marktargumente`, wo nichts steht oder nur der vorige
 *    automatische Text. Ein von Hand geschriebener Text bleibt unangetastet.
 * 5. Seit dem 25.09.2026 (Plan Kundensprache, Entscheidung 12) übersetzt sie
 *    Kurzbeschreibung, Standort- und Marktargumente zusätzlich ins Englische
 *    und legt sie unter `meta.objekttexteKiEn` ab, samt dem deutschen
 *    Wortlaut, aus dem übersetzt wurde (`_shared/objekt-texte-en.ts`). Mit
 *    `{ objektId, nurEnglisch: true }` holt sie nur die Übersetzung nach.
 * 6. Seit dem 01.10.2026 (Fassung 5) liefert derselbe KI-Aufruf bis zu acht
 *    interne Highlights für den Vertrieb, abgelegt unter
 *    `meta.objekttexteKi.interneHighlights`. Sie gehen nie an Kunden: Die
 *    Positivlisten von `get-expose` und `get-kundenansicht` lassen aus
 *    `objekttexteKi` nur die Sanierungen hinaus.
 *
 * FEHLER SIND SICHTBAR
 *
 * Am 23.09.2026 trug kein einziges Objekt einen Text, nicht einmal einen
 * Vermerk, und niemand konnte sehen, warum. Seitdem gilt:
 *
 *   - Jede Antwort trägt `version` (`OBJEKT_TEXTE_FUNKTION_VERSION`). Fehlt sie,
 *     weiß der Browser, dass hier noch eine alte Fassung läuft.
 *   - Jeder Fehler nach dem Laden des Objekts landet als
 *     `meta.objekttexteKi.letzterFehler` am Objekt, mit Grund und Zeitpunkt,
 *     ohne einen vorhandenen Text anzufassen.
 *   - Eine Ablehnung des Gateways steht mit Status und gekürztem Antworttext
 *     in den Logs der Function.
 *
 * ZWEI WEGE HINEIN
 *
 * Der normale Aufruf kommt aus dem Browser, mit dem Anmeldetoken des Nutzers.
 * Gelesen und geschrieben wird dann mit genau diesem Token, damit die Regeln
 * auf `objekte` und auf den Dokument-Eimern entscheiden, wer das darf. Ein
 * ausgeblendeter Knopf ist keine Zugriffskontrolle. Je Nutzer gilt ein
 * Kontingent, für Admin und Inhaber ein höheres, damit der Durchgang über alle
 * Objekte aus der Objektübersicht in einem Rutsch geht (seit 23.09.2026, siehe
 * `_shared/objekt-texte-kontingent.ts`).
 *
 * Der Sammelmodus (`{ sammel: true, limit }`) kommt vom Investagon-Import am
 * Ende jedes echten Laufs. Er ist nur mit dem Service-Role-Schlüssel als Token
 * zulässig, arbeitet mit der Dienstrolle und holt für sichtbare Objekte nach,
 * was fehlt oder veraltet ist, nacheinander und in kleinen Etappen. Näheres
 * in `_shared/objekt-texte-sammel.ts`.
 *
 * WARUM SIE NICHT BEI JEDEM SEITENAUFRUF LÄUFT
 *
 * 1. Ohne `neuErzeugen` gibt der normale Aufruf einen vorhandenen Stand der
 *    aktuellen Fassung unverändert zurück und fragt kein Modell.
 * 2. Fehlen sämtliche Objektangaben, legt sie einen Vermerk ab. Beim nächsten
 *    Aufruf greift dann Sicherung 1.
 * 3. Die Oberfläche prüft schon im Browser, ob ein Lauf nötig ist.
 *
 * WO WAS STEHT
 *
 * Diese Datei nimmt Anfragen an, prüft Anmeldung und Kontingent und führt den
 * Sammelmodus. Der Lauf je Objekt steht in `lauf.ts`, damit er sich ohne
 * Server prüfen lässt (`src/lib/objektTexteLauf.test.ts`).
 *
 * ACHTUNG: Gepushter Function-Code läuft erst nach dem Ausrollen in Lovable.
 * Ausgerollt werden muss die ganze Function, `lauf.ts` gehört dazu.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { checkEdgeRateLimit } from "../_shared/edge-rate-limit.ts";
import { objektTexteAusMeta, OBJEKT_TEXTE_FUNKTION_VERSION } from "../_shared/objekt-texte.ts";
import {
  istDienstAufruf,
  SAMMEL_PAUSE_MS,
  SAMMEL_START_BIS_MS,
  sammelLimit,
  type SammelZeile,
  waehleSammelObjekte,
} from "../_shared/objekt-texte-sammel.ts";
import { istLeitung, kontingentFuer } from "../_shared/objekt-texte-kontingent.ts";
import { type Db, englischNachholen, erzeugeFuerObjekt, type Ergebnis, vermerkeFehler, ZEITBUDGET_MS } from "./lauf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Jede Antwort trägt die Fassung der Function, siehe `OBJEKT_TEXTE_FUNKTION_VERSION`. */
const antwort = (nutzlast: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...nutzlast, version: OBJEKT_TEXTE_FUNKTION_VERSION }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const pause = (ms: number) => new Promise<void>((fertig) => setTimeout(fertig, ms));

/**
 * Trägt der Aufrufer die Rolle Admin oder Inhaber?
 *
 * Gelesen mit seinem eigenen Token aus `user_roles`, genau so, wie die
 * Oberfläche seine Rollen liest (`UserContext`). Maßgeblich sind die
 * zugewiesenen Rollen, nicht die gerade gewählte Ansicht, und nie etwas aus dem
 * Rumpf der Anfrage. Geht das Lesen schief, gilt das normale Kontingent:
 * lieber zu knapp als zu großzügig.
 */
async function aufruferIstLeitung(db: Db, nutzerId: string): Promise<boolean> {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", nutzerId);
  if (error) {
    console.warn("objekt-texte-ki: Rollen nicht lesbar, es gilt das normale Kontingent", error.message);
    return false;
  }
  return istLeitung(((data || []) as Array<{ role?: unknown }>).map((zeile) => zeile.role));
}

/** Was ein Sammellauf getan hat. Nur Zahlen, keine Objektdaten. */
interface SammelBericht {
  kandidaten: number;
  versucht: number;
  erzeugt: number;
  vermerkt: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  ende: "fertig" | "limit" | "zeit" | "ki-grenze" | "auswahl-fehler";
}

/**
 * Der Sammelmodus: sichtbare Objekte ohne aktuellen Stand nacheinander füllen.
 *
 * Vor jedem Objekt wird es frisch gelesen. Hat es inzwischen einen aktuellen
 * Stand, etwa weil jemand die Objektseite geöffnet hat, wird es übersprungen.
 *
 * Jedes Objekt wird höchstens einmal je Stunde und dreimal je Tag versucht
 * (`check_rate_limit` mit der Objektkennung als Schlüssel). Das hält zwei
 * gleichzeitige Anstöße davon ab, dasselbe Objekt doppelt zu bezahlen, und ein
 * Objekt, an dem der Lauf immer wieder scheitert, blockiert nicht jede
 * Viertelstunde einen Platz.
 *
 * Bis zum 23.09.2026 hielt der Sammelmodus an, sobald Adresssuche oder
 * Overpass ausfielen, und schrieb dann gar nichts. Seitdem geht es auch hier
 * ohne Umgebungsdaten weiter, wie im Browser.
 */
async function sammelLauf(db: Db, limit: number, beginn: number): Promise<SammelBericht> {
  const bericht: SammelBericht = {
    kandidaten: 0,
    versucht: 0,
    erzeugt: 0,
    vermerkt: 0,
    uebersprungen: 0,
    fehlgeschlagen: 0,
    ende: "fertig",
  };

  const { data, error } = await db
    .from("objekte")
    .select("id, titel, erstellt_am, texte_schema:meta->objekttexteKi->schema")
    .eq("sichtbar", true);
  if (error) {
    console.error("objekt-texte-ki: Sammelmodus, Auswahl nicht lesbar", error.message);
    bericht.ende = "auswahl-fehler";
    return bericht;
  }

  const kandidaten = waehleSammelObjekte((data || []) as SammelZeile[]);
  bericht.kandidaten = kandidaten.length;

  for (const k of kandidaten) {
    if (bericht.versucht >= limit) {
      bericht.ende = "limit";
      break;
    }
    if (Date.now() - beginn > SAMMEL_START_BIS_MS) {
      bericht.ende = "zeit";
      break;
    }

    const { data: objekt, error: leseFehler } = await db
      .from("objekte")
      .select("*")
      .eq("id", k.id)
      .eq("sichtbar", true)
      .maybeSingle();
    if (leseFehler || !objekt || objektTexteAusMeta((objekt as Record<string, unknown>).meta)) {
      bericht.uebersprungen += 1;
      continue;
    }

    const anspruch = await checkEdgeRateLimit({
      scope: "objekt-texte-sammel-objekt",
      key: k.id,
      perHour: 1,
      perDay: 3,
    });
    if (!anspruch.ok) {
      bericht.uebersprungen += 1;
      continue;
    }

    if (bericht.versucht > 0) await pause(SAMMEL_PAUSE_MS);
    bericht.versucht += 1;

    const zeile = objekt as Record<string, unknown>;
    let ergebnis: Ergebnis;
    try {
      ergebnis = await erzeugeFuerObjekt(db, zeile, {
        frist: beginn + ZEITBUDGET_MS,
        englisch: true,
        schluessel: Deno.env.get("LOVABLE_API_KEY") || "",
      });
    } catch (e) {
      ergebnis = { art: "fehler", status: 500, meldung: `Unerwarteter Fehler: ${e instanceof Error ? e.message : "unbekannt"}` };
    }
    if (ergebnis.art === "erzeugt") {
      if (ergebnis.gespeichert) bericht.erzeugt += 1;
      else bericht.fehlgeschlagen += 1;
    } else if (ergebnis.art === "vermerk") {
      bericht.vermerkt += 1;
    } else {
      bericht.fehlgeschlagen += 1;
      console.warn(`objekt-texte-ki: Sammelmodus, Objekt ${k.id}: ${ergebnis.meldung}`);
      await vermerkeFehler(db, k.id, (zeile.meta || {}) as Record<string, unknown>, ergebnis);
      if (ergebnis.status === 429 || ergebnis.status === 402) {
        // Gateway bremst oder das Guthaben ist leer. Weiterfeuern macht es
        // nur schlimmer.
        bericht.ende = "ki-grenze";
        break;
      }
    }
  }

  return bericht;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const eingang = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const anmeldung = req.headers.get("Authorization") || "";
    if (!anmeldung.startsWith("Bearer ")) {
      return antwort({ error: "Bitte neu anmelden." }, 401);
    }

    const rumpf = await req.json().catch(() => ({}));

    /*
     * ── Der Sammelmodus, nur für andere Functions ──
     *
     * Die Prüfung steht vor allem anderen, auch vor der Anmeldung als Nutzer:
     * Mit dem Service-Role-Schlüssel gibt es keinen Nutzer, und ohne ihn darf
     * dieser Zweig gar nicht erst betreten werden.
     */
    if (rumpf?.sammel === true) {
      const DIENST_SCHLUESSEL = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
      if (!istDienstAufruf(anmeldung, DIENST_SCHLUESSEL)) {
        return antwort({ error: "Der Sammelmodus ist nur für interne Aufrufe." }, 403);
      }
      // Eine Obergrenze für die Anstöße selbst. Der Import stößt viermal je
      // Stunde an, dazu kommen neu angelegte Objekte aus dem Webhook.
      const anstoesse = await checkEdgeRateLimit({ scope: "objekt-texte-sammel", key: "server", perHour: 12, perDay: 150 });
      if (!anstoesse.ok) return antwort({ sammel: true, angenommen: false, grund: "kontingent" }, 429);

      const limit = sammelLimit(rumpf?.limit);
      const dienst = createClient(SUPABASE_URL, DIENST_SCHLUESSEL, { auth: { persistSession: false } });
      const arbeit = sammelLauf(dienst, limit, eingang)
        .then((bericht) => {
          console.log("objekt-texte-ki: Sammelmodus", JSON.stringify(bericht));
          return bericht;
        })
        .catch((e) => {
          console.error("objekt-texte-ki: Sammelmodus abgebrochen", e);
          return null;
        });

      // Sofort antworten und im Hintergrund arbeiten, damit der Import nicht
      // auf die KI-Aufrufe wartet. Ohne `EdgeRuntime` (etwa lokal) wird
      // gewartet und der Bericht mitgegeben.
      // deno-lint-ignore no-explicit-any
      const laufzeit = (globalThis as any).EdgeRuntime;
      if (laufzeit?.waitUntil) {
        laufzeit.waitUntil(arbeit);
        return antwort({ sammel: true, angenommen: true, limit }, 202);
      }
      return antwort({ sammel: true, angenommen: true, limit, bericht: await arbeit });
    }

    // ── Der normale Aufruf, mit dem Token des Nutzers ──
    // Gelesen wird über diesen Client, damit die Zeilensicherheit greift und
    // nicht umgangen wird. Geschrieben wird seit dem 30.09.2026 mit der
    // Dienstrolle (`schreibDb` unten), erst nach der Leseprüfung.
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: anmeldung } },
    });
    const { data: angemeldet } = await db.auth.getUser();
    const nutzerId = angemeldet?.user?.id ?? null;
    if (!nutzerId) return antwort({ error: "Bitte neu anmelden." }, 401);

    // Teurer KI-Aufruf, deshalb ein Kontingent je Nutzer. Admin und Inhaber
    // bekommen ein höheres, damit der Durchgang über alle Objekte in einem
    // Rutsch geht (`_shared/objekt-texte-kontingent.ts`). Der Zähler ist für
    // beide derselbe, nur die Obergrenze unterscheidet sich.
    const leitung = await aufruferIstLeitung(db, nutzerId);
    const grenzen = kontingentFuer(leitung);
    const kontingent = await checkRateLimit(req, nutzerId, {
      scope: "objekt-texte-ki",
      perHour: grenzen.stunde,
      perDay: grenzen.tag,
    });
    if (!kontingent.ok) return rateLimitErrorBody("objekt-texte-ki", kontingent, corsHeaders);

    const objektId: string = typeof rumpf?.objektId === "string" ? rumpf.objektId : "";
    const neuErzeugen: boolean = rumpf?.neuErzeugen === true;
    // Nur zusammen mit `neuErzeugen` und nur für Admin und Inhaber: der Knopf
    // „Erneut versuchen“ an der Karte. Christians Entscheidung vom 23.09.2026,
    // eine gemessene Analyse gilt dauerhaft, neu gemessen wird nur bei
    // geänderter Adresse oder auf Wunsch der Leitung. Die Rolle kommt aus
    // `user_roles`, nie aus dem Rumpf.
    const neuMessen: boolean = neuErzeugen && rumpf?.neuMessen === true && leitung;
    if (!objektId) return antwort({ error: "Es fehlt die Objektkennung." }, 400);

    const { data: objekt, error: objektFehler } = await db
      .from("objekte")
      .select("*")
      .eq("id", objektId)
      .maybeSingle();
    if (objektFehler) {
      console.error("objekt-texte-ki: Objekt nicht lesbar", objektFehler.message);
      return antwort({ error: `Das Objekt konnte nicht geladen werden (${objektFehler.message}).` }, 500);
    }
    if (!objekt) {
      // Auch fehlende Berechtigung landet hier: Die Zeilensicherheit filtert
      // die Zeile weg, statt einen Fehler zu melden.
      return antwort({ error: "Das Objekt wurde nicht gefunden oder darf nicht gelesen werden." }, 404);
    }
    const zeile = objekt as Record<string, unknown>;

    /*
     * Schreiben mit der Dienstrolle, Lesen weiter mit dem Nutzertoken.
     *
     * Seit dem 30.09.2026 (Migration 20260930120000) schreiben nur Admin und
     * Inhaber direkt in `objekte`. Mit dem Nutzertoken änderte das Speichern
     * für alle anderen still null Zeilen, und die Antwort meldete trotzdem
     * „gespeichert“; der nächste Aufruf hätte erneut einen KI-Lauf gekostet.
     * Der Nutzer hat das Objekt oben mit seinem Token gelesen, das ist die
     * Prüfung. Geschrieben werden nur die eigenen Schlüssel in `meta`.
     */
    const DIENST_SCHLUESSEL = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const schreibDb = DIENST_SCHLUESSEL
      ? createClient(SUPABASE_URL, DIENST_SCHLUESSEL, { auth: { persistSession: false } })
      : undefined;

    // Ohne ausdrückliches Neuerzeugen kostet dieser Aufruf keinen KI-Lauf.
    const vorhanden = objektTexteAusMeta(zeile.meta);
    if (vorhanden && !neuErzeugen) {
      /*
       * Nur die englische Fassung nachholen (Plan Kundensprache, Entscheidung
       * 12), für Texte, die vor dem 25.09.2026 entstanden. Kostet einen
       * kurzen KI-Aufruf ohne Unterlagen; die deutschen Texte bleiben, wie
       * sie sind. Die Antwort trägt die Fassung unter `englisch`, `null`
       * heißt: hat nicht geklappt, es bleibt beim deutschen Text.
       */
      if (rumpf?.nurEnglisch === true) {
        const nachgeholt = await englischNachholen(db, zeile, vorhanden, {
          schreibDb,
          frist: eingang + ZEITBUDGET_MS,
          schluessel: Deno.env.get("LOVABLE_API_KEY") || "",
        });
        return antwort({
          texte: vorhanden,
          gespeichert: true,
          neu: false,
          englisch: nachgeholt.englisch ?? null,
          englischGespeichert: nachgeholt.gespeichert,
        });
      }
      return antwort({ texte: vorhanden, gespeichert: true, neu: false });
    }

    let ergebnis: Ergebnis;
    try {
      ergebnis = await erzeugeFuerObjekt(db, zeile, {
        schreibDb,
        vorhanden,
        neuMessen,
        frist: eingang + ZEITBUDGET_MS,
        englisch: true,
        schluessel: Deno.env.get("LOVABLE_API_KEY") || "",
      });
    } catch (e) {
      console.error("objekt-texte-ki: Lauf abgebrochen", e);
      ergebnis = { art: "fehler", status: 500, meldung: `Unerwarteter Fehler: ${e instanceof Error ? e.message : "unbekannt"}` };
    }

    if (ergebnis.art === "erzeugt") {
      return ergebnis.gespeichert
        ? antwort({ texte: ergebnis.texte, gespeichert: true, neu: true })
        : antwort({
          texte: ergebnis.texte,
          gespeichert: false,
          neu: true,
          // Der Text ist da, nur das Ablegen ging schief. Er kommt trotzdem
          // zurück, sonst wäre der KI-Lauf umsonst gewesen.
          hinweis: "Die Texte konnten nicht am Objekt gespeichert werden.",
        });
    }
    if (ergebnis.art === "vermerk") {
      return antwort({ texte: ergebnis.texte, gespeichert: ergebnis.gespeichert, neu: true });
    }
    await vermerkeFehler(db, objektId, (zeile.meta || {}) as Record<string, unknown>, ergebnis, schreibDb);
    return antwort({ error: ergebnis.meldung, ...(ergebnis.zusatz || {}) }, ergebnis.status);
  } catch (e) {
    console.error("objekt-texte-ki:", e);
    return antwort({ error: e instanceof Error ? e.message : "Unbekannter Fehler" }, 500);
  }
});
