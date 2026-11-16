import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { sendeVorlage } from "../_shared/transactional-versand.ts";
import { zustaendigerAnsprechpartner } from "../_shared/zustaendiger-ansprechpartner.ts";
import { signaturAblauf, signaturAblaufText } from "../_shared/signatur-frist.ts";
import { hatMeldeRolle } from "../_shared/finanzierung-partner-benachrichtigen.ts";
import {
  emailIstBrauchbar,
  empfaengerAusKontakt,
  pruefeKontaktZugriff,
  ZUGRIFF_ABGELEHNT,
} from "../_shared/kontakt-signatur-zugriff.ts";
import {
  FA_META_SCHLUESSEL,
  FA_PERSON_TYPEN,
  faStandLesen,
  type FaAnfrageDaten,
  type FaPerson,
  type FaPersonTyp,
  type FaStand,
} from "../_shared/finanzierungsanfrage.ts";

/**
 * Finanzierungsanfrage den Käufern zur Unterschrift schicken (16.11.2026),
 * gebaut wie `send-mietzuzahlung-signatur`.
 *
 * - Senden dürfen dieselben Rollen wie beim Finanzierungspartner
 *   (admin, inhaber, vertriebsleiter, backoffice), dazu Zugriff auf den Kunden.
 * - Nur mit vollständig unterschriebener Selbstauskunft. Der Browser schickt
 *   das gefüllte PDF und den Stand der Selbstauskunft (`saSignedAt`), aus dem
 *   er es gebaut hat; weicht der vom gespeicherten ab, wird abgelehnt.
 * - Das PDF wird als Entwurf abgelegt; `finalize-finanzierungsanfrage` setzt
 *   später die Unterschriften genau in dieses PDF.
 * - Jeder Käufer bekommt einen eigenen Link. Offene ältere Anfragen werden
 *   überholt, damit nur die neue Runde gilt.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const SIGNATURE_BASE_URL = "https://osimmobilien.netlify.app/signatur";

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

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return antwort({ error: "Nicht autorisiert" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) return antwort({ error: "Nicht autorisiert" }, 401);

    const rl = await checkRateLimit(req, caller.id, { scope: "send-finanzierungsanfrage-signatur", perHour: 10, perDay: 50 });
    if (!rl.ok) return rateLimitErrorBody("send-finanzierungsanfrage-signatur", rl, corsHeaders);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const investmentId = text(body.investmentId);
    if (!investmentId) return antwort({ error: "Investment fehlt." }, 400);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rolle aus der Datenbank, nie aus dem Aufruf.
    const { data: rollen } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
    if (!hatMeldeRolle((rollen || []).map((r: { role: string }) => r.role))) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);

    const { data: inv, error: invFehler } = await supabase
      .from("investments").select("kunde_id, meta").eq("id", investmentId).maybeSingle();
    if (invFehler || !inv?.kunde_id) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);
    const kontaktId = inv.kunde_id as string;

    const { erlaubt, kontakt } = await pruefeKontaktZugriff(
      supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
      callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
      kontaktId,
      caller.id,
    );
    if (!erlaubt || !kontakt) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);

    const meta = (inv.meta ?? {}) as Record<string, any>;
    const sa = (meta.saData || meta.saSnapshot) as Record<string, any> | undefined;
    if (meta.saSigned !== true || !sa) {
      return antwort({ error: "Die Selbstauskunft ist noch nicht vollständig unterschrieben." }, 400);
    }
    const saSignedAt = meta.saSignedAt ?? null;
    if (String(saSignedAt ?? "") !== String(body.saSignedAt ?? "")) {
      return antwort({ error: "Die Selbstauskunft wurde inzwischen geändert. Bitte die Seite neu laden und erneut senden." }, 409);
    }
    const bisher = faStandLesen(meta[FA_META_SCHLUESSEL]);
    if (bisher?.status === "unterschrieben" && String(bisher.saSignedAt ?? "") === String(saSignedAt ?? "")) {
      return antwort({ error: "Die Finanzierungsanfrage ist zu dieser Selbstauskunft bereits unterschrieben." }, 409);
    }

    const pdf = pdfAusBase64(body.pdfBase64);
    if (!pdf) return antwort({ error: "Kein gültiges PDF." }, 400);
    // Nur die erwarteten Felder mit passendem Typ; sie landen in der Anfrage und im PDF des Kunden.
    const roh = body.objekt && typeof body.objekt === "object" ? body.objekt as Record<string, unknown> : null;
    const kurz = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : undefined);
    const zahl = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1e9 ? v : undefined);
    const objekt = roh ? {
      strasse: kurz(roh.strasse), plz: kurz(roh.plz), ort: kurz(roh.ort),
      baujahr: zahl(roh.baujahr), wohnflaeche: zahl(roh.wohnflaeche), kaufpreis: zahl(roh.kaufpreis),
    } : null;

    // Empfänger: Person 1 immer, Person 2, wenn die Selbstauskunft sie führt.
    const p1 = empfaengerAusKontakt(kontakt, "finanzierungsanfrage_p1");
    const personen: { person: FaPerson; typ: FaPersonTyp; name: string; email: string }[] = [{
      person: "p1", typ: "finanzierungsanfrage_p1",
      name: p1.name || `${text(sa.vorname)} ${text(sa.nachname)}`.trim(),
      email: p1.email || text(sa.email),
    }];
    if (sa.person2 === true && sa.person2Data) {
      const p2Kontakt = text(((kontakt.meta ?? {}) as Record<string, any>).person2?.email);
      const p2Name = empfaengerAusKontakt(kontakt, "finanzierungsanfrage_p2").name;
      personen.push({
        person: "p2", typ: "finanzierungsanfrage_p2",
        name: p2Name || `${text(sa.person2Data.vorname)} ${text(sa.person2Data.nachname)}`.trim(),
        email: p2Kontakt || text(sa.person2Data.email) || personen[0].email,
      });
    }
    const ohneMail = personen.find((p) => !emailIstBrauchbar(p.email));
    if (ohneMail) {
      return antwort({ error: `Für ${ohneMail.name || (ohneMail.person === "p1" ? "Person 1" : "Person 2")} ist keine gültige E-Mail-Adresse hinterlegt.` }, 400);
    }

    const runde = crypto.randomUUID();
    const entwurfPfad = `kundenordner/${kontaktId}/${investmentId}/finanzierungsanfrage/entwurf-${runde}.pdf`;
    const { error: upFehler } = await supabase.storage.from("unterlagen").upload(entwurfPfad, pdf, { contentType: "application/pdf", upsert: false });
    if (upFehler) {
      console.error("send-finanzierungsanfrage-signatur: Ablage", upFehler);
      return antwort({ error: "Das PDF konnte nicht abgelegt werden." }, 500);
    }

    await supabase.from("signature_requests").update({ status: "ueberholt" })
      .eq("investment_id", investmentId).in("person_type", [...FA_PERSON_TYPEN]).eq("status", "pending");

    const daten: FaAnfrageDaten = { runde, sa, objekt, ort: text(sa.ort) };
    const expiresAt = signaturAblauf();
    const berater = await zustaendigerAnsprechpartner(supabase, kontaktId);
    const objektTitel = [text(objekt?.strasse), text(objekt?.ort)].filter(Boolean).join(", ");
    const stand: FaStand = {
      status: "gesendet",
      runde,
      gesendetAm: new Date().toISOString(),
      saSignedAt,
      entwurfPfad,
      personen: {},
    };

    for (const p of personen) {
      const token = crypto.randomUUID();
      const { error: insertFehler } = await supabase.from("signature_requests").insert({
        token,
        kontakt_id: kontaktId,
        investment_id: investmentId,
        name: p.name,
        email: p.email,
        person_type: p.typ,
        sa_data: { finanzierungsanfrage: daten },
        status: "pending",
        expires_at: expiresAt,
      });
      if (insertFehler) {
        console.error("Finanzierungsanfrage: Anfrage nicht angelegt", insertFehler);
        return antwort({ error: "Die Anfrage konnte nicht angelegt werden." }, 500);
      }
      const versand = await sendeVorlage(supabase, {
        templateName: "finanzierungsanfrage-signatur",
        recipientEmail: p.email,
        idempotencyKey: `fa-sig-${token}`,
        templateData: {
          name: p.name,
          signUrl: `${SIGNATURE_BASE_URL}?token=${token}&type=${p.typ}`,
          gueltigBis: signaturAblaufText(expiresAt),
          objektTitel,
          ...(berater ? { berater } : {}),
        },
        metadata: { kontakt_id: kontaktId, investment_id: investmentId, person_type: p.typ },
      });
      stand.personen[p.person] = { name: p.name, email: p.email, status: "offen", versandOk: versand.ok };
    }

    // Frisch lesen, damit eine Änderung seit dem Laden nicht verloren geht.
    const { data: frisch } = await supabase.from("investments").select("meta").eq("id", investmentId).maybeSingle();
    const aktuell = (frisch?.meta ?? meta) as Record<string, unknown>;
    await supabase.from("investments").update({ meta: { ...aktuell, [FA_META_SCHLUESSEL]: stand } }).eq("id", investmentId);

    const fehlgeschlagen = Object.values(stand.personen).filter((p) => p && !p.versandOk);
    if (fehlgeschlagen.length) {
      return antwort({ ok: false, stand, grund: `Mail nicht zugestellt an ${fehlgeschlagen.map((p) => p!.email).join(", ")}` }, 502);
    }
    return antwort({ ok: true, stand });
  } catch (e) {
    console.error("send-finanzierungsanfrage-signatur", e);
    return antwort({ error: "Unerwarteter Fehler beim Versand." }, 500);
  }
});
