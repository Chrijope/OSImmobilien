import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Sparkles } from "lucide-react";
import {
  getPortalStep,
  getNextStepRoute,
  getNextStepAbschnitt,
  portalAbschnittId,
  investmentAbschnittRoute,
} from "@/lib/portalCopy";
import { useAbschnittHervorheben } from "@/hooks/useAbschnittHervorheben";
import { useTranslation } from "react-i18next";

interface Props {
  pipelineStufe?: string | null;
  /** Override für CTA-Text */
  ctaText?: string;
  /** Override für Beschreibung */
  description?: string;
  /** Optionales Investment-Label (z. B. Objektname), wird oben als Badge angezeigt */
  investmentLabel?: string;
  /** Investment, zu dessen Phasen-Kästchen der Knopf springt. */
  investmentId?: string;
}

/**
 * Prominente "Dein nächster Schritt"-Card.
 * - Der Aufruf ist die eine orange Hauptaktion der Investment-Seite
 *   (`btn-brand`, wie `variant="brand"` im CRM; Entscheidung 25.09.2026)
 * - Kontextueller Text aus portalCopy (i18n)
 * - Gibt Kunden klares Erwartungsmanagement -> Geborgenheits-Gefühl
 */
export function NextStepCard({ pipelineStufe, ctaText, description, investmentLabel, investmentId }: Props) {
  const { t } = useTranslation();
  const { hervorheben } = useAbschnittHervorheben();
  const step = getPortalStep(pipelineStufe);
  const abschnitt = getNextStepAbschnitt(pipelineStufe);
  // Mit Ziel: Tiefenlink auf das Kästchen. Er greift, wenn der Kasten einmal
  // woanders steht als die Kästchen, und beim Öffnen in einem neuen Tab.
  // Ohne Ziel bleibt es beim bisherigen Verweis.
  const route = abschnitt && investmentId
    ? investmentAbschnittRoute(investmentId, abschnitt)
    : getNextStepRoute(pipelineStufe);
  if (step.key === "fertig") return null;

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!abschnitt) return;
    // Strg-, Befehls- oder Mittelklick öffnet wie gewohnt einen neuen Tab.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Steht das Kästchen auf dieser Seite, wird nur dorthin gesprungen.
    // Sonst läuft der Verweis normal weiter.
    if (hervorheben(portalAbschnittId(abschnitt))) e.preventDefault();
  };

  return (
    <Link
      to={route}
      onClick={handleClick}
      className="portal-next-step group relative block p-5 sm:p-6 overflow-hidden"
    >
      <div className="flex items-start gap-4 sm:gap-5">
        <div
          className="hidden sm:flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/8 text-primary"
          style={{ background: "hsl(var(--primary) / 0.08)" }}
          aria-hidden
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[11px] uppercase tracking-[0.22em] text-[hsl(var(--portal-akzent-deep))] font-semibold">
              {t("portal.header.next_step", "Als Nächstes")}
            </div>
            {investmentLabel && (
              <span className="text-[11px] uppercase tracking-[0.18em] font-semibold px-2 py-0.5 rounded-full bg-[hsl(var(--portal-akzent-deep)/0.1)] text-[hsl(var(--portal-akzent-deep))] truncate max-w-[260px]">
                {investmentLabel}
              </span>
            )}
          </div>
          <h3 className="mt-1 text-lg sm:text-xl font-medium text-foreground leading-snug">
            {description || step.next}
          </h3>
        </div>
        <div
          className="btn-brand hidden sm:inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium shrink-0"
        >
          {ctaText || t("portal.next_step.cta", "Jetzt fortfahren")}
          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
      <div className="btn-brand sm:hidden mt-4 inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-medium w-full justify-center">
        {ctaText || t("portal.next_step.cta", "Jetzt fortfahren")}
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}