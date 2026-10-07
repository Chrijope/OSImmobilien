import { supabase } from "@/integrations/supabase/client";

/**
 * Die Videoverbindung selbst.
 *
 * Bis zu vier Browser reden direkt miteinander (WebRTC, Ende zu Ende
 * verschluesselt), als Netz: jeder haelt zu jedem anderen eine eigene
 * Paarverbindung. Es gibt keinen Medienserver. Zum Kennenlernen brauchen alle
 * einen Boten, und der ist Supabase Realtime: ein Broadcast-Kanal, dessen Name
 * ein Geheimnis enthaelt. Ueber diesen Kanal gehen nur Verbindungsdaten,
 * niemals Ton oder Bild.
 *
 * Der Kanalname haengt bewusst nicht am Raumtoken. Der steht im Link, den der
 * Kunde bekommt: wer ihn hat, haette sich sonst in ein laufendes Gespraech
 * einhaengen koennen, obwohl der Warteraum das Gegenteil verspricht. Das
 * Geheimnis gibt der Gastgeber erst mit dem Einlassen heraus, siehe
 * `holeSignalGeheimnis` und `videoraum_gast_status`.
 *
 * Wer neu dazukommt, ruft einmal in die Runde ("hallo"). Jeder, der schon da
 * ist, antwortet ihm gezielt ("hallo-zurueck"), und aus jedem dieser Paare
 * entsteht eine eigene Verbindung. Alle weiteren Nachrichten tragen Absender
 * UND Empfaenger, damit sich zwei Gaeste untereinander genauso verbinden wie
 * jeder mit dem Gastgeber.
 *
 * Wer bei einer Kollision nachgibt, ist je Paar fest verteilt ("perfect
 * negotiation"): die lexikografisch kleinere Kennung ist hoeflich und zieht
 * ihr eigenes Angebot zurueck, die groessere bleibt stur. Sonst blockieren
 * sich beide, wenn sie gleichzeitig anfangen. Die Regel ist absichtlich so
 * gewaehlt, dass "gast-…" vor "gastgeber-…" sortiert: im Paar Gast/Gastgeber
 * ist damit wie bisher der Gast der Hoefliche. Das Bildschirmteilen loest eine
 * zusaetzliche Aushandlung aus und faellt damit unter dieselbe Regel; ein
 * Zusammenstoss zweier gleichzeitiger Angebote kann nicht haengenbleiben.
 *
 * Waehrend des Teilens gehen zwei Videospuren hinaus, das Gesicht und der
 * Bildschirm. Bis zum 18.09.2026 war es nur eine: Der Bildschirm ersetzte die
 * Kamera, das Gegenueber sah das Gesicht des Teilenden gar nicht mehr und
 * dessen Kachel blieb auf dem letzten Bild stehen. Christian dazu: „wenn ich
 * ein bild geteilt habe wird das kamerabild vom gastgeber eingefroren?"
 */

export type VerbindungsZustand = "bereit" | "verbindet" | "verbunden" | "getrennt" | "gescheitert";

/** Hoechstzahl an Teilnehmern im Gespraech: Gastgeber plus drei Gaeste. */
export const MAX_TEILNEHMER = 4;
/** Hoechstzahl an Gegenstellen aus Sicht eines einzelnen Teilnehmers. */
export const MAX_GEGENSTELLEN = MAX_TEILNEHMER - 1;

/**
 * Was die Teilnehmer sich ausserhalb von Bild und Ton zurufen.
 *
 * Das laeuft ueber denselben Signalkanal wie die Verbindungsdaten. Der Name
 * dieses Kanals haengt am Geheimnis des Raumes, das der Gastgeber erst mit dem
 * Einlassen herausgibt. Ein eigener Kanal am Raumtoken waere schwaecher: den
 * Token kennt jeder, der den Kundenlink hat.
 *
 *   - `stumm`      Der Gastgeber schaltet EINEN Gast stumm, die Nachricht ist
 *                  an dessen Kennung adressiert. Abgeschaltet wird beim Gast,
 *                  nicht beim Gastgeber leise gestellt. Sonst glaubte der Gast
 *                  weiter, er sei zu hoeren.
 *   - `teilen`     Der Gastgeber gibt EINEM Gast das Bildschirmteilen frei
 *                  oder nimmt es wieder zurueck, ebenfalls gezielt adressiert.
 *   - `tonstand`   Jemand meldet, ob sein Mikrofon an ist. Die Meldung
 *                  traegt seine Absenderkennung, damit der Empfaenger weiss,
 *                  von wem sie kommt. Rundruf an alle, und ausdruecklich in
 *                  beide Richtungen: Der Gast soll genauso sehen, dass der
 *                  Gastgeber stumm ist, wie umgekehrt.
 *   - `standfrage` „Wie steht es bei dir?" Ein Rundruf beim Einhaengen. Wer
 *                  ihn hoert, antwortet gezielt mit seinem `tonstand` und
 *                  `bildstand`. Noetig, weil der Kanal sich nichts merkt: Wer
 *                  spaeter dazukommt oder seine Ansicht neu aufbaut, etwa
 *                  nachdem der Gastgeber das Gespraech kleiner gemacht und
 *                  wieder geoeffnet hat, wuesste sonst nichts von einer
 *                  laengst abgeschalteten Kamera. Auf eine Antwort folgt keine
 *                  neue Frage, es kann also nicht hin und her gehen.
 *   - `bildstand`  Dasselbe fuer die Kamera. Ohne diese Meldung kaeme beim
 *                  Gegenueber nur ein schwarzes Bild an, und niemand wuesste
 *                  warum: Eine abgeschaltete Spur sieht technisch genauso aus
 *                  wie eine Leitung, die gerade nichts liefert.
 *   - `bildschirm` Jemand teilt seinen Bildschirm oder hoert damit auf. Ein
 *                  Rundruf an alle, ohne Empfaenger. Er sagt zweierlei: DASS
 *                  geteilt wird, und in WELCHEM Strom der Bildschirm steckt.
 *
 *                  Seit dem 18.09.2026 geht waehrend des Teilens beides
 *                  hinaus, das Gesicht und der Bildschirm, in zwei getrennten
 *                  Stroemen. Die Gegenstelle muss die beiden auseinanderhalten
 *                  koennen, und weder die Reihenfolge der Spuren noch ihre
 *                  Beschriftung tragen dafuer verlaesslich. Deshalb nennt
 *                  dieser Rundruf die Kennung des Bildschirmstroms (`strom`,
 *                  die `id` des MediaStream). Genau diese Kennung steht auch
 *                  in der Verbindungsbeschreibung (msid) und kommt beim
 *                  Empfaenger als `MediaStream.id` wieder an.
 *
 *                  Fehlt `strom`, sendet die Gegenstelle noch nach dem alten
 *                  Muster mit nur einer getauschten Videospur. Dann gilt
 *                  weiter: In ihrem gewohnten Strom steckt jetzt der
 *                  Bildschirm.
 *   - `chat`       Ein Gespraechsbeitrag, Rundruf an alle. Er traegt seine
 *                  eigene Kennung, den Namen des Absenders, den Text und die
 *                  Uhrzeit, siehe `videoraumChat`. Der Kanal merkt sich
 *                  nichts: Wer spaeter dazukommt, sieht nichts von vorher, und
 *                  mit dem Auflegen ist alles weg. Genau wie bei Zoom, und
 *                  genau deshalb braucht es keine Datenbank und keine
 *                  Zeilensicherheit fuer Gaeste ohne Konto.
 *
 *                  Alles daran ist fremdes Material. Geprueft, gekuerzt und
 *                  als reiner Text angezeigt wird es dort, wo es hingehoert:
 *                  in `videoraumChat`, nicht hier.
 */
