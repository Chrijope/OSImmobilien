import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  FA_META_SCHLUESSEL,
  FA_PERSON_TYPEN,
  faAlleUnterschrieben,
  faDatum,
  faPerson,
  faStandLesen,
  faUnterschriftenSetzen,
  istFaPersonTyp,
  type FaPerson,
  type PdfDokument,
} from "../_shared/finanzierungsanfrage.ts";

/**
 * Finanzierungsanfrage nach einer Kundenunterschrift abschließen (16.11.2026).
 *
 * Die Signaturseite unterschreibt über `sign_signature_request` und ruft dann
 * diese Function mit ihrem Token auf.
 *
 * - Zugang nur mit dem Token einer unterschriebenen, nicht abgelaufenen
 *   Anfrage `finanzierungsanfrage_p1/_p2`. Kontakt und Investment kommen aus
 *   der Anfrage, nie aus dem Aufruf.
 * - Gilt nur für die aktuelle Runde in `meta.finanzierungsanfrage`; eine
 *   überholte Runde ändert nichts mehr.
 * - Mit der letzten Unterschrift: Unterschriften, Ort und Datum auf Seite 6
 *   des beim Versand abgelegten PDFs, Ablage unter
 *   `kundenordner/<Kontakt>/<Investment>/`, Eintrag im Kundenordner
 *   (Kategorie „Finanzierungsanfrage“), Glocke an den zuständigen Partner.
 *   Die Unterschriften liest nur der Server; der Browser bekommt sie nie.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const antwort = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { token } = await req.json().catch(() => ({}));
    if (typeof token !== "string" || !token) return antwort({ error: "Unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: anfrage } = await supabase.from("signature_requests")
      .select("kontakt_id, investment_id, person_type, status, expires_at, name, signed_at, sa_data")
      .eq("token", token).maybeSingle();
    const gueltig = !!anfrage && istFaPersonTyp(anfrage.person_type) && anfrage.status === "signed"
      && !!anfrage.investment_id && !!anfrage.expires_at && new Date(anfrage.expires_at).getTime() > Date.now();
    if (!gueltig) return antwort({ error: "Unauthorized" }, 401);

    const kontaktId = anfrage.kontakt_id as string;
    const investmentId = anfrage.investment_id as string;
    const runde = (anfrage.sa_data as Record<string, any> | null)?.finanzierungsanfrage?.runde;

    const { data: inv } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const meta = (inv?.meta ?? {}) as Record<string, any>;
    const stand = faStandLesen(meta[FA_META_SCHLUESSEL]);
    // Eine neuere Sendung hat diese Runde abgelöst: nichts mehr ändern.
    if (!stand || stand.runde !== runde) return antwort({ ok: true, ueberholt: true });

    // Alle Anfragen dieser Runde; der Stand je Person kommt aus der Datenbank, nicht aus dem Aufruf.
    const { data: runden } = await supabase.from("signature_requests")
      .select("person_type, status, signed_at, signature_data")
      .eq("investment_id", investmentId).in("person_type", [...FA_PERSON_TYPEN])
      .eq("sa_data->finanzierungsanfrage->>runde", runde);
    const unterschriften: Partial<Record<FaPerson, string>> = {};
    let letzte = "";
    for (const r of runden || []) {
      if (!istFaPersonTyp(r.person_type) || r.status !== "signed") continue;
      const person = faPerson(r.person_type);
      const eintrag = stand.personen[person];
      if (!eintrag) continue;
      stand.personen[person] = { ...eintrag, status: "unterschrieben", unterschriebenAm: r.signed_at || new Date().toISOString() };
      if (typeof r.signature_data === "string") unterschriften[person] = r.signature_data;
      if ((r.signed_at || "") > letzte) letzte = r.signed_at || "";
    }

    const gesamt = Object.keys(stand.personen).length;
    const unterschrieben = Object.values(stand.personen).filter((p) => p?.status === "unterschrieben").length;
    const allSigned = faAlleUnterschrieben(stand);

    if (allSigned && !stand.pdfPath) {
      const { data: entwurf, error: ladeFehler } = await supabase.storage.from("unterlagen").download(stand.entwurfPfad);
      if (ladeFehler || !entwurf) {
        console.error("finalize-finanzierungsanfrage: Entwurf fehlt", ladeFehler);
        return antwort({ error: "Das PDF konnte nicht geladen werden." }, 500);
      }
      const doc = await PDFDocument.load(await entwurf.arrayBuffer());
      const ort = String((anfrage.sa_data as Record<string, any>)?.finanzierungsanfrage?.ort || "");
      await faUnterschriftenSetzen(doc as unknown as PdfDokument, { ort, datum: faDatum(letzte || new Date()), unterschriften });
      const bytes = await doc.save();

      const name = String(stand.personen.p1?.name || anfrage.name || "Kunde");
      const sicher = name.replace(/[^\wäöüÄÖÜß\- ]+/g, "").trim().replace(/\s+/g, "_") || "Kunde";
      const filename = `Finanzierungsanfrage_${sicher}_${faDatum(letzte || new Date()).replace(/\./g, "-")}.pdf`;
      const pfad = `kundenordner/${kontaktId}/${investmentId}/${filename}`;
      const { error: upFehler } = await supabase.storage.from("unterlagen").upload(pfad, bytes, { contentType: "application/pdf", upsert: true });
      if (upFehler) {
        console.error("finalize-finanzierungsanfrage: Ablage", upFehler);
        return antwort({ error: "Ablage fehlgeschlagen." }, 500);
      }
      stand.status = "unterschrieben";
      stand.pdfPath = pfad;
      stand.unterschriebenAm = letzte || new Date().toISOString();

      // Frisch lesen und nur die eigenen Schlüssel ändern.
      const { data: frisch } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
      const aktuell = (frisch?.meta ?? meta) as Record<string, any>;
      const ordner: any[] = (Array.isArray(aktuell.kundenordner) ? aktuell.kundenordner : [])
        .filter((d: any) => d?.fileUrl !== pfad);
      ordner.push({
        id: `ko-finanzierungsanfrage-${Date.now()}`, investmentId, kategorie: "Finanzierungsanfrage", filename,
        uploadedBy: "System (Finanzierungsanfrage)", uploadedAt: new Date().toISOString(), fileUrl: pfad, freigegeben: true,
      });
      await supabase.from("investments").update({ meta: { ...aktuell, kundenordner: ordner, [FA_META_SCHLUESSEL]: stand } }).eq("id", investmentId);

      const { data: kontakt } = await supabase.from("kontakte").select("zustaendig_id, vorname, nachname").eq("id", kontaktId).maybeSingle();
      if (kontakt?.zustaendig_id) {
        const kunde = `${kontakt.vorname ?? ""} ${kontakt.nachname ?? ""}`.trim() || name;
        await supabase.from("benachrichtigungen").insert({
          benutzer_id: kontakt.zustaendig_id,
          titel: `Finanzierungsanfrage unterschrieben: ${kunde}`,
          nachricht: `${kunde} hat die Finanzierungsanfrage digital unterschrieben. Das PDF liegt im Investment unter Finanzierung.`,
          link: `/kunden/${kontaktId}?tab=investments&investment=${investmentId}`,
          gelesen: false,
        });
      }
    } else if (!stand.pdfPath) {
      const { data: frisch } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
      const aktuell = (frisch?.meta ?? meta) as Record<string, any>;
      await supabase.from("investments").update({ meta: { ...aktuell, [FA_META_SCHLUESSEL]: stand } }).eq("id", investmentId);
    }

    return antwort({ ok: true, allSigned, signedCount: unterschrieben, totalRequests: gesamt });
  } catch (e) {
    console.error("finalize-finanzierungsanfrage", e);
    return antwort({ error: "Unerwarteter Fehler." }, 500);
  }
});
