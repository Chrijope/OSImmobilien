import type { HintergrundWahl } from "./videocallEinstellungen";

/**
 * Video-Hintergrund mit MediaPipe: Weichzeichnen oder eigenes Bild.
 *
 * Ablauf: Die Kamera laeuft in ein verstecktes Video-Element. Ein
 * Segmentierungsmodell trennt etwa 15 Mal je Sekunde Person und Hintergrund.
 * Auf einer Canvas wird beides neu zusammengesetzt: die Person scharf, der
 * Hintergrund weichgezeichnet oder durch ein Bild ersetzt. Die Canvas-Spur
 * (`captureStream`) ersetzt die Kameraspur im lokalen Stream und ueber
 * `ersetzeSenderSpur` bei allen Gegenstellen.
 *
 * Die Laufzeitdateien liegen unter `public/videocall/mediapipe/` und werden
 * selbst gehostet, zur Laufzeit wird kein Google-CDN angesprochen:
 *
 *   - vision_wasm_internal.js / .wasm und die nosimd-Varianten stammen aus
 *     node_modules/@mediapipe/tasks-vision/wasm/ (Paketversion siehe
 *     package.json). Beim Aktualisieren des Pakets die vier Dateien erneut
 *     von dort kopieren.
 *   - selfie_segmenter.tflite ist das offizielle Modell von
 *     https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite
 *     und wurde einmalig per curl geladen und mit committet (ca. 250 KB).
 *
 * Das Paket selbst kommt erst per dynamischem import() in den Browser, und
 * zwar dann, wenn `ladeSegmentierungVor` gerufen wird. Das geschieht nur auf
 * den Seiten, auf denen der Schalter fuer den Hintergrund ueberhaupt zu sehen
 * ist. Wer ihn nie zu Gesicht bekommt, laedt kein einziges Byte davon.
 */

const MEDIAPIPE_PFAD = "/videocall/mediapipe";
const MODELL_PFAD = `${MEDIAPIPE_PFAD}/selfie_segmenter.tflite`;
/** Etwa 15 Bilder je Sekunde reichen fuer einen ruhigen Hintergrund. */
const TAKT_MS = 66;
/** Breite, auf der segmentiert wird. Klein haelt die Rechenlast im Zaum. */
const VERARBEITUNGS_BREITE = 480;
/** So lange wird gezaehlt, bevor ueber die Bildrate geurteilt wird. */
const MESSFENSTER_MS = 3000;
/**
 * Unter dieser Bildrate ruckelt es sichtbar. Der Takt gibt 15 Bilder je
 * Sekunde vor, die Haelfte davon ist die Schmerzgrenze: darunter ist ein
 * sichtbarer Hintergrund das kleinere Uebel als ein hakendes Gespraech.
 */
const MIN_BILDRATE = 7.5;

/**
 * Ruckelt es? Zwei solche Fenster hintereinander schalten den Hintergrund ab,
 * damit ein einzelner Aussetzer beim Start nicht gleich alles beendet.
 */
export function istZuLangsam(bilderProSekunde: number): boolean {
  return bilderProSekunde > 0 && bilderProSekunde < MIN_BILDRATE;
}

/** Etwas, das eine Breite und eine Hoehe hat. Eine Zeichenflaeche zum Beispiel. */
export interface Flaechenmass {
  width: number;
  height: number;
}

/**
 * Alle Zeichenflaechen auf die richtige Groesse bringen.
 *
 * Das war die Stelle, an der die Trennung von Person und Hintergrund
 * gescheitert ist: Die Personenflaeche wurde nur zusammen mit der
 * Ausgabeflaeche gesetzt, und die hatte ihre Groesse schon beim Start
 * bekommen. Die Bedingung traf also nie zu, die Personenflaeche blieb auf der
 * Vorgabe des Browsers von 300 auf 150 Pixel stehen, und in dieses Feld wurde
 * das ganze Kamerabild hineingezeichnet. Uebrig blieb eine stark vergroesserte
 * Ecke, in der meistens gar keine Person ist. Sichtbar war davon: beim
 * Weichzeichnen ein durchgehend weiches Bild, beim Ersatzbild nur noch der
 * Hintergrund. Deshalb bekommt jede Flaeche hier ihre eigene Pruefung.
 *
 * Gibt zurueck, ob sich die Verarbeitungsgroesse geaendert hat. Dann muss die
 * Schablone neu angelegt werden.
 */
export function richteFlaechenAus(
  flaechen: { ausgabe: Flaechenmass; person: Flaechenmass; verarbeitung: Flaechenmass },
  vb: number,
  vh: number,
  kb: number,
  kh: number,
): boolean {
  if (flaechen.ausgabe.width !== vb || flaechen.ausgabe.height !== vh) {
    flaechen.ausgabe.width = vb;
    flaechen.ausgabe.height = vh;
  }
  if (flaechen.person.width !== vb || flaechen.person.height !== vh) {
    flaechen.person.width = vb;
    flaechen.person.height = vh;
  }
  if (flaechen.verarbeitung.width !== kb || flaechen.verarbeitung.height !== kh) {
    flaechen.verarbeitung.width = kb;
    flaechen.verarbeitung.height = kh;
    return true;
  }
  return false;
}

