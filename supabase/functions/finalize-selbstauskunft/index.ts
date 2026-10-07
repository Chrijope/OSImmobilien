import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stufeNachEreignis } from "../_shared/pipeline-vorstufen.ts";
import { stelleVorstellungsAufgabeSicher } from "../_shared/handbuch-vorstellung.ts";
import { saGlockeLeitung, saGlockeLeitungZeilen } from "../_shared/sa-glocke.ts";
import {
  aktuellerSaPdfPfad,
  base64ZuBytes,
  pruefeSaPdf,
  saFruehereDateien,
  saPdfDateinameNeueFassung,
  saPdfMetaPatch,
  saPdfPfad,
  saVollstaendigUnterschrieben,
} from "../_shared/selbstauskunft-pdf-ablage.ts";
import { saErwartetePersonen, saUnterschriftenStand } from "../_shared/selbstauskunft-geltende-unterschrift.ts";
import { saDatenSicht, saLinkFrischAbgeschlossen, saUnterschriftenSicht } from "../_shared/sa-fester-link.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/*
 * Wohin ein Vorgang springt, wenn der Kunde die Selbstauskunft unterschreibt.
 *
 * Bis zum 21.09.2026 stand hier eine eigene Liste namens
 * PRE_BONITAET_PIPELINES, und das Ziel war "bonitaetsunterlagen". Das war
 * richtig, solange die Bonitaet direkt auf die Selbstauskunft folgte. Am
 * 06.08.2026 wurden Objektauswahl und Reservierung davorgezogen, und seither
 * schob diese Zeile jeden Kunden an beiden vorbei.
 *
 * Zwei Schwesterstellen hatten denselben Fehler und wurden am Tag der Drehung
 * repariert (Commit "Drei Folgefehler der gedrehten Reihenfolge"), diese hier
 * wurde uebersehen. Deshalb kommt die Reihenfolge jetzt aus einer geteilten
 * Datei statt aus einer abgetippten Liste, siehe _shared/pipeline-vorstufen.ts.
 *
 * Die alte Liste kannte "selbstauskunft" ausserdem gar nicht. Genau dort steht
 * ein Kunde beim Unterschreiben aber normalerweise, und so hatte der normale
 * Weg nach der Unterschrift ueberhaupt keinen Stufensprung.
 */

/*
 * Die unterschriebene Selbstauskunft als echte Datei (seit 26.09.2026).
 *
 * Nach der letzten Unterschrift baut der Browser das PDF in der gewohnten
 * Gestaltung und schickt es in einem zweiten Aufruf als `pdfBase64`. Nur der
 * Browser hat Hausschrift und Logo; dasselbe Muster wie bei der Kopie der
 * Reservierungsvereinbarung. Dieser Aufruf loest nichts anderes aus als die
 * Ablage: keine Stufe, keine Glocke, keine Mail.
 *
 * Nachreichen duerfen:
 *   - der Unterschreibende mit seinem Link (Signaturlink oder Ausfuell-Link),
 *     der nachweislich zu diesem Investment gehoert,
 *   - ein Mitarbeiter, der das Investment sehen darf (Bestand und Rueckfall),
 *   - ein Server-Aufruf mit dem gemeinsamen Geheimwort.
 *
 * Genau eine Datei je Unterschrift: Liegt zur geltenden Unterschrift schon
 * eine, bleibt sie, auch wenn spaeter eine zweite geschickt wird.
 */

/**
 * Darf der angemeldete Nutzer dieses Investment sehen, und ist er Mitarbeiter?
 *
 * Die Sichtbarkeit beantwortet die Row Level Security selbst: Die Abfrage
 * laeuft mit dem Token des Nutzers. Wer den Kunden nicht sehen darf, bekommt
 * keine Zeile. Kunden sind ausgeschlossen, sie sollen ihr unterschriebenes
 * Dokument nicht austauschen koennen. Wirft nicht.
 */
