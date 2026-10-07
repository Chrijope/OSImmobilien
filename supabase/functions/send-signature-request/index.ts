import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { signaturAblauf, signaturAblaufText } from "../_shared/signatur-frist.ts";
import {
  SA_PERSON_TYPEN,
  istSaPerson,
  saAeltereFassungenUeberholen,
  saAufzuraeumendePersonTypen,
  saFassungFuerVersand,
  saKorrekturMetaPatch,
} from "../_shared/selbstauskunft-geltende-unterschrift.ts";
import {
  emailIstBrauchbar,
  empfaengerAusKontakt,
  pruefeKontaktZugriff,
  ZUGRIFF_ABGELEHNT,
} from "../_shared/kontakt-signatur-zugriff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";

/**
 * Stufen, aus denen der Versand einer Selbstauskunft nach vorne schiebt.
 *
 * Steht der Kunde schon weiter, etwa in "reservierung", bleibt er dort: Eine
 * nachgereichte Selbstauskunft darf ihn nicht zurueckwerfen.
 */
const VOR_SELBSTAUSKUNFT = new Set([
  "neuer_lead", "kontaktversuche", "follow_up", "erstgespraech",
  "beratungsgespraech", "closing",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const { kontaktId, investmentId, saData: saDataRoh, persons, nachweisToken, saFassung: saFassungRoh } = await req.json();
    // Kann unten durch die Angaben der aktuellen Fassung ersetzt werden.
    let saData = saDataRoh;

    /*
     * Der dritte Weg herein: ein Aufruf von Function zu Function.
     *
     * Unterschreibt ein Ehepaar die Selbstauskunft gemeinsam und sitzt der
     * zweite Kaeufer nicht mit am Bildschirm, ruft `submit-sa-signature` diese
     * Function auf, damit er seinen Link per Mail bekommt. Dieser Aufruf laeuft
     * mit dem Service-Role-Schluessel, hinter ihm steht also kein angemeldeter
     * Nutzer, `auth.getUser()` liefert nichts, und die Anfrage wurde mit 401
     * abgewiesen. Die Mail an den zweiten Kaeufer ging deshalb nie hinaus.
     *
     * Das ist ein alter Fehler, er bestand schon vor den Sicherheits-
     * aenderungen vom 16.09.2026. Frueher fiel er nur nicht auf: Die Function
     * liess damals jeden Angemeldeten durch, und `submit-sa-signature` hat den
     * Fehlschlag anschliessend nur ins Protokoll geschrieben.
     *
     * Statt die Anmeldepflicht aufzuweichen, reicht `submit-sa-signature` den
     * kundenbezogenen Nachweis durch, den sie ohnehin geprueft hat: den Token
     * aus dem Selbstauskunftslink. Er wird unten erneut gegen die Datenbank
     * geprueft und zaehlt nur fuer genau den Kontakt, zu dem er gehoert.
     *
     * Das Geheimwort ist die erste Huerde: Ohne `x-internal-secret` wird der
     * Token nicht einmal angesehen, ein Angreifer aus dem Internet kann diesen
     * Weg also gar nicht betreten. Dasselbe Muster laeuft seit langem in
     * `finalize-selbstauskunft`. Fehlt das Geheimwort in der Umgebung, bleibt
     * der Weg zu; er oeffnet sich nie von selbst.
     */
    const geheimwort = (Deno.env.get("INGEST_SHARED_SECRET") ?? "").trim();
    const mitgeschicktesGeheimwort = (req.headers.get("x-internal-secret") ?? "").trim();
    const nachweis = {
      token: typeof nachweisToken === "string" ? nachweisToken.trim() : "",
      vonFunctionZuFunction: geheimwort.length > 0 && mitgeschicktesGeheimwort === geheimwort,
    };
    const mitNachweis = nachweis.vonFunctionZuFunction && nachweis.token !== "";

    if (!mitNachweis && !authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader ?? "" } },
    });

    /*
     * Ohne Nachweis gilt unveraendert: Es muss ein angemeldeter Nutzer sein,
     * und er zaehlt gegen sein Rate-Limit. Der Weg mit Nachweis hat kein
     * eigenes Limit, weil er nicht beliebig oft begehbar ist: Der Fill-Token
     * wird in `submit-sa-signature` unmittelbar danach auf "used" gesetzt, ein
     * zweiter Versuch mit demselben Token laeuft dort in den Kurzschluss und
     * kommt hier nie an.
     */
    let caller: { id: string } | null = null;
    if (!mitNachweis) {
      const { data: { user } } = await callerClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      caller = user;

      // Rate-Limit: 20/h, 100/Tag pro Nutzer
      const rl = await checkRateLimit(req, caller.id, { scope: "send-signature-request", perHour: 20, perDay: 100 });
      if (!rl.ok) return rateLimitErrorBody("send-signature-request", rl, corsHeaders);
    }

    if (!kontaktId || !persons || persons.length === 0) {
      return new Response(
        JSON.stringify({ error: "kontaktId und persons sind Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    /*
     * Zweite Pruefung: darf DIESER Nutzer fuer DIESEN Kontakt handeln?
     *
     * Bis zum 16.09.2026 stand hier nur die Frage, ob ueberhaupt jemand
     * angemeldet ist. Wer angemeldet war, konnte mit einer fremden kontaktId
     * einen gueltigen Unterschriftslink zu einem fremden Vertrag anfordern und
     * ausserdem die offenen Anfragen dieses Kontakts loeschen (siehe unten).
     * Externes Audit vom 15.09.2026, Befund F03A. Die Begruendung der Regel
     * steht ausfuehrlich in ../_shared/kontakt-signatur-zugriff.ts.
     */
    const { erlaubt, kontakt } = await pruefeKontaktZugriff(
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      kontaktId, caller?.id ?? "", nachweis,
    );
    if (!erlaubt || !kontakt) {
      // Absichtlich dieselbe Antwort, egal ob es den Kontakt nicht gibt oder
      // der Nutzer nicht darf. Ein Unterschied waere eine Auskunft darueber,
      // welche Kennungen existieren.
      console.warn(
        `Signaturanfrage abgelehnt: ${caller ? `Nutzer ${caller.id}` : "Aufruf mit Nachweis-Token"} `
          + `darf nicht fuer Kontakt ${kontaktId} handeln.`,
      );
      return new Response(JSON.stringify({ error: ZUGRIFF_ABGELEHNT }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /*
     * Die Empfaenger aus dem gespeicherten Kontakt aufloesen, nicht aus dem
     * Aufruf. Sonst liesse sich eine Anfrage an eine beliebige Adresse
     * umleiten. Aus `persons` bleibt nur `personType` massgeblich, denn er
     * sagt, welche Unterschrift gemeint ist; `name` dient nur noch als
     * Rueckfall, falls am Kontakt kein Name steht.
     *
     * Das geschieht bewusst VOR dem Aufraeumen der offenen Anfragen: Fehlt
     * eine Adresse, soll der laufende Vorgang unangetastet bleiben statt
     * halb abgeraeumt liegenzubleiben.
     */
    const empfaenger: { personType: string; name: string; email: string }[] = [];
    for (const person of persons) {
      const personType = String(person?.personType ?? "").trim();
      if (!personType) {
        return new Response(
          JSON.stringify({ error: "Zu einer der Personen fehlt die Angabe, um welche Unterschrift es geht." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      /*
       * Nur die Selbstauskunft, als Positivliste (seit 29.09.2026). Vorher
       * wurde `personType` ungeprueft uebernommen; mit `rv_kaeufer1` liess
       * sich so eine Reservierungsanfrage anlegen, an den Pruefungen in
       * `send-reservation-signature` vorbei. Die Ablehnung steht vor jedem
       * Loeschen, Schreiben und Versenden.
       */
      if (!istSaPerson(personType)) {
        console.warn(`Signaturanfrage abgelehnt: personType "${personType}" gehoert nicht zur Selbstauskunft.`);
        return new Response(
          JSON.stringify({ error: "Ueber diesen Weg laesst sich nur die Unterschrift zur Selbstauskunft anfordern." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const aufgeloest = empfaengerAusKontakt(kontakt, personType);
      if (!emailIstBrauchbar(aufgeloest.email)) {
        const wen = aufgeloest.name || String(person?.name ?? "").trim() || "diese Person";
        return new Response(
          JSON.stringify({
            error: `Fuer ${wen} ist am Kontakt keine gueltige E-Mail-Adresse hinterlegt. `
              + `Bitte zuerst in den Stammdaten eintragen und danach erneut senden.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      empfaenger.push({
        personType,
        name: aufgeloest.name || String(person?.name ?? "").trim(),
        email: aufgeloest.email,
      });
    }

    /*
     * Zu welcher Fassung gehoert dieser Versand? (seit 26.09.2026, Befund HB-004)
     *
     * Die Regel steht in saFassungFuerVersand. Eine mitgeschickte Kennung
     * zaehlt nur auf dem Weg mit Nachweis, also aus `submit-sa-signature`.
     * Bei einer neuen Fassung werden die offenen Anfragen aller aelteren als
     * ueberholt markiert, bevor die neuen angelegt werden. Scheitert das,
     * bricht der Versand ab, statt zwei Fassungen offen nebeneinander liegen
     * zu lassen.
     */
    let bestehendeQuery = supabase
      .from("signature_requests")
      .select("person_type, status, created_at, meta, sa_data")
      .eq("kontakt_id", kontaktId)
      .in("person_type", [...SA_PERSON_TYPEN]);
    bestehendeQuery = investmentId
      ? bestehendeQuery.eq("investment_id", investmentId)
      : bestehendeQuery.is("investment_id", null);
    const { data: bestehende, error: bestehendeFehler } = await bestehendeQuery;
    if (bestehendeFehler) {
      console.error("Bestehende Signaturanfragen nicht lesbar:", bestehendeFehler);
      return new Response(
        JSON.stringify({ error: "Die Signaturanfrage konnte gerade nicht angelegt werden, bitte erneut versuchen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const versandFassung = saFassungFuerVersand({
      vorgegeben: mitNachweis && typeof saFassungRoh === "string" ? saFassungRoh : null,
      bestehende: bestehende ?? [],
      empfaengerTypen: empfaenger.map((p) => p.personType),
      saData,
      neueKennung: crypto.randomUUID(),
    });
    saData = versandFassung.saData;
    if (versandFassung.neu && versandFassung.fassung) {
      const { error: ueberholtFehler } = await saAeltereFassungenUeberholen(supabase, {
        kontaktId,
        investmentId: investmentId || null,
        fassung: versandFassung.fassung,
      });
      if (ueberholtFehler) {
        console.error("Aeltere Fassungen nicht als ueberholt markiert:", ueberholtFehler);
        return new Response(
          JSON.stringify({ error: "Die Signaturanfrage konnte gerade nicht angelegt werden, bitte erneut versuchen." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Ohne `token`: Mit ihm liesse sich ueber die oeffentliche Seite im Namen
    // des Kunden unterschreiben, der Browser braucht ihn nicht (29.09.2026).
    const results: { personType: string; email: string; sent: boolean; grund?: string }[] = [];

    // Alte, noch offene Signaturanfragen dieser Selbstauskunft entfernen.
    // Sonst bleiben beim erneuten Versand veraltete Links gueltig und die
    // offenen Restzeilen blockieren spaeter den Abschluss der Selbstauskunft,
    // weil dort geprueft wird, ob wirklich alle Anfragen unterschrieben sind.
    /*
     * Nur die Anfragen der Personen, die jetzt einen neuen Link bekommen
     * (seit 26.09.2026). Vorher traf das Loeschen alle offenen Anfragen des
     * Investments. Ging "Neuen Link senden" nur an Person 1, verschwand damit
     * auch die offene Anfrage von Person 2, und die Selbstauskunft schloss
     * nach der Unterschrift von Person 1 ab, ohne dass Person 2 je
     * unterschrieben hatte. Siehe saAufzuraeumendePersonTypen.
     */
    {
      let staleQuery = supabase
        .from("signature_requests")
        .delete()
        .eq("kontakt_id", kontaktId)
        .eq("status", "pending")
        .not("person_type", "like", "rv_%")
        .in("person_type", saAufzuraeumendePersonTypen(empfaenger.map((p) => p.personType)));
      if (investmentId) staleQuery = staleQuery.eq("investment_id", investmentId);
      const { error: staleError } = await staleQuery;
      if (staleError) {
        console.error("Failed to clear pending signature requests:", staleError);
      }
    }

    /*
     * Den Betreuer einmal laden, nicht je Person.
     *
     * Er haengt am Kontakt, nicht an der einzelnen Unterschrift, und bei
     * Ehepaaren waeren es sonst zwei gleiche Abfragen.
     */
    const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);

    for (const person of empfaenger) {
      const token = crypto.randomUUID();
      // Frist zentral, siehe ../_shared/signatur-frist.ts.
      const expiresAt = signaturAblauf();

      const { error: insertError } = await supabase
        .from("signature_requests")
        .insert({
          token,
          kontakt_id: kontaktId,
          investment_id: investmentId || null,
          name: person.name,
          email: person.email,
          person_type: person.personType,
          sa_data: saData,
          status: "pending",
          expires_at: expiresAt,
          // Ohne Fassung (Bestand) bleibt meta leer wie bisher.
          ...(versandFassung.fassung ? { meta: { saFassung: versandFassung.fassung } } : {}),
        });

      if (insertError) {
        console.error(`Failed to create signature request for ${person.personType}:`, insertError);
        results.push({ personType: person.personType, email: person.email, sent: false });
        continue;
      }

      const signatureLink = `${SIGNATURE_BASE_URL}?token=${token}`;

      /*
       * Ueber sendeVorlage statt direkt ueber functions.invoke.
       *
       * `invoke` meldet nur dann einen Fehler, wenn die aufgerufene Function
       * einen Status ab 400 liefert. send-transactional-email antwortet aber
       * mit Status 200 und `{ success: false, reason: 'email_suppressed' }`,
       * wenn die Adresse auf der Sperrliste steht.
       *
       * Genau das ist hier passiert: Das CRM meldete "1/1 Signaturanfrage
       * versendet", das Investment sprang auf "unterschrift_versendet", und
       * der Kunde hat nie eine Mail bekommen. Gemeldet bei Kai Laube. Weil
       * alles nach Erfolg aussah, hat niemand nachgefasst.
       */
      const versand = await sendeVorlage(supabase, {
        templateName: "selbstauskunft-signatur",
        recipientEmail: person.email,
        idempotencyKey: `sa-sig-${token}`,
        templateData: {
          name: person.name,
          // Die Vorlage heisst dieses Feld signUrl.
          signUrl: signatureLink,
          // Seit der echten Frist sagt die Mail, bis wann der Link gilt. Die
          // Vorlage kann das Feld seit jeher, bekam es aber nie.
          gueltigBis: signaturAblaufText(expiresAt),
          // Ohne diesen Wert unterschreibt "OS Immobilien Team" statt des
          // Betreuers. Fehlt der Betreuer, faellt die Vorlage selbst zurueck.
          ...(berater ? { berater } : {}),
        },
        // Ohne angemeldeten Nutzer steht in der Spur, welche Function
        // ausgeloest hat. Sonst stuende dort nichts und die Herkunft waere weg.
        metadata: {
          kontakt_id: kontaktId, person_type: person.personType, token,
          sent_by: caller?.id ?? "submit-sa-signature",
        },
      });

      if (!versand.ok) {
        console.error(`Signaturmail an ${person.email} ging nicht hinaus: ${versand.grund}`);
        results.push({
          personType: person.personType, email: person.email,
          sent: false, grund: versand.grund,
        });
      } else {
        console.log(`Signature request queued for ${person.email} (${person.personType})`);
        results.push({ personType: person.personType, email: person.email, sent: true });
      }
    }

    /*
     * Den Vorgang nur dann als "Unterschrift versendet" markieren, wenn
     * mindestens eine Mail tatsaechlich hinausging. Sonst steht in der Akte
     * ein Stand, den es nie gab, und der Berater wartet auf eine Antwort zu
     * einer Mail, die niemand bekommen hat.
     */
    const irgendwasVersendet = results.some((r) => r.sent);

    if (investmentId && irgendwasVersendet) {
      const { data: investmentRow, error: investmentFetchError } = await supabase
        .from("investments")
        .select("meta")
        .eq("id", investmentId)
        .maybeSingle();

      if (investmentFetchError) {
        console.error("Failed to load investment for signature flow:", investmentFetchError);
      } else if (investmentRow) {
        const currentMeta = ((investmentRow.meta as Record<string, unknown> | null) ?? {}) as Record<string, any>;
        const currentPipeline = typeof currentMeta.pipelineStufe === "string" ? currentMeta.pipelineStufe : "";
        const currentDocStatuses = currentMeta.docStatuses && typeof currentMeta.docStatuses === "object"
          ? currentMeta.docStatuses as Record<string, string>
          : {};

        /*
         * Geht eine schon fertige Selbstauskunft neu zur Unterschrift, gilt
         * der alte Abschluss nicht mehr (seit 26.09.2026). Bis dahin blieben
         * `saPdf`, der Dokumentstatus "approved" und die alten Unterschriften
         * stehen, und das Kundenprofil zeigte die Selbstauskunft weiter als
         * erledigt. Die Pipelinestufe bleibt unberuehrt, siehe unten.
         */
        const korrektur = saKorrekturMetaPatch(currentMeta, new Date().toISOString());
        const istKorrektur = Object.keys(korrektur).length > 0;

        const nextMeta = {
          ...currentMeta,
          ...korrektur,
          saData,
          saSignaturePending: true,
          saSigned: false,
          saSignedAt: null,
          saEditStatus: "unterschrift_versendet",
          // Wann die Unterschrift zuletzt angefordert wurde. Wird bei jedem
          // erneuten Versand ueberschrieben, damit in der Akte steht, seit
          // wann tatsaechlich gewartet wird, und nicht seit wann irgendwann
          // einmal etwas hinausging.
          saSignatureSentAt: new Date().toISOString(),
          /*
           * "selbstauskunft", nicht "bonitaetsunterlagen".
           *
           * Seit die Reihenfolge gedreht ist, liegt die Bonitaet hinter
           * Objektauswahl und Reservierung. Wer hier auf "bonitaetsunterlagen"
           * setzt, schiebt den Kunden ueber zwei Stufen, die er nie
           * durchlaufen hat, und die Phasenkacheln dafuer stuenden auf
           * "erledigt".
           */
          pipelineStufe: !currentPipeline || VOR_SELBSTAUSKUNFT.has(currentPipeline)
            ? "selbstauskunft"
            : currentPipeline,
          docStatuses: {
            ...currentDocStatuses,
            // Nach einer Korrektur ist die neue Fassung noch nicht unterschrieben.
            Selbstauskunft: currentDocStatuses.Selbstauskunft === "approved" && !istKorrektur ? "approved" : "uploaded",
          },
        };

        const { error: investmentUpdateError } = await supabase
          .from("investments")
          .update({ meta: nextMeta })
          .eq("id", investmentId);

        if (investmentUpdateError) {
          console.error("Failed to persist signature workflow state:", investmentUpdateError);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
