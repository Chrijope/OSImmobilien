import { PORTAL_STEPS, getPortalStepIndex } from "@/lib/portalCopy";
import { useTranslation } from "react-i18next";

interface Props {
  pipelineStufe?: string | null;
  className?: string;
}

/**
 * Dezenter Fortschrittsbalken: „Schritt 3 von 10 – Bonität".
 * Kein Pipeline-Wording, nur die freundliche Stationsbezeichnung.
 */
export function PortalProgressBar({ pipelineStufe, className }: Props) {
  const { t } = useTranslation();
  const idx = getPortalStepIndex(pipelineStufe);
  const total = PORTAL_STEPS.length;
  const current = PORTAL_STEPS[idx];
  const pct = Math.round(((idx + 1) / total) * 100);

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between mb-2 text-sm">
        <span className="text-foreground/80">
          {t("portal.progress.step")} <span className="font-medium">{idx + 1}</span> {t("portal.progress.of")} {total}
          <span className="mx-2 text-foreground/30">·</span>
          <span className="font-medium">{current.label}</span>
        </span>
        <span className="text-foreground/50 text-xs">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--portal-akzent-soft))] overflow-hidden">
        <div
          className="h-full rounded-full bg-[hsl(var(--portal-akzent))] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}