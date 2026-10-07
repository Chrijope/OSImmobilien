import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getPortalStep } from "@/lib/portalCopy";

interface Props {
  pipelineStufe?: string | null;
  ctaLabel?: string;
  to?: string;
}

/**
 * „Als Nächstes"-Card – persönliche, ruhige Übersetzung der Pipeline-Stufe
 * in einen freundlichen Concierge-Satz. Optional mit CTA.
 */
export function PortalStepCard({ pipelineStufe, ctaLabel, to }: Props) {
  const { t } = useTranslation();
  const step = getPortalStep(pipelineStufe);
  const label = ctaLabel ?? t("portal.stepcard.open");
  const content = (
    <div className="portal-card p-5 sm:p-6 group transition-shadow hover:shadow-md">
      <div className="text-xs uppercase tracking-wide text-[hsl(var(--portal-akzent-deep))] mb-1.5">
        {t("portal.header.next_step")}
      </div>
      <div className="text-lg sm:text-xl font-medium text-foreground leading-snug">
        {step.next}
      </div>
      {to && (
        <div className="mt-4 inline-flex items-center gap-1.5 text-sm text-foreground/80 group-hover:text-foreground">
          {label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      )}
    </div>
  );
  return to ? <Link to={to} className="block">{content}</Link> : content;
}