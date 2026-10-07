import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

/**
 * Zeigt den Beitritts-QR-Code der MOREImmo-WhatsApp-Community auf einer
 * eigenen Seite, damit der Partner ihn im Onboarding-Termin direkt vom
 * Bildschirm scannen kann. Aufgerufen aus der Bewerber-Aktivierung,
 * der Zurueck-Knopf fuehrt dorthin zurueck.
 */
export default function WhatsappCommunityPage() {
  const [searchParams] = useSearchParams();
  const backTo = searchParams.get("backTo") || "/bewerberprozess";
  const backLabel = searchParams.get("backLabel") || "Zurück";

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to={backTo}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {backLabel}
          </Link>
        </Button>

        <Card className="p-6 flex flex-col items-center gap-4">
          <div className="text-center">
            <h1 className="text-lg font-bold">MOREImmo WhatsApp-Community</h1>
            <p className="text-sm text-muted-foreground">
              Der Partner scannt den Code mit der Kamera in WhatsApp und tritt
              der Community bei. Die passenden Untergruppen werden danach vom
              Admin zugeordnet.
            </p>
          </div>
          <img
            src="/community/whatsapp-community-qr.png"
            alt="QR-Code zum Beitritt in die MOREImmo WhatsApp-Community"
            className="w-full max-w-md rounded-xl border"
          />
        </Card>
      </div>
    </DashboardLayout>
  );
}
