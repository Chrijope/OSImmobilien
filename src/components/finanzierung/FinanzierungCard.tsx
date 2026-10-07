import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { extractStoragePath, openUnterlage } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/contexts/UserContext";
import { Upload, Plus, CheckCircle2, Trash2, Download, FileText, X, Calculator, Loader2, AlertTriangle, Lock } from "lucide-react";
import type { FinanzierungInternStand } from "@/lib/investmentFreischaltung";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getFinanzierung,
  createAngebot,
  updateAngebot,
  addDokumentToAngebot,
  updateDokumentStatus,
  removeDokument,
  removeAngebot,
  saveFinanzierung,
  type FinanzierungData,
  type FinanzierungsAngebot,
  type FinanzDocStatus,
  type MischzinsTranche,
} from "@/lib/finanzierungStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MischzinsRechner } from "@/components/objekte/MischzinsRechner";

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

interface FinanzierungCardProps {
  investmentId: string;
  kundeName: string;
  /** Wird nicht mehr ausgewertet, die Freigabe kommt ueber `freigabe`. */
  pipelineStufe?: string;
  berater: string;
  beraterId?: string;
  onPipelineUpdate: () => void;
  /**
   * Antwort von `finanzierungIntern` fuer dieses Investment. Die Regel steht
   * nur dort; die Karte fragt keine Stufe mehr selbst ab.
   */
  freigabe?: FinanzierungInternStand;
}

