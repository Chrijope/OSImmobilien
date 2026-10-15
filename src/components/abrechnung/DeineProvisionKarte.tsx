// Ersetzt seit 15.10.2026 Karriereplan und Provisionsstaffel: Bei OS
// Immobilien gibt es keine Stufen, nur den festen Satz je Partner aus der
// Nutzerverwaltung, getrennt nach zugewiesenen Leads und eigenem Netzwerk.

import { Card, CardContent } from "@/components/ui/card";
import { SatzartBadge } from "@/components/abrechnung/SatzartBadge";
import { provisionssaetze } from "@/lib/karriereStufeHelper";

export function DeineProvisionKarte({ userId, partnerName }: { userId?: string | null; partnerName?: string }) {
  const { lead, eigen } = provisionssaetze(userId);
  const titel = partnerName ? `Provision von ${partnerName}` : "Deine Provision";

  return (
    <Card className="border-l-4 border-l-primary bg-muted/30">
      <CardContent className="p-5">
        <p className="font-semibold text-foreground mb-2">{titel}</p>
        {lead === null && eigen === null ? (
          <div className="flex items-center gap-2 text-sm">
            <SatzartBadge art="fehlt" />
            <span className="text-muted-foreground">Noch kein Satz in der Nutzerverwaltung hinterlegt.</span>
          </div>
        ) : lead === eigen ? (
          <p className="text-2xl font-bold tabular-nums">{lead!.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {lead !== null && <SatzartBadge art="zugewiesen" satz={lead} />}
            {eigen !== null && <SatzartBadge art="eigen" satz={eigen} />}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">
          Fester Satz auf den Kaufpreis, gepflegt in der Nutzerverwaltung. Ab der Reservierung wird er am Vorgang festgeschrieben.
        </p>
      </CardContent>
    </Card>
  );
}
