import { useParams, useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function AfaObjekt() {
  const { id, weId } = useParams<{ id: string; weId?: string }>();
  const navigate = useNavigate();
  const backUrl = weId ? `/objekte/${id}/wohnung/${weId}` : `/objekte/${id}`;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto text-center py-12">
        <p className="text-muted-foreground">Der AfA-Rechner ist jetzt als eigenständiges Tool verfügbar.</p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Zurück
          </Button>
          <Button onClick={() => navigate("/afa-rechner")}>Zum AfA-Rechner</Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