export type RegieBefehl =
  | { art: "stumm" }
  | { art: "teilen"; erlaubt: boolean }
  | { art: "tonstand"; an: boolean }
  | { art: "bildstand"; an: boolean }
  | { art: "standfrage" }
  | { art: "bildschirm"; an: boolean; strom?: string }
  | { art: "chat"; id: string; name: string; text: string; zeit: number };

/** Die Arten, die dieser Kanal kennt. Alles andere wird verworfen. */
const BEKANNTE_ARTEN = [
  "stumm", "teilen", "tonstand", "bildstand", "standfrage", "bildschirm", "chat",
] as const;

/**
 * Ist das ein Befehl, den wir kennen?
 *
 * Der Kanal haengt zwar am Geheimnis des Raumes, aber die Gegenseite bleibt
 * fremder Eingang. Was hier nicht durchkommt, erreicht die Ansicht gar nicht.
 */
export function istBekannterBefehl(daten: unknown): daten is RegieBefehl {
  const art = (daten as { art?: unknown } | null)?.art;
  return typeof art === "string" && (BEKANNTE_ARTEN as readonly string[]).includes(art);
}

/** Eine Gegenstelle im Netz, so wie die Ansicht sie braucht. */
export interface Gegenstelle {
  kennung: string;
  name: string;
  /** Der Alltagsstrom: Ton und Kamera. Auch waehrend des Teilens. */
  stream: MediaStream | null;
  zustand: VerbindungsZustand;
  /**
   * Der zweite Strom mit dem geteilten Bildschirm, sonst `null`.
   *
   * Optional, damit Attrappen in Tests und die Kacheln in Leiste und
   * schwebendem Fenster unveraendert weiterarbeiten. Die Verbindung selbst
   * setzt das Feld immer.
   */
  bildschirm?: MediaStream | null;
  /**
   * Die Gegenstelle hat einen zweiten Strom angekuendigt.
   *
   * Zwischen der Ankuendigung und dem Eintreffen der Spur liegt eine neue
   * Aushandlung, also ein paar hundert Millisekunden. In dieser Zeit ist
   * `bildschirm` noch leer, und die Buehne darf trotzdem nicht das Gesicht
   * gross stellen und „Bildschirm von …" darueber schreiben. Deshalb dieses
   * zweite Feld: Es unterscheidet „kommt gleich" von „diese Gegenstelle kann
   * nur einen Strom".
   */
  bildschirmErwartet?: boolean;
}

export interface VerbindungOptionen {
  /** Raumtoken. Dient nur noch als Rueckfall fuer den Kanalnamen. */
  token: string;
  /**
   * Geheimnis des Raumes, bildet den Kanalnamen. Fehlt es, faellt der Kanal
   * auf den Raumtoken zurueck: das ist der Stand vor der Migration
   * `20260804190000` und darf die Verbindung nicht verhindern.
   */
  signalGeheimnis?: string | null;
  /** Der Gastgeber bekommt die Kennung "gastgeber-…", Gaeste "gast-…". */
  istGastgeber: boolean;
  /** Anzeigename, steht bei den anderen an der Kachel. */
  eigenerName?: string;
  lokalerStream: MediaStream;
  /** Die Liste aller Gegenstellen, bei jeder Aenderung komplett neu. */
  aufGegenstellen: (gegenstellen: Gegenstelle[]) => void;
  /** Zusammengefasster Zustand ueber alle Paare, fuer Kopfzeile und Leiste. */
  aufZustand: (zustand: VerbindungsZustand) => void;
  /** Optional: eine Gegenstelle hat den Raum verlassen. */
  aufGegenstelleWeg?: (kennung: string) => void;
  /** Obergrenze an Gegenstellen, Vorgabe `MAX_GEGENSTELLEN`. */
  maxGegenstellen?: number;
}

export interface Verbindung {
  /** Eigene Kennung im Signalkanal, z. B. "gastgeber-abc". */
  eigeneKennung: string;
  /**
   * Der eigene Anzeigename, derselbe, den die anderen an der Kachel sehen.
   *
   * Er steht hier, damit die Ansicht ihn nicht ein zweites Mal hereingereicht
   * bekommen muss. Der Chat braucht ihn: Ein Beitrag traegt den Namen seines
   * Absenders, und zwei Seiten, die ihn verschieden herleiten, wuerden
   * frueher oder spaeter auseinanderlaufen.
   *
   * Optional aus demselben Grund wie `Gegenstelle.bildschirm`: damit
   * Attrappen in Tests unveraendert weiterarbeiten. Die Verbindung selbst
   * setzt das Feld immer.
   */
  eigenerName?: string;
  /** Kamera oder Mikrofon stummschalten, ohne die Verbindungen anzufassen. */
  setzeSpur: (art: "audio" | "video", an: boolean) => void;
  /**
   * Bildschirm teilen an oder aus, geht an alle Gegenstellen.
   *
   * Waehrend des Teilens gehen ZWEI Videospuren hinaus, das Gesicht und der
   * Bildschirm. Die Kamera wird dabei gedrosselt, siehe `TEILEN_KAMERA`.
   */
  teileBildschirm: (an: boolean) => Promise<boolean>;
  /**
   * Meldet jede Aenderung am Teilen, auch die von aussen: Wer im Browserbanner
   * auf "Beenden" klickt, loest keinen Klick in unserer Leiste aus. Gibt eine
   * Abmeldefunktion zurueck.
   *
   * Der zweite Wert ist der geteilte Bildschirm selbst. Ohne ihn saehe der
   * Gastgeber in seiner eigenen Kachel weiter die Kamera und wuesste nicht,
   * ob er das richtige Fenster erwischt hat. Beim Beenden ist er `null`.
   */
  beobachteTeilen: (melder: (an: boolean, bildschirm: MediaStream | null) => void) => () => void;
  /**
   * Eine Spur bei allen Gegenstellen austauschen, etwa nach einem
   * Geraetewechsel oder wenn der Video-Hintergrund die Kameraspur durch die
   * Komposition ersetzt. Gemeint ist immer die Kamera, nie der geteilte
   * Bildschirm: Der haengt an einem eigenen Weg.
   */
  ersetzeSpur?: (art: "audio" | "video", spur: MediaStreamTrack) => Promise<void>;
  /**
   * Einen Regiebefehl schicken, siehe `RegieBefehl`. Mit `an` gezielt an eine
   * Gegenstelle, ohne `an` an alle im Kanal.
   */
  sendeRegie: (befehl: RegieBefehl, an?: string) => void;
  /**
   * Regiebefehle mithoeren, mit der Kennung des Absenders. Gibt eine
   * Abmeldefunktion zurueck.
   */
  beobachteRegie: (melder: (befehl: RegieBefehl, von: string) => void) => () => void;
  beenden: () => void;
}

