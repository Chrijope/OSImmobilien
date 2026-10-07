/**
 * Mitschrift der Videogespraeche, vollstaendig auf dem Geraet des Beraters.
 *
 * Der Ton verlaesst den Rechner nicht. Die Erkennung laeuft im Browser mit
 * `@huggingface/transformers` und dem Modell `onnx-community/whisper-base` in
 * der 8-Bit-Fassung. Gemessen wurden 0,11x Echtzeit auf einem Mac, deutsche
 * Erkennung ist gut brauchbar.
 *
 * Wer spricht, ist gratis bekannt: Es gibt zwei getrennte Tonspuren, die
 * eigene und die der Gegenstelle. Jede Spur wird einzeln erkannt, danach
 * werden beide ueber die Zeitstempel zusammengefuehrt. Eine Sprechertrennung
 * im Modell braucht es dafuer nicht.
 *
 * Gespeichert wird ausschliesslich Text, niemals Ton. Die Tonstuecke leben nur
 * im Arbeitsspeicher und werden nach der Erkennung verworfen.
 *
 * Wichtig fuer die Buendelgroesse: `@huggingface/transformers` wird
 * ausschliesslich ueber dynamisches `import()` geholt. Diese Datei darf das
 * Paket niemals oben statisch einbinden, sonst landet der ganze Brocken im
 * Hauptbuendel. Aus demselben Grund sind die reinen Funktionen hier ohne
 * jeden schweren Bezug, damit Tests sie ohne Modell laden koennen.
 */

import { getAppConfig } from "./appConfigStore";

// ---------------------------------------------------------------------------
// Datenform
// ---------------------------------------------------------------------------

/** Eine Wortmeldung in der Mitschrift. */
export interface MitschriftZeile {
  /** Sekunden seit Beginn des Gespraechs. */
  zeitpunkt: number;
  /** Anzeigename des Sprechers, etwa "Berater" oder "Kunde". */
  sprecher: string;
  text: string;
}

/** Eine Tonspur, die einzeln erkannt wird. */
export interface MitschriftSpur {
  /** Anzeigename, landet unveraendert in `MitschriftZeile.sprecher`. */
  sprecher: string;
  /** Ton dieser Seite. Wird nur gelesen, nie aufgezeichnet. */
  stream: MediaStream;
}

export type MitschriftStatus =
  | "aus"
  | "modell_laedt"
  | "laeuft"
  | "beendet"
  | "fehler";

// ---------------------------------------------------------------------------
// Reine Funktionen: zusammenfuehren, entdoppeln, formatieren
// ---------------------------------------------------------------------------

/** Abtastrate, die Whisper erwartet. */
export const ABTASTRATE = 16000;

/** Standardlaenge eines Erkennungsstuecks in Sekunden. */
export const STUECK_SEKUNDEN = 25;

/**
 * Ueberlappung zweier aufeinanderfolgender Stuecke.
 *
 * Ohne Ueberlappung wird jedes Wort zerschnitten, das genau auf der Grenze
 * liegt, und geht damit verloren. Mit Ueberlappung wird es zweimal erkannt,
 * das laesst sich hinterher entdoppeln, der Verlust nicht.
 */
export const UEBERLAPPUNG_SEKUNDEN = 3;

/**
 * Zeitfenster, in dem zwei gleichlautende Wortmeldungen derselben Seite als
 * Dopplung aus der Ueberlappung gelten. Etwas grosszuegiger als die
 * Ueberlappung selbst, weil Whisper den Anfang eines Stuecks gerne um ein
 * bis zwei Sekunden verschiebt.
 */
const DOPPLUNGS_FENSTER = UEBERLAPPUNG_SEKUNDEN + 3;

/**
 * Ab dieser Laenge gilt eine Teilzeichenkette als sichere Dopplung. Kuerzere
 * Texte wie "Ja." oder "Genau." stecken in fast jedem Satz und wuerden sonst
 * faelschlich verschluckt.
 */
