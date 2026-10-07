import type { Gegenstelle } from "@/lib/videoraumVerbindung";

/**
 * Die Regie der Buehne: was gross steht und was klein.
 *
 * Vorher entschied das die Ansicht nebenbei, und zwar an zwei Stellen mit
 * zwei verschiedenen Ergebnissen. Beim Gastgeber blieb waehrend des Teilens
 * die eigene Kamera in der Ecke und der geteilte Inhalt war ueberhaupt nicht
 * zu sehen, beim Gast fuellte er zufaellig die Flaeche, weil dort ohnehin nur
 * eine Gegenstelle stand. Sobald ein zweiter Gast dazukam, rutschte der
 * geteilte Bildschirm in eine Rasterkachel.
 *
 * Deshalb liegt die Entscheidung jetzt hier, in einer Funktion ohne Ansicht
 * und ohne Browser. Beide Seiten fragen dieselbe Regie, also sehen beide
 * dasselbe Bild.
 *
 * Wichtig zum Verstaendnis: Seit dem 18.09.2026 legt das Teilen einen ZWEITEN
 * Strom an. Wer teilt, schickt sein Gesicht und seinen Bildschirm zugleich,
 * und bleibt deshalb mit seiner Kamerakachel in der Reihe stehen.
 *
 * Der alte Weg, bei dem der Bildschirm die Kameraspur ersetzte, ist hier noch
 * abgebildet. Er gilt fuer eine Gegenstelle, die den zweiten Strom nicht
 * ankuendigt, also einen aelteren Stand geladen hat. Dann steckt in ihrem
 * gewohnten Strom der Bildschirm, ihr Gesicht gibt es gerade nirgends, und sie
 * faellt wie frueher aus der Kachelreihe.
 */

/** Wer gerade teilt, aus Sicht eines einzelnen Teilnehmers. */
export interface BuehnenEingang {
  /** Alle Gegenstellen, so wie die Verbindung sie meldet. */
  gegenstellen: readonly Gegenstelle[];
  /**
   * Kennungen der Gegenstellen, die gerade teilen. Sie kommen aus dem
   * Regiebefehl "bildschirm", siehe videoraumVerbindung.
   */
  teilendeGegenstellen: readonly string[];
  /** Teile ich selbst gerade? */
  eigenesTeilen: boolean;
  /** Mein geteilter Bildschirm, fuer die eigene Vorschau. */
  eigenerBildschirm?: MediaStream | null;
  /**
   * Schmale Ansicht, also ein Telefon (unter 768 Pixel).
   *
   * Christian am 18.09.2026: „wenn man mobil in den videoraum eingeloggt ist
   * dann bei zwei soll der bildschirm sich teilen, oben ist gastgeber und
   * unten ueber die breite ist gast, wenn drei oder 4 im videoraum sind dann
   * bitte den bildschirm 4 teilen". Am Rechner bleibt alles, wie es ist.
   */
  schmal?: boolean;
  /**
   * Bin ich der Gastgeber?
   *
   * Nur fuer die Reihenfolge beim Stapeln auf dem Telefon: Oben steht der
   * Gastgeber, auf beiden Seiten. Beim Gast ist das sein Gegenueber, beim
   * Gastgeber er selbst.
   */
  istGastgeber?: boolean;
}

/** Was gross auf der Buehne steht. */
export interface GeteilterInhalt {
  /** Mein eigener Bildschirm. Dann ist die grosse Flaeche meine Vorschau. */
  eigen: boolean;
  /** Wessen Bildschirm es ist. Bei `eigen` bleibt es leer. */
  name: string;
  stream: MediaStream | null;
  /**
   * Der eigene Ton darf nicht mitlaufen, sonst hoert man sich selbst.
   *
   * Bei einem fremden Bildschirm haengt es daran, wo die Stimme liegt. Kommt
   * er als eigener Strom, steckt die Stimme im Alltagsstrom und damit in der
   * Kamerakachel, die weiterhin dasteht: Dann muss die grosse Flaeche stumm
   * bleiben, sonst laeuft dieselbe Stimme zweimal. Nur beim alten Weg, wo die
   * Gegenstelle ihre einzige Videospur austauscht, haengt die Stimme am selben
   * Strom und muss hier zu hoeren sein.
   */
  stumm: boolean;
}

