import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  User, Mail, Phone, MapPin, Calendar,
  Loader2,
  CheckSquare, AlertCircle, ArrowRight,
  ShieldCheck, Home, FileSignature, Landmark, Briefcase, FolderOpen, CheckCircle2, Clock, Upload,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { PortalHero } from "@/components/kunde/portal/PortalHero";
import { PortalProgressBar } from "@/components/kunde/portal/PortalProgressBar";
import { PortalStepCard } from "@/components/kunde/portal/PortalStepCard";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle } from "lucide-react";
import { getPortalGreeting, getNextStepSentence, investmentBezeichnung, massgeblichePipelineStufe } from "@/lib/portalCopy";
import { sammleNaechsteSchritte, type PortalSchrittIkone } from "@/lib/portalNaechsteSchritte";
import { KundeEmptyState } from "@/components/kunde/KundeEmptyState";

import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";
const fmt = (v: number) => euroText(v, portalSprache(), 2);

/**
 * Symbole zu den Schritten aus `portalNaechsteSchritte.ts`.
 *
 * Die Zusammenstellung liegt in der Bibliothek und kennt bewusst keine
 * React-Bausteine. Hier bekommt jede Art ihr Symbol.
 */
const SCHRITT_IKONEN: Record<PortalSchrittIkone, any> = {
  upload: Upload,
  unterschrift: FileSignature,
  kalender: Calendar,
  uhr: Clock,
  pruefung: ShieldCheck,
  erledigt: CheckCircle2,
  objekt: Home,
  bank: Landmark,
  notar: Briefcase,
  ordner: FolderOpen,
};

