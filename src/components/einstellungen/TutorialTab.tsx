import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, RotateCcw, PlayCircle } from "lucide-react";
import { useCrmTutorial } from "@/components/tutorial/CrmTutorial";

export function TutorialTab() {
  const { start, resume, hasProgress, lastIndex, totalSteps } = useCrmTutorial();

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold">CRM-Tutorial</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Die geführte Tour zeigt dir Schritt für Schritt jeden Menüpunkt deiner Sidebar,
            hebt ihn hervor und erklärt in der Mitte kurz, wofür er da ist.
            Du kannst die Tour jederzeit hier fortsetzen oder komplett neu starten.
          </p>
          {totalSteps > 0 && hasProgress && (
            <p className="text-xs text-muted-foreground mt-2">
              Zuletzt gesehen: Schritt {Math.min(lastIndex + 1, totalSteps)} von {totalSteps}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {hasProgress && (
              <Button onClick={resume} className="gap-2">
                <PlayCircle className="h-4 w-4" /> Tutorial fortsetzen
              </Button>
            )}
            <Button variant={hasProgress ? "outline" : "default"} onClick={() => start({ fromStart: true })} className="gap-2">
              <RotateCcw className="h-4 w-4" /> {hasProgress ? "Von vorne starten" : "Tutorial starten"}
            </Button>
          </div>
          <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[13px] text-foreground/90">
            Für den kompletten Prozess von "Lead kommt rein" bis zum Notartermin – inkl.
            Skripten, Einwandbehandlung und Kundenkommunikation – ist die
            <strong className="text-foreground"> Vertriebsakademie</strong> das richtige Werkzeug.
          </div>
        </div>
      </div>
    </Card>
  );
}
