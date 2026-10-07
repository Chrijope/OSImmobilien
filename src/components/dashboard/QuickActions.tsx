import { ClipboardList, Contact, Users, GraduationCap, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";

const partnerRoles = ["inhaber", "admin", "vertriebsleiter", "vertriebspartner"];
const leadershipRoles = ["inhaber", "admin", "vertriebsleiter"];

const actions = [
  { title: "Kontakt anlegen", icon: ClipboardList, url: "/kontakte?highlight=anlegen", roles: partnerRoles },
  { title: "Alle Kontakte", icon: Contact, url: "/alle-kontakte", roles: leadershipRoles },
  { title: "Teampartner anlegen", icon: Users, url: "/teampartner?highlight=anlegen", roles: leadershipRoles },
  { title: "Vertriebsakademie", icon: GraduationCap, url: "/vertriebsakademie", roles: partnerRoles },
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
              <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-accent flex items-center justify-center">
                <action.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <span className="flex-1 text-sm font-medium leading-snug">{action.title}</span>
              <ArrowUpRight className="hidden sm:block h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
            </button>
          ))}
        </div>
  );
}
