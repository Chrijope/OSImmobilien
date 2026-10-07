import { useState, useEffect, useMemo, useCallback } from "react";
import { Check, ChevronDown, AlertTriangle, RefreshCw } from "lucide-react";
import { useUser } from "@/contexts/UserContext";
import { ROLES, UserRole } from "@/types/user";
import { useSidebar } from "@/components/ui/sidebar";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ladeZugewieseneRollen } from "@/lib/userRoles";

/** Stand der Rollenabfrage. "fehler" wird sichtbar gemacht, nicht verschluckt. */
type RollenStand = "laedt" | "ok" | "fehler";

export function SidebarRoleSelector() {
  const { user, setRole, authUser } = useUser();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentRole = ROLES.find((r) => r.id === user.role);
  const navigate = useNavigate();

  // Die dem Konto tatsaechlich zugewiesenen Rollen, wie sie in `user_roles` stehen.
  const [assignedRoles, setAssignedRoles] = useState<UserRole[]>([]);
  const [rollenStand, setRollenStand] = useState<RollenStand>("laedt");
  // Zaehler, der eine erneute Abfrage ausloest (Knopf "Erneut versuchen",
  // Rueckkehr in den Tab).
  const [neuLaden, setNeuLaden] = useState(0);
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({});

  const authId = authUser?.id ?? null;

  // Rollen laden. Getrennt von den Benachrichtigungen, damit ein Fehler der
  // einen Abfrage die andere nicht mitreisst.
  useEffect(() => {
    if (!authId) return;
    let abgebrochen = false;

    setRollenStand("laedt");
    void ladeZugewieseneRollen(authId).then((ergebnis) => {
      if (abgebrochen) return;
      if (ergebnis.status === "fehler") {
        // Der Fehler wird ausgewertet und protokolliert. Frueher fiel der Code
        // hier still auf die eine aktuelle Rolle zurueck, dann verschwand der
        // Umschalter und es sah nach einem Rechteverlust aus.
        console.error("Zugewiesene Rollen konnten nicht geladen werden:", ergebnis.fehler);
        setRollenStand("fehler");
        return;
      }
      // Eine leere Liste ist ein gueltiges Ergebnis und kein Fehler. Sie tritt
      // kurz nach einer Einladung auf, bis `user_roles` gefuellt ist.
      setAssignedRoles(ergebnis.rollen.length > 0 ? ergebnis.rollen : [user.role]);
      setRollenStand("ok");
    });

    return () => {
      abgebrochen = true;
    };
  }, [authId, user.role, neuLaden]);

  // Kommt der Nutzer in den Tab zurueck, wird die Liste frisch geholt. So
  // wirkt sich eine Rollenzuweisung durch die Verwaltung ohne Neuladen aus.
  useEffect(() => {
    if (!authId) return;
    const beiRueckkehr = () => {
      if (document.visibilityState === "visible") setNeuLaden((zaehler) => zaehler + 1);
    };
    document.addEventListener("visibilitychange", beiRueckkehr);
    return () => document.removeEventListener("visibilitychange", beiRueckkehr);
  }, [authId]);

  useEffect(() => {
    if (!authId) return;

    // Load unread notification counts per role
    const fetchUnread = async () => {
      const { data } = await (supabase as any)
        .from("benachrichtigungen")
        .select("ziel_rolle")
        .eq("benutzer_id", authId)
        .eq("gelesen", false);

      const counts: Record<string, number> = {};
      if (data) {
        for (const row of data) {
          const role = row.ziel_rolle || user.role;
          counts[role] = (counts[role] || 0) + 1;
        }
      }
      setRoleCounts(counts);
    };
    fetchUnread();

    // Listen for updates from HeaderBar marking notifications as read
    const handler = () => fetchUnread();
    window.addEventListener("benachrichtigungen-updated", handler);

    // Also listen via realtime
    const channel = supabase
      .channel("sidebar-notif-count")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "benachrichtigungen", filter: `benutzer_id=eq.${authId}` },
        () => fetchUnread()
      )
      .subscribe();

    return () => {
      window.removeEventListener("benachrichtigungen-updated", handler);
      supabase.removeChannel(channel);
    };
  }, [authId, user.role]);

  // Nur tatsächlich zugewiesene Rollen anzeigen
  const visibleRoles = useMemo(
    () => ROLES.filter((r) => assignedRoles.includes(r.id)),
    [assignedRoles]
  );

  const erneutVersuchen = useCallback(() => setNeuLaden((zaehler) => zaehler + 1), []);

  const rolleWechseln = useCallback(
    async (rolle: UserRole) => {
      const ergebnis = await setRole(rolle);
      if (ergebnis.status === "fehler") {
        toast.error(ergebnis.nachricht);
        // Ist die Liste nicht lesbar, kann auch die angezeigte Auswahl veraltet
        // sein. Deshalb gleich neu holen.
        if (ergebnis.grund === "rollen-nicht-lesbar" || ergebnis.grund === "nicht-zugewiesen") {
          erneutVersuchen();
        }
        return;
      }
      navigate("/");
    },
    [setRole, navigate, erneutVersuchen]
  );

  // Dropdown nur bei mehreren zugewiesenen Rollen anzeigen. Eine bereits
  // geladene Liste bleibt stehen, auch wenn ein spaeterer Abruf scheitert. Der
  // Umschalter soll nicht verschwinden, nur weil das Netz kurz weg war.
  const showRoleSection = assignedRoles.length > 1;
  // Der Ladehinweis erscheint nur beim ersten Abruf, nicht bei jeder
  // Auffrischung im Hintergrund.
  const zeigtLadehinweis = rollenStand === "laedt" && assignedRoles.length === 0;

  return (
    <div className="border-t border-sidebar-border">
      {/* Solange die Liste laeuft, wird das auch gesagt. Ein langsames Netz
          soll nicht wie ein Rechteverlust aussehen. */}
      {zeigtLadehinweis && authId && (
        <div className="px-3 py-2">
          <div className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground/60">
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 animate-pulse bg-sidebar-foreground/40" />
            {!collapsed && <span className="truncate">Rollen werden geladen</span>}
          </div>
        </div>
      )}

      {/* Ist die Liste nicht abrufbar, sagt die Seitenleiste das offen und
          bietet einen neuen Versuch an. Sie tut nicht so, als haette der
          Nutzer nur eine Rolle. */}
      {rollenStand === "fehler" && (
        <div className="px-3 py-2">
          {collapsed ? (
            <button
              type="button"
              onClick={erneutVersuchen}
              title="Rollen konnten nicht geladen werden. Erneut versuchen."
              aria-label="Rollen konnten nicht geladen werden. Erneut versuchen."
              className="w-full flex items-center justify-center rounded-lg px-2 py-2 text-destructive hover:bg-sidebar-accent transition-colors"
            >
              <AlertTriangle className="h-4 w-4" />
            </button>
          ) : (
            <Alert variant="destructive" className="p-3">
              <AlertTriangle className="h-4 w-4 !left-3 !top-3" />
              <AlertDescription className="text-xs pl-4">
                Rollen konnten nicht geladen werden. Deine Rollen sind unverändert, nur die Liste
                fehlt gerade.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={erneutVersuchen}
                  className="mt-2 h-7 w-full gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Erneut versuchen
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Role Selector – only visible when user has multiple roles */}
      {showRoleSection && (
        <div className="px-3 py-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: currentRole?.color }}
                />
                {!collapsed && (
                  <>
                    <span className="truncate flex-1 text-left">{currentRole?.label}</span>
                    {(roleCounts[user.role] || 0) > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-[10px] font-semibold">
                        {(roleCounts[user.role] || 0) > 99 ? "99+" : roleCounts[user.role]}
                      </Badge>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56 max-h-80 overflow-y-auto">
              {visibleRoles.map((role) => (
                <DropdownMenuItem
                  key={role.id}
                  onClick={() => void rolleWechseln(role.id)}
                  className="flex items-center gap-2"
                >
                  {user.role === role.id ? (
                    <Check className="h-4 w-4 text-foreground" />
                  ) : (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: role.color }}
                    />
                  )}
                  <span className="flex-1">{role.label}</span>
                  {(roleCounts[role.id] || 0) > 0 && (
                    <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-[10px] font-semibold">
                      {(roleCounts[role.id] || 0) > 99 ? "99+" : roleCounts[role.id]}
                    </Badge>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Copyright – always visible */}
      <div className="px-3 py-2">
        {!collapsed ? (
          <p className="text-[10px] text-sidebar-foreground/50 text-center">
            © 2026 MOREImmo · Einzelunternehmen Christian Kurz
          </p>
        ) : (
          <p className="text-[10px] text-sidebar-foreground/50 text-center leading-tight">
            ©<br />2026
          </p>
        )}
      </div>
    </div>
  );
}
