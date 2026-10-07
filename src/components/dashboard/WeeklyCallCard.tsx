import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, CalendarPlus, ChevronDown, ChevronUp, Heart, MessageSquarePlus, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { wertDerWoche } from "@/lib/kulturContent";
import { useUser } from "@/contexts/UserContext";
import {
  CALL_DAUER_MINUTEN,
  CALL_ICAL_TAG,
  CALL_RUNDEN,
  CALL_SCHNITT_MINUTE,
  CALL_SCHNITT_STUNDE,
  CALL_WOCHENTAG,
  ZOOM_KENNCODE,
  ZOOM_MEETING_ID,
  ZOOM_URL,
  callRundenFuer,
  callZeitenText,
  type CallRunde,
} from "@/lib/weeklyCallZeit";

/**
 * Der nächste Termin eines Weekly Sales Call (Standard: 19:00, Lead-Berater).
 *
 * Am Calltag selbst bleibt der heutige Termin bis zum Wochenschnitt (20:30)
 * stehen. Erst danach springt die Karte auf die kommende Woche. Sonst würde
 * sie schon während des laufenden Calls den nächsten Termin anzeigen.
 */
export function naechsterWeeklyCall(jetzt: Date = new Date(), runde: CallRunde = "lead_berater"): Date {
  const { zeit } = CALL_RUNDEN[runde];
  const heute = new Date(jetzt);
  const abstand = (CALL_WOCHENTAG - heute.getDay() + 7) % 7;

  const termin = new Date(heute);
  termin.setDate(heute.getDate() + abstand);
  termin.setHours(zeit.stunde, zeit.minute, 0, 0);

  const schnitt = new Date(termin);
  schnitt.setHours(CALL_SCHNITT_STUNDE, CALL_SCHNITT_MINUTE, 0, 0);
  if (abstand === 0 && jetzt.getTime() > schnitt.getTime()) {
    termin.setDate(termin.getDate() + 7);
  }
  return termin;
}

/**
 * Der Call, um den es gerade geht, aus den Calls eines Nutzers.
 *
 * Bei einem Call ist das einfach dessen nächster Termin. Wer beide betreut
 * (Leitung), bekommt den ersten, der noch nicht vorbei ist: bis 20:00 Uhr den
 * 19:00-Call, danach den 19:30-Call. Nach beiden bleibt es bis zum
 * Wochenschnitt beim späteren.
 */
