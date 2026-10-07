import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, MicOff, MonitorUp, MoreVertical, VideoOff } from "lucide-react";
import { setzeAusgabeGeraet } from "@/lib/videocallGeraete";
import { STAND_AN, type Stand } from "@/lib/videoraumStaende";
import type { VerbindungsZustand } from "@/lib/videoraumVerbindung";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte, type VideoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Die Bausteine einer Kamerakachel.
 *
 * Sie standen bis zum 18.09.2026 in `Gespraech.tsx` und sind von dort
 * unveraendert hierher gezogen. Der Grund: Dieselbe Kachel wird jetzt an drei
 * Orten gebraucht, im Gespraech, in der Leiste oben und im schwebenden Fenster
 * auf dem Schreibtisch. Ein zweites Mal gebaut waere sie ein zweites Mal
 * anders, und genau das war vorher schon einmal der Fehler (siehe die Regie in
 * `videoraumBuehne`).
 *
 * Hier liegen nur die kleinen Teile: die Videoflaeche, der Hinweis auf die
 * abgeschaltete Kamera, der Fuss mit Name und Stummzeichen und die beiden
 * Klassensaetze. Die zusammengesetzten Kacheln (Teilnehmer, eigenes Bild)
 * bleiben dort, wo sie gebraucht werden.
 */

/**
 * Das Anfangsverhaeltnis, bis die erste Spur ihr eigenes meldet.
 *
 * Quer, weil ein Rechner und die meisten Kameras quer liefern. Ein Wert muss
 * es sein: Mit `videoWidth` von 0 faellt die Kachel sonst in sich zusammen.
 */
export const FORMAT_QUER = 16 / 9;

/**
 * Der Dunkelton jeder Kachel, an einer einzigen Stelle.
 *
 * Er steht nicht nur im Rahmen der Kachel, sondern auch hinter jedem Bild, das
 * seine Kachel nicht ganz fuellt. Christian am 18.09.2026 zum Telefon: „dann
 * ist eben oben und unten ein dunkler balken, aber dann ist das so." Damit
 * diese Balken ueberall gleich aussehen, gibt es genau diesen einen Ton, und
 * kein zweites Schwarz daneben.
 */
export const KACHEL_FARBE = "bg-gradient-to-br from-[#22303f] to-[#141d28]";

