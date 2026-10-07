/**
 * Die Schnellaktionen des Kundenprofils als runde, farbige Symbole.
 *
 * Christian hat am 16.09.2026 entschieden, den Kopfbereich zu entlasten: Die
 * Knopfleiste stand quer unter dem Seitentitel und wiederholte dort dieselben
 * drei Vorgaenge, die man in der linken Spalte beim Kunden sucht. Seitdem
 * stehen sie hier, unter dem Namen und der Ampel, oberhalb der Kontaktdaten.
 *
 * Aufbau je Aktion: ein runder, farbiger Kreis mit dem Sinnbild und darunter
 * ein kurzes Wort. Die Farbe ist nie der einzige Traeger der Aussage, das Wort
 * steht immer daneben und das `aria-label` nennt die Aktion als ganzen Satz.
 *
 * Sechs Vorgaenge in zwei Zeilen zu drei, Reihenfolge von Christian am
 * 16.09.2026 vorgegeben: oben Notiz, Anruf, E-Mail, unten Aufgabe, Anruf
 * notieren, Meeting.
 *
 * Farbwahl, alle aus dem Farbvorrat des Projekts:
 * - Notiz traegt das Projektblau (`--primary`), im gedaempften Muster des
 *   Knopfes `tinted` aus `components/ui/button.tsx`.
 * - Anruf traegt Gruen. Bewusst `emerald` statt des Tokens `--success`: Der
 *   Token erreicht auf hellem Grund nur 2,33 zu 1 und faellt damit unter die
 *   geforderten 3 zu 1 fuer ein bedeutungstragendes Symbol. Dasselbe Paar
 *   tragen der Erfolgsknopf und der Mailvermerk, siehe
 *   `components/bewerbung/KennenlernMailVermerk.tsx`.
 */
import * as React from "react";
import { CalendarDays, CheckSquare, Mail, Phone, PhoneCall, Plus, StickyNote } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { AktivitaetEntry } from "@/lib/aktivitaetenStore";

export type SchnellaktionArt = AktivitaetEntry["art"];

export interface Schnellaktion {
  art: SchnellaktionArt;
  label: string;
  icon: React.ReactNode;
  emoji: string;
}

/**
 * Alle Vorgaenge, die sich am Kunden anlegen lassen. Beschriftung und Sinnbild
 * kommen von hier, damit Menueeintrag und Symbol nicht auseinanderlaufen.
 */
/*
 * `meeting_protokoll` steht hier seit dem 16.09.2026 NICHT mehr.
 *
 * Christian braucht den Knopf nicht, und das traegt: Laeuft ein Meeting ueber
 * den Videoraum, legt `speichereMitschrift` die Aktivitaet dieser Art von
 * selbst an, samt Kurzfassung des Gespraechs. Von Hand gebraucht wurde der
 * Knopf nur fuer ein persoenliches Treffen ausserhalb des Videoraums.
 *
 * Die Art selbst bleibt im System (`aktivitaetenStore`), sonst faenden die
 * automatischen Eintraege keinen Platz mehr und die Kachel "Letzter Kontakt"
 * verloere ihre dritte Quelle.
 */
export const QUICK_ACTIONS: Schnellaktion[] = [
  { art: "notiz", label: "Notiz erstellen", icon: <StickyNote className="h-4 w-4" />, emoji: "📝" },
  { art: "anruf", label: "Anruf tätigen", icon: <Phone className="h-4 w-4" />, emoji: "📞" },
  { art: "email", label: "E-Mail schreiben", icon: <Mail className="h-4 w-4" />, emoji: "✉️" },
  { art: "aufgabe", label: "Aufgabe erstellen", icon: <CheckSquare className="h-4 w-4" />, emoji: "☑️" },
  { art: "meeting", label: "Meeting erstellen", icon: <CalendarDays className="h-4 w-4" />, emoji: "📅" },
  { art: "anruf_protokoll", label: "Anruf protokollieren", icon: <PhoneCall className="h-4 w-4" />, emoji: "📋" },
];

/**
 * Diese Vorgaenge stehen als eigenes Symbol neben der Hauptaktion, weil sie am
 * haeufigsten gebraucht werden. Im Menue tauchen sie deshalb nicht noch einmal
 * auf: Derselbe Eintrag an zwei Stellen laesst den Nutzer ueberlegen, ob die
 * beiden womoeglich Verschiedenes tun.
 */
export const SCHNELLZUGRIFF: SchnellaktionArt[] = [
  // Erste Zeile: was man am haeufigsten tut.
  "notiz", "anruf", "email",
  // Zweite Zeile, Reihenfolge von Christian am 16.09.2026 vorgegeben.
  "aufgabe", "anruf_protokoll", "meeting",
];

/** Was im Menue hinter der Hauptaktion steht: alles ausser dem Schnellzugriff. */
export const MENUE_AKTIONEN: Schnellaktion[] = QUICK_ACTIONS.filter(
  (a) => !SCHNELLZUGRIFF.includes(a.art),
);

/**
 * Darstellung der beiden Schnellzugriffe: das kurze Wort unter dem Kreis, der
 * ganze Satz fuer das Vorleseprogramm und die Farbe des Kreises.
 */
