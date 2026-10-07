/**
 * Der Startstand einer noch leeren Selbstauskunft, vorbelegt aus dem
 * vorherigen Investment.
 *
 * Das Formular baut sich diesen Stand beim Öffnen selbst. Zwei Wege gehen
 * aber am Formular vorbei und brauchen ihn trotzdem:
 *
 *  - Die Einladung an den Kunden. Sie schickt den Stand mit, denn im
 *    Kundenportal gibt es keinen Zugriff auf die anderen Investments.
 *  - Der Versand der Selbstauskunft als ausfüllbare PDF.
 *
 * Eigenes Modul, damit weder der Store noch saQuelle das Formular importieren
 * müssen. Die leeren Vergleichswerte liegen im Formular, die Auswahlregel in
 * saQuelle, und hier treffen sich beide.
 */
import { EMPTY_DATA, EMPTY_PERSON, type SelbstauskunftData } from "@/components/selbstauskunft/SelbstauskunftForm";
import { getSaDataZurVorbelegung } from "./investmentsStore";
import { vorbelegterSaStand } from "./saVorbelegung";

/**
 * Die Angaben, mit denen ein Investment ohne eigene Selbstauskunft startet.
 *
 * Null heißt: Es gibt nichts zu übernehmen, das Formular bleibt leer.
 */
export function saStartstandFuerInvestment(
  kontaktId: string,
  investmentId: string,
): SelbstauskunftData | null {
  const stand = vorbelegterSaStand(
    getSaDataZurVorbelegung(kontaktId, investmentId),
    EMPTY_DATA as unknown as Record<string, unknown>,
    EMPTY_PERSON as unknown as Record<string, unknown>,
  );
  return (stand as unknown as SelbstauskunftData) || null;
}
