import { useEffect, useState } from "react";
import { Check, LoaderCircle, Sparkles, TriangleAlert, Undo2, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  vorschlagswertFormatiert,
  type AuslesbaresFeld,
  type Sicherheit,
  type Uebernahmevorschlag,
} from "@/lib/investmentrechner/unterlagenKiFelder";

/*
 * Übernahmeliste der KI-Auslesung im Bereich „Objektunterlagen".
 *
 * Zeigt je Feld den heutigen und den ausgelesenen Wert mit Quelle und
 * Sicherheit. Nichts wird ohne Klick übernommen: Das Häkchen ist nur bei
 * hoher Sicherheit und leerem Feld vorbelegt, geschrieben wird erst mit
 * „Ausgewählte übernehmen". Lade- und Fehlerzustand sind Alerts im Projektstil.
 *
 * Seit dem 28.09.2026 gilt: Die hinterlegten Einheitsdaten sind die
 * Grundlage, die Unterlagen die Gegenprobe. Bestätigt eine Unterlage den
 * Wert, steht das so da. Weicht sie ab, zeigt die Liste beide Werte
 * nebeneinander, und nur ein Klick übernimmt den Wert aus der Unterlage.
 */

export interface KiAuslesung {
  status: "laedt" | "fehler" | "fertig" | "uebernommen";
  vorschlaege: Uebernahmevorschlag[];
  hinweise: string[];
  fehler: string;
  /** Wie viele Felder zuletzt übernommen wurden, nur im Status „uebernommen". */
  uebernommen: number;
}

interface UnterlagenUebernahmeProps {
  auslesung: KiAuslesung;
  onUebernehmen: (felder: Set<AuslesbaresFeld>) => void;
  onSchliessen: () => void;
  /** Einen beim Öffnen automatisch übernommenen Wert zurücknehmen. */
  onZuruecknehmen?: (feld: AuslesbaresFeld) => void;
}

const SICHERHEIT_TEXT: Record<Sicherheit, string> = {
  hoch: "Sicher",
  mittel: "Prüfen",
  niedrig: "Unsicher",
};

