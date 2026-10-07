/**
 * Merkt, ob auf dem Server eine neuere Fassung des CRM liegt als die, die
 * gerade im Tab laeuft.
 *
 * Warum es das braucht: Am 18.09.2026 konnte ein Vertriebspartner vier Tage
 * lang bei einem Kunden nichts speichern, jede Eingabe endete mit „Eintrag
 * nicht im Verlauf gespeichert". Die gesamte Berechtigungskette in der
 * Datenbank war in Ordnung. Die Ursache war eine andere: Er hatte die Seite
 * seit dem 14.09. offen und lief deshalb mit dem Programmstand von damals. Ein
 * einziges Neuladen hat es behoben. Bis dahin gab es nichts, was darauf
 * hingewiesen haette.
 *
 * Wie die Erkennung funktioniert: Vite gibt dem gebauten Hauptbuendel einen
 * Namen mit Pruefsumme, `assets/index-CN1gPhdz.js`. Bei jedem Publish aendert
 * sich diese Kennung. Wir lesen die Kennung aus dem eigenen Script-Tag und
 * vergleichen sie mit der Kennung in der frisch geholten `index.html`.
 * Unterscheiden sie sich, liegt eine neue Fassung bereit.
 *
 * Vier Faelle, in denen bewusst nichts geschieht:
 *  a) Im Entwicklungsbetrieb (`npm run dev`) gibt es diese Dateinamen gar
 *     nicht, die Seite laedt `/src/main.tsx`. Die eigene Kennung ist dann
 *     `null`, und die Pruefung startet erst gar nicht.
 *  b) Der Zwischenspeicher des Browsers wuerde ewig den alten Stand liefern,
 *     deshalb `cache: "reload"`.
 *  c) Faellt das Netz aus, schlaegt die Abfrage fehl. Dann passiert nichts,
 *     kein Hinweis, kein Fehler in der Konsole.
 *  d) Findet das Muster nichts, ebenfalls still aussteigen. Lieber kein
 *     Hinweis als ein falscher.
 *
 * Was dann geschieht (seit 26.09.2026, fuer alle): Die App holt
 * `public/versionsnotiz.json` frisch vom Server. Ist darunter ein neuer
 * Eintrag mit `kritisch`, erscheint der Warnstreifen „Bitte kurz neu laden“.
 * Sonst laedt die App beim naechsten Seitenwechsel still neu, einmal je
 * Build. Der Seitenwechsel ist der Moment, in dem die alte Seite schon
 * abgebaut ist und nichts Getipptes mehr offen steht. Mitten auf einer Seite
 * wird nie neu geladen. Fehlt die Notiz, ebenfalls still: Sie kommt mit
 * demselben Publish, ihr Fehlen ist kein Grund fuer einen Streifen.
 */
import { useEffect, useState } from "react";
import { entscheideNeuladen, ladeVersionsnotiz, BEKANNTE_NOTIZ_NR, type NeuladenArt } from "./versionsnotiz";
import { leseNotizFreigaben } from "./neuImCrmZugang";

/** Der Dateiname des Hauptbuendels, die Gruppe ist die Kennung. */
const MUSTER = /assets\/index-([A-Za-z0-9_-]+)\.js/g;

/**
 * Abstand der Pruefung im Hintergrund.
 *
 * Fuenfzehn Minuten, weil der Ausloeser, auf den es wirklich ankommt, die
 * Rueckkehr in den Tab ist. Wer arbeitet, wechselt staendig zwischen Fenstern
 * und wird dadurch ohnehin geprueft. Der Zeitgeber ist nur das Netz darunter,
 * fuer den Tab, der stundenlang im Vordergrund offen steht. Ein Hinweis, der
 * im schlimmsten Fall eine Viertelstunde spaeter kommt, ist voellig
 * ausreichend, wenn das Problem sonst vier Tage unbemerkt bleibt. Kuerzere
 * Abstaende brachten nichts ausser Last: Jeder offene Tab jedes Nutzers fragt
 * sonst mehrmals pro Minute dieselbe Datei ab.
 */
export const PRUEF_ABSTAND_MS = 15 * 60 * 1000;

/**
 * Kuerzester Abstand zwischen zwei Abfragen.
 *
 * Gemeint ist „nach einer Pause zurueckkehren". Wer zwischen zwei Fenstern
 * hin und her springt, loest `visibilitychange` im Sekundentakt aus, und das
 * soll nicht jedes Mal eine Abfrage werden.
 */
export const MINDEST_ABSTAND_MS = 60 * 1000;

/**
 * Alle Kennungen, die in einem Text vorkommen.
 *
 * Mehrzahl mit Absicht: Der Build legt mehr als eine Datei an, die
 * `assets/index-…js` heisst, heute etwa das Einstiegsbuendel und einen
 * nachgeladenen Teil. In der `index.html` steht zwar nur das Einstiegsbuendel,
 * aber Vite haengt dort je nach Aufbau auch Vorlade-Verweise hinein. Wuerden
 * wir nur den ersten Treffer nehmen und der waere einmal ein anderer, gaebe es
 * einen Fehlalarm, und ein Fehlalarm kostet den Nutzer seine ungespeicherten
 * Eingaben, denn er wird klicken. Deshalb gilt: neu ist es nur, wenn die
 * eigene Kennung in der Antwort ueberhaupt nicht mehr vorkommt.
 */
