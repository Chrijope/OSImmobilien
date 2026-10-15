// Der feste Satz eines Partners aus der Nutzerverwaltung als kurze Anzeige
// für Listen (Nutzerverwaltung, Abrechnungen): ein Wert, wenn Lead und Eigen
// gleich sind, sonst beide; ohne Satz ein Warnhinweis.

import { SatzartBadge } from "@/components/abrechnung/SatzartBadge";
import { Badge } from "@/components/ui/badge";
import { formatSatzProzent, provisionssaetze } from "@/lib/karriereStufeHelper";

export function ProvisionssatzBadges({ userId }: { userId?: string | null }) {
  const { lead, eigen } = provisionssaetze(userId);
  if (lead === null && eigen === null) return <SatzartBadge art="fehlt" klein />;
  if (lead === eigen) {
    return <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-bold">{formatSatzProzent(lead!)}</Badge>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {lead !== null && <SatzartBadge art="zugewiesen" satz={lead} klein />}
      {eigen !== null && <SatzartBadge art="eigen" satz={eigen} klein />}
    </div>
  );
}
