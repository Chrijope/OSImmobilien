import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { resolveUnterlagenUrl, openUnterlage, unterlageHerunterladen } from "@/lib/storage";
import { saGeltendeUnterschriftenAusMeta, saNeueUnterschriftAusstehend } from "../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";
import { reservierungsvereinbarungOeffnen, rvAblagePfad, rvZumOeffnen } from "@/lib/reservierungsvereinbarungKunde";
import { aktuellerSaPdfPfad } from "@/lib/selbstauskunftPdfAblage";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kennzahl } from "@/components/ui/kennzahl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { einlage } from "@/components/kunde/portal/einlage";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, CheckCircle2, Clock, Home, FileText, Landmark, Briefcase,
  FolderOpen, Download, AlertCircle, ChevronRight, Loader2,
  ShieldCheck, Upload, Lock, ExternalLink, Send, Trash2, RefreshCw,
  FileSignature, PackageCheck, Calendar, TrendingUp, Wallet, Banknote, ArrowRight, User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { toast } from "sonner";
import { LiquiditaetCard } from "@/components/kunde/LiquiditaetCard";
import { TilgungsplanCard } from "@/components/kunde/eigene/TilgungsplanCard";
import { CashflowForecastCard } from "@/components/kunde/eigene/CashflowForecastCard";
import { ReinvestHinweisCard } from "@/components/kunde/eigene/ReinvestHinweisCard";
import { monateSeitLetztemKauf } from "@/lib/eigeneInvestmentBerechnungen";
import { adaptMoreImmoInvestment } from "@/lib/kundePortalInvestment";
import { EmpfehlungsRecommendationCard } from "@/components/kunde/EmpfehlungsRecommendationCard";
import { NotarterminAuswahlCard } from "@/components/kunde/NotarterminAuswahlCard";
import { AbwicklungStatusCard } from "@/components/kunde/AbwicklungStatusCard";
import { EigenfinanzierungKundeKarte } from "@/components/finanzierung/EigenfinanzierungKundeKarte";
import { BewertungCard } from "@/components/kunde/BewertungCard";
import EigeneInvestmentsTab from "@/components/kunde/EigeneInvestmentsTab";
import { Link } from "react-router-dom";
import { MobileScanQRDialog } from "@/components/MobileScanQRDialog";
import { ChevronDown, ChevronUp, Smartphone } from "lucide-react";
import { PortalHero } from "@/components/kunde/portal/PortalHero";
import { NextStepCard } from "@/components/kunde/portal/NextStepCard";
import { GesamtvermoegenCard } from "@/components/kunde/portal/GesamtvermoegenCard";
import { moreImmoPosition, eigenePosition, berechnePortfolioKennzahlen } from "@/lib/portalPortfolio";
import { renditeAusMiete } from "@/lib/objektDatenPflicht";
import KundeFinanzierbarkeitCard from "@/components/kunde/KundeFinanzierbarkeitCard";
import { EinnahmenAusgabenKarten } from "@/components/kunde/portal/EinnahmenAusgabenKarten";
import { applyLegacyDocKeys, LEGACY_DOC_KEYS } from "@/lib/bankpruefungDocs";
import { portalBankListen, portalUnterlagenListe, SCHUFA_DOC, SCHUFA_DOC_P2 } from "@/lib/portalUnterlagenListe";
import { finanzierungIstFrei } from "@/lib/finanzierungFreigabe";
import { meldeBonitaetNachFreigabeAusPortal } from "@/lib/bonitaetNachFreigabe";
import { istUnterlagenFreigeschaltetAusMeta } from "@/lib/unterlagenFreigabe";
import { eigeneSaDataFuerInvestmentRow } from "@/lib/saQuelle";
import { FORTSCHRITT_STUFEN, fortschrittsRang } from "@/lib/pipelineStufen";
import { PortalObjektBilder } from "@/components/kunde/PortalObjektBilder";
import { bilderListe } from "@/lib/objektDatenPflicht";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText, prozentText, datumText } from "@/lib/sprachFormat";
import { dokumentAnzeigeName } from "@/lib/dokumentAnzeigeName";
import { investmentBezeichnung } from "@/lib/portalCopy";
import { useAbschnittHervorheben } from "@/hooks/useAbschnittHervorheben";


/** Eurobetrag mit Cent in der Anzeigesprache: „1.234,50 €“ oder „€1,234.50“. */
const fmt = (v: number) => euroText(v, portalSprache(), 2);
/** Prozent mit zwei Nachkommastellen in der Anzeigesprache. */
const fmtProzent = (v: number) => prozentText(v, portalSprache(), 2);
/**
 * Datum in der Anzeigesprache. Was sich nicht als Datum lesen lässt (etwa
 * ein von Hand eingetragener Text), bleibt so stehen, wie es gespeichert ist.
 */
const fmtDatum = (v: unknown): string => datumText(v as string, portalSprache()) || String(v ?? "");
/** Name einer Unterlage für die Anzeige. Der gespeicherte Name bleibt der Schlüssel. */
const docAnzeige = (name: string) => dokumentAnzeigeName(name, portalSprache());

/*
 * Welche Pipelinestufen im Portal ein eigenes Phasen-Kästchen bekommen und
 * mit welchem Symbol. Die REIHENFOLGE kommt nicht mehr aus einer eigenen
 * Liste, sondern aus FORTSCHRITT_STUFEN (pipelineStufen.ts) und damit aus
 * derselben Quelle wie das Kundenprofil. Vorher stand hier eine Kopie mit
 * der alten Reihenfolge (Bonität vor Objektauswahl), und der Kunde sah im
 * Portal einen anderen Ablauf als sein Berater.
 *
 * "key" ist der Anzeige-Schluessel des Portals (i18n, Sektionen, Deep-Links),
 * "stufenKey" der kanonische Pipelinestufen-Schluessel.
 */
const PORTAL_PHASEN_ICONS: Record<string, { key: string; icon: LucideIcon }> = {
  erstgespraech_geplant: { key: "erstgespraech", icon: Clock },
  objektauswahl: { key: "objektauswahl", icon: Home },
  reservierung: { key: "reservierung", icon: FileSignature },
  bonitaetsunterlagen: { key: "bonitaetsunterlagen", icon: ShieldCheck },
  finanzierung: { key: "finanzierung", icon: Landmark },
  notar: { key: "notar", icon: Briefcase },
  faelligkeit: { key: "faelligkeit", icon: FolderOpen },
};
const PIPELINE_STEPS: { key: string; stufenKey: string; icon: LucideIcon }[] = FORTSCHRITT_STUFEN
  .filter((s) => PORTAL_PHASEN_ICONS[s.key])
  .map((s) => ({ ...PORTAL_PHASEN_ICONS[s.key], stufenKey: s.key }));

const stepLabel = (k: string) => i18n.t(`portal.investments.steps_short.${k}`);

/** Index eines Portal-Schritts, robust gegen Umsortierungen. */
const stepIndexOf = (key: string): number => PIPELINE_STEPS.findIndex((s) => s.key === key);

/**
 * Pipelinestufe → Portal-Schritt: der letzte Schritt, dessen kanonischer Rang
 * die Stufe schon erreicht hat. Stufen ohne eigenes Kästchen (z. B.
 * Beratungsgespräch, Selbstauskunft, Abrechnung) landen so automatisch beim
 * fachlich passenden Nachbarn, ohne dass hier je Sonderfälle gepflegt werden.
 */
function mapPipelineToStep(stufe: string): number {
  // Alt-Alias des Portals: "erstgespraech" statt "erstgespraech_geplant".
  const kanonisch = stufe === "erstgespraech" ? "erstgespraech_geplant" : stufe;
  const rang = fortschrittsRang(kanonisch);
  let idx = 0;
  PIPELINE_STEPS.forEach((s, i) => {
    if (fortschrittsRang(s.stufenKey) <= rang) idx = i;
  });
  return idx;
}

const SCHUFA_ORDER_URL = "https://selbstauskunft.de/?gad_source=1&gad_campaignid=20743780254&gbraid=0AAAAAoXCn_3L9WlSJw_scB80MzrP4nMaR&gclid=CjwKCAjwpcTNBhA5EiwAdO1S9jyb7ZawK2jbkX-3Nw7vae0CReo9jDASw4nYOgBGDYuuznEPD3T-XRoCCKkQAvD_BwE#form";


type DocStatus = "none" | "uploaded" | "approved" | "rejected";

