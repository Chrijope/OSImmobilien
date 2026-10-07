import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MAIL_ABSENDER } from "@/lib/mailAbsender";
import { cn } from "@/lib/utils";

/**
 * Der Hinweis auf den Spam-Ordner, direkt unter der Danke-Botschaft nach einer
 * Bewerbung.
 *
 * Warum: Unsere Eingangsmail landet bei manchen Anbietern im Spam. Markiert der
 * Bewerber sie als „Kein Spam“, kommen die folgenden Mails zuverlässiger an.
 *
 * Die Adresse ist bewusst kein mailto-Link, denn dorthin soll niemand
 * schreiben. Sie bleibt markierbar, damit man sie in die Suche des Postfachs
 * kopieren kann. `role="note"` statt des `role="alert"` der Vorlage: Der
 * Hinweis ist eine Randnotiz und soll den Screenreader nicht unterbrechen.
 */
export function SpamHinweis({ className }: { className?: string }) {
  return (
    <Alert
      role="note"
      data-testid="spam-hinweis"
      className={cn("border-primary/20 bg-primary/5 text-left [&>svg]:text-primary", className)}
    >
      <Info className="h-4 w-4" aria-hidden />
      <AlertDescription className="leading-relaxed">
        Unsere Mail kommt von{" "}
        <span className="select-all whitespace-nowrap font-medium">{MAIL_ABSENDER}</span>. Schau bitte auch im
        Spam-Ordner nach und markiere sie als ‚Kein Spam‘.
      </AlertDescription>
    </Alert>
  );
}
