import { useState } from "react";
import { MessageSquare, Users, X } from "lucide-react";
import type { Gegenstelle, Verbindung } from "@/lib/videoraumVerbindung";
import type { Stand, Staende } from "@/lib/videoraumStaende";
import { ChatFenster, useVideoraumChat } from "./ChatFenster";
import { TeilnehmerListe } from "./TeilnehmerListe";
import { UngeleseneZahl } from "./UngeleseneZahl";
import { mitWerten } from "@/lib/videoraumAnrede";
import { videoraumGastTexte } from "@/lib/videoraumGastTexte";
import type { Sprache } from "@/lib/seitenSprache";

/**
 * Teilnehmer und Chat: die zwei Knoepfe in der Leiste und die Flaeche dazu.
 *
 * Warum beides in EINER Datei und nicht in `Gespraech.tsx`: An der
 * Gespraechsansicht wird gerade an vielen Stellen zugleich gearbeitet. Was
 * neu dazukommt, liegt deshalb hier, und drueben bleiben es drei Zeilen.
 *
 * Warum eine ueberdeckende Flaeche und keine zweite Spalte: Die Spalte gibt es
 * nur beim Gastgeber, der Gast braucht den Chat aber genauso. Eine Flaeche,
 * die sich oeffnen und schliessen laesst, steht auf beiden Seiten gleich und
 * auf dem Telefon genauso wie am Schreibtisch. Am Schreibtisch sitzt sie
 * rechts unten neben dem Bild, auf dem Telefon legt sie sich ueber das Bild
 * und geht mit dem Kreuz oder mit einem zweiten Druck auf den Knopf wieder zu.
 * Dauerhaft verdeckt sie also nichts.
 */

type Reiter = "teilnehmer" | "chat";

/** Ein Knopf in der Leiste, in der Form der uebrigen sechs. */
function LeistenKnopf({
  an,
  kennung,
  label,
  zahl,
  abzeichen,
  onClick,
  children,
}: {
  an: boolean;
  /**
   * Feste Kennung fuer die Pruefzeichen. Frueher stand dort die Beschriftung,
   * die seit der englischen Fassung je Sprache anders lautet.
   */
  kennung: "teilnehmer" | "chat";
  label: string;
  /** Kleine, ruhige Zahl oben rechts, etwa die Zahl der Anwesenden. */
  zahl?: number;
  /** Stattdessen ein eigenes Abzeichen, etwa die roten Ungelesenen. */
  abzeichen?: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  /*
   * Dieselben Masse und Farben wie `Knopf` in `Gespraech.tsx`. Bewusst hier
   * noch einmal und nicht von dort geholt: Ein Import in die andere Richtung
   * machte aus zwei Dateien einen Ring, und die Zahl in der Ecke braucht
   * ohnehin eigenes Geruest.
   */
  const grund = an
    ? "bg-[#30E19E]/15 border-[#30E19E]/35 text-[#30E19E]"
    : "bg-white/[0.07] border-white/10 text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={an}
      className={`relative flex h-[62px] w-16 flex-col items-center justify-center gap-1.5 rounded-2xl border transition-colors hover:brightness-110 ${grund}`}
    >
      {children}
      <span className="text-[8.5px] font-semibold uppercase tracking-[0.05em] opacity-80">{label}</span>
      {zahl != null && zahl > 0 && (
        <span
          data-pruefung={`leiste-zahl-${kennung}`}
          className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-white/15 px-1 text-[10px] font-bold tabular-nums text-white/80"
        >
          {zahl > 99 ? "99+" : zahl}
        </span>
      )}
      {abzeichen}
    </button>
  );
}

export interface NebenfensterStand {
  /** Die zwei Knoepfe fuer die Leiste. */
  knoepfe: React.ReactNode;
  /** Die Flaeche ueber dem Bild. Leer, solange nichts offen ist. */
  flaeche: React.ReactNode;
}

/**
 * Alles zusammensetzen. Gibt fertige Bausteine zurueck, damit die
 * Gespraechsansicht nur noch zwei Stellen einsetzen muss: die Knoepfe in die
 * Leiste und die Flaeche in den Bereich ueber dem Bild.
 */
