// Umschalter zwischen den eigenen Zahlen, dem Team und dem ganzen Haus.
//
// Wird nur Führungskräften gezeigt. Ein Vertriebspartner hat nichts
// umzuschalten, für ihn gibt es ausschliesslich seine eigenen Kunden.

import { Button } from "@/components/ui/button";
import { User, Users, Building2 } from "lucide-react";
import {
  type Datensicht,
  SICHT_LABEL,
  SICHT_ERKLAERUNG,
  istFuehrungskraft,
} from "@/lib/datenSicht";

const ICONS: Record<Datensicht, React.ComponentType<{ className?: string }>> = {
  eigene: User,
  team: Users,
  haus: Building2,
};

export function SichtUmschalter({
  rolle,
  wert,
  onWechsel,
  /** Die Teamsicht ergibt nur Sinn, wenn dem Nutzer Partner zugeordnet sind. */
  mitTeam = true,
}: {
  rolle: string | undefined;
  wert: Datensicht;
  onWechsel: (neu: Datensicht) => void;
  mitTeam?: boolean;
}) {
  if (!istFuehrungskraft(rolle)) return null;

  const sichten: Datensicht[] = mitTeam ? ["eigene", "team", "haus"] : ["eigene", "haus"];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 gap-1 w-fit">
        {sichten.map((s) => {
          const Icon = ICONS[s];
          const aktiv = s === wert;
          return (
            <Button
              key={s}
              size="sm"
              variant={aktiv ? "default" : "ghost"}
              onClick={() => onWechsel(s)}
              className="gap-1.5 h-8"
            >
              <Icon className="h-3.5 w-3.5" />
              {SICHT_LABEL[s]}
            </Button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{SICHT_ERKLAERUNG[wert]}</p>
    </div>
  );
}
