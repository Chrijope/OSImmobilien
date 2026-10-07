import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, CheckCircle2, Loader2, Copy } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { createMobileScanSession, subscribeMobileScanSession, type MobileScanBlock, type MobileScanSession } from "@/lib/mobileScanSessions";
import { getPublicBaseUrl } from "@/lib/publicUrl";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
// In den Effekten i18n.t statt t: t als Abhängigkeit würde beim Sprachwechsel
// eine neue Scan-Sitzung anlegen.
import i18n from "@/i18n";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kontaktId: string;
  investmentId?: string | null;
  person?: number;
  block: MobileScanBlock;
  docList?: string[];
  onUpload?: (upload: { docTyp: string; fileUrl: string; pages: number }) => Promise<void> | void;
}

export function MobileScanQRDialog({ open, onOpenChange, kontaktId, investmentId, person = 1, block, docList, onUpload }: Props) {
  const { t } = useTranslation();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [scanUrl, setScanUrl] = useState<string>("");
  const [session, setSession] = useState<MobileScanSession | null>(null);
  const [uploadCount, setUploadCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const onUploadRef = useRef(onUpload);
  const uploadCountRef = useRef(0);
  useEffect(() => { onUploadRef.current = onUpload; }, [onUpload]);
  useEffect(() => { uploadCountRef.current = uploadCount; }, [uploadCount]);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setQrDataUrl("");
      setScanUrl("");
      setUploadCount(0);
      return;
    }
    setCreating(true);
    createMobileScanSession({ kontaktId, investmentId, person, block, docList })
      .then(async (s) => {
        const url = `${getPublicBaseUrl()}/mobile-scan/${s.token}`;
        setScanUrl(url);
        setSession(s);
        const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 1 });
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        console.error("Scan-Session konnte nicht erstellt werden:", err);
        toast.error(i18n.t("portal.mobilescan.create_failed"));
      })
      .finally(() => setCreating(false));
  }, [open, kontaktId, investmentId, person, block, docList?.join("|")]);

  useEffect(() => {
    if (!session?.token) return;
    const unsubscribe = subscribeMobileScanSession(session.token, async (next) => {
      setSession(next);
      const uploads = (next.meta?.uploads as any[]) || [];
      // Process newly added uploads
      const prev = uploadCountRef.current;
      if (uploads.length > prev) {
        const newUploads = uploads.slice(prev);
        for (const up of newUploads) {
          try {
            await onUploadRef.current?.(up);
          } catch (err) {
            console.error("Upload-Übernahme fehlgeschlagen:", err);
          }
        }
        uploadCountRef.current = uploads.length;
        setUploadCount(uploads.length);
        toast.success(i18n.t("portal.mobilescan.received", { count: newUploads.length }));
      }
      if (next.status === "abgeschlossen") {
        toast.success(i18n.t("portal.mobilescan.completed"));
      }
    });
    return unsubscribe;
  }, [session?.token]);

  const copyLink = async () => {
    if (!scanUrl) return;
    await navigator.clipboard.writeText(scanUrl);
    toast.success(t("portal.mobilescan.link_copied"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" /> {t("portal.mobilescan.title")}
          </DialogTitle>
          <DialogDescription>{t("portal.mobilescan.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {creating || !qrDataUrl ? (
            <div className="h-[320px] w-[320px] flex items-center justify-center bg-muted rounded-lg">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <img src={qrDataUrl} alt={t("portal.mobilescan.qr_alt")} className="rounded-lg border bg-white p-2" />
          )}

          <div className="text-xs text-muted-foreground text-center">
            {t("portal.mobilescan.valid_uploaded")} <strong className="text-foreground">{uploadCount}</strong>
          </div>

          {scanUrl && (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={copyLink}>
                <Copy className="h-3 w-3" /> {t("portal.mobilescan.copy_link")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs gap-1.5"
                onClick={() => window.open(scanUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="h-3 w-3" /> {t("portal.mobilescan.test_in_tab")}
              </Button>
            </div>
          )}
          {scanUrl && (
            <p className="text-[10px] text-muted-foreground text-center max-w-[280px]">
              {t("portal.mobilescan.test_tip")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            {uploadCount > 0 && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />}
            {t("portal.mobilescan.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}