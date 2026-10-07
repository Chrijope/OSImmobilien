import { useEffect, useState, useMemo } from "react";
import { Check, ChevronDown, UserCog } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { ROLES, UserRole } from "@/types/user";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Floating role-switcher for the Tippgeber portal. Da das Portal keine
 * Sidebar hat, fehlte Nutzern mit mehreren Rollen (z.B. Admin + Tippgeber)
 * die Möglichkeit, zurück in ihre andere Rolle zu wechseln. Dieser Button
 * wird nur eingeblendet, wenn dem Nutzer mehr als eine Rolle zugewiesen ist.
 */
export function TippgeberRoleSwitcher() {
  const { user, setRole, authUser } = useUser();
  const navigate = useNavigate();
  const [assignedRoles, setAssignedRoles] = useState<UserRole[]>([]);

  useEffect(() => {
    if (!authUser) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", authUser.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAssignedRoles(data.map((r: any) => r.role as UserRole));
        } else {
          setAssignedRoles([user.role]);
        }
      });
  }, [authUser, user.role]);

  const visibleRoles = useMemo(
    () => ROLES.filter((r) => assignedRoles.includes(r.id)),
    [assignedRoles]
  );

  if (assignedRoles.length <= 1) return null;

  const currentRole = ROLES.find((r) => r.id === user.role);

  return (
    <div className="fixed top-3 right-3 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg border border-border bg-background/95 backdrop-blur px-3 py-2 text-sm shadow-md hover:bg-accent transition-colors">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: currentRole?.color }}
            />
            <span className="font-medium">{currentRole?.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
          {visibleRoles.map((role) => (
            <DropdownMenuItem
              key={role.id}
              onClick={async () => {
                await setRole(role.id);
                navigate("/");
              }}
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
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}