export function VideoFlaeche({
  stream,
  stumm,
  spiegeln = false,
  einpassen = false,
  sinkId,
  aufFormat,
  aufBildfluss,
  className = "",
}: {
  stream: MediaStream | null;
  stumm: boolean;
  spiegeln?: boolean;
  /**
   * Ganz hineinpassen statt die Flaeche fuellen.
   *
   * Ein Kamerabild darf beschnitten werden, da steht in der Mitte ein
   * Gesicht. Ein geteilter Bildschirm nicht: Beschneiden hiesse, dass die
   * Werkzeugleiste, der Rand einer Tabelle oder eine Zahl am unteren Rand
   * beim Kunden schlicht fehlt, ohne dass es jemandem auffaellt.
   */
  einpassen?: boolean;
  /** Lautsprecher fuer die Wiedergabe, nur wo der Browser `setSinkId` kann. */
  sinkId?: string | null;
  /**
   * Meldet Breite geteilt durch Hoehe der ankommenden Spur, sobald sie
   * bekannt ist und jedes Mal, wenn sie sich aendert. Die Kachel richtet sich
   * danach, statt dem Bild eine Form vorzuschreiben.
   */
  aufFormat?: (verhaeltnis: number) => void;
  /**
   * Meldet, ob gerade wirklich Bilder ankommen.
   *
   * Zwei Anhaltspunkte, beide vom Browser und keiner davon eine Meldung der
   * Gegenseite: `track.muted` steht bei einer EMPFANGENEN Spur nicht fuer
   * „stummgeschaltet", sondern fuer „es fliessen gerade keine Daten", und
   * `videoWidth` bleibt 0, solange nie ein Bild ankam. Was die Kachel daraus
   * macht, entscheidet `bestimmeBildstand`.
   */
  aufBildfluss?: (fliesst: boolean) => void;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // Auf iOS startet die Wiedergabe nicht immer von selbst.
    if (stream) void el.play().catch(() => { /* der Nutzer tippt gleich ohnehin */ });
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el || sinkId === undefined) return;
    void setzeAusgabeGeraet(el, sinkId);
  }, [sinkId, stream]);

  /*
   * Das Format der Spur.
   *
   * `loadedmetadata` allein genuegt nicht: Es kommt einmal. Dreht der Gast
   * sein Telefon, wird aus 720 mal 1280 ein 1280 mal 720, und die Kachel
   * bliebe hochkant stehen. Dafuer gibt es `resize` am Video-Element. Beim
   * ersten Bild kann `videoWidth` noch 0 sein, dann wird nichts gemeldet und
   * der Anfangswert gilt weiter.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !aufFormat) return;
    const melde = () => {
      if (el.videoWidth > 0 && el.videoHeight > 0) aufFormat(el.videoWidth / el.videoHeight);
    };
    melde();
    el.addEventListener("loadedmetadata", melde);
    el.addEventListener("resize", melde);
    return () => {
      el.removeEventListener("loadedmetadata", melde);
      el.removeEventListener("resize", melde);
    };
  }, [aufFormat, stream]);

  /*
   * Ob ueberhaupt etwas ankommt.
   *
   * Dieselben Ereignisse wie oben, dazu die Spur selbst: `mute` und `unmute`
   * kommen vom Empfangsende, wenn der Strom versiegt oder wieder anfaengt.
   * `enabled` und `readyState` sagen dazu nichts Brauchbares, die stehen bei
   * einer empfangenen Spur auch dann auf „live", wenn seit Minuten kein Bild
   * mehr kommt.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el || !aufBildfluss) return;
    const spur = stream?.getVideoTracks?.()[0] ?? null;
    const melde = () => {
      aufBildfluss(spur !== null && spur.readyState === "live" && !spur.muted && el.videoWidth > 0);
    };
    melde();
    el.addEventListener("loadedmetadata", melde);
    el.addEventListener("resize", melde);
    el.addEventListener("emptied", melde);
    spur?.addEventListener("mute", melde);
    spur?.addEventListener("unmute", melde);
    spur?.addEventListener("ended", melde);
    return () => {
      el.removeEventListener("loadedmetadata", melde);
      el.removeEventListener("resize", melde);
      el.removeEventListener("emptied", melde);
      spur?.removeEventListener("mute", melde);
      spur?.removeEventListener("unmute", melde);
      spur?.removeEventListener("ended", melde);
    };
  }, [aufBildfluss, stream]);

  /*
   * Absolut gesetzt, nicht nur `h-full`.
   *
   * Safari auf dem iPhone rechnet `height: 100%` nicht aus, wenn der Elternteil
   * seine Hoehe erst aus `flex: 1` bekommt. Das Video behielt dort seine eigene
   * Hoehe aus dem Seitenverhaeltnis: oben das Bild, darunter eine grosse
   * dunkle Flaeche. Mit `absolute inset-0` gibt es nichts mehr auszurechnen.
   * Der Elternteil ist an allen Stellen `relative`.
   */
  return (
    <video
      ref={ref}
      data-pruefung="video-flaeche"
      autoPlay
      playsInline
      muted={stumm}
      className={`absolute inset-0 h-full w-full ${einpassen ? "object-contain" : "object-cover"} ${spiegeln ? "-scale-x-100" : ""} ${className}`}
    />
  );
}

/**
 * Der Hinweis auf die ausgeschaltete Kamera.
 *
 * Er liegt deckend ueber dem Bild, denn darunter ist ohnehin nur Schwarz.
 * Ruhig gehalten, nicht rot: Eine ausgeschaltete Kamera ist kein Fehler,
 * sondern eine Entscheidung.
 */
export function KameraAus({ text, klein = false }: { text: string; klein?: boolean }) {
  return (
    <div
      data-pruefung="kamera-aus"
      className={`absolute inset-0 flex flex-col items-center justify-center ${KACHEL_FARBE} text-center ${
        klein ? "gap-1 px-2 pb-5" : "gap-2 px-4 pb-8"
      }`}
    >
      <VideoOff className={klein ? "h-4 w-4 text-white/40" : "h-6 w-6 text-white/40"} />
      {/* Der Platz unten gehoert dem Namensschild, deshalb das `pb`. */}
      <p className={klein ? "text-[10.5px] leading-tight text-white/60" : "text-[13px] text-white/60"}>{text}</p>
    </div>
  );
}

