import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, FolderOpen, FileText, CheckCircle2, XCircle, Loader2, Sparkles, ArrowRight, AlertCircle, Trash2, Link2, ExternalLink, Download, ImageIcon, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { clearUploadAnalyseTask, resumeUploadAnalyseTask, startUploadAnalyseTask, subscribeUploadAnalyseTask, MAX_ANALYSIS_FILES } from "@/lib/objektAnalyseRunner";
import { confirmDialog } from "@/lib/confirm";
import { edgeFehlerMitGrund } from "@/lib/edgeFehler";
import { createEmptyUploadAnalyseRuntimeState, type ExtractedObjektData, type UploadAnalyseRuntimeState } from "@/lib/objektAnalyseShared";

export type { ExtractedObjektData };

interface ObjektUploadAnalyseProps {
  draftKey: string;
  onAnalyseComplete: (data: ExtractedObjektData, pdfFiles: File[], cloudUrl?: string) => void;
  onAnalyzingChange?: (analyzing: boolean) => void;
  onCloudUrlChange?: (url: string) => void;
  draft?: {
    files: File[];
    slotFiles: Record<string, File[]>;
    cloudUrl: string;
    result: ExtractedObjektData | null;
    runtime?: UploadAnalyseRuntimeState;
  } | null;
  onDraftChange?: (draft: {
    files: File[];
    slotFiles: Record<string, File[]>;
    cloudUrl: string;
    result: ExtractedObjektData | null;
    runtime: UploadAnalyseRuntimeState;
  }) => void;
  isAdmin: boolean;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  expose: "Exposé",
  wohnflaechenberechnung: "Wohnflächenberechnung",
  energieausweis: "Energieausweis",
  aufteilungsplan: "Aufteilungsplan",
  grundbuchauszug: "Grundbuchauszug",
  mietvertrag: "Mietvertrag",
  teilungserklaerung: "Teilungserklärung",
  versicherungsnachweis: "Versicherungsnachweis",
  lageplan: "Lageplan",
  sonstige: "Sonstiges",
};

const DOCUMENT_SLOTS = [
  { id: "expose", label: "Exposé", hint: "Objektbeschreibung, Verkaufsunterlagen" },
  { id: "wohnflaechenberechnung", label: "Wohnflächenberechnung", hint: "Flächen aller Wohneinheiten" },
  { id: "energieausweis", label: "Energieausweis", hint: "Energieeffizienzklasse, Verbrauchswerte" },
  { id: "aufteilungsplan", label: "Aufteilungsplan", hint: "Aufteilung der Wohneinheiten" },
  { id: "grundbuchauszug", label: "Grundbuchauszug", hint: "Eigentumsverhältnisse, Belastungen" },
  { id: "mietvertrag", label: "Mietverträge", hint: "Bestehende Mietverträge" },
  { id: "teilungserklaerung", label: "Teilungserklärung", hint: "Gemeinschafts- & Sondereigentum" },
] as const;

const MAX_FILES_PER_SLOT = 40;

const toFileFingerprint = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/** Höchstens so viele Namen in eine Meldung, sonst wird sie unlesbar. */
const namenListe = (dateien: File[], hoechstens = 8) => {
  const namen = dateien.slice(0, hoechstens).map((datei) => datei.name);
  const rest = dateien.length - namen.length;
  return rest > 0 ? `${namen.join(", ")} und ${rest} weitere` : namen.join(", ");
};