/* ─── Doc Row for Customer ─── */
function DocRowKunde({ doc, status, fileUrl, onUpload, onReplace, onDelete, disabled, busy, customAction, rejectReason }: {
  doc: { name: string; required: boolean };
  status: DocStatus;
  fileUrl?: string;
  onUpload: () => void;
  onReplace: () => void;
  onDelete: () => void;
  /** Vom Vertriebspartner noch nicht freigeschaltet. Nur dann erscheint der Schloss-Hinweis. */
  disabled?: boolean;
  /*
   * Upload dieser Zeile läuft gerade. Blendet nur die Knöpfe aus. Früher lief
   * das über `disabled`, und weil der Status in dem Moment noch "none" war,
   * blitzte für die Dauer des Uploads „Wird von deinem Vertriebspartner
   * freigeschaltet“ auf.
   */
  busy?: boolean;
  customAction?: React.ReactNode;
  rejectReason?: string;
}) {
  const { t } = useTranslation();
  const dotColor = status === "approved" ? "bg-[hsl(var(--success))]" : status === "uploaded" ? "bg-[hsl(var(--warning))]" : status === "rejected" ? "bg-destructive" : "bg-destructive";
  const labelColor = status === "approved" ? "text-[hsl(var(--success))]" : status === "uploaded" ? "text-[hsl(var(--warning))]" : status === "rejected" ? "text-destructive" : "text-destructive";
  const label = status === "approved" ? t("portal.investments.doc.approved")
              : status === "uploaded" ? t("portal.investments.doc.uploaded")
              : status === "rejected" ? t("portal.investments.doc.rejected")
              : t("portal.investments.doc.missing");

  return (
    <div className={`border-b pb-3 ${disabled && !customAction ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-2">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor}`} />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{docAnzeige(doc.name)}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded ${labelColor} bg-muted/50`}>{label}</span>
              {status === "uploaded" && <span className="text-xs text-[hsl(var(--warning))] font-medium whitespace-nowrap">{t("portal.investments.doc.in_check")}</span>}
              {status === "approved" && <span className="text-xs text-[hsl(var(--success))] whitespace-nowrap">{t("portal.investments.doc.checked")}</span>}
            </div>
          </div>
          <div className="flex gap-2 mt-1.5 flex-wrap">
            {customAction}
            {!customAction && status === "none" && !disabled && !busy && (
              <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onUpload}>
                <Upload className="h-3 w-3" /> {t("portal.investments.doc.upload")}
              </button>
            )}
            {!customAction && (status === "uploaded" || status === "approved") && !disabled && !busy && (
              <>
                {fileUrl && (
                  <button onClick={() => openUnterlage(fileUrl)} className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1">
                    <Download className="h-3 w-3" /> {t("portal.investments.doc.view")}
                  </button>
                )}
                <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onReplace}>
                  <RefreshCw className="h-3 w-3" /> {t("portal.investments.doc.replace")}
                </button>
                {/* Löschen nur, solange die Unterlage noch nicht freigegeben
                    ist. Ein freigegebenes Dokument entfernt der Berater. */}
                {status === "uploaded" && (
                  <button className="text-xs text-destructive hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onDelete}>
                    <Trash2 className="h-3 w-3" /> {t("portal.investments.doc.delete")}
                  </button>
                )}
              </>
            )}
            {!customAction && status === "rejected" && !busy && (
              <div className="space-y-1">
                <div className="text-xs text-destructive">{t("portal.investments.doc.rejected_hint")}</div>
                {rejectReason && (
                  <div className="text-xs bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5 text-destructive">
                    <span className="font-semibold">{t("portal.investments.doc.reject_reason")}</span> {rejectReason}
                  </div>
                )}
                <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onUpload}>
                  <Upload className="h-3 w-3" /> {t("portal.investments.doc.upload_again")}
                </button>
              </div>
            )}
            {!customAction && disabled && status === "none" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> {t("portal.investments.doc.locked_vp")}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Contextual Hint Texts (i18n) ─── */
const getSectionHint = (key: string): string | undefined => {
  const k = `portal.investments.section_hints.${key}`;
  const v = i18n.t(k);
  return v && v !== k ? v : undefined;
};

/* ─── Horizontal Stepper ─── */
function HorizontalStepper({ currentStep, onStepClick }: { currentStep: number; onStepClick?: (stepKey: string) => void }) {
  return (
    <div className="w-full overflow-x-auto pb-2">
      <div className="flex items-center min-w-[700px] px-6">
        {PIPELINE_STEPS.map((s, i) => {
          const Icon = s.icon;
          const isDone = i < currentStep;
          const isActive = i === currentStep;
          const isClickable = isDone || isActive;
          const isLast = i === PIPELINE_STEPS.length - 1;

          return (
            <div key={s.key} className={`flex items-center ${isLast ? "" : "flex-1"}`}>
              <div
                className={`flex flex-col items-center shrink-0 w-20 ${isClickable ? "cursor-pointer" : ""}`}
                onClick={() => isClickable && onStepClick?.(s.key)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                  isDone ? "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground,0_0%_100%))] shadow-md" :
                  isActive ? "bg-primary text-primary-foreground ring-4 ring-primary/20 shadow-lg scale-110" :
                  "bg-muted text-muted-foreground"
                } ${isClickable ? "hover:scale-110 hover:shadow-lg transition-transform" : ""}`}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs mt-1.5 text-center leading-tight font-medium ${
                  isActive ? "text-primary" : isDone ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                }`}>
                  {stepLabel(s.key)}
                </span>
              </div>
              {!isLast && (
                <div className={`h-0.5 flex-1 min-w-[12px] -mt-4 ${
                  i < currentStep ? "bg-[hsl(var(--success))]" : "bg-muted"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Phase Card (Bento Style) ─── */
function PhaseCard({
  icon: Icon, label, stepKey, currentStep, children, completed, sectionId, isActive, hideHint, unlocked
}: {
  icon: any;
  label: string;
  stepKey: string;
  currentStep: number;
  children: React.ReactNode;
  completed?: boolean;
  sectionId?: string;
  isActive?: boolean;
  hideHint?: boolean;
  /** Phase trotz späterer Position schon zugänglich (z. B. Unterlagen ab der Selbstauskunft). */
  unlocked?: boolean;
}) {
  const { t } = useTranslation();
  const idx = PIPELINE_STEPS.findIndex(s => s.key === stepKey);
  // Wenn `completed` explizit übergeben wird, ist es maßgebend (auch wenn false),
  // andernfalls wird der Zustand aus `currentStep` abgeleitet.
  const isDone = completed !== undefined ? completed : currentStep > idx;
  const isFuture = currentStep < idx && !isDone && !unlocked;
  const hint = getSectionHint(stepKey);

  if (isFuture) {
    return (
      <div id={sectionId} className="portal-phase-future rounded-xl border border-dashed border-border bg-muted/40 p-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-sm text-muted-foreground">{label}</h3>
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 ml-9">
          <Lock className="h-3 w-3" /> {t("portal.investments.phase_locked")}
        </p>
      </div>
    );
  }

  return (
    <div
      id={sectionId}
      className={`portal-phase rounded-xl border bg-card/80 backdrop-blur-sm transition-all ${
        isActive
          ? "border-primary/30 shadow-lg ring-1 ring-primary/10"
          : isDone
            ? "border-[hsl(var(--success))]/20"
            : "border-border/50"
      }`}
    >
      <div className="p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isDone ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" :
            isActive ? "bg-primary/10 text-primary" :
            "bg-muted text-muted-foreground"
          }`}>
            {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
          </div>
          <h3 className="font-bold text-sm flex-1">{label}</h3>
          {isDone && <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-0">{t("portal.investments.phase_done")}</Badge>}
          {isActive && <Badge className="bg-primary/10 text-primary border-0 animate-pulse">{t("portal.investments.phase_current")}</Badge>}
        </div>

        {hint && isActive && !hideHint && (
          <div className="mb-4 bg-primary/5 border border-primary/15 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">{hint}</p>
          </div>
        )}

        {children}
      </div>
    </div>
  );
}

export default function KundeInvestments() {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const [investments, setInvestments] = useState<any[]>([]);
  const [externeInvestments, setExterneInvestments] = useState<any[]>([]);
  const [kontakt, setKontakt] = useState<any>(null);
  const [finanzierungen, setFinanzierungen] = useState<any[]>([]);
  const [activeInvIdx, setActiveInvIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [objekteCache, setObjekteCache] = useState<Record<string, any>>({});
  // Sprung und Hervorhebung für Phasenleiste, „Als Nächstes"-Kasten und
  // Tiefenlinks (?highlight=<abschnitt>) laufen alle über denselben Helfer.
  const { hervorheben, hervorhebenSobaldDa } = useAbschnittHervorheben();

  // Tiefenlink, etwa aus „Deine nächsten Schritte" auf der Übersicht
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    const invId = searchParams.get("inv");
    // Im Reiter „Eigene" wertet EigeneInvestmentsTab den Link selbst aus.
    if (searchParams.get("tab") === "eigene") return;
    if (highlight && !loading && investments.length > 0) {
      if (invId) {
        const idx = investments.findIndex(i => i.id === invId);
        if (idx >= 0) setActiveInvIdx(idx);
      }
      // Die Kästchen erscheinen erst nach dem Investment-Wechsel, deshalb wartet
      // der Helfer, bis es das Ziel gibt.
      hervorhebenSobaldDa(`section-${highlight}`);
      const next = new URLSearchParams(searchParams);
      next.delete("highlight");
      // ?inv bleibt stehen. Vorher wurde es hier mit entfernt, und der Effekt
      // darunter wählte dann ohne ?inv das neueste Investment. Wer mehrere
      // Investments hat, landete so im falschen Investment.
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, loading, investments]);

  const tabParam = searchParams.get("tab");
  const invParam = searchParams.get("inv");
  // Wenn ?inv=ID gesetzt ist (z. B. Sprung aus dem Steuer-Cockpit), automatisch in OS Immobilien-Detailansicht
  const tabFromUrl: "moreimmo" | "eigene" | null =
    tabParam === "eigene" ? "eigene" : tabParam === "moreimmo" || invParam ? "moreimmo" : null;
  const handleTabChange = (val: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (val === "eigene" || val === "moreimmo") next.set("tab", val);
    else next.delete("tab");
    // Beim manuellen Zurück zur Übersicht ggf. auch inv-Param entfernen
    if (val === null) next.delete("inv");
    setSearchParams(next, { replace: true });
  };

  // ?inv=ID -> aktives Investment setzen (auch ohne highlight-Param)
  useEffect(() => {
    if (loading || investments.length === 0) return;
    if (!invParam) {
      // Ohne expliziten ?inv-Param immer das NEUSTE Investment vorauswählen
      const lastIdx = investments.length - 1;
      if (lastIdx !== activeInvIdx) setActiveInvIdx(lastIdx);
      return;
    }
    const idx = investments.findIndex((i) => i.id === invParam);
    if (idx >= 0 && idx !== activeInvIdx) setActiveInvIdx(idx);
  }, [invParam, loading, investments]);

  const reload = async () => {
    if (!authUser) return;
    try {
      const { data: kontakte } = await supabase
        .from("kontakte")
        .select("*")
        .or(`meta->>authUserId.eq.${authUser.id},meta->person2->>authUserId.eq.${authUser.id}`)
        .limit(1);
      const k = kontakte?.[0];
      if (k) {
        setKontakt(k);
        const { data: invs } = await supabase
          .from("investments")
          .select("*")
          .eq("kunde_id", k.id)
          .order("erstellt_am", { ascending: true });
        setInvestments(invs || []);
        // Eigene (externe) Investments für die Portfolio-Übersicht
        const { data: exts } = await supabase
          .from("externe_investments")
          .select("*");
        const filteredExt = (exts || []).filter(
          (i: any) => (i.meta?.quelle || "extern") !== "moreimmo"
        );
        setExterneInvestments(filteredExt);
        const invIds = (invs || []).map((i: any) => i.id);
        if (invIds.length > 0) {
          const { data: fins } = await supabase
            .from("finanzierungen")
            .select("*")
            .in("kunde_id", invIds);
          setFinanzierungen(fins || []);
        } else {
          setFinanzierungen([]);
        }
      }
    } catch (err) {
      console.error("Fehler:", err);
    }
  };

  /*
   * Bewusst an der Kennung und nicht am Objekt `authUser` festgemacht.
   * UserContext setzt bei jeder erneut gemeldeten Sitzung (Rückkehr in den
   * Tab, Token-Erneuerung, kurz nach dem Laden) ein neues Objekt. Dann lief
   * hier das Laden neu an, die Seite zeigte kurz das Skelett und baute den
   * Reiter „Eigene“ neu auf. Ein gerade geöffnetes Formular ging dadurch
   * beim ersten Klick sofort wieder zu.
   */
  useEffect(() => {
    if (!authUser) return;
    setLoading(true);
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id]);

  useEffect(() => { if (refreshKey > 0) reload(); }, [refreshKey]);

  useEffect(() => {
    if (!kontakt) return;
    const invChannel = supabase
      .channel(`inv-realtime-${kontakt.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "investments", filter: `kunde_id=eq.${kontakt.id}` }, () => reload())
      .subscribe();
    // Realtime auf den eigenen Kontakt: VP-/Admin-Änderungen (Freischaltungen, Pipeline-Stufe, ...)
    const kontaktChannel = supabase
      .channel(`kunde-inv-kontakt-${kontakt.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kontakte", filter: `id=eq.${kontakt.id}` }, () => reload())
      .subscribe();
    // Realtime: eigene (externe) Investments – damit die Übersicht ohne Reload aktuell bleibt
    const extChannel = supabase
      .channel(`kunde-inv-ext-${kontakt.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "externe_investments" }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(invChannel);
      supabase.removeChannel(kontaktChannel);
      supabase.removeChannel(extChannel);
    };
  }, [kontakt?.id]);

  useEffect(() => {
    const invIds = investments.map((inv) => inv.id);
    if (!authUser || invIds.length === 0) return;
    const channel = supabase
      .channel(`fin-realtime-${authUser.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "finanzierungen" }, (payload: any) => {
        const row = payload.new || payload.old;
        if (row?.kunde_id && invIds.includes(row.kunde_id)) reload();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [authUser?.id, investments]);

  if (loading) {
    // Skeleton in Seitenstruktur statt zentriertem Spinner
    return (
      <DashboardLayout>
        <div className="space-y-6 px-2">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="portal-card p-5 space-y-4">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-36 rounded-2xl" />
            <Skeleton className="h-36 rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Dashboard-Übersicht (Default-Ansicht beim Klick auf „Investments") ───
  if (tabFromUrl === null) {
    // Aggregierte Kennzahlen über OS Immobilien + eigene Investments.
    // Die Rendite wird nur über Investments mit belegter Miete gerechnet,
    // damit fehlende Angaben das Ergebnis nicht still verwässern.
    const positionen = [
      ...investments.map((inv) =>
        // Jedes Investment mit seiner eigenen Finanzierung. Das aktive Investment entsteht erst weiter
        // unten; ein Zugriff hier warf zur Laufzeit und legte die ganze Seite lahm.
        moreImmoPosition(inv, finanzierungen.find((f) => f.kunde_id === inv.id) || null),
      ),
      ...externeInvestments.map((inv) => eigenePosition(inv)),
    ];
    const kz = berechnePortfolioKennzahlen(positionen);
    const overviewCards = [
      {
        label: t("portal.investments.kpi_investments"), value: kz.anzahl.toString(),
        sub: t("portal.investments.kpi_split", { more: kz.anzahlMoreImmo, eigene: kz.anzahlEigene }),
        icon: Building2, color: "text-primary", bg: "bg-primary/10",
      },
      { label: t("portal.investments.kpi_value"), value: fmt(kz.kaufpreisGesamt), sub: undefined as string | undefined, icon: Wallet, color: "text-foreground", bg: "bg-muted" },
      {
        label: t("portal.investments.kpi_rent"), value: fmt(kz.mieteGesamt),
        sub: kz.mieteAnzahl < kz.anzahl ? t("portal.investments.kpi_yield_basis", { n: kz.mieteAnzahl, m: kz.anzahl }) : undefined,
        icon: Banknote, color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10",
      },
      {
        label: t("portal.investments.kpi_yield"),
        value: kz.rendite != null ? fmtProzent(kz.rendite) : "—",
        sub: kz.rendite != null
          ? t("portal.investments.kpi_yield_basis", { n: kz.mieteAnzahl, m: kz.anzahl })
          : t("portal.investments.kpi_yield_none"),
        icon: TrendingUp, color: "text-primary", bg: "bg-primary/10",
      },
    ];
    return (
      <DashboardLayout>
        <div className="space-y-6 px-2">
          <PortalHero
            eyebrow={t("portal.investments.overview_eyebrow")}
            title={t("portal.investments.overview_title")}
            subtitle={t("portal.investments.overview_subtitle")}
          />

          <div className="portal-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1 h-6 bg-primary rounded" />
              <h2 className="font-bold text-base">{t("portal.investments.portfolio_title")}</h2>
              <span className="text-xs text-muted-foreground ml-auto">{t("portal.investments.portfolio_sub")}</span>
            </div>
            {/* Einspaltig am Handy: Die Zahl der Kennzahl ist gross und passte
                zu zweit nebeneinander nicht in die Kachel. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {overviewCards.map((c) => (
                <div key={c.label} {...einlage("p-4")}>
                  <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center mb-3`}>
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                  <Kennzahl label={c.label} wert={c.value} zusatz={c.sub} />
                </div>
              ))}
            </div>
          </div>

          <GesamtvermoegenCard positionen={positionen} />

          <div className="grid md:grid-cols-2 gap-4">
            <button
              onClick={() => handleTabChange("moreimmo")}
              className="text-left rounded-2xl border border-border/60 bg-card bg-gradient-to-br from-primary/5 via-card to-card hover:border-primary/40 hover:shadow-lg transition-all p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg">{t("portal.investments.card_moreimmo_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.investments.card_moreimmo_desc")}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{t("portal.investments.object_count", { count: investments.length })}</Badge>
                  </div>
                </div>
              </div>
            </button>

            <button
              onClick={() => handleTabChange("eigene")}
              className="text-left rounded-2xl border border-border/60 bg-card bg-gradient-to-br from-[hsl(var(--success))]/5 via-card to-card hover:border-[hsl(var(--success))]/40 hover:shadow-lg transition-all p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
                  <UserIcon className="h-6 w-6 text-[hsl(var(--success))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg">{t("portal.investments.card_eigene_title")}</h3>
                    <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-[hsl(var(--success))] group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("portal.investments.card_eigene_desc")}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{t("portal.investments.object_count", { count: externeInvestments.length })}</Badge>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Eigene Investments (eigener Tab, ohne OS Immobilien-Hülle) ───
  if (tabFromUrl === "eigene") {
    return (
      <DashboardLayout>
        <div className="space-y-4 px-2">
          {/* Der Knopf „Zur Übersicht“ steht im Reiter selbst, nur in der
              Liste. In der Detailansicht gibt es genau einen Zurück-Knopf. */}
          <EigeneInvestmentsTab onZurUebersicht={() => handleTabChange(null)} />
        </div>
      </DashboardLayout>
    );
  }

  // ─── OS Immobilien: keine Investments vorhanden ───
  if (investments.length === 0) {
    return (
      <DashboardLayout>
        <div className="space-y-4 px-2">
          <button
            onClick={() => handleTabChange(null)}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.investments.back_to_overview")}
          </button>
          <PortalHero
            eyebrow={t("portal.investments.empty_moreimmo_eyebrow")}
            title={t("portal.investments.empty_moreimmo_title")}
            subtitle={t("portal.investments.empty_moreimmo_subtitle")}
          />
        </div>
      </DashboardLayout>
    );
  }

  const activeInv = investments[activeInvIdx] || investments[0];
  const invMeta = (activeInv?.meta || {}) as Record<string, any>;
  const kontaktMeta = (kontakt?.meta || {}) as Record<string, any>;
  const pipelineStufe = invMeta.pipelineStufe || kontaktMeta.pipelineStufe || "erstgespraech_geplant";
  const step = mapPipelineToStep(pipelineStufe);
  const invLabel = investmentBezeichnung(activeInv.objekt, activeInv.wohnung) || t("portal.investments.investment_fallback");

  const handleStepClick = (stepKey: string) => {
    hervorheben(`section-${stepKey}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 px-2">
        <button
          onClick={() => handleTabChange(null)}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" /> {t("portal.investments.back_to_overview")}
        </button>
        <div className="space-y-6">
        {/* ─── Investment Selector (above hero) ─── */}
        {investments.length > 1 && (
          <Tabs value={String(activeInvIdx)} onValueChange={(v) => setActiveInvIdx(Number(v))}>
            <TabsList className="h-auto max-w-full justify-start">
              {investments.map((inv, idx) => {
                const lbl = investmentBezeichnung(inv.objekt, inv.wohnung) || `${t("portal.investments.investment_fallback")} ${idx + 1}`;
                return (
                  <TabsTrigger key={inv.id} value={String(idx)} className="gap-1.5 whitespace-nowrap">
                    <Building2 className="h-3.5 w-3.5" />
                    {lbl}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        )}

        {/* ─── Hero Header with Stepper ─── */}
        <PortalHero
          eyebrow={`${t("portal.investments.investment_count", { count: investments.length })} · ${t("portal.investments.phase_label")}: ${stepLabel(PIPELINE_STEPS[step >= 0 ? step : 0]?.key)}`}
          title={invLabel}
          subtitle={t("portal.investments.detail_subtitle")}
          rightSlot={activeInv.kaufpreis > 0 ? (
            <div {...einlage("px-5 py-3")}>
              <p className="text-xs text-[hsl(var(--portal-akzent-deep))] uppercase tracking-[0.18em] font-semibold">{t("portal.investments.purchase_price")}</p>
              <p className="text-xl font-semibold text-foreground mt-0.5">{fmt(activeInv.kaufpreis)}</p>
            </div>
          ) : undefined}
        />

        {/* ─── Dein nächster Schritt – warmer Call-to-Action ─── */}
        <NextStepCard
          pipelineStufe={pipelineStufe}
          investmentId={activeInv.id}
          investmentLabel={investments.length > 1 ? invLabel : undefined}
        />

        {/* ─── Concierge: persönliche Finanzierbarkeit auf Basis der Selbstauskunft ─── */}
        {kontakt?.id && (
          /* Die Auswertung gehört zum gewählten Investment, nicht zum Kunden. */
          <KundeFinanzierbarkeitCard
            investmentId={activeInv.id}
            saSigned={!saNeueUnterschriftAusstehend(invMeta) && !!(invMeta?.saSigned || invMeta?.saData?.unterschrift || invMeta?.saSignedPdfUrl || invMeta?.saSignedAt || invMeta?.docStatuses?.Selbstauskunft === "approved")}
          />
        )}

        {/* ─── Einnahmen & Ausgaben aus der Selbstauskunft dieses Kaufs ───
             Standen früher auf der Portal-Startseite, dort einmal je
             Investment untereinander. Sie gehören zu genau einem Kauf und
             stehen deshalb hier, direkt unter der Finanzierbarkeit. */}
        <EinnahmenAusgabenKarten saData={eigeneSaDataFuerInvestmentRow(activeInv)} />

        {/* ─── Klassischer interner Stepper – bleibt unten als Phasen-Navigator ─── */}
        <div className="portal-card p-4 sm:p-5">
          <HorizontalStepper currentStep={step >= 0 ? step : 0} onStepClick={handleStepClick} />
        </div>

        {/* ─── Echtdaten-Cards: Liquidität (halbe Breite) ─── */}
        <div className="grid md:grid-cols-2 gap-4">
          <LiquiditaetCard
            invMeta={invMeta}
            finanzierung={finanzierungen.find((f) => f.kunde_id === activeInv.id)}
          />
        </div>

        {/* ─── Verknüpfung zum Steuer- & Wertentwicklungs-Cockpit ─── */}
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{t("portal.investments.steuer_link_title")}</h3>
              <p className="text-xs text-muted-foreground">{t("portal.investments.steuer_link_sub")}</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link to={`/kunde/steuer-cockpit?inv=${activeInv.id}`}>{t("portal.investments.steuer_link_open")}</Link>
          </Button>
        </Card>

        {/* ─── Tilgungsplan, Cashflow & Reinvest-Hinweis ─── */}
        {(() => {
          // Gemeinsamer Adapter, gleiche Datenbasis wie die Steuer-Seite
          // (Raten-Fallback aus dem Angebot, nur erfasste Nebenkosten).
          const fin = finanzierungen.find((f) => f.kunde_id === activeInv.id);
          const adapted = adaptMoreImmoInvestment(activeInv, invMeta, fin);
          const monate = monateSeitLetztemKauf(adapted);
          const hatFinanzierung = adapted.hatFinanzierung;
          // Nur die Selbstauskunft dieses Investments, kein Rueckfall auf einen
          // kontaktweiten Altbestand (Regel in saQuelle.ts).
          const saData = invMeta?.saData || invMeta?.saSnapshot;
          return (
            <div className="space-y-4">
              {monate !== null && monate >= 6 && <ReinvestHinweisCard monateSeitKauf={monate} />}
              {hatFinanzierung && <TilgungsplanCard inv={adapted} />}
              {hatFinanzierung && <CashflowForecastCard inv={adapted} saData={saData} />}
            </div>
          );
        })()}

        {/* ─── C6: Empfehlungs-Karte (nur bei vollständiger SA) ─── */}
        <EmpfehlungsRecommendationCard
          invMeta={invMeta}
          kontaktMeta={kontaktMeta}
          saData={invMeta?.saData || invMeta?.saSnapshot}
        />

        {/* B3 Notartermin-Auswahl & B3/B4 Abwicklungs-Status sind jetzt in die Phasen-Kästchen "Notar" bzw. "Abwicklung & Dokumente" integriert */}

        {/* ─── D1: Bewertung nach Abschluss ─── */}
        <BewertungCard
          kundeId={kontakt?.id || ""}
          investmentId={activeInv.id}
          beraterId={kontakt?.zustaendig_id || null}
          beraterName={kontakt?.berater || ""}
          pipelineStufe={activeInv.pipelineStufe || ""}
        />

        {/* ─── All Phases in vertical order ─── */}
        <div className="space-y-4">
          {PIPELINE_STEPS.map((s, i) => {
            const Icon = s.icon;
            let isDone = i < step;
            let isActive = i === step;
            let isFuture = i > step;

            /*
             * Die Bonitätsunterlagen liegen in der Pipeline zwar hinter der
             * Reservierung, der Upload beginnt aber wie im Kundenprofil schon
             * mit der Selbstauskunft (Mindest-Set Personalausweis und letzter
             * Gehaltsnachweis, Rest nach Freischaltung). Sobald der
             * SA-Prozess läuft, ist das Kästchen deshalb zugänglich, ohne
             * dass die dazwischenliegenden Phasen als erledigt gelten.
             */
            let unlocked = false;
            if (s.key === "bonitaetsunterlagen" && isFuture) {
              const saProzessLaeuft =
                fortschrittsRang(pipelineStufe) >= fortschrittsRang("selbstauskunft") ||
                !!(invMeta.saData || invMeta.saSigned || invMeta.saSignedPdfUrl || invMeta.saInvitationSentAt);
              if (saProzessLaeuft) {
                isFuture = false;
                unlocked = true;
              }
            }

            /*
             * Dasselbe für die Finanzierung, wenn der Vermerk „Kunde
             * finanziert selbst" gesetzt ist. Der Partner hat den Schalter
             * bewusst umgelegt, also soll der Kunde seine Bankzusage und
             * seine Darlehensverträge ab sofort ablegen können und nicht erst
             * dann, wenn die Pipeline von allein bei der Finanzierung ankommt.
             */
            if (s.key === "finanzierung" && isFuture) {
              if ((invMeta.eigenfinanzierung as { aktiv?: boolean } | undefined)?.aktiv) {
                isFuture = false;
                unlocked = true;
              }
            }

            // Spezialfall Notar: "Abgeschlossen"-Badge erst zeigen, wenn der bestätigte
            // Notartermin (Datum + ggf. Uhrzeit) tatsächlich in der Vergangenheit liegt.
            // Solange der Termin in der Zukunft liegt, bleibt die Phase "Aktuell".
            if (s.key === "notar" && isDone) {
              const bestaetigt = invMeta?.notarTerminBestaetigt as { datum?: string; uhrzeit?: string } | undefined;
              const nd = invMeta?.notarData || {};
              const datumStr = bestaetigt?.datum || nd.datum || invMeta?.notarTermin;
              const uhrzeitStr = bestaetigt?.uhrzeit || nd.uhrzeit || invMeta?.notarUhrzeit || "00:00";
              if (datumStr) {
                const terminDate = new Date(`${datumStr}T${(uhrzeitStr || "00:00").length === 5 ? uhrzeitStr : "00:00"}:00`);
                if (!isNaN(terminDate.getTime()) && terminDate.getTime() > Date.now()) {
                  // Termin liegt in Zukunft → noch nicht abgeschlossen, sondern aktuell
                  isDone = false;
                  isActive = true;
                }
              } else {
                // Kein Datum bekannt → noch nicht abgeschlossen
                isDone = false;
                isActive = true;
              }
            }

            // Hinweis-Banner für Finanzierung ausblenden, sobald Angebote oder freigegebene Dokumente vorliegen
            let hideHint = false;
            if (s.key === "finanzierung") {
              /*
               * Achtung: Die Spalte `finanzierungen.kunde_id` trägt historisch
               * die Investment-Kennung, nicht die des Kontakts. Der Kopf von
               * `src/lib/finanzierungStore.ts` weist ausdrücklich darauf hin.
               * Hier stand bis zum 10.09.2026 `kontakt?.id`, die Suche fand
               * also nie eine Finanzierung. Sichtbare Folge im Kundenportal:
               * Der Hinweiskasten blieb stehen, obwohl längst Angebote oder
               * unterschriebene Unterlagen vorlagen. Nur ein gesetzter
               * `finanzierungsStatus` am Investment hat den Fall gerettet.
               */
              const finForKunde = finanzierungen.filter((f: any) => f.kunde_id === activeInv?.id);
              const hasAngebote = finForKunde.some((f: any) => Array.isArray(f.angebote) && f.angebote.length > 0);
              const hasSignedDocs = finForKunde.some((f: any) =>
                (f.angebote || []).some((a: any) =>
                  (a.dokumente || []).some((d: any) => d.status === "signed")
                )
              );
              hideHint = hasAngebote || hasSignedDocs || !!invMeta.finanzierungsStatus;
            }

            return (
              <PhaseCard
                key={s.key}
                icon={Icon}
                label={stepLabel(s.key)}
                stepKey={s.key}
                currentStep={step}
                completed={isDone}
                sectionId={`section-${s.key}`}
                isActive={isActive}
                hideHint={hideHint}
                unlocked={unlocked}
              >
                {!isFuture
                  ? renderPhaseContent(s.key, step, activeInv, invMeta, kontakt, kontaktMeta, finanzierungen, objekteCache, setObjekteCache, () => setRefreshKey(k => k + 1))
                  : null
                }
              </PhaseCard>
            );
          })}
        </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

/* ─── Phase Content Renderer ─── */
function renderPhaseContent(
  key: string,
  step: number,
  inv: any,
  invMeta: Record<string, any>,
  kontakt: any,
  kontaktMeta: Record<string, any>,
  finanzierungen: any[],
  objekteCache: Record<string, any>,
  setObjekteCache: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  onRefresh: () => void,
) {
  const t = (k: string, opts?: any) => i18n.t(k, opts) as string;
  switch (key) {
    case "erstgespraech":
      return <p className="text-xs text-muted-foreground">{t("portal.investments.erstgespraech_text")}</p>;

    case "bonitaetsunterlagen":
      return <BonitaetsSection inv={inv} invMeta={invMeta} kontakt={kontakt} kontaktMeta={kontaktMeta} onRefresh={onRefresh} />;

    case "objektauswahl":
      if (inv.objekt) {
        return <ObjektauswahlDetails inv={inv} invMeta={invMeta} objekteCache={objekteCache} setObjekteCache={setObjekteCache} />;
      }
      if (invMeta.einheitGewechseltAm) {
        return (
          <div className="rounded-lg border border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[hsl(var(--warning))]">{t("portal.investments.unit_changed_title")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("portal.investments.unit_changed_text")}
                </p>
              </div>
            </div>
          </div>
        );
      }
      if (kontaktMeta.unterlagenFreigegebenAm) {
        return (
          <div className="rounded-lg border border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5 p-4 space-y-2">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[hsl(var(--success))]">{t("portal.investments.bonitaet_done_title")}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("portal.investments.bonitaet_done_text")}
                </p>
              </div>
            </div>
          </div>
        );
      }
      // In der aktiven Phase steht derselbe Satz schon als Hinweis im Kopf des
      // Kästchens (PhaseCard). Doppelt stand er untereinander.
      if (step === stepIndexOf("objektauswahl")) return null;
      return <p className="text-xs text-muted-foreground">{t("portal.investments.section_hints.objektauswahl")}</p>;

    case "reservierung":
      return invMeta.rvSigned ? (
        <div className="space-y-2">
          <div className="bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 rounded-lg p-3 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("portal.investments.reservierung.signed_title")}</p>
              {/*
                Wer die Widerrufsfrist abwartet, ist bis zum Fristablauf nicht
                reserviert; „bestätigt" wäre dann falsch. Das Datum vermerkt
                finalize-reservierung, der tägliche Lauf trägt nach, ob die
                Reservierung wirksam wurde oder entfallen ist.
              */}
              <p className="text-xs text-muted-foreground">
                {invMeta.rvEinheitVergeben
                  // Bei der Unterschrift schon vergeben (seit 23.09.2026): keine Reservierung, nichts zahlen.
                  ? t("portal.investments.reservierung.vergeben_sub")
                  : invMeta.rvReservierungEntfallenAm
                  ? t("portal.investments.reservierung.entfallen_sub")
                  : invMeta.rvReservierungAb && !invMeta.rvReservierungWirksamAm
                  ? t("portal.investments.reservierung.wirksam_ab_sub", { date: fmtDatum(invMeta.rvReservierungAb) })
                  : t("portal.investments.reservierung.signed_sub")}
              </p>
            </div>
          </div>
          {/*
            Erst die abgelegte Datei, sonst das PDF aus den Angaben. Die Datei
            liegt unter reservierung/<Kunde>/, lesbar für den Kunden erst mit
            der Migration vom 26.09.2026. Bis dahin tat der Knopf still nichts.
          */}
          {rvZumOeffnen(invMeta) ? (
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={async () => {
              const ergebnis = await reservierungsvereinbarungOeffnen(invMeta);
              if (ergebnis === "fehlgeschlagen") toast.error(t("portal.investments.reservierung.pdf_failed"));
            }}>
              <Download className="h-3 w-3" /> {rvAblagePfad(invMeta)
                ? t("portal.investments.reservierung.download_rv")
                : t("portal.investments.reservierung.download_rv_vereinbarung")}
            </Button>
          ) : null}
        </div>
      ) : invMeta.rvSignaturePending ? (
        <div className="space-y-2">
          <div className="bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/30 rounded-lg p-3 flex items-start gap-3">
            <Clock className="h-5 w-5 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">{t("portal.investments.reservierung.await_sig_title")}</p>
                <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/15">
                  {t("portal.investments.objekt.await_signature")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("portal.investments.reservierung.await_sig_sub_a")}
                {invMeta.rvSignatureSentAt ? t("portal.investments.reservierung.await_sig_sent_at", { date: fmtDatum(invMeta.rvSignatureSentAt) }) : ""}
                {t("portal.investments.reservierung.await_sig_sub_b")}
              </p>
            </div>
          </div>
        </div>
      ) : step >= stepIndexOf("reservierung") ? (
        <div className="flex items-center gap-3 bg-[hsl(var(--warning))]/10 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
          <p className="text-sm text-muted-foreground">{t("portal.investments.reservierung.will_send")}</p>
        </div>
      ) : null;

    case "finanzierung": {
      // Nur Finanzierungen des aktuellen Investments berücksichtigen
      const invFinanzierungen = (finanzierungen || []).filter((f: any) => f.kunde_id === inv.id);
      // Check if financing docs (Finanzierungsangebot + Darlehensvertrag) are uploaded
      const hasFinDocs = (() => {
      let hasAngebot = false, hasDarlehen = false;
      for (const fin of invFinanzierungen) {
          for (const a of (fin.angebote || [])) {
            for (const d of (a.dokumente || [])) {
              // Nur freigegebene (signed) Dokumente zählen für die Anzeige im Kundenportal
              if (d.name === "Finanzierungsangebot" && d.status === "signed") hasAngebot = true;
              if (d.name === "Darlehensvertrag" && d.status === "signed") hasDarlehen = true;
            }
          }
        }
        return hasAngebot && hasDarlehen;
      })();
      const finDone = invMeta.finanzierungsStatus === "bestaetigt" || hasFinDocs;

      /*
       * Eigenfinanzierung: Steht am Investment der Vermerk „Kunde finanziert
       * selbst", lädt der Kunde hier seine eigenen Unterlagen hoch. Die Karte
       * steht immer ganz oben, unabhängig davon, ob der reguläre
       * Finanzierungsweg daneben schon läuft. Der gesperrte Hinweis ganz unten
       * entfällt dann, sonst stünde neben den Hochladefeldern, die Finanzierung
       * sei noch gesperrt.
       */
      const eigenAktiv = !!(invMeta.eigenfinanzierung as { aktiv?: boolean } | undefined)?.aktiv;
      const eigenKarte = eigenAktiv ? (
        <EigenfinanzierungKundeKarte investmentId={inv.id} kontakt={kontakt} onRefresh={onRefresh} />
      ) : null;

      const finanzierungInhalt = invMeta.finanzierungsStatus ? (
        <div className="space-y-3">
          <Badge className={`text-xs ${
            invMeta.finanzierungsStatus === "bestaetigt" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
          }`}>
            {invMeta.finanzierungsStatus === "bestaetigt" ? t("portal.investments.finanzierung.confirmed_badge") : t("portal.investments.finanzierung.track_badge")}
          </Badge>
          <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
            {invMeta.finanzierungsBank && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.investments.finanzierung.bank")}</span><span>{invMeta.finanzierungsBank}</span></div>}
            {invMeta.finanzierungsSumme && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.investments.finanzierung.loan_amount")}</span><span>{fmt(Number(invMeta.finanzierungsSumme))}</span></div>}
            {invMeta.finanzierungsZins && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.investments.finanzierung.interest")}</span><span>{invMeta.finanzierungsZins}</span></div>}
            {invMeta.finanzierungsTilgung && <div className="flex justify-between"><span className="text-muted-foreground">{t("portal.investments.finanzierung.repayment")}</span><span>{invMeta.finanzierungsTilgung}</span></div>}
          </div>
          <FinanzierungDokumente finanzierungen={invFinanzierungen} kundeId={kontakt?.id} />
        </div>
      ) : (step >= stepIndexOf("finanzierung") && (finanzierungIstFrei(invMeta) || !!invMeta.selbstauskunftEntfaellt?.aktiv)) ? (
        <div className="space-y-3">
          {!finDone && (
            <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">{t("portal.investments.finanzierung.processing")}</p>
            </div>
          )}
          <FinanzierungDokumente finanzierungen={invFinanzierungen} kundeId={kontakt?.id} />
        </div>
      ) : eigenAktiv ? null : (
        /*
          Die Finanzierung ist noch nicht an der Reihe. Frueher stand hier
          nichts, und der Kunde sah einen leeren Kasten ohne Erklaerung.
          Jetzt steht dort, woran es liegt: Zwischen der unterschriebenen
          Reservierung und der Finanzierung liegen die Bonitaetsunterlagen.
          Erst wenn die vollstaendig hochgeladen und freigegeben sind, sieht
          der Kunde die Finanzierung (Entscheidung vom 11.09.2026).

          Bewusst anders als im Kundenprofil: Dort ist die Finanzierung seit
          dem 25.09.2026 schon ab der unterschriebenen Reservierung offen,
          auch waehrend der Bonitaetsunterlagen, damit der
          Finanzierungspartner das Angebot hochladen kann
          (`finanzierungIntern` in `src/lib/investmentFreischaltung.ts`).
          Intern frueher, beim Kunden erst nach der Freigabe.
        */
        <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            {t("portal.investments.finanzierung.locked")}
          </p>
        </div>
      );

      if (!eigenKarte) return finanzierungInhalt;
      return (
        <div className="space-y-4">
          {eigenKarte}
          {finanzierungInhalt}
        </div>
      );
    }

    case "notar": {
      const nd = invMeta.notarData || {};
      // Schutz: Ohne Aufnahmebogen Notar werden keine Notar-Daten im Portal angezeigt.
      const hatAufnahmebogen = !!(invMeta.kaufvertragPdf && String(invMeta.kaufvertragPdf).trim() !== "");
      // Vom Kunden bestätigter Termin hat Vorrang vor VP-eingetragenen Daten
      const bestaetigt = hatAufnahmebogen
        ? (invMeta.notarTerminBestaetigt as { datum: string; uhrzeit: string; bestaetigtAm: string } | undefined)
        : undefined;
      // WICHTIG: VP-eingetragene Notardaten dürfen erst nach expliziter Freigabe angezeigt werden.
      // Ein vom Kunden bestätigter Vorschlag wird unabhängig davon immer angezeigt.
      const portalFreigegeben = hatAufnahmebogen && !!invMeta.notarTerminPortalFreigabe;
      const modus = (invMeta.notarTerminModus || "gesetzt") as "gesetzt" | "vorschlaege";
      const showVPDaten = portalFreigegeben || !!bestaetigt;
      // Datum/Uhrzeit: Bei Modus "gesetzt" aus Notardaten, bei Modus "vorschlaege" nur wenn der Kunde bestätigt hat.
      // Robuster Fallback: notarData → top-level Felder → Bestätigung. Leere Strings werden als "nicht gesetzt" behandelt.
      const pickFirst = (...vals: any[]): string | undefined => {
        for (const v of vals) { if (v !== undefined && v !== null && String(v).trim() !== "") return String(v); }
        return undefined;
      };
      const datum = bestaetigt?.datum || (showVPDaten && modus === "gesetzt" ? pickFirst(nd.datum, invMeta.notarTermin) : undefined);
      const uhrzeit = pickFirst(bestaetigt?.uhrzeit) || (showVPDaten && modus === "gesetzt" ? pickFirst(nd.uhrzeit, invMeta.notarUhrzeit) : undefined);
      // Notar-Stammdaten: bei Vorschlagsmodus auch ohne bestätigten Termin sichtbar (sobald freigegeben)
      const name = showVPDaten ? (nd.name || invMeta.notarName) : undefined;
      const adresse = showVPDaten ? (nd.adresse || invMeta.notarAdresse) : undefined;
      const verkaeufer = showVPDaten ? (nd.verkaeufer || invMeta.notarVerkaeufer) : undefined;
      const vertretung = showVPDaten ? (nd.vertretung || invMeta.notarVerkaeufervertretung) : undefined;
      const hatStammdaten = !!(name || adresse || verkaeufer || vertretung);
      return (
        <div className="space-y-3">
          {/* B3: Mehrere Notartermin-Vorschläge zur Auswahl (still wenn keine Vorschläge oder bereits bestätigt) */}
          <NotarterminAuswahlCard
            investmentId={inv.id}
            invMeta={invMeta}
            onConfirmed={onRefresh}
          />
          {/*
            Wenn der Kunde bereits einen Termin bestätigt hat, übernimmt die obige
            NotarterminAuswahlCard die prominente grüne Bestätigungs-Karte inkl.
            Datum/Uhrzeit. Damit es kein doppeltes Kästchen gibt, blenden wir hier
            in dem Fall die "Datum/Uhrzeit"-Box aus und zeigen nur noch die
            zusätzlichen Stammdaten (Notar, Adresse, Verkäufer ...).
          */}
          {datum && !bestaetigt ? (
            // Modus "gesetzt": VP hat einen festen Notartermin eingetragen und freigegeben.
            // Der Termin steht fest – wird in derselben prominenten grünen Box wie eine
            // Kunden-Bestätigung dargestellt (kein zusätzliches weißes Kästchen).
            // Notar-Stammdaten (Name, Adresse, ...) sind direkt eingebettet.
            <Card className="p-5 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm mb-1">{t("portal.investments.notar.termin_steht_title")}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t("portal.investments.notar.termin_steht_text_a")} <strong className="text-foreground">{fmtDatum(datum)}</strong>
                    {uhrzeit && <> {t("portal.investments.notar.termin_steht_text_at")} <strong className="text-foreground">{uhrzeit} {t("portal.investments.notar.termin_steht_text_oclock")}</strong></>}
                    {t("portal.investments.notar.termin_steht_text_b")}
                  </p>
                  {hatStammdaten && (
                    <div {...einlage("mt-3 grid grid-cols-2 gap-3 p-3")}>
                      {name && <div><span className="block text-muted-foreground text-xs">{t("portal.investments.notar.name")}</span><p className="font-medium text-xs">{name}</p></div>}
                      {adresse && <div><span className="block text-muted-foreground text-xs">{t("portal.investments.notar.address")}</span><p className="font-medium text-xs">{adresse}</p></div>}
                      {verkaeufer && <div><span className="block text-muted-foreground text-xs">{t("portal.investments.notar.seller")}</span><p className="font-medium text-xs">{verkaeufer}</p></div>}
                      {vertretung && <div className="col-span-2"><span className="block text-muted-foreground text-xs">{t("portal.investments.notar.seller_rep")}</span><p className="font-medium text-xs">{vertretung}</p></div>}
                    </div>
                  )}
                  <div className="mt-3 flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/20">
                    <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-[11px] text-foreground leading-relaxed">
                      <strong>{t("portal.investments.notar.leave_early_strong")}</strong>{t("portal.investments.notar.leave_early_text")}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          ) : null}
          {/* Stammdaten werden ab sofort direkt in die grüne Box eingebettet (siehe oben
              bzw. NotarterminAuswahlCard für den vom Kunden bestätigten Fall). Hier nur
              noch der "Termin folgt"-Hinweis, falls noch nichts feststeht. */}
          {!datum && !bestaetigt && step >= stepIndexOf("notar") ? (
            <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              <p className="text-sm text-muted-foreground">{t("portal.investments.notar.will_inform")}</p>
            </div>
          ) : null}

          {/* Aftersales-Beratung Hinweis (kein eigener Portal-Tab) */}
          {(() => {
            const ab = (invMeta?.aftersalesBeratung as Record<string, any>) || {};
            if (ab.kundeSignedAt || ab.status === "abgeschlossen") {
              return (
                <div className="flex items-center gap-3 rounded-lg p-3 bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/30">
                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                  <p className="text-sm">{t("portal.investments.aftersales_done")}</p>
                </div>
              );
            }
            if (ab.vpSignedAt || ab.status === "wartet_auf_kunde") {
              return (
                <div className="rounded-lg p-3 bg-primary/5 border border-primary/30">
                  <p className="text-sm font-medium mb-1">{t("portal.investments.aftersales_wait_title")}</p>
                  <p className="text-xs text-muted-foreground">{t("portal.investments.aftersales_wait_text")}</p>
                </div>
              );
            }
            if (bestaetigt || datum) {
              return (
                <div className="flex items-center gap-3 rounded-lg p-3 bg-muted/50">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground">{t("portal.investments.aftersales_pending")}</p>
                </div>
              );
            }
            return null;
          })()}
        </div>
      );
    }


    case "faelligkeit": {
      return (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground mb-2">{t("portal.investments.faelligkeit.intro")}</p>

          {/* B3/B4: Abwicklungs-Status nach Notartermin (Fälligkeit, Zahlung, Grundbuch) – still wenn Notartermin noch nicht bestätigt */}
          <AbwicklungStatusCard invMeta={invMeta} />

          {/* Kundenordner: nur noch als Verweis – Hauptansicht in Sidebar */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-bold">{t("portal.investments.faelligkeit.kundenordner_title")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("portal.investments.faelligkeit.kundenordner_sub")}</p>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="text-xs gap-1.5">
                <a href="/kunde/kundenordner">{t("portal.investments.faelligkeit.open")} <ChevronRight className="h-3 w-3" /></a>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

/* ─── Objektauswahl Details ─── */
function ObjektauswahlDetails({ inv, invMeta, objekteCache, setObjekteCache }: {
  inv: any;
  invMeta: Record<string, any>;
  objekteCache: Record<string, any>;
  setObjekteCache: React.Dispatch<React.SetStateAction<Record<string, any>>>;
}) {
  const { t } = useTranslation();
  const objektId = invMeta.objektId || inv.objektId || "";
  const wohnungId = invMeta.wohnungId || inv.wohnungId || "";
  const cached = objektId ? objekteCache[objektId] : null;
  const [loadingObj, setLoadingObj] = useState(false);

  useEffect(() => {
    if (!objektId || cached || loadingObj) return;
    setLoadingObj(true);
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-expose?id=${objektId}`;
    // Ohne den apikey-Header weist die Function den Aufruf ab, dann fehlten
    // im Portal still die Objektbilder und Kennzahlen.
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setObjekteCache(prev => ({ ...prev, [objektId]: data })); })
      .catch(() => {})
      .finally(() => setLoadingObj(false));
  }, [objektId]);

  const objData = cached?.objekt;
  const bilder = cached?.bilder || [];
  const wohnungen = cached?.wohnungen || [];
  const wohnung = wohnungId ? wohnungen.find((w: any) => w.id === wohnungId) : null;
  const isReservedForCustomer = !!wohnung && wohnung.status === "reserviert";
  const awaitingSignature = isReservedForCustomer && !invMeta.rvSigned;
  const showEnriched = (!!invMeta.rvSigned || isReservedForCustomer) && objData;

  if (!showEnriched) {
    const virt = invMeta.rvVirtualWohnung;
    if (virt) {
      return (
        <div className="space-y-3">
          {invMeta.rvSigned && (
            <div className="rounded-lg p-3 flex items-center gap-2 border bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20">
              <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
              <span className="text-sm font-medium">{t("portal.investments.objekt.reservation_confirmed")}</span>
            </div>
          )}
          {/*
            Das Foto, das der Vertrieb im Investment hinterlegt hat.

            Objekte aus dem eigenen Bestand bringen ihre Bilder über das
            Exposé mit, weiter unten. Ein von Hand eingetragenes Objekt hatte
            bis hierher gar keins, der Kunde sah nur Kacheln mit Text.

            Seit dem 22.09.2026 sind es mehrere, und der Kunde blättert selbst
            durch. `bildUrl` trägt weiterhin das Titelbild, für Vorgänge aus
            der Zeit davor ist es das einzige.
          */}
          <PortalObjektBilder
            bilder={bilderListe(virt.bilder, virt.bildUrl)}
            alt={virt.objAdresse || t("portal.investments.objekt.object")}
            texte={{
              vorheriges: t("portal.investments.objekt.prev_image"),
              naechstes: t("portal.investments.objekt.next_image"),
              bildNr: (nr, gesamt) => t("portal.investments.objekt.image_of", { nr, gesamt }),
            }}
          />
          {/*
            Die Kacheln des von Hand eingetragenen Objekts.

            Zimmer, Etage, Lage, Baujahr und Hausgeld waren hier lange nicht
            vorgesehen, obwohl die Ablage die Schlüssel führt. Der Kunde sah
            deshalb bei einem Handeintrag dauerhaft nur vier Kacheln, egal wie
            gepflegt das Investment war. Die Rendite wird gerechnet und nicht
            gelesen: Ein eingetragener Wert veraltet, sobald jemand Preis oder
            Miete korrigiert.
          */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {(virt.objAdresse || virt.objPlz || virt.objOrt) && (
              <div {...einlage("p-3 col-span-2 md:col-span-3")}>
                <span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.object")}</span>
                <p className="font-medium text-xs">{[virt.objAdresse, [virt.objPlz, virt.objOrt].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
              </div>
            )}
            {virt.weNr && (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.unit")}</span><p className="font-medium text-xs">{t("portal.investments.objekt.unit_no", { nr: virt.weNr })}</p></div>
            )}
            {virt.groesse && (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.area")}</span><p className="font-medium text-xs">{virt.groesse} m²</p></div>
            )}
            {virt.zimmer && (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.rooms")}</span><p className="font-medium text-xs">{virt.zimmer}</p></div>
            )}
            {(virt.etage || virt.lage) && (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.floor_location")}</span><p className="font-medium text-xs">{[virt.etage, virt.lage].filter(Boolean).join(" · ")}</p></div>
            )}
            {virt.baujahr ? (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.year_built")}</span><p className="font-medium text-xs">{virt.baujahr}</p></div>
            ) : null}
            {virt.kaufpreis ? (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.purchase_price")}</span><p className="font-medium text-xs">{fmt(virt.kaufpreis)}</p></div>
            ) : null}
            {virt.miete ? (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.net_rent_month")}</span><p className="font-medium text-xs">{fmt(virt.miete)}</p></div>
            ) : null}
            {virt.hausgeld ? (
              <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.hausgeld")}</span><p className="font-medium text-xs">{fmt(virt.hausgeld)}</p></div>
            ) : null}
            {(() => {
              const rendite = renditeAusMiete(Number(virt.kaufpreis) || 0, Number(virt.miete) || 0);
              if (rendite == null) return null;
              return (
                <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.yield")}</span><p className="font-medium text-xs">{fmtProzent(rendite)}</p></div>
              );
            })()}
          </div>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.object")}</span><p className="font-medium text-xs">{inv.objekt}</p></div>
        {inv.wohnung && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.unit")}</span><p className="font-medium text-xs">{inv.wohnung}</p></div>}
        {inv.kaufpreis > 0 && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.purchase_price")}</span><p className="font-medium text-xs">{fmt(inv.kaufpreis)}</p></div>}
      </div>
    );
  }

  const heroImages = bilder.slice(0, 3);
  const whgBilder = wohnung?.bilder || [];

  return (
    <div className="space-y-4">
      {isReservedForCustomer && (
        <div className={`rounded-lg p-3 flex items-center gap-2 flex-wrap border ${awaitingSignature ? "bg-[hsl(var(--warning))]/10 border-[hsl(var(--warning))]/30" : "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20"}`}>
          {awaitingSignature ? (
            <Clock className="h-4 w-4 text-[hsl(var(--warning))] shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
          )}
          <span className="text-sm font-medium">
            {awaitingSignature ? t("portal.investments.objekt.reserved_for_you") : t("portal.investments.objekt.reservation_confirmed")}
          </span>
          {awaitingSignature && (
            <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] hover:bg-[hsl(var(--warning))]/15">
              {t("portal.investments.objekt.await_signature")}
            </Badge>
          )}
        </div>
      )}

      {(heroImages.length > 0 || whgBilder.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">{t("portal.investments.objekt.images")}</p>
          <div className="grid grid-cols-3 gap-2">
            {(whgBilder.length > 0 ? whgBilder.slice(0, 3) : heroImages).map((img: any, i: number) => (
              <div key={i} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted">
                <img src={img.url} alt={img.alt || objData?.titel || t("portal.investments.objekt.image_alt")} className="w-full h-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <div {...einlage("p-3")}>
          <span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.object")}</span>
          <p className="font-medium text-xs">{objData?.titel || inv.objekt}</p>
        </div>
        {objData?.adresse && (
          <div {...einlage("p-3 col-span-2")}>
            <span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.address")}</span>
            <p className="font-medium text-xs">{objData.adresse}{objData.plz || objData.ort ? `, ${objData.plz || ""} ${objData.ort || ""}`.trim() : ""}</p>
          </div>
        )}
        {/*
          Die Wohnung kommt roh aus der Datenbank.

          `get-expose` gibt die Zeilen aus `wohnungen` unverändert weiter, und
          dort heißen die Spalten `we_nr`, `miete_gesamt`, `vk_gesamt`,
          `qm_preis`. Gelesen wurden hier bisher nur die Namen in
          Binnenschreibung, die der interne Speicher erzeugt. Folge: Die Kachel
          mit der Nettomiete erschien nie, und die Einheit fiel immer auf den
          Wert am Investment zurück. Beide Schreibweisen stehen jetzt da, die
          rohe zuerst.
        */}
        {wohnung ? (
          <>
            <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.unit")}</span><p className="font-medium text-xs">{wohnung.we_nr || wohnung.weNr || wohnung.name || inv.wohnung}</p></div>
            {(wohnung.groesse || wohnung.qm) && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.area")}</span><p className="font-medium text-xs">{wohnung.groesse || wohnung.qm} m²</p></div>}
            {wohnung.zimmer > 0 && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.rooms")}</span><p className="font-medium text-xs">{wohnung.zimmer}</p></div>}
            {(wohnung.etage || wohnung.lage) && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.floor_location")}</span><p className="font-medium text-xs">{[wohnung.etage, wohnung.lage].filter(Boolean).join(", ")}</p></div>}
            {(wohnung.miete_gesamt > 0 || wohnung.miete > 0 || wohnung.nettomiete > 0) && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.net_rent_month")}</span><p className="font-medium text-xs">{fmt(wohnung.miete_gesamt || wohnung.miete || wohnung.nettomiete)}{t("portal.investments.objekt.per_month")}</p></div>}
          </>
        ) : (
          <>{inv.wohnung && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.unit")}</span><p className="font-medium text-xs">{inv.wohnung}</p></div>}</>
        )}
        {inv.kaufpreis > 0 && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.purchase_price")}</span><p className="font-medium text-xs">{fmt(inv.kaufpreis)}</p></div>}
        {(wohnung?.rendite > 0 || objData?.rendite_von > 0) && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.yield")}</span><p className="font-medium text-xs">{fmtProzent(Number(wohnung?.rendite || objData?.rendite_von || 0))}</p></div>}
        {objData?.global_baujahr && <div {...einlage("p-3")}><span className="block text-muted-foreground text-xs">{t("portal.investments.objekt.year_built")}</span><p className="font-medium text-xs">{objData.global_baujahr}</p></div>}
      </div>

      {objData?.highlights?.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground">{t("portal.investments.objekt.highlights")}</p>
          <div className="flex flex-wrap gap-1.5">
            {objData.highlights.slice(0, 6).map((h: string, i: number) => (
              <Badge key={i} variant="outline">{h}</Badge>
            ))}
          </div>
        </div>
      )}

      {wohnung && <WohnungsExposeButton antwort={cached} wohnungId={wohnung.id} />}
    </div>
  );
}

/* ─── Wohnungsexposé Button ─── */
function WohnungsExposeButton({ antwort, wohnungId }: { antwort: { objekt: unknown; bilder?: unknown[]; dokumente?: unknown[]; wohnungen?: unknown[] }; wohnungId: string }) {
  const { t } = useTranslation();
  const [generating, setGenerating] = useState(false);

  /*
   * Seit 01.10.2026 dasselbe Exposé-PDF wie im Kundenlink (Design H3,
   * `exposeDruck`), aus der `get-expose`-Antwort, die das Portal ohnehin
   * geladen hat. Sprache wie das Portal, also die des Kunden.
   */
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const [{ exposePayloadZuObjekt }, { kundenExposePdf }] = await Promise.all([
        import("@/lib/exposePublicDaten"),
        import("@/lib/kundenansichtExpose"),
      ]);
      const objekt = exposePayloadZuObjekt(antwort);
      const einheit = objekt.wohnungen.find((w) => w.id === wohnungId) ?? null;
      const { blob, dateiname } = await kundenExposePdf(objekt, einheit, undefined, new Date(), portalSprache());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = dateiname;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(t("portal.investments.objekt.expose_success"));
    } catch (err) {
      console.error("Exposé generation failed:", err);
      toast.error(t("portal.investments.objekt.expose_fail"));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="pt-2 border-t">
      <Button size="sm" variant="outline" className="text-xs gap-1.5 w-full justify-center" onClick={handleGenerate} disabled={generating}>
        {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
        {generating ? t("portal.investments.objekt.expose_creating") : t("portal.investments.objekt.expose_download")}
      </Button>
    </div>
  );
}

/* ─── Finanzierung Dokumente ─── */
function FinanzierungDokumente({ finanzierungen, kundeId }: { finanzierungen: any[]; kundeId?: string }) {
  const { t } = useTranslation();
  const RELEVANT_DOCS = ["Finanzierungsangebot", "Grundschuld", "Darlehensvertrag"];
  const docs: { name: string; fileUrl?: string; angebotId: string; docId: string }[] = [];
  for (const fin of finanzierungen) {
    for (const angebot of (fin.angebote || [])) {
      for (const doc of (angebot.dokumente || [])) {
        // Nur freigegebene (signed) Finanzierungsdokumente werden im Kundenportal angezeigt
        if (RELEVANT_DOCS.includes(doc.name) && doc.status === "signed") {
          if (!docs.find(d => d.name === doc.name)) docs.push({ name: doc.name, fileUrl: doc.fileUrl, angebotId: angebot.id, docId: doc.id });
        }
      }
    }
  }
  if (docs.length === 0) return null;

  const handleDownload = async (doc: typeof docs[0]) => {
    if (doc.fileUrl) { await openUnterlage(doc.fileUrl); return; }
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      for (const fin of finanzierungen) {
        const { data: files } = await supabase.storage.from("unterlagen").list(`finanzierung/${fin.kunde_id}/${doc.angebotId}`);
        const match = files?.find(f => f.name.startsWith(`${doc.docId}_`));
        if (match) {
          const url = await resolveUnterlagenUrl(`finanzierung/${fin.kunde_id}/${doc.angebotId}/${match.name}`);
          if (url) { window.open(url, "_blank"); return; }
        }
      }
    } catch {}
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{t("portal.investments.finanzierung.fin_docs_heading")}</p>
      <div className="space-y-1.5">
        {docs.map(doc => (
          <Button key={doc.name} size="sm" variant="outline" className="text-xs gap-1.5 w-full justify-start h-8" onClick={() => handleDownload(doc)}>
            <Download className="h-3 w-3" /> {docAnzeige(doc.name)}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ─── Kundenordner Section ─── */
function KundenordnerSection({ invMeta, kontaktMeta, finanzierungen }: { invMeta: Record<string, any>; kontaktMeta: Record<string, any>; finanzierungen: any[] }) {
  const { t } = useTranslation();
  const customDocs = kontaktMeta.customDocTitles || [];
  const DEFAULT_DOCS = ["Reservierungsvertrag", "IBAN Immobilienkonto", "Kaufvertragsentwurf", "Grundschuld", "Kaufvertrag", "Kaufpreisfälligkeit", "GBA Erwerbvormerkung", "Darlehensvertrag", "Kaufnebenkosten"];
  const allDocs = [...DEFAULT_DOCS, ...customDocs];
  const docStatuses = invMeta.docStatuses || {};
  const docFileUrls = invMeta.docFileUrls || {};

  const finSyncDocs: Record<string, boolean> = {};
  const finSyncUrls: Record<string, string> = {};
  for (const fin of finanzierungen) {
    for (const a of (fin.angebote || [])) {
      for (const d of (a.dokumente || [])) {
        // Nur freigegebene (signed) Dokumente werden in den Kundenordner gespiegelt
        if ((d.name === "Darlehensvertrag" || d.name === "Grundschuld") && d.status === "signed") {
          finSyncDocs[d.name] = true;
          if (d.fileUrl) finSyncUrls[d.name] = d.fileUrl;
        }
      }
    }
  }

  const kundenordnerDocs: { kategorie: string; filename: string; fileUrl?: string; freigegeben?: boolean }[] = (invMeta.kundenordner || []).filter((d: any) => d.freigegeben);
  // Der Store schreibt die Zusatzkategorien unter "kundenordnerCustomKat";
  // das Portal las jahrelang den falschen Schlüssel und zeigte sie nie.
  const customKats: string[] = invMeta.kundenordnerCustomKat || invMeta.kundenordnerCustomKategorien || [];
  const allKats = [...new Set([...allDocs, ...customKats, ...kundenordnerDocs.map(d => d.kategorie)])];

  const uploadedCount = allKats.filter(kat =>
    docStatuses[kat] === "uploaded" || docStatuses[kat] === "approved" || finSyncDocs[kat] || kundenordnerDocs.some(d => d.kategorie === kat)
  ).length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">{t("portal.investments.kundenordner_section.intro")}</p>
      {uploadedCount === 0 ? (
        <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">{t("portal.investments.kundenordner_section.empty")}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {allKats.map(kat => {
            const isUploaded = docStatuses[kat] === "uploaded" || docStatuses[kat] === "approved";
            const isSynced = finSyncDocs[kat] && !isUploaded;
            const koDoc = kundenordnerDocs.find(d => d.kategorie === kat);
            const fileUrl = docFileUrls[kat] || koDoc?.fileUrl || finSyncUrls[kat];
            if (!isUploaded && !isSynced && !koDoc) return null;
            return (
              <div key={kat} className="flex items-center gap-3 bg-muted/50 rounded-lg p-2.5">
                <div className="w-2 h-2 rounded-full shrink-0 bg-[hsl(var(--success))]" />
                <span className="text-xs font-medium flex-1">{docAnzeige(kat)}</span>
                {fileUrl ? (
                  <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => openUnterlage(fileUrl)}>
                    <Download className="h-3 w-3 mr-1" /> {t("portal.investments.kundenordner_section.download")}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("portal.investments.kundenordner_section.available")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Bonitätsunterlagen Section ─── */
// Exportiert nur für KundeInvestments.bonitaetUpload.test.tsx.
export function BonitaetsSection({ inv, invMeta, kontakt, kontaktMeta, onRefresh }: {
  inv: any;
  invMeta: Record<string, any>;
  kontakt: any;
  kontaktMeta: Record<string, any>;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState<string | null>(null);
  const [scanDialogPerson, setScanDialogPerson] = useState<number | null>(null);
  /*
   * Vermerk „Kunde finanziert selbst“ (`selbstauskunftEntfaellt` im
   * Investment-meta, gesetzt im CRM): Bonitätscheck und Bankprüfung werden
   * nicht gebraucht. Der Kunde soll dann nicht zum Hochladen aufgefordert
   * werden, die Listen stehen eingeklappt wie im Kundenprofil. Hochladen
   * bleibt nach dem Aufklappen freiwillig möglich.
   */
  const unterlagenEntfallen = !!(invMeta.selbstauskunftEntfaellt as { aktiv?: boolean } | undefined)?.aktiv;
  const [freiwilligOffen, setFreiwilligOffen] = useState(false);

  /*
   * Sofortanzeige der Unterlagen (wie im Kundenprofil).
   *
   * Hochladen und Löschen sollen unmittelbar sichtbar sein. Die Seite lädt
   * nach jeder Änderung neu und bekommt zusätzlich Live-Ereignisse auf die
   * Tabelle investments. Trifft ein solcher Nachlauf mit einem älteren Stand
   * ein, überschreibt er die frische Anzeige: Das Dokument verschwindet kurz
   * und kommt wieder, beim Löschen umgekehrt.
   *
   * Der Sollstand hält deshalb den gewünschten Endzustand fest und legt ihn
   * über die Daten aus der Datenbank, bis diese denselben Stand melden.
   */
  const [unterlagenSollstand, setUnterlagenSollstand] = useState<
    Record<string, { status: DocStatus | null; url?: string | null }>
  >({});
  const setzeSollstand = (
    docName: string,
    wert: { status: DocStatus | null; url?: string | null } | null,
  ) => {
    setUnterlagenSollstand((prev) => {
      const next = { ...prev };
      if (wert === null) delete next[docName];
      else next[docName] = wert;
      return next;
    });
  };

  // Sobald die Datenbank denselben Stand meldet, wird die Überlagerung gelöst.
  useEffect(() => {
    const dbStatuses = (invMeta.docStatuses || {}) as Record<string, DocStatus>;
    setUnterlagenSollstand((prev) => {
      const next = { ...prev };
      let geaendert = false;
      for (const [name, wert] of Object.entries(prev)) {
        const dbStatus = dbStatuses[name] || null;
        const passt =
          wert.status === null
            ? !dbStatus
            : dbStatus === wert.status || dbStatus === "approved";
        if (passt) {
          delete next[name];
          geaendert = true;
        }
      }
      return geaendert ? next : prev;
    });
  }, [invMeta]);

  // Freischaltung: exakt dieselbe Regel wie im Kundenprofil (eigenes
  // Investment-Flag, sonst Rückfall auf die Kontakt-Ebene inklusive
  // Portal-Aktivierung, für JEDES Investment). Vorher galt der Rückfall hier
  // nur für Investment Nummer 1, jedes weitere blieb dauerhaft gesperrt.
  const unterlagenFreigeschaltet = istUnterlagenFreigeschaltetAusMeta(invMeta, kontaktMeta);
  const hasP2 = !!(kontaktMeta.person2 || kontakt?.meta?.person2);

  /*
   * Maßgeblich ist AUSSCHLIESSLICH die Selbstauskunft dieses Investments.
   *
   * Vorher fiel die Auswahl auf die neueste Selbstauskunft über alle
   * Investments zurück. Ein Kunde mit zwei Käufen sah beim zweiten damit die
   * Unterlagenliste des ersten. Welche Nachweise gebraucht werden, hängt aber
   * an seiner Beschäftigung, Wohnsituation, seinen Krediten und Konten zum
   * Zeitpunkt genau dieses Kaufs (Regel in saQuelle.ts).
   *
   * Grundunterlagen wie Personalausweis, Gehaltsnachweise und Schufa hängen
   * nicht an der Selbstauskunft. Sie bleiben stehen, der Kunde kann sie also
   * jederzeit hochladen.
   *
   * Die Liste setzt `portalUnterlagenListe` zusammen, dieselbe Funktion wie
   * auf /kunde/profil (Entscheidung Christian, 25.09.2026: eine Liste im
   * Portal).
   */
  const bankListen = portalBankListen(inv, kontaktMeta);
  const bankDocsP1Basis = bankListen.p1;
  const bankDocsP2Basis = bankListen.p2;
  const bankListeOffen = bankListen.ohneEigeneSa;

  // Alt-Uploads unter den früheren Portal-Schlüsseln (z. B. 'Eigener
  // Mietvertrag / „Mietfrei-Bestätigung"') zählen beim Lesen für die neuen,
  // kanonischen Zeilen, damit nichts verschwindet.
  const alleDocNamen = [...bankDocsP1Basis, ...bankDocsP2Basis].map((d) => d.name);
  const docStatuses: Record<string, DocStatus> = applyLegacyDocKeys(invMeta.docStatuses, alleDocNamen);
  const docFileUrls: Record<string, string> = applyLegacyDocKeys(invMeta.docFileUrls, alleDocNamen);
  const docRejectReasons: Record<string, string> = applyLegacyDocKeys(invMeta.docRejectReasons, alleDocNamen);

  // Der zuletzt gewollte Stand hat Vorrang vor der Datenbankantwort.
  for (const [name, wert] of Object.entries(unterlagenSollstand)) {
    if (wert.status === null) {
      delete docStatuses[name];
      delete docFileUrls[name];
      delete docRejectReasons[name];
    } else {
      docStatuses[name] = wert.status;
      if (wert.url) docFileUrls[name] = wert.url;
      delete docRejectReasons[name];
    }
  }

  /*
   * Bereits hochgeladene Positionen bleiben sichtbar, auch wenn sie für die
   * aktuelle Selbstauskunft nicht mehr vorgesehen sind (freiwillige Altzeile).
   * Selbstständige haben keine Gehaltsnachweise (Entscheidung Christian,
   * 15.09.2026). Beides regelt die gemeinsame Portalliste.
   */
  const portalListe = portalUnterlagenListe({ investmentRow: inv, kontaktMeta, docStatuses, bankListen });
  const bankBaseP1 = portalListe.p1.bank;
  const pflichtP1 = portalListe.p1.pflicht;
  const pflichtP2 = portalListe.p2.pflicht;
  const gehaltsP1 = portalListe.p1.gehalts;
  const additionalP2 = portalListe.p2.weitere;
  const allP1Docs = portalListe.p1.alle;
  const allP2Docs = portalListe.p2.alle;
  const activeP1Docs = portalListe.p1.aktiv;
  const activeP2Docs = portalListe.p2.aktiv;

  const uploadDoc = async (docName: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = true;
    // WICHTIG: Das Input-Element MUSS im DOM hängen, sonst kann es in manchen
    // Browsern (Safari/iOS, schnelle Klicks) vor dem change-Event verworfen
    // werden und der File-Upload geht verloren ("erst beim langsamen Klick
    // klappt es"). Wir hängen es unsichtbar an, hören sowohl auf `change` als
    // auch auf `cancel`/Window-Focus, und räumen erst danach auf.
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";
    input.style.opacity = "0";
    input.style.pointerEvents = "none";
    document.body.appendChild(input);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      try { input.remove(); } catch { /* noop */ }
      window.removeEventListener("focus", onFocusFallback);
    };
    // Fallback: Wenn der Nutzer den Dateidialog abbricht, feuert `change` nicht.
    // Wir räumen nach kurzer Verzögerung beim Re-Focus auf das Fenster auf,
    // damit das Element nicht für immer im DOM bleibt.
    const onFocusFallback = () => {
      setTimeout(() => {
        if (!input.files || input.files.length === 0) cleanup();
      }, 500);
    };
    window.addEventListener("focus", onFocusFallback, { once: true });

    input.addEventListener("change", async (e) => {
      const filesList = (e.target as HTMLInputElement).files;
      if (!filesList || filesList.length === 0) { cleanup(); return; }
      const files = Array.from(filesList);
      const allPdf = files.every((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (!allPdf) {
        toast.error(t("portal.investments.bon.only_pdf"));
        cleanup();
        return;
      }
      /*
       * Die Zeile zeigt ab jetzt „In Prüfung“, ohne auf den Server zu warten.
       * Genau das trägt die Datenbank nach dem Hochladen auch ein
       * (register_unterlage_upload setzt in einem Schritt "uploaded"), es gibt
       * also keinen fachlichen Zwischenstand. Scheitert das Hochladen, gilt
       * wieder der vorherige Stand, damit kein falscher Status stehen bleibt.
       */
      const sollstandVorher = unterlagenSollstand[docName] ?? null;
      let registriert = false;
      const zuruecksetzen = () => {
        if (!registriert) setzeSollstand(docName, sollstandVorher);
      };
      setzeSollstand(docName, { status: "uploaded" });
      setUploading(docName);
      try {
        // Mehrere PDFs in Auswahl-Reihenfolge zu einer PDF zusammenführen
        let file: File | Blob = files[0];
        if (files.length > 1) {
          const { PDFDocument } = await import("pdf-lib");
          const merged = await PDFDocument.create();
          for (const f of files) {
            const bytes = await f.arrayBuffer();
            const src = await PDFDocument.load(bytes);
            const copied = await merged.copyPages(src, src.getPageIndices());
            copied.forEach((p) => merged.addPage(p));
          }
          const out = await merged.save();
          file = new Blob([out as BlobPart], { type: "application/pdf" });
        }
        const safeName = docName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
        const path = `${kontakt.id}/${inv.id}/${safeName}_${Date.now()}.pdf`;
        const { error: uploadError } = await supabase.storage.from("unterlagen").upload(path, file, { upsert: true, contentType: "application/pdf" });
        if (uploadError) { zuruecksetzen(); toast.error(t("portal.investments.bon.upload_failed") + uploadError.message); return; }
        const { error: registerError } = await supabase.rpc("register_unterlage_upload", {
          _investment_id: inv.id,
          _doc_name: docName,
          _file_url: path,
        });
        if (registerError) { zuruecksetzen(); toast.error(t("portal.investments.bon.save_failed") + registerError.message); return; }
        registriert = true;
        // Jetzt mit Dateipfad, damit „Ansehen“ sofort die neue Datei öffnet.
        setzeSollstand(docName, { status: "uploaded", url: path });
        await notifyVP(kontakt, docName);
        toast.success(files.length > 1 ? t("portal.investments.bon.multi_pdfs_merged", { n: files.length }) : t("portal.investments.bon.doc_uploaded"));
        onRefresh();
      } catch (err) {
        console.error(err);
        zuruecksetzen();
        toast.error(t("portal.investments.bon.generic_error"));
      } finally {
        setUploading(null);
        cleanup();
      }
    });

    // Klick erst NACHDEM der Listener gesetzt und das Element im DOM ist,
    // damit der File-Picker garantiert mit angeschlossenem onchange öffnet.
    input.click();
  };

  const deleteDoc = async (docName: string) => {
    try {
      /*
       * Löschen läuft über eine eigene RPC mit Berechtigungsprüfung
       * (unregister_unterlage_upload, Migration 20260901121000). Das frühere
       * direkte UPDATE auf investments traf wegen fehlender Schreibrechte
       * null Zeilen ohne Fehler, und der Erfolgs-Toast log. Erfolg wird jetzt
       * NUR gemeldet, wenn die RPC wirklich durchgelaufen ist; solange die
       * Migration nicht ausgeführt wurde, erscheint ein sauberer Fehler.
       */
      const fileUrl = docFileUrls[docName];
      // Sofort aus der Anzeige nehmen, Rückfall bei Fehler.
      setzeSollstand(docName, { status: null });
      const { error } = await (supabase as any).rpc("unregister_unterlage_upload", {
        _investment_id: inv.id,
        _doc_name: docName,
      });
      if (error) {
        console.error("unregister_unterlage_upload:", error);
        setzeSollstand(docName, null);
        toast.error(t("portal.investments.bon.delete_failed"));
        return;
      }
      // Alt-Uploads unter den früheren Portal-Schlüsseln mit abmelden, sonst
      // lebt die Zeile über den Lese-Rückfall sofort wieder auf.
      for (const altName of LEGACY_DOC_KEYS[docName] || []) {
        if ((invMeta.docStatuses || {})[altName]) {
          await (supabase as any).rpc("unregister_unterlage_upload", {
            _investment_id: inv.id,
            _doc_name: altName,
          });
        }
      }
      // Datei im Storage erst nach erfolgreicher Abmeldung entfernen. Ein
      // Fehler hier lässt höchstens eine verwaiste Datei zurück und soll den
      // gemeldeten Erfolg nicht kippen.
      if (fileUrl) {
        try {
          let pfad = fileUrl;
          if (/^https?:\/\//i.test(fileUrl)) {
            const urlObj = new URL(fileUrl);
            const pathMatch = urlObj.pathname.match(/\/object\/(?:public|sign)\/unterlagen\/(.+)/);
            pfad = pathMatch ? decodeURIComponent(pathMatch[1]) : "";
          }
          if (pfad) await supabase.storage.from("unterlagen").remove([pfad]);
        } catch (storageErr) {
          console.warn("Storage-Löschung fehlgeschlagen:", storageErr);
        }
      }
      toast.success(t("portal.investments.bon.doc_deleted"));
      // War die Finanzierung schon frei, erfaehrt der Finanzierungspartner
      // davon (gemeinsamer Helfer mit dem Kundenprofil). Sie bleibt frei.
      void meldeBonitaetNachFreigabeAusPortal({
        investmentId: inv.id,
        kundeId: kontakt?.id || "",
        kundeName: [kontakt?.vorname, kontakt?.nachname].filter(Boolean).join(" "),
        docName,
        aktion: "geloescht",
        metaVorher: invMeta,
      });
      onRefresh();
    } catch (err) {
      console.error(err);
      setzeSollstand(docName, null);
      toast.error(t("portal.investments.bon.delete_failed"));
    }
  };

  const p1Total = activeP1Docs.filter(d => d.required).length;
  const p1Done = activeP1Docs.filter(d => d.required).filter(d => { const st = docStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length;
  const p2Total = hasP2 ? activeP2Docs.filter(d => d.required).length : 0;
  const p2Done = hasP2 ? activeP2Docs.filter(d => d.required).filter(d => { const st = docStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length : 0;
  const allApproved = [...activeP1Docs, ...(hasP2 ? activeP2Docs : [])].filter(d => d.required).every(d => docStatuses[d.name] === "approved");

  const renderDocList = (docs: { name: string; required: boolean }[], isLocked: boolean) =>
    docs.map(doc => {
      const status: DocStatus = docStatuses[doc.name] || "none";
      return (
        <DocRowKunde key={doc.name} doc={doc} status={status} fileUrl={docFileUrls[doc.name]} rejectReason={docRejectReasons[doc.name]} onUpload={() => uploadDoc(doc.name)} onReplace={() => uploadDoc(doc.name)} onDelete={() => deleteDoc(doc.name)} disabled={isLocked} busy={uploading === doc.name} />
      );
    });

  return (
    <div>
      {unterlagenEntfallen ? (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">{t("portal.investments.bon.entfaellt_title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("portal.investments.bon.entfaellt_text")}</p>
          <button
            type="button"
            onClick={() => setFreiwilligOffen((offen) => !offen)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60"
            aria-expanded={freiwilligOffen}
          >
            {freiwilligOffen
              ? <><ChevronUp className="h-3.5 w-3.5" /> {t("portal.investments.bon.entfaellt_einklappen")}</>
              : <><ChevronDown className="h-3.5 w-3.5" /> {t("portal.investments.bon.entfaellt_anzeigen")}</>}
          </button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">{t("portal.investments.bon.intro")}</p>
      )}

      <div hidden={unterlagenEntfallen && !freiwilligOffen}>
      {/* Prominenter Upload-Optionen-Banner */}
      <div className="mb-5 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/[0.03] to-transparent p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground mb-0.5">{t("portal.investments.bon.banner_title")}</p>
            <p className="text-xs text-muted-foreground">
              {t("portal.investments.bon.banner_sub_a")} <span className="text-muted-foreground/70">{t("portal.investments.bon.banner_sub_or")}</span> {t("portal.investments.bon.banner_sub_b")}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button
              size="sm"
              className="h-10 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
              onClick={() => setScanDialogPerson(1)}
            >
              <Smartphone className="h-4 w-4" /> {t("portal.investments.bon.scan_btn")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 gap-2"
              onClick={() => {
                const el = document.getElementById("kunde-docs-bonitaet");
                el?.scrollIntoView({ behavior: "smooth", block: "start" });
                toast.info(t("portal.investments.bon.use_upload_below"));
              }}
            >
              <Upload className="h-4 w-4" /> {t("portal.investments.bon.files_btn")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <h4 id="kunde-docs-bonitaet" className="font-semibold text-xs text-primary scroll-mt-24">{t("portal.investments.bon.p1_heading", { name: `${kontakt?.vorname ?? ""} ${kontakt?.nachname ?? ""}`.trim() })}</h4>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setScanDialogPerson(1)}>
          <Smartphone className="h-3.5 w-3.5" /> {t("portal.investments.bon.scan_btn")}
        </Button>
      </div>
      {(() => {
        // Selbstauskunft virtual doc - auto-green if SA signed
        const saSignedUrl = invMeta.saSignedPdfUrl || invMeta.docFileUrls?.["Selbstauskunft"] || null;
        // Nach einer Korrektur zählt der alte Abschluss nicht, bis neu unterschrieben ist (26.09.2026).
        const saSigned = !saNeueUnterschriftAusstehend(invMeta)
          && !!(invMeta.saSigned || invMeta.saData?.unterschrift || saSignedUrl || invMeta.saSignedAt);

        // Bonitätscheck: Selbstauskunft, Personalausweis, Gehaltsnachweise
        // (nur bei Anstellung), Schufa
        const bonitaetsDocs = [
          { name: "Selbstauskunft", required: true },
          ...pflichtP1,
          ...gehaltsP1,
          SCHUFA_DOC,
        ];

        // Bankprüfung: dieselbe vollständige Liste wie im Kundenprofil
        // (Grundliste je Beschäftigungsart, Wohn-Nachweis, Kredite,
        // Vermögens- und Kontonachweise, manuelle Zusatzdokumente).
        const bankDocs = bankBaseP1;

        // Initially only SA, Personalausweis, Letzter Gehaltsnachweis are enabled
        // Everything else in Bonitätscheck and Bankprüfung is locked until VP triggers freischaltung
        const INITIAL_ENABLED_DOCS = ["Selbstauskunft", "Personalausweis", "Letzter Gehaltsnachweis"];
        const isDocLocked = (docName: string, isBankSection: boolean) => {
          if (unterlagenFreigeschaltet) return false;
          if (INITIAL_ENABLED_DOCS.includes(docName)) return false;
          return true; // locked
        };

        // For Selbstauskunft, override status if signed
        const effectiveDocStatuses = { ...docStatuses };
        if (saSigned && !effectiveDocStatuses["Selbstauskunft"]) {
          effectiveDocStatuses["Selbstauskunft"] = "approved";
        }
        const effectiveDocFileUrls = { ...docFileUrls };
        if (saSigned && saSignedUrl && !effectiveDocFileUrls["Selbstauskunft"]) {
          effectiveDocFileUrls["Selbstauskunft"] = saSignedUrl;
        }

        const boniAll = bonitaetsDocs;
        const boniDone = boniAll.filter(d => { const st = effectiveDocStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length;
        const bankReq = bankDocs;
        const bankDone = bankReq.filter(d => { const st = effectiveDocStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length;

        const legendRow = (
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-destructive inline-block" /> {t("portal.investments.bon.legend_missing")}
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block ml-2" /> {t("portal.investments.bon.legend_check")}
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block ml-2" /> {t("portal.investments.bon.legend_approved")}
          </p>
        );

        // Handle SA PDF download from saData
        const handleSaPdfDownload = async () => {
          /*
           * Die abgelegte Datei der geltenden Unterschrift zuerst: Sie ist das
           * Dokument, das der Kunde unterschrieben hat. Klappt das nicht,
           * etwa weil die Datei fehlt, wie bisher aus den Angaben erzeugt.
           */
          const abgelegt = aktuellerSaPdfPfad(invMeta);
          if (abgelegt && await unterlageHerunterladen(abgelegt, `Selbstauskunft_${kontakt?.vorname ?? ""}_${kontakt?.nachname ?? ""}.pdf`)) {
            return;
          }
          if (saSignedUrl) {
            // Gespeichert ist meist ein Pfad im Eimer, keine fertige Adresse.
            await openUnterlage(saSignedUrl);
            return;
          }
          if (invMeta.saData) {
            try {
              const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
              // Signaturen IMMER live aus signature_requests laden, damit auch
              // Zwischenstand-Entwürfe (z. B. nur Person 1 hat unterschrieben)
              // die bereits geleistete Unterschrift im PDF zeigen — unabhängig davon,
              // ob meta.saSignatures schon gespiegelt wurde.
              // Grundlage nur die Unterschriften zur geltenden Fassung.
              let liveSigs: any = saGeltendeUnterschriftenAusMeta(invMeta);
              try {
                const { data: sigRows } = await supabase
                  .from("signature_requests")
                  .select("person_type, name, signature_data, signed_at, status, created_at")
                  .eq("kontakt_id", kontakt!.id)
                  .eq("investment_id", inv.id)
                  .not("person_type", "like", "rv_%")
                  .order("created_at", { ascending: false });
                const latest = new Map<string, any>();
                for (const r of (sigRows || [])) {
                  if (!latest.has(r.person_type)) latest.set(r.person_type, r);
                }
                const merged: any = { ...liveSigs };
                for (const [pt, r] of latest) {
                  if (r.status === "signed" && r.signature_data) {
                    const key = (pt === "person2" || pt === "partner") ? "person2" : "person1";
                    merged[key] = { signatureData: r.signature_data, signedAt: r.signed_at, name: r.name };
                  }
                }
                liveSigs = merged;
              } catch (sigErr) {
                console.warn("[SA-Entwurf] Live-Signaturen konnten nicht geladen werden:", sigErr);
              }
              const pdf = await generateSelbstauskunftPDF(invMeta.saData, { vorname: kontakt?.vorname || "", nachname: kontakt?.nachname || "", moreId: "" }, liveSigs);
              pdf.save(`Selbstauskunft_${kontakt?.vorname}_${kontakt?.nachname}.pdf`);
            } catch (err) {
              console.error("SA PDF error:", err);
              toast.error(t("portal.investments.bon.pdf_failed"));
            }
          }
        };

        const renderDocListWithOverrides = (docs: { name: string; required: boolean }[], isBankSection: boolean) =>
          docs.map(doc => {
            // Special handling for Selbstauskunft
            if (doc.name === "Selbstauskunft") {
              const saStatus: DocStatus = saSigned ? "approved" : "none";
              return (
                <DocRowKunde
                  key={doc.name}
                  doc={doc}
                  status={saStatus}
                  fileUrl={saSignedUrl || undefined}
                  onUpload={() => {}}
                  onReplace={() => {}}
                  onDelete={() => {}}
                  disabled={!saSigned}
                  customAction={saSigned ? (
                    <button
                      className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1"
                      onClick={handleSaPdfDownload}
                    >
                      <Download className="h-3 w-3" /> {t("portal.investments.doc.download_pdf")}
                    </button>
                  ) : undefined}
                />
              );
            }
            const status: DocStatus = effectiveDocStatuses[doc.name] || "none";
            const locked = isDocLocked(doc.name, isBankSection);
            return (
              <DocRowKunde key={doc.name} doc={doc} status={status} fileUrl={effectiveDocFileUrls[doc.name]} rejectReason={docRejectReasons[doc.name]} onUpload={() => uploadDoc(doc.name)} onReplace={() => uploadDoc(doc.name)} onDelete={() => deleteDoc(doc.name)} disabled={locked} busy={uploading === doc.name} />
            );
          });

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
            {/* Bonitätscheck (left) */}
            <div className="pr-0 md:pr-5 md:border-r border-border/50">
              {legendRow}
              <p className="text-xs font-bold mb-3">{t("portal.investments.bon.bonitaetscheck")}</p>
              <div className="space-y-3">{renderDocListWithOverrides(bonitaetsDocs, false)}</div>
              {(docStatuses[SCHUFA_DOC.name] || "none") === "none" && (
                <div className="ml-5 bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    <AlertCircle className="h-3 w-3 inline mr-1 text-primary" />{t("portal.investments.bon.schufa_no_yet")}
                  </p>
                  <a href={SCHUFA_ORDER_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="text-xs gap-1.5"><ExternalLink className="h-3 w-3" /> {t("portal.investments.bon.schufa_order")}</Button>
                  </a>
                </div>
              )}
              {/* Bonitätscheck Progress */}
              <div className="mt-4 pt-3 border-t">
                <div className="flex items-center gap-2">
                  <div className="flex gap-0.5 flex-1">
                    {boniAll.map((doc, i) => {
                      const st = effectiveDocStatuses[doc.name] || "none";
                      const barColor = st === "approved" ? "bg-[hsl(var(--success))]" : st === "uploaded" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
                      return <div key={i} className={`h-2.5 flex-1 rounded-sm ${barColor}`} />;
                    })}
                  </div>
                  <span className="text-xs text-muted-foreground">{boniDone}/{boniAll.length}</span>
                </div>
              </div>
            </div>
            {/* Bankprüfung (right) */}
            <div className="pl-0 md:pl-5 pt-4 md:pt-0">
              {legendRow}
              <p className="text-xs font-bold mb-3">{t("portal.investments.bon.bankpruefung")}</p>
              {/* Ohne eigene Selbstauskunft steht die Liste noch nicht fest.
                  Statt der Liste eines anderen Kaufs steht hier, warum. */}
              {bankListeOffen && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-3">
                  <p className="text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 inline mr-1 text-primary" />
                    {t("portal.investments.bon.ohne_eigene_sa")}
                  </p>
                </div>
              )}
              <div className="space-y-3">{renderDocListWithOverrides(bankDocs, true)}</div>
              {/* Bankprüfung Progress */}
              {bankReq.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5 flex-1">
                      {bankReq.map((doc, i) => {
                        const st = effectiveDocStatuses[doc.name] || "none";
                        const barColor = st === "approved" ? "bg-[hsl(var(--success))]" : st === "uploaded" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
                        return <div key={i} className={`h-2.5 flex-1 rounded-sm ${barColor}`} />;
                      })}
                    </div>
                    <span className="text-xs text-muted-foreground">{bankDone}/{bankReq.length}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {hasP2 && (
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h4 className="font-semibold text-xs text-primary">{t("portal.investments.bon.p2_heading", { name: `${kontaktMeta.person2?.vorname ?? ""} ${kontaktMeta.person2?.nachname ?? ""}`.trim() })}</h4>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => setScanDialogPerson(2)}>
              <Smartphone className="h-3.5 w-3.5" /> {t("portal.investments.bon.scan_btn")}
            </Button>
          </div>
          <div className="space-y-3 mb-3">{renderDocList(pflichtP2, false)}</div>
          <div className="space-y-3 mb-3">
            {/* Wie im Kundenprofil: Die Schufa von Person 2 ist erst nach der
                Vollfreigabe offen, initial sind nur Personalausweis und
                letzter Gehaltsnachweis möglich. */}
            {renderDocList([SCHUFA_DOC_P2], !unterlagenFreigeschaltet)}
            {(docStatuses[SCHUFA_DOC_P2.name] || "none") === "none" && (
              <div className="ml-5 bg-primary/5 border border-primary/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-2"><AlertCircle className="h-3 w-3 inline mr-1 text-primary" />{t("portal.investments.bon.schufa_p2")}</p>
                <a href={SCHUFA_ORDER_URL} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="text-xs gap-1.5"><ExternalLink className="h-3 w-3" /> {t("portal.investments.bon.schufa_order")}</Button>
                </a>
              </div>
            )}
          </div>
          <div className="space-y-3">{renderDocList(additionalP2, !unterlagenFreigeschaltet)}</div>
        </div>
      )}

      {allApproved && (
        <div className="bg-[hsl(var(--success))]/5 border border-[hsl(var(--success))]/20 rounded-lg p-3 mb-3 mt-6 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
          <div>
            <p className="text-sm font-medium text-[hsl(var(--success))]">{t("portal.investments.bon.all_approved_title")}</p>
            <p className="text-xs text-muted-foreground">{t("portal.investments.bon.all_approved_sub")}</p>
          </div>
        </div>
      )}
      </div>

      {/* Overall progress removed – shown per column now */}

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-primary mt-3">
          <Loader2 className="h-4 w-4 animate-spin" /><span>{t("portal.investments.bon.uploading")}</span>
        </div>
      )}

      <MobileScanQRDialog
        open={scanDialogPerson !== null}
        onOpenChange={(o) => { if (!o) setScanDialogPerson(null); }}
        kontaktId={kontakt?.id}
        investmentId={inv?.id}
        person={scanDialogPerson || 1}
        block="bonitaet"
        docList={(scanDialogPerson === 2 ? allP2Docs : allP1Docs).map(d => d.name)}
        onUpload={async (upload) => {
          try {
            const { error } = await supabase.rpc("register_unterlage_upload", {
              _investment_id: inv.id,
              _doc_name: upload.docTyp,
              _file_url: upload.fileUrl,
            });
            if (error) {
              toast.error(t("portal.investments.bon.mobile_upload_failed") + error.message);
              return;
            }
            setzeSollstand(upload.docTyp, { status: "uploaded", url: upload.fileUrl });
            await notifyVP(kontakt, upload.docTyp);
            toast.success(t("portal.investments.bon.scan_uploaded", { doc: docAnzeige(upload.docTyp) }));
            onRefresh();
          } catch (err: any) {
            console.error(err);
            toast.error(t("portal.investments.bon.scan_register_failed"));
          }
        }}
      />
    </div>
  );
}

/** Notify VP that customer uploaded a document */
async function notifyVP(kontakt: any, docName: string) {
  try {
    const beraterId = kontakt?.zustaendig_id;
    if (!beraterId) return;
    const kundeName = `${kontakt.vorname} ${kontakt.nachname}`;
    await supabase.from("benachrichtigungen" as any).insert({
      benutzer_id: beraterId,
      titel: `Unterlage prüfen: ${kundeName}`,
      nachricht: `${kundeName} hat „${docName}" hochgeladen. Bitte prüfen und freigeben.`,
      link: `/kunden/${kontakt.id}`,
      ziel_rolle: "vertriebspartner",
    } as any);
    // Die Aufgabe geht an den Berater, nicht an den Kunden. Vorher landete
    // sie in der Inbox des eingeloggten Kunden, der den Text nie brauchte.
    const { addAufgabe } = await import("@/lib/aufgabenStore");
    await addAufgabe({
      kontaktId: kontakt.id,
      typ: "aufgabe",
      prioritaet: "hoch",
      titel: `Unterlagen prüfen: ${kundeName}`,
      beschreibung: `${kundeName} hat „${docName}" im Kundenportal hochgeladen. Bitte die Bonitätscheck- und Bankprüfungsunterlagen prüfen und freigeben.`,
      faelligAm: new Date().toISOString().slice(0, 10),
      uhrzeit: "09:00",
      zugewiesenAn: beraterId,
      erstelltVonName: kundeName,
      ausloeserSchluessel: `portal:unterlage:${kontakt.id}:${docName}`,
    });
  } catch (err) {
    console.error("VP notification failed:", err);
  }
}

async function notifyVPMinReservierungsDocs(kontakt: any) {
  try {
    const beraterId = kontakt?.zustaendig_id;
    if (!beraterId) return;
    const kundeName = `${kontakt.vorname} ${kontakt.nachname}`;
    await supabase.from("benachrichtigungen" as any).insert({
      benutzer_id: beraterId,
      titel: `Vorbereitung Objektauswahl: ${kundeName}`,
      nachricht: `${kundeName} hat Personalausweis und letzten Gehaltsnachweis hochgeladen. Bitte prüfen, freigeben und das Objektauswahlgespräch vorbereiten.`,
      link: `/kunden/${kontakt.id}`,
      ziel_rolle: "vertriebspartner",
    } as any);
    const { addAufgabe } = await import("@/lib/aufgabenStore");
    await addAufgabe({
      kontaktId: kontakt.id,
      typ: "aufgabe",
      prioritaet: "hoch",
      titel: `Objektauswahlgespräch vorbereiten: ${kundeName}`,
      beschreibung: `${kundeName} hat die Mindest-Bonitätsunterlagen hochgeladen, Personalausweis und letzter Gehaltsnachweis. Unterlagen prüfen, freigeben und Objektauswahlgespräch terminieren.`,
      faelligAm: new Date().toISOString().slice(0, 10),
      uhrzeit: "09:00",
      zugewiesenAn: beraterId,
      erstelltVonName: kundeName,
      ausloeserSchluessel: `portal:objektauswahl:${kontakt.id}`,
    });
  } catch (err) {
    console.error("VP MIN_RESERVIERUNG notification failed:", err);
  }
}
