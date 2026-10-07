import { Filter } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Ein Filter kann mehrere Arten umfassen. Die Kachel "Anrufe und Termine" auf
 * dem Dashboard fasst genau diese drei zusammen und braucht hier ein Gegenstück,
 * sonst führt der Klick auf eine Liste, die weniger zeigt als die Zahl versprach.
 */
export const FILTER_MAP: Record<string, string[] | null> = {
  Alle: null,
  "Follow-Ups": ["follow_up"],
  Aufgaben: ["aufgabe"],
  "Anrufe & Termine": ["anruf", "meeting", "deadline"],
  Anrufe: ["anruf"],
  Meetings: ["meeting"],
  Deadlines: ["deadline"],
};

/** Die Reihenfolge im Menü ist die Reihenfolge der Einträge oben. */
export const FILTER_NAMEN = Object.keys(FILTER_MAP);

/** Übersetzt den Parameter aus dem Dashboard in den Namen des Filters. */
export const ART_ZU_FILTER: Record<string, string> = {
  follow_up: "Follow-Ups",
  aufgabe: "Aufgaben",
  termine: "Anrufe & Termine",
  anruf: "Anrufe",
  meeting: "Meetings",
  deadline: "Deadlines",
};

type Props = {
  wert: string;
  onWert: (wert: string) => void;
};

/**
 * Die Filter lagen früher als sieben Knöpfe nebeneinander in der Zeile. Das war
 * die breiteste Stelle der Seite und lief bei schmalem Fenster in eine zweite
 * und dritte Reihe. Als Auswahlmenü belegt dieselbe Auswahl eine Feldbreite,
 * und der gewählte Filter steht am geschlossenen Feld, ohne es zu öffnen.
 */
export function InboxFilterAuswahl({ wert, onWert }: Props) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Filter className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Select value={wert} onValueChange={onWert}>
        <SelectTrigger className="h-9 w-[200px] shrink-0" aria-label="Filter">
          <SelectValue placeholder="Filter wählen" />
        </SelectTrigger>
        <SelectContent>
          {FILTER_NAMEN.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