export function kennungenAusText(text: string | null | undefined): string[] {
  if (!text) return [];
  return Array.from(text.matchAll(MUSTER), (t) => t[1]);
}

/** Die erste Kennung in einem Text, oder null. */
export function kennungAusText(text: string | null | undefined): string | null {
  return kennungenAusText(text)[0] ?? null;
}

/**
 * Die Kennung der Fassung, die gerade laeuft, aus den Script-Tags des
 * Dokuments. Im Entwicklungsbetrieb gibt es kein solches Tag, dann `null`.
 */
export function eigeneKennung(dok: Document = document): string | null {
  const quellen = Array.from(dok.querySelectorAll("script[src]"))
    .map((s) => (s as HTMLScriptElement).getAttribute("src") || "");
  for (const quelle of quellen) {
    const kennung = kennungAusText(quelle);
    if (kennung) return kennung;
  }
  return null;
}

/**
 * Sagt, ob ein Hinweis gezeigt werden soll.
 *
 * Nur wenn die eigene Kennung bekannt ist, der Server ueberhaupt eine
 * geliefert hat und die eigene nicht mehr darunter ist. Fehlt eine Angabe,
 * wissen wir nichts, und dann ist kein Hinweis besser als ein falscher.
 */
export function istNeueFassung(
  eigene: string | null,
  vomServer: string[] | null,
): boolean {
  if (!eigene || !vomServer || vomServer.length === 0) return false;
  return !vomServer.includes(eigene);
}

/**
 * Holt die Kennungen vom Server. Gibt `null` zurueck, wenn etwas schiefgeht,
 * und schweigt dabei: kein Wurf, kein Eintrag in der Konsole.
 *
 * `holen` ist nur fuer die Tests da, im Betrieb ist es `fetch`.
 */
export async function ladeKennungenVomServer(
  holen: typeof fetch = fetch,
): Promise<string[] | null> {
  try {
    const antwort = await holen("/", { cache: "reload" });
    if (!antwort.ok) return null;
    const kennungen = kennungenAusText(await antwort.text());
    return kennungen.length > 0 ? kennungen : null;
  } catch {
    return null;
  }
}

/**
 * Startet die Beobachtung und meldet einmalig, sobald eine neuere Fassung
 * bereitliegt. Gibt die Funktion zum Abraeumen zurueck.
 *
 * Danach wird nicht weiter geprueft: Der Hinweis steht, mehr gibt es nicht zu
 * sagen, und er soll nicht wieder verschwinden, nur weil eine spaetere
 * Abfrage am Netz gescheitert ist.
 */
export function starteVersionspruefung(melden: (kennungenVomServer: string[]) => void): () => void {
  const eigene = eigeneKennung();
  // Entwicklungsbetrieb oder unbekannter Aufbau: still gar nicht erst anfangen.
  if (!eigene) return () => { /* nichts zu tun */ };

  let beendet = false;
  let letztePruefung = Date.now();

  const pruefe = async () => {
    if (beendet) return;
    // Im Hintergrund nicht fragen, das waere Last bei jedem offenen Fenster.
    if (document.visibilityState !== "visible") return;
    if (Date.now() - letztePruefung < MINDEST_ABSTAND_MS) return;
    letztePruefung = Date.now();

    const vomServer = await ladeKennungenVomServer();
    if (beendet || !vomServer || !istNeueFassung(eigene, vomServer)) return;
    beendet = true;
    melden(vomServer);
  };

  const beiSichtbarkeit = () => {
    if (document.visibilityState === "visible") void pruefe();
  };

  const zeitgeber = window.setInterval(() => { void pruefe(); }, PRUEF_ABSTAND_MS);
  document.addEventListener("visibilitychange", beiSichtbarkeit);

  return () => {
    beendet = true;
    window.clearInterval(zeitgeber);
    document.removeEventListener("visibilitychange", beiSichtbarkeit);
  };
}

/*
 * Weggeklickt gilt nur fuer diese Seitensitzung.
 *
 * Wer mitten im Kundengespraech tippt, soll den Streifen loswerden koennen,
 * ohne dass der Hinweis damit fuer immer verloren ist. Deshalb
 * `sessionStorage` und nicht `localStorage`: Ein neuer Tab faengt wieder bei
 * null an. Beim naechsten Wechsel zurueck in den Tab kommt der Streifen
 * ohnehin wieder, siehe `useVersionsHinweis`.
 *
 * Alles in try/catch, weil private Fenster und geblockte Seitendaten beim
 * blossen Zugriff werfen koennen.
 */
const AUSGEBLENDET_SCHLUESSEL = "versionshinweis-ausgeblendet";

