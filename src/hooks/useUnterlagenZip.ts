import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  istAbbruch,
  ladeUnterlageFuerZip,
  packeZip,
  speichereZip,
  zipMeldung,
  type ZipDatei,
} from "@/lib/unterlagenZip";

export interface ZipLauf {
  /** Welcher Knopf den Lauf gestartet hat, damit nur dieser seinen Kreisel zeigt. */
  art: string;
  fertig: number;
  gesamt: number;
}

/**
 * Ein ZIP-Download mit Fortschritt und Abbruch.
 *
 * Es läuft immer nur einer. Verlässt man die Seite mittendrin, wird der Lauf
 * abgebrochen und nichts gespeichert; sonst tauchte Minuten später unerwartet
 * eine Datei im Download-Ordner auf.
 */
export function useUnterlagenZip() {
  const [lauf, setLauf] = useState<ZipLauf | null>(null);
  const steuerung = useRef<AbortController | null>(null);
  const aktiv = useRef(true);

  useEffect(() => {
    aktiv.current = true;
    return () => {
      aktiv.current = false;
      steuerung.current?.abort();
    };
  }, []);

  const starten = useCallback(async (art: string, dateien: ZipDatei[], dateiname: string) => {
    if (steuerung.current) return;
    if (dateien.length === 0) {
      toast.error("Hier liegen keine Dateien zum Herunterladen.");
      return;
    }
    const abbruch = new AbortController();
    steuerung.current = abbruch;
    setLauf({ art, fertig: 0, gesamt: dateien.length });
    try {
      const paket = await packeZip(dateien, {
        laden: ladeUnterlageFuerZip,
        signal: abbruch.signal,
        onFortschritt: ({ fertig, gesamt }) => {
          if (aktiv.current) setLauf({ art, fertig, gesamt });
        },
      });
      const meldung = zipMeldung(paket);
      if (!paket.blob) {
        toast.error(meldung.text);
        return;
      }
      speichereZip(paket.blob, dateiname);
      if (meldung.art === "teilweise") toast.warning(meldung.text);
      else toast.success(meldung.text);
    } catch (e) {
      if (istAbbruch(e)) {
        if (aktiv.current) toast("Download abgebrochen, es wurde nichts gespeichert.");
      } else {
        console.warn("[unterlagenZip] Packen gescheitert", e);
        toast.error("Die ZIP-Datei ließ sich nicht erstellen. Versuch es bitte gleich noch einmal.");
      }
    } finally {
      steuerung.current = null;
      if (aktiv.current) setLauf(null);
    }
  }, []);

  const abbrechen = useCallback(() => steuerung.current?.abort(), []);

  return { lauf, starten, abbrechen };
}
