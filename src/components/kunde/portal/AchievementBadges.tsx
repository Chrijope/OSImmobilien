import { PORTAL_STEPS, getPortalStepIndex } from "@/lib/portalCopy";
import {
  MessageCircle, Coffee, ShieldCheck, Home, FileSignature,
  Landmark, Briefcase, KeyRound, Trophy, Check,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, typeof Check> = {
  kontaktaufnahme: MessageCircle,
  erstgespraech: Coffee,
  bonitaetsunterlagen: ShieldCheck,
  objektauswahl: Home,
  reservierung: FileSignature,
  finanzierung: Landmark,
  notar: Briefcase,
  faelligkeit: KeyRound,
  fertig: Trophy,
};

interface Props {
  pipelineStufe?: string | null;
  className?: string;
}

/**
 * Warme Meilenstein-Badges für das Kundenportal.
 * - Errungene Stufen: Gold-Orange mit ✓
 * - Aktuelle Stufe: weiß, sanft pulsierender warmer Ring
 * - Künftige Stufen: dezent grau/dashed
 */
export function AchievementBadges({ pipelineStufe, className }: Props) {
  const { t } = useTranslation();
  const currentIdx = getPortalStepIndex(pipelineStufe);
  const total = PORTAL_STEPS.length;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground/80 tracking-wide">
          {t("portal.journey.heading", "Deine Reise")}
        </h3>
        <span className="text-xs text-foreground/55">
          {currentIdx + 1} / {total}
        </span>
      </div>
      <div className="relative">
        {/* dezente Verbindungslinie */}
        <div
          aria-hidden
          className="absolute left-0 right-0 top-5 h-px hidden sm:block"
          style={{
            background:
              "linear-gradient(90deg, hsl(var(--primary) / 0.45) 0%, hsl(var(--primary) / 0.25) " +
              Math.max(0, Math.min(100, ((currentIdx) / (total - 1)) * 100)) +
              "%, hsl(var(--border)) " +
              Math.max(0, Math.min(100, ((currentIdx) / (total - 1)) * 100)) +
              "%, hsl(var(--border)) 100%)",
          }}
        />
        <ol className="relative grid gap-2 sm:gap-1" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {PORTAL_STEPS.map((s, i) => {
            const Icon = STEP_ICONS[s.key] || Check;
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            const stateCls = isDone
              ? "portal-badge-done"
              : isCurrent
              ? "portal-badge-current"
              : "portal-badge-future";
            return (
              <li key={s.key} className="flex flex-col items-center gap-1.5 min-w-0">
                <div
                  className={cn(
                    "relative h-10 w-10 sm:h-11 sm:w-11 rounded-full flex items-center justify-center",
                    stateCls,
                  )}
                  title={s.label}
                  aria-label={isDone
                    ? t("portal.journey.aria_done", { label: s.label })
                    : isCurrent
                    ? t("portal.journey.aria_current", { label: s.label })
                    : s.label}
                >
                  {isDone ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <Icon className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] sm:text-[11px] text-center leading-tight w-full px-0.5 truncate",
                    isDone
                      ? "text-[hsl(var(--portal-badge-done-text))] font-medium"
                      : isCurrent
                      ? "text-foreground font-medium"
                      : "text-foreground/45",
                  )}
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}