import "@/styles/akademie-neu.css";
import { useLocation } from "react-router-dom";
import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { EinwandBibliothekMerged } from "@/components/einwaende/EinwandBibliothekMerged";

export default function VertriebsakademieEinwaende() {
  const neueAnsicht = useLocation().pathname.startsWith("/vertriebsakademie");
  /**
   * Der Rückweg gehört nur dorthin, wo man auch hergekommen ist.
   *
   * Die Bibliothek ist ein eigener Punkt in der Seitenleiste. Wer sie von dort
   * öffnet, war nie in der Vertriebsakademie, für den ist „Zurück" schlicht
   * falsch. Die Verweise aus der Akademie setzen deshalb `vonAkademie` im
   * Navigationszustand, und nur dann erscheint der Knopf.
   */
  const location = useLocation();
  const vonAkademie = Boolean((location.state as { vonAkademie?: boolean } | null)?.vonAkademie);

  return (
    <DashboardLayout>
      <div className={neueAnsicht ? "an-root an-neben space-y-6" : "w-full space-y-6 pb-12"}>
        {(vonAkademie || neueAnsicht) && (
          <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
            <Link to="/vertriebsakademie">
              <ArrowLeft className="h-4 w-4" /> Zurück zur Vertriebsakademie
            </Link>
          </Button>
        )}

        <PageHeader
          title="Einwand-Bibliothek & Einwandbehandlung"
          subtitle="31 Einwände mit Motiv, Antwort, Falle und Profi-Move, jeder mit der Technik verknüpft, die bei ihm greift. Im Erstgesprächsskript erscheinen sie automatisch an der Stelle, an der sie typischerweise kommen."
        />

        <EinwandBibliothekMerged />
      </div>
    </DashboardLayout>
  );
}
