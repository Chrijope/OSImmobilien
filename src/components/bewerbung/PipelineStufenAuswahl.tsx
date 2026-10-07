import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Die Pipelinestufen als Anzeige und als Filter, in zwei Darstellungen.
 *
 * ## Warum zwei Darstellungen
 *
 * Auf dem Rechner ist die Kachelreihe richtig: dreizehn Stufen nebeneinander,
 * jede mit ihrer Farbe und ihrer Zahl, alles auf einen Blick. Auf dem Handy
 * war genau das der Fehler. Dort brach dieselbe Reihe in ein Raster mit zwei
 * Spalten um, also sieben Reihen bunter Kacheln, bevor überhaupt ein Bewerber
 * zu sehen war. Wer im Eingang mit zweihundert Bewerbern arbeitet, scrollt
 * dann erst einmal an der Pipeline vorbei.
 *
 * Deshalb steht auf dem Handy ein Auswahlfeld: eine Zeile statt sieben, die
 * aktive Stufe mit ihrer Zahl sichtbar, alle übrigen einen Tipp entfernt. Die
 * Farbe geht dabei nicht verloren, sie steht als Punkt vor jedem Eintrag und
 * wandert mit der Auswahl in das geschlossene Feld.
 *
 * Der Umschaltpunkt ist `sm` (640px). Der Rechner sieht unverändert die
 * Kacheln, das Handy ausschließlich das Auswahlfeld.
 */

export type PipelineStufeEintrag = {
  /** Der Filterwert: "alle" oder ein Status aus `BewerberStatus`. */
  wert: string;
  /** Die Beschriftung, wie sie der Ablauf vorgibt. */
  label: string;
  /** Wie viele Bewerber in dieser Stufe stehen. */
  anzahl: number;
  /** Die Hintergrundklasse der Stufe, etwa "bg-blue-500". */
  farbe: string;
};

export function PipelineStufenAuswahl({
  stufen,
  aktiv,
  onWaehlen,
}: {
  stufen: PipelineStufeEintrag[];
  /** Der aktuell gesetzte Filter. */
  aktiv: string;
  onWaehlen: (wert: string) => void;
}) {
  return (
    <>
      {/* Handy: eine Zeile statt sieben Reihen Kacheln. */}
      <div className="sm:hidden" data-testid="pipeline-auswahl">
        <Select value={aktiv} onValueChange={onWaehlen}>
          <SelectTrigger aria-label="Pipelinestufe" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {stufen.map(stufe => (
              <SelectItem key={stufe.wert} value={stufe.wert}>
                <span className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${stufe.farbe}`}
                    aria-hidden="true"
                  />
                  <span>{stufe.label}</span>
                  <span className="tabular-nums text-muted-foreground">({stufe.anzahl})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Rechner: unveraendert die Kachelreihe. */}
      <div className="hidden gap-1.5 sm:flex" data-testid="pipeline-kacheln">
        {stufen.map(stufe => {
          const istAktiv = aktiv === stufe.wert;
          return (
            <div
              key={stufe.wert}
              className="min-w-0 flex-1 cursor-pointer text-center"
              onClick={() => onWaehlen(istAktiv && stufe.wert !== "alle" ? "alle" : stufe.wert)}
            >
              <div
                className={`${stufe.farbe} text-white text-sm font-semibold py-2 rounded-md transition-opacity ${
                  istAktiv
                    ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
                    : "hover:opacity-90 opacity-90"
                }`}
              >
                {stufe.anzahl}
              </div>
              <span
                className={`mt-1 block text-[10px] leading-tight ${
                  istAktiv ? "text-foreground font-semibold" : "text-muted-foreground"
                }`}
              >
                {stufe.label}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