/**
 * In welcher Groesse die Maske wirklich kommt.
 *
 * Das Modell meldet ihre Kantenlaengen selbst. Verlassen wird sich darauf
 * nicht: Passt die Meldung nicht zur Zahl der Werte, landeten sie zeilenweise
 * versetzt in der Schablone, und die Person waere unscharf ausgeschnitten.
 */
export function maskenGroesse(
  gemeldet: { width?: number; height?: number },
  anzahlWerte: number,
  ersatzB: number,
  ersatzH: number,
): { b: number; h: number } {
  const b = gemeldet.width ?? 0;
  const h = gemeldet.height ?? 0;
  if (b > 0 && h > 0 && b * h === anzahlWerte) return { b, h };
  if (ersatzB > 0 && ersatzH > 0 && ersatzB * ersatzH === anzahlWerte) return { b: ersatzB, h: ersatzH };
  const kante = Math.max(1, Math.round(Math.sqrt(Math.max(1, anzahlWerte))));
  return { b: kante, h: Math.max(1, Math.round(anzahlWerte / kante)) };
}

/**
 * Wohin ein Bild in eine Flaeche gezeichnet wird.
 *
 * "fuellen" deckt die Flaeche ganz ab und schneidet mittig ab, "ganz" zeigt
 * das vollstaendige Bild und laesst Rand. Beides ohne Verzerrung, das
 * Seitenverhaeltnis bleibt in jedem Fall erhalten.
 */
export function bildEinpassung(
  bildB: number,
  bildH: number,
  flaecheB: number,
  flaecheH: number,
  art: "fuellen" | "ganz",
): { x: number; y: number; b: number; h: number } {
  if (bildB <= 0 || bildH <= 0) return { x: 0, y: 0, b: flaecheB, h: flaecheH };
  const faktor = art === "fuellen"
    ? Math.max(flaecheB / bildB, flaecheH / bildH)
    : Math.min(flaecheB / bildB, flaecheH / bildH);
  const b = bildB * faktor;
  const h = bildH * faktor;
  return { x: (flaecheB - b) / 2, y: (flaecheH - h) / 2, b, h };
}

/**
 * Das Mass der Arbeitsflaeche, auf der weichgezeichnet wird.
 *
 * Weichgezeichnet wird ueber die Verkleinerung: je kleiner diese Flaeche,
 * desto weicher das wieder aufgezogene Bild. Der Teiler sagt also, wie stark.
 * Mindestens zwei Pixel je Kante, sonst bleibt bei einem sehr kleinen
 * Kamerabild nichts uebrig, was sich noch aufziehen liesse.
 */
export function kleinesMass(vb: number, vh: number, teiler: number): { b: number; h: number } {
  return {
    b: Math.max(2, Math.round(vb / teiler)),
    h: Math.max(2, Math.round(vh / teiler)),
  };
}

/**
 * Teiler fuer das Weichzeichnen des Kamerabildes.
 *
 * Bis zum 18.09.2026 stand hier 14. Bei einer Kamera mit 1280 mal 720 waren
 * das 91 mal 51 Punkte, und darin ist ein Zimmer noch zu lesen: Fenster,
 * Regal, sogar der helle Fleck eines Posters. Christian am 18.09.2026:
 * „kannst du den hintergrund dann nur verschwommensetzen, das man vom
 * hintergrund nichts sieht, halt ausser verschwommen".
 *
 * Bei einem Vierundsechzigstel sind es 20 mal 11 Punkte. Im Versuch mit einem
 * gezeichneten Zimmer blieben davon nur noch Farbfelder: kein Fensterkreuz,
 * keine einzelnen Buecher, keine Schrift. Zugleich bleibt die Helligkeit des
 * Raumes erhalten, das Bild wirkt also nicht ausgeschnitten, sondern unscharf.
 *
 * Wichtig ist dabei `halbierungsStufen`: In einem Schritt so weit zu
 * verkleinern war keine Weichzeichnung, sondern eine Stichprobe, siehe dort.
 */
export const WEICH_TEILER = 64;

/**
 * Der Weg von der Kameragroesse zur weichen Arbeitsflaeche, in Halbschritten.
 *
 * Der Browser mittelt beim Verkleinern nur ueber wenige Nachbarpunkte. Wird
 * in einem einzigen Schritt auf ein Vierundsechzigstel verkleinert, sieht er
 * den groessten Teil des Bildes gar nicht an: Was uebrig bleibt, sind
 * zufaellig getroffene Punkte. Sichtbar war das als harte helle Linie dort,
 * wo die Fenstersprosse lag, und als scharfe Farbstreifen im Buecherregal.
 * Also gerade nicht das, was Weichzeichnen heissen soll, und im Video wuerde
 * es zusaetzlich von Bild zu Bild flimmern, weil jedes Mal andere Punkte
 * getroffen werden.
 *
 * Wer dagegen nie mehr als die Haelfte auf einmal wegnimmt, mittelt bei jedem
 * Schritt ueber alle Punkte. Das Ergebnis ist eine echte Weichzeichnung. Die
 * Zwischenschritte kosten wenig, weil jede Stufe nur noch ein Viertel der
 * Flaeche der vorigen hat.
 *
 * Gibt die Kantenlaengen aller Stufen zurueck, die letzte ist das Ziel.
 */
