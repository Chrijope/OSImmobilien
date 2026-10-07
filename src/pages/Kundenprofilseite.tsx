import { useState, useEffect } from "react";
import { kundenSprache } from "@/lib/kundenSprache";
import { formatDatum } from "@/lib/utils";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getUserSetting } from "@/lib/userSettingsCache";
import { isTestAccount } from "@/lib/dbStoreHelper";
import { useUser } from "@/contexts/UserContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { updateInvestment } from "@/lib/investmentsStore";
import { toast } from "sonner";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  FileText,
  Send,
  ShieldCheck,
  Building2,
  User,
  Lock,
  Upload,
  AlertCircle,
  Clock,
  Home,
  Landmark,
  Briefcase,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ClipboardCheck,
  FolderOpen,
  Download,
  Gift,
  Heart,
  UserPlus,
  ExternalLink,
  Camera,
  Smartphone,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import i18n from "@/i18n";
import { selbstauskunftEntfaellt } from "@/lib/selbstauskunftEntfaellt";
import { getKontaktById, getKontakte } from "@/lib/kundenStore";
import { supabase } from "@/integrations/supabase/client";
import { getEigenfinanzierung, speichereKundenAngebot, speichereKundenDarlehensvertrag, loescheKundenDarlehensvertrag, alleKundenDarlehensvertraege, type EigenfinanzierungAngebot } from "@/lib/eigenfinanzierungStore";
import { confirmDialog } from "@/lib/confirm";
import { notifyByRole, notifyUser } from "@/lib/bellNotifications";
import { openUnterlage } from "@/lib/storage";
import { cacheGet, cacheSet } from "@/lib/dataCache";
import {
  getInvestmentsByKontakt,
  getInvestmentSaPdf,
  getInvestmentRvPdf,
  getInvestmentNotarData,
  getInvestmentDocStatuses,
  setInvestmentDocStatus,
  getDocsByInvestment,
  getInvestmentNotarFoto,
  getUnterlagenGesendet,
  setUnterlagenGesendet,
  isGrundschuldUploaded,
  getSaData,
  getSaSigned,
  getNotarTerminPortalFreigabe,
  type Investment,
} from "@/lib/investmentsStore";
import { getObjekte } from "@/lib/objekteStore";
import {
  getProgrammByInvestment,
  getEmpfehlungenByInvestment,
  addEmpfehlung,
} from "@/lib/empfehlungenStore";
import { addKontakt } from "@/lib/kundenStore";
import { addAufgabe } from "@/lib/aufgabenStore";
import { PhoneInput } from "@/components/ui/phone-input";
import { normalizeTelefon } from "@/lib/phoneUtils";
import { MobileScanQRDialog } from "@/components/MobileScanQRDialog";
import { applyLegacyDocKeys } from "@/lib/bankpruefungDocs";
import { portalBankListen, portalUnterlagenListe, SCHUFA_DOC, SCHUFA_DOC_P2 } from "@/lib/portalUnterlagenListe";
import { getAbwicklungDaten as abwicklungLesen } from "@/lib/abwicklungStore";

/* ─── Pipeline Steps ─── */

interface AbwicklungDaten {
  kaufpreisfaelligkeitDatum?: string;
  kaufpreisEingegangen?: boolean;
  kaufpreisEingegangenDatum?: string;
  grundbuchDatum?: string;
  provisionsRechnungGestellt?: boolean;
  provisionsRechnungDatum?: string;
  auszahlungDatum?: string;
  auszahlungBestaetigt?: boolean;
  uebergabeDatum?: string;
  anmerkungen?: string;
}

// Eigene Fassung entfernt, es gilt der gemeinsame Store.
function getAbwicklungDaten(investmentId: string): AbwicklungDaten {
  return abwicklungLesen(investmentId) as AbwicklungDaten;
}

/*
 * Die Leiste, die der Kunde auf seiner Profilseite sieht.
 *
 * Sie zeigt bewusst nur die grossen Etappen und teilt den Notar in zwei
 * Schritte, sie kann deshalb nicht einfach `FORTSCHRITT_STUFEN` sein. Die
 * REIHENFOLGE muss aber der Pipeline folgen: Bis zum 08.09.2026 stand hier
 * die Bonitaet noch vor der Objektauswahl, die Pipeline fuehrt sie seit dem
 * 06.08.2026 hinter die Reservierung. Der Kunde sah damit einen anderen
 * Ablauf, als sein Berater im CRM vor sich hatte.
 */
const PIPELINE_STEPS = [
  { key: "erstgespraech", label: "Erstgespräch", icon: User },
  { key: "objektauswahl", label: "Objektauswahl", icon: Home },
  { key: "reservierung", label: "Reservierung", icon: FileText },
  { key: "bonitaetsunterlagen", label: "Bonitätsunterlagen", icon: ShieldCheck },
  { key: "finanzierung", label: "Finanzierung", icon: Landmark },
  { key: "notar_ohne_gs", label: "Notar ohne GS", icon: Briefcase },
  { key: "notar_mit_gs", label: "Notar mit GS", icon: Briefcase },
];

const PORTAL_STEP_TO_CARD: Record<string, string> = {
  bonitaetsunterlagen: "portal-card-bonitaet",
  objektauswahl: "portal-card-wohnung",
  reservierung: "portal-card-reservierung",
  finanzierung: "portal-card-finanzierung",
  notar_ohne_gs: "portal-card-notar",
  notar_mit_gs: "portal-card-notar",
};

/**
 * Adresse zusammensetzen, ohne einzelnes Komma bei fehlenden Teilen.
 *
 * Straße, Hausnummer, PLZ und Ort sind beim Anlegen eines Kontakts optional,
 * deshalb darf hier nicht blind mit Komma verkettet werden.
 */
function adresseZeile(teile: { strasse?: string; hausnummer?: string; plz?: string; ort?: string }): string {
  const strasse = [teile.strasse, teile.hausnummer].filter(Boolean).join(" ").trim();
  const ort = [teile.plz, teile.ort].filter(Boolean).join(" ").trim();
  return [strasse, ort].filter(Boolean).join(", ");
}

function getStepIndex(stufe: string, kundeId?: string): number {
  // Map "notar" to the correct GS sub-step
  if (stufe === "notar") {
    const gs = kundeId ? isGrundschuldUploaded(kundeId) : false;
    const key = gs ? "notar_mit_gs" : "notar_ohne_gs";
    const idx = PIPELINE_STEPS.findIndex(s => s.key === key);
    return idx >= 0 ? idx : 0;
  }
  if (stufe === "faelligkeit") {
    const idx = PIPELINE_STEPS.findIndex(s => s.key === "faelligkeit");
    return idx >= 0 ? idx : 0;
  }
  // Die Pipelinestufe heisst "erstgespraech_geplant", der Portal-Schritt
  // schlicht "erstgespraech". Ausdrueckliche Zuordnung, damit sie nicht am
  // Rueckfall auf Position 0 haengt.
  if (stufe === "erstgespraech_geplant") {
    const idx = PIPELINE_STEPS.findIndex(s => s.key === "erstgespraech");
    return idx >= 0 ? idx : 0;
  }
  // Manuelle Follow-Up-Stufe nach der Objektvorstellung: gleicher Schritt
  // wie die Objektauswahl.
  if (stufe === "follow_up_objekt") {
    const idx = PIPELINE_STEPS.findIndex(s => s.key === "objektauswahl");
    return idx >= 0 ? idx : 0;
  }
  const idx = PIPELINE_STEPS.findIndex(s => s.key === stufe);
  return idx >= 0 ? idx : 0;
}

