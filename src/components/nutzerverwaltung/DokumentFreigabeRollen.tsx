import { useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useUser } from "@/contexts/UserContext";
import { useLiveVersion } from "@/hooks/useLiveData";
import {
  FREIGABE_ROLLEN_IMMER,
  FREIGABE_ROLLEN_WAEHLBAR,
  gespeicherteFreigabeRollen,
  speichereFreigabeRollen,
  type WaehlbareFreigabeRolle,
} from "@/lib/dokumentFreigabeRollen";
import { siehtAdminOnlyNavigation } from "@/lib/sidebarPermissions";
import { ROLES } from "@/types/user";

function rollenName(id: string): string {
  return ROLES.find((r) => r.id === id)?.label ?? id;
}

/**
 * „Wer darf Dokumente für Kunden freigeben", im Dialog „Rollen &
 * Berechtigungen" der Nutzerverwaltung (Christian, 23.09.2026).
 *
 * Admin und Inhaber stehen fest angehakt da, sie dürfen immer. Die übrigen
 * Rollen schalten sich einzeln zu, jeder Haken wird sofort gespeichert, wie
 * die Pfade im Editor darunter. Nur Admin und Inhaber sehen diesen Teil;
 * schreiben dürfen ohnehin nur sie, das erzwingt die Zugriffsregel von
 * `app_config`.
 */
export function DokumentFreigabeRollen() {
  const { user } = useUser();
  // Zeichnet neu, sobald `app_config` geladen ist oder sich ändert.
  useLiveVersion(["app_config"]);
  const [speichert, setSpeichert] = useState<WaehlbareFreigabeRolle | null>(null);

  if (!siehtAdminOnlyNavigation(user.role)) return null;

  const zugeschaltet = gespeicherteFreigabeRollen();

  const umschalten = async (rolle: WaehlbareFreigabeRolle, an: boolean) => {
    const neu = an ? [...zugeschaltet, rolle] : zugeschaltet.filter((r) => r !== rolle);
    setSpeichert(rolle);
    try {
      const gespeichert = await speichereFreigabeRollen(neu);
      if (gespeichert) {
        toast.success(an
          ? `${rollenName(rolle)} darf jetzt Dokumente für Kunden freigeben.`
          : `${rollenName(rolle)} darf keine Dokumente mehr für Kunden freigeben.`);
      }
    } finally {
      setSpeichert(null);
    }
  };

  return (
    <section aria-labelledby="dokument-freigabe-rollen-titel" className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <h3 id="dokument-freigabe-rollen-titel" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileCheck2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Wer darf Dokumente für Kunden freigeben
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Gilt für den Schalter „Für Kunden: frei / gesperrt“ und „geschwärzt geprüft“ im Reiter „Dokumente“ auf Objekt- und Einheitsseite. Admin und Inhaber dürfen immer.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {FREIGABE_ROLLEN_IMMER.map((rolle) => (
          <label key={rolle} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked disabled aria-describedby={`freigabe-immer-${rolle}`} />
            {rollenName(rolle)}
            <span id={`freigabe-immer-${rolle}`} className="text-xs">(immer)</span>
          </label>
        ))}
        {FREIGABE_ROLLEN_WAEHLBAR.map((rolle) => (
          <label key={rolle} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={zugeschaltet.includes(rolle)}
              disabled={speichert !== null}
              onCheckedChange={(wert) => void umschalten(rolle, wert === true)}
            />
            {rollenName(rolle)}
            {speichert === rolle && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Wird gespeichert" />}
          </label>
        ))}
      </div>
    </section>
  );
}
