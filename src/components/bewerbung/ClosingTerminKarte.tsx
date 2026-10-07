import { useEffect, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  updateBewerber, changeBewerberStatus, addNotizEntry, type Bewerber,
} from "@/lib/bewerbungStore";
import { gebuchterTerminText, terminIstVergangen } from "@/lib/bewerberTermine";
import { TerminAbgesagtBadge } from "./TerminAbgesagtBadge";
import type { BewerberBuchungZeile } from "@/lib/bewerberTerminStore";
import { formatDatum } from "@/lib/utils";

/**
 * Die Termin-Karte in der Übersicht des Bewerberprofils.
 *
 * Sie heißt seit dem 11.09.2026 „Videocall Termin". Im Bewerberprozess gibt es
 * nur noch einen regulären Termin, und der heißt so. Die Felder dahinter
 * bleiben unverändert (closingTerminDatum/closingTerminUhrzeit), es ist reine
 * Beschriftung, genau wie beim Reiter und der Stufe.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 *   1. **Der selbst gebuchte Termin** aus dem Videocall-Buchungskalender
 *      (`gebuchterTermin`, aus `buchungen` über `ladeBewerberBuchungen`).
 *      Liegt er vor, stehen sein Datum und seine Uhrzeit im Kasten, und die
 *      Eingabefelder entfallen: Es gibt nichts von Hand einzutragen, was die
 *      Buchung nicht schon sagt.
 *   2. **Der von Hand gepflegte Termin** am Bewerber. Solange keine Buchung
 *      vorliegt, stehen Datum und Uhrzeit hier zum Eintragen bereit. Das ist
 *      der Weg für ein Gespräch, das die HR-Managerin selbst vereinbart, etwa
 *      als Termin ausserhalb unseres Videoraums.
 *
 * Der Sprung auf "Closing" haengt daran, DASS ein Termin steht, nicht daran,
 * wer ihn vereinbart hat.
 *
 * ENTFALLEN am 16.09.2026: der Haken "Bewerber hat sich den Termin selbst
 * gebucht". Er stammte aus der Zeit vor dem Buchungskalender, als eine
 * Behauptung darueber noetig war. Heute ist die Buchung selbst die Tatsache,
 * und die Karte zeigt sie. Damit war der Haken genau dann sichtbar, wenn er
 * falsch war: naemlich nur, solange keine Buchung vorlag. Das Feld
 * `closingTerminSelbstGebucht` bleibt im Datenbestand, wird hier aber nur
 * noch auf falsch zurueckgesetzt und nirgends mehr ausgewertet.
 *
 * Der Weg über Punkt 10 des Erstgesprächsskripts (ErstgespraechsTab) bleibt
 * unberührt; beide schreiben in dieselben Felder und nutzen denselben
 * Statuswechsel über changeBewerberStatus.
 *
 * `children` nimmt den Onboarding-Block auf, der wie bisher in derselben
 * Karte unter dem Termin steht.
 */
