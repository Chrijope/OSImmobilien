import { AkademieLink as Link } from "@/components/vertriebsakademie/AkademieLink";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

/**
 * Hinweis-Baustein am Ende der CRM-Academy: verweist auf die Vertriebsakademie.
 * „Du kennst jetzt das Tool — jetzt lerne das Handwerk."
 */
export function CrmAcademyCrossLink() {
  return (
    <Card className="mt-8 p-5 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold">Du kennst jetzt das Tool — jetzt lerne das Handwerk</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Die CRM-Academy hat dir gezeigt, wo im System was liegt. In der
            <strong className="text-foreground"> Vertriebsakademie</strong> lernst du,
            wie du den Vertrieb wirklich machst: Skripte für Erstgespräche,
            Einwandbehandlung, Beratungspräsentationen, Empfehlungssystem
            und Selbstcontrolling.
          </p>
          <Button asChild className="mt-3 gap-1">
            <Link to="/vertriebsakademie">
              Zur Vertriebsakademie <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}