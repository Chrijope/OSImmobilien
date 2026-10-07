import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useVaProgress, computeBadges, type VaBadge } from "@/lib/vertriebsakademieProgress";
import { useZielgruppe } from "@/lib/vertriebsakademieZielgruppe";

/**
 * Auszeichnungen als echte Siegel/Medaillen.
 * Drei Stufen: Bronze / Silber / Gold – je nach Meilenstein-Wertigkeit.
 * Gesperrte Siegel werden monochrom + Schloss dargestellt.
 */

type Tier = "bronze" | "silber" | "gold";

// Zuordnung Badge-ID → Tier. Höhere Meilensteine = höhere Tier-Stufe.
const TIER_BY_ID: Record<string, Tier> = {
  "erste-schritte": "bronze",
  "grundlagen-meister": "bronze",
  "netzwerker": "bronze",
  "geuebt": "silber",
  "viertel": "silber",
  "halbzeit": "silber",
  "geprueft": "gold",
  "fehlerfrei": "gold",
  "endspurt": "gold",
  "champion": "gold",
};

const TIER_COLORS: Record<Tier, { outer: string; inner: string; edge: string; text: string; glow: string; label: string }> = {
  bronze: {
    outer: "#b26b3c",
    inner: "#e39566",
    edge: "#7a3f1e",
    text: "#3a1a06",
    glow: "rgba(227,149,102,0.35)",
    label: "Bronze",
  },
  silber: {
    outer: "#8892a0",
    inner: "#d3dae4",
    edge: "#5a6472",
    text: "#1f2733",
    glow: "rgba(211,218,228,0.45)",
    label: "Silber",
  },
  gold: {
    outer: "#c98a1a",
    inner: "#f7d769",
    edge: "#8a5a0d",
    text: "#3a2400",
    glow: "rgba(247,215,105,0.55)",
    label: "Gold",
  },
};

function Siegel({ badge, tier }: { badge: VaBadge; tier: Tier }) {
  const c = TIER_COLORS[tier];
  const locked = !badge.erreicht;
  return (
    <div
      className={cn(
        "relative flex flex-col items-center text-center gap-2 rounded-xl border p-4 transition-all",
        locked
          ? "border-muted bg-muted/10 opacity-70"
          : "border-transparent bg-gradient-to-br from-background to-muted/30 hover:shadow-lg",
      )}
      style={locked ? undefined : { boxShadow: `0 6px 24px -12px ${c.glow}` }}
    >
      <svg viewBox="0 0 100 100" className="h-20 w-20 shrink-0" aria-hidden>
        <defs>
          <radialGradient id={`grad-${badge.id}`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={locked ? "#e5e7eb" : c.inner} />
            <stop offset="70%" stopColor={locked ? "#9ca3af" : c.outer} />
            <stop offset="100%" stopColor={locked ? "#6b7280" : c.edge} />
          </radialGradient>
          <linearGradient id={`ribbon-${badge.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={locked ? "#9ca3af" : c.outer} />
            <stop offset="100%" stopColor={locked ? "#4b5563" : c.edge} />
          </linearGradient>
        </defs>
        {/* Bänder unten */}
        <path d="M32 72 L20 96 L38 90 L44 78 Z" fill={`url(#ribbon-${badge.id})`} opacity={locked ? 0.5 : 1} />
        <path d="M68 72 L80 96 L62 90 L56 78 Z" fill={`url(#ribbon-${badge.id})`} opacity={locked ? 0.5 : 1} />
        {/* Äußerer Ring */}
        <circle cx="50" cy="46" r="36" fill={`url(#grad-${badge.id})`} stroke={locked ? "#4b5563" : c.edge} strokeWidth="2" />
        {/* Zacken/Sterne-Rand */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const x1 = 50 + Math.cos(angle) * 36;
          const y1 = 46 + Math.sin(angle) * 36;
          const x2 = 50 + Math.cos(angle) * 39;
          const y2 = 46 + Math.sin(angle) * 39;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={locked ? "#6b7280" : c.edge} strokeWidth="1.2" opacity="0.7" />
          );
        })}
        {/* Innerer Ring */}
        <circle cx="50" cy="46" r="27" fill="none" stroke={locked ? "#6b7280" : c.edge} strokeWidth="0.8" opacity="0.6" />
        {/* Zentrum: Stufen-Label */}
        <text
          x="50"
          y="42"
          textAnchor="middle"
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.5"
          fill={locked ? "#374151" : c.text}
          style={{ textTransform: "uppercase" }}
        >
          {locked ? "LOCKED" : c.label}
        </text>
        <text
          x="50"
          y="56"
          textAnchor="middle"
          fontSize="7"
          fontWeight="600"
          fill={locked ? "#374151" : c.text}
          opacity="0.8"
        >
          OS Immobilien
        </text>
        {locked && (
          <g transform="translate(42, 60)">
            <rect x="0" y="0" width="16" height="12" rx="2" fill="#374151" />
            <path d="M3 0 V-3 A5 5 0 0 1 13 -3 V0" fill="none" stroke="#374151" strokeWidth="1.6" />
          </g>
        )}
      </svg>
      <div className="min-w-0 space-y-0.5">
        <div className={cn("text-sm font-semibold", locked && "text-muted-foreground")}>
          {badge.name}
        </div>
        <div className="text-[11px] text-muted-foreground leading-tight">
          {badge.beschreibung}
        </div>
      </div>
      {!locked && (
        <span className="absolute top-2 right-2 inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_3px_hsl(var(--background))]" aria-hidden />
      )}
      {locked && (
        <span className="absolute top-2 right-2 inline-flex items-center justify-center h-4 w-4 rounded-full bg-muted text-muted-foreground" aria-label="Gesperrt">
          <Lock className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}

export function AkademieSiegel() {
  const state = useVaProgress();
  const [zielgruppe] = useZielgruppe();
  const badges = computeBadges(state, zielgruppe);
  const unlocked = badges.filter((b) => b.erreicht).length;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold">Deine Auszeichnungen</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sammle Siegel für Meilensteine — Bronze, Silber, Gold.
          </p>
        </div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {unlocked} / {badges.length} freigeschaltet
        </div>
      </div>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {badges.map((b) => (
          <Siegel key={b.id} badge={b} tier={TIER_BY_ID[b.id] ?? "bronze"} />
        ))}
      </div>
    </Card>
  );
}