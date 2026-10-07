import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { logActivityFromEdge } from "../_shared/activity-log.ts";
import { sendeVorlage } from '../_shared/transactional-versand.ts';
import { zustaendigerAnsprechpartner } from '../_shared/zustaendiger-ansprechpartner.ts';
import { signaturAblauf, signaturAblaufText } from "../_shared/signatur-frist.ts";
import {
  emailIstBrauchbar,
  empfaengerAusKontakt,
  pruefeKontaktZugriff,
  ZUGRIFF_ABGELEHNT,
} from '../_shared/kontakt-signatur-zugriff.ts';
import {
  pruefeReservierungsVoraussetzungen,
  RV_ALLGEMEINER_FEHLER,
  RV_OHNE_INVESTMENT,
} from '../_shared/reservierung-voraussetzungen.ts';
import {
  darfReservierungVersenden,
  erwarteteRvKaeufer,
  RV_BEREITS_UNTERSCHRIEBEN,
  RV_UEBERHOLT_SCHLUESSEL,
  RV_VERSAND_NICHT_ERLAUBT,
  reservierungVollstaendigUnterschrieben,
} from '../_shared/reservierung-anfragerunde.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: "Nicht autorisiert" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate-Limit: 10/h, 50/Tag pro Nutzer
    const rl = await checkRateLimit(req, caller.id, { scope: "send-reservation-signature", perHour: 10, perDay: 50 });
    if (!rl.ok) return rateLimitErrorBody("send-reservation-signature", rl, corsHeaders);

    const { kontaktId, investmentId, rvData, persons } = await req.json();

    if (!kontaktId || !persons || persons.length === 0) {
      return new Response(
        JSON.stringify({ error: "kontaktId und persons sind Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // Seit 29.09.2026 Pflicht: Ohne Investment liesse sich weder die
    // Selbstauskunft noch das Objekt pruefen.
    if (typeof investmentId !== "string" || !investmentId.trim()) {
      return new Response(
        JSON.stringify({ error: RV_OHNE_INVESTMENT }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    /*
     * Erste Pruefung (seit 05.10.2026): die Rolle. Bis dahin reichte
     * `pruefeKontaktZugriff`; die Regel steht in
     * ../_shared/reservierung-anfragerunde.ts.
     */
    {
      const { data: rollen, error: rollenFehler } = await supabase
        .from("user_roles").select("role").eq("user_id", caller.id);
      if (rollenFehler || !darfReservierungVersenden(((rollen || []) as Array<{ role?: unknown }>).map((r) => r.role))) {
        return new Response(JSON.stringify({ error: RV_VERSAND_NICHT_ERLAUBT }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    /*
     * Zweite Pruefung: darf DIESER Nutzer fuer DIESEN Kontakt handeln?
     *
     * Dieselbe Bauweise wie in send-signature-request und damit dieselbe
     * Luecke: Bis zum 16.09.2026 reichte irgendeine Anmeldung, um mit einer
     * fremden kontaktId eine Reservierungsvereinbarung zur Unterschrift zu
     * verschicken. Externes Audit vom 15.09.2026, Befund F03A. Die Begruendung
     * der Regel steht in ../_shared/kontakt-signatur-zugriff.ts.
     */
    const { erlaubt, kontakt } = await pruefeKontaktZugriff(
      // Lose beschriebene Helfer-Clients, wie in send-kunden-expose.
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      kontaktId,
      caller.id,
    );
    if (!erlaubt || !kontakt) {
      // Neutrale Ablehnung: kein Unterschied zwischen "gibt es nicht" und
      // "darfst du nicht", sonst verraet die Antwort fremde Kennungen.
      console.warn(
        `Reservierungsunterschrift abgelehnt: Nutzer ${caller.id} darf nicht fuer Kontakt ${kontaktId} handeln.`,
      );
      return new Response(JSON.stringify({ error: ZUGRIFF_ABGELEHNT }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /*
     * Dritte Pruefung (seit 29.09.2026): gehoert das Investment zu diesem
     * Kontakt, ist die Selbstauskunft erledigt und ein Objekt eingetragen?
     *
     * Vorher schrieb die Function in jedes Investment, dessen Kennung im
     * Aufruf stand, auch in ein fremdes, und raeumte dessen offene Anfragen
     * ab. Die Ablaufregeln standen nur in der Oberflaeche. Die Regel selbst
     * steht in ../_shared/reservierung-voraussetzungen.ts, die Oberflaeche
     * liest dieselbe. Geprueft wird vor dem ersten Loeschen oder Schreiben.
     */
    const { data: investmentZeile, error: investmentFehler } = await supabase
      .from("investments")
      .select("kunde_id, meta, wohnung")
      .eq("id", investmentId)
      .maybeSingle();
    if (investmentFehler) throw investmentFehler;
    const pruefung = pruefeReservierungsVoraussetzungen(kontaktId, investmentZeile);
    if (!pruefung.ok) {
      console.warn(
        `Reservierungsunterschrift abgelehnt (${pruefung.status}): Nutzer ${caller.id}, Kontakt ${kontaktId}, Investment ${investmentId}: ${pruefung.fehler}`,
      );
      return new Response(JSON.stringify({ error: pruefung.fehler }), {
        status: pruefung.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Eine fertige Reservierung wird nicht still ersetzt. 409 statt 403, damit
    // die Oberflaeche den Satz zeigt (siehe `pruefeReservierungsVoraussetzungen`).
    if (reservierungVollstaendigUnterschrieben(investmentZeile?.meta)) {
      return new Response(JSON.stringify({ error: RV_BEREITS_UNTERSCHRIEBEN }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /*
     * Empfaenger aus dem gespeicherten Kontakt, nicht aus dem Aufruf. Aus
     * `persons` bleibt `personType` massgeblich (kaeufer1, kaeufer2), `name`
     * dient nur noch als Rueckfall, wenn am Kontakt kein Name steht.
     *
     * Vorab und vollstaendig, bevor die erste Anfrage angelegt wird: Fehlt
     * eine Adresse, soll kein halber Vorgang entstehen, bei dem Kaeufer 1
     * schon eine Anfrage hat und Kaeufer 2 nicht.
     */
    const empfaenger: { personType: string; name: string; email: string }[] = [];
    /*
     * Wer unterschreiben muss, steht in den Vertragsdaten, nicht in `persons`
     * (05.10.2026): Käufer 1 immer, Käufer 2 mit `hatPerson2`. Aus `persons`
     * kommt nur noch der Name als Rückfall.
     */
    for (const personType of erwarteteRvKaeufer(rvData)) {
      const person = (persons as Array<{ personType?: unknown; name?: unknown }>)
        .find((p) => String(p?.personType ?? "").trim() === personType);
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

    // Ohne `token`: Mit ihm liesse sich ueber die oeffentliche Seite im Namen
    // des Kunden unterschreiben, der Browser braucht ihn nicht (29.09.2026).
    const results: { personType: string; email: string; sent: boolean; grund?: string }[] = [];

    const objektTitel: string | undefined =
      (rvData?.objektTitel as string | undefined) ||
      (rvData?.objekt as string | undefined) ||
      undefined;

    /*
     * Alte, noch offene Reservierungsanfragen dieses Kontakts entfernen.
     *
     * Erneut zusenden heisst: der bisherige Link gilt nicht mehr. Erwischt der
     * Kunde die alte Mail, soll sie ins Leere laufen und er die neue nehmen.
     * Genauso macht es `send-signature-request` seit jeher fuer die
     * Selbstauskunft; bis zum 16.09.2026 raeumte hier stattdessen das
     * Kundenprofil selbst auf, und wer den Versand aus dem Formular anstiess,
     * hinterliess zwei gueltige Links.
     *
     * Nur `rv_%`: In derselben Tabelle liegen Selbstauskuenfte und Vertraege.
     * Geloescht wird nur `pending`. Unterschriebenes bleibt als Nachweis
     * stehen und wird seit dem 05.10.2026 als ueberholt markiert.
     */
    {
      /*
       * Schon unterschriebene Anfragen dieses Investments gehoeren zur alten
       * Runde. Sie bleiben als Nachweis stehen, zaehlen aber nicht mehr fuer
       * die neue (`aktuelleRvAnfragen` in finalize-reservierung).
       */
      const { data: alteUnterschriften, error: lesenFehler } = await supabase
        .from("signature_requests")
        .select("id, meta")
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId)
        .eq("status", "signed")
        .like("person_type", "rv_%");
      if (lesenFehler) throw lesenFehler;
      const ueberholtAm = new Date().toISOString();
      for (const alt of alteUnterschriften ?? []) {
        const meta = (alt.meta && typeof alt.meta === "object" ? alt.meta : {}) as Record<string, unknown>;
        if (meta[RV_UEBERHOLT_SCHLUESSEL]) continue;
        const { error: markFehler } = await supabase
          .from("signature_requests")
          .update({ meta: { ...meta, [RV_UEBERHOLT_SCHLUESSEL]: ueberholtAm } })
          .eq("id", alt.id);
        // Ohne Markierung zaehlte die alte Unterschrift mit, dann lieber gar nicht senden.
        if (markFehler) throw markFehler;
      }

      const { error: alteFehler } = await supabase
        .from("signature_requests")
        .delete()
        .eq("kontakt_id", kontaktId)
        .eq("investment_id", investmentId)
        .eq("status", "pending")
        .like("person_type", "rv_%");
      if (alteFehler) {
        console.error("Offene Reservierungsanfragen nicht entfernt:", alteFehler);
      }
    }

    // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die Mail
    // den Platzhalter "OS Immobilien Team".
    const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);

    /*
     * Erst alle Anfragen der Runde anlegen, dann mailen (05.10.2026). Scheitert
     * eine, wird die Runde wieder entfernt und keine Mail verschickt, sonst
     * entstuende eine Runde, in der ein Käufer nie unterschreiben kann.
     */
    const angelegt: { person: typeof empfaenger[number]; token: string; expiresAt: string }[] = [];
    for (const person of empfaenger) {
      const token = crypto.randomUUID();
      /*
       * Der Reservierungslink hat seit dem 16.09.2026 eine echte Frist.
       *
       * Vorher stand hier ein Zeitpunkt zehn Jahre in der Zukunft, weil die
       * Spalte NOT NULL ist und sieben Tage als zu knapp galten: Wer sich
       * spaet entscheidet, klickte ins Leere. Christian hat das anders
       * entschieden. Beide Unterschriftslinks gelten vierzehn Tage, und laeuft
       * die Frist ab, sendet der Partner im Investment einen neuen Link mit
       * voller Frist. Nachgefasst wird weiterhin ueber
       * `send-reservierung-eskalation`, die Aufgabe an den Berater entsteht am
       * selben Tag, an dem der Link ablaeuft.
       */
      const expiresAt = signaturAblauf();

      const { error: insertError } = await supabase
        .from("signature_requests")
        .insert({
          token,
          kontakt_id: kontaktId,
          investment_id: investmentId,
          name: person.name,
          email: person.email,
          person_type: `rv_${person.personType}`,
          sa_data: rvData,
          status: "pending",
          expires_at: expiresAt,
        });

      if (insertError) {
        console.error(`Failed to create reservation signature request for ${person.personType}:`, insertError);
        if (angelegt.length > 0) {
          const { error: rueckFehler } = await supabase
            .from("signature_requests")
            .delete()
            .in("token", angelegt.map((a) => a.token));
          if (rueckFehler) console.error("Angelegte Anfragen nicht entfernt:", rueckFehler);
        }
        return new Response(JSON.stringify({ error: RV_ALLGEMEINER_FEHLER }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      angelegt.push({ person, token, expiresAt });
    }

    for (const { person, token, expiresAt } of angelegt) {
      const signatureLink = `${SIGNATURE_BASE_URL}?token=${token}&type=reservierung`;
      /*
       * Ueber sendeVorlage statt direkt ueber functions.invoke.
       *
       * `invoke` meldet nur einen Fehler ab Status 400.
       * send-transactional-email antwortet aber mit Status 200 und
       * `{ success: false, reason: 'email_suppressed' }`, wenn die Adresse auf
       * der Sperrliste steht. Der Fehlschlag sah dadurch wie Erfolg aus.
       * Gefunden ueber den Fall Kai Laube in send-signature-request.
       */
      const versand = await sendeVorlage(supabase, {
        templateName: 'reservierung-signatur',
        recipientEmail: person.email,
        idempotencyKey: `rv-sig-${token}`,
        templateData: {
          name: person.name,
          // Die Vorlage heisst dieses Feld signUrl.
          signUrl: signatureLink,
          // Seit der echten Frist sagt die Mail, bis wann der Link gilt. Die
          // Vorlage kann das Feld seit jeher, bekam es aber nie.
          gueltigBis: signaturAblaufText(expiresAt),
          objektTitel,
          ...(berater ? { berater } : {}),
        },
        metadata: { kontakt_id: kontaktId, investment_id: investmentId, person_type: person.personType },
      });
      const sendError = versand.ok ? null : new Error(versand.grund || 'Versand fehlgeschlagen');

      if (sendError) {
        console.error(`Failed to send reservation signature email for ${person.email}:`, sendError);
        // Grund mitgeben, damit die Kundenakte ihn anzeigen kann.
        results.push({ personType: person.personType, email: person.email, sent: false, grund: versand.grund });
      } else {
        console.log(`Reservation signature email queued for ${person.email}`);
        results.push({ personType: person.personType, email: person.email, sent: true });
      }
    }

    /*
     * Ein Protokolleintrag je Vorgang, nicht je Kaeufer.
     *
     * Er stand bis zum 22.09.2026 mitten in der Schleife, bei einem Paar also
     * zweimal, und trug den Schluessel `reservierung_pdf_created`, angezeigt
     * als „Reservierungs-PDF erstellt". Hier geht aber nur eine Mail zur
     * Unterschrift hinaus; das PDF entsteht erst mit der Unterschrift, in
     * `finalize-reservierung`. Der alte Schluessel bleibt in `activityLog.ts`
     * lesbar, damit die bereits geschriebenen Eintraege nicht verstummen.
     */
    const versendetAn = results.filter((r) => r.sent).map((r) => r.email);
    if (versendetAn.length > 0) {
      await logActivityFromEdge(supabase, {
        kontaktId,
        actorId: caller.id,
        action: "reservierung_signatur_versendet",
        entityType: "email",
        meta: {
          template: "reservierung-signatur",
          empfaenger: versendetAn,
          anzahl: versendetAn.length,
          investmentId,
          objektTitel,
        },
        source: "edge:send-reservation-signature",
      });
    }

    {
      const { data: investmentRow } = await supabase
        .from("investments")
        .select("meta")
        .eq("id", investmentId)
        .maybeSingle();

      if (investmentRow) {
        const currentMeta = ((investmentRow.meta as Record<string, unknown> | null) ?? {}) as Record<string, any>;
        const nextMeta = {
          ...currentMeta,
          rvData,
          rvSignaturePending: true,
          rvSigned: false,
          rvSignedAt: null,
          rvSignatureSentAt: new Date().toISOString(),
          // Neue Runde, neue Kopie: der Riegel aus der alten Runde gilt nicht mehr.
          rvKopieVersandtAm: null,
          rvKopieEmpfaenger: null,
        };

        await supabase
          .from("investments")
          .update({ meta: nextMeta })
          .eq("id", investmentId);
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    // Details nur ins Protokoll, nach aussen ein fester Satz: Eine rohe
    // Fehlermeldung kann Tabellen- und Spaltennamen verraten.
    console.error("send-reservation-signature:", error);
    return new Response(
      JSON.stringify({ error: RV_ALLGEMEINER_FEHLER }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
