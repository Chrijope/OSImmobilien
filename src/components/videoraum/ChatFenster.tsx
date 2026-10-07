import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SendHorizonal } from "lucide-react";
import type { Verbindung } from "@/lib/videoraumVerbindung";
import {
  CHAT_EMPFANG_FENSTER_MS, CHAT_EMPFANG_GRENZE, CHAT_MAX_ZEICHEN,
  CHAT_SENDE_FENSTER_MS, CHAT_SENDE_GRENZE,
  aendereChat, beobachteChat, chatUhrzeit, darfSenden, imFenster, leseChat, neueBeitragsId,
  fremdeKennungen, gleicheKennungen, nimmBeitragAn, pruefeFremdenBeitrag, richteChatEin,
  saeubereChatName, saeubereChatText, setzeChatOffen, zaehleUngelesen, type ChatBeitrag,
} from "@/lib/videoraumChat";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Der Chat im Videoraum, wie bei Zoom: Alle im Raum schreiben, alle lesen mit.
 *
 * Der Weg ist der vorhandene Signalkanal, siehe `videoraumChat` fuer die
 * Begruendung und die Grenzen. Hier steht nur, was die Ansicht davon braucht.
 */

export interface ChatAnsicht {
  beitraege: ChatBeitrag[];
  entwurf: string;
  setzeEntwurf: (text: string) => void;
  senden: () => void;
  /** Gesetzt, wenn der letzte Sendeversuch an der eigenen Grenze scheiterte. */
  zuSchnell: boolean;
  ungelesen: number;
  alsGelesen: () => void;
  /** Ohne stehende Verbindung laesst sich nichts schicken. */
  gesperrt: boolean;
  /**
   * Ist der Chat aufgeklappt? Der Stand liegt im Modul, siehe `ChatStand.offen`
   * dort: Er soll dem Nutzer folgen, wenn das Gespraech kleiner wird.
   */
  offen: boolean;
  setzeOffen: (offen: boolean) => void;
}

/**
 * Chat an eine Verbindung haengen.
 *
 * Der Verlauf liegt im Modul, nicht in diesem Haken: Die Gespraechsansicht
 * wird beim Kleinermachen abgebaut und spaeter neu aufgebaut, und die
 * Beitraege sollen das ueberstehen.
 */