/** Merkt fuer die laufende Sitzung, dass der Streifen weggeklickt wurde. */
export function merkeAusgeblendet(): void {
  try {
    sessionStorage.setItem(AUSGEBLENDET_SCHLUESSEL, "1");
  } catch { /* private Fenster, dann gilt es eben nur bis zum Neuaufbau */ }
}

/** Wurde der Streifen in dieser Sitzung weggeklickt? */
export function istAusgeblendet(): boolean {
  try {
    return sessionStorage.getItem(AUSGEBLENDET_SCHLUESSEL) === "1";
  } catch {
    return false;
  }
}

/** Nimmt das Wegklicken zurueck, etwa bei der Rueckkehr in den Tab. */
export function hebeAusblendenAuf(): void {
  try {
    sessionStorage.removeItem(AUSGEBLENDET_SCHLUESSEL);
  } catch { /* nichts zu tun */ }
}

/*
 * Einmal still neu laden je Build. Die Kennung des neuen Builds wird vor dem
 * Neuladen gemerkt. Kommt der Tab danach trotzdem mit dem alten Stand hoch
 * (Zwischenspeicher, Auslieferung noch nicht fertig) und erkennt denselben
 * Build wieder, gibt es den Streifen statt eines zweiten stillen Versuchs.
 * `sessionStorage`, weil es genau diesen Tab betrifft und ein Neuladen
 * ueberlebt.
 */
const STILL_SCHLUESSEL = "versionshinweis-still-geladen";

export function merkeStillGeladen(build: string): void {
  try {
    sessionStorage.setItem(STILL_SCHLUESSEL, build);
  } catch { /* private Fenster: dann eben ohne Merker, siehe unten */ }
}

export function istSchonStillGeladen(build: string): boolean {
  try {
    return sessionStorage.getItem(STILL_SCHLUESSEL) === build;
  } catch {
    // Ohne Speicher laesst sich keine Schleife ausschliessen, also lieber
    // gar nicht still neu laden.
    return true;
  }
}

/**
 * Sagt der Oberflaeche, ob eine neuere Fassung bereitliegt, und liefert die
 * Kennungen vom Server. `null`, solange nichts Neues da ist.
 */
export function useNeueFassung(): string[] | null {
  const [neueFassung, setNeueFassung] = useState<string[] | null>(null);

  useEffect(() => {
    if (neueFassung) return;
    return starteVersionspruefung((kennungen) => setNeueFassung(kennungen));
  }, [neueFassung]);

  return neueFassung;
}

export interface VersionsHinweisZustand {
  /** Der Warnstreifen fuer einen neuen kritischen Eintrag steht. */
  sichtbar: boolean;
  /** Beim naechsten Seitenwechsel still neu laden. */
  still: boolean;
  ausblenden: () => void;
  /** Vor dem stillen Neuladen aufrufen, damit es nur einmal je Build geschieht. */
  merkeStill: () => void;
}

/**
 * Was der Streifen wissen muss: ob er stehen soll und wie er weggeht.
 *
 * Weggeklickt bleibt er weg, bis der Nutzer das naechste Mal in den Tab
 * zurueckkehrt. Das ist Absicht: Der Hinweis soll nicht nerven, aber auch
 * nicht ein fuer alle Mal verschwinden, denn der veraltete Programmstand
 * bleibt ja bestehen.
 */
export function useVersionsHinweis(): VersionsHinweisZustand {
  const neueFassung = useNeueFassung();
  const [ausgeblendet, setAusgeblendet] = useState(istAusgeblendet);
  const [art, setArt] = useState<NeuladenArt | null>(null);
  const build = neueFassung?.[0] ?? "";

  useEffect(() => {
    const beiSichtbarkeit = () => {
      if (document.visibilityState !== "visible") return;
      hebeAusblendenAuf();
      setAusgeblendet(false);
    };
    document.addEventListener("visibilitychange", beiSichtbarkeit);
    return () => document.removeEventListener("visibilitychange", beiSichtbarkeit);
  }, []);

  useEffect(() => {
    if (!neueFassung) return;
    let abgebrochen = false;
    void ladeVersionsnotiz().then((notiz) => {
      if (abgebrochen) return;
      setArt(entscheideNeuladen({
        notiz,
        bekannteNr: BEKANNTE_NOTIZ_NR,
        schonStillGeladen: istSchonStillGeladen(build),
        // Streifen nur fuer freigegebene Eintraege, fuer alle gleich, auch
        // fuer Christian (seit 27.09.2026, sonst saehe er ihn in jeder Rolle).
        betrachter: {
          istFreigeber: false,
          freigaben: leseNotizFreigaben(),
        },
      }));
    });
    return () => { abgebrochen = true; };
  }, [neueFassung, build]);

  return {
    sichtbar: art === "kritisch" && !ausgeblendet,
    still: art === "still",
    ausblenden: () => { merkeAusgeblendet(); setAusgeblendet(true); },
    merkeStill: () => merkeStillGeladen(build),
  };
}
