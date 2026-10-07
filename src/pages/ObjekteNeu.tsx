import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

/**
 * Der Weg zu Investagon.
 *
 * Zuerst lag Investagon hier in einem Rahmen mitten in der Seite. Das sah
 * zwar so aus, als waere es Teil des CRM, hatte aber zwei Haken: Die Seite
 * brauchte acht bis zehn Sekunden zum Laden, und das Sitzungs-Cookie von
 * Investagon traegt SameSite=Lax, weshalb eine Anmeldung im fremden Rahmen
 * womoeglich nicht durchhaelt.
 *
 * Deshalb jetzt eine klare Uebergabe statt einer Nachahmung: eine Karte in
 * der Mitte, die sagt, wohin es geht, und ein Knopf, der Investagon in einem
 * eigenen Tab oeffnet. Das CRM bleibt daneben stehen.
 */

const INVESTAGON_URL = "https://tool.investagon.com/";

export default function ObjekteNeu() {
  const oeffnen = () => window.open(INVESTAGON_URL, "_blank", "noopener,noreferrer");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Objekte" subtitle="Die Objektdatenbank in Investagon" />

        <div className="flex justify-center pt-6">
          <Card className="w-full max-w-xl overflow-hidden p-0 text-center">
            {/*
              Das Investagon-Logo traegt dunkelgraue Schrift. Auf der weissen
              Flaeche bleibt es in beiden Erscheinungsbildern lesbar, im
              dunklen genauso wie im hellen.
            */}
            <div className="flex justify-center bg-white px-8 py-9">
              <img
                src="/images/investagon-logo.png"
                alt="Investagon"
                className="h-9 w-auto"
              />
            </div>

            <div className="space-y-5 px-8 py-8">
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">Weiter zu Investagon</h2>
                <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
                  Objekte, Einheiten und Verfügbarkeiten liegen in Investagon. Der Knopf
                  bringt dich zur Anmeldung, das CRM bleibt in diesem Tab geöffnet.
                </p>
              </div>

              <Button size="lg" className="gap-2" onClick={oeffnen}>
                <ExternalLink className="h-4 w-4" />
                Bei Investagon anmelden
              </Button>

              <p className="text-xs text-muted-foreground">
                Investagon ist ein eigenständiges System mit eigener Anmeldung.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
