import { useState, type ReactNode } from "react";
import { Star, Paperclip, UserPlus, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { colorForName } from "./chatFarbe";
import { einladbareTeilnehmer, ladeTeilnehmerEin } from "@/lib/chatEinladung";
import type { ChatData } from "@/lib/chatStore";

/**
 * Die rechte Seite der Chat-Kopfzeile: wer dabei ist, wer dazu darf, und was
 * im Chat liegt.
 *
 * Bis zum 19.09.2026 stand das ausschliesslich auf der Chatseite. Im
 * Kundenprofil unter Kommunikation fehlte es, und dort arbeitet man eigentlich
 * mit dem Kunden. Christian hat es genau dort vermisst.
 *
 * Sie steht als eigene Komponente da und nicht zweimal abgeschrieben. Eine
 * Teilnehmerleiste ist kein Schmuck: An ihr haengt, wer eingeladen werden
 * darf. Zwei Fassungen davon laufen auseinander, und dann laedt an einer
 * Stelle jemand Leute ein, die er an der anderen nicht einladen duerfte.
 *
 * Was NICHT hier steht: Anpinnen, Stummschalten, Archivieren, Loeschen und
 * Verlassen. Das sind Aktionen auf dem Chat als Ganzem, sie gehoeren auf die
 * Chatseite. Wer sie dort braucht, reicht sie ueber `zusatzMenue` herein.
 */

export interface ChatLeisteKennzahlen {
  dateien: number;
  markierte: number;
}

interface Props {
  chat: ChatData;
  kennzahlen: ChatLeisteKennzahlen;
  /** Die eigene Kennung, fuer die Einladeberechtigung. */
  myId: string;
  /** Die aktive Rolle (`user.role`), sie entscheidet, wen man einladen darf. */
  rolle: string;
  /** Kundenchats sind zu zweit und nehmen niemanden dazu. */
  einladenErlaubt: boolean;
  onDateien: () => void;
  onMarkierte: () => void;
  /** Nach einer Einladung, damit der Aufrufer neu laden kann. */
  onGeaendert?: () => void;
  /** Weitere Eintraege im Dreipunktmenue, siehe Kopfkommentar. */
  zusatzMenue?: ReactNode;
}

export function ChatTeilnehmerLeiste({
  chat, kennzahlen, myId, rolle, einladenErlaubt,
  onDateien, onMarkierte, onGeaendert, zusatzMenue,
}: Props) {
  const [dialogOffen, setDialogOffen] = useState(false);
  const [ausgewaehlt, setAusgewaehlt] = useState<string[]>([]);
  const [laeuft, setLaeuft] = useState(false);

  const istAdmin = rolle === "admin" || rolle === "inhaber";
  const einladbar = einladbareTeilnehmer(myId, rolle);
  const nochNichtDabei = einladbar.filter((m) => !chat.teilnehmer.some((t) => t.id === m.id));
  const kannEinladen = einladenErlaubt && (istAdmin || einladbar.length > 0);

  const einladen = async () => {
    if (ausgewaehlt.length === 0 || laeuft) return;
    setLaeuft(true);
    try {
      const anzahl = await ladeTeilnehmerEin(chat, ausgewaehlt, myId, rolle);
      toast.success(anzahl === 1 ? "Ein Teilnehmer hinzugefügt" : `${anzahl} Teilnehmer hinzugefügt`);
      setAusgewaehlt([]);
      setDialogOffen(false);
      onGeaendert?.();
    } catch (fehler) {
      // Kein stilles Scheitern: Wer jemanden einlaedt und nichts hoert, geht
      // davon aus, dass es geklappt hat.
      toast.error(fehler instanceof Error ? fehler.message : "Einladen fehlgeschlagen");
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      {/* Wer ist dabei. Ab dem fuenften nur noch als Zahl, sonst schiebt die
          Leiste bei grossen Chats alles andere aus dem Bild. */}
      <div className="flex -space-x-2">
        {chat.teilnehmer.slice(0, 4).map((t, i) => (
          <Tooltip key={`${t.id}-${i}`}>
            <TooltipTrigger asChild>
              <Avatar className="h-6 w-6 border-2 border-card cursor-pointer">
                {t.avatar ? <AvatarImage src={t.avatar} /> : null}
                <AvatarFallback className={`${colorForName(t.name)} text-white text-[9px]`}>{t.initials}</AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold text-xs">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.role}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {chat.teilnehmer.length > 4 && (
          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-[9px] border-2 border-card">
            +{chat.teilnehmer.length - 4}
          </div>
        )}
      </div>

      {kannEinladen && (
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          aria-label="Person hinzufügen" title="Teilnehmer hinzufügen"
          onClick={() => setDialogOffen(true)}
        >
          <UserPlus className="h-4 w-4" />
        </Button>
      )}

      {kennzahlen.markierte > 0 && (
        <Button
          variant="ghost" size="icon" className="h-8 w-8 relative"
          aria-label="Markierte Nachrichten" title="Markierte Nachrichten"
          onClick={onMarkierte}
        >
          <Star className="h-4 w-4 text-amber-500 fill-current" />
          <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-amber-500 text-white rounded-full px-1 leading-4 min-w-4 text-center">
            {kennzahlen.markierte}
          </span>
        </Button>
      )}

      {kennzahlen.dateien > 0 && (
        <Button
          variant="ghost" size="icon" className="h-8 w-8 relative"
          aria-label="Dateien in diesem Chat" title="Dateien in diesem Chat"
          onClick={onDateien}
        >
          <Paperclip className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 text-[9px] bg-primary text-primary-foreground rounded-full px-1 leading-4 min-w-4 text-center">
            {kennzahlen.dateien}
          </span>
        </Button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Weitere Aktionen" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onDateien}>
            <Paperclip className="h-4 w-4 mr-2" /> Dateien und Bilder ({kennzahlen.dateien})
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onMarkierte}>
            <Star className="h-4 w-4 mr-2" /> Markierte Nachrichten ({kennzahlen.markierte})
          </DropdownMenuItem>
          {zusatzMenue && <DropdownMenuSeparator />}
          {zusatzMenue}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOffen} onOpenChange={setDialogOffen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Teilnehmer einladen</DialogTitle>
            {!istAdmin && (
              <p className="text-xs text-muted-foreground pt-1">
                Als Vertriebspartner kannst du nur Teampartner aus deiner eigenen Downline einladen.
                Weitere Rollen fügt der Admin hinzu.
              </p>
            )}
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {nochNichtDabei.map((m) => (
              <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={ausgewaehlt.includes(m.id)}
                  onCheckedChange={(an) =>
                    setAusgewaehlt((bisher) => (an ? [...bisher, m.id] : bisher.filter((id) => id !== m.id)))
                  }
                />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={`${colorForName(m.name)} text-white text-[10px]`}>{m.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.role}</p>
                </div>
              </label>
            ))}
            {nochNichtDabei.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {istAdmin ? "Alle Nutzer sind bereits im Chat" : "Keine Teampartner aus deiner Downline verfügbar"}
              </p>
            )}
          </div>
          <Button onClick={einladen} disabled={ausgewaehlt.length === 0 || laeuft} className="w-full mt-2">
            {ausgewaehlt.length > 0 ? `${ausgewaehlt.length} Teilnehmer einladen` : "Teilnehmer auswählen"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
