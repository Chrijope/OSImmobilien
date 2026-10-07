import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { kundenSprache, type Sprache } from "../_shared/kunden-sprache.ts";
import {
  AFTERSALES_LEISTUNG_SCHLUESSEL,
  aftersalesDatum,
  aftersalesTexte,
  aftersalesZeitpunkt,
} from "../_shared/aftersales-beratung-texte.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

/** Dateiname des endgültigen PDFs, gleich für Ablage und Kundenordner. */
function aftersalesDateiname(kundeName: string, sprache: Sprache): string {
  const datum = aftersalesDatum(new Date(), sprache).replace(/[.\s]+/g, "-");
  const safeName = (kundeName || "Kunde").replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kunde";
  return aftersalesTexte(sprache).dateiname(safeName, datum);
}

/**
 * Erzeugt das finale Aftersales-Beratungs-PDF (beide Unterschriften)
 * und lädt es in den Storage-Bucket `unterlagen` hoch.
 * Returns: storage path or null on failure.
 *
 * Seit dem 25.09.2026 mit denselben Texten wie das PDF im Browser
 * (`_shared/aftersales-beratung-texte.ts`) und in der Sprache des Kunden aus
 * seinem Profil (Plan Kundensprache, D17).
 */
async function buildAndUploadFinalPdf(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  kontaktId: string,
  investmentId: string,
  // deno-lint-ignore no-explicit-any
  ab: Record<string, any>,
  kundeName: string,
  sprache: Sprache,
): Promise<string | null> {
  try {
    const T = aftersalesTexte(sprache);
    const doc = new jsPDF("p", "mm", "a4");
    const W = 210;
    const margin = 20;
    let y = 22;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(T.titel, margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(T.erstelltAm(aftersalesDatum(new Date(), sprache)), margin, y);
    y += 8;
    doc.setTextColor(0, 0, 0);

    // deno-lint-ignore no-explicit-any
    const form = (ab.formData || {}) as Record<string, any>;

    const section = (title: string) => {
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(title, margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    };
    const row = (label: string, value: string) => {
      doc.setTextColor(110, 110, 110);
      doc.text(label, margin, y);
      doc.setTextColor(0, 0, 0);
      const lines = doc.splitTextToSize(value || T.leer, W - 2 * margin - 55);
      doc.text(lines, margin + 55, y);
      y += Math.max(5, lines.length * 4.5);
    };

    doc.setFontSize(8.5);
    doc.setTextColor(80, 80, 80);
    const introLines = doc.splitTextToSize(T.einleitung, W - 2 * margin);
    doc.text(introLines, margin, y);
    y += introLines.length * 4 + 2;
    doc.setTextColor(0, 0, 0);

    section(T.abschnittPartner);
    row(T.kunde, form.kundeName || kundeName);
    if (form.kunde2Name) row(T.kaeufer2, String(form.kunde2Name));
    row(T.anschrift, form.kundeAnschrift || T.leer);
    row(T.vertriebspartner, form.vpName || ab.vpSignerName || ab.vpName || T.leer);
    if (form.vpEmail) row(T.emailVp, String(form.vpEmail));
    row(T.objektAdresse, form.objektAdresse || T.leer);
    row(T.kaufdatum, form.kaufdatum || T.leer);

    section(T.abschnittLeistungen);
    const fl = (form.leistungen || {}) as Record<string, boolean>;
    for (const k of AFTERSALES_LEISTUNG_SCHLUESSEL) {
      const checked = !!fl[k];
      doc.setDrawColor(60, 60, 60);
      doc.rect(margin, y - 3.2, 3.4, 3.4);
      if (checked) doc.text("X", margin + 0.6, y - 0.6);
      const wrapped = doc.splitTextToSize(T.leistungen[k], W - 2 * margin - 8);
      doc.text(wrapped, margin + 6, y);
      y += Math.max(5, wrapped.length * 4.5);
    }

    section(T.abschnittRhythmus);
    for (const r of T.rhythmus) {
      const wrapped = doc.splitTextToSize(r, W - 2 * margin);
      doc.text(wrapped, margin, y);
      y += wrapped.length * 4.5;
    }

    if (form.bemerkungen) {
      section(T.abschnittBemerkungen);
      const lines = doc.splitTextToSize(String(form.bemerkungen), W - 2 * margin);
      doc.text(lines, margin, y);
      y += lines.length * 4.5 + 2;
    }

    section(T.abschnittOrt);
    row(T.beratungsort, form.ort || T.leer);
    row(T.beratungsdatum, form.datum || T.leer);

    section(T.abschnittUnterschriften);
    y += 2;
    const drawSig = (title: string, signerName: string, sigData?: string, signedAt?: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`${title}: ${signerName}`, margin, y);
      y += 2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      if (signedAt) doc.text(T.unterschriebenAm(aftersalesZeitpunkt(new Date(signedAt), sprache)), margin, y + 3);
      doc.setTextColor(0, 0, 0);
      if (sigData) {
        try { doc.addImage(sigData, "PNG", margin, y + 5, 60, 22); } catch { /* ignore */ }
      } else {
        doc.setDrawColor(180, 180, 180);
        doc.rect(margin, y + 5, 60, 22);
      }
      y += 32;
      doc.setDrawColor(60, 60, 60);
      doc.line(margin, y, margin + 70, y);
      y += 4;
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(sigData ? T.ees : T.ausstehend, margin, y);
      doc.setTextColor(0, 0, 0);
      y += 10;
    };
    drawSig(T.vertriebspartner, ab.vpSignerName || T.leer, ab.vpSignature, ab.vpSignedAt);
    drawSig(T.kunde, ab.kundeSignerName || kundeName, ab.kundeSignature, ab.kundeSignedAt);

    const arr = doc.output("arraybuffer");
    const path = `aftersales/${kontaktId}/${investmentId}/${aftersalesDateiname(kundeName, sprache)}`;
    const { error: upErr } = await supabase.storage.from("unterlagen").upload(path, new Uint8Array(arr), {
      contentType: "application/pdf",
      upsert: true,
    });
    if (upErr) { console.error("upload failed", upErr); return null; }
    return path;
  } catch (e) {
    console.error("buildAndUploadFinalPdf error", e);
    return null;
  }
}

/**
 * finalize-aftersales-beratung
 *
 * Wird aufgerufen, sobald entweder
 *   - VP seine Unterschrift abgegeben hat (phase: "vp"), oder
 *   - der Kunde unterzeichnet hat (phase: "kunde").
 *
 * Body:
 *   { investmentId, kontaktId, phase: "vp"|"kunde", signatureToken?, formData?, signature? }
 *
 * Aktualisiert investments.meta.aftersalesBeratung und löst Bell+Email aus.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { investmentId, kontaktId, phase, signatureToken, formData, signature, signerName } = body || {};

    if (!investmentId || !kontaktId || !phase || !["vp", "kunde"].includes(phase)) {
      return new Response(JSON.stringify({ error: "investmentId, kontaktId, phase Pflicht" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorization: internal secret OR matching signature token
    const internalSecret = Deno.env.get("INGEST_SHARED_SECRET");
    const provided = req.headers.get("x-internal-secret");
    const isInternal = !!internalSecret && provided === internalSecret;
    let tokenOk = false;
    if (!isInternal && signatureToken) {
      const { data: sigReq } = await supabase
        .from("signature_requests")
        .select("kontakt_id, investment_id, person_type, status, expires_at")
        .eq("token", signatureToken)
        .maybeSingle();
      // Der Token muss zur Phase passen. Sonst koennte der Partner mit
      // seinem eigenen Token (aftersales_vp) die Phase "kunde" ausloesen und
      // eine Kundenunterschrift eintragen (Gegenpruefung vom 29.09.2026).
      const erwartet = phase === "vp" ? "aftersales_vp" : "aftersales_kunde";
      // Offen oder eben unterschrieben (beide Seiten unterschreiben vor dem
      // Aufruf ueber sign_signature_request), und nicht abgelaufen. Eine
      // abgeloeste Anfrage (`ueberholt`) zaehlt nicht mehr.
      const statusOk = sigReq?.status === "pending" || sigReq?.status === "signed";
      const nichtAbgelaufen = !!sigReq?.expires_at && new Date(sigReq.expires_at).getTime() > Date.now();
      tokenOk = !!sigReq && sigReq.kontakt_id === kontaktId &&
        sigReq.person_type === erwartet && statusOk && nichtAbgelaufen &&
        (!sigReq.investment_id || sigReq.investment_id === investmentId);
    }
    if (!isInternal && !tokenOk) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: inv, error: invErr } = await supabase
      .from("investments")
      .select("meta, kunde_id")
      .eq("id", investmentId)
      .maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Investment nicht gefunden" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (inv.meta as Record<string, any>) || {};
    const ab = (meta.aftersalesBeratung as Record<string, any>) || {};
    const now = new Date().toISOString();

    const nextAb: Record<string, any> = {
      ...ab,
      formData: formData || ab.formData || {},
    };

    if (phase === "vp") {
      if (ab.vpSignedAt) {
        return new Response(JSON.stringify({ ok: true, alreadyFinalized: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      nextAb.status = "wartet_auf_kunde";
      nextAb.vpSignedAt = now;
      if (signature) nextAb.vpSignature = signature;
      if (signerName) nextAb.vpSignerName = signerName;
    } else {
      if (ab.kundeSignedAt) {
        return new Response(JSON.stringify({ ok: true, alreadyFinalized: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      nextAb.status = "abgeschlossen";
      nextAb.kundeSignedAt = now;
      if (signature) nextAb.kundeSignature = signature;
      if (signerName) nextAb.kundeSignerName = signerName;
    }

    await supabase.from("investments")
      .update({ meta: { ...meta, aftersalesBeratung: nextAb } })
      .eq("id", investmentId);

    // Kontakt für Notifications
    const { data: kontakt } = await supabase
      .from("kontakte")
      .select("vorname, nachname, email, zustaendig_id")
      .eq("id", kontaktId)
      .maybeSingle();

    const kundeName = kontakt ? `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim() : "Kunde";

    if (phase === "vp") {
      // E-Mail an Kunden mit Signatur-Link (Signatur-Request wird im Dialog vorab erstellt;
      // hier nur die E-Mail mit dem Token aus dem Body verschicken, falls vorhanden)
      try {
        const { data: kundeSig } = await supabase
          .from("signature_requests")
          .select("token, sa_data")
          .eq("investment_id", investmentId)
          .eq("kontakt_id", kontaktId)
          .eq("person_type", "aftersales_kunde")
          // Ein zweiter Durchgang loest die alte Anfrage ab (Migration
          // 20260929200000), gemeint ist immer die offene.
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        // VP-Signaturdaten in kunde sa_data spiegeln, damit der Kunde
        // beim Öffnen des Signaturlinks in der PDF-Vorschau die VP-Unterschrift sieht.
        if (kundeSig?.token) {
          const existing = (kundeSig.sa_data as Record<string, any>) || {};
          const mergedSaData = {
            ...existing,
            aftersalesBeratung: { ...(existing.aftersalesBeratung || {}), ...(formData || {}) },
            vpSignature: signature || existing.vpSignature,
            vpSignedAt: now,
            vpName: signerName || existing.vpName,
          };
          await supabase.from("signature_requests")
            .update({ sa_data: mergedSaData })
            .eq("token", kundeSig.token);
        }
        if (kundeSig?.token && kontakt?.email) {
          const signatureUrl = `https://portal.more.immo/signatur?token=${kundeSig.token}&type=aftersales_kunde`;
          // Zustaendigen Partner als Unterschrift mitgeben, sonst zeigt die
          // Mail den Platzhalter "MOREImmo Team".
          const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);
          await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "aftersales-beratung-signatur",
              recipientEmail: kontakt.email,
              idempotencyKey: `aftersales-kunde-${investmentId}`,
              kontaktId,
              templateData: {
                name: kundeName,
                vpName: signerName || undefined,
                // Die Vorlage heisst dieses Feld signUrl.
                signUrl: signatureUrl,
                ...(berater ? { berater } : {}),
              },
            },
          });
        }
      } catch (e) { console.error("kunde email failed", e); }
    } else {
      // Phase Kunde signiert → finales PDF erzeugen + Storage-Upload
      // Das endgültige PDF in der Sprache des Kunden aus seinem Profil, Rückfall Deutsch.
      const sprache = await kundenSprache(supabase, { kontaktId });
      const pdfPath = await buildAndUploadFinalPdf(supabase, kontaktId, investmentId, nextAb, kundeName, sprache);
      if (pdfPath) {
        nextAb.pdfPath = pdfPath;

        // Spiegelung in den Kundenordner (Kategorie „Beratungsdokument") – Logik analog Reservierungsvereinbarung
        const ko: any[] = Array.isArray((meta as any).kundenordner) ? [...(meta as any).kundenordner] : [];
        const filename = aftersalesDateiname(kundeName, sprache);
        ko.push({
          id: `ko-aftersales-${Date.now()}`,
          investmentId,
          kategorie: "Beratungsdokument",
          filename,
          uploadedBy: "System (Aftersales-Beratung)",
          uploadedAt: new Date().toISOString(),
          fileUrl: pdfPath,
          freigegeben: true,
        });

        await supabase.from("investments")
          .update({ meta: { ...meta, aftersalesBeratung: nextAb, kundenordner: ko } })
          .eq("id", investmentId);
      }

      // Phase Kunde signiert → Bell an VP
      const vpId = kontakt?.zustaendig_id;
      if (vpId) {
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: vpId,
          titel: `Aftersales-Beratung abgeschlossen: ${kundeName}`,
          nachricht: `${kundeName} hat das Beratungsdokument digital unterzeichnet.`,
          link: `/kunden/${kontaktId}`,
          gelesen: false,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, aftersalesBeratung: nextAb }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});