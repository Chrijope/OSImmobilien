import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Maximize2, MessageSquare, Mic, MicOff, PhoneOff, Video as VideoIcon, VideoOff,
} from "lucide-react";
import { useVideoraum } from "@/contexts/VideoraumContext";
import { KleineKachel } from "./Kachel";
import { EigeneKleineKachel } from "./EigeneKleineKachel";
import { useVideoraumChat } from "./ChatFenster";
import { UngeleseneZahl } from "./UngeleseneZahl";

/**
 * Der Inhalt des schwebenden Fensters auf dem Schreibtisch.
 *
 * Christian am 18.09.2026: „dass dann die beiden Kacheln der Videouebertragung
 * der Personen dann auf meinen Desktop gezogen werden, wie es ja auch bei Zoom
 * der Fall ist." Genau das passiert hier: Sobald er teilt oder das Gespraech
 * kleiner macht, stehen die Gesichter in einem eigenen kleinen Fenster ueber
 * allen Anwendungen, samt Mikrofon, Kamera, Auflegen und einem Weg zurueck.
 *
 * Die Komponente haengt neben der Leiste im App-Baum, also oberhalb der Routen.
 * Nur so ueberlebt das Fenster einen Seitenwechsel im CRM, und genau dafuer ist
 * es da. Gezeichnet wird ueber ein Portal in den Koerper des anderen
 * Dokuments; die Videoelemente entstehen damit dort und bekommen dieselben
 * `MediaStream`-Objekte zugewiesen. Ein Element aus dieser Seite dorthin zu
 * verschieben waere der naheliegende, aber falsche Weg: Es verliert dabei unter
 * Umstaenden seinen Strom und stuende dann als Standbild.
 *
 * Die Stilvorlage liegt nicht im neuen Dokument, sie wird beim Oeffnen
 * hineinkopiert, siehe `schwebendesFenster`. Ohne das wirkte hier keine
 * einzige Klasse.
 */

export function SchwebendeKacheln() {
  const {
    aktiv, schwebeFenster, gegenstellen, staende, tonAn, bildAn,
    wechsleTon, wechsleBild, beende, oeffne, verbindung,
  } = useVideoraum();
  const navigate = useNavigate();
  const location = useLocation();
  /*
   * Nur mitzaehlen, nicht mitschreiben.
   *
   * Dieses Fenster ist ein paar hundert Pixel gross und hat genau eine
   * Aufgabe: die Gesichter ueber allen anderen Anwendungen zu halten. Ein
   * zweiter Chat darin waere dieselbe Sache ein zweites Mal gebaut, in einem
   * fremden Dokument mit eigener Stilvorlage und eigenen Tuecken bei Tastatur
   * und Eingabefeld, und er nähme den Gesichtern den Platz weg. Ausserdem
   * kann ihn nur Chrome, die Leiste dagegen steht in jedem Browser.
   *
   * Deshalb hier die Zahl und ein Weg hinein, und der Chat selbst dort, wo
   * gerade Platz ist.
   */
  const chat = useVideoraumChat(verbindung);

  if (!schwebeFenster || !aktiv) return null;

  const zurueckInsVollbild = () => {
    oeffne();
    if (location.pathname !== `/videocall/raum/${aktiv.raumId}`) {
      navigate(`/videocall/raum/${aktiv.raumId}`);
    }
    // Das Hauptfenster nach vorn holen. Ein Klick im schwebenden Fenster ist
    // die dafuer noetige Geste. Wo der Browser es nicht zulaesst, bleibt es
    // beim blossen Wechsel der Seite.
    try {
      window.focus();
    } catch {
      /* nicht der Rede wert */
    }
  };

  /**
   * Den Chat aufklappen und das Hauptfenster nach vorn holen.
   *
   * Bewusst OHNE Seitenwechsel, anders als „Zurück": Wer kleiner gemacht hat,
   * sucht im CRM gerade etwas fuer den Kunden. Ihn dafuer aus seiner Seite zu
   * werfen, nur damit er zwei Saetze liest, waere der schlechtere Tausch. Der
   * Chat geht an der Stelle auf, die im Hauptfenster gerade zu sehen ist,
   * unter der Leiste oder im Gespraech. Welche das ist, muss dieses Fenster
   * nicht wissen, siehe `ChatStand.offen` in `videoraumChat`.
   */
  const oeffneChatImHauptfenster = () => {
    chat.setzeOffen(true);
    try {
      window.focus();
    } catch {
      /* nicht der Rede wert */
    }
  };

  const kachelZahl = gegenstellen.length + 1;

  return createPortal(
    <div className="flex h-full w-full flex-col bg-[#0B1119] text-white">
      <div
        data-pruefung="schwebende-kacheln"
        className={`grid min-h-0 flex-1 auto-rows-fr gap-1.5 p-1.5 ${kachelZahl > 1 ? "grid-cols-2" : "grid-cols-1"}`}
      >
        {gegenstellen.map((g) => (
          <KleineKachel
            key={g.kennung}
            stream={g.stream}
            name={g.name}
            stand={staende[g.kennung]}
            className="min-h-0"
          />
        ))}
        <EigeneKleineKachel className="min-h-0" />
      </div>

      <div className="flex shrink-0 items-center justify-center gap-1.5 border-t border-white/10 bg-[#0F1621] px-2 py-1.5">
        <button
          type="button"
          onClick={wechsleTon}
          aria-label={tonAn ? "Mikrofon ausschalten" : "Mikrofon einschalten"}
          aria-pressed={tonAn}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${tonAn ? "bg-white/10 hover:bg-white/15" : "bg-[#E5372B]"}`}
        >
          {tonAn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={wechsleBild}
          aria-label={bildAn ? "Kamera ausschalten" : "Kamera einschalten"}
          aria-pressed={bildAn}
          className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${bildAn ? "bg-white/10 hover:bg-white/15" : "bg-[#E5372B]"}`}
        >
          {bildAn ? <VideoIcon className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </button>

        {/*
          Der Chat. Die Zahl liegt absolut ueber dem Knopf, die Knopfreihe
          bleibt damit genauso hoch wie bisher und nimmt den Gesichtern keinen
          Platz weg.
        */}
        <button
          type="button"
          data-pruefung="schwebend-chat-knopf"
          onClick={oeffneChatImHauptfenster}
          aria-label="Chat öffnen"
          className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 transition-colors hover:bg-white/15"
        >
          <MessageSquare className="h-4 w-4" />
          <UngeleseneZahl zahl={chat.ungelesen} />
        </button>

        <button
          type="button"
          onClick={zurueckInsVollbild}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-[#15724F] px-2.5 text-[11px] font-semibold transition-colors hover:brightness-110"
        >
          <Maximize2 className="h-4 w-4" />
          <span>Zurück</span>
        </button>

        <button
          type="button"
          onClick={() => void beende()}
          aria-label="Auflegen"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E5372B] transition-colors hover:brightness-110"
        >
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    </div>,
    schwebeFenster.document.body,
  );
}
