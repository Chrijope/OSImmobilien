import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Apple-Style Settings-Liste (wie iOS Einstellungen):
 * - SettingsList umschließt mehrere SettingsRow
 * - Trennlinien automatisch zwischen Reihen
 * - SettingsRow zeigt Label links, Value/Action rechts
 */
export function SettingsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-ui="card"
      className={cn(
        "rounded-2xl border border-border/60 bg-card divide-y divide-border/60 overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

interface SettingsRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  description?: React.ReactNode;
  value?: React.ReactNode;
  chevron?: boolean;
}

export function SettingsRow({ label, description, value, chevron, className, children, ...props }: SettingsRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 sm:px-5 py-3 min-h-[52px] transition-colors",
        props.onClick && "cursor-pointer hover:bg-muted/40",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground truncate">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
        )}
      </div>
      {value !== undefined && (
        <div className="text-sm text-muted-foreground text-right shrink-0">{value}</div>
      )}
      {children}
      {chevron && <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />}
    </div>
  );
}