/**
 * Wie lange Stille sein darf, bevor die Kachel ueberhaupt etwas sagt.
 *
 * Zweieinhalb Sekunden, und zwar aus zwei Gruenden. Erstens ist genau dieser
 * Zustand kurz nach dem Beitritt voellig normal: Die Spur ist angemeldet, das
 * erste Bild ist aber noch unterwegs, gemessen meist unter einer Sekunde. Wer
 * dort schon einen Hinweis liest, liest ihn jedes Mal, und ein Hinweis, den
 * man immer sieht, sagt nichts mehr. Zweitens setzt ein Strom zwischendurch
 * aus, beim Wechsel zwischen WLAN und Mobilfunk etwa. Alles darunter soll
 * unbemerkt vorbeigehen, sonst blinkt die Kachel.
 */
export const BILD_WARTEN_MS = 2500;

/**
 * Ab wann aus dem Warten ein deutlicher Hinweis wird.
 *
 * Zehn Sekunden. So lange braucht keine Verbindung, die zustande kommt: Eine
 * neue Aushandlung samt Kandidatensuche ist in aller Regel nach zwei bis drei
 * Sekunden durch. Wer zehn Sekunden lang nichts bekommt, bekommt meistens
 * nichts mehr, und dann darf es auch so dastehen.
 */
export const BILD_STOERUNG_MS = 10000;

/**
 * Was in einer Kachel steht, in der kein Bild zu sehen ist.
 *
 * Der Anlass, Christian am 18.09.2026: „warum sehe ich als gastgeber nicht
 * chris peetz laptop?" Gemessen war die Lage eindeutig: Der Laptop meldete
 * ueber den Regiekanal „Kamera an", die empfangene Spur stand aber auf
 * `muted`, das Video auf 0 mal 0, und in zwei Sekunden kam kein einziges Bild.
 * Die Kachel zeigte trotzdem keinen Hinweis, weil sie nur auf die Meldung sah.
 *
 * Fuer den Gastgeber sah eine abgeschaltete Kamera damit genauso aus wie eine
 * klemmende Leitung, naemlich wie ein schwarzes Rechteck. Deshalb wertet die
 * Kachel jetzt beides aus, die Meldung UND den tatsaechlichen Zustand.
 */
export type Bildstand = "laeuft" | "aus" | "wartet" | "stoerung" | "verbindung";

/**
 * Die Entscheidung selbst, ohne Browser und ohne Uhr, damit sie pruefbar ist.
 *
 * Die Reihenfolge ist der Inhalt: Die Meldung „Kamera aus" steht ganz vorn,
 * denn sie ist eine Aussage des Menschen am anderen Ende und damit sicherer
 * als alles, was sich aus der Leitung ablesen laesst. Erst wenn jemand die
 * Kamera an hat und trotzdem nichts ankommt, wird geraten, und auch dann
 * zurueckhaltend.
 */
export function bestimmeBildstand({
  bildAnGemeldet,
  bildFliesst,
  stilleMs,
  zustand,
}: {
  /** Was die Gegenseite ueber den Regiekanal meldet. */
  bildAnGemeldet: boolean;
  /** Was der Browser sieht: Kommen gerade Bilder an? */
  bildFliesst: boolean;
  /** Wie lange schon nichts ankommt, oder null, solange etwas ankommt. */
  stilleMs: number | null;
  /** Der Zustand dieser einen Paarverbindung, siehe `videoraumVerbindung`. */
  zustand?: VerbindungsZustand;
}): Bildstand {
  if (!bildAnGemeldet) return "aus";
  if (bildFliesst) return "laeuft";
  /*
   * Der einzige Fall, in dem nichts geraten werden muss: Die
   * Verbindungsschicht kennt den Zustand jeder Paarverbindung aus
   * `RTCPeerConnection.connectionState` und reicht ihn als `zustand` an der
   * Gegenstelle mit. Steht dort "failed" oder "disconnected", ist die Leitung
   * wirklich weg, und das darf die Kachel auch sofort sagen.
   */
  if (zustand === "gescheitert" || zustand === "getrennt") return "verbindung";
  if (stilleMs === null) return "laeuft";
  if (stilleMs >= BILD_STOERUNG_MS) return "stoerung";
  if (stilleMs >= BILD_WARTEN_MS) return "wartet";
  return "laeuft";
}