export function ClosingTerminKarte({
  b,
  canEdit,
  beraterName,
  beraterEmail,
  autorId,
  onRefresh,
  gebuchterTermin,
  abgesagterTermin,
  children,
}: {
  b: Bewerber;
  canEdit: boolean;
  beraterName: string;
  beraterEmail: string;
  autorId: string;
  onRefresh: () => void;
  /** Der selbst gebuchte Termin, falls einer steht. */
  gebuchterTermin?: BewerberBuchungZeile | null;
  /**
   * Der abgesagte Termin, falls der Bewerber seinen Termin abgesagt hat und
   * seither kein neuer gebucht wurde. Ohne ihn stünde die Karte nach einer
   * Absage wieder da wie bei jemandem, der nie einen Termin hatte: Die Absage
   * räumt Datum und Uhrzeit in der Akte.
   */
  abgesagterTermin?: BewerberBuchungZeile | null;
  children?: ReactNode;
}) {
  const [datum, setDatum] = useState(b.closingTerminDatum || "");
  const [uhrzeit, setUhrzeit] = useState(b.closingTerminUhrzeit || "");

  useEffect(() => {
    setDatum(b.closingTerminDatum || "");
    setUhrzeit(b.closingTerminUhrzeit || "");
  }, [b.id, b.closingTerminDatum, b.closingTerminUhrzeit]);

  const vollstaendig = !!(datum && uhrzeit);
  const terminNeu = datum !== (b.closingTerminDatum || "") || uhrzeit !== (b.closingTerminUhrzeit || "");
  const dirty = terminNeu;
  const vergangen = vollstaendig && terminIstVergangen(datum, uhrzeit);

  const handleSave = () => {
    // Gleiche Felder und gleicher Mechanismus wie Punkt 10 im
    // Erstgesprächsskript: Berater für die Erinnerungsmails mitschreiben und
    // die bereits versandten Erinnerungen nur bei einem neuen Termin
    // zurücksetzen, damit sie für den verschobenen Termin erneut greifen.
    updateBewerber(b.id, {
      closingTerminDatum: datum,
      closingTerminUhrzeit: uhrzeit,
      /*
       * Was hier eingetragen wird, ist nie ein selbst gebuchter Termin: Liegt
       * eine Buchung vor, zeigt die Karte sie an und laesst gar nichts
       * eintragen. Der Wert wird trotzdem geschrieben, damit ein alter Vermerk
       * verschwindet, wenn jemand den Termin von Hand neu setzt.
       */
      closingTerminSelbstGebucht: false,
      closingBeraterName: beraterName,
      ...(beraterEmail ? { closingBeraterEmail: beraterEmail } : {}),
      ...(terminNeu ? { closingRemindersSent: [] } : {}),
    });
    /*
     * Der Sprung ins Closing haengt allein daran, dass ein Termin steht.
     *
     * Nur nach vorn, aus den fruehen Phasen. Aus "FollowUp" springt
     * updateBewerber selbst zurueck (closingRuecksprungStatus), deshalb steht
     * die Stufe hier nicht mit in der Liste.
     */
    const springt = b.status === "Eingang" || b.status === "Erstgespraech";
    if (springt) {
      changeBewerberStatus(b.id, "Closing");
    }
    if (terminNeu) {
      void addNotizEntry(
        b.id,
        `Closing-Termin am ${formatDatum(datum)} um ${uhrzeit} Uhr, von Hand eingetragen.`,
        beraterName,
        autorId,
      );
    }
    onRefresh();
    toast({
      title: springt ? "Termin gespeichert, Status: Closing" : "Termin gespeichert",
      description: `${formatDatum(datum)} um ${uhrzeit} Uhr, von Hand eingetragen.`,
    });
  };

  // Der gebuchte Termin hat Vorrang. Steht er, ist alles gesagt: Datum und
  // Uhrzeit stehen im Kasten, und der Vermerk "vom Bewerber selbst gebucht"
  // wiederholte nur, was die Buchung ohnehin bedeutet.
  const gebuchtText = gebuchterTerminText(gebuchterTermin?.startAt);

  /*
   * Der abgesagte Termin, wenn sonst nichts steht.
   *
   * Dieselbe Rangfolge wie in der Liste (`closingGespraechTermin`): Ein
   * stehender Termin schlägt ihn, und ein von Hand gepflegter Termin ebenso,
   * denn der wurde nach der Absage neu vereinbart.
   */
  const abgesagtText = !gebuchtText && !b.closingTerminDatum
    ? gebuchterTerminText(abgesagterTermin?.startAt)
    : "";

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Videocall Termin</p>
      </div>
      {gebuchtText ? (
        <p className="text-sm font-semibold mt-1" data-testid="videocall-termin-gebucht">
          📅 {gebuchtText}
        </p>
      ) : abgesagtText ? (
        <div className="mt-1 space-y-1" data-testid="videocall-termin-abgesagt">
          <p className="text-sm font-semibold line-through decoration-1">📅 {abgesagtText}</p>
          <TerminAbgesagtBadge />
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Er bleibt im Closing. Trag unten einen neuen Termin ein oder lade ihn noch einmal zur
            Buchung ein.
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold mt-1">
            📅 {formatDatum(b.closingTerminDatum)}
            {b.closingTerminUhrzeit && ` · ${b.closingTerminUhrzeit} Uhr`}
          </p>
          {/*
            Der frühere Vermerk "Vom Bewerber selbst gebucht" ist hier entfallen.
            Er sagte nichts, was Datum und Uhrzeit nicht schon sagen. Der
            Platzhalter für den ungesetzten Termin bleibt unverändert stehen.
          */}
          {!b.closingTerminDatum && !canEdit && (
            <p className="text-[10px] text-muted-foreground mt-1">Noch kein Termin vereinbart</p>
          )}
        </>
      )}

      {canEdit && !gebuchtText && (
        <div className="mt-2 space-y-2">
            <div className="space-y-2">
              {/* Auf dem Handy untereinander: Die eigenen Datums- und
                  Uhrzeitfelder des Telefons brauchen mehr als die halbe
                  Kartenbreite und schneiden sonst ab. */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`closing-datum-${b.id}`} className="text-[10px]">Datum</Label>
                  <Input
                    id={`closing-datum-${b.id}`}
                    type="date"
                    className="h-8 text-sm"
                    value={datum.match(/^\d{4}-\d{2}-\d{2}$/) ? datum :
                      datum.includes(".") ? datum.split(".").reverse().join("-") : ""}
                    onChange={(e) => {
                      const [y, m, d] = e.target.value.split("-");
                      setDatum(d && m && y ? `${d}.${m}.${y}` : "");
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor={`closing-uhrzeit-${b.id}`} className="text-[10px]">Uhrzeit</Label>
                  <Input
                    id={`closing-uhrzeit-${b.id}`}
                    type="time"
                    className="h-8 text-sm"
                    value={uhrzeit}
                    onChange={(e) => setUhrzeit(e.target.value)}
                  />
                </div>
              </div>
              {vergangen && (
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Der Termin liegt in der Vergangenheit.
                </p>
              )}
              {!vollstaendig ? (
                <p className="text-[10px] text-muted-foreground">
                  Erst mit Datum und Uhrzeit kann gespeichert werden, dann springt der Status auf <strong>Closing</strong>.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Für einen Termin, den du selbst vereinbart hast, etwa außerhalb unseres Videoraums.
                  Bucht der Bewerber selbst, steht er hier von allein.
                </p>
              )}
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                onClick={handleSave}
                disabled={!vollstaendig || !dirty}
              >
                <Save className="h-3 w-3 mr-1" /> Termin speichern
              </Button>
            </div>
        </div>
      )}

      {children}
    </Card>
  );
}
