import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Was eine fremde Seite zu sehen bekommt, wenn sie das Portal einbettet.
 *
 * Statt des Portals nur dieser Hinweis, damit dort nichts Klickbares liegt,
 * das jemand unbemerkt überdecken könnte. Wann er erscheint, entscheidet
 * `lib/einbettungsschutz.ts`.
 *
 * Deutsch und Englisch stehen untereinander: Es kann ein Kunde sein, und die
 * Kundensprache aus dem Profil ist hier nicht bekannt, weil vor jeder
 * Anmeldung geprüft wird.
 */
export function EinbettungsHinweis({ adresse = window.location.href }: { adresse?: string }) {
  let host = adresse;
  try {
    host = new URL(adresse).host;
  } catch {
    host = adresse;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md p-6">
        <div className="mb-3 h-1 w-8 bg-primary" />
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-lg font-bold">Das MOREImmo Portal öffnet sich nur im eigenen Fenster</h1>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Diese Seite wurde in eine andere Website eingebettet. Zu deinem Schutz zeigen wir das Portal
          dort nicht an, denn eine fremde Seite könnte sonst deine Klicks abfangen.
        </p>
        <Button asChild className="w-full">
          <a href={adresse} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden />
            In neuem Fenster öffnen
          </a>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Falls sich nichts öffnet, gib <span className="font-medium text-foreground">{host}</span> direkt
          in die Adresszeile deines Browsers ein.
        </p>

        <div lang="en" className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">The MOREImmo portal only opens in its own window</p>
          <p className="mb-2">
            This page has been embedded in another website. To protect you, the portal is not shown
            there, because a third party page could otherwise intercept your clicks.
          </p>
          <a href={adresse} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
            Open in new window
          </a>
          <span>. If nothing opens, type {host} into your browser's address bar.</span>
        </div>
      </Card>
    </main>
  );
}