async function mitarbeiterSiehtInvestment(
  req: Request,
  supabaseUrl: string,
  // deno-lint-ignore no-explicit-any
  admin: any,
  investmentId: string,
): Promise<boolean> {
  try {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    // Der oeffentliche Schluessel allein gehoert zu keinem Nutzer.
    if (!jwt || (anonKey && jwt === anonKey)) return false;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return false;
    const { data: intern, error: rollenFehler } = await admin.rpc("is_internal_role", { _user_id: uid });
    if (rollenFehler || intern !== true) return false;
    const { data: sichtbar } = await userClient.from("investments").select("id").eq("id", investmentId).maybeSingle();
    return !!sichtbar;
  } catch (e) {
    console.error("Rollencheck fehlgeschlagen:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Die nachgereichte PDF pruefen, ablegen und am Investment vermerken. */
async function pdfAblegen(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { investmentId?: string; kontaktId: string; pdfBase64: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { investmentId, kontaktId, pdfBase64 } = args;
  if (!investmentId) return { status: 400, body: { pdfAbgelegt: false, error: "investmentId fehlt" } };

  const { data: inv, error: invFehler } = await supabase
    .from("investments")
    .select("meta, kunde_id")
    .eq("id", investmentId)
    .maybeSingle();
  if (invFehler) return { status: 500, body: { pdfAbgelegt: false, error: "Investment konnte nicht geladen werden" } };
  // `kunde_id` ist uuid, `kontaktId` kommt als Text: als Text vergleichen.
  if (!inv || String(inv.kunde_id) !== String(kontaktId)) {
    return { status: 404, body: { pdfAbgelegt: false, error: "Investment nicht gefunden" } };
  }
  const meta = (inv.meta as Record<string, any>) || {};

  // Erst nach dem Abschluss: vorher gibt es keine vollstaendig unterschriebene Fassung.
  if (!saVollstaendigUnterschrieben(meta)) {
    return { status: 409, body: { pdfAbgelegt: false, grund: "Selbstauskunft noch nicht vollständig unterschrieben" } };
  }
  const vorhanden = aktuellerSaPdfPfad(meta);
  if (vorhanden) return { status: 200, body: { pdfAbgelegt: true, bereitsVorhanden: true, pfad: vorhanden } };

  const bytes = base64ZuBytes(pdfBase64);
  const pruefung = pruefeSaPdf(bytes);
  if (!pruefung.ok) return { status: 400, body: { pdfAbgelegt: false, grund: pruefung.grund } };

  const { data: kontakt } = await supabase
    .from("kontakte")
    .select("vorname, nachname")
    .eq("id", kontaktId)
    .maybeSingle();
  const kundeName = `${kontakt?.vorname || ""} ${kontakt?.nachname || ""}`.trim() || "Kunde";
  // Eine neue Fassung bekommt einen eigenen Namen, die alte Datei bleibt als
  // Nachweis liegen (sonst überschriebe `upsert` sie bei gleichem Tag).
  const dateiname = saPdfDateinameNeueFassung(kundeName, meta.saSignedAt, saFruehereDateien(meta));
  const pfad = saPdfPfad(kontaktId, investmentId, dateiname);

  const { error: upFehler } = await supabase.storage.from("unterlagen").upload(pfad, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (upFehler) {
    console.error("SA-PDF Ablage fehlgeschlagen:", upFehler);
    return { status: 500, body: { pdfAbgelegt: false, error: "PDF konnte nicht abgelegt werden" } };
  }

  /*
   * Feldweise mergen statt das ganze Meta zurueckzuschreiben: Zwischen Lesen
   * und Schreiben kann der Berater am selben Investment etwas speichern.
   * Die Service-Role gilt in `merge_investment_meta` als intern.
   */
  const patch = saPdfMetaPatch(meta, { pfad, dateiname, jetzt: new Date().toISOString() });
  const { error: mergeFehler } = await supabase.rpc("merge_investment_meta", {
    _investment_id: investmentId,
    _updates: patch,
  });
  if (mergeFehler) {
    console.error("SA-PDF Vermerk per merge_investment_meta fehlgeschlagen, schreibe direkt:", mergeFehler);
    const { data: frisch } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const { error: updFehler } = await supabase
      .from("investments")
      .update({ meta: { ...((frisch?.meta as Record<string, any>) || meta), ...patch } })
      .eq("id", investmentId);
    if (updFehler) {
      console.error("SA-PDF Vermerk fehlgeschlagen:", updFehler);
      return { status: 500, body: { pdfAbgelegt: false, error: "PDF abgelegt, Vermerk am Investment fehlgeschlagen" } };
    }
  }

  // Protokoll in der Kundenakte, wie bei den anderen automatischen Ablagen.
  try {
    await supabase.from("aktivitaeten").insert({
      kunde_id: kontaktId,
      art: "notiz",
      beschreibung: "Unterschriebene Selbstauskunft als PDF im Investment abgelegt",
      von: "System (Selbstauskunft)",
      datum: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Aktivitaet zur SA-PDF nicht geschrieben:", e);
  }

  return { status: 200, body: { pdfAbgelegt: true, pfad } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { investmentId, kontaktId, signatureToken, saFillToken, pdfBase64 } = await req.json();
    // Zweiter Aufruf nach der letzten Unterschrift: nur die PDF ablegen, siehe unten.
    const pdfNachgereicht = typeof pdfBase64 === "string" && pdfBase64.length > 0;

    if (!kontaktId) {
      return new Response(
        JSON.stringify({ error: "kontaktId ist Pflichtfeld" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // ----- Authorization gate -----
    // Accept one of:
    //  (a) x-internal-secret header matches INGEST_SHARED_SECRET (server-to-server)
    //  (b) signatureToken corresponds to a signature_request for this kontaktId
    //      (anonymous SignaturSeite flow — token proves legitimate access)
    const internalSecret = Deno.env.get("INGEST_SHARED_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    const isInternalCall = !!internalSecret && providedSecret === internalSecret;

    let isTokenAuthorized = false;
    // Gehoert der Nachweis ausdruecklich zu DIESEM Investment? Nur dann darf
    // mit ihm eine PDF abgelegt werden.
    let tokenPasstZumInvestment = false;
    if (!isInternalCall && signatureToken) {
      const { data: sigReq } = await supabase
        .from("signature_requests")
        .select("kontakt_id, investment_id")
        .eq("token", signatureToken)
        .maybeSingle();
      if (sigReq && sigReq.kontakt_id === kontaktId) {
        isTokenAuthorized = true;
        tokenPasstZumInvestment = !!investmentId && sigReq.investment_id === investmentId;
      }
    }

    /*
     * SA fill token (inline customer-link flow). Gleich nach dem Abschicken
     * steht er schon auf "used" (submit-sa-signature), und genau dann holt
     * der Browser Angaben und Unterschriften ab und reicht die PDF nach.
     * Deshalb zaehlt (seit 07.10.2026):
     *   - "pending" bis zum Ablauf,
     *   - "used" nur in den zwei Stunden nach dem eigenen Abschluss
     *     (`saLinkFrischAbgeschlossen`), danach nie wieder,
     *   - "widerrufen" und alles andere nie.
     * Und jede Antwort mit Angaben oder Unterschriften gilt nur fuer die
     * Fassung dieses Links (`fillFassung`, Kennung der Zeile): Hat der
     * Berater inzwischen an eine andere Adresse neu gesendet und dort wurde
     * unterschrieben, bekommt der alte Link nichts davon zu sehen. Ein Link
     * fuer Person 2 bekommt nur deren Teil und ihre eigene Unterschrift.
     */
    let fillPersonNr: number | null = null;
    let fillFassung: string | null = null;
    if (!isInternalCall && !isTokenAuthorized && saFillToken) {
      // "*", damit `abgeschlossen_am` auch vor der Migration nicht stoert.
      const { data: fillRow } = await supabase
        .from("sa_fill_tokens")
        .select("*")
        .eq("token", saFillToken)
        .maybeSingle();
      const linkGilt = !!fillRow && (
        fillRow.status === "pending"
          ? new Date(String(fillRow.expires_at ?? "")).getTime() > Date.now()
          : fillRow.status === "used" && saLinkFrischAbgeschlossen(fillRow, new Date())
      );
      if (
        fillRow &&
        linkGilt &&
        fillRow.kontakt_id === kontaktId &&
        (!investmentId || !fillRow.investment_id || fillRow.investment_id === investmentId)
      ) {
        isTokenAuthorized = true;
        fillPersonNr = Number(fillRow.person_nr) === 2 ? 2 : 1;
        fillFassung = String(fillRow.id);
        // Ohne eigenes Investment am Link prueft `pdfAblegen`, dass das
        // Investment diesem Kunden gehoert.
        tokenPasstZumInvestment = !!investmentId && (!fillRow.investment_id || fillRow.investment_id === investmentId);
      }
    }

    /*
     * Ein Mitarbeiter, der das Kundenprofil offen hat, darf eine fehlende PDF
     * nachreichen (Bestand und Rueckfall, wenn der Browser des Kunden die
     * Ablage nicht mehr geschafft hat). Nur fuer die Ablage, nie fuer den
     * eigentlichen Abschluss mit Stufe, Glocke und Mail.
     */
    const darfAlsMitarbeiterAblegen = pdfNachgereicht && !isInternalCall && !isTokenAuthorized && !!investmentId
      ? await mitarbeiterSiehtInvestment(req, supabaseUrl, supabase, investmentId)
      : false;

    if (pdfNachgereicht) {
      if (!isInternalCall && !tokenPasstZumInvestment && !darfAlsMitarbeiterAblegen) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Nur mit dem Link autorisiert: Die geltende Fassung muss seine sein.
      if (fillFassung && !isInternalCall && !darfAlsMitarbeiterAblegen) {
        let fassungsAnfragen = supabase
          .from("signature_requests")
          .select("person_type, status, created_at, signed_at, meta")
          .eq("kontakt_id", kontaktId)
          .not("person_type", "like", "rv_%");
        if (investmentId) fassungsAnfragen = fassungsAnfragen.eq("investment_id", investmentId);
        const { data: anfragenZurPdf } = await fassungsAnfragen;
        if (saUnterschriftenStand(anfragenZurPdf ?? []).fassung !== fillFassung) {
          return new Response(
            JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      const ergebnis = await pdfAblegen(supabase, { investmentId, kontaktId, pdfBase64 });
      return new Response(
        JSON.stringify(ergebnis.body),
        { status: ergebnis.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isInternalCall && !isTokenAuthorized) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /**
     * Antwort mit Angaben und Unterschriften. Kam der Aufruf ueber einen
     * Ausfuell-Link, nur fuer dessen eigene Fassung (sonst 403) und fuer
     * Person 2 nur deren Teil.
     */
    const antwortFuerLink = (antwort: Record<string, unknown>, fassung: string | null) => {
      if (fillFassung && fassung !== fillFassung) {
        return new Response(
          JSON.stringify({ error: "Dieser Link gehört nicht zu dieser Fassung der Selbstauskunft." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const koerper = fillPersonNr === 2
        ? {
            ...antwort,
            saData: antwort.saData === undefined ? undefined : saDatenSicht(2, antwort.saData),
            signatures: saUnterschriftenSicht(2, antwort.signatures as Record<string, unknown> | undefined),
          }
        : antwort;
      return new Response(JSON.stringify(koerper), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // Get SA signature requests only (exclude rv_ prefixed)
    let query = supabase
      .from("signature_requests")
      .select("*")
      .eq("kontakt_id", kontaktId)
      .not("person_type", "like", "rv_%");

    if (investmentId) {
      query = query.eq("investment_id", investmentId);
    }

    const { data: requests, error: fetchError } = await query;

    if (fetchError) {
      console.error("Fetch error:", fetchError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Laden der Signaturanfragen" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!requests || requests.length === 0) {
      return new Response(
        JSON.stringify({ allSigned: false, reason: "Keine Signaturanfragen gefunden" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    /*
     * Je Person zaehlt nur die juengste Anfrage (seit 26.09.2026). Nach einer
     * Korrektur liegen die alten, unterschriebenen Anfragen neben den neuen.
     * Vorher mischte diese Stelle ihre Unterschriften unter die neue Fassung,
     * und `requests[0]` konnte die Angaben der alten liefern. Siehe
     * _shared/selbstauskunft-geltende-unterschrift.ts.
     */
    let fassungsMeta: Record<string, any> | null = null;
    if (investmentId) {
      const { data: fassungsZeile, error: fassungsFehler } = await supabase
        .from("investments")
        .select("meta")
        .eq("id", investmentId)
        .maybeSingle();
      if (fassungsFehler) {
        console.error("Failed to load investment:", fassungsFehler);
        return new Response(
          JSON.stringify({ error: "Investment konnte nicht geladen werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      fassungsMeta = (fassungsZeile?.meta as Record<string, any>) || null;
    }

    /*
     * Schon abgeschlossen: nichts mehr anfassen, nur den Stand melden.
     *
     * Hier greift noch die bisherige Zaehlweise, damit sich an Selbstauskuenften,
     * die vor dem 26.09.2026 abgeschlossen wurden, nichts aendert (Entscheidung
     * Christian). Eine neue Fassung setzt `saSigned` vorher zurueck, sowohl
     * `send-signature-request` als auch `submit-sa-signature`, und kommt hier
     * deshalb nicht an.
     */
    if (fassungsMeta && fassungsMeta.saSigned === true && fassungsMeta.saSignedAt) {
      const bisher = saUnterschriftenStand(requests);
      return antwortFuerLink({
          allSigned: bisher.alleUnterschrieben,
          alreadyFinalized: bisher.alleUnterschrieben,
          totalRequests: bisher.anzahlGesamt,
          signedCount: bisher.anzahlUnterschrieben,
          signatures: bisher.alleUnterschrieben ? bisher.unterschriften : undefined,
          saData: bisher.alleUnterschrieben ? fassungsMeta.saData : undefined,
        }, bisher.fassung);
    }

    /*
     * Wer muss unterschreiben, und welche Unterschrift gehoert zur geltenden
     * Fassung? (seit 26.09.2026, zweiter Teil)
     *
     * - Erwartet sind Person 1 und, wenn sie in dieser Selbstauskunft steht,
     *   Person 2. Fehlt fuer eine von beiden jede Anfrage, ist nichts fertig.
     *   Vorher reichte es, wenn alle vorhandenen Anfragen unterschrieben waren;
     *   loeschte ein Neuversand an Person 1 die offene Anfrage von Person 2,
     *   schloss die Selbstauskunft mit nur einer Unterschrift ab.
     * - Steht der Vermerk `saNeueUnterschriftSeit` (neue Fassung), zaehlen nur
     *   Unterschriften ab diesem Zeitpunkt. Die alte Unterschrift von Person 2
     *   gilt dann nicht fuer die neuen Angaben.
     */
    /*
     * Seit dem 26.09.2026 (Befund HB-004) mit Fassungskennung: Tragen die
     * Anfragen `meta.saFassung`, zaehlt `saUnterschriftenStand` nur die
     * jüngste Fassung. Abgeschlossen wird nur, wenn alle erwarteten Personen
     * genau diese Fassung unterschrieben haben, und `saData` sind genau deren
     * Angaben. Ohne Kennung (Bestand) bleibt es bei der bisherigen Zaehlweise.
     */
    const angabenDerFassung = saUnterschriftenStand(requests).saData ?? fassungsMeta?.saData;
    const stand = saUnterschriftenStand(requests, {
      fassungSeit: fassungsMeta?.saNeueUnterschriftSeit ?? null,
      erwartet: saErwartetePersonen(angabenDerFassung),
    });
    const allSigned = stand.alleUnterschrieben;
    const signatures = stand.unterschriften;

    // PARTIAL: Auch bei nur teilweise unterschriebener SA bereits gesammelte Signaturen
    // in investments.meta.saSignatures spiegeln, damit Zwischenstand-PDFs Bernds Unterschrift
    // anzeigen können. KEINE Side-Effects (Pipeline, Mails, Sync) hier auslösen.
    if (!allSigned && investmentId && Object.keys(signatures).length > 0) {
      try {
        const { data: invPart } = await supabase
          .from("investments")
          .select("meta")
          .eq("id", investmentId)
          .maybeSingle();
        const partMeta = (invPart?.meta as Record<string, any>) || {};
        const existingSigs = (partMeta.saSignatures as Record<string, any>) || {};
        // Ersetzen statt dazumischen: Was nicht zur geltenden Fassung gehoert,
        // etwa die Unterschrift vor einer Korrektur, faellt dabei heraus.
        // Nur schreiben, wenn sich tatsächlich etwas ändert (Idempotenz).
        if (JSON.stringify(signatures) !== JSON.stringify(existingSigs)) {
          await supabase
            .from("investments")
            .update({ meta: { ...partMeta, saSignatures: signatures, saSignaturePartial: true } })
            .eq("id", investmentId);
        }
      } catch (partErr) {
        console.error("Failed to persist partial SA signatures:", partErr);
      }
    }

    if (allSigned && investmentId) {
      const { data: inv, error: invError } = await supabase
        .from("investments")
        .select("meta, kunde_id")
        .eq("id", investmentId)
        .maybeSingle();

      if (invError) {
        console.error("Failed to load investment:", invError);
        return new Response(
          JSON.stringify({ error: "Investment konnte nicht geladen werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!inv) {
        return new Response(
          JSON.stringify({ error: "Investment nicht gefunden" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const currentMeta = (inv.meta as Record<string, any>) || {};

      // IDEMPOTENZ: Wenn die SA bereits als signiert markiert ist, keine Side-Effects
      // (Benachrichtigungen, Email, Person2-Invite, SA-Sync) erneut auslösen.
      if (currentMeta.saSigned === true && currentMeta.saSignedAt) {
        return antwortFuerLink({
            allSigned: true,
            alreadyFinalized: true,
            totalRequests: stand.anzahlGesamt,
            signedCount: stand.anzahlUnterschrieben,
            signatures,
            saData: currentMeta.saData,
          }, stand.fassung);
      }

      /*
       * `saPdf` ist hier nur ein Merker „Selbstauskunft liegt vor“, den viele
       * Stellen abfragen. Eine Datei dieses Namens gibt es nicht. Die echte
       * PDF reicht der Browser gleich danach nach (`pdfBase64`), dann steht
       * in `saPdf` der wirkliche Dateiname und in `saPdfPath` der Ablageort.
       */
      const pdfFilename = `SA_${kontaktId}_${investmentId}_${Date.now()}.pdf`;
      const currentPipeline = typeof currentMeta.pipelineStufe === "string" ? currentMeta.pipelineStufe : "";
      const existingDocStatuses = currentMeta.docStatuses || {};
      const updatedDocStatuses = { ...existingDocStatuses, Selbstauskunft: "approved" };

      const nextMeta = {
        ...currentMeta,
        saSigned: true,
        saSignedAt: new Date().toISOString(),
        saSignatures: signatures,
        saPdf: currentMeta.saPdf || pdfFilename,
        saData: stand.saData || currentMeta.saData,
        // Der Kunde hat abgegeben. Ab hier gelten seine Angaben, siehe die
        // Vorfahrtsregel in update-sa-signature-data.
        saKundeStandAm: new Date().toISOString(),
        saEditStatus: "none",
        saSignaturePending: false,
        // Die neue Unterschrift nach einer Korrektur ist da.
        saNeueUnterschriftSeit: null,
        pipelineStufe: stufeNachEreignis(currentPipeline, "objektauswahl"),
        docStatuses: updatedDocStatuses,
      };

      const { error: updateError } = await supabase
        .from("investments")
        .update({ meta: nextMeta })
        .eq("id", investmentId);

      if (updateError) {
        console.error("Failed to persist signed state:", updateError);
        return new Response(
          JSON.stringify({ error: "Unterschrift konnte nicht gespeichert werden" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Offene Ausfüll-Links dieses Investments schliessen, sonst laeuft der
      // SA-Abbrecher-Reminder weiter, obwohl die SA schon unterschrieben ist.
      try {
        await supabase
          .from("sa_fill_tokens")
          .update({ status: "used" })
          .eq("investment_id", investmentId)
          .eq("status", "pending");
      } catch (tokErr) {
        console.error("Failed to close sa_fill_tokens:", tokErr);
      }

      /*
       * Alles abraeumen, was noch an die Selbstauskunft erinnern wuerde.
       *
       * Die geplanten Benachrichtigungen pruefen zwar vor dem Versand, ob die
       * Selbstauskunft fertig ist, und wuerden sich uebersprungen. Die
       * Nachfass-Aufgaben in der Inbox tun das nicht: Sie werden beim Einladen
       * im Voraus angelegt und blieben stehen, auch wenn der Kunde am naechsten
       * Tag unterschreibt. Der Partner haette dann tagelang eine Aufgabe, die
       * sich laengst erledigt hat, und faengt an, solche Aufgaben zu ignorieren.
       *
       * Beides wird deshalb hier geschlossen, an der einen Stelle, an der die
       * Selbstauskunft nachweislich fertig ist. Fehlschlaege werden nur
       * protokolliert: Eine Unterschrift darf nicht daran scheitern, dass eine
       * Aufgabe nicht zugeklappt werden konnte.
       */
      try {
        await supabase
          .from("scheduled_notifications")
          .update({ status: "skipped", sent_at: new Date().toISOString(), error: "Selbstauskunft unterschrieben" })
          .eq("investment_id", investmentId)
          .eq("status", "pending");
      } catch (notifErr) {
        console.error("Failed to cancel scheduled_notifications:", notifErr);
      }

      try {
        await supabase
          .from("aufgaben")
          .update({ status: "erledigt" })
          .eq("kontakt_id", kontaktId)
          .eq("status", "offen")
          .like("titel", "SA-Nachfass:%");
      } catch (aufgErr) {
        console.error("Failed to close SA follow-up tasks:", aufgErr);
      }

      // Get kontakt info for notification
      const { data: kontakt } = await supabase
        .from("kontakte")
        .select("vorname, nachname, meta, zustaendig_id, strasse, hausnummer, plz, ort")
        .eq("id", kontaktId)
        .single();

      // Sync SA-Stammdaten zurück ins Kundenprofil (immer überschreiben wenn SA einen Wert hat).
      // Damit bleibt das Kundenprofil mit dem aktuellsten, vom Kunden bestätigten Stand synchron.
      try {
        const saData = (stand.saData as Record<string, any>) || {};
        const profileUpdates: Record<string, any> = {};
        const metaUpdates: Record<string, any> = {};

        const setIfPresent = (
          col: "anrede" | "vorname" | "nachname" | "email" | "telefon" | "strasse" | "hausnummer" | "plz" | "ort",
          val: any,
        ) => {
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            profileUpdates[col] = String(val).trim();
          }
        };
        setIfPresent("anrede", saData.anrede);
        setIfPresent("vorname", saData.vorname);
        setIfPresent("nachname", saData.nachname);
        setIfPresent("email", saData.email);
        setIfPresent("telefon", saData.telefon || saData.mobilfunk);
        setIfPresent("strasse", saData.strasse);
        setIfPresent("hausnummer", saData.hausnummer);
        setIfPresent("plz", saData.plz);
        setIfPresent("ort", saData.ort);

        if (saData.geburtsdatum && String(saData.geburtsdatum).trim() !== "") {
          metaUpdates.geburtstag = String(saData.geburtsdatum).trim();
          metaUpdates.geburtsdatum = String(saData.geburtsdatum).trim();
        }

        // Person 2 Stammdaten in meta.person2 spiegeln (falls vorhanden)
        if (saData.person2 && saData.person2Data && saData.person2Data.vorname) {
          const existingMeta = (kontakt?.meta as Record<string, any>) || {};
          const existingP2 = (existingMeta.person2 as Record<string, any>) || {};
          const p2 = saData.person2Data || {};
          metaUpdates.person2 = {
            ...existingP2,
            anrede: p2.anrede || existingP2.anrede || "Herr",
            vorname: p2.vorname || existingP2.vorname || "",
            nachname: p2.nachname || existingP2.nachname || "",
            email: p2.email || existingP2.email || "",
            telefon: p2.telefon || p2.mobilfunk || existingP2.telefon || "",
            geburtsdatum: p2.geburtsdatum || existingP2.geburtsdatum || "",
            strasse: p2.strasse || existingP2.strasse || "",
            hausnummer: p2.hausnummer || existingP2.hausnummer || "",
            plz: p2.plz || existingP2.plz || "",
            ort: p2.ort || existingP2.ort || "",
          };
        }

        if (Object.keys(profileUpdates).length > 0) {
          await supabase.from("kontakte").update(profileUpdates).eq("id", kontaktId);
          console.log("Synced SA fields to kontakt:", Object.keys(profileUpdates));
        }
        if (Object.keys(metaUpdates).length > 0) {
          await supabase.rpc("merge_kontakt_meta", {
            _kontakt_id: kontaktId,
            _updates: metaUpdates,
          });
          console.log("Synced SA meta to kontakt:", Object.keys(metaUpdates));
        }
      } catch (syncErr) {
        console.error("Failed to sync SA data back to kontakt:", syncErr);
      }

      // Handbuch-Lead mit Partner: Aufgabe „Objekt-Vorstellungstermin
      // vereinbaren“ in dessen Inbox. Ohne Partner entsteht sie erst bei der
      // Zuweisung im CRM. Wirft nie, siehe _shared/handbuch-vorstellung.ts.
      if (kontakt?.zustaendig_id) {
        await stelleVorstellungsAufgabeSicher(supabase, kontaktId, kontakt.zustaendig_id);
      }

      const kundeName = kontakt
        ? `${kontakt.vorname} ${kontakt.nachname}`
        : requests[0]?.name || "Kunde";

      const notifTitle = `Selbstauskunft unterschrieben: ${kundeName}`;
      const notifMsg = `Alle ${stand.anzahlGesamt} Unterschriften für die Selbstauskunft von ${kundeName} sind eingegangen. Das PDF liegt im Investment unter „Bonität und Bankprüfung“.`;
      const kundeLink = `https://portal.more.immo/kunden/${kontaktId}`;

      // VP-Benachrichtigung NUR wenn die SA per Email an den Kunden zum Ausfüllen verschickt wurde.
      // Erkennung: existiert ein sa_fill_tokens-Eintrag für dieses investment/kontakt?
      let saInvitationWasSent = false;
      try {
        const { data: tokenRows } = await supabase
          .from("sa_fill_tokens")
          .select("id")
          .eq("kontakt_id", kontaktId)
          .eq("investment_id", investmentId)
          .limit(1);
        saInvitationWasSent = !!(tokenRows && tokenRows.length > 0);
      } catch (tokErr) {
        console.error("Failed to check sa_fill_tokens:", tokErr);
      }

      const kontaktMeta = (kontakt?.meta as Record<string, any>) || {};

      if (saInvitationWasSent) {
        // Den Zustaendigen benachrichtigen (Glocke und Mail), nur ueber seine
        // Kennung. Die Suche ueber den Namen in `berater` ist seit dem
        // 28.09.2026 weg: Bei zwei Gleichnamigen ging die Glocke an den
        // falschen. Ohne Kennung gilt der Lead als ohne Zustaendigen, dann
        // meldet der Block weiter unten an die Leitung.
        const beraterId = kontakt?.zustaendig_id;

        let beraterProfile: { id: string; email: string | null; name: string | null } | null = null;

        if (beraterId) {
          const { data: bp } = await supabase
            .from("profiles")
            .select("id, email, name")
            .eq("id", beraterId)
            .maybeSingle();
          beraterProfile = bp;
        }

        if (beraterProfile?.id) {
          // Bell notification – idempotent: nur einfügen, wenn nicht bereits vorhanden
          const { data: existingNotif } = await supabase
            .from("benachrichtigungen")
            .select("id")
            .eq("benutzer_id", beraterProfile.id)
            .eq("titel", notifTitle)
            .eq("link", `/kunden/${kontaktId}`)
            .limit(1)
            .maybeSingle();
          if (!existingNotif) {
            await supabase
              .from("benachrichtigungen")
              .insert({
                benutzer_id: beraterProfile.id,
                titel: notifTitle,
                nachricht: notifMsg,
                link: `/kunden/${kontaktId}`,
                gelesen: false,
              });
          }

          // Email notification to VP via shared template
          if (beraterProfile.email) {
            try {
              await supabase.functions.invoke("send-transactional-email", {
                body: {
                  templateName: "selbstauskunft-unterschrieben",
                  recipientEmail: beraterProfile.email,
                  idempotencyKey: `sa-signed-${kontaktId}-${investmentId}`,
                  templateData: {
                    vpName: beraterProfile.name || undefined,
                    kundeName,
                    anzahlUnterschriften: stand.anzahlGesamt,
                    kundeLink,
                  },
                },
              });
            } catch (emailErr) {
              console.error("Failed to send VP email notification:", emailErr);
            }
          }
        }
      } else {
        console.log(`SA signed for kontakt ${kontaktId} – inline (no email invitation), skipping VP notification.`);
      }

      // Auch die offene Selbstauskunft der Handbuch-Seite (ohne Konfigurator)
      // zaehlt dazu, sie traegt `handbuchSelbstauskunft` statt `handbuchFunnel`.
      const ausHandbuch =
        (kontaktMeta.handbuchFunnel && typeof kontaktMeta.handbuchFunnel === "object") ||
        (kontaktMeta.handbuchSelbstauskunft && typeof kontaktMeta.handbuchSelbstauskunft === "object");
      const zustaendig = kontakt?.zustaendig_id ?? null;

      /*
       * Lead ohne Zustaendigen (seit dem 28.09.2026 fuer jeden Lead, vorher nur
       * fuer Handbuch-Leads): Sonst erfuhr niemand von der Selbstauskunft. Die
       * Glocke geht an Admin, Inhaber und Vertriebsleitung, jede Person einmal,
       * siehe _shared/sa-glocke.ts. Nur wenn der Kontakt gelesen werden konnte,
       * sonst ist unbekannt, ob er einen Zustaendigen hat.
       * Keine eigene Doppelsperre: Gegen doppeltes Ausloesen schuetzt schon
       * die Pruefung auf `saSigned` weiter oben. Eine Sperre ueber den Titel
       * verschluckte den zweiten Kunden mit gleichem Namen.
       * Best effort, die Unterschrift ist zu diesem Zeitpunkt gespeichert.
       */
      if (kontakt && !zustaendig) {
        try {
          const empfaenger = await saGlockeLeitung(supabase);
          if (empfaenger.length > 0) {
            const { error: glockenFehler } = await supabase
              .from("benachrichtigungen")
              .insert(saGlockeLeitungZeilen(empfaenger, kontaktId, kundeName, !!ausHandbuch));
            if (glockenFehler) throw glockenFehler;
          }
        } catch (glockenFehler) {
          console.error("Selbstauskunft ohne Zustaendigen: Glocke an die Leitung fehlgeschlagen:", glockenFehler);
        }
      }

      /*
       * Handbuch-Seite (seit dem 26.09.2026): Die Selbstauskunft kam ueber den
       * oeffentlichen Link aus dem Handbuch. Dann zaehlt die Stufe im Trichter
       * der Handbuch-Seite. Best effort.
       */
      if (ausHandbuch) {
        try {
          const { error: zaehlFehler } = await supabase.from("analysetool_ereignisse").insert({
            typ: "hb_sa_abgeschickt",
            werkzeug: "handbuch",
            berater_id: zustaendig,
          });
          // Ohne Migration 20260926170000 weist die Tabelle die Stufe ab. Nur
          // protokollieren, nichts aufhalten.
          if (zaehlFehler) console.warn("Handbuch: Trichterstufe nicht gezaehlt:", zaehlFehler.message);
        } catch (zaehlFehler) {
          console.warn("Handbuch: Trichterstufe nicht gezaehlt:", zaehlFehler);
        }
      }

      // Auto-invite Person 2 to portal if not yet invited
      const person2Data = kontaktMeta.person2;
      if (person2Data && person2Data.email && !person2Data.authUserId && !kontaktMeta.person2Invited) {
        try {
          console.log("Auto-inviting Person 2 to portal:", person2Data.email);
          await supabase.functions.invoke("invite-user", {
            body: {
              email: person2Data.email,
              name: `${person2Data.vorname || ""} ${person2Data.nachname || ""}`.trim(),
              role: "kunde",
              kontaktId,
              person2: true,
              vorname: person2Data.vorname,
              nachname: person2Data.nachname,
              telefon: person2Data.telefon,
            },
          });
          console.log("Person 2 portal invite sent");
        } catch (p2Err) {
          console.error("Failed to auto-invite Person 2:", p2Err);
        }
      }
    }

    return antwortFuerLink({
        allSigned,
        totalRequests: stand.anzahlGesamt,
        signedCount: stand.anzahlUnterschrieben,
        signatures: allSigned ? signatures : undefined,
        saData: allSigned ? stand.saData : undefined,
      }, stand.fassung);
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
