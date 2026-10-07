import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  saAeltereFassungenUeberholen,
  saNeueFassungMetaPatch,
} from "../_shared/selbstauskunft-geltende-unterschrift.ts";
import { rpcFehlt, saDatenFuerPerson, saSignaturErlaubt } from "../_shared/sa-fester-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      token,         // SA fill token to validate the request
      kontaktId,
      investmentId,
      saData,
      signatures,    // Array of { personType, name, email, signatureData }
      p2ViaEmail,    // If true, send Person 2 signature request via email
    } = await req.json();

    if (!token || !kontaktId || !signatures || signatures.length === 0) {
      return new Response(
        JSON.stringify({ error: "Pflichtfelder fehlen (token, kontaktId, signatures)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("sa_fill_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({ error: "Ungültiger Token" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
     * Der Link gilt nur fuer den Kunden und das Investment, fuer die er
     * angelegt wurde (26.09.2026, Sicherheitspruefung Handbuch-Seite).
     *
     * Vorher genuegte irgendein gueltiger Link, und Kunde und Investment
     * kamen aus dem Rumpf. Seit der Handbuch-Seite bekommt jeder Besucher
     * einen eigenen gueltigen Link; damit haette er in ein fremdes Investment,
     * dessen Kennung er kennt, eine Selbstauskunft samt Unterschrift schreiben
     * koennen. Die rechtmaessige Seite schickt ohnehin genau die Werte des
     * Links mit (`SelbstauskunftPublic` uebergibt sie aus `get_sa_fill_token`).
     */
    if (
      String(tokenData.kontakt_id ?? "") !== String(kontaktId ?? "") ||
      (investmentId && tokenData.investment_id && String(tokenData.investment_id) !== String(investmentId))
    ) {
      return new Response(
        JSON.stringify({ error: "Der Link passt nicht zu dieser Selbstauskunft." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
     * Person 2 bekommt ihre Unterschrift per Mail.
     *
     * Zwei Dinge sind hier am 16.09.2026 in Ordnung gebracht worden:
     *
     * 1. Der Aufruf laeuft mit dem Service-Role-Schluessel, hinter ihm steht
     *    also kein angemeldeter Nutzer. `send-signature-request` hat ihn
     *    deshalb mit 401 abgewiesen, die Mail ging nie hinaus. Jetzt wird der
     *    Token der Selbstauskunft als Nachweis durchgereicht, zusammen mit dem
     *    gemeinsamen Geheimwort im Kopf. Beides zusammen oeffnet dort den
     *    dritten Zweig der Berechtigungspruefung. Der Fehler bestand schon
     *    vorher, er fiel nur nicht auf.
     *
     * 2. Der Fehlschlag wurde bisher nur ins Protokoll geschrieben. Fuer den
     *    ersten Kaeufer sah alles nach Erfolg aus, und der zweite wartete auf
     *    eine Mail, die nie kommen konnte. Das Ergebnis wandert deshalb in die
     *    Antwort, damit die Oberflaeche es sagen kann.
     *
     * Wichtig dabei: `invoke` meldet nur einen Fehler, wenn die Gegenseite
     * einen Status ab 400 liefert. `send-signature-request` antwortet aber mit
     * 200 und `results[].sent === false`, wenn die Mail zwar angelegt, aber
     * nicht versendet wurde (etwa Sperrliste). Beides wird deshalb geprueft.
     *
     * Seit 07.10.2026 nachholbar: Der Vermerk `p2_nachforderung_am` am Link
     * steht erst nach erfolgreichem Versand. Bricht die Function nach dem
     * Abschluss ab, holt der naechste Aufruf (Link schon `used`) die Mail
     * nach, statt sie dauerhaft zu ueberspringen. Der Idempotenzschluessel
     * der Mail bleibt bei `send-signature-request`. Ein Link fuer Person 2
     * fordert keine Mail an Person 2 an.
     */
    type P2Mail = { versendet: boolean; grund: string | null } | null;
    const p2PerMail = Number(tokenData.person_nr) === 2 ? null : p2ViaEmail;
    // Ohne Migration fehlt die Spalte; dann wird nichts nachgeholt, wie bisher.
    const p2NachforderungOffen = !!p2PerMail?.email
      && Object.prototype.hasOwnProperty.call(tokenData, "p2_nachforderung_am")
      && !tokenData.p2_nachforderung_am;
    const p2Nachfordern = async (daten: unknown): Promise<P2Mail> => {
      if (!(p2PerMail && p2PerMail.name && p2PerMail.email)) return null;
      let p2Mail: P2Mail;
      const { data: sigReqData, error: sigReqErr } = await supabase.functions.invoke("send-signature-request", {
        body: {
          kontaktId,
          investmentId,
          saData: daten,
          persons: [{ name: p2PerMail.name, email: p2PerMail.email, personType: "person2" }],
          nachweisToken: token,
          // Die Anfrage an Person 2 gehoert zu genau dieser Fassung.
          saFassung: String(tokenData.id),
        },
        headers: { "x-internal-secret": Deno.env.get("INGEST_SHARED_SECRET") ?? "" },
      });

      if (sigReqErr) {
        console.error("Failed to send P2 signature request:", sigReqErr);
        // Den Grund aus der Antwort holen, nicht nur "FunctionsHttpError".
        // Nur dieser Text hilft dem Kunden und dem Team weiter.
        let grund = sigReqErr instanceof Error ? sigReqErr.message : String(sigReqErr);
        try {
          const antwort = (sigReqErr as any)?.context;
          if (antwort && typeof antwort.json === "function") {
            const koerper = await antwort.json();
            if (koerper?.error) grund = String(koerper.error);
          }
        } catch (leseFehler) {
          console.error("Antworttext der Signaturanfrage nicht lesbar:", leseFehler);
        }
        p2Mail = { versendet: false, grund: grund.slice(0, 300) };
      } else {
        const ergebnisse = ((sigReqData as any)?.results ?? []) as { sent?: boolean; grund?: string }[];
        const versendet = ergebnisse.some((e) => e?.sent === true);
        if (versendet) {
          p2Mail = { versendet: true, grund: null };
        } else {
          const grund = ergebnisse.find((e) => e?.grund)?.grund
            ?? "Die Mail wurde nicht versendet, einen Grund hat der Server nicht genannt.";
          console.error("P2 signature mail not sent:", grund);
          p2Mail = { versendet: false, grund: String(grund).slice(0, 300) };
        }
      }

      if (p2Mail.versendet) {
        const { error: vermerkFehler } = await supabase
          .from("sa_fill_tokens")
          .update({ p2_nachforderung_am: new Date().toISOString() })
          .eq("token", token);
        if (vermerkFehler) console.warn("Vermerk zur Mail an Person 2 nicht gesetzt:", vermerkFehler);
      }
      return p2Mail;
    };

    // IDEMPOTENZ: Wenn der Token bereits verwendet wurde (z. B. durch einen
    // automatischen Retry nach Netzwerk-Glitch), nicht hart abbrechen, sondern
    // den Stand des bereits gespeicherten Vorgangs zurückgeben. So sieht der
    // Kunde keinen irreführenden "Speichern fehlgeschlagen"-Toast.
    if (tokenData.status === "used") {
      const p2Mail = p2NachforderungOffen ? await p2Nachfordern(saData) : null;
      let alreadyFinalized: any = null;
      try {
        const { data: fResult } = await supabase.functions.invoke("finalize-selbstauskunft", {
          body: { investmentId, kontaktId, saFillToken: token },
          headers: { "x-internal-secret": Deno.env.get("INGEST_SHARED_SECRET") ?? "" },
        });
        alreadyFinalized = fResult;
      } catch (err) {
        console.error("Finalize (idempotent retry) error:", err);
      }
      return new Response(
        JSON.stringify({
          success: true,
          alreadyProcessed: true,
          allSigned: alreadyFinalized?.allSigned ?? true,
          signedCount: alreadyFinalized?.signedCount ?? signatures.length,
          totalRequests: alreadyFinalized?.totalRequests ?? signatures.length,
          p2Mail,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Widerrufen (anderer Empfaenger, seit 07.10.2026) oder sonst nicht offen:
    // nichts annehmen.
    if (tokenData.status !== "pending") {
      return new Response(
        JSON.stringify({ error: "Dieser Link gilt nicht mehr." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Token abgelaufen" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
     * Die Unterschrift gehoert zur Person des Links (07.10.2026): Ein Link fuer
     * Person 2 reicht nur die Unterschrift von Person 2 ein und loest keine
     * Mail an Person 2 aus. Der Link fuer Person 1 bleibt wie bisher. Dieselbe
     * Regel prueft `sa_link_abschliessen` noch einmal unter der Sperre.
     */
    const personNrLink = Number(tokenData.person_nr) === 2 ? 2 : 1;
    if (!(signatures as { personType?: unknown }[]).every((sig) => saSignaturErlaubt(personNrLink, sig?.personType))) {
      return new Response(
        JSON.stringify({ error: "Diese Unterschrift gehört nicht zu diesem Link." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = new Date().toISOString();
    const consentBase = "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben in der Selbstauskunft.";

    /*
     * Neue Fassung einer schon fertigen Selbstauskunft (seit 26.09.2026).
     *
     * Kommt ueber einen neuen Ausfuell-Link eine Selbstauskunft herein, die am
     * Investment schon unterschrieben ist, sind das neue Angaben mit neuer
     * Unterschrift. Bis dahin blieb der alte Abschluss stehen: Die neue
     * Unterschrift wurde unten uebersprungen, `finalize-selbstauskunft`
     * meldete "bereits abgeschlossen", und am Investment standen die neuen
     * Angaben mit der alten Unterschrift.
     *
     * Jetzt wird der alte Abschluss zuerst abgeloest, genau wie beim Neuversand
     * ueber `send-signature-request`: alter Stand nach `saVorigeFassung`,
     * Vermerk `saNeueUnterschriftSeit`. Der Vermerk traegt denselben
     * Zeitpunkt wie die Unterschriften unten, damit sie zur neuen Fassung
     * zaehlen. Die alte PDF bleibt als Nachweis im Speicher liegen.
     *
     * Das geschieht vor dem Speichern der Unterschriften und vor der Mail an
     * Person 2. Scheitert es, bricht der Vorgang ab, statt neue Angaben unter
     * einen alten Abschluss zu legen; der Kunde kann es erneut versuchen.
     */
    if (investmentId) {
      const { data: invVorher, error: invVorherFehler } = await supabase
        .from("investments")
        .select("meta")
        .eq("id", investmentId)
        .maybeSingle();
      if (invVorherFehler) {
        console.error("Investment vor der Unterschrift nicht lesbar:", invVorherFehler);
        return new Response(
          JSON.stringify({ error: "Die Selbstauskunft konnte gerade nicht gespeichert werden, bitte erneut versuchen." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const metaVorher = (invVorher?.meta as Record<string, any>) || {};
      const neueFassung = saNeueFassungMetaPatch(metaVorher, now);
      if (Object.keys(neueFassung).length > 0) {
        const { error: fassungFehler } = await supabase
          .from("investments")
          .update({ meta: { ...metaVorher, ...neueFassung } })
          .eq("id", investmentId);
        if (fassungFehler) {
          console.error("Neue Fassung der Selbstauskunft nicht angelegt:", fassungFehler);
          return new Response(
            JSON.stringify({ error: "Die Selbstauskunft konnte gerade nicht gespeichert werden, bitte erneut versuchen." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    /*
     * Diese Einsendung ist eine eigene Fassung (seit 26.09.2026, Befund HB-004).
     *
     * Kennung ist die Zeile des Ausfuell-Links. Jeder Link wird genau einmal
     * abgeschickt (danach steht er auf "used"), eine Kennung meint also genau
     * einen Satz Angaben. Unterschriften und die Anfrage an Person 2 tragen sie
     * in `meta.saFassung`, und `finalize-selbstauskunft` schliesst nur ab, wenn
     * alle erwarteten Personen dieselbe Fassung unterschrieben haben.
     *
     * Offene Anfragen aelterer Fassungen werden vorher als ueberholt markiert,
     * etwa der Link an Person 2 aus einem frueheren Ausfuell-Link. Wer ihn
     * oeffnet, sieht einen Hinweis und kann ihn nicht mehr unterschreiben; die
     * Anfrage zur neuen Fassung geht unten an Person 2 hinaus. Scheitert das
     * Markieren, bricht der Vorgang ab, bevor etwas gespeichert ist.
     */
    const saFassung = String(tokenData.id);
    {
      const { error: ueberholtFehler } = await saAeltereFassungenUeberholen(supabase, {
        kontaktId,
        investmentId: investmentId || null,
        fassung: saFassung,
      });
      if (ueberholtFehler) {
        console.error("Aeltere Fassungen nicht als ueberholt markiert:", ueberholtFehler);
        return new Response(
          JSON.stringify({ error: "Die Selbstauskunft konnte gerade nicht gespeichert werden, bitte erneut versuchen." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    /*
     * Abschluss unter der Sperre des Links (07.10.2026): `sa_link_abschliessen`
     * prueft Status, Ablauf und Person, legt die Unterschriften an, traegt den
     * Stand ins Investment ein (Person 2 nur `person2Data`, gegen den Stand
     * in genau diesem Augenblick) und setzt den Link von `pending` auf `used`,
     * alles in einer Transaktion. Ein Widerruf in der Zwischenzeit wartet auf
     * die Sperre oder macht den Abschluss unmoeglich; `widerrufen` wird nie zu
     * `used`. Ein zweiter Abschluss desselben Links nach einem Netzaussetzer
     * bekommt Erfolg gemeldet, ohne erneut zu schreiben.
     *
     * Fehlt die Funktion noch (Migration offen), bleibt es beim bisherigen
     * Weg in `abschlussOhneMigration`, nur dass `used` nur noch einen offenen
     * Link trifft.
     */
    const abschlussOhneMigration = async (): Promise<string | null> => {
      // Insert signed signature_requests for inline signatures.
      /*
       * IDEMPOTENZ: Je Fassung und Person hoechstens eine Unterschrift. Ein
       * automatischer Wiederholungsversuch desselben Absendens legt keine
       * zweite an.
       *
       * Bis zum 26.09.2026 wurde hier ueber den Zeitpunkt entschieden (jede
       * Unterschrift nach dem Ausstellen dieses Links zaehlte). Lagen zwei Links
       * draussen, galt dann die Unterschrift zur ersten Fassung auch fuer die
       * zweite, und die neue Unterschrift wurde gar nicht gespeichert.
       */
      for (const sig of signatures) {
        let dupQuery = supabase
          .from("signature_requests")
          .select("id")
          .eq("kontakt_id", kontaktId)
          .eq("person_type", sig.personType)
          .eq("status", "signed")
          .eq("meta->>saFassung", saFassung);
        if (investmentId) {
          dupQuery = dupQuery.eq("investment_id", investmentId);
        } else {
          dupQuery = dupQuery.is("investment_id", null);
        }
        const { data: existingSig } = await dupQuery.limit(1).maybeSingle();
        if (existingSig) continue;
        const sigToken = crypto.randomUUID();
        const { error: insertErr } = await supabase
          .from("signature_requests")
          .insert({
            kontakt_id: kontaktId,
            investment_id: investmentId || null,
            person_type: sig.personType,
            name: sig.name,
            email: sig.email,
            token: sigToken,
            status: "signed",
            signed_at: now,
            signature_data: sig.signatureData,
            sa_data: saDatenFuerPerson(personNrLink, saData, null),
            consent_text: `${consentBase} - ${sig.name}, ${new Date().toLocaleString("de-DE")}`,
            user_agent: sig.userAgent || null,
            expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
            meta: { saFassung },
          });

        if (insertErr) {
          console.error("Insert signature error:", insertErr);
          return `Fehler beim Speichern der Unterschrift für ${sig.name}`;
        }
      }

      // Save SA data to investment meta
      if (investmentId) {
        const { data: inv } = await supabase
          .from("investments")
          .select("meta")
          .eq("id", investmentId)
          .maybeSingle();

        if (inv) {
          const currentMeta = (inv.meta as Record<string, any>) || {};
          await supabase
            .from("investments")
            .update({
              meta: {
                ...currentMeta,
                saData: saDatenFuerPerson(personNrLink, saData, currentMeta.saData),
                saEditStatus: "none",
              },
            })
            .eq("id", investmentId);
        }
      }

      // Mark token as used
      await supabase
        .from("sa_fill_tokens")
        .update({ status: "used" })
        .eq("token", token)
        .eq("status", "pending");

      return null;
    };

    let saDaten: unknown = saData;
    const { data: abschluss, error: abschlussFehler } = await supabase.rpc("sa_link_abschliessen", {
      _token: token,
      _sa_data: saData,
      _signaturen: (signatures as Record<string, unknown>[]).map((sig) => ({
        personType: sig.personType,
        name: sig.name,
        email: sig.email,
        signatureData: sig.signatureData,
        userAgent: sig.userAgent || null,
        consentText: `${consentBase} - ${sig.name}, ${new Date().toLocaleString("de-DE")}`,
      })),
      _signiert_am: now,
    });
    if (rpcFehlt(abschlussFehler)) {
      const fehler = await abschlussOhneMigration();
      if (fehler) {
        return new Response(
          JSON.stringify({ error: fehler }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      saDaten = saDatenFuerPerson(personNrLink, saData, null);
    } else if (abschlussFehler) {
      console.error("Abschluss der Selbstauskunft fehlgeschlagen:", abschlussFehler);
      return new Response(
        JSON.stringify({ error: "Die Selbstauskunft konnte gerade nicht gespeichert werden, bitte erneut versuchen." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      const ergebnis = String((abschluss as { ergebnis?: unknown } | null)?.ergebnis ?? "");
      if (ergebnis === "schon_abgeschlossen") {
        const p2Mail = p2NachforderungOffen ? await p2Nachfordern(saData) : null;
        return new Response(
          JSON.stringify({ success: true, alreadyProcessed: true, allSigned: true, signedCount: signatures.length, totalRequests: signatures.length, p2Mail }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (ergebnis !== "ok") {
        return new Response(
          JSON.stringify({ error: "Dieser Link gilt nicht mehr." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      saDaten = (abschluss as { saData?: unknown }).saData ?? saData;
    }

    const p2Mail = await p2Nachfordern(saDaten);

    // Call finalize to check if all signatures are complete
    let finalizeResult = null;
    try {
      const { data: fResult } = await supabase.functions.invoke("finalize-selbstauskunft", {
        body: { investmentId, kontaktId, saFillToken: token },
        headers: { "x-internal-secret": Deno.env.get("INGEST_SHARED_SECRET") ?? "" },
      });
      finalizeResult = fResult;
      if (fResult && (fResult as any).error) {
        console.error("Finalize returned error:", (fResult as any).error);
      }
    } catch (err) {
      console.error("Finalize error:", err);
    }

    return new Response(
      JSON.stringify({
        success: true,
        allSigned: finalizeResult?.allSigned || false,
        signedCount: finalizeResult?.signedCount || signatures.length,
        totalRequests: finalizeResult?.totalRequests || signatures.length,
        p2EmailSent: !!p2PerMail,
        /*
         * Das ehrliche Feld. `p2EmailSent` sagt nur, dass eine Mail
         * angefordert wurde, nicht dass sie hinausging. Es bleibt unveraendert
         * stehen, damit nichts bricht, was es schon liest.
         * `null` heisst: Es war gar keine Mail an Person 2 vorgesehen.
         */
        p2Mail,
      }),
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
