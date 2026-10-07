import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Building2, Download, Loader2, ChevronRight, FileText, Home, ArrowRight, User as UserIcon, FileCheck, AlertCircle } from "lucide-react";
import { KundeEmptyState } from "@/components/kunde/KundeEmptyState";
import { supabase } from "@/integrations/supabase/client";
import { openUnterlage } from "@/lib/storage";
import { useUser } from "@/contexts/UserContext";
import { PortalHero } from "@/components/kunde/portal/PortalHero";
import { generateReservierungPDF } from "@/lib/reservierungPdf";
import { euroText } from "@/lib/sprachFormat";
import { portalSprache } from "@/i18n/portalSprache";
import { dokumentAnzeigeName } from "@/lib/dokumentAnzeigeName";

const fmt = (v: number) => euroText(v, portalSprache(), 2);

const DEFAULT_DOCS = [
  "Reservierungsvertrag", "IBAN Immobilienkonto", "Kaufvertragsentwurf",
  "Grundschuld", "Kaufvertrag", "Kaufpreisfälligkeit",
  "GBA Erwerbvormerkung", "Darlehensvertrag", "Kaufnebenkosten",
];

interface InvestmentRow {
  id: string;
  objekt?: string | null;
  wohnung?: string | null;
  kaufpreis?: number | null;
  meta?: any;
}

