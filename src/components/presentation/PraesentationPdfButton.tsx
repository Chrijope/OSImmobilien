import { useState, RefObject, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { exportPraesentationAsPdf } from "@/lib/praesentationPdfExport";

const BUCKET = "praesentation-pdfs";
/**
 * Version-Bump erhöhen, sobald sich Präsentationsinhalt/-layout ändert –
 * dann werden alte gecachte PDFs verworfen und einmalig neu erzeugt.
 */
const PDF_VERSION = "v2";

/**
 * Fest hinterlegte Section-Reihenfolge pro Präsentation.
 * Damit erzeugt der PDF-Export IMMER die gleichen Abschnitte in der gleichen
 * Reihenfolge, unabhängig davon, welche Sections im DOM zusätzlich vorhanden sind.
 */
export const PRAESENTATION_PRESETS = {
  neubau: [
    "hero", "agenda", "warum", "problem", "ansatz", "erwartung", "strategien",
    "modelle", "vergleich", "rechnung", "steuerfrei", "portfolio", "prozess",
    "vertrauen", "referenzen", "objekt-referenzen", "faq", "kontakt",
  ],
  wg: [
    "hero", "ueber", "konzept", "marktlage", "modelle", "grundriss", "coliving",
    "logik", "nachfrage", "impressionen", "rechnung", "halten", "verkauf",
    "steuerwirkung", "hebel", "prozess", "stimmen", "faq", "kontakt",
  ],
} as const;

export type PraesentationPreset = keyof typeof PRAESENTATION_PRESETS;

interface Props {
  containerRef: RefObject<HTMLElement>;
  title: string;
  subtitle?: string;
  filename?: string;
  sectionSelector?: string;
  /** Feste Section-Konfiguration für die Präsentation. */
  preset?: PraesentationPreset;
  /** Wartezeit pro Section, damit Animationen komplett durchlaufen (ms). */
  animationSettleMs?: number;
}

/**
 * Fixierter „PDF herunterladen"-Button oben rechts auf einer Präsentationsseite.
 * Nutzt den `containerRef` als Root für die Section-Erfassung.
 */
export function PraesentationPdfButton({
  containerRef, title, subtitle, filename, sectionSelector, preset, animationSettleMs,
}: Props) {
  const [status, setStatus] = useState<"checking" | "ready" | "generating" | "downloading">("checking");
  const { toast } = useToast();
  const remoteUrlRef = useRef<string | null>(null);
  const startedRef = useRef(false);
  const localBlobRef = useRef<Blob | null>(null);
  const localNameRef = useRef<string | null>(null);

  const storagePath = preset
    ? `${preset}/${PDF_VERSION}/${filename || `MOREImmo_${preset}.pdf`}`
    : null;

  const getFreshSignedUrl = async () => {
    if (!storagePath) return null;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 60 * 60);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  };

  // Beim Öffnen: prüfen ob die fertige PDF im Storage liegt. Falls ja → sofort
  // downloadbereit. Falls nein → still "ready", der Klick generiert on-demand
  // und lädt die fertige PDF für alle nachfolgenden Nutzer in den Cache hoch.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const run = async () => {
      if (storagePath) {
        try {
          const url = await getFreshSignedUrl();
          if (url) remoteUrlRef.current = url;
        } catch (e) {
          console.warn("[PDF-Download] Cache-Prüfung fehlgeschlagen:", e);
        }
      }
      setStatus("ready");
    };

    const timer = window.setTimeout(run, 150);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerRemoteDownload = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const triggerBlobDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    triggerRemoteDownload(url, name);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const generateAndCache = async (): Promise<{ blob: Blob; name: string }> => {
    if (!containerRef.current) throw new Error("Präsentation ist noch nicht geladen");
    const result = await exportPraesentationAsPdf({
      root: containerRef.current,
      title,
      subtitle,
      filename,
      sectionSelector,
      animationSettleMs,
      sectionIds: preset ? [...PRAESENTATION_PRESETS[preset]] : undefined,
      returnBlob: true,
    }) as { blob: Blob; filename: string };
    localBlobRef.current = result.blob;
    localNameRef.current = result.filename;
    /* Fire-and-forget upload für spätere Nutzer.
       Seit dem 18.09.2026 darf nur die Vorlagenpflege (admin, inhaber) in
       diesen Ablageort schreiben, siehe Migration
       20260918170000_praesentations_pdfs_nur_pflege_schreibt.sql. Für alle
       anderen schlägt der Upload ab jetzt fehl, und das ist in Ordnung: Die
       PDF ist zu diesem Zeitpunkt längst erzeugt und wird gleich
       heruntergeladen. Gefüllt wird der Zwischenspeicher beim ersten Aufruf
       durch die Vorlagenpflege, danach lesen ihn alle. */
    if (storagePath) {
      supabase.storage
        .from(BUCKET)
        .upload(storagePath, result.blob, { contentType: "application/pdf", upsert: true })
        .then(({ error }) => {
          if (error) console.info("[PDF-Cache] Nicht abgelegt, die PDF wurde lokal erzeugt:", error.message);
        });
    }
    return { blob: result.blob, name: result.filename };
  };

  const handle = async () => {
    setStatus("downloading");
    try {
      // 1) Vorhandene Cache-URL nutzen
      if (storagePath) {
        const url = (await getFreshSignedUrl()) || remoteUrlRef.current;
        if (url) {
          remoteUrlRef.current = url;
          const name = filename || `MOREImmo_${preset ?? "praesentation"}.pdf`;
          triggerRemoteDownload(url, name);
          toast({ title: "PDF heruntergeladen ✓" });
          setStatus("ready");
          return;
        }
      }
      // 2) Kein Cache → on-demand generieren
      if (localBlobRef.current && localNameRef.current) {
        triggerBlobDownload(localBlobRef.current, localNameRef.current);
        toast({ title: "PDF heruntergeladen ✓" });
        setStatus("ready");
        return;
      }
      setStatus("generating");
      toast({ title: "PDF wird erstellt…", description: "Die Präsentation wird einmalig gerendert." });
      const { blob, name } = await generateAndCache();
      triggerBlobDownload(blob, name);
      toast({ title: "PDF heruntergeladen ✓" });
      setStatus("ready");
    } catch (e) {
      console.error("[PDF-Download] Fehler:", e);
      toast({ title: "PDF-Erstellung fehlgeschlagen", description: String(e), variant: "destructive" });
      setStatus("ready");
    }
  };

  const isBusy = status === "downloading" || status === "generating" || status === "checking";
  const label =
    status === "generating" ? "Wird erstellt…" :
    status === "downloading" ? "Download…" :
    status === "checking" ? "Prüfe…" :
    "PDF herunterladen";
  const icon =
    isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> :
    <Download className="h-4 w-4" />;

  return (
    <Button
      onClick={handle}
      disabled={isBusy}
      size="sm"
      variant="outline"
      className="gap-2 rounded-full print:hidden"
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}