export function FinanzierungCard({ investmentId, kundeName, berater, beraterId, onPipelineUpdate, freigabe }: FinanzierungCardProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const [data, setData] = useState<FinanzierungData>(() => getFinanzierung(investmentId));
  const [newDocName, setNewDocName] = useState("");
  const [addDocAngebotId, setAddDocAngebotId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("angebote");
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{ angebotId: string; docId: string; targetStatus: FinanzDocStatus } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ angebotId: string; docId: string; docName: string } | null>(null);

  /*
   * Jedes Investment fuehrt seine eigene Finanzierung.
   *
   * Der Anfangswert von `useState` wird nur beim ersten Aufbau gelesen. Wechselt
   * der Kunde in der Oberflaeche von Investment 1 auf Investment 3, bleibt die
   * Karte an derselben Stelle im Baum stehen, React baut sie also nicht neu auf,
   * und ohne diesen Abgleich zeigte sie weiter die Angebote des zuerst
   * geoeffneten Investments. Der Abgleich laeuft waehrend des Renderns, damit
   * kein Bild mit fremden Daten sichtbar wird.
   */
  const [geladenesInvestment, setGeladenesInvestment] = useState(investmentId);
  if (geladenesInvestment !== investmentId) {
    setGeladenesInvestment(investmentId);
    setData(getFinanzierung(investmentId));
    // Diese drei zeigen auf Angebote und Dokumente des alten Investments.
    setAddDocAngebotId(null);
    setDeleteConfirm(null);
    setNewDocName("");
  }

  const handleFileUpload = async (file: File) => {
    const pending = pendingUploadRef.current;
    if (!pending || !file) return;
    setUploading(pending.docId);
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const ext = file.name.split(".").pop() || "pdf";
      const path = `finanzierung/${investmentId}/${pending.angebotId}/${pending.docId}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("unterlagen").upload(path, file, { upsert: true });
      if (error) throw error;
      // Speichere Pfad statt URL (Signed URL wird beim Öffnen on-demand erzeugt)
      updateDokumentStatus(investmentId, pending.angebotId, pending.docId, pending.targetStatus, path);
      reload();
      toast({ title: "Dokument hochgeladen ✓" });
    } catch (e: any) {
      console.error("Upload error:", e);
      toast({ title: "Upload fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setUploading(null);
      pendingUploadRef.current = null;
    }
  };

  const triggerUpload = (angebotId: string, docId: string, targetStatus: FinanzDocStatus = "uploaded") => {
    pendingUploadRef.current = { angebotId, docId, targetStatus };
    fileInputRef.current?.click();
  };

  const reload = () => setData(getFinanzierung(investmentId));

  const isVP = user.role === "vertriebspartner";
  const isAdminOrInhaber = ["admin", "inhaber"].includes(user.role);
  // Everyone internal can upload and manage
  const canUpload = isVP || isAdminOrInhaber || user.role === "finanzierungspartner";
  const canDeleteDoc = isAdminOrInhaber;
  // Nur Admin/Inhaber/Finanzierungspartner dürfen den Mischzinsrechner bedienen
  const canUseMischzins = isAdminOrInhaber || user.role === "finanzierungspartner";

  /*
   * Bis zum 25.09.2026 sperrte die Karte hier ein zweites Mal, und zwar auch
   * waehrend "bonitaetsunterlagen", mit dem Satz "Finanzierung wird nach der
   * Reservierung freigeschaltet". Das Kundenprofil hatte die Karte da schon
   * geoeffnet, weil die Reservierung unterschrieben war. Der
   * Finanzierungspartner sah also eine offene Kachel mit einem Sperrtext und
   * konnte das Angebot nicht hochladen. Jetzt gilt allein `finanzierungIntern`.
   */
  if (freigabe && !freigabe.offen) {
    return (
      <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        <span>{freigabe.sperrgrund}</span>
      </div>
    );
  }

  // Der Status kommt aus den Dokumenten, nicht mehr aus einem eigenen Feld.
  // Das frühere Phasenmodell wurde nie weitergeschaltet, deshalb stand hier
  // dauerhaft "Dokumente ausstehend" und "Bestätigt" erschien nie.
  const hatUnterschriebenenDarlehensvertrag = data.angebote.some((a) =>
    (a.dokumente || []).some((d) => d.name === "Darlehensvertrag" && d.status === "signed"),
  );
  const hatAngebot = data.angebote.some((a) =>
    (a.dokumente || []).some((d) => d.name === "Finanzierungsangebot" && d.status !== "none"),
  );
  const isFinal = hatUnterschriebenenDarlehensvertrag;

  const phase = isFinal
    ? { text: "Darlehensvertrag unterschrieben", color: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]" }
    : hatAngebot
      ? { text: "Angebot liegt vor", color: "bg-primary/10 text-primary border-primary" }
      : { text: "Dokumente ausstehend", color: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]" };

  const handleCreateAngebot = () => {
    const angebot = createAngebot(investmentId);
    /*
     * Das Anlegen schreibt in den Zwischenspeicher, und der schreibt erst nach
     * der Bestaetigung der Datenbank zurueck. Deshalb haengen wir das neue
     * Angebot hier selbst an, sonst bliebe die Liste nach dem ersten Klick
     * leer. Die Pruefung auf die Kennung sorgt dafuer, dass daraus kein
     * zweites Angebot wird, falls dieselbe Kennung schon in der Liste steht.
     */
    setData(prev =>
      prev.angebote.some(a => a.id === angebot.id)
        ? prev
        : { ...prev, angebote: [...prev.angebote, angebot] },
    );
  };

  // handleFinalConfirm removed – no admin finalization needed

  const handleAddDoc = (angebotId: string) => {
    if (!newDocName.trim()) return;
    addDokumentToAngebot(investmentId, angebotId, newDocName.trim());
    setNewDocName("");
    setAddDocAngebotId(null);
    reload();
  };

  const handleDeleteDoc = (angebotId: string, docId: string) => {
    updateDokumentStatus(investmentId, angebotId, docId, "none");
    reload();
    toast({ title: "Dokument gelöscht ✓" });
    setDeleteConfirm(null);
  };

  const handleRequestDeletion = (docName: string) => {
    toast({
      title: "Löschung beantragt",
      description: `Die Löschung von „${docName}" wurde beim Admin beantragt.`,
    });
  };

  /** Apply Mischzins result */
  const handleApplyMischzins = (betrag: number, zins: number, tilgung: number, tranchenData?: MischzinsTranche[]) => {
    let working = data;
    if (working.angebote.length === 0) {
      const angebot = createAngebot(investmentId);
      working = { ...working, angebote: [angebot] };
      setData(working);
    }
    const target = working.angebote[0];
    if (target) {
      updateAngebot(investmentId, target.id, {
        summe: betrag,
        zins: zins.toFixed(3),
        tilgung: tilgung.toFixed(3),
        bank: tranchenData && tranchenData.length > 1 ? "Mischfinanzierung" : target.bank,
        tranchen: tranchenData && tranchenData.length > 1 ? tranchenData : undefined,
      });
    }
    reload();
    setActiveTab("angebote");
    toast({ title: "Werte übernommen ✓" });
  };

  const allDocsUploaded = data.angebote.length > 0 && data.angebote.every(a =>
    a.dokumente.filter(d => d.isDefault).every(d => d.status !== "none")
  );

  const renderAngebot = (angebot: FinanzierungsAngebot, idx: number) => {
    return (
      <div
        key={angebot.id}
        className={`border rounded-lg p-4 space-y-4 ${
          isFinal ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/5" : "border-border"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Angebot {idx + 1}</h4>
            {isFinal && <Badge className="bg-[hsl(var(--success))] text-white text-[10px] h-5">Bestätigt</Badge>}
          </div>
          {canUpload && !isFinal && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => { removeAngebot(investmentId, angebot.id); reload(); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Mischzins-Tranchen Ansicht (read-only summary if available) */}
        {angebot.tranchen && angebot.tranchen.length > 1 && (
          <div className="space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mischfinanzierung in Tranchen</h5>
            {angebot.tranchen.map((tr, ti) => (
              <div key={ti} className="border rounded p-3 bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold">{tr.bezeichnung || `Tranche ${ti + 1}`}</span>
                  <span className="text-xs text-muted-foreground">{fmt(tr.betrag)}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Zinssatz</span><span className="font-medium">{tr.zinssatz.toFixed(3)} %</span></div>
                  <div><span className="text-xs text-muted-foreground block">Tilgung</span><span className="font-medium">{tr.tilgung.toFixed(3)} %</span></div>
                  <div><span className="text-xs text-muted-foreground block">Monatsrate</span><span className="font-medium">{fmt(tr.betrag * (tr.zinssatz + tr.tilgung) / 100 / 12)}</span></div>
                </div>
              </div>
            ))}
            <div className="border rounded p-3 bg-primary/5 border-primary/30">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Gesamt (gewichteter Mischzins)</h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-xs text-muted-foreground block">Gesamtsumme</span><span className="font-bold">{fmt(Number(angebot.summe || 0))}</span></div>
                <div><span className="text-xs text-muted-foreground block">Mischzins</span><span className="font-bold">{angebot.zins} %</span></div>
                <div><span className="text-xs text-muted-foreground block">Ø Tilgung</span><span className="font-bold">{angebot.tilgung} %</span></div>
                <div>
                  <span className="text-xs text-muted-foreground block">Monatl. Rate</span>
                  <span className="font-bold">{(() => {
                    const summe = Number(angebot.summe || 0);
                    const zins = parseFloat(String(angebot.zins || "0").replace(",", "."));
                    const tilg = parseFloat(String(angebot.tilgung || "0").replace(",", "."));
                    return summe > 0 ? fmt(summe * (zins + tilg) / 100 / 12) : "–";
                  })()}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Finanzierungsdokumente */}
        <div className="border rounded p-3">
          <div className="flex items-center justify-between mb-3">
            <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Finanzierungsdokumente</h5>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Fehlt</span>
            <span className="inline-flex items-center gap-1.5 mr-3"><span className="w-2 h-2 rounded-full bg-[hsl(var(--warning))] inline-block" /> Hochgeladen</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[hsl(var(--success))] inline-block" /> Freigegeben</span>
          </p>

          <div className="space-y-2">
            {angebot.dokumente.map(doc => {
              const isDefaultDoc = doc.isDefault;
              const dotColor = doc.status === "signed" ? "bg-[hsl(var(--success))]" : doc.status === "uploaded" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
              const statusLabel = doc.status === "signed" ? "Freigegeben" : doc.status === "uploaded" ? "Hochgeladen" : "Fehlt";
              const statusClass = doc.status === "signed" ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                : doc.status === "uploaded" ? "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]"
                : "bg-destructive/10 text-destructive";

              return (
                <div key={doc.id} className="border-b pb-2 last:border-0 flex items-start gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${dotColor}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{doc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                    </div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {/* Upload – VP and Admin can upload */}
                      {doc.status === "none" && canUpload && !isFinal && (
                        <button
                          className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1"
                          disabled={uploading === doc.id}
                          onClick={() => triggerUpload(angebot.id, doc.id, "uploaded")}
                        >
                          {uploading === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Hochladen
                        </button>
                      )}
                      {/* Freigeben – for default docs after upload */}
                      {doc.status === "uploaded" && isDefaultDoc && canUpload && !isFinal && (
                        <button
                          className="text-xs hover:underline uppercase tracking-wide flex items-center gap-1" style={{ color: "hsl(var(--alert-green))" }}
                          onClick={async () => {
                            updateDokumentStatus(investmentId, angebot.id, doc.id, "signed", doc.fileUrl);
                            // Glocke an den Kunden. Sie braucht die Kennung des KONTAKTS,
                            // nicht die des Investments. Bis zum 25.09.2026 stand hier die
                            // Investment-Kennung: `notifyKunde` fand dazu keinen Kontakt
                            // und keine Anmeldekennung, die Glocke erreichte also nie
                            // jemanden. Verwechselt wurde das vermutlich, weil die Spalte
                            // `finanzierungen.kunde_id` historisch die Investment-Kennung
                            // traegt.
                            Promise.all([import("@/lib/investmentsStore"), import("@/lib/bellNotifications")])
                              .then(([investments, glocke]) => {
                                const kontaktId = investments.kontaktIdZumInvestment(investmentId);
                                if (kontaktId) glocke.notifyKundeFinanzierungFreigegeben(kontaktId, doc.name);
                                else console.warn("[FinanzierungCard] Kein Kontakt zum Investment, Glocke an den Kunden entfaellt", investmentId);
                              })
                              .catch(() => {});
                            reload();
                            toast({ title: `${doc.name} freigegeben ✓` });

                            // Der unterschriebene Darlehensvertrag ist der Punkt, an dem die
                            // Finanzierung steht. Frueher haette das die Phase "final"
                            // ausgeloest, die aber nie gesetzt wurde, weshalb der hier
                            // hinterlegte Uebergang zum Notar unerreichbarer Code war.
                            if (doc.name === "Darlehensvertrag") onPipelineUpdate();

                            // 🤖 KI-Auslesung: Bei Darlehensvertrag Sollzinssatz automatisch extrahieren
                            if (doc.name === "Darlehensvertrag" && doc.fileUrl && !angebot.zins) {
                              try {
                                toast({ title: "🤖 Lese Zinssatz aus Darlehensvertrag …" });
                                const { supabase } = await import("@/integrations/supabase/client");
                                // Gespeichert ist ein Pfad, bei Altbestand eine Adresse im
                                // Eimer `unterlagen`. Die Function nimmt nur noch den Pfad.
                                const filePath = extractStoragePath(doc.fileUrl, "unterlagen");
                                if (!filePath) throw new Error("Kein Pfad im Eimer unterlagen");
                                const { data, error } = await supabase.functions.invoke("extract-loan-terms", {
                                  body: { filePath },
                                });
                                if (error) throw error;
                                if (data?.zinssatz != null && Number.isFinite(Number(data.zinssatz))) {
                                  const zinsStr = String(data.zinssatz).replace(".", ",");
                                  const { updateAngebot } = await import("@/lib/finanzierungStore");
                                  updateAngebot(investmentId, angebot.id, { zins: zinsStr });
                                  reload();
                                  toast({ title: `✓ Zinssatz erkannt: ${zinsStr} %` });
                                } else {
                                  toast({ title: "Zinssatz nicht automatisch erkannt", description: "Bitte manuell eintragen." });
                                }
                              } catch (err: any) {
                                console.error("extract-loan-terms Fehler:", err);
                                // Auto-Auslesung ist optional – nur Info, kein Fehler
                                toast({
                                  title: "Auto-Auslesung nicht möglich",
                                  description: "Bitte Zinssatz manuell eintragen.",
                                });
                              }
                            }
                          }}
                        >
                          <CheckCircle2 className="h-3 w-3" /> Freigeben
                        </button>
                      )}
                      {/* Upload signed version – only for custom (non-default) docs */}
                      {doc.status === "uploaded" && !isDefaultDoc && canUpload && !isFinal && (
                        <button
                          className="text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1"
                          disabled={uploading === doc.id}
                          onClick={() => triggerUpload(angebot.id, doc.id, "signed")}
                        >
                          {uploading === doc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Unterschrieben hochladen
                        </button>
                      )}
                      {/* Download */}
                      {doc.status !== "none" && (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground uppercase tracking-wide flex items-center gap-1"
                          onClick={async () => {
                            try {
                              const { supabase } = await import("@/integrations/supabase/client");
                              const { data: files, error } = await supabase.storage.from("unterlagen").list(`finanzierung/${investmentId}/${angebot.id}`);
                              if (error) throw error;
                              const match = files?.find(f => f.name.startsWith(`${doc.id}_`));
                              if (!match) {
                                toast({ title: "Datei nicht gefunden", variant: "destructive" });
                                return;
                              }
                              const filePath = `finanzierung/${investmentId}/${angebot.id}/${match.name}`;
                              await openUnterlage(filePath);
                            } catch (e: any) {
                              toast({ title: "Download fehlgeschlagen", description: e.message, variant: "destructive" });
                            }
                          }}
                        >
                          <Download className="h-3 w-3" /> Herunterladen
                        </button>
                      )}
                      {/* Delete – Admin only with confirmation */}
                      {doc.status !== "none" && canDeleteDoc && !isFinal && (
                        <button
                          className="text-xs text-destructive hover:underline uppercase tracking-wide flex items-center gap-1"
                          onClick={() => setDeleteConfirm({ angebotId: angebot.id, docId: doc.id, docName: doc.name })}
                        >
                          <Trash2 className="h-3 w-3" /> Entfernen
                        </button>
                      )}
                      {/* VP can only request deletion */}
                      {doc.status !== "none" && isVP && !canDeleteDoc && !isFinal && (
                        <button
                          className="text-xs text-[hsl(var(--warning))] hover:underline uppercase tracking-wide flex items-center gap-1"
                          onClick={() => handleRequestDeletion(doc.name)}
                        >
                          <AlertTriangle className="h-3 w-3" /> Löschung beantragen
                        </button>
                      )}
                      {/* Remove custom doc entirely */}
                      {!doc.isDefault && canDeleteDoc && !isFinal && (
                        <button
                          className="text-xs text-destructive hover:underline uppercase tracking-wide"
                          onClick={() => { removeDokument(investmentId, angebot.id, doc.id); reload(); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress */}
          <div className="mt-3 flex items-center gap-2">
            <div className="flex gap-0.5 flex-1">
              {angebot.dokumente.map(doc => {
                const barColor = doc.status === "signed" ? "bg-[hsl(var(--success))]" : doc.status === "uploaded" ? "bg-[hsl(var(--warning))]" : "bg-destructive";
                return <div key={doc.id} className={`h-2 flex-1 rounded-sm ${barColor}`} />;
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              {angebot.dokumente.filter(d => d.status !== "none").length}/{angebot.dokumente.length}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = "";
        }}
      />
      {/* Phase status */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium">Status:</span>
        <Badge variant="outline" className={`text-xs ${phase.color}`}>{phase.text}</Badge>
      </div>

      {/* Portal hint */}
      <div className="border rounded-lg p-3 border-primary/30 bg-primary/5">
        <p className="text-xs text-muted-foreground">
          ℹ️ Hochgeladene und freigegebene Finanzierungsunterlagen werden dem Kunden automatisch im <strong>Kundenportal</strong> angezeigt.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="angebote">
            <FileText className="h-3.5 w-3.5 mr-1.5" /> Angebote
          </TabsTrigger>
          <TabsTrigger value="mischzins">
            <Calculator className="h-3.5 w-3.5 mr-1.5" /> Mischzinsrechner
          </TabsTrigger>
        </TabsList>

        <TabsContent value="angebote" className="space-y-4 mt-4">
          {data.angebote.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              Noch keine Angebote erstellt. Erstelle ein Finanzierungsangebot für den Kunden.
            </p>
          )}

          {data.angebote.map((a, i) => renderAngebot(a, i))}

          {/* Actions */}
          <div className="flex gap-2 flex-wrap pt-2">
            {canUpload && !isFinal && (
              <Button size="sm" variant="outline" onClick={handleCreateAngebot}>
                <Plus className="h-3 w-3 mr-1" /> Neues Angebot erstellen
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="mischzins" className="mt-4">
          <MischzinsRechnerWithApply onApply={handleApplyMischzins} readOnly={!canUseMischzins} />
        </TabsContent>
      </Tabs>

      {/* Add custom doc dialog */}
      <Dialog open={!!addDocAngebotId} onOpenChange={() => setAddDocAngebotId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Dokument hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label className="text-sm">Dokumentname</Label>
              <Input
                value={newDocName}
                onChange={e => setNewDocName(e.target.value)}
                placeholder="z.B. Tilgungsplan, Sicherheitenvertrag..."
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => addDocAngebotId && handleAddDoc(addDocAngebotId)}
              disabled={!newDocName.trim()}
              className="w-full"
            >
              Hinzufügen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Dokument löschen?
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p>Möchtest du das Dokument <strong>„{deleteConfirm?.docName}"</strong> wirklich löschen?</p>
              <p className="mt-2">Das Dokument wird entfernt und muss erneut hochgeladen werden.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDeleteDoc(deleteConfirm.angebotId, deleteConfirm.docId)}
            >
              Ja, löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Wrapper around MischzinsRechner that adds an "Übernehmen" button */
function MischzinsRechnerWithApply({ onApply, readOnly = false }: { onApply: (betrag: number, zins: number, tilgung: number, tranchen?: MischzinsTranche[]) => void; readOnly?: boolean }) {
  const [tranchen, setTranchen] = useState([
    { id: "t1", bezeichnung: "KfW Darlehen", betrag: 150000, zinssatz: 0.01, tilgung: 2.29 },
    { id: "t2", bezeichnung: "Bankdarlehen", betrag: 100000, zinssatz: 3.5, tilgung: 2.0 },
  ]);

  const addTranche = () =>
    setTranchen(p => [...p, { id: `t${Date.now()}`, bezeichnung: "", betrag: 0, zinssatz: 0, tilgung: 0 }]);

  const update = (id: string, field: string, value: string) =>
    setTranchen(p =>
      p.map(t => (t.id === id ? { ...t, [field]: field === "bezeichnung" ? value : parseFloat(value) || 0 } : t))
    );

  const remove = (id: string) => setTranchen(p => p.filter(t => t.id !== id));

  const gesamtBetrag = tranchen.reduce((s, t) => s + t.betrag, 0);
  const gewichteterZins = gesamtBetrag > 0
    ? tranchen.reduce((s, t) => s + t.betrag * t.zinssatz, 0) / gesamtBetrag
    : 0;
  const gewichteteTilgung = gesamtBetrag > 0
    ? tranchen.reduce((s, t) => s + t.betrag * t.tilgung, 0) / gesamtBetrag
    : 0;
  const mischAnnuitaet = gewichteterZins + gewichteteTilgung;
  const monatsrate = (gesamtBetrag * mischAnnuitaet) / 100 / 12;

  const fmtE = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Berechne den gewichteten Mischzins aus mehreren Darlehenstranchen und übernimm das Ergebnis in ein Angebot.</p>
      {readOnly && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Nur Admin und Finanzierungspartner dürfen den Mischzinsrechner bearbeiten. Die Werte sind für dich schreibgeschützt.
        </div>
      )}

      {tranchen.map((t, i) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Tranche {i + 1}</span>
            {tranchen.length > 1 && !readOnly && (
              <Button variant="ghost" size="sm" className="text-destructive h-6 px-2 text-xs" onClick={() => remove(t.id)}>
                Entfernen
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Bezeichnung</Label><Input readOnly={readOnly} value={t.bezeichnung} onChange={e => update(t.id, "bezeichnung", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Betrag (€)</Label><Input readOnly={readOnly} type="number" value={t.betrag || ""} onChange={e => update(t.id, "betrag", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Zinssatz (%)</Label><Input readOnly={readOnly} type="number" step="0.01" value={t.zinssatz || ""} onChange={e => update(t.id, "zinssatz", e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Tilgung (%)</Label><Input readOnly={readOnly} type="number" step="0.01" value={t.tilgung || ""} onChange={e => update(t.id, "tilgung", e.target.value)} className="h-8" /></div>
          </div>
        </Card>
      ))}

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addTranche}>+ Tranche hinzufügen</Button>
      )}

      <Card className="p-4 bg-primary/5 border-primary/30">
        <h4 className="font-bold mb-3">Ergebnis</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-muted-foreground block">Gesamtbetrag</span><span className="font-bold text-lg">{fmtE(gesamtBetrag)}</span></div>
          <div><span className="text-muted-foreground block">Mischzins</span><span className="font-bold text-lg">{gewichteterZins.toFixed(3)} %</span></div>
          <div><span className="text-muted-foreground block">Ø Tilgung</span><span className="font-bold text-lg">{gewichteteTilgung.toFixed(3)} %</span></div>
          <div><span className="text-muted-foreground block">Monatsrate</span><span className="font-bold text-lg">{fmtE(monatsrate)}</span></div>
        </div>
      </Card>

      <Button
        onClick={() => onApply(
          gesamtBetrag,
          gewichteterZins,
          gewichteteTilgung,
          tranchen.map(t => ({ bezeichnung: t.bezeichnung, betrag: t.betrag, zinssatz: t.zinssatz, tilgung: t.tilgung }))
        )}
        disabled={gesamtBetrag <= 0 || readOnly}
        className="w-full"
      >
        <CheckCircle2 className="h-4 w-4 mr-2" />
        {tranchen.length > 1 ? "Mischzins-Tranchen in Angebot übernehmen" : "Ergebnis in Angebot 1 übernehmen"}
      </Button>
    </div>
  );
}
