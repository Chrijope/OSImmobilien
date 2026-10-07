import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { meldeErneuteBewerbung, meldeNeuenBewerber } from "../_shared/hr-benachrichtigung.ts";
import { findeBewerbungNachEmail, metaMitWeitererBewerbung } from "../_shared/bewerber-dublette.ts";
import { sorgeFuerBewerberSeite } from "../_shared/bewerber-seite.ts";
import { versendeKennenlernen } from "../_shared/kennenlernen-versand.ts";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { erlaubterLebenslauf } from "../_shared/bewerber-dublette.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RECAPTCHA_SECRET = Deno.env.get("RECAPTCHA_SECRET_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function verifyRecaptcha(token: string, remoteip?: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET || !token) return false;
  try {
    const params = new URLSearchParams({ secret: RECAPTCHA_SECRET, response: token });
    if (remoteip) params.append("remoteip", remoteip);
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const json = await res.json();
    if (!json?.success) {
      console.warn("[submit-bewerbung] recaptcha failure", json);
      return false;
    }
    // v3: Score-Check (0.0 - 1.0). Schwelle 0.5, Action muss 'submit_bewerbung' sein.
    if (typeof json.score === "number") {
      if (json.score < 0.5) {
        console.warn("[submit-bewerbung] recaptcha low score", json.score);
        return false;
      }
      if (json.action && json.action !== "submit_bewerbung") {
        console.warn("[submit-bewerbung] recaptcha action mismatch", json.action);
        return false;
      }
    }
    return true;
  } catch (e) {
    console.error("[submit-bewerbung] recaptcha verify failed", e);
    return false;
  }
}

const SubmitSchema = z.object({
  action: z.literal("submit").optional(),
  // Bewerbungs-Felder
  vorname: z.string().trim().min(1).max(100),
  nachname: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  telefon: z.string().trim().max(50).optional().default(""),
  ort: z.string().trim().max(120).optional().default(""),
  erfahrung: z.string().trim().max(500).optional().default(""),
  motivation: z.string().trim().max(3000).optional().default(""),
  quelle: z.string().trim().max(60).optional().default(""),
  stelleId: z.string().trim().max(80),
  stelleTitel: z.string().trim().max(200),
  beschaeftigungsart: z.string().trim().max(80).optional().default(""),
  // Wie der Bewerber auf uns aufmerksam geworden ist. Bewusst getrennt von
  // `quelle`: Quelle ist der Eingangsweg ins CRM, das hier ist seine Antwort.
  aufmerksamDurch: z.string().trim().max(60).optional().default(""),
  // Lebenslauf als Data-URL. Wie bisher im Datensatz abgelegt; der Wechsel in
  // den Dateispeicher steht noch aus. 8 MB Rohdaten ergeben rund 11 MB Base64.
  lebenslaufUrl: z.string().max(11_000_000).optional().default(""),
  lebenslaufName: z.string().trim().max(255).optional().default(""),
  /*
   * Die Stellenanzeige leitet den selbststaendigen Berater nach dem Absenden
   * direkt in seinen Kennenlernbogen. Dafuer braucht sie den Schluessel des
   * Bogens in der Antwort. Nur wer ihn ausdruecklich anfordert, bekommt ihn:
   * Die Landingpage und die Karriereseite fordern ihn nicht an, ihre Antwort
   * bleibt wie bisher.
   */
  kennenlernLink: z.boolean().optional().default(false),
  /*
   * Der Weg der Bewerbung, als festes Feld statt aus dem Titeltext gelesen.
   * Nur die Stellenanzeige setzt es (Christian, 24.09.2026). Landingpage und
   * Karriereseite schicken es nicht und laufen unveraendert.
   *   tippgeber            wird angerufen, kein Bogen, kein Lebenslauf
   *   finanzdienstleister  wie der Berater, dazu vorgemerkt fuer das
   *                        Gespraech zum zweiten Produkt mit Christian Kurz
   */
  stelle: z.enum(["tippgeber", "finanzdienstleister"]).optional(),
  // Spam-Schutz
  hp: z.string().max(0).optional().default(""), // Honeypot: muss leer sein
  recaptchaToken: z.string().min(10).max(4000),
});