/**
 * Name des Signalkanals. Ohne Geheimnis bleibt es beim Raumtoken, damit die
 * Verbindung auch dann steht, wenn die Migration noch nicht gelaufen ist.
 */
export function signalKanalName(token: string, geheimnis?: string | null): string {
  return `videoraum-signal-${geheimnis?.trim() || token}`;
}

/**
 * Die Hoeflich-Regel je Paar, deterministisch fuer beide Seiten: die
 * lexikografisch kleinere Kennung ist die hoefliche. "gast-…" sortiert vor
 * "gastgeber-…", im klassischen Paar bleibt also der Gast hoeflich.
 */
export function istHoeflichGegenueber(eigeneKennung: string, fremdeKennung: string): boolean {
  return eigeneKennung < fremdeKennung;
}

/** Gilt eine Nachricht mir? Ohne Empfaenger ist sie ein Rundruf an alle. */
export function nachrichtFuerMich(an: string | null | undefined, eigeneKennung: string): boolean {
  return an == null || an === eigeneKennung;
}

/** Ist diese Kennung die des Gastgebers? */
export function istGastgeberKennung(kennung: string): boolean {
  return kennung.startsWith("gastgeber-");
}

/** Laesst die Obergrenze noch eine weitere Gegenstelle zu? */
export function darfWeitereGegenstelle(bestehende: number, max = MAX_GEGENSTELLEN): boolean {
  return bestehende < max;
}

/**
 * Wie die Kamera waehrend des Teilens gedrosselt wird.
 *
 * Zwei Videospuren statt einer kosten deutlich mehr, und der Kunde sitzt
 * womoeglich im Mobilfunknetz. Wichtig ist dort der geteilte Inhalt, nicht das
 * Gesicht: Das Gesicht steht in einer Kachel von rund 150 mal 112 Punkten, der
 * geteilte Bildschirm fuellt den Rest.
 *
 * `scaleResolutionDownBy` 3 macht aus 1280 mal 720 ein Bild von 427 mal 240.
 * Das ist auf einem Telefon mit dreifacher Punktdichte immer noch etwa so
 * breit wie die Kachel selbst. 200 kbit/s und 20 Bilder je Sekunde reichen
 * fuer ein Gesicht in dieser Groesse; zum Vergleich braucht dieselbe Kamera
 * unbeschraenkt gut das Zehnfache.
 */
export const TEILEN_KAMERA = {
  maxBitrate: 200_000,
  scaleResolutionDownBy: 3,
  maxFramerate: 20,
} as const;

/**
 * Welcher Strom das Gesicht traegt und welcher den Bildschirm.
 *
 * Steht als reine Rechnung hier, ohne Browser, weil daran alles haengt: Ordnet
 * der Empfaenger die beiden Stroeme falsch zu, sieht der Kunde das Gesicht
 * gross und den geteilten Inhalt als Briefmarke.
 *
 * Die Regel ist bewusst nicht die Reihenfolge, sondern die Kennung aus dem
 * Rundruf (siehe `RegieBefehl`, Art "bildschirm"). Alles, was nicht der
 * angekuendigte Bildschirmstrom ist, ist der Alltagsstrom; bei mehreren gilt
 * der zuerst empfangene. Ist nichts angekuendigt, gibt es keinen Bildschirm,
 * und der erste Strom bleibt der Alltagsstrom. Genau so verhaelt sich die
 * Anwendung gegenueber einem aelteren Stand auf der Gegenseite.
 */
export function ordneStroemeZu(
  stroeme: readonly MediaStream[],
  bildschirmStromId: string | null,
): { stream: MediaStream | null; bildschirm: MediaStream | null } {
  const bildschirm = bildschirmStromId
    ? stroeme.find((s) => s.id === bildschirmStromId) ?? null
    : null;
  const stream = stroeme.find((s) => s !== bildschirm) ?? null;
  return { stream, bildschirm };
}

/**
 * Der Gesamtzustand ueber alle Paare, fuer Kopfzeile und Leiste. Solange
 * niemand da ist, wird gewartet, also "verbindet". Sobald ein Paar steht, gilt
 * das Gespraech als verbunden, auch wenn ein zweites noch aushandelt.
 */
export function fasseZustandZusammen(zustaende: VerbindungsZustand[]): VerbindungsZustand {
  if (zustaende.length === 0) return "verbindet";
  if (zustaende.includes("verbunden")) return "verbunden";
  if (zustaende.includes("verbindet") || zustaende.includes("bereit")) return "verbindet";
  if (zustaende.includes("gescheitert")) return "gescheitert";
  return "getrennt";
}

interface SignalNachricht {
  typ: "hallo" | "hallo-zurueck" | "beschreibung" | "kandidat" | "tschuess" | "regie";
  von: string;
  /** Empfaengerkennung. Fehlt sie, ist die Nachricht ein Rundruf an alle. */
  an?: string;
  /** Anzeigename des Absenders, bei "hallo" und "hallo-zurueck" dabei. */
  name?: string;
  daten?: unknown;
}

const OEFFENTLICHE_STUN: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

