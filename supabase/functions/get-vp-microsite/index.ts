import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { berufsbezeichnung, BERUF_IMMOBILIENBERATER } from '../_shared/berufsbezeichnung.ts'
import { beurteileLinkKuerzel } from "../_shared/lead-zuordnung.ts";
import { ladeMetaPixelFreigabe, type FreigabeClient } from "../_shared/meta-pixel-freigabe.ts";
import { pixelVerantwortlicherAus } from "../_shared/cookie-einwilligung.ts";

/**
 * Der Schlüssel in `app_config` für den Ansprechpartner-Kasten beim
 * Firmenlink der Handbuch-Seite (seit dem 26.09.2026): die Kennung des
 * Inhabers, Form `{"userId": "<Kennung>"}`. Über die Kennung, nie über den
 * Namen, denn Namen gibt es im Haus doppelt.
 */
const FIRMEN_ANSPRECHPARTNER_SCHLUESSEL = "handbuch_firmen_ansprechpartner";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);

    /*
     * `?firma=1`: der Inhaber für den Kasten beim Firmenlink der Handbuch-
     * Seite. Bewusst nur Name, Funktion und Bild, keine E-Mail und kein
     * Telefon: Die Seite ist öffentlich, und beim Firmenlink ruft nicht der
     * Inhaber an, sondern der zugewiesene Partner. Fehlt der Eintrag oder ist
     * er keine Kennung, gibt es leere Felder, und die Seite zeigt Initialen.
     */
    if (url.searchParams.get("firma") === "1") {
      const leer = { name: "", position: "", bild: null as string | null };
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: eintrag } = await admin
        .from("app_config")
        .select("wert")
        .eq("schluessel", FIRMEN_ANSPRECHPARTNER_SCHLUESSEL)
        .maybeSingle();
      const kennung = String((eintrag as { wert?: { userId?: unknown } } | null)?.wert?.userId ?? "").trim();
      let antwort = leer;
      if (UUID.test(kennung)) {
        const { data: p } = await admin.from("profiles").select("name, avatar_url").eq("id", kennung).maybeSingle();
        const { data: rollen } = await admin.from("user_roles").select("role").eq("user_id", kennung);
        const rollenListe = ((rollen ?? []) as Array<{ role?: string }>).map((r) => String(r?.role || "")).filter(Boolean);
        antwort = {
          name: String((p as { name?: string } | null)?.name ?? ""),
          position: berufsbezeichnung(rollenListe, "") || "",
          bild: (p as { avatar_url?: string } | null)?.avatar_url || null,
        };
      }
      return new Response(JSON.stringify(antwort), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300, s-maxage=600" },
      });
    }

    const slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    if (!slug || slug.length > 80 || !/^[a-z0-9-]+$/.test(slug)) {
      return new Response(JSON.stringify({ error: "Ungültiger Slug" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Profil per Slug holen
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("id, name, email, avatar_url, vp_slug, gesperrt")
      .eq("vp_slug", slug)
      .maybeSingle();

    if (pErr || !profile) {
      return new Response(JSON.stringify({ error: "Berater nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Sicherstellen dass Berater eine erlaubte Rolle hat
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);

    // Dieselbe Pruefung wie in `submit-lead` (Profil nicht gesperrt, Partner-
    // rolle), damit Seite und Lead-Zuordnung gleich urteilen: Wer eine Seite
    // bekommt, bekommt auch die Leads daraus, und umgekehrt. Ein gesperrter
    // Partner bekommt dieselbe Antwort wie ein unbekanntes Kuerzel, ohne
    // Name, E-Mail, Telefon, Buchungslink oder Pixel. Die Seiten zeigen dann
    // ihre Ansicht fuer ein unbekanntes Kuerzel (Mikroseite: „nicht
    // gefunden“, Handbuch: Firmenansicht).
    if (beurteileLinkKuerzel({ kuerzelGueltig: true, profil: profile, rollen: roles }) !== "ok") {
      return new Response(JSON.stringify({ error: "Berater nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    // 3. Persönliche Settings (Telefon, Position, Signatur)
    const { data: settings } = await supabase
      .from("user_settings" as any)
      .select("einstellungen")
      .eq("user_id", profile.id)
      .maybeSingle();

    const eins: any = (settings as any)?.einstellungen || {};
    const profil: any = eins.profil || {};
    const emailSettings: any = eins.email || {};

    // Buchungslink: erst aus profiles, sonst aus Settings
    const { data: profileFull } = await supabase
      .from("profiles")
      .select("buchungslink")
      .eq("id", profile.id)
      .maybeSingle();

    const buchungslink: string =
      (profileFull as any)?.buchungslink ||
      profil?.buchungslink ||
      eins?.buchungslink ||
      "";

    // Robuste Name-Komposition (Trim, leere Teile abfangen)
    const vname = (profil?.vorname || "").trim();
    const nname = (profil?.nachname || "").trim();
    const fullName = (vname || nname) ? `${vname} ${nname}`.trim() : (profile.name || "");

    // E-Mail-Fallback: signatur.email → profiles.email → eins.email (string)
    const email: string =
      emailSettings?.signatur?.email ||
      profile.email ||
      (typeof eins?.email === "string" ? eins.email : "") ||
      "";

    // Telefon-Fallback: profil.telefon → eins.telefon (legacy)
    const telefon: string = profil?.telefon || eins?.telefon || "";

    // Die Bezeichnung unter dem Namen kommt aus der Nutzerrolle, nicht aus
    // dem Positionsfeld: Dort steht bei vielen Partnern noch die maschinell
    // eingetragene Rollenkennung, und die liest hier ein Interessent.
    const { data: rollenZeilen } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", profile.id);
    const rollen = ((rollenZeilen ?? []) as Array<{ role?: string }>)
      .map((r) => String(r?.role || ""))
      .filter(Boolean);
    const position: string =
      berufsbezeichnung(rollen, profil?.position || eins?.position) || BERUF_IMMOBILIENBERATER;

    // Meta-Pixel-ID des Partners (Einstellungen, Bereich Marketing). Es geht
    // nur die reine Zahlenfolge raus, alles andere wird verworfen. Mehr als
    // die ID (etwa das Conversion-API-Token) verlaesst den Server nie.
    const marketing: any = eins.marketing || {};
    const rohePixelId =
      typeof marketing.metaPixelId === "string" ? marketing.metaPixelId.trim() : "";
    // Das Pixel laedt nur, wenn BEIDES gilt (seit 27.09.2026):
    // 1. Der Partner darf es nutzen: Vertrag mit Anlage 4, Bestandsschutz
    //    oder Admin (meta-pixel-freigabe). Das Feld in user_settings schreibt
    //    er selbst, deshalb entscheidet der Server.
    // 2. Es gibt eine Geschaeftsanschrift: Der Cookie-Hinweis nennt den
    //    Partner mit Name und Anschrift als gemeinsam Verantwortlichen. Name
    //    und Anschrift gehen nur mit aktivem Pixel raus.
    const gueltigePixelId = /^\d{5,20}$/.test(rohePixelId) ? rohePixelId : null;
    const pixelFreigegeben = !!gueltigePixelId
      && (await ladeMetaPixelFreigabe(supabase as unknown as FreigabeClient, profile.id)).erlaubt;
    const pixelVerantwortlicher = pixelFreigegeben ? pixelVerantwortlicherAus(eins.gewerbedaten, fullName) : null;
    const metaPixelId = pixelVerantwortlicher ? gueltigePixelId : null;

    return new Response(
      JSON.stringify({
        userId: profile.id,
        slug: profile.vp_slug,
        name: fullName,
        email,
        telefon,
        position,
        bild: profile.avatar_url || null,
        buchungslink,
        metaPixelId,
        pixelVerantwortlicher,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          // Kurz, damit eine Sperre nach hoechstens drei Minuten greift.
          "Cache-Control": "public, max-age=60, s-maxage=120",
        },
      },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
