import { useEffect, useState } from "react";
import { Mail, MailCheck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TERMIN_ZEITZONE } from "@/lib/bewerberTermine";
import {
  OEFFNUNG_UNSICHER,
  ladeMailOeffnungen,
  mailName,
  oeffnungAus,
  type MailOeffnung,
} from "@/lib/bewerberMailTracking";

/**
 * Das Briefsymbol mit den zwei Zuständen, für eine einzelne Akte.
 *
 * Dieselbe Aussage wie `KennenlernMailVermerk` in der Liste, nur für genau
 * eine Mail eines Bewerbers: grau heißt „hinausgegangen, Link bisher nicht
 * aufgerufen", grün mit Haken heißt „der Link aus der Mail wurde aufgerufen".
 * Seit dem 26.09.2026 gibt es kein Zählpixel mehr, siehe
 * `bewerberMailTracking.ts`. Die
 * Unterscheidung liegt in der Form des Umschlags und zusätzlich im Text
 * daneben, nicht allein in der Farbe. Eine Vorlesehilfe bekommt denselben Satz
 * über `aria-label`.
 *
 * Vor dem Versand steht hier nichts. Ein Symbol für „noch nichts verschickt"
 * wäre eine dritte Aussage an einer Stelle, die das ohnehin schon sagt.
 */
export function MailOeffnungBadge({
  bewerberId,
  kind,
  gesendetAm,
  neuLaden,
}: {
  bewerberId: string;
  /** Welche Mail gemeint ist, aus `bewerberMailTracking.ts`. */
  kind: string;
  /**
   * Wann die Mail hinausging, ISO. Leer heißt: noch keine, dann zeigt die
   * Komponente nichts.
   */
  gesendetAm?: string | null;
  /** Zähler, der ein Nachladen auslöst. Nach einem Versand hochzählen. */
  neuLaden?: number;
}) {
  const [oeffnung, setOeffnung] = useState<MailOeffnung | null>(null);

  useEffect(() => {
    let abgebrochen = false;
    if (!bewerberId || !gesendetAm) {
      setOeffnung(null);
      return;
    }
    void (async () => {
      const zeilen = await ladeMailOeffnungen([bewerberId], [kind]);
      if (!abgebrochen) setOeffnung(oeffnungAus(zeilen[bewerberId]));
    })();
    return () => {
      abgebrochen = true;
    };
  }, [bewerberId, kind, gesendetAm, neuLaden]);

  if (!gesendetAm) return null;

  const zeitpunkt = (iso?: string) => {
    const d = new Date(iso || "");
    if (Number.isNaN(d.getTime())) return "";
    const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
    const zeit = d.toLocaleTimeString("de-DE", {
      timeZone: TERMIN_ZEITZONE,
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${tag} um ${zeit} Uhr`;
  };

  const geoeffnet = !!oeffnung && oeffnung.geoeffnet > 0;
  /* Aus dem ausgefüllten Bogen abgeleitet statt gemessen, siehe
     `KennenlernMailVermerk`. */
  const ausBogen = geoeffnet && oeffnung?.quelle === "bogen";
  const Zeichen = geoeffnet ? MailCheck : Mail;
  const text = ausBogen
    ? "Bogen ist ausgefüllt"
    : geoeffnet
      ? "Link geöffnet"
      : "Link noch nicht geöffnet";
  const kurz = ausBogen
    ? `${mailName(kind)}: Bogen ausgefüllt am ${zeitpunkt(oeffnung?.geoeffnetAm)}`
    : geoeffnet
      ? `${mailName(kind)}: Link geöffnet am ${zeitpunkt(oeffnung?.geoeffnetAm)}`
      : `${mailName(kind)}: Link noch nicht geöffnet`;

  /*
   * Der eigene `TooltipProvider` ist Absicht.
   *
   * In der Anwendung steht einer um alles herum (`App.tsx`), und ein zweiter
   * darin stört Radix nicht. Ohne ihn hinge diese Anzeige aber daran, dass
   * jede Karte, die sie einbaut, selbst einen mitbringt; die Kennenlernen-Karte
   * tut das in ihren Tests nicht, und die Anzeige riss sie sofort mit. Eine
   * Nebenanzeige darf ihren Wirt nicht zerlegen.
   */
  return (
    <TooltipProvider>
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          aria-label={kurz}
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] leading-none ${
            /* emerald statt --success, siehe die Begruendung zum Kontrast in
               KennenlernMailVermerk.tsx. */
            geoeffnet
              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
              : "border-border text-muted-foreground"
          }`}
        >
          <Zeichen className="h-3 w-3 shrink-0" aria-hidden="true" />
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs leading-snug" style={{ maxWidth: 300 }}>
        <p className="font-medium">{mailName(kind)}</p>
        <p className="mt-0.5 text-muted-foreground">
          Hinausgegangen am {zeitpunkt(gesendetAm)}.
        </p>
        <p className="mt-1.5 font-medium">{text}</p>
        <p className="mt-0.5 text-muted-foreground">
          {ausBogen
            ? `Der Bogen wurde am ${zeitpunkt(oeffnung?.geoeffnetAm)} abgeschickt. Sein Link steht nur in unseren Mails, der Bewerber hat ihn also aufgerufen.`
            : geoeffnet
              ? `Zuletzt am ${zeitpunkt(oeffnung?.geoeffnetAm)}.` +
                (oeffnung && oeffnung.gesendet > 1
                  ? ` Bei ${oeffnung.geoeffnet} von ${oeffnung.gesendet} Mails wurde der Link aufgerufen.`
                  : "")
              : "Der Link aus der Mail wurde bisher nicht aufgerufen. Ob die Mail gelesen wurde, wissen wir nicht."}
        </p>
        {/* Der Hinweis gilt der Zählung, nicht dem abgeleiteten Vermerk. */}
        {!ausBogen && <p className="mt-1.5 text-muted-foreground">{OEFFNUNG_UNSICHER}</p>}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
