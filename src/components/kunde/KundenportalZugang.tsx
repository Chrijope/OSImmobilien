import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle2, KeyRound, Lock, RefreshCw, Send, UserPlus } from "lucide-react";

export type KundenportalStatus = "none" | "eingeladen" | "aktiv" | "ausstehend" | "gesperrt";

/**
 * Alles, was der Portalblock anzeigt und auslöst. `KundenDetail.tsx` baut
 * dieses Bündel einmal (`kundenportalAngaben`) und reicht es an beide Stellen
 * weiter, an das Investment und an das Kundenprofil. So können die beiden
 * nicht auseinanderlaufen: gleiche Handler, gleiche Rückfragen, gleiche Rechte.
 */
export interface KundenportalZugangAngaben {
  status: KundenportalStatus;
  freigeschaltetAm?: string | null;
  gesperrtAm?: string | null;
  einladungErneutAm?: string | null;
  person2Email?: string | null;
  person2Eingeladen?: boolean;
  /** Einladung, Person 2, Sperren und Entsperren. */
  darfVerwalten: boolean;
  /** Zwei-Faktor zurücksetzen, zusätzlich serverseitig in `manage-mfa` geprüft. */
  darfZweiFaktorZuruecksetzen: boolean;
  einladungGesendet: boolean;
  zweiFaktorLaeuft: boolean;
  onPerson2Einladen: () => void;
  onEinladungErneut: () => void;
  onZweiFaktorZuruecksetzen: () => void;
  onSperren: () => void;
  onEntsperren: () => void;
  /** Solange Sperren oder Entsperren auf die Datenbank wartet. */
  sperreLaeuft?: boolean;
}

interface Props extends KundenportalZugangAngaben {
  /**
   * "investment": Zeile unter den Bonitätsunterlagen, wie bisher.
   * "profil": linke Spalte des Kundenprofils. Die Überschrift „Kundenportal“
   * steht dort schon darüber, die Knöpfe stehen untereinander, weil die
   * Spalte schmal ist.
   */
  darstellung?: "investment" | "profil";
  /**
   * Nur im Investment: Freigeschaltet wird das Portal dort, sobald die
   * Selbstauskunft vorliegt, weil daran auch die Unterlagen-Freigabe aller
   * Investments hängt. Ohne diesen Handler steht statt des Knopfes ein Hinweis.
   */
  onFreischalten?: () => void;
  freischaltenLaeuft?: boolean;
}

const STATUS_TEXT: Record<KundenportalStatus, string> = {
  none: "Nicht freigeschaltet",
  eingeladen: "Eingeladen",
  aktiv: "Aktiv",
  ausstehend: "Ausstehend",
  gesperrt: "Gesperrt",
};