export function useNebenfenster({
  verbindung,
  gegenstellen,
  staende,
  eigenerStand,
  einladungsLink,
  aufStumm,
  sprache = "de",
}: {
  verbindung: Verbindung | null;
  gegenstellen: Gegenstelle[];
  staende: Staende;
  eigenerStand: Stand;
  /** Nur beim Gastgeber gesetzt, siehe `TeilnehmerListe`. */
  einladungsLink?: string;
  /** Einen Gast stummschalten. Ebenfalls nur beim Gastgeber gesetzt. */
  aufStumm?: (kennung: string) => void;
  /** Sprache der festen Texte, Vorgabe Deutsch. Nur die Gastseite reicht sie herein. */
  sprache?: Sprache;
}): NebenfensterStand {
  const t = videoraumGastTexte(sprache).neben;
  const [teilnehmerOffen, setTeilnehmerOffen] = useState(false);
  const chat = useVideoraumChat(verbindung);
  /*
   * Ob der Chat offen ist, steht nicht hier, sondern im Modul. Damit folgt er
   * dem Nutzer: Wer das Gespraech mit offenem Chat kleiner macht, findet ihn
   * unter der Leiste wieder, und ein Klick im schwebenden Fenster auf dem
   * Schreibtisch klappt ihn an der Stelle auf, die gerade zu sehen ist.
   * Die Teilnehmerliste bleibt oertlich, sie hat diese Aufgabe nicht.
   */
  const reiter: Reiter | null = chat.offen ? "chat" : teilnehmerOffen ? "teilnehmer" : null;

  const wechsle = (ziel: Reiter) => {
    if (ziel === "chat") {
      setTeilnehmerOffen(false);
      chat.setzeOffen(!chat.offen);
      return;
    }
    chat.setzeOffen(false);
    setTeilnehmerOffen((bisher) => !bisher);
  };
  const schliesse = () => { setTeilnehmerOffen(false); chat.setzeOffen(false); };
  const anzahl = gegenstellen.length + 1;

  const knoepfe = (
    <>
      <LeistenKnopf
        an={reiter === "teilnehmer"}
        kennung="teilnehmer"
        label={t.teilnehmer}
        zahl={anzahl}
        onClick={() => wechsle("teilnehmer")}
      >
        <Users aria-hidden className="h-[18px] w-[18px]" />
      </LeistenKnopf>
      <LeistenKnopf
        an={reiter === "chat"}
        kennung="chat"
        label={t.chat}
        abzeichen={reiter === "chat" ? null : <UngeleseneZahl gross zahl={chat.ungelesen} sprache={sprache} />}
        onClick={() => wechsle("chat")}
      >
        <MessageSquare aria-hidden className="h-[18px] w-[18px]" />
      </LeistenKnopf>
    </>
  );

  const flaeche = reiter && (
    /*
      Am Schreibtisch rechts unten, auf dem Telefon ueber die Breite. Die Hoehe
      ist gedeckelt, damit die Flaeche das Bild nie ganz verschluckt, und
      `z-20` legt sie ueber das Video, aber nicht ueber die Leiste: Auflegen
      bleibt erreichbar.
    */
    <div
      data-pruefung="nebenfenster"
      data-reiter={reiter}
      className="absolute bottom-4 left-4 right-4 z-20 flex max-h-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0F1621]/95 p-4 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)] backdrop-blur sm:left-auto sm:w-[340px]"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.14em] text-white/40">
          {reiter === "teilnehmer" ? mitWerten(t.teilnehmerTitel, { zahl: anzahl }) : t.chat}
        </p>
        <button
          type="button"
          onClick={schliesse}
          aria-label={reiter === "teilnehmer" ? t.teilnehmerSchliessen : t.chatSchliessen}
          className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {reiter === "teilnehmer" ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TeilnehmerListe
            gegenstellen={gegenstellen}
            staende={staende}
            eigenerStand={eigenerStand}
            eigenerName={verbindung?.eigenerName}
            einladungsLink={einladungsLink}
            aufStumm={aufStumm}
            sprache={sprache}
          />
        </div>
      ) : (
        /*
          Der Chat bleibt hoch genug, dass Verlauf UND Eingabefeld
          nebeneinander Platz haben. Ohne die Mindesthoehe schrumpfte der
          Verlauf bei leerem Chat auf eine Zeile, und das Fenster sprang bei
          jeder Nachricht in der Hoehe.
        */
        <div className="flex min-h-[260px] flex-1 flex-col">
          <ChatFenster chat={chat} sprache={sprache} />
        </div>
      )}
    </div>
  );

  return { knoepfe, flaeche };
}