export default function KundeStammdaten() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const kontaktIdParam = searchParams.get("kontaktId") || "";
  const [kontakt, setKontakt] = useState<any>(null);
  const [investments, setInvestments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [neuLaden, setNeuLaden] = useState(0);
  const [vpProfile, setVpProfile] = useState<{ name: string; email: string; telefon: string; avatar_url?: string } | null>(null);

  useEffect(() => {
    if (!authUser) return;
    let kontaktId: string | null = null;
    let kontaktChannel: any = null;
    let invChannel: any = null;

    const load = async () => {
      try {
        setLadeFehler(false);
        // Nur die Felder laden, die diese Seite wirklich anzeigt.
        // Interne Spalten wie notizen bleiben absichtlich draussen, damit sie
        // nicht im Netzwerk-Payload des Kunden landen.
        let kontakteQuery = supabase
          .from("kontakte")
          .select("id, vorname, nachname, email, telefon, strasse, hausnummer, plz, ort, berater, meta")
          .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
          .limit(1);

        if (kontaktIdParam) {
          kontakteQuery = kontakteQuery.eq("id", kontaktIdParam);
        }

        const { data: kontakte, error: kontakteError } = await kontakteQuery;
        if (kontakteError) throw kontakteError;

        const k = kontakte?.[0];
        if (k) {
          setKontakt(k);
          kontaktId = k.id;

          // Load VP profile via RPC – identische Datenquelle wie im Tippgeberportal
          try {
            const { data: vp } = await (supabase as any).rpc("get_kunde_vp_profile");
            const row = Array.isArray(vp) ? vp[0] : vp;
            if (row) {
              setVpProfile({
                name: row.name || "",
                email: row.email || "",
                telefon: row.telefon || "",
                avatar_url: row.avatar_url || undefined,
              });
            }
          } catch (e) {
            console.warn("kunde vp profile load failed", e);
          }

          // Ebenfalls nur die genutzten Felder, ohne die internen notizen
          const { data: invs, error: invsError } = await supabase
            .from("investments")
            .select("id, objekt, wohnung, kaufpreis, meta")
            .eq("kunde_id", k.id);
          if (invsError) throw invsError;
          setInvestments(invs || []);
        }
      } catch (err) {
        console.error("Fehler beim Laden der Kundendaten:", err);
        setLadeFehler(true);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    load().then(() => {
      if (!kontaktId) return;
      // Realtime: react to VP/Admin changes (pipeline, SA-Status, Freischaltungen, ...)
      kontaktChannel = supabase
        .channel(`kunde-stamm-kontakt-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "kontakte", filter: `id=eq.${kontaktId}` }, () => load())
        .subscribe();
      invChannel = supabase
        .channel(`kunde-stamm-inv-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `kunde_id=eq.${kontaktId}` }, () => load())
        .subscribe();
    });

    return () => {
      if (kontaktChannel) supabase.removeChannel(kontaktChannel);
      if (invChannel) supabase.removeChannel(invChannel);
    };
  }, [authUser, kontaktIdParam, neuLaden]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  // Ladefehler bewusst vom Fall "kein Profil gefunden" unterscheiden
  if (ladeFehler) {
    return (
      <DashboardLayout>
        <KundeEmptyState
          icon={AlertCircle}
          title={t("portal.stammdaten.load_error_title")}
          description={t("portal.stammdaten.load_error_text")}
          action={
            <Button variant="outline" onClick={() => { setLoading(true); setNeuLaden((n) => n + 1); }}>
              {t("portal.stammdaten.retry")}
            </Button>
          }
        />
      </DashboardLayout>
    );
  }

  if (!kontakt) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">{t("portal.stammdaten.no_data")}</p>
        </div>
      </DashboardLayout>
    );
  }

  const meta = (kontakt.meta || {}) as Record<string, any>;
  const beraterName = kontakt.berater || t("portal.stammdaten.default_vp_name");

  const investmentsWithSA = investments.filter((inv: any) => inv.meta?.saData);
  // Use the most recently created investment's SA data (last one), not the first — new SA overwrites Stammdaten
  const latestSA = investmentsWithSA.length > 0 ? investmentsWithSA[investmentsWithSA.length - 1] : null;
  const firstSA = latestSA?.meta?.saData || meta.selbstauskunft || {};

  /*
   * Eine einzige Liste ueber alle Investments hinweg: erst das, was wir vom
   * Kunden brauchen, dann seine Termine, dann der ruhige Statushinweis.
   * Vorher stand hier je Investment ein eigener Kasten, und die Zahlen zu
   * Finanzierbarkeit, Einnahmen und Ausgaben lagen ebenfalls auf der
   * Startseite. Beides steht jetzt beim jeweiligen Investment
   * (Entscheidung Christian, 10.09.2026).
   */
  const naechsteSchritte = sammleNaechsteSchritte({ investments, kontaktMeta: meta });

  const handleNavigateToSection = (invId: string, section: string) => {
    navigate(`/kunde/investments?tab=moreimmo&inv=${invId}&highlight=${section}`);
  };

  // Die Begrüßung richtet sich nach dem am weitesten fortgeschrittenen
  // laufenden Investment, nicht nach dem zuletzt angelegten.
  const currentStufe = massgeblichePipelineStufe(investments, meta.pipelineStufe);
  const hauptSchrittIndex = naechsteSchritte.findIndex((s) => s.investmentId && s.abschnitt);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* ─── Hero: persönliche Begrüßung + freundlicher nächster Schritt ─── */}
        <PortalHero
          eyebrow={t("portal.stammdaten.hero_eyebrow")}
          title={`${getPortalGreeting(kontakt.vorname)}.`}
          subtitle={
            <>
              <span className="block">{getNextStepSentence(currentStufe)}</span>
              <span className="block mt-1 text-sm text-muted-foreground">
                {t("portal.stammdaten.vp_personally", { name: beraterName })}
              </span>
            </>
          }
        />

        {/* ─── Persönlicher Berater – Kontaktkarte (immer sichtbar) ─── */}
        {(vpProfile || beraterName) && (
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-primary/5 via-background to-background">
            <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center gap-4 md:gap-5">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative shrink-0">
                  {vpProfile?.avatar_url ? (
                    <img
                      src={vpProfile.avatar_url}
                      alt={vpProfile?.name || beraterName}
                      className="h-16 w-16 md:h-20 md:w-20 rounded-full object-cover ring-2 ring-primary/20"
                    />
                  ) : (
                    <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xl font-semibold ring-2 ring-primary/20">
                      {(vpProfile?.name || beraterName).split(" ").map(p => p[0]).filter(Boolean).slice(0,2).join("").toUpperCase() || "VP"}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold uppercase tracking-widest text-primary">
                    {t("portal.stammdaten.contact_label")}
                  </div>
                  <div className="text-lg md:text-xl font-bold leading-tight truncate">{vpProfile?.name || beraterName}</div>
                  <div className="mt-1.5 flex flex-col gap-0.5 text-sm text-muted-foreground">
                    {vpProfile?.email && (
                      <a
                        href={`mailto:${vpProfile.email}`}
                        className="inline-flex items-center gap-1.5 hover:text-foreground truncate"
                      >
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{vpProfile.email}</span>
                      </a>
                    )}
                    {vpProfile?.telefon && (
                      <a
                        href={`tel:${vpProfile.telefon.replace(/\s+/g, "")}`}
                        className="inline-flex items-center gap-1.5 hover:text-foreground"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        <span>{vpProfile.telefon}</span>
                      </a>
                    )}
                    {!vpProfile?.email && !vpProfile?.telefon && (
                      <span className="text-xs">{t("portal.stammdaten.contact_pending")}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex md:flex-col gap-2 md:w-auto w-full">
                <Button
                  onClick={() => navigate("/kunde/chat")}
                  className="flex-1 md:flex-none"
                  size="sm"
                >
                  <MessageCircle className="h-4 w-4 mr-1.5" />
                  {t("portal.stammdaten.send_message")}
                </Button>
                {vpProfile?.telefon && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="flex-1 md:flex-none"
                  >
                    <a href={`tel:${vpProfile.telefon.replace(/\s+/g, "")}`}>
                      <Phone className="h-4 w-4 mr-1.5" /> {t("portal.stammdaten.call")}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ─── Deine nächsten Schritte, über alle Investments hinweg ─── */}
        {investments.length > 0 && (
          <div className="portal-step-summary portal-card p-5 sm:p-6">
            <div className="mb-3">
              <div className="text-xs uppercase tracking-wide text-[hsl(var(--portal-akzent-deep))]">
                {t("portal.stammdaten.naechste.titel")}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("portal.stammdaten.naechste.sub")}
              </p>
            </div>

            {naechsteSchritte.length === 0 ? (
              /* Ruhiger Satz statt einer leeren Karte. */
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-full bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))]" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="font-medium text-foreground">{t("portal.stammdaten.naechste.ruhig_titel")}</p>
                  <p className="text-sm text-foreground/70 leading-relaxed">{t("portal.stammdaten.naechste.ruhig_text")}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {naechsteSchritte.map((schritt, index) => {
                  const SchrittIkone = SCHRITT_IKONEN[schritt.ikone];
                  // Die eine orange Hauptaktion der Übersicht: die Aktion des
                  // ersten Schritts, der eine hat. Alle weiteren bleiben leise.
                  const istHauptaktion = index === hauptSchrittIndex;
                  return (
                    <div key={schritt.schluessel} className="flex gap-3 items-start">
                      <div className="w-9 h-9 rounded-full bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center shrink-0">
                        <SchrittIkone className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))]" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        {/* Umbricht auf dem Handy, damit der Objektname nicht abgeschnitten wird. */}
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="font-medium text-foreground">{schritt.titel}</p>
                          {schritt.investmentLabel && (
                            <span className="text-xs text-muted-foreground">{schritt.investmentLabel}</span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/70 leading-relaxed">{schritt.text}</p>
                        {schritt.investmentId && schritt.abschnitt && (istHauptaktion ? (
                          <Button
                            variant="brand"
                            size="sm"
                            onClick={() => handleNavigateToSection(schritt.investmentId, schritt.abschnitt)}
                            className="mt-1"
                          >
                            {schritt.aktionLabel}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleNavigateToSection(schritt.investmentId, schritt.abschnitt)}
                            className="inline-flex items-center gap-1.5 mt-1 text-sm text-[hsl(var(--portal-akzent-deep))] hover:text-foreground transition-colors"
                          >
                            {schritt.aktionLabel}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Persönliche Daten als weiches Akkordeon (nur auf Klick offen) ─── */}
        <details className="portal-card group">
          <summary className="list-none cursor-pointer p-5 sm:p-6 flex items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center">
                <User className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))]" />
              </span>
              <span>
                <span className="block font-medium">{t("portal.stammdaten.details.trigger_title")}</span>
                <span className="block text-xs text-muted-foreground">{t("portal.stammdaten.details.trigger_sub")}</span>
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-5 sm:px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.name")}</span><span className="font-medium">{kontakt.vorname} {kontakt.nachname}</span></div>
              {(meta.geburtstag || firstSA.geburtsdatum) && (
                <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.birthday")}</span><span className="font-medium">{meta.geburtstag || firstSA.geburtsdatum}</span></div>
              )}
              {kontakt.email && (
                <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.email")}</span><span className="font-medium">{kontakt.email}</span></div>
              )}
              {kontakt.telefon && (
                <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.phone")}</span><span className="font-medium">{kontakt.telefon}</span></div>
              )}
            </div>
            <div className="space-y-3">
              {(kontakt.strasse || kontakt.ort) && (
                <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.address")}</span><span className="font-medium">{[kontakt.strasse, kontakt.hausnummer].filter(Boolean).join(" ")}{kontakt.plz || kontakt.ort ? ", " : ""}{[kontakt.plz, kontakt.ort].filter(Boolean).join(" ")}</span></div>
              )}
              {(meta.familienstand || firstSA.familienstand) && (
                <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.marital")}</span><span className="font-medium">{meta.familienstand || firstSA.familienstand}</span></div>
              )}
              {(meta.kinder !== undefined || firstSA.kinder !== undefined) && (() => {
                const kinderVal = meta.kinder ?? firstSA.kinder;
                const display = Array.isArray(kinderVal)
                  ? kinderVal.length === 0 ? t("portal.stammdaten.details.no_children") : kinderVal.map((k: any) => [k.name || k.vorname, k.geburtsdatum].filter(Boolean).join(" (") + (k.geburtsdatum ? ")" : "")).join(", ")
                  : typeof kinderVal === "object" && kinderVal !== null ? JSON.stringify(kinderVal) : String(kinderVal ?? "–");
                return (
                  <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-28">{t("portal.stammdaten.details.children")}</span><span className="font-medium">{display}</span></div>
                );
              })()}
            </div>
          </div>
        </details>

        {/* Investments Übersicht */}
        {investments.length > 0 && (
          <div className="portal-card p-6">
            <h2 className="font-bold text-lg mb-1 flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-[hsl(var(--portal-akzent-deep))]" /> {t("portal.stammdaten.investments_title")}
            </h2>
            <p className="text-xs text-muted-foreground mb-4">{t("portal.stammdaten.investments_sub")}</p>
            <div className="space-y-3">
              {investments.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-3 bg-[hsl(var(--portal-akzent-soft)/0.5)] rounded-2xl cursor-pointer hover:bg-[hsl(var(--portal-akzent-soft))] transition-colors"
                  onClick={() => navigate("/kunde/investments")}
                >
                  <div>
                    <p className="font-medium text-sm">{investmentBezeichnung(inv.objekt, inv.wohnung) || t("portal.stammdaten.investment_fallback")}</p>
                    {inv.kaufpreis > 0 && <p className="text-xs text-muted-foreground">{t("portal.stammdaten.purchase_price")} {fmt(inv.kaufpreis)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {investmentsWithSA.length === 0 && investments.length === 0 && (
          <div className="portal-card p-6 text-center">
            <p className="text-muted-foreground">
              <Trans i18nKey="portal.stammdaten.empty_text" values={{ name: beraterName }} components={[<strong key="0" />]} />
            </p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