export function ObjektUploadAnalyse({ draftKey, onAnalyseComplete, onAnalyzingChange, onCloudUrlChange, draft, onDraftChange, isAdmin: _isAdmin }: ObjektUploadAnalyseProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const lastDraftRef = useRef("");
  const lastAppliedDraftRef = useRef("");
  const resumeRequestedRef = useRef<string | null>(null);

  const [files, setFiles] = useState<File[]>(draft?.files ?? []);
  const [slotFiles, setSlotFiles] = useState<Record<string, File[]>>(draft?.slotFiles ?? {});
  const [cloudUrl, setCloudUrl] = useState(draft?.cloudUrl ?? "");
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [runtime, setRuntime] = useState<UploadAnalyseRuntimeState>(() => draft?.runtime ?? createEmptyUploadAnalyseRuntimeState({ result: draft?.result ?? null }));

  const isAnalyzing = runtime.status === "running";
  const progress = runtime.progress;
  const progressText = runtime.progressText;
  const result = runtime.result;
  const error = runtime.error;
  const allFiles = useMemo(() => [...files, ...Object.values(slotFiles).flat()], [files, slotFiles]);

  const fileFingerprint = useMemo(() => JSON.stringify({
    files: files.map(toFileFingerprint),
    slotFiles: Object.fromEntries(
      Object.entries(slotFiles).map(([key, value]) => [key, value.map(toFileFingerprint)]),
    ),
  }), [files, slotFiles]);

  const draftSnapshot = useMemo(() => JSON.stringify({
    fileNames: (draft?.files ?? []).map(toFileFingerprint),
    slotFileNames: Object.fromEntries(
      Object.entries(draft?.slotFiles ?? {}).map(([key, value]) => [key, value.map(toFileFingerprint)]),
    ),
    cloudUrl: draft?.cloudUrl ?? "",
    runtime: draft?.runtime ?? null,
    result: draft?.result ?? null,
  }), [draft]);

  const handleCloudUrlChange = useCallback((url: string) => {
    setCloudUrl(url);
    onCloudUrlChange?.(url);
  }, [onCloudUrlChange]);

  useEffect(() => {
    return subscribeUploadAnalyseTask(draftKey, (nextState) => {
      setRuntime(nextState);
    });
  }, [draftKey]);

  useEffect(() => {
    if (!draft) return;
    if (draftSnapshot === lastAppliedDraftRef.current) return;

    setFiles(draft.files ?? []);
    setSlotFiles(draft.slotFiles ?? {});
    setCloudUrl(draft.cloudUrl ?? "");
    setRuntime(draft.runtime ?? createEmptyUploadAnalyseRuntimeState({ result: draft.result ?? null }));
    lastAppliedDraftRef.current = draftSnapshot;
  }, [draft, draftSnapshot]);

  useEffect(() => {
    onAnalyzingChange?.(isAnalyzing);
  }, [isAnalyzing, onAnalyzingChange]);

  useEffect(() => {
    const nextDraft = {
      files,
      slotFiles,
      cloudUrl,
      result: runtime.result,
      runtime,
    };

    const serialized = JSON.stringify({
      fileNames: files.map(toFileFingerprint),
      slotFileNames: Object.fromEntries(
        Object.entries(slotFiles).map(([key, value]) => [key, value.map(toFileFingerprint)]),
      ),
      cloudUrl,
      runtime: {
        runId: runtime.runId,
        status: runtime.status,
        phase: runtime.phase,
        progress: runtime.progress,
        error: runtime.error,
        updatedAt: runtime.updatedAt,
        uploadedRefs: runtime.uploadedRefs,
        failedItems: runtime.failedItems,
        hasResult: Boolean(runtime.result),
      },
    });

    if (serialized === lastDraftRef.current) return;
    lastDraftRef.current = serialized;
    lastAppliedDraftRef.current = JSON.stringify({
      fileNames: files.map(toFileFingerprint),
      slotFileNames: Object.fromEntries(
        Object.entries(slotFiles).map(([key, value]) => [key, value.map(toFileFingerprint)]),
      ),
      cloudUrl,
      runtime,
      result: runtime.result,
    });
    onDraftChange?.(nextDraft);
  }, [cloudUrl, files, onDraftChange, runtime, slotFiles]);

  useEffect(() => {
    if (runtime.status !== "running" || !runtime.runId || allFiles.length === 0) return;

    const resumeKey = `${draftKey}:${runtime.runId}:${fileFingerprint}`;
    if (resumeRequestedRef.current === resumeKey) return;

    resumeRequestedRef.current = resumeKey;
    setRuntime(resumeUploadAnalyseTask({
      draftKey,
      files,
      slotFiles,
      runtime,
    }));
  }, [allFiles.length, draftKey, fileFingerprint, files, runtime, slotFiles]);

  const hasRecoverableAnalysisState = runtime.status !== "idle"
    || runtime.uploadedPaths.length > 0
    || runtime.partialResults.length > 0
    || Boolean(runtime.result)
    || Boolean(runtime.error);

  const resetAnalysisTask = useCallback((cleanupStorage = true) => {
    resumeRequestedRef.current = null;
    setRuntime(createEmptyUploadAnalyseRuntimeState());
    void clearUploadAnalyseTask(draftKey, cleanupStorage);
  }, [draftKey]);

  const invalidatePreviousResult = useCallback(() => {
    if (!isAnalyzing && hasRecoverableAnalysisState) {
      resetAnalysisTask();
    }
  }, [hasRecoverableAnalysisState, isAnalyzing, resetAnalysisTask]);

  /*
   * Angenommen wird ausschließlich PDF.
   *
   * Alles andere wurde bisher stillschweigend verworfen: Wer ein Bild oder
   * eine Excel-Datei hineinzog, bekam gar keine Rückmeldung und wartete
   * darauf, dass die KI etwas daraus liest. Deshalb wird jetzt jede
   * aussortierte Datei mit Namen genannt.
   */
  const meldeNichtPdf = useCallback((verworfen: File[]) => {
    if (verworfen.length === 0) return;
    toast({
      title: `${verworfen.length} Datei(en) nicht übernommen`,
      description: `Nur PDF wird gelesen. Nicht dabei: ${namenListe(verworfen)}.`,
      variant: "destructive",
    });
  }, [toast]);

  const handleFiles = useCallback((newFiles: FileList | File[]) => {
    const alle = Array.from(newFiles);
    const pdfFiles = alle.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    const verworfen = alle.filter((file) => !file.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast({
        title: "Keine PDF-Dateien gefunden",
        description: verworfen.length > 0
          ? `Nur PDF wird gelesen. Nicht dabei: ${namenListe(verworfen)}.`
          : "Bitte lade PDF-Dokumente hoch.",
        variant: "destructive",
      });
      return;
    }

    meldeNichtPdf(verworfen);
    invalidatePreviousResult();
    setFiles((prev) => [...prev, ...pdfFiles]);
  }, [invalidatePreviousResult, meldeNichtPdf, toast]);

  const handleSlotFiles = useCallback((slotId: string, newFiles: FileList | File[]) => {
    const alle = Array.from(newFiles);
    const pdfFiles = alle.filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    meldeNichtPdf(alle.filter((file) => !file.name.toLowerCase().endsWith(".pdf")));
    if (pdfFiles.length === 0) return;

    invalidatePreviousResult();
    setSlotFiles((prev) => {
      const existing = prev[slotId] || [];
      const remaining = MAX_FILES_PER_SLOT - existing.length;
      if (remaining <= 0) {
        toast({ title: "Limit erreicht", description: `Maximal ${MAX_FILES_PER_SLOT} Dateien pro Kategorie.`, variant: "destructive" });
        return prev;
      }

      const toAdd = pdfFiles.slice(0, remaining);
      const uebersprungen = pdfFiles.slice(toAdd.length);
      if (uebersprungen.length > 0) {
        toast({
          title: `${uebersprungen.length} Datei(en) übersprungen`,
          description: `Max. ${MAX_FILES_PER_SLOT} pro Kategorie. Nicht dabei: ${namenListe(uebersprungen)}.`,
          variant: "destructive",
        });
      }

      return { ...prev, [slotId]: [...existing, ...toAdd] };
    });
  }, [invalidatePreviousResult, meldeNichtPdf, toast]);

  const removeFile = useCallback((idx: number) => {
    invalidatePreviousResult();
    setFiles((prev) => prev.filter((_, index) => index !== idx));
  }, [invalidatePreviousResult]);

  const removeSlotFile = useCallback((slotId: string, idx: number) => {
    invalidatePreviousResult();
    setSlotFiles((prev) => ({
      ...prev,
      [slotId]: (prev[slotId] || []).filter((_, index) => index !== idx),
    }));
  }, [invalidatePreviousResult]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (isAnalyzing) return;
    if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  }, [handleFiles, isAnalyzing]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const fetchPdfsFromUrl = async () => {
    if (!cloudUrl.trim()) {
      toast({ title: "Kein Link", description: "Bitte gib eine URL ein.", variant: "destructive" });
      return;
    }

    setIsFetchingUrl(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("fetch-url-pdfs", {
        body: { url: cloudUrl.trim() },
      });

      /*
       * Ohne `edgeFehlerMitGrund` stünde in der Meldung nur „Edge Function
       * returned a non-2xx status code“. Die Function antwortet seit dem
       * 16.09.2026 auch mit 401 (keine Anmeldung) und 429 (zu viele Abrufe
       * in kurzer Zeit), und beides soll der Nutzer im Klartext lesen.
       */
      if (fnError) {
        const mitGrund = await edgeFehlerMitGrund(fnError);
        const text = mitGrund instanceof Error ? mitGrund.message : fnError.message;
        throw new Error(text || "URL-Abruf fehlgeschlagen");
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.pdfs || data.pdfs.length === 0) throw new Error("Keine PDFs unter dieser URL gefunden.");

      const newFiles: File[] = [];
      for (const pdf of data.pdfs) {
        const byteString = atob(pdf.base64);
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/pdf" });
        newFiles.push(new File([blob], pdf.name, { type: "application/pdf" }));
      }

      invalidatePreviousResult();
      setFiles((prev) => [...prev, ...newFiles]);
      toast({ title: "PDFs importiert", description: `${newFiles.length} Dokument(e) von URL geladen.` });
    } catch (err: any) {
      console.error("URL fetch error:", err);
      toast({ title: "URL-Import fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const startAnalysis = useCallback(async () => {
    if (allFiles.length === 0 || isAnalyzing) return;

    /*
     * Die Analyse nimmt höchstens `MAX_ANALYSIS_FILES` Dokumente an und schnitt
     * den Rest bisher ohne ein Wort ab. Wer sie fragt, kann stattdessen
     * abbrechen und aussortieren, statt sich hinterher zu wundern, warum eine
     * Angabe fehlt.
     */
    const ueberzaehlig = allFiles.slice(MAX_ANALYSIS_FILES);
    if (ueberzaehlig.length > 0) {
      const weiter = await confirmDialog({
        title: `${ueberzaehlig.length} Dokument(e) werden nicht gelesen`,
        description:
          `Die Analyse nimmt höchstens ${MAX_ANALYSIS_FILES} Dokumente auf einmal an. `
          + `Diese bleiben außen vor: ${namenListe(ueberzaehlig, 12)}.`,
        confirmText: `Die ersten ${MAX_ANALYSIS_FILES} analysieren`,
        cancelText: "Abbrechen und aussortieren",
      });
      if (!weiter) return;
    }

    const nextState = startUploadAnalyseTask({ draftKey, files, slotFiles });
    resumeRequestedRef.current = `${draftKey}:${nextState.runId}:${fileFingerprint}`;
    setRuntime(nextState);
  }, [allFiles.length, draftKey, fileFingerprint, files, isAnalyzing, slotFiles]);

  /*
   * Was nicht gelesen werden konnte.
   *
   * Diese Liste sammelte der Lauf schon immer, gezeigt wurde sie nie. Ein
   * unlesbares Dokument verschwand damit lautlos, und darüber stand
   * „Analyse erfolgreich abgeschlossen“.
   */
  const fehlgeschlagen = runtime.failedItems ?? [];
  const gelesen = runtime.partialResults?.length ?? 0;
  const gesamtVersucht = gelesen + fehlgeschlagen.length;

  const fehlerListe = fehlgeschlagen.length > 0 ? (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs font-semibold text-destructive mb-1.5">
        {fehlgeschlagen.length} Dokument(e) konnten nicht gelesen werden
      </p>
      <ul className="space-y-1">
        {fehlgeschlagen.map((eintrag, index) => (
          <li key={`${eintrag.name}-${eintrag.stage}-${index}`} className="text-[11px] leading-snug">
            <span className="font-medium">{eintrag.name}</span>
            <span className="text-muted-foreground">
              {" "}– {eintrag.stage === "upload" ? "Hochladen fehlgeschlagen" : "Analyse fehlgeschlagen"}: {eintrag.reason}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground mt-1.5">
        Die Angaben aus diesen Dokumenten fehlen in den übernommenen Daten. Bitte einzeln erneut hochladen oder von Hand nachtragen.
      </p>
    </div>
  ) : null;

  const fmt = (value: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(value);
  const fmtEur = (value: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">KI-gestützte Dokumentenanalyse</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lade deine Objektunterlagen in die jeweiligen Kategorien hoch, die KI extrahiert automatisch alle Kennzahlen.
              Alle Felder sind optional. Bilder & ergänzende Wohnungsunterlagen lädst du in den Folgeseiten hoch.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Dokumente nach Kategorie hochladen</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {DOCUMENT_SLOTS.map((slot) => {
              const slotFileList = slotFiles[slot.id] || [];
              return (
                <div
                  key={slot.id}
                  className={`border rounded-lg p-3 transition-all ${slotFileList.length > 0 ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/30 hover:bg-muted/20"} ${!isAnalyzing ? "cursor-pointer" : ""}`}
                  onDragOver={(e) => {
                    if (!isAnalyzing) {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.classList.add("border-primary", "bg-primary/10");
                    }
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-primary", "bg-primary/10");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.currentTarget.classList.remove("border-primary", "bg-primary/10");
                    if (!isAnalyzing && e.dataTransfer.files.length > 0) {
                      handleSlotFiles(slot.id, e.dataTransfer.files);
                    }
                  }}
                  onClick={() => {
                    if (!isAnalyzing) categoryInputRefs.current[slot.id]?.click();
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FileText className={`h-3.5 w-3.5 flex-shrink-0 ${slotFileList.length > 0 ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="text-xs font-medium">{slot.label}</span>
                      {slotFileList.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1.5">{slotFileList.length}</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={slotFileList.length > 0 ? "outline" : "ghost"}
                      className="h-6 text-[10px] gap-1 px-2"
                      disabled={isAnalyzing}
                      onClick={(e) => {
                        e.stopPropagation();
                        categoryInputRefs.current[slot.id]?.click();
                      }}
                    >
                      <Plus className="h-2.5 w-2.5" />
                      {slotFileList.length > 0 ? "Weitere" : "Hochladen"}
                    </Button>
                    <input
                      ref={(el) => {
                        categoryInputRefs.current[slot.id] = el;
                      }}
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      disabled={isAnalyzing}
                      onChange={(e) => {
                        if (e.target.files) handleSlotFiles(slot.id, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{slot.hint}</p>
                  {slotFileList.length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {slotFileList.map((file, index) => (
                        <div key={`${slot.id}-${index}`} className="flex items-center justify-between text-[10px] py-0.5 px-2 rounded bg-background/60">
                          <span className="truncate mr-2">{file.name}</span>
                          {!isAnalyzing && (
                            <button onClick={(e) => { e.stopPropagation(); removeSlotFile(slot.id, index); }} className="text-destructive flex-shrink-0">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Oder: Alle Dateien auf einmal hochladen</p>
          <div
            className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 transition-all ${isAnalyzing ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:border-primary/50 hover:bg-muted/30"}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => {
              if (!isAnalyzing) fileInputRef.current?.click();
            }}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">PDFs hier ablegen oder klicken</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-[10px] h-7" disabled={isAnalyzing} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <FileText className="h-3 w-3" /> Dateien
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-[10px] h-7" disabled={isAnalyzing} onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                <FolderOpen className="h-3 w-3" /> Ordner
              </Button>
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          disabled={isAnalyzing}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          disabled={isAnalyzing}
          {...{ webkitdirectory: "", directory: "" } as any}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-center gap-2 mb-2">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold text-muted-foreground">Cloud-Link / URL importieren</p>
          </div>
          <div className="flex gap-2">
            <Input
              value={cloudUrl}
              onChange={(e) => handleCloudUrlChange(e.target.value)}
              placeholder="z.B. OneDrive, Google Drive, SharePoint oder direkte PDF-URL..."
              className="h-8 text-xs flex-1"
            />
            {cloudUrl && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 gap-1 text-xs flex-shrink-0"
                  onClick={fetchPdfsFromUrl}
                  disabled={isFetchingUrl || isAnalyzing}
                >
                  {isFetchingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  {isFetchingUrl ? "Lade..." : "PDFs importieren"}
                </Button>
                <Button size="sm" variant="outline" className="h-8 gap-1 text-xs flex-shrink-0" asChild>
                  <a href={cloudUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3" /> Öffnen
                  </a>
                </Button>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Öffentliche Links werden automatisch nach PDFs durchsucht und importiert.
          </p>
        </div>

        {files.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{files.length} weitere Datei(en)</p>
            {files.map((file, index) => (
              <div key={`extra-${file.name}-${index}`} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/40 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-muted-foreground flex-shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
                {!isAnalyzing && (
                  <button onClick={() => removeFile(index)} className="text-destructive flex-shrink-0 ml-2">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {allFiles.length > 0 && !isAnalyzing && !result && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold">
                {allFiles.length} Dokument(e) bereit zur Analyse
                <span className="text-muted-foreground font-normal ml-1">
                  ({(allFiles.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </p>
            </div>
            <Button className="w-full gap-2" onClick={startAnalysis}>
              <Sparkles className="h-4 w-4" /> KI-Analyse starten
            </Button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
            <ImageIcon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Bilder & ergänzende Unterlagen</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Objektbilder, Wohnungsfotos und wohnungsspezifische Unterlagen (z.B. Grundrisse einzelner Wohnungen)
                werden in den Folgeseiten bei den jeweiligen Wohnungen hochgeladen.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {isAnalyzing && (
        <Card className="p-5 border-primary/40 bg-primary/5 shadow-lg ring-1 ring-primary/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 bg-primary rounded-full animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">KI-Analyse läuft...</p>
              <p className="text-xs text-muted-foreground">{progressText}</p>
            </div>
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary font-medium">
              {Math.round(progress)}%
            </Badge>
          </div>
          <Progress value={progress} className="h-2.5" />
          <div className="mt-3 flex items-start gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
            <p className="text-xs text-destructive/90 font-medium">
              ⚠️ Browser Tab: Bitte bleib während der Analyse in diesem Tab. Ein Tab-Wechsel kann dazu führen, dass die Analyse abgebrochen wird.
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Die KI liest und analysiert alle Dokumente. Dies dauert meist 10–60 Sekunden je nach Anzahl der Dateien.
          </p>
        </Card>
      )}

      {error && (
        <Card className="p-5 border-destructive/50 bg-destructive/5">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Analyse fehlgeschlagen</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              {fehlerListe && <div className="mt-3">{fehlerListe}</div>}
              <Button size="sm" variant="outline" className="mt-3 gap-1" onClick={startAnalysis}>
                Erneut versuchen
              </Button>
            </div>
          </div>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <Card className={fehlgeschlagen.length > 0
            ? "p-5 border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10"
            : "p-5 border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/5"}>
            <div className="flex items-start gap-3 mb-4">
              {fehlgeschlagen.length > 0
                ? <AlertCircle className="h-5 w-5 text-[hsl(var(--warning))] flex-shrink-0 mt-0.5" />
                : <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] flex-shrink-0 mt-0.5" />}
              <div>
                <p className={`text-sm font-semibold ${fehlgeschlagen.length > 0 ? "text-foreground" : "text-[hsl(var(--success))]"}`}>
                  {fehlgeschlagen.length > 0
                    ? `${gelesen} von ${gesamtVersucht} Dokumenten gelesen, ${fehlgeschlagen.length} nicht`
                    : "Analyse erfolgreich abgeschlossen"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Die folgenden Daten wurden extrahiert und können in die Folgeseiten übernommen werden.
                </p>
              <p className="text-[10px] text-muted-foreground mt-1.5 bg-muted/40 rounded px-2 py-1">
                ✅ Alle eingegebenen Daten in den Folgeseiten bleiben auch bei Tab-Wechsel gespeichert, bis das Objekt angelegt wurde.
              </p>
              </div>
            </div>

            {fehlerListe && <div className="mb-4">{fehlerListe}</div>}

            {result.erkannte_dokumente && result.erkannte_dokumente.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold mb-2">Erkannte Dokumente</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.erkannte_dokumente.map((doc, index) => (
                    <Badge key={index} variant="outline" className="text-[10px] gap-1">
                      <FileText className="h-2.5 w-2.5" />
                      {DOC_TYPE_LABELS[doc.typ] || doc.typ}
                      <span className="text-muted-foreground">({doc.dateiname})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {result.titel && <SummaryItem label="Titel" value={result.titel} />}
              {result.adresse && <SummaryItem label="Adresse" value={`${result.adresse}, ${result.plz || ""} ${result.ort || ""}`} />}
              {result.baujahr && <SummaryItem label="Baujahr" value={String(result.baujahr)} />}
              {result.objektart && <SummaryItem label="Objektart" value={result.objektart} />}
              {result.gesamtWohnflaeche && <SummaryItem label="Gesamtwohnfläche" value={`${fmt(result.gesamtWohnflaeche)} m²`} />}
              {result.anzahlWohneinheiten && <SummaryItem label="Wohneinheiten" value={String(result.anzahlWohneinheiten)} />}
              {result.zustand && <SummaryItem label="Zustand" value={result.zustand} />}
              {result.energieeffizienzklasse && <SummaryItem label="Energieklasse" value={result.energieeffizienzklasse} />}
              {result.endenergiebedarf && <SummaryItem label="Endenergiebedarf" value={`${fmt(result.endenergiebedarf)} kWh/(m²·a)`} />}
              {result.heizungsart && <SummaryItem label="Heizung" value={result.heizungsart} />}
              {result.energietraeger && <SummaryItem label="Energieträger" value={result.energietraeger} />}
              {result.leerstandsquote != null && <SummaryItem label="Leerstandsquote" value={`${result.leerstandsquote}%`} />}
            </div>

            {result.wohnungen && result.wohnungen.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold mb-2">{result.wohnungen.length} Wohnungen erkannt</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-1.5 pr-3">WE</th>
                        <th className="py-1.5 pr-3">Etage</th>
                        <th className="py-1.5 pr-3">Zi.</th>
                        <th className="py-1.5 pr-3">Fläche</th>
                        <th className="py-1.5 pr-3">Kaufpreis</th>
                        <th className="py-1.5 pr-3">Miete</th>
                        <th className="py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.wohnungen.map((wohnung, index) => (
                        <tr key={index} className="border-b border-muted/30">
                          <td className="py-1.5 pr-3 font-medium">{wohnung.weNr}</td>
                          <td className="py-1.5 pr-3">{wohnung.etage}</td>
                          <td className="py-1.5 pr-3">{wohnung.zimmer || "–"}</td>
                          <td className="py-1.5 pr-3">{fmt(wohnung.groesse)} m²</td>
                          <td className="py-1.5 pr-3">{wohnung.kaufpreis ? fmtEur(wohnung.kaufpreis) : "–"}</td>
                          <td className="py-1.5 pr-3">{wohnung.kaltmiete ? fmtEur(wohnung.kaltmiete) : "–"}</td>
                          <td className="py-1.5">
                            <Badge variant={wohnung.vermietet !== false ? "default" : "destructive"} className="text-[9px]">
                              {wohnung.vermietet !== false ? "Vermietet" : "Leerstand"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {result.highlights && result.highlights.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold mb-2">Erkannte Highlights</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.highlights.map((highlight, index) => (
                    <Badge key={index} variant="secondary" className="text-[10px]">{highlight}</Badge>
                  ))}
                </div>
              </div>
            )}

            {result.sanierungen && result.sanierungen.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-semibold mb-2">Sanierungen</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {result.sanierungen.map((sanierung, index) => (
                    <div key={index} className="text-xs flex items-center gap-2 py-1">
                      <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                      <span className="font-medium">{sanierung.bereich}</span>
                      <span className="text-muted-foreground">– {sanierung.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                resetAnalysisTask();
                setFiles([]);
                setSlotFiles({});
                handleCloudUrlChange("");
              }}
            >
              Verwerfen & neu hochladen
            </Button>
            <Button className="flex-1 gap-2" onClick={() => onAnalyseComplete(result, allFiles, cloudUrl || undefined)}>
              <ArrowRight className="h-4 w-4" /> Daten übernehmen & weiter
            </Button>
          </div>

          <Card className="p-3 bg-muted/30">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[10px] text-muted-foreground">
                Die KI-extrahierten Daten werden in die Folgeseiten übernommen. Bitte prüfe alle Angaben sorgfältig,
                bevor du das Objekt final anlegst. Du kannst Werte jederzeit manuell anpassen.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background rounded-lg p-2 border">
      <p className="text-muted-foreground text-[10px]">{label}</p>
      <p className="font-medium truncate">{value}</p>
    </div>
  );
}
