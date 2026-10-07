import { Clock, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ABLAUF_STATIONEN,
  ABLAUF_GESAMTDAUER,
  ABLAUF_GRUNDREGEL,
  ABLAUF_ORIENTIERUNG,
  ablaufStufenLabel,
} from "@/lib/ablaufplan";

/**
 * Vertikale Zeitleiste des Ablaufplans: acht Stationen von Neuer Lead bis
 * Provisionszahlung, jede mit Zeitnote und den zugeordneten Pipelinestufen.
 *
 * Die Stationen erscheinen nacheinander mit einer kurzen Einblendung. Bei
 * prefers-reduced-motion entfaellt die Animation vollstaendig.
 */
export function AblaufplanZeitleiste() {
  return (
    <div className="relative">
      <style>{`
        @keyframes ablauf-station-ein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ablauf-station {
          animation: ablauf-station-ein 0.5s ease-out both;
        }
        @media (prefers-reduced-motion: reduce) {
          .ablauf-station { animation: none; }
        }
      `}</style>

      {/* Wo alles zu finden ist. Ohne diese Einordnung beginnt der Plan mitten
          im Ablauf, und wer das CRM zum ersten Mal oeffnet, sucht die Knoepfe. */}
      <Card className="mb-4 p-4">
        <p className="text-sm font-semibold mb-2">{ABLAUF_ORIENTIERUNG.titel}</p>
        <ul className="space-y-1.5">
          {ABLAUF_ORIENTIERUNG.saetze.map((satz, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="text-muted-foreground/50 shrink-0">·</span>
              <span>{satz}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Die Regel gilt an jeder Station und steht deshalb einmal davor,
          statt achtmal darin. */}
      <Card className="mb-4 p-4 border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent">
        <p className="text-sm font-semibold mb-2">{ABLAUF_GRUNDREGEL.titel}</p>
        <ul className="space-y-1.5">
          {ABLAUF_GRUNDREGEL.saetze.map((satz, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="text-amber-600 shrink-0">·</span>
              <span>{satz}</span>
            </li>
          ))}
        </ul>
      </Card>

      <ol className="relative space-y-4 pl-0 list-none">
        {ABLAUF_STATIONEN.map((station, i) => {
          const istLetzte = i === ABLAUF_STATIONEN.length - 1;
          return (
            <li
              key={station.id}
              className="ablauf-station relative flex gap-4"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {/* Nummernkreis mit Verbindungslinie */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold border-2",
                    istLetzte
                      ? "bg-emerald-500/10 border-emerald-500 text-emerald-600"
                      : "bg-primary/10 border-primary text-primary",
                  )}
                >
                  {i + 1}
                </div>
                {!istLetzte && (
                  <div className="w-px flex-1 bg-border mt-1" aria-hidden />
                )}
              </div>

              {/* Inhalt der Station */}
              <Card className="flex-1 p-4 mb-1">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-base font-semibold leading-snug">
                    {station.titel}
                  </h3>
                  {station.zeit && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-semibold shrink-0">
                      <Clock className="h-4 w-4" />
                      {station.zeit}
                    </span>
                  )}
                </div>
                {station.zeitZusatz && (
                  <p className="mt-0.5 text-xs text-primary/80 font-medium">
                    {station.zeitZusatz}
                  </p>
                )}
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {station.beschreibung}
                </p>
                {station.imCrm && station.imCrm.length > 0 && (
                  <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="text-[10px] uppercase tracking-wide font-semibold text-primary mb-1.5">
                      So machst du das im CRM
                    </p>
                    <ul className="space-y-1.5">
                      {station.imCrm.map((satz, k) => (
                        <li key={k} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-primary/60 shrink-0">·</span>
                          <span>{satz}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    Pipelinestufen:
                  </span>
                  {station.stufen.map((key) => (
                    <Badge key={key} variant="outline" className="text-[10px]">
                      {ablaufStufenLabel(key)}
                    </Badge>
                  ))}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {/* Gesamtdauer */}
      <Card className="mt-4 p-4 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 shrink-0">
            <Award className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Gesamtdauer im Blick</div>
            <p className="text-sm text-muted-foreground mt-1">
              {ABLAUF_GESAMTDAUER}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