/**
 * Wie lange schon kein Bild mehr ankommt, in groben Stufen.
 *
 * Grob genuegt: Gebraucht werden nur die beiden Schwellen. Und jede Aenderung
 * am Fluss stellt die Uhr zurueck, das ist der Schutz vor dem Flackern. Ein
 * Aussetzer von einer Sekunde erreicht die erste Schwelle nie, und sobald
 * wieder Bilder kommen, ist der Hinweis im selben Augenblick weg.
 */
function useStille(fliesst: boolean): number | null {
  const [stille, setStille] = useState<number | null>(fliesst ? null : 0);
  useEffect(() => {
    if (fliesst) { setStille(null); return; }
    setStille(0);
    const warten = window.setTimeout(() => setStille(BILD_WARTEN_MS), BILD_WARTEN_MS);
    const stoerung = window.setTimeout(() => setStille(BILD_STOERUNG_MS), BILD_STOERUNG_MS);
    return () => { window.clearTimeout(warten); window.clearTimeout(stoerung); };
  }, [fliesst]);
  return stille;
}

/**
 * Der Fluss einer empfangenen Spur, fertig fuer die Kachel.
 *
 * Gibt zurueck, was die Videoflaeche als `aufBildfluss` braucht, und den
 * daraus berechneten Stand. Beides gehoert zusammen und steht deshalb an einer
 * Stelle.
 */
export function useBildstand(
  bildAnGemeldet: boolean,
  zustand?: VerbindungsZustand,
): { aufBildfluss: (fliesst: boolean) => void; bildstand: Bildstand } {
  const [fliesst, setFliesst] = useState(false);
  const stilleMs = useStille(fliesst);
  return {
    aufBildfluss: setFliesst,
    bildstand: bestimmeBildstand({ bildAnGemeldet, bildFliesst: fliesst, stilleMs, zustand }),
  };
}

/**
 * Was in der leeren Kachel steht, je Fall. Der Text gehoert zur Entscheidung.
 * Die Saetze selbst stehen in `videoraumGastTexte` (Deutsch und Englisch),
 * hier steht, welcher zu welchem Fall gehoert.
 */
const BILD_HINWEISE = {
  wartet: {
    pruefung: "bild-wartet",
    text: "warteBild",
    /*
     * Kein Zusatz und kein Rot. In diesem Augenblick ist noch gar nichts
     * schiefgegangen, es dauert nur.
     */
    zusatz: undefined as keyof VideoraumGastTexte["kachel"] | undefined,
    dreht: true,
  },
  stoerung: {
    pruefung: "bild-stoerung",
    text: "keinBild",
    // Der erste Satz ist das, was wir sicher wissen, der zweite ein Vorschlag.
    zusatz: "keinBildZusatz",
    dreht: false,
  },
  verbindung: {
    pruefung: "verbindung-weg",
    text: "abgerissen",
    zusatz: "abgerissenZusatz",
    dreht: false,
  },
} as const satisfies Record<string, {
  pruefung: string;
  text: keyof VideoraumGastTexte["kachel"];
  zusatz: keyof VideoraumGastTexte["kachel"] | undefined;
  dreht: boolean;
}>;

/**
 * Der Hinweis in einer Kachel ohne Bild.
 *
 * „Kamera ist aus" bleibt unveraendert, samt seinem Pruefzeichen: Das ist der
 * haeufige und harmlose Fall. Die beiden anderen sehen anders aus, damit man
 * sie auseinanderhalten kann, ohne den Text zu lesen.
 */
