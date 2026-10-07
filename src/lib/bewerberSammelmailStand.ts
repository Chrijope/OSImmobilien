import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVersandRunde } from "@/lib/bewerberVersandRunde";
import type { NachfassAusschluss } from "../../supabase/functions/_shared/bewerber-nachfass";

/**
 * Wer die Sammelmail zum Kennenlernen noch nicht hat, und wen sie nie
 * erreichen wird.
 *
 * ## Warum das überhaupt eine Frage ist
 *
 * Am 12.09.2026 lief die erste Welle. Sie ging an 36 von 166 Bewerbern im
 * Eingang, weil bis dahin ein ausgefüllter Vorab-Bogen ausschloss. Christian
 * hat das an demselben Tag geändert, ein zweiter Durchgang ist vorbereitet,
 * aber gelaufen ist er womöglich nie. Seither liegen im Eingang Bewerber mit
 * und ohne diese Mail nebeneinander, und man sieht es ihnen nicht an.
 *
 * ## Warum die Antwort vom Server kommt und nicht aus dem Zwischenspeicher
 *
 * Der Merker `klNachfassMailAm` steht zwar in der Bewerberzeile und damit im
 * Zwischenspeicher. Er allein reicht aber nicht: „Hat die Mail nicht" ist nur
 * dann eine offene Aufgabe, wenn der Bewerber sie überhaupt bekommen könnte.
 * Dazu gehören zwei Angaben, die das CRM nicht hat.
 *
 * 1. **Der Kennenlernbogen.** Wer ihn abgeschickt hat, braucht keine
 *    Aufforderung mehr. Er steht in `bewerber_formular`, einer Tabelle, die
 *    die Liste nicht lädt.
 * 2. **Die Sperrliste.** Steht die Adresse in `suppressed_emails`, geht an
 *    sie keine Mail mehr hinaus, auch keine zukünftige. Diese Tabelle darf
 *    laut Zeilensicherheit nur Admin und Inhaber lesen. Die HR-Managerin
 *    bekäme von einer Abfrage aus dem Browser heraus stillschweigend null
 *    Zeilen, also ein falsches Bild, und ein falsches Bild ist hier schlimmer
 *    als gar keines.
 *
 * Deshalb fragt dieses Modul die Vorschau von `send-bewerber-nachfass`. Sie
 * rechnet mit der Service-Rolle, sieht beide Tabellen und benutzt dieselbe
 * Auswahlregel wie der echte Versand. Damit gibt es die Regel einmal: Was hier
 * als „Sammelmail fehlt" erscheint, ist genau die Liste, die beim nächsten
 * Versand angeschrieben würde.
 *
 * Der Aufruf ändert nichts. Er ist die Vorschau, die der Versanddialog beim
 * Öffnen ohnehin holt.
 */

/** Was bei einem Bewerber offen ist. */
export type SammelmailKennzeichen =
  /** Er würde beim nächsten Versand angeschrieben. */
  | "fehlt"
  /** Seine Adresse ist gesperrt. Kein Versand hilft, hier muss ein Mensch ran. */
  | "adresse_gesperrt";

export type SammelmailStand = {
  /** Erst wenn das stimmt, darf die Oberfläche etwas behaupten. */
  geladen: boolean;
  /** Bewerberkennung auf Kennzeichen. Wer fehlt, hat nichts Offenes. */
  kennzeichen: Record<string, SammelmailKennzeichen>;
  /** Konnte die Vorschau nicht geladen werden, steht hier der Grund. */
  fehler: string;
};

const LEER: SammelmailStand = { geladen: false, kennzeichen: {}, fehler: "" };

/**
 * Der Text im Kennzeichen und in der Akte.
 *
 * **Nicht „Sammelmail".** Christian hat am 14.09.2026 darauf bestanden, und zu
 * Recht: Für den Bewerber gibt es nur eine Sache, nämlich die Mail mit dem
 * Link zum Kennenlernbogen. Ob sie ihn automatisch beim Anlegen erreicht hat
 * oder über einen Sammelversand, ist unsere Unterscheidung, nicht seine. Ein
 * Kennzeichen, das nach dem Versandweg fragt statt nach dem Ergebnis, hat
 * genau den Fehler erzeugt, der darunter beschrieben ist.
 */
