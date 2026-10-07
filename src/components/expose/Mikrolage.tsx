import "./exposeLageGrundriss.css";
import { Umgebungsansicht } from "@/components/umgebung/Umgebungsansicht";
import type { ExposeInhalt } from "@/lib/exposeInhalt";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";

/**
 * Abschnitt 3, Mikrolage: links die Karte, rechts ein eigener Kasten mit den
 * drei Gruppen der Vorlage, der in sich scrollt. Auf schmalen Bildschirmen
 * steht der Kasten unter der Karte.
 *
 * SEIT DEM 23.09.2026 OHNE ZUSTIMMUNGSKNOPF
 *
 * Vorher lud die Karte erst nach einem Klick, geokodierte dabei die Adresse
 * und fragte die Umgebung live ab; darunter standen die Punktlisten
 * „Mikrolage“ und „Makrolage“. Christian will die Karte sofort sehen. Die
 * Listen kommen ausschließlich aus der gemessenen Standortanalyse
 * (`meta.standortanalyse`, schema 2): Lage des Objekts und die Einrichtungen
 * samt Koordinaten liegen dort schon, geladen werden nur die Kartenbilder.
 *
 * OHNE GEMESSENE ANALYSE
 *
 * Bis zum Abend des 23.09.2026 fiel der ganze Abschnitt weg, wenn die Analyse
 * fehlte, samt Karte und Kartenknopf im Kopf. Christian hielt die Karte für
 * gelöscht. Jetzt steht der Abschnitt da, sobald die Adresse reicht. Die
 * Nadel nimmt ihren Punkt nur aus gespeicherten Daten am Objekt: zuerst aus
 * der gemessenen Analyse, sonst aus `meta.koordinaten` (Investagon-Import
 * oder Messung, siehe `_shared/objekt-koordinaten.ts`). Fehlt beides, steht
 * statt der Karte ein ruhiger Satz mit einem Link zu OpenStreetMap, den der
 * Besucher selbst anklickt.
 *
 * KEINE ADRESSSUCHE IM BROWSER (Christian, 23.09.2026). Eine Suche bei
 * Photon hätte die IP-Adresse jedes Besuchers an Komoot gegeben. Hier geht
 * keine Anfrage an einen Geodienst hinaus; geladen werden nur die
 * Kartenbilder von OpenStreetMap, und das sagen die rechtlichen Hinweise.
 * Zwei Tests wachen darüber (`ExposeAnsicht.test.tsx` und, für den ganzen
 * `src/`-Baum, `keinGeodienstImBrowser.test.ts`).
 *
 * Die Karte ist Leaflet, dieselbe wie in `UmgebungsKarte`. Auf ihr stehen
 * die Punkte der Umgebung und, als Bezugspunkt, die Nadel des Objekts.
 *
 * MIKRO- UND MAKROLAGE IM KASTEN (seit dem 24.09.2026)
 *
 * Christian will rechts neben der Karte beides sehen. Oben die Mikrolage, das
 * sind die drei Gruppen wie bisher. Darunter die Makrolage: Hochschulen und
 * Krankenhäuser aus derselben Messung (`makrolage.ts`). Die Makrolage steht
 * nur in der Liste, nicht auf der Karte: Orte in zehn Kilometern zögen den
 * Ausschnitt so weit auf, dass von der Straße nichts mehr zu erkennen wäre.
 */

/*
 * UMGEBUNGSPUNKTE (seit dem 24.09.2026)
 *
 * Christian: Auf der Karte die Punkte der Umgebung farbig nach Kategorie mit
 * Legende, rechts daneben nach Kategorien geordnet je die nächsten fünf bis
 * zehn Orte. Karte und Kasten sind seitdem dieselben wie auf Objekt- und
 * Einheitenseite (`components/umgebung/Umgebungsansicht`), die Kategorien
 * kommen aus `umgebungspunkte.ts`. Die drei alten Gruppen
 * (`inhalt.mikrolage.analyse`) liest nur noch das PDF.
 */

export function Mikrolage({ mikrolage, titel }: { mikrolage: ExposeInhalt["mikrolage"]; titel: string }) {
  // Kundensprache, Etappe 3: Exposé und Kundenlink setzen die Sprache über den Kontext, das CRM bleibt deutsch.
  const sprache = useAnzeigeSprache();
  if (!mikrolage.umgebung && !mikrolage.koordinaten && !mikrolage.adresseReicht) return null;
  return (
    <Umgebungsansicht
      umgebung={mikrolage.umgebung}
      lage={mikrolage.koordinaten}
      adresse={mikrolage.adresse}
      titel={titel}
      variante="expose"
      sprache={sprache}
    />
  );
}