export function BildHinweis({
  art,
  klein = false,
  kameraAusText,
  sprache = "de",
}: {
  art: Exclude<Bildstand, "laeuft">;
  klein?: boolean;
  kameraAusText?: string;
  /** Sprache der Hinweise, Vorgabe Deutsch. Der Gastgeber im CRM bleibt deutsch. */
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).kachel;
  if (art === "aus") return <KameraAus text={kameraAusText ?? t.kameraIstAus} klein={klein} />;
  const hinweis = BILD_HINWEISE[art];
  const Zeichen = hinweis.dreht ? Loader2 : AlertTriangle;
  return (
    <div
      data-pruefung={hinweis.pruefung}
      className={`absolute inset-0 flex flex-col items-center justify-center ${KACHEL_FARBE} text-center ${
        klein ? "gap-1 px-2 pb-5" : "gap-2 px-4 pb-8"
      }`}
    >
      <Zeichen
        aria-hidden
        className={`${hinweis.dreht ? "animate-spin text-white/40" : "text-white/55"} ${klein ? "h-4 w-4" : "h-6 w-6"}`}
      />
      <p className={klein ? "text-[10.5px] leading-tight text-white/60" : "text-[13px] text-white/70"}>{t[hinweis.text]}</p>
      {/* Der zweite Satz nur dort, wo Platz ist. In einer 149 Pixel breiten
          Kachel waere er drei Zeilen lang und ueberdeckte den Namen. */}
      {hinweis.zusatz && !klein && (
        <p className="max-w-[260px] text-[11.5px] leading-snug text-white/45">{t[hinweis.zusatz]}</p>
      )}
    </div>
  );
}

/**
 * Was der Gastgeber an einer Gastkachel schalten darf.
 *
 * Genau die beiden Befehle, die auch in der Spalte stehen, und zwar dieselben
 * Funktionen. Das Menue ist der naehere Weg dorthin, kein zweiter Satz Regeln.
 */
export interface KachelRegie {
  /** Meldung des Gastes, keine Annahme: Er kann sich selbst wieder einschalten. */
  tonAn: boolean;
  teilenErlaubt: boolean;
  aufStumm: () => void;
  aufTeilen: () => void;
  /** Ohne stehende Leitung laesst sich nichts schalten. */
  gesperrt?: boolean;
}

/**
 * Die Gastregie, so wie der Gastgeber sie hereinreicht.
 *
 * Eine Sammlung fuer alle Gaeste, nicht fuer einen: Die Kacheln fragen sie mit
 * der Kennung ab, siehe `menueRegie`. Nur der Gastgeber hat sie, ein Gast
 * bekommt sie gar nicht erst, und deshalb gibt es bei ihm auch kein Menue.
 */
export interface GastRegie {
  stand: (kennung: string) => { tonAn: boolean; teilenErlaubt: boolean };
  aufStumm: (kennung: string) => void;
  aufTeilen: (kennung: string) => void;
  /** Ohne stehende Leitung laesst sich nichts schalten. */
  gesperrt?: boolean;
}

/**
 * Die Regie fuer genau eine Gastkachel.
 *
 * Steht fuer sich, weil hier das Entscheidende passiert: Aus „stummschalten"
 * wird „diesen einen stummschalten". Bei drei Gaesten im Raum ist genau das
 * die Stelle, an der man sich vertun kann, und der Falsche waere ploetzlich
 * stumm. Gerufen werden dieselben Funktionen wie in der Spalte.
 */
export function menueRegie(kennung: string, gastRegie?: GastRegie): KachelRegie | undefined {
  if (!gastRegie) return undefined;
  const stand = gastRegie.stand(kennung);
  return {
    tonAn: stand.tonAn,
    teilenErlaubt: stand.teilenErlaubt,
    aufStumm: () => gastRegie.aufStumm(kennung),
    aufTeilen: () => gastRegie.aufTeilen(kennung),
    gesperrt: gastRegie.gesperrt,
  };
}

/** Ein Eintrag im Dreipunktmenue. */
export interface MenueEintrag {
  /** Welches Zeichen davor steht. */
  zeichen: "ton" | "teilen";
  /** Was der Eintrag sagt. Er sagt, was der Klick TUT, nicht wie der Stand ist. */
  text: string;
  gesperrt: boolean;
  wirkung: () => void;
}

/**
 * Was im Menue steht, als reine Rechnung.
 *
 * Steht fuer sich, damit sich Wortlaut und Wirkung pruefen lassen, ohne das
 * Menue aufzuklappen: Ein geoeffnetes Radix-Menue kostet in jsdom Sekunden,
 * und dieselbe Pruefung ist hier in Millisekunden erledigt.
 *
 * Die Stummschaltung laesst sich nicht aufheben. Ein fremdes Mikrofon kann von
 * aussen niemand einschalten, es gibt dafuer auch keinen Regiebefehl, siehe
 * `RegieBefehl`. Deshalb ruht der Eintrag dann, statt etwas zu versprechen.
 */
