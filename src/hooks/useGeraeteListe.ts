import { useEffect, useState } from "react";
import { listeGeraete, type GeraeteListe } from "@/lib/videocallGeraete";

const LEER: GeraeteListe = { kameras: [], mikrofone: [], lautsprecher: [] };

/**
 * Die verfuegbaren Kameras, Mikrofone und Lautsprecher, laufend aktuell.
 *
 * `bereit` sollte erst wahr sein, wenn die Kamera-Freigabe erteilt ist: Vorher
 * liefert der Browser die Geraete ohne Namen und Kennungen, damit laesst sich
 * keine Auswahl bauen. Wird ein Geraet an- oder abgesteckt, meldet sich
 * `devicechange` und die Liste zieht nach.
 */
export function useGeraeteListe(bereit: boolean): GeraeteListe {
  const [geraete, setGeraete] = useState<GeraeteListe>(LEER);

  useEffect(() => {
    if (!bereit) return;
    let aktiv = true;
    const laden = async () => {
      const liste = await listeGeraete();
      if (aktiv) setGeraete(liste);
    };
    void laden();

    const medien = navigator.mediaDevices;
    const beiWechsel = () => { void laden(); };
    medien?.addEventListener?.("devicechange", beiWechsel);
    return () => {
      aktiv = false;
      medien?.removeEventListener?.("devicechange", beiWechsel);
    };
  }, [bereit]);

  return geraete;
}
