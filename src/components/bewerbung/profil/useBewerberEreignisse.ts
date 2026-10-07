import { useEffect, useMemo, useState } from "react";
import { useVersandRunde } from "@/lib/bewerberVersandRunde";
import { ladeMailVerlauf } from "@/lib/bewerberVerlaufStore";
import {
  baueBewerberEreignisse,
  type BewerberEreignis,
  type BuchungVerlaufZeile,
  type MailVerlaufZeile,
} from "@/lib/bewerberEreignisse";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Die Ereignisse des geöffneten Bewerbers, fertig für die Anzeige.
 *
 * Alles, was schon in der Akte steht, ist sofort da: Termine, Versandvermerke,
 * Onboarding-Schritte. Nur die Mailzeilen fehlen kurz, denn
 * `bewerber_mail_tracking` liegt nicht im `dataCache` und muss einzeln geholt
 * werden. Solange sagt `laedt` das, statt eine leere Liste als „nichts
 * passiert" auszugeben.
 *
 * Nach einem Versand wird neu gefragt (`useVersandRunde`), sonst zeigte der
 * Verlauf den Stand von davor. Dasselbe Mittel wie in `useMailOeffnungen`.
 */
export function useBewerberEreignisse({
  bewerber,
  buchung,
  kennenlernEingereichtAm,
  vorabEingereichtAm,
}: {
  bewerber: Bewerber | null;
  buchung?: BuchungVerlaufZeile | null;
  kennenlernEingereichtAm?: string;
  vorabEingereichtAm?: string;
}): { ereignisse: BewerberEreignis[]; laedt: boolean } {
  const bewerberId = bewerber?.id || "";
  const [stand, setStand] = useState<{ id: string; mails: MailVerlaufZeile[] }>({ id: "", mails: [] });
  const runde = useVersandRunde();

  useEffect(() => {
    let abgebrochen = false;
    if (!bewerberId) {
      setStand({ id: "", mails: [] });
      return;
    }
    void ladeMailVerlauf(bewerberId).then((mails) => {
      if (!abgebrochen) setStand({ id: bewerberId, mails });
    });
    return () => { abgebrochen = true; };
  }, [bewerberId, runde]);

  const mailsPassen = stand.id === bewerberId;
  const ereignisse = useMemo(
    () =>
      bewerber
        ? baueBewerberEreignisse({
            bewerber,
            mails: mailsPassen ? stand.mails : [],
            buchung,
            kennenlernEingereichtAm,
            vorabEingereichtAm,
          })
        : [],
    [bewerber, mailsPassen, stand.mails, buchung, kennenlernEingereichtAm, vorabEingereichtAm],
  );

  return { ereignisse, laedt: !!bewerberId && !mailsPassen };
}
