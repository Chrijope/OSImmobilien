// Ersetzt seit 15.10.2026 Karriereplan und Provisionsstaffel: Bei OS
// Immobilien gibt es keine Stufen, nur die festen Sätze je Partner aus der
// Nutzerverwaltung, getrennt nach zugewiesenen Leads und eigenem Netzwerk.

import { Card, CardContent } from "@/components/ui/card";
import { provisionssaetze } from "@/lib/provisionssatz";

const prozent = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;

/** Ein Satz, wenn Lead und Eigen gleich sind (oder nur einer da ist), sonst null. */
function einSatz(lead: number | null, eigen: number | null): number | null {
  if (lead !== null && (eigen === null || eigen === lead)) return lead;
  if (lead === null && eigen !== null) return eigen;
  return null;
}

/**
 * - eigene Sicht: `userId` gesetzt, ohne `partnerName`
 * - Haussicht mit gewähltem Partner: `userId` und `partnerName`
 * - Haussicht „Alle Partner“: `alle`
 */
export function DeineProvisionKarte({
  userId,
  partnerName,
  alle = false,
}: {
  userId?: string | null;
  partnerName?: string;
  alle?: boolean;
}) {
  const { lead, eigen } = provisionssaetze(alle ? null : userId);
  const ohneSatz = lead === null && eigen === null;

  const satz = einSatz(lead, eigen);
  let text: string;
  if (alle) text = "Wähle einen Partner, um seinen Provisionssatz zu sehen.";
  else if (partnerName) {
    text = ohneSatz
      ? `Für ${partnerName} ist noch kein Provisionssatz hinterlegt.`
      : satz !== null
        ? `Provisionssatz von ${partnerName}: ${prozent(satz)}`
        : `Provisionssatz von ${partnerName}: Lead ${prozent(lead!)} · Eigen ${prozent(eigen!)}`;
  } else if (ohneSatz) {
    text = "Für dich ist noch kein Provisionssatz hinterlegt. Bitte wende dich an die Geschäftsleitung.";
  } else if (satz !== null) {
    text = `Du erhältst ${prozent(satz)} Provision auf das vermittelte Kapitalanlagevolumen. Den Satz legt die Geschäftsleitung in der Nutzerverwaltung fest.`;
  } else {
    text = `Du erhältst ${prozent(lead!)} Provision auf zugewiesene Leads und ${prozent(eigen!)} auf Kontakte aus deinem eigenen Netzwerk, jeweils auf das vermittelte Kapitalanlagevolumen. Die Sätze legt die Geschäftsleitung in der Nutzerverwaltung fest.`;
  }

  return (
    <Card className="border-l-4 border-l-primary bg-muted/30" data-testid="dein-provisionssatz">
      <CardContent className="p-5">
        <p className="font-semibold text-foreground mb-2">Dein Provisionssatz</p>
        <p className={`text-sm ${ohneSatz && !alle ? "text-destructive" : "text-muted-foreground"}`}>{text}</p>
      </CardContent>
    </Card>
  );
}