export function halbierungsStufen(
  vb: number,
  vh: number,
  zielB: number,
  zielH: number,
): Array<{ b: number; h: number }> {
  const stufen: Array<{ b: number; h: number }> = [];
  let b = vb;
  let h = vh;
  // Der Sicherheitsriegel: Bei unsinnigen Werten endet die Schleife trotzdem.
  while (b / 2 > zielB && h / 2 > zielH && stufen.length < 20) {
    b = Math.round(b / 2);
    h = Math.round(h / 2);
    stufen.push({ b, h });
  }
  stufen.push({ b: zielB, h: zielH });
  return stufen;
}

/**
 * Soll die Verarbeitung gerade laufen? Reine Entscheidungslogik, testbar:
 * Ohne gewaehlten Hintergrund gibt es nichts zu rechnen, und mit Kamera aus
 * wird ohnehin nichts gesendet.
 *
 * Das Bildschirmteilen zaehlt seit dem 18.09.2026 NICHT mehr dazu.
 *
 * Vorher ruhte die Komposition waehrend des Teilens, weil damals statt des
 * Gesichts der Bildschirm hinausging und niemand das gerechnete Bild sah.
 * Seitdem gehen beide hinaus (siehe `videoraumVerbindung`, `haengeBildschirmAn`),
 * und die Leinwand IST das Gesicht, das beim Kunden in der Kachel steht. Ruhte
 * sie weiter, saehe er wieder ein Standbild: genau der Fehler, der behoben
 * werden sollte.
 *
 * Auf die rohe Kamera auszuweichen waere keine Loesung, sondern ein Bruch: Wer
 * einen Hintergrund waehlt, will sein Zimmer nicht zeigen. Die Bildratenwache
 * weiter unten faengt ein zu langsames Geraet ohnehin ab und schaltet den
 * Hintergrund dann von selbst aus.
 */
export function sollHintergrundLaufen(wahl: HintergrundWahl, kameraAn: boolean): boolean {
  return wahl.art !== "aus" && kameraAn;
}

/**
 * Welche der Vertrauensmasken die Person beschreibt. Das Selfie-Modell
 * liefert je nach Fassung eine Maske (Person) oder zwei (Hintergrund,
 * Person). Bei zweien ist die zweite die Person.
 */
export function personenMaskenIndex(anzahlMasken: number): number {
  return anzahlMasken >= 2 ? 1 : 0;
}

/** Das schmale Stueck der MediaPipe-Schnittstelle, das hier gebraucht wird. */
interface Segmentierer {
  segmentForVideo(bild: TexImageSource, zeitstempelMs: number): {
    confidenceMasks?: Array<{
      getAsFloat32Array(): Float32Array;
      width?: number;
      height?: number;
      close?: () => void;
    }>;
    close?: () => void;
  };
  close(): void;
}

let segmentiererVorrat: Promise<Segmentierer> | null = null;

/**
 * Modell und Laufzeit einmal je Seitenaufruf holen und danach behalten.
 *
 * Der erste Wechsel auf Weichzeichnen oder Hintergrundbild hat spuerbar
 * gedauert. Gemessen bei einem Anschluss mit 16 Mbit: 6,1 Sekunden. Es gab
 * diese Funktion schon, sie hat aber nur die beiden Dateipfade ermittelt, und
 * das dauert 20 Millisekunden. Die zwoelf Megabyte der WebAssembly-Datei und
 * das Modell holt erst `createFromOptions`, also wartete der Klick weiterhin
 * darauf. Deshalb wird hier jetzt der Segmentierer selbst gebaut: Danach
 * findet der erste Klick alles fertig vor.
 *
 * Auf den Browserspeicher ist dabei kein Verlass. In der Messung wurde die
 * zwoelf Megabyte grosse Datei beim zweiten Abruf erneut geholt, kleine
 * Dateien dagegen nicht. Ein blosses Vorabholen der Datei haette also nichts
 * genuetzt, der fertige Segmentierer schon.
 *
 * Er wird nicht mehr geschlossen, sondern fuer die ganze Sitzung behalten.
 * Sonst zahlte jedes neue Gespraech erneut. Wer den Schalter nie zu Gesicht
 * bekommt, laedt weiterhin kein einziges Byte, denn gerufen wird diese
 * Funktion nur dort, wo er sichtbar ist.
 */
