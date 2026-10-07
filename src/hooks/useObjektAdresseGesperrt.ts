import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import { isTableLoaded } from "@/lib/dataCache";
import { getObjektById } from "@/lib/objekteStore";
import { ADRESSE_GESPERRT_ROLLEN, objektAdresseGesperrt } from "@/lib/objektZugang";

/**
 * Ist diese Adresse unter `/objekte/<Objekt>` für den Nutzer gesperrt,
 * weil Objekt oder Einheit ausgeblendet oder fremd-exklusiv sind?
 * Regel in `objektAdresseGesperrt`, betroffen sind Vertriebspartner und Vertriebsleitung.
 */
export function useObjektAdresseGesperrt(pfad: string): boolean {
  const { user, authUser } = useUser();
  useLiveVersion(["objekte", "wohnungen"]);
  if (!ADRESSE_GESPERRT_ROLLEN.includes(user.role) || !isTableLoaded("objekte")) return false;
  return objektAdresseGesperrt(
    pfad,
    { rolle: user.role, benutzerId: authUser?.id, name: user.name },
    (id) => getObjektById(id),
  );
}
