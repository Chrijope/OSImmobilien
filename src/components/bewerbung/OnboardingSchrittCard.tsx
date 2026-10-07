import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";
import type { OnboardingSchritt } from "@/lib/aktivierungOnboardingSchritte";

interface Props {
  schritt: OnboardingSchritt;
  done: boolean;
  doneAt?: string;
  doneBy?: string;
  canEdit: boolean;
  onToggle: (next: boolean) => void;
  children?: ReactNode;
  /** Optionales Kennzeichen neben dem Titel, etwa wer den Schritt uebernimmt. */
  kopfBadge?: ReactNode;
}

export function OnboardingSchrittCard({
  schritt, done, doneAt, doneBy, canEdit, onToggle, children, kopfBadge,
}: Props) {
  const Icon = schritt.icon;
  return (
    <Card className="p-5">
      {/* `flex-wrap` und `min-w-0`: Das Kennzeichen rechts traegt Datum und
          Namen und bricht nicht um, deshalb schob es auf dem Handy sonst die
          Ueberschrift zusammen und sich selbst aus der Karte heraus. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`h-9 w-9 rounded-full flex items-center justify-center ${
              done ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
            }`}
          >
            {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold">
                {schritt.nummer}. {schritt.titel}
              </h3>
              {kopfBadge}
            </div>
            <p className="text-xs text-muted-foreground">{schritt.beschreibung}</p>
          </div>
        </div>
        {done && doneAt && (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 whitespace-normal text-left sm:whitespace-nowrap">
            Erledigt {new Date(doneAt).toLocaleDateString("de-DE")}
            {doneBy ? ` · ${doneBy}` : ""}
          </Badge>
        )}
      </div>

      {children && <div className="mb-3">{children}</div>}

      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <Checkbox
          checked={done}
          disabled={!canEdit}
          onCheckedChange={(v) => onToggle(!!v)}
        />
        <span>Schritt als erledigt markieren</span>
      </label>
    </Card>
  );
}
