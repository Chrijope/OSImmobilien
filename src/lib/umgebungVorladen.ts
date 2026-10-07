import { geocode, umgebung, istVorgeladen } from "@/lib/umgebung";
import type { ObjektData } from "@/lib/objekteStore";

/**
 * Die Lagedaten aller Objekte im Hintergrund holen, damit die Karte beim
 * Öffnen sofort steht.
 *
 * Ohne das dauert es beim ersten Aufruf einige Sekunden: erst die Adresse
 * auflösen, dann OpenStreetMap nach der Umgebung fragen. Im Kundengespräch
 * ist das eine Wartezeit zu viel.
 *
 * Das Vorladen ist bewusst langsam.
 *
 * OpenStreetMap ist ein Spendenprojekt mit strenger Drosselung. Beim Testen
 * kamen bei mehreren Anfragen kurz hintereinander "429 zu viele Anfragen" und
 * Zeitüberschreitungen zurück. Alle Objekte gleichzeitig abzufragen würde also
 * genau das Gegenteil bewirken: gar keine Daten statt schneller Daten.
 *
 * Deshalb eines nach dem anderen, mit Pause dazwischen, und nur was noch
 * nicht im Speicher liegt. Der Nutzer merkt davon nichts, es läuft neben
 * seiner Arbeit her. Beim zweiten Anmelden ist ohnehin fast alles schon da,
 * weil die Ergebnisse dreißig Tage im Browser bleiben.
 */

/** Pause zwischen zwei Objekten. Erfahrungswert, darunter kommen 429er. */
const PAUSE_MS = 3000;

/** Nicht endlos laufen. Mehr als das schafft eine Sitzung ohnehin nicht. */
const HOECHSTENS = 40;

let laeuft = false;

function adresseVon(o: ObjektData): string {
  return `${o.adresse || ""}, ${o.plz || ""} ${o.ort || ""}`.trim().replace(/^,\s*/, "");
}

/**
 * Startet das Vorladen. Mehrfaches Aufrufen ist harmlos, es läuft nur einmal.
 *
 * Gibt nichts zurück und wirft nie: Das Vorladen ist eine Bequemlichkeit, kein
 * Vorgang, dessen Scheitern jemanden interessieren müsste. Die Karte holt sich
 * fehlende Daten beim Öffnen selbst.
 */
export function umgebungVorladen(objekte: ObjektData[]): void {
  if (laeuft || typeof window === "undefined") return;

  const offen = objekte
    .map(adresseVon)
    .filter((a) => a.length > 5)
    // Zwei Objekte in derselben Straße brauchen nur eine Abfrage.
    .filter((a, i, alle) => alle.indexOf(a) === i)
    .filter((a) => !istVorgeladen(a))
    .slice(0, HOECHSTENS);

  if (offen.length === 0) return;
  laeuft = true;

  void (async () => {
    for (const adresse of offen) {
      try {
        const k = await geocode(adresse);
        await umgebung(k.lat, k.lng);
      } catch {
        // Eine Adresse, die sich nicht auflösen lässt, hält die übrigen nicht auf.
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    laeuft = false;
  })();
}

/** Nur für Tests: den Riegel zurücksetzen. */
export function _vorladenZuruecksetzen(): void {
  laeuft = false;
}
