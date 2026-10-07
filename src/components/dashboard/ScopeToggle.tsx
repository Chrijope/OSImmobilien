import { cn } from "@/lib/utils";

export type DashboardScope = "eigen" | "team" | "company" | "all";

const OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "eigen", label: "Eigen" },
  { value: "team", label: "Eigenes Team" },
  { value: "company", label: "Team OS Immobilien" },
];

export const VP_TEAM_OPTIONS: { value: DashboardScope; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "eigen", label: "Eigen" },
  { value: "team", label: "Eigenes Team" },
];

export function ScopeToggle({
  value,
  onChange,
  options = OPTIONS,
}: {
  value: DashboardScope;
  onChange: (v: DashboardScope) => void;
  options?: { value: DashboardScope; label: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors tabular-nums",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}