/**
 * Holt die Verbindungsserver. Der TURN-Server, der Verbindungen durch strenge
 * Firewalls durchreicht, liegt als Geheimnis in der Edge Function. Fehlt er,
 * bleibt es bei STUN, dann klappt die Verbindung in den meisten, aber nicht in
 * allen Netzen.
 */
export async function ladeEisServer(): Promise<RTCIceServer[]> {
  try {
    const { data, error } = await supabase.functions.invoke("videoraum-ice", { body: {} });
    if (error) throw error;
    const server = (data as { iceServers?: RTCIceServer[] } | null)?.iceServers;
    if (Array.isArray(server) && server.length > 0) return server;
  } catch (fehler) {
    console.warn("videoraum-ice nicht erreichbar, nutze nur STUN:", fehler);
  }
  return OEFFENTLICHE_STUN;
}

/** Eine Paarverbindung samt ihrem Aushandlungszustand. */
interface Paar {
  kennung: string;
  name: string;
  hoeflich: boolean;
  pc: RTCPeerConnection;
  machtAngebot: boolean;
  ignoriereAngebot: boolean;
  /** Alle empfangenen Stroeme, in der Reihenfolge ihres Eintreffens. */
  stroeme: Map<string, MediaStream>;
  /** Kennung des Stroms, in dem laut Rundruf der Bildschirm steckt. */
  bildschirmStromId: string | null;
  stream: MediaStream | null;
  bildschirm: MediaStream | null;
  zustand: VerbindungsZustand;
  /** Die eigenen Sender, ausdruecklich gemerkt statt gesucht. */
  kameraSender: RTCRtpSender | null;
  tonSender: RTCRtpSender | null;
  /**
   * Der zweite Videoweg fuer den geteilten Bildschirm. Nur waehrend des
   * Teilens gesetzt, danach wieder abgeraeumt.
   */
  bildschirmWeg: RTCRtpTransceiver | null;
}

