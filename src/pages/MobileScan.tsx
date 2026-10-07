import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import {
  appendMobileScanUpload,
  completeMobileScanSession,
  getMobileScanSession,
  type MobileScanSession,
} from "@/lib/mobileScanSessions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import moreimmoLogo from "@/assets/moreimmo-logo.png";
import { MobileScanHochgeladen, type ScanUploadEintrag } from "@/components/MobileScanHochgeladen";
import {
  Camera,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Plus,
  Trash2,
  Upload,
  FileImage,
  RotateCcw,
  Sun,
  Contrast,
  Crop as CropIcon,
  Pencil,
  X,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { texteFuer, useLinkSprache } from "@/lib/seitenSprache";
import {
  MOBILE_SCAN_TEXTE,
  STANDARD_DOKUMENTE_P1 as BONITAET_DOCS_P1,
  STANDARD_DOKUMENTE_P2 as BONITAET_DOCS_P2,
  dokumentnameAnzeige,
  mitText,
  type MobileScanTexte,
} from "./mobileScanTexte";

type Mode = "color" | "bw";
type View = "intro" | "list" | "capture" | "preview";

interface CapturedPage {
  id: string;
  dataUrl: string; // processed
  rawDataUrl: string;
}

export default function MobileScan() {
  const { token } = useParams<{ token: string }>();
  /*
   * Sprache des Kunden (Kundensprache, Etappe 3, S7): aus dem Kundenprofil
   * hinter der Sitzung, `?lang=` ueberschreibt nur die Anzeige, sonst
   * Deutsch. Die Dokumentnamen bleiben als Unterlagentyp deutsch gespeichert,
   * nur ihre Anzeige wird uebersetzt (`dokumentnameAnzeige`).
   */
  const { sprache, bereit: spracheBereit } = useLinkSprache("mobile_scan", token);
  const t = texteFuer(MOBILE_SCAN_TEXTE, sprache);
  const anzeige = (doc: string) => dokumentnameAnzeige(doc, sprache);
  const [session, setSession] = useState<MobileScanSession | null>(null);
  const [loading, setLoading] = useState(true);
  // Der Schluessel, nicht der Text: Die Sitzung kann schon geladen sein,
  // bevor die Sprache feststeht.
  const [error, setError] = useState<"fehlerNichtGefunden" | "fehlerAbgelaufen" | "fehlerLaden" | null>(null);

  const [view, setView] = useState<View>("list");
  const [started, setStarted] = useState(false);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [mode, setMode] = useState<Mode>("color");
  const [uploading, setUploading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set());
  // Nur die Uploads dieser Sitzung, für die Liste „Hochgeladen“. uploadedDocs
  // enthält zusätzlich, was schon vorher im Investment lag.
  const [sitzungsUploads, setSitzungsUploads] = useState<ScanUploadEintrag[]>([]);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [sessionDone, setSessionDone] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load session
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const s = await getMobileScanSession(token);
        if (!s) {
          setError("fehlerNichtGefunden");
        } else if (new Date(s.expires_at) < new Date()) {
          setError("fehlerAbgelaufen");
        } else {
          setSession(s);
          const uploaded = new Set<string>(((s.meta?.uploads as any[]) || []).map((u: any) => u.docTyp));
          // Bereits im Investment hochgeladene/freigegebene Unterlagen mergen,
          // damit sie hier ebenfalls als „erledigt" angezeigt werden.
          try {
            const { data: existing } = await supabase.rpc("get_mobile_scan_uploaded_docs", { _token: token });
            if (Array.isArray(existing)) {
              existing.forEach((d: string) => d && uploaded.add(d));
            }
          } catch (e) {
            console.warn("get_mobile_scan_uploaded_docs failed", e);
          }
          setUploadedDocs(uploaded);
          const bisher: unknown[] = Array.isArray(s.meta?.uploads) ? s.meta.uploads : [];
          setSitzungsUploads(
            bisher
              .map((u) => (u as { docTyp?: unknown } | null)?.docTyp)
              .filter((docTyp): docTyp is string => typeof docTyp === "string" && docTyp !== "")
              .map((docTyp, i) => ({ id: `sitzung-${i}`, docTyp, status: "fertig" as const })),
          );
        }
      } catch (err) {
        console.error(err);
        setError("fehlerLaden");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Start camera when entering capture view
  useEffect(() => {
    if (view !== "capture") {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [view]);

  // Re-process pages when mode changes
  useEffect(() => {
    if (pages.length === 0) return;
    Promise.all(pages.map(async (p) => ({ ...p, dataUrl: await processImage(p.rawDataUrl, mode) })))
      .then(setPages)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Kamera Fehler:", err);
      toast.error(t.kameraFehler);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function processImage(dataUrl: string, m: Mode): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 1600;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);

        // Auto contrast/brightness boost for paper-like clarity
        const data = ctx.getImageData(0, 0, w, h);
        const d = data.data;
        if (m === "bw") {
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            const v = gray > 150 ? 255 : gray < 90 ? 0 : Math.round(((gray - 90) / 60) * 255);
            d[i] = v; d[i + 1] = v; d[i + 2] = v;
          }
        } else {
          // Mild contrast boost + slight saturation/whiten
          const c = 1.15;
          for (let i = 0; i < d.length; i += 4) {
            for (let k = 0; k < 3; k++) {
              const v = d[i + k];
              const nv = (v - 128) * c + 128 + 6;
              d[i + k] = nv < 0 ? 0 : nv > 255 ? 255 : nv;
            }
          }
        }
        ctx.putImageData(data, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = dataUrl;
    });
  }

  async function capturePage() {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(v, 0, 0);
    const raw = canvas.toDataURL("image/jpeg", 0.92);
    const processed = await processImage(raw, mode);
    setPages((p) => [...p, { id: crypto.randomUUID(), dataUrl: processed, rawDataUrl: raw }]);
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const allPdf = files.every((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!allPdf) {
      toast.error(t.nurPdf);
      e.target.value = "";
      return;
    }
    if (files.length === 1) {
      await uploadDirectPdf(files[0]);
    } else {
      await uploadMergedPdfs(files);
    }
    e.target.value = "";
  }

  function fileToDataUrl(f: File): Promise<string> {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  async function uploadDirectPdf(file: File) {
    if (!token || !activeDoc) return;
    setUploading(true);
    const eintragId = uploadBeginnen(activeDoc);
    try {
      const path = `mobile-scans/${token}/${safeName(activeDoc)}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("unterlagen").upload(path, file, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      await appendMobileScanUpload(token, { docTyp: activeDoc, fileUrl: path, pages: 1 });
      setUploadedDocs((s) => new Set(s).add(activeDoc));
      uploadErgebnis(eintragId, "fertig");
      toast.success(t.pdfHochgeladen);
      resetCapture();
    } catch (err: any) {
      console.error(err);
      uploadErgebnis(eintragId, "fehler");
      toast.error(mitText(t.uploadFehler, { fehler: err?.message || "" }));
    } finally {
      setUploading(false);
    }
  }

  async function uploadMergedPdfs(files: File[]) {
    if (!token || !activeDoc) return;
    setUploading(true);
    const eintragId = uploadBeginnen(activeDoc);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const merged = await PDFDocument.create();
      let totalPages = 0;
      for (const f of files) {
        const bytes = await f.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const copied = await merged.copyPages(src, src.getPageIndices());
        copied.forEach((p) => merged.addPage(p));
        totalPages += src.getPageCount();
      }
      const out = await merged.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const path = `mobile-scans/${token}/${safeName(activeDoc)}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("unterlagen").upload(path, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      await appendMobileScanUpload(token, { docTyp: activeDoc, fileUrl: path, pages: totalPages });
      setUploadedDocs((s) => new Set(s).add(activeDoc));
      uploadErgebnis(eintragId, "fertig");
      toast.success(mitText(t.zusammengefuehrt, { zahl: files.length }));
      resetCapture();
    } catch (err: any) {
      console.error(err);
      uploadErgebnis(eintragId, "fehler");
      toast.error(mitText(t.zusammenfuehrenFehler, { fehler: err?.message || "" }));
    } finally {
      setUploading(false);
    }
  }

  // Legt eine Zeile „Wird hochgeladen“ an. Ein früherer Fehlversuch für
  // dasselbe Dokument verschwindet dabei, damit die Liste nicht vollläuft.
  function uploadBeginnen(docTyp: string): string {
    const id = crypto.randomUUID();
    setSitzungsUploads((liste) => [
      ...liste.filter((e) => !(e.status === "fehler" && e.docTyp === docTyp)),
      { id, docTyp, status: "laedt" },
    ]);
    return id;
  }

  function uploadErgebnis(id: string, status: "fertig" | "fehler") {
    setSitzungsUploads((liste) => liste.map((e) => (e.id === id ? { ...e, status } : e)));
  }

  function safeName(s: string) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
  }

  async function generateAndUploadPdf() {
    if (!token || !activeDoc || pages.length === 0) return;
    setUploading(true);
    const eintragId = uploadBeginnen(activeDoc);
    try {
      const pdf = new jsPDF({ unit: "mm", format: "a4" });
      const pageW = 210;
      const pageH = 297;
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        if (i > 0) pdf.addPage();
        // fit image into page preserving aspect
        const dims = await getImageDims(p.dataUrl);
        const ratio = Math.min(pageW / (dims.w / 4), pageH / (dims.h / 4));
        const imgW = (dims.w / 4) * ratio;
        const imgH = (dims.h / 4) * ratio;
        const x = (pageW - imgW) / 2;
        const y = (pageH - imgH) / 2;
        pdf.addImage(p.dataUrl, "JPEG", x, y, imgW, imgH, undefined, "FAST");
      }
      const blob = pdf.output("blob");
      const path = `mobile-scans/${token}/${safeName(activeDoc)}_${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage.from("unterlagen").upload(path, blob, { contentType: "application/pdf" });
      if (upErr) throw upErr;
      await appendMobileScanUpload(token, { docTyp: activeDoc, fileUrl: path, pages: pages.length });
      setUploadedDocs((s) => new Set(s).add(activeDoc));
      uploadErgebnis(eintragId, "fertig");
      toast.success(t.dokumentHochgeladen);
      resetCapture();
    } catch (err: any) {
      console.error(err);
      uploadErgebnis(eintragId, "fehler");
      toast.error(mitText(t.uploadFehler, { fehler: err?.message || "" }));
    } finally {
      setUploading(false);
    }
  }

  function getImageDims(src: string): Promise<{ w: number; h: number }> {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
      img.src = src;
    });
  }

  function resetCapture() {
    setPages([]);
    setActiveDoc(null);
    setView("list");
  }

  async function handleDone() {
    if (!token) return;
    try {
      await completeMobileScanSession(token);
      toast.success(t.sitzungAbgeschlossen);
      setSessionDone(true);
    } catch (err) {
      console.error(err);
      toast.error(t.abschliessenFehler);
    }
  }

  // Auch auf die Sprache warten, damit die Seite nicht von Deutsch auf Englisch springt.
  if (loading || !spracheBereit) {
    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label={t.laedt} />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div data-lg="seite" className="min-h-screen flex items-center justify-center p-6 bg-background">
        <Card className="p-6 max-w-sm text-center">
          <p className="text-sm text-destructive font-semibold">{error ? t[error] : t.nichtVerfuegbar}</p>
        </Card>
      </div>
    );
  }

  // Bevorzugt die beim Erstellen der Sitzung übergebene dynamische Dokumentenliste
  // (enthält auch durch die Selbstauskunft zusätzlich erforderliche Unterlagen
  // für die Bankprüfung). Fällt sonst auf die statische Standardliste zurück.
  // „Selbstauskunft" ist eine digitale Unterschrift und wird nicht über das
  // Handy gescannt – daher ausgeblendet.
  const sessionDocList = Array.isArray(session.meta?.docList) ? (session.meta!.docList as string[]) : null;
  const docList = (
    sessionDocList && sessionDocList.length > 0
      ? sessionDocList
      : session.person === 2 ? BONITAET_DOCS_P2 : BONITAET_DOCS_P1
  ).filter((n) => n && !/^Selbstauskunft$/i.test(n));

  // ── Intro / Deckblatt ──
  if (!started && !sessionDone) {
    return (
      <div data-lg="seite" className="min-h-screen bg-background flex flex-col items-center justify-between p-6">
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm text-center space-y-6">
          <img src={moreimmoLogo} alt="MOREImmo" className="h-16 w-auto object-contain" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{t.titel}</h1>
            <p className="text-sm text-muted-foreground">
              {t.introText}
            </p>
          </div>
          <div data-ui="card" className="w-full rounded-lg border bg-card p-4 text-left text-xs text-muted-foreground space-y-1.5">
            {t.introPunkte.map((punkt) => <p key={punkt}>• {punkt}</p>)}
          </div>
        </div>
        <div className="w-full max-w-sm space-y-2">
          <Button className="w-full h-12 text-base" onClick={() => setStarted(true)}>
            <Camera className="h-5 w-5 mr-2" /> {t.scanStarten}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            {t.sicher}
          </p>
        </div>
      </div>
    );
  }

  // ── Done View ──
  if (sessionDone) {
    const total = docList.length;
    const done = docList.filter((d) => uploadedDocs.has(d)).length;
    const offen = total - done;
    return (
      <div data-lg="seite" className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-6 max-w-sm w-full text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-[hsl(var(--success))]/15 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{t.sitzungAbgeschlossen}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {t.fertigVor}<strong className="text-foreground">{t.inPruefung}</strong>{t.fertigNach}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-bold text-[hsl(var(--success))]">{done}</div>
              <div className="text-muted-foreground">{t.hochgeladenZahl}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className={`text-2xl font-bold ${offen > 0 ? "text-[hsl(var(--warning))]" : "text-foreground"}`}>{offen}</div>
              <div className="text-muted-foreground">{t.nochOffen}</div>
            </div>
          </div>
          {offen > 0 && (
            <p className="text-[11px] text-[hsl(var(--warning))]">
              {t.fehlenHinweis}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            {t.schliessenHinweis}
          </p>
        </Card>
      </div>
    );
  }

  // ── List View ──
  if (view === "list") {
    return (
      // Kein fest angehefteter Balken mehr: „Sitzung abschließen“ steht als
      // letztes Element im Fluss. Der Abstand unten hält die Home-Leiste des
      // iPhones frei (safe-area-inset-bottom).
      <div
        data-lg="seite"
        className="min-h-screen bg-background px-4 pt-4"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <div className="max-w-md mx-auto space-y-4">
          <header className="text-center py-4">
            <h1 className="text-xl font-bold">{t.titel}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {t.listeHinweis}
            </p>
            <p className="text-[11px] text-[hsl(var(--warning))] font-medium mt-2">
              {t.pflichtHinweis}
            </p>
          </header>

          <div className="space-y-2">
            {docList.map((doc) => {
              const done = uploadedDocs.has(doc);
              return (
                <button
                  key={doc}
                  onClick={() => { setActiveDoc(doc); setPages([]); setView("capture"); }}
                  className={`w-full text-left p-4 rounded-lg border transition-colors flex items-center gap-3 ${
                    done ? "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/30" : "bg-card hover:bg-accent border-border"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))] shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {/* Umbrechen statt abschneiden: Sonst fiele bei langen Namen gerade
                        der deutsche Fachbegriff in Klammern weg, etwa „(Lohnsteuerbescheinigung)“. */}
                    <div className="flex items-center gap-1.5">
                      <p className="min-w-0 text-sm font-medium break-words">{anzeige(doc)}</p>
                      {!done && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 px-1.5 py-0.5 rounded shrink-0">
                          {t.pflicht}
                        </span>
                      )}
                    </div>
                    {done && <p className="text-[10px] text-[hsl(var(--success))]">{t.hochgeladen}</p>}
                  </div>
                  <Camera className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>

          <MobileScanHochgeladen eintraege={sitzungsUploads} sprache={sprache} />

          {uploadedDocs.size > 0 && (
            <div className="pt-2">
              <Button className="w-full h-12 text-base" onClick={handleDone}>
                <CheckCircle2 className="h-4 w-4 mr-2" /> {mitText(t.abschliessen, { zahl: uploadedDocs.size })}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Capture View ──
  if (view === "capture") {
    return (
      <div className="fixed inset-0 bg-black flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
        <header className="bg-black/80 text-white px-4 py-3 flex items-center gap-3 safe-area-top shrink-0">
          <button onClick={resetCapture} className="text-white" aria-label={t.zurueck}>
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{activeDoc && anzeige(activeDoc)}</p>
            <p className="text-[10px] text-white/60">
              {mitText(t.naechsteAufnahme, {
                seite: activeDoc && (activeDoc === "Personalausweis" || activeDoc === "Personalausweis Person 2")
                  ? pages.length === 0
                    ? t.vorderseite
                    : pages.length === 1
                      ? t.rueckseite
                      : mitText(t.seiteN, { zahl: pages.length + 1 })
                  : mitText(t.seiteN, { zahl: pages.length + 1 }),
              })}
            </p>
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {seitenText(pages.length, t)}
          </Badge>
        </header>

        <div className="flex-1 min-h-0 relative bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          {activeDoc && (activeDoc === "Personalausweis" || activeDoc === "Personalausweis Person 2") ? (
            <>
              {/* ID-Card Rahmen (ISO/IEC 7810 ID-1: 85.60 × 53.98 mm ≈ 1.586:1) */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="relative border-2 border-white rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{ width: "min(86vw, 360px)", aspectRatio: "1.586 / 1" }}
                >
                  {/* Ecken-Marker */}
                  <span className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-[hsl(var(--success))] rounded-tl-xl" />
                  <span className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-[hsl(var(--success))] rounded-tr-xl" />
                  <span className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-[hsl(var(--success))] rounded-bl-xl" />
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-[hsl(var(--success))] rounded-br-xl" />
                </div>
              </div>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-4 py-2 rounded-full font-semibold">
                {pages.length === 0 ? t.ausweisVorderseite : pages.length === 1 ? t.ausweisRueckseite : mitText(t.seiteN, { zahl: pages.length + 1 })}
              </div>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] px-3 py-1.5 rounded-full text-center max-w-[90vw]">
                {t.ausweisRahmen}
              </div>
            </>
          ) : (
            <>
              <div className="absolute inset-0 pointer-events-none border-2 border-white/20 m-8 rounded-lg" />
              {pages.length === 0 && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[11px] px-3 py-1.5 rounded-full">
                  {t.ersteSeite}
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-black/95 text-white p-3 space-y-2 safe-area-bottom shrink-0">
          {/* Live Thumbnails der bereits aufgenommenen Seiten */}
          {pages.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {pages.map((p, idx) => (
                <div key={p.id} className="relative shrink-0">
                  <img
                    src={p.dataUrl}
                    alt={mitText(t.seiteN, { zahl: idx + 1 })}
                    className="h-16 w-12 object-cover rounded border border-white/30"
                  />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-[9px] text-center text-white py-0.5 rounded-b">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPages((all) => all.filter((x) => x.id !== p.id))}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                    aria-label={t.seiteEntfernen}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 justify-center">
            <button
              onClick={() => setMode("color")}
              className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1 ${mode === "color" ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            >
              <Sun className="h-3 w-3" /> {t.farbe}
            </button>
            <button
              onClick={() => setMode("bw")}
              className={`text-xs px-3 py-1.5 rounded-full flex items-center gap-1 ${mode === "bw" ? "bg-primary text-primary-foreground" : "bg-white/10"}`}
            >
              <Contrast className="h-3 w-3" /> {t.schwarzWeiss}
            </button>
            {pages.length > 0 && (
              <button
                onClick={() => setView("preview")}
                className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 bg-white/10"
              >
                <Eye className="h-3 w-3" /> {t.vorschauBearbeiten}
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 justify-around">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1 text-xs text-white/80"
            >
              <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
                <FileImage className="h-5 w-5" />
              </div>
              {t.pdfWaehlen}
            </button>

            <button
              onClick={capturePage}
              className="h-16 w-16 rounded-full bg-white border-4 border-white/30 active:scale-95 transition-transform"
              aria-label={t.fotoAufnehmen}
            />

            <button
              onClick={() => pages.length > 0 && generateAndUploadPdf()}
              disabled={pages.length === 0 || uploading}
              className="flex flex-col items-center gap-1 text-xs text-white/80 disabled:opacity-40"
            >
              <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center relative">
                {uploading ? (
                  <Loader2 className="h-5 w-5 text-primary-foreground animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-primary-foreground" />
                )}
                {pages.length > 0 && !uploading && (
                  <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-[hsl(var(--success))] text-[10px] font-bold text-white flex items-center justify-center">
                    {pages.length}
                  </span>
                )}
              </div>
              {uploading ? t.ladeHoch : t.fertigPdf}
            </button>
          </div>

          <p className="text-[10px] text-white/50 text-center">
            {t.pdfHinweisVor}<strong className="text-white/80">{t.inPruefung}</strong>{t.pdfHinweisNach}
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={handleFilePick}
          />
        </div>
      </div>
    );
  }

  // ── Preview View ──
  return (
    <div data-lg="seite" className="min-h-screen bg-background p-4 pb-32">
      <div className="max-w-md mx-auto space-y-4">
        <header className="flex items-center gap-3">
          <button onClick={() => setView("capture")} aria-label={t.zurueck}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-sm truncate">{activeDoc && anzeige(activeDoc)}</h2>
            <p className="text-xs text-muted-foreground">{seitenText(pages.length, t)} · {t.vorschau}</p>
          </div>
          <button onClick={() => setMode((m) => (m === "color" ? "bw" : "color"))} className="text-xs px-2 py-1 rounded bg-muted">
            {mode === "color" ? t.schwarzWeiss : t.farbe}
          </button>
        </header>

        <div className="space-y-3">
          {pages.map((p, idx) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="relative bg-muted">
                <img src={p.dataUrl} alt={mitText(t.seiteN, { zahl: idx + 1 })} className="w-full" />
                <Badge className="absolute top-2 left-2">{mitText(t.seiteN, { zahl: idx + 1 })}</Badge>
              </div>
              <div className="p-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{mitText(t.seiteN, { zahl: idx + 1 })}</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1"
                    onClick={() => setEditingPageId(p.id)}
                  >
                    <Pencil className="h-3 w-3" /> {t.bearbeiten}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive h-7 text-xs gap-1"
                    onClick={() => setPages((all) => all.filter((x) => x.id !== p.id))}
                  >
                    <Trash2 className="h-3 w-3" /> {t.entfernen}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
          <div className="max-w-md mx-auto flex gap-2">
            <Button variant="outline" onClick={() => setView("capture")} className="flex-1 gap-1">
              <Plus className="h-4 w-4" /> {t.weitereSeite}
            </Button>
            <Button onClick={generateAndUploadPdf} disabled={uploading || pages.length === 0} className="flex-1 gap-1">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {t.hochladen}
            </Button>
          </div>
        </div>
      </div>
      {editingPageId && (() => {
        const page = pages.find((x) => x.id === editingPageId);
        if (!page) return null;
        return (
          <PageEditor
            page={page}
            mode={mode}
            t={t}
            onCancel={() => setEditingPageId(null)}
            onApply={async (newRaw) => {
              const processed = await processImage(newRaw, mode);
              setPages((all) => all.map((x) => x.id === editingPageId ? { ...x, rawDataUrl: newRaw, dataUrl: processed } : x));
              setEditingPageId(null);
            }}
          />
        );
      })()}
    </div>
  );
}

/** „1 Seite“ oder „3 Seiten“ in der Sprache der Seite. */
function seitenText(zahl: number, t: MobileScanTexte): string {
  return mitText(zahl === 1 ? t.seitenEins : t.seitenMehr, { zahl });
}

// ────────────────────────────────────────────────────────────
// Per-Seite Editor: Drehen + Zuschneiden
// ────────────────────────────────────────────────────────────
interface PageEditorProps {
  page: CapturedPage;
  mode: Mode;
  onCancel: () => void;
  onApply: (newRawDataUrl: string) => void | Promise<void>;
  t: MobileScanTexte;
}

function PageEditor({ page, onCancel, onApply, t }: PageEditorProps) {
  const [rotation, setRotation] = useState(0); // 0/90/180/270
  const [crop, setCrop] = useState({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 }); // 0..1 relative
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ mode: "move" | "tl" | "tr" | "bl" | "br" | null; sx: number; sy: number; orig: typeof crop } | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = page.rawDataUrl;
  }, [page.rawDataUrl]);

  function getRel(e: React.PointerEvent | PointerEvent) {
    const el = imgRef.current!;
    const rect = el.getBoundingClientRect();
    return { x: ((e as PointerEvent).clientX - rect.left) / rect.width, y: ((e as PointerEvent).clientY - rect.top) / rect.height };
  }

  function startDrag(mode: NonNullable<NonNullable<typeof dragRef.current>["mode"]>) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      const p = getRel(e);
      dragRef.current = { mode, sx: p.x, sy: p.y, orig: { ...crop } };
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || !d.mode) return;
    const p = getRel(e);
    const dx = p.x - d.sx;
    const dy = p.y - d.sy;
    const o = d.orig;
    let nx = o.x, ny = o.y, nw = o.w, nh = o.h;
    if (d.mode === "move") {
      nx = Math.max(0, Math.min(1 - o.w, o.x + dx));
      ny = Math.max(0, Math.min(1 - o.h, o.y + dy));
    } else {
      const min = 0.1;
      if (d.mode.includes("l")) { const right = o.x + o.w; nx = Math.max(0, Math.min(right - min, o.x + dx)); nw = right - nx; }
      if (d.mode.includes("r")) { nw = Math.max(min, Math.min(1 - o.x, o.w + dx)); }
      if (d.mode.includes("t")) { const bot = o.y + o.h; ny = Math.max(0, Math.min(bot - min, o.y + dy)); nh = bot - ny; }
      if (d.mode.includes("b")) { nh = Math.max(min, Math.min(1 - o.y, o.h + dy)); }
    }
    setCrop({ x: nx, y: ny, w: nw, h: nh });
  }

  function endDrag() { dragRef.current = null; }

  async function apply() {
    if (!imgDims) return;
    setBusy(true);
    try {
      // 1. Rotate full image into canvas
      const img = new Image();
      await new Promise<void>((res) => { img.onload = () => res(); img.src = page.rawDataUrl; });
      const rot = ((rotation % 360) + 360) % 360;
      const rotated = document.createElement("canvas");
      const swap = rot === 90 || rot === 270;
      rotated.width = swap ? img.height : img.width;
      rotated.height = swap ? img.width : img.height;
      const rctx = rotated.getContext("2d")!;
      rctx.translate(rotated.width / 2, rotated.height / 2);
      rctx.rotate((rot * Math.PI) / 180);
      rctx.drawImage(img, -img.width / 2, -img.height / 2);

      // 2. Crop (relative to displayed/rotated image)
      const cx = Math.round(crop.x * rotated.width);
      const cy = Math.round(crop.y * rotated.height);
      const cw = Math.max(1, Math.round(crop.w * rotated.width));
      const ch = Math.max(1, Math.round(crop.h * rotated.height));
      const out = document.createElement("canvas");
      out.width = cw;
      out.height = ch;
      out.getContext("2d")!.drawImage(rotated, cx, cy, cw, ch, 0, 0, cw, ch);
      const newRaw = out.toDataURL("image/jpeg", 0.92);
      await onApply(newRaw);
    } finally {
      setBusy(false);
    }
  }

  // The displayed image already shows rotation via CSS transform; crop coords map to that visual frame.
  // To keep crop math simple, we render a pre-rotated preview by swapping container aspect via rotation key.
  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
      <header className="text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onCancel} className="text-white" aria-label={t.schliessen}><X className="h-5 w-5" /></button>
        <div className="flex-1">
          <p className="text-sm font-semibold">{t.editorTitel}</p>
          <p className="text-[10px] text-white/60">{t.editorUntertitel}</p>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div className="relative inline-block max-h-full max-w-full" style={{ touchAction: "none" }}>
          <img
            ref={imgRef}
            src={page.rawDataUrl}
            alt={t.editorBild}
            draggable={false}
            className="max-h-[60vh] max-w-full block select-none"
            style={{ transform: `rotate(${rotation}deg)` }}
          />
          {/* Crop overlay sits on top of the rotated image. Because rotation can be 90/270,
              and the visible bounding box of the rotated <img> changes, we cover the visible rect via a wrapper. */}
          <CropOverlay
            crop={crop}
            onMove={onPointerMove}
            onEnd={endDrag}
            startDrag={startDrag}
          />
        </div>
      </div>

      <div className="bg-black/80 text-white p-4 space-y-3">
        <div className="flex items-center justify-center gap-2">
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => setRotation((r) => (r + 270) % 360)}>
            <RotateCcw className="h-4 w-4" /> {t.links}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCcw className="h-4 w-4 -scale-x-100" /> {t.rechts}
          </Button>
          <Button variant="secondary" size="sm" className="gap-1" onClick={() => setCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })}>
            <CropIcon className="h-4 w-4" /> {t.zuruecksetzen}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onCancel}>{t.abbrechen}</Button>
          <Button className="flex-1" onClick={apply} disabled={busy || !imgDims}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.uebernehmen}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CropOverlay({
  crop,
  startDrag,
  onMove,
  onEnd,
}: {
  crop: { x: number; y: number; w: number; h: number };
  startDrag: (mode: "move" | "tl" | "tr" | "bl" | "br") => (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onEnd: () => void;
}) {
  const style = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  } as React.CSSProperties;
  const handle = "absolute h-5 w-5 bg-primary border-2 border-white rounded-full -m-2.5";
  return (
    <div
      className="absolute inset-0"
      onPointerMove={onMove}
      onPointerUp={onEnd}
      onPointerCancel={onEnd}
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute border-2 border-primary bg-primary/10"
        style={style}
        onPointerDown={startDrag("move")}
      >
        <div className={`${handle} left-0 top-0`} onPointerDown={startDrag("tl")} />
        <div className={`${handle} right-0 top-0`} onPointerDown={startDrag("tr")} />
        <div className={`${handle} left-0 bottom-0`} onPointerDown={startDrag("bl")} />
        <div className={`${handle} right-0 bottom-0`} onPointerDown={startDrag("br")} />
      </div>
    </div>
  );
}