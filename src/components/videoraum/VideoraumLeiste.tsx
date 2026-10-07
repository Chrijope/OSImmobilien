import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, Maximize2, PhoneOff, Loader2,
  ChevronDown, ChevronUp, MessageSquare, PictureInPicture2, X,
} from "lucide-react";
import { useVideoraum } from "@/contexts/VideoraumContext";
import { ladeVideocallProfil, speichereVideocallProfil } from "@/lib/videocallEinstellungen";
import { setzeAusgabeGeraet } from "@/lib/videocallGeraete";
import { KleineKachel } from "./Kachel";
import { EigeneKleineKachel } from "./EigeneKleineKachel";
import { ChatFenster, useVideoraumChat } from "./ChatFenster";
import { UngeleseneZahl } from "./UngeleseneZahl";

/**
 * Die Leiste, die oben stehen bleibt, solange ein Gespraech minimiert laeuft.
 *
 * Sie ist der Anker: Waehrend der Partner im CRM sucht, was er dem Kunden
 * zeigen will, sieht er hier, dass das Gespraech noch laeuft, wie lange schon,
 * und kommt mit einem Klick zurueck ins Vollbild.
 *
 * Sie schiebt den Seiteninhalt nach unten, statt ihn zu ueberdecken. Sonst
 * verschwindet auf jeder Seite die oberste Zeile hinter der Leiste.
 *
 * Seit dem 18.09.2026 kann sie die Videos der anderen mitzeigen, aufklappbar.
 * Christian: „mach bitte folgendes dass du mir oben in dem banner der dann
 * erscheint auch die videos der personen in klein anzeigst die ich aber ein-
 * und ausklappen kann." Eingeklappt bleibt sie so flach wie bisher, denn wer
 * minimiert, will Platz. Aufgeklappt wird sie hoeher und schiebt entsprechend
 * weiter, sie ueberdeckt auch dann nichts.
 *
 * Wo der Browser das schwebende Fenster auf dem Schreibtisch kann, ist das der
 * bessere Ort fuer die Gesichter, siehe `SchwebendeKacheln`. Die Leiste bleibt
 * fuer Safari und Firefox und fuer den Fall, dass der Nutzer das Fenster
 * zugemacht hat.
 */

/*
 * Die Hoehen an einer Stelle.
 *
 * Der Platzhalter muss genau so hoch sein wie die Leiste, sonst verschwindet
 * auf jeder Seite die oberste Zeile darunter. Deshalb wird er aus denselben
 * beiden Klassen gebaut und nicht aus einer ausgerechneten Summe: Eine Summe
 * waere schon heute falsch. Die Wurzelschrift steht in `index.css` auf 90
 * Prozent, `h-11` sind damit rund 40 Pixel und nicht 44.
 *
 * Auf dem Telefon ist die Videoreihe niedriger, dort ist die Hoehe knapp.
 */
const LEISTE_HOEHE = "h-11";
const VIDEO_HOEHE = "h-[72px] sm:h-[96px]";

/**
 * Die Stimme der Gegenstelle, ohne Bild.
 *
 * Sie haengt an der Leiste und nicht an den Kacheln, und das ist der Punkt:
 * Die Kacheln lassen sich einklappen, das Fenster auf dem Schreibtisch laesst
 * sich zumachen. Der Ton darf davon nicht abhaengen. Gespielt wird der fremde
 * Strom genau an einer Stelle: im Gespraech von der Kachel, und sobald das
 * Gespraech nicht mehr auf dem Bildschirm steht, hier. Deshalb sind die
 * Kacheln in der Leiste und im schwebenden Fenster stummgeschaltet, sonst
 * liefe dieselbe Stimme doppelt.
 */
function TonAusgabe({ stream, sinkId }: { stream: MediaStream | null; sinkId?: string | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => { /* der naechste Klick loest es */ });
  }, [stream]);

  useEffect(() => {
    const el = ref.current;
    if (!el || sinkId === undefined) return;
    void setzeAusgabeGeraet(el, sinkId);
  }, [sinkId, stream]);

  return <audio ref={ref} autoPlay />;
}

function dauerText(startMs: number, jetztMs: number): string {
  const sekunden = Math.max(0, Math.floor((jetztMs - startMs) / 1000));
  const min = Math.floor(sekunden / 60);
  const sek = sekunden % 60;
  if (min < 60) return `${min}:${String(sek).padStart(2, "0")}`;
  const std = Math.floor(min / 60);
  return `${std}:${String(min % 60).padStart(2, "0")}:${String(sek).padStart(2, "0")}`;
}