export function UnterlagenUebernahme({ auslesung, onUebernehmen, onSchliessen, onZuruecknehmen }: UnterlagenUebernahmeProps) {
  const { status, vorschlaege, hinweise, fehler, uebernommen } = auslesung;
  const [ausgewaehlt, setAusgewaehlt] = useState<Set<AuslesbaresFeld>>(new Set());

  /*
   * Neue Vorschläge, neue Vorbelegung: nur die sicheren Werte für leere
   * Felder angehakt. Die Liste des automatischen Wegs entsteht bei jeder
   * Eingabe neu; zurückgesetzt wird nur, wenn sich ihr Inhalt ändert, sonst
   * verlöre ein gesetztes Häkchen beim Tippen in einem anderen Feld.
   */
  const inhalt = vorschlaege
    .map((v) => `${v.feld}:${String(v.wert)}:${v.abgleich}:${v.vorausgewaehlt}:${v.automatisch ? 1 : 0}`)
    .join("|");
  useEffect(() => {
    setAusgewaehlt(
      new Set(vorschlaege.filter((vorschlag) => vorschlag.vorausgewaehlt).map((vorschlag) => vorschlag.feld)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inhalt]);

  const umschalten = (feld: AuslesbaresFeld, an: boolean) => {
    setAusgewaehlt((bisher) => {
      const naechste = new Set(bisher);
      if (an) naechste.add(feld);
      else naechste.delete(feld);
      return naechste;
    });
  };

  if (status === "laedt") {
    return (
      <Alert className="ki-alert">
        <LoaderCircle className="spin" size={16} />
        <AlertTitle>Unterlagen werden ausgelesen</AlertTitle>
        <AlertDescription>Die KI sucht in den Unterlagen nach den Feldern des Rechners. Das dauert meist unter einer Minute.</AlertDescription>
      </Alert>
    );
  }

  if (status === "fehler") {
    return (
      <Alert variant="destructive" className="ki-alert">
        <TriangleAlert size={16} />
        <AlertTitle>Auslesen nicht möglich</AlertTitle>
        <AlertDescription>
          <p>{fehler}</p>
          <button type="button" className="text-button" onClick={onSchliessen}>
            <X size={14} /> Hinweis schließen
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "uebernommen") {
    return (
      <Alert className="ki-alert">
        <Check size={16} />
        <AlertTitle>
          {uebernommen === 1 ? "Ein Feld übernommen" : `${uebernommen} Felder übernommen`}
        </AlertTitle>
        <AlertDescription>
          <p>Die Werte stehen jetzt in den Eingabebereichen und lassen sich dort jederzeit ändern.</p>
          <button type="button" className="text-button" onClick={onSchliessen}>
            <X size={14} /> Hinweis schließen
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  if (vorschlaege.length === 0) {
    return (
      <Alert className="ki-alert">
        <Sparkles size={16} />
        <AlertTitle>Keine Rechnerfelder gefunden</AlertTitle>
        <AlertDescription>
          <p>In den Unterlagen stand kein Wert, der sich eindeutig einem Feld des Rechners zuordnen lässt.</p>
          {hinweise.length > 0 && (
            <ul className="ki-hinweise">
              {hinweise.map((hinweis, index) => (
                <li key={`${index}-${hinweis}`}>{hinweis}</li>
              ))}
            </ul>
          )}
          <button type="button" className="text-button" onClick={onSchliessen}>
            <X size={14} /> Hinweis schließen
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="ki-uebernahme" aria-label="Aus den Unterlagen ausgelesene Felder">
      <div className="ki-uebernahme-kopf">
        <div>
          <strong>
            {vorschlaege.length === 1 ? "Ein Feld gefunden" : `${vorschlaege.length} Felder gefunden`}
          </strong>
          <small>Angehakt sind nur sichere Werte für leere Felder. Abweichungen von den hinterlegten Daten entscheidest du selbst.</small>
        </div>
        <button type="button" aria-label="Vorschläge verwerfen" onClick={onSchliessen}>
          <X size={14} />
        </button>
      </div>
      <ul className="ki-vorschlaege">
        {vorschlaege.map((vorschlag) => {
          // Ein Feld kann zweimal stehen: automatisch übernommen und als neue Abweichung (LOTSE-R7-004).
          const id = `ki-feld-${vorschlag.feld}${vorschlag.automatisch ? "-automatisch" : ""}`;
          return (
            <li key={id} className={vorschlag.automatisch ? "unveraendert automatisch" : vorschlag.unveraendert ? "unveraendert" : vorschlag.abgleich === "abweichend" ? "abweichend" : ""}>
              <Checkbox
                id={id}
                checked={!vorschlag.automatisch && ausgewaehlt.has(vorschlag.feld)}
                disabled={vorschlag.unveraendert || vorschlag.automatisch}
                onCheckedChange={(an) => umschalten(vorschlag.feld, an === true)}
                aria-label={`${vorschlag.label} übernehmen`}
              />
              <label htmlFor={id}>
                <span className="ki-feld">
                  {vorschlag.label}
                  <em className={`ki-sicherheit ki-sicherheit-${vorschlag.sicherheit}`}>
                    {SICHERHEIT_TEXT[vorschlag.sicherheit]}
                  </em>
                </span>
                {vorschlag.abgleich === "abweichend" ? (
                  <span className="ki-werte" data-testid={`ki-abweichung-${vorschlag.feld}`}>
                    <TriangleAlert size={12} aria-hidden="true" />
                    <span>Hinterlegt: {vorschlagswertFormatiert(vorschlag.einheit, vorschlag.aktuell)}</span>
                    <b>laut {vorschlag.quelle || "Unterlage"}: {vorschlagswertFormatiert(vorschlag.einheit, vorschlag.wert)}</b>
                  </span>
                ) : (
                  <span className="ki-werte">
                    <s>{vorschlagswertFormatiert(vorschlag.einheit, vorschlag.aktuell)}</s>
                    <b>{vorschlagswertFormatiert(vorschlag.einheit, vorschlag.wert)}</b>
                  </span>
                )}
                <small>
                  {vorschlag.automatisch
                    ? `Automatisch übernommen${vorschlag.quelle ? `, laut ${vorschlag.quelle}` : ""}.`
                    : vorschlag.abgleich === "bestaetigt"
                    ? `Stimmt mit den hinterlegten Daten überein${vorschlag.quelle ? `, laut ${vorschlag.quelle}` : ""}`
                    : vorschlag.unveraendert
                      ? "Steht schon so im Rechner"
                      : vorschlag.abgleich === "abweichend"
                        ? "Weicht von den hinterlegten Daten ab. Übernimm den Wert nur, wenn die Unterlage stimmt."
                        : vorschlag.quelle || "Quelle nicht genannt"}
                </small>
              </label>
              {vorschlag.automatisch && onZuruecknehmen && (
                <button type="button" className="text-button" onClick={() => onZuruecknehmen(vorschlag.feld)}>
                  <Undo2 size={14} /> Zurücknehmen
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hinweise.length > 0 && (
        <ul className="ki-hinweise">
          {hinweise.map((hinweis, index) => (
            <li key={`${index}-${hinweis}`}>{hinweis}</li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="button button-primary full-width"
        disabled={ausgewaehlt.size === 0}
        onClick={() => onUebernehmen(new Set(ausgewaehlt))}
      >
        <Check size={16} />
        {ausgewaehlt.size === 0
          ? "Nichts ausgewählt"
          : ausgewaehlt.size === 1
            ? "Ausgewähltes Feld übernehmen"
            : `${ausgewaehlt.size} ausgewählte Felder übernehmen`}
      </button>
    </section>
  );
}
