import { Link } from "react-router-dom";
import { ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * Hinweis im Kundenportal: „Schütze dein Konto mit der Zwei-Faktor-Anmeldung“.
 *
 * Er sperrt nichts. „Später“ und das Kreuz schließen ihn für
 * `HINWEIS_PAUSE_TAGE` (siehe `src/lib/kundenZweiFaktor.ts`). Wann er
 * erscheint, entscheidet `KundenMfaGuard`.
 */
export function KundenZweiFaktorHinweis({ onSchliessen }: { onSchliessen: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="region"
      aria-label={t("portal.tfa.hint_title")}
      className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm min-w-0">
          <p className="font-semibold text-foreground">{t("portal.tfa.hint_title")}</p>
          <p className="text-muted-foreground text-xs mt-0.5">{t("portal.tfa.hint_text")}</p>
        </div>
        <button
          type="button"
          onClick={onSchliessen}
          className="sm:hidden text-muted-foreground hover:text-foreground p-1 -m-1 rounded"
          aria-label={t("portal.tfa.hint_close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button asChild size="sm" className="flex-1 sm:flex-none">
          <Link to="/kunde/einstellungen?tab=sicherheit">{t("portal.tfa.hint_setup")}</Link>
        </Button>
        <Button size="sm" variant="ghost" className="flex-1 sm:flex-none" onClick={onSchliessen}>
          {t("portal.tfa.hint_later")}
        </Button>
        <button
          type="button"
          onClick={onSchliessen}
          className="hidden sm:inline-flex text-muted-foreground hover:text-foreground p-1 rounded"
          aria-label={t("portal.tfa.hint_close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