export function useVideoraumChat(verbindung: Verbindung | null): ChatAnsicht {
  const kennung = verbindung?.eigeneKennung ?? "";
  const lesen = useCallback(() => leseChat(kennung), [kennung]);
  const stand = useSyncExternalStore(beobachteChat, lesen, lesen);
  /*
   * Wann eine Gegenstelle zuletzt geschrieben hat, je Kennung. Ein fremder
   * Browser haelt sich an keine Grenze, deshalb wird hier gezaehlt und alles
   * darueber still verworfen.
   */
  const empfangen = useRef(new Map<string, number[]>());
  const gesendet = useRef<number[]>([]);
  const [zuSchnell, setzeZuSchnell] = useState(false);

  // Neue Verbindung, neuer Verlauf. Gleiche Kennung: alles bleibt stehen.
  useEffect(() => {
    if (!kennung) return;
    richteChatEin(kennung);
  }, [kennung]);

  useEffect(() => {
    if (!verbindung?.beobachteRegie) return;
    return verbindung.beobachteRegie((befehl, von) => {
      if (befehl.art !== "chat") return;

      const jetzt = Date.now();
      const bisher = imFenster(empfangen.current.get(von) ?? [], jetzt, CHAT_EMPFANG_FENSTER_MS);
      if (bisher.length >= CHAT_EMPFANG_GRENZE) {
        empfangen.current.set(von, bisher);
        return;
      }
      empfangen.current.set(von, [...bisher, jetzt]);

      const beitrag = pruefeFremdenBeitrag(befehl, von, jetzt);
      if (!beitrag) return;
      aendereChat(kennung, (s) => {
        const beitraege = nimmBeitragAn(s.beitraege, beitrag);
        return beitraege === s.beitraege ? s : { ...s, beitraege };
      });
    });
  }, [verbindung, kennung]);

  const setzeEntwurf = useCallback((text: string) => {
    setzeZuSchnell(false);
    aendereChat(kennung, (s) => (
      s.entwurf === text ? s : { ...s, entwurf: text.slice(0, CHAT_MAX_ZEICHEN) }
    ));
  }, [kennung]);

  const senden = useCallback(() => {
    if (!verbindung) return;
    const text = saeubereChatText(leseChat(kennung).entwurf);
    if (!text) return;

    const jetzt = Date.now();
    gesendet.current = imFenster(gesendet.current, jetzt, CHAT_SENDE_FENSTER_MS);
    if (!darfSenden(gesendet.current, jetzt, CHAT_SENDE_GRENZE, CHAT_SENDE_FENSTER_MS)) {
      // Der Entwurf bleibt stehen, sonst waere das Getippte weg.
      setzeZuSchnell(true);
      return;
    }
    gesendet.current = [...gesendet.current, jetzt];
    setzeZuSchnell(false);

    const name = saeubereChatName(verbindung.eigenerName, "Ich");
    const id = neueBeitragsId();
    verbindung.sendeRegie({ art: "chat", id, name, text, zeit: jetzt });

    const eigener: ChatBeitrag = {
      id: `${verbindung.eigeneKennung}:${id}`,
      von: "",
      name,
      text,
      zeit: jetzt,
      eigen: true,
    };
    // Der eigene Beitrag zaehlt nie als ungelesen, `gelesen` bleibt unberuehrt.
    aendereChat(kennung, (s) => ({
      ...s,
      entwurf: "",
      beitraege: nimmBeitragAn(s.beitraege, eigener),
    }));
  }, [verbindung, kennung]);

  const alsGelesen = useCallback(() => {
    aendereChat(kennung, (s) => {
      const gelesen = fremdeKennungen(s.beitraege);
      return gleicheKennungen(gelesen, s.gelesen) ? s : { ...s, gelesen };
    });
  }, [kennung]);

  const setzeOffen = useCallback((offen: boolean) => {
    // Beim Aufklappen gleich als gelesen zaehlen, sonst stuende die Zahl noch
    // einen Augenblick am Knopf, waehrend die Beitraege schon dastehen.
    if (offen) alsGelesen();
    setzeChatOffen(kennung, offen);
  }, [kennung, alsGelesen]);

  return {
    beitraege: stand.beitraege,
    entwurf: stand.entwurf,
    setzeEntwurf,
    senden,
    zuSchnell,
    ungelesen: zaehleUngelesen(stand.beitraege, stand.gelesen),
    alsGelesen,
    gesperrt: !verbindung,
    offen: stand.offen,
    setzeOffen,
  };
}