export function aktuellerWeeklyCall(
  runden: CallRunde[],
  jetzt: Date = new Date(),
): { runde: CallRunde; start: Date } | null {
  if (runden.length === 0) return null;
  const calls = runden
    .map((runde) => ({ runde, start: naechsterWeeklyCall(jetzt, runde) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const offen = calls.find((c) => c.start.getTime() + CALL_DAUER_MINUTEN * 60_000 > jetzt.getTime());
  return offen ?? calls[calls.length - 1];
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "läuft";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${minutes}m`;
  return `in ${minutes}m`;
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
}

/**
 * Die Zeitzone als VTIMEZONE-Block. Ohne sie stuende der Termin in UTC in der
 * Datei, und die wiederkehrende Serie rutschte nach der Zeitumstellung um eine
 * Stunde (19:00 wurde 18:00).
 */
const ICS_ZEITZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/**
 * Die Kalenderdatei: ein Eintrag je Call, wöchentlich wiederkehrend, mit den
 * Zoom-Einwahldaten. Beginn und Ende stehen als deutsche Ortszeit
 * (TZID=Europe/Berlin), nicht als UTC.
 */
export function weeklyCallIcs(runden: CallRunde[], jetzt: Date = new Date()): string {
  const zwei = (n: number) => String(n).padStart(2, "0");
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const desc = `Zoom-Link: ${ZOOM_URL}\\nMeeting-ID: ${ZOOM_MEETING_ID}\\nKenncode: ${ZOOM_KENNCODE}`;
  const events = runden.flatMap((runde) => {
    const tag = naechsterWeeklyCall(jetzt, runde);
    const { zeit, gruppe } = CALL_RUNDEN[runde];
    const datum = `${tag.getFullYear()}${zwei(tag.getMonth() + 1)}${zwei(tag.getDate())}`;
    const endeMinuten = zeit.stunde * 60 + zeit.minute + CALL_DAUER_MINUTEN;
    const titel = `Weekly Sales Call ${gruppe}`;
    return [
      "BEGIN:VEVENT",
      `UID:weekly-sales-call-${runde}-${datum}@os-immobilien.com`,
      `DTSTAMP:${utc(new Date())}`,
      `DTSTART;TZID=Europe/Berlin:${datum}T${zwei(zeit.stunde)}${zwei(zeit.minute)}00`,
      `DTEND;TZID=Europe/Berlin:${datum}T${zwei(Math.floor(endeMinuten / 60))}${zwei(endeMinuten % 60)}00`,
      `SUMMARY:${titel}`,
      `DESCRIPTION:${desc}`,
      `LOCATION:${ZOOM_URL}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${CALL_ICAL_TAG}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${titel} startet in 1 Stunde`,
      "TRIGGER:-PT1H",
      "END:VALARM",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${titel} startet in 5 Minuten`,
      "TRIGGER:-PT5M",
      "END:VALARM",
      "END:VEVENT",
    ];
  });
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OS Immobilien//Weekly Sales Call//DE",
    ...ICS_ZEITZONE,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(runden: CallRunde[], jetzt: Date = new Date()) {
  const ics = weeklyCallIcs(runden, jetzt);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "weekly-sales-call.ics";
  a.click();
  URL.revokeObjectURL(url);
}

export function WeeklyCallCard() {
  const { user } = useUser();
  const [, force] = useState(0);
  const [showZoom, setShowZoom] = useState(false);

  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  // Leitung sieht beide Calls, Lead-Berater nur 19:00, Vertriebspartner nur 19:30.
  const runden = callRundenFuer(user.role, user.rollenVariante);
  const now = new Date();
  const call = aktuellerWeeklyCall(runden, now);
  if (!call) return null;
  const start = call.start;
  const msUntil = start.getTime() - now.getTime();
  const canJoin = msUntil <= 10 * 60 * 1000 && msUntil >= -90 * 60 * 1000;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-[13px] font-medium text-muted-foreground tracking-wide uppercase">
            Weekly Sales Call
          </CardTitle>
          <p className="text-[15px] font-semibold mt-1">{formatDateLong(start)}{"\u00a0"}<br />{/* Jeder Call in einer eigenen Zeile (05.10.2026). */}{runden.map((runde, index) => <span key={runde}>{index > 0 && <br />}{callZeitenText(runden.length > 1 ? [runde] : runden)}{runden.length > 1 && ` ${CALL_RUNDEN[runde].gruppe}`}</span>)}</p>
        </div>
        <Badge variant={canJoin ? "default" : "secondary"} className="shrink-0">
          {canJoin && msUntil <= 0 ? "läuft jetzt" : formatCountdown(msUntil)}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          {"\u00a0"}Team-Call: Wochenplanung, offene Punkte, Trainings- und Schulungseinheiten.
        </p>

        {/* Wert der Woche aus dem Kultur-Modul: vier Werte, vier Wochen, dann
            von vorn. Gibt dem Call ein wiederkehrendes Thema ohne Zusatzaufwand. */}
        <Link
          to="/kultur"
          className="block rounded-md border border-primary/20 bg-primary/5 p-3 hover:border-primary/40 transition-colors"
        >
          <p className="text-[10px] uppercase tracking-wide font-semibold text-primary flex items-center gap-1.5">
            <Heart className="h-3 w-3" /> Wert der Woche
          </p>
          <p className="text-sm font-semibold mt-1">{wertDerWoche().titel}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{wertDerWoche().text}</p>
        </Link>

        {/*
          Nur ein Knopf, nicht die ganze Liste.

          Eingabe, Punkte und die Rueckschau auf frueher Calls brauchen Platz.
          In der schmalen Dashboard-Karte war das gedraengt, und die Karte soll
          auf einen Blick lesbar bleiben.
        */}
        <Link
          to="/weekly-call"
          className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/50"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <MessageSquarePlus className="h-4 w-4 text-primary" />
            Punkte für den Call
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Link>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={canJoin ? "default" : "outline"}
            onClick={() => window.open(ZOOM_URL, "_blank", "noopener")}
            title={canJoin ? "Zoom öffnen" : "Aktiv ab 10 Min vor Call-Beginn"}
          >
            <Video className="h-4 w-4 mr-1.5" /> Jetzt einwählen
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadIcs(runden)}>
            <CalendarPlus className="h-4 w-4 mr-1.5" /> In Kalender eintragen
          </Button>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowZoom((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            {showZoom ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Zoom-Einwahldaten
          </button>
          {showZoom && (
            <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
              <div className="truncate">
                Link:{" "}
                <a href={ZOOM_URL} target="_blank" rel="noreferrer" className="underline">
                  {ZOOM_URL}
                </a>
              </div>
              <div>
                Meeting-ID: <span className="font-mono">{ZOOM_MEETING_ID}</span>
              </div>
              <div>
                Kenncode: <span className="font-mono">{ZOOM_KENNCODE}</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}