export function ladeSegmentierungVor(): Promise<Segmentierer> {
  if (!segmentiererVorrat) {
    segmentiererVorrat = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import("@mediapipe/tasks-vision");
      const dateien = await FilesetResolver.forVisionTasks(MEDIAPIPE_PFAD);
      const optionenFuer = (delegate: "GPU" | "CPU") => ({
        baseOptions: { modelAssetPath: MODELL_PFAD, delegate },
        runningMode: "VIDEO" as const,
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      });
      try {
        return await ImageSegmenter.createFromOptions(dateien, optionenFuer("GPU")) as unknown as Segmentierer;
      } catch {
        // Ohne brauchbare Grafikeinheit rechnet eben der Hauptprozessor.
        return await ImageSegmenter.createFromOptions(dateien, optionenFuer("CPU")) as unknown as Segmentierer;
      }
    })();
    // Ein gescheiterter Anlauf darf den naechsten nicht blockieren.
    segmentiererVorrat.catch(() => { segmentiererVorrat = null; });
  }
  return segmentiererVorrat;
}

export interface HintergrundRegie {
  /** Laeuft gerade eine Komposition? */
  aktiv(): boolean;
  aktuelleWahl(): HintergrundWahl;
  /**
   * Hintergrund umstellen. Bei "bild" muss `bildUrl` eine ladbare Adresse
   * sein (signierte Storage-URL). Liefert false, wenn es nicht klappt, dann
   * laeuft die reine Kameraspur weiter und `aufFehler` wurde gerufen.
   */
  setzeWahl(wahl: HintergrundWahl, bildUrl?: string | null): Promise<boolean>;
  /**
   * Die Verarbeitung anhalten oder wieder anlaufen lassen.
   *
   * Wurde bis zum 18.09.2026 vom Bildschirmteilen benutzt. Seitdem gehen
   * Gesicht und Bildschirm gleichzeitig hinaus, und die Leinwand ist das
   * Gesicht in der Kachel des Kunden: Sie muss weiterrechnen. Siehe
   * `sollHintergrundLaufen`. Der Schalter bleibt hier, weil er die einzige
   * Stelle ist, an der sich die Komposition anhalten laesst, ohne sie
   * abzubauen.
   */
  pausiereTeilen(an: boolean): void;
  /**
   * Die rohe Kameraspur als eigener Strom, fuer die eigene Vorschau.
   *
   * Sie dient der eigenen Kachel waehrend des Teilens. Der Hintergrund liegt
   * nicht darauf, aber dieses eine Bild sieht sonst niemand: Was beim Kunden
   * ankommt, ist die Leinwand mit dem gewaehlten Hintergrund.
   *
   * Null, wenn keine Komposition laeuft. Dann haengt die Kamera ohnehin
   * unveraendert im Stream.
   */
  roheKamera(): MediaStream | null;
  /** Kamera aus stoppt die Verarbeitung und die rohe Kameraspur mit. */
  setzeKameraAn(an: boolean): void;
  /** Nach einem Geraetewechsel die neue Kameraspur uebernehmen. */
  wechsleKameraSpur(neueSpur: MediaStreamTrack): void;
  /**
   * Zuletzt gemessene Bildrate der Komposition. 0, solange noch kein volles
   * Messfenster vorliegt. Gedacht fuer Messungen und Tests, nicht fuer die
   * Oberflaeche.
   */
  bildrate(): number;
  /** Alles zurueckbauen. Die Kameraspur kehrt in den Stream zurueck. */
  beenden(): void;
}

interface RegieOptionen {
  /** Der lokale Stream. Die Videospur darin wird in-place getauscht. */
  stream: MediaStream;
  /** Neue Spur an alle Gegenstellen geben, siehe Verbindung.ersetzeSpur. */
  ersetzeSenderSpur?: (spur: MediaStreamTrack) => Promise<void> | void;
  /** Verstaendliche Meldung, wenn der Hintergrund nicht laeuft. */
  aufFehler?: (meldung: string) => void;
}