export interface Buehnenbild {
  /**
   * Wie die Flaeche aufgeteilt ist.
   *
   * "gestapelt" gilt, wenn genau zwei im Raum sind, also ich und ein
   * Gegenueber. Dann stehen beide Kamerabilder gleich gross uebereinander.
   * "kameras" bleibt fuer alles andere ohne Teilen: allein warten, oder ab
   * drei Personen ein Raster. "teilen" gilt, solange jemand etwas zeigt.
   */
  art: "kameras" | "gestapelt" | "teilen";
  /** Nur bei "teilen" gesetzt. */
  geteilt: GeteilterInhalt | null;
  /**
   * Die Kamerakacheln der Gegenstellen, in unveraenderter Reihenfolge.
   *
   * Wer teilt, bleibt hier stehen: Sein Gesicht kommt seit dem 18.09.2026 als
   * eigener Strom neben dem Bildschirm an. Nur eine Gegenstelle mit aelterem
   * Stand, die ihre einzige Videospur austauscht, faellt heraus, denn ihr
   * Gesicht gibt es waehrenddessen nirgends.
   */
  kameras: Gegenstelle[];
  /**
   * Wo das eigene Kamerabild steht.
   *
   * "kachel" heisst gleichberechtigt neben dem Gegenueber, bei genau zwei
   * Personen im Raum. Man sieht sich dann in voller Groesse und braucht kein
   * kleines Fenster mehr.
   *
   * "reihe" gilt waehrend des Teilens: Die Ecke laege sonst auf dem geteilten
   * Inhalt und deckte ausgerechnet dort etwas zu, wo der Kunde hinsieht.
   *
   * "raster" gilt nur auf dem Telefon ab drei Personen: Dort wird die Flaeche
   * geviertelt, und das eigene Bild ist eines der Viertel. Am Rechner bleibt
   * es in der Ecke, dort ist genug Platz.
   *
   * "ecke" bleibt fuer den Rest: allein im Raum, oder am Rechner ab drei
   * Personen, wo das Raster den Platz schon aufteilt.
   */
  eigenesBild: "ecke" | "reihe" | "kachel" | "raster";
  /**
   * Die Kacheln nehmen die volle Breite, statt ihr Format zu behalten.
   *
   * Nur beim Stapeln auf dem Telefon. Am Rechner behaelt jede Kachel die Form
   * ihres Bildes, dort ist die Flaeche breit genug fuer beides. Auf einem
   * Telefon waere eine formattreue Kachel ein schmaler Streifen in der Mitte:
   * Ein hochkantes Bild in einer halben Telefonhoehe ist nur rund 180 Pixel
   * breit, und links und rechts davon liegen 85 Pixel ungenutzt.
   *
   * Beschnitten wird trotzdem nichts, das hat Christian am 18.09.2026
   * ausdruecklich entschieden: „am handy soll das bild dann nicht beschnitten
   * werden ... dann ist eben oben und unten ein dunkler balken, aber dann ist
   * das so." Der Balken ist der Kachelgrund, ueberall derselbe.
   */
  fuellend: boolean;
  /**
   * Beim Stapeln: Steht mein eigenes Bild oben?
   *
   * Christian: „oben ist gastgeber und unten ueber die breite ist gast." Der
   * Gastgeber steht also auf beiden Seiten oben. Fuer ihn heisst das, er sieht
   * sich selbst oben, fuer den Gast sein Gegenueber.
   */
  eigenesOben: boolean;
}

/**
 * Die Anordnung fuer beide Seiten.
 *
 * Teile ich selbst, hat meine eigene Vorschau Vorrang vor einem fremden
 * Bildschirm. Das ist bewusst so: Wer etwas hinausgibt, muss sehen, was
 * hinausgeht. Sonst teilte jemand sein Postfach, ohne es zu merken.
 *
 * Bei einer fremden Freigabe zaehlt die erste in der Liste, damit beide
 * Seiten dieselbe waehlen. Ohne Strom bleibt es beim Alltagsbild: eine
 * schwarze grosse Flaeche waere schlechter als das gewohnte Kamerabild.
 *
 * Zu zweit stehen beide Bilder gleich gross uebereinander. Das ist Christians
 * Vorgabe vom 18.09.2026 und loest zwei Dinge auf einmal: Man sieht sich
 * selbst, ohne dass ein kleines Fenster dem Gegenueber im Bild steht, und
 * beide Seiten sehen dieselbe Anordnung.
 */
