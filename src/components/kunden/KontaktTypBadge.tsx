import { Badge } from "@/components/ui/badge";
import { getKontaktTyp, getKontaktTypBadge, type KontaktTyp } from "@/lib/kontaktTypHelper";
import type { KundeData } from "@/lib/kundenStore";

interface Props {
  kunde?: KundeData;
  typ?: KontaktTyp;
  size?: "sm" | "xs";
  showIcon?: boolean;
  className?: string;
}

/** Visueller Badge: Eigenkontakt oder Lead der Gesellschaft (§ 7). */
export function KontaktTypBadge({ kunde, typ, size = "sm", showIcon = true, className = "" }: Props) {
  const resolved: KontaktTyp = typ ?? (kunde ? getKontaktTyp(kunde) : "lead");
  const cfg = getKontaktTypBadge(resolved);
  const Icon = cfg.Icon;
  const sizeCls = size === "xs"
    ? "text-[9px] px-1 py-0 gap-0.5"
    : "text-[10px] px-1.5 py-0.5 gap-1";
  return (
    <Badge variant="outline" className={`${sizeCls} font-medium border ${cfg.className} ${className}`} title={cfg.tooltip}>
      {showIcon && <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} />}
      {size === "xs" ? cfg.shortLabel : cfg.label}
    </Badge>
  );
}
