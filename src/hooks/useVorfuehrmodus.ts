import { useEffect, useState } from "react";
import {
  VORFUEHRMODUS_EREIGNIS,
  istVorfuehrmodusAktiv,
  vorfuehrmodusNeuLesen,
} from "@/lib/vorfuehrmodus";

/**
 * Ist der Vorfuehrmodus gerade an?
 *
 * Der Hook horcht auf das eigene Ereignis und zusaetzlich auf `storage`,
 * damit ein zweiter Tab denselben Zustand zeigt.
 */
export function useVorfuehrmodus(): boolean {
  const [aktiv, setAktiv] = useState(istVorfuehrmodusAktiv);

  useEffect(() => {
    const eigenes = () => setAktiv(istVorfuehrmodusAktiv());
    const fremdes = () => setAktiv(vorfuehrmodusNeuLesen());
    window.addEventListener(VORFUEHRMODUS_EREIGNIS, eigenes);
    window.addEventListener("storage", fremdes);
    return () => {
      window.removeEventListener(VORFUEHRMODUS_EREIGNIS, eigenes);
      window.removeEventListener("storage", fremdes);
    };
  }, []);

  return aktiv;
}