export function bestimmeBuehne(eingang: BuehnenEingang): Buehnenbild {
  const { gegenstellen, teilendeGegenstellen, eigenesTeilen, schmal, istGastgeber } = eingang;
  const alle = [...gegenstellen];

  if (eigenesTeilen) {
    return {
      art: "teilen",
      geteilt: { eigen: true, name: "", stream: eingang.eigenerBildschirm ?? null, stumm: true },
      kameras: alle,
      eigenesBild: "reihe",
      fuellend: false,
      eigenesOben: false,
    };
  }

  const fremd = alle.find((g) => teilendeGegenstellen.includes(g.kennung)
    && (g.bildschirmErwartet || g.stream));
  if (fremd) {
    /*
     * Der Regelfall: ein eigener Strom fuer den Bildschirm. Der Teilende
     * bleibt mit seinem Gesicht in der Kachelreihe stehen, genau das war
     * Christians Vorgabe: „der Gast soll mich beim Teilen auch noch weiter
     * sehen können."
     *
     * `bildschirmErwartet` zaehlt schon vor dem Eintreffen der Spur. Zwischen
     * der Ankuendigung und der fertigen Aushandlung liegen ein paar hundert
     * Millisekunden; ohne diese Unterscheidung stuende in dieser Zeit das
     * Gesicht gross unter der Ueberschrift „Bildschirm von …". So steht dort
     * stattdessen der Rahmen mit dem Hinweis, dass die Vorschau aufgebaut
     * wird.
     */
    if (fremd.bildschirmErwartet) {
      return {
        art: "teilen",
        geteilt: { eigen: false, name: fremd.name, stream: fremd.bildschirm ?? null, stumm: true },
        kameras: alle,
        eigenesBild: "reihe",
        fuellend: false,
        eigenesOben: false,
      };
    }
    // Der alte Weg: die Gegenstelle hat ihre einzige Videospur ausgetauscht.
    return {
      art: "teilen",
      geteilt: { eigen: false, name: fremd.name, stream: fremd.stream, stumm: false },
      kameras: alle.filter((g) => g.kennung !== fremd.kennung),
      eigenesBild: "reihe",
      fuellend: false,
      eigenesOben: false,
    };
  }

  // Genau zwei im Raum: zwei gleiche Kacheln uebereinander, das Gegenueber
  // oben. Der Blick faellt zuerst auf den anderen, das eigene Bild ist die
  // Kontrolle darunter, wie in jedem anderen Videodienst auch.
  if (alle.length === 1) {
    return {
      art: "gestapelt",
      geteilt: null,
      kameras: alle,
      eigenesBild: "kachel",
      // Auf dem Telefon ueber die volle Breite, am Rechner formattreu.
      fuellend: Boolean(schmal),
      // Der Gastgeber oben, auf beiden Seiten.
      eigenesOben: Boolean(schmal && istGastgeber),
    };
  }

  /*
   * Ab drei Personen auf dem Telefon: die Flaeche geviertelt, das eigene Bild
   * als eines der Viertel. Die Ecke waere hier falsch, sie deckte auf einem
   * schmalen Schirm ein Viertel der Flaeche zu. Bei dreien bleibt ein Viertel
   * frei, bei vieren ist es voll.
   */
  if (schmal && alle.length >= 2) {
    return { art: "kameras", geteilt: null, kameras: alle, eigenesBild: "raster", fuellend: false, eigenesOben: false };
  }

  return { art: "kameras", geteilt: null, kameras: alle, eigenesBild: "ecke", fuellend: false, eigenesOben: false };
}

/**
 * Die Kennungen, die noch teilen, nach einer Meldung.
 *
 * Steht fuer sich, weil hier zwei Dinge zusammenkommen: die Meldung selbst
 * und das Aufraeumen. Wer den Raum verlaesst, sagt nicht eigens Bescheid,
 * dass er nicht mehr teilt. Bliebe seine Kennung stehen, hinge die Buehne
 * bei der naechsten Freigabe an einem Teilnehmer, den es nicht mehr gibt.
 */
export function merkeTeilende(
  bisher: readonly string[],
  kennung: string,
  an: boolean,
  vorhandene: readonly string[],
): string[] {
  const menge = new Set(bisher);
  if (an) menge.add(kennung); else menge.delete(kennung);
  return [...menge].filter((k) => vorhandene.includes(k));
}