/** „12.09.2026 um 14:03 Uhr“, oder nichts, wenn der Wert kein Datum ist. */
function datumMitUhrzeit(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const datum = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const uhrzeit = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${datum} um ${uhrzeit} Uhr`;
}

/**
 * Der Kundenportal-Block: Status mit Datum, Einladung erneut versenden,
 * Zwei-Faktor zurücksetzen, Portal sperren oder entsperren.
 *
 * Bis zum 23.09.2026 stand er nur im Investment unter „Bonität und
 * Bankprüfung“. Christian wollte dieselben Angaben und Knöpfe auch im
 * Kundenprofil direkt unter den Kontaktdaten. Das Portal hängt am Kontakt
 * (`kontakte.meta`), nicht am Investment, deshalb zeigen beide Stellen
 * denselben Stand.
 *
 * Die Knöpfe sind nur Bedienung. Ob jemand einladen, sperren oder die
 * Zwei-Faktor-Anmeldung zurücksetzen darf, entscheiden die Edge Functions
 * `invite-user`, `kundenportal-sperre` und `manage-mfa`. Einladen, Sperren
 * und Entsperren dürfen seit dem 23.09.2026 nur Admin, Inhaber und der
 * zuständige Vertriebspartner.
 */
export function KundenportalZugang({
  status, freigeschaltetAm, gesperrtAm, einladungErneutAm, person2Email, person2Eingeladen,
  darfVerwalten, darfZweiFaktorZuruecksetzen, einladungGesendet, zweiFaktorLaeuft,
  onPerson2Einladen, onEinladungErneut, onZweiFaktorZuruecksetzen, onSperren, onEntsperren, sperreLaeuft = false,
  darstellung = "investment", onFreischalten, freischaltenLaeuft = false,
}: Props) {
  const profil = darstellung === "profil";
  const freigeschaltet = status !== "none";
  const gesperrt = status === "gesperrt";
  const freigeschaltetText = datumMitUhrzeit(freigeschaltetAm);
  const gesperrtText = gesperrt ? datumMitUhrzeit(gesperrtAm) : null;
  const erneutText = datumMitUhrzeit(einladungErneutAm);
  // In der schmalen Profilspalte stehen die Knöpfe untereinander und dürfen
  // umbrechen, statt über den Rand zu laufen.
  const knopf = profil ? "w-full justify-start h-auto min-h-9 whitespace-normal text-left" : undefined;

  const statusBadge = (
    <Badge variant="outline" className={cn("text-[10px]",
      status === "aktiv" && "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
      status === "eingeladen" && "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
      status === "ausstehend" && "bg-muted text-muted-foreground",
      status === "gesperrt" && "bg-destructive/10 text-destructive border-destructive/30",
    )}>
      {STATUS_TEXT[status]}
    </Badge>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {freigeschaltet ? (
          <div className="flex items-center gap-2 flex-wrap">
            <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
            {!profil && <span className="text-sm font-medium">Kundenportal</span>}
            {statusBadge}
            {freigeschaltetText && (
              <span className="text-[10px] text-muted-foreground">freigeschaltet am {freigeschaltetText}</span>
            )}
            {!profil && gesperrtText && (
              <span className="text-[10px] text-muted-foreground">gesperrt am {gesperrtText}</span>
            )}
          </div>
        ) : onFreischalten && darfVerwalten ? (
          <Button size="sm" onClick={onFreischalten} disabled={freischaltenLaeuft}>
            {freischaltenLaeuft ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
            {freischaltenLaeuft ? "Wird freigeschaltet…" : "Portal freischalten"}
          </Button>
        ) : (
          <div className="space-y-1">
            {statusBadge}
            {darfVerwalten && (
              <p className="text-[10px] text-muted-foreground">
                Freischalten kannst du im Investment unter „Bonität und Bankprüfung“, sobald die Selbstauskunft vorliegt.
              </p>
            )}
          </div>
        )}
      </div>

      {freigeschaltet && darfVerwalten && person2Email && !person2Eingeladen && (
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="outline" className={knopf} onClick={onPerson2Einladen}>
            <UserPlus className="h-3 w-3 mr-1" /> Person 2 einladen ({person2Email})
          </Button>
        </div>
      )}
      {freigeschaltet && person2Eingeladen && (
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
          <CheckCircle2 className="h-3.5 w-3.5" /> Person 2 eingeladen
        </div>
      )}

      {freigeschaltet && (
        <>
          {darfVerwalten && (
            <div className={cn("flex gap-2 pt-1", profil ? "flex-col items-stretch" : "items-center flex-wrap")}>
              <Button size="sm" variant="outline" className={cn(
                "transition-all duration-300",
                knopf,
                einladungGesendet && "bg-[hsl(var(--success))] text-white border-[hsl(var(--success))]",
              )} disabled={einladungGesendet} onClick={onEinladungErneut}>
                {einladungGesendet ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                {einladungGesendet ? "Gesendet ✓" : "Einladung erneut versenden"}
              </Button>
              {darfZweiFaktorZuruecksetzen && (
                <Button size="sm" variant="outline" className={knopf} disabled={zweiFaktorLaeuft} onClick={onZweiFaktorZuruecksetzen}>
                  {zweiFaktorLaeuft
                    ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    : <KeyRound className="h-3 w-3 mr-1" />}
                  {zweiFaktorLaeuft ? "Wird zurückgesetzt…" : "Zwei-Faktor zurücksetzen"}
                </Button>
              )}
              {!gesperrt ? (
                <Button size="sm" variant="outline" className={cn("text-destructive border-destructive/30 hover:bg-destructive/10", knopf)} disabled={sperreLaeuft} onClick={onSperren}>
                  {sperreLaeuft ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Lock className="h-3 w-3 mr-1" />}
                  {sperreLaeuft ? "Wird gespeichert…" : "Portal sperren"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className={cn("text-[hsl(var(--success))] border-[hsl(var(--success))]/30 hover:bg-[hsl(var(--success))]/10", knopf)} disabled={sperreLaeuft} onClick={onEntsperren}>
                  {sperreLaeuft ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {sperreLaeuft ? "Wird gespeichert…" : "Portal entsperren"}
                </Button>
              )}
            </div>
          )}
          {erneutText && (
            <p className="text-[10px] text-muted-foreground">Zuletzt erneut versendet am {erneutText}</p>
          )}
          {gesperrtText && (
            <p className="text-[10px] text-destructive">Gesperrt am {gesperrtText}</p>
          )}
        </>
      )}
    </div>
  );
}
