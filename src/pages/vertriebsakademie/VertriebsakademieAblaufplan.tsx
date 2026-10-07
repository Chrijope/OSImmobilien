import "@/styles/akademie-neu.css";
import { useLocation } from "react-router-dom";
import { useState } from "react";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { AblaufplanZeitleiste } from "@/components/vertriebsakademie/AblaufplanZeitleiste";
import { useToast } from "@/hooks/use-toast";

/**
 * Ablaufplan der Vertriebsakademie: der Gesamtueberblick von Neuer Lead bis
 * Provisionszahlung. Eigenstaendige Seite zwischen Kapitel 1 und 2, bewusst
 * ohne Fortschritts-Tracking, weil sie Orientierung gibt und kein Lernkapitel
 * mit Checks und Uebungen ist.
 */
export default function VertriebsakademieAblaufplan() {
  const neueAnsicht = useLocation().pathname.startsWith("/vertriebsakademie");
  const [laedt, setLaedt] = useState(false);
  const { toast } = useToast();

  const pdfHerunterladen = async () => {
    setLaedt(true);
    try {
      // Lazy geladen, damit jsPDF nicht im Seitenbuendel der Akademie liegt.
      const m = await import("@/lib/ablaufplanPdf");
      await m.generateAblaufplanPDF();
    } catch (e) {
      console.error("[Ablaufplan] PDF-Erzeugung fehlgeschlagen", e);
      toast({
        title: "PDF konnte nicht erstellt werden",
        description: "Bitte versuche es noch einmal.",
        variant: "destructive",
      });
    } finally {
      setLaedt(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="w-full max-w-3xl space-y-6 pb-12">
        <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
          <Link to="/vertriebsakademie">
            <ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie
          </Link>
        </Button>

        <PageHeader
          title="Der Weg zum Abschluss"
          subtitle="Alle acht Stationen von Neuer Lead bis Provisionszahlung, den Pipelinestufen zugeordnet, mit Zeitangaben je Termin."
        >
          {/* Hauptaktion der Ablaufplan-Seite, deshalb Marken-Orange. */}
          <Button onClick={pdfHerunterladen} disabled={laedt} variant="brand" className="gap-1.5">
            {laedt ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Ablaufplan als PDF
          </Button>
        </PageHeader>

        <AblaufplanZeitleiste />
      </div>
    </DashboardLayout>
  );
}
