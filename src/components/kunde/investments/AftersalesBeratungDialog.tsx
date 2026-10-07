import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Smartphone, CheckCircle2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { stelleKundenspracheSicher } from "@/lib/kundenSprache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { aftersalesSignaturAnlegen, aftersalesVpUnterschreiben } from "@/lib/aftersalesSignatur";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  investmentId: string;
  kontaktId: string;
  vpName: string;
  kundeName: string;
  kundeEmail?: string;
  /** Vorausgefüllte Daten aus Kontakt / Investment */
  kundeAnschrift?: string;
  objektAdresse?: string;
  kaufdatum?: string;
  initialFormData?: Record<string, any>;
  onCompleted?: () => void;
}

/** Leistungen wortgleich aus dem OS Immobilien-Aftersales-Beratungsdokument */
const LEISTUNGEN = [
  { key: "mieterwechsel", label: "Begleitung beim ersten Mieterwechsel. Die objekteigene Hausverwaltung (sofern beauftragt) unterstützt zusätzlich beim Übergabeprotokoll" },
  { key: "mieterhoehung", label: "Beratung zu Mieterhöhungen nach §§ 558, 559 BGB. Sie wird von der Hausverwaltung übernommen, die Sie hierzu laufend betreut" },
  { key: "hausverwaltung", label: "Unterstützung bei Hausverwaltungs-Anfragen" },
  { key: "verkauf10jahre", label: "Vorbereitung auf den steuerfreien Verkauf nach 10 Jahren" },
  { key: "ehegattenschaukel", label: "Beratung zur Ehegattenschaukel oder Übertragung an Kinder" },
  { key: "empfehlungsprogramm", label: "Aufnahme ins Empfehlungsprogramm (Provision bei Weiterempfehlung)" },
];

const KONTAKT_RHYTHMUS = [
  "1. Quartal nach Kauf: Statusgespräch (Vermietung, Mietzahlung, Banküberweisungen)",
  "Halbjährlich: Performance-Review (Cashflow, Mietsteigerung, Marktwert-Entwicklung)",
  "Jährlich: Steuer-Update und Strategie-Anpassung",
  "Ad hoc: Bei jeder Frage erreichbar via E-Mail, Telefon, Portal-Chat",
  "Bitte gehen Sie proaktiv auf Ihren Ansprechpartner zu, sobald Sie eine dieser Unterstützungen wünschen. Wir melden uns ansonsten zu den oben genannten Terminen.",
];

type Phase = "form" | "vp-sign" | "sending" | "sent";