export default function Kundenprofilseite() {
  const { id } = useParams();
  const [, _forceRefresh] = useState(0);

  // Realtime: re-render on kontakte/investments changes (doc uploads, status changes)
  const _liveV = useLiveVersion(["kontakte", "investments", "finanzierungen"]);

  const allKunden = getKontakte();
  const kunde = (id ? getKontaktById(id) : null) || allKunden[0] || null;
  const investments = kunde ? getInvestmentsByKontakt(kunde.id) : [];

  const [activeInvIdx, setActiveInvIdx] = useState(0);
  const [beraterInfo, setBeraterInfo] = useState<{ name: string; email: string; telefon: string; avatar_url?: string } | null>(null);

  // Fetch berater contact details
  useEffect(() => {
    if (!kunde?.zustaendig_id) return;
    const beraterId = kunde.zustaendig_id;
    Promise.all([
      supabase.from("profiles").select("name, email, avatar_url").eq("id", beraterId).single(),
      supabase.from("user_settings" as any).select("einstellungen").eq("user_id", beraterId).single(),
    ]).then(([profileRes, settingsRes]) => {
      const profile = profileRes.data;
      const sData = settingsRes.data as any;
      const telefon = sData?.einstellungen?.profil?.telefon || "";
      if (profile) {
        setBeraterInfo({ name: profile.name || "", email: profile.email || "", telefon, avatar_url: profile.avatar_url });
      }
    }).catch(() => {});
  }, [kunde?.zustaendig_id]);

  if (!kunde) {
    return (
      <div data-lg="seite" className="min-h-screen bg-muted/30 flex items-center justify-center">
        <p className="text-muted-foreground">Kundenprofil nicht gefunden.</p>
      </div>
    );
  }

  const activeInv = investments[activeInvIdx] || null;

  return (
    <div data-lg="seite" className="min-h-screen bg-muted/30">
      {/* Header */}
      <div data-lg="kopfscheibe" className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-lg">OS Immobilien</h1>
            <p className="text-xs text-muted-foreground">Kundenportal</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{kunde.vorname} {kunde.nachname}</p>
            <p className="text-xs text-muted-foreground">{kunde.email}</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* ─── 1. Stammdaten ─── */}
        <Card className="p-6">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Deine Stammdaten
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Name:</span><span className="font-medium">{kunde.vorname} {kunde.nachname}</span></div>
              <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Geburtstag:</span><span className="font-medium">{kunde.geburtstag || "–"}</span></div>
              <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">E-Mail:</span><span className="font-medium">{kunde.email}</span></div>
              <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Telefon:</span><span className="font-medium">{normalizeTelefon(kunde.telefon) || "–"}</span></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Adresse:</span><span className="font-medium">{adresseZeile(kunde) || "–"}</span></div>
              <div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Vertriebspartner:</span><span className="font-medium">{kunde.berater}</span></div>
              <div className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Quelle:</span><span className="font-medium">{kunde.quelle}</span></div>
              <div className="flex items-center gap-2 text-sm"><Clock className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Angelegt am:</span><span className="font-medium">{formatDatum(kunde.erstellt_am)}</span></div>
            </div>
          </div>
          {/* Person 2 */}
          {kunde.person2 && (
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-semibold text-sm mb-3 text-primary">Person 2</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Name:</span><span className="font-medium">{kunde.person2.vorname} {kunde.person2.nachname}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Geburtstag:</span><span className="font-medium">{kunde.person2.geburtsdatum || "–"}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">E-Mail:</span><span className="font-medium">{kunde.person2.email || "–"}</span></div>
                  <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Telefon:</span><span className="font-medium">{normalizeTelefon(kunde.person2.telefon) || "–"}</span></div>
                </div>
                <div className="space-y-3">
                  {kunde.person2.strasse && (
                    <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /><span className="text-muted-foreground w-24">Adresse:</span><span className="font-medium">{adresseZeile(kunde.person2) || "–"}</span></div>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ─── Persönlicher Vertriebspartner ─── */}
        {(beraterInfo || kunde.berater) && (
          <Card className="p-6 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Dein persönlicher Vertriebspartner
            </h2>
            <div className="flex items-center gap-4">
              {beraterInfo?.avatar_url ? (
                <img src={beraterInfo.avatar_url} alt={beraterInfo.name} className="h-16 w-16 rounded-full object-cover border-2 border-primary/20" />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-8 w-8 text-primary" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <p className="text-lg font-semibold">{beraterInfo?.name || kunde.berater}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {(beraterInfo?.telefon) && (
                    <a href={`tel:${beraterInfo.telefon}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Phone className="h-4 w-4" />
                      {beraterInfo.telefon}
                    </a>
                  )}
                  {(beraterInfo?.email) && (
                    <a href={`mailto:${beraterInfo.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Mail className="h-4 w-4" />
                      {beraterInfo.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* ─── Investment Tabs ─── */}
        {investments.length > 0 && (
          <>
            <div className="flex gap-2 flex-wrap">
              {investments.map((inv, idx) => (
                <Button
                  key={inv.id}
                  size="sm"
                  variant={activeInvIdx === idx ? "default" : "outline"}
                  onClick={() => setActiveInvIdx(idx)}
                >
                  <Building2 className="h-3 w-3 mr-1.5" />
                  Investment {inv.nummer}
                  {inv.objektTitel && <span className="ml-1 text-[10px] opacity-70">({inv.objektTitel}{inv.weNr ? ` WE ${inv.weNr}` : ""})</span>}
                </Button>
              ))}
            </div>

            {activeInv && <InvestmentView inv={activeInv} kunde={kunde} />}
          </>
        )}

        {investments.length === 0 && (
          <Card className="p-8 text-center">
            <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-bold text-lg mb-1">Noch kein Investment</h3>
            <p className="text-sm text-muted-foreground">Dein Vertriebspartner wird dich kontaktieren, sobald ein Investment angelegt wird.</p>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-x-4 pb-8 pt-4">
          <span className="hover:underline cursor-pointer">Impressum</span>
          <span className="hover:underline cursor-pointer">Datenschutz</span>
          <span>© {new Date().getFullYear()} OS Immobilien Holding GmbH</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Bonitätsunterlagen Component (Customer-facing upload)
// ──────────────────────────────────────────────────────
const SCHUFA_ORDER_URL = "https://selbstauskunft.de/?gad_source=1&gad_campaignid=20743780254&gbraid=0AAAAAoXCn_3L9WlSJw_scB80MzrP4nMaR&gclid=CjwKCAjwpcTNBhA5EiwAdO1S9jyb7ZawK2jbkX-3Nw7vae0CReo9jDASw4nYOgBGDYuuznEPD3T-XRoCCKkQAvD_BwE#form";

type DocStatus = "none" | "uploaded" | "approved" | "rejected";

function DocRowKunde({ doc, status, onUpload, disabled }: {
  doc: { name: string; required: boolean };
  status: DocStatus;
  onUpload: () => void;
  disabled?: boolean;
}) {
  const dotColor = status === "approved" ? "bg-[hsl(var(--success))]" : status === "uploaded" ? "bg-[hsl(var(--warning))]" : status === "rejected" ? "bg-destructive" : "bg-destructive";
  const labelColor = status === "approved" ? "text-[hsl(var(--success))]" : status === "uploaded" ? "text-[hsl(var(--warning))]" : status === "rejected" ? "text-destructive" : "text-destructive";
  const label = status === "approved" ? "Freigegeben" : status === "uploaded" ? "Hochgeladen" : status === "rejected" ? "Abgelehnt" : "Fehlt";
  const rejectReason = (doc as any).rejectReason;

  return (
    <div className={`border-b pb-3 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-2">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{doc.name}{doc.required && <span className="text-destructive ml-0.5">*</span>}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${labelColor} bg-muted/50`}>{label}</span>
          </div>
          <div className="flex gap-2 mt-1.5">
            {status === "none" && !disabled && (
              <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onUpload}>
                <Upload className="h-3 w-3" /> Hochladen
              </button>
            )}
            {status === "uploaded" && <span className="text-xs text-muted-foreground">Wird vom Backoffice geprüft</span>}
            {status === "approved" && <span className="text-xs text-[hsl(var(--success))]">✓ Geprüft</span>}
            {status === "rejected" && (
              <div className="space-y-1">
                <span className="text-xs text-destructive">✗ Grund: {rejectReason || "Nicht akzeptiert"}</span>
                <button className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1" onClick={onUpload}>
                  <Upload className="h-3 w-3" /> Erneut hochladen
                </button>
              </div>
            )}
            {disabled && status === "none" && (
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Lock className="h-3 w-3" /> Wird von deinem Vertriebspartner freigeschaltet</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BonitaetsUnterlagenKunde({ inv, kunde, forceUpdate }: { inv: Investment; kunde: ReturnType<typeof getKontaktById> & {}; forceUpdate: (fn: (n: number) => number) => void }) {
  /*
   * Dieselbe Liste wie auf /kunde/investments und im CRM (Entscheidung
   * Christian, 25.09.2026: eine Liste im Portal). Vorher stand hier eine
   * eigene, kürzere Fassung ohne Konto- und Vermögensnachweise, ohne
   * Kontoauszüge und mit einer anderen Freischaltregel.
   *
   * Welche Unterlagen verlangt werden, hängt ausschließlich an der
   * Selbstauskunft DIESES Investments (Regel in saQuelle.ts). Ohne sie steht
   * die Bankprüfung noch nicht fest, dann bleiben nur die Grundunterlagen und
   * die vom Vertriebspartner von Hand ergänzten, daneben steht ein Hinweis.
   */
  const invRow = (cacheGet("investments") as any[]).find((r: any) => r.id === inv.id) || null;
  const kontaktMeta = ((cacheGet("kontakte") as any[]).find((k: any) => k.id === kunde.id)?.meta || {}) as Record<string, any>;
  const bankListen = portalBankListen(invRow, kontaktMeta);
  // Alt-Uploads unter früheren Portal-Schlüsseln zählen für die neuen Zeilen.
  const docStatuses = applyLegacyDocKeys(
    getInvestmentDocStatuses(inv.id),
    [...bankListen.p1, ...bankListen.p2].map((d) => d.name),
  );
  const portalListe = portalUnterlagenListe({ investmentRow: invRow, kontaktMeta, docStatuses, bankListen });
  const unterlagenFreigeschaltet = portalListe.freigeschaltet;
  const unterlagenGesendet = getUnterlagenGesendet(kunde.id, inv.id);
  const hasP2 = !!kunde.person2;
  const [scanPerson, setScanPerson] = useState<number | null>(null);
  // Vermerk „Kunde finanziert selbst“: nichts anfordern, Liste eingeklappt,
  // Hochladen nach dem Aufklappen freiwillig. Gleiche Texte wie /kunde/investments.
  const unterlagenEntfallen = selbstauskunftEntfaellt(inv.id);
  const [freiwilligOffen, setFreiwilligOffen] = useState(false);

  const updateDoc = (docName: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.multiple = true;
    input.onchange = async (e) => {
      const filesList = (e.target as HTMLInputElement).files;
      if (!filesList || filesList.length === 0) return;
      const files = Array.from(filesList);
      const allPdf = files.every((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (!allPdf) {
        toast.error("Nur PDF-Dateien erlaubt – Bilder können nicht direkt hochgeladen werden.");
        return;
      }
      // Bei mehreren Dateien zu einer PDF mergen (Reihenfolge = Auswahl-Reihenfolge)
      let file: File | Blob = files[0];
      if (files.length > 1) {
        try {
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
          toast.success(`${files.length} PDFs zusammengeführt`);
        } catch (err: any) {
          console.error("PDF Merge Fehler:", err);
          toast.error("PDFs konnten nicht zusammengeführt werden: " + (err?.message || ""));
          return;
        }
      }
      const safeName = docName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
      const path = `${kunde.id}/${inv.id}/${safeName}_${Date.now()}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("unterlagen")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (uploadError) {
        console.error("Upload error:", uploadError);
        toast.error("Upload fehlgeschlagen: " + uploadError.message);
        return;
      }
      const { data: meta, error: registerError } = await supabase.rpc("register_unterlage_upload", {
        _investment_id: inv.id,
        _doc_name: docName,
        _file_url: path,
      });

      if (registerError) {
        console.error("register_unterlage_upload error:", registerError);
        toast.error("Speichern fehlgeschlagen: " + registerError.message);
        return;
      }

      const nextInvestments = cacheGet("investments").map((row: any) =>
        row.id === inv.id ? { ...row, meta } : row
      );
      cacheSet("investments", nextInvestments);
      toast.success("Dokument hochgeladen ✓");
      forceUpdate(n => n + 1);
    };
    input.click();
  };

  // Übernimmt Mobile-Scan-Uploads in das bestehende System
  const handleMobileScanUpload = async (upload: { docTyp: string; fileUrl: string; pages: number }) => {
    try {
      const { data: meta, error } = await supabase.rpc("register_unterlage_upload", {
        _investment_id: inv.id,
        _doc_name: upload.docTyp,
        _file_url: upload.fileUrl,
      });
      if (error) {
        console.error("Mobile upload register error:", error);
        toast.error("Mobile-Upload konnte nicht übernommen werden: " + error.message);
        return;
      }
      const nextInvestments = cacheGet("investments").map((row: any) =>
        row.id === inv.id ? { ...row, meta } : row
      );
      cacheSet("investments", nextInvestments);
      forceUpdate(n => n + 1);
    } catch (e: any) {
      console.error(e);
    }
  };

  const handleSenden = () => {
    setUnterlagenGesendet(kunde.id, inv.id);
    // Create notification for backoffice
    // Geht an den Berater. Vorher landete die Aufgabe in der Inbox des
    // Kunden, obwohl der Text sich eindeutig an den Berater richtet.
    void addAufgabe({
      kontaktId: kunde.id,
      typ: "aufgabe",
      prioritaet: "hoch",
      titel: `Bonitätsunterlagen prüfen: ${kunde.vorname} ${kunde.nachname}`,
      beschreibung: `${kunde.vorname} ${kunde.nachname} hat die Bonitätsunterlagen über das Kundenportal eingereicht. Bitte prüfen und freigeben.`,
      faelligAm: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      uhrzeit: "09:00",
      zugewiesenAn: (kunde as any).zustaendig_id || undefined,
      erstelltVonName: `${kunde.vorname} ${kunde.nachname}`,
      ausloeserSchluessel: `portal:bonitaet:${kunde.id}:${inv.id}`,
    });
    forceUpdate(n => n + 1);
  };

  const listeOffen = portalListe.listeOffen;
  const pflichtP1 = portalListe.p1.pflicht;
  const pflichtP2 = portalListe.p2.pflicht;
  // Gehaltsnachweise und Bankprüfung, samt von Hand ergänzten Unterlagen und Altzeilen.
  const additionalP1 = portalListe.p1.weitere;
  const additionalP2 = portalListe.p2.weitere;
  const allP1Docs = portalListe.p1.alle;
  const allP2Docs = portalListe.p2.alle;
  const activeP1Docs = portalListe.p1.aktiv;
  const activeP2Docs = portalListe.p2.aktiv;

  // Check if ALL active required docs are uploaded/approved for both persons
  const p1AllDone = activeP1Docs.filter(d => d.required).every(d => {
    const st = docStatuses[d.name] || "none";
    return st === "uploaded" || st === "approved";
  });
  const p2AllDone = hasP2 ? activeP2Docs.filter(d => d.required).every(d => {
    const st = docStatuses[d.name] || "none";
    return st === "uploaded" || st === "approved";
  }) : true;

  const canSend = p1AllDone && p2AllDone;

  // Progress counts for Ampelsystem
  const p1Total = activeP1Docs.filter(d => d.required).length;
  const p1Done = activeP1Docs.filter(d => d.required).filter(d => { const st = docStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length;
  const p2Total = hasP2 ? activeP2Docs.filter(d => d.required).length : 0;
  const p2Done = hasP2 ? activeP2Docs.filter(d => d.required).filter(d => { const st = docStatuses[d.name] || "none"; return st === "uploaded" || st === "approved"; }).length : 0;
  const totalProgress = p1Total + p2Total > 0 ? Math.round(((p1Done + p2Done) / (p1Total + p2Total)) * 100) : 0;

  return (
    <Card className="p-6">
      <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        Bonitätsunterlagen
      </h2>
      {unterlagenEntfallen && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm font-medium">{i18n.t("portal.investments.bon.entfaellt_title")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{i18n.t("portal.investments.bon.entfaellt_text")}</p>
          <button
            type="button"
            onClick={() => setFreiwilligOffen((offen) => !offen)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/60"
            aria-expanded={freiwilligOffen}
          >
            {freiwilligOffen
              ? <><ChevronUp className="h-3.5 w-3.5" /> {i18n.t("portal.investments.bon.entfaellt_einklappen")}</>
              : <><ChevronDown className="h-3.5 w-3.5" /> {i18n.t("portal.investments.bon.entfaellt_anzeigen")}</>}
          </button>
        </div>
      )}
      <div hidden={unterlagenEntfallen && !freiwilligOffen}>
      {!unterlagenEntfallen && (
        <p className="text-xs text-muted-foreground mb-4">
          Bitte lade die folgenden Pflichtdokumente hoch. Nach dem Hochladen klickst du auf „Unterlagen senden", um dein Backoffice zur Prüfung zu benachrichtigen.
        </p>
      )}
      {/* Ohne eigene Selbstauskunft steht die vollständige Liste noch nicht
          fest. Statt der Liste eines anderen Kaufs steht hier, warum. */}
      {listeOffen && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 mb-4">
          <p className="text-xs text-muted-foreground">
            <AlertCircle className="h-3 w-3 inline mr-1 text-primary" />
            Welche weiteren Nachweise deine Bank für diesen Kauf braucht, ergibt sich aus deiner
            Selbstauskunft. Sobald sie für dieses Investment ausgefüllt ist, erscheint hier die
            vollständige Liste. Die Unterlagen unten kannst du schon jetzt hochladen.
          </p>
        </div>
      )}

      {/* ── Person 1 ── */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="font-semibold text-sm text-primary">Person 1: {kunde.vorname} {kunde.nachname}</h3>
        <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setScanPerson(1)}>
          <Smartphone className="h-3.5 w-3.5" /> Mit Handy scannen
        </Button>
      </div>

      {/* Selbstauskunft als erstes Dokument */}
      {(() => {
        const saDataExists = !!getSaData(inv.id);
        const saSigned = getSaSigned(inv.id);
        const saStatus: DocStatus = (saDataExists || saSigned) ? "approved" : "none";
        return (
          <div className="space-y-3 mb-4">
            <div className="border-b pb-3">
              <div className="flex items-start gap-2">
                <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${saStatus === "approved" ? "bg-[hsl(var(--success))]" : "bg-destructive"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Selbstauskunft<span className="text-destructive ml-0.5">*</span></span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded bg-muted/50 ${saStatus === "approved" ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                      {saStatus === "approved" ? "Freigegeben" : "Fehlt"}
                    </span>
                  </div>
                  {saStatus === "approved" ? (
                    <div className="flex gap-2 mt-1.5">
                      <span className="text-xs text-[hsl(var(--success))]">✓ Geprüft</span>
                      <button
                        className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1"
                        onClick={async () => {
                          const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
                          const saData = invRow?.meta?.saData;
                          if (saData) {
                            try {
                              const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
                              const pdf = await generateSelbstauskunftPDF(saData, { vorname: kunde.vorname, nachname: kunde.nachname, moreId: String((kunde as any).moreId || "") }, invRow?.meta?.saSignatures, { sprache: kundenSprache(kunde.id) });
                              pdf.save(`Selbstauskunft_${kunde.vorname}_${kunde.nachname}.pdf`);
                            } catch (err) {
                              console.error("SA PDF error:", err);
                              toast.error("PDF konnte nicht erstellt werden.");
                            }
                          } else {
                            toast.error("PDF-Daten nicht verfügbar");
                          }
                        }}
                      >
                        <Download className="h-3 w-3" /> PDF herunterladen
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground mt-1.5 block">Wird vom Vertriebspartner ausgefüllt</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Initial Pflichtdokumente */}
      <div className="space-y-3 mb-4">
        {pflichtP1.map(doc => (
          <DocRowKunde key={doc.name} doc={doc} status={docStatuses[doc.name] || "none"} onUpload={() => updateDoc(doc.name)} />
        ))}
      </div>

      {/* Schufa with special hint */}
      <div className="space-y-3 mb-4">
        <DocRowKunde doc={SCHUFA_DOC} status={docStatuses[SCHUFA_DOC.name] || "none"} onUpload={() => updateDoc(SCHUFA_DOC.name)} />
        {(docStatuses[SCHUFA_DOC.name] || "none") === "none" && (
          <div className="ml-5 bg-primary/5 border border-primary/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-2">
              <AlertCircle className="h-3 w-3 inline mr-1 text-primary" />
              Deine Schufa-Bonitätsauskunft liegt der ausgefüllten Selbstauskunft bereits bei. Falls du noch keine Schufa-Auskunft besitzt, kannst du sie hier bestellen:
            </p>
            <a href={SCHUFA_ORDER_URL} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="text-xs gap-1.5">
                <ExternalLink className="h-3 w-3" /> Schufa-Auskunft bestellen
              </Button>
            </a>
          </div>
        )}
      </div>

      {/* Additional docs – shown grayed out if not unlocked */}
      <div className="space-y-3 mb-6">
        {additionalP1.map(doc => (
          <DocRowKunde
            key={doc.name}
            doc={doc}
            status={docStatuses[doc.name] || "none"}
            onUpload={() => updateDoc(doc.name)}
            disabled={!unterlagenFreigeschaltet}
          />
        ))}
      </div>

      {/* ── Person 2 ── */}
      {hasP2 && kunde.person2 && (
        <>
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-semibold text-sm text-primary">Person 2: {kunde.person2.vorname} {kunde.person2.nachname}</h3>
              <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={() => setScanPerson(2)}>
                <Smartphone className="h-3.5 w-3.5" /> Mit Handy scannen
              </Button>
            </div>
            <div className="space-y-3 mb-4">
              {pflichtP2.map(doc => (
                <DocRowKunde key={doc.name} doc={doc} status={docStatuses[doc.name] || "none"} onUpload={() => updateDoc(doc.name)} />
              ))}
            </div>
            <div className="space-y-3 mb-4">
              <DocRowKunde doc={SCHUFA_DOC_P2} status={docStatuses[SCHUFA_DOC_P2.name] || "none"} onUpload={() => updateDoc(SCHUFA_DOC_P2.name)} />
              {(docStatuses[SCHUFA_DOC_P2.name] || "none") === "none" && (
                <div className="ml-5 bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    <AlertCircle className="h-3 w-3 inline mr-1 text-primary" />
                    Die Schufa-Auskunft für Person 2 kann ebenfalls hier bestellt werden:
                  </p>
                  <a href={SCHUFA_ORDER_URL} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="text-xs gap-1.5">
                      <ExternalLink className="h-3 w-3" /> Schufa-Auskunft bestellen
                    </Button>
                  </a>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {additionalP2.map(doc => (
                <DocRowKunde
                  key={doc.name}
                  doc={doc}
                  status={docStatuses[doc.name] || "none"}
                  onUpload={() => updateDoc(doc.name)}
                  disabled={!unterlagenFreigeschaltet}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Progress Ampelsystem */}
      <div className="mt-6 pt-4 border-t space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold">Fortschritt:</span>
          <div className="flex gap-0.5 flex-1">
            {[...activeP1Docs.filter(d => d.required), ...(hasP2 ? activeP2Docs.filter(d => d.required) : [])].map((doc, i) => {
              const st = docStatuses[doc.name] || "none";
              const barColor = st === "approved" ? "bg-[hsl(var(--success))]" : st === "uploaded" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
              return <div key={i} className={`h-2.5 flex-1 rounded-sm ${barColor}`} />;
            })}
          </div>
          <div className={`w-3 h-3 rounded-full shrink-0 ${
            totalProgress === 100 ? "bg-[hsl(var(--success))]" : totalProgress >= 50 ? "bg-[hsl(var(--warning))]" : totalProgress > 0 ? "bg-destructive" : "bg-muted"
          }`} />
          <span className="text-xs text-muted-foreground">{p1Done + p2Done}/{p1Total + p2Total}</span>
        </div>

        {unterlagenGesendet ? (
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
            <CheckCircle2 className="h-4 w-4" />
            Unterlagen wurden zur Prüfung eingesendet, dein Backoffice prüft die Dokumente.
          </div>
        ) : canSend ? (
          <Button className="w-full gap-1.5" onClick={handleSenden}>
            <Send className="h-3 w-3" /> Unterlagen zur Prüfung einsenden
          </Button>
        ) : (
          <div>
            <Button className="w-full gap-1.5" disabled>
              <Send className="h-3 w-3" /> Unterlagen zur Prüfung einsenden
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Bitte lade alle Pflichtdokumente{hasP2 ? " für beide Personen" : ""} hoch, um die Unterlagen einsenden zu können.</p>
          </div>
        )}
      </div>
      </div>

      {scanPerson !== null && (
        <MobileScanQRDialog
          open={scanPerson !== null}
          onOpenChange={(o) => { if (!o) setScanPerson(null); }}
          kontaktId={kunde.id}
          investmentId={inv.id}
          person={scanPerson}
          block="bonitaet"
          docList={(scanPerson === 2 ? allP2Docs : allP1Docs).map(d => d.name)}
          onUpload={handleMobileScanUpload}
        />
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────────────
// Investment View Component
// ──────────────────────────────────────────────────────
function InvestmentView({ inv, kunde }: { inv: Investment; kunde: ReturnType<typeof getKontaktById> & {} }) {
  const { user } = useUser();
  const [, forceUpdate] = useState(0);
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empTelefon, setEmpTelefon] = useState("");
  const [empBeziehung, setEmpBeziehung] = useState("");
  const [empAnmerkungen, setEmpAnmerkungen] = useState("");
  const [empSuccess, setEmpSuccess] = useState(false);
  /*
   * Hier stand ein Knopf, mit dem Admins, Inhaber und Vertriebsleiter die
   * Pipelinestufe von Hand verstellen konnten.
   *
   * Diese Seite ist das Kundenportal, die Kopfzeile sagt es auch. Ein Knopf,
   * der ohne weitere Angaben die Pipeline verstellt, gehoert dort nicht hin.
   * Die Stufe wird in der Pipeline oder in der Kundenakte gesetzt, und dort
   * wird ab der Reservierung nach Objektadresse, Einheit und Kaufpreis gefragt.
   * Ueber diese Seite liess sich genau das umgehen.
   */
  const currentPipelineStufe = inv.pipelineStufe || "erstgespraech_geplant";
  const stepIdx = Math.min(getStepIndex(currentPipelineStufe, kunde?.id), PIPELINE_STEPS.length - 1);
  const saPdf = getInvestmentSaPdf(inv.id);
  const docStatuses = getInvestmentDocStatuses(inv.id);
  const saApproved = docStatuses["Selbstauskunft"] === "approved" || docStatuses["Selbstauskunft"] === "uploaded";
  const saDataExists = !!getSaData(inv.id);
  const saSigned = getSaSigned(inv.id);
  const hasSa = !!saPdf || saApproved || saDataExists || saSigned;
  const rvPdf = getInvestmentRvPdf(inv.id);
  const notarData = getInvestmentNotarData(inv.id);
  const kundenDocs = getDocsByInvestment(inv.id);

  // Find the wohnung/objekt
  const allObjekte = getObjekte().filter(o => o.sichtbar);
  let wohnung = inv.wohnungId ? allObjekte.flatMap(o => o.wohnungen).find(w => w.id === inv.wohnungId) : null;
  let objekt = wohnung ? allObjekte.find(o => o.wohnungen.some(w => w.id === inv.wohnungId)) : null;

    // Determine the current card to highlight for "go to current step"
    const currentCardKey = (() => {
      if (currentPipelineStufe === "notar") {
        const gs = kunde?.id ? isGrundschuldUploaded(kunde.id) : false;
        return gs ? "notar_mit_gs" : "notar_ohne_gs";
      }
      return currentPipelineStufe;
    })();
    const currentCardId = PORTAL_STEP_TO_CARD[currentCardKey];

    const scrollToCard = (cardId: string) => {
      const el = document.getElementById(`${cardId}-${inv.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-[hsl(var(--warning))]");
        setTimeout(() => el.classList.remove("ring-2", "ring-[hsl(var(--warning))]"), 4000);
      }
    };

  return (
    <div className="space-y-6">
      {/* Status Pipeline */}
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Status – {inv.label}
        </h2>
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {PIPELINE_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === stepIdx;
            const isDone = i < stepIdx;
            const cardId = PORTAL_STEP_TO_CARD[s.key];
            const canScrollTo = !!cardId && (isDone || isActive);
            return (
              <div key={s.key} className="flex items-center gap-1">
                <Badge
                  variant="outline"
                  className={`text-xs px-2 py-1 flex items-center gap-1 ${
                    isActive ? "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))] border-[hsl(var(--warning))] ring-2 ring-[hsl(var(--warning))]/30"
                    : isDone ? "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/40"
                    : "bg-muted text-muted-foreground border-border"
                  } ${canScrollTo ? "cursor-pointer hover:ring-2 hover:ring-[hsl(var(--warning))]/60 transition-all" : ""}`}
                  onClick={() => {
                    if (canScrollTo && cardId) scrollToCard(cardId);
                  }}
                >
                  {isDone && <CheckCircle2 className="h-3 w-3" />}
                  {isActive && <Icon className="h-3 w-3" />}
                  {s.label}
                </Badge>
                {i < PIPELINE_STEPS.length - 1 && <span className={isDone ? "text-[hsl(var(--success))]" : isActive ? "text-[hsl(var(--warning))]" : "text-muted-foreground"}>→</span>}
              </div>
            );
          })}
        </div>
        <Progress value={(stepIdx / (PIPELINE_STEPS.length - 1)) * 100} className="h-2" />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-muted-foreground">Aktueller Schritt: <strong>{PIPELINE_STEPS[stepIdx].label}</strong></p>
          {currentCardId && (
            <Button size="sm" variant="outline" className="text-xs h-6 gap-1 border-[hsl(var(--warning))]/40 text-[hsl(var(--warning))]" onClick={() => scrollToCard(currentCardId)}>
              <AlertCircle className="h-3 w-3" /> Zum aktuellen Schritt
            </Button>
          )}
        </div>
      </Card>

      {/* Selbstauskunft */}
      {stepIdx >= 1 && hasSa && (
        <Card id={`portal-card-sa-${inv.id}`} className="p-6 transition-all duration-500">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Selbstauskunft
          </h2>
          <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
            <div className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] font-bold text-xs px-2 py-1 rounded">PDF</div>
            <div className="min-w-0 flex-1 basis-48 break-words">
              <p className="text-sm font-semibold">Selbstauskunft_{kunde.vorname}_{kunde.nachname}.pdf</p>
              <p className="text-xs text-muted-foreground">Ausgefüllte Online-Selbstauskunft</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs ml-auto shrink-0" onClick={async () => {
              try {
                const invRow = cacheGet("investments").find((r: any) => r.id === inv.id);
                const saData = invRow?.meta?.saData;
                if (saData) {
                  const { generateSelbstauskunftPDF } = await import("@/lib/selbstauskunftPdf");
                  const pdf = await generateSelbstauskunftPDF(saData, { vorname: kunde.vorname, nachname: kunde.nachname, moreId: String(kunde.moreId || "") }, invRow?.meta?.saSignatures, { sprache: kundenSprache(kunde.id) });
                  pdf.save(`Selbstauskunft_${kunde.vorname}_${kunde.nachname}.pdf`);
                } else {
                  toast.error("PDF-Daten nicht verfügbar");
                }
              } catch (err) {
                console.error("PDF download error:", err);
                toast.error("PDF konnte nicht generiert werden");
              }
            }}><Download className="h-3 w-3 mr-1" /> Herunterladen</Button>
          </div>
        </Card>
      )}

      {/* ── Bonitätsunterlagen (Customer Upload) ── */}
      {stepIdx >= 1 && (
        <div id={`portal-card-bonitaet-${inv.id}`} className="transition-all duration-500">
          <BonitaetsUnterlagenKunde inv={inv} kunde={kunde} forceUpdate={forceUpdate} />
        </div>
      )}

      {/* Wohnungsprofil */}
      {stepIdx >= 2 && wohnung && objekt && (
        <Card id={`portal-card-wohnung-${inv.id}`} className="p-6 transition-all duration-500">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Home className="h-5 w-5 text-primary" />
            Dein Wohnungsprofil
          </h2>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground text-xs">Objekt</span><p className="font-medium">{objekt.titel}</p></div>
            <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground text-xs">Adresse</span><p className="font-medium">{objekt.adresse}, {objekt.plz} {objekt.ort}</p></div>
            <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground text-xs">Wohneinheit</span><p className="font-medium">WE {wohnung.weNr} · {wohnung.zimmer} Zi. · {wohnung.groesse} m²</p></div>
            <div className="bg-muted/50 rounded-lg p-3"><span className="text-muted-foreground text-xs">Kaufpreis</span><p className="font-medium">{new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(wohnung.vkGesamt)}</p></div>
          </div>
          {/* Wohnungsunterlagen */}
          {wohnung.dokumente && wohnung.dokumente.length > 0 && (
            <>
              <h3 className="font-semibold text-sm mb-2">Wohnungsunterlagen</h3>
              <div className="space-y-2">
                {wohnung.dokumente.map(doc => (
                  <div key={doc.id} className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                    <div className="bg-primary/10 text-primary font-bold text-xs px-2 py-1 rounded">PDF</div>
                    <div className="min-w-0 flex-1 basis-48 break-words"><p className="text-sm font-semibold">{doc.name}</p></div>
                    <Button size="sm" variant="outline" className="text-xs ml-auto shrink-0"><Download className="h-3 w-3 mr-1" /> Herunterladen</Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {/* Reservierungsvereinbarung */}
      {stepIdx >= 3 && rvPdf && (
        <Card id={`portal-card-reservierung-${inv.id}`} className="p-6 transition-all duration-500">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Reservierungsvereinbarung
          </h2>
          <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
            <div className="bg-destructive/10 text-destructive font-bold text-xs px-2 py-1 rounded">PDF</div>
            <div className="min-w-0 flex-1 basis-48 break-words">
              <p className="text-sm font-semibold">{`Reservierung (${kunde?.vorname || ""} ${kunde?.nachname || ""})`}</p>
              <p className="text-xs text-muted-foreground">Unterschriebene Reservierungsvereinbarung</p>
            </div>
            <Button size="sm" variant="outline" className="text-xs ml-auto shrink-0"><Download className="h-3 w-3 mr-1" /> Herunterladen</Button>
          </div>
        </Card>
      )}

      {/* Finanzierung */}
      {stepIdx >= 4 && (() => {
        const finRows = cacheGet("finanzierungen").filter((r: any) => r.kunde_id === inv.id || r.kunde_id === kunde.id);
        const RELEVANT_DOCS = ["Finanzierungsangebot", "Grundschuld", "Darlehensvertrag"];
        const freeDocs: { name: string; fileUrl?: string; angebotId: string; docId: string; rootId: string }[] = [];
        for (const fin of finRows) {
          for (const angebot of (fin.angebote || [])) {
            for (const doc of (angebot.dokumente || [])) {
              if (RELEVANT_DOCS.includes(doc.name) && doc.status === "signed" && !freeDocs.find(d => d.name === doc.name)) {
                freeDocs.push({ name: doc.name, fileUrl: doc.fileUrl, angebotId: angebot.id, docId: doc.id, rootId: fin.kunde_id });
              }
            }
          }
        }
        const handleDocDownload = async (doc: typeof freeDocs[0]) => {
          if (doc.fileUrl) { await openUnterlage(doc.fileUrl); return; }
          try {
            const { data: files } = await supabase.storage.from("unterlagen").list(`finanzierung/${doc.rootId}/${doc.angebotId}`);
            const match = files?.find(f => f.name.startsWith(`${doc.docId}_`));
            if (match) {
              await openUnterlage(`finanzierung/${doc.rootId}/${doc.angebotId}/${match.name}`);
            }
          } catch {}
        };
        const eigenFin = getEigenfinanzierung(inv.id);
        const handleKundenUpload = async (file: File, slot: "fa" | "dv") => {
          try {
            const ext = file.name.split(".").pop() || "pdf";
            const slotKey = slot === "dv" ? "kundeDV" : "kundeFA";
            const path = `finanzierung/eigen/${kunde.id}/${inv.id}/${slotKey}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from("unterlagen").upload(path, file, { upsert: true });
            if (error) throw error;
            const angebot: EigenfinanzierungAngebot = {
              fileName: file.name,
              storagePath: path,
              uploadedAt: new Date().toISOString(),
              uploadedByName: `${kunde.vorname} ${kunde.nachname}`,
              uploadedByRole: "kunde",
            };
            /*
             * Geschrieben wird ueber die eigene Datenbankfunktion, nicht ueber
             * den allgemeinen Meta-Weg: Der verwirft fuer einen Kunden alles
             * ausser zwei Schluesseln, und zwar ohne Fehlermeldung. Details im
             * Kopf von `eigenfinanzierungStore.ts`.
             */
            const ergebnis = slot === "dv"
              ? await speichereKundenDarlehensvertrag(inv.id, angebot)
              : await speichereKundenAngebot(inv.id, angebot);
            if (!ergebnis.ok) {
              toast.error(ergebnis.fehler || "Die Unterlage konnte nicht gespeichert werden.");
              return;
            }
            const label = slot === "dv" ? "Darlehensvertrag" : "Finanzierungsangebot";
            notifyByRole(["finanzierungspartner", "admin", "inhaber"], {
              titel: `Kunden-${label} eingegangen`,
              nachricht: `${kunde.vorname} ${kunde.nachname} hat ${label} hochgeladen.`,
              link: `/kunden/${kunde.id}?tab=finanzierungen`,
            });
            const beraterId = (cacheGet("kontakte").find((k: any) => k.id === kunde.id) as any)?.zustaendig_id;
            if (beraterId) {
              notifyUser(beraterId, {
                titel: `Eigenfinanzierung: ${label} eingegangen`,
                nachricht: `${kunde.vorname} ${kunde.nachname} hat ${label} hochgeladen. Bitte prüfen.`,
                link: `/kunden/${kunde.id}?tab=finanzierungen`,
              });
            }
            toast.success("Hochgeladen ✓");
          } catch (e: any) {
            toast.error("Upload fehlgeschlagen: " + (e?.message || ""));
          }
        };
        const eigenFinVertraege = alleKundenDarlehensvertraege(eigenFin);
        const handleVertragLoeschen = async (ang: EigenfinanzierungAngebot) => {
          const ok = await confirmDialog({
            title: "Darlehensvertrag löschen?",
            description: `„${ang.fileName}" wird aus deinen Unterlagen entfernt. Deine übrigen Darlehensverträge bleiben erhalten.`,
            confirmText: "Löschen",
            cancelText: "Behalten",
            variant: "destructive",
          });
          if (!ok) return;
          const geloescht = await loescheKundenDarlehensvertrag(inv.id, ang.storagePath);
          if (!geloescht.ok) {
            toast.error(geloescht.fehler || "Der Darlehensvertrag konnte nicht entfernt werden.");
            return;
          }
          /*
           * Die Datei im Speicher wird nachrangig entfernt. Ein Kunde darf im
           * Bucket „unterlagen" nur seine externen Investments löschen, für ihn
           * schlägt das fehl. Sichtbar ist die Datei dann trotzdem nirgends
           * mehr, und ein Fehler hier darf die Löschung nicht kippen.
           */
          try {
            await supabase.storage.from("unterlagen").remove([ang.storagePath]);
          } catch (e) { console.warn("Datei im Speicher nicht entfernt", e); }
          toast.success("Darlehensvertrag entfernt");
        };
        return (
          <Card id={`portal-card-finanzierung-${inv.id}`} className="p-6 transition-all duration-500">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" />
              Finanzierung
            </h2>
            {eigenFin.aktiv && (
              <div className="mb-4 border border-primary/30 bg-primary/5 rounded-lg p-4">
                <p className="text-sm font-semibold mb-1">Eigenfinanzierung – deine Unterlagen</p>
                <p className="text-xs text-muted-foreground mb-3">Du finanzierst über deine eigene Bank. Bitte lade hier dein Finanzierungsangebot (Bankzusage) und deinen unterschriebenen Darlehensvertrag hoch. Hast du mehrere Darlehensverträge, kannst du weitere hinzufügen.</p>
                {/* Finanzierungsangebot: genau eines, am Ende gibt es nur eine Bankzusage. */}
                <div className="mb-2 bg-background rounded p-2">
                  <p className="text-xs font-semibold mb-1">Finanzierungsangebot (Bankzusage)</p>
                  {eigenFin.kundenAngebot ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                      <div className="flex-1 text-xs min-w-0">
                        <p className="font-medium">{eigenFin.kundenAngebot.fileName}</p>
                        <p className="text-muted-foreground">Hochgeladen am {new Date(eigenFin.kundenAngebot.uploadedAt).toLocaleDateString("de-DE")}</p>
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 border rounded hover:bg-muted">
                      <Upload className="h-3 w-3" /> Finanzierungsangebot hochladen
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleKundenUpload(f, "fa"); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
                {/* Darlehensverträge: mehrere möglich, Altbestand über den Store eingeschlossen. */}
                <div className="mb-2 bg-background rounded p-2">
                  <p className="text-xs font-semibold mb-1">Darlehensvertrag (unterschrieben)</p>
                  {eigenFinVertraege.length > 0 && (
                    <div className="space-y-2 mb-2">
                      {eigenFinVertraege.map((ang) => (
                        <div key={ang.storagePath} className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))] shrink-0" />
                          <div className="flex-1 text-xs min-w-0">
                            <p className="font-medium">{ang.fileName}</p>
                            <p className="text-muted-foreground">Hochgeladen am {new Date(ang.uploadedAt).toLocaleDateString("de-DE")}</p>
                          </div>
                          {eigenFin.vpBestaetigt && <Badge className="bg-[hsl(var(--success))] text-white text-[10px] shrink-0">Bestätigt</Badge>}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-muted-foreground hover:text-destructive shrink-0"
                            aria-label={`${ang.fileName} löschen`}
                            onClick={() => handleVertragLoeschen(ang)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs px-3 py-1.5 border rounded hover:bg-muted">
                    {eigenFinVertraege.length > 0 ? <Plus className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                    {eigenFinVertraege.length > 0 ? "Weiteren Darlehensvertrag hinzufügen" : "Darlehensvertrag hochladen"}
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleKundenUpload(f, "dv"); e.target.value = ""; }} />
                  </label>
                </div>
                {(eigenFin.gegenAngebot || eigenFin.gegenDarlehensvertrag) && (
                  <div className="mt-3 border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold">Gegenangebot von osimmobilien.netlify.app</p>
                    {eigenFin.gegenAngebot && (
                      <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 w-full justify-start" onClick={() => openUnterlage(eigenFin.gegenAngebot!.storagePath)}>
                        <Download className="h-3 w-3" /> Finanzierungsangebot: {eigenFin.gegenAngebot.fileName}
                      </Button>
                    )}
                    {eigenFin.gegenDarlehensvertrag && (
                      <Button size="sm" variant="outline" className="text-xs gap-1.5 h-8 w-full justify-start" onClick={() => openUnterlage(eigenFin.gegenDarlehensvertrag!.storagePath)}>
                        <Download className="h-3 w-3" /> Darlehensvertrag: {eigenFin.gegenDarlehensvertrag.fileName}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            {inv.finanzierungsStatus === "bestaetigt" ? (
              <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                <div className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] font-bold text-xs px-2 py-1 rounded">✓</div>
                <div className="min-w-0 flex-1 basis-48 break-words">
                  <p className="text-sm font-semibold">Finanzierung bestätigt</p>
                  <p className="text-xs text-muted-foreground">Die Finanzierung wurde von der Bank bestätigt.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                <div className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--warning))] shrink-0" />
                <p className="text-sm text-muted-foreground">Die Finanzierung wird aktuell bearbeitet.</p>
              </div>
            )}
            {freeDocs.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Finanzierungsdokumente zum Download</p>
                <div className="space-y-1.5">
                  {freeDocs.map(doc => (
                    <Button key={doc.name} size="sm" variant="outline" className="text-xs gap-1.5 w-full justify-start h-8" onClick={() => handleDocDownload(doc)}>
                      <Download className="h-3 w-3" /> {doc.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })()}

      {/* Notardaten – nur sichtbar wenn im Portal freigegeben */}
      {stepIdx >= 5 && getNotarTerminPortalFreigabe(inv.id) && (
        <Card id={`portal-card-notar-${inv.id}`} className="p-6 transition-all duration-500">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-primary" />
            Notartermin
          </h2>
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="font-semibold">Datum:</span><span>{notarData.datum || inv.notarTermin || "–"}</span>
              <span className="font-semibold">Uhrzeit:</span><span>{notarData.uhrzeit || inv.notarUhrzeit || "–"}</span>
              <span className="font-semibold">Notar:</span><span>{notarData.name || inv.notarName || "–"}</span>
              <span className="font-semibold">Adresse:</span><span>{notarData.adresse || inv.notarAdresse || "–"}</span>
              <span className="font-semibold">Verkäufervertretung:</span><span>{notarData.vertretung || inv.notarVerkaeufervertretung || "–"}</span>
            </div>
          </div>
        </Card>
      )}

      {/* Abwicklungsdaten nur intern sichtbar – hier bewusst entfernt */}

      {stepIdx >= 6 && (
        <Card id={`portal-card-unterlagen-${inv.id}`} className="p-6 transition-all duration-500">
          <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Deine Unterlagen
          </h2>
          {kundenDocs.length > 0 ? (
            <div className="space-y-3">
              {kundenDocs.map(doc => (
                <div key={doc.id} className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                  <div className="bg-primary/10 text-primary font-bold text-xs px-2 py-1 rounded">PDF</div>
                  <div className="min-w-0 flex-1 basis-48 break-words">
                    <p className="text-sm font-semibold">{doc.name}</p>
                    <p className="text-[10px] text-muted-foreground">Hochgeladen von {doc.uploadedBy} am {new Date(doc.uploadedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs ml-auto shrink-0"><Download className="h-3 w-3 mr-1" /> Herunterladen</Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Noch keine Unterlagen vorhanden. Dein Vertriebspartner wird dir hier weitere Dokumente bereitstellen.</p>
          )}
        </Card>
      )}

      {/* ── Empfehlungsprogramm (Kunden-seitig) ── */}
      {stepIdx >= 5 && (() => {
        const prog = getProgrammByInvestment(inv.id);
        if (!prog?.freigeschaltet) return null;
        const empfehlungen = getEmpfehlungenByInvestment(inv.id);

        const handleSubmitEmpfehlung = async () => {
          // Alle Felder Pflicht
          if (!empName.trim() || !empTelefon.trim() || !empEmail.trim() || !empBeziehung || !empAnmerkungen.trim()) {
            toast.error("Bitte alle Pflichtfelder ausfüllen.");
            return;
          }
          // Einfache E-Mail-Plausibilität
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(empEmail.trim())) {
            toast.error("Bitte eine gültige E-Mail-Adresse angeben.");
            return;
          }

          const nameParts = empName.trim().split(" ");
          const vn = nameParts[0] || empName.trim();
          const nn = nameParts.slice(1).join(" ") || "";

          try {
            // Use server-side function to create both contact + empfehlung (bypasses RLS)
            const { data, error } = await supabase.rpc("create_empfehlung_kontakt", {
              _referrer_kontakt_id: kunde.id,
              _vorname: vn,
              _nachname: nn,
              _email: empEmail.trim(),
              _telefon: empTelefon.trim(),
              _quelle: `Empfehlung von ${kunde.vorname} ${kunde.nachname}`,
              _berater: kunde.berater || "",
              _beziehung: empBeziehung.trim(),
              _anmerkungen: empAnmerkungen.trim() || "",
              _programm_id: prog.id,
              _investment_id: inv.id,
            });
            if (error) throw error;
            const result = data as any;
            if (result?.duplicate) {
              toast.info(`Hinweis: ${result.duplicate_name || "Diese Person"} ist bereits in unserem System. Wir haben die Empfehlung trotzdem an deinen Vertriebspartner weitergegeben.`);
            }
            // Kontakte-Cache aktualisieren, damit der neue Kontakt sofort in Sidebar/Listen erscheint
            try {
              const { cacheReload } = await import("@/lib/dataCache");
              await cacheReload("kontakte");
            } catch {}
          } catch (e: any) {
            console.error("Empfehlung RPC error:", e);
            // Fallback: try local stores
            addEmpfehlung({
              programmId: prog.id,
              investmentId: inv.id,
              kontaktId: kunde.id,
              kontaktName: `${kunde.vorname} ${kunde.nachname}`,
              name: empName.trim(),
              email: empEmail.trim(),
              telefon: empTelefon.trim(),
              beziehung: empBeziehung.trim(),
              anmerkungen: empAnmerkungen.trim() || undefined,
            });
          }

          // Inbox notification for VP
          void addAufgabe({
            kontaktId: kunde.id,
            typ: "anruf",
            prioritaet: "hoch",
            titel: `Empfehlung von ${kunde.vorname} ${kunde.nachname}`,
            beschreibung: `Dein Kunde ${kunde.vorname} ${kunde.nachname} hat eine Empfehlung gesendet: ${empName.trim()} (${empTelefon.trim()}). Beziehung: ${empBeziehung.trim()}. Bitte zeitnah kontaktieren.`,
            faelligAm: new Date(Date.now() + 86400000).toISOString().split("T")[0],
            uhrzeit: "09:00",
            zugewiesenAn: (kunde as any).zustaendig_id || undefined,
            erstelltVonName: `${kunde.vorname} ${kunde.nachname}`,
          });

          setEmpName(""); setEmpEmail(""); setEmpTelefon(""); setEmpBeziehung(""); setEmpAnmerkungen("");
          setEmpSuccess(true);
          setTimeout(() => setEmpSuccess(false), 4000);
          forceUpdate(n => n + 1);
        };

        return (
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Gift className="h-5 w-5 text-primary" />
              Empfehlungsprogramm
            </h2>

            {/* Info Box */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 rounded-full p-2 shrink-0">
                  <Heart className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1">Empfiehl uns weiter!</p>
                  <p className="text-sm text-muted-foreground">{prog.provisionsText}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 bg-primary/10 text-primary rounded-full px-3 py-1">
                    <Gift className="h-3 w-3" />
                    <span className="text-xs font-bold">{prog.provisionsBetrag}{prog.provisionsTyp === "prozent" ? "%" : " €"} Tippgeberprovision</span>
                  </div>
                  {prog.bedingungen && <p className="text-[10px] text-muted-foreground mt-2">{prog.bedingungen}</p>}
                </div>
              </div>
            </div>

            {/* Empfehlung Formular */}
            <div className="border rounded-lg p-4 space-y-3 mb-6">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Neue Empfehlung senden
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium">Name *</Label>
                  <Input value={empName} onChange={e => setEmpName(e.target.value)} placeholder="Vor- und Nachname" className="h-9 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Telefon *</Label>
                  <PhoneInput value={empTelefon} onChange={v => setEmpTelefon(v)} className="h-9 mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium">E-Mail *</Label>
                  <Input value={empEmail} onChange={e => setEmpEmail(e.target.value)} placeholder="email@beispiel.de" className="h-9 text-sm mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-medium">Woher kennt ihr euch? *</Label>
                  <Select value={empBeziehung} onValueChange={setEmpBeziehung}>
                    <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Familie">Familie</SelectItem>
                      <SelectItem value="Freund/in">Freund/in</SelectItem>
                      <SelectItem value="Arbeitskollege">Arbeitskollege</SelectItem>
                      <SelectItem value="Nachbar">Nachbar</SelectItem>
                      <SelectItem value="Bekannter">Bekannter</SelectItem>
                      <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs font-medium">Anmerkungen *</Label>
                <Textarea value={empAnmerkungen} onChange={e => setEmpAnmerkungen(e.target.value)} placeholder="z.B. Bester Zeitpunkt für einen Anruf, besondere Interessen..." className="text-sm mt-1" rows={2} />
              </div>
              <Button className="w-full gap-1.5" disabled={!empName.trim() || !empTelefon.trim() || !empEmail.trim() || !empBeziehung || !empAnmerkungen.trim()} onClick={handleSubmitEmpfehlung}>
                <Send className="h-3 w-3" /> Empfehlung senden
              </Button>
              {empSuccess && (
                <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))] bg-[hsl(var(--success))]/10 rounded-lg p-3">
                  <CheckCircle2 className="h-4 w-4" />
                  Vielen Dank! Deine Empfehlung wurde erfolgreich an deinen Vertriebspartner übermittelt.
                </div>
              )}
            </div>

            {/* Bisherige Empfehlungen */}
            {empfehlungen.length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-3">Deine bisherigen Empfehlungen ({empfehlungen.length})</h3>
                <div className="space-y-2">
                  {empfehlungen.map(emp => (
                    <div key={emp.id} className="flex flex-wrap items-center gap-3 bg-muted/50 rounded-lg p-3">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${
                        emp.status === "neu" ? "bg-[hsl(var(--warning))]"
                        : emp.status === "kontaktiert" ? "bg-primary"
                        : "bg-[hsl(var(--success))]"
                      }`} />
                      <div className="min-w-0 flex-1 basis-48 break-words">
                        <p className="text-sm font-medium">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">{emp.beziehung} · {new Date(emp.erstellt_am).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}</p>
                      </div>
                      <Badge variant="outline" className={`ml-auto shrink-0 text-[10px] ${
                        emp.status === "neu" ? "text-[hsl(var(--warning))]"
                        : emp.status === "kontaktiert" ? "text-primary"
                        : "text-[hsl(var(--success))]"
                      }`}>{emp.status === "neu" ? "Gesendet" : emp.status === "kontaktiert" ? "Kontaktiert" : "Erfolgreich"}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        );
      })()}
    </div>
  );
}
