import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Unterschriebene Vereinbarung über eine Mietzuzahlung ablegen (30.10.2026).
 *
 * Die Signaturseite unterschreibt über `sign_signature_request`, baut das PDF
 * mit der Unterschrift des Kunden im Browser und reicht es hier nach, wie bei
 * Reservierung und Beratungsprotokoll.
 *
 * - Zugang nur mit dem Token einer unterschriebenen, nicht abgelaufenen
 *   Anfrage `mietzuzahlung_kunde`. Kontakt und Investment kommen aus dieser
 *   Anfrage, nie aus dem Aufruf.
 * - Nur ein echtes PDF bis 8 MB.
 * - Ablage unter `kundenordner/<Kontakt>/<Investment>/` (diesen Ordner lesen
 *   Team und Kundenportal schon), Eintrag im Kundenordner (Kategorie
 *   „Mietzuzahlung“, für den Kunden freigegeben) und `meta.mietzuzahlung`.
 * - Glocke an den zuständigen Partner.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function pdfAusBase64(b64: unknown): Uint8Array | null {
  if (typeof b64 !== "string" || !b64 || b64.length > 11_000_000) return null;
  try {
    const bin = atob(b64);
    if (!bin.startsWith("%PDF-")) return null;
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token, pdfBase64 } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !token) return antwort({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: anfrage } = await supabase.from("signature_requests")
      .select("kontakt_id, investment_id, person_type, status, expires_at, name, signed_at")
      .eq("token", token).maybeSingle();
    const gueltig = !!anfrage && anfrage.person_type === "mietzuzahlung_kunde" && anfrage.status === "signed"
      && !!anfrage.investment_id && !!anfrage.expires_at && new Date(anfrage.expires_at).getTime() > Date.now();
    if (!gueltig) return antwort({ error: "Unauthorized" }, 401);

    // Einmal abgelegt, bleibt es: Ein zweiter Aufruf mit demselben Token darf das PDF nicht ersetzen.
    const { data: vorher } = await supabase.from("investments").select("meta").eq("id", anfrage.investment_id).maybeSingle();
    if ((vorher?.meta as Record<string, any> | null)?.mietzuzahlung?.pdfPath) return antwort({ ok: true, bereitsAbgelegt: true });

    const pdf = pdfAusBase64(pdfBase64);
    if (!pdf) return antwort({ error: "Kein gültiges PDF." }, 400);

    const kontaktId = anfrage.kontakt_id as string;
    const investmentId = anfrage.investment_id as string;
    const name = String(anfrage.name || "Kunde");
    const sicher = name.replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kunde";
    const datum = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }).replace(/\./g, "-");
    const filename = `Mietzuzahlung_${sicher}_${datum}.pdf`;
    const pfad = `kundenordner/${kontaktId}/${investmentId}/${filename}`;

    const { error: upFehler } = await supabase.storage.from("unterlagen").upload(pfad, pdf, { contentType: "application/pdf", upsert: true });
    if (upFehler) {
      console.error("finalize-mietzuzahlung: Ablage", upFehler);
      return antwort({ error: "Ablage fehlgeschlagen." }, 500);
    }

    // Frisch lesen und nur die beiden eigenen Schlüssel ändern.
    const { data: inv } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const meta = (inv?.meta ?? {}) as Record<string, any>;
    const ordner: any[] = (Array.isArray(meta.kundenordner) ? meta.kundenordner : [])
      .filter((d: any) => d?.kategorie !== "Mietzuzahlung" || d?.fileUrl !== pfad);
    ordner.push({
      id: `ko-mietzuzahlung-${Date.now()}`, investmentId, kategorie: "Mietzuzahlung", filename,
      uploadedBy: "System (Mietzuzahlung)", uploadedAt: new Date().toISOString(), fileUrl: pfad, freigegeben: true,
    });
    await supabase.from("investments").update({
      meta: {
        ...meta,
        kundenordner: ordner,
        mietzuzahlung: { ...(meta.mietzuzahlung || {}), status: "unterschrieben", unterschriebenAm: anfrage.signed_at || new Date().toISOString(), unterschriebenVon: name, pdfPath: pfad },
      },
    }).eq("id", investmentId);

    const { data: kontakt } = await supabase.from("kontakte").select("zustaendig_id, vorname, nachname").eq("id", kontaktId).maybeSingle();
    if (kontakt?.zustaendig_id) {
      const kunde = `${kontakt.vorname ?? ""} ${kontakt.nachname ?? ""}`.trim() || name;
      await supabase.from("benachrichtigungen").insert({
        benutzer_id: kontakt.zustaendig_id,
        titel: `Mietzuzahlung unterschrieben: ${kunde}`,
        nachricht: `${kunde} hat die Vereinbarung über eine Mietzuzahlung digital unterzeichnet.`,
        link: `/kunden/${kontaktId}?tab=investments&investment=${investmentId}#aftersales`,
        gelesen: false,
      });
    }
    return antwort({ ok: true });
  } catch (e) {
    console.error("finalize-mietzuzahlung", e);
    return antwort({ error: "Unerwarteter Fehler." }, 500);
  }
});