export function VideoraumLeiste() {
  const {
    aktiv, minimiert, zustand, gegenstellen, staende, tonAn, bildAn, lautsprecherId,
    schwebenMoeglich, schwebeFenster, oeffneSchwebend, verbindung,
    oeffne, beende, wechsleTon, wechsleBild,
  } = useVideoraum();
  const navigate = useNavigate();
  const location = useLocation();
  const [jetzt, setJetzt] = useState(() => Date.now());
  const [videosOffen, setVideosOffen] = useState(false);
  /*
   * Der Chat, derselbe wie im Gespraech.
   *
   * Der Haken steht oberhalb der Abbruchbedingung weiter unten, und zwar
   * absichtlich: Die Leiste haengt immer im Baum, gibt aber meistens nichts
   * zurueck. So hoert sie die Beitraege auch dann mit, wenn sie selbst gar
   * nicht zu sehen ist, und der Verlauf ist vollstaendig, sobald jemand
   * hinsieht. Doppelt gezaehlt wird nichts: Beitraege tragen eine Kennung, und
   * `nimmBeitragAn` verwirft Doppel.
   */
  const chat = useVideoraumChat(verbindung);

  /*
   * Sichtbar, sobald das Gespraech nicht mehr auf dem Bildschirm steht. Das
   * ist nicht nur nach dem Minimieren der Fall: Wer im Gespraech den Zurueck-
   * knopf drueckt oder einen anderen Raum oeffnet, verliert das Vollbild,
   * ohne dass das Gespraech endet. Ohne die Leiste liefe es dann unsichtbar
   * weiter, mit laufender Kamera und ohne Weg zurueck.
   */
  const eigeneSeite = aktiv ? `/videocall/raum/${aktiv.raumId}` : "";
  const sichtbar = Boolean(aktiv) && (minimiert || location.pathname !== eigeneSeite);

  useEffect(() => {
    if (!sichtbar) return;
    const takt = window.setInterval(() => setJetzt(Date.now()), 1000);
    return () => window.clearInterval(takt);
  }, [sichtbar]);

  /*
   * Die gemerkte Wahl, erst wenn die Leiste gebraucht wird.
   *
   * Nicht beim Einhaengen: Die Leiste haengt von Anfang an im Baum und gibt
   * meistens nichts zurueck. Zu diesem Zeitpunkt sind die Einstellungen aus
   * der Datenbank oft noch gar nicht im Zwischenspeicher, gelesen wuerde dann
   * die Vorgabe. Beim Start eines Gespraechs sind sie da, siehe
   * `ladeVideocallProfilSicher` im Zusammenhang.
   */
  useEffect(() => {
    if (!sichtbar) return;
    setVideosOffen(ladeVideocallProfil().leisteVideosOffen);
  }, [sichtbar]);

  if (!sichtbar || !aktiv) return null;

  const zurueckInsVollbild = () => {
    oeffne();
    if (location.pathname !== `/videocall/raum/${aktiv.raumId}`) {
      navigate(`/videocall/raum/${aktiv.raumId}`);
    }
  };

  const wechsleVideos = () => {
    const neu = !videosOffen;
    setVideosOffen(neu);
    void speichereVideocallProfil({ leisteVideosOffen: neu });
  };

  const verbunden = zustand === "verbunden";

  /*
   * Bei mehreren Gegenstellen: der erste Name plus die Zahl der weiteren,
   * etwa "Martina Brandl +2". Alle Namen passen nicht in die Leiste. Solange
   * die Verbindungsschicht noch niemanden gemeldet hat, bleibt der Name aus
   * dem Gespraechsstart stehen.
   */
  const anwesend = gegenstellen ?? [];
  const anzeigeName = anwesend[0]?.name || aktiv.gegenName;
  const weitere = anwesend.length > 1 ? ` +${anwesend.length - 1}` : "";

  /*
   * Die Videoreihe gibt es nur, solange KEIN schwebendes Fenster offen ist.
   *
   * Christian am 18.09.2026: „nehmen aus dieser Ansicht die Möglichkeit
   * heraus, auf Videos zu klicken. denn wenn ich es verkleiner öffnet sich ja
   * automatisch an meinem bildschirm wie in zoom der einblender". Das stimmt,
   * und zwei Wege zum selben Ziel sind einer zu viel.
   *
   * Ersatzlos streichen darf man den Knopf trotzdem nicht: Das schwebende
   * Fenster gibt es nur in Chrome und Edge, `documentPictureInPicture` fehlt
   * in Safari und Firefox. Auf dem Mac und auf dem iPhone ist Safari der
   * Normalfall, und dort saehe der Partner nach dem Kleinermachen sonst
   * ueberhaupt kein Bild mehr.
   *
   * Es haengt deshalb nicht am Browser, sondern am Fenster selbst: Steht es,
   * uebernimmt es die Gesichter. Steht es nicht, weil der Browser es nicht
   * kann ODER weil der Nutzer es von Hand zugemacht hat, bleibt die Reihe.
   * Die gemerkte Wahl bleibt dabei unangetastet, sie kommt beim Schliessen des
   * Fensters genauso wieder, wie sie war.
   */
  const videoreiheMoeglich = !schwebeFenster;
  const videoreiheOffen = videosOffen && videoreiheMoeglich;

  return (
    <>
      {/*
        Der Ton der anderen, unabhaengig von allem Sichtbaren. Solange das
        Gespraech nicht auf dem Bildschirm steht, gibt es sonst keine Stelle,
        die den fremden Strom abspielt.
      */}
      {anwesend.map((g) => (
        <TonAusgabe key={g.kennung} stream={g.stream} sinkId={lautsprecherId} />
      ))}

      {/* Platzhalter, damit die Leiste nichts verdeckt. Gleich gebaut wie sie. */}
      <div aria-hidden data-pruefung="leisten-platzhalter" className="shrink-0">
        <div className={LEISTE_HOEHE} />
        {videoreiheOffen && <div className={VIDEO_HOEHE} />}
      </div>

      <div
        role="region"
        aria-label="Laufendes Videogespräch"
        className="fixed inset-x-0 top-0 z-[100] border-b border-white/10 bg-[#0F1621] text-white"
      >
        <div
          data-pruefung="leisten-zeile"
          className={`flex ${LEISTE_HOEHE} items-center gap-3 px-3 sm:px-4`}
        >
          <span className="flex items-center gap-2 text-xs font-medium">
            {verbunden ? (
              <span aria-hidden className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#34C759]" />
            ) : (
              <Loader2 aria-hidden className="h-3 w-3 shrink-0 animate-spin text-white/50" />
            )}
            <span className="hidden sm:inline">{verbunden ? "Gespräch läuft" : "Verbindet…"}</span>
          </span>

          <span className="min-w-0 truncate text-xs text-white/70">
            <span className="font-semibold text-white">{`${anzeigeName}${weitere}`}</span>
            <span className="hidden md:inline"> · {aktiv.titel}</span>
          </span>

          <span className="ml-auto shrink-0 text-xs tabular-nums text-white/70">
            {dauerText(aktiv.startZeit, jetzt)}
          </span>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Nur ohne schwebendes Fenster, siehe `videoreiheMoeglich`. */}
            {videoreiheMoeglich && (
              <button
                type="button"
                data-pruefung="leisten-videos-knopf"
                onClick={wechsleVideos}
                aria-label={videoreiheOffen ? "Videos ausblenden" : "Videos einblenden"}
                aria-expanded={videoreiheOffen}
                className="flex h-7 items-center gap-1 rounded-lg bg-white/10 px-2 transition-colors hover:bg-white/15"
              >
                {videoreiheOffen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                <span className="hidden text-[11px] font-semibold md:inline">Videos</span>
              </button>
            )}

            {/*
              Der Chat. Derselbe Knopf wie im Gespraech, nur in der Groesse der
              Leiste: `h-7` wie ihre Nachbarn, die Zeile bleibt also `h-11` und
              schiebt keinen Seiteninhalt weiter nach unten. Die Zahl liegt
              absolut darueber und zaehlt fuer die Hoehe nicht mit.

              Gelesen wird hier und nicht erst im Vollbild. Ein Zaehler allein
              zwaenge zum Zurueckwechseln, und dabei geht die Seite verloren,
              auf der der Partner gerade etwas fuer den Kunden sucht. Genau
              deswegen ist er ja kleiner gegangen.
            */}
            <button
              type="button"
              data-pruefung="leisten-chat-knopf"
              onClick={() => chat.setzeOffen(!chat.offen)}
              aria-label={chat.offen ? "Chat schließen" : "Chat öffnen"}
              aria-expanded={chat.offen}
              className={`relative flex h-7 items-center gap-1 rounded-lg px-2 transition-colors ${
                chat.offen ? "bg-[#30E19E]/20 text-[#AEF3D9]" : "bg-white/10 hover:bg-white/15"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden text-[11px] font-semibold md:inline">Chat</span>
              {!chat.offen && <UngeleseneZahl zahl={chat.ungelesen} />}
            </button>

            {/*
              Zurueck in das schwebende Fenster. Nur wo der Browser es kann und
              nur solange keines offen ist: Der Nutzer kann es jederzeit selbst
              zumachen, und ohne diesen Knopf fuehrte der Weg zurueck nur ueber
              Vollbild und wieder Kleiner.
            */}
            {schwebenMoeglich && !schwebeFenster && (
              <button
                type="button"
                onClick={() => void oeffneSchwebend()}
                aria-label="Videos als schwebendes Fenster"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/15"
              >
                <PictureInPicture2 className="h-3.5 w-3.5" />
              </button>
            )}

            <button
              type="button"
              onClick={wechsleTon}
              aria-label={tonAn ? "Mikrofon ausschalten" : "Mikrofon einschalten"}
              aria-pressed={tonAn}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${tonAn ? "bg-white/10 hover:bg-white/15" : "bg-[#E5372B]"}`}
            >
              {tonAn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={wechsleBild}
              aria-label={bildAn ? "Kamera ausschalten" : "Kamera einschalten"}
              aria-pressed={bildAn}
              className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${bildAn ? "bg-white/10 hover:bg-white/15" : "bg-[#E5372B]"}`}
            >
              {bildAn ? <VideoIcon className="h-3.5 w-3.5" /> : <VideoOff className="h-3.5 w-3.5" />}
            </button>

            <button
              type="button"
              onClick={zurueckInsVollbild}
              className="flex h-7 items-center gap-1.5 rounded-lg bg-[#15724F] px-2.5 text-[11px] font-semibold transition-colors hover:brightness-110"
            >
              <Maximize2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Vollbild</span>
            </button>

            <button
              type="button"
              onClick={() => void beende()}
              aria-label="Auflegen"
              className="flex h-7 items-center gap-1.5 rounded-lg bg-[#E5372B] px-2.5 text-[11px] font-semibold transition-colors hover:brightness-110"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Auflegen</span>
            </button>
          </div>
        </div>

        {/*
          Die Videoreihe. Jede Kachel im Format 4 zu 3 und so hoch wie die
          Reihe, die Breite ergibt sich daraus. Das `object-contain` in der
          Videoflaeche sorgt dafuer, dass auch ein hochkantes Bild vom Telefon
          vollstaendig zu sehen ist, statt beschnitten zu werden.
        */}
        {videoreiheOffen && (
          <div
            data-pruefung="leisten-videos"
            className={`flex ${VIDEO_HOEHE} items-stretch gap-1.5 px-3 pb-1.5 sm:px-4`}
          >
            {anwesend.length === 0 ? (
              <KleineKachel
                stream={null}
                name={aktiv.gegenName}
                className="aspect-[4/3] h-full shrink-0"
              />
            ) : (
              anwesend.map((g) => (
                <KleineKachel
                  key={g.kennung}
                  stream={g.stream}
                  name={g.name}
                  stand={staende[g.kennung]}
                  className="aspect-[4/3] h-full shrink-0"
                />
              ))
            )}
            {/*
              Das eigene Bild, zuletzt und in derselben Reihenfolge wie im
              schwebenden Fenster: erst die anderen, dann man selbst.

              Es fehlte hier, und zwar aus demselben Grund, aus dem es anfangs
              auch im schwebenden Fenster fehlte: Die Reihe lief ueber
              `gegenstellen`, und darin steht man selbst nicht. Christian am
              18.09.2026: „da muss doch auch mein video angezeigt werden, also
              das vom Gastgeber." In Safari wiegt das schwer, dort ist diese
              Reihe der einzige Weg. Alle vier Regeln dazu stehen in
              `EigeneKleineKachel`, damit die beiden Orte nicht auseinander
              laufen koennen.
            */}
            <EigeneKleineKachel className="aspect-[4/3] h-full shrink-0" />
          </div>
        )}

        {/*
          Der Chat haengt unter der Leiste und liegt ueber der Seite.

          `absolute top-full` statt eines Kastens im Fluss: Ein Kind im Fluss
          machte die Leiste hoeher, `LeistenBereich` maesse die groessere Hoehe,
          und der ganze Seiteninhalt samt Seitenleiste rutschte um die Hoehe des
          Chats nach unten. Die Leiste selbst bleibt damit genau `h-11`, plus
          der Videoreihe, wenn sie aufgeklappt ist. `top-full` haengt ihn
          darunter, egal welcher der beiden Faelle gerade gilt.

          Auf dem Telefon ueber die Breite, am Schreibtisch rechts und schmal.
          Die Hoehe ist gedeckelt, sonst deckte er auf einem flachen Fenster
          die ganze Seite zu.
        */}
        {chat.offen && (
          <div
            data-pruefung="leisten-chat"
            className="absolute left-2 right-2 top-full flex max-h-[min(60vh,420px)] flex-col overflow-hidden rounded-b-2xl border border-t-0 border-white/10 bg-[#0F1621]/95 p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] backdrop-blur sm:left-auto sm:w-[360px]"
          >
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
                Chat
              </p>
              <button
                type="button"
                onClick={() => chat.setzeOffen(false)}
                aria-label="Chat schließen"
                className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-[220px] flex-1 flex-col">
              <ChatFenster chat={chat} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
