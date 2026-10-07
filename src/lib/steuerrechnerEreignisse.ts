/**
 * Zaehler fuer den Trichter des Steuerrechners.
 *
 * Dieselbe Frage wie beim Analysetool: Wie viele Interessenten kommen bis zum
 * Ergebnis, und wie viele tragen sich danach ein? Und derselbe Grundsatz:
 * ohne jeden Personenbezug, nur Art des Ereignisses, Vertriebspartner und
 * Zeitpunkt. Fehler werden verschluckt, ein Zaehler darf nie den Ablauf fuer
 * den Interessenten stoeren.
 *
 * WICHTIG, BITTE VOR DEM AUSWERTEN LESEN:
 *
 * Gezaehlt wird seit dem 18.09.2026 ueber die Edge Function
 * `analyse-ereignis`, nicht mehr aus dem Browser heraus in die Tabelle. Der
 * Grund steht in `analysetoolEreignisse.ts`: Der direkte Weg stand jedem
 * Skript offen. Die Function begrenzt je Anschluss und faengt auch die
 * Faelle ab, in denen eine Spalte in der Datenbank noch fehlt.
 *
 * Geschrieben wird in dieselbe Tabelle `analysetool_ereignisse`, aber mit einer
 * zusaetzlichen Spalte `werkzeug`. Fehlt sie, weist Postgres den Insert
 * zurueck, die Function versucht es ohne die neueren Spalten noch einmal und
 * es wird notfalls schlicht nichts gezaehlt. Der Rechner laeuft davon
 * unberuehrt.
 *
 * Warum nicht einfach ohne die Spalte in die vorhandenen vier Ereignisarten
 * schreiben: Dann waeren die Zahlen des Analysetools ab sofort falsch, weil
 * `analysetool_trichter` beide Werkzeuge zusammenzaehlen wuerde, ohne dass es
 * irgendwo sichtbar waere. Lieber gar keine Zahl als eine stille Verfaelschung
 * einer bestehenden Auswertung.
 *
 * DAZU SEIT DER BEZAHLTEN WERBUNG: DIE KAMPAGNE
 *
 * Der Rechner laeuft ohne Kuerzel in Anzeigen. Damit sich eine Anzeige
 * bewerten laesst, reicht die Zahl der Leads am Ende nicht, man braucht die
 * Absprungrate davor. Deshalb geht `kampagne` mit, gelesen aus der Adresse
 * ueber `kampagnenKennung.ts`. Die Spalte dafuer kommt mit der Migration
 * 20260908170000. Schlaegt der Insert in der Function fehl, weil sie noch
 * fehlt, wird er dort ein zweites Mal ohne sie versucht: Lieber der Trichter
 * ohne Kampagnen als gar kein Trichter.
 */
import { sendeZaehlEreignis, type AnalyseEreignis } from "@/lib/analysetoolEreignisse";
import { kampagneErfassen, kampagnenName, OHNE_KAMPAGNE } from "@/lib/kampagnenKennung";

/** Kennung dieses Werkzeugs in der Spalte `werkzeug`. */
export const WERKZEUG_STEUERRECHNER = "steuerrechner";

export type SteuerEreignis =
  | "steuer_gestartet"
  | "steuer_beendet"
  | "eintragung_gesehen"
  | "eintragung_abgesendet";

/**
 * Die vier Ereignisarten der Tabelle sind durch eine Pruefbedingung
 * festgelegt. Der Steuerrechner benutzt deshalb dieselben Namen und
 * unterscheidet sich allein ueber `werkzeug`. So bleibt der Trichter beider
 * Werkzeuge vergleichbar.
 */
const AUF_SPALTE: Record<SteuerEreignis, AnalyseEreignis> = {
  steuer_gestartet: "analyse_gestartet",
  steuer_beendet: "analyse_beendet",
  eintragung_gesehen: "eintragung_gesehen",
  eintragung_abgesendet: "eintragung_abgesendet",
};

/** Im Speicher gehalten, damit dasselbe Ereignis je Sitzung nur einmal zaehlt. */
const bereitsGezaehlt = new Set<string>();

/**
 * Der Kampagnenname fuer die Spalte `kampagne`, oder `null` ohne Kampagne.
 *
 * `null` und nicht "Ohne Kampagne": Ein Text saehe in der Auswertung aus wie
 * eine echte Kampagne. Die Beschriftung macht die Oberflaeche.
 */
function kampagneFuerZaehler(): string | null {
  const name = kampagnenName(kampagneErfassen());
  return name === OHNE_KAMPAGNE ? null : name;
}

export async function protokolliereSteuerEreignis(
  typ: SteuerEreignis,
  beraterId?: string | null,
): Promise<void> {
  const schluessel = `${typ}:${beraterId || ""}`;
  if (bereitsGezaehlt.has(schluessel)) return;
  bereitsGezaehlt.add(schluessel);
  await sendeZaehlEreignis({
    typ: AUF_SPALTE[typ],
    werkzeug: WERKZEUG_STEUERRECHNER,
    berater_id: beraterId || null,
    kampagne: kampagneFuerZaehler(),
  });
}

/** Nur fuer Tests: den Merker leeren. */
export function _steuerZaehlerZuruecksetzen(): void {
  bereitsGezaehlt.clear();
}
