import { useMemo } from "react";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { getJuniorsForRecruiter } from "@/lib/juniorOverrideLogic";
import { isAdminScopeRole } from "@/lib/kontaktOwnership";

/**
 * Liefert für Admin/Inhaber die 3-stufige Sicht (Eigen / Eigenes Team / Team MOREImmo).
 * Für andere Rollen ist `splitTeamCompany` immer false.
 * Vertriebspartner mit eigener Downline (z.B. Karrierestufe „Team Lead") erhalten
 * eine 2-stufige Sicht (Eigen / Eigenes Team) über `vpTeamView`.
 */
export function useAdminTeamScope() {
  const { user, authUser } = useUser();
  const cv = useLiveVersion(["profiles", "user_settings"]);
  const splitTeamCompany = isAdminScopeRole(user.role);

  const { teamIds, teamNames } = useMemo(() => {
    if (!authUser?.id) {
      return { teamIds: new Set<string>(), teamNames: new Set<string>() };
    }
    const juniors = getJuniorsForRecruiter(authUser.id);
    return {
      teamIds: new Set(juniors.map((j) => j.userId)),
      teamNames: new Set(juniors.map((j) => j.name)),
    };
  }, [authUser?.id, cv]);

  const hasOwnTeam = teamNames.size > 0;
  // Nicht-Admin mit eigener Downline → 2-stufige Sicht (Eigen / Eigenes Team)
  const vpTeamView = !splitTeamCompany && hasOwnTeam;
  return { splitTeamCompany, teamIds, teamNames, hasOwnTeam, vpTeamView };
}