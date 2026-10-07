/**
 * „Aus dem Kennenlernbogen": alle Antworten des Bewerbers, an einer Stelle.
 *
 * Dieselbe Übersicht steht an drei Orten: im Reiter Videocall über dem
 * Gespräch, aufklappbar in der Moderation und im Reiter Closing. Vorher zeigte
 * jede Stelle einen anderen Ausschnitt, und keine zeigte alles: Erreichbarkeit
 * und die beiden Verständnisfragen erschienen nirgends, obwohl der Bewerber
 * sie beantwortet hat.
 *
 * Die Gruppierung kommt aus `vollstaendigerUeberblick` und geht über die
 * Ansichten dieses Bewerbers. Eine Frage, die im Bogen dazukommt, steht damit
 * ohne weiteres Zutun auch hier.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  gespraechsDauerMinuten,
  themenLabels,
  type KennenlernenAntworten,
} from "@/lib/bewerberKennenlernen";
import { vollstaendigerUeberblick, type KennenlernBefund } from "@/lib/bewerberVideocall";

/** Die Antworten in ihren drei Gruppen, ohne Rahmen und ohne Überschrift. */
export function KennenlernbogenUebersicht({
  antworten,
}: {
  antworten: KennenlernenAntworten;
}) {
  const gruppen = vollstaendigerUeberblick(antworten);
  if (gruppen.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Der Bogen liegt vor, enthält aber keine ausgefüllte Antwort.
      </p>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {gruppen.map((g) => (
        <div key={g.titel}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {g.titel}
          </p>
          <dl className="mt-1.5 space-y-1">
            {g.zeilen.map((z) => (
              <div key={z.label} className="flex flex-wrap gap-x-2 text-xs">
                <dt className="text-muted-foreground">{z.label}:</dt>
                <dd className="font-medium">{z.wert}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** Seine Tagesordnung und seine eigene Frage, im Wortlaut. */
export function KennenlernbogenTagesordnung({
  antworten,
}: {
  antworten: KennenlernenAntworten;
}) {
  const themen = themenLabels(antworten);
  const frage = typeof antworten.eigeneFrage === "string" ? antworten.eigeneFrage.trim() : "";
  if (themen.length === 0 && !frage) return null;
  return (
    <div className="space-y-1.5 border-t pt-3">
      {themen.length > 0 && (
        <p className="text-xs">
          <span className="font-medium">Seine Tagesordnung: </span>
          <span className="text-muted-foreground">{themen.join(", ")}</span>
        </p>
      )}
      {frage && (
        <p className="text-xs">
          <span className="font-medium">Seine eigene Frage: </span>
          <span className="italic">„{frage}“</span>
        </p>
      )}
    </div>
  );
}

/**
 * Die Karte samt Überschrift. `aufklappbar` lässt sie zugeklappt beginnen, so
 * wie es die Moderation braucht: Dort ist die Übersicht ein Nachschlagewerk
 * und nicht der Hauptinhalt.
 */
export function KennenlernbogenKarte({
  antworten,
  ausgefuelltAm,
  aufklappbar = false,
  offenZuBeginn = true,
  befund,
}: {
  antworten: KennenlernenAntworten | null;
  /** Wann der Bogen eingereicht wurde, für das Kennzeichen im Kopf. */
  ausgefuelltAm?: string;
  aufklappbar?: boolean;
  offenZuBeginn?: boolean;
  /**
   * Warum kein Bogen vorliegt, aus `kennenlernBefund`. Ohne ihn bleibt es bei
   * der allgemeinen Auskunft, mit ihm steht da, woran es liegt und was zu tun
   * ist.
   */
  befund?: KennenlernBefund;
}) {
  const [offen, setOffen] = useState(offenZuBeginn);

  if (!antworten) {
    return (
      <Card className="p-4" data-testid="kennenlernbogen-fehlt">
        <p className="text-sm font-semibold">
          {befund && befund.titel ? befund.titel : "Aus dem Kennenlernbogen"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {befund && befund.text
            ? befund.text
            : "Es liegt kein eingereichter Bogen vor. Ohne ihn lassen sich weder die Dauer noch die " +
              "Module dieses Termins bestimmen."}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {befund && befund.zuTun
            ? befund.zuTun
            : "Zu tun: in der Übersicht die Karte Kennenlernen öffnen und die Einladung verschicken."}
        </p>
      </Card>
    );
  }

  const inhalt = (
    <>
      <KennenlernbogenUebersicht antworten={antworten} />
      <KennenlernbogenTagesordnung antworten={antworten} />
    </>
  );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold">Aus dem Kennenlernbogen</p>
          <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">
            {gespraechsDauerMinuten(antworten)} Minuten
          </Badge>
          {ausgefuelltAm && (
            <Badge variant="outline" className="h-5 text-[10px] font-normal text-muted-foreground">
              ausgefüllt am {ausgefuelltAm}
            </Badge>
          )}
        </div>
        {aufklappbar && (
          <button
            type="button"
            onClick={() => setOffen((o) => !o)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {offen ? "Zuklappen" : "Alle Antworten"}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${offen ? "rotate-180" : ""}`} aria-hidden />
          </button>
        )}
      </div>
      {(!aufklappbar || offen) && inhalt}
    </Card>
  );
}