export default function KundeKundenordner() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [investments, setInvestments] = useState<InvestmentRow[]>([]);
  const [finanzierungen, setFinanzierungen] = useState<any[]>([]);
  const [eigene, setEigene] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ladeFehler, setLadeFehler] = useState(false);
  const [neuLaden, setNeuLaden] = useState(0);
  const [kontaktGefunden, setKontaktGefunden] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const tabParam = searchParams.get("tab");
  const tabFromUrl: "moreimmo" | "eigene" | null =
    tabParam === "eigene" ? "eigene" : tabParam === "moreimmo" ? "moreimmo" : null;
  const handleTabChange = (val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val === "moreimmo" || val === "eigene") next.set("tab", val);
    else next.delete("tab");
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!authUser) return;
    let kontaktId: string | null = null;
    let invChannel: any = null;
    let finChannel: any = null;
    let kontaktChannel: any = null;
    let extChannel: any = null;

    const loadAll = async () => {
      try {
        setLadeFehler(false);
        const { data: kontakte, error: kontakteError } = await supabase
          .from("kontakte")
          .select("id")
          .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
          .limit(1);
        if (kontakteError) throw kontakteError;
        const k = kontakte?.[0];
        if (!k) { setKontaktGefunden(false); setLoading(false); return; }
        setKontaktGefunden(true);
        kontaktId = k.id;

        // Nur die Felder laden, die diese Seite und ihre Kind-Komponenten
        // nutzen (siehe InvestmentRow). Interne Spalten wie notizen bleiben
        // draussen, damit sie nicht im Payload des Kunden landen.
        const { data: invs, error: invsError } = await supabase
          .from("investments")
          .select("id, objekt, wohnung, kaufpreis, meta")
          .eq("kunde_id", k.id)
          .order("erstellt_am", { ascending: true });
        if (invsError) throw invsError;

        setInvestments((invs || []) as InvestmentRow[]);
        setActiveId(prev => prev ?? (invs && invs.length > 0 ? invs[0].id : null));

        const invIds = (invs || []).map((i: any) => i.id);
        if (invIds.length > 0) {
          const { data: fins, error: finsError } = await supabase
            .from("finanzierungen")
            .select("*")
            .in("kunde_id", invIds);
          if (finsError) throw finsError;
          setFinanzierungen(fins || []);
        }
        const { data: eig, error: eigError } = await supabase
          .from("externe_investments")
          .select("id, bezeichnung, ort, dokumente, meta");
        if (eigError) throw eigError;
        setEigene(eig || []);
      } catch (err) {
        console.error("Fehler beim Laden des Kundenordners:", err);
        setLadeFehler(true);
      } finally {
        setLoading(false);
      }
    };

    loadAll().then(() => {
      if (!kontaktId) return;
      // Realtime: investments (uploads/freigaben), finanzierungen (synced docs), kontakte (Freischaltungen)
      invChannel = supabase
        .channel(`kundenordner-inv-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `kunde_id=eq.${kontaktId}` }, () => loadAll())
        .subscribe();
      finChannel = supabase
        .channel(`kundenordner-fin-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "finanzierungen" }, () => loadAll())
        .subscribe();
      kontaktChannel = supabase
        .channel(`kundenordner-kontakt-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "kontakte", filter: `id=eq.${kontaktId}` }, () => loadAll())
        .subscribe();
      extChannel = supabase
        .channel(`kundenordner-ext-${authUser.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "externe_investments" }, () => loadAll())
        .subscribe();
    });

    return () => {
      if (invChannel) supabase.removeChannel(invChannel);
      if (finChannel) supabase.removeChannel(finChannel);
      if (kontaktChannel) supabase.removeChannel(kontaktChannel);
      if (extChannel) supabase.removeChannel(extChannel);
    };
  }, [authUser, neuLaden]);

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
          title={t("portal.kundenordner.load_error_title")}
          description={t("portal.common.load_failed_text")}
          action={
            <Button variant="outline" onClick={() => { setLoading(true); setNeuLaden((n) => n + 1); }}>
              {t("portal.common.retry")}
            </Button>
          }
        />
      </DashboardLayout>
    );
  }

  if (!kontaktGefunden) {
    return (
      <DashboardLayout>
        <KundeEmptyState
          icon={UserIcon}
          title={t("portal.kundenordner.no_profile_title")}
          description={t("portal.kundenordner.no_profile_text")}
        />
      </DashboardLayout>
    );
  }

  // ─── Dashboard-Übersicht ───
  if (tabFromUrl === null) {
    let docsMoreimmo = 0;
    for (const inv of investments) docsMoreimmo += countDocs(inv, finanzierungen);
    let docsEigene = 0;
    for (const e of eigene) docsEigene += (e.dokumente || []).length;
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <PortalHero
            eyebrow={t("portal.kundenordner.hero_eyebrow")}
            title={t("portal.kundenordner.overview_title")}
            subtitle={t("portal.kundenordner.overview_sub")}
          />
          <div className="portal-card p-5 sm:p-6">
            <div className="text-xs uppercase tracking-wide text-[hsl(var(--portal-akzent-deep))] mb-3">
              {t("portal.kundenordner.your_overview")}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: t("portal.kundenordner.kpi_moreimmo_inv"), value: investments.length.toString(), icon: Building2 },
                { label: t("portal.kundenordner.kpi_moreimmo_docs"), value: docsMoreimmo.toString(), icon: FileCheck },
                { label: t("portal.kundenordner.kpi_eigene_imm"), value: eigene.length.toString(), icon: Home },
                { label: t("portal.kundenordner.kpi_eigene_docs"), value: docsEigene.toString(), icon: FileText },
              ].map((c) => (
                <div key={c.label} className="rounded-2xl border border-border bg-[hsl(var(--portal-akzent-soft)/0.35)] p-4 flex flex-col items-center text-center">
                  <div className="w-9 h-9 rounded-full bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center mb-2">
                    <c.icon className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))]" />
                  </div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</p>
                  <p className="text-lg sm:text-xl font-medium mt-0.5">{c.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => handleTabChange("moreimmo")}
              className="text-left portal-card hover:shadow-md transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-[hsl(var(--portal-akzent-deep))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-medium text-lg">{t("portal.kundenordner.card_moreimmo_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.kundenordner.card_moreimmo_desc")}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">{t("portal.kundenordner.folder_count", { count: investments.length, defaultValue: `${investments.length} Ordner` })}</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTabChange("eigene")}
              className="text-left portal-card hover:shadow-md transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center shrink-0">
                  <UserIcon className="h-6 w-6 text-[hsl(var(--portal-akzent-deep))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-medium text-lg">{t("portal.kundenordner.card_eigene_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.kundenordner.card_eigene_desc")}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">{t("portal.kundenordner.object_count", { count: eigene.length, defaultValue: `${eigene.length} Objekt${eigene.length === 1 ? "" : "e"}` })}</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Eigene Immobilien Ansicht ───
  if (tabFromUrl === "eigene") {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <button
            onClick={() => handleTabChange(null)}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.kundenordner.back_to_overview")}
          </button>
          <PortalHero eyebrow={t("portal.kundenordner.hero_eyebrow")} title={t("portal.kundenordner.eigene_heading")} />
          {eigene.length === 0 ? (
            <div className="portal-card flex flex-col items-center justify-center py-16">
              <Home className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">{t("portal.kundenordner.no_eigene")}</p>
            </div>
          ) : (
            <EigeneInvestmentsLink eigene={eigene} navigate={navigate} />
          )}
        </div>
      </DashboardLayout>
    );
  }

  if (investments.length === 0) {
    return (
      <DashboardLayout>
        <div>
          <button
            onClick={() => handleTabChange(null)}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.kundenordner.back_to_overview")}
          </button>
          <PortalHero eyebrow={t("portal.kundenordner.hero_eyebrow")} title={t("portal.kundenordner.nothing_yet_title")} subtitle={t("portal.kundenordner.nothing_yet_sub")} />
          <div className="portal-card flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {t("portal.kundenordner.nothing_yet_sub")}
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const activeInv = investments.find(i => i.id === activeId) || investments[0];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <button
          onClick={() => handleTabChange(null)}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.kundenordner.back_to_overview")}
        </button>
        <PortalHero eyebrow={t("portal.kundenordner.hero_eyebrow")} title={t("portal.kundenordner.moreimmo_heading")} subtitle={t("portal.kundenordner.moreimmo_sub")} />

        {/* Investment Selector */}
        {investments.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {investments.map((inv) => {
              const isActive = inv.id === activeInv.id;
              const docCount = countDocs(inv, finanzierungen);
              return (
                <button
                  key={inv.id}
                  onClick={() => setActiveId(inv.id)}
                  className={`text-left rounded-2xl border p-4 transition-all ${
                    isActive
                      ? "border-[hsl(var(--portal-akzent))] bg-[hsl(var(--portal-akzent-soft)/0.4)]"
                      : "border-border bg-card hover:border-[hsl(var(--portal-akzent)/0.6)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-[hsl(var(--portal-akzent-soft))] flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-[hsl(var(--portal-akzent-deep))]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{inv.objekt || t("portal.kundenordner.investment_fallback")}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {inv.wohnung || "—"} {inv.kaufpreis ? `· ${fmt(Number(inv.kaufpreis))}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("portal.kundenordner.doc_count", { count: docCount, defaultValue: `${docCount} Dokument${docCount === 1 ? "" : "e"}` })}
                      </p>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isActive ? "rotate-90" : ""}`} />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Active Investment Folder */}
        <div className="portal-card p-6">
          <div className="flex items-center gap-2.5 mb-2">
            <FolderOpen className="h-5 w-5 text-[hsl(var(--portal-akzent-deep))]" />
            <h2 className="font-medium text-lg">{activeInv.objekt || t("portal.kundenordner.folder_default")}</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            {activeInv.wohnung ? t("portal.kundenordner.unit_prefix", { name: activeInv.wohnung }) : ""}
            {t("portal.kundenordner.folder_intro")}
          </p>

          <KundenordnerListe inv={activeInv} finanzierungen={finanzierungen} />

          <div className="mt-5 pt-4 border-t border-border flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => navigate(`/kunde/investments?inv=${activeInv.id}`)}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              {t("portal.kundenordner.to_investment_history")}
            </Button>
          </div>
        </div>

      </div>
    </DashboardLayout>
  );
}

function EigeneInvestmentsLink({ eigene, navigate }: { eigene: any[]; navigate: (p: string) => void }) {
  const { t } = useTranslation();
  if (!eigene || eigene.length === 0) return null;
  return (
    <div className="portal-card p-5 mt-4">
      <div className="flex items-center gap-2 mb-2">
        <Home className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))]" />
        <h3 className="font-medium text-base">{t("portal.kundenordner.eigene_section_title")}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{t("portal.kundenordner.eigene_section_sub")}</p>
      <div className="space-y-2">
        {eigene.map(e => {
          const docs = (e.dokumente || []).length;
          return (
            <button key={e.id} onClick={() => navigate(`/kunde/investments?tab=eigene&inv=${e.id}&highlight=dokumente`)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl bg-card hover:bg-[hsl(var(--portal-akzent-soft)/0.4)] transition-colors text-left border border-border">
              <Building2 className="h-4 w-4 text-[hsl(var(--portal-akzent-deep))] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{e.bezeichnung}</div>
                <div className="text-xs text-muted-foreground">{e.ort || "—"} · {t("portal.kundenordner.doc_count", { count: docs, defaultValue: `${docs} Dokument${docs === 1 ? "" : "e"}` })}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// PageHeader durch PortalHero ersetzt

function countDocs(inv: InvestmentRow, finanzierungen: any[]): number {
  const meta = inv.meta || {};
  const statuses = meta.docStatuses || {};
  const customDocs = meta.customDocTitles || [];
  const allDocs = [...DEFAULT_DOCS, ...customDocs];
  let count = 0;
  for (const d of allDocs) {
    if (statuses[d] === "uploaded" || statuses[d] === "approved") count++;
  }
  for (const koDoc of (meta.kundenordner || [])) {
    if (koDoc.freigegeben) count++;
  }
  for (const fin of finanzierungen.filter(f => f.kunde_id === inv.id)) {
    for (const a of (fin.angebote || [])) {
      for (const d of (a.dokumente || [])) {
        // Nur freigegebene (signed) Dokumente werden im Kundenordner gezählt
        if ((d.name === "Darlehensvertrag" || d.name === "Grundschuld") && d.status === "signed") count++;
      }
    }
  }
  // Auto: Reservierungsvereinbarung (signiert + rvPdf vorhanden)
  if (meta.rvSigned && meta.rvPdf) count++;
  return count;
}

function KundenordnerListe({ inv, finanzierungen }: { inv: InvestmentRow; finanzierungen: any[] }) {
  const { t } = useTranslation();
  const meta = inv.meta || {};
  const customDocs = meta.customDocTitles || [];
  const allDocs = [...DEFAULT_DOCS, ...customDocs];
  const docStatuses = meta.docStatuses || {};
  const docFileUrls = meta.docFileUrls || {};

  const finSyncDocs: Record<string, boolean> = {};
  const finSyncUrls: Record<string, string> = {};
  for (const fin of finanzierungen.filter(f => f.kunde_id === inv.id)) {
    for (const a of (fin.angebote || [])) {
      for (const d of (a.dokumente || [])) {
        // Nur freigegebene (signed) Dokumente werden im Kundenordner angezeigt
        if ((d.name === "Darlehensvertrag" || d.name === "Grundschuld") && d.status === "signed") {
          finSyncDocs[d.name] = true;
          if (d.fileUrl) finSyncUrls[d.name] = d.fileUrl;
        }
      }
    }
  }

  const kundenordnerDocs: { kategorie: string; filename: string; fileUrl?: string; freigegeben?: boolean }[] =
    (meta.kundenordner || []).filter((d: any) => d.freigegeben);
  // Der Store schreibt die Zusatzkategorien unter "kundenordnerCustomKat";
  // das Portal las jahrelang den falschen Schlüssel und zeigte sie nie.
  const customKats: string[] = meta.kundenordnerCustomKat || meta.kundenordnerCustomKategorien || [];
  const allKats = [...new Set([...allDocs, ...customKats, ...kundenordnerDocs.map(d => d.kategorie)])];

  // Auto-Link Reservierungsvertrag aus signierter RV
  const rvSigned = !!meta.rvSigned;
  const rvPdfFilename = meta.rvPdf || "";
  const rvData = meta.rvData;
  const rvSignatures = meta.rvSignatures;
  const hasRvLink = rvSigned && !!rvPdfFilename;

  const visible = allKats.filter(kat =>
    docStatuses[kat] === "uploaded" || docStatuses[kat] === "approved" ||
    finSyncDocs[kat] || kundenordnerDocs.some(d => d.kategorie === kat) ||
    (kat === "Reservierungsvertrag" && hasRvLink)
  );

  if (visible.length === 0) {
    return (
      <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-4">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">
          {t("portal.kundenordner.list_empty")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visible.map(kat => {
        const koDoc = kundenordnerDocs.find(d => d.kategorie === kat);
        const fileUrl = docFileUrls[kat] || koDoc?.fileUrl || finSyncUrls[kat];
        const isRvRow = kat === "Reservierungsvertrag" && hasRvLink && !koDoc && !fileUrl;
        return (
          <div key={kat} className="flex items-center gap-3 bg-[hsl(var(--portal-akzent-soft)/0.4)] hover:bg-[hsl(var(--portal-akzent-soft)/0.7)] transition-colors rounded-2xl p-3">
            <div className="w-2 h-2 rounded-full shrink-0 bg-[hsl(var(--portal-akzent))]" />
            {/* Nur die Anzeige übersetzen. `kat` ist zugleich der gespeicherte Schlüssel. */}
            <span className="text-sm font-medium flex-1">{dokumentAnzeigeName(kat, portalSprache())}</span>
            {isRvRow ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-xs h-7"
                onClick={async () => {
                  if (!rvData) return;
                  try {
                    const pdf = await generateReservierungPDF(rvData, rvSignatures || undefined);
                    pdf.save(rvPdfFilename || "Reservierungsvereinbarung.pdf");
                  } catch (err) {
                    console.error("RV PDF generation error:", err);
                  }
                }}
              >
                <Download className="h-3 w-3 mr-1.5" /> {t("portal.kundenordner.download")}
              </Button>
            ) : fileUrl ? (
              <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => openUnterlage(fileUrl)}>
                <Download className="h-3 w-3 mr-1.5" /> {t("portal.kundenordner.download")}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">{t("portal.kundenordner.available")}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