const MIN_TEILTEXT_ZEICHEN = 12;

/** Text auf das Vergleichbare reduzieren: klein, ohne Satzzeichen, ein Leerzeichen. */
function vergleichsform(text: string): string {
  return text
    .toLocaleLowerCase("de-DE")
    .replace(/[.,;:!?"„“”'`()[\]…–-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Zeilenumbrueche und Mehrfachleerzeichen zusammenziehen. */
function normalisiere(roh: unknown): string {
  if (typeof roh !== "string") return "";
  return roh.replace(/\s+/gu, " ").trim();
}

/**
 * Ob zwei Texte dieselbe Wortmeldung meinen.
 *
 * Aus der Ueberlappung kommt selten exakt derselbe Satz zurueck. Haeufiger
 * enthaelt das eine Stueck den Satz vollstaendig und das andere nur sein Ende
 * oder seinen Anfang. Deshalb zaehlt auch das Enthaltensein, aber erst ab
 * einer Laenge, bei der es kein Zufall mehr sein kann.
 */
function meintDasselbe(a: string, b: string): boolean {
  if (a === b) return true;
  const kurz = a.length <= b.length ? a : b;
  const lang = a.length <= b.length ? b : a;
  if (kurz.length < MIN_TEILTEXT_ZEICHEN) return false;
  return lang.includes(kurz);
}

/**
 * So viele Woerter muessen sich mindestens decken, damit das Ende der einen
 * und der Anfang der naechsten Wortmeldung als dieselbe Stelle im Ton gelten.
 * Zwei Woerter waeren zu wenig, "und dann" faengt jeder zweite Satz so an.
 */
const MIN_UEBERLAPP_WOERTER = 3;

/** Text in Woerter zerlegen, jeweils mit seiner Vergleichsform. */
function woerter(text: string): Array<{ roh: string; form: string }> {
  return text
    .split(/\s+/u)
    .filter(Boolean)
    .map((roh) => ({ roh, form: vergleichsform(roh) }))
    .filter((w) => w.form !== "");
}

/**
 * Schneidet vom Anfang der neuen Wortmeldung weg, was schon am Ende der
 * vorherigen steht.
 *
 * Genau das passiert an jeder Fenstergrenze: Der ueberlappende Abschnitt wird
 * zweimal erkannt, einmal als Ende des einen und einmal als Anfang des
 * naechsten Stuecks. Weil sich die beiden Fassungen nur teilweise decken,
 * greift die Dopplungspruefung ueber ganze Zeilen dort nicht. Gesucht wird
 * deshalb das laengste Stueck, das zugleich Ende der einen und Anfang der
 * anderen Wortmeldung ist.
 */
export function kuerzeUeberlappendenAnfang(vorher: string, neu: string): string {
  const a = woerter(vorher);
  const b = woerter(neu);
  const hoechstens = Math.min(a.length, b.length);
  if (hoechstens < MIN_UEBERLAPP_WOERTER) return neu;

  // Von der laengsten Deckung abwaerts, damit moeglichst viel wegfaellt.
  for (let k = hoechstens; k >= MIN_UEBERLAPP_WOERTER; k--) {
    let gleich = true;
    for (let i = 0; i < k; i++) {
      if (a[a.length - k + i].form !== b[i].form) { gleich = false; break; }
    }
    if (gleich) return b.slice(k).map((w) => w.roh).join(" ");
  }
  return neu;
}

export interface ZusammenfuehrOptionen {
  /** Zeitfenster fuer die Dopplungserkennung in Sekunden. */
  dopplungsFensterSekunden?: number;
}

/**
 * Fuehrt die Zeilen mehrerer Spuren zu einer Mitschrift zusammen.
 *
 * Sortiert wird nach Zeitpunkt. Bei gleichem Zeitpunkt entscheidet der
 * Sprechername, damit die Reihenfolge bei jedem Lauf dieselbe ist und sich
 * eine gespeicherte Mitschrift nicht beim erneuten Anzeigen umsortiert.
 *
 * Anschliessend fallen Dopplungen aus der Ueberlappung weg. Bleibt von zwei
 * Fassungen derselben Wortmeldung eine uebrig, ist es die laengere: Sie
 * enthaelt den vollstaendigen Satz, die kuerzere nur dessen Rest.
 */
export function fuegeSpurenZusammen(
  spuren: Array<MitschriftZeile[] | null | undefined>,
  optionen: ZusammenfuehrOptionen = {},
): MitschriftZeile[] {
  const fenster = optionen.dopplungsFensterSekunden ?? DOPPLUNGS_FENSTER;

  const alle: MitschriftZeile[] = [];
  for (const spur of spuren) {
    if (!Array.isArray(spur)) continue;
    for (const zeile of spur) {
      const text = normalisiere(zeile?.text);
      if (!text) continue;
      const zeitpunkt = Number.isFinite(zeile.zeitpunkt) ? Math.max(0, zeile.zeitpunkt) : 0;
      alle.push({ zeitpunkt, sprecher: zeile.sprecher || "", text });
    }
  }

  alle.sort((a, b) =>
    a.zeitpunkt - b.zeitpunkt || a.sprecher.localeCompare(b.sprecher, "de-DE"),
  );

  const behalten: MitschriftZeile[] = [];
  const formen: string[] = [];

  for (const zeile of alle) {
    const form = vergleichsform(zeile.text);
    if (!form) continue;

    let dopplung = -1;
    // Rueckwaerts, weil die Dopplung immer kurz vorher liegt. Sobald das
    // Zeitfenster verlassen ist, kann nichts mehr kommen.
    for (let i = behalten.length - 1; i >= 0; i--) {
      if (zeile.zeitpunkt - behalten[i].zeitpunkt > fenster) break;
      if (behalten[i].sprecher !== zeile.sprecher) continue;
      if (meintDasselbe(formen[i], form)) {
        dopplung = i;
        break;
      }
    }

    if (dopplung < 0) {
      behalten.push(zeile);
      formen.push(form);
      continue;
    }
    // Die laengere Fassung gewinnt, ihr Zeitpunkt ist der frueheste bekannte.
    if (zeile.text.length > behalten[dopplung].text.length) {
      behalten[dopplung] = { ...zeile, zeitpunkt: behalten[dopplung].zeitpunkt };
      formen[dopplung] = form;
    }
  }

  // Zweiter Durchgang: die geteilten Satzteile an den Fenstergrenzen. Jede
  // Zeile wird gegen die letzte Zeile derselben Seite im Zeitfenster gekuerzt.
  const fertig: MitschriftZeile[] = [];
  const zuletzt = new Map<string, { text: string; zeitpunkt: number }>();
  for (const zeile of behalten) {
    const vorher = zuletzt.get(zeile.sprecher);
    const imFenster = vorher !== undefined && zeile.zeitpunkt - vorher.zeitpunkt <= fenster;

    const text = imFenster ? kuerzeUeberlappendenAnfang(vorher.text, zeile.text) : zeile.text;
    // Deckt sich die Wortmeldung vollstaendig mit der vorherigen, bleibt
    // nichts uebrig. Dann war sie nur der Nachhall der Fenstergrenze.
    if (!text) continue;
    fertig.push({ ...zeile, text });
    zuletzt.set(zeile.sprecher, { text, zeitpunkt: zeile.zeitpunkt });
  }

  return fertig;
}

/** Sekunden als `mm:ss` beziehungsweise `h:mm:ss` bei langen Gespraechen. */
export function formatiereZeit(sekunden: number): string {
  const ganz = Math.max(0, Math.floor(Number.isFinite(sekunden) ? sekunden : 0));
  const s = ganz % 60;
  const m = Math.floor(ganz / 60) % 60;
  const h = Math.floor(ganz / 3600);
  const zwei = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${zwei(m)}:${zwei(s)}` : `${zwei(m)}:${zwei(s)}`;
}

/** Die Mitschrift als schlichter Text, eine Zeile je Wortmeldung. */
export function mitschriftAlsText(zeilen: MitschriftZeile[]): string {
  return zeilen
    .map((z) => `[${formatiereZeit(z.zeitpunkt)}] ${z.sprecher}: ${z.text}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Herkunft der Modelldateien
// ---------------------------------------------------------------------------

/** Schluessel in `app_config`, ueber die sich die Herkunft umstellen laesst. */
export const CONFIG_MODELL_BASIS = "mitschrift_modell_basis";
export const CONFIG_WASM_BASIS = "mitschrift_wasm_basis";
export const CONFIG_MODELL_ID = "mitschrift_modell_id";

export const MODELL_ID_STANDARD = "onnx-community/whisper-base";

/**
 * Standardablage der Modelldateien: der oeffentliche Storage-Bereich des
 * eigenen Supabase-Projekts. Bewusst nicht der Hugging-Face-Hub: Der Ton
 * bleibt zwar so oder so hier, aber jeder Abruf beim fremden Anbieter waere
 * eine Verbindung, die niemand braucht, und ein Ausfall dort waere ein
 * Ausfall hier.
 */
function storageBasis(unterordner: string): string {
  const projekt = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  if (!projekt) return "";
  return `${projekt}/storage/v1/object/public/${unterordner}/`;
}

export function modellBasisUrl(): string {
  const gesetzt = normalisiere(getAppConfig<string>(CONFIG_MODELL_BASIS, ""));
  const basis = gesetzt || storageBasis("modelle");
  return basis ? basis.replace(/\/*$/, "/") : "";
}

export function wasmBasisUrl(): string {
  const gesetzt = normalisiere(getAppConfig<string>(CONFIG_WASM_BASIS, ""));
  const basis = gesetzt || storageBasis("modelle/onnxruntime-web");
  return basis ? basis.replace(/\/*$/, "/") : "";
}

export function modellId(): string {
  return normalisiere(getAppConfig<string>(CONFIG_MODELL_ID, "")) || MODELL_ID_STANDARD;
}

// ---------------------------------------------------------------------------
// Modell laden und behalten
// ---------------------------------------------------------------------------

type Erkenner = (
  audio: Float32Array,
  optionen: Record<string, unknown>,
) => Promise<{ text?: string; chunks?: Array<{ timestamp?: [number, number | null]; text?: string }> }>;

let erkennerPromise: Promise<Erkenner> | null = null;
let modellBereit = false;

/** Ob das Modell schon im Speicher liegt. Nur zur Anzeige. */
export function istModellGeladen(): boolean {
  return modellBereit;
}

/**
 * Laedt das Modell einmal und behaelt es.
 *
 * Ein zweiter Aufruf bekommt dieselbe Zusage zurueck, das Modell wird also nie
 * doppelt geholt. Schlaegt das Laden fehl, wird die Zusage verworfen, damit
 * ein spaeterer Versuch nicht dauerhaft am alten Fehler haengen bleibt.
 */
export async function ladeModell(): Promise<Erkenner> {
  if (erkennerPromise) return erkennerPromise;

  erkennerPromise = (async () => {
    // Dynamisch, damit der Brocken nicht im Hauptbuendel landet.
    const { pipeline, env } = await import("@huggingface/transformers");

    const basis = modellBasisUrl();
    if (basis) {
      // Eigene Ablage statt Hugging Face. `remotePathTemplate` faellt weg,
      // weil unter der Basis direkt `<hersteller>/<modell>/…` liegt.
      env.remoteHost = basis;
      env.remotePathTemplate = "{model}/";
    }
    env.allowLocalModels = false;
    env.allowRemoteModels = true;

    const wasm = wasmBasisUrl();
    const onnxEnv = (env.backends as { onnx?: { wasm?: Record<string, unknown> } })?.onnx;
    if (wasm && onnxEnv?.wasm) {
      // Ohne diese Zeile holt onnxruntime-web seine WASM-Dateien von einem
      // fremden CDN. Auch die sollen aus der eigenen Ablage kommen.
      // Safari kennt kein Asyncify-Bundle, dort gilt die einfache Fassung.
      const safari = typeof navigator !== "undefined"
        && /^((?!chrome|android).)*safari/i.test(navigator.userAgent || "");
      onnxEnv.wasm.wasmPaths = safari
        ? { mjs: `${wasm}ort-wasm-simd-threaded.mjs`, wasm: `${wasm}ort-wasm-simd-threaded.wasm` }
        : {
            mjs: `${wasm}ort-wasm-simd-threaded.asyncify.mjs`,
            wasm: `${wasm}ort-wasm-simd-threaded.asyncify.wasm`,
          };
    }

    const erkenner = await pipeline("automatic-speech-recognition", modellId(), {
      dtype: "q8",
    });
    modellBereit = true;
    return erkenner as unknown as Erkenner;
  })();

  try {
    return await erkennerPromise;
  } catch (e) {
    erkennerPromise = null;
    modellBereit = false;
    throw e;
  }
}

/** Modell aus dem Speicher werfen. Fuer Tests und den Notfall. */
export function vergissModell(): void {
  erkennerPromise = null;
  modellBereit = false;
}

// ---------------------------------------------------------------------------
// Ton abgreifen
// ---------------------------------------------------------------------------

/**
 * Sammelt die Tonproben einer Spur im Arbeitsspeicher.
 *
 * Bewusst kein `MediaRecorder`: Der liefert eine Datei, und eine Datei ist
 * etwas, das versehentlich irgendwo landen kann. Hier gibt es nur eine Liste
 * von Zahlen, die stueckweise gelesen und danach weggeworfen wird.
 */
class Tonpuffer {
  private stuecke: Float32Array[] = [];
  /** Gesamtzahl der bereits verworfenen Proben, damit Zeitrechnung stimmt. */
  private verworfen = 0;
  private knoten: AudioNode | null = null;
  private quelle: MediaStreamAudioSourceNode | null = null;
  private laenge = 0;

  constructor(
    private readonly kontext: AudioContext,
    stream: MediaStream,
  ) {
    this.quelle = kontext.createMediaStreamSource(stream);
  }

  async starte(): Promise<void> {
    if (!this.quelle) return;
    const knoten = await baueAufnahmeKnoten(this.kontext, (proben) => {
      this.stuecke.push(proben);
      this.laenge += proben.length;
    });
    this.knoten = knoten;
    this.quelle.connect(knoten);
    // Ein Knoten ohne Ziel wird in manchen Browsern nicht getaktet. Das Ziel
    // ist stumm, es geht nur darum, dass der Graph laeuft.
    const stumm = this.kontext.createGain();
    stumm.gain.value = 0;
    knoten.connect(stumm);
    stumm.connect(this.kontext.destination);
  }

  /** Wie viele Sekunden Ton insgesamt schon durchgelaufen sind. */
  sekunden(): number {
    return (this.verworfen + this.laenge) / ABTASTRATE;
  }

  /**
   * Gibt den Abschnitt ab `abSekunde` zurueck, hoechstens `laengeSekunden`
   * lang. Alles davor wird endgueltig verworfen, der Speicher waechst also
   * nicht mit der Gespraechsdauer.
   */
  entnimm(abSekunde: number, laengeSekunden: number): Float32Array {
    const abProbe = Math.max(0, Math.round(abSekunde * ABTASTRATE) - this.verworfen);
    const anzahl = Math.round(laengeSekunden * ABTASTRATE);

    const gesamt = new Float32Array(this.laenge);
    let pos = 0;
    for (const stueck of this.stuecke) {
      gesamt.set(stueck, pos);
      pos += stueck.length;
    }

    const ende = Math.min(gesamt.length, abProbe + anzahl);
    const ausschnitt = abProbe >= ende ? new Float32Array(0) : gesamt.slice(abProbe, ende);

    // Alles bis zum Beginn des entnommenen Abschnitts wird nicht mehr
    // gebraucht. Der Rest bleibt liegen, die naechste Entnahme ueberlappt.
    if (abProbe > 0) {
      const rest = gesamt.slice(abProbe);
      this.stuecke = rest.length > 0 ? [rest] : [];
      this.laenge = rest.length;
      this.verworfen += abProbe;
    }

    return ausschnitt;
  }

  raeumeAuf(): void {
    try { this.quelle?.disconnect(); } catch { /* egal */ }
    try { this.knoten?.disconnect(); } catch { /* egal */ }
    this.quelle = null;
    this.knoten = null;
    this.stuecke = [];
    this.laenge = 0;
  }
}

/** Der Quelltext des Aufnahme-Worklets. Laeuft im Audio-Thread. */
const WORKLET_QUELLTEXT = `
class MitschriftAufnahme extends AudioWorkletProcessor {
  process(eingaben) {
    const kanal = eingaben[0] && eingaben[0][0];
    if (kanal && kanal.length > 0) this.port.postMessage(new Float32Array(kanal));
    return true;
  }
}
registerProcessor("mitschrift-aufnahme", MitschriftAufnahme);
`;

let workletGeladen: WeakSet<AudioContext> | null = null;

/**
 * Baut den Knoten, der die Tonproben herausreicht.
 *
 * Bevorzugt ein AudioWorklet, weil das im Audio-Thread laeuft und die
 * Oberflaeche nicht stocken laesst. Der Quelltext kommt aus einer Blob-URL,
 * damit der Bundler keine zusaetzliche Datei ausliefern muss. Wo es das nicht
 * gibt, greift der alte `ScriptProcessorNode`.
 */
async function baueAufnahmeKnoten(
  kontext: AudioContext,
  aufProben: (proben: Float32Array) => void,
): Promise<AudioNode> {
  if (kontext.audioWorklet) {
    try {
      workletGeladen ??= new WeakSet<AudioContext>();
      if (!workletGeladen.has(kontext)) {
        const url = URL.createObjectURL(new Blob([WORKLET_QUELLTEXT], { type: "text/javascript" }));
        try {
          await kontext.audioWorklet.addModule(url);
          workletGeladen.add(kontext);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const knoten = new AudioWorkletNode(kontext, "mitschrift-aufnahme");
      knoten.port.onmessage = (e) => aufProben(e.data as Float32Array);
      return knoten;
    } catch (e) {
      console.warn("Mitschrift: AudioWorklet nicht verfuegbar, Rueckfall auf ScriptProcessor.", e);
    }
  }

  // Rueckfall. Veraltet, aber ueberall vorhanden.
  const knoten = kontext.createScriptProcessor(4096, 1, 1);
  knoten.onaudioprocess = (e) => {
    aufProben(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  return knoten;
}

// ---------------------------------------------------------------------------
// Der Lauf
// ---------------------------------------------------------------------------

export interface MitschriftOptionen {
  /** Die Spuren, ueblicherweise die eigene und die der Gegenstelle. */
  spuren: MitschriftSpur[];
  /** Wird bei jeder neuen Zeile gerufen, fuer die Live-Anzeige. */
  aufZeile?: (zeile: MitschriftZeile, alle: MitschriftZeile[]) => void;
  /** Wird bei jedem Statuswechsel gerufen. */
  aufStatus?: (status: MitschriftStatus, meldung?: string) => void;
  /** Laenge eines Erkennungsstuecks, Vorgabe 25 Sekunden. */
  stueckSekunden?: number;
  /** Ueberlappung zweier Stuecke, Vorgabe 3 Sekunden. */
  ueberlappungSekunden?: number;
  /** Sprache fuer Whisper, Vorgabe deutsch. */
  sprache?: string;
}

export interface MitschriftLauf {
  /** Beendet den Lauf, erkennt den Rest und liefert die fertige Mitschrift. */
  stoppen(): Promise<MitschriftZeile[]>;
  /** Bricht sofort ab und wirft alles weg. Fuer den Fehlerfall. */
  abbrechen(): void;
  /** Der bisherige Stand, jederzeit abrufbar. */
  zeilen(): MitschriftZeile[];
  /** Sekunden seit dem Start. */
  dauerSekunden(): number;
  /** Ob gerade noch mitgeschrieben wird. */
  istAktiv(): boolean;
}

/**
 * Startet die Mitschrift.
 *
 * Laesst sich das Modell nicht laden, wird das gemeldet und der Lauf endet
 * sofort. Das Gespraech selbst darf davon nie betroffen sein, es gibt dann
 * schlicht keine Mitschrift. Deshalb wirft diese Funktion nicht, sie meldet
 * ueber `aufStatus`.
 */
export async function starteMitschrift(optionen: MitschriftOptionen): Promise<MitschriftLauf> {
  const stueck = Math.max(5, optionen.stueckSekunden ?? STUECK_SEKUNDEN);
  const ueberlappung = Math.max(0, Math.min(stueck / 2, optionen.ueberlappungSekunden ?? UEBERLAPPUNG_SEKUNDEN));
  const sprache = optionen.sprache || "german";
  const melde = (status: MitschriftStatus, meldung?: string) => {
    try { optionen.aufStatus?.(status, meldung); } catch { /* Anzeige darf nichts kippen */ }
  };

  let aktiv = false;
  let abgebrochen = false;
  let kontext: AudioContext | null = null;
  let takt: ReturnType<typeof setInterval> | null = null;
  const puffer: Array<{ sprecher: string; puffer: Tonpuffer; naechsterStart: number; roh: MitschriftZeile[] }> = [];
  let zusammen: MitschriftZeile[] = [];
  let warteschlange: Promise<void> = Promise.resolve();
  const start = Date.now();

  const aufraeumen = () => {
    aktiv = false;
    if (takt) { clearInterval(takt); takt = null; }
    for (const p of puffer) p.puffer.raeumeAuf();
    puffer.length = 0;
    if (kontext) {
      const zu = kontext;
      kontext = null;
      void zu.close().catch(() => { /* egal */ });
    }
  };

  const lauf: MitschriftLauf = {
    zeilen: () => zusammen,
    dauerSekunden: () => (Date.now() - start) / 1000,
    istAktiv: () => aktiv,
    abbrechen: () => {
      abgebrochen = true;
      aufraeumen();
      melde("beendet");
    },
    stoppen: async () => {
      if (!aktiv) return zusammen;
      aktiv = false;
      if (takt) { clearInterval(takt); takt = null; }
      // Den letzten, noch nicht erkannten Rest jeder Spur nachziehen.
      for (const eintrag of puffer) reiheEin(eintrag, true);
      await warteschlange;
      aufraeumen();
      melde("beendet");
      return zusammen;
    },
  };

  /**
   * Haengt die Erkennung eines Abschnitts an die Warteschlange.
   *
   * Nacheinander, nicht parallel: Es gibt nur ein Modell im Speicher, und
   * zwei gleichzeitige Laeufe waeren nicht schneller, sondern nur unruhiger.
   */
  function reiheEin(
    eintrag: { sprecher: string; puffer: Tonpuffer; naechsterStart: number; roh: MitschriftZeile[] },
    letzterRest: boolean,
  ): void {
    const vorhanden = eintrag.puffer.sekunden();
    const abSekunde = eintrag.naechsterStart;
    const verfuegbar = vorhanden - abSekunde;
    if (verfuegbar < (letzterRest ? 0.5 : stueck)) return;

    const laenge = letzterRest ? verfuegbar : stueck;
    const proben = eintrag.puffer.entnimm(abSekunde, laenge);
    // Der naechste Abschnitt setzt um die Ueberlappung frueher an.
    eintrag.naechsterStart = abSekunde + Math.max(1, laenge - ueberlappung);
    if (proben.length === 0) return;

    warteschlange = warteschlange
      .then(async () => {
        if (abgebrochen) return;
        const erkenner = await ladeModell();
        const ergebnis = await erkenner(proben, {
          language: sprache,
          task: "transcribe",
          chunk_length_s: 30,
          return_timestamps: true,
        });
        const stuecke = ergebnis.chunks?.length
          ? ergebnis.chunks
          : [{ timestamp: [0, null] as [number, number | null], text: ergebnis.text }];

        const neue: MitschriftZeile[] = [];
        for (const s of stuecke) {
          const text = normalisiere(s.text);
          if (!text) continue;
          neue.push({
            sprecher: eintrag.sprecher,
            zeitpunkt: abSekunde + (s.timestamp?.[0] ?? 0),
            text,
          });
        }
        if (neue.length === 0) return;

        eintrag.roh.push(...neue);
        const vorher = zusammen.length;
        zusammen = fuegeSpurenZusammen(puffer.map((p) => p.roh));
        if (optionen.aufZeile) {
          for (const zeile of zusammen.slice(vorher)) {
            try { optionen.aufZeile(zeile, zusammen); } catch { /* Anzeige darf nichts kippen */ }
          }
        }
      })
      .catch((e) => {
        console.warn("Mitschrift: Abschnitt nicht erkannt.", e);
      });
  }

  try {
    melde("modell_laedt");
    // Erst das Modell, dann der Ton. Klappt das Modell nicht, wurde auch kein
    // Ton angefasst.
    await ladeModell();

    kontext = new AudioContext({ sampleRate: ABTASTRATE });
    for (const spur of optionen.spuren) {
      if (!spur?.stream) continue;
      const p = new Tonpuffer(kontext, spur.stream);
      await p.starte();
      puffer.push({ sprecher: spur.sprecher, puffer: p, naechsterStart: 0, roh: [] });
    }
    if (puffer.length === 0) throw new Error("Keine Tonspur uebergeben");

    aktiv = true;
    melde("laeuft");
    // Haeufiger nachsehen als noetig, damit ein fertiges Stueck nicht bis zu
    // einer halben Stueckdauer liegen bleibt.
    takt = setInterval(() => {
      if (!aktiv) return;
      for (const eintrag of puffer) reiheEin(eintrag, false);
    }, 2000);
  } catch (e) {
    aufraeumen();
    console.error("Mitschrift konnte nicht starten:", e);
    melde("fehler", verstaendlicherFehler(e));
  }

  return lauf;
}

/**
 * Aus der technischen Meldung einen Satz machen, der weiterhilft.
 *
 * Vorher stand die rohe Meldung der Bibliothek in der Spalte, samt voller
 * Speicheradresse: "Bad request error occurred while trying to load file:
 * https://….supabase.co/storage/v1/object/public/modelle/…/config.json".
 * Das sagt niemandem, was zu tun ist, und schreibt nebenbei die interne
 * Adresse auf den Bildschirm. Die vollstaendige Meldung steht weiterhin in
 * der Konsole, dort gehoert sie hin.
 */
export function verstaendlicherFehler(e: unknown): string {
  const roh = (e instanceof Error ? e.message : String(e)) || "";

  // Der haeufigste Fall bei einer neuen Installation: Die Modelldateien sind
  // noch nicht hochgeladen, der Speicher antwortet mit einem Fehler.
  if (/config\.json|onnx|\.wasm|storage\/v1|bad request|not found|404|failed to fetch/i.test(roh)) {
    return "Die Spracherkennung ist auf diesem Server noch nicht hinterlegt. "
      + "Sobald die Modelldateien eingerichtet sind, funktioniert die Mitschrift. "
      + "Das Gespräch läuft davon unberührt weiter.";
  }

  if (/tonspur|audio|microphone|mikrofon/i.test(roh)) {
    return "Es liegt kein Ton an, deshalb gibt es nichts zu erkennen.";
  }

  return "Die Mitschrift konnte nicht gestartet werden. Das Gespräch läuft normal weiter.";
}