/*
 * Die Eingangsmail anstossen und das Ergebnis festhalten.
 *
 * Vorher wurde der Rueckgabewert von `invoke` weggeworfen. Das ist bei
 * supabase-js gefaehrlich, denn ein 401 oder 403 wirft keine Ausnahme: Das
 * `catch` greift nie, und der Aufrufer meldet trotzdem Erfolg. Genau so blieb
 * der Ausfall vom 10.09.2026 wochenlang unsichtbar.
 *
 * Jetzt gilt: Schlaegt der Versand fehl, steht das am Bewerber, und zwar mit
 * Grund. Die Bewerbung selbst bleibt gespeichert, denn sie ist das
 * Wichtigere. Der Bewerber ist nicht verloren, nur seine Mail fehlt, und HR
 * sieht das im Profil.
 */
async function stosseEingangsmailAn(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bewerbungId: string,
  quelle: string,
): Promise<string> {
  try {
    /*
     * Direkt im selben Prozess, seit dem 15.09.2026.
     *
     * Vorher lief der Versand ueber einen zweiten Netzaufruf an die Function
     * `send-bewerber-kennenlernen`, ausgewiesen mit einem gemeinsamen
     * Geheimnis. Dieser Umweg ist immer wieder mit „non-2xx" gescheitert, und
     * zwar still: Die Bewerbung stand im CRM, die Mail kam nie an, und HR
     * musste sie von Hand nachschicken. Ein Aufruf ueber das Netz kann an der
     * Anmeldung, am Tor der Plattform und an der Rechtepruefung scheitern,
     * obwohl hier ohnehin schon mit der Service-Rolle gearbeitet wird.
     *
     * Jetzt ruft der Eingang dasselbe Modul auf, das auch die Function
     * benutzt. Es gibt keinen zweiten Aufruf mehr, also nichts, was daran
     * scheitern koennte.
     */
    const ergebnis = await versendeKennenlernen(admin, { bewerbungId });
    if (!ergebnis.versandt) {
      const grund = ergebnis.grund || String(ergebnis.koerper?.error || "unbekannt");
      console.error(`[${quelle}] Eingangsmail fehlgeschlagen`, bewerbungId, grund);
      await vermerkeVersandFehler(admin, bewerbungId, grund);
    }
    /*
     * Der Schluessel des Bogens, fuer die Ueberleitung auf der Stellenanzeige.
     * Er kommt auch zurueck, wenn nur die Mail scheiterte: Der Bogen steht
     * dann trotzdem, und der Bewerber kommt ueber die Ueberleitung hinein,
     * obwohl ihn die Mail nicht erreicht hat. Leer heisst: Es gibt keinen
     * Bogen, und die Seite zeigt den Rueckfall.
     */
    return ergebnis.token || "";
  } catch (e) {
    console.error(`[${quelle}] Eingangsmail warf eine Ausnahme`, bewerbungId, e);
    await vermerkeVersandFehler(admin, bewerbungId, String(e));
    return "";
  }
}

/**
 * So sieht ein Schluessel aus `bewerber_formular` aus: 32 Byte Zufall,
 * hexadezimal (Migration 20260819180000). Alles andere geht nicht hinaus.
 */
const KENNENLERN_TOKEN_MUSTER = /^[0-9a-f]{64}$/;

/**
 * Titel und Taetigkeit eines Tippgebers, vom Server gesetzt und nicht aus der
 * Anfrage uebernommen. Der Titel ist das, was HR im Bewerberprozess in der
 * Spalte „Stelle" sieht und wonach sie filtert. Er muss zu
 * `src/lib/stellenanzeigen.ts` passen (Test).
 */
const TIPPGEBER_STELLE_TITEL = "Tippgeber für Kapitalanlageimmobilien (m/w/d)";
const TIPPGEBER_TAETIGKEIT = "Selbstständig, Tippgeber";

/** Dasselbe fuer Finanzdienstleister, passend zu `src/lib/stellenanzeigen.ts` (Test). */
const FINANZDIENSTLEISTER_STELLE_TITEL =
  "Selbstständiger Immobilienberater für Kapitalanlagen mit Hintergrund in der Finanzdienstleistung (m/w/d)";
const FINANZDIENSTLEISTER_TAETIGKEIT = "Selbstständig, Handelsvertreter, Finanzdienstleister";