export function kachelMenueEintraege(regie: KachelRegie): MenueEintrag[] {
  return [
    {
      zeichen: "ton",
      text: regie.tonAn ? "Stummschalten" : "Ist stumm",
      gesperrt: !regie.tonAn || Boolean(regie.gesperrt),
      wirkung: regie.aufStumm,
    },
    {
      zeichen: "teilen",
      text: regie.teilenErlaubt ? "Teilen sperren" : "Teilen freigeben",
      gesperrt: Boolean(regie.gesperrt),
      wirkung: regie.aufTeilen,
    },
  ];
}

/**
 * Das Dreipunktmenue rechts oben in einer Gastkachel.
 *
 * Christian am 18.09.2026: „macht es sinn in jedem kästchen der gäste so
 * rechts oben drei punkte anzuzeigen, wenn man da klickt dann kann man diese
 * stummschalten und teilen freigeben". Bei drei Gaesten musste man vorher in
 * der Spalte Namen abgleichen, hier steht der Befehl an dem Gesicht, das er
 * betrifft.
 *
 * Nur beim Gastgeber und nur an fremden Kacheln, siehe `Gespraech`: Ein Gast
 * bekommt die Regie gar nicht erst herein und kann deshalb niemanden
 * stummschalten. Die eigene Kachel hat kein Menue, dafuer gibt es die
 * Knopfleiste.
 *
 * Die Trefferflaeche ist 44 mal 44 Pixel in FESTEN Pixeln. In `index.css`
 * steht unter `max-width: 767px` eine Regel `button { min-height: 40px }`, die
 * ein `min-h-[44px]` aus Tailwind schlagen wuerde. Sichtbar ist nur das
 * kleinere Feld in der Mitte: unauffaellig ueber dem Bild, deutlicher, sobald
 * die Maus darueber steht, und auf dem Telefon trotzdem zu treffen.
 */
