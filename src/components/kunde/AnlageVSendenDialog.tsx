import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Paperclip, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/contexts/UserContext";
import { istEmail } from "@/lib/buchungAuswahl";
import { anlageVDateiname, type AnlageVAufstellung } from "@/lib/anlageVExport";
import { erzeugeAnlageVPdfBase64 } from "@/lib/anlageVPdf";
import { portalSprache } from "@/i18n/portalSprache";

/**
 * Versand der Anlage-V-Aufstellung als echter PDF-Anhang an den Steuerberater.
 *
 * Das PDF entsteht beim Senden im Browser (gleiche Erzeugung wie der
 * Download-Knopf) und geht als Base64 an die Edge Function send-anlage-v.
 * Sie verschickt die Mail im Namen des Kunden, Antworten des Steuerberaters
 * landen per Reply-To direkt beim Kunden. Ersetzt den frueheren
 * mailto-Entwurf, bei dem der Kunde die Datei selbst anhaengen musste.
 *
 * Die zuletzt genutzte Steuerberater-Adresse wird je Nutzer im localStorage
 * gemerkt (nur die Adresse, kein Inhalt).
 */

interface Props {
  /** null = Dialog geschlossen halten, Aufstellung noch nicht gebaut. */
  aufstellung: AnlageVAufstellung | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const speicherSchluessel = (userId: string | undefined) =>
  `anlagev.steuerberaterEmail.${userId || "anon"}`;

export function AnlageVSendenDialog({ aufstellung, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { authUser } = useUser();
  const [email, setEmail] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [beruehrt, setBeruehrt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  // Beim Oeffnen die zuletzt genutzte Adresse vorbelegen.
  useEffect(() => {
    if (!open) return;
    setBeruehrt(false);
    setNachricht("");
    try {
      setEmail(window.localStorage.getItem(speicherSchluessel(authUser?.id)) || "");
    } catch {
      setEmail("");
    }
  }, [open, authUser?.id]);

  if (!aufstellung) return null;

  const dateiname = anlageVDateiname(aufstellung.bezeichnung, aufstellung.jahr);
  const emailGueltig = istEmail(email);

  const senden = async () => {
    setBeruehrt(true);
    if (!emailGueltig || laeuft) return;
    setLaeuft(true);
    try {
      const { base64, dateiname: datei } = await erzeugeAnlageVPdfBase64(aufstellung);
      const { error } = await supabase.functions.invoke("send-anlage-v", {
        body: {
          empfaengerEmail: email.trim(),
          nachricht: nachricht.trim() || undefined,
          pdfBase64: base64,
          dateiname: datei,
          investmentBezeichnung: aufstellung.bezeichnung,
          jahr: aufstellung.jahr,
        },
      });
      if (error) {
        // Die Function liefert deutsche Fehlermeldungen (Validierung,
        // Rate-Limit); wenn erreichbar, dem Kunden direkt zeigen. Auf
        // Englisch gilt die allgemeine Meldung, sonst stünde dort Deutsch.
        let meldung = "";
        if (portalSprache() === "de") {
          try {
            const ctx = await (error as { context?: Response }).context?.json?.();
            meldung = typeof ctx?.error === "string" ? ctx.error : "";
          } catch {
            // Antwort nicht lesbar, allgemeine Meldung unten.
          }
        }
        toast.error(meldung || t("portal.steuer.senden.fehler", "Der Versand ist fehlgeschlagen. Bitte versuch es später erneut."));
        return;
      }
      try {
        window.localStorage.setItem(speicherSchluessel(authUser?.id), email.trim());
      } catch {
        // Merken ist Komfort, kein Muss.
      }
      toast.success(t("portal.steuer.senden.erfolg", "Die Aufstellung wurde an {{email}} versendet.", { email: email.trim() }));
      onOpenChange(false);
    } catch (fehler) {
      console.error("Anlage-V-Versand fehlgeschlagen", fehler);
      toast.error(t("portal.steuer.senden.fehler", "Der Versand ist fehlgeschlagen. Bitte versuch es später erneut."));
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!laeuft) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("portal.steuer.senden.title", "Per E-Mail an den Steuerberater senden")}</DialogTitle>
          <DialogDescription>
            {t("portal.steuer.senden.description", "Die Aufstellung wird als PDF-Anhang verschickt. Antworten gehen direkt an deine E-Mail-Adresse.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="anlagev-empfaenger">
              {t("portal.steuer.senden.email_label", "E-Mail-Adresse des Steuerberaters")} *
            </Label>
            <Input
              id="anlagev-empfaenger"
              type="email"
              value={email}
              placeholder={t("portal.steuer.senden.email_placeholder")}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setBeruehrt(true)}
              disabled={laeuft}
              aria-invalid={beruehrt && !emailGueltig}
            />
            {beruehrt && !emailGueltig && (
              <p className="text-xs text-destructive">
                {t("portal.steuer.senden.email_invalid", "Bitte eine gültige E-Mail-Adresse angeben.")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anlagev-nachricht">
              {t("portal.steuer.senden.nachricht_label", "Persönliche Nachricht (optional)")}
            </Label>
            <Textarea
              id="anlagev-nachricht"
              value={nachricht}
              onChange={(e) => setNachricht(e.target.value.slice(0, 2000))}
              rows={3}
              disabled={laeuft}
              placeholder={t("portal.steuer.senden.nachricht_placeholder", "Wird im Text der E-Mail mitgeschickt.")}
            />
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              {t("portal.steuer.senden.anhang_hinweis", "Angehängt wird {{datei}} (Veranlagungsjahr {{jahr}}). Die Aufstellung dient der Vorbereitung der Anlage V und ersetzt keine Steuerberatung.", {
                datei: dateiname, jahr: aufstellung.jahr,
              })}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={laeuft}>
            {t("portal.steuer.senden.abbrechen", "Abbrechen")}
          </Button>
          <Button variant="brand" onClick={senden} disabled={laeuft || (beruehrt && !emailGueltig)} className="gap-1.5">
            {laeuft
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Send className="h-3.5 w-3.5" />}
            {laeuft
              ? t("portal.steuer.senden.senden_laeuft", "Wird gesendet")
              : t("portal.steuer.senden.senden", "Senden")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