/** Traegt den Fehlschlag am Bewerber ein, damit HR ihn im Profil sieht. */
async function vermerkeVersandFehler(
  // deno-lint-ignore no-explicit-any
  admin: any,
  bewerbungId: string,
  grund: string,
): Promise<void> {
  try {
    const { data: row } = await admin
      .from("bewerbungen")
      .select("meta")
      .eq("id", bewerbungId)
      .maybeSingle();
    const meta = ((row?.meta || {}) as Record<string, unknown>);
    const bisher = (typeof meta.kennenlernen === "object" && meta.kennenlernen ? meta.kennenlernen : {}) as Record<string, unknown>;
    await admin
      .from("bewerbungen")
      .update({
        meta: {
          ...meta,
          kennenlernen: { ...bisher, versandOk: false, versandGrund: grund, versandVersuchAm: new Date().toISOString() },
        },
      })
      .eq("id", bewerbungId);
  } catch (e) {
    console.error("[vermerkeVersandFehler] konnte nicht schreiben", bewerbungId, e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RECAPTCHA_SECRET) {
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Oeffentlich erreichbar, also mit Bremse je IP wie submit-lead.
  const bremse = await checkEdgeRateLimit({ scope: "submit-bewerbung", key: clientIp(req), perHour: 30, perDay: 200 });
  if (bremse.exceeded) {
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Zu viele Anfragen. Bitte später erneut versuchen." }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(bremse.retryAfterSeconds ?? 3600) },
      },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    const parsed = SubmitSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Ungültige Daten", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = parsed.data;

    /*
     * Tippgeber aus der Stellenanzeige (Christian, 24.09.2026): kein
     * Lebenslauf, keine Kennenlern-Einladung, keine Erinnerungskette, keine
     * persoenliche Bewerberseite. Das Team ruft sie an, deshalb ist die
     * Handynummer hier Pflicht, auch wenn jemand die Oberflaeche umgeht.
     */
    const istTippgeber = data.stelle === "tippgeber";
    if (istTippgeber && data.telefon.replace(/\D/g, "").length < 6) {
      return new Response(
        JSON.stringify({ error: "Bitte gib deine Handynummer an, damit wir dich anrufen können." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    /*
     * Finanzdienstleister laufen wie der Berater, mit Kennenlernbogen und
     * Ueberleitung. Das Kennzeichen merkt sie fuer das Gespraech zum zweiten
     * Produkt vor, das Christian Kurz fuehrt.
     */
    const istFinanzdienstleister = data.stelle === "finanzdienstleister";

    // Der Lebenslauf kommt als data:-Adresse. Erlaubt ist nur ein echtes PDF
    // (Inhalt beginnt mit %PDF-) bis zur bisherigen Groesse, wie im Formular;
    // alles andere, etwa HTML oder Skript, wird abgewiesen.
    if (data.lebenslaufUrl && !erlaubterLebenslauf(data.lebenslaufUrl)) {
      return new Response(
        JSON.stringify({ error: "Bitte lade deinen Lebenslauf als PDF hoch." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const stelleTitel = istTippgeber
      ? TIPPGEBER_STELLE_TITEL
      : istFinanzdienstleister
        ? FINANZDIENSTLEISTER_STELLE_TITEL
        : data.stelleTitel;

    // Honeypot
    if (data.hp && data.hp.length > 0) {
      // Bot — wir antworten 200 "ok", schreiben aber nichts
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // reCAPTCHA
    const remoteip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ok = await verifyRecaptcha(data.recaptchaToken, remoteip);
    if (!ok) {
      return new Response(
        JSON.stringify({ error: "reCAPTCHA-Überprüfung fehlgeschlagen. Bitte erneut bestätigen." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Insert via Service-Role ──
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const id = crypto.randomUUID();
    const beworben = new Date().toISOString();
    // Klein gespeichert, damit die Dublettensuche und alle spaeteren
    // Vergleiche nicht an der Schreibweise scheitern (M17 vom 04.10.2026).
    const email = data.email.toLowerCase();

    /*
     * Zweite Bewerbung derselben Adresse: an die bestehende haengen und HR
     * per Glocke informieren, statt eine Dublette anzulegen. Die Antwort
     * traegt dann weder die echte Kennung noch Schluessel: Wer nur eine
     * fremde Adresse kennt, soll weder deren Seite noch deren Bogen bekommen
     * und nicht erfahren, dass es sie schon gibt. Scheitert die
     * Suche, lieber eine Dublette als eine verlorene Bewerbung.
     */
    let bestehend: Awaited<ReturnType<typeof findeBewerbungNachEmail>> = null;
    try {
      bestehend = await findeBewerbungNachEmail(admin, email);
    } catch (e) {
      console.error("[submit-bewerbung] Dublettensuche fehlgeschlagen", e);
    }
    if (bestehend?.id) {
      const bisher = (bestehend.meta || {}) as Record<string, unknown>;
      const quelle = data.quelle || "Website";
      const neueMeta = metaMitWeitererBewerbung(bisher, {
        eingegangenAm: beworben,
        quelle,
        angaben: {
          vorname: data.vorname,
          nachname: data.nachname,
          telefon: data.telefon,
          ort: data.ort,
          stelleId: data.stelleId,
          stelleTitel,
          erfahrung: data.erfahrung,
          motivation: data.motivation,
          aufmerksamDurch: data.aufmerksamDurch,
          ...(data.stelle ? { stelle: data.stelle } : {}),
          // Der Lebenslauf dieser Anfrage geht nicht verloren, er steht hier
          // mit. Fehlt an der Bewerbung noch einer, wird er unten auch dort
          // uebernommen.
          lebenslaufName: istTippgeber ? "" : data.lebenslaufName,
          lebenslaufUrl: istTippgeber ? "" : data.lebenslaufUrl,
          _source: "public_form",
        },
      });
      // Ein Lebenslauf, der bisher fehlte, wird uebernommen.
      if (!istTippgeber && data.lebenslaufUrl && !bisher.lebenslaufUrl) {
        neueMeta.lebenslaufUrl = data.lebenslaufUrl;
        if (data.lebenslaufName) {
          const dokumente = Array.isArray(bisher.dokumente) ? bisher.dokumente : [];
          neueMeta.dokumente = [...dokumente, {
            id: crypto.randomUUID(),
            name: data.lebenslaufName,
            typ: "Lebenslauf",
            datum: new Date().toLocaleDateString("de-DE"),
            status: "hochgeladen",
          }];
        }
      }
      const { error: anhangFehler } = await admin
        .from("bewerbungen")
        .update({ meta: neueMeta, ...(!String(bestehend.telefon || "").trim() && data.telefon ? { telefon: data.telefon } : {}) })
        .eq("id", bestehend.id);
      if (anhangFehler) {
        console.error("[submit-bewerbung] Anhaengen fehlgeschlagen", anhangFehler);
        return new Response(
          JSON.stringify({ error: "Speichern fehlgeschlagen" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await meldeErneuteBewerbung(admin, {
        id: bestehend.id,
        name: `${bestehend.vorname || ""} ${bestehend.nachname || ""}`.trim() || `${data.vorname} ${data.nachname}`,
        quelle,
      });
      // Dieselbe Form wie bei einer neuen Bewerbung, mit einer Kennung, die
      // nirgends hinfuehrt, und ohne Seite: Die Antwort verraet nicht, dass
      // es die Adresse schon gibt.
      return new Response(JSON.stringify({ ok: true, id: crypto.randomUUID(), seiteToken: "" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error } = await admin.from("bewerbungen").insert({
      id,
      vorname: data.vorname,
      nachname: data.nachname,
      email,
      telefon: data.telefon,
      position: stelleTitel,
      status: "Eingang",
      nachricht: data.motivation,
      notizen: "",
      meta: {
        ort: data.ort,
        quelle: data.quelle || "Website",
        beworben,
        stelleId: data.stelleId,
        stelleTitel,
        bewertung: 0,
        erfahrung: data.erfahrung,
        beschaeftigungsart: istTippgeber
          ? TIPPGEBER_TAETIGKEIT
          : istFinanzdienstleister
            ? FINANZDIENSTLEISTER_TAETIGKEIT
            : data.beschaeftigungsart,
        aufmerksamDurch: data.aufmerksamDurch,
        // Ein Tippgeber reicht keinen Lebenslauf ein; kommt trotzdem einer mit, wird er nicht gespeichert.
        lebenslaufUrl: istTippgeber ? "" : data.lebenslaufUrl,
        dokumente: !istTippgeber && data.lebenslaufName
          ? [{
              id: crypto.randomUUID(),
              name: data.lebenslaufName,
              typ: "Lebenslauf",
              datum: new Date().toLocaleDateString("de-DE"),
              status: "hochgeladen",
            }]
          : [],
        vertragStatus: "nicht_gesendet",
        feedback: [],
        benachrichtigungen: [],
        chatVerknuepft: false,
        notizenLog: [],
        _type: "bewerber",
        _source: "public_form",
        /*
         * Das Kennzeichen, an dem der Server Tippgeber wiedererkennt, etwa
         * die Nachfass-Welle in `_shared/bewerber-nachfass.ts`. Nur hier
         * gesetzt, aus dem festen Feld `stelle`.
         */
        ...(istTippgeber ? { tippgeber: true } : {}),
        ...(istFinanzdienstleister ? { finanzdienstleister: true } : {}),
        /*
         * Neue Bewerbungen gehoeren in den Bewerberprozess, nicht mehr in das
         * Bewerbungsmanagement. Ohne dieses Kennzeichen landet jede Bewerbung
         * im alten Bereich, und der fuellt sich nach dem Umzug sofort wieder.
         * Der Wert muss zu PROZESS_NEU in src/lib/bewerberprozessZuordnung.ts
         * passen.
         */
        prozess: "neu",
      },
    });

    if (error) {
      console.error("[submit-bewerbung] insert failed", error);
      return new Response(
        JSON.stringify({ error: "Speichern fehlgeschlagen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    /*
     * Die persönliche Seite entsteht hier, mit dem Eingang der Bewerbung, und
     * nicht erst nach dem Absenden eines Bogens.
     *
     * Das ist der Unterschied, der im Betrieb am meisten verändert: Solange
     * die Seite erst später entsteht, trägt die Eingangsmail den ganzen
     * Prozess allein, und landet sie im Spam, ist der Fall still verloren. Mit
     * einer Seite ab Eingang gibt es zwei Wege zum selben Ziel, und das Token
     * unten in der Antwort ist der zweite: Die Erfolgsseite verlinkt ihn
     * sofort, im Moment der höchsten Aufmerksamkeit.
     *
     * Best-Effort. Fehlt die Tabelle, weil die Migration noch nicht gelaufen
     * ist, kommt ein leerer String zurück und alles Weitere läuft wie bisher.
     */
    // Tippgeber bekommen keine Bewerberseite: Sie zeigt den Weg ueber den Kennenlernbogen.
    const seiteToken = istTippgeber ? "" : await sorgeFuerBewerberSeite(admin as never, id);

    // ── Interne Meldung an die HR-Rolle (Best-Effort) ──
    // Die Oberfläche ruft dafür `notifyHR` auf. Das liest die Rollen aus dem
    // Zwischenspeicher des angemeldeten Nutzers und läuft auf einem öffentlichen
    // Formular deshalb immer ins Leere. Serverseitig geht es mit der Service-Rolle.
    //
    // Empfänger und Text liegen in `_shared/hr-benachrichtigung.ts`, damit alle
    // drei Eingangswege eines Bewerbers dieselbe Meldung erzeugen.
    await meldeNeuenBewerber(admin, {
      id,
      vorname: data.vorname,
      nachname: data.nachname,
      email,
      telefon: data.telefon,
      ort: data.ort,
      quelle: data.quelle || "Website",
      stelleTitel,
      beworbenAm: beworben,
    });

    /*
     * Eingangsbestaetigung (Best-Effort). Seit dem Umzug in den Bewerberprozess
     * geht der Kennenlernbogen hinaus, nicht mehr der alte Vorabbogen mit 13
     * Fragen. Beide Functions nehmen dieselbe Angabe entgegen.
     */
    let kennenlernToken = "";
    try {
      // Tippgeber werden angerufen, sie bekommen keine Kennenlern-Einladung.
      if (data.email && !istTippgeber) {
        kennenlernToken = await stosseEingangsmailAn(admin, id, "submit-bewerbung");
      }
    } catch (e) {
      console.error("[submit-bewerbung] Kennenlern-Einladung fehlgeschlagen", e);
    }

    /*
     * Der Schluessel geht ausschliesslich an den, der diese Bewerbung gerade
     * selbst abgeschickt hat, in der Antwort auf genau diesen Aufruf. Die
     * Bewerbung ist in dieser Anfrage neu entstanden (eigene, zufaellige id),
     * der Bogen haengt allein an ihr. Wer eine fremde Adresse eintraegt,
     * bekommt also einen neuen, leeren Bogen zu seiner eigenen Eingabe und nie
     * den Bogen eines anderen. Der Schluessel wird nirgends protokolliert.
     */
    const kennenlernenToken = data.kennenlernLink && KENNENLERN_TOKEN_MUSTER.test(kennenlernToken)
      ? kennenlernToken
      : "";

    return new Response(
      JSON.stringify({ ok: true, id, seiteToken, ...(kennenlernenToken ? { kennenlernenToken } : {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[submit-bewerbung] error", e);
    return new Response(
      JSON.stringify({ error: "Unerwarteter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});