export function erstelleHintergrundRegie(optionen: RegieOptionen): HintergrundRegie {
  const { stream, ersetzeSenderSpur, aufFehler } = optionen;

  let wahl: HintergrundWahl = { art: "aus" };
  let kameraSpur: MediaStreamTrack | null = null;
  let ausgabeSpur: MediaStreamTrack | null = null;
  // Der Strom fuer die eigene Vorschau, siehe `roheKamera`.
  let vorschau: MediaStream | null = null;
  let segmentierer: Segmentierer | null = null;
  let takt: number | null = null;
  let video: HTMLVideoElement | null = null;
  let hintergrundBild: HTMLImageElement | null = null;
  let teilenPausiert = false;
  let kameraAn = true;
  let rechnetGerade = false;
  let fehlerInFolge = 0;
  let beendet = false;
  /*
   * Wie oft wirklich ein Bild zusammengesetzt wurde.
   *
   * Ein stehendes Eigenbild sieht genau so aus wie ein laufender Hintergrund,
   * der nichts zu tun hat: In beiden Faellen zeigt die Ausgabeflaeche das eine
   * Bild, das beim Start hineingezeichnet wurde. Bisher war von aussen nicht
   * zu unterscheiden, ob die Schleife rechnet oder stillsteht, und ein
   * einzelner verschluckter Fehler stand nirgends. Deshalb diese Zaehler und
   * die Meldungen darunter: Sie kosten nichts und beantworten die Frage
   * "laeuft es ueberhaupt" in der Browserkonsole.
   */
  let bilderGezeichnet = 0;
  let stillstandGemeldet = false;
  let maskeFehltGemeldet = false;
  /*
   * Die Bildratenwache.
   *
   * Die Trennung von Person und Hintergrund kostet spuerbar Rechenzeit. Auf
   * einem aelteren Telefon kann das Bild einbrechen, das Geraet warm werden
   * und der Akku schneller leerlaufen. Ein ruckelndes Gespraech ist schlimmer
   * als ein sichtbarer Hintergrund, deshalb wird gezaehlt, wie viele Bilder
   * je Sekunde wirklich fertig werden. Zwei zu langsame Fenster hintereinander
   * schalten den Hintergrund ab und sagen es dem Nutzer.
   */
  let fensterStart = 0;
  let fensterBilder = 0;
  let langsameFenster = 0;
  let letzteBildrate = 0;
  // Wer zuletzt geklickt hat, siehe `setzeWahl`.
  let klickZaehler = 0;
  let gewuenscht: HintergrundWahl = { art: "aus" };

  // Die Zeichenflaechen. Verarbeitung klein (Segmentierung), Ausgabe in
  // Kameraaufloesung, Person und Maske als Zwischenschritte. `weichA` und
  // `weichB` sind die beiden Stufen des Weichzeichnens, siehe `zeichneWeich`.
  const ausgabe = document.createElement("canvas");
  const person = document.createElement("canvas");
  const maske = document.createElement("canvas");
  const verarbeitung = document.createElement("canvas");
  const weichA = document.createElement("canvas");
  const weichB = document.createElement("canvas");
  let maskenDaten: ImageData | null = null;

  /*
   * Der Spurtausch an die Gegenstellen, immer in der Reihenfolge der Klicks.
   *
   * Gewartet wird darauf nicht mehr. Fuer das eigene Bild ist die Spur schon
   * getauscht, sobald sie im Stream haengt, das geschieht sofort. Das
   * `replaceTrack` bei den Gegenstellen darf danach in Ruhe laufen. Die Kette
   * sorgt nur dafuer, dass zwei schnell aufeinander folgende Wechsel nicht in
   * der falschen Reihenfolge ankommen.
   */
  let tauschKette: Promise<void> = Promise.resolve();

  const spurTauschen = (neu: MediaStreamTrack): Promise<void> => {
    tauschKette = tauschKette
      .then(() => ersetzeSenderSpur?.(neu))
      .then(() => undefined)
      .catch((fehler) => { console.warn("Spur kam nicht an die Gegenstellen:", fehler); });
    return tauschKette;
  };

  /**
   * Das Kamerabild weichzeichnen, in Halbschritten.
   *
   * Zwei Flaechen im Wechsel: Jede Stufe zeichnet in die eine und liest aus
   * der anderen. Die letzte beschriebene Flaeche wird zurueckgegeben, der
   * Aufrufer zieht sie auf die volle Groesse auf.
   */
  const zeichneWeich = (quelle: CanvasImageSource, vb: number, vh: number): HTMLCanvasElement | null => {
    const ziel = kleinesMass(vb, vh, WEICH_TEILER);
    const stufen = halbierungsStufen(vb, vh, ziel.b, ziel.h);
    let von: CanvasImageSource = quelle;
    let hinein = weichA;
    let heraus = weichB;
    for (const stufe of stufen) {
      if (hinein.width !== stufe.b || hinein.height !== stufe.h) {
        hinein.width = stufe.b;
        hinein.height = stufe.h;
      }
      const ctx = hinein.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(von, 0, 0, stufe.b, stufe.h);
      von = hinein;
      const merk = hinein;
      hinein = heraus;
      heraus = merk;
    }
    return heraus;
  };

  const zeichne = () => {
    if (beendet || !video || !segmentierer || rechnetGerade) return;
    if (teilenPausiert || !kameraAn || wahl.art === "aus") return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    rechnetGerade = true;
    try {
      const vb = video.videoWidth;
      const vh = video.videoHeight;
      const kb = VERARBEITUNGS_BREITE;
      const kh = Math.max(2, Math.round((vh / vb) * kb));
      if (richteFlaechenAus({ ausgabe, person, verarbeitung }, vb, vh, kb, kh)) {
        maskenDaten = null;
      }

      const vCtx = verarbeitung.getContext("2d", { willReadFrequently: true });
      const aCtx = ausgabe.getContext("2d");
      const pCtx = person.getContext("2d");
      const mCtx = maske.getContext("2d", { willReadFrequently: true });
      if (!vCtx || !aCtx || !pCtx || !mCtx) return;

      // 1. Segmentieren, auf verkleinertem Bild.
      vCtx.drawImage(video, 0, 0, kb, kh);
      const ergebnis = segmentierer.segmentForVideo(verarbeitung, performance.now());
      const masken = ergebnis.confidenceMasks ?? [];
      const personMaske = masken[personenMaskenIndex(masken.length)];
      if (!personMaske) {
        // Ohne Maske gibt es nichts freizustellen. Bisher passierte das
        // lautlos und die Flaeche blieb auf dem Startbild stehen.
        if (!maskeFehltGemeldet) {
          maskeFehltGemeldet = true;
          console.warn("Video-Hintergrund: Die Segmentierung liefert keine Maske, die Flaeche bleibt stehen.");
        }
        ergebnis.close?.();
        return;
      }
      const werte = personMaske.getAsFloat32Array();

      // 2. Vertrauenswerte als Deckkraft in die Maskenflaeche schreiben. Die
      // Schablone bekommt die Groesse, in der die Maske wirklich kommt.
      const mg = maskenGroesse(personMaske, werte.length, kb, kh);
      if (maske.width !== mg.b || maske.height !== mg.h) {
        maske.width = mg.b; maske.height = mg.h;
        maskenDaten = null;
      }
      if (!maskenDaten) maskenDaten = mCtx.createImageData(mg.b, mg.h);
      const px = maskenDaten.data;
      for (let i = 0; i < werte.length; i++) {
        px[i * 4 + 3] = werte[i] * 255;
      }
      mCtx.putImageData(maskenDaten, 0, 0);
      // Das Ergebnis schliesst seine Masken selbst, nicht doppelt schliessen.
      ergebnis.close?.();

      // 3. Person freistellen: Kamerabild, dann die Maske als Schablone.
      pCtx.globalCompositeOperation = "source-over";
      pCtx.drawImage(video, 0, 0, vb, vh);
      pCtx.globalCompositeOperation = "destination-in";
      pCtx.imageSmoothingEnabled = true;
      pCtx.drawImage(maske, 0, 0, vb, vh);
      pCtx.globalCompositeOperation = "source-over";

      /*
       * 4. Hintergrund zeichnen. Ein Weg mit zwei Ausgaengen: Hinter die
       * Person kommt entweder das weichgezeichnete Kamerabild oder das
       * gewaehlte Bild. Alles davor und dahinter ist in beiden Faellen gleich.
       */
      aCtx.imageSmoothingEnabled = true;

      if (wahl.art === "bild" && hintergrundBild) {
        /*
         * Das eigene Bild hat selten das Format der Kamera, es wird also
         * flaechenfuellend gezeichnet und mittig beschnitten.
         *
         * Vorher lagen hier zwei Lagen uebereinander: unten dasselbe Bild
         * flaechenfuellend und stark weichgezeichnet, darueber das
         * vollstaendige Bild. Das sollte verhindern, dass ueberhaupt etwas
         * abgeschnitten wird. Christian am 18.09.2026: „wirkt wie wenn noch
         * ein weiterer hintergrund da ist mit dem rand an beiden seiten sieht
         * es komisch aus". Auch stark abgedunkelt blieb die untere Lage als
         * zweiter Abzug lesbar.
         *
         * Die Annahme dahinter war falsch. Nicht beschnitten werden duerfen
         * Kamerabilder, auf denen ein Mensch zu sehen ist. Ein Hintergrundbild
         * ist Schmuck, und Schmuck darf beschnitten werden.
         */
        const bild = hintergrundBild;
        const passung = bildEinpassung(bild.naturalWidth, bild.naturalHeight, vb, vh, "fuellen");
        aCtx.drawImage(bild, passung.x, passung.y, passung.b, passung.h);
      } else {
        /*
         * Weichzeichnen ohne ctx.filter: in Halbschritten verkleinern, dann
         * wieder aufziehen. Das glaettet zuverlaessig und laeuft auch in
         * Browsern, die den Canvas-Filter nicht koennen (aeltere
         * Safari-Fassungen). Warum in Schritten und nicht auf einen Schlag,
         * steht bei `halbierungsStufen`.
         */
        const weich = zeichneWeich(video, vb, vh);
        if (weich) aCtx.drawImage(weich, 0, 0, vb, vh);
      }

      // 5. Die Person darueber.
      aCtx.drawImage(person, 0, 0);
      fehlerInFolge = 0;
      bilderGezeichnet += 1;

      // Bildrate nachhalten und bei anhaltendem Ruckeln abschalten.
      fensterBilder += 1;
      const jetzt = performance.now();
      if (fensterStart === 0) {
        fensterStart = jetzt;
        fensterBilder = 0;
      } else if (jetzt - fensterStart >= MESSFENSTER_MS) {
        letzteBildrate = (fensterBilder * 1000) / (jetzt - fensterStart);
        fensterStart = jetzt;
        fensterBilder = 0;
        langsameFenster = istZuLangsam(letzteBildrate) ? langsameFenster + 1 : 0;
        if (langsameFenster >= 2) {
          console.warn(`Video-Hintergrund zu langsam (${letzteBildrate.toFixed(1)} Bilder/s), wird abgeschaltet.`);
          aufFehler?.("Dein Gerät schafft den Hintergrund gerade nicht flüssig. Er ist ausgeschaltet, damit Bild und Ton nicht ruckeln.");
          abschalten();
        }
      }
    } catch (fehler) {
      // Auch der erste Aussetzer gehoert in die Konsole. Vorher stand dort
      // erst nach fuenfzehn Fehlern etwas, und wer vorher nachsah, fand
      // nichts, obwohl das Bild schon stand.
      if (fehlerInFolge === 0) console.warn("Video-Hintergrund: ein Durchlauf ist gescheitert:", fehler);
      /*
       * Ein einzelner Aussetzer darf durchrutschen, etwa waehrend eines
       * Kamerawechsels. Haeufen sich die Fehler, ist etwas grundsaetzlich
       * kaputt (altes Geraet, WebGL weg): dann zurueck zur reinen Kamera.
       */
      fehlerInFolge += 1;
      if (fehlerInFolge >= 15) {
        console.error("Hintergrund dauerhaft gescheitert, zurueck zur Kamera:", fehler);
        aufFehler?.("Der Video-Hintergrund läuft auf diesem Gerät nicht stabil. Es wird wieder das Kamerabild gezeigt.");
        abschalten();
      }
    } finally {
      rechnetGerade = false;
    }
  };

  /** Modell und Laufzeit laden, Kamera in das versteckte Video haengen. */
  const starten = async (): Promise<void> => {
    const spur = stream.getVideoTracks()[0];
    if (!spur) throw new Error("Keine Kameraspur vorhanden");

    // Steht der Segmentierer schon bereit, kostet diese Zeile nichts.
    if (!segmentierer) segmentierer = await ladeSegmentierungVor();

    kameraSpur = spur;
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([spur]);
    await video.play();

    ausgabe.width = video.videoWidth || 1280;
    ausgabe.height = video.videoHeight || 720;
    // Einmal das nackte Kamerabild vorzeichnen, damit die Spur nicht mit
    // einem schwarzen Bild beginnt, bevor die erste Segmentierung steht.
    ausgabe.getContext("2d")?.drawImage(video, 0, 0, ausgabe.width, ausgabe.height);

    const ausgabeStream = ausgabe.captureStream(Math.round(1000 / TAKT_MS));
    ausgabeSpur = ausgabeStream.getVideoTracks()[0] ?? null;
    if (!ausgabeSpur) throw new Error("captureStream lieferte keine Spur");
    ausgabeSpur.enabled = spur.enabled;

    // Kameraspur raus aus dem Stream, Komposition rein. Das Eigenbild zeigt
    // damit dieselbe Spur, die auch hinausgeht.
    stream.removeTrack(spur);
    stream.addTrack(ausgabeSpur);
    void spurTauschen(ausgabeSpur);

    takt = window.setInterval(zeichne, TAKT_MS);

    /*
     * Stillstandswaechter. Steht nach drei Sekunden noch immer das Startbild,
     * hat die Schleife nie ein Bild zusammengesetzt. Sichtbar ist das ein
     * eingefrorenes Eigenbild, und genau dann sagt diese Zeile, woran es
     * liegt: kein Ton der Kamera, Bildschirmteilen, ein nicht spielendes
     * Video oder ein Fehler in der Segmentierung. Sie meldet einmal.
     */
    window.setTimeout(() => {
      if (beendet || stillstandGemeldet || bilderGezeichnet > 0) return;
      stillstandGemeldet = true;
      console.warn("Video-Hintergrund: in drei Sekunden wurde kein einziges Bild zusammengesetzt.", {
        wahl: wahl.art,
        kameraAn,
        teilenPausiert,
        videoBereit: video?.readyState ?? -1,
        videoBreite: video?.videoWidth ?? 0,
        fehlerInFolge,
      });
    }, 3000);
  };

  /**
   * Zurueck zur reinen Kameraspur, Kamera bleibt an.
   *
   * Nicht mehr asynchron: Ausschalten braucht weder Modell noch Netz. Die
   * Kameraspur haengt sofort wieder im Stream, das eigene Bild ist damit im
   * selben Augenblick wieder scharf. Nur die Meldung an die Gegenstellen
   * laeuft nebenher, siehe `spurTauschen`.
   */
  const abschalten = (): void => {
    if (takt !== null) { window.clearInterval(takt); takt = null; }
    if (ausgabeSpur) {
      stream.removeTrack(ausgabeSpur);
      ausgabeSpur.stop();
      ausgabeSpur = null;
    }
    if (video) { video.srcObject = null; video = null; }
    if (kameraSpur) {
      stream.addTrack(kameraSpur);
      void spurTauschen(kameraSpur);
      kameraSpur = null;
    }
    hintergrundBild = null;
    wahl = { art: "aus" };
    // Der naechste Anlauf faengt bei der Beobachtung wieder von vorn an.
    bilderGezeichnet = 0;
    stillstandGemeldet = false;
    maskeFehltGemeldet = false;
    fensterStart = 0;
    fensterBilder = 0;
    langsameFenster = 0;
  };

  const ladeBild = async (url: string): Promise<HTMLImageElement> => {
    const bild = new Image();
    // Ohne CORS-Freigabe wuerde die Canvas "befleckt" und captureStream
    // lieferte nur noch schwarze Bilder. Die Storage-URLs erlauben das.
    bild.crossOrigin = "anonymous";
    bild.src = url;
    await bild.decode();
    return bild;
  };

  return {
    aktiv: () => ausgabeSpur !== null,
    aktuelleWahl: () => wahl,
    bildrate: () => letzteBildrate,

    /*
     * Der letzte Klick gewinnt.
     *
     * Ohne diese Zaehlung hat ein Klick auf „Kein" waehrend des Ladens nichts
     * genuetzt: Das Ausschalten war sofort fertig, danach lief das begonnene
     * Einschalten weiter und legte den Hintergrund doch noch darueber, im
     * Versuch 5,9 Sekunden spaeter. Fuer Christian sah es aus, als habe sein
     * Klick lange gedauert und dann das Falsche getan. Jeder Aufruf merkt sich
     * deshalb seine Nummer und legt nach jedem Warten nur dann etwas an, wenn
     * inzwischen kein neuer Klick kam.
     */
    async setzeWahl(neueWahl, bildUrl) {
      if (beendet) return false;
      const meine = ++klickZaehler;
      gewuenscht = neueWahl;
      if (neueWahl.art === "aus") {
        abschalten();
        return true;
      }
      try {
        const bild = neueWahl.art === "bild" && bildUrl ? await ladeBild(bildUrl) : null;
        if (neueWahl.art === "bild" && !bild) throw new Error("Hintergrundbild ohne Adresse");
        if (meine !== klickZaehler) return false;
        hintergrundBild = bild;
        if (!ausgabeSpur) await starten();
        if (meine !== klickZaehler) {
          // Ueberholt. Wollte der neue Klick aus, ist hier wieder abzubauen,
          // denn `starten` hat die Leinwand inzwischen eingehaengt.
          if (gewuenscht.art === "aus") abschalten();
          return false;
        }
        wahl = neueWahl;
        fehlerInFolge = 0;
        return true;
      } catch (fehler) {
        console.error("Hintergrund konnte nicht gestartet werden:", fehler);
        abschalten();
        // Wer inzwischen selbst ausgeschaltet hat, braucht keine Fehlermeldung.
        if (meine === klickZaehler) {
          aufFehler?.("Der Video-Hintergrund konnte nicht geladen werden. Es bleibt beim Kamerabild.");
        }
        return false;
      }
    },

    pausiereTeilen(an) {
      teilenPausiert = an;
    },

    roheKamera() {
      if (!ausgabeSpur || !kameraSpur) return null;
      // Derselbe Strom, solange dieselbe Spur darin steckt. Ein neuer bei
      // jedem Aufruf liesse die Vorschau bei jedem Zeichnen neu anlaufen.
      if (!vorschau || vorschau.getVideoTracks()[0] !== kameraSpur) {
        vorschau = new MediaStream([kameraSpur]);
      }
      return vorschau;
    },

    setzeKameraAn(an) {
      kameraAn = an;
      // Die rohe Kameraspur haengt nicht mehr im Stream und wuerde vom
      // allgemeinen Stummschalten sonst nicht erfasst.
      if (kameraSpur) kameraSpur.enabled = an;
      if (ausgabeSpur) ausgabeSpur.enabled = an;
    },

    wechsleKameraSpur(neueSpur) {
      if (!ausgabeSpur || !video) {
        // Nicht aktiv: der Aufrufer tauscht die Spur selbst im Stream.
        return;
      }
      neueSpur.enabled = kameraAn;
      kameraSpur?.stop();
      kameraSpur = neueSpur;
      video.srcObject = new MediaStream([neueSpur]);
      void video.play().catch(() => { /* naechster Takt versucht es weiter */ });
    },

    beenden() {
      if (beendet) return;
      beendet = true;
      if (takt !== null) { window.clearInterval(takt); takt = null; }
      if (ausgabeSpur) {
        stream.removeTrack(ausgabeSpur);
        ausgabeSpur.stop();
        ausgabeSpur = null;
      }
      if (video) { video.srcObject = null; video = null; }
      vorschau = null;
      if (kameraSpur) {
        /*
         * Die Kameraspur kehrt in den Stream zurueck, damit das allgemeine
         * Aufraeumen (`stream.getTracks().forEach(stop)`) sie mit erwischt
         * und die Kameraleuchte ausgeht.
         */
        stream.addTrack(kameraSpur);
        kameraSpur = null;
      }
      /*
       * Der Segmentierer wird nicht geschlossen. Er gehoert seit dem
       * 18.09.2026 nicht mehr dieser Regie, sondern der Seite, siehe
       * `ladeSegmentierungVor`. Wuerde er hier geschlossen, zahlte das
       * naechste Gespraech die Ladezeit erneut, und genau die soll weg.
       */
      segmentierer = null;
      hintergrundBild = null;
    },
  };
}