export async function starteVerbindung(optionen: VerbindungOptionen): Promise<Verbindung> {
  const {
    token, signalGeheimnis, istGastgeber, eigenerName, lokalerStream,
    aufGegenstellen, aufZustand, aufGegenstelleWeg,
  } = optionen;
  const maxGegenstellen = optionen.maxGegenstellen ?? MAX_GEGENSTELLEN;

  const eigeneKennung = `${istGastgeber ? "gastgeber" : "gast"}-${Math.random().toString(36).slice(2, 10)}`;

  const eisServer = await ladeEisServer();

  let beendet = false;
  let kanalGescheitert = false;
  let bildschirmSpur: MediaStreamTrack | null = null;
  /*
   * Derselbe Bildschirm als ganzer Strom. Die Spur geht an die Gegenstellen,
   * der Strom an die eigene Vorschau: Ein `<video>` will einen Strom, keine
   * Spur, und ein bei jedem Bild neu gebauter Strom fienge die Wiedergabe jedes
   * Mal neu an.
   */
  let bildschirmStream: MediaStream | null = null;
  /** Die Bildschirmauswahl des Browsers ist gerade offen. */
  let holtBildschirm = false;
  const teilenMelder = new Set<(an: boolean, bildschirm: MediaStream | null) => void>();
  const meldeTeilen = (an: boolean) => {
    for (const melder of teilenMelder) melder(an, an ? bildschirmStream : null);
  };
  const regieMelder = new Set<(befehl: RegieBefehl, von: string) => void>();

  /** Eine Verbindung je Gegenstelle, verwaltet nach deren Kennung. */
  const paare = new Map<string, Paar>();

  const kanal = supabase.channel(signalKanalName(token, signalGeheimnis), {
    config: { broadcast: { self: false, ack: false } },
  });

  const sende = (nachricht: Omit<SignalNachricht, "von">) => {
    if (beendet) return;
    void kanal.send({ type: "broadcast", event: "signal", payload: { ...nachricht, von: eigeneKennung } });
  };

  /** Ansicht und Gesamtzustand nachziehen, bei jeder Aenderung an den Paaren. */
  const melde = () => {
    if (beendet) return;
    aufGegenstellen([...paare.values()].map((p) => ({
      kennung: p.kennung,
      name: p.name,
      stream: p.stream,
      bildschirm: p.bildschirm,
      bildschirmErwartet: p.bildschirmStromId !== null,
      zustand: p.zustand,
    })));
    aufZustand(kanalGescheitert
      ? "gescheitert"
      : fasseZustandZusammen([...paare.values()].map((p) => p.zustand)));
  };

  /**
   * Die Zuordnung der empfangenen Stroeme nachziehen und melden.
   *
   * Zwei Dinge koennen sie aendern, und zwar in beliebiger Reihenfolge: eine
   * eintreffende Spur und der Rundruf, der sagt, was darin steckt. Der Rundruf
   * geht ueber den Signalkanal, die Spur ueber eine neue Aushandlung, und
   * welches von beiden zuerst ankommt, ist nicht festgelegt. Deshalb wird nach
   * jedem der beiden Ereignisse neu zugeordnet, statt sich auf eine Abfolge zu
   * verlassen.
   */
  const ordneStroeme = (paar: Paar) => {
    const { stream, bildschirm } = ordneStroemeZu([...paar.stroeme.values()], paar.bildschirmStromId);
    if (paar.stream === stream && paar.bildschirm === bildschirm) return;
    paar.stream = stream;
    paar.bildschirm = bildschirm;
    melde();
  };

  /**
   * Die eigene Kamera waehrend des Teilens drosseln und danach wieder
   * freigeben. Siehe `TEILEN_KAMERA` fuer die Werte und den Grund.
   *
   * Still im Fehlerfall, aber nicht stumm: `setParameters` ist in aelteren
   * Browsern waehlerisch, und eine nicht gedrosselte Kamera ist kein Grund,
   * das Teilen scheitern zu lassen.
   */
  const drossleKamera = async (sender: RTCRtpSender | null, an: boolean) => {
    if (!sender) return;
    try {
      const werte = sender.getParameters();
      const erste = werte.encodings?.[0];
      if (!erste) return;
      if (an) {
        erste.maxBitrate = TEILEN_KAMERA.maxBitrate;
        erste.scaleResolutionDownBy = TEILEN_KAMERA.scaleResolutionDownBy;
        erste.maxFramerate = TEILEN_KAMERA.maxFramerate;
      } else {
        delete erste.maxBitrate;
        delete erste.maxFramerate;
        erste.scaleResolutionDownBy = 1;
      }
      await sender.setParameters(werte);
    } catch (fehler) {
      console.warn("Bandbreite der Kamera nicht gesetzt:", fehler);
    }
  };

  /**
   * Den Bildschirm als ZWEITEN Weg an ein Paar haengen.
   *
   * Bis zum 18.09.2026 ersetzte der Bildschirm die Kameraspur. Der Kunde sah
   * dann das Gesicht nicht mehr, seine Kachel behielt das letzte Bild und
   * wirkte eingefroren. Christian dazu: „wenn ich ein bild geteilt habe wird
   * das kamerabild vom gastgeber eingefroren?" Seitdem gehen beide hinaus.
   *
   * Der zweite Weg loest eine neue Aushandlung aus. Wer dabei nachgibt, ist je
   * Paar fest verteilt (siehe `istHoeflichGegenueber`), ein Zusammenstoss
   * zweier gleichzeitiger Angebote kann also nicht haengenbleiben. Im
   * Pruefstand kam der zweite Strom nach 54 bis 56 ms beim Gegenueber an.
   *
   * Eine Gegenstelle mit AELTEREM Stand kennt den zweiten Strom nicht. Sie
   * stuerzt nicht ab, sondern schaltet ihre grosse Flaeche auf den zuletzt
   * eingetroffenen Strom um und sieht damit den geteilten Inhalt, wie es der
   * Auftrag verlangt. Der Ton des Teilenden fehlt ihr waehrenddessen, weil er
   * am Alltagsstrom haengt, und nach dem Beenden bleibt ihre Kachel leer, bis
   * sie neu laedt. Weiter entgegenkommen liesse sich nur mit einem zweiten
   * Sendeweg allein fuer alte Staende, und der waere ein zweiter Bauplan fuer
   * einen Fall, den es nur zwischen zwei Veroeffentlichungen gibt.
   */
  const haengeBildschirmAn = (paar: Paar) => {
    if (!bildschirmSpur || !bildschirmStream || paar.bildschirmWeg) return;
    try {
      paar.bildschirmWeg = paar.pc.addTransceiver(bildschirmSpur, {
        direction: "sendonly",
        streams: [bildschirmStream],
      });
    } catch (fehler) {
      console.warn("Bildschirm konnte nicht zusaetzlich gesendet werden:", fehler);
    }
    void drossleKamera(paar.kameraSender, true);
  };

  /**
   * Den zweiten Weg wieder abraeumen. Danach steht das Paar genau wie vorher:
   * ein Ton- und ein Videoweg, die Kamera ohne Drossel.
   */
  const loeseBildschirm = (paar: Paar) => {
    const weg = paar.bildschirmWeg;
    paar.bildschirmWeg = null;
    if (weg) {
      try {
        // `stop` gibt die Stelle in der Verbindungsbeschreibung frei, ein
        // spaeteres Teilen kann sie wiederverwenden. Aeltere Browser kennen
        // es nicht, dort bleibt der Weg leer stehen.
        if (typeof weg.stop === "function") weg.stop();
        else paar.pc.removeTrack(weg.sender);
      } catch (fehler) {
        console.warn("Bildschirmweg konnte nicht abgeraeumt werden:", fehler);
      }
    }
    void drossleKamera(paar.kameraSender, false);
  };

  /**
   * Eine Paarverbindung anlegen. Gibt es sie schon, wird hoechstens der Name
   * nachgetragen. Ist der Raum voll, wird abgelehnt: das ist die technische
   * Obergrenze in der Verbindungsschicht, unabhaengig vom Einlass-Knopf.
   */
  const erzeugePaar = (kennung: string, name?: string): Paar | null => {
    const vorhanden = paare.get(kennung);
    if (vorhanden) {
      const neuerName = name?.trim();
      if (neuerName && vorhanden.name !== neuerName) {
        vorhanden.name = neuerName;
        melde();
      }
      return vorhanden;
    }
    if (!darfWeitereGegenstelle(paare.size, maxGegenstellen)) {
      console.warn("Videoraum voll, weitere Gegenstelle abgelehnt:", kennung);
      return null;
    }

    const pc = new RTCPeerConnection({ iceServers: eisServer, iceCandidatePoolSize: 2 });
    const paar: Paar = {
      kennung,
      name: name?.trim() || "Teilnehmer",
      hoeflich: istHoeflichGegenueber(eigeneKennung, kennung),
      pc,
      machtAngebot: false,
      ignoriereAngebot: false,
      stroeme: new Map(),
      bildschirmStromId: null,
      stream: null,
      bildschirm: null,
      zustand: "verbindet",
      kameraSender: null,
      tonSender: null,
      bildschirmWeg: null,
    };
    paare.set(kennung, paar);

    // Eigene Spuren anmelden. Das loest je Paar die erste Aushandlung aus.
    for (const spur of lokalerStream.getTracks()) {
      const sender = pc.addTrack(spur, lokalerStream);
      if (spur.kind === "video") paar.kameraSender = sender;
      else if (spur.kind === "audio") paar.tonSender = sender;
    }
    // Wer mitten im Teilen dazukommt, bekommt beides sofort, genau wie alle
    // anderen: das Gesicht im Alltagsstrom und den Bildschirm daneben.
    haengeBildschirmAn(paar);

    pc.ontrack = (ereignis) => {
      /*
       * Ohne Angabe in der Verbindungsbeschreibung liefert der Browser keinen
       * Strom mit. Dann wird einer gebaut: Die Ansicht braucht einen Strom,
       * eine einzelne Spur kann sie nicht abspielen.
       */
      const strom = ereignis.streams[0] ?? new MediaStream([ereignis.track]);
      if (!paar.stroeme.has(strom.id)) paar.stroeme.set(strom.id, strom);
      ordneStroeme(paar);
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sende({ typ: "kandidat", an: kennung, daten: candidate.toJSON() });
    };

    pc.onnegotiationneeded = async () => {
      try {
        paar.machtAngebot = true;
        const angebot = await pc.createOffer();
        // Zwischen createOffer und hier kann sich der Zustand geaendert haben.
        if (pc.signalingState !== "stable") return;
        await pc.setLocalDescription(angebot);
        sende({ typ: "beschreibung", an: kennung, daten: pc.localDescription });
      } catch (fehler) {
        console.error("Aushandlung fehlgeschlagen:", fehler);
      } finally {
        paar.machtAngebot = false;
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case "connecting":
          paar.zustand = "verbindet";
          break;
        case "connected":
          paar.zustand = "verbunden";
          break;
        case "disconnected":
          paar.zustand = "getrennt";
          break;
        case "failed":
          paar.zustand = "gescheitert";
          // Ein Neuversuch kostet nichts und rettet Wechsel zwischen WLAN und Mobilfunk.
          try { pc.restartIce(); } catch { /* aeltere Browser koennen das nicht */ }
          break;
        default:
          return;
      }
      melde();
    };

    melde();
    return paar;
  };

  const entfernePaar = (kennung: string) => {
    const paar = paare.get(kennung);
    if (!paar) return;
    paare.delete(kennung);
    paar.pc.onicecandidate = null;
    paar.pc.ontrack = null;
    paar.pc.onnegotiationneeded = null;
    paar.pc.onconnectionstatechange = null;
    try { paar.pc.close(); } catch { /* egal */ }
    melde();
  };

  const behandleSignal = async (nachricht: SignalNachricht) => {
    if (beendet || !nachricht?.von || nachricht.von === eigeneKennung) return;
    // Gezielte Nachrichten anderer Paare gehen mich nichts an.
    if (!nachrichtFuerMich(nachricht.an, eigeneKennung)) return;

    try {
      if (nachricht.typ === "hallo") {
        // Ein Neuer ruft in die Runde. Wer schon da ist, legt das Paar an und
        // antwortet ihm gezielt, damit er alle Bestehenden kennenlernt.
        const paar = erzeugePaar(nachricht.von, nachricht.name);
        if (paar) {
          sende({ typ: "hallo-zurueck", an: nachricht.von, name: eigenerName });
          /*
           * Wer mitten im Teilen dazukommt, bekommt den Bildschirm als
           * zweiten Strom. Ohne diese Zeile wuesste er nichts davon und
           * stellte den geteilten Inhalt als Kamerabild dar, also klein statt
           * gross.
           */
          if (bildschirmStream) {
            sende({
              typ: "regie",
              an: nachricht.von,
              daten: { art: "bildschirm", an: true, strom: bildschirmStream.id },
            });
          }
        }
        return;
      }

      if (nachricht.typ === "hallo-zurueck") {
        erzeugePaar(nachricht.von, nachricht.name);
        return;
      }

      if (nachricht.typ === "tschuess") {
        entfernePaar(nachricht.von);
        aufGegenstelleWeg?.(nachricht.von);
        return;
      }

      if (nachricht.typ === "regie") {
        const befehl = nachricht.daten;
        // Nur bekannte Befehle durchreichen, siehe `istBekannterBefehl`.
        if (istBekannterBefehl(befehl)) {
          /*
           * Die Zuordnung der Stroeme gehoert hierher und nicht in die
           * Ansicht: Sie ist dieselbe Rechnung fuer jede Ansicht, und die
           * Ansicht bekommt das Ergebnis fertig als `Gegenstelle`.
           */
          if (befehl.art === "bildschirm") {
            const paar = paare.get(nachricht.von);
            if (paar) {
              if (befehl.an) {
                paar.bildschirmStromId = typeof befehl.strom === "string" ? befehl.strom : null;
              } else {
                // Den beendeten Bildschirm auch vergessen. Sonst bliebe sein
                // stehengebliebener Strom in der Liste und koennte beim
                // naechsten Mal als Alltagsstrom gewaehlt werden.
                if (paar.bildschirmStromId) paar.stroeme.delete(paar.bildschirmStromId);
                paar.bildschirmStromId = null;
              }
              ordneStroeme(paar);
              // `ordneStroeme` meldet nur bei einer Aenderung an den Stroemen.
              // Die Ankuendigung allein aendert `bildschirmErwartet`, und das
              // steht in der Ansicht.
              melde();
            }
          }
          for (const melder of regieMelder) melder(befehl, nachricht.von);
        }
        return;
      }

      if (nachricht.typ === "beschreibung") {
        // Kam das Hallo nicht an, entsteht das Paar notfalls hier. Ist der
        // Raum voll, bleibt es bei der Ablehnung.
        const paar = erzeugePaar(nachricht.von, nachricht.name);
        if (!paar) return;
        const { pc } = paar;

        const beschreibung = nachricht.daten as RTCSessionDescriptionInit;
        const kollision = beschreibung.type === "offer"
          && (paar.machtAngebot || pc.signalingState !== "stable");
        paar.ignoriereAngebot = !paar.hoeflich && kollision;
        if (paar.ignoriereAngebot) return;

        if (kollision) {
          // Hoeflich: eigenes Angebot zuruecknehmen und das fremde annehmen.
          await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
        }
        await pc.setRemoteDescription(beschreibung);

        if (beschreibung.type === "offer") {
          const antwort = await pc.createAnswer();
          await pc.setLocalDescription(antwort);
          sende({ typ: "beschreibung", an: paar.kennung, daten: pc.localDescription });
        }
        return;
      }

      if (nachricht.typ === "kandidat") {
        const paar = paare.get(nachricht.von);
        if (!paar) return;
        try {
          await paar.pc.addIceCandidate(nachricht.daten as RTCIceCandidateInit);
        } catch (fehler) {
          // Ein verworfenes Angebot bringt Kandidaten mit, die ins Leere laufen.
          if (!paar.ignoriereAngebot) console.warn("ICE-Kandidat abgelehnt:", fehler);
        }
      }
    } catch (fehler) {
      console.error("Signal konnte nicht verarbeitet werden:", fehler);
    }
  };

  kanal.on("broadcast", { event: "signal" }, ({ payload }) => {
    void behandleSignal(payload as SignalNachricht);
  });

  /*
   * Ohne den Boten kommt keine Verbindung zustande. Zwei Dinge muessen deshalb
   * sitzen: Es darf nicht ewig gewartet werden, sonst kehrt starteVerbindung
   * nie zurueck und die Seite haengt mit laufender Kamera. Und ein Fehlschlag
   * darf danach nicht mit "verbindet" ueberschrieben werden, sonst sitzt der
   * Nutzer vor einem Ladekringel, obwohl nichts mehr passiert.
   */
  const kanalSteht = await new Promise<boolean>((fertig) => {
    let entschieden = false;
    const einmal = (ergebnis: boolean) => {
      if (entschieden) return;
      entschieden = true;
      clearTimeout(wecker);
      fertig(ergebnis);
    };
    const wecker = setTimeout(() => einmal(false), 10000);
    kanal.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        sende({ typ: "hallo", name: eigenerName });
        einmal(true);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        einmal(false);
      }
    });
  });

  kanalGescheitert = !kanalSteht;
  aufZustand(kanalSteht ? "verbindet" : "gescheitert");

  /**
   * Alle Sender einer Spurart, ueber alle Paarverbindungen.
   *
   * Ausdruecklich gemerkt statt gesucht. Seit es waehrend des Teilens zwei
   * Videosender je Paar gibt, waere ein `find` nach der Spurart eine Wette
   * darauf, welcher von beiden zuerst in der Liste steht.
   */
  const senderFuer = (art: "audio" | "video") => [...paare.values()]
    .map((p) => (art === "video" ? p.kameraSender : p.tonSender))
    .filter((s): s is RTCRtpSender => Boolean(s));

  async function teileBildschirm(an: boolean): Promise<boolean> {
    if (beendet) return false;

    if (!an) {
      for (const paar of paare.values()) loeseBildschirm(paar);
      bildschirmSpur?.stop();
      bildschirmSpur = null;
      bildschirmStream = null;
      meldeTeilen(false);
      // Die Gegenstellen sollen die grosse Flaeche wieder freigeben. Ohne
      // diese Zeile stuende dort weiter ein Rahmen ohne Inhalt.
      sende({ typ: "regie", daten: { art: "bildschirm", an: false } });
      return false;
    }

    /*
     * Kein zweiter Anlauf, wenn schon geteilt wird oder die Bildschirmauswahl
     * des Browsers noch offen steht. Sonst entstand eine zweite Aufnahme,
     * deren erste niemand mehr beenden konnte: Der Knopf steuerte nur noch
     * die neue, und der Browser meldete weiter "Bildschirm wird geteilt".
     */
    if (bildschirmSpur) return true;
    if (holtBildschirm) return false;
    holtBildschirm = true;

    try {
      const anzeige = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const spur = anzeige.getVideoTracks()[0];
      if (!spur) return false;
      // Waehrend die Auswahl offen war, kann das Gespraech beendet worden
      // sein. Dann darf die Aufnahme nicht weiterlaufen.
      if (beendet) { spur.stop(); return false; }
      bildschirmSpur = spur;
      bildschirmStream = anzeige;
      /*
       * Der geteilte Bildschirm haengt bewusst NICHT am Kameraschalter.
       *
       * "Bild aus" meint die eigene Person, nicht einen Inhalt, den jemand
       * ausdruecklich zum Zeigen ausgewaehlt hat. Seit beide Spuren getrennt
       * hinausgehen, ist das auch sauber getrennt: Der Kameraschalter wirkt
       * auf die Kachel mit dem Gesicht, der geteilte Inhalt laeuft weiter.
       */
      spur.enabled = true;
      /*
       * Ein Hinweis fuer den Browser, worum es sich handelt. Bei "detail"
       * bevorzugt er scharfe Kanten und lesbare Schrift gegenueber einer
       * hohen Bildrate. Genau richtig fuer eine Tabelle oder ein Exposé,
       * und ohne Wirkung, wo der Browser es nicht kennt.
       */
      try { spur.contentHint = "detail"; } catch { /* aeltere Browser */ }
      // Wenn der Nutzer im Browserbanner auf "Beenden" klickt, zurueck zur
      // Kamera. `meldeTeilen` bringt die Leiste wieder in denselben Stand,
      // vorher blieb der Knopf "Teilen" dort aktiv stehen.
      spur.onended = () => { void teileBildschirm(false); };
      // An alle Gegenstellen, jede Paarverbindung bekommt einen zweiten Weg
      // fuer den Bildschirm. Die Kamera bleibt, wo sie ist.
      for (const paar of paare.values()) haengeBildschirmAn(paar);
      meldeTeilen(true);
      /*
       * Ein Rundruf an alle: Ab jetzt kommt ein zweiter Strom, und zwar
       * dieser hier. Die Kennung ist der verlaessliche Teil daran, siehe
       * `RegieBefehl`, Art "bildschirm".
       */
      sende({ typ: "regie", daten: { art: "bildschirm", an: true, strom: anzeige.id } });
      return true;
    } catch (fehler) {
      /*
       * Bricht der Nutzer die Auswahl des Browsers ab, ist das kein Fehler und
       * bleibt still. Alles andere stand bisher nirgends: Das Teilen ging
       * einfach nicht, ohne eine Zeile in der Konsole, an der man haette
       * sehen koennen warum.
       */
      if ((fehler as DOMException)?.name !== "NotAllowedError") {
        console.warn("Bildschirmteilen gescheitert:", fehler);
      }
      return false;
    } finally {
      holtBildschirm = false;
    }
  }

  return {
    eigeneKennung,
    // Derselbe Name, der beim Hallo an die anderen geht.
    eigenerName: eigenerName?.trim() || (istGastgeber ? "Gastgeber" : "Gast"),

    setzeSpur(art, an) {
      // Die Spuren sind fuer alle Paare dieselben Objekte, einmal schalten reicht.
      for (const spur of lokalerStream.getTracks()) {
        if (spur.kind === art) spur.enabled = an;
      }
      /*
       * Der geteilte Bildschirm liegt nicht im lokalen Stream, sondern auf
       * einem eigenen Weg, und bleibt vom Kameraschalter deshalb unberuehrt.
       * Wer waehrend des Teilens seine Kamera abschaltet, nimmt damit genau
       * sein Gesicht aus der kleinen Kachel; der Inhalt laeuft weiter.
       */
    },

    teileBildschirm,

    async ersetzeSpur(art, spur) {
      if (beendet) return;
      /*
       * Auch waehrend des Teilens. Der Bildschirm haengt an einem eigenen,
       * zweiten Weg, die Kamera bleibt ihr eigener Sender: Ein Geraetewechsel
       * oder die Leinwand des Video-Hintergrunds muss also durchkommen. Bis
       * zum 18.09.2026 lief dieser Aufruf waehrend des Teilens ins Leere,
       * damals zu Recht, weil der Bildschirm auf demselben Sender lag.
       */
      await Promise.all(senderFuer(art).map((s) => s.replaceTrack(spur)));
    },

    beobachteTeilen(melder) {
      teilenMelder.add(melder);
      /*
       * Sofort den aktuellen Stand melden. Die Gespraechsansicht wird nach
       * dem Minimieren neu aufgebaut und wusste sonst nicht, dass gerade
       * geteilt wird: Der Knopf stand auf "aus", obwohl der Bildschirm
       * hinausging, und ein Klick haette eine zweite Aufnahme gestartet.
       */
      melder(bildschirmSpur !== null, bildschirmStream);
      return () => { teilenMelder.delete(melder); };
    },

    sendeRegie(befehl, an) {
      sende({ typ: "regie", an, daten: befehl });
    },

    beobachteRegie(melder) {
      regieMelder.add(melder);
      return () => { regieMelder.delete(melder); };
    },

    beenden() {
      if (beendet) return;
      // Erst den Abschied abschicken, dann den Kanal schliessen. Andersherum
      // ist die Nachricht weg, bevor sie den Server erreicht, und die
      // Gegenstellen sitzen vor einem stehengebliebenen Bild.
      const abschied = kanal
        .send({ type: "broadcast", event: "signal", payload: { typ: "tschuess", von: eigeneKennung } })
        .catch(() => { /* dann eben ohne Abschied */ });
      beendet = true;
      bildschirmSpur?.stop();
      bildschirmSpur = null;
      bildschirmStream = null;
      teilenMelder.clear();
      regieMelder.clear();
      for (const paar of paare.values()) {
        try { paar.pc.getSenders().forEach((s) => s.track?.stop()); } catch { /* egal */ }
        paar.pc.onicecandidate = null;
        paar.pc.ontrack = null;
        paar.pc.onnegotiationneeded = null;
        paar.pc.onconnectionstatechange = null;
        try { paar.pc.close(); } catch { /* egal */ }
      }
      paare.clear();
      try { lokalerStream.getTracks().forEach((s) => s.stop()); } catch { /* egal */ }
      void abschied.finally(() => { void supabase.removeChannel(kanal); });
      aufZustand("getrennt");
    },
  };
}

