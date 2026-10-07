import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, Lock, FileSignature, Send, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AftersalesBeratungDialog } from "./AftersalesBeratungDialog";
import { stelleKundenspracheSicher } from "@/lib/kundenSprache";
import { signaturLinkErinnern } from "@/lib/aftersalesSignatur";
import { toast } from "sonner";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";

interface Props {
  investmentId: string;
  kontaktId: string;
  kundeName: string;
  kundeEmail?: string;
  vpName: string;
  notarDatum?: string; // ISO or DD.MM.YYYY
  notarUhrzeit?: string;
  kundeAnschrift?: string;
  objektAdresse?: string;
  meta?: Record<string, any>;
  onChanged?: () => void;
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  if (/^\d{2}\.\d{2}\.\d{4}/.test(s)) {
    const [d, m, y] = s.split(".").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Aftersales-Beratung Karte für VP/Admin.
 * Sichtbarkeit: immer (Lock-State entscheidet)
 * Freischaltung: Notartermin-Datum <= heute
 * Status: gesperrt | offen | wartet_auf_kunde | abgeschlossen
 */
export function AftersalesBeratungCard({
  investmentId, kontaktId, kundeName, kundeEmail, vpName, notarDatum, kundeAnschrift, objektAdresse, meta, onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const ab = (meta?.aftersalesBeratung as Record<string, any>) || {};
  const status: "gesperrt" | "offen" | "wartet_auf_kunde" | "abgeschlossen" = (() => {
    if (ab.kundeSignedAt || ab.status === "abgeschlossen") return "abgeschlossen";
    if (ab.vpSignedAt || ab.status === "wartet_auf_kunde") return "wartet_auf_kunde";
    const notar = parseDate(notarDatum);
    if (!notar) return "gesperrt";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    notar.setHours(0, 0, 0, 0);
    return notar.getTime() <= today.getTime() ? "offen" : "gesperrt";
  })();

  const handleResend = async () => {
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
    // Die Mail nimmt die Sprache danach aus dem Kundenprofil.
    await stelleKundenspracheSicher(kontaktId);
    // Den Link baut der Server, der Token bleibt dort (Migration 20260929200000).
    const fehler = await signaturLinkErinnern({ art: "aftersales_kunde", investmentId, vpName });
    if (fehler) toast.error(fehler);
    else toast.success(`Link erneut an ${kundeName} gesendet`);
  };

  const handleDownloadPdf = async () => {
    if (!ab.pdfPath) return;
    try {
      const { data, error } = await supabase.storage
        .from("unterlagen")
        .createSignedUrl(ab.pdfPath, 60 * 10);
      if (error || !data?.signedUrl) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-sm">Aftersales-Beratungsdokument</h3>
        </div>
        {status === "gesperrt" && (
          <Badge variant="outline" className="text-[10px]">
            <Lock className="h-3 w-3 mr-1" /> Wird am Notartermin freigeschaltet
          </Badge>
        )}
        {status === "offen" && (
          <Badge className="text-[10px] bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30">
            <Clock className="h-3 w-3 mr-1" /> Offen
          </Badge>
        )}
        {status === "wartet_auf_kunde" && (
          <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">
            <Clock className="h-3 w-3 mr-1" /> Wartet auf Kunde
          </Badge>
        )}
        {status === "abgeschlossen" && (
          <Badge className="text-[10px] bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Abgeschlossen
          </Badge>
        )}
      </div>

      {status === "gesperrt" && (
        <p className="text-xs text-muted-foreground">
          Dieses Dokument füllt der Vertriebspartner am Tag des Notartermins gemeinsam mit dem Kunden aus.
        </p>
      )}

      {status === "offen" && (
        <>
          <p className="text-xs text-muted-foreground">
            Bitte Beratungsdokument ausfüllen, unterzeichnen und an {kundeName} senden.
          </p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <FileSignature className="h-4 w-4 mr-2" /> Beratungsdokument ausfüllen
          </Button>
        </>
      )}

      {status === "wartet_auf_kunde" && (
        <>
          <p className="text-xs text-muted-foreground">
            Du hast unterzeichnet am {ab.vpSignedAt ? new Date(ab.vpSignedAt).toLocaleString("de-DE") : "—"}.
            {kundeEmail ? ` Der Kunde wurde per E-Mail an ${kundeEmail} eingeladen.` : ""}
          </p>
          {kundeEmail && (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={handleResend}>
                <Send className="h-4 w-4 mr-2" /> Erinnerung erneut senden
              </Button>
              <KundenspracheHinweis kontaktId={kontaktId} />
            </div>
          )}
        </>
      )}

      {status === "abgeschlossen" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Vom Kunden unterzeichnet am {ab.kundeSignedAt ? new Date(ab.kundeSignedAt).toLocaleString("de-DE") : "—"}.
          </p>
          {ab.pdfPath && (
            <div className="flex items-center gap-2 bg-muted/40 rounded-lg p-2">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <span className="text-xs truncate flex-1">Beratungsdokument (unterzeichnet)</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleDownloadPdf}>
                <Download className="h-3 w-3 mr-1" /> PDF
              </Button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground">
            Wird automatisch im Kundenordner unter „Beratungsdokument" abgelegt und für den Kunden im Kundenportal sichtbar gemacht.
          </p>
        </div>
      )}

      <AftersalesBeratungDialog
        key={refreshKey}
        open={open}
        onOpenChange={setOpen}
        investmentId={investmentId}
        kontaktId={kontaktId}
        vpName={vpName}
        kundeName={kundeName}
        kundeEmail={kundeEmail}
        kundeAnschrift={kundeAnschrift}
        objektAdresse={objektAdresse}
        kaufdatum={notarDatum}
        initialFormData={ab.formData}
        onCompleted={() => { setRefreshKey(k => k + 1); onChanged?.(); }}
      />
    </Card>
  );
}

export default AftersalesBeratungCard;