export const SAMMELMAIL_TEXTE: Record<SammelmailKennzeichen, string> = {
  fehlt: "Eingangsmail zum Kennenlernbogen fehlt",
  adresse_gesperrt: "Adresse gesperrt, erreicht uns nicht per Mail",
};

/** Die längere Erklärung, für den Zeigetext und die Akte. */
export const SAMMELMAIL_ERKLAERUNG: Record<SammelmailKennzeichen, string> = {
  fehlt:
    "Dieser Bewerber hat noch keine Mail mit dem Link zum Kennenlernbogen bekommen, weder beim " +
    "Anlegen noch über einen Sammelversand. Beim nächsten Versand wäre er dabei.",
  adresse_gesperrt:
    "Die Mailadresse steht auf der Sperrliste, etwa nach einem Bounce oder einer Abmeldung. " +
    "An sie geht keine Mail mehr hinaus, auch keine künftige. Hier hilft nur ein Anruf oder " +
    "das Schließen des Falls.",
};

let _stand: SammelmailStand = LEER;
let _laeuft: Promise<SammelmailStand> | null = null;
const _hoerer = new Set<(stand: SammelmailStand) => void>();

function melden(stand: SammelmailStand) {
  _stand = stand;
  for (const h of _hoerer) h(stand);
}

type VorschauAntwort = {
  empfaenger?: Array<{ id: string }>;
  ausgeschlossen?: NachfassAusschluss[];
};

/**
 * Die Vorschau holen. Mehrfache Aufrufe teilen sich denselben Lauf, damit
 * nicht jede Liste und jede Karte die Function einzeln anstößt.
 */
export function ladeSammelmailStand(neuLaden = false): Promise<SammelmailStand> {
  if (!neuLaden && _stand.geladen) return Promise.resolve(_stand);
  if (_laeuft) return _laeuft;

  _laeuft = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("send-bewerber-nachfass", {
        body: { modus: "vorschau" },
      });
      if (error) throw error;
      const antwort = (data || {}) as VorschauAntwort;
      const kennzeichen: Record<string, SammelmailKennzeichen> = {};
      for (const e of antwort.empfaenger || []) {
        if (e?.id) kennzeichen[e.id] = "fehlt";
      }
      for (const a of antwort.ausgeschlossen || []) {
        if (a?.id && a.grund === "Adresse gesperrt") kennzeichen[a.id] = "adresse_gesperrt";
      }
      melden({ geladen: true, kennzeichen, fehler: "" });
    } catch (e) {
      /*
       * Kein Toast und keine Fehlermeldung in der Liste. Das Kennzeichen ist
       * eine Zusatzinformation; fällt sie aus, fehlt sie, und die Liste
       * arbeitet weiter wie bisher. Eine rote Meldung über einer ganzen
       * Bewerberliste wäre die größere Störung.
       */
      const grund = (e as { message?: string })?.message || "Vorschau nicht abrufbar";
      console.error("[Sammelmail] Stand nicht abrufbar", e);
      melden({ geladen: false, kennzeichen: {}, fehler: grund });
    } finally {
      _laeuft = null;
    }
    return _stand;
  })();

  return _laeuft;
}

/** Nur für Tests: den Speicher wieder leeren. */
export function setzeSammelmailStandZurueck() {
  _stand = LEER;
  _laeuft = null;
}

/**
 * Der Stand für eine Ansicht.
 *
 * `aktiv` steuert, ob überhaupt geladen wird. Das bestehende
 * Bewerbungsmanagement braucht den Stand nicht, und eine Function, die beim
 * Öffnen jeder Bewerberliste anläuft, wäre eine stille Dauerlast.
 */
export function useSammelmailStand(aktiv: boolean): SammelmailStand {
  const [stand, setStand] = useState<SammelmailStand>(_stand);
  // Nach einem Versand neu fragen. Der gemerkte Stand ist dann veraltet, und
  // die Liste behauptete sonst nach der Aktion dasselbe wie davor.
  const runde = useVersandRunde();

  useEffect(() => {
    if (!aktiv) return;
    _hoerer.add(setStand);
    void ladeSammelmailStand(runde > 0);
    return () => {
      _hoerer.delete(setStand);
    };
  }, [aktiv, runde]);

  return aktiv ? stand : LEER;
}
