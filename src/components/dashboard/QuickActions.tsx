import { ClipboardList, Contact, Users, GraduationCap, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

const partnerRoles = ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"];
const leadershipRoles = ["inhaber", "admin", "vertriebsleiter"];

const actions = [
  { title: "Kontakt anlegen", icon: ClipboardList, url: "/kontakte?highlight=anlegen", roles: partnerRoles, farbe: "bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300" },
  { title: "Alle Kontakte", icon: Contact, url: "/alle-kontakte", roles: leadershipRoles, farbe: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" },
  { title: "Teampartner anlegen", icon: Users, url: "/teampartner?highlight=anlegen", roles: leadershipRoles, farbe: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300" },
  { title: "Vertriebsakademie", icon: GraduationCap, url: "/vertriebsakademie", roles: partnerRoles, farbe: "bg-orange-100 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300" },
];

export function QuickActions() {
  const navigate = useNavigate();
  const { user } = useUser();
  const visibleActions = actions.filter((action) => action.roles.includes(user.role));

  return (
        <div className={`grid grid-cols-2 gap-3 ${visibleActions.length > 2 ? "xl:grid-cols-4" : ""}`}>
          {visibleActions.map((action) => (
            <button
              key={action.title}
              type="button"
              onClick={() => navigate(action.url)}
              className="group flex min-w-0 items-center gap-2 sm:gap-3 rounded-xl border bg-card p-3 sm:p-4 text-left transition-colors hover:bg-accent/50 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={`h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-lg flex items-center justify-center ${action.farbe}`}>
                <action.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="flex-1 text-sm font-medium leading-snug">{action.title}</span>
              <ArrowUpRight className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            </button>
          ))}
        </div>
  );
}
