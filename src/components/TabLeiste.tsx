import { Menu } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useSidebar } from "@/components/ui/sidebar";
import type { TabEintrag } from "@/lib/tableiste";

/*
 * Tableiste unten am Handy (B1, 26.10.2026): eine schwebende Glaskapsel wie
 * unter iOS 26, vier Bereiche je Rolle (lib/tableiste.ts) und „Mehr“, das die
 * heutige Seitenleiste öffnet. Nur unter 768 px.
 *
 * `data-no-min` an den Knöpfen und Links: Die Handy-Regeln für Mindesthöhe
 * und Innenabstand (index.css) dürfen die Leiste nicht treffen, sie nimmt
 * selbst Maß. Den Platz darunter hält `main` frei (DashboardLayout).
 */
export function TabLeiste({ eintraege }: { eintraege: TabEintrag[] }) {
  const { setOpenMobile } = useSidebar();
  const { pathname } = useLocation();
  const istAktiv = (url: string) => (url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(`${url}/`));

  return (
    <nav
      aria-label="Hauptbereiche"
      data-ui="tableiste"
      data-feder=""
      data-state="open"
      className="fixed inset-x-3 z-40 md:hidden bottom-[calc(0.75rem+env(safe-area-inset-bottom))] rounded-full border border-border/60 bg-background/80 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.25)] backdrop-blur-xl animate-in fade-in-0 slide-in-from-bottom-4"
    >
      <ul className="flex items-stretch justify-between px-1.5 py-1">
        {eintraege.map(({ url, titel, item }) => {
          const Icon = item.icon;
          const aktiv = istAktiv(url);
          return (
            <li key={url} className="flex-1">
              <NavLink
                to={url}
                data-no-min
                aria-current={aktiv ? "page" : undefined}
                className={`relative flex h-[46px] flex-col items-center justify-center gap-0.5 rounded-full text-bildunterschrift transition-colors ${aktiv ? "bg-primary/10 text-primary font-semibold" : "text-muted-foreground"}`}
              >
                <Icon className="h-5 w-5" />
                <span className="leading-none">{titel}</span>
                {!!item.badgeCount && item.badgeCount > 0 && (
                  <span className="absolute right-[22%] top-1 min-w-[16px] rounded-full bg-destructive px-1 text-center text-bildunterschrift leading-4 text-destructive-foreground" aria-label={`${item.badgeCount} neu`}>
                    {item.badgeCount > 99 ? "99+" : item.badgeCount}
                  </span>
                )}
              </NavLink>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            data-no-min
            onClick={() => setOpenMobile(true)}
            className="flex h-[46px] w-full flex-col items-center justify-center gap-0.5 rounded-full text-bildunterschrift text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            <span className="leading-none">Mehr</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