/**
 * Eine Spur stummschalten oder wieder freigeben. Die Verbindung bleibt dabei
 * bestehen, es wird nur nichts mehr uebertragen.
 */
export function setzeSpurZustand(stream: MediaStream | null, art: "audio" | "video", an: boolean): void {
  if (!stream) return;
  for (const spur of stream.getTracks()) {
    if (spur.kind === art) spur.enabled = an;
  }
}

/**
 * Kann dieser Browser den Hintergrund selbst weichzeichnen?
 *
 * Manche Browser und Betriebssysteme bringen das mit und rechnen es im
 * Kameratreiber.
 *
 * ACHTUNG: Diese beiden Funktionen werden nirgends mehr aufgerufen, ausserhalb
 * von Testattrappen. Der Videoraum trennt Person und Hintergrund seit dem
 * Umbau selbst, siehe `videocallHintergrund.ts`. Das ist die verlaesslichere
 * Wahl, weil sie ueberall gleich aussieht und auch Ersatzbilder kann, was der
 * Browserweg nicht hergibt. Sie stehen nur noch hier, falls der Browserweg
 * spaeter als sparsamere Abkuerzung zurueckkehren soll.
 */
export function kannHintergrundWeichzeichnen(stream: MediaStream | null): boolean {
  const spur = stream?.getVideoTracks()[0];
  if (!spur?.getCapabilities) return false;
  try {
    const faehigkeiten = spur.getCapabilities() as MediaTrackCapabilities & { backgroundBlur?: boolean[] };
    return Array.isArray(faehigkeiten.backgroundBlur) && faehigkeiten.backgroundBlur.includes(true);
  } catch {
    return false;
  }
}