/** Ein Beitrag. Der Text steht als reiner Text da, nie als HTML. */
function Beitrag({ beitrag, du }: { beitrag: ChatBeitrag; du: string }) {
  return (
    <div data-pruefung="chat-beitrag" className={beitrag.eigen ? "flex justify-end" : "flex"}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 ${
          beitrag.eigen
            ? "bg-[#30E19E]/15 text-[#E6F4FF]"
            : "bg-white/[0.07] text-white"
        }`}
      >
        <p className="mb-0.5 flex items-baseline gap-2 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-white/45">
          <span className="min-w-0 truncate">{beitrag.eigen ? du : beitrag.name}</span>
          <span className="shrink-0 tabular-nums font-normal normal-case tracking-normal">
            {chatUhrzeit(beitrag.zeit)}
          </span>
        </p>
        {/*
          `whitespace-pre-wrap` und `break-words`: Zeilenumbrueche bleiben,
          ein langes Wort ohne Leerzeichen sprengt die Spalte nicht. Der Text
          kommt als Kind in den Baum, wird also vom Browser als Text gesetzt.
          `dangerouslySetInnerHTML` hat hier nichts zu suchen: Was ein Gast
          schreibt, ist fremdes Material.
        */}
        <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{beitrag.text}</p>
      </div>
    </div>
  );
}

export function ChatFenster({
  chat,
  sprache = "de",
}: {
  chat: ChatAnsicht;
  /** Sprache der festen Texte, Vorgabe Deutsch. Die Nachrichten bleiben, wie sie geschrieben wurden. */
  sprache?: Sprache;
}) {
  const t = videoraumGastTexte(sprache).chat;
  const ende = useRef<HTMLDivElement | null>(null);
  const zahl = chat.beitraege.length;
  // Stabil aus dem Haken, siehe unten: an `chat` selbst darf der Effekt nicht
  // haengen, das Objekt ist bei jedem Zeichnen neu.
  const { alsGelesen } = chat;

  // Immer beim letzten Beitrag stehen. Ohne das laege der neueste unterhalb
  // des sichtbaren Bereichs, und man haette den Chat offen, ohne ihn zu lesen.
  useEffect(() => {
    const kasten = ende.current?.parentElement;
    if (kasten) kasten.scrollTop = kasten.scrollHeight;
  }, [zahl]);

  /*
   * Was „gelesen" heisst: Der Chat steht auf dem Bildschirm, und zwar in
   * einem sichtbaren Dokument.
   *
   * Dieses Fenster ist genau dann eingehaengt, wenn der Chat wirklich zu sehen
   * ist, im Gespraech oder unter der Leiste. Wer es zuklappt oder das Gespraech
   * kleiner macht, ohne den Chat mitzunehmen, hat ab da nicht mehr gelesen.
   *
   * Die Sichtbarkeit des Dokuments kommt dazu, weil das nicht dasselbe ist:
   * Wer in einem anderen Reiter arbeitet und die Gesichter nur im schwebenden
   * Fenster auf dem Schreibtisch sieht, hat den Chat nicht gelesen, obwohl er
   * aufgeklappt ist. Deshalb wird beim Zurueckkommen nachgeholt.
   *
   * Nur an `zahl` und den festen Funktionen aufgehaengt. Haenge der Effekt am
   * ganzen `chat`, liefe er bei jedem Zeichnen, setzte eine neue Lesezeit,
   * loeste damit das naechste Zeichnen aus und drehte sich im Kreis.
   */
  useEffect(() => {
    const merken = () => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") alsGelesen();
    };
    merken();
    document.addEventListener("visibilitychange", merken);
    return () => document.removeEventListener("visibilitychange", merken);
  }, [zahl, alsGelesen]);

  const rest = CHAT_MAX_ZEICHEN - chat.entwurf.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div
        data-pruefung="chat-verlauf"
        className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto pr-0.5"
      >
        {zahl === 0 ? (
          <p className="py-2 text-[12px] leading-relaxed text-white/45">
            {t.leer}
          </p>
        ) : (
          chat.beitraege.map((b) => <Beitrag key={b.id} beitrag={b} du={t.du} />)
        )}
        <div ref={ende} />
      </div>

      {chat.zuSchnell && (
        <p data-pruefung="chat-zu-schnell" className="text-[11.5px] leading-relaxed text-[#FFB4AE]">
          {t.zuSchnell}
        </p>
      )}

      <div className="flex shrink-0 items-end gap-2">
        <textarea
          data-pruefung="chat-eingabe"
          value={chat.entwurf}
          disabled={chat.gesperrt}
          maxLength={CHAT_MAX_ZEICHEN}
          rows={2}
          aria-label={t.eingabeLabel}
          placeholder={t.platzhalter}
          onChange={(e) => chat.setzeEntwurf(e.target.value)}
          onKeyDown={(e) => {
            // Enter schickt, Umschalt und Enter macht eine neue Zeile.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              chat.senden();
            }
          }}
          className="min-h-[44px] w-full flex-1 resize-none rounded-xl border border-white/10 bg-white/[0.04] p-2.5 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-[#30E19E]/50 disabled:opacity-40"
        />
        <button
          type="button"
          data-pruefung="chat-senden"
          onClick={chat.senden}
          disabled={chat.gesperrt || !chat.entwurf.trim()}
          aria-label={t.senden}
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-[#15724F] text-white transition-colors enabled:hover:brightness-110 disabled:opacity-40"
        >
          <SendHorizonal aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* Erst kurz vor der Grenze, sonst ist es nur Rauschen. */}
      {rest <= 100 && (
        <p className="shrink-0 text-right text-[11px] tabular-nums text-white/40">
          {mitWerten(t.rest, { zahl: rest })}
        </p>
      )}
    </div>
  );
}
