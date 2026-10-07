import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { LinkTeilenKnoepfe } from "@/components/teilen/LinkTeilenKnoepfe";
import { Loader2, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { getProfilePic } from "@/lib/chatStore";
import { supabase } from "@/integrations/supabase/client";

import BeraterMicrositeContent from "@/components/landing/BeraterMicrositeContent";
import LeadFunnelDialog from "@/components/landing/LeadFunnelDialog";
import FloatingBeraterBadge, { BeraterInfo } from "@/components/landing/FloatingBeraterBadge";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "@/components/landing/mikroseiteAbschlussTexte";
import { SeitenSpracheProvider, useSeitenTexte } from "@/components/SeitenSprache";

import { getUserSetting } from "@/lib/userSettingsCache";
import { nurEchteBezeichnung, BERUF_IMMOBILIENBERATER } from "@/lib/berufsbezeichnung";
import { eigeneBerufsbezeichnung } from "@/lib/beraterProfil";
import { buildVpUrl } from "@/lib/publicUrl";
import { leseVerantwortlicher, useMetaPixelMitEinwilligung } from "@/hooks/useMetaPixelMitEinwilligung";
import { tippgeberKlickErstmals, tippgeberKlickMelden } from "@/lib/tippgeberKlick";

interface BeraterDataExtended extends BeraterInfo {
  userId?: string;
  slug?: string;
  buchungslink?: string;
  metaPixelId?: string | null;
  pixelVerantwortlicher?: { name: string; anschrift: string } | null;
}

/**
 * Der bisherige Inhalt der Seite. Die Hülle unten legt die Seitensprache um
 * ihn (Plan Kundensprache, Etappe 6), auch um die Vorschau im CRM, damit ein
 * Partner seine Seite mit `?lang=en` prüfen kann. Die CRM-Texte der Vorschau
 * (Kopfzeile, „Link kopieren“, Warnhinweis) bleiben bewusst deutsch.
 */
const BeraterMicroseiteInhalt = () => {
  const rahmen = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).rahmen;
  const { user, isLoggedIn, authUser } = useUser();
  const params = useParams<{ slug?: string }>();
  const publicSlug = params.slug || null;
  const [sp] = useSearchParams();
  const tgParam = sp.get("tg") || null;
  const isUuid = (v: string | null) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const [tippgeberId, setTippgeberId] = useState<string | null>(isUuid(tgParam) ? tgParam : null);

  // Tippgeber-Name optional über zusätzlichen Lookup (gut für Funnel-Meta)
  const [tippgeberName, setTippgeberName] = useState<string | null>(null);
  useEffect(() => {
    if (!tgParam) return;
    let cancelled = false;
    (async () => {
      try {
        if (isUuid(tgParam)) {
          const { data } = await supabase
            .from("tippgeber" as any)
            .select("vorname, nachname")
            .eq("id", tgParam)
            .maybeSingle();
          const t: any = data;
          if (!cancelled && t) {
            const name = `${t.vorname || ""} ${t.nachname || ""}`.trim();
            if (name) setTippgeberName(name);
          }
        } else if (publicSlug) {
          // Resolve human-readable slug (e.g. "max-mustermann") via RPC
          const { data } = await (supabase as any).rpc("resolve_tippgeber_slug", {
            _vp_slug: publicSlug,
            _tg_slug: tgParam,
          });
          const row = Array.isArray(data) ? data[0] : data;
          if (!cancelled && row) {
            setTippgeberId((row as any).id || null);
            const name = `${(row as any).vorname || ""} ${(row as any).nachname || ""}`.trim();
            if (name) setTippgeberName(name);
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [tgParam, publicSlug]);

  // ── Klick-Tracking: einmal pro Browser-Session pro tg-Param zählen ──
  // Im Browser gemerkt wird das nur mit Statistik-Einwilligung, siehe
  // `tippgeberKlick.ts`.
  // Gezählt wird nur auf der öffentlichen Seite und mit dem Partnerkürzel,
  // denn ein Tippgeberkürzel ist nur je Partner eindeutig.
  useEffect(() => {
    if (!tgParam || !publicSlug) return;
    if (!tippgeberKlickErstmals(`${publicSlug}/${tgParam}`)) return;
    tippgeberKlickMelden((name, args) => (supabase as any).rpc(name, args), publicSlug, tgParam)
      .catch(() => { /* ignore – Tracking ist best-effort */ });
  }, [tgParam, publicSlug]);

  const [funnelOpen, setFunnelOpen] = useState(false);
  const [berater, setBerater] = useState<BeraterDataExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownSlug, setOwnSlug] = useState<string | null>(null);

  const openFunnel = () => setFunnelOpen(true);

  // ─── Meta Pixel: nur öffentliche Seite, nur mit Einwilligung ──
  // Hat der Partner eine Pixel-ID hinterlegt, lädt das Skript von Meta erst,
  // wenn der Besucher im Cookie-Banner "Marketing" erlaubt hat. Gefragt wird
  // seit dem 26.09.2026 im gemeinsamen Banner aller öffentlichen Seiten
  // (`CookieBanner` in App.tsx), nicht mehr in einem eigenen Pixel-Banner.
  // Nimmt der Besucher die Einwilligung zurück, lädt der Banner die Seite neu.
  // Seit dem 27.09.2026 gilt die Einwilligung je Partner, der Banner nennt
  // ihn mit Name und Anschrift (`pixelVerantwortlicher`).
  useMetaPixelMitEinwilligung(publicSlug ? berater : null);

  // ─── Eigenes Profil (für eingeloggten VP) ────────────────
  const getOwnBeraterInfo = (extras?: {
    buchungslink?: string;
    email?: string;
    avatarUrl?: string;
    profil?: any;
    emailSettings?: any;
  }): BeraterDataExtended => {
    // WICHTIG: Vorschau muss exakt die Datenquelle der öffentlichen Microseite
    // spiegeln (Edge Function `get-vp-microsite` liest ausschließlich aus
    // `user_settings`/`profiles`). Ein localStorage-Fallback würde den VP
    // glauben lassen, seine Telefonnummer sei hinterlegt, obwohl Besucher
    // sie nicht sehen – exakt der gemeldete Bug.
    const profil: any = extras?.profil ?? getUserSetting<any>("profil", null);
    const emailSettings: any = extras?.emailSettings ?? getUserSetting<any>("email", null);
    const profilBild = extras?.avatarUrl || getProfilePic();
    const vname = profil?.vorname?.trim() || "";
    const nname = profil?.nachname?.trim() || "";
    const fullName = (vname || nname) ? `${vname} ${nname}`.trim() : user.name;
    return {
      name: fullName,
      telefon: profil?.telefon || "",
      email: emailSettings?.signatur?.email || extras?.email || "",
      position: eigeneBerufsbezeichnung(profil?.position) || BERUF_IMMOBILIENBERATER,
      buchungslink: extras?.buchungslink || profil?.buchungslink || "",
      userId: authUser?.id,
      bild: profilBild || null,
    };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Public Slug-View → Edge Function Lookup
      if (publicSlug) {
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "irwdgutegmivbtgmftyc";
          const res = await fetch(
            `https://${projectId}.supabase.co/functions/v1/get-vp-microsite?slug=${encodeURIComponent(publicSlug)}`,
          );
          if (!res.ok) {
            if (!cancelled) {
              setBerater(null);
              setLoading(false);
            }
            return;
          }
          const json = await res.json();
          if (!cancelled) {
            setBerater({
              name: json.name,
              telefon: json.telefon,
              email: json.email,
              position: nurEchteBezeichnung(json.position) || BERUF_IMMOBILIENBERATER,
              bild: json.bild,
              userId: json.userId,
              slug: json.slug,
              buchungslink: json.buchungslink || "",
              metaPixelId: typeof json.metaPixelId === "string" ? json.metaPixelId : null,
              pixelVerantwortlicher: leseVerantwortlicher(json.pixelVerantwortlicher),
            });
            setLoading(false);
          }
        } catch (e) {
          console.error(e);
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // Logged-in Vorschau-View
      if (isLoggedIn) {
        // Buchungslink + avatar_url + email aus profiles laden
        // UND Profil/Email-Settings live aus user_settings (verhindert leere
        // Felder, wenn dataCache noch nicht hydratisiert ist).
        let extras: {
          buchungslink?: string;
          email?: string;
          avatarUrl?: string;
          profil?: any;
          emailSettings?: any;
        } = {};
        try {
          if (authUser?.id) {
            const [{ data }, { data: settingsRow }] = await Promise.all([
              supabase
                .from("profiles")
                .select("buchungslink, avatar_url, email")
                .eq("id", authUser.id)
                .maybeSingle(),
              supabase
                .from("user_settings" as any)
                .select("einstellungen")
                .eq("user_id", authUser.id)
                .maybeSingle(),
            ]);
            const eins: any = (settingsRow as any)?.einstellungen || {};
            if (data) {
              extras = {
                buchungslink: (data as any).buchungslink || "",
                email: (data as any).email || "",
                avatarUrl: (data as any).avatar_url || "",
                profil: eins.profil || null,
                emailSettings: eins.email || null,
              };
            } else {
              extras = {
                profil: eins.profil || null,
                emailSettings: eins.email || null,
              };
            }
          }
        } catch (e) {
          console.warn("profiles lookup fehlgeschlagen", e);
        }

        const own = getOwnBeraterInfo(extras);
        if (!cancelled) setBerater(own);

        // Slug für eigenen Account besorgen / generieren
        try {
          const { data, error } = await supabase.functions.invoke("ensure-vp-slug", { body: {} });
          if (!error && data?.slug && !cancelled) setOwnSlug(data.slug);
        } catch (e) {
          console.warn("ensure-vp-slug fehlgeschlagen", e);
        }
      }

      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicSlug, isLoggedIn, authUser?.id]);


  // ─── SEO-Tags für Public-Slug-Seite ──────────────────────
  useEffect(() => {
    if (!publicSlug || !berater?.name) return;

    const beraterName = berater.name;
    const title = rahmen.seoTitel(beraterName);
    const description = rahmen.seoBeschreibung(beraterName);

    const prevTitle = document.title;
    document.title = title;

    const setMeta = (selector: string, attr: string, name: string, content: string) => {
      let el = document.querySelector(selector) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
      return el;
    };

    const created: HTMLMetaElement[] = [];
    const tags = [
      { sel: 'meta[name="description"]', attr: "name", name: "description", content: description },
      { sel: 'meta[property="og:title"]', attr: "property", name: "og:title", content: title },
      { sel: 'meta[property="og:description"]', attr: "property", name: "og:description", content: description },
      { sel: 'meta[property="og:type"]', attr: "property", name: "og:type", content: "website" },
      { sel: 'meta[property="og:url"]', attr: "property", name: "og:url", content: window.location.href },
      { sel: 'meta[name="twitter:card"]', attr: "name", name: "twitter:card", content: "summary_large_image" },
      { sel: 'meta[name="twitter:title"]', attr: "name", name: "twitter:title", content: title },
      { sel: 'meta[name="twitter:description"]', attr: "name", name: "twitter:description", content: description },
    ];
    tags.forEach((t) => {
      const existed = !!document.querySelector(t.sel);
      const el = setMeta(t.sel, t.attr, t.name, t.content);
      if (!existed) created.push(el);
    });

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const canonicalCreated = !canonical;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.href);

    return () => {
      document.title = prevTitle;
      created.forEach((el) => el.remove());
      if (canonicalCreated && canonical) canonical.remove();
    };
  }, [publicSlug, berater?.name, rahmen]);

  // ─── Public Mode: minimale Vollbild-Landingpage ──────────
  if (publicSlug) {
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background" role="status" aria-label={rahmen.laden}>
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (!berater) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 text-center">
          <h1 className="text-2xl font-semibold mb-2">{rahmen.nichtGefundenTitel}</h1>
          <p className="text-muted-foreground">{rahmen.nichtGefundenText}</p>
          <a href="https://osimmobilien.netlify.app" className="mt-4 text-primary hover:underline font-medium">
            {rahmen.nichtGefundenLink}
          </a>
        </div>
      );
    }

    return (
      <div className="lp-theme">
        <BeraterMicrositeContent berater={berater} onOpenFunnel={openFunnel} />
        <LeadFunnelDialog
          open={funnelOpen}
          onOpenChange={setFunnelOpen}
          beraterUserId={berater.userId}
          beraterName={berater.name}
          beraterSlug={berater.slug}
          tippgeberId={tippgeberId}
          tippgeberName={tippgeberName}
        />
        <FloatingBeraterBadge berater={berater} onContactClick={openFunnel} />
      </div>
    );
  }

  // ─── Eingeloggter Vorschau-Mode (mit PageHeader) ─────────
  const previewUrl = ownSlug ? buildVpUrl(ownSlug) : window.location.href;

  return (
    <div className="space-y-4">
      <PageHeader title="Deine Vertriebspartner-Microseite" subtitle="Deine persönliche Landingpage für Interessenten">
        {/* Dieselben Knöpfe wie auf der Handbuch-Seite, siehe LinkTeilenKnoepfe. */}
        <LinkTeilenKnoepfe
          url={ownSlug ? buildVpUrl(ownSlug) : null}
          vorschauUrl={ownSlug ? previewUrl : null}
          fehltMeldung="Slug wird noch generiert – bitte kurz warten."
        />
      </PageHeader>

      <p className="text-sm text-muted-foreground max-w-3xl">
        Teile diesen Link mit Interessenten, jede Anfrage landet automatisch in deinem CRM
        und wird dir direkt zugewiesen. So baust du dir kontinuierlich neue Leads auf, ganz
        ohne zusätzlichen Aufwand.
      </p>

      {berater && (!berater.telefon || !berater.email) && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-warning flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              Deine Kontaktdaten sind unvollständig
            </p>
            <p className="text-muted-foreground mt-0.5">
              {!berater.telefon && !berater.email
                ? "Telefonnummer und E-Mail fehlen – Besucher sehen weder den Anruf- noch den E-Mail-Button."
                : !berater.telefon
                ? "Telefonnummer fehlt, Besucher sehen keinen Anruf-Button auf deiner öffentlichen Microseite."
                : "E-Mail fehlt, Besucher sehen keinen E-Mail-Button auf deiner öffentlichen Microseite."}{" "}
              <Link to="/einstellungen" className="text-primary hover:underline font-medium">
                Jetzt in den Einstellungen ergänzen →
              </Link>
            </p>
          </div>
        </div>
      )}

      <div className="lp-theme -mx-4 md:-mx-6 -mb-6">
        <BeraterMicrositeContent berater={berater} onOpenFunnel={openFunnel} />
        <LeadFunnelDialog
          open={funnelOpen}
          onOpenChange={setFunnelOpen}
          beraterUserId={berater?.userId}
          beraterName={berater?.name}
          beraterSlug={ownSlug}
        />
        <FloatingBeraterBadge berater={berater} onContactClick={openFunnel} />
      </div>
    </div>
  );
};

/** Öffentliche Seite und Vorschau, beide in der Seitensprache. */
const BeraterMicroseite = () => (
  <SeitenSpracheProvider>
    <BeraterMicroseiteInhalt />
  </SeitenSpracheProvider>
);

export default BeraterMicroseite;