export async function setzeHintergrundWeichzeichnen(stream: MediaStream | null, an: boolean): Promise<boolean> {
  const spur = stream?.getVideoTracks()[0];
  if (!spur) return false;
  try {
    await spur.applyConstraints({ advanced: [{ backgroundBlur: an }] } as MediaTrackConstraints);
    return true;
  } catch (fehler) {
    console.warn("Hintergrund konnte nicht weichgezeichnet werden:", fehler);
    return false;
  }
}

/**
 * Kamera und Mikrofon anfordern. Gibt eine verstaendliche Meldung zurueck,
 * statt den Browserfehler durchzureichen: das hier sieht der Kunde.
 */
export interface MedienErgebnis {
  stream: MediaStream | null;
  /** Verstaendliche Meldung, wenn kein Stream zustande kam. */
  grund: string | null;
}

export async function holeMedien(optionen?: {
  video?: boolean;
  audio?: boolean;
  /**
   * Bevorzugte Geraete aus den Videocall-Einstellungen. Fehlt das Geraet
   * (etwa eine abgezogene USB-Kamera), wird einmal ohne Wunsch neu
   * angefragt: der saubere Rueckfall auf den Browser-Standard.
   */
  kameraId?: string;
  mikrofonId?: string;
}): Promise<MedienErgebnis> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { stream: null, grund: "Dieser Browser unterstützt keine Videogespräche. Bitte Chrome, Safari oder Edge verwenden." };
  }
  const willVideo = optionen?.video !== false;
  const willAudio = optionen?.audio !== false;
  const kameraId = optionen?.kameraId;
  const mikrofonId = optionen?.mikrofonId;
  const bild = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(kameraId ? { deviceId: { exact: kameraId } } : {}),
  };
  const ton = {
    echoCancellation: true,
    noiseSuppression: true,
    ...(mikrofonId ? { deviceId: { exact: mikrofonId } } : {}),
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: willVideo ? bild : false,
      audio: willAudio ? ton : false,
    });
    return { stream, grund: null };
  } catch (fehler) {
    const name = (fehler as DOMException)?.name;

    // Das Wunschgeraet gibt es nicht mehr. Einmal ohne Wunsch neu anfragen,
    // sonst hinge das ganze Gespraech an einer abgezogenen USB-Kamera.
    if ((kameraId || mikrofonId)
      && (name === "OverconstrainedError" || name === "NotFoundError")) {
      return holeMedien({ video: willVideo, audio: willAudio });
    }

    /*
     * Fehlt nur eines von beiden, hat der Kunde bisher gar nichts bekommen:
     * ein Rechner ohne Kamera liess kein Gespraech zu, obwohl das Mikrofon da
     * war. Deshalb hier der zweite Anlauf mit jeweils einem Geraet. Was fehlt,
     * steht danach in der Technikkarte des Warteraums.
     */
    if ((name === "NotFoundError" || name === "OverconstrainedError") && willVideo && willAudio) {
      for (const ersatz of [{ video: false, audio: ton }, { video: bild, audio: false }]) {
        try {
          return { stream: await navigator.mediaDevices.getUserMedia(ersatz), grund: null };
        } catch { /* dann eben der naechste Versuch */ }
      }
    }

    if (name === "NotAllowedError") {
      return { stream: null, grund: "Der Zugriff auf Kamera und Mikrofon wurde abgelehnt. Bitte in den Browsereinstellungen erlauben und die Seite neu laden." };
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return { stream: null, grund: "Es wurde keine Kamera oder kein Mikrofon gefunden." };
    }
    if (name === "NotReadableError") {
      return { stream: null, grund: "Kamera oder Mikrofon werden bereits von einem anderen Programm benutzt." };
    }
    return { stream: null, grund: "Kamera und Mikrofon konnten nicht gestartet werden." };
  }
}
