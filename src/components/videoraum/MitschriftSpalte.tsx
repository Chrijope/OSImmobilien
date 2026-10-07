import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, FileText, Square, Play, Check } from "lucide-react";
import {
  formatiereZeit, starteMitschrift,
  type MitschriftLauf, type MitschriftStatus, type MitschriftZeile,
} from "@/lib/mitschrift";
import { sendeMitschriftHinweis } from "@/lib/videoraumStore";

/**
 * Die Mitschrift waehrend des Gespraechs.
 *
 * Sie laeuft ausschliesslich im Browser des Gastgebers: Das Modell liegt im
 * eigenen Speicher, der Ton verlaesst das Geraet nicht. Deshalb gibt es auch
 * keinen fremden Dienst, dem irgendetwas zu erlauben waere.
 *
 * Zwei Dinge sind hier bewusst nicht bequem gemacht:
 *
 *   - Ohne bestaetigte Zustimmung startet nichts. Der Haken ist keine Formalie,
 *     sondern die einzige Stelle, an der das Fragen ueberhaupt festgehalten wird.
 *   - Solange mitgeschrieben wird, sieht auch der Gast einen Hinweis in seiner
 *     Kopfzeile. Eine Mitschrift, von der nur eine Seite weiss, waere eine
 *     heimliche Aufzeichnung.
 *
 * Das Gespraech darf von alldem nie betroffen sein. `starteMitschrift` wirft
 * nicht, und faellt das Modell aus, steht hier eine Meldung und sonst nichts.
 */

export interface MitschriftSpalteProps {
  /** Der eigene Ton. Fehlt er, ist noch nichts zu erkennen. */
  lokalerStream: MediaStream | null;
  /**
   * Ton und Name je Gegenstelle, bis zu drei. Die Namen werden zu den
   * Sprechernamen in der Mitschrift.
   */
  gegenstellen: Array<{ name: string; stream: MediaStream | null }>;
  /** Anzeigename des Gastgebers, Vorgabe "Berater". */
  eigenerName?: string;
  /** Token des Raums, fuer den Hinweis an den Gast. */
  token: string;
  /** Wird beim Stoppen gerufen, damit die Seite speichern kann. */
  aufFertig: (zeilen: MitschriftZeile[], dauerSekunden: number, begonnenAt: string) => void | Promise<void>;
  /** Meldet der Seite, ob gerade mitgeschrieben wird. Fuer den Hinweis oben. */
  aufLaeuft?: (laeuft: boolean) => void;
  /**
   * Reicht der Seite die Funktion hinaus, die eine laufende Mitschrift
   * beendet und speichert. Die Seite ruft sie beim Auflegen: Wer das
   * Gespraech beendet, ohne vorher auf "Mitschrift beenden" zu klicken,
   * soll das Transkript trotzdem in der Kundenakte haben. Laeuft nichts,
   * ist der Aufruf folgenlos. Beim Aushaengen wird mit null abgemeldet.
   */
  registriereBeenden?: (stoppen: (() => Promise<void>) | null) => void;
}

const STATUS_TEXT: Record<MitschriftStatus, string> = {
  aus: "Nicht gestartet.",
  modell_laedt: "Spracherkennung wird geladen, das dauert beim ersten Mal einen Moment…",
  laeuft: "Mitschrift läuft.",
  beendet: "Mitschrift beendet.",
  fehler: "Die Mitschrift ist nicht verfügbar.",
};

