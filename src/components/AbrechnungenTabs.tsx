import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

/**
 * Tab-Navigation für die beiden Abrechnungs-Ansichten:
 *  - /abrechnungen          → Pro Deal (Kundengutschriften)
 *  - /provisionsabrechnung  → Monatsabrechnung (Eigene Deals + Overrides – Overhead)
 */
export function AbrechnungenTabs() {
  const { pathname } = useLocation();
  const tabs = [
    { to: "/abrechnungen", label: "Pro Deal" },
    { to: "/provisionsabrechnung", label: "Monatsabrechnung" },
  ];
  return (
    <div className="flex gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = pathname === t.to;
        return (
          <NavLink
            key={t.to}
            to={t.to}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </NavLink>
        );
      })}
    </div>
  );
}