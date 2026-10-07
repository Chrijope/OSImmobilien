import { useEffect, useMemo, useState } from "react";
import { useLiveVersion } from "@/hooks/useLiveData";
import { useUser } from "@/contexts/UserContext";
import { getTickets, ungeleseneTicketIds } from "@/lib/supportTicketStore";

/**
 * Die eigenen Tickets mit einer ungelesenen Antwort vom Support.
 *
 * Rechnet neu bei jeder Aenderung an `support_tickets` (Echtzeit) und bei
 * "tickets-updated", denn ohne Migration und beim Testkonto liegt die
 * Lesemarke nur im Browser.
 */
export function useUngeleseneSupportTickets(): Set<string> {
  const { user, authUser } = useUser();
  const liveVersion = useLiveVersion(["support_tickets"]);
  const [lokalVersion, setLokalVersion] = useState(0);

  useEffect(() => {
    const neu = () => setLokalVersion((v) => v + 1);
    window.addEventListener("tickets-updated", neu);
    return () => window.removeEventListener("tickets-updated", neu);
  }, []);

  return useMemo(
    () => ungeleseneTicketIds(authUser?.id, getTickets(), user.name),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveVersion, lokalVersion, authUser?.id, user.name],
  );
}