export function MitschriftSpalte({
  lokalerStream,
  gegenstellen,
  eigenerName = "Berater",
  token,
  aufFertig,
  aufLaeuft,
  registriereBeenden,
}: MitschriftSpalteProps) {
  // Fuer den Zustimmungssatz: alle Namen, mit "und" verbunden.
  const gaesteNamen = gegenstellen.map((g) => g.name).filter(Boolean).join(" und ");
  const [zugestimmt, setZugestimmt] = useState(false);
  const [status, setStatus] = useState<MitschriftStatus>("aus");
  const [meldung, setMeldung] = useState<string | null>(null);
  const [zeilen, setZeilen] = useState<MitschriftZeile[]>([]);
  const [startet, setStartet] = useState(false);
  const laufRef = useRef<MitschriftLauf | null>(null);
  const begonnenRef = useRef<string | null>(null);
  const endeRef = useRef<HTMLDivElement | null>(null);

  // Neue Wortmeldungen sollen sichtbar sein, ohne dass jemand scrollt.
  useEffect(() => { endeRef.current?.scrollIntoView({ block: "end" }); }, [zeilen.length]);

  const starten = useCallback(async () => {
    if (laufRef.current || startet) return;
    const spuren = [
      lokalerStream ? { sprecher: eigenerName, stream: lokalerStream } : null,
      ...gegenstellen.map((g) => (g.stream ? { sprecher: g.name || "Gast", stream: g.stream } : null)),
    ].filter(Boolean) as Array<{ sprecher: string; stream: MediaStream }>;
    if (spuren.length === 0) {
      setStatus("fehler");
      setMeldung("Es liegt noch kein Ton an. Bitte warten, bis die Verbindung steht.");
      return;
    }

    setStartet(true);
    setMeldung(null);
    begonnenRef.current = new Date().toISOString();

    // Das schwere Erkennungsbuendel holt `starteMitschrift` selbst per
    // dynamischem Import, es haengt also nicht am Seitenbuendel.
    const lauf = await starteMitschrift({
      spuren,
      aufZeile: (_zeile, alle) => setZeilen([...alle]),
      aufStatus: (s, m) => {
        setStatus(s);
        if (m) setMeldung(m);
        // Der Gast erfaehrt es erst, wenn tatsaechlich mitgeschrieben wird,
        // nicht schon waehrend das Modell laedt.
        if (s === "laeuft") { sendeMitschriftHinweis(token, true); aufLaeuft?.(true); }
        if (s === "fehler" || s === "beendet") aufLaeuft?.(false);
      },
    });
    setStartet(false);

    if (!lauf.istAktiv()) return;
    laufRef.current = lauf;
  }, [lokalerStream, gegenstellen, eigenerName, token, startet, aufLaeuft]);

  const stoppen = useCallback(async () => {
    const lauf = laufRef.current;
    if (!lauf) return;
    laufRef.current = null;
    const dauer = lauf.dauerSekunden();
    const fertig = await lauf.stoppen();
    sendeMitschriftHinweis(token, false);
    aufLaeuft?.(false);
    setZeilen(fertig);
    setStatus("beendet");
    await aufFertig(fertig, dauer, begonnenRef.current ?? new Date().toISOString());
  }, [aufFertig, token, aufLaeuft]);

  /*
   * Die Seite bekommt den Stopper in die Hand, fuer das Auflegen: Endet das
   * Gespraech mit laufender Mitschrift, wird sie beendet und gespeichert
   * statt verworfen. `stoppen` selbst schuetzt vor Doppelaufrufen, der
   * Handgriff hier darf also gefahrlos zusaetzlich zum Knopf existieren.
   */
  useEffect(() => {
    if (!registriereBeenden) return;
    registriereBeenden(stoppen);
    return () => registriereBeenden(null);
  }, [registriereBeenden, stoppen]);

  /*
   * Verlaesst der Gastgeber die Ansicht, ohne gestoppt zu haben, darf die
   * Erkennung nicht im Hintergrund weiterlaufen. Gespeichert wird dabei
   * nichts: Wer die Seite verlaesst, hat nicht auf "Beenden" geklickt.
   */
  useEffect(() => () => {
    if (!laufRef.current) return;
    laufRef.current.abbrechen();
    laufRef.current = null;
    sendeMitschriftHinweis(token, false);
  }, [token]);

  const laeuft = status === "laeuft" || status === "modell_laedt" || startet;

  return (
    // `flex-1` statt `h-full`: Die Hoehe kommt vom Elternteil, nicht aus einem
    // Prozentwert, der sich in einer flachen Spalte auf nichts beziehen kann.
    <div className="flex min-h-0 flex-1 flex-col">
      {/*
        Der Kopf darf schrumpfen und dann fuer sich scrollen. Auf dem Handy ist
        die Spalte flach, und genau hier steht im Fehlerfall die Erklaerung,
        warum es keine Mitschrift gibt. Fest gesetzt wurde sie dort einfach
        abgeschnitten, und der Gastgeber sah nur einen Knopf, der nichts tut.
      */}
      <div className="min-h-0 shrink overflow-y-auto border-b border-white/[0.07] px-4 py-3">
        {/*
          Der Haken bleibt auch nach dem Beenden stehen, und der Knopf laesst
          sich wieder druecken. Vorher war nach dem ersten Stopp Schluss: Wer
          versehentlich beendet hatte, bekam im selben Gespraech keine zweite
          Mitschrift mehr. Die erste ist zu dem Zeitpunkt gespeichert.
        */}
        {!laeuft && (
          <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-relaxed text-white/70">
            {/*
              Eigenes Kaestchen statt des Systemhaekchens: Das native steht auf
              dem dunklen Grund als weisser Block da und sieht aus wie ein
              Fehler in der Darstellung.
            */}
            <input
              type="checkbox"
              checked={zugestimmt}
              onChange={(e) => setZugestimmt(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border border-white/25 bg-white/[0.06] text-[#0B1119] peer-checked:border-[#30E19E] peer-checked:bg-[#30E19E] peer-focus-visible:ring-2 peer-focus-visible:ring-[#30E19E]/40"
            >
              <Check className={`h-[11px] w-[11px] ${zugestimmt ? "" : "opacity-0"}`} strokeWidth={3} />
            </span>
            <span>
              Ich habe {gaesteNamen || "die Gäste"} gefragt und die Zustimmung zur Mitschrift erhalten.
            </span>
          </label>
        )}

        <div className="mt-3 flex items-center gap-2">
          {laeuft ? (
            <button
              type="button"
              onClick={() => void stoppen()}
              disabled={status === "modell_laedt" || startet}
              className="flex items-center gap-1.5 rounded-lg bg-[#E5372B] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              <Square className="h-3 w-3" /> Mitschrift beenden
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void starten()}
              disabled={!zugestimmt}
              className="flex items-center gap-1.5 rounded-lg bg-[#15724F] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              <Play className="h-3 w-3" /> Mitschrift starten
            </button>
          )}
          {(status === "modell_laedt" || startet) && <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />}
        </div>

        <p className={`mt-2 text-[11px] leading-relaxed ${status === "fehler" ? "text-[#FF9C93]" : "text-white/35"}`}>
          {meldung || STATUS_TEXT[status]}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {zeilen.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <FileText className="h-6 w-6 text-white/15" />
            <p className="text-[11.5px] leading-relaxed text-white/30">
              Die Spracherkennung läuft im Browser, der Ton verlässt dieses Gerät nicht.
              Die ersten Wortmeldungen erscheinen nach etwa einer halben Minute.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {zeilen.map((z, i) => (
              <div key={`${z.zeitpunkt}-${i}`} className="text-[12.5px] leading-relaxed">
                <span className="mr-1.5 tabular-nums text-white/30">{formatiereZeit(z.zeitpunkt)}</span>
                <span className="font-semibold text-[#30E19E]">{z.sprecher}:</span>{" "}
                <span className="text-white/75">{z.text}</span>
              </div>
            ))}
            <div ref={endeRef} />
          </div>
        )}
      </div>
    </div>
  );
}