const SCHNELL_DARSTELLUNG: Partial<Record<SchnellaktionArt, { wort: string; satz: string; farbe: string }>> = {
  notiz: {
    wort: "Notiz",
    satz: "Notiz zu diesem Kunden erstellen",
    farbe: "bg-primary/15 text-primary",
  },
  anruf: {
    wort: "Anruf",
    // Seit dem 26.09.2026 waehlt der Klick sofort und oeffnet dazu das
    // Anruf-Protokoll, siehe `rufeAnUndProtokolliere` in KundenDetail.
    satz: "Diesen Kunden anrufen und den Anruf gleich notieren",
    farbe: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  /*
   * E-Mail kam am 16.09.2026 dazu, auf Christians Zuruf. Sie wird so oft
   * gebraucht wie Notiz und Anruf, stand aber nur im Menue.
   *
   * Violett, weil Blau, Gruen und das Marken-Orange schon vergeben sind und
   * die vier Symbole nebeneinander auf einen Blick auseinandergehen sollen.
   * Wie beim Gruen der dunklere Ton fuer hellen Grund und der hellere fuer
   * den Dunkelmodus, sonst reicht der Kontrast nicht fuer ein Symbol, das
   * eine Bedeutung traegt.
   */
  email: {
    wort: "E-Mail",
    satz: "E-Mail an diesen Kunden schreiben",
    farbe: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  },
  /*
   * Die uebrigen vier kamen am 16.09.2026 dazu: Christian wollte alle
   * Vorgaenge unmittelbar sehen statt hinter einem Menue.
   *
   * Die Farben sind so gewaehlt, dass Zusammengehoeriges zusammen aussieht.
   * Planen ist blau bis violett (Notiz, E-Mail, Aufgabe, Meeting), Anrufen
   * gruen, und die beiden Protokolle tragen denselben gedaempften Ton: Sie
   * halten fest, was schon geschehen ist, und sollen nicht so laut rufen wie
   * das, was noch zu tun ist.
   */
  aufgabe: {
    wort: "Aufgabe",
    satz: "Aufgabe zu diesem Kunden erstellen",
    farbe: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  },
  meeting: {
    wort: "Meeting",
    satz: "Meeting mit diesem Kunden erstellen",
    farbe: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400",
  },
  anruf_protokoll: {
    wort: "Anruf notieren",
    satz: "Einen gefuehrten Anruf nachtraeglich protokollieren",
    farbe: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  },
};

interface SymbolknopfProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Farbklassen des Kreises. */
  farbe: string;
  /** Das Sinnbild im Kreis. */
  icon: React.ReactNode;
  /** Das kurze Wort unter dem Kreis. */
  wort: string;
  /** Der ganze Satz fuer das Vorleseprogramm. */
  satz: string;
}

/**
 * Ein rundes Symbol mit dem Wort darunter.
 *
 * Mit `forwardRef`, weil das Ausklappmenue seinen Ausloeser selbst ansteuert
 * (`DropdownMenuTrigger asChild`).
 */
const Symbolknopf = React.forwardRef<HTMLButtonElement, SymbolknopfProps>(
  ({ farbe, icon, wort, satz, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={satz}
      className={cn(
        "group flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-lg py-1",
        "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 [&_svg]:h-[18px] [&_svg]:w-[18px]",
          farbe,
        )}
      >
        {icon}
      </span>
      <span className="text-[10px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
        {wort}
      </span>
    </button>
  ),
);
Symbolknopf.displayName = "Symbolknopf";

interface Props {
  /**
   * Fuehrt eine Schnellaktion aus. Dieselbe Funktion, die vorher die
   * Knopfleiste im Seitenkopf gerufen hat, samt aller Nebenwirkungen.
   */
  onAktion: (art: SchnellaktionArt) => void;
  /** Die Eintraege des Ausklappmenues hinter der Hauptaktion. */
  menueAktionen?: Schnellaktion[];
}

export function KundenprofilAktionsleiste({ onAktion, menueAktionen = MENUE_AKTIONEN }: Props) {
  return (
    /*
     * Drei Symbole je Zeile, in einem festen Raster.
     *
     * Vorher liefen sie als Flusszeile mit Umbruch. Das ergab je nach
     * Spaltenbreite mal vier oben und zwei unten, mal anders; die Leiste sah
     * bei jedem Nutzer ein wenig anders aus. Christian hat am 16.09.2026 zwei
     * feste Zeilen zu drei bestellt, und das ist auch ruhiger: Die Symbole
     * stehen untereinander, nicht versetzt.
     */
    <div className="grid grid-cols-3 justify-items-center gap-y-2 gap-x-1" role="group" aria-label="Schnellaktionen zu diesem Kunden">
      {/*
        Das Menue erscheint nur, solange ueberhaupt etwas darin steht.
        Seit dem 16.09.2026 hat jeder Vorgang sein eigenes Symbol, die Liste
        ist damit leer und der Knopf faellt weg. Ein Menue, das sich auf
        nichts oeffnet, ist schlimmer als keines. Der Zweig bleibt trotzdem
        stehen: Kommt spaeter ein Vorgang dazu, der zu selten ist fuer ein
        eigenes Symbol, hat er sofort wieder seinen Platz.
      */}
      {menueAktionen.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Symbolknopf
              farbe="btn-brand"
              icon={<Plus />}
              wort="Mehr"
              satz="Weitere Vorgänge, öffnet ein Menü"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {menueAktionen.map((a) => (
              <DropdownMenuItem key={a.art} onSelect={() => onAktion(a.art)} className="gap-2">
                {a.icon}
                <span>{a.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {SCHNELLZUGRIFF.map((art) => {
        const aktion = QUICK_ACTIONS.find((q) => q.art === art);
        const darstellung = SCHNELL_DARSTELLUNG[art];
        if (!aktion || !darstellung) return null;
        return (
          <Symbolknopf
            key={art}
            farbe={darstellung.farbe}
            icon={aktion.icon}
            wort={darstellung.wort}
            satz={darstellung.satz}
            onClick={() => onAktion(art)}
          />
        );
      })}
    </div>
  );
}