export function KachelMenue({ name, regie, klein = false }: { name: string; regie: KachelRegie; klein?: boolean }) {
  return (
    /*
     * Nicht sperrend (`modal={false}`). Ein sperrendes Menue legt die ganze
     * Seite still, solange es offen steht: Ein Klick auf „Auflegen" oder auf
     * das Mikrofon ginge dann ins Leere und schloesse nur das Menue. In einem
     * laufenden Gespraech ist das die falsche Reihenfolge.
     */
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-pruefung="kachel-menue"
          aria-label={`Optionen für ${name}`}
          className="absolute right-0 top-0 z-10 flex h-[44px] w-[44px] items-center justify-center text-white/70 transition-colors hover:text-white"
        >
          <span
            className={`flex items-center justify-center rounded-lg bg-[#0B1119]/45 backdrop-blur-[2px] transition-colors hover:bg-[#0B1119]/80 ${
              klein ? "h-7 w-7" : "h-8 w-8"
            }`}
          >
            <MoreVertical aria-hidden className={klein ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </span>
        </button>
      </DropdownMenuTrigger>
      {/*
        Dunkel wie der ganze Raum, und mit Ausrufezeichen.

        Christian am 18.09.2026 zu einem Bild aus dem laufenden Gespraech: „Da
        sieht man die beiden Texte nicht." Das Menue kam aus `components/ui`
        und bringt von dort `bg-popover` und `text-popover-foreground` mit,
        also die hellen Farben des CRM. Dagegen stand hier helle Schrift, und
        helle Schrift auf heller Flaeche ist keine.

        Die Klassen mit `!` sind hier kein Schmuck: Ob eine gewoehnliche Klasse
        die Vorgabe schlaegt, haengt an der Reihenfolge im gebauten Stylesheet
        und daran, dass `cn` den Widerspruch erkennt. Beides ist von aussen
        nicht zu sehen und hat hier offenbar nicht gegriffen. Mit `!important`
        ist es entschieden, und zwar an der Stelle, an der man es liest.

        Deckend, ohne Durchsicht: Ein durchscheinender Grund holt sich seine
        Helligkeit von dem, was zufaellig darunter liegt, und darunter liegt
        hier mal ein Videobild, mal die helle CRM-Seite.
      */}
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-56 !border-white/15 !bg-[#0F1621] !text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,.85)]"
      >
        {kachelMenueEintraege(regie).map((eintrag) => (
          <DropdownMenuItem
            key={eintrag.zeichen}
            data-pruefung={`menue-${eintrag.zeichen}`}
            disabled={eintrag.gesperrt}
            onSelect={() => eintrag.wirkung()}
            /*
              Der ruhende Eintrag wird nicht blass gemacht, sondern bekommt
              seine eigene Farbe: `opacity-50` auf weisser Schrift landete bei
              einem Kontrast von 3 zu 1, und das ist zu wenig, um es noch zu
              lesen. Mit `text-white/55` sind es 6 zu 1.
            */
            className="gap-2 py-2 text-[13px] !text-white/90 focus:!bg-white/15 focus:!text-white data-[disabled]:!opacity-100 data-[disabled]:!text-white/55"
          >
            {eintrag.zeichen === "ton"
              ? <MicOff aria-hidden className="h-3.5 w-3.5" />
              : <MonitorUp aria-hidden className="h-3.5 w-3.5" />}
            {eintrag.text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Das Namensschild am unteren Rand jeder Kamerasicht.
 *
 * Christian am 18.09.2026: „zudem muss in jeder kamerasicht beim gegenueber
 * der name des jeweiligen angezeigt werden und davor dann das stummschalten
 * zeichen wenn die person stummgeschalten ist." Und dazu: „bei dem einen
 * steht der name drin, beim anderen nicht ... und die namenbetitelung bitte
 * unten an den rand setzen jeweils."
 *
 * Vorher war es zweierlei gebaut: die fremde Kachel trug eine schwebende
 * Pille, die bei kleinen Kacheln fast ueber den Rand hinausragte, die eigene
 * nur ein angeschnittenes „Du" in der Ecke. Jetzt ist es eine Bauart, in jeder
 * Kamerasicht dieselbe: eine Leiste ueber die ganze Kachelbreite, buendig am
 * unteren Rand, mit einem weichen Verlauf nach oben, damit die Schrift auf
 * jedem Bild lesbar bleibt. Sie kann nicht ueberstehen, weil sie genau so
 * breit ist wie die Kachel.
 *
 * Der gruene Punkt ist ersatzlos weg. Er stand nur dort, wo ohnehin schon ein
 * Bild ankam, sagte also nichts, was man nicht sah. Fehlt der Strom, steht in
 * der Kachel der Wartehinweis.
 *
 * Der Hinweis auf die ausgeschaltete Kamera liegt dagegen in der Flaeche
 * darueber. Sind Mikrofon und Kamera gleichzeitig aus, sieht man beides: den
 * Hinweis in der Mitte, das Zeichen unten vor dem Namen.
 */
export function KachelFuss({
  name,
  tonAn,
  klein = false,
  sprache = "de",
}: {
  name: string;
  tonAn: boolean;
  klein?: boolean;
  /** Sprache des Vorlesetextes, Vorgabe Deutsch. */
  sprache?: Sprache;
}) {
  return (
    <div
      data-pruefung="kachel-fuss"
      className={`absolute inset-x-0 bottom-0 z-10 flex items-center bg-gradient-to-t from-[#0B1119]/85 to-transparent ${
        klein ? "gap-1 px-1.5 pb-1 pt-4 text-[10.5px]" : "gap-1.5 px-2.5 pb-1.5 pt-6 text-[12.5px]"
      }`}
    >
      {!tonAn && (
        <MicOff
          data-pruefung="ton-aus"
          aria-label={mitWerten(videoraumGastTexte(sprache).kachel.istStumm, { name })}
          className={`shrink-0 text-white/75 ${klein ? "h-3 w-3" : "h-[15px] w-[15px]"}`}
        />
      )}
      {/*
        `truncate` statt Umbruch: Ein langer Name soll die Kachel weder
        verlassen noch zweizeilig werden. In einer 147 Pixel breiten Kachel
        bleiben so die ersten Silben lesbar, und mehr braucht es dort nicht.
      */}
      <span className="truncate font-medium text-white/90">{name}</span>
    </div>
  );
}

/**
 * Die Klassen einer Kachel, die sich nach dem Bild richtet.
 *
 * Die gemessene Lage am 18.09.2026: Ein Gast am Telefon schickt 720 mal 1280,
 * also hochkant, und landete in einer 1111 mal 842 grossen Kachel im Format
 * 4 zu 3. Um sie zu fuellen, wurde das Bild auf 1975 Pixel Hoehe gezogen,
 * sichtbar blieben 842. Von Christian waren 43 Prozent zu sehen, ein
 * Ausschnitt des Oberkoerpers.
 *
 * Deshalb gibt die Kachel dem Bild keine Form mehr vor, sondern nimmt dessen
 * eigene an. Beide Kacheln im Stapel bekommen dieselbe Hoehe und werden
 * mittig gestellt, ihre Breite ergibt sich aus dem Format. Gleiche Hoehe ist
 * hier die ruhigere Groesse: Der Stapel laeuft nach unten, ungleiche Hoehen
 * faenden sofort auf, ungleiche Breiten kaum. Das `object-contain` im Video
 * bleibt trotzdem der zweite Gurt, denn in einem sehr schmalen Fenster greift
 * `max-w-full` und die Kachel ist dann doch etwas breiter als das Bild.
 */
export const KACHEL_GRUND = `overflow-hidden rounded-2xl border border-white/[0.07] ${KACHEL_FARBE}`;

/**
 * Die Kachel, die ihre Breite aus dem Seitenverhaeltnis bekommt.
 *
 * Absolut gesetzt, und das ist der Punkt. Als gewoehnliches Flex-Kind mit
 * `height: 100%` half `aspect-ratio` nicht: Der Browser bestimmt die Breite
 * eines Flex-Kindes, bevor seine prozentuale Hoehe feststeht, und nahm die
 * Breite des Inhalts. Der Inhalt ist ein absolut liegendes Video, also null.
 * Gemessen blieben von der Kachel zwei Pixel uebrig, nur die Raender.
 *
 * Bei einer absolut gesetzten Box mit `top: 0` und `bottom: 0` ist die Hoehe
 * dagegen von vornherein bekannt, und die Breite folgt daraus. `left-1/2` mit
 * der Verschiebung um die halbe eigene Breite stellt sie mittig. `max-w-full`
 * ist die Notbremse fuer sehr schmale Fenster; dann ist die Kachel breiter als
 * das Bild, und das `object-contain` im Video haelt es trotzdem heil.
 */
export const KACHEL_IM_FORMAT = "absolute inset-y-0 left-1/2 max-w-full -translate-x-1/2";

/**
 * Die kleine Kachel fuer die Leiste und das schwebende Fenster.
 *
 * Derselbe Aufbau wie im Gespraech, nur ohne die Formatrechnerei: An beiden
 * Orten ist der Platz fest vorgegeben, und das `object-contain` der
 * Videoflaeche sorgt dafuer, dass trotzdem nichts beschnitten wird. Was frei
 * bleibt, ist der dunkle Grund der Kachel.
 *
 * Immer stumm, und das mit Absicht: Diese Kachel laesst sich einklappen und
 * ihr Fenster zumachen. Der Ton darf davon nicht abhaengen, er kommt an einer
 * eigenen Stelle heraus, siehe `TonAusgabe` in der Leiste.
 */
export function KleineKachel({
  stream,
  name,
  stand = STAND_AN,
  spiegeln = false,
  kameraAusText,
  className = "",
}: {
  stream: MediaStream | null;
  name: string;
  stand?: Stand;
  spiegeln?: boolean;
  /** Der Satz, wenn die Kamera aus ist. Beim eigenen Bild lautet er anders. */
  kameraAusText?: string;
  className?: string;
}) {
  return (
    <div data-pruefung="kleine-kachel" className={`relative ${KACHEL_GRUND} ${className}`}>
      {stream ? (
        <>
          <VideoFlaeche stream={stream} stumm spiegeln={spiegeln} einpassen />
          {!stand.bildAn && <KameraAus text={kameraAusText ?? "Kamera ist aus"} klein />}
        </>
      ) : (
        <div className="flex h-full items-center justify-center px-2 text-center">
          <p className="text-[10.5px] leading-tight text-white/60">{`Warte auf ${name}…`}</p>
        </div>
      )}
      {stream && <KachelFuss name={name} tonAn={stand.tonAn} klein />}
    </div>
  );
}
