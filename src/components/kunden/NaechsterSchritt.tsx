import { CalendarClock, Video, ListChecks, RotateCcw } from "lucide-react";
import { kontaktQuellen } from "@/lib/kontaktTermine";
import { naechsterKontakt, type KontaktQuelle } from "@/lib/naechsterKontakt";
import type { KundeData } from "@/lib/kundenStore";

/**
 * Der naechste geplante Schritt, klein unter dem Namen.
 *
 * In der Uebersicht "Alle Kontakte" stand bisher nur die Wartezeit. Eine
 * Aufgabe oder ein Termin in der Zukunft war von dort aus nicht zu erkennen:
 * Man sah einen Kontakt, bei dem scheinbar nichts ansteht, und musste ihn
 * oeffnen, um zu merken, dass naechste Woche etwas geplant ist.
 *
 * Die Quelle ist dieselbe wie bei der Ampel (`kontaktQuellen` und
 * `naechsterKontakt`), damit Liste und Kachel nie Verschiedenes behaupten.
 */

const SYMBOL: Record<KontaktQuelle, typeof CalendarClock> = {
  aufgabe: ListChecks,
  follow_up: RotateCcw,
  termin: CalendarClock,
  videotermin: Video,
  wartephase: RotateCcw,
};

/** Kurz und ohne Jahr, wenn es dieses Jahr ist. Die Liste ist eng. */
function zeitpunktKurz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  const zeit = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (gleicherTag) return `heute ${zeit}`;

  const morgen = new Date(heute);
  morgen.setDate(morgen.getDate() + 1);
  if (d.toDateString() === morgen.toDateString()) return `morgen ${zeit}`;

  const datum = d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    ...(d.getFullYear() === heute.getFullYear() ? {} : { year: "2-digit" }),
  });
  return `${datum}, ${zeit}`;
}

export function NaechsterSchritt({
  kunde,
  className = "",
}: {
  kunde: KundeData;
  className?: string;
}) {
  const naechster = naechsterKontakt(kontaktQuellen(kunde));
  // Die Wartezeit steht in dieser Uebersicht bereits an der Telefonnummer.
  // Sie hier zu wiederholen, machte die Zeile nur voll.
  if (!naechster || naechster.ueberfaellig || naechster.quelle === "wartephase") return null;

  const Symbol = SYMBOL[naechster.quelle] ?? CalendarClock;
  const titel = naechster.titel?.trim();

  return (
    <span
      // Die Bezeichnung kommt bei Meetings aus dem Freitext der Aktivitaet und
      // kann lang sein. Ohne Deckel zoege sie die ganze Spalte auseinander.
      className={`flex items-center gap-0.5 max-w-[200px] text-[10px] font-normal text-primary ${className}`}
      title={titel ? `${naechster.bezeichnung}: ${titel}` : naechster.bezeichnung}
    >
      <Symbol className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate min-w-0">
        {naechster.bezeichnung} {zeitpunktKurz(naechster.zeitpunkt)}
      </span>
    </span>
  );
}
