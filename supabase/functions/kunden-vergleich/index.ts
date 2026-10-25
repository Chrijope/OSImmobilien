/**
 * kunden-vergleich: zwei bis drei Kunden-Exposés in einem Link (25.10.2026).
 *
 * Zwei Wege:
 *
 *   POST (angemeldet): einen Vergleich anlegen. Dieselben Prüfungen wie beim
 *     Exposé-Versand: Mengenbremse, interne Rolle mit Kundenaktionen, Zugriff
 *     auf genau diesen Kontakt (`pruefeKontaktZugriff`). Gebündelt werden nur
 *     schon gesendete, noch gültige Einheiten-Exposés desselben Kunden und
 *     Investments (`regeln.ts`). Es geht keine Mail hinaus: Der Partner
 *     kopiert den Link. Am Kunden entsteht eine Aktivität.
 *
 *   GET ?token= (öffentlich, wie `get-expose`): die Übersicht für die Seite
 *     /vergleich/<token>. Je Einheit nur, was das Exposé auch zeigt, über
 *     dieselben Positivlisten (`_shared/expose-oeffentlich.ts`), dazu der
 *     Link ins jeweilige Exposé. Abgelaufen oder zurückgezogen: nur der
 *     Hinweis mit den vier Angaben des Partners. Beim ersten Aufruf
 *     (`aufruf=1`, nicht `vorschau=1`) eine Glocke an den Partner, gezählt
 *     werden nur Anzahl und Zeitpunkte.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitErrorBody } from "../_shared/rate-limit.ts";
import { pruefeKontaktZugriff } from "../_shared/kontakt-signatur-zugriff.ts";
import { hatKundenaktionsRolle } from "../_shared/kundenaktionen-rollen.ts";
import { istExposeToken, oeffentlicherAnsprechpartner, oeffentlichesObjekt, oeffentlicheWohnung } from "../_shared/expose-oeffentlich.ts";
import { glockenEmpfaenger, linkZustand } from "../_shared/expose-kundenlink.ts";
import { kundenExposeLink } from "../_shared/kunden-expose.ts";
import { spracheAusMeta } from "../_shared/kunden-sprache.ts";
import { ohneFremdePartner } from "../_shared/glocke-zustaendiger.ts";
import {
  pruefeExposesFuerVergleich, pruefeVergleichAuftrag, vergleichGlockenTitel, vergleichLink, type ExposeZeileFuerVergleich,
} from "./regeln.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ZUGRIFF_ABGELEHNT = "Für diesen Kunden darfst du keinen Vergleich anlegen.";

function antwort(body: unknown, status = 200, privat = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(privat ? { "Cache-Control": "private, no-store" } : {}) },
  });
}

// ── Anlegen ──────────────────────────────────────────────────────────────

async function anlegen(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return antwort({ error: "Nicht autorisiert" }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const callerClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return antwort({ error: "Nicht autorisiert" }, 401);

  let body: unknown;
  try { body = await req.json(); } catch { return antwort({ error: "Ungültige Anfrage" }, 400); }
  const geprueft = pruefeVergleichAuftrag(body);
  if (!geprueft.ok) return antwort({ error: geprueft.fehler }, 400);
  const auftrag = geprueft.auftrag;

  const limit = await checkRateLimit(req, caller.id, { scope: "kunden-vergleich", perHour: 30, perDay: 150, failClosed: true });
  if (!limit.ok) return rateLimitErrorBody("kunden-vergleich", limit, corsHeaders);

  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: intern } = await callerClient.rpc("is_internal_role", { _user_id: caller.id });
  if (intern !== true) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);
  const { data: rollen, error: rollenFehler } = await supabase.from("user_roles").select("role").eq("user_id", caller.id);
  if (rollenFehler || !hatKundenaktionsRolle(((rollen || []) as Array<{ role?: unknown }>).map((r) => r.role))) {
    return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);
  }
  const { erlaubt } = await pruefeKontaktZugriff(
    supabase as unknown as Parameters<typeof pruefeKontaktZugriff>[0],
    callerClient as unknown as Parameters<typeof pruefeKontaktZugriff>[1],
    auftrag.kontaktId,
    caller.id,
  );
  if (!erlaubt) return antwort({ error: ZUGRIFF_ABGELEHNT }, 403);

  const { data: zeilen, error: zeilenFehler } = await supabase
    .from("objekt_exposes")
    .select("id, kontakt_id, investment_id, objekt_id, wohnung_id, art, gueltig_bis, zurueckgezogen_am")
    .in("id", auftrag.exposeIds);
  if (zeilenFehler) throw new Error(`objekt_exposes: ${zeilenFehler.message}`);
  const passt = pruefeExposesFuerVergleich(auftrag, (zeilen || []) as ExposeZeileFuerVergleich[]);
  if (!passt.ok) return antwort({ error: passt.fehler }, 400);

  const { data: neu, error: neuFehler } = await supabase
    .from("expose_vergleiche")
    .insert({ kontakt_id: auftrag.kontaktId, investment_id: auftrag.investmentId, expose_ids: auftrag.exposeIds, erstellt_von: caller.id, gueltig_bis: passt.gueltigBis })
    .select("id, token, gueltig_bis")
    .single();
  if (neuFehler) {
    if (neuFehler.code === "42P01" || neuFehler.code === "PGRST205") return antwort({ error: "Migration Vergleichslink noch nicht ausgeführt.", migrationFehlt: true }, 409);
    throw new Error(`expose_vergleiche: ${neuFehler.message}`);
  }
  const link = vergleichLink(String(neu.token));

  // Aktivität am Kunden. Beiwerk: Scheitert sie, steht der Vergleich trotzdem.
  try {
    const { data: absender } = await supabase.from("profiles").select("name").eq("id", caller.id).maybeSingle();
    const frist = new Date(passt.gueltigBis).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
    const { error } = await supabase.from("aktivitaeten").insert({
      kunde_id: auftrag.kontaktId,
      art: "notiz",
      beschreibung: `Vergleichslink mit ${auftrag.exposeIds.length} Einheiten erzeugt (gültig bis ${frist})`,
      von: (typeof absender?.name === "string" && absender.name.trim()) || "System",
      benutzer_id: caller.id,
      datum: new Date().toISOString(),
    });
    if (error) console.error("[kunden-vergleich] Aktivität nicht angelegt:", error.message);
  } catch (fehler) {
    console.error("[kunden-vergleich] Aktivität nicht angelegt:", fehler);
  }
  return antwort({ ok: true, vergleichId: neu.id, link, gueltigBis: neu.gueltig_bis });
}

// ── Öffentlich lesen ─────────────────────────────────────────────────────

interface VergleichZeile {
  id: string;
  kontakt_id: string;
  expose_ids: string[];
  erstellt_von: string;
  gueltig_bis: string;
  zurueckgezogen_am: string | null;
  aufrufe: number | null;
  erstmals_aufgerufen_am: string | null;
}

/** Erstes Bild einer Einheit, sonst des Objekts. Nur Adressen, die nicht eingebettet sind. */
function erstesBild(wohnung: Record<string, unknown>, objekt: Record<string, unknown>, objektBilder: Array<Record<string, unknown>>): string | null {
  const meta = (wohnung.meta || {}) as { bilder?: Array<{ url?: unknown }> };
  const kandidaten = [
    ...(meta.bilder || []).map((b) => b?.url),
    ...((wohnung.wohnungs_bilder as Array<{ url?: unknown }> | undefined) || []).map((b) => b?.url),
    objekt.bild_url,
    ...objektBilder.map((b) => b.url),
  ];
  const url = kandidaten.find((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  return url ?? null;
}

async function lesen(req: Request, url: URL): Promise<Response> {
  const token = url.searchParams.get("token");
  if (!istExposeToken(token)) return antwort({ error: "Ungültiger Link" }, 400);
  const zaehlen = url.searchParams.get("aufruf") === "1" && url.searchParams.get("vorschau") !== "1";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: v, error } = await supabase
    .from("expose_vergleiche")
    .select("id, kontakt_id, expose_ids, erstellt_von, gueltig_bis, zurueckgezogen_am, aufrufe, erstmals_aufgerufen_am")
    .eq("token", token)
    .maybeSingle();
  if (error || !v) return antwort({ error: "Vergleich nicht gefunden" }, 404);
  const vergleich = v as VergleichZeile;

  const { data: kontakt } = await supabase.from("kontakte").select("vorname, nachname, zustaendig_id, meta, geloescht").eq("id", vergleich.kontakt_id).maybeSingle();
  const sprache = kontakt ? spracheAusMeta(kontakt.meta) : undefined;
  const partnerId = kontakt?.zustaendig_id || vergleich.erstellt_von;
  const { data: profil } = await supabase.from("profiles").select("name, telefon, email, avatar_url").eq("id", partnerId).maybeSingle();
  const ansprechpartner = oeffentlicherAnsprechpartner(profil);

  if (linkZustand(vergleich) === "abgelaufen") {
    return antwort({ abgelaufen: true, ...(ansprechpartner ? { ansprechpartner } : {}), ...(sprache ? { sprache } : {}) }, 410);
  }

  const { data: exposes } = await supabase
    .from("objekt_exposes")
    .select("id, token, objekt_id, wohnung_id, gueltig_bis, zurueckgezogen_am")
    .in("id", vergleich.expose_ids);
  const gueltige = ((exposes || []) as Array<{ id: string; token: string; objekt_id: string; wohnung_id: string | null; gueltig_bis: string | null; zurueckgezogen_am: string | null }>)
    .filter((e) => e.wohnung_id && linkZustand(e) === "gueltig")
    // Reihenfolge wie beim Anlegen gewählt.
    .sort((a, b) => vergleich.expose_ids.indexOf(a.id) - vergleich.expose_ids.indexOf(b.id));

  const einheiten = [];
  for (const e of gueltige) {
    const [{ data: objekt }, { data: wohnung }, { data: objektBilder }] = await Promise.all([
      supabase.from("objekte").select("*").eq("id", e.objekt_id).eq("sichtbar", true).maybeSingle(),
      supabase.from("wohnungen").select("*, wohnungs_bilder(url)").eq("id", e.wohnung_id!).eq("objekt_id", e.objekt_id).maybeSingle(),
      supabase.from("objekt_bilder").select("url").eq("objekt_id", e.objekt_id).order("reihenfolge").limit(1),
    ]);
    if (!objekt || !wohnung) continue;
    const o = objekt as Record<string, unknown>;
    const w = wohnung as Record<string, unknown>;
    const oeffObjekt = oeffentlichesObjekt(o);
    einheiten.push({
      objekt: { titel: oeffObjekt.titel, ort: oeffObjekt.ort, plz: oeffObjekt.plz, adresse: oeffObjekt.adresse },
      wohnung: oeffentlicheWohnung(w),
      bild: erstesBild(w, o, (objektBilder || []) as Array<Record<string, unknown>>),
      exposeLink: kundenExposeLink(e.objekt_id, e.wohnung_id, e.token),
    });
  }

  if (zaehlen) await zaehlenUndLaeuten(supabase, vergleich, kontakt as { vorname?: string | null; nachname?: string | null; zustaendig_id?: string | null; geloescht?: boolean | null } | null, einheiten.length);

  return antwort({
    einheiten,
    ...(ansprechpartner ? { ansprechpartner } : {}),
    ...(sprache ? { sprache } : {}),
  });
}

/** Zählen und beim ersten Aufruf die Glocke. Wirft nie, die Seite geht auch ohne beides hinaus. */
async function zaehlenUndLaeuten(
  supabase: SupabaseClient,
  vergleich: VergleichZeile,
  kontakt: { vorname?: string | null; nachname?: string | null; zustaendig_id?: string | null; geloescht?: boolean | null } | null,
  anzahl: number,
): Promise<void> {
  try {
    const zeit = new Date().toISOString();
    let erster = false;
    if (!vergleich.erstmals_aufgerufen_am) {
      // Nur eine gleichzeitige Anfrage gewinnt den ersten Aufruf.
      const { data } = await supabase.from("expose_vergleiche").update({ erstmals_aufgerufen_am: zeit })
        .eq("id", vergleich.id).is("erstmals_aufgerufen_am", null).select("id");
      erster = Array.isArray(data) && data.length > 0;
    }
    await supabase.from("expose_vergleiche").update({ aufrufe: (vergleich.aufrufe || 0) + 1, zuletzt_aufgerufen_am: zeit }).eq("id", vergleich.id);
    if (!erster) return;
    const empfaenger = await ohneFremdePartner(
      supabase,
      glockenEmpfaenger(kontakt?.zustaendig_id, null, vergleich.erstellt_von),
      kontakt?.zustaendig_id,
      !!kontakt && kontakt.geloescht !== true,
    );
    if (empfaenger.length === 0) return;
    const { error } = await supabase.from("benachrichtigungen").insert(empfaenger.map((benutzerId) => ({
      benutzer_id: benutzerId,
      titel: vergleichGlockenTitel(kontakt?.vorname, kontakt?.nachname),
      nachricht: `Der Vergleich mit ${anzahl} ${anzahl === 1 ? "Einheit" : "Einheiten"} wurde zum ersten Mal aufgerufen.`,
      link: `/kunden/${vergleich.kontakt_id}`,
      gelesen: false,
    })));
    if (error) console.error("[kunden-vergleich] Glocke nicht gesetzt:", error.message);
  } catch (fehler) {
    console.error("[kunden-vergleich] Zählen oder Glocke fehlgeschlagen:", fehler instanceof Error ? fehler.message : fehler);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method === "POST") return await anlegen(req);
    return await lesen(req, new URL(req.url));
  } catch (fehler) {
    // Keine internen Fehlertexte nach außen, die Einzelheiten stehen im Protokoll.
    console.error("[kunden-vergleich]", fehler instanceof Error ? fehler.message : fehler);
    return antwort({ error: "Der Vergleich konnte nicht geladen werden." }, 500);
  }
});
