import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { ExposeData, StandortDataPdf } from "@/lib/exposePdf";
import { toast } from "sonner";
import { FileText, Download, Eye, RefreshCw, Upload, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface ExposeSectionProps {
  objektId: string;
  objektTitel: string;
  isEditor: boolean;
  onPdfCreated?: () => void;
  onPdfUrlChange?: (url: string | null) => void;
  onLoadingChange?: (loading: boolean) => void;
  onBulkWohnungsExpose?: (onProgress?: (current: number, total: number) => void) => Promise<void>;
  hasWohnungen?: boolean;
  wohnungenCount?: number;
  /** Falls bereits ein Exposé-Dokument im Objektordner hochgeladen wurde (manuell), wird dieses als bestehend angesehen */
  uploadedExposeDocUrl?: string | null;
  /** Cached Exposé-PDF info aus objekte.meta.exposePdf – ermöglicht sofortige Anzeige ohne Storage-Roundtrip */
  cachedExposePdf?: { url?: string; lastGenerated?: string | null } | null;
}

export function ExposeSection({ objektId, objektTitel, isEditor, onPdfCreated, onPdfUrlChange, onLoadingChange, onBulkWohnungsExpose, hasWohnungen, wohnungenCount = 0, uploadedExposeDocUrl, cachedExposePdf }: ExposeSectionProps) {
  // Initialer Status synchron aus Cache/Props ableiten – KEIN Loading-Flicker mehr.
  const initial = (() => {
    if (cachedExposePdf?.url) return { status: "exists" as const, url: cachedExposePdf.url, lastGenerated: cachedExposePdf.lastGenerated || null };
    if (uploadedExposeDocUrl) return { status: "exists" as const, url: uploadedExposeDocUrl, lastGenerated: null };
    return { status: "none" as const, url: null as string | null, lastGenerated: null as string | null };
  })();

  const [status, setStatus] = useState<"none" | "exists">(initial.status);
  const [pdfUrl, setPdfUrl] = useState<string | null>(initial.url);
  const [generating, setGenerating] = useState(false);
  const [generatingProgress, setGeneratingProgress] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(initial.lastGenerated);

  useEffect(() => {
    // Sofortige Synchronisation, wenn Props sich ändern (z.B. Objekt-Wechsel)
    if (cachedExposePdf?.url) {
      setPdfUrl(cachedExposePdf.url);
      setLastGenerated(cachedExposePdf.lastGenerated || null);
      setStatus("exists");
    } else if (uploadedExposeDocUrl) {
      setPdfUrl(uploadedExposeDocUrl);
      setStatus("exists");
    }
    // Hintergrund-Sync mit Storage – aktualisiert leise, niemals Loading-Anzeige
    void syncFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objektId, uploadedExposeDocUrl, cachedExposePdf?.url]);

  useEffect(() => {
    onPdfUrlChange?.(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    // Kein Loading-State mehr – immer false melden für Abwärtskompatibilität
    onLoadingChange?.(false);
  }, []);

  const syncFromStorage = async () => {
    try {
      const { data } = await supabase.storage
        .from("objekt-medien")
        .list(`expose/${objektId}`, { limit: 1, sortBy: { column: "created_at", order: "desc" } });

      if (data && data.length > 0) {
        const file = data[0];
        const { data: urlData } = supabase.storage
          .from("objekt-medien")
          .getPublicUrl(`expose/${objektId}/${file.name}`);
        // Nur aktualisieren falls anders – verhindert Re-Renders
        if (urlData.publicUrl !== pdfUrl) {
          setPdfUrl(urlData.publicUrl);
          setLastGenerated(file.created_at || null);
          setStatus("exists");
          // Cache in DB schreiben für nächsten Aufruf
          persistExposeMeta(urlData.publicUrl, file.created_at || null);
        }
      }
    } catch {
      /* still fall back to cached/uploaded url */
    }
  };

  const persistExposeMeta = async (url: string, ts: string | null) => {
    try {
      const { data: row } = await supabase.from("objekte").select("meta").eq("id", objektId).maybeSingle();
      const meta = (row as any)?.meta || {};
      const next = { ...meta, exposePdf: { url, lastGenerated: ts } };
      await (supabase as any).from("objekte").update({ meta: next }).eq("id", objektId);
    } catch { /* non-critical */ }
  };

  const saveExposePdf = async (fileName: string, file: Blob, accessToken: string) => {
    const form = new FormData();
    form.append("objektId", objektId);
    form.append("fileName", fileName);
    form.append("file", file, fileName.split("/").pop() || "expose.pdf");

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-expose-pdf`, {
      method: "POST",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: form,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) throw new Error(body?.error || "Exposé konnte nicht gespeichert werden");
    return body as { url: string; lastGenerated: string };
  };

  const fetchExposeData = async (): Promise<ExposeData | null> => {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-expose?id=${objektId}`,
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const d = await res.json();
      if (d.error || !d.objekt) {
        const { data: objekt } = await supabase.from("objekte").select("*").eq("id", objektId).maybeSingle();
        if (!objekt) return null;
        const [bilder, wohnungen] = await Promise.all([
          supabase.from("objekt_bilder").select("*").eq("objekt_id", objektId).order("reihenfolge"),
          supabase.from("wohnungen" as any).select("*").eq("objekt_id", objektId),
        ]);
        return { objekt, bilder: bilder.data || [], wohnungen: (wohnungen.data || []) as any[] };
      }
      return d as ExposeData;
    } catch {
      return null;
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGeneratingProgress("Objektdaten werden geladen...");
    try {
      const data = await fetchExposeData();
      if (!data) {
        toast.error("Bitte vervollständige zuerst das Online-Exposé", {
          description: "Objektdaten konnten nicht geladen werden.",
        });
        setGenerating(false);
        return;
      }

      const obj = data.objekt;
      if (!obj.titel || (!obj.adresse && !obj.ort)) {
        toast.error("Bitte vervollständige zuerst das Online-Exposé", {
          description: "Mindestens Titel und Adresse/Ort werden benötigt.",
        });
        setGenerating(false);
        return;
      }

      setGeneratingProgress("Standortanalyse wird erstellt...");
      toast.info("Exposé wird generiert (inkl. Standortanalyse)...", { duration: 5000 });

      // Nur die gespeicherte Analyse. Seit dem 23.09.2026 misst der Import
      // einmal, und `generate-standortanalyse` misst nur noch für Admin und
      // Inhaber mit Anmeldung. Ohne Analyse entsteht das PDF ohne Standort.
      const standort: StandortDataPdf | undefined = (obj as any).meta?.standortanalyse || undefined;

      setGeneratingProgress("Objekt-Exposé PDF wird erstellt...");
      const { generateExposePdf } = await import("@/lib/exposePdf");
      const pdfBlob = await generateExposePdf({ ...data, standort });
      // Storage-Pfade müssen ASCII-sicher sein – Umlaute/Sonderzeichen entfernen
      const safeTitle = objektTitel
        .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
        .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-zA-Z0-9\-_]/g, "_");
      const fileName = `expose/${objektId}/expose-${safeTitle}.pdf`;

      // Session sicherstellen, damit der JWT mit dem Storage-Upload mitgeht
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.access_token) {
        toast.error("Sitzung abgelaufen – bitte neu anmelden und erneut versuchen.");
        setGenerating(false);
        setGeneratingProgress(null);
        return;
      }

      // Token ggf. proaktiv refreshen, damit der Storage-Request einen frischen
      // JWT bekommt – sonst kann is_internal_role(auth.uid()) false werden.
      try {
        const exp = sess.session.expires_at ? sess.session.expires_at * 1000 : 0;
        if (!exp || exp - Date.now() < 60_000) {
          await supabase.auth.refreshSession();
        }
      } catch { /* refresh optional */ }

      // Rolle des aktuellen Users prüfen – falls keine interne Rolle, gleich
      // sauber abbrechen mit klarer Meldung statt RLS-Fehler.
      const uid = sess.session.user?.id;
      if (uid) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", uid);
        const allowed = new Set([
          "admin","inhaber","vertriebspartner","hausverwaltung","buchhaltung",
          "setterin","objektpartner","finanzierungspartner","individuell",
          "testaccount","marketing","hr","backoffice","vertriebsleiter",
          "versicherungsexperte",
        ]);
        const hasInternal = (roles || []).some(r => allowed.has(r.role as string));
        if (!hasInternal) {
          console.error("[Exposé] User hat keine interne Rolle", { uid, roles });
          toast.error("Keine Berechtigung zum Speichern des Exposés.", {
            description: "Dein Account hat aktuell keine interne Rolle. Bitte neu anmelden oder Admin kontaktieren.",
          });
          setGenerating(false);
          setGeneratingProgress(null);
          return;
        }
      }

      const saved = await saveExposePdf(fileName, pdfBlob, sess.session.access_token);
      setPdfUrl(saved.url);
      setLastGenerated(saved.lastGenerated);
      setStatus("exists");
      toast.success("Exposé erfolgreich generiert!", { description: "Das PDF wurde gespeichert." });
      onPdfCreated?.();

      // Also generate Wohnungsexposés
      if (onBulkWohnungsExpose && hasWohnungen) {
        setGeneratingProgress(`Wohnungsexposés werden erstellt (0/${wohnungenCount})...`);
        try {
          await onBulkWohnungsExpose((current, total) => {
            setGeneratingProgress(`Wohnungsexposé ${current}/${total} wird erstellt...`);
          });
        } catch { /* handled inside */ }
      }
    } catch (err: any) {
      toast.error("Fehler bei der PDF-Generierung: " + (err.message || "Unbekannter Fehler"));
    }
    setGeneratingProgress(null);
    setGenerating(false);
  };

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Bitte nur PDF-Dateien hochladen.");
      return;
    }

    setGenerating(true);
    try {
      const fileName = `expose/${objektId}/expose-custom.pdf`;

      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session?.access_token) {
        toast.error("Sitzung abgelaufen – bitte neu anmelden und erneut versuchen.");
        setGenerating(false);
        return;
      }

      const saved = await saveExposePdf(fileName, file, sess.session.access_token);
      setPdfUrl(saved.url);
      setLastGenerated(saved.lastGenerated);
      setStatus("exists");
      toast.success("Exposé ersetzt!");
      onPdfCreated?.();
    } catch (err: any) {
      toast.error("Fehler: " + err.message);
    }
    setGenerating(false);
    e.target.value = "";
  };

  const handleDownload = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `Expose-${objektTitel}.pdf`;
    a.target = "_blank";
    a.click();
  };

  // Validation check items
  const [validationData, setValidationData] = useState<{items: {label: string; ok: boolean}[]} | null>(null);

  useEffect(() => {
    if (status !== "none") return;
    fetchExposeData().then(data => {
      if (!data) return;
      const obj = data.objekt;
      setValidationData({
        items: [
          { label: "Objektbilder", ok: data.bilder.length > 0 || !!obj.bild_url },
          { label: "Beschreibung", ok: !!(obj.beschreibung && obj.beschreibung.length > 10) },
          { label: "Adresse / Ort", ok: !!(obj.adresse || obj.ort) },
          { label: "Wohneinheiten", ok: data.wohnungen.length > 0 },
          { label: "Preisinformationen", ok: data.wohnungen.some(w => (w as any).vk_gesamt > 0) },
        ],
      });
    });
  }, [status, objektId]);

  // Kein Loading-State mehr – Status ist initial bereits "none" oder "exists".

  // When PDF exists, show compact admin section with regenerate
  if (status === "exists") {
    if (!isEditor) return null;
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Exposé (PDF)
          </h4>
          <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Erstellt
          </Badge>
        </div>
        {lastGenerated ? (
          <p className="text-[10px] text-muted-foreground">
            Zuletzt generiert: {new Date(lastGenerated).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        ) : uploadedExposeDocUrl && (
          <p className="text-[10px] text-muted-foreground">Manuell hochgeladenes Exposé-PDF</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-xs" onClick={handleDownload}>
            <Download className="h-3 w-3 mr-2" /> Herunterladen
          </Button>
          <Button size="sm" variant="outline" className="text-xs" onClick={() => pdfUrl && window.open(pdfUrl, "_blank")}>
            <Eye className="h-3 w-3 mr-2" /> Ansehen
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="text-xs" disabled={generating}>
                {generating ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                Neu generieren
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Exposé neu generieren?</AlertDialogTitle>
                <AlertDialogDescription>
                  Das bestehende Exposé-PDF wird ersetzt und neu erstellt. Dabei werden KI-Credits für die Standortanalyse verbraucht.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={handleGenerate}>Neu generieren</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <label className="cursor-pointer">
            <Button size="sm" variant="outline" className="text-xs pointer-events-none" disabled={generating}>
              <Upload className="h-3 w-3 mr-2" /> Eigenes PDF hochladen
            </Button>
            <input type="file" accept=".pdf" className="hidden" onChange={handleReplace} />
          </label>
        </div>
        {generating && generatingProgress && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
            <span>{generatingProgress}</span>
          </div>
        )}
      </Card>
    );
  }

  // Status === "none" - not yet created
  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-bold flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Exposé (PDF)
        </h4>
        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
          <Clock className="h-3 w-3 mr-1" /> Nicht erstellt
        </Badge>
      </div>

      {validationData && (
        <div className="space-y-1.5 bg-muted/50 rounded-lg p-3">
          {validationData.items.map(item => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              {item.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
              )}
              <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
              {!item.ok && <span className="text-[10px] text-amber-500 ml-auto">Fehlt</span>}
            </div>
          ))}
        </div>
      )}

      {isEditor && (
        <>
          <Button onClick={handleGenerate} disabled={generating} className="w-full">
            {generating ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wird generiert...</>
            ) : (
              <><FileText className="h-4 w-4 mr-2" /> {hasWohnungen ? "Objekt- & Wohnungsexposés erstellen" : "Exposé erstellen"}</>
            )}
          </Button>
          {generating && generatingProgress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
              <span>{generatingProgress}</span>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