export function AftersalesBeratungDialog({
  open, onOpenChange, investmentId, kontaktId, vpName, kundeName, kundeEmail,
  kundeAnschrift, objektAdresse, kaufdatum, initialFormData, onCompleted,
}: Props) {
  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState<Record<string, any>>(() => initialFormData || {
    kundeName,
    kundeAnschrift: kundeAnschrift || "",
    vpName,
    objektAdresse: objektAdresse || "",
    kaufdatum: kaufdatum || "",
    leistungen: Object.fromEntries(LEISTUNGEN.map(c => [c.key, true])),
    ort: "",
    datum: new Date().toLocaleDateString("de-DE"),
    bemerkungen: "",
  });
  const [signatureToken, setSignatureToken] = useState<string | null>(null);
  const [mobileSignature, setMobileSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mobileSignatureUrl = useMemo(() => {
    if (!signatureToken || typeof window === "undefined") return "";
    return `${window.location.origin}/signatur?token=${signatureToken}&type=aftersales_vp&mobile=1`;
  }, [signatureToken]);

  const anyChecked = useMemo(
    () => LEISTUNGEN.some(c => form.leistungen?.[c.key]),
    [form],
  );
  const partnerOk = !!(form.kundeName || "").trim() && !!(form.vpName || "").trim() && !!(form.objektAdresse || "").trim() && !!(form.kaufdatum || "").trim();
  const ortOk = !!(form.ort || "").trim() && !!(form.datum || "").trim();
  const formValid = anyChecked && partnerOk && ortOk;

  const handleMobileSignatureReceived = useCallback((dataUrl: string) => {
    setMobileSignature(dataUrl);
    toast.success("Unterschrift vom Smartphone empfangen");
  }, []);

  // Realtime channel for mobile signature
  useEffect(() => {
    if (!signatureToken || phase !== "vp-sign") return;
    const ch = supabase.channel(`sig-${signatureToken}`)
      .on("broadcast", { event: "signature" }, (payload) => {
        const dataUrl = (payload as any)?.payload?.dataUrl;
        if (typeof dataUrl === "string" && dataUrl.startsWith("data:image")) {
          handleMobileSignatureReceived(dataUrl);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [signatureToken, phase, handleMobileSignatureReceived]);

  const handleProceedToSign = async () => {
    if (!formValid) {
      toast.error("Bitte Vertragspartner-Felder, Ort/Datum und mindestens eine Leistung ausfüllen.");
      return;
    }
    setSubmitting(true);
    try {
      // Beide Anfragen (Partner und Kunde) legt der Server an, er prüft auch,
      // ob der Kunde zu dir gehört (Migration 20260929200000).
      const vpToken = await aftersalesSignaturAnlegen({
        investmentId, kontaktId, vpName, kundeName, kundeEmail, formular: form,
      });

      setSignatureToken(vpToken);
      setPhase("vp-sign");
    } catch (e: any) {
      console.error(e);
      toast.error("Signatur konnte nicht initialisiert werden");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitVpSignature = async () => {
    if (!mobileSignature || !signatureToken) return;
    setSubmitting(true);
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
    await stelleKundenspracheSicher(kontaktId);
    setPhase("sending");
    try {
      const signature = mobileSignature;
      // Partner-Anfrage als unterschrieben markieren, serverseitig.
      await aftersalesVpUnterschreiben(signatureToken, signature);

      // Finalize (writes meta, triggers kunde-email)
      const { error } = await supabase.functions.invoke("finalize-aftersales-beratung", {
        body: {
          investmentId, kontaktId, phase: "vp",
          signatureToken, formData: form, signature, signerName: vpName,
        },
      });
      if (error) throw error;
      setPhase("sent");
      toast.success(`Beratungsdokument an ${kundeName} versendet`);
      onCompleted?.();
    } catch (e: any) {
      console.error(e);
      toast.error("Versand fehlgeschlagen");
      setPhase("vp-sign");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={NUR_POPUP_OVERLAY} className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aftersales-Beratungsdokument</DialogTitle>
          <DialogDescription>
            {phase === "form" && "Alle Punkte mit dem Kunden besprochen? Dann ausfüllen und unterzeichnen."}
            {phase === "vp-sign" && `${vpName ? vpName + ", b" : "B"}itte unterzeichnen Sie das Dokument bequem per Smartphone. Scannen Sie dazu den QR-Code.`}
            {phase === "sent" && `Versendet an ${kundeEmail || kundeName}.`}
          </DialogDescription>
        </DialogHeader>

        {phase === "form" && (
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground">
              Pflicht-Dokument zwischen Vertriebspartner und Kunde nach Verkaufsabschluss.
              Dieses Dokument dokumentiert das vereinbarte Aftersales-Programm im Anschluss an den Immobilienkauf bei OS Immobilien.
            </p>

            <Card className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Vertragspartner</Label>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ab-kunde" className="text-xs">Kunde</Label>
                  <Input id="ab-kunde" value={form.kundeName || ""} onChange={(e) => setForm(f => ({ ...f, kundeName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ab-anschrift" className="text-xs">Anschrift</Label>
                  <Input id="ab-anschrift" value={form.kundeAnschrift || ""} onChange={(e) => setForm(f => ({ ...f, kundeAnschrift: e.target.value }))} placeholder="Straße, PLZ Ort" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ab-vp" className="text-xs">Vertriebspartner</Label>
                  <Input id="ab-vp" value={form.vpName || ""} onChange={(e) => setForm(f => ({ ...f, vpName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ab-obj" className="text-xs">Objekt-Adresse</Label>
                  <Input id="ab-obj" value={form.objektAdresse || ""} onChange={(e) => setForm(f => ({ ...f, objektAdresse: e.target.value }))} placeholder="Objekt, Straße, Ort" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="ab-kauf" className="text-xs">Kaufdatum / Notartermin</Label>
                  <Input id="ab-kauf" value={form.kaufdatum || ""} onChange={(e) => setForm(f => ({ ...f, kaufdatum: e.target.value }))} placeholder="TT.MM.JJJJ" />
                </div>
              </div>
            </Card>

            <Card className="p-4 space-y-2">
              <Label className="text-sm font-semibold">Aftersales-Leistungen</Label>
              <p className="text-[11px] text-muted-foreground">Bitte mit dem Kunden besprechen und anhaken.</p>
              {LEISTUNGEN.map(c => (
                <div key={c.key} className="flex items-start gap-2">
                  <Checkbox
                    id={c.key}
                    className="mt-0.5"
                    checked={!!form.leistungen?.[c.key]}
                    onCheckedChange={(v) => setForm(f => ({
                      ...f, leistungen: { ...f.leistungen, [c.key]: !!v },
                    }))}
                  />
                  <Label htmlFor={c.key} className="text-sm font-normal cursor-pointer leading-snug">{c.label}</Label>
                </div>
              ))}
            </Card>

            <Card className="p-4 space-y-2 bg-muted/30">
              <Label className="text-sm font-semibold">Kontakt-Rhythmus</Label>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                {KONTAKT_RHYTHMUS.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </Card>

            <Card className="p-4 space-y-3">
              <Label className="text-sm font-semibold">Ort & Datum der Beratung</Label>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="ab-ort" className="text-xs">Ort</Label>
                  <Input id="ab-ort" value={form.ort || ""} onChange={(e) => setForm(f => ({ ...f, ort: e.target.value }))} placeholder="z. B. München" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ab-datum" className="text-xs">Datum</Label>
                  <Input id="ab-datum" value={form.datum || ""} onChange={(e) => setForm(f => ({ ...f, datum: e.target.value }))} placeholder="TT.MM.JJJJ" />
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="ab-bemerkungen" className="text-xs">Bemerkungen (optional)</Label>
              <Textarea
                id="ab-bemerkungen"
                rows={3}
                value={form.bemerkungen || ""}
                onChange={(e) => setForm(f => ({ ...f, bemerkungen: e.target.value }))}
                placeholder="Individuelle Vereinbarungen oder Notizen"
              />
            </div>
          </div>
        )}

        {phase === "vp-sign" && (
          <div className="space-y-4">
            <Card className="p-6 flex flex-col items-center justify-center text-center">
              <Label className="text-base font-semibold mb-3 flex items-center gap-2">
                <Smartphone className="h-5 w-5" /> Per Smartphone unterschreiben
              </Label>
              {mobileSignatureUrl && (
                <div className="p-3 bg-white rounded border">
                  <QRCodeSVG value={mobileSignatureUrl} size={200} />
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-3 max-w-sm">
                Scannen Sie den QR-Code mit Ihrem Smartphone und unterzeichnen Sie das Dokument dort. Ihre Unterschrift erscheint hier automatisch.
              </p>
              {mobileSignature && (
                <div className="mt-4 w-full max-w-sm">
                  <Label className="text-xs text-muted-foreground mb-1 block">Empfangene Unterschrift</Label>
                  <div className="border rounded bg-white p-2 flex items-center justify-center">
                    <img src={mobileSignature} alt="Unterschrift" className="max-h-32 object-contain" />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setMobileSignature(null)} className="mt-2">
                    Neu unterschreiben
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}

        {phase === "sending" && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Wird versendet …
          </div>
        )}

        {phase === "sent" && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
            <p className="font-medium">Erfolgreich versendet</p>
            <p className="text-sm text-muted-foreground">
              {kundeName} erhält jetzt eine E-Mail mit dem Signatur-Link.
            </p>
          </div>
        )}

        <DialogFooter>
          {phase === "form" && (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button disabled={!formValid || submitting} onClick={handleProceedToSign}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Weiter zur Unterschrift
              </Button>
            </>
          )}
          {phase === "vp-sign" && (
            <>
              <Button variant="ghost" onClick={() => setPhase("form")}>Zurück</Button>
              <KundenspracheHinweis kontaktId={kontaktId} className="self-center" />
              <Button disabled={!mobileSignature || submitting} onClick={handleSubmitVpSignature}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Unterzeichnen & an Kunden senden
              </Button>
            </>
          )}
          {phase === "sent" && <Button onClick={() => onOpenChange(false)}>Schließen</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AftersalesBeratungDialog;